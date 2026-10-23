import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import User from "../models/user.model.js";
import { buildDashboardRange, computeDashboardSummary, fillSeries, getDashboardSummary } from "../controllers/ordersAnalytics.controller.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-20T12:30:00+03:00"); // Salı, Türkiye saatiyle 12:30
const TR_MIDNIGHT = new Date("2026-10-20T00:00:00+03:00");

// Order.aggregate iki kez çağrılır: $facet (dönem) ve önceki dönem toplamları
const mockOrder = (t, { facet = {}, previous = [], counts = {}, recent = [] } = {}) => {
  const calls = [];
  t.mock.method(Order, "aggregate", async (pipeline) => {
    calls.push(pipeline);
    const isFacet = pipeline.some((stage) => stage.$facet);
    if (isFacet) return [{ totals: [], byStatus: [], byDorm: [], series: [], topProducts: [], manual: [], ...facet }];
    return previous;
  });
  const countCalls = [];
  t.mock.method(Order, "countDocuments", async (filter) => {
    countCalls.push(filter);
    if (filter.status === "Hazırlanıyor" && filter.createdAt) return counts.delayed ?? 0;
    if (filter.status === "Hazırlanıyor") return counts.preparing ?? 0;
    return counts.active ?? 0;
  });
  t.mock.method(Order, "find", () => {
    const chain = { select: () => chain, populate: () => chain, sort: () => chain, limit: () => chain, lean: async () => recent };
    return chain;
  });
  return { calls, countCalls };
};

test("dönem sınırları: bugün saatlik, 7/30 gün günlük, bu ay, tüm zamanlar ve özel aralık", () => {
  const today = buildDashboardRange({ period: "today" }, NOW);
  assert.equal(today.start.toISOString(), TR_MIDNIGHT.toISOString());
  assert.equal(today.end, null);
  assert.equal(today.bucket, "hour");
  // Önceki dönem: dün aynı saate kadar
  assert.equal(today.previous.start.toISOString(), new Date(TR_MIDNIGHT.getTime() - DAY).toISOString());
  assert.equal(today.previous.end.toISOString(), new Date(NOW.getTime() - DAY).toISOString());

  const week = buildDashboardRange({ period: "7d" }, NOW);
  assert.equal(week.start.toISOString(), new Date(TR_MIDNIGHT.getTime() - 6 * DAY).toISOString());
  assert.equal(week.bucket, "day");
  assert.equal(week.previous.end.toISOString(), week.start.toISOString());
  assert.equal(week.previous.start.toISOString(), new Date(week.start.getTime() - 7 * DAY).toISOString());

  const month = buildDashboardRange({ period: "month" }, NOW);
  assert.equal(month.start.toISOString(), new Date("2026-10-01T00:00:00+03:00").toISOString());
  assert.equal(month.previous.start.toISOString(), new Date("2026-09-01T00:00:00+03:00").toISOString());
  assert.equal(month.previous.end.toISOString(), month.start.toISOString());

  const all = buildDashboardRange({ period: "all" }, NOW);
  assert.equal(all.start, null);
  assert.equal(all.previous, null);
  assert.equal(all.bucket, "month");

  const custom = buildDashboardRange({ period: "custom", from: "2026-07-01T00:00:00+03:00", to: "2026-09-06T00:00:00+03:00" }, NOW);
  assert.equal(custom.bucket, "day");
  assert.equal(custom.end.toISOString(), new Date("2026-09-06T00:00:00+03:00").toISOString());
  assert.equal(custom.previous.end.toISOString(), custom.start.toISOString());
  assert.equal(custom.previous.end.getTime() - custom.previous.start.getTime(), custom.end.getTime() - custom.start.getTime());

  // Geçersiz/eksik değerler güvenli varsayılana düşer
  assert.equal(buildDashboardRange({ period: "yarın" }, NOW).period, "today");
  assert.equal(buildDashboardRange({ period: "custom", from: "bozuk" }, NOW).period, "all");
});

test("seri boş kovalarla doldurulur (saatlik ve günlük)", () => {
  const today = buildDashboardRange({ period: "today" }, NOW);
  const hourly = fillSeries([{ _id: "2026-10-20T09", orders: 2, revenue: 80 }], today, "hour", NOW);
  assert.equal(hourly.length, 13); // 00..12
  assert.deepEqual(hourly[9], { key: "2026-10-20T09", orders: 2, revenue: 80 });
  assert.deepEqual(hourly[0], { key: "2026-10-20T00", orders: 0, revenue: 0 });

  const week = buildDashboardRange({ period: "7d" }, NOW);
  const daily = fillSeries([{ _id: "2026-10-18", orders: 1, revenue: 40 }], week, "day", NOW);
  assert.equal(daily.length, 7);
  assert.equal(daily[0].key, "2026-10-14");
  assert.equal(daily[6].key, "2026-10-20");
  assert.equal(daily[4].orders, 1);

  // Tüm zamanlar: ilk satıştan bugüne aylık
  const all = buildDashboardRange({ period: "all" }, NOW);
  const monthly = fillSeries([{ _id: "2026-08", orders: 3, revenue: 120 }], all, "month", NOW);
  assert.deepEqual(monthly.map((p) => p.key), ["2026-08", "2026-09", "2026-10"]);
});

test("özet: toplamlar, delta, dağılımlar, çok satanlar ve dikkat gerektirenler aggregate/count ile hesaplanır", async (t) => {
  const { calls, countCalls } = mockOrder(t, {
    facet: {
      totals: [{ orders: 10, cancelled: 2, revenue: 1200 }],
      byStatus: [{ _id: "Teslim Edildi", count: 7 }, { _id: "İptal Edildi", count: 2 }, { _id: "Hazırlanıyor", count: 1 }],
      byDorm: [{ _id: "girlsDorm", orders: 6, revenue: 800 }, { _id: "boysDorm", orders: 2, revenue: 400 }],
      series: [{ _id: "2026-10-20", orders: 8, revenue: 1200 }],
      topProducts: [{ _id: { toString: () => "507f191e810c19729de8c001" }, name: "Süt", quantity: 12, revenue: 480 }],
      manual: [{ revenue: 55.5 }],
    },
    previous: [{ orders: 8, cancelled: 0, revenue: 1000 }],
    counts: { delayed: 1, preparing: 3, active: 5 },
    recent: [{ _id: "64f1a2b3c4d5e6f76ac8bc4d", user: { name: "Ayşe" }, totalAmount: 120, status: "Hazırlanıyor", products: [{ quantity: 2 }, { quantity: 1 }], deliveryPoint: "girlsDorm", createdAt: NOW }],
  });
  t.mock.method(Product, "countDocuments", async (filter) => (filter.isOutOfStock ? 4 : 2));
  t.mock.method(SupportRequest, "countDocuments", async () => 3);
  t.mock.method(User, "countDocuments", async (filter) => (filter.createdAt ? 5 : 250));

  const summary = await computeDashboardSummary({ period: "7d" }, NOW);

  // Dönem filtresi aggregate'in $match aşamasına gider; tüm geçmiş çekilmez
  assert.equal(calls.length, 2);
  assert.ok(calls[0][0].$match.createdAt.$gte instanceof Date);
  assert.ok(calls[0][1].$facet.topProducts.some((stage) => stage.$limit === 5));
  assert.deepEqual(calls[1][0].$match.createdAt, { $gte: summaryDate(summary.range.start, -7), $lt: new Date(summary.range.start) });

  assert.deepEqual(summary.totals, { orders: 10, cancelled: 2, completed: 8, revenue: 1200, averageBasket: 150, cancelRate: 20, deliveryFeeRevenue: 0 });
  assert.equal(summary.previous.revenue, 1000);
  assert.equal(summary.delta.revenue, 20);
  assert.equal(summary.delta.orders, 25);
  assert.equal(summary.delta.averageBasket, 20);
  assert.equal(summary.delta.cancelRate, 20); // puan farkı
  assert.deepEqual(summary.statusDistribution, [
    { status: "Hazırlanıyor", count: 1 }, { status: "Yolda", count: 0 }, { status: "Teslim Edildi", count: 7 }, { status: "İptal Edildi", count: 2 },
  ]);
  assert.deepEqual(summary.dormDistribution[0], { deliveryPoint: "girlsDorm", orders: 6, revenue: 800 });
  assert.equal(summary.series.length, 7);
  assert.equal(summary.series.at(-1).revenue, 1200);
  assert.deepEqual(summary.topProducts, [{ productId: "507f191e810c19729de8c001", name: "Süt", quantity: 12, revenue: 480 }]);
  assert.equal(summary.manualRevenue, 55.5);
  assert.deepEqual(summary.customers, { total: 250, new: 5 });
  assert.deepEqual(summary.attention, { delayedOrders: 1, preparingOrders: 3, activeOrders: 5, productsWithoutImage: 2, productsOutOfStock: 4, waitingSupport: 3 });
  // Geciken sipariş: 20 dk'dan eski Hazırlanıyor
  const delayedFilter = countCalls.find((f) => f.status === "Hazırlanıyor" && f.createdAt);
  assert.equal(delayedFilter.createdAt.$lt.toISOString(), new Date(NOW.getTime() - 20 * 60 * 1000).toISOString());
  assert.equal(summary.recentOrders.length, 1);
  assert.deepEqual(summary.recentOrders[0], {
    orderId: "64f1a2b3c4d5e6f76ac8bc4d", customerName: "Ayşe", customerAvatar: null, paymentMethod: null, paymentMethodLabel: "Belirtilmedi",
    totalAmount: 120, status: "Hazırlanıyor", itemCount: 3, deliveryPoint: "girlsDorm", deliveryPointName: "", createdAt: NOW,
    productTotal: 120, deliveryFee: 0, deliveryZoneName: "",
  });
});

const summaryDate = (iso, days) => new Date(new Date(iso).getTime() + days * DAY);

test("tüm zamanlar: önceki dönem ve delta yok; ürün/destek sayımı başarısızsa atlanır", async (t) => {
  const { calls } = mockOrder(t, { facet: { totals: [{ orders: 3, cancelled: 0, revenue: 90 }] } });
  t.mock.method(Product, "countDocuments", async () => { throw new Error("koleksiyon yok"); });
  t.mock.method(SupportRequest, "countDocuments", async () => 0);
  t.mock.method(User, "countDocuments", async () => 10);
  const summary = await computeDashboardSummary({ period: "all" }, NOW);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0].$match, {});
  assert.equal(summary.previous, null);
  assert.equal(summary.delta, null);
  assert.equal(summary.attention.productsWithoutImage, null);
  assert.equal(summary.attention.productsOutOfStock, null);
  assert.equal(summary.customers.new, null);
  assert.equal(summary.totals.averageBasket, 30);
});

test("GET /orders-analytics/summary yanıtı { summary } sarmalında döner ve hata 500 verir", async (t) => {
  mockOrder(t, { facet: { totals: [{ orders: 1, cancelled: 0, revenue: 40 }] } });
  t.mock.method(Product, "countDocuments", async () => 0);
  t.mock.method(SupportRequest, "countDocuments", async () => 0);
  t.mock.method(User, "countDocuments", async () => 1);
  const res = () => ({ statusCode: 200, headers: {}, body: null, set(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });
  const ok = res();
  await getDashboardSummary({ query: { period: "today" } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.summary.period, "today");
  assert.equal(ok.body.summary.totals.revenue, 40);
  assert.equal(ok.headers["Cache-Control"], "no-store");

  t.mock.method(Order, "aggregate", async () => { throw new Error("db kapalı"); });
  const failed = res();
  await getDashboardSummary({ query: {} }, failed);
  assert.equal(failed.statusCode, 500);
  assert.match(failed.body.message, /özeti/);
});
