import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Coupon from "../models/coupon.model.js";
import Referral from "../models/referral.model.js";
import User from "../models/user.model.js";
import {
  cancelOrder,
  grantReferralRewardIfDelivered,
  parseOrderListOptions,
  releaseCouponForOrder,
  getOrderStatusSummary,
} from "../controllers/ordersAnalytics.controller.js";

const USER = new mongoose.Types.ObjectId();
const REFERRER = new mongoose.Types.ObjectId();

function response() {
  return {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("order list options: defaults, caps, limit=0 means all, invalid status/since ignored", () => {
  assert.deepEqual(parseOrderListOptions({}), { limit: 300, page: 1, status: null, since: null });
  assert.equal(parseOrderListOptions({ limit: "5000" }).limit, 1000);
  assert.equal(parseOrderListOptions({ limit: "0" }).limit, 0);
  assert.equal(parseOrderListOptions({ status: "Yolda" }).status, "Yolda");
  assert.equal(parseOrderListOptions({ status: "Bilinmeyen" }).status, null);
  assert.equal(parseOrderListOptions({ since: "not-a-date" }).since, null);
  assert.equal(parseOrderListOptions({ since: "2026-10-01T00:00:00Z" }).since.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("status summary groups with aggregate and exposes pendingCount", async (t) => {
  const pipelines = [];
  t.mock.method(Order, "aggregate", async (pipeline) => {
    pipelines.push(pipeline);
    return [{ _id: "Hazırlanıyor", n: 3 }, { _id: "Teslim Edildi", n: 7 }];
  });
  const res = response();
  await getOrderStatusSummary({}, res);
  assert.deepEqual(res.body, { counts: { "Hazırlanıyor": 3, "Teslim Edildi": 7 }, total: 10, pendingCount: 3 });
  assert.deepEqual(pipelines[0], [{ $group: { _id: "$status", n: { $sum: 1 } } }]);
});

test("cancel: admin uses role, customer cannot cancel someone else's order, coupon usage is released", async (t) => {
  const orderId = new mongoose.Types.ObjectId();
  const makeOrder = () => ({
    _id: orderId,
    user: USER,
    status: "Hazırlanıyor",
    couponCode: "INDIRIM10",
    statusHistory: [],
    save: async () => {},
  });
  let order = makeOrder();
  t.mock.method(Order, "findById", async () => order);
  const couponUpdates = [];
  t.mock.method(Coupon, "findOneAndUpdate", async (filter, update) => {
    couponUpdates.push({ filter, update });
    return { _id: "c1", isActive: true, usageLimit: null, usageCount: 0, expirationDate: new Date(Date.now() + 86400000) };
  });

  const foreign = response();
  await cancelOrder({ body: { orderId }, user: { _id: new mongoose.Types.ObjectId(), role: "customer" }, app: { get: () => null } }, foreign);
  assert.equal(foreign.code, 403);
  assert.equal(order.status, "Hazırlanıyor");

  const admin = response();
  await cancelOrder({ body: { orderId }, user: { _id: REFERRER, role: "admin" }, app: { get: () => null } }, admin);
  assert.equal(admin.code, 200);
  assert.equal(order.status, "İptal Edildi");
  assert.equal(couponUpdates.length, 1);
  assert.equal(couponUpdates[0].filter.code, "INDIRIM10");
  assert.deepEqual(couponUpdates[0].update.$pull, { usedBy: { orderId } });
  assert.deepEqual(couponUpdates[0].update.$inc, { usageCount: -1 });

  order = makeOrder();
  const self = response();
  await cancelOrder({ body: { orderId }, user: { _id: USER, role: "customer" }, app: { get: () => null } }, self);
  assert.equal(self.code, 200);
  assert.equal(order.status, "İptal Edildi");

  await releaseCouponForOrder({ _id: orderId, couponCode: null });
  assert.equal(couponUpdates.length, 2, "kuponsuz sipariş için kupon sorgusu yapılmaz");
});

test("referral reward is granted once, only when the first order is delivered", async (t) => {
  let deliveredBefore = 1;
  t.mock.method(Order, "countDocuments", async () => deliveredBefore);
  const referral = {
    referrer: REFERRER,
    referralCode: "REFABC",
    maxReferrals: 1,
    successfulReferrals: 0,
    totalRewardsEarned: 0,
    isActive: true,
    referredUsers: [{ user: USER, status: "pending" }],
    save: async () => {},
  };
  const findOne = t.mock.method(Referral, "findOne", async () => referral);
  const savedCoupons = [];
  t.mock.method(Coupon.prototype, "save", async function save() { savedCoupons.push(this); return this; });
  t.mock.method(User, "find", () => ({ select: () => ({ lean: async () => [] }) }));

  const order = { _id: new mongoose.Types.ObjectId(), user: USER, status: "Teslim Edildi" };

  // Durum zaten teslimse ya da daha önce teslim edilmiş sipariş varsa ödül yok
  assert.equal(await grantReferralRewardIfDelivered(order, "Teslim Edildi"), null);
  assert.equal(await grantReferralRewardIfDelivered(order, "Yolda"), null);
  assert.equal(findOne.mock.callCount(), 0);

  deliveredBefore = 0;
  const result = await grantReferralRewardIfDelivered(order, "Yolda");
  assert.equal(result.success, true);
  assert.equal(referral.referredUsers[0].status, "rewarded");
  assert.equal(referral.isActive, false);
  assert.equal(savedCoupons.length, 1);
  assert.equal(String(savedCoupons[0].userId), String(REFERRER));

  // İkinci kez (ör. durum tekrar teslim yapılırsa) bekleyen kayıt kalmadığı için ödül tekrarlanmaz
  findOne.mock.mockImplementation(async () => null);
  const again = await grantReferralRewardIfDelivered(order, "Yolda");
  assert.equal(again.success, false);
  assert.equal(savedCoupons.length, 1);
});
