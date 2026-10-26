// Camgöz (camgoz.net) ürün/barkod API'si — JoJ API üzerinden, X-JoJAPI-Key başlığıyla.
// Migros, A101, Şok, Hakmar gibi zincirlerin günlük güncellenen fiyatlarını barkod bazında verir.
// Kredi: dönen her ürün 1 kredi + her 10 market fiyatı için 1 kredi. Bu yüzden:
//   - barkod biliniyorsa barkodla aranır (~2 kredi),
//   - bilinmiyorsa bir kez isimle aranır (en çok 10 ürün döner, ~12 kredi) ve bulunan barkod saklanır.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { matchProduct, normalizeText, parseSize } from "./marketPrice.service.js";

export const CAMGOZ_URL = "https://camgoz.jojapi.net/api/external/search";
export const CAMGOZ_TEST_URL = "https://camgoz.jojapi.net/api/external/last"; // ücretsiz uç: anahtar denemesi kredi harcamaz
export const NAME_SEARCH_CREDITS = 13; // isimle aramanın en kötü durum tahmini
export const BARCODE_SEARCH_CREDITS = 3;

// Varsayılan olarak yalnızca zincir marketler (küçük online dükkânların fiyatları çok dağınık)
export const DEFAULT_CHAINS = ["A101", "Migros", "Şok", "Carrefour", "Hakmar", "BİM", "File", "Macro Center", "Macrocenter", "Tarım Kredi", "Bizim Toptan", "Mopaş"];

// .env'de tırnak, boşluk ya da Windows satır sonu kalmışsa temizlenir
export const cleanApiKey = (value) => String(value ?? "").trim().replace(/^["']|["']$/g, "").trim();

const toInt = (value, fallback, min, max) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};

export const camgozSettings = (env = process.env) => ({
  apiKey: cleanApiKey(env.JOJAPI_API_KEY),
  enabled: Boolean(cleanApiKey(env.JOJAPI_API_KEY)) && env.CAMGOZ_ENABLED !== "false",
  monthlyCredits: toInt(env.CAMGOZ_MONTHLY_CREDITS, 500, 0, 10000000),
  maxAgeDays: toInt(env.CAMGOZ_MAX_AGE_DAYS, 90, 1, 3650),
  chains: (env.CAMGOZ_MARKETS ? env.CAMGOZ_MARKETS.split(",") : DEFAULT_CHAINS).map((name) => name.trim()).filter(Boolean),
  // "even" (varsayılan): aylık kredi ay boyunca eşit dağıtılır; "none": kredi bitene kadar kullanılır
  pacing: env.CAMGOZ_PACING === "none" ? "none" : "even",
  source: cleanApiKey(env.JOJAPI_API_KEY) ? "env" : "none",
  last4: cleanApiKey(env.JOJAPI_API_KEY).slice(-4),
});

// ── Panelden girilen anahtar ──────────────────────────────────────
// Anahtar .env yerine veritabanında, ACCESS_TOKEN_SECRET'ten türetilen anahtarla AES-256-GCM şifreli saklanır.
// Panel anahtarı varsa .env'deki JOJAPI_API_KEY'in yerine geçer; silinince .env'e dönülür.
export const KEY_COLLECTION = "price_watch_state";
export const KEY_DOC_ID = "camgoz_key";

const deriveKey = (secret, salt) => scryptSync(String(secret), salt, 32);

export const encryptApiKey = (apiKey, secret) => {
  if (!secret) throw new Error("NO_SECRET");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  const data = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return { salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
};

export const decryptApiKey = (doc, secret) => {
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, Buffer.from(doc.salt, "base64")), Buffer.from(doc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(doc.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(doc.data, "base64")), decipher.final()]).toString("utf8");
};

export const validApiKeyFormat = (value) => /^[\x21-\x7e]{8,200}$/.test(value);

/** .env ayarları + (varsa) panelden girilen anahtar ve aylık kredi */
export const resolveCamgozSettings = async (db, env = process.env) => {
  const base = camgozSettings(env);
  const doc = await db.collection(KEY_COLLECTION).findOne({ _id: KEY_DOC_ID }).catch(() => null);
  if (!doc) return base;
  const settings = { ...base };
  if (Number.isFinite(doc.monthlyCredits)) settings.monthlyCredits = doc.monthlyCredits;
  if (doc.data) {
    try {
      const apiKey = decryptApiKey(doc, env.ACCESS_TOKEN_SECRET || "");
      Object.assign(settings, { apiKey, enabled: env.CAMGOZ_ENABLED !== "false", source: "panel", last4: apiKey.slice(-4), setAt: doc.setAt || null });
    } catch {
      // ACCESS_TOKEN_SECRET değiştiyse panel anahtarı çözülemez: .env'e dönülür, panelde uyarı gösterilir
      settings.keyError = "Panelden girilen anahtar çözülemedi (ACCESS_TOKEN_SECRET değişmiş olabilir); anahtarı yeniden girin.";
    }
  }
  return settings;
};

/** Anahtarı ücretsiz uçla dener (kredi harcamaz). { ok, status, detail } */
export const testCamgozKey = async (apiKey, { fetchImpl = fetch, timeoutMs = 15000 } = {}) => {
  const key = cleanApiKey(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(CAMGOZ_TEST_URL, { signal: controller.signal, headers: { "X-JoJAPI-Key": key, Accept: "application/json" } });
    const text = typeof response.text === "function" ? await response.text().catch(() => "") : "";
    return { ok: response.ok, status: response.status, detail: response.ok ? "" : gatewayMessage(text, key) };
  } finally {
    clearTimeout(timer);
  }
};

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

export const gatewayMessage = (text, key = "") => {
  let message;
  try {
    const body = JSON.parse(text);
    message = [body?.message, body?.error?.message || body?.error, body?.detail, body?.title, body?.code].find((item) => typeof item === "string" && item.trim()) || "";
  } catch {
    message = String(text || "").replace(/<[^>]+>/g, " ");
  }
  message = message.replace(/\s+/g, " ").trim();
  if (key && key.length > 4) message = message.split(key).join("•••");
  return message.slice(0, 200);
};

/** Tek API çağrısı. Kullanılan kredi X-Jojapi-Credits-Used başlığından okunur. */
export const camgozSearch = async (query, { apiKey, fetchImpl = fetch, timeoutMs = 20000 }) => {
  const url = new URL(CAMGOZ_URL);
  url.search = new URLSearchParams({ query, marketPrices: "true" }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const key = cleanApiKey(apiKey);
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "X-JoJAPI-Key": key, Accept: "application/json" } });
    const credits = Number(response.headers?.get?.("x-jojapi-credits-used")) || 0;
    if (!response.ok) {
      const error = new Error(`CAMGOZ_${response.status}`);
      error.credits = credits;
      // Ağ geçidinin açıklaması (abonelik yok, anahtar kapalı vb.) teşhis için saklanır; anahtar metinden çıkarılır
      const text = typeof response.text === "function" ? await response.text().catch(() => "") : "";
      error.detail = gatewayMessage(text, key);
      throw error;
    }
    const body = await response.json().catch(() => []);
    return { products: Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [], credits };
  } finally {
    clearTimeout(timer);
  }
};

export const describeCamgozError = (error) => {
  const base = describeCamgozCode(error);
  return error?.detail ? `${base} — sunucu yanıtı: "${error.detail}"` : base;
};

const describeCamgozCode = (error) => {
  const code = String(error?.message || "");
  if (error?.name === "AbortError") return "Camgöz zamanında yanıt vermedi";
  if (code === "CAMGOZ_401" || code === "CAMGOZ_403") return "Camgöz isteği yetkilendirilmedi: anahtar yanlış/kapalı ya da JoJ panelinde Product Barcode API'ye abone olunmamış (JOJAPI_API_KEY)";
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
