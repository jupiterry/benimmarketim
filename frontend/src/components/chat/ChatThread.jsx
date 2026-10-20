// Orta sütun: sohbet başlığı, mesaj akışı (gün ayraçları, baloncuklar, görüldü), yazma alanı
// ve hızlı cevap şablonları (tarayıcıda saklanır, düzenlenebilir).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, Bot, Check, CheckCheck, ChevronLeft, Edit3, Headphones, Lock, Mail, MessageSquare,
  Paperclip, Phone, Plus, RotateCcw, Send, Trash2, UserRound, X, XCircle, UserCheck, Smartphone,
} from "lucide-react";
import { EmptyState, Skeleton, formatTime, money } from "../admin/ui";
import {
  ChatAvatar, DEFAULT_QUICK_REPLIES, MAX_MESSAGE_LENGTH, dayKey, dayLabel, modeOf,
} from "./chatShared";

// ── Mesaj baloncuğu ────────────────────────────────────────────────────
const SENDER_LABEL = { ai: "Yapay zekâ", admin: "Destek ekibi", user: "Müşteri" };
const SENDER_ICON = { ai: Bot, admin: Headphones, user: UserRound };

const CartProposal = ({ cart }) => (
  <span className="cht-cart">
    <span className="cht-cart-title">Sepet önerisi</span>
    {(cart.items || []).slice(0, 6).map((item, i) => (
      <span key={i} className="cht-cart-row">
        <span>{item.quantity ? `${item.quantity} × ` : ""}{item.name}</span>
        {item.price !== undefined && <span className="ui-num">{money(item.price)}</span>}
      </span>
    ))}
    {cart.total !== undefined && <span className="cht-cart-row"><b>Toplam</b><b className="ui-num">{money(cart.total)}</b></span>}
  </span>
);

const MessageBubble = ({ message, continued, chatName }) => {
  const from = message.type === "system" || message.sender === "system" ? "system" : message.sender;
  const Icon = SENDER_ICON[from];
  const own = from === "admin";
  const seen = own && message.isRead;
  return (
    <div className="cht-msg" data-from={from} data-cont={continued}>
      {!continued && from !== "system" && (
        <span className="cht-msg-from">
          {Icon && <Icon />}
          {from === "user" ? (chatName || SENDER_LABEL.user) : (message.senderName && from === "ai" ? SENDER_LABEL.ai : (message.senderName || SENDER_LABEL[from]))}
        </span>
      )}
      <div className="cht-bubble">
        {message.type === "image" && message.fileUrl ? (
          <a href={message.fileUrl} target="_blank" rel="noreferrer"><img className="cht-bubble-img" src={message.fileUrl} alt={message.fileName || "Görsel"} /></a>
        ) : message.type === "file" && message.fileUrl ? (
          <a className="cht-bubble-file" href={message.fileUrl} target="_blank" rel="noreferrer"><Paperclip />{message.fileName || "Dosya"}</a>
        ) : null}
        {message.content}
        {message.meta?.cartProposal && <CartProposal cart={message.meta.cartProposal} />}
      </div>
      {from !== "system" && (
        <span className="cht-msg-meta" data-seen={seen} title={seen && message.readAt ? `Görüldü ${formatTime(message.readAt)}` : undefined}>
          {formatTime(message.createdAt)}
          {own && (seen ? <CheckCheck aria-label="Görüldü" /> : <Check aria-label="İletildi" />)}
        </span>
      )}
    </div>
  );
};

// ── Hızlı cevap düzenleyici ────────────────────────────────────────────
const QuickReplyEditor = ({ replies, onChange, onClose }) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...replies, text]);
    setDraft("");
  };
  return (
    <div className="cht-quick-editor" role="group" aria-label="Hızlı cevap şablonları">
      <div className="cht-quick-editor-head">
        <span>Hızlı cevap şablonları · bu tarayıcıda saklanır</span>
        <span className="ui-cluster" style={{ gap: 4 }}>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => onChange(DEFAULT_QUICK_REPLIES)} title="Varsayılan şablonlara dön"><RotateCcw /> Varsayılana dön</button>
          <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={onClose} aria-label="Düzenlemeyi kapat"><X /></button>
        </span>
      </div>
      <div className="cht-quick-editor-list">
        {replies.map((reply, i) => (
          <div key={i} className="cht-quick-editor-row">
            <input
              className="ui-field ui-field--sm"
              value={reply}
              aria-label={`Şablon ${i + 1}`}
              onChange={(e) => onChange(replies.map((r, j) => (j === i ? e.target.value : r)))}
              onBlur={(e) => { if (!e.target.value.trim()) onChange(replies.filter((_, j) => j !== i)); }}
            />
            <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" onClick={() => onChange(replies.filter((_, j) => j !== i))} aria-label="Şablonu sil"><Trash2 /></button>
          </div>
        ))}
        {replies.length === 0 && <span className="ui-hint">Şablon yok. Aşağıdan ekleyin.</span>}
      </div>
      <div className="cht-quick-editor-add">
        <input
          className="ui-field ui-field--sm"
          placeholder="Yeni şablon… (Enter ekler)"
          aria-label="Yeni şablon"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <button type="button" className="ui-btn ui-btn--sm" onClick={add} disabled={!draft.trim()}><Plus /> Ekle</button>
      </div>
    </div>
  );
};

// ── Sohbet alanı ───────────────────────────────────────────────────────
export default function ChatThread({
  chat, messages, loading, error, onRetry, typing, online, onSend, sending,
  quickReplies, onQuickRepliesChange, onBack, onClose, onDelete, onTakeover, takeoverPending,
  onToggleCustomer, now, composerRef, onTyping,
}) {
  const [text, setText] = useState("");
  const [editingQuick, setEditingQuick] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef(null);
  const localRef = useRef(null);
  const inputRef = composerRef || localRef;
  const stickRef = useRef(true);

  // Sohbet değişince taslak sıfırlanır ve akış en alta iner
  useEffect(() => {
    setText("");
    setEditingQuick(false);
    stickRef.current = true;
  }, [chat?._id]);

  const nearBottom = () => {
    const el = listRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };
  const scrollToBottom = (behavior = "auto") => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };
  // Yeni mesaj: yönetici en alttaysa takip eder; eski mesajları okuyorsa "Yeni mesaj" düğmesi çıkar
  useLayoutEffect(() => {
    if (loading) return;
    if (stickRef.current) { scrollToBottom(); setShowJump(false); } else setShowJump(true);
  }, [messages, loading]);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  useEffect(autoGrow, [text, inputRef]);

  const submit = async () => {
    const content = text.trim();
    if (!content || sending || content.length > MAX_MESSAGE_LENGTH) return;
    stickRef.current = true;
    const ok = await onSend(content);
    if (ok) setText("");
    else setText((t) => t || content);
    inputRef.current?.focus();
  };
  const insertQuick = (reply) => {
    setText((t) => (t.trim() ? `${t.replace(/\s+$/, "")} ${reply}` : reply));
    inputRef.current?.focus();
  };

  const grouped = useMemo(() => {
    const out = [];
    let lastDay = null;
    let prev = null;
    for (const m of messages) {
      const key = dayKey(m.createdAt);
      if (key !== lastDay) { out.push({ kind: "day", key, label: dayLabel(m.createdAt, new Date(now)) }); lastDay = key; prev = null; }
      const sameSender = prev && prev.sender === m.sender && prev.type !== "system" && m.type !== "system"
        && new Date(m.createdAt) - new Date(prev.createdAt) < 3 * 60 * 1000;
      out.push({ kind: "msg", message: m, continued: Boolean(sameSender) });
      prev = m;
    }
    return out;
  }, [messages, now]);

  if (!chat) {
    return (
      <section className="cht-thread" aria-label="Sohbet">
        <EmptyState
          className="cht-thread-empty"
          icon={MessageSquare}
          title="Bir sohbet seçin"
          description="Soldaki listeden bir müşteri seçin; j / k ile gezinip Enter ile açabilirsiniz."
        />
      </section>
    );
  }

  const mode = modeOf(chat);
  const ModeIcon = mode.icon;
  const closed = chat.status === "closed";
  const waiting = chat.mode === "WAITING_FOR_AGENT" && !closed;
  const over = text.length > MAX_MESSAGE_LENGTH;
  const user = chat.user || {};

  return (
    <section className="cht-thread" aria-label={`${user.name || "Müşteri"} ile sohbet`}>
      <header className="cht-thread-head">
        <button type="button" className="ui-icon-btn cht-back" onClick={onBack} aria-label="Sohbet listesine dön"><ChevronLeft /></button>
        <div className="cht-thread-who">
          <ChatAvatar name={user.name} online={online?.isOnline} />
          <div className="cht-thread-title">
            <h2>{user.name || "Misafir"}</h2>
            <div className="cht-thread-sub">
              {user.email && <span><Mail /> {user.email}</span>}
              {user.phone && <span><Phone /> {user.phone}</span>}
              {online?.isOnline && <span><Smartphone /> Uygulamada{online.platform ? ` · ${online.platform === "ios" ? "iOS" : "Android"}` : ""}</span>}
            </div>
          </div>
        </div>
        <div className="cht-thread-actions">
          <span className={`ui-badge ${mode.badge} cht-mode`} title={mode.label}><ModeIcon /> <span className="cht-hide-narrow">{mode.label}</span></span>
          {waiting && onTakeover && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onTakeover} disabled={takeoverPending}>
              <UserCheck /> <span className="cht-hide-narrow">Üstlen</span>
            </button>
          )}
          <button type="button" className="ui-icon-btn cht-customer-toggle" onClick={onToggleCustomer} aria-label="Müşteri kartını aç" title="Müşteri kartı"><UserRound /></button>
          {!closed && (
            <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Sohbeti kapat" title="Sohbeti kapat"><XCircle /></button>
          )}
          <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={onDelete} aria-label="Sohbeti sil" title="Sohbeti sil (arşivle)"><Trash2 /></button>
        </div>
      </header>

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry}>Tekrar dene</button>
        </div>
      )}

      <div
        className="cht-messages"
        ref={listRef}
        onScroll={() => { stickRef.current = nearBottom(); if (stickRef.current) setShowJump(false); }}
        aria-live="polite"
      >
        {loading ? (
          <>
            <Skeleton width={120} height={12} radius={999} style={{ margin: "6px auto 10px" }} />
            {[62, 44, 70, 38, 56].map((w, i) => (
              <Skeleton key={i} width={`${w}%`} height={44} radius={14} style={{ marginTop: 8, marginLeft: i % 2 ? "auto" : 0 }} />
            ))}
          </>
        ) : (
          <>
            {grouped.length === 0 && <EmptyState compact icon={MessageSquare} title="Henüz mesaj yok" description="İlk mesajı siz yazabilirsiniz." />}
            {grouped.map((item) => item.kind === "day"
              ? <div key={`d-${item.key}`} className="cht-day" role="separator">{item.label}</div>
              : <MessageBubble key={item.message._id || `${item.message.createdAt}-${item.message.content?.slice(0, 8)}`} message={item.message} continued={item.continued} chatName={user.name} />)}
            {typing && <span className="cht-typing" aria-label="Müşteri yazıyor"><i /><i /><i /> yazıyor</span>}
            <div className="cht-messages-end" />
            {showJump && (
              <button type="button" className="ui-btn ui-btn--sm cht-jump" onClick={() => { stickRef.current = true; scrollToBottom("smooth"); setShowJump(false); }}>
                <ArrowDown /> Yeni mesajlar
              </button>
            )}
          </>
        )}
      </div>

      {closed ? (
        <div className="cht-composer-closed"><Lock /> Bu sohbet kapatıldı; mesaj gönderilemez.</div>
      ) : (
        <div className="cht-composer">
          {editingQuick ? (
            <QuickReplyEditor replies={quickReplies} onChange={onQuickRepliesChange} onClose={() => setEditingQuick(false)} />
          ) : (
            <div className="cht-quick">
              <div className="cht-quick-scroll" role="group" aria-label="Hızlı cevaplar">
                {quickReplies.map((reply, i) => (
                  <button key={i} type="button" className="cht-quick-chip" onClick={() => insertQuick(reply)} title={reply}>
                    {i < 9 && <kbd>{i + 1}</kbd>}
                    <span className="ui-truncate" style={{ maxWidth: 220 }}>{reply}</span>
                  </button>
                ))}
                {quickReplies.length === 0 && <span className="ui-hint">Hızlı cevap yok.</span>}
              </div>
              <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => setEditingQuick(true)} aria-label="Hızlı cevapları düzenle" title="Hızlı cevapları düzenle"><Edit3 /></button>
            </div>
          )}
          <div className="cht-input-row">
            <textarea
              ref={inputRef}
              className="cht-input"
              rows={1}
              placeholder={waiting ? "Yazdığınızda görüşmeyi üstlenirsiniz…" : "Mesaj yazın… (Enter gönderir, Shift+Enter yeni satır)"}
              aria-label="Mesaj"
              value={text}
              onChange={(e) => { setText(e.target.value); onTyping?.(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                if (e.altKey && /^[1-9]$/.test(e.key) && quickReplies[Number(e.key) - 1]) { e.preventDefault(); insertQuick(quickReplies[Number(e.key) - 1]); }
              }}
              data-esc-clear="1"
            />
            <button type="button" className="ui-btn ui-btn--primary cht-send" onClick={submit} disabled={!text.trim() || sending || over} aria-label="Gönder">
              <Send /> <span>Gönder</span>
            </button>
          </div>
          <div className="cht-composer-foot" data-over={over}>
            <span className="cht-hint-keys"><kbd>Enter</kbd> gönder · <kbd>Shift</kbd>+<kbd>Enter</kbd> satır · <kbd>Alt</kbd>+<kbd>1-9</kbd> hızlı cevap</span>
            <span className="cht-count ui-num">{text.length} / {MAX_MESSAGE_LENGTH}</span>
          </div>
        </div>
      )}
    </section>
  );
}
