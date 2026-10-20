import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Referral from "../models/referral.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import { buildCustomerProfile, getCustomerProfile, updateUserRole } from "../controllers/user.controller.js";

const DAY = 24 * 60 * 60 * 1000;
const USER_ID = "507f191e810c19729de8a001";
const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const customer = (fields = {}) => ({
  _id: USER_ID, name: "Ayşe Kaya", email: "ayse@x.com", phone: "05551112233", role: "customer",
  createdAt: new Date("2026-01-10T08:00:00Z"), lastActive: new Date("2026-10-18T09:00:00Z"), lastLoginAt: new Date("2026-10-01T09:00:00Z"),
  deviceType: "mobile", lastDeviceType: "desktop", fcmToken: "tok", pushNotificationsEnabled: true,
  notificationPreferences: { orders: true, messages: false, campaigns: true },
  appActivity: { lastSeenAt: new Date("2026-10-19T12:00:00Z"), visitCount: 7, checkoutAt: null, orderAt: null, visitStartedAt: null },
  cartItems: [{ product: "p1", quantity: 2 }, { product: "p2", quantity: 1 }],
  ...fields,
});
const order = (n, fields = {}) => ({
  _id: `507f191e810c19729de8b${String(n).padStart(3, "0")}`,
  status: "Teslim Edildi", totalAmount: 100, createdAt: new Date(Date.now() - n * DAY),
  products: [{ product: { _id: "507f191e810c19729de8c001", name: "Süt", image: "sut.png" }, name: "Süt", quantity: 2, price: 40 }],
  couponCode: null, couponDiscount: 0, device: { platform: "unknown", model: "", appVersion: "" },
  ...fields,
});

test("buildCustomerProfile: order stats skip cancelled orders and keep first/last dates", () => {
  const orders = [
    order(1, { totalAmount: 150, couponCode: "hos10", couponDiscount: 15, device: { platform: "android", model: "Pixel 7", appVersion: "2.3.0" } }),
    order(5, { status: "İptal Edildi", totalAmount: 999 }),
    order(20, { totalAmount: 50, products: [{ product: "507f191e810c19729de8c002", name: "Ekmek", quantity: 5, price: 10 }] }),
  ];
  const profile = buildCustomerProfile(customer(), orders);
  assert.equal(profile.stats.orderCount, 3);
  assert.equal(profile.stats.cancelledCount, 1);
  assert.equal(profile.stats.deliveredCount, 2);
  assert.equal(profile.stats.totalSpent, 200);
  assert.equal(profile.stats.avgBasket, 100);
  assert.equal(profile.stats.firstOrderAt, orders[2].createdAt.toISOString());
  assert.equal(profile.stats.lastOrderAt, orders[0].createdAt.toISOString());
  assert.equal(profile.stats.couponOrders, 1);
  assert.equal(profile.stats.couponDiscount, 15);
  // Son siparişler yeniden eskiye, ürün adedi ve platform ile
  assert.deepEqual(profile.recentOrders.map((o) => o.status), ["Teslim Edildi", "İptal Edildi", "Teslim Edildi"]);
  assert.equal(profile.recentOrders[0].itemCount, 2);
  assert.equal(profile.recentOrders[0].platform, "android");
  assert.equal(profile.recentOrders[0].couponCode, "hos10");
  // Kupon kullanımı büyük harfe çevrilerek gruplanır
  assert.equal(profile.coupons.usedCount, 1);
  assert.deepEqual(profile.coupons.codes[0], { code: "HOS10", count: 1, discount: 15, lastUsedAt: orders[0].createdAt.toISOString() });
});

test("buildCustomerProfile: top products are grouped by product id, cancelled orders excluded", () => {
  const orders = [
    order(1), order(2), // 2 + 2 süt
    order(3, { products: [{ product: "507f191e810c19729de8c002", name: "Ekmek", quantity: 5, price: 10 }] }),
    order(4, { status: "İptal Edildi", products: [{ product: "507f191e810c19729de8c003", name: "Çikolata", quantity: 50, price: 10 }] }),
  ];
  const { topProducts } = buildCustomerProfile(customer(), orders);
  assert.deepEqual(topProducts.map((p) => [p.name, p.quantity, p.total, p.orders]), [["Ekmek", 5, 50, 1], ["Süt", 4, 160, 2]]);
  assert.equal(topProducts[1].image, "sut.png");
  assert.equal(topProducts[1].productId, "507f191e810c19729de8c001");
  assert.equal(topProducts[0].image, null); // populate edilmemiş ürünlerde görsel yok
});

test("buildCustomerProfile: last seen picks the newest source; device, notification and cart info come from the user", () => {
  const profile = buildCustomerProfile(customer(), [order(1, { device: { platform: "ios", model: "iPhone 13", appVersion: "2.4.1" } })]);
  assert.equal(profile.activity.lastSeenAt, "2026-10-19T12:00:00.000Z");
  assert.equal(profile.activity.lastSeenSource, "app");
  assert.equal(profile.activity.app.visitCount, 7);
  assert.deepEqual(profile.device, { deviceType: "mobile", lastDeviceType: "desktop", platform: "ios", model: "iPhone 13", appVersion: "2.4.1" });
  assert.deepEqual(profile.notifications.preferences, { orders: true, messages: false, campaigns: true });
  assert.equal(profile.notifications.pushEnabled, true);
  assert.equal(profile.notifications.hasToken, true);
  assert.equal(profile.user.cartItemCount, 3);
  assert.equal(profile.user.createdAt, "2026-01-10T08:00:00.000Z");
  // Hiç siparişi olmayan müşteri
  const empty = buildCustomerProfile(customer({ appActivity: null, lastActive: null, lastLoginAt: null }), []);
  assert.equal(empty.stats.orderCount, 0);
  assert.equal(empty.stats.avgBasket, 0);
  assert.equal(empty.stats.firstOrderAt, null);
  assert.equal(empty.activity.lastSeenAt, null);
  assert.deepEqual(empty.topProducts, []);
  assert.equal(empty.referral.invitedBy, null);
  assert.equal(empty.referral.own, null);
});

test("buildCustomerProfile: referral info names the inviter and the people this customer invited", () => {
  const invitedBy = {
    referrer: { _id: "507f191e810c19729de8a009", name: "Mehmet Demir" }, referralCode: "REFABC123",
    entry: { user: USER_ID, status: "completed", signedUpAt: new Date("2026-01-10T08:00:00Z"), firstOrderAt: new Date("2026-01-12T08:00:00Z") },
  };
  const own = {
    referralCode: "REFXYZ999", isActive: false, totalReferrals: 1, successfulReferrals: 1, totalRewardsEarned: 1,
    referredUsers: [{ user: { _id: "507f191e810c19729de8a010", name: "Zeynep Ak" }, status: "rewarded", signedUpAt: new Date("2026-03-01T00:00:00Z") }],
  };
  const { referral } = buildCustomerProfile(customer(), [], { invitedBy, own });
  assert.equal(referral.invitedBy.name, "Mehmet Demir");
  assert.equal(referral.invitedBy.code, "REFABC123");
  assert.equal(referral.invitedBy.status, "completed");
  assert.equal(referral.own.code, "REFXYZ999");
  assert.equal(referral.own.invited.length, 1);
  assert.equal(referral.own.invited[0].name, "Zeynep Ak");
  assert.equal(referral.own.invited[0].status, "rewarded");
});

test("GET /users/:id/profile: queries only this customer's orders and both referral directions", async (t) => {
  const filters = [];
  t.mock.method(User, "findById", () => ({ select: () => ({ lean: async () => customer() }) }));
  t.mock.method(Order, "find", (filter) => {
    filters.push(filter);
    const chain = { select: () => chain, populate: () => chain, sort: () => chain, lean: async () => [order(1), order(2)] };
    return chain;
  });
  const referralFilters = [];
  t.mock.method(Referral, "findOne", (filter) => {
    referralFilters.push(filter);
    const doc = filter.referrer
      ? { referralCode: "REFOWN", referredUsers: [] }
      : { referralCode: "REFIN", referrer: { _id: "507f191e810c19729de8a009", name: "Mehmet Demir" }, referredUsers: [{ user: USER_ID, status: "pending", signedUpAt: new Date() }] };
    return { populate: () => ({ lean: async () => doc }) };
  });
  const res = fakeRes();
  await getCustomerProfile({ params: { id: USER_ID }, user: ADMIN }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(filters, [{ user: USER_ID }]);
  assert.deepEqual(referralFilters, [{ "referredUsers.user": USER_ID }, { referrer: USER_ID }]);
  assert.equal(res.body.profile.stats.orderCount, 2);
  assert.equal(res.body.profile.referral.invitedBy.name, "Mehmet Demir");
  assert.equal(res.body.profile.referral.own.code, "REFOWN");
  assert.ok(res.body.serverTime);
});

test("GET /users/:id/profile: invalid id → 400, unknown user → 404", async (t) => {
  const bad = fakeRes();
  await getCustomerProfile({ params: { id: "bozuk" }, user: ADMIN }, bad);
  assert.equal(bad.statusCode, 400);
  t.mock.method(User, "findById", () => ({ select: () => ({ lean: async () => null }) }));
  const missing = fakeRes();
  await getCustomerProfile({ params: { id: USER_ID }, user: ADMIN }, missing);
  assert.equal(missing.statusCode, 404);
});

test("PATCH /users/:userId/role: saves the new role and writes an audit entry with the change", async (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  let saved = 0;
  const doc = { _id: USER_ID, name: "Ayşe Kaya", email: "ayse@x.com", role: "customer", async save() { saved += 1; return this; } };
  t.mock.method(User, "findById", () => ({ select: async () => doc }));
  const req = { params: { userId: USER_ID }, body: { role: "admin" }, user: ADMIN, method: "PATCH", originalUrl: `/api/users/${USER_ID}/role` };
  const res = fakeRes();
  await updateUserRole(req, res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.role, "admin");
  assert.equal(saved, 1);
  assert.equal(req.auditRecorded, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].category, "customer");
  assert.equal(writes[0].targetName, "Ayşe Kaya");
  assert.deepEqual(writes[0].changes, [{ label: "Rol", from: "Müşteri", to: "Yönetici" }]);

  // Aynı rol tekrar verilirse kayıt yazılmaz
  const again = fakeRes();
  await updateUserRole({ ...req, body: { role: "admin" } }, again);
  await tick();
  assert.equal(again.statusCode, 200);
  assert.equal(saved, 1);
  assert.equal(writes.length, 1);
});

test("PATCH /users/:userId/role: rejects unknown roles and self-demotion", async () => {
  const bad = fakeRes();
  await updateUserRole({ params: { userId: USER_ID }, body: { role: "owner" }, user: ADMIN }, bad);
  assert.equal(bad.statusCode, 400);
  const self = fakeRes();
  await updateUserRole({ params: { userId: ADMIN._id }, body: { role: "customer" }, user: ADMIN }, self);
  assert.equal(self.statusCode, 400);
  assert.match(self.body.message, /Kendi/);
});
