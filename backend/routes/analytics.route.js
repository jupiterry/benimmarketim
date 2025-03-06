import express from "express";
import { getAnalytics } from "../controllers/analytics.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, adminRoute, getAnalytics);

export default router;
