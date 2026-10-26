// Fiyat bekçisi: ürünlerin market fiyatını yavaşça (gece, tek tek) kontrol eder.
// Kaynak sırası: Market Fiyatı (ücretsiz, TÜBİTAK) → Camgöz (kredi; yalnızca Market Fiyatı bulamazsa) → market sayfaları (SearXNG).
// Market sayfasında fiyat, sayfa o an açılarak okunur (güncel fiyat şartı); arama özetlerindeki eski fiyatlar kullanılmaz.
// Sonuçlar yalnızca yöneticiye gösterilir; hiçbir ürünün fiyatı kendiliğinden değişmez.
// Kayıtlar "price_watch" koleksiyonunda tutulur (_id = ürün id'si), işçinin ve kaynakların durumu "price_watch_state" içindedir.
import { searchSearxngWeb } from "./productAssist.service.js";
import { findMarketPrices } from "./marketPrice.service.js";
import { BARCODE_SEARCH_CREDITS, NAME_SEARCH_CREDITS, describeCamgozError, findCamgozPrices, resolveCamgozSettings } from "./camgoz.service.js";
import {
  MARKETFIYATI_MISS_RETRY_DAYS,
  MARKETFIYATI_STATE_ID,
  describeMarketfiyatiError,
  findMarketfiyatiPrices,
  nextPauseMs,
  resolveMarketfiyatiSettings,
  shouldPause as marketfiyatiShouldPause,
} from "./marketfiyati.service.js";

export const WATCH_COLLECTION = "price_watch";
export const STATE_COLLECTION = "price_watch_state";
export const TOP_SELLER_HOURS = 24; // en çok satanlar günde bir
export const NORMAL_HOURS = 7 * 24; // diğerleri haftada bir
export const ERROR_RETRY_HOURS = 24; // arama hatası alan ürün ertesi gün yeniden denenir
export const STALE_HOURS = 14 * 24; // bundan eski piyasa bilgisi "eski" sayılır
// Kayıt biçimi sürümü: 2 = market sayfasından okunan fiyat. Eski (arama özetinden) kayıtlar yok sayılır ve yeniden kontrol edilir.
export const WATCH_VERSION = 2;
// Bu kadar büyük fark büyük ihtimalle farklı ürün/gramajdır: "Emin değil" listesine düşer
export const SUSPICIOUS_ABOVE = 1; // %100'den pahalı
export const SUSPICIOUS_BELOW = -0.6; // %60'tan ucuz

const HOUR = 3600000;

const toInt = (value, fallback, min, max) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};

// "1-7" → { start: 1, end: 7 }; "23-6" gibi gece yarısını aşan aralıklar da geçerli
export const parseHours = (value, fallback = { start: 1, end: 7 }) => {
  const match = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(String(value ?? ""));
  if (!match) return fallback;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 24 || start === end) return fallback;
  return { start, end };
};

// "20-30" → { min: 20, max: 30 } (saniye)
export const parseDelay = (value, fallback = { min: 20, max: 30 }) => {
  const match = /^\s*(\d{1,4})\s*-\s*(\d{1,4})\s*$/.exec(String(value ?? ""));
  if (!match) return fallback;
  const min = Number(match[1]);
  const max = Number(match[2]);
  return min >= 5 && max >= min ? { min, max } : fallback;
};

export const priceWatchSettings = (env = process.env) => ({
  // Market Fiyatı anahtar gerektirmediği için bekçi varsayılan olarak açıktır; yalnızca PRICE_WATCH_ENABLED=false (ya da üç kaynak da kapalı) kapatır
  enabled: env.PRICE_WATCH_ENABLED !== "false" && Boolean(env.SEARXNG_URL || env.JOJAPI_API_KEY || env.MARKETFIYATI_ENABLED !== "false"),
  searxngConfigured: Boolean(env.SEARXNG_URL),
  hours: parseHours(env.PRICE_WATCH_HOURS),
  dailyLimit: toInt(env.PRICE_WATCH_DAILY_LIMIT, 300, 1, 2000),
  delay: parseDelay(env.PRICE_WATCH_DELAY_SEC),
  threshold: toInt(env.PRICE_WATCH_THRESHOLD, 20, 5, 90) / 100,
  topSellers: toInt(env.PRICE_WATCH_TOP_SELLERS, 100, 0, 1000),
});

// İstanbul saatine göre saat ve gün
export const istanbulClock = (date = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

export const inWindow = (hour, { start, end }) => (start < end ? hour >= start && hour < end : hour >= start || hour < end);

export const randomDelayMs = ({ min, max }, random = Math.random) => Math.round((min + random() * (max - min)) * 1000);

/** Bizim fiyatımız piyasa ortancasına göre: above (pahalı) / below (ucuz) / ok / unknown */
export const classifyPrice = (ourPrice, median, threshold = 0.2) => {
  if (!(Number(median) > 0) || !(Number(ourPrice) > 0)) return { level: "unknown", diff: null };
  const diff = (Number(ourPrice) - Number(median)) / Number(median);
  const rounded = Math.round(diff * 1000) / 1000;
  if (diff > threshold) return { level: "above", diff: rounded };
  if (diff < -threshold) return { level: "below", diff: rounded };
  return { level: "ok", diff: rounded };
};

const idOf = (value) => String(value?._id ?? value ?? "");
const ageHours = (date, now) => (date ? (now - new Date(date).getTime()) / HOUR : Infinity);

/** Bu ürün için Market Fiyatı yakın zamanda "bulunamadı" dedi mi? */
export const recentMarketfiyatiMiss = (watch, now) => Boolean(watch?.marketfiyatiMissAt) && ageHours(watch.marketfiyatiMissAt, now) < MARKETFIYATI_MISS_RETRY_DAYS * 24;
/** Camgöz isimle aramada yakın zamanda "bulunamadı" dedi mi? (barkod biliniyorsa barkodla aranır, miss sayılmaz) */
export const recentCamgozMiss = (watch, now) => !watch?.barcode && Boolean(watch?.camgozMissAt) && ageHours(watch.camgozMissAt, now) < CAMGOZ_MISS_RETRY_DAYS * 24;

/**
 * Sıradaki kontrol edilecek ürünler (saf fonksiyon).
 * Sıra: hiç kontrol edilmemişler (önce en çok satanlar) → vakti gelen en çok satanlar → vakti gelen diğerleri;
 * her grupta en eski kontrol önce. Gizli ve "yoksay" işaretli ürünler atlanır.
 * apiOnly (eski adı camgozOnly): market sayfalarına bakılamıyor; yalnızca API kaynaklarında (Market Fiyatı, varsa Camgöz)
 * bulunabilecek ürünler seçilir — iki kaynağın da yakın zamanda bulamadığı ürünler atlanır.
 */
export const selectDue = ({ products, watches, topSellerIds = [], now = Date.now(), limit = 1, camgozOnly = false, apiOnly = camgozOnly, camgozEnabled = true, marketfiyatiEnabled = true }) => {
  const watchMap = new Map(watches.map((watch) => [idOf(watch), watch]));
  const topRank = new Map(topSellerIds.map((id, index) => [idOf(id), index]));
  const due = [];
  for (const product of products) {
    if (product.isHidden) continue;
    const id = idOf(product);
    const watch = watchMap.get(id);
    if (watch?.ignored) continue;
    const isTop = topRank.has(id);
    if (apiOnly) {
      const marketfiyatiHopeless = !marketfiyatiEnabled || recentMarketfiyatiMiss(watch, now);
      const camgozHopeless = !camgozEnabled || recentCamgozMiss(watch, now);
      if (marketfiyatiHopeless && camgozHopeless) continue;
    }
    if (!watch?.checkedAt || watch.v !== WATCH_VERSION) {
      due.push({ product, group: 0, rank: isTop ? topRank.get(id) : Infinity, checkedAt: 0 });
      continue;
    }
    let interval = isTop ? TOP_SELLER_HOURS : NORMAL_HOURS;
    if (watch.status === "error") interval = Math.min(interval, ERROR_RETRY_HOURS);
    const age = ageHours(watch.checkedAt, now);
    // Camgöz'de bulunamayıp sayfa sınırı yüzünden market sayfalarına bakılamayan ürün sırası gelince yeniden denenir
    if (watch.pagesPending && !camgozOnly) {
      due.push({ product, group: 2, rank: 0, checkedAt: new Date(watch.checkedAt).getTime() });
      continue;
    }
    if (age < interval) continue;
    due.push({ product, group: isTop ? 1 : 2, rank: 0, checkedAt: new Date(watch.checkedAt).getTime() });
  }
  due.sort((a, b) => a.group - b.group || a.rank - b.rank || a.checkedAt - b.checkedAt);
  return due.slice(0, limit).map((item) => item.product);
};

// ── Kaynak (sağlayıcı) durumu ─────────────────────────────────────
// price_watch_state içinde her kaynağın kendi kaydı vardır: marketfiyati | camgoz | pages
// { lastOkAt, lastErrorAt, lastError: { at, status, message, detail }, consecutiveMisses, pausedUntil, pauseMs }
export const PROVIDERS = ["marketfiyati", "camgoz", "pages"];
export const PAGES_STATE_ID = "pages";

const cleanDetail = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/** Kaynak başarılı yanıt verdi (miss=true: ulaşıldı ama ürün bulunamadı) */
export const recordProviderOk = async (db, providerId, { now = new Date(), miss = false } = {}) => {
  const states = db.collection(STATE_COLLECTION);
  const state = (await states.findOne({ _id: providerId })) || {};
  const set = { lastOkAt: now, consecutiveMisses: miss ? (state.consecutiveMisses || 0) + 1 : 0, consecutiveErrors: 0 };
  await states.updateOne({ _id: providerId }, { $set: set, $inc: { requests: 1 }, $unset: { pausedUntil: "", pauseMs: "" } }, { upsert: true });
};

/**
 * Kaynak hata verdi. pause=true ise yalnızca bu kaynak ara verir: 15 dk'dan başlayıp her tekrarda ikiye katlanır (en çok 6 saat);
 * pauseMs verilirse sabit süre kullanılır. Hiçbir zaman fırlatmaz.
 */
export const recordProviderError = async (db, providerId, { now = new Date(), status = null, message = "", detail = "", pause = false, pauseMs = null } = {}) => {
  try {
    const states = db.collection(STATE_COLLECTION);
    const state = (await states.findOne({ _id: providerId })) || {};
    const set = {
      lastErrorAt: now,
      lastError: { at: now, status: status ?? null, message: String(message || "").slice(0, 200), detail: cleanDetail(detail) },
      consecutiveErrors: (state.consecutiveErrors || 0) + 1,
    };
    if (pause) {
      // Önceki ara daha yeni bittiyse (yarım saat içinde) süre katlanır; uzun süredir sorun yoksa 15 dk'dan başlanır
      const recentPause = state.pausedUntil && now - new Date(state.pausedUntil) < 30 * 60000;
      set.pauseMs = pauseMs || (recentPause || (state.pausedUntil && new Date(state.pausedUntil) > now) ? nextPauseMs(state.pauseMs) : nextPauseMs(0));
      set.pausedUntil = new Date(now.getTime() + set.pauseMs);
    }
    await states.updateOne({ _id: providerId }, { $set: set, $inc: { requests: 1 } }, { upsert: true });
    return set;
  } catch {
    return null;
  }
};

/** Kaynak şu an ara vermiş mi? (pausedUntil geçmişte kaldıysa değil) */
export const providerPausedUntil = (state, now = new Date()) => (state?.pausedUntil && new Date(state.pausedUntil) > now ? new Date(state.pausedUntil) : null);

/** Panel/işçi için kaynak özeti (saf fonksiyon) */
export const providerSummary = (state, { now = new Date() } = {}) => ({
  lastOkAt: state?.lastOkAt || null,
  lastErrorAt: state?.lastErrorAt || null,
  lastError: state?.lastError || null,
  consecutiveMisses: state?.consecutiveMisses || 0,
  consecutiveErrors: state?.consecutiveErrors || 0,
  requests: state?.requests || 0,
  pausedUntil: providerPausedUntil(state, now),
});

/** Son 30 günde en çok satılan ürünlerin id'leri (iptal edilen siparişler ve elle eklenen satırlar hariç). */
export const findTopSellerIds = async (db, { top = 100, days = 30, now = Date.now() } = {}) => {
  if (!top) return [];
  const rows = await db.collection("orders").aggregate([
    { $match: { createdAt: { $gte: new Date(now - days * 24 * HOUR) }, status: { $ne: "İptal Edildi" } } },
    { $unwind: "$products" },
    { $match: { "products.isManual": { $ne: true }, "products.product": { $ne: null } } },
    { $group: { _id: "$products.product", quantity: { $sum: "$products.quantity" } } },
    { $sort: { quantity: -1 } },
    { $limit: top },
  ]).toArray();
  return rows.map((row) => idOf(row._id));
};

// Panelde okunabilir hata metni
export const describeSearchError = (error) => {
  const code = String(error?.message || error || "");
  if (error?.name === "AbortError") return "arama motoru zamanında yanıt vermedi";
  if (code === "IMAGE_SEARCH_NOT_CONFIGURED") return "SEARXNG_URL ayarlı değil";
  if (code === "NO_PRICE_SOURCE") return "hiçbir fiyat kaynağı açık değil (Market Fiyatı kapalı, Camgöz anahtarı ve SEARXNG_URL yok)";
  const http = /^SEARXNG_(\d+)$/.exec(code);
  if (http) return `arama motoru yanıt vermedi (HTTP ${http[1]})`;
  const dns = /ENOTFOUND|EAI_AGAIN/.test(String(error?.cause?.code || error?.code || code));
  if (dns) return "arama motoru adresi çözülemedi (DNS)";
  if (/ECONNREFUSED|ECONNRESET|fetch failed/i.test(String(error?.cause?.code || code))) return "arama motoruna bağlanılamadı";
  return code.slice(0, 200) || "bilinmeyen hata";
};

/** Arama sorgusu: yöneticinin yazdığı özel sorgu, yoksa ürün adı */
export const watchQuery = (product, watch) => String(watch?.customQuery || product?.name || "").replace(/\s+/g, " ").trim().slice(0, 120);

const defaultSearch = (q) => {
  if (!process.env.SEARXNG_URL) throw new Error("IMAGE_SEARCH_NOT_CONFIGURED");
  return searchSearxngWeb(q, process.env.SEARXNG_URL);
};

/** Market sayfalarından güncel fiyat arayan fonksiyon (panelden elle kontrolde sayfalar arası bekleme kısaltılır) */
export const marketLookup = (options = {}) => (query) => findMarketPrices(query, { search: defaultSearch, ...options });

// ── Camgöz kredi bütçesi ──────────────────────────────────────────
// Varsayılan (CAMGOZ_PACING=even): aylık kredi ay boyunca eşit dağıtılır; panelden elle kontrol yalnızca aylık sınıra bakar.
// CAMGOZ_PACING=none ise kredi bitene kadar kullanılır.
export const CAMGOZ_STATE_ID = "camgoz";
export const CAMGOZ_MISS_RETRY_DAYS = 30; // Camgöz'de bulunamayan ürün için isimle arama 30 gün tekrarlanmaz
const CAMGOZ_PAUSE_MS = 6 * 3600000; // anahtar/kredi hatasında 6 saat Camgöz denenmez

const monthInfo = (date) => {
  const { day } = istanbulClock(date);
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { month: day.slice(0, 7), day, daysLeft: daysInMonth - dayOfMonth + 1 };
};

/** Bütçe kararı (saf fonksiyon) */
export const camgozAllowance = (state, { monthly, estimate, manual = false, paced = true, now = new Date() }) => {
  const { month, day, daysLeft } = monthInfo(now);
  const used = state?.month === month ? state.used || 0 : 0;
  const usedToday = state?.day === day ? state.usedToday || 0 : 0;
  if (state?.pausedUntil && new Date(state.pausedUntil) > now) return { ok: false, reason: "paused" };
  if (used + estimate > monthly) return { ok: false, reason: "monthly" };
  if (manual || !paced) return { ok: true };
  const dailyCap = Math.max(BARCODE_SEARCH_CREDITS, Math.ceil((monthly - (used - usedToday)) / daysLeft));
  if (usedToday + estimate > dailyCap) return { ok: false, reason: "daily" };
  return { ok: true };
};

const recordCamgozUse = async (db, credits, now, error) => {
  const states = db.collection(STATE_COLLECTION);
  const state = (await states.findOne({ _id: CAMGOZ_STATE_ID })) || {};
  const { month, day } = monthInfo(now);
  const set = {
    month,
    day,
    used: (state.month === month ? state.used || 0 : 0) + credits,
    usedToday: (state.day === day ? state.usedToday || 0 : 0) + credits,
    lastUsedAt: now,
  };
  if (error) {
    const status = Number(/^CAMGOZ_(\d+)$/.exec(error.message || "")?.[1]) || null;
    set.lastErrorAt = now;
    set.lastError = { at: now, status, message: describeCamgozError(error), detail: String(error.detail || "").slice(0, 120) };
    set.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
    if (/^CAMGOZ_(401|402|403|429)$/.test(error.message || "")) set.pausedUntil = new Date(now.getTime() + CAMGOZ_PAUSE_MS);
  } else {
    set.lastOkAt = now;
    set.consecutiveErrors = 0;
  }
  await states.updateOne({ _id: CAMGOZ_STATE_ID }, { $set: set, $inc: { requests: 1 } }, { upsert: true });
};

/** Camgöz bu an kullanılabilir mi (anahtar var, ara verilmemiş, kredi kalmış)? */
export const camgozReady = async (db, settings, { now = new Date(), estimate = BARCODE_SEARCH_CREDITS } = {}) => {
  if (!settings.enabled) return false;
  const state = await db.collection(STATE_COLLECTION).findOne({ _id: CAMGOZ_STATE_ID });
  return camgozAllowance(state, { monthly: settings.monthlyCredits, estimate, paced: settings.pacing === "even", now }).ok;
};

/** Yeni anahtar girilince bu ayın kredi sayacı ve hata/ara bilgisi sıfırlanır */
export const resetCamgozUsage = async (db, now = new Date()) => {
  const { month, day } = monthInfo(now);
  await db.collection(STATE_COLLECTION).updateOne(
    { _id: CAMGOZ_STATE_ID },
    { $set: { month, day, used: 0, usedToday: 0, resetAt: now }, $unset: { pausedUntil: "", lastError: "" } },
    { upsert: true },
  );
};

/**
 * Asıl fiyat kaynağı. Sıra:
 *   1. Market Fiyatı (ücretsiz; açık, ara vermemiş ve bu ürün için 7 gün içinde "bulunamadı" dememişse)
 *   2. Camgöz (yalnızca Market Fiyatı bulamazsa; anahtar, kredi ve günlük pay varsa)
 *   3. Market sayfaları (SEARXNG_URL ayarlıysa, kaynak ara vermemişse ve allowPages ise)
 * allowPages=false: günlük sayfa sınırı doldu ya da kaynak ara verdi; API kaynakları bulamazsa ürün "pagesPending" kalır.
 * settings (Camgöz) / marketfiyatiSettings verilmezse her çağrıda .env + panel ayarları okunur.
 * lookup(query, { watch }) → { offers, ..., provider, barcode, camgozMiss, marketfiyatiMiss, pagesUsed, pagesSkipped }
 * Kaynak hataları içeride yakalanıp kaynağın durum kaydına yazılır; yalnızca market sayfası hatası (başka kaynak denenmediyse) dışarı çıkar.
 */
export const priceLookup = ({
  db,
  manual = false,
  allowPages = true,
  settings,
  marketfiyatiSettings: mfSettings,
  marketfiyati = findMarketfiyatiPrices,
  camgoz = findCamgozPrices,
  pages,
  // pages fonksiyonu verildiyse (testler) market sayfaları "ayarlı" sayılır; yoksa SEARXNG_URL'e bakılır
  pagesConfigured = pages ? true : Boolean(process.env.SEARXNG_URL),
} = {}) =>
  async (query, { watch, now = new Date() } = {}) => {
    const searchPages = pages || marketLookup(manual ? { pause: () => new Promise((resolve) => setTimeout(resolve, 1500)) } : {});
    const states = db.collection(STATE_COLLECTION);
    const barcode = watch?.barcode || null;
    const trustedBarcode = watch?.barcodeSource === "manual";
    const notes = [];
    const rejected = [];
    let tried = 0; // denenen API kaynağı sayısı
    let marketfiyatiMiss = false;
    let camgozMiss = false;
    let foundBarcode = null;

    // 1) Market Fiyatı
    const mf = mfSettings || (await resolveMarketfiyatiSettings(db));
    if (mf.enabled && !recentMarketfiyatiMiss(watch, now)) {
      const state = await states.findOne({ _id: MARKETFIYATI_STATE_ID });
      const paused = providerPausedUntil(state, now);
      if (!paused) {
        tried += 1;
        try {
          const result = await marketfiyati(query, { barcode, trustedBarcode, settings: mf, now });
          await recordProviderOk(db, MARKETFIYATI_STATE_ID, { now, miss: !result.offers.length });
          rejected.push(...(result.rejected || []));
          if (result.offers.length) return { ...result, provider: "marketfiyati", barcode: result.barcode || barcode, pagesUsed: false };
          marketfiyatiMiss = true;
          notes.push(result.note);
        } catch (error) {
          const message = describeMarketfiyatiError(error);
          const pause = marketfiyatiShouldPause(error);
          const saved = await recordProviderError(db, MARKETFIYATI_STATE_ID, { now, status: error?.status ?? null, message, detail: error?.detail, pause });
          notes.push(pause && saved?.pausedUntil ? `${message}; Market Fiyatı ${Math.round(saved.pauseMs / 60000)} dk denenmeyecek.` : message);
        }
      } else if (manual) notes.push(`Market Fiyatı ${Math.max(1, Math.round((paused - now) / 60000))} dk daha beklemede.`);
    }

    // 2) Camgöz — yalnızca Market Fiyatı bulamadıysa
    const active = settings || (await resolveCamgozSettings(db));
    if (active.enabled && !recentCamgozMiss(watch, now)) {
      const estimate = barcode ? BARCODE_SEARCH_CREDITS : NAME_SEARCH_CREDITS;
      const state = await states.findOne({ _id: CAMGOZ_STATE_ID });
      const allowance = camgozAllowance(state, { monthly: active.monthlyCredits, estimate, manual, paced: active.pacing === "even", now });
      if (allowance.ok) {
        tried += 1;
        try {
          const result = await camgoz(query, { barcode, trustedBarcode, settings: active, now });
          await recordCamgozUse(db, result.credits || estimate, now);
          rejected.push(...(result.rejected || []));
          foundBarcode = result.barcode || null;
          camgozMiss = !result.barcode;
          if (result.offers.length) return { ...result, provider: "camgoz", rejected, marketfiyatiMiss, pagesUsed: false };
          notes.push(result.note);
        } catch (error) {
          await recordCamgozUse(db, error.credits || 0, now, error);
          notes.push(describeCamgozError(error));
        }
      } else if (allowance.reason === "monthly") notes.push("Camgöz aylık kredisi doldu.");
    }

    const base = { median: null, min: null, max: null, confidence: null, barcode: foundBarcode || barcode, camgozMiss, marketfiyatiMiss };
    // 3) Market sayfaları
    const pagesState = pagesConfigured ? await states.findOne({ _id: PAGES_STATE_ID }) : null;
    const pagesPaused = providerPausedUntil(pagesState, now);
    if (!pagesConfigured) {
      if (!tried) throw new Error("NO_PRICE_SOURCE");
      return { ...base, offers: [], rejected, provider: null, pagesUsed: false, pagesSkipped: false, note: notes.filter(Boolean).join(" ") };
    }
    if (!allowPages || pagesPaused) {
      const why = pagesPaused ? "Market sayfaları ara verdiği için sonra bakılacak." : "Market sayfalarına bugünkü sınır dolduğu için sonra bakılacak.";
      return { ...base, offers: [], rejected, provider: null, pagesUsed: false, pagesSkipped: true, note: [...notes, why].filter(Boolean).join(" ") };
    }
    let fallback;
    try {
      fallback = await searchPages(query);
      await recordProviderOk(db, PAGES_STATE_ID, { now, miss: !fallback.offers.length });
    } catch (error) {
      await recordProviderError(db, PAGES_STATE_ID, { now, message: describeSearchError(error), detail: error?.message });
      // SearXNG çöktüyse ve başka kaynak denendiyse sonuç "bulunamadı" sayılır; hiçbiri denenmediyse hata olur
      if (!tried) throw error;
      fallback = { offers: [], rejected: [], median: null, min: null, max: null, confidence: null, note: describeSearchError(error) };
    }
    return {
      ...fallback,
      ...(fallback.offers.length ? {} : base),
      provider: "pages",
      pagesUsed: true,
      barcode: base.barcode,
      camgozMiss,
      marketfiyatiMiss,
      note: fallback.offers.length ? fallback.note : [...notes, fallback.note].filter(Boolean).join(" "),
      rejected: [...rejected, ...(fallback.rejected || [])],
    };
  };

/**
 * Tek ürünü kontrol eder ve sonucu kaydeder. Hata fırlatmaz; kaydedilen alanları döndürür.
 * lookup(query, { watch, now }) → { offers, median, min, max, confidence, note, rejected, provider, barcode } (varsayılan: Market Fiyatı → Camgöz → market sayfaları).
 * Arama başarısız olursa yalnızca durum "error" olur.
 */
export const checkProduct = async ({ db, product, lookup = priceLookup({ db }), now = new Date() }) => {
  const watches = db.collection(WATCH_COLLECTION);
  const existing = await watches.findOne({ _id: product._id });
  const query = watchQuery(product, existing);
  let fields;
  let pagesUsed; // kaydedilmez; işçi günlük sayfa sınırını bununla sayar
  try {
    const result = await lookup(query, { watch: existing?.v === WATCH_VERSION ? existing : { barcode: existing?.barcode, barcodeSource: existing?.barcodeSource }, now });
    const offers = Array.isArray(result?.offers) ? result.offers : [];
    fields = offers.length
      ? { status: "ok", median: result.median, min: result.min, max: result.max, offerCount: offers.length, offers, foundAt: now }
      : { status: "not-found", median: null, min: null, max: null, offerCount: 0, offers: [] };
    Object.assign(fields, {
      confidence: offers.length ? result.confidence || "low" : null,
      note: result?.note || "",
      rejected: (result?.rejected || []).slice(0, 5),
      provider: result?.provider || null,
      error: null,
    });
    // Camgöz'ün bulduğu barkod saklanır (yöneticinin yazdığı barkod değiştirilmez)
    if (result?.barcode && existing?.barcodeSource !== "manual") Object.assign(fields, { barcode: String(result.barcode), barcodeSource: "auto" });
    if (result?.camgozMiss) fields.camgozMissAt = now;
    // Market Fiyatı bulamadıysa 7 gün yeniden sorulmaz; bulduysa eski "bulunamadı" işareti kalkar
    if (result?.marketfiyatiMiss) fields.marketfiyatiMissAt = now;
    else if (result?.provider === "marketfiyati") fields.marketfiyatiMissAt = null;
    fields.pagesPending = Boolean(result?.pagesSkipped && !offers.length);
    pagesUsed = Boolean(result?.pagesUsed);
  } catch (error) {
    pagesUsed = true; // API kaynaklarının hataları içeride yakalanır; buraya gelen hata market sayfası aramasındandır
    fields = { status: "error", error: describeSearchError(error) };
    // Arama motoru geçici olarak yanıt vermediyse önceki güncel bilgi korunur; eski sürüm bilgi ise silinir
    if (existing?.v !== WATCH_VERSION) Object.assign(fields, { median: null, min: null, max: null, offerCount: 0, offers: [], confidence: null, note: "" });
  }
  Object.assign(fields, { query, ourPrice: product.price, checkedAt: now, v: WATCH_VERSION });
  await watches.updateOne({ _id: product._id }, { $set: fields, $setOnInsert: { ignored: false, createdAt: now } }, { upsert: true });
  return { ...existing, ...fields, _id: product._id, pagesUsed };
};

/** Panel satırı: ürün + piyasa kaydı + sınıflandırma (saf fonksiyon) */
export const buildRow = (product, rawWatch, { threshold = 0.2, now = Date.now() } = {}) => {
  // Eski sürüm kayıtlardaki piyasa bilgisi gösterilmez (yalnızca yönetici ayarları korunur)
  const watch = rawWatch && rawWatch.v !== WATCH_VERSION
    ? { ignored: rawWatch.ignored, customQuery: rawWatch.customQuery, barcode: rawWatch.barcode, barcodeSource: rawWatch.barcodeSource }
    : rawWatch;
  const checked = Boolean(watch?.checkedAt);
  const { level, diff } = classifyPrice(product.price, watch?.median, threshold);
  let filter = "unchecked";
  let note = watch?.note || "";
  const suspicious = diff !== null && (diff > SUSPICIOUS_ABOVE || diff < SUSPICIOUS_BELOW);
  if (suspicious && (!note || watch.confidence === "high")) note = "Fark çok büyük; sayfadaki ürün farklı gramaj ya da çeşit olabilir.";
  if (watch?.ignored) filter = "ignored";
  else if (checked && level !== "unknown" && (watch.confidence !== "high" || suspicious)) filter = "unsure";
  else if (checked && level === "above") filter = "above";
  else if (checked && level === "below") filter = "below";
  else if (checked && level === "ok") filter = "ok";
  else if (checked) filter = "missing"; // bulunamadı ya da arama hatası
  return {
    id: idOf(product),
    name: product.name,
    image: product.thumbnail || product.image || "",
    category: product.category,
    price: product.price,
    isDiscounted: Boolean(product.isDiscounted && product.discountedPrice),
    discountedPrice: product.isDiscounted ? product.discountedPrice : null,
    isOutOfStock: Boolean(product.isOutOfStock),
    filter,
    level,
    diff,
    status: watch?.status || null,
    median: watch?.median ?? null,
    min: watch?.min ?? null,
    max: watch?.max ?? null,
    offerCount: watch?.offerCount || 0,
    offers: (watch?.offers || []).slice(0, 6).map(({ price, source, pageUrl, title, readAt }) => ({ price, source, pageUrl, title, readAt: readAt || null })),
    provider: watch?.provider || null,
    barcode: watch?.barcode || "",
    barcodeSource: watch?.barcodeSource || null,
    rejected: (watch?.rejected || []).slice(0, 5).map(({ source, pageUrl, title, reason }) => ({ source, pageUrl, title: title || "", reason })),
    confidence: watch?.confidence || null,
    note,
    query: watch?.query || product.name,
    customQuery: watch?.customQuery || "",
    checkedAt: watch?.checkedAt || null,
    stale: checked && ageHours(watch.checkedAt, now) > STALE_HOURS,
    error: watch?.status === "error" ? watch.error || "" : "",
    ignored: Boolean(watch?.ignored),
  };
};

export const FILTERS = ["above", "below", "unsure", "missing", "ok", "unchecked", "ignored"];

const SORTERS = {
  above: (a, b) => b.diff - a.diff,
  below: (a, b) => a.diff - b.diff,
  ok: (a, b) => Math.abs(b.diff) - Math.abs(a.diff),
};

const normalize = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Satırları sayar, filtreler, arar ve sayfalar (saf fonksiyon) */
export const listRows = (rows, { filter = "above", q = "", page = 1, pageSize = 30 } = {}) => {
  const counts = Object.fromEntries(FILTERS.map((key) => [key, 0]));
  for (const row of rows) counts[row.filter] += 1;
  const words = normalize(q).split(" ").filter(Boolean);
  const active = FILTERS.includes(filter) ? filter : "above";
  let items = rows.filter((row) => row.filter === active);
  if (words.length) items = items.filter((row) => words.every((word) => normalize(row.name).includes(word)));
  const sorter = SORTERS[active] || ((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
  items.sort(sorter);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Math.round(Number(page)) || 1), pages);
  return { counts, filter: active, total: items.length, page: current, pages, items: items.slice((current - 1) * pageSize, current * pageSize) };
};

/** Son 7 günde kontrol edilen (yoksayılmayan) ürünlerin oranı */
export const coverage = (rows, now = Date.now()) => {
  const tracked = rows.filter((row) => !row.ignored);
  const fresh = tracked.filter((row) => row.checkedAt && ageHours(row.checkedAt, now) <= NORMAL_HOURS).length;
  return { tracked: tracked.length, fresh, percent: tracked.length ? Math.round((fresh / tracked.length) * 100) : 0 };
};
