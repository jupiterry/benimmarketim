import mongoose from "mongoose";
import Product from "../models/product.model.js";
import {
  STATE_COLLECTION,
  WATCH_COLLECTION,
  buildRow,
  checkProduct,
  coverage,
  istanbulClock,
  listRows,
  priceWatchSettings,
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

const workerStatus = (state, settings) => {
  const today = istanbulClock().day;
  const alive = Boolean(state?.heartbeatAt && Date.now() - new Date(state.heartbeatAt).getTime() < WORKER_ALIVE_MS);
  return {
    alive,
    phase: alive ? state.phase || "waiting" : "offline",
    today: state?.day === today ? state.count || 0 : 0,
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
  };
};

/** GET /api/price-watch?filter=above|below|missing|ok|unchecked|ignored&q=&page= */
export const getPriceWatch = async (req, res) => {
  try {
    const settings = priceWatchSettings();
    const [rows, state] = await Promise.all([
      loadRows(settings),
      mongoose.connection.db.collection(STATE_COLLECTION).findOne({ _id: "main" }),
    ]);
    const list = listRows(rows, {
      filter: String(req.query.filter || "above"),
      q: String(req.query.q || "").slice(0, 80),
      page: req.query.page,
    });
    res.json({ success: true, ...list, coverage: coverage(rows), worker: workerStatus(state, settings) });
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

/** POST /api/price-watch/:id/check → ürünü hemen kontrol eder (tek arama) */
export const checkNow = async (req, res) => {
  try {
    const settings = priceWatchSettings();
    if (!settings.searxngConfigured) {
      return res.status(503).json({ success: false, message: "Ücretsiz arama (SearXNG) ayarlı değil. .env dosyasına SEARXNG_URL ekleyin." });
    }
    const product = await findProduct(req, res);
    if (!product) return undefined;
    const existing = await watches().findOne({ _id: product._id }, { projection: { checkedAt: 1 } });
    if (existing?.checkedAt && Date.now() - new Date(existing.checkedAt).getTime() < MANUAL_CHECK_GAP_MS) {
      return res.status(429).json({ success: false, message: "Bu ürün az önce kontrol edildi, birkaç saniye sonra tekrar deneyin." });
    }
    const record = await checkProduct({ db: mongoose.connection.db, product });
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

/** PATCH /api/price-watch/:id  { ignored?: boolean, customQuery?: string } */
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
    if (!Object.keys(set).length) return res.status(400).json({ success: false, message: "Değiştirilecek alan yok." });
    await watches().updateOne({ _id: product._id }, { $set: set, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    const record = await watches().findOne({ _id: product._id });
    return res.json({ success: true, row: buildRow(product, record, { threshold: priceWatchSettings().threshold }) });
  } catch (error) {
    console.error("Fiyat bekçisi kaydı güncellenemedi:", error.message);
    return res.status(500).json({ success: false, message: "Kayıt güncellenemedi." });
  }
};
