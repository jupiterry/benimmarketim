import assert from "node:assert/strict";
import test from "node:test";
import {
  camgozOffers,
  camgozSearch,
  camgozSettings,
  chainOf,
  decryptApiKey,
  encryptApiKey,
  resolveCamgozSettings,
  testCamgozKey,
  validApiKeyFormat,
  describeCamgozError,
  findCamgozPrices,
  parseCamgozDate,
  pickCamgozProduct,
} from "../services/camgoz.service.js";
import { WATCH_VERSION, camgozAllowance, checkProduct, priceLookup } from "../services/priceWatch.service.js";

const NOW = new Date("2026-10-11T10:00:00Z");

// Camgöz API örnek yanıtından kısaltılmış kayıtlar
const market = (fields) => ({ id: "x", discountPrice: null, location: "Türkiye Geneli", history: [], externalImages: [], stockAvailable: true, ...fields });
const GOFRET = {
  barcode: "8690504136521",
  brand: "Ülker",
  name: "Ülker Çikolatalı Gofret Beyaz Çikolatalı 35 Gr",
  otherInfo: { "Net Miktar (g/ml)": "35" },
  price: 16.83,
  markets: [
    market({ name: "Ülker Çikolatalı Beyaz Gofret 35 Gr", price: 16, priceModified: "31-01-2026 02:07:05", market: "Hakmar", sourceUrl: "https://www.hakmarexpress.com.tr/x-p" }),
    market({ name: "Ülker Beyaz Çikolatalı Gofret 35 G", price: 18, priceModified: "23-07-2026 15:04:44", market: "A101", sourceUrl: "https://www.a101.com.tr/kapida/x_p-17002491" }),
    market({ name: "Ülker Beyaz Çikolatalı Gofret 35 G", price: 19.5, discountPrice: 17.25, priceModified: "05-10-2026 02:00:00", market: "Migros", sourceUrl: "https://www.migros.com.tr/x" }),
    market({ name: "Ülker Beyaz Çikolatalı Gofret 35 G", price: 29.9, priceModified: "10-10-2026 02:00:00", market: "Tahtakale Spot", sourceUrl: "https://tahtakalespot.com/x" }),
    market({ name: "Ülker Beyaz Çikolatalı Gofret 35 G", price: 17, priceModified: "09-10-2026 02:00:00", market: "Şok Market", stockAvailable: false }),
  ],
};
const PAKET = {
  barcode: "8690504135562",
  brand: "Ülker",
  name: "Ülker Çikolatalı Gofret 144 Gr",
  otherInfo: { "Net Miktar (g/ml)": "144" },
  markets: [
    market({ name: "Ülker Çikolatalı Gofret 4x36 G", price: 67.5, priceModified: "23-07-2026 15:04:44", market: "A101" }),
    market({ name: "Ülker Çikolatalı Gofret 144 Gr", price: 39.5, priceModified: "05-09-2026 02:03:16", market: "Hakmar" }),
  ],
};
const DIDO = { barcode: "8690504131458", brand: "Ülker", name: "Ülker Dido Trio Beyaz Çikolatalı Gofret 36,5 gr", markets: [] };

test("Camgöz ayarları, tarih ve market adları", () => {
  assert.equal(camgozSettings({}).enabled, false);
  const settings = camgozSettings({ JOJAPI_API_KEY: "k", CAMGOZ_MONTHLY_CREDITS: "10000", CAMGOZ_MARKETS: "A101, Migros" });
  assert.equal(settings.enabled, true);
  assert.equal(settings.monthlyCredits, 10000);
  assert.deepEqual(settings.chains, ["A101", "Migros"]);
  assert.equal(camgozSettings({ JOJAPI_API_KEY: "k" }).monthlyCredits, 500);
  assert.equal(parseCamgozDate("23-07-2026 15:04:44").toISOString(), "2026-07-23T12:04:44.000Z");
  assert.equal(parseCamgozDate("bozuk"), null);
  assert.equal(chainOf("Şok Market"), "Şok");
  assert.equal(chainOf("CarrefourSA"), "Carrefour");
  assert.equal(chainOf("Macro Center"), "Macro Center");
  assert.equal(chainOf("Tahtakale Spot"), null);
  assert.equal(chainOf("Eren Market"), null);
  assert.equal(describeCamgozError(new Error("CAMGOZ_402")), "Camgöz kredisi bitti");
});

test("isimle aramada doğru ürün seçilir (gramaj ve ad)", () => {
  const products = [DIDO, PAKET, GOFRET];
  assert.equal(pickCamgozProduct(products, { query: "Ülker Beyaz Çikolatalı Gofret 35 g" })?.barcode, GOFRET.barcode);
  assert.equal(pickCamgozProduct(products, { query: "Ülker Çikolatalı Gofret 144 g" })?.barcode, PAKET.barcode);
  assert.equal(pickCamgozProduct(products, { query: "Ülker Çikolatalı Gofret 50 g" }), null, "gramaj tutmuyor");
  assert.equal(pickCamgozProduct(products, { query: "x", barcode: "8690504131458" })?.name, DIDO.name);
});

test("market fiyatları: zincir, stok, güncellik, indirim ve yanlış bağlanmış paket", () => {
  const { offers, rejected } = camgozOffers(GOFRET, { query: GOFRET.name, now: NOW });
  assert.deepEqual(offers.map((offer) => [offer.source, offer.price]), [["A101", 18], ["Migros", 17.25]]);
  assert.equal(offers[1].readAt.toISOString(), "2026-10-04T23:00:00.000Z");
  assert.deepEqual(rejected.map((item) => [item.source, item.reason]), [["Hakmar", "fiyat 253 gündür güncellenmemiş"], ["Şok", "stokta yok"]]);

  const paket = camgozOffers(PAKET, { query: "Ülker Çikolatalı Gofret 144 Gr", now: NOW });
  assert.deepEqual(paket.offers.map((offer) => [offer.source, offer.price]), [["Hakmar", 39.5]]);
  assert.deepEqual(paket.rejected.map((item) => item.reason), ["paket adedi farklı"]);
});

const fakeSearch = (products, credits = 7) => {
  const calls = [];
  const search = async (query, options) => {
    calls.push({ query, options });
    return { products, credits };
  };
  return { search, calls };
};
const SETTINGS = camgozSettings({ JOJAPI_API_KEY: "test-key", CAMGOZ_PACING: "none" });
const MF_OFF = { enabled: false }; // bu testler Camgöz → sayfalar sırasını sınar; Market Fiyatı kapalı

test("Camgöz fiyatı: isimle eşleşir, barkod döner; barkodla arama kesin", async () => {
  const { search, calls } = fakeSearch([DIDO, GOFRET]);
  const byName = await findCamgozPrices("Ülker Beyaz Çikolatalı Gofret 35 g", { settings: SETTINGS, search, now: NOW });
  assert.equal(calls[0].query, "Ülker Beyaz Çikolatalı Gofret 35 g");
  assert.equal(calls[0].options.apiKey, "test-key");
  assert.equal(byName.barcode, GOFRET.barcode);
  assert.equal(byName.median, 17.63);
  assert.equal(byName.confidence, "high");
  assert.equal(byName.credits, 7);

  const byCode = await findCamgozPrices("Beyaz Gofret", { barcode: GOFRET.barcode, settings: SETTINGS, search: fakeSearch([GOFRET], 2).search, now: NOW });
  assert.equal(byCode.offers.length, 2);
  assert.equal(byCode.confidence, "low", "otomatik barkod + gramajsız ad: emin değil");
  const trusted = await findCamgozPrices("Beyaz Gofret", { barcode: GOFRET.barcode, trustedBarcode: true, settings: SETTINGS, search: fakeSearch([GOFRET], 2).search, now: NOW });
  assert.equal(trusted.confidence, "high", "yöneticinin yazdığı barkod güvenilir");

  const none = await findCamgozPrices("Devrek Erişte 500 g", { settings: SETTINGS, search: fakeSearch([DIDO]).search, now: NOW });
  assert.equal(none.offers.length, 0);
  assert.equal(none.barcode, null);
  assert.match(none.note, /eşleşen kayıt bulunamadı/);
});

test("API çağrısı: adres, anahtar başlığı ve kredi başlığı", async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url: String(url), headers: options.headers };
    return { ok: true, status: 200, headers: new Map([["x-jojapi-credits-used", "3"]]), json: async () => [GOFRET] };
  };
  const result = await camgozSearch("8690504136521", { apiKey: "abc", fetchImpl });
  assert.equal(seen.url, "https://camgoz.jojapi.net/api/external/search?query=8690504136521&marketPrices=true");
  assert.equal(seen.headers["X-JoJAPI-Key"], "abc");
  assert.equal(result.credits, 3);
  assert.equal(result.products[0].barcode, GOFRET.barcode);

  const failing = async () => ({ ok: false, status: 402, headers: new Map(), json: async () => ({}) });
  await assert.rejects(camgozSearch("x", { apiKey: "abc", fetchImpl: failing }), /CAMGOZ_402/);

  // 401: ağ geçidi açıklaması saklanır, anahtar metinden çıkarılır; .env'deki tırnak/boşluk temizlenir
  const unauthorized = async (url, options) => {
    seen = options.headers;
    return { ok: false, status: 401, headers: new Map(), text: async () => JSON.stringify({ message: "Key abc123 is not subscribed to this API" }) };
  };
  const error = await camgozSearch("x", { apiKey: ' "abc123"\r ', fetchImpl: unauthorized }).catch((err) => err);
  assert.equal(seen["X-JoJAPI-Key"], "abc123");
  assert.equal(error.detail, "Key ••• is not subscribed to this API");
  assert.match(describeCamgozError(error), /abone olunmamış.*sunucu yanıtı: "Key ••• is not subscribed to this API"/);
  assert.equal(camgozSettings({ JOJAPI_API_KEY: "  'k1'  " }).apiKey, "k1");
});

test("kredi bütçesi: aylık sınır ve ay boyunca eşit dağıtım", () => {
  const now = new Date("2026-10-11T01:00:00Z"); // 21 gün kaldı
  assert.equal(camgozAllowance(null, { monthly: 500, estimate: 13, now }).ok, true);
  // Bugün 25 kredi harcandı: günlük pay ceil(500/21) = 24
  const today = { month: "2026-10", day: "2026-10-11", used: 25, usedToday: 25 };
  assert.deepEqual(camgozAllowance(today, { monthly: 500, estimate: 3, now }), { ok: false, reason: "daily" });
  assert.equal(camgozAllowance(today, { monthly: 500, estimate: 3, now, manual: true }).ok, true, "elle kontrol günlük paya takılmaz");
  assert.deepEqual(camgozAllowance({ month: "2026-10", used: 499 }, { monthly: 500, estimate: 3, now, manual: true }), { ok: false, reason: "monthly" });
  assert.equal(camgozAllowance({ month: "2026-09", used: 500 }, { monthly: 500, estimate: 13, now }).ok, true, "yeni ayda sıfırlanır");
  assert.deepEqual(camgozAllowance({ pausedUntil: new Date(now.getTime() + 60000) }, { monthly: 500, estimate: 3, now }), { ok: false, reason: "paused" });
});

// priceLookup için küçük bellek içi veritabanı
const memoryDb = () => {
  const data = {};
  const collection = (name) => {
    data[name] ||= [];
    const docs = data[name];
    return {
      findOne: async (filter) => docs.find((doc) => String(doc._id) === String(filter._id)) || null,
      updateOne: async (filter, update, { upsert } = {}) => {
        let doc = docs.find((item) => String(item._id) === String(filter._id));
        if (!doc && upsert) docs.push((doc = { _id: filter._id, ...(update.$setOnInsert || {}) }));
        if (!doc) return;
        Object.assign(doc, update.$set || {});
        for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
        for (const key of Object.keys(update.$unset || {})) delete doc[key];
      },
    };
  };
  return { collection, data };
};

test("kaynak sırası (Market Fiyatı kapalı): önce Camgöz, bulamazsa market sayfaları; barkod ve kredi kaydedilir", async () => {
  const db = memoryDb();
  const product = { _id: "p1", name: "Ülker Beyaz Çikolatalı Gofret 35 g", price: 25 };
  let pageCalls = 0;
  const pages = async () => { pageCalls += 1; return { offers: [{ price: 18.5, source: "Şok", pageUrl: "https://s", title: "t" }], median: 18.5, min: 18.5, max: 18.5, confidence: "high", note: "", rejected: [] }; };
  const camgoz = (products, credits) => (query, options) => findCamgozPrices(query, { ...options, search: fakeSearch(products, credits).search });

  const first = await checkProduct({ db, product, now: NOW, lookup: priceLookup({ db, marketfiyatiSettings: MF_OFF, settings: SETTINGS, camgoz: camgoz([GOFRET], 7), pages }) });
  assert.equal(first.provider, "camgoz");
  assert.equal(first.barcode, GOFRET.barcode);
  assert.equal(first.barcodeSource, "auto");
  assert.equal(first.median, 17.63);
  assert.equal(first.v, WATCH_VERSION);
  assert.equal(pageCalls, 0);
  assert.equal(db.data.price_watch_state.find((doc) => doc._id === "camgoz").used, 7);

  // Camgöz'de yok → market sayfaları; isimle arama 30 gün tekrarlanmaz
  const other = { _id: "p2", name: "Devrek Erişte 500 g", price: 40 };
  const missed = await checkProduct({ db, product: other, now: NOW, lookup: priceLookup({ db, marketfiyatiSettings: MF_OFF, settings: SETTINGS, camgoz: camgoz([DIDO], 9), pages }) });
  assert.equal(missed.provider, "pages");
  assert.ok(missed.camgozMissAt);
  assert.equal(pageCalls, 1);
  let camgozCalls = 0;
  await checkProduct({ db, product: other, now: NOW, lookup: priceLookup({ db, marketfiyatiSettings: MF_OFF, settings: SETTINGS, camgoz: async () => { camgozCalls += 1; return {}; }, pages }) });
  assert.equal(camgozCalls, 0);
  assert.equal(db.data.price_watch_state.find((doc) => doc._id === "camgoz").used, 16);

  // CAMGOZ_PACING=even: bugünkü pay doldu (16 + 13 > 24) → Camgöz denenmez
  let skipped = 0;
  await priceLookup({ db, marketfiyatiSettings: MF_OFF, settings: { ...SETTINGS, pacing: "even" }, camgoz: async () => { skipped += 1; return {}; }, pages })("Pınar Süt 1 L", { now: NOW });
  assert.equal(skipped, 0);

  // Anahtar hatası (panelden elle kontrol): sayfalara düşer, Camgöz 6 saat beklenir
  const third = { _id: "p3", name: "Pınar Süt 1 L", price: 40 };
  const failed = await checkProduct({ db, product: third, now: NOW, lookup: priceLookup({ db, marketfiyatiSettings: MF_OFF, manual: true, settings: SETTINGS, camgoz: async () => { throw new Error("CAMGOZ_401"); }, pages }) });
  assert.equal(failed.provider, "pages");
  const state = db.data.price_watch_state.find((doc) => doc._id === "camgoz");
  assert.match(state.lastError.message, /yetkilendirilmedi/);
  assert.ok(new Date(state.pausedUntil) > NOW);

  // Camgöz kapalıysa (anahtar yok) doğrudan sayfalar
  const off = await priceLookup({ db, marketfiyatiSettings: MF_OFF, settings: camgozSettings({}), camgoz: async () => assert.fail("çağrılmamalı"), pages })("x", { now: NOW });
  assert.equal(off.provider, "pages");
});

test("panelden girilen anahtar: şifreli saklanır, .env'in yerine geçer, sır değişirse .env'e dönülür", async () => {
  const doc = { _id: "camgoz_key", ...encryptApiKey("panel-key-1234", "sır-1"), monthlyCredits: 10000, setAt: NOW };
  assert.ok(!JSON.stringify(doc).includes("panel-key"), "anahtar düz metin saklanmaz");
  assert.equal(decryptApiKey(doc, "sır-1"), "panel-key-1234");
  assert.throws(() => decryptApiKey(doc, "başka-sır"));
  assert.throws(() => encryptApiKey("k", ""), /NO_SECRET/);

  const db = { collection: () => ({ findOne: async () => doc }) };
  const panel = await resolveCamgozSettings(db, { JOJAPI_API_KEY: "env-key-9999", ACCESS_TOKEN_SECRET: "sır-1" });
  assert.equal(panel.apiKey, "panel-key-1234");
  assert.equal(panel.source, "panel");
  assert.equal(panel.last4, "1234");
  assert.equal(panel.monthlyCredits, 10000);
  assert.equal(panel.pacing, "even", "varsayılan: aylık kredi ay boyunca eşit dağıtılır");

  const rotated = await resolveCamgozSettings(db, { JOJAPI_API_KEY: "env-key-9999", ACCESS_TOKEN_SECRET: "yeni-sır" });
  assert.equal(rotated.apiKey, "env-key-9999");
  assert.equal(rotated.source, "env");
  assert.match(rotated.keyError, /çözülemedi/);

  const empty = await resolveCamgozSettings({ collection: () => ({ findOne: async () => null }) }, { CAMGOZ_PACING: "none" });
  assert.equal(empty.enabled, false);
  assert.equal(empty.source, "none");
  assert.equal(empty.pacing, "none", "CAMGOZ_PACING=none: kredi bitene kadar");

  assert.equal(validApiKeyFormat("abc"), false);
  assert.equal(validApiKeyFormat("abc def ghi"), false);
  assert.equal(validApiKeyFormat("jojapi_live_abc123XYZ"), true);
});

test("anahtar denemesi ücretsiz uçla yapılır", async () => {
  let seen;
  const ok = await testCamgozKey(" key-12345 ", { fetchImpl: async (url, options) => { seen = { url, key: options.headers["X-JoJAPI-Key"] }; return { ok: true, status: 200, text: async () => "[]" }; } });
  assert.deepEqual(seen, { url: "https://camgoz.jojapi.net/api/external/last", key: "key-12345" });
  assert.equal(ok.ok, true);
  const denied = await testCamgozKey("key-12345", { fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: "Subscription Not Found" }) }) });
  assert.deepEqual(denied, { ok: false, status: 401, detail: "Subscription Not Found" });
});
