import mongoose from "mongoose";

// Gönderim durumu. Eski kayıtlarda alan yoktur: sent true → "sent", değilse "failed" sayılır (bkz. broadcastStatus).
//   scheduled: ileri bir zamana planlandı · sending: gönderim sürüyor · sent / failed: sonuçlandı ·
//   missed: sunucu kapalıyken zamanı 2 saatten fazla geçti, gönderilmedi · cancelled: yönetici iptal etti
export const BROADCAST_STATUSES = ["scheduled", "sending", "sent", "failed", "missed", "cancelled"];

// Yönetici panelinden gönderilen toplu bildirimlerin kaydı
const pushBroadcastSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 60 },
  body: { type: String, required: true, maxlength: 180 },
  audience: { type: String, required: true },
  // Bölge süzgeci: "" (tümü) | girlsDorm | boysDorm | devrek. Eski kayıtlarda yok (tümü sayılır).
  zone: { type: String, default: "" },
  route: { type: String, default: "/home" },
  audienceSize: { type: Number, default: 0 },
  targetedCount: { type: Number, default: 0 },
  sent: { type: Boolean, default: false },
  // Gönderilemediyse nedeni (auth | rejected | network | no_devices | not_configured | error | no_audience |
  // interrupted: gönderim yarıda kaldı, sonucu bilinmiyor | missed: planlı saat kaçtı)
  failureReason: { type: String, default: null },
  // OneSignal'ın kayıtlı cihazı olmadığını bildirdiği müşteri sayısı
  unreachableCount: { type: Number, default: 0 },
  // Gönderen yönetici; planlı bildirimde planı oluşturan yönetici
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // Deneme gönderiminde (audience "self") bildirimin gittiği hesap; gönderen yöneticiden farklı olabilir
  testRecipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: BROADCAST_STATUSES },
  // Planlı gönderim zamanı (yalnızca planlananlarda); gönderildikten sonra da kalır
  scheduledFor: { type: Date, default: null },
  // Gönderimin başladığı an ("sending"e geçiş); 15 dakikadan uzun süren gönderim yarıda kalmış sayılır
  claimedAt: { type: Date, default: null },
  // Bildirimin gönderildiği an (sonuç ölçümünün başlangıcı). Eski kayıtlarda yok: createdAt kullanılır.
  sentAt: { type: Date, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  cancelledAt: { type: Date, default: null },
  // Bildirimin gittiği müşteriler (sonuç ölçümü için). En fazla 5000 kişi saklanır; daha büyük gönderimde
  // boş bırakılır ve resultsAvailable false olur. Varsayılan sorgularda gelmez.
  recipients: { type: [mongoose.Schema.Types.ObjectId], default: undefined, select: false },
  resultsAvailable: { type: Boolean, default: false },
  // 72 saat dolduktan sonra kesinleşen sonuç (bir kez hesaplanıp saklanır)
  results: {
    type: new mongoose.Schema({
      final: { type: Boolean, default: false },
      orders24: { type: Number, default: 0 },
      buyers24: { type: Number, default: 0 },
      revenue24: { type: Number, default: 0 },
      orders72: { type: Number, default: 0 },
      buyers72: { type: Number, default: 0 },
      revenue72: { type: Number, default: 0 },
      computedAt: { type: Date, default: null },
    }, { _id: false }),
    default: undefined,
  },
}, { timestamps: true });

pushBroadcastSchema.index({ createdAt: -1 });
// Zamanlayıcı: zamanı gelen planlı bildirimler ve yarıda kalan gönderimler
pushBroadcastSchema.index({ status: 1, scheduledFor: 1 });

export default mongoose.model("PushBroadcast", pushBroadcastSchema);
