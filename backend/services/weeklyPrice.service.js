// Ürün listelerine müşteriye gösterilecek fiyatı ekler (tüm ürün uç noktaları bunu kullanır).
//   - actualPrice: siparişte alınacak birim fiyat (services/productPricing.js: haftalık fırsat,
//     ürün indirimi/flash sale ve liste fiyatının en düşüğü). Her üründe bulunur.
//   - haftalık üründe: isWeeklyProduct, weeklyPrice, weeklyDiscountPercentage, originalPrice
//   - flash sale sürüyorsa: flashSale { _id, discountPercentage, price, startDate, endDate }
//     (fiyat haftalık fırsattan düşükse; değilse alan gönderilmez)
// Aktif haftalık ürünler her istekte veritabanından okunmasın diye 1 dakika bellekte tutulur;
// ürünler/haftalık fırsatlar değişince productCache.service bu önbelleği de temizler.
// Sipariş fiyatı order.service.js'de her zaman veritabanından hesaplanır (bu önbellek kullanılmaz).
import WeeklyProduct from "../models/weeklyProduct.model.js";
import { liveFlashInfo, resolveUnitPrice } from "./productPricing.js";
import { invalidateProductCaches, onProductCachesInvalidated } from "./productCache.service.js";

const TTL_MS = 60 * 1000;
let cache = { map: null, at: 0, pending: null };

let version = 0;
// Haftalık fiyatlar/ürünler değiştiğinde artar; hazır ürün listesi yanıtları bununla geçersiz olur
export const getWeeklyPriceVersion = () => version;

const clearLocalWeeklyCache = () => {
  cache = { map: null, at: 0, pending: null };
  version++;
};
onProductCachesInvalidated(clearLocalWeeklyCache);

/** Haftalık fırsatlar değişince: bu süreçteki ve diğer süreçlerdeki ürün önbellekleri temizlenir */
export const invalidateWeeklyPriceCache = () => {
  invalidateProductCaches();
};

const loadWeeklyPriceMap = async () => {
  if (cache.map && Date.now() - cache.at < TTL_MS) return cache.map;
  if (cache.pending) return cache.pending;
  const pending = WeeklyProduct.find({ isActive: true })
    .populate("product")
    .lean()
    .then((weeklyProducts) => {
      const map = new Map();
      for (const wp of weeklyProducts) {
        if (wp.product && wp.product._id) {
          map.set(wp.product._id.toString(), {
            weeklyPrice: wp.weeklyPrice,
            discountPercentage: wp.discountPercentage,
            originalPrice: wp.originalPrice || wp.product.price,
          });
        }
      }
      if (cache.pending === pending) cache = { map, at: Date.now(), pending: null };
      return map;
    })
    .catch((error) => {
      if (cache.pending === pending) cache.pending = null;
      throw error;
    });
  cache.pending = pending;
  return pending;
};

const plain = (product) => (product?.toObject ? product.toObject() : product);

/** Tek ürün: actualPrice + (varsa) haftalık ve flash sale alanları */
export const decorateProduct = (product, weeklyInfo, now = new Date()) => {
  const base = { ...plain(product) };
  delete base.flashSale; // ham alan dışarı verilmez; yalnızca geçerliyse aşağıda yeniden eklenir
  const unit = resolveUnitPrice(base, weeklyInfo?.weeklyPrice);
  const out = weeklyInfo
    ? {
        ...base,
        isWeeklyProduct: true,
        weeklyPrice: weeklyInfo.weeklyPrice,
        weeklyDiscountPercentage: weeklyInfo.discountPercentage,
        originalPrice: weeklyInfo.originalPrice,
      }
    : base;
  if (base.price !== undefined) out.actualPrice = unit.price;
  const flash = unit.source === "discount" ? liveFlashInfo(plain(product), now) : null;
  if (flash) out.flashSale = flash;
  return out;
};

// Helper: Ürünlere haftalık fiyat, actualPrice ve flash sale bilgisi ekle
export async function applyWeeklyPricesToProducts(products) {
  const now = new Date();
  let weeklyPriceMap = new Map();
  try {
    weeklyPriceMap = await loadWeeklyPriceMap();
  } catch (error) {
    console.error("Haftalık fiyat uygulama hatası:", error);
  }
  return products.map((product) => {
    const productId = product._id ? product._id.toString() : product.id?.toString();
    return decorateProduct(product, weeklyPriceMap.get(productId), now);
  });
}
