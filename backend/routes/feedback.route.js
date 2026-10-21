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
  compensateFeedback,
} from "../controllers/feedback.controller.js";
import { getOrderFeedbackPrompt, submitAbandonReason, submitNps, submitOrderFeedback, submitQuickFeedback } from "../controllers/orderFeedback.controller.js";
import { getSatisfactionReport } from "../controllers/feedbackReport.controller.js";

const router = express.Router();

// Kullanıcı rotaları
router.post("/", protectRoute, createFeedback);
router.get("/user", protectRoute, getUserFeedbacks);
// Sipariş sonrası deneyim anketi (mobil uygulama)
router.get("/prompt", protectRoute, getOrderFeedbackPrompt);
router.post("/order", protectRoute, submitOrderFeedback);
router.post("/quick", protectRoute, submitQuickFeedback);
router.post("/nps", protectRoute, submitNps);
router.post("/abandon", protectRoute, submitAbandonReason);

// Admin rotaları
router.get("/", protectRoute, adminRoute, getAllFeedbacks);
router.get("/stats", protectRoute, adminRoute, getFeedbackStats);
router.get("/report", protectRoute, adminRoute, getSatisfactionReport);
router.patch("/:id/status", protectRoute, adminRoute, updateFeedbackStatus);
router.delete("/:id", protectRoute, adminRoute, deleteFeedback);
// Yönetici paneli ekleri: yanıt yazma ve bağlı sipariş özeti
router.patch("/:id/reply", protectRoute, adminRoute, replyToFeedback);
router.get("/:id/order", protectRoute, adminRoute, getFeedbackOrder);
router.post("/:id/compensate", protectRoute, adminRoute, compensateFeedback);

export default router; 
