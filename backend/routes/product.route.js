import express from "express";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import Product from "../models/product.model.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
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
} from "../controllers/product.controller.js"; // Tüm kontrolörleri import et

const router = express.Router();
const upload = multer({ dest: "uploads/" }); // Dosyaları "uploads" klasörüne kaydet



// Sadece "Bilinmeyen" markalı ürünlere brand ekleyen endpoint
router.get("/update-brands", async (req, res) => {
  try {
    // Sadece markası "Bilinmeyen" olan ürünleri bul
    const products = await Product.find({ brand: "Bilinmeyen" });

    const updatedProducts = await Promise.all(
      products.map(async (product) => {
        // Ürün isminin ilk kelimesini al
        let firstWord = product.name.split(" ")[0];
        
        // Özel düzeltme gerektiren bir marka mı kontrol et
        let brand = brandCorrections[firstWord] || firstWord;

        // Markayı güncelle
        product.brand = brand;
        await product.save();
        return product;
      })
    );

    res.status(200).json({
      message: `${updatedProducts.length} adet "Bilinmeyen" markalı ürün güncellendi!`,
      updatedProducts,
    });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ message: "Bir hata oluştu", error });
  }
});

// Kategoriye göre markaları getiren endpoint
router.get("/brands/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const products = await Product.find({ category }, { brand: 1, _id: 0 });
    
    // Markaları normalize et ve filtrele
    const brands = products
      .map(product => {
        // Önce marka ismini normalize et (varsa düzeltmeyi kullan)
        const normalizedBrand = brandNormalizations[product.brand] || product.brand;
        return normalizedBrand;
      })
      .filter(brand => 
        brand && // boş değerleri filtrele
        !excludedBrands.includes(brand) // istenmeyen markaları filtrele
      );

    // Benzersiz markaları al
    const uniqueBrands = [...new Set(brands)].sort();
    
    res.status(200).json({
      message: `${category} kategorisindeki markalar getirildi`,
      brands: uniqueBrands,
    });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ message: "Bir hata oluştu", error });
  }
});

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

// Marka isimlerini düzeltmek için endpoint
router.get("/normalize-brands", protectRoute, adminRoute, async (req, res) => {
  try {
    const products = await Product.find();
    
    const updatedProducts = await Promise.all(
      products.map(async (product) => {
        // Marka ismini normalize et
        const normalizedBrand = brandNormalizations[product.brand];
        
        if (normalizedBrand) {
          product.brand = normalizedBrand;
          await product.save();
        }
        
        return product;
      })
    );

    res.status(200).json({
      message: "Marka isimleri normalize edildi",
      updatedProducts,
    });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ message: "Bir hata oluştu", error });
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
router.patch("/:id/discount", protectRoute, adminRoute, updateProductDiscount);
router.patch("/:id/image", protectRoute, adminRoute, updateProductImage);
router.delete("/:id/discount", protectRoute, adminRoute, removeProductDiscount);

// Mevcut rotalar
router.get("/", getProducts); // Admin için tüm ürünleri getir
router.get("/featured", getFeaturedProducts);
router.get("/recommendations", getRecommendedProducts);
router.post("/", protectRoute, adminRoute, createProduct);
router.patch("/:id", protectRoute, adminRoute, toggleFeaturedProduct);
router.delete("/:id", protectRoute, adminRoute, deleteProduct);
router.put("/update-price/:id", protectRoute, adminRoute, updateProductPrice);
router.put("/:id", protectRoute, adminRoute, updateProduct); // Ürün güncelleme endpoint'i
router.get("/search", searchProducts);
router.patch("/toggle-hidden/:id", protectRoute, adminRoute, toggleHiddenProduct);
router.patch("/toggle-out-of-stock/:id", protectRoute, adminRoute, toggleOutOfStock);
router.get('/export-csv', protectRoute, adminRoute, exportProductsToCSV);
router.get('/detect-brands', protectRoute, adminRoute, detectProductBrands);

// Toplu İşlem Route'ları
router.post("/bulk-delete", protectRoute, adminRoute, bulkDeleteProducts);
router.post("/bulk-visibility", protectRoute, adminRoute, bulkUpdateVisibility);
router.post("/bulk-price-update", protectRoute, adminRoute, bulkUpdatePrice);
router.post("/bulk-flash-sale", protectRoute, adminRoute, bulkAddFlashSale);

export default router;