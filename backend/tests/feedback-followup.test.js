import test from "node:test";
import assert from "node:assert/strict";
import Feedback from "../models/feedback.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import {
  getOrderFeedbackPrompt, resolveProblemItems, submitAbandonReason, submitNps, submitQuickFeedback, validateOrderFeedback, validateQuickFeedback,
} from "../controllers/orderFeedback.controller.js";
import { buildSatisfactionReport, npsOf, weekStart } from "../controllers/feedbackReport.controller.js";
import { replyToFeedback } from "../controllers/feedback.controller.js";
import { normalizeCancelReason } from "../controllers/ordersAnalytics.controller.js";
import { buildFeedbackSummary, needsSupport, suggestCompensation, validateCompensation } from "../services/feedbackFollowUp.service.js";

const USER = "507f191e810c19729de860ea";
const ORDER = "507f191e810c19729de860ab";
const MILK = "507f191e810c19729de86011";
const BREAD = "507f191e810c19729de86012";
const chain = (value) => ({ select() { return this; }, sort() { return this; }, populate() { return this; }, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const request_ = (body, emitted = []) => ({ body, user: { _id: USER, name: "Ayşe" }, app: { get: () => ({ to: () => ({ emit: (event, payload) => emitted.push([event, payload]) }) }) } });
const ORDER_DOC = { _id: ORDER, status: "Teslim Edildi", deliveryPoint: "girlsDorm", products: [{ product: MILK, name: "Süt 1 L" }, { product: BREAD, name: "Ekmek" }] };

test("the new survey requires a comment at every rating and validates the delivery rating", () => {
  assert.match(validateOrderFeedback({ rating: 5, milestone: 3, deliveryRating: 5 }).error, /birkaç kelimeyle/);
  assert.match(validateOrderFeedback({ rating: 5, milestone: 3, deliveryRating: 9, comment: "Çok iyiydi" }).error, /teslimata/);
  const { data } = validateOrderFeedback({ rating: 5, milestone: 3, deliveryRating: 4, comment: "Çok iyiydi" });
  assert.equal(data.deliveryRating, 4);
  // Eski uygulama sürümü (teslimat puanı göndermez): yüksek puanda yorum isteğe bağlı kalır
  assert.ok(validateOrderFeedback({ rating: 5, milestone: 1 }).data);
});

test("problem items are only accepted for products in the customer's order", () => {
  const items = resolveProblemItems([
    { productId: MILK, issue: "bozuk" },
    { productId: MILK, issue: "bozuk" },
    { productId: "507f191e810c19729de86099", issue: "eksik" },
    { name: "Ekmek", issue: "eksik" },
    { productId: BREAD, issue: "patladi" },
  ], ORDER_DOC);
  assert.deepEqual(items, [{ product: MILK, name: "Süt 1 L", issue: "bozuk" }, { product: BREAD, name: "Ekmek", issue: "eksik" }]);
  assert.deepEqual(resolveProblemItems([{ productId: MILK, issue: "bozuk" }], null), []);
});

test("quick feedback: thumbs up is one tap, thumbs down needs a reason", () => {
  assert.match(validateQuickFeedback({ orderId: ORDER }).error, /👍/);
  assert.ok(validateQuickFeedback({ thumb: "up", orderId: ORDER }).data);
  assert.match(validateQuickFeedback({ thumb: "down", orderId: ORDER }).error, /Ne olduğunu/);
  assert.ok(validateQuickFeedback({ thumb: "down", orderId: ORDER, tags: ["gec"] }).data);
  assert.ok(validateQuickFeedback({ thumb: "down", orderId: ORDER, problemItems: [{ productId: MILK, issue: "bozuk" }] }).data);
  // Olumsuz yanıtta olumlu etiket kabul edilmez
  assert.deepEqual(validateQuickFeedback({ thumb: "down", orderId: ORDER, tags: ["hizli", "gec"] }).data.tags, ["gec"]);
});

test("a thumbs up is stored for a delivered order once, without opening support", async (t) => {
  const created = []; const emitted = [];
  t.mock.method(Order, "findOne", () => chain(ORDER_DOC));
  let answered = false;
  t.mock.method(Feedback, "exists", async () => answered);
  t.mock.method(Feedback, "create", async (doc) => { created.push(doc); return { _id: "507f191e810c19729de860ff", ...doc }; });
  t.mock.method(User, "findByIdAndUpdate", async () => ({}));
  let res = response();
  await submitQuickFeedback(request_({ thumb: "up", orderId: ORDER }, emitted), res);
  assert.equal(res.statusCode, 201);
  assert.equal(created[0].kind, "quick");
  assert.equal(created[0].thumb, "up");
  assert.equal(created[0].deliveryPoint, "girlsDorm");
  assert.equal(res.body.supportChatId, null);
  assert.equal(emitted.length, 0);
  answered = true;
  res = response(); await submitQuickFeedback(request_({ thumb: "up", orderId: ORDER }), res);
  assert.equal(res.statusCode, 409);
});

test("quick feedback is refused for an order that is not delivered", async (t) => {
  t.mock.method(Order, "findOne", () => chain({ ...ORDER_DOC, status: "Yolda" }));
  const res = response(); await submitQuickFeedback(request_({ thumb: "up", orderId: ORDER }), res);
  assert.equal(res.statusCode, 409);
});

test("NPS accepts 0-10 once a month; abandon reasons are deduplicated", async (t) => {
  let res = response(); await submitNps(request_({ score: 11 }), res); assert.equal(res.statusCode, 400);
  t.mock.method(Order, "countDocuments", async () => 4);
  t.mock.method(Feedback, "findOne", () => chain({ createdAt: new Date(Date.now() - 5 * 86400000) }));
  res = response(); await submitNps(request_({ score: 9 }), res); assert.equal(res.statusCode, 409);

  res = response(); await submitAbandonReason(request_({ reason: "uydurma" }), res); assert.equal(res.statusCode, 400);
  t.mock.method(Feedback, "exists", async () => true);
  res = response(); await submitAbandonReason(request_({ reason: "fiyat" }), res);
  assert.equal(res.body.skipped, true);
});

test("support is opened for low ratings, thumbs down and product problems", () => {
  assert.equal(needsSupport({ rating: 2 }), true);
  assert.equal(needsSupport({ rating: 3 }), false);
  assert.equal(needsSupport({ thumb: "down" }), true);
  assert.equal(needsSupport({ thumb: "up" }), false);
  assert.equal(needsSupport({ rating: 4, deliveryRating: 2 }), true);
  assert.equal(needsSupport({ rating: 5, problemItems: [{ name: "Süt" }] }), true);
  const summary = buildFeedbackSummary({ rating: 2, deliveryRating: 1, tags: ["gec"], problemItems: [{ name: "Süt", issue: "bozuk" }], comment: "Süt bozuk geldi" });
  assert.match(summary, /Ürün puanı 2\/5/);
  assert.match(summary, /Geç geldi/);
  assert.match(summary, /Süt \(Bozuk \/ ezik\)/);
});

test("compensation is suggested from the order total and limited", () => {
  assert.equal(suggestCompensation(0), 25);
  assert.equal(suggestCompensation(100), 20);
  assert.equal(suggestCompensation(300), 45);
  assert.equal(suggestCompensation(2000), 100);
  assert.match(validateCompensation({ amount: 5 }).error, /10–500/);
  assert.equal(validateCompensation({ amount: "40" }).amount, 40);
});

test("cancel reasons are limited to the known list", () => {
  assert.deepEqual(normalizeCancelReason({ reason: "gec", note: "  çok bekledim " }), { code: "gec", note: "çok bekledim" });
  assert.equal(normalizeCancelReason({ reason: "x" }), null);
  assert.equal(normalizeCancelReason({}), null);
});

test("the satisfaction report aggregates ratings, complaints, products, delivery points, NPS and reasons", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const at = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000);
  const report = buildSatisfactionReport({
    now,
    days: 28,
    feedbacks: [
      { kind: "order", milestone: 1, rating: 5, deliveryRating: 4, tags: ["hizli"], deliveryPoint: "girlsDorm", createdAt: at(1) },
      { kind: "order", milestone: 3, rating: 2, deliveryRating: 1, tags: ["gec", "bozuk"], deliveryPoint: "boysDorm", problemItems: [{ product: MILK, name: "Süt", issue: "bozuk" }], createdAt: at(2) },
      { kind: "quick", thumb: "down", tags: ["gec"], deliveryPoint: "boysDorm", problemItems: [{ product: MILK, name: "Süt", issue: "eksik" }], createdAt: at(3) },
      { kind: "quick", thumb: "up", deliveryPoint: "girlsDorm", createdAt: at(10) },
      { kind: "general", milestone: 15, rating: 4, createdAt: at(12) },
      { kind: "nps", npsScore: 10, createdAt: at(4) },
      { kind: "nps", npsScore: 3, createdAt: at(5) },
      { kind: "nps", npsScore: 9, createdAt: at(6) },
      { kind: "abandon", reason: "fiyat", createdAt: at(1) },
    ],
    cancelledOrders: [{ cancelReason: { code: "gec" } }, { cancelReason: { code: "gec" } }, { cancelReason: { code: "" } }],
  });
  assert.equal(report.totals.averageRating, 3.7);
  assert.equal(report.totals.averageDelivery, 2.5);
  assert.equal(report.totals.up, 1);
  assert.equal(report.totals.down, 1);
  assert.deepEqual(report.complaintTags.slice(0, 2).map((row) => [row.tag, row.count]), [["gec", 2], ["bozuk", 1]]);
  assert.deepEqual(report.byMilestone.map((row) => [row.milestone, row.averageRating]), [[1, 5], [3, 2], [15, 4]]);
  assert.equal(report.problemProducts[0].name, "Süt");
  assert.equal(report.problemProducts[0].count, 2);
  assert.equal(report.qualityAlerts.length, 1);
  const boys = report.byDeliveryPoint.find((row) => row.deliveryPoint === "boysDorm");
  assert.equal(boys.averageDelivery, 1);
  assert.equal(boys.lateComplaints, 2);
  assert.equal(report.nps.score, 33);
  assert.deepEqual(report.cancelReasons, [{ code: "gec", label: "Teslimat çok uzun sürecek", count: 2 }]);
  assert.equal(report.abandonReasons[0].label, "Fiyatlar yüksek");
  assert.equal(report.weekly.reduce((sum, week) => sum + week.ratingCount, 0), 3);
  assert.deepEqual(npsOf([]), { score: null, count: 0, promoters: 0, passives: 0, detractors: 0 });
  assert.equal(weekStart("2026-10-21T12:00:00.000Z"), "2026-10-19");
});

test("a new admin reply notifies the customer; saving the same text again does not", async (t) => {
  t.mock.method(AdminAudit, "create", async (doc) => doc);
  let pushLookups = 0;
  t.mock.method(User, "find", () => { pushLookups += 1; return chain([]); });
  t.mock.method(Feedback, "findById", () => chain({ _id: ORDER, status: "İnceleniyor", adminReply: { text: "Merhaba" }, user: USER }));
  t.mock.method(Feedback, "findByIdAndUpdate", (id, update) => chain({ _id: id, ...update, user: { _id: USER, name: "Ayşe" } }));
  const req = (text) => ({ params: { id: ORDER }, body: { text }, method: "PATCH", originalUrl: "/api/feedback/x/reply", user: { _id: USER, role: "admin" } });
  await replyToFeedback(req("Merhaba"), response());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pushLookups, 0);
  await replyToFeedback(req("Siparişiniz için üzgünüz, kupon tanımladık."), response());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pushLookups, 1);
});

test("the prompt offers the quick question for a recent delivered order and NPS monthly", async (t) => {
  const order = { _id: ORDER, createdAt: new Date(), deliveryPointName: "Erkek KYK", totalAmount: 90, products: [{ product: MILK, name: "Süt", quantity: 1 }] };
  t.mock.method(Order, "countDocuments", async () => 7);
  t.mock.method(Feedback, "find", () => chain([{ milestone: 5 }]));
  t.mock.method(Order, "findOne", () => chain(order));
  t.mock.method(Feedback, "exists", async () => null);
  t.mock.method(Feedback, "findOne", () => chain(null));
  const res = response();
  await getOrderFeedbackPrompt({ user: { _id: USER } }, res);
  assert.equal(res.body.prompt, null);
  assert.equal(res.body.quick.orderId, ORDER);
  assert.equal(res.body.quick.shortId, ORDER.slice(-6).toUpperCase());
  assert.equal(res.body.quick.products[0].name, "Süt");
  assert.equal(res.body.nps, true);
});

test("a thumbs down opens a high-priority support conversation with the customer's summary", async (t) => {
  const { default: Chat } = await import("../models/chat.model.js");
  const { default: Message } = await import("../models/message.model.js");
  const { default: SupportRequest } = await import("../models/supportRequest.model.js");
  const CHAT = "507f191e810c19729de86077";
  const emitted = []; const messages = []; let request;
  t.mock.method(Order, "findOne", () => chain(ORDER_DOC));
  t.mock.method(Feedback, "exists", async () => null);
  t.mock.method(Feedback, "create", async (doc) => ({ _id: "507f191e810c19729de860ff", ...doc }));
  let linked;
  t.mock.method(Feedback, "updateOne", async (filter, update) => { linked = update; return {}; });
  t.mock.method(User, "findByIdAndUpdate", async () => ({}));
  t.mock.method(User, "findById", () => chain({ name: "Ayşe" }));
  t.mock.method(Chat, "findOne", async () => null);
  t.mock.method(Chat, "create", async (doc) => ({ _id: CHAT, ...doc }));
  t.mock.method(Chat, "updateOne", async () => ({}));
  t.mock.method(Chat, "findOneAndUpdate", async () => ({ _id: CHAT, user: USER, mode: "WAITING_FOR_AGENT" }));
  t.mock.method(Message, "create", async (doc) => { messages.push(doc); return { ...doc, createdAt: new Date() }; });
  t.mock.method(SupportRequest, "findOneAndUpdate", async (filter, update) => { request = update.$setOnInsert; return { _id: "507f191e810c19729de86088", createdAt: new Date() }; });
  const res = response();
  await submitQuickFeedback(request_({ thumb: "down", orderId: ORDER, tags: ["gec"], problemItems: [{ productId: MILK, issue: "bozuk" }] }, emitted), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.supportChatId, CHAT);
  assert.equal(String(linked.$set.supportChat), CHAT);
  assert.equal(request.priority, "high");
  assert.match(request.aiSummary, /Süt 1 L \(Bozuk \/ ezik\)/);
  assert.match(messages[0].content, /Geç geldi/);
  assert.equal(messages[0].sender, "user");
  assert.ok(emitted.some(([event]) => event === "lowFeedbackCreated"));
  assert.ok(emitted.some(([event]) => event === "SupportRequestCreated"));
});
