import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import Settings from "../models/settings.model.js";
import { createAiProvider } from "../services/ai/providers.js";
import { buildDraftMessages, parseDraftOptions } from "../services/pushDraft.service.js";
import { PUSH_CATEGORIES, inspectPushUser, isPushConfigured, normalizePreferences, sendPushToUsers } from "../services/push.service.js";

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

// Taslak üretimi yalnızca metin önerir; hiçbir bildirim göndermez.
// Farklı tonlarda en fazla 3 seçenek döner; ilki forma doldurulur, diğerleri panelde seçilebilir.
export const generateBroadcastDraft = async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const target = typeof req.body?.target === "string" ? req.body.target : "home";
  if (prompt.length < 3 || prompt.length > 600) return res.status(400).json({ success: false, message: "Kampanya açıklaması 3–600 karakter arasında olmalı." });
  try {
    const settings = await Settings.getSettings();
    const ai = settings.ai || {};
    const providerName = ai.provider || process.env.AI_DEFAULT_PROVIDER || "openrouter";
    const model = ai.model || process.env.AI_DEFAULT_MODEL || "openai/gpt-4o";
    // Son başlıklar modele verilir ki aynı kalıpları tekrar etmesin
    let recent = [];
    try {
      recent = await PushBroadcast.find({ audience: { $ne: TEST_AUDIENCE } }).sort({ createdAt: -1 }).limit(5).select("title").lean();
    } catch {
      // Geçmiş okunamazsa taslak yine de üretilir
    }
    const messages = buildDraftMessages({ prompt, target, recentTitles: recent.map((item) => item.title).filter(Boolean) });
    const provider = createAiProvider({ provider: providerName, model });
    // Yaratıcı metin için asistandan daha yüksek sıcaklık; sınıra uymazsa bir kez daha denenir
    let options = [];
    for (let attempt = 0; attempt < 2 && !options.length; attempt += 1) {
      const response = await provider.complete(messages, [], { temperature: 0.9, maxTokens: 900 });
      options = parseDraftOptions(response.content);
    }
    if (!options.length) return res.status(502).json({ success: false, message: "Üretilen metin karakter sınırına uymadı. Yeniden deneyin." });
    return res.json({ success: true, title: options[0].title, body: options[0].body, options });
  } catch (error) {
    const status = error.message === "AI_API_KEY_MISSING" ? 503 : 502;
    return res.status(status).json({ success: false, message: status === 503 ? "Yapay zekâ sağlayıcısının sunucu ayarı eksik." : "Metin şu anda oluşturulamadı. Tekrar deneyin veya hazır metinlerden birini kullanın." });
  }
};

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

// Tanılama sonucunun yöneticiye gösterilen açıklaması ve yapılacaklar
export const describeDiagnosis = (state, who) => {
  switch (state) {
    case "ready": return { ok: true, title: "Bildirim almaya hazır", steps: [`${who} en az bir cihazda bildirim alabiliyor.`] };
    case "not_found": return { ok: false, title: "Bu hesap OneSignal'da hiç görünmüyor", steps: [
      "Telefonda uygulamanın güncel sürümünde tam olarak bu hesapla (aynı e-posta) oturum açın; başka bir hesapla girildiyse çıkış yapıp bununla girin.",
      "Giriş yaptıktan sonra uygulamayı tamamen kapatıp yeniden açın, bir dakika bekleyip yeniden denetleyin.",
      "Sonuç değişmezse telefondaki sürüm bildirim desteği olmayan eski bir derleme olabilir.",
    ] };
    case "no_subscription": return { ok: false, title: "Hesap tanınıyor ama telefon bildirim aboneliği oluşturmamış", steps: [
      "Telefonun Ayarlar > Bildirimler bölümünde Benim Marketim için bildirimlere izin verin.",
      "iPhone için: OneSignal panelinde Settings > Push & In-App > Apple iOS (APNs) ayarının yapılmış olması gerekir (.p8 anahtarı, Team ID ve paket adı com.jupi.benimmarketim). Bu ayar yoksa hiçbir iPhone bildirim alamaz.",
    ] };
    case "no_token": return { ok: false, title: "Telefon, bildirim adresini alamamış", steps: [
      "iPhone için: OneSignal panelinde Settings > Push & In-App > Apple iOS (APNs) ayarını kontrol edin (.p8 anahtarı, Key ID, Team ID, paket adı com.jupi.benimmarketim).",
      "Apple Developer hesabında uygulama kimliğinde Push Notifications yetkisinin açık olduğunu doğrulayın.",
      "Android için: OneSignal panelinde Google Android (FCM) ayarının yapılmış olması gerekir.",
    ] };
    case "disabled": return { ok: false, title: "Telefonda bildirim izni kapalı", steps: [
      "Telefonun Ayarlar > Bildirimler bölümünde Benim Marketim için bildirimleri açın, ardından uygulamayı kapatıp yeniden açın.",
    ] };
    case "auth": return { ok: false, title: "OneSignal anahtarı kabul edilmedi", steps: ["Sunucudaki ONESIGNAL_REST_API_KEY ve ONESIGNAL_APP_ID değerlerinin aynı OneSignal uygulamasına ait olduğunu kontrol edin ve sunucuyu yeniden başlatın."] };
    case "not_configured": return { ok: false, title: "Bildirim servisi yapılandırılmamış", steps: ["Sunucu ayarlarına OneSignal anahtarlarını ekleyip sunucuyu yeniden başlatın."] };
    case "network": return { ok: false, title: "OneSignal'a ulaşılamadı", steps: ["Sunucunun internet bağlantısını kontrol edip birkaç dakika sonra tekrar deneyin."] };
    default: return { ok: false, title: "OneSignal isteği reddetti", steps: ["Sunucu ayarlarındaki OneSignal bilgilerini kontrol edin."] };
  }
};

// GET /api/notifications/broadcasts/diagnose?email=...
// Bir hesabın bildirim alıp alamadığını ve alamıyorsa nedenini gösterir. E-posta verilmezse yöneticinin kendi hesabı denetlenir.
export const diagnosePush = async (req, res) => {
  const email = String(req.query?.email || "").trim().toLowerCase();
  let target = req.user;
  if (email) {
    target = await User.findOne({ email }).select("_id name email pushNotificationsEnabled notificationPreferences").lean();
    if (!target) return res.status(404).json({ success: false, message: "Bu e-posta ile kayıtlı hesap bulunamadı." });
  }
  const who = email ? `${target.name || target.email}` : "Hesabınız";
  const result = await inspectPushUser(target._id);
  const diagnosis = describeDiagnosis(result.state, who);
  const preferences = normalizePreferences(target);
  const optedOut = target.pushNotificationsEnabled === false || preferences.campaigns === false;
  if (optedOut) diagnosis.steps = [...diagnosis.steps, "Bu hesapta uygulama içi bildirim ayarlarında bildirimler ya da kampanya bildirimleri kapalı; toplu bildirimler bu hesaba gönderilmez."];
  res.json({
    success: true,
    account: { name: target.name || "", email: target.email || "" },
    state: result.state,
    ready: diagnosis.ok && !optedOut,
    title: diagnosis.ok && optedOut ? "Cihaz hazır ama hesapta kampanya bildirimleri kapalı" : diagnosis.title,
    steps: diagnosis.steps,
    devices: result.devices,
  });
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
