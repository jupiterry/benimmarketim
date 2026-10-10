import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  PRODUCT_CATEGORIES,
  buildIdentifyPrompt,
  describeAssistFailure,
  identifyProductPhoto,
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
