// Bekleyen destekler: yapay zekânın temsilciye aktardığı görüşmeler. KPI'lar, öncelik/durum filtreleri,
// kart listesi (15 dk üstü vurgulu), "Üstlen" / "Çözüldü" / "Sohbeti aç".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Clock, Headphones, Inbox, Keyboard, MessageSquare, RefreshCw, Search, Timer, UserCheck, CheckCircle2, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import socketService from "../lib/socket";
import { useUserStore } from "../stores/useUserStore";
import { useConfirm } from "./ConfirmModal";
import {
  EmptyState, KpiCard, KpiGrid, PageHeader, ShortcutHelp, SkeletonCards, SkeletonRows, Segmented,
  fold, formatDateTime, useListShortcuts, useNow,
} from "./admin/ui";
import { ChatAvatar, LATE_AFTER_MS, REQUEST_STATUS, priorityOf, waitLabel } from "./chat/chatShared";
import "../styles/chat.css";

const SUPPORT_EVENTS = ["SupportRequestCreated", "SupportRequestAccepted", "SupportRequestClosed"];
const STATUS_OPTIONS = [
  { value: "open", label: "Açık" },
  { value: "waiting", label: "Bekliyor", tone: "warn" },
  { value: "in_progress", label: "Görüşülüyor", tone: "ok" },
  { value: "mine", label: "Bana atanan", tone: "info" },
];
const PRIORITY_CHIPS = [
  { value: "all", label: "Tüm öncelikler" },
  { value: "urgent", label: "Acil" },
  { value: "high", label: "Yüksek" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Düşük" },
];
const isOpen = (r) => r.status === "waiting" || r.status === "accepted" || r.status === "in_progress";
const waitingSince = (r) => r.createdAt;
const isToday = (value, now) => {
  const d = new Date(value); const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const avgMinutes = (requests) => {
  const spans = requests.filter((r) => r.acceptedAt && r.createdAt).map((r) => new Date(r.acceptedAt) - new Date(r.createdAt)).filter((ms) => ms >= 0);
  if (!spans.length) return null;
  return Math.round(spans.reduce((a, b) => a + b, 0) / spans.length / 60000);
};

const Ticket = ({ request, now, cursor, mine, onOpen, onAccept, onClose, busy }) => {
  const ref = useRef(null);
  useEffect(() => { if (cursor) ref.current?.scrollIntoView({ block: "nearest" }); }, [cursor]);
  const priority = priorityOf(request.priority);
  const statusInfo = REQUEST_STATUS[request.status] || { label: request.status, badge: "" };
  const waitMs = now - new Date(waitingSince(request)).getTime();
  const late = request.status === "waiting" && waitMs >= LATE_AFTER_MS ? "true" : request.status === "waiting" && waitMs >= LATE_AFTER_MS * 0.6 ? "soon" : "false";
  const conversationId = request.conversation?._id || request.conversation;
  const assignedToOther = request.assignedTo && !mine;
  return (
    <article ref={ref} className="cht-ticket" data-status={request.status} data-late={late === "true"} data-cursor={cursor} aria-label={`${request.user?.name || "Müşteri"} destek talebi`}>
      <span className="cht-ticket-avatar"><ChatAvatar name={request.user?.name} src={request.user?.avatar} /></span>
      <div className="cht-ticket-main">
        <div className="cht-ticket-top">
          <h3 className="cht-ticket-name">{request.user?.name || "Müşteri"}</h3>
          <span className={`ui-badge ${priority.badge}`}>{priority.label}</span>
          <span className={`ui-badge ${statusInfo.badge}`}>{statusInfo.label}</span>
          {request.assignedTo && <span className="ui-badge ui-badge--info"><UserCheck /> {mine ? "Siz" : request.assignedTo.name}</span>}
          {request.conversation?.type === "order" && <span className="ui-badge">Sipariş</span>}
          <span className="cht-wait" data-late={late} title={`Açılış: ${formatDateTime(request.createdAt)}`}>
            {late === "true" ? <AlertTriangle /> : <Clock />} {waitLabel(waitingSince(request), now)}{request.status === "waiting" ? " bekliyor" : ""}
          </span>
        </div>
        {request.reason && <p className="cht-ticket-summary"><b>{request.reason}</b></p>}
        {request.aiSummary && <p className="cht-ticket-summary">{request.aiSummary}</p>}
        {request.conversation?.lastMessage && <p className="cht-ticket-last">Son mesaj: {request.conversation.lastMessage}</p>}
        <div className="cht-ticket-meta">
          <span><Sparkles /> Yapay zekâ aktardı</span>
          <span><Clock /> {formatDateTime(request.createdAt)}</span>
          {request.acceptedAt && <span><UserCheck /> Üstlenildi {formatDateTime(request.acceptedAt)}</span>}
          {request.user?.phone && <span>{request.user.phone}</span>}
        </div>
      </div>
      <div className="cht-ticket-actions">
        {request.status === "waiting" && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => onAccept(request)} disabled={busy}><UserCheck /> Üstlen</button>
        )}
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => onOpen(conversationId)} disabled={!conversationId}><MessageSquare /> Sohbeti aç</button>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => onClose(request)} disabled={busy || assignedToOther} title={assignedToOther ? "Başka bir görevliye atanmış" : "Talebi çözüldü olarak kapat"}>
          <CheckCircle2 /> Çözüldü
        </button>
      </div>
    </article>
  );
};

export default function SupportQueueTab({ onOpenChat }) {
  const { user } = useUserStore();
  const { confirm } = useConfirm();
  const now = useNow(15000);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(null);
  const searchRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);
      setError(null);
      const { data } = await axios.get("/support-requests");
      setRequests(data.supportRequests || []);
    } catch (e) {
      setError(e.response?.data?.message || "Bekleyen destekler alınamadı");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = socketService.connect();
    const refresh = () => load({ silent: true });
    SUPPORT_EVENTS.forEach((event) => socket.on(event, refresh));
    return () => SUPPORT_EVENTS.forEach((event) => socket.off(event, refresh));
  }, [load]);

  const accept = useCallback(async (request) => {
    try {
      setBusyId(request._id);
      await axios.post(`/support-requests/${request._id}/accept`);
      toast.success("Görüşme size atandı");
      await load({ silent: true });
      onOpenChat?.(request.conversation?._id || request.conversation);
    } catch (e) {
      toast.error(e.response?.data?.message || "Görüşme alınamadı");
      await load({ silent: true });
    } finally {
      setBusyId(null);
    }
  }, [load, onOpenChat]);

  const close = useCallback(async (request) => {
    const ok = await confirm({ title: "Talebi kapat", message: `${request.user?.name || "Müşteri"} için destek talebi çözüldü olarak kapatılacak; sohbet de kapanır.`, confirmText: "Çözüldü", cancelText: "Vazgeç", type: "warning" });
    if (!ok) return;
    try {
      setBusyId(request._id);
      await axios.post(`/support-requests/${request._id}/close`);
      setRequests((prev) => prev.filter((r) => r._id !== request._id));
      toast.success("Destek talebi kapatıldı");
    } catch (e) {
      toast.error(e.response?.data?.message || "Destek kapatılamadı");
      await load({ silent: true });
    } finally {
      setBusyId(null);
    }
  }, [confirm, load]);

  // ── Özet ve süzme ────────────────────────────────────────────────────
  const open = useMemo(() => requests.filter(isOpen), [requests]);
  const waiting = useMemo(() => open.filter((r) => r.status === "waiting"), [open]);
  const late = useMemo(() => waiting.filter((r) => now - new Date(r.createdAt).getTime() >= LATE_AFTER_MS), [waiting, now]);
  const today = useMemo(() => requests.filter((r) => isToday(r.createdAt, now)), [requests, now]);
  const avgFirstResponse = useMemo(() => avgMinutes(requests), [requests]);
  const myId = String(user?._id || "");
  const isMine = (r) => r.assignedTo && String(r.assignedTo._id || r.assignedTo) === myId;

  const filtered = useMemo(() => {
    const q = fold(search.trim());
    return open
      .filter((r) => {
        if (statusFilter === "waiting" && r.status !== "waiting") return false;
        if (statusFilter === "in_progress" && r.status === "waiting") return false;
        if (statusFilter === "mine" && !isMine(r)) return false;
        if (priorityFilter !== "all" && (r.priority || "normal") !== priorityFilter) return false;
        if (!q) return true;
        return [r.user?.name, r.user?.email, r.user?.phone, r.reason, r.aiSummary, r.conversation?.lastMessage].some((v) => fold(v).includes(q));
      })
      .sort((a, b) => {
        // Bekleyenler önce, sonra öncelik, sonra en uzun bekleyen
        if ((a.status === "waiting") !== (b.status === "waiting")) return a.status === "waiting" ? -1 : 1;
        const p = priorityOf(b.priority).rank - priorityOf(a.priority).rank;
        if (p) return p;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, statusFilter, priorityFilter, search, myId]);
  const hasFilter = statusFilter !== "open" || priorityFilter !== "all" || search.trim();
  const priorityCounts = useMemo(() => open.reduce((acc, r) => { const k = r.priority || "normal"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}), [open]);

  // ── Klavye ───────────────────────────────────────────────────────────
  const move = useCallback((delta) => {
    if (!filtered.length) return;
    const index = filtered.findIndex((r) => r._id === cursor);
    const next = index < 0 ? (delta > 0 ? 0 : filtered.length - 1) : Math.min(filtered.length - 1, Math.max(0, index + delta));
    setCursor(filtered[next]._id);
  }, [filtered, cursor]);
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move,
    open: () => { const r = filtered.find((x) => x._id === cursor); if (r) onOpenChat?.(r.conversation?._id || r.conversation); },
    escape: () => setCursor(null),
    searchEscape: (e) => { setSearch(""); e.target.blur(); },
    extra: {
      a: () => { const r = filtered.find((x) => x._id === cursor); if (r && r.status === "waiting") accept(r); },
      r: () => load({ silent: true }),
    },
  });

  return (
    <div className="ui-page cht">
      <PageHeader
        title="Bekleyen destekler"
        description="Yapay zekânın temsilciye aktardığı görüşmeler. 15 dakikadan uzun bekleyenler vurgulanır."
        meta={waiting.length ? `${waiting.length} bekliyor` : undefined}
        actions={(
          <>
            <button type="button" className="ui-icon-btn" onClick={() => setHelpOpen(true)} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)"><Keyboard /></button>
            <button type="button" className="ui-btn" onClick={() => load({ silent: true })} disabled={refreshing}><RefreshCw className={refreshing ? "ui-spin" : ""} /> Yenile</button>
          </>
        )}
      />

      {loading ? <SkeletonCards count={4} /> : (
        <KpiGrid columns={4}>
          <KpiCard icon={Inbox} label="Bekleyen" value={waiting.length} tone={waiting.length ? "warn" : "ok"} note={late.length ? `${late.length} talep 15 dk'yı aştı` : "Hepsi zamanında"} active={statusFilter === "waiting"} onClick={() => setStatusFilter(statusFilter === "waiting" ? "open" : "waiting")} />
          <KpiCard icon={AlertTriangle} label="Geciken" value={late.length} tone={late.length ? "danger" : "ok"} note="15 dk üstü bekleyen" />
          <KpiCard icon={Headphones} label="Görüşülüyor" value={open.length - waiting.length} tone="info" note={`${open.filter(isMine).length} tanesi sizde`} active={statusFilter === "in_progress"} onClick={() => setStatusFilter(statusFilter === "in_progress" ? "open" : "in_progress")} />
          <KpiCard icon={Timer} label="Ort. ilk yanıt" value={avgFirstResponse === null ? "—" : `${avgFirstResponse} dk`} tone="brand" note={avgFirstResponse === null ? "Üstlenilen talep yok" : `Bugün açılan: ${today.length}`} />
        </KpiGrid>
      )}

      <div className="cht-toolbar">
        <div className="ui-search">
          <Search />
          <input ref={searchRef} type="search" className="ui-field" placeholder="Müşteri, konu, özet ara…" aria-label="Destek talebi ara" value={search} onChange={(e) => setSearch(e.target.value)} data-esc-clear="1" />
        </div>
        <Segmented options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} ariaLabel="Durum filtresi" size="sm" />
        <span className="cht-toolbar-sep" aria-hidden="true" />
        <div className="ui-chips" role="group" aria-label="Öncelik filtresi">
          {PRIORITY_CHIPS.map((c) => (
            <button key={c.value} type="button" aria-pressed={priorityFilter === c.value} onClick={() => setPriorityFilter(c.value)}>
              {c.label}{c.value !== "all" && <span className="ui-count">{priorityCounts[c.value] || 0}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && !loading && (
        <div className="ui-banner ui-banner--danger" role="alert" style={{ borderRadius: "var(--ui-radius)" }}>
          <AlertTriangle /><span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}

      {loading ? (
        <div className="ui-panel"><SkeletonRows rows={5} height={88} /></div>
      ) : error && !requests.length ? null : filtered.length === 0 ? (
        <div className="ui-panel">
          {hasFilter ? (
            <EmptyState icon={Search} title="Eşleşen talep yok" description="Filtreleri değiştirin ya da temizleyin."
              action={<button type="button" className="ui-btn ui-btn--sm" onClick={() => { setStatusFilter("open"); setPriorityFilter("all"); setSearch(""); }}>Filtreleri temizle</button>} />
          ) : (
            <EmptyState icon={CheckCircle2} title="Kuyruk temiz" description="Şu an temsilci bekleyen görüşme yok. Yeni talepler anında burada belirir."
              action={<button type="button" className="ui-btn ui-btn--sm" onClick={() => load({ silent: true })}><RefreshCw /> Yenile</button>} />
          )}
        </div>
      ) : (
        <div className="cht-queue" role="list" aria-label="Destek talepleri">
          {filtered.map((request) => (
            <Ticket key={request._id} request={request} now={now} cursor={cursor === request._id} mine={isMine(request)} busy={busyId === request._id}
              onOpen={(id) => onOpenChat?.(id)} onAccept={accept} onClose={close} />
          ))}
        </div>
      )}

      <div className="cht-kbd-hint">
        <span><kbd>/</kbd> ara</span>
        <span><kbd>j</kbd><kbd>k</kbd> gez</span>
        <span><kbd>↵</kbd> sohbeti aç</span>
        <span><kbd>a</kbd> üstlen</span>
        <span><kbd>r</kbd> yenile</span>
        <span><kbd>?</kbd> yardım</span>
      </div>
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={[[["a"], "Seçili talebi üstlen"], [["r"], "Listeyi yenile"]]} />
    </div>
  );
}
