import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

// Kampanya merkezi (yalnızca yönetici): yayındaki ve planlı kampanyalar, flaş indirim ve haftalık fırsat getirisi.
const router = express.Router();
router.use(protectRoute, adminRoute);

export default router;
