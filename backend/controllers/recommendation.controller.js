import Order from "../models/order.model.js";
import { applyWeeklyPricesToProducts } from "../services/weeklyPrice.service.js";
import { RECO_CACHE } from "../services/recommendation.config.js";
import { onProductCachesInvalidated, syncProductCacheVersion } from "../services/productCache.service.js";
import {
  buildShelves,
  getLiveFlashProductIds,
  getStats,
  getVisibleCatalog,
  hourBucket,
  loadUserProfile,
  normalizeDeliveryPoint,
  toCard,
} from "../services/recommendation.service.js";

const clampInt = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const formatProducts = (products, withDescription) =>
  applyWeeklyPricesToProducts(products.map((p) => toCard(p, { withDescription })));

// Misafir yanıtları yurt + saat dilimi + limit + alan seçimine göre 5 dk bellekte
const guestFeedCache = new Map();
export const clearGuestFeedCache = () => guestFeedCache.clear();
// Ürün fiyatı ya da flash sale değişince (bu veya başka bir sunucu sürecinde) misafir rafları atılır
onProductCachesInvalidated(clearGuestFeedCache);

/** Raflar için ortak hazırlık */
const prepareShelves = async ({ userId, deliveryPoint, limit, now, separateDeals = true }) => {
  const [catalog, liveFlashIds] = await Promise.all([getVisibleCatalog(), getLiveFlashProductIds(now)]);
  const stats = getStats();
  const user = userId ? await loadUserProfile(userId, { stats, catalog, now }) : null;
  return buildShelves({
    catalog,
    stats,
    user,
    deliveryPoint,
    now,
    limit,
    liveFlashIds,
    separateDeals,
    seedKey: userId ? String(userId) : `guest:${deliveryPoint || "all"}`,
  });
};

// GET /api/products/home-feed — mobil ana sayfa rafları (isteğe bağlı oturum)
export const getHomeFeed = async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, 24, 1, 40);
    const deliveryPoint = normalizeDeliveryPoint(req.query.deliveryPoint);
    const withDescription = req.query.fields !== "card";
    const now = new Date();
    const userId = req.user?._id || null;
    res.setHeader("Cache-Control", "private, max-age=60");
    await syncProductCacheVersion();

    const cacheKey = !userId && `${deliveryPoint || "all"}:${hourBucket(now)}:${limit}:${withDescription ? "full" : "card"}`;
    if (cacheKey) {
      const hit = guestFeedCache.get(cacheKey);
      if (hit && Date.now() - hit.at < RECO_CACHE.guestFeedTtlMs) return res.json(hit.body);
    }

    const shelves = await prepareShelves({ userId, deliveryPoint, limit, now });
    const [deals, forYou, popular] = await Promise.all([
      formatProducts(shelves.deals, withDescription),
      formatProducts(shelves.forYou, withDescription),
      formatProducts(shelves.popular, withDescription),
    ]);
    const body = {
      success: true,
      generatedAt: now.toISOString(),
      strategy: shelves.strategy,
      shelves: {
        deals: { products: deals },
        forYou: { strategy: shelves.strategy, products: forYou },
        popular: { products: popular },
      },
    };
    if (cacheKey) {
      if (guestFeedCache.size > 64) guestFeedCache.clear();
      guestFeedCache.set(cacheKey, { at: Date.now(), body });
    }
    return res.json(body);
  } catch (error) {
    console.error("Ana sayfa rafları hazırlanamadı:", error.message);
    return res.status(500).json({ success: false, message: "Öneriler getirilemedi" });
  }
};

// GET /api/products/popular — son 7/30 gün çok satanlar (herkese açık)
export const getPopularProducts = async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, 24, 1, 40);
    const deliveryPoint = normalizeDeliveryPoint(req.query.deliveryPoint);
    const withDescription = req.query.fields !== "card";
    await syncProductCacheVersion();
    const shelves = await prepareShelves({ userId: null, deliveryPoint, limit, now: new Date() });
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.json({ success: true, products: await formatProducts(shelves.popular, withDescription) });
  } catch (error) {
    console.error("Popüler ürünler getirilemedi:", error.message);
    return res.status(500).json({ success: false, message: "Popüler ürünler getirilemedi" });
  }
};

// GET /api/products/personalized — eski yanıt biçimi korunur: { success, strategy, products }
export const getPersonalizedProducts = async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, 12, 4, 24);
    const deliveryPoint = normalizeDeliveryPoint(req.query.deliveryPoint);
    await syncProductCacheVersion();
    const shelves = await prepareShelves({ userId: req.user._id, deliveryPoint, limit, now: new Date(), separateDeals: false });
    const products = await applyWeeklyPricesToProducts(shelves.forYou);
    return res.json({
      success: true,
      strategy: shelves.strategy === "personal" ? "purchase_history" : "popular_fallback",
      products,
    });
  } catch (error) {
    console.error("Personalized recommendations error:", error.message);
    return res.status(500).json({ message: "Öneriler getirilemedi" });
  }
};

// GET /api/products/shelf-performance — son 30 günde sipariş satırı kaynağına göre özet (yönetici)
export const getShelfPerformance = async (req, res) => {
  try {
    const days = clampInt(req.query.days, 30, 1, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await Order.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: "İptal Edildi" } } },
      { $unwind: "$products" },
      {
        $group: {
          _id: { $ifNull: ["$products.source", "unknown"] },
          orders: { $addToSet: "$_id" },
          units: { $sum: "$products.quantity" },
          revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } },
        },
      },
      { $project: { _id: 0, source: "$_id", orders: { $size: "$orders" }, units: 1, revenue: { $round: ["$revenue", 2] } } },
      { $sort: { revenue: -1 } },
    ]);
    return res.json({ success: true, days, sources: rows });
  } catch (error) {
    console.error("Raf performansı hesaplanamadı:", error.message);
    return res.status(500).json({ success: false, message: "Raf performansı hesaplanamadı" });
  }
};
