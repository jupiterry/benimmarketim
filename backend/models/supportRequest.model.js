import mongoose from "mongoose";

const supportRequestSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: ["waiting", "accepted", "in_progress", "closed"], default: "waiting", index: true },
  reason: { type: String, required: true, maxlength: 500 },
  aiSummary: { type: String, required: true, maxlength: 1000 },
  priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal", index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  acceptedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

supportRequestSchema.index({ conversation: 1, status: 1 });
supportRequestSchema.index({ status: 1, priority: -1, createdAt: 1 });

export default mongoose.model("SupportRequest", supportRequestSchema);
