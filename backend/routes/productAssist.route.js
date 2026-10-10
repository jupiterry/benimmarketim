import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { findImages, identifyPhoto, prepareImage } from "../controllers/productAssist.controller.js";

// Fotoğraftan ürün ekleme yardımcısı: yalnızca yönetici kullanır, ürün kaydetmez.
const router = express.Router();

router.post("/identify", protectRoute, adminRoute, identifyPhoto);
router.post("/images", protectRoute, adminRoute, findImages);
router.post("/prepare-image", protectRoute, adminRoute, prepareImage);

export default router;
