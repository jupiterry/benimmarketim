// Müşteri telefonlarına anlık bildirim gönderen ortak servis.
// Asıl kanal OneSignal REST API'dir: mobil uygulama giriş yapan kullanıcıyı OneSignal'a
// kullanıcı kimliğiyle (external_id) tanıtır, sunucu da bildirimi bu kimliğe gönderir.
// Tek kullanıcıya giden bildirimlerde, kayıtlı bir FCM token'ı varsa mevcut fcm.service de denenir.
// Bildirim gönderimi hiçbir zaman çağıran işlemi (sipariş, mesaj vb.) hataya düşürmez.
import User from "../models/user.model.js";

const ONESIGNAL_URL = "https://api.onesignal.com/notifications";
const REQUEST_TIMEOUT_MS = 8000;
const ONESIGNAL_BATCH_SIZE = 2000; // OneSignal bir istekte en fazla 2000 external_id kabul eder

// Müşterinin ayrı ayrı açıp kapatabildiği bildirim türleri
export const PUSH_CATEGORIES = ["orders", "messages", "campaigns"];
// Bildirime dokununca uygulamada açılabilecek ekranlar (mobil taraf da aynı listeyi doğrular)
const ALLOWED_ROUTE = /^\/(home|cart|orders|referral|photocopy-history|rate-app|chat(\/[a-f\d]{24})?)$/i;

export const isPushConfigured = () => Boolean(process.env.ONESIGNAL_REST_API_KEY && process.env.ONESIGNAL_APP_ID);

export const normalizePreferences = (user) => {
  const stored = user?.notificationPreferences || {};
  return Object.fromEntries(PUSH_CATEGORIES.map((category) => [category, stored[category] !== false]));
};

const cleanData = (data = {}) => {
  // OneSignal ve FCM ek veriyi düz metin olarak taşır
  const entries = Object.entries(data).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]);
  const cleaned = Object.fromEntries(entries);
  if (cleaned.route && !ALLOWED_ROUTE.test(cleaned.route)) delete cleaned.route;
  return cleaned;
};

const postToOneSignal = async (externalIds, message, data, collapseId) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ONESIGNAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}` },
      body: JSON.stringify({
        app_id: process.env.ONESIGNAL_APP_ID,
        target_channel: "push",
        include_aliases: { external_id: externalIds },
        headings: { en: message.title, tr: message.title },
        contents: { en: message.body, tr: message.body },
        data,
        ...(collapseId ? { collapse_id: collapseId } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) console.error("OneSignal bildirimi başarısız:", response.status);
    return response.ok;
  } finally { clearTimeout(timeout); }
};

const sendViaFcm = async (fcmToken, message, data) => {
  if (!fcmToken) return false;
  // firebase-admin yalnızca gerçekten token varsa yüklenir
  const { sendPushNotification } = await import("./fcm.service.js");
  return sendPushNotification(fcmToken, message, data);
};

/**
 * Bildirimi, izin vermiş kullanıcılara gönderir.
 * @param {Array<string|object>} userIds
 * @param {{title: string, body: string}} message
 * @param {object} data - Uygulamaya taşınan ek veri (type, route, ...)
 * @param {{category?: "orders"|"messages"|"campaigns", collapseId?: string}} options
 * @returns {Promise<{targeted: number, sent: boolean}>} targeted: izinli kullanıcı sayısı
 */
export const sendPushToUsers = async (userIds, message, data = {}, { category = "orders", collapseId } = {}) => {
  const empty = { targeted: 0, sent: false };
  try {
    if (!PUSH_CATEGORIES.includes(category)) throw new Error("PUSH_CATEGORY_INVALID");
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (!ids.length || !message?.title || !message?.body) return empty;
    const users = await User.find({ _id: { $in: ids }, pushNotificationsEnabled: { $ne: false }, [`notificationPreferences.${category}`]: { $ne: false } })
      .select("_id fcmToken").lean();
    if (!users.length) return empty;
    const payload = cleanData(data);
    const attempts = [];
    if (isPushConfigured()) {
      for (let start = 0; start < users.length; start += ONESIGNAL_BATCH_SIZE) {
        attempts.push(postToOneSignal(users.slice(start, start + ONESIGNAL_BATCH_SIZE).map((user) => String(user._id)), message, payload, collapseId));
      }
    }
    if (users.length === 1) attempts.push(sendViaFcm(users[0].fcmToken, message, payload));
    const results = await Promise.allSettled(attempts);
    return { targeted: users.length, sent: results.some((result) => result.status === "fulfilled" && result.value === true) };
  } catch (error) {
    console.error("Bildirim gönderilemedi:", error.message);
    return empty;
  }
};

export const sendPushToUser = async (userId, message, data = {}, options = {}) => (await sendPushToUsers([userId], message, data, options)).sent;
