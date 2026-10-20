import test from "node:test";
import assert from "node:assert/strict";
import AdminAudit from "../models/adminAudit.model.js";
import Feedback from "../models/feedback.model.js";
import Order from "../models/order.model.js";
import { getFeedbackOrder, replyToFeedback, summarizeOrder, validateAdminReply } from "../controllers/feedback.controller.js";

const ADMIN = "507f191e810c19729de860ea";
const FEEDBACK = "507f191e810c19729de860ab";
const ORDER = "507f191e810c19729de860cd";
const chain = (value) => ({ select() { return this; }, populate() { return this; }, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const request = (params, body = {}) => ({ params, body, method: "PATCH", originalUrl: `/api/feedback/${params.id}/reply`, user: { _id: ADMIN, role: "admin" } });
const captureWrites = (t) => { const writes = []; t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; }); return writes; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("reply text is trimmed, empty removes the reply, too long is refused", () => {
  assert.equal(validateAdminReply({ text: "  Teşekkürler  " }).text, "Teşekkürler");
  assert.equal(validateAdminReply({}).text, "");
  assert.match(validateAdminReply({ text: "a".repeat(1001) }).error, /1000/);
});

test("replying stores adminReply, moves a new record to İnceleniyor and writes an audit entry", async (t) => {
  const writes = captureWrites(t);
  t.mock.method(Feedback, "findById", () => chain({ _id: FEEDBACK, status: "Yeni", adminReply: { text: "" }, title: "1. sipariş deneyimi" }));
  let captured;
  t.mock.method(Feedback, "findByIdAndUpdate", (id, update) => { captured = { id, update }; return chain({ _id: id, ...update, user: { name: "Ayşe" } }); });
  const res = response();
  await replyToFeedback(request({ id: FEEDBACK }, { text: "Üzgünüz, bir sonraki siparişinizde telafi edeceğiz." }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(captured.id, FEEDBACK);
  assert.equal(captured.update.adminReply.text, "Üzgünüz, bir sonraki siparişinizde telafi edeceğiz.");
  assert.equal(String(captured.update.adminReply.by), ADMIN);
  assert.ok(captured.update.adminReply.at instanceof Date);
  assert.equal(captured.update.status, "İnceleniyor");
  assert.equal(res.body.adminReply.text, captured.update.adminReply.text);
  await tick();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, "Geri bildirim yanıtlandı");
  assert.equal(writes[0].category, "customer");
  assert.equal(writes[0].targetName, "Ayşe");
  assert.deepEqual(writes[0].changes.map((c) => c.label), ["Yanıt", "Durum"]);
});

test("a resolved record keeps its status; empty text clears the reply", async (t) => {
  captureWrites(t);
  t.mock.method(Feedback, "findById", () => chain({ _id: FEEDBACK, status: "Çözüldü", adminReply: { text: "Eski yanıt" } }));
  let captured;
  t.mock.method(Feedback, "findByIdAndUpdate", (id, update) => { captured = update; return chain({ _id: id, ...update }); });
  const res = response();
  await replyToFeedback(request({ id: FEEDBACK }, { text: "" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(captured.adminReply.text, "");
  assert.equal(captured.adminReply.by, null);
  assert.equal(captured.status, undefined);
});

test("invalid id and unknown record are refused without touching the database", async (t) => {
  captureWrites(t);
  const update = t.mock.method(Feedback, "findByIdAndUpdate", () => chain(null));
  const bad = response();
  await replyToFeedback(request({ id: "abc" }, { text: "x" }), bad);
  assert.equal(bad.statusCode, 400);
  t.mock.method(Feedback, "findById", () => chain(null));
  const missing = response();
  await replyToFeedback(request({ id: FEEDBACK }, { text: "x" }), missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(update.mock.callCount(), 0);
});

test("order summary is compact: item count, first 20 lines, no customer fields", () => {
  const products = Array.from({ length: 25 }, (_, i) => ({ name: `Ürün ${i}`, quantity: 2, price: 10, product: "x" }));
  const summary = summarizeOrder({ _id: ORDER, status: "Teslim Edildi", totalAmount: 500, products, phone: "0555", city: "Devrek" });
  assert.equal(summary.orderId, ORDER);
  assert.equal(summary.itemCount, 50);
  assert.equal(summary.products.length, 20);
  assert.deepEqual(Object.keys(summary.products[0]), ["name", "quantity", "price"]);
  assert.equal("phone" in summary, false);
  assert.equal(summarizeOrder(null), null);
});

test("GET /:id/order returns the linked order or 404 when there is none", async (t) => {
  t.mock.method(Feedback, "findById", () => chain({ _id: FEEDBACK, order: ORDER }));
  t.mock.method(Order, "findById", (id) => { assert.equal(id, ORDER); return chain({ _id: ORDER, status: "Yolda", totalAmount: 120, products: [{ name: "Süt", quantity: 3, price: 40 }], createdAt: new Date("2026-10-01") }); });
  const res = response();
  await getFeedbackOrder({ params: { id: FEEDBACK }, user: { _id: ADMIN } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "Yolda");
  assert.equal(res.body.itemCount, 3);

  t.mock.method(Feedback, "findById", () => chain({ _id: FEEDBACK, order: null }));
  const none = response();
  await getFeedbackOrder({ params: { id: FEEDBACK }, user: { _id: ADMIN } }, none);
  assert.equal(none.statusCode, 404);
});
