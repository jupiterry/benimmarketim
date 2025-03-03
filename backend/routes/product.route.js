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


// Marka eşleştirme sözlüğü
const brandMapping = {
  "Albeni̇": "Ülker",
  "Carami̇o": "Ülker",
  "Coco": "Ülker",
  "Çokomi̇lk": "Ülker",
  "Çokonat": "Ülker",
  "Cocostar": "Ülker",
  "Alpella": "Ülker",
  "Di̇do": "Ülker",
  "Halley": "Ülker",
  "Hobby": "Ülker",
  "Lavi̇va": "Ülker",
  "Metro": "Ülker",
  "Pi̇ko": "Ülker",
  "Findik": "Ülker",
  "Çokokrem": "Ülker",
  "Kri̇spi̇": "Ülker", // Krispi Ülker markasına ait
  "Bi̇skrem": "Ülker",  
  "Canpare": "Ülker", 
  "Çokomel": "Ülker",
  "Çokoprens": "Ülker",
  "Hanimeller": "Ülker",
  "Haylayf": "Ülker",
  "Cicibebe": "Ülker",
  "Caramio": "Ülker",
  "İkram": "Ülker",
  "Kat": "Ülker",
  "Probi̇s": "Ülker",
  "Rondo": "Ülker",
  "Finger": "Ülker",
  "Sakliköy": "Ülker",
  "Dore": "Ülker",
  "Kakaolu": "Ülker",
  "Pöti̇bör": "Ülker",
  "Çi̇zi̇": "Ülker",
  "Çi̇zi̇vi̇ç": "Ülker",
  "Çi̇zi̇vi̇ç Peyni̇rli̇": "Ülker",
  "Çubuk": "Ülker",
  "Susamli": "Ülker",
  "Kri̇spi̇": "Ülker",
  "Taç": "Ülker",
  "Bebe": "Ülker",
  "9": "Ülker",
  "Altinbaşak": "Ülker",
  "Dankek": "Ülker",
  "Baton": "Ülker",
  "Kekstra": "Ülker",
  "O'Lala": "Ülker",
  "O’Lala": "Ülker",
  "8Kek": "Ülker",
  "Oneo": "Ülker",
  "Yıldız": "Ülker",
  "Bonbon": "Ülker",
  "Kremi̇ni̇": "Ülker",
  "Kremini": "Ülker",
  "Yupo": "Ülker",
  "Çi̇kolati̇n": "Ülker",
  "Buklet": "Ülker",
  "Toffe": "Ülker",
  "Dolgulu": "Ülker",
  "Lokumcuk": "Ülker",
  "Beylerbeyi̇": "Ülker",
  "Lalezar": "Ülker",
  "Select": "Ülker",
  "Kanky": "Ülker",
  "Okali̇ptus": "Ülker",
  "Ihlamur": "Ülker",
  "Zencefi̇l": "Ülker",
  "Kara": "Ülker",
  "Bi̇zi̇m": "Ülker",
  "Teremyağ": "Ülker",
  "Ankara": "Nuhun",
  "Nuhun": "Ankara",
  "Köri": "Indomie",
  "Dana": "Indomie",
  "Tavuk": "Indomie",
  "Sebzeli": "Indomie",
  "Soya": "Indomie",
  "Kavrulmuş": "Tadım",
  "Bol": "Tadım",
  "Johnsons": "Johnson",
  "Alpella": "Ülker",
  "Di̇do": "Ülker",
  "Halley": "Ülker",
  "Hobby": "Ülker",
  "Lavi̇va": "Ülker",
  "Çi̇zi̇vi̇ç Peyni̇rli̇": "Ülker",
  "Ece": "Ülker",
};


// Tüm ürünlere brand ekleyen endpoint
router.get("/update-brands", async (req, res) => {
  try {
    const products = await Product.find(); // Tüm ürünleri MongoDB'den çek

    const updatedProducts = await Promise.all(
      products.map(async (product) => {
        let brand = ""; // Varsayılan boş
        const nameParts = product.name.split(" ");

        // Ürün isminde brandMapping'deki bir kelimeyi ara
        for (const part of nameParts) {
          const normalizedPart = part.toLowerCase(); // Büyük/küçük harf duyarlılığını kaldır
          if (brandMapping[part] || Object.keys(brandMapping).includes(part)) {
            brand = brandMapping[part] || part;
            break;
          }
        }

        // Eğer marka bulunamazsa, mevcut brand değerini koru veya boş bırak
        if (!brand && product.brand) {
          brand = product.brand; // Mevcut brand varsa koru
        } else if (!brand) {
          brand = "Bilinmeyen"; // Hiçbir eşleşme yoksa "Bilinmeyen" ata (isteğe bağlı)
        }

        // Ürünü güncelle
        product.brand = brand;
        await product.save(); // Veritabanında güncelle
        return product;
      })
    );

    res.status(200).json({
      message: "Ürünler başarıyla güncellendi!",
      updatedProducts,
    });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ message: "Bir hata oluştu", error });
  }
});

router.get("/brands/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const products = await Product.find({ category }, { brand: 1, _id: 0 }); // Kategoriye göre ürünleri çek
    const brands = products.map(product => product.brand);
    const uniqueBrands = [...new Set(brands)].filter(brand => brand && brand !== "Bilinmeyen"); // Benzersiz markaları al, boş veya "Bilinmeyen" olanları filtrele
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
router.get("/category/:category/:subcategory?", getProductsByCategory); // Kategoriye göre ürünler
router.patch("/toggle-hidden/:id", protectRoute, adminRoute, toggleHiddenProduct); // Ürün gizleme/gösterme
router.patch("/toggle-out-of-stock/:id", protectRoute, adminRoute, toggleOutOfStock);

export default router;