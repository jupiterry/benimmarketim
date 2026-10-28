// Teslimat operasyonu (Devrek pilotu): ilk sipariş telefon teyidi, "Teslim edilemedi", kurye ataması ve kurye
// listesi, yeni iptal nedenleri, müşteri sipariş JSON'u (mobil Aşama 2 sözleşmesi §6) ve pano özeti.
// Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Coupon from "../models/coupon.model.js";
import Mission from "../models/mission.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import Settings from "../models/settings.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import DeliveryZone from "../models/deliveryZone.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import {
  CANCEL_REASONS, DELIVERY_OUTCOMES, deliveryOutcomeText,
} from "../lib/feedbackOptions.js";
import {
  confirmCallback, markDeliveryFailed, assignCourier, normalizeDeliveryOutcome, getUserOrders, groupOrdersByUser,
  normalizeCancelReason, computeDashboardSummary, summarizeFailedDeliveries,
} from "../controllers/ordersAnalytics.controller.js";
import {
  getPublicZones, adminListZones, adminUpdateZone, adminBulkUpdateZones, adminGetCouriers, adminUpdateCouriers,
} from "../controllers/delivery.controller.js";
import { placeOrder, resetDuplicateOrderGuard } from "../controllers/cart.controller.js";
import {
  normalizeZoneInput, normalizeCouriersInput, needsFirstOrderCallback, resetYurtSeedState,
} from "../services/delivery.service.js";
import { applyOrderStatusChange } from "../services/order.service.js";
import { buildOrderStatusMessage } from "../services/orderStatusNotifier.js";
import { invalidateSettingsCache } from "../controllers/settings.controller.js";
import ordersRouter from "../routes/ordersAnalytics.route.js";
import deliveryRouter from "../routes/delivery.route.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const ORDER = (n) => hex("6ac8bc", n);
const USER = (n) => hex("507f1f77bcf8", n);
const PRODUCT = (n) => hex("99cc", n);
const COURIER = (n) => hex("c0c0", n);
const ADMIN = { _id: hex("ad", 1), role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  set(key, value) { this.headers[key] = value; return this; },
  setHeader(key, value) { this.headers[key] = value; },
  json(body) { this.body = body; return this; },
});

// io.to(a).to(b).emit(...) çağrılarını odalarıyla kaydeder
const ioSpy = () => {
  const emits = [];
  return {
    emits,
    io: {
      to(first) {
        const rooms = [first];
        const target = { to(room) { rooms.push(room); return target; }, emit(event, payload) { emits.push({ rooms: [...rooms], event, payload }); } };
        return target;
      },
    },
  };
};
const adminRequest = (body = {}, extra = {}) => {
  const spy = ioSpy();
  return { spy, req: { body, params: {}, query: {}, user: ADMIN, method: "PUT", originalUrl: "/api/orders-analytics/x", app: { get: (key) => (key === "io" ? spy.io : null) }, ...extra } };
};

const chain = (result) => {
  const resolve = async () => (typeof result === "function" ? result() : result);
  const c = {
    select() { return c; },
    sort() { return c; },
    limit() { return c; },
    populate() { return c; },
    lean: resolve,
    then(onOk, onErr) { return resolve().then(onOk, onErr); },
  };
  return c;
};

const mockAudit = (t) => {
  const audits = [];
  t.mock.method(AdminAudit, "create", async (doc) => { audits.push(doc); return doc; });
  return audits;
};

// Kaydedilebilir sipariş belgesi (durum servisi $where koşulunu kaydeder)
const orderDoc = (fields = {}) => ({
  _id: new mongoose.Types.ObjectId(ORDER(1)),
  user: new mongoose.Types.ObjectId(USER(1)),
  status: "Yolda",
  statusHistory: [],
  couponCode: null,
  totalAmount: 240,
  deliveryPoint: "address",
  deliveryPointName: "Cumhuriyet Mah. · Atatürk Cd. No:5",
  saves: [],
  async save(options) { this.saves.push({ options, where: this.$where ? { ...this.$where } : null }); return this; },
  ...fields,
});

const settingsDoc = (fields = {}) => new Settings({
  name: "default",
  orderStartHour: 0, orderStartMinute: 0, orderEndHour: 0, orderEndMinute: 0,
  minimumOrderAmount: 100,
  ...fields,
});
const mockSettings = (t, fields) => {
  const doc = settingsDoc(fields);
  const saves = [];
  doc.save = async () => { saves.push(doc.toObject()); return doc; };
  t.mock.method(Settings, "getSettings", async () => doc);
  t.mock.method(Settings, "updateOne", async () => ({ modifiedCount: 1 }));
  return { doc, saves };
};

test.beforeEach(() => {
  resetDuplicateOrderGuard();
  resetYurtSeedState();
  invalidateSettingsCache();
});

// ── Seçenekler ───────────────────────────────────────────────────────────────

test("iptal nedenleri: bolge_disi ve ucret_yuksek eklendi, eskiler korunur, müşteri iptali yeni kodları kabul eder", () => {
  assert.equal(CANCEL_REASONS.bolge_disi, "Adresime teslimat yok");
  assert.equal(CANCEL_REASONS.ucret_yuksek, "Teslimat ücreti yüksek");
  for (const code of ["gec", "fikir", "yanlis_siparis", "fiyat", "baska_yer", "diger"]) assert.ok(CANCEL_REASONS[code], code);
  assert.deepEqual(normalizeCancelReason({ reason: "bolge_disi", note: " köydeyim " }), { code: "bolge_disi", note: "köydeyim" });
  assert.deepEqual(normalizeCancelReason({ reason: "ucret_yuksek" }), { code: "ucret_yuksek", note: "" });
});

test("teslim edilemedi nedenleri ve müşteri metni", () => {
  assert.deepEqual(Object.keys(DELIVERY_OUTCOMES), ["adres_bulunamadi", "cevap_yok", "reddetti", "diger"]);
  assert.equal(deliveryOutcomeText({ code: "adres_bulunamadi", label: "Adres bulunamadı" }), "Teslim edilemedi: Adres bulunamadı");
  assert.equal(deliveryOutcomeText({ code: "cevap_yok" }), "Teslim edilemedi: Müşteriye ulaşılamadı");
  assert.equal(deliveryOutcomeText(null), "");
  assert.equal(deliveryOutcomeText({ code: "" }), "");

  assert.deepEqual(normalizeDeliveryOutcome({ code: "reddetti", note: "  kapıda   vazgeçti " }).value, { code: "reddetti", label: "Müşteri teslim almadı", note: "kapıda vazgeçti" });
  assert.ok(normalizeDeliveryOutcome({ code: "kayip" }).error);
  assert.ok(normalizeDeliveryOutcome({ code: "diger" }).error, "Diğer için açıklama zorunlu");
  assert.ok(normalizeDeliveryOutcome({ code: "diger", note: "x".repeat(201) }).error);
  assert.ok(normalizeDeliveryOutcome({ code: "cevap_yok", note: 5 }).error);
  assert.equal(normalizeDeliveryOutcome({ code: "diger", note: "x".repeat(200) }).value.note.length, 200);
});

test("bildirim metni: teslim edilemedi iptalinde neden yazılır, diğer durumlar aynen", () => {
  assert.deepEqual(buildOrderStatusMessage("İptal Edildi", { deliveryOutcome: { code: "adres_bulunamadi", label: "Adres bulunamadı" } }), {
    title: "Siparişin teslim edilemedi", body: "Siparişin teslim edilemedi: Adres bulunamadı",
  });
  assert.equal(buildOrderStatusMessage("İptal Edildi", {}).title, "Siparişiniz iptal edildi");
  assert.equal(buildOrderStatusMessage("İptal Edildi").title, "Siparişiniz iptal edildi");
  assert.equal(buildOrderStatusMessage("Yolda", { deliveryOutcome: { code: "cevap_yok" } }).title, "Siparişiniz yola çıktı");
});

// ── Bölge: ilk sipariş teyidi ayarı ──────────────────────────────────────────

const ZONES = () => [
  { _id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt", enabled: true, closedReason: "", deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", sortOrder: 0, legacyPoint: "girlsDorm", requireFirstOrderCallback: false },
  { _id: "boysDorm", name: "Erkek KYK Yurdu", type: "yurt", enabled: true, closedReason: "", deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", sortOrder: 1, legacyPoint: "boysDorm" },
  { _id: "devrek", name: "Devrek", type: "ilce", enabled: true, closedReason: "", deliveryFee: 40, freeDeliveryThreshold: 500, minimumOrderAmount: null, etaText: "30-60 dk", sortOrder: 2, legacyPoint: null, requireFirstOrderCallback: true, area: null },
];
const mockZones = (t, zones = ZONES()) => {
  const fx = { zones, updateMany: [] };
  t.mock.method(DeliveryZone, "updateOne", async () => ({}));
  t.mock.method(DeliveryZone, "find", () => chain(() => fx.zones.map((z) => ({ ...z }))));
  t.mock.method(DeliveryZone, "findById", (id) => chain(() => {
    const zone = fx.zones.find((z) => z._id === id);
    return zone ? { ...zone } : null;
  }));
  t.mock.method(DeliveryZone, "findByIdAndUpdate", (id, update) => chain(() => {
    const zone = fx.zones.find((z) => z._id === id);
    if (!zone) return null;
    Object.assign(zone, update.$set);
    return { ...zone };
  }));
  t.mock.method(DeliveryZone, "updateMany", async (filter, update) => {
    fx.updateMany.push({ filter, update });
    let modified = 0;
    for (const zone of fx.zones) {
      if (filter._id?.$in?.includes(zone._id)) { Object.assign(zone, update.$set); modified += 1; }
    }
    return { matchedCount: modified, modifiedCount: modified };
  });
  return fx;
};

test("GET /api/delivery/zones ve yönetici listesi requiresFirstOrderCallback döndürür", async (t) => {
  mockSettings(t);
  mockZones(t);
  t.mock.method(Order, "aggregate", async () => []);
  const res = response();
  await getPublicZones({}, res);
  const byId = Object.fromEntries(res.body.zones.map((z) => [z.id, z]));
  assert.equal(byId.devrek.requiresFirstOrderCallback, true);
  assert.equal(byId.boysDorm.requiresFirstOrderCallback, false, "alanı olmayan eski bölge false");
  assert.equal(byId.girlsDorm.requiresFirstOrderCallback, false);
  for (const zone of res.body.zones) assert.equal(typeof zone.requiresFirstOrderCallback, "boolean");

  const admin = response();
  await adminListZones({}, admin);
  const adminById = Object.fromEntries(admin.body.zones.map((z) => [z.id, z]));
  assert.equal(adminById.devrek.requiresFirstOrderCallback, true);
  assert.equal(adminById.devrek.requireFirstOrderCallback, true);
  assert.equal(adminById.boysDorm.requiresFirstOrderCallback, false);
});

test("bölge düzenleme ve toplu işlem: requireFirstOrderCallback doğrulanır, kaydedilir ve işlem kaydına yazılır", async (t) => {
  mockSettings(t);
  const fx = mockZones(t);
  const audits = mockAudit(t);
  assert.equal(normalizeZoneInput({ requireFirstOrderCallback: "evet" }, { partial: true }).error, "İlk sipariş teyidi değeri geçersiz");
  assert.deepEqual(normalizeZoneInput({ requireFirstOrderCallback: true }, { partial: true }).value, { requireFirstOrderCallback: true });

  const res = response();
  await adminUpdateZone({ body: { requireFirstOrderCallback: true }, params: { id: "boysDorm" }, user: ADMIN, method: "PUT", originalUrl: "/api/delivery/admin/zones/boysDorm" }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.zone.requiresFirstOrderCallback, true);
  assert.equal(fx.zones.find((z) => z._id === "boysDorm").requireFirstOrderCallback, true);
  await tick();
  assert.deepEqual(audits[0].changes, [{ label: "İlk siparişte telefonla teyit", from: "Kapalı", to: "Açık" }]);

  const bulk = response();
  await adminBulkUpdateZones({ body: { ids: ["boysDorm", "devrek"], set: { requireFirstOrderCallback: false } }, user: ADMIN, method: "PATCH", originalUrl: "/api/delivery/admin/zones/bulk" }, bulk);
  assert.equal(bulk.statusCode, 200, JSON.stringify(bulk.body));
  assert.deepEqual(fx.updateMany.at(-1).update, { $set: { requireFirstOrderCallback: false } });
  assert.equal(fx.zones.find((z) => z._id === "devrek").requireFirstOrderCallback, false);
  const bad = response();
  await adminBulkUpdateZones({ body: { ids: ["devrek"], set: { requireFirstOrderCallback: 1 } }, user: ADMIN, method: "PATCH", originalUrl: "/x" }, bad);
  assert.equal(bad.statusCode, 400);
});

// ── Sipariş verme: needsCallback ─────────────────────────────────────────────

const PRODUCTS = [{ _id: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Süt", price: 50, category: "sut" }];
const mockCatalog = (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", () => chain(PRODUCTS));
};
const mockOrderCreate = (t) => {
  const created = [];
  t.mock.method(Order, "create", async (doc) => {
    const order = { _id: new mongoose.Types.ObjectId(), status: "Hazırlanıyor", createdAt: new Date(), ...doc };
    created.push(order);
    return order;
  });
  return created;
};
const customer = (n = 1) => ({
  _id: new mongoose.Types.ObjectId(USER(n)),
  name: "Ayşe",
  phone: "05551112233",
  role: "customer",
  cartItems: [],
  async save() { return this; },
});
const orderRequest = (body, user) => ({ body, user, app: { get: () => ({ to: () => ({ emit: () => {} }) }) } });
const addressBody = (zoneId, fields = {}) => ({
  paymentMethod: "cash",
  products: [{ product: PRODUCT(1), quantity: 6 }],
  phone: "05551112233",
  zoneId,
  deliveryAddress: { neighborhood: "Cumhuriyet", street: "Atatürk Cd.", buildingNo: "3", directions: "Caminin karşısı, mavi kapı", location: { lat: 41.2207, lng: 31.9563 } },
  ...fields,
});

test("adresli sipariş: teyitli bölgede teslim edilmiş siparişi olmayan müşteri needsCallback=true, olan false; bayraksız bölgede sorgu yok", async (t) => {
  mockSettings(t, { delivery: { addressOrdering: "public" } });
  mockCatalog(t);
  mockZones(t);
  const created = mockOrderCreate(t);
  const existsCalls = [];
  let delivered = null;
  t.mock.method(Order, "exists", async (filter) => { existsCalls.push(filter); return delivered; });

  const first = response();
  await placeOrder(orderRequest(addressBody("devrek"), customer(1)), first);
  assert.equal(first.statusCode, 201, JSON.stringify(first.body));
  assert.equal(created[0].needsCallback, true);
  assert.equal(existsCalls.length, 1);
  assert.equal(existsCalls[0].status, "Teslim Edildi");
  assert.equal(String(existsCalls[0].user), USER(1));
  // Şemaya uygun
  await new Order({ ...created[0], _id: undefined }).validate();

  delivered = { _id: new mongoose.Types.ObjectId() };
  const returning = response();
  await placeOrder(orderRequest(addressBody("devrek"), customer(2)), returning);
  assert.equal(returning.statusCode, 201);
  assert.equal(created[1].needsCallback, false, "daha önce teslim edilmiş siparişi var");

  const plainZone = response();
  await placeOrder(orderRequest(addressBody("girlsDorm"), customer(3)), plainZone);
  assert.equal(plainZone.statusCode, 201);
  assert.equal(created[2].needsCallback, false);
  assert.equal(existsCalls.length, 2, "bayrak kapalı bölgede teslim geçmişi sorgulanmaz");
});

test("yurt siparişi: yurt bölgesinde teyit açıksa needsCallback=true; bölge okunamazsa sipariş teyitsiz alınır", async (t) => {
  mockSettings(t);
  mockCatalog(t);
  const zones = ZONES();
  zones[0].requireFirstOrderCallback = true;
  mockZones(t, zones);
  const created = mockOrderCreate(t);
  t.mock.method(Order, "exists", async () => null);
  const body = {
    paymentMethod: "cash", products: [{ product: PRODUCT(1), quantity: 3 }], city: "Devrek", phone: "05551112233",
    deliveryPoint: "girlsDorm", deliveryPointName: "Kız KYK Yurdu",
  };
  const res = response();
  await placeOrder(orderRequest(body, customer(4)), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].needsCallback, true);
  assert.equal(created[0].deliveryPoint, "girlsDorm");

  t.mock.method(DeliveryZone, "findById", () => { throw new Error("bağlantı yok"); });
  const res2 = response();
  await placeOrder(orderRequest(body, customer(5)), res2);
  assert.equal(res2.statusCode, 201);
  assert.equal(created[1].needsCallback, false);
});

test("needsFirstOrderCallback: sorgu hatası siparişi bozmaz", async (t) => {
  t.mock.method(Order, "exists", async () => { throw new Error("db"); });
  assert.equal(await needsFirstOrderCallback({ requireFirstOrderCallback: true }, USER(1)), false);
  assert.equal(await needsFirstOrderCallback({ requireFirstOrderCallback: false }, USER(1)), false);
  assert.equal(await needsFirstOrderCallback(null, USER(1)), false);
});

// ── Yönetici: telefon teyidi ─────────────────────────────────────────────────

test("PUT /confirm-callback: doğrulama, teyit, işlem kaydı ve yalnızca adminRoom'a orderUpdated", async (t) => {
  const audits = mockAudit(t);
  const doc = orderDoc({ status: "Hazırlanıyor", needsCallback: true, callbackConfirmedAt: null });
  let current = doc;
  t.mock.method(Order, "findById", async (id) => (String(id) === ORDER(1) ? current : null));

  const badRes = response();
  await confirmCallback(adminRequest({ orderId: "x" }).req, badRes);
  assert.equal(badRes.statusCode, 400);

  const missing = response();
  await confirmCallback(adminRequest({ orderId: ORDER(9) }).req, missing);
  assert.equal(missing.statusCode, 404);

  const { req, spy } = adminRequest({ orderId: ORDER(1) });
  const res = response();
  await confirmCallback(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(doc.callbackConfirmedAt instanceof Date);
  assert.equal(String(doc.callbackConfirmedBy), ADMIN._id);
  assert.equal(doc.saves.length, 1);
  assert.equal(res.body.order.needsCallback, true);
  assert.equal(res.body.order.callbackConfirmedAt, doc.callbackConfirmedAt);
  await tick();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "Sipariş telefonla teyit edildi");
  assert.equal(audits[0].category, "order");
  assert.equal(audits[0].target, ORDER(1));
  assert.deepEqual(spy.emits.map((e) => [e.rooms, e.event, e.payload.kind]), [[["adminRoom"], "orderUpdated", "callback"]]);
  assert.equal(req.auditRecorded, true);

  // İkinci kez: değişiklik yok, kayıt/soket yok
  const again = adminRequest({ orderId: ORDER(1) });
  const againRes = response();
  await confirmCallback(again.req, againRes);
  assert.equal(againRes.body.unchanged, true);
  assert.equal(doc.saves.length, 1);
  assert.equal(again.spy.emits.length, 0);

  // Teyit gerekmeyen sipariş
  current = orderDoc({ needsCallback: false });
  const notNeeded = response();
  await confirmCallback(adminRequest({ orderId: ORDER(1) }).req, notNeeded);
  assert.equal(notNeeded.statusCode, 400);
  assert.equal(notNeeded.body.message, "Bu sipariş için telefonla teyit gerekmiyor");
});

// ── Yönetici: teslim edilemedi ───────────────────────────────────────────────

test("PUT /delivery-failed: neden yazılır, durum servisle İptal Edildi olur (kupon iadesi, bildirim, soket, kayıt)", async (t) => {
  const audits = mockAudit(t);
  const pushes = [];
  t.mock.method(User, "find", (filter) => { pushes.push(filter); return chain([]); });
  t.mock.method(Mission, "find", () => chain([]));
  const coupons = [];
  t.mock.method(Coupon, "findOneAndUpdate", async (filter, update) => { coupons.push({ filter, update }); return null; });
  const doc = orderDoc({ status: "Yolda", couponCode: "HOSGELDIN" });
  t.mock.method(Order, "findById", async () => doc);

  for (const body of [{ orderId: "bad", code: "cevap_yok" }, { orderId: ORDER(1), code: "yok" }, { orderId: ORDER(1), code: "diger", note: "" }]) {
    const res = response();
    await markDeliveryFailed(adminRequest(body).req, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(doc.saves.length, 0);

  const { req, spy } = adminRequest({ orderId: ORDER(1), code: "adres_bulunamadi", note: "Tarif yetersiz, telefon kapalı" });
  const res = response();
  await markDeliveryFailed(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.status, "İptal Edildi");
  assert.equal(doc.deliveryOutcome.code, "adres_bulunamadi");
  assert.equal(doc.deliveryOutcome.label, "Adres bulunamadı");
  assert.equal(doc.deliveryOutcome.note, "Tarif yetersiz, telefon kapalı");
  assert.ok(doc.deliveryOutcome.at instanceof Date);
  assert.equal(String(doc.deliveryOutcome.by), ADMIN._id);
  assert.equal(doc.statusHistory.at(-1).status, "İptal Edildi");
  assert.equal(String(doc.statusHistory.at(-1).changedBy), ADMIN._id);
  assert.deepEqual(doc.saves[0].where, { status: "Yolda" }, "durum koşullu kaydedilir");
  assert.equal(res.body.deliveryOutcome.label, "Adres bulunamadı");
  await tick();
  await tick();
  // Normal iptal gibi: kupon geri açılır, müşteriye bildirim denenir, müşteri + admin odasına orderStatusUpdated
  assert.equal(coupons.length, 1);
  assert.equal(coupons[0].filter.code, "HOSGELDIN");
  assert.equal(pushes.length, 1, "müşteri bildirimi gönderilmeye çalışıldı");
  const status = spy.emits.find((e) => e.event === "orderStatusUpdated");
  assert.deepEqual(status.rooms, [`user_${USER(1)}`, "adminRoom"]);
  assert.equal(status.payload.newStatus, "İptal Edildi");
  assert.ok(spy.emits.some((e) => e.event === "orderUpdated" && e.payload.kind === "delivery-failed" && e.rooms.join() === "adminRoom"));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "Sipariş teslim edilemedi");
  assert.deepEqual(audits[0].changes, [
    { label: "Durum", from: "Yolda", to: "İptal Edildi" },
    { label: "Teslim edilemedi", from: "—", to: "Adres bulunamadı — Tarif yetersiz, telefon kapalı" },
  ]);

  // Teslim edilmiş / iptal edilmiş siparişte 409
  const doneRes = response();
  await markDeliveryFailed(adminRequest({ orderId: ORDER(1), code: "cevap_yok" }).req, doneRes);
  assert.equal(doneRes.statusCode, 409);
  assert.equal(doneRes.body.status, "İptal Edildi");

  // Şema: deliveryOutcome doğrulanır
  await new Order({
    user: USER(1), products: [{ product: PRODUCT(1), name: "Süt", quantity: 1, price: 50 }], totalAmount: 50, city: "Devrek", phone: "05551112233",
    deliveryPoint: "address", deliveryOutcome: doc.deliveryOutcome, courier: { id: COURIER(1), name: "Ali" }, needsCallback: true,
  }).validate();
});

test("delivery-failed: Hazırlanıyor da işaretlenebilir; kayıt çakışması 409; iptalden geri alınınca neden temizlenir", async (t) => {
  mockAudit(t);
  t.mock.method(User, "find", () => chain([]));
  t.mock.method(Coupon, "findOneAndUpdate", async () => null);
  const doc = orderDoc({ status: "Hazırlanıyor" });
  doc.save = async () => { const error = new Error("conflict"); error.name = "VersionError"; throw error; };
  let reads = 0;
  t.mock.method(Order, "findById", async () => { reads += 1; return reads === 1 ? doc : { status: "Yolda" }; });
  const conflict = response();
  await markDeliveryFailed(adminRequest({ orderId: ORDER(1), code: "cevap_yok" }).req, conflict);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.status, "Yolda");

  const cancelled = orderDoc({ status: "İptal Edildi", deliveryOutcome: { code: "cevap_yok", label: "Müşteriye ulaşılamadı" } });
  t.mock.method(Coupon, "updateOne", async () => ({}));
  await applyOrderStatusChange(cancelled, "Hazırlanıyor", { actorId: ADMIN._id });
  assert.equal(cancelled.deliveryOutcome, undefined);
  await tick();
});

// ── Yönetici: kurye listesi ──────────────────────────────────────────────────

test("kuryeler: GET/PUT, doğrulama, kimlik korunur, işlem kaydı; herkese açık ayar JSON'unda görünmez", async (t) => {
  const { doc } = mockSettings(t, { delivery: { couriers: [{ _id: COURIER(1), name: "Ali", phone: "05321112233", active: true }] } });
  const audits = mockAudit(t);

  const list = response();
  await adminGetCouriers({}, list);
  assert.deepEqual(list.body, { couriers: [{ _id: COURIER(1), name: "Ali", phone: "05321112233", active: true }] });

  for (const couriers of [null, [{ name: "" }], [{ name: "A" }, { name: "a" }], [{ name: "B", phone: "abc" }], [{ name: "C", active: "yes" }], Array.from({ length: 31 }, (_, i) => ({ name: `K${i}` }))]) {
    const res = response();
    await adminUpdateCouriers({ body: { couriers }, user: ADMIN, method: "PUT", originalUrl: "/api/delivery/admin/couriers" }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(couriers)?.slice(0, 60));
  }
  assert.ok(normalizeCouriersInput([{ name: "Veli" }]).value[0]._id.match(/^[0-9a-f]{24}$/));

  const res = response();
  await adminUpdateCouriers({
    body: { couriers: [{ _id: COURIER(1), name: "Ali Kaya", phone: "0532 111 22 33", active: false }, { name: "Veli", phone: "" }] },
    user: ADMIN, method: "PUT", originalUrl: "/api/delivery/admin/couriers",
  }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.couriers.length, 2);
  assert.deepEqual(res.body.couriers[0], { _id: COURIER(1), name: "Ali Kaya", phone: "0532 111 22 33", active: false });
  assert.equal(res.body.couriers[1].active, true);
  assert.match(res.body.couriers[1]._id, /^[0-9a-f]{24}$/);
  await tick();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].category, "settings");
  const labels = audits[0].changes.map((c) => c.label);
  assert.ok(labels.includes("Kurye eklendi"));
  assert.ok(labels.includes("Kurye adı"));
  assert.ok(labels.includes("Ali Kaya"), "pasif yapıldı");
  // Telefonlar herkese açık GET /api/settings yanıtına çıkmaz (toJSON delivery'yi siler)
  const json = JSON.parse(JSON.stringify(doc));
  assert.equal(json.delivery, undefined);
  assert.ok(!JSON.stringify(json).includes("0532 111 22 33"));
});

// ── Yönetici: kurye ataması ──────────────────────────────────────────────────

test("PUT /assign-courier: doğrulama, aktif kurye, toplu atama, kaldırma, değişmeyenler atlanır; kayıt + soket", async (t) => {
  mockSettings(t, { delivery: { couriers: [
    { _id: COURIER(1), name: "Ali", phone: "05321112233", active: true },
    { _id: COURIER(2), name: "Veli", phone: "", active: false },
  ] } });
  const audits = mockAudit(t);
  const stored = new Map([
    [ORDER(1), { _id: new mongoose.Types.ObjectId(ORDER(1)), deliveryPoint: "address", deliveryPointName: "Cumhuriyet Mah." }],
    [ORDER(2), { _id: new mongoose.Types.ObjectId(ORDER(2)), deliveryPoint: "girlsDorm", deliveryPointName: "Kız KYK Yurdu", courier: { id: COURIER(1), name: "Ali" } }],
    [ORDER(3), { _id: new mongoose.Types.ObjectId(ORDER(3)), deliveryPoint: "address", deliveryPointName: "Yazıcık", courier: { id: COURIER(9), name: "Eski" } }],
  ]);
  t.mock.method(Order, "find", (filter) => chain(() => filter._id.$in.map((id) => stored.get(id)).filter(Boolean)));
  const updates = [];
  t.mock.method(Order, "updateMany", async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: filter._id.$in.length }; });

  for (const body of [{ orderIds: [], courierId: COURIER(1) }, { orderIds: ["x"], courierId: COURIER(1) }, { orderIds: [ORDER(1)], courierId: "ali" }]) {
    const res = response();
    await assignCourier(adminRequest(body).req, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  const unknown = response();
  await assignCourier(adminRequest({ orderIds: [ORDER(1)], courierId: COURIER(7) }).req, unknown);
  assert.equal(unknown.statusCode, 404);
  const inactive = response();
  await assignCourier(adminRequest({ orderIds: [ORDER(1)], courierId: COURIER(2) }).req, inactive);
  assert.equal(inactive.statusCode, 400);
  assert.match(inactive.body.message, /Veli pasif/);
  assert.equal(updates.length, 0);

  const { req, spy } = adminRequest({ orderIds: [ORDER(1), ORDER(2), ORDER(3), ORDER(8)], courierId: COURIER(1) });
  const res = response();
  await assignCourier(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.updated, 2);
  assert.deepEqual(res.body.courier, { id: COURIER(1), name: "Ali" });
  assert.deepEqual(res.body.skipped, [{ orderId: ORDER(2), reason: "unchanged" }, { orderId: ORDER(8), reason: "missing" }]);
  assert.deepEqual(updates[0].update, { $set: { courier: { id: COURIER(1), name: "Ali" } } });
  assert.deepEqual(updates[0].filter._id.$in.map(String), [ORDER(1), ORDER(3)]);
  assert.deepEqual(spy.emits.map((e) => [e.rooms.join(), e.event, e.payload.orderId, e.payload.kind]), [
    ["adminRoom", "orderUpdated", ORDER(1), "courier"], ["adminRoom", "orderUpdated", ORDER(3), "courier"],
  ]);
  await tick();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "Kurye atandı: Ali");
  assert.equal(audits[0].target, "2 sipariş");
  assert.deepEqual(audits[0].changes, [{ label: "Kurye", from: "Atanmamış, Eski", to: "Ali" }]);

  // Kaldırma
  const remove = adminRequest({ orderIds: [ORDER(2)], courierId: null });
  const removeRes = response();
  await assignCourier(remove.req, removeRes);
  assert.equal(removeRes.body.updated, 1);
  assert.equal(removeRes.body.courier, null);
  assert.deepEqual(updates[1].update, { $unset: { courier: 1 } });
  await tick();
  assert.equal(audits[1].action, "Kurye ataması kaldırıldı");
  assert.equal(audits[1].target, ORDER(2));

  // Hiçbiri değişmiyor: kayıt yazılmaz
  const noop = adminRequest({ orderIds: [ORDER(1)], courierId: null });
  const noopRes = response();
  await assignCourier(noop.req, noopRes);
  assert.equal(noopRes.body.updated, 0);
  assert.equal(noop.req.auditRecorded, true);
  assert.equal(updates.length, 2);
});

// ── Müşteri sipariş JSON'u (mobil sözleşme §6) ───────────────────────────────

const CUSTOMER_KEYS = [
  "deliveryType", "deliveryZone", "deliveryAddress", "deliveryFee", "productTotal", "totalAmount", "deliveryPointName",
  "needsCallback", "callbackConfirmedAt", "deliveryOutcomeLabel", "cancelReasonLabel", "cancelReasonNote",
];

test("GET /user-orders: mobilin beklediği alanların tamamı; kurye ve yönetici kimlikleri müşteriye gitmez", async (t) => {
  const confirmedAt = new Date("2026-10-23T09:10:00Z");
  const docs = [
    new Order({
      _id: ORDER(1), user: USER(1), products: [{ product: PRODUCT(1), name: "Süt", quantity: 2, price: 50 }],
      totalAmount: 160, productTotal: 100, deliveryFee: 60, subtotalAmount: 100, city: "Devrek", phone: "05551112233",
      deliveryPoint: "address", deliveryType: "address", deliveryPointName: "Cumhuriyet Mah. · Atatürk Cd. No:3",
      deliveryZone: { id: "devrek", name: "Devrek", type: "ilce" }, areaVerified: true,
      deliveryAddress: { zoneId: "devrek", zoneName: "Devrek", neighborhood: "Cumhuriyet", street: "Atatürk Cd.", buildingNo: "3", directions: "Caminin karşısı", location: { lat: 41.2207, lng: 31.9563 } },
      status: "İptal Edildi", needsCallback: true, callbackConfirmedAt: confirmedAt, callbackConfirmedBy: ADMIN._id,
      deliveryOutcome: { code: "adres_bulunamadi", label: "Adres bulunamadı", note: "iç not", at: new Date(), by: ADMIN._id },
      courier: { id: COURIER(1), name: "Ali" },
      paymentMethod: "cash", createdAt: new Date("2026-10-23T09:00:00Z"),
    }),
    new Order({
      _id: ORDER(2), user: USER(1), products: [{ product: PRODUCT(1), name: "Süt", quantity: 3, price: 50 }],
      totalAmount: 150, productTotal: 150, deliveryFee: 0, city: "Devrek", phone: "05551112233",
      deliveryPoint: "girlsDorm", deliveryPointName: "Kız KYK Yurdu", deliveryZone: { id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt" },
      status: "İptal Edildi", cancelReason: { code: "bolge_disi", note: "Köye taşındım" }, paymentMethod: "card",
    }),
    // Eski sipariş (yeni alanlar hiç yok)
    { _id: ORDER(3), user: USER(1), products: [], totalAmount: 90, city: "Devrek", phone: "05551112233", deliveryPoint: "boysDorm", deliveryPointName: "Erkek KYK Yurdu", status: "Teslim Edildi", createdAt: new Date() },
  ];
  let filter = null;
  t.mock.method(Order, "find", (f) => { filter = f; return chain(docs); });
  const res = response();
  await getUserOrders({ user: { _id: USER(1), role: "customer" }, query: { userId: USER(9) } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(String(filter.user), USER(1), "müşteri başkasının siparişini okuyamaz");
  const [address, cancelled, legacy] = res.body.orders;
  for (const order of res.body.orders) {
    for (const key of CUSTOMER_KEYS) assert.ok(key in order, `${order.orderId}: ${key}`);
    const text = JSON.stringify(order);
    assert.ok(!("courier" in order) && !text.includes("Ali") && !text.includes(COURIER(1)), "kurye müşteriye gitmez");
    assert.ok(!text.includes(ADMIN._id), "yönetici kimliği müşteriye gitmez");
    assert.ok(!("deliveryOutcome" in order) && !text.includes("iç not"), "iç not müşteriye gitmez");
    assert.ok(!("callbackConfirmedBy" in order));
  }
  assert.equal(address.deliveryType, "address");
  assert.deepEqual(address.deliveryZone, { id: "devrek", name: "Devrek", type: "ilce" });
  assert.equal(address.deliveryAddress.street, "Atatürk Cd.");
  assert.equal(address.deliveryAddress.neighborhood, "Cumhuriyet", "mobil: deliveryAddress.neighborhood");
  assert.deepEqual(address.deliveryAddress.location, { lat: 41.2207, lng: 31.9563 });
  assert.equal(address.deliveryFee, 60);
  assert.equal(address.productTotal, 100);
  assert.equal(address.totalAmount, 160);
  assert.equal(address.deliveryPointName, "Cumhuriyet Mah. · Atatürk Cd. No:3");
  assert.equal(address.needsCallback, true);
  assert.equal(new Date(address.callbackConfirmedAt).toISOString(), confirmedAt.toISOString());
  assert.equal(address.deliveryOutcomeLabel, "Teslim edilemedi: Adres bulunamadı");
  assert.equal(address.cancelReasonLabel, "");
  assert.equal(address.cancelReasonNote, "");

  assert.equal(cancelled.deliveryType, "point");
  assert.equal(cancelled.deliveryAddress, null);
  assert.equal(cancelled.needsCallback, false);
  assert.equal(cancelled.callbackConfirmedAt, null);
  assert.equal(cancelled.deliveryOutcomeLabel, "");
  assert.equal(cancelled.cancelReasonLabel, "Adresime teslimat yok");
  assert.equal(cancelled.cancelReasonNote, "Köye taşındım");

  assert.deepEqual(
    { needsCallback: legacy.needsCallback, callbackConfirmedAt: legacy.callbackConfirmedAt, deliveryOutcomeLabel: legacy.deliveryOutcomeLabel, cancelReasonLabel: legacy.cancelReasonLabel, cancelReasonNote: legacy.cancelReasonNote, deliveryFee: legacy.deliveryFee, productTotal: legacy.productTotal, deliveryZone: legacy.deliveryZone },
    { needsCallback: false, callbackConfirmedAt: null, deliveryOutcomeLabel: "", cancelReasonLabel: "", cancelReasonNote: "", deliveryFee: 0, productTotal: 90, deliveryZone: null },
  );
  // Mevcut alanlar korunur
  for (const key of ["_id", "orderId", "products", "status", "paymentMethod", "paymentMethodLabel", "createdAt", "deliveryPoint"]) assert.ok(key in address, key);
  JSON.stringify(res.body); // serileştirilebilir
});

// ── Yönetici listesi ─────────────────────────────────────────────────────────

test("yönetici listesi: needsCallback, callbackConfirmedAt, deliveryOutcome ve courier döner (eski siparişte güvenli varsayılan)", () => {
  const at = new Date();
  const [group] = groupOrdersByUser([
    {
      _id: ORDER(1), user: { _id: USER(1), name: "Ayşe" }, products: [], totalAmount: 100, status: "İptal Edildi", phone: "05551112233",
      needsCallback: true, callbackConfirmedAt: null,
      deliveryOutcome: { code: "cevap_yok", label: "Müşteriye ulaşılamadı", note: "3 kez arandı", at, by: new mongoose.Types.ObjectId(ADMIN._id) },
      courier: { id: COURIER(1), name: "Ali" },
    },
    { _id: ORDER(2), user: { _id: USER(1), name: "Ayşe" }, products: [], totalAmount: 50, status: "Hazırlanıyor", phone: "05551112233" },
  ]);
  const [failed, legacy] = group.orders;
  assert.equal(failed.needsCallback, true);
  assert.equal(failed.callbackConfirmedAt, null);
  assert.deepEqual(failed.deliveryOutcome, { code: "cevap_yok", label: "Müşteriye ulaşılamadı", note: "3 kez arandı", at, by: ADMIN._id });
  assert.equal(failed.deliveryOutcomeLabel, "Teslim edilemedi: Müşteriye ulaşılamadı");
  assert.deepEqual(failed.courier, { id: COURIER(1), name: "Ali" });
  assert.equal(legacy.needsCallback, false);
  assert.equal(legacy.callbackConfirmedAt, null);
  assert.equal(legacy.deliveryOutcome, null);
  assert.equal(legacy.courier, null);
});

// ── Pano özeti ───────────────────────────────────────────────────────────────

test("pano özeti: teslim edilemeyenler bölge ve nedene göre (yeni anahtar), teyit bekleyen sayısı; mevcut anahtarlar aynı", async (t) => {
  assert.deepEqual(summarizeFailedDeliveries([]), { total: 0, byReason: {}, byZone: [] });
  const calls = [];
  t.mock.method(Order, "aggregate", async (pipeline) => {
    calls.push(pipeline);
    if (!pipeline.some((stage) => stage.$facet)) return [];
    return [{
      totals: [], byStatus: [], byDorm: [], byZone: [], series: [], topProducts: [], manual: [],
      failedDeliveries: [
        { _id: { zone: "devrek", code: "adres_bulunamadi" }, name: "Devrek", count: 2 },
        { _id: { zone: "devrek", code: "cevap_yok" }, name: "Devrek", count: 1 },
        { _id: { zone: "girlsDorm", code: "cevap_yok" }, name: "Kız KYK Yurdu", count: 1 },
      ],
    }];
  });
  const counts = [];
  t.mock.method(Order, "countDocuments", async (filter) => { counts.push(filter); return filter.needsCallback ? 4 : 0; });
  t.mock.method(Order, "find", () => chain([]));
  t.mock.method(Product, "countDocuments", async () => 0);
  t.mock.method(SupportRequest, "countDocuments", async () => 0);
  t.mock.method(User, "countDocuments", async () => 0);

  const summary = await computeDashboardSummary({ period: "7d" }, new Date("2026-10-23T12:00:00+03:00"));
  const facet = calls[0].find((stage) => stage.$facet).$facet;
  assert.ok(facet.failedDeliveries[0].$match["deliveryOutcome.code"]);
  assert.deepEqual(summary.failedDeliveries, {
    total: 4,
    byReason: { adres_bulunamadi: 2, cevap_yok: 2 },
    byZone: [
      { zoneId: "devrek", name: "Devrek", count: 3, byReason: { adres_bulunamadi: 2, cevap_yok: 1 } },
      { zoneId: "girlsDorm", name: "Kız KYK Yurdu", count: 1, byReason: { cevap_yok: 1 } },
    ],
  });
  assert.deepEqual(summary.callbacks, { pending: 4 });
  const callbackFilter = counts.find((f) => f.needsCallback);
  assert.deepEqual(callbackFilter, { needsCallback: true, callbackConfirmedAt: null, status: { $in: ["Hazırlanıyor", "Yolda"] } });
  assert.deepEqual(Object.keys(summary.attention), ["delayedOrders", "preparingOrders", "activeOrders", "productsWithoutImage", "productsOutOfStock", "waitingSupport"]);
});

// ── Rotalar ──────────────────────────────────────────────────────────────────

test("rotalar: üç yeni sipariş uç noktası ve kurye uç noktaları yönetici korumalı", () => {
  const names = (router, method, path) => router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route.stack.map((layer) => layer.handle.name);
  for (const [path, handler] of [["/confirm-callback", "confirmCallback"], ["/delivery-failed", "markDeliveryFailed"], ["/assign-courier", "assignCourier"]]) {
    const stack = names(ordersRouter, "put", path);
    assert.ok(stack, path);
    assert.equal(stack[0], "protectRoute");
    assert.equal(stack[1], "adminRoute");
    assert.equal(stack.at(-1), handler);
  }
  assert.deepEqual(names(deliveryRouter, "get", "/admin/couriers"), ["protectRoute", "adminRoute", "adminGetCouriers"]);
  assert.deepEqual(names(deliveryRouter, "put", "/admin/couriers"), ["protectRoute", "adminRoute", "adminUpdateCouriers"]);
});
