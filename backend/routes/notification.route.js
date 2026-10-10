import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { diagnosePush, generateBroadcastDraft, getBroadcastOverview, getNotificationPreferences, sendBroadcast, updateNotificationPreferences } from "../controllers/notification.controller.js";

const router = express.Router();
// Express 4 async hatalarını kendisi yakalamadığı için sarmalayıcı
const safe = (handler) => (req, res) => handler(req, res).catch((error) => {
  console.error("Bildirim isteği hatası:", error.message);
  if (!res.headersSent) res.status(500).json({ success: false, message: "Sunucu hatası" });
});

// Müşteri
router.get("/preferences", protectRoute, safe(getNotificationPreferences));
router.put("/preferences", protectRoute, safe(updateNotificationPreferences));

// Yönetici
router.get("/broadcasts", protectRoute, adminRoute, safe(getBroadcastOverview));
router.get("/broadcasts/diagnose", protectRoute, adminRoute, safe(diagnosePush));
router.post("/broadcasts/draft", protectRoute, adminRoute, safe(generateBroadcastDraft));
router.post("/broadcasts", protectRoute, adminRoute, auditAdminAction("Toplu bildirim", (req) => String(req.body?.audience || "")), safe(sendBroadcast));

export default router;
