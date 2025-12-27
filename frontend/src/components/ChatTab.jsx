import { useEffect, useState, useRef } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, X, User, Clock, CheckCircle2, 
  Image as ImageIcon, Paperclip, Search, RefreshCw,
  ChevronLeft, Package2, AlertCircle
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";

// Chat List Item Component
const ChatListItem = ({ chat, isSelected, onClick, isTyping, onlineInfo }) => {
  const getTimeAgo = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Şimdi";
    if (minutes < 60) return `${minutes}dk`;
    if (hours < 24) return `${hours}sa`;
    return `${days}g`;
  };

  const isOnline = onlineInfo?.isOnline || false;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`p-4 cursor-pointer transition-all border-b border-gray-700/30 ${
        isSelected
          ? "bg-emerald-500/20 border-l-4 border-l-emerald-500"
          : "hover:bg-gray-700/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar with online indicator */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          {/* Online indicator */}
          <div 
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-800 ${
              isOnline ? 'bg-green-500' : 'bg-gray-500'
            }`}
            title={isOnline ? 'Sohbette' : 'Çevrimdışı'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium truncate">{chat.user?.name || "Misafir"}</h4>
              {isOnline && (
                <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded animate-pulse flex items-center gap-1">
                  📱 {onlineInfo?.platform === 'ios' ? 'iOS' : 'Android'} v{onlineInfo?.appVersion || '?'}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">{getTimeAgo(chat.lastMessageAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            {chat.type === "order" && (
              <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                Sipariş
              </span>
            )}
            <p className="text-sm text-gray-400 truncate flex-1">
              {isTyping ? (
                <span className="text-emerald-400 italic">Yazıyor...</span>
              ) : (
                chat.lastMessage || "Yeni sohbet"
              )}
            </p>
          </div>
        </div>
        {chat.unreadCount > 0 && (
          <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xs text-white font-bold">{chat.unreadCount}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Message Bubble Component
const MessageBubble = ({ message, isOwn }) => {
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
          message.type === "system"
            ? "bg-gray-700/50 text-gray-400 text-center text-sm mx-auto"
            : isOwn
            ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-br-sm"
            : "bg-gray-700/80 text-white rounded-bl-sm"
        }`}
      >
        {message.type === "image" && message.fileUrl && (
          <img
            src={message.fileUrl}
            alt="Gönderilen resim"
            className="max-w-full rounded-lg mb-2 cursor-pointer hover:opacity-90"
            onClick={() => window.open(message.fileUrl, "_blank")}
          />
        )}
        {message.type === "file" && message.fileUrl && (
          <a
            href={message.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm underline"
          >
            <Paperclip className="w-4 h-4" />
            {message.fileName || "Dosya"}
          </a>
        )}
        {message.content && <p className="text-sm">{message.content}</p>}
        <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
          <span className="text-xs opacity-70">{formatTime(message.createdAt)}</span>
          {isOwn && message.isRead && (
            <CheckCircle2 className="w-3 h-3 text-blue-300" />
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Main ChatTab Component
const ChatTab = () => {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({}); // Sohbette aktif kullanıcılar
  const [showMobileChat, setShowMobileChat] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Sohbetleri yükle
  const fetchChats = async () => {
    try {
      const response = await axios.get(`/chat/list?status=${statusFilter}`);
      setChats(response.data.chats || []);
    } catch (error) {
      console.error("Sohbetler yüklenirken hata:", error);
      toast.error("Sohbetler yüklenemedi");
    } finally {
      setIsLoading(false);
    }
  };

  // Mesajları yükle
  const fetchMessages = async (chatId) => {
    try {
      const response = await axios.get(`/chat/${chatId}`);
      setMessages(response.data.messages || []);
      
      // Mesajları okundu olarak işaretle
      await axios.put(`/chat/${chatId}/read`);
      
      // Okunmamış sayısını sıfırla
      setChats(prev => prev.map(c => 
        c._id === chatId ? { ...c, unreadCount: 0 } : c
      ));
    } catch (error) {
      console.error("Mesajlar yüklenirken hata:", error);
      toast.error("Mesajlar yüklenemedi");
    }
  };

  // Mesaj gönder
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat || isSending) return;

    setIsSending(true);
    const messageContent = newMessage;
    setNewMessage("");

    try {
      const response = await axios.post(`/chat/${selectedChat._id}/send`, {
        content: messageContent,
        type: "text",
      });

      // Mesajı listeye ekle
      setMessages(prev => [...prev, response.data.message]);
      
      // Son mesajı güncelle
      setChats(prev => prev.map(c => 
        c._id === selectedChat._id 
          ? { ...c, lastMessage: messageContent, lastMessageAt: new Date() }
          : c
      ));

      inputRef.current?.focus();
    } catch (error) {
      console.error("Mesaj gönderilirken hata:", error);
      toast.error("Mesaj gönderilemedi");
      setNewMessage(messageContent);
    } finally {
      setIsSending(false);
    }
  };

  // Sohbeti kapat
  const handleCloseChat = async () => {
    if (!selectedChat) return;

    try {
      await axios.put(`/chat/${selectedChat._id}/close`);
      toast.success("Sohbet kapatıldı");
      setSelectedChat(null);
      fetchChats();
    } catch (error) {
      console.error("Sohbet kapatılırken hata:", error);
      toast.error("Sohbet kapatılamadı");
    }
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll to bottom - sadece istendiğinde çağrılır
  // useEffect(() => {
  //   scrollToBottom();
  // }, [messages]);

  // Socket.IO bağlantısı
  useEffect(() => {
    fetchChats();

    const socket = socketService.connect();
    socket.emit("joinAdminRoom");

    // Yeni sohbet bildirimi
    socket.on("newChat", (data) => {
      setChats(prev => [data.chat, ...prev]);
      toast.success(`Yeni sohbet: ${data.chat.user?.name || "Misafir"}`);
    });

    // Sohbet güncelleme
    socket.on("chatUpdate", (data) => {
      setChats(prev => prev.map(c => 
        c._id === data.chatId 
          ? { ...c, lastMessage: data.lastMessage, unreadCount: data.unreadCount }
          : c
      ));
    });

    // Yeni mesaj
    socket.on("newMessage", (data) => {
      if (selectedChat?._id === data.chatId) {
        // Admin'in kendi gönderdiği mesajları tekrar ekleme (zaten API ile eklendi)
        if (data.message.sender !== "admin") {
          setMessages(prev => {
            // Aynı mesaj zaten varsa ekleme
            if (prev.some(m => m._id === data.message._id)) return prev;
            return [...prev, data.message];
          });
        }
      }
    });

    // Yazıyor göstergesi
    socket.on("userTyping", ({ chatId }) => {
      setTypingUsers(prev => ({ ...prev, [chatId]: true }));
    });

    socket.on("userStopTyping", ({ chatId }) => {
      setTypingUsers(prev => ({ ...prev, [chatId]: false }));
    });

    // Kullanıcı sohbete girdi
    socket.on("userInChat", ({ chatId, userId, userName, platform, appVersion }) => {
      console.log(`🟢 Kullanıcı sohbette: ${userName || userId} - Chat: ${chatId} - Platform: ${platform} v${appVersion}`);
      setOnlineUsers(prev => ({ ...prev, [chatId]: { isOnline: true, userName, platform, appVersion } }));
    });

    // Kullanıcı sohbetten çıktı
    socket.on("userLeftChat", ({ chatId, userId }) => {
      console.log(`⚪ Kullanıcı çıktı: ${userId} - Chat: ${chatId}`);
      setOnlineUsers(prev => ({ ...prev, [chatId]: { isOnline: false } }));
    });

    return () => {
      socket.off("newChat");
      socket.off("chatUpdate");
      socket.off("newMessage");
      socket.off("userTyping");
      socket.off("userStopTyping");
      socket.off("userInChat");
      socket.off("userLeftChat");
    };
  }, [selectedChat]);

  // StatusFilter değiştiğinde sohbetleri yeniden yükle
  useEffect(() => {
    fetchChats();
  }, [statusFilter]);

  // Sohbet seçildiğinde
  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat._id);
      
      const socket = socketService.getSocket();
      socket.emit("joinChat", selectedChat._id);

      return () => {
        socket.emit("leaveChat", selectedChat._id);
      };
    }
  }, [selectedChat?._id]);

  // Filtrelenmiş sohbetler
  const filteredChats = chats.filter(chat =>
    (chat.user?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (chat.user?.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-200px)] flex gap-4">
      {/* Chat List - Sol Panel */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`w-full md:w-80 lg:w-96 glass rounded-2xl overflow-hidden flex flex-col ${
          showMobileChat ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-400" />
              Canlı Sohbet
            </h2>
            <motion.button
              whileHover={{ rotate: 180 }}
              whileTap={{ scale: 0.9 }}
              onClick={fetchChats}
              className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400"
            >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Kullanıcı ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 text-white rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter("active")}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === "active"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-gray-700/30 text-gray-400"
              }`}
            >
              Aktif
            </button>
            <button
              onClick={() => setStatusFilter("closed")}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === "closed"
                  ? "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                  : "bg-gray-700/30 text-gray-400"
              }`}
            >
              Kapalı
            </button>
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <MessageCircle className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Henüz sohbet yok</p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredChats.map((chat) => (
                <ChatListItem
                  key={chat._id}
                  chat={chat}
                  isSelected={selectedChat?._id === chat._id}
                  isTyping={typingUsers[chat._id]}
                  onlineInfo={onlineUsers[chat._id]}
                  onClick={() => {
                    setSelectedChat(chat);
                    setShowMobileChat(true);
                  }}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {/* Chat Messages - Sağ Panel */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`flex-1 glass rounded-2xl overflow-hidden flex flex-col ${
          !showMobileChat ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-700/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowMobileChat(false)}
                  className="md:hidden p-2 rounded-lg hover:bg-gray-700/50 text-gray-400"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-medium">{selectedChat.user?.name}</h3>
                  <p className="text-sm text-gray-400">{selectedChat.user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedChat.order && (
                  <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-sm rounded-full flex items-center gap-1">
                    <Package2 className="w-4 h-4" />
                    Sipariş
                  </span>
                )}
                {selectedChat.status === "active" && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCloseChat}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Kapat
                  </motion.button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message._id}
                  message={message}
                  isOwn={message.sender === "admin"}
                />
              ))}
              {typingUsers[selectedChat._id] && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                  <span>Yazıyor...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {selectedChat.status === "active" ? (
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700/30">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Mesajınızı yazın..."
                    className="flex-1 bg-gray-800/50 border border-gray-700/50 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={!newMessage.trim() || isSending}
                    className="p-3 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-white disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </motion.button>
                </div>
              </form>
            ) : (
              <div className="p-4 border-t border-gray-700/30 text-center">
                <p className="text-gray-400 text-sm flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Bu sohbet kapatılmış
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageCircle className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">Sohbet Seçin</p>
            <p className="text-sm">Sol panelden bir sohbet seçerek yanıtlamaya başlayın</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ChatTab;
