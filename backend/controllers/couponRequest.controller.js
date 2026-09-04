import CouponRequest from "../models/couponRequest.model.js";
import Referral from "../models/referral.model.js";

const serialize = async (campaign, userId = null) => {
  const requesterIds = campaign.requesters.map((item) => item.user?.toString()).filter(Boolean);
  const referrals = await Referral.find({ referrer: { $in: requesterIds } }).lean();
  const referralMap = new Map(referrals.map((referral) => [referral.referrer.toString(), referral.totalReferrals || 0]));
  const weightedCount = requesterIds.reduce((sum, id) => sum + (referralMap.get(id) > 0 ? 2 : 1), 0);
  const userRequested = userId && requesterIds.includes(userId.toString());
  return {
    _id: campaign._id, title: campaign.title, description: campaign.description,
    targetCount: campaign.targetCount, discountPercentage: campaign.discountPercentage,
    startsAt: campaign.startsAt, endsAt: campaign.endsAt, isActive: campaign.isActive,
    requestCount: requesterIds.length, weightedCount, isEligible: true,
    userRequested, requesterWeight: userRequested && referralMap.get(userId.toString()) > 0 ? 2 : 1,
    remaining: Math.max(0, campaign.targetCount - weightedCount),
  };
};

export const getActiveCouponRequest = async (req, res) => {
  const campaign = await CouponRequest.findOne({ isActive: true, startsAt: { $lte: new Date() }, endsAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  res.json({ success: true, campaign: campaign ? await serialize(campaign, req.user?._id) : null });
};

export const requestCoupon = async (req, res) => {
  const campaign = await CouponRequest.findOne({ isActive: true, startsAt: { $lte: new Date() }, endsAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!campaign) return res.status(404).json({ success: false, message: "Şu anda açık kupon talebi yok." });
  if (campaign.requesters.some((item) => item.user?.toString() === req.user._id.toString())) return res.status(409).json({ success: false, message: "Talebin zaten kaydedildi." });
  campaign.requesters.push({ user: req.user._id });
  await campaign.save();
  res.json({ success: true, message: "Kupon isteğin alındı. Kampanya yalnızca talep bırakanlara açıktır.", campaign: await serialize(campaign, req.user._id) });
};

export const getCouponRequestsAdmin = async (_req, res) => {
  const campaigns = await CouponRequest.find().populate("requesters.user", "name email createdAt").sort({ createdAt: -1 });
  res.json({ success: true, campaigns: await Promise.all(campaigns.map((campaign) => serialize(campaign))) });
};

export const saveCouponRequestCampaign = async (req, res) => {
  const data = req.body;
  const values = { title: data.title, description: data.description, targetCount: Number(data.targetCount), discountPercentage: Number(data.discountPercentage), startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), isActive: Boolean(data.isActive) };
  if (values.endsAt <= values.startsAt) return res.status(400).json({ success: false, message: "Bitiş tarihi başlangıçtan sonra olmalı." });
  const campaign = data._id ? await CouponRequest.findByIdAndUpdate(data._id, values, { new: true }) : await CouponRequest.create(values);
  res.json({ success: true, campaign: await serialize(campaign) });
};
