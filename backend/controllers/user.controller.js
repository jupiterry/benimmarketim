import mongoose from "mongoose";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Feedback from "../models/feedback.model.js";
import Referral from "../models/referral.model.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

// Kullanıcı bilgilerini getir
export const getUserInfo = async (req, res) => {
  try {
    const isAdmin = req.user?.role === "admin";
    const requesterId = req.user?._id;
    const isSelf = requesterId?.equals
      ? requesterId.equals(req.params.id)
      : requesterId?.toString() === req.params.id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: "Bu kullanıcı bilgilerine erişim yetkiniz yok" });
    }

    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }
    res.json(user);
  } catch (error) {
    console.error("Kullanıcı bilgileri getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

// En iyi müşterileri getir
export const getBestCustomers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const bestCustomers = await Order.aggregate([
      {
        $match: {
          status: { $in: ["Hazırlanıyor", "Yolda", "Teslim Edildi"] } // İptal edilmemiş siparişler
        }
      },
      {
        $group: {
          _id: "$user",
          totalSpent: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { orderCount: -1, totalSpent: -1 }
      },
      {
        $limit: limit
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo"
        }
      },
      {
        $unwind: "$userInfo"
      },
      {
        $project: {
          userId: "$_id",
          name: "$userInfo.name",
          email: "$userInfo.email",
          totalSpent: 1,
          orderCount: 1,
          avgOrderValue: { $divide: ["$totalSpent", "$orderCount"] }
        }
      }
    ]);

    res.json({ customers: bestCustomers });
  } catch (error) {
    console.error("En iyi müşteriler getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

// Hesap silme
export const deleteAccount = async (req, res) => {
  try {
    // Güvenlik: Sadece authenticated kullanıcının kendi ID'sini kullan
    // Body'den veya params'tan gelen userId parametreleri yok sayılır
    const userId = req.user.id || req.user._id;
    
    if (!userId) {
      return res.status(401).json({ message: "Kullanıcı kimliği bulunamadı" });
    }
    
    const { reason, deletionType, selectedDataTypes } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: "Hesap silme nedeni belirtilmelidir" });
    }

    if (deletionType === "partial" && (!selectedDataTypes || selectedDataTypes.length === 0)) {
      return res.status(400).json({ message: "Kısmi silme için en az bir veri türü seçilmelidir" });
    }

    let deletionTasks = [];
    let message = "";

    if (deletionType === "full") {
      // Tam hesap silme
      deletionTasks = [
        // Siparişleri sil
        Order.deleteMany({ user: userId }),
        
        // Geri bildirimleri sil
        Feedback.deleteMany({ user: userId }),
        
        // Sepet verilerini temizle (eğer ayrı bir model varsa)
        // Cart.deleteMany({ user: userId }),
        
        // Kullanıcıyı sil
        User.findByIdAndDelete(userId)
      ];
      message = "Hesabınız ve tüm verileriniz başarıyla silindi";
    } else {
      // Kısmi veri silme
      deletionTasks = [];
      
      if (selectedDataTypes.includes("orders")) {
        deletionTasks.push(Order.deleteMany({ user: userId }));
      }
      
      if (selectedDataTypes.includes("feedback")) {
        deletionTasks.push(Feedback.deleteMany({ user: userId }));
      }
      
      if (selectedDataTypes.includes("personal") || selectedDataTypes.includes("preferences")) {
        // Kullanıcı bilgilerini güncelle (silmek yerine anonimleştir)
        const updateFields = {};
        if (selectedDataTypes.includes("personal")) {
          updateFields.firstName = "Silinmiş";
          updateFields.lastName = "Kullanıcı";
          updateFields.email = `deleted_${userId}@example.com`;
          updateFields.phone = "";
        }
        if (selectedDataTypes.includes("preferences")) {
          updateFields.preferences = {};
        }
        
        if (Object.keys(updateFields).length > 0) {
          deletionTasks.push(User.findByIdAndUpdate(userId, updateFields));
        }
      }
      
      message = "Seçilen verileriniz başarıyla silindi";
    }

    if (deletionTasks.length > 0) {
      await Promise.all(deletionTasks);
    }

    // Log kaydı
    console.log(`Kullanıcı veri silme işlemi - ID: ${userId}, Tür: ${deletionType}, Neden: ${reason}, Veri Türleri: ${selectedDataTypes?.join(', ') || 'Tümü'}`);

    res.json({ 
      message: message,
      deletionType: deletionType,
      deletedDataTypes: selectedDataTypes || "all",
      deletedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Hesap silme hatası:", error);
    res.status(500).json({ message: "Veri silinirken hata oluştu", error: error.message });
  }
};

// ── Yönetici: müşteri profili ─────────────────────────────────────────
// Müşteriler ekranındaki profil çekmecesi için tek istekte özet: sipariş istatistikleri,
// son siparişler, en çok alınan ürünler, kupon kullanımı, davet bilgisi, cihaz ve bildirim tercihleri.
const CANCELLED = "İptal Edildi";
const RECENT_ORDER_LIMIT = 10;
const TOP_PRODUCT_LIMIT = 5;
const toIso = (value) => (value ? new Date(value).toISOString() : null);
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Saf hesaplama: kullanıcı + siparişleri (yeniden eskiye) + davet kayıtları → profil yanıtı */
export const buildCustomerProfile = (user, orders = [], { invitedBy = null, own = null } = {}) => {
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const valid = sorted.filter((order) => order.status !== CANCELLED);
  const totalSpent = round2(valid.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0));
  const deliveredCount = sorted.filter((order) => order.status === "Teslim Edildi").length;
  const oldest = sorted[sorted.length - 1];

  // En çok alınan ürünler: ürün kimliğine (yoksa adına) göre adet toplamı; iptaller sayılmaz
  const products = new Map();
  for (const order of valid) {
    for (const item of order.products || []) {
      const ref = item.product && typeof item.product === "object" ? item.product : null;
      const key = String(ref?._id || item.product || item.name || "");
      if (!key) continue;
      const entry = products.get(key) || { productId: ref?._id ? String(ref._id) : (item.product ? String(item.product) : null), name: ref?.name || item.name || "Ürün", image: ref?.image || null, quantity: 0, total: 0, orders: 0, lastAt: null };
      entry.quantity += Number(item.quantity) || 0;
      entry.total = round2(entry.total + (Number(item.price) || 0) * (Number(item.quantity) || 0));
      entry.orders += 1;
      if (!entry.lastAt || new Date(order.createdAt) > new Date(entry.lastAt)) entry.lastAt = toIso(order.createdAt);
      products.set(key, entry);
    }
  }
  const topProducts = [...products.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total).slice(0, TOP_PRODUCT_LIMIT);

  // Kupon kullanımı (Order.couponCode)
  const coupons = new Map();
  for (const order of valid) {
    if (!order.couponCode) continue;
    const code = String(order.couponCode).toUpperCase();
    const entry = coupons.get(code) || { code, count: 0, discount: 0, lastUsedAt: null };
    entry.count += 1;
    entry.discount = round2(entry.discount + (Number(order.couponDiscount) || 0));
    if (!entry.lastUsedAt || new Date(order.createdAt) > new Date(entry.lastUsedAt)) entry.lastUsedAt = toIso(order.createdAt);
    coupons.set(code, entry);
  }
  const couponList = [...coupons.values()].sort((a, b) => b.count - a.count);

  // Son görülme: web etkinliği, giriş ve uygulama içinden en yenisi
  const seen = [
    ["web", user.lastActive],
    ["login", user.lastLoginAt],
    ["app", user.appActivity?.lastSeenAt],
  ].filter(([, at]) => at).sort((a, b) => new Date(b[1]) - new Date(a[1]));
  const lastOrderWithDevice = sorted.find((order) => order.device && order.device.platform && order.device.platform !== "unknown");

  return {
    user: {
      _id: String(user._id),
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      role: user.role || "customer",
      createdAt: toIso(user.createdAt || user._id?.getTimestamp?.()),
      hasFeedback: Boolean(user.hasFeedback),
      cartItemCount: (user.cartItems || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      cartLastUpdated: toIso(user.cartLastUpdated),
    },
    stats: {
      orderCount: sorted.length,
      validCount: valid.length,
      cancelledCount: sorted.length - valid.length,
      deliveredCount,
      totalSpent,
      avgBasket: valid.length ? round2(totalSpent / valid.length) : 0,
      firstOrderAt: toIso(oldest?.createdAt),
      lastOrderAt: toIso(sorted[0]?.createdAt),
      couponOrders: valid.filter((order) => order.couponCode).length,
      couponDiscount: round2(valid.reduce((sum, order) => sum + (Number(order.couponDiscount) || 0), 0)),
    },
    recentOrders: sorted.slice(0, RECENT_ORDER_LIMIT).map((order) => ({
      _id: String(order._id),
      status: order.status || "Hazırlanıyor",
      totalAmount: Number(order.totalAmount) || 0,
      createdAt: toIso(order.createdAt),
      itemCount: (order.products || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      couponCode: order.couponCode || null,
      deliveryPointName: order.deliveryPointName || "",
      platform: order.device?.platform && order.device.platform !== "unknown" ? order.device.platform : null,
    })),
    topProducts,
    coupons: { usedCount: couponList.reduce((sum, c) => sum + c.count, 0), codes: couponList },
    referral: {
      // Bu müşteriyi kim davet etti
      invitedBy: invitedBy
        ? {
            userId: invitedBy.referrer?._id ? String(invitedBy.referrer._id) : (invitedBy.referrer ? String(invitedBy.referrer) : null),
            name: invitedBy.referrer?.name || null,
            code: invitedBy.referralCode || null,
            status: invitedBy.entry?.status || "pending",
            signedUpAt: toIso(invitedBy.entry?.signedUpAt),
            firstOrderAt: toIso(invitedBy.entry?.firstOrderAt),
          }
        : null,
      // Müşterinin kendi davet kodu ve davet ettikleri
      own: own
        ? {
            code: own.referralCode || null,
            isActive: Boolean(own.isActive),
            totalReferrals: own.totalReferrals || 0,
            successfulReferrals: own.successfulReferrals || 0,
            totalRewardsEarned: own.totalRewardsEarned || 0,
            invited: (own.referredUsers || []).map((entry) => ({
              userId: entry.user?._id ? String(entry.user._id) : (entry.user ? String(entry.user) : null),
              name: entry.user?.name || null,
              status: entry.status || "pending",
              signedUpAt: toIso(entry.signedUpAt),
              firstOrderAt: toIso(entry.firstOrderAt),
            })),
          }
        : null,
    },
    activity: {
      lastSeenAt: toIso(seen[0]?.[1]),
      lastSeenSource: seen[0]?.[0] || null,
      lastActive: toIso(user.lastActive),
      lastLoginAt: toIso(user.lastLoginAt),
      app: {
        lastSeenAt: toIso(user.appActivity?.lastSeenAt),
        visitStartedAt: toIso(user.appActivity?.visitStartedAt),
        checkoutAt: toIso(user.appActivity?.checkoutAt),
        orderAt: toIso(user.appActivity?.orderAt),
        visitCount: user.appActivity?.visitCount || 0,
      },
    },
    device: {
      deviceType: user.deviceType || "unknown",
      lastDeviceType: user.lastDeviceType || "unknown",
      platform: lastOrderWithDevice?.device?.platform || null,
      model: lastOrderWithDevice?.device?.model || "",
      appVersion: lastOrderWithDevice?.device?.appVersion || "",
    },
    notifications: {
      pushEnabled: user.pushNotificationsEnabled !== false,
      hasToken: Boolean(user.fcmToken),
      preferences: {
        orders: user.notificationPreferences?.orders !== false,
        messages: user.notificationPreferences?.messages !== false,
        campaigns: user.notificationPreferences?.campaigns !== false,
      },
      cartReminderSentAt: toIso(user.cartReminderSentAt),
    },
  };
};

// GET /users/:id/profile (yönetici)
export const getCustomerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Geçersiz müşteri kimliği" });
    }
    const user = await User.findById(id).select("-password").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    const [orders, invitedByDoc, own] = await Promise.all([
      Order.find({ user: id })
        .select("status totalAmount createdAt products couponCode couponDiscount device deliveryPointName")
        .populate({ path: "products.product", select: "name image" })
        .sort({ createdAt: -1 })
        .lean(),
      Referral.findOne({ "referredUsers.user": id }).populate("referrer", "name").lean(),
      Referral.findOne({ referrer: id }).populate("referredUsers.user", "name").lean(),
    ]);
    const invitedBy = invitedByDoc
      ? { ...invitedByDoc, entry: (invitedByDoc.referredUsers || []).find((entry) => String(entry.user?._id || entry.user) === String(id)) || null }
      : null;
    res.json({ success: true, profile: buildCustomerProfile(user, orders || [], { invitedBy, own }), serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("Müşteri profili getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Müşteri profili getirilirken hata oluştu" });
  }
};

// PATCH /users/:userId/role (yönetici): rolü değiştirir, işlem kaydı yazar
const ROLES = new Set(["customer", "admin"]);
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const role = String(req.body?.role || "").trim();
    if (!ROLES.has(role)) {
      return res.status(400).json({ success: false, message: "Rol 'customer' ya da 'admin' olmalı" });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: "Geçersiz müşteri kimliği" });
    }
    if (String(req.user?._id) === String(userId) && role !== "admin") {
      return res.status(400).json({ success: false, message: "Kendi yönetici yetkinizi kaldıramazsınız" });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    const previous = user.role;
    if (previous !== role) {
      user.role = role;
      await user.save();
      recordAdminAction(req, {
        action: role === "admin" ? "Müşteri yönetici yapıldı" : "Yönetici yetkisi kaldırıldı",
        category: "customer",
        target: String(user._id),
        targetName: user.name,
        changes: [{ label: "Rol", from: previous === "admin" ? "Yönetici" : "Müşteri", to: role === "admin" ? "Yönetici" : "Müşteri" }],
      });
    }
    res.json({ success: true, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error("Rol güncellenirken hata:", error);
    res.status(500).json({ success: false, message: "Rol güncellenirken hata oluştu" });
  }
};
