import Feedback from "../models/feedback.model.js";
import User from "../models/user.model.js";

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