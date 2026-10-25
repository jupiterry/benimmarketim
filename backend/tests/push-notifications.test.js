import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import AutomationSettings from "../models/automationSettings.model.js";
import { normalizePreferences, sendPushToUsers } from "../services/push.service.js";
import { buildCartReminderFilter, checkAndSendCartReminders } from "../services/cartReminder.service.js";
import { buildAudienceFilter, describePushFailure, diagnosePush, sendBroadcast, updateNotificationPreferences } from "../controllers/notification.controller.js";

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
  assert.deepEqual(result, { targeted: 1, sent: true, reason: null, detail: "", unreachable: 0 });
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

test("a server error is reported as reason 'error', not as an opt-out (reason null)", async (t) => {
  withKeys(t);
  const calls = mockFetch(t);
  t.mock.method(console, "error", () => {});
  // Kullanıcı bildirimleri kapatmış: izinli kimse yok → reason null
  t.mock.method(User, "find", () => chain([]));
  const optedOut = await sendPushToUsers([id(1)], { title: "a", body: "b" }, {}, { category: "campaigns" });
  assert.equal(optedOut.sent, false);
  assert.equal(optedOut.reason, null);
  // Veritabanı zaman aşımı: geçici hata → reason "error" (otomasyon yeniden dener)
  t.mock.method(User, "find", () => { throw new Error("connection timed out"); });
  const failed = await sendPushToUsers([id(1)], { title: "a", body: "b" }, {}, { category: "campaigns" });
  assert.equal(failed.sent, false);
  assert.equal(failed.reason, "error");
  assert.equal(failed.detail, "connection timed out");
  assert.equal(calls.length, 0);
  assert.equal(describePushFailure(failed).status, 500);
  assert.match(describePushFailure(failed).message, /sunucu hatası/);
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
  assert.deepEqual(updates[0], { $set: { targetedCount: 2, sent: true, failureReason: null, unreachableCount: 0 } });
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

test("a push OneSignal could not deliver to any device is not reported as sent", async (t) => {
  withKeys(t);
  t.mock.method(User, "find", () => chain([{ _id: id(1) }]));
  // Kimlik hiçbir cihazda kayıtlı değilken OneSignal 200 ve boş id döner
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: async () => ({ id: "", errors: { invalid_aliases: { external_id: [id(1)] } } }) }));
  assert.equal((await sendPushToUsers([id(1)], { title: "a", body: "b" })).sent, false);
  fetchMock.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ id: "", errors: ["All included players are not subscribed"] }) }));
  assert.equal((await sendPushToUsers([id(1)], { title: "a", body: "b" })).sent, false);
  fetchMock.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ id: "9f1c" }) }));
  assert.equal((await sendPushToUsers([id(1)], { title: "a", body: "b" })).sent, true);
  // Gövdesi okunamayan başarılı yanıt eskisi gibi gönderilmiş sayılır
  fetchMock.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }));
  assert.equal((await sendPushToUsers([id(1)], { title: "a", body: "b" })).sent, true);
});

test("an undelivered cart reminder leaves the cart unreminded and is retried later", async (t) => {
  withKeys(t);
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: async () => ({ id: "", errors: { invalid_aliases: { external_id: [id(1)] } } }) }));
  const marked = [];
  t.mock.method(User, "updateOne", async (query, update) => { marked.push([query, update]); return {}; });
  t.mock.method(User, "find", (query) => chain(query._id ? [{ _id: id(1) }] : [{ _id: id(1), cartItems: [{ quantity: 1, product: { name: "Süt" } }] }]));
  const now = new Date("2026-10-05T12:00:00Z");
  const result = await checkAndSendCartReminders(24, { now });
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCount, 1);
  assert.deepEqual(marked, [[{ _id: id(1) }, { $set: { cartReminderTriedAt: now } }]]);
  // Ulaşmayan hatırlatma 12 saat geçmeden yeniden denenmez
  const retry = buildCartReminderFilter(24, now).$and[0].$or;
  assert.deepEqual(retry[0], { cartReminderTriedAt: null });
  assert.equal(retry[1].cartReminderTriedAt.$lt.toISOString(), "2026-10-05T00:00:00.000Z");
});

test("a failed broadcast tells the admin the real reason instead of a generic message", async (t) => {
  withKeys(t);
  t.mock.method(console, "error", () => {});
  t.mock.method(PushBroadcast, "findOne", () => chain(null));
  t.mock.method(User, "find", () => chain([{ _id: id(1) }, { _id: id(2) }]));
  t.mock.method(PushBroadcast, "create", async (doc) => ({ _id: id(50), ...doc }));
  const updates = [];
  t.mock.method(PushBroadcast, "updateOne", async (_query, update) => { updates.push(update.$set); return {}; });
  const send = async () => { const res = response(); await sendBroadcast({ body: { title: "t", body: "b", audience: "all" }, user: { _id: id(99) } }, res); return res; };

  // Kitledeki hiç kimsenin kayıtlı cihazı yok
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: async () => ({ id: "", errors: { invalid_aliases: { external_id: [id(1), id(2)] } } }) }));
  let res = await send();
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.reason, "no_devices");
  assert.match(res.body.message, /oturum açmamış/);
  assert.deepEqual(updates.at(-1), { targetedCount: 2, sent: false, failureReason: "no_devices", unreachableCount: 2 });

  // Anahtar reddedildi: diğer kimlik şemasıyla bir kez daha denenir, sonra neden bildirilir
  const schemes = [];
  fetchMock.mock.mockImplementation(async (_url, options) => { schemes.push(options.headers.Authorization.split(" ")[0]); return { ok: false, status: 401, json: async () => ({ errors: ["Access denied"] }) }; });
  res = await send();
  assert.deepEqual(schemes, ["Basic", "Key"]);
  assert.equal(res.statusCode, 502);
  assert.match(res.body.message, /anahtarı kabul edilmedi/);
  assert.doesNotMatch(res.body.message, /test-only/); // anahtar asla yanıtta yer almaz

  // İstek reddedildi ve bağlantı hatası
  fetchMock.mock.mockImplementation(async () => ({ ok: false, status: 400, json: async () => ({ errors: ["app_id not found"] }) }));
  res = await send();
  assert.match(res.body.message, /reddetti \(app_id not found\)/);
  fetchMock.mock.mockImplementation(async () => { throw new Error("getaddrinfo ENOTFOUND"); });
  res = await send();
  assert.equal(res.body.reason, "network");
  assert.match(res.body.message, /ulaşılamadı/);

  // Bir kısmına ulaşıldıysa başarılı sayılır ve ulaşılamayanlar bildirilir
  fetchMock.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ id: "n1", errors: { invalid_aliases: { external_id: [id(2)] } } }) }));
  res = await send();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "1 müşteriye gönderildi (1 müşterinin kayıtlı cihazı yok)");
  assert.equal(describePushFailure({ reason: "not_configured" }).status, 503);
});

test("new-style OneSignal keys use the Key scheme and a test push goes only to the sending admin", async (t) => {
  withKeys(t);
  process.env.ONESIGNAL_REST_API_KEY = "os_v2_app_test";
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => null })); // kayıtlı test alıcısı yok
  const sent = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => { sent.push({ auth: options.headers.Authorization, body: JSON.parse(options.body) }); return { ok: true, status: 200, json: async () => ({ id: "n1" }) }; });
  const duplicate = t.mock.method(PushBroadcast, "findOne", () => chain({ _id: "old" }));
  let query;
  t.mock.method(User, "find", (filter) => { query = filter; return chain([{ _id: id(99) }]); });
  const created = [];
  t.mock.method(PushBroadcast, "create", async (doc) => { created.push(doc); return { _id: id(51), ...doc }; });
  t.mock.method(PushBroadcast, "updateOne", async () => ({}));
  const res = response();
  await sendBroadcast({ body: { title: "Deneme", body: "Merhaba", audience: "self" }, user: { _id: id(99), name: "Deniz", email: "deniz@example.com" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Test bildirimi Deniz (deniz@example.com) hesabının telefonuna gönderildi");
  assert.equal(res.body.recipient.email, "deniz@example.com");
  assert.equal(duplicate.mock.callCount(), 0); // deneme, çift gönderim korumasına takılmaz
  assert.deepEqual(query._id.$in, [id(99)]);
  assert.equal(query["notificationPreferences.campaigns"], undefined); // denemede kampanya tercihi atlanır
  assert.deepEqual(query.pushNotificationsEnabled, { $ne: false });
  assert.deepEqual(sent[0].body.include_aliases.external_id, [id(99)]);
  assert.equal(sent[0].auth, "Key os_v2_app_test");
  assert.equal(created[0].audience, "self");
  assert.equal(created[0].testRecipient, id(99));
  assert.equal(created[0].sentBy, id(99));
});

test("push can skip the category preference for admin tests but never an account-wide opt-out", async (t) => {
  withKeys(t);
  let filter;
  t.mock.method(User, "find", (query) => { filter = query; return chain([{ _id: id(1) }]); });
  mockFetch(t);
  await sendPushToUsers([id(1)], { title: "a", body: "b" }, {}, { category: "campaigns", respectCategory: false });
  assert.equal(filter["notificationPreferences.campaigns"], undefined);
  assert.deepEqual(filter.pushNotificationsEnabled, { $ne: false });
  await sendPushToUsers([id(1)], { title: "a", body: "b" }, {}, { category: "campaigns" });
  assert.deepEqual(filter["notificationPreferences.campaigns"], { $ne: false });
});

test("a broadcast test goes to the chosen or saved test recipient and names that account", async (t) => {
  withKeys(t);
  const store = { _id: id(70), name: "Benim Marketim", email: "benimmarketim@gmail.com", appActivity: { lastSeenAt: new Date() }, notificationPreferences: { campaigns: false } };
  const other = { _id: id(72), name: "Ayşe", email: "ayse@example.com" };
  const muted = { _id: id(73), name: "Ali", email: "ali@example.com", pushNotificationsEnabled: false };
  const owner = { _id: id(99), name: "Jüpiter", email: "jupiterryhd@gmail.com", role: "admin" };
  let saved = { testRecipientId: id(70) };
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => saved }));
  t.mock.method(User, "findById", (userId) => chain([store, other, muted].find((user) => user._id === String(userId)) || null));
  const filters = [];
  t.mock.method(User, "find", (query) => { filters.push(query); return chain(query._id.$in.map((value) => ({ _id: value }))); });
  const duplicate = t.mock.method(PushBroadcast, "findOne", () => chain(null));
  const created = []; const updates = [];
  t.mock.method(PushBroadcast, "create", async (doc) => { created.push(doc); return { _id: id(50), ...doc }; });
  t.mock.method(PushBroadcast, "updateOne", async (_query, update) => { updates.push(update.$set); return {}; });
  const pushes = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (_url, options) => { pushes.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ id: "n1" }) }; });
  const sendTest = async (extra = {}) => { const res = response(); await sendBroadcast({ body: { title: "Deneme", body: "Merhaba", audience: "self", ...extra }, user: owner }, res); return res; };

  // Kayıtlı test alıcısı: kampanya bildirimi kapalı olsa da deneme gider, not düşülür
  let res = await sendTest();
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /^Test bildirimi Benim Marketim \(benimmarketim@gmail\.com\) hesabının telefonuna gönderildi\. Not: bu hesapta kampanya bildirimleri kapalı/);
  assert.equal(res.body.recipient.hasPushTarget, true);
  assert.deepEqual(pushes.at(-1).include_aliases.external_id, [id(70)]);
  assert.equal(filters.at(-1)["notificationPreferences.campaigns"], undefined);
  assert.deepEqual(created.at(-1), { title: "Deneme", body: "Merhaba", audience: "self", route: "/home", audienceSize: 1, sentBy: id(99), testRecipient: id(70) });
  assert.equal(duplicate.mock.callCount(), 0);

  // İstekte seçilen hesap kayıtlı alıcının önüne geçer
  res = await sendTest({ recipientId: id(72) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Test bildirimi Ayşe (ayse@example.com) hesabının telefonuna gönderildi");
  assert.deepEqual(pushes.at(-1).include_aliases.external_id, [id(72)]);
  assert.equal(created.at(-1).testRecipient, id(72));

  // Geçersiz / bulunamayan seçim: kayıt oluşmaz, bildirim gitmez
  const before = { created: created.length, pushes: pushes.length };
  assert.equal((await sendTest({ recipientId: "benimmarketim@gmail.com" })).statusCode, 400);
  assert.equal((await sendTest({ recipientId: id(79) })).statusCode, 404);
  assert.deepEqual({ created: created.length, pushes: pushes.length }, before);

  // Hesapta bildirimler tamamen kapalı: gönderilmez, kayıtta nedeni yazılır
  res = await sendTest({ recipientId: id(73) });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.reason, "push_disabled");
  assert.match(res.body.message, /Ali \(ali@example\.com\) hesabında bildirimler kapalı/);
  assert.equal(pushes.length, before.pushes);
  assert.deepEqual(updates.at(-1), { targetedCount: 0, sent: false, failureReason: "push_disabled", unreachableCount: 0 });
  assert.equal(created.at(-1).audience, "self");

  // Kayıtlı alıcı yok (ya da silinmiş): gönderen yöneticiye gider; cihazı yoksa mesaj hesabı adıyla söyler
  saved = { testRecipientId: id(78) };
  fetchMock.mock.mockImplementation(async (_url, options) => { pushes.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ id: "", errors: { invalid_aliases: { external_id: [id(99)] } } }) }; });
  res = await sendTest();
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.reason, "no_devices");
  assert.match(res.body.message, /Jüpiter \(jupiterryhd@gmail\.com\) hesabıyla mobil uygulamada oturum açılmamış ya da bildirim izni verilmemiş/);
  assert.deepEqual(pushes.at(-1).include_aliases.external_id, [id(99)]);
  assert.equal(created.at(-1).testRecipient, id(99));
});

test("the diagnosis explains why an account cannot receive pushes", async (t) => {
  withKeys(t);
  const admin = { _id: id(99), name: "Deniz", email: "deniz@example.com" };
  const run = async (query = {}) => { const res = response(); await diagnosePush({ query, user: admin }, res); return res; };
  let url;
  const fetchMock = t.mock.method(globalThis, "fetch", async (target) => { url = target; return { ok: false, status: 404, json: async () => ({}) }; });

  let res = await run();
  assert.match(url, new RegExp(`/apps/app-test/users/by/external_id/${id(99)}$`));
  assert.equal(res.body.state, "not_found");
  assert.equal(res.body.ready, false);
  assert.match(res.body.steps[0], /aynı e-posta/);

  const user = (subscriptions) => async () => ({ ok: true, status: 200, json: async () => ({ identity: { external_id: id(99) }, subscriptions }) });
  fetchMock.mock.mockImplementation(user([{ type: "Email", enabled: true, token: "a@b.c" }]));
  assert.equal((await run()).body.state, "no_subscription");
  fetchMock.mock.mockImplementation(user([{ type: "iOSPush", enabled: false, token: "" }]));
  res = await run();
  assert.equal(res.body.state, "no_token");
  assert.match(res.body.steps.join(" "), /APNs/);
  fetchMock.mock.mockImplementation(user([{ type: "iOSPush", enabled: false, token: "abc" }]));
  assert.equal((await run()).body.state, "disabled");
  fetchMock.mock.mockImplementation(user([{ type: "iOSPush", enabled: true, token: "secret-device-token", device_model: "iPhone15,2", app_version: "6.0.0" }]));
  res = await run();
  assert.equal(res.body.ready, true);
  assert.deepEqual(res.body.devices, [{ platform: "iPhone", enabled: true, hasToken: true, model: "iPhone15,2", appVersion: "6.0.0" }]);
  assert.doesNotMatch(JSON.stringify(res.body), /secret-device-token|test-only/); // cihaz adresi ve anahtar yanıtta yer almaz

  // Başka bir hesabı e-postasıyla denetleme; kampanya bildirimi kapalıysa ayrıca belirtilir
  t.mock.method(User, "findOne", () => chain({ _id: id(5), name: "Ayşe", email: "ayse@example.com", notificationPreferences: { campaigns: false } }));
  res = await run({ email: " Ayse@Example.com " });
  assert.match(fetchMock.mock.calls.at(-1).arguments[0], new RegExp(`${id(5)}$`));
  assert.equal(res.body.ready, false);
  assert.match(res.body.title, /kampanya bildirimleri kapalı/);
  User.findOne.mock.mockImplementation(() => chain(null));
  assert.equal((await run({ email: "yok@example.com" })).statusCode, 404);
});
