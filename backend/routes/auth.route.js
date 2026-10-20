import express from "express";
import { login, logout, signup, refreshToken, getProfile, testApi, testAuth, deleteMyAccount, updatePhone, updateProfilePhoto, deleteProfilePhoto } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { updateLastActive } from "../middleware/updateLastActive.js";
import { loginRateLimiter } from "../middleware/loginRateLimit.js";

const router = express.Router();

// Test endpoint'leri
router.get("/test", testApi);
router.get("/test-auth", protectRoute, testAuth);

// Auth endpoint'leri
router.post("/signup", signup);
router.post("/login", loginRateLimiter, login);
router.post("/logout", logout);
router.post("/refresh-token", refreshToken);
router.get("/profile", protectRoute, updateLastActive, getProfile);
router.delete("/delete-account", protectRoute, deleteMyAccount);

// Profil: telefon ve profil fotoğrafı
router.put("/update-phone", protectRoute, updatePhone);
router.put("/profile-photo", protectRoute, updateProfilePhoto);
router.delete("/profile-photo", protectRoute, deleteProfilePhoto);

export default router;
