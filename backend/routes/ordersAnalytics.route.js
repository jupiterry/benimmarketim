import express from "express";
import Order from "../models/order.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { notifyOrderStatusChange } from "../services/orderStatusNotifier.js";
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
router.get("/", protectRoute, adminRoute, async (req, res) => {
  try {
    const orderAnalyticsData = await getOrderAnalyticsData();

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
router.get("/audit", protectRoute, adminRoute, async (req, res) => {
  const entries = await AdminAudit.find().sort({ createdAt: -1 }).limit(100).populate("actor", "name email").lean();
  res.json({ entries });
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
