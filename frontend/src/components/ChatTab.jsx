// Mesajlar: üç sütun (sohbet listesi · sohbet · müşteri kartı). Gerçek zamanlı olaylar lib/socket.js
// üzerinden gelir; URL'deki ?chatId= ile doğrudan bir sohbet açılır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import socketService from "../lib/socket.js";
import { useUserStore } from "../stores/useUserStore";
import { useConfirm } from "./ConfirmModal";
import {
  Drawer, PageHeader, ShortcutHelp, fold, undoable, useDebounced, useListShortcuts, useMediaQuery, useNow, usePref,
} from "./admin/ui";
import ChatList from "./chat/ChatList";
import ChatThread from "./chat/ChatThread";
import CustomerCard from "./chat/CustomerCard";
import { DEFAULT_QUICK_REPLIES, QUICK_REPLIES_PREF } from "./chat/chatShared";
import "../styles/chat.css";

const FILTERS = [
  { value: "all", label: "Tümü", title: "Açık sohbetlerin tümü" },
  { value: "unread", label: "Okunmamış", title: "Yanıt bekleyen mesajı olanlar" },
  { value: "ai", label: "Yapay zekâ devrede", title: "Asistanın yanıtladığı sohbetler" },
  { value: "human", label: "İnsana aktarıldı", title: "Temsilci bekleyen ya da temsilciyle süren sohbetler" },
  { value: "closed", label: "Kapalı", title: "Kapatılmış sohbetler" },
];
const isHuman = (chat) => chat.mode === "HUMAN" || chat.mode === "WAITING_FOR_AGENT";
const requestedChatId = () => new URLSearchParams(window.location.search).get("chatId");

export default function ChatTab() {
  const { user } = useUserStore();
  const accessToken = user?.accessToken;
  const confirm = useConfirm();
  const now = useNow(30000);
  const narrow = useMediaQuery("(max-width: 1100px)");
  const mobile = useMediaQuery("(max-width: 760px)");

  // ── Liste ────────────────────────────────────────────────────────────
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 200);
  const status = filter === "closed" ? "closed" : "active";
  const [refreshing, setRefreshing] = useState(false);

  // ── Seçili sohbet ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);
  const selectedId = selected?._id || null;
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState(null);
  const [takeoverPending, setTakeoverPending] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({});
  const [view, setView] = useState("list"); // mobil: list | chat
  const [customerOpen, setCustomerOpen] = useState(false);
  const [quickReplies, setQuickReplies] = usePref(QUICK_REPLIES_PREF, DEFAULT_QUICK_REPLIES);
  const searchRef = useRef(null);
  const composerRef = useRef(null);
  const pendingOpenRef = useRef(requestedChatId());

  const patchChat = useCallback((chatId, patch) => {
    setChats((prev) => prev.map((c) => (c._id === chatId ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)));
    setSelected((prev) => (prev && prev._id === chatId ? { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) } : prev));
  }, []);

  const loadChats = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true); else setChatsLoading(true);
      setChatsError(null);
      const { data } = await axios.get(`/chat/list?status=${status}`);
      setChats(data.chats || []);
    } catch (error) {
      setChatsError(error.response?.data?.message || "Sohbetler yüklenemedi");
    } finally {
      setChatsLoading(false);
      setRefreshing(false);
    }
  }, [status]);
  useEffect(() => { loadChats(); }, [loadChats]);

  // ── Sohbeti aç ───────────────────────────────────────────────────────
  const openChat = useCallback((chat) => {
    if (!chat) return;
    setSelected(chat);
    setView("chat");
    setCustomerOpen(false);
  }, []);

  /** Listede olmayan (ör. kapalı) bir sohbeti kimlikle açar: mesaj ucu sohbeti, bağlam ucu müşteriyi verir */
  const openChatById = useCallback(async (chatId) => {
    const inList = chats.find((c) => c._id === chatId);
    if (inList) { openChat(inList); return; }
    try {
      const [{ data: detail }, { data: ctx }] = await Promise.all([axios.get(`/chat/${chatId}`), axios.get(`/chat/${chatId}/context`)]);
      if (!detail.chat) throw new Error("Sohbet bulunamadı");
      const chat = { ...detail.chat, user: ctx.customer || detail.chat.user };
      setChats((prev) => (prev.some((c) => c._id === chat._id) ? prev : [chat, ...prev]));
      openChat(chat);
    } catch (error) {
      toast.error(error.response?.data?.message || "Sohbet açılamadı");
    }
  }, [chats, openChat]);

  // URL'deki chatId (bildirimden ya da destek kuyruğundan gelen) liste yüklenince açılır
  useEffect(() => {
    if (chatsLoading || !pendingOpenRef.current) return;
    const id = pendingOpenRef.current;
    pendingOpenRef.current = null;
    openChatById(id);
  }, [chatsLoading, openChatById]);
  useEffect(() => {
    const onPop = () => { const id = requestedChatId(); if (id && id !== selectedRef.current) openChatById(id); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openChatById]);

  const loadMessages = useCallback(async (chatId) => {
    try {
      setMessagesLoading(true);
      setMessagesError(null);
      const { data } = await axios.get(`/chat/${chatId}`);
      setMessages(data.messages || []);
      await axios.put(`/chat/${chatId}/read`).catch(() => {});
      patchChat(chatId, { unreadCount: 0 });
    } catch (error) {
      setMessagesError(error.response?.data?.message || "Mesajlar alınamadı");
    } finally {
      setMessagesLoading(false);
    }
  }, [patchChat]);

  const loadContext = useCallback(async (chatId) => {
    try {
      setContextLoading(true);
      setContextError(null);
      const { data } = await axios.get(`/chat/${chatId}/context`);
      setContext(data);
    } catch (error) {
      setContext(null);
      setContextError(error.response?.data?.message || "Müşteri bilgisi alınamadı");
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); setContext(null); return undefined; }
    setMessages([]);
    setContext(null);
    loadMessages(selectedId);
    loadContext(selectedId);
    socketService.joinChat(selectedId);
    return () => socketService.leaveChat(selectedId);
  }, [selectedId, loadMessages, loadContext]);

  // ── Soket ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketService.connect();
    socketService.joinAdminRoom(accessToken);
    const isCurrent = (chatId) => String(chatId) === String(selectedRef.current);
    const handlers = {
      newChat: ({ chat }) => {
        if (!chat) return;
        setChats((prev) => (prev.some((c) => c._id === chat._id) ? prev : [chat, ...prev]));
        toast(`Yeni sohbet: ${chat.user?.name || "Müşteri"}`, { icon: "💬" });
      },
      chatUpdate: ({ chatId, lastMessage, unreadCount }) => {
        const current = isCurrent(chatId);
        setChats((prev) => {
          const found = prev.find((c) => c._id === chatId);
          if (!found) return prev;
          const next = { ...found, lastMessage, lastMessageSender: "user", lastMessageAt: new Date().toISOString(), unreadCount: current ? 0 : unreadCount };
          return [next, ...prev.filter((c) => c._id !== chatId)];
        });
        if (current) axios.put(`/chat/${chatId}/read`).catch(() => {});
      },
      newMessage: ({ chatId, message }) => {
        if (!isCurrent(chatId) || !message) return;
        setMessages((prev) => (message._id && prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
        setTypingUsers((prev) => ({ ...prev, [chatId]: false }));
      },
      messagesRead: ({ chatId, readBy }) => {
        if (readBy !== "user" || !isCurrent(chatId)) return;
        setMessages((prev) => prev.map((m) => (m.sender === "admin" && !m.isRead ? { ...m, isRead: true, readAt: new Date().toISOString() } : m)));
      },
      chatClosed: ({ chatId }) => patchChat(chatId, { status: "closed", mode: "CLOSED" }),
      userTyping: ({ chatId, sender }) => { if (sender !== "admin") setTypingUsers((prev) => ({ ...prev, [chatId]: true })); },
      userStopTyping: ({ chatId }) => setTypingUsers((prev) => ({ ...prev, [chatId]: false })),
      userInChat: (data) => setOnlineUsers((prev) => ({ ...prev, [data.chatId]: { ...data, isOnline: true } })),
      userLeftChat: ({ chatId }) => setOnlineUsers((prev) => ({ ...prev, [chatId]: { isOnline: false } })),
      SupportRequestCreated: ({ conversationId }) => { if (conversationId) { patchChat(conversationId, { mode: "WAITING_FOR_AGENT" }); if (isCurrent(conversationId)) loadContext(conversationId); } },
      SupportRequestAccepted: ({ conversationId, agentId, agentName }) => {
        if (!conversationId) return;
        patchChat(conversationId, { mode: "HUMAN", assignedAgent: { _id: agentId, name: agentName } });
        if (isCurrent(conversationId)) loadContext(conversationId);
      },
      SupportRequestClosed: ({ conversationId }) => { if (conversationId) { patchChat(conversationId, { status: "closed", mode: "CLOSED" }); if (isCurrent(conversationId)) loadContext(conversationId); } },
    };
    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
  }, [accessToken, patchChat, loadContext]);

  // Yönetici yazarken müşteriye "yazıyor" gider (en çok 2 sn'de bir)
  const typingRef = useRef({ last: 0, timer: null });
  const notifyTyping = useCallback(() => {
    const chatId = selectedRef.current;
    if (!chatId) return;
    const t = typingRef.current;
    const nowMs = Date.now();
    if (nowMs - t.last > 2000) { socketService.emit("typing", { chatId, sender: "admin" }); t.last = nowMs; }
    clearTimeout(t.timer);
    t.timer = setTimeout(() => { socketService.emit("stopTyping", { chatId, sender: "admin" }); t.last = 0; }, 2500);
  }, []);

  // ── Eylemler ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    const chat = selected;
    if (!chat) return false;
    try {
      setSending(true);
      const { data } = await axios.post(`/chat/${chat._id}/send`, { content, type: "text" });
      // Yapay zekâ ile süren sohbete yazınca görüşme üstlenilir; "katıldı" notu da gelir. Soketten de gelebileceği için tekrar eklenmez.
      const added = [data.systemMessage, data.message].filter(Boolean);
      setMessages((prev) => [...prev, ...added.filter((m) => !prev.some((p) => p._id === m._id))]);
      const patch = { lastMessage: content, lastMessageSender: "admin", lastMessageAt: new Date().toISOString(), ...(data.chatMode ? { mode: data.chatMode } : {}) };
      if (data.chatMode === "HUMAN" && chat.mode !== "HUMAN") patch.assignedAgent = { _id: user?._id, name: user?.name };
      patchChat(chat._id, patch);
      if (data.chatMode && data.chatMode !== chat.mode) loadContext(chat._id);
      clearTimeout(typingRef.current.timer);
      socketService.emit("stopTyping", { chatId: chat._id, sender: "admin" });
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Mesaj gönderilemedi");
      if (error.response?.status === 409) loadContext(chat._id);
      return false;
    } finally {
      setSending(false);
    }
  }, [selected, patchChat, loadContext, user]);

  const closeChat = useCallback(async () => {
    if (!selected) return;
    const ok = await confirm({ title: "Sohbeti kapat", message: `${selected.user?.name || "Müşteri"} ile sohbet kapatılacak; müşteri yeni bir sohbet başlatabilir.`, confirmText: "Kapat", cancelText: "Vazgeç", type: "warning" });
    if (!ok) return;
    try {
      await axios.put(`/chat/${selected._id}/close`);
      patchChat(selected._id, { status: "closed", mode: "CLOSED" });
      toast.success("Sohbet kapatıldı");
      loadContext(selected._id);
    } catch (error) {
      toast.error(error.response?.data?.message || "Sohbet kapatılamadı");
    }
  }, [selected, confirm, patchChat, loadContext]);

  const deleteChat = useCallback(() => {
    const chat = selected;
    if (!chat) return;
    const index = chats.findIndex((c) => c._id === chat._id);
    setChats((prev) => prev.filter((c) => c._id !== chat._id));
    setSelected(null);
    setView("list");
    undoable({
      message: `${chat.user?.name || "Sohbet"} silindi`,
      icon: <Trash2 />,
      commit: async () => {
        try { await axios.delete(`/chat/${chat._id}`); } catch (error) {
          toast.error(error.response?.data?.message || "Sohbet silinemedi");
          setChats((prev) => (prev.some((c) => c._id === chat._id) ? prev : [...prev.slice(0, index), chat, ...prev.slice(index)]));
        }
      },
      undo: () => { setChats((prev) => (prev.some((c) => c._id === chat._id) ? prev : [...prev.slice(0, index), chat, ...prev.slice(index)])); setSelected(chat); },
    });
  }, [selected, chats]);

  const takeover = useCallback(async () => {
    const chat = selected;
    if (!chat) return;
    const requestId = context?.supportRequest?.status === "waiting" ? context.supportRequest._id : null;
    if (!requestId) { toast("Destek talebi bulunamadı; mesaj yazarak da üstlenebilirsiniz.", { icon: "ℹ️" }); return; }
    try {
      setTakeoverPending(true);
      const { data } = await axios.post(`/support-requests/${requestId}/accept`);
      patchChat(chat._id, { mode: "HUMAN", assignedAgent: data.chat?.assignedAgent ? { _id: data.chat.assignedAgent, name: user?.name } : { _id: user?._id, name: user?.name } });
      toast.success("Görüşme size atandı");
      loadContext(chat._id);
      composerRef.current?.focus();
    } catch (error) {
      toast.error(error.response?.data?.message || "Görüşme üstlenilemedi");
      loadContext(chat._id);
    } finally {
      setTakeoverPending(false);
    }
  }, [selected, context, patchChat, loadContext, user]);

  // ── Süzme ────────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all: chats.length,
    unread: chats.filter((c) => Number(c.unreadCount) > 0).length,
    ai: chats.filter((c) => c.mode === "AI").length,
    human: chats.filter(isHuman).length,
  }), [chats]);
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return chats.filter((c) => {
      if (filter === "unread" && !(Number(c.unreadCount) > 0)) return false;
      if (filter === "ai" && c.mode !== "AI") return false;
      if (filter === "human" && !isHuman(c)) return false;
      if (!q) return true;
      return [c.user?.name, c.user?.email, c.user?.phone, c.lastMessage].some((v) => fold(v).includes(q));
    });
  }, [chats, filter, query]);
  const filters = useMemo(() => FILTERS.map((f) => ({ ...f, count: status === "active" && f.value !== "closed" ? counts[f.value] : undefined })), [counts, status]);
  const totalUnread = counts.unread;

  // ── Klavye ───────────────────────────────────────────────────────────
  const move = useCallback((delta) => {
    if (!filtered.length) return;
    const index = filtered.findIndex((c) => c._id === selectedId);
    const next = index < 0 ? (delta > 0 ? 0 : filtered.length - 1) : Math.min(filtered.length - 1, Math.max(0, index + delta));
    openChat(filtered[next]);
  }, [filtered, selectedId, openChat]);
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move,
    open: () => { if (selected) composerRef.current?.focus(); },
    escape: () => { if (customerOpen) setCustomerOpen(false); else if (mobile && view === "chat") setView("list"); else setSelected(null); },
    searchEscape: (e) => { if (e.target === searchRef.current) { setSearch(""); e.target.blur(); } else if (e.target === composerRef.current) e.target.blur(); },
    extra: { r: () => loadChats({ silent: true }) },
  });

  const customerCard = (
    <CustomerCard
      chat={selected}
      context={context}
      loading={contextLoading}
      error={contextError}
      onRetry={() => selectedId && loadContext(selectedId)}
      online={selectedId ? onlineUsers[selectedId] : null}
      now={now}
      onTakeover={takeover}
      takeoverPending={takeoverPending}
    />
  );

  return (
    <div className="ui-page cht">
      <PageHeader
        title="Mesajlar"
        description="Müşteri sohbetleri; yapay zekâ devredeyken yazdığınız an görüşmeyi üstlenirsiniz."
        meta={totalUnread > 0 ? `${totalUnread} okunmamış` : undefined}
        actions={(
          <>
            <button type="button" className="ui-icon-btn" onClick={() => setHelpOpen(true)} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)"><Keyboard /></button>
            <button type="button" className="ui-btn" onClick={() => loadChats({ silent: true })} disabled={refreshing}>
              <RefreshCw className={refreshing ? "ui-spin" : ""} /> Yenile
            </button>
          </>
        )}
      />

      <div className="cht-layout" data-view={view}>
        <ChatList
          chats={filtered}
          totalCount={chats.length}
          loading={chatsLoading}
          error={chatsError}
          onRetry={() => loadChats()}
          selectedId={selectedId}
          cursorId={null}
          onSelect={openChat}
          search={search}
          onSearch={setSearch}
          searchRef={searchRef}
          filter={filter}
          onFilter={setFilter}
          filters={filters}
          typingUsers={typingUsers}
          onlineUsers={onlineUsers}
          now={now}
          onRefresh={() => loadChats({ silent: true })}
          refreshing={refreshing}
        />
        <ChatThread
          chat={selected}
          messages={messages}
          loading={messagesLoading}
          error={messagesError}
          onRetry={() => selectedId && loadMessages(selectedId)}
          typing={selectedId ? typingUsers[selectedId] : false}
          online={selectedId ? onlineUsers[selectedId] : null}
          onSend={sendMessage}
          onTyping={notifyTyping}
          sending={sending}
          quickReplies={quickReplies}
          onQuickRepliesChange={setQuickReplies}
          onBack={() => setView("list")}
          onClose={closeChat}
          onDelete={deleteChat}
          onTakeover={takeover}
          takeoverPending={takeoverPending}
          onToggleCustomer={() => setCustomerOpen((v) => !v)}
          now={now}
          composerRef={composerRef}
        />
        {!narrow && customerCard}
      </div>

      <div className="cht-kbd-hint">
        <span><kbd>/</kbd> ara</span>
        <span><kbd>j</kbd><kbd>k</kbd> sohbet gez</span>
        <span><kbd>↵</kbd> yazma alanına git</span>
        <span><kbd>Esc</kbd> geri</span>
        <span><kbd>r</kbd> yenile</span>
        <span><kbd>?</kbd> yardım</span>
      </div>

      {narrow && customerOpen && selected && (
        <Drawer title="Müşteri" subtitle={selected.user?.name} icon={MessageSquare} width={380} onClose={() => setCustomerOpen(false)} bodyClassName="cht-drawer-body">
          {customerCard}
        </Drawer>
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={[[["r"], "Listeyi yenile"], [["Alt", "1-9"], "Hızlı cevabı ekle (yazarken)"], [["Shift", "↵"], "Yeni satır (yazarken)"]]} />
    </div>
  );
}
