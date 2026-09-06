import { useState, useEffect, useRef } from "react";
import {
  Search,
  Bell,
  Menu,
  ChevronRight,
  RefreshCw,
  ArrowUpRight,
  Settings,
  LogOut,
  ShoppingBag,
  X,
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
    <header className="studio-header" ref={root}>
      <button
        className="studio-icon-button studio-menu-toggle"
        aria-label="Menüyü aç"
        onClick={onMenuClick}
      >
        <Menu size={20} />
      </button>
      <div className="studio-breadcrumb">
        <span>Çalışma alanı</span>
        <ChevronRight size={14} />
        <strong>{pageTitle}</strong>
      </div>
      <button className="studio-search-trigger" onClick={onSearchClick}>
        <Search size={17} />
        <span>Panelde ara...</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="studio-header-actions">
        <button
          className="studio-icon-button studio-mobile-search"
          onClick={onSearchClick}
          aria-label="Panelde ara"
        >
          <Search size={19} />
        </button>
        <button
          className="studio-icon-button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Verileri yenile"
          title="Verileri yenile"
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
        <div className="studio-dropdown-anchor">
          <button
            ref={notificationButton}
            className="studio-icon-button"
            onClick={() =>
              setPanel(panel === "notifications" ? null : "notifications")
            }
            aria-label={`Bildirimler, ${notifications.length} bildirim`}
            aria-expanded={panel === "notifications"}
          >
            <Bell size={19} />
            {notifications.length > 0 && (
              <i className="studio-notification-dot" />
            )}
          </button>
          {panel === "notifications" && (
            <section
              className="studio-dropdown studio-notifications"
              aria-label="Sipariş bildirimleri"
            >
              <div className="studio-dropdown-heading">
                <strong>
                  Bildirimler <span>{notifications.length}</span>
                </strong>
                <button
                  className="studio-icon-button"
                  aria-label="Bildirimleri kapat"
                  onClick={() => setPanel(null)}
                >
                  <X size={17} />
                </button>
              </div>
              <div className="studio-notification-list">
                {notifications.length ? (
                  notifications.map((n, i) => (
                    <button
                      className="studio-notification"
                      key={n.id || i}
                      onClick={() => {
                        setPanel(null);
                        onViewNotifications?.(n.order);
                      }}
                    >
                      <span className="studio-soft-icon">
                        <ShoppingBag size={18} />
                      </span>
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
                      <time>{n.time}</time>
                    </button>
                  ))
                ) : (
                  <div className="studio-empty">
                    <Bell size={28} />
                    <strong>Her şey güncel</strong>
                    <p>Yeni sipariş bildirimleri burada görünecek.</p>
                  </div>
                )}
              </div>
              {notifications.length > 0 && (
                <div className="studio-dropdown-footer">
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
        <div className="studio-header-divider" />
        <div className="studio-dropdown-anchor">
          <button
            ref={accountButton}
            className="studio-profile-button"
            onClick={() => setPanel(panel === "account" ? null : "account")}
            aria-label="Hesap menüsü"
            aria-expanded={panel === "account"}
          >
            <span className="studio-avatar">
              {user?.name?.charAt(0)?.toLocaleUpperCase("tr-TR") || "Y"}
            </span>
          </button>
          {panel === "account" && (
            <section className="studio-dropdown studio-account-dropdown">
              <div className="studio-dropdown-heading">
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
                <Settings size={17} /> Mağaza ayarları
              </button>
              <a href="/" target="_blank" rel="noreferrer">
                <ArrowUpRight size={17} /> Mağazayı görüntüle
              </a>
              <button
                className="studio-signout"
                onClick={() => {
                  setPanel(null);
                  logout();
                }}
              >
                <LogOut size={17} /> Güvenli çıkış
              </button>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}

export function AdminStatusBar({ lastSync }) {
  return (
    <footer className="studio-status">
      <span>
        Benim Marketim <span className="studio-status-separator">/</span>{" "}
        Yönetim paneli
      </span>
      <span>
        {lastSync ? `Son yenileme ${lastSync}` : "Veriler yükleniyor"}
        <span className="studio-status-separator">·</span>
        <kbd>Ctrl K</kbd> Hızlı erişim
      </span>
    </footer>
  );
}
