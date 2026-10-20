import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/order.model.js";
import {
  resolveComparePeriods, summarizeCompareOrders, prepMinutes, dailySeries, hourlyBreakdown,
  dormBreakdown, topProductsBreakdown, buildCompareResponse, getAnalyticsCompare,
} from "../controllers/analytics.controller.js";

const H = 60 * 60 * 1000;
const at = (iso) => new Date(iso);
const order = (n, fields = {}) => ({
  _id: `507f191e810c19729de8c${String(n).padStart(3, "0")}`,
  products: [{ product: "p1", name: "Süt", category: "sut", quantity: 2, price: 40 }],
  totalAmount: 80, status: "Teslim Edildi", deliveryPoint: "girlsDorm",
  createdAt: at("2026-10-14T09:30:00+03:00"), statusHistory: [], ...fields,
});

test("week period: Monday 00:00 TR start, previous window ends at the same elapsed point", () => {
  const now = at("2026-10-14T12:00:00+03:00"); // Çarşamba
  const r = resolveComparePeriods("week", now);
  assert.equal(r.current.start.toISOString(), "2026-10-11T21:00:00.000Z"); // Pzt 00:00 TR
  assert.equal(r.previous.start.toISOString(), "2026-10-04T21:00:00.000Z");
  assert.equal(r.previous.end.toISOString(), "2026-10-07T09:00:00.000Z"); // geçen hafta Çarşamba 12:00 TR
  assert.equal(r.previousFull.end.toISOString(), r.current.start.toISOString());
});

test("month/day/year periods and unknown falls back to week", () => {
  const now = at("2026-03-31T23:30:00+03:00");
  assert.equal(resolveComparePeriods("month", now).current.start.toISOString(), "2026-02-28T21:00:00.000Z");
  assert.equal(resolveComparePeriods("month", now).previous.start.toISOString(), "2026-01-31T21:00:00.000Z");
  assert.equal(resolveComparePeriods("day", now).current.start.toISOString(), "2026-03-30T21:00:00.000Z");
  assert.equal(resolveComparePeriods("day", now).previous.start.toISOString(), "2026-03-29T21:00:00.000Z");
  assert.equal(resolveComparePeriods("year", now).current.start.toISOString(), "2025-12-31T21:00:00.000Z");
  assert.equal(resolveComparePeriods("bozuk", now).period, "week");
  // Önceki pencere mevcut dönemin başını aşamaz (ay uzunlukları farklıyken)
  const feb = resolveComparePeriods("month", at("2026-03-30T12:00:00+03:00"));
  assert.ok(feb.previous.end.getTime() <= feb.current.start.getTime());
});

test("prep time: Hazırlanıyor→Yolda from statusHistory, createdAt fallback, missing → null", () => {
  const created = at("2026-10-14T09:00:00+03:00");
  assert.equal(prepMinutes({ createdAt: created, statusHistory: [
    { status: "Hazırlanıyor", changedAt: at("2026-10-14T09:10:00+03:00") },
    { status: "Yolda", changedAt: at("2026-10-14T09:25:00+03:00") },
  ] }), 15);
  assert.equal(prepMinutes({ createdAt: created, statusHistory: [{ status: "Yolda", changedAt: at("2026-10-14T09:30:00+03:00") }] }), 30);
  assert.equal(prepMinutes({ createdAt: created, statusHistory: [] }), null);
});

test("summary: cancelled excluded from revenue, cancel rate, coupons, prep average/median", () => {
  const s = summarizeCompareOrders([
    order(1, { couponCode: "X", couponDiscount: 10, statusHistory: [{ status: "Yolda", changedAt: at("2026-10-14T09:40:00+03:00") }] }),
    order(2, { totalAmount: 120, statusHistory: [{ status: "Yolda", changedAt: at("2026-10-14T10:00:00+03:00") }] }),
    order(3, { status: "İptal Edildi", totalAmount: 50 }),
    order(4, { status: "Hazırlanıyor" }),
  ]);
  assert.equal(s.orders, 3);
  assert.equal(s.revenue, 280);
  assert.equal(s.cancelled, 1);
  assert.equal(s.cancelledAmount, 50);
  assert.equal(s.cancelRate, 25);
  assert.equal(s.averageOrderValue, 93.33);
  assert.equal(s.couponOrders, 1);
  assert.equal(s.couponDiscount, 10);
  assert.equal(s.avgPrepMinutes, 20);
  assert.equal(s.medianPrepMinutes, 20);
  assert.equal(s.prepSampled, 2);
  assert.equal(s.units, 6);
  assert.equal(summarizeCompareOrders([]).cancelRate, null);
});

test("breakdowns: daily index from period start, TR hours, dorms, top products", () => {
  const start = at("2026-10-12T00:00:00+03:00");
  const orders = [
    order(1, { createdAt: at("2026-10-12T00:30:00+03:00") }), // TR saat 0, gün 1
    order(2, { createdAt: at("2026-10-13T23:45:00+03:00"), deliveryPoint: "boysDorm", products: [{ product: "p2", name: "Çay", quantity: 1, price: 30 }], totalAmount: 30 }),
    order(3, { createdAt: at("2026-10-13T20:00:00+03:00"), status: "İptal Edildi" }),
  ];
  const daily = dailySeries(orders, start);
  assert.deepEqual(daily.map((d) => [d.dayIndex, d.amount, d.orders]), [[1, 80, 1], [2, 30, 1]]);
  const hourly = hourlyBreakdown(orders);
  assert.equal(hourly.length, 24);
  assert.equal(hourly[0].orders, 1);
  assert.equal(hourly[23].orders, 1);
  assert.equal(hourly[20].orders, 0); // iptal sayılmaz
  assert.deepEqual(dormBreakdown(orders), [
    { deliveryPoint: "girlsDorm", orders: 1, revenue: 80 },
    { deliveryPoint: "boysDorm", orders: 1, revenue: 30 },
  ]);
  const top = topProductsBreakdown(orders);
  assert.equal(top[0].name, "Süt");
  assert.deepEqual([top[0].units, top[0].orders, top[0].revenue, top[0].category], [2, 1, 80, "sut"]);
});

test("response: deltas vs previous (same elapsed span), previousFull kept, category shares", () => {
  const ranges = resolveComparePeriods("week", at("2026-10-14T12:00:00+03:00"));
  const body = buildCompareResponse({
    ranges,
    currentOrders: [order(1, { totalAmount: 200 }), order(2, { totalAmount: 100 })],
    previousOrders: [
      order(3, { createdAt: at("2026-10-06T10:00:00+03:00"), totalAmount: 100 }),
      order(4, { createdAt: at("2026-10-09T10:00:00+03:00"), totalAmount: 500 }), // pencere dışı (geçen hafta Perşembe)
    ],
    categories: [{ category: "sut", units: 4, revenue: 300 }, { category: "cips", units: 1, revenue: 100 }],
  });
  assert.equal(body.period, "week");
  assert.equal(body.current.revenue, 300);
  assert.equal(body.previous.revenue, 100);
  assert.equal(body.previousFull.revenue, 600);
  assert.equal(body.deltas.revenue, 200);
  assert.equal(body.deltas.orders, 100);
  assert.equal(body.deltas.cancelRate, 0);
  assert.equal(body.deltas.avgPrepMinutes, null);
  assert.deepEqual(body.byCategory.map((c) => c.share), [75, 25]);
  assert.equal(body.salesByDay.current.length, 1);
  assert.equal(body.hourly.length, 24);
});

test("GET /analytics/compare queries both windows with lean() and the category aggregate", async (t) => {
  const filters = [];
  t.mock.method(Order, "find", (filter) => {
    filters.push(filter);
    return { select: () => ({ lean: async () => (filter.createdAt.$gte.getTime() >= Date.now() - 8 * 24 * H ? [order(1)] : []) }) };
  });
  const pipelines = [];
  t.mock.method(Order, "aggregate", async (pipeline) => { pipelines.push(pipeline); return [{ category: "sut", units: 2, revenue: 80 }]; });
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await getAnalyticsCompare({ query: { period: "week" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(filters.length, 2);
  assert.deepEqual(filters[0].status, { $in: ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"] });
  assert.ok(filters[1].createdAt.$lt.getTime() === filters[0].createdAt.$gte.getTime()); // önceki dönem bu dönemin başında biter
  assert.equal(pipelines.length, 1);
  assert.ok(pipelines[0].some((stage) => stage.$lookup?.from === "products"));
  assert.equal(res.body.byCategory[0].share, 100);
  assert.ok(res.body.generatedAt);
});

test("GET /analytics/compare: database error → 500 with message", async (t) => {
  t.mock.method(Order, "find", () => ({ select: () => ({ lean: async () => { throw new Error("db"); } }) }));
  t.mock.method(Order, "aggregate", async () => []);
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await getAnalyticsCompare({ query: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.ok(res.body.message);
});
