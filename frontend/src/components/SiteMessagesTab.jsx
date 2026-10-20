// Başvurular ve mesajlar: sitedeki iletişim formu ve KVKK başvuru formundan gelen kayıtlar.
// KVKK başvurularında 30 günlük yasal yanıt süresi izlenir. Liste + ayrıntı çekmecesi kalıbı.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Copy, Hourglass, Inbox, Mail, MessageSquare, Phone, PlayCircle, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import {
  Drawer, EmptyState, KpiCard, KpiGrid, PageHeader, Segmented, ShortcutHelp, SkeletonCards, SkeletonRows,
  fold, formatDateTime, initials, timeAgo, useDebounced, useIsMobile, useListShortcuts, useNow, usePref,
} from "./admin/ui";
import "../styles/site-messages.css";

const KINDS = [
  { id: "", label: "Tümü" },
  { id: "kvkk", label: "KVKK başvurusu", icon: ShieldCheck },
  { id: "contact", label: "İletişim mesajı", icon: MessageSquare },
];
const TOPICS = {
  siparis: "Sipariş sorunu", teslimat: "Teslimat sorunu", iade: "İade / değişim", urun: "Ürün hakkında", genel: "Genel soru", sikayet: "Şikayet", oneri: "Öneri",
  bilgi: "Bilgi talebi", erisim: "Verilere erişim", duzeltme: "Düzeltme", silme: "Hesap / veri silme", itiraz: "İtiraz", diger: "Diğer",
};
const STATUS = {
  new: { label: "Yeni", tone: "warn", icon: Sparkles },
  in_progress: { label: "İşlemde", tone: "info", icon: PlayCircle },
  done: { label: "Tamamlandı", tone: "ok", icon: CheckCircle2 },
};
const STATUS_FILTERS = [
  { id: "open", label: "Açık" },
  { id: "new", label: "Yeni", tone: "warn" },
  { id: "in_progress", label: "İşlemde", tone: "info" },
  { id: "done", label: "Tamamlandı", tone: "ok" },
  { id: "all", label: "Tümü" },
];
const KVKK_DEADLINE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const daysLeft = (createdAt, now) => KVKK_DEADLINE_DAYS - Math.floor((now - new Date(createdAt).getTime()) / DAY_MS);
const reference = (item) => `#${String(item._id).slice(-6).toUpperCase()}`;
const PAGE = 50;

const DeadlineBadge = ({ item, now }) => {
  if (item.kind !== "kvkk" || item.status === "done") return null;
  const left = daysLeft(item.createdAt, now);
  const tone = left <= 0 ? "danger" : left <= 7 ? "danger" : left <= 14 ? "warn" : "";
  return (
    <span className={`ui-badge ${tone ? `ui-badge--${tone}` : ""}`} title="KVKK'ya göre başvurular en geç 30 gün içinde yanıtlanmalıdır">
      <Hourglass aria-hidden="true" />
      {left > 0 ? `${left} gün kaldı` : "Yasal süre doldu"}
    </span>
  );
};

const replyMailto = (item) => {
  const subject = encodeURIComponent(`${item.kind === "kvkk" ? "KVKK başvurunuz" : "Mesajınız"} hakkında · ${reference(item)}`);
  const body = encodeURIComponent(`Sayın ${item.name},\n\n${formatDateTime(item.createdAt)} tarihli "${TOPICS[item.topic] || item.topic}" konulu ${item.kind === "kvkk" ? "başvurunuz" : "mesajınız"} tarafımıza ulaştı.\n\n\n\nSaygılarımızla,\nBenim Marketim`);
  return `mailto:${item.email}?subject=${subject}&body=${body}`;
};

// ── Ayrıntı çekmecesi ──────────────────────────────────────────────────
const MessageDrawer = ({ item, now, busy, onClose, onStatus }) => {
  const kindMeta = KINDS.find((k) => k.id === item.kind) || KINDS[2];
  const left = daysLeft(item.createdAt, now);
  const progress = Math.max(0, Math.min(100, Math.round(((KVKK_DEADLINE_DAYS - left) / KVKK_DEADLINE_DAYS) * 100)));
  const copyMessage = () => navigator.clipboard?.writeText(`${reference(item)} · ${item.name} · ${item.email}${item.phone ? ` · ${item.phone}` : ""}\n${TOPICS[item.topic] || item.topic}\n\n${item.message}`).then(() => toast.success("Mesaj kopyalandı"));
  return (
    <Drawer title={item.name} subtitle={`${kindMeta.label} · ${reference(item)} · ${formatDateTime(item.createdAt)}`} icon={kindMeta.icon} width={520} onClose={onClose}
      footer={(
        <>
          <a className="ui-btn" href={replyMailto(item)}><Mail aria-hidden="true" />E-posta ile yanıtla</a>
          {item.status !== "done" ? (
            <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => onStatus(item, "done")}><CheckCircle2 aria-hidden="true" />Tamamlandı</button>
          ) : (
            <button type="button" className="ui-btn" disabled={busy} onClick={() => onStatus(item, "in_progress")}><RotateCcw aria-hidden="true" />Yeniden aç</button>
          )}
        </>
      )}>
      <section className="sms-section">
        <div className="sms-section-head"><h3>Durum</h3>{item.handledBy?.name && <span className="ui-muted">Son işlem: {item.handledBy.name}{item.handledAt ? ` · ${timeAgo(item.handledAt, now)}` : ""}</span>}</div>
        <Segmented ariaLabel="Durum" value={item.status} onChange={(value) => value !== item.status && onStatus(item, value)}
          options={Object.entries(STATUS).map(([value, meta]) => ({ value, label: meta.label, icon: meta.icon, tone: meta.tone }))} />
        {item.kind === "kvkk" && item.status !== "done" && (
          <div className="sms-deadline" data-tone={left <= 7 ? "danger" : left <= 14 ? "warn" : "ok"}>
            <div className="sms-deadline-top">
              <span><Hourglass aria-hidden="true" />{left > 0 ? `Yasal yanıt süresi: ${left} gün kaldı` : "Yasal yanıt süresi doldu"}</span>
              <span className="ui-muted">30 gün · {formatDateTime(new Date(new Date(item.createdAt).getTime() + KVKK_DEADLINE_DAYS * DAY_MS))}</span>
            </div>
            <div className="sms-meter" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
          </div>
        )}
      </section>

      <section className="sms-section">
        <div className="sms-section-head"><h3>Başvuran</h3></div>
        <div className="sms-person">
          <span className="ui-avatar">{initials(item.name)}</span>
          <div className="ui-grow">
            <p className="ui-list-title">{item.name}</p>
            <div className="sms-contact">
              <a className="ui-btn ui-btn--sm" href={`mailto:${item.email}`}><Mail aria-hidden="true" />{item.email}</a>
              {item.phone && <a className="ui-btn ui-btn--sm" href={`tel:${item.phone}`}><Phone aria-hidden="true" />{item.phone}</a>}
            </div>
          </div>
        </div>
      </section>

      <section className="sms-section">
        <div className="sms-section-head">
          <h3>{item.kind === "kvkk" ? "Başvuru" : "Mesaj"}</h3>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={copyMessage}><Copy aria-hidden="true" />Kopyala</button>
        </div>
        <p className="sms-topic">{TOPICS[item.topic] || item.topic}</p>
        <div className="sms-message">{item.message}</div>
        <p className="ui-hint">Yanıtlar e-posta ile verilir; “E-posta ile yanıtla” düğmesi konu ve referans numarasıyla hazır taslak açar.</p>
      </section>
    </Drawer>
  );
};

// ── Ana ekran ─────────────────────────────────────────────────────────
export default function SiteMessagesTab() {
  const [kind, setKind] = useState("");
  const [status, setStatus] = usePref("admin-site-messages-status", "open");
  const [topic, setTopic] = useState("");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState({ kvkk: 0, contact: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [cursor, setCursor] = useState(-1);
  const [selectedId, setSelectedId] = useState(null);
  const searchRef = useRef(null);
  const search = useDebounced(query, 200);
  const isMobile = useIsMobile();
  const now = useNow();

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/site-messages", { params: kind ? { kind } : {} });
      setMessages(data.messages || []);
      setOpen({ kvkk: data.open?.kvkk || 0, contact: data.open?.contact || 0 });
    } catch (err) {
      setError(err?.response?.data?.message || "Başvurular alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = { all: messages.length, open: 0, new: 0, in_progress: 0, done: 0 };
    for (const m of messages) {
      if (c[m.status] !== undefined) c[m.status] += 1;
      if (m.status !== "done") c.open += 1;
    }
    return c;
  }, [messages]);
  const topics = useMemo(() => {
    const map = new Map();
    for (const m of messages) map.set(m.topic, (map.get(m.topic) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [messages]);
  const overdueSoon = useMemo(() => messages.filter((m) => m.kind === "kvkk" && m.status !== "done" && daysLeft(m.createdAt, now) <= 7).length, [messages, now]);

  const visible = useMemo(() => {
    const q = fold(search);
    return messages.filter((m) => {
      if (status === "open" ? m.status === "done" : status !== "all" && m.status !== status) return false;
      if (topic && m.topic !== topic) return false;
      if (!q) return true;
      return fold(`${m.name} ${m.email} ${m.phone || ""} ${m.message} ${TOPICS[m.topic] || m.topic} ${reference(m)}`).includes(q);
    });
  }, [messages, status, topic, search]);
  const shown = visible.slice(0, limit);
  const selected = messages.find((m) => m._id === selectedId) || null;
  const hasFilters = Boolean(kind) || status !== "open" || Boolean(topic) || Boolean(search);
  useEffect(() => { setLimit(PAGE); setCursor(-1); }, [kind, status, topic, search]);
  useEffect(() => { setTopic(""); }, [kind]);

  const setItemStatus = async (item, next) => {
    setBusyId(item._id);
    const previous = item.status;
    setMessages((list) => list.map((m) => (m._id === item._id ? { ...m, status: next } : m)));
    try {
      const { data } = await axios.patch(`/site-messages/${item._id}`, { status: next });
      if (data?.message) setMessages((list) => list.map((m) => (m._id === item._id ? { ...m, ...data.message } : m)));
      // Açık sayaçları yerelde güncelle (yeniden yükleme gerekmez)
      const delta = previous !== "done" && next === "done" ? -1 : previous === "done" && next !== "done" ? 1 : 0;
      if (delta) setOpen((o) => ({ ...o, [item.kind]: Math.max(0, (o[item.kind] || 0) + delta) }));
      toast.success(`${STATUS[next].label} · ${reference(item)}`);
    } catch (err) {
      setMessages((list) => list.map((m) => (m._id === item._id ? { ...m, status: previous } : m)));
      toast.error(err?.response?.data?.message || "Durum güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const clearFilters = () => { setKind(""); setStatus("open"); setTopic(""); setQuery(""); };

  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: (dir) => setCursor((c) => Math.max(0, Math.min(shown.length - 1, c + dir))),
    open: () => { if (cursor >= 0 && shown[cursor]) setSelectedId(shown[cursor]._id); },
    escape: () => setCursor(-1),
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
  });
  useEffect(() => {
    if (cursor < 0) return;
    document.querySelector(`.sms-row[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="ui-page sms">
      <PageHeader
        title="Başvurular ve mesajlar"
        description="Sitedeki KVKK başvuru formundan ve iletişim formundan gelen kayıtlar."
        meta={open.kvkk + open.contact > 0 ? `${open.kvkk + open.contact} açık` : undefined}
        actions={<button type="button" className="ui-btn" onClick={() => load()} disabled={loading}><RefreshCw className={loading ? "ui-spin" : ""} aria-hidden="true" />Yenile</button>}
      />

      {loading && !messages.length ? <SkeletonCards count={4} /> : (
        <KpiGrid>
          <KpiCard icon={ShieldCheck} label="Açık KVKK başvurusu" value={open.kvkk} note="30 gün içinde yanıtlanmalı" tone="brand" active={kind === "kvkk"} onClick={() => setKind(kind === "kvkk" ? "" : "kvkk")} />
          <KpiCard icon={MessageSquare} label="Açık iletişim mesajı" value={open.contact} note="yanıt bekliyor" tone="info" active={kind === "contact"} onClick={() => setKind(kind === "contact" ? "" : "contact")} />
          <KpiCard icon={Hourglass} label="Süresi yaklaşan KVKK" value={overdueSoon} note={kind === "contact" ? "KVKK listesinde görünür" : "7 gün ya da daha az kaldı"} tone={overdueSoon ? "danger" : "ok"} />
          <KpiCard icon={Sparkles} label="Yeni kayıt" value={counts.new} note="henüz işleme alınmadı" tone="warn" active={status === "new"} onClick={() => setStatus(status === "new" ? "open" : "new")} />
        </KpiGrid>
      )}

      <div className="sms-toolbar">
        <label className="ui-search sms-search">
          <Search aria-hidden="true" />
          <input ref={searchRef} className="ui-field" type="search" placeholder="Ad, e-posta, telefon, mesaj ya da referans…" aria-label="Başvurularda ara"
            value={query} data-esc-clear="true" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Segmented ariaLabel="Form türü" value={kind} onChange={setKind}
          options={KINDS.map((k) => ({ value: k.id, label: k.label, icon: k.icon, count: k.id === "kvkk" ? open.kvkk : k.id === "contact" ? open.contact : undefined }))} />
      </div>
      <div className="sms-toolbar">
        <div className="ui-chips sms-chips" role="group" aria-label="Durum filtresi">
          {STATUS_FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={status === item.id} onClick={() => setStatus(item.id)}>
              {item.tone && <span className={`ui-dot ui-dot--${item.tone}`} aria-hidden="true" />}
              {item.label}<span className="sms-chip-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <select className="ui-field ui-field--sm ui-field--auto sms-topic-select" aria-label="Konu" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Tüm konular</option>
          {topics.map(([id, n]) => <option key={id} value={id}>{TOPICS[id] || id} ({n})</option>)}
        </select>
      </div>

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle aria-hidden="true" /><span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}

      {loading && !messages.length ? <SkeletonRows rows={6} /> : !visible.length ? (
        <section className="ui-panel">
          {hasFilters ? (
            <EmptyState icon={Search} title="Bu filtrelere uyan kayıt yok" description="Durum, tür ya da aramayı değiştirin."
              action={<button type="button" className="ui-btn" onClick={clearFilters}>Filtreleri temizle</button>} />
          ) : (
            <EmptyState icon={Inbox} title="Açık başvuru yok" description="Sitedeki formlardan gelen yeni kayıtlar burada görünür." />
          )}
        </section>
      ) : (
        <section className="ui-panel sms-list" aria-busy={loading}>
          {shown.map((item, index) => {
            const meta = STATUS[item.status] || STATUS.new;
            const busy = busyId === item._id;
            return (
              <article key={item._id} className="sms-row" data-index={index} data-active={cursor === index} data-status={item.status} tabIndex={0} role="button"
                aria-label={`${item.name} kaydını aç`} onClick={() => setSelectedId(item._id)} onKeyDown={(e) => { if (e.key === "Enter") setSelectedId(item._id); }}>
                <span className={`sms-kind sms-kind--${item.kind}`} title={item.kind === "kvkk" ? "KVKK başvurusu" : "İletişim mesajı"}>
                  {item.kind === "kvkk" ? <ShieldCheck aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
                </span>
                <div className="sms-main">
                  <div className="sms-title">
                    <p className="ui-list-title ui-truncate">{item.name}</p>
                    <span className="sms-topic-tag">{TOPICS[item.topic] || item.topic}</span>
                  </div>
                  <p className="sms-excerpt">{item.message}</p>
                  <p className="sms-meta">
                    <span>{reference(item)}</span>
                    <span>{item.email}</span>
                    {item.phone && <span>{item.phone}</span>}
                    {item.handledBy?.name && <span>Son işlem: {item.handledBy.name}</span>}
                  </p>
                </div>
                <div className="sms-badges">
                  <span className={`ui-badge ui-badge--${meta.tone}`}><meta.icon aria-hidden="true" />{meta.label}</span>
                  <DeadlineBadge item={item} now={now} />
                </div>
                <div className="sms-time" title={formatDateTime(item.createdAt)}>
                  <Clock aria-hidden="true" />{timeAgo(item.createdAt, now)}
                </div>
                <div className="sms-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  {item.status === "new" && (
                    <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => setItemStatus(item, "in_progress")}><PlayCircle aria-hidden="true" />İşleme al</button>
                  )}
                  {item.status !== "done" ? (
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={busy} onClick={() => setItemStatus(item, "done")}><CheckCircle2 aria-hidden="true" />Tamamla</button>
                  ) : (
                    <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => setItemStatus(item, "in_progress")}><RotateCcw aria-hidden="true" />Yeniden aç</button>
                  )}
                  <a className="ui-icon-btn ui-icon-btn--sm" href={replyMailto(item)} aria-label="E-posta ile yanıtla" title="E-posta ile yanıtla"><Mail /></a>
                </div>
              </article>
            );
          })}
          {visible.length > shown.length && (
            <div className="sms-more">
              <button type="button" className="ui-btn" onClick={() => setLimit((l) => l + PAGE)}>Daha fazla göster <span className="ui-muted">({visible.length - shown.length} kaldı)</span></button>
            </div>
          )}
        </section>
      )}

      <footer className="sms-foot">
        <span className="ui-muted">{visible.length} kayıt{hasFilters ? " (filtreli)" : ""}{messages.length >= 200 ? " · son 200 kayıt gösteriliyor" : ""}</span>
        {!isMobile && <span className="ui-muted sms-kbd"><kbd>/</kbd> ara · <kbd>j</kbd><kbd>k</kbd> gezin · <kbd>↵</kbd> aç · <kbd>?</kbd> yardım</span>}
      </footer>

      {selected && <MessageDrawer item={selected} now={now} busy={busyId === selected._id} onClose={() => setSelectedId(null)} onStatus={setItemStatus} />}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
