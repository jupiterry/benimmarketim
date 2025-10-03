// backend/routes/userRoutes.js
import express from "express";
import { getAllUsers, updateUser, addPhoneFieldToAllUsers, deleteUser, resetUserPassword } from "../controllers/userController.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js"; // Yeni middleware'leri import et
import { getUserInfo, getBestCustomers } from "../controllers/user.controller.js";
import { updateLastActive } from "../middleware/updateLastActive.js";

const router = express.Router();

// Yalnızca adminlerin erişebileceği endpoint'ler
router.get("/", protectRoute, adminRoute, getAllUsers); // Tüm kullanıcıları getir
router.get("/best-customers", protectRoute, adminRoute, getBestCustomers); // En iyi müşteriler
router.put("/:userId", protectRoute, adminRoute, updateUser); // Kullanıcıyı güncelle
router.delete("/:userId", protectRoute, adminRoute, deleteUser);
router.post("/:userId/reset-password", protectRoute, adminRoute, resetUserPassword); // Şifre sıfırlama

// Kullanıcı bilgilerini getir
router.get("/:id", protectRoute, updateLastActive, getUserInfo);

// Herkesin erişebileceği endpoint
router.post("/add-phone-field", addPhoneFieldToAllUsers);

export default router;