import test from "node:test";
import assert from "node:assert/strict";
import SavedCart from "../models/savedCart.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import { MAX_SAVED_CARTS, deleteSavedCart, listSavedCarts, saveSavedCart, validateSavedCart } from "../controllers/savedCart.controller.js";

const USER = "507f191e810c19729de860ea";
const A = "507f191e810c19729de89001"; const B = "507f191e810c19729de89002"; const GONE = "507f191e810c19729de89003";
const chain = (value) => ({ sort() { return this; }, select() { return this; }, limit() { return this; }, lean: async () => value });
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const req = (body, params = {}) => ({ body, params, user: { _id: USER } });
const catalog = (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", () => chain([{ _id: A, name: "Süt 1 L", price: 40 }, { _id: B, name: "Ekmek", price: 20, isOutOfStock: true }]));
};

test("saved cart input is validated and duplicate products are merged", () => {
  assert.match(validateSavedCart({ name: "a", items: [{ productId: A, quantity: 1 }] }).error, /2–40/);
  assert.match(validateSavedCart({ name: "Haftalık", items: [] }).error, /ürün bulunamadı/);
  assert.match(validateSavedCart({ name: "Haftalık", items: [{ productId: "x", quantity: 1 }] }).error, /okunamadı/);
  assert.match(validateSavedCart({ name: "Haftalık", items: [{ productId: A, quantity: 0 }] }).error, /okunamadı/);
  assert.match(validateSavedCart({ name: "Haftalık", items: [{ productId: A, quantity: 1.5 }] }).error, /okunamadı/);
  const { data } = validateSavedCart({ name: "  Haftalık   alışverişim ", items: [{ productId: A, quantity: 2 }, { productId: A, quantity: 30 }, { productId: B, quantity: 1 }] });
  assert.equal(data.name, "Haftalık alışverişim");
  assert.deepEqual(data.items, [{ productId: A, quantity: 20 }, { productId: B, quantity: 1 }]);
});

test("the list shows current prices and marks products that are no longer available", async (t) => {
  catalog(t);
  let filter;
  t.mock.method(SavedCart, "find", (query) => { filter = query; return chain([{ _id: "507f191e810c19729de8a001", name: "Haftalık", updatedAt: new Date("2026-10-06T10:00:00Z"), items: [{ product: A, name: "Süt", quantity: 2 }, { product: B, name: "Ekmek", quantity: 1 }, { product: GONE, name: "Eski ürün", quantity: 1 }] }]); });
  const res = response(); await listSavedCarts(req({}), res);
  assert.equal(filter.user, USER); // yalnızca kendi sepetleri
  const [cart] = res.body.carts;
  assert.equal(cart.total, 80);
  assert.equal(cart.availableCount, 1);
  assert.deepEqual(cart.items.map((item) => [item.name, item.available, item.price]), [["Süt 1 L", true, 40], ["Ekmek", false, null], ["Eski ürün", false, null]]);
});

test("saving creates a cart, the same name replaces it, and the limit is enforced", async (t) => {
  catalog(t);
  const existing = [];
  t.mock.method(SavedCart, "find", () => chain(existing));
  let created; let updated;
  t.mock.method(SavedCart, "create", async (doc) => { created = doc; return { toObject: () => ({ _id: "507f191e810c19729de8a002", ...doc, updatedAt: new Date() }) }; });
  t.mock.method(SavedCart, "findOneAndUpdate", (query, update) => { updated = { query, update }; return { lean: async () => ({ _id: query._id, name: update.$set.name, items: update.$set.items, updatedAt: new Date() }) }; });

  let res = response(); await saveSavedCart(req({ name: "Haftalık", items: [{ productId: A, quantity: 2 }, { productId: GONE, quantity: 1 }] }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(String(created.user), USER);
  assert.equal(created.items.length, 1); // katalogda olmayan ürün kaydedilmez
  assert.equal(created.items[0].name, "Süt 1 L");
  assert.equal(res.body.cart.total, 80);

  existing.push({ _id: "507f191e810c19729de8a002", name: "Haftalık" });
  res = response(); await saveSavedCart(req({ name: "haftalık", items: [{ productId: A, quantity: 1 }] }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.replaced, true);
  assert.equal(updated.query.user, USER);

  while (existing.length < MAX_SAVED_CARTS) existing.push({ _id: `x${existing.length}`, name: `Sepet ${existing.length}` });
  res = response(); await saveSavedCart(req({ name: "Yeni sepet", items: [{ productId: A, quantity: 1 }] }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /En fazla 10/);

  Product.find.mock.mockImplementation(() => chain([]));
  res = response(); await saveSavedCart(req({ name: "Haftalık", items: [{ productId: GONE, quantity: 1 }] }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /satışta olmadığı/);
});

test("customers can only delete their own saved carts", async (t) => {
  let query;
  SavedCart.deleteOne ||= async () => ({});
  const remove = t.mock.method(SavedCart, "deleteOne", async (filter) => { query = filter; return { deletedCount: 1 }; });
  let res = response(); await deleteSavedCart(req({}, { id: "507f191e810c19729de8a002" }), res);
  assert.equal(res.body.success, true);
  assert.equal(query.user, USER);
  remove.mock.mockImplementation(async () => ({ deletedCount: 0 }));
  res = response(); await deleteSavedCart(req({}, { id: "507f191e810c19729de8a002" }), res);
  assert.equal(res.statusCode, 404);
  res = response(); await deleteSavedCart(req({}, { id: "abc" }), res);
  assert.equal(res.statusCode, 400);
});
