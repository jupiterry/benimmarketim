import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { clearAdminFeedHandler, getAdminFeed } from "../controllers/adminFeed.controller.js";

// Yönetici paneli zil bildirimleri (sunucuda saklanır; her cihaz aynı listeyi görür)
const router = express.Router();

router.get("/", protectRoute, adminRoute, getAdminFeed);
router.post("/clear", protectRoute, adminRoute, clearAdminFeedHandler);

export default router;
