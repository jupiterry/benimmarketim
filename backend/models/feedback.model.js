import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Tavsiye (NPS), hızlı 👍/👎 ve vazgeçme kayıtlarında yıldız puanı yoktur
    rating: {
      type: Number,
      required: function () { return !["quick", "nps", "abandon"].includes(this.kind); },
      min: 1,
      max: 5,
      default: null,
    },
    // general: eski serbest form, order: 1./3./5. sipariş anketi, quick: sipariş sonrası 👍/👎,
    // nps: "Bizi önerir misin?" (0-10), abandon: sepeti boşaltınca "Neden vazgeçtin?"
    kind: {
      type: String,
      enum: ["general", "order", "quick", "nps", "abandon"],
      default: "general",
      index: true,
    },
    ratings: {
      usability: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      expectations: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      repeat: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      overall: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
    },
    title: {
      type: String,
      default: "Genel Değerlendirme",
    },
    message: {
      type: String,
      default: "Puan bazlı değerlendirme",
    },
    category: {
      type: String,
      enum: ["Genel", "Öneri", "Şikayet", "Hata Bildirimi"],
      default: "Genel",
    },
    status: {
      type: String,
      enum: ["Yeni", "İnceleniyor", "Çözüldü", "Kapatıldı"],
      default: "Yeni",
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    // Sipariş sonrası deneyim anketi (1., 5. ve 15. teslim edilen siparişte sorulur)
    milestone: {
      type: Number,
      default: null,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    // Teslimat/kurye puanı (ürün memnuniyetinden ayrı ölçülür)
    deliveryRating: { type: Number, min: 1, max: 5, default: null },
    thumb: { type: String, enum: ["up", "down", null], default: null },
    npsScore: { type: Number, min: 0, max: 10, default: null },
    // Vazgeçme nedeni (kind: abandon)
    reason: { type: String, default: "" },
    // Sipariş anından kopyalanır; teslimat noktasına göre karşılaştırma için
    deliveryPoint: { type: String, default: "" },
    // Bozuk / eksik / yanlış gelen ürünler
    problemItems: {
      type: [{
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
        name: { type: String, default: "" },
        issue: { type: String, enum: ["bozuk", "eksik", "yanlis"], required: true },
      }],
      default: [],
    },
    // Düşük puanda açılan destek görüşmesi
    supportChat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", default: null },
    // Yöneticinin verdiği telafi kuponu
    compensation: {
      coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
      code: { type: String, default: "" },
      amount: { type: Number, default: 0 },
      at: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    // Yönetici yanıtı (panelden yazılır; mobil uygulama bu alanı yalnızca okur)
    adminReply: {
      text: { type: String, default: "" },
      at: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ user: 1, kind: 1, createdAt: -1 });
feedbackSchema.index({ order: 1, kind: 1 });

const Feedback = mongoose.model("Feedback", feedbackSchema);
export default Feedback; 