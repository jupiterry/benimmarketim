import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    description: {
      type: String,
      default: ""
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"], // percentage: yüzde, fixed: sabit tutar
      default: "percentage"
    },
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    discountAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    minimumOrderAmount: {
      type: Number,
      default: 0 // Minimum sipariş tutarı
    },
    maximumDiscount: {
      type: Number,
      default: null // Maksimum indirim tutarı (yüzdelik indirimler için)
    },
    usageLimit: {
      type: Number,
      default: null // Toplam kullanım limiti (null = sınırsız)
    },
    usageCount: {
      type: Number,
      default: 0 // Kullanım sayısı
    },
    userUsageLimit: {
      type: Number,
      default: 1 // Her kullanıcı kaç kez kullanabilir
    },
    usedBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      usedAt: {
        type: Date,
        default: Date.now
      },
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order"
      }
    }],
    expirationDate: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    // Belirli kategorilere özel kupon
    applicableCategories: [{
      type: String
    }],
    // Yeni kullanıcılara özel
    newUsersOnly: {
      type: Boolean,
      default: false
    },
    // İlk siparişe özel
    firstOrderOnly: {
      type: Boolean,
      default: false
    },
    // Referral kuponu mu?
    isReferralCoupon: {
      type: Boolean,
      default: false
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    // Eski alan uyumluluğu için userId (artık opsiyonel)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

// İndeksleme
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, expirationDate: 1 });
couponSchema.index({ isReferralCoupon: 1, referredBy: 1 });
// userId sparse index - null değerlere izin verir (genel kuponlar için)
couponSchema.index({ userId: 1 }, { sparse: true });

// Kuponun geçerli olup olmadığını kontrol et
couponSchema.methods.isValid = function(userId, orderAmount) {
  const now = new Date();
  
  // Aktif mi?
  if (!this.isActive) {
    return { valid: false, message: "Bu kupon artık geçerli değil" };
  }
  
  // Tarih kontrolü
  if (now > this.expirationDate) {
    return { valid: false, message: "Bu kuponun süresi dolmuş" };
  }
  
  // Kullanıcıya özel kupon kontrolü
  // Eğer kuponun userId alanı doluysa, sadece o kullanıcı kullanabilir
  if (this.userId && userId) {
    if (this.userId.toString() !== userId.toString()) {
      return { valid: false, message: "Bu kupon size özel değil" };
    }
  }
  
  // Kullanım limiti kontrolü
  if (this.usageLimit !== null && this.usageCount >= this.usageLimit) {
    return { valid: false, message: "Bu kupon kullanım limitine ulaşmış" };
  }
  
  // Minimum sipariş tutarı kontrolü
  if (orderAmount < this.minimumOrderAmount) {
    return { 
      valid: false, 
      message: `Bu kupon için minimum sipariş tutarı ₺${this.minimumOrderAmount}` 
    };
  }
  
  // Kullanıcı kullanım limiti kontrolü
  if (userId) {
    const userUsageCount = this.usedBy.filter(
      u => u.user.toString() === userId.toString()
    ).length;
    
    if (userUsageCount >= this.userUsageLimit) {
      return { valid: false, message: "Bu kuponu daha fazla kullanamazsınız" };
    }
  }
  
  return { valid: true };
};

// İndirim hesapla
couponSchema.methods.calculateDiscount = function(orderAmount) {
  let discount = 0;
  
  if (this.discountType === "percentage") {
    discount = (orderAmount * this.discountPercentage) / 100;
    
    // Maksimum indirim kontrolü
    if (this.maximumDiscount !== null && discount > this.maximumDiscount) {
      discount = this.maximumDiscount;
    }
  } else {
    // Sabit tutar
    discount = this.discountAmount;
  }
  
  // İndirim sipariş tutarından fazla olamaz
  if (discount > orderAmount) {
    discount = orderAmount;
  }
  
  return parseFloat(discount.toFixed(2));
};

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;
