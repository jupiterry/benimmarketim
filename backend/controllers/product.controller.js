import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import Product from "../models/product.model.js";

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
      const { category } = req.params;

      const products = await Product.find({
          category: { $regex: new RegExp(category, "i") }, // Büyük/küçük harf duyarsız filtreleme
      });

      if (!products.length) {
          return res.status(404).json({ message: "Bu kategoriye ait ürün bulunamadı." });
      }

      res.json({ products });
  } catch (error) {
      console.error("Error in getProductsByCategory controller:", error.message);
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

export const getProducts = async (req, res) => {
  try {
    console.log("Get products request received with query:", req.query); // Debug log
    const { category } = req.query;
    let query = {}; // Admin için tüm ürünleri getir (isHidden dahil)

    if (category) {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }

    const products = await Product.find(query);
    console.log("Products fetched:", products.length);
    res.json({ products });
  } catch (error) {
    console.log("Error in getProducts controller", error.message);
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
    const { name, category, subcategory, isHidden } = req.body;
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

    const updatedProduct = await product.save();

    // Cache’i güncelle (featured_products varsa)
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
