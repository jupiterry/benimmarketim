import express from "express";
import {
  getLatestVersion,
  updateVersion,
} from "../controllers/appVersion.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public endpoint - Token gerektirmez
router.get("/version", getLatestVersion);

// Admin endpoint - Token ve Admin yetkisi gerektirir
router.post("/version", protectRoute, adminRoute, updateVersion);

export default router;

