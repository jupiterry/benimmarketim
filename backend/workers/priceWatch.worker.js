// Fiyat bekçisi işçisi: çalışma penceresinde (varsayılan 01:00–07:00 İstanbul) ürünleri tek tek kontrol eder.
// Kaynak sırası: Market Fiyatı (ücretsiz) → Camgöz (kredi) → market sayfaları (SearXNG). Her kaynağın kendi "ara" durumu vardır;
// biri engellenir/sınıra takılırsa yalnızca o kaynak bekler, diğerleriyle devam edilir.
// Market sayfası okunan her üründen sonra 20–30 sn beklenir ve günde en çok PRICE_WATCH_DAILY_LIMIT ürünün sayfasına bakılır.
// API kaynakları bu sınıra takılmaz (Market Fiyatı istekler arası 2,5 sn bekler; Camgöz kredi bütçesine bakar). Ayrı bir PM2 süreci olarak çalışır.
import dotenv from "dotenv";
import mongoose from "mongoose";
import { setTimeout as sleep } from "node:timers/promises";
import { resolveCamgozSettings } from "../services/camgoz.service.js";
import { MARKETFIYATI_STATE_ID, resolveMarketfiyatiSettings } from "../services/marketfiyati.service.js";
import {
  CAMGOZ_STATE_ID,
  PAGES_STATE_ID,
  STATE_COLLECTION,
  WATCH_COLLECTION,
  camgozReady,
  checkProduct,
  priceLookup,
  findTopSellerIds,
  inWindow,
  istanbulClock,
  priceWatchSettings,
  providerPausedUntil,
  randomDelayMs,
  recordProviderError,
  selectDue,
} from "../services/priceWatch.service.js";

const IDLE_MS = 5 * 60000; // pencere dışında / günlük sınır dolunca kontrol aralığı
const PAUSE_MS = 60 * 60000; // market sayfalarında arka arkaya hata gelirse o kaynak bir saat bekler
const MAX_ERRORS = 5; // SearXNG yanıt vermiyorsa
const MAX_NOT_FOUND = 25; // SearXNG sonuç vermiyorsa (arama motorları engellemiş olabilir) genelde hiçbir sayfa bulunamaz
const TOP_REFRESH_MS = 6 * 3600000;
const QUEUE_SIZE = 25;
const API_DELAY_MS = 3000; // yalnızca API kaynaklarına sorulduysa (site açılmadıysa) kısa bekleme

const PRODUCT_FIELDS = { name: 1, price: 1, isHidden: 1, isDiscounted: 1, discountedPrice: 1 };

export class PriceWatchWorker {
  constructor(db, { settings = priceWatchSettings(), lookup, camgozSettings, marketfiyatiSettings, now = () => new Date(), wait = sleep, log = console } = {}) {
    this.db = db;
    this.settings = settings;
    this.lookup = lookup;
    // Testler için sabit kaynak ayarları; verilmezse her adımda .env + panel ayarları okunur
    this.camgozSettings = camgozSettings;
    this.marketfiyatiSettings = marketfiyatiSettings;
    this.now = now;
    this.wait = wait;
    this.log = log;
    this.state = db.collection(STATE_COLLECTION);
    this.queue = [];
    this.queueMode = null;
    this.topSellerIds = [];
    this.topLoadedAt = 0;
    this.stopped = false;
  }

  async initialize() {
    await this.db.collection(WATCH_COLLECTION).createIndex({ checkedAt: 1 });
    await this.state.updateOne({ _id: "main" }, { $setOnInsert: { day: "", checks: 0, pages: 0, startedAt: this.now() } }, { upsert: true });
  }

  async readState() {
    const state = (await this.state.findOne({ _id: "main" })) || {};
    const { day } = istanbulClock(this.now());
    if (state.day !== day) {
      // Yeni gün: sayaçlar sıfırlanır
      await this.state.updateOne({ _id: "main" }, { $set: { day, checks: 0, pages: 0 } });
      return { ...state, day, checks: 0, pages: 0 };
    }
    return state;
  }

  async refillQueue({ camgozOnly = false, apiOnly = camgozOnly, camgozEnabled = true, marketfiyatiEnabled = true, mode = apiOnly ? "api" : "all" } = {}) {
    const now = this.now().getTime();
    if (now - this.topLoadedAt > TOP_REFRESH_MS) {
      this.topSellerIds = await findTopSellerIds(this.db, { top: this.settings.topSellers, now }).catch(() => this.topSellerIds);
      this.topLoadedAt = now;
    }
    const [products, watches] = await Promise.all([
      this.db.collection("products").find({ isHidden: { $ne: true } }, { projection: PRODUCT_FIELDS }).toArray(),
      this.db.collection(WATCH_COLLECTION).find({}, { projection: { checkedAt: 1, status: 1, ignored: 1, v: 1, barcode: 1, camgozMissAt: 1, marketfiyatiMissAt: 1, pagesPending: 1 } }).toArray(),
    ]);
    this.queue = selectDue({ products, watches, topSellerIds: this.topSellerIds, now, limit: QUEUE_SIZE, apiOnly, camgozEnabled, marketfiyatiEnabled });
    this.queueMode = mode;
  }

  /** Üç kaynağın bu an kullanılabilirliği (ayar, ara, kredi, günlük sayfa sınırı) */
  async providerAvailability(state, now) {
    const states = this.state;
    const [camgoz, marketfiyati, camgozState, mfState, pagesState] = await Promise.all([
      this.camgozSettings || resolveCamgozSettings(this.db),
      this.marketfiyatiSettings || resolveMarketfiyatiSettings(this.db),
      states.findOne({ _id: CAMGOZ_STATE_ID }),
      states.findOne({ _id: MARKETFIYATI_STATE_ID }),
      states.findOne({ _id: PAGES_STATE_ID }),
    ]);
    const pagesPaused = providerPausedUntil(pagesState, now);
    const marketfiyatiPaused = providerPausedUntil(mfState, now);
    const camgozPaused = providerPausedUntil(camgozState, now);
    const pagesLeft = (state.pages || 0) < this.settings.dailyLimit;
    return {
      camgoz,
      marketfiyati,
      pages: this.settings.searxngConfigured && pagesLeft && !pagesPaused,
      marketfiyatiOk: marketfiyati.enabled && !marketfiyatiPaused,
      camgozOk: await camgozReady(this.db, camgoz, { now }),
      pauses: [pagesPaused, marketfiyatiPaused, camgozPaused].filter(Boolean),
    };
  }

  /**
   * Bir adım: uygunsa tek ürünü kontrol eder. Bekleme süresini (ms) döndürür.
   * Testlerde doğrudan çağrılır; run() bunu döngüde çalıştırır.
   */
  async step() {
    const now = this.now();
    const heartbeat = { heartbeatAt: now };
    if (!this.settings.enabled) {
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: "disabled" } });
      return IDLE_MS;
    }
    const state = await this.readState();
    if (!inWindow(istanbulClock(now).hour, this.settings.hours)) {
      this.queue = [];
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: "waiting" } });
      return IDLE_MS;
    }
    const avail = await this.providerAvailability(state, now);
    if (!avail.pages && !avail.marketfiyatiOk && !avail.camgozOk) {
      // Hiçbir kaynak kullanılamıyor: ara veren kaynak varsa en erken biteni beklenir, yoksa günlük sınır/kredi dolmuştur
      this.queue = [];
      const soonest = avail.pauses.length ? new Date(Math.min(...avail.pauses.map((date) => date.getTime()))) : null;
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: soonest ? "paused" : "limit", pausedUntil: soonest } });
      return soonest ? Math.max(1000, Math.min(IDLE_MS, soonest - now)) : IDLE_MS;
    }
    const apiOnly = !avail.pages;
    const mode = apiOnly ? `api:${avail.marketfiyatiOk ? "m" : ""}${avail.camgozOk ? "c" : ""}` : "all";
    if (this.queueMode !== mode) this.queue = [];
    if (!this.queue.length) await this.refillQueue({ apiOnly, camgozEnabled: avail.camgozOk, marketfiyatiEnabled: avail.marketfiyatiOk, mode });
    const product = this.queue.shift();
    if (!product) {
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: "done", pausedUntil: null } });
      return IDLE_MS;
    }

    const lookup = this.lookup || priceLookup({
      db: this.db,
      allowPages: avail.pages,
      pagesConfigured: this.settings.searxngConfigured,
      settings: avail.camgoz,
      marketfiyatiSettings: avail.marketfiyati,
    });
    const result = await checkProduct({ db: this.db, product, now, lookup });
    // Arka arkaya hata / bulunamadı sayacı yalnızca market sayfası aramalarında işler (SearXNG engeli için); API kaynakları kendi durumunu tutar
    const errors = result.pagesUsed ? (result.status === "error" ? (state.errors || 0) + 1 : 0) : state.errors || 0;
    const notFound = result.pagesUsed ? (result.status === "not-found" ? (state.notFound || 0) + 1 : 0) : state.notFound || 0;
    const update = {
      ...heartbeat,
      phase: "running",
      pausedUntil: null,
      lastRunAt: now,
      lastProduct: product.name,
      lastStatus: result.status,
      lastProvider: result.provider || null,
      errors,
      notFound,
    };
    if (result.status === "error") update.lastError = { at: now, message: result.error };
    if (errors >= MAX_ERRORS || notFound >= MAX_NOT_FOUND) {
      // Yalnızca market sayfaları kaynağı bir saat bekler; Market Fiyatı ve Camgöz çalışmaya devam eder
      update.errors = 0;
      update.notFound = 0;
      const message = errors >= MAX_ERRORS
        ? `Market sayfaları: arka arkaya ${MAX_ERRORS} arama hatası (${result.error || "bilinmeyen hata"}); bu kaynak 1 saat denenmeyecek, diğer kaynaklar sürüyor.`
        : `Market sayfaları: arka arkaya ${MAX_NOT_FOUND} üründe ürün sayfası bulunamadı (SearXNG sonuç vermiyor olabilir); bu kaynak 1 saat denenmeyecek, diğer kaynaklar sürüyor.`;
      await recordProviderError(this.db, PAGES_STATE_ID, { now, message, pause: true, pauseMs: PAUSE_MS });
      update.lastError = { at: now, message };
      this.log.warn?.(`Fiyat bekçisi: ${message}`);
    }
    await this.state.updateOne({ _id: "main" }, { $set: update, $inc: { checks: 1, pages: result.pagesUsed ? 1 : 0, total: 1 } });
    return result.pagesUsed ? randomDelayMs(this.settings.delay) : API_DELAY_MS;
  }

  async run() {
    await this.initialize();
    while (!this.stopped) {
      let delay = IDLE_MS;
      try {
        delay = await this.step();
      } catch (error) {
        this.log.error?.("Fiyat bekçisi adımı başarısız:", error?.message || error);
      }
      await this.wait(delay);
    }
  }
}

/** Kurulumu denemek için: pencereye ve günlük sınıra bakmadan `count` ürünü kontrol eder, sonuçları yazdırır. */
export const runTrial = async (db, { count = 3, settings = priceWatchSettings(), log = console } = {}) => {
  const worker = new PriceWatchWorker(db, { settings, log });
  await worker.initialize();
  await worker.refillQueue();
  const results = [];
  for (const product of worker.queue.slice(0, count)) {
    const result = await checkProduct({ db, product });
    results.push(result);
    const via = result.provider === "marketfiyati" ? `Market Fiyatı${result.barcode ? `, barkod ${result.barcode}` : ""}` : result.provider === "camgoz" ? `Camgöz, barkod ${result.barcode}` : "market sayfaları";
    const market = result.status === "ok"
      ? `piyasa ₺${result.median} (${via}) — ${result.offers.map((offer) => `${offer.source} ₺${offer.price}`).join(", ")}${result.confidence === "low" ? ` (emin değil: ${result.note})` : ""}`
      : result.status === "error" ? `hata: ${result.error}` : `bulunamadı (${result.note})`;
    log.log(`• ${product.name} — bizim ₺${product.price}, ${market}`);
    for (const item of result.rejected || []) log.log(`    elendi: ${item.source} ${item.title ? `"${item.title}" ` : ""}— ${item.reason}`);
    if (results.length < count) await sleep(randomDelayMs({ min: 5, max: 8 }));
  }
  return results;
};

export const startPriceWatchWorker = async ({ trial = 0 } = {}) => {
  dotenv.config();
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  const settings = priceWatchSettings();
  if (!settings.searxngConfigured) console.warn("SEARXNG_URL tanımlı değil: market sayfaları kaynağı kapalı; Market Fiyatı (ve varsa Camgöz) kullanılır.");

  if (trial) {
    const results = await runTrial(db, { count: trial, settings });
    await mongoose.disconnect();
    return results;
  }

  const { start, end } = settings.hours;
  console.log(`Fiyat bekçisi hazır: ${String(start).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00 (İstanbul), günde en çok ${settings.dailyLimit} ürün, aramalar arası ${settings.delay.min}–${settings.delay.max} sn.`);
  const worker = new PriceWatchWorker(db, { settings });
  await worker.run();
  return null;
};
