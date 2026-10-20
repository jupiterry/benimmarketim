import express from "express";
import { auditAdminAction } from "../middleware/adminAudit.js";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import Product from "../models/product.model.js";
import { adminRoute, optionalAuth, protectRoute } from "../middleware/auth.middleware.js";
import { getHomeFeed, getPersonalizedProducts, getPopularProducts, getShelfPerformance } from "../controllers/recommendation.controller.js";
import {
  createProduct,
  deleteProduct,
  toggleOutOfStock,
  getFeaturedProducts,
  getProducts,
  getRecommendedProducts,
  toggleFeaturedProduct,
  updateProductPrice,
  updateProduct,
  searchProducts,
  toggleHiddenProduct,
  exportProductsToCSV,
  detectProductBrands,
  updateProductDiscount,
  updateProductImage,
  removeProductDiscount,
  bulkDeleteProducts,
  bulkUpdateVisibility,
  bulkUpdatePrice,
  bulkAddFlashSale,
  getSimilarProducts,
  bulkReplaceText,
  getProductById,
} from "../controllers/product.controller.js"; // Tüm kontrolörleri import et

const router = express.Router();
// CSV toplu yükleme: yalnızca .csv, en fazla 5 MB; dosyalar "uploads" klasörüne geçici yazılır
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isCsv = /\.csv$/i.test(file.originalname || "") ||
      ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"].includes(file.mimetype);
    if (!isCsv) return cb(new Error("Yalnızca CSV dosyası yüklenebilir"));
    cb(null, true);
  },
});
const handleCsvUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.code === "LIMIT_FILE_SIZE" ? "CSV dosyası en fazla 5 MB olabilir" : error.message,
      });
    }
    next();
  });
};

// Toplu ürün yükleme endpoint'i
router.post(
  "/bulk-upload",
  protectRoute,
  adminRoute,
  handleCsvUpload,
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

// Ürün sıralamasını güncelleyen yeni rota
router.post("/reorder", protectRoute, adminRoute, async (req, res) => {
  const { productIds } = req.body;

  try {
    // Tüm ürünleri tek bir bulk operation ile güncelle
    const bulkOps = productIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));

    // Tüm order değerlerini toplu şekilde güncelle
    await Product.bulkWrite(bulkOps);

    console.log("Sıralama güncellendi, productIds:", productIds);
    res.json({ message: "Sıralama başarıyla güncellendi" });
  } catch (error) {
    console.error("Sıralama güncelleme hatası:", error);
    res.status(500).json({ message: "Sıralama güncellenirken hata oluştu" });
  }
});

// İndirim fiyatı güncelleme endpoint'i
router.put("/update-discount/:id", protectRoute, adminRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { discountedPrice } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    // İndirim fiyatı normal fiyattan yüksek olamaz
    if (discountedPrice && discountedPrice >= product.price) {
      return res.status(400).json({ message: "İndirim fiyatı normal fiyattan yüksek olamaz" });
    }

    product.discountedPrice = discountedPrice;
    await product.save();

    res.json({ message: "İndirim fiyatı güncellendi", product });
  } catch (error) {
    console.error("İndirim fiyatı güncelleme hatası:", error);
    res.status(500).json({ message: "İndirim fiyatı güncellenirken hata oluştu" });
  }
});

// İndirim işlemleri için yeni route'lar
router.patch("/:id/discount", protectRoute, adminRoute, auditAdminAction("İndirim değişikliği", req => req.params.id), updateProductDiscount);
router.patch("/:id/image", protectRoute, adminRoute, updateProductImage);
router.delete("/:id/discount", protectRoute, adminRoute, auditAdminAction("İndirim kaldırma", req => req.params.id), removeProductDiscount);

// Mevcut rotalar
// Ürün listesi: yönetici isteğinde (geçerli token) gizli ürünler de döner, misafir/müşteride dönmez
router.get("/", optionalAuth, getProducts);
router.get("/featured", getFeaturedProducts);
router.get("/recommendations", getRecommendedProducts);
router.get("/personalized", protectRoute, getPersonalizedProducts);
// Ana sayfa rafları: token varsa kişisel, yoksa misafir (geçersiz token 401 değil, misafir)
router.get("/home-feed", optionalAuth, getHomeFeed);
router.get("/popular", getPopularProducts);
router.get("/shelf-performance", protectRoute, adminRoute, getShelfPerformance);
// Static routes must precede the dynamic /:id route.
router.get("/search", searchProducts);
router.get('/export-csv', protectRoute, adminRoute, exportProductsToCSV);
router.get('/detect-brands', protectRoute, adminRoute, detectProductBrands);
router.get("/:id/similar", getSimilarProducts); // Similar products endpoint
router.get("/:id", getProductById);
router.post("/", protectRoute, adminRoute, createProduct);
router.put("/update-price/:id", protectRoute, adminRoute, auditAdminAction("Fiyat değişikliği", req => req.params.id), updateProductPrice);
router.patch("/toggle-hidden/:id", protectRoute, adminRoute, toggleHiddenProduct);
router.patch("/toggle-out-of-stock/:id", protectRoute, adminRoute, toggleOutOfStock);
router.patch("/:id", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);
router.put("/:id", protectRoute, adminRoute, auditAdminAction("Ürün değişikliği", req => req.params.id), updateProduct); // Ürün güncelleme endpoint'i

// Toplu İşlem Route'ları
router.post("/bulk-delete", protectRoute, adminRoute, bulkDeleteProducts);
router.post("/bulk-visibility", protectRoute, adminRoute, bulkUpdateVisibility);
router.post("/bulk-price-update", protectRoute, adminRoute, auditAdminAction("Toplu fiyat değişikliği", "Ürünler"), bulkUpdatePrice);
router.post("/bulk-flash-sale", protectRoute, adminRoute, bulkAddFlashSale);
router.post("/bulk-replace-text", protectRoute, adminRoute, bulkReplaceText);

export default router;
