import express from "express";
import Order from "../models/order.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { notifyOrderStatusChange } from "../services/orderStatusNotifier.js";
import { evaluateMissionsForUser } from "../services/mission.service.js";
import {
  getOrderAnalyticsData,
  getDailyOrdersData,
  updateOrderStatus,
  getUserOrders,
  cancelOrder,
  addCustomItemToOrder,
  deleteOrder,
  removeItemFromOrder,
  updateItemQuantity,
  addProductToOrder,
  toggleManualFlag,
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

router.get("/", protectRoute, adminRoute, async (req, res) => {
  try {
    const options = parseOrderListQuery(req.query);
    const scoped = Object.values(options).some(Boolean);
    const orderAnalyticsData = await getOrderAnalyticsData(options);

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
    console.error("Sipariş analitikleri alınırken hata:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Admin sipariş durumu güncelleme
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
router.put("/update-status", protectRoute, adminRoute, auditAdminAction("Sipariş durumu", req => String(req.body.orderId)), updateOrderStatus);
router.put("/bulk-status", protectRoute, adminRoute, auditAdminAction("Toplu sipariş durumu", req => `${req.body.orderIds?.length || 0} sipariş`), async (req, res) => {
  const { orderIds, status } = req.body;
  if (!Array.isArray(orderIds) || orderIds.length < 1 || orderIds.length > 100 || !["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"].includes(status)) return res.status(400).json({ message: "Geçersiz toplu işlem" });
  const orders = await Order.find({ _id: { $in: orderIds } });
  if (orders.length !== new Set(orderIds).size) return res.status(404).json({ message: "Bazı siparişler bulunamadı" });
  for (const order of orders) {
    const previousStatus = order.status;
    order.status = status;
    order.statusHistory.push({ status, changedAt: new Date(), changedBy: req.user._id });
    await order.save();
    notifyOrderStatusChange(order, previousStatus);
    if (status === "Teslim Edildi" && previousStatus !== status) evaluateMissionsForUser(order.user);
    req.app.get("io")?.to(`user_${order.user.toString()}`).to("adminRoom").emit("orderStatusUpdated", { orderId: order._id, newStatus: status, message: `Sipariş durumu güncellendi: ${status}` });
  }
  return res.json({ updated: orders.length });
});
router.put("/delivery-tracking", protectRoute, adminRoute, auditAdminAction("Teslimat takibi", req => String(req.body.orderId)), async (req, res) => {
  const { orderId, deliveryTracking } = req.body;
  if (typeof deliveryTracking !== "string" || deliveryTracking.length > 120) return res.status(400).json({ message: "Geçersiz teslimat bilgisi" });
  const order = await Order.findByIdAndUpdate(orderId, { deliveryTracking: deliveryTracking.trim() }, { new: true });
  if (!order) return res.status(404).json({ message: "Sipariş bulunamadı" });
  return res.json({ order });
});

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
