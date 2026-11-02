// "Sipariş kaçırmamak için" incelemesi: kaçırılan sipariş sınırı (canlı olay sınırı ilerletmez, sorgu payı, sayfa
// yenilenince sürdürme) ve müşteri iptali tutarının kuruş yuvarlaması.
import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { CUSTOMER_CANCEL_EVENT, customerCancelPayload, feedItemFromEvent } from "../services/adminFeed.service.js";
import {
  PREPARING,
  RESUME_WINDOW_MS,
  RING_WINDOW_MS,
  SNAPSHOT_GRACE_MS,
  pickMissedOrders,
  reconcileRinging,
  resumeBaseline,
  ringStartAt,
  snapshotBaseline,
} from "../../frontend/src/components/admin/alerts/alertRules.js";

const at = (iso) => new Date(iso).getTime();
const order = (id, createdAt, status = PREPARING) => ({ id, createdAt, status });

test("sınır yalnızca kontrolle ilerler: sorgu payı kadar geride, geri gitmez; sunucu saati yoksa en yeni sipariş", () => {
  const snapshotMs = at("2026-11-02T19:00:00Z");
  assert.equal(snapshotBaseline(null, { orders: [], snapshotMs }), snapshotMs - SNAPSHOT_GRACE_MS);
  assert.equal(snapshotBaseline(snapshotMs, { orders: [], snapshotMs: snapshotMs - 60_000 }), snapshotMs, "geri gitmez");
  assert.equal(
    snapshotBaseline(null, { orders: [order("a", "2026-11-02T18:50:00Z"), order("b", "2026-11-02T18:55:00Z")], snapshotMs: NaN }),
    at("2026-11-02T18:55:00Z"),
    "eski sunucu (meta.serverTime yok) → listedeki en yeni sipariş",
  );
  assert.equal(snapshotBaseline(null, { orders: [], snapshotMs: NaN }), null, "bilgi yoksa sınır yok");
  assert.equal(snapshotBaseline(undefined), null);
});

test("kopukken kaçırılan sipariş, ondan sonra canlı gelen siparişin arkasında kaybolmaz", () => {
  // 1. kontrol 21:00:00; A 21:00:10'da kopuk bağlantıda kaçırıldı; B 21:00:50'de canlı geldi (bilinen)
  const first = at("2026-11-02T18:00:00Z");
  let baselineMs = snapshotBaseline(null, { orders: [], snapshotMs: first });
  const knownIds = new Set(["B"]);
  const a = order("A", "2026-11-02T18:00:10Z");
  const b = order("B", "2026-11-02T18:00:50Z");
  // 2. kontrol: A ve B listede. Canlı olay sınırı ilerletmediği için A kaçırılmış sayılır, B bilindiği için duyurulmaz.
  const missed = pickMissedOrders([b, a], { knownIds, baselineMs });
  assert.deepEqual(missed.map((item) => item.id), ["A"]);
  baselineMs = snapshotBaseline(baselineMs, { orders: [a, b], snapshotMs: at("2026-11-02T18:02:00Z") });
  assert.equal(baselineMs, at("2026-11-02T18:02:00Z") - SNAPSHOT_GRACE_MS);
});

test("sorgu sürerken kaydedilen (listeye girmemiş) sipariş bir sonraki kontrolde yakalanır", () => {
  const snapshotMs = at("2026-11-02T18:00:00Z");
  // C, anlık görüntüden 2 sn önce oluşturuldu ama kaydı sorgudan sonra tamamlandı: ilk listede yok
  const baselineMs = snapshotBaseline(null, { orders: [], snapshotMs });
  const c = order("C", "2026-11-02T17:59:58Z");
  assert.deepEqual(pickMissedOrders([c], { knownIds: new Set(), baselineMs }).map((item) => item.id), ["C"]);
  // Sınır payı kadar eski sipariş ise ilk listede olmalıydı (eski sipariş "yeni" diye duyurulmaz)
  const old = order("D", new Date(snapshotMs - SNAPSHOT_GRACE_MS - 1000).toISOString());
  assert.deepEqual(pickMissedOrders([old], { knownIds: new Set(), baselineMs }), []);
  // Hazırlanıyor olmayan duyurulmaz
  assert.deepEqual(pickMissedOrders([order("E", "2026-11-02T18:00:30Z", "Yolda")], { knownIds: new Set(), baselineMs }), []);
});

test("sayfa yenilenince önceki sınır yalnızca kısa süre içinde sürdürülür; bozuk kayıt yok sayılır", () => {
  const now = at("2026-11-02T19:30:00Z");
  const ms = at("2026-11-02T19:28:00Z");
  assert.equal(resumeBaseline({ ms, savedAt: now - 60_000 }, now), ms);
  assert.equal(resumeBaseline({ ms, savedAt: now - RESUME_WINDOW_MS }, now), null, "süre dolmuş");
  assert.equal(resumeBaseline({ ms, savedAt: now + 60_000 }, now), null, "cihaz saati geri alınmış (gelecekteki kayıt)");
  assert.equal(resumeBaseline({ ms: null, savedAt: now }, now), null, "boş sınır 0 sayılmaz (yoksa her sipariş duyurulurdu)");
  assert.equal(resumeBaseline({ ms: "123", savedAt: now }, now), null);
  assert.equal(resumeBaseline({ ms: Number.NaN, savedAt: now }, now), null);
  assert.equal(resumeBaseline({ ms, savedAt: "x" }, now), null);
  assert.equal(resumeBaseline(null, now), null);
  assert.equal(resumeBaseline("bozuk", now), null);
  assert.ok(RESUME_WINDOW_MS >= 3 * 60_000, "en geç 2 dk'da bir yapılan kontrolü ve yeniden yüklemeyi kapsar");
});

test("müşteri iptali tutarı kuruşa yuvarlanır (canlı olay ve zil kaydı)", () => {
  const orderDoc = { _id: new mongoose.Types.ObjectId("65f1c0ffee00000000ab12cd"), user: null, totalAmount: 1.005 };
  assert.equal(customerCancelPayload(orderDoc, {}, new Date(0)).totalAmount, 1.01);
  assert.equal(customerCancelPayload({ ...orderDoc, totalAmount: undefined }, {}, new Date(0)).totalAmount, 0);
  const item = feedItemFromEvent(CUSTOMER_CANCEL_EVENT, { orderId: "65f1c0ffee00000000ab12cd", totalAmount: "80.505" }, new Date(0));
  assert.equal(item.cancel.totalAmount, 80.51);
  assert.equal(feedItemFromEvent(CUSTOMER_CANCEL_EVENT, { orderId: "65f1c0ffee00000000ab12cd", totalAmount: "abc" }).cancel.totalAmount, 0);
});

test("kaçırılan sipariş verildiği andan sayılan 30 dk boyunca çalar; süresi dolmuşsa bir kez duyurulur, tekrar çalmaz", () => {
  const nowMs = at("2026-11-02T20:00:00Z"); // bu cihazın saati
  const serverNowMs = nowMs + 90_000; // sunucu saati 90 sn ileride
  // 10 dk önce verilmiş: kalan 20 dk çalar
  const tenMinutes = ringStartAt(new Date(serverNowMs - 10 * 60_000).toISOString(), { nowMs, serverNowMs });
  assert.equal(tenMinutes, nowMs - 10 * 60_000);
  const keep = reconcileRinging([{ id: "a", firstAt: tenMinutes }], { nowMs });
  assert.deepEqual(keep.map((entry) => entry.id), ["a"]);
  assert.deepEqual(reconcileRinging([{ id: "a", firstAt: tenMinutes }], { nowMs: nowMs + 20 * 60_000 }), [], "20 dk sonra susar");
  // 10 saat önce verilmiş (dizüstü uykudaydı): süre doldu, tekrar listesine girmez
  const stale = ringStartAt(new Date(serverNowMs - 10 * 3_600_000).toISOString(), { nowMs, serverNowMs });
  assert.equal(stale, nowMs - RING_WINDOW_MS);
  assert.deepEqual(reconcileRinging([{ id: "b", firstAt: stale }], { nowMs }), []);
  // Sunucuya göre gelecekte görünen kayıt (saat farkı) şimdi sayılır; bilgi eksikse şimdi
  assert.equal(ringStartAt(new Date(serverNowMs + 5000).toISOString(), { nowMs, serverNowMs }), nowMs);
  assert.equal(ringStartAt(null, { nowMs, serverNowMs }), nowMs);
  assert.equal(ringStartAt("2026-11-02T19:55:00Z", { nowMs }), nowMs, "sunucu saati bilinmiyorsa (canlı sipariş) şimdi");
});
