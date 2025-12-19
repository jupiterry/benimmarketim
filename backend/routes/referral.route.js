import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  getReferralInfo,
  checkReferralCode,
  regenerateReferralCode,
  getAllReferralStats
} from "../controllers/referral.controller.js";

const router = express.Router();

// Public routes
router.get("/check/:code", checkReferralCode);

// Protected routes (logged in users)
router.get("/my-referrals", protectRoute, getReferralInfo);
router.post("/regenerate", protectRoute, regenerateReferralCode);

// Admin routes
router.get("/stats", protectRoute, adminRoute, getAllReferralStats);

export default router;
