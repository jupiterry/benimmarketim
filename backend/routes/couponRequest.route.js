import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { trackAppStage } from "../services/appActivity.service.js";
import {
  getActiveCouponRequest,
  requestCoupon,
  getCouponRequestsAdmin,
  saveCouponRequestCampaign,
  deleteCouponRequestCampaign,
} from "../controllers/couponRequest.controller.js";
const router = express.Router();
// Uygulamada bu istek sepet ve sipariş ekranı açılırken yapılır
router.get("/active", protectRoute, trackAppStage("checkout"), getActiveCouponRequest);
router.post("/active/request", protectRoute, requestCoupon);
router.get("/admin", protectRoute, adminRoute, getCouponRequestsAdmin);
router.post("/admin", protectRoute, adminRoute, saveCouponRequestCampaign);
router.delete("/admin/:id", protectRoute, adminRoute, deleteCouponRequestCampaign);
export default router;
