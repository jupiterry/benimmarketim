import mongoose from "mongoose";

const aiRequestLogSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
  provider: { type: String, required: true },
  model: { type: String, required: true },
  responseTimeMs: { type: Number, required: true },
  success: { type: Boolean, required: true, index: true },
  errorCode: { type: String, default: null },
  handoffReason: { type: String, default: null },
}, { timestamps: true });

aiRequestLogSchema.index({ createdAt: -1 });
export default mongoose.model("AiRequestLog", aiRequestLogSchema);
