// Yönetici müşteri listesi: GET /api/users (sayfalı, aranabilir, hafif alanlar), /api/users/stats, /api/users/search
// ve kaldırılan "herkesin telefonunu sil" bakım uç noktası.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import userRoutes from "../routes/userRoutes.js";
import * as userController from "../controllers/userController.js";
import { adminRoute } from "../middleware/auth.middleware.js";

const {
  getAllUsers, getUserStats, searchUsers, parseUserListQuery, buildSearchClause, buildUserListFilter, turkishPattern,
  toListUser, USER_LIST_SEGMENTS, USER_APP_FILTERS, phoneKey,
} = userController;

const DAY = 24 * 60 * 60 * 1000;
const oid = (n) => `507f191e810c19729de8${String(n).padStart(4, "0")}`;
const response = () => ({
  code: 200,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});
// Sızmaması gereken alanlarla dolu ham kullanıcı satırı (projeksiyon bozulsa bile yanıtta görünmemeli)
const rawUser = (n, fields = {}) => ({
  _id: oid(n),
  name: `Müşteri ${n}`,
  email: `m${n}@x.com`,
  phone: "0555 000 00 00",
  role: "customer",
  password: "$2a$10$hash",
  fcmToken: "fcm-secret-token",
  refreshToken: "refresh-secret",
  cartItems: [{ product: oid(900), quantity: 2 }],
  cartItemCount: 2,
  createdAt: new Date(Date.now() - 3 * DAY),
  lastActive: new Date(Date.now() - DAY),
  appActivity: { lastSeenAt: new Date(Date.now() - DAY), visitCount: 4 },
  ...fields,
});
// Model.find(...).select().sort().limit().lean() zinciri (sıra fark etmez)
const findChain = (rows, calls = []) => (filter) => {
  const call = { filter, select: null, sort: null, limit: null };
  calls.push(call);
  const chain = {
    select: (value) => { call.select = value; return chain; },
    sort: (value) => { call.sort = value; return chain; },
    limit: (value) => { call.limit = value; return chain; },
    lean: async () => (typeof rows === "function" ? rows(filter, call) : rows),
  };
  return chain;
};
const SECRET_KEYS = ["password", "fcmToken", "refreshToken", "cartItems", "__v"];
const assertNoSecrets = (user) => {
  for (const key of SECRET_KEYS) assert.equal(key in user, false, `${key} yanıtta olmamalı`);
};

// ── Güvenlik / yollar ───────────────────────────────────────────────
test("admin list, stats and search routes are behind protectRoute + adminRoute and declared before /:id", () => {
  const routes = userRoutes.stack.filter((layer) => layer.route).map((layer) => layer.route);
  const getRoute = (path) => routes.find((route) => route.path === path && route.methods.get);
  for (const [path, handler] of [["/", "getAllUsers"], ["/stats", "getUserStats"], ["/search", "searchUsers"]]) {
    const route = getRoute(path);
    assert.ok(route, `${path} yolu yok`);
    assert.deepEqual(route.stack.map((layer) => layer.handle.name), ["protectRoute", "adminRoute", handler]);
  }
  const index = (path) => routes.findIndex((route) => route.path === path && route.methods.get);
  assert.ok(index("/stats") < index("/:id"), "/stats, /:id yolundan önce olmalı");
  assert.ok(index("/search") < index("/:id"), "/search, /:id yolundan önce olmalı");
});

test("adminRoute rejects a signed-in customer", () => {
  const res = response();
  let passed = false;
  adminRoute({ user: { role: "customer" } }, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.code, 403);
  adminRoute({ user: { role: "admin" } }, response(), () => { passed = true; });
  assert.equal(passed, true);
});

test("maintenance endpoint that overwrote every user's phone is gone", () => {
  const paths = userRoutes.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.equal(paths.includes("/add-phone-field"), false);
  assert.equal("addPhoneFieldToAllUsers" in userController, false);
});

// ── Sorgu ayrıştırma ────────────────────────────────────────────────
test("query parsing: defaults, limit capped at 100, invalid values fall back", () => {
  const defaults = parseUserListQuery({});
  assert.equal(defaults.page, 1);
  assert.equal(defaults.limit, 50);
  assert.equal(defaults.sort, "seen");
  assert.equal(defaults.segment, "all");
  assert.equal(defaults.q, "");
  assert.equal(defaults.app, null);
  assert.equal(parseUserListQuery({ limit: "500" }).limit, 100);
  assert.equal(parseUserListQuery({ limit: "0" }).limit, 1);
  assert.equal(parseUserListQuery({ limit: "abc", page: "-3" }).limit, 50);
  assert.equal(parseUserListQuery({ page: "-3" }).page, 1);
  assert.equal(parseUserListQuery({ sort: "$where", segment: "hack", app: "x" }).sort, "seen");
  assert.equal(parseUserListQuery({ segment: "hack" }).segment, "all");
  assert.equal(parseUserListQuery({ q: { $gt: "" } }).q, "", "nesne olarak gelen q yok sayılır");
  assert.equal(parseUserListQuery({ q: "x".repeat(500) }).q.length, 100);
  assert.equal(parseUserListQuery({ appSince: "bozuk" }).appSince, null);
  assert.equal(parseUserListQuery({ appSince: "1990-01-01T00:00:00Z" }).appSince, null, "çok eski tarih reddedilir");
  const ids = parseUserListQuery({ ids: `${oid(1)},bozuk,${oid(1)},${oid(2)}` }).ids;
  assert.deepEqual(ids.map(String), [oid(1), oid(2)]);
  assert.ok(ids[0] instanceof mongoose.Types.ObjectId, "aggregate için ObjectId'ye çevrilir");
});

// ── Arama ───────────────────────────────────────────────────────────
test("search is Turkish-insensitive and regex-escaped", () => {
  const nameRegex = (clause) => clause.$or[0].name;
  const sule = nameRegex(buildSearchClause("sule"));
  for (const name of ["Şule Yılmaz", "ŞULE", "sule"]) assert.ok(sule.test(name), name);
  const isik = nameRegex(buildSearchClause("IŞIK"));
  for (const name of ["Işık Kaya", "ışık", "Isik"]) assert.ok(isik.test(name), name);
  assert.ok(nameRegex(buildSearchClause("çağrı")).test("CAGRI Demir"));

  // Özel karakterler kaçışlı: düz metin olarak aranır, hata fırlatmaz
  const special = nameRegex(buildSearchClause("a.b*(c"));
  assert.ok(special.test("xa.b*(cx"));
  assert.equal(special.test("axb"), false);
  assert.equal(special.test("aab(c"), false);
  for (const q of ["(((", "[", "\\", "a|b", "^$", ".*"]) {
    assert.doesNotThrow(() => buildSearchClause(q), q);
    assert.ok(nameRegex(buildSearchClause(q)).test(`--${q}--`), `${q} düz metin olarak eşleşmeli`);
  }
  assert.equal(nameRegex(buildSearchClause("a|b")).test("a"), false, "| alternatif değil");
  assert.equal(turkishPattern(".*"), "\\.\\*");
});

test("search: several words must all match name/e-mail; digits also search the phone across separators", () => {
  const clause = buildSearchClause("Ahmet 0555 123");
  assert.equal(clause.$or.length, 2);
  const [words, phone] = clause.$or;
  assert.equal(words.$and.length, 3);
  assert.ok(phone.phone.test("0555 123 45 67"));
  assert.ok(phone.phone.test("+90 (555) 123-4567"));
  assert.equal(phone.phone.test("0555 999 45 67"), false);
  assert.equal(buildSearchClause("   "), null);
  assert.equal(buildSearchClause("12").phone, undefined, "2 rakam telefon araması başlatmaz");
});

// ── Liste: sayfalama, projeksiyon, süzgeçler ────────────────────────
const mockList = (t, { total = 120, rows = [], stats = [] } = {}) => {
  const calls = { count: [], aggregate: [], orderAggregate: [] };
  t.mock.method(User, "countDocuments", async (filter) => { calls.count.push(filter); return total; });
  t.mock.method(User, "aggregate", async (pipeline, options) => { calls.aggregate.push({ pipeline, options }); return rows; });
  t.mock.method(Order, "aggregate", async (pipeline) => { calls.orderAggregate.push(pipeline); return stats; });
  t.mock.method(Order, "distinct", async () => [new mongoose.Types.ObjectId(oid(1))]);
  return calls;
};
const stage = (pipeline, name) => pipeline.find((step) => name in step)?.[name];

test("list is paginated: page/limit → $skip/$limit, response { users, total, page, pages, limit }", async (t) => {
  const calls = mockList(t, { total: 120, rows: [rawUser(1), rawUser(2)] });
  const res = response();
  await getAllUsers({ query: { page: "2", limit: "50" } }, res);
  assert.equal(res.code, 200);
  const { pipeline } = calls.aggregate[0];
  assert.equal(stage(pipeline, "$skip"), 50);
  assert.equal(stage(pipeline, "$limit"), 50);
  assert.deepEqual(stage(pipeline, "$sort"), { _seenAt: -1, _id: -1 }, "varsayılan: son görülme");
  assert.equal(res.body.total, 120);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.pages, 3);
  assert.equal(res.body.limit, 50);
  assert.ok(Array.isArray(res.body.users));
  assert.equal(res.body.users.length, 2);
});

test("list: limit above 100 is capped, page beyond the end is clamped to the last page", async (t) => {
  const calls = mockList(t, { total: 120, rows: [rawUser(1)] });
  const res = response();
  await getAllUsers({ query: { page: "99", limit: "1000" } }, res);
  const { pipeline } = calls.aggregate[0];
  assert.equal(stage(pipeline, "$limit"), 100);
  assert.equal(stage(pipeline, "$skip"), 100);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.pages, 2);
  assert.equal(res.body.limit, 100);
});

test("list projection: never password, fcmToken, refresh tokens or cart items; cartItemCount instead", async (t) => {
  const calls = mockList(t, {
    total: 1,
    rows: [rawUser(1)],
    stats: [{ _id: new mongoose.Types.ObjectId(oid(1)), orderCount: 3, totalSpent: 301.5 }],
  });
  const res = response();
  await getAllUsers({ query: {} }, res);
  const projection = stage(calls.aggregate[0].pipeline, "$project");
  for (const key of SECRET_KEYS) assert.equal(key in projection, false, `${key} projeksiyonda olmamalı`);
  assert.deepEqual(projection.cartItemCount, { $sum: "$cartItems.quantity" });
  const [user] = res.body.users;
  assertNoSecrets(user);
  assert.equal(user.cartItemCount, 2);
  assert.equal(user._id, oid(1));
  assert.equal(user.orderCount, 3);
  assert.equal(user.totalSpent, 301.5);
  assert.equal(user.avgOrderValue, 100.5);
  assert.equal(user.appActivity.visitCount, 4);
  assert.equal(typeof user.createdAt, "string");
  // Sayfadaki kullanıcıların sipariş özeti tek sorguda, yalnızca o kimlikler için alınır
  assert.deepEqual(calls.orderAggregate[0][0].$match.user.$in.map(String), [oid(1)]);
});

test("toListUser whitelists fields even when the raw row is full of secrets", () => {
  const user = toListUser({ ...rawUser(7), createdAt: undefined, salt: "x", resetToken: "y" });
  assertNoSecrets(user);
  assert.equal("salt" in user, false);
  assert.equal("resetToken" in user, false);
  assert.ok(user.createdAt, "createdAt yoksa kimlikteki zaman kullanılır");
  assert.equal(user.orderCount, 0);
});

test("list: q, segment, app and registeredSince end up in the $match filter", async (t) => {
  const calls = mockList(t, { total: 0 });
  const res = response();
  const appSince = new Date(Date.now() - DAY).toISOString();
  await getAllUsers({ query: { q: "şule", segment: "active", app: "ordered", appSince, registeredSince: appSince } }, res);
  assert.equal(res.code, 200);
  assert.equal(calls.aggregate.length, 0, "sonuç yoksa satır sorgusu yapılmaz");
  const filter = calls.count[0];
  const text = JSON.stringify(filter, (key, value) => (value instanceof RegExp ? value.source : value));
  assert.ok(text.includes('"role":{"$ne":"admin"}'), "yöneticiler hariç");
  assert.ok(text.includes("lastActive"), "aktif segmenti");
  assert.ok(text.includes("appActivity.orderAt"), "uygulama süzgeci");
  assert.ok(text.includes("createdAt"), "kayıt tarihi süzgeci");
  assert.ok(text.includes("[sşSŞ][uüUÜûÛ]le"), "Türkçe duyarsız arama");
  assert.deepEqual(res.body, { ...res.body, users: [], total: 0, page: 1, pages: 1, limit: 50 });
});

test("list: noOrders segment excludes users who have orders; admin segment matches only admins", async (t) => {
  const calls = mockList(t, { total: 0 });
  await getAllUsers({ query: { segment: "noOrders" } }, response());
  const noOrders = calls.count[0].$and;
  assert.deepEqual(noOrders[0], { role: { $ne: "admin" } });
  assert.deepEqual(noOrders[1]._id.$nin.map(String), [oid(1)]);
  await getAllUsers({ query: { segment: "admin" } }, response());
  assert.deepEqual(calls.count[1], { $and: [{ role: "admin" }] });
});

test("list: ids parameter fetches specific users (komut paletinden müşteri açma)", async (t) => {
  const calls = mockList(t, { total: 1, rows: [rawUser(5)] });
  const res = response();
  await getAllUsers({ query: { ids: oid(5), limit: "1" } }, res);
  const clause = calls.count[0].$and.find((c) => c._id?.$in);
  assert.deepEqual(clause._id.$in.map(String), [oid(5)]);
  assert.equal(res.body.users[0]._id, oid(5));
});

test("list: name sort uses Turkish collation; newest/oldest sort by id", async (t) => {
  const calls = mockList(t, { total: 2, rows: [rawUser(1)] });
  await getAllUsers({ query: { sort: "name" } }, response());
  assert.deepEqual(stage(calls.aggregate[0].pipeline, "$sort"), { name: 1, _id: 1 });
  assert.equal(calls.aggregate[0].options.collation.locale, "tr");
  await getAllUsers({ query: { sort: "newest" } }, response());
  assert.deepEqual(stage(calls.aggregate[1].pipeline, "$sort"), { _id: -1 });
  assert.equal(stage(calls.aggregate[1].pipeline, "$addFields"), undefined, "son görülme alanı yalnızca seen için");
  await getAllUsers({ query: { sort: "oldest" } }, response());
  assert.deepEqual(stage(calls.aggregate[2].pipeline, "$sort"), { _id: 1 });
});

test("list: spent sort ranks by order totals over the whole filter, customers without orders last", async (t) => {
  const ids = [oid(1), oid(2), oid(3), oid(4)];
  t.mock.method(Order, "aggregate", async () => [
    { _id: new mongoose.Types.ObjectId(oid(2)), orderCount: 1, totalSpent: 900 },
    { _id: new mongoose.Types.ObjectId(oid(3)), orderCount: 8, totalSpent: 400 },
  ]);
  const findCalls = [];
  t.mock.method(User, "find", findChain(ids.map((_id) => ({ _id })), findCalls));
  const aggregateCalls = [];
  t.mock.method(User, "aggregate", async (pipeline) => {
    aggregateCalls.push(pipeline);
    return pipeline[0].$match._id.$in.map((id) => rawUser(Number(String(id).slice(-4)), { _id: String(id) })).reverse();
  });
  const res = response();
  await getAllUsers({ query: { sort: "spent", limit: "3" } }, res);
  assert.equal(findCalls[0].select, "_id");
  assert.deepEqual(res.body.users.map((u) => u._id), [oid(2), oid(3), oid(4)], "harcama sırası, sonra yeni kayıt");
  assert.equal(res.body.users[0].totalSpent, 900);
  assert.equal(res.body.total, 4);
  assert.equal(res.body.pages, 2);
  assertNoSecrets(res.body.users[0]);
  const resOrders = response();
  await getAllUsers({ query: { sort: "orders", limit: "2" } }, resOrders);
  assert.deepEqual(resOrders.body.users.map((u) => u._id), [oid(3), oid(2)]);
});

// ── Özet (KPI) ──────────────────────────────────────────────────────
test("stats: counts over the whole collection with the same filters as the list", async (t) => {
  const counts = [];
  const values = [100, 30, 20, 10, 3, 40, 5, 1, 2, 3, 4, 5, 6];
  t.mock.method(User, "countDocuments", async (filter) => { counts.push(filter); return values[counts.length - 1]; });
  t.mock.method(Order, "distinct", async () => [new mongoose.Types.ObjectId(oid(9))]);
  const aggregates = [];
  t.mock.method(User, "aggregate", async (pipeline) => { aggregates.push(pipeline); return [{ _id: "2026-10-24", count: 2 }]; });
  const findCalls = [];
  t.mock.method(User, "find", findChain([rawUser(3)], findCalls));

  const todayStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const res = response();
  await getUserStats({ query: { todayStart, appSince: todayStart, tz: "Europe/Istanbul" } }, res);
  assert.equal(res.code, 200);
  const { stats } = res.body;
  assert.deepEqual(stats.segments, { all: 100, active: 30, risk: 20, new: 10, admin: 3, noOrders: 40, dupPhone: 0 }, "dupPhone gruplardan sayılır");
  assert.deepEqual(stats.duplicatePhones, { groups: 0, users: 0 });
  assert.equal(stats.total, 100);
  assert.equal(stats.customers, 97);
  assert.equal(stats.admins, 3);
  assert.equal(stats.active, 30);
  assert.equal(stats.noOrders, 40);
  assert.equal(stats.risk, 20);
  assert.equal(stats.today, 5);
  assert.deepEqual(stats.app, { now: 1, opened: 2, checkout: 3, ordered: 4, noOrder: 5, notOpened: 6 });
  assert.equal(counts.length, USER_LIST_SEGMENTS.length - 1 + 1 + USER_APP_FILTERS.length, "dupPhone countDocuments ile sayılmaz");

  // Filtreler listeyle aynı: tümü = {}, yönetici, sipariş yok ($nin), bugün (createdAt ≥ gün başı)
  assert.deepEqual(counts[0], {});
  assert.deepEqual(counts[4], { $and: [{ role: "admin" }] });
  assert.deepEqual(counts[5].$and[1]._id.$nin.map(String), [oid(9)]);
  assert.equal(counts[6].$and[0].createdAt.$gte.toISOString(), todayStart);
  const now = Date.now();
  const listActive = buildUserListFilter({ segment: "active" }, { now });
  assert.deepEqual(Object.keys(counts[1].$and[1].$or[0]), Object.keys(listActive.$and[1].$or[0]));

  // Kayıt grafiği: yöneticiler hariç, saat dilimi iletilir
  const group = aggregates[0].find((s) => s.$group).$group;
  assert.equal(group._id.$dateToString.timezone, "Europe/Istanbul");
  assert.deepEqual(aggregates[0][0].$match.role, { $ne: "admin" });
  assert.deepEqual(stats.registrations.days, [{ day: "2026-10-24", count: 2 }]);
  // Son kayıt olanlar: hafif alanlar
  assert.equal(stats.latest.length, 1);
  assertNoSecrets(stats.latest[0]);
  assert.equal(findCalls[0].limit, 5);
});

test("stats: unknown time zone falls back to Europe/Istanbul", async (t) => {
  t.mock.method(User, "countDocuments", async () => 0);
  t.mock.method(Order, "distinct", async () => []);
  const aggregates = [];
  t.mock.method(User, "aggregate", async (pipeline) => { aggregates.push(pipeline); return []; });
  t.mock.method(User, "find", findChain([]));
  const res = response();
  await getUserStats({ query: { tz: "Mars/Olympus'); drop" } }, res);
  assert.equal(res.code, 200);
  assert.equal(aggregates[0].find((s) => s.$group).$group._id.$dateToString.timezone, "Europe/Istanbul");
  assert.equal(res.body.stats.customers, 0);
});

// ── Hızlı arama ─────────────────────────────────────────────────────
test("search endpoint: empty q returns nothing without querying; limit capped; exclude ids; light fields only", async (t) => {
  const calls = [];
  t.mock.method(User, "find", findChain([rawUser(1)], calls));
  const empty = response();
  await searchUsers({ query: { q: "   " } }, empty);
  assert.deepEqual(empty.body, { success: true, users: [] });
  assert.equal(calls.length, 0);

  const res = response();
  await searchUsers({ query: { q: "(((", limit: "500", exclude: `${oid(4)},bozuk` } }, res);
  assert.equal(res.code, 200);
  assert.equal(calls[0].limit, 20);
  assert.equal(calls[0].select, "name email phone role avatar");
  const exclusion = calls[0].filter.$and[1];
  assert.deepEqual(exclusion._id.$nin.map(String), [oid(4)]);
  assert.deepEqual(Object.keys(res.body.users[0]).sort(), ["_id", "avatar", "email", "name", "phone", "role"]);

  await searchUsers({ query: { q: "ali" } }, response());
  assert.equal(calls[1].limit, 8, "varsayılan 8 sonuç");
});

// ── Aynı telefon numarası ───────────────────────────────────────────
test("phoneKey: biçimden bağımsız son 10 hane; kısa/bozuk numara karşılaştırılmaz", () => {
  assert.equal(phoneKey("0555 111 22 33"), "5551112233");
  assert.equal(phoneKey("+90 (555) 111-22-33"), "5551112233");
  assert.equal(phoneKey("905551112233"), "5551112233");
  assert.equal(phoneKey("5551112233"), "5551112233");
  assert.equal(phoneKey("00905551112233"), "5551112233");
  assert.equal(phoneKey("555 11"), null);
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey(null), null);
});

test("list dupPhone: aynı numaralı hesaplar grup sırasıyla, grup bilgisiyle; tek kalan numara listelenmez", async (t) => {
  const users = [
    { _id: oid(1), phone: "0555 111 22 33", createdAt: new Date("2026-01-01") },
    { _id: oid(2), phone: "+905551112233", createdAt: new Date("2025-06-01") },
    { _id: oid(3), phone: "05321234567", createdAt: new Date("2026-02-01") },
    { _id: oid(4), phone: "5321234567", createdAt: new Date("2026-03-01") },
    { _id: oid(5), phone: "532 123 45 67", createdAt: new Date("2026-04-01") },
    { _id: oid(6), phone: "05000000000", createdAt: new Date("2026-05-01") },
    { _id: oid(7), phone: "123", createdAt: new Date("2026-05-01") },
  ];
  const findCalls = [];
  t.mock.method(User, "find", findChain((filter) => {
    if (filter?.phone) return users;
    // Süzgece uyanlar: segment koşulundaki kimlikler (arama yok)
    const ids = filter.$and[0]._id.$in.map(String);
    return ids.map((_id) => ({ _id }));
  }, findCalls));
  t.mock.method(User, "aggregate", async (pipeline) => pipeline[0].$match._id.$in.map((id) => rawUser(Number(String(id).slice(-4)), { _id: String(id) })).reverse());
  t.mock.method(Order, "aggregate", async () => []);
  const res = response();
  await getAllUsers({ query: { segment: "dupPhone", sort: "spent", limit: "4" } }, res);
  assert.equal(res.code, 200);
  // 3 kişilik grup önce (en eski hesap başta), sonra 2 kişilik grup
  assert.deepEqual(res.body.users.map((u) => u._id), [oid(3), oid(4), oid(5), oid(2)]);
  assert.equal(res.body.total, 5);
  assert.equal(res.body.pages, 2);
  assert.deepEqual(res.body.users[0].phoneGroup, { key: "5321234567", label: "0532 123 45 67", size: 3, index: 0 });
  assert.equal(res.body.users[3].phoneGroup.label, "0555 111 22 33");
  assertNoSecrets(res.body.users[0]);

  const second = response();
  await getAllUsers({ query: { segment: "dupPhone", limit: "4", page: "2" } }, second);
  assert.deepEqual(second.body.users.map((u) => u._id), [oid(1)]);
  assert.equal(second.body.users[0].phoneGroup.index, 1, "sayfa bölünse de grup içi sıra korunur");
});

test("list dupPhone: kimse numara paylaşmıyorsa boş liste", async (t) => {
  t.mock.method(User, "find", findChain([{ _id: oid(1), phone: "05551112233" }]));
  const res = response();
  await getAllUsers({ query: { segment: "dupPhone" } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.users, []);
  assert.equal(res.body.total, 0);
});
