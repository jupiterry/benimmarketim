// Ürün başına satış özeti (yönetici paneli): son 7 ve 30 günde satılan adet ve sipariş sayısı.
// İptal edilen siparişler sayılmaz. Tek bir aggregation; sonuç ~5 dakika bellekte tutulur.
import Order from "../models/order.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SALES_STATS_CACHE_MS = 5 * 60 * 1000;
export const SALES_STATS_FORCE_MIN_MS = 30 * 1000;
export const SALES_STATS_MAX_MS = 15 * 1000;
export const CANCELLED_STATUS = "İptal Edildi";

/** Son 30 günün siparişlerinden ürün başına adet/sipariş sayısı çıkaran aggregation adımları */
export const buildSalesStatsPipeline = (now = new Date()) => {
  const end = new Date(now).getTime();
  const since30 = new Date(end - 30 * DAY_MS);
  const since7 = new Date(end - 7 * DAY_MS);
  const quantity = { $max: [1, { $ifNull: ["$products.quantity", 1] }] };
  return [
    { $match: { createdAt: { $gte: since30 }, status: { $ne: CANCELLED_STATUS } } },
    { $project: { createdAt: 1, "products.product": 1, "products.quantity": 1 } },
    { $unwind: "$products" },
    // Aynı ürün bir siparişte iki satırda olabilir: önce sipariş + ürün bazında toplanır
    { $group: { _id: { product: "$products.product", order: "$_id" }, units: { $sum: quantity }, createdAt: { $first: "$createdAt" } } },
    {
      $group: {
        _id: "$_id.product",
        units30: { $sum: "$units" },
        units7: { $sum: { $cond: [{ $gte: ["$createdAt", since7] }, "$units", 0] } },
        orders30: { $sum: 1 },
      },
    },
  ];
};

const count = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Aggregation satırlarını { "<ürünId>": { units7, units30, orders30 } } haritasına çevirir */
export const mapSalesStats = (rows) => {
  const stats = {};
  for (const row of rows || []) {
    if (!row || row._id === null || row._id === undefined) continue;
    const id = String(row._id);
    if (!id) continue;
    const units30 = count(row.units30);
    stats[id] = { units7: Math.min(count(row.units7), units30), units30, orders30: count(row.orders30) };
  }
  return stats;
};

export const computeSalesStats = async (now = new Date()) => {
  const rows = await Order.aggregate(buildSalesStatsPipeline(now)).option({ maxTimeMS: SALES_STATS_MAX_MS });
  return { generatedAt: new Date(now).toISOString(), stats: mapSalesStats(rows) };
};

let cache = null; // { at, data }
let pending = null;

/** Önbellekli satış özeti. force: önbelleği atla (panelde "Yenile"). Aynı anda tek hesap yapılır. */
export const getSalesStats = async ({ force = false, now = new Date() } = {}) => {
  // "Yenile" art arda basılsa da en sık 30 saniyede bir yeniden hesaplanır
  if (cache && Date.now() - cache.at < (force ? SALES_STATS_FORCE_MIN_MS : SALES_STATS_CACHE_MS)) return cache.data;
  if (pending) return pending;
  pending = computeSalesStats(now)
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => { pending = null; });
  return pending;
};

/** Yalnızca testler için */
export const resetSalesStatsCache = () => {
  cache = null;
  pending = null;
};
