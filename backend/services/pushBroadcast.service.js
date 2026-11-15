// Toplu bildirimin ortak çekirdeği: hedef kitle + bölge süzgeci, gönderim (anlık ve planlı aynı yoldan geçer),
// alıcı kaydı ve "bildirimden sonra sipariş veren" ölçümü. Denetleyici (notification.controller) ve planlı
// gönderim zamanlayıcısı (pushSchedule.service) bu dosyayı kullanır.
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { sendPushToUsers } from "./push.service.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY_MS = 24 * HOUR;
const CANCELLED = "İptal Edildi";
export const DUPLICATE_WINDOW_MS = 10 * MINUTE;
export const TITLE_LIMIT = 60;
export const BODY_LIMIT = 180;

// rate: uygulamanın mağaza sayfasını açar (puan ve yorum için)
export const BROADCAST_ROUTES = { home: "/home", cart: "/cart", orders: "/orders", referral: "/referral", rate: "/rate-app" };
/** Kayıttaki rota → paneldeki ekran anahtarı (bilinmeyen rota: "home") */
export const targetOfRoute = (route) => Object.keys(BROADCAST_ROUTES).find((key) => BROADCAST_ROUTES[key] === route) || "home";

export const BROADCAST_AUDIENCES = {
  all: "Tüm müşteriler",
  cart: "Sepetinde ürün olanlar",
  active30: "Son 30 günde sipariş verenler",
  inactive30: "30 gündür sipariş vermeyenler",
  noOrder: "Hiç sipariş vermeyenler",
};

// Bildirimi herkese göndermeden önce tek bir telefonda denemek için. Adı geriye uyumluluk için "self" kalır;
// deneme, paneldeki test alıcısına gider (bkz. resolveTestRecipient: seçilen hesap > kayıtlı alıcı > gönderen yönetici).
export const TEST_AUDIENCE = "self";
// Müşteriler ekranından seçili kişilere gönderilen bildirim (customerActions.service)
export const CUSTOM_AUDIENCE = "custom";

// Bölge süzgeci. Müşterinin bölgesi, iptal edilmemiş EN SON siparişinin bölgesidir; hiç siparişi olmayan
// müşteri hiçbir bölgede sayılmaz. "" = bölge süzgeci yok (tümü).
export const BROADCAST_ZONES = { girlsDorm: "Kız yurdu", boysDorm: "Erkek yurdu", devrek: "Devrek (adres)" };
export const ZONE_OPTIONS = [{ id: "", label: "Tümü" }, ...Object.entries(BROADCAST_ZONES).map(([id, label]) => ({ id, label }))];
/** Gövdedeki bölge değeri → "" | bölge kimliği; geçersizse null */
export const normalizeZone = (value) => {
  if (value === undefined || value === null || value === "" || value === "all") return "";
  return typeof value === "string" && Object.hasOwn(BROADCAST_ZONES, value) ? value : null;
};

/** Doğrulama hatası: denetleyici status ve message alanlarını yanıta çevirir */
export class BroadcastError extends Error {
  constructor(status, message, code = "invalid") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Başlık, mesaj, kitle, bölge ve açılacak ekranı doğrular (anlık gönderim, planlama ve düzenleme aynı kuralı kullanır) */
export const parseBroadcastInput = (source, { allowTest = false } = {}) => {
  const title = String(source?.title || "").trim();
  const body = String(source?.body || "").trim();
  const audience = String(source?.audience || "");
  const isTest = allowTest && audience === TEST_AUDIENCE;
  const target = source?.target === undefined || source?.target === null || source?.target === "" ? "home" : source.target;
  const route = typeof target === "string" && Object.hasOwn(BROADCAST_ROUTES, target) ? BROADCAST_ROUTES[target] : null;
  if (!title || title.length > TITLE_LIMIT) throw new BroadcastError(400, "Başlık 1-60 karakter olmalıdır");
  if (!body || body.length > BODY_LIMIT) throw new BroadcastError(400, "Mesaj 1-180 karakter olmalıdır");
  if (!isTest && !Object.hasOwn(BROADCAST_AUDIENCES, audience)) throw new BroadcastError(400, "Geçersiz hedef kitle");
  if (!route) throw new BroadcastError(400, "Geçersiz açılış ekranı");
  const zone = isTest ? "" : normalizeZone(source?.zone);
  if (zone === null) throw new BroadcastError(400, "Geçersiz bölge");
  return { title, body, audience, zone, route, target, isTest };
};

// ── Bölge üyeliği ─────────────────────────────────────────────────────────
/** Bir siparişin bölgesi: deliveryZone.id, yoksa deliveryPoint; adresli sipariş (eski/emekli bölgeler dahil) → devrek */
export const zoneOfOrder = (order) => {
  const id = order?.zoneId ?? order?.deliveryZone?.id;
  if (typeof id === "string" && Object.hasOwn(BROADCAST_ZONES, id)) return id;
  const point = order?.point ?? order?.deliveryPoint;
  if (point === "girlsDorm" || point === "boysDorm") return point;
  const type = order?.type ?? order?.deliveryType;
  if (point === "address" || type === "address") return "devrek";
  return null;
};

const ZONE_CACHE_MS = 2 * MINUTE;
const ZONE_QUERY_MAX_MS = 15000;
let zoneCache = null; // { at, promise }
/** Testler için: bellekteki bölge önbelleğini siler */
export const resetBroadcastCaches = () => {
  zoneCache = null;
};

/**
 * Her bölgenin müşterileri: { girlsDorm: [id…], boysDorm: [id…], devrek: [id…] }. Tek toplama sorgusu: iptal
 * edilmemiş siparişler yeniden eskiye sıralanır, müşteriye göre gruplanır ve ilk (en yeni) siparişin bölgesi alınır.
 * Sonuç 2 dakika bellekte tutulur (fresh: true ile yenilenir; gönderim anında kullanılır).
 */
export const getZoneMembers = async ({ now = Date.now(), fresh = false } = {}) => {
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!fresh && zoneCache && at >= zoneCache.at && at - zoneCache.at < ZONE_CACHE_MS) return zoneCache.promise;
  const promise = (async () => {
    const rows = await Order.aggregate([
      { $match: { status: { $ne: CANCELLED } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$user", zoneId: { $first: "$deliveryZone.id" }, point: { $first: "$deliveryPoint" }, type: { $first: "$deliveryType" } } },
    ], { maxTimeMS: ZONE_QUERY_MAX_MS, allowDiskUse: true });
    const members = Object.fromEntries(Object.keys(BROADCAST_ZONES).map((zone) => [zone, []]));
    for (const row of rows || []) {
      const zone = row?._id ? zoneOfOrder(row) : null;
      if (zone) members[zone].push(row._id);
    }
    return members;
  })();
  const entry = { at, promise };
  zoneCache = entry;
  // Başarısız sorgu önbellekte kalmasın
  promise.catch(() => {
    if (zoneCache === entry) zoneCache = null;
  });
  return promise;
};

// ── Hedef kitle ───────────────────────────────────────────────────────────
// Hedef kitle sorgusu; yalnızca müşteri hesapları dahil edilir.
export const buildAudienceFilter = async (audience, now = new Date()) => {
  const base = { role: { $ne: "admin" } };
  if (audience === "all") return base;
  if (audience === "cart") return { ...base, "cartItems.0": { $exists: true } };
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const notCancelled = { status: { $ne: CANCELLED } };
  if (audience === "active30") return { ...base, _id: { $in: await Order.distinct("user", { ...notCancelled, createdAt: { $gte: since } }) } };
  if (audience === "inactive30") {
    const [ever, recent] = await Promise.all([Order.distinct("user", notCancelled), Order.distinct("user", { ...notCancelled, createdAt: { $gte: since } })]);
    const recentSet = new Set(recent.map(String));
    return { ...base, _id: { $in: ever.filter((id) => !recentSet.has(String(id))) } };
  }
  if (audience === "noOrder") return { ...base, _id: { $nin: await Order.distinct("user", {}) } };
  return null;
};

/** Kitle VE bölge: bölge verilmişse kitle sorgusu, o bölgenin müşterileriyle kesiştirilir. Geçersiz kitlede null. */
export const buildBroadcastFilter = async (audience, zone = "", now = new Date(), { fresh = false } = {}) => {
  const filter = await buildAudienceFilter(audience, now);
  if (!filter || !zone) return filter;
  const members = await getZoneMembers({ now, fresh });
  return { $and: [filter, { _id: { $in: members[zone] || [] } }] };
};

// Kampanya bildirimi almayı kabul edenler
export const campaignOptIn = { pushNotificationsEnabled: { $ne: false }, "notificationPreferences.campaigns": { $ne: false } };

/** Bir kitle + bölgenin büyüklüğü: toplam müşteri ve kampanya bildirimine izinli olanlar */
export const countAudience = async (audience, zone = "", now = new Date()) => {
  const filter = await buildBroadcastFilter(audience, zone, now);
  if (!filter) return null;
  const [total, reachable] = await Promise.all([User.countDocuments(filter), User.countDocuments({ ...filter, ...campaignOptIn })]);
  return { total, reachable };
};

/** Aynı kitle + bölgeye giden son başarılı gönderimin zamanı: { all: Date, cart: Date, … } (okunamazsa boş) */
export const lastSendsByAudience = async (zone = "") => {
  try {
    const rows = await PushBroadcast.aggregate([
      { $match: { sent: true, audience: { $in: Object.keys(BROADCAST_AUDIENCES) }, zone: zone ? zone : { $in: ["", null] } } },
      { $group: { _id: "$audience", last: { $max: { $ifNull: ["$sentAt", "$createdAt"] } } } },
    ]);
    return Object.fromEntries((rows || []).filter((row) => row?._id && row.last).map((row) => [row._id, row.last]));
  } catch (error) {
    console.error("Son gönderim zamanları okunamadı:", error.message);
    return {};
  }
};

/** Paneldeki kitle kartları: her kitlenin (seçili bölgedeki) büyüklüğü ve o kitleye son gönderim */
export const listAudienceCounts = async (zone = "", now = new Date(), only = null) => {
  const ids = Object.keys(BROADCAST_AUDIENCES).filter((id) => !only || id === only);
  const [counts, lastSends] = await Promise.all([Promise.all(ids.map((id) => countAudience(id, zone, now))), lastSendsByAudience(zone)]);
  return ids.map((id, index) => ({ id, label: BROADCAST_AUDIENCES[id], total: counts[index].total, reachable: counts[index].reachable, lastSentAt: lastSends[id] || null }));
};

// ── Gönderim ──────────────────────────────────────────────────────────────
export const RECIPIENT_CAP = 5000;

/** Eski kayıtlarda status yoktur: sent true → "sent", değilse "failed" */
export const broadcastStatus = (doc) => doc?.status || (doc?.sent ? "sent" : "failed");

/**
 * Gönderim sonucunun kayda yazılan alanları. Başarılı gerçek gönderimde alıcılar da saklanır (en fazla
 * RECIPIENT_CAP kişi; daha kalabalıksa hiçbiri saklanmaz ve sonuç ölçülemez). Deneme gönderiminde alıcı saklanmaz.
 */
export const sendOutcomeFields = (result, recipientIds = [], sentAt = new Date(), { test = false } = {}) => {
  const sent = result?.sent === true;
  const ids = Array.isArray(recipientIds) ? recipientIds : [];
  const measurable = sent && !test && ids.length > 0 && ids.length <= RECIPIENT_CAP;
  return {
    targetedCount: Number(result?.targeted) || 0,
    sent,
    failureReason: sent ? null : result?.reason || "unknown",
    unreachableCount: Number(result?.unreachable) || 0,
    status: sent ? "sent" : "failed",
    sentAt: new Date(sentAt),
    ...(test ? {} : { recipients: measurable ? ids : [], resultsAvailable: measurable }),
  };
};

/**
 * Kaydı açılmış bir toplu bildirimi gönderir ve sonucu kayda yazar (anlık ve planlı gönderimin ortak yolu).
 * Hata fırlatmaz: push.service sonucu nedeniyle döndürür; kayıt güncellenemezse sonuç yine çağırana bildirilir
 * (kayıt "sending"de kalır, zamanlayıcı 15 dakika sonra "yarıda kaldı" olarak işaretler; yeniden gönderilmez).
 */
export const deliverBroadcast = async ({ broadcastId, title, body, route, userIds, audienceSize, sentAt = new Date(), send = sendPushToUsers }) => {
  let result;
  try {
    result = await send(userIds, { title, body }, { type: "broadcast", broadcastId: String(broadcastId), route }, { category: "campaigns" });
  } catch (error) {
    console.error("Toplu bildirim gönderilemedi:", error.message);
    result = { targeted: 0, sent: false, reason: "error", detail: error.message, unreachable: 0 };
  }
  try {
    await PushBroadcast.updateOne({ _id: broadcastId }, { $set: { ...sendOutcomeFields(result, userIds, sentAt), ...(audienceSize === undefined ? {} : { audienceSize }) } });
  } catch (error) {
    console.error("Toplu bildirim kaydı güncellenemedi:", error.message);
  }
  return result;
};

/** Başarılı gönderimin yöneticiye gösterilen özeti */
export const describeSendSuccess = (result) => {
  const unreachable = Number(result?.unreachable) || 0;
  const reached = Math.max(0, result.targeted - unreachable);
  return unreachable ? `${reached} müşteriye gönderildi (${unreachable} müşterinin kayıtlı cihazı yok)` : `${result.targeted} müşteriye gönderildi`;
};

// ── Çift gönderim denetimi ────────────────────────────────────────────────
/**
 * Aynı başlık + mesaj, verilen ana ±10 dakika içinde gönderilmiş, gönderiliyor ya da planlı mı?
 * Başarısız gönderimler sayılmaz (yeniden gönderilebilir). excludeId: düzenlenen / şimdi gönderilen planın kendisi.
 */
export const findDuplicateBroadcast = async ({ title, body, at = new Date(), excludeId = null }) => {
  const time = new Date(at).getTime();
  const from = new Date(time - DUPLICATE_WINDOW_MS);
  const to = new Date(time + DUPLICATE_WINDOW_MS);
  return PushBroadcast.findOne({
    title, body, audience: { $ne: TEST_AUDIENCE },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: [
      { sent: true, sentAt: { $gte: from, $lte: to } },
      // Eski kayıtlarda sentAt yoktur
      { sent: true, sentAt: null, createdAt: { $gte: from, $lte: to } },
      { status: "sending", claimedAt: { $gte: from } },
      { status: "scheduled", scheduledFor: { $gte: from, $lte: to } },
    ],
  }).select("_id status sent scheduledFor sentAt createdAt").lean();
};

const clockFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "15 Kasım 20:30" (İstanbul saati) */
export const istanbulLabel = (date) => clockFormat.format(new Date(date));

export const describeDuplicate = (duplicate) => {
  if (duplicate?.status === "scheduled") return `Aynı bildirim ${istanbulLabel(duplicate.scheduledFor)} için zaten planlı. Metni ya da saati değiştirin veya planlı olanı iptal edin.`;
  if (duplicate?.status === "sending") return "Aynı bildirim şu anda gönderiliyor. Sonucu Son gönderimler listesinden kontrol edin; tekrar göndermeyin.";
  return "Aynı bildirim son 10 dakika içinde zaten gönderildi";
};

// ── Panel görünümü ────────────────────────────────────────────────────────
/** Geçmiş / planlı liste satırı: eski kayıtların eksik alanları tamamlanır, alıcı listesi dışarı verilmez */
export const toBroadcastView = (doc) => {
  const { recipients: _recipients, ...rest } = doc || {};
  return { ...rest, zone: normalizeZone(doc?.zone) || "", status: broadcastStatus(doc), target: targetOfRoute(doc?.route), sentAt: doc?.sentAt || null, scheduledFor: doc?.scheduledFor || null };
};

// ── Sonuç: bildirimden sonra sipariş verenler ─────────────────────────────
export const RESULT_WINDOW_24 = 24 * HOUR;
export const RESULT_WINDOW_72 = 72 * HOUR;
export const RESULT_BATCH_LIMIT = 20;
const RESULT_ORDER_LIMIT = 20000;
const RESULT_QUERY_MAX_MS = 8000;
const RESULT_KEYS = ["orders24", "buyers24", "revenue24", "orders72", "buyers72", "revenue72"];
const roundMoney = (value) => Math.round(value * 100) / 100;
const idString = (value) => String(value?._id ?? value);

/**
 * Bir gönderimin alıcılarından, gönderimden sonraki 24 ve 72 saatte (iptal edilmemiş) sipariş verenler.
 * Yalnızca "bildirimden sonra sipariş verdi" demektir; siparişin bildirim yüzünden verildiğini göstermez.
 * Ciro: productTotal ?? totalAmount (teslimat ücreti hariç ürün tutarı).
 */
export const summarizeBroadcastResults = (broadcast, orders, now = new Date()) => {
  const sentAt = new Date(broadcast.sentAt || broadcast.createdAt).getTime();
  const recipients = new Set((broadcast.recipients || []).map(idString));
  const out = { orders24: 0, buyers24: 0, revenue24: 0, orders72: 0, buyers72: 0, revenue72: 0 };
  const buyers24 = new Set();
  const buyers72 = new Set();
  for (const order of orders || []) {
    const user = idString(order.user);
    if (!recipients.has(user)) continue;
    const elapsed = new Date(order.createdAt).getTime() - sentAt;
    if (!(elapsed >= 0) || elapsed > RESULT_WINDOW_72) continue;
    const amount = Number(order.productTotal ?? order.totalAmount) || 0;
    out.orders72 += 1;
    out.revenue72 += amount;
    buyers72.add(user);
    if (elapsed <= RESULT_WINDOW_24) {
      out.orders24 += 1;
      out.revenue24 += amount;
      buyers24.add(user);
    }
  }
  out.buyers24 = buyers24.size;
  out.buyers72 = buyers72.size;
  out.revenue24 = roundMoney(out.revenue24);
  out.revenue72 = roundMoney(out.revenue72);
  const age = new Date(now).getTime() - sentAt;
  return { ...out, done24: age >= RESULT_WINDOW_24, done72: age >= RESULT_WINDOW_72 };
};

/**
 * Görünen geçmiş sayfasının sonuçları (en fazla 20 gönderim), tek sipariş sorgusuyla.
 * Dönen harita: id → { state, … }. state: "final" (72 saat doldu, sayı kesin; kayda bir kez yazılır) |
 * "measuring" (pencere sürüyor, sayılar şu ana kadarki) | "unavailable" (alıcılar saklanmamış: eski kayıt ya da
 * 5000 kişiden büyük gönderim). Gönderilmemiş ve deneme kayıtları haritada yer almaz.
 */
export const getBroadcastResults = async (ids, { now = new Date() } = {}) => {
  const out = {};
  const wanted = [...new Set((ids || []).map(String))].slice(0, RESULT_BATCH_LIMIT);
  if (!wanted.length) return out;
  const docs = await PushBroadcast.find({ _id: { $in: wanted } }).select("audience sent sentAt createdAt resultsAvailable results").lean();
  const pending = [];
  for (const doc of docs || []) {
    if (!doc.sent || doc.audience === TEST_AUDIENCE) continue;
    const id = String(doc._id);
    if (doc.results?.final) out[id] = { state: "final", done24: true, done72: true, ...Object.fromEntries(RESULT_KEYS.map((key) => [key, Number(doc.results[key]) || 0])) };
    else if (doc.resultsAvailable !== true) out[id] = { state: "unavailable" };
    else pending.push(id);
  }
  if (!pending.length) return out;
  const withRecipients = (await PushBroadcast.find({ _id: { $in: pending } }).select("+recipients sentAt createdAt").lean()) || [];
  const measurable = withRecipients.filter((doc) => Array.isArray(doc.recipients) && doc.recipients.length);
  for (const id of pending) if (!measurable.some((doc) => String(doc._id) === id)) out[id] = { state: "unavailable" };
  if (!measurable.length) return out;
  const nowMs = new Date(now).getTime();
  const starts = measurable.map((doc) => new Date(doc.sentAt || doc.createdAt).getTime());
  const users = [...new Map(measurable.flatMap((doc) => doc.recipients).map((id) => [String(id), id])).values()];
  const orders = await Order.find({
    user: { $in: users },
    status: { $ne: CANCELLED },
    createdAt: { $gte: new Date(Math.min(...starts)), $lte: new Date(Math.min(nowMs, Math.max(...starts) + RESULT_WINDOW_72)) },
  }).select("user createdAt productTotal totalAmount").limit(RESULT_ORDER_LIMIT + 1).maxTimeMS(RESULT_QUERY_MAX_MS).lean();
  if ((orders || []).length > RESULT_ORDER_LIMIT) {
    // Eksik sayı göstermektense ölçüm yok denir
    for (const doc of measurable) out[String(doc._id)] = { state: "unavailable" };
    return out;
  }
  const finals = [];
  for (const doc of measurable) {
    const summary = summarizeBroadcastResults(doc, orders, now);
    out[String(doc._id)] = { state: summary.done72 ? "final" : "measuring", ...summary };
    if (summary.done72) finals.push({ id: doc._id, results: { final: true, ...Object.fromEntries(RESULT_KEYS.map((key) => [key, summary[key]])), computedAt: new Date(now) } });
  }
  // 72 saat dolan gönderimin sayıları kesindir: kayda yazılır, sonraki isteklerde yeniden hesaplanmaz
  await Promise.all(finals.map(async ({ id, results }) => {
    try {
      await PushBroadcast.updateOne({ _id: id, "results.final": { $ne: true } }, { $set: { results } });
    } catch (error) {
      console.error("Bildirim sonucu kaydedilemedi:", error.message);
    }
  }));
  return out;
};
