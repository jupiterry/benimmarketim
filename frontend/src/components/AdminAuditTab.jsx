import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, RefreshCw, Package, Megaphone, ShoppingBag, Users, Settings, Cpu, History, ArrowRight, ChevronDown, X,
} from "lucide-react";
import axios from "../lib/axios";
import "../styles/audit.css";

const AUDIT_CATEGORIES = [
  { key: "", label: "Tümü", icon: History },
  { key: "product", label: "Ürün", icon: Package },
  { key: "campaign", label: "Kampanya", icon: Megaphone },
  { key: "order", label: "Sipariş", icon: ShoppingBag },
  { key: "customer", label: "Müşteri", icon: Users },
  { key: "settings", label: "Ayarlar", icon: Settings },
  { key: "system", label: "Sistem", icon: Cpu },
];
const ICONS = Object.fromEntries(AUDIT_CATEGORIES.filter((c) => c.key).map((c) => [c.key, c.icon]));
const TZ = "Europe/Istanbul";
const dayKey = (date) => new Date(date).toLocaleDateString("tr-TR", { timeZone: TZ });
const dayLabel = (date) => {
  const key = dayKey(date);
  if (key === dayKey(Date.now())) return "Bugün";
  if (key === dayKey(Date.now() - 864e5)) return "Dün";
  return new Date(date).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "long", weekday: "long" });
};
const clock = (date) => new Date(date).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** Tek kayıt satırı (ürün geçmişinde de kullanılır) */
export const AuditEntry = ({ entry, compact = false }) => {
  const Icon = ICONS[entry.category] || History;
  return (
    <li className="aud-row" data-category={entry.category || "other"}>
      <span className="aud-icon" aria-hidden="true"><Icon /></span>
      <div className="aud-main">
        <p className="aud-title">
          <strong>{entry.action}</strong>
          {!compact && (entry.targetName || entry.target) && <span className="aud-target"> · {entry.targetName || entry.target}</span>}
        </p>
        {entry.changes?.length > 0 && (
          <ul className="aud-changes">
            {entry.changes.map((change, index) => (
              <li key={index}>
                <span className="aud-change-label">{change.label}</span>
                {change.from && change.from !== "—" && <span className="aud-from">{change.from}</span>}
                {change.from && change.from !== "—" && <ArrowRight aria-label="yerine" />}
                <span className="aud-to">{change.to}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="aud-meta">
          {entry.actor?.name || entry.actor?.email || "Bilinmeyen yönetici"} · {compact ? `${dayLabel(entry.createdAt)} ` : ""}{clock(entry.createdAt)}
        </p>
      </div>
    </li>
  );
};

export default function AdminAuditTab() {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(async ({ before } = {}) => {
    const requestId = ++requestRef.current;
    if (before) setLoadingMore(true);
    else setLoading(true);
    try {
      const { data } = await axios.get("/orders-analytics/audit", {
        params: { limit: 50, ...(category && { category }), ...(debounced && { q: debounced }), ...(before && { before }) },
      });
      if (requestId !== requestRef.current) return;
      setEntries((current) => (before ? [...current, ...(data.entries || [])] : data.entries || []));
      setHasMore(Boolean(data.hasMore));
      setError("");
    } catch {
      if (requestId === requestRef.current) setError("İşlem kayıtları yüklenemedi");
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [category, debounced]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const out = [];
    for (const entry of entries) {
      const key = dayKey(entry.createdAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(entry);
      else out.push({ key, label: dayLabel(entry.createdAt), items: [entry] });
    }
    return out;
  }, [entries]);

  return (
    <section className="ui-panel aud">
      <div className="aud-toolbar">
        <div className="ui-search aud-search">
          <Search aria-hidden="true" />
          <input className="ui-field" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Ürün, işlem ya da değer ara (örn. süt, fiyat, tükendi)" aria-label="İşlem kayıtlarında ara" />
        </div>
        <button type="button" className="ui-icon-btn" onClick={() => load()} aria-label="Yenile" title="Yenile">
          <RefreshCw className={loading ? "ui-spin" : ""} />
        </button>
      </div>
      <div className="ui-chips aud-chips" role="group" aria-label="Bölüm">
        {AUDIT_CATEGORIES.map(({ key, label, icon: Icon }) => (
          <button key={key || "all"} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>
            <Icon />{label}
          </button>
        ))}
        {(category || query) && (
          <button type="button" className="aud-clear" onClick={() => { setCategory(""); setQuery(""); }}><X />Temizle</button>
        )}
      </div>

      {error && <p role="alert" className="ui-banner ui-banner--danger">{error}</p>}

      {loading && entries.length === 0 ? (
        <div className="aud-skeleton">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ui-skeleton" />)}</div>
      ) : entries.length === 0 && !error ? (
        <div className="ui-empty">
          <History />
          <strong>{query || category ? "Bu filtreye uyan kayıt yok" : "Henüz kayıt yok"}</strong>
          <span className="ui-muted">Ürün, fiyat, stok, kampanya, sipariş ve ayar değişiklikleri burada görünür.</span>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="aud-day">
            <h3 className="aud-day-title">{group.label}<span className="ui-count">{group.items.length}</span></h3>
            <ul className="aud-list">
              {group.items.map((entry) => <AuditEntry key={entry._id} entry={entry} />)}
            </ul>
          </div>
        ))
      )}

      {hasMore && (
        <div className="aud-more">
          <button type="button" className="ui-btn ui-btn--sm" disabled={loadingMore}
            onClick={() => load({ before: entries[entries.length - 1]?.createdAt })}>
            {loadingMore ? <RefreshCw className="ui-spin" /> : <ChevronDown />}Daha eski kayıtlar
          </button>
        </div>
      )}
    </section>
  );
}
