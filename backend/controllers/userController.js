// backend/controllers/userController.js
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

export const getAllUsers = async (req, res) => {
  try {
    // Tüm kullanıcıları getir ve son aktiflik bilgisini dahil et
    const users = await User.find()
      .select("-password")
      .populate({
        path: 'cartItems.product',
        select: 'name price image'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Son aktiflik ve kayıt tarihlerini düzgün formatlayarak gönder
    const formattedUsers = users.map(user => {
      // lastActive ve createdAt için güvenli dönüşüm
      const lastActive = user.lastActive ? new Date(user.lastActive) : null;
      const createdAt = user.createdAt ? new Date(user.createdAt) : null;

      return {
        ...user,
        lastActive: lastActive ? lastActive.toISOString() : null,
        createdAt: createdAt ? createdAt.toISOString() : null,
        // Ek olarak timestamp'leri de ekle
        lastActiveTimestamp: lastActive ? lastActive.getTime() : null,
        createdAtTimestamp: createdAt ? createdAt.getTime() : null,
        // Sepet öğelerini düzenle
        cartItems: user.cartItems?.map(item => ({
          product: {
            _id: item.product?._id,
            name: item.product?.name || 'Ürün bulunamadı',
            price: item.product?.price || 0,
            image: item.product?.image
          },
          quantity: item.quantity
        })) || []
      };
    });

    // Kullanıcıları son aktiflik tarihine göre sırala
    formattedUsers.sort((a, b) => {
      const timeA = a.lastActiveTimestamp || 0;
      const timeB = b.lastActiveTimestamp || 0;
      return timeB - timeA;
    });

    res.status(200).json({ 
      success: true, 
      users: formattedUsers,
      serverTime: new Date().toISOString() // İstemci tarafında zaman farkını hesaplamak için
    });
  } catch (error) {
    console.error("Kullanıcılar getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Kullanıcılar getirilirken hata oluştu" });
  }
};

// Şifre Sıfırlama fonksiyonu
export const resetUserPassword = async (req, res) => {
  const { userId } = req.params;
  const { tempPassword } = req.body;
  
  try {
    if (!tempPassword) {
      return res.status(400).json({ success: false, message: "Geçici şifre belirtilmedi" });
    }
    
    // Şifreyi hash'le
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);
    
    // Kullanıcının şifresini güncelle
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        password: hashedPassword,
        // İsteğe bağlı: kullanıcıya bir sonraki girişte şifre değiştirmeyi zorunlu kılma
        // passwordResetRequired: true 
      },
      { new: true }
    ).select("-password");
    
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    
    // Başarılı yanıt
    res.status(200).json({ 
      success: true, 
      message: "Kullanıcı şifresi başarıyla sıfırlandı",
      user: updatedUser
    });
  } catch (error) {
    console.error("Şifre sıfırlanırken hata:", error);
    res.status(500).json({ success: false, message: "Şifre sıfırlanırken hata oluştu" });
  }
};

export const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { name, email, phone } = req.body;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email, phone },
      { new: true, runValidators: true }
    ).select("-password");
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Kullanıcı güncellenirken hata oluştu" });
  }
};

export const addPhoneFieldToAllUsers = async (req, res) => {
  try {
    await User.updateMany({}, { $set: { phone: "" } });
    res.status(200).json({ success: true, message: "Tüm kullanıcılara telefon alanı eklendi" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Telefon alanı eklenirken hata oluştu" });
  }
};

export const deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }
    res.status(200).json({ success: true, message: "Kullanıcı başarıyla silindi" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Kullanıcı silinirken hata oluştu" });
  }
};