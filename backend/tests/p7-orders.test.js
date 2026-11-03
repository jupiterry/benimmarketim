// Siparişler ekranı geliştirmeleri (p7): ilk sipariş teyidi kuralı (tekli / toplu durum ve alarm telefonu),
// personelin iç işaretleri ve notu (yönetici sipariş listesi), eksik ürünü muadille değiştirme (replace-item)
// ve alarm telefonu özetindeki ek adres / teyit alanları. Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Coupon from "../models/coupon.model.js";
import Mission from "../models/mission.model.js";
import Referral from "../models/referral.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import FlashSale from "../models/flashSale.model.js";
import {
  CALLBACK_REQUIRED_CODE,
  MANUAL_LINE_MESSAGE,
  SAME_PRODUCT_MESSAGE,
  SUBSTITUTE_STATUS_MESSAGE,
  USER_POPULATE_FIELDS,
  bulkUpdateOrderStatus,
  callbackBlocksStatusChange,
  getOrderAnalyticsData,
  groupOrdersByUser,
  replaceOrderItem,
  updateOrderStatus,
  userPopulate,
} from "../controllers/ordersAnalytics.controller.js";
import { ALARM_CALLBACK_MESSAGE, changeOrderStatusHandler } from "../controllers/orderAlarm.controller.js";
import router from "../routes/ordersAnalytics.route.js";
import { alarmAddressDetails, alarmFullAddress, toAlarmOrder } from "../services/orderAlarm.service.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const ORDER = (n) => hex("6ac8bc", n);
const USER = (n) => hex("507f1f77bcf8", n);
const LINE = (n) => hex("11aa22bb", n);
const PRODUCT = (n) => hex("99cc", n);
const ADMIN = { _id: hex("ad", 1), role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (body = {}) => {
  const emits = [];
  const io = { to() { const target = { to: () => target, emit: (event, payload) => emits.push({ event, payload }) }; return target; } };
  return { emits, req: { body, params: {}, query: {}, user: ADMIN, method: "PUT", originalUrl: "/api/orders-analytics/x", app: { get: (key) => (key === "io" ? io : null) } } };
};
const chain = (result, record = {}) => {
  const c = {
    select(arg) { record.select = arg; return c; },
    populate(arg) { (record.populate ||= []).push(arg); return c; },
    sort() { return c; },
    limit() { return c; },
    lean: async () => result,
  };
  return c;
};

/** Durum değişikliğinin tüm yan etkileri taklit edilir (bekleyen gerçek veritabanı çağrısı kalmaz) */
const mockSideEffects = (t) => {
  const fx = { audits: [], coupons: 0 };
  t.mock.method(AdminAudit, "create", async (doc) => { fx.audits.push(doc); return doc; });
  t.mock.method(User, "find", () => chain([]));
  t.mock.method(Mission, "find", () => chain([]));
  t.mock.method(Order, "countDocuments", async () => 1);
  t.mock.method(Referral, "findOne", async () => null);
  t.mock.method(Coupon, "findOneAndUpdate", async () => { fx.coupons += 1; return null; });
  t.mock.method(Coupon, "updateOne", async () => ({}));
  return fx;
};

const statusDoc = (fields = {}) => ({
  _id: new mongoose.Types.ObjectId(ORDER(1)),
  user: new mongoose.Types.ObjectId(USER(1)),
  status: "Hazırlanıyor",
  statusHistory: [],
  couponCode: null,
  totalAmount: 120,
  deliveryPoint: "address",
  deliveryPointName: "Cumhuriyet Mah. · Atatürk Cd. No:5",
  needsCallback: true,
  callbackConfirmedAt: null,
  saves: [],
  async save() { this.saves.push(this.status); return this; },
  ...fields,
});

test.beforeEach(() => { mock.method(FlashSale, "find", () => ({ select: () => ({ lean: async () => [] }) })); });
test.afterEach(() => mock.restoreAll());

// ── Personel işaretleri ve notu ─────────────────────────────────────────────

test("staff flags: the admin list populate explicitly selects the select:false staff fields", async (t) => {
  const config = userPopulate();
  const fields = config.select.split(" ");
  assert.equal(config.select, USER_POPULATE_FIELDS);
  for (const field of ["name", "email", "avatar", "staffFlags", "staffNote"]) assert.ok(fields.includes(field), field);
  // Şemada select: false: varsayılan sorguda gelmez, bu seçimle gelir
  assert.equal(User.schema.path("staffFlags").options.select, false);
  assert.equal(User.schema.path("staffNote").options.select, false);
  const query = User.find({}).select(config.select);
  query._applyPaths();
  assert.equal(query._fields.staffFlags, 1);
  assert.equal(query._fields.staffNote, 1);
  const plain = User.find({});
  plain._applyPaths();
  assert.equal(plain._fields.staffFlags, 0, "varsayılan sorguda gizli kalır");

  // Liste sorgusu bu populate'ı kullanır
  const calls = [];
  t.mock.method(Order, "find", () => chain([], calls[calls.push({}) - 1]));
  t.mock.method(Order, "countDocuments", async () => 0);
  await getOrderAnalyticsData({ active: true });
  assert.equal(calls[0].populate[0].path, "user");
  assert.equal(calls[0].populate[0].select, USER_POPULATE_FIELDS);
});

test("staff flags: groupOrdersByUser adds normalized staffFlags and the note text (or null)", () => {
  const order = (n, user) => ({
    _id: new mongoose.Types.ObjectId(ORDER(n)), user, status: "Hazırlanıyor", city: "Devrek", phone: "05550000000", deliveryPoint: "girlsDorm",
    products: [{ _id: new mongoose.Types.ObjectId(LINE(n)), name: "Süt", quantity: 1, price: 40 }], totalAmount: 40, createdAt: new Date(),
  });
  const flagged = { _id: new mongoose.Types.ObjectId(USER(1)), name: "Ayşe", staffFlags: ["call_before", "bogus", "call_before", "pays_card"], staffNote: { text: "  Kapı zili bozuk  ", updatedAt: new Date() } };
  const plain = { _id: new mongoose.Types.ObjectId(USER(2)), name: "Ali" };
  const blankNote = { _id: new mongoose.Types.ObjectId(USER(3)), name: "Can", staffFlags: null, staffNote: { text: "   " } };
  const groups = groupOrdersByUser([
    order(1, flagged), order(2, plain), order(3, blankNote), order(4, { _id: new mongoose.Types.ObjectId(USER(4)), deleted: true }),
  ]);
  const byName = (name) => groups.find((group) => group.user.name === name).user;
  assert.deepEqual(byName("Ayşe").staffFlags, ["call_before", "pays_card"], "bilinmeyen ve tekrar edenler atılır");
  assert.equal(byName("Ayşe").staffNote, "Kapı zili bozuk");
  assert.deepEqual(byName("Ali").staffFlags, []);
  assert.equal(byName("Ali").staffNote, null);
  assert.deepEqual(byName("Can").staffFlags, []);
  assert.equal(byName("Can").staffNote, null, "boş not null");
  const deleted = byName("Silinmiş hesap");
  assert.deepEqual([deleted.staffFlags, deleted.staffNote, deleted.deleted], [[], null, true]);
});

// ── İlk sipariş teyidi: kural ───────────────────────────────────────────────

test("callback rule: only an unconfirmed callback order leaving Hazırlanıyor forwards is blocked", () => {
  const pending = { needsCallback: true, callbackConfirmedAt: null, status: "Hazırlanıyor" };
  assert.equal(callbackBlocksStatusChange(pending, "Yolda"), true);
  assert.equal(callbackBlocksStatusChange(pending, "Teslim Edildi"), true);
  assert.equal(callbackBlocksStatusChange(pending, "İptal Edildi"), false, "iptal her zaman serbest");
  assert.equal(callbackBlocksStatusChange({ ...pending, status: "Yolda" }, "Teslim Edildi"), false, "yola çıkmış sipariş teslim edilebilir");
  assert.equal(callbackBlocksStatusChange({ ...pending, status: "İptal Edildi" }, "Yolda"), true, "iptal edilmiş teyitsiz sipariş de teyitsiz yola çıkamaz");
  assert.equal(callbackBlocksStatusChange({ ...pending, status: "İptal Edildi" }, "Hazırlanıyor"), false, "iptalden hazırlığa dönmek serbest");
  assert.equal(callbackBlocksStatusChange({ ...pending, callbackConfirmedAt: new Date() }, "Yolda"), false);
  assert.equal(callbackBlocksStatusChange({ ...pending, needsCallback: false }, "Yolda"), false);
  assert.equal(callbackBlocksStatusChange({ status: "Hazırlanıyor" }, "Yolda"), false, "eski siparişte alan yok");
  assert.equal(callbackBlocksStatusChange(null, "Yolda"), false);
});

test("update-status: unconfirmed callback order → 409 CALLBACK_REQUIRED, nothing saved or audited", async (t) => {
  const fx = mockSideEffects(t);
  const order = statusDoc();
  t.mock.method(Order, "findById", async () => order);
  for (const body of [
    { orderId: ORDER(1), status: "Yolda", expectedStatus: "Hazırlanıyor" },
    { orderId: ORDER(1), status: "Teslim Edildi" },
    { orderId: ORDER(1), status: "Yolda", force: "true" },
    { orderId: ORDER(1), status: "Yolda", force: 1 },
  ]) {
    const { req, emits } = request(body);
    const res = response();
    await updateOrderStatus(req, res);
    assert.equal(res.statusCode, 409, JSON.stringify(body));
    assert.equal(res.body.code, CALLBACK_REQUIRED_CODE);
    assert.equal(res.body.status, "Hazırlanıyor");
    assert.equal(res.body.orderId, ORDER(1));
    assert.match(res.body.message, /teyit/);
    assert.equal(emits.length, 0);
  }
  assert.equal(order.saves.length, 0);
  assert.equal(order.statusHistory.length, 0);
  assert.equal(fx.audits.length, 0);

  // expectedStatus çakışması teyitten önce gelir (mevcut durum çakışması karışmasın)
  const moved = statusDoc({ status: "Yolda" });
  t.mock.method(Order, "findById", async () => moved);
  const conflict = response();
  await updateOrderStatus(request({ orderId: ORDER(1), status: "Teslim Edildi", expectedStatus: "Hazırlanıyor" }).req, conflict);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.code, undefined);
  assert.equal(conflict.body.status, "Yolda");
});

test("update-status: force writes 'teyitsiz yola çıkarıldı' to the audit; cancel and confirmed orders pass", async (t) => {
  const fx = mockSideEffects(t);
  let order = statusDoc();
  t.mock.method(Order, "findById", async () => order);
  const forced = response();
  await updateOrderStatus(request({ orderId: ORDER(1), status: "Yolda", expectedStatus: "Hazırlanıyor", force: true }).req, forced);
  await tick();
  assert.equal(forced.statusCode, 200);
  assert.equal(order.status, "Yolda");
  assert.equal(fx.audits.length, 1);
  assert.equal(fx.audits[0].action, "Sipariş teyitsiz yola çıkarıldı");
  assert.deepEqual(fx.audits[0].changes, [
    { label: "Durum", from: "Hazırlanıyor", to: "Yolda" },
    { label: "Telefon teyidi", from: "Bekliyor", to: "Teyitsiz yola çıkarıldı" },
  ]);

  order = statusDoc();
  const cancel = response();
  await updateOrderStatus(request({ orderId: ORDER(1), status: "İptal Edildi" }).req, cancel);
  await tick();
  assert.equal(cancel.statusCode, 200, "iptal teyit beklemez");
  assert.equal(fx.audits[1].action, "Sipariş durumu değiştirildi");

  order = statusDoc({ callbackConfirmedAt: new Date() });
  const confirmed = response();
  await updateOrderStatus(request({ orderId: ORDER(1), status: "Yolda", force: true }).req, confirmed);
  await tick();
  assert.equal(confirmed.statusCode, 200);
  assert.equal(fx.audits[2].action, "Sipariş durumu değiştirildi", "teyitli siparişte force işlem kaydını değiştirmez");
  assert.equal(fx.audits[2].changes.length, 1);
});

test("bulk-status: unconfirmed orders are skipped with reason 'callback', the rest move on", async (t) => {
  const fx = mockSideEffects(t);
  const blocked = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(1)) });
  const ready = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(2)), needsCallback: false });
  const confirmed = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(3)), callbackConfirmedAt: new Date() });
  t.mock.method(Order, "find", async () => [blocked, ready, confirmed]);
  const res = response();
  await bulkUpdateOrderStatus(request({ orderIds: [ORDER(1), ORDER(2), ORDER(3)], status: "Yolda", expectedStatus: "Hazırlanıyor" }).req, res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    updated: 2,
    skipped: [{ orderId: ORDER(1), reason: "callback", code: CALLBACK_REQUIRED_CODE, status: "Hazırlanıyor" }],
  });
  assert.equal(blocked.status, "Hazırlanıyor");
  assert.equal(blocked.saves.length, 0);
  assert.deepEqual([ready.status, confirmed.status], ["Yolda", "Yolda"]);
  assert.equal(fx.audits.length, 2);
  assert.ok(fx.audits.every((audit) => audit.action === "Sipariş durumu değiştirildi (toplu)"));
});

test("bulk-status: nothing updated because of callbacks → 409 CALLBACK_REQUIRED with the skipped list; force moves them", async (t) => {
  const fx = mockSideEffects(t);
  let docs = [statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(1)) }), statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(2)), status: "Yolda" })];
  t.mock.method(Order, "find", async () => docs);
  const refused = response();
  await bulkUpdateOrderStatus(request({ orderIds: [ORDER(1), ORDER(2)], status: "Yolda" }).req, refused);
  assert.equal(refused.statusCode, 409);
  assert.equal(refused.body.code, CALLBACK_REQUIRED_CODE);
  assert.equal(refused.body.updated, 0);
  assert.deepEqual(refused.body.skipped.map((entry) => entry.reason), ["callback", "unchanged"]);
  assert.equal(fx.audits.length, 0);

  docs = [statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(1)) }), statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(2)) })];
  const forced = response();
  await bulkUpdateOrderStatus(request({ orderIds: [ORDER(1), ORDER(2)], status: "Teslim Edildi", force: true }).req, forced);
  await tick();
  assert.equal(forced.statusCode, 200);
  assert.deepEqual(forced.body, { updated: 2, skipped: [] });
  assert.ok(docs.every((doc) => doc.status === "Teslim Edildi"));
  assert.deepEqual(fx.audits.map((audit) => audit.action), ["Sipariş teyitsiz yola çıkarıldı (toplu)", "Sipariş teyitsiz yola çıkarıldı (toplu)"]);
  assert.equal(fx.audits[0].changes[1].to, "Teyitsiz yola çıkarıldı");
});

// ── Alarm telefonu ──────────────────────────────────────────────────────────

test("alarm phone: an unconfirmed callback order cannot be advanced (409 + clear message); confirmed can", async (t) => {
  const fx = mockSideEffects(t);
  let order = statusDoc();
  t.mock.method(Order, "findById", async () => order);
  const device = { createdBy: new mongoose.Types.ObjectId(USER(9)), name: "Kasa" };
  const run = async (status) => {
    const res = response();
    await changeOrderStatusHandler({ params: { orderId: ORDER(1) }, body: { status }, alarmDevice: device, app: { get: () => null } }, res);
    return res;
  };
  for (const status of ["Yolda", "Teslim Edildi"]) {
    const res = await run(status);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { success: false, code: CALLBACK_REQUIRED_CODE, status: "Hazırlanıyor", message: ALARM_CALLBACK_MESSAGE });
  }
  assert.equal(order.saves.length, 0);
  assert.match(ALARM_CALLBACK_MESSAGE, /panelde/);

  order = statusDoc({ callbackConfirmedAt: new Date() });
  const ok = await run("Yolda");
  await tick();
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { success: true, order: { id: ORDER(1), status: "Yolda" } });
  assert.equal(fx.audits.length, 1);
});

test("alarm summary: additive address details, full address, maps link and callback state", () => {
  const base = {
    _id: new mongoose.Types.ObjectId(ORDER(5)), user: new mongoose.Types.ObjectId(USER(5)), status: "Hazırlanıyor", createdAt: new Date("2026-11-02T18:00:00Z"),
    products: [{ name: "Süt", quantity: 2, price: 20 }], totalAmount: 80, subtotalAmount: 80, city: "Devrek", phone: "05551112233",
    note: "Zil çalışmıyor", paymentMethod: "cash",
  };
  const address = toAlarmOrder({
    ...base,
    deliveryPoint: "address", deliveryPointName: "Cumhuriyet Mah. · Atatürk Cd. No:5",
    deliveryZone: { id: "devrek", name: "Devrek", type: "ilce" },
    deliveryAddress: {
      zoneId: "devrek", zoneName: "Devrek", neighborhood: "Cumhuriyet Mahallesi", street: "Atatürk Cd.", buildingNo: "5", buildingName: "Gül Apt.",
      floor: "2", apartment: "4", directions: "Eczanenin üstü", location: { lat: 41.2195, lng: 31.9512 },
    },
    needsCallback: true, callbackConfirmedAt: null,
  }, "Ayşe");
  // Eski alanlar aynen
  assert.equal(address.address, "Cumhuriyet Mah. · Atatürk Cd. No:5 · Devrek");
  assert.equal(address.note, "Zil çalışmıyor");
  assert.equal(address.customerName, "Ayşe");
  // Ek alanlar
  assert.deepEqual(address.addressDetails, {
    zoneName: "Devrek", neighborhood: "Cumhuriyet Mahallesi", street: "Atatürk Cd.", buildingNo: "5", buildingName: "Gül Apt.",
    floor: "2", apartment: "4", directions: "Eczanenin üstü", location: { lat: 41.2195, lng: 31.9512 },
  });
  assert.equal(address.fullAddress, "Cumhuriyet Mah. Atatürk Cd. No:5, Gül Apt., Kat 2 · Daire 4, Devrek");
  assert.equal(address.directions, "Eczanenin üstü");
  assert.equal(address.mapsUrl, "https://www.google.com/maps/search/?api=1&query=41.2195,31.9512");
  assert.deepEqual([address.needsCallback, address.callbackConfirmedAt, address.callbackPending], [true, null, true]);

  const confirmedAt = new Date("2026-11-02T18:05:00Z");
  const confirmed = toAlarmOrder({ ...base, deliveryPoint: "girlsDorm", deliveryPointName: "Kız KYK Yurdu", needsCallback: true, callbackConfirmedAt: confirmedAt });
  assert.equal(confirmed.addressDetails, null, "yurt siparişinde adres ayrıntısı yok");
  assert.equal(confirmed.fullAddress, confirmed.address);
  assert.equal(confirmed.directions, "");
  assert.equal(confirmed.mapsUrl, null);
  assert.deepEqual([confirmed.needsCallback, confirmed.callbackConfirmedAt, confirmed.callbackPending], [true, confirmedAt.toISOString(), false]);

  const legacy = toAlarmOrder({ ...base, deliveryPoint: "boysDorm", deliveryPointName: "" });
  assert.deepEqual([legacy.needsCallback, legacy.callbackConfirmedAt, legacy.callbackPending], [false, null, false]);
  const delivered = toAlarmOrder({ ...base, status: "Teslim Edildi", needsCallback: true });
  assert.equal(delivered.callbackPending, false, "teslim edilmiş siparişte teyit beklenmez");
  // Panelde "yine de" yola çıkarılmış teyitsiz sipariş telefondan teslim edilebilir: callbackPending yalnızca Hazırlanıyor'da
  const forced = toAlarmOrder({ ...base, status: "Yolda", needsCallback: true, callbackConfirmedAt: null });
  assert.deepEqual([forced.needsCallback, forced.callbackConfirmedAt, forced.callbackPending], [true, null, false]);

  // Konumsuz, kat/daire bilgisi eksik adres
  const details = alarmAddressDetails({ deliveryAddress: { neighborhood: "Yeni", street: "Okul Sk.", buildingNo: "", floor: "", apartment: "3", location: { lat: null, lng: null } } });
  assert.equal(details.location, null);
  assert.equal(alarmFullAddress(details), "Yeni Mah. Okul Sk., Daire 3");
  assert.equal(alarmAddressDetails({ deliveryAddress: {} }), null);
  assert.equal(alarmFullAddress(null), "");
});

// ── Muadille değiştirme ─────────────────────────────────────────────────────

const line = (n, name, quantity, price, extra = {}) => ({
  _id: new mongoose.Types.ObjectId(LINE(n)), product: new mongoose.Types.ObjectId(PRODUCT(n)), name, quantity, price, isManual: false, ...extra,
});
const itemDoc = (fields = {}) => ({
  _id: new mongoose.Types.ObjectId(ORDER(7)),
  user: new mongoose.Types.ObjectId(USER(7)),
  status: "Hazırlanıyor",
  totalAmount: 82.3,
  subtotalAmount: 82.3,
  deliveryPointName: "Erkek KYK Yurdu",
  products: [line(1, "Kakaolu Süt", 3, 11.1), line(2, "Ekmek", 2, 24.5)],
  increments: 0,
  saves: [],
  increment() { this.increments += 1; },
  async save(options) { this.saves.push(options); return this; },
  ...fields,
});
const mockCatalog = (t, products, weekly = []) => {
  t.mock.method(WeeklyProduct, "find", () => chain(weekly));
  t.mock.method(Product, "find", () => chain(products));
};
const pinar = (fields = {}) => ({ _id: new mongoose.Types.ObjectId(PRODUCT(30)), name: "Pınar Kakaolu Süt", price: 12.35, category: "Süt", ...fields });

test("replace-item: validation, missing order, status and same-product guards", async (t) => {
  mockSideEffects(t);
  const run = async (body) => { const res = response(); await replaceOrderItem(request(body).req, res); return res; };
  assert.equal((await run({ orderId: ORDER(7), productId: PRODUCT(30) })).statusCode, 400, "satır yok");
  assert.equal((await run({ orderId: ORDER(7), lineId: LINE(1) })).statusCode, 400, "ürün yok");
  assert.equal((await run({ orderId: "abc", lineId: LINE(1), productId: PRODUCT(30) })).statusCode, 400);
  assert.equal((await run({ orderId: ORDER(7), lineId: LINE(1), productId: "süt" })).statusCode, 400);

  t.mock.method(Order, "findById", async () => null);
  assert.equal((await run({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(30) })).statusCode, 404);

  const onRoad = itemDoc({ status: "Yolda" });
  t.mock.method(Order, "findById", async () => onRoad);
  const road = await run({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(30) });
  assert.equal(road.statusCode, 409);
  assert.deepEqual(road.body, { message: SUBSTITUTE_STATUS_MESSAGE, status: "Yolda" });

  const order = itemDoc();
  t.mock.method(Order, "findById", async () => order);
  const unknownLine = await run({ orderId: ORDER(7), lineId: LINE(9), productId: PRODUCT(30) });
  assert.equal(unknownLine.statusCode, 409, "satır başka yerde değişmiş");
  mockCatalog(t, [{ _id: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Kakaolu Süt", price: 11.1 }]);
  const same = await run({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(1) });
  assert.equal(same.statusCode, 400);
  assert.equal(same.body.message, SAME_PRODUCT_MESSAGE);
  // Aynı ürünün fiyatı bu arada değişmiş olsa da muadil sayılmaz: satır yeniden fiyatlanmaz, katalog okunmaz
  const sameReads = [];
  t.mock.method(Product, "find", () => { sameReads.push(1); return chain([{ _id: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Kakaolu Süt", price: 14 }]); });
  const repriced = await run({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(1).toUpperCase() });
  assert.equal(repriced.statusCode, 400);
  assert.equal(repriced.body.message, SAME_PRODUCT_MESSAGE);
  assert.equal(sameReads.length, 0);
  assert.deepEqual(order.products.map((p) => [p.name, p.price]), [["Kakaolu Süt", 11.1], ["Ekmek", 24.5]]);
  mockCatalog(t, []);
  assert.equal((await run({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(31) })).statusCode, 404, "muadil ürün yok");
  assert.equal(order.saves.length, 0);

  // Elle eklenen tutar ("Özel Ekleme") katalog ürünü değildir: muadili olmaz, katalog hiç okunmaz
  const manual = itemDoc({ products: [line(1, "Kakaolu Süt", 3, 11.1), line(2, "Poşet", 1, 2, { isManual: true })] });
  t.mock.method(Order, "findById", async () => manual);
  const catalogReads = [];
  t.mock.method(Product, "find", () => { catalogReads.push(1); return chain([pinar()]); });
  const refused = await run({ orderId: ORDER(7), lineId: LINE(2), productId: PRODUCT(30) });
  assert.equal(refused.statusCode, 400);
  assert.equal(refused.body.message, MANUAL_LINE_MESSAGE);
  assert.equal(catalogReads.length, 0);
  assert.equal(manual.saves.length, 0);
});

test("replace-item: one save swaps the line in place with the same quantity; totals change by the kuruş-exact difference", async (t) => {
  const fx = mockSideEffects(t);
  const order = itemDoc();
  t.mock.method(Order, "findById", async () => order);
  mockCatalog(t, [pinar()]);
  const { req, emits } = request({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(30) });
  const res = response();
  await replaceOrderItem(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(
    [res.body.success, res.body.removedProduct, res.body.addedProduct, res.body.quantity, res.body.priceDifference],
    [true, "Kakaolu Süt", "Pınar Kakaolu Süt", 3, 3.75],
  );
  assert.equal(res.body.message, "Kakaolu Süt yerine Pınar Kakaolu Süt konuldu");
  assert.deepEqual(order.products.map((p) => [p.name, p.quantity, p.price]), [["Pınar Kakaolu Süt", 3, 12.35], ["Ekmek", 2, 24.5]], "aynı sırada");
  assert.equal(String(order.products[0].product), PRODUCT(30));
  assert.equal(order.products[0].priceSource, "list");
  assert.equal(order.products[0].originalPrice, 12.35);
  // 82,30 + 3 × (12,35 − 11,10) = 86,05 (kayan nokta kırıntısı yok)
  assert.equal(order.totalAmount, 86.05);
  assert.equal(order.subtotalAmount, 86.05);
  assert.equal(order.increments, 1, "sürüm denetimli kayıt");
  assert.equal(order.saves.length, 1);
  assert.equal(fx.audits.length, 1);
  assert.equal(fx.audits[0].action, "Siparişte ürün muadille değiştirildi");
  assert.deepEqual(fx.audits[0].changes, [
    { label: "Yerine", from: "Kakaolu Süt ×3 (₺33,30)", to: "Pınar Kakaolu Süt ×3 (₺37,05)" },
    { label: "Toplam", from: "₺82,30", to: "₺86,05" },
  ]);
  assert.equal(emits.length, 1);
  assert.equal(emits[0].event, "orderUpdated");
  assert.equal(emits[0].payload.kind, "items");
});

test("replace-item: cheaper substitute lowers the total; delivery fee stays locked; same product + price merges", async (t) => {
  mockSideEffects(t);
  const order = itemDoc({ totalAmount: 122.3, productTotal: 82.3, deliveryFee: 40, subtotalAmount: 0 });
  t.mock.method(Order, "findById", async () => order);
  mockCatalog(t, [pinar({ price: 15, isDiscounted: true, discountedPrice: 10.45 })]);
  const res = response();
  await replaceOrderItem(request({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(30) }).req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.priceDifference, -1.95);
  assert.equal(order.products[0].price, 10.45);
  assert.equal(order.products[0].priceSource, "discount");
  assert.equal(order.productTotal, 80.35);
  assert.equal(order.totalAmount, 120.35, "teslimat ücreti kilitli");
  assert.equal(order.subtotalAmount, 0, "ara toplamı olmayan sipariş ara toplam kazanmaz");

  // Muadil zaten siparişte aynı fiyattan varsa satırlar birleşir
  const merge = itemDoc({ products: [line(1, "Kakaolu Süt", 3, 11.1), line(30, "Pınar Kakaolu Süt", 1, 12.35)], totalAmount: 45.65, subtotalAmount: 45.65 });
  t.mock.method(Order, "findById", async () => merge);
  mockCatalog(t, [pinar()]);
  const merged = response();
  await replaceOrderItem(request({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(30) }).req, merged);
  assert.equal(merged.statusCode, 200);
  assert.deepEqual(merge.products.map((p) => [p.name, p.quantity]), [["Pınar Kakaolu Süt", 4]]);
  assert.equal(merge.totalAmount, 49.4);

  // Birleşince satır sınırı aşılıyorsa 400, kayıt yok
  const full = itemDoc({ products: [line(1, "Kakaolu Süt", 3, 11.1), line(30, "Pınar Kakaolu Süt", 998, 12.35)] });
  t.mock.method(Order, "findById", async () => full);
  const over = response();
  await replaceOrderItem(request({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(30) }).req, over);
  assert.equal(over.statusCode, 400);
  assert.equal(full.saves.length, 0);
});

test("replace-item: a concurrent change (VersionError) → 409, nothing audited", async (t) => {
  const fx = mockSideEffects(t);
  const order = itemDoc();
  order.save = async () => { throw new mongoose.Error.VersionError({ _doc: { _id: order._id } }, 2, ["products"]); };
  t.mock.method(Order, "findById", async () => order);
  mockCatalog(t, [pinar()]);
  const res = response();
  await replaceOrderItem(request({ orderId: ORDER(7), lineId: LINE(1), productId: PRODUCT(30) }).req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(fx.audits.length, 0);
});

test("replace-item route is admin-only and wired to the controller", () => {
  const layer = router.stack.find((entry) => entry.route?.path === "/replace-item");
  assert.ok(layer, "rota var");
  assert.deepEqual(Object.keys(layer.route.methods), ["put"]);
  const names = layer.route.stack.map((entry) => entry.handle.name);
  assert.deepEqual(names, ["protectRoute", "adminRoute", "replaceOrderItem"]);
});
