// Sipariş sonrası deneyim anketi: müşteriye 1., 5. ve 15. teslim edilen siparişinden sonra sorulur.
// Kayıtlar mevcut Feedback koleksiyonuna yazılır ve yönetici panelindeki "Geri bildirimler" sekmesinde görünür.
import mongoose from "mongoose";
import Feedback from "../models/feedback.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";

export const FEEDBACK_MILESTONES = [1, 5, 15];
// Mobil uygulamadaki hazır seçeneklerle aynı liste; sunucu yalnızca bunları kabul eder.
export const FEEDBACK_TAGS = {
  hizli: "Hızlı geldi", taze: "Ürünler tazeydi", kurye: "Kurye nazikti", fiyat: "Fiyatlar uygundu", kolay: "Uygulama kolaydı",
  gec: "Geç geldi", eksik: "Eksik ürün vardı", yanlis: "Yanlış ürün geldi", bozuk: "Ürün bozuk/ezikti", pahali: "Fiyatlar yüksekti", uygulama: "Uygulamada sorun yaşadım",
};
const LOW_RATING = 3; // Bu puan ve altında müşteriden açıklama istenir
const MIN_COMMENT = 5;
const MAX_COMMENT = 1000;

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

// GET /api/feedback/prompt
export const getOrderFeedbackPrompt = async (req, res) => {
  try {
    const { deliveredCount, milestone } = await loadState(req.user._id);
    if (!milestone) return res.json({ success: true, deliveredCount, prompt: null });
    const lastOrder = await Order.findOne({ user: req.user._id, status: "Teslim Edildi" }).sort({ createdAt: -1 }).select("_id").lean();
    res.json({ success: true, deliveredCount, prompt: { milestone, orderId: lastOrder ? String(lastOrder._id) : null } });
  } catch (error) {
    console.error("Anket durumu alınamadı:", error.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const validateOrderFeedback = (body = {}) => {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Lütfen 1 ile 5 arasında bir puan verin" };
  const milestone = Number(body.milestone);
  if (!FEEDBACK_MILESTONES.includes(milestone)) return { error: "Geçersiz anket" };
  const tags = Array.isArray(body.tags) ? [...new Set(body.tags.map(String))].filter((tag) => FEEDBACK_TAGS[tag]).slice(0, 6) : [];
  const comment = String(body.comment ?? "").trim();
  if (comment.length > MAX_COMMENT) return { error: `Yorum en fazla ${MAX_COMMENT} karakter olabilir` };
  if (rating <= LOW_RATING && comment.length < MIN_COMMENT) return { error: "Neyi daha iyi yapabileceğimizi kısaca yazar mısınız?" };
  const orderId = body.orderId && mongoose.isValidObjectId(body.orderId) ? String(body.orderId) : null;
  return { data: { rating, milestone, tags, comment, orderId } };
};

// POST /api/feedback/order
export const submitOrderFeedback = async (req, res) => {
  try {
    const { data, error } = validateOrderFeedback(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const userId = req.user._id;

    const state = await loadState(userId);
    if (state.milestone !== data.milestone) return res.status(409).json({ success: false, message: "Bu anket daha önce yanıtlanmış" });

    // Sipariş yalnızca müşterinin kendi siparişiyse ilişkilendirilir
    const order = data.orderId ? await Order.findOne({ _id: data.orderId, user: userId }).select("_id").lean() : null;
    const tagLabels = data.tags.map((tag) => FEEDBACK_TAGS[tag]);
    const feedback = await Feedback.create({
      user: userId,
      rating: data.rating,
      ratings: { overall: data.rating },
      title: `${data.milestone}. sipariş deneyimi`,
      message: data.comment || (tagLabels.length ? tagLabels.join(", ") : "Puan bazlı değerlendirme"),
      category: data.rating <= LOW_RATING ? "Şikayet" : "Genel",
      visibility: "private",
      milestone: data.milestone,
      order: order?._id || null,
      tags: data.tags,
    });
    await User.findByIdAndUpdate(userId, { hasFeedback: true });

    // Düşük puanlar yönetici paneline anında haber verilir
    if (data.rating <= LOW_RATING) {
      req.app.get("io")?.to("adminRoom").emit("lowFeedbackCreated", { feedbackId: String(feedback._id), rating: data.rating, customerName: req.user.name || "Müşteri", milestone: data.milestone });
    }
    res.status(201).json({ success: true, feedbackId: String(feedback._id) });
  } catch (error) {
    console.error("Anket kaydedilemedi:", error.message);
    res.status(500).json({ success: false, message: "Geri bildirim kaydedilemedi" });
  }
};
