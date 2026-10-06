import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { deleteSavedCart, listSavedCarts, saveSavedCart } from "../controllers/savedCart.controller.js";

const router = express.Router();
// Express 4 async hatalarını kendisi yakalamadığı için sarmalayıcı
const safe = (handler) => (req, res) => handler(req, res).catch((error) => {
  console.error("Favori sepet isteği hatası:", error.message);
  if (!res.headersSent) res.status(500).json({ success: false, message: "İşlem şu anda yapılamadı. Lütfen tekrar deneyin." });
});

// Favori sepetler: yalnızca giriş yapmış müşterinin kendi kayıtları
router.get("/", protectRoute, safe(listSavedCarts));
router.post("/", protectRoute, safe(saveSavedCart));
router.delete("/:id", protectRoute, safe(deleteSavedCart));

export default router;
