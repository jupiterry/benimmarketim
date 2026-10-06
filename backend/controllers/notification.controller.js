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
  const route = BROADCAST_ROUTES[req.body?.target || "home"];
  if (!title || title.length > 60) return res.status(400).json({ success: false, message: "Başlık 1-60 karakter olmalıdır" });
  if (!body || body.length > 180) return res.status(400).json({ success: false, message: "Mesaj 1-180 karakter olmalıdır" });
  if (!BROADCAST_AUDIENCES[audience]) return res.status(400).json({ success: false, message: "Geçersiz hedef kitle" });
  if (!route) return res.status(400).json({ success: false, message: "Geçersiz açılış ekranı" });
  if (!isPushConfigured()) return res.status(503).json({ success: false, message: "Bildirim servisi yapılandırılmamış (OneSignal anahtarları eksik)" });

  // Yanlışlıkla çift gönderimi engelle
  const duplicate = await PushBroadcast.findOne({ title, body, createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } }).select("_id").lean();
  if (duplicate) return res.status(409).json({ success: false, message: "Aynı bildirim son 10 dakika içinde zaten gönderildi" });

  const filter = await buildAudienceFilter(audience);
  const users = await User.find({ ...filter, ...campaignOptIn }).select("_id").lean();
  if (!users.length) return res.status(400).json({ success: false, message: "Bu hedef kitlede bildirim alabilecek müşteri yok" });

  const record = await PushBroadcast.create({ title, body, audience, route, audienceSize: users.length, sentBy: req.user._id });
  const result = await sendPushToUsers(users.map((user) => user._id), { title, body }, { type: "broadcast", broadcastId: String(record._id), route }, { category: "campaigns" });
  await PushBroadcast.updateOne({ _id: record._id }, { $set: { targetedCount: result.targeted, sent: result.sent } });
  if (!result.sent) return res.status(502).json({ success: false, message: "Bildirim servisine ulaşılamadı. Lütfen daha sonra tekrar deneyin." });
  res.json({ success: true, targeted: result.targeted, message: `${result.targeted} müşteriye gönderildi` });
};
