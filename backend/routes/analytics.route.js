import express from "express";
import { getAnalytics, getHeatmapData, updateOrderStatus, getAnalyticsCompare } from "../controllers/analytics.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, adminRoute, getAnalytics);
router.get("/heatmap", protectRoute, adminRoute, getHeatmapData);
// Dönem karşılaştırması ve kırılımlar (satış analizi ekranı)
router.get("/compare", protectRoute, adminRoute, getAnalyticsCompare);
router.put("/update-order-status", protectRoute, adminRoute, updateOrderStatus);

export default router;
