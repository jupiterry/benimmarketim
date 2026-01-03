import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
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
router.put("/update-status", protectRoute, adminRoute, updateOrderStatus);

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