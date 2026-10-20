/* eslint-disable react-refresh/only-export-components */
// Sağ sütun: müşteri kartı — iletişim, sipariş özeti, bağlı destek talebi ve diğer ekranlara geçiş.
import { CalendarDays, Clock, Mail, Package2, Phone, ShoppingBag, UserRound, UserCheck, ExternalLink } from "lucide-react";
import { Skeleton, formatDate, formatDateTime, money, timeAgo, HANDOFF, setHandoff } from "../admin/ui";
import { ChatAvatar, PRIORITIES, REQUEST_STATUS, modeOf } from "./chatShared";

const ORDER_BADGE = { "Hazırlanıyor": "ui-badge--warn", "Yolda": "ui-badge--info", "Teslim Edildi": "ui-badge--ok", "İptal Edildi": "ui-badge--danger" };

/** Diğer ekrana geçiş: kayıt kimliği sessionStorage ile aktarılır, AdminPage "admin-navigate" olayını dinler */
export const navigateTo = (tab, key, value) => {
  if (key && value) setHandoff(key, value);
  window.dispatchEvent(new CustomEvent("admin-navigate", { detail: tab }));
};

export default function CustomerCard({ chat, context, loading, error, onRetry, online, now, onTakeover, takeoverPending }) {
  if (!chat) {
    return (
      <aside className="cht-customer" aria-label="Müşteri kartı">
        <div className="cht-customer-head"><span>Müşteri</span></div>
        <div className="cht-customer-body">
          <span className="ui-hint">Sohbet seçildiğinde müşteri bilgileri burada görünür.</span>
        </div>
      </aside>
    );
  }
  const user = context?.customer || chat.user || {};
  const userId = user._id || chat.user?._id || chat.user;
  const lastOrder = context?.lastOrder || (chat.order && typeof chat.order === "object" ? chat.order : null);
  const request = context?.supportRequest;
  const mode = modeOf(chat);
  const ModeIcon = mode.icon;
  const waiting = chat.mode === "WAITING_FOR_AGENT" && chat.status !== "closed";

  return (
    <aside className="cht-customer" aria-label="Müşteri kartı">
      <div className="cht-customer-head">
        <span>Müşteri</span>
        <span className={`ui-badge ${mode.badge}`}><ModeIcon /> {mode.short}</span>
      </div>
      <div className="cht-customer-body">
        <div className="cht-customer-id">
          <ChatAvatar name={user.name} online={online?.isOnline} size="lg" />
          <h3>{user.name || "Misafir"}</h3>
          {user.createdAt && <span className="ui-muted">Üye: {formatDate(user.createdAt, { year: "numeric" })}</span>}
          {online?.isOnline ? <span className="ui-badge ui-badge--ok">Şu an uygulamada</span>
            : user.lastActive && <span className="ui-muted">Son görülme {timeAgo(user.lastActive, now)}</span>}
        </div>

        {error ? (
          <div className="ui-banner ui-banner--danger" role="alert" style={{ borderRadius: "var(--ui-radius)" }}>
            <span className="ui-grow">{error}</span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry}>Tekrar dene</button>
          </div>
        ) : null}

        <div className="cht-section">
          <span className="cht-section-title">İletişim</span>
          <span className="cht-kv"><Mail /> {user.email ? <a href={`mailto:${user.email}`}>{user.email}</a> : <span className="ui-muted">E-posta yok</span>}</span>
          <span className="cht-kv"><Phone /> {user.phone ? <a href={`tel:${user.phone}`}>{user.phone}</a> : <span className="ui-muted">Telefon yok</span>}</span>
          <span className="cht-kv"><CalendarDays /> Sohbet {formatDateTime(chat.createdAt)}</span>
          {chat.assignedAgent?.name && <span className="cht-kv"><UserCheck /> Görevli: {chat.assignedAgent.name}</span>}
        </div>

        <div className="cht-section">
          <span className="cht-section-title">Siparişler</span>
          {loading ? (
            <>
              <Skeleton height={48} radius={8} />
              <Skeleton height={64} radius={8} />
            </>
          ) : (
            <>
              {context && (
                <div className="cht-customer-stats">
                  <span className="cht-stat"><b className="ui-num">{context.orderCount ?? 0}</b><span>toplam sipariş</span></span>
                  <span className="cht-stat"><b className="ui-num">{lastOrder ? money(lastOrder.totalAmount) : "—"}</b><span>son sipariş</span></span>
                </div>
              )}
              {lastOrder ? (
                <div className="cht-order">
                  <div className="cht-order-top">
                    <span className="cht-order-amount">{money(lastOrder.totalAmount)}</span>
                    <span className={`ui-badge ${ORDER_BADGE[lastOrder.status] || ""}`}>{lastOrder.status || "Sipariş"}</span>
                  </div>
                  <span className="cht-order-sub">
                    {formatDateTime(lastOrder.createdAt)}
                    {lastOrder.productCount ? ` · ${lastOrder.productCount} ürün` : ""}
                    {chat.type === "order" && chat.order && (chat.order._id || chat.order) === (lastOrder._id) ? " · bu sohbetin konusu" : ""}
                  </span>
                </div>
              ) : (
                <span className="ui-hint">{context ? "Henüz sipariş vermemiş." : "Sipariş bilgisi yüklenemedi."}</span>
              )}
            </>
          )}
        </div>

        {(request || waiting) && (
          <div className="cht-section">
            <span className="cht-section-title">Destek talebi</span>
            {request ? (
              <div className="cht-support" data-status={request.status}>
                <span className="ui-cluster" style={{ gap: 6 }}>
                  <span className={`ui-badge ${(REQUEST_STATUS[request.status] || {}).badge || ""}`}>{(REQUEST_STATUS[request.status] || {}).label || request.status}</span>
                  <span className={`ui-badge ${(PRIORITIES[request.priority] || {}).badge || ""}`}>{(PRIORITIES[request.priority] || {}).label || request.priority}</span>
                </span>
                {request.reason && <b>{request.reason}</b>}
                {request.aiSummary && <p>{request.aiSummary}</p>}
                <p><Clock style={{ width: 12, height: 12, verticalAlign: "-2px" }} /> Açıldı {timeAgo(request.createdAt, now)}{request.assignedTo?.name ? ` · ${request.assignedTo.name} üstlendi` : ""}</p>
              </div>
            ) : (
              <span className="ui-hint">Müşteri temsilci bekliyor.</span>
            )}
            {waiting && onTakeover && (
              <button type="button" className="ui-btn ui-btn--primary ui-btn--block" onClick={onTakeover} disabled={takeoverPending}>
                <UserCheck /> Görüşmeyi üstlen
              </button>
            )}
          </div>
        )}

      </div>
        <div className="cht-customer-foot">
          <button type="button" className="ui-btn ui-btn--block" onClick={() => navigateTo("orders", HANDOFF.order, user.name || user.email)} disabled={!userId}>
            <ShoppingBag /> Siparişlerini aç <ExternalLink style={{ marginLeft: "auto" }} />
          </button>
          <button type="button" className="ui-btn ui-btn--block" onClick={() => navigateTo("users", HANDOFF.user, userId)} disabled={!userId}>
            <UserRound /> Profili aç <ExternalLink style={{ marginLeft: "auto" }} />
          </button>
          {chat.type === "order" && <span className="ui-hint" style={{ textAlign: "center" }}><Package2 style={{ width: 12, height: 12, verticalAlign: "-2px" }} /> Sipariş hakkında sohbet</span>}
        </div>
    </aside>
  );
}
