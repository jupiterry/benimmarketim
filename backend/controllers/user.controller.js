import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Feedback from "../models/feedback.model.js";

// Kullanıcı bilgilerini getir
export const getUserInfo = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }
    res.json(user);
  } catch (error) {
    console.error("Kullanıcı bilgileri getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

// En iyi müşterileri getir
export const getBestCustomers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const bestCustomers = await Order.aggregate([
      {
        $match: {
          status: { $in: ["completed", "processing", "shipped"] } // İptal edilmemiş siparişler
        }
      },
      {
        $group: {
          _id: "$user",
          totalSpent: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalSpent: -1 }
      },
      {
        $limit: limit
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo"
        }
      },
      {
        $unwind: "$userInfo"
      },
      {
        $project: {
          userId: "$_id",
          name: "$userInfo.name",
          email: "$userInfo.email",
          totalSpent: 1,
          orderCount: 1,
          avgOrderValue: { $divide: ["$totalSpent", "$orderCount"] }
        }
      }
    ]);

    res.json({ customers: bestCustomers });
  } catch (error) {
    console.error("En iyi müşteriler getirilirken hata:", error);
    res.status(500).json({ message: "Sunucu hatası", error: error.message });
  }
};

// Hesap silme
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: "Hesap silme nedeni belirtilmelidir" });
    }

    // Kullanıcının tüm verilerini sil
    const deletionTasks = [
      // Siparişleri sil
      Order.deleteMany({ user: userId }),
      
      // Geri bildirimleri sil
      Feedback.deleteMany({ user: userId }),
      
      // Sepet verilerini temizle (eğer ayrı bir model varsa)
      // Cart.deleteMany({ user: userId }),
      
      // Kullanıcıyı sil
      User.findByIdAndDelete(userId)
    ];

    await Promise.all(deletionTasks);

    // Log kaydı
    console.log(`Kullanıcı hesabı silindi - ID: ${userId}, Neden: ${reason}`);

    res.json({ 
      message: "Hesabınız ve tüm verileriniz başarıyla silindi",
      deletedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Hesap silme hatası:", error);
    res.status(500).json({ message: "Hesap silinirken hata oluştu", error: error.message });
  }
}; 