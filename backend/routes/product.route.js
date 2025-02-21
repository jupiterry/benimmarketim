import express from "express";
import {
	createProduct,
	deleteProduct,
	getAllProducts,
	getFeaturedProducts,
	getProducts,
	getRecommendedProducts,
	toggleFeaturedProduct,
    updateProductPrice,  // 🔥 Yeni eklenen fonksiyon
} from "../controllers/product.controller.js";

import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/featured", getFeaturedProducts);
router.get("/recommendations", getRecommendedProducts);
router.post("/", protectRoute, adminRoute, createProduct);
router.patch("/:id", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);

// 🔥 **Yeni Route: Ürün Fiyatını Güncelleme**
router.put("/update-price/:id", protectRoute, adminRoute, updateProductPrice);

export default router;
