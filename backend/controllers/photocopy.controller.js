import Photocopy from "../models/photocopy.model.js";
import User from "../models/user.model.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/photocopy');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya türü'), false);
    }
  }
});

// Upload middleware
export const uploadMiddleware = upload.single('file');

// Upload file
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Dosya yüklenmedi"
      });
    }

    const { copies, color, paperSize, notes } = req.body;
    const userId = req.user.id;

    // Create photocopy record
    const photocopy = new Photocopy({
      user: userId,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      copies: parseInt(copies) || 1,
      color: color || 'black_white',
      paperSize: paperSize || 'A4',
      notes: notes || ''
    });

    await photocopy.save();

    res.status(201).json({
      success: true,
      message: "Dosya başarıyla yüklendi",
      data: photocopy
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: "Dosya yüklenirken hata oluştu",
      error: error.message
    });
  }
};

// Get user's files
export const getMyFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const files = await Photocopy.find({ user: userId })
      .sort({ uploadedAt: -1 })
      .populate('user', 'name email');

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    console.error("Get files error:", error);
    res.status(500).json({
      success: false,
      message: "Dosyalar getirilirken hata oluştu",
      error: error.message
    });
  }
};

// Download file
export const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const photocopy = await Photocopy.findOne({ 
      _id: fileId, 
      user: userId 
    });

    if (!photocopy) {
      return res.status(404).json({
        success: false,
        message: "Dosya bulunamadı"
      });
    }

    const filePath = photocopy.filePath;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Dosya dosya sisteminde bulunamadı"
      });
    }

    res.download(filePath, photocopy.originalName);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({
      success: false,
      message: "Dosya indirilirken hata oluştu",
      error: error.message
    });
  }
};

// Delete file
export const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const photocopy = await Photocopy.findOne({ 
      _id: fileId, 
      user: userId 
    });

    if (!photocopy) {
      return res.status(404).json({
        success: false,
        message: "Dosya bulunamadı"
      });
    }

    // Delete file from filesystem
    if (fs.existsSync(photocopy.filePath)) {
      fs.unlinkSync(photocopy.filePath);
    }

    // Delete from database
    await Photocopy.findByIdAndDelete(fileId);

    res.json({
      success: true,
      message: "Dosya başarıyla silindi"
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({
      success: false,
      message: "Dosya silinirken hata oluştu",
      error: error.message
    });
  }
};

// Admin: Get all files
export const getAllFiles = async (req, res) => {
  try {
    const { status, user, dateFrom, dateTo } = req.query;
    
    let query = {};
    
    if (status) query.status = status;
    if (user) query.user = user;
    if (dateFrom || dateTo) {
      query.uploadedAt = {};
      if (dateFrom) query.uploadedAt.$gte = new Date(dateFrom);
      if (dateTo) query.uploadedAt.$lte = new Date(dateTo);
    }

    const files = await Photocopy.find(query)
      .populate('user', 'name email phone')
      .sort({ uploadedAt: -1 });

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    console.error("Get all files error:", error);
    res.status(500).json({
      success: false,
      message: "Dosyalar getirilirken hata oluştu",
      error: error.message
    });
  }
};

// Admin: Get stats
export const getStats = async (req, res) => {
  try {
    const totalFiles = await Photocopy.countDocuments();
    const pendingFiles = await Photocopy.countDocuments({ status: 'pending' });
    const processingFiles = await Photocopy.countDocuments({ status: 'processing' });
    const readyFiles = await Photocopy.countDocuments({ status: 'ready' });
    const completedFiles = await Photocopy.countDocuments({ status: 'completed' });
    
    const totalRevenue = await Photocopy.aggregate([
      { $match: { isPaid: true } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);

    const stats = {
      totalFiles,
      pendingFiles,
      processingFiles,
      readyFiles,
      completedFiles,
      totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({
      success: false,
      message: "İstatistikler getirilirken hata oluştu",
      error: error.message
    });
  }
};

// Admin: Update file status
export const updateFileStatus = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { status, adminNotes, price, isPaid } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (price !== undefined) updateData.price = price;
    if (isPaid !== undefined) updateData.isPaid = isPaid;

    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    const photocopy = await Photocopy.findByIdAndUpdate(
      fileId,
      updateData,
      { new: true }
    ).populate('user', 'name email phone');

    if (!photocopy) {
      return res.status(404).json({
        success: false,
        message: "Dosya bulunamadı"
      });
    }

    res.json({
      success: true,
      message: "Dosya durumu güncellendi",
      data: photocopy
    });
  } catch (error) {
    console.error("Update file status error:", error);
    res.status(500).json({
      success: false,
      message: "Dosya durumu güncellenirken hata oluştu",
      error: error.message
    });
  }
};
