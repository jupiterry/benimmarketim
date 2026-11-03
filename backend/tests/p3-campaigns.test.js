// Kampanya merkezi backend'i: flaş indirim / haftalık fırsat getirisi (kayıtlı ve tahmini satırlar), dönem
// toplamları, GET /api/campaigns/performance sözleşmesi ve GET /api/campaigns/overview (gruplama, durum,
// dikkat gerektirenler, bölüm hatasına dayanıklılık). Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import FlashSale from "../models/flashSale.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Coupon from "../models/coupon.model.js";
import CouponRequest from "../models/couponRequest.model.js";
import Mission from "../models/mission.model.js";
import Banner from "../models/banner.model.js";
import Referral from "../models/referral.model.js";
import Settings from "../models/settings.model.js";
import AutomationSettings from "../models/automationSettings.model.js";
import AutomationLog from "../models/automationLog.model.js";
import {
  PERFORMANCE_ORDER_CAP,
  campaignTotals,
  flashSaleWindow,
  flashSalePerformance,
  istanbulDayEnd,
  istanbulDayStart,
  pickWeeklyDeal,
  tonightCutoff,
  weeklyDealPerformance,
  weeklyDealWindow,
} from "../services/campaignPerformance.service.js";
import {
  LIST_CAP,
  buildCampaignAttention,
  buildCampaignOverview,
  buildCouponItems,
  buildFlashItems,
  buildWeeklyItems,
  campaignStatus,
  flashCampaignName,
  getCampaignOverview,
  getCampaignPerformance,
  parsePerformanceQuery,
} from "../controllers/campaignCenter.controller.js";
import campaignRouter from "../routes/campaign.route.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const SALE = (n) => hex("5a1e", n);
const DEAL = (n) => hex("dea1", n);
const PRODUCT = (n) => hex("90d0", n);
const ORDER = (n) => hex("0dde", n);
const COUPON = (n) => hex("c0c0", n);
const NOW = new Date("2026-11-02T18:00:00.000Z"); // İstanbul 21:00, Pazartesi
const CANCELLED = "İptal Edildi";
const PERF_KEYS = ["discount", "from", "inferredLines", "orders", "revenue", "to", "units"];

// Sorgu zinciri: select/populate/sort/limit/setOptions kaydedilir, lean() sonucu döner
const chain = (result, record = {}) => {
  const c = {
    select(arg) { record.select = arg; return c; },
    populate(path, fields) { (record.populate ||= []).push([path, fields]); return c; },
    sort(arg) { record.sort = arg; return c; },
    limit(arg) { record.limit = arg; return c; },
    setOptions(arg) { record.options = arg; return c; },
    lean: async () => (typeof result === "function" ? result() : result),
  };
  return c;
};
const response = () => {
  const res = {
    statusCode: 200, body: undefined, headers: {},
    status(code) { res.statusCode = code; return res; },
    json(body) { res.body = body; return res; },
    set(key, value) { res.headers[key] = value; return res; },
  };
  return res;
};

// Bellekteki siparişlere Mongo süzgecini uygular (status.$ne, createdAt aralığı, $or [createdAt + products.product.$in])
const ms = (value) => new Date(value).getTime();
const matchClause = (order, clause) => {
  const range = clause.createdAt;
  if (range) {
    const t = ms(order.createdAt);
    if (range.$gte !== undefined && t < ms(range.$gte)) return false;
    if (range.$lt !== undefined && t >= ms(range.$lt)) return false;
    if (range.$lte !== undefined && t > ms(range.$lte)) return false;
  }
  const products = clause["products.product"]?.$in;
  if (products && !order.products.some((line) => products.map(String).includes(String(line.product)))) return false;
  return true;
};
const matchOrders = (orders, filter = {}) => structuredClone(orders.filter((order) =>
  (!filter.status?.$ne || order.status !== filter.status.$ne) &&
  matchClause(order, filter) &&
  (!filter.$or || filter.$or.some((clause) => matchClause(order, clause)))));

// ───────────────────────── Sorgu doğrulama ve zaman ─────────────────────────

test("getiri sorgusu: tür, kimlik biçimi, tekrar ve 100 sınırı denetlenir", () => {
  assert.match(parsePerformanceQuery({ type: "coupon", ids: SALE(1) }).error, /flash ya da weekly/);
  assert.match(parsePerformanceQuery({ ids: SALE(1) }).error, /flash ya da weekly/);
  assert.match(parsePerformanceQuery({ type: "flash", ids: "abc" }).error, /Geçersiz kampanya kimliği/);
  assert.match(parsePerformanceQuery({ type: "flash", ids: { $gt: "" } }).error, /Geçersiz kampanya kimliği/);
  assert.match(parsePerformanceQuery({ type: "flash", ids: [SALE(1), { a: 1 }] }).error, /Geçersiz kampanya kimliği/);
  const many = Array.from({ length: 101 }, (_, i) => SALE(i + 1)).join(",");
  assert.match(parsePerformanceQuery({ type: "flash", ids: many }).error, /en fazla 100/);
  assert.match(parsePerformanceQuery({ type: "flash", ids: "a".repeat(5000) }).error, /en fazla 100/);
  assert.deepEqual(parsePerformanceQuery({ type: "weekly", ids: ` ${SALE(1)}, ${SALE(1)},,${SALE(2)} ` }), { type: "weekly", ids: [SALE(1), SALE(2)] });
  assert.deepEqual(parsePerformanceQuery({ type: "flash", ids: [SALE(1), SALE(2)] }), { type: "flash", ids: [SALE(1), SALE(2)] });
  assert.deepEqual(parsePerformanceQuery({ type: "flash" }), { type: "flash", ids: [] });
  const hundred = Array.from({ length: 100 }, (_, i) => SALE(i + 1));
  assert.equal(parsePerformanceQuery({ type: "flash", ids: hundred.join(",") }).ids.length, 100);
});

test("İstanbul günü ve 'bu gece' sınırı: iş günü 04:00'te değişir", () => {
  assert.equal(istanbulDayStart(NOW).toISOString(), "2026-11-01T21:00:00.000Z");
  assert.equal(istanbulDayEnd(NOW).toISOString(), "2026-11-02T20:59:59.999Z");
  // 02:30 İstanbul hâlâ aynı takvim günü (UTC'de bir önceki gün)
  assert.equal(istanbulDayStart(new Date("2026-11-01T23:30:00Z")).toISOString(), "2026-11-01T21:00:00.000Z");
  // Pazartesi 21:00 → Salı 04:00; Salı 02:00 (gece) → yine Salı 04:00; Salı 04:00 → Çarşamba 04:00
  assert.equal(tonightCutoff(NOW).toISOString(), "2026-11-03T01:00:00.000Z");
  assert.equal(tonightCutoff(new Date("2026-11-02T23:00:00Z")).toISOString(), "2026-11-03T01:00:00.000Z");
  assert.equal(tonightCutoff(new Date("2026-11-03T01:00:00Z")).toISOString(), "2026-11-04T01:00:00.000Z");
});

test("kampanya durumu: planlı, bugün/bu gece biten, yayında", () => {
  assert.equal(campaignStatus("2026-11-02T10:00:00Z", "2026-11-02T20:59:59.999Z", NOW), "ending_today");
  // Gece 01:00'de (İstanbul) biten kampanya akşam bakıldığında "bu gece biter"
  assert.equal(campaignStatus("2026-11-02T10:00:00Z", "2026-11-02T22:00:00Z", NOW), "ending_today");
  assert.equal(campaignStatus("2026-11-02T10:00:00Z", "2026-11-03T01:00:00Z", NOW), "ending_today");
  assert.equal(campaignStatus("2026-11-02T10:00:00Z", "2026-11-03T02:00:00Z", NOW), "live");
  assert.equal(campaignStatus("2026-11-02T10:00:00Z", null, NOW), "live");
  assert.equal(campaignStatus("2026-11-02T19:00:00Z", "2026-11-02T20:00:00Z", NOW), "upcoming");
  assert.equal(campaignStatus(null, "2026-11-02T19:00:00Z", NOW), "ending_today");
  // Gece 02:00'de (Salı) Salı 23:59'da biten kupon bugünün (dünkü gecenin) işi değil
  const lateNight = new Date("2026-11-02T23:00:00Z");
  assert.equal(campaignStatus(null, "2026-11-03T20:59:59.999Z", lateNight), "live");
  assert.equal(campaignStatus(null, "2026-11-03T00:30:00Z", lateNight), "ending_today");
});

test("ölçüm aralıkları: şimdiye kadar, erken bitirme, kapatma, planlıyken iptal, durdurulmuş ve planlı haftalık fırsat", () => {
  const window = (w) => (w ? { from: w.from.toISOString(), to: w.to.toISOString() } : w);
  assert.deepEqual(window(flashSaleWindow({ startDate: "2026-11-02T10:00:00Z", endDate: "2026-11-03T10:00:00Z", isActive: true }, NOW)),
    { from: "2026-11-02T10:00:00.000Z", to: NOW.toISOString() });
  assert.deepEqual(window(flashSaleWindow({ startDate: "2026-10-20T10:00:00Z", endDate: "2026-10-20T20:00:00Z" }, NOW)),
    { from: "2026-10-20T10:00:00.000Z", to: "2026-10-20T20:00:00.000Z" });
  // Süresi dolunca zamanlayıcı kapattı (updatedAt bitişten sonra): bitişte biter
  assert.deepEqual(window(flashSaleWindow({ startDate: "2026-10-20T10:00:00Z", endDate: "2026-10-20T20:00:00Z", isActive: false, updatedAt: "2026-10-20T20:00:40Z" }, NOW)),
    { from: "2026-10-20T10:00:00.000Z", to: "2026-10-20T20:00:00.000Z" });
  // Panelden kapatıldı (iptal kaydı yok, bitiş ileride): kapatıldığı anda biter
  assert.deepEqual(window(flashSaleWindow({ startDate: "2026-11-02T10:00:00Z", endDate: "2026-11-04T10:00:00Z", isActive: false, updatedAt: "2026-11-02T15:00:00Z" }, NOW)),
    { from: "2026-11-02T10:00:00.000Z", to: "2026-11-02T15:00:00.000Z" });
  // Planlıyken iptal edildi: hiç başlamadı → boş aralık
  assert.deepEqual(window(flashSaleWindow({ startDate: "2026-11-05T10:00:00Z", endDate: "2026-11-06T10:00:00Z", cancelledAt: "2026-11-01T10:00:00Z" }, NOW)),
    { from: "2026-11-05T10:00:00.000Z", to: "2026-11-05T10:00:00.000Z" });
  // Başlangıç tarihi yoksa ölçülemez
  assert.equal(flashSaleWindow({ endDate: "2026-11-06T10:00:00Z" }, NOW), null);

  assert.deepEqual(window(weeklyDealWindow({ startDate: "2026-10-26T21:00:00Z", endDate: null, isActive: true }, NOW)),
    { from: "2026-10-26T21:00:00.000Z", to: NOW.toISOString() });
  // Elle durdurulmuş, bitişi ileride: son güncellemede biter
  assert.deepEqual(window(weeklyDealWindow({ startDate: "2026-10-26T21:00:00Z", endDate: "2026-11-08T20:59:59.999Z", isActive: false, updatedAt: "2026-10-30T09:00:00Z" }, NOW)),
    { from: "2026-10-26T21:00:00.000Z", to: "2026-10-30T09:00:00.000Z" });
  // Zamanlayıcı süresi dolunca kapattı (updatedAt bitişten biraz sonra): bitişte biter
  assert.deepEqual(window(weeklyDealWindow({ startDate: "2026-10-25T21:00:00Z", endDate: "2026-11-01T20:59:59.999Z", isActive: false, updatedAt: "2026-11-01T21:00:40Z" }, NOW)),
    { from: "2026-10-25T21:00:00.000Z", to: "2026-11-01T20:59:59.999Z" });
  // Planlı fırsat (scheduled) başlamadan boş; eski kayıtta startDate yoksa createdAt kullanılır
  assert.deepEqual(window(weeklyDealWindow({ startDate: "2026-11-08T21:00:00Z", isActive: false, scheduled: true, updatedAt: "2026-11-01T10:00:00Z" }, NOW)),
    { from: "2026-11-08T21:00:00.000Z", to: "2026-11-08T21:00:00.000Z" });
  assert.deepEqual(window(weeklyDealWindow({ createdAt: "2026-10-01T10:00:00Z", isActive: true }, NOW)),
    { from: "2026-10-01T10:00:00.000Z", to: NOW.toISOString() });

  // Çakışan fırsatlardan en son başlayan seçilir; aralık dışındaki zaman eşleşmez
  const older = { id: "a", window: { from: new Date("2026-10-19T21:00:00Z"), to: new Date("2026-10-29T10:00:00Z") } };
  const newer = { id: "b", window: { from: new Date("2026-10-26T21:00:00Z"), to: NOW } };
  assert.equal(pickWeeklyDeal([older, newer], ms("2026-10-28T12:00:00Z")).id, "b");
  assert.equal(pickWeeklyDeal([older, newer], ms("2026-10-20T12:00:00Z")).id, "a");
  assert.equal(pickWeeklyDeal([older, newer], ms("2026-10-10T12:00:00Z")), null);
});

// ───────────────────────── Flaş indirim getirisi ─────────────────────────

const flashFixtures = () => {
  const sales = [
    { _id: SALE(1), product: PRODUCT(1), discountPercentage: 20, startDate: new Date("2026-11-02T10:00:00Z"), endDate: new Date("2026-11-03T10:00:00Z"), isActive: true },
    { _id: SALE(2), product: PRODUCT(2), discountPercentage: 10, startDate: new Date("2026-10-20T10:00:00Z"), endDate: new Date("2026-10-20T20:00:00Z"), isActive: false, updatedAt: new Date("2026-10-20T20:00:30Z") },
    { _id: SALE(3), product: PRODUCT(3), discountPercentage: 15, startDate: new Date("2026-11-05T10:00:00Z"), endDate: new Date("2026-11-06T10:00:00Z"), cancelledAt: new Date("2026-11-01T10:00:00Z"), isActive: false, updatedAt: new Date("2026-11-01T10:00:00Z") },
  ];
  const flash = (sale, extra = {}) => ({ product: PRODUCT(1), quantity: 1, price: 80, originalPrice: 100, priceSource: "flash", flashSaleId: sale, flashDiscountPercentage: 20, ...extra });
  const orders = [
    { _id: ORDER(1), status: "Hazırlanıyor", createdAt: new Date("2026-11-02T12:00:00Z"), products: [
      flash(SALE(1), { quantity: 2 }),
      { product: PRODUCT(9), quantity: 1, price: 12, originalPrice: 12, priceSource: "list" },
    ] },
    { _id: ORDER(2), status: "Teslim Edildi", createdAt: new Date("2026-11-02T13:00:00Z"), products: [
      flash(SALE(1)),
      flash(SALE(9), { product: PRODUCT(1) }), // sorulmayan başka kampanya
    ] },
    // Kampanya kimliği yazılmamış flaş satırı: aynı ürün ve kampanya süresi
    { _id: ORDER(3), status: "Yolda", createdAt: new Date("2026-11-02T14:00:00Z"), products: [flash(undefined, { flashSaleId: undefined })] },
    { _id: ORDER(4), status: CANCELLED, createdAt: new Date("2026-11-02T15:00:00Z"), products: [flash(SALE(1), { quantity: 5 })] },
    // Fiyat bilgisi olmayan eski sipariş: biri flaş fiyatında (tahmini), biri liste fiyatında
    { _id: ORDER(5), status: "Teslim Edildi", createdAt: new Date("2026-10-20T12:00:00Z"), products: [
      { product: PRODUCT(2), quantity: 3, price: 67.5 },
      { product: PRODUCT(2), quantity: 1, price: 75 },
    ] },
    // Kampanya bittikten sonra aynı fiyattan satış (sorgu penceresi dışında)
    { _id: ORDER(6), status: "Teslim Edildi", createdAt: new Date("2026-10-21T12:00:00Z"), products: [{ product: PRODUCT(2), quantity: 1, price: 67.5 }] },
  ];
  const inferenceSales = [
    { _id: SALE(2), product: PRODUCT(2), discountPercentage: 10, startDate: sales[1].startDate, endDate: sales[1].endDate, appliedPrice: 67.5 },
  ];
  return { sales, orders, inferenceSales };
};

const mockFlash = (t, { sales, orders, inferenceSales }) => {
  const calls = { flash: [], orders: [] };
  t.mock.method(FlashSale, "find", (filter) => {
    const record = { filter };
    calls.flash.push(record);
    if (filter._id) return chain(sales.filter((sale) => filter._id.$in.includes(sale._id)), record);
    if (filter.appliedPrice) return chain(inferenceSales, record);
    throw new Error(`beklenmeyen FlashSale sorgusu: ${JSON.stringify(filter)}`);
  });
  t.mock.method(Order, "find", (filter) => {
    const record = { filter };
    calls.orders.push(record);
    return chain(() => matchOrders(orders, filter), record);
  });
  return calls;
};

test("flaş indirim getirisi: kayıtlı, kimliksiz ve eski (tahmini) satırlar; iptal ve başka kampanya sayılmaz", async (t) => {
  const fixtures = flashFixtures();
  const calls = mockFlash(t, fixtures);
  const { items, truncated } = await flashSalePerformance([SALE(1), SALE(2), SALE(3), SALE(4), "bozuk"], { now: NOW });
  assert.equal(truncated, false);
  assert.deepEqual(Object.keys(items).sort(), [SALE(1), SALE(2), SALE(3)], "bulunamayan kampanya yanıtta yok");

  assert.deepEqual(items[SALE(1)], {
    units: 4, orders: 3, revenue: 320, discount: 80,
    from: "2026-11-02T10:00:00.000Z", to: NOW.toISOString(), inferredLines: 0,
  });
  assert.deepEqual(items[SALE(2)], {
    units: 3, orders: 1, revenue: 202.5, discount: 22.5,
    from: "2026-10-20T10:00:00.000Z", to: "2026-10-20T20:00:00.000Z", inferredLines: 1,
  });
  assert.deepEqual(items[SALE(3)], {
    units: 0, orders: 0, revenue: 0, discount: 0,
    from: "2026-11-05T10:00:00.000Z", to: "2026-11-05T10:00:00.000Z", inferredLines: 0,
  });

  // Tek sipariş sorgusu: iptaller hariç, kampanya pencereleri + ürün süzgeci, sınırlı
  assert.equal(calls.orders.length, 1);
  const { filter, limit, select, sort } = calls.orders[0];
  assert.deepEqual(filter.status, { $ne: CANCELLED });
  assert.equal(filter.$or.length, 2, "başlamamış kampanya sorguya girmez");
  assert.deepEqual(filter.$or[0]["products.product"], { $in: [PRODUCT(1)] });
  assert.deepEqual(filter.$or[0].createdAt, { $gte: new Date("2026-11-02T10:00:00Z"), $lt: NOW });
  assert.equal(limit, PERFORMANCE_ORDER_CAP + 1);
  assert.deepEqual(sort, { createdAt: -1 });
  assert.match(select, /products\.flashSaleId/);
  assert.match(select, /products\.originalPrice/);
  // Tahmin sorgusu yalnızca kampanya ürünleriyle sınırlı
  const inference = calls.flash.find((call) => call.filter.appliedPrice);
  assert.deepEqual(inference.filter.product.$in.map(String), [PRODUCT(2)]);
});

test("flaş getirisi: aynı pencereyi paylaşan toplu kampanyalar tek koşulda sorgulanır, boş kimlik listesi sorgu yapmaz", async (t) => {
  const start = new Date("2026-11-02T10:00:00Z");
  const end = new Date("2026-11-02T22:00:00Z");
  const sales = [1, 2, 3].map((n) => ({ _id: SALE(n), product: PRODUCT(n), discountPercentage: 20, startDate: start, endDate: end, isActive: true }));
  const calls = mockFlash(t, { sales, orders: [], inferenceSales: [] });
  const { items } = await flashSalePerformance(sales.map((sale) => sale._id), { now: NOW });
  assert.equal(Object.keys(items).length, 3);
  assert.equal(calls.orders[0].filter.$or.length, 1);
  assert.deepEqual(calls.orders[0].filter.$or[0]["products.product"].$in, [PRODUCT(1), PRODUCT(2), PRODUCT(3)]);

  const empty = await flashSalePerformance([], { now: NOW });
  assert.deepEqual(empty, { items: {}, truncated: false });
  assert.equal(calls.flash.length, 1, "boş listede veritabanına gidilmez");
});

test("flaş getirisi: kampanya süresi dışındaki sipariş, başka kampanyanın sorgusuyla gelse de sayılmaz", async (t) => {
  const fixtures = flashFixtures();
  // SALE(2)'nin süresinde verilmiş siparişte SALE(1) kimlikli satır (kampanya tarihleri sonradan değiştirilmiş)
  fixtures.orders.push({ _id: ORDER(9), status: "Teslim Edildi", createdAt: new Date("2026-10-20T15:00:00Z"), products: [
    { product: PRODUCT(1), quantity: 7, price: 80, originalPrice: 100, priceSource: "flash", flashSaleId: SALE(1) },
    { product: PRODUCT(2), quantity: 1, price: 67.5, originalPrice: 75, priceSource: "flash", flashSaleId: SALE(2) },
  ] });
  mockFlash(t, fixtures);
  const together = await flashSalePerformance([SALE(1), SALE(2)], { now: NOW });
  t.mock.restoreAll();
  mockFlash(t, fixtures);
  const alone = await flashSalePerformance([SALE(1)], { now: NOW });
  assert.equal(together.items[SALE(1)].units, 4);
  assert.deepEqual(together.items[SALE(1)], alone.items[SALE(1)]);
  assert.equal(together.items[SALE(2)].units, 4, "kendi süresindeki kayıtlı satır sayılır");
});

test("flaş getirisi: sipariş sınırı aşılırsa truncated işaretlenir", async (t) => {
  const sale = { _id: SALE(1), product: PRODUCT(1), discountPercentage: 20, startDate: new Date("2026-11-02T10:00:00Z"), endDate: new Date("2026-11-03T10:00:00Z") };
  t.mock.method(FlashSale, "find", () => chain([sale]));
  const many = Array.from({ length: PERFORMANCE_ORDER_CAP + 1 }, (_, i) => ({
    _id: `o${i}`, createdAt: new Date("2026-11-02T12:00:00Z"),
    products: [{ product: PRODUCT(1), quantity: 1, price: 80, originalPrice: 100, priceSource: "flash", flashSaleId: SALE(1) }],
  }));
  t.mock.method(Order, "find", () => chain(many));
  const { items, truncated } = await flashSalePerformance([SALE(1)], { now: NOW });
  assert.equal(truncated, true);
  assert.equal(items[SALE(1)].units, PERFORMANCE_ORDER_CAP);
});

// ───────────────────────── Haftalık fırsat getirisi ─────────────────────────

const weeklyFixtures = () => {
  const deals = {
    live: { _id: DEAL(1), product: PRODUCT(1), weeklyPrice: 45, startDate: new Date("2026-10-26T21:00:00Z"), endDate: null, isActive: true, createdAt: new Date("2026-10-26T20:00:00Z"), updatedAt: new Date("2026-10-26T20:00:00Z") },
    // Aynı ürünün eski fırsatı: durdurulduktan sonra düzenlenmiş (pencere yenisiyle çakışıyor)
    old: { _id: DEAL(5), product: PRODUCT(1), weeklyPrice: 50, startDate: new Date("2026-10-19T21:00:00Z"), endDate: null, isActive: false, createdAt: new Date("2026-10-19T20:00:00Z"), updatedAt: new Date("2026-10-29T10:00:00Z") },
    ended: { _id: DEAL(2), product: PRODUCT(2), weeklyPrice: 30, startDate: new Date("2026-10-25T21:00:00Z"), endDate: new Date("2026-11-01T20:59:59.999Z"), isActive: false, createdAt: new Date("2026-10-25T20:00:00Z"), updatedAt: new Date("2026-11-01T21:00:30Z") },
    planned: { _id: DEAL(3), product: PRODUCT(3), weeklyPrice: 20, startDate: new Date("2026-11-08T21:00:00Z"), endDate: new Date("2026-11-15T20:59:59.999Z"), isActive: false, scheduled: true, createdAt: new Date("2026-11-01T10:00:00Z"), updatedAt: new Date("2026-11-01T10:00:00Z") },
  };
  const weekly = (extra) => ({ product: PRODUCT(1), quantity: 1, price: 45, originalPrice: 60, priceSource: "weekly", ...extra });
  const orders = [
    { _id: ORDER(1), status: "Teslim Edildi", createdAt: new Date("2026-10-28T12:00:00Z"), products: [weekly({ quantity: 2 })] },
    { _id: ORDER(2), status: "Teslim Edildi", createdAt: new Date("2026-10-30T12:00:00Z"), products: [{ product: PRODUCT(1), quantity: 1, price: 45 }] },
    { _id: ORDER(3), status: "Teslim Edildi", createdAt: new Date("2026-10-30T13:00:00Z"), products: [{ product: PRODUCT(1), quantity: 1, price: 60 }] },
    { _id: ORDER(4), status: "Teslim Edildi", createdAt: new Date("2026-11-01T10:00:00Z"), products: [weekly({ product: PRODUCT(2), quantity: 3, price: 30, originalPrice: 40 })] },
    { _id: ORDER(5), status: "Teslim Edildi", createdAt: new Date("2026-11-02T12:00:00Z"), products: [weekly({ product: PRODUCT(2), price: 30, originalPrice: 40 })] },
    { _id: ORDER(6), status: "Teslim Edildi", createdAt: new Date("2026-10-28T13:00:00Z"), products: [{ product: PRODUCT(1), quantity: 1, price: 40, originalPrice: 60, priceSource: "flash", flashSaleId: SALE(1) }] },
    { _id: ORDER(7), status: CANCELLED, createdAt: new Date("2026-10-29T12:00:00Z"), products: [weekly({ quantity: 4 })] },
    // Eski fırsat döneminde (yalnızca eski fırsatın penceresinde) kayıtlı satır
    { _id: ORDER(8), status: "Teslim Edildi", createdAt: new Date("2026-10-22T12:00:00Z"), products: [weekly({ price: 50, originalPrice: 60 })] },
  ];
  return { deals, orders };
};

const mockWeekly = (t, { deals, orders, inferenceSales = [] }, products = [{ _id: PRODUCT(1), price: 60 }]) => {
  const calls = { weekly: [], orders: [], products: [], flash: [] };
  const all = Object.values(deals);
  // Eski satırlarda önce flaş eşleştirmesi (inferFlashLines) yapılır
  t.mock.method(FlashSale, "find", (filter) => {
    calls.flash.push(filter);
    if (filter.appliedPrice) return chain(inferenceSales);
    throw new Error(`beklenmeyen FlashSale sorgusu: ${JSON.stringify(filter)}`);
  });
  t.mock.method(WeeklyProduct, "find", (filter) => {
    const record = { filter };
    calls.weekly.push(record);
    if (filter._id) return chain(all.filter((deal) => filter._id.$in.includes(deal._id)), record);
    if (filter.product) return chain(all.filter((deal) => filter.product.$in.includes(deal.product)), record);
    throw new Error(`beklenmeyen WeeklyProduct sorgusu: ${JSON.stringify(filter)}`);
  });
  t.mock.method(Order, "find", (filter) => {
    const record = { filter };
    calls.orders.push(record);
    return chain(() => matchOrders(orders, filter), record);
  });
  t.mock.method(Product, "find", (filter) => {
    calls.products.push(filter);
    return chain(products.filter((product) => filter._id.$in.includes(product._id)));
  });
  return calls;
};

test("haftalık fırsat getirisi: satır o an süren en son fırsata yazılır, eski satır fiyattan tahmin edilir", async (t) => {
  const fixtures = weeklyFixtures();
  const calls = mockWeekly(t, fixtures);
  const { items } = await weeklyDealPerformance([DEAL(1), DEAL(2), DEAL(3)], { now: NOW });
  assert.deepEqual(Object.keys(items).sort(), [DEAL(1), DEAL(2), DEAL(3)]);
  // Kayıtlı 2 adet (90 ₺, 30 ₺ indirim) + tahmini 1 adet (45 ₺; liste fiyatı ürünün bugünkü 60 ₺'si)
  assert.deepEqual(items[DEAL(1)], {
    units: 3, orders: 2, revenue: 135, discount: 45,
    from: "2026-10-26T21:00:00.000Z", to: NOW.toISOString(), inferredLines: 1,
  });
  assert.deepEqual(items[DEAL(2)], {
    units: 3, orders: 1, revenue: 90, discount: 30,
    from: "2026-10-25T21:00:00.000Z", to: "2026-11-01T20:59:59.999Z", inferredLines: 0,
  });
  assert.deepEqual(items[DEAL(3)], {
    units: 0, orders: 0, revenue: 0, discount: 0,
    from: "2026-11-08T21:00:00.000Z", to: "2026-11-08T21:00:00.000Z", inferredLines: 0,
  });
  // Kardeş fırsatlar ürüne göre okunur (sınırlı); liste fiyatı yalnızca tahmini satırın ürünü için
  assert.deepEqual([...calls.weekly[1].filter.product.$in].sort(), [PRODUCT(1), PRODUCT(2), PRODUCT(3)].sort());
  assert.ok(calls.weekly[1].limit > 0);
  assert.deepEqual(calls.products[0]._id.$in, [PRODUCT(1)]);
  assert.equal(calls.orders.length, 1);
  assert.equal(calls.orders[0].filter.$or.length, 2, "planlı fırsat sorguya girmez");
  // Flaş eşleştirmesi yalnızca fırsat fiyatına eşit eski satırlar için, tek sorguda
  assert.equal(calls.flash.length, 1);
  assert.deepEqual(calls.flash[0].product.$in.map(String), [PRODUCT(1)]);
});

test("haftalık getiri: o an süren flaş indirimin fiyatıyla eşleşen eski satır haftalığa yazılmaz", async (t) => {
  const fixtures = weeklyFixtures();
  // 30 Eki 12:00 siparişindeki 45 ₺'lik satır aynı fiyatlı bir flaş indirimin süresinde
  fixtures.inferenceSales = [{ _id: SALE(7), product: PRODUCT(1), discountPercentage: 25, startDate: new Date("2026-10-30T10:00:00Z"), endDate: new Date("2026-10-30T14:00:00Z"), appliedPrice: 45 }];
  mockWeekly(t, fixtures);
  const { items } = await weeklyDealPerformance([DEAL(1)], { now: NOW });
  assert.deepEqual(
    { units: items[DEAL(1)].units, revenue: items[DEAL(1)].revenue, discount: items[DEAL(1)].discount, inferredLines: items[DEAL(1)].inferredLines },
    { units: 2, revenue: 90, discount: 30, inferredLines: 0 },
  );
});

test("haftalık getiri: eski fırsat kendi dönemindeki satırları alır; yalnız planlı fırsat sipariş sorgusu yapmaz", async (t) => {
  const fixtures = weeklyFixtures();
  const calls = mockWeekly(t, fixtures);
  const { items } = await weeklyDealPerformance([DEAL(5)], { now: NOW });
  // Eski fırsatın penceresi 19 Eki 21:00 – 29 Eki 10:00; 28 Eki siparişi yenisine, 22 Eki siparişi eskisine yazılır
  assert.equal(items[DEAL(5)].units, 1);
  assert.equal(items[DEAL(5)].revenue, 50);
  assert.equal(items[DEAL(5)].discount, 10);

  const before = calls.orders.length;
  const planned = await weeklyDealPerformance([DEAL(3)], { now: NOW });
  assert.equal(planned.items[DEAL(3)].units, 0);
  assert.equal(calls.orders.length, before, "boş aralıkta sipariş okunmaz");
});

test("haftalık getiri: fiyatı boş fırsat 0 ₺'lik eski satırla eşleşmez", async (t) => {
  const deal = { _id: DEAL(7), product: PRODUCT(7), weeklyPrice: null, startDate: new Date("2026-10-26T21:00:00Z"), endDate: null, isActive: true };
  mockWeekly(t, {
    deals: { deal },
    orders: [{ _id: ORDER(1), status: "Teslim Edildi", createdAt: new Date("2026-10-30T12:00:00Z"), products: [{ product: PRODUCT(7), quantity: 1, price: 0 }] }],
  });
  const { items } = await weeklyDealPerformance([DEAL(7)], { now: NOW });
  assert.equal(items[DEAL(7)].units, 0);
});

// ───────────────────────── Dönem toplamları ─────────────────────────

test("dönem toplamları: son 7/30 gün flaş, haftalık ve kupon; eski satırlar tahmin edilir", async (t) => {
  const orders = [
    { _id: ORDER(1), status: "Teslim Edildi", createdAt: new Date("2026-11-02T12:00:00Z"), couponCode: "hosgeldin ", couponDiscount: 10, productTotal: 155, totalAmount: 170, products: [
      { product: PRODUCT(1), quantity: 2, price: 80, originalPrice: 100, priceSource: "flash", flashSaleId: SALE(1) },
      { product: PRODUCT(4), quantity: 1, price: 45, originalPrice: 60, priceSource: "weekly" },
      { product: PRODUCT(9), quantity: 1, price: 10, originalPrice: 10, priceSource: "list" },
    ] },
    { _id: ORDER(2), status: "Teslim Edildi", createdAt: new Date("2026-10-20T12:00:00Z"), products: [
      { product: PRODUCT(2), quantity: 1, price: 67.5 },
      { product: PRODUCT(1), quantity: 2, price: 50 },
      { product: PRODUCT(5), quantity: 1, price: 10 },
    ] },
    { _id: ORDER(3), status: "Teslim Edildi", createdAt: new Date("2026-09-01T12:00:00Z"), products: [{ product: PRODUCT(1), quantity: 9, price: 80, originalPrice: 100, priceSource: "flash" }] },
    { _id: ORDER(4), status: CANCELLED, createdAt: new Date("2026-11-01T12:00:00Z"), couponCode: "HOSGELDIN", couponDiscount: 10, products: [{ product: PRODUCT(1), quantity: 9, price: 80, originalPrice: 100, priceSource: "flash" }] },
  ];
  const orderCalls = [];
  t.mock.method(Order, "find", (filter) => {
    const record = { filter };
    orderCalls.push(record);
    return chain(() => matchOrders(orders, filter), record);
  });
  t.mock.method(FlashSale, "find", () => chain([
    { _id: SALE(2), product: PRODUCT(2), discountPercentage: 10, startDate: new Date("2026-10-20T10:00:00Z"), endDate: new Date("2026-10-20T20:00:00Z"), appliedPrice: 67.5 },
  ]));
  const weeklyCalls = [];
  t.mock.method(WeeklyProduct, "find", (filter) => {
    const record = { filter };
    weeklyCalls.push(record);
    return chain([
      { _id: DEAL(5), product: PRODUCT(1), weeklyPrice: 50, startDate: new Date("2026-10-19T21:00:00Z"), endDate: null, isActive: false, updatedAt: new Date("2026-10-29T10:00:00Z") },
    ], record);
  });
  t.mock.method(Product, "find", () => chain([{ _id: PRODUCT(1), price: 60 }]));

  const totals = await campaignTotals({ now: NOW });
  assert.equal(orderCalls.length, 1);
  assert.deepEqual(orderCalls[0].filter.createdAt, { $gte: new Date("2026-10-03T21:00:00.000Z"), $lte: NOW });
  assert.deepEqual(orderCalls[0].filter.status, { $ne: CANCELLED });
  assert.equal(orderCalls[0].limit, PERFORMANCE_ORDER_CAP + 1);
  // Haftalık tahmin yalnızca flaşla eşleşmeyen eski satırların ürünleri için (sınırlı)
  assert.deepEqual([...weeklyCalls[0].filter.product.$in].sort(), [PRODUCT(1), PRODUCT(5)].sort());
  assert.ok(weeklyCalls[0].limit > 0);

  assert.equal(totals.last7.from, "2026-10-26T21:00:00.000Z");
  assert.deepEqual(totals.last7.flash, { units: 2, orders: 1, revenue: 160, discount: 40, from: "2026-10-26T21:00:00.000Z", to: NOW.toISOString(), inferredLines: 0 });
  assert.deepEqual(totals.last7.weekly, { units: 1, orders: 1, revenue: 45, discount: 15, from: "2026-10-26T21:00:00.000Z", to: NOW.toISOString(), inferredLines: 0 });
  assert.deepEqual(totals.last7.coupon, { orders: 1, discount: 10 });

  assert.equal(totals.last30.flash.revenue, 227.5);
  assert.equal(totals.last30.flash.discount, 47.5);
  assert.equal(totals.last30.flash.inferredLines, 1);
  assert.equal(totals.last30.weekly.revenue, 145);
  assert.equal(totals.last30.weekly.discount, 35);
  assert.equal(totals.last30.weekly.inferredLines, 1);
  assert.equal(totals.last30.weekly.orders, 2);
  assert.deepEqual(totals.couponsByCode, { HOSGELDIN: { orders: 1, discount: 10, revenue: 155 } });
  assert.equal(totals.truncated, false);
});

// ───────────────────────── GET /api/campaigns/performance ─────────────────────────

test("GET /performance: sözleşme { success, items: { id: { units, orders, revenue, discount, from, to, inferredLines } } }", async (t) => {
  const fixtures = flashFixtures();
  mockFlash(t, fixtures);
  const res = response();
  await getCampaignPerformance({ query: { type: "flash", ids: `${SALE(1)},${SALE(2)}` } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(Object.keys(res.body.items).sort(), [SALE(1), SALE(2)]);
  for (const item of Object.values(res.body.items)) assert.deepEqual(Object.keys(item).sort(), PERF_KEYS);
  assert.equal(res.body.items[SALE(1)].units, 4);
  assert.equal(res.headers["Cache-Control"], "no-store");

  const weeklyRes = response();
  t.mock.restoreAll();
  mockWeekly(t, weeklyFixtures());
  await getCampaignPerformance({ query: { type: "weekly", ids: DEAL(1) } }, weeklyRes);
  assert.equal(weeklyRes.statusCode, 200);
  assert.deepEqual(Object.keys(weeklyRes.body.items[DEAL(1)]).sort(), PERF_KEYS);

  const bad = response();
  await getCampaignPerformance({ query: { type: "flash", ids: "x" } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.success, false);

  const empty = response();
  await getCampaignPerformance({ query: { type: "weekly" } }, empty);
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.body.items, {});
});

test("GET /performance: veritabanı hatası 500 döner, ayrıntı sızmaz", async (t) => {
  t.mock.method(FlashSale, "find", () => { throw new Error("bağlantı koptu"); });
  t.mock.method(console, "error", () => {});
  const res = response();
  await getCampaignPerformance({ query: { type: "flash", ids: SALE(1) } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, message: "Kampanya getirisi hesaplanamadı" });
});

test("kampanya rotaları yalnızca yönetici: protectRoute + adminRoute, ardından /performance ve /overview", () => {
  const [first, second, ...rest] = campaignRouter.stack;
  assert.equal(first.handle, protectRoute);
  assert.equal(second.handle, adminRoute);
  const routes = rest.filter((layer) => layer.route).map((layer) => [layer.route.path, Object.keys(layer.route.methods)]);
  assert.deepEqual(routes, [["/performance", ["get"]], ["/overview", ["get"]]]);
});

// ───────────────────────── Gruplama ve dikkat ─────────────────────────

test("toplu flaş indirim adı: 'Kampanya · Ürün' kampanya adını verir, tekil kampanya gruplanmaz", () => {
  assert.equal(flashCampaignName("Akşam flaşı · Cips", "Cips"), "Akşam flaşı");
  assert.equal(flashCampaignName("Pepsi · haftası · Kola 1 L", "Kola 1 L"), "Pepsi · haftası");
  assert.equal(flashCampaignName("Akşam flaşı · Eski ad", "Yeni ad"), "Akşam flaşı");
  assert.equal(flashCampaignName("Cips - Flash Sale", "Cips"), null);
  assert.equal(flashCampaignName("", "Cips"), null);
  assert.equal(flashCampaignName(" · Cips", "Cips"), null);
  // Ürün adında " · " geçen tekil (varsayılan adlı) kampanya, ürün sonradan yeniden adlandırılmış olsa da kampanya değildir
  assert.equal(flashCampaignName("Cips · Büyük - Flash Sale", "Cips · Büyük"), null);
  assert.equal(flashCampaignName("Cips · Büyük - Flash Sale", "Cips Büyük"), null);
  assert.equal(flashCampaignName("Gece · Cips · Büyük", "Cips · Büyük"), "Gece");
});

test("flaş öğeleri: aynı ad ve tarihli toplu kampanya tek öğe; tekil kampanya ürün çekmecesine açılır", () => {
  const start = new Date("2026-11-02T10:00:00Z");
  const end = new Date("2026-11-02T20:00:00Z");
  const product = (n, extra = {}) => ({ _id: PRODUCT(n), name: `Ürün ${n}`, price: 100, ...extra });
  const sales = [
    // Uygulanmış kampanyada ürüne yazılan fiyat gösterilir (liste fiyatı sonradan değişmiş olsa da)
    { _id: SALE(1), product: product(1, { price: 110 }), name: "Akşam flaşı · Ürün 1", discountPercentage: 20, startDate: start, endDate: end, applied: true, appliedPrice: 80 },
    { _id: SALE(2), product: product(2), name: "Akşam flaşı · Ürün 2", discountPercentage: 25, startDate: start, endDate: end, applied: true, appliedPrice: 75 },
    { _id: SALE(3), product: product(3), name: "Akşam flaşı · Ürün 3", discountPercentage: 20, startDate: new Date("2026-11-04T10:00:00Z"), endDate: new Date("2026-11-04T20:00:00Z"), appliedPrice: 50 },
    { _id: SALE(4), product: product(4), name: "Ürün 4 - Flash Sale", discountPercentage: 10, startDate: start, endDate: new Date("2026-11-05T20:00:00Z"), applied: true, appliedPrice: 90 },
    { _id: SALE(5), product: PRODUCT(5), name: "Gece indirimi", discountPercentage: 30, startDate: start, endDate: new Date("2026-11-05T20:00:00Z") },
  ];
  const acc = (orderIds, units) => ({ units, orderIds: new Set(orderIds), revenueKurus: units * 8000, discountKurus: units * 2000, inferredLines: 0, from: start, to: NOW });
  const accs = new Map([[SALE(1), acc(["o1", "o2"], 2)], [SALE(2), acc(["o2", "o3"], 3)], [SALE(4), acc(["o4"], 1)]]);
  const items = buildFlashItems(sales, accs, NOW);
  assert.equal(items.length, 4);

  const [group, ...others] = items;
  assert.equal(group.title, "Akşam flaşı");
  assert.equal(group.status, "ending_today");
  assert.deepEqual(group.details, { campaign: true, name: null, productCount: 2, minDiscount: 20, maxDiscount: 25 });
  assert.deepEqual(group.stats, { units: 5, orders: 3, revenue: 400, discount: 100, from: start.toISOString(), to: NOW.toISOString(), inferredLines: 0 });
  assert.deepEqual(group.target, { tab: "products" });
  assert.equal(group.id, `flash-group:${SALE(1)}`);
  assert.deepEqual(group.children.map((child) => child.id), [SALE(2), SALE(1)], "ciroya göre sıralı");
  assert.equal(group.children[1].price, 80);
  assert.equal(group.children[1].applied, true);
  assert.equal(group.children[0].price, 75);
  assert.deepEqual(group.children[0].target, { tab: "products", handoff: { key: "product", value: PRODUCT(2) } });

  const single = others.find((item) => item.id === SALE(4));
  assert.equal(single.title, "Ürün 4");
  assert.equal(single.status, "live");
  assert.deepEqual(single.target, { tab: "products", handoff: { key: "product", value: PRODUCT(4) } });
  assert.equal(single.details.name, null);
  assert.equal(single.stats.units, 1);

  const deleted = others.find((item) => item.id === SALE(5));
  assert.equal(deleted.title, "Silinmiş ürün");
  assert.equal(deleted.details.name, "Gece indirimi");
  assert.equal(deleted.children[0].missing, true);
  assert.equal(deleted.children[0].price, null);
  assert.equal(deleted.stats, null, "getirisi ölçülemeyen kampanya sıfır satış gibi görünmez");

  // Planlı kampanya: getirisiz; uygulanmamış eski appliedPrice yerine bugünkü fiyattan
  const upcoming = others.find((item) => item.status === "upcoming");
  assert.equal(upcoming.title, "Akşam flaşı");
  assert.equal(upcoming.stats, null);
  assert.equal(upcoming.children.length, 1);
  assert.equal(upcoming.children[0].price, 80);
  assert.deepEqual(upcoming.target, { tab: "products", handoff: { key: "product", value: PRODUCT(3) } });
});

test("haftalık öğeler: yayındakiler bitişe, planlılar tarihe göre gruplanır; oran güncel liste fiyatından", () => {
  const product = (n, price = 100) => ({ _id: PRODUCT(n), name: `Ürün ${n}`, price, isHidden: false, isOutOfStock: false });
  const sunday = new Date("2026-11-08T20:59:59.999Z");
  const deals = [
    { _id: DEAL(1), product: product(1), weeklyPrice: 45, discountPercentage: 40, startDate: new Date("2026-10-26T21:00:00Z"), endDate: sunday, isActive: true },
    { _id: DEAL(2), product: product(2, 50), weeklyPrice: 40, discountPercentage: 10, startDate: new Date("2026-10-27T21:00:00Z"), endDate: sunday, isActive: true },
    { _id: DEAL(3), product: product(3), weeklyPrice: 70, startDate: new Date("2026-10-20T21:00:00Z"), endDate: null, isActive: true },
    { _id: DEAL(4), product: product(4), weeklyPrice: 20, startDate: new Date("2026-11-08T21:00:00Z"), endDate: new Date("2026-11-15T20:59:59.999Z"), isActive: false, scheduled: true },
    // Liste fiyatı fırsat fiyatının altına inmiş: fırsat etkisiz, kayıtlı eski oran gösterilmez
    { _id: DEAL(5), product: product(5, 30), weeklyPrice: 35, discountPercentage: 10, startDate: new Date("2026-10-20T21:00:00Z"), endDate: null, isActive: true },
  ];
  const acc = (orderIds, units) => ({ units, orderIds: new Set(orderIds), revenueKurus: units * 4500, discountKurus: units * 1500, inferredLines: 1, from: new Date("2026-10-26T21:00:00Z"), to: NOW });
  const items = buildWeeklyItems(deals, new Map([[DEAL(1), acc(["o1"], 2)], [DEAL(2), acc(["o1", "o2"], 1)]]), NOW);
  assert.deepEqual(items.map((item) => [item.title, item.status, item.details.productCount]), [
    ["Haftalık fırsatlar", "live", 2],
    ["Haftalık fırsatlar", "live", 2],
    ["Planlı haftalık fırsatlar", "upcoming", 1],
  ]);
  const stale = items[1].children.find((child) => child.id === DEAL(5));
  assert.deepEqual([stale.discountPercentage, stale.ineffective], [0, true]);
  assert.equal(items[1].children.find((child) => child.id === DEAL(3)).ineffective, false);
  assert.deepEqual(items[1].details, { productCount: 2, planned: false, minDiscount: 30, maxDiscount: 30 });
  const [week] = items;
  assert.equal(week.endsAt, sunday.toISOString());
  assert.equal(week.startsAt, "2026-10-26T21:00:00.000Z");
  assert.deepEqual(week.details, { productCount: 2, planned: false, minDiscount: 20, maxDiscount: 55 });
  assert.deepEqual(week.stats, { units: 3, orders: 2, revenue: 135, discount: 45, from: "2026-10-26T21:00:00.000Z", to: NOW.toISOString(), inferredLines: 2 });
  assert.deepEqual(week.target, { tab: "weekly-products" });
  assert.deepEqual(week.children[0].target, { tab: "products", handoff: { key: "product", value: PRODUCT(1) } });
  assert.equal(items[1].endsAt, null, "bitişsiz fırsat ayrı grup");
  assert.equal(items[2].stats, null);
});

test("kupon öğeleri: süre, kullanım sınırı ve gün/saat kısıtı", () => {
  const items = buildCouponItems([
    { _id: COUPON(1), code: "gece", discountType: "percentage", discountPercentage: 15, maximumDiscount: 40, minimumOrderAmount: 150, usageLimit: 0, usageCount: 7, expirationDate: new Date("2026-11-02T20:59:59.999Z"), validDays: [6, 0, 6], startTime: "18:00", endTime: "23:30", firstOrderOnly: true },
    { _id: COUPON(2), code: "DOLU", discountType: "fixed", discountAmount: 20, usageLimit: 5, usageCount: 5, expirationDate: new Date("2026-11-20T20:59:59.999Z"), validDays: [0, 1, 2, 3, 4, 5, 6] },
  ], { GECE: { orders: 3, discount: 45, revenue: 600 } }, NOW);
  const [gece, dolu] = items;
  assert.equal(gece.title, "GECE");
  assert.equal(gece.status, "ending_today");
  assert.deepEqual(gece.details, {
    description: "", discountType: "percentage", discountValue: 15, minimumOrderAmount: 150, maximumDiscount: 40,
    firstOrderOnly: true, newUsersOnly: false, validDays: [0, 6], startTime: "18:00", endTime: "23:30",
  });
  assert.deepEqual(gece.stats, { usageCount: 7, usageLimit: null, exhausted: false, orders30: 3, discount30: 45, revenue30: 600 });
  assert.equal(dolu.status, "live");
  assert.deepEqual(dolu.details.validDays, [], "her gün geçerli kupon gün kısıtı taşımaz");
  assert.equal(dolu.stats.exhausted, true);
  assert.equal(dolu.stats.orders30, 0);
});

test("dikkat: sorunlu ürün ve uygulanmamış flaş önce, sonra bitenler ve çakışmalar; planlı kampanya uyarı vermez", () => {
  const child = (id, productId, extra = {}) => ({ id, productId, name: `Ürün ${id}`, missing: false, isHidden: false, isOutOfStock: false, applied: true, startsAt: "2026-11-02T10:00:00.000Z", price: 80, weeklyPrice: 45, ...extra });
  const flash = [
    { id: "f1", type: "flash", title: "Akşam", status: "ending_today", endsAt: "2026-11-02T20:00:00.000Z", target: { tab: "products" },
      children: [child("a", PRODUCT(1), { isOutOfStock: true }), child("b", PRODUCT(2))] },
    { id: "f2", type: "flash", title: "Planlı", status: "upcoming", endsAt: "2026-11-05T20:00:00.000Z", target: { tab: "products" },
      children: [child("c", PRODUCT(3), { isHidden: true, applied: false })] },
    { id: "f3", type: "flash", title: "Gece", status: "live", endsAt: "2026-11-03T20:00:00.000Z", target: { tab: "products" },
      children: [
        child("g", PRODUCT(6), { applied: false, startsAt: "2026-11-02T17:50:00.000Z", price: 70 }),
        child("h", PRODUCT(7), { applied: false, startsAt: "2026-11-02T17:59:00.000Z" }), // zamanlayıcı henüz çalışmadı
      ] },
  ];
  const weekly = [
    { id: "w1", type: "weekly", title: "Haftalık fırsatlar", status: "live", endsAt: null, target: { tab: "weekly-products" },
      children: [
        child("d", PRODUCT(2)), child("e", PRODUCT(4), { missing: true }), child("k", PRODUCT(6), { weeklyPrice: 90 }),
        child("m", PRODUCT(8), { weeklyPrice: 35, listPrice: 30, ineffective: true }),
      ] },
  ];
  const coupons = [
    { id: COUPON(1), type: "coupon", title: "GECE", status: "ending_today", endsAt: "2026-11-02T20:59:59.999Z", stats: { exhausted: false }, target: { tab: "coupons" } },
    { id: COUPON(2), type: "coupon", title: "DOLU", status: "live", endsAt: "2026-11-09T20:59:59.999Z", stats: { exhausted: true, usageCount: 5, usageLimit: 5 }, target: { tab: "coupons" } },
  ];
  const list = buildCampaignAttention({ flash, weekly, coupons, others: [] }, NOW);
  assert.deepEqual(list.map((item) => item.kind), [
    "product_unavailable", "flash_not_applied", "product_unavailable",
    "ending_today", "flash_weekly_overlap", "coupon_ending", "weekly_ineffective",
    "flash_weekly_overlap", "coupon_exhausted",
  ]);
  const ineffectiveWeekly = list.find((item) => item.kind === "weekly_ineffective");
  assert.deepEqual(
    { title: ineffectiveWeekly.title, weeklyPrice: ineffectiveWeekly.weeklyPrice, listPrice: ineffectiveWeekly.listPrice, campaign: ineffectiveWeekly.campaign },
    { title: "Ürün m", weeklyPrice: 35, listPrice: 30, campaign: "Haftalık fırsatlar" },
  );
  assert.deepEqual(ineffectiveWeekly.target, { tab: "products", handoff: { key: "product", value: PRODUCT(8) } });
  const [stock, notApplied, deleted] = list;
  assert.equal(stock.reason, "out_of_stock");
  assert.equal(stock.campaign, "Akşam");
  assert.deepEqual(stock.target, { tab: "products", handoff: { key: "product", value: PRODUCT(1) } });
  assert.equal(notApplied.title, "Ürün g");
  assert.deepEqual(notApplied.target, { tab: "products", handoff: { key: "product", value: PRODUCT(6) } });
  assert.equal(deleted.reason, "deleted");
  assert.equal(deleted.campaign, "Haftalık fırsatlar");
  assert.deepEqual(deleted.target, { tab: "weekly-products" });

  const [ineffective, flashWins] = list.filter((item) => item.kind === "flash_weekly_overlap");
  assert.deepEqual(
    { title: ineffective.title, flashPrice: ineffective.flashPrice, weeklyPrice: ineffective.weeklyPrice, effective: ineffective.effective, severity: ineffective.severity, at: ineffective.at },
    { title: "Ürün b", flashPrice: 80, weeklyPrice: 45, effective: "weekly", severity: "warn", at: "2026-11-02T20:00:00.000Z" },
  );
  assert.deepEqual(ineffective.target, { tab: "products", handoff: { key: "product", value: PRODUCT(2) } });
  assert.deepEqual([flashWins.title, flashWins.effective, flashWins.severity], ["Ürün g", "flash", "info"]);
  assert.ok(!list.some((item) => item.title === "Ürün c"), "planlı kampanya uyarı üretmez");
  assert.ok(!list.some((item) => item.title === "Ürün h"), "yeni başlayan kampanyaya zamanlayıcı için süre tanınır");
});

// ───────────────────────── GET /api/campaigns/overview ─────────────────────────

const overviewMocks = (t, { failCoupons = false, failFlashPerformance = false, flashList = null } = {}) => {
  const product = (n, extra = {}) => ({ _id: PRODUCT(n), name: `Ürün ${n}`, price: 100, isHidden: false, isOutOfStock: false, image: `p${n}.jpg`, ...extra });
  const bulkStart = new Date("2026-11-02T10:00:00Z");
  const bulkEnd = new Date("2026-11-02T20:00:00Z"); // İstanbul 23:00 → bugün bitiyor
  const listedSales = flashList || [
    { _id: SALE(1), product: product(1, { isOutOfStock: true }), name: "Akşam flaşı · Ürün 1", discountPercentage: 20, startDate: bulkStart, endDate: bulkEnd, applied: true, appliedPrice: 80 },
    { _id: SALE(2), product: product(2), name: "Akşam flaşı · Ürün 2", discountPercentage: 20, startDate: bulkStart, endDate: bulkEnd, applied: true, appliedPrice: 80 },
    { _id: SALE(3), product: product(3), name: "Ürün 3 - Flash Sale", discountPercentage: 15, startDate: new Date("2026-11-04T10:00:00Z"), endDate: new Date("2026-11-05T10:00:00Z") },
  ];
  const flashCalls = [];
  t.mock.method(FlashSale, "find", (filter) => {
    const record = { filter };
    flashCalls.push(record);
    if (filter._id && failFlashPerformance) throw new Error("getiri sorgusu düştü");
    if (filter._id) return chain(listedSales.filter((sale) => filter._id.$in.includes(sale._id)).map((sale) => ({ ...sale, product: sale.product._id, isActive: true })), record);
    if (filter.appliedPrice) return chain([], record);
    if (filter.isActive) return chain(listedSales, record);
    throw new Error(`beklenmeyen FlashSale sorgusu: ${JSON.stringify(filter)}`);
  });
  const liveDeal = { _id: DEAL(1), product: product(2), weeklyPrice: 45, discountPercentage: 55, startDate: new Date("2026-10-26T21:00:00Z"), endDate: new Date("2026-11-08T20:59:59.999Z"), isActive: true, createdAt: new Date("2026-10-26T20:00:00Z"), updatedAt: new Date("2026-10-26T20:00:00Z") };
  const plannedDeal = { _id: DEAL(2), product: product(4), weeklyPrice: 20, startDate: new Date("2026-11-08T21:00:00Z"), endDate: new Date("2026-11-15T20:59:59.999Z"), isActive: false, scheduled: true, createdAt: new Date("2026-11-01T10:00:00Z") };
  const staleDeal = { _id: DEAL(3), product: product(5), weeklyPrice: 20, startDate: new Date("2026-11-08T21:00:00Z"), endDate: null, isActive: false, createdAt: new Date("2026-11-01T10:00:00Z") };
  const weeklyCalls = [];
  t.mock.method(WeeklyProduct, "find", (filter) => {
    const record = { filter };
    weeklyCalls.push(record);
    if (filter.$or) return chain([liveDeal, plannedDeal, staleDeal], record);
    const plain = { ...liveDeal, product: PRODUCT(2) };
    if (filter._id || filter.product) return chain([plain], record);
    throw new Error(`beklenmeyen WeeklyProduct sorgusu: ${JSON.stringify(filter)}`);
  });
  const orders = [
    { _id: ORDER(1), status: "Teslim Edildi", createdAt: new Date("2026-11-02T12:00:00Z"), couponCode: "GECE", couponDiscount: 15, productTotal: 110, totalAmount: 110, products: [
      { product: PRODUCT(2), quantity: 2, price: 45, originalPrice: 100, priceSource: "weekly" },
      { product: PRODUCT(1), quantity: 1, price: 80, originalPrice: 100, priceSource: "flash", flashSaleId: SALE(1) },
    ] },
  ];
  t.mock.method(Order, "find", (filter) => chain(() => matchOrders(orders, filter)));
  t.mock.method(Product, "find", () => chain([]));
  const couponDoc = (n, extra) => ({ _id: COUPON(n), code: `KOD${n}`, description: "", discountType: "percentage", discountPercentage: 10, discountAmount: 0, minimumOrderAmount: 0, usageLimit: null, usageCount: 0, createdAt: new Date("2026-10-01T10:00:00Z"), ...extra });
  t.mock.method(Coupon, "find", (filter) => {
    if (failCoupons) throw new Error("kupon koleksiyonu okunamadı");
    assert.deepEqual(filter.isReferralCoupon, { $ne: true });
    assert.deepEqual(filter.$or, [{ userId: null }, { userId: { $exists: false } }]);
    return chain([
      couponDoc(1, { code: "GECE", expirationDate: new Date("2026-11-02T20:59:59.999Z") }),
      couponDoc(2, { code: "DOLU", discountType: "fixed", discountAmount: 20, usageLimit: 5, usageCount: 5, expirationDate: new Date("2026-11-20T20:59:59.999Z") }),
    ]);
  });
  t.mock.method(CouponRequest, "find", () => chain([
    { _id: hex("c1", 1), title: "Topluluk indirimi", description: "", targetCount: 10, discountPercentage: 5, startsAt: new Date("2026-11-01T10:00:00Z"), endsAt: new Date("2026-11-10T10:00:00Z"),
      requesters: [{ user: hex("aa", 1) }, { user: hex("aa", 2) }] },
  ]));
  t.mock.method(Referral, "find", (filter) => {
    assert.deepEqual(filter.referrer.$in, [hex("aa", 1), hex("aa", 2)]);
    return chain([{ referrer: hex("aa", 1), totalReferrals: 1 }]);
  });
  t.mock.method(Mission, "find", () => chain([
    { _id: hex("e1", 1), title: "3 sipariş ver", description: "", targetOrders: 3, minOrderAmount: 150, rewardAmount: 50, startsAt: new Date("2026-11-01T10:00:00Z"), endsAt: new Date("2026-11-05T20:59:59.999Z"), completions: [{ completedAt: NOW }, { completedAt: NOW }] },
  ]));
  t.mock.method(Banner, "find", () => chain([{ _id: hex("ba", 1), title: "Kış fırsatları", subtitle: "Sıcak içecekler", image: "b.jpg", linkUrl: null }]));
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => ({ key: "default", winBack: { enabled: true, coupon: { enabled: true, type: "percentage", value: 15, validDays: 7 } } }) }));
  t.mock.method(AutomationLog, "find", () => chain([]));
  t.mock.method(Settings, "findOne", () => chain({ delivery: { freeDeliveryEverywhere: true } }));
  return { flashCalls, weeklyCalls };
};

const assertOverview = (body, { flashCalls, weeklyCalls }) => {
  assert.deepEqual(body.partial, []);
  assert.deepEqual(body.capped, []);
  assert.equal(body.generatedAt, NOW.toISOString());
  assert.deepEqual(body.horizon, { from: "2026-11-01T21:00:00.000Z", to: "2026-11-15T21:00:00.000Z", days: 14 });
  assert.equal(body.tonightCutoff, "2026-11-03T01:00:00.000Z");
  assert.deepEqual(Object.keys(body.groups), ["flash", "weekly", "coupon", "coupon_request", "mission", "banner", "automation", "free_delivery"]);

  // Flaş: toplu kampanya tek öğe (bugün bitiyor), planlı tekil kampanya getirisiz
  const [bulk, planned] = body.groups.flash;
  assert.equal(bulk.title, "Akşam flaşı");
  assert.equal(bulk.status, "ending_today");
  assert.equal(bulk.children.length, 2);
  assert.equal(bulk.stats.units, 1);
  assert.equal(bulk.stats.revenue, 80);
  assert.equal(planned.status, "upcoming");
  assert.equal(planned.stats, null);
  // Planlı kampanya getiri sorgusuna girmez
  const perfQuery = flashCalls.find((call) => call.filter._id);
  assert.deepEqual(perfQuery.filter._id.$in, [SALE(1), SALE(2)]);
  // Liste sorgusu: açık, bitmemiş, 14 gün içinde başlayan; ürün alanlarıyla
  const listQuery = flashCalls.find((call) => call.filter.isActive);
  assert.deepEqual(listQuery.filter.endDate, { $gt: NOW });
  assert.equal(listQuery.filter.startDate.$lt.toISOString(), "2026-11-15T21:00:00.000Z");
  assert.equal(listQuery.populate[0][0], "product");
  assert.match(listQuery.select, /applied /);

  // Haftalık: yayındaki grup getirili, planlı (scheduled) grup ayrı; durdurulmuş planlanmamış kayıt yok
  const [liveWeekly, plannedWeekly] = body.groups.weekly;
  assert.equal(body.groups.weekly.length, 2);
  assert.equal(liveWeekly.status, "live");
  assert.equal(liveWeekly.details.productCount, 1);
  assert.equal(liveWeekly.stats.units, 2);
  assert.equal(liveWeekly.stats.discount, 110);
  assert.equal(liveWeekly.children[0].discountPercentage, 55);
  assert.equal(plannedWeekly.status, "upcoming");
  assert.equal(plannedWeekly.title, "Planlı haftalık fırsatlar");
  assert.equal(plannedWeekly.details.planned, true);
  assert.equal(plannedWeekly.stats, null);
  const weeklyList = weeklyCalls.find((call) => call.filter.$or);
  assert.deepEqual(weeklyList.options, { strictQuery: false });
  assert.ok(weeklyList.filter.$or.some((clause) => clause.scheduled === true));

  // Kuponlar: bugün biten önce; son 30 günün kullanımı koddan
  const [ending, full] = body.groups.coupon;
  assert.equal(ending.title, "GECE");
  assert.equal(ending.status, "ending_today");
  assert.equal(ending.stats.orders30, 1);
  assert.equal(ending.stats.discount30, 15);
  assert.equal(full.stats.exhausted, true);
  assert.equal(full.details.discountType, "fixed");
  assert.equal(full.details.discountValue, 20);

  // Topluluk talebi: davetli katılımcı 2 puan
  assert.deepEqual(body.groups.coupon_request[0].stats, { participants: 2, weightedCount: 3, targetCount: 10 });
  assert.deepEqual(body.groups.coupon_request[0].target, { tab: "coupons", section: "requests" });
  assert.equal(body.groups.mission[0].stats.completions, 2);
  assert.equal(body.groups.mission[0].stats.rewardTotal, 100);
  assert.match(body.groups.mission[0].details.rule, /3 sipariş ver/);
  assert.deepEqual(body.groups.mission[0].target, { tab: "coupons", section: "missions" });
  assert.equal(body.groups.banner[0].title, "Kış fırsatları");
  assert.equal(body.groups.automation.length, 1);
  assert.equal(body.groups.automation[0].id, "automation:winBack");
  assert.deepEqual(body.groups.automation[0].details.coupon, { type: "percentage", value: 15, validDays: 7 });
  assert.deepEqual(body.groups.automation[0].target, { tab: "push", section: "auto" });
  assert.equal(body.groups.free_delivery.length, 1);
  assert.equal(body.freeDeliveryEverywhere, true);

  // Sayılar: yayında 8 (flaş 1, haftalık 1, kupon 1, talep 1, görev 1, vitrin 1, otomasyon 1, ücretsiz teslimat 1);
  // kullanım sınırı dolmuş DOLU kuponu groups.coupon'da döner ama yayında sayılmaz
  assert.deepEqual(body.counts, {
    live: 8, endingToday: 2, upcoming: 2,
    byType: { flash: 1, weekly: 1, coupon: 1, coupon_request: 1, mission: 1, banner: 1, automation: 1, free_delivery: 1 },
  });
  assert.equal(body.groups.coupon.length, 2);

  // Dikkat: stoksuz ürün, bugün biten kampanya, flaş + haftalık çakışması, bugün biten kupon, dolu kupon
  assert.deepEqual(body.attention.map((item) => item.kind), [
    "product_unavailable", "ending_today", "flash_weekly_overlap", "coupon_ending", "coupon_exhausted",
  ]);
  assert.equal(body.attention[0].title, "Ürün 1");
  assert.equal(body.attention[2].flashPrice, 80);
  assert.equal(body.attention[2].weeklyPrice, 45);
  assert.equal(body.attention[2].effective, "weekly");

  // Toplamlar
  assert.equal(body.totals.last7.flash.revenue, 80);
  assert.equal(body.totals.last7.weekly.revenue, 90);
  assert.equal(body.totals.last7.weekly.discount, 110);
  assert.deepEqual(body.totals.last7.coupon, { orders: 1, discount: 15 });
  assert.equal(body.totals.couponsByCode, undefined, "kod bazında ham liste yanıta konmaz");
  assert.equal(body.performanceTruncated, false);
};

test("overview: türlere göre gruplu, durumlu, getirili; dikkat ve toplamlar", async (t) => {
  const calls = overviewMocks(t);
  assertOverview(await buildCampaignOverview(NOW), calls);
});

test("GET /overview: yanıt { success, ...overview }, önbelleğe alınmaz", async (t) => {
  const calls = overviewMocks(t);
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const res = response();
  await getCampaignOverview({ query: {} }, res);
  t.mock.timers.reset();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assertOverview(res.body, calls);
});

test("overview: bir bölüm okunamazsa diğerleri döner, bölüm partial listesinde", async (t) => {
  overviewMocks(t, { failCoupons: true });
  t.mock.method(console, "error", () => {});
  const overview = await buildCampaignOverview(NOW);
  assert.deepEqual(overview.partial, ["coupon"]);
  assert.deepEqual(overview.groups.coupon, []);
  assert.equal(overview.groups.flash.length, 2);
  assert.ok(!overview.attention.some((item) => item.type === "coupon"));
});

test("overview: liste sınırına takılan bölüm capped listesinde", async (t) => {
  const start = new Date("2026-11-04T10:00:00Z");
  const flashList = Array.from({ length: LIST_CAP }, (_, i) => ({
    _id: SALE(i + 1), product: { _id: PRODUCT(i + 1), name: `Ürün ${i + 1}`, price: 10 }, name: "Hafta sonu · Ürün", discountPercentage: 10,
    startDate: start, endDate: new Date("2026-11-05T10:00:00Z"),
  }));
  overviewMocks(t, { flashList });
  const overview = await buildCampaignOverview(NOW);
  assert.deepEqual(overview.capped, ["flash"]);
  // Ortak "Hafta sonu · " öneki ve aynı tarihler: tek kampanya öğesi
  assert.equal(overview.groups.flash.length, 1);
  assert.equal(overview.groups.flash[0].children.length, LIST_CAP);
  assert.equal(overview.groups.flash[0].title, "Hafta sonu");
});

test("overview: getiri okunamazsa yayındaki flaş/haftalık öğede stats null (sıfır gösterilmez)", async (t) => {
  overviewMocks(t, { failFlashPerformance: true });
  t.mock.method(console, "error", () => {});
  const overview = await buildCampaignOverview(NOW);
  assert.deepEqual(overview.partial, ["flash_performance"]);
  assert.equal(overview.groups.flash[0].stats, null);
  assert.ok(overview.groups.flash[0].children.every((child) => child.stats === null));
  assert.equal(overview.groups.weekly[0].stats.units, 2, "haftalık getiri etkilenmez");
});

test("GET /overview: beklenmeyen hata 500 ve genel mesaj döner", async (t) => {
  overviewMocks(t);
  t.mock.method(console, "error", () => {});
  // Yanıt yazılırken hata: denetleyici yakalar
  const res = response();
  let calls = 0;
  res.json = (body) => {
    calls += 1;
    if (calls === 1) throw new Error("yazılamadı");
    res.body = body;
    return res;
  };
  await getCampaignOverview({ query: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, message: "Kampanya merkezi yüklenemedi" });
});
