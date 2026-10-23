// Sipariş durumu değiştiğinde müşterinin telefonuna anlık bildirim gönderir.
// Gönderim push.service üzerinden yapılır; müşterinin bildirim tercihleri orada uygulanır.
import { sendPushToUser } from "./push.service.js";
import { DELIVERY_OUTCOMES } from "../lib/feedbackOptions.js";

const STATUS_MESSAGES = {
  "Hazırlanıyor": { title: "Siparişiniz hazırlanıyor", body: "Siparişiniz alındı ve hazırlanmaya başlandı." },
  "Yolda": { title: "Siparişiniz yola çıktı", body: "Kuryemiz siparişinizi size getiriyor." },
  "Teslim Edildi": { title: "Siparişiniz teslim edildi", body: "Afiyet olsun! Bizi tercih ettiğiniz için teşekkür ederiz." },
  "İptal Edildi": { title: "Siparişiniz iptal edildi", body: "Siparişiniz iptal edildi. Sorunuz varsa destek ekibimize yazabilirsiniz." },
};

/**
 * Bildirim metni. "Teslim edilemedi" ile iptal edilen siparişte (order.deliveryOutcome) neden yazılır:
 * "Siparişin teslim edilemedi: Adres bulunamadı".
 */
export const buildOrderStatusMessage = (status, order = null) => {
  const outcome = order?.deliveryOutcome;
  if (status === "İptal Edildi" && outcome?.code) {
    const label = outcome.label || DELIVERY_OUTCOMES[outcome.code] || "";
    if (label) return { title: "Siparişin teslim edilemedi", body: `Siparişin teslim edilemedi: ${label}` };
  }
  return STATUS_MESSAGES[status] || null;
};

/**
 * @param {object} order - Güncellenmiş sipariş (user ve _id alanları yeterli)
 * @param {string} previousStatus - Güncellemeden önceki durum
 * @returns {Promise<boolean>} En az bir kanaldan gönderildiyse true
 */
export const notifyOrderStatusChange = async (order, previousStatus) => {
  const status = order?.status;
  const message = buildOrderStatusMessage(status, order);
  if (!message || !order?.user || status === previousStatus) return false;
  return sendPushToUser(order.user, message, { type: "order_status", orderId: String(order._id), status, route: "/orders" }, { category: "orders" });
};
