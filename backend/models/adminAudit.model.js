import mongoose from "mongoose";

const adminAuditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  target: { type: String, required: true },
  summary: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("AdminAudit", adminAuditSchema);
