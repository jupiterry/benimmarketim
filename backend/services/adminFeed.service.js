// Yönetici bildirimleri (zil): yeni sipariş, destek talebi, müşteri mesajı, uygulama açılışı, müşteri iptali.
// Önceden yalnızca o an açık olan tarayıcıya canlı gelip o tarayıcının hafızasında tutuluyordu;
// başka bilgisayarda ya da aynı hesapla başka cihazda görünmüyordu. Artık her olay sunucuda da saklanır,
// panel açılınca buradan okunur. "Temizle" yöneticinin hesabına işlenir (aynı hesap tüm cihazlarda aynı listeyi görür).
import mongoose from "mongoose";
import { CANCEL_REASONS } from "../lib/feedbackOptions.js";

export const FEED_COLLECTION = "admin_notifications";
export const READS_COLLECTION = "admin_notification_reads";
export const FEED_LIMIT = 30;
export const APP_OPEN_LIMIT = 10; // uygulama açılışları sık gelir; sipariş ve mesajları listeden itmesin
const RETENTION_SECONDS = 14 * 24 * 3600;
/** Müşteri siparişini uygulamadan iptal etti (panel her ekranda kırmızı uyarı gösterir; zile de yazılır) */
export const CUSTOMER_CANCEL_EVENT = "orderCancelledByCustomer";
export const CUSTOMER_CANCEL_TITLE = "Müşteri siparişi iptal etti";
const HEX24 = /^[0-9a-f]{24}$/i;

const text = (value, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const validDate = (value, fallback) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : fallback;
};
const orderCode = (orderId) => `#${String(orderId).slice(-6).toUpperCase()}`;

/**
 * Müşteri iptali olayının yükü (canlı olay ve zil kaydı). Müşteri adı yalnızca iptal eden siparişin sahibiyse
 * yazılır (yönetici başkasının siparişini bu uçtan iptal ederse ad boş kalır).
 * → { orderId, code, customerName, reason, reasonCode, note, totalAmount, deliveryPointName, at }
 */
export const customerCancelPayload = (order, { cancelReason = null, actor = null } = {}, now = new Date()) => {
  const orderId = String(order?._id ?? "");
  const isOwner = Boolean(actor?._id && order?.user && String(actor._id) === String(order.user?._id ?? order.user));
  const reasonCode = cancelReason?.code && CANCEL_REASONS[cancelReason.code] ? cancelReason.code : null;
  return {
    orderId,
    code: orderCode(orderId),
    customerName: isOwner ? text(actor.name, 80) : "",
    reason: reasonCode ? CANCEL_REASONS[reasonCode] : "",
    reasonCode,
    note: reasonCode ? text(cancelReason.note, 300) : "",
    totalAmount: Math.round((Number(order?.totalAmount) || 0) * 100) / 100,
    deliveryPointName: text(order?.deliveryPointName, 80),
    at: now.toISOString(),
  };
};

/** Socket olayından zil kaydı (saf fonksiyon). Tanınmayan olay → null. Anahtarlar panelin kullandıklarıyla aynıdır. */
export const feedItemFromEvent = (event, data, now = new Date()) => {
  if (!data || typeof data !== "object") return null;
  if (event === "newOrder") {
    const order = data.order;
    if (!order?.id || order.id === "test") return null;
    return {
      key: String(order.id),
      kind: "order",
      title: text(order.customerName || "Müşteri", 80),
      detail: "",
      order: {
        id: String(order.id),
        totalAmount: Number(order.totalAmount) || 0,
        customerName: text(order.customerName || "Müşteri", 80),
        deliveryPointName: text(order.deliveryPointName || order.city || "", 80),
        productCount: Array.isArray(order.products) ? order.products.length : 0,
      },
      at: order.createdAt ? new Date(order.createdAt) : now,
    };
  }
  if (event === "SupportRequestCreated") {
    if (!data.supportRequestId) return null;
    return {
      key: `support-${data.supportRequestId}`,
      kind: "support",
      title: text(data.customerName || "Müşteri", 80),
      detail: text(data.reason || "Canlı destek bekliyor"),
      chatId: data.conversationId ? String(data.conversationId) : null,
      at: now,
    };
  }
  if (event === "newChatMessage") {
    if (!data.chatId) return null;
    const message = typeof data.message === "string" ? data.message : data.message?.content;
    return {
      key: `message-${data.chatId}`,
      kind: "message",
      title: text(data.senderName || "Müşteri", 80),
      detail: text(message || "Yeni mesaj", 80),
      chatId: String(data.chatId),
      at: data.timestamp ? new Date(data.timestamp) : now,
    };
  }
  if (event === "appOpened") {
    if (!data.userId) return null;
    return {
      key: `app-${data.userId}`,
      kind: "app-open",
      title: text(data.name || "Müşteri", 80),
      detail: "Uygulamayı açtı",
      userId: String(data.userId),
      at: data.at ? new Date(data.at) : now,
    };
  }
  if (event === CUSTOMER_CANCEL_EVENT) {
    const orderId = String(data.orderId ?? "");
    if (!HEX24.test(orderId)) return null;
    const code = text(data.code, 12) || orderCode(orderId);
    const customerName = text(data.customerName, 80);
    const reason = text(data.reason, 80);
    const note = text(data.note, 300);
    const reasonText = reason ? `Neden: ${reason}` : "Neden belirtilmedi";
    return {
      key: `cancel-${orderId}`,
      kind: "cancel",
      title: CUSTOMER_CANCEL_TITLE,
      detail: text([code, customerName, note ? `${reasonText} · “${text(note, 80)}”` : reasonText].filter(Boolean).join(" · "), 200),
      orderId,
      cancel: { code, customerName, reason, note, totalAmount: Number(data.totalAmount) || 0 },
      at: validDate(data.at, now),
    };
  }
  return null;
};

/** Listeyi panelin kurallarıyla kısaltır: en yeni önce, en çok 10 uygulama açılışı, toplam 30 (saf fonksiyon). */
export const capFeed = (items, { limit = FEED_LIMIT, appOpenLimit = APP_OPEN_LIMIT } = {}) => {
  let appOpens = 0;
  return [...items]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .filter((item) => item.kind !== "app-open" || ++appOpens <= appOpenLimit)
    .slice(0, limit);
};

// Panelin beklediği biçim (id = anahtar)
export const toClientItem = ({ key, kind, title, detail, chatId, userId, order, orderId, cancel, at }) => ({
  id: key,
  kind: kind === "order" ? undefined : kind,
  title,
  detail,
  ...(chatId ? { chatId } : {}),
  ...(userId ? { userId } : {}),
  ...(order ? { order } : {}),
  ...(orderId ? { orderId } : {}),
  ...(cancel ? { cancel } : {}),
  at: new Date(at).toISOString(),
});

const connectedDb = () => (mongoose.connection?.readyState === 1 ? mongoose.connection.db : null);

let indexesReady = null;
const ensureIndexes = (db) => {
  indexesReady ||= Promise.all([
    db.collection(FEED_COLLECTION).createIndex({ key: 1 }, { unique: true }),
    db.collection(FEED_COLLECTION).createIndex({ at: -1 }),
    db.collection(FEED_COLLECTION).createIndex({ savedAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
};

/** Olayı saklar (aynı anahtar varsa günceller: aynı sohbetin yeni mesajı, aynı müşterinin yeni açılışı). */
export const recordAdminEvent = async (event, data, { db = connectedDb(), now = new Date() } = {}) => {
  const item = feedItemFromEvent(event, data, now);
  if (!item || !db) return null;
  await ensureIndexes(db);
  await db.collection(FEED_COLLECTION).updateOne({ key: item.key }, { $set: { ...item, savedAt: now } }, { upsert: true });
  return item;
};

/**
 * Yönetici odasına canlı olay gönderir ve zil için saklar. Saklama isteği bekletmez, hatası olayı engellemez.
 * Veritabanı bağlı değilse (testler) yalnızca canlı olay gönderilir.
 */
export const notifyAdmins = (io, event, payload) => {
  io?.to("adminRoom").emit(event, payload);
  recordAdminEvent(event, payload).catch((error) => console.error("Yönetici bildirimi saklanamadı:", error.message));
};

/** Yöneticinin göreceği liste: kendi "temizle" zamanından sonraki olaylar */
export const listAdminFeed = async (db, userId) => {
  const read = userId ? await db.collection(READS_COLLECTION).findOne({ _id: String(userId) }) : null;
  const filter = read?.clearedAt ? { at: { $gt: new Date(read.clearedAt) } } : {};
  const items = await db.collection(FEED_COLLECTION).find(filter).sort({ at: -1 }).limit(200).toArray();
  return capFeed(items).map(toClientItem);
};

export const clearAdminFeed = async (db, userId, now = new Date()) => {
  await db.collection(READS_COLLECTION).updateOne({ _id: String(userId) }, { $set: { clearedAt: now } }, { upsert: true });
  return now;
};
