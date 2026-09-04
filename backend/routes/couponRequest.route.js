import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { getActiveCouponRequest, requestCoupon, getCouponRequestsAdmin, saveCouponRequestCampaign } from "../controllers/couponRequest.controller.js";
const router = express.Router();
router.get("/active", protectRoute, getActiveCouponRequest);
router.post("/active/request", protectRoute, requestCoupon);
router.get("/admin", protectRoute, adminRoute, getCouponRequestsAdmin);
router.post("/admin", protectRoute, adminRoute, saveCouponRequestCampaign);
export default router;
