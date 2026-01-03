import { useEffect, useState, useRef, useCallback } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, X, User, Minimize2,
  Maximize2, Volume2, VolumeX, Search, ChevronUp, ChevronDown
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";

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
const MiniChatItem = ({ chat, isSelected, onClick, isTyping }) => (
  <motion.div
    whileHover={{ scale: 1.02, x: 2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`p-3 rounded-xl cursor-pointer mb-1 transition-all ${
      isSelected 
        ? "bg-white/10 border-l-2 border-emerald-500" 
        : "hover:bg-white/5 border-l-2 border-transparent"
    }`}
  >
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-full ${GRADIENT_PRIMARY} p-[1px]`}>
        <div className="w-full h-full bg-gray-900 rounded-full flex items-center justify-center">
           <User size={16} className="text-white" />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
            <span className={`text-sm font-medium truncate ${isSelected ? 'text-emerald-400' : 'text-gray-200'}`}>
              {chat.user?.name || "Misafir"}
            </span>
            {chat.unreadCount > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-emerald-500/20 shadow-lg">
                {chat.unreadCount}
              </span>
            )}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {isTyping ? <span className="text-emerald-400 animate-pulse">Yazıyor...</span> : (chat.lastMessage || "Sohbet başladı")}
        </p>
      </div>
    </div>
  </motion.div>
);

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
  
  const messagesEndRef = useRef(null);

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
    socketService.joinAdminRoom();
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
                  setIsOpen(true);
                  const chat = chatsRef.current.find(c => c._id === data.chatId);
                  if(chat) { 
                    setSelectedChat(chat); 
                    // fetchMessages will be called by effect change, but we can't rely on effect inside listener easily
                    // we will trigger select logic:
                  }
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
  }, [fetchChats]); // Removed dynamic dependencies to prevent constant reconnects

  useEffect(() => messagesEndRef.current?.scrollIntoView({behavior:"smooth"}), [messages]);

  const sendMessage = async () => {
     if(!newMessage.trim() || !selectedChat) return;
     try {
        const content = newMessage.trim();
        setNewMessage("");
        const { data } = await axios.post(`/chat/${selectedChat._id}/send`, { content, type: "text" });
        if(data.success) {
           setMessages(prev => [...prev, data.message]);
           fetchChats();
        }
     } catch { toast.error("Gönderilemedi"); }
  };

  const filteredChats = chats.filter(c => c.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  // --- Render ---
  return (
    <>
      <AnimatePresence>
        {!isOpen && (
           <motion.button
             initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
             whileHover={{ scale: 1.1, rotate: 5 }} whileTap={{ scale: 0.9 }}
             onClick={() => setIsOpen(true)}
             className={`fixed bottom-6 right-6 w-16 h-16 ${GRADIENT_PRIMARY} rounded-full shadow-2xl shadow-emerald-500/40 flex items-center justify-center z-[50] group`}
           >
              <MessageCircle size={32} className="text-white group-hover:scale-110 transition-transform" />
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
            className={`fixed z-[50] ${GLASS_PANEL} overflow-hidden flex flex-col transition-all duration-300 ${
               isMaximized ? "inset-4 rounded-2xl" : "bottom-6 right-6 w-[380px] h-[600px] rounded-3xl"
            }`}
          >
            {/* Header */}
            <div className={`px-4 py-3 border-b border-white/5 flex items-center justify-between ${GRADIENT_PRIMARY}`}>
               <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white/10 rounded-lg">
                    <MessageCircle size={18} className="text-white" />
                  </div>
                  <div>
                     <h3 className="text-white font-bold text-sm">Canlı Destek</h3>
                     {totalUnread > 0 && <span className="text-[10px] text-white/90 font-medium">{totalUnread} okunmamış mesaj</span>}
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
                  <div className="p-3 border-b border-white/5">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14}/>
                        <input 
                           placeholder="Ara..." 
                           value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                           className="w-full bg-black/20 border border-white/5 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/30"
                        />
                     </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                     {filteredChats.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 text-sm">Sohbet yok</div>
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

               {/* Right Chat (Visible if chat selected) */}
               {selectedChat && (
                  <div className={`flex flex-col flex-1 bg-black/20 ${(isMaximized && !selectedChat) ? 'hidden' : 'flex'}`}>
                     {/* Chat Header */}
                     <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                        <div className="flex items-center gap-3">
                           {!isMaximized && (
                             <button onClick={() => setSelectedChat(null)} className="p-1 -ml-1 text-gray-400 hover:text-white"><X size={16}/></button>
                           )}
                           <div className="flex flex-col">
                              <span className="text-white font-bold text-sm">{selectedChat.user?.name}</span>
                              <span className="text-[10px] text-gray-400">{selectedChat.user?.email}</span>
                           </div>
                        </div>
                     </div>

                     {/* Messages */}
                     <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {isLoading ? (
                           <div className="flex justify-center p-4"><div className="animate-spin text-emerald-500"><MessageCircle/></div></div>
                        ) : messages.map((m, i) => (
                           <MiniMessageBubble key={i} message={m} isOwn={m.sender === "admin"} />
                        ))}
                        <div ref={messagesEndRef} />
                     </div>

                     {/* Input */}
                     <div className="p-3 border-t border-white/5 bg-gray-900/50">
                        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                           <input 
                              autoFocus
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
