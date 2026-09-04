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

export async function evaluateCoupon(
  coupon,
  {
    userId,
    totalAmount = 0,
    orderProducts = [],
    deliveryPoint,
    channel,
    now = new Date(),
  } = {}
) {
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

  if (coupon.deliveryPoints?.length) {
    if (!deliveryPoint) {
      return fail("Bu kupon için teslimat noktası seçmelisiniz", "delivery_point");
    }
    if (!coupon.deliveryPoints.includes(deliveryPoint)) {
      return fail("Bu kupon seçtiğiniz teslimat noktasında geçerli değil", "delivery_point");
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
