// Sohbet listesi: arama, filtre çipleri, satırlar (okunmamış rozeti, önizleme, zaman).
import { useEffect, useRef } from "react";
import { MessageSquare, Package2, RefreshCw, Search, Smartphone } from "lucide-react";
import { EmptyState, SkeletonRows } from "../admin/ui";
import { ChatAvatar, modeOf, senderPrefix, shortAgo } from "./chatShared";

const ChatRow = ({ chat, selected, cursor, typing, online, now, onSelect }) => {
  const ref = useRef(null);
  const mode = modeOf(chat);
  const ModeIcon = mode.icon;
  const unread = Number(chat.unreadCount) > 0;
  useEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  return (
    <button
      ref={ref}
      type="button"
      className="cht-row"
      data-selected={selected}
      data-cursor={cursor && !selected}
      data-unread={unread}
      data-chat-id={chat._id}
      onClick={() => onSelect(chat)}
      aria-current={selected ? "true" : undefined}
    >
      <ChatAvatar name={chat.user?.name} src={chat.user?.avatar} online={online?.isOnline} />
      <span className="cht-row-main">
        <span className="cht-row-top">
          <span className="cht-row-name">{chat.user?.name || "Misafir"}</span>
          <span className="cht-row-time" title={chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleString("tr-TR") : undefined}>
            {shortAgo(chat.lastMessageAt, now)}
          </span>
        </span>
        <span className="cht-row-bottom">
          <span className="cht-row-preview" data-typing={Boolean(typing)}>
            {typing ? "Yazıyor…" : (
              <>
                {chat.lastMessageSender && <span className="cht-row-preview-from">{senderPrefix(chat.lastMessageSender)}</span>}
                {chat.lastMessage || "Sohbet başlatıldı"}
              </>
            )}
          </span>
          {unread && <span className="cht-unread" aria-label={`${chat.unreadCount} okunmamış`}>{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</span>}
        </span>
        <span className="cht-row-tags">
          <span className={`ui-badge ${mode.badge}`}><ModeIcon /> {mode.short}</span>
          {chat.type === "order" && <span className="ui-badge"><Package2 /> Sipariş</span>}
          {online?.isOnline && (
            <span className="ui-badge ui-badge--ok">
              <Smartphone /> {online.platform === "ios" ? "iOS" : online.platform === "android" ? "Android" : "Uygulamada"}{online.appVersion ? ` v${online.appVersion}` : ""}
            </span>
          )}
        </span>
      </span>
    </button>
  );
};

export default function ChatList({
  chats, loading, error, onRetry, selectedId, cursorId, onSelect,
  search, onSearch, searchRef, filter, onFilter, filters, typingUsers, onlineUsers, now, totalCount, onRefresh, refreshing,
}) {
  const filtered = chats;
  return (
    <section className="cht-list" aria-label="Sohbet listesi">
      <div className="cht-list-head">
        <div className="ui-search">
          <Search />
          <input
            ref={searchRef}
            type="search"
            className="ui-field ui-field--sm"
            placeholder="Ad, e-posta, telefon ara…"
            aria-label="Sohbet ara"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            data-esc-clear="1"
          />
        </div>
        <div className="ui-chips" role="group" aria-label="Sohbet filtresi">
          {filters.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => onFilter(f.value)} title={f.title}>
              {f.label}
              {f.count !== undefined && <span className="ui-count">{f.count}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="cht-list-body">
        {loading ? (
          <SkeletonRows rows={8} height={64} />
        ) : error ? (
          <div className="ui-banner ui-banner--danger" role="alert" style={{ margin: 10, borderRadius: "var(--ui-radius)" }}>
            <span className="ui-grow">{error}</span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry}>Tekrar dene</button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            icon={MessageSquare}
            title={search || filter !== "all" ? "Eşleşen sohbet yok" : "Henüz sohbet yok"}
            description={search || filter !== "all" ? "Arama ya da filtreyi değiştirin." : "Müşteriler yazdığında burada görünür."}
            action={(search || filter !== "all") && (
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => { onSearch(""); onFilter("all"); }}>Filtreleri temizle</button>
            )}
          />
        ) : (
          filtered.map((chat) => (
            <ChatRow
              key={chat._id}
              chat={chat}
              selected={chat._id === selectedId}
              cursor={chat._id === cursorId}
              typing={typingUsers[chat._id]}
              online={onlineUsers[chat._id]}
              now={now}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
      <div className="cht-list-foot">
        <span>{loading ? "Yükleniyor…" : `${filtered.length} / ${totalCount} sohbet`}</span>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={onRefresh} aria-label="Listeyi yenile" title="Yenile" disabled={refreshing}>
          <RefreshCw className={refreshing ? "ui-spin" : ""} />
        </button>
      </div>
    </section>
  );
}
