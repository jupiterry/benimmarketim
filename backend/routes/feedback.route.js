import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  createFeedback,
  getAllFeedbacks,
  updateFeedbackStatus,
  getFeedbackStats,
  deleteFeedback,
  getUserFeedbacks,
} from "../controllers/feedback.controller.js";

const router = express.Router();

// Kullanıcı rotaları
router.post("/", protectRoute, createFeedback);
router.get("/user", protectRoute, getUserFeedbacks);

// Admin rotaları
router.get("/", protectRoute, adminRoute, getAllFeedbacks);
router.get("/stats", protectRoute, adminRoute, getFeedbackStats);
router.patch("/:id/status", protectRoute, adminRoute, updateFeedbackStatus);
router.delete("/:id", protectRoute, adminRoute, deleteFeedback);

export default router; 
