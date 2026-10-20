import mongoose from "mongoose";

const adminAuditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  target: { type: String, required: true },
  summary: { type: String, default: "" },
  // Ayrıntılı kayıt (eski kayıtlarda boş kalır)
  category: { type: String, default: "other" }, // product | campaign | order | customer | settings | system | other
  targetName: { type: String, default: "" },
  changes: [{ _id: false, label: String, from: String, to: String }],
  meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  createdAt: { type: Date, default: Date.now, index: true },
});
adminAuditSchema.index({ category: 1, createdAt: -1 });
adminAuditSchema.index({ target: 1, createdAt: -1 });

export default mongoose.model("AdminAudit", adminAuditSchema);
