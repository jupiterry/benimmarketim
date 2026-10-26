import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_DISTANCE_KM,
  MARKETFIYATI_STATE_ID,
  chainLabel,
  clearMarketfiyatiCache,
  createRateLimiter,
  describeMarketfiyatiError,
  distanceKm,
  findMarketfiyatiPrices,
  marketfiyatiOffers,
  marketfiyatiRequest,
  marketfiyatiSettings,
  nextPauseMs,
  parseIndexTime,
  parseNearestDepots,
  pickMarketfiyatiProduct,
  productTitle,
  resolveMarketfiyatiSettings,
  shortBody,
  shouldPause,
  validateMarketfiyatiConfig,
} from "../services/marketfiyati.service.js";
import { PAGES_STATE_ID, checkProduct, priceLookup, recordProviderError, selectDue } from "../services/priceWatch.service.js";
import { camgozSettings } from "../services/camgoz.service.js";

const NOW = new Date("2026-10-11T10:00:00Z");
const DEVREK = { latitude: 41.2207, longitude: 31.9563 };
const SETTINGS = { ...marketfiyatiSettings({}), minIntervalMs: 500 };
// Beklemeyen sınırlayıcı (testlerde gerçek zaman geçmez)
const instantLimiter = () => createRateLimiter({ wait: async () => {}, now: () => 0, random: () => 0 });

// Platform yanıtına benzer örnek kayıtlar (Devrek ve çevresi)
const depot = (fields) => ({ depotId: "d", depotName: "Şube", unitPrice: "", percentage: 0, latitude: 41.2250, longitude: 31.9600, indexTime: "2026-10-10T03:00:00", ...fields });
const SUT = {
  id: "mf-1",
  title: "Pınar Süt Tam Yağlı 1 L",
  brand: "Pınar",
  imageUrl: "https://cdn.marketfiyati.org.tr/x.png",
  refinedQuantityUnit: "L",
  refinedVolumeOrWeight: "1",
  categories: ["Süt"],
  productDepotInfoList: [
    depot({ depotId: "a101-1", depotName: "A101 Devrek Merkez", marketAdi: "a101", price: 42.5 }),
    depot({ depotId: "a101-2", depotName: "A101 Devrek Çarşı", marketAdi: "a101", price: 44.5 }),
    depot({ depotId: "a101-3", depotName: "A101 Devrek Eski", marketAdi: "a101", price: 39, indexTime: "2026-10-01T03:00:00" }), // aynı zincir, daha eski gün: ortancaya girmez
    depot({ depotId: "bim-1", depotName: "BİM Devrek", marketAdi: "bim", price: 41.75 }),
    depot({ depotId: "sok-1", depotName: "Şok Devrek", marketAdi: "sok", price: 43, indexTime: "2026-09-01T03:00:00" }), // 40 gün: eski
    depot({ depotId: "migros-1", depotName: "Migros Düzce", marketAdi: "migros", price: 40, latitude: 40.84, longitude: 31.16 }), // ~78 km: 60 km dışında
    depot({ depotId: "x-1", depotName: "Eren Market", marketAdi: "eren", price: 38 }), // zincir dışı
    depot({ depotId: "ck-1", depotName: "Carrefour Zonguldak", marketAdi: "carrefoursa", price: 45.9, latitude: 41.45, longitude: 31.79 }), // ~29 km
  ],
};
const SUT_YARIM = { ...SUT, id: "mf-2", title: "Pınar Süt Tam Yağlı 500 ml", refinedVolumeOrWeight: "500", refinedQuantityUnit: "ml", productDepotInfoList: [depot({ marketAdi: "a101", price: 25 })] };
const GRAMAJSIZ = { ...SUT, id: "mf-3", title: "Pınar Süt Tam Yağlı", refinedVolumeOrWeight: "1", refinedQuantityUnit: "L", productDepotInfoList: [depot({ marketAdi: "bim", price: 41 })] };
const response = (content) => ({ numberOfFound: content.length, searchResultType: 1, content, facetMap: null });

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const fakeFetch = (handler) => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), headers: options.headers, body });
    return handler({ url: String(url), body, call: calls.length });
  };
  return { fetchImpl, calls };
};

test.beforeEach(() => clearMarketfiyatiCache());

test("ayarlar: varsayılanlar (Devrek, 60 km, 2,5 sn, 14 gün) ve panel ayarı", async () => {
  const settings = marketfiyatiSettings({});
  assert.equal(settings.enabled, true);
  assert.deepEqual([settings.latitude, settings.longitude], [41.2207, 31.9563]);
  assert.equal(settings.distanceKm, 60);
  assert.equal(settings.minIntervalMs, 2500);
  assert.equal(settings.maxAgeDays, 14);
  assert.equal(settings.timeoutMs, 12000);
  assert.ok(settings.chains.includes("BİM"));
  assert.equal(marketfiyatiSettings({ MARKETFIYATI_ENABLED: "false" }).enabled, false);
  assert.equal(marketfiyatiSettings({ MARKETFIYATI_DISTANCE_KM: "abc" }).distanceKm, 60);
  assert.deepEqual(marketfiyatiSettings({ CAMGOZ_MARKETS: "A101, Şok" }).chains, ["A101", "Şok"]);

  const db = { collection: () => ({ findOne: async () => ({ _id: "marketfiyati_config", distanceKm: 25, enabled: false, updatedAt: NOW }) }) };
  const panel = await resolveMarketfiyatiSettings(db, {});
  assert.equal(panel.distanceKm, 25);
  assert.equal(panel.enabled, false);
  assert.equal(panel.source, "panel");
  assert.equal(panel.minIntervalMs, 2500, "verilmeyen alan .env varsayılanında kalır");

  assert.deepEqual(validateMarketfiyatiConfig({ latitude: "41.5", distanceKm: 30, enabled: true }).set, { latitude: 41.5, distanceKm: 30, enabled: true });
  assert.match(validateMarketfiyatiConfig({ distanceKm: 0 }).error, /Mesafe/);
  assert.match(validateMarketfiyatiConfig({ latitude: 95 }).error, /Enlem/);
  assert.match(validateMarketfiyatiConfig({ enabled: "evet" }).error, /geçersiz/);
});

test("yanıt okuma: tarih, mesafe, zincir adı ve gramajlı başlık", () => {
  assert.equal(parseIndexTime("2026-10-10T03:00:00").toISOString(), "2026-10-10T00:00:00.000Z", "saat dilimi yoksa İstanbul");
  assert.equal(parseIndexTime("2026-10-10T03:00:00Z").toISOString(), "2026-10-10T03:00:00.000Z");
  assert.equal(parseIndexTime(1760000000).toISOString(), "2025-10-09T08:53:20.000Z", "saniye cinsinden epoch");
  assert.equal(parseIndexTime("bozuk"), null);
  assert.equal(parseIndexTime(null), null);
  assert.ok(Math.abs(distanceKm(41.2207, 31.9563, 41.45, 31.79) - 29) < 2);
  assert.equal(chainLabel("a101"), "A101");
  assert.equal(chainLabel("bim"), "BİM");
  assert.equal(chainLabel("sok"), "Şok");
  assert.equal(chainLabel("carrefoursa"), "Carrefour");
  assert.equal(chainLabel("tarim_kredi"), "Tarım Kredi");
  assert.equal(chainLabel("Şok Market"), "Şok");
  assert.equal(chainLabel("eren"), null);
  assert.equal(chainLabel("bim", ["A101"]), null, "zincir filtresi");
  assert.equal(productTitle(GRAMAJSIZ), "Pınar Süt Tam Yağlı 1 L");
  assert.equal(productTitle(SUT), "Pınar Süt Tam Yağlı 1 L", "başlıkta gramaj varsa eklenmez");
});

test("ürün seçimi: gramaj tutan kayıt, gramajsız ad düşük güven", () => {
  const best = pickMarketfiyatiProduct([SUT_YARIM, GRAMAJSIZ, SUT], "Pınar Süt Tam Yağlı 1 L");
  assert.equal(best.product.id, "mf-1");
  assert.equal(best.match.confidence, "high");
  assert.equal(pickMarketfiyatiProduct([SUT_YARIM], "Pınar Süt Tam Yağlı 1 L"), null, "gramaj farklı");
  assert.equal(pickMarketfiyatiProduct([SUT], "Sütaş Süt 1 L"), null, "marka tutmuyor");
  assert.equal(pickMarketfiyatiProduct([SUT], "Pınar Süt Tam Yağlı").match.confidence, "low");
});

test("zincir teklifleri: şube ortancası, en güncel gün, yaş ve mesafe süzgeci", () => {
  const { offers, rejected } = marketfiyatiOffers(SUT, { location: DEVREK, distanceKm: 60, maxAgeDays: 14, now: NOW });
  assert.deepEqual(offers.map((offer) => [offer.source, offer.price]), [["BİM", 41.75], ["A101", 43.5], ["Carrefour", 45.9]]);
  const a101 = offers.find((offer) => offer.source === "A101");
  assert.equal(a101.readAt.toISOString(), "2026-10-10T00:00:00.000Z");
  assert.equal(a101.note, "2 şube", "eski günün şubesi ortancaya girmez");
  assert.equal(a101.confidence, "high");
  assert.ok(a101.pageUrl.startsWith("https://marketfiyati.org.tr/"));
  assert.deepEqual(rejected.map((item) => item.reason), ["1 şube fiyatı 14 günden eski", "1 şube 60 km dışında", "1 şube izin verilen zincirlerden değil"]);

  // Geniş alan: Düzce şubesi de girer; eski fiyat yine girmez
  const wide = marketfiyatiOffers(SUT, { location: DEVREK, distanceKm: 300, maxAgeDays: 14, now: NOW });
  assert.ok(wide.offers.some((offer) => offer.source === "Migros"));
  assert.ok(!wide.offers.some((offer) => offer.source === "Şok"));
  // Koordinatı olmayan şube elenmez
  const noCoords = marketfiyatiOffers({ ...SUT, productDepotInfoList: [depot({ marketAdi: "a101", price: 10, latitude: undefined, longitude: undefined })] }, { location: DEVREK, distanceKm: 1, now: NOW });
  assert.equal(noCoords.offers.length, 1);
});

test("isimle arama: istek biçimi, başlıklar, sonuç ve önbellek", async () => {
  const { fetchImpl, calls } = fakeFetch(() => jsonResponse(response([SUT_YARIM, SUT])));
  const limiter = instantLimiter();
  const result = await findMarketfiyatiPrices("Pınar Süt Tam Yağlı 1 L", { settings: SETTINGS, fetchImpl, limiter, now: NOW });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.marketfiyati.org.tr/api/v2/search");
  assert.deepEqual(calls[0].body, { keywords: "Pınar Süt Tam Yağlı 1 L", pages: 0, size: 20, latitude: 41.2207, longitude: 31.9563, distance: 60 });
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.equal(calls[0].headers.Origin, "https://marketfiyati.org.tr");
  assert.match(calls[0].headers["User-Agent"], /Mozilla/);
  assert.equal(result.productId, "mf-1");
  assert.equal(result.matchedName, "Pınar Süt Tam Yağlı 1 L");
  assert.equal(result.barcode, null, "platform barkod vermez; bizimki korunur");
  assert.equal(result.median, 43.5);
  assert.equal(result.min, 41.75);
  assert.equal(result.max, 45.9);
  assert.equal(result.confidence, "high");
  assert.equal(result.offers.length, 3);
  assert.equal(result.requests, 1);

  // Aynı sorgu 6 saat önbellekten döner (istek yapılmaz)
  const again = await findMarketfiyatiPrices("pınar süt tam yağlı 1 L", { settings: SETTINGS, fetchImpl, limiter, now: NOW });
  assert.equal(calls.length, 1);
  assert.equal(again.cached, true);
  await findMarketfiyatiPrices("Pınar Süt Tam Yağlı 1 L", { settings: SETTINGS, fetchImpl, limiter, now: new Date(NOW.getTime() + 7 * 3600000) });
  assert.equal(calls.length, 2, "süresi dolunca yeniden sorulur");
});

test("isimle arama: yakın şubede yoksa 150 km ile bir kez daha; yine yoksa bulunamadı", async () => {
  const { fetchImpl, calls } = fakeFetch(({ body }) => jsonResponse(response(body.distance === FALLBACK_DISTANCE_KM ? [SUT] : [])));
  const result = await findMarketfiyatiPrices("Pınar Süt Tam Yağlı 1 L", { settings: SETTINGS, fetchImpl, limiter: instantLimiter(), now: NOW });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.distance, 150);
  assert.ok(result.offers.some((offer) => offer.source === "Migros"), "geniş alanda Düzce şubesi sayılır");
  assert.match(result.note, /60 km içinde bulunamadı/);
  assert.equal(result.confidence, "high", "zincir fiyatı ülke genelinde benzer; geniş alan güveni düşürmez, yalnızca not yazılır");

  clearMarketfiyatiCache();
  const none = await findMarketfiyatiPrices("Devrek Erişte 500 g", { settings: SETTINGS, fetchImpl: fakeFetch(() => jsonResponse(response([]))).fetchImpl, limiter: instantLimiter(), now: NOW });
  assert.equal(none.offers.length, 0);
  assert.equal(none.median, null);
  assert.match(none.note, /bulunamadı/);

  // Benzer ürün var ama gramaj tutmuyor: açıklama farklı, yeniden geniş arama yapılmaz
  clearMarketfiyatiCache();
  const mismatch = fakeFetch(() => jsonResponse(response([SUT_YARIM])));
  const wrong = await findMarketfiyatiPrices("Pınar Süt Tam Yağlı 1 L", { settings: SETTINGS, fetchImpl: mismatch.fetchImpl, limiter: instantLimiter(), now: NOW });
  assert.equal(mismatch.calls.length, 1);
  assert.match(wrong.note, /gramaj\/ad tutmadı/);
});

test("şubesiz arama boşsa: nearest ile şube kimlikleri alınır, arama depots ile bir kez yinelenir; liste 6 saat önbellekte", async () => {
  const NEAREST = [
    { id: "bim-U751", sellerName: "BİM Devrek", marketName: "bim", location: { lat: 41.225, lon: 31.96 }, distance: 420 },
    { id: "a101-K12", sellerName: "A101 Devrek", marketName: "a101", location: { lat: 41.22, lon: 31.95 }, distance: 900 },
  ];
  assert.deepEqual(parseNearestDepots(NEAREST), ["bim-U751", "a101-K12"]);
  assert.deepEqual(parseNearestDepots({ content: [{ depotId: "x" }, "y", { id: "x" }, {}] }), ["x", "y"], "sarmalanmış biçim, depotId, düz metin, yinelenen");
  assert.deepEqual(parseNearestDepots(null), []);

  const { fetchImpl, calls } = fakeFetch(({ url, body }) => {
    if (url.endsWith("/nearest")) return jsonResponse(NEAREST);
    return jsonResponse(response(Array.isArray(body.depots) ? [SUT] : []));
  });
  const limiter = instantLimiter();
  const result = await findMarketfiyatiPrices("Pınar Süt Tam Yağlı 1 L", { settings: SETTINGS, fetchImpl, limiter, now: NOW });
  assert.deepEqual(calls.map((c) => c.url.replace("https://api.marketfiyati.org.tr/api/v2", "")), ["/search", "/search", "/nearest", "/search"]);
  assert.deepEqual(calls[2].body, { latitude: 41.2207, longitude: 31.9563, distance: FALLBACK_DISTANCE_KM }, "nearest son kullanılan yarıçapla sorulur");
  assert.deepEqual(calls[3].body, { ...calls[1].body, depots: ["bim-U751", "a101-K12"] }, "aynı arama + depots");
  assert.equal(result.productId, "mf-1");
  assert.equal(result.requests, 4);
  assert.ok(result.offers.length > 0);

  // Başka ürün, aynı konum: şube listesi önbellekten (nearest yeniden sorulmaz)
  const again = await findMarketfiyatiPrices("Sütaş Yoğurt 1 kg", { settings: SETTINGS, fetchImpl, limiter, now: NOW });
  assert.deepEqual(calls.slice(4).map((c) => c.url.replace("https://api.marketfiyati.org.tr/api/v2", "")), ["/search", "/search", "/search"]);
  assert.deepEqual(calls[6].body.depots, ["bim-U751", "a101-K12"]);
  assert.match(again.note, /gramaj\/ad tutmadı/, "depots ile kayıt geldi ama eşleşmedi");

  // Şubelerle yinelenen arama da boş: not eklenir, fazladan istek yok
  clearMarketfiyatiCache();
  const stillEmpty = fakeFetch(({ url }) => jsonResponse(url.endsWith("/nearest") ? NEAREST : response([])));
  const none = await findMarketfiyatiPrices("Devrek Erişte 500 g", { settings: SETTINGS, fetchImpl: stillEmpty.fetchImpl, limiter, now: NOW });
  assert.equal(stillEmpty.calls.length, 4);
  assert.match(none.note, /Yakın şubelerde de bulunamadı/);
  assert.equal(none.offers.length, 0);

  // 6 saat sonra şube listesi yeniden sorulur
  await findMarketfiyatiPrices("Devrek Erişte 500 g", { settings: SETTINGS, fetchImpl: stillEmpty.fetchImpl, limiter, now: new Date(NOW.getTime() + 7 * 3600000), useCache: false });
  assert.equal(stillEmpty.calls.filter((c) => c.url.endsWith("/nearest")).length, 2);

  // nearest boş liste verdi: yineleme yapılmaz
  clearMarketfiyatiCache();
  const noDepots = fakeFetch(({ url }) => jsonResponse(url.endsWith("/nearest") ? [] : response([])));
  const empty = await findMarketfiyatiPrices("Devrek Erişte 500 g", { settings: SETTINGS, fetchImpl: noDepots.fetchImpl, limiter, now: NOW });
  assert.equal(noDepots.calls.length, 3);
  assert.match(empty.note, /şube bulunamadı/);
});

test("nearest hatası (404) hoş görülür: boş sonuç + not; 429 ise ara verme kuralı için dışarı atılır", async () => {
  const limiter = instantLimiter();
  const broken = fakeFetch(({ url }) => (url.endsWith("/nearest") ? jsonResponse({ message: "Not Found" }, 404) : jsonResponse(response([]))));
  const result = await findMarketfiyatiPrices("Devrek Erişte 500 g", { settings: SETTINGS, fetchImpl: broken.fetchImpl, limiter, now: NOW });
  assert.equal(broken.calls.length, 3, "nearest başarısızsa depots ile yineleme yapılmaz");
  assert.equal(result.offers.length, 0);
  assert.match(result.note, /bu ürün bulunamadı/);
  assert.match(result.note, /Yakın şube listesi alınamadı.*404/);

  clearMarketfiyatiCache();
  const limited = fakeFetch(({ url }) => (url.endsWith("/nearest") ? jsonResponse({ message: "Too Many" }, 429) : jsonResponse(response([]))));
  await assert.rejects(findMarketfiyatiPrices("Devrek Erişte 500 g", { settings: SETTINGS, fetchImpl: limited.fetchImpl, limiter, now: NOW }), /MARKETFIYATI_429/);
});

test("barkodla arama: searchByIdentity önce; desteklenmiyorsa isimle devam", async () => {
  const { fetchImpl, calls } = fakeFetch(({ url }) => jsonResponse(response(url.endsWith("/searchByIdentity") ? [SUT] : [])));
  const result = await findMarketfiyatiPrices("Pınar Süt 1 L", { barcode: "8690000000012", trustedBarcode: true, settings: SETTINGS, fetchImpl, limiter: instantLimiter(), now: NOW });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.marketfiyati.org.tr/api/v2/searchByIdentity");
  assert.deepEqual(calls[0].body, { identity: "8690000000012", identityType: "barcode", keywords: "Pınar Süt 1 L", latitude: 41.2207, longitude: 31.9563, distance: 60 });
  assert.equal(result.barcode, "8690000000012");
  assert.equal(result.confidence, "high");

  // Barkod türü kabul edilmiyor (400): isimle aranır
  clearMarketfiyatiCache();
  const fallback = fakeFetch(({ url }) => (url.endsWith("/searchByIdentity") ? jsonResponse({ message: "identityType" }, 400) : jsonResponse(response([SUT]))));
  const byName = await findMarketfiyatiPrices("Pınar Süt Tam Yağlı 1 L", { barcode: "8690000000012", settings: SETTINGS, fetchImpl: fallback.fetchImpl, limiter: instantLimiter(), now: NOW });
  assert.equal(fallback.calls.length, 2);
  assert.equal(fallback.calls[1].url, "https://api.marketfiyati.org.tr/api/v2/search");
  assert.equal(byName.offers.length, 3);

  // Barkodla boş döndü: isimle devam edilir
  clearMarketfiyatiCache();
  const empty = fakeFetch(({ url }) => jsonResponse(response(url.endsWith("/searchByIdentity") ? [] : [SUT])));
  await findMarketfiyatiPrices("Pınar Süt Tam Yağlı 1 L", { barcode: "8690000000012", settings: SETTINGS, fetchImpl: empty.fetchImpl, limiter: instantLimiter(), now: NOW });
  assert.equal(empty.calls.length, 2);
});

test("HTTP hataları: durum kodu, kısa açıklama, ara verme kuralı", async () => {
  const limiter = instantLimiter();
  const tooMany = await findMarketfiyatiPrices("x", { settings: SETTINGS, fetchImpl: async () => ({ ok: false, status: 429, text: async () => "<html><body>Too Many Requests</body></html>" }), limiter, now: NOW }).catch((error) => error);
  assert.equal(tooMany.message, "MARKETFIYATI_429");
  assert.equal(tooMany.status, 429);
  assert.equal(tooMany.detail, "Too Many Requests", "HTML etiketleri atılır");
  assert.match(describeMarketfiyatiError(tooMany), /istek sınırı.*429/);
  assert.equal(shouldPause(tooMany), true);
  assert.equal(shouldPause(new Error("MARKETFIYATI_403")), true);
  assert.equal(shouldPause(new Error("MARKETFIYATI_502")), true);
  assert.equal(shouldPause(new Error("MARKETFIYATI_TIMEOUT")), true);
  assert.equal(shouldPause(new Error("MARKETFIYATI_404")), false);
  assert.equal(shortBody(JSON.stringify({ message: "x".repeat(300) })).length, 120);
  assert.match(describeMarketfiyatiError(new Error("MARKETFIYATI_403")), /erişimi engelledi/);
  assert.match(describeMarketfiyatiError(new Error("MARKETFIYATI_TIMEOUT")), /zamanında yanıt vermedi/);

  const dns = Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } });
  const network = await marketfiyatiRequest("/api/v2/search", {}, { fetchImpl: async () => { throw dns; } }).catch((error) => error);
  assert.equal(network.message, "MARKETFIYATI_NETWORK");
  assert.match(describeMarketfiyatiError(network), /bağlanılamadı \(ENOTFOUND\)/);

  const aborted = await marketfiyatiRequest("/api/v2/search", {}, { fetchImpl: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; } }).catch((error) => error);
  assert.equal(aborted.message, "MARKETFIYATI_TIMEOUT");

  assert.equal(nextPauseMs(0), 15 * 60000);
  assert.equal(nextPauseMs(15 * 60000), 30 * 60000);
  assert.equal(nextPauseMs(5 * 3600000), 6 * 3600000, "en çok 6 saat");
});

test("hız sınırlayıcı: istekler arası en az bekleme + rastgele ek", async () => {
  let clock = 0;
  const waits = [];
  const limiter = createRateLimiter({ wait: async (ms) => { waits.push(ms); clock += ms; }, now: () => clock, random: () => 0.5 });
  await limiter.acquire(2500); // ilk istek: yalnızca rastgele ek (2500 * 0.4 * 0.5 = 500)
  await limiter.acquire(2500); // ikinci: önceki + 2500 dolmadan izin yok
  assert.deepEqual(waits, [500, 3000]);
  clock += 10000;
  await limiter.acquire(2500);
  assert.equal(waits[2], 500, "uzun süre geçtiyse yalnızca rastgele ek beklenir");
});

// priceLookup için küçük bellek içi veritabanı ($set, $inc, $unset)
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
const stateOf = (db, id) => db.data.price_watch_state.find((doc) => doc._id === id);
const CAMGOZ_OFF = camgozSettings({});
const CAMGOZ_ON = camgozSettings({ JOJAPI_API_KEY: "test-key", CAMGOZ_PACING: "none" });
const found = (source = "Şok") => ({ offers: [{ price: 18.5, source, pageUrl: "https://s", title: "t" }], median: 18.5, min: 18.5, max: 18.5, confidence: "high", note: "", rejected: [] });
const mfFound = async () => ({ ...found("A101"), barcode: null, productId: "mf-1", matchedName: "x" });
const mfNone = async () => ({ offers: [], rejected: [], median: null, min: null, max: null, confidence: null, note: "Market Fiyatı'nda bu ürün bulunamadı.", barcode: null });

test("kaynak sırası: Market Fiyatı → Camgöz (yalnızca bulamazsa) → market sayfaları", async () => {
  const db = memoryDb();
  const product = { _id: "p1", name: "Pınar Süt 1 L", price: 55 };
  let camgozCalls = 0;
  let pageCalls = 0;
  const camgoz = async () => { camgozCalls += 1; return { ...found("Migros"), barcode: "869", credits: 3 }; };
  const pages = async () => { pageCalls += 1; return found(); };

  const first = await checkProduct({ db, product, now: NOW, lookup: priceLookup({ db, settings: CAMGOZ_ON, marketfiyatiSettings: SETTINGS, marketfiyati: mfFound, camgoz, pages }) });
  assert.equal(first.provider, "marketfiyati");
  assert.equal(first.status, "ok");
  assert.equal(camgozCalls, 0, "Market Fiyatı bulduysa Camgöz kredisi harcanmaz");
  assert.equal(pageCalls, 0);
  assert.equal(first.marketfiyatiMissAt, null);
  assert.ok(stateOf(db, MARKETFIYATI_STATE_ID).lastOkAt);
  assert.equal(stateOf(db, MARKETFIYATI_STATE_ID).consecutiveMisses, 0);

  // Market Fiyatı bulamadı → Camgöz
  const second = await checkProduct({ db, product: { _id: "p2", name: "Ülker Gofret 36 g", price: 20 }, now: NOW, lookup: priceLookup({ db, settings: CAMGOZ_ON, marketfiyatiSettings: SETTINGS, marketfiyati: mfNone, camgoz, pages }) });
  assert.equal(second.provider, "camgoz");
  assert.equal(camgozCalls, 1);
  assert.equal(second.marketfiyatiMissAt.getTime(), NOW.getTime());
  assert.equal(stateOf(db, MARKETFIYATI_STATE_ID).consecutiveMisses, 1);

  // 7 gün içinde Market Fiyatı'na yeniden sorulmaz; Camgöz kapalı → sayfalar
  let mfCalls = 0;
  const third = await checkProduct({ db, product: { _id: "p2", name: "Ülker Gofret 36 g", price: 20 }, now: new Date(NOW.getTime() + 86400000), lookup: priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: SETTINGS, marketfiyati: async () => { mfCalls += 1; return mfNone(); }, camgoz, pages }) });
  assert.equal(mfCalls, 0);
  assert.equal(third.provider, "pages");
  assert.equal(pageCalls, 1);
  // 8 gün sonra yeniden sorulur
  await checkProduct({ db, product: { _id: "p2", name: "Ülker Gofret 36 g", price: 20 }, now: new Date(NOW.getTime() + 8 * 86400000), lookup: priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: SETTINGS, marketfiyati: async () => { mfCalls += 1; return mfNone(); }, camgoz, pages }) });
  assert.equal(mfCalls, 1);

  // Market Fiyatı kapalı: doğrudan Camgöz
  const off = await priceLookup({ db, settings: CAMGOZ_ON, marketfiyatiSettings: { ...SETTINGS, enabled: false }, marketfiyati: async () => assert.fail("çağrılmamalı"), camgoz, pages })("x", { now: NOW });
  assert.equal(off.provider, "camgoz");

  // Sayfalar ayarlı değil ve API kaynakları bulamadı: hata değil "bulunamadı"
  const noPages = await priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: SETTINGS, marketfiyati: mfNone, pagesConfigured: false })("Devrek Erişte", { now: NOW });
  assert.equal(noPages.offers.length, 0);
  assert.equal(noPages.pagesSkipped, false);
  assert.match(noPages.note, /bulunamadı/);
  // Hiçbir kaynak yok → hata
  await assert.rejects(priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: { ...SETTINGS, enabled: false }, pagesConfigured: false })("x", { now: NOW }), /NO_PRICE_SOURCE/);
});

test("429 gelince yalnızca Market Fiyatı ara verir (15 dk, katlanarak 6 saate kadar); diğer kaynaklar sürer", async () => {
  const db = memoryDb();
  const product = { _id: "p1", name: "Pınar Süt 1 L", price: 55 };
  const limited = async () => { throw Object.assign(new Error("MARKETFIYATI_429"), { status: 429, detail: "Too Many Requests" }); };
  const pages = async () => found();
  let mfCalls = 0;
  const lookup = () => priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: SETTINGS, marketfiyati: async (...args) => { mfCalls += 1; return limited(...args); }, pages });

  const first = await checkProduct({ db, product, now: NOW, lookup: lookup() });
  assert.equal(first.provider, "pages", "Market Fiyatı hatası bekçiyi durdurmaz, sayfalara düşülür");
  assert.equal(first.status, "ok");
  let state = stateOf(db, MARKETFIYATI_STATE_ID);
  assert.equal(state.lastError.status, 429);
  assert.equal(state.lastError.detail, "Too Many Requests");
  assert.match(state.lastError.message, /istek sınırı/);
  assert.equal(new Date(state.pausedUntil).getTime(), NOW.getTime() + 15 * 60000);
  assert.equal(state.pauseMs, 15 * 60000);

  // Ara sürerken Market Fiyatı'na sorulmaz
  await checkProduct({ db, product, now: new Date(NOW.getTime() + 5 * 60000), lookup: lookup() });
  assert.equal(mfCalls, 1);

  // Ara bitti, yine 429: süre ikiye katlanır
  const later = new Date(NOW.getTime() + 16 * 60000);
  await checkProduct({ db, product, now: later, lookup: lookup() });
  state = stateOf(db, MARKETFIYATI_STATE_ID);
  assert.equal(mfCalls, 2);
  assert.equal(state.pauseMs, 30 * 60000);
  assert.equal(new Date(state.pausedUntil).getTime(), later.getTime() + 30 * 60000);

  // Başarılı yanıt arayı ve sayaçları sıfırlar
  const ok = new Date(later.getTime() + 31 * 60000);
  await checkProduct({ db, product, now: ok, lookup: priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: SETTINGS, marketfiyati: mfFound, pages }) });
  state = stateOf(db, MARKETFIYATI_STATE_ID);
  assert.equal(state.pausedUntil, undefined);
  assert.equal(state.consecutiveErrors, 0);
  assert.ok(state.lastOkAt);

  // 404 gibi hatalar ara verdirmez
  await checkProduct({ db, product, now: ok, lookup: priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: SETTINGS, marketfiyati: async () => { throw Object.assign(new Error("MARKETFIYATI_404"), { status: 404 }); }, pages }) });
  assert.equal(stateOf(db, MARKETFIYATI_STATE_ID).pausedUntil, undefined);

  // Market sayfaları ara verdiyse (işçi koydu) sayfalara bakılmaz, ürün sonraya kalır
  await recordProviderError(db, PAGES_STATE_ID, { now: ok, message: "x", pause: true, pauseMs: 3600000 });
  const skipped = await priceLookup({ db, settings: CAMGOZ_OFF, marketfiyatiSettings: SETTINGS, marketfiyati: mfNone, pages: async () => assert.fail("çağrılmamalı") })("x", { now: ok });
  assert.equal(skipped.pagesSkipped, true);
  assert.match(skipped.note, /ara verdiği için/);
});

test("sıra: sayfalar kapalıyken iki API kaynağının da yakın zamanda bulamadığı ürünler atlanır", () => {
  const now = NOW.getTime();
  const HOUR = 3600000;
  const products = [{ _id: "a", name: "A" }, { _id: "b", name: "B" }, { _id: "c", name: "C" }, { _id: "d", name: "D" }];
  const watches = [
    { _id: "a", v: 2, checkedAt: new Date(now - 400 * HOUR), marketfiyatiMissAt: new Date(now - 2 * HOUR), camgozMissAt: new Date(now - 2 * HOUR) }, // ikisi de bulamadı
    { _id: "b", v: 2, checkedAt: new Date(now - 400 * HOUR), marketfiyatiMissAt: new Date(now - 2 * HOUR) }, // Camgöz hâlâ deneyebilir
    { _id: "c", v: 2, checkedAt: new Date(now - 400 * HOUR), marketfiyatiMissAt: new Date(now - 8 * 24 * HOUR), camgozMissAt: new Date(now - 2 * HOUR) }, // MF süresi doldu
    { _id: "d", v: 2, checkedAt: new Date(now - 400 * HOUR), marketfiyatiMissAt: new Date(now - 2 * HOUR), camgozMissAt: new Date(now - 2 * HOUR), barcode: "869" }, // barkod var: Camgöz barkodla arar
  ];
  assert.deepEqual(selectDue({ products, watches, now, limit: 10, apiOnly: true }).map((p) => p._id), ["b", "c", "d"]);
  assert.deepEqual(selectDue({ products, watches, now, limit: 10, apiOnly: true, camgozEnabled: false }).map((p) => p._id), ["c"], "Camgöz kapalı: yalnızca Market Fiyatı'nın yeniden deneyebileceği ürün");
  assert.deepEqual(selectDue({ products, watches, now, limit: 10 }).map((p) => p._id), ["a", "b", "c", "d"], "sayfalar açıkken hepsi sırada");
  assert.deepEqual(selectDue({ products, watches, now, limit: 10, camgozOnly: true }).map((p) => p._id), ["b", "c", "d"], "eski ad (camgozOnly) da çalışır");
});
