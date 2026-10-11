import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRow,
  checkProduct,
  classifyPrice,
  coverage,
  inWindow,
  istanbulClock,
  listRows,
  parseDelay,
  parseHours,
  priceWatchSettings,
  randomDelayMs,
  selectDue,
} from "../services/priceWatch.service.js";
import { PriceWatchWorker } from "../workers/priceWatch.worker.js";

const HOUR = 3600000;
const NOW = new Date("2026-10-11T00:30:00Z").getTime(); // İstanbul 03:30

// Testler için küçük bir bellek içi koleksiyon (yalnızca kullanılan işlemler)
const match = (doc, filter = {}) =>
  Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date) && "$ne" in cond) return value !== cond.$ne;
    return String(value) === String(cond);
  });
const fakeDb = (seed = {}) => {
  const data = Object.fromEntries(Object.entries(seed).map(([name, docs]) => [name, docs.map((doc) => ({ ...doc }))]));
  const collection = (name) => {
    data[name] ||= [];
    const docs = data[name];
    return {
      docs,
      createIndex: async () => {},
      findOne: async (filter) => docs.find((doc) => match(doc, filter)) || null,
      find: (filter = {}) => ({ toArray: async () => docs.filter((doc) => match(doc, filter)) }),
      aggregate: () => ({ toArray: async () => [] }),
      updateOne: async (filter, update, { upsert } = {}) => {
        let doc = docs.find((item) => match(item, filter));
        if (!doc && upsert) {
          doc = { ...filter, ...(update.$setOnInsert || {}) };
          docs.push(doc);
        }
        if (!doc) return;
        Object.assign(doc, update.$set || {});
        for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
      },
    };
  };
  return { collection, data };
};

test("ayarlar: varsayılanlar ve hatalı değerler", () => {
  const settings = priceWatchSettings({ SEARXNG_URL: "http://127.0.0.1:8888" });
  assert.equal(settings.enabled, true);
  assert.deepEqual(settings.hours, { start: 1, end: 7 });
  assert.equal(settings.dailyLimit, 300);
  assert.deepEqual(settings.delay, { min: 20, max: 30 });
  assert.equal(settings.threshold, 0.2);
  assert.equal(priceWatchSettings({}).enabled, false, "SearXNG yoksa kapalı");
  assert.equal(priceWatchSettings({ SEARXNG_URL: "x", PRICE_WATCH_ENABLED: "false" }).enabled, false);
  assert.equal(priceWatchSettings({ SEARXNG_URL: "x", PRICE_WATCH_DAILY_LIMIT: "abc" }).dailyLimit, 300);
  assert.equal(priceWatchSettings({ SEARXNG_URL: "x", PRICE_WATCH_THRESHOLD: "15" }).threshold, 0.15);
  assert.deepEqual(parseHours("23-6"), { start: 23, end: 6 });
  assert.deepEqual(parseHours("5-5"), { start: 1, end: 7 });
  assert.deepEqual(parseDelay("2-3"), { min: 20, max: 30 }, "5 sn altı kabul edilmez");
});

test("gece penceresi ve İstanbul saati", () => {
  assert.deepEqual(istanbulClock(new Date(NOW)), { day: "2026-10-11", hour: 3 });
  assert.equal(istanbulClock(new Date("2026-10-10T21:30:00Z")).day, "2026-10-11");
  assert.equal(inWindow(1, { start: 1, end: 7 }), true);
  assert.equal(inWindow(7, { start: 1, end: 7 }), false);
  assert.equal(inWindow(23, { start: 23, end: 6 }), true);
  assert.equal(inWindow(3, { start: 23, end: 6 }), true);
  assert.equal(inWindow(12, { start: 23, end: 6 }), false);
  const delay = randomDelayMs({ min: 20, max: 30 }, () => 0.5);
  assert.equal(delay, 25000);
});

test("fiyat sınıflandırması %20 eşiğiyle", () => {
  assert.deepEqual(classifyPrice(130, 100), { level: "above", diff: 0.3 });
  assert.deepEqual(classifyPrice(70, 100), { level: "below", diff: -0.3 });
  assert.deepEqual(classifyPrice(115, 100), { level: "ok", diff: 0.15 });
  assert.equal(classifyPrice(120, 100).level, "ok", "tam eşik pahalı sayılmaz");
  assert.equal(classifyPrice(100, null).level, "unknown");
  assert.equal(classifyPrice(0, 50).level, "unknown");
});

test("sıra: hiç bakılmamış → vakti gelen çok satan → vakti gelen diğerleri", () => {
  const now = NOW;
  const products = [
    { _id: "a", name: "A" },
    { _id: "b", name: "B" },
    { _id: "c", name: "C" },
    { _id: "d", name: "D" },
    { _id: "e", name: "E", isHidden: true },
    { _id: "f", name: "F" },
    { _id: "g", name: "G" },
    { _id: "h", name: "H" },
  ];
  const v = 2;
  const watches = [
    { _id: "a", v, checkedAt: new Date(now - 30 * HOUR) }, // çok satan, 1 günden eski → vakti geldi
    { _id: "b", v, checkedAt: new Date(now - 10 * HOUR) }, // çok satan, yeni → bekler
    { _id: "c", v, checkedAt: new Date(now - 200 * HOUR) }, // normal, 1 haftadan eski
    { _id: "d", v, checkedAt: new Date(now - 100 * HOUR) }, // normal, yeni → bekler
    { _id: "f", ignored: true }, // yoksayıldı
    { _id: "g", v, checkedAt: new Date(now - 30 * HOUR), status: "error" }, // hata: ertesi gün tekrar
  ];
  const order = selectDue({ products, watches, topSellerIds: ["h", "a", "b"], now, limit: 10 }).map((p) => p._id);
  assert.deepEqual(order, ["h", "a", "c", "g"]);
  assert.deepEqual(selectDue({ products, watches, now, limit: 2 }).map((p) => p._id), ["h", "c"]);
  // Sayfa sınırı dolduysa (camgozOnly) Camgöz'de bulunamamış ürünler atlanır; sayfası bekleyen ürün sınır yokken sıraya girer
  watches.push({ _id: "h", v, checkedAt: new Date(now - HOUR), camgozMissAt: new Date(now - HOUR), pagesPending: true });
  assert.ok(!selectDue({ products, watches, now, limit: 10, camgozOnly: true }).some((p) => p._id === "h"));
  assert.ok(selectDue({ products, watches, now, limit: 10 }).some((p) => p._id === "h"), "pagesPending: süresi dolmadan da sıraya girer");
  watches.pop();

  // Eski sürüm (arama özetinden) kayıt hiç bakılmamış sayılır
  watches[3] = { _id: "d", checkedAt: new Date(now - HOUR) };
  assert.deepEqual(selectDue({ products, watches, now, limit: 2 }).map((p) => p._id), ["d", "h"]);
});

test("ürün kontrolü: bulunan, bulunamayan ve hata", async () => {
  const db = fakeDb();
  const product = { _id: "p1", name: "Pınar Süt 1 L", price: 45 };
  const offers = [{ price: 38, source: "A", pageUrl: "https://a", title: "t" }, { price: 40, source: "B", pageUrl: "https://b", title: "t" }];
  let asked = "";
  const found = await checkProduct({ db, product, now: new Date(NOW), lookup: async (q) => { asked = q; return { offers, min: 38, max: 40, median: 40, confidence: "high" }; } });
  assert.equal(asked, "Pınar Süt 1 L");
  assert.equal(found.status, "ok");
  assert.equal(found.median, 40);
  assert.equal(found.offerCount, 2);
  assert.equal(db.data.price_watch[0].ignored, false);

  // Arama hatası: eski piyasa bilgisi korunur
  const failed = await checkProduct({ db, product, now: new Date(NOW + 1000), lookup: async () => { throw new Error("SEARXNG_502"); } });
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "arama motoru yanıt vermedi (HTTP 502)");
  assert.equal(failed.median, 40);
  assert.equal(db.data.price_watch[0].median, 40);

  // Özel arama sözcüğü kullanılır; sonuç yoksa "bulunamadı"
  db.data.price_watch[0].customQuery = "pinar sut 1lt";
  const missing = await checkProduct({ db, product, lookup: async (q) => { asked = q; return { offers: [] }; } });
  assert.equal(asked, "pinar sut 1lt");
  assert.equal(missing.status, "not-found");
  assert.equal(missing.median, null);
});

test("panel satırları: sınıf, emin değil, sayım, arama ve sayfalama", () => {
  const now = NOW;
  const checkedAt = new Date(now - HOUR);
  const sure = { v: 2, confidence: "high", checkedAt, status: "ok", offerCount: 2 };
  const rows = [
    buildRow({ _id: "1", name: "Çikolatalı Gofret", price: 30 }, { ...sure, median: 20 }, { now }),
    buildRow({ _id: "2", name: "Kola 1 L", price: 52 }, { ...sure, median: 40 }, { now }),
    buildRow({ _id: "3", name: "Su", price: 5 }, { ...sure, median: 10 }, { now }),
    buildRow({ _id: "4", name: "Ayran", price: 32 }, { ...sure, median: 30 }, { now }),
    buildRow({ _id: "5", name: "Tuz", price: 12 }, { v: 2, status: "not-found", checkedAt, note: "Bulunan sayfalar bu ürünle eşleşmedi." }, { now }),
    buildRow({ _id: "6", name: "Şeker", price: 50 }, null, { now }),
    buildRow({ _id: "7", name: "Çay", price: 99 }, { ...sure, ignored: true, median: 10 }, { now }),
    buildRow({ _id: "8", name: "Un", price: 40 }, { v: 2, status: "error", error: "SEARXNG_502", checkedAt }, { now }),
    buildRow({ _id: "9", name: "Eti Çikolata", price: 75 }, { ...sure, confidence: "low", note: "ürün adında gramaj yok", median: 30 }, { now }),
    buildRow({ _id: "10", name: "Cheetos 40 g", price: 35 }, { ...sure, median: 11 }, { now }),
    buildRow({ _id: "11", name: "Eski kayıt", price: 35 }, { checkedAt, status: "ok", median: 11, customQuery: "eski 1 kg" }, { now }),
  ];
  assert.deepEqual(rows.map((row) => row.filter), ["above", "above", "below", "ok", "missing", "unchecked", "ignored", "missing", "unsure", "unsure", "unchecked"]);
  assert.equal(rows[7].error, "SEARXNG_502");
  assert.equal(rows[8].note, "ürün adında gramaj yok");
  assert.match(rows[9].note, /Fark çok büyük/);
  assert.equal(rows[10].median, null, "eski sürüm piyasa bilgisi gösterilmez");
  assert.equal(rows[10].customQuery, "eski 1 kg", "yönetici ayarı korunur");

  const above = listRows(rows, { filter: "above" });
  assert.deepEqual(above.counts, { above: 2, below: 1, unsure: 2, missing: 2, ok: 1, unchecked: 2, ignored: 1 });
  assert.deepEqual(above.items.map((row) => row.id), ["1", "2"], "en pahalı önce");
  assert.deepEqual(listRows(rows, { filter: "above", q: "cikolata" }).items.map((row) => row.id), ["1"], "Türkçe harf farkı yok sayılır");
  assert.equal(listRows(rows, { filter: "bilinmeyen" }).filter, "above");

  const many = Array.from({ length: 65 }, (_, i) => buildRow({ _id: String(i), name: `Ürün ${i}`, price: 10 }, null, { now }));
  const page3 = listRows(many, { filter: "unchecked", page: 9 });
  assert.equal(page3.pages, 3);
  assert.equal(page3.page, 3);
  assert.equal(page3.items.length, 5);

  assert.deepEqual(coverage(rows, now), { tracked: 10, fresh: 8, percent: 80 });
});

const workerDb = () =>
  fakeDb({
    products: [
      { _id: "p1", name: "Ürün 1", price: 10 },
      { _id: "p2", name: "Ürün 2", price: 20 },
    ],
  });

test("işçi: pencere dışında ve günlük sınırda arama yapmaz", async () => {
  const db = workerDb();
  let searches = 0;
  const search = async () => { searches += 1; return { offers: [], pagesUsed: true }; };
  const settings = { ...priceWatchSettings({ SEARXNG_URL: "x" }), dailyLimit: 1 };
  const noon = new PriceWatchWorker(db, { settings, lookup: search, now: () => new Date("2026-10-11T09:00:00Z") });
  await noon.initialize();
  await noon.step();
  assert.equal(searches, 0);
  assert.equal(db.data.price_watch_state[0].phase, "waiting");

  const night = new PriceWatchWorker(db, { settings, lookup: search, now: () => new Date(NOW) });
  const delay = await night.step();
  assert.ok(delay >= 20000 && delay <= 30000);
  await night.step();
  assert.equal(searches, 1, "günlük sınır 1");
  assert.equal(db.data.price_watch_state[0].phase, "limit");
  assert.equal(db.data.price_watch_state[0].pages, 1);
  assert.equal(db.data.price_watch_state[0].checks, 1);
});

test("işçi: sayfa sınırı dolunca Camgöz kredisi varsa yalnızca Camgöz'le devam eder", async () => {
  const db = fakeDb({ products: Array.from({ length: 4 }, (_, i) => ({ _id: `p${i}`, name: `Ürün ${i}`, price: 10 })) });
  const previous = process.env.JOJAPI_API_KEY;
  process.env.JOJAPI_API_KEY = "test-key";
  try {
    const calls = [];
    // İlk ürün market sayfasından (sayfa sınırını doldurur), sonrakiler yalnızca Camgöz'den
    const lookup = async (query) => {
      calls.push(query);
      return calls.length === 1 ? { offers: [], pagesUsed: true } : { offers: [{ price: 9, source: "A101" }], median: 9, min: 9, max: 9, confidence: "high", provider: "camgoz", pagesUsed: false };
    };
    const settings = { ...priceWatchSettings({ SEARXNG_URL: "x" }), dailyLimit: 1 };
    const worker = new PriceWatchWorker(db, { settings, lookup, now: () => new Date(NOW) });
    await worker.initialize();
    assert.ok((await worker.step()) >= 20000, "sayfa okunduysa uzun bekleme");
    assert.equal(await worker.step(), 3000, "yalnızca Camgöz'e sorulduysa kısa bekleme");
    await worker.step();
    const state = db.data.price_watch_state.find((doc) => doc._id === "main");
    assert.equal(calls.length, 3);
    assert.equal(state.pages, 1);
    assert.equal(state.checks, 3);
    assert.equal(state.phase, "running");

    // Kredi bitince durur
    db.data.price_watch_state.push({ _id: "camgoz", month: "2026-10", used: 500 });
    await worker.step();
    assert.equal(calls.length, 3);
    assert.equal(state.phase, "limit");
  } finally {
    if (previous === undefined) delete process.env.JOJAPI_API_KEY;
    else process.env.JOJAPI_API_KEY = previous;
  }
});

test("işçi: arka arkaya hatalarda bir saat ara verir, yeni günde sayaç sıfırlanır", async () => {
  const db = fakeDb({ products: Array.from({ length: 8 }, (_, i) => ({ _id: `p${i}`, name: `Ürün ${i}`, price: 10 })) });
  let clock = NOW;
  const settings = priceWatchSettings({ SEARXNG_URL: "x" });
  const worker = new PriceWatchWorker(db, { settings, lookup: async () => { throw new Error("SEARXNG_503"); }, now: () => new Date(clock), log: {} });
  await worker.initialize();
  for (let i = 0; i < 5; i += 1) await worker.step();
  const state = db.data.price_watch_state[0];
  assert.ok(new Date(state.pausedUntil).getTime() === NOW + HOUR);
  assert.match(state.lastError.message, /1 saat/);
  await worker.step();
  assert.equal(state.phase, "paused");
  assert.equal(state.checks, 5);

  clock = new Date("2026-10-11T22:30:00Z").getTime(); // ertesi gün 01:30
  await worker.step();
  assert.equal(state.day, "2026-10-12");
  assert.equal(state.checks, 1);
});
