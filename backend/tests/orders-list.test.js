import test from "node:test";
import assert from "node:assert/strict";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import { getOrderAnalyticsData } from "../controllers/ordersAnalytics.controller.js";
import { parseOrderListQuery } from "../routes/ordersAnalytics.route.js";
import { getProducts } from "../controllers/product.controller.js";
import { invalidateWeeklyPriceCache } from "../services/weeklyPrice.service.js";

const DAY = 24 * 60 * 60 * 1000;
const user = (n) => ({ _id: `507f191e810c19729de8a${String(n).padStart(3, "0")}`, name: `Müşteri ${n}`, email: `m${n}@x.com` });
const order = (n, fields = {}) => ({
  _id: `507f191e810c19729de8b${String(n).padStart(3, "0")}`,
  user: user(n % 2), products: [{ name: "Süt", quantity: 1, price: 40, product: { image: "img.png" } }],
  totalAmount: 40, status: "Teslim Edildi", city: "Devrek", phone: "05550000000", deliveryPoint: "girlsDorm",
  createdAt: new Date(Date.now() - n * DAY), updatedAt: new Date(Date.now() - n * DAY), ...fields,
});
// Order.find(...).select().populate().populate().sort().limit().lean() zinciri; filtreler kaydedilir
const mockFind = (t, resolve) => {
  const calls = [];
  t.mock.method(Order, "find", (filter) => {
    const call = { filter, limit: null };
    calls.push(call);
    const chain = {
      select: () => chain, populate: () => chain, sort: () => chain,
      limit: (n) => { call.limit = n; return chain; },
      lean: async () => resolve(filter, call),
    };
    return chain;
  });
  t.mock.method(Order, "countDocuments", async () => 500);
  return calls;
};

test("query parsing: days/since, before, limit, active, updatedSince; nothing → old behaviour", () => {
  assert.deepEqual(Object.values(parseOrderListQuery({})).filter(Boolean), []);
  const parsed = parseOrderListQuery({ days: "30", active: "1", limit: "5000", before: "2026-10-01T00:00:00Z", updatedSince: "bozuk" });
  assert.ok(Math.abs(parsed.since.getTime() - (Date.now() - 30 * DAY)) < 5000);
  assert.equal(parsed.active, true);
  assert.equal(parsed.limit, 1000);
  assert.equal(parsed.before.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(parsed.updatedSince, null);
  assert.equal(parseOrderListQuery({ since: "2026-09-01T00:00:00Z" }).since.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("without options all orders are returned in the old shape (no meta)", async (t) => {
  const calls = mockFind(t, () => [order(1), order(2), order(3)]);
  const data = await getOrderAnalyticsData();
  assert.deepEqual(calls[0].filter, {});
  assert.equal(data.totalOrders, 500);
  assert.equal(data.meta, undefined);
  assert.equal(data.usersOrders.flatMap((u) => u.orders).length, 3);
  const first = data.usersOrders[0].orders[0];
  for (const key of ["orderId", "products", "totalAmount", "status", "statusHistory", "createdAt", "deliveryPoint"]) assert.ok(key in first);
  assert.equal(first.products[0].image, "img.png");
});

test("recent window + active orders: merged without duplicates, newest first, hasMore when older exist", async (t) => {
  const recent = [order(1), order(2, { status: "Hazırlanıyor" })];
  const active = [order(2, { status: "Hazırlanıyor" }), order(60, { status: "Yolda" })];
  const calls = mockFind(t, (filter) => (filter.status ? active : recent));
  t.mock.method(Order, "exists", async () => ({ _id: "x" }));
  const since = new Date(Date.now() - 30 * DAY);
  const data = await getOrderAnalyticsData({ since, active: true });
  assert.deepEqual(calls.map((c) => Object.keys(c.filter)[0]).sort(), ["createdAt", "status"]);
  assert.deepEqual(calls.find((c) => c.filter.status).filter.status, { $in: ["Hazırlanıyor", "Yolda"] });
  const ids = data.usersOrders.flatMap((u) => u.orders).sort((a, b) => b.createdAt - a.createdAt).map((o) => o.orderId);
  assert.equal(ids.length, 3); // 2 numaralı sipariş bir kez
  assert.equal(data.meta.hasMore, true);
  assert.equal(data.meta.count, 3);
  assert.ok(data.meta.serverTime);
});

test("load older: before + limit reports hasMore from the extra row", async (t) => {
  const rows = [order(40), order(41), order(42)];
  const calls = mockFind(t, () => rows);
  const before = new Date(Date.now() - 39 * DAY);
  const data = await getOrderAnalyticsData({ before, limit: 2 });
  assert.deepEqual(calls[0].filter, { createdAt: { $lt: before } });
  assert.equal(calls[0].limit, 3);
  assert.equal(data.meta.count, 2);
  assert.equal(data.meta.hasMore, true);
  assert.equal(data.meta.oldestCreatedAt, new Date(rows[1].createdAt).toISOString()); // aynı nesne: Date.now() farkı olmaz
});

test("refresh: updatedSince only asks for orders changed after that moment", async (t) => {
  const calls = mockFind(t, () => [order(70, { status: "İptal Edildi", updatedAt: new Date() })]);
  const updatedSince = new Date(Date.now() - 60 * 1000);
  const data = await getOrderAnalyticsData({ updatedSince, since: new Date() });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filter, { updatedAt: { $gt: updatedSince } });
  assert.equal(data.usersOrders[0].orders[0].status, "İptal Edildi");
});

test("GET /products reuses the prepared response until products or weekly prices change", async (t) => {
  invalidateWeeklyPriceCache();
  let latest = new Date("2026-10-16T10:00:00Z");
  let finds = 0;
  const catalog = [{ _id: "507f191e810c19729de8c001", name: "Süt", price: 40, category: "sut", order: 1 }];
  t.mock.method(Product, "countDocuments", () => ({ collation: async () => catalog.length }));
  t.mock.method(Product, "findOne", () => {
    const c = { collation: () => c, sort: () => c, select: () => c, lean: async () => ({ updatedAt: latest }) };
    return c;
  });
  t.mock.method(Product, "find", () => {
    finds++;
    const c = { collation: () => c, sort: () => c, skip: () => c, limit: () => c, select: () => c, lean: async () => catalog };
    return c;
  });
  t.mock.method(WeeklyProduct, "find", () => ({ populate: () => ({ lean: async () => [] }) }));
  const call = async (query = {}) => {
    const res = { statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, type() { return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
    await getProducts({ query, headers: {} }, res);
    return res;
  };
  const first = await call();
  const second = await call();
  assert.equal(finds, 1);
  assert.equal(second.body, first.body);
  assert.equal(JSON.parse(first.body).products[0].name, "Süt");
  assert.equal(JSON.parse(first.body).pagination.total, 1);
  latest = new Date("2026-10-16T10:05:00Z"); // bir ürün güncellendi
  await call();
  assert.equal(finds, 2);
  invalidateWeeklyPriceCache(); // haftalık fiyat değişti
  await call();
  assert.equal(finds, 3);
  await call({ fields: "card" }); // farklı sorgu farklı anahtar
  assert.equal(finds, 4);
});
