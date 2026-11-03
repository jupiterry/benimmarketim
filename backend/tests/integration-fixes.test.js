// Entegrasyon incelemesi düzeltmeleri: durdurulan haftalık fırsatın kapanma anı (stoppedAt), yalnızca sıra
// değişikliğinde güncellenme zamanının korunması, sipariş satırında haftalık fırsat kimliği ve getirinin bu
// kimliğe göre sayılması. Veritabanı yok: modeller taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import FlashSale from "../models/flashSale.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import { weeklyDealPerformance, weeklyDealWindow } from "../services/campaignPerformance.service.js";
import { buildOrderProducts } from "../services/order.service.js";
import { toggleWeeklyProductStatus, updateWeeklyProduct } from "../controllers/weeklyProduct.controller.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const DEAL = (n) => hex("dea1", n);
const PRODUCT = (n) => hex("90d0", n);
const ORDER = (n) => hex("0dde", n);
const ADMIN = hex("adad", 7);
const oid = (id) => new mongoose.Types.ObjectId(id);
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-05T18:00:00.000Z");

// Her yöntem zinciri sürdürür; lean / exec / then sonucu döndürür
const chain = (result) => {
  const value = () => (typeof result === "function" ? result() : result);
  const c = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "lean" || prop === "exec") return async () => value();
      if (prop === "then") return (onOk, onErr) => Promise.resolve(value()).then(onOk, onErr);
      return () => c;
    },
  });
  return c;
};
const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const adminReq = ({ body = {}, params = {} } = {}) => ({
  body,
  params,
  method: "PUT",
  originalUrl: "/api/weekly-products",
  user: { _id: ADMIN, role: "admin" },
  app: { get: () => null },
});

test("ölçüm aralığı: durdurulan fırsat stoppedAt anında biter; sonradan değişen updatedAt aralığı uzatmaz", () => {
  const paused = {
    startDate: "2026-10-12T21:00:00Z", endDate: null, isActive: false,
    stoppedAt: "2026-10-14T09:00:00Z", updatedAt: "2026-10-29T10:00:00Z", // sıralama sonradan updatedAt'i kaydırmış
  };
  const window = weeklyDealWindow(paused, NOW);
  assert.equal(window.to.toISOString(), "2026-10-14T09:00:00.000Z");
  // stoppedAt olmayan eski kayıt: eskisi gibi updatedAt
  const legacy = weeklyDealWindow({ ...paused, stoppedAt: null }, NOW);
  assert.equal(legacy.to.toISOString(), "2026-10-29T10:00:00.000Z");
  // Yayındaki fırsatta stoppedAt yok sayılır
  const live = weeklyDealWindow({ ...paused, isActive: true }, NOW);
  assert.equal(live.to.toISOString(), NOW.toISOString());
});

test("ödeme: haftalık fırsat fiyatıyla alınan satıra fırsatın kimliği yazılır", async (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([
    { _id: oid(DEAL(1)), product: oid(PRODUCT(1)), weeklyPrice: 45, isActive: true, startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY) },
  ]));
  t.mock.method(Product, "find", () => chain([
    { _id: oid(PRODUCT(1)), name: "Süt", price: 60, category: "sut" },
    { _id: oid(PRODUCT(2)), name: "Ekmek", price: 10, category: "firin" },
  ]));
  const { orderProducts } = await buildOrderProducts([
    { product: PRODUCT(1), quantity: 2 },
    { product: PRODUCT(2), quantity: 1 },
  ]);
  const [weekly, plain] = orderProducts;
  assert.equal(weekly.priceSource, "weekly");
  assert.equal(String(weekly.weeklyDealId), DEAL(1));
  assert.equal(weekly.price, 45);
  assert.equal(plain.priceSource, "list");
  assert.equal(plain.weeklyDealId, undefined, "liste fiyatlı satırda fırsat kimliği yok");
  // Şema alanı atmaz
  const doc = new Order({ user: oid(ADMIN), products: orderProducts, totalAmount: 100, phone: "05551112233", city: "Devrek", deliveryPoint: "girlsDorm" });
  assert.equal(String(doc.products[0].weeklyDealId), DEAL(1));
});

test("haftalık getiri: satır fırsat kimliği taşıyorsa zaman aralığından bağımsız o fırsata sayılır", async (t) => {
  // A geçen haftanın fırsatı, B kopyası. B durdurulup A yeniden açılmış; 3 Kasım'daki satış A fiyatıyla alınmış.
  const deals = {
    a: { _id: DEAL(1), product: PRODUCT(1), weeklyPrice: 45, isActive: false, startDate: new Date("2026-10-26T21:00:00Z"), endDate: new Date("2026-11-01T20:59:59.999Z"), stoppedAt: new Date("2026-11-04T06:00:00Z"), updatedAt: new Date("2026-11-04T06:00:00Z") },
    b: { _id: DEAL(2), product: PRODUCT(1), weeklyPrice: 45, isActive: true, startDate: new Date("2026-11-01T21:00:00Z"), endDate: new Date("2026-11-08T20:59:59.999Z") },
  };
  const orders = [
    { _id: ORDER(1), status: "Teslim Edildi", createdAt: new Date("2026-11-03T12:00:00Z"),
      products: [{ product: PRODUCT(1), quantity: 2, price: 45, originalPrice: 60, priceSource: "weekly", weeklyDealId: DEAL(1) }] },
    { _id: ORDER(2), status: "Teslim Edildi", createdAt: new Date("2026-11-03T13:00:00Z"),
      products: [{ product: PRODUCT(1), quantity: 1, price: 45, originalPrice: 60, priceSource: "weekly" }] }, // kimliksiz: aralık kuralı → B
  ];
  const all = Object.values(deals);
  t.mock.method(WeeklyProduct, "find", (filter) => {
    if (filter._id) return chain(all.filter((deal) => filter._id.$in.map(String).includes(String(deal._id))));
    return chain(all);
  });
  t.mock.method(Order, "find", () => chain(orders));
  t.mock.method(FlashSale, "find", () => chain([]));
  t.mock.method(Product, "find", () => chain([{ _id: PRODUCT(1), price: 60 }]));
  const { items } = await weeklyDealPerformance([DEAL(1), DEAL(2)], { now: NOW });
  assert.equal(items[DEAL(1)].units, 2, "kimlikli satır A'ya");
  assert.equal(items[DEAL(1)].revenue, 90);
  assert.equal(items[DEAL(1)].discount, 30);
  assert.equal(items[DEAL(2)].units, 1, "kimliksiz satır o an süren en son fırsata (B)");
});

test("durdurma: anahtarla kapatılan fırsat stoppedAt alır, yeniden açılınca silinir", async (t) => {
  t.mock.method(AdminAudit, "create", async (entry) => entry);
  const doc = {
    _id: oid(DEAL(5)), product: oid(PRODUCT(5)), weeklyPrice: 20, isActive: true, scheduled: false,
    startDate: new Date(Date.now() - DAY), endDate: null, stoppedAt: null,
    async save() { this.saved = (this.saved || 0) + 1; },
  };
  t.mock.method(WeeklyProduct, "findById", () => chain(doc));
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "findById", () => chain({ name: "Çay" }));
  const before = Date.now();
  const off = response();
  await toggleWeeklyProductStatus(adminReq({ params: { id: DEAL(5) } }), off);
  assert.equal(doc.isActive, false);
  assert.ok(doc.stoppedAt instanceof Date && doc.stoppedAt.getTime() >= before, "durdurma anı yazıldı");
  const on = response();
  await toggleWeeklyProductStatus(adminReq({ params: { id: DEAL(5) } }), on);
  assert.equal(doc.isActive, true);
  assert.equal(doc.stoppedAt, null, "yeniden açılınca silindi");
});

test("sıralama: yalnızca sıra değişen düzenleme güncellenme zamanını kaydırmaz; durdurma stoppedAt yazar", async (t) => {
  t.mock.method(AdminAudit, "create", async (entry) => entry);
  const saves = [];
  const doc = {
    _id: oid(DEAL(6)), product: { _id: oid(PRODUCT(6)), name: "Kahve", price: 50 }, weeklyPrice: 40, discountPercentage: 20,
    listPriceAtStart: 50, isActive: false, scheduled: false, startDate: new Date(Date.now() - 20 * DAY), endDate: null,
    stoppedAt: new Date(Date.now() - 18 * DAY), order: 1,
    async save(options) { saves.push(options); },
  };
  t.mock.method(WeeklyProduct, "findById", () => chain(doc));
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(WeeklyProduct, "updateOne", async () => ({ matchedCount: 1, modifiedCount: 1 }));
  t.mock.method(Product, "findById", () => chain({ name: "Kahve" }));
  const reorder = response();
  await updateWeeklyProduct(adminReq({ params: { id: DEAL(6) }, body: { order: 4 } }), reorder);
  assert.equal(reorder.statusCode, 200, JSON.stringify(reorder.body));
  assert.equal(doc.order, 4);
  assert.deepEqual(saves.at(-1), { timestamps: false }, "yalnızca sıra: timestamps kapalı");

  // Yayındaki fırsatı düzenleme formundan durdurmak stoppedAt yazar; sıra dışı değişiklik timestamps'i açık bırakır
  doc.isActive = true;
  doc.stoppedAt = null;
  doc.endDate = new Date(Date.now() + 3 * DAY);
  const pause = response();
  await updateWeeklyProduct(adminReq({ params: { id: DEAL(6) }, body: { isActive: false } }), pause);
  assert.equal(pause.statusCode, 200, JSON.stringify(pause.body));
  assert.equal(doc.isActive, false);
  assert.ok(doc.stoppedAt instanceof Date, "durdurma anı yazıldı");
  assert.equal(saves.at(-1), undefined, "normal kayıt");
});
