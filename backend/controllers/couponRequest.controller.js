import CouponRequest from "../models/couponRequest.model.js";
import Referral from "../models/referral.model.js";
import Order from "../models/order.model.js";
import Coupon from "../models/coupon.model.js";
import mongoose from "mongoose";

const userIdOf = (item) => (item.user?._id || item.user)?.toString();

const orderRequirementLabel = {
  none: "Sipariş şartı yok",
  any: "En az 1 sipariş gerekli",
  delivered: "En az 1 teslim edilmiş sipariş gerekli",
};

const getEligibility = async (campaign, userId) => {
  const requirement = campaign.orderRequirement || "delivered";
  if (!userId || requirement === "none") {
    return { isEligible: true, eligibilityMessage: orderRequirementLabel[requirement] };
  }

  const query = { user: userId };
  if (requirement === "delivered") query.status = "Teslim Edildi";
  const eligible = Boolean(await Order.exists(query));
  return {
    isEligible: eligible,
    eligibilityMessage: eligible
      ? "Katılım şartını karşılıyorsun."
      : orderRequirementLabel[requirement],
  };
};

const getWeights = async (requesterIds) => {
  const referrals = await Referral.find({ referrer: { $in: requesterIds } }).lean();
  const referralMap = new Map(
    referrals.map((referral) => [referral.referrer.toString(), (referral.totalReferrals || 0) > 0 ? 2 : 1])
  );
  return { referralMap, weightedCount: requesterIds.reduce((sum, id) => sum + (referralMap.get(id) || 1), 0) };
};

const serialize = async (campaign, userId = null) => {
  const requesterIds = campaign.requesters.map(userIdOf).filter(Boolean);
  const { referralMap, weightedCount } = await getWeights(requesterIds);
  const userRequested = userId && requesterIds.includes(userId.toString());
  const eligibility = await getEligibility(campaign, userId);
  return {
    _id: campaign._id, title: campaign.title, description: campaign.description,
    targetCount: campaign.targetCount, discountPercentage: campaign.discountPercentage,
    minimumOrderAmount: campaign.minimumOrderAmount,
    rewardValidityDays: campaign.rewardValidityDays,
    orderRequirement: campaign.orderRequirement,
    orderRequirementLabel: orderRequirementLabel[campaign.orderRequirement],
    startsAt: campaign.startsAt, endsAt: campaign.endsAt, isActive: campaign.isActive,
    rewardIssued: campaign.rewardIssued,
    rewardIssuedAt: campaign.rewardIssuedAt,
    requestCount: requesterIds.length, weightedCount, ...eligibility,
    userRequested, requesterWeight: userRequested ? (referralMap.get(userId.toString()) || 1) : 1,
    remaining: Math.max(0, campaign.targetCount - weightedCount),
  };
};

const issueRewardsIfReached = async (campaign) => {
  const requesterIds = campaign.requesters.map(userIdOf).filter(Boolean);
  const { weightedCount } = await getWeights(requesterIds);
  if (weightedCount < campaign.targetCount || campaign.rewardIssued) return campaign;

  const expirationDate = new Date(Date.now() + (campaign.rewardValidityDays || 14) * 86400000);
  const coupons = requesterIds.map((userId) => ({
    code: `TOP${campaign._id.toString().slice(-6)}${userId.slice(-6)}`.toUpperCase(),
    description: `${campaign.title} - yalnızca kampanyaya katılan kullanıcıya özel`,
    discountType: "percentage",
    discountPercentage: campaign.discountPercentage,
    minimumOrderAmount: campaign.minimumOrderAmount || 0,
    usageLimit: 1,
    userUsageLimit: 1,
    expirationDate,
    isActive: true,
    userId,
  }));
  if (coupons.length) {
    await Coupon.bulkWrite(coupons.map((coupon) => ({
      updateOne: { filter: { code: coupon.code }, update: { $setOnInsert: coupon }, upsert: true },
    })));
  }
  return CouponRequest.findByIdAndUpdate(
    campaign._id,
    { $set: { rewardIssued: true, rewardIssuedAt: new Date(), isActive: false } },
    { new: true }
  );
};

export const getActiveCouponRequest = async (req, res) => {
  const campaign = await CouponRequest.findOne({ isActive: true, startsAt: { $lte: new Date() }, endsAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  res.json({ success: true, campaign: campaign ? await serialize(campaign, req.user?._id) : null });
};

export const requestCoupon = async (req, res) => {
  const campaign = await CouponRequest.findOne({ isActive: true, startsAt: { $lte: new Date() }, endsAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!campaign) return res.status(404).json({ success: false, message: "Şu anda açık kupon talebi yok." });
  if (campaign.requesters.some((item) => item.user?.toString() === req.user._id.toString())) return res.status(409).json({ success: false, message: "Talebin zaten kaydedildi." });
  const eligibility = await getEligibility(campaign, req.user._id);
  if (!eligibility.isEligible) return res.status(403).json({ success: false, message: eligibility.eligibilityMessage });
  campaign.requesters.push({ user: req.user._id });
  await campaign.save();
  const updatedCampaign = await issueRewardsIfReached(campaign);
  const reached = updatedCampaign.rewardIssued;
  res.json({
    success: true,
    message: reached
      ? "Hedef tamamlandı! Kişisel kuponun kupon cüzdanına eklendi."
      : "Kupon isteğin alındı. Kampanya yalnızca talep bırakanlara açıktır.",
    campaign: await serialize(updatedCampaign, req.user._id),
  });
};

export const getCouponRequestsAdmin = async (_req, res) => {
  const campaigns = await CouponRequest.find().populate("requesters.user", "name email createdAt").sort({ createdAt: -1 });
  const serialized = await Promise.all(campaigns.map(async (campaign) => {
    const base = await serialize(campaign);
    const ids = campaign.requesters.map(userIdOf).filter(Boolean);
    const orderStats = await Order.aggregate([
      { $match: { user: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: "$user", totalOrders: { $sum: 1 }, deliveredOrders: { $sum: { $cond: [{ $eq: ["$status", "Teslim Edildi"] }, 1, 0] } } } },
    ]);
    const statsMap = new Map(orderStats.map((item) => [item._id.toString(), item]));
    const { referralMap } = await getWeights(ids);
    return {
      ...base,
      requesters: campaign.requesters.map((item) => {
        const id = userIdOf(item);
        const stats = statsMap.get(id) || {};
        return {
          user: item.user,
          requestedAt: item.requestedAt,
          weight: referralMap.get(id) || 1,
          totalOrders: stats.totalOrders || 0,
          deliveredOrders: stats.deliveredOrders || 0,
        };
      }),
    };
  }));
  res.json({ success: true, campaigns: serialized });
};

export const saveCouponRequestCampaign = async (req, res) => {
  const data = req.body;
  const existingCampaign = data._id ? await CouponRequest.findById(data._id) : null;
  if (data._id && !existingCampaign) return res.status(404).json({ success: false, message: "Kampanya bulunamadı." });
  const values = {
    title: String(data.title || "Topluluk indirimi").trim(),
    description: String(data.description || "Talep bırakanlara özel fırsat").trim(),
    targetCount: Number(data.targetCount),
    discountPercentage: Number(data.discountPercentage),
    minimumOrderAmount: Number(data.minimumOrderAmount || 0),
    rewardValidityDays: Number(data.rewardValidityDays || 14),
    orderRequirement: ["none", "any", "delivered"].includes(data.orderRequirement) ? data.orderRequirement : "delivered",
    startsAt: new Date(data.startsAt),
    endsAt: new Date(data.endsAt),
    isActive: Boolean(data.isActive),
  };
  if (!Number.isFinite(values.targetCount) || values.targetCount < 1) return res.status(400).json({ success: false, message: "Hedef en az 1 olmalı." });
  if (!Number.isFinite(values.discountPercentage) || values.discountPercentage < 1 || values.discountPercentage > 100) return res.status(400).json({ success: false, message: "İndirim oranı 1-100 arasında olmalı." });
  if (values.endsAt <= values.startsAt) return res.status(400).json({ success: false, message: "Bitiş tarihi başlangıçtan sonra olmalı." });
  if (existingCampaign?.rewardIssued && values.isActive) return res.status(400).json({ success: false, message: "Ödülü dağıtılmış kampanya yeniden açılamaz. Yeni kampanya oluşturun." });
  if (values.isActive) await CouponRequest.updateMany({ _id: { $ne: data._id || null }, isActive: true }, { $set: { isActive: false } });
  const campaign = data._id ? await CouponRequest.findByIdAndUpdate(data._id, values, { new: true }) : await CouponRequest.create(values);
  const updatedCampaign = campaign.isActive ? await issueRewardsIfReached(campaign) : campaign;
  res.json({ success: true, campaign: await serialize(updatedCampaign) });
};
