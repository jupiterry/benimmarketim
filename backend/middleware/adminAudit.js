import AdminAudit from "../models/adminAudit.model.js";

export const auditAdminAction = (action, target) => (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user?._id) {
      AdminAudit.create({ actor: req.user._id, action, target: typeof target === "function" ? target(req) : target, summary: `${req.method} ${req.originalUrl.split("?")[0]}` }).catch(error => console.error("Admin audit write failed:", error));
    }
  });
  next();
};
