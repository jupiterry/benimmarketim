// Müşteri eylemleri: seçili müşterilere / süzgece uyanlara bildirim ve kişiye özel kupon
// (POST /api/customer-actions/preview, /push, /coupons). Veritabanı ve OneSignal taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Coupon from "../models/coupon.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import AutomationSettings from "../models/automationSettings.model.js";
import customerActionsRoutes from "../routes/customerActions.route.js";
import {
  couponSummary, giveCouponsToCustomers, previewCustomerActions, pushSummary, pushToCustomers,
} from "../controllers/customerActions.controller.js";
import {
  COUPON_PREFIX, PUSH_BODY_MAX, PUSH_TITLE_MAX, TARGET_LIMIT, couponDescription, defaultCouponMessage, giveCustomerCoupons,
  parseCouponInput, parseMessage, parseTarget, resetCustomerActionMemory, sendCustomerPush,
} from "../services/customerActions.service.js";

// ── Ortak taklitler ─────────────────────────────────────────────────
const ID = (n) => `64b000000000000000000${String(n).padStart(3, "0")}`;
const ADMIN = ID(99);
const MIN = 60 * 1000;
// 2 Kasım 2026 19:00 (İstanbul) — otomatik bildirim saatleri (10:00–21:30) içinde
const EVENING = Date.parse("2026-11-02T16:00:00Z");
// 2 Kasım 2026 23:30 (İstanbul) — sessiz saat
const NIGHT = Date.parse("2026-11-02T20:30:00Z");

const people = () => ({
  [ID(1)]: { _id: ID(1), name: "Ayşe Yılmaz", role: "customer", pushNotificationsEnabled: true, notificationPreferences: { campaigns: true }, appActivity: { lastSeenAt: new Date(EVENING - 60 * MIN) }, fcmToken: null },
  [ID(2)]: { _id: ID(2), name: "Mehmet Kaya", role: "customer", appActivity: { lastSeenAt: null }, fcmToken: "fcm-gizli-2" },
  [ID(3)]: { _id: ID(3), name: "Zeynep Ak", role: "customer", pushNotificationsEnabled: false, appActivity: { lastSeenAt: new Date(EVENING) } },
  [ID(4)]: { _id: ID(4), name: "Can Demir", role: "customer", notificationPreferences: { campaigns: false }, appActivity: { lastSeenAt: new Date(EVENING) } },
  [ID(5)]: { _id: ID(5), name: "Elif Su", role: "customer", appActivity: { lastSeenAt: null }, fcmToken: "" },
  [ID(6)]: { _id: ID(6), name: "Okan Er", role: "customer", appActivity: { lastSeenAt: new Date(EVENING - 5 * MIN) } },
  [ID(7)]: { _id: ID(7), name: "Yönetici Bey", role: "admin", appActivity: { lastSeenAt: new Date(EVENING) } },
});

const chain = (value) => {
  const query = {
    select: () => query,
    sort: () => query,
    limit: () => query,
    populate: () => query,
    lean: async () => (typeof value === "function" ? value() : value),
  };
  return query;
};

// User.find'ın bu dosyada kullanılan biçimleri: hedef çözümü ({ _id: { $in: ObjectId[] }, role }) ve
// push.service ({ _id: { $in: string[] }, pushNotificationsEnabled, notificationPreferences.campaigns }).
// Rol koşulu bilerek uygulanmaz: servis yöneticiyi kendisi de elemeli.
const matchesUser = (user, filter) => {
  const ids = filter?._id?.$in?.map((id) => String(id).toLowerCase());
  if (ids && !ids.includes(String(user._id))) return false;
  if (filter?.pushNotificationsEnabled?.$ne === false && user.pushNotificationsEnabled === false) return false;
  if (filter?.["notificationPreferences.campaigns"]?.$ne === false && user.notificationPreferences?.campaigns === false) return false;
  return true;
};

const withKeys = (t) => {
  const previous = { key: process.env.ONESIGNAL_REST_API_KEY, app: process.env.ONESIGNAL_APP_ID };
  process.env.ONESIGNAL_REST_API_KEY = "test-only";
  process.env.ONESIGNAL_APP_ID = "app-test";
  t.after(() => {
    if (previous.key === undefined) delete process.env.ONESIGNAL_REST_API_KEY; else process.env.ONESIGNAL_REST_API_KEY = previous.key;
    if (previous.app === undefined) delete process.env.ONESIGNAL_APP_ID; else process.env.ONESIGNAL_APP_ID = previous.app;
  });
};
const withoutKeys = (t) => {
  const previous = { key: process.env.ONESIGNAL_REST_API_KEY, app: process.env.ONESIGNAL_APP_ID };
  delete process.env.ONESIGNAL_REST_API_KEY;
  delete process.env.ONESIGNAL_APP_ID;
  t.after(() => {
    if (previous.key !== undefined) process.env.ONESIGNAL_REST_API_KEY = previous.key;
    if (previous.app !== undefined) process.env.ONESIGNAL_APP_ID = previous.app;
  });
};

/** Veritabanı, OneSignal ve işlem kaydı taklitleri; dönen nesne çağrıları toplar */
const setup = (t, { users = people(), window = { start: "10:00", end: "21:30" }, recentBroadcasts = [], recentCoupons = [], oneSignal } = {}) => {
  resetCustomerActionMemory();
  const fx = { userFinds: [], aggregates: [], broadcasts: [], broadcastUpdates: [], broadcastQueries: [], oneSignal: [], audits: [], inserted: [], couponQueries: [], created: [] };
  t.mock.method(User, "find", (filter) => {
    fx.userFinds.push(filter);
    return chain(() => Object.values(users).filter((user) => matchesUser(user, filter)).map((user) => ({ ...user })));
  });
  t.mock.method(User, "aggregate", async (pipeline) => {
    fx.aggregates.push(pipeline);
    return Object.values(users).filter((user) => user.role !== "admin").map((user) => ({ ...user }));
  });
  t.mock.method(User, "countDocuments", async () => Object.keys(users).length);
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => (window ? { key: "default", window } : null) }));
  t.mock.method(PushBroadcast, "find", (filter) => {
    fx.broadcastQueries.push(filter);
    return chain(() => (typeof recentBroadcasts === "function" ? recentBroadcasts(filter) : recentBroadcasts));
  });
  let broadcastSeq = 0;
  t.mock.method(PushBroadcast, "create", async (doc) => {
    broadcastSeq += 1;
    const record = { _id: new mongoose.Types.ObjectId(`65c00000000000000000${String(broadcastSeq).padStart(4, "0")}`), ...doc };
    fx.broadcasts.push(record);
    return record;
  });
  t.mock.method(PushBroadcast, "updateOne", async (query, update) => { fx.broadcastUpdates.push([query, update]); return {}; });
  t.mock.method(Coupon, "find", (filter) => {
    fx.couponQueries.push(filter);
    if (filter?.userId) return chain(() => (typeof recentCoupons === "function" ? recentCoupons(filter) : recentCoupons));
    return chain([]); // kod çakışması denetimi: hiçbiri alınmamış
  });
  t.mock.method(Coupon, "insertMany", async (docs) => { fx.inserted.push(...docs.map((doc) => ({ ...doc }))); return docs; });
  t.mock.method(Coupon, "create", async (doc) => { fx.created.push({ ...doc }); return doc; });
  t.mock.method(AdminAudit, "create", async (doc) => { fx.audits.push(doc); return doc; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    fx.oneSignal.push(body);
    if (oneSignal) return oneSignal(body);
    return { ok: true, status: 200, json: async () => ({ id: "bildirim-1" }) };
  });
  return fx;
};

const response = () => {
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};
const request = (body, path = "/api/customer-actions/push") => ({ body, user: { _id: ADMIN, role: "admin" }, method: "POST", originalUrl: path });
const expectError = async (promise, status, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status, error.message);
    if (code) assert.equal(error.code, code, error.message);
    return true;
  });
};

// ── Yollar ──────────────────────────────────────────────────────────
test("customer action endpoints are admin-only POST routes", () => {
  const layers = customerActionsRoutes.stack;
  const firstRoute = layers.findIndex((layer) => layer.route);
  assert.deepEqual(layers.slice(0, firstRoute).map((layer) => layer.handle.name), ["protectRoute", "adminRoute"]);
  const routes = layers.filter((layer) => layer.route).map((layer) => [Object.keys(layer.route.methods).join(","), layer.route.path]);
  assert.deepEqual(routes, [["post", "/preview"], ["post", "/push"], ["post", "/coupons"]]);
});

// ── Hedef ───────────────────────────────────────────────────────────
test("target parsing: ids are validated and de-duplicated, filters are strict and never silently widened", () => {
  const now = EVENING;
  assert.deepEqual(parseTarget({ userIds: [ID(1), ID(1).toUpperCase(), ID(2)] }, now), { type: "ids", ids: [ID(1), ID(2)] });
  const rejects = (target, code) => assert.throws(() => parseTarget(target, now), (error) => error.status === 400 && error.code === code);
  rejects(undefined, "invalid_target");
  rejects({}, "invalid_target");
  rejects({ userIds: [ID(1)], filter: { q: "ali" } }, "invalid_target");
  rejects({ userIds: [] }, "invalid_target");
  rejects({ userIds: ["bozuk"] }, "invalid_target");
  rejects({ userIds: [{ $gt: "" }] }, "invalid_target");
  rejects({ userIds: Array.from({ length: TARGET_LIMIT + 1 }, (_, i) => ID(i % 50)) }, "too_many");
  rejects({ filter: {} }, "empty_filter");
  rejects({ filter: { segment: "all" } }, "empty_filter");
  rejects({ filter: { segment: "admin" } }, "invalid_filter");
  rejects({ filter: { segment: "herkes" } }, "invalid_filter");
  rejects({ filter: { app: "noOrder", staffFlag: "call_before" } }, "invalid_filter");
  rejects({ filter: { app: "uydurma" } }, "invalid_filter");
  rejects({ filter: { app: "noOrder", appSince: "dün" } }, "invalid_filter");
  rejects({ filter: { registeredSince: "bozuk" } }, "invalid_filter");
  rejects({ filter: { q: { $regex: ".*" } } }, "invalid_filter");
  rejects({ filter: { q: "x".repeat(101) } }, "invalid_filter");

  const since = new Date(now - 3 * 60 * MIN).toISOString();
  const parsed = parseTarget({ filter: { app: "noOrder", appSince: since, q: "  ali  " } }, now);
  assert.equal(parsed.type, "filter");
  assert.equal(parsed.options.app, "noOrder");
  assert.equal(parsed.options.appSince.toISOString(), since);
  assert.equal(parsed.options.q, "ali");
});

test("an app filter without a period starts at midnight in Istanbul, not at the server's midnight", () => {
  // 3 Kasım 01:30 İstanbul = 2 Kasım 22:30 UTC: "bugün" İstanbul'da 3 Kasım
  const parsed = parseTarget({ filter: { app: "noOrder" } }, Date.parse("2026-11-02T22:30:00Z"));
  assert.equal(parsed.options.appSince.toISOString(), "2026-11-02T21:00:00.000Z");
});

// ── Kupon ve mesaj kuralları ────────────────────────────────────────
test("coupon input: limits, kuruş rounding and expiry at 23:59:59.999 Istanbul", () => {
  const now = EVENING;
  const read = (coupon) => parseCouponInput(coupon, now);
  const rejects = (coupon) => assert.throws(() => read(coupon), (error) => error.status === 400 && error.code === "invalid_coupon", JSON.stringify(coupon));
  for (const value of [0, 91, 10.5, "abc", true, [10], null]) rejects({ discountType: "percentage", value, validDays: 3 });
  for (const value of [0, 0.5, 500.01, -5]) rejects({ discountType: "fixed", value, validDays: 3 });
  rejects({ discountType: "free", value: 10, validDays: 3 });
  rejects({ discountType: "fixed", value: 10, minimumOrderAmount: -1, validDays: 3 });
  rejects({ discountType: "fixed", value: 10, minimumOrderAmount: 10001, validDays: 3 });
  rejects({ discountType: "percentage", value: 10, maximumDiscount: 0, validDays: 3 });
  rejects({ discountType: "fixed", value: 10, validDays: 3, expiresOn: "2026-11-05" });
  rejects({ discountType: "fixed", value: 10 });
  rejects({ discountType: "fixed", value: 10, validDays: 91 });
  rejects({ discountType: "fixed", value: 10, validDays: 0 });
  rejects({ discountType: "fixed", value: 10, expiresOn: "2026-11-01" });
  rejects({ discountType: "fixed", value: 10, expiresOn: "2026-02-30" });
  rejects({ discountType: "fixed", value: 10, expiresOn: "2027-03-01" });

  assert.equal(read({ discountType: "percentage", value: 1, validDays: 1 }).value, 1);
  assert.equal(read({ discountType: "percentage", value: "90", validDays: 1 }).value, 90);
  assert.equal(read({ discountType: "fixed", value: "37.456", validDays: 1 }).value, 37.46);
  assert.equal(read({ discountType: "fixed", value: 500, validDays: 1 }).value, 500);
  // Üst sınır yalnızca yüzde indirimde anlamlı
  assert.equal(read({ discountType: "fixed", value: 50, maximumDiscount: 20, validDays: 1 }).maximumDiscount, null);
  assert.equal(read({ discountType: "percentage", value: 10, maximumDiscount: "75", validDays: 1 }).maximumDiscount, 75);
  assert.equal(read({ discountType: "fixed", value: 50, minimumOrderAmount: "", validDays: 1 }).minimumOrderAmount, 0);

  const dated = read({ discountType: "fixed", value: 50, expiresOn: "2026-11-05" });
  assert.equal(dated.expirationDate.toISOString(), "2026-11-05T20:59:59.999Z", "new Date('2026-11-05') gibi 03:00'te bitmemeli");
  assert.equal(dated.daysLeft, 3);
  const weekly = read({ discountType: "fixed", value: 50, validDays: 7 });
  assert.equal(weekly.expiresOn, "2026-11-09");
  assert.equal(weekly.expirationDate.toISOString(), "2026-11-09T20:59:59.999Z");
  assert.equal(read({ discountType: "fixed", value: 50, expiresOn: "2026-11-02" }).daysLeft, 0, "bugün seçilebilir");

  // Gece yarısından sonra (İstanbul 3 Kasım 01:30) "dün" geçmiştir, "bugün" 3 Kasım'dır
  const lateNight = Date.parse("2026-11-02T22:30:00Z");
  assert.throws(() => parseCouponInput({ discountType: "fixed", value: 50, expiresOn: "2026-11-02" }, lateNight), /geçmiş/);
  const today = parseCouponInput({ discountType: "fixed", value: 50, expiresOn: "2026-11-03" }, lateNight);
  assert.equal(today.expirationDate.toISOString(), "2026-11-03T20:59:59.999Z");
});

test("customer-facing coupon texts use 'sen' and fit the push limits", () => {
  const percent = parseCouponInput({ discountType: "percentage", value: 10, maximumDiscount: 75, minimumOrderAmount: 250, validDays: 7 }, EVENING);
  assert.equal(couponDescription(percent), "Sana özel %10 indirim (en fazla 75 TL). 250 TL ve üzeri siparişinde geçerli. Tek kullanımlık.");
  const fixed = parseCouponInput({ discountType: "fixed", value: 37.5, expiresOn: "2026-11-02" }, EVENING);
  assert.equal(couponDescription(fixed), "Sana özel 37,50 TL indirim. Tek kullanımlık.");
  const message = defaultCouponMessage(percent);
  assert.equal(message.title, "Sana özel kupon 🎁");
  assert.match(message.body, /^%10 indirim kuponun hazır \(en fazla 75 TL\)\. Son gün 9 Kasım Pazartesi; sepette kullanabilirsin\.$/);
  assert.match(defaultCouponMessage(fixed).body, /Bugün 23:59'a kadar geçerli/);
  assert.ok(message.title.length <= PUSH_TITLE_MAX && message.body.length <= PUSH_BODY_MAX);
});

test("message limits never exceed what the push record can store", () => {
  const maxOf = (path) => Number(PushBroadcast.schema.path(path).options.maxlength);
  assert.ok(PUSH_TITLE_MAX <= 65 && PUSH_TITLE_MAX <= maxOf("title"));
  assert.ok(PUSH_BODY_MAX <= 240 && PUSH_BODY_MAX <= maxOf("body"));
  assert.equal(parseMessage({ title: "t".repeat(PUSH_TITLE_MAX), body: "b" }).title.length, PUSH_TITLE_MAX);
  assert.deepEqual(parseMessage({ title: " Merhaba ", body: " Gel ", }, { routeKey: "cart" }), { title: "Merhaba", body: "Gel", routeKey: "cart", route: "/cart" });
  assert.equal(parseMessage({ title: "a", body: "b" }).route, "/home");
  const rejects = (raw, routeKey, code) => assert.throws(() => parseMessage(raw, { routeKey }), (error) => error.status === 400 && error.code === code);
  rejects({ title: "t".repeat(PUSH_TITLE_MAX + 1), body: "b" }, undefined, "invalid_message");
  rejects({ title: "a", body: "b".repeat(PUSH_BODY_MAX + 1) }, undefined, "invalid_message");
  rejects({ title: "   ", body: "b" }, undefined, "invalid_message");
  rejects({ title: { $ne: "" }, body: "b" }, undefined, "invalid_message");
  rejects({ title: "a", body: "b" }, "https://evil.example", "invalid_route");
  rejects({ title: "a", body: "b" }, "/home", "invalid_route");
});

// ── Önizleme ────────────────────────────────────────────────────────
test("preview: selected ids without admins, reachability by device and preferences, no secrets in the sample", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const req = request({ channel: "push", target: { userIds: [ID(1), ID(2), ID(3), ID(4), ID(5), ID(6), ID(7), ID(40)] } }, "/api/customer-actions/preview");
  const res = response();
  await previewCustomerActions(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(req.auditRecorded, true, "önizleme genel işlem kaydına düşmemeli");
  const body = res.body;
  assert.equal(body.total, 6, "yönetici ve bulunmayan hesap hariç");
  assert.equal(body.missing, 2);
  // 1: uygulamada görüldü · 2: FCM adresi var · 6: uygulamada görüldü; 3 bildirim kapalı, 4 kampanya kapalı, 5 cihaz yok
  assert.equal(body.reachable, 3);
  assert.equal(body.unreachable, 3);
  assert.equal(body.capped, false);
  assert.equal(body.sample.length, 5);
  for (const row of body.sample) assert.deepEqual(Object.keys(row).sort(), ["_id", "name"]);
  assert.equal(JSON.stringify(body).includes("fcm-gizli"), false, "bildirim adresi yanıtta olmamalı");
  assert.equal(body.limits.title, PUSH_TITLE_MAX);
  assert.equal(body.limits.targets, TARGET_LIMIT);
  assert.deepEqual(Object.keys(body.quietHours).sort(), ["active", "end", "start"]);
  assert.equal(body.pushConfigured, true);
  const query = fx.userFinds[0];
  assert.deepEqual(query.role, { $ne: "admin" });
  assert.ok(query._id.$in.every((id) => id instanceof mongoose.Types.ObjectId));

  const bad = response();
  await previewCustomerActions(request({ channel: "sms", target: { userIds: [ID(1)] } }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.code, "invalid_channel");
});

test("preview with a filter uses the customer list rules, most recently seen first, capped at 1000", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const many = Array.from({ length: TARGET_LIMIT + 1 }, (_, i) => ({ _id: `64c0000000000000000${String(i).padStart(5, "0")}`, name: `Müşteri ${i}`, role: "customer", appActivity: { lastSeenAt: new Date(EVENING) } }));
  User.aggregate.mock.mockImplementation(async (pipeline) => { fx.aggregates.push(pipeline); return many; });
  User.countDocuments.mock.mockImplementation(async () => 1240);
  const since = new Date(EVENING - 2 * 60 * MIN).toISOString();
  const res = response();
  await previewCustomerActions(request({ channel: "coupon", target: { filter: { app: "noOrder", appSince: since } } }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.total, TARGET_LIMIT);
  assert.equal(res.body.capped, true);
  assert.equal(res.body.matched, 1240);
  assert.match(res.body.target.label, /^Süzgeç: Uygulamayı açtı, sipariş vermedi/);
  const [pipeline] = fx.aggregates;
  const match = pipeline[0].$match;
  assert.deepEqual(match.$and[1], { role: { $ne: "admin" } }, "yöneticiler hiçbir zaman hedeflenmez");
  const text = JSON.stringify(match);
  assert.ok(text.includes("appActivity.orderAt") && text.includes("appActivity.lastSeenAt"), "liste ucuyla aynı uygulama hunisi koşulları");
  assert.ok(text.includes(since));
  assert.deepEqual(pipeline.find((stage) => stage.$sort).$sort, { _seenAt: -1, _id: -1 });
  assert.equal(pipeline.find((stage) => stage.$limit).$limit, TARGET_LIMIT + 1);
});

test("a search across all customers reports how many admin accounts were left out", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const counted = [];
  User.countDocuments.mock.mockImplementation(async (filter) => { counted.push(filter); return 1; });
  const res = response();
  await previewCustomerActions(request({ channel: "push", target: { filter: { q: "yılmaz" } } }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.admins, 1);
  assert.deepEqual(counted[0].$and[1], { role: "admin" });
  assert.deepEqual(fx.aggregates[0][0].$match.$and[1], { role: { $ne: "admin" } });

  // Uygulama süzgeci yöneticileri zaten dışlar: ayrıca sayılmaz
  counted.length = 0;
  const app = response();
  await previewCustomerActions(request({ channel: "push", target: { filter: { app: "opened", appSince: new Date(Date.now() - 60 * MIN).toISOString() } } }), app);
  assert.equal(app.body.admins, 0);
  assert.equal(counted.length, 0);
});

test("'never ordered' filter excludes customers with orders exactly like the list does", async (t) => {
  withKeys(t);
  const fx = setup(t);
  t.mock.method(Order, "aggregate", async () => [{ _id: ID(1), orderCount: 2, totalSpent: 400 }]);
  const res = response();
  await previewCustomerActions(request({ channel: "push", target: { filter: { segment: "noOrders" } } }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const clause = fx.aggregates[0][0].$match.$and[0].$and.find((item) => item._id?.$nin);
  assert.deepEqual(clause._id.$nin.map(String), [ID(1)]);
  assert.ok(clause._id.$nin[0] instanceof mongoose.Types.ObjectId, "aggregate kimlikleri ObjectId olarak karşılaştırır");
});

// ── Bildirim ────────────────────────────────────────────────────────
test("push goes only to reachable customers, is recorded as a custom broadcast and audited", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const req = request({
    target: { userIds: [ID(1), ID(2), ID(3), ID(5), ID(7)] },
    title: "  Bir şey mi unuttun? 🛒 ",
    body: "Eksiklerini şimdi sepete ekle, kapına getirelim.",
    route: "cart",
    confirmQuietHours: true,
  });
  const res = response();
  await pushToCustomers(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual({ sent: res.body.sent, failed: res.body.failed, skipped: res.body.skipped }, { sent: 2, failed: 0, skipped: 2 });
  assert.equal(res.body.total, 4);
  assert.equal(res.body.reachable, 2);
  assert.equal(res.body.message, "2 kişiye gönderildi · 2 kişi atlandı (bildirimi kapalı ya da uygulaması yok)");

  assert.equal(fx.oneSignal.length, 1, "tek istekte (paket) gönderilir");
  assert.deepEqual(fx.oneSignal[0].include_aliases.external_id.sort(), [ID(1), ID(2)]);
  assert.equal(fx.oneSignal[0].headings.tr, "Bir şey mi unuttun? 🛒");
  assert.equal(fx.oneSignal[0].data.route, "/cart");
  assert.equal(fx.oneSignal[0].data.type, "broadcast");
  const pushQuery = fx.userFinds.find((filter) => filter.pushNotificationsEnabled);
  assert.deepEqual(pushQuery["notificationPreferences.campaigns"], { $ne: false }, "kampanya tercihi push.service'te de uygulanır");

  const [record] = fx.broadcasts;
  assert.equal(record.audience, "custom");
  assert.equal(record.audienceSize, 4);
  assert.equal(record.title, "Bir şey mi unuttun? 🛒");
  assert.equal(record.route, "/cart");
  assert.equal(String(record.sentBy), ADMIN);
  assert.equal(fx.oneSignal[0].data.broadcastId, String(record._id));
  assert.deepEqual(fx.broadcastUpdates[0][1].$set, { targetedCount: 2, sent: true, failureReason: null, unreachableCount: 0 });

  assert.equal(fx.audits.length, 1);
  const [audit] = fx.audits;
  assert.equal(audit.action, "Müşterilere bildirim");
  assert.equal(audit.category, "campaign");
  assert.equal(audit.target, "4 müşteri");
  assert.equal(audit.meta.kind, "push");
  assert.deepEqual(audit.meta.userIds.sort(), [ID(1), ID(2)]);
  assert.ok(audit.changes.some((change) => change.label === "Başlık" && change.to === "Bir şey mi unuttun? 🛒"));
});

test("devices OneSignal does not know are reported as failed, not as sent", async (t) => {
  withKeys(t);
  setup(t, { oneSignal: () => ({ ok: true, status: 200, json: async () => ({ id: "n-2", errors: { invalid_aliases: { external_id: [ID(2)] } } }) }) });
  const outcome = await sendCustomerPush({ target: { userIds: [ID(1), ID(2)] }, title: "Merhaba", body: "Gel bak" }, { actorId: ADMIN, now: EVENING });
  assert.deepEqual({ sent: outcome.sent, failed: outcome.failed, skipped: outcome.skipped }, { sent: 1, failed: 1, skipped: 0 });
});

test("the same push to the same people within 10 minutes needs explicit confirmation", async (t) => {
  withKeys(t);
  let recent = [];
  const fx = setup(t, { recentBroadcasts: () => recent });
  const body = { target: { userIds: [ID(1), ID(2)] }, title: "Akşam fırsatı", body: "Sepetin seni bekliyor." };
  const first = await sendCustomerPush(body, { actorId: ADMIN, now: EVENING });
  assert.equal(first.sent, 2);
  const query = fx.broadcastQueries[0];
  assert.equal(query.sent, true, "yalnızca başarılı gönderimler sayılır");
  assert.deepEqual(query.audience, { $ne: "self" }, "Bildirimler ekranındaki denemeler sayılmaz");
  assert.equal(query.createdAt.$gte.getTime(), EVENING - 10 * MIN);

  recent = [{ _id: fx.broadcasts[0]._id, createdAt: new Date(EVENING) }];
  const later = EVENING + 4 * MIN;
  await expectError(sendCustomerPush({ ...body, target: { userIds: [ID(2), ID(6)] } }, { actorId: ADMIN, now: later }), 409, "duplicate");
  await assert.rejects(sendCustomerPush(body, { actorId: ADMIN, now: later }), (error) => {
    assert.equal(error.code, "duplicate");
    assert.equal(error.extra.overlap, 2);
    assert.equal(error.extra.sentAt, new Date(EVENING).toISOString());
    assert.match(error.message, /4 dk önce bu kişilerden 2 kişiye/);
    return true;
  });
  assert.equal(fx.oneSignal.length, 1, "ikinci gönderim yapılmadı");

  // Aynı metin başka kişilere gidebilir
  const others = await sendCustomerPush({ ...body, target: { userIds: [ID(6)] } }, { actorId: ADMIN, now: later });
  assert.equal(others.sent, 1);
  // Açık onayla aynı kişilere de gider
  const again = await sendCustomerPush({ ...body, confirmDuplicate: true }, { actorId: ADMIN, now: later });
  assert.equal(again.sent, 2);

  // Sunucu yeniden başladıysa alıcıları bilinmeyen aynı metinli kayıt temkinli olarak çakışma sayılır
  resetCustomerActionMemory();
  await expectError(sendCustomerPush({ ...body, target: { userIds: [ID(6)] } }, { actorId: ADMIN, now: later }), 409, "duplicate");
});

test("quiet hours: outside the automation send window a push needs explicit confirmation", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const body = { target: { userIds: [ID(1)] }, title: "Gece atıştırmalığı", body: "Hâlâ açığız." };
  await assert.rejects(sendCustomerPush(body, { actorId: ADMIN, now: NIGHT }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "quiet_hours");
    assert.deepEqual(error.extra.quietHours, { active: true, start: "10:00", end: "21:30" });
    return true;
  });
  assert.equal(fx.oneSignal.length, 0);
  assert.equal(fx.broadcasts.length, 0, "kayıt da açılmaz");
  const confirmed = await sendCustomerPush({ ...body, confirmQuietHours: true }, { actorId: ADMIN, now: NIGHT });
  assert.equal(confirmed.sent, 1);
  const evening = await sendCustomerPush({ ...body, title: "Akşam" }, { actorId: ADMIN, now: EVENING });
  assert.equal(evening.sent, 1, "gönderim saatinde onay gerekmez");
});

test("quiet hours fall back to the default window when automation settings cannot be read", async (t) => {
  withKeys(t);
  setup(t);
  t.mock.method(console, "error", () => {});
  AutomationSettings.findOne.mock.mockImplementation(() => ({ lean: async () => { throw new Error("db down"); } }));
  await expectError(sendCustomerPush({ target: { userIds: [ID(1)] }, title: "a", body: "b" }, { actorId: ADMIN, now: NIGHT }), 409, "quiet_hours");
});

test("push validation and failures", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const run = async (body) => { const res = response(); await pushToCustomers(request(body), res); return res; };
  const target = { userIds: [ID(1)] };
  let res = await run({ target, title: "t".repeat(PUSH_TITLE_MAX + 1), body: "b" });
  assert.equal(res.statusCode, 400);
  res = await run({ target, title: "t", body: "" });
  assert.equal(res.statusCode, 400);
  res = await run({ target, title: "t", body: "b", route: "https://evil.example" });
  assert.equal(res.body.code, "invalid_route");
  res = await run({ target: { userIds: [ID(7)] }, title: "t", body: "b", confirmQuietHours: true });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "empty_target", "yalnızca yönetici seçildiyse kimse yok");
  res = await run({ target: { userIds: [ID(3), ID(4), ID(5)] }, title: "t", body: "b", confirmQuietHours: true });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, "no_reachable");
  assert.equal(fx.oneSignal.length, 0);
  assert.equal(fx.audits.length, 0);

  // OneSignal'a ulaşılamadı: kayıt "gönderilemedi" kalır, yönetici nedenini görür, işlem kaydı yazılmaz
  t.mock.method(console, "error", () => {});
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error("ECONNRESET"); });
  res = await run({ target, title: "Ağ", body: "yok", confirmQuietHours: true });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, "network");
  assert.equal(res.body.failed, 1);
  assert.equal(fx.broadcastUpdates.at(-1)[1].$set.sent, false);
  assert.equal(fx.audits.length, 0);
});

test("push refuses to run when the push service is not configured", async (t) => {
  withoutKeys(t);
  setup(t);
  const res = response();
  await pushToCustomers(request({ target: { userIds: [ID(1)] }, title: "t", body: "b" }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "not_configured");
});

test("a second identical push is refused while the first one is still being sent", async (t) => {
  withKeys(t);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  setup(t, { oneSignal: async () => { await gate; return { ok: true, status: 200, json: async () => ({ id: "n-3" }) }; } });
  const body = { target: { userIds: [ID(1)] }, title: "Çift tık", body: "Bir kez gitmeli." };
  const first = sendCustomerPush(body, { actorId: ADMIN, now: EVENING });
  await new Promise((resolve) => setImmediate(resolve));
  await expectError(sendCustomerPush({ ...body, confirmDuplicate: true }, { actorId: ADMIN, now: EVENING }), 409, "in_progress");
  release();
  assert.equal((await first).sent, 1);
  // Kilit bırakıldı
  assert.equal((await sendCustomerPush({ ...body, confirmDuplicate: true }, { actorId: ADMIN, now: EVENING })).sent, 1);
});

// ── Kupon ───────────────────────────────────────────────────────────
test("coupons: one personal single-use coupon per customer, ending 23:59 Istanbul, with an optional push", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const req = request({
    target: { userIds: [ID(1), ID(3), ID(7)] },
    coupon: { discountType: "fixed", value: 50, minimumOrderAmount: 200, maximumDiscount: 999, validDays: 7 },
    notify: true,
    confirmQuietHours: true,
  }, "/api/customer-actions/coupons");
  const res = response();
  await giveCouponsToCustomers(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.created, 2);
  assert.equal(res.body.skipped, 1, "yönetici atlanır");
  assert.equal(res.body.pushed, 1, "bildirimi kapalı müşteriye gitmez ama kuponunu alır");
  assert.equal(res.body.code, null, "toplu verilişte kodlar dönmez");

  assert.equal(fx.inserted.length, 2);
  const codes = new Set();
  for (const doc of fx.inserted) {
    assert.match(doc.code, new RegExp(`^${COUPON_PREFIX}[A-HJ-NP-Z2-9]{7}$`));
    codes.add(doc.code);
    assert.equal(doc.usageLimit, 1);
    assert.equal(doc.userUsageLimit, 1);
    assert.equal(doc.isActive, true);
    assert.equal(doc.discountType, "fixed");
    assert.equal(doc.discountAmount, 50);
    assert.equal(doc.discountPercentage, 0);
    assert.equal(doc.maximumDiscount, null);
    assert.equal(doc.minimumOrderAmount, 200);
    assert.match(doc.expirationDate.toISOString(), /T20:59:59\.999Z$/, "İstanbul'da günün sonu");
    assert.equal(doc.description, "Sana özel 50 TL indirim. 200 TL ve üzeri siparişinde geçerli. Tek kullanımlık.");
  }
  assert.equal(codes.size, 2, "her kupona ayrı kod");
  assert.deepEqual(fx.inserted.map((doc) => String(doc.userId)).sort(), [ID(1), ID(3)]);

  assert.equal(fx.oneSignal.length, 1);
  assert.deepEqual(fx.oneSignal[0].include_aliases.external_id, [ID(1)]);
  assert.equal(fx.oneSignal[0].headings.tr, "Sana özel kupon 🎁");
  assert.match(fx.oneSignal[0].contents.tr, /^50 TL indirim kuponun hazır\. Son gün .+; sepette kullanabilirsin\.$/);
  assert.equal(fx.oneSignal[0].data.route, "/cart");
  assert.equal(fx.broadcasts[0].audience, "custom");

  const [audit] = fx.audits;
  assert.equal(audit.action, "Müşterilere özel kupon");
  assert.equal(audit.category, "campaign");
  assert.equal(audit.meta.kind, "coupon");
  assert.equal(audit.meta.codes.length, 2);
});

test("coupons: validation errors are rejected before anything is written", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const run = async (body) => { const res = response(); await giveCouponsToCustomers(request({ target: { userIds: [ID(1)] }, ...body }, "/api/customer-actions/coupons"), res); return res; };
  for (const coupon of [
    { discountType: "percentage", value: 95, validDays: 3 },
    { discountType: "fixed", value: 600, validDays: 3 },
    { discountType: "fixed", value: 50, minimumOrderAmount: -5, validDays: 3 },
    { discountType: "fixed", value: 50, expiresOn: "2020-01-01" },
    { discountType: "fixed", value: 50, expiresOn: "2099-01-01", validDays: 3 },
  ]) {
    const res = await run({ coupon });
    assert.equal(res.statusCode, 400, JSON.stringify(coupon));
  }
  assert.equal((await run({ coupon: { discountType: "fixed", value: 50, validDays: 3 }, notify: "evet" })).statusCode, 400);
  assert.equal((await run({ coupon: { discountType: "fixed", value: 50, validDays: 3 }, notify: true, message: { title: "t".repeat(PUSH_TITLE_MAX + 1) } })).statusCode, 400);
  assert.equal((await run({ coupon: { discountType: "fixed", value: 50, validDays: 3 }, target: { filter: {} } })).statusCode, 400);
  assert.equal(fx.inserted.length, 0);
  assert.equal(fx.audits.length, 0);
});

test("coupons: a repeated request does not give the same customer a second coupon", async (t) => {
  withKeys(t);
  let already = [];
  const fx = setup(t, { recentCoupons: () => already });
  const body = { target: { userIds: [ID(1), ID(6)] }, coupon: { discountType: "percentage", value: 15, maximumDiscount: 60, validDays: 3 } };
  already = [{ userId: new mongoose.Types.ObjectId(ID(1)) }];
  const outcome = await giveCustomerCoupons(body, { actorId: ADMIN, now: EVENING });
  assert.equal(outcome.created, 1);
  assert.equal(outcome.duplicates, 1);
  assert.equal(outcome.skipped, 1);
  assert.deepEqual(fx.inserted.map((doc) => String(doc.userId)), [ID(6)]);
  const guard = fx.couponQueries.find((filter) => filter.userId);
  assert.deepEqual(guard.code, { $regex: `^${COUPON_PREFIX}` });
  assert.equal(guard.createdAt.$gte.getTime(), EVENING - 10 * MIN);
  assert.equal(guard.discountPercentage, 15);
  assert.equal(guard.maximumDiscount, 60);
  assert.equal(guard.expirationDate.toISOString(), "2026-11-05T20:59:59.999Z");

  // Hepsi az önce almışsa yeni kupon yazılmaz, işlem kaydı da tutulmaz
  already = [{ userId: ID(1) }, { userId: ID(6) }];
  const req = request(body, "/api/customer-actions/coupons");
  const res = response();
  fx.inserted.length = 0;
  await giveCouponsToCustomers(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 0);
  assert.equal(res.body.skipped, 2);
  assert.equal(Coupon.insertMany.mock.callCount(), 1, "ikinci istekte toplu yazım yok");
  assert.equal(fx.audits.length, 0);
  assert.equal(req.auditRecorded, true);
});

test("coupons: code collisions are retried and nobody gets two coupons", async (t) => {
  withKeys(t);
  const fx = setup(t);
  t.mock.method(console, "error", () => {});
  // Önce: üretilen ilk kod veritabanında var → yeni kod alır
  let firstCheck = true;
  let takenCode = null;
  Coupon.find.mock.mockImplementation((filter) => {
    fx.couponQueries.push(filter);
    if (filter?.userId) return chain([]);
    if (firstCheck) {
      firstCheck = false;
      takenCode = filter.code.$in[0];
      return chain([{ code: takenCode }]);
    }
    // Toplu yazım hatasından sonra: yalnızca ilk kupon yazılmış görünür
    if (written) return chain([{ code: written.code, userId: written.userId }]);
    return chain([]);
  });
  let written = null;
  Coupon.insertMany.mock.mockImplementation(async (docs) => {
    written = { ...docs[0] };
    fx.inserted.push(written);
    const error = new Error("E11000 duplicate key error collection: coupons index: code_1");
    error.code = 11000;
    throw error;
  });
  let createAttempts = 0;
  Coupon.create.mock.mockImplementation(async (doc) => {
    createAttempts += 1;
    if (createAttempts === 1) { const error = new Error("E11000 duplicate key"); error.code = 11000; throw error; }
    fx.created.push({ ...doc });
    return doc;
  });
  const outcome = await giveCustomerCoupons({ target: { userIds: [ID(1), ID(6)] }, coupon: { discountType: "fixed", value: 25, validDays: 1 } }, { actorId: ADMIN, now: EVENING });
  assert.equal(outcome.created, 2);
  assert.equal(outcome.failed, 0);
  assert.notEqual(fx.inserted[0].code, takenCode, "dolu kod kullanılmaz");
  assert.equal(fx.created.length, 1, "yalnızca yazılamayan kupon tek başına yeniden denenir");
  assert.equal(String(fx.created[0].userId), ID(6));
  assert.equal(createAttempts, 2, "kod çakışınca yeni kodla bir kez daha denenir");
  assert.equal(new Set(outcome.codes).size, 2);
});

test("coupons: when the write fails and its result cannot be checked nothing is retried", async (t) => {
  withKeys(t);
  setup(t);
  t.mock.method(console, "error", () => {});
  Coupon.insertMany.mock.mockImplementation(async () => { throw new Error("connection reset"); });
  Coupon.find.mock.mockImplementation((filter) => {
    if (filter?.userId) return chain([]);
    if (Coupon.insertMany.mock.callCount() === 0) return chain([]);
    return chain(async () => { throw new Error("connection reset"); });
  });
  await expectError(giveCustomerCoupons({ target: { userIds: [ID(1)] }, coupon: { discountType: "fixed", value: 25, validDays: 1 } }, { actorId: ADMIN, now: EVENING }), 500, "create_failed");
  assert.equal(Coupon.create.mock.callCount(), 0, "yazılıp yazılmadığı bilinmeyen kupon yeniden denenmez (çift kupon riski)");
});

test("coupons: quiet hours are confirmed before any coupon is written; without a push no confirmation is needed", async (t) => {
  withKeys(t);
  const fx = setup(t);
  const body = { target: { userIds: [ID(1)] }, coupon: { discountType: "fixed", value: 25, validDays: 1 } };
  await expectError(giveCustomerCoupons({ ...body, notify: true }, { actorId: ADMIN, now: NIGHT }), 409, "quiet_hours");
  assert.equal(fx.inserted.length, 0);
  const silent = await giveCustomerCoupons({ ...body, notify: false }, { actorId: ADMIN, now: NIGHT });
  assert.equal(silent.created, 1);
  assert.equal(silent.pushed, 0);
  assert.equal(fx.oneSignal.length, 0);
});

test("coupons: when the push fails the coupons stay and the admin is told why", async (t) => {
  withKeys(t);
  setup(t, { oneSignal: () => ({ ok: false, status: 401, json: async () => ({ errors: ["auth"] }) }) });
  t.mock.method(console, "error", () => {});
  const res = response();
  await giveCouponsToCustomers(request({ target: { userIds: [ID(1)] }, coupon: { discountType: "fixed", value: 25, validDays: 1 }, notify: true, confirmQuietHours: true }, "/api/customer-actions/coupons"), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.pushed, 0);
  assert.equal(res.body.pushReason, "auth");
  assert.match(res.body.code, new RegExp(`^${COUPON_PREFIX}[A-HJ-NP-Z2-9]{7}$`), "tek müşteriye verilen kuponun kodu gösterilir");
  assert.match(res.body.pushProblem, /OneSignal/);
  assert.match(res.body.message, /bildirim gönderilemedi/);
});

test("coupons need the push service only when a notification is requested", async (t) => {
  withoutKeys(t);
  const fx = setup(t);
  const body = { target: { userIds: [ID(1)] }, coupon: { discountType: "fixed", value: 25, validDays: 1 } };
  await expectError(giveCustomerCoupons({ ...body, notify: true }, { actorId: ADMIN, now: EVENING }), 503, "not_configured");
  assert.equal((await giveCustomerCoupons(body, { actorId: ADMIN, now: EVENING })).created, 1);
  assert.equal(fx.oneSignal.length, 0);
});

test("result summaries are short Turkish sentences", () => {
  assert.equal(pushSummary({ sent: 18, failed: 0, skipped: 0 }), "18 kişiye gönderildi");
  assert.equal(pushSummary({ sent: 1200, failed: 2, skipped: 3 }), "1.200 kişiye gönderildi · 2 kişinin cihazına ulaşılamadı · 3 kişi atlandı (bildirimi kapalı ya da uygulaması yok)");
  assert.equal(couponSummary({ created: 23, notify: true, pushed: 18, duplicates: 0, missing: 0, failed: 0 }), "23 kupon oluşturuldu · 18 kişiye bildirim gitti");
  assert.equal(couponSummary({ created: 0, notify: false, pushed: 0, duplicates: 2, missing: 1, failed: 0 }), "0 kupon oluşturuldu · 2 kişi bu kuponu az önce aldığı için atlandı · 1 hesap atlandı (yönetici ya da silinmiş)");
  assert.equal(couponSummary({ created: 0, notify: true, pushed: 0, duplicates: 3, missing: 0, failed: 0 }), "0 kupon oluşturuldu · 3 kişi bu kuponu az önce aldığı için atlandı", "yeni kupon yoksa bildirim de denenmez");
  assert.equal(couponSummary({ created: 5, notify: true, pushed: 3, pushFailed: 1, duplicates: 0, missing: 0, failed: 0 }), "5 kupon oluşturuldu · 3 kişiye bildirim gitti (1 kişinin cihazına ulaşılamadı)");
  assert.equal(couponSummary({ created: 2, notify: true, pushed: 0, pushReason: null, duplicates: 0, missing: 0, failed: 1 }), "2 kupon oluşturuldu · bildirim alabilecek kimse yok · 1 kupon oluşturulamadı");
});
