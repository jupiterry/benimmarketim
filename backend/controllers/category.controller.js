import Product from "../models/product.model.js";
import { redis } from "../lib/redis.js";

// Kategorileri getir (productCount ile)
export const getCategories = async (req, res) => {
  try {
    const cacheKey = 'categories:with-count';
    
    // Önce Redis'ten kontrol et
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`✅ [Redis Cache] Categories cache hit`);
        const parsedData = JSON.parse(cachedData);
        
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Cache', 'HIT');
        
        return res.status(200).json({
          success: true,
          categories: parsedData.categories
        });
      }
    } catch (cacheError) {
      console.warn('⚠️ [Redis Cache] Cache read error:', cacheError.message);
    }

    console.log(`❌ [Redis Cache] Categories cache miss`);

    // Aggregate ile tüm kategorileri ve ürün sayılarını tek sorguda al
    const categoriesWithCount = await Product.aggregate([
      {
        $match: {
          isHidden: false, // Sadece aktif ürünleri say
        },
      },
      {
        $group: {
          _id: "$category",
          productCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          productCount: 1,
        },
      },
    ]);

    // Frontend'deki kategori yapısına uygun format
    // Kategorileri frontend'deki sabit listeye göre eşleştir
    const categoryMapping = {
      "Benim Kahvem": { href: "/kahve", imageUrl: "/kahve.png" },
      "Yiyecekler": { href: "/yiyecekler", imageUrl: "/foods.png" },
      "Kahvaltılık Ürünler": { href: "/kahvalti", imageUrl: "/kahvalti.png" },
      "Temel Gıda": { href: "/gida", imageUrl: "/basic.png" },
      "Meyve & Sebze": { href: "/meyve-sebze", imageUrl: "/fruit.png" },
      "Süt & Süt Ürünleri": { href: "/sut", imageUrl: "/milk.png" },
      "Beş Para Etmeyen Ürünler": { href: "/bespara", imageUrl: "/bespara.png" },
      "Toz İçecekler": { href: "/tozicecekler", imageUrl: "/instant.png" },
      "Cips & Çerez": { href: "/cips", imageUrl: "/dd.png" },
      "Çay ve Şekerler": { href: "/cayseker", imageUrl: "/cay.png" },
      "Atıştırmalıklar": { href: "/atistirma", imageUrl: "/atistirmaa.png" },
      "Temizlik & Hijyen": { href: "/temizlik", imageUrl: "/clean.png" },
      "Kişisel Bakım": { href: "/kisisel", imageUrl: "/care.png" },
      "Makarna ve Kuru Bakliyat": { href: "/makarna", imageUrl: "/makarna.png" },
      "Şarküteri & Et Ürünleri": { href: "/et", imageUrl: "/chicken.png" },
      "Buz Gibi İçecekler": { href: "/icecekler", imageUrl: "/juice.png" },
      "Dondurulmuş Gıdalar": { href: "/dondurulmus", imageUrl: "/frozen.png" },
      "Baharatlar": { href: "/baharat", imageUrl: "/spices.png" },
      "Golf Dondurmalar": { href: "/dondurma", imageUrl: "/dondurma.png" },
    };

    // Kategorileri formatla
    const formattedCategories = categoriesWithCount.map((cat) => {
      const mapping = categoryMapping[cat.name] || {
        href: `/category/${cat.name.toLowerCase().replace(/\s+/g, "-")}`,
        imageUrl: "/food.png", // Default image
      };

      return {
        _id: cat.name, // Geçici ID olarak kategori adını kullan
        name: cat.name,
        image: mapping.imageUrl,
        href: mapping.href,
        productCount: cat.productCount,
        isActive: true,
      };
    });

    // Ürün sayısına göre sırala (en çok ürünü olanlar önce)
    formattedCategories.sort((a, b) => b.productCount - a.productCount);

    // Response data
    const responseData = {
      success: true,
      categories: formattedCategories
    };

    // Redis'e cache'le (5 dakika = 300 saniye)
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(responseData));
      console.log(`✅ [Redis Cache] Categories cached`);
    } catch (cacheError) {
      console.warn('⚠️ [Redis Cache] Cache write error:', cacheError.message);
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Cache', 'MISS');
    
    res.status(200).json(responseData);
  } catch (error) {
    console.error("Kategoriler getirilirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Sunucu hatası",
      error: error.message,
    });
  }
};

