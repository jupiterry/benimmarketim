import mongoose from "mongoose";
import crypto from "crypto";

const referralSchema = new mongoose.Schema(
  {
    // Referans veren kullanıcı
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    // Referans kodu
    referralCode: {
      type: String,
      unique: true,
      uppercase: true
    },
    // Referans edilen kullanıcılar
    referredUsers: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      status: {
        type: String,
        enum: ["pending", "completed", "rewarded"],
        default: "pending"
      },
      signedUpAt: {
        type: Date,
        default: Date.now
      },
      firstOrderAt: {
        type: Date
      },
      rewardGivenAt: {
        type: Date
      }
    }],
    // İstatistikler
    totalReferrals: {
      type: Number,
      default: 0
    },
    successfulReferrals: {
      type: Number,
      default: 0 // İlk siparişi veren referanslar
    },
    totalRewardsEarned: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Pre-save hook ile referral kodu oluştur
referralSchema.pre("save", async function(next) {
  if (!this.referralCode) {
    // Kullanıcı adından ve rastgele karakterlerden oluştur
    const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
    this.referralCode = `REF${randomPart}`;
  }
  next();
});

// İndeksleme
referralSchema.index({ referrer: 1 });
referralSchema.index({ referralCode: 1 });

const Referral = mongoose.model("Referral", referralSchema);

export default Referral;
