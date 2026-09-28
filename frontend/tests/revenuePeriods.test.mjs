import test from "node:test";
import assert from "node:assert/strict";
import { REVENUE_PERIODS, summarizeRevenue } from "../src/lib/revenuePeriods.js";

const period = (id) => REVENUE_PERIODS.find((item) => item.id === id);
const order = (createdAt, totalAmount = 100, status = "Teslim Edildi") => ({ createdAt, totalAmount, status });

test("old sales stay accessible but the new period starts at zero", () => {
  const orders = [order("2025-09-01T00:00:00+03:00"), order("2026-06-30T23:59:59.999+03:00", 250)];
  assert.deepEqual(summarizeRevenue(orders, period("current")), { revenue: 0, count: 0 });
  assert.deepEqual(summarizeRevenue(orders, period("previous")), { revenue: 350, count: 2 });
});

test("Turkey midnight boundaries split previous, between and current without overlap", () => {
  const orders = [
    order("2025-08-31T20:59:59.999Z", 1),
    order("2025-08-31T21:00:00Z", 2),
    order("2026-06-30T20:59:59.999Z", 4),
    order("2026-06-30T21:00:00Z", 8),
    order("2026-09-05T20:59:59.999Z", 16),
    order("2026-09-05T21:00:00Z", 32),
  ];
  assert.deepEqual(summarizeRevenue(orders, period("previous")), { revenue: 6, count: 2 });
  assert.deepEqual(summarizeRevenue(orders, period("between")), { revenue: 24, count: 2 });
  assert.deepEqual(summarizeRevenue(orders, period("current")), { revenue: 32, count: 1 });
  assert.deepEqual(summarizeRevenue(orders, period("all")), { revenue: 63, count: 6 });
});

test("cancelled and malformed orders do not inflate revenue; refreshed orders are included", () => {
  const orders = [
    order("2026-09-06T12:00:00+03:00", "125.50"),
    order("2026-09-06T12:00:00+03:00", 500, "İptal Edildi"),
    order("invalid", 200),
    order("2026-09-06T12:00:00+03:00", "invalid"),
  ];
  const original = JSON.stringify(orders);
  assert.deepEqual(summarizeRevenue(orders, period("current")), { revenue: 125.5, count: 1 });
  assert.equal(JSON.stringify(orders), original);
  assert.deepEqual(summarizeRevenue([...orders, order("2026-09-07T12:00:00+03:00", 50)], period("current")), { revenue: 175.5, count: 2 });
});
