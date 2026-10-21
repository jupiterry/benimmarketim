// Siparişler ekranı (yönetici) backend'i: liste eklentileri (ids, q, customerStats, silinmiş hesap,
// lineId), durum hattı (expectedStatus, toplu işlem eşitliği), ürün düzenlemeleri, teslimat notu,
// silme ve adminRoom "orderUpdated" olayı. Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Coupon from "../models/coupon.model.js";
import Mission from "../models/mission.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import {
  getOrderAnalyticsData,
  groupOrdersByUser,
  attachCustomerStats,
  buildOrderSearchFilter,
  foldTurkish,
  userPopulate,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  updateDeliveryTracking,
  addCustomItemToOrder,
  addProductToOrder,
  removeItemFromOrder,
  updateItemQuantity,
  toggleManualFlag,
  deleteOrder,
  emitOrderUpdated,
  releaseCouponForOrder,
  grantReferralRewardIfDelivered,
} from "../controllers/ordersAnalytics.controller.js";
import router, { parseOrderListExtras, parseOrderListQuery, getOrdersList } from "../routes/ordersAnalytics.route.js";
import { resolveEffectiveUnitPrice } from "../services/order.service.js";
import { waitForPendingChange, waiterCount } from "../services/orderAlarm.service.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const ORDER = (n) => hex("6ac8bc", n);
const USER = (n) => hex("507f1f77bcf8", n);
const LINE = (n) => hex("11aa22bb", n);
const PRODUCT = (n) => hex("99cc", n);
const ADMIN = { _id: hex("ad", 1), role: "admin" };
const DAY = 24 * 60 * 60 * 1000;
const tick = () => new Promise((resolve) => setImmediate(resolve));

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
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
      emit(event, payload) { emits.push({ rooms: ["*"], event, payload }); },
    },
  };
};
const request = (body = {}, extra = {}) => {
  const spy = ioSpy();
  return { spy, req: { body, params: {}, query: {}, user: ADMIN, method: "PUT", originalUrl: "/api/orders-analytics/x", app: { get: (key) => (key === "io" ? spy.io : null) }, ...extra } };
};

// Sorgu zinciri: select/populate/sort/limit kaydedilir, lean() sonucu döner
const chain = (result, record = {}) => {
  const c = {
    select(arg) { record.select = arg; return c; },
    populate(arg, select) { (record.populate ||= []).push({ arg, select }); return c; },
    sort(arg) { record.sort = arg; return c; },
    limit(n) { record.limit = n; return c; },
    lean: async () => (typeof result === "function" ? result(record) : result),
  };
  return c;
};
const mockFind = (t, resolve) => {
  const calls = [];
  t.mock.method(Order, "find", (filter) => {
    const call = { filter, limit: null };
    calls.push(call);
    return chain((record) => resolve(filter, { ...call, ...record }), call);
  });
  t.mock.method(Order, "countDocuments", async () => 500);
  return calls;
};

/**
 * Yan etkilerin tamamı taklit edilir (bekleyen gerçek veritabanı çağrısı kalmaz) ve kaydedilir:
 * işlem kaydı, müşteri bildirimi (User.find), görevler (Mission.find), referral (Order.countDocuments), kupon.
 */
const mockSideEffects = (t, { users = [] } = {}) => {
  const fx = { audits: [], pushes: [], missions: 0, referralChecks: [], coupons: [], userSearches: [] };
  t.mock.method(AdminAudit, "create", async (doc) => { fx.audits.push(doc); return doc; });
  t.mock.method(User, "find", (filter) => {
    if (filter?.pushNotificationsEnabled) fx.pushes.push(filter);
    else fx.userSearches.push(filter);
    return chain(filter?.pushNotificationsEnabled ? [] : users);
  });
  t.mock.method(Mission, "find", () => { fx.missions += 1; return chain([]); });
  t.mock.method(Order, "countDocuments", async (filter) => { fx.referralChecks.push(filter); return 1; });
  t.mock.method(Coupon, "findOneAndUpdate", async (filter, update) => { fx.coupons.push({ filter, update }); return null; });
  t.mock.method(Coupon, "updateOne", async () => ({}));
  return fx;
};

// Durum testleri için kaydedilebilir sipariş belgesi
const statusDoc = (fields = {}) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(ORDER(1)),
    user: new mongoose.Types.ObjectId(USER(1)),
    status: "Hazırlanıyor",
    statusHistory: [],
    couponCode: null,
    totalAmount: 120,
    deliveryPoint: "girlsDorm",
    deliveryPointName: "Kız KYK Yurdu",
    saves: [],
    async save(options) { this.saves.push({ options, where: this.$where ? { ...this.$where } : null }); return this; },
    ...fields,
  };
  return doc;
};

// Ürün düzenleme testleri için sipariş belgesi (satırların kalıcı _id'si var)
const line = (n, name, quantity, price, extra = {}) => ({ _id: new mongoose.Types.ObjectId(LINE(n)), product: new mongoose.Types.ObjectId(PRODUCT(n)), name, quantity, price, isManual: false, ...extra });
const itemDoc = (fields = {}) => ({
  _id: new mongoose.Types.ObjectId(ORDER(7)),
  user: new mongoose.Types.ObjectId(USER(7)),
  status: "Hazırlanıyor",
  totalAmount: 140,
  subtotalAmount: 140,
  deliveryPointName: "Erkek KYK Yurdu",
  products: [line(1, "Süt", 2, 40), line(2, "Ekmek", 3, 20)],
  increments: 0,
  saves: [],
  increment() { this.increments += 1; },
  async save(options) { this.saves.push(options); return this; },
  ...fields,
});

// Liste testleri için yalın sipariş kaydı
const leanOrder = (n, fields = {}) => ({
  _id: new mongoose.Types.ObjectId(ORDER(n)),
  user: { _id: new mongoose.Types.ObjectId(USER(n % 3)), name: `Müşteri ${n % 3}`, email: `m${n % 3}@x.com`, avatar: null },
  products: [{ _id: new mongoose.Types.ObjectId(LINE(n)), name: "Süt", quantity: 1, price: 40, product: { _id: new mongoose.Types.ObjectId(PRODUCT(1)), image: "img.png" } }],
  totalAmount: 40, status: "Teslim Edildi", city: "Devrek", phone: "05550000000", deliveryPoint: "girlsDorm",
  createdAt: new Date(Date.now() - n * DAY), updatedAt: new Date(Date.now() - n * DAY), ...fields,
});

// Sipariş alarmı telefonu gibi bekler; sinyal gelince bekleyenler listesinden çıkar
const alarmProbe = async () => {
  let closed = false;
  const done = waitForPendingChange(async () => [{ id: "x" }], ["x"], { waitSeconds: 30, recheckMs: 60000, isClosed: () => closed });
  await tick();
  await tick();
  return { close: () => { closed = true; }, done };
};

// ── Sorgu ayrıştırma ─────────────────────────────────────────────────────────

test("parseOrderListExtras: include, ids and q are parsed apart from parseOrderListQuery's 5 keys", () => {
  assert.equal(parseOrderListExtras({ include: "customerStats" }).includeCustomerStats, true);
  assert.equal(parseOrderListExtras({ include: "foo,customerStats" }).includeCustomerStats, true);
  assert.equal(parseOrderListExtras({ include: ["foo", "customerStats"] }).includeCustomerStats, true);
  assert.equal(parseOrderListExtras({ include: "customer" }).includeCustomerStats, false);
  // eski/kapsamlı ayrımı değişmez
  assert.deepEqual(Object.values(parseOrderListQuery({ include: "customerStats", ids: ORDER(1), q: "süt" })).filter(Boolean), []);
  assert.deepEqual(Object.keys(parseOrderListQuery({})), ["since", "before", "limit", "active", "updatedSince"]);

  const ids = parseOrderListExtras({ ids: ` ${ORDER(1)} , ${ORDER(1).toUpperCase()},bozuk,${ORDER(2)}` });
  assert.deepEqual(ids.ids, [ORDER(1), ORDER(2)]);
  assert.equal(ids.invalidIds, false);
  assert.deepEqual(parseOrderListExtras({ ids: [ORDER(3), `${ORDER(4)},${ORDER(5)}`] }).ids, [ORDER(3), ORDER(4), ORDER(5)]);
  const many = Array.from({ length: 70 }, (_, i) => ORDER(100 + i)).join(",");
  assert.equal(parseOrderListExtras({ ids: many }).ids.length, 50);
  assert.deepEqual(parseOrderListExtras({ ids: "bozuk,123" }), { ids: null, invalidIds: true, q: null, invalidQuery: false, includeCustomerStats: false });
  assert.equal(parseOrderListExtras({ ids: "" }).invalidIds, true);
  assert.equal(parseOrderListExtras({}).ids, null);

  assert.equal(parseOrderListExtras({ q: "  #6AC8BC  " }).q, "6AC8BC");
  assert.equal(parseOrderListExtras({ q: "ayşe    yılmaz" }).q, "ayşe yılmaz");
  assert.equal(parseOrderListExtras({ q: "x".repeat(80) }).q.length, 60);
  assert.equal(parseOrderListExtras({ q: "a" }).invalidQuery, true);
  assert.equal(parseOrderListExtras({ q: "#-" }).invalidQuery, true);
  assert.equal(parseOrderListExtras({ q: "--" }).invalidQuery, true);
  assert.equal(parseOrderListExtras({ q: { $ne: 1 } }).invalidQuery, true);
  assert.deepEqual([parseOrderListExtras({ q: "   " }).q, parseOrderListExtras({ q: "   " }).invalidQuery], [null, false]);
  assert.equal(parseOrderListExtras({ q: "12" }).q, "12");
});

test("GET /: 400 for unusable ids or q, before any query runs", async (t) => {
  const find = t.mock.method(Order, "find", () => { throw new Error("çalışmamalı"); });
  const badIds = response();
  await getOrdersList({ query: { ids: "abc,def" } }, badIds);
  assert.equal(badIds.statusCode, 400);
  assert.deepEqual(badIds.body, { message: "Geçersiz sipariş kimliği" });
  const shortQ = response();
  await getOrdersList({ query: { q: "a", limit: "50" } }, shortQ);
  assert.equal(shortQ.statusCode, 400);
  assert.deepEqual(shortQ.body, { message: "Arama en az 2 harf veya rakam içermeli" });
  assert.equal(find.mock.callCount(), 0);
});

test("GET /?ids: scoped list of exactly those orders with meta.ids, even next to limit/active", async (t) => {
  const calls = mockFind(t, () => [leanOrder(40), leanOrder(41)]);
  const aggregate = t.mock.method(Order, "aggregate", async () => []);
  const res = response();
  await getOrdersList({ query: { ids: `${ORDER(40)},${ORDER(41)}`, limit: "50", active: "1" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filter, { _id: { $in: [ORDER(40), ORDER(41)] } });
  assert.equal(res.body.dailyOrdersData, undefined);
  const { meta, usersOrders } = res.body.orderAnalyticsData;
  assert.equal(meta.ids, true);
  assert.equal(meta.search, undefined);
  assert.equal(meta.hasMore, false);
  assert.equal(meta.oldestCreatedAt, null);
  assert.equal(meta.count, 2);
  assert.equal(usersOrders.flatMap((group) => group.orders).length, 2);
  assert.equal(aggregate.mock.callCount(), 0, "include yoksa istatistik hesaplanmaz");
});

test("GET / without params keeps the legacy response; include=customerStats alone stays legacy", async (t) => {
  const calls = mockFind(t, () => [leanOrder(1)]);
  const pipelines = [];
  t.mock.method(Order, "aggregate", async (pipeline) => {
    pipelines.push(pipeline);
    return pipeline[0].$match.user ? [] : [{ _id: "2026-10-20", orders: 1, revenue: 40 }];
  });
  const legacy = response();
  await getOrdersList({ query: {} }, legacy);
  assert.deepEqual(calls[0].filter, {});
  assert.equal(legacy.body.orderAnalyticsData.meta, undefined);
  assert.ok(Array.isArray(legacy.body.dailyOrdersData));
  assert.equal(pipelines.length, 1, "yalnızca günlük özet aggregate'i");

  const withStats = response();
  await getOrdersList({ query: { include: "customerStats" } }, withStats);
  assert.ok(Array.isArray(withStats.body.dailyOrdersData));
  assert.equal(withStats.body.orderAnalyticsData.meta, undefined);
  assert.ok(pipelines.some((pipeline) => pipeline[0].$match.user), "istatistik aggregate'i çalıştı");
});

test("GET /?q: server search returns meta.search, hasMore from limit+1, limit capped at 100", async (t) => {
  const rows = [leanOrder(1), leanOrder(2), leanOrder(3)];
  const calls = mockFind(t, (filter, call) => rows.slice(0, call.limit ?? rows.length));
  mockSideEffects(t);
  t.mock.method(Order, "countDocuments", async () => 500);
  const res = response();
  await getOrdersList({ query: { q: "süt", limit: "2" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0].limit, 3);
  assert.ok(Array.isArray(calls[0].filter.$or));
  const { meta } = res.body.orderAnalyticsData;
  assert.equal(meta.search, true);
  assert.equal(meta.ids, undefined);
  assert.equal(meta.count, 2);
  assert.equal(meta.hasMore, true);
  assert.equal(meta.oldestCreatedAt, new Date(rows[1].createdAt).toISOString());

  const capped = response();
  await getOrdersList({ query: { q: "süt", limit: "500" } }, capped);
  assert.equal(calls[1].limit, 101);
  const defaults = response();
  await getOrdersList({ query: { q: "süt" } }, defaults);
  assert.equal(calls[2].limit, 51);
  assert.equal(defaults.body.orderAnalyticsData.meta.hasMore, false);
});

test("GET /: unexpected errors keep the old 500 shape", async (t) => {
  t.mock.method(Order, "countDocuments", async () => { throw new Error("bağlantı yok"); });
  const res = response();
  await getOrdersList({ query: { active: "1" } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Server error");
});

// ── Sunucu araması ──────────────────────────────────────────────────────────

test("buildOrderSearchFilter: order code suffix, full id and tolerant phone branches", async (t) => {
  const fx = mockSideEffects(t);
  const code = await buildOrderSearchFilter("#6AC8BC");
  const suffix = code.filter.$or.find((branch) => branch.$expr);
  assert.deepEqual(suffix.$expr.$regexMatch.input, { $toString: "$_id" });
  assert.equal(suffix.$expr.$regexMatch.regex, "6ac8bc$");

  const full = await buildOrderSearchFilter(ORDER(9).toUpperCase());
  assert.deepEqual(full.filter, { _id: ORDER(9) });

  const searchesBefore = fx.userSearches.length;
  const phone = await buildOrderSearchFilter("0555 123");
  const phoneRe = phone.filter.$or.find((branch) => branch.phone).phone;
  for (const stored of ["0555 123 45 67", "+90 (555) 123-4567", "5551234567"]) assert.ok(phoneRe.test(stored), stored);
  assert.equal(phoneRe.test("0555 999 12 34"), false);
  assert.ok(fx.userSearches.length > searchesBefore);
  const intl = await buildOrderSearchFilter("+90 555 123 45 67");
  assert.equal(intl.filter.$or.find((branch) => branch.phone).phone.source, "5\\D*5\\D*5\\D*1\\D*2\\D*3\\D*4\\D*5\\D*6\\D*7");
  // 3 rakam: telefon dalı yok
  assert.equal((await buildOrderSearchFilter("0555")).filter.$or.some((branch) => branch.phone), false);
});

test("buildOrderSearchFilter: Turkish-folded input matches names, coupon, tracking, point, products and notes", async (t) => {
  const fx = mockSideEffects(t, { users: [{ _id: USER(1) }, { _id: USER(2) }] });
  assert.equal(foldTurkish("Çağla İŞÇİ Işık"), "cagla isci isik");
  for (const input of ["Çağla", "cagla", "ÇAĞLA"]) {
    const { filter } = await buildOrderSearchFilter(input);
    const userFilter = fx.userSearches.at(-1);
    const nameRe = userFilter.$or[0].name;
    assert.equal(userFilter.$or[1].email, nameRe);
    for (const stored of ["Çağla Yılmaz", "cagla", "CAĞLA", "çağla"]) assert.ok(nameRe.test(stored), `${input} → ${stored}`);
    assert.deepEqual(filter.$or.find((branch) => branch.user), { user: { $in: [USER(1), USER(2)] } });
    for (const field of ["couponCode", "deliveryTracking", "deliveryPointName", "products.name", "note"]) {
      assert.ok(filter.$or.some((branch) => branch[field] instanceof RegExp), field);
    }
  }
  const isik = (await buildOrderSearchFilter("ışık")).filter.$or.find((branch) => branch.couponCode).couponCode;
  for (const stored of ["Işık", "ISIK", "ışık", "isik"]) assert.ok(isik.test(stored), stored);
});

test("buildOrderSearchFilter: regex characters are escaped and unsearchable text gives no filter", async (t) => {
  const fx = mockSideEffects(t);
  const re = (await buildOrderSearchFilter("a.*b")).filter.$or.find((branch) => branch.note).note;
  assert.equal(re.test("axxb"), false);
  assert.equal(re.test("not a.*b"), true);
  assert.equal((await buildOrderSearchFilter("(süt)")).filter.$or.find((branch) => branch.note).note.test("x (Süt) y"), true);
  const searches = fx.userSearches.length;
  assert.deepEqual(await buildOrderSearchFilter("--"), { filter: null });
  assert.deepEqual(await buildOrderSearchFilter(".."), { filter: null });
  assert.deepEqual(await buildOrderSearchFilter(""), { filter: null });
  assert.equal(fx.userSearches.length, searches, "aranamayan metin için kullanıcı sorgusu yapılmaz");
  await assert.rejects(getOrderAnalyticsData({ q: "--" }), (error) => error.statusCode === 400);
});

// ── Gruplama, silinmiş hesap, satır kimliği ──────────────────────────────────

test("populate keeps deleted accounts: the transform returns a placeholder with the REAL user id", () => {
  const config = userPopulate();
  assert.equal(config.path, "user");
  assert.equal(config.select, "name email avatar");
  const id = new mongoose.Types.ObjectId(USER(5));
  assert.deepEqual(config.transform(null, id), { _id: id, deleted: true });
  const doc = { _id: id, name: "Ayşe" };
  assert.equal(config.transform(doc, id), doc);
  assert.notEqual(userPopulate(), userPopulate(), "her sorgu kendi seçenek nesnesini alır");
});

test("list query selects userDeleted and populates user through the transform", async (t) => {
  const calls = mockFind(t, () => []);
  await getOrderAnalyticsData({ active: true });
  const record = calls[0];
  assert.ok(record.select.split(" ").includes("userDeleted"));
  assert.equal(record.populate[0].arg.path, "user");
  assert.equal(typeof record.populate[0].arg.transform, "function");
  assert.equal(record.populate[1].arg, "products.product");
});

test("groupOrdersByUser: deleted accounts stay separate customers; lineId, productId, userDeleted and address", () => {
  const deletedA = new mongoose.Types.ObjectId(USER(10));
  const deletedB = new mongoose.Types.ObjectId(USER(11));
  const groups = groupOrdersByUser([
    leanOrder(1, { user: { _id: deletedA, deleted: true }, status: "Hazırlanıyor", city: undefined }),
    leanOrder(2, { user: { _id: deletedB, deleted: true } }),
    leanOrder(3, { user: { _id: deletedA, deleted: true } }),
    leanOrder(4, { user: null }),
    leanOrder(5, { user: undefined }),
    leanOrder(6, { userDeleted: true }),
    leanOrder(7, { products: undefined }),
    leanOrder(8, { products: [{ name: "Eski satır", quantity: 1, price: 5, product: new mongoose.Types.ObjectId(PRODUCT(4)) }] }),
  ]);
  const byId = (id) => groups.find((group) => group.user.id === id);
  const a = byId(String(deletedA));
  assert.deepEqual(a.user, { id: String(deletedA), name: "Silinmiş hesap", email: null, avatar: null, phone: "05550000000", address: "", deleted: true });
  assert.equal(a.orders.length, 2, "aynı silinmiş hesabın siparişleri birlikte");
  assert.ok(a.orders.every((order) => order.userDeleted === true));
  assert.equal(byId(String(deletedB)).orders.length, 1, "farklı silinmiş hesaplar birleşmez");
  const orphans = groups.filter((group) => group.user.id === null);
  assert.equal(orphans.length, 2, "kullanıcı bağı olmayan her sipariş ayrı");
  assert.ok(orphans.every((group) => group.user.deleted === true && group.orders[0].userDeleted === true));

  const living = groups.find((group) => group.orders.some((order) => String(order.orderId) === ORDER(6)));
  assert.equal(living.user.deleted, undefined);
  assert.equal(living.user.name, "Müşteri 0");
  assert.equal(living.orders.find((order) => String(order.orderId) === ORDER(6)).userDeleted, true);
  assert.equal(living.user.address, "Devrek");

  assert.equal(groups.flatMap((group) => group.orders).length, 7, "ürünsüz sipariş atlanır");
  const first = a.orders[0].products[0];
  assert.equal(first.lineId, LINE(1));
  assert.equal(first.productId, PRODUCT(1));
  assert.equal(first.image, "img.png");
  const legacy = groups.flatMap((group) => group.orders).find((order) => String(order.orderId) === ORDER(8)).products[0];
  assert.equal(legacy.lineId, null);
  assert.equal(legacy.productId, PRODUCT(4));
});

// ── Müşteri istatistikleri ──────────────────────────────────────────────────

test("include=customerStats: one aggregate over the groups' real user ids, stats attached per group", async (t) => {
  mockFind(t, () => [leanOrder(1), leanOrder(2), leanOrder(4, { user: { _id: new mongoose.Types.ObjectId(USER(9)), deleted: true } })]);
  t.mock.method(Order, "exists", async () => null);
  const pipelines = [];
  t.mock.method(Order, "aggregate", async (pipeline) => {
    pipelines.push(pipeline);
    return [
      { _id: new mongoose.Types.ObjectId(USER(1)), orderCount: 5, cancelledCount: 1, deliveredCount: 3, totalSpent: 412.456, firstOrderId: new mongoose.Types.ObjectId(ORDER(90)), firstOrderAt: new Date("2025-01-02T10:00:00Z"), lastOrderAt: new Date("2026-10-20T10:00:00Z") },
      { _id: new mongoose.Types.ObjectId(USER(9)), orderCount: 1, cancelledCount: 0, deliveredCount: 0, totalSpent: 40, firstOrderId: new mongoose.Types.ObjectId(ORDER(4)), firstOrderAt: new Date("2026-10-17T10:00:00Z"), lastOrderAt: new Date("2026-10-17T10:00:00Z") },
    ];
  });
  const data = await getOrderAnalyticsData({ since: new Date(Date.now() - 30 * DAY), includeCustomerStats: true });
  assert.equal(pipelines.length, 1);
  const matched = pipelines[0][0].$match.user.$in.map(String).sort();
  assert.deepEqual(matched, [USER(1), USER(2), USER(9)].sort());
  assert.ok(pipelines[0][0].$match.user.$in.every((id) => id instanceof mongoose.Types.ObjectId));
  assert.deepEqual(pipelines[0][1], { $sort: { createdAt: 1 } });

  const one = data.usersOrders.find((group) => group.user.id === USER(1));
  assert.deepEqual(one.user.stats, {
    orderCount: 5, validCount: 4, cancelledCount: 1, deliveredCount: 3, totalSpent: 412.46,
    firstOrderId: ORDER(90), firstOrderAt: "2025-01-02T10:00:00.000Z", lastOrderAt: "2026-10-20T10:00:00.000Z",
  });
  assert.equal(data.usersOrders.find((group) => group.user.id === USER(9)).user.stats.firstOrderId, ORDER(4), "silinmiş hesabın da istatistiği var");
  assert.equal(data.usersOrders.find((group) => group.user.id === USER(2)).user.stats, undefined);
});

test("customer stats: a failing aggregate leaves the list intact; empty lists run no aggregate", async (t) => {
  mockFind(t, (filter) => (filter.updatedAt ? [] : [leanOrder(1)]));
  const aggregate = t.mock.method(Order, "aggregate", async () => { throw new Error("aggregate patladı"); });
  const data = await getOrderAnalyticsData({ active: true, includeCustomerStats: true });
  assert.equal(data.usersOrders.length, 1);
  assert.equal(data.usersOrders[0].user.stats, undefined);
  assert.equal(aggregate.mock.callCount(), 1);

  const idle = await getOrderAnalyticsData({ updatedSince: new Date(), includeCustomerStats: true });
  assert.deepEqual(idle.usersOrders, []);
  assert.equal(aggregate.mock.callCount(), 1, "30 sn'lik boş yenileme aggregate çalıştırmaz");
  assert.deepEqual(await attachCustomerStats([]), []);
  const orphanOnly = [{ user: { id: null, deleted: true }, orders: [] }];
  assert.equal(await attachCustomerStats(orphanOnly), orphanOnly);
  assert.equal(aggregate.mock.callCount(), 1);
});

// ── Tekli durum değişikliği ─────────────────────────────────────────────────

test("update-status: validation, CastError → 400 and missing order → 404", async (t) => {
  mockSideEffects(t);
  const run = async (body) => { const { req } = request(body); const res = response(); await updateOrderStatus(req, res); return res; };
  assert.equal((await run({ orderId: ORDER(1), status: "Kayıp" })).statusCode, 400);
  assert.equal((await run({ orderId: ORDER(1), status: "Yolda", expectedStatus: "Kayıp" })).statusCode, 400);
  assert.equal((await run({ status: "Yolda" })).statusCode, 400);
  assert.equal((await run({ orderId: { bad: true }, status: "Yolda" })).statusCode, 400);

  t.mock.method(Order, "findById", async (id) => { throw new mongoose.Error.CastError("ObjectId", id, "_id"); });
  const cast = await run({ orderId: "order-1", status: "Yolda" });
  assert.equal(cast.statusCode, 400);
  assert.deepEqual(cast.body, { message: "Geçersiz sipariş kimliği" });

  t.mock.method(Order, "findById", async () => null);
  const missing = await run({ orderId: ORDER(1), status: "Yolda" });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { message: "Sipariş bulunamadı!" });
});

test("update-status: same status is a true no-op (no history, push, socket, audit)", async (t) => {
  const fx = mockSideEffects(t);
  const order = statusDoc({ status: "Yolda" });
  t.mock.method(Order, "findById", async () => order);
  const { req, spy } = request({ orderId: ORDER(1), status: "Yolda", expectedStatus: "Hazırlanıyor" });
  const res = response();
  await updateOrderStatus(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.unchanged, true);
  assert.equal(res.body.message, "Sipariş zaten bu durumda");
  assert.equal(order.saves.length, 0);
  assert.equal(order.statusHistory.length, 0);
  assert.equal(req.auditRecorded, true);
  assert.equal(spy.emits.length, 0);
  assert.equal(fx.pushes.length, 0);
  assert.equal(fx.audits.length, 0);
});

test("update-status: expectedStatus mismatch → 409 with the current status, nothing saved", async (t) => {
  const fx = mockSideEffects(t);
  const order = statusDoc({ status: "İptal Edildi" });
  t.mock.method(Order, "findById", async () => order);
  const { req, spy } = request({ orderId: ORDER(1), status: "Yolda", expectedStatus: "Hazırlanıyor" });
  const res = response();
  await updateOrderStatus(req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "Sipariş durumu bu arada değişti");
  assert.equal(res.body.status, "İptal Edildi");
  assert.equal(order.saves.length, 0);
  assert.equal(spy.emits.length, 0);
  assert.equal(fx.audits.length, 0);
});

test("update-status: a change saves conditionally, audits, notifies and emits the unchanged payload", async (t) => {
  const fx = mockSideEffects(t);
  const order = statusDoc();
  t.mock.method(Order, "findById", async () => order);
  const { req, spy } = request({ orderId: ORDER(1), status: "Yolda", expectedStatus: "Hazırlanıyor" });
  const res = response();
  await updateOrderStatus(req, res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Sipariş durumu başarıyla güncellendi!");
  assert.equal(res.body.order, order);
  assert.deepEqual(order.saves[0].options, { validateModifiedOnly: true });
  assert.deepEqual(order.saves[0].where, { status: "Hazırlanıyor" }, "kayıt okunan duruma koşullu");
  assert.equal(order.$where, undefined, "koşul kayıttan sonra kaldırılır");
  assert.equal(order.statusHistory.length, 1);
  assert.equal(order.statusHistory[0].status, "Yolda");
  assert.equal(order.statusHistory[0].changedBy, ADMIN._id);
  assert.equal(fx.audits.length, 1);
  assert.deepEqual(fx.audits[0].changes, [{ label: "Durum", from: "Hazırlanıyor", to: "Yolda" }]);
  assert.equal(fx.audits[0].targetName, "Sipariş #000001 · Kız KYK Yurdu");
  assert.equal(req.auditRecorded, true);
  assert.equal(fx.pushes.length, 1, "müşteriye bildirim");
  assert.equal(spy.emits.length, 1);
  assert.deepEqual(spy.emits[0].rooms, [`user_${USER(1)}`, "adminRoom"]);
  assert.equal(spy.emits[0].event, "orderStatusUpdated");
  assert.deepEqual(Object.keys(spy.emits[0].payload), ["orderId", "newStatus", "message"]);
  assert.equal(spy.emits[0].payload.newStatus, "Yolda");
  assert.equal(fx.coupons.length, 0);
  assert.equal(fx.missions, 0);
});

test("update-status: delivered runs missions + referral check, cancelled releases the coupon", async (t) => {
  const fx = mockSideEffects(t);
  let order = statusDoc({ status: "Yolda" });
  t.mock.method(Order, "findById", async () => order);
  const delivered = request({ orderId: ORDER(1), status: "Teslim Edildi" });
  await updateOrderStatus(delivered.req, response());
  await tick();
  assert.equal(fx.missions, 1);
  assert.equal(fx.referralChecks.length, 1);
  assert.equal(fx.referralChecks[0].status, "Teslim Edildi");

  order = statusDoc({ couponCode: "indirim10" });
  const cancelled = request({ orderId: ORDER(1), status: "İptal Edildi" });
  await updateOrderStatus(cancelled.req, response());
  await tick();
  assert.equal(fx.coupons.length, 1);
  assert.equal(fx.coupons[0].filter.code, "INDIRIM10");
  assert.deepEqual(fx.coupons[0].update.$inc, { usageCount: -1 });
});

test("update-status: status changed between read and save → 409 (or unchanged when already there)", async (t) => {
  mockSideEffects(t);
  const stale = statusDoc();
  stale.save = async () => { throw new mongoose.Error.DocumentNotFoundError({ _id: stale._id }, "Order", 0, {}); };
  let reads = 0;
  let fresh = { status: "İptal Edildi" };
  t.mock.method(Order, "findById", async () => (reads++ % 2 === 0 ? stale : fresh));
  const first = request({ orderId: ORDER(1), status: "Yolda", expectedStatus: "Hazırlanıyor" });
  const res = response();
  await updateOrderStatus(first.req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.status, "İptal Edildi");
  assert.equal(first.spy.emits.length, 0);

  fresh = { status: "Yolda" };
  const second = request({ orderId: ORDER(1), status: "Yolda" });
  const already = response();
  await updateOrderStatus(second.req, already);
  assert.equal(already.statusCode, 200);
  assert.equal(already.body.unchanged, true);
});

test("update-status with a real Mongoose document: the update filter carries the read status", async (t) => {
  mockSideEffects(t);
  const doc = Order.hydrate({
    _id: new mongoose.Types.ObjectId(ORDER(3)), __v: 2, user: new mongoose.Types.ObjectId(USER(3)), status: "Hazırlanıyor", statusHistory: [],
    products: [{ _id: new mongoose.Types.ObjectId(LINE(3)), product: new mongoose.Types.ObjectId(PRODUCT(3)), name: "Süt", quantity: 1, price: 40 }],
    totalAmount: 40, city: "Devrek", phone: "123", deliveryPoint: "girlsDorm", note: "", deliveryPointName: "", deliveryTracking: "",
    couponCode: null, couponDiscount: 0, subtotalAmount: 40, discountPercentage: 0, userDeleted: false, userDeletedAt: null, paymentMethod: null,
    device: { platform: "unknown", model: "", appVersion: "" }, createdAt: new Date(), updatedAt: new Date(),
  });
  const updates = [];
  t.mock.method(Order.collection, "updateOne", async (where, update) => { updates.push({ where, update }); return { matchedCount: 0, modifiedCount: 0 }; });
  let reads = 0;
  t.mock.method(Order, "findById", async () => (reads++ === 0 ? doc : { status: "İptal Edildi" }));
  const { req } = request({ orderId: ORDER(3), status: "Yolda", expectedStatus: "Hazırlanıyor" });
  const res = response();
  await updateOrderStatus(req, res);
  assert.equal(updates.length, 1);
  assert.equal(String(updates[0].where._id), ORDER(3));
  assert.equal(updates[0].where.status, "Hazırlanıyor", "eş zamanlı değişiklik üzerine yazılmaz");
  assert.equal(updates[0].update.$set.status, "Yolda");
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.status, "İptal Edildi");
});

// ── Toplu durum değişikliği ─────────────────────────────────────────────────

test("bulk-status: invalid input → 400 without a database call; all missing → 404", async (t) => {
  mockSideEffects(t);
  const find = t.mock.method(Order, "find", async () => []);
  const run = async (body) => { const { req } = request(body); const res = response(); await bulkUpdateOrderStatus(req, res); return res; };
  for (const body of [
    { orderIds: ["order-1"], status: "Yolda" },
    { orderIds: [], status: "Yolda" },
    { orderIds: Array.from({ length: 101 }, (_, i) => ORDER(i)), status: "Yolda" },
    { orderIds: [ORDER(1)], status: "Kayıp" },
    { orderIds: [ORDER(1)], status: "Yolda", expectedStatus: "Kayıp" },
    { orderIds: ORDER(1), status: "Yolda" },
  ]) {
    const res = await run(body);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Geçersiz toplu işlem" });
  }
  assert.equal(find.mock.callCount(), 0);
  const missing = await run({ orderIds: [ORDER(1), ORDER(2)], status: "Yolda" });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { message: "Siparişler bulunamadı" });
});

test("bulk-status: updates what it can, reports skipped orders, audits per order", async (t) => {
  const fx = mockSideEffects(t);
  const ok = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(1)) });
  const already = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(2)), status: "Yolda" });
  const moved = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(3)), status: "Teslim Edildi" });
  const filters = [];
  t.mock.method(Order, "find", async (filter) => { filters.push(filter); return [ok, already, moved]; });
  const { req, spy } = request({ orderIds: [ORDER(1), ORDER(2), ORDER(3), ORDER(4), ORDER(1).toUpperCase()], status: "Yolda", expectedStatus: "Hazırlanıyor" });
  const res = response();
  await bulkUpdateOrderStatus(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(filters[0]._id.$in, [ORDER(1), ORDER(2), ORDER(3), ORDER(4)], "yinelenen kimlik tek kez");
  assert.equal(res.body.updated, 1);
  assert.deepEqual(res.body.skipped, [
    { orderId: ORDER(2), reason: "unchanged", status: "Yolda" },
    { orderId: ORDER(3), reason: "conflict", status: "Teslim Edildi" },
    { orderId: ORDER(4), reason: "missing" },
  ]);
  assert.deepEqual(ok.saves[0].options, { validateModifiedOnly: true });
  assert.deepEqual(ok.saves[0].where, { status: "Hazırlanıyor" });
  assert.equal(already.saves.length + moved.saves.length, 0);
  assert.equal(fx.audits.length, 1);
  assert.equal(fx.audits[0].action, "Sipariş durumu değiştirildi (toplu)");
  assert.equal(fx.audits[0].target, ORDER(1));
  assert.deepEqual(fx.audits[0].changes, [{ label: "Durum", from: "Hazırlanıyor", to: "Yolda" }]);
  assert.equal(spy.emits.length, 1);
  assert.equal(spy.emits[0].event, "orderStatusUpdated");
  assert.deepEqual(spy.emits[0].rooms, [`user_${USER(1)}`, "adminRoom"]);
  assert.equal(fx.pushes.length, 1);
});

test("bulk-status: same side effects as a single update (coupon release, missions, referral)", async (t) => {
  const fx = mockSideEffects(t);
  const withCoupon = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(1)), couponCode: "YAZ25" });
  const plain = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(2)) });
  t.mock.method(Order, "find", async () => [withCoupon, plain]);
  const cancel = request({ orderIds: [ORDER(1), ORDER(2)], status: "İptal Edildi" });
  const cancelled = response();
  await bulkUpdateOrderStatus(cancel.req, cancelled);
  await tick();
  assert.equal(cancelled.body.updated, 2);
  assert.equal(fx.coupons.length, 1);
  assert.equal(fx.coupons[0].filter.code, "YAZ25");

  const a = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(5)), status: "Yolda" });
  const b = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(6)), status: "Yolda" });
  t.mock.method(Order, "find", async () => [a, b]);
  const deliver = request({ orderIds: [ORDER(5), ORDER(6)], status: "Teslim Edildi" });
  await bulkUpdateOrderStatus(deliver.req, response());
  await tick();
  assert.equal(fx.missions, 2, "teslim edilen her sipariş görevleri değerlendirir");
  assert.equal(fx.referralChecks.length, 2);
  assert.equal(fx.audits.length, 4);
});

test("bulk-status: a failing save returns 500 instead of crashing the process", async (t) => {
  mockSideEffects(t);
  const broken = statusDoc();
  broken.save = async () => { throw new Error("disk dolu"); };
  t.mock.method(Order, "find", async () => [broken]);
  const { req } = request({ orderIds: [ORDER(1)], status: "Yolda" });
  const res = response();
  await bulkUpdateOrderStatus(req, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Toplu işlem tamamlanamadı" });

  t.mock.method(Order, "find", async () => { throw new Error("bağlantı koptu"); });
  const down = response();
  await bulkUpdateOrderStatus(request({ orderIds: [ORDER(1)], status: "Yolda" }).req, down);
  assert.equal(down.statusCode, 500);
});

test("bulk-status: nothing changed → no audit fallback row", async (t) => {
  const fx = mockSideEffects(t);
  t.mock.method(Order, "find", async () => [statusDoc({ status: "Yolda" })]);
  const { req } = request({ orderIds: [ORDER(1)], status: "Yolda" });
  const res = response();
  await bulkUpdateOrderStatus(req, res);
  assert.deepEqual(res.body, { updated: 0, skipped: [{ orderId: ORDER(1), reason: "unchanged", status: "Yolda" }] });
  assert.equal(req.auditRecorded, true);
  assert.equal(fx.audits.length, 0);
});

test("bulk-status and delivery-tracking are wired to the controller with the same middleware chain", () => {
  const route = (path) => router.stack.find((layer) => layer.route?.path === path && layer.route.methods.put)?.route;
  const names = (path) => route(path).stack.map((layer) => layer.handle.name);
  assert.deepEqual(names("/bulk-status").slice(0, 2), ["protectRoute", "adminRoute"]);
  assert.equal(names("/bulk-status").at(-1), "bulkUpdateOrderStatus");
  assert.equal(route("/bulk-status").stack.length, 4, "auditAdminAction korunur");
  assert.equal(names("/delivery-tracking").at(-1), "updateDeliveryTracking");
  assert.equal(route("/delivery-tracking").stack.length, 4);
  assert.equal(names("/update-status").at(-1), "updateOrderStatus");
  const list = router.stack.find((layer) => layer.route?.path === "/" && layer.route.methods.get).route;
  assert.deepEqual(list.stack.map((layer) => layer.handle.name), ["protectRoute", "adminRoute", "getOrdersList"]);
});

// ── Teslimat notu ───────────────────────────────────────────────────────────

test("delivery-tracking: validation, audit with from → to and an adminRoom-only orderUpdated", async (t) => {
  const fx = mockSideEffects(t);
  const run = async (body) => { const r = request(body); const res = response(); await updateDeliveryTracking(r.req, res); return { res, ...r }; };
  assert.equal((await run({ orderId: "abc", deliveryTracking: "x" })).res.statusCode, 400);
  assert.equal((await run({ orderId: ORDER(1), deliveryTracking: "x".repeat(121) })).res.statusCode, 400);
  assert.equal((await run({ orderId: ORDER(1), deliveryTracking: 5 })).res.statusCode, 400);

  t.mock.method(Order, "findById", async () => null);
  assert.equal((await run({ orderId: ORDER(1), deliveryTracking: "Ali getirecek" })).res.statusCode, 404);

  const order = statusDoc({ deliveryTracking: "" });
  t.mock.method(Order, "findById", async () => order);
  const { res, spy, req } = await run({ orderId: ORDER(1), deliveryTracking: "  Ali getirecek  " });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { order });
  assert.equal(order.deliveryTracking, "Ali getirecek");
  assert.deepEqual(order.saves[0].options, { validateModifiedOnly: true });
  assert.equal(req.auditRecorded, true);
  assert.deepEqual(fx.audits[0].changes, [{ label: "Teslimat notu", from: "—", to: "Ali getirecek" }]);
  assert.equal(spy.emits.length, 1);
  assert.deepEqual(spy.emits[0].rooms, ["adminRoom"]);
  assert.equal(spy.emits[0].event, "orderUpdated");
  assert.equal(spy.emits[0].payload.orderId, ORDER(1));
  assert.equal(spy.emits[0].payload.kind, "tracking");
  assert.equal(spy.emits[0].payload.by, ADMIN._id);
  assert.ok(!Number.isNaN(Date.parse(spy.emits[0].payload.at)));

  const same = await run({ orderId: ORDER(1), deliveryTracking: "Ali getirecek" });
  assert.equal(same.res.statusCode, 200);
  assert.equal(order.saves.length, 1, "aynı not tekrar kaydedilmez");
  assert.equal(same.spy.emits.length, 0);
});

test("emitOrderUpdated never throws and never targets a customer room", () => {
  const { spy, req } = request();
  emitOrderUpdated(req, ORDER(1), "items");
  assert.deepEqual(spy.emits.map((emit) => emit.rooms), [["adminRoom"]]);
  emitOrderUpdated({ app: { get: () => { throw new Error("io yok"); } } }, ORDER(1), "items");
  emitOrderUpdated({}, ORDER(1), "items");
});

// ── Ürün ekleme ─────────────────────────────────────────────────────────────

test("add-item: amount must be a finite number in (0, 100000]", async (t) => {
  mockSideEffects(t);
  const findById = t.mock.method(Order, "findById", async () => itemDoc());
  for (const amount of [-5, 0, "abc", 100001, "", Number.NaN, "Infinity", null]) {
    const { req } = request({ orderId: ORDER(7), amount, name: "Poşet" });
    const res = response();
    await addCustomItemToOrder(req, res);
    assert.equal(res.statusCode, 400, String(amount));
  }
  const badId = response();
  await addCustomItemToOrder(request({ orderId: "x", amount: 5 }).req, badId);
  assert.deepEqual([badId.statusCode, badId.body.message], [400, "Geçersiz sipariş kimliği"]);
  assert.equal(findById.mock.callCount(), 0);
});

test("add-item: adds a manual line, raises total AND subtotal, audits and broadcasts", async (t) => {
  const fx = mockSideEffects(t);
  const order = itemDoc();
  t.mock.method(Order, "findById", async () => order);
  const custom = { _id: new mongoose.Types.ObjectId(PRODUCT(50)), image: "" };
  t.mock.method(Product, "findOne", async () => custom);
  const create = t.mock.method(Product, "create", async () => custom);
  const { req, spy } = request({ orderId: ORDER(7), amount: "12,50", name: `  Kargo   ${"x".repeat(100)}` });
  const res = response();
  await addCustomItemToOrder(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Ürün siparişe başarıyla eklendi!");
  assert.equal(res.body.order, order);
  const added = order.products.at(-1);
  assert.equal(added.price, 12.5);
  assert.equal(added.quantity, 1);
  assert.equal(added.isManual, true);
  assert.equal(added.name.length, 80);
  assert.ok(added.name.startsWith("Kargo x"));
  assert.equal(order.totalAmount, 152.5);
  assert.equal(order.subtotalAmount, 152.5);
  assert.equal(create.mock.callCount(), 0);
  assert.deepEqual(order.saves[0], { validateModifiedOnly: true });
  assert.equal(order.increments, 1);
  assert.equal(fx.audits[0].changes[1].label, "Toplam");
  assert.deepEqual(spy.emits.map((emit) => [emit.rooms, emit.event, emit.payload.kind]), [[["adminRoom"], "orderUpdated", "items"]]);

  const noSubtotal = itemDoc({ subtotalAmount: 0 });
  t.mock.method(Order, "findById", async () => noSubtotal);
  t.mock.method(Product, "findOne", async () => null);
  await addCustomItemToOrder(request({ orderId: ORDER(7), amount: 10 }).req, response());
  assert.equal(noSubtotal.subtotalAmount, 0);
  assert.equal(noSubtotal.totalAmount, 150);
  assert.equal(noSubtotal.products.at(-1).name, "Özel Ekleme");
  assert.equal(create.mock.callCount(), 1, "gizli özel ürün yoksa oluşturulur");
});

const mockCatalog = (t, { products = [], weekly = [] } = {}) => {
  t.mock.method(WeeklyProduct, "find", () => chain(weekly));
  t.mock.method(Product, "find", () => chain(products));
};

test("resolveEffectiveUnitPrice: weekly price > valid discount > price; 400/404 errors", async (t) => {
  const pid = PRODUCT(1);
  mockCatalog(t, { products: [{ _id: new mongoose.Types.ObjectId(pid), name: "Süt", price: 40, isDiscounted: true, discountedPrice: 35, category: "sut" }], weekly: [{ product: new mongoose.Types.ObjectId(pid), weeklyPrice: 30 }] });
  const weekly = await resolveEffectiveUnitPrice(pid);
  assert.equal(weekly.price, 30);
  assert.equal(weekly.product.name, "Süt");
  assert.equal(String(weekly.product._id), pid);

  mockCatalog(t, { products: [{ _id: new mongoose.Types.ObjectId(pid), name: "Süt", price: 40, isDiscounted: true, discountedPrice: 35, isHidden: true, isOutOfStock: true }] });
  assert.equal((await resolveEffectiveUnitPrice(pid)).price, 35, "gizli/stoksuz ürün de fiyatlanır");
  mockCatalog(t, { products: [{ _id: new mongoose.Types.ObjectId(pid), name: "Süt", price: 40, isDiscounted: true, discountedPrice: 45 }] });
  assert.equal((await resolveEffectiveUnitPrice(pid)).price, 40, "geçersiz indirim yok sayılır");

  await assert.rejects(resolveEffectiveUnitPrice("abc"), (error) => error.statusCode === 400);
  mockCatalog(t, { products: [] });
  await assert.rejects(resolveEffectiveUnitPrice(pid), (error) => error.statusCode === 404 && error.message === "Ürün bulunamadı!");
});

test("add-product: quantity 1–99, effective price, merge only on same product AND unit price", async (t) => {
  const fx = mockSideEffects(t);
  for (const quantity of [0, 100, 1.5, "abc"]) {
    const res = response();
    await addProductToOrder(request({ orderId: ORDER(7), productId: PRODUCT(1), quantity }).req, res);
    assert.equal(res.statusCode, 400, String(quantity));
  }
  const badProduct = response();
  await addProductToOrder(request({ orderId: ORDER(7), productId: "süt", quantity: 1 }).req, badProduct);
  assert.equal(badProduct.statusCode, 400);

  // Siparişteki Süt satırı 40 TL'den; şimdi haftalık fırsatta 30 TL → yeni satır
  const order = itemDoc();
  t.mock.method(Order, "findById", async () => order);
  mockCatalog(t, { products: [{ _id: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Süt", price: 40 }], weekly: [{ product: new mongoose.Types.ObjectId(PRODUCT(1)), weeklyPrice: 30 }] });
  const { req, spy } = request({ orderId: ORDER(7), productId: PRODUCT(1), quantity: 2 });
  const res = response();
  await addProductToOrder(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([res.body.success, res.body.message, res.body.addedProduct, res.body.addedQuantity], [true, "Süt siparişe başarıyla eklendi!", "Süt", 2]);
  assert.equal(order.products.length, 3);
  assert.equal(order.products[0].quantity, 2, "eski fiyatlı satır değişmez");
  assert.equal(order.products[2].price, 30);
  assert.equal(order.products[2].quantity, 2);
  assert.equal(order.totalAmount, 200);
  assert.equal(order.subtotalAmount, 200);
  assert.equal(order.increments, 1);
  assert.equal(fx.audits[0].changes[0].to, "Süt ×2 (₺60,00)");
  assert.equal(spy.emits[0].payload.kind, "items");

  // Aynı ürün ve aynı birim fiyat → mevcut satıra eklenir
  const same = itemDoc();
  t.mock.method(Order, "findById", async () => same);
  mockCatalog(t, { products: [{ _id: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Süt", price: 40 }] });
  await addProductToOrder(request({ orderId: ORDER(7), productId: PRODUCT(1), quantity: "3" }).req, response());
  assert.equal(same.products.length, 2);
  assert.equal(same.products[0].quantity, 5);
  assert.equal(same.totalAmount, 260);

  mockCatalog(t, { products: [] });
  const missing = response();
  await addProductToOrder(request({ orderId: ORDER(7), productId: PRODUCT(8), quantity: 1 }).req, missing);
  assert.equal(missing.statusCode, 404);
});

// ── Satır düzenlemeleri (lineId) ─────────────────────────────────────────────

test("remove-item: lineId wins over a stale index; unknown lineId → 409; last line → 400", async (t) => {
  const fx = mockSideEffects(t);
  const order = itemDoc();
  t.mock.method(Order, "findById", async () => order);
  const { req, spy } = request({ orderId: ORDER(7), lineId: LINE(2), productIndex: 0 });
  const res = response();
  await removeItemFromOrder(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.removedProduct, "Ekmek");
  assert.deepEqual(order.products.map((p) => p.name), ["Süt"]);
  assert.equal(order.totalAmount, 80);
  assert.equal(order.subtotalAmount, 80);
  assert.equal(order.increments, 1);
  assert.deepEqual(order.saves[0], { validateModifiedOnly: true });
  assert.deepEqual(fx.audits[0].changes, [{ label: "Ürün çıkarıldı", from: "Ekmek ×3", to: "—" }, { label: "Toplam", from: "₺140,00", to: "₺80,00" }]);
  assert.equal(spy.emits[0].payload.kind, "items");

  const unknown = response();
  await removeItemFromOrder(request({ orderId: ORDER(7), lineId: LINE(9), productIndex: 0 }).req, unknown);
  assert.equal(unknown.statusCode, 409);
  assert.equal(unknown.body.message, "Ürün satırı bulunamadı; sipariş başka bir yerde değişmiş olabilir");

  const last = response();
  await removeItemFromOrder(request({ orderId: ORDER(7), lineId: LINE(1) }).req, last);
  assert.equal(last.statusCode, 400);
  assert.equal(last.body.message, "Siparişte en az bir ürün olmalı! Siparişi tamamen silmek için 'Sipariş Sil' seçeneğini kullanın.");
  assert.equal(order.products.length, 1);

  const byIndex = itemDoc();
  t.mock.method(Order, "findById", async () => byIndex);
  await removeItemFromOrder(request({ orderId: ORDER(7), productIndex: 0 }).req, response());
  assert.deepEqual(byIndex.products.map((p) => p.name), ["Ekmek"], "lineId yoksa dizin hâlâ çalışır");
  const none = response();
  await removeItemFromOrder(request({ orderId: ORDER(7) }).req, none);
  assert.equal(none.statusCode, 400);
});

test("update-item-quantity: integer 1–999, edits the line by lineId, no-op when unchanged", async (t) => {
  const fx = mockSideEffects(t);
  for (const newQuantity of [1.5, 0, -2, 1000, "abc"]) {
    const res = response();
    await updateItemQuantity(request({ orderId: ORDER(7), lineId: LINE(1), newQuantity }).req, res);
    assert.equal(res.statusCode, 400, String(newQuantity));
  }
  const order = itemDoc();
  t.mock.method(Order, "findById", async () => order);
  const { req, spy } = request({ orderId: ORDER(7), lineId: LINE(2).toUpperCase(), productIndex: 0, newQuantity: "5" });
  const res = response();
  await updateItemQuantity(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([res.body.updatedProduct, res.body.oldQuantity, res.body.newQuantity], ["Ekmek", 3, 5]);
  assert.equal(order.products[1].quantity, 5);
  assert.equal(order.products[0].quantity, 2, "eski dizindeki satır değişmez");
  assert.equal(order.totalAmount, 180);
  assert.equal(order.subtotalAmount, 180);
  assert.deepEqual(fx.audits[0].changes[0], { label: "Adet · Ekmek", from: "3", to: "5" });
  assert.equal(spy.emits[0].payload.kind, "items");

  const again = request({ orderId: ORDER(7), lineId: LINE(2), newQuantity: 5 });
  const unchanged = response();
  await updateItemQuantity(again.req, unchanged);
  assert.equal(unchanged.statusCode, 200);
  assert.equal(order.saves.length, 1);
  assert.equal(again.req.auditRecorded, true);
  assert.equal(again.spy.emits.length, 0);

  const malformed = response();
  await updateItemQuantity(request({ orderId: ORDER(7), lineId: "satir-1", newQuantity: 2 }).req, malformed);
  assert.equal(malformed.statusCode, 400);
  const stale = response();
  await updateItemQuantity(request({ orderId: ORDER(7), lineId: LINE(9), newQuantity: 2 }).req, stale);
  assert.equal(stale.statusCode, 409);
});

test("toggle-manual: lineId support, audit and broadcast", async (t) => {
  const fx = mockSideEffects(t);
  const order = itemDoc();
  t.mock.method(Order, "findById", async () => order);
  const { req, spy } = request({ orderId: ORDER(7), lineId: LINE(2), isManual: true });
  const res = response();
  await toggleManualFlag(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([res.body.isManual, res.body.updatedProduct, res.body.message], [true, "Ekmek", "Ürün manuel olarak işaretlendi!"]);
  assert.equal(order.products[1].isManual, true);
  assert.deepEqual(fx.audits[0].changes, [{ label: "Manuel · Ekmek", from: "Hayır", to: "Evet" }]);
  assert.equal(spy.emits[0].payload.kind, "items");
  const off = response();
  await toggleManualFlag(request({ orderId: ORDER(7), productIndex: 1, isManual: "false" }).req, off);
  assert.equal(order.products[1].isManual, false);
  assert.equal(off.body.message, "Manuel işareti kaldırıldı!");
});

test("item edits: concurrent change (VersionError) → 409, legacy validation failure → 400, not 500", async (t) => {
  mockSideEffects(t);
  const conflicted = itemDoc();
  conflicted.save = async () => { throw new mongoose.Error.VersionError({ _doc: { _id: conflicted._id } }, 3, ["products"]); };
  t.mock.method(Order, "findById", async () => conflicted);
  const conflict = response();
  await updateItemQuantity(request({ orderId: ORDER(7), lineId: LINE(1), newQuantity: 4 }).req, conflict);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.message, "Sipariş bu arada değişti; güncel halini yükleyip tekrar deneyin");

  const legacy = itemDoc();
  legacy.save = async () => {
    const error = new mongoose.Error.ValidationError();
    error.addError("products.0.name", new mongoose.Error.ValidatorError({ message: "Path `name` is required.", path: "products.0.name" }));
    throw error;
  };
  t.mock.method(Order, "findById", async () => legacy);
  const invalid = response();
  await removeItemFromOrder(request({ orderId: ORDER(7), lineId: LINE(2) }).req, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.body.message, /Sipariş kaydedilemedi.*products\.0\.name/);
});

test("item edits with a real Mongoose document are version-checked (stale read → 409)", async (t) => {
  const fx = mockSideEffects(t);
  const doc = Order.hydrate({
    _id: new mongoose.Types.ObjectId(ORDER(8)), __v: 4, user: new mongoose.Types.ObjectId(USER(8)), status: "Hazırlanıyor", statusHistory: [],
    products: [
      { _id: new mongoose.Types.ObjectId(LINE(1)), product: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Süt", quantity: 2, price: 40, isManual: false },
      { _id: new mongoose.Types.ObjectId(LINE(2)), product: new mongoose.Types.ObjectId(PRODUCT(2)), name: "Ekmek", quantity: 1, price: 20, isManual: false },
    ],
    totalAmount: 100, subtotalAmount: 100, city: "Devrek", phone: "05550000000", deliveryPoint: "boysDorm", note: "", deliveryPointName: "",
    deliveryTracking: "", couponCode: null, couponDiscount: 0, discountPercentage: 0, userDeleted: false, userDeletedAt: null, paymentMethod: null,
    device: { platform: "unknown", model: "", appVersion: "" }, createdAt: new Date(), updatedAt: new Date(),
  });
  const updates = [];
  t.mock.method(Order.collection, "updateOne", async (where, update) => { updates.push({ where, update }); return { matchedCount: 0, modifiedCount: 0 }; });
  t.mock.method(Order, "findById", async () => doc);
  const { req, spy } = request({ orderId: ORDER(8), lineId: LINE(1), newQuantity: 3 });
  const res = response();
  await updateItemQuantity(req, res);
  assert.equal(updates[0].where.__v, 4, "kayıt okunan sürüme koşullu");
  assert.equal(updates[0].update.$set["products.0.quantity"], 3);
  assert.equal(updates[0].update.$set.totalAmount, 140);
  assert.equal(res.statusCode, 409);
  assert.equal(spy.emits.length, 0);
  assert.equal(fx.audits.length, 0);
});

test("bulk-status: an order changed between read and save is reported, not overwritten", async (t) => {
  mockSideEffects(t);
  const stale = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(1)) });
  stale.save = async () => { throw new mongoose.Error.VersionError({ _doc: { _id: stale._id } }, 1, ["status"]); };
  const fine = statusDoc({ _id: new mongoose.Types.ObjectId(ORDER(2)) });
  t.mock.method(Order, "find", async () => [stale, fine]);
  t.mock.method(Order, "findById", async () => ({ status: "İptal Edildi" }));
  const { req } = request({ orderIds: [ORDER(1), ORDER(2)], status: "Yolda", expectedStatus: "Hazırlanıyor" });
  const res = response();
  await bulkUpdateOrderStatus(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { updated: 1, skipped: [{ orderId: ORDER(1), reason: "conflict", status: "İptal Edildi" }] });
});

// ── Silme ───────────────────────────────────────────────────────────────────

test("delete-order: active orders release their coupon, audit row, adminRoom 'deleted' event", async (t) => {
  const fx = mockSideEffects(t);
  const badId = response();
  await deleteOrder({ ...request().req, params: { orderId: "abc" } }, badId);
  assert.equal(badId.statusCode, 400);

  t.mock.method(Order, "findById", async () => null);
  const missing = response();
  await deleteOrder({ ...request().req, params: { orderId: ORDER(1) } }, missing);
  assert.equal(missing.statusCode, 404);

  const order = statusDoc({ couponCode: "hosgeldin", status: "Yolda", totalAmount: 99.9 });
  t.mock.method(Order, "findById", async () => order);
  const removed = t.mock.method(Order, "findByIdAndDelete", async () => order);
  t.mock.method(User, "findById", () => chain({ name: "Ayşe Yılmaz" }));
  const { req, spy } = request();
  const res = response();
  await deleteOrder({ ...req, params: { orderId: ORDER(1) } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "Sipariş başarıyla silindi!", deletedOrderId: ORDER(1) });
  assert.equal(removed.mock.callCount(), 1);
  assert.equal(fx.coupons.length, 1);
  assert.equal(fx.coupons[0].filter.code, "HOSGELDIN");
  assert.equal(fx.audits[0].action, "Sipariş silindi");
  assert.equal(fx.audits[0].targetName, "Sipariş #000001 · Ayşe Yılmaz");
  assert.deepEqual(fx.audits[0].changes, [{ label: "Durum", from: "Yolda", to: "Silindi" }, { label: "Tutar", from: "₺99,90", to: "—" }]);
  assert.deepEqual(spy.emits.map((emit) => [emit.rooms, emit.event, emit.payload.kind, emit.payload.orderId]), [[["adminRoom"], "orderUpdated", "deleted", ORDER(1)]]);

  const delivered = statusDoc({ couponCode: "hosgeldin", status: "Teslim Edildi", userDeleted: true });
  t.mock.method(Order, "findById", async () => delivered);
  t.mock.method(Order, "findByIdAndDelete", async () => delivered);
  await deleteOrder({ ...request().req, params: { orderId: ORDER(1) } }, response());
  assert.equal(fx.coupons.length, 1, "tamamlanmış siparişin kuponu geri açılmaz");
  assert.equal(fx.audits[1].targetName, "Sipariş #000001 · Silinmiş hesap");
});

// ── Sipariş alarmı ──────────────────────────────────────────────────────────

test("alarm phones are woken after update-status, bulk-status and deleting a Hazırlanıyor order", async (t) => {
  mockSideEffects(t);
  const probes = [];

  probes.push(await alarmProbe());
  assert.equal(waiterCount(), 1);
  t.mock.method(Order, "findById", async () => statusDoc());
  await updateOrderStatus(request({ orderId: ORDER(1), status: "Yolda" }).req, response());
  assert.equal(waiterCount(), 0, "tekli değişiklik sinyal gönderdi");

  probes.push(await alarmProbe());
  t.mock.method(Order, "find", async () => [statusDoc()]);
  await bulkUpdateOrderStatus(request({ orderIds: [ORDER(1)], status: "Yolda" }).req, response());
  assert.equal(waiterCount(), 0, "toplu değişiklik sinyal gönderdi");

  probes.push(await alarmProbe());
  const preparing = statusDoc();
  t.mock.method(Order, "findById", async () => preparing);
  t.mock.method(Order, "findByIdAndDelete", async () => preparing);
  t.mock.method(User, "findById", () => chain({ name: "Ayşe" }));
  await deleteOrder({ ...request().req, params: { orderId: ORDER(1) } }, response());
  assert.equal(waiterCount(), 0, "Hazırlanıyor siparişin silinmesi sinyal gönderdi");

  probes.forEach((probe) => probe.close());
  await Promise.all(probes.map((probe) => probe.done));
});

// ── Dondurulmuş sözleşmeler ─────────────────────────────────────────────────

test("frozen helpers are still exported from the controller for existing callers", () => {
  assert.equal(typeof releaseCouponForOrder, "function");
  assert.equal(typeof grantReferralRewardIfDelivered, "function");
});
