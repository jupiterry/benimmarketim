/**
 * order.service.js
 *
 * Sipariş iş mantığı için merkezi servis.
 * cart.controller.js bu servisten yararlanır.
 * Fiyat hesaplama, kupon doğrulama ve bildirim gönderme tek bir yerde yönetilir.
 */

import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import { notifyAdmins } from "./adminFeed.service.js";
import { paymentMethodLabel } from "../lib/paymentMethods.js";
import { signalOrderAlarm } from "./orderAlarm.service.js";
import { notifyOrderStatusChange } from "./orderStatusNotifier.js";
import { evaluateMissionsForUser } from "./mission.service.js";
import { processReferralFirstOrder } from "../controllers/referral.controller.js";
import {
  commitCouponAtomically,
  evaluateCoupon,
} from "./coupon.service.js";

// ─────────────────────────────────────────────
// Fiyat Hesaplama
// ─────────────────────────────────────────────

/**
 * Sepet ürünlerini veritabanından doğrulayıp fiyatlarını hesaplar.
 * İstemciden gelen fiyat bilgisi ASLA kullanılmaz.
 *
 * @param {Array<{product: string, quantity: number}>} cartProducts - İstemciden gelen sepet öğeleri
 * @param {{ checkAvailability?: boolean }} [options] - checkAvailability=false: gizli/stoksuz ürün hata vermez (sepet görünümü)
 * @returns {{ orderProducts, totalAmount }}
 * @throws {Error} Ürün bulunamazsa, miktar geçersizse ya da ürün satışta değilse
 */
// Sipariş satırının geldiği raf/ekran (ölçüm). Bilinmeyen değerler yok sayılır.
export const ORDER_SOURCES = [
  "home_deals", "home_foryou", "home_popular", "flash", "category", "search",
  "detail_similar", "cart_suggestion", "weekly", "favorites", "reorder", "saved_cart",
];
export const normalizeOrderSource = (value) => {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ORDER_SOURCES.includes(source) ? source : null;
};

export async function buildOrderProducts(cartProducts, { checkAvailability = true } = {}) {
  // Haftalık indirimli ürünleri tek sorguda al
  const weeklyProducts = await WeeklyProduct.find({ isActive: true }).lean();
  const weeklyPriceMap = new Map();
  for (const wp of weeklyProducts) {
    if (wp.product) {
      weeklyPriceMap.set(wp.product.toString(), wp.weeklyPrice);
    }
  }

  // Ürün bilgilerini tek sorguda al (N+1'i önler)
  const productIds = cartProducts.map((item) => item.product).filter(Boolean);
  const dbProducts = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

  let totalAmount = 0;

  const orderProducts = cartProducts.map((cartItem) => {
    if (!cartItem.product) {
      throw new Error("Ürün ID'si eksik!");
    }

    const quantity = Number(cartItem.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw new Error("Geçersiz ürün miktarı! (1–99 arası olmalı)");
    }

    const product = productMap.get(cartItem.product.toString());
    if (!product) {
      throw new Error(`Ürün bulunamadı: ${cartItem.product}`);
    }
    // Gizli veya stokta olmayan ürün sipariş edilemez (istemci eski listeyi tutmuş olabilir)
    if (checkAvailability && product.isHidden) {
      throw Object.assign(new Error(`"${product.name}" artık satışta değil, lütfen sepetinizden çıkarın.`), { statusCode: 400 });
    }
    if (checkAvailability && product.isOutOfStock) {
      throw Object.assign(new Error(`"${product.name}" stokta yok, lütfen sepetinizden çıkarın.`), { statusCode: 400 });
    }

    const weeklyPrice = weeklyPriceMap.get(product._id.toString());
    const productDiscountPrice =
      product.isDiscounted &&
      Number.isFinite(Number(product.discountedPrice)) &&
      Number(product.discountedPrice) >= 0 &&
      Number(product.discountedPrice) < Number(product.price)
        ? Number(product.discountedPrice)
        : undefined;
    const effectivePrice = weeklyPrice !== undefined
      ? weeklyPrice
      : productDiscountPrice !== undefined
        ? productDiscountPrice
        : product.price;

    totalAmount += effectivePrice * quantity;

    return {
      product: product._id,
      name: product.name,
      quantity,
      price: effectivePrice,
      originalPrice: product.price,
      isWeeklyDiscount: weeklyPrice !== undefined,
      isProductDiscount: weeklyPrice === undefined && productDiscountPrice !== undefined,
      category: product.category,
      ...(normalizeOrderSource(cartItem.source) ? { source: normalizeOrderSource(cartItem.source) } : {}),
    };
  });

  return { orderProducts, totalAmount };
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Yönetici siparişe katalog ürünü eklerken birim fiyat: ödeme adımıyla aynı kural
 * (haftalık fırsat > geçerli ürün indirimi > liste fiyatı). Gizli/stoksuz ürün de eklenebilir.
 *
 * @param {string} productId
 * @returns {Promise<{ product: { _id, name: string, category?: string }, price: number }>}
 * @throws {Error} statusCode 400 (geçersiz kimlik) ya da 404 (ürün yok)
 */
export async function resolveEffectiveUnitPrice(productId) {
  const id = typeof productId === "string" ? productId.trim() : productId ? String(productId) : "";
  if (!OBJECT_ID_PATTERN.test(id)) {
    throw Object.assign(new Error("Geçersiz ürün kimliği"), { statusCode: 400 });
  }
  let line;
  try {
    ({ orderProducts: [line] } = await buildOrderProducts([{ product: id, quantity: 1 }], { checkAvailability: false }));
  } catch (error) {
    // buildOrderProducts eksik ürün için durum kodu taşımayan bir hata fırlatır
    if (!error.statusCode && String(error.message).startsWith("Ürün bulunamadı")) {
      throw Object.assign(new Error("Ürün bulunamadı!"), { statusCode: 404 });
    }
    throw error;
  }
  return { product: { _id: line.product, name: line.name, category: line.category }, price: line.price };
}

// ─────────────────────────────────────────────
// Sipariş Durumu (yönetici: tekli ve toplu güncelleme aynı yoldan geçer)
// ─────────────────────────────────────────────

export const ORDER_STATUSES = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];
const DELIVERED_STATUS = "Teslim Edildi";
const CANCELLED_STATUS = "İptal Edildi";

// Referral ödülü: davet edilen kullanıcının İLK siparişi teslim edildiğinde bir kez verilir.
// (Referral belgesinde ilgili kaydın status alanı "pending" ise verilir; sonrasında "rewarded" olur.)
export const grantReferralRewardIfDelivered = async (order, previousStatus) => {
  try {
    if (!order || order.status !== DELIVERED_STATUS || previousStatus === DELIVERED_STATUS) return null;
    const deliveredBefore = await Order.countDocuments({
      user: order.user,
      status: DELIVERED_STATUS,
      _id: { $ne: order._id },
    });
    if (deliveredBefore > 0) return null; // ilk teslim edilen sipariş değil
    const result = await processReferralFirstOrder(order.user);
    if (result?.success) console.log("Referral ödülü verildi. Referrer:", result.referrerId);
    return result;
  } catch (error) {
    console.error("Referral ödülü işlenirken hata:", error.message);
    return null;
  }
};

// İptal edilen (ya da silinen aktif) siparişin kuponunu geri açar: usedBy kaydı çıkarılır, usageCount azaltılır
export const releaseCouponForOrder = async (order) => {
  try {
    if (!order?.couponCode) return;
    const updated = await Coupon.findOneAndUpdate(
      { code: String(order.couponCode).toUpperCase().trim(), "usedBy.orderId": order._id },
      { $pull: { usedBy: { orderId: order._id } }, $inc: { usageCount: -1 } },
      { new: true }
    );
    if (!updated) return;
    // Limit dolduğu için kapatılmış bir kupon tekrar kullanılabilir hale gelir (süresi geçmemişse)
    if (
      !updated.isActive &&
      updated.usageLimit !== null &&
      updated.usageCount < updated.usageLimit &&
      updated.expirationDate > new Date()
    ) {
      await Coupon.updateOne({ _id: updated._id }, { $set: { isActive: true } });
    }
  } catch (error) {
    console.error("Kupon kullanımı geri alınırken hata:", error.message);
  }
};

/** Müşteri odası + yönetici odası; yük (payload) mobil/web müşteri sözleşmesidir, değiştirilmez. */
export const emitOrderStatusUpdated = (io, order, status) => {
  try {
    if (!io) return;
    const payload = { orderId: order._id, newStatus: status, message: `Sipariş durumu güncellendi: ${status}` };
    const target = order.user ? io.to(`user_${order.user.toString()}`).to("adminRoom") : io.to("adminRoom");
    target.emit("orderStatusUpdated", payload);
  } catch (socketError) {
    console.error("Socket.IO bildirimi gönderilirken hata:", socketError);
  }
};

/**
 * Durumu değiştirir ve kaydeder; ardından yan etkileri yanıtı bekletmeden başlatır:
 * müşteri bildirimi, Teslim'de görevler + referral ödülü, İptal'de kupon iadesi, orderStatusUpdated.
 * Kayıt, okunduğu andaki duruma koşullanır: bu arada durum başka yerde değiştiyse save
 * VersionError/DocumentNotFoundError fırlatır (çağıran 409'a çevirir). Aynı duruma geçiş çağıranda engellenir.
 *
 * @returns {Promise<string>} önceki durum
 */
export async function applyOrderStatusChange(order, status, { actorId = null, io = null } = {}) {
  const previousStatus = order.status;
  order.status = status;
  if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
  order.statusHistory.push({ status, changedAt: new Date(), changedBy: actorId });
  const customWhere = order.$where;
  order.$where = { ...(customWhere || {}), status: previousStatus };
  try {
    await order.save({ validateModifiedOnly: true });
  } finally {
    order.$where = customWhere; // koşul yalnızca bu kayıt için
  }

  if (previousStatus !== status) {
    Promise.resolve(notifyOrderStatusChange(order, previousStatus)).catch((error) =>
      console.error("Sipariş durumu bildirimi gönderilemedi:", error.message));
    if (status === DELIVERED_STATUS) {
      evaluateMissionsForUser(order.user, new Date(), { deliveredOrder: order });
      grantReferralRewardIfDelivered(order, previousStatus);
    }
    if (status === CANCELLED_STATUS) releaseCouponForOrder(order);
  }
  emitOrderStatusUpdated(io, order, status);
  return previousStatus;
}

// ─────────────────────────────────────────────
// Kupon Doğrulama
// ─────────────────────────────────────────────

/**
 * Kuponu sunucu tarafında doğrular ve indirim tutarını hesaplar.
 * İlk sipariş kısıtlamasını da kontrol eder.
 *
 * @param {string|null} couponCode
 * @param {string} userId
 * @param {number} totalAmount
 * @returns {{ appliedCoupon, couponDiscount }} couponCode yoksa discount=0
 * @throws {Error} Kupon geçersizse
 */
export async function validateAndCalculateCoupon(
  couponCode,
  userId,
  totalAmount,
  context = {}
) {
  if (!couponCode) {
    return { appliedCoupon: null, couponDiscount: 0 };
  }

  const coupon = await Coupon.findOne({
    code: couponCode.toUpperCase().trim(),
    isActive: true,
  });

  if (!coupon) {
    throw Object.assign(new Error("Geçersiz kupon kodu"), { statusCode: 400 });
  }

  const validation = await evaluateCoupon(coupon, {
    userId,
    totalAmount,
    orderProducts: context.orderProducts || [],
    deliveryPoint: context.deliveryPoint,
    channel: context.channel,
  });
  if (!validation.valid) {
    throw Object.assign(new Error(validation.message), { statusCode: 400 });
  }
  const couponDiscount = validation.calculatedDiscount;
  return { appliedCoupon: coupon, couponDiscount };
}

// ─────────────────────────────────────────────
// Kupon Kullanımını Kaydet (Atomik)
// ─────────────────────────────────────────────

/**
 * Sipariş başarıyla oluştuktan sonra kuponu atomik olarak kullanılmış işaretler.
 * Eş zamanlı isteklerde kullanım limitinin aşılmasını önler.
 * Başarısız olursa siparişi geri alır.
 *
 * @param {Object} appliedCoupon
 * @param {string} userId
 * @param {string} orderId
 * @returns {void}
 * @throws {Error} Kupon aynı anda kullanılmışsa
 */
export async function commitCouponUsage(appliedCoupon, userId, orderId) {
  const updatedCoupon = await commitCouponAtomically(
    appliedCoupon,
    userId,
    orderId
  );

  if (!updatedCoupon) {
    // Atomik güncelleme başarısız → siparişi iptal et
    await Order.findByIdAndDelete(orderId);
    throw Object.assign(
      new Error("Kupon kullanım limiti dolmuş veya artık geçerli değil. Lütfen tekrar deneyin."),
      { statusCode: 409 }
    );
  }

  // Limit dolduysa kuponu kapat
  if (
    updatedCoupon.usageLimit !== null &&
    updatedCoupon.usageCount >= updatedCoupon.usageLimit
  ) {
    await Coupon.updateOne(
      { _id: updatedCoupon._id },
      { $set: { isActive: false } }
    );
  }
}

// ─────────────────────────────────────────────
// Bildirimler
// ─────────────────────────────────────────────

/**
 * Yeni sipariş için sipariş alarmı ve Socket.IO (admin) bildirimlerini gönderir.
 * Ana işlem akışını engellemez.
 *
 * @param {Object} io - Socket.IO sunucu nesnesi
 * @param {Object} newOrder - Kaydedilen sipariş belgesi
 * @param {Object} requestUser - req.user nesnesi
 */
export function dispatchOrderNotifications(io, newOrder, requestUser) {
  // ─── Sipariş alarmı telefonları (bu süreçte bekleyenler hemen yeniden bakar) ───
  try {
    signalOrderAlarm();
  } catch (alarmError) {
    console.error("Sipariş alarmı sinyali gönderilemedi:", alarmError.message);
  }

  // ─── Socket.IO: Admin bildirim (anlık) ───
  try {
    if (!io) {
      console.error("dispatchOrderNotifications: Socket.IO nesnesi bulunamadı!");
    } else {
      notifyAdmins(io, "newOrder", {
        message: "Yeni bir sipariş geldi!",
        order: {
          id: newOrder._id.toString(),
          totalAmount: newOrder.totalAmount,
          status: newOrder.status,
          createdAt: newOrder.createdAt,
          customerName: requestUser.name,
          city: newOrder.city,
          phone: newOrder.phone,
          deliveryPoint: newOrder.deliveryPoint,
          deliveryPointName: newOrder.deliveryPointName,
          paymentMethod: newOrder.paymentMethod || null,
          paymentMethodLabel: paymentMethodLabel(newOrder.paymentMethod),
          products: newOrder.products?.map((product) => ({
            name: product.name,
            quantity: product.quantity,
            price: product.price,
          })) || [],
        },
      });
    }
  } catch (socketError) {
    console.error("Socket.IO bildirimi gönderilirken hata:", socketError);
  }
}
