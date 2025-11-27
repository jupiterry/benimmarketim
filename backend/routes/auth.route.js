import express from "express";
import { login, logout, signup, refreshToken, getProfile, testApi, testAuth, deleteMyAccount } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { updateLastActive } from "../middleware/updateLastActive.js";

const router = express.Router();

// Test endpoint'leri
router.get("/test", testApi);
router.get("/test-auth", protectRoute, testAuth);

// Auth endpoint'leri
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh-token", refreshToken);
router.get("/profile", protectRoute, updateLastActive, getProfile);
router.delete("/delete-account", protectRoute, deleteMyAccount);

export default router;
