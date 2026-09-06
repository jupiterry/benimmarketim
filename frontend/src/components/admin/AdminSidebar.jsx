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
      <div className="studio-brand">
        <span className="studio-brand-mark">
          <Leaf size={23} />
        </span>
        {!compact && (
          <div>
            <strong>
              benim marketim<span>.</span>
            </strong>
            <small>YÖNETİM PANELİ</small>
          </div>
        )}
        {mobile && (
          <button
            className="studio-sidebar-close"
            onClick={onMobileClose}
            aria-label="Menüyü kapat"
          >
            <X size={20} />
          </button>
        )}
      </div>
      {!compact && (
        <a
          className="studio-store-link"
          href="/"
          target="_blank"
          rel="noreferrer"
        >
          <span className="studio-store-dot" />
          <span>
            Mağazayı görüntüle<small>devrekbenimmarketim.com</small>
          </span>
          <ArrowUpRight size={16} />
        </a>
      )}
      <nav className="studio-navigation" aria-label="Yönetim bölümleri">
        {adminMenuGroups.map((group) => (
          <div className="studio-nav-group" key={group.title}>
            {!compact && <p>{group.title}</p>}
            {group.items.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                className={`studio-nav-item ${activeTab === id ? "is-active" : ""}`}
                aria-current={activeTab === id ? "page" : undefined}
                aria-label={label}
                title={compact ? label : undefined}
                onClick={() => select(id)}
              >
                <Icon size={18} strokeWidth={1.7} />
                {!compact && <span>{label}</span>}
                {badge && (badge === "orders" ? orderCount : chatCount) > 0 && (
                  <b className="studio-nav-count">
                    {Math.min(99, badge === "orders" ? orderCount : chatCount)}
                  </b>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="studio-sidebar-bottom">
        <div className="studio-account">
          <span className="studio-avatar">
            {user?.name?.charAt(0)?.toLocaleUpperCase("tr-TR") || "Y"}
          </span>
          {!compact && (
            <div>
              <strong>{user?.name || "Yönetici"}</strong>
              <small>Mağaza yöneticisi</small>
            </div>
          )}
          {!mobile && (
            <button
              onClick={onCollapse}
              aria-label={compact ? "Menüyü genişlet" : "Menüyü daralt"}
              title={compact ? "Menüyü genişlet" : "Menüyü daralt"}
            >
              {compact ? (
                <PanelLeftOpen size={17} />
              ) : (
                <PanelLeftClose size={17} />
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
  return (
    <>
      <aside
        className={`studio-sidebar studio-sidebar-desktop ${collapsed ? "is-compact" : ""}`}
      >
        {content(collapsed)}
      </aside>
      {mobileOpen && (
        <div className="studio-mobile-drawer">
          <div className="studio-drawer-scrim" onClick={onMobileClose} />
          <aside
            ref={mobileRef}
            role="dialog"
            aria-modal="true"
            aria-label="Yönetim menüsü"
            className="studio-sidebar"
          >
            {content(false, true)}
          </aside>
        </div>
      )}
      <nav className="studio-bottom-nav" aria-label="Hızlı gezinme">
        {[
          { id: "dashboard", label: "Özet", icon: LayoutDashboard },
          { id: "orders", label: "Siparişler", icon: ShoppingBag },
          { id: "products", label: "Ürünler", icon: Package },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => select(id)}
            aria-current={activeTab === id ? "page" : undefined}
            className={activeTab === id ? "is-active" : ""}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
        <button
          onClick={() =>
            document.dispatchEvent(new CustomEvent("toggleMobileMenu"))
          }
          aria-expanded={mobileOpen}
        >
          <Menu size={20} />
          <span>Tüm menü</span>
        </button>
      </nav>
    </>
  );
}
