// Fiyat bekçisi: ürünlerin market fiyatını yavaşça (gece, tek tek) kontrol eder.
// Fiyat, market ürün sayfası o an açılarak okunur (güncel fiyat şartı); arama özetlerindeki eski fiyatlar kullanılmaz.
// Sonuçlar yalnızca yöneticiye gösterilir; hiçbir ürünün fiyatı kendiliğinden değişmez.
// Kayıtlar "price_watch" koleksiyonunda tutulur (_id = ürün id'si), işçinin durumu "price_watch_state" içindedir.
import { searchSearxngWeb } from "./productAssist.service.js";
import { findMarketPrices } from "./marketPrice.service.js";
import { BARCODE_SEARCH_CREDITS, NAME_SEARCH_CREDITS, camgozSettings, describeCamgozError, findCamgozPrices } from "./camgoz.service.js";

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
  enabled: env.PRICE_WATCH_ENABLED !== "false" && Boolean(env.SEARXNG_URL || env.JOJAPI_API_KEY),
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

/**
 * Sıradaki kontrol edilecek ürünler (saf fonksiyon).
 * Sıra: hiç kontrol edilmemişler (önce en çok satanlar) → vakti gelen en çok satanlar → vakti gelen diğerleri;
 * her grupta en eski kontrol önce. Gizli ve "yoksay" işaretli ürünler atlanır.
 */
export const selectDue = ({ products, watches, topSellerIds = [], now = Date.now(), limit = 1 }) => {
  const watchMap = new Map(watches.map((watch) => [idOf(watch), watch]));
  const topRank = new Map(topSellerIds.map((id, index) => [idOf(id), index]));
  const due = [];
  for (const product of products) {
    if (product.isHidden) continue;
    const id = idOf(product);
    const watch = watchMap.get(id);
    if (watch?.ignored) continue;
    const isTop = topRank.has(id);
    if (!watch?.checkedAt || watch.v !== WATCH_VERSION) {
      due.push({ product, group: 0, rank: isTop ? topRank.get(id) : Infinity, checkedAt: 0 });
      continue;
    }
    let interval = isTop ? TOP_SELLER_HOURS : NORMAL_HOURS;
    if (watch.status === "error") interval = Math.min(interval, ERROR_RETRY_HOURS);
    const age = ageHours(watch.checkedAt, now);
    if (age < interval) continue;
    due.push({ product, group: isTop ? 1 : 2, rank: 0, checkedAt: new Date(watch.checkedAt).getTime() });
  }
  due.sort((a, b) => a.group - b.group || a.rank - b.rank || a.checkedAt - b.checkedAt);
  return due.slice(0, limit).map((item) => item.product);
};

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
  const http = /^SEARXNG_(\d+)$/.exec(code);
  if (http) return `arama motoru yanıt vermedi (HTTP ${http[1]})`;
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
// Aylık kredi ay boyunca eşit dağıtılır (gece işçisi ilk gün hepsini harcamasın); panelden elle kontrol yalnızca aylık sınıra bakar.
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
export const camgozAllowance = (state, { monthly, estimate, manual = false, now = new Date() }) => {
  const { month, day, daysLeft } = monthInfo(now);
  const used = state?.month === month ? state.used || 0 : 0;
  const usedToday = state?.day === day ? state.usedToday || 0 : 0;
  if (state?.pausedUntil && new Date(state.pausedUntil) > now) return { ok: false, reason: "paused" };
  if (used + estimate > monthly) return { ok: false, reason: "monthly" };
  if (manual) return { ok: true };
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
    set.lastError = { at: now, message: describeCamgozError(error) };
    if (/^CAMGOZ_(401|402|403|429)$/.test(error.message || "")) set.pausedUntil = new Date(now.getTime() + CAMGOZ_PAUSE_MS);
  }
  await states.updateOne({ _id: CAMGOZ_STATE_ID }, { $set: set }, { upsert: true });
};

/**
 * Asıl fiyat kaynağı: önce Camgöz (anahtar ve kredi varsa), bulamazsa market sayfaları.
 * lookup(query, { watch }) → { offers, ..., provider, barcode, camgozMiss }
 */
export const priceLookup = ({ db, manual = false, settings = camgozSettings(), camgoz = findCamgozPrices, pages = marketLookup(manual ? { pause: () => new Promise((resolve) => setTimeout(resolve, 1500)) } : {}) } = {}) =>
  async (query, { watch, now = new Date() } = {}) => {
    let camgozResult = null;
    let camgozNote = "";
    const barcode = watch?.barcode || null;
    const recentMiss = !barcode && watch?.camgozMissAt && (now - new Date(watch.camgozMissAt)) / 86400000 < CAMGOZ_MISS_RETRY_DAYS;
    if (settings.enabled && !recentMiss) {
      const estimate = barcode ? BARCODE_SEARCH_CREDITS : NAME_SEARCH_CREDITS;
      const state = await db.collection(STATE_COLLECTION).findOne({ _id: CAMGOZ_STATE_ID });
      const allowance = camgozAllowance(state, { monthly: settings.monthlyCredits, estimate, manual, now });
      if (allowance.ok) {
        try {
          camgozResult = await camgoz(query, { barcode, trustedBarcode: watch?.barcodeSource === "manual", settings, now });
          await recordCamgozUse(db, camgozResult.credits || estimate, now);
          if (camgozResult.offers.length) return { ...camgozResult, provider: "camgoz" };
          camgozNote = camgozResult.note;
        } catch (error) {
          await recordCamgozUse(db, error.credits || 0, now, error);
          camgozNote = describeCamgozError(error);
        }
      } else if (allowance.reason === "monthly") camgozNote = "Camgöz aylık kredisi doldu.";
    }
    let fallback;
    try {
      fallback = await pages(query);
    } catch (error) {
      // SearXNG yoksa/çöktüyse ve Camgöz denendiyse sonuç "bulunamadı" sayılır; hiçbiri denenmediyse hata olur
      if (!camgozResult) throw error;
      fallback = { offers: [], rejected: [], median: null, min: null, max: null, confidence: null, note: "" };
    }
    return {
      ...fallback,
      provider: "pages",
      barcode: camgozResult?.barcode || barcode,
      camgozMiss: Boolean(camgozResult && !camgozResult.barcode),
      note: fallback.offers.length ? fallback.note : [camgozNote, fallback.note].filter(Boolean).join(" "),
      rejected: [...(camgozResult?.rejected || []), ...(fallback.rejected || [])],
    };
  };

/**
 * Tek ürünü kontrol eder ve sonucu kaydeder. Hata fırlatmaz; kaydedilen alanları döndürür.
 * lookup(query, { watch, now }) → { offers, median, min, max, confidence, note, rejected, provider, barcode } (varsayılan: Camgöz → market sayfaları).
 * Arama başarısız olursa yalnızca durum "error" olur.
 */
export const checkProduct = async ({ db, product, lookup = priceLookup({ db }), now = new Date() }) => {
  const watches = db.collection(WATCH_COLLECTION);
  const existing = await watches.findOne({ _id: product._id });
  const query = watchQuery(product, existing);
  let fields;
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
  } catch (error) {
    fields = { status: "error", error: describeSearchError(error) };
    // Arama motoru geçici olarak yanıt vermediyse önceki güncel bilgi korunur; eski sürüm bilgi ise silinir
    if (existing?.v !== WATCH_VERSION) Object.assign(fields, { median: null, min: null, max: null, offerCount: 0, offers: [], confidence: null, note: "" });
  }
  Object.assign(fields, { query, ourPrice: product.price, checkedAt: now, v: WATCH_VERSION });
  await watches.updateOne({ _id: product._id }, { $set: fields, $setOnInsert: { ignored: false, createdAt: now } }, { upsert: true });
  return { ...existing, ...fields, _id: product._id };
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
