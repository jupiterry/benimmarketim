// "Sipariş kaçırmamak için" paketi: müşteri iptali olayı (sunucu) ve panelin saf uyarı kuralları
// (frontend/src/components/admin/alerts/alertRules.js bağımlılıksızdır; burada doğrudan sınanır).
import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import { cancelOrder } from "../controllers/ordersAnalytics.controller.js";
import {
  CUSTOMER_CANCEL_EVENT,
  customerCancelPayload,
  feedItemFromEvent,
  listAdminFeed,
  recordAdminEvent,
  toClientItem,
} from "../services/adminFeed.service.js";
import {
  ALARM_ONLINE_MS,
  PREPARING,
  RING_WINDOW_MS,
  SNAPSHOT_GRACE_MS,
  alarmTone,
  cancelReasonText,
  countAlarmDevices,
  flattenActiveOrders,
  intervalEvery,
  intervalLabel,
  isAlarmDeviceOnline,
  isWithinOrderHours,
  newestCreatedMs,
  normalizeCancel,
  normalizePrefs,
  normalizeSound,
  orderCode,
  parseSeenIds,
  phoneAckIds,
  pickMissedOrders,
  reconcileRinging,
  soundUrl,
} from "../../frontend/src/components/admin/alerts/alertRules.js";

const NOW = new Date("2026-11-02T19:30:00Z"); // 22:30 İstanbul
const ORDER_ID = "65f1c0ffee00000000ab12cd";
const OWNER = new mongoose.Types.ObjectId();

// Bellek içi koleksiyon (admin-feed.test.js ile aynı yaklaşım): yalnızca kullanılan işlemler
const memoryDb = () => {
  const data = {};
  const matches = (doc, filter = {}) =>
    Object.entries(filter).every(([key, cond]) => (cond && typeof cond === "object" && "$gt" in cond ? new Date(doc[key]) > cond.$gt : String(doc[key]) === String(cond)));
  return {
    data,
    collection(name) {
      data[name] ||= [];
      const docs = data[name];
      return {
        createIndex: async () => {},
        findOne: async (filter) => docs.find((doc) => matches(doc, filter)) || null,
        find: (filter) => {
          let rows = docs.filter((doc) => matches(doc, filter));
          const cursor = {
            sort: () => { rows = [...rows].sort((a, b) => new Date(b.at) - new Date(a.at)); return cursor; },
            limit: (n) => { rows = rows.slice(0, n); return cursor; },
            toArray: async () => rows,
          };
          return cursor;
        },
        updateOne: async (filter, update, { upsert } = {}) => {
          let doc = docs.find((item) => matches(item, filter));
          if (!doc && upsert) docs.push((doc = { ...filter }));
          if (doc) Object.assign(doc, update.$set);
        },
      };
    },
  };
};

const response = () => ({
  code: 200,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

// ── Sunucu: müşteri iptali olayı ──────────────────────────────────────────

test("müşteri iptali yükü: kod, neden etiketi, not; ad yalnızca siparişin sahibi iptal ettiyse", () => {
  const order = { _id: new mongoose.Types.ObjectId(ORDER_ID), user: OWNER, totalAmount: 123.456, deliveryPointName: "Kız KYK Yurdu" };
  const payload = customerCancelPayload(order, { cancelReason: { code: "gec", note: "  çok   bekledim " }, actor: { _id: OWNER, name: "Ece Su", role: "customer" } }, NOW);
  assert.deepEqual(payload, {
    orderId: ORDER_ID,
    code: "#AB12CD",
    customerName: "Ece Su",
    reason: "Teslimat çok uzun sürecek",
    reasonCode: "gec",
    note: "çok bekledim",
    totalAmount: 123.46,
    deliveryPointName: "Kız KYK Yurdu",
    at: NOW.toISOString(),
  });

  const byAdmin = customerCancelPayload(order, { cancelReason: null, actor: { _id: new mongoose.Types.ObjectId(), name: "Yönetici", role: "admin" } }, NOW);
  assert.equal(byAdmin.customerName, "", "başkasının siparişini iptal edenin adı müşteri adı diye yazılmaz");
  assert.equal(byAdmin.reason, "");
  assert.equal(byAdmin.reasonCode, null);
  assert.equal(byAdmin.note, "");

  const unknownReason = customerCancelPayload(order, { cancelReason: { code: "uydurma", note: "x" }, actor: null }, NOW);
  assert.equal(unknownReason.reason, "");
  assert.equal(unknownReason.note, "", "bilinmeyen nedende not da yazılmaz");
});

test("müşteri iptali zil kaydına dönüşür; panel biçiminde orderId ve iptal ayrıntısı taşır", () => {
  const payload = { orderId: ORDER_ID, code: "#AB12CD", customerName: "Ece Su", reason: "Fikrimi değiştirdim", note: "", totalAmount: 80, at: NOW.toISOString() };
  const item = feedItemFromEvent(CUSTOMER_CANCEL_EVENT, payload, new Date(0));
  assert.equal(item.key, `cancel-${ORDER_ID}`);
  assert.equal(item.kind, "cancel");
  assert.equal(item.title, "Müşteri siparişi iptal etti");
  assert.equal(item.detail, "#AB12CD · Ece Su · Neden: Fikrimi değiştirdim");
  assert.equal(item.orderId, ORDER_ID);
  assert.deepEqual(item.cancel, { code: "#AB12CD", customerName: "Ece Su", reason: "Fikrimi değiştirdim", note: "", totalAmount: 80 });
  assert.equal(item.at.toISOString(), NOW.toISOString());

  const noReason = feedItemFromEvent(CUSTOMER_CANCEL_EVENT, { orderId: ORDER_ID, at: "geçersiz" }, NOW);
  assert.equal(noReason.detail, "#AB12CD · Neden belirtilmedi", "kod kimlikten üretilir, neden yoksa belirtilir");
  assert.equal(noReason.at.toISOString(), NOW.toISOString(), "geçersiz tarih → şimdi");

  const withNote = feedItemFromEvent(CUSTOMER_CANCEL_EVENT, { orderId: ORDER_ID, reason: "Diğer", note: "Adres yanlış" }, NOW);
  assert.equal(withNote.detail, "#AB12CD · Neden: Diğer · “Adres yanlış”");

  assert.equal(feedItemFromEvent(CUSTOMER_CANCEL_EVENT, { orderId: "abc" }, NOW), null, "geçersiz kimlik saklanmaz");
  assert.equal(feedItemFromEvent(CUSTOMER_CANCEL_EVENT, null, NOW), null);

  const client = toClientItem(item);
  assert.equal(client.id, `cancel-${ORDER_ID}`);
  assert.equal(client.kind, "cancel");
  assert.equal(client.orderId, ORDER_ID);
  assert.equal(client.cancel.reason, "Fikrimi değiştirdim");
  assert.equal(client.at, NOW.toISOString());
  const order = toClientItem(feedItemFromEvent("newOrder", { order: { id: "o1", totalAmount: 5, customerName: "A", createdAt: NOW } }));
  assert.equal("orderId" in order, false, "sipariş satırı değişmez");
  assert.equal("cancel" in order, false);
});

test("iptal kaydı sunucuda saklanır ve zil listesinde görünür", async () => {
  const db = memoryDb();
  await recordAdminEvent(CUSTOMER_CANCEL_EVENT, { orderId: ORDER_ID, reason: "Başka yerden aldım", at: NOW.toISOString() }, { db, now: NOW });
  await recordAdminEvent(CUSTOMER_CANCEL_EVENT, { orderId: ORDER_ID, reason: "Başka yerden aldım", at: NOW.toISOString() }, { db, now: NOW });
  assert.equal(db.data.admin_notifications.length, 1, "aynı sipariş tek satır");
  const [item] = await listAdminFeed(db, "admin1");
  assert.equal(item.kind, "cancel");
  assert.equal(item.orderId, ORDER_ID);
  assert.match(item.detail, /Neden: Başka yerden aldım/);
});

test("müşteri iptal edince panel olayı (yeni) ve durum olayı (eski) adminRoom'a gider", async (t) => {
  const makeOrder = () => ({
    _id: new mongoose.Types.ObjectId(ORDER_ID),
    user: OWNER,
    status: "Hazırlanıyor",
    couponCode: null,
    totalAmount: 150,
    deliveryPointName: "Erkek KYK Yurdu",
    statusHistory: [],
    save: async () => {},
  });
  let order = makeOrder();
  t.mock.method(Order, "findById", async () => order);
  const sent = [];
  const io = { to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };

  const res = response();
  await cancelOrder({ body: { orderId: ORDER_ID, reason: "fiyat", note: "pahalı" }, user: { _id: OWNER, name: "Selin", role: "customer" }, app: { get: () => io } }, res);
  assert.equal(res.code, 200);
  assert.equal(order.status, "İptal Edildi");
  assert.deepEqual(sent.map((item) => [item.room, item.event]), [["adminRoom", "orderStatusUpdated"], ["adminRoom", CUSTOMER_CANCEL_EVENT]]);
  assert.equal(sent[0].payload.message, "Müşteri siparişi iptal etti: Fiyat yüksek geldi", "eski olay değişmedi");
  const payload = sent[1].payload;
  assert.equal(payload.orderId, ORDER_ID);
  assert.equal(payload.code, "#AB12CD");
  assert.equal(payload.customerName, "Selin");
  assert.equal(payload.reason, "Fiyat yüksek geldi");
  assert.equal(payload.note, "pahalı");
  assert.equal(payload.totalAmount, 150);

  // Socket.IO yoksa iptal yine başarılı (olay gönderilemez, hata yok)
  order = makeOrder();
  const quiet = response();
  await cancelOrder({ body: { orderId: ORDER_ID }, user: { _id: OWNER, name: "Selin", role: "customer" }, app: { get: () => null } }, quiet);
  assert.equal(quiet.code, 200);

  // İptal edilemeyen sipariş için olay gitmez
  order = { ...makeOrder(), status: "Yolda" };
  sent.length = 0;
  const late = response();
  await cancelOrder({ body: { orderId: ORDER_ID }, user: { _id: OWNER, name: "Selin", role: "customer" }, app: { get: () => io } }, late);
  assert.equal(late.code, 400);
  assert.equal(sent.length, 0);
});

// ── Panel: saf uyarı kuralları ────────────────────────────────────────────

test("ses tercihi: eski kısa adlar dosya adına çevrilir, bilinmeyen → varsayılan", () => {
  assert.equal(normalizeSound("bell"), "bell");
  assert.equal(normalizeSound("furelise"), "fur-elise");
  assert.equal(normalizeSound("gnosienne"), "gnosienne-no1");
  assert.equal(normalizeSound("vivaldi"), "vivaldi-winter");
  assert.equal(normalizeSound(null), "ringtone");
  assert.equal(normalizeSound("../../etc"), "ringtone");
  assert.equal(soundUrl("vivaldi"), "/vivaldi-winter.mp3");
  assert.deepEqual(normalizePrefs(null), { volume: 0.75, muted: false, repeat: true, intervalSec: 30 });
  assert.deepEqual(normalizePrefs({ volume: 3, muted: true, repeat: false, intervalSec: 60 }), { volume: 1, muted: true, repeat: false, intervalSec: 60 });
  assert.deepEqual(normalizePrefs({ volume: -1, intervalSec: 45 }), { volume: 0, muted: false, repeat: true, intervalSec: 30 });
  assert.equal(normalizePrefs({ volume: "abc" }).volume, 0.75);
  assert.equal(normalizePrefs({ volume: null }).volume, 0.75);
  assert.equal(normalizePrefs({ volume: 0 }).volume, 0);
  assert.deepEqual([30, 60, 120].map(intervalLabel), ["30 sn", "1 dk", "2 dk"]);
  assert.deepEqual([30, 60, 120].map(intervalEvery), ["30 sn'de bir", "1 dk'da bir", "2 dk'da bir"]);
});

test("alarm telefonları: kaldırılan sayılmaz, son 3 dk içinde uğrayan bağlı", () => {
  const now = NOW.getTime();
  const devices = [
    { id: "a", lastSeenAt: new Date(now - 60_000).toISOString(), revokedAt: null },
    { id: "b", lastSeenAt: new Date(now - ALARM_ONLINE_MS - 1000).toISOString(), revokedAt: null },
    { id: "c", lastSeenAt: new Date(now).toISOString(), revokedAt: new Date(now).toISOString() },
    { id: "d", lastSeenAt: null },
  ];
  assert.deepEqual(countAlarmDevices(devices, now), { paired: 3, connected: 1 });
  assert.deepEqual(countAlarmDevices(null, now), { paired: 0, connected: 0 });
  assert.equal(isAlarmDeviceOnline(devices[0], now), true);
  assert.equal(isAlarmDeviceOnline(devices[1], now), false);
  assert.equal(isAlarmDeviceOnline(devices[2], now), false, "kaldırılan telefon bağlı sayılmaz");

  assert.equal(alarmTone({ paired: 0, connected: 0, inHours: true }), "", "eşli telefon yoksa nötr");
  assert.equal(alarmTone({ paired: 2, connected: 2, inHours: true }), "ok");
  assert.equal(alarmTone({ paired: 2, connected: 0, inHours: true }), "danger");
  assert.equal(alarmTone({ paired: 2, connected: 1, inHours: true }), "warn");
  assert.equal(alarmTone({ paired: 2, connected: 0, inHours: false }), "", "sipariş saati dışında nötr");
  assert.deepEqual([...phoneAckIds([{ orderId: "x" }, { orderId: null }, {}])], ["x"]);
});

test("sipariş saatleri İstanbul saatiyle; gece yarısını geçen aralık ve 24 saat açık", () => {
  const at = (iso) => new Date(iso).getTime();
  const hours = { orderStartHour: 10, orderStartMinute: 0, orderEndHour: 1, orderEndMinute: 0 };
  assert.equal(isWithinOrderHours(hours, at("2026-11-02T19:30:00Z")), true, "22:30");
  assert.equal(isWithinOrderHours(hours, at("2026-11-02T21:30:00Z")), true, "00:30");
  assert.equal(isWithinOrderHours(hours, at("2026-11-02T22:30:00Z")), false, "01:30");
  assert.equal(isWithinOrderHours(hours, at("2026-11-03T06:59:00Z")), false, "09:59");
  assert.equal(isWithinOrderHours(hours, at("2026-11-03T07:00:00Z")), true, "10:00");
  assert.equal(isWithinOrderHours({}, at("2026-11-02T19:30:00Z")), true, "ayar yoksa 10:00–01:00");
  const sameDay = { orderStartHour: 10, orderStartMinute: 0, orderEndHour: 22, orderEndMinute: 0 };
  assert.equal(isWithinOrderHours(sameDay, at("2026-11-02T19:30:00Z")), false, "22:30 > 22:00");
  const allDay = { orderStartHour: 0, orderStartMinute: 0, orderEndHour: 0, orderEndMinute: 0 };
  assert.equal(isWithinOrderHours(allDay, at("2026-11-02T01:00:00Z")), true);
  const toMidnight = { orderStartHour: 9, orderStartMinute: 30, orderEndHour: 0, orderEndMinute: 0 };
  assert.equal(isWithinOrderHours(toMidnight, at("2026-11-02T20:59:00Z")), true, "23:59");
  assert.equal(isWithinOrderHours(toMidnight, at("2026-11-02T06:00:00Z")), false, "09:00");
});

test("etkin siparişler düzleşir; kaçırılanlar: bilinmeyen, Hazırlanıyor ve bilinen son siparişten yeni", () => {
  const data = {
    usersOrders: [
      { user: { name: "Ece" }, orders: [
        { orderId: "a1", status: PREPARING, createdAt: "2026-11-02T19:00:00Z", totalAmount: "50", products: [{}], deliveryPointName: "Kız KYK" },
        { orderId: "a2", status: "Yolda", createdAt: "2026-11-02T19:10:00Z", totalAmount: 20, products: [] },
      ] },
      { user: null, orders: [{ orderId: "b1", status: PREPARING, createdAt: "2026-11-02T19:20:00Z", totalAmount: 30, deliveryZone: { name: "Devrek merkez" } }] },
      { user: { name: "Boş" }, orders: [{ orderId: "", status: PREPARING }] },
    ],
  };
  const orders = flattenActiveOrders(data);
  assert.deepEqual(orders.map((order) => order.id), ["a1", "a2", "b1"]);
  assert.equal(orders[0].customerName, "Ece");
  assert.equal(orders[0].totalAmount, 50);
  assert.equal(orders[2].customerName, "Müşteri");
  assert.equal(orders[2].deliveryZoneName, "Devrek merkez");
  assert.deepEqual(flattenActiveOrders(null), []);
  assert.equal(newestCreatedMs(orders), new Date("2026-11-02T19:20:00Z").getTime());
  assert.equal(newestCreatedMs([]), -Infinity);

  const baselineMs = new Date("2026-11-02T19:05:00Z").getTime();
  assert.deepEqual(pickMissedOrders(orders, { knownIds: new Set(), baselineMs }).map((order) => order.id), ["b1"], "a1 bilinen son siparişten eski, a2 yolda");
  assert.deepEqual(pickMissedOrders(orders, { knownIds: new Set(["b1"]), baselineMs }).map((order) => order.id), [], "duyurulan tekrar duyurulmaz");
  assert.deepEqual(pickMissedOrders(orders, { knownIds: new Set(), baselineMs: null }).map((order) => order.id), ["a1", "b1"], "eskiden yeniye");
  const sameMs = new Date("2026-11-02T19:20:00Z").getTime();
  assert.deepEqual(pickMissedOrders(orders, { knownIds: new Set(), baselineMs: sameMs }).map((order) => order.id), ["b1"],
    "bilinen son siparişle aynı milisaniyede verilen bilinmeyen sipariş de kaçırılmış sayılır");
});

test("çalan siparişler: süre, onay, görüldü ve anlık görüntüdeki durum", () => {
  const now = NOW.getTime();
  const snapshotMs = now;
  const entry = (id, firstAgoMs, createdAgoMs) => ({ id, firstAt: now - firstAgoMs, createdAt: createdAgoMs === null ? null : new Date(now - createdAgoMs).toISOString() });
  const ringing = [
    entry("fresh", 60_000, 60_000),
    entry("expired", RING_WINDOW_MS, RING_WINDOW_MS),
    entry("acked", 10_000, 10_000),
    entry("delivered", 60_000, 60_000),
    entry("gone", 60_000, 60_000),
    entry("just-created", 1000, 1000),
    entry("unknown-time", 60_000, null),
    { id: "broken", firstAt: "x" },
  ];
  const kept = reconcileRinging(ringing, { nowMs: now, isDone: (id) => id === "acked" });
  assert.deepEqual(kept.map((item) => item.id), ["fresh", "delivered", "gone", "just-created", "unknown-time"]);

  const active = new Map([["fresh", PREPARING], ["delivered", "Yolda"]]);
  const reconciled = reconcileRinging(ringing, { nowMs: now, isDone: (id) => id === "acked", active, snapshotMs });
  assert.deepEqual(reconciled.map((item) => item.id), ["fresh", "just-created", "unknown-time"],
    "yolda olan ve listede olmayan bırakılır; anlık görüntüden sonra oluşturulan ve zamanı bilinmeyen çalmaya devam eder");
  assert.ok(SNAPSHOT_GRACE_MS >= 1000);
});

test("Siparişler ekranının görüldü deposu ve müşteri iptali kaydı", () => {
  assert.deepEqual([...parseSeenIds('["a","b"]')], ["a", "b"]);
  assert.deepEqual([...parseSeenIds('{"a":1}')], ["a"]);
  assert.equal(parseSeenIds("bozuk{").size, 0);
  assert.equal(parseSeenIds(null).size, 0);

  const live = normalizeCancel({ orderId: ORDER_ID, code: "#AB12CD", customerName: " Ece ", reason: "Fikrimi değiştirdim", note: "", totalAmount: "80.5", at: NOW.toISOString() });
  assert.deepEqual(live, { orderId: ORDER_ID, code: "#AB12CD", customerName: "Ece", reason: "Fikrimi değiştirdim", note: "", totalAmount: 80.5, at: NOW.toISOString() });
  const fromFeed = normalizeCancel({ id: `cancel-${ORDER_ID}`, kind: "cancel", orderId: ORDER_ID, cancel: { code: "#AB12CD", reason: "", note: "x" }, at: NOW.toISOString() });
  assert.equal(fromFeed.orderId, ORDER_ID);
  assert.equal(fromFeed.at, NOW.toISOString());
  assert.equal(normalizeCancel({ orderId: "kısa" }), null);
  assert.equal(normalizeCancel({ orderId: ORDER_ID }).code, orderCode(ORDER_ID));
  assert.equal(orderCode(ORDER_ID), "#AB12CD");
  assert.equal(cancelReasonText(live), "Neden: Fikrimi değiştirdim");
  assert.equal(cancelReasonText(fromFeed), "Neden belirtilmedi · “x”");
});
