import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { getCampaignOverview, getCampaignPerformance } from "../controllers/campaignCenter.controller.js";

// Kampanya merkezi (yalnızca yönetici): yayındaki ve planlı kampanyalar, flaş indirim ve haftalık fırsat getirisi.
const router = express.Router();
router.use(protectRoute, adminRoute);

// ?type=flash|weekly&ids=<virgülle, en fazla 100> → { success, items: { "<id>": { units, orders, revenue, discount, from, to, inferredLines } } }
router.get("/performance", getCampaignPerformance);
// Yayındaki ve 14 gün içinde planlı kampanyalar, dikkat gerektirenler, son 7/30 gün getirisi
router.get("/overview", getCampaignOverview);

export default router;
