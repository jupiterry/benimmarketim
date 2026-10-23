import express from "express";
import AdminAudit from "../models/adminAudit.model.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import {
  getOrderAnalyticsData,
  getDailyOrdersData,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  updateDeliveryTracking,
  getUserOrders,
  cancelOrder,
  addCustomItemToOrder,
  deleteOrder,
  removeItemFromOrder,
  updateItemQuantity,
  addProductToOrder,
  toggleManualFlag,
  getDashboardSummary,
  confirmCallback,
  markDeliveryFailed,
  assignCourier,
  normalizeOrderSearch,
  hasSearchableTerm,
  INVALID_ORDER_ID_MESSAGE,
  SEARCH_TOO_SHORT_MESSAGE,
} from "../controllers/ordersAnalytics.controller.js";

const router = express.Router();

// Admin paneli için sipariş analitikleri
// Sorgu parametreleri (hepsi isteğe bağlı; hiçbiri yoksa eskisi gibi tüm siparişler döner)
const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
export const parseOrderListQuery = (query = {}) => {
  const days = Number.parseInt(query.days, 10);
  const limit = Number.parseInt(query.limit, 10);
  const since = parseDate(query.since) || (Number.isFinite(days) && days > 0
    ? new Date(Date.now() - Math.min(days, 3650) * 24 * 60 * 60 * 1000)
    : null);
  return {
    since,
    before: parseDate(query.before),
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : null,
    active: query.active === "1" || query.active === "true",
    updatedSince: parseDate(query.updatedSince),
  };
};

export const MAX_ORDER_IDS = 50;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
// "a,b" ya da ["a", "b,c"] → ["a", "b", "c"]
const listParam = (value) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * parseOrderListQuery'nin 5 anahtarına dokunmadan yeni parametreler (eski/kapsamlı ayrımı değişmez):
 *  - include=customerStats → her müşteri grubuna user.stats
 *  - ids=a,b (≤50, 24 haneli; parametre var ama hiçbiri geçerli değil → invalidIds)
 *  - q=metin (kırpılır, ≤60, baştaki # atılır; 2 harf/rakamdan azsa → invalidQuery)
 */
export const parseOrderListExtras = (query = {}) => {
  const includeCustomerStats = listParam(query.include).includes("customerStats");

  let ids = null;
  let invalidIds = false;
  if (query.ids !== undefined) {
    const seen = new Set();
    const valid = [];
    for (const id of listParam(query.ids)) {
      const key = id.toLowerCase();
      if (!OBJECT_ID.test(id) || seen.has(key)) continue;
      seen.add(key);
      valid.push(key);
      if (valid.length >= MAX_ORDER_IDS) break;
    }
    if (valid.length) ids = valid;
    else invalidIds = true;
  }

  let q = null;
  let invalidQuery = false;
  if (query.q !== undefined) {
    const raw = Array.isArray(query.q) ? query.q[0] : query.q;
    if (typeof raw !== "string") invalidQuery = true;
    else if (raw.trim()) {
      const text = normalizeOrderSearch(raw);
      if (hasSearchableTerm(text)) q = text;
      else invalidQuery = true;
    }
  }

  return { ids, invalidIds, q, invalidQuery, includeCustomerStats };
};

/** GET /api/orders-analytics — öncelik: ids > q > updatedSince > pencere (since/before/limit/active) */
export const getOrdersList = async (req, res) => {
  try {
    const options = parseOrderListQuery(req.query);
    const extras = parseOrderListExtras(req.query);
    if (extras.invalidIds) return res.status(400).json({ message: INVALID_ORDER_ID_MESSAGE });
    if (extras.invalidQuery) return res.status(400).json({ message: SEARCH_TOO_SHORT_MESSAGE });

    const scoped = Object.values(options).some(Boolean) || Boolean(extras.ids || extras.q);
    const orderAnalyticsData = await getOrderAnalyticsData({
      ...options,
      ids: extras.ids,
      q: extras.q,
      includeCustomerStats: extras.includeCustomerStats,
    });

    // Sipariş ekranı ve rozetler 7 günlük özeti kullanmıyor; yalnızca eski (filtresiz) çağrıda hesaplanır
    if (scoped) return res.json({ orderAnalyticsData });

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const dailyOrdersData = await getDailyOrdersData(startDate, endDate);

    res.json({
      orderAnalyticsData,
      dailyOrdersData,
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Sipariş analitikleri alınırken hata:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

router.get("/", protectRoute, adminRoute, getOrdersList);

// Genel bakış ekranı özeti: sunucuda hesaplanır, tüm geçmiş istemciye gitmez
// ?period=today|7d|30d|month|all ya da period=custom&from=ISO&to=ISO
router.get("/summary", protectRoute, adminRoute, getDashboardSummary);

// İşlem kayıtları: ?category=product&q=süt&target=<ürünId>&actor=<id>&before=<ISO>&limit=50
export const buildAuditQuery = (query = {}) => {
  const filter = {};
  const categories = ["product", "campaign", "order", "customer", "settings", "system", "other"];
  if (categories.includes(query.category)) filter.category = query.category;
  if (typeof query.target === "string" && query.target.trim()) filter.target = query.target.trim().slice(0, 200);
  if (typeof query.actor === "string" && /^[0-9a-f]{24}$/i.test(query.actor)) filter.actor = query.actor;
  const before = query.before ? new Date(query.before) : null;
  if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
  if (q) {
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ action: pattern }, { targetName: pattern }, { target: pattern }, { "changes.from": pattern }, { "changes.to": pattern }];
  }
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  return { filter, limit };
};

router.get("/audit", protectRoute, adminRoute, async (req, res) => {
  try {
    const { filter, limit } = buildAuditQuery(req.query);
    const rows = await AdminAudit.find(filter).sort({ createdAt: -1 }).limit(limit + 1).populate("actor", "name email").lean();
    const hasMore = rows.length > limit;
    res.json({ entries: rows.slice(0, limit), hasMore });
  } catch (error) {
    console.error("İşlem kayıtları alınamadı:", error.message);
    res.status(500).json({ message: "İşlem kayıtları alınamadı" });
  }
});
// Admin sipariş durumu güncelleme (tekli/toplu) ve teslimat notu
router.put("/update-status", protectRoute, adminRoute, auditAdminAction("Sipariş durumu", req => String(req.body.orderId)), updateOrderStatus);
router.put("/bulk-status", protectRoute, adminRoute, auditAdminAction("Toplu sipariş durumu", req => `${req.body.orderIds?.length || 0} sipariş`), bulkUpdateOrderStatus);
router.put("/delivery-tracking", protectRoute, adminRoute, auditAdminAction("Teslimat takibi", req => String(req.body.orderId)), updateDeliveryTracking);
// Teslimat operasyonu: ilk sipariş teyidi, teslim edilemedi (durum İptal Edildi olur), kurye ataması (tekli/toplu)
router.put("/confirm-callback", protectRoute, adminRoute, auditAdminAction("Telefon teyidi", req => String(req.body.orderId)), confirmCallback);
router.put("/delivery-failed", protectRoute, adminRoute, auditAdminAction("Teslim edilemedi", req => String(req.body.orderId)), markDeliveryFailed);
router.put("/assign-courier", protectRoute, adminRoute, auditAdminAction("Kurye ataması", req => `${req.body.orderIds?.length || 0} sipariş`), assignCourier);

// Kullanıcının kendi siparişlerini alması için endpoint
router.get("/user-orders", protectRoute, getUserOrders);

// Sipariş iptal etme endpoint'i
router.put("/cancel-order", protectRoute, cancelOrder);

// Siparişe özel ürün ekleme endpoint'i
router.put("/add-item", protectRoute, adminRoute, addCustomItemToOrder);

// Admin sipariş silme endpoint'i
router.delete("/delete-order/:orderId", protectRoute, adminRoute, deleteOrder);

// Siparişten ürün silme endpoint'i
router.delete("/remove-item", protectRoute, adminRoute, removeItemFromOrder);

// Ürün miktarını güncelleme endpoint'i
router.put("/update-item-quantity", protectRoute, adminRoute, updateItemQuantity);

// Siparişe katalog ürünü ekleme endpoint'i
router.put("/add-product", protectRoute, adminRoute, addProductToOrder);

// Ürünün manuel işaretini değiştirme endpoint'i
router.put("/toggle-manual", protectRoute, adminRoute, toggleManualFlag);

export default router;
