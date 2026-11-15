// Toplu fiyat değişikliğinde indirimli ve flaş indirimdeki ürünler: indirim oranı korunur (varsayılan),
// indirimli fiyat sabit tutulur ya da indirim kaldırılır; flaş fiyatı yeni liste fiyatından yeniden
// hesaplanır ve kampanya bitince doğru fiyata dönülür. Veritabanı yok: modeller taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import AdminAudit from "../models/adminAudit.model.js";
import Product from "../models/product.model.js";
import FlashSale from "../models/flashSale.model.js";
import {
  DEFAULT_DISCOUNT_MODE, DISCOUNT_MODES, bulkNewPrice, isOnFlashPrice, planBulkPrice, scaleDiscount,
} from "../services/productAdmin.service.js";
import { flashPrice, releaseSale } from "../services/flashSale.service.js";
import { resolveUnitPrice } from "../services/productPricing.js";
import { bulkUpdatePrice } from "../controllers/product.controller.js";
import {
  DISCOUNT_MODES as PANEL_DISCOUNT_MODES, previewBulkPrice,
} from "../../frontend/src/components/products/productUtils.js";

const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin" };
const PID = (n) => `99cc${String(n).padStart(20, "0")}`;
const SID = (n) => `5a1e${String(n).padStart(20, "0")}`;
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
  _id: PID(1), name: "Pınar Süt 1 L", category: "sut", price: 30, isDiscounted: false, discountedPrice: null,
  flashSale: null, saves: 0,
  async save() { this.saves += 1; return this; },
  ...fields,
});
const saleDoc = (fields = {}) => ({
  _id: SID(1), product: PID(1), discountPercentage: 20, isActive: true, applied: true, appliedPrice: 24,
  previousIsDiscounted: false, previousDiscountedPrice: null, saves: 0,
  async save() { this.saves += 1; return this; },
  ...fields,
});
const flashInfo = (sale, price) => ({
  sale: sale._id, discountPercentage: sale.discountPercentage, price,
  startDate: new Date(Date.now() - 60 * 60 * 1000), endDate: new Date(Date.now() + 60 * 60 * 1000),
});
const bulkRequest = (body, io) => ({
  user: ADMIN, method: "POST", originalUrl: "/api/products/bulk-price-update", body,
  app: { get: (key) => (key === "io" ? io : undefined) },
});
const fakeIo = () => {
  const events = [];
  return { events, to(room) { return { emit: (name, payload) => events.push({ room, name, payload }) }; } };
};
const captureAudit = (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (entry) => { writes.push(entry); return entry; });
  return writes;
};

test("kural hesabı: yüzde, artış, düşüş ve sabit fiyat kuruşa yuvarlanır", () => {
  assert.equal(bulkNewPrice(30, "percentage", 10), 33);
  assert.equal(bulkNewPrice(29.99, "percentage", 10), 32.99);
  assert.equal(bulkNewPrice(19.9, "percentage", -5), 18.91, "18.905 yukarı yuvarlanır");
  assert.equal(bulkNewPrice(30, "increase", 2.5), 32.5);
  assert.equal(bulkNewPrice(30, "decrease", 2.5), 27.5);
  assert.equal(bulkNewPrice(30, "set", 45), 45);
  assert.equal(bulkNewPrice(5, "decrease", 12), -7, "0'ın altı çağıran tarafından reddedilir");
});

test("indirim oranını koru: indirimli fiyat aynı oranda değişir, kuruşa yuvarlanır ve yeni fiyatın altında kalır", () => {
  assert.equal(DEFAULT_DISCOUNT_MODE, "keepRatio");
  assert.equal(scaleDiscount(25, 30, 33), 27.5);
  assert.equal(scaleDiscount(24.99, 29.99, 32.99), 27.49);
  assert.equal(scaleDiscount(9.99, 10, 10.5), 10.49, "oran yuvarlanınca fiyata eşitlenmez");
  assert.equal(scaleDiscount(0.99, 1, 0.02), 0.01, "yuvarlama fiyata eşitlerse bir kuruş altına çekilir");
  assert.equal(scaleDiscount(0.5, 1, 0.01), null, "bir kuruşun altında indirim olamaz: kalkar");
  assert.equal(scaleDiscount(35, 30, 33), null, "eski indirim zaten geçersizdi: kalkar");
  assert.equal(scaleDiscount(null, 30, 33), null);
  assert.equal(scaleDiscount(undefined, 30, 33), null);
  assert.equal(scaleDiscount(25, 0, 33), null, "eski fiyat 0 ise oran hesaplanamaz");
  for (const [d, oldPrice, newPrice] of [[25, 30, 33], [7.77, 9.99, 3.33], [1.01, 1.02, 250], [99.5, 100, 0.07]]) {
    const scaled = scaleDiscount(d, oldPrice, newPrice);
    if (scaled !== null) {
      assert.ok(scaled < newPrice, `${scaled} < ${newPrice}`);
      assert.equal(Math.round(scaled * 100) / 100, scaled, "kuruşa yuvarlı");
    }
  }
});

test("indirimli fiyatı sabit tut / indirimi kaldır", () => {
  assert.equal(scaleDiscount(25, 30, 33, "keepPrice"), 25);
  assert.equal(scaleDiscount(25, 30, 25, "keepPrice"), null, "yeni fiyatın altında kalmayan indirim kalkar");
  assert.equal(scaleDiscount(25, 30, 20, "keepPrice"), null);
  assert.equal(scaleDiscount(25, 30, 33, "remove"), null);
});

test("plan: %10 zam indirimdeki üründe müşteri fiyatına yansır, indirim yüzdesi şişmez", () => {
  const product = { price: 30, isDiscounted: true, discountedPrice: 25 };
  const keepRatio = planBulkPrice(product, { priceType: "percentage", priceValue: 10 });
  assert.equal(keepRatio.price, 33);
  assert.equal(keepRatio.discountedPrice, 27.5);
  assert.equal(keepRatio.customerBefore, 25);
  assert.equal(keepRatio.customerAfter, 27.5);
  assert.equal(Math.round((1 - 25 / 30) * 100), Math.round((1 - 27.5 / 33) * 100), "indirim oranı aynı");

  const keepPrice = planBulkPrice(product, { priceType: "percentage", priceValue: 10, discountMode: "keepPrice" });
  assert.equal(keepPrice.discountedPrice, 25);
  assert.equal(keepPrice.customerAfter, 25, "eski davranış: müşteri fiyatı değişmez");

  const removed = planBulkPrice(product, { priceType: "percentage", priceValue: 10, discountMode: "remove" });
  assert.equal(removed.isDiscounted, false);
  assert.equal(removed.discountedPrice, null);
  assert.equal(removed.discountRemoved, true);
  assert.equal(removed.customerAfter, 33);

  const plain = planBulkPrice({ price: 30, isDiscounted: false, discountedPrice: null }, { priceType: "percentage", priceValue: 10 });
  assert.deepEqual([plain.price, plain.isDiscounted, plain.discountedPrice, plain.customerAfter, plain.flash], [33, false, null, 33, null]);
});

test("plan: flaş indirimde flaş fiyatı yeni liste fiyatından aynı yüzdeyle hesaplanır, kampanya öncesi indirim seçime göre ölçeklenir", () => {
  const sale = { _id: SID(1), discountPercentage: 20, previousIsDiscounted: true, previousDiscountedPrice: 27 };
  const product = { price: 30, isDiscounted: true, discountedPrice: 24, flashSale: flashInfo(sale, 24) };
  assert.equal(isOnFlashPrice(product), true);

  const plan = planBulkPrice(product, { priceType: "percentage", priceValue: 10 }, sale);
  assert.equal(plan.price, 33);
  assert.equal(plan.discountedPrice, flashPrice(33, 20));
  assert.equal(plan.discountedPrice, 26.4);
  assert.deepEqual(plan.flash, { percentage: 20, oldPrice: 24, price: 26.4, previousIsDiscounted: true, previousDiscountedPrice: 29.7 });
  assert.equal(plan.discountRemoved, false);

  const keepPrice = planBulkPrice(product, { priceType: "percentage", priceValue: 10, discountMode: "keepPrice" }, sale);
  assert.equal(keepPrice.discountedPrice, 26.4, "flaş fiyatı her seçimde yeniden hesaplanır");
  assert.equal(keepPrice.flash.previousDiscountedPrice, 27);

  const removed = planBulkPrice(product, { priceType: "percentage", priceValue: 10, discountMode: "remove" }, sale);
  assert.equal(removed.discountedPrice, 26.4);
  assert.deepEqual([removed.flash.previousIsDiscounted, removed.flash.previousDiscountedPrice], [false, null]);

  // Kampanya sırasında indirim elle değiştirildiyse ürün flaş fiyatında değildir: normal indirim gibi işlenir
  const manual = { ...product, discountedPrice: 22 };
  assert.equal(isOnFlashPrice(manual), false);
  const manualPlan = planBulkPrice(manual, { priceType: "percentage", priceValue: 10 }, sale);
  assert.equal(manualPlan.flash, null);
  assert.equal(manualPlan.discountedPrice, 24.2);
});

test("panel önizlemesi sunucu hesabıyla aynı sonucu verir", () => {
  assert.deepEqual(PANEL_DISCOUNT_MODES.map((m) => m.key), DISCOUNT_MODES);
  const sale = { _id: SID(1), discountPercentage: 15, previousIsDiscounted: true, previousDiscountedPrice: 9 };
  const products = [
    { price: 30, isDiscounted: false, discountedPrice: null },
    { price: 30, isDiscounted: true, discountedPrice: 25 },
    { price: 29.99, isDiscounted: true, discountedPrice: 24.99 },
    { price: 10, isDiscounted: true, discountedPrice: 9.99 },
    { price: 10, isDiscounted: true, discountedPrice: 12 },
    { price: 10, isDiscounted: true, discountedPrice: null },
    { price: 0.05, isDiscounted: true, discountedPrice: 0.04 },
    { price: 12.9, isDiscounted: true, discountedPrice: flashPrice(12.9, 15), flashSale: flashInfo(sale, flashPrice(12.9, 15)) },
  ];
  const rules = [
    { priceType: "percentage", priceValue: 10 }, { priceType: "percentage", priceValue: -7.5 }, { priceType: "percentage", priceValue: -99 },
    { priceType: "increase", priceValue: 1.35 }, { priceType: "decrease", priceValue: 0.04 }, { priceType: "decrease", priceValue: 11 },
    { priceType: "set", priceValue: 9.99 }, { priceType: "set", priceValue: 0.01 },
  ];
  let compared = 0;
  for (const product of products) {
    for (const rule of rules) {
      for (const discountMode of DISCOUNT_MODES) {
        const server = planBulkPrice(product, { ...rule, discountMode }, product.flashSale ? sale : null);
        // Panel, flaş bilgisini ürün listesindeki flashSale özetinden okur
        const panel = previewBulkPrice(product, { ...rule, discountMode }, product.flashSale || null);
        const label = `${JSON.stringify(product)} ${JSON.stringify(rule)} ${discountMode}`;
        assert.equal(panel.price, server.price, label);
        assert.equal(panel.invalid, !(server.price > 0), label);
        if (panel.invalid) continue;
        assert.equal(panel.isDiscounted, server.isDiscounted, label);
        assert.equal(panel.discountedPrice, server.discountedPrice, label);
        assert.equal(panel.customerBefore, server.customerBefore, label);
        assert.equal(panel.customerAfter, server.customerAfter, label);
        assert.equal(panel.discountRemoved, server.discountRemoved, label);
        assert.equal(panel.flash, Boolean(server.flash), label);
        compared += 1;
      }
    }
  }
  assert.ok(compared > 100);
});

test("uç: varsayılan seçim indirim oranını korur; işlem kaydı iki fiyatı da yazar; panele canlı bildirim gider", async (t) => {
  const writes = captureAudit(t);
  t.mock.method(FlashSale, "find", async () => []);
  const discounted = doc({ isDiscounted: true, discountedPrice: 25 });
  const plain = doc({ _id: PID(2), name: "Ekmek", price: 10 });
  t.mock.method(Product, "find", async () => [discounted, plain]);
  const io = fakeIo();
  const res = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [PID(1), PID(2)], priceType: "percentage", priceValue: 10 }, io), res);
  await tick();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.discountMode, "keepRatio");
  assert.deepEqual([discounted.price, discounted.isDiscounted, discounted.discountedPrice], [33, true, 27.5]);
  assert.deepEqual([plain.price, plain.isDiscounted, plain.discountedPrice], [11, false, null]);
  assert.equal(resolveUnitPrice(discounted).price, 27.5, "müşteri fiyatı da zamlandı");
  assert.deepEqual(res.body.products, [
    { _id: PID(1), price: 33, isDiscounted: true, discountedPrice: 27.5 },
    { _id: PID(2), price: 11, isDiscounted: false, discountedPrice: null },
  ]);

  assert.match(writes[0].action, /Toplu fiyat güncelleme \(%10, indirim oranı korundu\)/);
  assert.deepEqual(writes[0].changes[0], { label: "Pınar Süt 1 L", from: "₺30,00 (müşteri ₺25,00)", to: "₺33,00 (müşteri ₺27,50)" });
  assert.deepEqual(writes[0].changes[1], { label: "Ekmek", from: "₺10,00", to: "₺11,00" });
  assert.equal(writes[0].meta.discountMode, "keepRatio");

  assert.equal(io.events.length, 1);
  assert.equal(io.events[0].room, "adminRoom");
  assert.equal(io.events[0].name, "productsChanged");
  assert.deepEqual(io.events[0].payload.ids, [PID(1), PID(2)]);
  assert.deepEqual(io.events[0].payload.products[0], { _id: PID(1), price: 33, isDiscounted: true, discountedPrice: 27.5 });
});

test("uç: keepPrice eski davranıştır; remove indirimi kaldırır", async (t) => {
  captureAudit(t);
  t.mock.method(FlashSale, "find", async () => []);
  const make = () => [doc({ isDiscounted: true, discountedPrice: 25 }), doc({ _id: PID(2), name: "Peynir", price: 26, isDiscounted: true, discountedPrice: 25.5 })];

  let products = make();
  t.mock.method(Product, "find", async () => products);
  let res = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [PID(1), PID(2)], priceType: "decrease", priceValue: 1, discountMode: "keepPrice" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([products[0].price, products[0].isDiscounted, products[0].discountedPrice], [29, true, 25]);
  assert.deepEqual([products[1].price, products[1].isDiscounted, products[1].discountedPrice], [25, false, null], "25,50 ₺ indirim 25 ₺ fiyatın altında değil");
  assert.equal(res.body.discountsRemoved, 1);

  products = make();
  res = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [PID(1), PID(2)], priceType: "percentage", priceValue: 10, discountMode: "remove" }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(products.every((p) => p.isDiscounted === false && p.discountedPrice === null));
  assert.equal(res.body.discountsRemoved, 2);
});

test("uç: flaş indirimdeki üründe flaş fiyatı, ürün özeti ve kampanya kaydı birlikte güncellenir; kampanya bitince doğru fiyata dönülür", async (t) => {
  const writes = captureAudit(t);
  const sale = saleDoc({ previousIsDiscounted: true, previousDiscountedPrice: 27 });
  const product = doc({ isDiscounted: true, discountedPrice: 24, flashSale: flashInfo(sale, 24) });
  t.mock.method(Product, "find", async () => [product]);
  const saleFind = t.mock.method(FlashSale, "find", async () => [sale]);

  const res = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [PID(1)], priceType: "percentage", priceValue: 10 }), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.flashUpdated, 1);
  assert.deepEqual(saleFind.mock.calls[0].arguments[0], { _id: { $in: [SID(1)] } });

  assert.equal(product.price, 33);
  assert.equal(product.discountedPrice, 26.4, "flaş fiyatı = yeni fiyatın %20 altı");
  assert.equal(product.flashSale.price, 26.4);
  assert.equal(product.isDiscounted, true);
  assert.equal(sale.appliedPrice, 26.4);
  assert.equal(sale.previousIsDiscounted, true);
  assert.equal(sale.previousDiscountedPrice, 29.7, "kampanya öncesi indirim de aynı oranda ölçeklendi");
  assert.equal(sale.saves, 1);
  assert.match(writes[0].changes[0].to, /₺33,00 \(müşteri ₺26,40, flaş\)/);

  // Kampanya bitince (gerçek releaseSale) ürün ölçeklenmiş önceki indirimine döner
  t.mock.method(Product, "findById", async () => product);
  await releaseSale(sale);
  assert.equal(product.flashSale, null);
  assert.equal(product.isDiscounted, true);
  assert.equal(product.discountedPrice, 29.7);
  assert.equal(product.price, 33);
});

test("uç: flaş indirimde 'indirimi kaldır' flaş fiyatını korur ama kampanya sonrası indirimi siler", async (t) => {
  captureAudit(t);
  const sale = saleDoc({ previousIsDiscounted: true, previousDiscountedPrice: 27 });
  const product = doc({ isDiscounted: true, discountedPrice: 24, flashSale: flashInfo(sale, 24) });
  t.mock.method(Product, "find", async () => [product]);
  t.mock.method(FlashSale, "find", async () => [sale]);

  const res = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [PID(1)], priceType: "set", priceValue: 40, discountMode: "remove" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(product.discountedPrice, 32);
  assert.equal(sale.appliedPrice, 32);
  assert.deepEqual([sale.previousIsDiscounted, sale.previousDiscountedPrice], [false, null]);

  t.mock.method(Product, "findById", async () => product);
  await releaseSale(sale);
  assert.deepEqual([product.price, product.isDiscounted, product.discountedPrice], [40, false, null]);
});

test("uç: kampanya kaydı silinmişse flaş fiyatı ürün özetindeki yüzdeyle yine yeniden hesaplanır", async (t) => {
  captureAudit(t);
  const sale = saleDoc();
  const product = doc({ isDiscounted: true, discountedPrice: 24, flashSale: flashInfo(sale, 24) });
  t.mock.method(Product, "find", async () => [product]);
  t.mock.method(FlashSale, "find", async () => []);
  const res = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [PID(1)], priceType: "increase", priceValue: 5 }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([product.price, product.discountedPrice, product.flashSale.price], [35, 28, 28]);
});

test("uç: geçersiz ya da bulunamayan ürün kimliği", async (t) => {
  captureAudit(t);
  const find = t.mock.method(Product, "find", async () => []);
  const bad = response();
  await bulkUpdatePrice(bulkRequest({ productIds: ["abc"], priceType: "percentage", priceValue: 10 }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(find.mock.callCount(), 0);
  const none = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [PID(7)], priceType: "percentage", priceValue: 10 }), none);
  assert.equal(none.statusCode, 404);
  const empty = response();
  await bulkUpdatePrice(bulkRequest({ productIds: [], priceType: "percentage", priceValue: 10 }), empty);
  assert.equal(empty.statusCode, 400);
});
