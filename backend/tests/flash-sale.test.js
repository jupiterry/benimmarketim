import test from "node:test";
import assert from "node:assert/strict";
import FlashSale from "../models/flashSale.model.js";
import Product from "../models/product.model.js";
import { applySale, flashPrice, rangesOverlap, releaseSale, saleStatus, syncFlashSales } from "../services/flashSale.service.js";
import { validateFlashSaleInput } from "../controllers/flashSale.controller.js";

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
