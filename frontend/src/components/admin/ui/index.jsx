/* eslint-disable react-refresh/only-export-components */
/* global Intl */
// Yönetim panelinin ortak arayüz parçaları. Her ekran aynı başlık, boş durum, iskelet,
// çekmece, KPI kartı, "geri al" bildirimi ve klavye kısayolu kalıbını buradan alır.
// Stil sınıfları admin-system.css içindeki `ui-*` kurallarıdır.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Keyboard, RotateCcw, X } from "lucide-react";
import toast from "react-hot-toast";

// ── Yardımcılar ───────────────────────────────────────────────────────────
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"]);
/** Odak bir metin alanındaysa klavye kısayolları çalışmamalı */
export const isTypingTarget = (el) =>
  Boolean(el) && (
    (el.tagName === "INPUT" && !NON_TEXT_INPUTS.has(el.type)) ||
    el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
  );
/** Açık bir çekmece/pencere varsa (liste kısayolları o sırada durur) */
export const hasOpenLayer = () => Boolean(document.querySelector(".ui-drawer-backdrop, .ui-modal-backdrop, .confirm-root, .command-palette-backdrop"));

const TRY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
export const money = (value) => TRY.format(Number(value) || 0);
export const compactMoney = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `₺${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 10_000) return `₺${(n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B`;
  return TRY.format(n);
};
const TZ = "Europe/Istanbul";
export const formatDate = (value, opts = {}) =>
  value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", ...opts }) : "—";
export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "—";
/** "3 dk önce", "2 sa önce", "dün", "12 Eki" */
export const timeAgo = (value, now = Date.now()) => {
  if (!value) return "—";
  const diff = now - new Date(value).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  if (d === 1) return "dün";
  if (d < 7) return `${d} gün önce`;
  return formatDate(value);
};
/** Türkçe duyarsız arama için sadeleştirme */
export const fold = (s) => String(s || "").toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
export const initials = (name) => String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toLocaleUpperCase("tr-TR") || "?";

/** localStorage tercihi; gizli pencere ya da kapalı depolamada sessizce varsayılana düşer */
export const readPref = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
export const writePref = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama kapalı olabilir */
  }
};
export const usePref = (key, fallback) => {
  const [value, setValue] = useState(() => readPref(key, fallback));
  const update = useCallback((next) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      writePref(key, resolved);
      return resolved;
    });
  }, [key]);
  return [value, update];
};

export const useMediaQuery = (query) => {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
};
export const useIsMobile = () => useMediaQuery("(max-width: 760px)");

/** Girdiyi gecikmeli döndürür (arama kutuları) */
export const useDebounced = (value, delay = 250) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
};

// ── Sayfa başlığı ─────────────────────────────────────────────────────────
/**
 * Her ekranın üst satırı: başlık, kısa açıklama, sağda eylemler.
 * `meta` başlığın yanına küçük bir rozet/sayı koyar (örn. "12 bekliyor").
 */
export const PageHeader = ({ title, description, meta, actions, children, className = "" }) => (
  <header className={`app-pagehead ${className}`}>
    <div className="app-pagehead-text">
      <h1>
        {title}
        {meta && <span className="app-pagehead-meta">{meta}</span>}
      </h1>
      {description && <p>{description}</p>}
      {children}
    </div>
    {actions && <div className="app-pagehead-actions">{actions}</div>}
  </header>
);

// ── Boş durum ─────────────────────────────────────────────────────────────
export const EmptyState = ({ icon: Icon, title, description, action, compact = false, className = "" }) => (
  <div className={`ui-empty ${compact ? "ui-empty--compact" : ""} ${className}`}>
    {Icon && <Icon aria-hidden="true" />}
    {title && <strong>{title}</strong>}
    {description && <span className="ui-muted">{description}</span>}
    {action && <div className="ui-empty-action">{action}</div>}
  </div>
);

// ── İskeletler ────────────────────────────────────────────────────────────
export const Skeleton = ({ width, height = 14, radius, className = "", style }) => (
  <span className={`ui-skeleton ${className}`} aria-hidden="true"
    style={{ display: "block", width: width ?? "100%", height, borderRadius: radius, ...style }} />
);
/** Liste satırları: solda küçük görsel, sağda iki satır metin */
export const SkeletonRows = ({ rows = 6, avatar = true, height = 52 }) => (
  <div className="ui-skeleton-rows" aria-busy="true" aria-label="Yükleniyor">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="ui-skeleton-row" style={{ minHeight: height }}>
        {avatar && <Skeleton width={36} height={36} radius={8} />}
        <div className="ui-skeleton-lines">
          <Skeleton width={`${45 + ((i * 17) % 35)}%`} />
          <Skeleton width={`${25 + ((i * 11) % 30)}%`} height={10} />
        </div>
        <Skeleton width={64} height={22} radius={999} />
      </div>
    ))}
  </div>
);
/** KPI kartları */
export const SkeletonCards = ({ count = 4, height = 92 }) => (
  <div className="ui-skeleton-cards" aria-busy="true" aria-label="Yükleniyor">
    {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={height} radius={10} />)}
  </div>
);
/** Tek blok (grafik, panel) */
export const SkeletonBlock = ({ height = 240 }) => <Skeleton height={height} radius={10} />;

// ── KPI kartı ─────────────────────────────────────────────────────────────
/**
 * Özet sayı kartı. `onClick` verilirse tıklanabilir (filtre) olur, `active` seçili halidir.
 * tone: ok | warn | danger | info | brand
 */
export const KpiCard = ({ icon: Icon, label, value, note, tone, delta, active, onClick, className = "" }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`ui-kpi ${className}`} data-tone={tone}
      aria-pressed={onClick ? Boolean(active) : undefined} onClick={onClick}>
      <span className="ui-kpi-top">
        <span className="ui-kpi-label">{label}</span>
        {Icon && <span className="ui-kpi-icon"><Icon /></span>}
      </span>
      <span className="ui-kpi-value">{value}</span>
      {(note || delta !== undefined) && (
        <span className="ui-kpi-note">
          {delta !== undefined && delta !== null && (
            <span className="ui-kpi-delta" data-dir={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
              {delta > 0 ? <ArrowUp /> : delta < 0 ? <ArrowDown /> : null}
              {Math.abs(Number(delta)).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}%
            </span>
          )}
          {note}
        </span>
      )}
    </Tag>
  );
};
export const KpiGrid = ({ children, columns, className = "" }) => (
  <div className={`ui-kpis ${className}`} style={columns ? { "--ui-kpi-cols": columns } : undefined}>{children}</div>
);

// ── Çekmece ───────────────────────────────────────────────────────────────
/**
 * Sağdan açılan panel. Esc ve arka plana tıklama kapatır (üstte onay penceresi açıkken değil).
 * `dirty` true ise kapatmadan önce `onDirtyClose` çağrılır (onay sormak için); false dönerse kalır.
 */
export const Drawer = ({ title, subtitle, icon: Icon, width, onClose, onDirtyClose, dirty = false, tabs, footer, children, className = "", bodyClassName = "" }) => {
  const closeRef = useRef(null);
  const requestClose = useCallback(async () => {
    if (dirty && onDirtyClose) {
      const ok = await onDirtyClose();
      if (!ok) return;
    }
    onClose?.();
  }, [dirty, onDirtyClose, onClose]);
  closeRef.current = requestClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector(".confirm-root, .ui-modal-backdrop")) return;
      if (isTypingTarget(e.target) && e.target.dataset.escClear) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="ui-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <aside className={`ui-drawer ${className}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        style={width ? { width: `min(${width}px, 100vw)` } : undefined}>
        <div className="ui-drawer-head">
          <div className="ui-drawer-title">
            {Icon && <span className="ui-drawer-icon"><Icon /></span>}
            <div className="ui-drawer-title-text">
              <h2 className="ui-truncate">{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="ui-icon-btn" onClick={requestClose} aria-label="Kapat"><X /></button>
        </div>
        {tabs && <div className="ui-drawer-tabs">{tabs}</div>}
        <div className={`ui-drawer-body ${bodyClassName}`}>{children}</div>
        {footer && <div className="ui-drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
};

// ── Bölümlü düğme grubu ───────────────────────────────────────────────────
export const Segmented = ({ options, value, onChange, ariaLabel, size }) => (
  <div className={`ui-segmented ${size === "sm" ? "ui-segmented--sm" : ""}`} role="group" aria-label={ariaLabel}>
    {options.map((opt) => (
      <button key={opt.value} type="button" aria-pressed={value === opt.value} data-tone={opt.tone} onClick={() => onChange(opt.value)} title={opt.title}>
        {opt.icon && <opt.icon />}{opt.label}{opt.count !== undefined && <span className="ui-count">{opt.count}</span>}
      </button>
    ))}
  </div>
);

// ── Geri alınabilir işlem ─────────────────────────────────────────────────
/**
 * "Silindi · Geri al" bildirimi. Arayüz hemen güncellenir (iyimser), gerçek işlem `duration`
 * sonra `commit` ile yapılır; o süre içinde "Geri al"a basılırsa `undo` çağrılır ve commit yapılmaz.
 * Sayfadan çıkılırsa bekleyen işlemler hemen uygulanır (kaybolmaz).
 */
const pendingUndo = new Set();
const flushPending = () => {
  for (const entry of [...pendingUndo]) entry.flush();
};
if (typeof window !== "undefined") window.addEventListener("pagehide", flushPending);
export const flushUndoable = flushPending;

export const undoable = ({ message, commit, undo, duration = 5000, icon }) => {
  let done = false;
  const entry = {
    flush: () => {
      if (done) return;
      done = true;
      pendingUndo.delete(entry);
      Promise.resolve().then(commit).catch(() => {});
    },
  };
  pendingUndo.add(entry);
  const timer = setTimeout(() => { toast.dismiss(id); entry.flush(); }, duration);
  const id = toast(
    (t) => (
      <span className="ui-undo">
        {icon}
        <span className="ui-undo-text">{message}</span>
        <button type="button" className="ui-undo-btn" onClick={() => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          pendingUndo.delete(entry);
          toast.dismiss(t.id);
          Promise.resolve().then(undo).catch(() => {});
        }}>
          <RotateCcw />Geri al
        </button>
      </span>
    ),
    { duration, id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  );
  return { flush: entry.flush };
};

// ── Liste kısayolları ─────────────────────────────────────────────────────
/**
 * Her listede aynı kısayollar: `/` arama, `j`/`k` gezin, `Enter` aç, `Esc` kapat/temizle, `?` yardım.
 * handlers: { search, move(±1), open, escape, extra: { [key]: fn } }. Açık bir katman varken durur.
 */
export const useListShortcuts = (handlers, { enabled = true } = {}) => {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const h = ref.current || {};
      if (e.key === "Escape") {
        if (helpOpen) { setHelpOpen(false); e.preventDefault(); return; }
        if (isTypingTarget(e.target)) { if (h.searchEscape) h.searchEscape(e); return; }
        if (hasOpenLayer()) return;
        h.escape?.(e);
        return;
      }
      if (isTypingTarget(e.target) || hasOpenLayer()) return;
      if (e.key === "?") { e.preventDefault(); setHelpOpen((v) => !v); return; }
      if (e.key === "/" && h.search) { e.preventDefault(); h.search(e); return; }
      if ((e.key === "j" || e.key === "ArrowDown") && h.move) { e.preventDefault(); h.move(1); return; }
      if ((e.key === "k" || e.key === "ArrowUp") && h.move) { e.preventDefault(); h.move(-1); return; }
      if (e.key === "Enter" && h.open) { e.preventDefault(); h.open(e); return; }
      const extra = h.extra?.[e.key];
      if (extra) { e.preventDefault(); extra(e); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, helpOpen]);
  return { helpOpen, setHelpOpen };
};

const DEFAULT_SHORTCUTS = [
  [["/"], "Aramaya git"], [["j", "k"], "Listede gezin"], [["↵"], "Seçili kaydı aç"], [["Esc"], "Kapat / seçimi temizle"], [["?"], "Bu yardımı aç / kapat"],
];
/** Kısayol yardımı penceresi; `items` ekran kendine özgü satırlar ekler */
export const ShortcutHelp = ({ open, onClose, items = [] }) => {
  if (!open) return null;
  const rows = [...DEFAULT_SHORTCUTS, ...items];
  return (
    <div className="ui-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal ui-shortcuts" role="dialog" aria-modal="true" aria-label="Klavye kısayolları">
        <div className="ui-modal-header">
          <h2 className="ui-title"><Keyboard /> Klavye kısayolları</h2>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Kapat"><X /></button>
        </div>
        <div className="ui-modal-body">
          <dl className="ui-shortcut-list">
            {rows.map(([keys, label]) => (
              <div key={label}>
                <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
                <dd>{label}</dd>
              </div>
            ))}
            <div><dt><kbd>Ctrl</kbd><kbd>K</kbd></dt><dd>Panelde ara (ürün, sipariş, müşteri, bölüm)</dd></div>
            <div><dt><kbd>g</kbd> <kbd>o</kbd></dt><dd>Siparişler · <kbd>g</kbd><kbd>p</kbd> Ürünler · <kbd>g</kbd><kbd>d</kbd> Genel bakış</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
};

/** Sayfa içi sekme çubuğu (ui-drawer-tabs ile aynı görünüm) */
export const Tabs = ({ tabs, value, onChange, ariaLabel }) => (
  <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>
    {tabs.map((tab) => (
      <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} onClick={() => onChange(tab.value)}>
        {tab.icon && <tab.icon />}{tab.label}{tab.count !== undefined && <span className="ui-count">{tab.count}</span>}
      </button>
    ))}
  </div>
);

/** Satır içi "yükleniyor" göstergesi */
export const InlineLoading = ({ label = "Yükleniyor…" }) => <span className="ui-loading"><span className="ui-loader" />{label}</span>;

/** Basit sıralanabilir tablo başlığı */
export const SortHead = ({ label, sortKey, sort, dir = "desc", onSort, className = "" }) => (
  <button type="button" className={`ui-th ${className}`} onClick={() => onSort(sortKey)} aria-pressed={sort === sortKey} title={`${label} göre sırala`}>
    {label}{sort === sortKey && (dir === "asc" ? <ArrowUp /> : <ArrowDown />)}
  </button>
);

export const useNow = (ms = 30000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

/** Ekranlar arası tek seferlik aktarım (komut paletinden ürün/sipariş/müşteri açma) */
export const takeHandoff = (key) => {
  try {
    const value = sessionStorage.getItem(key);
    if (value !== null) sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
};
export const setHandoff = (key, value) => {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    /* depolama kapalı olabilir */
  }
};
export const HANDOFF = { product: "admin-product-open", order: "admin-order-search", user: "admin-user-open", orderPreset: "admin-order-preset" };
