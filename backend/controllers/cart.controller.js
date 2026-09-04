import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";
import { redis } from "../lib/redis.js";
import { processReferralFirstOrder } from "./referral.controller.js";
import { useCoupon } from "./coupon.controller.js";
import {
  buildOrderProducts,
  validateAndCalculateCoupon,
  commitCouponUsage,
  dispatchOrderNotifications,
} from "../services/order.service.js";

// ─────────────────────────────────────────────────────────────────
// #12 — Sipariş saatleri: Redis-based cache (PM2 cluster uyumlu)
// In-memory global değişken yerine Redis kullanılır; böylece tüm
// worker process'ler aynı, güncel veriyi görür.
// ─────────────────────────────────────────────────────────────────
const ORDER_HOURS_CACHE_KEY = "order_hours_cache";
const CACHE_TTL_SECONDS = 60; // 1 dakika

/** Sipariş saatleri ayarlarını Redis'ten veya DB'den getirir. */
const getOrderHoursSettings = async () => {
  try {
    const cached = await redis.get(ORDER_HOURS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis erişim hatası → DB'ye düş
  }

  const settings = await Settings.getSettings();
  const hours = {
    startHour: settings.orderStartHour,
    startMinute: settings.orderStartMinute,
    endHour: settings.orderEndHour,
    endMinute: settings.orderEndMinute,
  };

  try {
    await redis.set(ORDER_HOURS_CACHE_KEY, JSON.stringify(hours), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Redis yazma hatası → sessizce devam et
  }

  return hours;
};

/** Admin ayarları değiştirdiğinde cache'i temizler. */
export const refreshOrderHoursCache = async () => {
  try {
    await redis.del(ORDER_HOURS_CACHE_KEY);
    // Hemen yeniden doldur (ilk isteği hızlandırmak için)
    await getOrderHoursSettings();
    return true;
  } catch (error) {
    console.error("Sipariş saatleri önbelleği yenilenirken hata:", error);
    return false;
  }
};

/** Şimdiki Türkiye saatinin sipariş aralığı içinde olup olmadığını kontrol eder. */
const isWithinOrderHours = async () => {
  const nowTr = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" })
  );

  const hours = await getOrderHoursSettings();

  const currentTimeInMinutes = nowTr.getHours() * 60 + nowTr.getMinutes();
  const startTimeInMinutes = hours.startHour * 60 + hours.startMinute;
  const rawEndTimeInMinutes = hours.endHour * 60 + hours.endMinute;

  // 00:00 kapanış saati: başlangıç 00:00 değilse günün sonuna (24:00) eşitlenir
  const endTimeInMinutes =
    rawEndTimeInMinutes === 0 && startTimeInMinutes !== 0
      ? 24 * 60
      : rawEndTimeInMinutes;

  // 00:00–00:00: 24 saat açık
  if (startTimeInMinutes === 0 && endTimeInMinutes === 0) {
    return true;
  }

  // Normal durum (aynı gün): ör. 10:00–22:00
  if (startTimeInMinutes < endTimeInMinutes) {
    return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
  }

  // Gece yarısını geçen durum: ör. 22:00–02:00
  return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
};

/** Sipariş saati hata mesajı oluşturur. */
const getOrderHoursMessage = async () => {
  try {
    const hours = await getOrderHoursSettings();

    const formatHour = (hour) => {
      if (hour === 0) return "00:00";
      if (hour < 12) return `sabah ${hour}`;
      if (hour === 12) return "öğlen 12";
      if (hour < 17) return `öğleden sonra ${hour}`;
      if (hour < 21) return `akşam ${hour}`;
      return `gece ${hour}`;
    };

    return `Siparişler sadece ${formatHour(hours.startHour)}:${String(hours.startMinute).padStart(2, "0")} ile ${formatHour(hours.endHour)}:${String(hours.endMinute).padStart(2, "0")} arasında verilebilir.`;
  } catch {
    return "Siparişler sadece belirlenen saatler arasında verilebilir.";
  }
};

// ─────────────────────────────────────────────────────────────────
// #6 — addToCart: Saat kontrolü KALDIRILDI (kötü UX)
// Kullanıcı iş saatleri dışında sepetini hazırlayabilmeli.
// Saat kontrolü yalnızca placeOrder'da yapılır.
//
// #1 — Sepet toplam miktar üst sınırı: Mevcut + yeni miktar
// birlikte MAX_CART_ITEM_QTY'yi geçemez.
// ─────────────────────────────────────────────────────────────────
const MAX_CART_ITEM_QTY = 99;

export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const user = req.user;

    if (!productId) {
      return res.status(400).json({ error: "Ürün ID eksik!" });
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_CART_ITEM_QTY) {
      return res.status(400).json({ error: "Geçersiz miktar! (1–99 arası olmalı)" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Ürün bulunamadı!" });
    }

    const existingItem = user.cartItems.find(
      (item) => item.product?.toString() === productId
    );

    // #1 — Toplamda üst sınır kontrolü
    const currentQty = existingItem?.quantity ?? 0;
    const newQty = currentQty + qty;

    if (newQty > MAX_CART_ITEM_QTY) {
      return res.status(400).json({
        error: `Bir üründen en fazla ${MAX_CART_ITEM_QTY} adet ekleyebilirsiniz. (Sepette: ${currentQty})`,
      });
    }

    if (existingItem) {
      existingItem.quantity = newQty;
      existingItem.addedAt = new Date();
    } else {
      user.cartItems.push({ product: productId, quantity: qty, addedAt: new Date() });
    }

    user.cartLastUpdated = new Date();
    await user.save();
    res.status(200).json(user.cartItems);
  } catch (error) {
    console.error("Sepete ürün eklerken hata:", error.message);
    res.status(500).json({ message: "Sepete ürün eklenirken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Sepetteki ürünleri getir
// ─────────────────────────────────────────────
export const getCartProducts = async (req, res) => {
  try {
    const validCartItems = req.user.cartItems.filter((item) => item.product);
    const products = await Product.find({
      _id: { $in: validCartItems.map((item) => item.product) },
    });

    const { orderProducts } = await buildOrderProducts(
      validCartItems.map((item) => ({
        product: item.product.toString(),
        quantity: item.quantity,
      }))
    );
    const pricingMap = new Map(
      orderProducts.map((item) => [item.product.toString(), item])
    );

    const cartItems = products.map((product) => {
      const item = validCartItems.find(
        (cartItem) => cartItem.product.toString() === product._id.toString()
      );
      const pricing = pricingMap.get(product._id.toString());
      return {
        ...product.toJSON(),
        price: pricing?.price ?? product.price,
        originalPrice: product.price,
        actualPrice: pricing?.price ?? product.price,
        isDiscounted: Boolean(pricing && pricing.price < product.price),
        discountedPrice: pricing && pricing.price < product.price ? pricing.price : null,
        quantity: item.quantity,
      };
    });

    res.json(cartItems);
  } catch (error) {
    console.error("getCartProducts hatası:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Sepeti temizle
// ─────────────────────────────────────────────
export const clearCart = async (req, res) => {
  try {
    const user = req.user;
    user.cartItems = [];
    user.cartLastUpdated = new Date();
    await user.save();
    res.json(user.cartItems);
  } catch (error) {
    console.error("clearCart hatası:", error.message);
    res.status(500).json({ message: "Sepet temizlenirken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Sepetten ürün kaldır
// ─────────────────────────────────────────────
export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const user = req.user;

    if (!productId) {
      return res.status(400).json({ message: "Ürün ID gerekli" });
    }

    user.cartItems = user.cartItems.filter(
      (item) => item.product && item.product.toString() !== productId
    );
    user.cartLastUpdated = new Date();
    await user.save();
    res.json(user.cartItems);
  } catch (error) {
    console.error("removeFromCart hatası:", error.message);
    res.status(500).json({ message: "Ürün sepetten kaldırılırken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Sepet ürün miktarını güncelle
// ─────────────────────────────────────────────
export const updateQuantity = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { quantity } = req.body;
    const user = req.user;

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_CART_ITEM_QTY) {
      return res.status(400).json({ message: "Geçersiz miktar! (0–99 arası)" });
    }

    const existingItem = user.cartItems.find(
      (item) => item.product && item.product.toString() === productId
    );

    if (!existingItem) {
      return res.status(404).json({ message: "Ürün sepette bulunamadı" });
    }

    if (qty === 0) {
      user.cartItems = user.cartItems.filter(
        (item) => item.product.toString() !== productId
      );
    } else {
      existingItem.quantity = qty;
    }

    user.cartLastUpdated = new Date();
    await user.save();
    res.json(user.cartItems);
  } catch (error) {
    console.error("updateQuantity hatası:", error.message);
    res.status(500).json({ message: "Miktar güncellenirken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// #2 — Sipariş oluşturma: Ortak order.service.js kullanılıyor
// Fiyat hesaplama, kupon doğrulama ve bildirimler tek bir serviste.
// ─────────────────────────────────────────────────────────────────
export const placeOrder = async (req, res) => {
  try {
    // Sipariş saati kontrolü (sadece sipariş verirken)
    if (!(await isWithinOrderHours())) {
      return res.status(400).json({ error: await getOrderHoursMessage() });
    }

    const { products, city, phone, note, deliveryPoint, deliveryPointName, couponCode } = req.body;

    // Zorunlu alan kontrolleri
    if (!products || products.length === 0) {
      return res.status(400).json({ error: "Sepet boş!" });
    }
    if (!city || !phone) {
      return res.status(400).json({ error: "Şehir ve telefon numarası zorunludur!" });
    }
    if (!deliveryPoint) {
      return res.status(400).json({ error: "Lütfen teslimat noktası seçiniz!" });
    }

    // Minimum tutar ve teslimat noktası ayarlarını tek sorguda al
    const settings = await Settings.getSettings();
    const minimumOrderAmount = settings.minimumOrderAmount || 250;

    // Teslimat noktası kontrolü
    const deliveryPointsStatus = settings.deliveryPoints;
    if (!deliveryPointsStatus) {
      return res.status(400).json({ error: "Teslimat noktaları ayarları bulunamadı!" });
    }

    const selectedPoint =
      deliveryPoint === "girlsDorm"
        ? deliveryPointsStatus.girlsDorm
        : deliveryPointsStatus.boysDorm;

    if (!selectedPoint?.enabled) {
      return res.status(400).json({ error: "Seçilen teslimat noktası şu anda aktif değil!" });
    }

    // Fiyat hesaplama (order.service)
    const { orderProducts, totalAmount } = await buildOrderProducts(products);

    if (totalAmount < minimumOrderAmount) {
      return res.status(400).json({
        error: `Sipariş tutarı minimum ${minimumOrderAmount} TL olmalıdır!`,
      });
    }

    // Kupon doğrulama (order.service)
    const { appliedCoupon, couponDiscount } = await validateAndCalculateCoupon(
      couponCode,
      req.user._id,
      totalAmount,
      {
        orderProducts,
        deliveryPoint,
        channel: req.body.channel || req.body.device?.platform || "web",
      }
    );

    const finalTotalAmount = Math.max(0, totalAmount - couponDiscount);

    // Sipariş kaydet
    const newOrder = await Order.create({
      user: req.user._id,
      products: orderProducts,
      totalAmount: finalTotalAmount,
      subtotalAmount: totalAmount,
      city,
      phone,
      note: note || "",
      deliveryPoint,
      deliveryPointName: deliveryPointName || "",
      couponCode: appliedCoupon?.code || null,
      couponDiscount,
    });

    // Kupon kullanımını atomik olarak kaydet (order.service)
    if (appliedCoupon) {
      await commitCouponUsage(appliedCoupon, req.user._id, newOrder._id);
      // commitCouponUsage hata atarsa sipariş otomatik silinir
    }

    // Sepeti temizle
    req.user.cartItems = [];
    await req.user.save();

    // Referral: İlk sipariş kontrolü
    try {
      const userOrderCount = await Order.countDocuments({ user: req.user._id });
      if (userOrderCount === 1) {
        const referralResult = await processReferralFirstOrder(req.user._id);
        if (referralResult.success) {
          console.log("Referral ödülü verildi. Referrer:", referralResult.referrerId);
        }
      }
    } catch (refError) {
      // Referral hatası ana işlemi etkilemez
      console.error("Referral işlemi sırasında hata:", refError);
    }

    // Socket.IO + n8n bildirimleri (order.service — arka planda)
    const io = req.app.get("io");
    dispatchOrderNotifications(io, newOrder, req.user, phone);

    res.status(201).json({
      success: true,
      message: "Sipariş başarıyla oluşturuldu.",
      orderId: newOrder._id,
      order: newOrder,
    });
  } catch (error) {
    // commitCouponUsage'dan gelen 409 hatası
    const statusCode = error.statusCode || 500;
    console.error("Sipariş oluşturulurken hata:", error.message);
    res.status(statusCode).json({
      message: error.message || "Sipariş oluşturulurken hata oluştu",
      error: error.message,
      details: error.errors || {},
    });
  }
};
