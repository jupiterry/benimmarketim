import Banner from "../models/banner.model.js";
import cloudinary from "../lib/cloudinary.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

// Yönetici panelinin dosya yükleyicisi: base64 veri adresi (data:image/...) alır, Cloudinary'ye
// "banners" klasörüne yükler ve kalıcı adresi döner. Vitrin görseli kaydı bu adresle oluşturulur;
// veritabanına base64 yazılmaz (mobil uygulama aynı kayıtları okuyor).
export const BANNER_UPLOAD_MAX_BYTES = 6 * 1024 * 1024; // ~6 MB (base64 öncesi yaklaşık 4,5 MB dosya)
export const BANNER_UPLOAD_TYPES = ["jpeg", "jpg", "png", "webp", "gif", "avif"];

/** Yüklenecek görseli doğrular; sorun varsa Türkçe hata mesajı, yoksa null döner. */
export const validateBannerUpload = (image) => {
  if (typeof image !== "string" || !image) return "Görsel verisi zorunludur";
  const match = /^data:image\/([a-z0-9.+-]+);base64,/i.exec(image);
  if (!match) return "Görsel base64 veri adresi (data:image/...) olarak gönderilmeli";
  const type = match[1].toLowerCase().replace("svg+xml", "svg");
  if (!BANNER_UPLOAD_TYPES.includes(type)) return "Yalnızca JPG, PNG, WebP, GIF ya da AVIF görsel yüklenebilir";
  if (image.length > BANNER_UPLOAD_MAX_BYTES) return "Görsel çok büyük (en fazla 4,5 MB)";
  return null;
};

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


// Vitrin görseli yükle (admin) → { success, url, width, height }
export const uploadBannerImage = async (req, res) => {
  try {
    const { image } = req.body || {};
    const error = validateBannerUpload(image);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const uploaded = await cloudinary.uploader.upload(image, { folder: "banners" });
    recordAdminAction(req, {
      action: "Vitrin görseli yüklendi",
      category: "campaign",
      target: uploaded.public_id || "",
      targetName: "Vitrin görseli",
      changes: [{ label: "Görsel", from: "—", to: uploaded.secure_url }],
    });

    res.status(201).json({
      success: true,
      url: uploaded.secure_url,
      width: uploaded.width ?? null,
      height: uploaded.height ?? null,
    });
  } catch (error) {
    console.error("Vitrin görseli yüklenirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Görsel yüklenemedi",
      error: error.message,
    });
  }
};
