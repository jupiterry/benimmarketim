import mongoose from "mongoose";
import Feedback from "../models/feedback.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const MAX_REPLY = 1000;
const FEEDBACK_STATUSES = ["Yeni", "İnceleniyor", "Çözüldü", "Kapatıldı"];

// Geri bildirim oluştur
export const createFeedback = async (req, res) => {
  try {
    const { rating, ratings, title, message, category } = req.body;
    const userId = req.user._id;

    const feedback = await Feedback.create({
      user: userId,
      rating,
      ratings,
      title,
      message,
      category,
    });

    // Kullanıcının geri bildirim durumunu güncelle
    await User.findByIdAndUpdate(userId, { hasFeedback: true });

    res.status(201).json(feedback);
  } catch (error) {
    console.error("Geri bildirim oluşturulurken hata:", error);
    res.status(500).json({ message: "Geri bildirim oluşturulamadı", error: error.message });
  }
};

// Tüm geri bildirimleri getir
export const getAllFeedbacks = async (req, res) => {
  try {
    const feedbacks = await Feedback.find()
      .populate("user", "name email")
      .sort("-createdAt");

    res.json(feedbacks);
  } catch (error) {
    console.error("Geri bildirimler getirilirken hata:", error);
    res.status(500).json({ message: "Geri bildirimler getirilemedi", error: error.message });
  }
};

// Geri bildirim durumunu güncelle
export const updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate("user", "name email");

    if (!feedback) {
      return res.status(404).json({ message: "Geri bildirim bulunamadı" });
    }

    res.json(feedback);
  } catch (error) {
    console.error("Geri bildirim durumu güncellenirken hata:", error);
    res.status(500).json({ message: "Geri bildirim durumu güncellenemedi", error: error.message });
  }
};

// Geri bildirim istatistiklerini getir
export const getFeedbackStats = async (req, res) => {
  try {
    const stats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalFeedbacks: { $sum: 1 },
          categoryStats: {
            $push: {
              category: "$category",
              rating: "$rating",
            },
          },
          detailedRatings: {
            $push: {
              usability: "$ratings.usability",
              expectations: "$ratings.expectations",
              repeat: "$ratings.repeat",
              overall: "$ratings.overall",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          averageRating: { $round: ["$averageRating", 1] },
          totalFeedbacks: 1,
          categoryStats: 1,
          detailedRatings: 1,
        },
      },
    ]);

    res.json(stats[0] || {
      averageRating: 0,
      totalFeedbacks: 0,
      categoryStats: [],
      detailedRatings: [],
    });
  } catch (error) {
    console.error("Geri bildirim istatistikleri getirilirken hata:", error);
    res.status(500).json({ message: "İstatistikler getirilemedi", error: error.message });
  }
};

// Kullanıcının kendi geri bildirimlerini getir
export const getUserFeedbacks = async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(feedbacks);
  } catch (error) {
    res.status(400).json({ message: "Geri bildirimler alınamadı", error: error.message });
  }
};

// Geri bildirim sil
export const deleteFeedback = async (req, res) => {
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ message: "Geri bildirim başarıyla silindi" });
  } catch (error) {
    res.status(400).json({ message: "Geri bildirim silinemedi", error: error.message });
  }
}; 
// ── Yönetici paneli ekleri (mevcut uç noktaların davranışı değişmedi) ──

/** Yanıt metnini doğrular: boş metin yanıtı kaldırır, uzunluk sınırı vardır. */
export const validateAdminReply = (body = {}) => {
  const text = String(body?.text ?? "").trim();
  if (text.length > MAX_REPLY) return { error: `Yanıt en fazla ${MAX_REPLY} karakter olabilir` };
  return { text };
};

// PATCH /api/feedback/:id/reply — yönetici yanıtı yaz/güncelle (boş metin yanıtı kaldırır)
export const replyToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Geçersiz geri bildirim" });
    const { text, error } = validateAdminReply(req.body);
    if (error) return res.status(400).json({ message: error });

    const current = await Feedback.findById(id).select("status adminReply title").lean();
    if (!current) return res.status(404).json({ message: "Geri bildirim bulunamadı" });

    const update = text
      ? { adminReply: { text, at: new Date(), by: req.user._id } }
      : { adminReply: { text: "", at: null, by: null } };
    // İlk yanıt "Yeni" kaydı kendiliğinden "İnceleniyor"a taşır; çözülmüş/kapalı kayıt olduğu gibi kalır
    if (text && current.status === "Yeni") update.status = "İnceleniyor";

    const feedback = await Feedback.findByIdAndUpdate(id, update, { new: true })
      .populate("user", "name email")
      .populate("adminReply.by", "name");
    if (!feedback) return res.status(404).json({ message: "Geri bildirim bulunamadı" });

    const changes = [{ label: "Yanıt", from: current.adminReply?.text || "", to: text }];
    if (update.status) changes.push({ label: "Durum", from: current.status, to: update.status });
    recordAdminAction(req, {
      action: text ? "Geri bildirim yanıtlandı" : "Geri bildirim yanıtı kaldırıldı",
      category: "customer",
      target: id,
      targetName: feedback.user?.name || current.title || "Geri bildirim",
      changes,
    });
    res.json(feedback);
  } catch (error) {
    console.error("Geri bildirim yanıtlanırken hata:", error);
    res.status(500).json({ message: "Yanıt kaydedilemedi", error: error.message });
  }
};

/** Panelde gösterilecek kısa sipariş özeti (ürün satırları en fazla 20) */
export const summarizeOrder = (order) => {
  if (!order) return null;
  const products = Array.isArray(order.products) ? order.products : [];
  return {
    orderId: String(order._id),
    status: order.status || "",
    totalAmount: Number(order.totalAmount) || 0,
    createdAt: order.createdAt || null,
    deliveryPoint: order.deliveryPoint || "",
    deliveryPointName: order.deliveryPointName || "",
    itemCount: products.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    products: products.slice(0, 20).map((item) => ({ name: item.name || "", quantity: Number(item.quantity) || 0, price: Number(item.price) || 0 })),
  };
};

// GET /api/feedback/:id/order — anket kaydına bağlı siparişin özeti
export const getFeedbackOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Geçersiz geri bildirim" });
    const feedback = await Feedback.findById(id).select("order").lean();
    if (!feedback) return res.status(404).json({ message: "Geri bildirim bulunamadı" });
    if (!feedback.order) return res.status(404).json({ message: "Bu geri bildirime bağlı sipariş yok" });
    const order = await Order.findById(feedback.order).select("products totalAmount status createdAt deliveryPoint deliveryPointName").lean();
    if (!order) return res.status(404).json({ message: "Bağlı sipariş bulunamadı" });
    res.json(summarizeOrder(order));
  } catch (error) {
    console.error("Geri bildirim siparişi getirilirken hata:", error);
    res.status(500).json({ message: "Sipariş özeti getirilemedi", error: error.message });
  }
};

export { FEEDBACK_STATUSES };
