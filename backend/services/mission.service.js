// Sipariş görevleri: ilerleme teslim edilmiş siparişlerden hesaplanır, hedefe ulaşan müşteriye
// kişiye özel sabit tutarlı kupon tanımlanır. Ödül her müşteriye görev başına bir kez verilir.
import Mission from "../models/mission.model.js";
import Order from "../models/order.model.js";
import Coupon from "../models/coupon.model.js";
import { sendPushToUser } from "./push.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const formatAmount = (value) => Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export const missionRule = (mission) => {
  const amount = Number(mission.minOrderAmount) > 0 ? `${formatAmount(mission.minOrderAmount)} TL ve üzeri ` : "";
  return `${amount}${mission.targetOrders} sipariş ver, ${formatAmount(mission.rewardAmount)} TL kupon kazan`;
};

export const isMissionRunning = (mission, now = new Date()) =>
  Boolean(mission.isActive) && new Date(mission.startsAt) <= now && new Date(mission.endsAt) >= now;

const completionOf = (mission, userId) =>
  (mission.completions || []).find((entry) => String(entry.user?._id || entry.user) === String(userId)) || null;

// Görev süresi içinde verilmiş, teslim edilmiş ve alt tutarı sağlayan siparişler sayılır.
export const countQualifyingOrders = (mission, userId) => Order.countDocuments({
  user: userId,
  status: "Teslim Edildi",
  totalAmount: { $gte: Number(mission.minOrderAmount) || 0 },
  createdAt: { $gte: mission.startsAt, $lte: mission.endsAt },
});

export const missionCouponCode = (mission, userId) => `GOREV${String(mission._id).slice(-5)}${String(userId).slice(-5)}`.toUpperCase();

const awardMission = async (mission, userId, now) => {
  const code = missionCouponCode(mission, userId);
  // Aynı müşteriye ikinci kez ödül verilmesini veritabanı düzeyinde engeller
  const claimed = await Mission.updateOne(
    { _id: mission._id, "completions.user": { $ne: userId } },
    { $push: { completions: { user: userId, couponCode: code, completedAt: now } } },
  );
  if (!claimed?.modifiedCount) return null;
  await Coupon.updateOne({ code }, {
    $setOnInsert: {
      code,
      description: `${mission.title} görev ödülü`,
      discountType: "fixed",
      discountAmount: Number(mission.rewardAmount),
      minimumOrderAmount: Number(mission.rewardMinimumOrderAmount) || 0,
      usageLimit: 1,
      userUsageLimit: 1,
      expirationDate: new Date(now.getTime() + (Number(mission.rewardValidityDays) || 14) * DAY_MS),
      isActive: true,
      userId,
    },
  }, { upsert: true });
  sendPushToUser(userId, { title: "Görev tamamlandı 🎉", body: `${formatAmount(mission.rewardAmount)} TL kuponunuz hesabınıza tanımlandı: ${code}` },
    { type: "mission_reward", couponCode: code, route: "/home" }, { category: "campaigns" });
  return code;
};

/** Müşterinin süren görevlerini değerlendirir; hedefe ulaşılanlarda ödülü verir. */
export const evaluateMissionsForUser = async (userId, now = new Date()) => {
  const awarded = [];
  try {
    const missions = await Mission.find({ isActive: true, startsAt: { $lte: now }, endsAt: { $gte: now } }).lean();
    for (const mission of missions) {
      if (completionOf(mission, userId)) continue;
      const count = await countQualifyingOrders(mission, userId);
      if (count < mission.targetOrders) continue;
      const code = await awardMission(mission, userId, now);
      if (code) awarded.push({ missionId: String(mission._id), couponCode: code });
    }
  } catch (error) {
    console.error("Görev değerlendirilemedi:", error.message);
  }
  return awarded;
};

/** Mobil uygulama için: süren görevler ve müşterinin ilerlemesi. */
export const getMissionsForUser = async (userId, now = new Date()) => {
  await evaluateMissionsForUser(userId, now); // Kaçırılmış ödül varsa burada tamamlanır
  const missions = await Mission.find({ isActive: true, startsAt: { $lte: now }, endsAt: { $gte: now } }).sort({ endsAt: 1 }).lean();
  return Promise.all(missions.map(async (mission) => {
    const completion = completionOf(mission, userId);
    const progress = completion ? mission.targetOrders : Math.min(mission.targetOrders, await countQualifyingOrders(mission, userId));
    return {
      id: String(mission._id),
      title: mission.title,
      description: mission.description || "",
      rule: missionRule(mission),
      targetOrders: mission.targetOrders,
      minOrderAmount: mission.minOrderAmount || 0,
      rewardAmount: mission.rewardAmount,
      endsAt: mission.endsAt,
      progress,
      completed: Boolean(completion),
      couponCode: completion?.couponCode || null,
    };
  }));
};
