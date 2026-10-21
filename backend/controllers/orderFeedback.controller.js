// Sipariş sonrası geri bildirim (mobil uygulama):
// - Detaylı anket: 1., 3. ve 5. teslim edilen siparişte (ürün puanı + teslimat puanı + yorum)
// - Hızlı soru: diğer her teslim edilen siparişten sonra tek dokunuş 👍/👎; 👎'de "Ne oldu?"
// - Tavsiye sorusu (NPS, 0-10): ayda en fazla bir kez
// - Vazgeçme sorusu: sepetini boşaltan müşteriye "Neden vazgeçtin?"
// Kayıtlar Feedback koleksiyonuna yazılır ve yönetici panelindeki "Geri bildirimler" sekmesinde görünür.
import mongoose from "mongoose";
import Feedback from "../models/feedback.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import {
  ABANDON_INTERVAL_DAYS, ABANDON_REASONS, FEEDBACK_MILESTONES, FEEDBACK_TAGS, ISSUE_TYPES, LOW_RATING,
  NPS_INTERVAL_DAYS, NPS_MIN_DELIVERED, POSITIVE_TAGS, QUICK_WINDOW_DAYS, labelsOf, pickKnown,
} from "../lib/feedbackOptions.js";
import { needsSupport, openFeedbackSupport } from "../services/feedbackFollowUp.service.js";

export { FEEDBACK_MILESTONES, FEEDBACK_TAGS };

const MIN_COMMENT = 5;
const MAX_COMMENT = 1000;
const MAX_PROBLEM_ITEMS = 10;
const DAY = 24 * 60 * 60 * 1000;

// Sorulacak kilometre taşı: ulaşılan en büyük taş; o taş (veya daha büyüğü) yanıtlandıysa sorulmaz.
export const pickMilestone = (deliveredCount, answeredMilestones = []) => {
  const reached = FEEDBACK_MILESTONES.filter((milestone) => deliveredCount >= milestone);
  if (!reached.length) return null;
  const target = reached[reached.length - 1];
  return answeredMilestones.some((milestone) => Number(milestone) >= target) ? null : target;
};

const loadState = async (userId) => {
  const [deliveredCount, answered] = await Promise.all([
    Order.countDocuments({ user: userId, status: "Teslim Edildi" }),
    Feedback.find({ user: userId, milestone: { $ne: null } }).select("milestone").lean(),
  ]);
  return { deliveredCount, milestone: pickMilestone(deliveredCount, answered.map((item) => item.milestone)) };
};

const ORDER_PRODUCT_FIELDS = "_id createdAt updatedAt totalAmount deliveryPoint deliveryPointName products.product products.name products.image products.quantity";

/** Mobil uygulamada sipariş ürünlerini listelemek için kısa özet */
export const orderPreview = (order) => order ? ({
  orderId: String(order._id),
  shortId: String(order._id).slice(-6).toUpperCase(),
  createdAt: order.createdAt || null,
  totalAmount: Number(order.totalAmount) || 0,
  deliveryPointName: order.deliveryPointName || "",
  products: (order.products || []).slice(0, 30).map((item) => ({
    productId: item.product ? String(item.product) : null,
    name: item.name || "",
    image: item.image || null,
    quantity: Number(item.quantity) || 0,
  })),
}) : null;

// Hızlı soru: son QUICK_WINDOW_DAYS gün içinde teslim edilmiş ve henüz değerlendirilmemiş son sipariş
const findQuickOrder = async (userId, now) => {
  const order = await Order.findOne({ user: userId, status: "Teslim Edildi", updatedAt: { $gte: new Date(now - QUICK_WINDOW_DAYS * DAY) } })
    .sort({ updatedAt: -1 }).select(ORDER_PRODUCT_FIELDS).lean();
  if (!order) return null;
  const answered = await Feedback.exists({ order: order._id, kind: { $in: ["quick", "order"] } });
  return answered ? null : order;
};

const npsDue = async (userId, deliveredCount, now) => {
  if (deliveredCount < NPS_MIN_DELIVERED) return false;
  const last = await Feedback.findOne({ user: userId, kind: "nps" }).sort({ createdAt: -1 }).select("createdAt").lean();
  return !last || now - new Date(last.createdAt).getTime() >= NPS_INTERVAL_DAYS * DAY;
};

// GET /api/feedback/prompt
// Eski uygulama sürümleri yalnızca `prompt` alanını okur; `quick` ve `nps` yeni sürüm içindir.
// Uygulama aynı oturumda bunlardan yalnızca birini gösterir (öncelik: anket → hızlı soru → NPS).
export const getOrderFeedbackPrompt = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = Date.now();
    const { deliveredCount, milestone } = await loadState(userId);
    let prompt = null;
    if (milestone) {
      const lastOrder = await Order.findOne({ user: userId, status: "Teslim Edildi" }).sort({ createdAt: -1 }).select(ORDER_PRODUCT_FIELDS).lean();
      prompt = { milestone, orderId: lastOrder ? String(lastOrder._id) : null, order: orderPreview(lastOrder) };
    }
    // Uygulama öncelik sırasıyla yalnızca birini gösterir; anket ertelendiyse hızlı soru yine sorulabilsin diye
    // üçü de bağımsız hesaplanır.
    const quickOrder = await findQuickOrder(userId, now);
    const nps = await npsDue(userId, deliveredCount, now);
    res.json({ success: true, deliveredCount, prompt, quick: quickOrder ? orderPreview(quickOrder) : null, nps });
  } catch (error) {
    console.error("Anket durumu alınamadı:", error.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

const clampComment = (value) => String(value ?? "").trim();

/** Siparişteki ürünlerle eşleşen sorun satırları (ürün kimliği veya adı ile) */
export const resolveProblemItems = (rawItems, order) => {
  if (!Array.isArray(rawItems) || !order) return [];
  const products = order.products || [];
  const seen = new Set();
  const result = [];
  for (const raw of rawItems.slice(0, MAX_PROBLEM_ITEMS)) {
    const issue = String(raw?.issue || "");
    if (!ISSUE_TYPES[issue]) continue;
    const productId = raw?.productId ? String(raw.productId) : "";
    const name = String(raw?.name || "").trim();
    const match = products.find((item) => (productId && item.product && String(item.product) === productId) || (!productId && name && item.name === name));
    if (!match) continue;
    const key = `${match.product || match.name}:${issue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ product: match.product || null, name: match.name || name, issue });
  }
  return result;
};

/**
 * Detaylı anket doğrulaması. Yeni uygulama `deliveryRating` gönderir ve yorum her puanda zorunludur;
 * eski sürümler (teslimat puanı yok) yalnızca düşük puanda yorum yazmak zorundadır.
 */
export const validateOrderFeedback = (body = {}) => {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Lütfen 1 ile 5 arasında bir puan verin" };
  const milestone = Number(body.milestone);
  if (!FEEDBACK_MILESTONES.includes(milestone)) return { error: "Geçersiz anket" };
  const hasDelivery = body.deliveryRating !== undefined && body.deliveryRating !== null;
  const deliveryRating = hasDelivery ? Number(body.deliveryRating) : null;
  if (hasDelivery && (!Number.isInteger(deliveryRating) || deliveryRating < 1 || deliveryRating > 5)) return { error: "Lütfen teslimata 1 ile 5 arasında bir puan verin" };
  const tags = pickKnown(FEEDBACK_TAGS, body.tags);
  const comment = clampComment(body.comment);
  if (comment.length > MAX_COMMENT) return { error: `Yorum en fazla ${MAX_COMMENT} karakter olabilir` };
  if ((hasDelivery || rating <= LOW_RATING) && comment.length < MIN_COMMENT) {
    return { error: rating <= LOW_RATING ? "Neyi daha iyi yapabileceğimizi kısaca yazar mısınız?" : "Lütfen deneyimini birkaç kelimeyle yaz" };
  }
  const orderId = body.orderId && mongoose.isValidObjectId(body.orderId) ? String(body.orderId) : null;
  const data = { rating, milestone, tags, comment, orderId };
  if (hasDelivery) data.deliveryRating = deliveryRating;
  if (Array.isArray(body.problemItems)) data.problemItems = body.problemItems;
  return { data };
};

const findOwnOrder = (orderId, userId, fields = "_id") =>
  orderId ? Order.findOne({ _id: orderId, user: userId }).select(fields).lean() : null;

const afterSave = async (req, feedback) => {
  await User.findByIdAndUpdate(req.user._id, { hasFeedback: true });
  const io = req.app?.get?.("io");
  const low = (feedback.rating && feedback.rating <= LOW_RATING) || feedback.thumb === "down" || feedback.problemItems?.length;
  if (low) {
    io?.to("adminRoom").emit("lowFeedbackCreated", {
      feedbackId: String(feedback._id), rating: feedback.rating ?? null, thumb: feedback.thumb ?? null,
      customerName: req.user.name || "Müşteri", milestone: feedback.milestone ?? null,
      problemItems: (feedback.problemItems || []).map((item) => item.name),
    });
  }
  if (needsSupport(feedback)) {
    const chatId = await openFeedbackSupport({ feedback, user: req.user, io });
    if (chatId) await Feedback.updateOne({ _id: feedback._id }, { $set: { supportChat: chatId } }).catch(() => {});
    return chatId;
  }
  return null;
};

// POST /api/feedback/order — detaylı anket
export const submitOrderFeedback = async (req, res) => {
  try {
    const { data, error } = validateOrderFeedback(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const userId = req.user._id;

    const state = await loadState(userId);
    if (state.milestone !== data.milestone) return res.status(409).json({ success: false, message: "Bu anket daha önce yanıtlanmış" });

    // Sipariş yalnızca müşterinin kendi siparişiyse ilişkilendirilir
    const order = await findOwnOrder(data.orderId, userId, data.problemItems ? "_id deliveryPoint products.product products.name" : "_id deliveryPoint");
    const problemItems = resolveProblemItems(data.problemItems, order);
    const tagLabels = data.tags.map((tag) => FEEDBACK_TAGS[tag]);
    const doc = {
      user: userId,
      kind: "order",
      rating: data.rating,
      ratings: { overall: data.rating },
      title: `${data.milestone}. sipariş deneyimi`,
      message: data.comment || (tagLabels.length ? tagLabels.join(", ") : "Puan bazlı değerlendirme"),
      category: data.rating <= LOW_RATING || problemItems.length ? "Şikayet" : "Genel",
      visibility: "private",
      milestone: data.milestone,
      order: order?._id || null,
      deliveryPoint: order?.deliveryPoint || "",
      tags: data.tags,
    };
    if (data.deliveryRating) doc.deliveryRating = data.deliveryRating;
    if (problemItems.length) doc.problemItems = problemItems;
    const feedback = await Feedback.create(doc);
    const supportChatId = await afterSave(req, { ...doc, _id: feedback._id, comment: data.comment });
    res.status(201).json({ success: true, feedbackId: String(feedback._id), supportChatId });
  } catch (error) {
    console.error("Anket kaydedilemedi:", error.message);
    res.status(500).json({ success: false, message: "Geri bildirim kaydedilemedi" });
  }
};

/** Hızlı soru doğrulaması: 👍 tek dokunuş; 👎'de en az bir seçenek ya da kısa açıklama zorunlu */
export const validateQuickFeedback = (body = {}) => {
  const thumb = body.thumb === "up" || body.thumb === "down" ? body.thumb : null;
  if (!thumb) return { error: "Lütfen 👍 ya da 👎 seç" };
  if (!body.orderId || !mongoose.isValidObjectId(body.orderId)) return { error: "Sipariş bulunamadı" };
  const tags = pickKnown(FEEDBACK_TAGS, body.tags).filter((tag) => (thumb === "up") === POSITIVE_TAGS.includes(tag));
  const comment = clampComment(body.comment);
  if (comment.length > MAX_COMMENT) return { error: `Yorum en fazla ${MAX_COMMENT} karakter olabilir` };
  const problemItems = thumb === "down" && Array.isArray(body.problemItems) ? body.problemItems : [];
  if (thumb === "down" && !tags.length && !problemItems.length && comment.length < MIN_COMMENT) {
    return { error: "Ne olduğunu seç ya da kısaca yaz" };
  }
  return { data: { thumb, orderId: String(body.orderId), tags, comment, problemItems } };
};

// POST /api/feedback/quick — sipariş sonrası 👍/👎
export const submitQuickFeedback = async (req, res) => {
  try {
    const { data, error } = validateQuickFeedback(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const userId = req.user._id;
    const order = await Order.findOne({ _id: data.orderId, user: userId }).select("_id status deliveryPoint products.product products.name").lean();
    if (!order) return res.status(404).json({ success: false, message: "Sipariş bulunamadı" });
    if (order.status !== "Teslim Edildi") return res.status(409).json({ success: false, message: "Sipariş henüz teslim edilmedi" });
    if (await Feedback.exists({ order: order._id, kind: { $in: ["quick", "order"] } })) {
      return res.status(409).json({ success: false, message: "Bu sipariş zaten değerlendirildi" });
    }
    const problemItems = resolveProblemItems(data.problemItems, order);
    const tagLabels = labelsOf(FEEDBACK_TAGS, data.tags);
    const down = data.thumb === "down";
    const doc = {
      user: userId,
      kind: "quick",
      thumb: data.thumb,
      title: down ? "Sipariş: 👎" : "Sipariş: 👍",
      message: data.comment || tagLabels.join(", ") || (problemItems.length ? problemItems.map((item) => item.name).join(", ") : down ? "Siparişten memnun kalmadı" : "Siparişten memnun kaldı"),
      category: down ? "Şikayet" : "Genel",
      visibility: "private",
      order: order._id,
      deliveryPoint: order.deliveryPoint || "",
      tags: data.tags,
      problemItems,
    };
    const feedback = await Feedback.create(doc);
    const supportChatId = await afterSave(req, { ...doc, _id: feedback._id, comment: data.comment });
    res.status(201).json({ success: true, feedbackId: String(feedback._id), supportChatId });
  } catch (error) {
    console.error("Hızlı geri bildirim kaydedilemedi:", error.message);
    res.status(500).json({ success: false, message: "Geri bildirim kaydedilemedi" });
  }
};

// POST /api/feedback/nps — "Bizi bir arkadaşına önerir misin?" (0-10)
export const submitNps = async (req, res) => {
  try {
    const score = Number(req.body?.score);
    if (!Number.isInteger(score) || score < 0 || score > 10) return res.status(400).json({ success: false, message: "Lütfen 0 ile 10 arasında bir puan seç" });
    const comment = clampComment(req.body?.comment).slice(0, MAX_COMMENT);
    const userId = req.user._id;
    const now = Date.now();
    const deliveredCount = await Order.countDocuments({ user: userId, status: "Teslim Edildi" });
    if (!(await npsDue(userId, deliveredCount, now))) return res.status(409).json({ success: false, message: "Bu soruyu yakın zamanda yanıtladın" });
    const feedback = await Feedback.create({
      user: userId,
      kind: "nps",
      npsScore: score,
      title: "Tavsiye puanı",
      message: comment || `Tavsiye puanı: ${score}/10`,
      category: score <= 6 ? "Şikayet" : "Genel",
      visibility: "private",
    });
    res.status(201).json({ success: true, feedbackId: String(feedback._id) });
  } catch (error) {
    console.error("Tavsiye puanı kaydedilemedi:", error.message);
    res.status(500).json({ success: false, message: "Yanıt kaydedilemedi" });
  }
};

// POST /api/feedback/abandon — sepetini boşaltan müşteri: "Neden vazgeçtin?"
export const submitAbandonReason = async (req, res) => {
  try {
    const reason = String(req.body?.reason || "");
    if (!ABANDON_REASONS[reason]) return res.status(400).json({ success: false, message: "Lütfen bir neden seç" });
    const note = clampComment(req.body?.note).slice(0, 300);
    const userId = req.user._id;
    const recent = await Feedback.exists({ user: userId, kind: "abandon", createdAt: { $gte: new Date(Date.now() - ABANDON_INTERVAL_DAYS * DAY) } });
    if (recent) return res.json({ success: true, skipped: true });
    await Feedback.create({
      user: userId,
      kind: "abandon",
      reason,
      title: "Sepetten vazgeçti",
      message: note || ABANDON_REASONS[reason],
      category: "Öneri",
      visibility: "private",
    });
    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Vazgeçme nedeni kaydedilemedi:", error.message);
    res.status(500).json({ success: false, message: "Yanıt kaydedilemedi" });
  }
};
