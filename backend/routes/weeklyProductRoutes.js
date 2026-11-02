import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  getWeeklyProducts,
  getAllWeeklyProducts,
  addWeeklyProduct,
  copyWeeklyProducts,
  updateWeeklyProduct,
  removeWeeklyProduct,
  toggleWeeklyProductStatus,
} from "../controllers/weeklyProduct.controller.js";

const router = express.Router();

// Public route - aktif haftalık ürünleri getir
router.get("/", getWeeklyProducts);

// Admin routes
router.get("/all", protectRoute, adminRoute, getAllWeeklyProducts);
router.post("/", protectRoute, adminRoute, addWeeklyProduct);
// Seçilen fırsatları yeni döneme kopyala (planlı ya da hemen yayında); en fazla 100 fırsat
router.post("/copy", protectRoute, adminRoute, copyWeeklyProducts);
router.put("/:id", protectRoute, adminRoute, updateWeeklyProduct);
router.delete("/:id", protectRoute, adminRoute, removeWeeklyProduct);
router.patch("/:id/toggle", protectRoute, adminRoute, toggleWeeklyProductStatus);

export default router;
