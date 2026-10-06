import test from "node:test";
import assert from "node:assert/strict";
import Mission from "../models/mission.model.js";
import Order from "../models/order.model.js";
import Coupon from "../models/coupon.model.js";
import User from "../models/user.model.js";
import { evaluateMissionsForUser, getMissionsForUser, missionCouponCode, missionRule } from "../services/mission.service.js";
import { validateMission } from "../controllers/mission.controller.js";

const USER = "507f191e810c19729de860ea";
const chain = (value) => ({ sort() { return this; }, select() { return this; }, limit() { return this; }, lean: async () => value });
const mission = (extra = {}) => ({ _id: "507f191e810c19729de86abc", title: "Ekim görevi", targetOrders: 3, minOrderAmount: 300, rewardAmount: 50, rewardMinimumOrderAmount: 200, rewardValidityDays: 14, startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date("2026-10-31T23:59:59Z"), isActive: true, completions: [], ...extra });
const NOW = new Date("2026-10-06T12:00:00Z");
const valid = { title: "Ekim görevi", targetOrders: 3, minOrderAmount: 300, rewardAmount: 50, startsAt: "2026-10-01", endsAt: "2026-10-31", isActive: true };

test("mission input is validated", () => {
  assert.equal(validateMission(valid).data.rewardValidityDays, 14);
  assert.equal(validateMission({ ...valid, isActive: "yes" }).data.isActive, false);
  assert.match(validateMission({ ...valid, title: "a" }).error, /Görev adı/);
  assert.match(validateMission({ ...valid, targetOrders: 0 }).error, /Sipariş sayısı/);
  assert.match(validateMission({ ...valid, targetOrders: 2.5 }).error, /Sipariş sayısı/);
  assert.match(validateMission({ ...valid, rewardAmount: 0 }).error, /Ödül/);
  assert.match(validateMission({ ...valid, minOrderAmount: -1 }).error, /minimum/);
  assert.match(validateMission({ ...valid, endsAt: "2026-09-01" }).error, /Bitiş/);
  assert.match(validateMission({ ...valid, startsAt: "" }).error, /tarihi/);
});

test("the rule text describes the mission", () => {
  assert.equal(missionRule(mission()), "300 TL ve üzeri 3 sipariş ver, 50 TL kupon kazan");
  assert.equal(missionRule(mission({ minOrderAmount: 0 })), "3 sipariş ver, 50 TL kupon kazan");
});

test("only delivered orders above the minimum inside the mission window count", async (t) => {
  let filter;
  t.mock.method(Mission, "find", () => chain([mission()]));
  t.mock.method(Order, "countDocuments", async (query) => { filter = query; return 2; });
  const update = t.mock.method(Mission, "updateOne", async () => ({ modifiedCount: 1 }));
  assert.deepEqual(await evaluateMissionsForUser(USER, NOW), []);
  assert.equal(filter.user, USER);
  assert.equal(filter.status, "Teslim Edildi");
  assert.deepEqual(filter.totalAmount, { $gte: 300 });
  assert.equal(filter.createdAt.$gte.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(update.mock.callCount(), 0);
});

test("reaching the target issues one personal fixed-amount coupon", async (t) => {
  t.mock.method(Mission, "find", () => chain([mission()]));
  t.mock.method(Order, "countDocuments", async () => 3);
  t.mock.method(User, "find", () => chain([]));
  let claim; let coupon;
  t.mock.method(Mission, "updateOne", async (query, update) => { claim = { query, update }; return { modifiedCount: 1 }; });
  t.mock.method(Coupon, "updateOne", async (query, update, options) => { coupon = { query, update, options }; return {}; });
  const code = missionCouponCode(mission(), USER);
  assert.deepEqual(await evaluateMissionsForUser(USER, NOW), [{ missionId: "507f191e810c19729de86abc", couponCode: code }]);
  assert.deepEqual(claim.query["completions.user"], { $ne: USER });
  const doc = coupon.update.$setOnInsert;
  assert.equal(doc.userId, USER);
  assert.equal(doc.discountType, "fixed");
  assert.equal(doc.discountAmount, 50);
  assert.equal(doc.minimumOrderAmount, 200);
  assert.equal(doc.usageLimit, 1);
  assert.equal(doc.expirationDate.toISOString(), "2026-10-20T12:00:00.000Z");
  assert.equal(coupon.options.upsert, true);
});

test("a mission is never rewarded twice", async (t) => {
  t.mock.method(Order, "countDocuments", async () => 5);
  const coupon = t.mock.method(Coupon, "updateOne", async () => ({}));
  // Zaten tamamlamış müşteri
  t.mock.method(Mission, "find", () => chain([mission({ completions: [{ user: USER, couponCode: "X" }] })]));
  const update = t.mock.method(Mission, "updateOne", async () => ({ modifiedCount: 1 }));
  assert.deepEqual(await evaluateMissionsForUser(USER, NOW), []);
  assert.equal(update.mock.callCount(), 0);
  // Aynı anda iki istek: ikincisi veritabanı koşuluna takılır
  Mission.find.mock.mockImplementation(() => chain([mission()]));
  update.mock.mockImplementation(async () => ({ modifiedCount: 0 }));
  assert.deepEqual(await evaluateMissionsForUser(USER, NOW), []);
  assert.equal(coupon.mock.callCount(), 0);
});

test("customers see their progress capped at the target", async (t) => {
  t.mock.method(Mission, "find", () => chain([mission()]));
  t.mock.method(Order, "countDocuments", async () => 1);
  const [item] = await getMissionsForUser(USER, NOW);
  assert.equal(item.progress, 1);
  assert.equal(item.targetOrders, 3);
  assert.equal(item.completed, false);
  assert.equal(item.rule, "300 TL ve üzeri 3 sipariş ver, 50 TL kupon kazan");
  assert.equal(item.completions, undefined);
});
