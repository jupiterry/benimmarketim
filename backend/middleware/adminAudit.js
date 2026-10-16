import AdminAudit from "../models/adminAudit.model.js";
import { describeRequest } from "../services/adminAudit.service.js";

// Rota bazlı kısa kayıt. Denetleyici ayrıntılı kayıt yazdıysa (req.auditRecorded) tekrar yazmaz.
export const auditAdminAction = (action, target, category) => (req, res, next) => {
  res.on("finish", () => {
    if (req.auditRecorded) return;
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user?._id) {
      req.auditRecorded = true;
      const path = req.originalUrl.split("?")[0];
      AdminAudit.create({ actor: req.user._id, action, category: category || describeRequest(req.method, path)?.category || "other", target: typeof target === "function" ? target(req) : target, summary: `${req.method} ${req.originalUrl.split("?")[0]}` }).catch(error => console.error("Admin audit write failed:", error));
    }
  });
  next();
};
