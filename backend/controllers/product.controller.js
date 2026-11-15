import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import Product from "../models/product.model.js";
import { applyWeeklyPricesToProducts, getWeeklyPriceVersion } from "../services/weeklyPrice.service.js";
import { getProductCacheStamp, onProductCachesInvalidated, syncProductCacheVersion } from "../services/productCache.service.js";
import { diffFields, money, recordAdminAction, yesNo } from "../services/adminAudit.service.js";
import { RECO_WEIGHTS } from "../services/recommendation.config.js";
import { CARD_SELECT, discountPercent, getStats, hourBucket, hourFitScore, normalizeDeliveryPoint, popularityScore } from "../services/recommendation.service.js";
import FlashSale from "../models/flashSale.model.js";
import {
  BULK_PRICE_TYPES, DEFAULT_DISCOUNT_MODE, DISCOUNT_MODES, applyStockState, emitProductsChanged, planBulkPrice,
  priceFieldsOf, readDiscountedPrice, readPrice,
} from "../services/productAdmin.service.js";
import { getSalesStats } from "../services/productSalesStats.service.js";
import { toKurus } from "../services/productPricing.js";
import mongoose from "mongoose";

// İşlem kaydı yardımcıları
const auditProduct = (req, product, action, changes = [], meta) =>
  recordAdminAction(req, { action, category: "product", target: String(product?._id || ""), targetName: product?.name || "", changes, meta });
// Eski ürün kayıtlarında zorunlu bir alan eksik olabilir; yalnızca değişen alanlar doğrulanır
const saveProduct = (product) => product.save({ validateModifiedOnly: true });
const BULK_STATE_MAX = 500;
const STATE_FIELDS = ["isOutOfStock", "isHidden", "isFeatured"];
const validIds = (ids) => Array.isArray(ids) && ids.length > 0 && ids.every((id) => mongoose.Types.ObjectId.isValid(id));
const stateFieldsOf = (product) => ({
  isOutOfStock: Boolean(product.isOutOfStock),
  isHidden: Boolean(product.isHidden),
  isFeatured: Boolean(product.isFeatured),
  outOfStockSince: product.outOfStockSince ?? null,
});
const auditBulk = (req, action, products, changes = [], meta = {}) => {
  const names = products.map((p) => p.name).filter(Boolean);
  recordAdminAction(req, {
    action,
    category: "product",
    target: `${products.length} ürün`,
    targetName: `${names.slice(0, 5).join(", ")}${names.length > 5 ? ` ve ${names.length - 5} ürün daha` : ""}`,
    changes,
    meta: { ...meta, productIds: products.map((p) => String(p._id)).slice(0, 200) },
  });
};

// Last-Modified: en yeni ürün güncellemesi ile son önbellek geçersiz kılma zamanının büyüğü
// (saniyeye yuvarlanır; If-Modified-Since başlığı saniye hassasiyetindedir). Haftalık fiyat
// değişimi ya da indirimi biten ürünün listeden düşmesi updatedAt'i değiştirmeyebilir.
const lastModifiedMs = (updatedAt) => {
  const ms = Math.max(updatedAt ? new Date(updatedAt).getTime() : 0, getProductCacheStamp());
  return Math.floor((ms || Date.now()) / 1000) * 1000;
};
const notModifiedSince = (req, lastModified) => {
  const header = req.headers?.["if-modified-since"];
  if (!header) return false;
  const since = new Date(header).getTime();
  return Number.isFinite(since) && lastModified <= since;
};
// Fiyatlar (flash sale, haftalık fırsat) dakikalar içinde değişebilir: istemci yanıtı saklayabilir
// ama her kullanımda doğrulatmalı (304 ile ucuz). Eskiden max-age=300 tarayıcıda 5 dk eski fiyat gösteriyordu.
const PRICE_CACHE_CONTROL = "private, no-cache";

export const getFeaturedProducts = async (req, res) => {
  try {
    await syncProductCacheVersion();
    // Son güncelleme zamanını tek sorguda al; hem 304 kontrolünde hem header üretiminde kullan.
    const latestProduct = await Product.findOne({
      $or: [
        { isDiscounted: true, isHidden: false },
        { isFeatured: true, isHidden: false }
      ]
    })
      .sort({ updatedAt: -1 })
      .select('updatedAt')
      .lean();
    const lastModifiedAt = lastModifiedMs(latestProduct?.updatedAt);

    if (notModifiedSince(req, lastModifiedAt)) {
      res.setHeader('Last-Modified', new Date(lastModifiedAt).toUTCString());
      res.setHeader('ETag', `"${lastModifiedAt}"`);
      res.setHeader('Cache-Control', PRICE_CACHE_CONTROL);
      return res.status(304).end();
    }

    // Önce indirimli ürünler: "en ucuz önce" yerine indirim derinliği + popülerlik + saat uyumu.
    // Flash sale ürünleri bu listede kalır (mobil kendisi ayıklar).
    const rankCtx = { stats: getStats(), hourBucket: hourBucket(new Date()), deliveryPoint: normalizeDeliveryPoint(req.query.deliveryPoint) };
    const dealRank = (product) =>
      discountPercent(product) * RECO_WEIGHTS.dealDiscountPerPercent + popularityScore(product, rankCtx) + hourFitScore(product, rankCtx);
    const discountedProducts = (await Product.find({
      isDiscounted: true,
      isHidden: false,
    }).lean())
      .map((product) => ({ product, score: dealRank(product) }))
      .sort((a, b) => b.score - a.score || Number(a.product.discountedPrice) - Number(b.product.discountedPrice))
      .map(({ product }) => product);

    // Sonra öne çıkan ve indirimde olmayan ürünleri getir
    const featuredProducts = await Product.find({
      isFeatured: true,
      isHidden: false,
      isDiscounted: false, // İndirimde olmayan öne çıkan ürünler
    }).sort({ order: 1 }).lean();

    // Tüm ürünleri birleştir (önce indirimli sonra öne çıkan)
    const allFeaturedProducts = [...discountedProducts, ...featuredProducts];

    // Set caching headers
    res.setHeader('Last-Modified', new Date(lastModifiedAt).toUTCString());
    res.setHeader('ETag', `"${lastModifiedAt}"`);
    res.setHeader('Cache-Control', PRICE_CACHE_CONTROL);

    // Haftalık fiyatları uygula
    const productsWithWeeklyPrices = await applyWeeklyPricesToProducts(allFeaturedProducts);

    // Tutarlı response yapısı için her zaman aynı formatı döndür
    res.json({
      success: true,
      products: productsWithWeeklyPrices,
      count: productsWithWeeklyPrices.length
    });
  } catch (error) {
    console.error("Öne çıkan ürünler getirilirken hata:", error);
    res.status(500).json({ 
      success: false,
      message: "Sunucu hatası",
      products: [],
      count: 0
    });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { name, description, price, image, category, subcategory, isHidden } = req.body;

    if (!name || price === undefined || price === null || price === "" || !category) {
      return res.status(400).json({ message: "Ürün adı, fiyat ve kategori zorunludur!" });
    }
    const priceInput = readPrice(price);
    if (priceInput.error) {
      return res.status(400).json({ message: priceInput.error });
    }

    let cloudinaryResponse = null;

    if (image) {
      try {
        cloudinaryResponse = await cloudinary.uploader.upload(image, {
          folder: "products",
        });
      } catch (uploadError) {
        console.error("Cloudinary upload hatası:", uploadError.message);
        return res.status(500).json({ message: "Resim yükleme başarısız!", error: uploadError.message });
      }
    }

    const product = await Product.create({
      name,
      description: description || "",
      price: priceInput.price,
      image: cloudinaryResponse?.secure_url || "",
      category,
      subcategory: subcategory || "",
      // Yeni ürün varsayılan olarak görünür; toplu eklemede "gizli ekle" seçilirse kontrol edilene kadar gizli kalır
      isHidden: isHidden === true,
    });

    auditProduct(req, product, "Ürün eklendi", [
      { label: "Fiyat", from: "—", to: money(product.price) },
      { label: "Kategori", from: "—", to: product.category },
      ...(product.isHidden ? [{ label: "Görünürlük", from: "—", to: "Gizli" }] : []),
    ]);
    emitProductsChanged(req, [product._id], {}, { reload: true });
    res.status(201).json({
      message: "Ürün başarıyla oluşturuldu!",
      product,
    });
  } catch (error) {
    console.error("Ürün oluşturulurken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.image) {
      const publicId = product.image.split("/").pop().split(".")[0];
      try {
        await cloudinary.uploader.destroy(`products/${publicId}`);
        console.log("Deleted image from Cloudinary");
      } catch (error) {
        console.log("Error deleting image from Cloudinary:", error);
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    auditProduct(req, product, "Ürün silindi", [{ label: "Fiyat", from: money(product.price), to: "—" }]);
    emitProductsChanged(req, [product._id], { deleted: true });

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error in deleteProduct controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getRecommendedProducts = async (req, res) => {
  try {
    const products = await Product.aggregate([
      { $match: { isHidden: false } }, // Yalnızca görünür ürünleri getir (kullanıcılar için)
      { $sample: { size: 10 } }, // 4 yerine 9 ürün getir
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          image: 1,
          price: 1,
        },
      },
    ]);

    res.json(products);
  } catch (error) {
    console.error("Error in getRecommendedProducts controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const toggleFeaturedProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      product.isFeatured = !product.isFeatured;
      const updatedProduct = await product.save();
      await updateFeaturedProductsCache();
      auditProduct(req, product, product.isFeatured ? "Öne çıkarıldı" : "Öne çıkanlardan kaldırıldı",
        [{ label: "Öne çıkan", from: yesNo(!product.isFeatured), to: yesNo(product.isFeatured) }]);
      emitProductsChanged(req, [product._id], { isFeatured: Boolean(product.isFeatured) });
      res.json(updatedProduct);
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error) {
    console.error("Error in toggleFeaturedProduct controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const toggleHiddenProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Durumu tersine çevir
    product.isHidden = !product.isHidden;
    const updatedProduct = await product.save();
    auditProduct(req, product, product.isHidden ? "Ürün gizlendi" : "Ürün yayına alındı",
      [{ label: "Görünürlük", from: product.isHidden ? "Görünür" : "Gizli", to: product.isHidden ? "Gizli" : "Görünür" }]);
    emitProductsChanged(req, [product._id], { isHidden: Boolean(product.isHidden) });

    // Cache'i invalidate et - güncellenmiş ürünü döndür
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      message: `Ürün ${updatedProduct.isHidden ? "gizlendi" : "gösterildi"}!`,
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error in toggleHiddenProduct controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

async function updateFeaturedProductsCache() {
  try {
    const featuredProducts = await Product.find({ isFeatured: true, isHidden: false }).lean();
    await redis.set("featured_products", JSON.stringify(featuredProducts));
  } catch (error) {
    console.error("Error in update cache function:", error.message);
  }
}
// controllers/product.controller.js
// {category: 1, order: 1} indeksiyle aynı collation; büyük/küçük harf duyarsız eşitlik
const CATEGORY_COLLATION = { locale: "en", strength: 2 };
// Hazır ürün listesi yanıtları (anahtar: sorgu + ürün sayısı + son güncelleme + haftalık fiyat sürümü)
const PRODUCT_LIST_CACHE_MS = 60 * 1000;
const productListCache = new Map();
// Ürün/kampanya değişince (bu ya da başka bir süreçte) hazır yanıtlar hemen atılır
onProductCachesInvalidated(() => productListCache.clear());

export const getProducts = async (req, res) => {
  try {
    
    const { category, page = 1, limit = 9999999, search = "", fields } = req.query;
    const cardOnly = fields === "card";
    let query = {};

    if (category !== undefined && category !== "") {
      if (typeof category !== "string") {
        return res.status(400).json({ message: "Geçersiz kategori" });
      }
      // Eskiden `^kategori$` (büyük/küçük harf duyarsız) regex'i kullanılıyordu; aynı sonucu
      // büyük/küçük harf duyarsız collation ile doğrudan eşitlik + {category, order} indeksiyle verir.
      query.category = category;
    }

    if (search) {
      if (typeof search !== "string") {
        return res.status(400).json({ message: "Geçersiz arama" });
      }
      // Regex özel karakterleri kaçırılır (ReDoS / sorgu enjeksiyonu önlemi)
      query.name = { $regex: new RegExp(escapeRegex(search.slice(0, 100)), "i") }; // Case-insensitive arama
    }

    // Gizli ürünler yalnızca yönetici isteğinde listelenir (route optionalAuth ile req.user doldurur)
    if (req.user?.role !== "admin") {
      query.isHidden = { $ne: true };
    }

    // Başka bir sunucu süreci ürünleri/kampanyaları değiştirdiyse yerel önbelleği at
    await syncProductCacheVersion();

    // Toplam ürün sayısı ve son güncelleme zamanı (Last-Modified / 304 / önbellek anahtarı)
    const [total, latestProduct] = await Promise.all([
      Product.countDocuments(query).collation(CATEGORY_COLLATION),
      Product.findOne(query)
        .collation(CATEGORY_COLLATION)
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean(),
    ]);
    const lastModifiedAt = lastModifiedMs(latestProduct?.updatedAt);

    res.setHeader('Last-Modified', new Date(lastModifiedAt).toUTCString());
    res.setHeader('ETag', `"${lastModifiedAt}"`);
    res.setHeader('Cache-Control', PRICE_CACHE_CONTROL);
    // Offline Sync Support: If-Modified-Since
    if (notModifiedSince(req, lastModifiedAt)) {
      return res.status(304).end();
    }

    // Ürünler (sayı + son güncelleme) ve haftalık fiyatlar değişmediyse hazır yanıtı tekrar
    // kullan. Tüm katalog (~1500 ürün) her istekte yeniden okunup serileştirilmez.
    const cacheKey = JSON.stringify([category || "", search || "", page, limit, cardOnly, total,
      latestProduct?.updatedAt ? new Date(latestProduct.updatedAt).getTime() : 0, getWeeklyPriceVersion()]);
    const cached = productListCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PRODUCT_LIST_CACHE_MS) {
      return res.status(200).type('application/json').send(cached.body);
    }

    // Sayfalama ile ürünleri getir. fields=card: açıklama ve kartta kullanılmayan alanlar gelmez.
    // fields verilmezse (yönetici paneli) tüm alanlar eskisi gibi döner.
    let productQuery = Product.find(query)
      .collation(CATEGORY_COLLATION)
      .sort({ order: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    if (cardOnly) productQuery = productQuery.select(CARD_SELECT);
    const products = await productQuery.lean();

    // Haftalık fiyatları uygula
    const productsWithWeeklyPrices = await applyWeeklyPricesToProducts(products);

    const body = JSON.stringify({
      products: productsWithWeeklyPrices,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
    if (productListCache.size >= 50) productListCache.clear();
    productListCache.set(cacheKey, { at: Date.now(), body });
    res.status(200).type('application/json').send(body);
  } catch (error) {
    console.error("Error in getProducts controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mobil ve ürün detay ekranları için tek ürün getirir.
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isHidden: false }).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Ürün bulunamadı" });
    }
    const [withWeeklyPrice] = await applyWeeklyPricesToProducts([product]);
    return res.status(200).json(withWeeklyPrice);
  } catch (error) {
    return res.status(400).json({ success: false, message: "Geçersiz ürün bilgisi" });
  }
};

export const updateProductPrice = async (req, res) => {
  try {
    const priceInput = readPrice(req.body?.price);
    if (priceInput.error) {
      return res.status(400).json({ message: priceInput.error });
    }
    const priceNumber = priceInput.price;

    // "Geri al": fiyat değişikliği indirimi kaldırdıysa eski indirim aynı istekte geri yazılır
    const restoreRaw = req.body?.restoreDiscountedPrice;
    let restoreDiscount = null;
    if (restoreRaw !== undefined && restoreRaw !== null && restoreRaw !== "") {
      const discountInput = readDiscountedPrice(restoreRaw, priceNumber);
      if (discountInput.error) {
        return res.status(400).json({ message: discountInput.error });
      }
      restoreDiscount = discountInput.discountedPrice;
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    const before = { price: product.price, isDiscounted: product.isDiscounted, discountedPrice: product.discountedPrice };
    product.price = priceNumber; // Yeni fiyatı kaydet
    // Yeni fiyatın altında kalmayan indirim geçersizdir; müşteriye daha pahalı "indirim" gösterilmesin
    if (product.isDiscounted && toKurus(product.discountedPrice) >= toKurus(priceNumber)) {
      product.isDiscounted = false;
      product.discountedPrice = null;
    }
    const discountRemoved = Boolean(before.isDiscounted && !product.isDiscounted);
    const discountRestored = restoreDiscount !== null && !product.isDiscounted;
    if (discountRestored) {
      product.isDiscounted = true;
      product.discountedPrice = restoreDiscount;
    }
    const updatedProduct = await product.save();
    auditProduct(req, product, "Fiyat değiştirildi", [
      { label: "Fiyat", from: money(before.price), to: money(product.price) },
      ...(discountRemoved && !discountRestored ? [{ label: "İndirim", from: money(before.discountedPrice), to: "Kaldırıldı (yeni fiyatın üstündeydi)" }] : []),
      ...(discountRestored ? [{ label: "İndirimli fiyat", from: before.isDiscounted ? money(before.discountedPrice) : "İndirim yok", to: money(restoreDiscount) }] : []),
    ]);
    emitProductsChanged(req, [product._id], priceFieldsOf(product));

    // Cache'i invalidate et
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      message: "Ürün fiyatı güncellendi",
      product: updatedProduct,
      previous: { price: before.price, isDiscounted: Boolean(before.isDiscounted), discountedPrice: before.discountedPrice ?? null },
      discountRemoved: discountRemoved && !discountRestored,
    });
  } catch (error) {
    console.error("Ürün fiyatı güncellenirken hata:", error.message);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

const SEARCH_RESULT_LIMIT = 50;

export const searchProducts = async (req, res) => {
  const { q, category, minPrice, maxPrice, sort = "createdAt" } = req.query;

  try {
    if (typeof q !== "string" || q.trim() === '') {
      return res.status(400).json({ success: false, message: "Arama terimi gerekli" });
    }
    if (category !== undefined && typeof category !== "string") {
      return res.status(400).json({ success: false, message: "Geçersiz kategori" });
    }

    // Arama terimini güvenli hale getir (regex özel karakterleri kaçırılır)
    const searchTerm = q.trim().slice(0, 100);
    const safeTerm = escapeRegex(searchTerm);
    const searchWords = searchTerm.split(' ').filter(word => word.length > 0);

    // Gelişmiş arama sorgusu
    const searchQuery = {
      $and: [
        { isHidden: false }, // Gizli ürünleri hariç tut
        {
          $or: [
            // Tam eşleşme (en yüksek öncelik)
            { name: { $regex: `^${safeTerm}$`, $options: 'i' } },
            // Başlangıç eşleşmesi
            { name: { $regex: `^${safeTerm}`, $options: 'i' } },
            // İçerik eşleşmesi
            { name: { $regex: safeTerm, $options: 'i' } },
            { description: { $regex: safeTerm, $options: 'i' } },
            { category: { $regex: safeTerm, $options: 'i' } },
            // Kelime bazlı arama (sadece birden fazla kelime varsa)
            ...(searchWords.length > 1 ? [{ name: { $regex: searchWords.map(escapeRegex).join('|'), $options: 'i' } }] : [])
          ]
        }
      ]
    };

    if (category && category.trim()) searchQuery.$and.push({ category: category.trim() });
    const parsedMin = Number(minPrice);
    const parsedMax = Number(maxPrice);
    if (Number.isFinite(parsedMin) || Number.isFinite(parsedMax)) {
      const price = {};
      if (Number.isFinite(parsedMin)) price.$gte = parsedMin;
      if (Number.isFinite(parsedMax)) price.$lte = parsedMax;
      searchQuery.$and.push({ price });
    }

    const products = await Product.find(searchQuery).sort(
      sort === "price_low" ? { price: 1 } :
      sort === "price_high" ? { price: -1 } :
      sort === "name_asc" ? { name: 1 } :
      sort === "name_desc" ? { name: -1 } : { createdAt: -1 }
    ).limit(SEARCH_RESULT_LIMIT);

    // Arama sonuçlarını skorlama
    const scoredProducts = products.map(product => {
      let score = 0;
      const searchTermLower = searchTerm.toLowerCase();
      const productName = product.name ? product.name.toLowerCase() : '';
      
      // Tam eşleşme
      if (productName === searchTermLower) score += 100;
      // Başlangıç eşleşmesi
      else if (productName.startsWith(searchTermLower)) score += 80;
      // Kelime başlangıç eşleşmesi
      else if (productName.split(' ').some(word => word.startsWith(searchTermLower))) score += 60;
      // İçerik eşleşmesi
      else if (productName.includes(searchTermLower)) score += 40;
      // Açıklama eşleşmesi
      else if (product.description && product.description.toLowerCase().includes(searchTermLower)) score += 20;
      
      return { ...product.toObject(), searchScore: score };
    });

    // Skora göre sırala
    scoredProducts.sort((a, b) => b.searchScore - a.searchScore);

    // Haftalık fiyatları uygula
    const productsWithWeeklyPrices = await applyWeeklyPricesToProducts(scoredProducts);

    res.status(200).json({ 
      success: true, 
      products: productsWithWeeklyPrices,
      total: productsWithWeeklyPrices.length,
      searchTerm: q
    });
  } catch (error) {
    console.error('Arama hatası:', error);
    res.status(500).json({ success: false, message: "Arama işlemi sırasında hata oluştu" });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { name, category, subcategory, isHidden, isOutOfStock, discountedPrice, price } = req.body;
    const productId = req.params.id;

    if (!name || !category) {
      return res.status(400).json({ message: "Ürün adı ve kategori zorunludur" });
    }
    let priceInput = null;
    if (price !== undefined) {
      priceInput = readPrice(price);
      if (priceInput.error) {
        return res.status(400).json({ message: priceInput.error });
      }
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    const before = product.toObject();
    product.name = name;
    product.category = category;
    product.subcategory = subcategory || "";
    if (isHidden !== undefined) product.isHidden = isHidden;
    if (typeof isOutOfStock === "boolean") applyStockState(product, isOutOfStock);
    if (priceInput) product.price = priceInput.price;
    if (discountedPrice !== undefined) {
      if (discountedPrice === null || discountedPrice === "") {
        product.discountedPrice = null;
        product.isDiscounted = false;
      } else {
        const discountInput = readDiscountedPrice(discountedPrice, product.price);
        if (discountInput.error) {
          return res.status(400).json({ message: discountInput.error });
        }
        product.discountedPrice = discountInput.discountedPrice;
      }
    }
    // Yeni fiyatın altında kalmayan indirim geçersizdir (update-price ile aynı kural)
    if (priceInput && product.isDiscounted && toKurus(product.discountedPrice) >= toKurus(product.price)) {
      product.isDiscounted = false;
      product.discountedPrice = null;
    }

    const updatedProduct = await product.save();
    auditProduct(req, { _id: product._id, name: before.name !== product.name ? `${before.name} → ${product.name}` : product.name }, "Ürün düzenlendi", diffFields(before, product.toObject(), [
      { key: "name", label: "Ad" },
      { key: "category", label: "Kategori" },
      { key: "subcategory", label: "Alt kategori" },
      { key: "price", label: "Fiyat", format: money },
      { key: "discountedPrice", label: "İndirimli fiyat", format: money },
      { key: "isHidden", label: "Görünürlük", format: (v) => (v ? "Gizli" : "Görünür") },
      { key: "isOutOfStock", label: "Stok", format: (v) => (v ? "Tükendi" : "Stokta") },
    ]));
    emitProductsChanged(req, [product._id], {
      name: product.name,
      category: product.category,
      ...priceFieldsOf(product),
      ...stateFieldsOf(product),
    });

    // Cache'i güncelle (featured_products varsa)
    if (product.isFeatured) {
      await updateFeaturedProductsCache();
    }

    res.status(200).json({ message: "Ürün başarıyla güncellendi", product: updatedProduct });
  } catch (error) {
    console.error("Ürün güncellenirken hata:", error.message);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};
export const toggleOutOfStock = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    // Tükendi durumunu tersine çevir (tükendi olunca outOfStockSince yazılır, stoka alınınca silinir)
    applyStockState(product, !product.isOutOfStock);
    const updatedProduct = await product.save();
    auditProduct(req, product, product.isOutOfStock ? "Tükendi olarak işaretlendi" : "Stoka alındı",
      [{ label: "Stok", from: product.isOutOfStock ? "Stokta" : "Tükendi", to: product.isOutOfStock ? "Tükendi" : "Stokta" }]);
    emitProductsChanged(req, [product._id], { isOutOfStock: Boolean(product.isOutOfStock), outOfStockSince: product.outOfStockSince ?? null });

    // Cache'i invalidate et - güncellenmiş ürünü döndür
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({ 
      message: `Ürün ${updatedProduct.isOutOfStock ? "tükendi" : "stokta"}`, 
      product: updatedProduct 
    });
  } catch (error) {
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

export const updateProductImage = async (req, res) => {
  try {
    const { image } = req.body;
    const productId = req.params.id;

    if (!image) {
      return res.status(400).json({ message: "Resim alanı zorunludur" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    // Eski resmi Cloudinary'den sil
    if (product.image) {
      const publicId = product.image.split("/").pop().split(".")[0];
      try {
        await cloudinary.uploader.destroy(`products/${publicId}`);
      } catch (error) {
        console.log("Eski resim silinirken hata:", error);
      }
    }

    // Yeni resmi Cloudinary'ye yükle
    const cloudinaryResponse = await cloudinary.uploader.upload(image, {
      folder: "products",
    });

    // Ürünü güncelle
    const hadImage = Boolean(product.image);
    product.image = cloudinaryResponse.secure_url;
    await product.save();
    auditProduct(req, product, hadImage ? "Görsel değiştirildi" : "Görsel eklendi", [], { image: cloudinaryResponse.secure_url });

    res.status(200).json({
      message: "Ürün görseli güncellendi",
      image: cloudinaryResponse.secure_url
    });
  } catch (error) {
    console.error("Ürün görseli güncellenirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

export const updateProductDiscount = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    const discountInput = readDiscountedPrice(req.body?.discountedPrice, product.price);
    if (discountInput.error) {
      return res.status(400).json({ message: discountInput.error });
    }
    const discountedPrice = discountInput.discountedPrice;

    const previous = product.isDiscounted ? product.discountedPrice : null;
    product.isDiscounted = true;
    product.discountedPrice = discountedPrice;
    await product.save();
    const pct = Number(product.price) > 0 ? Math.round((1 - Number(discountedPrice) / Number(product.price)) * 100) : 0;
    auditProduct(req, product, "İndirim uygulandı", [
      { label: "İndirimli fiyat", from: previous === null ? "İndirim yok" : money(previous), to: `${money(discountedPrice)} (%${pct})` },
    ]);
    emitProductsChanged(req, [product._id], priceFieldsOf(product));

    res.json({ message: "İndirim başarıyla uygulandı", product });
  } catch (error) {
    console.error("İndirim uygulama hatası:", error);
    res.status(500).json({ message: "İndirim uygulanırken hata oluştu" });
  }
};

export const removeProductDiscount = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    const previous = product.isDiscounted ? product.discountedPrice : null;
    product.isDiscounted = false;
    product.discountedPrice = null;
    await product.save();
    auditProduct(req, product, "İndirim kaldırıldı", [{ label: "İndirimli fiyat", from: money(previous), to: "İndirim yok" }]);
    emitProductsChanged(req, [product._id], priceFieldsOf(product));

    res.json({ message: "İndirim başarıyla kaldırıldı", product });
  } catch (error) {
    console.error("İndirim kaldırma hatası:", error);
    res.status(500).json({ message: "İndirim kaldırılırken hata oluştu" });
  }
};

// Toplu İşlemler
export const bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || productIds.length === 0) {
      return res.status(400).json({ message: "Ürün ID'leri gerekli" });
    }

    const deleted = await Product.find({ _id: { $in: productIds } }).select("name").lean();
    await Product.deleteMany({ _id: { $in: productIds } });
    auditBulk(req, "Toplu ürün silme", deleted);
    emitProductsChanged(req, productIds, { deleted: true });
    
    res.json({ message: `${productIds.length} ürün silindi`, deletedCount: productIds.length });
  } catch (error) {
    console.error("Toplu silme hatası:", error);
    res.status(500).json({ message: "Toplu silme işlemi başarısız" });
  }
};

export const bulkUpdateVisibility = async (req, res) => {
  try {
    const { productIds, isHidden } = req.body;
    
    if (!productIds || productIds.length === 0) {
      return res.status(400).json({ message: "Ürün ID'leri gerekli" });
    }
    if (typeof isHidden !== "boolean") {
      return res.status(400).json({ message: "isHidden true ya da false olmalı" });
    }

    await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: { isHidden } }
    );
    emitProductsChanged(req, productIds, { isHidden });
    auditBulk(req, isHidden ? "Toplu gizleme" : "Toplu yayına alma",
      await Product.find({ _id: { $in: productIds } }).select("name").lean(),
      [{ label: "Görünürlük", from: "—", to: isHidden ? "Gizli" : "Görünür" }]);
    
    res.json({ 
      message: `${productIds.length} ürün ${isHidden ? 'gizlendi' : 'görünür yapıldı'}`, 
      updatedCount: productIds.length 
    });
  } catch (error) {
    console.error("Toplu görünürlük güncelleme hatası:", error);
    res.status(500).json({ message: "İşlem başarısız" });
  }
};

export const bulkUpdatePrice = async (req, res) => {
  try {
    const { productIds, priceType } = req.body;
    const priceValue = Number(req.body.priceValue);
    const discountMode = req.body.discountMode === undefined || req.body.discountMode === null || req.body.discountMode === ""
      ? DEFAULT_DISCOUNT_MODE
      : req.body.discountMode;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "Ürün ID'leri gerekli" });
    }
    if (!validIds(productIds)) {
      return res.status(400).json({ message: "Geçersiz ürün ID'si" });
    }
    if (!Number.isFinite(priceValue) || !BULK_PRICE_TYPES.includes(priceType)) {
      return res.status(400).json({ message: "Geçerli bir fiyat değeri ve işlem türü girin" });
    }
    if (!DISCOUNT_MODES.includes(discountMode)) {
      return res.status(400).json({ message: "Geçersiz indirim seçeneği (keepRatio, keepPrice ya da remove olmalı)" });
    }
    if (priceType === "set" && toKurus(priceValue) <= 0) {
      return res.status(400).json({ message: "Sabit fiyat 0 ₺ ya da daha düşük olamaz" });
    }
    if (priceType !== "set" && toKurus(priceValue) === 0) {
      return res.status(400).json({ message: "Değişiklik miktarı 0 olamaz" });
    }

    const products = await Product.find({ _id: { $in: productIds } });
    if (!products.length) {
      return res.status(404).json({ message: "Seçili ürünler bulunamadı" });
    }

    // Flaş indirimdeki ürünlerin kampanya kayıtları (flaş fiyatı ve kampanya sonrası fiyat birlikte güncellenir)
    const saleIds = products.filter((p) => p.flashSale?.sale).map((p) => p.flashSale.sale);
    const sales = saleIds.length ? await FlashSale.find({ _id: { $in: saleIds } }) : [];
    const saleById = new Map(sales.map((sale) => [String(sale._id), sale]));

    // Önce tüm ürünler hesaplanır: biri bile 0 ₺ ya da altına inecekse hiçbir fiyat değiştirilmez
    const rule = { priceType, priceValue, discountMode };
    const plans = products.map((product) => {
      const sale = product.flashSale?.sale ? saleById.get(String(product.flashSale.sale)) || null : null;
      return { product, sale, plan: planBulkPrice(product, rule, sale) };
    });
    const invalid = plans.filter(({ plan }) => !(toKurus(plan.price) > 0));
    if (invalid.length) {
      const first = invalid[0];
      return res.status(400).json({
        message: `Bu değişiklikle “${first.product.name}” fiyatı ${money(first.plan.price)} olur${invalid.length > 1 ? ` (${invalid.length - 1} ürün daha 0 ₺ ya da altına iniyor)` : ""}. Fiyat 0 ₺ ya da daha düşük olamaz; hiçbir fiyat değiştirilmedi.`,
        invalidProducts: invalid.slice(0, 50).map(({ product, plan }) => ({ _id: String(product._id), name: product.name, price: plan.oldPrice, newPrice: plan.price })),
      });
    }

    const priceChanges = [];
    const updated = [];
    let discountsRemoved = 0;
    let flashUpdated = 0;
    for (const { product, sale, plan } of plans) {
      product.price = plan.price;
      product.isDiscounted = plan.isDiscounted;
      product.discountedPrice = plan.discountedPrice;
      if (plan.flash) {
        product.flashSale.price = plan.flash.price;
        flashUpdated++;
      }
      if (plan.discountRemoved) discountsRemoved++;
      await saveProduct(product);
      if (plan.flash && sale) {
        // Kampanya bitince releaseSale ürünü appliedPrice ile tanır ve önceki indirimi geri yükler
        sale.appliedPrice = plan.flash.price;
        sale.previousIsDiscounted = plan.flash.previousIsDiscounted;
        sale.previousDiscountedPrice = plan.flash.previousDiscountedPrice;
        await sale.save();
      }
      updated.push({ _id: String(product._id), ...priceFieldsOf(product) });
      if (priceChanges.length < 15) {
        const customerChanged = plan.customerBefore !== plan.oldPrice || plan.customerAfter !== plan.price;
        priceChanges.push({
          label: product.name,
          from: customerChanged ? `${money(plan.oldPrice)} (müşteri ${money(plan.customerBefore)})` : money(plan.oldPrice),
          to: customerChanged
            ? `${money(plan.price)} (müşteri ${money(plan.customerAfter)}${plan.flash ? ", flaş" : plan.discountRemoved ? ", indirim kalktı" : ""})`
            : money(plan.price),
        });
      }
    }
    const ruleLabel = { set: `Sabit ${money(priceValue)}`, increase: `+${money(priceValue)}`, decrease: `−${money(priceValue)}`, percentage: `%${priceValue}` }[priceType];
    const modeLabel = { keepRatio: "indirim oranı korundu", keepPrice: "indirimli fiyat sabit", remove: "indirimler kaldırıldı" }[discountMode];
    auditBulk(req, `Toplu fiyat güncelleme (${ruleLabel}, ${modeLabel})`, products, priceChanges,
      { priceType, priceValue, discountMode, discountsRemoved, flashUpdated });
    emitProductsChanged(req, updated.map((p) => p._id), {}, { products: updated });

    res.json({
      success: true,
      message: `${products.length} ürünün fiyatı güncellendi`,
      updatedCount: products.length,
      discountMode,
      discountsRemoved,
      flashUpdated,
      products: updated,
    });
  } catch (error) {
    console.error("Toplu fiyat güncelleme hatası:", error);
    res.status(500).json({ message: "İşlem başarısız. Ürün listesini yenileyip fiyatları kontrol edin." });
  }
};

// ─────────────────────────────────────────────
// Durumu "şuna ayarla" uçları (tersine çevirmez; iki cihaz aynı anda bassa da sonuç aynıdır)
// ─────────────────────────────────────────────
const readStateBody = (body, allowed) => {
  const changes = {};
  for (const field of allowed) {
    const value = body?.[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") return { error: `${field} true ya da false olmalı` };
    changes[field] = value;
  }
  if (!Object.keys(changes).length) return { error: `En az bir alan gerekli: ${allowed.join(", ")}` };
  return { changes };
};

const stateChangeRows = (before, after) => [
  ...(before.isOutOfStock !== after.isOutOfStock ? [{ label: "Stok", from: before.isOutOfStock ? "Tükendi" : "Stokta", to: after.isOutOfStock ? "Tükendi" : "Stokta" }] : []),
  ...(before.isHidden !== after.isHidden ? [{ label: "Görünürlük", from: before.isHidden ? "Gizli" : "Görünür", to: after.isHidden ? "Gizli" : "Görünür" }] : []),
  ...(before.isFeatured !== after.isFeatured ? [{ label: "Öne çıkan", from: yesNo(before.isFeatured), to: yesNo(after.isFeatured) }] : []),
];

/** PATCH /api/products/:id/state { isOutOfStock?, isHidden?, isFeatured? } */
export const setProductState = async (req, res) => {
  try {
    const { changes, error } = readStateBody(req.body, STATE_FIELDS);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Geçersiz ürün ID'si" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Ürün bulunamadı" });
    }

    const before = stateFieldsOf(product);
    if (changes.isOutOfStock !== undefined) applyStockState(product, changes.isOutOfStock);
    if (changes.isHidden !== undefined) product.isHidden = changes.isHidden;
    if (changes.isFeatured !== undefined) product.isFeatured = changes.isFeatured;
    const after = stateFieldsOf(product);
    const rows = stateChangeRows(before, after);

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    if (!rows.length) {
      // Zaten istenen durumda: hiçbir şey yazılmaz
      return res.status(200).json({ success: true, changed: false, product });
    }

    const updatedProduct = await saveProduct(product);
    if (before.isFeatured !== after.isFeatured || (before.isHidden !== after.isHidden && after.isFeatured)) {
      await updateFeaturedProductsCache();
    }
    const action = rows.length > 1 ? "Ürün durumu değiştirildi"
      : before.isOutOfStock !== after.isOutOfStock ? (after.isOutOfStock ? "Tükendi olarak işaretlendi" : "Stoka alındı")
        : before.isHidden !== after.isHidden ? (after.isHidden ? "Ürün gizlendi" : "Ürün yayına alındı")
          : (after.isFeatured ? "Öne çıkarıldı" : "Öne çıkanlardan kaldırıldı");
    auditProduct(req, product, action, rows);
    emitProductsChanged(req, [product._id], after);

    res.status(200).json({ success: true, changed: true, product: updatedProduct || product });
  } catch (error) {
    console.error("Ürün durumu güncellenirken hata:", error.message);
    res.status(500).json({ success: false, message: "Ürün durumu güncellenemedi" });
  }
};

const BULK_STATE_SELECT = "name isOutOfStock isHidden isFeatured outOfStockSince updatedAt";

/** POST /api/products/bulk-state { productIds (≤500), isOutOfStock?, isHidden? } */
export const bulkSetProductState = async (req, res) => {
  try {
    const { productIds } = req.body || {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: "Ürün ID'leri gerekli" });
    }
    if (productIds.length > BULK_STATE_MAX) {
      return res.status(400).json({ success: false, message: `Tek seferde en fazla ${BULK_STATE_MAX} ürün güncellenebilir` });
    }
    if (!validIds(productIds)) {
      return res.status(400).json({ success: false, message: "Geçersiz ürün ID'si" });
    }
    const { changes, error } = readStateBody(req.body, ["isOutOfStock", "isHidden"]);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const ids = [...new Set(productIds.map(String))];
    const before = await Product.find({ _id: { $in: ids } }).select(BULK_STATE_SELECT).lean();
    const changed = before.filter((p) =>
      (changes.isOutOfStock !== undefined && Boolean(p.isOutOfStock) !== changes.isOutOfStock) ||
      (changes.isHidden !== undefined && Boolean(p.isHidden) !== changes.isHidden));

    const now = new Date();
    if (changes.isHidden !== undefined) {
      await Product.updateMany({ _id: { $in: ids } }, { $set: { isHidden: changes.isHidden } });
    }
    if (changes.isOutOfStock === true) {
      // Zaten tükenmiş ürünlerin ilk tükenme tarihi korunur
      await Product.updateMany({ _id: { $in: ids }, isOutOfStock: { $ne: true } }, { $set: { isOutOfStock: true, outOfStockSince: now } });
    } else if (changes.isOutOfStock === false) {
      await Product.updateMany({ _id: { $in: ids } }, { $set: { isOutOfStock: false, outOfStockSince: null } });
    }

    const products = await Product.find({ _id: { $in: ids } }).select(BULK_STATE_SELECT).lean();
    const found = new Set(products.map((p) => String(p._id)));
    const missing = ids.filter((id) => !found.has(id));

    if (changed.length) {
      if (changes.isHidden !== undefined) await updateFeaturedProductsCache();
      const labels = [
        ...(changes.isOutOfStock !== undefined ? [changes.isOutOfStock ? "Toplu tükendi işaretleme" : "Toplu stoka alma"] : []),
        ...(changes.isHidden !== undefined ? [changes.isHidden ? "Toplu gizleme" : "Toplu yayına alma"] : []),
      ];
      auditBulk(req, labels.join(" + "), changed, [
        ...(changes.isOutOfStock !== undefined ? [{ label: "Stok", from: "—", to: changes.isOutOfStock ? "Tükendi" : "Stokta" }] : []),
        ...(changes.isHidden !== undefined ? [{ label: "Görünürlük", from: "—", to: changes.isHidden ? "Gizli" : "Görünür" }] : []),
      ], { requested: ids.length });
      emitProductsChanged(req, products.map((p) => p._id), {}, {
        products: products.map((p) => ({ _id: String(p._id), ...stateFieldsOf(p) })),
      });
    }

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).json({ success: true, updatedCount: changed.length, products, missing });
  } catch (error) {
    console.error("Toplu durum güncelleme hatası:", error);
    res.status(500).json({ success: false, message: "İşlem başarısız. Ürün listesini yenileyip tekrar deneyin." });
  }
};

/** GET /api/products/sales-stats: ürün başına son 7/30 gün satış adedi (yönetici) */
export const getProductSalesStats = async (req, res) => {
  try {
    const data = await getSalesStats({ force: req.query?.refresh === "1" });
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ success: true, generatedAt: data.generatedAt, stats: data.stats });
  } catch (error) {
    console.error("Satış özeti hesaplanamadı:", error.message);
    res.status(500).json({ success: false, message: "Satış bilgileri alınamadı" });
  }
};

/**
 * Regex karakterlerini escape et
 */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Similar Products Endpoint
export const getSimilarProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    // Get the current product
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Geçersiz ürün ID" });
    }

    const currentProduct = await Product.findById(id);
    if (!currentProduct) {
      return res.status(404).json({ success: false, message: "Ürün bulunamadı" });
    }

    // Calculate price range (±20%)
    const priceRange = {
      min: currentProduct.price * 0.8,
      max: currentProduct.price * 1.2,
    };

    // If product has discounted price, use that for range calculation
    if (currentProduct.isDiscounted && currentProduct.discountedPrice) {
      priceRange.min = currentProduct.discountedPrice * 0.8;
      priceRange.max = currentProduct.discountedPrice * 1.2;
    }

    // Build query for similar products
    const query = {
      _id: { $ne: id }, // Exclude current product
      isHidden: false, // Only visible products
    };

    // Find similar products
    // Priority: 1. Same category, 2. Similar price range
    const similarProducts = await Product.find({
      ...query,
      category: currentProduct.category,
      price: { $gte: priceRange.min, $lte: priceRange.max },
    })
      .limit(limit)
      .sort({ isFeatured: -1, order: 1, createdAt: -1 });

    // If we don't have enough products, fill with same category regardless of price
    if (similarProducts.length < limit) {
      const additionalProducts = await Product.find({
        ...query,
        category: currentProduct.category,
        _id: { $nin: [...similarProducts.map(p => p._id), id] },
      })
        .limit(limit - similarProducts.length)
        .sort({ isFeatured: -1, order: 1, createdAt: -1 });

      similarProducts.push(...additionalProducts);
    }

    // If still not enough, fill with any products in similar price range
    if (similarProducts.length < limit) {
      const priceRangeProducts = await Product.find({
        ...query,
        price: { $gte: priceRange.min, $lte: priceRange.max },
        _id: { $nin: [...similarProducts.map(p => p._id), id] },
      })
        .limit(limit - similarProducts.length)
        .sort({ isFeatured: -1, order: 1, createdAt: -1 });

      similarProducts.push(...priceRangeProducts);
    }

    // Diğer ürün uç noktalarıyla aynı fiyat alanları (actualPrice, haftalık fırsat, flash sale)
    const products = await applyWeeklyPricesToProducts(similarProducts);
    res.status(200).json({
      success: true,
      products,
      count: products.length,
    });
  } catch (error) {
    console.error("Error in getSimilarProducts:", error);
    res.status(500).json({ success: false, message: "Benzer ürünler getirilirken hata oluştu" });
  }
};
