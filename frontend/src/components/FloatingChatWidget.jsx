import { useEffect, useState, useRef, useCallback } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, X, User, Minimize2,
  Maximize2, Volume2, VolumeX, Search, ArrowLeft, Inbox
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";
import { useUserStore } from "../stores/useUserStore";

// --- Design Constants (Shared with ChatTab) ---
const GLASS_PANEL = "bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl";
const GRADIENT_PRIMARY = "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500";
const BUTTON_GLASS = "bg-white/5 hover:bg-white/10 border border-white/5 transition-all duration-300";

// --- Helper: Play Sound ---
const playNotificationSound = () => {
  try {
    const audio = new Audio("/notification.mp3");
    audio.volume = 0.7;
    audio.play().catch(e => console.warn("Audio play blocked:", e));
  } catch (e) {
    console.warn("Audio error:", e);
  }
};

// --- Components ---

// Mini Chat Item
const MiniChatItem = ({ chat, isSelected, onClick, isTyping }) => {
  const hasUnread = (chat.unreadCount || 0) > 0;
  const lastActivity = chat.updatedAt || chat.lastMessageAt || chat.createdAt;
  const timeLabel = lastActivity
    ? new Date(lastActivity).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
  <motion.div
    whileHover={{ x: 2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(event) => event.key === "Enter" && onClick()}
    className={`group relative p-3 rounded-2xl cursor-pointer mb-1.5 border transition-all ${
      isSelected 
        ? "bg-emerald-500/10 border-emerald-400/30 shadow-[0_8px_22px_rgba(16,185,129,.10)]"
        : "bg-transparent border-transparent hover:bg-white/[.045] hover:border-white/[.06]"
    }`}
  >
    <div className="flex items-center gap-3">
      <div className={`relative w-10 h-10 rounded-2xl ${GRADIENT_PRIMARY} p-[1px] shadow-lg shadow-emerald-950/30`}>
        <div className="w-full h-full bg-[#111a27] rounded-[15px] flex items-center justify-center">
           <User size={16} className="text-white" />
        </div>
        {hasUnread && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-[#101925]" />}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-2">
            <span className={`text-sm truncate ${hasUnread ? 'font-bold text-white' : isSelected ? 'font-semibold text-emerald-300' : 'font-medium text-gray-200'}`}>
              {chat.user?.name || "Misafir"}
            </span>
            {hasUnread ? (
              <span className="min-w-5 h-5 px-1.5 bg-emerald-400 text-emerald-950 text-[10px] leading-5 text-center font-extrabold rounded-full shadow-lg shadow-emerald-500/20">
                {chat.unreadCount}
              </span>
            ) : <span className="text-[10px] text-gray-600 shrink-0">{timeLabel}</span>}
        </div>
        <p className={`mt-0.5 text-xs truncate ${hasUnread ? 'text-gray-300' : 'text-gray-500'}`}>
          {isTyping ? <span className="text-emerald-400 animate-pulse">Yazıyor...</span> : (chat.lastMessage || "Sohbet başladı")}
        </p>
      </div>
    </div>
  </motion.div>
  );
};

// Mini Message Bubble
const MiniMessageBubble = ({ message, isOwn }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-3`}
  >
    <div
      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-md ${
        isOwn
          ? "bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-br-sm"
          : "bg-gray-700/80 text-gray-200 rounded-bl-sm"
      }`}
    >
      <p className="leading-snug">{message.content}</p>
      <span className="text-[10px] opacity-50 block text-right mt-1">
        {new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
      </span>
    </div>
  </motion.div>
);

// Main Widget Component
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
  const { user } = useUserStore();
  const accessToken = user?.accessToken;
  
  const messageListRef = useRef(null);

  const scrollWidgetMessagesToBottom = () => {
    const container = messageListRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  };

  // --- Logic ---
  const fetchChats = useCallback(async () => {
    try {
      const { data } = await axios.get("/chat/list?status=active");
      if (data.success) {
        setChats(data.chats || []);
        setTotalUnread((data.chats || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0));
      }
    } catch(e) { console.error(e); }
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

  const openChat = useCallback((chat) => {
    if (!chat?._id) return;
    setIsOpen(true);
    setSelectedChat(chat);
    fetchMessages(chat._id);
    socketService.joinChat(chat._id);
  }, [fetchMessages]);

  useEffect(() => {
    if (!selectedChat || isLoading) return;
    const frame = requestAnimationFrame(scrollWidgetMessagesToBottom);
    return () => cancelAnimationFrame(frame);
  }, [selectedChat?._id, messages.length, isLoading]);

  // Refs for stable access in socket listeners
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
    socketService.joinAdminRoom(accessToken);
    fetchChats();

    const handleNewMessage = (data) => {
      // Admin'in kendi mesajlarını tekrar ekleme (API response zaten ekliyor)
      if (data.message.sender === "admin") return;

      if(data.message.sender === "user") {
        const currentSelectedChat = selectedChatRef.current;
        const isCurrentChat = currentSelectedChat?._id === data.chatId;

        if(soundEnabledRef.current) playNotificationSound();
        
        if(isCurrentChat) {
          setMessages(prev => {
             if (prev.some(m => m._id === data.message._id)) return prev;
             return [...prev, data.message];
          });
          // Okundu olarak işaretle (anlık)
          axios.put(`/chat/${data.chatId}/read`).catch(console.error);
        } else {
           toast.custom((t) => (
             <motion.div initial={{y: 50, opacity:0}} animate={{y:0, opacity:1}} className={`${GLASS_PANEL} p-4 rounded-xl flex items-center gap-3 w-80`}>
               <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <MessageCircle size={20} />
               </div>
               <div className="flex-1">
                  <h4 className="text-white font-bold text-sm">Yeni Mesaj</h4>
                  <p className="text-gray-400 text-xs truncate">{data.message.content}</p>
               </div>
               <button onClick={() => {
                  toast.dismiss(t.id);
                  const chat = chatsRef.current.find(c => c._id === data.chatId);
                  if(chat) openChat(chat);
               }} className="text-emerald-400 text-xs font-bold hover:underline">AÇ</button>
             </motion.div>
           ), {duration: 4000});
        }
        fetchChats();
      }
    };
    
    // Stable handlers
     const handlers = {
      newMessage: handleNewMessage,
      typing: (data) => data.sender === "user" && setTypingChats(prev => ({...prev, [data.chatId]: true})),
      stopTyping: (data) => setTypingChats(prev => { const n = {...prev}; delete n[data.chatId]; return n; }),
      newChat: () => { if(soundEnabledRef.current) playNotificationSound(); toast.success("Yeni Destek Talebi!"); fetchChats(); }
    };

    Object.entries(handlers).forEach(([evt, handler]) => socketService.on(evt, handler));
    return () => Object.entries(handlers).forEach(([evt]) => socketService.off(evt));
  }, [fetchChats, openChat]);

  const sendMessage = async () => {
     if(!newMessage.trim() || !selectedChat) return;
     try {
        const content = newMessage.trim();
        setNewMessage("");
        const { data } = await axios.post(`/chat/${selectedChat._id}/send`, { content, type: "text" });
        if(data.success) {
           setMessages(prev => [...prev, data.message]);
           fetchChats();
           requestAnimationFrame(scrollWidgetMessagesToBottom);
        }
     } catch { toast.error("Gönderilemedi"); }
  };

  const filteredChats = chats
    .filter(c => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return [c.user?.name, c.user?.email, c.lastMessage]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      const unreadDifference = (b.unreadCount || 0) - (a.unreadCount || 0);
      if (unreadDifference) return unreadDifference;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

  // --- Render ---
  return (
    <>
      <AnimatePresence>
        {!isOpen && (
           <motion.button
             initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
             whileHover={{ scale: 1.06, y: -3 }} whileTap={{ scale: 0.94 }}
             onClick={() => setIsOpen(true)}
             aria-label="Canlı destek sohbetlerini aç"
             className={`fixed bottom-6 right-6 w-16 h-16 ${GRADIENT_PRIMARY} rounded-[22px] shadow-[0_18px_45px_rgba(16,185,129,.34)] ring-1 ring-white/25 flex items-center justify-center z-[50] group`}
           >
              <span className="absolute inset-1 rounded-[18px] border border-white/20" />
              <MessageCircle size={29} className="relative text-white group-hover:scale-110 transition-transform" />
              <span className="absolute -left-1 -top-1 h-4 w-4 rounded-full border-[3px] border-[#0a0a1a] bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.9)]" />
              {totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full ring-2 ring-gray-900 animate-pulse">
                  {totalUnread}
                </span>
              )}
           </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            transition={{ type: "spring", bounce: 0.3 }}
            className={`fixed z-[50] overflow-hidden flex flex-col border border-white/10 bg-[#101925]/95 backdrop-blur-2xl shadow-[0_28px_80px_rgba(0,0,0,.5)] transition-all duration-300 ${
               isMaximized ? "inset-4 rounded-[28px]" : "bottom-6 right-6 w-[400px] h-[640px] rounded-[28px]"
            }`}
          >
            {/* Header */}
            <div className={`relative px-5 py-4 border-b border-white/10 flex items-center justify-between ${GRADIENT_PRIMARY}`}>
               <div className="absolute inset-x-0 bottom-0 h-px bg-white/30" />
               <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white/10 rounded-lg">
                    <MessageCircle size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Canlı Destek</h3>
                     <span className="text-[11px] text-white/90 font-medium">{totalUnread ? `${totalUnread} yeni mesaj seni bekliyor` : "Tüm konuşmalar güncel"}</span>
                  </div>
               </div>
               
               <div className="flex items-center gap-1">
                  <button onClick={() => setSoundEnabled(!soundEnabled)} className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors">
                     {soundEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>}
                  </button>
                  <button onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors">
                     {isMaximized ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
                  </button>
                  <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/80 hover:text-white transition-colors">
                     <X size={16}/>
                  </button>
               </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
               {/* Left List (Visible if chat not selected or maximized) */}
               <div className={`${(selectedChat && !isMaximized) ? 'hidden' : 'flex'} flex-col w-full ${isMaximized ? 'w-80 border-r border-white/10' : ''}`}>
                  <div className="p-3.5 border-b border-white/5 bg-black/10">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14}/>
                        <input 
                           placeholder="Müşteri veya mesaj ara..."
                           value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                           className="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-500/10"
                        />
                     </div>
                     <div className="mt-3 flex items-center justify-between px-1">
                       <span className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">Açık konuşmalar</span>
                       <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-emerald-300">{filteredChats.length}</span>
                     </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                     {filteredChats.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-16 text-gray-500">
                          <div className="mb-3 rounded-2xl bg-white/5 p-4"><Inbox size={24} className="text-gray-600" /></div>
                          <p className="text-sm font-semibold text-gray-400">Sohbet bulunamadı</p>
                          <p className="mt-1 text-xs">Aramanı değiştir veya yeni mesaj bekle.</p>
                        </div>
                     ) : (
                        filteredChats.map(chat => (
                           <MiniChatItem 
                              key={chat._id} chat={chat} isTyping={typingChats[chat._id]}
                              isSelected={selectedChat?._id === chat._id} 
                              onClick={() => openChat(chat)}
                           />
                        ))
                     )}
                  </div>
               </div>

               {/* Right Chat (Visible if chat selected) */}
               {selectedChat && (
                  <div className={`flex flex-col flex-1 bg-black/20 ${(isMaximized && !selectedChat) ? 'hidden' : 'flex'}`}>
                     {/* Chat Header */}
                     <div className="p-3.5 border-b border-white/5 flex items-center justify-between bg-white/[.035]">
                        <div className="flex items-center gap-3">
                           {!isMaximized && (
                             <button onClick={() => setSelectedChat(null)} aria-label="Sohbet listesine dön" className="p-2 -ml-1 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white"><ArrowLeft size={16}/></button>
                           )}
                           <div className="flex flex-col">
                              <span className="text-white font-bold text-sm">{selectedChat.user?.name}</span>
                              <span className="text-[10px] text-gray-400">{selectedChat.user?.email || "Destek talebi"}</span>
                           </div>
                        </div>
                     </div>

                     {/* Messages */}
                     <div ref={messageListRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar scroll-smooth">
                        {isLoading ? (
                           <div className="flex justify-center p-4"><div className="animate-spin text-emerald-500"><MessageCircle/></div></div>
                        ) : messages.map((m, i) => (
                           <MiniMessageBubble key={i} message={m} isOwn={m.sender === "admin"} />
                        ))}
                     </div>

                     {/* Input */}
                     <div className="p-3 border-t border-white/5 bg-gray-900/50">
                        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                           <input 
                              placeholder="Mesaj yaz..."
                              value={newMessage} onChange={e => setNewMessage(e.target.value)}
                              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                           />
                           <motion.button 
                             whileTap={{scale:0.95}} type="submit" disabled={!newMessage.trim()}
                             className="p-2.5 rounded-xl bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                              <Send size={16} />
                           </motion.button>
                        </form>
                     </div>
                  </div>
               )}
               
               {/* Empty State for Maximized View */}
               {isMaximized && !selectedChat && (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                     <MessageCircle size={48} className="opacity-20 mb-4" />
                     <p>Bir sohbet seçin</p>
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
