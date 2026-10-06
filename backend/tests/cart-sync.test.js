import test from "node:test";
import assert from "node:assert/strict";
import { applyCartSync, normalizeSyncedCart } from "../services/cartSync.service.js";

const A = "507f191e810c19729de8b001"; const B = "507f191e810c19729de8b002";
const user = (cartItems) => { const doc = { cartItems, cartLastUpdated: new Date("2026-10-01T00:00:00Z"), saves: 0, async save() { doc.saves += 1; } }; return doc; };

test("synced cart input is cleaned and duplicate products are merged", () => {
  assert.equal(normalizeSyncedCart("x"), null);
  assert.equal(normalizeSyncedCart(undefined), null);
  assert.deepEqual(normalizeSyncedCart([]), []);
  assert.deepEqual(normalizeSyncedCart([{ productId: A, quantity: 2 }, { productId: A, quantity: 1 }, { productId: "bozuk", quantity: 1 }, { productId: B, quantity: 0 }, { productId: B, quantity: 500 }]),
    [{ productId: A, quantity: 3 }, { productId: B, quantity: 99 }]);
});

test("the server cart follows the phone cart and only changes when the content changes", async () => {
  const doc = user([]);
  assert.equal(await applyCartSync(doc, normalizeSyncedCart([{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }])), true);
  assert.equal(doc.saves, 1);
  assert.deepEqual(doc.cartItems.map((item) => [item.product, item.quantity]), [[A, 2], [B, 1]]);
  const stamped = doc.cartLastUpdated;
  assert.ok(stamped > new Date("2026-10-01T00:00:00Z"));

  // Aynı sepet yeniden gönderilirse (uygulama her açılışta gönderir) hatırlatma süresi sıfırlanmaz
  assert.equal(await applyCartSync(doc, normalizeSyncedCart([{ productId: B, quantity: 1 }, { productId: A, quantity: 2 }])), false);
  assert.equal(doc.saves, 1);
  assert.equal(doc.cartLastUpdated, stamped);

  // Sepet boşaltılınca sunucudaki sepet de boşalır
  assert.equal(await applyCartSync(doc, []), true);
  assert.deepEqual(doc.cartItems, []);
});
