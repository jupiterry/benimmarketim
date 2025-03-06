// backend/routes/userRoutes.js
import express from "express";
import { getAllUsers, updateUser, addPhoneFieldToAllUsers } from "../controllers/userController.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js"; // Yeni middleware'leri import et

const router = express.Router();

// Yalnızca adminlerin erişebileceği endpoint'ler
router.get("/", protectRoute, adminRoute, getAllUsers); // Tüm kullanıcıları getir
router.put("/:userId", protectRoute, adminRoute, updateUser); // Kullanıcıyı güncelle

// Herkesin erişebileceği endpoint
router.post("/add-phone-field", addPhoneFieldToAllUsers);

export default router;