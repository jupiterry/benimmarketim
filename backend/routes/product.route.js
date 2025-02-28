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
  toggleOutOfStock,
  getFeaturedProducts,
  getProducts,
  getRecommendedProducts,
  toggleFeaturedProduct,
  updateProductPrice,
  updateProduct,
  searchProducts,
  getProductsByCategory,
  toggleHiddenProduct,
} from "../controllers/product.controller.js"; // Tüm kontrolörleri import et

const router = express.Router();
const upload = multer({ dest: "uploads/" }); // Dosyaları "uploads" klasörüne kaydet

// Toplu ürün yükleme endpoint'i
router.post(
  "/bulk-upload",
  protectRoute,
  adminRoute,
  upload.single("file"),
  async (req, res) => {
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
          res
            .status(500)
            .json({ message: "Ürünler yüklenirken hata oluştu.", error: error.message });
        } finally {
          fs.unlinkSync(req.file.path); // Dosyayı sunucudan sil
        }
      });
  }
);


router.get("/", getProducts); // Admin için tüm ürünleri getir
router.get("/featured", getFeaturedProducts);
router.get("/recommendations", getRecommendedProducts);
router.post("/", protectRoute, adminRoute, createProduct);
router.patch("/:id", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);
router.put("/update-price/:id", protectRoute, adminRoute, updateProductPrice);
router.put("/:id", protectRoute, adminRoute, updateProduct); // Ürün güncelleme endpoint'i
router.get("/search", searchProducts);
router.get("/category/:category/:subcategory?", getProductsByCategory); // Kategoriye göre ürünler
router.patch("/toggle-hidden/:id", protectRoute, adminRoute, toggleHiddenProduct); // Ürün gizleme/gösterme
router.patch("/toggle-out-of-stock/:id", protectRoute, adminRoute, toggleOutOfStock);
export default router;