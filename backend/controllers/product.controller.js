import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import Product from "../models/product.model.js";
import { Parser } from 'json2csv';
import { detectBrand } from '../services/brandDetection.js';

export const getAllProducts = async (req, res) => {
  try {
    console.log("Get all products request received for admin"); // Debug log
    const products = await Product.find({}); // Admin için tüm ürünleri getir (isHidden dahil)
    console.log("Products fetched for admin:", products.length);
    res.json({ products });
  } catch (error) {
    console.error("Error in getAllProducts controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getFeaturedProducts = async (req, res) => {
  try {
    let featuredProducts = await redis.get("featured_products");

    if (featuredProducts) {
      return res.json(JSON.parse(featuredProducts));
    }

    featuredProducts = await Product.find({ isFeatured: true, isHidden: false }).lean(); // Yalnızca görünür öne çıkan ürünleri getir

    if (!featuredProducts.length) {
      return res.status(404).json({ message: "No featured products found" });
    }

    await redis.set("featured_products", JSON.stringify(featuredProducts));

    res.json(featuredProducts);
  } catch (error) {
    console.error("Error in getFeaturedProducts controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { name, description, price, image, category, subcategory } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({ message: "Ürün adı, fiyat ve kategori zorunludur!" });
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
      price,
      image: cloudinaryResponse?.secure_url || "",
      category,
      subcategory: subcategory || "",
      isHidden: false, // Yeni ürün varsayılan olarak görünür
    });

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
      { $sample: { size: 4 } },
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

export const getProductsByCategory = async (req, res) => {
  try {
    const { category, subcategory } = req.params;
    const { brands } = req.query; // URL'den seçili markaları al

    let query = { category };

    // Alt kategori varsa ekle
    if (subcategory) {
      query.subcategory = subcategory;
    }

    // Seçili markalar varsa filtrele
    if (brands) {
      const selectedBrands = brands.split(','); // Virgülle ayrılmış markaları diziye çevir
      query.brand = { $in: selectedBrands };
    }

    // Gizli olmayan ve sıralamaya göre ürünleri getir
    const products = await Product.find({
      ...query,
      isHidden: false
    }).sort({ order: 1 });

    res.json(products);
  } catch (error) {
    console.error("Ürünler getirilirken hata:", error);
    res.status(500).json({ message: "Ürünler getirilirken hata oluştu" });
  }
};

export const toggleFeaturedProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      product.isFeatured = !product.isFeatured;
      const updatedProduct = await product.save();
      await updateFeaturedProductsCache();
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

    product.isHidden = !product.isHidden;
    const updatedProduct = await product.save();

    res.json({
      message: `Ürün ${product.isHidden ? "gizlendi" : "gösterildi"}!`,
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
export const getProducts = async (req, res) => {
  try {
    console.log("Get products request received with query:", req.query);
    
    const { category, page = 1, limit = 1200, search = "" } = req.query;
    let query = {};

    if (category) {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }

    if (search) {
      query.name = { $regex: new RegExp(search, "i") }; // Case-insensitive arama
    }

    // Toplam ürün sayısını al
    const total = await Product.countDocuments(query);

    // Sayfalama ile ürünleri getir
    const products = await Product.find(query)
      .sort({ order: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    console.log(`Products fetched: ${products.length}, Page: ${page}, Total: ${total}`);
    
    res.status(200).json({ 
      products,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error("Error in getProducts controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateProductPrice = async (req, res) => {
  try {
    const { price } = req.body;
    if (!price) {
      return res.status(400).json({ message: "Fiyat alanı zorunludur" });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    product.price = price; // Yeni fiyatı kaydet
    await product.save();

    res.status(200).json({ message: "Ürün fiyatı güncellendi", product });
  } catch (error) {
    console.error("Ürün fiyatı güncellenirken hata:", error.message);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

export const searchProducts = async (req, res) => {
  const { q } = req.query;

  try {
    const products = await Product.find(
      { $text: { $search: q } }, // Arama sorgusu
      { score: { $meta: "textScore" } } // Arama skorunu döndür
    ).sort({ score: { $meta: "textScore" } }); // Skora göre sırala

    res.status(200).json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: "Arama işlemi sırasında hata oluştu" });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { name, category, subcategory, isHidden, discountedPrice } = req.body;
    const productId = req.params.id;

    if (!name || !category) {
      return res.status(400).json({ message: "Ürün adı ve kategori zorunludur" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    product.name = name;
    product.category = category;
    product.subcategory = subcategory || "";
    if (isHidden !== undefined) product.isHidden = isHidden;
    if (discountedPrice !== undefined) product.discountedPrice = discountedPrice;

    const updatedProduct = await product.save();

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

    // Tükendi durumunu tersine çevir
    product.isOutOfStock = !product.isOutOfStock;
    await product.save();

    res.status(200).json({ message: `Ürün ${product.isOutOfStock ? "tükendi" : "stokta"}`, product });
  } catch (error) {
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

export const exportProductsToCSV = async (req, res) => {
  try {
    const products = await Product.find({});
    
    const fields = [
      'name',
      'price',
      'category',
      'image',
      'description',
      'isOutOfStock',
      'isFeatured',
      'isHidden'
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(products);

    res.header('Content-Type', 'text/csv');
    res.attachment('products.csv');
    return res.send(csv);
  } catch (error) {
    console.error('CSV dışa aktarma hatası:', error);
    res.status(500).json({ message: 'Ürünler CSV\'ye aktarılırken hata oluştu' });
  }
};

export const detectProductBrands = async (req, res) => {
  try {
    const products = await Product.find({}, 'name');
    const results = [];
    
    for (const product of products) {
      const brand = await detectBrand(product.name);
      results.push({
        productId: product._id,
        productName: product.name,
        detectedBrand: brand
      });
    }

    // CSV olarak dışa aktar
    const fields = ['productId', 'productName', 'detectedBrand'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(results);

    res.header('Content-Type', 'text/csv');
    res.attachment('product_brands.csv');
    return res.send(csv);
  } catch (error) {
    console.error('Marka tespiti hatası:', error);
    res.status(500).json({ message: 'Marka tespiti sırasında hata oluştu' });
  }
};

export const recategorizeProducts = async (req, res) => {
  try {
    const products = await Product.find({});
    
    // Kategori eşleştirme kuralları
    const category_rules = {
      
      'cips': {
        keywords: [
          'Cips', 'Çerez', 'Fıstık', 'Leblebi', 'Kuruyemiş', 'Doritos',
          'Tadım', 'Ay Çekirdeği', 'Kabak Çekirdeği', 'Doritos Değiş Tokuş Ruffles Ketçap Aromalı'
        ],
        exact_matches: [
          'Doritos Değiş Tokuş Ruffles Ketçap Aromalı',
          'Ruffles', 'Doritos', 'Lays', 'Çerezza', 'Kavrulmuş',
          'Bol Tuzlu Siyah Ay Çekirdeği', 'Kavrulmuş Siyah Ay Çekirdeği'
        ],
        blacklist: [
          'aromalı', 'temizlik', 'deterjan', 'şampuan', 'sabun'
        ],
        category: 'cips'
      },
      'temizlik': {
        keywords: [
          'Asperox', 'Por Çöz', 'Temix', 'Lux Disk', 'Buzdolabı Poşeti', 'Koroplast', 'Glade',
          'Cam Temizleyici', 'Renax', 'Finish', 'Sleepy', 'Porçöz', 'Domestos', 'Persil',
          'Ariel', 'Fairy', 'Pril', 'Cif', 'Yumoş', 'Bingo', 'Solo', 'Ratex', 'Zanix', 'Ramax',
          'pişirme', 'sinek', 'omo', 'kireç', 'detax', 'yumoş', 'folyo', 'film', 'deterjan',
          'sabun', 'temizlik', 'temizleyici', 'çamaşır', 'bulaşık', 'domestos', 'persil',
          'ariel', 'toz deterjan', 'pril', 'cif', 'Çamaşır Suyu', 'Selpak', 'Detax'
        ],
        exact_matches: [
          'Selpak', 'Renax', 'Finish', 'Sleepy', 'Porçöz', 'Domestos', 'Persil', 'Ariel',
          'Fairy', 'Pril', 'Cif', 'Yumoş', 'Bingo', 'Solo', 'Ratex', 'Zanix', 'Ramax',
          'Omo', 'Persil', 'Detax'
        ],
        blacklist: [
          'içecek', 'yiyecek', 'gıda', 'Sufle', 'Cappy', 'Fuse Tea', 'Cola', 'Sprite',
          'Fanta', 'Schweppes', 'Yedigün', 'Fruko'
        ],
        category: 'temizlik'
      },

      'tozicecekler': {
        keywords: [
          'toz içecek', 'sahlep', 'salep', 'toz kahve', 'hazır kahve', 'nescafe',
          'nesquik', 'kakao tozu', 'sıcak çikolata tozu', 'toz form', 'form çayı'
        ],
        exact_matches: [
          'Nescafe Classic', 'Nesquik', 'Jacobs', 'Mahmood Coffee', 'Form Çayı'
        ],
        blacklist: [
          'deterjan', 'temizlik', 'çamaşır', 'bulaşık', 'toz deterjan'
        ],
        category: 'tozicecekler'
      },

      'kahve': {
        keywords: [
          'Iced Cafe au Lait',
          'Türk Kahvesi', 'Filtre Kahve', 'Espresso', 'Cappuccino', 'Latte',
          'Americano', 'Flat White', 'Soğuk Kahve', 'Benim Kahvem'
        ],
        exact_matches: [
          'Türk Kahvesi', 'Filtre Kahve', 'Espresso', 'Iced Cappuccino', 'Espresso',
          'Cappuccino', 'Latte Macchiato', 'Soğuk Kahve', 'Americano', 'Caffe Crema',
          'Caffe Latte', 'Espresso Lungo', 'Ristretto', 'Flat White', 'Café au Lait'
        ],
        blacklist: [
          'aroması', 'NESCAFE', 'toz', 'hazır kahve'
        ],
        category: 'kahve'
      },

      'yiyecekler': {
        keywords: [
          'çiğköfte', 'dürüm', 'lahmacun', 'pide', 'pizza', 'hamburger',
          'döner', 'köfte', 'tavuk döner'
        ],
        exact_matches: [
          'Komagene Çiğköfte', 'Dürüm', 'Lahmacun', 'Pide'
        ],
        blacklist: [
          'içecek', 'deterjan', 'temizlik', 'şampuan', 'sabun'
        ],
        category: 'yiyecekler'
      },

      'kahvalti': {
        keywords: [
          'Enka Kahvaltı', 'reçel', 'bal', 'peynir', 'zeytin', 'yumurta', 'sucuk', 'salam',
          'sosis', 'kahvaltılık', 'tereyağ', 'kaymak'
        ],
        exact_matches: [
          'Sürme Peynir', 'Kaşar Peyniri', 'Beyaz Peynir', 'Siyah Zeytin',
          'Yeşil Zeytin', 'Bal', 'Tereyağ', 'Kaymak', 'Enka Kahvaltı'
        ],
        blacklist: [
          'aromalı', 'tadında', 'Gliss', 'Eti', 'Finger', 'şampuan', 'sabun',
          'temizlik', 'deterjan'
        ],
        category: 'kahvalti'
      },

      'gida': {
        keywords: [
          'şeker', 'yağ', 'pirinç', 'salça', 'un', 'bakliyat', 'baharat',
          'çorba', 'konserve', 'sos'
        ],
        exact_matches: [
          'Ayçiçek Yağı', 'Zeytinyağı'
        ],
        blacklist: [
          // Temizlik ve Kişisel Bakım
          'Fresh', 'aromalı', 'Minimix', 'Gliss', 'Asperox', 'Finger', 'Aslanlı',
          'Lux', 'Hobby', 'Porçöz', 'Koroplast', 'Sana', 'Ace', 'Por Çöz',
          'Islak Mendil', 'Hacı', 'Evissa', 'Temix', 'Ece', 'Sleepy', 'Colgate',
          'Özyeşil', 'Proxentin', 'Dove', 'Calgon', 'Doyfarm', 'Solo', 'Detax',
          'İndomie', 'Noodle', 'Köri Aromalı', 'Dana Eti', 'Tavuk Aromalı',
          'Köri',
          
          // İçecekler
          'Lipton', 'Cappy', 'Fuse Tea', 'Cola', 'Gazoz', 'Ice Tea',
          'Coca Cola', 'Pepsi', 'Sprite', 'Fanta', 'Schweppes', 'Yedigün',
          'Doritos', 'Lays', 'Çerezza', 'Kavrulmuş', 'Kavrulmuş Siyah Ay Çekirdeği',
          
          // Temizlik terimleri
          'Temizlik', 'Temizleyici', 'Deterjan', 'Şampuan', 'Sabun',
          'Bulaşık', 'Çamaşır', 'Yüzey Temizleme', 'Kireç', 'Çöz',
          'Parlatıcı', 'Yumuşatıcı'
        ],
        category: 'gida'
      },

      'sut': {
        keywords: [
          'Enka Yarım Yağlı Tost Peyniri', 'Enka Kahvaltı Seti Piknik Tipi 95 gr',
          'süt', 'sütaş', 'yoğurt', 'ayran', 'peynir', 'kaymak', 'tereyağ',
          'kefir', 'puding', 'sütlü tatlı', 'Enka'
        ],
        exact_matches: [
          'Enka',
          'Tam Yağlı Süt', 'Yarım Yağlı Süt', 'Yoğurt', 'Ayran', 'Kaymak',
          'Sütaş Puding', 'Sütaş Minimix', 'Enka Kahvaltı Seti Piknik Tipi 95 gr'
        ],
        blacklist: [
          'aromalı', 'tadında', 'Altinbaşak', 'Bonbon', 'Eti', 'Evissa',
          'şampuan', 'sabun', 'temizlik'
        ],
        category: 'sut'
      },

      'cay': {
        keywords: [
          'Mgs Küp Şeker',
          'çay', 'şeker', 'küp şeker', 'tirebolu', 'rize', 'tiryaki',
          'Çaykur', 'demlik poşet', 'bardak poşet'
        ],
        exact_matches: [
          'Mgs Küp Şeker', 'Mgs Toz Şeker',
          'Rize Çayı', 'Tirebolu Çayı', 'Siyah Çay', 'Çay', 'Lipton',
          'Altıncezve', 'Doğuş Çay', 'Karali Çay'
        ],
        blacklist: [
          'aromalı', 'tadında', 'Fuse Tea', 'Ice Tea', 'soğuk çay'
        ],
        category: 'cayseker'
      },

      'atistirma': {
        keywords: [
          'Carami̇o', 'Kat Kat', 'Probi̇s', 'Finger', 'Sakliköy', 'Dore', 'Kakaolu Bi̇sküvi̇', 'Pöti̇bör', 'Çi̇zi̇',
          'Kri̇spi̇', '9 Kat', 'Altinbaşak', 'O’Lala', 'Waffle', 'Bold',
          'Sufle', 'Yıldız', 'Bonbon', 'Kremi̇ni̇', 'Yupo', 'Ece', 'Coco Star', 'Cicibebe', 'Carami̇o', 'Caramio', 'Alpella', 'Albeni̇', 'Cocostar', 'Cocostar',
          'Çokomilk', 'Çokomi̇lk', 'Çokonat', 'Di̇do', 'Hobby', 'Lavi̇va', 'Pi̇ko', 'Findik Aşki', 'Metro', 'Çokokrem', 'Bi̇skrem', 'Canpare', 'Çokoprens',
          'Hanimeller', 'Haylayf', 'İkram', 'Çubuk', 'Susamli', 'Baton Kek', 'Kremini', 'Yupo', 'Çi̇kolati̇n',
          'Buklet', 'Toffe', 'Dolgulu Toffe', 'Lokumcuk', 'Lalezar', 'Kanky', 'Seleck', 'Çi̇zi̇vi̇ç',
        ],
        exact_matches: [
          'Yupo Dev Loli̇pop Pamuk Şeker', 'Beylerbeyi̇ Sütlü Ve Bi̇tter Madlen Çi̇kolata', 
          'Lalezar', 'Select', 'Kanky', 'Çi̇zi̇vi̇ç', 
          'Ülker', 'Eti Bisküvi', 'Albeni', 'Halley', 'Hanımeller',
          'Oneo', 'Eti', '8Kek', 'O\'Lala', 'Dankek', 'Kekstra', 'Di̇do', 'Hobby',
          'Taç Kraker', 'Çi̇kolati̇n'
        ],
        blacklist: [
          'Doritos', 'Sensodyne', 'Noodle', 'temizlik', 'deterjan',
          'şampuan', 'sabun'
        ],
        category: 'atistirma'
      },

      'kisisel': {
        keywords: [
          'Teno Peçete', 'Papia',
          'Soft 90 Yaprak Islak Mendil', 'Aslanlı 100 gr İdrofil Pamuk',
          'Cep Islak Mendili Deluxe', 'Dalin', 'Baby', 'Neutrogena',
          'Nivea', 'diş', 'macun', 'şampuan', 'duş', 'jeli', 'deodorant',
          'parfüm', 'kolonya', 'soap', 'evissa', 'Okey', 'Fa Erkek',
          'Morfose', 'Özyeşil', 'Eyüp', 'Arko', 'Veet', 'Apex', 'Ksmart',
          'Jix', 'Arko', 'Kotex', 'Orkid', 'Sesu', 'Lapiden', 'Elidor',
          'Molped', 'Pantene'
        ],
        exact_matches: [
          'Colgate', 'Sensodyne', 'Clear Şampuan', 'Head & Shoulders',
          'Dove', 'Evissa', 'Neutrogena', 'Nivea'
        ],
        blacklist: [
          'yiyecek', 'içecek', 'gıda', 'Yupo', 'Cappy', 'Fuse Tea',
          'Cola', 'Sprite'
        ],
        category: 'kisisel'
      },

      'makarna': {
        keywords: [
          'Noodle', 'Indomie', 'Köri Aromalı', 'Dana Eti', 'Tavuk Aromalı', 
          'Köri', 
          'Hasata', 'Damla', 'Tamek', 'Indomie', 'Köri', 'Noodle',
          'makarna', 'spagetti', 'erişte', 'bulgur', 'pirinç',
          'mercimek', 'fasulye', 'nohut', 'filiz', 'Nuhun Ankara'
        ],
        exact_matches: [
          'Indomie', 'Noodle', 'Köri Aromalı', 'Dana Eti', 'Tavuk Aromalı',
          'Filiz Makarna', 'Nuhun Ankara Makarna', 'Spagetti',
          'Burgu Makarna', 'Tavuk Aromalı Hazır Noodle Bardak',
          'Sebzeli Hazır Noodle Bardak'
        ],
        blacklist: [
          'aromalı', 'tadında', 'Yupo', 'Çaykur', 'temizlik',
          'deterjan', 'şampuan'
        ],
        category: 'makarna'
      },

      'et': {
        keywords: [
          'sucuk', 'salam', 'sosis', 'pastırma', 'jambon', 'et',
          'tavuk', 'hindi', 'köfte', 'pirzola', 'kuşbaşı'
        ],
        exact_matches: [
          'Dana Kıyma', 'Kuzu Pirzola', 'Tavuk Göğüs', 'Hindi Füme',
          'Dana Kuşbaşı', 'Piliç Pirzola'
        ],
        blacklist: [
          'makarna', 'aromalı', 'tadında', 'Çaykur', 'Hobby', 'Bi̇skrem',
          'Hanimeller', 'Ülker', 'Çi̇kolati̇n', 'Altıncezve', 'Karali',
          'Indomie', 'Noodle', 'Lipton', 'temizlik', 'deterjan'
        ],
        category: 'et'
      },

      'icecek': {
        keywords: [
          'Çetinkaya', 'Schweppes', 'Cola', 'Gazoz', 'Soda', 'Ice Tea',
          'Limonata', 'Fuse Tea', 'Cappy', 'Fruko', 'Pepsi', 'Yedigün',
          'Fanta', 'Sprite'
        ],
        exact_matches: [
          'Coca Cola', 'Coca-Cola', 'Pepsi', 'Sprite', 'Fanta',
          'Yedigün', 'Cappy', 'Schweppes', 'Fuse Tea',
          'Cappy Nane Aromalı & Limonlu İçecek'
        ],
        brands: [
          'Coca Cola', 'Pepsi', 'Fanta', 'Sprite', 'Schweppes',
          'Cappy', 'Fuse Tea', 'Yedigün', 'Fruko'
        ],
        blacklist: [
          'aromalı', 'tadında', 'Mesterini', 'Masterini', 'Ace',
          'Danone', 'temizlik', 'deterjan', 'şampuan'
        ],
        category: 'icecekler'
      },

      'bespara': {
        keywords: [
          // Elektronik
          'şarj', 'kablo', 'adaptör', 'kulaklık', 'powerbank',
          'batarya', 'bluetooth', 'mouse', 'klavye', 'hoparlör',
          'speaker', 'led', 'ampul', 'pil',
          // Çakmak ve Kibrit
          'çakmak', 'kibrit', 'mum',
          // El Aletleri
          'makas', 'tırnak makası', 'el feneri', 'ledli',
          // Yapıştırıcılar
          'japon yapıştırıcı', 'yapıştırıcı',
          // Diğer
          'şemsiye', 'parlatıcı', 'yara bandı', 'para bandı', 'süngeri'
        ],
        exact_matches: [
          'İ-Ligter Fenerbahçeli Çakmak', 'İ-Ligter Beşiktaşlı Çakmak',
          'İ-Ligter Galatasaraylı Çakmak', 'Koko Hello Kitty Çakmak',
          'Standart Mum', 'Koko Mutfak Çakmağı', 'Kav Kibrit',
          'K Smart El Feneri Ledli K-4160', 'Three Five 555 Tırnak Makası',
          'Parlo Parlatıcı Ayakkabı Süngeri', 'Cansın Yara Bandı',
          'ATC Led Ampul', 'Daımond Aa Kalem Pil', 'Tgb Kumanda Pil',
          'Panasonic İnce Pil', 'Panasonic Kalem Pil',
          'Maped Advanced Gel Makas', 'Mikro Para Bandı',
          'Quckstar Japon Yapıştırıcı', '502 Japon Yapıştırıcı',
          'Orjin Erkek Şemsiye'
        ],
        brands: [
          'İ-Ligter', 'Koko', 'K Smart', 'Three Five', 'Parlo',
          'Cansın', 'ATC', 'Daımond', 'Tgb', 'Panasonic', 'Maped',
          'Mikro', 'Quckstar', 'Orjin'
        ],
        blacklist: [
          'gıda', 'yiyecek', 'içecek', 'Doyfarm', 'Banvit', 'Damla',
          'Hasata', 'Tamek', 'temizlik', 'deterjan', 'şampuan'
        ],
        category: 'bespara'
      }
    };

    // Marka bazlı kategori eşleştirmeleri
    const brand_category_mapping = {
      'ülker': 'atistirma',
      'eti': 'atistirma',
      'nestle': 'atistirma',
      'torku': 'atistirma',
      'pınar': 'sut',
      'sütaş': 'sut',
      'duru': 'makarna',
      'fairy': 'temizlik',
      'domestos': 'temizlik',
      'persil': 'temizlik',
      'ariel': 'temizlik',
      'colgate': 'kisisel',
      'sensodyne': 'kisisel'
    };

    const determine_category = (product_name, brand = null) => {
      const product_name_lower = product_name.toLowerCase();
      
      // İçecek kontrolü
      if (product_name_lower.includes('cappy') || 
          product_name_lower.includes('fuse tea') ||
          product_name_lower.includes('coca cola') ||
          product_name_lower.includes('pepsi') ||
          product_name_lower.includes('sprite') ||
          product_name_lower.includes('fanta') ||
          product_name_lower.includes('schweppes') ||
          product_name_lower.includes('yedigün') ||
          product_name_lower.includes('fruko')) {
        return 'icecekler';
      }

      // Önce temizlik ürünlerini kontrol et
      if (product_name_lower.includes('deterjan') || 
          product_name_lower.includes('temizlik') ||
          product_name_lower.includes('temizleyici') ||
          product_name_lower.includes('çamaşır') ||
          product_name_lower.includes('bulaşık') ||
          product_name_lower.includes('domestos') ||
          product_name_lower.includes('persil') ||
          product_name_lower.includes('bingo') ||
          product_name_lower.includes('ariel')) {
        return 'temizlik';
      }
      
      // Sonra "Toz" içeren ürünleri kontrol et
      if (product_name_lower.includes('toz')) {
        if (product_name_lower.includes('toz deterjan') || 
            product_name_lower.includes('çamaşır tozu') || 
            product_name_lower.includes('temizlik tozu') ||
            product_name_lower.includes('bulaşık tozu')) {
          return 'temizlik';
        }
        
        if (product_name_lower.includes('toz içecek') ||
            product_name_lower.includes('toz form') ||
            product_name_lower.includes('nescafe') ||
            product_name_lower.includes('kahve')) {
          return 'tozicecekler';
        }
      }
      
      // Detax ürünlerini kontrol et
      if (product_name_lower.includes('detax')) {
        return 'temizlik';
      }
      
      // Bespara kategorisi için kontrol
      if (product_name_lower.includes('çakmak') || 
          product_name_lower.includes('kibrit') ||
          product_name_lower.includes('mum') ||
          product_name_lower.includes('makas') ||
          product_name_lower.includes('pil') ||
          product_name_lower.includes('ampul') ||
          product_name_lower.includes('yapıştırıcı') ||
          product_name_lower.includes('şemsiye') ||
          product_name_lower.includes('yara bandı') ||
          product_name_lower.includes('para bandı') ||
          product_name_lower.includes('el feneri')) {
        return 'bespara';
      }
      
      // Elektronik aksesuarlar için kontrol
      if (product_name_lower.includes('şarj') || 
          product_name_lower.includes('kablo') || 
          product_name_lower.includes('adaptör') ||
          product_name_lower.includes('kulaklık') ||
          product_name_lower.includes('powerbank') ||
          product_name_lower.includes('batarya') ||
          product_name_lower.includes('bluetooth') ||
          product_name_lower.includes('mouse') ||
          product_name_lower.includes('klavye') ||
          product_name_lower.includes('hoparlör') ||
          product_name_lower.includes('speaker')) {
        return 'bespara';
      }
      
      // Önce marka bazlı kontrol
      if (brand && brand.toLowerCase() in brand_category_mapping) {
        // Marka eşleşse bile blacklist kontrolü yap
        const category = brand_category_mapping[brand.toLowerCase()];
        const rule = category_rules[Object.keys(category_rules).find(key => category_rules[key].category === category)];
        
        if (rule && rule.blacklist && 
            !rule.blacklist.some(word => product_name_lower.includes(word.toLowerCase()))) {
          return category;
        }
      }
      
      // Exact matches kontrolü (en güvenilir eşleşme)
      for (const [category_key, rule] of Object.entries(category_rules)) {
        if (rule.exact_matches && rule.exact_matches.some(match => {
          const matchLower = match.toLowerCase();
          return product_name_lower === matchLower || 
                 product_name_lower.startsWith(matchLower + ' ') ||
                 product_name_lower.endsWith(' ' + matchLower) ||
                 product_name_lower.includes(' ' + matchLower + ' ');
        })) {
          if (!rule.blacklist || !rule.blacklist.some(word => 
              product_name_lower.includes(word.toLowerCase()))) {
            return rule.category;
          }
        }
      }
      
      // İçecek markaları kontrolü
      if (category_rules.icecek.brands && 
          category_rules.icecek.brands.some(brand => {
            const brandLower = brand.toLowerCase();
            return product_name_lower.startsWith(brandLower + ' ') ||
                   product_name_lower.endsWith(' ' + brandLower) ||
                   product_name_lower.includes(' ' + brandLower + ' ');
          })) {
        if (!category_rules.icecek.blacklist.some(word => 
            product_name_lower.includes(word.toLowerCase()))) {
          return category_rules.icecek.category;
        }
      }
      
      // Keyword bazlı kontrol (en son çare)
      for (const [category_key, rule] of Object.entries(category_rules)) {
        for (const keyword of rule.keywords) {
          const keywordLower = keyword.trim().toLowerCase();
          // Tam kelime eşleşmesi için regex
          const regex = new RegExp(`(^|\\s)${keywordLower}(\\s|$)`, 'i');
          
          if (regex.test(product_name_lower)) {
            // Blacklist kontrolü
            if (!rule.blacklist || !rule.blacklist.some(word => 
                product_name_lower.includes(word.toLowerCase()))) {
              // Ek güvenlik kontrolleri
              if (category_key === 'et' && product_name_lower.includes('makarna')) {
                continue;
              }
              if (category_key === 'sut' && product_name_lower.includes('şampuan')) {
                continue;
              }
              if (category_key === 'icecek' && 
                  (product_name_lower.includes('şampuan') || 
                   product_name_lower.includes('temizlik'))) {
                continue;
              }
              return rule.category;
            }
          }
        }
      }
      
      return 'gida'; // Varsayılan kategori
    };

    // Her ürün için kategori belirle ve güncelle
    let updated_count = 0;
    const categories_count = {};

    for (const product of products) {
      const old_category = product.category || 'Bilinmiyor';
      const new_category = determine_category(product.name, product.brand);
      
      if (old_category !== new_category) {
        await Product.updateOne(
          { _id: product._id },
          { $set: { category: new_category } }
        );
        updated_count++;
      }
      
      // Kategori istatistiklerini güncelle
      categories_count[new_category] = (categories_count[new_category] || 0) + 1;
    }

    // Sonuçları hazırla
    const results = {
      totalUpdated: updated_count,
      categoryDistribution: categories_count
    };

    res.status(200).json({
      success: true,
      message: `${updated_count} ürünün kategorisi güncellendi.`,
      results
    });

  } catch (error) {
    console.error('Kategori güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler güncellenirken bir hata oluştu.',
      error: error.message
    });
  }
};