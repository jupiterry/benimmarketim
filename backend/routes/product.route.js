import express from "express";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import Product from "../models/product.model.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
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


const router = express.Router();
const upload = multer({ dest: "uploads/" }); // Dosyaları "uploads" klasörüne kaydet
// Toplu ürün yükleme endpoint'i
router.post("/bulk-upload", protectRoute, adminRoute, upload.single("file"), async (req, res) => {
  if (!req.file) {
      return res.status(400).json({ message: "Lütfen bir dosya yükleyin." });
  }

  console.log("Dosya yüklendi:", req.file); // Dosya bilgilerini logla

  const results = [];

  fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => {
          console.log("CSV Satırı:", data); // Her CSV satırını logla
          results.push(data);
      })
      .on("end", async () => {
          try {
              console.log("CSV Verileri:", results); // Tüm CSV verilerini logla
              await Product.insertMany(results);
              res.status(200).json({ message: "Ürünler başarıyla yüklendi!" });
          } catch (error) {
              console.error("Ürünler yüklenirken hata:", error);
              res.status(500).json({ message: "Ürünler yüklenirken hata oluştu.", error: error.message });
          } finally {
              fs.unlinkSync(req.file.path); // Dosyayı sunucudan sil
          }
      });
});

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