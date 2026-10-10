import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  MAX_BATCH_PRODUCTS,
  PRODUCT_CATEGORIES,
  buildBatchIdentifyPrompt,
  buildIdentifyPrompt,
  describeAssistFailure,
  identifyProductPhoto,
  identifyProductPhotos,
  parseBatchIdentification,
  extractPrices,
  parseTurkishPrice,
  rankPriceResults,
  searchProductPrices,
  makeTransparentProductImage,
  parseIdentification,
  normalizeSearxngImages,
  rankImageResults,
  searchProductImages,
} from "../services/productAssist.service.js";

test("identify prompt lists every store category slug", () => {
  const prompt = buildIdentifyPrompt();
  for (const { slug } of PRODUCT_CATEGORIES) assert.match(prompt, new RegExp(`- ${slug}:`));
  assert.match(prompt, /uydurma/);
});

test("photo identification defaults to Gemini Flash latest", async (t) => {
  let requestedUrl = "";
  t.mock.method(globalThis, "fetch", async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ recognized: true, names: ["Ülker Gofret"], categories: ["atistirma"] }) }] } }] }) };
  });
  await identifyProductPhoto({ mimeType: "image/jpeg", base64: "dGVzdA==" }, { apiKey: "test-key", model: "gemini-flash-latest" });
  assert.match(requestedUrl, /\/models\/gemini-flash-latest:generateContent$/);
});

test("identification keeps valid names and known categories only", () => {
  const raw = "```json\n" + JSON.stringify({
    recognized: true,
    names: ["Ülker Çikolatalı Gofret 36 g", "ülker çikolatalı gofret 36 g", "", "Ülker Gofret Çikolatalı 36 g", "x".repeat(91)],
    brand: "Ülker",
    size: "36 g",
    categories: ["atistirma", "uydurma-kategori", "ATISTIRMA", "cips"],
    searchQuery: "Ülker çikolatalı gofret 36 g",
  }) + "\n```";
  const result = parseIdentification(raw);
  assert.deepEqual(result.names, ["Ülker Çikolatalı Gofret 36 g", "Ülker Gofret Çikolatalı 36 g"]);
  assert.deepEqual(result.categories.map((category) => category.slug), ["atistirma", "cips"]);
  assert.equal(result.categories[0].name, "Atıştırmalıklar");
  assert.equal(result.recognized, true);
  assert.equal(parseIdentification("tanıyamadım"), null);
  assert.equal(parseIdentification('{"recognized":false,"names":[]}').recognized, false);
});

test("image results prefer Trendyol/Getir, drop tiny or duplicate images", () => {
  const images = rankImageResults([
    [
      { imageUrl: "https://example.com/a.jpg", url: "https://example.com/p", imageWidth: 800, imageHeight: 800, position: 1 },
      { imageUrl: "https://cdn.dsmcdn.com/ty/prod/1.jpg", url: "https://www.trendyol.com/ulker/gofret-p-1", imageWidth: 1200, imageHeight: 1800, position: 2 },
      { imageUrl: "https://example.com/tiny.jpg", imageWidth: 120, imageHeight: 120 },
      { imageUrl: "https://example.com/logo.png", imageWidth: 800, imageHeight: 800 },
    ],
    [
      { imageUrl: "https://cdn.getir.com/product/1.png", url: "https://getir.com/urun/gofret", imageWidth: 600, imageHeight: 600, position: 1 },
      { imageUrl: "https://cdn.dsmcdn.com/ty/prod/1.jpg", url: "https://www.trendyol.com/ulker/gofret-p-1", imageWidth: 1200, imageHeight: 1800 },
    ],
  ]);
  assert.deepEqual(images.map((image) => image.source), ["Getir", "Trendyol", "example.com"]);
  assert.equal(images.length, 3);
});

// Beyaz zeminde kırmızı "paket" ve paketin ortasında beyaz bir etiket
const fakeProductPhoto = async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
    <rect width="600" height="400" fill="#ffffff"/>
    <rect x="150" y="60" width="300" height="280" rx="24" fill="#d0202a"/>
    <rect x="230" y="150" width="140" height="100" fill="#ffffff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
};

test("white background is removed but white areas inside the product are kept", async () => {
  const { buffer, backgroundRemoved } = await makeTransparentProductImage(await fakeProductPhoto());
  assert.equal(backgroundRemoved, true);
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 800);
  assert.equal(info.height, 800);
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alpha(5, 5), 0, "köşe şeffaf olmalı");
  assert.equal(alpha(400, 400), 255, "paketin içindeki beyaz etiket korunmalı");
  assert.equal(alpha(400, 120), 255, "paketin kırmızı gövdesi korunmalı");
});

test("busy photo backgrounds are left untouched and reported", async () => {
  const noisy = await sharp({ create: { width: 300, height: 300, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
  const { backgroundRemoved, reason } = await makeTransparentProductImage(noisy);
  assert.equal(backgroundRemoved, false);
  assert.equal(reason, "busy-background");
});

test("provider failures become clear admin messages", () => {
  assert.equal(describeAssistFailure(new Error("FIRECRAWL_402")).message.includes("kredisi"), true);
  assert.equal(describeAssistFailure(new Error("GEMINI_API_KEY_MISSING")).status, 503);
  assert.equal(describeAssistFailure(new Error("IMAGE_URL_INVALID")).status, 400);
});

test("SearXNG image results are normalised (resolution, protocol-relative urls)", () => {
  const images = normalizeSearxngImages({ results: [
    { img_src: "//cdn.dsmcdn.com/ty/1.jpg", url: "https://www.trendyol.com/x-p-1", title: "Gofret", resolution: "1200 x 1800" },
    { url: "https://example.com", title: "görselsiz" },
  ] });
  assert.equal(images.length, 1);
  assert.deepEqual(images[0], { imageUrl: "https://cdn.dsmcdn.com/ty/1.jpg", url: "https://www.trendyol.com/x-p-1", title: "Gofret", imageWidth: 1200, imageHeight: 1800, position: 1 });
});

test("image search uses the free SearXNG instance and needs no paid key", async (t) => {
  const requested = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requested.push(String(url));
    const getir = String(url).includes("getir");
    return { ok: true, status: 200, json: async () => ({ results: [
      { img_src: getir ? "https://cdn.getir.com/p/1.png" : "https://cdn.dsmcdn.com/ty/1.jpg", url: getir ? "https://getir.com/urun/1" : "https://www.trendyol.com/x-p-1", resolution: "800 x 800" },
    ] }) };
  });
  const images = await searchProductImages("Ülker Gofret 36 g", { searxngUrl: "http://127.0.0.1:8888", firecrawlKey: "" });
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.startsWith("http://127.0.0.1:8888/search?") && url.includes("format=json") && url.includes("categories=images")));
  assert.deepEqual(images.map((image) => image.source).sort(), ["Getir", "Trendyol"]);
  await assert.rejects(searchProductImages("Ülker Gofret", { searxngUrl: "", firecrawlKey: "" }), /IMAGE_SEARCH_NOT_CONFIGURED/);
  assert.equal(describeAssistFailure(new Error("IMAGE_SEARCH_NOT_CONFIGURED")).status, 503);
});

test("paid Firecrawl is never used unless explicitly selected", async (t) => {
  const requested = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, json: async () => ({ data: { images: [] } }) };
  });
  await assert.rejects(searchProductImages("Ülker Gofret", { searxngUrl: "", firecrawlKey: "present" }), /IMAGE_SEARCH_NOT_CONFIGURED/);
  assert.equal(requested.length, 0);
  await searchProductImages("Ülker Gofret", { searxngUrl: "", firecrawlKey: "present", provider: "firecrawl" });
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url === "https://api.firecrawl.dev/v2/search"));
});

// ── Toplu tanıma ──────────────────────────────────────────────────────

const geminiReply = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });

test("batch prompt explains both modes and lists every category", () => {
  const separate = buildBatchIdentifyPrompt({ photoCount: 3, mode: "separate" });
  const group = buildBatchIdentifyPrompt({ photoCount: 2, mode: "group" });
  assert.match(separate, /3 fotoğraf/);
  assert.match(separate, /tam olarak bir ürün/);
  assert.match(group, /FARKLI ürünü ayrı yaz/);
  assert.match(group, new RegExp(`en fazla ${MAX_BATCH_PRODUCTS} ürün`));
  for (const { slug } of PRODUCT_CATEGORIES) assert.match(group, new RegExp(`- ${slug}:`));
  assert.match(separate, /shelfPrice/);
});

test("all photos go to Gemini in a single request, each labelled", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(JSON.parse(options.body));
    return geminiReply(JSON.stringify({ products: [
      { photo: 1, recognized: true, names: ["Ülker Çikolatalı Gofret 36 g"], categories: ["atistirma"], searchQuery: "ülker gofret 36 g" },
      { photo: 2, recognized: true, names: ["Coca-Cola 1 L"], categories: ["icecekler"] },
    ] }));
  });
  const photos = [{ mimeType: "image/jpeg", base64: "YQ==" }, { mimeType: "image/png", base64: "Yg==" }];
  const { products } = await identifyProductPhotos(photos, { mode: "separate" }, { apiKey: "k", model: "gemini-flash-latest" });
  assert.equal(calls.length, 1, "tek istek");
  const parts = calls[0].contents[0].parts;
  assert.deepEqual(parts.slice(0, 4).map((part) => part.text || part.inlineData.mimeType), ["Fotoğraf 1", "image/jpeg", "Fotoğraf 2", "image/png"]);
  assert.match(parts.at(-1).text, /2 fotoğraf/);
  assert.deepEqual(products.map((p) => p.names[0]), ["Ülker Çikolatalı Gofret 36 g", "Coca-Cola 1 L"]);
  assert.equal(products[1].categories[0].slug, "icecekler");
});

test("separate mode returns exactly one entry per photo, in photo order", () => {
  const raw = JSON.stringify({ products: [
    { photo: 3, names: ["Filiz Burgu Makarna 500 g"], categories: ["makarna"] },
    { photo: 1, names: ["Pınar Süt 1 L"], categories: ["sut", "uydurma"] },
    { photo: 1, names: ["Fazladan kayıt"] },
    { photo: 9, names: ["Olmayan fotoğraf"] },
  ] });
  const { products } = parseBatchIdentification(raw, { photoCount: 3, mode: "separate" });
  assert.deepEqual(products.map((p) => p.photo), [1, 2, 3]);
  assert.equal(products[0].names[0], "Pınar Süt 1 L");
  assert.deepEqual(products[0].categories.map((c) => c.slug), ["sut"]);
  assert.equal(products[1].recognized, false, "eksik fotoğraf tanınmadı olarak gelir");
  assert.equal(products[2].names[0], "Filiz Burgu Makarna 500 g");
});

test("group mode keeps distinct recognized products, reads shelf prices and counts", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ photo: 1, names: [`Ürün ${i}`], categories: ["gida"] }));
  const raw = "```json\n" + JSON.stringify({ products: [
    { photo: 1, names: ["Eti Karam Bitter"], categories: ["atistirma"], shelfPrice: "24,50 TL", count: 3 },
    { photo: 2, names: ["eti karam bitter"], categories: ["atistirma"] },
    { photo: 2, recognized: false, names: [] },
    { photo: 2, names: ["Erikli Su 1,5 L"], categories: ["icecekler"], shelfPrice: -5, count: "x" },
    ...many,
  ] }) + "\n```";
  const { products } = parseBatchIdentification(raw, { photoCount: 2, mode: "group" });
  assert.equal(products.length, MAX_BATCH_PRODUCTS);
  assert.equal(products[0].shelfPrice, 24.5);
  assert.equal(products[0].count, 3);
  assert.equal(products[1].names[0], "Erikli Su 1,5 L", "aynı ürün tekrar yazılmaz, tanınmayan atlanır");
  assert.equal(products[1].shelfPrice, null);
  assert.equal(products[1].count, 1);
});

test("batch parser accepts a bare array or a single object and rejects prose", () => {
  const array = parseBatchIdentification(JSON.stringify([{ photo: 1, names: ["Tadım Kuruyemiş"] }]), { photoCount: 1, mode: "group" });
  assert.equal(array.products[0].names[0], "Tadım Kuruyemiş");
  const single = parseBatchIdentification(JSON.stringify({ names: ["Pınar Süt 1 L"], categories: ["sut"] }), { photoCount: 1, mode: "separate" });
  assert.equal(single.products[0].names[0], "Pınar Süt 1 L");
  assert.equal(parseBatchIdentification("hiçbir ürün göremedim", { photoCount: 1, mode: "group" }), null);
});

test("batch identification surfaces Gemini errors like the single flow", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 429, json: async () => ({}) }));
  await assert.rejects(identifyProductPhotos([{ mimeType: "image/jpeg", base64: "YQ==" }], { mode: "group" }, { apiKey: "k", model: "m" }), /GEMINI_429/);
  await assert.rejects(identifyProductPhotos([{ mimeType: "image/jpeg", base64: "YQ==" }], { mode: "group" }, { apiKey: "", model: "m" }), /GEMINI_API_KEY_MISSING/);
});

// ── İnternetteki fiyatlar ──────────────────────────────────────────────

test("Turkish price formats are read correctly", () => {
  assert.equal(parseTurkishPrice("1.249,90"), 1249.9);
  assert.equal(parseTurkishPrice("45,90"), 45.9);
  assert.equal(parseTurkishPrice("45.90"), 45.9);
  assert.equal(parseTurkishPrice("abc"), null);
  assert.deepEqual(extractPrices("Ülker Gofret 36 g 12,50 TL, kargo ₺ 39,99 · 2.499 TL"), [12.5, 39.99, 2499]);
  assert.deepEqual(extractPrices("500 g makarna, 3 adet"), []);
});

test("price results keep only matching titles and drop outliers", () => {
  const result = rankPriceResults([
    { title: "Filiz Burgu Makarna 500 g - Trendyol", url: "https://www.trendyol.com/filiz/burgu-p-1", content: "Filiz Burgu Makarna 500 g 29,90 TL" },
    { title: "Filiz Burgu Makarna 500 gr Fiyatı - Getir", url: "https://getir.com/urun/filiz-burgu", content: "₺27,50" },
    { title: "Filiz Burgu Makarna 20'li Koli", url: "https://example.com/koli", content: "489,00 TL" },
    { title: "Barilla Burgu Makarna", url: "https://example.com/b", content: "45,00 TL" },
    { title: "Filiz Burgu Makarna 500 g", url: "https://www.migros.com.tr/filiz", content: "Fiyat bilgisi yok" },
    { title: "Filiz Burgu Makarna 500 g - Trendyol", url: "https://www.trendyol.com/filiz/burgu-p-1", content: "Filiz Burgu Makarna 500 g 29,90 TL" },
  ], "Filiz Burgu Makarna 500 g");
  assert.deepEqual(result.offers.map((offer) => offer.price), [27.5, 29.9]);
  assert.deepEqual(result.offers.map((offer) => offer.source), ["Getir", "Trendyol"]);
  assert.equal(result.min, 27.5);
  assert.equal(result.max, 29.9);
  assert.deepEqual(rankPriceResults([], "x"), { offers: [], min: null, max: null, median: null });
});

test("price search uses SearXNG web results only", async (t) => {
  const requested = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, json: async () => ({ results: [{ title: "Pınar Süt 1 L", url: "https://getir.com/urun/pinar-sut", content: "38,90 TL" }] }) };
  });
  const result = await searchProductPrices("Pınar Süt 1 L", { searxngUrl: "http://127.0.0.1:8888" });
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.includes("categories=general") && url.includes("format=json")));
  assert.equal(result.median, 38.9);
  await assert.rejects(searchProductPrices("Pınar Süt", { searxngUrl: "" }), /IMAGE_SEARCH_NOT_CONFIGURED/);
});
