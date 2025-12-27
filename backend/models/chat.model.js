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
      enum: ["user", "admin"],
      default: "user",
    },
  },
  { timestamps: true }
);

// Compound index for efficient queries
chatSchema.index({ user: 1, status: 1 });
chatSchema.index({ status: 1, lastMessageAt: -1 });

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;
