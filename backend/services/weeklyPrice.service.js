// Ürün listelerine haftalık fırsat fiyatını ekler. Aktif haftalık ürünler her istekte
// veritabanından okunmasın diye 1 dakika bellekte tutulur; yönetici haftalık ürünleri
// değiştirdiğinde invalidateWeeklyPriceCache() önbelleği hemen temizler.
// Sipariş fiyatı order.service.js'de her zaman veritabanından hesaplanır (bu önbellek kullanılmaz).
import WeeklyProduct from "../models/weeklyProduct.model.js";

const TTL_MS = 60 * 1000;
let cache = { map: null, at: 0, pending: null };

let version = 0;
// Haftalık fiyatlar değiştiğinde artar; hazır ürün listesi yanıtları bununla geçersiz olur
export const getWeeklyPriceVersion = () => version;

export const invalidateWeeklyPriceCache = () => {
  cache = { map: null, at: 0, pending: null };
  version++;
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

// Helper: Ürünlere haftalık fiyat bilgisi ekle (önceki product.controller davranışıyla birebir)
export async function applyWeeklyPricesToProducts(products) {
  try {
    const weeklyPriceMap = await loadWeeklyPriceMap();
    return products.map((product) => {
      const productId = product._id ? product._id.toString() : product.id?.toString();
      const weeklyInfo = weeklyPriceMap.get(productId);
      if (weeklyInfo) {
        return {
          ...plain(product),
          isWeeklyProduct: true,
          weeklyPrice: weeklyInfo.weeklyPrice,
          weeklyDiscountPercentage: weeklyInfo.discountPercentage,
          originalPrice: weeklyInfo.originalPrice,
          // actualPrice alanını güncelle (sepet ve diğer hesaplamalar için)
          actualPrice: weeklyInfo.weeklyPrice,
        };
      }
      return plain(product);
    });
  } catch (error) {
    console.error("Haftalık fiyat uygulama hatası:", error);
    return products.map(plain);
  }
}
