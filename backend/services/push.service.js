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

// Yeni OneSignal anahtarları ("os_v2_...") "Key", eski REST anahtarları "Basic" şemasıyla gönderilir.
const authScheme = (key) => (/^os_v2_/i.test(String(key || "")) ? "Key" : "Basic");

const countInvalidAliases = (errors) => {
  const list = errors && !Array.isArray(errors) ? errors.invalid_aliases?.external_id : null;
  return Array.isArray(list) ? list.length : 0;
};

const describeErrors = (errors) => {
  if (!errors) return "";
  const text = Array.isArray(errors) ? errors.join("; ") : typeof errors === "string" ? errors : Object.keys(errors).join(", ");
  return String(text).slice(0, 160);
};

/**
 * Tek bir OneSignal isteği. Hata fırlatmaz; sonucu nedeniyle birlikte döndürür:
 * reason: null (gönderildi) | "auth" (anahtar reddedildi) | "rejected" (istek reddedildi) |
 *         "no_devices" (hedeflenen kimliklerin kayıtlı cihazı yok) | "network" (ulaşılamadı / zaman aşımı)
 */
const postToOneSignal = async (externalIds, message, data, collapseId) => {
  const key = process.env.ONESIGNAL_REST_API_KEY;
  const request = async (scheme) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(ONESIGNAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `${scheme} ${key}` },
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
    } finally { clearTimeout(timeout); }
  };
  try {
    const scheme = authScheme(key);
    let response = await request(scheme);
    // Anahtar türü yanlış tahmin edildiyse diğer şemayla bir kez daha denenir
    if (response.status === 401 || response.status === 403) response = await request(scheme === "Key" ? "Basic" : "Key");
    const body = typeof response.json === "function" ? await response.json().catch(() => null) : null;
    const errors = body && typeof body === "object" ? body.errors : null;
    if (!response.ok) {
      const detail = describeErrors(errors);
      console.error("OneSignal bildirimi başarısız:", response.status, detail);
      const auth = response.status === 401 || response.status === 403;
      return { ok: false, reason: auth ? "auth" : "rejected", status: response.status, detail, invalid: 0 };
    }
    // OneSignal, hedeflenen kimlik hiçbir cihazda kayıtlı değilse de 200 döner; o durumda bildirim
    // oluşturulmaz ve "id" boş gelir. Bu, gönderilmiş sayılmaz.
    if (body && typeof body === "object" && !body.id && (body.id === "" || errors)) {
      return { ok: false, reason: "no_devices", status: response.status, detail: describeErrors(errors), invalid: externalIds.length };
    }
    return { ok: true, reason: null, status: response.status, detail: "", invalid: countInvalidAliases(errors) };
  } catch (error) {
    console.error("OneSignal'a ulaşılamadı:", error.name === "AbortError" ? "zaman aşımı" : error.message);
    return { ok: false, reason: "network", status: 0, detail: error.name === "AbortError" ? "zaman aşımı" : "bağlantı hatası", invalid: 0 };
  }
};

/**
 * Bir kullanıcının OneSignal'daki kaydını ve bildirim aboneliklerini okur (yalnızca tanılama içindir).
 * state: "ready" (en az bir cihaz bildirim alabilir) | "not_found" (hesap OneSignal'da hiç görünmüyor) |
 *        "no_subscription" (hesap var, bildirim aboneliği yok) | "no_token" (cihaz bildirim adresi alamamış) |
 *        "disabled" (cihazda bildirim izni kapalı) | "auth" | "rejected" | "network" | "not_configured"
 */
export const inspectPushUser = async (userId) => {
  if (!isPushConfigured()) return { state: "not_configured", devices: [] };
  const key = process.env.ONESIGNAL_REST_API_KEY;
  const url = `https://api.onesignal.com/apps/${encodeURIComponent(process.env.ONESIGNAL_APP_ID)}/users/by/external_id/${encodeURIComponent(String(userId))}`;
  const request = async (scheme) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { return await fetch(url, { method: "GET", headers: { Authorization: `${scheme} ${key}` }, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  };
  try {
    const scheme = authScheme(key);
    let response = await request(scheme);
    if (response.status === 401 || response.status === 403) response = await request(scheme === "Key" ? "Basic" : "Key");
    if (response.status === 404) return { state: "not_found", devices: [] };
    if (response.status === 401 || response.status === 403) return { state: "auth", devices: [] };
    const body = typeof response.json === "function" ? await response.json().catch(() => null) : null;
    if (!response.ok) return { state: "rejected", devices: [], detail: describeErrors(body?.errors) || `HTTP ${response.status}` };
    // Yalnızca telefon bildirimi abonelikleri; e-posta ve SMS abonelikleri sayılmaz
    const devices = (Array.isArray(body?.subscriptions) ? body.subscriptions : [])
      .filter((item) => /push/i.test(String(item?.type || "")))
      .map((item) => ({
        platform: /ios/i.test(item.type) ? "iPhone" : /android/i.test(item.type) ? "Android" : String(item.type),
        enabled: item.enabled === true,
        hasToken: Boolean(item.token),
        model: String(item.device_model || "").slice(0, 40),
        appVersion: String(item.app_version || "").slice(0, 20),
      }));
    const state = !devices.length ? "no_subscription"
      : devices.some((device) => device.enabled) ? "ready"
      : devices.some((device) => device.hasToken) ? "disabled" : "no_token";
    return { state, devices };
  } catch (error) {
    return { state: "network", devices: [], detail: error.name === "AbortError" ? "zaman aşımı" : "bağlantı hatası" };
  }
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
 * @returns {Promise<{targeted: number, sent: boolean, reason: string|null, detail: string, unreachable: number}>}
 *   targeted: izinli kullanıcı sayısı; sent: en az bir kanal bildirimi kabul etti;
 *   reason: gönderilemediyse nedeni ("not_configured" | "auth" | "rejected" | "network" | "no_devices");
 *   unreachable: OneSignal'ın kayıtlı cihazı olmadığını bildirdiği kullanıcı sayısı
 */
export const sendPushToUsers = async (userIds, message, data = {}, { category = "orders", collapseId } = {}) => {
  const empty = { targeted: 0, sent: false, reason: null, detail: "", unreachable: 0 };
  try {
    if (!PUSH_CATEGORIES.includes(category)) throw new Error("PUSH_CATEGORY_INVALID");
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (!ids.length || !message?.title || !message?.body) return empty;
    const users = await User.find({ _id: { $in: ids }, pushNotificationsEnabled: { $ne: false }, [`notificationPreferences.${category}`]: { $ne: false } })
      .select("_id fcmToken").lean();
    if (!users.length) return empty;
    const payload = cleanData(data);
    const batches = [];
    if (isPushConfigured()) {
      for (let start = 0; start < users.length; start += ONESIGNAL_BATCH_SIZE) {
        batches.push(postToOneSignal(users.slice(start, start + ONESIGNAL_BATCH_SIZE).map((user) => String(user._id)), message, payload, collapseId));
      }
    }
    const fcm = users.length === 1 ? sendViaFcm(users[0].fcmToken, message, payload).catch(() => false) : Promise.resolve(false);
    const [results, fcmSent] = await Promise.all([Promise.all(batches), fcm]);
    const sent = fcmSent === true || results.some((result) => result.ok);
    // Birden fazla neden varsa en çok işe yarayanı öne alınır
    const failed = ["auth", "rejected", "network", "no_devices"].map((reason) => results.find((result) => result.reason === reason)).find(Boolean);
    return {
      targeted: users.length,
      sent,
      reason: sent ? null : failed?.reason || (isPushConfigured() ? "no_devices" : "not_configured"),
      detail: sent ? "" : failed?.detail || "",
      unreachable: fcmSent === true ? 0 : results.reduce((sum, result) => sum + (result.invalid || 0), 0),
    };
  } catch (error) {
    console.error("Bildirim gönderilemedi:", error.message);
    return empty;
  }
};

export const sendPushToUser = async (userId, message, data = {}, options = {}) => (await sendPushToUsers([userId], message, data, options)).sent;
