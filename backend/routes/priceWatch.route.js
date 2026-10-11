import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { auditAdminAction } from "../middleware/adminAudit.js";
import { checkNow, deleteCamgozKey, getCamgozConfig, getPriceWatch, updateCamgozConfig, updateWatch } from "../controllers/priceWatch.controller.js";

// Fiyat bekçisi: yalnızca yönetici kullanır. Fiyat değiştirme mevcut PUT /api/products/update-price/:id ile yapılır.
const router = express.Router();

router.get("/", protectRoute, adminRoute, getPriceWatch);
// Camgöz API anahtarı ve aylık kredi (anahtar hiçbir yanıtta dönmez, işlem kaydına yazılmaz)
router.get("/camgoz", protectRoute, adminRoute, getCamgozConfig);
router.put("/camgoz", protectRoute, adminRoute, auditAdminAction("Camgöz ayarı değişikliği", "price-watch/camgoz"), updateCamgozConfig);
router.delete("/camgoz", protectRoute, adminRoute, auditAdminAction("Camgöz panel anahtarı silme", "price-watch/camgoz"), deleteCamgozKey);
router.post("/:id/check", protectRoute, adminRoute, checkNow);
router.patch("/:id", protectRoute, adminRoute, updateWatch);

export default router;
