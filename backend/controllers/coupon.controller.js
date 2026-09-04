import Coupon from "../models/coupon.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import { buildOrderProducts } from "../services/order.service.js";
import {
  couponPublicData,
  evaluateCoupon,
} from "../services/coupon.service.js";

const findUserCoupons = async (userId) => {
  const now = new Date();
  return Coupon.find({
    isActive: true,
    expirationDate: { $gt: now },
    $or: [{ userId }, { userId: null }, { userId: { $exists: false } }],
  }).sort({ userId: -1, createdAt: -1 });
};

// NOT: createReferralRewardCoupon bu dosyanın alt kısmında tanımlıdır.
// useCoupon içindeki çağrı aynı modül kapsamında olduğu için çalışır.
// Eğer bu fonksiyon başka bir dosyaya taşınırsa buraya açık import eklenmeli.
// Örnek: import { createReferralRewardCoupon } from "./referral.controller.js";

// Kullanıcının kuponlarını getir (TÜM kullanıcıya ait kuponlar)
export const getCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    
    const coupons = await findUserCoupons(userId);
    const allCoupons = await Promise.all(
      coupons.map(async (coupon) => {
        const usageCount = coupon.usedBy.filter(
          (entry) => entry.user?.toString() === userId.toString()
        ).length;
        return couponPublicData(coupon, {
          isUsed: usageCount >= coupon.userUsageLimit,
          userUsageCount: usageCount,
          remainingUses: Math.max(0, coupon.userUsageLimit - usageCount),
          remainingGlobalUses: coupon.usageLimit === null
            ? null
            : Math.max(0, coupon.usageLimit - coupon.usageCount),
          expiresInSeconds: Math.max(
            0,
            Math.floor((coupon.expirationDate.getTime() - now.getTime()) / 1000)
          ),
        });
      })
    );
    
    res.json({ 
      success: true, 
      coupons: allCoupons,
      // İlk kullanıcı kuponu (eski format için uyumluluk)
      coupon: allCoupons.find((coupon) => coupon.userId) || null
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
      $or: [{ userId: null }, { userId: { $exists: false } }]
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
    const {
      code,
      orderAmount,
      products = [],
      deliveryPoint,
      channel,
    } = req.body;
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

    let orderProducts = [];
    let verifiedAmount = Number(orderAmount || 0);
    if (Array.isArray(products) && products.length > 0) {
      const built = await buildOrderProducts(products);
      orderProducts = built.orderProducts;
      verifiedAmount = built.totalAmount;
    }

    const validation = await evaluateCoupon(coupon, {
      userId,
      totalAmount: verifiedAmount,
      orderProducts,
      deliveryPoint,
      channel,
      deferDeliveryPoint: true,
    });
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    res.json({
      success: true,
      message: "Kupon geçerli",
      coupon: couponPublicData(coupon, validation),
    });
  } catch (error) {
    console.error("Kupon doğrulanırken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

export const recommendCoupons = async (req, res) => {
  try {
    const {
      products = [],
      orderAmount = 0,
      deliveryPoint,
      channel,
    } = req.body;
    const userId = req.user._id;
    let orderProducts = [];
    let verifiedAmount = Number(orderAmount || 0);
    if (Array.isArray(products) && products.length > 0) {
      const built = await buildOrderProducts(products);
      orderProducts = built.orderProducts;
      verifiedAmount = built.totalAmount;
    }

    const coupons = await findUserCoupons(userId);
    const evaluated = await Promise.all(
      coupons.map(async (coupon) => {
        const evaluation = await evaluateCoupon(coupon, {
          userId,
          totalAmount: verifiedAmount,
          orderProducts,
          deliveryPoint,
          channel,
          deferDeliveryPoint: true,
        });
        return couponPublicData(coupon, evaluation);
      })
    );
    const eligible = evaluated
      .filter((coupon) => coupon.valid)
      .sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);

    res.json({
      success: true,
      bestCoupon: eligible[0] || null,
      eligibleCoupons: eligible,
      unavailableCoupons: evaluated.filter((coupon) => !coupon.valid),
    });
  } catch (error) {
    console.error("Kupon önerileri hazırlanırken hata:", error);
    res.status(500).json({
      success: false,
      message: "Kupon önerileri hazırlanamadı",
    });
  }
};

export const getCouponAnalytics = async (req, res) => {
  try {
    const [coupons, usage] = await Promise.all([
      Coupon.find().lean(),
      Order.aggregate([
        { $match: { couponCode: { $ne: null } } },
        {
          $group: {
            _id: "$couponCode",
            orders: { $sum: 1 },
            discount: { $sum: "$couponDiscount" },
            revenue: { $sum: "$totalAmount" },
            grossRevenue: { $sum: "$subtotalAmount" },
            lastUsedAt: { $max: "$createdAt" },
          },
        },
        { $sort: { orders: -1 } },
      ]),
    ]);
    const usageMap = new Map(usage.map((item) => [item._id, item]));
    const campaigns = coupons.map((coupon) => {
      const stats = usageMap.get(coupon.code) || {};
      return {
        code: coupon.code,
        description: coupon.description,
        isActive: coupon.isActive,
        usageCount: stats.orders || coupon.usageCount || 0,
        discount: stats.discount || 0,
        revenue: stats.revenue || 0,
        grossRevenue: stats.grossRevenue || 0,
        lastUsedAt: stats.lastUsedAt || null,
        usageLimit: coupon.usageLimit,
        redemptionRate: coupon.usageLimit
          ? Math.min(100, ((stats.orders || 0) / coupon.usageLimit) * 100)
          : null,
      };
    });
    res.json({
      success: true,
      summary: {
        totalCampaigns: coupons.length,
        activeCampaigns: coupons.filter((coupon) => coupon.isActive).length,
        couponOrders: usage.reduce((sum, item) => sum + item.orders, 0),
        totalDiscount: usage.reduce((sum, item) => sum + item.discount, 0),
        attributedRevenue: usage.reduce((sum, item) => sum + item.revenue, 0),
      },
      campaigns,
    });
  } catch (error) {
    console.error("Kupon analitiği alınırken hata:", error);
    res.status(500).json({ success: false, message: "Analitik alınamadı" });
  }
};

// ─────────────────────────────────────────────────────────────────
// #3 — createReferralRewardCoupon bu dosyada aşağıda (satır ~351)
// tanımlıdır. useCoupon içinden çağrılabilmesi için onu ÖNCE
// bildiriyoruz. Eğer bu fonksiyon başka bir dosyaya taşınırsa
// açık bir import satırı eklenmeli (yukarıdaki yorum satırına bak).
// ─────────────────────────────────────────────────────────────────

// Kuponu kullan (Sipariş tamamlandığında çağrılır)
export const useCoupon = async (couponCode, userId, orderId, orderAmount) => {
  try {
    const normalizedCode = couponCode.toUpperCase().trim();
    const now = new Date();

    // Kullanım limiti için atomik güncelleme: iki sipariş aynı anda gelse bile
    // limit aşılarak usageCount artırılamaz.
    const coupon = await Coupon.findOneAndUpdate(
      {
        code: normalizedCode,
        isActive: true,
        expirationDate: { $gt: now },
        $or: [
          { usageLimit: null },
          { $expr: { $lt: ["$usageCount", "$usageLimit"] } }
        ]
      },
      {
        $inc: { usageCount: 1 },
        $push: {
          usedBy: { user: userId, orderId, usedAt: now }
        }
      },
      { new: true }
    );

    if (!coupon) {
      return {
        success: false,
        message: "Kupon kullanım limiti dolmuş, süresi geçmiş veya kupon artık aktif değil"
      };
    }

    // Kupon kullanım limiti dolduysa sonraki siparişlere kapat.
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      await Coupon.updateOne(
        { _id: coupon._id },
        { $set: { isActive: false } }
      );
    }

    // Referral ödülü kupon kullanımından bağımsız bir yan etkidir; ödül
    // oluşturulamazsa gerçekleşmiş kupon kullanımını geri almış sayma.
    if (coupon.isReferralCoupon && coupon.referredBy) {
      try {
        await createReferralRewardCoupon(coupon.referredBy);
      } catch (referralError) {
        console.error("Referral ödül kuponu oluşturulamadı:", referralError.message);
      }
    }

    const discount = coupon.calculateDiscount(orderAmount);
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
      firstOrderOnly,
      applicableProducts,
      validDays,
      startTime,
      endTime,
      deliveryPoints,
      channels,
      newUserDays
    } = req.body;

    // Validasyon
    if (!code || !expirationDate) {
      return res.status(400).json({ 
        success: false, 
        message: "Kupon kodu ve son kullanma tarihi gerekli" 
      });
    }
    if (new Date(expirationDate) <= new Date()) {
      return res.status(400).json({ success: false, message: "Son kullanma tarihi gelecekte olmalı" });
    }
    if (
      (discountType === "fixed" && Number(discountAmount) <= 0) ||
      ((discountType || "percentage") === "percentage" && Number(discountPercentage) <= 0)
    ) {
      return res.status(400).json({ success: false, message: "İndirim değeri sıfırdan büyük olmalı" });
    }
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return res.status(400).json({ success: false, message: "Başlangıç ve bitiş saatini birlikte seçin" });
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
      userUsageLimit: firstOrderOnly ? 1 : userUsageLimit || 1,
      expirationDate: new Date(expirationDate),
      applicableCategories: applicableCategories || [],
      newUsersOnly: newUsersOnly || false,
      firstOrderOnly: firstOrderOnly || false,
      applicableProducts: applicableProducts || [],
      validDays: validDays || [],
      startTime: startTime || "",
      endTime: endTime || "",
      deliveryPoints: deliveryPoints || [],
      channels: channels || [],
      newUserDays: newUserDays || 30
    });

    await newCoupon.save();

    res.status(201).json({
      success: true,
      message: "Kupon başarıyla oluşturuldu",
      coupon: newCoupon
    });
  } catch (error) {
    console.error("Kupon oluşturulurken hata:", error);
    const validationError = error?.name === "ValidationError" || error?.name === "CastError";
    res.status(validationError ? 400 : 500).json({
      success: false,
      message: validationError ? "Kupon alanlarından biri geçersiz" : "Sunucu hatası",
    });
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
      'expirationDate', 'isActive', 'applicableCategories', 'applicableProducts',
      'validDays', 'startTime', 'endTime', 'deliveryPoints', 'channels',
      'newUsersOnly', 'newUserDays', 'firstOrderOnly'
    ];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        coupon[field] = updateData[field];
      }
    });

    coupon.code = coupon.code.toUpperCase().trim();
    if (coupon.firstOrderOnly) coupon.userUsageLimit = 1;
    if ((coupon.startTime && !coupon.endTime) || (!coupon.startTime && coupon.endTime)) {
      return res.status(400).json({ success: false, message: "Başlangıç ve bitiş saatini birlikte seçin" });
    }

    await coupon.save();

    res.json({
      success: true,
      message: "Kupon güncellendi",
      coupon
    });
  } catch (error) {
    console.error("Kupon güncellenirken hata:", error);
    const validationError = error?.name === "ValidationError" || error?.name === "CastError";
    res.status(validationError ? 400 : 500).json({
      success: false,
      message: validationError ? "Kupon alanlarından biri geçersiz" : "Sunucu hatası",
    });
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
