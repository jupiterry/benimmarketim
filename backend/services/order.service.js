/**
 * order.service.js
 *
 * Sipariş iş mantığı için merkezi servis.
 * cart.controller.js ve payment.controller.js bu servisten yararlanır.
 * Fiyat hesaplama, kupon doğrulama ve bildirim gönderme tek bir yerde yönetilir.
 */

import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import { sendOrderNotification } from "./n8n.service.js";
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
 * @returns {{ orderProducts, totalAmount }}
 * @throws {Error} Ürün bulunamazsa veya miktar geçersizse
 */
export async function buildOrderProducts(cartProducts) {
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

    const weeklyPrice = weeklyPriceMap.get(product._id.toString());
    const effectivePrice = weeklyPrice !== undefined ? weeklyPrice : product.price;

    totalAmount += effectivePrice * quantity;

    return {
      product: product._id,
      name: product.name,
      quantity,
      price: effectivePrice,
      originalPrice: product.price,
      isWeeklyDiscount: weeklyPrice !== undefined,
      category: product.category,
    };
  });

  return { orderProducts, totalAmount };
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
 * Yeni sipariş için Socket.IO ve n8n bildirimlerini gönderir.
 * Ana işlem akışını engellemez (setImmediate ile arka plana alınır).
 *
 * @param {Object} io - Socket.IO sunucu nesnesi
 * @param {Object} newOrder - Kaydedilen sipariş belgesi
 * @param {Object} requestUser - req.user nesnesi
 * @param {string} phone - Sipariş telefon numarası
 */
export function dispatchOrderNotifications(io, newOrder, requestUser, phone) {
  // ─── Socket.IO: Admin bildirim (anlık) ───
  try {
    if (!io) {
      console.error("dispatchOrderNotifications: Socket.IO nesnesi bulunamadı!");
    } else {
      io.to("adminRoom").emit("newOrder", {
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

  // ─── n8n: Webhook (arka plan, hata ana akışı engellemez) ───
  setImmediate(async () => {
    try {
      const orderData = await Order.findById(newOrder._id).populate(
        "user",
        "name email phone"
      );

      if (!orderData) {
        console.error("[n8n] Sipariş verisi bulunamadı, bildirim gönderilemedi.");
        return;
      }

      const products = orderData.products
        .filter((p) => p && (p.name || p.product?.name))
        .map((p) => ({
          name: p.name || p.product?.name || "Bilinmeyen Ürün",
          quantity: p.quantity || 1,
          price: p.price || p.product?.price || 0,
          total: (p.price || 0) * (p.quantity || 1),
        }));

      if (products.length === 0) {
        console.error("[n8n] Ürün listesi boş, bildirim gönderilemedi.");
        return;
      }

      const notificationData = {
        orderId: newOrder._id.toString(),
        _id: newOrder._id,
        orderNumber: newOrder._id.toString(),
        user: {
          id: requestUser._id.toString(),
          _id: requestUser._id,
          name: requestUser.name || orderData.user?.name || "",
          email: requestUser.email || orderData.user?.email || "",
          phone: requestUser.phone || phone || orderData.phone || "",
        },
        products,
        totalAmount: newOrder.totalAmount || 0,
        city: newOrder.city || "",
        deliveryPoint: newOrder.deliveryPoint || "",
        deliveryPointName: newOrder.deliveryPointName || "",
        status: newOrder.status || "Hazırlanıyor",
        createdAt: newOrder.createdAt || new Date(),
        note: newOrder.note || "",
      };

      if (!notificationData.user.name || !notificationData.user.phone) {
        console.error("[n8n] Kullanıcı bilgileri eksik, bildirim gönderilemedi.");
        return;
      }

      const result = await sendOrderNotification(notificationData);
      if (result) {
        console.log("[n8n] Sipariş bildirimi başarıyla gönderildi.");
      } else {
        console.error("[n8n] Sipariş bildirimi gönderilemedi.");
      }
    } catch (n8nError) {
      console.error("[n8n] Bildirim gönderilirken hata:", n8nError.message);
    }
  });
}
