import express from "express";
import { createOrder, getAdminOrders, getOrderDetails } from "../controllers/payment.controller.js";  // `createOrder` fonksiyonunu import ediyoruz
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";  // Kullanıcı doğrulama

const router = express.Router();

// Sipariş oluşturma endpoint'i
router.post("/create-order", protectRoute, createOrder);
// Siparişleri admin olarak almak için
router.get('/orders', protectRoute, adminRoute, getAdminOrders);
// Kullanıcı veya admin sipariş detayı
router.get("/:orderId", protectRoute, getOrderDetails);


export default router;
