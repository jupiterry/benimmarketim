import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { giveCouponsToCustomers, previewCustomerActions, pushToCustomers } from "../controllers/customerActions.controller.js";

// Müşteri eylemleri (yalnızca yönetici): seçili müşterilere ya da süzgece uyanlara kişiye özel kupon ve bildirim.
// Önizleme yalnızca okur; POST olmasının nedeni hedefin 1000'e kadar müşteri kimliği taşıyabilmesidir.
const router = express.Router();
router.use(protectRoute, adminRoute);

router.post("/preview", previewCustomerActions);
router.post("/push", pushToCustomers);
router.post("/coupons", giveCouponsToCustomers);

export default router;
