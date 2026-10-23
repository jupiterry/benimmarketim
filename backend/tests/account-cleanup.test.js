// Pasif hesap temizliği: saf sınıflandırma (classifyCustomers), uç nokta doğrulaması, özet/liste/ids/CSV,
// silme anında yeniden doğrulama + atlama nedenleri + keepFeedback, yönetici DELETE /api/users/:id.
// Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Feedback from "../models/feedback.model.js";
import Chat from "../models/chat.model.js";
import SavedCart from "../models/savedCart.model.js";
import PhotocopyFile from "../models/photocopyFile.model.js";
import Referral from "../models/referral.model.js";
import Coupon from "../models/coupon.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import {
  MONTH_OPTIONS,
  buildCleanupCsv,
  buildSummary,
  classifyCustomers,
  clearAccountCleanupCache,
  csvCell,
  cutoffFor,
  matchesQuery,
  parseDeleteBody,
  parseListQuery,
  SOURCE_LABELS,
  sortRows,
  toOrderStats,
} from "../services/accountCleanup.service.js";
import { deleteUserAccount } from "../services/account.service.js";
import { deleteUsers, exportCsv, getIds, getSummary, getUsers } from "../controllers/accountCleanup.controller.js";
import router from "../routes/accountCleanup.route.js";
import { deleteUser } from "../controllers/userController.js";
import userRoutes from "../routes/userRoutes.js";
import { compensateFeedback, getAllFeedbacks, withDeletedUser } from "../controllers/feedback.controller.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-22T12:00:00.000Z");
const monthsAgo = (months, extraMs = 0, from = NOW) => new Date(cutoffFor(from, months).getTime() + extraMs);
const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const UID = (n) => hex("5a1b2c3d", n);
const ADMIN_ID = hex("ad", 1);
const ADMIN = { _id: ADMIN_ID, role: "admin", name: "Yönetici Bir" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Yeni kayıt olmuş gibi müşteri: lastActive (şema default) ve cartLastUpdated kayıt anına eşit, sepet boş
const customer = (n, fields = {}) => {
  const createdAt = fields.createdAt === undefined ? monthsAgo(24) : fields.createdAt;
  return {
    _id: UID(n), name: `Müşteri ${n}`, email: `m${n}@x.com`, phone: `0555000${String(n).padStart(4, "0")}`, role: "customer",
    createdAt, lastActive: createdAt, lastLoginAt: null, cartLastUpdated: createdAt, cartItems: [],
    appActivity: { lastSeenAt: null, checkoutAt: null, orderAt: null },
    ...fields,
  };
};
const stats = (fields = {}) => ({ orderCount: 1, totalSpent: 100, lastOrderAt: monthsAgo(14), activeOrderCount: 0, ...fields });
const classifyOne = (user, orderStats = null, months = 10, now = NOW) => {
  const map = new Map(orderStats ? [[String(user._id), orderStats]] : []);
  return classifyCustomers([user], map, now, months).customers[0];
};

const response = () => ({
  statusCode: 200, body: undefined, headers: {}, sent: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  set(key, value) { this.headers[key.toLowerCase()] = value; return this; },
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  send(body) { this.sent = body; return this; },
});
const getReq = (query = {}) => ({ query, user: ADMIN, method: "GET", originalUrl: "/api/account-cleanup/x" });
const postReq = (body = {}) => ({ body, user: ADMIN, method: "POST", originalUrl: "/api/account-cleanup/delete" });

// Sorgu zinciri: select/sort kaydedilir; lean() ya da doğrudan await sonucu döner
const chain = (value) => {
  const c = {
    select() { return c; },
    sort() { return c; },
    populate() { return c; },
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return c;
};

/** User.find + Order.aggregate taklidi ($in ve $match süzgeçlerine uyar). Çağrılar sayılır. */
const mockDb = (t, { users = [], groups = [] } = {}) => {
  const calls = { userFind: [], aggregate: [] };
  t.mock.method(User, "find", (filter = {}) => {
    calls.userFind.push(filter);
    const ids = filter?._id?.$in?.map(String);
    return chain(ids ? users.filter((user) => ids.includes(String(user._id))) : users);
  });
  t.mock.method(Order, "aggregate", async (pipeline) => {
    calls.aggregate.push(pipeline);
    const match = pipeline.find((stage) => stage.$match)?.$match;
    const ids = match?.user?.$in?.map(String);
    return ids ? groups.filter((group) => ids.includes(String(group._id))) : groups;
  });
  return calls;
};

/** deleteUserAccount'un tüm veritabanı adımlarını taklit eder ve kaydeder */
const mockAccountDeletion = (t, { users = [], failDeleteFor = [] } = {}) => {
  const fx = { findById: [], ordersUpdated: [], feedbackDeleted: [], usersDeleted: [], audits: [] };
  t.mock.method(User, "findById", (id) => {
    fx.findById.push(String(id));
    return chain(users.find((user) => String(user._id) === String(id)) || null);
  });
  t.mock.method(Order, "updateMany", async (filter, update) => { fx.ordersUpdated.push({ filter, update }); return { modifiedCount: 2 }; });
  t.mock.method(Feedback, "deleteMany", async (filter) => { fx.feedbackDeleted.push(filter); return { deletedCount: 1 }; });
  t.mock.method(Chat, "find", () => ({ distinct: async () => [] }));
  t.mock.method(SupportRequest, "deleteMany", async () => ({}));
  t.mock.method(SavedCart, "deleteMany", async () => ({}));
  t.mock.method(PhotocopyFile, "find", () => chain([]));
  t.mock.method(PhotocopyFile, "deleteMany", async () => ({}));
  t.mock.method(Referral, "deleteMany", async () => ({}));
  t.mock.method(Referral, "updateMany", async () => ({}));
  t.mock.method(Coupon, "deleteMany", async () => ({}));
  t.mock.method(Coupon, "updateMany", async () => ({}));
  t.mock.method(User, "findByIdAndDelete", async (id) => {
    if (failDeleteFor.includes(String(id))) throw new Error("bağlantı koptu");
    fx.usersDeleted.push(String(id));
    return { _id: id };
  });
  t.mock.method(AdminAudit, "create", async (doc) => { fx.audits.push(doc); return doc; });
  return fx;
};

test.beforeEach(() => clearAccountCleanupCache());

// ── classifyCustomers ────────────────────────────────────────────────────────

test("classify: lastActive default == createdAt and nothing else → inactive with source 'signup'", () => {
  const row = classifyOne(customer(1, { createdAt: monthsAgo(14) }));
  assert.equal(row.segment, "inactive");
  assert.equal(row.lastSeenSource, "signup");
  assert.equal(row.lastSeenAt.getTime(), monthsAgo(14).getTime());
  assert.equal(row.deletable, true);
  assert.equal(row.blockReason, null);
  // 2 dakikaya kadar sonra (şema default'u ile timestamps arasındaki fark) hâlâ "signup"
  const created = monthsAgo(14);
  assert.equal(classifyOne(customer(2, { createdAt: created, lastActive: new Date(created.getTime() + 2 * 60 * 1000) })).lastSeenSource, "signup");
  assert.equal(classifyOne(customer(3, { createdAt: created, lastActive: new Date(created.getTime() - 5) })).lastSeenSource, "signup");
  // 2 dakikadan sonra döndüyse gerçek web etkinliği
  assert.equal(classifyOne(customer(4, { createdAt: created, lastActive: new Date(created.getTime() + 3 * 60 * 1000) })).lastSeenSource, "web");
  // Kayıt anındaki giriş "signup"ı bozmaz; 2 dakikadan sonraki giriş gerçek etkinliktir
  assert.equal(classifyOne(customer(5, { createdAt: created, lastLoginAt: new Date(created.getTime() + 1000) })).lastSeenSource, "signup");
  assert.equal(classifyOne(customer(6, { createdAt: created, lastLoginAt: new Date(created.getTime() + 3 * 60 * 1000) })).lastSeenSource, "login");
});

test("classify: mobile signup (app pings within seconds) is 'signup'; later app use, orders, checkout or cart are not", () => {
  const created = monthsAgo(14);
  const plus = (ms) => new Date(created.getTime() + ms);
  const app = (fields) => ({ lastSeenAt: null, checkoutAt: null, orderAt: null, ...fields });
  const mobile = classifyOne(customer(1, { createdAt: created, appActivity: app({ lastSeenAt: plus(4000) }) }));
  assert.equal(mobile.lastSeenSource, "signup");
  assert.equal(mobile.segment, "inactive");
  assert.equal(mobile.lastSeenAt.getTime(), plus(4000).getTime());
  // Uygulamaya 5 dk sonra yine girmiş → gerçek uygulama etkinliği
  assert.equal(classifyOne(customer(2, { createdAt: created, appActivity: app({ lastSeenAt: plus(5 * 60 * 1000) }) })).lastSeenSource, "app");
  // Kayıttan hemen sonra sipariş, uygulamada ödeme adımı ya da dolu sepet → "signup" değil
  assert.equal(classifyOne(customer(3, { createdAt: created }), stats({ lastOrderAt: plus(2 * 60 * 1000 - 1) })).lastSeenSource, "order");
  assert.notEqual(classifyOne(customer(4, { createdAt: created, appActivity: app({ lastSeenAt: plus(3000), checkoutAt: plus(3000) }) })).lastSeenSource, "signup");
  assert.notEqual(classifyOne(customer(5, { createdAt: created, cartLastUpdated: plus(1000), cartItems: [{ addedAt: plus(1000) }] })).lastSeenSource, "signup");
  // Özet: signupOnly mobil kaydı da sayar
  const summary = buildSummary(classifyCustomers([customer(6, { createdAt: created }), customer(7, { createdAt: created, appActivity: app({ lastSeenAt: plus(4000) }) })], new Map(), NOW, 10), { now: NOW, months: 10 });
  assert.equal(summary.totals.signupOnly, 2);
  // "web" anahtarı profil/giriş isteğinden gelir (mobil uygulama da çağırır); etiket bunu söyler
  assert.equal(SOURCE_LABELS.web, "Site/uygulama (profil)");
});

test("classify: legacy users without lastActive (missing or null) and no other signal → never", () => {
  const legacy = customer(1, { createdAt: monthsAgo(30) });
  delete legacy.lastActive;
  const row = classifyOne(legacy);
  assert.equal(row.segment, "never");
  assert.equal(row.lastSeenAt, null);
  assert.equal(row.lastSeenSource, null);
  assert.equal(row.bucket, "never");
  assert.equal(row.deletable, true);
  assert.equal(classifyOne(customer(2, { lastActive: null })).segment, "never");
  assert.equal(classifyOne(customer(3, { lastActive: "bozuk-tarih" })).segment, "never");
});

test("classify: never segment younger than the cutoff is listed but too_new; exactly at cutoff is too_new", () => {
  const young = classifyOne(customer(1, { createdAt: monthsAgo(3), lastActive: null }));
  assert.equal(young.segment, "never");
  assert.equal(young.deletable, false);
  assert.equal(young.blockReason, "too_new");
  const atCutoff = classifyOne(customer(2, { createdAt: monthsAgo(10), lastActive: null }));
  assert.equal(atCutoff.blockReason, "too_new");
  const justOlder = classifyOne(customer(3, { createdAt: monthsAgo(10, -1), lastActive: null }));
  assert.equal(justOlder.deletable, true);
  // Daha kısa süre seçilince aynı hesap silinebilir hale gelir
  assert.equal(classifyOne(customer(4, { createdAt: monthsAgo(7), lastActive: null }), null, 6).deletable, true);
  assert.equal(classifyOne(customer(4, { createdAt: monthsAgo(7), lastActive: null }), null, 10).blockReason, "too_new");
});

test("classify: cart counts only when the cart has items; updatedAt is never a signal", () => {
  const old = monthsAgo(20);
  const emptyCart = classifyOne(customer(1, { createdAt: old, lastActive: null, cartLastUpdated: new Date(NOW.getTime() - DAY), cartItems: [], updatedAt: NOW }));
  assert.equal(emptyCart.segment, "never");
  const withItems = classifyOne(customer(2, { createdAt: old, lastActive: old, cartLastUpdated: new Date(NOW.getTime() - DAY), cartItems: [{ addedAt: old }] }));
  assert.equal(withItems.segment, "active");
  assert.equal(withItems.lastSeenSource, "cart");
  // cartLastUpdated yoksa ürünlerin eklenme zamanı kullanılır
  const fallback = classifyOne(customer(3, { createdAt: old, lastActive: old, cartLastUpdated: null, cartItems: [{ addedAt: monthsAgo(2) }] }));
  assert.equal(fallback.lastSeenSource, "cart");
  assert.equal(fallback.segment, "active");
});

test("classify: orders are a signal (recent order keeps the customer active, old one is the last seen)", () => {
  const old = monthsAgo(20);
  const recent = classifyOne(customer(1, { createdAt: old, lastActive: old }), stats({ lastOrderAt: monthsAgo(1), orderCount: 3, totalSpent: 412.456 }));
  assert.equal(recent.segment, "active");
  assert.equal(recent.lastSeenSource, "order");
  assert.equal(recent.orderCount, 3);
  assert.equal(recent.totalSpent, 412.46);
  const stale = classifyOne(customer(2, { createdAt: old, lastActive: null }), stats({ lastOrderAt: monthsAgo(12) }));
  assert.equal(stale.segment, "inactive");
  assert.equal(stale.lastSeenSource, "order");
  assert.equal(stale.deletable, true);
  assert.equal(stale.lastOrderAt.getTime(), monthsAgo(12).getTime());
  // Siparişi olan hesap asla "never" değildir
  assert.notEqual(stale.segment, "never");
});

test("classify: active order (Hazırlanıyor/Yolda) blocks deletion in both segments", () => {
  const row = classifyOne(customer(1, { createdAt: monthsAgo(30), lastActive: null }), stats({ lastOrderAt: monthsAgo(11), activeOrderCount: 1 }));
  assert.equal(row.segment, "inactive");
  assert.equal(row.deletable, false);
  assert.equal(row.blockReason, "active_order");
  assert.equal(row.activeOrderCount, 1);
});

test("classify: admins are excluded and counted separately; app and login signals; ties prefer login over web", () => {
  const old = monthsAgo(20);
  const users = [
    { ...customer(1), role: "admin", lastActive: null },
    customer(2, { createdAt: old, lastActive: old, appActivity: { lastSeenAt: monthsAgo(15), checkoutAt: monthsAgo(4), orderAt: null } }),
    customer(3, { createdAt: old, lastActive: monthsAgo(11), lastLoginAt: monthsAgo(11) }),
  ];
  const { admins, customers } = classifyCustomers(users, new Map(), NOW, 10);
  assert.equal(admins, 1);
  assert.deepEqual(customers.map((row) => row._id), [UID(2), UID(3)]);
  assert.equal(customers[0].lastSeenSource, "app");
  assert.equal(customers[0].segment, "active");
  assert.equal(customers[1].lastSeenSource, "login");
  assert.equal(customers[1].segment, "inactive");
});

test("classify: month boundaries — exactly at cutoff stays active, 1 ms older is inactive; months change the result", () => {
  const old = monthsAgo(30);
  assert.equal(classifyOne(customer(1, { createdAt: old, lastActive: monthsAgo(10) })).segment, "active");
  assert.equal(classifyOne(customer(2, { createdAt: old, lastActive: monthsAgo(10, -1) })).segment, "inactive");
  const user = customer(3, { createdAt: old, lastActive: monthsAgo(8) });
  assert.equal(classifyOne(user, null, 6).segment, "inactive");
  assert.equal(classifyOne(user, null, 10).segment, "active");
  for (const months of MONTH_OPTIONS) {
    const cutoff = classifyCustomers([], new Map(), NOW, months).cutoff;
    const expected = new Date(NOW);
    expected.setMonth(expected.getMonth() - months);
    assert.equal(cutoff.getTime(), expected.getTime());
  }
});

test("cutoffFor: month-end days are clamped to the target month's last day (no roll-over into the next month)", () => {
  // Yerel saatle kurulur: sonuç saat diliminden bağımsızdır
  const local = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0, 0);
  const cases = [
    [local(2026, 12, 31), 10, local(2026, 2, 28)],
    [local(2026, 8, 31), 6, local(2026, 2, 28)],
    [local(2026, 10, 31), 18, local(2025, 4, 30)],
    [local(2027, 3, 31), 1, local(2027, 2, 28)],
    [local(2028, 3, 31), 1, local(2028, 2, 29)],
    [local(2026, 10, 23), 10, local(2025, 12, 23)], // ay sonu değil → değişmez
    [local(2026, 5, 31), 24, local(2024, 5, 31)],
  ];
  for (const [from, months, expected] of cases) {
    assert.equal(cutoffFor(from, months).getTime(), expected.getTime(), `${from.toDateString()} − ${months} ay`);
  }
  // Saat korunur
  assert.equal(cutoffFor(new Date(2026, 11, 31, 23, 45, 10, 5), 10).getTime(), new Date(2026, 1, 28, 23, 45, 10, 5).getTime());
});

test("classify: on Dec 31 a customer last seen Mar 1 (9 months 30 days) is still active for 10 months", () => {
  const now = new Date(2026, 11, 31, 12, 0, 0);
  const user = customer(1, { createdAt: new Date(2024, 0, 10), lastActive: new Date(2026, 2, 1, 12, 0, 0) });
  const row = classifyOne(user, null, 10, now);
  assert.equal(row.segment, "active");
  assert.equal(row.deletable, false);
  // Eşik 28 Şubat 12:00: bir an önce görülen pasiftir
  assert.equal(classifyOne(customer(2, { createdAt: new Date(2024, 0, 10), lastActive: new Date(2026, 1, 28, 11, 59, 59) }), null, 10, now).segment, "inactive");
  // Son 1 ay kovası 31 Mart'ta 28 Şubat'tan başlar
  const march = new Date(2027, 2, 31, 12, 0, 0);
  assert.equal(classifyOne(customer(3, { createdAt: new Date(2024, 0, 10), lastActive: new Date(2027, 2, 1, 12, 0, 0) }), null, 10, march).bucket, "0-1");
});

test("classify: missing createdAt falls back to the _id timestamp; distribution buckets", () => {
  const id = new mongoose.Types.ObjectId(Math.floor(monthsAgo(30).getTime() / 1000));
  const row = classifyOne({ _id: id, name: "Eski Hesap", email: "e@x.com", role: "customer" });
  assert.equal(row.segment, "never");
  assert.equal(row.deletable, true);
  assert.equal(row.createdAt.getTime(), Math.floor(monthsAgo(30).getTime() / 1000) * 1000);

  const old = monthsAgo(40);
  const users = [0.5, 2, 4, 8, 11, 13, 30].map((m, i) => customer(i + 1, { createdAt: old, lastActive: new Date(NOW.getTime() - m * 30.5 * DAY) }));
  const buckets = classifyCustomers(users, new Map(), NOW, 10).customers.map((r) => r.bucket);
  assert.deepEqual(buckets, ["0-1", "1-3", "3-6", "6-10", "10-12", "12-24", "24+"]);
});

test("buildSummary: exact totals over all customers, distribution sums to customers", () => {
  const old = monthsAgo(30);
  const users = [
    { ...customer(99), role: "admin" },
    customer(1, { createdAt: monthsAgo(14) }), // inactive, signup, deletable
    customer(2, { createdAt: old, lastActive: monthsAgo(12, 0) }), // inactive web? lastActive ≠ createdAt → web, deletable, with orders
    customer(3, { createdAt: old, lastActive: null }), // never deletable
    customer(4, { createdAt: monthsAgo(2), lastActive: null }), // never too_new
    customer(5, { createdAt: old, lastActive: null }), // inactive (order) blocked active order
    customer(6, { createdAt: old, lastActive: monthsAgo(1) }), // active
  ];
  const orderStats = new Map([
    [UID(2), stats({ orderCount: 4, totalSpent: 250.5, lastOrderAt: monthsAgo(13) })],
    [UID(5), stats({ orderCount: 2, totalSpent: 80, lastOrderAt: monthsAgo(11), activeOrderCount: 1 })],
    [UID(6), stats({ orderCount: 7, totalSpent: 999, lastOrderAt: monthsAgo(1) })],
  ]);
  const summary = buildSummary(classifyCustomers(users, orderStats, NOW, 10), { now: NOW, months: 10, deletedAccounts: { users: 3, orders: 9 } });
  assert.equal(summary.generatedAt, NOW.toISOString());
  assert.equal(summary.months, 10);
  assert.equal(summary.cutoff, monthsAgo(10).toISOString());
  assert.deepEqual(summary.totals, {
    customers: 6, admins: 1, inactive: 3, inactiveDeletable: 2, never: 2, neverDeletable: 1, neverTooNew: 1,
    blockedActiveOrders: 1, signupOnly: 1, candidatesWithOrders: 1, candidatesWithoutOrders: 2, ordersPreserved: 4, revenuePreserved: 250.5,
  });
  assert.deepEqual(summary.distribution.map((b) => b.key), ["0-1", "1-3", "3-6", "6-10", "10-12", "12-24", "24+", "never"]);
  assert.equal(summary.distribution.reduce((sum, b) => sum + b.count, 0), 6);
  assert.equal(summary.distribution.find((b) => b.key === "never").count, 2);
  assert.equal(summary.distribution.find((b) => b.key === "never").label, "Kayıt yok");
  assert.deepEqual(summary.deletedAccounts, { users: 3, orders: 9 });
});

test("toOrderStats: groups to map; deleted accounts = orders whose account no longer exists", () => {
  const groups = [
    { _id: new mongoose.Types.ObjectId(UID(1)), orderCount: 3, totalSpent: 10.005, lastOrderAt: NOW, activeOrderCount: 1, deletedOrders: 0 },
    // Hesabı duruyor ama siparişleri işaretli (kısmi silme: yalnızca sipariş geçmişi) → silinmiş hesap DEĞİL
    { _id: new mongoose.Types.ObjectId(UID(2)), orderCount: 4, totalSpent: 5, lastOrderAt: NOW, activeOrderCount: 0, deletedOrders: 4 },
    // Eski yönetici silmesi: hesap yok, siparişler işaretsiz → silinmiş hesap
    { _id: new mongoose.Types.ObjectId(UID(3)), orderCount: 3, totalSpent: 5, lastOrderAt: NOW, activeOrderCount: 0, deletedOrders: 0 },
    // Yeni silme: hesap yok, siparişler işaretli → silinmiş hesap
    { _id: new mongoose.Types.ObjectId(UID(4)), orderCount: 2, totalSpent: 5, lastOrderAt: NOW, activeOrderCount: 0, deletedOrders: 2 },
    { _id: null, orderCount: 9 },
  ];
  const existing = new Set([UID(1), UID(2)]);
  const { map, deletedAccounts } = toOrderStats(groups, existing);
  assert.equal(map.size, 4);
  assert.equal(map.get(UID(1)).activeOrderCount, 1);
  assert.equal(map.get(UID(1)).totalSpent, 10.01);
  assert.deepEqual(deletedAccounts, { users: 2, orders: 5 });
  // Kullanıcı listesi verilmezse (silme anındaki kısmi okuma) userDeleted işaretine bakılır
  assert.deepEqual(toOrderStats(groups).deletedAccounts, { users: 2, orders: 6 });
});

// ── Doğrulama ────────────────────────────────────────────────────────────────

test("parseListQuery: defaults and whitelist validation", () => {
  assert.deepEqual(parseListQuery({}).value, { segment: "inactive", months: 10, q: "", orders: "all", source: "all", sort: "lastSeen", dir: "asc", page: 1, limit: 50 });
  assert.equal(parseListQuery({ sort: "spent" }).value.dir, "desc");
  assert.deepEqual(parseListQuery({ segment: "never", months: "24", q: "  ayşe   y ", orders: "with", source: "signup", sort: "name", dir: "desc", page: "3", limit: "200" }).value,
    { segment: "never", months: 24, q: "ayşe y", orders: "with", source: "signup", sort: "name", dir: "desc", page: 3, limit: 200 });
  const bad = [
    [{ months: "7" }, "months"], [{ months: "abc" }, "months"], [{ months: ["10", "12"] }, "months"], [{ months: "10.5" }, "months"],
    [{ segment: "active" }, "segment"], [{ segment: { $ne: 1 } }, "segment"],
    [{ q: "x".repeat(61) }, "q"], [{ q: { $regex: ".*" } }, "q"], [{ q: ["a", "b"] }, "q"],
    [{ orders: "some" }, "orders"], [{ source: "web" }, "source"], [{ sort: "email" }, "sort"], [{ dir: "up" }, "dir"],
    [{ page: "0" }, "page"], [{ page: "-1" }, "page"], [{ page: "1.5" }, "page"], [{ page: "100001" }, "page"],
    [{ limit: "0" }, "limit"], [{ limit: "201" }, "limit"], [{ limit: "abc" }, "limit"],
  ];
  for (const [query, field] of bad) {
    const parsed = parseListQuery(query);
    assert.ok(parsed.error, `${JSON.stringify(query)} must be refused`);
    assert.equal(parsed.field, field);
  }
  assert.equal(parseListQuery({ q: "x".repeat(60) }).value.q.length, 60);
});

test("parseDeleteBody: 1..100 hex ids (deduped, lowercased), segment and months required", () => {
  const ok = parseDeleteBody({ userIds: [UID(1), UID(1).toUpperCase(), UID(2)], segment: "never", months: 12 });
  assert.deepEqual(ok.value, { ids: [UID(1), UID(2)], segment: "never", months: 12 });
  assert.equal(parseDeleteBody({ userIds: [UID(1)], segment: "inactive", months: "10" }).value.months, 10);
  const bad = [
    [{}, "userIds"], [{ userIds: [] }, "userIds"], [{ userIds: UID(1) }, "userIds"],
    [{ userIds: Array.from({ length: 101 }, (_, i) => UID(i + 1)) }, "userIds"],
    [{ userIds: ["bozuk"] }, "userIds"], [{ userIds: [{ $gt: "" }] }, "userIds"], [{ userIds: [`${UID(1)}0`] }, "userIds"],
    [{ userIds: [UID(1)], months: 10 }, "segment"], [{ userIds: [UID(1)], segment: "active", months: 10 }, "segment"],
    [{ userIds: [UID(1)], segment: "inactive" }, "months"], [{ userIds: [UID(1)], segment: "inactive", months: 9 }, "months"],
  ];
  for (const [body, field] of bad) {
    const parsed = parseDeleteBody(body);
    assert.ok(parsed.error, `${JSON.stringify(body).slice(0, 80)} must be refused`);
    assert.equal(parsed.field, field);
  }
  assert.equal(parseDeleteBody({ userIds: Array.from({ length: 100 }, (_, i) => UID(i + 1)), segment: "inactive", months: 10 }).value.ids.length, 100);
});

test("search: Turkish-insensitive name/e-mail, digits for phone, regex characters are literal", () => {
  const row = { _id: UID(1), name: "Şahin Işıkçı", email: "SAHIN@Örnek.com", phone: "+90 (555) 123 45 67" };
  for (const q of ["şahin", "SAHİN", "sahin isikci", "IŞIKÇI", "örnek", "ornek.com", "555 123", "05551234567", UID(1)]) {
    assert.equal(matchesQuery(row, q), true, q);
  }
  for (const q of [".*", "^Ş", "a|b", "(", "[", "\\", "12"]) assert.equal(matchesQuery(row, q), false, q);
  assert.equal(matchesQuery(row, ""), true);
});

test("search: a +90 / 0090 country code is dropped from partial phone queries; a bare 90 is not", () => {
  const stored = { _id: UID(1), name: "Ali", email: "a@x.com", phone: "05550001234" };
  for (const q of ["+90 555 000", "+90555000", "0090 555", "00 90 5550", "+90 555 000 12 34", "+905550001234", "0555 000", "555 000"]) {
    assert.equal(matchesQuery(stored, q), true, q);
  }
  assert.equal(matchesQuery({ ...stored, phone: "+905550001234" }, "+90 555 000"), true);
  // Çıplak "90" numaranın ortası olabilir: atılmaz
  assert.equal(matchesQuery({ ...stored, phone: "05329051234" }, "905"), true);
  assert.equal(matchesQuery(stored, "90555"), false);
  assert.equal(matchesQuery(stored, "+90 444"), false);
});

test("all endpoints require protectRoute + adminRoute", () => {
  const routes = router.stack.filter((layer) => layer.route).map((layer) => ({
    path: layer.route.path, method: Object.keys(layer.route.methods)[0], names: layer.route.stack.map((s) => s.handle.name),
  }));
  assert.deepEqual(routes.map((r) => `${r.method} ${r.path}`), ["get /summary", "get /users", "get /ids", "get /export", "post /delete"]);
  for (const route of routes) assert.deepEqual(route.names.slice(0, 2), ["protectRoute", "adminRoute"]);
  const del = userRoutes.stack.find((layer) => layer.route?.path === "/:userId" && layer.route.methods.delete).route;
  assert.deepEqual(del.stack.map((s) => s.handle.name), ["protectRoute", "adminRoute", "deleteUser"]);
});

// ── Uç noktalar ──────────────────────────────────────────────────────────────

const now = () => new Date();
const ago = (months, extraMs = 0) => monthsAgo(months, extraMs, now());
const fixture = () => {
  const old = ago(30);
  const users = [
    { ...customer(90, { createdAt: old }), role: "admin" },
    customer(1, { name: "Ayşe Şahin", createdAt: ago(14), lastActive: ago(14) }), // inactive signup
    customer(2, { name: "Burak Çelik", createdAt: old, lastActive: ago(11) }), // inactive web (orders)
    customer(3, { name: "=Cem", createdAt: old, lastActive: null }), // inactive via order, active order → blocked
    customer(4, { name: "Deniz Öz", createdAt: old, lastActive: null }), // never deletable
    customer(5, { name: "Ece Yıldız", createdAt: ago(2), lastActive: null }), // never too_new
    customer(6, { name: "Fatih Er", createdAt: old, lastActive: ago(1) }), // active
  ];
  const groups = [
    { _id: new mongoose.Types.ObjectId(UID(2)), orderCount: 4, totalSpent: 250.5, lastOrderAt: ago(13), activeOrderCount: 0, deletedOrders: 0 },
    { _id: new mongoose.Types.ObjectId(UID(3)), orderCount: 2, totalSpent: 80, lastOrderAt: ago(12, -DAY), activeOrderCount: 1, deletedOrders: 0 },
    { _id: new mongoose.Types.ObjectId(UID(6)), orderCount: 1, totalSpent: 40, lastOrderAt: ago(1), activeOrderCount: 0, deletedOrders: 0 },
    { _id: new mongoose.Types.ObjectId(UID(77)), orderCount: 5, totalSpent: 300, lastOrderAt: ago(5), activeOrderCount: 0, deletedOrders: 5 },
  ];
  return { users, groups };
};

test("GET /summary: 400 for months outside the whitelist before any query", async (t) => {
  const calls = mockDb(t, fixture());
  for (const months of ["7", "0", "x", ["10"]]) {
    const res = response();
    await getSummary(getReq({ months }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /6, 10, 12, 18 ya da 24/);
  }
  assert.equal(calls.userFind.length, 0);
  assert.equal(calls.aggregate.length, 0);
});

test("GET /summary: exact numbers, no-store, cached for repeated calls (any months) until invalidated", async (t) => {
  const calls = mockDb(t, fixture());
  const res = response();
  await getSummary(getReq({}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.body.months, 10);
  assert.deepEqual(Object.keys(res.body), ["generatedAt", "months", "cutoff", "totals", "distribution", "deletedAccounts"]);
  assert.deepEqual(res.body.totals, {
    customers: 6, admins: 1, inactive: 3, inactiveDeletable: 2, never: 2, neverDeletable: 1, neverTooNew: 1,
    blockedActiveOrders: 1, signupOnly: 1, candidatesWithOrders: 1, candidatesWithoutOrders: 2, ordersPreserved: 4, revenuePreserved: 250.5,
  });
  assert.deepEqual(res.body.deletedAccounts, { users: 1, orders: 5 });
  // Kullanıcı alanları seçilir: hassas alanlar (şifre, fcmToken) okunmaz
  assert.equal(calls.userFind.length, 1);
  assert.deepEqual(calls.aggregate[0].map((stage) => Object.keys(stage)[0]), ["$group"]);

  const res12 = response();
  await getSummary(getReq({ months: "12" }), res12);
  assert.equal(res12.body.months, 12);
  assert.equal(res12.body.totals.inactive, 2);
  assert.equal(calls.userFind.length, 1, "second call uses the 30 s cache");
});

test("GET /users: filters, sorting, paging and public row shape; total is over all matches", async (t) => {
  mockDb(t, fixture());
  const res = response();
  await getUsers(getReq({ segment: "inactive", limit: "2" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body), ["users", "total", "page", "pages", "limit", "segment", "months"]);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.pages, 2);
  assert.equal(res.body.users.length, 2);
  // Varsayılan: en uzun süredir görülmeyen önce (14 ay, 12 ay + 1 gün, 11 ay)
  assert.deepEqual(res.body.users.map((u) => u._id), [UID(1), UID(3)]);
  assert.deepEqual(Object.keys(res.body.users[0]), ["_id", "name", "email", "phone", "createdAt", "lastSeenAt", "lastSeenSource", "orderCount", "totalSpent", "lastOrderAt", "activeOrderCount", "deletable", "blockReason"]);
  assert.equal(res.body.users[0].lastSeenSource, "signup");
  assert.equal(typeof res.body.users[0].createdAt, "string");

  const page2 = response();
  await getUsers(getReq({ segment: "inactive", limit: "2", page: "2" }), page2);
  assert.deepEqual(page2.body.users.map((u) => [u._id, u.deletable, u.blockReason]), [[UID(2), true, null]]);
  assert.deepEqual(res.body.users.map((u) => [u._id, u.deletable, u.blockReason]), [[UID(1), true, null], [UID(3), false, "active_order"]]);
  // Son sayfanın ötesi son sayfaya çekilir
  const beyond = response();
  await getUsers(getReq({ segment: "inactive", limit: "2", page: "9" }), beyond);
  assert.equal(beyond.body.page, 2);

  const filtered = async (query) => { const r = response(); await getUsers(getReq(query), r); return r.body.users.map((u) => u._id); };
  assert.deepEqual(await filtered({ orders: "with" }), [UID(3), UID(2)]);
  assert.deepEqual(await filtered({ orders: "without" }), [UID(1)]);
  assert.deepEqual(await filtered({ source: "signup" }), [UID(1)]);
  assert.deepEqual(await filtered({ q: "AYSE sahin" }), [UID(1)]);
  assert.deepEqual(await filtered({ q: ".*" }), []);
  assert.deepEqual(await filtered({ sort: "spent" }), [UID(2), UID(3), UID(1)]);
  assert.deepEqual(await filtered({ sort: "name", dir: "desc" }), [UID(2), UID(1), UID(3)]);
  assert.deepEqual(await filtered({ segment: "never" }), [UID(4), UID(5)]);

  const bad = response();
  await getUsers(getReq({ limit: "500" }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.field, "limit");
});

test("GET /ids: only deletable ids of all matches, with total/deletable/blocked", async (t) => {
  mockDb(t, fixture());
  const res = response();
  await getIds(getReq({ segment: "inactive" }), res);
  assert.deepEqual(res.body, { ids: [UID(1), UID(2)], total: 3, deletable: 2, blocked: 1 });
  const never = response();
  await getIds(getReq({ segment: "never" }), never);
  assert.deepEqual(never.body, { ids: [UID(4)], total: 2, deletable: 1, blocked: 1 });
  const bad = response();
  await getIds(getReq({ segment: "hepsi" }), bad);
  assert.equal(bad.statusCode, 400);
});

test("GET /export: UTF-8 BOM CSV with ';', Turkish headers, formula injection escaped", async (t) => {
  mockDb(t, fixture());
  const res = response();
  await exportCsv(getReq({ segment: "inactive" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "text/csv; charset=utf-8");
  assert.match(res.headers["content-disposition"], /^attachment; filename="pasif-hesaplar-10-ay-pasif-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.ok(res.sent.startsWith("﻿"));
  const lines = res.sent.slice(1).trimEnd().split("\r\n");
  assert.equal(lines[0], "Ad;E-posta;Telefon;Kayıt tarihi;Son görülme;Kaynak;Sipariş sayısı;Toplam harcama;Son sipariş;Silinebilir;Neden");
  assert.equal(lines.length, 4);
  const cem = lines.find((line) => line.includes("Cem"));
  assert.ok(cem.startsWith("'=Cem;"), cem);
  assert.match(cem, /;Hayır;Aktif siparişi var$/);
  assert.match(lines.find((l) => l.startsWith("Burak")), /;4;250,50;/);
  assert.match(lines.find((l) => l.startsWith("Ayşe")), /;Yalnızca kayıt;0;0,00;;Evet;$/);

  assert.equal(csvCell("+905551112233"), "'+905551112233");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell('a;b "c"'), '"a;b ""c"""');
  assert.equal(csvCell("satır\nsonu"), '"satır\nsonu"');
  const never = buildCleanupCsv([{ name: "X", email: "", phone: "", createdAt: null, lastSeenAt: null, lastSeenSource: null, orderCount: 0, totalSpent: 0, lastOrderAt: null, deletable: false, blockReason: "too_new" }], { months: 12 });
  assert.match(never, /;Kayıt yok;;0;0,00;;Hayır;Hesap 12 aydan yeni\r\n$/);
});

test("sortRows: ties are broken by id so pages are stable", () => {
  const rows = [{ _id: "b", name: "A", orderCount: 1, totalSpent: 1 }, { _id: "a", name: "A", orderCount: 1, totalSpent: 1 }];
  assert.deepEqual(sortRows(rows, "name", "asc").map((r) => r._id), ["a", "b"]);
  assert.deepEqual(sortRows(rows, "orders", "desc").map((r) => r._id), ["a", "b"]);
});

// ── Silme ────────────────────────────────────────────────────────────────────

test("POST /delete: invalid bodies are refused before any query", async (t) => {
  const calls = mockDb(t, fixture());
  const fx = mockAccountDeletion(t);
  for (const body of [{}, { userIds: [] }, { userIds: ["x"], segment: "inactive", months: 10 }, { userIds: [UID(1)], segment: "inactive", months: 11 },
    { userIds: Array.from({ length: 101 }, (_, i) => UID(i)), segment: "inactive", months: 10 }]) {
    const req = postReq(body);
    const res = response();
    await deleteUsers(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(req.auditRecorded, true, "fallback audit must not write a wrong section name");
  }
  assert.equal(calls.userFind.length + calls.aggregate.length + fx.findById.length, 0);
});

test("POST /delete: every id is re-validated; skipped reasons; feedback kept; orders marked; audit; cache invalidated", async (t) => {
  const data = fixture();
  data.users.push({ ...customer(91), _id: ADMIN_ID, role: "admin" });
  const calls = mockDb(t, data);
  const fx = mockAccountDeletion(t, { users: data.users });

  // Önce özet önbelleğe alınır
  await getSummary(getReq({}), response());
  assert.equal(calls.userFind.length, 1);

  const missing = UID(55);
  const req = postReq({ userIds: [UID(1), UID(2), UID(3), UID(4), UID(6), UID(90), ADMIN_ID, missing], segment: "inactive", months: 10 });
  const res = response();
  await deleteUsers(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body), ["deleted", "skipped", "ordersPreserved"]);
  assert.deepEqual(res.body.deleted, [UID(1), UID(2)]);
  assert.deepEqual(res.body.skipped, [
    { id: UID(3), reason: "active_order" },
    { id: UID(4), reason: "not_in_segment" }, // "never" segmentinde
    { id: UID(6), reason: "not_in_segment" }, // artık aktif
    { id: UID(90), reason: "admin" },
    { id: ADMIN_ID, reason: "self" },
    { id: missing, reason: "not_found" },
  ]);
  // Siparişler: UID(1) yok → 0 (servis 2 işaretledi diyor) → max(2, 0); UID(2) 4 sipariş
  assert.equal(res.body.ordersPreserved, 2 + 4);

  // Yeniden doğrulama taze veriyle yapıldı (önbellek değil): yalnızca istenen kimlikler
  const freshFind = calls.userFind[1];
  assert.deepEqual(freshFind._id.$in.map(String).sort(), [UID(1), UID(2), UID(3), UID(4), UID(6), UID(90), ADMIN_ID, missing].sort());
  assert.ok(calls.aggregate[1][0].$match.user.$in.length === 8);

  // Hesap silindi, geri bildirim KORUNDU, siparişler işaretlendi
  assert.deepEqual(fx.usersDeleted, [UID(1), UID(2)]);
  assert.equal(fx.feedbackDeleted.length, 0, "Feedback.deleteMany must not be called (keepFeedback)");
  assert.equal(fx.ordersUpdated.length, 2);
  assert.equal(String(fx.ordersUpdated[0].filter.user), UID(1));
  assert.equal(fx.ordersUpdated[0].update.$set.userDeleted, true);
  assert.ok(fx.ordersUpdated[0].update.$set.userDeletedAt instanceof Date);

  await tick();
  assert.equal(fx.audits.length, 1);
  assert.equal(fx.audits[0].action, "Pasif hesap silme");
  assert.equal(fx.audits[0].category, "customer");
  assert.equal(fx.audits[0].target, "2 hesap");
  assert.equal(fx.audits[0].targetName, "Ayşe Şahin, Burak Çelik");
  assert.deepEqual(fx.audits[0].meta.deletedIds, [UID(1), UID(2)]);
  assert.equal(fx.audits[0].meta.segment, "inactive");
  assert.equal(fx.audits[0].meta.months, 10);
  assert.ok(fx.audits[0].changes.some((c) => c.label === "Korunan sipariş" && c.to === "6"));

  // Her silinen hesap silinmeden hemen önce tek başına yeniden okundu
  assert.deepEqual(calls.userFind.slice(2).map((filter) => filter._id.$in.map(String)), [[UID(1)], [UID(2)]]);
  assert.equal(calls.userFind.length, 4);

  // Önbellek temizlendi: sonraki özet yeniden okunur (tüm kullanıcılar, süzgeçsiz)
  await getSummary(getReq({}), response());
  assert.equal(calls.userFind.length, 5);
  assert.deepEqual(calls.userFind[4], {});
});

test("POST /delete: each account is re-checked right before its deletion; activity during the batch → skipped", async (t) => {
  const data = fixture();
  data.users.push(customer(8, { name: "Gizem Ay", createdAt: ago(30), lastActive: ago(20) }));
  const byId = (id) => data.users.find((user) => user._id === id);
  // Toplu doğrulamadan sonra: UID(2) giriş yaptı, UID(8) yönetici yapıldı
  const changed = new Map([
    [UID(2), { ...byId(UID(2)), lastLoginAt: new Date() }],
    [UID(8), { ...byId(UID(8)), role: "admin" }],
  ]);
  const finds = [];
  t.mock.method(User, "find", (filter = {}) => {
    finds.push(filter);
    const ids = filter._id.$in.map(String);
    const pool = finds.length > 1 ? data.users.map((user) => changed.get(user._id) || user) : data.users;
    return chain(pool.filter((user) => ids.includes(String(user._id))));
  });
  t.mock.method(Order, "aggregate", async (pipeline) => {
    const ids = pipeline[0].$match.user.$in.map(String);
    return data.groups.filter((group) => ids.includes(String(group._id)));
  });
  const fx = mockAccountDeletion(t, { users: data.users });
  const res = response();
  await deleteUsers(postReq({ userIds: [UID(1), UID(2), UID(8)], segment: "inactive", months: 10 }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    deleted: [UID(1)],
    skipped: [{ id: UID(2), reason: "not_in_segment" }, { id: UID(8), reason: "admin" }],
    ordersPreserved: 2, // UID(1): servis 2 işaretledi diyor
  });
  assert.deepEqual(fx.usersDeleted, [UID(1)]);
  assert.equal(fx.ordersUpdated.length, 1);
  assert.deepEqual(finds.map((filter) => filter._id.$in.map(String)), [[UID(1), UID(2), UID(8)], [UID(1)], [UID(2)], [UID(8)]]);
  await tick();
  assert.equal(fx.audits.length, 1);
});

test("POST /delete: never segment re-validation (too_new) and failures are reported, not thrown", async (t) => {
  const data = fixture();
  data.users.push(customer(8, { createdAt: ago(30), lastActive: null }));
  mockDb(t, data);
  const fx = mockAccountDeletion(t, { users: data.users.filter((u) => u._id !== UID(8)), failDeleteFor: [UID(4)] });
  const req = postReq({ userIds: [UID(4), UID(5), UID(8), UID(1)], segment: "never", months: 10 });
  const res = response();
  await deleteUsers(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    deleted: [],
    skipped: [
      { id: UID(5), reason: "too_new" },
      { id: UID(1), reason: "not_in_segment" },
      { id: UID(4), reason: "error" }, // silme adımı hata verdi
      { id: UID(8), reason: "not_found" }, // doğrulamadan sonra başka yerden silinmiş
    ],
    ordersPreserved: 0,
  });
  await tick();
  assert.equal(fx.audits.length, 0, "nothing deleted → no audit entry");
  assert.equal(req.auditRecorded, true);
});

// ── Hesap silme servisi ve yönetici DELETE /api/users/:id ────────────────────

test("deleteUserAccount: customer self-delete (default) still deletes feedback; keepFeedback keeps it", async (t) => {
  const user = customer(1);
  const fx = mockAccountDeletion(t, { users: [user] });
  const result = await deleteUserAccount(UID(1));
  assert.deepEqual(result, { userId: UID(1), ordersAnonymized: 2 });
  assert.equal(fx.feedbackDeleted.length, 1);
  assert.equal(String(fx.feedbackDeleted[0].user), UID(1));
  assert.equal(fx.ordersUpdated.length, 1);
  assert.deepEqual(fx.usersDeleted, [UID(1)]);

  await deleteUserAccount(UID(1), { keepFeedback: true });
  assert.equal(fx.feedbackDeleted.length, 1, "keepFeedback → Feedback.deleteMany not called");
  assert.equal(fx.ordersUpdated.length, 2);
  // Yalnızca tam olarak true kabul edilir
  await deleteUserAccount(UID(1), { keepFeedback: "evet" });
  assert.equal(fx.feedbackDeleted.length, 2);
  await assert.rejects(() => deleteUserAccount(UID(9)), (error) => error.code === "USER_NOT_FOUND");
});

test("admin DELETE /api/users/:id uses the account service (orders kept, feedback kept) and keeps the response shape", async (t) => {
  const user = customer(1, { name: "Gül Ak" });
  const fx = mockAccountDeletion(t, { users: [user] });
  const req = { params: { userId: UID(1) }, user: ADMIN, method: "DELETE", originalUrl: `/api/users/${UID(1)}` };
  const res = response();
  await deleteUser(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "Kullanıcı başarıyla silindi" });
  assert.equal(fx.ordersUpdated.length, 1);
  assert.equal(fx.ordersUpdated[0].update.$set.userDeleted, true);
  assert.equal(fx.feedbackDeleted.length, 0);
  assert.deepEqual(fx.usersDeleted, [UID(1)]);
  await tick();
  assert.equal(fx.audits.length, 1);
  assert.equal(fx.audits[0].action, "Müşteri hesabı silindi");
  assert.equal(fx.audits[0].targetName, "Gül Ak");
  assert.equal(req.auditRecorded, true);
});

test("admin DELETE /api/users/:id blocks admins, self, bad ids; 404 when missing", async (t) => {
  const otherAdmin = { ...customer(2), role: "admin" };
  const fx = mockAccountDeletion(t, { users: [otherAdmin] });
  const call = async (userId) => { const res = response(); await deleteUser({ params: { userId }, user: ADMIN, method: "DELETE", originalUrl: "/api/users/x" }, res); return res; };

  const self = await call(ADMIN_ID);
  assert.equal(self.statusCode, 400);
  assert.deepEqual(Object.keys(self.body), ["success", "message"]);
  assert.equal(self.body.success, false);

  const admin = await call(UID(2));
  assert.equal(admin.statusCode, 403);
  assert.equal(admin.body.success, false);
  assert.match(admin.body.message, /Yönetici/);

  const bad = await call("bozuk");
  assert.equal(bad.statusCode, 400);

  const missing = await call(UID(3));
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { success: false, message: "Kullanıcı bulunamadı" });

  assert.equal(fx.ordersUpdated.length, 0);
  assert.equal(fx.usersDeleted.length, 0);
  assert.equal(fx.feedbackDeleted.length, 0);
});

// ── Geri bildirimler: kullanıcısı silinmiş kayıt ─────────────────────────────

test("feedback list: deleted user (populate null) shows 'Silinmiş hesap' instead of crashing", async (t) => {
  const docs = [
    { _id: "f1", user: null, title: "1. sipariş", toJSON() { return { _id: "f1", user: null, title: "1. sipariş" }; } },
    { _id: "f2", user: { _id: UID(1), name: "Ayşe" }, title: "Genel" },
  ];
  t.mock.method(Feedback, "find", () => chain(docs));
  const res = response();
  await getAllFeedbacks({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(res.body[0], { _id: "f1", title: "1. sipariş", user: { _id: null, name: "Silinmiş hesap", email: "", avatar: null, deleted: true } });
  assert.equal(res.body[1], docs[1], "records with a user are passed through unchanged");
  assert.equal(withDeletedUser(null), null);
});

test("feedback compensation: no coupon for a deleted account (409), nothing created", async (t) => {
  const created = [];
  t.mock.method(Coupon, "create", async (doc) => { created.push(doc); return { _id: "c1", code: "X", ...doc }; });
  const feedbackId = new mongoose.Types.ObjectId().toString();
  const call = async (feedback, exists) => {
    t.mock.method(Feedback, "findById", () => chain(feedback));
    t.mock.method(User, "exists", async () => exists);
    const res = response();
    await compensateFeedback({ params: { id: feedbackId }, body: { amount: 50 }, user: ADMIN, method: "POST", originalUrl: "/api/feedback/x/compensate" }, res);
    return res;
  };
  const gone = await call({ _id: feedbackId, user: new mongoose.Types.ObjectId(UID(1)), status: "Yeni", title: "1. sipariş" }, null);
  assert.equal(gone.statusCode, 409);
  assert.deepEqual(gone.body, { message: "Bu geri bildirimin hesabı silinmiş; kupon tanımlanamaz" });
  const noUser = await call({ _id: feedbackId, user: null, status: "Yeni", title: "1. sipariş" }, null);
  assert.equal(noUser.statusCode, 409);
  assert.equal(created.length, 0, "Coupon.create must not be called");
});
