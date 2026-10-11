// Market ürün sayfasından GÜNCEL fiyat okuma (fiyat bekçisi için).
// Arama motoru yalnızca ürün sayfasının adresini bulmak için kullanılır; fiyat, sayfa o an açılarak okunur.
// Arama sonuç özetlerindeki (snippet) fiyatlar kullanılmaz: aylarca eski kalabiliyorlar.
//
// Yalnızca robots.txt'te ürün sayfalarına izin veren ve fiyatı sayfanın kendisinde gösteren siteler listededir.
// Migros ve A101 fiyatı sayfa açıldıktan sonra tarayıcıda yüklediği için okunamaz; BİM'in online satışı yoktur.
import { setTimeout as sleep } from "node:timers/promises";

export const MARKETS = [
  { id: "sok", label: "Şok", hosts: ["sokmarket.com.tr"], productPath: /-p-\d+\/?$/ },
  { id: "trendyol", label: "Trendyol", hosts: ["trendyol.com"], productPath: /-p-\d+\/?$/ },
  { id: "hepsiburada", label: "Hepsiburada", hosts: ["hepsiburada.com"], productPath: /-p(?:m)?-[a-z0-9]+\/?$/i },
];

const USER_AGENT = "Mozilla/5.0 (compatible; BenimMarketimFiyatBekcisi/1.0; +https://devrekbenimmarketim.com)";
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
export const MAX_PAGES_PER_PRODUCT = 3;

// ── Metin yardımcıları ─────────────────────────────────────────────

export const normalizeText = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const UNIT_WORDS = new Set(["g", "gr", "gram", "kg", "ml", "l", "lt", "litre", "cl", "li", "lu", "adet", "x", "paket"]);
const STOP_WORDS = new Set(["ve", "ile", "fiyat", "fiyati", "urun", "orijinal", "yeni"]);

/** Ürün adındaki anlamlı kelimeler (gramaj, sayı ve birimler hariç) */
export const nameTokens = (value) =>
  normalizeText(value)
    .split(" ")
    .filter((word) => word.length > 1 && !/^\d/.test(word) && !UNIT_WORDS.has(word) && !STOP_WORDS.has(word));

const toNumber = (raw) => Number(String(raw).replace(",", "."));

/**
 * Gramaj / hacim / adet: "Eti Sütlü 65 g" → { amount: 65, unit: "g", count: 1 }
 * "Su 1,5 L" → { amount: 1500, unit: "ml", count: 1 }, "Ayran 6x200 ml" → { amount: 200, unit: "ml", count: 6 },
 * "Mendil 10'lu" → { amount: null, unit: null, count: 10 }. Bulunamazsa null.
 */
export const parseSize = (text) => {
  const value = String(text ?? "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
  let amount = null;
  let unit = null;
  let count = 1;
  const multi = /(\d{1,3})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g|ml|cl|lt|litre|l)\b/.exec(value);
  const single = multi ? null : /(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g|ml|cl|lt|litre|l)\b/.exec(value);
  const match = multi ? [null, multi[2], multi[3]] : single;
  if (multi) count = Number(multi[1]);
  if (match) {
    const number = toNumber(match[1]);
    const raw = match[2];
    if (raw === "kg") [amount, unit] = [number * 1000, "g"];
    else if (["g", "gr", "gram"].includes(raw)) [amount, unit] = [number, "g"];
    else if (raw === "ml") [amount, unit] = [number, "ml"];
    else if (raw === "cl") [amount, unit] = [number * 10, "ml"];
    else [amount, unit] = [number * 1000, "ml"];
    amount = Math.round(amount * 10) / 10;
  }
  const pack = /(\d{1,3})\s*['’]?\s*(?:li|lu|lü|lı|adet)\b/.exec(value);
  if (!multi && pack) count = Number(pack[1]);
  if (amount === null && count === 1) return null;
  return { amount, unit, count };
};

/**
 * Sayfadaki ürün bizim ürünümüz mü?
 * - Markası (ilk kelime) ve anlamlı kelimelerin en az %60'ı başlıkta geçmeli.
 * - İki tarafta da gramaj varsa aynı olmalı (±%5), paket adedi aynı olmalı.
 * Dönen confidence: "high" (gramaj eşleşti) / "low" (gramaj bir tarafta yok).
 */
export const matchProduct = (ourName, title) => {
  const ours = nameTokens(ourName);
  const theirs = new Set(nameTokens(title));
  if (!ours.length || !theirs.size) return { ok: false, reason: "ad boş" };
  if (!theirs.has(ours[0])) return { ok: false, reason: "marka tutmuyor" };
  const considered = ours.slice(0, 6);
  const hits = considered.filter((word) => theirs.has(word)).length;
  if (hits / considered.length < 0.6) return { ok: false, reason: "ad tutmuyor" };

  const ourSize = parseSize(ourName);
  const theirSize = parseSize(title);
  if ((ourSize?.count || 1) !== (theirSize?.count || 1)) return { ok: false, reason: "paket adedi farklı" };
  if (ourSize?.amount && theirSize?.amount) {
    if (ourSize.unit !== theirSize.unit) return { ok: false, reason: "birim farklı" };
    if (Math.abs(ourSize.amount - theirSize.amount) / ourSize.amount > 0.05) return { ok: false, reason: "gramaj farklı" };
    return { ok: true, confidence: "high" };
  }
  return { ok: true, confidence: "low", reason: ourSize?.amount ? "sayfada gramaj yok" : "ürün adında gramaj yok" };
};

// ── Sayfadan fiyat okuma ───────────────────────────────────────────

const decodeEntities = (value) =>
  String(value ?? "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const stripTags = (html) => decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const validPrice = (value) => {
  const number = typeof value === "number" ? value : parseLoosePrice(value);
  return Number.isFinite(number) && number >= 0.5 && number < 100000 ? Math.round(number * 100) / 100 : null;
};

// "63.60" / "63,60" / "1.249,90" / "1,249.90" → sayı
export const parseLoosePrice = (raw) => {
  let text = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!text) return NaN;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma !== -1) text = text.replace(/,/g, "");
  else if (lastComma === -1 && /^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  return Number(text);
};

const findProductNode = (node, depth = 0) => {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const type = [].concat(node["@type"] || []).map(String);
  if (type.includes("Product") && node.offers) return node;
  return findProductNode(node["@graph"], depth + 1);
};

const offerPrice = (offers) => {
  for (const offer of [].concat(offers || [])) {
    const availability = String(offer?.availability || "");
    if (/OutOfStock|Discontinued/i.test(availability)) continue;
    const price = validPrice(offer?.price ?? offer?.lowPrice);
    if (price) return price;
  }
  return null;
};

const metaContent = (html, pattern) => {
  const tag = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["'](?:${pattern})["'][^>]*>`, "i").exec(html)?.[0];
  return tag ? decodeEntities(/content=["']([^"']*)["']/i.exec(tag)?.[1] || "") : "";
};

const PRICE_TEXT = /(?:₺\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?))|(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:₺|TL)/g;

/**
 * Ürün sayfasının HTML'inden { name, price, method } çıkarır; bulunamazsa null.
 * Sıra: JSON-LD Product.offers → fiyat meta etiketleri → başlığın (h1) hemen ardındaki fiyat.
 * Başlığın ardında indirimli/eski iki fiyat yan yanaysa düşük olan (satış fiyatı) alınır.
 */
export const extractPagePrice = (html) => {
  const page = String(html ?? "");
  for (const match of page.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const product = findProductNode(data);
    const price = product && offerPrice(product.offers);
    if (price) return { name: stripTags(product.name), price, method: "json-ld" };
  }

  const title = stripTags(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(page)?.[1] || "") ||
    metaContent(page, "og:title") ||
    stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page)?.[1] || "").replace(/\s+[-|–].*$/, "");

  const metaPrice = validPrice(metaContent(page, "product:price:amount|og:price:amount|price"));
  if (metaPrice) return { name: title, price: metaPrice, method: "meta" };

  const h1 = /<h1[^>]*>[\s\S]*?<\/h1>/i.exec(page);
  if (!h1) return null;
  const after = stripTags(page.slice(h1.index + h1[0].length).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")).slice(0, 400);
  const prices = [];
  for (const match of after.matchAll(PRICE_TEXT)) {
    const price = validPrice(match[1] || match[2]);
    if (price) prices.push({ price, at: match.index, end: match.index + match[0].length });
    if (prices.length === 2) break;
  }
  if (!prices.length) return null;
  // İkinci fiyat ilkinin hemen yanındaysa (arada kelime yoksa) eski/indirimli fiyat çiftidir
  const near = prices.length === 2 && /^[\s%\-–]*$/.test(after.slice(prices[0].end, prices[1].at).replace(/indirim|%\s*\d+/gi, ""));
  return { name: title, price: near ? Math.min(prices[0].price, prices[1].price) : prices[0].price, method: "text" };
};

// ── Adres seçimi ve sayfa indirme ──────────────────────────────────

export const marketOf = (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  const market = MARKETS.find((item) => item.hosts.includes(host));
  if (!market || !market.productPath.test(url.pathname) || url.search.length > 120) return null;
  return market;
};

/** Arama sonuçlarından her marketin en uygun ürün sayfası (en çok MAX_PAGES_PER_PRODUCT adres) */
export const pickProductPages = (results, ourName) => {
  const byMarket = new Map();
  const ours = nameTokens(ourName);
  for (const item of results || []) {
    const market = marketOf(item?.url);
    if (!market || byMarket.has(market.id)) continue;
    // Arama sonucu başlığı varsa kaba bir ön eleme (asıl kontrol sayfa açılınca yapılır)
    const title = nameTokens(`${item.title || ""} ${decodeURIComponent(new URL(item.url).pathname).replace(/[-/]/g, " ")}`);
    if (ours.length && !title.includes(ours[0])) continue;
    byMarket.set(market.id, { url: item.url.split("#")[0], market });
  }
  return [...byMarket.values()].slice(0, MAX_PAGES_PER_PRODUCT);
};

const hostAllowed = (rawUrl) => {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "");
    return MARKETS.some((market) => market.hosts.includes(host));
  } catch {
    return false;
  }
};

export const fetchProductPage = async (rawUrl, { fetchImpl = fetch, timeoutMs = 15000 } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(rawUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "tr-TR,tr;q=0.9" },
    });
    // Yönlendirme başka bir siteye gidiyorsa okunmaz
    if (response.url && !hostAllowed(response.url)) throw new Error("PAGE_REDIRECTED");
    if (!response.ok) throw new Error(`PAGE_${response.status}`);
    const html = await response.text();
    return html.length > MAX_PAGE_BYTES ? html.slice(0, MAX_PAGE_BYTES) : html;
  } finally {
    clearTimeout(timer);
  }
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
};

/**
 * Ürünün güncel market fiyatlarını bulur.
 * search(q) → [{ url, title, content }] (SearXNG); fetchPage(url) → html.
 * En çok 2 arama, en çok 3 sayfa; sayfalar arasında birkaç saniye beklenir.
 */
export const findMarketPrices = async (query, { search, fetchPage = fetchProductPage, pause = () => sleep(3000 + Math.random() * 3000), now = new Date() }) => {
  const sites = MARKETS.flatMap((market) => market.hosts.map((host) => `site:${host}`)).join(" OR ");
  let pages = pickProductPages(await search(`${query} ${sites}`), query);
  if (!pages.length) pages = pickProductPages(await search(`${query} fiyat`), query);

  const offers = [];
  const rejected = [];
  let failures = 0;
  for (const [index, { url, market }] of pages.entries()) {
    if (index > 0) await pause();
    try {
      const found = extractPagePrice(await fetchPage(url));
      if (!found) {
        rejected.push({ source: market.label, pageUrl: url, reason: "fiyat okunamadı" });
        continue;
      }
      const match = matchProduct(query, found.name);
      if (!match.ok) {
        rejected.push({ source: market.label, pageUrl: url, title: found.name, reason: match.reason });
        continue;
      }
      offers.push({ price: found.price, source: market.label, pageUrl: url, title: found.name.slice(0, 160), readAt: now, confidence: match.confidence, note: match.reason || "" });
    } catch (error) {
      failures += 1;
      rejected.push({ source: market.label, pageUrl: url, reason: String(error?.name === "AbortError" ? "zaman aşımı" : error?.message || error).slice(0, 80) });
    }
  }

  if (!offers.length) {
    const note = !pages.length ? "Desteklenen marketlerde ürün sayfası bulunamadı." : failures === pages.length ? "Market sayfaları açılamadı." : "Bulunan sayfalar bu ürünle eşleşmedi.";
    return { offers: [], rejected, median: null, min: null, max: null, confidence: null, note };
  }
  const values = offers.map((offer) => offer.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const low = offers.some((offer) => offer.confidence === "low");
  const reason = low ? offers.find((offer) => offer.note)?.note || "" : "";
  let note = reason && reason.charAt(0).toLocaleUpperCase("tr-TR") + reason.slice(1);
  if (max / min > 1.8) note = "Kaynaklar arasında fiyat farkı çok büyük.";
  return { offers, rejected, median: median(values), min, max, confidence: low || max / min > 1.8 ? "low" : "high", note };
};
