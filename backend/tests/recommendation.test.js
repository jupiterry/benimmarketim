import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import FlashSale from "../models/flashSale.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import User from "../models/user.model.js";
import {
  aggregateStats, buildShelves, buildUserProfile, diversify, emptyStats, hourBucket, resetRecommendationCaches,
  scoreProduct, setStatsSnapshot, trDay,
} from "../services/recommendation.service.js";
import { invalidateWeeklyPriceCache } from "../services/weeklyPrice.service.js";
import { clearGuestFeedCache, getHomeFeed, getPersonalizedProducts } from "../controllers/recommendation.controller.js";
import { optionalAuth } from "../middleware/auth.middleware.js";
import { normalizeOrderSource } from "../services/order.service.js";

process.env.ACCESS_TOKEN_SECRET ||= "test-secret";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-16T13:00:00Z"); // 16:00 Türkiye → afternoon
const oid = (n) => `507f191e810c19729de8${String(n).padStart(4, "0")}`;
const product = (n, fields = {}) => ({
  _id: oid(n), name: `Ürün ${n}`, price: 100, isDiscounted: false, discountedPrice: null, image: "", thumbnail: "",
  category: "gida", isOutOfStock: false, isFeatured: false, isHidden: false, order: n, description: `Açıklama ${n}`,
  createdAt: new Date(NOW.getTime() - 60 * DAY), updatedAt: NOW, ...fields,
});
const ctx = (fields = {}) => ({ stats: emptyStats(), hourBucket: "afternoon", deliveryPoint: null, user: null, now: NOW, liveFlashIds: new Set(), ...fields });
const chain = (value) => {
  const c = { select: () => c, sort: () => c, limit: () => c, populate: () => c, lean: async () => value, then: (r, j) => Promise.resolve(value).then(r, j) };
  return c;
};
const response = () => {
  const res = { statusCode: 200, body: null, headers: {}, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; }, setHeader(k, v) { res.headers[k] = v; } };
  return res;
};

test("hour buckets follow Turkey time", () => {
  assert.equal(hourBucket(new Date("2026-10-16T04:00:00Z")), "morning"); // 07:00
  assert.equal(hourBucket(new Date("2026-10-16T13:00:00Z")), "afternoon"); // 16:00
  assert.equal(hourBucket(new Date("2026-10-16T17:30:00Z")), "evening"); // 20:30
  assert.equal(hourBucket(new Date("2026-10-16T20:30:00Z")), "night"); // 23:30
  assert.equal(hourBucket(new Date("2026-10-16T01:00:00Z")), "night"); // 04:00
  assert.equal(trDay(new Date("2026-10-16T22:00:00Z")), "2026-10-17");
});

test("stats count units, delivery points, hours and normalized co-purchases; cancelled orders are ignored", () => {
  const A = oid(1); const B = oid(2); const C = oid(3);
  const orders = [
    { createdAt: new Date(NOW - 1 * DAY), deliveryPoint: "girlsDorm", products: [{ product: A, quantity: 2 }, { product: B, quantity: 1 }] },
    { createdAt: new Date(NOW - 10 * DAY), deliveryPoint: "boysDorm", products: [{ product: A, quantity: 1 }, { product: B, quantity: 1 }, { product: C, quantity: 1 }] },
    { createdAt: new Date(NOW - 2 * DAY), deliveryPoint: "boysDorm", status: "İptal Edildi", products: [{ product: C, quantity: 9 }] },
  ];
  const stats = aggregateStats(orders, { now: NOW, categoryOf: new Map([[A, "sut"], [B, "gida"], [C, "gida"]]) });
  assert.equal(stats.orderCount, 2);
  assert.deepEqual([stats.products[A].units30, stats.products[A].units7, stats.products[A].orders30], [3, 2, 2]);
  assert.deepEqual(stats.products[A].byDeliveryPoint, { girlsDorm: 2, boysDorm: 1 });
  assert.equal(stats.products[C].units30, 1);
  // A ile B iki siparişte birlikte: 2 / sqrt(2 × 2) = 1; A ile C bir kez: 1 / sqrt(2 × 1)
  assert.equal(stats.coPurchase[A][0].id, B);
  assert.equal(stats.coPurchase[A][0].score, 1);
  assert.equal(stats.coPurchase[A][1].score, Math.round((1 / Math.sqrt(2)) * 1000) / 1000);
});

test("scoreProduct excludes hidden, out-of-stock and live flash sale products", () => {
  assert.equal(scoreProduct(product(1, { isHidden: true }), ctx()), -Infinity);
  assert.equal(scoreProduct(product(2, { isOutOfStock: true }), ctx()), -Infinity);
  assert.equal(scoreProduct(product(3), ctx({ liveFlashIds: new Set([oid(3)]) })), -Infinity);
  assert.ok(Number.isFinite(scoreProduct(product(4), ctx())));
});

test("repurchase timing: due items rank high, too-soon items low, items bought today are excluded", () => {
  const due = oid(10); const soon = oid(11); const today = oid(12);
  // due: her ~10 günde bir, son alım 10 gün önce; soon: her ~10 günde bir, son alım 2 gün önce
  const orders = [
    { createdAt: new Date(NOW - 2 * 60 * 60 * 1000), products: [{ product: today, quantity: 1 }] },
    { createdAt: new Date(NOW - 2 * DAY), products: [{ product: soon, quantity: 1 }] },
    { createdAt: new Date(NOW - 10 * DAY), products: [{ product: due, quantity: 1 }] },
    { createdAt: new Date(NOW - 12 * DAY), products: [{ product: soon, quantity: 1 }] },
    { createdAt: new Date(NOW - 20 * DAY), products: [{ product: due, quantity: 1 }, { product: today, quantity: 1 }] },
  ];
  const user = buildUserProfile(orders, { now: NOW, categoryOf: new Map() });
  assert.equal(user.avgIntervalDays.get(due), 10);
  assert.ok(user.boughtToday.has(today));
  const c = ctx({ user });
  const dueScore = scoreProduct(product(10), c);
  const soonScore = scoreProduct(product(11), c);
  assert.ok(dueScore > soonScore + 10, `due ${dueScore} > soon ${soonScore}`);
  assert.equal(scoreProduct(product(12), c), -Infinity);
});

test("diversify keeps at most 4 per category and fills the rest from the overflow", () => {
  const ranked = [1, 2, 3, 4, 5, 6].map((n) => product(n, { category: "gida" })).concat([product(7, { category: "sut" })]);
  const picked = diversify(ranked, { limit: 6 });
  assert.deepEqual(picked.map((p) => p.order), [1, 2, 3, 4, 7, 5]);
  assert.equal(diversify(ranked, { limit: 5 }).filter((p) => p.category === "gida").length, 4);
});

test("shelves: deals exclude live flash sales, forYou never repeats deals, popular follows sales", () => {
  const catalog = [
    product(1, { isDiscounted: true, discountedPrice: 50 }),
    product(2, { isDiscounted: true, discountedPrice: 90, category: "sut" }),
    product(3, { isDiscounted: true, discountedPrice: 40, category: "cips" }), // flash
    ...[4, 5, 6, 7, 8, 9].map((n) => product(n, { category: n % 2 ? "sut" : "gida" })),
    product(20, { isHidden: true }),
  ];
  const stats = aggregateStats([{ createdAt: new Date(NOW - DAY), deliveryPoint: "boysDorm", products: [{ product: oid(7), quantity: 5 }] }], { now: NOW });
  const shelves = buildShelves({ catalog, stats, now: NOW, limit: 4, liveFlashIds: new Set([oid(3)]) });
  assert.equal(shelves.strategy, "popular");
  assert.deepEqual(shelves.deals.map((p) => p.order), [1, 2]);
  const dealIds = new Set(shelves.deals.map((p) => p._id));
  assert.ok(shelves.forYou.every((p) => !dealIds.has(p._id) && p._id !== oid(3) && !p.isHidden));
  assert.equal(shelves.popular[0]._id, oid(7));
});

test("order lines accept only known sources", () => {
  assert.equal(normalizeOrderSource("home_deals"), "home_deals");
  assert.equal(normalizeOrderSource(" Home_ForYou "), "home_foryou");
  assert.equal(normalizeOrderSource("hack"), null);
  assert.equal(normalizeOrderSource(undefined), null);
});

// ── Uç nokta testleri ──
const mockData = (t, { orders = [] } = {}) => {
  resetRecommendationCaches();
  clearGuestFeedCache();
  invalidateWeeklyPriceCache();
  setStatsSnapshot({ ...aggregateStats([{ createdAt: new Date(Date.now() - DAY), deliveryPoint: "girlsDorm", products: [{ product: oid(5), quantity: 3 }] }]), generatedAt: new Date().toISOString() });
  const catalog = [
    product(1, { isDiscounted: true, discountedPrice: 60 }),
    product(2, { isDiscounted: true, discountedPrice: 80, category: "sut" }),
    ...[3, 4, 5, 6, 7, 8].map((n) => product(n, { category: ["gida", "sut", "cips"][n % 3] })),
  ];
  t.mock.method(Product, "find", () => chain(catalog));
  t.mock.method(FlashSale, "find", () => chain([]));
  t.mock.method(Order, "find", () => chain(orders));
  t.mock.method(WeeklyProduct, "find", () => chain([{ product: { _id: oid(4), price: 100 }, weeklyPrice: 70, discountPercentage: 30, isActive: true }]));
};
const feed = async (req) => {
  const res = response();
  await new Promise((resolve) => optionalAuth(req, res, resolve));
  await getHomeFeed(req, res);
  return res;
};

test("home-feed for guests: popular strategy, exact shape, weekly prices and card fields", async (t) => {
  mockData(t);
  const res = await feed({ query: { limit: "4", fields: "card" }, headers: {}, cookies: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "private, max-age=60");
  const body = res.body;
  assert.equal(body.success, true);
  assert.equal(body.strategy, "popular");
  assert.ok(!Number.isNaN(Date.parse(body.generatedAt)));
  assert.deepEqual(Object.keys(body.shelves), ["deals", "forYou", "popular"]);
  assert.equal(body.shelves.forYou.strategy, "popular");
  const all = [...body.shelves.deals.products, ...body.shelves.forYou.products, ...body.shelves.popular.products];
  assert.ok(all.length > 0);
  assert.ok(all.every((p) => p.description === undefined));
  for (const key of ["_id", "name", "price", "isDiscounted", "category", "isOutOfStock", "isFeatured", "isHidden", "order", "createdAt", "updatedAt"]) {
    assert.ok(key in all[0], `${key} alanı var`);
  }
  const dealIds = new Set(body.shelves.deals.products.map((p) => p._id));
  assert.ok(body.shelves.forYou.products.every((p) => !dealIds.has(p._id)));
  assert.equal(body.shelves.popular.products[0]._id, oid(5));
  const weekly = all.find((p) => p._id === oid(4));
  if (weekly) assert.equal(weekly.actualPrice, 70);
});

test("home-feed with an invalid token returns 200 as a guest, never 401", async (t) => {
  mockData(t);
  const res = await feed({ query: {}, headers: { authorization: "Bearer bozuk.token" }, cookies: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.strategy, "popular");
  assert.ok(res.body.shelves.forYou.products.some((p) => typeof p.description === "string")); // fields verilmedi
});

test("home-feed for a user with order history is personal", async (t) => {
  mockData(t, { orders: [{ createdAt: new Date(Date.now() - 5 * DAY), products: [{ product: oid(6), quantity: 2 }] }] });
  const userId = "507f191e810c19729de860ea";
  t.mock.method(User, "findById", () => ({ select: async () => ({ _id: userId, role: "customer" }) }));
  const token = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET);
  const res = await feed({ query: { deliveryPoint: "girlsDorm" }, headers: { authorization: `Bearer ${token}` }, cookies: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.strategy, "personal");
  assert.equal(res.body.shelves.forYou.strategy, "personal");
});

test("personalized keeps its old response shape", async (t) => {
  mockData(t);
  const res = response();
  await getPersonalizedProducts({ query: { limit: "6" }, user: { _id: "507f191e810c19729de860ea" } }, res);
  assert.equal(res.body.success, true);
  assert.equal(res.body.strategy, "popular_fallback");
  assert.ok(Array.isArray(res.body.products) && res.body.products.length <= 6);
});
