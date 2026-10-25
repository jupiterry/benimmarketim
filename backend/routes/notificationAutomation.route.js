import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { getSettings, getStats, previewType, testType, updateSettings } from "../controllers/notificationAutomation.controller.js";

// /api/notification-automations — yalnızca yönetici
const router = express.Router();
// Express 4 async hatalarını kendisi yakalamadığı için sarmalayıcı
const safe = (handler) => (req, res) => Promise.resolve(handler(req, res)).catch((error) => {
  console.error("Otomatik bildirim isteği hatası:", error.message);
  if (!res.headersSent) res.status(500).json({ success: false, message: "Sunucu hatası" });
});

router.use(protectRoute, adminRoute);
router.get("/settings", safe(getSettings));
router.put("/settings", safe(updateSettings));
router.get("/stats", safe(getStats));
router.post("/:type/preview", safe(previewType));
router.post("/:type/test", safe(testType));

export default router;
