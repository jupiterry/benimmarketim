import mongoose from "mongoose";
import Product from "../models/product.model.js";
import { camgozSettings } from "../services/camgoz.service.js";
import {
  STATE_COLLECTION,
  WATCH_COLLECTION,
  buildRow,
  checkProduct,
  coverage,
  istanbulClock,
  listRows,
  CAMGOZ_STATE_ID,
  priceLookup,
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

const camgozStatus = (state) => {
  const settings = camgozSettings();
  const { day } = istanbulClock();
  const month = day.slice(0, 7);
  return {
    enabled: settings.enabled,
    monthlyCredits: settings.monthlyCredits,
    used: state?.month === month ? state.used || 0 : 0,
    usedToday: state?.day === day ? state.usedToday || 0 : 0,
    lastError: state?.lastError || null,
    pausedUntil: state?.pausedUntil && new Date(state.pausedUntil) > new Date() ? state.pausedUntil : null,
  };
};

const workerStatus = (state, settings, camgozState) => {
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
    camgoz: camgozStatus(camgozState),
  };
};

/** GET /api/price-watch?filter=above|below|missing|ok|unchecked|ignored&q=&page= */
export const getPriceWatch = async (req, res) => {
  try {
    const settings = priceWatchSettings();
    const states = mongoose.connection.db.collection(STATE_COLLECTION);
    const [rows, state, camgozState] = await Promise.all([
      loadRows(settings),
      states.findOne({ _id: "main" }),
      states.findOne({ _id: CAMGOZ_STATE_ID }),
    ]);
    const list = listRows(rows, {
      filter: String(req.query.filter || "above"),
      q: String(req.query.q || "").slice(0, 80),
      page: req.query.page,
    });
    res.json({ success: true, ...list, coverage: coverage(rows), worker: workerStatus(state, settings, camgozState) });
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
    if (!settings.searxngConfigured && !camgozSettings().enabled) {
      return res.status(503).json({ success: false, message: "Fiyat kaynağı ayarlı değil. .env dosyasına JOJAPI_API_KEY (Camgöz) ya da SEARXNG_URL ekleyin." });
    }
    const product = await findProduct(req, res);
    if (!product) return undefined;
    const existing = await watches().findOne({ _id: product._id }, { projection: { checkedAt: 1 } });
    if (existing?.checkedAt && Date.now() - new Date(existing.checkedAt).getTime() < MANUAL_CHECK_GAP_MS) {
      return res.status(429).json({ success: false, message: "Bu ürün az önce kontrol edildi, birkaç saniye sonra tekrar deneyin." });
    }
    const db = mongoose.connection.db;
    const record = await checkProduct({ db, product, lookup: priceLookup({ db, manual: true }) });
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
      Object.assign(unset, { barcode: "", barcodeSource: "", camgozMissAt: "" });
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
