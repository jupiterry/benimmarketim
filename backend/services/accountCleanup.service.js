/**
 * accountCleanup.service.js — Pasif hesap temizliği (yönetici paneli)
 *
 * Tüm sayılar TÜM müşteri koleksiyonu üzerinden sunucuda kesin hesaplanır (örneklem, tahmin,
 * sayfa içi sayım yok). Veri: User.find(...).lean() + kullanıcı başına sipariş özeti
 * (Order.aggregate $group). Sınıflandırma saf fonksiyondur (classifyCustomers) ve testlenir.
 *
 * Etkinlik sinyalleri (updatedAt SİNYAL DEĞİLDİR; cron işleri değiştirir):
 *   web   → user.lastActive (şemada default Date.now: kayıt anında dolar; eski belgelerde hiç olmayabilir).
 *           Anahtar "web" kalır ama GET /api/auth/profile ve girişte yazılır; mobil uygulama da her açılışta
 *           /auth/profile çağırdığı için etiketi "Site/uygulama (profil)"dur.
 *   login → user.lastLoginAt
 *   app   → appActivity.lastSeenAt / checkoutAt / orderAt
 *   cart  → cartLastUpdated, YALNIZCA sepette ürün varsa (default Date.now olduğu için)
 *   order → en son siparişin createdAt'i
 * "signup": sipariş/sepet/ödeme sinyali yok ve kalan tüm sinyaller (web, login, uygulama lastSeenAt) kayıttan
 *   en fazla 2 dk sonra → kayıttan sonra hiç dönmemiş (mobil kayıtta uygulama birkaç saniye içinde iz bırakır).
 *
 * Silme: hesap deleteUserAccount(id, { keepFeedback: true }) ile silinir; siparişler kalır
 * (userDeleted: true işaretlenir). Silmeden önce her kimlik taze veriyle yeniden doğrulanır (önce toplu,
 * sonra her hesap silinmeden hemen önce tek tek).
 */

import mongoose from "mongoose";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import { redis } from "../lib/redis.js";
import { deleteUserAccount } from "./account.service.js";

// ── Sabitler ─────────────────────────────────────────────────────────────────

export const MONTH_OPTIONS = Object.freeze([6, 10, 12, 18, 24]);
export const DEFAULT_MONTHS = 10;
export const SEGMENTS = Object.freeze(["inactive", "never"]);
export const ORDER_FILTERS = Object.freeze(["all", "with", "without"]);
export const SOURCE_FILTERS = Object.freeze(["all", "signup"]);
export const SORT_KEYS = Object.freeze(["lastSeen", "created", "orders", "spent", "name"]);
export const SORT_DIRS = Object.freeze(["asc", "desc"]);
export const ACTIVE_ORDER_STATUSES = Object.freeze(["Hazırlanıyor", "Yolda"]);
export const CANCELLED_STATUS = "İptal Edildi";
export const SIGNUP_GRACE_MS = 2 * 60 * 1000;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const MAX_PAGE = 100000;
export const MAX_QUERY_LENGTH = 60;
export const MAX_DELETE_IDS = 100;
export const CACHE_TTL_MS = 30 * 1000;

const HEX24 = /^[0-9a-f]{24}$/i;
const SIGNAL_PRIORITY = ["order", "login", "app", "web", "cart"]; // aynı anda olan sinyallerde bilgilendirici olan kazanır

export const DISTRIBUTION_BUCKETS = Object.freeze([
  { key: "0-1", label: "Son 1 ay", fromMonths: 0, toMonths: 1 },
  { key: "1-3", label: "1–3 ay", fromMonths: 1, toMonths: 3 },
  { key: "3-6", label: "3–6 ay", fromMonths: 3, toMonths: 6 },
  { key: "6-10", label: "6–10 ay", fromMonths: 6, toMonths: 10 },
  { key: "10-12", label: "10–12 ay", fromMonths: 10, toMonths: 12 },
  { key: "12-24", label: "12–24 ay", fromMonths: 12, toMonths: 24 },
  { key: "24+", label: "24+ ay", fromMonths: 24, toMonths: null },
  { key: "never", label: "Kayıt yok", fromMonths: null, toMonths: null },
]);

export const SOURCE_LABELS = Object.freeze({
  web: "Site/uygulama (profil)",
  login: "Giriş",
  app: "Mobil uygulama",
  cart: "Sepet",
  order: "Sipariş",
  signup: "Yalnızca kayıt",
});

// ── Yardımcılar ──────────────────────────────────────────────────────────────

/** Geçerli tarih → Date, aksi halde null (eski belgelerde metin ya da bozuk değer olabilir) */
export const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = (value) => toDate(value)?.toISOString() ?? null;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Kimliğin içindeki oluşturma zamanı (ObjectId ya da 24 haneli metin) */
const idTimestamp = (id) => {
  if (!id) return null;
  if (typeof id.getTimestamp === "function") return toDate(id.getTimestamp());
  const text = String(id);
  return HEX24.test(text) ? new Date(parseInt(text.slice(0, 8), 16) * 1000) : null;
};

/** Kayıt tarihi: createdAt yoksa _id zaman damgası */
export const createdAtOf = (user) => toDate(user?.createdAt) || idTimestamp(user?._id);

/**
 * Kesim: şimdi − months takvim ayı. Gün hedef ayın son gününe kırpılır: 31 Aralık − 10 ay = 28 Şubat
 * (setMonth tek başına 3 Mart'a taşar ve eşiğe birkaç gün kala hesabı silinebilir gösterirdi). Saat korunur.
 */
export const cutoffFor = (now, months) => {
  const date = new Date(toDate(now) || Date.now());
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
};

/** Türkçe harf duyarsız karşılaştırma için sadeleştirme: "Çağla İŞÇİ" → "cagla isci" */
export const foldTurkish = (text) =>
  String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDigits = (text) => {
  let digits = String(text ?? "").replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length >= 12) digits = digits.slice(2);
  return digits.replace(/^0+/, "");
};

// Aramada açıkça yazılmış ülke kodu ("+90 555", "0090 555") uzunluktan bağımsız atılır.
// Çıplak "90" atılmaz: "905" numaranın ortasından bir parça olabilir.
const PHONE_COUNTRY_PREFIX = /^(?:\+|00)\s*90/;
const queryDigits = (text) => normalizeDigits(String(text ?? "").replace(PHONE_COUNTRY_PREFIX, ""));

const maxDate = (dates) => dates.reduce((best, date) => (date && (!best || date > best) ? date : best), null);

/** Kullanıcının etkinlik sinyalleri: [{ type, at }] (yalnızca dolu olanlar) */
export const activitySignals = (user, stats) => {
  const signals = [];
  const web = toDate(user?.lastActive);
  if (web) signals.push({ type: "web", at: web });
  const login = toDate(user?.lastLoginAt);
  if (login) signals.push({ type: "login", at: login });
  const app = maxDate([user?.appActivity?.lastSeenAt, user?.appActivity?.checkoutAt, user?.appActivity?.orderAt].map(toDate));
  if (app) signals.push({ type: "app", at: app });
  const items = Array.isArray(user?.cartItems) ? user.cartItems : [];
  if (items.length > 0) {
    const cart = toDate(user?.cartLastUpdated) || maxDate(items.map((item) => toDate(item?.addedAt)));
    if (cart) signals.push({ type: "cart", at: cart });
  }
  const order = toDate(stats?.lastOrderAt);
  if (order) signals.push({ type: "order", at: order });
  return signals;
};

/**
 * Kayıttan sonra hiç dönmemiş mi? Sipariş, dolu sepet, uygulamada ödeme/sipariş adımı gerçek etkinliktir;
 * kalan sinyallerin (profil/web, giriş, uygulama açılışı) hepsi kayıttan en fazla 2 dk sonra olmalı.
 */
const isSignupOnly = (user, signals, createdAt) => {
  if (!createdAt) return false;
  if (signals.some((signal) => signal.type === "order" || signal.type === "cart")) return false;
  if (toDate(user?.appActivity?.checkoutAt) || toDate(user?.appActivity?.orderAt)) return false;
  return signals.every((signal) => signal.at.getTime() - createdAt.getTime() <= SIGNUP_GRACE_MS);
};

/** Son görülme ve kaynağı. Sinyal yoksa { lastSeenAt: null, lastSeenSource: null } */
export const lastSeenOf = (user, stats, createdAt = createdAtOf(user)) => {
  const signals = activitySignals(user, stats);
  if (!signals.length) return { lastSeenAt: null, lastSeenSource: null, signalCount: 0 };
  let best = null;
  for (const type of SIGNAL_PRIORITY) {
    const signal = signals.find((entry) => entry.type === type);
    if (signal && (!best || signal.at > best.at)) best = signal;
  }
  const source = isSignupOnly(user, signals, createdAt) ? "signup" : best.type;
  return { lastSeenAt: best.at, lastSeenSource: source, signalCount: signals.length };
};

const bucketOf = (lastSeenAt, bucketCutoffs) => {
  if (!lastSeenAt) return "never";
  for (const { key, cutoff } of bucketCutoffs) {
    if (lastSeenAt >= cutoff) return key;
  }
  return "24+";
};

const statsOf = (orderStatsMap, id) => {
  if (!orderStatsMap) return null;
  if (orderStatsMap instanceof Map) return orderStatsMap.get(id) || null;
  return orderStatsMap[id] || null;
};

// ── Saf sınıflandırma ────────────────────────────────────────────────────────

/**
 * Müşterileri sınıflandırır (role !== "admin"). Veritabanından bağımsızdır.
 * @param {Array<object>} users  yalın kullanıcı belgeleri
 * @param {Map<string,object>|object} orderStatsMap  userId → { orderCount, totalSpent, lastOrderAt, activeOrderCount }
 * @param {Date} now
 * @param {number} months
 * @returns {{ cutoff: Date, admins: number, customers: Array<object> }}
 *   her müşteri: { _id, name, email, phone, createdAt, lastSeenAt, lastSeenSource, orderCount, totalSpent,
 *   lastOrderAt, activeOrderCount, segment: 'inactive'|'never'|'active', deletable, blockReason, bucket }
 */
export const classifyCustomers = (users = [], orderStatsMap = new Map(), now = new Date(), months = DEFAULT_MONTHS) => {
  const cutoff = cutoffFor(now, months);
  const bucketCutoffs = DISTRIBUTION_BUCKETS.filter((bucket) => bucket.toMonths)
    .map((bucket) => ({ key: bucket.key, cutoff: cutoffFor(now, bucket.toMonths) }));
  let admins = 0;
  const customers = [];

  for (const user of users || []) {
    if (!user || !user._id) continue;
    if (user.role === "admin") {
      admins += 1;
      continue;
    }
    const id = String(user._id);
    const stats = statsOf(orderStatsMap, id);
    const createdAt = createdAtOf(user);
    const orderCount = Number(stats?.orderCount) || 0;
    const activeOrderCount = Number(stats?.activeOrderCount) || 0;
    const { lastSeenAt, lastSeenSource } = lastSeenOf(user, stats, createdAt);

    let segment = "active";
    if (lastSeenAt) {
      if (lastSeenAt < cutoff) segment = "inactive";
    } else if (orderCount === 0) {
      // Hiçbir sinyal yok. (Siparişi olup tarihi okunamayan kayıt "never" sayılmaz; silinmez.)
      segment = "never";
    }

    let deletable = false;
    let blockReason = null;
    if (segment !== "active") {
      if (activeOrderCount > 0) blockReason = "active_order";
      // Hesap yaşı kesimden kısa olan hesap hiçbir segmentte silinmez (never için kural; inactive'de yalnızca bozuk veride olur)
      else if (!createdAt || createdAt >= cutoff) blockReason = "too_new";
      else deletable = true;
    }

    customers.push({
      _id: id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      createdAt,
      lastSeenAt,
      lastSeenSource,
      orderCount,
      totalSpent: round2(stats?.totalSpent),
      lastOrderAt: toDate(stats?.lastOrderAt),
      activeOrderCount,
      segment,
      deletable,
      blockReason,
      bucket: bucketOf(lastSeenAt, bucketCutoffs),
    });
  }
  return { cutoff, admins, customers };
};

/** Özet (summary) gövdesi: sınıflandırma sonucundan kesin sayılar */
export const buildSummary = (classified, { now, months, deletedAccounts = { users: 0, orders: 0 } }) => {
  const totals = {
    customers: classified.customers.length,
    admins: classified.admins,
    inactive: 0,
    inactiveDeletable: 0,
    never: 0,
    neverDeletable: 0,
    neverTooNew: 0,
    blockedActiveOrders: 0,
    signupOnly: 0,
    candidatesWithOrders: 0,
    candidatesWithoutOrders: 0,
    ordersPreserved: 0,
    revenuePreserved: 0,
  };
  const counts = new Map(DISTRIBUTION_BUCKETS.map((bucket) => [bucket.key, 0]));
  let revenue = 0;
  for (const row of classified.customers) {
    counts.set(row.bucket, (counts.get(row.bucket) || 0) + 1);
    if (row.segment === "inactive") {
      totals.inactive += 1;
      if (row.deletable) totals.inactiveDeletable += 1;
      if (row.lastSeenSource === "signup") totals.signupOnly += 1;
    } else if (row.segment === "never") {
      totals.never += 1;
      if (row.deletable) totals.neverDeletable += 1;
      if (row.blockReason === "too_new") totals.neverTooNew += 1;
    }
    if (row.blockReason === "active_order") totals.blockedActiveOrders += 1;
    if (row.deletable) {
      if (row.orderCount > 0) totals.candidatesWithOrders += 1;
      else totals.candidatesWithoutOrders += 1;
      totals.ordersPreserved += row.orderCount;
      revenue += row.totalSpent;
    }
  }
  totals.revenuePreserved = round2(revenue);
  return {
    generatedAt: toIso(now),
    months,
    cutoff: toIso(classified.cutoff),
    totals,
    distribution: DISTRIBUTION_BUCKETS.map((bucket) => ({ ...bucket, count: counts.get(bucket.key) || 0 })),
    deletedAccounts: { users: Number(deletedAccounts?.users) || 0, orders: Number(deletedAccounts?.orders) || 0 },
  };
};

// ── Liste: süzme, sıralama, sayfalama ────────────────────────────────────────

/**
 * Arama eşleştiricisi: ad/e-posta Türkçe harf duyarsız alt metin, telefon rakam bazlı, 24 haneli kimlik birebir.
 * Kullanıcı girdisinden düzenli ifade KURULMAZ (kaçış gerekmez, ReDoS/enjeksiyon yok).
 */
export const createQueryMatcher = (q) => {
  const folded = foldTurkish(q);
  if (!folded) return () => true;
  const id = HEX24.test(folded) ? folded : null;
  const digits = /^[\d\s()+\-.]+$/.test(folded) ? queryDigits(folded) : "";
  return (row) =>
    (id !== null && String(row._id).toLowerCase() === id) ||
    foldTurkish(row.name).includes(folded) ||
    foldTurkish(row.email).includes(folded) ||
    (digits.length >= 3 && normalizeDigits(row.phone).includes(digits));
};

export const matchesQuery = (row, q) => createQueryMatcher(q)(row);

export const filterRows = (customers, { segment, q = "", orders = "all", source = "all" } = {}) => {
  const matches = createQueryMatcher(q);
  return customers.filter((row) => {
    if (row.segment !== segment) return false;
    if (orders === "with" && row.orderCount === 0) return false;
    if (orders === "without" && row.orderCount > 0) return false;
    if (source === "signup" && row.lastSeenSource !== "signup") return false;
    return matches(row);
  });
};

export const defaultDirFor = (sort) => (sort === "orders" || sort === "spent" ? "desc" : "asc");

const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
const time = (date) => (date ? date.getTime() : 0);
const SORTERS = {
  // Kayıt yok (never) segmentinde son görülme boştur → kayıt tarihine göre
  lastSeen: (a, b) => time(a.lastSeenAt || a.createdAt) - time(b.lastSeenAt || b.createdAt),
  created: (a, b) => time(a.createdAt) - time(b.createdAt),
  orders: (a, b) => a.orderCount - b.orderCount || a.totalSpent - b.totalSpent,
  spent: (a, b) => a.totalSpent - b.totalSpent || a.orderCount - b.orderCount,
  name: (a, b) => collator.compare(a.name, b.name),
};

export const sortRows = (rows, sort = "lastSeen", dir = defaultDirFor(sort)) => {
  const compare = SORTERS[sort] || SORTERS.lastSeen;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * compare(a, b) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
};

/** API satırı (iç alanlar segment/bucket çıkarılır, tarihler ISO) */
export const toPublicRow = (row) => ({
  _id: row._id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  createdAt: toIso(row.createdAt),
  lastSeenAt: toIso(row.lastSeenAt),
  lastSeenSource: row.lastSeenSource,
  orderCount: row.orderCount,
  totalSpent: row.totalSpent,
  lastOrderAt: toIso(row.lastOrderAt),
  activeOrderCount: row.activeOrderCount,
  deletable: row.deletable,
  blockReason: row.blockReason,
});

export const paginate = (rows, page, limit) => {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(1, page), pages);
  return { items: rows.slice((current - 1) * limit, current * limit), total, page: current, pages, limit };
};

// ── Girdi doğrulama ──────────────────────────────────────────────────────────

const single = (value) => (Array.isArray(value) ? undefined : value);
const isBlank = (value) => value === undefined || value === null || value === "";

/** months: boş → varsayılan 10; whitelist dışı → hata */
export const parseMonths = (value, { required = false } = {}) => {
  if (isBlank(value)) return required ? { error: "Süre (months) zorunludur" } : { value: DEFAULT_MONTHS };
  const text = typeof value === "number" ? String(value) : single(value);
  if (typeof text !== "string" || !/^\d{1,3}$/.test(text.trim())) return { error: "Geçersiz süre: 6, 10, 12, 18 ya da 24 ay olmalı" };
  const months = Number(text.trim());
  if (!MONTH_OPTIONS.includes(months)) return { error: "Geçersiz süre: 6, 10, 12, 18 ya da 24 ay olmalı" };
  return { value: months };
};

const parseEnum = (value, allowed, fallback, message) => {
  if (isBlank(value)) return { value: fallback };
  const text = single(value);
  if (typeof text !== "string" || !allowed.includes(text)) return { error: message };
  return { value: text };
};

const parseIntInRange = (value, { min, max, fallback, message }) => {
  if (isBlank(value)) return { value: fallback };
  const text = single(value);
  if (typeof text !== "string" && typeof text !== "number") return { error: message };
  const trimmed = String(text).trim();
  if (!/^\d{1,7}$/.test(trimmed)) return { error: message };
  const number = Number(trimmed);
  if (number < min || number > max) return { error: message };
  return { value: number };
};

/** Arama metni: metin olmalı, kırpılır, boşluklar teklenir, en fazla 60 karakter */
export const parseQuery = (value) => {
  if (isBlank(value)) return { value: "" };
  const text = single(value);
  if (typeof text !== "string") return { error: "Geçersiz arama metni" };
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length > MAX_QUERY_LENGTH) return { error: `Arama en fazla ${MAX_QUERY_LENGTH} karakter olabilir` };
  return { value: normalized };
};

/**
 * Liste/ids/export sorgusu. { error } ya da { value: { segment, months, q, orders, source, sort, dir, page, limit } }
 * @param {object} query  req.query
 * @param {{ paging?: boolean, sorting?: boolean }} options
 */
export const parseListQuery = (query = {}, { paging = true, sorting = true } = {}) => {
  const out = {};
  const steps = [
    ["segment", () => parseEnum(query.segment, SEGMENTS, "inactive", "Geçersiz segment: inactive ya da never olmalı")],
    ["months", () => parseMonths(query.months)],
    ["q", () => parseQuery(query.q)],
    ["orders", () => parseEnum(query.orders, ORDER_FILTERS, "all", "Geçersiz sipariş filtresi: all, with ya da without olmalı")],
    ["source", () => parseEnum(query.source, SOURCE_FILTERS, "all", "Geçersiz kaynak filtresi: all ya da signup olmalı")],
  ];
  if (sorting) {
    steps.push(["sort", () => parseEnum(query.sort, SORT_KEYS, "lastSeen", "Geçersiz sıralama: lastSeen, created, orders, spent ya da name olmalı")]);
    steps.push(["dir", () => parseEnum(query.dir, SORT_DIRS, null, "Geçersiz sıralama yönü: asc ya da desc olmalı")]);
  }
  if (paging) {
    steps.push(["page", () => parseIntInRange(query.page, { min: 1, max: MAX_PAGE, fallback: 1, message: "Geçersiz sayfa numarası" })]);
    steps.push(["limit", () => parseIntInRange(query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT, message: `Sayfa boyutu 1 ile ${MAX_LIMIT} arasında olmalı` })]);
  }
  for (const [key, run] of steps) {
    const { value, error } = run();
    if (error) return { error, field: key };
    out[key] = value;
  }
  if (sorting && !out.dir) out.dir = defaultDirFor(out.sort);
  return { value: out };
};

/** POST /delete gövdesi: { userIds: 1..100 adet 24 haneli kimlik, segment, months } */
export const parseDeleteBody = (body = {}) => {
  const { userIds } = body || {};
  if (!Array.isArray(userIds) || userIds.length === 0) return { error: "Silinecek en az bir hesap seçilmeli", field: "userIds" };
  if (userIds.length > MAX_DELETE_IDS) return { error: `Tek seferde en fazla ${MAX_DELETE_IDS} hesap silinebilir`, field: "userIds" };
  const ids = [];
  for (const id of userIds) {
    if (typeof id !== "string" || !HEX24.test(id)) return { error: "Geçersiz hesap kimliği", field: "userIds" };
    const normalized = id.toLowerCase();
    if (!ids.includes(normalized)) ids.push(normalized);
  }
  const segment = parseEnum(body.segment, SEGMENTS, null, "Geçersiz segment: inactive ya da never olmalı");
  if (segment.error || !segment.value) return { error: segment.error || "Segment zorunludur", field: "segment" };
  const months = parseMonths(body.months, { required: true });
  if (months.error) return { error: months.error, field: "months" };
  return { value: { ids, segment: segment.value, months: months.value } };
};

// ── Veri yükleme ve önbellek ─────────────────────────────────────────────────

const USER_FIELDS = "name email phone role createdAt lastActive lastLoginAt appActivity.lastSeenAt appActivity.checkoutAt appActivity.orderAt cartLastUpdated cartItems.addedAt";

const statsGroupStage = {
  $group: {
    _id: "$user",
    orderCount: { $sum: 1 },
    totalSpent: { $sum: { $cond: [{ $eq: ["$status", CANCELLED_STATUS] }, 0, { $ifNull: ["$productTotal", { $ifNull: ["$totalAmount", 0] }] }] } },
    lastOrderAt: { $max: { $ifNull: ["$createdAt", { $toDate: "$_id" }] } },
    activeOrderCount: { $sum: { $cond: [{ $in: ["$status", [...ACTIVE_ORDER_STATUSES]] }, 1, 0] } },
    deletedOrders: { $sum: { $cond: [{ $eq: ["$userDeleted", true] }, 1, 0] } },
  },
};

/**
 * Order.aggregate sonucunu userId → istatistik haritasına çevirir; silinmiş hesapları sayar.
 * existingUserIds (tüm kullanıcı kimlikleri) verilirse silinmiş hesap = hesabı artık olmayan siparişler:
 * eski yönetici silmesinin işaretlemediği siparişler de sayılır, kısmi silmede (yalnızca sipariş geçmişi)
 * userDeleted işaretlenip hesabı duran müşteriler sayılmaz. Verilmezse userDeleted işaretine bakılır.
 * @param {Array<object>} groups
 * @param {Set<string>} [existingUserIds]
 */
export const toOrderStats = (groups = [], existingUserIds = null) => {
  const map = new Map();
  const deletedAccounts = { users: 0, orders: 0 };
  for (const group of groups || []) {
    if (!group?._id) continue;
    if (existingUserIds) {
      if (!existingUserIds.has(String(group._id))) {
        deletedAccounts.users += 1;
        deletedAccounts.orders += Number(group.orderCount) || 0;
      }
    } else {
      const deletedOrders = Number(group.deletedOrders) || 0;
      if (deletedOrders > 0) {
        deletedAccounts.users += 1;
        deletedAccounts.orders += deletedOrders;
      }
    }
    map.set(String(group._id), {
      orderCount: Number(group.orderCount) || 0,
      totalSpent: round2(group.totalSpent),
      lastOrderAt: toDate(group.lastOrderAt),
      activeOrderCount: Number(group.activeOrderCount) || 0,
    });
  }
  return { map, deletedAccounts };
};

/** Taze veri: tüm kullanıcılar + kullanıcı başına sipariş özeti (önbelleksiz) */
export const fetchCleanupDataset = async () => {
  const [users, groups] = await Promise.all([
    User.find({}).select(USER_FIELDS).lean(),
    Order.aggregate([statsGroupStage]),
  ]);
  const existing = new Set((users || []).map((user) => String(user._id)));
  const { map, deletedAccounts } = toOrderStats(groups, existing);
  return { loadedAt: new Date(), users: users || [], orderStats: map, deletedAccounts };
};

// Süreç içi önbellek (30 sn). Birden fazla sunucu işleminde silme sonrası tutarlılık için
// Redis'teki sürüm anahtarı her istekte okunur; değiştiyse yerel önbellek atılır.
const VERSION_KEY = "account-cleanup:version";
let datasetCache = null; // { version, expiresAt, promise }

// Redis yanıt vermezse istek beklemez: süre dolunca undefined döner
const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, undefined);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const readCacheVersion = async () => {
  try {
    const value = await withTimeout(Promise.resolve(redis.get(VERSION_KEY)), 300);
    return value === undefined ? null : String(value ?? "0");
  } catch {
    return null; // Redis yoksa yalnızca süre sınırı geçerli
  }
};

/** Yerel önbelleği temizler (testler ve aynı işlem içi kullanım) */
export const clearAccountCleanupCache = () => {
  datasetCache = null;
};

/** Silmeden sonra: yerel önbellek temizlenir, diğer sunucu işlemleri için sürüm değiştirilir */
export const invalidateAccountCleanupCache = async () => {
  datasetCache = null;
  try {
    await withTimeout(Promise.resolve(redis.set(VERSION_KEY, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, "EX", 86400)), 300);
  } catch {
    /* Redis yoksa yalnızca yerel önbellek temizlenir */
  }
};

/** Önbellekli veri (en fazla 30 sn eski; silmeden sonra hemen yenilenir) */
export const loadCleanupDataset = async ({ force = false } = {}) => {
  const version = await readCacheVersion();
  const nowMs = Date.now();
  if (!force && datasetCache && datasetCache.expiresAt > nowMs && (version === null || datasetCache.version === version)) {
    return datasetCache.promise;
  }
  const entry = { version, expiresAt: nowMs + CACHE_TTL_MS, promise: null };
  entry.promise = fetchCleanupDataset().catch((error) => {
    if (datasetCache === entry) datasetCache = null;
    throw error;
  });
  datasetCache = entry;
  return entry.promise;
};

// ── Uç nokta işlemleri ───────────────────────────────────────────────────────

const classifyDataset = (dataset, months) => classifyCustomers(dataset.users, dataset.orderStats, dataset.loadedAt, months);

export const getCleanupSummary = async ({ months }) => {
  const dataset = await loadCleanupDataset();
  return buildSummary(classifyDataset(dataset, months), { now: dataset.loadedAt, months, deletedAccounts: dataset.deletedAccounts });
};

const matchingRows = async ({ segment, months, q, orders, source, sort, dir }) => {
  const dataset = await loadCleanupDataset();
  const rows = filterRows(classifyDataset(dataset, months).customers, { segment, q, orders, source });
  return sort ? sortRows(rows, sort, dir) : rows;
};

export const listCleanupUsers = async (params) => {
  const rows = await matchingRows(params);
  const { items, total, page, pages, limit } = paginate(rows, params.page, params.limit);
  return { users: items.map(toPublicRow), total, page, pages, limit, segment: params.segment, months: params.months };
};

export const getCleanupIds = async (params) => {
  const rows = await matchingRows({ ...params, sort: null });
  const ids = rows.filter((row) => row.deletable).map((row) => row._id);
  return { ids, total: rows.length, deletable: ids.length, blocked: rows.length - ids.length };
};

// ── CSV ──────────────────────────────────────────────────────────────────────

const CSV_HEADERS = ["Ad", "E-posta", "Telefon", "Kayıt tarihi", "Son görülme", "Kaynak", "Sipariş sayısı", "Toplam harcama", "Son sipariş", "Silinebilir", "Neden"];
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const formatCsvDate = (date) => (toDate(date) ? dateFormatter.format(toDate(date)) : "");
const formatCsvMoney = (value) => round2(value).toFixed(2).replace(".", ",");

export const blockReasonLabel = (reason, months) => {
  if (reason === "active_order") return "Aktif siparişi var";
  if (reason === "too_new") return `Hesap ${months} aydan yeni`;
  return "";
};

/** Hücre: formül enjeksiyonu kaçışı (= + - @ sekme CR ile başlayan metne ') ve ; " satır sonu için tırnak */
export const csvCell = (value) => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[;"\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const buildCleanupCsv = (rows, { months }) => {
  const lines = [CSV_HEADERS.map(csvCell).join(";")];
  for (const row of rows) {
    lines.push([
      row.name,
      row.email,
      row.phone,
      formatCsvDate(row.createdAt),
      row.lastSeenAt ? formatCsvDate(row.lastSeenAt) : "Kayıt yok",
      row.lastSeenSource ? SOURCE_LABELS[row.lastSeenSource] || row.lastSeenSource : "",
      row.orderCount,
      formatCsvMoney(row.totalSpent),
      formatCsvDate(row.lastOrderAt),
      row.deletable ? "Evet" : "Hayır",
      blockReasonLabel(row.blockReason, months),
    ].map(csvCell).join(";"));
  }
  return `\ufeff${lines.join("\r\n")}\r\n`;
};

export const exportCleanupCsv = async (params) => {
  const rows = await matchingRows(params);
  return { csv: buildCleanupCsv(rows, params), count: rows.length };
};

// ── Silme ────────────────────────────────────────────────────────────────────

/** Silme anında taze veri (önbellek KULLANILMAZ): yalnızca istenen kimlikler */
export const fetchUsersForDeletion = async (ids) => {
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const [users, groups] = await Promise.all([
    User.find({ _id: { $in: objectIds } }).select(USER_FIELDS).lean(),
    Order.aggregate([{ $match: { user: { $in: objectIds } } }, statsGroupStage]),
  ]);
  return { users: users || [], orderStats: toOrderStats(groups).map };
};

/**
 * Her kimliği yeniden doğrular. Dönüş: { eligible: [row], skipped: [{ id, reason }] }
 * Sıra: not_found → self → admin → not_in_segment → active_order → too_new
 */
export const revalidateForDeletion = ({ ids, users, orderStats, segment, months, actorId, now = new Date() }) => {
  const byId = new Map((users || []).map((user) => [String(user._id).toLowerCase(), user]));
  const { customers } = classifyCustomers(users, orderStats, now, months);
  const rows = new Map(customers.map((row) => [row._id.toLowerCase(), row]));
  const eligible = [];
  const skipped = [];
  for (const id of ids) {
    const user = byId.get(id);
    if (!user) skipped.push({ id, reason: "not_found" });
    else if (actorId && String(actorId).toLowerCase() === id) skipped.push({ id, reason: "self" });
    else if (user.role === "admin") skipped.push({ id, reason: "admin" });
    else {
      const row = rows.get(id);
      if (!row || row.segment !== segment) skipped.push({ id, reason: "not_in_segment" });
      else if (!row.deletable) skipped.push({ id, reason: row.blockReason || "not_in_segment" });
      else eligible.push(row);
    }
  }
  return { eligible, skipped };
};

/**
 * Seçilen hesapları yeniden doğrular ve sırayla siler (geri bildirimler ve siparişler kalır).
 * Toplu doğrulamadan sonra her hesap silinmeden hemen önce tek başına bir kez daha doğrulanır: parti boyunca
 * (hesap başına ~13 sorgu) giriş yapan, sipariş veren ya da yönetici yapılan müşteri silinmez. Bu aralığı
 * daraltır ama tamamen kapatmaz (deleteUserAccount'un kendi adımları arasındaki an açık kalır).
 * @param {{ ids: string[], segment: string, months: number, actorId?: unknown, now?: Date }} params
 *   now verilmezse her doğrulama o anın saatiyle yapılır
 * @returns {Promise<{ deleted: string[], skipped: Array<{id, reason}>, ordersPreserved: number, deletedNames: string[] }>}
 */
export const deleteCleanupCandidates = async ({ ids, segment, months, actorId, now = null }) => {
  const at = () => toDate(now) || new Date();
  const { users, orderStats } = await fetchUsersForDeletion(ids);
  const { eligible, skipped } = revalidateForDeletion({ ids, users, orderStats, segment, months, actorId, now: at() });
  const deleted = [];
  const deletedNames = [];
  let ordersPreserved = 0;
  for (const candidate of eligible) {
    try {
      const fresh = await fetchUsersForDeletion([candidate._id]);
      const recheck = revalidateForDeletion({ ids: [candidate._id], ...fresh, segment, months, actorId, now: at() });
      const row = recheck.eligible[0];
      if (!row) {
        skipped.push(recheck.skipped[0] || { id: candidate._id, reason: "not_in_segment" });
        continue;
      }
      const result = await deleteUserAccount(row._id, { keepFeedback: true });
      deleted.push(row._id);
      deletedNames.push(row.name || row.email || row._id);
      ordersPreserved += Math.max(Number(result?.ordersAnonymized) || 0, row.orderCount);
    } catch (error) {
      if (error?.code === "USER_NOT_FOUND") skipped.push({ id: candidate._id, reason: "not_found" });
      else {
        console.error(`Pasif hesap silinemedi (${candidate._id}):`, error?.message);
        skipped.push({ id: candidate._id, reason: "error" });
      }
    }
  }
  if (deleted.length) await invalidateAccountCleanupCache();
  return { deleted, skipped, ordersPreserved, deletedNames };
};
