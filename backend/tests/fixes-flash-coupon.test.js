// Flaş indirim daha derin ürün indiriminin yerine geçmez; kupon son kullanma tarihi günün sonuna kadar geçerlidir.
// Veritabanı yok: modeller taklit edilir. Tarihler gerçek saate göre hesaplanır (sabit takvim günü yok).
import test from "node:test";
import assert from "node:assert/strict";
import Product from "../models/product.model.js";
import FlashSale from "../models/flashSale.model.js";
import Coupon from "../models/coupon.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import { applySale, deeperOwnDiscount } from "../services/flashSale.service.js";
import { createBulkFlashSales, createFlashSale } from "../controllers/flashSale.controller.js";
import { fixMidnightCouponExpiries, istanbulDay, parseCouponExpiry } from "../services/coupon.service.js";
import { createCoupon, updateCoupon } from "../controllers/coupon.controller.js";

const H = 3600 * 1000;
const DAY = 24 * H;
const PID = (n) => `507f191e810c19729de8b${String(n).padStart(3, "0")}`;
const ADMIN = { _id: "507f191e810c19729de860ea", name: "Emirhan", role: "admin" };
const response = () => {
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};
const product = (fields) => ({ saved: 0, async save() { this.saved += 1; }, ...fields });
const windowBody = () => ({ startNow: true, durationHours: 24, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 24 * H).toISOString() });

test("deeperOwnDiscount: ürünün kendi indirimi flaş fiyatından düşük ya da eşitse o fiyat; flaştaki üründe ve indirimsizde null", () => {
  assert.equal(deeperOwnDiscount({ price: 100, isDiscounted: true, discountedPrice: 70 }, 20), 70);
  assert.equal(deeperOwnDiscount({ price: 100, isDiscounted: true, discountedPrice: 80 }, 20), 80, "eşit fiyat da fiyatı düşürmez");
  assert.equal(deeperOwnDiscount({ price: 100, isDiscounted: true, discountedPrice: 90 }, 20), null, "flaş daha derin");
  assert.equal(deeperOwnDiscount({ price: 100, isDiscounted: false, discountedPrice: 70 }, 20), null);
  assert.equal(deeperOwnDiscount({ price: 100, isDiscounted: true, discountedPrice: 70, flashSale: { sale: "x" } }, 20), null, "indirim başka bir flaştan");
  assert.equal(deeperOwnDiscount({ price: 100, isDiscounted: true, discountedPrice: 120 }, 20), null, "geçersiz indirim");
});

test("applySale: daha derin ürün indirimi varken flaş uygulanmaz, ürün ve kampanya değişmez", async (t) => {
  const p = product({ _id: PID(1), price: 100, isDiscounted: true, discountedPrice: 70 });
  t.mock.method(Product, "findById", async () => p);
  const sale = { _id: "s1", product: PID(1), discountPercentage: 20, applied: false, saves: 0, async save() { this.saves += 1; } };
  assert.equal(await applySale(sale), false);
  assert.equal(p.discountedPrice, 70);
  assert.equal(p.saved, 0);
  assert.equal(sale.applied, false);
  assert.equal(sale.saves, 0);
});

test("flaş oluşturma: daha derin indirimli üründe tekli 400 DEEPER_DISCOUNT, toplu atlar; diğer ürünlere uygular", async (t) => {
  t.mock.method(AdminAudit, "create", async (entry) => entry);
  const items = {
    [PID(1)]: product({ _id: PID(1), name: "Süt", price: 100, isDiscounted: true, discountedPrice: 70 }),
    [PID(2)]: product({ _id: PID(2), name: "Ekmek", price: 50, isDiscounted: false }),
  };
  t.mock.method(Product, "findById", async (id) => items[String(id)] || null);
  t.mock.method(Product, "find", async () => Object.values(items));
  t.mock.method(FlashSale, "find", async () => []);
  t.mock.method(FlashSale.prototype, "save", async function save() { return this; });
  t.mock.method(FlashSale.prototype, "populate", async function populate() { return this; });

  const single = response();
  await createFlashSale({ body: { productId: PID(1), discountPercentage: 20, ...windowBody() }, user: ADMIN }, single);
  assert.equal(single.statusCode, 400);
  assert.equal(single.body.code, "DEEPER_DISCOUNT");
  assert.equal(items[PID(1)].discountedPrice, 70);

  // Daha yüksek oran fiyatı gerçekten düşürür: kabul edilir
  const deeper = response();
  await createFlashSale({ body: { productId: PID(1), discountPercentage: 40, ...windowBody() }, user: ADMIN }, deeper);
  assert.equal(deeper.statusCode, 201, JSON.stringify(deeper.body));
  assert.equal(items[PID(1)].discountedPrice, 60);
  // Ürünü sonraki adım için eski hâline al
  Object.assign(items[PID(1)], { isDiscounted: true, discountedPrice: 70, flashSale: null });

  const bulk = response();
  await createBulkFlashSales({ body: { productIds: [PID(1), PID(2)], discountPercentage: 20, ...windowBody() }, user: ADMIN }, bulk);
  assert.equal(bulk.statusCode, 201, JSON.stringify(bulk.body));
  assert.deepEqual(bulk.body.created.map((item) => item.productId), [PID(2)]);
  assert.equal(bulk.body.skipped.length, 1);
  assert.equal(bulk.body.skipped[0].code, "DEEPER_DISCOUNT");
  assert.equal(items[PID(1)].discountedPrice, 70, "derin indirim korunur");
  assert.equal(items[PID(2)].discountedPrice, 40);
});

test("kupon bitişi: yalnızca gün gelirse İstanbul saatiyle günün sonu; saatli değer olduğu gibi", () => {
  const end = parseCouponExpiry("2030-11-05");
  assert.equal(end.toISOString(), "2030-11-05T20:59:59.999Z");
  assert.equal(istanbulDay(end), "2030-11-05");
  assert.equal(parseCouponExpiry("2030-11-05T10:00:00.000Z").toISOString(), "2030-11-05T10:00:00.000Z");
  assert.equal(parseCouponExpiry("bozuk"), null);
  assert.equal(parseCouponExpiry(""), null);
  assert.equal(istanbulDay("2030-11-05T21:30:00.000Z"), "2030-11-06", "gece yarısından sonrası ertesi gün");
});

test("kupon oluşturma: bugünün tarihi kabul edilir ve gün sonunda biter; dünün tarihi reddedilir", async (t) => {
  const saved = [];
  t.mock.method(Coupon, "findOne", async () => null);
  t.mock.method(Coupon.prototype, "save", async function save() { saved.push(this); return this; });
  t.mock.method(AdminAudit, "create", async (entry) => entry);
  const today = istanbulDay(Date.now());
  const ok = response();
  await createCoupon({ body: { code: "BUGUN10", discountType: "percentage", discountPercentage: 10, expirationDate: today }, user: ADMIN }, ok);
  assert.ok(ok.statusCode === 200 || ok.statusCode === 201, JSON.stringify(ok.body));
  assert.equal(saved.length, 1);
  assert.equal(new Date(saved[0].expirationDate).toISOString(), `${today}T20:59:59.999Z`);
  assert.ok(new Date(saved[0].expirationDate) > new Date(), "son gün akşamı hâlâ geçerli");

  const past = response();
  await createCoupon({ body: { code: "DUN10", discountType: "percentage", discountPercentage: 10, expirationDate: istanbulDay(Date.now() - DAY) }, user: ADMIN }, past);
  assert.equal(past.statusCode, 400);
  const invalid = response();
  await createCoupon({ body: { code: "BOZUK", discountType: "percentage", discountPercentage: 10, expirationDate: "bozuk" }, user: ADMIN }, invalid);
  assert.equal(invalid.statusCode, 400);
});

test("kupon güncelleme: gün değişmezse saatli bitiş korunur; eski gece yarısı kaydı günün sonuna çekilir; geçmiş güne alınamaz", async (t) => {
  t.mock.method(AdminAudit, "create", async (entry) => entry);
  const timed = new Date(Date.now() + 3 * DAY);
  const doc = { _id: "c1", code: "GOREVX", expirationDate: timed, saves: 0, async save() { this.saves += 1; return this; } };
  t.mock.method(Coupon, "findById", async () => doc);
  const same = response();
  await updateCoupon({ params: { id: "c1" }, body: { description: "yeni", expirationDate: istanbulDay(timed) }, user: ADMIN }, same);
  assert.equal(same.statusCode, 200, JSON.stringify(same.body));
  assert.equal(doc.expirationDate.getTime(), timed.getTime(), "aynı gün: saat korunur");

  // Eski kayıt: gece yarısı UTC (İstanbul 03:00)
  const day = istanbulDay(Date.now() + 5 * DAY);
  doc.expirationDate = new Date(`${day}T00:00:00.000Z`);
  const fixed = response();
  await updateCoupon({ params: { id: "c1" }, body: { expirationDate: day }, user: ADMIN }, fixed);
  assert.equal(new Date(doc.expirationDate).toISOString(), `${day}T20:59:59.999Z`);

  const past = response();
  await updateCoupon({ params: { id: "c1" }, body: { expirationDate: istanbulDay(Date.now() - 2 * DAY) }, user: ADMIN }, past);
  assert.equal(past.statusCode, 400);
});

test("tek seferlik düzeltme: gece yarısı UTC'de biten genel kuponlar günün sonuna çekilir, saatli olanlara dokunulmaz", async (t) => {
  const midnight = new Date("2030-11-05T00:00:00.000Z");
  const timed = new Date("2030-11-05T14:28:00.000Z");
  const finds = [];
  t.mock.method(Coupon, "find", (filter) => { finds.push(filter); return { select: () => ({ lean: async () => [{ _id: "a", expirationDate: midnight }, { _id: "b", expirationDate: timed }] }) }; });
  const updates = [];
  t.mock.method(Coupon, "updateOne", async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 }; });
  assert.equal(await fixMidnightCouponExpiries(new Date("2030-11-01T00:00:00Z")), 1);
  assert.equal(finds[0].userId, null, "yalnızca kişiye özel olmayan kuponlar");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter._id, "a");
  assert.equal(updates[0].update.$set.expirationDate.toISOString(), "2030-11-05T20:59:59.999Z", "5 Kasım olarak girilen kupon 5 Kasım 23:59 İstanbul'da biter");
});
