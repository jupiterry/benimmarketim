import test from "node:test";
import assert from "node:assert/strict";
import CouponRequest from "../models/couponRequest.model.js";
import Referral from "../models/referral.model.js";
import { saveCouponRequestCampaign } from "../controllers/couponRequest.controller.js";

const ID = "507f191e810c19729de86c01";
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const day = 86400000;
const body = (extra = {}) => ({ _id: ID, title: "Topluluk indirimi", description: "Fırsat", targetCount: 10, discountPercentage: 5, orderRequirement: "delivered", startsAt: new Date(Date.now() - day).toISOString(), endsAt: new Date(Date.now() + 6 * day).toISOString(), isActive: true, ...extra });
const stored = (extra = {}) => ({ _id: ID, title: "Topluluk indirimi", targetCount: 10, discountPercentage: 5, orderRequirement: "delivered", requesters: [{ user: "507f191e810c19729de86c02" }], rewardIssued: false, isActive: false, ...extra });
const mockDb = (t, existing) => {
  CouponRequest.updateMany ||= async () => ({});
  CouponRequest.findByIdAndUpdate ||= async () => null;
  t.mock.method(CouponRequest, "findById", async () => existing);
  const others = t.mock.method(CouponRequest, "updateMany", async () => ({}));
  const update = t.mock.method(CouponRequest, "findByIdAndUpdate", async (_id, values) => ({ ...existing, ...values }));
  t.mock.method(Referral, "find", () => ({ lean: async () => [] }));
  return { others, update };
};

test("a passive campaign can be published again and other campaigns are switched off", async (t) => {
  const { others, update } = mockDb(t, stored());
  const res = response(); await saveCouponRequestCampaign({ body: body() }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.campaign.isActive, true);
  assert.equal(update.mock.calls[0].arguments[1].isActive, true);
  assert.deepEqual(others.mock.calls[0].arguments[0], { _id: { $ne: ID }, isActive: true });
});

test("publishing is refused with a clear reason when the end date has passed or the reward was issued", async (t) => {
  const { update } = mockDb(t, stored());
  let res = response(); await saveCouponRequestCampaign({ body: body({ startsAt: new Date(Date.now() - 9 * day).toISOString(), endsAt: new Date(Date.now() - day).toISOString() }) }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Bitiş tarihi geçmiş/);
  // Süresi dolmuş kampanya pasif olarak yine kaydedilebilir
  res = response(); await saveCouponRequestCampaign({ body: body({ isActive: false, startsAt: new Date(Date.now() - 9 * day).toISOString(), endsAt: new Date(Date.now() - day).toISOString() }) }, res);
  assert.equal(res.statusCode, 200);
  res = response(); await saveCouponRequestCampaign({ body: body({ startsAt: "", endsAt: "bozuk" }) }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /geçerli olmalı/);
  const calls = update.mock.callCount();
  CouponRequest.findById.mock.mockImplementation(async () => stored({ rewardIssued: true }));
  res = response(); await saveCouponRequestCampaign({ body: body() }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /yeniden açılamaz/);
  assert.equal(update.mock.callCount(), calls);
});
