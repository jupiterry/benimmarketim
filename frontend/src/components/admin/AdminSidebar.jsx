import { useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Menu,
  ArrowUpRight,
  Leaf,
  Store,
} from "lucide-react";
import { adminMenuGroups } from "./adminNavigation";

export default function AdminSidebar({
  activeTab,
  onTabChange,
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
  user,
  orderCount = 0,
  chatCount = 0,
}) {
  const mobileRef = useRef(null);
  const closeRef = useRef(onMobileClose);
  closeRef.current = onMobileClose;
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileRef.current?.querySelector("button")?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const items = mobileRef.current?.querySelectorAll("button, a");
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [mobileOpen]);
  const select = (id) => {
    onTabChange(id);
    if (mobileOpen) onMobileClose();
  };
  const content = (compact, mobile = false) => (
    <>
      <div className="app-brand">
        <span className="app-brand-mark">
          <Leaf size={15} />
        </span>
        {!compact && <strong className="app-brand-name">Benim Marketim</strong>}
        {!compact && !mobile && (
          <button
            className="app-icon-btn app-brand-toggle"
            onClick={onCollapse}
            aria-label="Menüyü daralt"
            title="Menüyü daralt"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
        {mobile && (
          <button
            className="app-icon-btn app-brand-toggle"
            onClick={onMobileClose}
            aria-label="Menüyü kapat"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="app-nav" aria-label="Yönetim bölümleri">
        {adminMenuGroups.map((group) => (
          <div className="app-nav-group" key={group.title}>
            {!compact && <p>{group.short || group.title}</p>}
            {group.items.map(({ id, label, short, icon: Icon, badge }) => (
              <button
                key={id}
                className="app-nav-item"
                aria-current={activeTab === id ? "page" : undefined}
                aria-label={label}
                title={compact ? label : undefined}
                onClick={() => select(id)}
              >
                <Icon size={16} strokeWidth={1.8} />
                {!compact && <span>{short || label}</span>}
                {badge && (badge === "orders" ? orderCount : chatCount) > 0 && (
                  <b className="app-nav-count">
                    {Math.min(99, badge === "orders" ? orderCount : chatCount)}
                  </b>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="app-side-foot">
        <a
          className="app-nav-item"
          href="/"
          target="_blank"
          rel="noreferrer"
          aria-label="Mağazayı görüntüle"
          title={compact ? "Mağazayı görüntüle" : undefined}
        >
          <Store size={16} strokeWidth={1.8} />
          {!compact && <span>Mağazayı aç</span>}
          {!compact && <ArrowUpRight size={14} className="app-nav-ext" />}
        </a>
        {compact && !mobile && (
          <button
            className="app-nav-item"
            onClick={onCollapse}
            aria-label="Menüyü genişlet"
            title="Menüyü genişlet"
          >
            <PanelLeftOpen size={16} strokeWidth={1.8} />
          </button>
        )}
        <div className="app-user">
          <span className="app-avatar">
            {user?.name?.charAt(0)?.toLocaleUpperCase("tr-TR") || "Y"}
          </span>
          {!compact && (
            <div>
              <strong>{user?.name || "Yönetici"}</strong>
              <small>Mağaza yöneticisi</small>
            </div>
          )}
        </div>
      </div>
    </>
  );
  return (
    <>
      <aside className={`app-side app-side-desktop ${collapsed ? "is-rail" : ""}`}>
        {content(collapsed)}
      </aside>
      {mobileOpen && (
        <div className="app-side-sheet">
          <div className="app-scrim" onClick={onMobileClose} />
          <aside
            ref={mobileRef}
            role="dialog"
            aria-modal="true"
            aria-label="Yönetim menüsü"
            className="app-side"
          >
            {content(false, true)}
          </aside>
        </div>
      )}
      <nav className="app-tabbar" aria-label="Hızlı gezinme">
        {[
          { id: "dashboard", label: "Özet", icon: LayoutDashboard },
          { id: "orders", label: "Siparişler", icon: ShoppingBag },
          { id: "products", label: "Ürünler", icon: Package },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => select(id)}
            aria-current={activeTab === id ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
        <button
          onClick={() =>
            document.dispatchEvent(new CustomEvent("toggleMobileMenu"))
          }
          aria-expanded={mobileOpen}
        >
          <Menu size={19} strokeWidth={1.8} />
          <span>Menü</span>
        </button>
      </nav>
    </>
  );
}
