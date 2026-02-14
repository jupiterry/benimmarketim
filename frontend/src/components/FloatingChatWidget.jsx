import { useEffect, useState, useRef, useCallback } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, X, User, Minimize2,
  Maximize2, Volume2, VolumeX, Search, Sparkles
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";

// ─── Helper: Play Sound ───
const playNotificationSound = () => {
  try {
    const audio = new Audio("/notification.mp3");
    audio.volume = 0.7;
    audio.play().catch(e => console.warn("Audio play blocked:", e));
  } catch (e) {
    console.warn("Audio error:", e);
  }
};

// ─── Neon Chat Item ───
const MiniChatItem = ({ chat, isSelected, onClick, isTyping }) => (
  <motion.div
    whileHover={{ y: -2, scale: 1.01 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`p-3 rounded-xl cursor-pointer mb-1.5 transition-all duration-300 border ${isSelected
        ? "bg-cyan-500/10 border-cyan-400/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
        : "bg-white/[0.03] border-white/[0.04] hover:bg-white/[0.07] hover:border-cyan-400/20"
      }`}
  >
    <div className="flex items-center gap-3">
      {/* Avatar with glow ring */}
      <div className="relative flex-shrink-0">
        <div className={`w-10 h-10 rounded-full p-[2px] ${chat.unreadCount > 0
            ? "bg-gradient-to-br from-cyan-400 via-teal-400 to-emerald-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
            : isSelected
              ? "bg-gradient-to-br from-cyan-500/60 to-teal-500/60"
              : "bg-gradient-to-br from-white/10 to-white/5"
          }`}>
          <div className="w-full h-full bg-gray-900 rounded-full flex items-center justify-center">
            <User size={16} className="text-gray-300" />
          </div>
        </div>
        {/* Online ring pulse */}
        {chat.unreadCount > 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-gray-900 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className={`text-sm font-semibold truncate ${isSelected ? "text-cyan-300" : "text-gray-200"}`}>
            {chat.user?.name || "Misafir"}
          </span>
          {/* Neon unread orb */}
          {chat.unreadCount > 0 && (
            <span className="relative flex items-center justify-center">
              <span className="absolute w-6 h-6 rounded-full bg-cyan-400/20 animate-ping" />
              <span className="relative bg-gradient-to-r from-cyan-400 to-teal-400 text-gray-950 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.6)]">
                {chat.unreadCount}
              </span>
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {isTyping ? <span className="text-cyan-400 animate-pulse">Yazıyor...</span> : (chat.lastMessage || "Sohbet başladı")}
        </p>
      </div>
    </div>
  </motion.div>
);

// ─── Neon Message Bubble ───
const MiniMessageBubble = ({ message, isOwn }) => (
  <motion.div
    initial={{ opacity: 0, y: 12, scale: 0.92 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
    className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-3`}
  >
    <div
      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${isOwn
          ? "bg-gradient-to-br from-cyan-600/80 to-teal-700/80 text-white rounded-br-sm border border-cyan-500/20 shadow-[0_2px_12px_rgba(6,182,212,0.15)]"
          : "bg-white/[0.06] text-gray-200 rounded-bl-sm border border-white/[0.06] backdrop-blur-sm"
        }`}
    >
      <p className="leading-snug">{message.content}</p>
      <span className="text-[10px] opacity-40 block text-right mt-1">
        {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  </motion.div>
);

// ─── Main Widget ───
const FloatingChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typingChats, setTypingChats] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const messagesEndRef = useRef(null);

  // ─── Logic (preserved) ───
  const fetchChats = useCallback(async () => {
    try {
      const { data } = await axios.get("/chat/list?status=active");
      if (data.success) {
        setChats(data.chats || []);
        setTotalUnread((data.chats || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0));
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchMessages = useCallback(async (chatId) => {
    try {
      setIsLoading(true);
      const { data } = await axios.get(`/chat/${chatId}`);
      if (data.success) {
        setMessages(data.messages || []);
        await axios.put(`/chat/${chatId}/read`);
        fetchChats();
      }
    } finally { setIsLoading(false); }
  }, [fetchChats]);

  const selectedChatRef = useRef(selectedChat);
  const soundEnabledRef = useRef(soundEnabled);
  const chatsRef = useRef(chats);
  const messagesRef = useRef(messages);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
    soundEnabledRef.current = soundEnabled;
    chatsRef.current = chats;
    messagesRef.current = messages;
  }, [selectedChat, soundEnabled, chats, messages]);

  // Socket
  useEffect(() => {
    socketService.connect();
    socketService.joinAdminRoom();
    fetchChats();

    const handleNewMessage = (data) => {
      if (data.message.sender === "admin") return;
      if (data.message.sender === "user") {
        const currentSelectedChat = selectedChatRef.current;
        const isCurrentChat = currentSelectedChat?._id === data.chatId;
        if (soundEnabledRef.current) playNotificationSound();

        if (isCurrentChat) {
          setMessages(prev => {
            if (prev.some(m => m._id === data.message._id)) return prev;
            return [...prev, data.message];
          });
          axios.put(`/chat/${data.chatId}/read`).catch(console.error);
        } else {
          toast.custom((t) => (
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="bg-gray-900/90 backdrop-blur-2xl border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.15)] p-4 rounded-2xl flex items-center gap-3 w-80">
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <MessageCircle size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-white font-bold text-sm">Yeni Mesaj</h4>
                <p className="text-gray-400 text-xs truncate">{data.message.content}</p>
              </div>
              <button onClick={() => {
                toast.dismiss(t.id);
                setIsOpen(true);
                const chat = chatsRef.current.find(c => c._id === data.chatId);
                if (chat) { setSelectedChat(chat); }
              }} className="text-cyan-400 text-xs font-bold hover:underline">AÇ</button>
            </motion.div>
          ), { duration: 4000 });
        }
        fetchChats();
      }
    };

    const handlers = {
      newMessage: handleNewMessage,
      typing: (data) => data.sender === "user" && setTypingChats(prev => ({ ...prev, [data.chatId]: true })),
      stopTyping: (data) => setTypingChats(prev => { const n = { ...prev }; delete n[data.chatId]; return n; }),
      newChat: () => { if (soundEnabledRef.current) playNotificationSound(); toast.success("Yeni Destek Talebi!"); fetchChats(); }
    };

    Object.entries(handlers).forEach(([evt, handler]) => socketService.on(evt, handler));
    return () => Object.entries(handlers).forEach(([evt]) => socketService.off(evt));
  }, [fetchChats]);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;
    try {
      const content = newMessage.trim();
      setNewMessage("");
      const { data } = await axios.post(`/chat/${selectedChat._id}/send`, { content, type: "text" });
      if (data.success) {
        setMessages(prev => [...prev, data.message]);
        fetchChats();
      }
    } catch { toast.error("Gönderilemedi"); }
  };

  const filteredChats = chats.filter(c => c.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  // ─── Render ───
  return (
    <>
      {/* ════════ TRIGGER BUTTON — Frosted Glass Neon Orb ════════ */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            whileTap={{ scale: 0.88 }}
            onClick={() => setIsOpen(true)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="fixed bottom-6 right-6 z-[50] group"
          >
            {/* Outer glow ring — pulsing neon aura */}
            <motion.div
              className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl"
              animate={{
                scale: isHovered ? [1, 1.6, 1.4] : [1, 1.3, 1],
                opacity: isHovered ? [0.6, 0.9, 0.7] : [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Secondary glow layer */}
            <motion.div
              className="absolute inset-0 rounded-full bg-teal-400/10 blur-2xl"
              animate={{ scale: [1.2, 1.8, 1.2], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />

            {/* Glass orb body */}
            <motion.div
              className="relative w-16 h-16 rounded-full bg-cyan-500/20 backdrop-blur-2xl border border-cyan-400/30 shadow-[0_0_30px_rgba(6,182,212,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center overflow-hidden"
              animate={{ scale: isHovered ? 1.1 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {/* Inner glass refraction */}
              <div className="absolute top-1 left-2 w-6 h-3 bg-white/10 rounded-full blur-sm rotate-[-20deg]" />

              {/* Icon */}
              <motion.div
                animate={isHovered ? { rotate: [0, -10, 10, -5, 0] } : {}}
                transition={{ duration: 0.6 }}
              >
                <MessageCircle size={28} className="text-cyan-200 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
              </motion.div>

              {/* Hover: animated dots */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    className="absolute bottom-2.5 flex gap-1"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                  >
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1 h-1 rounded-full bg-cyan-300"
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 0.5, delay: i * 0.12, repeat: Infinity }}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Unread neon badge */}
            {totalUnread > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 flex items-center justify-center"
              >
                <span className="absolute w-7 h-7 rounded-full bg-rose-500/30 animate-ping" />
                <span className="relative bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[11px] font-black px-2 py-0.5 rounded-full ring-2 ring-gray-900 shadow-[0_0_12px_rgba(244,63,94,0.6)]">
                  {totalUnread}
                </span>
              </motion.span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ════════ CHAT WINDOW — Holographic Glass Panel ════════ */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3, y: 80, originX: 1, originY: 1 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.3, y: 80 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className={`fixed z-[50] overflow-hidden flex flex-col transition-all duration-500
              bg-gray-950/70 backdrop-blur-3xl
              border border-cyan-500/15
              shadow-[0_0_60px_rgba(6,182,212,0.08),0_25px_50px_rgba(0,0,0,0.5)]
              ${isMaximized
                ? "inset-4 rounded-2xl"
                : "bottom-6 right-6 w-[400px] h-[620px] rounded-3xl"
              }`}
          >
            {/* Decorative border glow — top edge */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />

            {/* ─── Header — Frosted Glass ─── */}
            <div className="relative px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.03]">
              {/* Subtle header glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/[0.03] via-transparent to-teal-500/[0.03]" />

              <div className="relative flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Sparkles size={18} className="text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
                  </div>
                  {/* Tiny pulse dot */}
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-gray-900 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm tracking-wide drop-shadow-[0_0_10px_rgba(6,182,212,0.15)]">
                    Canlı Destek
                  </h3>
                  {totalUnread > 0 && (
                    <span className="text-[10px] text-cyan-400/80 font-medium">{totalUnread} okunmamış mesaj</span>
                  )}
                </div>
              </div>

              <div className="relative flex items-center gap-0.5">
                <button onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-2 rounded-lg text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-200">
                  {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
                <button onClick={() => setIsMaximized(!isMaximized)}
                  className="p-2 rounded-lg text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-200">
                  {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* ─── Content Area ─── */}
            <div className="flex-1 flex overflow-hidden">

              {/* Left: Chat List */}
              <div className={`${(selectedChat && !isMaximized) ? "hidden" : "flex"} flex-col w-full ${isMaximized ? "w-80 border-r border-white/[0.05]" : ""}`}>
                {/* Search */}
                <div className="p-3 border-b border-white/[0.04]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                    <input
                      placeholder="Sohbet ara..."
                      value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.05] transition-all duration-300"
                    />
                  </div>
                </div>

                {/* Chat list */}
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                  {filteredChats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                      <MessageCircle size={32} className="opacity-20 mb-3" />
                      <p className="text-sm">Aktif sohbet yok</p>
                    </div>
                  ) : (
                    filteredChats.map(chat => (
                      <MiniChatItem
                        key={chat._id} chat={chat} isTyping={typingChats[chat._id]}
                        isSelected={selectedChat?._id === chat._id}
                        onClick={() => {
                          setSelectedChat(chat);
                          fetchMessages(chat._id);
                          socketService.joinChat(chat._id);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Right: Messages */}
              {selectedChat && (
                <div className={`flex flex-col flex-1 ${(isMaximized && !selectedChat) ? "hidden" : "flex"}`}>
                  {/* Chat header */}
                  <div className="p-3 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      {!isMaximized && (
                        <button onClick={() => setSelectedChat(null)}
                          className="p-1.5 -ml-1 text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all">
                          <X size={14} />
                        </button>
                      )}
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/20 flex items-center justify-center">
                        <User size={14} className="text-cyan-300" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-white font-semibold text-sm">{selectedChat.user?.name}</span>
                        <span className="text-[10px] text-gray-500">{selectedChat.user?.email}</span>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {isLoading ? (
                      <div className="flex justify-center items-center py-8">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                          className="text-cyan-500"
                        >
                          <MessageCircle size={24} />
                        </motion.div>
                      </div>
                    ) : messages.map((m, i) => (
                      <MiniMessageBubble key={i} message={m} isOwn={m.sender === "admin"} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div className="p-3 border-t border-white/[0.05] bg-white/[0.02]">
                    <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                      <input
                        autoFocus
                        placeholder="Mesaj yaz..."
                        value={newMessage} onChange={e => setNewMessage(e.target.value)}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 focus:shadow-[0_0_12px_rgba(6,182,212,0.08)] transition-all duration-300"
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.92 }}
                        type="submit" disabled={!newMessage.trim()}
                        className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-shadow duration-300"
                      >
                        <Send size={16} />
                      </motion.button>
                    </form>
                  </div>
                </div>
              )}

              {/* Empty state — maximized */}
              {isMaximized && !selectedChat && (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="mb-6"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center">
                      <MessageCircle size={36} className="text-cyan-500/20" />
                    </div>
                  </motion.div>
                  <p className="text-gray-600 text-sm">Bir sohbet seçin</p>
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
