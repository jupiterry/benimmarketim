import { useState, useEffect, useRef, useMemo } from "react";
import { Search, ArrowUpRight, X, Package, ShoppingBag, Users, Plus, BellRing, SunMoon, CornerDownLeft } from "lucide-react";
import axios from "../../lib/axios";
import { adminMenuGroups } from "./adminNavigation";
import { HANDOFF, fold, money, setHandoff, useDebounced } from "./ui";

const ORDER_STATUS_TONE = { "Hazırlanıyor": "warn", "Yolda": "info", "Teslim Edildi": "ok", "İptal Edildi": "danger" };
const MAX_PER_GROUP = 6;
const MIN_USER_QUERY = 2; // müşteri araması en az bu kadar karakterle başlar

/**
 * Ctrl+K paleti: bölümler, hızlı eylemler ve canlı arama (ürün, aktif sipariş, müşteri).
 * Ürünler panelde yüklü (prop); aktif siparişler palet açılınca bir kez çekilir; müşteriler yalnızca bir şey
 * yazıldığında sunucuda aranır (GET /users/search, gecikmeli; tüm müşteri listesi indirilmez).
 */
export default function CommandPalette({ isOpen, onClose, onNavigate, currentTab, products = [], onToggleTheme }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [orders, setOrders] = useState([]);
  const [userHits, setUserHits] = useState({ q: "", users: [] });
  const [usersSearching, setUsersSearching] = useState(false);
  const userQuery = useDebounced(isOpen ? query.trim() : "", 250);
  const dialog = useRef(null);
  const input = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const ordersLoadedAt = useRef(0);

  const sections = useMemo(() => adminMenuGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title }))), []);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setQuery("");
    setSelectedIndex(0);
    input.current?.focus();
    // Aktif siparişler (en fazla dakikada bir yenilenir)
    if (Date.now() - ordersLoadedAt.current > 60000) {
      ordersLoadedAt.current = Date.now();
      axios.get("/orders-analytics", { params: { active: 1, limit: 40 } })
        .then(({ data }) => {
          const list = (data.orderAnalyticsData?.usersOrders || []).flatMap((entry) => (entry.orders || []).map((order) => ({ ...order, customerName: entry.user?.name || "Müşteri" })));
          setOrders(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        })
        .catch(() => {});
    }
    const key = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); }
      if (event.key === "Tab") {
        const items = dialog.current?.querySelectorAll("input, button");
        if (!items?.length) return;
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
        if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [isOpen]);

  // Müşteri araması: palet açık ve sorgu yeterince uzunsa; eski yanıtlar yok sayılır
  useEffect(() => {
    if (!isOpen || userQuery.length < MIN_USER_QUERY) {
      setUserHits({ q: "", users: [] });
      setUsersSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    setUsersSearching(true);
    axios.get("/users/search", { params: { q: userQuery, limit: MAX_PER_GROUP }, signal: controller.signal })
      .then(({ data }) => setUserHits({ q: userQuery, users: Array.isArray(data?.users) ? data.users : [] }))
      .catch(() => { if (!controller.signal.aborted) setUserHits({ q: userQuery, users: [] }); })
      .finally(() => { if (!controller.signal.aborted) setUsersSearching(false); });
    return () => controller.abort();
  }, [isOpen, userQuery]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    const terms = q ? q.split(/\s+/) : [];
    const match = (text) => { const hay = fold(text); return terms.every((t) => hay.includes(t)); };
    const groups = [];
    const quick = [
      { id: "act:create", label: "Yeni ürün ekle", hint: "Katalog", icon: Plus, run: () => onNavigate("create") },
      { id: "act:push", label: "Bildirim gönder", hint: "Müşterilere push", icon: BellRing, run: () => onNavigate("push") },
      { id: "act:theme", label: "Temayı değiştir (açık / koyu)", hint: "Görünüm", icon: SunMoon, run: () => onToggleTheme?.() },
    ].filter((item) => !q || match(item.label));
    if (quick.length && (!q || terms.length)) groups.push({ title: "Hızlı eylemler", items: quick });

    const sectionHits = sections.filter((item) => !q || match(`${item.label} ${item.short || ""} ${item.keywords || ""} ${item.group}`)).slice(0, q ? MAX_PER_GROUP : 50)
      .map((item) => ({ id: `sec:${item.id}`, label: item.label, hint: item.group, icon: item.icon, current: item.id === currentTab, run: () => onNavigate(item.id) }));
    if (sectionHits.length) groups.push({ title: "Bölümler", items: sectionHits });

    if (q) {
      const productHits = products.filter((p) => p?.name && match(`${p.name} ${p.category || ""}`)).slice(0, MAX_PER_GROUP)
        .map((p) => ({
          id: `prd:${p._id}`, label: p.name, icon: Package,
          hint: `${money(p.isDiscounted && p.discountedPrice ? p.discountedPrice : p.price)}${p.isOutOfStock ? " · Stokta yok" : ""}${p.isHidden ? " · Gizli" : ""}`,
          image: p.thumbnail || p.image,
          run: () => { setHandoff(HANDOFF.product, p._id); onNavigate("products"); },
        }));
      if (productHits.length) groups.push({ title: "Ürünler", items: productHits });

      const orderHits = orders.filter((o) => match(`${String(o.orderId).slice(-6)} ${o.customerName} ${o.phone || ""} ${(o.products || []).map((i) => i.name).join(" ")}`)).slice(0, MAX_PER_GROUP)
        .map((o) => ({
          id: `ord:${o.orderId}`, label: `#${String(o.orderId).slice(-6).toUpperCase()} · ${o.customerName}`, icon: ShoppingBag,
          hint: `${money(o.totalAmount)} · ${o.status}`, tone: ORDER_STATUS_TONE[o.status],
          run: () => { setHandoff(HANDOFF.order, String(o.orderId).slice(-6)); onNavigate("orders"); },
        }));
      if (orderHits.length) groups.push({ title: "Aktif siparişler", items: orderHits });

      // Sunucu sonuçları geçerli sorguya aitse olduğu gibi; kullanıcı yazmaya devam ederken (önceki sorgunun
      // uzantısı) yeni yanıt gelene dek yerelde süzülerek gösterilir, böylece grup her tuşta kaybolmaz
      const base = userHits.q ? fold(userHits.q) : null;
      const customerSource = base !== null && q.startsWith(base)
        ? userHits.users.filter((u) => base === q || match(`${u.name || ""} ${u.email || ""} ${u.phone || ""}`))
        : [];
      const customerHits = customerSource.slice(0, MAX_PER_GROUP)
        .map((u) => ({
          id: `usr:${u._id}`, label: u.name || "İsimsiz müşteri", icon: Users,
          hint: [u.role === "admin" ? "Yönetici" : null, u.email || u.phone || "Müşteri"].filter(Boolean).join(" · "),
          run: () => { setHandoff(HANDOFF.user, u._id); onNavigate("users"); },
        }));
      if (customerHits.length) groups.push({ title: "Müşteriler", items: customerHits });
    }
    return groups;
  }, [query, sections, products, orders, userHits, currentTab, onNavigate, onToggleTheme]);

  const flat = useMemo(() => results.flatMap((g) => g.items), [results]);
  useEffect(() => { setSelectedIndex(0); }, [query]);
  useEffect(() => {
    dialog.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;
  const run = (item) => { item.run(); onClose(); };

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section ref={dialog} className="command-palette" role="dialog" aria-modal="true" aria-label="Panelde ara" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-input-wrapper">
          <Search size={17} />
          <input ref={input} className="command-palette-input" placeholder="Ürün, sipariş, müşteri ya da bölüm ara…" aria-label="Panelde ara"
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % (flat.length || 1));
              }
              if (e.key === "Enter" && flat[selectedIndex]) { e.preventDefault(); run(flat[selectedIndex]); }
            }} />
          <button className="app-icon-btn" onClick={onClose} aria-label="Aramayı kapat"><X size={16} /></button>
        </div>
        <div className="command-palette-results">
          {results.map((group) => (
            <div key={group.title} className="command-palette-group">
              <p className="command-palette-group-title">{group.title}</p>
              {group.items.map((item) => {
                const index = flat.indexOf(item);
                const selected = index === selectedIndex;
                return (
                  <button key={item.id} data-selected={selected} className={`command-palette-item ${selected ? "is-selected" : ""}`}
                    onClick={() => run(item)} onMouseMove={() => setSelectedIndex(index)}>
                    {item.image ? <img src={item.image} alt="" className="command-palette-thumb" loading="lazy" /> : <item.icon size={16} />}
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                    {item.current ? <small>Şu an buradasınız</small> : selected ? <CornerDownLeft size={14} /> : <ArrowUpRight size={14} />}
                  </button>
                );
              })}
            </div>
          ))}
          {!flat.length && (
            <div className="app-pop-empty" aria-live="polite">
              <strong>{usersSearching || (query.trim().length >= MIN_USER_QUERY && userQuery !== query.trim()) ? "Müşteriler aranıyor…" : "Sonuç bulunamadı"}</strong>
              <p>Ürün adı, sipariş numarasının son 6 hanesi, müşteri adı ya da bölüm adı yazın.</p>
            </div>
          )}
        </div>
        <footer>
          <span>↑ ↓ Gezin <span>↵ Aç</span></span>
          <span>Esc ile kapat</span>
        </footer>
      </section>
    </div>
  );
}
