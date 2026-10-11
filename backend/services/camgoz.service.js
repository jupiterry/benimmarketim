// Camgöz (camgoz.net) ürün/barkod API'si — JoJ API üzerinden, X-JoJAPI-Key başlığıyla.
// Migros, A101, Şok, Hakmar gibi zincirlerin günlük güncellenen fiyatlarını barkod bazında verir.
// Kredi: dönen her ürün 1 kredi + her 10 market fiyatı için 1 kredi. Bu yüzden:
//   - barkod biliniyorsa barkodla aranır (~2 kredi),
//   - bilinmiyorsa bir kez isimle aranır (en çok 10 ürün döner, ~12 kredi) ve bulunan barkod saklanır.
import { matchProduct, normalizeText, parseSize } from "./marketPrice.service.js";

export const CAMGOZ_URL = "https://camgoz.jojapi.net/api/external/search";
export const NAME_SEARCH_CREDITS = 13; // isimle aramanın en kötü durum tahmini
export const BARCODE_SEARCH_CREDITS = 3;

// Varsayılan olarak yalnızca zincir marketler (küçük online dükkânların fiyatları çok dağınık)
export const DEFAULT_CHAINS = ["A101", "Migros", "Şok", "Carrefour", "Hakmar", "BİM", "File", "Macro Center", "Macrocenter", "Tarım Kredi", "Bizim Toptan", "Mopaş"];

const toInt = (value, fallback, min, max) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};

export const camgozSettings = (env = process.env) => ({
  apiKey: env.JOJAPI_API_KEY || "",
  enabled: Boolean(env.JOJAPI_API_KEY) && env.CAMGOZ_ENABLED !== "false",
  monthlyCredits: toInt(env.CAMGOZ_MONTHLY_CREDITS, 500, 0, 10000000),
  maxAgeDays: toInt(env.CAMGOZ_MAX_AGE_DAYS, 90, 1, 3650),
  chains: (env.CAMGOZ_MARKETS ? env.CAMGOZ_MARKETS.split(",") : DEFAULT_CHAINS).map((name) => name.trim()).filter(Boolean),
});

export const isBarcode = (value) => /^\d{8,14}$/.test(String(value ?? "").trim());

// "23-07-2026 15:04:44" (İstanbul saati) → Date
export const parseCamgozDate = (value) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Market adı izin verilen zincirlerden biri mi? Kelime başından eşleşir: "Şok Market" → "Şok", "CarrefourSA" → "Carrefour"
export const chainOf = (marketName, chains = DEFAULT_CHAINS) => {
  const name = ` ${normalizeText(marketName)}`;
  return chains.find((chain) => normalizeText(chain) && name.includes(` ${normalizeText(chain)}`)) || null;
};

// Ürünün gramajı: adda yoksa "Net Miktar (g/ml)" bilgisinden
const productTitle = (product) => {
  const name = String(product?.name || "");
  const net = product?.otherInfo?.["Net Miktar (g/ml)"];
  return parseSize(name) || !net ? name : `${name} ${net} g`;
};

/**
 * Arama sonuçlarından bizim ürünümüze en uygun olanı seçer (saf fonksiyon).
 * Barkodla arandıysa barkodu tutan ürün; isimle arandıysa eşleşme puanı en yüksek olan.
 */
export const pickCamgozProduct = (products, { query, barcode }) => {
  const list = Array.isArray(products) ? products.filter((product) => product && typeof product === "object") : [];
  if (barcode) return list.find((product) => String(product.barcode) === String(barcode)) || null;
  let best = null;
  for (const product of list) {
    const match = matchProduct(query, productTitle(product));
    if (!match.ok) continue;
    const score = (match.confidence === "high" ? 2 : 1) + (Array.isArray(product.markets) && product.markets.length ? 0.5 : 0);
    if (!best || score > best.score) best = { product, score };
  }
  return best?.product || null;
};

/**
 * Seçilen ürünün market fiyatlarını teklif listesine çevirir (saf fonksiyon).
 * Elenir: zincir olmayan market, stokta yok, eski fiyat (maxAgeDays), market kaydının adı bizim ürünle tutmuyorsa
 * (Camgöz'de bazen 4x36 g'lık paket 144 g'lık ürünün altına bağlanmış oluyor).
 */
export const camgozOffers = (product, { query, chains = DEFAULT_CHAINS, maxAgeDays = 90, now = new Date() }) => {
  const offers = [];
  const rejected = [];
  for (const item of Array.isArray(product?.markets) ? product.markets : []) {
    const chain = chainOf(item?.market, chains);
    if (!chain) continue;
    const base = { source: chain, pageUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "", title: String(item.name || "").slice(0, 160) };
    if (item.stockAvailable === false) {
      rejected.push({ ...base, reason: "stokta yok" });
      continue;
    }
    const modified = parseCamgozDate(item.priceModified);
    if (!modified || (now - modified) / 86400000 > maxAgeDays) {
      rejected.push({ ...base, reason: modified ? `fiyat ${Math.round((now - modified) / 86400000)} gündür güncellenmemiş` : "fiyat tarihi yok" });
      continue;
    }
    const match = matchProduct(query, item.name || product.name);
    if (!match.ok) {
      rejected.push({ ...base, reason: match.reason });
      continue;
    }
    const prices = [item.price, item.discountPrice].map(Number).filter((value) => Number.isFinite(value) && value >= 0.5 && value < 100000);
    if (!prices.length) continue;
    offers.push({ ...base, price: Math.min(...prices), readAt: modified, confidence: match.confidence, note: match.reason || "" });
  }
  // Aynı zincir birden çok kez gelirse en güncel kaydı tut
  const byChain = new Map();
  for (const offer of offers) {
    const current = byChain.get(offer.source);
    if (!current || offer.readAt > current.readAt) byChain.set(offer.source, offer);
  }
  return { offers: [...byChain.values()], rejected };
};

/** Tek API çağrısı. Kullanılan kredi X-Jojapi-Credits-Used başlığından okunur. */
export const camgozSearch = async (query, { apiKey, fetchImpl = fetch, timeoutMs = 20000 }) => {
  const url = new URL(CAMGOZ_URL);
  url.search = new URLSearchParams({ query, marketPrices: "true" }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "X-JoJAPI-Key": apiKey, Accept: "application/json" } });
    const credits = Number(response.headers?.get?.("x-jojapi-credits-used")) || 0;
    if (!response.ok) {
      const error = new Error(`CAMGOZ_${response.status}`);
      error.credits = credits;
      throw error;
    }
    const body = await response.json().catch(() => []);
    return { products: Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [], credits };
  } finally {
    clearTimeout(timer);
  }
};

export const describeCamgozError = (error) => {
  const code = String(error?.message || "");
  if (error?.name === "AbortError") return "Camgöz zamanında yanıt vermedi";
  if (code === "CAMGOZ_401" || code === "CAMGOZ_403") return "Camgöz API anahtarı geçersiz ya da bu API'ye erişimi yok (JOJAPI_API_KEY)";
  if (code === "CAMGOZ_402") return "Camgöz kredisi bitti";
  if (code === "CAMGOZ_429") return "Camgöz istek sınırı aşıldı";
  return code.startsWith("CAMGOZ_") ? `Camgöz yanıt vermedi (HTTP ${code.slice(7)})` : code.slice(0, 120) || "Camgöz hatası";
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
};

/**
 * Camgöz'den güncel zincir market fiyatları.
 * barcode: daha önce eşleşmiş barkod (varsa isimle aranmaz); trustedBarcode: barkodu yönetici yazdı.
 * Dönen: { offers, rejected, median, min, max, confidence, note, barcode, credits, matchedName }
 */
export const findCamgozPrices = async (query, { barcode, trustedBarcode = false, settings = camgozSettings(), search = camgozSearch, now = new Date() }) => {
  const code = barcode || (isBarcode(query) ? query.trim() : "");
  const { products, credits } = await search(code || query, { apiKey: settings.apiKey });
  const product = pickCamgozProduct(products, { query, barcode: code });
  if (!product) {
    return { offers: [], rejected: [], median: null, min: null, max: null, confidence: null, credits, barcode: code || null,
      note: code ? "Camgöz'de bu barkod bulunamadı." : "Camgöz'de bu ürünle eşleşen kayıt bulunamadı." };
  }
  // Market kayıtları Camgöz'deki ürünün kendi adıyla karşılaştırılır (yanlış bağlanmış paketleri elemek için)
  const { offers, rejected } = camgozOffers(product, { query: productTitle(product), chains: settings.chains, maxAgeDays: settings.maxAgeDays, now });
  // Bizim ürün adında gramaj yoksa (ve barkodu yönetici yazmadıysa) eşleşmeden emin olunamaz
  const trusted = trustedBarcode || isBarcode(query);
  const low = !trusted && matchProduct(query, productTitle(product)).confidence !== "high";
  const base = { rejected, credits, barcode: String(product.barcode || code || "") || null, matchedName: String(product.name || "") };
  if (!offers.length) {
    return { ...base, offers: [], median: null, min: null, max: null, confidence: null,
      note: rejected.length ? "Camgöz'de ürün var ama güncel zincir market fiyatı yok." : "Camgöz'de bu ürün için zincir market fiyatı yok." };
  }
  const values = offers.map((offer) => offer.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  let note = low ? "Ürün adında gramaj yok; eşleşen ürünü ve barkodu kontrol edin." : "";
  if (max / min > 1.8) note = "Marketler arasında fiyat farkı çok büyük.";
  return { ...base, offers, median: median(values), min, max, confidence: low || max / min > 1.8 ? "low" : "high", note };
};
