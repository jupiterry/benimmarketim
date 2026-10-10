// Fotoğraftan ürün ekleme yardımcısı.
// 1) Gemini, yöneticinin çektiği fotoğraftan ürün adı ve kategori seçenekleri önerir.
// 2) Kendi sunucudaki ücretsiz SearXNG (ya da tanımlıysa Firecrawl), ürün adıyla Trendyol / Getir öncelikli görsel adayları bulur.
// 3) Seçilen görselin düz arka planı kaldırılır; kare, ortalanmış, şeffaf bir görsel hazırlanır.
// Bu dosya ürün kaydetmez; yalnızca seçenek üretir. Kaydı yönetici onaylar.

import dns from "node:dns/promises";
import net from "node:net";

// Mağazadaki kategoriler (CreateProductForm ile aynı; slug ürünün category alanına yazılır)
export const PRODUCT_CATEGORIES = [
  { slug: "kahve", name: "Benim Kahvem", hint: "kahve çekirdeği, filtre/türk kahvesi, hazır kahve" },
  { slug: "yiyecekler", name: "Yiyecekler", hint: "hazır yemek, konserve, sos, genel gıda" },
  { slug: "kahvalti", name: "Kahvaltılık Ürünler", hint: "reçel, bal, zeytin, peynir, krem çikolata, tahin" },
  { slug: "gida", name: "Temel Gıda", hint: "un, şeker, yağ, salça, tuz, pirinç" },
  { slug: "meyve-sebze", name: "Meyve & Sebze", hint: "taze meyve ve sebze" },
  { slug: "sut", name: "Süt & Süt Ürünleri", hint: "süt, yoğurt, ayran, kefir, tereyağı" },
  { slug: "bespara", name: "Beş Para Etmeyen Ürünler", hint: "çok ucuz, ekonomik ürünler" },
  { slug: "tozicecekler", name: "Toz İçecekler", hint: "toz içecek, sıcak çikolata, 3'ü 1 arada" },
  { slug: "cips", name: "Cips & Çerez", hint: "cips, kuruyemiş, çekirdek, mısır cipsi" },
  { slug: "cayseker", name: "Çay ve Şekerler", hint: "çay, bitki çayı, şeker, kesme şeker" },
  { slug: "atistirma", name: "Atıştırmalıklar", hint: "çikolata, gofret, bisküvi, kek, şekerleme" },
  { slug: "temizlik", name: "Temizlik & Hijyen", hint: "deterjan, bulaşık, çamaşır, yüzey temizleyici, peçete" },
  { slug: "kisisel", name: "Kişisel Bakım", hint: "şampuan, diş macunu, sabun, deodorant, tıraş" },
  { slug: "makarna", name: "Makarna ve Kuru Bakliyat", hint: "makarna, mercimek, nohut, fasulye, bulgur, erişte" },
  { slug: "et", name: "Şarküteri & Et Ürünleri", hint: "sucuk, salam, sosis, et, tavuk" },
  { slug: "icecekler", name: "Buz Gibi İçecekler", hint: "gazlı içecek, meyve suyu, su, soda, enerji içeceği" },
  { slug: "dondurulmus", name: "Dondurulmuş Gıdalar", hint: "dondurulmuş patates, pizza, börek" },
  { slug: "baharat", name: "Baharatlar", hint: "pul biber, kimyon, karabiber, nane" },
  { slug: "dondurma", name: "Dondurmalar", hint: "dondurma" },
];
const CATEGORY_SLUGS = new Set(PRODUCT_CATEGORIES.map((category) => category.slug));

export const NAME_OPTION_COUNT = 3;
export const CATEGORY_OPTION_COUNT = 3;
export const IMAGE_OPTION_COUNT = 8;
const NAME_LIMIT = 90;

// ── 1. Fotoğraftan tanıma (Gemini) ─────────────────────────────────────

export const buildIdentifyPrompt = () => [
  "Sen Devrek'teki Benim Marketim için katalog asistanısın. Fotoğraftaki market ürününü tanı.",
  "Ambalajdaki yazıları dikkatle oku: marka, ürün adı, çeşit/aroma ve gramaj/hacim.",
  "",
  `Ürün adı için ${NAME_OPTION_COUNT} seçenek yaz. Biçim: "Marka Ürün Çeşit Gramaj" (ör. "Ülker Çikolatalı Gofret 36 g", "Coca-Cola Zero Sugar 1 L", "Filiz Burgu Makarna 500 g").`,
  "- Türkçe yazım kurallarına uy, her kelimenin baş harfi büyük olsun (gramaj birimi hariç: g, kg, ml, L).",
  "- Gramajı ambalajda görüyorsan mutlaka ekle; göremiyorsan uydurma, gramajsız yaz.",
  "- Seçenekler aynı ürünün farklı yazımları olsun (ör. çeşidin farklı söylenişi), farklı ürünler değil.",
  "- Okuyamadığın bilgiyi tahmin etme. Ürünü tanıyamıyorsan recognized=false döndür.",
  "",
  "Kategori için mağazanın kategorilerinden en uygun en fazla 3 tanesini, en uygun olan önce gelecek şekilde seç. Yalnızca şu slug değerlerini kullan:",
  ...PRODUCT_CATEGORIES.map((category) => `- ${category.slug}: ${category.name} (${category.hint})`),
  "",
  "searchQuery: bu ürünü internette aramak için kısa sorgu (marka + ürün + çeşit + gramaj).",
  "Sadece geçerli JSON döndür, başka hiçbir şey yazma:",
  '{"recognized":true,"names":["...","...","..."],"brand":"...","size":"...","categories":["...","..."],"searchQuery":"...","note":"emin olmadığın bir şey varsa kısa not, yoksa boş"}',
].join("\n");

const clean = (value, limit = 200) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "");

/** Model cevabını doğrular; bilinmeyen kategoriler ve boş/uzun adlar atılır. */
export const parseIdentification = (raw) => {
  const text = String(raw || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const names = [];
  for (const item of Array.isArray(data?.names) ? data.names : [data?.name]) {
    const name = clean(item, NAME_LIMIT + 1).replace(/^["“”']+|["“”']+$/g, "");
    if (!name || name.length > NAME_LIMIT) continue;
    if (names.some((existing) => existing.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) continue;
    names.push(name);
    if (names.length === NAME_OPTION_COUNT) break;
  }
  const categories = [];
  for (const slug of Array.isArray(data?.categories) ? data.categories : []) {
    const value = clean(slug, 40).toLowerCase();
    if (CATEGORY_SLUGS.has(value) && !categories.includes(value)) categories.push(value);
    if (categories.length === CATEGORY_OPTION_COUNT) break;
  }
  const recognized = data?.recognized !== false && names.length > 0;
  return {
    recognized,
    names,
    brand: clean(data?.brand, 60),
    size: clean(data?.size, 30),
    categories: categories.map((slug) => PRODUCT_CATEGORIES.find((category) => category.slug === slug)),
    searchQuery: clean(data?.searchQuery, 120) || names[0] || "",
    note: clean(data?.note, 200),
  };
};

const DEFAULT_TIMEOUT_MS = 30000;

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/** Fotoğrafı Gemini'ye gönderir. image: { mimeType, base64 } */
export const identifyProductPhoto = async ({ mimeType, base64 }, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_VISION_MODEL || "gemini-flash-latest",
} = {}) => {
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: buildIdentifyPrompt() }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 4096 },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const text = (body.candidates?.[0]?.content?.parts || []).filter((part) => part.text && !part.thought).map((part) => part.text).join("");
  const result = parseIdentification(text);
  if (!result) throw new Error("GEMINI_UNREADABLE");
  return result;
};

// ── 2. Görsel adayları (SearXNG / Firecrawl) ─────────────────────────────────────

const PREFERRED_SOURCES = [
  { pattern: /trendyol\.com|dsmcdn\.com/i, label: "Trendyol", rank: 0 },
  { pattern: /getir\.com/i, label: "Getir", rank: 0 },
  { pattern: /migros\.com\.tr|carrefoursa\.com|a101\.com\.tr|sokmarket\.com\.tr|hepsiburada\.com|cimri\.com/i, label: null, rank: 1 },
];

const sourceOf = (item) => {
  const haystack = `${item.url || ""} ${item.imageUrl || ""}`;
  const match = PREFERRED_SOURCES.find((source) => source.pattern.test(haystack));
  let host = "";
  try { host = new URL(item.url || item.imageUrl).hostname.replace(/^www\./, ""); } catch { /* yok */ }
  return { label: match?.label || host || "Web", rank: match ? match.rank : 2 };
};

/** Firecrawl görsel sonuçlarını birleştirir, eler ve sıralar. */
export const rankImageResults = (lists) => {
  const seen = new Set();
  const items = [];
  for (const item of lists.flat()) {
    const imageUrl = typeof item?.imageUrl === "string" ? item.imageUrl.trim() : "";
    if (!/^https?:\/\//i.test(imageUrl) || seen.has(imageUrl)) continue;
    if (/\.svg(\?|$)|\.gif(\?|$)|logo|sprite|placeholder/i.test(imageUrl)) continue;
    const width = Number(item.imageWidth) || 0;
    const height = Number(item.imageHeight) || 0;
    if ((width && width < 250) || (height && height < 250)) continue; // küçük görseller bulanık durur
    seen.add(imageUrl);
    const source = sourceOf(item);
    const ratio = width && height ? Math.max(width, height) / Math.min(width, height) : 1.5;
    items.push({
      imageUrl,
      pageUrl: typeof item.url === "string" ? item.url : "",
      title: clean(item.title, 140),
      width,
      height,
      source: source.label,
      score: source.rank * 10 + Math.min(ratio - 1, 3) + (width && width < 500 ? 1 : 0) + (Number(item.position) || 0) / 100,
    });
  }
  return items.sort((a, b) => a.score - b.score).slice(0, IMAGE_OPTION_COUNT).map(({ score, ...rest }) => rest);
};

// "1000 x 1000" → { width, height }
const parseResolution = (value) => {
  const match = String(value || "").match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 };
};

/** SearXNG görsel sonuçlarını ortak biçime çevirir. */
export const normalizeSearxngImages = (body) =>
  (Array.isArray(body?.results) ? body.results : [])
    .filter((item) => item?.img_src)
    .map((item, index) => {
      const { width, height } = parseResolution(item.resolution);
      return { imageUrl: String(item.img_src).replace(/^\/\//, "https://"), url: item.url || "", title: item.title || "", imageWidth: width, imageHeight: height, position: index + 1 };
    });

// Ücretsiz, kendi sunucunuzda çalışan açık kaynak arama motoru (bkz. ops/searxng/KURULUM.md)
const searchSearxng = async (q, baseUrl) => {
  const url = new URL("/search", baseUrl);
  url.search = new URLSearchParams({ q, categories: "images", format: "json", language: "tr", safesearch: "1" }).toString();
  const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 20000);
  if (!response.ok) throw new Error(`SEARXNG_${response.status}`);
  return normalizeSearxngImages(await response.json().catch(() => ({})));
};

// İsteğe bağlı ücretli yedek: yalnızca FIRECRAWL_API_KEY tanımlıysa kullanılır
const searchFirecrawl = async (q, apiKey) => {
  const response = await fetchWithTimeout("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: q, sources: ["images"], limit: 10, location: "Turkey" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`FIRECRAWL_${response.status}`);
  return body?.data?.images || [];
};

/** Ürün adıyla Trendyol ve Getir öncelikli görsel arar. Önce ücretsiz SearXNG, tanımlıysa Firecrawl. */
export const searchProductImages = async (query, {
  searxngUrl = process.env.SEARXNG_URL,
  firecrawlKey = process.env.FIRECRAWL_API_KEY,
  provider = process.env.IMAGE_SEARCH_PROVIDER || "searxng",
} = {}) => {
  // Firecrawl ücret doğurabileceğinden açıkça seçilmedikçe hiçbir zaman kullanılmaz.
  const search = provider === "firecrawl"
    ? (firecrawlKey ? (q) => searchFirecrawl(q, firecrawlKey) : null)
    : (searxngUrl ? (q) => searchSearxng(q, searxngUrl) : null);
  if (!search) throw new Error(provider === "firecrawl" ? "FIRECRAWL_API_KEY_MISSING" : "IMAGE_SEARCH_NOT_CONFIGURED");
  // İki arama paralel yapılır; biri başarısız olsa da diğerinin sonuçları kullanılır.
  const settled = await Promise.allSettled([search(`${query} trendyol`), search(`${query} getir`)]);
  const lists = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  if (!lists.length) throw settled[0].reason;
  return rankImageResults(lists);
};

// ── 3. Görseli indir ve arka planı kaldır ──────────────────────────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const isPrivateAddress = (address) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const value = address.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
};

/** Yalnızca internetteki herkese açık adreslerden görsel indirir (sunucunun iç ağına istek atılmaz). */
export const downloadImage = async (rawUrl) => {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("IMAGE_URL_INVALID"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("IMAGE_URL_INVALID");
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("IMAGE_URL_INVALID");
  const response = await fetchWithTimeout(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BenimMarketimKatalog/1.0)", Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
  }, 20000);
  if (!response.ok) throw new Error(`IMAGE_HTTP_${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("IMAGE_NOT_IMAGE");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  return buffer;
};

const loadSharp = async () => {
  try {
    return (await import("sharp")).default;
  } catch {
    throw new Error("SHARP_MISSING");
  }
};

const OUTPUT_SIZE = 800;
const PADDING_RATIO = 0.06;

/**
 * Düz (çoğunlukla beyaz) arka planı kenarlardan başlayarak kaldırır.
 * Yalnızca kenarlara bağlı arka plan silinir; ürünün içindeki beyaz alanlar korunur.
 * Dönen: { buffer (webp), backgroundRemoved, reason }
 */
export const makeTransparentProductImage = async (input, { tolerance = 26 } = {}) => {
  const sharp = await loadSharp();
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = width * height;
  const at = (i) => i * 4;

  // Kenar pikselleri: zaten şeffaf mı, değilse arka plan rengi düz mü?
  const border = [];
  for (let x = 0; x < width; x += 1) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y += 1) border.push(y * width, y * width + width - 1);
  const transparentBorder = border.filter((i) => data[at(i) + 3] < 200).length / border.length;

  let backgroundRemoved = false;
  let reason = "";
  if (transparentBorder > 0.6) {
    backgroundRemoved = true;
    reason = "already-transparent";
  } else {
    // Arka plan rengi: kenar piksellerinin kanal başına ortancası
    const median = (channel) => {
      const values = border.map((i) => data[at(i) + channel]).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    };
    const bg = [median(0), median(1), median(2)];
    const distance = (i) => Math.max(Math.abs(data[at(i)] - bg[0]), Math.abs(data[at(i) + 1] - bg[1]), Math.abs(data[at(i) + 2] - bg[2]));
    const uniform = border.filter((i) => distance(i) <= tolerance).length / border.length;
    if (uniform < 0.8) {
      reason = "busy-background"; // Fotoğraf gibi karışık zemin: dokunulmaz, yönetici görür
    } else {
      const isBackground = new Uint8Array(pixels);
      const queue = new Int32Array(pixels);
      let head = 0;
      let tail = 0;
      for (const i of border) {
        if (!isBackground[i] && distance(i) <= tolerance) { isBackground[i] = 1; queue[tail++] = i; }
      }
      while (head < tail) {
        const i = queue[head++];
        const x = i % width;
        const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
        for (const n of neighbours) {
          if (n < 0 || n >= pixels || isBackground[n]) continue;
          if (distance(n) <= tolerance) { isBackground[n] = 1; queue[tail++] = n; }
        }
      }
      const removedShare = tail / pixels;
      if (removedShare > 0.97) {
        reason = "nothing-left"; // Neredeyse her şey silinecekti; ürün arka planla aynı renkte
      } else {
        for (let i = 0; i < pixels; i += 1) if (isBackground[i]) data[at(i) + 3] = 0;
        // Kenar yumuşatma: arka plana komşu, rengi arka plana yakın piksellere kısmi saydamlık
        for (let i = 0; i < pixels; i += 1) {
          if (isBackground[i]) continue;
          const x = i % width;
          const touches = (x > 0 && isBackground[i - 1]) || (x < width - 1 && isBackground[i + 1]) || (i >= width && isBackground[i - width]) || (i + width < pixels && isBackground[i + width]);
          if (!touches) continue;
          const d = distance(i);
          const alpha = Math.max(0, Math.min(1, (d - tolerance * 0.5) / (tolerance * 2.5)));
          data[at(i) + 3] = Math.round(data[at(i) + 3] * Math.max(alpha, 0.35));
        }
        backgroundRemoved = true;
      }
    }
  }

  // Şeffaf kenarları kırp, kare tuvalin ortasına yerleştir
  let image = sharp(data, { raw: { width, height, channels: 4 } });
  if (backgroundRemoved) {
    const trimmed = await image.png().toBuffer();
    image = sharp(trimmed).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 });
  } else {
    image = sharp(await image.png().toBuffer());
  }
  const inner = Math.round(OUTPUT_SIZE * (1 - PADDING_RATIO * 2));
  const fitted = await image.resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const buffer = await sharp({ create: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, gravity: "center" }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  return { buffer, backgroundRemoved, reason };
};

// ── Hata mesajları ─────────────────────────────────────────────────────

export const describeAssistFailure = (error) => {
  const code = String(error?.message || "");
  const status = Number(code.match(/_(\d{3})$/)?.[1]);
  if (code === "GEMINI_API_KEY_MISSING") return { status: 503, message: "Gemini anahtarı sunucuda tanımlı değil. Google AI Studio'dan ücretsiz bir anahtar alıp .env dosyasına GEMINI_API_KEY olarak ekleyin." };
  if (code === "IMAGE_SEARCH_NOT_CONFIGURED") return { status: 503, message: "Ücretsiz görsel arama ayarlı değil. Sunucuya SearXNG kurup .env dosyasına SEARXNG_URL ekleyin (ops/searxng/KURULUM.md)." };
  if (code.startsWith("SEARXNG_")) return { status: 502, message: `Görsel arama motoru (SearXNG) yanıt vermedi${status ? ` (HTTP ${status})` : ""}. Sunucuda çalıştığını ve JSON biçiminin açık olduğunu kontrol edin.` };
  if (code === "fetch failed" || error?.cause?.code === "ECONNREFUSED") return { status: 502, message: "Görsel arama motoruna bağlanılamadı. SearXNG'nin sunucuda çalıştığını kontrol edin." };
  if (code === "SHARP_MISSING") return { status: 503, message: "Görsel işleme kütüphanesi (sharp) sunucuda kurulu değil. Sunucuda npm install çalıştırın." };
  if (code === "GEMINI_UNREADABLE") return { status: 502, message: "Yapay zekâ fotoğrafı yorumlayamadı. Ürünün ön yüzünü daha net çekip tekrar deneyin." };
  if (code.startsWith("GEMINI_")) {
    if (status === 400) return { status: 502, message: `Gemini isteği reddetti (HTTP 400). GEMINI_VISION_MODEL değerini ve fotoğrafı kontrol edin.` };
    if (status === 401 || status === 403) return { status: 502, message: `Gemini anahtarı kabul edilmedi (HTTP ${status}).` };
    if (status === 404) return { status: 502, message: "Gemini modeli bulunamadı (HTTP 404). .env dosyasındaki GEMINI_VISION_MODEL değerini kontrol edin." };
    if (status === 429) return { status: 502, message: "Gemini ücretsiz kullanım limiti doldu (HTTP 429). Bir dakika sonra tekrar deneyin; günlük limit dolduysa yarın sıfırlanır." };
    return { status: 502, message: `Gemini şu anda yanıt vermiyor${status ? ` (HTTP ${status})` : ""}. Tekrar deneyin.` };
  }
  if (code.startsWith("FIRECRAWL_")) {
    if (status === 401 || status === 403) return { status: 502, message: `Firecrawl anahtarı kabul edilmedi (HTTP ${status}).` };
    if (status === 402) return { status: 502, message: "Firecrawl kredisi bitti (HTTP 402). Firecrawl hesabını kontrol edin." };
    if (status === 429) return { status: 502, message: "Firecrawl istek limiti doldu (HTTP 429). Biraz sonra tekrar deneyin." };
    return { status: 502, message: `Görsel araması yapılamadı${status ? ` (HTTP ${status})` : ""}. Tekrar deneyin.` };
  }
  if (code === "IMAGE_URL_INVALID") return { status: 400, message: "Görsel bağlantısı geçersiz veya erişilemez." };
  if (code === "IMAGE_NOT_IMAGE") return { status: 422, message: "Bu bağlantı bir görsel değil." };
  if (code === "IMAGE_TOO_LARGE") return { status: 422, message: "Görsel çok büyük (en fazla 10 MB)." };
  if (code.startsWith("IMAGE_HTTP_")) return { status: 502, message: `Görsel indirilemedi (HTTP ${status}). Başka bir görsel seçin.` };
  if (error?.name === "AbortError") return { status: 504, message: "İşlem zaman aşımına uğradı. Tekrar deneyin." };
  return { status: 500, message: "İşlem tamamlanamadı. Tekrar deneyin." };
};
