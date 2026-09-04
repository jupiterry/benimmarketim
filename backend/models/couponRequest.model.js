import mongoose from "mongoose";

const couponRequestSchema = new mongoose.Schema({
  title: { type: String, default: "Topluluk indirimi" },
  description: { type: String, default: "Talep bırakanlara özel fırsat" },
  targetCount: { type: Number, min: 1, default: 30 },
  discountPercentage: { type: Number, min: 1, max: 100, default: 5 },
  minimumOrderAmount: { type: Number, min: 0, default: 0 },
  rewardValidityDays: { type: Number, min: 1, max: 365, default: 14 },
  orderRequirement: {
    type: String,
    enum: ["none", "any", "delivered"],
    default: "delivered",
  },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  rewardIssued: { type: Boolean, default: false },
  rewardIssuedAt: { type: Date, default: null },
  requesters: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, requestedAt: { type: Date, default: Date.now } }],
}, { timestamps: true });

couponRequestSchema.index({ isActive: 1, endsAt: 1 });
export default mongoose.model("CouponRequest", couponRequestSchema);
