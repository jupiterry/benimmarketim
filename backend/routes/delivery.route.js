import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { deliveryQuoteRateLimit } from "../middleware/rateLimit.js";
import {
  getPublicZones,
  getMyDeliveryAccess,
  quoteDelivery,
  adminListZones,
  adminCreateZone,
  adminUpdateZone,
  adminDeleteZone,
  adminBulkUpdateZones,
  adminGetDeliverySettings,
  adminUpdateDeliverySettings,
  adminGetCouriers,
  adminUpdateCouriers,
} from "../controllers/delivery.controller.js";

// Mount: /api/delivery
const router = express.Router();

// Müşteri / herkese açık
router.get("/zones", getPublicZones);
router.get("/me", protectRoute, getMyDeliveryAccess);
router.post("/quote", protectRoute, deliveryQuoteRateLimit, quoteDelivery);

// Yönetici ("/admin/zones/bulk" yolu "/admin/zones/:id" ile karışmasın diye önce tanımlanır)
router.get("/admin/zones", protectRoute, adminRoute, adminListZones);
router.post("/admin/zones", protectRoute, adminRoute, adminCreateZone);
router.patch("/admin/zones/bulk", protectRoute, adminRoute, adminBulkUpdateZones);
router.put("/admin/zones/:id", protectRoute, adminRoute, adminUpdateZone);
router.delete("/admin/zones/:id", protectRoute, adminRoute, adminDeleteZone);
router.get("/admin/settings", protectRoute, adminRoute, adminGetDeliverySettings);
router.put("/admin/settings", protectRoute, adminRoute, adminUpdateDeliverySettings);
router.get("/admin/couriers", protectRoute, adminRoute, adminGetCouriers);
router.put("/admin/couriers", protectRoute, adminRoute, adminUpdateCouriers);

export default router;
