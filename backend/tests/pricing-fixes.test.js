// Fiyat düzeltmeleri (P3): haftalık fırsatın başlangıç/bitiş tarihi, kuruş yuvarlaması ve müşterinin
// sipariş geçmişinde ödediği fiyat. Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Settings from "../models/settings.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import DeliveryZone from "../models/deliveryZone.model.js";
import FlashSale from "../models/flashSale.model.js";
import {
  activeWeeklyFilter,
  isWeeklyDealLive,
  meetsMinimumAmount,
  resolveUnitPrice,
  roundMoney,
  toKurus,
} from "../services/productPricing.js";
import { buildOrderProducts } from "../services/order.service.js";
import {
  applyWeeklyPricesToProducts,
  invalidateWeeklyPriceCache,
  resetWeeklyScheduleState,
  syncWeeklyDealSchedule,
} from "../services/weeklyPrice.service.js";
import { runScheduledPricingJob } from "../services/flashSale.service.js";
import { onProductCachesInvalidated } from "../services/productCache.service.js";
import { computeDeliveryQuote, roundMoney as deliveryRoundMoney } from "../services/delivery.service.js";
import { placeOrder } from "../controllers/cart.controller.js";
import {
  EXPIRED_ACTIVATE_MESSAGE,
  getWeeklyProducts,
  toggleWeeklyProductStatus,
  updateWeeklyProduct,
} from "../controllers/weeklyProduct.controller.js";
import {
  USER_ORDERS_DEFAULT_LIMIT,
  USER_ORDERS_MAX_LIMIT,
  getUserOrders,
  parseUserOrdersBefore,
  parseUserOrdersLimit,
} from "../controllers/ordersAnalytics.controller.js";
import { effectivePriceMap } from "../services/ai/tools.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const PRODUCT = (n) => hex("99cc", n);
const USER = (n) => hex("507f1f77bcf8", n);
const ORDER = (n) => hex("0dde", n);
const oid = (id) => new mongoose.Types.ObjectId(id);
const H = 60 * 60 * 1000;

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  setHeader(key, value) { this.headers[key] = value; },
  json(body) { this.body = body; return this; },
});

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

/** activeWeeklyFilter sonucunu verilen kayda uygular (Mongo taklidi) */
const matchesWeeklyFilter = (filter, row) => {
  if (filter.isActive !== undefined && row.isActive !== filter.isActive) return false;
  return (filter.$and || []).every((clause) => clause.$or.some((cond) => {
    const [field, rule] = Object.entries(cond)[0];
    const value = row[field];
    if (rule === null) return value === null || value === undefined;
    if (rule.$exists === false) return value === undefined;
    if (rule.$lte) return value != null && new Date(value) <= rule.$lte;
    if (rule.$gt) return value != null && new Date(value) > rule.$gt;
    return false;
  }));
};

const assertWeeklyFilter = (filter, now = new Date()) => {
  assert.equal(filter.isActive, true, "yalnızca aktif fırsatlar");
  const [start, end] = filter.$and;
  const startLte = start.$or.find((c) => c.startDate?.$lte)?.startDate.$lte;
  const endGt = end.$or.find((c) => c.endDate?.$gt)?.endDate.$gt;
  assert.ok(startLte instanceof Date && Math.abs(startLte - now) < 5000, "startDate <= şimdi");
  assert.ok(endGt instanceof Date && Math.abs(endGt - now) < 5000, "endDate > şimdi");
  assert.ok(start.$or.some((c) => c.startDate === null), "eksik startDate = başlamış");
  assert.ok(end.$or.some((c) => c.endDate === null), "eksik endDate = süresiz");
};

// ── Yardımcılar ──────────────────────────────────────────────────────────────

test("kuruş yuvarlaması: ondalık toplama hatası ve .005 sınırı", () => {
  assert.equal(roundMoney(38.699999), 38.7);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1.005), 1.01, "1.005 * 100 = 100.4999… hatası");
  assert.equal(roundMoney(33.3 * 7 + 16.9), 250);
  assert.equal(roundMoney(-2.345), -2.35);
  assert.equal(roundMoney("abc"), 0);
  assert.equal(roundMoney(undefined), 0);
  assert.equal(toKurus(249.99999999999997), 25000);
  assert.equal(deliveryRoundMoney, roundMoney, "teslimat servisi aynı yuvarlamayı kullanır");
  assert.deepEqual(resolveUnitPrice({ price: 12.999 }), { price: 13, source: "list" });
});

test("minimum karşılaştırması kuruş üzerinden: tam 250,00 TL'lik sepet 250 TL minimumu geçer", () => {
  const floatSum = 33.3 * 7 + 16.9; // 249.99999999999997
  assert.ok(floatSum < 250, "ön koşul: ondalık toplam 250'nin altında kalıyor");
  assert.equal(meetsMinimumAmount(floatSum, 250), true);
  assert.equal(meetsMinimumAmount(250, 250), true);
  assert.equal(meetsMinimumAmount(249.99, 250), false);
  assert.equal(meetsMinimumAmount(1, 0), true, "0 = minimum yok");
  assert.equal(meetsMinimumAmount(1, null), true);

  // Adres akışı (teslimat teklifi): minimum ve ücretsiz teslimat eşiği aynı kuralla
  const zone = { _id: "devrek", name: "Devrek", deliveryFee: 40, freeDeliveryThreshold: 500, minimumOrderAmount: 250 };
  const quote = computeDeliveryQuote({ zone, subtotal: floatSum, settings: {} });
  assert.equal(quote.meetsMinimum, true);
  assert.equal(quote.subtotal, 250);
  assert.equal(quote.total, 290);
  const atThreshold = computeDeliveryQuote({ zone, subtotal: 2 * floatSum, settings: {} });
  assert.equal(atThreshold.deliveryFee, 0, "tam 500,00 TL eşiği geçer");
  assert.equal(atThreshold.freeReason, "threshold");
  assert.equal(computeDeliveryQuote({ zone, subtotal: 249.99, settings: {} }).meetsMinimum, false);
});

test("haftalık fırsat geçerliliği: süresi dolmuş ya da başlamamış fırsat geçersiz; eksik tarih sınırsız", () => {
  const now = new Date();
  assert.equal(isWeeklyDealLive({ isActive: true }, now), true, "eski kayıt (tarih yok)");
  assert.equal(isWeeklyDealLive({ isActive: true, startDate: new Date(+now - H), endDate: null }, now), true);
  assert.equal(isWeeklyDealLive({ isActive: true, endDate: new Date(+now - 1000) }, now), false, "süresi dolmuş");
  assert.equal(isWeeklyDealLive({ isActive: true, endDate: now }, now), false, "bitiş anı dahil değil");
  assert.equal(isWeeklyDealLive({ isActive: true, startDate: new Date(+now + H) }, now), false, "henüz başlamamış");
  assert.equal(isWeeklyDealLive({ isActive: false }, now), false);
  assert.equal(isWeeklyDealLive({ weeklyPrice: 5 }, now), true, "isActive okunmadıysa (projeksiyon) aktif sayılır");

  const filter = activeWeeklyFilter(now);
  assertWeeklyFilter(filter, now);
  const rows = [
    { id: "live", isActive: true, startDate: new Date(+now - H), endDate: new Date(+now + H) },
    { id: "legacy", isActive: true },
    { id: "open", isActive: true, startDate: new Date(+now - H), endDate: null },
    { id: "expired", isActive: true, startDate: new Date(+now - 2 * H), endDate: new Date(+now - H) },
    { id: "future", isActive: true, startDate: new Date(+now + H), endDate: new Date(+now + 2 * H) },
    { id: "paused", isActive: false },
  ];
  assert.deepEqual(rows.filter((row) => matchesWeeklyFilter(filter, row)).map((r) => r.id), ["live", "legacy", "open"]);
});

// ── Sipariş fiyatı ───────────────────────────────────────────────────────────

const MILK = { _id: oid(PRODUCT(1)), name: "Süt", price: 100, category: "sut" };
const BREAD = { _id: oid(PRODUCT(2)), name: "Ekmek", price: 10, category: "firin" };

test("sipariş: süresi dolmuş ya da başlamamış haftalık fırsat uygulanmaz; sorgu tarihe göre süzer", async (t) => {
  const now = new Date();
  const filters = [];
  // Sorgu filtresi yine de kaçırırsa (ör. eski önbellek/taklit) ikinci emniyet devrede
  t.mock.method(WeeklyProduct, "find", (filter) => {
    filters.push(filter);
    return chain([
      { product: MILK._id, weeklyPrice: 70, isActive: true, endDate: new Date(+now - 60 * 1000) },
      { product: BREAD._id, weeklyPrice: 5, isActive: true, startDate: new Date(+now + H) },
    ]);
  });
  t.mock.method(Product, "find", () => chain([MILK, BREAD]));

  const { orderProducts, totalAmount } = await buildOrderProducts([
    { product: PRODUCT(1), quantity: 1 },
    { product: PRODUCT(2), quantity: 2 },
  ]);
  assert.equal(orderProducts[0].price, 100, "süresi dolan fırsat fiyatı alınmaz");
  assert.equal(orderProducts[0].isWeeklyDiscount, false);
  assert.equal(orderProducts[1].price, 10, "başlamamış fırsat erken uygulanmaz");
  assert.equal(orderProducts[1].isWeeklyDiscount, false);
  assert.equal(totalAmount, 120);

  assert.equal(filters.length, 1);
  assertWeeklyFilter(filters[0], now);
  assert.deepEqual(filters[0].product.$in.map(String), [PRODUCT(1), PRODUCT(2)], "yalnızca sepetteki ürünlerin fırsatları okunur");
});

test("sipariş: geçerli haftalık fırsat uygulanmaya devam eder", async (t) => {
  const now = new Date();
  t.mock.method(WeeklyProduct, "find", () => chain([
    { product: MILK._id, weeklyPrice: 70, isActive: true, startDate: new Date(+now - H), endDate: new Date(+now + H) },
  ]));
  t.mock.method(Product, "find", () => chain([MILK]));
  const { orderProducts, totalAmount } = await buildOrderProducts([{ product: PRODUCT(1), quantity: 3 }]);
  assert.equal(orderProducts[0].price, 70);
  assert.equal(orderProducts[0].isWeeklyDiscount, true);
  assert.equal(totalAmount, 210);
});

test("sipariş toplamı kuruşa yuvarlanır (ondalık toplama hatası yok)", async (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", () => chain([
    { _id: oid(PRODUCT(3)), name: "Sakız", price: 0.1, category: "atistirmalik" },
    { _id: oid(PRODUCT(4)), name: "Şeker", price: 0.2, category: "atistirmalik" },
    { _id: oid(PRODUCT(5)), name: "Peynir", price: 33.3, category: "sut" },
    { _id: oid(PRODUCT(6)), name: "Zeytin", price: 16.9, category: "kahvalti" },
  ]));
  const small = await buildOrderProducts([{ product: PRODUCT(3), quantity: 1 }, { product: PRODUCT(4), quantity: 1 }]);
  assert.equal(small.totalAmount, 0.3, "0.1 + 0.2 = 0.30000000000000004 değil");
  const exact = await buildOrderProducts([{ product: PRODUCT(5), quantity: 7 }, { product: PRODUCT(6), quantity: 1 }]);
  assert.equal(exact.totalAmount, 250, "33,30 × 7 + 16,90 = tam 250,00");
});

// ── Yurt siparişi: minimum ve kaydedilen tutarlar ────────────────────────────

const customer = () => ({
  _id: oid(USER(1)),
  name: "Ayşe",
  phone: "05551112233",
  role: "customer",
  cartItems: [{ product: PRODUCT(5), quantity: 7 }],
  async save() { return this; },
});

test("yurt siparişi: tam 250,00 TL'lik sepet 250 TL minimumu geçer; siparişe yuvarlanmış tutar yazılır", async (t) => {
  const settings = new Settings({
    name: "default",
    orderStartHour: 0, orderStartMinute: 0, orderEndHour: 0, orderEndMinute: 0,
    minimumOrderAmount: 250,
  });
  t.mock.method(Settings, "getSettings", async () => settings);
  t.mock.method(DeliveryZone, "findById", () => chain(null));
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", () => chain([
    { _id: oid(PRODUCT(5)), name: "Peynir", price: 33.3, category: "sut" },
    { _id: oid(PRODUCT(6)), name: "Zeytin", price: 16.9, category: "kahvalti" },
  ]));
  const created = [];
  t.mock.method(Order, "create", async (doc) => {
    const order = { _id: new mongoose.Types.ObjectId(), status: "Hazırlanıyor", createdAt: new Date(), ...doc };
    created.push(order);
    return order;
  });
  const res = response();
  await placeOrder({
    body: {
      paymentMethod: "cash",
      products: [{ product: PRODUCT(5), quantity: 7 }, { product: PRODUCT(6), quantity: 1 }],
      city: "Devrek",
      phone: "05551112233",
      deliveryPoint: "girlsDorm",
      deliveryPointName: "Kız KYK Yurdu",
    },
    user: customer(),
    app: { get: (key) => (key === "io" ? { to: () => ({ emit() {} }) } : null) },
  }, res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created.length, 1);
  assert.equal(created[0].totalAmount, 250);
  assert.equal(created[0].subtotalAmount, 250);
  assert.equal(created[0].productTotal, 250);
  assert.equal(created[0].couponDiscount, 0);
  assert.equal(created[0].products[0].price, 33.3);
});

// ── Ürün listeleri ve haftalık raf ───────────────────────────────────────────

test("ürün listeleri: süresi dolmuş/başlamamış haftalık fiyat gösterilmez; önbellekteki fırsat bitince düşer", async (t) => {
  invalidateWeeklyPriceCache();
  const now = new Date();
  const filters = [];
  const rows = [
    { product: { _id: MILK._id, price: 100 }, weeklyPrice: 70, discountPercentage: 30, isActive: true, endDate: new Date(+now - 1000) },
    { product: { _id: BREAD._id, price: 10 }, weeklyPrice: 5, discountPercentage: 50, isActive: true, startDate: new Date(+now + H) },
  ];
  t.mock.method(WeeklyProduct, "find", (filter) => { filters.push(filter); return chain(rows); });
  const [milk, bread] = await applyWeeklyPricesToProducts([MILK, BREAD]);
  assert.equal(milk.actualPrice, 100);
  assert.equal(milk.isWeeklyProduct, undefined);
  assert.equal(bread.actualPrice, 10);
  assert.equal(bread.isWeeklyProduct, undefined);
  assertWeeklyFilter(filters[0], now);

  // Önbelleğe geçerli olarak giren fırsatın süresi dolunca bir sonraki istekte uygulanmaz
  invalidateWeeklyPriceCache();
  rows.splice(0, rows.length, { product: { _id: MILK._id, price: 100 }, weeklyPrice: 70, discountPercentage: 30, isActive: true, endDate: new Date(Date.now() + 40) });
  const [live] = await applyWeeklyPricesToProducts([MILK]);
  assert.equal(live.actualPrice, 70);
  assert.equal(live.isWeeklyProduct, true);
  assert.equal("endDate" in live, false, "fırsat tarihleri ürün yanıtına sızmaz");
  await new Promise((resolve) => setTimeout(resolve, 60));
  const callsBefore = filters.length;
  const [expired] = await applyWeeklyPricesToProducts([MILK]);
  assert.equal(filters.length, callsBefore, "önbellek kullanıldı");
  assert.equal(expired.actualPrice, 100);
  assert.equal(expired.isWeeklyProduct, undefined);
  invalidateWeeklyPriceCache();
});

test("haftalık raf (GET /api/weekly-products): yalnızca geçerli fırsatlar", async (t) => {
  const now = new Date();
  let filter = null;
  t.mock.method(WeeklyProduct, "find", (f) => {
    filter = f;
    return chain([
      { _id: "a", product: { name: "Süt" }, weeklyPrice: 70, isActive: true, endDate: new Date(+now + H) },
      { _id: "b", product: { name: "Ekmek" }, weeklyPrice: 5, isActive: true, endDate: new Date(+now - H) },
      { _id: "c", product: null, weeklyPrice: 5, isActive: true },
    ]);
  });
  const res = response();
  await getWeeklyProducts({}, res);
  assert.equal(res.statusCode, 200);
  assertWeeklyFilter(filter, now);
  assert.deepEqual(res.body.weeklyProducts.map((wp) => wp._id), ["a"]);
});

test("yapay zekâ fiyatı: süresi dolmuş haftalık fiyat söylenmez", async (t) => {
  const now = new Date();
  let filter = null;
  t.mock.method(WeeklyProduct, "find", (f) => {
    filter = f;
    return chain([{ product: MILK._id, weeklyPrice: 70, isActive: true, endDate: new Date(+now - H) }]);
  });
  const [item] = await effectivePriceMap([MILK]);
  assert.equal(item.price, 100);
  assertWeeklyFilter(filter, now);
  assert.deepEqual(filter.product.$in.map(String), [PRODUCT(1)]);
});

// ── Zamanlanmış iş ───────────────────────────────────────────────────────────

test("zamanlanmış iş: süresi dolan fırsatları kapatır ve ürün önbelleklerini temizler", async (t) => {
  resetWeeklyScheduleState();
  const now = new Date();
  let invalidations = 0;
  const off = onProductCachesInvalidated(() => { invalidations += 1; });
  t.after(off);
  const updates = [];
  const counts = [];
  let modified = 2;
  let started = 0;
  t.mock.method(WeeklyProduct, "updateMany", async (filter, update) => {
    updates.push({ filter, update });
    return { matchedCount: modified, modifiedCount: modified };
  });
  t.mock.method(WeeklyProduct, "countDocuments", async (filter) => { counts.push(filter); return started; });

  assert.deepEqual(await syncWeeklyDealSchedule(now), { expired: 2, started: 0 });
  assert.equal(invalidations, 1, "kapatılan fırsat varsa önbellekler temizlenir");
  assert.equal(updates[0].filter.isActive, true);
  assert.equal(updates[0].filter.endDate.$lte, now);
  assert.deepEqual(updates[0].update, { $set: { isActive: false } });
  assert.equal(counts[0].isActive, true);
  assert.equal(counts[0].startDate.$lte, now);
  assert.ok(counts[0].startDate.$gt < now, "son denetimden bu yana başlayanlar");

  // Değişiklik yoksa önbellek temizlenmez
  modified = 0;
  const later = new Date(+now + 60 * 1000);
  assert.deepEqual(await syncWeeklyDealSchedule(later), { expired: 0, started: 0 });
  assert.equal(invalidations, 1);
  assert.equal(+counts[1].startDate.$gt, +now, "pencere bir önceki denetimden başlar");

  // Planlanan fırsat başladıysa da temizlenir (uygulama yeni fiyatı bir dakika içinde görür)
  started = 1;
  assert.deepEqual(await syncWeeklyDealSchedule(new Date(+later + 60 * 1000)), { expired: 0, started: 1 });
  assert.equal(invalidations, 2);
});

test("zamanlanmış iş: flash sale adımı hata verse de haftalık fırsat adımı çalışır", async (t) => {
  resetWeeklyScheduleState();
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "log", () => {});
  t.mock.method(FlashSale, "find", async () => { throw new Error("db down"); });
  const updateMany = t.mock.method(WeeklyProduct, "updateMany", async () => ({ modifiedCount: 1 }));
  t.mock.method(WeeklyProduct, "countDocuments", async () => 0);
  let invalidations = 0;
  const off = onProductCachesInvalidated(() => { invalidations += 1; });
  t.after(off);
  const result = await runScheduledPricingJob(new Date());
  assert.equal(result.flash, null);
  assert.deepEqual(result.weekly, { expired: 1, started: 0 });
  assert.equal(updateMany.mock.callCount(), 1);
  assert.ok(invalidations >= 1);
});

// ── Yönetici: süresi dolmuş fırsat yayına alınamaz ───────────────────────────

test("yönetici: bitiş tarihi geçmiş fırsat yayına alınamaz; yalnızca sıralama değişikliği engellenmez", async (t) => {
  const past = new Date(Date.now() - H);
  const saves = [];
  const doc = { _id: "w1", isActive: false, endDate: past, product: { _id: MILK._id, name: "Süt", price: 100 }, async save() { saves.push(1); } };
  t.mock.method(WeeklyProduct, "findById", () => chain(doc));
  const toggled = response();
  await toggleWeeklyProductStatus({ params: { id: "w1" } }, toggled);
  assert.equal(toggled.statusCode, 400);
  assert.equal(toggled.body.message, EXPIRED_ACTIVATE_MESSAGE);

  const updated = response();
  await updateWeeklyProduct({ params: { id: "w1" }, body: { weeklyPrice: 70, isActive: true, endDate: past.toISOString() } }, updated);
  assert.equal(updated.statusCode, 400);
  assert.equal(updated.body.message, EXPIRED_ACTIVATE_MESSAGE);
  assert.equal(saves.length, 0);

  // Panelde sürükle-bırak sıralaması yalnızca { order } gönderir: süresi dolmuş ama henüz kapatılmamış kayıt engellemez
  doc.isActive = true;
  const reordered = response();
  await updateWeeklyProduct({ params: { id: "w1" }, body: { order: 3 }, app: { get: () => null } }, reordered);
  assert.equal(reordered.statusCode, 200, JSON.stringify(reordered.body));
  assert.equal(doc.order, 3);
  assert.equal(saves.length, 1);
});

// ── Müşterinin sipariş geçmişi ───────────────────────────────────────────────

test("GET /user-orders: satır fiyatı siparişte ödenen fiyattır, ürünün bugünkü fiyatı değil", async (t) => {
  const docs = [
    new Order({
      _id: ORDER(1), user: USER(1), city: "Devrek", phone: "05551112233", deliveryPoint: "girlsDorm",
      products: [
        { product: PRODUCT(1), name: "Süt", quantity: 2, price: 70 },
        { product: PRODUCT(2), name: "Ekmek", quantity: 3, price: 8.5 },
      ],
      subtotalAmount: 165.5, couponDiscount: 10.004, totalAmount: 155.496, productTotal: 155.5, deliveryFee: 0,
      status: "Teslim Edildi", createdAt: new Date("2026-10-20T10:00:00Z"),
    }),
  ];
  // populate taklidi: ürünün bugünkü fiyatı farklı (indirim bitti)
  docs[0].products[0].product = new Product({ _id: oid(PRODUCT(1)), name: "Süt", price: 100, image: "milk.png" });
  docs[0].products[1].product = null; // ürün silinmiş
  let captured = null;
  t.mock.method(Order, "find", (filter, projection, options) => { captured = { filter, projection, options }; return chain(docs); });
  const res = response();
  await getUserOrders({ user: { _id: USER(1), role: "customer" }, query: {} }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const [order] = res.body.orders;
  assert.deepEqual(order.products[0], { productId: oid(PRODUCT(1)), name: "Süt", quantity: 2, price: 70, lineTotal: 140, image: "milk.png" });
  assert.deepEqual(order.products[1], { productId: null, name: "Ekmek", quantity: 3, price: 8.5, lineTotal: 25.5, image: null });
  assert.equal(order.totalAmount, 155.5);
  assert.equal(order.couponDiscount, 10);
  assert.equal(order.subtotalAmount, 165.5);
  assert.equal(order.productTotal, 155.5);
  assert.equal(res.body.hasMore, false);
  assert.equal(res.body.nextBefore, null);
  assert.equal(String(captured.filter.user), USER(1));
  assert.equal(captured.filter.createdAt, undefined);
  assert.equal(captured.options.limit, undefined, "uygulama parametresiz çağırır: geçmişin tamamı döner, kesilmez");
});

test("GET /user-orders: parametresiz istek (mobil uygulama) 100'den fazla siparişin hepsini döndürür", async (t) => {
  const total = USER_ORDERS_DEFAULT_LIMIT + 25;
  const docs = Array.from({ length: total }, (_, i) => ({
    _id: ORDER(i + 1), products: [], totalAmount: 10, status: "Teslim Edildi",
    createdAt: new Date(Date.UTC(2026, 0, 1) + (total - i) * 60 * 60 * 1000),
  }));
  let captured = null;
  t.mock.method(Order, "find", (filter, projection, options) => {
    captured = { filter, options };
    return chain(options?.limit ? docs.slice(0, options.limit) : docs);
  });
  const res = response();
  await getUserOrders({ user: { _id: USER(1), role: "customer" }, query: {} }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(captured.options.limit, undefined);
  assert.equal(res.body.orders.length, total);
  assert.equal(res.body.hasMore, false);
  assert.equal(res.body.nextBefore, null);
  // Boş ?limit= de parametresiz sayılır
  const blank = response();
  await getUserOrders({ user: { _id: USER(1), role: "customer" }, query: { limit: "" } }, blank);
  assert.equal(blank.body.orders.length, total);
});

test("GET /user-orders: ?limit ve ?before ile sayfalama; sınırlar korunur", async (t) => {
  assert.equal(parseUserOrdersLimit(undefined), 100);
  assert.equal(parseUserOrdersLimit("5"), 5);
  assert.equal(parseUserOrdersLimit("0"), 100);
  assert.equal(parseUserOrdersLimit("abc"), 100);
  assert.equal(parseUserOrdersLimit("100000"), USER_ORDERS_MAX_LIMIT);
  assert.equal(parseUserOrdersBefore("not-a-date"), null);
  assert.equal(parseUserOrdersBefore(["2026-10-01"]), null);
  assert.equal(parseUserOrdersBefore("2026-10-01T00:00:00.000Z").toISOString(), "2026-10-01T00:00:00.000Z");

  const mk = (n, at) => ({ _id: ORDER(n), products: [], totalAmount: 10, status: "Teslim Edildi", createdAt: new Date(at) });
  const docs = [mk(3, "2026-10-03T00:00:00Z"), mk(2, "2026-10-02T00:00:00Z"), mk(1, "2026-10-01T00:00:00Z")];
  let captured = null;
  t.mock.method(Order, "find", (filter, projection, options) => {
    captured = { filter, options };
    return chain(docs.slice(0, options.limit));
  });
  const res = response();
  await getUserOrders({ user: { _id: USER(1), role: "customer" }, query: { limit: "2", before: "2026-10-05T00:00:00.000Z" } }, res);
  assert.equal(captured.options.limit, 3);
  assert.equal(captured.filter.createdAt.$lt.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.deepEqual(res.body.orders.map((o) => String(o._id)), [ORDER(3), ORDER(2)]);
  assert.equal(res.body.hasMore, true);
  assert.equal(res.body.nextBefore, "2026-10-02T00:00:00.000Z");

  // Geçersiz before yok sayılır (uygulamanın bugünkü isteği parametresizdir)
  const plain = response();
  await getUserOrders({ user: { _id: USER(1), role: "customer" }, query: { before: "x" } }, plain);
  assert.equal(captured.filter.createdAt, undefined);
  assert.equal(plain.body.orders.length, 3);
  assert.equal(plain.body.hasMore, false);
});
