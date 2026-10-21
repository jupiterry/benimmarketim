// Geri bildirimler ekranı: sipariş sonrası anketler ve müşteri mesajları.
// Akış: KPI → puan dağılımı → araç çubuğu (arama, durum çipleri, kategori, sıralama) → liste → sağ çekmece
// (tam metin, alt puanlar, bağlı sipariş özeti, durum, yönetici yanıtı, silme).
// Uç noktalar: GET /feedback, PATCH /feedback/:id/status, PATCH /feedback/:id/reply, GET /feedback/:id/order, DELETE /feedback/:id,
// POST /feedback/:id/compensate (telafi kuponu). "Rapor" görünümü: feedback/SatisfactionReport.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Star, MessageSquare, Search, X, CheckCircle2, Trash2, RefreshCw, Download, Clock, Eye,
  ShoppingBag, ExternalLink, CornerDownRight, Inbox, CalendarDays, Tag, Reply, RotateCcw, SlidersHorizontal,
  ThumbsUp, ThumbsDown, Gift, PackageX, Headphones, Truck, BarChart3, List,
} from "lucide-react";
import SatisfactionReport from "./feedback/SatisfactionReport";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import socketService from "../lib/socket";
import {
  PageHeader, EmptyState, SkeletonCards, SkeletonRows, KpiCard, KpiGrid, Drawer, Segmented, Skeleton,
  undoable, useListShortcuts, ShortcutHelp, usePref, useDebounced, useNow, formatDateTime, timeAgo,
  fold, initials, money, setHandoff, HANDOFF,
} from "./admin/ui";
import { useConfirm } from "./ConfirmModal";
import "../styles/feedback.css";

const STATUSES = ["Yeni", "İnceleniyor", "Çözüldü", "Kapatıldı"];
const STATUS_UI = {
  Yeni: { tone: "info", icon: Clock },
  "İnceleniyor": { tone: "warn", icon: Eye },
  "Çözüldü": { tone: "ok", icon: CheckCircle2 },
  "Kapatıldı": { tone: "", icon: X },
};
const RATING_LABELS = { usability: "Kullanım kolaylığı", expectations: "Beklenti karşılama", repeat: "Tekrar tercih", overall: "Genel" };
// Mobil uygulamadaki sipariş sonrası anketin hazır seçenekleri (backend FEEDBACK_TAGS ile aynı)
const TAG_LABELS = {
  hizli: "Hızlı geldi", taze: "Ürünler tazeydi", kurye: "Kurye nazikti", fiyat: "Fiyatlar uygundu", kolay: "Uygulama kolaydı",
  gec: "Geç geldi", eksik: "Eksik ürün vardı", yanlis: "Yanlış ürün geldi", bozuk: "Ürün bozuk/ezikti", pahali: "Fiyatlar yüksekti", uygulama: "Uygulamada sorun yaşadım",
  kurye_kotu: "Kurye ilgisizdi", paket: "Paketleme kötüydü",
};
const NEGATIVE_TAGS = new Set(["gec", "eksik", "yanlis", "bozuk", "pahali", "uygulama", "kurye_kotu", "paket"]);
// Backend lib/feedbackOptions.js ile aynı
const ISSUE_LABELS = { bozuk: "Bozuk / ezik", eksik: "Eksik geldi", yanlis: "Yanlış ürün" };
const ABANDON_LABELS = { fiyat: "Fiyatlar yüksek", teslimat: "Teslimat süresi uzun", urun_yok: "Aradığım ürün yok", minimum: "Minimum sepet tutarı yüksek", sonra: "Sonra sipariş vereceğim", diger: "Diğer" };
const KINDS = [
  { value: "", label: "Tüm türler" },
  { value: "order", label: "Sipariş anketi (1-3-5)" },
  { value: "quick", label: "Hızlı soru (👍/👎)" },
  { value: "nps", label: "Tavsiye puanı (NPS)" },
  { value: "abandon", label: "Sepetten vazgeçme" },
  { value: "general", label: "Uygulama mesajı" },
];
const kindOf = (f) => (f?.kind && f.kind !== "general" ? f.kind : f?.milestone ? "order" : "general");
const COMP_PRESETS = [25, 50, 75];
const DEFAULT_TITLE = "Genel Değerlendirme";
const DEFAULT_MESSAGE = "Puan bazlı değerlendirme";
const MAX_REPLY = 1000;
const PAGE = 50;
const DAY = 24 * 60 * 60 * 1000;
const SORTS = [
  { value: "newest", label: "Önce yeni" },
  { value: "oldest", label: "Önce eski" },
  { value: "low", label: "Düşük puan önce" },
  { value: "high", label: "Yüksek puan önce" },
];

// ── Yardımcılar ───────────────────────────────────────────────────────────
const ratingOf = (f) => {
  if (Number(f?.rating) > 0) return Number(f.rating);
  const values = Object.values(f?.ratings || {}).filter((v) => v > 0);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
};
const hasReply = (f) => Boolean(f?.adminReply?.text);
const hasCompensation = (f) => Boolean(f?.compensation?.code);
const needsAction = (f) => f?.thumb === "down" || (Number(f?.rating) > 0 && Number(f.rating) <= 2) || (f?.problemItems?.length || 0) > 0;
// 👍, olumlu tavsiye puanı ve vazgeçme yanıtları yanıt beklemez; listede bilgi olarak durur
const isInformational = (f) => f?.thumb === "up" || (f?.kind === "nps" && Number(f?.npsScore) >= 7) || f?.kind === "abandon";
const isPending = (f) => !hasReply(f) && !isInformational(f) && (f?.status === "Yeni" || f?.status === "İnceleniyor");
const customerName = (f) => f?.user?.name || "Müşteri";
const messageOf = (f) => (f?.message && f.message !== DEFAULT_MESSAGE ? f.message : "");
const titleOf = (f) => (f?.title && f.title !== DEFAULT_TITLE ? f.title : "");
const tagLabel = (tag) => TAG_LABELS[tag] || tag;
const fmtScore = (n) => Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const Stars = ({ value, size }) => (
  <span className={`ui-stars ${size === "lg" ? "fbk-stars--lg" : ""}`} aria-label={`${fmtScore(value)} / 5`} title={`${fmtScore(value)} / 5`}>
    {[1, 2, 3, 4, 5].map((n) => <Star key={n} className="ui-star" data-on={n <= Math.round(value) ? "true" : undefined} aria-hidden="true" />)}
  </span>
);

const StatusBadge = ({ status }) => {
  const ui = STATUS_UI[status] || STATUS_UI.Yeni;
  const Icon = ui.icon;
  return <span className={`ui-badge ${ui.tone ? `ui-badge--${ui.tone}` : ""}`}><Icon aria-hidden="true" />{status}</span>;
};

const CustomerAvatar = ({ f }) => {
  const [broken, setBroken] = useState(false);
  const src = f?.user?.avatar;
  return (
    <span className="ui-avatar fbk-avatar" aria-hidden="true">
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(customerName(f))}
    </span>
  );
};

/** Puan sütunu: yıldız, 👍/👎, NPS (0-10) ya da vazgeçme nedeni */
const ScoreCell = ({ f, rating }) => {
  if (f.thumb) {
    const up = f.thumb === "up";
    const Icon = up ? ThumbsUp : ThumbsDown;
    return <span className="fbk-thumb" data-tone={up ? "ok" : "danger"}><Icon aria-hidden="true" />{up ? "Memnun" : "Memnun değil"}</span>;
  }
  if (f.kind === "nps" && f.npsScore != null) {
    const tone = f.npsScore >= 9 ? "ok" : f.npsScore <= 6 ? "danger" : "warn";
    return <span className={`ui-badge ui-badge--${tone}`} title="Bizi bir arkadaşına önerir misin? (0-10)">Tavsiye {f.npsScore}/10</span>;
  }
  if (f.kind === "abandon") return <span className="ui-muted ui-text-xs">{ABANDON_LABELS[f.reason] || "—"}</span>;
  return (
    <>
      <Stars value={rating} />
      <span className="ui-num fbk-score">{fmtScore(rating)}</span>
    </>
  );
};

// ── Liste satırı ──────────────────────────────────────────────────────────
const FeedbackRow = ({ f, now, active, selected, onOpen, onReply, onResolve, onDelete, rowRef }) => {
  const rating = ratingOf(f);
  const text = messageOf(f);
  const title = titleOf(f);
  return (
    <div
      ref={rowRef}
      className="ui-list-row fbk-row"
      role="button"
      tabIndex={0}
      data-active={active || undefined}
      data-selected={selected || undefined}
      data-tone={needsAction(f) ? "danger" : undefined}
      data-pending={isPending(f) || undefined}
      aria-label={`${customerName(f)}, ${fmtScore(rating)} puan, ${f.status}`}
      onClick={() => onOpen(f)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(f); } }}
    >
      <CustomerAvatar f={f} />
      <div className="fbk-main">
        <div className="fbk-main-top">
          <strong className="ui-list-title ui-truncate">{customerName(f)}</strong>
          {f.milestone && <span className="ui-badge ui-badge--brand">{f.milestone}. sipariş</span>}
          {f.kind === "abandon" && <span className="ui-badge ui-badge--warn">Sepetten vazgeçti</span>}
          {f.problemItems?.length > 0 && <span className="ui-badge ui-badge--danger"><PackageX />{f.problemItems.length} ürün sorunu</span>}
          {hasCompensation(f) && <span className="ui-badge ui-badge--ok"><Gift />{f.compensation.amount} TL kupon</span>}
          {f.category && f.category !== "Genel" && <span className={`ui-badge ${f.category === "Şikayet" || f.category === "Hata Bildirimi" ? "ui-badge--danger" : ""}`}>{f.category}</span>}
        </div>
        <p className="fbk-text">
          {title && <strong>{title}{text ? " — " : ""}</strong>}
          {text || (!title && !f.tags?.length ? <span className="ui-muted">Yalnızca puan verildi</span> : null)}
        </p>
        {f.tags?.length > 0 && (
          <div className="fbk-tags">
            {f.tags.map((tag) => <span key={tag} className="fbk-tag" data-neg={NEGATIVE_TAGS.has(tag) || undefined}>{tagLabel(tag)}</span>)}
          </div>
        )}
      </div>
      <div className="fbk-rating"><ScoreCell f={f} rating={rating} /></div>
      <div className="fbk-date">
        <time dateTime={f.createdAt} title={formatDateTime(f.createdAt)}>{timeAgo(f.createdAt, now)}</time>
        {f.order && <span className="fbk-order-flag" title="Bağlı sipariş var"><ShoppingBag aria-hidden="true" />Sipariş</span>}
      </div>
      <div className="fbk-status">
        <StatusBadge status={f.status} />
        {hasReply(f) && <span className="fbk-replied"><CornerDownRight aria-hidden="true" />Yanıtlandı</span>}
      </div>
      <div className="fbk-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <button type="button" className="ui-icon-btn" onClick={() => onReply(f)} aria-label="Yanıtla" title="Yanıtla (r)"><Reply /></button>
        {f.status !== "Çözüldü" && (
          <button type="button" className="ui-icon-btn" onClick={() => onResolve(f)} aria-label="Çözüldü işaretle" title="Çözüldü işaretle (c)"><CheckCircle2 /></button>
        )}
        <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={() => onDelete(f)} aria-label="Sil" title="Sil"><Trash2 /></button>
      </div>
    </div>
  );
};

// ── Çekmece ───────────────────────────────────────────────────────────────
const FeedbackDrawer = ({ f, order, onClose, onStatus, onReply, onDelete, onOpenOrder, onOpenChat, onCompensate, focusReply, busy }) => {
  const confirm = useConfirm();
  const saved = f.adminReply?.text || "";
  const [draft, setDraft] = useState(saved);
  const [compAmount, setCompAmount] = useState("");
  const textareaRef = useRef(null);
  const suggested = order?.data?.suggestedCompensation;
  useEffect(() => { setCompAmount(""); }, [f._id]);
  useEffect(() => { setDraft(f.adminReply?.text || ""); }, [f._id, f.adminReply?.text]);
  useEffect(() => {
    if (focusReply) textareaRef.current?.focus();
  }, [focusReply, f._id]);

  const dirty = draft.trim() !== saved.trim();
  const rating = ratingOf(f);
  const subRatings = Object.entries(f.ratings || {}).filter(([key, v]) => v > 0 && !(key === "overall" && Number(f.rating) === v));
  const text = messageOf(f);
  const title = titleOf(f);
  const replyBy = f.adminReply?.by?.name;

  const save = () => { if (dirty && draft.trim()) onReply(f, draft.trim()); };
  const onDirtyClose = () => confirm({
    title: "Yazılan yanıt kaydedilmedi",
    message: "Çekmeceyi kapatırsanız yazdığınız yanıt kaybolur.",
    confirmText: "Kapat",
    cancelText: "Yazmaya devam et",
    type: "warning",
  });

  return (
    <Drawer
      title={customerName(f)}
      subtitle={[f.user?.email, formatDateTime(f.createdAt)].filter(Boolean).join(" · ")}
      icon={MessageSquare}
      width={560}
      onClose={onClose}
      dirty={dirty}
      onDirtyClose={onDirtyClose}
      className="fbk-drawer"
      footer={(
        <div className="ui-between fbk-drawer-foot">
          <button type="button" className="ui-btn ui-btn--ghost fbk-btn-danger" onClick={() => onDelete(f)}><Trash2 />Sil</button>
          <div className="ui-cluster">
            {f.status === "Çözüldü" ? (
              <button type="button" className="ui-btn" disabled={busy} onClick={() => onStatus(f, "Yeni")}><RotateCcw />Yeniden aç</button>
            ) : (
              <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => onStatus(f, "Çözüldü")}><CheckCircle2 />Çözüldü işaretle</button>
            )}
          </div>
        </div>
      )}
    >
      <div className="ui-stack fbk-drawer-body">
        {/* Puan ve rozetler */}
        <section className="fbk-hero" data-tone={needsAction(f) || (rating > 0 && rating <= 2) ? "danger" : rating >= 4 || f.thumb === "up" || f.npsScore >= 9 ? "ok" : "warn"}>
          <div className="fbk-hero-score">
            {rating > 0 ? (
              <>
                <span className="fbk-hero-num ui-num">{fmtScore(rating)}</span>
                <Stars value={rating} size="lg" />
              </>
            ) : <ScoreCell f={f} rating={rating} />}
          </div>
          {Number(f.deliveryRating) > 0 && (
            <dl className="fbk-subratings">
              <div><dt><Truck aria-hidden="true" /> Teslimat / kurye</dt><dd><Stars value={f.deliveryRating} /><span className="ui-num">{f.deliveryRating}</span></dd></div>
            </dl>
          )}
          <div className="ui-cluster fbk-hero-badges">
            <StatusBadge status={f.status} />
            {f.milestone && <span className="ui-badge ui-badge--brand">{f.milestone}. sipariş anketi</span>}
            {f.kind === "quick" && <span className="ui-badge ui-badge--brand">Sipariş sonrası hızlı soru</span>}
            {f.kind === "nps" && <span className="ui-badge ui-badge--brand">Aylık tavsiye sorusu</span>}
            {f.kind === "abandon" && <span className="ui-badge ui-badge--warn">Sepetten vazgeçti: {ABANDON_LABELS[f.reason] || f.reason}</span>}
            {f.category && <span className="ui-badge">{f.category}</span>}
            {f.visibility === "private" && <span className="ui-badge" title="Yalnızca yönetici görür">Gizli</span>}
          </div>
          {subRatings.length > 0 && (
            <dl className="fbk-subratings">
              {subRatings.map(([key, v]) => (
                <div key={key}><dt>{RATING_LABELS[key] || key}</dt><dd><Stars value={v} /><span className="ui-num">{v}</span></dd></div>
              ))}
            </dl>
          )}
        </section>

        {/* Mesaj */}
        <section className="fbk-section">
          <h3 className="ui-overline">Mesaj</h3>
          {title && <p className="ui-strong">{title}</p>}
          {text ? <p className="fbk-message">{text}</p> : <p className="ui-muted">Müşteri açıklama yazmadı; yalnızca puan{f.tags?.length ? " ve hazır seçenekler" : ""} gönderdi.</p>}
          {f.tags?.length > 0 && (
            <div className="fbk-tags">
              {f.tags.map((tag) => <span key={tag} className="fbk-tag" data-neg={NEGATIVE_TAGS.has(tag) || undefined}><Tag aria-hidden="true" />{tagLabel(tag)}</span>)}
            </div>
          )}
        </section>

        {/* Ürün bazında sorunlar */}
        {f.problemItems?.length > 0 && (
          <section className="fbk-section">
            <h3 className="ui-overline">Sorun bildirilen ürünler</h3>
            <ul className="fbk-problems">
              {f.problemItems.map((item, i) => (
                <li key={`${item.name}-${item.issue}-${i}`}><span className="ui-truncate"><PackageX aria-hidden="true" /> {item.name}</span><strong>{ISSUE_LABELS[item.issue] || item.issue}</strong></li>
              ))}
            </ul>
          </section>
        )}

        {/* Otomatik çözüm: destek görüşmesi ve telafi kuponu */}
        {(f.supportChat || needsAction(f) || hasCompensation(f)) && (
          <section className="fbk-section">
            <h3 className="ui-overline">Çözüm</h3>
            {f.supportChat && (
              <div className="ui-between">
                <span className="ui-text-sm">Destek kuyruğunda kayıt açıldı; müşteriye görüşmeden yazabilirsiniz.</span>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => onOpenChat(f)}><Headphones />Görüşmeyi aç</button>
              </div>
            )}
            {hasCompensation(f) ? (
              <p className="ui-text-sm"><Gift aria-hidden="true" /> <strong>{f.compensation.amount} TL</strong> telafi kuponu verildi: <span className="ui-mono">{f.compensation.code}</span> · {formatDateTime(f.compensation.at)}. Müşteriye bildirim gönderildi.</p>
            ) : (
              <div className="ui-stack ui-stack--sm">
                <span className="ui-text-sm">Telafi kuponu (müşteriye özel, tek kullanımlık, 30 gün geçerli):</span>
                <div className="fbk-comp-row">
                  {[...new Set([suggested, ...COMP_PRESETS].filter(Boolean))].map((amount) => (
                    <button key={amount} type="button" className={`ui-btn ui-btn--sm ${amount === suggested ? "ui-btn--primary" : ""}`} disabled={busy}
                      title={amount === suggested ? "Sipariş tutarına göre önerilen" : undefined} onClick={() => onCompensate(f, amount)}>
                      <Gift />{amount} TL{amount === suggested ? " · önerilen" : ""}
                    </button>
                  ))}
                  <input type="number" min={10} max={500} inputMode="numeric" className="ui-field fbk-comp-input" placeholder="Tutar" aria-label="Telafi tutarı (TL)"
                    value={compAmount} onChange={(e) => setCompAmount(e.target.value)} />
                  <button type="button" className="ui-btn ui-btn--sm" disabled={busy || !(Number(compAmount) >= 10)} onClick={() => onCompensate(f, Number(compAmount))}>Ver</button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Bağlı sipariş */}
        {f.order && (
          <section className="fbk-section">
            <div className="ui-between">
              <h3 className="ui-overline">Bağlı sipariş</h3>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => onOpenOrder(f)}><ExternalLink />Siparişi aç</button>
            </div>
            {!order || order.loading ? (
              <div className="ui-stack ui-stack--sm"><Skeleton height={18} width="60%" /><Skeleton height={12} width="40%" /><Skeleton height={12} width="50%" /></div>
            ) : order.error ? (
              <p className="ui-muted">{order.error}</p>
            ) : (
              <div className="fbk-order">
                <div className="fbk-order-head">
                  <span className="ui-mono">#{order.data.orderId.slice(-6).toUpperCase()}</span>
                  <span className="ui-badge">{order.data.status}</span>
                  <span className="ui-num ui-strong">{money(order.data.totalAmount)}</span>
                  <span className="ui-muted">{order.data.itemCount} ürün · {formatDateTime(order.data.createdAt)}</span>
                </div>
                <ul className="fbk-order-lines">
                  {order.data.products.slice(0, 5).map((p, i) => (
                    <li key={i}><span className="ui-truncate">{p.name}</span><span className="ui-num ui-muted">×{p.quantity}</span><span className="ui-num">{money(p.price * p.quantity)}</span></li>
                  ))}
                  {order.data.products.length > 5 && <li className="ui-muted">+{order.data.products.length - 5} ürün daha</li>}
                </ul>
                {order.data.deliveryPointName && <p className="ui-muted ui-text-xs">Teslim noktası: {order.data.deliveryPointName}</p>}
              </div>
            )}
          </section>
        )}

        {/* Durum */}
        <section className="fbk-section">
          <h3 className="ui-overline">Durum</h3>
          <Segmented
            ariaLabel="Durum"
            value={f.status}
            onChange={(status) => { if (status !== f.status) onStatus(f, status); }}
            options={STATUSES.map((s) => ({ value: s, label: s, tone: STATUS_UI[s].tone || undefined }))}
          />
        </section>

        {/* Yanıt */}
        <section className="fbk-section">
          <h3 className="ui-overline">Yönetici yanıtı</h3>
          {saved && (
            <div className="fbk-reply">
              <CornerDownRight aria-hidden="true" />
              <div>
                <p className="fbk-message">{saved}</p>
                <span className="ui-muted ui-text-xs">{replyBy || "Yönetici"} · {formatDateTime(f.adminReply?.at)}</span>
              </div>
            </div>
          )}
          <label className="ui-label" htmlFor="fbk-reply-input">{saved ? "Yanıtı düzenle" : "Yanıt yaz"}</label>
          <textarea
            id="fbk-reply-input"
            ref={textareaRef}
            className="ui-field fbk-textarea"
            value={draft}
            maxLength={MAX_REPLY}
            rows={4}
            placeholder="Müşteriye kısa ve net bir yanıt yazın…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); } }}
          />
          <div className="ui-between fbk-reply-foot">
            <span className="ui-hint"><kbd className="ui-kbd">Ctrl</kbd> + <kbd className="ui-kbd">↵</kbd> kaydeder · <span className="ui-num">{draft.length}/{MAX_REPLY}</span></span>
            <div className="ui-cluster">
              {saved && <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={busy} onClick={() => onReply(f, "")}>Yanıtı kaldır</button>}
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={busy || !dirty || !draft.trim()} onClick={save}><Reply />{saved ? "Yanıtı güncelle" : "Yanıtı kaydet"}</button>
            </div>
          </div>
        </section>
      </div>
    </Drawer>
  );
};

// ── Ekran ─────────────────────────────────────────────────────────────────
const FeedbackList = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(0);
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 200);
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | replied | <durum>
  const [ratingFilter, setRatingFilter] = useState(0);
  const [tagFilter, setTagFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [view, setView] = usePref("fbk-view", "list");
  const [sort, setSort] = usePref("fbk-sort", "newest");
  const [visible, setVisible] = useState(PAGE);
  const [cursor, setCursor] = useState(-1);
  const [selectedId, setSelectedId] = useState(null);
  const [focusReply, setFocusReply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState({}); // feedbackId → { loading, data, error }
  const now = useNow(60000);
  const searchRef = useRef(null);
  const rowRefs = useRef(new Map());

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/feedback");
      setItems(Array.isArray(data) ? data : []);
      setFresh(0);
    } catch (err) {
      console.error("Geri bildirimler yüklenemedi:", err);
      setError(err?.response?.data?.message || "Geri bildirimler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Düşük puanlı yeni anket geldiğinde (sunucu adminRoom'a yayınlar) sessiz bildirim
  useEffect(() => {
    let socket;
    try { socket = socketService.getSocket(); } catch { return undefined; }
    if (!socket) return undefined;
    const onLow = () => setFresh((n) => n + 1);
    socket.on("lowFeedbackCreated", onLow);
    return () => socket.off("lowFeedbackCreated", onLow);
  }, []);

  // ── Özet sayılar ──
  const stats = useMemo(() => {
    const total = items.length;
    const since7 = now - 7 * DAY;
    const since14 = now - 14 * DAY;
    let sum = 0, rated = 0, last7 = 0, prev7 = 0, pending = 0, sum7 = 0, rated7 = 0;
    const dist = [0, 0, 0, 0, 0, 0];
    const categories = {};
    const tags = {};
    const sub = {};
    for (const f of items) {
      const r = ratingOf(f);
      if (r > 0) { sum += r; rated += 1; dist[Math.min(5, Math.max(1, Math.round(r)))] += 1; }
      const t = new Date(f.createdAt).getTime();
      if (t >= since7) { last7 += 1; if (r > 0) { sum7 += r; rated7 += 1; } } else if (t >= since14) prev7 += 1;
      if (isPending(f)) pending += 1;
      categories[f.category || "Genel"] = (categories[f.category || "Genel"] || 0) + 1;
      for (const tag of f.tags || []) tags[tag] = (tags[tag] || 0) + 1;
      for (const [key, v] of Object.entries(f.ratings || {})) if (v > 0) { sub[key] = sub[key] || { sum: 0, n: 0 }; sub[key].sum += v; sub[key].n += 1; }
    }
    const replied = items.filter(hasReply).length;
    return {
      total, pending, replied, last7, prev7, dist, categories,
      avg: rated ? sum / rated : 0, avg7: rated7 ? sum7 / rated7 : 0, rated,
      delta: prev7 ? ((last7 - prev7) / prev7) * 100 : last7 ? 100 : 0,
      tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 8),
      sub: Object.entries(sub).map(([key, v]) => [key, v.sum / v.n]).filter(([key]) => key !== "overall"),
      byStatus: STATUSES.reduce((acc, s) => { acc[s] = items.filter((f) => f.status === s).length; return acc; }, {}),
    };
  }, [items, now]);

  // ── Filtre + sıralama ──
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    const list = items.filter((f) => {
      if (statusFilter === "pending" && !isPending(f)) return false;
      if (statusFilter === "replied" && !hasReply(f)) return false;
      if (STATUSES.includes(statusFilter) && f.status !== statusFilter) return false;
      if (ratingFilter && Math.round(ratingOf(f)) !== ratingFilter) return false;
      if (tagFilter && !(f.tags || []).includes(tagFilter)) return false;
      if (categoryFilter && (f.category || "Genel") !== categoryFilter) return false;
      if (kindFilter && kindOf(f) !== kindFilter) return false;
      if (q) {
        const hay = fold([customerName(f), f.user?.email, f.title, f.message, f.adminReply?.text, ...(f.tags || []).map(tagLabel)].filter(Boolean).join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const time = (f) => new Date(f.createdAt).getTime();
    list.sort((a, b) => {
      if (sort === "oldest") return time(a) - time(b);
      if (sort === "low") return ratingOf(a) - ratingOf(b) || time(b) - time(a);
      if (sort === "high") return ratingOf(b) - ratingOf(a) || time(b) - time(a);
      return time(b) - time(a);
    });
    return list;
  }, [items, query, statusFilter, ratingFilter, tagFilter, categoryFilter, kindFilter, sort]);
  const shown = filtered.slice(0, visible);
  const hasFilter = Boolean(query || statusFilter !== "all" || ratingFilter || tagFilter || categoryFilter || kindFilter);
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setRatingFilter(0); setTagFilter(""); setCategoryFilter(""); setKindFilter(""); };
  useEffect(() => { setVisible(PAGE); setCursor(-1); }, [query, statusFilter, ratingFilter, tagFilter, categoryFilter, kindFilter, sort]);

  const selected = selectedId ? items.find((f) => f._id === selectedId) : null;
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);

  // ── İşlemler ──
  const patchItem = (id, patch) => setItems((list) => list.map((f) => (f._id === id ? { ...f, ...patch } : f)));

  const open = useCallback((f, { reply = false } = {}) => {
    setSelectedId(f._id);
    setFocusReply(reply);
    setCursor(filtered.findIndex((x) => x._id === f._id));
    if (f.order && !orders[f._id]) {
      setOrders((map) => ({ ...map, [f._id]: { loading: true } }));
      axios.get(`/feedback/${f._id}/order`)
        .then(({ data }) => setOrders((map) => ({ ...map, [f._id]: { data } })))
        .catch((err) => setOrders((map) => ({ ...map, [f._id]: { error: err?.response?.data?.message || "Sipariş özeti alınamadı." } })));
    }
  }, [filtered, orders]);

  const changeStatus = async (f, status) => {
    const before = f.status;
    patchItem(f._id, { status });
    setBusy(true);
    try {
      const { data } = await axios.patch(`/feedback/${f._id}/status`, { status });
      if (data?._id) patchItem(f._id, { status: data.status });
      toast.success(status === "Çözüldü" ? "Çözüldü olarak işaretlendi" : `Durum: ${status}`);
    } catch (err) {
      patchItem(f._id, { status: before });
      toast.error(err?.response?.data?.message || "Durum güncellenemedi");
    } finally {
      setBusy(false);
    }
  };

  const saveReply = async (f, text) => {
    setBusy(true);
    try {
      const { data } = await axios.patch(`/feedback/${f._id}/reply`, { text });
      patchItem(f._id, { adminReply: data?.adminReply || { text }, status: data?.status || f.status });
      toast.success(text ? "Yanıt kaydedildi" : "Yanıt kaldırıldı");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Yanıt kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  const remove = (f) => {
    const index = items.findIndex((x) => x._id === f._id);
    setItems((list) => list.filter((x) => x._id !== f._id));
    if (selectedId === f._id) setSelectedId(null);
    undoable({
      message: `${customerName(f)} geri bildirimi silindi`,
      icon: <Trash2 />,
      commit: async () => {
        try {
          await axios.delete(`/feedback/${f._id}`);
        } catch (err) {
          toast.error(err?.response?.data?.message || "Silinemedi, kayıt geri yüklendi");
          setItems((list) => (list.some((x) => x._id === f._id) ? list : [...list.slice(0, index), f, ...list.slice(index)]));
        }
      },
      undo: () => setItems((list) => (list.some((x) => x._id === f._id) ? list : [...list.slice(0, index), f, ...list.slice(index)])),
    });
  };

  const compensate = async (f, amount) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`/feedback/${f._id}/compensate`, { amount });
      patchItem(f._id, { compensation: data?.compensation, status: data?.status || f.status });
      toast.success(`${amount} TL telafi kuponu tanımlandı, müşteriye bildirildi`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Kupon oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  const openChat = (f) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "chat");
    url.searchParams.set("chatId", String(f.supportChat));
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "chat" }));
  };

  const openOrder = (f) => {
    const orderId = orders[f._id]?.data?.orderId || String(f.order);
    setHandoff(HANDOFF.order, orderId.slice(-6));
    window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "orders" }));
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    const head = ["Tarih", "Müşteri", "E-posta", "Tür", "Puan", "Teslimat puanı", "👍/👎", "Tavsiye (0-10)", "Kategori", "Anket", "Başlık", "Mesaj", "Etiketler", "Sorunlu ürünler", "Telafi", "Durum", "Yanıt", "Yanıt tarihi", "Sipariş"];
    const rows = filtered.map((f) => [
      formatDateTime(f.createdAt), customerName(f), f.user?.email || "", KINDS.find((k) => k.value === kindOf(f))?.label || "", ratingOf(f) ? fmtScore(ratingOf(f)) : "",
      f.deliveryRating || "", f.thumb === "up" ? "👍" : f.thumb === "down" ? "👎" : "", f.npsScore ?? "", f.category || "", f.milestone ? `${f.milestone}. sipariş` : "",
      titleOf(f), messageOf(f), (f.tags || []).map(tagLabel).join(", "),
      (f.problemItems || []).map((item) => `${item.name} (${ISSUE_LABELS[item.issue] || item.issue})`).join(", "),
      hasCompensation(f) ? `${f.compensation.amount} TL ${f.compensation.code}` : "", f.status, f.adminReply?.text || "", f.adminReply?.at ? formatDateTime(f.adminReply.at) : "", f.order ? String(f.order) : "",
    ]);
    const csv = `\uFEFF${[head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `geri-bildirimler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} kayıt CSV olarak indirildi`);
  };

  // ── Klavye ──
  const moveCursor = (dir) => {
    if (!shown.length) return;
    setCursor((c) => {
      const next = Math.min(shown.length - 1, Math.max(0, (c < 0 ? (dir > 0 ? -1 : shown.length) : c) + dir));
      rowRefs.current.get(shown[next]?._id)?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: moveCursor,
    open: () => { if (cursor >= 0 && shown[cursor]) open(shown[cursor]); },
    escape: () => { if (cursor >= 0) setCursor(-1); else if (hasFilter) clearFilters(); },
    searchEscape: (e) => { if (e.target === searchRef.current) { setSearch(""); e.target.blur(); } },
    extra: {
      r: () => { if (cursor >= 0 && shown[cursor]) open(shown[cursor], { reply: true }); },
      c: () => { if (cursor >= 0 && shown[cursor] && shown[cursor].status !== "Çözüldü") changeStatus(shown[cursor], "Çözüldü"); },
      e: exportCsv,
    },
  });

  const statusChips = [
    { value: "all", label: "Tümü", count: stats.total },
    { value: "pending", label: "Yanıt bekleyen", count: stats.pending, tone: "warn" },
    { value: "replied", label: "Yanıtlanan", count: stats.replied },
    { value: "Çözüldü", label: "Çözüldü", count: stats.byStatus["Çözüldü"] },
    { value: "Kapatıldı", label: "Kapatıldı", count: stats.byStatus["Kapatıldı"] },
  ];
  const maxDist = Math.max(1, ...stats.dist.slice(1));

  return (
    <div className="ui-page fbk">
      <PageHeader
        title="Geri bildirimler"
        description="Sipariş anketleri, 👍/👎 yanıtları, tavsiye puanları ve müşteri mesajları. Okuyun, yanıtlayın, telafi edin."
        meta={stats.pending > 0 ? `${stats.pending} yanıt bekliyor` : undefined}
        actions={(
          <>
            <button type="button" className="ui-btn" onClick={exportCsv} disabled={!filtered.length} title="Görünen listeyi CSV indir (e)"><Download />CSV</button>
            <button type="button" className="ui-btn" onClick={() => load({ silent: items.length > 0 })} disabled={loading}><RefreshCw className={loading ? "ui-spin" : undefined} />Yenile</button>
          </>
        )}
      />

      <div className="fbk-view-switch">
        <Segmented ariaLabel="Görünüm" value={view} onChange={setView}
          options={[{ value: "list", label: "Liste", icon: List }, { value: "report", label: "Memnuniyet raporu", icon: BarChart3 }]} />
      </div>

      {view === "report" ? <SatisfactionReport /> : (<>
      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <span>{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}
      {fresh > 0 && !loading && (
        <div className="ui-banner ui-banner--info">
          <span>{fresh} yeni olumsuz geri bildirim geldi.</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load({ silent: true })}><RefreshCw />Listeyi yenile</button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <>
          <SkeletonCards count={4} />
          <div className="ui-panel"><SkeletonRows rows={8} /></div>
        </>
      ) : items.length === 0 && !error ? (
        <div className="ui-panel">
          <EmptyState
            icon={Inbox}
            title="Henüz geri bildirim yok"
            description="Müşteriler siparişten sonra 👍/👎 verdiğinde, 1., 3. ve 5. siparişteki anketi ya da aylık tavsiye sorusunu yanıtladığında burada görünür."
            action={<button type="button" className="ui-btn" onClick={() => load()}><RefreshCw />Yenile</button>}
          />
        </div>
      ) : (
        <>
          <KpiGrid columns={4}>
            <KpiCard icon={MessageSquare} label="Toplam" value={stats.total.toLocaleString("tr-TR")} note={`${stats.replied} yanıtlandı`} />
            <KpiCard icon={Star} label="Ortalama puan" value={stats.rated ? fmtScore(stats.avg) : "—"} tone={stats.avg >= 4 ? "ok" : stats.avg > 0 && stats.avg < 3 ? "danger" : undefined}
              note={stats.rated ? `5 üzerinden · son 7 gün ${stats.avg7 ? fmtScore(stats.avg7) : "—"}` : "Henüz puan yok"} />
            <KpiCard icon={CalendarDays} label="Son 7 gün" value={stats.last7.toLocaleString("tr-TR")} delta={stats.prev7 || stats.last7 ? Math.round(stats.delta) : undefined} note="önceki 7 güne göre" />
            <KpiCard icon={Clock} label="Yanıt bekleyen" value={stats.pending.toLocaleString("tr-TR")} tone={stats.pending ? "warn" : "ok"}
              note={stats.pending ? "Tıklayın: yalnızca bekleyenler" : "Hepsi yanıtlandı"} active={statusFilter === "pending"} onClick={() => setStatusFilter((s) => (s === "pending" ? "all" : "pending"))} />
          </KpiGrid>

          <div className="fbk-insights">
            <section className="ui-panel fbk-dist" aria-label="Puan dağılımı">
              <div className="ui-panel-head"><h2 className="ui-title">Puan dağılımı</h2><span className="ui-muted ui-text-xs">Çubuğa tıklayın: filtre</span></div>
              <div className="ui-panel-body fbk-dist-body">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = stats.dist[n];
                  const pct = stats.rated ? Math.round((count / stats.rated) * 100) : 0;
                  return (
                    <button key={n} type="button" className="fbk-dist-row" aria-pressed={ratingFilter === n} onClick={() => setRatingFilter((r) => (r === n ? 0 : n))}
                      title={`${n} yıldız: ${count} kayıt (%${pct})`}>
                      <span className="fbk-dist-label"><span className="ui-num">{n}</span><Star className="ui-star" data-on="true" aria-hidden="true" /></span>
                      <span className="fbk-dist-track"><span className="fbk-dist-bar" style={{ width: `${(count / maxDist) * 100}%` }} /></span>
                      <span className="fbk-dist-count ui-num">{count}</span>
                      <span className="fbk-dist-pct ui-num ui-muted">%{pct}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="ui-panel fbk-side" aria-label="Alt puanlar ve etiketler">
              <div className="ui-panel-head"><h2 className="ui-title">Anket özeti</h2><span className="ui-muted ui-text-xs">Etikete tıklayın: filtre</span></div>
              <div className="ui-panel-body ui-stack ui-stack--sm">
                {stats.sub.length > 0 && (
                  <dl className="fbk-subavg">
                    {stats.sub.map(([key, v]) => (
                      <div key={key}><dt>{RATING_LABELS[key] || key}</dt><dd><Stars value={v} /><span className="ui-num">{fmtScore(v)}</span></dd></div>
                    ))}
                  </dl>
                )}
                {stats.tags.length > 0 ? (
                  <div className="fbk-tags fbk-tags--big">
                    {stats.tags.map(([tag, count]) => (
                      <button key={tag} type="button" className="fbk-tag" data-neg={NEGATIVE_TAGS.has(tag) || undefined} aria-pressed={tagFilter === tag} onClick={() => setTagFilter((t) => (t === tag ? "" : tag))}>
                        {tagLabel(tag)}<span className="ui-count">{count}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="ui-muted ui-text-sm">Anketlerde seçilen hazır etiketler burada toplanır.</p>
                )}
              </div>
            </section>
          </div>

          <div className="fbk-toolbar">
            <div className="ui-search fbk-search">
              <Search />
              <input ref={searchRef} type="search" className="ui-field" value={search} data-esc-clear="true" placeholder="Müşteri, e-posta, mesaj, etiket ara…  ( / )"
                aria-label="Geri bildirimlerde ara" onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="ui-chips fbk-chips" role="group" aria-label="Durum filtresi">
              {statusChips.map((chip) => (
                <button key={chip.value} type="button" aria-pressed={statusFilter === chip.value} onClick={() => setStatusFilter(chip.value)}>
                  {chip.tone && <span className={`ui-dot ui-dot--${chip.tone}`} />}{chip.label}<span className="ui-count">{chip.count}</span>
                </button>
              ))}
            </div>
            <div className="fbk-toolbar-right">
              <select className="ui-field ui-field--auto" value={kindFilter} aria-label="Tür" onChange={(e) => setKindFilter(e.target.value)}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <select className="ui-field ui-field--auto" value={categoryFilter} aria-label="Kategori" onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">Tüm kategoriler</option>
                {Object.entries(stats.categories).map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
              </select>
              <select className="ui-field ui-field--auto" value={sort} aria-label="Sıralama" onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {(ratingFilter || tagFilter) && (
            <div className="ui-cluster fbk-active">
              <SlidersHorizontal aria-hidden="true" />
              {ratingFilter > 0 && <button type="button" className="ui-badge ui-badge--brand fbk-active-chip" onClick={() => setRatingFilter(0)}>{ratingFilter} yıldız <X /></button>}
              {tagFilter && <button type="button" className="ui-badge ui-badge--brand fbk-active-chip" onClick={() => setTagFilter("")}>{tagLabel(tagFilter)} <X /></button>}
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={clearFilters}>Filtreleri temizle</button>
            </div>
          )}

          <section className="ui-panel fbk-list" aria-label="Geri bildirim listesi">
            <div className="ui-list-row ui-list-head fbk-row fbk-head" aria-hidden="true">
              <span />
              <span>Müşteri ve mesaj</span>
              <span>Puan</span>
              <span>Tarih</span>
              <span>Durum</span>
              <span />
            </div>
            {shown.length === 0 ? (
              <EmptyState compact icon={Search} title="Filtrelere uyan geri bildirim yok" description="Arama ya da filtreleri değiştirin."
                action={<button type="button" className="ui-btn ui-btn--sm" onClick={clearFilters}>Filtreleri temizle</button>} />
            ) : shown.map((f, i) => (
              <FeedbackRow
                key={f._id}
                f={f}
                now={now}
                active={cursor === i}
                selected={selectedId === f._id}
                rowRef={(el) => { if (el) rowRefs.current.set(f._id, el); else rowRefs.current.delete(f._id); }}
                onOpen={open}
                onReply={(x) => open(x, { reply: true })}
                onResolve={(x) => changeStatus(x, "Çözüldü")}
                onDelete={remove}
              />
            ))}
            <div className="fbk-foot">
              <span className="ui-muted ui-text-xs ui-num">{shown.length} / {filtered.length} kayıt{hasFilter && items.length !== filtered.length ? ` (toplam ${items.length})` : ""}</span>
              {filtered.length > visible && <button type="button" className="ui-btn ui-btn--sm" onClick={() => setVisible((v) => v + PAGE)}>Daha fazla göster</button>}
              <span className="fbk-kbd ui-muted ui-text-xs"><kbd className="ui-kbd">/</kbd> ara · <kbd className="ui-kbd">j</kbd><kbd className="ui-kbd">k</kbd> gez · <kbd className="ui-kbd">↵</kbd> aç · <kbd className="ui-kbd">r</kbd> yanıtla · <kbd className="ui-kbd">?</kbd> yardım</span>
            </div>
          </section>
        </>
      )}
      </>)}

      {selected && view !== "report" && (
        <FeedbackDrawer
          f={selected}
          order={orders[selected._id]}
          busy={busy}
          focusReply={focusReply}
          onClose={() => { setSelectedId(null); setFocusReply(false); }}
          onStatus={changeStatus}
          onReply={saveReply}
          onDelete={remove}
          onOpenOrder={openOrder}
          onOpenChat={openChat}
          onCompensate={compensate}
        />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={[[["r"], "Seçili kaydı yanıtla"], [["c"], "Seçili kaydı çözüldü işaretle"], [["e"], "Görünen listeyi CSV indir"]]} />
    </div>
  );
};

export default FeedbackList;
