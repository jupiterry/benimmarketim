import mongoose from "mongoose";

// Sitedeki iletişim formundan ve KVKK başvuru formundan gelen kayıtlar
const siteMessageSchema = new mongoose.Schema({
  kind: { type: String, enum: ["contact", "kvkk"], required: true, index: true },
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, maxlength: 120 },
  phone: { type: String, default: "", maxlength: 20 },
  topic: { type: String, required: true, maxlength: 40 },
  message: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: ["new", "in_progress", "done"], default: "new", index: true },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  handledAt: { type: Date, default: null },
}, { timestamps: true });

siteMessageSchema.index({ createdAt: -1 });

export default mongoose.model("SiteMessage", siteMessageSchema);
