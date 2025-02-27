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
  updateProduct,
  searchProducts,
} from "../controllers/product.controller.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" }); // Dosyaları "uploads" klasörüne kaydet

// Toplu ürün yükleme endpoint'i
router.post(
  "/bulk-upload",
  protectRoute,
  adminRoute,
  upload.single("file"),
  async (req, res) => {
    console.log("Bulk upload isteği alındı");
    if (!req.file) {
      console.log("Dosya eksik");
      return res.status(400).json({ message: "Lütfen bir dosya yükleyin." });
    }

    console.log("Dosya yüklendi:", req.file);
    const results = [];

    try {
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on("data", (data) => {
            console.log("Ham CSV satırı:", data); // CSV'den gelen ham veriyi logla
            const parsedData = {
              name: data.name || "",
              description: data.description || "",
              price: parseFloat(data.price) || 0, // Sayıya çevir, hata olursa 0
              category: data.category || "",
              image: data.image || "",
            };
            console.log("İşlenmiş satır:", parsedData); // İşlenmiş veriyi logla
            results.push(parsedData);
          })
          .on("end", () => {
            console.log("Toplam satır sayısı:", results.length);
            resolve();
          })
          .on("error", (err) => {
            console.error("CSV parsing hatası:", err);
            reject(err);
          });
      });

      if (results.length === 0) {
        return res.status(400).json({ message: "CSV dosyasında veri bulunamadı." });
      }

      const validResults = results.filter(
        (item) => item.name && !isNaN(item.price) && item.category
      );
      console.log("Geçerli satırlar:", validResults);

      if (validResults.length === 0) {
        return res.status(400).json({ message: "Geçerli ürün verisi bulunamadı." });
      }

      await Product.insertMany(validResults);
      res.status(200).json({ message: "Ürünler başarıyla yüklendi!" });
    } catch (error) {
      console.error("Hata detayları:", error.stack); // Tam hata yığınını logla
      res.status(500).json({ message: "Ürünler yüklenirken hata oluştu.", error: error.message });
    } finally {
      try {
        fs.unlinkSync(req.file.path);
        console.log("Dosya silindi:", req.file.path);
      } catch (unlinkError) {
        console.error("Dosya silme hatası:", unlinkError.message);
      }
    }
  }
);
router.get("/", getProducts);
router.get("/featured", getFeaturedProducts);
router.get("/recommendations", getRecommendedProducts);
router.post("/", protectRoute, adminRoute, createProduct);
router.patch("/:id", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);
router.put("/update-price/:id", protectRoute, adminRoute, updateProductPrice);
router.put("/:id", protectRoute, adminRoute, updateProduct); // Ürün güncelleme endpoint'i

// Arama endpoint'i (çakışmayı kaldırdım)
router.get("/search", searchProducts);


export default router;