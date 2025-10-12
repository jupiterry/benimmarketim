import Photocopy from "../models/photocopy.model.js";
import User from "../models/user.model.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/photocopy";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Dosya filtresi
const fileFilter = (req, file, cb) => {
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
    cb(new Error('Desteklenmeyen dosya türü. Lütfen PDF, resim, Word, Excel, PowerPoint veya metin dosyası yükleyin.'), false);
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Dosya yükleme
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "Dosya yüklenmedi" 
      });
    }

    const { copies, color, paperSize, notes } = req.body;
    const userId = req.user._id;

    // Dosya bilgilerini kaydet
    const photocopy = new Photocopy({
      user: userId,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      copies: parseInt(copies) || 1,
      color: color || "black_white",
      paperSize: paperSize || "A4",
      notes: notes || ""
    });

    await photocopy.save();

    // Kullanıcı bilgilerini populate et
    await photocopy.populate('user', 'name email phone');

    res.status(201).json({
      success: true,
      message: "Dosya başarıyla yüklendi",
      data: photocopy
    });

  } catch (error) {
    console.error("Dosya yükleme hatası:", error);
    
    // Hata durumunda yüklenen dosyayı sil
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message || "Dosya yüklenirken hata oluştu"
    });
  }
};

// Kullanıcının dosyalarını getir
export const getUserFiles = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const files = await Photocopy.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Photocopy.countDocuments(query);

    res.json({
      success: true,
      data: files,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total: total
      }
    });

  } catch (error) {
    console.error("Dosyalar getirilirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Dosyalar getirilirken hata oluştu"
    });
  }
};

// Admin - Tüm dosyaları getir
export const getAllFiles = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, user, dateFrom, dateTo } = req.query;

    const query = {};
    
    if (status) query.status = status;
    if (user) query.user = user;
    
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const files = await Photocopy.find(query)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Photocopy.countDocuments(query);

    res.json({
      success: true,
      data: files,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total: total
      }
    });

  } catch (error) {
    console.error("Admin dosyalar getirilirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Dosyalar getirilirken hata oluştu"
    });
  }
};

// Dosya indirme
export const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;

    const file = await Photocopy.findById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Dosya bulunamadı"
      });
    }

    // Kullanıcı kendi dosyasını indiriyor mu veya admin mi kontrol et
    if (file.user.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Bu dosyayı indirme yetkiniz yok"
      });
    }

    // Dosya var mı kontrol et
    if (!fs.existsSync(file.filePath)) {
      return res.status(404).json({
        success: false,
        message: "Dosya bulunamadı"
      });
    }

    // İndirme sayısını artır
    file.downloadCount += 1;
    file.lastDownloaded = new Date();
    await file.save();

    // Dosyayı indir
    res.download(file.filePath, file.originalName);

  } catch (error) {
    console.error("Dosya indirme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Dosya indirilirken hata oluştu"
    });
  }
};

// Dosya durumunu güncelle (Admin)
export const updateFileStatus = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { status, adminNotes, price, isPaid } = req.body;

    const file = await Photocopy.findById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Dosya bulunamadı"
      });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (price !== undefined) updateData.price = price;
    if (isPaid !== undefined) updateData.isPaid = isPaid;

    const updatedFile = await Photocopy.findByIdAndUpdate(
      fileId,
      updateData,
      { new: true }
    ).populate('user', 'name email phone');

    res.json({
      success: true,
      message: "Dosya durumu güncellendi",
      data: updatedFile
    });

  } catch (error) {
    console.error("Dosya durumu güncellenirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Dosya durumu güncellenirken hata oluştu"
    });
  }
};

// Dosya silme
export const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;

    const file = await Photocopy.findById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Dosya bulunamadı"
      });
    }

    // Kullanıcı kendi dosyasını siliyor mu veya admin mi kontrol et
    if (file.user.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Bu dosyayı silme yetkiniz yok"
      });
    }

    // Fiziksel dosyayı sil
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }

    // Veritabanından sil
    await Photocopy.findByIdAndDelete(fileId);

    res.json({
      success: true,
      message: "Dosya başarıyla silindi"
    });

  } catch (error) {
    console.error("Dosya silme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Dosya silinirken hata oluştu"
    });
  }
};

// İstatistikler
export const getStats = async (req, res) => {
  try {
    const totalFiles = await Photocopy.countDocuments();
    const pendingFiles = await Photocopy.countDocuments({ status: 'pending' });
    const completedFiles = await Photocopy.countDocuments({ status: 'completed' });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayFiles = await Photocopy.countDocuments({
      createdAt: { $gte: today }
    });

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const weekFiles = await Photocopy.countDocuments({
      createdAt: { $gte: thisWeek }
    });

    res.json({
      success: true,
      data: {
        totalFiles,
        pendingFiles,
        completedFiles,
        todayFiles,
        weekFiles
      }
    });

  } catch (error) {
    console.error("İstatistikler getirilirken hata:", error);
    res.status(500).json({
      success: false,
      message: "İstatistikler getirilirken hata oluştu"
    });
  }
};
