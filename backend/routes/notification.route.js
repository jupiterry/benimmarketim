import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import {
  cancelScheduled, diagnosePush, generateBroadcastDraft, getAudienceCounts, getBroadcastLibrary, getBroadcastOverview, getBroadcastResultsBatch,
  getNotificationPreferences, scheduleBroadcast, sendBroadcast, sendScheduledNow, updateNotificationPreferences, updateScheduled,
} from "../controllers/notification.controller.js";

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
router.get("/broadcasts/library", protectRoute, adminRoute, safe(getBroadcastLibrary));
router.get("/broadcasts/audience-count", protectRoute, adminRoute, safe(getAudienceCounts));
router.get("/broadcasts/results", protectRoute, adminRoute, safe(getBroadcastResultsBatch));
// Denetim kaydının hedefi: kitle (+ bölge) ve planlıysa zamanı
const broadcastTarget = (req) => [req.body?.audience, req.body?.zone, req.body?.scheduledFor].filter((part) => typeof part === "string" && part).join(" · ").slice(0, 120);
router.post("/broadcasts", protectRoute, adminRoute, auditAdminAction("Toplu bildirim", broadcastTarget), safe(sendBroadcast));
// Planlı bildirimler
router.post("/broadcasts/scheduled", protectRoute, adminRoute, auditAdminAction("Bildirim planlandı", broadcastTarget), safe(scheduleBroadcast));
router.put("/broadcasts/scheduled/:id", protectRoute, adminRoute, auditAdminAction("Planlı bildirim düzenlendi", (req) => String(req.params.id)), safe(updateScheduled));
router.delete("/broadcasts/scheduled/:id", protectRoute, adminRoute, auditAdminAction("Planlı bildirim iptal edildi", (req) => String(req.params.id)), safe(cancelScheduled));
router.post("/broadcasts/scheduled/:id/send", protectRoute, adminRoute, auditAdminAction("Planlı bildirim şimdi gönderildi", (req) => String(req.params.id)), safe(sendScheduledNow));

export default router;
