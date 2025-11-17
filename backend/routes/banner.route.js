import express from "express";
import {
  getBanners,
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from "../controllers/banner.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public route - sadece aktif banner'lar
router.get("/", getBanners);

// Admin routes
router.get("/admin", protectRoute, adminRoute, getAllBanners);
router.post("/", protectRoute, adminRoute, createBanner);
router.put("/:id", protectRoute, adminRoute, updateBanner);
router.delete("/:id", protectRoute, adminRoute, deleteBanner);

export default router;

