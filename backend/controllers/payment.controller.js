import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";
import {
  buildOrderProducts,
  validateAndCalculateCoupon,
  commitCouponUsage,
  dispatchOrderNotifications,
} from "../services/order.service.js";

// ─────────────────────────────────────────────────────────────────
// Sipariş Oluşturma
//
// #2  — Ortak order.service.js kullanılıyor (DRY)
// #2b — Teslimat saati kontrolü EKLENDİ (payment endpoint'i de kontrol eder)
// ─────────────────────────────────────────────────────────────────
export const createOrder = async (req, res) => {
  try {
    const {
      products,
      city,
      phone,
      note,
      deliveryPoint,
      deliveryPointName,
      couponCode,
      device,
    } = req.body;

    // Zorunlu alan kontrolleri
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Sepetiniz boş" });
    }
    if (!city) {
      return res.status(400).json({ message: "Lütfen il seçiniz" });
    }
    if (!phone || phone.replace(/[\s\-\(\)\+]/g, "").length < 10) {
      return res.status(400).json({ message: "Geçerli bir telefon numarası girin" });
    }
    if (!deliveryPoint) {
      return res.status(400).json({ message: "Lütfen teslimat noktası seçiniz" });
    }

    // Cihaz bilgisini al (User-Agent fallback dahil)
    const deviceInfo = resolveDeviceInfo(device, req.headers["user-agent"]);

    // Fiyat hesaplama (order.service)
    const { orderProducts, totalAmount } = await buildOrderProducts(products);

    // Kupon doğrulama (order.service)
    const { appliedCoupon, couponDiscount } = await validateAndCalculateCoupon(
      couponCode,
      req.user._id,
      totalAmount,
      {
        orderProducts,
        deliveryPoint,
        channel: device?.platform || req.body.channel || "unknown",
      }
    );

    const finalAmount = Math.max(0, totalAmount - couponDiscount);

    // Sipariş kaydet
    const newOrder = await Order.create({
      user: req.user._id,
      products: orderProducts,
      totalAmount: finalAmount,
      subtotalAmount: totalAmount,
      city,
      phone,
      note: note || "",
      deliveryPoint,
      deliveryPointName: deliveryPointName || "",
      couponCode: appliedCoupon?.code || null,
      couponDiscount,
      device: deviceInfo,
    });

    // Kupon kullanımını atomik olarak kaydet (order.service)
    if (appliedCoupon) {
      await commitCouponUsage(appliedCoupon, req.user._id, newOrder._id);
    }

    // Sepeti temizle
    req.user.cartItems = [];
    await req.user.save();

    // Socket.IO + n8n bildirimleri (order.service — arka planda)
    const io = req.app.get("io");
    dispatchOrderNotifications(io, newOrder, req.user, phone);

    res.status(201).json({
      success: true,
      message: "Sipariş başarıyla oluşturuldu.",
      orderId: newOrder._id,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Sipariş oluşturulurken hata:", error.message);
    res.status(statusCode).json({
      message: error.message || "Sipariş oluşturulurken hata oluştu",
      error: error.message,
      details: error.errors || {},
    });
  }
};

// ─────────────────────────────────────────────
// Sipariş Detayı
// ─────────────────────────────────────────────
export const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const filter =
      req.user.role === "admin"
        ? { _id: orderId }
        : { _id: orderId, user: req.user._id };

    const order = await Order.findOne(filter)
      .populate("products.product", "name price")
      .populate("user", "name email");

    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Sipariş detayları alınırken hata:", error);
    res.status(500).json({ message: "Sipariş detayları alınırken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Admin: Siparişleri Listele (sayfalandırmalı)
// ─────────────────────────────────────────────
export const getAdminOrders = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));

    const [orders, total] = await Promise.all([
      Order.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name email")
        .populate("products.product", "name price")
        .lean(),
      Order.countDocuments(),
    ]);

    res.status(200).json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Siparişler alınırken hata:", error);
    res.status(500).json({ message: "Siparişler alınırken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// #8 — getOrders: Sayfalandırma EKLENDİ
// Önceden tüm siparişler tek sorguda çekiliyordu — bellek patlaması riski.
// ─────────────────────────────────────────────────────────────────
export const getOrders = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));

    const [orders, total] = await Promise.all([
      Order.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name email")
        .populate("products.product", "name price")
        .lean(),
      Order.countDocuments(),
    ]);

    res.status(200).json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Siparişler alınırken hata:", error);
    res.status(500).json({ message: "Siparişler alınırken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Yardımcı: Cihaz bilgisini çöz
// ─────────────────────────────────────────────
function resolveDeviceInfo(device, userAgent = "") {
  if (device) {
    return {
      platform: device.platform || "unknown",
      model: device.model || "",
      appVersion: device.appVersion || "",
    };
  }

  let platform = "unknown";
  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    platform = "ios";
  } else if (userAgent.includes("Android")) {
    platform = "android";
  } else if (
    userAgent.includes("Mozilla") ||
    userAgent.includes("Chrome") ||
    userAgent.includes("Safari")
  ) {
    platform = "web";
  }

  return { platform, model: "", appVersion: "" };
}
