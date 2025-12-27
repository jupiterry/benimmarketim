import { useEffect, useState, useRef, useCallback } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, X, User, Clock, Minimize2,
  Maximize2, Volume2, VolumeX, Search
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";

// Bildirim sesi
const notificationSound = new Audio("/notification.mp3");
notificationSound.volume = 0.5;

// Mini Message Bubble
const MiniMessageBubble = ({ message, isOwn }) => {
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-1.5 text-sm ${
          message.type === "system"
            ? "bg-gray-600/50 text-gray-400 text-center text-xs mx-auto"
            : isOwn
            ? "bg-emerald-500 text-white"
            : "bg-gray-600 text-white"
        }`}
      >
        <p className="break-words">{message.content}</p>
        <span className="text-[10px] opacity-60">{formatTime(message.createdAt)}</span>
      </div>
    </div>
  );
};

// Mini Chat Item
const MiniChatItem = ({ chat, isSelected, onClick, isTyping }) => {
  return (
    <div
      onClick={onClick}
      className={`p-2 cursor-pointer rounded-lg transition-all mb-1 ${
        isSelected
          ? "bg-emerald-500/30 border border-emerald-500"
          : "hover:bg-gray-600/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{chat.user?.name || "Misafir"}</p>
          <p className="text-gray-400 text-xs truncate">
            {isTyping ? (
              <span className="text-emerald-400">Yazıyor...</span>
            ) : (
              chat.lastMessage || "Yeni sohbet"
            )}
          </p>
        </div>
        {chat.unreadCount > 0 && (
          <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
            <span className="text-xs text-white font-bold">{chat.unreadCount}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const FloatingChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [typingChats, setTypingChats] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [totalUnread, setTotalUnread] = useState(0);
  const messagesEndRef = useRef(null);

  // Sohbetleri yükle
  const fetchChats = useCallback(async () => {
    try {
      const response = await axios.get("/chat/list?status=active");
      if (response.data.success) {
        setChats(response.data.chats || []);
        // Toplam okunmamış sayısı
        const unread = (response.data.chats || []).reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);
        setTotalUnread(unread);
      }
    } catch (error) {
      console.error("Sohbetler alınamadı:", error);
    }
  }, []);

  // Mesajları yükle
  const fetchMessages = useCallback(async (chatId) => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/chat/${chatId}`);
      if (response.data.success) {
        setMessages(response.data.messages || []);
        // Okundu işaretle
        await axios.put(`/chat/${chatId}/read`);
        fetchChats();
      }
    } catch (error) {
      console.error("Mesajlar alınamadı:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchChats]);

  // Socket olaylarını dinle
  useEffect(() => {
    socketService.connect();
    socketService.joinAdminRoom();

    // Yeni mesaj
    const handleNewMessage = (data) => {
      if (data.message.sender === "user") {
        // Ses çal
        if (soundEnabled) {
          notificationSound.play().catch(() => {});
        }
        
        // Bildirim göster
        toast.custom((t) => (
          <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-gray-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
            <div className="flex-1 p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-white">Yeni Mesaj</p>
                  <p className="mt-1 text-sm text-gray-300 truncate">{data.message.content}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                setIsOpen(true);
                const chat = chats.find(c => c._id === data.message.chat);
                if (chat) {
                  setSelectedChat(chat);
                  fetchMessages(chat._id);
                }
              }}
              className="px-4 border-l border-gray-700 text-emerald-400 hover:text-emerald-300"
            >
              Aç
            </button>
          </div>
        ), { duration: 5000 });
      }

      // Mesaj listesini güncelle
      if (selectedChat && data.message.chat === selectedChat._id) {
        setMessages(prev => [...prev, data.message]);
      }
      fetchChats();
    };

    // Yazıyor göstergesi
    const handleTyping = (data) => {
      if (data.sender === "user") {
        setTypingChats(prev => ({ ...prev, [data.chatId]: true }));
      }
    };

    const handleStopTyping = (data) => {
      setTypingChats(prev => {
        const newState = { ...prev };
        delete newState[data.chatId];
        return newState;
      });
    };

    // Yeni sohbet
    const handleNewChat = (data) => {
      if (soundEnabled) {
        notificationSound.play().catch(() => {});
      }
      toast.success("Yeni destek talebi!");
      fetchChats();
    };

    socketService.on("newMessage", handleNewMessage);
    socketService.on("typing", handleTyping);
    socketService.on("stopTyping", handleStopTyping);
    socketService.on("newChat", handleNewChat);

    fetchChats();

    return () => {
      socketService.off("newMessage", handleNewMessage);
      socketService.off("typing", handleTyping);
      socketService.off("stopTyping", handleStopTyping);
      socketService.off("newChat", handleNewChat);
    };
  }, [soundEnabled, selectedChat, fetchChats, fetchMessages, chats]);

  // Mesaj gönder
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || isSending) return;

    const content = newMessage.trim();
    setNewMessage("");
    setIsSending(true);

    try {
      const response = await axios.post(`/chat/${selectedChat._id}/send`, {
        content,
        type: "text",
      });

      if (response.data.success) {
        setMessages(prev => [...prev, response.data.message]);
        fetchChats();
      }
    } catch (error) {
      toast.error("Mesaj gönderilemedi");
      setNewMessage(content);
    } finally {
      setIsSending(false);
    }
  };

  // Sohbet seç
  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    fetchMessages(chat._id);
    socketService.joinChat(chat._id);
  };

  // En alta kaydır
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filtrelenmiş sohbetler
  const filteredChats = chats.filter(chat => 
    chat.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.user?.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full shadow-lg flex items-center justify-center z-[9999] hover:shadow-emerald-500/30"
          >
            <MessageCircle className="w-6 h-6 text-white" />
            {totalUnread > 0 && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-xs text-white font-bold">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              </div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className={`fixed z-[9999] bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col ${
              isMaximized
                ? "inset-4"
                : "bottom-6 right-6 w-96 h-[500px]"
            }`}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-white" />
                <span className="text-white font-semibold">Canlı Destek</span>
                {totalUnread > 0 && (
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs text-white">
                    {totalUnread} yeni
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  title={soundEnabled ? "Sesi kapat" : "Sesi aç"}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-white" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-white" />
                  )}
                </button>
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  {isMaximized ? (
                    <Minimize2 className="w-4 h-4 text-white" />
                  ) : (
                    <Maximize2 className="w-4 h-4 text-white" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setSelectedChat(null);
                  }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Chat List */}
              <div className={`${selectedChat && !isMaximized ? 'hidden' : 'w-full'} ${isMaximized ? 'w-72 border-r border-gray-700' : ''} flex flex-col`}>
                {/* Search */}
                <div className="p-2 border-b border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Kullanıcı ara..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-gray-700/50 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Chats */}
                <div className="flex-1 overflow-y-auto p-2">
                  {filteredChats.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Aktif sohbet yok</p>
                    </div>
                  ) : (
                    filteredChats.map((chat) => (
                      <MiniChatItem
                        key={chat._id}
                        chat={chat}
                        isSelected={selectedChat?._id === chat._id}
                        onClick={() => handleSelectChat(chat)}
                        isTyping={typingChats[chat._id]}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Messages Area */}
              {(selectedChat || isMaximized) && (
                <div className={`flex-1 flex flex-col ${!selectedChat && isMaximized ? 'items-center justify-center' : ''}`}>
                  {!selectedChat ? (
                    <div className="text-center text-gray-500">
                      <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Bir sohbet seçin</p>
                    </div>
                  ) : (
                    <>
                      {/* Selected Chat Header */}
                      <div className="p-2 border-b border-gray-700 flex items-center gap-2">
                        {!isMaximized && (
                          <button
                            onClick={() => setSelectedChat(null)}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                        )}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{selectedChat.user?.name}</p>
                          <p className="text-gray-400 text-xs truncate">{selectedChat.user?.email}</p>
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-3">
                        {isLoading ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                          </div>
                        ) : (
                          <>
                            {messages.map((msg) => (
                              <MiniMessageBubble
                                key={msg._id}
                                message={msg}
                                isOwn={msg.sender === "admin"}
                              />
                            ))}
                            <div ref={messagesEndRef} />
                          </>
                        )}
                      </div>

                      {/* Input */}
                      <div className="p-2 border-t border-gray-700">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Mesaj yazın..."
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                            className="flex-1 bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={sendMessage}
                            disabled={isSending || !newMessage.trim()}
                            className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-600 rounded-lg transition-colors"
                          >
                            <Send className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FloatingChatWidget;
