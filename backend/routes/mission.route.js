import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { deleteMission, getActiveMissions, listMissionsAdmin, saveMission, toggleMission } from "../controllers/mission.controller.js";

const router = express.Router();
// Express 4 async hatalarını kendisi yakalamadığı için sarmalayıcı
const safe = (handler) => (req, res) => handler(req, res).catch((error) => {
  console.error("Görev isteği hatası:", error.message);
  if (!res.headersSent) res.status(500).json({ success: false, message: "Sunucu hatası" });
});

// Müşteri
router.get("/active", protectRoute, safe(getActiveMissions));

// Yönetici
router.get("/admin", protectRoute, adminRoute, safe(listMissionsAdmin));
router.post("/admin", protectRoute, adminRoute, auditAdminAction("Görev kaydı", (req) => String(req.body?.title || "")), safe(saveMission));
router.patch("/admin/:id", protectRoute, adminRoute, auditAdminAction("Görev yayını", (req) => String(req.params.id)), safe(toggleMission));
router.delete("/admin/:id", protectRoute, adminRoute, auditAdminAction("Görev silme", (req) => String(req.params.id)), safe(deleteMission));

export default router;
