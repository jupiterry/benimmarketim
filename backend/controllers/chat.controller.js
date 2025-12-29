import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";

// Yeni sohbet oluştur veya mevcut aktif sohbeti getir
export const createChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId, type = "general" } = req.body;

    // Aynı kullanıcı ve sipariş için aktif sohbet var mı kontrol et
    let existingChat = await Chat.findOne({
      user: userId,
      order: orderId || null,
      status: "active",
    });

    if (existingChat) {
      return res.json({ 
        success: true, 
        chat: existingChat,
        isNew: false 
      });
    }

    // Yeni sohbet oluştur
    const chat = await Chat.create({
      user: userId,
      order: orderId || null,
      type: orderId ? "order" : type,
      status: "active",
    });

    // Otomatik karşılama mesajı
    const welcomeMessage = await Message.create({
      chat: chat._id,
      sender: "admin",
      senderName: "Destek Ekibi",
      content: "Merhaba! 👋 Size nasıl yardımcı olabiliriz?",
      type: "system",
      isRead: false,
    });

    // Chat'i güncelle
    chat.lastMessage = welcomeMessage.content;
    chat.lastMessageAt = welcomeMessage.createdAt;
    chat.lastMessageSender = "admin";
    chat.userUnreadCount = 1;
    await chat.save();

    // Socket.IO ile admin'lere bildir
    const io = req.app.get("io");
    if (io) {
      const user = await User.findById(userId).select("name email");
      io.to("adminRoom").emit("newChat", {
        chat: {
          ...chat.toObject(),
          user: user,
        },
      });
    }

    res.status(201).json({ 
      success: true, 
      chat,
      isNew: true,
      welcomeMessage 
    });
  } catch (error) {
    console.error("Sohbet oluşturulurken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Admin için tüm sohbetleri getir
export const getChats = async (req, res) => {
  try {
    const { status = "active", userId, search } = req.query;

    // Query oluştur
    const query = { 
      status,
      isDeleted: { $ne: true } // Silinmemiş sohbetleri getir
    };

    // Kullanıcıya göre filtrele
    if (userId) {
      query.user = userId;
    }

    const chats = await Chat.find(query)
      .populate("user", "name email phone")
      .populate("order", "_id totalAmount status createdAt")
      .sort({ lastMessageAt: -1 });

    // Arama varsa filtrele (kullanıcı adı veya email)
    let filteredChats = chats;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredChats = chats.filter(chat => 
        chat.user?.name?.toLowerCase().includes(searchLower) ||
        chat.user?.email?.toLowerCase().includes(searchLower) ||
        chat.user?.phone?.includes(search)
      );
    }

    res.json({ success: true, chats: filteredChats });
  } catch (error) {
    console.error("Sohbetler alınırken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Kullanıcının kendi sohbetlerini getir
export const getUserChats = async (req, res) => {
  try {
    const userId = req.user._id;

    const chats = await Chat.find({ user: userId })
      .populate("order", "_id totalAmount status createdAt")
      .sort({ lastMessageAt: -1 });

    res.json({ success: true, chats });
  } catch (error) {
    console.error("Kullanıcı sohbetleri alınırken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Sohbet mesajlarını getir
export const getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user._id;
    const isAdmin = req.user.role === "admin";

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Sohbet bulunamadı!" });
    }

    // Yetki kontrolü
    if (!isAdmin && chat.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bu sohbete erişim yetkiniz yok!" });
    }

    const messages = await Message.find({ chat: chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Mesajları eski->yeni sırala
    messages.reverse();

    res.json({ 
      success: true, 
      messages,
      chat,
      hasMore: messages.length === parseInt(limit)
    });
  } catch (error) {
    console.error("Mesajlar alınırken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Mesaj gönder
export const sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, type = "text", fileUrl, fileName } = req.body;
    const userId = req.user._id;
    const isAdmin = req.user.role === "admin";

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Sohbet bulunamadı!" });
    }

    // Yetki kontrolü
    if (!isAdmin && chat.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bu sohbete mesaj gönderme yetkiniz yok!" });
    }

    // Sohbet kapalıysa mesaj gönderilemez
    if (chat.status === "closed") {
      return res.status(400).json({ message: "Bu sohbet kapatılmış!" });
    }

    const sender = isAdmin ? "admin" : "user";
    const senderName = isAdmin ? "Destek Ekibi" : req.user.name;

    const message = await Message.create({
      chat: chatId,
      sender,
      senderName,
      content,
      type,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      isRead: false,
    });

    // Chat'i güncelle
    chat.lastMessage = type === "text" ? content : (type === "image" ? "📷 Resim" : "📎 Dosya");
    chat.lastMessageAt = message.createdAt;
    chat.lastMessageSender = sender;
    
    // Okunmamış sayısını artır
    if (sender === "user") {
      chat.unreadCount += 1;
    } else {
      chat.userUnreadCount += 1;
    }
    
    await chat.save();

    // Socket.IO ile gerçek zamanlı bildirim
    const io = req.app.get("io");
    if (io) {
      // Sohbet odasına mesajı gönder
      io.to(`chat_${chatId}`).emit("newMessage", {
        message,
        chatId,
      });

      // Admin'lere bildir (kullanıcı mesaj gönderdiğinde)
      if (sender === "user") {
        io.to("adminRoom").emit("chatUpdate", {
          chatId,
          lastMessage: chat.lastMessage,
          unreadCount: chat.unreadCount,
        });
        
        // Global chat bildirim event'i - Admin panelinde herhangi bir sayfada bildirim göster
        const user = await User.findById(userId).select("name");
        io.to("adminRoom").emit("newChatMessage", {
          chatId,
          message: chat.lastMessage,
          senderName: user?.name || "Kullanıcı",
          timestamp: new Date(),
        });
      }
    }

    res.status(201).json({ success: true, message });
  } catch (error) {
    console.error("Mesaj gönderilirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Mesajları okundu olarak işaretle
export const markAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const isAdmin = req.user.role === "admin";

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Sohbet bulunamadı!" });
    }

    // Yetki kontrolü
    if (!isAdmin && chat.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bu sohbete erişim yetkiniz yok!" });
    }

    // Karşı tarafın mesajlarını okundu olarak işaretle
    const senderToMark = isAdmin ? "user" : "admin";
    
    await Message.updateMany(
      { chat: chatId, sender: senderToMark, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    // Okunmamış sayısını sıfırla
    if (isAdmin) {
      chat.unreadCount = 0;
    } else {
      chat.userUnreadCount = 0;
    }
    await chat.save();

    // Socket.IO ile bildir
    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${chatId}`).emit("messagesRead", {
        chatId,
        readBy: isAdmin ? "admin" : "user",
      });
    }

    res.json({ success: true, message: "Mesajlar okundu olarak işaretlendi" });
  } catch (error) {
    console.error("Mesajlar okundu işaretlenirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Sohbeti kapat
export const closeChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Sohbet bulunamadı!" });
    }

    chat.status = "closed";
    await chat.save();

    // Kapanış mesajı ekle
    await Message.create({
      chat: chatId,
      sender: "admin",
      senderName: "Sistem",
      content: "Bu sohbet kapatıldı. Yeni bir sohbet başlatabilirsiniz.",
      type: "system",
      isRead: false,
    });

    // Socket.IO ile bildir
    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${chatId}`).emit("chatClosed", { chatId });
    }

    res.json({ success: true, message: "Sohbet kapatıldı" });
  } catch (error) {
    console.error("Sohbet kapatılırken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Admin için toplam okunmamış mesaj sayısı
export const getUnreadCount = async (req, res) => {
  try {
    const result = await Chat.aggregate([
      { $match: { status: "active", isDeleted: { $ne: true } } },
      { $group: { _id: null, totalUnread: { $sum: "$unreadCount" } } }
    ]);

    const totalUnread = result.length > 0 ? result[0].totalUnread : 0;

    res.json({ success: true, unreadCount: totalUnread });
  } catch (error) {
    console.error("Okunmamış sayısı alınırken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};

// Sohbeti sil (soft delete)
export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Sohbet bulunamadı!" });
    }

    // Soft delete - veritabanından silmiyoruz, sadece işaretliyoruz
    chat.isDeleted = true;
    chat.deletedAt = new Date();
    await chat.save();

    res.json({ success: true, message: "Sohbet silindi (arşivlendi)" });
  } catch (error) {
    console.error("Sohbet silinirken hata:", error.message);
    res.status(500).json({ message: "Server hatası", error: error.message });
  }
};
