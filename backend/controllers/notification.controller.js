import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { PUSH_CATEGORIES, isPushConfigured, normalizePreferences, sendPushToUsers } from "../services/push.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
// rate: uygulamanın mağaza sayfasını açar (puan ve yorum için)
const BROADCAST_ROUTES = { home: "/home", cart: "/cart", orders: "/orders", referral: "/referral", rate: "/rate-app" };

export const BROADCAST_AUDIENCES = {
  all: "Tüm müşteriler",
  cart: "Sepetinde ürün olanlar",
  active30: "Son 30 günde sipariş verenler",
  inactive30: "30 gündür sipariş vermeyenler",
  noOrder: "Hiç sipariş vermeyenler",
};

// Yöneticinin bildirimi önce yalnızca kendi telefonunda denemesi için
export const TEST_AUDIENCE = "self";

// Gönderim başarısız olduğunda yöneticiye gösterilen açıklama ve HTTP durumu
export const describePushFailure = (result) => {
  const detail = result?.detail ? ` (${result.detail})` : "";
  switch (result?.reason) {
    case "auth": return { status: 502, message: "OneSignal anahtarı kabul edilmedi. Sunucudaki ONESIGNAL_REST_API_KEY ve ONESIGNAL_APP_ID değerlerinin aynı OneSignal uygulamasına ait olduğunu kontrol edin." };
    case "rejected": return { status: 502, message: `OneSignal isteği reddetti${detail}. Sunucu ayarlarındaki OneSignal bilgilerini kontrol edin.` };
    case "network": return { status: 502, message: `OneSignal'a ulaşılamadı${detail}. Sunucunun internet bağlantısını kontrol edip birkaç dakika sonra tekrar deneyin.` };
    case "not_configured": return { status: 503, message: "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)" };
    case "no_devices": return { status: 422, message: "Bildirim gönderilemedi: bu kitledeki müşterilerin hiçbiri bildirimleri destekleyen uygulama sürümünde oturum açmamış. Müşteriler yeni sürümü kurup giriş yaptıkça ulaşılabilir olurlar." };
    default: return { status: 422, message: "Bildirim gönderilemedi: seçilen kişiler bildirim almaya izin vermiyor." };
  }
};

// Hedef kitle sorgusu; yalnızca müşteri hesapları dahil edilir.
export const buildAudienceFilter = async (audience, now = new Date()) => {
  const base = { role: { $ne: "admin" } };
  if (audience === "all") return base;
  if (audience === "cart") return { ...base, "cartItems.0": { $exists: true } };
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const notCancelled = { status: { $ne: "İptal Edildi" } };
  if (audience === "active30") return { ...base, _id: { $in: await Order.distinct("user", { ...notCancelled, createdAt: { $gte: since } }) } };
  if (audience === "inactive30") {
    const [ever, recent] = await Promise.all([Order.distinct("user", notCancelled), Order.distinct("user", { ...notCancelled, createdAt: { $gte: since } })]);
    const recentSet = new Set(recent.map(String));
    return { ...base, _id: { $in: ever.filter((id) => !recentSet.has(String(id))) } };
  }
  if (audience === "noOrder") return { ...base, _id: { $nin: await Order.distinct("user", {}) } };
  return null;
};

// Kampanya bildirimi almayı kabul edenler
const campaignOptIn = { pushNotificationsEnabled: { $ne: false }, "notificationPreferences.campaigns": { $ne: false } };

// ── Müşteri: bildirim tercihleri ─────────────────────────────────────────────
export const getNotificationPreferences = async (req, res) => {
  res.json({ success: true, preferences: normalizePreferences(req.user) });
};

export const updateNotificationPreferences = async (req, res) => {
  const updates = {};
  for (const category of PUSH_CATEGORIES) {
    if (req.body?.[category] === undefined) continue;
    if (typeof req.body[category] !== "boolean") return res.status(400).json({ success: false, message: "Geçersiz bildirim tercihi" });
    updates[`notificationPreferences.${category}`] = req.body[category];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ success: false, message: "Güncellenecek tercih bulunamadı" });
  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true }).select("notificationPreferences").lean();
  res.json({ success: true, preferences: normalizePreferences(user) });
};

// ── Yönetici: toplu bildirim ─────────────────────────────────────────────────
export const getBroadcastOverview = async (_req, res) => {
  const audiences = await Promise.all(Object.entries(BROADCAST_AUDIENCES).map(async ([id, label]) => {
    const filter = await buildAudienceFilter(id);
    const [total, reachable] = await Promise.all([User.countDocuments(filter), User.countDocuments({ ...filter, ...campaignOptIn })]);
    return { id, label, total, reachable };
  }));
  const history = await PushBroadcast.find().sort({ createdAt: -1 }).limit(20).populate("sentBy", "name").lean();
  res.json({ success: true, configured: isPushConfigured(), audiences, history });
};

export const sendBroadcast = async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  const audience = String(req.body?.audience || "");
  const isTest = audience === TEST_AUDIENCE;
  const route = BROADCAST_ROUTES[req.body?.target || "home"];
  if (!title || title.length > 60) return res.status(400).json({ success: false, message: "Başlık 1-60 karakter olmalıdır" });
  if (!body || body.length > 180) return res.status(400).json({ success: false, message: "Mesaj 1-180 karakter olmalıdır" });
  if (!isTest && !BROADCAST_AUDIENCES[audience]) return res.status(400).json({ success: false, message: "Geçersiz hedef kitle" });
  if (!route) return res.status(400).json({ success: false, message: "Geçersiz açılış ekranı" });
  if (!isPushConfigured()) return res.status(503).json({ success: false, message: "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)" });

  let userIds;
  if (isTest) {
    // Deneme: yalnızca gönderen yöneticinin kendi hesabına gider
    userIds = [req.user._id];
  } else {
    // Yanlışlıkla çift gönderimi engelle (başarısız denemeler yeniden gönderilebilir)
    const duplicate = await PushBroadcast.findOne({ title, body, sent: true, audience: { $ne: TEST_AUDIENCE }, createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } }).select("_id").lean();
    if (duplicate) return res.status(409).json({ success: false, message: "Aynı bildirim son 10 dakika içinde zaten gönderildi" });
    const filter = await buildAudienceFilter(audience);
    const users = await User.find({ ...filter, ...campaignOptIn }).select("_id").lean();
    if (!users.length) return res.status(400).json({ success: false, message: "Bu hedef kitlede bildirim alabilecek müşteri yok" });
    userIds = users.map((user) => user._id);
  }

  const record = await PushBroadcast.create({ title, body, audience, route, audienceSize: userIds.length, sentBy: req.user._id });
  const result = await sendPushToUsers(userIds, { title, body }, { type: "broadcast", broadcastId: String(record._id), route }, { category: "campaigns" });
  await PushBroadcast.updateOne({ _id: record._id }, { $set: { targetedCount: result.targeted, sent: result.sent, failureReason: result.sent ? null : result.reason || "unknown", unreachableCount: result.unreachable || 0 } });
  if (!result.sent) {
    const failure = describePushFailure(result);
    const message = isTest && result.reason === "no_devices"
      ? "Deneme bildirimi gönderilemedi: bu yönetici hesabıyla mobil uygulamanın güncel sürümünde oturum açılmamış. Telefonunuzda uygulamaya bu hesapla girip bildirimlere izin verin."
      : isTest && !result.reason ? "Deneme bildirimi gönderilemedi: hesabınızda bildirimler ya da kampanya bildirimleri kapalı." : failure.message;
    return res.status(failure.status).json({ success: false, reason: result.reason || "opted_out", message });
  }
  const reached = Math.max(0, result.targeted - (result.unreachable || 0));
  res.json({
    success: true,
    targeted: result.targeted,
    unreachable: result.unreachable || 0,
    message: isTest ? "Deneme bildirimi telefonunuza gönderildi"
      : result.unreachable ? `${reached} müşteriye gönderildi (${result.unreachable} müşterinin kayıtlı cihazı yok)` : `${result.targeted} müşteriye gönderildi`,
  });
};
