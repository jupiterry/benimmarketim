// Ürün listelerine müşteriye gösterilecek fiyatı ekler (tüm ürün uç noktaları bunu kullanır).
//   - actualPrice: siparişte alınacak birim fiyat (services/productPricing.js: haftalık fırsat,
//     ürün indirimi/flash sale ve liste fiyatının en düşüğü). Her üründe bulunur.
//   - haftalık üründe: isWeeklyProduct, weeklyPrice, weeklyDiscountPercentage, originalPrice
//     (yüzde ve liste fiyatı her okumada ürünün GÜNCEL liste fiyatından hesaplanır)
//   - flash sale sürüyorsa: flashSale { _id, discountPercentage, price, startDate, endDate }
//     (fiyat haftalık fırsattan düşükse; değilse alan gönderilmez)
// Aktif haftalık ürünler her istekte veritabanından okunmasın diye 1 dakika bellekte tutulur;
// ürünler/haftalık fırsatlar değişince productCache.service bu önbelleği de temizler.
// Sipariş fiyatı order.service.js'de her zaman veritabanından hesaplanır (bu önbellek kullanılmaz).
// Yalnızca başlamış ve bitmemiş fırsatlar okunur (productPricing.activeWeeklyFilter); önbellekteki
// kayıt da her istekte tarihine göre yeniden denetlenir. flashSale.service'in dakikalık işi
// syncWeeklyDealSchedule ile süresi dolanı kapatır, başlangıcı gelen planlı fırsatı yayına alır,
// başlayan/biten olursa önbellekleri temizler.
//
// Planlı fırsat: isActive:false + scheduled:true + ileri bir startDate. activeWeeklyFilter isActive:true
// istediği için başlayana kadar müşteriye görünmez ve hiçbir fiyata yansımaz.
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Product from "../models/product.model.js";
import { activeWeeklyFilter, isWeeklyDealLive, liveFlashInfo, resolveUnitPrice, toKurus } from "./productPricing.js";
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

// ─────────────────────────────────────────────
// İndirim yüzdesi ve fiyat taşıma
// ─────────────────────────────────────────────
// Kayıttaki discountPercentage fırsat kurulduğundaki değerdir; ürünün liste fiyatı sonradan değişince
// bayatlıyordu (₺30'luk ürüne ₺25 fırsat: %17; liste ₺36 olunca gerçek indirim %31 ama %17 görünüyordu).
// Gösterilen/dönen yüzde artık her okumada güncel liste fiyatından hesaplanır; kayıttaki alan geriye dönük
// uyumluluk için durur. listPriceAtStart: fiyat belirlendiğindeki liste fiyatı (eski kayıtlarda yok).

const positive = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Fırsat fiyatının verilen liste fiyatına göre indirim yüzdesi (tam sayı, 0–99) */
export const weeklyDiscountPercent = (listPrice, weeklyPrice) => {
  const list = positive(listPrice);
  if (!list || weeklyPrice === null || weeklyPrice === undefined || weeklyPrice === "") return 0;
  const weekly = Number(weeklyPrice);
  if (!Number.isFinite(weekly) || weekly < 0 || toKurus(weekly) >= toKurus(list)) return 0;
  return Math.min(99, Math.max(0, Math.round(((list - weekly) / list) * 100)));
};

/**
 * Fırsatın kurulduğu andaki indirim oranı (0–1). Kopyalama ve "fırsat fiyatını güncelle" aynı oranı güncel
 * liste fiyatına uygular:
 *   1. listPriceAtStart varsa o günkü tam oran (₺25 / ₺30 → liste ₺36 olunca ₺30)
 *   2. yoksa (eski kayıt) ve kayıtlı yüzde güncel fiyata göre hesaplanandan farklıysa (liste fiyatı değişmiş)
 *      kayıtlı yüzde
 *   3. değilse güncel liste fiyatına göre tam oran (fiyat değişmemiş: yeni fiyat eskisinin aynısı)
 */
export const dealDiscountRatio = (deal, currentListPrice) => {
  const weekly = positive(deal?.weeklyPrice);
  if (!weekly) return 0;
  const base = positive(deal?.listPriceAtStart);
  if (base) return weekly < base ? (base - weekly) / base : 0;
  const list = positive(currentListPrice);
  const stored = Math.round(Number(deal?.discountPercentage));
  const storedValid = Number.isFinite(stored) && stored >= 1 && stored <= 99;
  if (storedValid && (!list || stored !== weeklyDiscountPercent(list, weekly))) return stored / 100;
  if (list && weekly < list) return (list - weekly) / list;
  return 0;
};

export const WEEKLY_ROUNDING = Object.freeze(["none", "90", "50"]);

/**
 * Fiyatı kuruşa yuvarlar. mode "90" / "50": en yakın ,90 / ,50 ile biten fiyat (29,88 → 29,90 / 29,50;
 * eşit uzaklıkta düşük olan). Liste fiyatına ulaşan ya da 0'a inen aday kullanılmaz; uygun aday yoksa
 * kuruş fiyatı kalır.
 */
export const roundDealPrice = (price, mode = "none", listPrice = null) => {
  const kurus = toKurus(price);
  if (mode !== "90" && mode !== "50") return kurus / 100;
  const ending = mode === "90" ? 90 : 50;
  const list = positive(listPrice);
  const listKurus = list ? toKurus(list) : Infinity;
  const lira = Math.floor(kurus / 100) * 100;
  const candidates = [lira - 100 + ending, lira + ending, lira + 100 + ending]
    .filter((c) => c > 0 && c < listKurus)
    .sort((a, b) => Math.abs(a - kurus) - Math.abs(b - kurus) || a - b);
  return (candidates.length ? candidates[0] : kurus) / 100;
};

/**
 * Fırsatın indirim oranını güncel liste fiyatına uygular (kuruşa, istenirse ,90/,50'ye yuvarlanır).
 * @returns {{ price: number, percent: number } | null} indirim kalmıyorsa null
 */
export const carryOverDealPrice = (deal, listPrice, mode = "none") => {
  const list = positive(listPrice);
  if (!list) return null;
  const ratio = dealDiscountRatio(deal, list);
  if (!(ratio > 0) || ratio >= 1) return null;
  const price = roundDealPrice(list * (1 - ratio), mode, list);
  if (!(price > 0) || toKurus(price) >= toKurus(list)) return null;
  return { price, percent: weeklyDiscountPercent(list, price) };
};

const plainDeal = (deal) => (deal?.toObject ? deal.toObject() : { ...deal });

/** Müşteri yanıtı: discountPercentage ürünün güncel liste fiyatından (ürün okunmuşsa); başka alan değişmez */
export const withLiveDiscount = (deal) => {
  const out = plainDeal(deal);
  const list = positive(out.product?.price);
  if (list) out.discountPercentage = weeklyDiscountPercent(list, out.weeklyPrice);
  return out;
};

/**
 * Panel yanıtı: güncel yüzde (discountPercentage), fiyat belirlendiğindeki yüzde (startDiscountPercentage;
 * listPriceAtStart yoksa kayıttaki yüzde) ve planlı bayrağı (eski kayıtlarda false).
 */
export const serializeWeeklyDeal = (deal) => {
  const source = plainDeal(deal);
  const stored = Math.round(Number(source.discountPercentage)) || 0;
  const out = withLiveDiscount(source);
  out.scheduled = out.scheduled === true;
  out.listPriceAtStart = positive(out.listPriceAtStart);
  out.startDiscountPercentage = out.listPriceAtStart ? weeklyDiscountPercent(out.listPriceAtStart, out.weeklyPrice) : stored;
  return out;
};

// ─────────────────────────────────────────────
// Tarih aralıkları ve çakışma
// ─────────────────────────────────────────────
const toMs = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/** [aStart, aEnd) ile [bStart, bEnd) çakışıyor mu? Boş başlangıç: en baştan, boş bitiş: süresiz */
export const weeklyRangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const as = toMs(aStart) ?? -Infinity;
  const ae = toMs(aEnd) ?? Infinity;
  const bs = toMs(bStart) ?? -Infinity;
  const be = toMs(bEnd) ?? Infinity;
  return as < be && bs < ae;
};

const hasEnded = (deal, now) => {
  const end = toMs(deal?.endDate);
  return end !== null && end <= now.getTime();
};
/** Planlı ve bitişi gelmemiş */
export const isPlannedDeal = (deal, now = new Date()) => deal?.scheduled === true && !hasEnded(deal, now);
/** Ürünü "meşgul eden" aktif kayıt (bitmemiş); aynı ürün için en fazla bir tane olabilir */
export const isRunningDeal = (deal, now = new Date()) => deal?.isActive === true && deal?.scheduled !== true && !hasEnded(deal, now);

/**
 * Bir ürünün yeni ya da düzenlenen fırsat aralığı, aynı ürünün diğer kayıtlarıyla çakışıyor mu?
 * candidate: { id?, start, end (null: süresiz), planned (başlangıcı ileride mi) }
 * Dönüş null ya da { code, deal }:
 *   PLANNED_OVERLAP aralık, bitmemiş başka bir planlı fırsatla çakışıyor
 *   LIVE_OVERLAP    planlı fırsat başlarken ürünün yayındaki fırsatı sürüyor (bitişi yok ya da daha geç)
 *   ALREADY_LIVE    hemen başlayacak fırsat için ürünün yayında başka fırsatı var
 */
export const findWeeklyConflict = (candidate, others = [], now = new Date()) => {
  const id = candidate?.id ? String(candidate.id) : null;
  const rest = (others || []).filter((deal) => deal && !(id && String(deal._id) === id));
  const planned = rest.find((deal) => isPlannedDeal(deal, now) &&
    weeklyRangesOverlap(candidate.start, candidate.end, deal.startDate, deal.endDate));
  if (planned) return { code: "PLANNED_OVERLAP", deal: planned };
  const running = rest.find((deal) => isRunningDeal(deal, now));
  if (!running) return null;
  if (!candidate.planned) return { code: "ALREADY_LIVE", deal: running };
  const end = toMs(running.endDate);
  return end === null || end > toMs(candidate.start) ? { code: "LIVE_OVERLAP", deal: running } : null;
};

// ─────────────────────────────────────────────
// Yazma sırası
// ─────────────────────────────────────────────
let writeChain = Promise.resolve();
/**
 * Haftalık fırsat yazmaları (panel işlemleri ve dakikalık iş) bu süreçte sırayla çalışır: çakışma denetimi
 * ile kayıt arasında başka bir yazma araya giremez (çift tıklama, aynı anda açık iki sekme).
 * Süreçler arası güvenlik koşullu güncellemeler ve tekil indeksle sağlanır.
 */
export const runWeeklyWrite = (fn) => {
  const run = writeChain.then(() => fn());
  writeChain = run.then(() => undefined, () => undefined);
  return run;
};

const loadWeeklyPriceMap = async () => {
  if (cache.map && Date.now() - cache.at < TTL_MS) return cache.map;
  if (cache.pending) return cache.pending;
  const now = new Date();
  const pending = WeeklyProduct.find(activeWeeklyFilter(now))
    .populate("product")
    .lean()
    .then((weeklyProducts) => {
      const map = new Map();
      for (const wp of weeklyProducts) {
        if (wp.product && wp.product._id && isWeeklyDealLive(wp, now)) {
          map.set(wp.product._id.toString(), {
            weeklyPrice: wp.weeklyPrice,
            discountPercentage: wp.discountPercentage,
            originalPrice: wp.originalPrice || wp.product.price,
            startDate: wp.startDate ?? null,
            endDate: wp.endDate ?? null,
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
  let out = base;
  if (weeklyInfo) {
    // Yüzde ve liste fiyatı ürünün güncel fiyatından (kayıttaki yüzde fiyat değişince bayatlar)
    const list = positive(base.price) ?? positive(weeklyInfo.originalPrice);
    out = {
      ...base,
      isWeeklyProduct: true,
      weeklyPrice: weeklyInfo.weeklyPrice,
      weeklyDiscountPercentage: list ? weeklyDiscountPercent(list, weeklyInfo.weeklyPrice) : Number(weeklyInfo.discountPercentage) || 0,
      originalPrice: list ?? weeklyInfo.originalPrice,
    };
  }
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
    const weeklyInfo = weeklyPriceMap.get(productId);
    // Önbellekteki fırsatın süresi bu arada dolduysa uygulanmaz
    return decorateProduct(product, weeklyInfo && isWeeklyDealLive(weeklyInfo, now) ? weeklyInfo : undefined, now);
  });
}

// ─────────────────────────────────────────────
// Haftalık fırsat takvimi (flashSale.service'in dakikalık işi çağırır)
// ─────────────────────────────────────────────
const START_LOOKBACK_MS = 2 * 60 * 1000;
const MAX_ACTIVATIONS_PER_RUN = 200;
let lastScheduleCheckAt = null;

const modifiedCount = (result) => Number(result?.modifiedCount ?? result?.nModified ?? 0) || 0;

/**
 * Başlangıç anı gelmiş planlı fırsatları yayına alır. Yalnızca koşullu güncellemeler kullanır; iki süreç aynı
 * anda çalıştırsa da bir fırsat bir kez açılır ve yeniden çalıştırmak bir şey değiştirmez.
 *   - Bitişi de geçmişse (sunucu o aralıkta kapalıydı) hiç yayına girmeden kapanır (scheduled:false).
 *   - Ürün silinmişse atlanır ve planlı kalır (panel "Ürün silinmiş" gösterir).
 *   - Ürünün başka aktif fırsatı (bitmiş olmalıydı) kapatılır; bitişi yeni başlangıçtan sonraysa
 *     başlangıca çekilir (panelde "Bitti" görünür).
 * Ürün önbelleklerini temizlemez; syncWeeklyDealSchedule tek seferde temizler. Yazma sırası dışından
 * çağrılmamalı (runWeeklyWrite içinde çalışır).
 * @returns {Promise<{ activated: number, closed: number, changed: boolean, late: number }>}
 *   late: `since` anından önce başlaması gerekip ancak şimdi açılanlar
 */
export const activateDueWeeklyDeals = async (now = new Date(), { since = null } = {}) => {
  const summary = { activated: 0, closed: 0, changed: false, late: 0 };
  const due = await WeeklyProduct.find({ scheduled: true, startDate: { $lte: now } })
    .select("_id product startDate endDate")
    .sort({ startDate: 1 })
    .limit(MAX_ACTIVATIONS_PER_RUN)
    .lean();
  if (!due?.length) return summary;
  const productIds = [...new Set(due.map((deal) => (deal.product ? String(deal.product) : "")).filter(Boolean))];
  const existing = productIds.length ? await Product.find({ _id: { $in: productIds } }).select("_id").lean() : [];
  const alive = new Set((existing || []).map((product) => String(product._id)));

  for (const deal of due) {
    try {
      if (hasEnded(deal, now)) {
        const closed = await WeeklyProduct.updateOne(
          { _id: deal._id, scheduled: true, endDate: { $ne: null, $lte: now } },
          { $set: { scheduled: false, isActive: false } }
        );
        if (modifiedCount(closed)) summary.closed += 1;
        continue;
      }
      if (!deal.product || !alive.has(String(deal.product))) continue;
      const start = new Date(deal.startDate);
      const others = { product: deal.product, isActive: true, _id: { $ne: deal._id } };
      const trimmed = await WeeklyProduct.updateMany(
        { ...others, $or: [{ endDate: null }, { endDate: { $gt: start } }] },
        { $set: { isActive: false, endDate: start } }
      );
      const stopped = await WeeklyProduct.updateMany(others, { $set: { isActive: false } });
      if (modifiedCount(trimmed) || modifiedCount(stopped)) summary.changed = true;
      const activated = await WeeklyProduct.findOneAndUpdate(
        { _id: deal._id, scheduled: true, startDate: { $lte: now } },
        { $set: { isActive: true, scheduled: false } },
        { new: true, projection: { _id: 1 } }
      ).lean();
      if (activated) {
        summary.activated += 1;
        summary.changed = true;
        if (since && start <= since) summary.late += 1;
      }
    } catch (error) {
      // E11000: aynı anda aynı ürünün başka fırsatı açıldı; bir sonraki dakika yeniden denenir
      console.error(`Planlı haftalık fırsat ${deal._id} yayına alınamadı:`, error.message);
    }
  }
  return summary;
};

/**
 * Süresi dolan haftalık fırsatları kapatır (isActive: false), başlangıcı gelen planlı fırsatları yayına alır
 * ve son denetimden bu yana başlayan ya da biten fırsat varsa ürün önbelleklerini (tüm süreçlerde; haftalık
 * fiyat haritası, hazır ürün listeleri ve Last-Modified damgası dahil) bir kez temizler. Böylece uygulama bir
 * dakika içinde güncel fiyatı görür. Okuma tarafı zaten tarihe göre süzer; bu adım panel durumunu ve
 * önbellekleri düzeltir. Kapatma ve açma idempotenttir (koşullu güncellemeler); birden çok süreç çalıştırabilir.
 * @returns {Promise<{ expired: number, started: number }>} started: bu denetimde yayına giren fırsatlar
 */
export const syncWeeklyDealSchedule = (now = new Date()) => runWeeklyWrite(async () => {
  const since = lastScheduleCheckAt && lastScheduleCheckAt < now ? lastScheduleCheckAt : new Date(now.getTime() - START_LOOKBACK_MS);
  const result = await WeeklyProduct.updateMany(
    { isActive: true, endDate: { $ne: null, $lte: now } },
    { $set: { isActive: false } }
  );
  const expired = modifiedCount(result);
  let activation = { activated: 0, closed: 0, changed: false, late: 0 };
  try {
    activation = await activateDueWeeklyDeals(now, { since });
  } catch (error) {
    console.error("Planlı haftalık fırsatlar yayına alınamadı:", error.message);
  }
  const counted = Number(await WeeklyProduct.countDocuments({ isActive: true, startDate: { $gt: since, $lte: now } })) || 0;
  const started = counted + activation.late;
  lastScheduleCheckAt = now;
  if (expired > 0 || started > 0 || activation.changed) invalidateProductCaches();
  return { expired, started };
});

/** Yalnızca testler için */
export const resetWeeklyScheduleState = () => {
  lastScheduleCheckAt = null;
};
