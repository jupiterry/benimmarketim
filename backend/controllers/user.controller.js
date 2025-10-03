import User from "../models/user.model.js";
import Order from "../models/order.model.js";

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