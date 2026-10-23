import mongoose from "mongoose";
import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";

const normalize = (value) => String(value || "").trim().toLowerCase();

export const getTurkeyDate = (date = new Date()) =>
  new Date(date.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));

const toMinute = (value) => {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const isScheduleActive = (coupon, now = getTurkeyDate()) => {
  if (coupon.validDays?.length && !coupon.validDays.includes(now.getDay())) {
    return false;
  }
  const start = toMinute(coupon.startTime);
  const end = toMinute(coupon.endTime);
  if (start === null || end === null || start === end) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end
    ? current >= start && current <= end
    : current >= start || current <= end;
};

const userUsageCount = (coupon, userId) =>
  coupon.usedBy?.filter(
    (entry) => entry.user?.toString() === userId?.toString()
  ).length || 0;

const scopedSubtotal = (coupon, orderProducts, totalAmount) => {
  const categories = (coupon.applicableCategories || []).map(normalize);
  const productIds = (coupon.applicableProducts || []).map((id) => id.toString());
  const hasScope = categories.length > 0 || productIds.length > 0;
  if (!hasScope) return Number(totalAmount || 0);
  if (!Array.isArray(orderProducts) || orderProducts.length === 0) return 0;

  return orderProducts.reduce((sum, item) => {
    const productId = (item.product?._id || item.product || item._id || "").toString();
    const category = normalize(item.category || item.product?.category);
    const categoryMatches = categories.length > 0 && categories.includes(category);
    const productMatches = productIds.length > 0 && productIds.includes(productId);
    return categoryMatches || productMatches
      ? sum + Number(item.price || 0) * Number(item.quantity || 0)
      : sum;
  }, 0);
};

// ── Teslimat bölgesi hedeflemesi ──
// Eski kuponlar deliveryPoints ile yurt hedefler (girlsDorm/boysDorm); bu kimlikler yurt
// teslimat bölgelerinin _id'leriyle aynıdır, bu yüzden ikisi tek bir hedef listesinde birleşir.
export const LEGACY_DELIVERY_POINTS = ["girlsDorm", "boysDorm"];
const LEGACY_POINT_SET = new Set(LEGACY_DELIVERY_POINTS);

export const couponZoneTargets = (coupon = {}) => [
  ...new Set([...(coupon.deliveryZones || []), ...(coupon.deliveryPoints || [])].map(String).filter(Boolean)),
];

// Kupon yalnızca yurt dışındaki bölgeleri mi hedefliyor? Böyle kuponları adrese sipariş
// veremeyen istemciler (bölge göndermeyen eski uygulama) kullanamaz; listede gösterilmez.
export const isAddressOnlyCoupon = (coupon = {}) => {
  const targets = couponZoneTargets(coupon);
  return targets.length > 0 && !targets.some((id) => LEGACY_POINT_SET.has(id));
};

// Yönetici panelinden gelen bölge seçimini kaydedilecek iki alana ayırır: yurtlar eski
// deliveryPoints alanında kalır (eski uygulama bunu okur), diğer bölgeler deliveryZones'a yazılır.
export const splitZoneTargets = (zones = []) => {
  const list = [...new Set((Array.isArray(zones) ? zones : []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 100);
  return {
    deliveryPoints: list.filter((id) => LEGACY_POINT_SET.has(id)),
    deliveryZones: list.filter((id) => !LEGACY_POINT_SET.has(id)),
  };
};

// Ayarlara göre kullanıcının adrese sipariş verip veremeyeceği (sözleşme: off → hayır,
// pilot → pilotUserIds'te mi, public → evet).
export const canUserOrderToAddress = (settings, userId) => {
  const delivery = settings?.delivery || {};
  if (delivery.addressOrdering === "public") return true;
  if (delivery.addressOrdering === "pilot") {
    return (delivery.pilotUserIds || []).some((id) => String(id) === String(userId));
  }
  return false;
};

export async function evaluateCoupon(
  coupon,
  {
    userId,
    totalAmount = 0,
    orderProducts = [],
    deliveryPoint,
    deliveryZone,
    canOrderToAddress,
    channel,
    deferDeliveryPoint = false,
    now = new Date(),
  } = {}
) {
  const requirements = [];
  const fail = (message, reason) => ({
    valid: false,
    message,
    reason,
    calculatedDiscount: 0,
  });

  if (!coupon?.isActive) return fail("Bu kupon artık aktif değil", "inactive");
  if (now > coupon.expirationDate) {
    return fail("Bu kuponun süresi dolmuş", "expired");
  }
  if (coupon.userId && coupon.userId.toString() !== userId?.toString()) {
    return fail("Bu kupon size özel değil", "owner");
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return fail("Bu kupon kullanım limitine ulaşmış", "global_limit");
  }
  if (userId && userUsageCount(coupon, userId) >= coupon.userUsageLimit) {
    return fail("Bu kuponu daha fazla kullanamazsınız", "user_limit");
  }
  if (Number(totalAmount) < Number(coupon.minimumOrderAmount || 0)) {
    return fail(
      `Bu kupon için minimum sipariş tutarı ₺${coupon.minimumOrderAmount}`,
      "minimum_amount"
    );
  }
  if (!isScheduleActive(coupon, getTurkeyDate(now))) {
    return fail("Bu kupon şu anda kullanım saatleri dışında", "schedule");
  }

  const zoneTargets = couponZoneTargets(coupon);
  if (zoneTargets.length) {
    // Bölge bağlamı: yeni istemci deliveryZone gönderir; eski akışta yurt kodu (deliveryPoint) bölge kimliğidir.
    const zoneId = String(deliveryZone || "").trim() || (LEGACY_POINT_SET.has(deliveryPoint) ? deliveryPoint : "");
    if (!zoneId) {
      // Bölge seçilmemişken: adrese sipariş veremeyen istemci yalnızca yurt hedeflerini kullanabilir.
      const reachable = canOrderToAddress === true ? zoneTargets : zoneTargets.filter((id) => LEGACY_POINT_SET.has(id));
      if (!reachable.length) {
        return fail("Bu kupon yalnızca adrese teslimat yapılan bölgelerde geçerli", "delivery_zone");
      }
      if (deferDeliveryPoint) {
        requirements.push("delivery_point");
      } else {
        return fail("Bu kupon için teslimat noktası seçmelisiniz", "delivery_point");
      }
    } else if (!zoneTargets.includes(zoneId)) {
      return fail(
        deliveryZone ? "Bu kupon seçtiğiniz teslimat bölgesinde geçerli değil" : "Bu kupon seçtiğiniz teslimat noktasında geçerli değil",
        "delivery_point"
      );
    }
  }

  if (coupon.channels?.length) {
    const normalizedChannel = normalize(channel);
    if (!normalizedChannel || !coupon.channels.includes(normalizedChannel)) {
      return fail("Bu kupon kullandığınız kanalda geçerli değil", "channel");
    }
  }

  if (userId && (coupon.firstOrderOnly || coupon.newUsersOnly)) {
    const [hasOrder, user] = await Promise.all([
      Order.exists({ user: userId }),
      coupon.newUsersOnly
        ? User.findById(userId).select("createdAt").lean()
        : Promise.resolve(null),
    ]);
    if (coupon.firstOrderOnly && hasOrder) {
      return fail("Bu kupon sadece ilk siparişiniz için geçerlidir", "first_order");
    }
    if (coupon.newUsersOnly) {
      const days = Math.max(1, Number(coupon.newUserDays || 30));
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      if (!user?.createdAt || user.createdAt < cutoff) {
        return fail(
          `Bu kupon yalnızca son ${days} gün içinde kayıt olan kullanıcılar içindir`,
          "new_user"
        );
      }
    }
  }

  const eligibleSubtotal = scopedSubtotal(coupon, orderProducts, totalAmount);
  const hasScope =
    coupon.applicableCategories?.length || coupon.applicableProducts?.length;
  if (hasScope && eligibleSubtotal <= 0) {
    return fail("Sepetinizde bu kupona uygun ürün bulunmuyor", "product_scope");
  }

  const calculatedDiscount = coupon.calculateDiscount(eligibleSubtotal);
  if (calculatedDiscount <= 0) {
    return fail("Bu kupon sepetinizde indirim oluşturmuyor", "no_discount");
  }

  return {
    valid: true,
    message: "Kupon geçerli",
    reason: null,
    calculatedDiscount,
    eligibleSubtotal,
    requirements,
    requiresDeliveryPoint: requirements.includes("delivery_point"),
  };
}

export const couponPublicData = (coupon, evaluation = {}) => ({
  _id: coupon._id,
  code: coupon.code,
  description: coupon.description,
  discountType: coupon.discountType,
  discountPercentage: coupon.discountPercentage,
  discountAmount: coupon.discountAmount,
  minimumOrderAmount: coupon.minimumOrderAmount,
  maximumDiscount: coupon.maximumDiscount,
  expirationDate: coupon.expirationDate,
  isReferralCoupon: coupon.isReferralCoupon,
  userId: coupon.userId,
  applicableCategories: coupon.applicableCategories || [],
  applicableProducts: coupon.applicableProducts || [],
  validDays: coupon.validDays || [],
  startTime: coupon.startTime || "",
  endTime: coupon.endTime || "",
  deliveryPoints: coupon.deliveryPoints || [],
  deliveryZones: coupon.deliveryZones || [],
  channels: coupon.channels || [],
  newUsersOnly: coupon.newUsersOnly,
  newUserDays: coupon.newUserDays,
  firstOrderOnly: coupon.firstOrderOnly,
  userUsageLimit: coupon.userUsageLimit,
  usageLimit: coupon.usageLimit,
  usageCount: coupon.usageCount,
  ...evaluation,
});

export async function commitCouponAtomically(coupon, userId, orderId) {
  const now = new Date();
  const objectUserId = new mongoose.Types.ObjectId(userId);
  const effectiveUserLimit = coupon.firstOrderOnly
    ? 1
    : Math.max(1, Number(coupon.userUsageLimit || 1));
  const updated = await Coupon.findOneAndUpdate(
    {
      _id: coupon._id,
      isActive: true,
      expirationDate: { $gt: now },
      $and: [
        {
          $or: [
            { usageLimit: null },
            { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
          ],
        },
        {
          $expr: {
            $lt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$usedBy", []] },
                    as: "usage",
                    cond: { $eq: ["$$usage.user", objectUserId] },
                  },
                },
              },
              effectiveUserLimit,
            ],
          },
        },
      ],
    },
    {
      $inc: { usageCount: 1 },
      $push: { usedBy: { user: userId, orderId, usedAt: now } },
    },
    { new: true }
  );
  return updated;
}
