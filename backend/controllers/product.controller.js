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
    // Önce indirimli ürünleri getir
    const discountedProducts = await Product.find({
      isDiscounted: true,
      isHidden: false,
    }).sort({ discountedPrice: 1 }); // İndirimli fiyata göre sırala

    // Sonra öne çıkan ve indirimde olmayan ürünleri getir
    const featuredProducts = await Product.find({
      isFeatured: true,
      isHidden: false,
      isDiscounted: false, // İndirimde olmayan öne çıkan ürünler
    }).sort({ order: 1 });

    // Tüm ürünleri birleştir (önce indirimli sonra öne çıkan)
    const allFeaturedProducts = [...discountedProducts, ...featuredProducts];

    res.json(allFeaturedProducts);
  } catch (error) {
    console.error("Öne çıkan ürünler getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
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
      { $sample: { size: 9 } }, // 4 yerine 9 ürün getir
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
    product.image = cloudinaryResponse.secure_url;
    await product.save();

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
    const { discountedPrice } = req.body;
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    if (discountedPrice >= product.price) {
      return res.status(400).json({ message: "İndirimli fiyat normal fiyattan yüksek olamaz" });
    }

    product.isDiscounted = true;
    product.discountedPrice = discountedPrice;
    await product.save();

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

    product.isDiscounted = false;
    product.discountedPrice = null;
    await product.save();

    res.json({ message: "İndirim başarıyla kaldırıldı", product });
  } catch (error) {
    console.error("İndirim kaldırma hatası:", error);
    res.status(500).json({ message: "İndirim kaldırılırken hata oluştu" });
  }
};