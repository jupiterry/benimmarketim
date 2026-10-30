// backend/controllers/userController.js
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import bcrypt from "bcryptjs";
import { deleteUserAccount } from "../services/account.service.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { invalidateAccountCleanupCache } from "../services/accountCleanup.service.js";

// ── Yönetici müşteri listesi (GET /api/users, /api/users/stats, /api/users/search) ─────────────
// Liste sunucuda sayfalanır, aranır, sıralanır ve süzülür. Yanıtta yalnızca ekranın kullandığı alanlar
// bulunur: parola, bildirim anahtarı (fcmToken), oturum anahtarları ve sepet içeriği ASLA dönmez
// (sepet yerine yalnızca cartItemCount). Mobil uygulama bu uç noktaları kullanmaz (yalnızca GET /users/:id).

const DAY = 24 * 60 * 60 * 1000;
export const USER_LIST_DEFAULT_LIMIT = 50;
export const USER_LIST_MAX_LIMIT = 100;
export const USER_SEARCH_DEFAULT_LIMIT = 8;
export const USER_SEARCH_MAX_LIMIT = 20;
const ACTIVE_DAYS = 30; // bu kadar gün içinde görüldüyse "aktif"
const NEW_DAYS = 7; // bu kadar gün içinde kayıt olduysa "yeni"
const APP_ONLINE_MS = 2 * 60 * 1000; // son uygulama isteğinden bu kadar sonra "şu an uygulamada" sayılmaz
const MAX_QUERY_LENGTH = 100;
const MAX_IDS = 100;
// Sipariş özeti: iptal edilmemiş siparişler (en iyi müşteriler ekranıyla aynı kural)
const COUNTED_ORDER_STATUSES = ["Hazırlanıyor", "Yolda", "Teslim Edildi"];

export const USER_LIST_SORTS = ["seen", "newest", "oldest", "name", "spent", "orders"];
export const USER_LIST_SEGMENTS = ["all", "active", "risk", "new", "admin", "noOrders", "dupPhone"];
// Özette countDocuments ile sayılan süzgeçler; dupPhone sayısı telefon gruplarından gelir
const COUNTED_SEGMENTS = USER_LIST_SEGMENTS.filter((segment) => segment !== "dupPhone");
export const USER_APP_FILTERS = ["now", "opened", "checkout", "ordered", "noOrder", "notOpened"];

// Listede dönen alanlar (yalnızca dahil etme); cartItems yerine adet toplamı hesaplanır
const LIST_PROJECTION = {
  name: 1,
  email: 1,
  phone: 1,
  role: 1,
  avatar: 1,
  createdAt: 1,
  lastActive: 1,
  lastLoginAt: 1,
  deviceType: 1,
  lastDeviceType: 1,
  appActivity: 1,
  hasFeedback: 1,
  pushNotificationsEnabled: 1,
  cartLastUpdated: 1,
  cartItemCount: { $sum: "$cartItems.quantity" },
};
const SEARCH_SELECT = "name email phone role avatar";

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));
const iso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
// Kayıt zamanı: createdAt alanı olmayan eski hesaplarda kimliğin içindeki oluşturma zamanı
const idTime = (id) => {
  const text = String(id || "");
  return OBJECT_ID.test(text) ? new Date(parseInt(text.slice(0, 8), 16) * 1000) : null;
};

const clampInt = (value, fallback, min, max) => {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};
const firstValue = (value) => (Array.isArray(value) ? value[0] : value);
const cleanQuery = (value) => {
  const text = firstValue(value);
  return typeof text === "string" ? text.trim().slice(0, MAX_QUERY_LENGTH) : "";
};
/** İstemciden gelen tarih: geçerli ve makul aralıkta (son ~400 gün, en fazla 1 gün ileri) değilse null */
const parseDate = (value, now = Date.now()) => {
  const text = firstValue(value);
  if (typeof text !== "string" || !text) return null;
  const date = new Date(text);
  const time = date.getTime();
  if (!Number.isFinite(time) || time < now - 400 * DAY || time > now + DAY) return null;
  return date;
};
/** "id1,id2" → geçerli ObjectId dizisi (en fazla 100, tekrarsız) */
export const parseIds = (value) => {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  const unique = [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => OBJECT_ID.test(id)))];
  return unique.slice(0, MAX_IDS).map(toObjectId);
};
const startOfServerDay = (now = Date.now()) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
};
const validTimeZone = (value) => {
  const tz = typeof value === "string" ? value.trim() : "";
  if (!tz || tz.length > 64 || !/^[A-Za-z0-9_/+\-:]+$/.test(tz)) return "Europe/Istanbul";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Europe/Istanbul";
  }
};

// ── Türkçe duyarsız arama ──────────────────────────────────────────
/** "Çağla İŞÇİ" → "cagla isci" */
export const foldSearch = (text) =>
  String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");

const LETTER_CLASSES = {
  a: "[aâAÂ]", c: "[cçCÇ]", g: "[gğGĞ]", i: "[iıİIîÎ]", o: "[oöOÖ]", s: "[sşSŞ]", u: "[uüUÜûÛ]",
};
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Katlanmış kelimeden düzenli ifade kaynağı: Türkçe harfler iki biçimiyle eşleşir, özel karakterler kaçışlıdır */
export const turkishPattern = (word) => {
  let pattern = "";
  for (const char of foldSearch(word)) pattern += LETTER_CLASSES[char] || escapeRegex(char);
  return pattern;
};

/**
 * q → MongoDB koşulu. Her kelime ad YA DA e-postada geçmeli (kelimeler VE ile bağlanır); 3+ rakam varsa
 * telefon da aranır (baştaki 90/0 atılır, rakamlar arasında boşluk/tire gibi ayraçlara izin verilir).
 * Aranacak bir şey yoksa null.
 */
export const buildSearchClause = (q) => {
  const text = cleanQuery(q);
  if (!text) return null;
  const words = text.split(/\s+/).filter(Boolean).slice(0, 6).map((word) => word.slice(0, 40));
  const wordClauses = words
    .map((word) => turkishPattern(word))
    .filter(Boolean)
    .map((pattern) => {
      const regex = new RegExp(pattern, "i");
      return { $or: [{ name: regex }, { email: regex }] };
    });
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length >= 12) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "").slice(0, 15);
  const phoneClause = digits.length >= 3 ? { phone: new RegExp(digits.split("").join("\\D*")) } : null;
  const nameClause = wordClauses.length === 0 ? null : wordClauses.length === 1 ? wordClauses[0] : { $and: wordClauses };
  if (nameClause && phoneClause) return { $or: [nameClause, phoneClause] };
  return nameClause || phoneClause;
};

// ── Aynı telefon numarası ──────────────────────────────────────────
/**
 * Telefonu karşılaştırma anahtarına çevirir: yalnızca rakamlar, baştaki ülke kodu (90) ve sıfırlar atılır,
 * son 10 hane alınır. "0555 111 22 33", "+90 555 111 2233" ve "5551112233" aynı anahtarı verir.
 * 10 haneden kısa (eksik/bozuk) numaralar karşılaştırılmaz: null.
 */
export const phoneKey = (phone) => {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length >= 12) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};
/** "5551112233" → "0555 111 22 33" */
export const formatPhoneKey = (key) => (key && key.length === 10 ? `0${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6, 8)} ${key.slice(8)}` : key || "");

/**
 * Aynı numarayı paylaşan hesap grupları (2+ hesap). Tüm koleksiyon üzerinden, sunucuda hesaplanır.
 * Gruplar en kalabalıktan aza, eşitlikte en yeni üyesi olan önce; grup içinde en eski hesap önce.
 * @returns {{ groups: Array<{ key, label, ids: string[] }>, byId: Map<string, { key, label, size, index }> }}
 */
export const duplicatePhoneGroups = async () => {
  const rows = await User.find({ phone: { $nin: [null, ""] } }).select("_id phone createdAt").lean();
  const byKey = new Map();
  for (const row of rows || []) {
    const key = phoneKey(row.phone);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ id: String(row._id), at: (row.createdAt ? new Date(row.createdAt) : idTime(row._id))?.getTime() || 0 });
  }
  const groups = [...byKey]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => {
      members.sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : 1));
      return { key, label: formatPhoneKey(key), ids: members.map((member) => member.id), newest: Math.max(...members.map((member) => member.at)) };
    })
    .sort((a, b) => (b.ids.length - a.ids.length) || (b.newest - a.newest) || (a.key < b.key ? -1 : 1))
    .map(({ key, label, ids }) => ({ key, label, ids }));
  const byId = new Map();
  for (const group of groups) {
    group.ids.forEach((id, index) => byId.set(id, { key: group.key, label: group.label, size: group.ids.length, index }));
  }
  return { groups, byId };
};

// ── Liste sorgusu ──────────────────────────────────────────────────
/** req.query → güvenli seçenekler (geçersiz değerler varsayılana döner) */
export const parseUserListQuery = (query = {}, now = Date.now()) => {
  const sort = firstValue(query.sort);
  const segment = firstValue(query.segment);
  const app = firstValue(query.app);
  return {
    page: clampInt(firstValue(query.page), 1, 1, 100000),
    limit: clampInt(firstValue(query.limit), USER_LIST_DEFAULT_LIMIT, 1, USER_LIST_MAX_LIMIT),
    sort: USER_LIST_SORTS.includes(sort) ? sort : "seen",
    segment: USER_LIST_SEGMENTS.includes(segment) ? segment : "all",
    q: cleanQuery(query.q),
    app: USER_APP_FILTERS.includes(app) ? app : null,
    appSince: parseDate(query.appSince, now),
    registeredSince: parseDate(query.registeredSince, now),
    ids: parseIds(query.ids),
  };
};

const CUSTOMER = { role: { $ne: "admin" } };
const seenSince = (since) => [
  { lastActive: { $gte: since } },
  { lastLoginAt: { $gte: since } },
  { "appActivity.lastSeenAt": { $gte: since } },
];

/** Segment koşulları (Müşteriler ekranındaki süzgeçler); noOrders için siparişi olan kullanıcı kimlikleri gerekir */
export const segmentClauses = (segment, { now = Date.now(), orderedIds = [], duplicatePhoneIds = [] } = {}) => {
  const activeSince = new Date(now - ACTIVE_DAYS * DAY);
  const newSince = new Date(now - NEW_DAYS * DAY);
  switch (segment) {
    case "active":
      return [CUSTOMER, { $or: seenSince(activeSince) }];
    case "risk":
      // 30+ gündür hiç görülmedi; yeni kayıtlar risk sayılmaz
      return [CUSTOMER, { $nor: seenSince(activeSince) }, { $or: [{ createdAt: { $lt: newSince } }, { createdAt: null }] }];
    case "new":
      return [CUSTOMER, { createdAt: { $gte: newSince } }];
    case "admin":
      return [{ role: "admin" }];
    case "noOrders":
      return [CUSTOMER, { _id: { $nin: orderedIds } }];
    case "dupPhone":
      // Yöneticiler de dahil: aynı numarayı paylaşan herkes
      return [{ _id: { $in: duplicatePhoneIds } }];
    default:
      return [];
  }
};

/** Mobil uygulama hunisi süzgeçleri (yöneticiler hariç); since: dönemin başlangıcı */
export const appClauses = (app, { since, now = Date.now() } = {}) => {
  const from = since instanceof Date ? since : startOfServerDay(now);
  const opened = { "appActivity.lastSeenAt": { $gte: from } };
  switch (app) {
    case "now":
      return [CUSTOMER, { "appActivity.lastSeenAt": { $gte: new Date(now - APP_ONLINE_MS) } }];
    case "opened":
      return [CUSTOMER, opened];
    case "checkout":
      return [CUSTOMER, opened, { $or: [{ "appActivity.orderAt": { $gte: from } }, { "appActivity.checkoutAt": { $gte: from } }] }];
    case "ordered":
      return [CUSTOMER, opened, { "appActivity.orderAt": { $gte: from } }];
    case "noOrder":
      return [CUSTOMER, opened, { "appActivity.orderAt": { $not: { $gte: from } } }];
    case "notOpened":
      return [CUSTOMER, { "appActivity.lastSeenAt": { $not: { $gte: from } } }];
    default:
      return [];
  }
};

/** Liste seçenekleri → MongoDB filtresi (aggregate'te de çalışır: kimlikler ObjectId'dir) */
export const buildUserListFilter = (options = {}, context = {}) => {
  const now = context.now ?? Date.now();
  const clauses = [...segmentClauses(options.segment, { now, orderedIds: context.orderedIds || [], duplicatePhoneIds: context.duplicatePhoneIds || [] })];
  if (options.app) clauses.push(...appClauses(options.app, { since: options.appSince, now }));
  if (options.registeredSince) clauses.push({ createdAt: { $gte: options.registeredSince } });
  if (options.ids?.length) clauses.push({ _id: { $in: options.ids } });
  const search = buildSearchClause(options.q);
  if (search) clauses.push(search);
  return clauses.length ? { $and: clauses } : {};
};

// ── Sipariş özeti ──────────────────────────────────────────────────
/** Kullanıcı başına iptal edilmemiş sipariş sayısı ve ürün harcaması (teslimat hariç). ids verilmezse herkes. */
export const orderStatsByUser = async (ids = null) => {
  if (Array.isArray(ids) && ids.length === 0) return new Map();
  const match = { status: { $in: COUNTED_ORDER_STATUSES }, user: Array.isArray(ids) ? { $in: ids } : { $ne: null } };
  const rows = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$user",
        orderCount: { $sum: 1 },
        totalSpent: { $sum: { $ifNull: ["$productTotal", "$totalAmount"] } },
      },
    },
  ]);
  return new Map((rows || []).filter((row) => row?._id).map((row) => [String(row._id), { orderCount: Number(row.orderCount) || 0, totalSpent: round2(row.totalSpent) }]));
};
/** Siparişi olan kullanıcıların kimlikleri ("Sipariş yok" süzgeci için) */
const orderedUserIds = async () => {
  const ids = await Order.distinct("user", { status: { $in: COUNTED_ORDER_STATUSES } });
  return (ids || []).filter(Boolean);
};

const appActivityOf = (activity) => ({
  visitStartedAt: iso(activity?.visitStartedAt),
  lastSeenAt: iso(activity?.lastSeenAt),
  checkoutAt: iso(activity?.checkoutAt),
  orderAt: iso(activity?.orderAt),
  visitCount: Number(activity?.visitCount) || 0,
});

/** Liste satırı: izin verilen alanlar dışında hiçbir şey dönmez (projeksiyon bozulsa bile) */
export const toListUser = (row, stat = null) => {
  const orderCount = Number(stat?.orderCount) || 0;
  const totalSpent = round2(stat?.totalSpent);
  return {
    _id: String(row._id),
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    role: row.role === "admin" ? "admin" : "customer",
    avatar: row.avatar || null,
    createdAt: iso(row.createdAt) || iso(idTime(row._id)),
    lastActive: iso(row.lastActive),
    lastLoginAt: iso(row.lastLoginAt),
    deviceType: row.deviceType || "unknown",
    lastDeviceType: row.lastDeviceType || "unknown",
    appActivity: appActivityOf(row.appActivity),
    hasFeedback: Boolean(row.hasFeedback),
    pushNotificationsEnabled: row.pushNotificationsEnabled !== false,
    cartItemCount: Number(row.cartItemCount) || 0,
    cartLastUpdated: iso(row.cartLastUpdated),
    orderCount,
    totalSpent,
    avgOrderValue: orderCount ? round2(totalSpent / orderCount) : 0,
  };
};
const toSearchUser = (row) => ({
  _id: String(row._id),
  name: row.name || "",
  email: row.email || "",
  phone: row.phone || "",
  role: row.role === "admin" ? "admin" : "customer",
  avatar: row.avatar || null,
});

const SORT_STAGES = {
  seen: { _seenAt: -1, _id: -1 },
  newest: { _id: -1 },
  oldest: { _id: 1 },
  name: { name: 1, _id: 1 },
};
const compareIdsDesc = (a, b) => (String(a) < String(b) ? 1 : String(a) > String(b) ? -1 : 0);

/**
 * GET /api/users (yönetici)
 * Sorgu: page (1+), limit (1–100, varsayılan 50), q (ad/e-posta/telefon, Türkçe duyarsız), sort
 * (seen|newest|oldest|name|spent|orders), segment (all|active|risk|new|admin|noOrders), app (now|opened|checkout|
 * ordered|noOrder|notOpened) + appSince (ISO), registeredSince (ISO), ids (virgülle en fazla 100 kimlik).
 * Yanıt: { success, users, total, page, pages, limit, serverTime }
 */
export const getAllUsers = async (req, res) => {
  try {
    const now = Date.now();
    const options = parseUserListQuery(req.query, now);
    // Aynı numara süzgecinde liste numara gruplarına göre sıralanır (seçilen sıralama yok sayılır)
    const phoneGroups = options.segment === "dupPhone" ? await duplicatePhoneGroups() : null;
    const byOrders = !phoneGroups && (options.sort === "spent" || options.sort === "orders");
    const statsMap = byOrders ? await orderStatsByUser() : null;
    const orderedIds = options.segment === "noOrders"
      ? (statsMap ? [...statsMap.keys()].map(toObjectId) : await orderedUserIds())
      : [];
    const duplicatePhoneIds = phoneGroups ? [...phoneGroups.byId.keys()].map(toObjectId) : [];
    const filter = buildUserListFilter(options, { now, orderedIds, duplicatePhoneIds });
    const { limit } = options;

    let total;
    let page;
    let rows;
    if (phoneGroups) {
      // Süzgece uyanlar grup sırasıyla (grup içinde en eski hesap önce); yalnızca sayfadakiler okunur
      const matched = new Set(duplicatePhoneIds.length ? (await User.find(filter).select("_id").lean()).map((doc) => String(doc._id)) : []);
      const ranked = phoneGroups.groups.flatMap((group) => group.ids).filter((id) => matched.has(id));
      total = ranked.length;
      page = Math.min(options.page, Math.max(1, Math.ceil(total / limit)));
      const pageIds = ranked.slice((page - 1) * limit, page * limit);
      const docs = pageIds.length
        ? await User.aggregate([{ $match: { _id: { $in: pageIds.map(toObjectId) } } }, { $project: LIST_PROJECTION }])
        : [];
      const byId = new Map((docs || []).map((doc) => [String(doc._id), doc]));
      rows = pageIds.map((id) => byId.get(String(id))).filter(Boolean);
    } else if (byOrders) {
      // Harcama / sipariş sayısına göre: eşleşen kimlikler sipariş özetiyle sıralanır, yalnızca sayfadakiler okunur
      const idDocs = await User.find(filter).select("_id").lean();
      total = idDocs.length;
      page = Math.min(options.page, Math.max(1, Math.ceil(total / limit)));
      const stat = (id) => statsMap.get(String(id)) || { orderCount: 0, totalSpent: 0 };
      const primary = options.sort === "spent" ? "totalSpent" : "orderCount";
      const secondary = options.sort === "spent" ? "orderCount" : "totalSpent";
      const ranked = idDocs.map((doc) => doc._id).sort((a, b) => {
        const sa = stat(a);
        const sb = stat(b);
        return (sb[primary] - sa[primary]) || (sb[secondary] - sa[secondary]) || compareIdsDesc(a, b);
      });
      const pageIds = ranked.slice((page - 1) * limit, page * limit);
      const docs = pageIds.length
        ? await User.aggregate([{ $match: { _id: { $in: pageIds.map(toObjectId) } } }, { $project: LIST_PROJECTION }])
        : [];
      const byId = new Map((docs || []).map((doc) => [String(doc._id), doc]));
      rows = pageIds.map((id) => byId.get(String(id))).filter(Boolean);
    } else {
      total = await User.countDocuments(filter);
      page = Math.min(options.page, Math.max(1, Math.ceil(total / limit)));
      const pipeline = [
        { $match: filter },
        ...(options.sort === "seen"
          ? [{ $addFields: { _seenAt: { $max: ["$lastActive", "$lastLoginAt", "$appActivity.lastSeenAt"] } } }]
          : []),
        { $sort: SORT_STAGES[options.sort] || SORT_STAGES.seen },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: LIST_PROJECTION },
      ];
      rows = total === 0 ? [] : await User.aggregate(pipeline, options.sort === "name" ? { collation: { locale: "tr", strength: 1 } } : {});
    }

    const stats = statsMap || await orderStatsByUser((rows || []).map((row) => row._id));
    res.status(200).json({
      success: true,
      users: (rows || []).map((row) => {
        const user = toListUser(row, stats.get(String(row._id)));
        const group = phoneGroups?.byId.get(String(row._id));
        return group ? { ...user, phoneGroup: group } : user;
      }),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      serverTime: new Date(now).toISOString(), // istemci tarafında zaman farkını hesaplamak için
    });
  } catch (error) {
    console.error("Kullanıcılar getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Kullanıcılar getirilirken hata oluştu" });
  }
};

/**
 * GET /api/users/stats (yönetici): Müşteriler ekranının KPI, süzgeç sayıları, uygulama hunisi ve kayıt grafiği.
 * Tümü sunucuda, koleksiyonun tamamı üzerinden ve listeyle AYNI filtrelerle sayılır.
 * Sorgu: appSince (ISO, huni dönemi başı), todayStart (ISO, yerel gün başı), tz (IANA saat dilimi, grafik için).
 */
export const getUserStats = async (req, res) => {
  try {
    const now = Date.now();
    const appSince = parseDate(req.query?.appSince, now) || startOfServerDay(now);
    const todayStart = parseDate(req.query?.todayStart, now) || startOfServerDay(now);
    const tz = validTimeZone(firstValue(req.query?.tz));
    const seriesSince = new Date(todayStart.getTime() - 29 * DAY);
    const orderedIds = await orderedUserIds();
    const count = (options) => User.countDocuments(buildUserListFilter(options, { now, orderedIds }));

    const [segmentCounts, today, appCounts, registrations, latest, phoneGroups] = await Promise.all([
      Promise.all(COUNTED_SEGMENTS.map((segment) => count({ segment }))),
      count({ segment: "all", registeredSince: todayStart }),
      Promise.all(USER_APP_FILTERS.map((app) => count({ segment: "all", app, appSince }))),
      User.aggregate([
        { $match: { ...CUSTOMER, createdAt: { $gte: seriesSince } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.find(CUSTOMER).sort({ _id: -1 }).limit(5).select(`${SEARCH_SELECT} createdAt`).lean(),
      // Özet yardımcı bilgidir: numara grupları hesaplanamazsa yalnızca bu sayı boş kalır
      duplicatePhoneGroups().catch((error) => { console.error("Aynı numara grupları hesaplanamadı:", error.message); return null; }),
    ]);

    const segments = Object.fromEntries(COUNTED_SEGMENTS.map((segment, index) => [segment, Number(segmentCounts[index]) || 0]));
    segments.dupPhone = phoneGroups ? phoneGroups.byId.size : null;
    const app = Object.fromEntries(USER_APP_FILTERS.map((id, index) => [id, Number(appCounts[index]) || 0]));
    res.status(200).json({
      success: true,
      stats: {
        total: segments.all,
        customers: Math.max(0, segments.all - segments.admin),
        admins: segments.admin,
        active: segments.active,
        risk: segments.risk,
        new: segments.new,
        noOrders: segments.noOrders,
        duplicatePhones: phoneGroups ? { groups: phoneGroups.groups.length, users: phoneGroups.byId.size } : null,
        today,
        segments,
        app,
        appSince: appSince.toISOString(),
        registrations: {
          since: seriesSince.toISOString(),
          tz,
          days: (registrations || []).filter((row) => row?._id).map((row) => ({ day: String(row._id), count: Number(row.count) || 0 })),
        },
        latest: (latest || []).map((row) => ({ ...toSearchUser(row), createdAt: iso(row.createdAt) || iso(idTime(row._id)) })),
      },
      serverTime: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("Müşteri özeti getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Müşteri özeti getirilirken hata oluştu" });
  }
};

/**
 * GET /api/users/search?q=&limit=8&exclude=id1,id2 (yönetici): seçiciler ve komut paleti için hafif arama.
 * Yanıt: { success, users: [{ _id, name, email, phone, role, avatar }] }
 */
export const searchUsers = async (req, res) => {
  try {
    const clause = buildSearchClause(req.query?.q);
    if (!clause) return res.status(200).json({ success: true, users: [] });
    const limit = clampInt(firstValue(req.query?.limit), USER_SEARCH_DEFAULT_LIMIT, 1, USER_SEARCH_MAX_LIMIT);
    const exclude = parseIds(req.query?.exclude);
    const filter = exclude.length ? { $and: [clause, { _id: { $nin: exclude } }] } : clause;
    const rows = await User.find(filter).select(SEARCH_SELECT).sort({ lastActive: -1, _id: -1 }).limit(limit).lean();
    res.status(200).json({ success: true, users: (rows || []).map(toSearchUser) });
  } catch (error) {
    console.error("Müşteri aranırken hata:", error);
    res.status(500).json({ success: false, message: "Müşteri aranırken hata oluştu" });
  }
};

// Şifre Sıfırlama fonksiyonu
export const resetUserPassword = async (req, res) => {
  const { userId } = req.params;
  const { tempPassword } = req.body;

  try {
    if (!tempPassword) {
      return res.status(400).json({ success: false, message: "Geçici şifre belirtilmedi" });
    }

    // Şifreyi hash'le
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Kullanıcının şifresini güncelle
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        password: hashedPassword,
        // İsteğe bağlı: kullanıcıya bir sonraki girişte şifre değiştirmeyi zorunlu kılma
        // passwordResetRequired: true
      },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    // Başarılı yanıt
    res.status(200).json({
      success: true,
      message: "Kullanıcı şifresi başarıyla sıfırlandı",
      user: updatedUser
    });
  } catch (error) {
    console.error("Şifre sıfırlanırken hata:", error);
    res.status(500).json({ success: false, message: "Şifre sıfırlanırken hata oluştu" });
  }
};

export const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { name, email, phone } = req.body;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email, phone },
      { new: true, runValidators: true }
    ).select("-password");
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Kullanıcı güncellenirken hata oluştu" });
  }
};

// DELETE /api/users/:userId (yönetici) — yalnızca müşteri hesabı silinir: ortak servis siparişleri
// korur (userDeleted işaretlenir), geri bildirimleri saklar, kişisel verileri temizler.
// Yönetici hesapları ve isteği yapanın kendi hesabı buradan silinemez. Yanıt: { success, message }
export const deleteUser = async (req, res) => {
  const userId = String(req.params?.userId || "");

  try {
    if (!/^[0-9a-f]{24}$/i.test(userId)) {
      return res.status(400).json({ success: false, message: "Geçersiz kullanıcı kimliği" });
    }
    if (req.user?._id && String(req.user._id).toLowerCase() === userId.toLowerCase()) {
      return res.status(400).json({ success: false, message: "Kendi hesabınızı buradan silemezsiniz" });
    }
    const user = await User.findById(userId).select("name email role").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    if (user.role === "admin") {
      return res.status(403).json({ success: false, message: "Yönetici hesapları silinemez. Önce yönetici yetkisini kaldırın." });
    }

    const { ordersAnonymized } = await deleteUserAccount(userId, { keepFeedback: true });
    recordAdminAction(req, {
      action: "Müşteri hesabı silindi",
      category: "customer",
      target: userId,
      targetName: user.name || user.email || "",
      changes: [{ label: "Korunan sipariş", from: "", to: String(ordersAnonymized || 0) }],
    });
    invalidateAccountCleanupCache().catch(() => {});
    res.status(200).json({ success: true, message: "Kullanıcı başarıyla silindi" });
  } catch (error) {
    if (error?.code === "USER_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    console.error("Kullanıcı silinirken hata:", error);
    res.status(500).json({ success: false, message: "Kullanıcı silinirken hata oluştu" });
  }
};
