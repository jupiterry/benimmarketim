import express from "express";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { deleteUsers, exportCsv, getIds, getSummary, getUsers } from "../controllers/accountCleanup.controller.js";

// Pasif hesap temizliği (yalnızca yönetici). Silme yalnızca müşteri hesabını kaldırır; siparişler kalır.
const router = express.Router();

router.get("/summary", protectRoute, adminRoute, getSummary);
router.get("/users", protectRoute, adminRoute, getUsers);
router.get("/ids", protectRoute, adminRoute, getIds);
router.get("/export", protectRoute, adminRoute, exportCsv);
router.post("/delete", protectRoute, adminRoute, deleteUsers);

export default router;
