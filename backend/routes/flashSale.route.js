import express from "express";
import {
  getAllFlashSales,
  getActiveFlashSales,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
} from "../controllers/flashSale.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes
router.get("/active", getActiveFlashSales);

// Admin routes
router.get("/", protectRoute, adminRoute, getAllFlashSales);
router.post("/", protectRoute, adminRoute, createFlashSale);
router.put("/:id", protectRoute, adminRoute, updateFlashSale);
router.delete("/:id", protectRoute, adminRoute, deleteFlashSale);

export default router;

