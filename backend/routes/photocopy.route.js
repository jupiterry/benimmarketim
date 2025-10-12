import express from "express";
import {
  uploadFile,
  getUserFiles,
  getAllFiles,
  downloadFile,
  updateFileStatus,
  deleteFile,
  getStats,
  upload
} from "../controllers/photocopy.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Kullanıcı dosya yükleme
router.post("/upload", protectRoute, upload.single('file'), uploadFile);

// Kullanıcının kendi dosyalarını getir
router.get("/my-files", protectRoute, getUserFiles);

// Dosya indirme
router.get("/download/:fileId", protectRoute, downloadFile);

// Dosya silme
router.delete("/:fileId", protectRoute, deleteFile);

// Admin rotaları
router.get("/admin/all", protectRoute, adminRoute, getAllFiles);
router.get("/admin/stats", protectRoute, adminRoute, getStats);
router.put("/admin/:fileId", protectRoute, adminRoute, updateFileStatus);

export default router;
