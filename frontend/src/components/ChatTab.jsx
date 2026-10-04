import { useEffect, useState, useRef } from "react";
import axios from "../lib/axios";
import {
  MessageCircle, Send, X, User, CheckCircle2,
  Search, RefreshCw,
  ChevronLeft, Package2,
  Phone, Edit2
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";
import { useUserStore } from "../stores/useUserStore";

// --- Components ---

// Avatar Component
const Avatar = ({ name, isOnline, size = "md" }) => {
  return (
    <div className="chat-avatar" data-size={size}>
      <div className="ui-avatar">
        {(name || "?")[0].toUpperCase()}
      </div>
      {isOnline && <span className="chat-online" title="Çevrimiçi" />}
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
    <div
      onClick={onClick}
      className="chat-item"
      data-selected={isSelected}
    >
      <Avatar 
        name={chat.user?.name} 
        isOnline={onlineInfo?.isOnline} 
      />
      
      <div className="ui-grow">
        <div className="ui-between" style={{ flexWrap: "nowrap", gap: 8 }}>
          <h4 className="ui-list-title ui-truncate">
            {chat.user?.name || "Misafir"}
          </h4>
          <span className="ui-text-xs ui-muted ui-num" style={{ flexShrink: 0 }}>
            {getTimeAgo(chat.lastMessageAt)}
          </span>
        </div>

        <div className="ui-between" style={{ flexWrap: "nowrap", gap: 8 }}>
          <div className="ui-grow">
            {isTyping ? (
              <span className="ui-text-xs" style={{ color: "var(--ui-brand)", fontWeight: 600 }}>
                Yazıyor...
              </span>
            ) : (
              <p className="ui-list-sub ui-truncate">
                {chat.lastMessage || "Sohbet başlatıldı"}
              </p>
            )}
          </div>
          
          {(chat.unreadCount > 0) && (
            <span className="chat-unread">
              {chat.unreadCount}
            </span>
          )}
        </div>
        
        {/* Tags / Badges */}
        {(chat.type === "order" || onlineInfo?.isOnline) && (
          <div className="ui-cluster" style={{ gap: 6, marginTop: 6 }}>
            {chat.type === "order" && (
              <span className="ui-badge">
                <Package2 /> Sipariş
              </span>
            )}
            {onlineInfo?.isOnline && (
              <span className="ui-badge ui-badge--info">
                {onlineInfo.platform === 'ios' ? 'iOS' : 'Android'} v{onlineInfo.appVersion}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Message Bubble
const MessageBubble = ({ message, isOwn }) => {
  return (
    <div className="chat-message" data-own={isOwn}>
      <div className="chat-bubble">
        {message.content}
      </div>
      
      <div className="chat-message-meta">
        <span>
          {new Date(message.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {isOwn && message.isRead && (
          <CheckCircle2 />
        )}
      </div>
    </div>
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
  const { user } = useUserStore();
  const accessToken = user?.accessToken;
  
  // Quick Reply State
  const [quickReplies, setQuickReplies] = useState(() => {
    const saved = localStorage.getItem("chatQuickReplies");
    return saved ? JSON.parse(saved) : defaultQuickReplies;
  });
  const [showQuickEditor, setShowQuickEditor] = useState(false);
  const [newTag, setNewTag] = useState("");

  const chatContainerRef = useRef(null);
  const shouldKeepAtBottomRef = useRef(false);

  const scrollMessagesToBottom = (behavior = "smooth") => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  const isNearMessageBottom = () => {
    const container = chatContainerRef.current;
    if (!container) return false;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 96;
  };

  // --- Logic ---
  const fetchChats = async () => {
    try {
      setIsLoading(true);
      const { data } = await axios.get(`/chat/list?status=${statusFilter}`);
      const nextChats = data.chats || [];
      setChats(nextChats);
      const requestedChatId = new URLSearchParams(window.location.search).get("chatId");
      if (requestedChatId) {
        const requested = nextChats.find((chat) => chat._id === requestedChatId);
        if (requested) { setSelectedChat(requested); setShowMobileChat(true); }
      }
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
      shouldKeepAtBottomRef.current = true;
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
    socket.emit("joinAdminRoom", { token: accessToken });

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
          shouldKeepAtBottomRef.current = isNearMessageBottom();
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
  }, [accessToken, selectedChat?._id]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat._id);
      socketService.getSocket().emit("joinChat", selectedChat._id);
      return () => socketService.getSocket().emit("leaveChat", selectedChat._id);
    }
  }, [selectedChat?._id]);

  useEffect(() => {
    if (!shouldKeepAtBottomRef.current) return;
    shouldKeepAtBottomRef.current = false;
    requestAnimationFrame(() => scrollMessagesToBottom());
  }, [messages]);

  // --- Render ---
  const filteredChats = chats.filter(c => 
    c.user?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="chat-layout" data-mobile-view={showMobileChat ? "chat" : "list"}>
      {/* --- LEFT SIDEBAR (Chat List) --- */}
      <div className="ui-card chat-sidebar">
        {/* Sidebar Header */}
        <div className="ui-card-body ui-stack ui-stack--sm" style={{ borderBottom: "1px solid var(--ui-line)" }}>
          <div className="ui-between">
            <h2 className="ui-title">Canlı Sohbet</h2>
            <button 
              onClick={fetchChats}
              className="ui-icon-btn"
              title="Yenile"
              aria-label="Sohbetleri yenile"
            >
              <RefreshCw />
            </button>
          </div>

          <div className="ui-search">
            <Search />
            <input 
              type="text" 
              placeholder="Sohbet veya müşteri ara..." 
              aria-label="Sohbet ara"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="ui-field"
            />
          </div>

          <div className="ui-segmented">
            {['active', 'closed'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                aria-pressed={statusFilter === status}
              >
                {status === 'active' ? 'Aktif Sohbetler' : 'Geçmiş'}
              </button>
            ))}
          </div>
        </div>

        {/* Chat List */}
        <div className="chat-list">
          {isLoading ? (
            <div className="ui-loading"><RefreshCw className="ui-spin" /></div>
          ) : filteredChats.length === 0 ? (
            <div className="ui-empty">
              <MessageCircle />
              <p>Sohbet bulunamadı</p>
            </div>
          ) : (
            filteredChats.map(chat => (
              <ChatListItem
                key={chat._id}
                chat={chat}
                isSelected={selectedChat?._id === chat._id}
                isTyping={typingUsers[chat._id]}
                onlineInfo={onlineUsers[chat._id]}
                onClick={() => { setSelectedChat(chat); setShowMobileChat(true); }}
              />
            ))
          )}
        </div>
      </div>

      {/* --- RIGHT PANEL (Chat Area) --- */}
      <div className="ui-card chat-panel">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="ui-card-header" style={{ flexWrap: "nowrap" }}>
              <div className="order-card-head">
                <button onClick={() => setShowMobileChat(false)} className="ui-icon-btn chat-back" aria-label="Sohbet listesine dön">
                  <ChevronLeft />
                </button>
                <Avatar name={selectedChat.user?.name} isOnline={onlineUsers[selectedChat._id]?.isOnline} />
                <div className="order-card-id">
                  <h3 className="ui-title ui-truncate">
                    {selectedChat.user?.name}
                  </h3>
                  <div className="ui-cluster" style={{ gap: "2px 12px" }}>
                    <span className="orders-meta">
                      <User /> <span>{selectedChat.user?.email || "Email yok"}</span>
                    </span>
                    {selectedChat.user?.phone && (
                      <span className="orders-meta">
                        <Phone /> <span>{selectedChat.user?.phone}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="ui-cluster" style={{ flexWrap: "nowrap", flexShrink: 0 }}>
                {selectedChat.type === "order" && (
                  <span className="ui-badge">
                    <Package2 />
                    Sipariş Sorusu
                  </span>
                )}
                {selectedChat.status === "active" && (
                  <button 
                    onClick={handleCloseChat}
                    className="ui-btn ui-btn--sm ui-btn--danger"
                  >
                    <X /> <span className="chat-hide-narrow">Sohbeti Kapat</span>
                  </button>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div
              className="chat-messages"
              ref={chatContainerRef}
              onScroll={() => {
                // Yönetici eski mesajları okurken yeni mesajlar ekranı zorla aşağı çekmez.
                shouldKeepAtBottomRef.current = isNearMessageBottom();
              }}
            >
              <div className="chat-day">
                <span className="ui-badge">
                  {new Date(selectedChat.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                </span>
              </div>
              
              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} isOwn={msg.sender === "admin"} />
              ))}
              
              {typingUsers[selectedChat._id] && (
                <div className="ui-text-xs ui-muted">Yazıyor...</div>
              )}
            </div>

            {/* Quick Replies & Input */}
            <div className="chat-composer">
              {/* Quick Replies Strip */}
              <div className="chat-quick">
                <button 
                  onClick={() => setShowQuickEditor(!showQuickEditor)}
                  aria-pressed={showQuickEditor}
                  className="ui-icon-btn"
                  title="Hızlı yanıtları düzenle"
                  aria-label="Hızlı yanıtları düzenle"
                >
                  {showQuickEditor ? <X /> : <Edit2 />}
                </button>
                
                {showQuickEditor ? (
                  <div className="ui-cluster ui-grow" style={{ flexWrap: "nowrap" }}>
                    <input 
                      autoFocus
                      placeholder="Yeni hızlı yanıt..."
                      aria-label="Yeni hızlı yanıt"
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
                      className="ui-field ui-field--sm"
                      style={{ maxWidth: 280 }}
                    />
                    <button onClick={() => {
                       setQuickReplies(defaultQuickReplies);
                       localStorage.setItem("chatQuickReplies", JSON.stringify(defaultQuickReplies));
                       toast.success("Sıfırlandı");
                    }} className="ui-btn ui-btn--ghost ui-btn--sm" style={{ marginLeft: "auto" }}>
                      Varsayılana Dön
                    </button>
                  </div>
                ) : (
                  quickReplies.map((reply, i) => (
                    <button
                      key={i}
                      onClick={() => setNewMessage(reply)}
                      className="ui-btn ui-btn--sm"
                      style={{ flexShrink: 0, fontWeight: 500 }}
                    >
                      {reply}
                    </button>
                  ))
                )}
              </div>

              {/* Input Bar */}
              <form onSubmit={handleSendMessage} className="order-detail-tracking" style={{ flexWrap: "nowrap" }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Bir mesaj yazın..."
                  aria-label="Mesaj"
                  className="ui-field"
                  style={{ minHeight: 42 }}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="ui-btn ui-btn--primary ui-btn--lg"
                  aria-label="Gönder"
                >
                  <Send />
                  <span className="chat-hide-narrow">Gönder</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="ui-empty" style={{ flex: 1 }}>
            <MessageCircle />
            <h3 className="ui-title">Hoş Geldiniz</h3>
            <p style={{ maxWidth: 280 }}>
              Mesajlaşmaya başlamak için sol menüden bir sohbet seçin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatTab;
