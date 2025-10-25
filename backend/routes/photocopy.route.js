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
  updateFileStatus
} from "../controllers/photocopy.controller.js";

const router = express.Router();

// User routes
router.post("/upload", protectRoute, uploadMiddleware, uploadFile);
router.get("/my-files", protectRoute, getMyFiles);
router.get("/download/:fileId", protectRoute, downloadFile);
router.delete("/:fileId", protectRoute, deleteFile);

// Admin routes
router.get("/admin/all", protectRoute, adminRoute, getAllFiles);
router.get("/admin/stats", protectRoute, adminRoute, getStats);
router.put("/admin/:fileId", protectRoute, adminRoute, updateFileStatus);

export default router;
