import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import {
    getOrderAnalyticsData,
    getDailyOrdersData,
    updateOrderStatus,
    getUserOrders,
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

// Kullanıcının kendi siparişlerini alması için yeni endpoint
router.get("/user-orders", protectRoute, getUserOrders);

export default router;
