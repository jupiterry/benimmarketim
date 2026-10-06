import mongoose from "mongoose";

// Yönetici panelinden gönderilen toplu bildirimlerin kaydı
const pushBroadcastSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 60 },
  body: { type: String, required: true, maxlength: 180 },
  audience: { type: String, required: true },
  route: { type: String, default: "/home" },
  audienceSize: { type: Number, default: 0 },
  targetedCount: { type: Number, default: 0 },
  sent: { type: Boolean, default: false },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

pushBroadcastSchema.index({ createdAt: -1 });

export default mongoose.model("PushBroadcast", pushBroadcastSchema);
