// Fiyat güvenliği: fiyat yazan her uç 0 ₺ ve altını reddeder; toplu indirimde tek ürün bile 0'a inerse
// hiçbir fiyat değişmez; "Geri al" eski fiyatı ve kalkan indirimi tek istekte geri yazar.
// Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import AdminAudit from "../models/adminAudit.model.js";
import Product from "../models/product.model.js";
import FlashSale from "../models/flashSale.model.js";
import {
  PRICE_INVALID_MESSAGE, PRICE_NOT_POSITIVE_MESSAGE, PRICE_REQUIRED_MESSAGE, parseMoneyInput, readDiscountedPrice, readPrice,
} from "../services/productAdmin.service.js";
import {
  bulkUpdatePrice, createProduct, updateProduct, updateProductDiscount, updateProductPrice,
} from "../controllers/product.controller.js";
import {
  parsePrice, priceChangeOf, priceChangeQuestion, willRemoveDiscount,
} from "../../frontend/src/components/products/productUtils.js";

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
  isOutOfStock: false, isHidden: false, isFeatured: false, flashSale: null, saves: 0,
  async save() { this.saves += 1; return this; },
  toObject() { const { save, toObject, ...rest } = this; return { ...rest }; },
  ...fields,
});
const request = (overrides = {}) => ({ user: ADMIN, method: "PUT", originalUrl: "/api/products/x", params: {}, body: {}, query: {}, ...overrides });
const quietAudit = (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (entry) => { writes.push(entry); return entry; });
  return writes;
};

test("parseMoneyInput: Türkçe ve İngilizce ondalık, binlik ayırıcı, para simgesi", () => {
  assert.equal(parseMoneyInput(12.5), 12.5);
  assert.equal(parseMoneyInput("12,50"), 12.5);
  assert.equal(parseMoneyInput("12.50"), 12.5);
  assert.equal(parseMoneyInput(" 1.250,50 "), 1250.5);
  assert.equal(parseMoneyInput("1,250.50"), 1250.5);
  assert.equal(parseMoneyInput("₺ 12,50"), 12.5);
  assert.equal(parseMoneyInput("12,50 TL"), 12.5);
  for (const bad of ["", "abc", "12,5,0", "1.2.3", "12a", null, undefined, {}, [], true, NaN, Infinity]) {
    assert.ok(Number.isNaN(parseMoneyInput(bad)), `geçersiz: ${String(bad)}`);
  }
});

test("readPrice: boş, geçersiz, 0 ve negatif fiyat reddedilir; geçerli fiyat kuruşa yuvarlanır", () => {
  assert.deepEqual(readPrice(""), { error: PRICE_REQUIRED_MESSAGE });
  assert.deepEqual(readPrice(null), { error: PRICE_REQUIRED_MESSAGE });
  assert.deepEqual(readPrice(undefined), { error: PRICE_REQUIRED_MESSAGE });
  assert.deepEqual(readPrice("abc"), { error: PRICE_INVALID_MESSAGE });
  assert.deepEqual(readPrice(0), { error: PRICE_NOT_POSITIVE_MESSAGE });
  assert.deepEqual(readPrice("0"), { error: PRICE_NOT_POSITIVE_MESSAGE });
  assert.deepEqual(readPrice(-5), { error: PRICE_NOT_POSITIVE_MESSAGE });
  assert.deepEqual(readPrice(0.004), { error: PRICE_NOT_POSITIVE_MESSAGE }, "kuruşa yuvarlanınca 0");
  assert.deepEqual(readPrice(0.01), { price: 0.01 });
  assert.deepEqual(readPrice("27,50"), { price: 27.5 });
  assert.deepEqual(readPrice(38.699999), { price: 38.7 });
});

test("readDiscountedPrice: 0'dan büyük ve liste fiyatından küçük olmalı", () => {
  assert.deepEqual(readDiscountedPrice(30, 40), { discountedPrice: 30 });
  assert.deepEqual(readDiscountedPrice("29,90", 40), { discountedPrice: 29.9 });
  assert.match(readDiscountedPrice(40, 40).error, /düşük olmalı/);
  assert.match(readDiscountedPrice(45, 40).error, /düşük olmalı/);
  assert.match(readDiscountedPrice(0, 40).error, /0 ₺/);
  assert.match(readDiscountedPrice(-1, 40).error, /0 ₺/);
  assert.match(readDiscountedPrice(undefined, 40).error, /Geçerli/);
});

test("update-price: 0, boş ve negatif fiyat 400 döner, ürün okunmaz bile", async (t) => {
  quietAudit(t);
  const findById = t.mock.method(Product, "findById", async () => doc());
  for (const price of [0, "0", "", null, undefined, -3, "abc", "0,00"]) {
    const res = response();
    await updateProductPrice(request({ params: { id: PID(1) }, body: { price } }), res);
    assert.equal(res.statusCode, 400, `fiyat ${JSON.stringify(price)} reddedilmeli`);
    assert.ok(res.body.message.length > 5);
  }
  assert.equal(findById.mock.callCount(), 0);
});

test("update-price: Türkçe ondalık kabul edilir; önceki fiyat ve kalkan indirim yanıtta döner", async (t) => {
  const writes = quietAudit(t);
  const product = doc({ isDiscounted: true, discountedPrice: 38 });
  t.mock.method(Product, "findById", async () => product);
  const res = response();
  await updateProductPrice(request({ params: { id: PID(1) }, body: { price: "35,5" } }), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(product.price, 35.5);
  assert.equal(product.isDiscounted, false);
  assert.equal(product.discountedPrice, null);
  assert.equal(res.body.discountRemoved, true);
  assert.deepEqual(res.body.previous, { price: 40, isDiscounted: true, discountedPrice: 38 });
  assert.match(writes[0].changes[1].to, /Kaldırıldı/);
});

test("update-price geri al: eski fiyat ve kalkan indirim tek istekte geri yazılır", async (t) => {
  quietAudit(t);
  const product = doc({ price: 35.5, isDiscounted: false, discountedPrice: null });
  t.mock.method(Product, "findById", async () => product);
  const res = response();
  await updateProductPrice(request({ params: { id: PID(1) }, body: { price: 40, restoreDiscountedPrice: 38 } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(product.price, 40);
  assert.equal(product.isDiscounted, true);
  assert.equal(product.discountedPrice, 38);
  assert.equal(res.body.discountRemoved, false);

  // Geri yüklenecek indirim yeni fiyatın altında değilse istek reddedilir
  const bad = response();
  await updateProductPrice(request({ params: { id: PID(1) }, body: { price: 30, restoreDiscountedPrice: 38 } }), bad);
  assert.equal(bad.statusCode, 400);

  // Ürün bu arada başka bir indirime girdiyse (ör. flaş indirim) üzerine yazılmaz
  const flashed = doc({ price: 35.5, isDiscounted: true, discountedPrice: 20 });
  t.mock.method(Product, "findById", async () => flashed);
  const kept = response();
  await updateProductPrice(request({ params: { id: PID(1) }, body: { price: 40, restoreDiscountedPrice: 38 } }), kept);
  assert.equal(kept.statusCode, 200);
  assert.equal(flashed.discountedPrice, 20);
});

test("ürün ekleme: 0 ₺ ve geçersiz fiyat reddedilir, ürün oluşturulmaz", async (t) => {
  quietAudit(t);
  const create = t.mock.method(Product, "create", async (data) => ({ _id: PID(9), ...data }));
  for (const price of [0, "0", -1, "abc"]) {
    const res = response();
    await createProduct(request({ method: "POST", body: { name: "Yeni", category: "sut", price } }), res);
    assert.equal(res.statusCode, 400, `fiyat ${JSON.stringify(price)}`);
  }
  assert.equal(create.mock.callCount(), 0);

  const ok = response();
  await createProduct(request({ method: "POST", body: { name: "Yeni", category: "sut", price: "12,50" } }), ok);
  assert.equal(ok.statusCode, 201);
  assert.equal(create.mock.calls[0].arguments[0].price, 12.5);
});

test("PUT ürün: 0 ₺ fiyat ve geçersiz indirimli fiyat reddedilir; fiyat düşünce geçersiz indirim kalkar", async (t) => {
  quietAudit(t);
  const product = doc({ isDiscounted: true, discountedPrice: 30 });
  t.mock.method(Product, "findById", async () => product);

  for (const body of [{ price: 0 }, { price: -4 }, { price: "" }, { discountedPrice: 0 }, { discountedPrice: 45 }]) {
    const res = response();
    await updateProduct(request({ params: { id: PID(1) }, body: { name: "Pınar Süt 1 L", category: "sut", ...body } }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(product.saves, 0);

  const res = response();
  await updateProduct(request({ params: { id: PID(1) }, body: { name: "Pınar Süt 1 L", category: "sut", price: 25 } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(product.price, 25);
  assert.equal(product.isDiscounted, false, "30 ₺ indirim 25 ₺ fiyatın altında değil");
  assert.equal(product.discountedPrice, null);
});

test("indirim ucu: 0, negatif, eksik ve fiyattan yüksek indirimli fiyat reddedilir", async (t) => {
  quietAudit(t);
  const product = doc();
  t.mock.method(Product, "findById", async () => product);
  for (const discountedPrice of [0, -5, undefined, "abc", 40, 55]) {
    const res = response();
    await updateProductDiscount(request({ params: { id: PID(1) }, body: { discountedPrice } }), res);
    assert.equal(res.statusCode, 400, `indirimli fiyat ${JSON.stringify(discountedPrice)}`);
  }
  assert.equal(product.saves, 0);
  assert.equal(product.isDiscounted, false);
});

test("toplu fiyat: sabit 0 ₺ / negatif ve 0 değişiklik reddedilir", async (t) => {
  quietAudit(t);
  const find = t.mock.method(Product, "find", async () => [doc()]);
  for (const body of [
    { priceType: "set", priceValue: 0 },
    { priceType: "set", priceValue: -10 },
    { priceType: "percentage", priceValue: 0 },
    { priceType: "decrease", priceValue: 0 },
    { priceType: "multiply", priceValue: 2 },
    { priceType: "set", priceValue: "abc" },
    { priceType: "set", priceValue: 10, discountMode: "double" },
  ]) {
    const res = response();
    await bulkUpdatePrice(request({ method: "POST", body: { productIds: [PID(1)], ...body } }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(find.mock.callCount(), 0);
});

test("toplu fiyat: bir ürün bile 0 ₺ ya da altına inerse istek ürün adıyla reddedilir, hiçbir fiyat değişmez", async (t) => {
  const writes = quietAudit(t);
  t.mock.method(FlashSale, "find", async () => []);
  const cheap = doc({ _id: PID(2), name: "Sakız", price: 5 });
  const milk = doc({ _id: PID(1), price: 40 });
  t.mock.method(Product, "find", async () => [milk, cheap]);

  for (const body of [
    { priceType: "decrease", priceValue: 5 }, // Sakız tam 0 ₺ olur
    { priceType: "decrease", priceValue: 12 }, // Sakız −7 ₺ olur
    { priceType: "percentage", priceValue: -100 },
    { priceType: "percentage", priceValue: -150 },
    { priceType: "increase", priceValue: -5 },
  ]) {
    const res = response();
    await bulkUpdatePrice(request({ method: "POST", body: { productIds: [PID(1), PID(2)], ...body } }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.ok(res.body.message.includes(`“${res.body.invalidProducts[0].name}”`), "hangi ürün olduğu yazılır");
    assert.match(res.body.message, /hiçbir fiyat değiştirilmedi/);
    assert.ok(res.body.invalidProducts.some((p) => p.name === "Sakız"));
  }
  await tick();
  assert.equal(milk.price, 40);
  assert.equal(cheap.price, 5);
  assert.equal(milk.saves + cheap.saves, 0);
  assert.equal(writes.length, 0);

  // Aynı indirim hiçbir ürünü 0'a indirmiyorsa uygulanır
  const ok = response();
  await bulkUpdatePrice(request({ method: "POST", body: { productIds: [PID(1), PID(2)], priceType: "decrease", priceValue: 4.5 } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(milk.price, 35.5);
  assert.equal(cheap.price, 0.5);
});

// ── Panel tarafı (saf yardımcılar) ───────────────────────────────────────────

test("panel: boş fiyat kutusu 0 sayılmaz", () => {
  assert.ok(Number.isNaN(parsePrice("")));
  assert.ok(Number.isNaN(parsePrice("   ")));
  assert.ok(Number.isNaN(parsePrice(null)));
  assert.ok(Number.isNaN(parsePrice("abc")));
  assert.equal(parsePrice("23,90"), 23.9);
  assert.equal(parsePrice("23.90"), 23.9);
  assert.equal(parsePrice("0"), 0);
});

test("panel: %50'den büyük fiyat değişikliğinde (artış ya da düşüş) soru sorulur", () => {
  assert.deepEqual(priceChangeOf(25, 27.5), { pct: 10, big: false });
  assert.deepEqual(priceChangeOf(25, 37.5), { pct: 50, big: false }, "tam %50 sorulmaz");
  assert.equal(priceChangeOf(25, 37.51).big, true);
  assert.equal(priceChangeOf(25, 12.49).big, true);
  assert.equal(priceChangeOf(25, 12.5).big, false);
  assert.equal(priceChangeOf(23.9, 2390).big, true, "virgül unutuldu");
  assert.equal(priceChangeOf(0, 10).big, false, "eski fiyat 0 ise oran hesaplanamaz");

  assert.equal(priceChangeQuestion({ name: "Süt", price: 25, isDiscounted: false }, 27.5), null);
  const big = priceChangeQuestion({ name: "Süt", price: 23.9, isDiscounted: false }, 2390);
  assert.match(big.title, /Doğru mu/);
  assert.match(big.message, /₺23,90 → ₺2\.390,00/);
  assert.match(big.message, /%9900 artış/);
  const drop = priceChangeQuestion({ name: "Süt", price: 100, isDiscounted: false }, 10);
  assert.match(drop.message, /%90 düşüş/);
});

test("panel: yeni fiyat mevcut indirimi kaldıracaksa kaydetmeden önce söylenir", () => {
  const product = { name: "Süt", price: 30, isDiscounted: true, discountedPrice: 24 };
  assert.equal(willRemoveDiscount(product, 25), false);
  assert.equal(willRemoveDiscount(product, 24), true);
  assert.equal(willRemoveDiscount(product, 20), true);
  assert.equal(willRemoveDiscount({ ...product, isDiscounted: false }, 20), false);
  assert.equal(willRemoveDiscount({ ...product, discountedPrice: null }, 20), false);
  const question = priceChangeQuestion(product, 22);
  assert.match(question.title, /İndirim kalkacak/);
  assert.match(question.message, /₺24,00 indirimli fiyat kalkar/);
  assert.equal(priceChangeQuestion(product, 28), null);
});
