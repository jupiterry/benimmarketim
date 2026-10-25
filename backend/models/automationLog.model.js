import mongoose from "mongoose";

// Otomatik bildirim kayıtları. Her gönderim, bildirim gitmeden ÖNCE "pending" olarak yazılır;
// (type, user, refKey) benzersiz indeksi aynı bildirimin iki kez gönderilmesini veritabanı düzeyinde
// engeller (aynı anda çalışan iki süreç olsa bile yalnızca biri kaydı oluşturabilir).
// refKey: secondOrder → "lifetime", winBack → "<sonSiparişId>:<n>", couponExpiry → "coupon:<kuponId>",
//         closedCart → "open:<açılış zamanı ISO>".
// Atıf: gönderimden sonraki 72 saat içinde verilen sipariş "dönüşüm" sayılır (istatistikte hesaplanır).

export const AUTOMATION_LOG_TYPES = ["secondOrder", "winBack", "couponExpiry", "closedCart"];

const automationLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: AUTOMATION_LOG_TYPES, required: true },
    refKey: { type: String, required: true, maxlength: 120 },
    // pending: gönderiliyor · sent: en az bir cihaza gitti · failed: müşteriye ulaşmadı (cihaz yok / izin kapalı)
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
    sentAt: { type: Date, default: Date.now },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
    couponCode: { type: String, default: null },
    title: { type: String, default: "", maxlength: 120 },
    body: { type: String, default: "", maxlength: 300 },
    pushResult: {
      sent: { type: Boolean, default: false },
      reason: { type: String, default: null },
      targeted: { type: Number, default: 0 },
    },
  },
  { timestamps: false },
);

automationLogSchema.index({ type: 1, user: 1, refKey: 1 }, { unique: true });
// Kişi başı sıklık sınırı ve dönüşüm hesabı
automationLogSchema.index({ user: 1, sentAt: -1 });
// İstatistik
automationLogSchema.index({ type: 1, sentAt: -1 });

const AutomationLog = mongoose.model("AutomationLog", automationLogSchema);

export default AutomationLog;
