// CSV ile toplu ürün yükleme (POST /api/products/bulk-upload). Dosya satır satır doğrulanır,
// geçerli satırlar eklenir; atlanan ve kopya satırlar satır numarasıyla döner.
import multer from "multer";
import Product from "../models/product.model.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { emitProductsChanged } from "../services/productAdmin.service.js";
import { CSV_MAX_BYTES, validateProductCsv } from "../services/productCsv.service.js";

const CSV_MAX_MB = Math.round(CSV_MAX_BYTES / (1024 * 1024));

// Yalnızca .csv, en fazla 5 MB; dosya diske yazılmaz (bellekte okunur)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isCsv = /\.csv$/i.test(file.originalname || "") ||
      ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"].includes(file.mimetype);
    if (!isCsv) return cb(new Error("Yalnızca CSV dosyası yüklenebilir"));
    cb(null, true);
  },
});

export const handleCsvUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.code === "LIMIT_FILE_SIZE" ? `CSV dosyası en fazla ${CSV_MAX_MB} MB olabilir` : error.message,
      });
    }
    next();
  });
};

export const bulkUploadProducts = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "Lütfen bir CSV dosyası seçin." });
    }

    const existing = await Product.find({}).select("name").lean();
    const result = validateProductCsv(req.file.buffer, existing.map((p) => p.name));
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const now = new Date();
    const docs = result.valid.map(({ doc }) => ({ ...doc, outOfStockSince: doc.isOutOfStock ? now : null }));
    const inserted = docs.length ? await Product.insertMany(docs) : [];

    if (inserted.length) {
      const names = inserted.map((p) => p.name).filter(Boolean);
      recordAdminAction(req, {
        action: "CSV ile toplu ürün yükleme",
        category: "product",
        target: `${inserted.length} ürün`,
        targetName: `${names.slice(0, 5).join(", ")}${names.length > 5 ? ` ve ${names.length - 5} ürün daha` : ""}`,
        changes: [
          { label: "Eklenen", from: "—", to: `${inserted.length} ürün` },
          ...(result.skipped.length ? [{ label: "Atlanan satır", from: "—", to: String(result.skipped.length) }] : []),
          ...(result.duplicates.length ? [{ label: "Kopya satır", from: "—", to: String(result.duplicates.length) }] : []),
        ],
        meta: { file: req.file.originalname, count: inserted.length, skipped: result.skipped.length, duplicates: result.duplicates.length },
      });
      emitProductsChanged(req, inserted.map((p) => p._id), {}, { reload: true });
    }

    const missed = result.skipped.length + result.duplicates.length;
    res.status(200).json({
      success: true,
      created: inserted.length,
      total: result.total,
      skipped: result.skipped,
      duplicates: result.duplicates,
      message: inserted.length
        ? `${inserted.length} ürün eklendi${missed ? ` · ${missed} satır atlandı` : ""}`
        : "Hiç ürün eklenmedi",
    });
  } catch (error) {
    console.error("Ürünler yüklenirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Ürünler kaydedilirken hata oluştu. Ürün listesini yenileyip eklenenleri kontrol edin.",
    });
  }
};
