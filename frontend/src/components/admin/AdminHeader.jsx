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
  Smartphone,
  X,
  Plus,
  CalendarDays,
  ChevronDown,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { useUserStore } from "../../stores/useUserStore";
import SoundSettings from "./alerts/SoundSettings";
import AlarmPhonesChip from "./alerts/AlarmPhonesChip";
import { SOUND_SETTINGS_EVENT, useAlertPrefs } from "./alerts/alertPrefs";

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
  status = { connected: true, orders: 0, chats: 0 },
  theme = "light",
  onToggleTheme,
  alarm = null,
  onOpenAlarmPhones,
  onRefreshAlarm,
}) {
  const [panel, setPanel] = useState(null);
  // Zil panelinde ses ayarları açık mı; focusSound: hesap menüsünden gelindiyse ilk alan odaklanır
  const [soundOpen, setSoundOpen] = useState(false);
  const [focusSound, setFocusSound] = useState(false);
  const root = useRef(null);
  const notificationButton = useRef(null);
  const accountButton = useRef(null);
  const alarmButton = useRef(null);
  const { logout } = useUserStore();
  const prefs = useAlertPrefs();
  const muted = prefs.muted || prefs.volume <= 0;
  useEffect(() => {
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setPanel(null);
    };
    const key = (e) => {
      if (e.key === "Escape" && panel) {
        const buttons = { notifications: notificationButton, account: accountButton, alarm: alarmButton };
        buttons[panel]?.current?.focus();
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
  // Ses ayarlarını açma isteği (uyarı şeridi, "Sessiz" çipi)
  useEffect(() => {
    const open = () => {
      setSoundOpen(true);
      setFocusSound(true);
      setPanel("notifications");
    };
    window.addEventListener(SOUND_SETTINGS_EVENT, open);
    return () => window.removeEventListener(SOUND_SETTINGS_EVENT, open);
  }, []);
  const togglePanel = (name) => {
    setFocusSound(false);
    setPanel(panel === name ? null : name);
  };
  const openSoundSettings = () => {
    setSoundOpen(true);
    setFocusSound(true);
    setPanel("notifications");
  };
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
        {/* Canlı durum: bağlantı, bekleyen sipariş ve okunmamış mesaj */}
        <div className="app-status" role="status" aria-label="Canlı durum">
          <span className="app-status-conn" data-on={status.connected} title={status.connected ? `Canlı bağlantı açık${lastSync ? ` · son yenileme ${lastSync}` : ""}` : "Canlı bağlantı kopuk; yeniden bağlanılıyor"}>
            {status.connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span>{status.connected ? "Canlı" : "Bağlantı yok"}</span>
          </span>
          <button type="button" className="app-status-chip" data-tone={status.orders > 0 ? "warn" : ""} onClick={() => onNavigate?.("orders", "active")} title="Bekleyen siparişler">
            <ShoppingBag size={13} /><b>{status.orders}</b><span>bekleyen</span>
          </button>
          <button type="button" className="app-status-chip" data-tone={status.chats > 0 ? "info" : ""} onClick={() => onNavigate?.("chat")} title="Okunmamış mesajlar">
            <MessageCircle size={13} /><b>{status.chats}</b><span>mesaj</span>
          </button>
          {muted && (
            <button type="button" className="app-status-chip app-mute-chip" data-tone="warn" onClick={openSoundSettings} title="Yeni sipariş sesi kapalı. Açmak için tıklayın." aria-label="Yeni sipariş sesi kapalı, ses ayarlarını aç">
              <VolumeX size={13} aria-hidden="true" /><span>Ses kapalı</span>
            </button>
          )}
        </div>
        <AlarmPhonesChip
          alarm={alarm}
          open={panel === "alarm"}
          onToggle={() => togglePanel("alarm")}
          onClose={() => setPanel(null)}
          onRefresh={() => onRefreshAlarm?.()}
          onManage={() => {
            setPanel(null);
            onOpenAlarmPhones?.();
          }}
          buttonRef={alarmButton}
        />
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
          aria-label="Yeni ürün"
          title="Yeni ürün"
        >
          <Plus /> <span>Yeni ürün</span>
        </button>
        <span className="app-top-sep" />
        <button
          className="app-icon-btn app-theme-btn"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
          title={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="app-icon-btn app-mobile-search"
          onClick={onSearchClick}
          aria-label="Panelde ara"
        >
          <Search size={17} />
        </button>
        <button
          className="app-icon-btn app-refresh-btn"
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
            onClick={() => togglePanel("notifications")}
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
              className="app-pop app-pop--wide app-pop--bell"
              aria-label="Bildirimler"
            >
              <div className="app-pop-head">
                <strong>
                  Bildirimler <span>{notifications.length}</span>
                </strong>
                <div className="app-pop-head-actions">
                  <button
                    type="button"
                    className="app-icon-btn app-sound-toggle"
                    data-active={soundOpen || undefined}
                    data-muted={muted || undefined}
                    aria-label="Bildirim sesi ayarları"
                    aria-expanded={soundOpen}
                    title="Bildirim sesi ayarları"
                    onClick={() => {
                      setFocusSound(false);
                      setSoundOpen((open) => !open);
                    }}
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <button
                    className="app-icon-btn"
                    aria-label="Bildirimleri kapat"
                    onClick={() => setPanel(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              {soundOpen && <SoundSettings autoFocus={focusSound} />}
              <div className="app-pop-list">
                {notifications.length ? (
                  notifications.map((n, i) => (
                    <button
                      className="app-notice"
                      key={n.id || i}
                      data-kind={n.kind || "order"}
                      onClick={() => {
                        setPanel(null);
                        onViewNotifications?.(n);
                      }}
                    >
                      {n.kind === "support" ? (
                        <Headphones size={15} />
                      ) : n.kind === "message" ? (
                        <MessageCircle size={15} />
                      ) : n.kind === "app-open" ? (
                        <Smartphone size={15} />
                      ) : n.kind === "cancel" ? (
                        <XCircle size={15} />
                      ) : (
                        <ShoppingBag size={15} />
                      )}
                      {n.kind === "app-open" ? (
                        <span>
                          <strong>{n.title}</strong>
                          <small>Mobil uygulama · {String(n.detail || "").slice(0, 60)}</small>
                        </span>
                      ) : n.kind === "support" || n.kind === "message" ? (
                        <span>
                          <strong>{n.title}</strong>
                          <small>
                            {n.kind === "support" ? "Destek talebi" : "Yeni mesaj"} · {String(n.detail || "").slice(0, 60)}
                          </small>
                        </span>
                      ) : n.kind === "cancel" ? (
                        <span>
                          <strong>{n.title || "Müşteri siparişi iptal etti"}</strong>
                          <small className="app-notice-detail">{String(n.detail || "").slice(0, 160)}</small>
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
                    <p>Yeni sipariş, iptal, destek talebi ve mesajlar burada görünecek.</p>
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
            onClick={() => togglePanel("account")}
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
              <button onClick={openSoundSettings}>
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />} Bildirim sesi
                <small className="app-pop-menu-hint">{muted ? "Kapalı" : "Açık"}</small>
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
