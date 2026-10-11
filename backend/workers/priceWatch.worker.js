// Fiyat bekçisi işçisi: çalışma penceresinde (varsayılan 01:00–07:00 İstanbul) ürünleri tek tek kontrol eder.
// Market sayfası okunan her üründen sonra 20–30 sn beklenir ve günde en çok PRICE_WATCH_DAILY_LIMIT ürünün sayfasına bakılır.
// Camgöz (API) kontrolleri bu sınıra takılmaz; kredi bitene kadar devam eder. Ayrı bir PM2 süreci olarak çalışır.
import dotenv from "dotenv";
import mongoose from "mongoose";
import { setTimeout as sleep } from "node:timers/promises";
import { resolveCamgozSettings } from "../services/camgoz.service.js";
import {
  STATE_COLLECTION,
  WATCH_COLLECTION,
  camgozReady,
  checkProduct,
  priceLookup,
  findTopSellerIds,
  inWindow,
  istanbulClock,
  priceWatchSettings,
  randomDelayMs,
  selectDue,
} from "../services/priceWatch.service.js";

const IDLE_MS = 5 * 60000; // pencere dışında / günlük sınır dolunca kontrol aralığı
const PAUSE_MS = 60 * 60000; // arka arkaya hata gelirse bir saat ara
const MAX_ERRORS = 5; // SearXNG yanıt vermiyorsa
const MAX_NOT_FOUND = 25; // arama motoru engellendiyse genelde hiçbir şey bulamaz (yöresel ürünler de bulunamaz, o yüzden yüksek)
const TOP_REFRESH_MS = 6 * 3600000;
const QUEUE_SIZE = 25;
const API_DELAY_MS = 3000; // yalnızca Camgöz'e sorulduysa (site açılmadıysa) kısa bekleme

const PRODUCT_FIELDS = { name: 1, price: 1, isHidden: 1, isDiscounted: 1, discountedPrice: 1 };

export class PriceWatchWorker {
  constructor(db, { settings = priceWatchSettings(), lookup, now = () => new Date(), wait = sleep, log = console } = {}) {
    this.db = db;
    this.settings = settings;
    this.lookup = lookup;
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

  async refillQueue({ camgozOnly = false } = {}) {
    const now = this.now().getTime();
    if (now - this.topLoadedAt > TOP_REFRESH_MS) {
      this.topSellerIds = await findTopSellerIds(this.db, { top: this.settings.topSellers, now }).catch(() => this.topSellerIds);
      this.topLoadedAt = now;
    }
    const [products, watches] = await Promise.all([
      this.db.collection("products").find({ isHidden: { $ne: true } }, { projection: PRODUCT_FIELDS }).toArray(),
      this.db.collection(WATCH_COLLECTION).find({}, { projection: { checkedAt: 1, status: 1, ignored: 1, v: 1, barcode: 1, camgozMissAt: 1, pagesPending: 1 } }).toArray(),
    ]);
    this.queue = selectDue({ products, watches, topSellerIds: this.topSellerIds, now, limit: QUEUE_SIZE, camgozOnly });
    this.queueMode = camgozOnly ? "camgoz" : "all";
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
    if (state.pausedUntil && new Date(state.pausedUntil) > now) {
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: "paused" } });
      return Math.min(IDLE_MS, new Date(state.pausedUntil) - now);
    }
    if (!inWindow(istanbulClock(now).hour, this.settings.hours)) {
      this.queue = [];
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: "waiting" } });
      return IDLE_MS;
    }
    const pagesLeft = (state.pages || 0) < this.settings.dailyLimit;
    // Sayfa sınırı dolduysa Camgöz kredisi kaldığı sürece yalnızca Camgöz'le devam edilir
    const camgozOnly = !pagesLeft;
    if (camgozOnly && !(await camgozReady(this.db, await resolveCamgozSettings(this.db), { now }))) {
      this.queue = [];
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: "limit" } });
      return IDLE_MS;
    }
    if (this.queueMode !== (camgozOnly ? "camgoz" : "all")) this.queue = [];
    if (!this.queue.length) await this.refillQueue({ camgozOnly });
    const product = this.queue.shift();
    if (!product) {
      await this.state.updateOne({ _id: "main" }, { $set: { ...heartbeat, phase: "done" } });
      return IDLE_MS;
    }

    const lookup = this.lookup || priceLookup({ db: this.db, allowPages: pagesLeft });
    const result = await checkProduct({ db: this.db, product, now, lookup });
    // Arka arkaya hata / bulunamadı sayacı yalnızca market sayfası aramalarında işler (arama motoru engeli için)
    const errors = result.pagesUsed ? (result.status === "error" ? (state.errors || 0) + 1 : 0) : state.errors || 0;
    const notFound = result.pagesUsed ? (result.status === "not-found" ? (state.notFound || 0) + 1 : 0) : state.notFound || 0;
    const update = {
      ...heartbeat,
      phase: "running",
      lastRunAt: now,
      lastProduct: product.name,
      lastStatus: result.status,
      lastProvider: result.provider || null,
      errors,
      notFound,
    };
    if (result.status === "error") update.lastError = { at: now, message: result.error };
    if (errors >= MAX_ERRORS || notFound >= MAX_NOT_FOUND) {
      update.pausedUntil = new Date(now.getTime() + PAUSE_MS);
      update.errors = 0;
      update.notFound = 0;
      update.lastError = {
        at: now,
        message: errors >= MAX_ERRORS ? `Arka arkaya ${MAX_ERRORS} arama hatası; 1 saat ara verildi.` : `Arka arkaya ${MAX_NOT_FOUND} ürün bulunamadı; arama motoru engellenmiş olabilir, 1 saat ara verildi.`,
      };
      this.log.warn?.(`Fiyat bekçisi: ${update.lastError.message}`);
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
    const via = result.provider === "camgoz" ? `Camgöz, barkod ${result.barcode}` : "market sayfaları";
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
  if (!settings.searxngConfigured) console.warn("SEARXNG_URL tanımlı değil: fiyat bekçisi bekliyor.");

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
