// Stok / görünürlük / öne çıkarma için "şuna ayarla" uçları (tersine çevirmez), outOfStockSince alanı
// ve panele giden "productsChanged" bildirimi. Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import AdminAudit from "../models/adminAudit.model.js";
import Product from "../models/product.model.js";
import { PRODUCTS_CHANGED_MAX, applyStockState, emitProductsChanged } from "../services/productAdmin.service.js";
import {
  bulkSetProductState, bulkUpdateVisibility, setProductState, toggleFeaturedProduct, toggleHiddenProduct, toggleOutOfStock,
  updateProduct,
} from "../controllers/product.controller.js";
import productRoutes from "../routes/product.route.js";

const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin" };
const PID = (n) => `99cc${String(n).padStart(20, "0")}`;
const tick = () => new Promise((resolve) => setImmediate(resolve));

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  setHeader(key, value) { this.headers[key] = value; },
  json(body) { this.body = body; return this; },
});
const doc = (fields = {}) => ({
  _id: PID(1), name: "Pınar Süt 1 L", category: "sut", price: 40, isDiscounted: false, discountedPrice: null,
  isOutOfStock: false, isHidden: false, isFeatured: false, outOfStockSince: null, saves: 0,
  async save() { this.saves += 1; return this; },
  toObject() { const { save, toObject, ...rest } = this; return { ...rest }; },
  ...fields,
});
const fakeIo = () => {
  const events = [];
  return { events, to(room) { return { emit: (name, payload) => events.push({ room, name, payload }) }; } };
};
const request = (overrides = {}, io) => ({
  user: ADMIN, method: "PATCH", originalUrl: "/api/products/x/state", params: { id: PID(1) }, body: {}, query: {},
  app: { get: (key) => (key === "io" ? io : undefined) },
  ...overrides,
});
const captureAudit = (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (entry) => { writes.push(entry); return entry; });
  return writes;
};
const chain = (result) => {
  const resolve = async () => (typeof result === "function" ? result() : result);
  const c = { select() { return c; }, sort() { return c; }, lean: resolve, then(onOk, onErr) { return resolve().then(onOk, onErr); } };
  return c;
};
const recent = (value) => value instanceof Date && Math.abs(Date.now() - value.getTime()) < 5000;

test("applyStockState: tükendi olunca tarih yazılır, stoka alınınca silinir, tekrar 'tükendi' ilk tarihi korur", () => {
  const product = { isOutOfStock: false, outOfStockSince: null };
  const first = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  assert.equal(applyStockState(product, true, first), true);
  assert.deepEqual(product, { isOutOfStock: true, outOfStockSince: first });
  assert.equal(applyStockState(product, true, new Date()), false, "zaten tükenmiş: değişiklik yok");
  assert.equal(product.outOfStockSince, first);
  assert.equal(applyStockState(product, false), true);
  assert.deepEqual(product, { isOutOfStock: false, outOfStockSince: null });
  assert.equal(applyStockState(product, false), false);

  // Alan eklenmeden önce tükenmiş ürün: tarih bilinmiyor, uydurulmaz
  const legacy = { isOutOfStock: true };
  assert.equal(applyStockState(legacy, true), false);
  assert.equal(legacy.outOfStockSince, undefined);
  applyStockState(legacy, false);
  assert.equal(legacy.outOfStockSince, null);
});

test("PATCH /:id/state: iki cihaz aynı isteği gönderse de ürün geri dönmez (idempotent)", async (t) => {
  const writes = captureAudit(t);
  const product = doc();
  t.mock.method(Product, "findById", async () => product);
  const io = fakeIo();

  const first = response();
  await setProductState(request({ body: { isOutOfStock: true } }, io), first);
  await tick();
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.success, true);
  assert.equal(first.body.changed, true);
  assert.equal(first.body.product.isOutOfStock, true);
  assert.ok(recent(product.outOfStockSince));
  assert.equal(product.saves, 1);
  const since = product.outOfStockSince;

  // İkinci cihaz eski listeden aynı düğmeye basar: ürün tükendi kalır, hiçbir şey yazılmaz
  const second = response();
  await setProductState(request({ body: { isOutOfStock: true } }, io), second);
  await tick();
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.changed, false);
  assert.equal(second.body.product.isOutOfStock, true);
  assert.equal(product.isOutOfStock, true);
  assert.equal(product.outOfStockSince, since);
  assert.equal(product.saves, 1);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, "Tükendi olarak işaretlendi");
  assert.deepEqual(writes[0].changes, [{ label: "Stok", from: "Stokta", to: "Tükendi" }]);
  assert.equal(io.events.length, 1, "değişmeyen istek bildirim göndermez");
  assert.equal(io.events[0].room, "adminRoom");
  assert.equal(io.events[0].name, "productsChanged");
  assert.deepEqual(io.events[0].payload.ids, [PID(1)]);
  assert.equal(io.events[0].payload.changes.isOutOfStock, true);
  assert.equal(io.events[0].payload.changes.outOfStockSince, since);

  const back = response();
  await setProductState(request({ body: { isOutOfStock: false } }, io), back);
  assert.equal(back.body.changed, true);
  assert.equal(product.isOutOfStock, false);
  assert.equal(product.outOfStockSince, null);
});

test("PATCH /:id/state: birden çok alan, görünürlük ve öne çıkarma", async (t) => {
  const writes = captureAudit(t);
  const product = doc();
  t.mock.method(Product, "findById", async () => product);
  t.mock.method(Product, "find", () => chain([]));
  const res = response();
  await setProductState(request({ body: { isHidden: true, isFeatured: true } }), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.deepEqual([product.isHidden, product.isFeatured, product.isOutOfStock], [true, true, false]);
  assert.equal(writes[0].action, "Ürün durumu değiştirildi");
  assert.equal(writes[0].changes.length, 2);

  const single = response();
  await setProductState(request({ body: { isHidden: false } }), single);
  await tick();
  assert.equal(writes[1].action, "Ürün yayına alındı");
});

test("PATCH /:id/state: geçersiz gövde, kimlik ve bulunamayan ürün", async (t) => {
  captureAudit(t);
  const findById = t.mock.method(Product, "findById", async () => null);
  for (const body of [{}, { isOutOfStock: "true" }, { isHidden: 1 }, { isFeatured: null }, { price: 5 }]) {
    const res = response();
    await setProductState(request({ body }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(res.body.success, false);
  }
  const badId = response();
  await setProductState(request({ params: { id: "abc" }, body: { isHidden: true } }), badId);
  assert.equal(badId.statusCode, 400);
  assert.equal(findById.mock.callCount(), 0);

  const missing = response();
  await setProductState(request({ body: { isHidden: true } }), missing);
  assert.equal(missing.statusCode, 404);
});

test("POST /bulk-state: yalnızca istenen duruma ayarlar; zaten tükenmiş ürünün tarihi korunur", async (t) => {
  const writes = captureAudit(t);
  const before = [
    { _id: PID(1), name: "Süt", isOutOfStock: false, isHidden: false },
    { _id: PID(2), name: "Ekmek", isOutOfStock: true, isHidden: false, outOfStockSince: new Date(Date.now() - 86400000) },
  ];
  const after = [
    { _id: PID(1), name: "Süt", isOutOfStock: true, isHidden: false, outOfStockSince: new Date() },
    { _id: PID(2), name: "Ekmek", isOutOfStock: true, isHidden: false, outOfStockSince: before[1].outOfStockSince },
  ];
  let reads = 0;
  t.mock.method(Product, "find", () => chain(() => (reads++ === 0 ? before : after)));
  const updateMany = t.mock.method(Product, "updateMany", async () => ({ modifiedCount: 1 }));
  const io = fakeIo();

  const res = response();
  await bulkSetProductState(request({ method: "POST", body: { productIds: [PID(1), PID(2), PID(3)], isOutOfStock: true } }, io), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.updatedCount, 1, "yalnızca Süt değişti");
  assert.deepEqual(res.body.products, after);
  assert.deepEqual(res.body.missing, [PID(3)], "bu arada silinmiş ürün bildirilir");

  assert.equal(updateMany.mock.callCount(), 1);
  const [filter, update] = updateMany.mock.calls[0].arguments;
  assert.deepEqual(filter, { _id: { $in: [PID(1), PID(2), PID(3)] }, isOutOfStock: { $ne: true } });
  assert.equal(update.$set.isOutOfStock, true);
  assert.ok(recent(update.$set.outOfStockSince));

  assert.equal(writes[0].action, "Toplu tükendi işaretleme");
  assert.equal(writes[0].target, "1 ürün");
  assert.equal(io.events[0].name, "productsChanged");
  assert.deepEqual(io.events[0].payload.ids, [PID(1), PID(2)]);
  assert.equal(io.events[0].payload.products[0].isOutOfStock, true);
});

test("POST /bulk-state: stoka alma tarihi siler; görünürlük ayrı yazılır; değişiklik yoksa kayıt ve bildirim yok", async (t) => {
  const writes = captureAudit(t);
  const rows = [{ _id: PID(1), name: "Süt", isOutOfStock: false, isHidden: true }];
  t.mock.method(Product, "find", () => chain(rows));
  const updateMany = t.mock.method(Product, "updateMany", async () => ({ modifiedCount: 0 }));
  const io = fakeIo();

  const res = response();
  await bulkSetProductState(request({ method: "POST", body: { productIds: [PID(1)], isOutOfStock: false, isHidden: true } }, io), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.updatedCount, 0);
  assert.deepEqual(updateMany.mock.calls.map((c) => c.arguments[1].$set), [{ isHidden: true }, { isOutOfStock: false, outOfStockSince: null }]);
  assert.equal(writes.length, 0);
  assert.equal(io.events.length, 0);
});

test("POST /bulk-state: sınırlar ve geçersiz gövde", async (t) => {
  captureAudit(t);
  const find = t.mock.method(Product, "find", () => chain([]));
  t.mock.method(Product, "updateMany", async () => ({ modifiedCount: 0 }));
  const cases = [
    { productIds: [], isHidden: true },
    { productIds: "x", isHidden: true },
    { productIds: [PID(1)] },
    { productIds: [PID(1)], isHidden: "evet" },
    { productIds: [PID(1)], isFeatured: true }, // toplu uçta öne çıkarma yok
    { productIds: ["abc"], isHidden: true },
    { productIds: Array.from({ length: 501 }, (_, i) => PID(i + 1)), isHidden: true },
  ];
  for (const body of cases) {
    const res = response();
    await bulkSetProductState(request({ method: "POST", body }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 80));
  }
  assert.equal(find.mock.callCount(), 0);

  const ok = response();
  await bulkSetProductState(request({ method: "POST", body: { productIds: Array.from({ length: 500 }, (_, i) => PID(i + 1)), isHidden: true } }), ok);
  assert.equal(ok.statusCode, 200, "500 ürün kabul edilir");
});

test("eski toggle uçları çalışmaya devam eder ve outOfStockSince alanını yazar", async (t) => {
  const writes = captureAudit(t);
  const product = doc();
  t.mock.method(Product, "findById", async () => product);
  t.mock.method(Product, "find", () => chain([]));
  const io = fakeIo();

  const out = response();
  await toggleOutOfStock(request({ originalUrl: "/api/products/toggle-out-of-stock/x" }, io), out);
  assert.equal(out.body.product.isOutOfStock, true);
  assert.ok(recent(product.outOfStockSince));
  const back = response();
  await toggleOutOfStock(request({ originalUrl: "/api/products/toggle-out-of-stock/x" }, io), back);
  assert.equal(back.body.product.isOutOfStock, false);
  assert.equal(product.outOfStockSince, null);

  const hidden = response();
  await toggleHiddenProduct(request({ originalUrl: "/api/products/toggle-hidden/x" }, io), hidden);
  assert.equal(hidden.body.product.isHidden, true);
  const featured = response();
  await toggleFeaturedProduct(request({ originalUrl: "/api/products/x" }, io), featured);
  assert.equal(featured.body.isFeatured, true);
  await tick();

  assert.equal(writes.length, 4);
  assert.deepEqual(io.events.map((e) => Object.keys(e.payload.changes).sort().join(",")),
    ["isOutOfStock,outOfStockSince", "isOutOfStock,outOfStockSince", "isHidden", "isFeatured"]);

  // io yoksa (testler, betikler) uçlar yine çalışır
  const noIo = response();
  await toggleOutOfStock({ params: { id: PID(1) }, user: ADMIN, method: "PATCH", originalUrl: "/api/products/toggle-out-of-stock/x" }, noIo);
  assert.equal(noIo.statusCode, 200);
});

test("PUT ürün: isOutOfStock verilirse tarih de yazılır; eski toplu görünürlük ucu boolean ister", async (t) => {
  captureAudit(t);
  const product = doc();
  t.mock.method(Product, "findById", async () => product);
  const res = response();
  await updateProduct(request({ method: "PUT", body: { name: product.name, category: "sut", isOutOfStock: true } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(product.isOutOfStock, true);
  assert.ok(recent(product.outOfStockSince));

  const updateMany = t.mock.method(Product, "updateMany", async () => ({}));
  t.mock.method(Product, "find", () => chain([]));
  const bad = response();
  await bulkUpdateVisibility(request({ method: "POST", body: { productIds: [PID(1)], isHidden: "true" } }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(updateMany.mock.callCount(), 0);
  const ok = response();
  await bulkUpdateVisibility(request({ method: "POST", body: { productIds: [PID(1)], isHidden: true } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(updateMany.mock.callCount(), 1);
});

test("emitProductsChanged: yönetici odasına gider; çok ürün değiştiyse 'listeyi yenile' der; io yoksa sessizdir", () => {
  const io = fakeIo();
  const req = { app: { get: () => io } };
  assert.equal(emitProductsChanged(req, [PID(1), PID(1), PID(2)], { isHidden: true }), true);
  assert.deepEqual(io.events[0].payload.ids, [PID(1), PID(2)]);
  assert.deepEqual(io.events[0].payload.changes, { isHidden: true });
  assert.equal(io.events[0].payload.reload, undefined);
  assert.equal(io.events[0].payload.count, 2);

  const many = Array.from({ length: PRODUCTS_CHANGED_MAX + 1 }, (_, i) => PID(i + 1));
  emitProductsChanged(req, many, { isHidden: true }, { products: many.map((id) => ({ _id: id })) });
  assert.deepEqual(io.events[1].payload.ids, []);
  assert.equal(io.events[1].payload.reload, true);
  assert.equal(io.events[1].payload.products, undefined);

  assert.equal(emitProductsChanged({}, [PID(1)], {}), false);
  assert.equal(emitProductsChanged(undefined, [PID(1)], {}), false);
  assert.equal(emitProductsChanged({ app: { get: () => ({ to() { throw new Error("kapalı"); } }) } }, [PID(1)], {}), false);
});

test("rotalar: yeni uçlar yönetici korumalı ve dinamik /:id rotasından önce tanımlı", () => {
  const routes = productRoutes.stack.filter((layer) => layer.route).map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods),
    handlers: layer.route.stack.map((s) => s.name),
  }));
  const find = (method, path) => routes.find((r) => r.path === path && r.methods.includes(method));
  for (const [method, path, handler] of [
    ["patch", "/:id/state", "setProductState"],
    ["post", "/bulk-state", "bulkSetProductState"],
    ["get", "/sales-stats", "getProductSalesStats"],
    ["post", "/bulk-upload", "bulkUploadProducts"],
  ]) {
    const route = find(method, path);
    assert.ok(route, `${method.toUpperCase()} ${path}`);
    assert.deepEqual(route.handlers.slice(0, 2), ["protectRoute", "adminRoute"], `${path} yönetici korumalı`);
    assert.equal(route.handlers.at(-1), handler);
  }
  const getPaths = routes.filter((r) => r.methods.includes("get")).map((r) => r.path);
  assert.ok(getPaths.indexOf("/sales-stats") < getPaths.indexOf("/:id"), "/sales-stats, /:id tarafından yutulmaz");
  // Eski uçlar duruyor
  assert.ok(find("patch", "/toggle-out-of-stock/:id"));
  assert.ok(find("patch", "/toggle-hidden/:id"));
  assert.ok(find("patch", "/:id"));
  assert.ok(find("post", "/bulk-visibility"));
});
