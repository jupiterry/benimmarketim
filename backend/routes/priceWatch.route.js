import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { checkNow, getPriceWatch, updateWatch } from "../controllers/priceWatch.controller.js";

// Fiyat bekçisi: yalnızca yönetici kullanır. Fiyat değiştirme mevcut PUT /api/products/update-price/:id ile yapılır.
const router = express.Router();

router.get("/", protectRoute, adminRoute, getPriceWatch);
router.post("/:id/check", protectRoute, adminRoute, checkNow);
router.patch("/:id", protectRoute, adminRoute, updateWatch);

export default router;
