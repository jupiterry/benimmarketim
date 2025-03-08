import { optimizeImage, deleteImage } from '../services/imageService.js';

// ... existing code ...

export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Resim yüklenmedi' });
    }

    const optimizedImage = await optimizeImage(req.file);
    
    // Ürünü güncelle
    const product = await Product.findByIdAndUpdate(
      req.params.productId,
      { 
        image: `/uploads/${optimizedImage.filename}`,
        thumbnail: `/uploads/${optimizedImage.thumbnailFilename}`
      },
      { new: true }
    );

    if (!product) {
      await deleteImage(optimizedImage.filename);
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    res.status(200).json({
      success: true,
      image: product.image,
      thumbnail: product.thumbnail
    });
  } catch (error) {
    console.error('Resim yükleme hatası:', error);
    res.status(500).json({ success: false, message: 'Resim yüklenirken bir hata oluştu' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    // Ürüne ait resimleri sil
    if (product.image) {
      const filename = product.image.split('/').pop();
      await deleteImage(filename);
    }

    await product.remove();
    
    res.status(200).json({ success: true, message: 'Ürün başarıyla silindi' });
  } catch (error) {
    console.error('Ürün silme hatası:', error);
    res.status(500).json({ success: false, message: 'Ürün silinirken bir hata oluştu' });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, sort } = req.query;
    
    let query = {};
    
    // Metin araması
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ];
    }

    // Kategori filtresi
    if (category) {
      query.category = category;
    }

    // Fiyat aralığı
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Stokta olan ürünler
    query.isHidden = false;

    // Sıralama seçenekleri
    let sortOption = {};
    switch (sort) {
      case 'price_asc':
        sortOption = { price: 1 };
        break;
      case 'price_desc':
        sortOption = { price: -1 };
        break;
      case 'name_asc':
        sortOption = { name: 1 };
        break;
      case 'name_desc':
        sortOption = { name: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .sort(sortOption)
      .select('-__v');

    // Kategorileri de getir
    const categories = await Product.distinct('category');

    // Fiyat aralığını bul
    const priceRange = await Product.aggregate([
      { $match: { isHidden: false } },
      {
        $group: {
          _id: null,
          min: { $min: '$price' },
          max: { $max: '$price' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      products,
      categories,
      priceRange: priceRange[0] || { min: 0, max: 0 },
      total: products.length
    });
  } catch (error) {
    console.error('Arama hatası:', error);
    res.status(500).json({ success: false, message: 'Arama sırasında bir hata oluştu' });
  }
}; 