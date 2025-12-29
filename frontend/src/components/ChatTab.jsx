import { useEffect, useState, useRef } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, X, User, Clock, CheckCircle2, 
  Image as ImageIcon, Paperclip, Search, RefreshCw,
  ChevronLeft, Package2, AlertCircle, Sparkles, MoreVertical,
  Phone, MapPin, Tag, Plus, Trash2, Edit2, RotateCcw
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";

// --- Design Constants ---
const GLASS_PANEL = "bg-gray-900/60 backdrop-blur-xl border border-white/10 shadow-2xl";
const GLASS_CARD = "bg-white/5 hover:bg-white/10 border border-white/5 transition-all duration-300";
const GRADIENT_PRIMARY = "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500";
const GRADIENT_TEXT = "bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400";

// --- Components ---

// Avatar Component
const Avatar = ({ name, isOnline, size = "md" }) => {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-lg",
    lg: "w-16 h-16 text-2xl"
  };

  return (
    <div className="relative">
      <div className={`${sizeClasses[size]} rounded-2xl ${GRADIENT_PRIMARY} p-[2px] shadow-lg shadow-emerald-500/20`}>
        <div className="w-full h-full rounded-[14px] bg-gray-900 flex items-center justify-center">
          <span className="font-bold text-white">{(name || "?")[0].toUpperCase()}</span>
        </div>
      </div>
      {isOnline && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-gray-900"></span>
        </span>
      )}
    </div>
  );
};

// Chat List Item
const ChatListItem = ({ chat, isSelected, onClick, isTyping, onlineInfo }) => {
  const getTimeAgo = (date) => {
    const min = Math.floor((new Date() - new Date(date)) / 60000);
    if (min < 1) return "Şimdi";
    if (min < 60) return `${min}dk`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}sa`;
    return `${Math.floor(hours / 24)}g`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: 1.02, x: 4 }}
      onClick={onClick}
      className={`group relative p-4 mb-3 rounded-2xl cursor-pointer overflow-hidden ${
        isSelected ? "bg-white/10 border-white/10" : "bg-white/5 border-transparent hover:bg-white/10"
      } border backdrop-blur-md transition-all duration-300`}
    >
      {isSelected && (
        <motion.div
          layoutId="activeGlow"
          className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none"
        />
      )}
      
      <div className="flex gap-4 relative z-10">
        <Avatar 
          name={chat.user?.name} 
          isOnline={onlineInfo?.isOnline} 
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <h4 className={`font-semibold truncate ${isSelected ? "text-emerald-400" : "text-white group-hover:text-white/90"}`}>
              {chat.user?.name || "Misafir"}
            </h4>
            <span className="text-xs text-gray-500 font-medium whitespace-nowrap ml-2">
              {getTimeAgo(chat.lastMessageAt)}
            </span>
          </div>

          <div className="flex justify-between items-end">
            <div className="flex-1 min-w-0 mr-2">
              {isTyping ? (
                <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: "0ms"}}/>
                    <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: "150ms"}}/>
                    <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: "300ms"}}/>
                  </span>
                  Yazıyor...
                </span>
              ) : (
                <p className="text-sm text-gray-400 truncate group-hover:text-gray-300 transition-colors">
                  {chat.lastMessage || "Sohbet başlatıldı"}
                </p>
              )}
            </div>
            
            {(chat.unreadCount > 0) && (
              <div className="flex flex-col items-end gap-1">
                <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-emerald-500 text-white text-[10px] font-bold rounded-full shadow-lg shadow-emerald-500/30">
                  {chat.unreadCount}
                </span>
              </div>
            )}
          </div>
          
          {/* Tags / Badges */}
          <div className="flex gap-2 mt-2">
            {chat.type === "order" && (
              <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[10px] border border-purple-500/20 font-medium flex items-center gap-1">
                <Package2 className="w-3 h-3" /> Sipariş
              </span>
            )}
            {onlineInfo?.isOnline && (
              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20 font-medium">
                {onlineInfo.platform === 'ios' ? '🍎 iOS' : '🤖 Android'} v{onlineInfo.appVersion}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Message Bubble
const MessageBubble = ({ message, isOwn }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex w-full mb-6 ${isOwn ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[75%] relative group ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-lg backdrop-blur-md relative overflow-hidden ${
            isOwn
              ? "bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-tr-sm"
              : "bg-gray-800/80 text-gray-100 border border-gray-700 rounded-tl-sm"
          }`}
        >
          {isOwn && <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />}
          
          {message.content}
        </div>
        
        <div className={`flex items-center gap-1.5 mt-1.5 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-gray-500 font-medium">
            {new Date(message.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isOwn && message.isRead && (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          )}
        </div>
      </div>
    </motion.div>
  );
};

const defaultQuickReplies = [
  "Merhaba! 👋 Size nasıl yardımcı olabiliriz?",
  "Siparişiniz hazırlanıyor 📦",
  "Siparişiniz yola çıktı 🚚",
  "Teslim edildi ✅",
  "Birazdan sizinle ilgileneceğiz 🙏",
  "Teşekkür ederiz, iyi günler! 😊"
];

// Main Component
const ChatTab = () => {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({});
  const [showMobileChat, setShowMobileChat] = useState(false);
  
  // Quick Reply State
  const [quickReplies, setQuickReplies] = useState(() => {
    const saved = localStorage.getItem("chatQuickReplies");
    return saved ? JSON.parse(saved) : defaultQuickReplies;
  });
  const [showQuickEditor, setShowQuickEditor] = useState(false);
  const [newTag, setNewTag] = useState("");

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // --- Logic ---
  const fetchChats = async () => {
    try {
      setIsLoading(true);
      const { data } = await axios.get(`/chat/list?status=${statusFilter}`);
      setChats(data.chats || []);
    } catch (error) {
      toast.error("Sohbetler yüklenemedi");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (chatId) => {
    try {
      const { data } = await axios.get(`/chat/${chatId}`);
      setMessages(data.messages || []);
      await axios.put(`/chat/${chatId}/read`);
      setChats(prev => prev.map(c => c._id === chatId ? { ...c, unreadCount: 0 } : c));
    } catch (error) {
      toast.error("Mesajlar alınamadı");
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    try {
      const content = newMessage;
      setNewMessage(""); 
      const { data } = await axios.post(`/chat/${selectedChat._id}/send`, {
        content, type: "text"
      });
      setMessages(prev => [...prev, data.message]);
      setChats(prev => prev.map(c => 
        c._id === selectedChat._id 
          ? { ...c, lastMessage: content, lastMessageAt: new Date() } 
          : c
      ));
    } catch (error) {
      toast.error("Mesaj gönderilemedi");
    }
  };

  const handleCloseChat = async () => {
    if (!confirm("Sohbeti kapatmak istediğinize emin misiniz?")) return;
    try {
      await axios.put(`/chat/${selectedChat._id}/close`);
      toast.success("Sohbet kapatıldı");
      setSelectedChat(null);
      fetchChats();
    } catch (error) {
      toast.error("İşlem başarısız");
    }
  };

  // Socket setup
  useEffect(() => {
    fetchChats();
    const socket = socketService.connect();
    socket.emit("joinAdminRoom");

    const handlers = {
      newChat: (data) => {
        setChats(prev => [data.chat, ...prev]);
        toast.success(`Yeni sohbet: ${data.chat.user?.name}`);
      },
      chatUpdate: (data) => {
        setChats(prev => prev.map(c => c._id === data.chatId 
          ? { ...c, lastMessage: data.lastMessage, unreadCount: data.unreadCount } : c));
      },
      newMessage: (data) => {
        if (selectedChat?._id === data.chatId && data.message.sender !== "admin") {
          setMessages(prev => [...prev, data.message]);
        }
      },
      userTyping: ({ chatId }) => setTypingUsers(prev => ({ ...prev, [chatId]: true })),
      userStopTyping: ({ chatId }) => setTypingUsers(prev => ({ ...prev, [chatId]: false })),
      userInChat: (data) => setOnlineUsers(prev => ({ ...prev, [data.chatId]: { isOnline: true, ...data } })),
      userLeftChat: ({ chatId }) => setOnlineUsers(prev => ({ ...prev, [chatId]: { isOnline: false } }))
    };

    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return () => Object.keys(handlers).forEach(event => socket.off(event));
  }, [selectedChat]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat._id);
      socketService.getSocket().emit("joinChat", selectedChat._id);
      return () => socketService.getSocket().emit("leaveChat", selectedChat._id);
    }
  }, [selectedChat?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Render ---
  const filteredChats = chats.filter(c => 
    c.user?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-140px)] w-full flex gap-6 p-4">
      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px]" />
      </div>

      {/* --- LEFT SIDEBAR (Chat List) --- */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`${GLASS_PANEL} w-full md:w-[380px] rounded-3xl flex flex-col overflow-hidden transition-all duration-300 ${showMobileChat ? 'hidden md:flex' : 'flex'}`}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <MessageCircle size={24} />
              </span>
              Canlı Sohbet
            </h2>
            <button 
              onClick={fetchChats}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Sohbet veya müşteri ara..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:bg-black/40 transition-all"
            />
          </div>

          <div className="flex bg-black/20 p-1 rounded-xl">
            {['active', 'closed'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  statusFilter === status 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {status === 'active' ? 'Aktif Sohbetler' : 'Geçmiş'}
              </button>
            ))}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-10"><RefreshCw className="animate-spin text-emerald-500" /></div>
          ) : filteredChats.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={32} className="opacity-50" />
              </div>
              <p>Sohbet bulunamadı</p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredChats.map(chat => (
                <ChatListItem
                  key={chat._id}
                  chat={chat}
                  isSelected={selectedChat?._id === chat._id}
                  isTyping={typingUsers[chat._id]}
                  onlineInfo={onlineUsers[chat._id]}
                  onClick={() => { setSelectedChat(chat); setShowMobileChat(true); }}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {/* --- RIGHT PANEL (Chat Area) --- */}
      <motion.div
        layout
        className={`${GLASS_PANEL} flex-1 rounded-3xl overflow-hidden flex flex-col transition-all duration-300 relative ${!showMobileChat ? 'hidden md:flex' : 'flex'}`}
      >
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="h-20 border-b border-white/5 flex items-center justify-between px-6 bg-white/5 backdrop-blur-md z-20">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowMobileChat(false)} className="md:hidden p-2 text-gray-400">
                  <ChevronLeft />
                </button>
                <div className="relative">
                  <Avatar name={selectedChat.user?.name} isOnline={onlineUsers[selectedChat._id]?.isOnline} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    {selectedChat.user?.name}
                    {onlineUsers[selectedChat._id]?.isOnline && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <User size={12} /> {selectedChat.user?.email || "Email yok"}
                    </span>
                    {selectedChat.user?.phone && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-gray-600" />
                        <span className="flex items-center gap-1">
                          <Phone size={12} /> {selectedChat.user?.phone}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {selectedChat.type === "order" && (
                  <div className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center gap-2">
                    <Package2 size={16} />
                    <span className="font-medium text-sm">Sipariş Sorusu</span>
                  </div>
                )}
                {selectedChat.status === "active" && (
                  <button 
                    onClick={handleCloseChat}
                    className="p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all flex items-center gap-2 text-sm font-medium"
                  >
                    <X size={16} /> <span className="hidden sm:inline">Sohbeti Kapat</span>
                  </button>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-transparent to-black/20" ref={chatContainerRef}>
              <div className="text-center py-6">
                <span className="px-4 py-1.5 rounded-full bg-white/5 text-xs text-gray-500 border border-white/5">
                  {new Date(selectedChat.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                </span>
              </div>
              
              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} isOwn={msg.sender === "admin"} />
              ))}
              
              {typingUsers[selectedChat._id] && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1 pl-4 py-2">
                   <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: "0ms"}}/>
                   <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: "150ms"}}/>
                   <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: "300ms"}}/>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies & Input */}
            <div className="bg-gray-900/80 backdrop-blur-xl border-t border-white/5 p-4 z-20 space-y-4">
              {/* Quick Replies Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <button 
                  onClick={() => setShowQuickEditor(!showQuickEditor)}
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 ${showQuickEditor ? 'bg-emerald-500 text-white' : 'bg-white/5 text-gray-400 hover:text-emerald-400'}`}
                >
                  {showQuickEditor ? <X size={16}/> : <Edit2 size={16}/>}
                </button>
                
                {showQuickEditor ? (
                  <div className="flex items-center gap-2 flex-1 animate-in fade-in slide-in-from-left-4">
                    <input 
                      autoFocus
                      placeholder="Yeni hızlı yanıt..."
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      onKeyDown={e => {
                        if(e.key === 'Enter' && newTag.trim()){
                          const updated = [...quickReplies, newTag.trim()];
                          setQuickReplies(updated);
                          localStorage.setItem("chatQuickReplies", JSON.stringify(updated));
                          setNewTag("");
                          toast.success("Eklendi");
                        }
                      }}
                      className="bg-black/40 text-sm text-white px-3 py-1.5 rounded-lg border border-emerald-500/30 focus:outline-none w-64"
                    />
                    <button onClick={() => {
                       setQuickReplies(defaultQuickReplies);
                       localStorage.setItem("chatQuickReplies", JSON.stringify(defaultQuickReplies));
                       toast.success("Sıfırlandı");
                    }} className="text-xs text-red-400 hover:text-red-300 ml-auto whitespace-nowrap">
                      Varsayılana Dön
                    </button>
                  </div>
                ) : (
                  quickReplies.map((reply, i) => (
                    <motion.button
                      key={i}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setNewMessage(reply)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-300 text-xs hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:text-emerald-300 transition-all whitespace-nowrap"
                    >
                      {reply}
                    </motion.button>
                  ))
                )}
              </div>

              {/* Input Bar */}
              <form onSubmit={handleSendMessage} className="relative flex gap-3 items-end">
                 <div className="flex-1 bg-black/30 border border-white/10 rounded-2xl p-1 flex items-center focus-within:border-emerald-500/50 focus-within:bg-black/50 transition-all">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Bir mesaj yazın..."
                    className="flex-1 bg-transparent border-none text-white px-4 py-3 focus:ring-0 placeholder-gray-600"
                  />
                  <div className="flex gap-1 pr-2">
                    <button type="button" className="p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10">
                       <Paperclip size={18} />
                    </button>
                    <button type="button" className="p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10">
                       <ImageIcon size={18} />
                    </button>
                  </div>
                 </div>
                 
                 <motion.button
                   whileHover={{ scale: 1.05, rotate: -5 }}
                   whileTap={{ scale: 0.95 }}
                   type="submit"
                   disabled={!newMessage.trim()}
                   className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:shadow-none hover:shadow-emerald-500/40 transition-all"
                 >
                   <Send size={22} className={newMessage.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />
                 </motion.button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-grid-white/[0.02]">
             <div className="w-24 h-24 rounded-full bg-linear-to-br from-emerald-500/10 to-teal-500/5 flex items-center justify-center mb-6 ring-1 ring-white/5">
                <Sparkles size={40} className="text-emerald-500/50" />
             </div>
             <h3 className="text-2xl font-bold text-white mb-2">Hoş Geldiniz</h3>
             <p className="max-w-xs text-center text-gray-400">
               Mesajlaşmaya başlamak için sol menüden bir sohbet seçin.
             </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ChatTab;
