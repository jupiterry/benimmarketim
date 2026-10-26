// Market Fiyatı (marketfiyati.org.tr) — TÜBİTAK BİLGEM'in halka açık fiyat platformu.
// A101, BİM, Migros, Şok, CarrefourSA, Hakmar ve Tarım Kredi şubelerinin fiyatlarını konuma göre verir; ücretsizdir.
// Resmî/belgelenmiş bir API değildir: sitenin kendi kullandığı JSON uçları okunur (açık kaynak istemcilerden derlenmiş biçim).
// Bu yüzden istekler yavaş (en az 2,5 sn arayla), engel/sınır (403/429/5xx) gelince katlanarak uzayan ara verilir.
// Dönen biçim camgoz.service.js'teki findCamgozPrices ile aynıdır; sonuçlar yalnızca yöneticiye gösterilir.
import { DEFAULT_CHAINS, chainOf } from "./camgoz.service.js";
<<<<<<< HEAD
import { matchProduct, nameTokens, parseSize } from "./marketPrice.service.js";
=======
import { matchProduct, parseSize } from "./marketPrice.service.js";
>>>>>>> origin/main

export const MARKETFIYATI_URL = "https://api.marketfiyati.org.tr";
export const MARKETFIYATI_SITE = "https://marketfiyati.org.tr";
export const MARKETFIYATI_TERMS_URL = "https://marketfiyati.org.tr/kullanim-kosullari";
export const MARKETFIYATI_STATE_ID = "marketfiyati"; // price_watch_state içindeki durum kaydı
export const MARKETFIYATI_CONFIG_ID = "marketfiyati_config"; // panelden girilen ayarlar
export const MARKETFIYATI_MISS_RETRY_DAYS = 7; // bulunamayan ürün 7 gün yeniden sorulmaz
export const DEFAULT_LOCATION = { latitude: 41.2207, longitude: 31.9563 }; // Devrek, Zonguldak
export const FALLBACK_DISTANCE_KM = 150; // yakın şubelerde yoksa bir kez daha geniş alanda aranır
export const PAUSE_MIN_MS = 15 * 60000;
export const PAUSE_MAX_MS = 6 * 3600000;
export const CACHE_TTL_MS = 6 * 3600000;
export const SEARCH_SIZE = 20;
<<<<<<< HEAD
export const FAR_PRICE_SPREAD = 0.03; // yakın şubesi olmayan zincirde şube fiyatları bundan fazla ayrışıyorsa güven "low"
=======
>>>>>>> origin/main
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

// Platformun market kodları → panelde gösterilen zincir adı
const MARKET_LABELS = {
  a101: "A101",
  bim: "BİM",
  migros: "Migros",
  sok: "Şok",
  carrefoursa: "Carrefour",
  carrefour: "Carrefour",
  hakmar: "Hakmar",
  "tarim kredi": "Tarım Kredi",
  tarimkredi: "Tarım Kredi",
};

const toNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};
const toInt = (value, fallback, min, max) => {
  const number = toNumber(value, NaN, min, max);
  return Number.isFinite(number) ? Math.round(number) : fallback;
};

// ── Ayarlar ───────────────────────────────────────────────────────

/** .env varsayılanları (panel ayarları resolveMarketfiyatiSettings ile üstüne yazılır) */
export const marketfiyatiSettings = (env = process.env) => ({
  enabled: env.MARKETFIYATI_ENABLED !== "false",
  latitude: toNumber(env.MARKETFIYATI_LAT, DEFAULT_LOCATION.latitude, -90, 90),
  longitude: toNumber(env.MARKETFIYATI_LON, DEFAULT_LOCATION.longitude, -180, 180),
  distanceKm: toInt(env.MARKETFIYATI_DISTANCE_KM, 60, 1, 500),
  minIntervalMs: toInt(env.MARKETFIYATI_MIN_INTERVAL_MS, 2500, 500, 600000),
  maxAgeDays: toInt(env.MARKETFIYATI_MAX_AGE_DAYS, 14, 1, 365),
  timeoutMs: toInt(env.MARKETFIYATI_TIMEOUT_MS, 12000, 1000, 60000),
  // Zincir filtresi Camgöz ayarıyla ortak (CAMGOZ_MARKETS)
  chains: (env.CAMGOZ_MARKETS ? env.CAMGOZ_MARKETS.split(",") : DEFAULT_CHAINS).map((name) => name.trim()).filter(Boolean),
  source: "env",
});

export const CONFIG_FIELDS = ["enabled", "latitude", "longitude", "distanceKm", "minIntervalMs", "maxAgeDays"];

/** Panelden gelen ayarları doğrular; hatalıysa { error } döner */
export const validateMarketfiyatiConfig = (body = {}) => {
  const set = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { error: "Açık/kapalı değeri geçersiz." };
    set.enabled = body.enabled;
  }
  const lat = body.latitude !== undefined ? toNumber(body.latitude, NaN, -90, 90) : undefined;
  const lon = body.longitude !== undefined ? toNumber(body.longitude, NaN, -180, 180) : undefined;
  if (lat !== undefined && !Number.isFinite(lat)) return { error: "Enlem -90 ile 90 arasında olmalı." };
  if (lon !== undefined && !Number.isFinite(lon)) return { error: "Boylam -180 ile 180 arasında olmalı." };
  if (lat !== undefined) set.latitude = Math.round(lat * 1e5) / 1e5;
  if (lon !== undefined) set.longitude = Math.round(lon * 1e5) / 1e5;
  if (body.distanceKm !== undefined) {
    const value = toInt(body.distanceKm, NaN, 1, 500);
    if (!Number.isFinite(value)) return { error: "Mesafe 1 ile 500 km arasında olmalı." };
    set.distanceKm = value;
  }
  if (body.minIntervalMs !== undefined) {
    const value = toInt(body.minIntervalMs, NaN, 500, 600000);
    if (!Number.isFinite(value)) return { error: "İstekler arası bekleme 500 ms ile 600.000 ms arasında olmalı." };
    set.minIntervalMs = value;
  }
  if (body.maxAgeDays !== undefined) {
    const value = toInt(body.maxAgeDays, NaN, 1, 365);
    if (!Number.isFinite(value)) return { error: "Fiyat yaşı 1 ile 365 gün arasında olmalı." };
    set.maxAgeDays = value;
  }
  return { set };
};

/** .env varsayılanları + panelde kaydedilen ayarlar (price_watch_state, _id: "marketfiyati_config") */
export const resolveMarketfiyatiSettings = async (db, env = process.env) => {
  const base = marketfiyatiSettings(env);
  const doc = await db.collection("price_watch_state").findOne({ _id: MARKETFIYATI_CONFIG_ID }).catch(() => null);
  if (!doc) return base;
  const settings = { ...base };
  for (const key of CONFIG_FIELDS) if (doc[key] !== undefined && doc[key] !== null) settings[key] = doc[key];
  if (CONFIG_FIELDS.some((key) => doc[key] !== undefined && doc[key] !== null)) settings.source = "panel";
  settings.updatedAt = doc.updatedAt || null;
  return settings;
};

// ── Hız sınırlayıcı ve önbellek (süreç içi) ─────────────────────────

/**
 * Süreç içinde tüm Market Fiyatı istekleri aynı sırada bekler: iki istek arası en az minIntervalMs + rastgele ek (%0–40).
 * wait(ms) ve now() testlerde değiştirilebilir.
 */
export const createRateLimiter = ({ wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now, random = Math.random } = {}) => {
  let nextAllowedAt = 0;
  return {
    async acquire(minIntervalMs) {
      const current = now();
      const jitter = Math.round(minIntervalMs * 0.4 * random());
      const delay = Math.max(0, nextAllowedAt - current) + jitter;
      nextAllowedAt = current + delay + minIntervalMs;
      if (delay > 0) await wait(delay);
      return delay;
    },
    reset() {
      nextAllowedAt = 0;
    },
  };
};

export const rateLimiter = createRateLimiter();

const cache = new Map();
const cacheKey = (parts) => JSON.stringify(parts);
const readCache = (key, now, store = cache) => {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry.value;
};
const writeCache = (key, value, now, store = cache) => {
  if (store.size > 2000) store.clear();
  store.set(key, { value, expiresAt: now + CACHE_TTL_MS });
};
const nearestCache = new Map(); // konum → yakın şube kimlikleri (6 saat)
export const clearMarketfiyatiCache = () => {
  cache.clear();
  nearestCache.clear();
};

// ── HTTP ─────────────────────────────────────────────────────────────

/** Sunucu yanıtından kısa, HTML'siz açıklama (en çok 120 karakter) */
export const shortBody = (text) => {
  let message = "";
  try {
    const body = JSON.parse(text);
    message = [body?.message, body?.error?.message || body?.error, body?.detail, body?.title].find((item) => typeof item === "string" && item.trim()) || "";
  } catch {
    message = String(text || "").replace(/<[^>]+>/g, " ");
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 120);
};

export class MarketfiyatiError extends Error {
  constructor(code, { status = null, detail = "", cause } = {}) {
    super(code, cause ? { cause } : undefined);
    this.name = "MarketfiyatiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Tek JSON isteği. Hata: MarketfiyatiError (MARKETFIYATI_<durum> | MARKETFIYATI_TIMEOUT | MARKETFIYATI_NETWORK | MARKETFIYATI_BAD_JSON). */
export const marketfiyatiRequest = async (path, body, { fetchImpl = fetch, timeoutMs = 12000, method = "POST" } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${MARKETFIYATI_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        Origin: MARKETFIYATI_SITE,
        Referer: `${MARKETFIYATI_SITE}/`,
        "Accept-Language": "tr-TR,tr;q=0.9",
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new MarketfiyatiError("MARKETFIYATI_TIMEOUT", { cause: error });
    const detail = String(error?.cause?.code || error?.code || error?.cause?.message || error?.message || "").slice(0, 120);
    throw new MarketfiyatiError("MARKETFIYATI_NETWORK", { detail, cause: error });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = typeof response.text === "function" ? await response.text().catch(() => "") : "";
    throw new MarketfiyatiError(`MARKETFIYATI_${response.status}`, { status: response.status, detail: shortBody(text) });
  }
  try {
    return await response.json();
  } catch (error) {
    throw new MarketfiyatiError("MARKETFIYATI_BAD_JSON", { status: response.status, detail: "yanıt JSON değil", cause: error });
  }
};

/** Anahtar kelime araması: POST /api/v2/search (depots verilirse yalnızca o şubelerde aranır) */
export const marketfiyatiSearch = (keywords, { latitude, longitude, distance, size = SEARCH_SIZE, pages = 0, depots, ...options }) =>
  marketfiyatiRequest("/api/v2/search", { keywords, pages, size, latitude, longitude, distance, ...(Array.isArray(depots) ? { depots } : {}) }, options);

/** Konuma yakın şubeler: POST /api/v2/nearest → [{ id, sellerName, marketName, location, distance }] */
export const marketfiyatiNearest = ({ latitude, longitude, distance, ...options }) =>
  marketfiyatiRequest("/api/v2/nearest", { latitude, longitude, distance }, options);

/** nearest yanıtından şube kimlikleri (dizi ya da { content | depots | data: [...] }; kayıt { id | depotId } ya da düz metin) */
export const parseNearestDepots = (body) => {
  const list = Array.isArray(body) ? body : [body?.content, body?.depots, body?.data].find(Array.isArray) || [];
  const ids = list.map((item) => (typeof item === "string" || typeof item === "number" ? item : item?.id ?? item?.depotId)).map((id) => String(id ?? "").trim()).filter(Boolean);
  return [...new Set(ids)];
};

/** Barkodla arama: POST /api/v2/searchByIdentity (identityType "barcode"; platformda bu tür her zaman desteklenmeyebilir) */
export const marketfiyatiSearchByBarcode = (barcode, { latitude, longitude, distance, keywords, ...options }) =>
  marketfiyatiRequest("/api/v2/searchByIdentity", { identity: String(barcode), identityType: "barcode", keywords: keywords || undefined, latitude, longitude, distance }, options);

// ── Yanıtı okuma (saf fonksiyonlar) ─────────────────────────────────

// "2026-10-20T03:00:00" (saat dilimi yoksa İstanbul), ISO ya da epoch → Date; okunamazsa null
export const parseIndexTime = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  let text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) && !/(Z|[+-]\d{2}:?\d{2})$/.test(text)) text = `${text.replace(" ", "T")}+03:00`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** İki nokta arası km (haversine) */
export const distanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};

/** Market kodunu zincir adına çevirir; izin verilen zincirlerden değilse null */
export const chainLabel = (marketAdi, chains = DEFAULT_CHAINS) => {
  const key = String(marketAdi ?? "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const label = MARKET_LABELS[key] || MARKET_LABELS[key.replace(/ /g, "")] || null;
  const allowed = chainOf(label || marketAdi, chains);
  if (!allowed) return null;
  return label || allowed;
};

// Ürün adında gramaj yoksa platformun "refinedVolumeOrWeight" + birim bilgisi eklenir
export const productTitle = (item) => {
  const title = String(item?.title || "").replace(/\s+/g, " ").trim();
  const amount = String(item?.refinedVolumeOrWeight ?? "").trim();
  const unit = String(item?.refinedQuantityUnit ?? "").trim();
  if (parseSize(title) || !amount || !/^\d+([.,]\d+)?$/.test(amount)) return title;
  return `${title} ${amount} ${unit || "g"}`.trim();
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
};

<<<<<<< HEAD
/**
 * Aramadan bizim ürüne en uygun kaydı seçer (Camgöz ile aynı davranış).
 * - Bizim adda gramaj varsa: matchProduct (marka + kelimeler + gramaj/paket; birim dönüşümü ve "x" çoklu paket parseSize'tan).
 *   Gramajı tutan kayıt öncelikli; eşitse tüm kelimeleri içeren, sonra daha çok şubesi olan.
 * - Bizim adda gramaj yoksa gramaj/paket eşitliği aranmaz: tüm kelimelerimizi (marka başta) içeren başlıklar arasından
 *   en az fazladan kelimesi olan seçilir; güven "low", reason "ürün adında gramaj yok" (yönetici barkodla düzeltir).
 *   Gramaj olmadan %60 kuralı yanlış ürün seçebilir ("Üçgen" ↔ "Beyaz" peynir); bu yüzden tüm kelimeler şarttır.
 */
export const pickMarketfiyatiProduct = (content, query) => {
  const list = Array.isArray(content) ? content.filter((item) => item && typeof item === "object") : [];
  const depotsOf = (item) => (Array.isArray(item.productDepotInfoList) ? item.productDepotInfoList.length : 0);
  const ours = nameTokens(query);
  if (!ours.length) return null;
  let best = null;
  const consider = (item, match, score) => {
    if (!best || score > best.score) best = { item, score, match };
  };
  if (parseSize(query)?.amount) {
    for (const item of list) {
      const title = productTitle(item);
      const match = matchProduct(query, title);
      if (!match.ok) continue;
      const theirs = new Set(nameTokens(title));
      const complete = ours.every((word) => theirs.has(word));
      consider(item, match, (match.confidence === "high" ? 4 : 2) + (complete ? 1 : 0) + Math.min(0.9, depotsOf(item) / 100));
    }
    return best ? { product: best.item, match: best.match } : null;
  }
  const brand = ours[0];
  const loose = { ok: true, confidence: "low", reason: "ürün adında gramaj yok" };
  for (const item of list) {
    const theirs = nameTokens(productTitle(item));
    const set = new Set(theirs);
    if (!set.has(brand)) continue;
    if (!ours.every((word) => set.has(word))) continue;
    // Tüm kelimeler var: fazladan kelimesi az olan (ada en yakın başlık) önde, eşitse çok şubeli
    const extra = theirs.filter((word) => !ours.includes(word)).length;
    consider(item, loose, 4 + Math.max(0, 1 - extra / 10) + Math.min(0.09, depotsOf(item) / 1000));
=======
/** Aramadan bizim ürüne en uygun kaydı seçer: eşleşme puanı (gramaj tuttu > tutmadı), eşitse daha çok şubesi olan */
export const pickMarketfiyatiProduct = (content, query) => {
  const list = Array.isArray(content) ? content.filter((item) => item && typeof item === "object") : [];
  let best = null;
  for (const item of list) {
    const match = matchProduct(query, productTitle(item));
    if (!match.ok) continue;
    const depots = Array.isArray(item.productDepotInfoList) ? item.productDepotInfoList.length : 0;
    const score = (match.confidence === "high" ? 2 : 1) + Math.min(0.9, depots / 100);
    if (!best || score > best.score) best = { item, score, match };
>>>>>>> origin/main
  }
  return best ? { product: best.item, match: best.match } : null;
};

/**
 * Seçilen ürünün şube fiyatlarını zincir bazında tekliflere çevirir.
<<<<<<< HEAD
 * Elenir (rejected): izin verilmeyen market, maxAgeDays'ten eski fiyat, geçersiz fiyat. Mesafe tek başına eleme nedeni değildir:
 * zincir fiyatları ülke genelinde çoğunlukla aynıdır. Her zincir için önce distanceKm içindeki şubeler; hiç yoksa en yakın
 * şubeler kullanılır (koordinatsız şube yakın sayılır) ve teklif notuna "Yakın şube yok; <şube> fiyatı" yazılır;
 * böyle bir zincirde şube fiyatları birbirinden %3'ten fazla ayrışıyorsa güven "low".
=======
 * Elenir: izin verilmeyen market, mesafe dışı şube, maxAgeDays'ten eski fiyat, geçersiz fiyat.
>>>>>>> origin/main
 * Her zincir için: son güncellenme günündeki şube fiyatlarının ortancası (readAt = en yeni indexTime).
 */
export const marketfiyatiOffers = (product, { location, distanceKm: maxKm, chains = DEFAULT_CHAINS, maxAgeDays = 14, now = new Date() } = {}) => {
  const rejected = [];
  const byChain = new Map();
  const title = String(product?.title || "").slice(0, 160);
  const pageUrl = `${MARKETFIYATI_SITE}/ara?q=${encodeURIComponent(product?.title || "")}`;
  const skipped = { chain: 0, far: 0, old: 0, price: 0 };
<<<<<<< HEAD
  const hasLocation = Boolean(location) && Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
=======
>>>>>>> origin/main
  for (const depot of Array.isArray(product?.productDepotInfoList) ? product.productDepotInfoList : []) {
    const chain = chainLabel(depot?.marketAdi, chains);
    if (!chain) {
      skipped.chain += 1;
      continue;
    }
<<<<<<< HEAD
=======
    if (location && maxKm && Number.isFinite(Number(depot.latitude)) && Number.isFinite(Number(depot.longitude))) {
      if (distanceKm(location.latitude, location.longitude, Number(depot.latitude), Number(depot.longitude)) > maxKm) {
        skipped.far += 1;
        continue;
      }
    }
>>>>>>> origin/main
    const readAt = parseIndexTime(depot.indexTime);
    if (!readAt || (now - readAt) / 86400000 > maxAgeDays) {
      skipped.old += 1;
      continue;
    }
    const price = Number(depot.price);
    if (!Number.isFinite(price) || price < 0.5 || price >= 100000) {
      skipped.price += 1;
      continue;
    }
<<<<<<< HEAD
    let distance = null;
    if (hasLocation && Number.isFinite(Number(depot.latitude)) && Number.isFinite(Number(depot.longitude))) {
      distance = Math.round(distanceKm(Number(location.latitude), Number(location.longitude), Number(depot.latitude), Number(depot.longitude)) * 10) / 10;
    }
    const near = distance === null || !maxKm || distance <= maxKm;
    if (!near) skipped.far += 1;
    const list = byChain.get(chain) || [];
    list.push({ price: Math.round(price * 100) / 100, readAt, depotName: String(depot.depotName || ""), distance, near });
    byChain.set(chain, list);
  }
  const offers = [];
  for (const [chain, all] of byChain) {
    const nearby = all.filter((item) => item.near);
    const list = nearby.length ? nearby : all;
    const latest = list.reduce((max, item) => (item.readAt > max ? item.readAt : max), list[0].readAt);
    // Aynı gün okunan şube fiyatları birlikte değerlendirilir; eski günlerin fiyatı kullanılmaz
    const sameDay = list.filter((item) => latest - item.readAt < 86400000);
    const prices = sameDay.map((item) => item.price);
    const nearest = sameDay.reduce((min, item) => (item.distance !== null && (min === null || item.distance < min.distance) ? item : min), null) || sameDay[0];
    const spread = Math.max(...prices) / Math.min(...prices) - 1;
    const offer = {
      price: median(prices),
=======
    const list = byChain.get(chain) || [];
    list.push({ price: Math.round(price * 100) / 100, readAt, depotName: String(depot.depotName || "") });
    byChain.set(chain, list);
  }
  const offers = [];
  for (const [chain, list] of byChain) {
    const latest = list.reduce((max, item) => (item.readAt > max ? item.readAt : max), list[0].readAt);
    // Aynı gün okunan şube fiyatları birlikte değerlendirilir; eski günlerin fiyatı kullanılmaz
    const sameDay = list.filter((item) => latest - item.readAt < 86400000);
    offers.push({
      price: median(sameDay.map((item) => item.price)),
>>>>>>> origin/main
      source: chain,
      pageUrl,
      title,
      readAt: latest,
      confidence: "high",
      note: sameDay.length > 1 ? `${sameDay.length} şube` : sameDay[0].depotName.slice(0, 60),
<<<<<<< HEAD
      distanceKm: nearest.distance,
      near: nearby.length > 0,
      depots: sameDay.length,
    };
    if (!nearby.length) {
      offer.note = `Yakın şube yok; ${nearest.depotName.slice(0, 60) || "en yakın şube"} fiyatı${sameDay.length > 1 ? ` (${sameDay.length} şube)` : ""}`;
      if (spread > FAR_PRICE_SPREAD) offer.confidence = "low";
    }
    offers.push(offer);
  }
  offers.sort((a, b) => a.price - b.price);
  if (skipped.old) rejected.push({ source: "Market Fiyatı", pageUrl, title, reason: `${skipped.old} şube fiyatı ${maxAgeDays} günden eski` });
  if (skipped.chain) rejected.push({ source: "Market Fiyatı", pageUrl, title, reason: `${skipped.chain} şube izin verilen zincirlerden değil` });
  if (skipped.price) rejected.push({ source: "Market Fiyatı", pageUrl, title, reason: `${skipped.price} şube fiyatı geçersiz` });
=======
    });
  }
  offers.sort((a, b) => a.price - b.price);
  if (skipped.old) rejected.push({ source: "Market Fiyatı", pageUrl, title, reason: `${skipped.old} şube fiyatı ${maxAgeDays} günden eski` });
  if (skipped.far) rejected.push({ source: "Market Fiyatı", pageUrl, title, reason: `${skipped.far} şube ${maxKm} km dışında` });
  if (skipped.chain) rejected.push({ source: "Market Fiyatı", pageUrl, title, reason: `${skipped.chain} şube izin verilen zincirlerden değil` });
>>>>>>> origin/main
  return { offers, rejected, skipped };
};

export const describeMarketfiyatiError = (error) => {
  const code = String(error?.message || "");
  const detail = error?.detail ? ` — sunucu yanıtı: "${error.detail}"` : "";
  if (code === "MARKETFIYATI_TIMEOUT") return "Market Fiyatı zamanında yanıt vermedi";
  if (code === "MARKETFIYATI_NETWORK") return `Market Fiyatı'na bağlanılamadı${error?.detail ? ` (${error.detail})` : ""}`;
  if (code === "MARKETFIYATI_BAD_JSON") return "Market Fiyatı beklenmeyen bir yanıt verdi (JSON değil)";
  if (code === "MARKETFIYATI_429") return `Market Fiyatı istek sınırı aşıldı (HTTP 429)${detail}`;
  if (code === "MARKETFIYATI_403") return `Market Fiyatı erişimi engelledi (HTTP 403)${detail}`;
  if (code === "MARKETFIYATI_401") return `Market Fiyatı isteği reddetti (HTTP 401)${detail}`;
  const http = /^MARKETFIYATI_(\d+)$/.exec(code);
  if (http) return `Market Fiyatı yanıt vermedi (HTTP ${http[1]})${detail}`;
  return code.slice(0, 120) || "Market Fiyatı hatası";
};

/** Bu hata ara vermeyi gerektirir mi? (istek sınırı, engel, sunucu hatası, zaman aşımı, ağ) */
export const shouldPause = (error) => {
  const code = String(error?.message || "");
  if (code === "MARKETFIYATI_TIMEOUT" || code === "MARKETFIYATI_NETWORK") return true;
  const status = Number(/^MARKETFIYATI_(\d+)$/.exec(code)?.[1]);
  return status === 429 || status === 403 || status === 401 || status >= 500;
};

/** Yeni ara süresi: 15 dk'dan başlar, her tekrarda iki katı, en çok 6 saat */
export const nextPauseMs = (previousMs) => Math.min(PAUSE_MAX_MS, Math.max(PAUSE_MIN_MS, (Number(previousMs) || 0) * 2));

<<<<<<< HEAD
/**
 * İlk arama hiç kayıt vermezse denenecek ikinci anahtar kelime: marka (ilk anlamlı kelime) atılır, kalan kelimeler ve gramaj
 * olduğu gibi kalır. "Sütaş Üçgen Peynir 8'li 100 g" → "Üçgen Peynir 8'li 100 g". Anlamlı bir fark yoksa null.
 */
export const alternativeKeywords = (query) => {
  const tokens = nameTokens(query);
  if (tokens.length < 2) return null;
  const words = String(query).replace(/\s+/g, " ").trim().split(" ");
  const index = words.findIndex((word) => nameTokens(word)[0] === tokens[0]);
  if (index < 0) return null;
  const alt = words.filter((_, i) => i !== index).join(" ").trim();
  return alt && nameTokens(alt).length ? alt : null;
};

=======
>>>>>>> origin/main
const empty = (note, extra = {}) => ({ offers: [], rejected: [], median: null, min: null, max: null, confidence: null, note, barcode: null, productId: null, matchedName: "", ...extra });

/**
 * Market Fiyatı'ndan güncel zincir market fiyatları (findCamgozPrices ile aynı biçim).
 * barcode varsa önce barkodla aranır (sonuç yoksa / barkod türü desteklenmiyorsa isimle aranır).
 * Yakın şubelerde ürün yoksa bir kez daha FALLBACK_DISTANCE_KM ile denenir; yine hiç kayıt yoksa /api/v2/nearest ile
<<<<<<< HEAD
 * şube kimlikleri alınıp (6 saat önbellek) aynı arama bir kez de depots ile yinelenir; hâlâ hiç kayıt yoksa marka/dolgu
 * kelimeleri atılmış ikinci anahtar kelimeyle (alternativeKeywords) en çok bir arama daha yapılır.
 * Mesafe eleme nedeni değildir (marketfiyatiOffers): uzak şube fiyatı kullanılan zincir teklif notunda belirtilir.
=======
 * şube kimlikleri alınıp (6 saat önbellek) aynı arama bir kez de depots ile yinelenir.
>>>>>>> origin/main
 * Dönen: { offers, rejected, median, min, max, confidence, note, barcode, productId, matchedName, requests }
 */
export const findMarketfiyatiPrices = async (query, {
  barcode = null,
  trustedBarcode = false,
  settings = marketfiyatiSettings(),
  location = { latitude: settings.latitude, longitude: settings.longitude },
  distanceKm: radius = settings.distanceKm,
  fetchImpl = fetch,
  limiter = rateLimiter,
  now = new Date(),
  useCache = true,
} = {}) => {
  const key = cacheKey([String(query).trim().toLocaleLowerCase("tr-TR"), barcode || "", location.latitude, location.longitude, radius]);
  const cached = useCache ? readCache(key, now.getTime()) : null;
  if (cached) return { ...cached, cached: true };

  const http = { fetchImpl, timeoutMs: settings.timeoutMs };
  let requests = 0;
  const call = async (fn) => {
    await limiter.acquire(settings.minIntervalMs);
    requests += 1;
    return fn();
  };
  const place = (distance) => ({ latitude: location.latitude, longitude: location.longitude, distance });

  let product = null;
  let match = null;
  let viaBarcode = false;
  let usedRadius = radius;
  if (barcode) {
    let body = null;
    try {
      body = await call(() => marketfiyatiSearchByBarcode(barcode, { ...place(radius), keywords: query, ...http }));
    } catch (error) {
      // Barkod türü desteklenmiyorsa (400/404/422) isimle devam edilir; sınır/engel/sunucu hatası dışarı atılır
      if (shouldPause(error) || ![400, 404, 405, 422].includes(error.status)) throw error;
    }
    const content = Array.isArray(body?.content) ? body.content : [];
    if (content.length) {
      // Barkodla gelen tek kayıt güvenilir; birden çok kayıt gelirse ada en uygun olan
      const picked = pickMarketfiyatiProduct(content, query);
      product = picked?.product || (trustedBarcode || content.length === 1 ? content[0] : null);
      match = picked?.match || (product ? { ok: true, confidence: trustedBarcode ? "high" : "low", reason: "ürün adıyla doğrulanamadı" } : null);
      viaBarcode = Boolean(product);
    }
  }
  if (!product) {
    let body = await call(() => marketfiyatiSearch(query, { ...place(radius), ...http }));
    let picked = pickMarketfiyatiProduct(body?.content, query);
    if (!picked && !(Array.isArray(body?.content) && body.content.length) && radius < FALLBACK_DISTANCE_KM) {
      usedRadius = FALLBACK_DISTANCE_KM;
      body = await call(() => marketfiyatiSearch(query, { ...place(FALLBACK_DISTANCE_KM), ...http }));
      picked = pickMarketfiyatiProduct(body?.content, query);
    }
    // Hiç kayıt gelmediyse: yakın şube listesi alınır (6 saat önbellek) ve aynı arama bir kez de şube kimlikleriyle yinelenir
    // (platformun kendi istemcileri aramaya her zaman depots gönderir; şubesiz arama bazen boş döner)
    let depotNote = "";
    if (!picked && !(Array.isArray(body?.content) && body.content.length)) {
      const nearestKey = cacheKey([location.latitude, location.longitude, usedRadius]);
      let depots = readCache(nearestKey, now.getTime(), nearestCache);
      if (!depots) {
        try {
          depots = parseNearestDepots(await call(() => marketfiyatiNearest({ ...place(usedRadius), ...http })));
          writeCache(nearestKey, depots, now.getTime(), nearestCache);
        } catch (error) {
          if (shouldPause(error)) throw error; // sınır/engel/sunucu hatası: ara verme kuralı işlesin
          depotNote = `Yakın şube listesi alınamadı (${describeMarketfiyatiError(error)}).`;
        }
      }
      if (depots?.length) {
        body = await call(() => marketfiyatiSearch(query, { ...place(usedRadius), depots, ...http }));
        picked = pickMarketfiyatiProduct(body?.content, query);
        if (!picked && !(Array.isArray(body?.content) && body.content.length)) depotNote = "Yakın şubelerde de bulunamadı.";
      } else if (depots) {
        depotNote = "Konum çevresinde kayıtlı şube bulunamadı.";
      }
    }
<<<<<<< HEAD
    // Hâlâ hiç kayıt yoksa: marka ve dolgu kelimeleri atılmış ikinci anahtar kelimeyle bir kez daha (sınırlayıcıdan geçer)
    if (!picked && !(Array.isArray(body?.content) && body.content.length)) {
      const alt = alternativeKeywords(query);
      if (alt) {
        const depots = readCache(cacheKey([location.latitude, location.longitude, usedRadius]), now.getTime(), nearestCache);
        body = await call(() => marketfiyatiSearch(alt, { ...place(usedRadius), ...(depots?.length ? { depots } : {}), ...http }));
        picked = pickMarketfiyatiProduct(body?.content, query);
      }
    }
=======
>>>>>>> origin/main
    if (!picked) {
      const count = Array.isArray(body?.content) ? body.content.length : 0;
      const note = count ? "Market Fiyatı'nda bu ürünle eşleşen kayıt bulunamadı (benzer adlı ürünler gramaj/ad tutmadı)." : "Market Fiyatı'nda bu ürün bulunamadı.";
      const result = empty([note, depotNote].filter(Boolean).join(" "), { requests, barcode: barcode || null });
      if (useCache) writeCache(key, result, now.getTime());
      return result;
    }
    product = picked.product;
    match = picked.match;
  }

  const { offers, rejected } = marketfiyatiOffers(product, { location, distanceKm: usedRadius, chains: settings.chains, maxAgeDays: settings.maxAgeDays, now });
<<<<<<< HEAD
  const matchedName = String(product.title || "");
  const base = { rejected, requests, barcode: barcode || null, productId: String(product.id || "") || null, matchedName };
  if (!offers.length) {
    const result = { ...empty(rejected.length ? "Market Fiyatı'nda ürün var ama güncel şube fiyatı yok." : "Market Fiyatı'nda bu ürün için şube fiyatı yok."), ...base };
=======
  const base = { rejected, requests, barcode: barcode || null, productId: String(product.id || "") || null, matchedName: String(product.title || "") };
  if (!offers.length) {
    const result = { ...empty(rejected.length ? "Market Fiyatı'nda ürün var ama yakın şubelerde güncel fiyat yok." : "Market Fiyatı'nda bu ürün için şube fiyatı yok."), ...base };
>>>>>>> origin/main
    if (useCache) writeCache(key, result, now.getTime());
    return result;
  }
  const values = offers.map((offer) => offer.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const low = match.confidence !== "high" && !(viaBarcode && trustedBarcode);
<<<<<<< HEAD
  const notes = [];
  if (low) notes.push(match.reason === "ürün adında gramaj yok" ? `Ürün adında gramaj yok; eşleşen ürünü kontrol edin: ${matchedName.slice(0, 80)}` : `Eşleşmeden emin değil: ${match.reason}.`);
  if (max / min > 1.8) notes.push("Marketler arasında fiyat farkı çok büyük.");
  const far = offers.filter((offer) => offer.near === false);
  if (far.length) notes.push(`${far.map((offer) => offer.source).join(", ")} için ${usedRadius} km içinde şube yok; en yakın şubenin fiyatı kullanıldı.`);
  if (usedRadius !== radius) notes.push(`${radius} km içinde bulunamadı; ${usedRadius} km içindeki şubeler kullanıldı.`);
  const shaky = low || max / min > 1.8 || offers.some((offer) => offer.confidence === "low");
  const result = { ...base, offers, median: median(values), min, max, confidence: shaky ? "low" : "high", note: notes.join(" ") };
=======
  let note = low ? (match.reason === "ürün adında gramaj yok" ? "Ürün adında gramaj yok; eşleşen ürünü kontrol edin." : `Eşleşmeden emin değil: ${match.reason}.`) : "";
  if (max / min > 1.8) note = "Marketler arasında fiyat farkı çok büyük.";
  if (usedRadius !== radius) note = [note, `${radius} km içinde bulunamadı; ${usedRadius} km içindeki şubeler kullanıldı.`].filter(Boolean).join(" ");
  const result = { ...base, offers, median: median(values), min, max, confidence: low || max / min > 1.8 ? "low" : "high", note };
>>>>>>> origin/main
  if (useCache) writeCache(key, result, now.getTime());
  return result;
};
