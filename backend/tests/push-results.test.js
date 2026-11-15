// Gönderim sonuçları: alıcılar kayda yazılır; alıcılardan bildirimden sonraki 24 / 72 saatte sipariş verenler sayılır.
import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { getBroadcastResultsBatch } from "../controllers/notification.controller.js";
import {
  RECIPIENT_CAP, broadcastStatus, getBroadcastResults, sendOutcomeFields, summarizeBroadcastResults, toBroadcastView,
} from "../services/pushBroadcast.service.js";

const HOUR = 60 * 60 * 1000;
const SENT = new Date("2026-03-10T12:00:00Z");
const after = (hours) => new Date(SENT.getTime() + hours * HOUR);
const oid = (n) => `65e0000000000000000${String(n).padStart(5, "0")}`;
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const query = (value) => { const q = { select: () => q, sort: () => q, limit: () => q, maxTimeMS: () => q, lean: async () => value }; return q; };
const ok = { targeted: 3, sent: true, reason: null, detail: "", unreachable: 1 };

test("a successful real send stores its recipients; failures, tests and oversized sends do not", () => {
  const sent = sendOutcomeFields(ok, [oid(1), oid(2), oid(3)], SENT);
  assert.deepEqual(sent, { targetedCount: 3, sent: true, failureReason: null, unreachableCount: 1, status: "sent", sentAt: SENT, recipients: [oid(1), oid(2), oid(3)], resultsAvailable: true });
  const failed = sendOutcomeFields({ targeted: 3, sent: false, reason: "network", unreachable: 0 }, [oid(1)], SENT);
  assert.equal(failed.status, "failed");
  assert.equal(failed.failureReason, "network");
  assert.deepEqual(failed.recipients, []);
  assert.equal(failed.resultsAvailable, false);
  // İzinli kimse yok (reason null): yine başarısız sayılır, nedeni "unknown"
  assert.equal(sendOutcomeFields({ targeted: 0, sent: false, reason: null }, [], SENT).failureReason, "unknown");
  const trial = sendOutcomeFields(ok, [oid(1)], SENT, { test: true });
  assert.equal("recipients" in trial, false);
  assert.equal("resultsAvailable" in trial, false);
  // Sınırın üstünde alıcı saklanmaz, sonuç ölçülemez olarak işaretlenir
  const many = Array.from({ length: RECIPIENT_CAP + 1 }, (_, index) => `u${index}`);
  const big = sendOutcomeFields({ ...ok, targeted: many.length }, many, SENT);
  assert.deepEqual(big.recipients, []);
  assert.equal(big.resultsAvailable, false);
  assert.equal(sendOutcomeFields({ ...ok, targeted: RECIPIENT_CAP }, many.slice(1), SENT).resultsAvailable, true);
});

test("the recipient list is hidden by default and old records read as sent / failed", () => {
  assert.equal(PushBroadcast.schema.path("recipients").options.select, false);
  assert.equal(broadcastStatus({ sent: true }), "sent");
  assert.equal(broadcastStatus({ sent: false }), "failed");
  assert.equal(broadcastStatus({ sent: false, status: "scheduled" }), "scheduled");
  const view = toBroadcastView({ _id: oid(1), title: "Eski", body: "Kayıt", audience: "all", sent: true, route: "/cart", recipients: [oid(2)] });
  assert.equal(view.status, "sent");
  assert.equal(view.zone, "");
  assert.equal(view.target, "cart");
  assert.equal(view.sentAt, null);
  assert.equal("recipients" in view, false);
  assert.equal(toBroadcastView({ route: "/silinmis-ekran", zone: "eski" }).target, "home");
  assert.equal(toBroadcastView({ zone: "eski" }).zone, "");
});

test("results count only recipients' orders placed after the send, within 24 and 72 hours", () => {
  const broadcast = { sentAt: SENT, recipients: [oid(1), oid(2), oid(3)] };
  const orders = [
    { user: oid(1), createdAt: after(1), productTotal: 100, totalAmount: 120 },
    { user: oid(1), createdAt: after(20), productTotal: 50.5, totalAmount: 60 },
    { user: oid(2), createdAt: after(30), totalAmount: 80 }, // eski sipariş: productTotal yok
    { user: oid(2), createdAt: after(73), productTotal: 999 }, // pencerenin dışında
    { user: oid(3), createdAt: after(-1), productTotal: 999 }, // bildirimden önce
    { user: oid(9), createdAt: after(2), productTotal: 999 }, // alıcı değil
    { user: oid(3), createdAt: after(24), productTotal: 0, totalAmount: 15 }, // tam 24. saat dahil; 0 TL ürün tutarı korunur
  ];
  assert.deepEqual(summarizeBroadcastResults(broadcast, orders, after(100)), {
    orders24: 3, buyers24: 2, revenue24: 150.5, orders72: 4, buyers72: 3, revenue72: 230.5, done24: true, done72: true,
  });
  assert.equal(summarizeBroadcastResults(broadcast, orders, after(10)).done24, false);
  const mid = summarizeBroadcastResults(broadcast, orders, after(30));
  assert.equal(mid.done24, true);
  assert.equal(mid.done72, false);
  // Eski kayıt: sentAt yoksa createdAt kullanılır
  assert.equal(summarizeBroadcastResults({ createdAt: SENT, recipients: [oid(1)] }, orders, after(100)).orders72, 2);
  assert.deepEqual(summarizeBroadcastResults(broadcast, [], after(1)), { orders24: 0, buyers24: 0, revenue24: 0, orders72: 0, buyers72: 0, revenue72: 0, done24: false, done72: false });
});

test("batch results: one bounded order query, final numbers are stored once and then served from the record", async (t) => {
  const docs = [
    { _id: oid(1), audience: "all", sent: true, sentAt: after(-100), resultsAvailable: true, recipients: [oid(11), oid(12)] }, // 72 saat doldu
    { _id: oid(2), audience: "custom", sent: true, sentAt: after(-10), resultsAvailable: true, recipients: [oid(12), oid(13)] }, // ölçülüyor
    { _id: oid(3), audience: "all", sent: true, createdAt: after(-900) }, // eski kayıt: alıcı yok
    { _id: oid(4), audience: "all", sent: true, sentAt: after(-200), resultsAvailable: true, results: { final: true, orders24: 4, buyers24: 3, revenue24: 400, orders72: 9, buyers72: 6, revenue72: 900 } },
    { _id: oid(5), audience: "self", sent: true, sentAt: after(-1) }, // deneme
    { _id: oid(6), audience: "all", sent: false, status: "failed" },
    { _id: oid(7), audience: "all", sent: true, sentAt: after(-5), resultsAvailable: true, recipients: [] },
  ];
  const selects = [];
  t.mock.method(PushBroadcast, "find", (filter) => {
    const q = query(null);
    q.select = (fields) => { selects.push(fields); return q; };
    q.lean = async () => docs.filter((doc) => filter._id.$in.map(String).includes(String(doc._id))).map((doc) => (selects.at(-1).includes("+recipients") ? { ...doc } : { ...doc, recipients: undefined }));
    return q;
  });
  const orderQueries = [];
  let limit; let maxTime;
  t.mock.method(Order, "find", (filter) => {
    orderQueries.push(filter);
    const q = query([
      { user: oid(11), createdAt: after(-99), productTotal: 200 },
      { user: oid(12), createdAt: after(-40), productTotal: 70 },
      { user: oid(12), createdAt: after(-2), productTotal: 30 },
    ]);
    q.limit = (n) => { limit = n; return q; };
    q.maxTimeMS = (n) => { maxTime = n; return q; };
    return q;
  });
  const stored = [];
  t.mock.method(PushBroadcast, "updateOne", async (filter, update) => { stored.push([filter, update]); return {}; });

  const results = await getBroadcastResults(docs.map((doc) => doc._id), { now: SENT });
  assert.deepEqual(Object.keys(results).sort(), [oid(1), oid(2), oid(3), oid(4), oid(7)]);
  assert.deepEqual(results[oid(1)], { state: "final", orders24: 1, buyers24: 1, revenue24: 200, orders72: 2, buyers72: 2, revenue72: 270, done24: true, done72: true });
  assert.deepEqual(results[oid(2)], { state: "measuring", orders24: 1, buyers24: 1, revenue24: 30, orders72: 1, buyers72: 1, revenue72: 30, done24: false, done72: false });
  assert.deepEqual(results[oid(3)], { state: "unavailable" });
  assert.deepEqual(results[oid(7)], { state: "unavailable" });
  assert.deepEqual(results[oid(4)], { state: "final", done24: true, done72: true, orders24: 4, buyers24: 3, revenue24: 400, orders72: 9, buyers72: 6, revenue72: 900 });
  // Tek sipariş sorgusu: iptal edilmemiş, alıcıların birleşimi, ilk gönderimden şimdiye kadar; süre ve satır sınırı var
  assert.equal(orderQueries.length, 1);
  assert.deepEqual(orderQueries[0].status, { $ne: "İptal Edildi" });
  assert.deepEqual(orderQueries[0].user.$in.map(String).sort(), [oid(11), oid(12), oid(13)]);
  assert.equal(orderQueries[0].createdAt.$gte.getTime(), after(-100).getTime());
  assert.equal(orderQueries[0].createdAt.$lte.getTime(), SENT.getTime());
  assert.ok(limit > 0 && maxTime > 0);
  // Alıcı listesi yalnızca hesaplanacak kayıtlar için okunur
  assert.equal(selects.filter((fields) => fields.includes("+recipients")).length, 1);
  // Yalnızca kesinleşen (72 saat dolan) sonuç kayda yazılır
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0][0], { _id: oid(1), "results.final": { $ne: true } });
  assert.equal(stored[0][1].$set.results.final, true);
  assert.equal(stored[0][1].$set.results.orders72, 2);
  assert.equal(stored[0][1].$set.results.revenue72, 270);

  // Kesinleşmiş kayıtlar için sipariş sorgusu çalışmaz
  const again = await getBroadcastResults([oid(4), oid(3)], { now: SENT });
  assert.equal(orderQueries.length, 1);
  assert.equal(again[oid(4)].orders72, 9);
  assert.deepEqual(await getBroadcastResults([], { now: SENT }), {});
});

test("too many orders in the window: no numbers rather than wrong numbers", async (t) => {
  t.mock.method(PushBroadcast, "find", () => query([{ _id: oid(1), audience: "all", sent: true, sentAt: after(-100), resultsAvailable: true, recipients: [oid(11)] }]));
  t.mock.method(Order, "find", () => query(Array.from({ length: 20001 }, () => ({ user: oid(11), createdAt: after(-99), productTotal: 1 }))));
  const stored = t.mock.method(PushBroadcast, "updateOne", async () => ({}));
  assert.deepEqual(await getBroadcastResults([oid(1)], { now: SENT }), { [oid(1)]: { state: "unavailable" } });
  assert.equal(stored.mock.callCount(), 0);
});

test("results endpoint accepts up to 20 valid ids", async (t) => {
  const find = t.mock.method(PushBroadcast, "find", () => query([]));
  let res = response(); await getBroadcastResultsBatch({ query: {} }, res);
  assert.deepEqual(res.body, { success: true, results: {} });
  res = response(); await getBroadcastResultsBatch({ query: { ids: "abc" } }, res); assert.equal(res.statusCode, 400);
  res = response(); await getBroadcastResultsBatch({ query: { ids: { $ne: "" } } }, res); assert.deepEqual(res.body.results, {});
  res = response(); await getBroadcastResultsBatch({ query: { ids: Array.from({ length: 21 }, (_, index) => oid(index)).join(",") } }, res); assert.equal(res.statusCode, 400);
  assert.equal(find.mock.callCount(), 0);
  res = response(); await getBroadcastResultsBatch({ query: { ids: `${oid(1)}, ${oid(2)},${oid(1)}` } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(find.mock.calls[0].arguments[0]._id.$in, [oid(1), oid(2)]);
});
