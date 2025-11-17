import Banner from "../models/banner.model.js";

// Tüm banner'ları getir (public - sadece aktif olanlar)
export const getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      banners,
    });
  } catch (error) {
    console.error("Banner'lar getirilirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Sunucu hatası",
      error: error.message,
    });
  }
};

// Tüm banner'ları getir (admin - tümü)
export const getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find()
      .sort({ order: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      banners,
    });
  } catch (error) {
    console.error("Banner'lar getirilirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Sunucu hatası",
      error: error.message,
    });
  }
};

// Yeni banner oluştur
export const createBanner = async (req, res) => {
  try {
    const { image, title, subtitle, linkUrl, isActive, order } = req.body;

    if (!image || !title) {
      return res.status(400).json({
        success: false,
        message: "Resim ve başlık zorunludur",
      });
    }

    const banner = await Banner.create({
      image,
      title,
      subtitle: subtitle || "",
      linkUrl: linkUrl || null,
      isActive: isActive !== undefined ? isActive : true,
      order: order || 0,
    });

    res.status(201).json({
      success: true,
      message: "Banner başarıyla oluşturuldu",
      banner,
    });
  } catch (error) {
    console.error("Banner oluşturulurken hata:", error);
    res.status(500).json({
      success: false,
      message: "Sunucu hatası",
      error: error.message,
    });
  }
};

// Banner güncelle
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { image, title, subtitle, linkUrl, isActive, order } = req.body;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner bulunamadı",
      });
    }

    if (image !== undefined) banner.image = image;
    if (title !== undefined) banner.title = title;
    if (subtitle !== undefined) banner.subtitle = subtitle;
    if (linkUrl !== undefined) banner.linkUrl = linkUrl;
    if (isActive !== undefined) banner.isActive = isActive;
    if (order !== undefined) banner.order = order;

    await banner.save();

    res.status(200).json({
      success: true,
      message: "Banner başarıyla güncellendi",
      banner,
    });
  } catch (error) {
    console.error("Banner güncellenirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Sunucu hatası",
      error: error.message,
    });
  }
};

// Banner sil
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner bulunamadı",
      });
    }

    await banner.deleteOne();

    res.status(200).json({
      success: true,
      message: "Banner başarıyla silindi",
    });
  } catch (error) {
    console.error("Banner silinirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Sunucu hatası",
      error: error.message,
    });
  }
};

