import mongoose from "mongoose";

const aiKnowledgeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, trim: true, maxlength: 80, index: true },
  content: { type: String, required: true, trim: true, maxlength: 10000 },
  keywords: [{ type: String, trim: true, lowercase: true, maxlength: 80 }],
  isActive: { type: Boolean, default: true, index: true },
  priority: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true });

aiKnowledgeSchema.index({ title: "text", content: "text", keywords: "text", category: "text" });
aiKnowledgeSchema.index({ isActive: 1, priority: -1, updatedAt: -1 });

export default mongoose.model("AiKnowledge", aiKnowledgeSchema);
