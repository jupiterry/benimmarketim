import FlashSale from "../models/flashSale.model.js";
import Product from "../models/product.model.js";

// Tüm flash sale'leri getir
export const getAllFlashSales = async (req, res) => {
  try {
    const flashSales = await FlashSale.find()
      .populate("product")
      .sort({ startDate: -1 });
    
    res.json({ flashSales });
  } catch (error) {
    console.error("Flash sale'ler getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Aktif flash sale'leri getir
export const getActiveFlashSales = async (req, res) => {
  try {
    const now = new Date();
    const flashSales = await FlashSale.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
      .populate("product")
      .sort({ endDate: 1 });
    
    res.json({ flashSales });
  } catch (error) {
    console.error("Aktif flash sale'ler getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Yeni flash sale oluştur
export const createFlashSale = async (req, res) => {
  try {
    const { productId, discountPercentage, startDate, endDate, name } = req.body;

    // Validasyon
    if (!productId || !discountPercentage || !startDate || !endDate) {
      return res.status(400).json({ message: "Tüm alanları doldurun" });
    }

    if (discountPercentage < 1 || discountPercentage > 99) {
      return res.status(400).json({ message: "İndirim oranı 1-99 arasında olmalı" });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: "Bitiş tarihi başlangıç tarihinden sonra olmalı" });
    }

    // Ürünü kontrol et
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı" });
    }

    // Flash sale oluştur
    const flashSale = new FlashSale({
      product: productId,
      discountPercentage,
      startDate,
      endDate,
      name: name || `${product.name} - Flash Sale`
    });

    await flashSale.save();

    // Ürüne indirimi uygula
    const discountedPrice = product.price * (1 - discountPercentage / 100);
    product.discountedPrice = discountedPrice;
    product.isDiscounted = true;
    await product.save();

    res.status(201).json({ 
      message: "Flash sale oluşturuldu", 
      flashSale: await flashSale.populate("product")
    });
  } catch (error) {
    console.error("Flash sale oluşturulurken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Flash sale güncelle
export const updateFlashSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, discountPercentage, startDate, endDate, name } = req.body;

    const flashSale = await FlashSale.findById(id);
    if (!flashSale) {
      return res.status(404).json({ message: "Flash sale bulunamadı" });
    }

    // Validasyon
    if (discountPercentage && (discountPercentage < 1 || discountPercentage > 99)) {
      return res.status(400).json({ message: "İndirim oranı 1-99 arasında olmalı" });
    }

    // Güncelle
    if (productId) flashSale.product = productId;
    if (discountPercentage) flashSale.discountPercentage = discountPercentage;
    if (startDate) flashSale.startDate = startDate;
    if (endDate) flashSale.endDate = endDate;
    if (name !== undefined) flashSale.name = name;

    await flashSale.save();

    // Ürüne indirimi uygula
    const product = await Product.findById(flashSale.product);
    if (product) {
      const discountedPrice = product.price * (1 - flashSale.discountPercentage / 100);
      product.discountedPrice = discountedPrice;
      product.isDiscounted = true;
      await product.save();
    }

    res.json({ 
      message: "Flash sale güncellendi", 
      flashSale: await flashSale.populate("product")
    });
  } catch (error) {
    console.error("Flash sale güncellenirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Flash sale sil
export const deleteFlashSale = async (req, res) => {
  try {
    const { id } = req.params;

    const flashSale = await FlashSale.findById(id);
    if (!flashSale) {
      return res.status(404).json({ message: "Flash sale bulunamadı" });
    }

    // Üründen indirimi kaldır
    const product = await Product.findById(flashSale.product);
    if (product) {
      product.discountedPrice = null;
      product.isDiscounted = false;
      await product.save();
    }

    await flashSale.deleteOne();

    res.json({ message: "Flash sale silindi" });
  } catch (error) {
    console.error("Flash sale silinirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Süresi dolan flash sale'leri temizle (cron job için)
export const cleanExpiredFlashSales = async () => {
  try {
    const now = new Date();
    const expiredSales = await FlashSale.find({
      endDate: { $lt: now },
      isActive: true
    });

    for (const sale of expiredSales) {
      // Üründen indirimi kaldır
      const product = await Product.findById(sale.product);
      if (product && product.isDiscounted) {
        product.discountedPrice = null;
        product.isDiscounted = false;
        await product.save();
      }

      // Flash sale'i pasif yap
      sale.isActive = false;
      await sale.save();
    }

    console.log(`${expiredSales.length} süresi dolmuş flash sale temizlendi`);
  } catch (error) {
    console.error("Flash sale temizlenirken hata:", error);
  }
};

