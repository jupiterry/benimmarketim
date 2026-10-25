import express from "express";
import { login, logout, signup, refreshToken, getProfile, deleteMyAccount, updatePhone, updateProfilePhoto, deleteProfilePhoto } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { updateLastActive } from "../middleware/updateLastActive.js";
import { loginRateLimiter } from "../middleware/loginRateLimit.js";
import { authRateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

// Auth endpoint'leri
// IP başına 10 dakikada 300 kayıt/giriş isteği (yurtlarda ortak IP) (girişte ayrıca loginRateLimiter: IP + e-posta kovaları)
router.post("/signup", authRateLimit, signup);
router.post("/login", authRateLimit, loginRateLimiter, login);
router.post("/logout", logout);
router.post("/refresh-token", refreshToken);
router.get("/profile", protectRoute, updateLastActive, getProfile);
router.delete("/delete-account", protectRoute, deleteMyAccount);

// Profil: telefon ve profil fotoğrafı
router.put("/update-phone", protectRoute, updatePhone);
router.put("/profile-photo", protectRoute, updateProfilePhoto);
router.delete("/profile-photo", protectRoute, deleteProfilePhoto);

export default router;
