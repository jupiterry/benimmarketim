import test from "node:test";
import assert from "node:assert/strict";
import FlashSale from "../models/flashSale.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Order from "../models/order.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import { redis } from "../lib/redis.js";
import { applySale, flashPrice, rangesOverlap, releaseSale, resetFlashSyncState, saleStatus, syncFlashSales } from "../services/flashSale.service.js";
import { BULK_FLASH_MAX, createBulkFlashSales, createFlashSale, endFlashSale, getActiveFlashSales, validateFlashSaleInput } from "../controllers/flashSale.controller.js";
import { invalidateProductCaches, onProductCachesInvalidated, syncProductCacheVersion } from "../services/productCache.service.js";
import { liveFlashInfo, resolveUnitPrice } from "../services/productPricing.js";
import { decorateProduct, invalidateWeeklyPriceCache } from "../services/weeklyPrice.service.js";
import { buildOrderProducts } from "../services/order.service.js";
import { getProductById, getProducts } from "../controllers/product.controller.js";
import { clearGuestFeedCache, getHomeFeed } from "../controllers/recommendation.controller.js";
import { aggregateStats, resetRecommendationCaches, setStatsSnapshot } from "../services/recommendation.service.js";

const P = "507f191e810c19729de89001";
const product = (fields) => ({ _id: P, saved: 0, async save() { this.saved++; }, ...fields });
const sale = (fields) => ({ product: P, isActive: true, applied: false, saves: 0, async save() { this.saves++; }, ...fields });
const NOW = new Date("2026-10-14T12:00:00Z");
const H = 3600 * 1000;

test("flash price and status helpers", () => {
  assert.equal(flashPrice(100, 15), 85);
  assert.equal(flashPrice(9.99, 33), 6.69);
  assert.equal(saleStatus({ isActive: true, startDate: new Date(+NOW + H), endDate: new Date(+NOW + 2 * H) }, NOW), "upcoming");
  assert.equal(saleStatus({ isActive: true, startDate: new Date(+NOW - H), endDate: new Date(+NOW + H) }, NOW), "active");
  assert.equal(saleStatus({ isActive: true, startDate: new Date(+NOW - 2 * H), endDate: new Date(+NOW - H) }, NOW), "ended");
  assert.equal(saleStatus({ isActive: false, startDate: new Date(+NOW - H), endDate: new Date(+NOW + H) }, NOW), "ended");
  assert.equal(rangesOverlap(0, 10, 5, 15), true);
  assert.equal(rangesOverlap(0, 10, 10, 15), false); // uç uca eklenen kampanyalar çakışmaz
});

test("input validation rejects bad percentages and dates", () => {
  assert.match(validateFlashSaleInput({ discountPercentage: 0, startDate: NOW, endDate: NOW }).error, /1-99/);
  assert.match(validateFlashSaleInput({ discountPercentage: 120, startDate: NOW, endDate: NOW }).error, /1-99/);
  assert.match(validateFlashSaleInput({ discountPercentage: 10, startDate: "x", endDate: NOW }).error, /Başlangıç/);
  assert.match(validateFlashSaleInput({ discountPercentage: 10, startDate: NOW }).error, /Bitiş/);
  const { data } = validateFlashSaleInput({ discountPercentage: "20", startDate: NOW.toISOString(), endDate: NOW.toISOString() });
  assert.equal(data.discountPercentage, 20);
  assert.ok(data.startDate instanceof Date);
  assert.deepEqual(validateFlashSaleInput({}, { requireAll: false }).data, {});
});

test("applying and releasing restores the product's own discount", async (t) => {
  const p = product({ price: 100, isDiscounted: true, discountedPrice: 90 });
  t.mock.method(Product, "findById", async () => p);
  const s = sale({ discountPercentage: 20 });
  await applySale(s);
  assert.equal(p.discountedPrice, 80);
  assert.equal(s.applied, true);
  assert.equal(s.previousIsDiscounted, true);
  assert.equal(s.previousDiscountedPrice, 90);
  await releaseSale(s);
  assert.equal(p.isDiscounted, true);
  assert.equal(p.discountedPrice, 90);
  assert.equal(s.applied, false);
});

test("release keeps a price the admin changed during the sale", async (t) => {
  const p = product({ price: 100, isDiscounted: true, discountedPrice: 70 });
  t.mock.method(Product, "findById", async () => p);
  const s = sale({ discountPercentage: 20, applied: true, appliedPrice: 80, previousIsDiscounted: false });
  await releaseSale(s);
  assert.equal(p.discountedPrice, 70);
  assert.equal(p.saved, 0);
  assert.equal(s.applied, false);
});

test("sync applies due sales, releases ended ones and cleans legacy records", async (t) => {
  const ended = sale({ discountPercentage: 10, applied: true, appliedPrice: 90, startDate: new Date(+NOW - 2 * H), endDate: new Date(+NOW - H) });
  const legacy = sale({ discountPercentage: 50, startDate: new Date(+NOW - 3 * H), endDate: new Date(+NOW - H) });
  const due = sale({ discountPercentage: 25, startDate: new Date(+NOW - 60000), endDate: new Date(+NOW + H) });
  const queries = [[ended], [legacy], [due]];
  t.mock.method(FlashSale, "find", async () => queries.shift());
  const states = [
    product({ price: 100, isDiscounted: true, discountedPrice: 90 }), // ended → geri alınır
    product({ price: 100, isDiscounted: true, discountedPrice: 50 }), // legacy → temizlenir
    product({ price: 100, isDiscounted: false, discountedPrice: null }), // due → uygulanır
  ];
  t.mock.method(Product, "findById", async () => states.shift());
  const p1 = states[0]; const p2 = states[1]; const p3 = states[2];
  const result = await syncFlashSales(NOW);
  assert.deepEqual(result, { applied: 1, released: 2 });
  assert.equal(p1.isDiscounted, false);
  assert.equal(ended.isActive, false);
  assert.equal(p2.isDiscounted, false);
  assert.equal(legacy.isActive, false);
  assert.equal(p3.discountedPrice, 75);
  assert.equal(due.applied, true);
});

// ───────────────────────── Önbellek, fiyat tutarlılığı ve iptal ─────────────────────────

const H2 = 2 * H;
const PID = "507f191e810c19729de8f001";
const SID = "507f191e810c19729de8f0aa";
const chain = (value) => {
  const c = {
    select: () => c, sort: () => c, limit: () => c, skip: () => c, populate: () => c, collation: () => c,
    lean: async () => value, then: (r, j) => Promise.resolve(value).then(r, j),
  };
  return c;
};
const response = () => {
  const res = {
    statusCode: 200, body: null, headers: {},
    status(code) { res.statusCode = code; return res; },
    json(body) { res.body = body; return res; },
    send(body) { res.body = typeof body === "string" ? JSON.parse(body) : body; return res; },
    type() { return res; }, end() { return res; },
    setHeader(k, v) { res.headers[k] = v; },
  };
  return res;
};
const countInvalidations = (t) => {
  const box = { n: 0 };
  const off = onProductCachesInvalidated(() => { box.n++; });
  t.after(off);
  return box;
};

test("apply/release write and clear the product's flash summary and invalidate product caches", async (t) => {
  const inv = countInvalidations(t);
  const p = product({ price: 100, isDiscounted: false, discountedPrice: null, saveArgs: [] });
  p.save = async function (opts) { this.saved++; this.saveArgs.push(opts); };
  t.mock.method(Product, "findById", async () => p);
  const start = new Date(Date.now() - 60000);
  const end = new Date(Date.now() + H);
  const s = sale({ _id: SID, discountPercentage: 25, startDate: start, endDate: end });
  await applySale(s);
  assert.equal(p.discountedPrice, 75);
  assert.equal(String(p.flashSale.sale), SID);
  assert.equal(p.flashSale.price, 75);
  assert.equal(p.flashSale.endDate, end);
  // Eski üründe eksik zorunlu alan kampanyayı engellemesin
  assert.deepEqual(p.saveArgs[0], { validateModifiedOnly: true });
  assert.ok(inv.n >= 1, "uygulama önbellekleri temizler");

  const before = inv.n;
  await releaseSale(s);
  assert.equal(p.isDiscounted, false);
  assert.equal(p.discountedPrice, null);
  assert.equal(p.flashSale, null);
  assert.ok(inv.n > before, "geri alma önbellekleri temizler");
});

test("release clears the flash badge even when the admin changed the price during the sale", async (t) => {
  const p = product({ price: 100, isDiscounted: true, discountedPrice: 70, flashSale: { sale: SID, price: 80, endDate: new Date(Date.now() + H) } });
  t.mock.method(Product, "findById", async () => p);
  const s = sale({ _id: SID, discountPercentage: 20, applied: true, appliedPrice: 80 });
  await releaseSale(s);
  assert.equal(p.discountedPrice, 70); // yöneticinin fiyatı korunur
  assert.equal(p.flashSale, null);
  assert.equal(p.saved, 1);
});

test("one broken sale does not stop the others from starting", async (t) => {
  const broken = sale({ _id: "a", discountPercentage: 10, startDate: new Date(+NOW - 60000), endDate: new Date(+NOW + H) });
  const ok = sale({ _id: "b", discountPercentage: 30, startDate: new Date(+NOW - 60000), endDate: new Date(+NOW + H) });
  const queries = [[], [], [broken, ok]];
  t.mock.method(FlashSale, "find", async () => queries.shift());
  const good = product({ price: 100, isDiscounted: false });
  const bad = product({ price: 50, async save() { throw new Error("Product validation failed"); } });
  const products = [bad, good];
  t.mock.method(Product, "findById", async () => products.shift());
  t.mock.method(console, "error", () => {});
  const result = await syncFlashSales(NOW);
  assert.deepEqual(result, { applied: 1, released: 0 });
  assert.equal(good.discountedPrice, 70);
  assert.equal(ok.applied, true);
});

test("price rule: the lowest of list, product/flash discount and weekly price wins everywhere", async (t) => {
  assert.deepEqual(resolveUnitPrice({ price: 100, isDiscounted: true, discountedPrice: 60 }, 70), { price: 60, source: "discount" });
  assert.deepEqual(resolveUnitPrice({ price: 100, isDiscounted: true, discountedPrice: 80 }, 70), { price: 70, source: "weekly" });
  assert.deepEqual(resolveUnitPrice({ price: 100, isDiscounted: true, discountedPrice: 120 }), { price: 100, source: "list" });
  assert.deepEqual(resolveUnitPrice({ price: 100, isDiscounted: false, discountedPrice: 50 }), { price: 100, source: "list" });

  // Haftalık fırsattaki ürüne daha derin flash sale: sipariş flash fiyatını alır
  const flashProduct = { _id: PID, name: "Süt", price: 100, isDiscounted: true, discountedPrice: 60, category: "sut" };
  t.mock.method(WeeklyProduct, "find", () => chain([{ product: PID, weeklyPrice: 70 }]));
  t.mock.method(Product, "find", () => chain([flashProduct]));
  const { orderProducts, totalAmount } = await buildOrderProducts([{ product: PID, quantity: 2 }]);
  assert.equal(orderProducts[0].price, 60);
  assert.equal(orderProducts[0].isProductDiscount, true);
  assert.equal(orderProducts[0].isWeeklyDiscount, false);
  assert.equal(totalAmount, 120);
  // Listelerde gösterilen fiyat da aynı
  const shown = decorateProduct(flashProduct, { weeklyPrice: 70, discountPercentage: 30, originalPrice: 100 });
  assert.equal(shown.actualPrice, 60);
  assert.equal(shown.isWeeklyProduct, true);
});

test("flash summary is exposed only while live and only if the flash price is the applied price", () => {
  const now = new Date();
  const info = { sale: SID, discountPercentage: 20, price: 80, startDate: new Date(+now - H), endDate: new Date(+now + H) };
  const live = { _id: PID, price: 100, isDiscounted: true, discountedPrice: 80, flashSale: info };
  const out = decorateProduct(live, undefined, now);
  assert.equal(out.actualPrice, 80);
  assert.equal(out.flashSale.discountPercentage, 20);
  assert.equal(out.flashSale._id, SID);
  assert.equal(out.flashSale.endDate, info.endDate.toISOString());
  // süresi dolmuş, fiyatı elle değişmiş ya da haftalık fiyat daha düşükse rozet yok
  assert.equal(liveFlashInfo({ ...live, flashSale: { ...info, endDate: new Date(+now - 1000) } }, now), null);
  assert.equal(decorateProduct({ ...live, discountedPrice: 70 }, undefined, now).flashSale, undefined);
  assert.equal(decorateProduct(live, { weeklyPrice: 50 }, now).flashSale, undefined);
  assert.equal(decorateProduct(live, { weeklyPrice: 50 }, now).actualPrice, 50);
  // ham alan hiçbir zaman dışarı sızmaz
  assert.equal("flashSale" in decorateProduct({ _id: PID, price: 10, flashSale: null }), false);
  assert.equal(decorateProduct({ _id: PID, price: 10 }).actualPrice, 10);
});

test("product endpoints show the same price the order will charge while a sale is live", async (t) => {
  invalidateWeeklyPriceCache();
  resetFlashSyncState();
  const now = new Date();
  const doc = {
    _id: PID, name: "Süt", price: 100, isDiscounted: true, discountedPrice: 75, category: "sut", isHidden: false,
    order: 1, createdAt: now, updatedAt: now,
    flashSale: { sale: SID, discountPercentage: 25, price: 75, startDate: new Date(+now - H), endDate: new Date(+now + H) },
  };
  t.mock.method(WeeklyProduct, "find", () => chain([{ product: { _id: PID, price: 100 }, weeklyPrice: 90, isActive: true }]));
  t.mock.method(Product, "find", () => chain([doc]));
  t.mock.method(Product, "findOne", () => chain(doc));
  t.mock.method(Product, "countDocuments", () => chain(1));
  const activeSale = { _id: SID, product: doc, discountPercentage: 25, isActive: true, applied: true, startDate: doc.flashSale.startDate, endDate: doc.flashSale.endDate };
  t.mock.method(FlashSale, "find", (filter) => chain(filter?.applied === true && filter?.startDate ? [activeSale] : []));

  const { orderProducts } = await buildOrderProducts([{ product: PID, quantity: 1 }]);
  const charged = orderProducts[0].price;
  assert.equal(charged, 75);

  const byId = response();
  await getProductById({ params: { id: PID } }, byId);
  assert.equal(byId.body.actualPrice, charged);
  assert.equal(byId.body.flashSale.discountPercentage, 25);

  const list = response();
  await getProducts({ query: { fields: "card" }, headers: {} }, list);
  assert.equal(list.body.products[0].actualPrice, charged);
  assert.equal(list.body.products[0].flashSale.price, charged);
  assert.equal(list.headers["Cache-Control"], "private, no-cache");

  const active = response();
  await getActiveFlashSales({}, active);
  assert.equal(active.body.flashSales.length, 1);
  assert.equal(active.body.flashSales[0].product.actualPrice, charged);
  assert.ok(active.body.serverTime);
});

test("product list and guest home-feed caches are dropped as soon as a sale is applied or released", async (t) => {
  invalidateWeeklyPriceCache();
  resetRecommendationCaches();
  clearGuestFeedCache();
  setStatsSnapshot({ ...aggregateStats([]), generatedAt: new Date().toISOString() });
  const updatedAt = new Date("2026-10-20T10:00:00Z"); // aynı updatedAt: anahtar değişmese de önbellek atılmalı
  const doc = { _id: PID, name: "Süt", price: 100, isDiscounted: false, discountedPrice: null, category: "sut", order: 1, isHidden: false, isOutOfStock: false, createdAt: updatedAt, updatedAt };
  let finds = 0;
  t.mock.method(Product, "find", () => { finds++; return chain([doc]); });
  t.mock.method(Product, "findOne", () => chain({ updatedAt }));
  t.mock.method(Product, "countDocuments", () => chain(1));
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(FlashSale, "find", () => chain([]));
  t.mock.method(Order, "find", () => chain([]));

  const list = async () => { const res = response(); await getProducts({ query: {}, headers: {} }, res); return res.body; };
  const feed = async () => { const res = response(); await getHomeFeed({ query: { fields: "card" }, headers: {}, cookies: {} }, res); return res.body; };

  await list();
  await list();
  assert.equal(finds, 1, "ikinci liste isteği hazır yanıttan döner");
  await feed();
  const afterFeed = finds;
  await feed();
  assert.equal(finds, afterFeed, "misafir rafları önbellekten döner");

  // Kampanya başlar (zamanlayıcı ya da yönetici): ürün flash fiyatına geçer
  t.mock.method(Product, "findById", async () => Object.assign(doc, { async save() {} }));
  const s = sale({ _id: SID, discountPercentage: 20, startDate: new Date(Date.now() - 1000), endDate: new Date(Date.now() + H) });
  await applySale(s);
  const before = finds;
  const fresh = await list();
  assert.equal(finds, before + 1, "liste yeniden hazırlanır");
  assert.equal(fresh.products[0].actualPrice, 80);
  const freshFeed = await feed();
  const all = Object.values(freshFeed.shelves).flatMap((shelf) => shelf.products);
  assert.ok(all.some((p) => p._id === PID && p.actualPrice === 80), "raflar yeni fiyatı gösterir");

  // Kampanya iptal edilir: eski fiyata döner, önbellekler yine atılır
  await releaseSale(s);
  const restored = await list();
  assert.equal(restored.products[0].actualPrice, 100);
  assert.equal(restored.products[0].flashSale, undefined);
});

test("another server process's invalidation is picked up through the shared version key", async (t) => {
  const inv = countInvalidations(t);
  await invalidateProductCaches();
  await syncProductCacheVersion({ force: true }); // kendi yazdığı sürüm: temizleme yok
  const seen = inv.n;
  await redis.set("products:cache-version", `${Date.now()}-99999-other`);
  assert.equal(await syncProductCacheVersion({ force: true }), true);
  assert.equal(inv.n, seen + 1);
  assert.equal(await syncProductCacheVersion({ force: true }), false);
});

test("ending a live sale restores the price immediately and keeps the record as cancelled", async (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  const inv = countInvalidations(t);
  const now = Date.now();
  const p = product({ name: "Süt", price: 100, isDiscounted: true, discountedPrice: 80, flashSale: { sale: SID, price: 80, endDate: new Date(now + H) } });
  t.mock.method(Product, "findById", async () => p);
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  invalidateWeeklyPriceCache();
  const s = sale({
    _id: SID, discountPercentage: 20, applied: true, appliedPrice: 80, previousIsDiscounted: true, previousDiscountedPrice: 90,
    startDate: new Date(now - H), endDate: new Date(now + H),
    async populate() { this.product = p; return this; },
  });
  t.mock.method(FlashSale, "findById", async () => s);
  const res = response();
  await endFlashSale({ params: { id: SID }, user: { _id: "507f191e810c19729de860ea", name: "Emirhan" }, method: "POST", originalUrl: `/api/flash-sales/${SID}/end` }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(p.discountedPrice, 90); // kampanyadan önceki indirim geri geldi
  assert.equal(p.flashSale, null);
  assert.equal(s.isActive, false);
  assert.equal(s.applied, false);
  assert.ok(s.cancelledAt instanceof Date);
  assert.equal(s.cancelledBy, "Emirhan");
  assert.ok(s.endDate <= new Date());
  assert.equal(res.body.flashSale.cancelled, true);
  assert.equal(res.body.flashSale.status, "ended");
  assert.equal(res.body.flashSale.product.actualPrice, 90);
  assert.ok(inv.n >= 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, "Flash sale erkenden bitirildi");
  assert.equal(writes[0].category, "campaign");

  // Zaten bitmiş kampanya tekrar bitirilemez
  const again = response();
  await endFlashSale({ params: { id: SID }, user: { _id: "507f191e810c19729de860ea" } }, again);
  assert.equal(again.statusCode, 400);
});

test("cancelling an upcoming sale keeps its planned dates and does not touch the price", async (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  const p = product({ name: "Süt", price: 100, isDiscounted: false });
  t.mock.method(Product, "findById", async () => p);
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  const start = new Date(Date.now() + H);
  const end = new Date(Date.now() + H2);
  const s = sale({ _id: SID, discountPercentage: 20, startDate: start, endDate: end, async populate() { this.product = p; return this; } });
  t.mock.method(FlashSale, "findById", async () => s);
  const res = response();
  await endFlashSale({ params: { id: SID }, user: { _id: "507f191e810c19729de860ea", name: "Emirhan" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(s.isActive, false);
  assert.equal(s.startDate, start);
  assert.equal(s.endDate, end);
  assert.equal(p.saved, 0);
  assert.equal(writes[0].action, "Planlı flash sale iptal edildi");
});

test("'start now' uses the server clock, so a wrong admin PC clock cannot delay the sale", async (t) => {
  t.mock.method(AdminAudit, "create", async (doc) => doc);
  const p = product({ name: "Süt", price: 100, isDiscounted: false });
  t.mock.method(Product, "findById", async () => p);
  t.mock.method(FlashSale, "find", async () => []); // çakışma yok
  t.mock.method(FlashSale.prototype, "save", async function () { return this; });
  t.mock.method(FlashSale.prototype, "populate", async function () { return this; });
  const skewed = new Date(Date.now() + 3 * H); // bilgisayar saati/saat dilimi 3 saat ileri
  const res = response();
  await createFlashSale({
    body: { productId: PID, discountPercentage: 20, startNow: true, startDate: skewed.toISOString(), endDate: new Date(+skewed + H).toISOString(), durationHours: 1 },
    user: { _id: "507f191e810c19729de860ea" },
  }, res);
  assert.equal(res.statusCode, 201);
  const created = res.body.flashSale;
  assert.equal(created.status, "active");
  assert.ok(Math.abs(new Date(created.startDate) - Date.now()) < 5000);
  assert.ok(Math.abs(new Date(created.endDate) - Date.now() - H) < 5000);
  assert.equal(p.discountedPrice, 80); // hemen uygulandı
});

// ── Toplu flash sale ────────────────────────────────────────────────

test("toplu flash sale: ortak oran ve tarihle oluşturur, çakışanı atlar, tek işlem kaydı yazar", async (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  const A = "507f191e810c19729de8a001";
  const B = "507f191e810c19729de8a002";
  const C = "507f191e810c19729de8a003";
  const items = {
    [A]: product({ _id: A, name: "Pepsi 1 L", price: 75, isDiscounted: false }),
    [B]: product({ _id: B, name: "Pepsi 330 ml", price: 60, isDiscounted: false }),
  };
  t.mock.method(Product, "find", async () => Object.values(items));
  t.mock.method(Product, "findById", async (id) => items[String(id)] || null);
  const existing = sale({ _id: SID, product: B, discountPercentage: 10, startDate: new Date(Date.now() - H), endDate: new Date(Date.now() + 9 * H), applied: true, appliedPrice: 54 });
  t.mock.method(FlashSale, "find", async (query) => (String(query.product) === B && existing.isActive ? [existing] : []));
  t.mock.method(FlashSale.prototype, "save", async function () { return this; });
  const res = response();
  await createBulkFlashSales({
    body: { productIds: [A, B, C, A], discountPercentage: 20, startNow: true, durationHours: 24, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 24 * H).toISOString(), name: "Pepsi haftası" },
    user: { _id: "507f191e810c19729de860ea", name: "Emirhan" },
  }, res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.created.map((c) => c.productId), [A], "tekrarlanan kimlik bir kez işlenir");
  assert.equal(items[A].discountedPrice, 60, "hemen uygulandı: 75 × %80");
  assert.deepEqual(res.body.skipped.map((s) => [s.productId, s.reason]), [
    [B, "Aynı tarihlerde başka flaş indirimi var"],
    [C, "Ürün bulunamadı"],
  ]);
  assert.equal(res.body.skipped[0].existingSale.discountPercentage, 10);
  assert.equal(existing.isActive, true, "atlanan ürünün kampanyasına dokunulmaz");
  assert.equal(res.body.replaced, 0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, "Toplu flash sale oluşturuldu");
  assert.equal(writes[0].targetName, "Pepsi haftası");

  // Değiştir: çakışan kampanya iptal edilir, yenisi uygulanır
  items[B].isDiscounted = true;
  items[B].discountedPrice = 54;
  items[B].flashSale = { sale: SID, price: 54, endDate: existing.endDate };
  const replace = response();
  await createBulkFlashSales({
    body: { productIds: [B], discountPercentage: 25, startNow: true, durationHours: 24, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 24 * H).toISOString(), replaceExisting: true },
    user: { _id: "507f191e810c19729de860ea", name: "Emirhan" },
  }, replace);
  assert.equal(replace.statusCode, 201, JSON.stringify(replace.body));
  assert.equal(replace.body.replaced, 1);
  assert.equal(existing.isActive, false);
  assert.ok(existing.cancelledAt instanceof Date);
  assert.equal(existing.cancelledBy, "Emirhan");
  assert.equal(items[B].discountedPrice, 45, "yeni oran: 60 × %75");
});

test("toplu flash sale: girdi denetimi", async () => {
  const call = async (body) => { const res = response(); await createBulkFlashSales({ body, user: { _id: "507f191e810c19729de860ea" } }, res); return res; };
  const window = { discountPercentage: 20, startNow: true, durationHours: 24, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 24 * H).toISOString() };
  assert.equal((await call({ ...window, productIds: [] })).statusCode, 400);
  assert.equal((await call({ ...window, productIds: ["x"] })).statusCode, 400);
  const tooMany = Array.from({ length: BULK_FLASH_MAX + 1 }, (_, i) => `507f191e810c19729de8${String(i).padStart(4, "0")}`);
  assert.match((await call({ ...window, productIds: tooMany })).body.message, /en fazla/);
  assert.match((await call({ ...window, productIds: [PID], discountPercentage: 0 })).body.message, /1-99/);
  assert.match((await call({ productIds: [PID], discountPercentage: 20, startDate: new Date(Date.now() - 3 * H).toISOString(), endDate: new Date(Date.now() - H).toISOString() })).body.message, /geçmiş/);
});
