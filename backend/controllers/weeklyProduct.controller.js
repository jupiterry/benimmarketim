import WeeklyProduct from "../models/weeklyProduct.model.js";
import Product from "../models/product.model.js";

/**
 * Tüm aktif haftalık ürünleri getir (Public API)
 */
export const getWeeklyProducts = async (req, res) => {
  try {
    const weeklyProducts = await WeeklyProduct.find({ isActive: true })
      .populate({
        path: "product",
        select: "name price image thumbnail category description isOutOfStock isDiscounted discountedPrice",
        match: { isHidden: { $ne: true } }
      })
      .sort({ order: 1, createdAt: -1 });

    // Null olan product'ları filtrele (silinmiş veya gizli ürünler)
    const validProducts = weeklyProducts.filter(wp => wp.product !== null);

    res.json({
      success: true,
      weeklyProducts: validProducts,
    });
  } catch (error) {
    console.error("Haftalık ürünler alınırken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürünler alınırken hata oluştu",
      error: error.message,
    });
  }
};

/**
 * Admin için tüm haftalık ürünleri getir (aktif/pasif tümü)
 */
export const getAllWeeklyProducts = async (req, res) => {
  try {
    const weeklyProducts = await WeeklyProduct.find()
      .populate({
        path: "product",
        select: "name price image thumbnail category description isOutOfStock isDiscounted discountedPrice",
      })
      .sort({ order: 1, createdAt: -1 });

    res.json({
      success: true,
      weeklyProducts,
    });
  } catch (error) {
    console.error("Tüm haftalık ürünler alınırken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürünler alınırken hata oluştu",
      error: error.message,
    });
  }
};

/**
 * Yeni haftalık ürün ekle (Admin)
 */
export const addWeeklyProduct = async (req, res) => {
  try {
    const { productId, weeklyPrice, discountPercentage, endDate, order } = req.body;

    // Ürün var mı kontrol et
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Ürün bulunamadı",
      });
    }

    // Bu ürün zaten aktif haftalık ürün mü kontrol et
    const existingActive = await WeeklyProduct.findOne({
      product: productId,
      isActive: true,
    });

    if (existingActive) {
      return res.status(400).json({
        success: false,
        message: "Bu ürün zaten haftalık ürünler listesinde",
      });
    }

    // İndirim yüzdesini hesapla (verilmediyse)
    let calculatedDiscount = discountPercentage;
    if (!calculatedDiscount && weeklyPrice < product.price) {
      calculatedDiscount = Math.round(((product.price - weeklyPrice) / product.price) * 100);
    }

    const weeklyProduct = await WeeklyProduct.create({
      product: productId,
      weeklyPrice,
      discountPercentage: calculatedDiscount || 0,
      endDate: endDate || null,
      order: order || 0,
      isActive: true,
    });

    const populatedProduct = await WeeklyProduct.findById(weeklyProduct._id).populate({
      path: "product",
      select: "name price image thumbnail category description isOutOfStock",
    });

    // Socket.IO bildirimi gönder
    const io = req.app.get('io');
    if (io) {
      io.emit('weeklyProductsUpdated');
    }

    res.status(201).json({
      success: true,
      message: "Haftalık ürün eklendi",
      weeklyProduct: populatedProduct,
    });
  } catch (error) {
    console.error("Haftalık ürün eklenirken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün eklenirken hata oluştu",
      error: error.message,
    });
  }
};

/**
 * Haftalık ürünü güncelle (Admin)
 */
export const updateWeeklyProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { weeklyPrice, discountPercentage, endDate, order, isActive } = req.body;

    const weeklyProduct = await WeeklyProduct.findById(id).populate("product");
    if (!weeklyProduct) {
      return res.status(404).json({
        success: false,
        message: "Haftalık ürün bulunamadı",
      });
    }

    // İndirim yüzdesini yeniden hesapla
    let calculatedDiscount = discountPercentage;
    if (weeklyPrice && weeklyProduct.product && weeklyPrice < weeklyProduct.product.price) {
      calculatedDiscount = Math.round(
        ((weeklyProduct.product.price - weeklyPrice) / weeklyProduct.product.price) * 100
      );
    }

    weeklyProduct.weeklyPrice = weeklyPrice ?? weeklyProduct.weeklyPrice;
    weeklyProduct.discountPercentage = calculatedDiscount ?? weeklyProduct.discountPercentage;
    weeklyProduct.endDate = endDate !== undefined ? endDate : weeklyProduct.endDate;
    weeklyProduct.order = order ?? weeklyProduct.order;
    weeklyProduct.isActive = isActive ?? weeklyProduct.isActive;

    await weeklyProduct.save();

    const updatedProduct = await WeeklyProduct.findById(id).populate({
      path: "product",
      select: "name price image thumbnail category description isOutOfStock",
    });

    // Socket.IO bildirimi gönder
    const io = req.app.get('io');
    if (io) {
      io.emit('weeklyProductsUpdated');
    }

    res.json({
      success: true,
      message: "Haftalık ürün güncellendi",
      weeklyProduct: updatedProduct,
    });
  } catch (error) {
    console.error("Haftalık ürün güncellenirken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün güncellenirken hata oluştu",
      error: error.message,
    });
  }
};

/**
 * Haftalık ürünü kaldır (Admin)
 */
export const removeWeeklyProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const weeklyProduct = await WeeklyProduct.findByIdAndDelete(id);
    if (!weeklyProduct) {
      return res.status(404).json({
        success: false,
        message: "Haftalık ürün bulunamadı",
      });
    }

    // Socket.IO bildirimi gönder
    const io = req.app.get('io');
    if (io) {
      io.emit('weeklyProductsUpdated');
    }

    res.json({
      success: true,
      message: "Haftalık ürün kaldırıldı",
    });
  } catch (error) {
    console.error("Haftalık ürün kaldırılırken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün kaldırılırken hata oluştu",
      error: error.message,
    });
  }
};

/**
 * Haftalık ürün durumunu toggle et (Admin)
 */
export const toggleWeeklyProductStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const weeklyProduct = await WeeklyProduct.findById(id);
    if (!weeklyProduct) {
      return res.status(404).json({
        success: false,
        message: "Haftalık ürün bulunamadı",
      });
    }

    weeklyProduct.isActive = !weeklyProduct.isActive;
    await weeklyProduct.save();

    const updatedProduct = await WeeklyProduct.findById(id).populate({
      path: "product",
      select: "name price image thumbnail category description isOutOfStock",
    });

    // Socket.IO bildirimi gönder
    const io = req.app.get('io');
    if (io) {
      io.emit('weeklyProductsUpdated');
    }

    res.json({
      success: true,
      message: `Haftalık ürün ${weeklyProduct.isActive ? "aktif" : "pasif"} edildi`,
      weeklyProduct: updatedProduct,
    });
  } catch (error) {
    console.error("Haftalık ürün durumu değiştirilirken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün durumu değiştirilirken hata oluştu",
      error: error.message,
    });
  }
};
