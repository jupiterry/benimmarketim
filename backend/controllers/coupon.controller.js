import Coupon from "../models/coupon.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";

// Kullanıcının kuponlarını getir (TÜM kullanıcıya ait kuponlar)
export const getCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    
    // Kullanıcıya özel kuponlar (referral dahil)
    const userCoupons = await Coupon.find({ 
      userId: userId, 
      isActive: true,
      expirationDate: { $gt: now }
    }).sort({ createdAt: -1 });
    
    // Genel aktif kuponlar (herkes için geçerli)
    const generalCoupons = await Coupon.find({
      isActive: true,
      expirationDate: { $gt: now },
      userId: { $exists: false }
    }).sort({ createdAt: -1 });
    
    // Kuponları birleştir, kullanıcının kendi kuponları önce
    const allCoupons = [...userCoupons, ...generalCoupons];
    
    res.json({ 
      success: true, 
      coupons: allCoupons,
      // İlk kullanıcı kuponu (eski format için uyumluluk)
      coupon: userCoupons.length > 0 ? userCoupons[0] : null
    });
  } catch (error) {
    console.log("Error in getCoupon controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Tüm kuponları getir (Admin)
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate("referredBy", "name email")
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
    
    res.json({ success: true, coupons });
  } catch (error) {
    console.error("Kuponlar getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Aktif kuponları getir (Public)
export const getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      expirationDate: { $gt: now },
      isReferralCoupon: { $ne: true }, // Referral kuponları hariç
      userId: { $exists: false } // Kullanıcıya özel olmayanlar
    }).select("code description discountType discountPercentage discountAmount minimumOrderAmount expirationDate");
    
    res.json({ success: true, coupons });
  } catch (error) {
    console.error("Aktif kuponlar getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Kupon kodu kontrol et
export const validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const userId = req.user?._id;

    if (!code) {
      return res.status(400).json({ success: false, message: "Kupon kodu gerekli" });
    }

    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase().trim(),
      isActive: true
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: "Geçersiz kupon kodu" });
    }

    // Tarih kontrolü
    if (coupon.expirationDate < new Date()) {
      coupon.isActive = false;
      await coupon.save();
      return res.status(400).json({ success: false, message: "Bu kuponun süresi dolmuş" });
    }

    // Kupon geçerliliğini kontrol et
    if (coupon.isValid) {
      const validation = coupon.isValid(userId, orderAmount || 0);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
      }
    }

    // İlk sipariş kontrolü
    if (coupon.firstOrderOnly && userId) {
      const existingOrders = await Order.countDocuments({ user: userId });
      if (existingOrders > 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Bu kupon sadece ilk siparişiniz için geçerlidir" 
        });
      }
    }

    // İndirim hesapla
    let calculatedDiscount = 0;
    if (coupon.calculateDiscount) {
      calculatedDiscount = coupon.calculateDiscount(orderAmount || 0);
    } else {
      // Eski format için
      calculatedDiscount = orderAmount ? (orderAmount * coupon.discountPercentage / 100) : 0;
    }

    res.json({
      success: true,
      message: "Kupon geçerli",
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType || "percentage",
        discountPercentage: coupon.discountPercentage,
        discountAmount: coupon.discountAmount,
        minimumOrderAmount: coupon.minimumOrderAmount,
        maximumDiscount: coupon.maximumDiscount,
        calculatedDiscount
      }
    });
  } catch (error) {
    console.error("Kupon doğrulanırken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Kuponu kullan (Sipariş tamamlandığında çağrılır)
export const useCoupon = async (couponCode, userId, orderId, orderAmount) => {
  try {
    const coupon = await Coupon.findOne({ 
      code: couponCode.toUpperCase().trim(),
      isActive: true 
    });
    
    if (!coupon) {
      return { success: false, message: "Kupon bulunamadı" };
    }

    // Kullanım kaydet
    if (!coupon.usedBy) coupon.usedBy = [];
    coupon.usedBy.push({
      user: userId,
      orderId: orderId,
      usedAt: new Date()
    });
    coupon.usageCount = (coupon.usageCount || 0) + 1;
    
    // Kullanım limitine ulaşıldıysa deaktif et
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      coupon.isActive = false;
    }
    
    await coupon.save();

    // Eğer referral kuponu ise, referans veren kişiye de kupon oluştur
    if (coupon.isReferralCoupon && coupon.referredBy) {
      await createReferralRewardCoupon(coupon.referredBy);
    }

    // İndirim hesapla
    let discount = 0;
    if (coupon.calculateDiscount) {
      discount = coupon.calculateDiscount(orderAmount);
    } else {
      discount = (orderAmount * coupon.discountPercentage / 100);
    }

    return { success: true, discount };
  } catch (error) {
    console.error("Kupon kullanılırken hata:", error);
    return { success: false, message: "Sunucu hatası" };
  }
};

// Yeni kupon oluştur (Admin)
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountPercentage,
      discountAmount,
      minimumOrderAmount,
      maximumDiscount,
      usageLimit,
      userUsageLimit,
      expirationDate,
      applicableCategories,
      newUsersOnly,
      firstOrderOnly
    } = req.body;

    // Validasyon
    if (!code || !expirationDate) {
      return res.status(400).json({ 
        success: false, 
        message: "Kupon kodu ve son kullanma tarihi gerekli" 
      });
    }

    // Kupon kodu benzersiz mi kontrol et
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (existingCoupon) {
      return res.status(400).json({ 
        success: false, 
        message: "Bu kupon kodu zaten kullanılıyor" 
      });
    }

    const newCoupon = new Coupon({
      code: code.toUpperCase().trim(),
      description: description || "",
      discountType: discountType || "percentage",
      discountPercentage: discountPercentage || 0,
      discountAmount: discountAmount || 0,
      minimumOrderAmount: minimumOrderAmount || 0,
      maximumDiscount: maximumDiscount || null,
      usageLimit: usageLimit || null,
      userUsageLimit: userUsageLimit || 1,
      expirationDate: new Date(expirationDate),
      applicableCategories: applicableCategories || [],
      newUsersOnly: newUsersOnly || false,
      firstOrderOnly: firstOrderOnly || false
    });

    await newCoupon.save();

    res.status(201).json({
      success: true,
      message: "Kupon başarıyla oluşturuldu",
      coupon: newCoupon
    });
  } catch (error) {
    console.error("Kupon oluşturulurken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Kupon güncelle (Admin)
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Kupon bulunamadı" });
    }

    // Güncelle
    const allowedFields = [
      'code', 'description', 'discountType', 'discountPercentage', 'discountAmount',
      'minimumOrderAmount', 'maximumDiscount', 'usageLimit', 'userUsageLimit',
      'expirationDate', 'isActive', 'applicableCategories', 'newUsersOnly', 'firstOrderOnly'
    ];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        coupon[field] = updateData[field];
      }
    });

    await coupon.save();

    res.json({
      success: true,
      message: "Kupon güncellendi",
      coupon
    });
  } catch (error) {
    console.error("Kupon güncellenirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Kupon sil (Admin)
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Kupon bulunamadı" });
    }

    res.json({ success: true, message: "Kupon silindi" });
  } catch (error) {
    console.error("Kupon silinirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Kupon durumunu değiştir (Admin)
export const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Kupon bulunamadı" });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.json({
      success: true,
      message: `Kupon ${coupon.isActive ? 'aktif edildi' : 'deaktif edildi'}`,
      coupon
    });
  } catch (error) {
    console.error("Kupon durumu değiştirilirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Referral ödül kuponu oluştur (Dahili fonksiyon)
export const createReferralRewardCoupon = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return null;

    // Benzersiz kupon kodu oluştur
    const code = `TESEKKUR${Date.now().toString(36).toUpperCase()}`;
    
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30); // 30 gün geçerli

    const coupon = new Coupon({
      code,
      description: "Arkadaşını getirdiğin için teşekkür kuponu! %10 indirim",
      discountType: "percentage",
      discountPercentage: 10,
      minimumOrderAmount: 100,
      usageLimit: 1,
      userUsageLimit: 1,
      expirationDate,
      userId: userId, // Bu kullanıcıya özel
      isReferralCoupon: false
    });

    await coupon.save();

    return coupon;
  } catch (error) {
    console.error("Referral ödül kuponu oluşturulurken hata:", error);
    return null;
  }
};
