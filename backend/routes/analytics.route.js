import express from "express";
import { getAnalytics, getAnalyticsCompare } from "../controllers/analytics.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, adminRoute, getAnalytics);
// Dönem karşılaştırması ve kırılımlar (satış analizi ekranı)
router.get("/compare", protectRoute, adminRoute, getAnalyticsCompare);

export default router;
