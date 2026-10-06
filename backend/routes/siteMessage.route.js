import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { siteMessageRateLimit } from "../middleware/siteMessageRateLimit.js";
import { createSiteMessage, listSiteMessages, updateSiteMessageStatus } from "../controllers/siteMessage.controller.js";

const router = express.Router();
// Express 4 async hatalarını kendisi yakalamadığı için sarmalayıcı
const safe = (handler) => (req, res) => handler(req, res).catch((error) => {
  console.error("Site mesajı isteği hatası:", error.message);
  if (!res.headersSent) res.status(500).json({ success: false, message: "Sunucu hatası" });
});

router.post("/", siteMessageRateLimit, safe(createSiteMessage));
router.get("/", protectRoute, adminRoute, safe(listSiteMessages));
router.patch("/:id", protectRoute, adminRoute, auditAdminAction("Site mesajı durumu", (req) => String(req.params.id)), safe(updateSiteMessageStatus));

export default router;
