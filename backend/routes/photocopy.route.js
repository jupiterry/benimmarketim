import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  uploadMiddleware,
  uploadFile,
  getMyFiles,
  downloadFile,
  deleteFile,
  getAllFiles,
  getStats,
  updateFileStatus,
  adminDeleteFile
} from "../controllers/photocopy.controller.js";

const router = express.Router();

// Admin routes (daha spesifik route'lar önce gelmeli)
router.get("/admin/all", protectRoute, adminRoute, getAllFiles);
router.get("/admin/stats", protectRoute, adminRoute, getStats);
router.put("/admin/:fileId", protectRoute, adminRoute, updateFileStatus);
router.delete("/admin/:fileId", protectRoute, adminRoute, adminDeleteFile);

// User routes
router.post("/upload", protectRoute, uploadMiddleware, uploadFile);
router.get("/my-files", protectRoute, getMyFiles);
router.get("/download/:fileId", protectRoute, downloadFile);
router.delete("/:fileId", protectRoute, deleteFile);

export default router;
