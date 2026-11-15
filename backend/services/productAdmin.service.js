// Yönetici ürün işlemlerinin ortak kuralları: fiyat doğrulama, toplu fiyat değişikliğinde indirim
// ve flaş indirim hesabı, stok durumu (outOfStockSince) ve panele canlı bildirim (productsChanged).
// Hesap kısmı saf fonksiyonlardır; testler veritabanı olmadan çalışır.
import { roundMoney, toKurus } from "./productPricing.js";
import { flashPrice } from "./flashSale.service.js";

// ─────────────────────────────────────────────
// Fiyat okuma / doğrulama
// ─────────────────────────────────────────────
export const PRICE_REQUIRED_MESSAGE = "Fiyat alanı zorunludur";
export const PRICE_INVALID_MESSAGE = "Geçerli bir fiyat girin";
export const PRICE_NOT_POSITIVE_MESSAGE = "Fiyat 0 ₺ ya da daha düşük olamaz";

/**
 * Para girdisini sayıya çevirir: 12.5, "12,50", "12.50", "1.250,50", "₺ 12,50", "12,50 TL".
 * Anlaşılamayan değer NaN döner (boş değer de NaN).
 */
export const parseMoneyInput = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  let text = value.replace(/\s|₺/g, "").replace(/(tl|try)$/i, "");
  if (!text || !/^[+-]?[\d.,]+$/.test(text)) return NaN;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // İkisi de varsa sonda olan ondalık ayırıcıdır: "1.250,50" ve "1,250.50"
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    text = text.split(thousands).join("");
    if (text.indexOf(decimal) !== text.lastIndexOf(decimal)) return NaN;
    text = text.replace(decimal, ".");
  } else if (lastComma >= 0) {
    if (text.indexOf(",") !== lastComma) return NaN;
    text = text.replace(",", ".");
  } else if (lastDot >= 0 && text.indexOf(".") !== lastDot) {
    return NaN;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
};

/** Fiyatı okur: { price } (kuruşa yuvarlanmış, > 0) ya da { error } (Türkçe açıklama) */
export const readPrice = (value) => {
  if (value === undefined || value === null || value === "") return { error: PRICE_REQUIRED_MESSAGE };
  const n = parseMoneyInput(value);
  if (!Number.isFinite(n)) return { error: PRICE_INVALID_MESSAGE };
  const price = roundMoney(n);
  if (toKurus(price) <= 0) return { error: PRICE_NOT_POSITIVE_MESSAGE };
  return { price };
};

/** İndirimli fiyatı okur: 0'dan büyük ve liste fiyatından küçük olmalı */
export const readDiscountedPrice = (value, listPrice) => {
  const n = parseMoneyInput(value);
  if (!Number.isFinite(n)) return { error: "Geçerli bir indirimli fiyat girin" };
  const discountedPrice = roundMoney(n);
  if (toKurus(discountedPrice) <= 0) return { error: "İndirimli fiyat 0 ₺ ya da daha düşük olamaz" };
  if (toKurus(discountedPrice) >= toKurus(listPrice)) return { error: "İndirimli fiyat normal fiyattan düşük olmalı" };
  return { discountedPrice };
};

// ─────────────────────────────────────────────
// Toplu fiyat değişikliği
// ─────────────────────────────────────────────
export const BULK_PRICE_TYPES = ["set", "increase", "decrease", "percentage"];
// keepRatio: indirim oranı korunur · keepPrice: indirimli fiyat sabit kalır · remove: indirim kalkar
export const DISCOUNT_MODES = ["keepRatio", "keepPrice", "remove"];
export const DEFAULT_DISCOUNT_MODE = "keepRatio";

/** Kuralın ürünün liste fiyatına uygulanmış hâli (kuruşa yuvarlanmış; ≤ 0 olabilir, çağıran reddeder) */
export const bulkNewPrice = (oldPrice, priceType, priceValue) => {
  const price = Number(oldPrice) || 0;
  const value = Number(priceValue);
  switch (priceType) {
    case "set": return roundMoney(value);
    case "increase": return roundMoney(price + value);
    case "decrease": return roundMoney(price - value);
    case "percentage": return roundMoney(price * (1 + value / 100));
    default: return NaN;
  }
};

/**
 * Liste fiyatı oldPrice → newPrice olunca indirimli fiyatın yeni değeri (kaldırılacaksa null).
 * Sonuç her zaman kuruşa yuvarlıdır ve yeni liste fiyatının altındadır.
 */
export const scaleDiscount = (discounted, oldPrice, newPrice, mode = DEFAULT_DISCOUNT_MODE) => {
  if (discounted === null || discounted === undefined || discounted === "") return null;
  const d = Number(discounted);
  if (!Number.isFinite(d) || d < 0) return null;
  const newK = toKurus(newPrice);
  if (mode === "remove") return null;
  if (mode === "keepPrice") return toKurus(d) < newK ? roundMoney(d) : null;
  const oldK = toKurus(oldPrice);
  // Eski indirim zaten geçersizse (liste fiyatının altında değilse) oranı korunmaz, kaldırılır
  if (oldK <= 0 || toKurus(d) >= oldK) return null;
  let k = Math.round((newK * toKurus(d)) / oldK);
  if (k >= newK) k = newK - 1;
  if (k > 0) return k / 100;
  return toKurus(d) === 0 && newK > 0 ? 0 : null;
};

/** Ürün şu an flaş indirim fiyatıyla mı satılıyor? (flashSale.service'in yazdığı özet + eşleşen indirimli fiyat) */
export const isOnFlashPrice = (product) => {
  const info = product?.flashSale;
  if (!info?.sale || !product.isDiscounted) return false;
  const pct = Number(info.discountPercentage);
  if (!(pct > 0 && pct < 100)) return false;
  return Number.isFinite(Number(info.price)) && Math.abs(Number(product.discountedPrice) - Number(info.price)) < 0.01;
};

/** Müşterinin ödediği fiyat (haftalık fırsat hariç): geçerli indirim varsa o, yoksa liste fiyatı */
export const customerPriceOf = (price, isDiscounted, discountedPrice) => {
  const d = Number(discountedPrice);
  const valid = isDiscounted && discountedPrice !== null && discountedPrice !== undefined && Number.isFinite(d) && d >= 0 && toKurus(d) < toKurus(price);
  return roundMoney(valid ? d : price);
};

/**
 * Tek ürün için toplu fiyat değişikliği planı (hiçbir şey kaydetmez).
 * @param product { price, isDiscounted, discountedPrice, flashSale }
 * @param rule { priceType, priceValue, discountMode }
 * @param sale ürünün süren flaş indirim kaydı (FlashSale; yoksa null)
 * @returns {{ oldPrice, price, isDiscounted, discountedPrice, customerBefore, customerAfter, discountRemoved,
 *   flash: null | { percentage, oldPrice, price, previousIsDiscounted, previousDiscountedPrice } }}
 */
export const planBulkPrice = (product, { priceType, priceValue, discountMode = DEFAULT_DISCOUNT_MODE }, sale = null) => {
  const oldPrice = roundMoney(product.price);
  const price = bulkNewPrice(product.price, priceType, priceValue);
  const customerBefore = customerPriceOf(oldPrice, product.isDiscounted, product.discountedPrice);
  const plan = { oldPrice, price, isDiscounted: false, discountedPrice: null, customerBefore, customerAfter: price, discountRemoved: false, flash: null };
  if (!(toKurus(price) > 0)) return plan;

  if (isOnFlashPrice(product)) {
    // Flaş indirim sürerken indirimli fiyat = flaş fiyatıdır: yeni liste fiyatından aynı yüzdeyle yeniden hesaplanır
    const percentage = Number(sale?.discountPercentage ?? product.flashSale.discountPercentage);
    let flashK = toKurus(flashPrice(price, percentage));
    if (flashK >= toKurus(price)) flashK = toKurus(price) - 1;
    const flash = Math.max(0, flashK) / 100;
    const previous = sale?.previousIsDiscounted ? scaleDiscount(sale.previousDiscountedPrice, oldPrice, price, discountMode) : null;
    plan.isDiscounted = true;
    plan.discountedPrice = flash;
    plan.flash = {
      percentage,
      oldPrice: roundMoney(product.discountedPrice),
      price: flash,
      previousIsDiscounted: previous !== null,
      previousDiscountedPrice: previous,
    };
  } else if (product.isDiscounted) {
    const next = scaleDiscount(product.discountedPrice, oldPrice, price, discountMode);
    plan.isDiscounted = next !== null;
    plan.discountedPrice = next;
    plan.discountRemoved = next === null;
  }
  plan.customerAfter = customerPriceOf(price, plan.isDiscounted, plan.discountedPrice);
  return plan;
};

// ─────────────────────────────────────────────
// Stok durumu
// ─────────────────────────────────────────────
/**
 * Stok durumunu ayarlar (tersine çevirmez). Ürün tükendi yapılınca outOfStockSince yazılır, stoka
 * alınınca silinir. Zaten tükenmiş ürün yeniden "tükendi" yapılırsa ilk tarih korunur.
 * @returns {boolean} durum değişti mi
 */
export const applyStockState = (product, isOutOfStock, now = new Date()) => {
  const next = Boolean(isOutOfStock);
  const was = Boolean(product.isOutOfStock);
  product.isOutOfStock = next;
  if (!next) product.outOfStockSince = null;
  else if (!was) product.outOfStockSince = now;
  return was !== next;
};

// ─────────────────────────────────────────────
// Canlı bildirim
// ─────────────────────────────────────────────
// Bu sayıdan fazla ürün değiştiyse tek tek alanlar yerine "listeyi yenile" bildirilir
export const PRODUCTS_CHANGED_MAX = 300;

/**
 * Yönetici odasına "productsChanged" olayı gönderir; açık Ürünler ekranları satırları yerinde günceller.
 * @param ids değişen ürün kimlikleri
 * @param changes tüm ürünler için ortak alanlar ({ isHidden: true } gibi)
 * @param options.products ürün bazında farklı alanlar: [{ _id, price, ... }]
 * @param options.reload true ise ekran listeyi yeniden çeker (yeni ürün, silme dışı büyük değişiklik)
 */
export const emitProductsChanged = (req, ids = [], changes = {}, { products, reload = false } = {}) => {
  try {
    const io = req?.app?.get?.("io");
    if (!io) return false;
    const list = [...new Set((ids || []).map(String))];
    const tooMany = list.length > PRODUCTS_CHANGED_MAX;
    io.to("adminRoom").emit("productsChanged", {
      ids: tooMany ? [] : list,
      changes: tooMany ? {} : changes || {},
      ...(products && !tooMany ? { products } : {}),
      ...(reload || tooMany ? { reload: true } : {}),
      count: list.length,
      at: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error("productsChanged bildirimi gönderilemedi:", error.message);
    return false;
  }
};

/** Bildirimde / yanıtta kullanılan fiyat alanları */
export const priceFieldsOf = (product) => ({
  price: product.price,
  isDiscounted: Boolean(product.isDiscounted),
  discountedPrice: product.discountedPrice ?? null,
});
