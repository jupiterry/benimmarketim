import mongoose from "mongoose";

// Sipariş görevleri: "X TL üzeri N sipariş ver, Y TL kupon kazan". Tüm değerler yönetici panelinden ayarlanır.
const missionSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 60 },
  description: { type: String, default: "", maxlength: 160 },
  targetOrders: { type: Number, required: true, min: 1, max: 50 },
  minOrderAmount: { type: Number, default: 0, min: 0 },
  rewardAmount: { type: Number, required: true, min: 1 },
  rewardMinimumOrderAmount: { type: Number, default: 0, min: 0 },
  rewardValidityDays: { type: Number, default: 14, min: 1, max: 365 },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  completions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    couponCode: { type: String, required: true },
    completedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

missionSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

export default mongoose.model("Mission", missionSchema);
