import test from "node:test";
import assert from "node:assert/strict";
import Feedback from "../models/feedback.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import { getOrderFeedbackPrompt, pickMilestone, submitOrderFeedback, validateOrderFeedback } from "../controllers/orderFeedback.controller.js";

const USER = "507f191e810c19729de860ea";
const ORDER = "507f191e810c19729de860ab";
const chain = (value) => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const request = (body, emitted = []) => ({ body, user: { _id: USER, name: "Ayşe" }, app: { get: () => ({ to: () => ({ emit: (event, payload) => emitted.push([event, payload]) }) }) } });
const mockState = (t, { delivered, answered = [] }) => {
  t.mock.method(Order, "countDocuments", async (filter) => { assert.deepEqual(filter, { user: USER, status: "Teslim Edildi" }); return delivered; });
  t.mock.method(Feedback, "find", () => chain(answered.map((milestone) => ({ milestone }))));
};

test("the survey is asked at the 1st, 3rd and 5th delivered order, once each", () => {
  assert.equal(pickMilestone(0), null);
  assert.equal(pickMilestone(1), 1);
  assert.equal(pickMilestone(2, [1]), null);
  assert.equal(pickMilestone(3, [1]), 3);
  assert.equal(pickMilestone(4, [3]), null);
  assert.equal(pickMilestone(5, [1, 3]), 5);
  assert.equal(pickMilestone(40, [5]), null);
  // Eski 15. sipariş anketini yanıtlamış müşteriye tekrar sorulmaz
  assert.equal(pickMilestone(22, [15]), null);
  // Eski müşteri: atlanan küçük taşlar yeniden sorulmaz, yalnızca ulaştığı en büyük taş sorulur
  assert.equal(pickMilestone(4), 3);
  assert.equal(pickMilestone(9), 5);
});

test("a rating is required and low ratings require a comment", () => {
  assert.match(validateOrderFeedback({ milestone: 1 }).error, /puan/);
  assert.match(validateOrderFeedback({ rating: 6, milestone: 1 }).error, /puan/);
  assert.match(validateOrderFeedback({ rating: 5, milestone: 2 }).error, /anket/);
  assert.match(validateOrderFeedback({ rating: 3, milestone: 1, comment: "  " }).error, /yazar mısınız/);
  assert.ok(validateOrderFeedback({ rating: 3, milestone: 1, comment: "Geç geldi." }).data);
  const { data } = validateOrderFeedback({ rating: 5, milestone: 5, tags: ["hizli", "hizli", "uydurma", "taze"], orderId: "abc" });
  assert.deepEqual(data, { rating: 5, milestone: 5, tags: ["hizli", "taze"], comment: "", orderId: null });
});

test("the prompt endpoint reports the due milestone with the latest delivered order", async (t) => {
  mockState(t, { delivered: 3, answered: [1] });
  const order = { _id: ORDER, createdAt: "2026-10-20T10:00:00.000Z", totalAmount: 120, deliveryPointName: "Kız KYK", products: [{ product: "507f191e810c19729de86011", name: "Süt", quantity: 2, image: "s.jpg" }] };
  t.mock.method(Order, "findOne", () => chain(order));
  t.mock.method(Feedback, "exists", async () => true);
  t.mock.method(Feedback, "findOne", () => chain({ createdAt: new Date() }));
  let res = response(); await getOrderFeedbackPrompt({ user: { _id: USER } }, res);
  assert.equal(res.body.prompt.milestone, 3);
  assert.equal(res.body.prompt.orderId, ORDER);
  assert.deepEqual(res.body.prompt.order.products, [{ productId: "507f191e810c19729de86011", name: "Süt", image: "s.jpg", quantity: 2 }]);
  // Son sipariş zaten değerlendirildi → hızlı soru yok; tavsiye sorusu yakın zamanda yanıtlandı → yok
  assert.equal(res.body.quick, null);
  assert.equal(res.body.nps, false);
});

test("a submitted survey is stored for the authenticated user only", async (t) => {
  mockState(t, { delivered: 1 });
  let orderFilter; const created = []; const emitted = [];
  t.mock.method(Order, "findOne", (filter) => { orderFilter = filter; return chain({ _id: ORDER }); });
  t.mock.method(Feedback, "create", async (doc) => { created.push(doc); return { _id: "507f191e810c19729de860ff", ...doc }; });
  t.mock.method(User, "findByIdAndUpdate", async () => ({}));
  const res = response();
  await submitOrderFeedback(request({ rating: 5, milestone: 1, tags: ["hizli", "kurye"], orderId: ORDER, user: "baskasi", status: "Çözüldü" }, emitted), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(orderFilter, { _id: ORDER, user: USER });
  assert.equal(created[0].user, USER);
  assert.equal(created[0].message, "Hızlı geldi, Kurye nazikti");
  assert.equal(created[0].category, "Genel");
  assert.equal(created[0].status, undefined);
  assert.equal(emitted.length, 0);
});

test("low ratings are filed as complaints and announced to admins; repeats are rejected", async (t) => {
  mockState(t, { delivered: 5, answered: [1, 3] });
  const created = []; const emitted = [];
  t.mock.method(Feedback, "create", async (doc) => { created.push(doc); return { _id: "507f191e810c19729de860ff", ...doc }; });
  t.mock.method(User, "findByIdAndUpdate", async () => ({}));
  let res = response(); await submitOrderFeedback(request({ rating: 3, milestone: 5, comment: "Süt eksik geldi." }, emitted), res);
  assert.equal(res.statusCode, 201);
  assert.equal(created[0].category, "Şikayet");
  assert.equal(created[0].message, "Süt eksik geldi.");
  assert.equal(emitted[0][0], "lowFeedbackCreated");
  // Aynı taş ikinci kez ya da henüz ulaşılmamış taş gönderilemez
  res = response(); await submitOrderFeedback(request({ rating: 5, milestone: 3 }), res); assert.equal(res.statusCode, 409);
  res = response(); await submitOrderFeedback(request({ rating: 5, milestone: 1 }), res); assert.equal(res.statusCode, 409);
  assert.equal(created.length, 1);
});
