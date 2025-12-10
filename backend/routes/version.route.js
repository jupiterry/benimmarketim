import express from "express";
import { checkVersion } from "../controllers/version.controller.js";

const router = express.Router();

/**
 * Version Check Endpoint
 * GET /api/version-check
 * 
 * Query Parameters (opsiyonel):
 * - platform: 'android' veya 'ios' (varsayılan: 'android')
 * 
 * Örnek kullanım:
 * GET /api/version-check
 * GET /api/version-check?platform=android
 * GET /api/version-check?platform=ios
 */
router.get("/version-check", checkVersion);

export default router;

