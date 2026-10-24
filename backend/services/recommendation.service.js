// Ana sayfa önerileri: satış istatistikleri (popülerlik, yurt, saat, birlikte alınanlar),
// saf puanlama fonksiyonları ve rafların kurulması.
//
// İstatistikler saatte bir hesaplanıp Redis'e yazılır; istekler hesaplamayı asla beklemez
// (ilk çalıştırmada boş istatistikle devam edilir). Çok süreçli PM2'de aynı hesaplamanın
// iki kez yapılmaması için Redis kilidi (SET NX EX) kullanılır.
import cron from "node-cron";
import { redis } from "../lib/redis.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import FlashSale from "../models/flashSale.model.js";
import { isLive } from "./flashSale.service.js";
import { onProductCachesInvalidated } from "./productCache.service.js";
import { RECO_CACHE, RECO_RULES, RECO_WEIGHTS } from "./recommendation.config.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TR_OFFSET_MS = 3 * 60 * 60 * 1000; // Türkiye UTC+3 (yaz saati yok)
export const HOUR_BUCKETS = ["morning", "afternoon", "evening", "night"];
export const DELIVERY_POINTS = ["girlsDorm", "boysDorm"];

// Kartta kullanılan alanlar (/products ile aynı biçim); description yalnızca fields=card değilse
export const CARD_FIELDS = [
  "_id", "name", "price", "isDiscounted", "discountedPrice", "image", "thumbnail", "category",
  "isOutOfStock", "isFeatured", "isHidden", "order", "createdAt", "updatedAt",
  // Ham kampanya alanı; weeklyPrice.service yalnızca geçerliyse `flashSale` olarak dışarı verir
  "flashSale",
];
export const CARD_SELECT = CARD_FIELDS.join(" ");

// ───────────────────────── Yardımcılar ─────────────────────────
const idOf = (value) => (value?._id ?? value)?.toString?.() ?? "";

/** Türkiye saatine göre saat dilimi: morning 06–12, afternoon 12–18, evening 18–23, night 23–06 */
export const hourBucket = (date = new Date()) => {
  const hour = new Date(new Date(date).getTime() + TR_OFFSET_MS).getUTCHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
};

/** Türkiye takvim günü (YYYY-MM-DD) */
export const trDay = (date = new Date()) => new Date(new Date(date).getTime() + TR_OFFSET_MS).toISOString().slice(0, 10);

export const normalizeDeliveryPoint = (value) => (DELIVERY_POINTS.includes(value) ? value : null);

export const discountPercent = (product) => {
  const price = Number(product?.price);
  const discounted = Number(product?.discountedPrice);
  if (!product?.isDiscounted || !(price > 0) || !Number.isFinite(discounted) || discounted < 0 || discounted >= price) return 0;
  return ((price - discounted) / price) * 100;
};

export const isDeal = (product) => discountPercent(product) > 0;

/** Kart biçimi: description yalnızca istenirse */
export const toCard = (product, { withDescription = true } = {}) => {
  const out = {};
  for (const key of CARD_FIELDS) if (product[key] !== undefined) out[key] = product[key];
  if (withDescription && product.description !== undefined) out.description = product.description;
  return out;
};

// Günlük tohumlu basit PRNG (aynı gün + kullanıcı → aynı keşif seçimi)
const hashString = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
export const seededRandom = (seedText) => {
  let a = hashString(seedText) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ───────────────────────── İstatistik ─────────────────────────
export const emptyStats = () => ({
  generatedAt: null,
  windowDays: 30,
  orderCount: 0,
  products: {},
  categoryHour: {},
  coPurchase: {},
});

const emptyProductStats = () => ({
  units30: 0,
  units7: 0,
  orders30: 0,
  byDeliveryPoint: { girlsDorm: 0, boysDorm: 0 },
  byHourBucket: { morning: 0, afternoon: 0, evening: 0, night: 0 },
});

/**
 * Son 30 günün siparişlerinden istatistik üretir (saf fonksiyon).
 * @param {Array} orders  { createdAt, deliveryPoint, status, products: [{ product, quantity }] }
 * @param {{ now?: Date, categoryOf?: Map<string,string> }} options
 */
export const aggregateStats = (orders, { now = new Date(), categoryOf = new Map() } = {}) => {
  const stats = emptyStats();
  stats.generatedAt = new Date(now).toISOString();
  const since7 = new Date(now).getTime() - 7 * DAY_MS;
  const categoryBuckets = {};
  const totalBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const pairCounts = new Map(); // "a|b" → sipariş sayısı

  for (const order of orders || []) {
    if (!order || order.status === "İptal Edildi") continue;
    const created = new Date(order.createdAt).getTime();
    if (!Number.isFinite(created)) continue;
    stats.orderCount++;
    const bucket = hourBucket(created);
    const point = normalizeDeliveryPoint(order.deliveryPoint);
    const seen = new Set();
    for (const item of order.products || []) {
      const id = idOf(item.product);
      if (!id) continue;
      const qty = Math.max(1, Number(item.quantity) || 1);
      const p = (stats.products[id] ||= emptyProductStats());
      p.units30 += qty;
      if (created >= since7) p.units7 += qty;
      if (point) p.byDeliveryPoint[point] += qty;
      p.byHourBucket[bucket] += qty;
      if (!seen.has(id)) {
        p.orders30++;
        seen.add(id);
      }
      const category = categoryOf.get(id) || item.category;
      if (category) {
        const c = (categoryBuckets[category] ||= { morning: 0, afternoon: 0, evening: 0, night: 0 });
        c[bucket] += qty;
      }
      totalBuckets[bucket] += qty;
    }
    // Birlikte alınanlar: aynı siparişteki farklı ürün çiftleri (çok kalemli siparişler sınırlı)
    const ids = [...seen].slice(0, RECO_RULES.coPurchaseMaxItemsPerOrder).sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  // Kategori × saat: kategorinin o dilimdeki payının genel paya oranı (lift)
  const total = HOUR_BUCKETS.reduce((sum, b) => sum + totalBuckets[b], 0);
  for (const [category, buckets] of Object.entries(categoryBuckets)) {
    const catTotal = HOUR_BUCKETS.reduce((sum, b) => sum + buckets[b], 0);
    const lift = {};
    for (const b of HOUR_BUCKETS) {
      const overall = total ? totalBuckets[b] / total : 0;
      lift[b] = catTotal >= RECO_RULES.hourMinUnits && overall > 0
        ? Math.round(((buckets[b] / catTotal) / overall) * 1000) / 1000
        : 1;
    }
    stats.categoryHour[category] = { units: catTotal, lift };
  }

  // Normalize: count / sqrt(siparişA × siparişB) — çok yaygın ürünler her şeyle eşleşmesin
  const neighbours = new Map();
  for (const [key, count] of pairCounts) {
    const [a, b] = key.split("|");
    const score = count / Math.sqrt(stats.products[a].orders30 * stats.products[b].orders30);
    const rounded = Math.round(score * 1000) / 1000;
    if (!neighbours.has(a)) neighbours.set(a, []);
    if (!neighbours.has(b)) neighbours.set(b, []);
    neighbours.get(a).push({ id: b, count, score: rounded });
    neighbours.get(b).push({ id: a, count, score: rounded });
  }
  for (const [id, list] of neighbours) {
    stats.coPurchase[id] = list
      .sort((x, y) => y.score - x.score || y.count - x.count)
      .slice(0, RECO_RULES.coPurchaseTop);
  }
  return stats;
};

// ───────────────────────── Kullanıcı profili ─────────────────────────
/**
 * Kullanıcının son siparişlerinden kişisel sinyaller (saf fonksiyon).
 * orders: yeniden eskiye { createdAt, products: [{product, quantity}] }
 */
export const buildUserProfile = (orders, { stats = emptyStats(), categoryOf = new Map(), now = new Date() } = {}) => {
  const valid = (orders || []).filter((o) => o && o.status !== "İptal Edildi");
  if (!valid.length) return null;
  const purchaseWeight = new Map();
  const categoryCount = new Map();
  const lastBoughtAt = new Map();
  const orderDates = new Map(); // id → [zaman]
  let categoryTotal = 0;

  for (const order of valid) {
    const created = new Date(order.createdAt).getTime();
    const seen = new Set();
    for (const item of order.products || []) {
      const id = idOf(item.product);
      if (!id) continue;
      const qty = Math.max(1, Number(item.quantity) || 1);
      purchaseWeight.set(id, (purchaseWeight.get(id) || 0) + qty);
      const category = categoryOf.get(id);
      if (category) {
        categoryCount.set(category, (categoryCount.get(category) || 0) + qty);
        categoryTotal += qty;
      }
      if (Number.isFinite(created) && !seen.has(id)) {
        seen.add(id);
        if (!orderDates.has(id)) orderDates.set(id, []);
        orderDates.get(id).push(created);
        if (!lastBoughtAt.has(id) || created > lastBoughtAt.get(id)) lastBoughtAt.set(id, created);
      }
    }
  }

  // Ortalama alım aralığı (en az 2 farklı siparişte alınmışsa)
  const avgIntervalDays = new Map();
  for (const [id, dates] of orderDates) {
    if (dates.length < 2) continue;
    const sorted = [...dates].sort((a, b) => a - b);
    const span = (sorted[sorted.length - 1] - sorted[0]) / DAY_MS;
    if (span > 0) avgIntervalDays.set(id, span / (sorted.length - 1));
  }

  const categoryWeight = new Map();
  for (const [category, count] of categoryCount) categoryWeight.set(category, categoryTotal ? count / categoryTotal : 0);

  // Son 3 siparişteki ürünlerin eşleri
  const coPurchaseBoost = new Map();
  const recentIds = new Set();
  for (const order of valid.slice(0, 3)) for (const item of order.products || []) recentIds.add(idOf(item.product));
  for (const id of recentIds) {
    for (const n of stats.coPurchase?.[id] || []) {
      if (recentIds.has(n.id)) continue;
      coPurchaseBoost.set(n.id, Math.min(1, (coPurchaseBoost.get(n.id) || 0) + n.score));
    }
  }

  const today = trDay(now);
  const boughtToday = new Set([...lastBoughtAt].filter(([, at]) => trDay(at) === today).map(([id]) => id));

  return { purchaseWeight, categoryWeight, lastBoughtAt, avgIntervalDays, coPurchaseBoost, boughtToday, orderCount: valid.length };
};

// ───────────────────────── Puanlama ─────────────────────────
const productStats = (stats, id) => stats?.products?.[id] || null;

/** Popülerlik + seçilen yurt (saf) */
export const popularityScore = (product, ctx) => {
  const s = productStats(ctx.stats, idOf(product));
  if (!s) return 0;
  let score = Math.log1p(s.units7) * RECO_WEIGHTS.popularity7 + Math.log1p(s.units30) * RECO_WEIGHTS.popularity30;
  if (ctx.deliveryPoint) score += Math.log1p(s.byDeliveryPoint?.[ctx.deliveryPoint] || 0) * RECO_WEIGHTS.deliveryPoint;
  return score;
};

/** Kategorinin bu saat dilimindeki satış payı (lift) */
export const hourFitScore = (product, ctx) => {
  const lift = ctx.stats?.categoryHour?.[product.category]?.lift?.[ctx.hourBucket];
  if (!Number.isFinite(lift)) return 0;
  return Math.max(-0.5, Math.min(1.5, lift - 1)) * RECO_WEIGHTS.hourFit;
};

/** Görünmeyen, stokta olmayan ve süren flash sale ürünleri hariç */
export const isExcluded = (product, ctx = {}) =>
  !product || product.isHidden || product.isOutOfStock || Boolean(ctx.liveFlashIds?.has(idOf(product)));

/** Tekrar alım puanı: yenileme zamanı yaklaştıysa yüksek, çok yakın zamanda alındıysa düşük */
export const repurchaseScore = (id, user, now = new Date()) => {
  const bought = user?.purchaseWeight?.get(id) || 0;
  if (!bought) return 0;
  const avg = user.avgIntervalDays?.get(id);
  const last = user.lastBoughtAt?.get(id);
  if (!avg || !last) return Math.log1p(bought) * RECO_WEIGHTS.repurchaseOnce;
  const ratio = (new Date(now).getTime() - last) / DAY_MS / avg;
  const [low, high] = RECO_RULES.repurchaseWindow;
  if (ratio < RECO_RULES.repurchaseTooSoonRatio) return RECO_WEIGHTS.repurchaseTooSoon;
  if (ratio < low) return RECO_WEIGHTS.repurchaseEarly;
  if (ratio <= high) return RECO_WEIGHTS.repurchaseDue;
  return RECO_WEIGHTS.repurchaseOverdue;
};

/**
 * Bir ürünün "Sana özel" puanı (saf fonksiyon).
 * ctx = { stats, hourBucket, deliveryPoint, user: profil|null, now, liveFlashIds?: Set }
 * Hariç tutulan ürünlerde -Infinity döner.
 */
export const scoreProduct = (product, ctx) => {
  if (isExcluded(product, ctx)) return -Infinity;
  const id = idOf(product);
  const now = ctx.now || new Date();
  const user = ctx.user || null;
  if (user?.boughtToday?.has(id)) return -Infinity; // bugün alınan ürün tekrar önerilmez

  let score = popularityScore(product, ctx) + hourFitScore(product, ctx);
  if (user) {
    score += (user.categoryWeight?.get(product.category) || 0) * RECO_WEIGHTS.category;
    score += repurchaseScore(id, user, now);
    score += (user.coPurchaseBoost?.get(id) || 0) * RECO_WEIGHTS.coPurchase;
  }
  score += discountPercent(product) * RECO_WEIGHTS.discountPerPercent;
  if (product.isFeatured) score += RECO_WEIGHTS.featured;
  const created = new Date(product.createdAt).getTime();
  if (Number.isFinite(created) && new Date(now).getTime() - created <= RECO_RULES.newDays * DAY_MS) score += RECO_WEIGHTS.newness;
  return score;
};

/** "Fırsatlar" puanı: indirim derinliği + popülerlik + saat uyumu */
export const dealScore = (product, ctx) => {
  if (isExcluded(product, ctx) || !isDeal(product)) return -Infinity;
  return discountPercent(product) * RECO_WEIGHTS.dealDiscountPerPercent + popularityScore(product, ctx) + hourFitScore(product, ctx) +
    (product.isFeatured ? RECO_WEIGHTS.featured : 0);
};

/**
 * Çeşitlilik: sıralamayı koruyarak aynı kategoriden en fazla `maxPerCategory` ürün alır;
 * raf dolmazsa kalan ürünler sıralama düzeniyle sona eklenir.
 */
export const diversify = (ranked, { limit = ranked.length, maxPerCategory = RECO_RULES.maxPerCategory } = {}) => {
  const picked = [];
  const overflow = [];
  const perCategory = new Map();
  for (const product of ranked) {
    if (picked.length >= limit) break;
    const key = product.category || "";
    const count = perCategory.get(key) || 0;
    if (count < maxPerCategory) {
      picked.push(product);
      perCategory.set(key, count + 1);
    } else {
      overflow.push(product);
    }
  }
  for (const product of overflow) {
    if (picked.length >= limit) break;
    picked.push(product);
  }
  return picked;
};

const rank = (products, scorer, ctx) =>
  products
    .map((product) => ({ product, score: scorer(product, ctx) }))
    .filter((x) => x.score > -Infinity)
    .sort((a, b) => b.score - a.score || (Number(a.product.order) || 0) - (Number(b.product.order) || 0))
    .map((x) => x.product);

/** Keşif: listenin bir kısmını günlük tohumla seçilen az satan/yeni ürünlerle değiştirir */
export const addExploration = (list, pool, { limit, seed, share = RECO_RULES.explorationShare }) => {
  const slots = Math.floor(limit * share);
  if (!slots || !pool.length) return list.slice(0, limit);
  const taken = new Set(list.map(idOf));
  const random = seededRandom(seed);
  const candidates = pool.filter((p) => !taken.has(idOf(p)));
  const picks = [];
  while (picks.length < slots && candidates.length) {
    picks.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0]);
  }
  if (!picks.length) return list.slice(0, limit);
  const base = list.slice(0, limit - picks.length);
  // Keşif ürünlerini rafa eşit aralıklarla yerleştir (ilk sıralara değil)
  const step = Math.max(2, Math.floor(limit / (picks.length + 1)));
  picks.forEach((p, i) => base.splice(Math.min(base.length, step * (i + 1) - 1), 0, p));
  return base.slice(0, limit);
};

/**
 * Ana sayfa raflarını kurar (saf fonksiyon; veritabanına gitmez).
 * @returns {{ strategy, deals, forYou, popular }}
 */
export const buildShelves = ({ catalog, stats = emptyStats(), user = null, deliveryPoint = null, now = new Date(), limit = 24, liveFlashIds = new Set(), seedKey = "guest", separateDeals = true }) => {
  const ctx = { stats, hourBucket: hourBucket(now), deliveryPoint: normalizeDeliveryPoint(deliveryPoint), user, now, liveFlashIds };
  const visible = catalog.filter((p) => !p.isHidden && !p.isOutOfStock);

  const deals = diversify(rank(visible, dealScore, ctx), { limit });
  // forYou, deals rafındaki ürünleri tekrar etmez (eski /personalized uyumu için kapatılabilir)
  const dealIds = separateDeals ? new Set(deals.map(idOf)) : new Set();

  const personal = Boolean(user && user.purchaseWeight?.size);
  const ranked = rank(visible.filter((p) => !dealIds.has(idOf(p))), scoreProduct, { ...ctx, user: personal ? user : null });
  const diversified = diversify(ranked, { limit });
  const newSince = new Date(now).getTime() - RECO_RULES.newDays * DAY_MS;
  const explorationPool = ranked.filter((p) => {
    const s = productStats(stats, idOf(p));
    return (s?.units30 || 0) <= RECO_RULES.explorationMaxUnits30 || new Date(p.createdAt).getTime() >= newSince;
  });
  const forYou = addExploration(diversified, explorationPool, { limit, seed: `${trDay(now)}:${seedKey}` });

  // Çok satanlar: kişiselleştirme yok; satış verisi yoksa öne çıkan/indirimli ve vitrin sırası
  const popCtx = { ...ctx, user: null, liveFlashIds: new Set() };
  const popular = visible
    .map((product) => ({
      product,
      score: popularityScore(product, popCtx),
      fallback: (product.isFeatured ? 2 : 0) + (isDeal(product) ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.fallback - a.fallback || (Number(a.product.order) || 0) - (Number(b.product.order) || 0))
    .slice(0, limit)
    .map((x) => x.product);

  return { strategy: personal ? "personal" : "popular", deals, forYou, popular };
};

// ───────────────────────── Önbellek ve zamanlama ─────────────────────────
let memoryStats = emptyStats();
let lastRedisCheck = 0;
let refreshing = null;

export const getStatsSnapshot = () => memoryStats;
export const setStatsSnapshot = (stats) => {
  memoryStats = stats || emptyStats();
};

const readRedisStats = async () => {
  try {
    const raw = await redis.get(RECO_CACHE.statsKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.products ? parsed : null;
  } catch {
    return null;
  }
};

const isNewer = (a, b) => new Date(a?.generatedAt || 0).getTime() > new Date(b?.generatedAt || 0).getTime();

/** Son 30 günün siparişlerinden istatistiği hesaplar (veritabanı). */
export const computeStats = async (now = new Date()) => {
  const since = new Date(new Date(now).getTime() - 30 * DAY_MS);
  const [orders, products] = await Promise.all([
    Order.find({ createdAt: { $gte: since }, status: { $ne: "İptal Edildi" } })
      .select("createdAt deliveryPoint status products.product products.quantity")
      .lean(),
    Product.find({}).select("category").lean(),
  ]);
  const categoryOf = new Map(products.map((p) => [p._id.toString(), p.category]));
  return aggregateStats(orders, { now, categoryOf });
};

/**
 * İstatistiği yeniler: kilidi alan süreç hesaplayıp Redis'e yazar; alamayan Redis'teki
 * sonucu okur. Hata olursa bellekteki son sonuç korunur.
 */
export const refreshStats = async ({ force = false } = {}) => {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const cached = await readRedisStats();
      lastRedisCheck = Date.now();
      if (cached && isNewer(cached, memoryStats)) memoryStats = cached;
      const age = Date.now() - new Date(memoryStats.generatedAt || 0).getTime();
      if (!force && age < RECO_CACHE.refreshAfterMs) return memoryStats;

      let locked = true;
      try {
        locked = (await redis.set(RECO_CACHE.lockKey, String(process.pid), "EX", RECO_CACHE.lockTtlSec, "NX")) === "OK";
      } catch {
        locked = true; // Redis yoksa bu süreç hesaplar
      }
      if (!locked) return memoryStats;

      const stats = await computeStats();
      memoryStats = stats;
      try {
        await redis.set(RECO_CACHE.statsKey, JSON.stringify(stats), "EX", RECO_CACHE.statsTtlSec);
      } catch {
        /* Redis yoksa bellekte kalır */
      }
      return stats;
    } catch (error) {
      console.error("Öneri istatistiği hesaplanamadı:", error.message);
      return memoryStats;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
};

/** İstek yolunda kullanılır: anında döner, gerekirse arka planda yeniler. */
export const getStats = () => {
  const age = Date.now() - new Date(memoryStats.generatedAt || 0).getTime();
  if (age > RECO_CACHE.refreshAfterMs && Date.now() - lastRedisCheck > RECO_CACHE.redisCheckMs) {
    lastRedisCheck = Date.now();
    refreshStats().catch(() => {});
  }
  return memoryStats;
};

// Görünür katalog (kısa süre bellekte)
let catalogCache = { at: 0, data: null, pending: null };
export const invalidateCatalogCache = () => {
  catalogCache = { at: 0, data: null, pending: null };
};
export const getVisibleCatalog = async () => {
  if (catalogCache.data && Date.now() - catalogCache.at < RECO_CACHE.catalogTtlMs) return catalogCache.data;
  if (catalogCache.pending) return catalogCache.pending;
  const pending = Product.find({ isHidden: false, isOutOfStock: false })
    .select(`${CARD_SELECT} description`)
    .sort({ order: 1 })
    .lean()
    .then((data) => {
      catalogCache = { at: Date.now(), data, pending: null };
      return data;
    })
    .catch((error) => {
      catalogCache.pending = null;
      throw error;
    });
  catalogCache.pending = pending;
  return pending;
};

// Şu an süren flash sale ürünleri
let flashCache = { at: 0, ids: null };
export const getLiveFlashProductIds = async (now = new Date()) => {
  if (flashCache.ids && Date.now() - flashCache.at < RECO_CACHE.flashTtlMs) return flashCache.ids;
  try {
    const sales = await FlashSale.find({ isActive: true, startDate: { $lte: now }, endDate: { $gt: now } })
      .select("product isActive startDate endDate")
      .lean();
    const ids = new Set(sales.filter((sale) => isLive(sale, now)).map((sale) => idOf(sale.product)));
    flashCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return flashCache.ids || new Set();
  }
};

/** Kullanıcı profili (son 60 sipariş) */
export const loadUserProfile = async (userId, { stats, catalog, now = new Date() }) => {
  if (!userId) return null;
  const orders = await Order.find({ user: userId, status: { $ne: "İptal Edildi" } })
    .sort({ createdAt: -1 })
    .limit(60)
    .select("createdAt status products.product products.quantity")
    .lean();
  if (!orders.length) return null;
  const categoryOf = new Map(catalog.map((p) => [p._id.toString(), p.category]));
  // Katalogda olmayan (gizli/stoksuz) ürünlerin kategorisi de kişisel sinyale katkı versin
  const missing = [...new Set(orders.flatMap((o) => (o.products || []).map((i) => idOf(i.product))))].filter((id) => id && !categoryOf.has(id));
  if (missing.length) {
    const extra = await Product.find({ _id: { $in: missing } }).select("category").lean();
    for (const p of extra) categoryOf.set(p._id.toString(), p.category);
  }
  return buildUserProfile(orders, { stats, categoryOf, now });
};

/** Testler ve elle yenileme için bellek önbelleklerini temizler */
export const resetRecommendationCaches = () => {
  invalidateCatalogCache();
  flashCache = { at: 0, ids: null };
};
// Ürün fiyatı/görünürlüğü ya da flash sale değişince katalog ve kampanya önbellekleri hemen atılır
onProductCachesInvalidated(resetRecommendationCaches);

let job = null;
export const startRecommendationJob = () => {
  if (job) return job;
  // Açılışı yavaşlatmasın: ilk hesaplama birkaç saniye sonra arka planda
  setTimeout(() => refreshStats().catch(() => {}), 5000).unref?.();
  job = cron.schedule("7 * * * *", () => refreshStats({ force: true }).catch(() => {}));
  return job;
};
