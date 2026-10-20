import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import AdminAudit from "../models/adminAudit.model.js";
import Product from "../models/product.model.js";
import { auditFallback, describeRequest, diffFields, money, recordAdminAction } from "../services/adminAudit.service.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { toggleOutOfStock, updateProductPrice, updateProductDiscount } from "../controllers/product.controller.js";
import { buildAuditQuery } from "../routes/ordersAnalytics.route.js";

const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const captureWrites = (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  return writes;
};
const fakeRes = (statusCode = 200) => {
  const res = new EventEmitter();
  Object.assign(res, {
    statusCode, headers: {}, body: null,
    setHeader(k, v) { res.headers[k] = v; },
    status(code) { res.statusCode = code; return res; },
    json(body) { res.body = body; res.emit("finish"); return res; },
  });
  return res;
};
const productDoc = (fields) => ({ _id: "507f191e810c19729de8c001", name: "Pınar Süt 1 L", price: 40, isDiscounted: false, discountedPrice: null, isOutOfStock: false, async save() { return this; }, ...fields });

test("recordAdminAction stores what changed and marks the request", async (t) => {
  const writes = captureWrites(t);
  const req = { user: ADMIN, method: "PUT", originalUrl: "/api/products/update-price/x?y=1" };
  recordAdminAction(req, { action: "Fiyat değiştirildi", category: "product", target: "x", targetName: "Süt", changes: [{ label: "Fiyat", from: money(40), to: money(45.5) }] });
  await tick();
  assert.equal(req.auditRecorded, true);
  assert.equal(writes[0].summary, "PUT /api/products/update-price/x");
  assert.deepEqual(writes[0].changes, [{ label: "Fiyat", from: "₺40,00", to: "₺45,50" }]);
  recordAdminAction({ method: "PUT", originalUrl: "/" }, { action: "x" }); // oturum yoksa yazılmaz
  assert.equal(writes.length, 1);
});

test("diffFields lists only changed fields with formatting", () => {
  const changes = diffFields({ name: "Süt", price: 40, isHidden: false }, { name: "Süt 1 L", price: 40, isHidden: true }, [
    { key: "name", label: "Ad" }, { key: "price", label: "Fiyat", format: money }, { key: "isHidden", label: "Görünürlük", format: (v) => (v ? "Gizli" : "Görünür") },
  ]);
  assert.deepEqual(changes, [{ label: "Ad", from: "Süt", to: "Süt 1 L" }, { label: "Görünürlük", from: "Görünür", to: "Gizli" }]);
});

test("describeRequest names sections, verbs and ids", () => {
  assert.deepEqual(describeRequest("DELETE", "/api/coupons/507f191e810c19729de8c001"), { category: "campaign", action: "Kupon silme", target: "507f191e810c19729de8c001" });
  assert.equal(describeRequest("POST", "/api/banners").action, "Vitrin görseli işlemi");
  assert.equal(describeRequest("PUT", "/api/settings").category, "settings");
  assert.equal(describeRequest("PATCH", "/api/coupon-requests/admin/x/activate").action, "Kupon isteği kampanyası değişikliği (admin / x / activate)");
});

test("fallback logs any successful admin change once; skips customers, reads, failures and noisy paths", async (t) => {
  const writes = captureWrites(t);
  const run = async (req, statusCode = 200) => {
    const res = fakeRes(statusCode);
    await new Promise((resolve) => auditFallback(req, res, resolve));
    res.emit("finish");
    await tick();
  };
  await run({ method: "POST", originalUrl: "/api/coupons", user: ADMIN });
  await run({ method: "GET", originalUrl: "/api/coupons", user: ADMIN });
  await run({ method: "POST", originalUrl: "/api/coupons", user: { _id: "u", role: "customer" } });
  await run({ method: "POST", originalUrl: "/api/coupons", user: ADMIN }, 400);
  await run({ method: "POST", originalUrl: "/api/chat/send", user: ADMIN });
  await run({ method: "POST", originalUrl: "/api/coupons", user: ADMIN, auditRecorded: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, "Kupon işlemi");
  assert.equal(writes[0].category, "campaign");
});

test("route-level audit is skipped when the controller already wrote a detailed entry", async (t) => {
  const writes = captureWrites(t);
  const req = { method: "PUT", originalUrl: "/api/settings", user: ADMIN, auditRecorded: true };
  const res = fakeRes();
  auditAdminAction("Ayar değişikliği", "Mağaza ayarları")(req, res, () => {});
  res.emit("finish");
  await tick();
  assert.equal(writes.length, 0);
  const req2 = { method: "PUT", originalUrl: "/api/settings", user: ADMIN };
  const res2 = fakeRes();
  auditAdminAction("Ayar değişikliği", "Mağaza ayarları")(req2, res2, () => {});
  res2.emit("finish");
  await tick();
  assert.equal(writes[0].category, "settings");
  assert.equal(req2.auditRecorded, true);
});

test("product actions are logged with before → after values", async (t) => {
  const writes = captureWrites(t);
  t.mock.method(Product, "findById", async () => productDoc());
  await toggleOutOfStock({ params: { id: "x" }, user: ADMIN, method: "PATCH", originalUrl: "/api/products/toggle-out-of-stock/x" }, fakeRes());
  assert.equal(writes[0].action, "Tükendi olarak işaretlendi");
  assert.deepEqual(writes[0].changes, [{ label: "Stok", from: "Stokta", to: "Tükendi" }]);
  assert.equal(writes[0].targetName, "Pınar Süt 1 L");

  t.mock.method(Product, "findById", async () => productDoc({ isDiscounted: true, discountedPrice: 38 }));
  await updateProductPrice({ params: { id: "x" }, body: { price: 35 }, user: ADMIN, method: "PUT", originalUrl: "/api/products/update-price/x" }, fakeRes());
  assert.equal(writes[1].action, "Fiyat değiştirildi");
  assert.deepEqual(writes[1].changes[0], { label: "Fiyat", from: "₺40,00", to: "₺35,00" });
  assert.match(writes[1].changes[1].to, /Kaldırıldı/);

  t.mock.method(Product, "findById", async () => productDoc());
  await updateProductDiscount({ params: { id: "x" }, body: { discountedPrice: 30 }, user: ADMIN, method: "PATCH", originalUrl: "/api/products/x/discount" }, fakeRes());
  assert.deepEqual(writes[2].changes[0], { label: "İndirimli fiyat", from: "İndirim yok", to: "₺30,00 (%25)" });
});

test("audit list query: category, product, search (escaped) and paging", () => {
  const { filter, limit } = buildAuditQuery({ category: "product", target: "abc", q: "süt (1 L)", before: "2026-10-16T10:00:00Z", limit: "999" });
  assert.equal(filter.category, "product");
  assert.equal(filter.target, "abc");
  assert.equal(filter.$or[0].action.test("Pınar süt (1 L) fiyatı"), true);
  assert.equal(filter.createdAt.$lt.toISOString(), "2026-10-16T10:00:00.000Z");
  assert.equal(limit, 200);
  assert.equal(buildAuditQuery({ category: "hack" }).filter.category, undefined);
});
