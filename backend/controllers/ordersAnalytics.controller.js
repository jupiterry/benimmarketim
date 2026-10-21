import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import { paymentMethodLabel } from "../lib/paymentMethods.js";
import { money, recordAdminAction, yesNo } from "../services/adminAudit.service.js";
import { signalOrderAlarm } from "../services/orderAlarm.service.js";
import {
  ORDER_STATUSES,
  applyOrderStatusChange,
  grantReferralRewardIfDelivered,
  releaseCouponForOrder,
  resolveEffectiveUnitPrice,
} from "../services/order.service.js";

// Bu iki yardımcı order.service.js'e taşındı; mevcut içe aktarımlar bozulmasın diye buradan da dışa aktarılır
export { grantReferralRewardIfDelivered, releaseCouponForOrder };

export const ACTIVE_ORDER_STATUSES = ["Hazırlanıyor", "Yolda"];
const PREPARING_STATUS = "Hazırlanıyor";
const DELETED_ACCOUNT_NAME = "Silinmiş hesap";
const ORDER_LIST_FIELDS =
  "user products totalAmount subtotalAmount couponCode couponDiscount discountPercentage status deliveryTracking statusHistory note phone city deliveryPoint deliveryPointName paymentMethod createdAt updatedAt device userDeleted";

export const INVALID_ORDER_ID_MESSAGE = "Geçersiz sipariş kimliği";
export const SEARCH_TOO_SHORT_MESSAGE = "Arama en az 2 harf veya rakam içermeli";
export const STATUS_CONFLICT_MESSAGE = "Sipariş durumu bu arada değişti";
export const LINE_CONFLICT_MESSAGE = "Ürün satırı bulunamadı; sipariş başka bir yerde değişmiş olabilir";
export const EDIT_CONFLICT_MESSAGE = "Sipariş bu arada değişti; güncel halini yükleyip tekrar deneyin";
export const SEARCH_MAX_LENGTH = 60;
const SEARCH_DEFAULT_LIMIT = 50;
const SEARCH_MAX_LIMIT = 100;
const SEARCH_USER_LIMIT = 200;
const MAX_LINE_QUANTITY = 999;
const MAX_CUSTOM_AMOUNT = 100000;

const HEX24 = /^[0-9a-f]{24}$/i;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const isObjectIdValue = (value) => value instanceof mongoose.Types.ObjectId || value?._bsontype === "ObjectId";
/** İstek gövdesi/parametresi: 24 haneli onaltılık kimlik */
export const isObjectIdString = (value) => (typeof value === "string" && HEX24.test(value)) || isObjectIdValue(value);
const orderTag = (order) => `#${String(order?._id ?? "").slice(-6).toUpperCase()}`;
const orderTargetName = (order, detail) =>
  [`Sipariş ${orderTag(order)}`, detail ?? (order?.deliveryPointName || order?.deliveryPoint)].filter(Boolean).join(" · ");

/** Sipariş alarmı telefonlarını uyandırır (durum değiştiyse bekleyen liste hemen yeniden okunur) */
const pingOrderAlarm = () => {
  try {
    signalOrderAlarm();
  } catch (error) {
    console.error("Sipariş alarmı sinyali gönderilemedi:", error.message);
  }
};

/**
 * Diğer yönetici sekmeleri/cihazları için: ürün, teslimat notu ya da silme değişikliği.
 * Yalnızca adminRoom'a gider (müşteri odalarına asla gönderilmez); hata yanıtı etkilemez.
 */
export const emitOrderUpdated = (req, orderId, kind) => {
  try {
    const io = req?.app?.get?.("io");
    if (!io) return;
    io.to("adminRoom").emit("orderUpdated", {
      orderId: String(orderId),
      kind,
      by: req?.user?._id ? String(req.user._id) : "",
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("orderUpdated bildirimi gönderilemedi:", error?.message);
  }
};

const validationMessage = (error) => {
  const paths = Object.keys(error?.errors || {}).slice(0, 3);
  return `Sipariş kaydedilemedi: kayıtta eksik ya da geçersiz bilgi var${paths.length ? ` (${paths.join(", ")})` : ""}`;
};

// Koşullu kayıt eşleşmedi: belge okunduktan sonra başka yerde değişti ya da silindi
// (sürüm artıran kayıtlarda Mongoose VersionError, diğerlerinde DocumentNotFoundError fırlatır)
const isWriteConflict = (error) => error?.name === "DocumentNotFoundError" || error?.name === "VersionError";

/** Denetleyici hatalarını anlamlı durum kodlarına çevirir; bilinmeyenler eskisi gibi 500 döner */
const sendOrderError = (res, error, logLabel) => {
  const name = error?.name;
  if (name === "CastError") {
    return res.status(400).json({ message: !error.path || error.path === "_id" ? INVALID_ORDER_ID_MESSAGE : "Geçersiz değer" });
  }
  if (name === "ValidationError") return res.status(400).json({ message: validationMessage(error) });
  if (isWriteConflict(error)) return res.status(409).json({ message: EDIT_CONFLICT_MESSAGE });
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error(logLabel, error?.message);
  return res.status(500).json({ message: "Server hatası", error: error?.message });
};

// ── Liste ────────────────────────────────────────────────────────────────────

// Hesabı silinen müşterinin siparişi listede kalır: kullanıcı belgesi yoksa gerçek kimlikle yer tutucu döner
// (her silinmiş hesap ayrı müşteri olarak kalır; tek bir "silinmiş" grubunda birleşmez)
export const userPopulate = () => ({
  path: "user",
  select: "name email avatar",
  transform: (doc, id) => doc ?? { _id: id ?? null, deleted: true },
});

const listQuery = (filter) =>
  Order.find(filter)
    .select(ORDER_LIST_FIELDS)
    .populate(userPopulate())
    .populate("products.product", "name price image")
    .sort({ createdAt: -1 });

const refId = (ref) => {
  if (!ref) return null;
  if (typeof ref !== "object" || isObjectIdValue(ref)) return String(ref);
  return ref._id ? String(ref._id) : null;
};

/** Siparişin müşterisi: { id (gerçek kullanıcı kimliği ya da null), profile (doldurulmuş belge), deleted } */
const customerOf = (order) => {
  const ref = order.user;
  if (!ref) return { id: null, profile: null, deleted: true };
  if (typeof ref !== "object" || isObjectIdValue(ref)) return { id: String(ref), profile: null, deleted: false };
  if (ref.deleted) return { id: ref._id ? String(ref._id) : null, profile: null, deleted: true };
  return { id: ref._id ? String(ref._id) : null, profile: ref, deleted: false };
};

/**
 * Siparişleri müşteriye göre gruplar (yanıt biçimi eskisiyle aynı, alanlar yalnızca eklenir):
 *  - hesabı silinmiş müşteri: gerçek kimlik, name "Silinmiş hesap", deleted: true
 *  - her sipariş: userDeleted; her satır: lineId (satır _id) ve productId
 */
export const groupOrdersByUser = (orders) => {
  const groups = new Map();
  for (const order of orders || []) {
    if (!order || !Array.isArray(order.products)) {
      console.log("Eksik veriler: ", order?._id);
      continue;
    }
    const customer = customerOf(order);
    const key = customer.id ? `u:${customer.id}` : `o:${String(order._id)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        user: {
          id: customer.id,
          name: customer.deleted ? DELETED_ACCOUNT_NAME : customer.profile?.name || "Bilinmeyen Kullanıcı",
          email: customer.profile?.email ?? null,
          avatar: customer.profile?.avatar || null,
          phone: order.phone,
          address: order.city || "",
          ...(customer.deleted ? { deleted: true } : {}),
        },
        orders: [],
      };
      groups.set(key, group);
    }

    group.orders.push({
      orderId: order._id,
      products: order.products.map((p) => ({
        name: p.name || p.product?.name || "Bilinmeyen Ürün",
        quantity: p.quantity,
        price: p.price ?? p.product?.price ?? 0,
        image: p.image || p.product?.image || null,
        isManual: p.isManual || false,
        // Satırın kalıcı kimliği: ürün düzenlemeleri dizin yerine bununla yapılır
        lineId: p._id ? String(p._id) : null,
        productId: refId(p.product),
      })),
      totalAmount: order.totalAmount,
      subtotalAmount: order.subtotalAmount || order.totalAmount,
      couponCode: order.couponCode || null,
      couponDiscount: order.couponDiscount || 0,
      discountPercentage: order.discountPercentage || 0,
      status: order.status,
      deliveryTracking: order.deliveryTracking || "",
      statusHistory: order.statusHistory || [],
      note: order.note,
      // Siparişte girilen telefon; müşteri her siparişte farklı numara verebilir
      phone: order.phone,
      city: order.city,
      deliveryPoint: order.deliveryPoint,
      deliveryPointName: order.deliveryPointName,
      paymentMethod: order.paymentMethod || null,
      paymentMethodLabel: paymentMethodLabel(order.paymentMethod),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      // Cihaz bilgisi
      device: order.device || null,
      userDeleted: Boolean(order.userDeleted || customer.deleted),
    });
  }
  return [...groups.values()];
};

const isoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Her müşteri grubuna ömür boyu istatistik ekler (user.stats). Tek aggregate; grup yoksa hiç çalışmaz
 * (boş 30 sn yenilemeleri sorgu çalıştırmaz). Hata olursa istatistik eklenmez, liste asla bozulmaz.
 */
export const attachCustomerStats = async (usersOrders) => {
  if (!Array.isArray(usersOrders) || !usersOrders.length) return usersOrders;
  const ids = [...new Set(
    usersOrders
      .map((group) => (group?.user?.id ? String(group.user.id).toLowerCase() : ""))
      .filter((id) => HEX24.test(id)),
  )];
  if (!ids.length) return usersOrders;
  try {
    const rows = await Order.aggregate([
      { $match: { user: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $sort: { createdAt: 1 } },
      { $group: {
        _id: "$user",
        orderCount: { $sum: 1 },
        cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "İptal Edildi"] }, 1, 0] } },
        deliveredCount: { $sum: { $cond: [{ $eq: ["$status", "Teslim Edildi"] }, 1, 0] } },
        totalSpent: { $sum: { $cond: [{ $ne: ["$status", "İptal Edildi"] }, "$totalAmount", 0] } },
        firstOrderId: { $first: "$_id" },
        firstOrderAt: { $first: "$createdAt" },
        lastOrderAt: { $last: "$createdAt" },
      } },
    ]);
    const byUser = new Map((rows || []).map((row) => [String(row._id).toLowerCase(), row]));
    for (const group of usersOrders) {
      const row = group?.user?.id ? byUser.get(String(group.user.id).toLowerCase()) : null;
      if (!row) continue;
      const orderCount = Number(row.orderCount) || 0;
      const cancelledCount = Number(row.cancelledCount) || 0;
      group.user.stats = {
        orderCount,
        validCount: Math.max(0, orderCount - cancelledCount),
        cancelledCount,
        deliveredCount: Number(row.deliveredCount) || 0,
        totalSpent: round2(row.totalSpent),
        firstOrderId: row.firstOrderId ? String(row.firstOrderId) : null,
        firstOrderAt: isoOrNull(row.firstOrderAt),
        lastOrderAt: isoOrNull(row.lastOrderAt),
      };
    }
  } catch (error) {
    console.error("Müşteri istatistikleri hesaplanamadı:", error.message);
  }
  return usersOrders;
};

// ── Sunucu araması (?q) ──────────────────────────────────────────────────────

/** Arama metni: kırpılır, boşluklar teklenir, baştaki # atılır, en fazla 60 karakter */
export const normalizeOrderSearch = (value) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().replace(/^#+\s*/, "").slice(0, SEARCH_MAX_LENGTH).trim();
};
/** En az 2 harf ya da rakam içeren metin aranabilir */
export const hasSearchableTerm = (text) => (String(text || "").match(/[\p{L}\p{N}]/gu) || []).length >= 2;

/** Türkçe harfleri sadeleştirir: "Çağla İŞÇİ" → "cagla isci" (önce GİRDİ katlanır) */
export const foldTurkish = (text) =>
  String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");

const SEARCH_LETTER_CLASSES = {
  a: "[aâAÂ]", c: "[cçCÇ]", g: "[gğGĞ]", i: "[iıİIîÎ]", o: "[oöOÖ]", s: "[sşSŞ]", u: "[uüUÜûÛ]",
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Katlanmış metinden düzenli ifade kaynağı: her harf Türkçe karşılıklarıyla eşleşir, özel karakterler kaçışlıdır */
export const turkishSearchPattern = (text) => {
  let pattern = "";
  let afterSpace = false;
  for (const char of foldTurkish(text)) {
    if (/\s/.test(char)) {
      if (!afterSpace) pattern += "\\s+";
      afterSpace = true;
      continue;
    }
    afterSpace = false;
    pattern += SEARCH_LETTER_CLASSES[char] || escapeRegex(char);
  }
  return pattern;
};

/**
 * ?q için MongoDB filtresi. Dallar ($or):
 *  - 24 haneli kimlik → yalnızca { _id }
 *  - 4–8 onaltılık karakter → sipariş kodu (kimliğin sonu)
 *  - telefon biçimi, baştaki 90/0 atıldıktan sonra ≥4 rakam → aradaki ayraçlara toleranslı telefon
 *  - ≥2 harf/rakam → müşteri adı/e-postası (en fazla 200 kullanıcı), kupon, teslimat notu, nokta, ürün adı, sipariş notu
 * Aranabilir dal yoksa { filter: null } döner (çağıran 400 verir; boş $or MongoDB'de hatadır).
 */
export const buildOrderSearchFilter = async (q) => {
  const term = normalizeOrderSearch(q);
  if (!term) return { filter: null };
  const compact = term.replace(/[\s#]/g, "");
  if (HEX24.test(compact)) return { filter: { _id: compact.toLowerCase() } };

  const branches = [];
  if (/^[0-9a-f]{4,8}$/i.test(compact)) {
    branches.push({ $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: `${compact.toLowerCase()}$`, options: "i" } } });
  }
  if (/^[\d\s()+\-.]+$/.test(term)) {
    let digits = term.replace(/\D/g, "");
    if (digits.startsWith("90") && digits.length >= 12) digits = digits.slice(2);
    digits = digits.replace(/^0+/, "");
    if (digits.length >= 4) branches.push({ phone: new RegExp(digits.split("").join("\\D*")) });
  }
  if (hasSearchableTerm(term)) {
    const pattern = new RegExp(turkishSearchPattern(term), "i");
    const users = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .select("_id")
      .limit(SEARCH_USER_LIMIT)
      .lean();
    if (users?.length) branches.push({ user: { $in: users.map((user) => user._id) } });
    branches.push(
      { couponCode: pattern },
      { deliveryTracking: pattern },
      { deliveryPointName: pattern },
      { "products.name": pattern },
      { note: pattern },
    );
  }
  return { filter: branches.length ? { $or: branches } : null };
};

/**
 * Sipariş listesi. Seçenek verilmezse eskisi gibi TÜM siparişler döner (panoda tüm zamanlar
 * cirosu için). Sipariş ekranı yalnızca ihtiyacı olanı ister (öncelik sırasıyla):
 *  - ids:          yalnızca bu siparişler (≤50; pencere dışındakiler dahil) → meta.ids = true
 *  - q:            sunucu araması (en yeni `limit` ≤100, varsayılan 50) → meta.search = true
 *  - updatedSince: yalnızca bu andan sonra değişen siparişler (yenileme; diğerleri yok sayılır)
 *  - since:        bu tarihten sonra oluşturulanlar (örn. son 30 gün)
 *  - before+limit: bu tarihten eski en yeni `limit` sipariş ("daha eski siparişleri yükle")
 *  - active:       tarihten bağımsız tüm Hazırlanıyor / Yolda siparişleri
 *  - includeCustomerStats: her müşteri grubuna user.stats (her kipte)
 */
export const getOrderAnalyticsData = async (options = {}) => {
  try {
    const { since, before, limit, active, updatedSince, ids, q, includeCustomerStats } = options;
    const idList = Array.isArray(ids) && ids.length ? ids : null;
    const search = typeof q === "string" && q ? q : null;
    const scoped = Boolean(since || before || limit || active || updatedSince || idList || search);
    const serverTime = new Date();
    const totalOrders = await Order.countDocuments();
    const group = async (orders) => {
      const usersOrders = groupOrdersByUser(orders);
      return includeCustomerStats ? attachCustomerStats(usersOrders) : usersOrders;
    };

    if (!scoped) {
      const orders = await listQuery({}).lean();
      return { totalOrders, usersOrders: await group(orders) };
    }

    let orders;
    let hasMore = false;
    let oldestCreatedAt = null;
    const flags = {};
    if (idList) {
      orders = await listQuery({ _id: { $in: idList } }).lean();
      flags.ids = true;
    } else if (search) {
      const { filter } = await buildOrderSearchFilter(search);
      if (!filter) throw Object.assign(new Error(SEARCH_TOO_SHORT_MESSAGE), { statusCode: 400 });
      const max = Math.min(limit || SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT);
      orders = await listQuery(filter).limit(max + 1).lean();
      if (orders.length > max) {
        orders.length = max;
        hasMore = true;
      }
      oldestCreatedAt = orders.length ? orders[orders.length - 1].createdAt : null;
      flags.search = true;
    } else if (updatedSince) {
      orders = await listQuery({ updatedAt: { $gt: updatedSince } }).lean();
    } else {
      const created = {};
      if (since) created.$gte = since;
      if (before) created.$lt = before;
      const recentFilter = Object.keys(created).length ? { createdAt: created } : {};
      let recentQuery = listQuery(recentFilter);
      if (limit) recentQuery = recentQuery.limit(limit + 1);
      const [recent, activeOrders] = await Promise.all([
        since || before || limit ? recentQuery.lean() : Promise.resolve([]),
        active ? listQuery({ status: { $in: ACTIVE_ORDER_STATUSES } }).lean() : Promise.resolve([]),
      ]);
      if (limit && recent.length > limit) {
        recent.length = limit;
        hasMore = true;
      }
      const oldest = recent.length ? recent[recent.length - 1].createdAt : since || before;
      if (!limit && oldest) hasMore = Boolean(await Order.exists({ createdAt: { $lt: oldest } }));
      const seen = new Set();
      orders = [...recent, ...activeOrders].filter((order) => {
        const id = order._id.toString();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      oldestCreatedAt = oldest || null;
    }

    return {
      totalOrders,
      usersOrders: await group(orders),
      meta: {
        serverTime: serverTime.toISOString(),
        hasMore,
        oldestCreatedAt: oldestCreatedAt ? new Date(oldestCreatedAt).toISOString() : null,
        count: orders.length,
        ...flags,
      },
    };
  } catch (error) {
    if (!error?.statusCode) console.error("Siparişler alınırken hata oluştu:", error.message);
    throw error;
  }
};

// ── Durum ────────────────────────────────────────────────────────────────────

const isStatusOrEmpty = (value) => value === undefined || value === null || value === "" || ORDER_STATUSES.includes(value);

/**
 * Admin sipariş durumunu günceller. Gövde: { orderId, status, expectedStatus? }
 *  - status mevcut durumla aynı → 200 { unchanged: true } (geçmiş, bildirim, soket, ödül yok)
 *  - expectedStatus verildi ve mevcut durum farklı → 409 { status: <mevcut> } (geri alma penceresi güvenli)
 *  - aksi halde kaydedilir; bildirim/ödül/kupon/soket ortak servisten, alarm telefonları uyarılır
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status, expectedStatus } = req.body || {};

    if (!ORDER_STATUSES.includes(status) || !isStatusOrEmpty(expectedStatus)) {
      return res.status(400).json({ message: "Geçersiz sipariş durumu!" });
    }
    // Kimlik biçimi sorguda denetlenir (CastError → 400)
    if (!orderId || (typeof orderId !== "string" && !isObjectIdValue(orderId))) {
      return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    if (order.status === status) {
      req.auditRecorded = true; // değişiklik yok: genel kayıt da yazılmasın
      return res.json({ message: "Sipariş zaten bu durumda", order, unchanged: true });
    }
    if (expectedStatus && order.status !== expectedStatus) {
      return res.status(409).json({ message: STATUS_CONFLICT_MESSAGE, status: order.status, order });
    }

    let previousStatus;
    try {
      previousStatus = await applyOrderStatusChange(order, status, { actorId: req.user?._id, io: req.app?.get?.("io") });
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
      // Okuma ile kayıt arasında durum başka yerde değişti
      const current = await Order.findById(orderId);
      if (!current) return res.status(404).json({ message: "Sipariş bulunamadı!" });
      if (current.status === status) {
        req.auditRecorded = true;
        return res.json({ message: "Sipariş zaten bu durumda", order: current, unchanged: true });
      }
      return res.status(409).json({ message: STATUS_CONFLICT_MESSAGE, status: current.status, order: current });
    }

    recordAdminAction(req, { action: "Sipariş durumu değiştirildi", category: "order", target: String(order._id),
      targetName: orderTargetName(order),
      changes: [{ label: "Durum", from: previousStatus, to: status }] });
    pingOrderAlarm();

    res.json({ message: "Sipariş durumu başarıyla güncellendi!", order });
  } catch (error) {
    sendOrderError(res, error, "Sipariş durumu güncellenirken hata:");
  }
};

/**
 * Toplu durum değişikliği. Gövde: { orderIds (1–100), status, expectedStatus? }
 * Tekli güncellemeyle aynı yol (bildirim, görev + referral, kupon iadesi / İptal'den çıkışta yeniden kullanım,
 * soket, sipariş başına işlem kaydı).
 * Yanıt: { updated, skipped: [{ orderId, reason: 'missing'|'conflict'|'unchanged', status? }] }
 */
export const bulkUpdateOrderStatus = async (req, res) => {
  let updated = 0;
  try {
    const { orderIds, status, expectedStatus } = req.body || {};
    if (
      !Array.isArray(orderIds) || orderIds.length < 1 || orderIds.length > 100 ||
      !orderIds.every((id) => typeof id === "string" && HEX24.test(id)) ||
      !ORDER_STATUSES.includes(status) || !isStatusOrEmpty(expectedStatus)
    ) {
      return res.status(400).json({ message: "Geçersiz toplu işlem" });
    }
    const ids = [];
    const seen = new Set();
    for (const id of orderIds) {
      const key = id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(id);
    }

    const orders = await Order.find({ _id: { $in: ids } });
    if (!orders?.length) return res.status(404).json({ message: "Siparişler bulunamadı" });
    const byId = new Map(orders.map((order) => [String(order._id).toLowerCase(), order]));
    const io = req.app?.get?.("io");
    const skipped = [];

    for (const id of ids) {
      const order = byId.get(id.toLowerCase());
      if (!order) {
        skipped.push({ orderId: id, reason: "missing" });
        continue;
      }
      if (order.status === status) {
        skipped.push({ orderId: id, reason: "unchanged", status });
        continue;
      }
      if (expectedStatus && order.status !== expectedStatus) {
        skipped.push({ orderId: id, reason: "conflict", status: order.status });
        continue;
      }
      let previousStatus;
      try {
        previousStatus = await applyOrderStatusChange(order, status, { actorId: req.user?._id, io });
      } catch (error) {
        if (!isWriteConflict(error)) throw error;
        const current = await Order.findById(id);
        if (!current) skipped.push({ orderId: id, reason: "missing" });
        else if (current.status === status) skipped.push({ orderId: id, reason: "unchanged", status });
        else skipped.push({ orderId: id, reason: "conflict", status: current.status });
        continue;
      }
      updated += 1;
      recordAdminAction(req, { action: "Sipariş durumu değiştirildi (toplu)", category: "order", target: String(order._id),
        targetName: orderTargetName(order),
        changes: [{ label: "Durum", from: previousStatus, to: status }] });
    }

    if (updated) pingOrderAlarm();
    else req.auditRecorded = true; // hiçbir sipariş değişmedi
    return res.json({ updated, skipped });
  } catch (error) {
    console.error("Toplu sipariş durumu güncellenemedi:", error?.message);
    if (updated) pingOrderAlarm(); // hatadan önce değişenler için de alarm telefonları uyarılır
    return res.status(500).json({ message: "Toplu işlem tamamlanamadı" });
  }
};

/** Teslimat notu / takip bilgisi (≤120). Yanıt: { order } */
export const updateDeliveryTracking = async (req, res) => {
  try {
    const { orderId, deliveryTracking } = req.body || {};
    if (!isObjectIdString(orderId)) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });
    if (typeof deliveryTracking !== "string" || deliveryTracking.length > 120) {
      return res.status(400).json({ message: "Geçersiz teslimat bilgisi" });
    }
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Sipariş bulunamadı" });

    const previous = order.deliveryTracking || "";
    const next = deliveryTracking.trim();
    if (previous === next) {
      req.auditRecorded = true;
      return res.json({ order });
    }
    order.deliveryTracking = next;
    await order.save({ validateModifiedOnly: true });

    recordAdminAction(req, { action: "Teslimat notu", category: "order", target: String(order._id),
      targetName: orderTargetName(order),
      changes: [{ label: "Teslimat notu", from: previous, to: next }] });
    emitOrderUpdated(req, order._id, "tracking");
    return res.json({ order });
  } catch (error) {
    return sendOrderError(res, error, "Teslimat notu kaydedilirken hata:");
  }
};

// Günlük sipariş verilerini getiren fonksiyon
export const getDailyOrdersData = async (startDate, endDate) => {
  try {
    const dailyOrdersData = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dateArray = getDatesInRange(startDate, endDate);

    return dateArray.map((date) => {
      const foundData = dailyOrdersData.find((item) => item._id === date);
      return {
        date,
        orders: foundData?.orders || 0,
        revenue: foundData?.revenue || 0,
      };
    });
  } catch (error) {
    console.error("Günlük sipariş verileri alınırken hata:", error.message);
    throw error;
  }
};

function getDatesInRange(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dates.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

// Kullanıcının siparişlerini getiren fonksiyon (admin için userId query desteği)
export const getUserOrders = async (req, res) => {
  try {
    // Sadece admin başka bir kullanıcı için sorgu yapabilir.
    const userId = req.user.role === "admin" && req.query.userId
      ? req.query.userId
      : req.user._id;
    
    const orders = await Order.find({ user: userId })
      .populate({
        path: 'products.product',
        select: 'name price image'
      })
      .sort({ createdAt: -1 });

    const formattedOrders = orders.map(order => ({
      _id: order._id,
      orderId: order._id,
      products: order.products.map(p => ({
        // Mobil "tekrar sipariş" için; ürün silinmişse null döner.
        productId: p.product?._id || null,
        name: p.product?.name || p.name || "Bilinmeyen Ürün",
        quantity: p.quantity,
        price: p.product?.price || p.price || 0,
        image: p.product?.image || p.image || null,
      })),
      totalAmount: order.totalAmount,
      subtotalAmount: order.subtotalAmount || order.totalAmount,
      couponCode: order.couponCode || null,
      couponDiscount: order.couponDiscount || 0,
      status: order.status,
      note: order.note,
      city: order.city,
      deliveryPoint: order.deliveryPoint,
      deliveryPointName: order.deliveryPointName,
      paymentMethod: order.paymentMethod || null,
      paymentMethodLabel: paymentMethodLabel(order.paymentMethod),
      phone: order.phone,
      createdAt: order.createdAt,
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error("Kullanıcı siparişleri alınırken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Sipariş iptal etme fonksiyonu
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user._id;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    // Kullanıcının kendi siparişini iptal etme kontrolü
    if (req.user.role !== "admin" && order.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bu siparişi iptal etme yetkiniz yok!" });
    }

    // Sadece "Hazırlanıyor" durumundaki siparişler iptal edilebilir
    if (order.status !== "Hazırlanıyor") {
      return res.status(400).json({ message: "Bu sipariş artık iptal edilemez!" });
    }

    order.status = "İptal Edildi";
    order.statusHistory.push({ status: "İptal Edildi", changedAt: new Date(), changedBy: req.user._id });
    await order.save();
    await releaseCouponForOrder(order);

    // Yönetim paneli müşterinin iptalini 30 sn'lik yenilemeyi beklemeden görsün
    try {
      req.app.get("io")?.to("adminRoom").emit("orderStatusUpdated", {
        orderId: order._id,
        newStatus: order.status,
        message: "Müşteri siparişi iptal etti",
      });
    } catch (socketError) {
      console.error("Socket.IO iptal bildirimi gönderilirken hata:", socketError);
    }

    res.json({ message: "Sipariş başarıyla iptal edildi!", order });
  } catch (error) {
    console.error("Sipariş iptal edilirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// ── Ürün düzenlemeleri (Admin only) ─────────────────────────────────────────
// Satır `lineId` (satırın _id'si) ile seçilir; yoksa eski `productIndex` kullanılır. Kayıt sürüm
// denetimlidir: okuma ile yazma arasında sipariş başka yerde değiştiyse 409 döner, toplamlar eski
// okumayla ezilmez. Her başarılı düzenleme işlem kaydı yazar ve adminRoom'a orderUpdated gönderir.

const hasValue = (value) => value !== undefined && value !== null && value !== "";
const toInteger = (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value);
const parseAmount = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value.trim().replace(",", "."));
  return Number.NaN;
};
const lineLabel = (line) => `${line?.name || "Ürün"} ×${line?.quantity ?? 0}`;

/** { index } ya da { status, message } */
const findLineIndex = (order, { lineId, productIndex }) => {
  const products = Array.isArray(order.products) ? order.products : [];
  if (hasValue(lineId)) {
    const id = String(lineId).toLowerCase();
    if (!HEX24.test(id)) return { status: 400, message: "Geçersiz ürün satırı" };
    const index = products.findIndex((line) => line?._id && String(line._id).toLowerCase() === id);
    return index < 0 ? { status: 409, message: LINE_CONFLICT_MESSAGE } : { index };
  }
  const index = toInteger(productIndex);
  if (!Number.isInteger(index) || index < 0 || index >= products.length) {
    return { status: 400, message: "Geçersiz ürün index'i!" };
  }
  return { index };
};

/** Toplamı (ve indirim öncesi ara toplam varsa onu da) farka göre günceller; kuruş hassasiyetinde */
const applyTotalsDelta = (order, delta) => {
  const before = Number(order.totalAmount) || 0;
  order.totalAmount = Math.max(0, round2(before + delta));
  if (order.subtotalAmount) order.subtotalAmount = Math.max(0, round2(Number(order.subtotalAmount) + delta));
  return { before, after: order.totalAmount };
};
const totalChange = ({ before, after }) => ({ label: "Toplam", from: money(before), to: money(after) });

const saveOrderEdit = async (order) => {
  if (typeof order.increment === "function") order.increment(); // sürüm denetimi (VersionError → 409)
  await order.save({ validateModifiedOnly: true });
};

const recordItemEdit = (req, order, action, changes) =>
  recordAdminAction(req, { action, category: "order", target: String(order._id), targetName: orderTargetName(order), changes });

// Siparişe özel ürün/tutar ekleme fonksiyonu
export const addCustomItemToOrder = async (req, res) => {
  try {
    const { orderId, amount, name } = req.body || {};

    if (!orderId || !hasValue(amount)) {
      return res.status(400).json({ message: "Sipariş ID ve tutar zorunludur!" });
    }
    if (!isObjectIdString(orderId)) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });
    const parsed = parseAmount(amount);
    const value = round2(parsed);
    if (!Number.isFinite(parsed) || value <= 0 || value > MAX_CUSTOM_AMOUNT) {
      return res.status(400).json({ message: "Geçerli bir tutar girin" });
    }
    const label = (typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 80).trim() : "") || "Özel Ekleme";

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    // "Özel Ekleme" adında gizli genel bir ürün (katalogda görünmez); yoksa oluşturulur
    let customProduct = await Product.findOne({ name: "Özel Ekleme", isHidden: true });
    if (!customProduct) {
      customProduct = await Product.create({
        name: "Özel Ekleme",
        price: 0, // Tutar satırda tutulur
        description: "Yönetici tarafından eklenen özel ürün/tutar",
        category: "Diğer",
        image: "",
        isHidden: true,
        order: 9999,
      });
    }

    order.products.push({
      product: customProduct._id,
      name: label,
      quantity: 1, // Adet her zaman 1
      price: value, // Fiyat girilen tutar
      isManual: true, // Manuel eklenen ürün - kar marjı hesaplamasında hariç tutulacak
    });
    const totals = applyTotalsDelta(order, value);
    await saveOrderEdit(order);

    recordItemEdit(req, order, "Siparişe tutar eklendi", [
      { label: "Ürün eklendi", from: "—", to: `${label} (${money(value)})` },
      totalChange(totals),
    ]);
    emitOrderUpdated(req, order._id, "items");

    res.json({ message: "Ürün siparişe başarıyla eklendi!", order });
  } catch (error) {
    sendOrderError(res, error, "Siparişe ürün eklenirken hata:");
  }
};

// Sipariş silme fonksiyonu (Admin only) - Veritabanından kalıcı olarak siler
export const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params || {};

    if (!orderId) {
      return res.status(400).json({ message: "Sipariş ID gerekli!" });
    }
    if (!isObjectIdString(orderId)) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    const removed = await Order.findByIdAndDelete(orderId);
    if (!removed) return res.status(404).json({ message: "Sipariş bulunamadı!" });

    // Aktif sipariş silinirse kullandığı kupon müşteriye geri açılır (iptal ile aynı)
    if (ACTIVE_ORDER_STATUSES.includes(order.status)) await releaseCouponForOrder(order);

    let customer = DELETED_ACCOUNT_NAME;
    if (order.user && !order.userDeleted) {
      try {
        const user = await User.findById(order.user).select("name").lean();
        customer = user?.name || DELETED_ACCOUNT_NAME;
      } catch {
        customer = "";
      }
    }
    recordAdminAction(req, { action: "Sipariş silindi", category: "order", target: String(order._id),
      targetName: orderTargetName(order, customer),
      changes: [{ label: "Durum", from: order.status, to: "Silindi" }, { label: "Tutar", from: money(order.totalAmount), to: "—" }] });
    emitOrderUpdated(req, order._id, "deleted");
    if (order.status === PREPARING_STATUS) pingOrderAlarm();

    res.json({
      success: true,
      message: "Sipariş başarıyla silindi!",
      deletedOrderId: orderId,
    });
  } catch (error) {
    sendOrderError(res, error, "Sipariş silinirken hata:");
  }
};

// Siparişten ürün silme fonksiyonu (Admin only). Gövde: { orderId, lineId?, productIndex? }
export const removeItemFromOrder = async (req, res) => {
  try {
    const { orderId, productIndex, lineId } = req.body || {};

    if (!orderId || (productIndex === undefined && !hasValue(lineId))) {
      return res.status(400).json({ message: "Sipariş ID ve ürün index'i gerekli!" });
    }
    if (!isObjectIdString(orderId)) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    const found = findLineIndex(order, { lineId, productIndex });
    if (found.message) return res.status(found.status).json({ message: found.message });

    // Sipariş boş kalamaz
    if (order.products.length <= 1) {
      return res.status(400).json({ message: "Siparişte en az bir ürün olmalı! Siparişi tamamen silmek için 'Sipariş Sil' seçeneğini kullanın." });
    }

    const removedProduct = order.products[found.index];
    const removedName = removedProduct.name;
    const removedLabel = lineLabel(removedProduct);
    const removedAmount = (Number(removedProduct.price) || 0) * (Number(removedProduct.quantity) || 0);

    order.products.splice(found.index, 1);
    const totals = applyTotalsDelta(order, -removedAmount);
    await saveOrderEdit(order);

    recordItemEdit(req, order, "Siparişten ürün çıkarıldı", [
      { label: "Ürün çıkarıldı", from: removedLabel, to: "—" },
      totalChange(totals),
    ]);
    emitOrderUpdated(req, order._id, "items");

    res.json({
      success: true,
      message: "Ürün siparişten başarıyla silindi!",
      order,
      removedProduct: removedName,
    });
  } catch (error) {
    sendOrderError(res, error, "Siparişten ürün silinirken hata:");
  }
};

// Siparişteki ürün miktarını güncelleme fonksiyonu (Admin only). Gövde: { orderId, lineId?, productIndex?, newQuantity }
export const updateItemQuantity = async (req, res) => {
  try {
    const { orderId, productIndex, lineId, newQuantity } = req.body || {};

    if (!orderId || (productIndex === undefined && !hasValue(lineId)) || !hasValue(newQuantity)) {
      return res.status(400).json({ message: "Sipariş ID, ürün index'i ve yeni miktar gerekli!" });
    }
    if (!isObjectIdString(orderId)) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });

    const quantity = toInteger(newQuantity);
    if (typeof quantity === "number" && quantity < 1) {
      return res.status(400).json({ message: "Miktar en az 1 olmalı! Ürünü kaldırmak için silme işlemini kullanın." });
    }
    if (!Number.isInteger(quantity) || quantity > MAX_LINE_QUANTITY) {
      return res.status(400).json({ message: `Miktar 1 ile ${MAX_LINE_QUANTITY} arasında bir tam sayı olmalı` });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    const found = findLineIndex(order, { lineId, productIndex });
    if (found.message) return res.status(found.status).json({ message: found.message });

    const product = order.products[found.index];
    const oldQuantity = product.quantity;
    const reply = () => res.json({
      success: true,
      message: "Ürün miktarı başarıyla güncellendi!",
      order,
      updatedProduct: product.name,
      oldQuantity,
      newQuantity: quantity,
    });
    if (oldQuantity === quantity) {
      req.auditRecorded = true; // değişiklik yok
      return reply();
    }

    const priceDifference = (Number(product.price) || 0) * (quantity - (Number(oldQuantity) || 0));
    product.quantity = quantity;
    const totals = applyTotalsDelta(order, priceDifference);
    await saveOrderEdit(order);

    recordItemEdit(req, order, "Sipariş ürün adedi değiştirildi", [
      { label: `Adet · ${product.name || "Ürün"}`, from: String(oldQuantity), to: String(quantity) },
      totalChange(totals),
    ]);
    emitOrderUpdated(req, order._id, "items");

    return reply();
  } catch (error) {
    return sendOrderError(res, error, "Ürün miktarı güncellenirken hata:");
  }
};

// Siparişe katalog ürünü ekleme fonksiyonu (Admin only). Gövde: { orderId, productId, quantity (1–99) }
export const addProductToOrder = async (req, res) => {
  try {
    const { orderId, productId, quantity = 1 } = req.body || {};

    if (!orderId || !productId) {
      return res.status(400).json({ message: "Sipariş ID ve ürün ID gerekli!" });
    }
    if (!isObjectIdString(orderId)) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });
    if (!isObjectIdString(productId)) return res.status(400).json({ message: "Geçersiz ürün kimliği" });
    const addedQuantity = toInteger(quantity);
    if (!Number.isInteger(addedQuantity) || addedQuantity < 1 || addedQuantity > 99) {
      return res.status(400).json({ message: "Adet 1 ile 99 arasında olmalı" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    // Ödeme adımıyla aynı birim fiyat (haftalık fırsat > geçerli indirim > fiyat); ürün yoksa 404
    const { product, price } = await resolveEffectiveUnitPrice(productId);
    const productKey = String(product._id);

    // Yalnızca aynı ürün VE aynı birim fiyattaki satıra eklenir; fiyat değiştiyse yeni satır açılır
    const existingIndex = order.products.findIndex(
      (line) => line?.product && refId(line.product) === productKey && round2(line.price) === round2(price)
    );
    if (existingIndex !== -1) {
      const line = order.products[existingIndex];
      if ((Number(line.quantity) || 0) + addedQuantity > MAX_LINE_QUANTITY) {
        return res.status(400).json({ message: `Bir satırda en fazla ${MAX_LINE_QUANTITY} adet olabilir` });
      }
      line.quantity = (Number(line.quantity) || 0) + addedQuantity;
    } else {
      order.products.push({
        product: product._id,
        name: product.name,
        quantity: addedQuantity,
        price,
      });
    }

    const addedAmount = round2(price * addedQuantity);
    const totals = applyTotalsDelta(order, addedAmount);
    await saveOrderEdit(order);

    recordItemEdit(req, order, "Siparişe ürün eklendi", [
      { label: "Ürün eklendi", from: "—", to: `${product.name} ×${addedQuantity} (${money(addedAmount)})` },
      totalChange(totals),
    ]);
    emitOrderUpdated(req, order._id, "items");

    res.json({
      success: true,
      message: `${product.name} siparişe başarıyla eklendi!`,
      order,
      addedProduct: product.name,
      addedQuantity,
    });
  } catch (error) {
    sendOrderError(res, error, "Siparişe ürün eklenirken hata:");
  }
};

// Ürünün manuel işaretini değiştirme fonksiyonu (Admin only). Gövde: { orderId, lineId?, productIndex?, isManual }
export const toggleManualFlag = async (req, res) => {
  try {
    const { orderId, productIndex, lineId, isManual } = req.body || {};

    if (!orderId || (productIndex === undefined && !hasValue(lineId)) || isManual === undefined) {
      return res.status(400).json({ message: "Sipariş ID, ürün index'i ve isManual değeri gerekli!" });
    }
    if (!isObjectIdString(orderId)) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });
    const flag = isManual === true || isManual === "true" || isManual === 1 || isManual === "1";

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Sipariş bulunamadı!" });
    }

    const found = findLineIndex(order, { lineId, productIndex });
    if (found.message) return res.status(found.status).json({ message: found.message });

    const line = order.products[found.index];
    const previous = Boolean(line.isManual);
    if (previous !== flag) {
      line.isManual = flag;
      await saveOrderEdit(order);
      recordItemEdit(req, order, "Sipariş ürünü manuel işareti", [
        { label: `Manuel · ${line.name || "Ürün"}`, from: yesNo(previous), to: yesNo(flag) },
      ]);
      emitOrderUpdated(req, order._id, "items");
    } else {
      req.auditRecorded = true; // değişiklik yok
    }

    res.json({
      success: true,
      message: flag ? "Ürün manuel olarak işaretlendi!" : "Manuel işareti kaldırıldı!",
      order,
      updatedProduct: line.name,
      isManual: flag,
    });
  } catch (error) {
    sendOrderError(res, error, "Manuel işareti güncellenirken hata:");
  }
};

// ── Genel bakış özeti (yönetici panosu) ──────────────────────────────────────
// Tüm sipariş geçmişini belleğe çekmek yerine dönem özetini sunucuda aggregate ile hesaplar.
// Mağaza saati Türkiye (UTC+3, yaz saati yok); gün/ay sınırları buna göre alınır.
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DELAYED_PREPARING_MINUTES = 20;
export const DASHBOARD_PERIODS = ["today", "7d", "30d", "month", "all", "custom"];

const startOfTrDay = (date) => new Date(Math.floor((date.getTime() + TR_OFFSET_MS) / DAY_MS) * DAY_MS - TR_OFFSET_MS);
const startOfTrMonth = (date) => {
  const shifted = new Date(date.getTime() + TR_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - TR_OFFSET_MS);
};
const addTrMonths = (start, months) => {
  const shifted = new Date(start.getTime() + TR_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + months, 1) - TR_OFFSET_MS);
};
const parseIsoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Dönem sınırlarını üretir: { period, start, end, previous: {start, end} | null, bucket }
 *  - today: bugün 00:00'dan şimdiye (saatlik seri), önceki = dün aynı saate kadar
 *  - 7d / 30d: son N gün (bugün dahil, günlük seri), önceki = ondan önceki N gün
 *  - month: bu ayın başından (günlük seri), önceki = geçen ayın tamamı
 *  - all: sınırsız (aylık seri), karşılaştırma yok
 *  - custom: from/to (ISO; to hariç) — revenuePeriods dönemleri için; önceki = aynı uzunlukta bir önceki aralık
 */
export const buildDashboardRange = (query = {}, now = new Date()) => {
  const period = DASHBOARD_PERIODS.includes(query.period) ? query.period : "today";
  const todayStart = startOfTrDay(now);
  if (period === "today") {
    const elapsed = now.getTime() - todayStart.getTime();
    const previousStart = new Date(todayStart.getTime() - DAY_MS);
    return { period, start: todayStart, end: null, bucket: "hour", previous: { start: previousStart, end: new Date(previousStart.getTime() + elapsed) } };
  }
  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    const start = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    return { period, start, end: null, bucket: "day", previous: { start: new Date(start.getTime() - days * DAY_MS), end: start } };
  }
  if (period === "month") {
    const start = startOfTrMonth(now);
    return { period, start, end: null, bucket: "day", previous: { start: addTrMonths(start, -1), end: start } };
  }
  if (period === "custom") {
    const start = parseIsoDate(query.from);
    const end = parseIsoDate(query.to);
    if (start) {
      const effectiveEnd = end && end > start ? end : null;
      const length = (effectiveEnd || now).getTime() - start.getTime();
      const days = length / DAY_MS;
      return {
        period, start, end: effectiveEnd,
        bucket: days <= 2 ? "hour" : days <= 92 ? "day" : "month",
        previous: { start: new Date(start.getTime() - length), end: start },
      };
    }
  }
  return { period: "all", start: null, end: null, bucket: "month", previous: null };
};

const rangeMatch = (range) => {
  const createdAt = {};
  if (range.start) createdAt.$gte = range.start;
  if (range.end) createdAt.$lt = range.end;
  return Object.keys(createdAt).length ? { createdAt } : {};
};
const BUCKET_FORMAT = { hour: "%Y-%m-%dT%H", day: "%Y-%m-%d", month: "%Y-%m" };
const bucketKey = (date, bucket) => {
  const shifted = new Date(date.getTime() + TR_OFFSET_MS).toISOString();
  return bucket === "hour" ? shifted.slice(0, 13) : bucket === "day" ? shifted.slice(0, 10) : shifted.slice(0, 7);
};
/** Seriyi boş kovalarla doldurur; böylece grafik satışsız gün/saatleri de gösterir (en fazla 400 nokta) */
export const fillSeries = (rows, range, bucket, now = new Date()) => {
  const byKey = new Map(rows.map((row) => [row._id, row]));
  // Başlangıcı olmayan dönemde (tüm zamanlar) seri ilk satışla başlar
  const keyToDate = (key) => new Date(key.length === 7 ? `${key}-01T00:00:00+03:00` : key.length === 10 ? `${key}T00:00:00+03:00` : `${key}:00:00+03:00`);
  const first = range.start || (rows.length ? keyToDate(rows[0]._id) : now);
  const last = range.end ? new Date(range.end.getTime() - 1) : now;
  const series = [];
  let cursor = new Date(first.getTime());
  while (cursor <= last && series.length < 400) {
    const key = bucketKey(cursor, bucket);
    const row = byKey.get(key);
    series.push({ key, orders: row?.orders || 0, revenue: Math.round((row?.revenue || 0) * 100) / 100 });
    if (bucket === "hour") cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    else if (bucket === "day") cursor = new Date(cursor.getTime() + DAY_MS);
    else cursor = addTrMonths(startOfTrMonth(cursor), 1);
  }
  return series;
};

const periodTotalsStage = [
  { $group: {
    _id: null,
    orders: { $sum: 1 },
    cancelled: { $sum: { $cond: [{ $eq: ["$status", "İptal Edildi"] }, 1, 0] } },
    revenue: { $sum: { $cond: [{ $eq: ["$status", "İptal Edildi"] }, 0, "$totalAmount"] } },
  } },
];
const pct = (current, previous) => (previous ? round2(((current - previous) / previous) * 100) : null);
const summarizeTotals = (row) => {
  const orders = row?.orders || 0;
  const cancelled = row?.cancelled || 0;
  const completed = orders - cancelled;
  const revenue = round2(row?.revenue);
  return { orders, cancelled, completed, revenue, averageBasket: completed ? round2(revenue / completed) : 0, cancelRate: orders ? round2((cancelled / orders) * 100) : 0 };
};

/** Model dosyası yoksa (örn. ayrı dağıtım) ilgili sayı atlanır */
const loadModel = async (path) => {
  try {
    return (await import(path)).default;
  } catch {
    return null;
  }
};
const safeCount = async (model, filter) => {
  if (!model) return null;
  try {
    return await model.countDocuments(filter);
  } catch {
    return null;
  }
};

export const computeDashboardSummary = async (query = {}, now = new Date()) => {
  const range = buildDashboardRange(query, now);
  const match = rangeMatch(range);
  const notCancelled = { status: { $ne: "İptal Edildi" } };
  const [facet] = await Order.aggregate([
    { $match: match },
    { $facet: {
      totals: periodTotalsStage,
      byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
      byDorm: [
        { $match: notCancelled },
        { $group: { _id: "$deliveryPoint", orders: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
        { $sort: { orders: -1 } },
      ],
      series: [
        { $match: notCancelled },
        { $group: { _id: { $dateToString: { format: BUCKET_FORMAT[range.bucket], date: "$createdAt", timezone: "+03:00" } }, orders: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
        { $sort: { _id: 1 } },
        { $limit: 400 },
      ],
      topProducts: [
        { $match: notCancelled },
        { $unwind: "$products" },
        { $match: { "products.isManual": { $ne: true } } },
        { $group: { _id: { $ifNull: ["$products.product", "$products.name"] }, name: { $first: "$products.name" }, quantity: { $sum: "$products.quantity" }, revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } } } },
        { $sort: { quantity: -1, revenue: -1 } },
        { $limit: 5 },
      ],
      manual: [
        { $match: notCancelled },
        { $unwind: "$products" },
        { $match: { "products.isManual": true } },
        { $group: { _id: null, revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } } } },
      ],
    } },
  ]);
  const previousRows = range.previous
    ? await Order.aggregate([{ $match: rangeMatch(range.previous) }, ...periodTotalsStage])
    : [];
  const current = summarizeTotals(facet?.totals?.[0]);
  const previous = range.previous ? summarizeTotals(previousRows[0]) : null;

  const [Product, SupportRequest] = await Promise.all([loadModel("../models/product.model.js"), loadModel("../models/supportRequest.model.js")]);
  const delayedBefore = new Date(now.getTime() - DELAYED_PREPARING_MINUTES * 60 * 1000);
  const [delayedOrders, preparingOrders, activeOrders, productsWithoutImage, productsOutOfStock, waitingSupport, totalCustomers, newCustomers, recentRows] = await Promise.all([
    Order.countDocuments({ status: "Hazırlanıyor", createdAt: { $lt: delayedBefore } }),
    Order.countDocuments({ status: "Hazırlanıyor" }),
    Order.countDocuments({ status: { $in: ACTIVE_ORDER_STATUSES } }),
    safeCount(Product, { isHidden: { $ne: true }, $or: [{ image: "" }, { image: null }, { image: { $exists: false } }] }),
    safeCount(Product, { isHidden: { $ne: true }, isOutOfStock: true }),
    safeCount(SupportRequest, { status: "waiting" }),
    safeCount(User, {}),
    range.start ? safeCount(User, rangeMatch(range)) : Promise.resolve(null),
    Order.find({}).select("user totalAmount status createdAt deliveryPoint deliveryPointName paymentMethod products").populate("user", "name avatar").sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  const statusCounts = Object.fromEntries((facet?.byStatus || []).map((row) => [row._id, row.count]));
  return {
    period: range.period,
    range: { start: range.start ? range.start.toISOString() : null, end: range.end ? range.end.toISOString() : null, bucket: range.bucket },
    generatedAt: now.toISOString(),
    totals: current,
    previous,
    delta: previous ? {
      orders: pct(current.orders, previous.orders),
      revenue: pct(current.revenue, previous.revenue),
      averageBasket: pct(current.averageBasket, previous.averageBasket),
      cancelRate: previous.orders ? round2(current.cancelRate - previous.cancelRate) : null,
    } : null,
    statusDistribution: ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"].map((status) => ({ status, count: statusCounts[status] || 0 })),
    dormDistribution: (facet?.byDorm || []).map((row) => ({ deliveryPoint: row._id || "unknown", orders: row.orders, revenue: round2(row.revenue) })),
    series: fillSeries(facet?.series || [], range, range.bucket, now),
    topProducts: (facet?.topProducts || []).map((row) => ({ productId: typeof row._id === "object" && row._id ? String(row._id) : null, name: row.name || "Bilinmeyen Ürün", quantity: row.quantity, revenue: round2(row.revenue) })),
    manualRevenue: round2(facet?.manual?.[0]?.revenue),
    customers: { total: totalCustomers, new: newCustomers },
    attention: { delayedOrders, preparingOrders, activeOrders, productsWithoutImage, productsOutOfStock, waitingSupport },
    recentOrders: recentRows.map((order) => ({
      orderId: String(order._id),
      customerName: order.user?.name || "Müşteri",
      customerAvatar: order.user?.avatar || null,
      paymentMethod: order.paymentMethod || null,
      paymentMethodLabel: paymentMethodLabel(order.paymentMethod),
      totalAmount: order.totalAmount,
      status: order.status,
      itemCount: Array.isArray(order.products) ? order.products.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0,
      deliveryPoint: order.deliveryPoint,
      deliveryPointName: order.deliveryPointName || "",
      createdAt: order.createdAt,
    })),
  };
};

// GET /orders-analytics/summary?period=today|7d|30d|month|all  (custom: &from=ISO&to=ISO)
export const getDashboardSummary = async (req, res) => {
  try {
    const summary = await computeDashboardSummary(req.query);
    res.set("Cache-Control", "no-store");
    res.json({ summary });
  } catch (error) {
    console.error("Pano özeti hesaplanırken hata:", error.message);
    res.status(500).json({ message: "Pano özeti hesaplanamadı", error: error.message });
  }
};
