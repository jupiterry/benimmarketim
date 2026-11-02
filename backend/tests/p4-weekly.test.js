// Haftalık fırsatlar (P4): planlı fırsat, dakikalık işte yayına alma, yeni haftaya kopyalama ve indirim
// yüzdesinin güncel liste fiyatından hesaplanması. Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Product from "../models/product.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import {
  activateDueWeeklyDeals,
  applyWeeklyPricesToProducts,
  carryOverDealPrice,
  dealDiscountRatio,
  decorateProduct,
  findWeeklyConflict,
  invalidateWeeklyPriceCache,
  resetWeeklyScheduleState,
  roundDealPrice,
  runWeeklyWrite,
  serializeWeeklyDeal,
  syncWeeklyDealSchedule,
  weeklyDiscountPercent,
  weeklyRangesOverlap,
} from "../services/weeklyPrice.service.js";
import { onProductCachesInvalidated } from "../services/productCache.service.js";
import {
  ALREADY_LIVE_MESSAGE,
  OTHER_LIVE_MESSAGE,
  PLANNED_TOGGLE_MESSAGE,
  WEEKLY_COPY_MAX,
  addWeeklyProduct,
  copyWeeklyProducts,
  getAllWeeklyProducts,
  getWeeklyProducts,
  removeWeeklyProduct,
  toggleWeeklyProductStatus,
  updateWeeklyProduct,
} from "../controllers/weeklyProduct.controller.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const PID = (n) => hex("44aa", n);
const WID = (n) => hex("77bb", n);
const ADMIN = hex("adad", 1);
const oid = (id) => new mongoose.Types.ObjectId(id);
const MIN = 60 * 1000;
const H = 60 * MIN;
const DAY = 24 * H;

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

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

/** Yönetici isteği: audit kaydı ve soket yayınını yakalar */
const adminReq = ({ body = {}, params = {}, method = "POST", url = "/api/weekly-products" } = {}) => {
  const emits = [];
  return {
    body,
    params,
    method,
    originalUrl: url,
    user: { _id: ADMIN, role: "admin" },
    app: { get: (key) => (key === "io" ? { emit: (event) => emits.push(event) } : null) },
    emits,
  };
};

const captureAudit = (t) => {
  const entries = [];
  t.mock.method(AdminAudit, "create", async (entry) => { entries.push(entry); return entry; });
  return entries;
};
const countInvalidations = (t) => {
  const counter = { n: 0 };
  const off = onProductCachesInvalidated(() => { counter.n += 1; });
  t.after(off);
  return counter;
};
const modified = (n = 1) => ({ matchedCount: n, modifiedCount: n });
const flush = () => new Promise((resolve) => setImmediate(resolve));

// ── İndirim yüzdesi ve fiyat taşıma ──────────────────────────────────────────

test("indirim yüzdesi güncel liste fiyatından: ₺30'a ₺25 %17; liste ₺36 olunca %31", () => {
  assert.equal(weeklyDiscountPercent(30, 25), 17);
  assert.equal(weeklyDiscountPercent(36, 25), 31);
  assert.equal(weeklyDiscountPercent(25, 25), 0, "liste fiyatına eşit fırsat indirim değildir");
  assert.equal(weeklyDiscountPercent(20, 25), 0, "liste fiyatı fırsatın altına düşerse indirim yok");
  assert.equal(weeklyDiscountPercent(0, 5), 0);
  assert.equal(weeklyDiscountPercent(null, 5), 0);
  assert.equal(weeklyDiscountPercent(100, ""), 0);
  assert.equal(weeklyDiscountPercent(100, 0.01), 99, "%100 gösterilmez");
  assert.equal(weeklyDiscountPercent("36", "25"), 31);
});

test("aynı indirim oranı güncel liste fiyatına uygulanır (kuruşa yuvarlanır)", () => {
  // listPriceAtStart varsa tam oran: ₺25/₺30 → ₺36'da ₺30
  assert.deepEqual(carryOverDealPrice({ weeklyPrice: 25, listPriceAtStart: 30, discountPercentage: 17 }, 36), { price: 30, percent: 17 });
  // Liste fiyatı değişmediyse fiyat aynen kalır
  assert.deepEqual(carryOverDealPrice({ weeklyPrice: 25, listPriceAtStart: 30 }, 30), { price: 25, percent: 17 });
  // Eski kayıt (listPriceAtStart yok), liste değişmemiş: kayıtlı %17 yuvarlanmış olduğu için tam oran kullanılır (₺24,90 değil)
  assert.equal(dealDiscountRatio({ weeklyPrice: 25, discountPercentage: 17 }, 30), 5 / 30);
  assert.deepEqual(carryOverDealPrice({ weeklyPrice: 25, discountPercentage: 17 }, 30), { price: 25, percent: 17 });
  // Eski kayıt, liste değişmiş: kayıtlı yüzde uygulanır (36 × 0,83)
  assert.equal(dealDiscountRatio({ weeklyPrice: 25, discountPercentage: 17 }, 36), 0.17);
  assert.deepEqual(carryOverDealPrice({ weeklyPrice: 25, discountPercentage: 17 }, 36), { price: 29.88, percent: 17 });
  // İndirim kalmıyorsa null
  assert.equal(carryOverDealPrice({ weeklyPrice: 30, listPriceAtStart: 30 }, 36), null);
  assert.equal(carryOverDealPrice({ weeklyPrice: 25, listPriceAtStart: 30 }, 0), null);
  assert.equal(carryOverDealPrice({ weeklyPrice: 0, listPriceAtStart: 30 }, 30), null);
  // Kuruş yuvarlaması (ondalık hata yok)
  assert.deepEqual(carryOverDealPrice({ weeklyPrice: 8.49, listPriceAtStart: 9.99 }, 12.49), { price: 10.61, percent: 15 });
});

test("yuvarlama: en yakın ,90 / ,50; liste fiyatına ulaşan ya da 0 olan aday kullanılmaz", () => {
  assert.equal(roundDealPrice(29.88, "none", 36), 29.88);
  assert.equal(roundDealPrice(29.88, "90", 36), 29.9);
  assert.equal(roundDealPrice(29.88, "50", 36), 29.5);
  assert.equal(roundDealPrice(30, "90", 36), 29.9);
  assert.equal(roundDealPrice(30, "50", 36), 29.5, "eşit uzaklıkta düşük olan (müşteri lehine)");
  assert.equal(roundDealPrice(30.45, "50", 36), 30.5);
  assert.equal(roundDealPrice(9.93, "90", 9.95), 9.9);
  assert.equal(roundDealPrice(0.79, "90", 0.95), 0.9);
  assert.equal(roundDealPrice(0.81, "90", 0.9), 0.81, "tek uygun aday liste fiyatına eşit: kuruş fiyatı kalır");
  assert.equal(roundDealPrice(0.3, "50", 2), 0.5);
  assert.equal(roundDealPrice(29.88, "x", 36), 29.88);
  assert.deepEqual(carryOverDealPrice({ weeklyPrice: 25, listPriceAtStart: 30 }, 36, "90"), { price: 29.9, percent: 17 });
});

test("tarih aralığı çakışması: uç uca dönemler çakışmaz; boş bitiş süresizdir", () => {
  const mon = new Date("2026-11-09T00:00:00+03:00");
  const sunEnd = new Date(+mon + 7 * DAY - 1);
  assert.equal(weeklyRangesOverlap(mon, sunEnd, new Date(+sunEnd + 1), null), false);
  assert.equal(weeklyRangesOverlap(mon, sunEnd, new Date(+mon - DAY), mon), false);
  assert.equal(weeklyRangesOverlap(mon, null, new Date(+mon + 30 * DAY), null), true);
  assert.equal(weeklyRangesOverlap(mon, sunEnd, new Date(+mon + DAY), new Date(+mon + 2 * DAY)), true);
});

test("çakışma kuralı: planlı aralıklar çakışamaz; yayındaki fırsat planlı başlangıçtan önce bitmeli", () => {
  const now = new Date();
  const start = new Date(+now + 2 * DAY);
  const end = new Date(+start + 7 * DAY - 1);
  const planned = { _id: oid(WID(1)), scheduled: true, isActive: false, startDate: new Date(+start + 3 * DAY), endDate: new Date(+start + 10 * DAY) };
  const endedPlan = { _id: oid(WID(2)), scheduled: true, isActive: false, startDate: new Date(+now - 3 * DAY), endDate: new Date(+now - DAY) };
  const liveOpen = { _id: oid(WID(3)), isActive: true, scheduled: false, startDate: new Date(+now - DAY), endDate: null };
  const liveUntilStart = { ...liveOpen, endDate: start };
  const paused = { _id: oid(WID(4)), isActive: false, scheduled: false, endDate: null };

  assert.equal(findWeeklyConflict({ start, end, planned: true }, [planned], now).code, "PLANNED_OVERLAP");
  assert.equal(findWeeklyConflict({ start, end: new Date(+start + DAY), planned: true }, [planned], now), null);
  assert.equal(findWeeklyConflict({ id: planned._id, start, end, planned: true }, [planned], now), null, "kendisiyle çakışmaz");
  assert.equal(findWeeklyConflict({ start, end, planned: true }, [endedPlan, paused], now), null, "biten plan ve durdurulan fırsat engel değil");
  assert.equal(findWeeklyConflict({ start, end, planned: true }, [liveOpen], now).code, "LIVE_OVERLAP");
  assert.equal(findWeeklyConflict({ start, end, planned: true }, [{ ...liveOpen, endDate: new Date(+start + 1) }], now).code, "LIVE_OVERLAP");
  assert.equal(findWeeklyConflict({ start, end, planned: true }, [liveUntilStart], now), null, "başlangıçta biten yayındaki fırsat engel değil");
  assert.equal(findWeeklyConflict({ start: now, end: null, planned: false }, [liveUntilStart], now).code, "ALREADY_LIVE");
  // Hemen başlayan süresiz fırsat gelecek haftanın planıyla çakışır
  assert.equal(findWeeklyConflict({ start: now, end: null, planned: false }, [planned], now).code, "PLANNED_OVERLAP");
  assert.equal(findWeeklyConflict({ start: now, end: planned.startDate, planned: false }, [planned], now), null);
});

// ── Okuma: güncel yüzde ──────────────────────────────────────────────────────

test("ürün listeleri: haftalık yüzde ve liste fiyatı ürünün güncel fiyatından (kayıttaki %17 bayat)", async (t) => {
  const shown = decorateProduct({ _id: PID(1), price: 36 }, { weeklyPrice: 25, discountPercentage: 17, originalPrice: 30 });
  assert.equal(shown.weeklyDiscountPercentage, 31);
  assert.equal(shown.originalPrice, 36);
  assert.equal(shown.actualPrice, 25);
  // Fiyatı okunmamış üründe (projeksiyon) önbellekteki liste fiyatı kullanılır
  assert.equal(decorateProduct({ _id: PID(1) }, { weeklyPrice: 25, discountPercentage: 17, originalPrice: 30 }).weeklyDiscountPercentage, 17);

  invalidateWeeklyPriceCache();
  t.mock.method(WeeklyProduct, "find", () => chain([
    { product: { _id: oid(PID(1)), price: 30 }, weeklyPrice: 25, discountPercentage: 17, isActive: true },
  ]));
  const [item] = await applyWeeklyPricesToProducts([{ _id: oid(PID(1)), name: "Deterjan", price: 36 }]);
  assert.equal(item.isWeeklyProduct, true);
  assert.equal(item.weeklyDiscountPercentage, 31, "önbellek eski fiyatla yüklense de yüzde güncel üründen");
  assert.equal(item.actualPrice, 25);
  invalidateWeeklyPriceCache();
});

test("GET /weekly-products (uygulama): yüzde güncel fiyattan; planlı fırsat yalnızca aktif filtresiyle okunmaz", async (t) => {
  const now = new Date();
  let filter = null;
  t.mock.method(WeeklyProduct, "find", (f) => {
    filter = f;
    return chain([
      { _id: "a", product: { name: "Deterjan", price: 36 }, weeklyPrice: 25, discountPercentage: 17, isActive: true, endDate: new Date(+now + H) },
      { _id: "b", product: { name: "Süt", price: 40 }, weeklyPrice: 30, discountPercentage: 25, isActive: false, scheduled: true, startDate: new Date(+now + H) },
    ]);
  });
  const res = response();
  await getWeeklyProducts({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(filter.isActive, true, "planlı (isActive:false) kayıtlar sorguya hiç girmez");
  assert.deepEqual(res.body.weeklyProducts.map((wp) => wp._id), ["a"]);
  assert.equal(res.body.weeklyProducts[0].discountPercentage, 31);
  assert.equal(res.body.weeklyProducts[0].weeklyPrice, 25, "diğer alanlar aynı");
});

test("GET /weekly-products/all (panel): güncel ve başlangıçtaki yüzde, planlı bayrağı, sunucu saati", async (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([
    { _id: "a", product: { _id: PID(1), name: "Deterjan", price: 36 }, weeklyPrice: 25, discountPercentage: 17, listPriceAtStart: 30, isActive: true },
    { _id: "b", product: { _id: PID(2), name: "Süt", price: 40 }, weeklyPrice: 30, discountPercentage: 20, isActive: true },
    { _id: "c", product: null, weeklyPrice: 5, discountPercentage: 10, scheduled: true, isActive: false },
  ]));
  const res = response();
  await getAllWeeklyProducts({}, res);
  assert.equal(res.statusCode, 200);
  const [a, b, c] = res.body.weeklyProducts;
  assert.equal(a.discountPercentage, 31);
  assert.equal(a.startDiscountPercentage, 17);
  assert.equal(a.listPriceAtStart, 30);
  assert.equal(a.scheduled, false);
  assert.equal(b.discountPercentage, 25, "eski kayıt: güncel yüzde");
  assert.equal(b.startDiscountPercentage, 20, "eski kayıt: kayıttaki yüzde");
  assert.equal(b.listPriceAtStart, null);
  assert.equal(c.scheduled, true);
  assert.equal(c.discountPercentage, 10, "ürün silinmişse kayıttaki yüzde");
  assert.ok(!Number.isNaN(Date.parse(res.body.serverTime)));
});

test("serializeWeeklyDeal Mongoose belgesini de çevirir", () => {
  const doc = { toObject: () => ({ _id: "x", product: { price: 50 }, weeklyPrice: 40, discountPercentage: 5 }) };
  const out = serializeWeeklyDeal(doc);
  assert.equal(out.discountPercentage, 20);
  assert.equal(out.startDiscountPercentage, 5);
});

// ── Ekleme / planlama ────────────────────────────────────────────────────────

const PRODUCT = { _id: oid(PID(1)), name: "Deterjan", price: 30, isHidden: false, isOutOfStock: false };

const mockAdd = (t, { product = PRODUCT, others = [], createError = null } = {}) => {
  const calls = { create: [], updateOne: [], find: [] };
  t.mock.method(Product, "findById", () => chain(product));
  t.mock.method(WeeklyProduct, "find", (filter) => { calls.find.push(filter); return chain(others); });
  t.mock.method(WeeklyProduct, "updateOne", async (filter, update) => { calls.updateOne.push({ filter, update }); return modified(1); });
  t.mock.method(WeeklyProduct, "create", async (doc) => {
    if (createError) throw createError;
    calls.create.push(doc);
    return { _id: oid(WID(99)), ...doc };
  });
  t.mock.method(WeeklyProduct, "findById", () => chain(() => ({ _id: oid(WID(99)), ...calls.create.at(-1), product })));
  return calls;
};

test("planlı fırsat: ileri başlangıçla isActive:false + scheduled:true, liste fiyatı saklanır, önbellek temizlenmez", async (t) => {
  const audit = captureAudit(t);
  const inv = countInvalidations(t);
  const calls = mockAdd(t);
  const start = new Date(Date.now() + 2 * DAY);
  const end = new Date(+start + 7 * DAY - 1);
  const req = adminReq({ body: { productId: PID(1), weeklyPrice: 25, discountPercentage: 99, startDate: start.toISOString(), endDate: end.toISOString(), order: 4 } });
  const res = response();
  await addWeeklyProduct(req, res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const doc = calls.create[0];
  assert.equal(doc.isActive, false);
  assert.equal(doc.scheduled, true);
  assert.equal(+doc.startDate, +start);
  assert.equal(+doc.endDate, +end);
  assert.equal(doc.listPriceAtStart, 30);
  assert.equal(doc.discountPercentage, 17, "yüzde sunucuda hesaplanır, istemcinin değeri kullanılmaz");
  assert.equal(doc.order, 4);
  assert.equal(inv.n, 0, "planlı fırsat fiyatları etkilemez");
  assert.equal(res.body.weeklyProduct.scheduled, true);
  assert.deepEqual(req.emits, ["weeklyProductsUpdated"]);
  await flush();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "Haftalık fırsat planlandı");
  assert.ok(audit[0].changes.some((c) => c.label === "Başlangıç"));
});

test("fırsat ekleme doğrulaması: kimlik, fiyat, tarih ve ürün", async (t) => {
  captureAudit(t);
  const calls = mockAdd(t);
  const future = new Date(Date.now() + DAY);
  const cases = [
    [{ productId: "x", weeklyPrice: 10 }, 400, /Geçersiz ürün/],
    [{ productId: PID(1) }, 400, /fırsat fiyatı/],
    [{ productId: PID(1), weeklyPrice: -1 }, 400, /fırsat fiyatı/],
    [{ productId: PID(1), weeklyPrice: { $gt: 0 } }, 400, /fırsat fiyatı/],
    [{ productId: PID(1), weeklyPrice: 30 }, 400, /liste fiyatından/],
    [{ productId: PID(1), weeklyPrice: 25, startDate: "yarın" }, 400, /başlangıç/],
    [{ productId: PID(1), weeklyPrice: 25, endDate: new Date(Date.now() - H).toISOString() }, 400, /geçmiş/],
    [{ productId: PID(1), weeklyPrice: 25, startDate: future.toISOString(), endDate: new Date(+future - H).toISOString() }, 400, /başlangıçtan sonra/],
    [{ productId: PID(1), weeklyPrice: 25, startDate: new Date(Date.now() + 400 * DAY).toISOString() }, 400, /bir yıl/],
    [{ productId: PID(1), weeklyPrice: 25, order: "ilk" }, 400, /sıra/],
  ];
  for (const [body, status, message] of cases) {
    const res = response();
    await addWeeklyProduct(adminReq({ body }), res);
    assert.equal(res.statusCode, status, JSON.stringify(body));
    assert.match(res.body.message, message, JSON.stringify(body));
  }
  assert.equal(calls.create.length, 0);

  t.mock.method(Product, "findById", () => chain(null));
  const missing = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(2), weeklyPrice: 5 } }), missing);
  assert.equal(missing.statusCode, 404);
});

test("planlı fırsat çakışmaları: başka planla çakışma 409; yayındaki süresiz fırsat 409 LIVE_OVERLAP, istenirse bitişi başlangıca çekilir", async (t) => {
  captureAudit(t);
  const now = Date.now();
  const start = new Date(now + 2 * DAY);
  const end = new Date(+start + 7 * DAY - 1);
  const live = { _id: oid(WID(1)), product: PRODUCT._id, isActive: true, scheduled: false, startDate: new Date(now - DAY), endDate: null };
  const plan = { _id: oid(WID(2)), product: PRODUCT._id, isActive: false, scheduled: true, startDate: new Date(+start + DAY), endDate: new Date(+start + 3 * DAY) };

  let calls = mockAdd(t, { others: [plan] });
  let res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25, startDate: start, endDate: end } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "PLANNED_OVERLAP");
  assert.equal(res.body.conflict._id, WID(2));
  assert.equal(calls.create.length, 0);

  t.mock.restoreAll();
  const audit = captureAudit(t);
  calls = mockAdd(t, { others: [live] });
  res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25, startDate: start, endDate: end } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "LIVE_OVERLAP");
  assert.match(res.body.message, /şu an yayında \(bitiş: süresiz\)/);
  assert.equal(calls.updateOne.length, 0);

  // "Mevcut fırsatın bitişini başlangıca çek"
  res = response();
  const inv = countInvalidations(t);
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25, startDate: start, endDate: end, endLiveAtStart: true } }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(calls.updateOne.length, 1);
  assert.equal(String(calls.updateOne[0].filter._id), WID(1));
  assert.equal(calls.updateOne[0].filter.isActive, true, "koşullu: yayındaki kayıt bu arada değişmediyse");
  assert.equal(+calls.updateOne[0].update.$set.endDate, +start);
  assert.equal(calls.updateOne[0].update.$set.isActive, undefined, "yayında kalır, başlangıçta biter");
  assert.equal(calls.create[0].scheduled, true);
  assert.equal(inv.n, 1, "yayındaki fırsatın bitişi değişti: önbellek temizlenir");
  await flush();
  assert.equal(audit.length, 1);
  assert.ok(audit[0].changes.some((c) => c.label === "Yayındaki fırsatın bitişi" && c.from === "süresiz"));

  // Yayındaki fırsat başlangıçta ya da önce bitiyorsa çakışma yok
  t.mock.restoreAll();
  captureAudit(t);
  calls = mockAdd(t, { others: [{ ...live, endDate: start }] });
  res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25, startDate: start, endDate: end } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(calls.updateOne.length, 0);
});

test("hemen başlayan fırsat: ürün yayındaysa eskisi gibi 400; süresiz fırsat gelecek planla çakışırsa 409; süresi dolmuş kayıt kapatılır", async (t) => {
  captureAudit(t);
  const now = Date.now();
  const live = { _id: oid(WID(1)), product: PRODUCT._id, isActive: true, startDate: new Date(now - DAY), endDate: new Date(now + DAY) };
  let calls = mockAdd(t, { others: [live] });
  let res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25 } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, ALREADY_LIVE_MESSAGE);
  assert.equal(calls.create.length, 0);

  t.mock.restoreAll();
  captureAudit(t);
  const plan = { _id: oid(WID(2)), product: PRODUCT._id, isActive: false, scheduled: true, startDate: new Date(now + 3 * DAY), endDate: new Date(now + 10 * DAY) };
  calls = mockAdd(t, { others: [plan] });
  res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25, endDate: null } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "PLANNED_OVERLAP");
  res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25, endDate: plan.startDate.toISOString() } }), res);
  assert.equal(res.statusCode, 201, "plan başlarken biten fırsat eklenebilir");
  assert.equal(calls.create[0].isActive, true);
  assert.equal(calls.create[0].scheduled, false);

  t.mock.restoreAll();
  captureAudit(t);
  const stale = { _id: oid(WID(3)), product: PRODUCT._id, isActive: true, endDate: new Date(now - MIN) };
  calls = mockAdd(t, { others: [stale] });
  res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25, startDate: "now" } }), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.updateOne[0].update, { $set: { isActive: false } });
  assert.equal(calls.create[0].isActive, true);

  // Aynı anda iki istek: tekil indeks ikinciyi reddeder → 400, sunucu hatası değil
  t.mock.restoreAll();
  captureAudit(t);
  mockAdd(t, { createError: Object.assign(new Error("E11000 duplicate key"), { code: 11000 }) });
  res = response();
  await addWeeklyProduct(adminReq({ body: { productId: PID(1), weeklyPrice: 25 } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "ALREADY_LIVE");
});

// ── Düzenleme ────────────────────────────────────────────────────────────────

const plannedDoc = (fields = {}) => {
  const start = new Date(Date.now() + 2 * DAY);
  return {
    _id: oid(WID(10)),
    product: { _id: oid(PID(1)), name: "Deterjan", price: 36 },
    weeklyPrice: 25,
    discountPercentage: 17,
    listPriceAtStart: 30,
    isActive: false,
    scheduled: true,
    startDate: start,
    endDate: new Date(+start + 7 * DAY - 1),
    order: 2,
    saves: 0,
    async save() { this.saves += 1; },
    ...fields,
  };
};

const mockUpdate = (t, doc, { others = [] } = {}) => {
  const calls = { find: [], updateOne: [] };
  t.mock.method(WeeklyProduct, "findById", () => chain(doc));
  t.mock.method(WeeklyProduct, "find", (filter) => { calls.find.push(filter); return chain(others); });
  t.mock.method(WeeklyProduct, "updateOne", async (filter, update) => { calls.updateOne.push({ filter, update }); return modified(1); });
  t.mock.method(Product, "findById", () => chain({ name: "Deterjan" }));
  return calls;
};

test("planlı fırsat düzenleme: fiyat değişince liste fiyatı dayanağı güncellenir; tarihler doğrulanır", async (t) => {
  const audit = captureAudit(t);
  const doc = plannedDoc();
  const calls = mockUpdate(t, doc);
  const newStart = new Date(Date.now() + 3 * DAY);
  const newEnd = new Date(+newStart + 7 * DAY - 1);
  const res = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { weeklyPrice: 29.9, startDate: newStart.toISOString(), endDate: newEnd.toISOString() } }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.weeklyPrice, 29.9);
  assert.equal(doc.listPriceAtStart, 36);
  assert.equal(doc.discountPercentage, 17);
  assert.equal(+doc.startDate, +newStart);
  assert.equal(+doc.endDate, +newEnd);
  assert.equal(doc.isActive, false);
  assert.equal(doc.scheduled, true);
  assert.equal(doc.saves, 1);
  assert.equal(calls.find.length, 1, "tarih değişti: çakışma denetlendi");
  await flush();
  assert.equal(audit[0].action, "Planlı haftalık fırsat düzenlendi");

  const bad = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { endDate: new Date(+newStart - H).toISOString() } }), bad);
  assert.equal(bad.statusCode, 400);
  assert.match(bad.body.message, /başlangıçtan sonra/);

  const toggleViaPut = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { isActive: true } }), toggleViaPut);
  assert.equal(toggleViaPut.statusCode, 400);
  assert.equal(toggleViaPut.body.message, PLANNED_TOGGLE_MESSAGE);

  const invalid = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: "abc" }, body: {} }), invalid);
  assert.equal(invalid.statusCode, 400);
});

test("planlı fırsat 'Şimdi' başlatılır: yayındaki fırsat varsa 409, istenirse yayındaki kapatılıp yenisi açılır", async (t) => {
  captureAudit(t);
  const live = { _id: oid(WID(11)), product: oid(PID(1)), isActive: true, scheduled: false, startDate: new Date(Date.now() - DAY), endDate: null };
  let doc = plannedDoc();
  let calls = mockUpdate(t, doc, { others: [live] });
  let res = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { startDate: "now" } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "ALREADY_LIVE");
  assert.equal(res.body.message, OTHER_LIVE_MESSAGE);
  assert.equal(doc.saves, 0);

  res = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { startDate: "now", endLiveAtStart: true } }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(calls.updateOne.length, 1);
  assert.equal(calls.updateOne[0].update.$set.isActive, false, "yayındaki şimdi kapatılır");
  assert.equal(doc.isActive, true);
  assert.equal(doc.scheduled, false);
  assert.ok(Math.abs(+doc.startDate - Date.now()) < 5000);

  // Yayında fırsat yokken doğrudan başlar
  t.mock.restoreAll();
  captureAudit(t);
  doc = plannedDoc();
  calls = mockUpdate(t, doc, { others: [] });
  res = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { startDate: "now" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(doc.isActive, true);
  assert.equal(calls.updateOne.length, 0);
});

test("liste fiyatı uyarısı: 'Böyle kalsın' dayanağı günceller, fiyat değişmez; aynı fiyatla kayıt uyarıyı silmez", async (t) => {
  const audit = captureAudit(t);
  const doc = plannedDoc({ isActive: true, scheduled: false, startDate: new Date(Date.now() - DAY), endDate: null });
  const calls = mockUpdate(t, doc);
  const res = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { acknowledgeListPrice: true } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(doc.weeklyPrice, 25);
  assert.equal(doc.listPriceAtStart, 36);
  assert.equal(doc.discountPercentage, 31);
  assert.equal(calls.find.length, 0, "tarih/durum değişmedi: çakışma sorgusu yok");
  await flush();
  assert.ok(audit[0].changes.some((c) => c.label === "Liste fiyatı uyarısı"));

  const old = plannedDoc({ isActive: true, scheduled: false, startDate: new Date(Date.now() - DAY), endDate: null, listPriceAtStart: undefined });
  mockUpdate(t, old);
  const same = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { weeklyPrice: 25, order: 1 } }), same);
  assert.equal(same.statusCode, 200);
  assert.equal(old.listPriceAtStart, undefined, "fiyat değişmedi: eski kaydın dayanağı korunur");
  assert.equal(old.discountPercentage, 17);
  assert.equal(old.order, 1);
});

test("yayındaki fırsatın bitişi planlı fırsatın başlangıcını aşamaz", async (t) => {
  captureAudit(t);
  const planStart = new Date(Date.now() + 2 * DAY);
  const plan = { _id: oid(WID(12)), product: oid(PID(1)), isActive: false, scheduled: true, startDate: planStart, endDate: new Date(+planStart + 7 * DAY) };
  const doc = plannedDoc({ isActive: true, scheduled: false, startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY) });
  mockUpdate(t, doc, { others: [plan] });
  const res = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { endDate: new Date(+planStart + DAY).toISOString() } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "PLANNED_OVERLAP");
  const ok = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { endDate: planStart.toISOString() } }), ok);
  assert.equal(ok.statusCode, 200);

  const start = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { startDate: planStart.toISOString() } }), start);
  assert.equal(start.statusCode, 400, "yayındaki fırsatın başlangıcı değiştirilemez");
});

// ── Durum değiştirme ve iptal ────────────────────────────────────────────────

test("toggle: planlı fırsat açılamaz; yeniden açılan fırsat plan ve başka yayındaki fırsatla çakışamaz", async (t) => {
  captureAudit(t);
  const plan = { _id: oid(WID(13)), product: oid(PID(1)), isActive: false, scheduled: true, startDate: new Date(Date.now() + DAY), endDate: null };
  t.mock.method(WeeklyProduct, "findById", () => chain({ ...plannedDoc(), product: oid(PID(1)) }));
  let res = response();
  await toggleWeeklyProductStatus(adminReq({ method: "PATCH", params: { id: WID(10) } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, PLANNED_TOGGLE_MESSAGE);

  const paused = { ...plannedDoc({ isActive: false, scheduled: false, startDate: new Date(Date.now() - 5 * DAY), endDate: null }), product: oid(PID(1)) };
  t.mock.method(WeeklyProduct, "findById", () => chain(paused));
  t.mock.method(WeeklyProduct, "find", () => chain([plan]));
  res = response();
  await toggleWeeklyProductStatus(adminReq({ method: "PATCH", params: { id: WID(10) } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "PLANNED_OVERLAP");
  assert.equal(paused.saves, 0);

  t.mock.method(WeeklyProduct, "find", () => chain([{ _id: oid(WID(14)), product: oid(PID(1)), isActive: true, endDate: null }]));
  res = response();
  await toggleWeeklyProductStatus(adminReq({ method: "PATCH", params: { id: WID(10) } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, OTHER_LIVE_MESSAGE);

  res = response();
  await toggleWeeklyProductStatus(adminReq({ method: "PATCH", params: { id: "../x" } }), res);
  assert.equal(res.statusCode, 400);
});

test("planlı fırsatı iptal: kayıt silinir, işlem kaydına 'iptal' yazılır", async (t) => {
  const audit = captureAudit(t);
  const doc = plannedDoc({ product: { _id: oid(PID(1)), name: "Deterjan" } });
  t.mock.method(WeeklyProduct, "findByIdAndDelete", () => chain(doc));
  const req = adminReq({ method: "DELETE", params: { id: WID(10) } });
  const res = response();
  await removeWeeklyProduct(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /iptal/);
  await flush();
  assert.equal(audit[0].action, "Planlı haftalık fırsat iptal edildi");
  assert.deepEqual(req.emits, ["weeklyProductsUpdated"]);
});

// ── Dakikalık iş: planlı fırsatı yayına alma ─────────────────────────────────

const mockSchedule = (t, { due = [], products = due.map((d) => ({ _id: d.product })), activate = () => ({ _id: "ok" }), started = 0 } = {}) => {
  const calls = { updateMany: [], updateOne: [], findOneAndUpdate: [], productFind: 0, count: [] };
  t.mock.method(WeeklyProduct, "updateMany", async (filter, update) => {
    calls.updateMany.push({ filter, update });
    return modified(filter.product ? 1 : 0);
  });
  t.mock.method(WeeklyProduct, "updateOne", async (filter, update) => { calls.updateOne.push({ filter, update }); return modified(1); });
  t.mock.method(WeeklyProduct, "find", () => chain(due));
  t.mock.method(Product, "find", () => { calls.productFind += 1; return chain(products); });
  t.mock.method(WeeklyProduct, "findOneAndUpdate", (filter, update, options) => {
    calls.findOneAndUpdate.push({ filter, update, options });
    return chain(() => activate(filter));
  });
  t.mock.method(WeeklyProduct, "countDocuments", async (filter) => { calls.count.push(filter); return started; });
  return calls;
};

test("dakikalık iş: başlangıcı gelen planlı fırsat koşullu güncellemeyle yayına alınır, eski fırsat kapatılır, önbellek bir kez temizlenir", async (t) => {
  resetWeeklyScheduleState();
  const inv = countInvalidations(t);
  const now = new Date();
  const start = new Date(+now - 30 * 1000);
  const deal = { _id: oid(WID(20)), product: oid(PID(1)), startDate: start, endDate: new Date(+start + 7 * DAY) };
  const calls = mockSchedule(t, { due: [deal], started: 1 });
  const result = await syncWeeklyDealSchedule(now);
  assert.deepEqual(result, { expired: 0, started: 1 });
  // 1: süresi dolanları kapat · 2: aynı ürünün süren fırsatının bitişini başlangıca çek · 3: kalan aktifleri kapat
  assert.equal(calls.updateMany.length, 3);
  const [, trim, stop] = calls.updateMany;
  assert.equal(String(trim.filter.product), PID(1));
  assert.equal(trim.filter.isActive, true);
  assert.equal(String(trim.filter._id.$ne), WID(20));
  assert.deepEqual(trim.filter.$or, [{ endDate: null }, { endDate: { $gt: start } }]);
  assert.deepEqual(trim.update, { $set: { isActive: false, endDate: start } });
  assert.deepEqual(stop.update, { $set: { isActive: false } });
  const [activation] = calls.findOneAndUpdate;
  assert.equal(String(activation.filter._id), WID(20));
  assert.equal(activation.filter.scheduled, true, "koşullu: başka süreç açtıysa tekrar açılmaz");
  assert.equal(activation.filter.startDate.$lte, now);
  assert.deepEqual(activation.update, { $set: { isActive: true, scheduled: false } });
  assert.equal(inv.n, 1, "tek seferde temizlenir");
});

test("dakikalık iş: geç kalan açılış da 'başladı' sayılır; başka süreç açtıysa sayılmaz; tekrar çalışmak bir şey değiştirmez", async (t) => {
  resetWeeklyScheduleState();
  const now = new Date();
  const late = { _id: oid(WID(21)), product: oid(PID(1)), startDate: new Date(+now - 3 * H), endDate: null };
  mockSchedule(t, { due: [late], started: 0 });
  assert.deepEqual(await syncWeeklyDealSchedule(now), { expired: 0, started: 1 });

  t.mock.restoreAll();
  resetWeeklyScheduleState();
  const inv = countInvalidations(t);
  const calls = mockSchedule(t, { due: [late], activate: () => null });
  t.mock.method(WeeklyProduct, "updateMany", async (filter, update) => { calls.updateMany.push({ filter, update }); return modified(0); });
  assert.deepEqual(await syncWeeklyDealSchedule(now), { expired: 0, started: 0 });
  assert.equal(inv.n, 0, "değişiklik yoksa önbellek temizlenmez");
});

test("dakikalık iş: ürünü silinmiş plan atlanır (planlı kalır); bitişi geçmiş plan hiç açılmadan kapanır; bir hata diğerlerini durdurmaz", async (t) => {
  resetWeeklyScheduleState();
  t.mock.method(console, "error", () => {});
  const now = new Date();
  const orphan = { _id: oid(WID(22)), product: oid(PID(2)), startDate: new Date(+now - MIN), endDate: null };
  const missed = { _id: oid(WID(23)), product: oid(PID(3)), startDate: new Date(+now - 9 * DAY), endDate: new Date(+now - 2 * DAY) };
  const broken = { _id: oid(WID(24)), product: oid(PID(4)), startDate: new Date(+now - MIN), endDate: null };
  const good = { _id: oid(WID(25)), product: oid(PID(5)), startDate: new Date(+now - MIN), endDate: null };
  const calls = mockSchedule(t, {
    due: [orphan, missed, broken, good],
    products: [{ _id: oid(PID(4)) }, { _id: oid(PID(5)) }],
    activate: (filter) => {
      if (String(filter._id) === WID(24)) throw Object.assign(new Error("E11000"), { code: 11000 });
      return { _id: filter._id };
    },
  });
  const summary = await runWeeklyWrite(() => activateDueWeeklyDeals(now));
  assert.equal(summary.activated, 1);
  assert.equal(summary.closed, 1);
  assert.equal(calls.productFind, 1, "ürünler tek sorguda okunur");
  assert.deepEqual(calls.findOneAndUpdate.map((c) => String(c.filter._id)), [WID(24), WID(25)], "silinmiş ürünün planı açılmaz");
  assert.equal(String(calls.updateOne[0].filter._id), WID(23));
  assert.equal(calls.updateOne[0].filter.scheduled, true);
  assert.deepEqual(calls.updateOne[0].update, { $set: { scheduled: false, isActive: false } });
});

// ── Yeni haftaya kopyalama ───────────────────────────────────────────────────

const mondayAhead = () => {
  // Gelecek pazartesi 00:00 İstanbul (UTC+3)
  const trNow = new Date(Date.now() + 3 * H);
  const dow = trNow.getUTCDay();
  const days = ((8 - dow) % 7) || 7;
  const midnight = Date.UTC(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate()) - 3 * H;
  return new Date(midnight + days * DAY);
};

const mockCopy = (t, { sources, existing = [], createError = () => null }) => {
  const calls = { create: [], updateOne: [], updateMany: [], finds: [] };
  t.mock.method(WeeklyProduct, "find", (filter) => {
    calls.finds.push(filter);
    if (filter?._id?.$in && calls.create.length && filter._id.$in.every((id) => calls.create.some((c) => String(c._id) === String(id)))) {
      return chain(calls.create.map((c) => ({ ...c, product: sources.find((s) => String(s.product?._id) === String(c.product))?.product })));
    }
    if (filter?._id?.$in) return chain(sources.filter((s) => filter._id.$in.includes(String(s._id))));
    return chain(existing);
  });
  t.mock.method(WeeklyProduct, "create", async (doc) => {
    const error = createError(doc);
    if (error) throw error;
    const created = { _id: oid(WID(100 + calls.create.length)), ...doc };
    calls.create.push(created);
    return created;
  });
  t.mock.method(WeeklyProduct, "updateOne", async (filter, update) => { calls.updateOne.push({ filter, update }); return modified(1); });
  t.mock.method(WeeklyProduct, "updateMany", async (filter, update) => { calls.updateMany.push({ filter, update }); return modified(0); });
  return calls;
};

const source = (n, product, fields = {}) => ({
  _id: oid(WID(n)),
  product: product && { _id: oid(PID(n)), name: `Ürün ${n}`, isHidden: false, isOutOfStock: false, ...product },
  weeklyPrice: 25,
  listPriceAtStart: 30,
  discountPercentage: 17,
  isActive: true,
  scheduled: false,
  startDate: new Date(Date.now() - 5 * DAY),
  endDate: null,
  order: n,
  ...fields,
});

test("kopyalama: aynı indirim oranı güncel liste fiyatına uygulanır; planlı fırsat oluşur; işlem kaydı ve yayın", async (t) => {
  const audit = captureAudit(t);
  const inv = countInvalidations(t);
  const start = mondayAhead();
  const end = new Date(+start + 7 * DAY - 1);
  const a = source(1, { price: 36 }, { endDate: new Date(+start - 1) });
  const b = source(2, { price: 10 }, { weeklyPrice: 8, listPriceAtStart: undefined, discountPercentage: 20, endDate: start });
  const calls = mockCopy(t, { sources: [a, b], existing: [a, b].map((s) => ({ ...s, product: s.product._id })) });
  const req = adminReq({ url: "/api/weekly-products/copy", body: { ids: [WID(1), WID(2)], startDate: start.toISOString(), endDate: end.toISOString() } });
  const res = response();
  await copyWeeklyProducts(req, res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.skipped, []);
  assert.deepEqual(calls.create.map((c) => c.weeklyPrice), [30, 8], "₺25/₺30 → ₺36'da ₺30; fiyatı değişmeyen ürün aynı fiyat");
  assert.deepEqual(calls.create.map((c) => c.discountPercentage), [17, 20]);
  assert.deepEqual(calls.create.map((c) => c.listPriceAtStart), [36, 10]);
  assert.ok(calls.create.every((c) => c.isActive === false && c.scheduled === true && +c.startDate === +start && +c.endDate === +end));
  assert.deepEqual(calls.create.map((c) => c.order), [1, 2], "raf sırası korunur");
  assert.equal(calls.updateOne.length, 0, "yayındakiler başlangıçtan önce bitiyor: dokunulmaz");
  assert.equal(inv.n, 0, "planlı kopya fiyatları etkilemez");
  assert.equal(res.body.created.length, 2);
  assert.ok(res.body.created.every((c) => c.scheduled === true));
  assert.deepEqual(req.emits, ["weeklyProductsUpdated"]);
  await flush();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "Haftalık fırsatlar yeni döneme planlandı");
  assert.ok(audit[0].changes.some((c) => c.label === "Dönem"));
});

test("kopyalama: ,90 yuvarlaması; silinmiş/gizli/stokta olmayan/tekrar/çakışan ürün nedeniyle atlanır", async (t) => {
  captureAudit(t);
  const start = mondayAhead();
  const end = new Date(+start + 7 * DAY - 1);
  const ok = source(1, { price: 36 }, { endDate: start });
  const deleted = source(2, null);
  const hidden = source(3, { price: 30, isHidden: true });
  const out = source(4, { price: 30, isOutOfStock: true });
  const dup = { ...source(5, { price: 30 }), product: { ...ok.product } };
  const planned = source(6, { price: 30 }, { endDate: start });
  const futurePlan = { _id: oid(WID(60)), product: oid(PID(6)), isActive: false, scheduled: true, startDate: new Date(+start + DAY), endDate: new Date(+start + 3 * DAY) };
  const liveOpen = source(7, { price: 30 }, { endDate: null });
  const noDiscount = source(8, { price: 20 }, { weeklyPrice: 25, listPriceAtStart: 20 });
  const sources = [ok, deleted, hidden, out, dup, planned, liveOpen, noDiscount];
  const existing = [
    ...sources.filter((s) => s.product).map((s) => ({ ...s, product: s.product._id })),
    futurePlan,
  ];
  const calls = mockCopy(t, { sources, existing });
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(WID);
  const res = response();
  await copyWeeklyProducts(adminReq({ body: { ids, startDate: start.toISOString(), endDate: end.toISOString(), rounding: "90" } }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(calls.create.map((c) => c.weeklyPrice), [29.9]);
  const reasons = Object.fromEntries(res.body.skipped.map((s) => [s.id, s.reason]));
  assert.equal(reasons[WID(2)], "Ürün silinmiş");
  assert.equal(reasons[WID(3)], "Ürün gizli");
  assert.equal(reasons[WID(4)], "Stokta yok");
  assert.equal(reasons[WID(5)], "Aynı ürün listede bir kez daha var");
  assert.equal(reasons[WID(6)], "Bu tarihlerde planlı fırsatı var");
  assert.equal(reasons[WID(7)], "Ürünün yayındaki fırsatı yeni başlangıçtan sonra bitiyor");
  assert.match(reasons[WID(8)], /İndirim hesaplanamadı/);
  assert.equal(reasons[WID(9)], "Fırsat bulunamadı");
  assert.equal(res.body.skipped.find((s) => s.id === WID(3)).productName, "Ürün 3");
});

test("kopyalama: gizli/stokta olmayan istenirse dahil; yayındaki süresiz fırsatın bitişi yeni başlangıca çekilir", async (t) => {
  const audit = captureAudit(t);
  const inv = countInvalidations(t);
  const start = mondayAhead();
  const end = new Date(+start + 7 * DAY - 1);
  const out = source(4, { price: 30, isOutOfStock: true }, { endDate: start });
  const liveOpen = source(7, { price: 30 }, { endDate: null });
  const sources = [out, liveOpen];
  const calls = mockCopy(t, { sources, existing: sources.map((s) => ({ ...s, product: s.product._id })) });
  const res = response();
  await copyWeeklyProducts(adminReq({ body: { ids: [WID(4), WID(7)], startDate: start.toISOString(), endDate: end.toISOString(), includeUnavailable: true, endLiveAtStart: true } }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(calls.create.length, 2);
  assert.equal(calls.updateOne.length, 1);
  assert.equal(String(calls.updateOne[0].filter._id), WID(7));
  assert.deepEqual(calls.updateOne[0].update, { $set: { endDate: start } });
  assert.equal(inv.n, 1, "yayındaki fırsatın bitişi değişti");
  await flush();
  assert.ok(audit[0].changes.some((c) => c.label.includes("yayındaki bitiş")));
});

test("kopyalama 'Şimdi': yeni fırsatlar hemen yayında; yayındaki istenirse kapatılır, süresi dolmuş kayıt engel olmaz", async (t) => {
  captureAudit(t);
  const inv = countInvalidations(t);
  const end = new Date(Date.now() + 6 * DAY);
  const live = source(1, { price: 36 }, { endDate: new Date(Date.now() + DAY) });
  const calls = mockCopy(t, { sources: [live], existing: [{ ...live, product: live.product._id }] });
  let res = response();
  await copyWeeklyProducts(adminReq({ body: { ids: [WID(1)], startDate: "now", endDate: end.toISOString() } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.skipped[0].reason, "Ürün şu an yayında");
  assert.equal(calls.create.length, 0);
  assert.equal(calls.updateMany.length, 1, "süresi dolmuş kayıtlar kapatıldı");
  assert.equal(calls.updateMany[0].filter.endDate.$lte instanceof Date, true);

  res = response();
  await copyWeeklyProducts(adminReq({ body: { ids: [WID(1)], startDate: "now", endDate: end.toISOString(), endLiveAtStart: true } }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(calls.updateOne[0].update.$set.isActive, false, "yayındaki şimdi kapatılır");
  assert.equal(calls.create[0].isActive, true);
  assert.equal(calls.create[0].scheduled, false);
  assert.equal(calls.create[0].weeklyPrice, 30);
  assert.ok(inv.n >= 1, "yayın değişti: önbellek temizlendi");
});

test("kopyalama doğrulaması: seçim, en fazla 100, kimlik, tarih ve yuvarlama", async (t) => {
  captureAudit(t);
  const calls = mockCopy(t, { sources: [] });
  const start = mondayAhead();
  const end = new Date(+start + 7 * DAY - 1);
  const base = { startDate: start.toISOString(), endDate: end.toISOString() };
  const cases = [
    [{ ...base }, /seçin/],
    [{ ...base, ids: [] }, /seçin/],
    [{ ...base, ids: "x" }, /seçin/],
    [{ ...base, ids: Array.from({ length: WEEKLY_COPY_MAX + 1 }, (_, i) => WID(i + 1)) }, /en fazla 100/],
    [{ ...base, ids: [WID(1), { $ne: null }] }, /Geçersiz fırsat/],
    [{ ...base, ids: [WID(1)], rounding: "99" }, /yuvarlama/],
    [{ ids: [WID(1)], endDate: base.endDate }, /başlangıç/],
    [{ ids: [WID(1)], startDate: base.startDate }, /bitiş/],
    [{ ids: [WID(1)], startDate: base.startDate, endDate: base.startDate }, /başlangıçtan sonra/],
    [{ ids: [WID(1)], startDate: "now", endDate: new Date(Date.now() - H).toISOString() }, /geçmiş/],
  ];
  for (const [body, message] of cases) {
    const res = response();
    await copyWeeklyProducts(adminReq({ body }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 80));
    assert.match(res.body.message, message);
  }
  assert.equal(calls.finds.length, 0, "geçersiz istek veritabanına inmez");
});

test("yazma sırası: eş zamanlı iki istek sırayla çalışır (çift tıklama aynı planı iki kez oluşturamaz)", async () => {
  const order = [];
  const slow = runWeeklyWrite(async () => {
    order.push("a-start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("a-end");
  });
  const fast = runWeeklyWrite(async () => { order.push("b"); });
  const failing = runWeeklyWrite(async () => { throw new Error("x"); });
  const after = runWeeklyWrite(async () => { order.push("c"); });
  await Promise.all([slow, fast, failing.catch(() => {}), after]);
  assert.deepEqual(order, ["a-start", "a-end", "b", "c"], "hata sırayı bozmaz");
});

test("düzenleme: fiyat değişmeden kaydedilen form, liste fiyatı fırsatın altına düşse de engellenmez", async (t) => {
  captureAudit(t);
  const doc = plannedDoc({ product: { _id: oid(PID(1)), name: "Deterjan", price: 24 }, isActive: true, scheduled: false, startDate: new Date(Date.now() - DAY), endDate: null });
  mockUpdate(t, doc);
  const same = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { weeklyPrice: 25, order: 4, isActive: true } }), same);
  assert.equal(same.statusCode, 200, JSON.stringify(same.body));
  assert.equal(doc.order, 4);
  assert.equal(doc.listPriceAtStart, 30, "fiyat değişmedi: dayanak aynı");

  const changed = response();
  await updateWeeklyProduct(adminReq({ method: "PUT", params: { id: WID(10) }, body: { weeklyPrice: 26 } }), changed);
  assert.equal(changed.statusCode, 400, "yeni fiyat liste fiyatından düşük olmalı");
  assert.match(changed.body.message, /liste fiyatından/);
});

test("toggle: çakışma yoksa durdurulan fırsat yeniden yayına alınır; önbellek temizlenir, kayıt yazılır", async (t) => {
  const audit = captureAudit(t);
  const inv = countInvalidations(t);
  const paused = { ...plannedDoc({ isActive: false, scheduled: false, startDate: new Date(Date.now() - 5 * DAY), endDate: new Date(Date.now() + DAY) }), product: oid(PID(1)) };
  t.mock.method(WeeklyProduct, "findById", () => chain(paused));
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "findById", () => chain({ _id: oid(PID(1)), name: "Deterjan" }));
  const req = adminReq({ method: "PATCH", params: { id: WID(10) } });
  const res = response();
  await toggleWeeklyProductStatus(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(paused.isActive, true);
  assert.equal(paused.saves, 1);
  assert.equal(inv.n, 1);
  assert.deepEqual(req.emits, ["weeklyProductsUpdated"]);
  await flush();
  assert.equal(audit[0].action, "Haftalık fırsat yayına alındı");
});
