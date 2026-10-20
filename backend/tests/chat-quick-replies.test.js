// Mesajlar ekranı: müşteri kartı uç noktası (GET /chat/:chatId/context).
// Hızlı cevap şablonları tarayıcıda saklanır; bu dosya ekranın tek yeni backend ucunu test eder.
import test from "node:test";
import assert from "node:assert/strict";
import Chat from "../models/chat.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import { getChatContext } from "../controllers/chat.controller.js";

const chatId = "507f191e810c19729de860eb";
const userId = "507f191e810c19729de860ea";
const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};
const chain = (result, calls = {}) => {
  const c = {
    select: (f) => { calls.select = f; return c; },
    sort: (s) => { calls.sort = s; return c; },
    populate: (p, f) => { calls.populate = [p, f]; return c; },
    lean: async () => result,
  };
  return c;
};

test("chat context returns customer, order summary and support request", async (t) => {
  const orderCalls = {};
  t.mock.method(Chat, "findById", () => chain({ _id: chatId, user: userId, status: "active", mode: "HUMAN" }));
  t.mock.method(User, "findById", () => chain({ _id: userId, name: "Ayşe Yılmaz", email: "ayse@x.com", phone: "05551112233" }));
  t.mock.method(Order, "countDocuments", async (filter) => { orderCalls.countFilter = filter; return 7; });
  t.mock.method(Order, "findOne", (filter) => { orderCalls.findFilter = filter; return chain({
    _id: "o1", totalAmount: 240, status: "Yolda", createdAt: new Date("2026-10-19T10:00:00Z"),
    products: [{ quantity: 2 }, { quantity: 3 }], deliveryPoint: "girlsDorm",
  }, orderCalls); });
  t.mock.method(SupportRequest, "findOne", () => chain({
    _id: "r1", status: "in_progress", priority: "high", reason: "İade", aiSummary: "Müşteri iade istiyor",
    assignedTo: { _id: "a1", name: "Deniz" }, createdAt: new Date("2026-10-19T09:00:00Z"), acceptedAt: new Date("2026-10-19T09:05:00Z"),
  }));
  const res = makeRes();
  await getChatContext({ params: { chatId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.customer.name, "Ayşe Yılmaz");
  assert.equal(res.body.orderCount, 7);
  assert.deepEqual(orderCalls.countFilter, { user: userId });
  assert.deepEqual(orderCalls.findFilter, { user: userId });
  assert.deepEqual(orderCalls.sort, { createdAt: -1 });
  assert.equal(res.body.lastOrder.productCount, 5);
  assert.equal(res.body.lastOrder.status, "Yolda");
  assert.equal(res.body.lastOrder.totalAmount, 240);
  assert.equal(res.body.supportRequest.assignedTo.name, "Deniz");
  assert.equal(res.body.supportRequest.priority, "high");
  // Modelin iç alanları (parola vb.) dışarı sızmaz: yalnızca seçilen alanlar istenir
  assert.ok(!("password" in res.body.customer));
});

test("chat context without orders or support request returns nulls", async (t) => {
  t.mock.method(Chat, "findById", () => chain({ _id: chatId, user: userId }));
  t.mock.method(User, "findById", () => chain({ _id: userId, name: "Misafir" }));
  t.mock.method(Order, "countDocuments", async () => 0);
  t.mock.method(Order, "findOne", () => chain(null));
  t.mock.method(SupportRequest, "findOne", () => chain(null));
  const res = makeRes();
  await getChatContext({ params: { chatId } }, res);
  assert.equal(res.body.orderCount, 0);
  assert.equal(res.body.lastOrder, null);
  assert.equal(res.body.supportRequest, null);
});

test("chat context 404s for an unknown chat", async (t) => {
  t.mock.method(Chat, "findById", () => chain(null));
  const res = makeRes();
  await getChatContext({ params: { chatId } }, res);
  assert.equal(res.statusCode, 404);
});
