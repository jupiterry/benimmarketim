// backend/routes/userRoutes.js
import express from "express";
import { getAllUsers, getUserStats, searchUsers, updateUser, deleteUser, resetUserPassword } from "../controllers/userController.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { getUserInfo, getBestCustomers, deleteAccount, getCustomerProfile, updateUserRole } from "../controllers/user.controller.js";
import { updateLastActive } from "../middleware/updateLastActive.js";
import { auditAdminAction } from "../middleware/adminAudit.js";

const router = express.Router();

// Yalnızca adminlerin erişebileceği endpoint'ler
// Not: sabit yollar (/stats, /search, /best-customers) "/:id" yolundan ÖNCE tanımlanmalı.
router.get("/", protectRoute, adminRoute, getAllUsers); // Sayfalı, aranabilir müşteri listesi (hafif alanlar)
router.get("/stats", protectRoute, adminRoute, getUserStats); // Müşteriler ekranı KPI / süzgeç sayıları / grafik
router.get("/search", protectRoute, adminRoute, searchUsers); // Seçiciler ve komut paleti için hızlı arama
router.get("/best-customers", protectRoute, adminRoute, getBestCustomers); // En iyi müşteriler
router.put("/:userId", protectRoute, adminRoute, auditAdminAction("Müşteri değişikliği", req => req.params.userId), updateUser); // Kullanıcıyı güncelle
router.delete("/:userId", protectRoute, adminRoute, deleteUser);
router.post("/:userId/reset-password", protectRoute, adminRoute, resetUserPassword); // Şifre sıfırlama
router.get("/:id/profile", protectRoute, adminRoute, getCustomerProfile); // Müşteri profili (sipariş özeti, kupon, davet, cihaz, bildirim)
router.patch("/:userId/role", protectRoute, adminRoute, updateUserRole); // Rol değiştir (işlem kaydı yazar)

// Kullanıcı bilgilerini getir
router.get("/:id", protectRoute, updateLastActive, getUserInfo);

// Hesap silme (kullanıcı kendi hesabını silebilir)
router.post("/delete-account", protectRoute, deleteAccount);

export default router;
