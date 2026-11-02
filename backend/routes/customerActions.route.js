import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

// Müşteri eylemleri (yalnızca yönetici): seçili müşterilere ya da süzgece uyanlara kişiye özel kupon ve bildirim.
const router = express.Router();
router.use(protectRoute, adminRoute);

export default router;
