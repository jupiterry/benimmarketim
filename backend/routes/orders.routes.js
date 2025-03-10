import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { cancelOrder, getUserOrders } from "../controllers/orders.controller.js";

const router = express.Router();

// Kullanıcının siparişlerini getir
router.get("/user-orders", protectRoute, getUserOrders);

// Sipariş iptal etme
router.put("/cancel-order", protectRoute, cancelOrder);

export default router; 