import express from "express";
import { getAdminOrders, getOrderDetails } from "../controllers/payment.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";  // Kullanıcı doğrulama

const router = express.Router();

// Sipariş oluşturma: POST /api/cart/place-order (cart.route.js). Buradaki eski create-order kaldırıldı.
// Siparişleri admin olarak almak için
router.get('/orders', protectRoute, adminRoute, getAdminOrders);
// Kullanıcı veya admin sipariş detayı
router.get("/:orderId", protectRoute, getOrderDetails);


export default router;
