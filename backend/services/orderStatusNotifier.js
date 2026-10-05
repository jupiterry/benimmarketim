// Sipariş durumu değiştiğinde müşterinin telefonuna anlık bildirim gönderir.
// Mobil uygulama OneSignal kullandığı için asıl kanal OneSignal REST API'dir (external_id = kullanıcı kimliği).
// Kullanıcının kayıtlı bir FCM token'ı varsa mevcut fcm.service de denenir.
// Bildirim gönderimi hiçbir zaman sipariş güncellemesini engellemez veya hataya düşürmez.
import User from "../models/user.model.js";

const ONESIGNAL_URL = "https://api.onesignal.com/notifications";
const REQUEST_TIMEOUT_MS = 8000;

const STATUS_MESSAGES = {
  "Hazırlanıyor": { title: "Siparişiniz hazırlanıyor", body: "Siparişiniz alındı ve hazırlanmaya başlandı." },
  "Yolda": { title: "Siparişiniz yola çıktı", body: "Kuryemiz siparişinizi size getiriyor." },
  "Teslim Edildi": { title: "Siparişiniz teslim edildi", body: "Afiyet olsun! Bizi tercih ettiğiniz için teşekkür ederiz." },
  "İptal Edildi": { title: "Siparişiniz iptal edildi", body: "Siparişiniz iptal edildi. Sorunuz varsa destek ekibimize yazabilirsiniz." },
};

export const buildOrderStatusMessage = (status) => STATUS_MESSAGES[status] || null;

const sendViaOneSignal = async (userId, message, data) => {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;
  if (!apiKey || !appId) return false; // Anahtar tanımlı değilse sessizce atla (opsiyonel özellik)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ONESIGNAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        include_aliases: { external_id: [String(userId)] },
        headings: { en: message.title, tr: message.title },
        contents: { en: message.body, tr: message.body },
        data,
      }),
      signal: controller.signal,
    });
    if (!response.ok) console.error("OneSignal sipariş bildirimi başarısız:", response.status);
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
 * @param {object} order - Güncellenmiş sipariş (user ve _id alanları yeterli)
 * @param {string} previousStatus - Güncellemeden önceki durum
 * @returns {Promise<boolean>} En az bir kanaldan gönderildiyse true
 */
export const notifyOrderStatusChange = async (order, previousStatus) => {
  try {
    const status = order?.status;
    const message = buildOrderStatusMessage(status);
    if (!message || !order?.user || status === previousStatus) return false;
    const user = await User.findById(order.user).select("fcmToken pushNotificationsEnabled").lean();
    if (!user || user.pushNotificationsEnabled === false) return false;
    const data = { type: "order_status", orderId: String(order._id), status };
    const results = await Promise.allSettled([
      sendViaOneSignal(order.user, message, data),
      sendViaFcm(user.fcmToken, message, data),
    ]);
    return results.some((result) => result.status === "fulfilled" && result.value === true);
  } catch (error) {
    console.error("Sipariş durumu bildirimi gönderilemedi:", error.message);
    return false;
  }
};
