// Geri bildirim sonrası otomatik adımlar:
// - Düşük puan, 👎 veya sorunlu ürün → destek kuyruğuna kayıt (müşteriyle sipariş görüşmesi açılır)
// - Yönetici tek tıkla müşteriye özel telafi kuponu tanımlar
// - Önerilen telafi tutarı sipariş tutarından hesaplanır
import crypto from "crypto";
import Chat from "../models/chat.model.js";
import Coupon from "../models/coupon.model.js";
import Message from "../models/message.model.js";
import { createHandoff } from "./ai/assistant.service.js";
import { sendPushToUser } from "./push.service.js";
import { FEEDBACK_TAGS, ISSUE_TYPES, SUPPORT_RATING, labelsOf } from "../lib/feedbackOptions.js";

export const COMPENSATION_LIMITS = { min: 10, max: 500 };
export const COMPENSATION_VALID_DAYS = 30;

/** Destek kaydı gerektiren geri bildirim mi? */
export const needsSupport = ({ rating, deliveryRating, thumb, problemItems } = {}) =>
  thumb === "down"
  || (Number(rating) > 0 && Number(rating) <= SUPPORT_RATING)
  || (Number(deliveryRating) > 0 && Number(deliveryRating) <= SUPPORT_RATING)
  || (problemItems?.length || 0) > 0;

/** Sipariş tutarının ~%15'i, 5'e yuvarlanmış, 20–100 TL arası */
export const suggestCompensation = (orderTotal) => {
  const total = Number(orderTotal) || 0;
  if (total <= 0) return 25;
  return Math.min(100, Math.max(20, Math.round((total * 0.15) / 5) * 5));
};

/** Destek görevlisinin göreceği tek satırlık özet */
export const buildFeedbackSummary = (feedback) => {
  const parts = [];
  if (feedback.thumb === "down") parts.push("Sipariş için 👎 verdi");
  if (feedback.rating) parts.push(`Ürün puanı ${feedback.rating}/5`);
  if (feedback.deliveryRating) parts.push(`teslimat puanı ${feedback.deliveryRating}/5`);
  const tags = labelsOf(FEEDBACK_TAGS, feedback.tags || []);
  if (tags.length) parts.push(`seçtiği sorunlar: ${tags.join(", ")}`);
  const items = (feedback.problemItems || []).map((item) => `${item.name} (${ISSUE_TYPES[item.issue] || item.issue})`);
  if (items.length) parts.push(`sorunlu ürünler: ${items.join(", ")}`);
  const comment = String(feedback.comment || "").trim();
  if (comment) parts.push(`yorumu: “${comment.slice(0, 300)}”`);
  return parts.join("; ").slice(0, 950);
};

const CUSTOMER_NOTICE = "Geri bildiriminiz destek ekibimize ulaştı. Bir görevli siparişinizle ilgili size buradan dönüş yapacak.";

/**
 * Müşteriyle sipariş görüşmesi açar ve destek kuyruğuna "yüksek" öncelikli kayıt ekler.
 * Hata fırlatmaz; geri bildirim kaydını engellememelidir.
 * @returns {Promise<string|null>} Açılan/kullanılan sohbet kimliği
 */
export const openFeedbackSupport = async ({ feedback, user, io }) => {
  try {
    const summary = buildFeedbackSummary(feedback);
    // Aynı sipariş için açık bir asistan görüşmesi varsa o kullanılır; canlı görüşme sürüyorsa yenisi açılır
    let chat = feedback.order
      ? await Chat.findOne({ user: user._id, order: feedback.order, status: "active", mode: { $in: ["AI", "WAITING_FOR_AGENT"] } })
      : null;
    if (!chat) {
      chat = await Chat.create({ user: user._id, order: feedback.order || null, type: feedback.order ? "order" : "general", lastMessageSender: "user" });
    }
    const customerText = `Geri bildirimim: ${summary}`;
    const message = await Message.create({ chat: chat._id, sender: "user", senderName: user.name || "Müşteri", content: customerText });
    await Chat.updateOne({ _id: chat._id }, { $set: { lastMessage: customerText, lastMessageAt: message.createdAt, lastMessageSender: "user" }, $inc: { unreadCount: 1 } });
    await createHandoff({
      chat,
      io,
      priority: "high",
      reason: feedback.thumb === "down" ? "Sipariş değerlendirmesi: 👎" : "Sipariş değerlendirmesi: düşük puan / ürün sorunu",
      summary: `${user.name || "Müşteri"} ${summary}`.slice(0, 1000),
      userMessage: CUSTOMER_NOTICE,
    });
    return String(chat._id);
  } catch (error) {
    console.error("Geri bildirim için destek kaydı açılamadı:", error.message);
    return null;
  }
};

const randomCode = () => `TELAFI${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

/** Yöneticinin girdiği telafi tutarını doğrular */
export const validateCompensation = (body = {}) => {
  const amount = Math.round(Number(body?.amount));
  if (!Number.isFinite(amount) || amount < COMPENSATION_LIMITS.min || amount > COMPENSATION_LIMITS.max) {
    return { error: `Telafi tutarı ${COMPENSATION_LIMITS.min}–${COMPENSATION_LIMITS.max} TL arasında olmalı` };
  }
  return { amount };
};

/**
 * Müşteriye özel, tek kullanımlık sabit tutarlı kupon oluşturur ve müşteriye bildirim gönderir.
 * @returns {Promise<{coupon: object}>}
 */
export const createCompensationCoupon = async ({ userId, amount, feedbackId, now = new Date() }) => {
  const expirationDate = new Date(now.getTime() + COMPENSATION_VALID_DAYS * 24 * 60 * 60 * 1000);
  let coupon = null;
  for (let attempt = 0; attempt < 3 && !coupon; attempt++) {
    try {
      coupon = await Coupon.create({
        code: randomCode(),
        description: `Yaşadığınız sorun için ${amount} TL telafi indirimi`,
        discountType: "fixed",
        discountAmount: amount,
        minimumOrderAmount: 0,
        usageLimit: 1,
        userUsageLimit: 1,
        expirationDate,
        isActive: true,
        userId,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error; // Kod çakışırsa yeniden dene
    }
  }
  if (!coupon) throw new Error("COUPON_CODE_COLLISION");
  sendPushToUser(userId, {
    title: "Size özel indirim tanımladık",
    body: `Yaşadığınız sorun için üzgünüz. ${amount} TL indirim kuponunuz bir sonraki siparişinizde sizi bekliyor.`,
  }, { type: "compensation", feedbackId: String(feedbackId || ""), route: "/referral" }, { category: "orders" }).catch(() => {});
  return { coupon };
};
