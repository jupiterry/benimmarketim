import express from "express";
import multer from "multer";
import path from "path";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
	uploadFile,
	getMyFiles,
	downloadFile,
	deleteFile,
	adminListAll,
	adminStats,
	adminUpdate,
} from "../controllers/photocopy.controller.js";

const router = express.Router();

// Multer storage
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, path.join(process.cwd(), "uploads", "photocopy"));
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(null, uniqueSuffix + "-" + file.originalname);
	},
});

const upload = multer({ storage });

// Kullanıcı
router.post("/upload", protectRoute, upload.single("file"), uploadFile);
router.get("/my-files", protectRoute, getMyFiles);
router.get("/download/:id", protectRoute, downloadFile);
router.delete("/:id", protectRoute, deleteFile);

// Admin
router.get("/admin/all", protectRoute, adminRoute, adminListAll);
router.get("/admin/stats", protectRoute, adminRoute, adminStats);
router.put("/admin/:id", protectRoute, adminRoute, adminUpdate);

export default router;


