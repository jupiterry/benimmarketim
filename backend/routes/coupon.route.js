import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { 
  getCoupon, 
  validateCoupon, 
  getAllCoupons,
  getActiveCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus
} from "../controllers/coupon.controller.js";

const router = express.Router();

// Public routes
router.get("/active", getActiveCoupons);

// Protected routes (logged in users)
router.get("/", protectRoute, getCoupon);
router.post("/validate", protectRoute, validateCoupon);

// Admin routes
router.get("/all", protectRoute, adminRoute, getAllCoupons);
router.post("/", protectRoute, adminRoute, createCoupon);
router.put("/:id", protectRoute, adminRoute, updateCoupon);
router.delete("/:id", protectRoute, adminRoute, deleteCoupon);
router.patch("/:id/toggle", protectRoute, adminRoute, toggleCouponStatus);

export default router;
