import mongoose from "mongoose";
import Mission from "../models/mission.model.js";
import { getMissionsForUser, isMissionRunning, missionRule } from "../services/mission.service.js";

const clean = (value) => String(value ?? "").trim();
const number = (value) => (value === "" || value === null || value === undefined ? NaN : Number(value));

export const validateMission = (body = {}) => {
  const title = clean(body.title);
  if (title.length < 3 || title.length > 60) return { error: "Görev adı 3-60 karakter olmalıdır" };
  const description = clean(body.description);
  if (description.length > 160) return { error: "Açıklama en fazla 160 karakter olabilir" };
  const targetOrders = number(body.targetOrders);
  if (!Number.isInteger(targetOrders) || targetOrders < 1 || targetOrders > 50) return { error: "Sipariş sayısı 1-50 arasında olmalıdır" };
  const minOrderAmount = number(body.minOrderAmount ?? 0);
  if (!(minOrderAmount >= 0) || minOrderAmount > 100000) return { error: "Geçersiz minimum sipariş tutarı" };
  const rewardAmount = number(body.rewardAmount);
  if (!(rewardAmount >= 1) || rewardAmount > 10000) return { error: "Ödül tutarı 1-10.000 TL arasında olmalıdır" };
  const rewardMinimumOrderAmount = number(body.rewardMinimumOrderAmount ?? 0);
  if (!(rewardMinimumOrderAmount >= 0) || rewardMinimumOrderAmount > 100000) return { error: "Geçersiz kupon minimum sepet tutarı" };
  const rewardValidityDays = number(body.rewardValidityDays ?? 14);
  if (!Number.isInteger(rewardValidityDays) || rewardValidityDays < 1 || rewardValidityDays > 365) return { error: "Kupon geçerliliği 1-365 gün olmalıdır" };
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return { error: "Başlangıç ve bitiş tarihi gereklidir" };
  if (endsAt <= startsAt) return { error: "Bitiş tarihi başlangıçtan sonra olmalıdır" };
  return { data: { title, description, targetOrders, minOrderAmount, rewardAmount, rewardMinimumOrderAmount, rewardValidityDays, startsAt, endsAt, isActive: body.isActive === true } };
};

const serializeForAdmin = (mission) => ({
  _id: mission._id,
  title: mission.title,
  description: mission.description,
  rule: missionRule(mission),
  targetOrders: mission.targetOrders,
  minOrderAmount: mission.minOrderAmount,
  rewardAmount: mission.rewardAmount,
  rewardMinimumOrderAmount: mission.rewardMinimumOrderAmount,
  rewardValidityDays: mission.rewardValidityDays,
  startsAt: mission.startsAt,
  endsAt: mission.endsAt,
  isActive: mission.isActive,
  running: isMissionRunning(mission),
  completionCount: (mission.completions || []).length,
  totalReward: (mission.completions || []).length * Number(mission.rewardAmount || 0),
  completions: (mission.completions || []).slice(-50).reverse().map((entry) => ({ name: entry.user?.name || "Müşteri", couponCode: entry.couponCode, completedAt: entry.completedAt })),
});

// Müşteri: süren görevler ve ilerleme
export const getActiveMissions = async (req, res) => {
  res.json({ success: true, missions: await getMissionsForUser(req.user._id) });
};

// Yönetici: tüm görevler
export const listMissionsAdmin = async (_req, res) => {
  const missions = await Mission.find().sort({ createdAt: -1 }).limit(50).populate("completions.user", "name").lean();
  res.json({ success: true, missions: missions.map(serializeForAdmin) });
};

// Yönetici: görev oluştur veya güncelle (id varsa günceller)
export const saveMission = async (req, res) => {
  const { data, error } = validateMission(req.body);
  if (error) return res.status(400).json({ success: false, message: error });
  const id = req.body?.id;
  let mission;
  if (id) {
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Geçersiz görev" });
    mission = await Mission.findByIdAndUpdate(id, { $set: data }, { new: true }).populate("completions.user", "name").lean();
    if (!mission) return res.status(404).json({ success: false, message: "Görev bulunamadı" });
  } else {
    mission = (await Mission.create(data)).toObject?.() || data;
  }
  res.status(id ? 200 : 201).json({ success: true, mission: serializeForAdmin(mission) });
};

// Yönetici: yalnızca yayın durumunu değiştirir
export const toggleMission = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || typeof req.body?.isActive !== "boolean") return res.status(400).json({ success: false, message: "Geçersiz istek" });
  const mission = await Mission.findByIdAndUpdate(req.params.id, { $set: { isActive: req.body.isActive } }, { new: true }).populate("completions.user", "name").lean();
  if (!mission) return res.status(404).json({ success: false, message: "Görev bulunamadı" });
  res.json({ success: true, mission: serializeForAdmin(mission) });
};

export const deleteMission = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Geçersiz görev" });
  const mission = await Mission.findByIdAndDelete(req.params.id);
  if (!mission) return res.status(404).json({ success: false, message: "Görev bulunamadı" });
  res.json({ success: true });
};
