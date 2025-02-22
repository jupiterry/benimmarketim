import express from "express";
import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getFeaturedProducts,
  getProducts,
  getRecommendedProducts,
  toggleFeaturedProduct,
  updateProductPrice,
  searchProducts, // 🔥 Yeni eklenen fonksiyon
} from "../controllers/product.controller.js";

import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/featured", getFeaturedProducts);
router.get("/recommendations", getRecommendedProducts);
router.post("/", protectRoute, adminRoute, createProduct);
router.patch("/:id", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);
router.put("/update-price/:id", protectRoute, adminRoute, updateProductPrice);

// 🔥 Yeni Arama Endpoint'i
router.get("/search", searchProducts);
router.get("/search", async (req, res) => {
	const { q } = req.query;
	try {
	  const products = await Product.find({
		$or: [
		  { name: { $regex: q, $options: "i" } },
		  { description: { $regex: q, $options: "i" } },
		],
	  });
	  res.status(200).json({ success: true, products });
	} catch (error) {
	  res.status(500).json({ success: false, message: "Arama işlemi sırasında hata oluştu" });
	}
  });

export default router;