// Fotokopi: müşterilerin yüklediği dosyalar, durum akışı (bekliyor → işleniyor → hazır → teslim),
// önizleme/indirme, fiyat ve ödeme bilgisi. Liste + sağdan açılan ayrıntı çekmecesi kalıbı.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock, Copy, Download, Eye, FileCheck, FileImage, FileText,
  Filter, Mail, Palette, Printer, RefreshCw, Search, Trash2, X,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import {
  Drawer, EmptyState, KpiCard, KpiGrid, PageHeader, ShortcutHelp, SkeletonCards, SkeletonRows,
  fold, formatDateTime, initials, timeAgo, undoable, useDebounced, useIsMobile, useListShortcuts, useNow, usePref,
} from "./admin/ui";
import "../styles/photocopy.css";

// Durum akışı: sıradaki adım ve etiketleri tek yerde
const STATUS = {
  pending: { label: "Bekliyor", tone: "warn", icon: Clock, next: "processing", nextLabel: "İşleme al" },
  processing: { label: "İşleniyor", tone: "info", icon: RefreshCw, next: "ready", nextLabel: "Hazırlandı" },
  ready: { label: "Hazır", tone: "brand", icon: FileCheck, next: "completed", nextLabel: "Teslim edildi" },
  completed: { label: "Teslim edildi", tone: "ok", icon: CheckCircle2 },
};
const FLOW = ["pending", "processing", "ready", "completed"];
const FILTERS = [
  { id: "all", label: "Tümü" },
  { id: "pending", label: "Bekliyor", tone: "warn" },
  { id: "processing", label: "İşleniyor", tone: "info" },
  { id: "ready", label: "Hazır", tone: "brand" },
  { id: "completed", label: "Teslim edildi", tone: "ok" },
  { id: "unpaid", label: "Ödenmemiş", tone: "danger" },
];
const SORTS = [
  { value: "newest", label: "Yeni → eski" },
  { value: "oldest", label: "Eski → yeni" },
  { value: "largest", label: "Büyük dosya" },
];
const PAGE = 40;

const fileSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
};
const fileKind = (mime = "", name = "") => {
  const ext = String(name).split(".").pop()?.toLowerCase();
  if (mime.startsWith("image/")) return { label: ext?.toUpperCase() || "Görsel", icon: FileImage, preview: "image" };
  if (mime === "application/pdf" || ext === "pdf") return { label: "PDF", icon: FileText, preview: "pdf" };
  if (mime.includes("word") || ["doc", "docx"].includes(ext)) return { label: ext?.toUpperCase() || "Word", icon: FileText, preview: null };
  return { label: ext?.toUpperCase() || "Dosya", icon: FileText, preview: null };
};
const colorLabel = (color) => (color === "color" ? "Renkli" : "Siyah-beyaz");
const money = (value) => `${(Number(value) || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

const StatusBadge = ({ status }) => {
  const meta = STATUS[status] || { label: status || "Bilinmiyor", tone: "", icon: AlertTriangle };
  const Icon = meta.icon;
  return (
    <span className={`ui-badge ${meta.tone ? `ui-badge--${meta.tone}` : ""}`}>
      <Icon aria-hidden="true" />
      {meta.label}
    </span>
  );
};

// ── Ayrıntı çekmecesi ──────────────────────────────────────────────────
const FileDrawer = ({ file, saving, onClose, onSave, onDownload, onDelete }) => {
  const { confirm } = useConfirm();
  const [form, setForm] = useState({ status: file.status, price: file.price ?? 0, isPaid: Boolean(file.isPaid), adminNotes: file.adminNotes || "" });
  const [preview, setPreview] = useState({ state: "idle", url: "" }); // idle | loading | ready | error
  const kind = fileKind(file.mimeType, file.originalName);
  const dirty = form.status !== file.status || Number(form.price) !== Number(file.price ?? 0) || form.isPaid !== Boolean(file.isPaid) || form.adminNotes !== (file.adminNotes || "");

  useEffect(() => {
    setForm({ status: file.status, price: file.price ?? 0, isPaid: Boolean(file.isPaid), adminNotes: file.adminNotes || "" });
    setPreview({ state: "idle", url: "" });
  }, [file]);
  useEffect(() => () => { if (preview.url) URL.revokeObjectURL(preview.url); }, [preview.url]);

  const loadPreview = async () => {
    setPreview({ state: "loading", url: "" });
    try {
      const response = await axios.get(`/photocopy/download/${file._id}`, { responseType: "blob" });
      const blob = kind.preview === "pdf" ? new Blob([response.data], { type: "application/pdf" }) : response.data;
      setPreview({ state: "ready", url: URL.createObjectURL(blob) });
    } catch {
      setPreview({ state: "error", url: "" });
    }
  };

  const onDirtyClose = () => confirm({ title: "Kaydedilmemiş değişiklik", message: "Değişiklikler kaydedilmedi. Yine de kapatılsın mı?", confirmText: "Kapat", cancelText: "Geri dön", type: "warning" });
  const stepIndex = FLOW.indexOf(form.status);

  return (
    <Drawer
      title={file.originalName}
      subtitle={`${kind.label} · ${fileSize(file.fileSize)} · ${formatDateTime(file.createdAt)}`}
      icon={kind.icon}
      width={520}
      onClose={onClose}
      dirty={dirty}
      onDirtyClose={onDirtyClose}
      footer={(
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>Kapat</button>
          <button type="button" className="ui-btn ui-btn--primary" disabled={!dirty || saving} onClick={() => onSave(file, form)}>
            {saving ? <RefreshCw className="ui-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}Kaydet
          </button>
        </>
      )}
    >
      {/* Durum akışı */}
      <section className="pcp-section">
        <div className="pcp-section-head">
          <h3>Durum</h3>
          {file.status !== form.status && <span className="ui-badge ui-badge--info">Kaydedilmedi</span>}
        </div>
        <ol className="pcp-steps" aria-label="Durum akışı">
          {FLOW.map((step, index) => {
            const Icon = STATUS[step].icon;
            return (
              <li key={step} data-done={index < stepIndex} data-current={index === stepIndex}>
                <button type="button" onClick={() => setForm((f) => ({ ...f, status: step }))} aria-pressed={form.status === step} title={STATUS[step].label}>
                  <span className="pcp-step-dot"><Icon aria-hidden="true" /></span>
                  <span className="pcp-step-label">{STATUS[step].label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {form.status === "ready" && file.status !== "ready" && (
          <p className="ui-hint">Kaydedince müşterinin telefonuna “Fotokopiniz hazır” bildirimi gider.</p>
        )}
      </section>

      {/* Müşteri */}
      <section className="pcp-section">
        <div className="pcp-section-head"><h3>Müşteri</h3></div>
        <div className="pcp-customer">
          <span className="ui-avatar">{initials(file.user?.name)}</span>
          <div className="ui-grow">
            <p className="ui-list-title ui-truncate">{file.user?.name || "Bilinmeyen müşteri"}</p>
            {file.user?.email && <a className="ui-link" href={`mailto:${file.user.email}`}><Mail aria-hidden="true" />{file.user.email}</a>}
          </div>
        </div>
        {file.notes && (
          <div className="pcp-note">
            <span className="ui-overline">Müşteri notu</span>
            <p>{file.notes}</p>
          </div>
        )}
      </section>

      {/* Baskı ayarları */}
      <section className="pcp-section">
        <div className="pcp-section-head"><h3>Baskı ayarları</h3></div>
        <dl className="ui-kv">
          <div><dt>Kopya</dt><dd><Copy aria-hidden="true" /> {file.copies} adet</dd></div>
          <div><dt>Renk</dt><dd><Palette aria-hidden="true" /> {colorLabel(file.color)}</dd></div>
          <div><dt>Kâğıt</dt><dd><Printer aria-hidden="true" /> {file.paperSize || "A4"}</dd></div>
          <div><dt>Tür · boyut</dt><dd>{kind.label} · {fileSize(file.fileSize)}</dd></div>
        </dl>
      </section>

      {/* Dosya önizleme / indirme */}
      <section className="pcp-section">
        <div className="pcp-section-head">
          <h3>Dosya</h3>
          <div className="ui-cluster">
            {kind.preview && preview.state !== "ready" && (
              <button type="button" className="ui-btn ui-btn--sm" onClick={loadPreview} disabled={preview.state === "loading"}>
                {preview.state === "loading" ? <RefreshCw className="ui-spin" aria-hidden="true" /> : <Eye aria-hidden="true" />}Önizle
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => onDownload(file)}><Download aria-hidden="true" />İndir</button>
          </div>
        </div>
        {preview.state === "error" && <div className="ui-banner ui-banner--danger"><AlertTriangle aria-hidden="true" /><span>Önizleme yüklenemedi; dosyayı indirip açın.</span></div>}
        {preview.state === "ready" && (
          <div className="pcp-preview">
            {kind.preview === "image"
              ? <img src={preview.url} alt={file.originalName} />
              : <iframe src={preview.url} title={file.originalName} />}
          </div>
        )}
        {!kind.preview && <p className="ui-hint">Bu dosya türü tarayıcıda önizlenemez; indirip açın.</p>}
      </section>

      {/* Fiyat ve ödeme */}
      <section className="pcp-section">
        <div className="pcp-section-head"><h3>Ücret</h3></div>
        <div className="pcp-price-row">
          <div className="ui-grow">
            <label className="ui-label" htmlFor="pcp-price">Fiyat (₺)</label>
            <input id="pcp-price" className="ui-field" inputMode="decimal" value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^\d.,]/g, "") }))} />
          </div>
          <button type="button" className="ui-toggle pcp-paid" aria-pressed={form.isPaid} onClick={() => setForm((f) => ({ ...f, isPaid: !f.isPaid }))}>
            <i /><span>{form.isPaid ? "Ödendi" : "Ödenmedi"}</span>
          </button>
        </div>
        <label className="ui-label" htmlFor="pcp-admin-notes">Yönetici notu</label>
        <textarea id="pcp-admin-notes" className="ui-field pcp-textarea" rows={3} placeholder="Yalnızca ekip görür: ör. 2 nüsha ciltlendi"
          value={form.adminNotes} onChange={(e) => setForm((f) => ({ ...f, adminNotes: e.target.value }))} />
      </section>

      <section className="pcp-section pcp-section--danger">
        <button type="button" className="ui-btn ui-btn--danger ui-btn--sm" onClick={() => onDelete(file)}>
          <Trash2 aria-hidden="true" />Dosyayı sil
        </button>
        <span className="ui-hint">Dosya sunucudan kaldırılır; 5 saniye içinde geri alabilirsiniz.</span>
      </section>
    </Drawer>
  );
};

// ── Ana ekran ─────────────────────────────────────────────────────────
const PhotocopyTab = () => {
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dates, setDates] = useState({ from: "", to: "" });
  const [datesOpen, setDatesOpen] = useState(false);
  const [sort, setSort] = usePref("admin-photocopy-sort", "newest");
  const [limit, setLimit] = useState(PAGE);
  const [cursor, setCursor] = useState(-1);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const searchRef = useRef(null);
  const search = useDebounced(query, 200);
  const isMobile = useIsMobile();
  const now = useNow();

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const params = {};
      if (dates.from) params.dateFrom = dates.from;
      if (dates.to) params.dateTo = dates.to;
      const [list, summary] = await Promise.all([
        axios.get("/photocopy/admin/all", { params }),
        axios.get("/photocopy/admin/stats").catch(() => null),
      ]);
      setFiles(list.data?.data || []);
      if (summary?.data?.data) setStats(summary.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || "Dosyalar alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [dates.from, dates.to]);
  useEffect(() => { load(); }, [load]);
  // Durum değişince yalnızca özet sayılar tazelenir (liste yerelde güncellenir)
  const refreshStats = useCallback(async () => {
    try {
      const { data } = await axios.get("/photocopy/admin/stats");
      if (data?.data) setStats(data.data);
    } catch { /* özet sayılar bir sonraki yüklemede düzelir */ }
  }, []);

  // Sayımlar (tarih aralığı içindeki dosyalardan)
  const counts = useMemo(() => {
    const c = { all: files.length, pending: 0, processing: 0, ready: 0, completed: 0, unpaid: 0 };
    for (const f of files) {
      if (c[f.status] !== undefined) c[f.status] += 1;
      if (!f.isPaid && f.status !== "completed") c.unpaid += 1;
    }
    return c;
  }, [files]);

  const visible = useMemo(() => {
    const q = fold(search);
    let list = files.filter((f) => {
      if (filter === "unpaid" ? (f.isPaid || f.status === "completed") : filter !== "all" && f.status !== filter) return false;
      if (!q) return true;
      return fold(`${f.originalName} ${f.user?.name || ""} ${f.user?.email || ""} ${f.notes || ""} ${f.adminNotes || ""}`).includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === "largest") return (b.fileSize || 0) - (a.fileSize || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return list;
  }, [files, filter, search, sort]);
  const shown = visible.slice(0, limit);
  const selected = files.find((f) => f._id === selectedId) || null;
  const hasFilters = filter !== "all" || Boolean(search) || Boolean(dates.from || dates.to);

  useEffect(() => { setLimit(PAGE); setCursor(-1); }, [filter, search, sort, dates.from, dates.to]);

  const clearFilters = () => { setFilter("all"); setQuery(""); setDates({ from: "", to: "" }); };

  // ── İşlemler ──
  const saveFile = async (file, form) => {
    setSaving(true);
    try {
      const body = { status: form.status, adminNotes: form.adminNotes, price: Number(String(form.price).replace(",", ".")) || 0, isPaid: form.isPaid };
      const { data } = await axios.put(`/photocopy/admin/${file._id}`, body);
      const updated = { ...file, ...(data?.data || body) };
      setFiles((list) => list.map((f) => (f._id === file._id ? { ...f, ...updated, user: file.user } : f)));
      toast.success("Dosya güncellendi");
      refreshStats();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Dosya güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const advance = async (file) => {
    const next = STATUS[file.status]?.next;
    if (!next) return;
    setBusyId(file._id);
    const previous = file.status;
    setFiles((list) => list.map((f) => (f._id === file._id ? { ...f, status: next } : f)));
    try {
      const { data } = await axios.put(`/photocopy/admin/${file._id}`, { status: next });
      if (data?.data) setFiles((list) => list.map((f) => (f._id === file._id ? { ...f, ...data.data, user: f.user } : f)));
      toast.success(`${STATUS[next].label}${next === "ready" ? " · müşteriye bildirim gönderildi" : ""}`);
      refreshStats();
    } catch (err) {
      setFiles((list) => list.map((f) => (f._id === file._id ? { ...f, status: previous } : f)));
      toast.error(err?.response?.data?.message || "Durum güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const remove = (file) => {
    const snapshot = files;
    setFiles((list) => list.filter((f) => f._id !== file._id));
    if (selectedId === file._id) setSelectedId(null);
    undoable({
      message: `${file.originalName} silindi`,
      icon: <Trash2 />,
      commit: async () => {
        try {
          await axios.delete(`/photocopy/${file._id}`);
          refreshStats();
        } catch (err) {
          toast.error(err?.response?.data?.message || "Dosya silinemedi");
          setFiles(snapshot);
        }
      },
      undo: () => setFiles(snapshot),
    });
  };

  const download = async (file) => {
    const id = toast.loading("İndiriliyor…");
    try {
      const response = await axios.get(`/photocopy/download/${file._id}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Dosya indirildi", { id });
    } catch {
      toast.error("Dosya indirilemedi", { id });
    }
  };

  // ── Klavye ──
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: (dir) => setCursor((c) => Math.max(0, Math.min(shown.length - 1, c + dir))),
    open: () => { if (cursor >= 0 && shown[cursor]) setSelectedId(shown[cursor]._id); },
    escape: () => setCursor(-1),
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
  });
  useEffect(() => {
    if (cursor < 0) return;
    document.querySelector(`.pcp-row[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const readyCount = counts.ready;
  const todayCount = stats?.todayFiles ?? files.filter((f) => sameDay(f.createdAt, now)).length;

  return (
    <div className="ui-page pcp">
      <PageHeader
        title="Fotokopi"
        description="Fotokopi taleplerini ve dosyalarını buradan yönetin."
        meta={stats ? `${stats.totalFiles} dosya` : undefined}
        actions={(
          <button type="button" className="ui-btn" onClick={() => load()} disabled={loading}>
            <RefreshCw className={loading ? "ui-spin" : ""} aria-hidden="true" />Yenile
          </button>
        )}
      />

      {loading && !files.length && !stats ? <SkeletonCards count={4} /> : (
        <KpiGrid>
          <KpiCard icon={Clock} label="Bekliyor" value={stats?.pendingFiles ?? counts.pending} note="işleme alınmayı bekliyor" tone="warn" active={filter === "pending"} onClick={() => setFilter(filter === "pending" ? "all" : "pending")} />
          <KpiCard icon={FileCheck} label="Hazır" value={readyCount} note="teslim bekliyor" tone="brand" active={filter === "ready"} onClick={() => setFilter(filter === "ready" ? "all" : "ready")} />
          <KpiCard icon={CheckCircle2} label="Teslim edildi" value={stats?.completedFiles ?? counts.completed} note="tamamlanan dosya" tone="ok" active={filter === "completed"} onClick={() => setFilter(filter === "completed" ? "all" : "completed")} />
          <KpiCard icon={CalendarDays} label="Bugün gelen" value={todayCount} note={`${counts.unpaid} ödenmemiş`} tone="info" />
        </KpiGrid>
      )}

      {/* Araç çubuğu */}
      <div className="pcp-toolbar">
        <label className="ui-search pcp-search">
          <Search aria-hidden="true" />
          <input ref={searchRef} className="ui-field" type="search" placeholder="Dosya adı, müşteri, e-posta, not…" aria-label="Dosyalarda ara"
            value={query} data-esc-clear="true" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="ui-chips pcp-chips" role="group" aria-label="Durum filtresi">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} data-tone={item.tone} onClick={() => setFilter(item.id)}>
              {item.tone && <span className={`ui-dot ui-dot--${item.tone === "brand" ? "info" : item.tone}`} aria-hidden="true" />}
              {item.label}
              <span className="pcp-chip-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <div className="pcp-toolbar-right">
          <button type="button" className={`ui-btn ui-btn--sm${datesOpen || dates.from || dates.to ? " pcp-btn--on" : ""}`} aria-pressed={datesOpen} onClick={() => setDatesOpen((v) => !v)}>
            <Filter aria-hidden="true" />Tarih{(dates.from || dates.to) && <span className="ui-count">1</span>}
          </button>
          <select className="ui-field ui-field--sm ui-field--auto" aria-label="Sıralama" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      {datesOpen && (
        <div className="pcp-dates">
          <label>
            <span className="ui-label">Başlangıç</span>
            <input type="date" className="ui-field ui-field--sm" value={dates.from} max={dates.to || undefined} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} />
          </label>
          <label>
            <span className="ui-label">Bitiş</span>
            <input type="date" className="ui-field ui-field--sm" value={dates.to} min={dates.from || undefined} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} />
          </label>
          {(dates.from || dates.to) && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setDates({ from: "", to: "" })}><X aria-hidden="true" />Tarihi temizle</button>
          )}
        </div>
      )}

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}

      {/* Liste */}
      {loading && !files.length ? <SkeletonRows rows={6} /> : !visible.length ? (
        <section className="ui-panel">
          {hasFilters ? (
            <EmptyState icon={Search} title="Bu filtrelere uyan dosya yok" description="Arama ya da durum filtresini değiştirin."
              action={<button type="button" className="ui-btn" onClick={clearFilters}>Filtreleri temizle</button>} />
          ) : (
            <EmptyState icon={Printer} title="Henüz fotokopi dosyası yok" description="Müşteriler uygulamadan dosya yüklediğinde burada görünür." />
          )}
        </section>
      ) : (
        <section className="ui-panel pcp-list" aria-busy={loading}>
          {!isMobile && (
            <div className="pcp-head" aria-hidden="true">
              <span>Dosya</span><span>Müşteri</span><span>Yüklendi</span><span>Durum</span><span className="ui-right">İşlem</span>
            </div>
          )}
          {shown.map((file, index) => {
            const kind = fileKind(file.mimeType, file.originalName);
            const Icon = kind.icon;
            const next = STATUS[file.status]?.next;
            const busy = busyId === file._id;
            return (
              <article key={file._id} className="pcp-row" data-index={index} data-active={cursor === index} data-status={file.status}
                onClick={() => setSelectedId(file._id)} onKeyDown={(e) => { if (e.key === "Enter") setSelectedId(file._id); }} tabIndex={0} role="button" aria-label={`${file.originalName} ayrıntısını aç`}>
                <div className="pcp-cell-file">
                  <span className="ui-thumb pcp-thumb" data-kind={kind.preview || "doc"}><Icon aria-hidden="true" /></span>
                  <div className="ui-grow pcp-file-text">
                    <p className="ui-list-title pcp-name">{file.originalName}</p>
                    <p className="pcp-meta">
                      <span>{kind.label}</span><span>{fileSize(file.fileSize)}</span>
                      <span>{file.copies} kopya</span><span>{colorLabel(file.color)}</span><span>{file.paperSize || "A4"}</span>
                      {file.price > 0 && <span className={file.isPaid ? "pcp-paid-ok" : "pcp-paid-no"}>{money(file.price)}{file.isPaid ? " · ödendi" : " · ödenmedi"}</span>}
                    </p>
                    {file.notes && <p className="pcp-row-note ui-truncate" title={file.notes}>“{file.notes}”</p>}
                  </div>
                </div>
                <div className="pcp-cell-user">
                  <span className="ui-avatar pcp-avatar">{initials(file.user?.name)}</span>
                  <div className="ui-grow pcp-user-text">
                    <p className="ui-truncate">{file.user?.name || "Bilinmeyen"}</p>
                    <p className="ui-list-sub ui-truncate">{file.user?.email || "—"}</p>
                  </div>
                </div>
                <div className="pcp-cell-date" title={formatDateTime(file.createdAt)}>
                  <span>{timeAgo(file.createdAt, now)}</span>
                  <span className="ui-list-sub">{formatDateTime(file.createdAt)}</span>
                </div>
                <div className="pcp-cell-status"><StatusBadge status={file.status} /></div>
                <div className="pcp-cell-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  {next && (
                    <button type="button" className="ui-btn ui-btn--sm pcp-next" disabled={busy} onClick={() => advance(file)} title={STATUS[file.status].nextLabel}>
                      {busy ? <RefreshCw className="ui-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                      <span>{STATUS[file.status].nextLabel}</span>
                    </button>
                  )}
                  <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label="İndir" title="İndir" onClick={() => download(file)}><Download /></button>
                  <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label="Ayrıntı" title="Ayrıntı" onClick={() => setSelectedId(file._id)}><Eye /></button>
                  <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" aria-label="Sil" title="Sil" onClick={() => remove(file)}><Trash2 /></button>
                </div>
              </article>
            );
          })}
          {visible.length > shown.length && (
            <div className="pcp-more">
              <button type="button" className="ui-btn" onClick={() => setLimit((l) => l + PAGE)}>
                Daha fazla göster <span className="ui-muted">({visible.length - shown.length} kaldı)</span>
              </button>
            </div>
          )}
        </section>
      )}

      <footer className="pcp-foot">
        <span className="ui-muted">{visible.length} dosya{hasFilters ? " (filtreli)" : ""}</span>
        {!isMobile && (
          <span className="ui-muted pcp-kbd"><kbd>/</kbd> ara · <kbd>j</kbd><kbd>k</kbd> gezin · <kbd>↵</kbd> aç · <kbd>?</kbd> yardım</span>
        )}
      </footer>

      {selected && (
        <FileDrawer file={selected} saving={saving} onClose={() => setSelectedId(null)} onSave={saveFile} onDownload={download}
          onDelete={async (file) => {
            remove(file);
          }} />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
};

export default PhotocopyTab;
