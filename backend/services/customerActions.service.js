// Müşteri eylemleri: Müşteriler ekranında seçilen kişilere ya da süzgece uyan herkese tek seferde bildirim veya
// kişiye özel kupon (ör. bugün uygulamayı açıp sipariş vermeyenlere aynı akşam hatırlatma).
//
// Hedef iki biçimde gelir ve her uçta aynı kuralla çözülür:
//  - { userIds: [...] }  en fazla 1000 kimlik (Müşteriler listesinde işaretlenenler ya da tek müşteri)
//  - { filter: { segment, app, appSince, registeredSince, q } }  GET /api/users ile birebir aynı anlam
//    (userController.buildUserListFilter); en fazla 1000 kişi, en son görülenler önce.
// Yöneticiler hiçbir zaman hedeflenmez.
//
// Bildirim kuralları: yalnızca bildirim alabilecek (cihazı görünen, bildirimleri ve kampanya bildirimlerini açık)
// müşterilere gider; otomatik bildirimlerin gönderim saatleri dışında (sessiz saatler) açık onay ister; aynı metin son
// 10 dakikada aynı kişilerden birine gittiyse açık onay olmadan ikinci kez gönderilmez. Her gönderim PushBroadcast'e
// "custom" kitlesiyle yazılır (Bildirimler ekranının geçmişinde görünür).
// Kupon kuralları: kişi başına bir adet, tek kullanımlık, sahibine özel kupon (OZEL + rastgele kod). Aynı kupon son
// 10 dakikada aynı kişiye verildiyse o kişi atlanır (tekrar denenen istek ikinci kupon üretmez).
import crypto from "node:crypto";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Coupon from "../models/coupon.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import {
  USER_APP_FILTERS, USER_LIST_SEGMENTS, buildSearchClause, buildUserListFilter, duplicatePhoneGroups, orderStatsByUser, parseUserListQuery,
} from "../controllers/userController.js";
import { isPushConfigured, sendPushToUsers } from "./push.service.js";
import {
  getAutomationSettings, isReachableUser, isWithinSendWindow, istanbulParts, istanbulTime, normalizeAutomationSettings,
} from "./notificationAutomation.service.js";
import { roundMoney } from "./productPricing.js";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
export const TZ = "Europe/Istanbul";
export const TARGET_LIMIT = 1000;
export const SAMPLE_SIZE = 5;
export const DUPLICATE_WINDOW_MS = 10 * MINUTE;
export const CUSTOM_AUDIENCE = "custom";
// Bildirimler ekranının deneme gönderimleri (notification.controller TEST_AUDIENCE); tekrar denetimine girmez
const TEST_AUDIENCE = "self";

// Bildirim metni sınırı: 65/240, ama gönderim kaydı (PushBroadcast) daha kısa sınır koyuyorsa o geçerlidir;
// yoksa kayıt yazılamaz ve gönderim düşer. Şema sınırı yükseltilirse burası kendiliğinden genişler.
const schemaMax = (model, path, fallback) => {
  const option = model.schema.path(path)?.options?.maxlength;
  const value = Number(Array.isArray(option) ? option[0] : option);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
export const PUSH_TITLE_MAX = Math.min(65, schemaMax(PushBroadcast, "title", 60));
export const PUSH_BODY_MAX = Math.min(240, schemaMax(PushBroadcast, "body", 180));

// Bildirime dokununca açılacak ekran (mobil uygulamanın kabul ettiği yollar: push.service ALLOWED_ROUTE;
// Bildirimler ekranındaki seçeneklerle aynı)
export const PUSH_ROUTES = Object.freeze({ home: "/home", cart: "/cart", orders: "/orders", referral: "/referral", rate: "/rate-app" });
export const CHANNELS = ["push", "coupon"];

// Kupon sınırları (TL ve gün)
export const COUPON_LIMITS = Object.freeze({
  percentage: [1, 90],
  fixed: [1, 500],
  maximumDiscount: [1, 10000],
  minimumOrderAmount: [0, 10000],
  validDays: [1, 90],
});
export const COUPON_PREFIX = "OZEL";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 karakter; 0/O ve 1/I karışmasın
const CODE_LENGTH = 7;
const INSERT_CHUNK = 200;
// İşlem kaydına yazılan müşteri kimliği sayısı (ürün toplu işlemleriyle aynı sınır)
export const AUDIT_ID_LIMIT = 200;

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const NOT_ADMIN = { role: { $ne: "admin" } };
const RECIPIENT_FIELDS = "_id name role pushNotificationsEnabled notificationPreferences.campaigns appActivity.lastSeenAt fcmToken";
const RECIPIENT_PROJECTION = {
  name: 1, role: 1, pushNotificationsEnabled: 1, "notificationPreferences.campaigns": 1, "appActivity.lastSeenAt": 1, fcmToken: 1,
};
const FILTER_KEYS = ["segment", "app", "appSince", "registeredSince", "q"];
const SEGMENT_LABELS = {
  active: "Son 30 günde aktif",
  risk: "Risk altında (30+ gündür sessiz)",
  new: "Son 7 günde kayıt olan",
  noOrders: "Hiç sipariş vermemiş",
  dupPhone: "Aynı numarayla kayıtlı",
};
const APP_LABELS = {
  now: "Şu an uygulamada",
  opened: "Uygulamayı açtı",
  checkout: "Sepet / sipariş ekranına geldi",
  ordered: "Uygulamadan sipariş verdi",
  noOrder: "Uygulamayı açtı, sipariş vermedi",
  notOpened: "Uygulamayı açmadı",
};

// ── Hata ──────────────────────────────────────────────────────────────────
export class CustomerActionError extends Error {
  /** status: HTTP durumu, code: istemcinin ayırt ettiği kısa kod, extra: yanıta eklenen alanlar */
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "CustomerActionError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const invalid = (message, code = "invalid") => new CustomerActionError(400, code, message);

// ── Küçük yardımcılar ────────────────────────────────────────────────────
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isBlank = (value) => value === undefined || value === null || value === "";
/** Yalnızca sayı ya da sayı metni kabul edilir (dizi, nesne, mantıksal değer NaN olur) */
const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value.trim());
  return Number.NaN;
};
const idOf = (value) => String(value?._id ?? value ?? "");
const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));
const hashOf = (value) => crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
const num = (value) => Number(value || 0).toLocaleString("tr-TR");
/** 250 → "250 TL", 37.5 → "37,50 TL" */
export const tl = (value) => {
  const amount = roundMoney(value);
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })} TL`;
};

// ── İstanbul günü ────────────────────────────────────────────────────────
const pad2 = (value) => String(value).padStart(2, "0");
/** Tarihin İstanbul'daki takvim günü: "2026-11-02" */
export const istanbulDayKey = (date) => {
  const p = istanbulParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};
/** İstanbul'da bugünün başı (00:00) */
export const istanbulDayStart = (now = Date.now()) => {
  const p = istanbulParts(new Date(now));
  return istanbulTime(p.year, p.month, p.day, 0);
};
/** İstanbul'da verilen günün son anı (23:59:59.999); taşan gün sayısı normalize edilir (31 Ekim + 1 → 1 Kasım) */
export const istanbulEndOfDay = (year, month, day) => new Date(istanbulTime(year, month, day + 1, 0).getTime() - 1);
/** "YYYY-MM-DD" → { year, month, day } ya da (geçersiz/var olmayan gün) null */
export const parseDayKey = (value) => {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
};
const dayNumber = ({ year, month, day }) => Math.round(Date.UTC(year, month - 1, day) / DAY);
const longDay = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", weekday: "long" });
const shortStamp = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ── Hedef ────────────────────────────────────────────────────────────────
/**
 * İstek gövdesindeki hedefi doğrular. Bilinmeyen süzgeç alanı, geçersiz değer ya da boş süzgeç reddedilir
 * (yoksayılan bir süzgeç kitleyi sessizce büyütürdü).
 * @returns {{ type: "ids", ids: string[] } | { type: "filter", filter: object, options: object }}
 */
export const parseTarget = (raw, now = Date.now()) => {
  if (!isPlainObject(raw)) throw invalid("Kime gönderileceği seçilmedi", "invalid_target");
  const hasIds = raw.userIds !== undefined;
  const hasFilter = raw.filter !== undefined;
  if (hasIds === hasFilter) throw invalid("Hedef olarak ya seçili müşterileri ya da süzgeci gönderin", "invalid_target");

  if (hasIds) {
    if (!Array.isArray(raw.userIds) || !raw.userIds.length) throw invalid("Müşteri seçilmedi", "invalid_target");
    if (raw.userIds.length > TARGET_LIMIT) throw invalid(`Tek seferde en fazla ${num(TARGET_LIMIT)} müşteri seçilebilir`, "too_many");
    const ids = [];
    for (const value of raw.userIds) {
      if (typeof value !== "string" || !OBJECT_ID.test(value)) throw invalid("Geçersiz müşteri kimliği", "invalid_target");
      ids.push(value.toLowerCase());
    }
    return { type: "ids", ids: [...new Set(ids)] };
  }

  const source = raw.filter;
  if (!isPlainObject(source)) throw invalid("Geçersiz süzgeç", "invalid_filter");
  const unknown = Object.keys(source).filter((key) => !FILTER_KEYS.includes(key));
  if (unknown.length) throw invalid(`Bilinmeyen süzgeç: ${unknown.slice(0, 3).join(", ")}`, "invalid_filter");
  const filter = {};
  for (const key of FILTER_KEYS) {
    const value = source[key];
    if (isBlank(value)) continue;
    if (typeof value !== "string") throw invalid("Geçersiz süzgeç değeri", "invalid_filter");
    filter[key] = value.trim();
  }
  if (filter.segment && filter.segment !== "all" && !USER_LIST_SEGMENTS.includes(filter.segment)) throw invalid("Geçersiz müşteri grubu", "invalid_filter");
  if (filter.segment === "admin") throw invalid("Yöneticilere kupon ya da bildirim gönderilmez", "invalid_filter");
  if (filter.app && !USER_APP_FILTERS.includes(filter.app)) throw invalid("Geçersiz uygulama süzgeci", "invalid_filter");
  if (filter.q && filter.q.length > 100) throw invalid("Arama metni en fazla 100 karakter olabilir", "invalid_filter");

  const options = parseUserListQuery(filter, now);
  if (filter.appSince && filter.app && !options.appSince) throw invalid("Geçersiz uygulama dönemi", "invalid_filter");
  if (filter.registeredSince && !options.registeredSince) throw invalid("Geçersiz kayıt tarihi", "invalid_filter");
  if (!filter.app) {
    delete filter.appSince;
    options.appSince = null;
  } else if (options.app !== "now" && !options.appSince) {
    // Dönem verilmediyse sunucunun değil İstanbul'un bugünü
    options.appSince = istanbulDayStart(now);
    filter.appSince = options.appSince.toISOString();
  }
  // Arama metni ancak bir koşula dönüşüyorsa süzgeçtir: yalnızca aksan işareti gibi aranamayan bir metin liste ucunda
  // da yok sayılır ve hedef sessizce tüm müşterilere genişlerdi
  if (options.segment === "all" && !options.app && !options.registeredSince && !buildSearchClause(options.q)) {
    throw invalid("Süzgeç seçilmedi. Tüm müşterilere göndermek için Bildirimler ekranını kullanın.", "empty_filter");
  }
  return { type: "filter", filter, options };
};

/** Hedefin okunur açıklaması (işlem kaydı ve yanıt için; istemcinin gönderdiği etikete güvenilmez) */
export const describeTarget = (parsed, users = []) => {
  if (parsed.type === "ids") {
    const names = users.map((user) => String(user.name || "").trim() || "İsimsiz");
    if (!names.length) return "Seçili müşteri";
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} ve ${num(names.length - 2)} kişi daha`;
  }
  const { options } = parsed;
  const parts = [];
  if (SEGMENT_LABELS[options.segment]) parts.push(SEGMENT_LABELS[options.segment]);
  if (options.app) {
    const since = options.app !== "now" && options.appSince ? ` (${shortStamp.format(options.appSince)} itibarıyla)` : "";
    parts.push(`${APP_LABELS[options.app]}${since}`);
  }
  if (options.registeredSince) parts.push(`${shortStamp.format(options.registeredSince)} sonrası kayıt`);
  if (options.q) parts.push(`“${options.q}” araması`);
  return `Süzgeç: ${parts.join(" · ")}`;
};

/**
 * Hedefi müşteri listesine çevirir (yöneticiler hariç). Süzgeçte en son görülenler önce, en fazla TARGET_LIMIT kişi.
 * missing: seçilip bulunamayan ya da yönetici olan kimlikler; admins: süzgece uyup hariç tutulan yönetici hesapları
 * (liste "Tümü" + arama gibi süzgeçlerde yöneticileri de sayar, pencere farkı açıklayabilsin).
 * @returns {Promise<{ users: object[], requested: number, missing: number, admins: number, capped: boolean, matched: number }>}
 */
export const resolveTarget = async (parsed, { now = Date.now() } = {}) => {
  if (parsed.type === "ids") {
    const rows = await User.find({ _id: { $in: parsed.ids.map(toObjectId) }, ...NOT_ADMIN }).select(RECIPIENT_FIELDS).lean();
    const byId = new Map((rows || []).map((row) => [idOf(row).toLowerCase(), row]));
    const users = parsed.ids.map((id) => byId.get(id)).filter((user) => user && user.role !== "admin");
    return { users, requested: parsed.ids.length, missing: parsed.ids.length - users.length, admins: 0, capped: false, matched: users.length };
  }

  const { options } = parsed;
  // "Hiç sipariş vermemiş" ve "Aynı numara" süzgeçleri liste ucuyla aynı kaynaktan beslenir
  const orderedIds = options.segment === "noOrders" ? [...(await orderStatsByUser()).keys()].map(toObjectId) : [];
  const phoneGroups = options.segment === "dupPhone" ? await duplicatePhoneGroups() : null;
  const duplicatePhoneIds = phoneGroups ? [...phoneGroups.byId.keys()].map(toObjectId) : [];
  const filter = buildUserListFilter(options, { now, orderedIds, duplicatePhoneIds });
  const match = Object.keys(filter).length ? { $and: [filter, NOT_ADMIN] } : NOT_ADMIN;
  // Segment ve uygulama süzgeçleri yöneticileri zaten dışlar; yalnızca "Tümü"/"Aynı numara" + arama/kayıt günü dışlamaz
  const mayIncludeAdmins = (options.segment === "all" || options.segment === "dupPhone") && !options.app;
  const [rows, admins] = await Promise.all([
    User.aggregate([
      { $match: match },
      { $addFields: { _seenAt: { $max: ["$lastActive", "$lastLoginAt", "$appActivity.lastSeenAt"] } } },
      { $sort: { _seenAt: -1, _id: -1 } },
      { $limit: TARGET_LIMIT + 1 },
      { $project: RECIPIENT_PROJECTION },
    ]),
    mayIncludeAdmins ? User.countDocuments(Object.keys(filter).length ? { $and: [filter, { role: "admin" }] } : { role: "admin" }) : 0,
  ]);
  const list = (rows || []).filter((user) => user && user.role !== "admin");
  const capped = list.length > TARGET_LIMIT;
  const users = list.slice(0, TARGET_LIMIT);
  const matched = capped ? await User.countDocuments(match) : users.length;
  return { users, requested: users.length, missing: 0, admins: Number(admins) || 0, capped, matched: Math.max(matched, users.length) };
};

/** Bildirim alabilir mi? (yönetici değil, bildirimleri ve kampanya bildirimleri açık, cihazı görünüyor) */
export const canReceivePush = (user) => isReachableUser(user);

// ── Sessiz saatler ───────────────────────────────────────────────────────
/** Otomatik bildirimlerin gönderim saatleri (Bildirimler › Otomatik); dışında kalan saatler "sessiz" sayılır */
export const getQuietHours = async (now = new Date()) => {
  let window;
  try {
    ({ window } = await getAutomationSettings());
  } catch (error) {
    console.error("Bildirim gönderim saatleri okunamadı, varsayılan kullanılıyor:", error.message);
    ({ window } = normalizeAutomationSettings(null));
  }
  return { active: !isWithinSendWindow(window, now), start: window.start, end: window.end };
};
const quietHoursError = (quiet) => new CustomerActionError(409, "quiet_hours",
  `Şu an sessiz saatler: otomatik bildirimler yalnızca ${quiet.start}–${quiet.end} arasında gider. Yine de göndermek için onaylayın.`,
  { quietHours: quiet });

// ── Mesaj ────────────────────────────────────────────────────────────────
/** Başlık, mesaj ve açılacak ekranı doğrular. Müşteriye giden metin olduğu için boş bırakılamaz. */
export const parseMessage = (raw, { routeKey, defaultRoute = "home" } = {}) => {
  const source = isPlainObject(raw) ? raw : {};
  if (!isBlank(source.title) && typeof source.title !== "string") throw invalid("Başlık geçersiz", "invalid_message");
  if (!isBlank(source.body) && typeof source.body !== "string") throw invalid("Mesaj geçersiz", "invalid_message");
  const title = String(source.title || "").trim();
  const body = String(source.body || "").trim();
  if (!title || title.length > PUSH_TITLE_MAX) throw invalid(`Başlık 1–${PUSH_TITLE_MAX} karakter olmalı`, "invalid_message");
  if (!body || body.length > PUSH_BODY_MAX) throw invalid(`Mesaj 1–${PUSH_BODY_MAX} karakter olmalı`, "invalid_message");
  const key = isBlank(routeKey) ? defaultRoute : routeKey;
  if (typeof key !== "string" || !PUSH_ROUTES[key]) throw invalid("Geçersiz açılış ekranı", "invalid_route");
  return { title, body, routeKey: key, route: PUSH_ROUTES[key] };
};

// ── Bildirim tekrar denetimi ─────────────────────────────────────────────
// Tek süreç (PM2) çalıştığı için son gönderimlerin alıcıları bellekte tutulur (PushBroadcast kaydı alıcı listesi
// saklamaz). Sunucu yeniden başladıysa alıcıları bilinmeyen aynı metinli kayıt, çakışıyor sayılır (temkinli).
const recentRecipients = new Map(); // broadcastId → { at, recipients: Set<string> }
const RECENT_MAX = 300;
const inFlight = new Set();
const pruneRecent = (now) => {
  for (const [id, entry] of recentRecipients) {
    if (now - entry.at > DUPLICATE_WINDOW_MS) recentRecipients.delete(id);
  }
  while (recentRecipients.size > RECENT_MAX) recentRecipients.delete(recentRecipients.keys().next().value);
};
const rememberRecipients = (broadcastId, ids, at) => {
  pruneRecent(at);
  recentRecipients.set(String(broadcastId), { at, recipients: new Set(ids.map((id) => idOf(id).toLowerCase())) });
};
/** Testler ve süreç içi temizlik için bellekteki kayıtları siler */
export const resetCustomerActionMemory = () => {
  recentRecipients.clear();
  inFlight.clear();
};
const acquire = (key) => {
  if (inFlight.has(key)) {
    // Aynı pencerede çift gönderim zaten engellenir; buraya başka bir sekmeden ya da başka bir yöneticiden gelinir
    throw new CustomerActionError(409, "in_progress", "Aynı gönderim şu anda başka bir pencerede sürüyor. Birkaç saniye bekleyip sonucu Bildirimler geçmişinden ya da Kuponlar ekranından kontrol edin; tekrar göndermeyin.");
  }
  inFlight.add(key);
  return () => inFlight.delete(key);
};

/**
 * Aynı başlık+mesaj son 10 dakikada bu kişilerden birine gitti mi? (yalnızca başarılı gönderimler; denemeler hariç)
 * @returns {Promise<null | { overlap: number|null, sentAt: Date }>} overlap null: alıcılar bilinmiyor
 */
export const findDuplicatePush = async ({ title, body, recipientIds, now = Date.now() }) => {
  pruneRecent(now);
  const records = await PushBroadcast.find({
    title, body, sent: true, audience: { $ne: TEST_AUDIENCE }, createdAt: { $gte: new Date(now - DUPLICATE_WINDOW_MS) },
  }).sort({ createdAt: -1 }).limit(20).select("_id createdAt").lean();
  if (!records?.length) return null;
  const wanted = new Set(recipientIds.map((id) => idOf(id).toLowerCase()));
  for (const record of records) {
    const known = recentRecipients.get(idOf(record));
    if (!known) return { overlap: null, sentAt: record.createdAt };
    let overlap = 0;
    for (const id of known.recipients) if (wanted.has(id)) overlap += 1;
    if (overlap > 0) return { overlap, sentAt: record.createdAt };
  }
  return null;
};
const minutesAgo = (date, now) => Math.max(1, Math.round((now - new Date(date).getTime()) / MINUTE));
const duplicateError = (duplicate, now) => new CustomerActionError(409, "duplicate",
  duplicate.overlap
    ? `Aynı bildirim ${minutesAgo(duplicate.sentAt, now)} dk önce bu kişilerden ${num(duplicate.overlap)} kişiye gönderildi. İkinci kez göndermek için onaylayın.`
    : `Aynı bildirim ${minutesAgo(duplicate.sentAt, now)} dk önce gönderildi. İkinci kez göndermek için onaylayın.`,
  { overlap: duplicate.overlap, sentAt: new Date(duplicate.sentAt).toISOString() });

/** Gönderim sonucu → sayılar. sent: cihaza giden; failed: denenip ulaşmayan; skipped: hiç denenmeyen */
export const summarizePush = (total, attempted, result) => {
  // "error": push.service beklenmeyen hatada kimseyi sayamadan döner; denenenlerin hepsi ulaşmadı sayılır
  const targeted = result?.reason === "error" ? attempted : Number(result?.targeted) || 0;
  const unreachable = Math.min(targeted, Number(result?.unreachable) || 0);
  const sent = result?.sent ? Math.max(0, targeted - unreachable) : 0;
  const failed = result?.sent ? unreachable : targeted;
  return { sent, failed, skipped: Math.max(0, total - attempted) + Math.max(0, attempted - targeted) };
};

/**
 * Kayıt + gönderim: PushBroadcast "custom" kaydı açılır, bildirim push.service ile (OneSignal'a 2000'lik paketlerle)
 * gönderilir, sonuç kayda yazılır. Hata fırlatmaz (push.service gibi); veritabanı hatası yukarı iletilir.
 */
const deliverPush = async ({ recipients, message, total, actorId, now }) => {
  const ids = recipients.map((user) => idOf(user));
  const record = await PushBroadcast.create({
    title: message.title, body: message.body, audience: CUSTOM_AUDIENCE, route: message.route, audienceSize: total, sentBy: actorId,
  });
  const result = await sendPushToUsers(ids, { title: message.title, body: message.body },
    { type: "broadcast", broadcastId: idOf(record), route: message.route }, { category: "campaigns" });
  try {
    await PushBroadcast.updateOne({ _id: record._id }, { $set: {
      targetedCount: result.targeted, sent: result.sent, failureReason: result.sent ? null : result.reason || "unknown", unreachableCount: result.unreachable || 0,
    } });
  } catch (error) {
    // Bildirim gitti ya da gitmedi; kayıt güncellenemese de sonuç yöneticiye doğru bildirilir
    console.error("Müşteri bildirimi kaydı güncellenemedi:", error.message);
  }
  if (result.sent) rememberRecipients(record._id, ids, typeof now === "number" ? now : new Date(now).getTime());
  return { result, broadcastId: idOf(record) };
};

// ── Önizleme ─────────────────────────────────────────────────────────────
/** POST /preview: kaç kişi, kaçına bildirim ulaşır, örnek adlar, sınırlar ve sessiz saat bilgisi */
export const previewCustomerAction = async (body = {}, { now = Date.now() } = {}) => {
  const channel = body?.channel;
  if (!CHANNELS.includes(channel)) throw invalid("Geçersiz eylem türü (bildirim ya da kupon)", "invalid_channel");
  const parsed = parseTarget(body?.target, now);
  const [resolved, quietHours] = await Promise.all([resolveTarget(parsed, { now }), getQuietHours(new Date(now))]);
  const { users } = resolved;
  const reachable = users.filter(canReceivePush).length;
  return {
    channel,
    total: users.length,
    reachable,
    unreachable: users.length - reachable,
    sample: users.slice(0, SAMPLE_SIZE).map((user) => ({ _id: idOf(user), name: String(user.name || "") })),
    capped: resolved.capped,
    matched: resolved.matched,
    missing: resolved.missing,
    admins: resolved.admins,
    pushConfigured: isPushConfigured(),
    quietHours,
    limits: { title: PUSH_TITLE_MAX, body: PUSH_BODY_MAX, targets: TARGET_LIMIT },
    target: { type: parsed.type, label: describeTarget(parsed, users) },
  };
};

// ── Bildirim ─────────────────────────────────────────────────────────────
/**
 * POST /push: hedefteki bildirim alabilir müşterilere tek bildirim.
 * @returns {Promise<object>} { sent, failed, skipped, total, reachable, broadcastId, ... } ve işlem kaydı bilgisi
 */
export const sendCustomerPush = async (body = {}, { actorId, now = Date.now() } = {}) => {
  const message = parseMessage(body, { routeKey: body?.route, defaultRoute: "home" });
  const parsed = parseTarget(body?.target, now);
  if (!isPushConfigured()) throw new CustomerActionError(503, "not_configured", "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)");
  const release = acquire(`push:${hashOf([message.title, message.body])}`);
  try {
    const resolved = await resolveTarget(parsed, { now });
    const { users } = resolved;
    if (!users.length) throw new CustomerActionError(400, "empty_target", "Bu hedefte müşteri yok (yöneticiler ve silinmiş hesaplar atlanır)");
    const recipients = users.filter(canReceivePush);
    if (!recipients.length) {
      throw new CustomerActionError(422, "no_reachable", "Bu kişilerin hiçbirine bildirim ulaşamıyor: bildirimleri kapalı ya da uygulamayı bildirim destekli sürümde açmamışlar.");
    }
    const quiet = await getQuietHours(new Date(now));
    if (quiet.active && body?.confirmQuietHours !== true) throw quietHoursError(quiet);
    if (body?.confirmDuplicate !== true) {
      const duplicate = await findDuplicatePush({ title: message.title, body: message.body, recipientIds: recipients.map(idOf), now });
      if (duplicate) throw duplicateError(duplicate, now);
    }
    const { result, broadcastId } = await deliverPush({ recipients, message, total: users.length, actorId, now });
    const counts = summarizePush(users.length, recipients.length, result);
    return {
      ...counts,
      total: users.length,
      reachable: recipients.length,
      capped: resolved.capped,
      matched: resolved.matched,
      missing: resolved.missing,
      delivered: Boolean(result.sent),
      reason: result.sent ? null : result.reason || null,
      detail: result.sent ? "" : result.detail || "",
      broadcastId,
      message,
      quietHours: quiet,
      targetLabel: describeTarget(parsed, users),
      targetType: parsed.type,
      userIds: recipients.map(idOf),
    };
  } finally {
    release();
  }
};

// ── Kupon ────────────────────────────────────────────────────────────────
const inRange = (value, [min, max]) => Number.isFinite(value) && value >= min && value <= max;
const optionalMoney = (value, range, label) => {
  if (isBlank(value)) return null;
  const amount = toNumber(value);
  if (!inRange(amount, range)) throw invalid(`${label} ${num(range[0])}–${num(range[1])} TL arasında olmalı`, "invalid_coupon");
  return roundMoney(amount);
};

/**
 * Kupon ayarını doğrular. Bitiş: expiresOn ("YYYY-MM-DD", o günün İstanbul 23:59:59.999'u) ya da validDays
 * (bugünden N gün sonrasının sonu); ikisi birden gönderilemez.
 */
export const parseCouponInput = (raw, now = Date.now()) => {
  if (!isPlainObject(raw)) throw invalid("Kupon bilgisi eksik", "invalid_coupon");
  const discountType = raw.discountType;
  if (discountType !== "percentage" && discountType !== "fixed") throw invalid("Kupon türü yüzde ya da tutar olmalı", "invalid_coupon");
  const value = toNumber(raw.value);
  if (discountType === "percentage") {
    if (!Number.isInteger(value) || !inRange(value, COUPON_LIMITS.percentage)) throw invalid("Yüzde indirim 1 ile 90 arasında tam sayı olmalı", "invalid_coupon");
  } else if (!inRange(value, COUPON_LIMITS.fixed)) {
    throw invalid("Tutar indirimi 1–500 TL arasında olmalı", "invalid_coupon");
  }
  const maximumDiscount = discountType === "percentage" ? optionalMoney(raw.maximumDiscount, COUPON_LIMITS.maximumDiscount, "En fazla indirim") : null;
  const minimumOrderAmount = optionalMoney(raw.minimumOrderAmount, COUPON_LIMITS.minimumOrderAmount, "Alt sepet tutarı") ?? 0;

  const today = parseDayKey(istanbulDayKey(new Date(now)));
  const hasDate = !isBlank(raw.expiresOn);
  const hasDays = !isBlank(raw.validDays);
  if (hasDate === hasDays) throw invalid("Son kullanma günü ya da geçerlilik süresi (gün) seçin", "invalid_coupon");
  let expiresDay;
  if (hasDate) {
    expiresDay = parseDayKey(raw.expiresOn);
    if (!expiresDay) throw invalid("Son kullanma tarihi geçersiz (YYYY-AA-GG)", "invalid_coupon");
  } else {
    const days = toNumber(raw.validDays);
    if (!Number.isInteger(days) || !inRange(days, COUPON_LIMITS.validDays)) throw invalid("Geçerlilik 1–90 gün olmalı", "invalid_coupon");
    const target = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
    expiresDay = { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate() };
  }
  const offset = dayNumber(expiresDay) - dayNumber(today);
  if (offset < 0) throw invalid("Son kullanma günü geçmiş olamaz", "invalid_coupon");
  if (offset > COUPON_LIMITS.validDays[1]) throw invalid("Son kullanma günü en fazla 90 gün sonrası olabilir", "invalid_coupon");
  const expirationDate = istanbulEndOfDay(expiresDay.year, expiresDay.month, expiresDay.day);
  return {
    discountType,
    value: discountType === "fixed" ? roundMoney(value) : value,
    maximumDiscount,
    minimumOrderAmount,
    expirationDate,
    expiresOn: `${expiresDay.year}-${pad2(expiresDay.month)}-${pad2(expiresDay.day)}`,
    daysLeft: offset,
  };
};

/** "%10" / "50 TL" */
export const discountValueText = (coupon) => (coupon.discountType === "fixed" ? tl(coupon.value) : `%${coupon.value}`);
/** " (en fazla 75 TL)" ya da "" (yalnızca yüzde indirimde üst sınır varsa) */
const capText = (coupon) => (coupon.discountType === "percentage" && coupon.maximumDiscount ? ` (en fazla ${tl(coupon.maximumDiscount)})` : "");
/** "%10 (en fazla 75 TL)" / "50 TL" */
export const discountText = (coupon) => `${discountValueText(coupon)}${capText(coupon)}`;
/** Son gün metni: "bugün", "yarın" ya da "9 Kasım Pazartesi" */
export const expiryText = (coupon) => {
  if (coupon.daysLeft === 0) return "bugün";
  if (coupon.daysLeft === 1) return "yarın";
  return longDay.format(coupon.expirationDate);
};
/** Uygulamadaki kupon kartında görünen açıklama (müşteriye: "sen" dili) */
export const couponDescription = (coupon) => {
  const minimum = coupon.minimumOrderAmount > 0 ? ` ${tl(coupon.minimumOrderAmount)} ve üzeri siparişinde geçerli.` : "";
  return `Sana özel ${discountValueText(coupon)} indirim${capText(coupon)}.${minimum} Tek kullanımlık.`;
};
/** Kupon bildiriminin varsayılan metni (müşteriye: "sen" dili) */
export const defaultCouponMessage = (coupon) => {
  const until = coupon.daysLeft <= 1 ? `${coupon.daysLeft === 0 ? "Bugün" : "Yarın"} 23:59'a kadar geçerli` : `Son gün ${longDay.format(coupon.expirationDate)}`;
  return {
    title: "Sana özel kupon 🎁",
    body: `${discountValueText(coupon)} indirim kuponun hazır${capText(coupon)}. ${until}; sepette kullanabilirsin.`.slice(0, PUSH_BODY_MAX),
  };
};

export const generateCouponCode = (randomBytes = crypto.randomBytes) => {
  let code = COUPON_PREFIX;
  for (const byte of randomBytes(CODE_LENGTH)) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
};

const isDuplicateKeyError = (error) => Boolean(error) && (
  error.code === 11000
  || (Array.isArray(error.writeErrors) && error.writeErrors.some((item) => (item?.code ?? item?.err?.code) === 11000))
  || /E11000/.test(String(error.message || ""))
);

/** Kod çakışırsa yeni kodla en fazla 3 kez dener; başaramazsa null */
const createOneCoupon = async (doc) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const code = attempt ? generateCouponCode() : doc.code;
      await Coupon.create({ ...doc, code });
      return { ...doc, code };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        console.error("Müşteri kuponu oluşturulamadı:", error.message);
        return null;
      }
    }
  }
  return null;
};

/**
 * Sahip başına bir kupon yazar. Kod çakışmaları önceden elenir; toplu yazımda hata olursa hangi kodların yazıldığı
 * veritabanından okunur, yalnızca kod çakışmasında yazılamayanlar tek tek yeniden denenir (iki kupon oluşmaz).
 * @returns {Promise<{ created: object[], failed: object[] }>}
 */
export const createCouponsFor = async (owners, fields) => {
  const pending = owners.map((owner) => ({ ...fields, userId: owner._id, code: generateCouponCode() }));
  for (let round = 0; round < 3 && pending.length; round += 1) {
    const taken = new Set(((await Coupon.find({ code: { $in: pending.map((doc) => doc.code) } }).select("code").lean()) || []).map((row) => row.code));
    const seen = new Set();
    let changed = false;
    for (const doc of pending) {
      if (taken.has(doc.code) || seen.has(doc.code)) {
        doc.code = generateCouponCode();
        changed = true;
      }
      seen.add(doc.code);
    }
    if (!changed) break;
  }
  const created = [];
  const failed = [];
  for (let start = 0; start < pending.length; start += INSERT_CHUNK) {
    const chunk = pending.slice(start, start + INSERT_CHUNK);
    try {
      await Coupon.insertMany(chunk, { ordered: false });
      created.push(...chunk);
    } catch (error) {
      let written = null;
      try {
        const rows = await Coupon.find({ code: { $in: chunk.map((doc) => doc.code) } }).select("code userId").lean();
        written = new Set((rows || []).filter((row) => chunk.some((doc) => doc.code === row.code && idOf(doc.userId) === idOf(row.userId))).map((row) => row.code));
      } catch (checkError) {
        console.error("Müşteri kuponlarının yazılıp yazılmadığı okunamadı:", checkError.message);
      }
      if (!written) {
        // Hangilerinin yazıldığı bilinmiyor: yeniden denenirse aynı kişiye ikinci kupon çıkabilir
        failed.push(...chunk);
        console.error("Müşteri kuponları yazılamadı:", error.message);
        continue;
      }
      const retry = isDuplicateKeyError(error);
      for (const doc of chunk) {
        if (written.has(doc.code)) {
          created.push(doc);
        } else {
          const again = retry ? await createOneCoupon(doc) : null;
          if (again) created.push(again);
          else failed.push(doc);
        }
      }
      if (!retry) console.error("Müşteri kuponlarının bir kısmı yazılamadı:", error.message);
    }
  }
  return { created, failed };
};

/** Son 10 dakikada aynı kuponu (aynı indirim, alt tutar, son gün) almış müşteriler */
const recentlyCouponed = async (ownerIds, coupon, now) => {
  if (!ownerIds.length) return new Set();
  const rows = await Coupon.find({
    userId: { $in: ownerIds.map(toObjectId) },
    code: { $regex: `^${COUPON_PREFIX}` },
    createdAt: { $gte: new Date(now - DUPLICATE_WINDOW_MS) },
    discountType: coupon.discountType,
    ...(coupon.discountType === "percentage" ? { discountPercentage: coupon.value } : { discountAmount: coupon.value }),
    minimumOrderAmount: coupon.minimumOrderAmount,
    maximumDiscount: coupon.maximumDiscount,
    expirationDate: coupon.expirationDate,
  }).select("userId").lean();
  return new Set((rows || []).map((row) => idOf(row.userId).toLowerCase()));
};

/**
 * POST /coupons: hedefteki her müşteriye bir kişiye özel, tek kullanımlık kupon; isteğe bağlı "Sana özel kupon"
 * bildirimi (yalnızca kupon alan ve bildirim alabilen müşterilere).
 */
export const giveCustomerCoupons = async (body = {}, { actorId, now = Date.now() } = {}) => {
  const coupon = parseCouponInput(body?.coupon, now);
  if (body?.notify !== undefined && typeof body.notify !== "boolean") throw invalid("Bildirim seçeneği geçersiz", "invalid_message");
  const notify = body?.notify === true;
  const rawMessage = isPlainObject(body?.message) ? body.message : {};
  const fallback = defaultCouponMessage(coupon);
  const message = notify
    ? parseMessage({ title: isBlank(rawMessage.title) ? fallback.title : rawMessage.title, body: isBlank(rawMessage.body) ? fallback.body : rawMessage.body },
      { routeKey: body?.route, defaultRoute: "cart" })
    : null;
  const parsed = parseTarget(body?.target, now);
  if (notify && !isPushConfigured()) {
    throw new CustomerActionError(503, "not_configured", "Bildirim servisi yapılandırılmamış. Kuponu bildirimsiz verebilirsiniz.");
  }
  const release = acquire(`coupon:${hashOf([coupon.discountType, coupon.value, coupon.maximumDiscount, coupon.minimumOrderAmount, coupon.expiresOn])}`);
  try {
    const resolved = await resolveTarget(parsed, { now });
    const { users } = resolved;
    if (!users.length) throw new CustomerActionError(400, "empty_target", "Bu hedefte müşteri yok (yöneticiler ve silinmiş hesaplar atlanır)");
    // Aynı kuponu son 10 dakikada almış olanlar atlanır (tekrar denenen istek ikinci kupon üretmez)
    const already = await recentlyCouponed(users.map(idOf), coupon, now);
    const owners = users.filter((user) => !already.has(idOf(user).toLowerCase()));
    // Sessiz saat onayı kupon yazılmadan önce istenir; bildirim kimseye gitmeyecekse sorulmaz
    const quiet = await getQuietHours(new Date(now));
    if (notify && owners.some(canReceivePush) && quiet.active && body?.confirmQuietHours !== true) throw quietHoursError(quiet);
    const fields = {
      description: couponDescription(coupon),
      discountType: coupon.discountType,
      discountPercentage: coupon.discountType === "percentage" ? coupon.value : 0,
      discountAmount: coupon.discountType === "fixed" ? coupon.value : 0,
      minimumOrderAmount: coupon.minimumOrderAmount,
      maximumDiscount: coupon.maximumDiscount,
      usageLimit: 1,
      userUsageLimit: 1,
      expirationDate: coupon.expirationDate,
      isActive: true,
    };
    const { created, failed } = owners.length ? await createCouponsFor(owners, fields) : { created: [], failed: [] };
    if (owners.length && !created.length) {
      throw new CustomerActionError(500, "create_failed", "Kuponlar oluşturulamadı. Bağlantıyı kontrol edip tekrar deneyin; aynı kişilere ikinci kupon çıkmaz.");
    }

    const createdOwners = new Set(created.map((doc) => idOf(doc.userId).toLowerCase()));
    const recipients = notify ? users.filter((user) => createdOwners.has(idOf(user).toLowerCase()) && canReceivePush(user)) : [];
    let push = null;
    if (recipients.length) {
      try {
        const { result, broadcastId } = await deliverPush({ recipients, message, total: createdOwners.size, actorId, now });
        push = { result, broadcastId, counts: summarizePush(recipients.length, recipients.length, result) };
      } catch (error) {
        // Kuponlar yazıldı; bildirim kaydı açılamadı. Kuponlar geri alınmaz, yönetici bildirimin gitmediğini görür.
        console.error("Kupon bildirimi gönderilemedi:", error.message);
        const result = { targeted: recipients.length, sent: false, reason: "error", detail: error.message, unreachable: 0 };
        push = { result, broadcastId: null, counts: summarizePush(recipients.length, recipients.length, result) };
      }
    }
    return {
      created: created.length,
      skipped: already.size + resolved.missing,
      duplicates: already.size,
      failed: failed.length,
      pushed: push?.counts.sent || 0,
      pushFailed: push?.counts.failed || 0,
      pushReason: push && !push.result.sent ? push.result.reason || null : null,
      notify,
      total: users.length,
      reachable: users.filter(canReceivePush).length,
      capped: resolved.capped,
      matched: resolved.matched,
      missing: resolved.missing,
      broadcastId: push?.broadcastId || null,
      coupon: {
        discountType: coupon.discountType,
        value: coupon.value,
        maximumDiscount: coupon.maximumDiscount,
        minimumOrderAmount: coupon.minimumOrderAmount,
        expiresOn: coupon.expiresOn,
        expirationDate: coupon.expirationDate.toISOString(),
        description: fields.description,
        label: discountText(coupon),
        expiryLabel: expiryText(coupon),
      },
      message,
      quietHours: quiet,
      targetLabel: describeTarget(parsed, users),
      targetType: parsed.type,
      userIds: created.map((doc) => idOf(doc.userId)),
      codes: created.map((doc) => doc.code),
    };
  } finally {
    release();
  }
};
