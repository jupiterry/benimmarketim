import Product from "../models/product.model.js";
import {
  describeAssistFailure,
  downloadImage,
  identifyProductPhoto,
  makeTransparentProductImage,
  searchProductImages,
} from "../services/productAssist.service.js";

const PHOTO_PATTERN = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO_BASE64 = 8 * 1024 * 1024;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fail = (res, error, label) => {
  console.error(`Ürün asistanı (${label}):`, error?.name === "AbortError" ? "zaman aşımı" : error?.message);
  const { status, message } = describeAssistFailure(error);
  return res.status(status).json({ success: false, message });
};

// Katalogda benzer adlı ürün var mı? (ilk iki anlamlı kelimeyle kaba bir kontrol)
const findSimilarProducts = async (name) => {
  const words = name.split(/\s+/).filter((word) => word.length > 2 && !/^\d/.test(word)).slice(0, 2);
  if (!words.length) return [];
  const conditions = words.map((word) => ({ name: { $regex: escapeRegex(word), $options: "i" } }));
  return Product.find({ $and: conditions }).select("name price category image").limit(5).lean();
};

/** POST /api/product-assist/identify  { photo: dataURL } → ad ve kategori seçenekleri */
export const identifyPhoto = async (req, res) => {
  const photo = typeof req.body?.photo === "string" ? req.body.photo : "";
  const match = photo.match(PHOTO_PATTERN);
  if (!match || match[2].length > MAX_PHOTO_BASE64) {
    return res.status(400).json({ success: false, message: "Geçerli bir ürün fotoğrafı yükleyin (JPEG, PNG veya WebP)." });
  }
  try {
    const result = await identifyProductPhoto({ mimeType: match[1], base64: match[2] });
    let similar = [];
    if (result.names[0]) {
      try { similar = await findSimilarProducts(result.names[0]); } catch { /* kontrol yapılamazsa akış sürer */ }
    }
    return res.json({ success: true, ...result, similar });
  } catch (error) {
    return fail(res, error, "tanıma");
  }
};

/** POST /api/product-assist/images  { query } → görsel seçenekleri */
export const findImages = async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.replace(/\s+/g, " ").trim() : "";
  if (query.length < 3 || query.length > 120) {
    return res.status(400).json({ success: false, message: "Aranacak ürün adı 3–120 karakter olmalı." });
  }
  try {
    const images = await searchProductImages(query);
    return res.json({ success: true, images });
  } catch (error) {
    return fail(res, error, "görsel arama");
  }
};

/** POST /api/product-assist/prepare-image  { imageUrl } → arka planı kaldırılmış kare görsel (data URL) */
export const prepareImage = async (req, res) => {
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
  if (!imageUrl) return res.status(400).json({ success: false, message: "Görsel bağlantısı gerekli." });
  try {
    const source = await downloadImage(imageUrl);
    const { buffer, backgroundRemoved, reason } = await makeTransparentProductImage(source);
    return res.json({
      success: true,
      image: `data:image/webp;base64,${buffer.toString("base64")}`,
      backgroundRemoved,
      reason,
    });
  } catch (error) {
    return fail(res, error, "görsel hazırlama");
  }
};
