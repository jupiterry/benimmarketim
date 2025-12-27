import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  createChat,
  getChats,
  getUserChats,
  getChatMessages,
  sendMessage,
  markAsRead,
  closeChat,
  getUnreadCount,
} from "../controllers/chat.controller.js";

const router = express.Router();

// Kullanıcı: Yeni sohbet başlat
router.post("/create", protectRoute, createChat);

// Kullanıcı: Kendi sohbetlerini getir
router.get("/my-chats", protectRoute, getUserChats);

// Admin: Tüm sohbetleri getir
router.get("/list", protectRoute, adminRoute, getChats);

// Admin: Okunmamış mesaj sayısı
router.get("/unread-count", protectRoute, adminRoute, getUnreadCount);

// Sohbet mesajlarını getir (hem admin hem kullanıcı)
router.get("/:chatId", protectRoute, getChatMessages);

// Mesaj gönder (hem admin hem kullanıcı)
router.post("/:chatId/send", protectRoute, sendMessage);

// Mesajları okundu işaretle (hem admin hem kullanıcı)
router.put("/:chatId/read", protectRoute, markAsRead);

// Admin: Sohbeti kapat
router.put("/:chatId/close", protectRoute, adminRoute, closeChat);

export default router;
