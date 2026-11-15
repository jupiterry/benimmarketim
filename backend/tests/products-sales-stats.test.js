// Ürün başına satış özeti (GET /api/products/sales-stats) ve panelin bu veriyle yaptığı filtre, sıralama,
// "kaç gündür tükendi" ve CSV dışa aktarma. Veritabanı yok: Order.aggregate taklit edilir.
// Tarihler gerçek saate göre göreli kurulur (sabit takvim günü yok).
import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/order.model.js";
import {
  CANCELLED_STATUS, SALES_STATS_CACHE_MS, SALES_STATS_MAX_MS, buildSalesStatsPipeline, computeSalesStats, getSalesStats,
  mapSalesStats, resetSalesStatsCache,
} from "../services/productSalesStats.service.js";
import { getProductSalesStats } from "../controllers/product.controller.js";
import {
  FILTERS, LOST_SALES_MIN_UNITS, SORTS, STATS_FILTERS, buildCsv, matchesFilter, outOfStockDays, outOfStockLabel,
  salesTrend, sortProducts, statsOf,
} from "../../frontend/src/components/products/productUtils.js";

const DAY = 24 * 60 * 60 * 1000;
const PID = (n) => `99cc${String(n).padStart(20, "0")}`;

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  setHeader(key, value) { this.headers[key] = value; },
  json(body) { this.body = body; return this; },
});
const mockAggregate = (t, rows) => {
  const calls = [];
  t.mock.method(Order, "aggregate", (pipeline) => ({
    option(options) {
      calls.push({ pipeline, options });
      return typeof rows === "function" ? rows() : Promise.resolve(rows);
    },
  }));
  return calls;
};

test.beforeEach(() => resetSalesStatsCache());

test("aggregation: son 30 gün, iptal edilenler hariç, ürün bazında 7/30 gün adet ve sipariş sayısı", () => {
  const now = new Date();
  const pipeline = buildSalesStatsPipeline(now);
  const [match, project, unwind, perOrder, perProduct] = pipeline;
  assert.equal(pipeline.length, 5);

  assert.equal(now.getTime() - match.$match.createdAt.$gte.getTime(), 30 * DAY);
  assert.deepEqual(match.$match.status, { $ne: CANCELLED_STATUS });
  assert.equal(CANCELLED_STATUS, "İptal Edildi");
  assert.deepEqual(project.$project, { createdAt: 1, "products.product": 1, "products.quantity": 1 }, "yalnızca gereken alanlar okunur");
  assert.equal(unwind.$unwind, "$products");

  // Aynı ürün bir siparişte iki satırdaysa tek sipariş sayılır
  assert.deepEqual(perOrder.$group._id, { product: "$products.product", order: "$_id" });
  assert.deepEqual(perOrder.$group.units, { $sum: { $max: [1, { $ifNull: ["$products.quantity", 1] }] } });
  assert.equal(perProduct.$group._id, "$_id.product");
  assert.deepEqual(perProduct.$group.units30, { $sum: "$units" });
  assert.deepEqual(perProduct.$group.orders30, { $sum: 1 });
  const since7 = perProduct.$group.units7.$sum.$cond[0].$gte[1];
  assert.equal(now.getTime() - since7.getTime(), 7 * DAY);
});

test("mapSalesStats: satırları ürün kimliğine göre haritalar, bozuk değerleri temizler", () => {
  const stats = mapSalesStats([
    { _id: PID(1), units30: 42, units7: 12, orders30: 30 },
    { _id: { toString: () => PID(2) }, units30: 3, units7: 0, orders30: 2 },
    { _id: PID(3), units30: 2.6, units7: 9, orders30: "1" }, // 7 gün 30 günü aşamaz
    { _id: PID(4), units30: -5, units7: null, orders30: undefined },
    { _id: null, units30: 99 },
    null,
  ]);
  assert.deepEqual(stats, {
    [PID(1)]: { units7: 12, units30: 42, orders30: 30 },
    [PID(2)]: { units7: 0, units30: 3, orders30: 2 },
    [PID(3)]: { units7: 3, units30: 3, orders30: 1 },
    [PID(4)]: { units7: 0, units30: 0, orders30: 0 },
  });
  assert.deepEqual(mapSalesStats(undefined), {});
});

test("computeSalesStats: tek aggregation, süre sınırıyla", async (t) => {
  const calls = mockAggregate(t, [{ _id: PID(1), units30: 5, units7: 2, orders30: 4 }]);
  const now = new Date();
  const data = await computeSalesStats(now);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options, { maxTimeMS: SALES_STATS_MAX_MS });
  assert.equal(data.generatedAt, now.toISOString());
  assert.deepEqual(data.stats, { [PID(1)]: { units7: 2, units30: 5, orders30: 4 } });
});

test("getSalesStats: sonuç ~5 dakika bellekte tutulur; eşzamanlı istekler tek hesap yapar; hata önbelleğe alınmaz", async (t) => {
  assert.equal(SALES_STATS_CACHE_MS, 5 * 60 * 1000);
  let fail = true;
  const calls = mockAggregate(t, () => (fail ? Promise.reject(new Error("zaman aşımı")) : Promise.resolve([{ _id: PID(1), units30: 1, units7: 1, orders30: 1 }])));

  await assert.rejects(getSalesStats(), /zaman aşımı/);
  fail = false;
  const [a, b] = await Promise.all([getSalesStats(), getSalesStats()]);
  assert.equal(a, b);
  assert.equal(calls.length, 2, "başarısız deneme + tek başarılı hesap");
  const again = await getSalesStats();
  assert.equal(again, a);
  await getSalesStats({ force: true });
  assert.equal(calls.length, 2, "az önce hesaplandıysa 'Yenile' de önbelleği kullanır");

  // Önbellek süresi dolunca yeniden hesaplanır
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + 31 * 1000;
  await getSalesStats();
  assert.equal(calls.length, 2, "5 dakika dolmadan yeniden hesaplanmaz");
  await getSalesStats({ force: true });
  assert.equal(calls.length, 3, "30 sn sonra 'Yenile' yeniden hesaplar");
  Date.now = () => realNow() + 31 * 1000 + SALES_STATS_CACHE_MS + 1000;
  await getSalesStats();
  assert.equal(calls.length, 4);
});

test("uç: { success, generatedAt, stats } döner; hata 500 ve açıklama", async (t) => {
  mockAggregate(t, [{ _id: PID(1), units30: 42, units7: 12, orders30: 30 }]);
  const res = response();
  await getProductSalesStats({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(Math.abs(Date.now() - new Date(res.body.generatedAt).getTime()) < 5000);
  assert.deepEqual(res.body.stats, { [PID(1)]: { units7: 12, units30: 42, orders30: 30 } });

  resetSalesStatsCache();
  mockAggregate(t, () => Promise.reject(new Error("operation exceeded time limit")));
  const originalError = console.error;
  console.error = () => {};
  t.after(() => { console.error = originalError; });
  const failed = response();
  await getProductSalesStats({ query: {} }, failed);
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.success, false);
  assert.equal(failed.body.stats, undefined);
});

// ── Panel tarafı (saf yardımcılar) ───────────────────────────────────────────

const now = Date.now();
const ago = (days) => new Date(now - days * DAY).toISOString();
const product = (n, fields = {}) => ({
  _id: PID(n), name: `Ürün ${n}`, category: "gida", price: 10, order: n, isOutOfStock: false, isHidden: false,
  createdAt: ago(90), ...fields,
});
const stats = {
  [PID(1)]: { units7: 12, units30: 42, orders30: 30 },
  [PID(2)]: { units7: 1, units30: 5, orders30: 4 },
  [PID(3)]: { units7: 0, units30: 4, orders30: 3 },
};

test("panel: satış özeti yoksa rakam uydurulmaz; satmayan ürün sıfır sayılır", () => {
  assert.equal(statsOf(null, PID(1)), null);
  assert.deepEqual(statsOf(stats, PID(1)), { units7: 12, units30: 42, orders30: 30 });
  assert.deepEqual(statsOf(stats, PID(9)), { units7: 0, units30: 0, orders30: 0 });
});

test("panel: tempo oku yalnızca fark belirginse ve yeterli satış varsa gösterilir", () => {
  assert.equal(salesTrend({ units7: 14, units30: 30 }), "up", "7 günde 14, önceki 23 günde 16");
  assert.equal(salesTrend({ units7: 1, units30: 30 }), "down");
  assert.equal(salesTrend({ units7: 7, units30: 30 }), null, "aynı tempo");
  assert.equal(salesTrend({ units7: 2, units30: 2 }), null, "çok az satış: ok yok");
  assert.equal(salesTrend({ units7: 0, units30: 3 }), null);
  assert.equal(salesTrend({ units7: 0, units30: 0 }), null);
  assert.equal(salesTrend(null), null);
});

test("panel: 'kaç gündür tükendi'; tarihi olmayan eski kayıt yalnızca 'Tükendi'", () => {
  assert.equal(outOfStockDays(product(1, { isOutOfStock: true, outOfStockSince: ago(12.4) }), now), 12);
  assert.equal(outOfStockLabel(product(1, { isOutOfStock: true, outOfStockSince: ago(12.4) }), now), "12 gündür tükendi");
  assert.equal(outOfStockLabel(product(1, { isOutOfStock: true, outOfStockSince: ago(1) }), now), "1 gündür tükendi");
  assert.equal(outOfStockLabel(product(1, { isOutOfStock: true, outOfStockSince: ago(0.2) }), now), "Bugün tükendi");
  assert.equal(outOfStockLabel(product(1, { isOutOfStock: true }), now), "Tükendi");
  assert.equal(outOfStockLabel(product(1, { isOutOfStock: true, outOfStockSince: null }), now), "Tükendi");
  assert.equal(outOfStockLabel(product(1, { isOutOfStock: true, outOfStockSince: "bozuk" }), now), "Tükendi");
  assert.equal(outOfStockLabel(product(1, { isOutOfStock: false, outOfStockSince: ago(3) }), now), "");
  assert.equal(outOfStockDays(product(1, { isOutOfStock: true, outOfStockSince: new Date(now + DAY).toISOString() }), now), 0, "saat farkı eksi gün göstermez");
});

test("panel: 'Çok satan ama tükendi' ve 'Yayında ama satmayan' filtreleri", () => {
  const flash = new Map();
  const ctx = { stats, now };
  assert.ok(STATS_FILTERS.has("lostSales") && STATS_FILTERS.has("stale"));
  assert.equal(FILTERS.find((f) => f.key === "lostSales").label, "Çok satan ama tükendi");
  assert.equal(FILTERS.find((f) => f.key === "stale").label, "Yayında ama satmayan");

  assert.equal(LOST_SALES_MIN_UNITS, 5);
  assert.equal(matchesFilter(product(1, { isOutOfStock: true }), "lostSales", flash, ctx), true);
  assert.equal(matchesFilter(product(2, { isOutOfStock: true }), "lostSales", flash, ctx), true, "tam eşik");
  assert.equal(matchesFilter(product(3, { isOutOfStock: true }), "lostSales", flash, ctx), false, "eşiğin altında");
  assert.equal(matchesFilter(product(1), "lostSales", flash, ctx), false, "stokta");
  assert.equal(matchesFilter(product(1, { isOutOfStock: true, isHidden: true }), "lostSales", flash, ctx), false, "gizli");

  assert.equal(matchesFilter(product(9), "stale", flash, ctx), true);
  assert.equal(matchesFilter(product(9, { createdAt: undefined }), "stale", flash, ctx), true, "tarihi olmayan eski kayıt");
  assert.equal(matchesFilter(product(9, { createdAt: ago(10) }), "stale", flash, ctx), false, "yeni ürün henüz satmamış olabilir");
  assert.equal(matchesFilter(product(3), "stale", flash, ctx), false, "satışı var");
  assert.equal(matchesFilter(product(9, { isOutOfStock: true }), "stale", flash, ctx), false);
  assert.equal(matchesFilter(product(9, { isHidden: true }), "stale", flash, ctx), false);

  // Satış özeti alınamadıysa bu filtreler hiçbir ürünü seçmez; diğer filtreler eskisi gibi çalışır
  assert.equal(matchesFilter(product(1, { isOutOfStock: true }), "lostSales", flash, { stats: null, now }), false);
  assert.equal(matchesFilter(product(9), "stale", flash, {}), false);
  assert.equal(matchesFilter(product(1, { isOutOfStock: true }), "outOfStock", flash), true);
  assert.equal(matchesFilter(product(1), "all", flash), true);
});

test("panel: 'Çok satan (30 gün)' ve 'En uzun süredir tükenen' sıralamaları", () => {
  assert.equal(SORTS.find((s) => s.key === "sold30").label, "Çok satan (30 gün)");
  assert.equal(SORTS.find((s) => s.key === "oosLongest").label, "En uzun süredir tükenen");

  const list = [product(3), product(9), product(1), product(2)];
  assert.deepEqual(sortProducts(list, "sold30", { stats }).map((p) => p._id), [PID(1), PID(2), PID(3), PID(9)]);
  assert.deepEqual(sortProducts(list, "sold30", {}).map((p) => p._id), [PID(1), PID(2), PID(3), PID(9)], "özet yoksa vitrin sırası");

  const stock = [
    product(1),
    product(2, { isOutOfStock: true, outOfStockSince: ago(2) }),
    product(3, { isOutOfStock: true }), // eski kayıt: tarih yok
    product(4, { isOutOfStock: true, outOfStockSince: ago(40) }),
    product(5, { isOutOfStock: true, outOfStockSince: ago(12) }),
  ];
  assert.deepEqual(sortProducts(stock, "oosLongest").map((p) => p._id), [PID(4), PID(5), PID(2), PID(3), PID(1)]);
  assert.equal(stock[0]._id, PID(1), "özgün dizi değişmez");
});

test("panel: CSV dışa aktarmada 30 günlük satış ve tükenme tarihi sütunları", () => {
  const since = new Date(now - 3 * DAY);
  const rows = buildCsv([
    product(1, { name: "Süt", isOutOfStock: true, outOfStockSince: since.toISOString() }),
    product(9, { name: "Tuz" }),
    product(3, { name: "Un", isOutOfStock: true }),
  ], stats).slice(1).split("\r\n").map((line) => line.split(";"));
  assert.deepEqual(rows[0].slice(-2), ["30 gün satış (adet)", "Tükenme tarihi"]);
  assert.equal(rows[1].at(-2), "42");
  const two = (n) => String(n).padStart(2, "0");
  assert.equal(rows[1].at(-1), `${two(since.getDate())}.${two(since.getMonth() + 1)}.${since.getFullYear()} ${two(since.getHours())}:${two(since.getMinutes())}`);
  assert.deepEqual(rows[2].slice(-2), ["0", ""], "satmayan ürün 0; stoktaki ürünün tükenme tarihi boş");
  assert.deepEqual(rows[3].slice(-2), ["4", ""], "tarihi bilinmeyen tükenmiş ürün");
  assert.ok(rows.every((r) => r.length === rows[0].length));

  // Satış özeti yoksa sütun boş kalır (0 yazılmaz)
  const without = buildCsv([product(1)]).split("\r\n")[1].split(";");
  assert.equal(without.at(-2), "");
});
