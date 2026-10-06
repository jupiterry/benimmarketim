import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { normalizePreferences, sendPushToUsers } from "../services/push.service.js";
import { buildCartReminderFilter, checkAndSendCartReminders } from "../services/cartReminder.service.js";
import { buildAudienceFilter, sendBroadcast, updateNotificationPreferences } from "../controllers/notification.controller.js";

const chain = (value) => ({ select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
const id = (n) => `507f191e810c19729de86${String(n).padStart(3, "0")}`;
const withKeys = (t) => {
  const previous = { key: process.env.ONESIGNAL_REST_API_KEY, app: process.env.ONESIGNAL_APP_ID };
  process.env.ONESIGNAL_REST_API_KEY = "test-only"; process.env.ONESIGNAL_APP_ID = "app-test";
  t.after(() => {
    if (previous.key === undefined) delete process.env.ONESIGNAL_REST_API_KEY; else process.env.ONESIGNAL_REST_API_KEY = previous.key;
    if (previous.app === undefined) delete process.env.ONESIGNAL_APP_ID; else process.env.ONESIGNAL_APP_ID = previous.app;
  });
};
const mockFetch = (t) => { const calls = []; t.mock.method(globalThis, "fetch", async (_url, options) => { calls.push(JSON.parse(options.body)); return { ok: true, status: 200 }; }); return calls; };
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };

test("preferences default to enabled and only explicit false disables a category", () => {
  assert.deepEqual(normalizePreferences({}), { orders: true, messages: true, campaigns: true });
  assert.deepEqual(normalizePreferences({ notificationPreferences: { campaigns: false } }), { orders: true, messages: true, campaigns: false });
});

test("push honours the per-category preference in the user query", async (t) => {
  withKeys(t);
  let filter;
  t.mock.method(User, "find", (query) => { filter = query; return chain([{ _id: id(1) }]); });
  const calls = mockFetch(t);
  const result = await sendPushToUsers([id(1), id(1), null], { title: "a", body: "b" }, { type: "x", route: "/chat/" + id(9), n: 3 }, { category: "messages", collapseId: "c1" });
  assert.deepEqual(result, { targeted: 1, sent: true });
  assert.deepEqual(filter._id.$in, [id(1)]);
  assert.deepEqual(filter["notificationPreferences.messages"], { $ne: false });
  assert.deepEqual(filter.pushNotificationsEnabled, { $ne: false });
  assert.deepEqual(calls[0].data, { type: "x", route: "/chat/" + id(9), n: "3" });
  assert.equal(calls[0].collapse_id, "c1");
});

test("unknown in-app routes are stripped and large audiences are batched", async (t) => {
  withKeys(t);
  const users = Array.from({ length: 2500 }, (_, index) => ({ _id: `u${index}` }));
  t.mock.method(User, "find", () => chain(users));
  const calls = mockFetch(t);
  const result = await sendPushToUsers(users.map((user) => user._id), { title: "a", body: "b" }, { route: "https://evil.example" }, { category: "campaigns" });
  assert.equal(result.targeted, 2500);
  assert.deepEqual(calls.map((call) => call.include_aliases.external_id.length), [2000, 500]);
  assert.equal(calls[0].data.route, undefined);
});

test("nothing is sent without keys, without recipients, or for an invalid category", async (t) => {
  const calls = mockFetch(t);
  t.mock.method(console, "error", () => {});
  t.mock.method(User, "find", () => chain([{ _id: id(1), fcmToken: null }]));
  assert.equal((await sendPushToUsers([id(1)], { title: "a", body: "b" })).sent, false);
  withKeys(t);
  assert.equal((await sendPushToUsers([], { title: "a", body: "b" })).targeted, 0);
  assert.equal((await sendPushToUsers([id(1)], { title: "a", body: "b" }, {}, { category: "spam" })).sent, false);
  assert.equal(calls.length, 0);
});

test("cart reminder filter sends once per cart and respects opt-outs", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const filter = buildCartReminderFilter(24, now);
  assert.equal(filter.cartLastUpdated.$lt.toISOString(), "2026-10-04T12:00:00.000Z");
  assert.equal(filter.cartLastUpdated.$gte.toISOString(), "2026-09-21T12:00:00.000Z");
  assert.deepEqual(filter["notificationPreferences.campaigns"], { $ne: false });
  assert.deepEqual(filter.$or[1], { $expr: { $lt: ["$cartReminderSentAt", "$cartLastUpdated"] } });
});

test("cart reminders stay silent at night and mark the cart as reminded", async (t) => {
  withKeys(t);
  const calls = mockFetch(t);
  t.mock.method(console, "log", () => {});
  const marked = [];
  t.mock.method(User, "updateOne", async (query, update) => { marked.push([query, update]); return {}; });
  t.mock.method(User, "find", (query) => chain(query._id ? [{ _id: id(1) }] : [
    { _id: id(1), cartItems: [{ quantity: 2, product: { name: "Süt" } }, { quantity: 1, product: { name: "Gizli", isHidden: true } }] },
    { _id: id(2), cartItems: [{ quantity: 1, product: null }] },
  ]));
  const night = await checkAndSendCartReminders(24, { respectQuietHours: true, now: new Date("2026-10-05T00:30:00Z") }); // İstanbul 03:30
  assert.equal(night.skipped, "quiet_hours");
  assert.equal(calls.length, 0);
  const now = new Date("2026-10-05T12:00:00Z");
  const day = await checkAndSendCartReminders(24, { respectQuietHours: true, now });
  assert.equal(day.successCount, 1);
  assert.match(calls[0].contents.tr, /Sepetinizde 2 ürün var \(Süt\)/);
  assert.equal(calls[0].data.route, "/cart");
  assert.deepEqual(marked, [[{ _id: id(1) }, { $set: { cartReminderSentAt: now } }]]);
});

test("audience filters never include admin accounts", async (t) => {
  Order.distinct ||= async () => [];
  t.mock.method(Order, "distinct", async (_field, query) => (query.createdAt ? [id(1)] : [id(1), id(2)]));
  assert.deepEqual(await buildAudienceFilter("all"), { role: { $ne: "admin" } });
  assert.deepEqual((await buildAudienceFilter("inactive30"))._id.$in, [id(2)]);
  assert.deepEqual((await buildAudienceFilter("active30"))._id.$in, [id(1)]);
  assert.equal((await buildAudienceFilter("cart")).role.$ne, "admin");
  assert.equal(await buildAudienceFilter("everyone-and-their-dog"), null);
});

test("broadcast validates input, blocks duplicates and records the send", async (t) => {
  withKeys(t);
  const calls = mockFetch(t);
  const req = (body) => ({ body, user: { _id: id(99) } });
  let res = response(); await sendBroadcast(req({ title: "", body: "x", audience: "all" }), res); assert.equal(res.statusCode, 400);
  res = response(); await sendBroadcast(req({ title: "t", body: "x".repeat(181), audience: "all" }), res); assert.equal(res.statusCode, 400);
  res = response(); await sendBroadcast(req({ title: "t", body: "b", audience: "nope" }), res); assert.equal(res.statusCode, 400);
  res = response(); await sendBroadcast(req({ title: "t", body: "b", audience: "all", target: "https://x" }), res); assert.equal(res.statusCode, 400);

  const duplicate = t.mock.method(PushBroadcast, "findOne", () => chain({ _id: "old" }));
  res = response(); await sendBroadcast(req({ title: "t", body: "b", audience: "all" }), res); assert.equal(res.statusCode, 409);
  assert.equal(calls.length, 0);

  duplicate.mock.mockImplementation(() => chain(null));
  let userFilter;
  t.mock.method(User, "find", (query) => { userFilter ||= query; return chain([{ _id: id(1) }, { _id: id(2) }]); });
  const created = []; const updates = [];
  t.mock.method(PushBroadcast, "create", async (doc) => { created.push(doc); return { _id: id(50), ...doc }; });
  t.mock.method(PushBroadcast, "updateOne", async (_query, update) => { updates.push(update); return {}; });
  res = response(); await sendBroadcast(req({ title: " Haftanın fırsatı ", body: "Sütte %20 indirim", audience: "all", target: "cart" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.targeted, 2);
  assert.deepEqual(userFilter["notificationPreferences.campaigns"], { $ne: false });
  assert.equal(userFilter.role.$ne, "admin");
  assert.equal(created[0].title, "Haftanın fırsatı");
  assert.equal(calls[0].data.route, "/cart");
  assert.deepEqual(updates[0], { $set: { targetedCount: 2, sent: true } });
});

test("broadcast refuses to run when the push service is not configured", async () => {
  const res = response();
  await sendBroadcast({ body: { title: "t", body: "b", audience: "all" }, user: { _id: id(99) } }, res);
  assert.equal(res.statusCode, 503);
});

test("customers can only set boolean values for known preference categories", async (t) => {
  let update;
  t.mock.method(User, "findByIdAndUpdate", (_id, change) => { update = change; return chain({ notificationPreferences: { campaigns: false } }); });
  let res = response(); await updateNotificationPreferences({ body: { campaigns: "no" }, user: { _id: id(1) } }, res); assert.equal(res.statusCode, 400);
  res = response(); await updateNotificationPreferences({ body: { role: "admin" }, user: { _id: id(1) } }, res); assert.equal(res.statusCode, 400);
  res = response(); await updateNotificationPreferences({ body: { campaigns: false, role: "admin" }, user: { _id: id(1) } }, res);
  assert.deepEqual(update, { $set: { "notificationPreferences.campaigns": false } });
  assert.deepEqual(res.body.preferences, { orders: true, messages: true, campaigns: false });
});
