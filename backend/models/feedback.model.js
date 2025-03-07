import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
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
  },
  { timestamps: true }
);

const Feedback = mongoose.model("Feedback", feedbackSchema);
export default Feedback; 