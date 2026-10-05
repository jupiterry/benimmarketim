import { useState, useEffect, useRef } from "react";
import {
  Search,
  Bell,
  Menu,
  RefreshCw,
  ArrowUpRight,
  Settings,
  LogOut,
  ShoppingBag,
  Headphones,
  MessageCircle,
  X,
  Plus,
  CalendarDays,
  ChevronDown,
} from "lucide-react";
import { useUserStore } from "../../stores/useUserStore";

export default function AdminHeader({
  pageTitle,
  onMenuClick,
  onSearchClick,
  onRefresh,
  refreshing,
  notifications = [],
  onViewNotifications,
  onClearNotifications,
  onNavigate,
  user,
  lastSync,
}) {
  const [panel, setPanel] = useState(null);
  const root = useRef(null);
  const notificationButton = useRef(null);
  const accountButton = useRef(null);
  const { logout } = useUserStore();
  useEffect(() => {
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setPanel(null);
    };
    const key = (e) => {
      if (e.key === "Escape" && panel) {
        (panel === "notifications"
          ? notificationButton
          : accountButton
        ).current?.focus();
        setPanel(null);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [panel]);
  return (
    <header className="app-top" ref={root}>
      <button
        className="app-icon-btn app-menu-btn"
        aria-label="Menüyü aç"
        onClick={onMenuClick}
      >
        <Menu size={18} />
      </button>
      <strong className="app-top-title">{pageTitle}</strong>
      <button className="app-search" onClick={onSearchClick}>
        <Search size={15} />
        <span>Ara veya bölüme git</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="app-top-actions">
        <span className="app-top-date">
          <CalendarDays size={14} />
          {new Date().toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "long",
            weekday: "long",
          })}
        </span>
        <button
          className="ui-btn ui-btn--primary ui-btn--sm app-quick"
          onClick={() => onNavigate?.("create")}
        >
          <Plus /> <span>Yeni ürün</span>
        </button>
        <span className="app-top-sep" />
        <button
          className="app-icon-btn app-mobile-search"
          onClick={onSearchClick}
          aria-label="Panelde ara"
        >
          <Search size={17} />
        </button>
        <button
          className="app-icon-btn"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Verileri yenile"
          title={lastSync ? `Verileri yenile · Son yenileme ${lastSync}` : "Verileri yenile"}
        >
          <RefreshCw size={16} className={refreshing ? "ui-spin" : ""} />
        </button>
        <div className="app-pop-anchor">
          <button
            ref={notificationButton}
            className="app-icon-btn"
            onClick={() =>
              setPanel(panel === "notifications" ? null : "notifications")
            }
            aria-label={`Bildirimler, ${notifications.length} bildirim`}
            aria-expanded={panel === "notifications"}
          >
            <Bell size={17} />
            {notifications.length > 0 && (
              <i className="app-bell-count">{Math.min(99, notifications.length)}</i>
            )}
          </button>
          {panel === "notifications" && (
            <section
              className="app-pop app-pop--wide"
              aria-label="Bildirimler"
            >
              <div className="app-pop-head">
                <strong>
                  Bildirimler <span>{notifications.length}</span>
                </strong>
                <button
                  className="app-icon-btn"
                  aria-label="Bildirimleri kapat"
                  onClick={() => setPanel(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="app-pop-list">
                {notifications.length ? (
                  notifications.map((n, i) => (
                    <button
                      className="app-notice"
                      key={n.id || i}
                      onClick={() => {
                        setPanel(null);
                        onViewNotifications?.(n);
                      }}
                    >
                      {n.kind === "support" ? (
                        <Headphones size={15} />
                      ) : n.kind === "message" ? (
                        <MessageCircle size={15} />
                      ) : (
                        <ShoppingBag size={15} />
                      )}
                      {n.kind === "support" || n.kind === "message" ? (
                        <span>
                          <strong>{n.title}</strong>
                          <small>
                            {n.kind === "support" ? "Destek talebi" : "Yeni mesaj"} · {String(n.detail || "").slice(0, 60)}
                          </small>
                        </span>
                      ) : (
                      <span>
                        <strong>
                          {n.order?.customerName || "Yeni sipariş"}
                        </strong>
                        <small>
                          #
                          {String(n.order?.id || n.id || "")
                            .slice(-6)
                            .toUpperCase()}{" "}
                          ·{" "}
                          {Number(n.order?.totalAmount || 0).toLocaleString(
                            "tr-TR",
                            { style: "currency", currency: "TRY" },
                          )}
                        </small>
                      </span>
                      )}
                      <time>{n.time}</time>
                    </button>
                  ))
                ) : (
                  <div className="app-pop-empty">
                    <strong>Her şey güncel</strong>
                    <p>Yeni sipariş, destek talebi ve mesajlar burada görünecek.</p>
                  </div>
                )}
              </div>
              {notifications.length > 0 && (
                <div className="app-pop-foot">
                  <button onClick={onClearNotifications}>
                    Bildirimleri temizle
                  </button>
                  <button
                    onClick={() => {
                      setPanel(null);
                      onViewNotifications?.();
                    }}
                  >
                    Siparişlere git →
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
        <div className="app-pop-anchor">
          <button
            ref={accountButton}
            className="app-profile"
            onClick={() => setPanel(panel === "account" ? null : "account")}
            aria-label="Hesap menüsü"
            aria-expanded={panel === "account"}
          >
            <span className="app-avatar">
              {user?.name?.charAt(0)?.toLocaleUpperCase("tr-TR") || "Y"}
            </span>
            <span className="app-profile-name">{user?.name || "Yönetici"}</span>
            <ChevronDown size={14} />
          </button>
          {panel === "account" && (
            <section className="app-pop app-pop--menu">
              <div className="app-pop-head">
                <div>
                  <strong>{user?.name || "Yönetici"}</strong>
                  <small>{user?.email}</small>
                </div>
              </div>
              <button
                onClick={() => {
                  setPanel(null);
                  onNavigate?.("settings");
                }}
              >
                <Settings size={15} /> Mağaza ayarları
              </button>
              <a href="/" target="_blank" rel="noreferrer">
                <ArrowUpRight size={15} /> Mağazayı görüntüle
              </a>
              <button
                className="app-pop-danger"
                onClick={() => {
                  setPanel(null);
                  logout();
                }}
              >
                <LogOut size={15} /> Güvenli çıkış
              </button>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}
