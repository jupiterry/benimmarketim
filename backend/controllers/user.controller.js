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
          status: { $in: ["Hazırlanıyor", "Yolda", "Teslim Edildi"] } // İptal edilmemiş siparişler
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
        $sort: { orderCount: -1, totalSpent: -1 }
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
    // Güvenlik: Sadece authenticated kullanıcının kendi ID'sini kullan
    // Body'den veya params'tan gelen userId parametreleri yok sayılır
    const userId = req.user.id || req.user._id;
    
    if (!userId) {
      return res.status(401).json({ message: "Kullanıcı kimliği bulunamadı" });
    }
    
    const { reason, deletionType, selectedDataTypes } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: "Hesap silme nedeni belirtilmelidir" });
    }

    if (deletionType === "partial" && (!selectedDataTypes || selectedDataTypes.length === 0)) {
      return res.status(400).json({ message: "Kısmi silme için en az bir veri türü seçilmelidir" });
    }

    let deletionTasks = [];
    let message = "";

    if (deletionType === "full") {
      // Tam hesap silme
      deletionTasks = [
        // Siparişleri sil
        Order.deleteMany({ user: userId }),
        
        // Geri bildirimleri sil
        Feedback.deleteMany({ user: userId }),
        
        // Sepet verilerini temizle (eğer ayrı bir model varsa)
        // Cart.deleteMany({ user: userId }),
        
        // Kullanıcıyı sil
        User.findByIdAndDelete(userId)
      ];
      message = "Hesabınız ve tüm verileriniz başarıyla silindi";
    } else {
      // Kısmi veri silme
      deletionTasks = [];
      
      if (selectedDataTypes.includes("orders")) {
        deletionTasks.push(Order.deleteMany({ user: userId }));
      }
      
      if (selectedDataTypes.includes("feedback")) {
        deletionTasks.push(Feedback.deleteMany({ user: userId }));
      }
      
      if (selectedDataTypes.includes("personal") || selectedDataTypes.includes("preferences")) {
        // Kullanıcı bilgilerini güncelle (silmek yerine anonimleştir)
        const updateFields = {};
        if (selectedDataTypes.includes("personal")) {
          updateFields.firstName = "Silinmiş";
          updateFields.lastName = "Kullanıcı";
          updateFields.email = `deleted_${userId}@example.com`;
          updateFields.phone = "";
        }
        if (selectedDataTypes.includes("preferences")) {
          updateFields.preferences = {};
        }
        
        if (Object.keys(updateFields).length > 0) {
          deletionTasks.push(User.findByIdAndUpdate(userId, updateFields));
        }
      }
      
      message = "Seçilen verileriniz başarıyla silindi";
    }

    if (deletionTasks.length > 0) {
      await Promise.all(deletionTasks);
    }

    // Log kaydı
    console.log(`Kullanıcı veri silme işlemi - ID: ${userId}, Tür: ${deletionType}, Neden: ${reason}, Veri Türleri: ${selectedDataTypes?.join(', ') || 'Tümü'}`);

    res.json({ 
      message: message,
      deletionType: deletionType,
      deletedDataTypes: selectedDataTypes || "all",
      deletedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Hesap silme hatası:", error);
    res.status(500).json({ message: "Veri silinirken hata oluştu", error: error.message });
  }
}; 