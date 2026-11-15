import express from "express";
import { auditAdminAction } from "../middleware/adminAudit.js";
import Product from "../models/product.model.js";
import { adminRoute, optionalAuth, protectRoute } from "../middleware/auth.middleware.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { invalidateProductCaches } from "../services/productCache.service.js";
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
  updateProductDiscount,
  updateProductImage,
  removeProductDiscount,
  bulkDeleteProducts,
  bulkUpdateVisibility,
  bulkUpdatePrice,
  getSimilarProducts,
  getProductById,
  setProductState,
  bulkSetProductState,
  getProductSalesStats,
} from "../controllers/product.controller.js"; // Tüm kontrolörleri import et
import { bulkUploadProducts, handleCsvUpload } from "../controllers/productImport.controller.js";

const router = express.Router();

// Ürünü değiştiren her başarılı istekten sonra (fiyat, indirim, görünürlük, stok, toplu işlemler,
// CSV yükleme, sıralama...) ürün önbellekleri bu ve diğer sunucu süreçlerinde temizlenir; ana
// sayfa rafları ve listeler eski fiyatı göstermez.
router.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    res.on("finish", () => {
      if (res.statusCode < 400) invalidateProductCaches();
    });
  }
  next();
});
// CSV ile toplu ürün yükleme: yalnızca .csv, en fazla 5 MB; satır satır doğrulanır (productImport.controller)
router.post("/bulk-upload", protectRoute, adminRoute, handleCsvUpload, bulkUploadProducts);

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
    recordAdminAction(req, { action: "Vitrin sırası değiştirildi", category: "product", target: `${productIds.length} ürün`, targetName: "Ürün sıralaması" });

    console.log("Sıralama güncellendi, productIds:", productIds);
    res.json({ message: "Sıralama başarıyla güncellendi" });
  } catch (error) {
    console.error("Sıralama güncelleme hatası:", error);
    res.status(500).json({ message: "Sıralama güncellenirken hata oluştu" });
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
// Ürün başına son 7/30 gün satış adedi (panel ürün listesi)
router.get("/sales-stats", protectRoute, adminRoute, getProductSalesStats);
router.get("/:id/similar", getSimilarProducts); // Similar products endpoint
router.get("/:id", getProductById);
router.post("/", protectRoute, adminRoute, createProduct);
router.put("/update-price/:id", protectRoute, adminRoute, auditAdminAction("Fiyat değişikliği", req => req.params.id), updateProductPrice);
router.patch("/toggle-hidden/:id", protectRoute, adminRoute, toggleHiddenProduct);
router.patch("/toggle-out-of-stock/:id", protectRoute, adminRoute, toggleOutOfStock);
// Durumu "şuna ayarla" (idempotent): { isOutOfStock?, isHidden?, isFeatured? }. Eski toggle uçları da çalışır.
router.patch("/:id/state", protectRoute, adminRoute, setProductState);
router.patch("/:id", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);
router.put("/:id", protectRoute, adminRoute, auditAdminAction("Ürün değişikliği", req => req.params.id), updateProduct); // Ürün güncelleme endpoint'i

// Toplu İşlem Route'ları
router.post("/bulk-delete", protectRoute, adminRoute, bulkDeleteProducts);
router.post("/bulk-visibility", protectRoute, adminRoute, bulkUpdateVisibility);
router.post("/bulk-state", protectRoute, adminRoute, bulkSetProductState);
router.post("/bulk-price-update", protectRoute, adminRoute, auditAdminAction("Toplu fiyat değişikliği", "Ürünler"), bulkUpdatePrice);

export default router;
