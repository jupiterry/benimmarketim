import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  createFeedback,
  getAllFeedbacks,
  updateFeedbackStatus,
  getFeedbackStats,
  deleteFeedback,
  getUserFeedbacks,
  replyToFeedback,
  getFeedbackOrder,
} from "../controllers/feedback.controller.js";
import { getOrderFeedbackPrompt, submitOrderFeedback } from "../controllers/orderFeedback.controller.js";

const router = express.Router();

// Kullanıcı rotaları
router.post("/", protectRoute, createFeedback);
router.get("/user", protectRoute, getUserFeedbacks);
// Sipariş sonrası deneyim anketi (mobil uygulama)
router.get("/prompt", protectRoute, getOrderFeedbackPrompt);
router.post("/order", protectRoute, submitOrderFeedback);

// Admin rotaları
router.get("/", protectRoute, adminRoute, getAllFeedbacks);
router.get("/stats", protectRoute, adminRoute, getFeedbackStats);
router.patch("/:id/status", protectRoute, adminRoute, updateFeedbackStatus);
router.delete("/:id", protectRoute, adminRoute, deleteFeedback);
// Yönetici paneli ekleri: yanıt yazma ve bağlı sipariş özeti
router.patch("/:id/reply", protectRoute, adminRoute, replyToFeedback);
router.get("/:id/order", protectRoute, adminRoute, getFeedbackOrder);

export default router; 
