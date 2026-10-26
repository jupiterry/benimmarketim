import mongoose from "mongoose";
import Product from "../models/product.model.js";
import {
  KEY_COLLECTION,
  KEY_DOC_ID,
  cleanApiKey,
  encryptApiKey,
  resolveCamgozSettings,
  testCamgozKey,
  validApiKeyFormat,
} from "../services/camgoz.service.js";
import {
  MARKETFIYATI_CONFIG_ID,
  MARKETFIYATI_STATE_ID,
  MARKETFIYATI_TERMS_URL,
  describeMarketfiyatiError,
  findMarketfiyatiPrices,
  resolveMarketfiyatiSettings,
  validateMarketfiyatiConfig,
} from "../services/marketfiyati.service.js";
import { pickProductPages } from "../services/marketPrice.service.js";
import { searchSearxngWeb } from "../services/productAssist.service.js";
import {
  PAGES_STATE_ID,
  STATE_COLLECTION,
  WATCH_COLLECTION,
  buildRow,
  camgozAllowance,
  checkProduct,
  coverage,
  describeSearchError,
  istanbulClock,
  listRows,
  CAMGOZ_STATE_ID,
  priceLookup,
  priceWatchSettings,
  providerSummary,
  resetCamgozUsage,
} from "../services/priceWatch.service.js";

const PRODUCT_FIELDS = "name price isDiscounted discountedPrice image thumbnail category isOutOfStock isHidden";
const MANUAL_CHECK_GAP_MS = 20000; // aynı ürün için elle kontrol en az 20 sn arayla
const WORKER_ALIVE_MS = 15 * 60000;

const watches = () => mongoose.connection.db.collection(WATCH_COLLECTION);

const loadRows = async (settings) => {
  const [products, records] = await Promise.all([
    Product.find({ isHidden: { $ne: true } }).select(PRODUCT_FIELDS).lean(),
    watches().find({}, { projection: { createdAt: 0 } }).toArray(),
  ]);
  const byId = new Map(records.map((record) => [String(record._id), record]));
  const now = Date.now();
  return products.map((product) => buildRow(product, byId.get(String(product._id)), { threshold: settings.threshold, now }));
};

// Anahtarın kendisi hiçbir yanıtta dönmez; yalnızca kaynağı ve son 4 karakteri gösterilir
const camgozStatus = (state, settings) => {
  const { day } = istanbulClock();
  const month = day.slice(0, 7);
  const used = state?.month === month ? state.used || 0 : 0;
  const recentCreditError = /kredi/i.test(state?.lastError?.message || "") && state?.pausedUntil && new Date(state.pausedUntil) > new Date();
  return {
    enabled: settings.enabled,
    source: settings.source,
    last4: settings.last4 || "",
    setAt: settings.setAt || null,
    keyError: settings.keyError || "",
    pacing: settings.pacing,
    exhausted: settings.enabled && (used + 3 > settings.monthlyCredits || Boolean(recentCreditError)),
    encryptionReady: Boolean(process.env.ACCESS_TOKEN_SECRET),
    monthlyCredits: settings.monthlyCredits,
    used,
    usedToday: state?.day === day ? state.usedToday || 0 : 0,
    lastError: state?.lastError || null,
    pausedUntil: state?.pausedUntil && new Date(state.pausedUntil) > new Date() ? state.pausedUntil : null,
  };
};

// Market Fiyatı ayarları + durum (anahtar yok; hepsi gösterilebilir)
const marketfiyatiStatus = (state, settings) => ({
  ...providerSummary(state),
  enabled: settings.enabled,
  source: settings.source,
  latitude: settings.latitude,
  longitude: settings.longitude,
  distanceKm: settings.distanceKm,
  minIntervalMs: settings.minIntervalMs,
  maxAgeDays: settings.maxAgeDays,
  timeoutMs: settings.timeoutMs,
  chains: settings.chains,
  updatedAt: settings.updatedAt || null,
  termsUrl: MARKETFIYATI_TERMS_URL,
});

const providerStatusOf = ({ enabled, summary, now = Date.now() }) => {
  if (!enabled) return "disabled";
  if (summary.pausedUntil) return "paused";
  const lastOk = summary.lastOkAt ? new Date(summary.lastOkAt).getTime() : 0;
  const lastErr = summary.lastErrorAt ? new Date(summary.lastErrorAt).getTime() : 0;
  if (lastErr && lastErr > lastOk && now - lastErr < 86400000) return "error";
  if (lastOk) return "ok";
  return "idle";
};

/** Panelde "Kaynaklar" satırı: her kaynağın durumu, son başarı/hata ve ne zaman yeniden deneneceği */
const providersStatus = ({ settings, camgoz, camgozState, marketfiyati, mfState, pagesState }) => {
  const now = new Date();
  const mf = providerSummary(mfState, { now });
  const cg = providerSummary(camgozState, { now });
  const pg = providerSummary(pagesState, { now });
  const camgozAllow = camgoz.enabled ? camgozAllowance(camgozState, { monthly: camgoz.monthlyCredits, estimate: 3, paced: camgoz.pacing === "even", now }) : { ok: false, reason: "disabled" };
  return [
    {
      id: "marketfiyati",
      label: "Market Fiyatı",
      detail: "ücretsiz, TÜBİTAK BİLGEM'in halka açık verisi",
      free: true,
      enabled: marketfiyati.enabled,
      status: providerStatusOf({ enabled: marketfiyati.enabled, summary: mf }),
      ...mf,
      nextRetryAt: mf.pausedUntil,
      info: `${marketfiyati.distanceKm} km · ${marketfiyati.latitude.toFixed(4)}, ${marketfiyati.longitude.toFixed(4)} · son ${marketfiyati.maxAgeDays} gün`,
    },
    {
      id: "camgoz",
      label: "Camgöz",
      detail: "kredi; yalnızca Market Fiyatı bulamazsa",
      free: false,
      enabled: camgoz.enabled,
      status: !camgoz.enabled ? "disabled" : cg.pausedUntil ? "paused" : !camgozAllow.ok ? "limit" : providerStatusOf({ enabled: true, summary: cg }),
      ...cg,
      nextRetryAt: cg.pausedUntil,
      limitReason: camgozAllow.ok ? null : camgozAllow.reason,
      info: camgoz.enabled ? `${camgoz.monthlyCredits} kredi/ay · ${camgoz.pacing === "even" ? "eşit dağıtım" : "bitene kadar"}` : "anahtar yok",
    },
    {
      id: "pages",
      label: "Market sayfaları",
      detail: "Şok, Trendyol, Hepsiburada sayfaları (SearXNG ile bulunur)",
      free: true,
      enabled: settings.searxngConfigured,
      status: providerStatusOf({ enabled: settings.searxngConfigured, summary: pg }),
      ...pg,
      nextRetryAt: pg.pausedUntil,
      info: settings.searxngConfigured ? `günde ${settings.dailyLimit} sayfa` : "SEARXNG_URL ayarlı değil",
    },
  ];
};

const workerStatus = (state, settings, camgozState, camgoz, extra = {}) => {
  const today = istanbulClock().day;
  const alive = Boolean(state?.heartbeatAt && Date.now() - new Date(state.heartbeatAt).getTime() < WORKER_ALIVE_MS);
  return {
    ...extra,
    alive,
    phase: alive ? state.phase || "waiting" : "offline",
    today: state?.day === today ? state.checks || 0 : 0,
    pagesToday: state?.day === today ? state.pages || 0 : 0,
    total: state?.total || 0,
    lastRunAt: state?.lastRunAt || null,
    lastProduct: state?.lastProduct || "",
    lastError: state?.lastError || null,
    pausedUntil: state?.pausedUntil && new Date(state.pausedUntil) > new Date() ? state.pausedUntil : null,
    settings: {
      enabled: settings.enabled,
      searxngConfigured: settings.searxngConfigured,
      hours: settings.hours,
      dailyLimit: settings.dailyLimit,
      threshold: Math.round(settings.threshold * 100),
      delay: settings.delay,
    },
    camgoz: camgozStatus(camgozState, camgoz),
  };
};

/** GET /api/price-watch?filter=above|below|missing|ok|unchecked|ignored&q=&page= */
export const getPriceWatch = async (req, res) => {
  try {
    const settings = priceWatchSettings();
    const states = mongoose.connection.db.collection(STATE_COLLECTION);
    const [rows, state, camgozState, camgoz, marketfiyati, mfState, pagesState] = await Promise.all([
      loadRows(settings),
      states.findOne({ _id: "main" }),
      states.findOne({ _id: CAMGOZ_STATE_ID }),
      resolveCamgozSettings(mongoose.connection.db),
      resolveMarketfiyatiSettings(mongoose.connection.db),
      states.findOne({ _id: MARKETFIYATI_STATE_ID }),
      states.findOne({ _id: PAGES_STATE_ID }),
    ]);
    const list = listRows(rows, {
      filter: String(req.query.filter || "above"),
      q: String(req.query.q || "").slice(0, 80),
      page: req.query.page,
    });
    const extra = {
      marketfiyati: marketfiyatiStatus(mfState, marketfiyati),
      providers: providersStatus({ settings, camgoz, camgozState, marketfiyati, mfState, pagesState }),
    };
    res.json({ success: true, ...list, coverage: coverage(rows), worker: workerStatus(state, settings, camgozState, camgoz, extra) });
  } catch (error) {
    console.error("Fiyat bekçisi listesi alınamadı:", error.message);
    res.status(500).json({ success: false, message: "Fiyat bekçisi listesi alınamadı." });
  }
};

const findProduct = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Geçersiz ürün." });
    return null;
  }
  const product = await Product.findById(req.params.id).select(PRODUCT_FIELDS).lean();
  if (!product) res.status(404).json({ success: false, message: "Ürün bulunamadı." });
  return product;
};

/** POST /api/price-watch/:id/check → ürünü hemen kontrol eder (Camgöz, gerekirse market sayfaları) */
export const checkNow = async (req, res) => {
  try {
    const settings = priceWatchSettings();
    const db = mongoose.connection.db;
    const [camgoz, marketfiyati] = await Promise.all([resolveCamgozSettings(db), resolveMarketfiyatiSettings(db)]);
    if (!settings.searxngConfigured && !camgoz.enabled && !marketfiyati.enabled) {
      return res.status(503).json({ success: false, message: "Hiçbir fiyat kaynağı açık değil. Market Fiyatı'nı açın ya da .env dosyasına JOJAPI_API_KEY (Camgöz) / SEARXNG_URL ekleyin." });
    }
    const product = await findProduct(req, res);
    if (!product) return undefined;
    const existing = await watches().findOne({ _id: product._id }, { projection: { checkedAt: 1 } });
    if (existing?.checkedAt && Date.now() - new Date(existing.checkedAt).getTime() < MANUAL_CHECK_GAP_MS) {
      return res.status(429).json({ success: false, message: "Bu ürün az önce kontrol edildi, birkaç saniye sonra tekrar deneyin." });
    }
    const record = await checkProduct({ db, product, lookup: priceLookup({ db, manual: true, settings: camgoz, marketfiyatiSettings: marketfiyati }) });
    const row = buildRow(product, record, { threshold: settings.threshold });
    if (record.status === "error") {
      return res.status(502).json({ success: false, message: `Arama yapılamadı: ${record.error}`, row });
    }
    return res.json({ success: true, row });
  } catch (error) {
    console.error("Fiyat bekçisi kontrolü başarısız:", error.message);
    return res.status(500).json({ success: false, message: "Kontrol yapılamadı." });
  }
};

/** PATCH /api/price-watch/:id  { ignored?: boolean, customQuery?: string, barcode?: string } */
export const updateWatch = async (req, res) => {
  try {
    const product = await findProduct(req, res);
    if (!product) return undefined;
    const set = {};
    if (typeof req.body?.ignored === "boolean") set.ignored = req.body.ignored;
    if (typeof req.body?.customQuery === "string") {
      const customQuery = req.body.customQuery.replace(/\s+/g, " ").trim();
      if (customQuery && (customQuery.length < 3 || customQuery.length > 120)) {
        return res.status(400).json({ success: false, message: "Arama sözcüğü 3–120 karakter olmalı." });
      }
      set.customQuery = customQuery;
    }
    const unset = {};
    const existing = await watches().findOne({ _id: product._id }, { projection: { customQuery: 1, barcodeSource: 1 } });
    // Arama sözcüğü değiştiyse eski adla otomatik bulunan barkod geçersiz sayılır
    if ("customQuery" in set && set.customQuery !== (existing?.customQuery || "") && existing?.barcodeSource !== "manual") {
      Object.assign(unset, { barcode: "", barcodeSource: "", camgozMissAt: "", marketfiyatiMissAt: "" });
    }
    if (typeof req.body?.barcode === "string") {
      const barcode = req.body.barcode.replace(/\s+/g, "");
      if (barcode && !/^\d{8,14}$/.test(barcode)) {
        return res.status(400).json({ success: false, message: "Barkod 8–14 rakam olmalı." });
      }
      delete unset.barcode;
      delete unset.barcodeSource;
      if (barcode) Object.assign(set, { barcode, barcodeSource: "manual" });
      else Object.assign(unset, { barcode: "", barcodeSource: "" });
      unset.camgozMissAt = "";
      unset.marketfiyatiMissAt = "";
    }
    if (!Object.keys(set).length && !Object.keys(unset).length) return res.status(400).json({ success: false, message: "Değiştirilecek alan yok." });
    const update = { $setOnInsert: { createdAt: new Date() } };
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    await watches().updateOne({ _id: product._id }, update, { upsert: true });
    const record = await watches().findOne({ _id: product._id });
    return res.json({ success: true, row: buildRow(product, record, { threshold: priceWatchSettings().threshold }) });
  } catch (error) {
    console.error("Fiyat bekçisi kaydı güncellenemedi:", error.message);
    return res.status(500).json({ success: false, message: "Kayıt güncellenemedi." });
  }
};

// ── Camgöz anahtarı (panelden) ────────────────────────────────────

/** GET /api/price-watch/camgoz → anahtarın kaynağı (panel/.env), son 4 karakteri ve kredi durumu */
export const getCamgozConfig = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const [settings, state] = await Promise.all([resolveCamgozSettings(db), db.collection(STATE_COLLECTION).findOne({ _id: CAMGOZ_STATE_ID })]);
    res.json({ success: true, camgoz: camgozStatus(state, settings) });
  } catch (error) {
    console.error("Camgöz ayarları okunamadı:", error.message);
    res.status(500).json({ success: false, message: "Camgöz ayarları okunamadı." });
  }
};

/**
 * PUT /api/price-watch/camgoz  { apiKey?: string, monthlyCredits?: number }
 * Yeni anahtar önce ücretsiz uçla denenir (kredi harcamaz); geçerliyse şifrelenip saklanır ve bu ayın kredi sayacı sıfırlanır.
 * .env dosyasına dokunulmaz: panel anahtarı .env'deki JOJAPI_API_KEY'in yerine geçer.
 */
export const updateCamgozConfig = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const set = { updatedAt: new Date(), updatedBy: req.user?._id || null };
    const hasKey = typeof req.body?.apiKey === "string" && req.body.apiKey.trim();
    if (req.body?.monthlyCredits !== undefined) {
      const monthly = Math.round(Number(req.body.monthlyCredits));
      if (!Number.isFinite(monthly) || monthly < 0 || monthly > 10000000) {
        return res.status(400).json({ success: false, message: "Aylık kredi 0 ile 10.000.000 arasında olmalı." });
      }
      set.monthlyCredits = monthly;
    }
    if (hasKey) {
      const apiKey = cleanApiKey(req.body.apiKey);
      if (!validApiKeyFormat(apiKey)) return res.status(400).json({ success: false, message: "API anahtarı 8–200 karakter olmalı ve boşluk içermemeli." });
      if (!process.env.ACCESS_TOKEN_SECRET) {
        return res.status(503).json({ success: false, message: "Sunucuda ACCESS_TOKEN_SECRET tanımlı olmadığı için anahtar güvenli saklanamıyor." });
      }
      let test;
      try {
        test = await testCamgozKey(apiKey);
      } catch {
        return res.status(502).json({ success: false, message: "Camgöz'e ulaşılamadı; anahtar denenemedi. Biraz sonra tekrar deneyin." });
      }
      if (test.status === 401 || test.status === 403) {
        return res.status(400).json({ success: false, message: `Anahtar kabul edilmedi${test.detail ? `: "${test.detail}"` : ""}. JoJ panelinde Product Barcode API aboneliğini kontrol edin.` });
      }
      Object.assign(set, encryptApiKey(apiKey, process.env.ACCESS_TOKEN_SECRET), { setAt: new Date() });
    }
    if (Object.keys(set).length === 2) return res.status(400).json({ success: false, message: "Değiştirilecek alan yok." });
    await db.collection(KEY_COLLECTION).updateOne({ _id: KEY_DOC_ID }, { $set: set }, { upsert: true });
    // Yeni anahtarla yeni kredi: sayaç ve önceki hata/ara sıfırlanır
    if (hasKey) await resetCamgozUsage(db);
    return getCamgozConfig(req, res);
  } catch (error) {
    console.error("Camgöz ayarları kaydedilemedi:", error.message);
    return res.status(500).json({ success: false, message: "Camgöz ayarları kaydedilemedi." });
  }
};

/** DELETE /api/price-watch/camgoz → panel anahtarı silinir, .env'deki anahtara dönülür */
export const deleteCamgozKey = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    await db.collection(KEY_COLLECTION).updateOne(
      { _id: KEY_DOC_ID },
      { $unset: { salt: "", iv: "", tag: "", data: "", setAt: "" }, $set: { updatedAt: new Date(), updatedBy: req.user?._id || null } },
    );
    await resetCamgozUsage(db);
    return getCamgozConfig(req, res);
  } catch (error) {
    console.error("Camgöz anahtarı silinemedi:", error.message);
    return res.status(500).json({ success: false, message: "Camgöz anahtarı silinemedi." });
  }
};

// ── Market Fiyatı ayarları ve kaynak denemesi ─────────────────────

/** GET /api/price-watch/marketfiyati → ayarlar (.env + panel) ve kaynak durumu */
export const getMarketfiyatiConfig = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const [settings, state] = await Promise.all([resolveMarketfiyatiSettings(db), db.collection(STATE_COLLECTION).findOne({ _id: MARKETFIYATI_STATE_ID })]);
    res.json({ success: true, marketfiyati: marketfiyatiStatus(state, settings) });
  } catch (error) {
    console.error("Market Fiyatı ayarları okunamadı:", error.message);
    res.status(500).json({ success: false, message: "Market Fiyatı ayarları okunamadı." });
  }
};

/**
 * PUT /api/price-watch/marketfiyati  { enabled?, latitude?, longitude?, distanceKm?, minIntervalMs?, maxAgeDays?, resume?: true }
 * Ayarlar price_watch_state (_id: "marketfiyati_config") içinde tutulur; .env dosyasına dokunulmaz. resume: verilen arayı kaldırır.
 */
export const updateMarketfiyatiConfig = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const { set, error } = validateMarketfiyatiConfig(req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });
    const resume = req.body?.resume === true;
    if (!Object.keys(set).length && !resume) return res.status(400).json({ success: false, message: "Değiştirilecek alan yok." });
    const states = db.collection(STATE_COLLECTION);
    if (Object.keys(set).length) {
      await states.updateOne({ _id: MARKETFIYATI_CONFIG_ID }, { $set: { ...set, updatedAt: new Date(), updatedBy: req.user?._id || null } }, { upsert: true });
    }
    if (resume) await states.updateOne({ _id: MARKETFIYATI_STATE_ID }, { $unset: { pausedUntil: "", pauseMs: "" }, $set: { consecutiveErrors: 0 } }, { upsert: true });
    return getMarketfiyatiConfig(req, res);
  } catch (error) {
    console.error("Market Fiyatı ayarları kaydedilemedi:", error.message);
    return res.status(500).json({ success: false, message: "Market Fiyatı ayarları kaydedilemedi." });
  }
};

const SAMPLE_QUERY = "Pınar Süt 1 L";
const cleanQuery = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * POST /api/price-watch/providers/:id/test  { query? }
 * Tek canlı deneme: Market Fiyatı için gerçek bir arama (önbellek ve bekçi arası kullanılmaz), Camgöz için ücretsiz anahtar denemesi
 * (kredi harcamaz), market sayfaları için bir SearXNG araması. Kaynağın durum kaydına yazmaz; yalnızca ham özet döner.
 */
export const testProvider = async (req, res) => {
  const id = String(req.params.id || "");
  const query = cleanQuery(req.body?.query) || SAMPLE_QUERY;
  const started = Date.now();
  const db = mongoose.connection.db;
  const done = (payload) => res.json({ success: true, provider: id, query, ms: Date.now() - started, ...payload });
  try {
    if (id === "marketfiyati") {
      const settings = await resolveMarketfiyatiSettings(db);
      try {
        const result = await findMarketfiyatiPrices(query, { settings, useCache: false });
        return done({
          ok: true,
          found: result.offers.length > 0,
          summary: {
            matchedName: result.matchedName || "",
            productId: result.productId || null,
            median: result.median,
            offers: result.offers.map(({ source, price, readAt, note }) => ({ source, price, readAt, note })),
            rejected: (result.rejected || []).slice(0, 5).map(({ source, reason }) => ({ source, reason })),
            note: result.note || "",
            requests: result.requests || 0,
          },
        });
      } catch (error) {
        return done({ ok: false, error: describeMarketfiyatiError(error), status: error?.status ?? null, detail: error?.detail || "" });
      }
    }
    if (id === "camgoz") {
      const settings = await resolveCamgozSettings(db);
      if (!settings.enabled) return done({ ok: false, error: "Camgöz anahtarı yok (panelden ya da JOJAPI_API_KEY ile girin)." });
      try {
        const test = await testCamgozKey(settings.apiKey);
        return done({ ok: test.ok, status: test.status, error: test.ok ? "" : `Anahtar kabul edilmedi (HTTP ${test.status})${test.detail ? `: ${test.detail}` : ""}`, summary: { note: "Ücretsiz uç denendi; kredi harcanmadı. Fiyat araması için ürün satırındaki yenile düğmesini kullanın." } });
      } catch (error) {
        return done({ ok: false, error: error?.name === "AbortError" ? "Camgöz zamanında yanıt vermedi" : `Camgöz'e ulaşılamadı (${String(error?.cause?.code || error?.message || "").slice(0, 80)})` });
      }
    }
    if (id === "pages") {
      if (!process.env.SEARXNG_URL) return done({ ok: false, error: "SEARXNG_URL ayarlı değil." });
      try {
        const results = await searchSearxngWeb(`${query} site:sokmarket.com.tr OR site:trendyol.com OR site:hepsiburada.com`, process.env.SEARXNG_URL);
        const pages = pickProductPages(results, query);
        return done({
          ok: true,
          found: pages.length > 0,
          summary: { results: Array.isArray(results) ? results.length : 0, pages: pages.map(({ url, market }) => ({ source: market.label, url })), note: pages.length ? "" : (Array.isArray(results) && results.length ? "Sonuç var ama desteklenen market ürün sayfası yok." : "SearXNG hiç sonuç vermedi; arama motorları sunucuyu engelliyor olabilir.") },
        });
      } catch (error) {
        return done({ ok: false, error: describeSearchError(error) });
      }
    }
    return res.status(404).json({ success: false, message: "Bilinmeyen kaynak." });
  } catch (error) {
    console.error("Kaynak denemesi başarısız:", error.message);
    return res.status(500).json({ success: false, message: "Kaynak denenemedi." });
  }
};
