import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { aiRateLimit } from "../middleware/aiRateLimit.js";
import { suggestCart } from "../controllers/cartAssistant.controller.js";

const router = express.Router();

// Sepet asistanı (mobil uygulamadaki ayrı ekran). Canlı destek sohbetinden bağımsızdır.
router.post("/suggest", protectRoute, aiRateLimit, suggestCart);

export default router;
