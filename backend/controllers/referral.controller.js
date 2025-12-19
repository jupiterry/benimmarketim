import Referral from "../models/referral.model.js";
import User from "../models/user.model.js";
import Coupon from "../models/coupon.model.js";
import crypto from "crypto";

// Kullanıcının referral bilgilerini getir
export const getReferralInfo = async (req, res) => {
  try {
    const userId = req.user._id;
    
    let referral = await Referral.findOne({ referrer: userId })
      .populate("referredUsers.user", "name email createdAt");
    
    // Eğer referral yoksa oluştur
    if (!referral) {
      referral = new Referral({
        referrer: userId,
        referralCode: generateReferralCode()
      });
      await referral.save();
    }

    // Referral link oluştur
    const referralLink = `${process.env.CLIENT_URL || 'https://devrekbenimmarketim.com'}/signup?ref=${referral.referralCode}`;

    res.json({
      success: true,
      referral: {
        code: referral.referralCode,
        link: referralLink,
        totalReferrals: referral.totalReferrals,
        successfulReferrals: referral.successfulReferrals,
        totalRewardsEarned: referral.totalRewardsEarned,
        referredUsers: referral.referredUsers.map(r => ({
          name: r.user?.name,
          status: r.status,
          signedUpAt: r.signedUpAt,
          firstOrderAt: r.firstOrderAt
        }))
      }
    });
  } catch (error) {
    console.error("Referral bilgileri getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Referral kodu ile kayıt kontrolü
export const checkReferralCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({ success: false, message: "Referral kodu gerekli" });
    }

    const referral = await Referral.findOne({ 
      referralCode: code.toUpperCase().trim(),
      isActive: true 
    }).populate("referrer", "name");

    if (!referral) {
      return res.status(404).json({ success: false, message: "Geçersiz referral kodu" });
    }

    res.json({
      success: true,
      referrerName: referral.referrer.name,
      message: `${referral.referrer.name} sizi davet etti! İlk siparişinizde %15 indirim kazanın.`
    });
  } catch (error) {
    console.error("Referral kodu kontrol edilirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Referral ile kullanıcı kaydı (signup sırasında çağrılır)
export const processReferralSignup = async (referralCode, newUserId) => {
  try {
    if (!referralCode) return { success: false };

    const referral = await Referral.findOne({ 
      referralCode: referralCode.toUpperCase().trim(),
      isActive: true 
    });

    if (!referral) return { success: false, message: "Geçersiz referral kodu" };

    // Kendini referans edemez
    if (referral.referrer.toString() === newUserId.toString()) {
      return { success: false, message: "Kendinizi referans olarak ekleyemezsiniz" };
    }

    // Zaten referans edilmiş mi kontrol et
    const alreadyReferred = referral.referredUsers.some(
      r => r.user.toString() === newUserId.toString()
    );
    if (alreadyReferred) {
      return { success: false, message: "Bu kullanıcı zaten referans edilmiş" };
    }

    // Yeni kullanıcıyı ekle
    referral.referredUsers.push({
      user: newUserId,
      status: "pending",
      signedUpAt: new Date()
    });
    referral.totalReferrals += 1;
    await referral.save();

    // Yeni kullanıcıya indirim kuponu oluştur (%15 ilk sipariş)
    const couponCode = `HOSGELDIN${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // 7 gün geçerli

    const coupon = new Coupon({
      code: couponCode,
      description: "Hoş geldin! İlk siparişinde %15 indirim",
      discountType: "percentage",
      discountPercentage: 15,
      minimumOrderAmount: 50,
      maximumDiscount: 100,
      usageLimit: 1,
      userUsageLimit: 1,
      expirationDate,
      userId: newUserId,
      firstOrderOnly: true,
      isReferralCoupon: true,
      referredBy: referral.referrer
    });
    await coupon.save();

    return { 
      success: true, 
      couponCode,
      message: "Referral kaydı başarılı! İlk siparişinizde kullanabileceğiniz kupon kodu oluşturuldu."
    };
  } catch (error) {
    console.error("Referral signup işlenirken hata:", error);
    return { success: false, message: "Sunucu hatası" };
  }
};

// Referral kullanıcısının ilk siparişi (order oluşturulduğunda çağrılır)
export const processReferralFirstOrder = async (userId) => {
  try {
    // Bu kullanıcıyı referans eden birisi var mı bul
    const referral = await Referral.findOne({
      "referredUsers.user": userId,
      "referredUsers.status": "pending"
    });

    if (!referral) return { success: false };

    // Referans durumunu güncelle
    const referredUser = referral.referredUsers.find(
      r => r.user.toString() === userId.toString() && r.status === "pending"
    );

    if (referredUser) {
      referredUser.status = "completed";
      referredUser.firstOrderAt = new Date();
      referral.successfulReferrals += 1;
      await referral.save();

      // Referans veren kişiye ödül kuponu oluştur
      const rewardCode = `TESEKKUR${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30); // 30 gün geçerli

      const rewardCoupon = new Coupon({
        code: rewardCode,
        description: "Arkadaşını getirdiğin için teşekkürler! %10 indirim",
        discountType: "percentage",
        discountPercentage: 10,
        minimumOrderAmount: 100,
        maximumDiscount: 50,
        usageLimit: 1,
        userUsageLimit: 1,
        expirationDate,
        userId: referral.referrer
      });
      await rewardCoupon.save();

      // İstatistikleri güncelle
      referral.totalRewardsEarned += 1;
      
      // Referans durumunu rewarded yap
      referredUser.status = "rewarded";
      referredUser.rewardGivenAt = new Date();
      await referral.save();

      return { 
        success: true, 
        referrerId: referral.referrer,
        rewardCouponCode: rewardCode
      };
    }

    return { success: false };
  } catch (error) {
    console.error("Referral first order işlenirken hata:", error);
    return { success: false, message: "Sunucu hatası" };
  }
};

// Referral kodunu yenile
export const regenerateReferralCode = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const referral = await Referral.findOne({ referrer: userId });
    
    if (!referral) {
      return res.status(404).json({ success: false, message: "Referral bulunamadı" });
    }

    referral.referralCode = generateReferralCode();
    await referral.save();

    const referralLink = `${process.env.CLIENT_URL || 'https://devrekbenimmarketim.com'}/signup?ref=${referral.referralCode}`;

    res.json({
      success: true,
      message: "Referral kodu yenilendi",
      code: referral.referralCode,
      link: referralLink
    });
  } catch (error) {
    console.error("Referral kodu yenilenirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Admin: Tüm referral istatistiklerini getir
export const getAllReferralStats = async (req, res) => {
  try {
    const referrals = await Referral.find()
      .populate("referrer", "name email")
      .populate("referredUsers.user", "name email")
      .sort({ successfulReferrals: -1 });

    const stats = {
      totalReferrals: referrals.reduce((sum, r) => sum + r.totalReferrals, 0),
      totalSuccessful: referrals.reduce((sum, r) => sum + r.successfulReferrals, 0),
      topReferrers: referrals.slice(0, 10).map(r => ({
        user: r.referrer,
        code: r.referralCode,
        totalReferrals: r.totalReferrals,
        successfulReferrals: r.successfulReferrals,
        totalRewardsEarned: r.totalRewardsEarned
      }))
    };

    res.json({ success: true, stats, referrals });
  } catch (error) {
    console.error("Referral istatistikleri getirilirken hata:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
};

// Helper: Referral kodu oluştur
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REF';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
