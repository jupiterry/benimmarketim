import mongoose from "mongoose";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Feedback from "../models/feedback.model.js";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import Coupon from "../models/coupon.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import { deleteUserAccount } from "../services/account.service.js";
import Referral from "../models/referral.model.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { ABANDON_REASONS, CANCEL_REASONS, DELIVERY_OUTCOMES, ISSUE_TYPES, LOW_RATING } from "../lib/feedbackOptions.js";
import { PAYMENT_METHODS } from "../lib/paymentMethods.js";
import { STAFF_FLAGS, STAFF_FLAG_KEYS, STAFF_NOTE_MAX, normalizeStaffFlags } from "../lib/staffFlags.js";

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
          // Ürün harcaması (teslimat ücreti hariç; eski siparişlerde totalAmount)
          totalSpent: { $sum: { $ifNull: ["$productTotal", "$totalAmount"] } },
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

    if (typeof reason !== "string" || reason.trim() === '') {
      return res.status(400).json({ message: "Hesap silme nedeni belirtilmelidir" });
    }

    if (deletionType === "partial" && (!Array.isArray(selectedDataTypes) || selectedDataTypes.length === 0)) {
      return res.status(400).json({ message: "Kısmi silme için en az bir veri türü seçilmelidir" });
    }

    let message = "";

    if (deletionType === "full") {
      // Tam hesap silme: ortak servis (siparişler anonimleştirilir, kişisel veriler silinir)
      await deleteUserAccount(userId);
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      message = "Hesabınız ve tüm verileriniz başarıyla silindi";
    } else {
      // Kısmi veri silme
      const deletionTasks = [];
      
      if (selectedDataTypes.includes("orders")) {
        // Siparişler silinmez; kullanıcı bağı anonimleştirilir
        deletionTasks.push(Order.updateMany({ user: userId }, { $set: { userDeleted: true, userDeletedAt: new Date() } }));
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
      
      if (deletionTasks.length > 0) {
        await Promise.all(deletionTasks);
      }
      message = "Seçilen verileriniz başarıyla silindi";
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
  // Ürün harcaması: teslimat ücreti ayrı (eski siparişlerde productTotal yok → totalAmount)
  const totalSpent = round2(valid.reduce((sum, order) => sum + (Number(order.productTotal ?? order.totalAmount) || 0), 0));
  const deliveryFeeTotal = round2(valid.reduce((sum, order) => sum + (Number(order.deliveryFee) || 0), 0));
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
      deliveryFeeTotal,
      firstOrderAt: toIso(oldest?.createdAt),
      lastOrderAt: toIso(sorted[0]?.createdAt),
      couponOrders: valid.filter((order) => order.couponCode).length,
      couponDiscount: round2(valid.reduce((sum, order) => sum + (Number(order.couponDiscount) || 0), 0)),
    },
    recentOrders: sorted.slice(0, RECENT_ORDER_LIMIT).map((order) => ({
      _id: String(order._id),
      status: order.status || "Hazırlanıyor",
      totalAmount: Number(order.totalAmount) || 0,
      productTotal: Number(order.productTotal ?? order.totalAmount) || 0,
      deliveryFee: Number(order.deliveryFee) || 0,
      deliveryZoneName: order.deliveryZone?.name || "",
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

// ── Yönetici: müşteri zaman çizelgesi, açık konular ve iç not ─────────
// Profil çekmecesindeki "Geçmiş": siparişler, sohbetler, destek talepleri, geri bildirimler ve kişiye özel
// kuponlar tek akışta, yeniden eskiye. Her kaynak koleksiyon başına sınırlı ve yalnızca gereken alanlarla okunur.
// Olay: { id, type, group, at, title, detail, tone, ref: { kind: order|chat|feedback|coupon, id } | null }
export const TIMELINE_PAGE_SIZE = 60;
export const TIMELINE_SOURCE_LIMIT = 60; // sohbet, destek talebi, geri bildirim ve kupon (koleksiyon başına, sayfa başına)
export const TIMELINE_ORDER_LIMIT = 200; // "Daha fazla" sayfasında sipariş üst sınırı (ilk sayfada tüm siparişler zaten okunur)
export const EXPIRING_COUPON_DAYS = 3;
export const DELIVERY_FAILURE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000; // Türkiye: UTC+3, yaz saati uygulaması yok
const TIMELINE_MIN_TIME = Date.UTC(2015, 0, 1);
const ACTIVE_ORDER_STATUSES = ["Hazırlanıyor", "Yolda"];
const DELIVERED = "Teslim Edildi";
const OPEN_SUPPORT_STATUSES = ["waiting", "accepted", "in_progress"];
const OPEN_ISSUE_LIMIT = 12;
const SNIPPET_MAX = 120;
const HEX24 = /^[0-9a-f]{24}$/i;
const POINT_LABELS = { girlsDorm: "Kız KYK Yurdu", boysDorm: "Erkek KYK Yurdu", address: "Adrese teslimat" };
const FEEDBACK_CATEGORY_LABELS = { "Şikayet": "Şikâyet", "Öneri": "Öneri", "Hata Bildirimi": "Hata bildirimi" };
// Müşteri yorum yazmadığında kayda yazılan hazır metinler (yorum sayılmaz)
const DEFAULT_FEEDBACK_TEXTS = new Set(["Puan bazlı değerlendirme", "Siparişten memnun kaldı", "Siparişten memnun kalmadı"]);
const ANSWERED_FEEDBACK_STATUSES = ["Çözüldü", "Kapatıldı"];
export const TIMELINE_GROUPS = {
  order_placed: "orders", order_delivered: "orders", order_cancelled: "orders", delivery_failed: "orders", callback_confirmed: "orders",
  chat_started: "chats", chat_handoff: "chats", chat_closed: "chats",
  feedback: "feedback",
  coupon_granted: "coupons", coupon_used: "coupons",
};
// Aynı andaki olayların sırası (yeniden eskiye listede üstte olan önce)
const SAME_TIME_RANK = {
  chat_closed: 9, delivery_failed: 8, order_cancelled: 8, order_delivered: 7, callback_confirmed: 6, coupon_used: 5,
  order_placed: 4, chat_handoff: 3, chat_started: 2, feedback: 1, coupon_granted: 1,
};

const idOf = (value) => (value?._id ? String(value._id) : value ? String(value) : "");
const timeOf = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};
/** Kaydın oluşturulma zamanı (ms); createdAt alanı olmayan eski kayıtlarda kimlikteki zaman */
const createdAtOf = (doc) => {
  const time = timeOf(doc?.createdAt);
  if (time !== null) return time;
  const id = idOf(doc?._id);
  return HEX24.test(id) ? parseInt(id.slice(0, 8), 16) * 1000 : null;
};
const isoOf = (time) => (time === null || time === undefined ? null : new Date(time).toISOString());
const tl = (value) => `₺${(Number(value) || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const decimal = (value) => (Number(value) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
export const orderCode = (id) => `#${idOf(id).slice(-6).toUpperCase()}`;
const dayText = (time) => new Date(time).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" });
const dateTimeText = (time) =>
  new Date(time).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const istanbulDay = (time) => Math.floor((time + ISTANBUL_OFFSET_MS) / DAY_MS);
const joinParts = (parts) => parts.filter((part) => part !== null && part !== undefined && part !== "").join(" · ");
/** Tek satırlık kısa metin (boşluklar sadeleşir, uzunsa "…" ile kısalır) */
export const textSnippet = (value, max = SNIPPET_MAX) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};
const quoted = (value, max = SNIPPET_MAX) => {
  const text = textSnippet(value, max);
  return text ? `“${text}”` : "";
};
const lastHistoryEntry = (order, status) => [...(order?.statusHistory || [])].reverse().find((entry) => entry?.status === status) || null;
const zoneOf = (order) => {
  const zone = order.deliveryZone?.name || order.deliveryAddress?.zoneName || order.deliveryPointName || POINT_LABELS[order.deliveryPoint] || "";
  const neighborhood = String(order.deliveryAddress?.neighborhood || "").trim();
  return [zone, neighborhood].filter(Boolean).join(", ");
};
const itemCountOf = (order) => (order.products || []).reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
const outcomeLabel = (outcome) => outcome?.label || DELIVERY_OUTCOMES[outcome?.code] || "Teslim edilemedi";
/**
 * Teslim / iptal zamanı: durum geçmişindeki kayıt. Geçmişi olmayan eski siparişte son değişiklik zamanı yalnızca
 * sipariş gününe düşüyorsa kullanılır (sonradan yapılan toplu bir güncelleme eski siparişi bugüne taşımasın).
 */
const LEGACY_STATUS_WINDOW_MS = DAY_MS;
const statusTimeOf = (order, status, placedAt) => {
  const fromHistory = timeOf(lastHistoryEntry(order, status)?.changedAt);
  if (fromHistory !== null) return fromHistory;
  const updated = timeOf(order.updatedAt);
  if (placedAt === null) return updated;
  return updated !== null && updated >= placedAt && updated - placedAt <= LEGACY_STATUS_WINDOW_MS ? updated : placedAt;
};
const failureTimeOf = (order) => timeOf(order.deliveryOutcome?.at) ?? statusTimeOf(order, CANCELLED, createdAtOf(order));
/** "bugün bitiyor" / "yarın bitiyor" / "3 gün kaldı" (İstanbul takvim günü) */
const expiryText = (expiresAt, now) => {
  const days = istanbulDay(expiresAt) - istanbulDay(now);
  if (days <= 0) return "bugün bitiyor";
  if (days === 1) return "yarın bitiyor";
  return `${days} gün kaldı`;
};

// ── Kuponlar ──
export const COUPON_SOURCE_LABELS = {
  compensation: "Telafi",
  mission: "Görev ödülü",
  referral: "Davet",
  automation: "Otomatik bildirim",
  campaign: "Kupon talebi",
  manual: "Özel kupon",
};
// Sistemin ürettiği kişiye özel kodlar (coupon.service, feedbackFollowUp, mission, referral, notificationAutomation, couponRequest)
const COUPON_SOURCE_PATTERNS = [
  [/^TELAFI[0-9A-F]{6}$/, "compensation"],
  [/^GOREV[0-9A-F]{10}$/, "mission"],
  [/^(HOSGELDIN|TESEKKUR)[0-9A-F]{6}$/, "referral"],
  [/^(IKINCI|DONUS|OTO)[0-9A-F]{7}$/, "automation"],
  [/^TOP[0-9A-F]{12}$/, "campaign"],
];
/** Kişiye özel kuponun kaynağı: compensation | mission | referral | automation | campaign | manual */
export const couponSourceOf = (coupon = {}) => {
  const code = String(coupon?.code || "").toUpperCase();
  const match = COUPON_SOURCE_PATTERNS.find(([pattern]) => pattern.test(code));
  if (match) return match[1];
  if (coupon?.isReferralCoupon) return "referral";
  if (/\(otomatik bildirim\)$/.test(String(coupon?.description || "").trim())) return "automation";
  return "manual";
};
export const couponValueText = (coupon = {}) => (coupon.discountType === "fixed"
  ? tl(coupon.discountAmount)
  : `%${decimal(coupon.discountPercentage)}${Number(coupon.maximumDiscount) > 0 ? ` (en çok ${tl(coupon.maximumDiscount)})` : ""}`);
/** Kişiye özel kuponun bu müşteri için durumu: used | inactive | expired | available */
export const couponStateOf = (coupon = {}, userId = "", now = Date.now()) => {
  const usage = (coupon.usedBy || []).find((entry) => idOf(entry?.user) === String(userId)) || null;
  const expiresAt = timeOf(coupon.expirationDate);
  if (usage) return { state: "used", expiresAt, usedAt: timeOf(usage.usedAt), orderId: idOf(usage.orderId) || null };
  if (coupon.isActive === false) return { state: "inactive", expiresAt };
  if (expiresAt !== null && now > expiresAt) return { state: "expired", expiresAt };
  return { state: "available", expiresAt };
};
const couponStateText = (status, now) => {
  if (status.state === "used") return `Kullanıldı${status.orderId ? ` (${orderCode(status.orderId)})` : ""}`;
  if (status.state === "inactive") return "Kapalı";
  if (status.state === "expired") return `Süresi doldu${status.expiresAt !== null ? ` (${dayText(status.expiresAt)})` : ""}`;
  return `Kullanılmadı${status.expiresAt !== null ? `, ${expiryText(status.expiresAt, now)} (bitiş ${dateTimeText(status.expiresAt)})` : ""}`;
};

// ── Geri bildirim ──
const feedbackScore = (feedback = {}) => {
  const rating = Number(feedback.rating) || 0;
  if (rating > 0) return rating;
  const values = Object.values(feedback.ratings || {}).map(Number).filter((value) => value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
};
const hasNpsScore = (feedback) => feedback?.npsScore !== null && feedback?.npsScore !== undefined && Number.isFinite(Number(feedback.npsScore));
/** Düşük puan / şikâyet: 1–3 yıldız, 👎, sorunlu ürün, tavsiye 0–6 ya da "Şikayet" kategorili genel geri bildirim */
export const isLowFeedback = (feedback = {}) => {
  if (!feedback || feedback.kind === "abandon") return false;
  if (feedback.thumb === "down") return true;
  if (Array.isArray(feedback.problemItems) && feedback.problemItems.length > 0) return true;
  const score = feedbackScore(feedback);
  if (score > 0 && score <= LOW_RATING) return true;
  if (feedback.kind === "nps") return hasNpsScore(feedback) && Number(feedback.npsScore) <= 6;
  return (!feedback.kind || feedback.kind === "general") && feedback.category === "Şikayet";
};
/** Yönetici yanıt yazdı, telafi kuponu verdi ya da kaydı çözüldü / kapatıldı olarak işaretledi */
export const isFeedbackAnswered = (feedback = {}) =>
  Boolean(String(feedback?.adminReply?.text || "").trim()) || Boolean(feedback?.compensation?.code) || ANSWERED_FEEDBACK_STATUSES.includes(feedback?.status);
const feedbackComment = (feedback) => {
  const message = String(feedback.message || "").trim();
  if (!message || DEFAULT_FEEDBACK_TEXTS.has(message) || /^Tavsiye puanı: \d+\/10$/.test(message)) return "";
  if (feedback.kind === "abandon" && message === ABANDON_REASONS[feedback.reason]) return "";
  return message;
};
const problemItemsText = (feedback) => {
  const items = Array.isArray(feedback.problemItems) ? feedback.problemItems : [];
  if (!items.length) return "";
  const named = items.slice(0, 3).map((item) => `${item?.name || "Ürün"} (${String(ISSUE_TYPES[item?.issue] || "sorunlu").toLocaleLowerCase("tr-TR")})`);
  return `Sorunlu ürün: ${named.join(", ")}${items.length > 3 ? ` +${items.length - 3}` : ""}`;
};
const feedbackScoreText = (feedback) => {
  if (feedback.thumb === "down") return "Memnun kalmadı";
  if (feedback.thumb === "up") return "Memnun kaldı";
  if (feedback.kind === "nps" && hasNpsScore(feedback)) return `Tavsiye ${Number(feedback.npsScore)}/10`;
  const score = feedbackScore(feedback);
  if (score > 0) return `${decimal(score)}/5`;
  return Array.isArray(feedback.problemItems) && feedback.problemItems.length ? "Sorunlu ürün" : "";
};
const feedbackTitle = (feedback) => {
  const score = feedbackScore(feedback);
  switch (feedback.kind) {
    case "quick":
      return feedback.thumb === "down" ? "Siparişten memnun kalmadı" : "Siparişten memnun kaldı";
    case "nps":
      return hasNpsScore(feedback) ? `Tavsiye puanı · ${Number(feedback.npsScore)}/10` : "Tavsiye puanı";
    case "abandon":
      return `Sepetten vazgeçti · ${ABANDON_REASONS[feedback.reason] || "neden belirtilmedi"}`;
    case "order":
      return `${feedback.milestone ? `${feedback.milestone}. sipariş anketi` : "Sipariş anketi"}${score ? ` · ${decimal(score)}/5` : ""}`;
    default:
      return `${FEEDBACK_CATEGORY_LABELS[feedback.category] || "Geri bildirim"}${score ? ` · ${decimal(score)}/5` : ""}`;
  }
};
const feedbackAnswerText = (feedback, low) => {
  const parts = [];
  if (String(feedback.adminReply?.text || "").trim()) parts.push("Yanıtlandı");
  if (feedback.compensation?.code) parts.push(`Telafi ${tl(feedback.compensation.amount)}`);
  if (!parts.length && ANSWERED_FEEDBACK_STATUSES.includes(feedback.status)) parts.push(feedback.status);
  if (!parts.length && low) parts.push("Yanıt bekliyor");
  return parts.join(", ");
};

// ── Olay üreticileri ──
const orderEvents = (order, { userId, names }) => {
  const id = idOf(order._id);
  const placedAt = createdAtOf(order);
  if (!id || placedAt === null) return [];
  const code = orderCode(id);
  const ref = { kind: "order", id };
  const zone = zoneOf(order);
  const items = itemCountOf(order);
  const couponCode = order.couponCode ? String(order.couponCode).toUpperCase() : "";
  const events = [{
    type: "order_placed",
    at: placedAt,
    title: `Sipariş verdi · ${code}`,
    detail: joinParts([tl(order.totalAmount), zone, PAYMENT_METHODS[order.paymentMethod], items ? `${items} ürün` : "", couponCode ? `Kupon ${couponCode}` : ""]),
    tone: "info",
    ref,
  }];
  if (order.needsCallback === true && order.callbackConfirmedAt) {
    events.push({
      type: "callback_confirmed",
      at: timeOf(order.callbackConfirmedAt) ?? placedAt,
      title: `Telefonla teyit edildi · ${code}`,
      detail: joinParts(["İlk sipariş teyidi", names.get(idOf(order.callbackConfirmedBy))]),
      tone: "ok",
      ref,
    });
  }
  if (order.status === DELIVERED) {
    events.push({
      type: "order_delivered",
      at: statusTimeOf(order, DELIVERED, placedAt),
      title: `Teslim edildi · ${code}`,
      detail: joinParts([tl(order.totalAmount), zone]),
      tone: "ok",
      ref,
    });
  }
  if (order.status === CANCELLED) {
    const entry = lastHistoryEntry(order, CANCELLED);
    if (order.deliveryOutcome?.code) {
      const note = textSnippet(order.deliveryOutcome.note, 80);
      events.push({
        type: "delivery_failed",
        at: failureTimeOf(order),
        title: `Teslim edilemedi · ${code}`,
        detail: joinParts([note ? `${outcomeLabel(order.deliveryOutcome)}: ${note}` : outcomeLabel(order.deliveryOutcome), names.get(idOf(order.deliveryOutcome.by)), tl(order.totalAmount)]),
        tone: "danger",
        ref,
      });
    } else {
      const by = idOf(entry?.changedBy);
      const byCustomer = by ? by === userId : Boolean(order.cancelReason?.code);
      const byStaff = Boolean(by) && !byCustomer;
      // cancelReason müşterinin seçtiği nedendir; panelden yapılan (son) iptalde gösterilmez (önceki, geri alınmış
      // bir müşteri iptalinden kalmış olabilir)
      const reason = byStaff ? "" : CANCEL_REASONS[order.cancelReason?.code] || "";
      const note = reason ? textSnippet(order.cancelReason?.note, 80) : "";
      events.push({
        type: "order_cancelled",
        at: statusTimeOf(order, CANCELLED, placedAt),
        title: `${byCustomer ? "Müşteri iptal etti" : byStaff ? "Panelden iptal edildi" : "İptal edildi"} · ${code}`,
        detail: joinParts([
          reason ? `Neden: ${reason}${note ? ` (${note})` : ""}` : "",
          byStaff ? names.get(by) : "",
          tl(order.totalAmount),
        ]),
        tone: "danger",
        ref,
        by: byCustomer ? "customer" : byStaff ? "staff" : null,
      });
    }
  }
  // Kupon kullanımı: iptal edilen siparişte kupon iade edildiği için sayılmaz
  if (couponCode && order.status !== CANCELLED) {
    events.push({
      type: "coupon_used",
      at: placedAt,
      title: `Kupon kullandı · ${couponCode}`,
      detail: joinParts([Number(order.couponDiscount) > 0 ? `−${tl(order.couponDiscount)}` : "", code]),
      tone: "ok",
      ref,
    });
  }
  return events;
};

const chatEvents = (chat, { closedAt = null } = {}) => {
  const id = idOf(chat._id);
  const startedAt = createdAtOf(chat);
  if (!id || startedAt === null) return [];
  const ref = { kind: "chat", id };
  const linkedOrder = idOf(chat.order);
  const events = [{
    type: "chat_started",
    at: startedAt,
    title: chat.type === "order" || linkedOrder ? "Sipariş için sohbet başlattı" : "Sohbet başlattı",
    detail: linkedOrder ? orderCode(linkedOrder) : "",
    tone: "neutral",
    ref,
    snippetChat: id,
  }];
  if (chat.status === "closed") {
    events.push({
      type: "chat_closed",
      // Destek talebinin kapanış zamanı kesindir; yoksa sohbetin son değişikliği
      at: closedAt ?? timeOf(chat.updatedAt) ?? startedAt,
      title: "Sohbet kapandı",
      detail: "",
      tone: "neutral",
      ref,
      snippetChat: id,
    });
  }
  return events;
};

const SUPPORT_STATUS_TEXT = { waiting: "Temsilci bekliyor", accepted: "Görüşülüyor", in_progress: "Görüşülüyor", closed: "Kapandı" };
const supportEvent = (request, { names }) => {
  const at = createdAtOf(request);
  const chatId = idOf(request.conversation);
  if (at === null || !idOf(request._id)) return null;
  const agent = names.get(idOf(request.assignedTo)) || request.assignedTo?.name || "";
  const open = OPEN_SUPPORT_STATUSES.includes(request.status);
  const statusText = open && request.status !== "waiting" && agent ? `${agent} ilgileniyor` : SUPPORT_STATUS_TEXT[request.status] || "";
  return {
    type: "chat_handoff",
    at,
    title: "Canlı desteğe aktarıldı",
    detail: joinParts([
      ["high", "urgent"].includes(request.priority) ? (request.priority === "urgent" ? "Acil" : "Yüksek öncelik") : "",
      textSnippet(request.reason, 100),
      statusText,
    ]),
    tone: request.status === "waiting" ? "warn" : open ? "info" : "neutral",
    ref: chatId ? { kind: "chat", id: chatId } : null,
    sourceId: idOf(request._id),
  };
};

const feedbackEvent = (feedback) => {
  const id = idOf(feedback._id);
  const at = createdAtOf(feedback);
  if (!id || at === null) return null;
  const low = isLowFeedback(feedback);
  const score = feedbackScore(feedback);
  const positive = feedback.thumb === "up" || (feedback.kind === "nps" ? Number(feedback.npsScore) >= 9 : score >= 4);
  return {
    type: "feedback",
    at,
    title: feedbackTitle(feedback),
    detail: joinParts([quoted(feedbackComment(feedback)), problemItemsText(feedback), feedbackAnswerText(feedback, low)]),
    tone: low ? "danger" : positive ? "ok" : "neutral",
    ref: { kind: "feedback", id },
    low,
  };
};

const couponEvent = (coupon, { userId, now }) => {
  const id = idOf(coupon._id);
  const at = createdAtOf(coupon);
  if (!id || at === null) return null;
  const source = couponSourceOf(coupon);
  const status = couponStateOf(coupon, userId, now);
  const minimum = Number(coupon.minimumOrderAmount) || 0;
  return {
    type: "coupon_granted",
    at,
    title: `Kupon tanımlandı · ${String(coupon.code || "").toUpperCase()}`,
    detail: joinParts([COUPON_SOURCE_LABELS[source], couponValueText(coupon), minimum > 0 ? `${tl(minimum)} üzeri` : "", couponStateText(status, now)]),
    tone: status.state === "used" ? "ok" : status.state === "available" ? "brand" : "neutral",
    ref: { kind: "coupon", id },
    source,
    couponState: status.state,
  };
};

/**
 * Saf hesaplama: kaynak kayıtlar → olaylar (sırasız; zaman ms). names: kimlik → ad (iptal eden, teyit eden, görevli).
 * Siparişlerden: verdi, teyit edildi, teslim edildi, iptal edildi (kim + neden), teslim edilemedi (neden), kupon kullandı.
 */
export const buildTimelineEvents = (
  { orders = [], chats = [], supportRequests = [], feedbacks = [], coupons = [] } = {},
  { userId = "", names = new Map(), now = Date.now() } = {},
) => {
  const events = [];
  for (const order of orders) events.push(...orderEvents(order, { userId: String(userId), names }));
  const closedAtByChat = new Map();
  for (const request of supportRequests) {
    const chatId = idOf(request.conversation);
    const closedAt = timeOf(request.closedAt);
    if (chatId && closedAt !== null) closedAtByChat.set(chatId, Math.max(closedAtByChat.get(chatId) ?? closedAt, closedAt));
    if (request.closureOnly) continue; // yalnızca sohbetin kapanış zamanı için okundu
    const event = supportEvent(request, { names });
    if (event) events.push(event);
  }
  for (const chat of chats) events.push(...chatEvents(chat, { closedAt: closedAtByChat.get(idOf(chat._id)) ?? null }));
  for (const feedback of feedbacks) {
    const event = feedbackEvent(feedback);
    if (event) events.push(event);
  }
  for (const coupon of coupons) {
    const event = couponEvent(coupon, { userId: String(userId), now });
    if (event) events.push(event);
  }
  return events
    .filter((event) => Number.isFinite(event.at))
    .map((event) => ({ ...event, id: `${event.type}:${event.sourceId || event.ref?.id || event.at}`, group: TIMELINE_GROUPS[event.type] }));
};

const compareEvents = (a, b) =>
  (b.at - a.at) || ((SAME_TIME_RANK[b.type] || 0) - (SAME_TIME_RANK[a.type] || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Yeniden eskiye bir sayfa. before: bu zamandan (ms) önceki olaylar; horizon: sınırına takılan bir kaynağın okunan en
 * eski kaydı (ms) — bu zaman ve öncesi eksik olabileceğinden sonraki sayfaya kalır. Sayfa sınırında aynı zamanlı
 * olaylar bölünmez. Dönüş: { events, hasMore, nextBefore (ms | null) }
 */
export const paginateTimeline = (events, { limit = TIMELINE_PAGE_SIZE, before = null, horizon = null } = {}) => {
  const sorted = events
    .filter((event) => (before === null || event.at < before) && (horizon === null || event.at > horizon))
    .sort(compareEvents);
  let page = sorted;
  let cutAt = null;
  if (sorted.length > limit) {
    const boundary = sorted[limit - 1].at;
    let end = limit;
    while (end < sorted.length && sorted[end].at === boundary) end += 1;
    if (end < sorted.length) {
      page = sorted.slice(0, end);
      cutAt = boundary;
    }
  }
  let nextBefore = cutAt !== null ? cutAt : horizon !== null ? horizon + 1 : null;
  // Güvenlik: sonraki sayfa ilerlemiyorsa (aynı milisaniyede çok sayıda kayıt) sonsuz "daha fazla" döngüsü olmasın
  if (nextBefore !== null && before !== null && nextBefore >= before) nextBefore = null;
  return { events: page, hasMore: nextBefore !== null, nextBefore };
};

/** Yanıt biçimi: zaman ISO, iç alanlar atılır */
const publicEvent = ({ at, snippetChat, sourceId, ...event }) => ({ ...event, at: isoOf(at) });

const messageSnippet = (message) => {
  if (!message) return "";
  if (message.type === "image") return "[Fotoğraf]";
  if (message.type === "file") return `[Dosya${message.fileName ? `: ${message.fileName}` : ""}]`;
  return message.content || "";
};
/** Sayfadaki sohbet olaylarına müşterinin ilk mesajından kısa bir alıntı ekler (sohbet başına tek, dizinli sorgu) */
const attachChatSnippets = async (events) => {
  const chatIds = [...new Set(events.map((event) => event.snippetChat).filter(Boolean))];
  if (!chatIds.length) return events;
  const snippets = new Map(await Promise.all(chatIds.map(async (chatId) => {
    try {
      const message = await Message.findOne({ chat: chatId, sender: "user" }).sort({ createdAt: 1 }).select("content type fileName").lean();
      return [chatId, messageSnippet(message)];
    } catch (error) {
      console.error("Sohbet alıntısı okunamadı:", error.message);
      return [chatId, ""];
    }
  })));
  return events.map((event) => (event.snippetChat
    ? { ...event, detail: joinParts([quoted(snippets.get(event.snippetChat), 100), event.detail]) }
    : event));
};

/** Teslim edilemeyen siparişler: toplam, son 30 gün, en son olanın nedeni (siparişler müşterinin tamamı olmalı) */
export const deliveryFailureSummary = (orders = [], now = Date.now()) => {
  const failures = (orders || [])
    .filter((order) => order?.status === CANCELLED && order.deliveryOutcome?.code)
    .map((order) => ({ order, at: failureTimeOf(order) }))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const last = failures[0] || null;
  return {
    total: failures.length,
    last30Days: failures.filter((failure) => failure.at !== null && now - failure.at <= DELIVERY_FAILURE_WINDOW_DAYS * DAY_MS).length,
    lastAt: last ? isoOf(last.at) : null,
    lastLabel: last ? outcomeLabel(last.order.deliveryOutcome) : null,
    lastOrderId: last ? idOf(last.order._id) : null,
  };
};

const ISSUE_TONE_RANK = { danger: 3, warn: 2, info: 1 };
/**
 * Çekmecenin üstündeki "Açık konular": aktif sipariş, teyit bekleyen ilk sipariş, açık destek talebi, yanıtsız düşük
 * puan, 3 gün içinde biten kullanılmamış kişisel kupon, son 30 günde tekrarlayan "teslim edilemedi".
 * Dönüş: [{ id, type, tone, title, detail, at (ISO | null), ref | null }] (önce kırmızı, sonra sarı, sonra mavi)
 */
export const buildOpenIssues = (
  { orders = [], supportRequests = [], feedbacks = [], coupons = [] } = {},
  { userId = "", names = new Map(), now = Date.now() } = {},
) => {
  const issues = [];
  for (const order of orders) {
    if (!ACTIVE_ORDER_STATUSES.includes(order.status)) continue;
    const id = idOf(order._id);
    const ref = { kind: "order", id };
    const at = createdAtOf(order);
    if (order.needsCallback === true && !order.callbackConfirmedAt) {
      issues.push({ type: "pending_callback", tone: "warn", title: `İlk sipariş teyidi bekliyor · ${orderCode(id)}`, detail: "Müşteriyi arayıp siparişi teyit edin", at, ref });
    }
    issues.push({ type: "active_order", tone: "info", title: `Aktif sipariş · ${orderCode(id)}`, detail: joinParts([order.status, tl(order.totalAmount), zoneOf(order)]), at, ref });
  }
  for (const request of supportRequests) {
    if (request.closureOnly || !OPEN_SUPPORT_STATUSES.includes(request.status)) continue;
    const chatId = idOf(request.conversation);
    const waiting = request.status === "waiting";
    const agent = names.get(idOf(request.assignedTo)) || request.assignedTo?.name || "";
    issues.push({
      type: "open_support",
      tone: waiting ? "danger" : "warn",
      title: waiting ? "Destek talebi temsilci bekliyor" : "Destek görüşmesi açık",
      detail: joinParts([textSnippet(request.reason, 90), !waiting && agent ? `${agent} ilgileniyor` : ""]),
      at: createdAtOf(request),
      ref: chatId ? { kind: "chat", id: chatId } : null,
    });
  }
  for (const feedback of feedbacks) {
    if (!isLowFeedback(feedback) || isFeedbackAnswered(feedback)) continue;
    issues.push({
      type: "unanswered_feedback",
      tone: "danger",
      title: "Yanıtsız düşük puan",
      detail: joinParts([feedbackScoreText(feedback), quoted(feedbackComment(feedback), 90)]),
      at: createdAtOf(feedback),
      ref: { kind: "feedback", id: idOf(feedback._id) },
    });
  }
  for (const coupon of coupons) {
    const status = couponStateOf(coupon, userId, now);
    if (status.state !== "available" || status.expiresAt === null || status.expiresAt - now > EXPIRING_COUPON_DAYS * DAY_MS) continue;
    issues.push({
      type: "expiring_coupon",
      tone: "warn",
      title: `Kullanılmamış kupon bitiyor · ${String(coupon.code || "").toUpperCase()}`,
      detail: joinParts([COUPON_SOURCE_LABELS[couponSourceOf(coupon)], couponValueText(coupon), `${expiryText(status.expiresAt, now)} (bitiş ${dateTimeText(status.expiresAt)})`]),
      at: status.expiresAt,
      ref: { kind: "coupon", id: idOf(coupon._id) },
    });
  }
  const failures = deliveryFailureSummary(orders, now);
  if (failures.last30Days >= 2) {
    issues.push({
      type: "delivery_failures",
      tone: "danger",
      title: `Son ${DELIVERY_FAILURE_WINDOW_DAYS} günde ${failures.last30Days} kez teslim edilemedi`,
      detail: joinParts([failures.lastLabel ? `Son neden: ${failures.lastLabel}` : "", failures.lastAt ? dayText(timeOf(failures.lastAt)) : ""]),
      at: timeOf(failures.lastAt),
      ref: failures.lastOrderId ? { kind: "order", id: failures.lastOrderId } : null,
    });
  }
  return issues
    .sort((a, b) => ((ISSUE_TONE_RANK[b.tone] || 0) - (ISSUE_TONE_RANK[a.tone] || 0)) || ((b.at ?? 0) - (a.at ?? 0)))
    .slice(0, OPEN_ISSUE_LIMIT)
    .map((issue, index) => ({ ...issue, id: `${issue.type}:${issue.ref?.id || index}`, at: isoOf(issue.at) }));
};

// ── İç not ──
/** Yanıt biçimi: { text, updatedAt, updatedBy: { _id, name } | null } ya da (not yoksa) null */
export const staffNoteView = (note, names = new Map()) => {
  const text = typeof note?.text === "string" ? note.text.trim() : "";
  if (!text) return null;
  const by = idOf(note.updatedBy);
  return {
    text,
    updatedAt: isoOf(timeOf(note.updatedAt)),
    updatedBy: by ? { _id: by, name: names.get(by) || note.updatedBy?.name || "" } : null,
  };
};

/** İptal eden / teyit eden / teslim edilemedi diyen yönetici ve destek görevlisi kimlikleri (ad için) */
const actorIdsOf = ({ orders = [], supportRequests = [] } = {}, userId) => {
  const ids = new Set();
  for (const order of orders) {
    if (order.status === CANCELLED) {
      const by = idOf(lastHistoryEntry(order, CANCELLED)?.changedBy);
      if (by && by !== userId) ids.add(by);
      const failedBy = idOf(order.deliveryOutcome?.by);
      if (failedBy) ids.add(failedBy);
    }
    if (order.needsCallback === true && order.callbackConfirmedAt) {
      const by = idOf(order.callbackConfirmedBy);
      if (by) ids.add(by);
    }
  }
  for (const request of supportRequests) {
    const by = idOf(request.assignedTo);
    if (by && !request.assignedTo?.name) ids.add(by);
  }
  return [...ids];
};
const loadNames = async (ids) => {
  const unique = [...new Set(ids.filter((id) => HEX24.test(String(id || ""))))].slice(0, 100);
  if (!unique.length) return new Map();
  const rows = await User.find({ _id: { $in: unique } }).select("name").lean();
  return new Map((rows || []).map((row) => [String(row._id), row.name || ""]));
};

const PROFILE_ORDER_FIELDS = "status totalAmount productTotal deliveryFee deliveryZone createdAt products couponCode couponDiscount device deliveryPointName";
const TIMELINE_ORDER_EXTRA = "updatedAt paymentMethod deliveryPoint deliveryAddress.zoneName deliveryAddress.neighborhood cancelReason deliveryOutcome needsCallback callbackConfirmedAt callbackConfirmedBy statusHistory";
const TIMELINE_ORDER_FIELDS = `status totalAmount deliveryZone createdAt products.quantity couponCode couponDiscount deliveryPointName ${TIMELINE_ORDER_EXTRA}`;
const CHAT_FIELDS = "type order status createdAt updatedAt";
const SUPPORT_FIELDS = "conversation status reason priority assignedTo acceptedAt closedAt createdAt";
const FEEDBACK_FIELDS = "kind rating ratings thumb npsScore message category status problemItems milestone reason adminReply.text compensation.code compensation.amount createdAt";
// Sohbet kapanırken önce sohbet, birkaç milisaniye sonra destek talebi yazılır; kapanış zamanı için pay
const LATE_CHAT_SLACK_MS = 60 * 1000;
const couponProjection = (userObjectId) => ({
  code: 1, description: 1, discountType: 1, discountPercentage: 1, discountAmount: 1, maximumDiscount: 1, minimumOrderAmount: 1,
  expirationDate: 1, isActive: 1, isReferralCoupon: 1, createdAt: 1,
  // Yalnızca bu müşterinin kullanım kaydı
  usedBy: { $elemMatch: { user: userObjectId } },
});

/**
 * Zaman çizelgesi kaynakları (her biri yeniden eskiye, sınırlı). includeOrders false ise sipariş okunmaz (profil
 * müşterinin tüm siparişlerini zaten okur). horizon: sınırına takılan kaynakların okunan en eski kaydının en yenisi
 * (ms) ya da null; bu zaman ve öncesi bu sayfada eksik olabilir.
 */
const fetchTimelineSources = async (userId, { before = null, includeOrders = true } = {}) => {
  const created = before === null ? {} : { createdAt: { $lt: new Date(before) } };
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const latest = (query, limit = TIMELINE_SOURCE_LIMIT) => query.sort({ createdAt: -1 }).limit(limit).lean();
  const [orderRows, chats, supportRequests, feedbacks, coupons] = await Promise.all([
    includeOrders ? latest(Order.find({ user: userObjectId, ...created }).select(TIMELINE_ORDER_FIELDS), TIMELINE_ORDER_LIMIT) : Promise.resolve([]),
    latest(Chat.find({ user: userObjectId, isDeleted: { $ne: true }, ...created }).select(CHAT_FIELDS)),
    latest(SupportRequest.find({ user: userObjectId, ...created }).select(SUPPORT_FIELDS)),
    latest(Feedback.find({ user: userObjectId, ...created }).select(FEEDBACK_FIELDS)),
    latest(Coupon.find({ userId: userObjectId, ...created }).select(couponProjection(userObjectId))),
  ]);
  const sources = {
    orders: orderRows || [],
    chats: chats || [],
    supportRequests: supportRequests || [],
    feedbacks: feedbacks || [],
    coupons: coupons || [],
  };
  const oldestOf = (rows, limit = TIMELINE_SOURCE_LIMIT) => (rows.length >= limit ? createdAtOf(rows[rows.length - 1]) : null);
  const oldestOrder = oldestOf(sources.orders, TIMELINE_ORDER_LIMIT);
  const oldestChat = oldestOf(sources.chats);
  let horizon = null;
  for (const oldest of [oldestOrder, oldestChat, oldestOf(sources.supportRequests), oldestOf(sources.feedbacks), oldestOf(sources.coupons)]) {
    if (oldest !== null) horizon = horizon === null ? oldest : Math.max(horizon, oldest);
  }

  // Sınırına takılan kaynakta, okunanlardan eski bir kaydın sonraki olayı (teslim, iptal, teyit, teslim edilemedi,
  // sohbet kapanışı) yine de bu sayfanın aralığına düşebilir: yalnızca o kayıtlar ayrıca okunur. Eski siparişin
  // "verdi" olayı ufkun gerisinde kalır; yalnızca sonraki olayı bu sayfaya girer.
  const [lateOrders, lateChats] = await Promise.all([
    oldestOrder === null ? [] : Order.find({
      user: userObjectId,
      createdAt: { $lte: new Date(oldestOrder) },
      $or: [
        { "statusHistory.changedAt": { $gt: new Date(oldestOrder) } },
        { callbackConfirmedAt: { $gt: new Date(oldestOrder) } },
        { "deliveryOutcome.at": { $gt: new Date(oldestOrder) } },
        // Durum geçmişi olmayan eski sipariş: tamamlanma zamanı en fazla sipariş günü içindedir
        { createdAt: { $gt: new Date(oldestOrder - LEGACY_STATUS_WINDOW_MS) } },
      ],
    }).select(TIMELINE_ORDER_FIELDS).sort({ createdAt: -1 }).limit(TIMELINE_ORDER_LIMIT).lean(),
    oldestChat === null ? [] : Chat.find({
      user: userObjectId,
      isDeleted: { $ne: true },
      status: "closed",
      createdAt: { $lte: new Date(oldestChat) },
      updatedAt: { $gt: new Date(oldestChat - LATE_CHAT_SLACK_MS) },
    }).select(CHAT_FIELDS).sort({ updatedAt: -1 }).limit(TIMELINE_SOURCE_LIMIT).lean(),
  ]);
  const known = (rows) => new Set(rows.map((row) => idOf(row._id)));
  const orderIds = known(sources.orders);
  sources.orders = [...sources.orders, ...(lateOrders || []).filter((row) => !orderIds.has(idOf(row._id)))];
  const chatIds = known(sources.chats);
  const addedChats = (lateChats || []).filter((row) => !chatIds.has(idOf(row._id)));
  if (addedChats.length) {
    sources.chats = [...sources.chats, ...addedChats];
    // Bu sohbetlerin kapanış zamanı destek talebinden (kesin) alınır; talepler olay üretmez
    const requestIds = known(sources.supportRequests);
    const closures = await SupportRequest.find({ conversation: { $in: addedChats.map((row) => row._id) } }).select(SUPPORT_FIELDS).limit(TIMELINE_SOURCE_LIMIT).lean();
    sources.supportRequests = [
      ...sources.supportRequests,
      ...(closures || []).filter((row) => !requestIds.has(idOf(row._id))).map((row) => ({ ...row, closureOnly: true })),
    ];
  }
  return { sources, horizon };
};

/** Kaynaklar → bir sayfa olay (adlar ve sohbet alıntılarıyla), yanıt biçiminde */
const timelinePage = async (sources, { userId, horizon, before = null, names, now }) => {
  const page = paginateTimeline(buildTimelineEvents(sources, { userId, names, now }), { before, horizon });
  const events = await attachChatSnippets(page.events);
  return { timeline: events.map(publicEvent), timelineHasMore: page.hasMore, timelineNextBefore: isoOf(page.nextBefore) };
};

/** ?before= değeri: geçerli bir ISO zaman (2015 sonrası, en fazla 1 gün ileri) → ms; değilse null */
export const parseTimelineBefore = (value, now = Date.now()) => {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== "string" || !text.trim() || text.length > 40) return null;
  const time = timeOf(text.trim());
  if (time === null || time < TIMELINE_MIN_TIME || time > now + DAY_MS) return null;
  return time;
};

/**
 * GET /users/:id/profile (yönetici)
 * Yanıt: { success, profile, serverTime }. profile: sipariş özeti, son siparişler, ürünler, kuponlar, davet, etkinlik,
 * cihaz, bildirimler + timeline (en fazla ~60 olay, yeniden eskiye), timelineHasMore, timelineNextBefore (ISO),
 * openIssues, deliveryFailures, staffNote, staffFlags (yalnızca panel).
 * ?before=<ISO>: yalnızca zaman çizelgesinin bir sonraki sayfası → { success, timeline, timelineHasMore, timelineNextBefore, serverTime }
 */
export const getCustomerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Geçersiz müşteri kimliği" });
    }
    const now = Date.now();
    const rawBefore = Array.isArray(req.query?.before) ? req.query.before[0] : req.query?.before;
    const hasBefore = rawBefore !== undefined && rawBefore !== "";
    const before = hasBefore ? parseTimelineBefore(rawBefore, now) : null;
    if (hasBefore && before === null) {
      return res.status(400).json({ success: false, message: "Geçersiz tarih" });
    }

    if (before !== null) {
      // "Daha fazla": yalnızca zaman çizelgesi
      const found = await User.exists({ _id: id });
      if (!found) {
        return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      }
      const userId = String(found._id);
      const { sources, horizon } = await fetchTimelineSources(userId, { before });
      const names = await loadNames(actorIdsOf(sources, userId));
      const page = await timelinePage(sources, { userId, horizon, before, names, now });
      return res.json({ success: true, ...page, serverTime: new Date(now).toISOString() });
    }

    const user = await User.findById(id).select("-password +staffNote +staffFlags").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    const userId = String(user._id);
    const [orders, invitedByDoc, own, timelineSources] = await Promise.all([
      Order.find({ user: id })
        .select(`${PROFILE_ORDER_FIELDS} ${TIMELINE_ORDER_EXTRA}`)
        .populate({ path: "products.product", select: "name image" })
        .sort({ createdAt: -1 })
        .lean(),
      Referral.findOne({ "referredUsers.user": id }).populate("referrer", "name").lean(),
      Referral.findOne({ referrer: id }).populate("referredUsers.user", "name").lean(),
      // Siparişler profil için zaten tamamen okunuyor; zaman çizelgesi diğer kaynakları ayrıca okur
      fetchTimelineSources(userId, { includeOrders: false }),
    ]);
    const invitedBy = invitedByDoc
      ? { ...invitedByDoc, entry: (invitedByDoc.referredUsers || []).find((entry) => String(entry.user?._id || entry.user) === String(id)) || null }
      : null;
    const sources = { ...timelineSources.sources, orders: orders || [] };
    const names = await loadNames([...actorIdsOf(sources, userId), idOf(user.staffNote?.updatedBy)]);
    const page = await timelinePage(sources, { userId, horizon: timelineSources.horizon, names, now });
    res.json({
      success: true,
      profile: {
        ...buildCustomerProfile(user, orders || [], { invitedBy, own }),
        ...page,
        openIssues: buildOpenIssues(sources, { userId, names, now }),
        deliveryFailures: deliveryFailureSummary(sources.orders, now),
        staffNote: staffNoteView(user.staffNote, names),
        staffFlags: normalizeStaffFlags(user.staffFlags),
      },
      serverTime: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("Müşteri profili getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Müşteri profili getirilirken hata oluştu" });
  }
};

// ── PATCH /users/:userId/staff-note (yönetici) ──
// Personelin iç notu ve işaretleri. Yalnızca panel görür (user.model'de select: false). İşlem kaydına notun metni
// yazılmaz; yalnızca "eklendi / güncellendi / silindi" ve işaret değişikliği yazılır.
export const STAFF_FLAGS_INPUT_MAX = 20;
const NOTE_CONFLICT_MESSAGE = "İç not bu arada başka bir yönetici tarafından değiştirildi. Güncel hali yüklendi; kontrol edip yeniden kaydedin.";
/** Satır sonları sadeleşir, kontrol karakterleri atılır, 2'den fazla boş satır kısalır */
export const cleanStaffNoteText = (value) => {
  const text = [...String(value ?? "").replace(/\r\n?/g, "\n")]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 10 || code === 9 || (code >= 32 && code !== 127);
    })
    .join("");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};
/** İşaretler: geçerli, tekrarsız, sabit sırada (lib/staffFlags.js) */
const canonicalFlags = (flags) => {
  const set = new Set(normalizeStaffFlags(flags));
  return STAFF_FLAG_KEYS.filter((key) => set.has(key));
};
const flagLabels = (flags) => STAFF_FLAGS.filter((flag) => flags.includes(flag.key)).map((flag) => flag.label).join(", ") || "Yok";

/** İstek gövdesi → { value: { text?, flags?, baseUpdatedAt? } } ya da { error } */
export const parseStaffNoteBody = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Geçersiz istek" };
  const value = {};
  if (body.text !== undefined) {
    if (body.text !== null && typeof body.text !== "string") return { error: "İç not metin olmalı" };
    const text = cleanStaffNoteText(body.text ?? "");
    if (text.length > STAFF_NOTE_MAX) return { error: `İç not en fazla ${STAFF_NOTE_MAX} karakter olabilir` };
    value.text = text;
  }
  if (body.flags !== undefined) {
    if (!Array.isArray(body.flags)) return { error: "İşaretler liste olmalı" };
    if (body.flags.length > STAFF_FLAGS_INPUT_MAX) return { error: "Çok fazla işaret gönderildi" };
    if (body.flags.some((flag) => typeof flag !== "string" || flag.length > 40)) return { error: "Geçersiz işaret" };
    value.flags = canonicalFlags(body.flags);
  }
  if (value.text === undefined && value.flags === undefined) return { error: "Kaydedilecek bir değişiklik yok" };
  // Notun düzenlemeye başlandığı andaki sürümü (null: not yoktu). Verilirse eşzamanlı değişiklik 409 ile reddedilir.
  if (body.baseUpdatedAt !== undefined) {
    if (body.baseUpdatedAt === null) value.baseUpdatedAt = null;
    else {
      const time = typeof body.baseUpdatedAt === "string" && body.baseUpdatedAt.length <= 40 ? timeOf(body.baseUpdatedAt) : null;
      if (time === null) return { error: "Geçersiz not sürümü" };
      value.baseUpdatedAt = time;
    }
  }
  return { value };
};

const noteTextOf = (note) => (typeof note?.text === "string" ? note.text.trim() : "");
/** Notu yazan yöneticinin adıyla yanıt biçimi (yazan isteği yapan yöneticiyse sorgu yapılmaz) */
const resolveStaffNote = async (note, req) => {
  const by = idOf(note?.updatedBy);
  if (!noteTextOf(note) || !by) return staffNoteView(note);
  if (req.user?._id && by === String(req.user._id)) return staffNoteView(note, new Map([[by, req.user.name || ""]]));
  return staffNoteView(note, await loadNames([by]));
};

export const updateStaffNote = async (req, res) => {
  try {
    const userId = String(req.params?.userId || "");
    if (!HEX24.test(userId)) {
      return res.status(400).json({ success: false, message: "Geçersiz müşteri kimliği" });
    }
    const { value, error } = parseStaffNoteBody(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const current = await User.findById(userId).select("name email staffNote staffFlags").lean();
    if (!current) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    const currentText = noteTextOf(current.staffNote);
    const currentVersion = currentText ? timeOf(current.staffNote?.updatedAt) : null;
    const storedVersion = timeOf(current.staffNote?.updatedAt);
    const currentFlags = canonicalFlags(current.staffFlags);
    const textChanged = value.text !== undefined && value.text !== currentText;
    const flagsChanged = value.flags !== undefined && value.flags.join(",") !== currentFlags.join(",");
    const conflict = async (latest) => res.status(409).json({
      success: false,
      conflict: true,
      message: NOTE_CONFLICT_MESSAGE,
      staffNote: await resolveStaffNote(latest?.staffNote, req),
      staffFlags: canonicalFlags(latest?.staffFlags),
    });
    if (textChanged && value.baseUpdatedAt !== undefined && value.baseUpdatedAt !== currentVersion) {
      return conflict(current);
    }
    if (!textChanged && !flagsChanged) {
      req.auditRecorded = true; // değişiklik yok: işlem kaydı yazılmaz
      return res.json({ success: true, unchanged: true, staffNote: await resolveStaffNote(current.staffNote, req), staffFlags: currentFlags });
    }

    const set = {};
    const unset = {};
    if (textChanged) {
      if (value.text) set.staffNote = { text: value.text, updatedAt: new Date(), updatedBy: req.user._id };
      else unset.staffNote = 1;
    }
    if (flagsChanged) {
      if (value.flags.length) set.staffFlags = value.flags;
      else unset.staffFlags = 1;
    }
    // Not okunduktan sonra başka bir kayıt geldiyse üzerine yazılmaz (koşullu güncelleme)
    const filter = textChanged ? { _id: userId, "staffNote.updatedAt": storedVersion === null ? null : new Date(storedVersion) } : { _id: userId };
    const updated = await User.findOneAndUpdate(
      filter,
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true, runValidators: true, timestamps: false },
    ).select("staffNote staffFlags").lean();
    if (!updated) {
      const latest = await User.findById(userId).select("staffNote staffFlags").lean();
      if (!latest) return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      return conflict(latest);
    }

    const changes = [];
    if (textChanged) changes.push({ label: "İç not", from: currentText ? "Vardı" : "Yok", to: value.text ? (currentText ? "Güncellendi" : "Eklendi") : "Silindi" });
    if (flagsChanged) changes.push({ label: "İşaretler", from: flagLabels(currentFlags), to: flagLabels(value.flags) });
    recordAdminAction(req, {
      action: textChanged ? "İç not güncellendi" : "Müşteri işaretleri güncellendi",
      category: "customer",
      target: userId,
      targetName: current.name || current.email || "",
      changes,
    });
    res.json({ success: true, staffNote: await resolveStaffNote(updated.staffNote, req), staffFlags: canonicalFlags(updated.staffFlags) });
  } catch (error) {
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ success: false, message: "İç not ya da işaretler geçersiz" });
    }
    console.error("İç not kaydedilirken hata:", error);
    res.status(500).json({ success: false, message: "İç not kaydedilemedi" });
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
      await user.save({ validateModifiedOnly: true });
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
