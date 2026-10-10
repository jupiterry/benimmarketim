import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null, // Opsiyonel - sipariş bağlantısı
    },
    type: {
      type: String,
      enum: ["order", "general"],
      default: "general",
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
    mode: {
      type: String,
      enum: ["AI", "WAITING_FOR_AGENT", "HUMAN", "CLOSED"],
      default: "AI",
      index: true,
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    unreadCount: {
      type: Number,
      default: 0, // Admin için okunmamış mesaj sayısı
    },
    userUnreadCount: {
      type: Number,
      default: 0, // Kullanıcı için okunmamış mesaj sayısı
    },
    lastMessage: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessageSender: {
      type: String,
      enum: ["user", "admin", "ai", "system"],
      default: "user",
    },
    // Geciken sipariş akışı (asistan): özür mesajı ve ardından canlı destek teklifi sipariş başına bir kez gösterilir.
    // stage: "notice" → özür gönderildi, "offer" → canlı destek teklif edildi, "done" → akış bitti.
    orderDelay: {
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
      stage: { type: String, enum: ["notice", "offer", "done", null], default: null },
      updatedAt: { type: Date, default: null },
    },
    isDeleted: {
      type: Boolean,
      default: false, // Soft delete - silinen sohbetler hala veritabanında kalır
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for efficient queries
chatSchema.index({ user: 1, status: 1 });
chatSchema.index({ status: 1, lastMessageAt: -1 });

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;
