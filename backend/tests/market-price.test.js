import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPagePrice,
  findMarketPrices,
  marketOf,
  matchProduct,
  parseLoosePrice,
  parseSize,
  pickProductPages,
} from "../services/marketPrice.service.js";

test("gramaj, hacim ve paket adedi okunur", () => {
  assert.deepEqual(parseSize("Eti Sütlü Kare Çikolata 65 gr"), { amount: 65, unit: "g", count: 1 });
  assert.deepEqual(parseSize("Erzincan Birlik Bal 850 g"), { amount: 850, unit: "g", count: 1 });
  assert.deepEqual(parseSize("Erikli Su 1,5 L"), { amount: 1500, unit: "ml", count: 1 });
  assert.deepEqual(parseSize("Omo Matik 1,5 kg"), { amount: 1500, unit: "g", count: 1 });
  assert.deepEqual(parseSize("Sütaş Ayran 6x200 ml"), { amount: 200, unit: "ml", count: 6 });
  assert.deepEqual(parseSize("Selpak Tuvalet Kağıdı 8'li"), { amount: null, unit: null, count: 8 });
  assert.deepEqual(parseSize("Coca-Cola 33 cl"), { amount: 330, unit: "ml", count: 1 });
  assert.equal(parseSize("Eti Çikolata"), null);
});

test("ürün eşleştirme: marka, kelimeler ve gramaj", () => {
  const ours = "Eti Sütlü Kare Çikolata 65 g";
  assert.deepEqual(matchProduct(ours, "Eti Sütlü Kare Çikolata 65 gr"), { ok: true, confidence: "high" });
  assert.deepEqual(matchProduct(ours, "ETİ Kare Çikolata Sütlü 65 G"), { ok: true, confidence: "high" }, "büyük harf ve sıra farkı");
  assert.equal(matchProduct(ours, "Eti Sütlü Kare Çikolata 75 g").reason, "gramaj farklı");
  assert.equal(matchProduct(ours, "Eti Sütlü Kare Çikolata 6x65 g").reason, "paket adedi farklı");
  assert.equal(matchProduct(ours, "Ülker Sütlü Kare Çikolata 65 g").reason, "marka tutmuyor");
  assert.equal(matchProduct("Eti Karam Bitter 50 g", "Eti Sütlü Kare Çikolata 50 g").reason, "ad tutmuyor");
  assert.deepEqual(matchProduct("Eti Çikolata", "Eti Sütlü Kare Çikolata 65 g"), { ok: true, confidence: "low", reason: "ürün adında gramaj yok" });
  assert.equal(matchProduct("Erikli Su 1,5 L", "Erikli Doğal Kaynak Suyu 1.5 Lt").ok, false, "su/suyu farklı kelime: güvenli tarafta kalır");
  assert.deepEqual(matchProduct("Erikli Su 1,5 L", "Erikli Su 1,5 Lt Pet"), { ok: true, confidence: "high" });
});

test("fiyat yazımları", () => {
  assert.equal(parseLoosePrice("63.6"), 63.6);
  assert.equal(parseLoosePrice("63,60"), 63.6);
  assert.equal(parseLoosePrice("1.249,90"), 1249.9);
  assert.equal(parseLoosePrice("1,249.90"), 1249.9);
  assert.equal(parseLoosePrice("1.250"), 1250);
});

test("sayfadan fiyat: JSON-LD, meta ve başlık sonrası metin", () => {
  const jsonLd = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Eti Sütlü Kare Çikolata 65 g","offers":{"@type":"Offer","price":"63.60","priceCurrency":"TRY","availability":"https://schema.org/InStock"}}</script></head><body><h1>x</h1></body></html>`;
  assert.deepEqual(extractPagePrice(jsonLd), { name: "Eti Sütlü Kare Çikolata 65 g", price: 63.6, method: "json-ld" });

  const graph = `<script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":["Product"],"name":"Bal &amp; Peynir","offers":[{"price":0,"availability":"OutOfStock"},{"price":139,"availability":"InStock"}]}]}</script>`;
  assert.deepEqual(extractPagePrice(graph), { name: "Bal & Peynir", price: 139, method: "json-ld" });

  const meta = `<head><meta property="og:title" content="Pınar Süt 1 L"><meta property="product:price:amount" content="38.90"></head><body>…</body>`;
  assert.deepEqual(extractPagePrice(meta), { name: "Pınar Süt 1 L", price: 38.9, method: "meta" });

  const sok = `<html><head><title>Lipton Yellow Label Poşet Çay 25'li - Cepte Şok</title><script>var x = "999,00₺";</script></head>
    <body><nav>Sepet 0,00₺</nav><h1 class="name">Lipton Yellow Label Poşet Çay 25&#39;li</h1><div><span>03112402</span><span>130,00₺</span><button>Sepete Ekle</button></div>
    <section>Benzer ürünler <a>Lipton Earl Grey 89,90₺</a></section></body></html>`;
  assert.deepEqual(extractPagePrice(sok), { name: "Lipton Yellow Label Poşet Çay 25'li", price: 130, method: "text" });

  const discounted = `<h1>Doritos Nacho 113 g</h1><div><del>59,90 TL</del> <b>44,50 TL</b></div>`;
  assert.equal(extractPagePrice(discounted).price, 44.5, "eski ve indirimli fiyat yan yanaysa düşük olan");

  assert.equal(extractPagePrice("<h1>Ürün</h1><p>Fiyat için mağazaya sorun</p>"), null);
  assert.equal(extractPagePrice(`<script type="application/ld+json">{bozuk</script>`), null);
});

test("arama sonuçlarından yalnızca desteklenen marketlerin ürün sayfaları seçilir", () => {
  assert.equal(marketOf("https://www.sokmarket.com.tr/lipton-yellow-label-p-4729")?.id, "sok");
  assert.equal(marketOf("https://www.sokmarket.com.tr/arama?q=eti"), null, "arama sayfası değil");
  assert.equal(marketOf("http://www.trendyol.com/eti/kare-p-123"), null, "yalnızca https");
  assert.equal(marketOf("https://www.cimri.com/eti-cikolata"), null);
  const results = [
    { url: "https://www.cimri.com/cikolata/en-ucuz-eti", title: "Eti Çikolata 4,50 TL" },
    { url: "https://www.instagram.com/p/abc", title: "Eti çikolata 15 TL" },
    { url: "https://www.trendyol.com/ulker/kare-cikolata-p-111", title: "Ülker Kare Çikolata" },
    { url: "https://www.trendyol.com/eti/sutlu-kare-cikolata-65-g-p-222", title: "Eti Sütlü Kare Çikolata 65 g" },
    { url: "https://www.trendyol.com/eti/sutlu-kare-cikolata-75-g-p-333", title: "Eti Sütlü Kare Çikolata 75 g" },
    { url: "https://www.sokmarket.com.tr/eti-sutlu-kare-cikolata-65-g-p-444#yorum", title: "Eti Sütlü Kare Çikolata 65 g - Cepte Şok" },
  ];
  assert.deepEqual(pickProductPages(results, "Eti Sütlü Kare Çikolata 65 g").map((page) => page.url), [
    "https://www.trendyol.com/eti/sutlu-kare-cikolata-65-g-p-222",
    "https://www.sokmarket.com.tr/eti-sutlu-kare-cikolata-65-g-p-444",
  ]);
});

const ldPage = (name, price) => `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name, offers: { price } })}</script>`;

test("güncel fiyat: sayfalar açılır, uymayan ürün elenir, ortanca hesaplanır", async () => {
  const queries = [];
  const fetched = [];
  const pages = {
    "https://www.sokmarket.com.tr/eti-sutlu-kare-cikolata-65-g-p-1": `<h1>Eti Sütlü Kare Çikolata 65 g</h1><span>62,50₺</span>`,
    "https://www.trendyol.com/eti/sutlu-kare-cikolata-p-2": ldPage("Eti Sütlü Kare Çikolata 65 gr", "64.90"),
    "https://www.hepsiburada.com/eti-sutlu-kare-cikolata-p-HBC3": ldPage("Eti Sütlü Kare Çikolata 6 x 65 g", "390"),
  };
  let pauses = 0;
  const result = await findMarketPrices("Eti Sütlü Kare Çikolata 65 g", {
    search: async (q) => {
      queries.push(q);
      return Object.keys(pages).map((url) => ({ url, title: "Eti Sütlü Kare Çikolata" }));
    },
    fetchPage: async (url) => {
      fetched.push(url);
      return pages[url];
    },
    pause: async () => { pauses += 1; },
    now: new Date("2026-10-11T01:00:00Z"),
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /site:sokmarket\.com\.tr OR site:trendyol\.com OR site:hepsiburada\.com/);
  assert.equal(fetched.length, 3);
  assert.equal(pauses, 2, "sayfalar arasında beklenir");
  assert.deepEqual(result.offers.map((offer) => [offer.source, offer.price]), [["Şok", 62.5], ["Trendyol", 64.9]]);
  assert.equal(result.offers[0].readAt.toISOString(), "2026-10-11T01:00:00.000Z");
  assert.equal(result.median, 63.7);
  assert.equal(result.confidence, "high");
  assert.deepEqual(result.rejected.map((item) => [item.source, item.reason]), [["Hepsiburada", "paket adedi farklı"]]);
});

test("güncel fiyat: market sayfası yoksa ikinci arama, hiçbiri yoksa açıklama", async () => {
  const queries = [];
  const none = await findMarketPrices("Devrek Erişte 500 g", {
    search: async (q) => { queries.push(q); return [{ url: "https://www.cimri.com/x", title: "Devrek Erişte" }]; },
    fetchPage: async () => { throw new Error("çağrılmamalı"); },
    pause: async () => {},
  });
  assert.deepEqual(queries, [queries[0], "Devrek Erişte 500 g fiyat"]);
  assert.equal(none.offers.length, 0);
  assert.equal(none.note, "Desteklenen marketlerde ürün sayfası bulunamadı.");

  const failed = await findMarketPrices("Eti Karam 50 g", {
    search: async () => [{ url: "https://www.trendyol.com/eti/karam-p-9", title: "Eti Karam" }],
    fetchPage: async () => { throw new Error("PAGE_403"); },
    pause: async () => {},
  });
  assert.equal(failed.note, "Market sayfaları açılamadı.");
  assert.equal(failed.rejected[0].reason, "PAGE_403");

  const vague = await findMarketPrices("Eti Çikolata", {
    search: async () => [{ url: "https://www.trendyol.com/eti/cikolata-p-9", title: "Eti Çikolata" }],
    fetchPage: async () => ldPage("Eti Sütlü Kare Çikolata 65 g", 63.6),
    pause: async () => {},
  });
  assert.equal(vague.confidence, "low");
  assert.equal(vague.note, "Ürün adında gramaj yok");
});
