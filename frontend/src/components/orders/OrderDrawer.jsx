// Sipariş detay çekmecesi (C11; C12 arayüzü, C19 çekmece bölümü, C24). Sözleşme: CONTRACTS.md §7.11.
// Ortak Drawer (520 px, className "so-d") içinde sırasıyla: özet (hero) → şeritler → müşteri notu → ürünler →
// iletişim → teslimat bilgileri + kurye notu → zaman çizelgesi → müşteri. Altta yapışkan çubuk: "⋯ Diğer",
// "Yazdır" ve yalnızca kendisi genişleyen sonraki adım düğmesi. "Ürün ekle" aynı çekmecenin ikinci görünümüdür
// (footer yok; Esc / X detaya döner). "?" kısayolu konteynerin; burada işlenmez. Stil: orders-drawer.css (so-d-).
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, Bike, Calendar, Check, CheckSquare, ChevronLeft, ChevronRight, Copy, Info, Landmark, Loader2, Mail, MapPin,
  MessageCircle, MoreHorizontal, PackagePlus, PackageX, Phone, Printer, RotateCcw, Save, Smartphone, Square, Trash2, Wallet, X, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Drawer, formatDateTime, isTypingTarget, money, useMediaQuery } from "../admin/ui";
import { formatPhoneTR } from "../../lib/orderTools";
import { useConfirm } from "../ConfirmModal";
import {
  CallbackBadge, CourierChip, CustomerFace, MenuButton, NextStepButton, PaymentChip, PointChip, PrintedMark, SlaChip, SrOnly, StatusBadge,
  TrustBadges,
} from "./atoms";
import {
  CLICK_GUARD_MS, TZ, buildWhatsAppLink, customerName, customerPhone, describeChanges, getSla, inGChord, isActiveStatus,
  isDeletedCustomer, isDoneStatus, lastStatusTime, moveTargets, nextAction, orderCode, orderCodeTitle, paymentKey, paymentLong,
  platformLabel, pointLabel, shortWhen, statusUi, telHref, toMs, deliveryFeeLabel, hasDeliveryFeeLine, isAddressOrder, orderDeliveryFee,
  deliveryOutcomeLabel,
} from "./shared";
import AddItemPanel from "./AddItemPanel";
import ContactActions from "./drawer/ContactActions";
import CustomerPanel from "./drawer/CustomerPanel";
import DeliveryAddress from "./drawer/DeliveryAddress";
import DeliveryOpsSection, { CallbackPanel, OutcomeNote } from "./drawer/DeliveryOps";
import OrderItems from "./drawer/OrderItems";
import OrderTimeline from "./drawer/OrderTimeline";
import "../../styles/orders-drawer.css";

// Oturum boyunca (çekmece kapanıp açılsa da) tutulanlar: düzenleme kilidi açılmış tamamlanmış siparişler
// ve kaydedilmemiş kurye notu taslakları (başka siparişe geçince yazılan kaybolmaz).
const unlockedOrders = new Set();
const trackingDrafts = new Map();
const TRACKING_MAX = 120;
const EMPTY_KEYS = [];
const EMPTY_CHANGES = [];
const EMPTY_PRODUCTS = [];

const FLOW = ["Hazırlanıyor", "Yolda", "Teslim Edildi"];
const FLOW_LABEL = { "Hazırlanıyor": "Hazırlanıyor", "Yolda": "Yolda", "Teslim Edildi": "Teslim" };

const fullDateTime = (value) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const deviceText = (device) => {
  const platform = platformLabel(device);
  if (!platform) return null;
  return [platform, device?.model, device?.appVersion ? `v${device.appVersion}` : null].filter(Boolean).join(" · ");
};
/** Son iptal kaydını müşteri mi yazdı (changedBy === kullanıcı kimliği) */
const cancelledByCustomer = (order) => {
  const userId = order?.user?.id ? String(order.user.id) : null;
  if (!userId) return false;
  const entries = (order?.statusHistory || []).filter((e) => e?.status === "İptal Edildi");
  const last = entries.sort((a, b) => toMs(a.changedAt) - toMs(b.changedAt)).pop();
  return Boolean(last?.changedBy) && String(last.changedBy) === userId;
};

// ── Durum adımları (salt okunur) ──────────────────────────────────────
function StatusSteps({ order, now }) {
  if (order.status === "İptal Edildi") {
    const at = lastStatusTime(order, "İptal Edildi");
    return (
      <div className="so-d-cancelled">
        <XCircle aria-hidden="true" />
        <strong>
          {deliveryOutcomeLabel(order)
            ? `Teslim edilemedi: ${deliveryOutcomeLabel(order)}`
            : <>{cancelledByCustomer(order) ? "Müşteri iptal etti" : "Sipariş iptal edildi"}{order.cancelReasonLabel ? `: ${order.cancelReasonLabel}` : ""}</>}
        </strong>
        {at && <span className="so-d-cancelled-time ui-num">· {shortWhen(at, now)}</span>}
      </div>
    );
  }
  const current = FLOW.indexOf(order.status);
  if (current < 0) return null;
  const pendingTo = order.pending?.to;
  return (
    <div className="so-d-steps" role="img" aria-label={`Durum: ${statusUi(order.status).label}, ${current + 1}/3`}>
      {FLOW.map((status, i) => {
        const state = i < current || (i === current && status === "Teslim Edildi") ? "done" : i === current ? "current" : "todo";
        const at = i > current ? null : i === 0 ? toMs(order.createdAt) : lastStatusTime(order, status)?.getTime();
        return (
          <div key={status} className="so-d-step" data-state={state} data-tone={statusUi(status).tone}
            data-pending={pendingTo === status ? "true" : undefined}>
            <span className="so-d-step-dot">{state === "done" && <Check />}</span>
            <span className="so-d-step-label">{FLOW_LABEL[status]}</span>
            <span className="so-d-step-time ui-num">{Number.isFinite(at) ? shortWhen(at, now) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Özet içi hızlı iletişim: "Ara" (tel:) ve WhatsApp, ürün listesini kaydırmadan ──
// Şablon menüsü ve "Özeti kopyala" aşağıdaki İletişim bölümünde kalır.
function HeroContact({ order }) {
  const phone = formatPhoneTR(customerPhone(order));
  const tel = telHref(order);
  const whatsapp = buildWhatsAppLink(order, "status");
  return (
    <div className="so-d-hero-contact" role="group" aria-label="Hızlı iletişim">
      {tel ? (
        <a className="ui-icon-btn so-d-hero-act" href={tel} aria-label={`Müşteriyi ara: ${phone}`} title={`${phone} numarasını ara`}>
          <Phone aria-hidden="true" />
        </a>
      ) : (
        <button type="button" className="ui-icon-btn so-d-hero-act" disabled aria-label="Müşteriyi ara" title="Telefon numarası yok">
          <Phone aria-hidden="true" />
        </button>
      )}
      {whatsapp ? (
        <a className="ui-icon-btn so-d-hero-act" href={whatsapp} target="_blank" rel="noopener noreferrer"
          aria-label="WhatsApp ile yaz" title="Duruma göre WhatsApp mesajı (w)">
          <MessageCircle aria-hidden="true" />
        </a>
      ) : (
        <button type="button" className="ui-icon-btn so-d-hero-act" disabled aria-label="WhatsApp ile yaz" title="Telefon numarası tanınmadı">
          <MessageCircle aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Özet (hero) ───────────────────────────────────────────────────────
function Hero({ order, now, position, nextUp, printedAt, headingRef, onNavigate, onOpenOrder }) {
  const index = position?.index ?? -1;
  const total = position?.total ?? 0;
  const showNav = index >= 0 && total > 1;
  const nextSla = nextUp ? getSla(nextUp, now) : null;
  return (
    <section className="so-d-hero" aria-label="Sipariş özeti">
      <div className="so-d-hero-top">
        <CustomerFace order={order} size="lg" className="so-d-hero-face" />
        <div className="so-d-hero-main">
          <div className="so-d-hero-status">
            <StatusBadge status={order.status} />
            <SlaChip order={order} now={now} bar size="md" done />
          </div>
          <div className="so-d-hero-totalrow">
            <h3 className="so-d-hero-total ui-num" ref={headingRef} tabIndex={-1}>
              <SrOnly>Sipariş tutarı </SrOnly>{money(order.totalAmount)}
            </h3>
            <HeroContact order={order} />
          </div>
          <div className="so-d-hero-chips">
            <CallbackBadge order={order} />
            <PaymentChip order={order} />
            <PointChip order={order} />
            <CourierChip order={order} />
            <TrustBadges order={order} />
            <PrintedMark at={printedAt} />
          </div>
        </div>
        {showNav && (
          <div className="so-d-nav" role="group" aria-label="Siparişler arasında gezin">
            <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label="Önceki sipariş (k)" title="Önceki sipariş (k)"
              disabled={index <= 0} onClick={() => onNavigate?.(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="so-d-nav-count ui-num">{index + 1} / {total}</span>
            <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label="Sonraki sipariş (j)" title="Sonraki sipariş (j)"
              disabled={index >= total - 1} onClick={() => onNavigate?.(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <StatusSteps order={order} now={now} />
      {nextUp && nextUp.orderId !== order.orderId && (
        <button type="button" className="so-d-nextup" onClick={() => onOpenOrder?.(nextUp)}
          aria-label={`Sıradaki bekleyen siparişi aç: ${customerName(nextUp)}${nextSla ? `, ${nextSla.hint}` : ""}`}>
          <span className="so-d-nextup-label">Sıradaki bekleyen:</span>
          <strong className="so-d-nextup-name">{customerName(nextUp)}</strong>
          {nextSla && <span className="so-d-nextup-sla ui-num" data-level={nextSla.level}>· {nextSla.label}</span>}
          <ArrowRight className="so-d-nextup-arrow" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

// ── Şerit ─────────────────────────────────────────────────────────────
function Banner({ tone, icon: Icon, children, action, actions, onClose, closeLabel, role = "status" }) {
  return (
    <div className={`ui-banner ui-banner--${tone} so-d-banner`} role={role}>
      <Icon aria-hidden="true" />
      <div className="so-d-banner-text">{children}</div>
      {action}
      {onClose && (
        <button type="button" className="ui-icon-btn ui-icon-btn--sm so-d-banner-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <X aria-hidden="true" />
        </button>
      )}
      {actions && <div className="so-d-banner-actions">{actions}</div>}
    </div>
  );
}

// ── Kurye / teslimat notu ─────────────────────────────────────────────
function TrackingField({ order, disabled, onSave }) {
  const id = useId();
  const orderId = order.orderId;
  const saved = String(order.deliveryTracking || "");
  const [draft, setDraftState] = useState(() => (trackingDrafts.has(orderId) ? trackingDrafts.get(orderId) : null));
  const [saving, setSaving] = useState(false);
  const value = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved.trim();
  const setDraft = (next) => {
    if (next === null) trackingDrafts.delete(orderId);
    else trackingDrafts.set(orderId, next);
    setDraftState(next);
  };
  // Sunucu değeri taslağa ulaşınca (kaydetme sonrası ya da başka bir yerden) taslak bırakılır
  useEffect(() => {
    if (draft !== null && draft.trim().slice(0, TRACKING_MAX) === saved) {
      trackingDrafts.delete(orderId);
      setDraftState(null);
    }
  }, [draft, saved, orderId]);

  const save = async () => {
    if (!dirty || saving || disabled) return;
    const text = value.trim().slice(0, TRACKING_MAX);
    setSaving(true);
    const ok = await onSave?.(order, text);
    setSaving(false);
    if (ok) {
      toast.success("Teslimat notu kaydedildi");
      trackingDrafts.set(orderId, text);
      setDraftState(text);
    }
  };
  const hint = dirty
    ? (saved ? `Kaydedilmedi · kayıtlı: “${saved}” · Esc geri alır` : "Kaydedilmedi · Enter kaydeder, Esc vazgeçer")
    : (saved ? "Kayıtlı · aramada ve CSV’de görünür" : "Aramada ve CSV’de görünür");

  return (
    <div className="so-d-track-wrap">
      <label className="ui-label so-d-track-label" htmlFor={id}>Kurye / teslimat notu</label>
      <div className="so-d-track">
        <input
          id={id}
          className="ui-field"
          value={value}
          maxLength={TRACKING_MAX}
          placeholder="Oda no, kurye adı, takip no…"
          autoComplete="off"
          disabled={disabled || saving}
          data-esc-clear={dirty ? "true" : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape" && dirty) {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
            }
          }}
        />
        <button type="button" className="ui-btn so-d-track-save" onClick={save} disabled={!dirty || saving || disabled}>
          {saving ? <Loader2 className="ui-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Kaydet
        </button>
      </div>
      <p id={`${id}-hint`} className="ui-hint so-d-track-hint" data-dirty={dirty ? "true" : undefined}>
        <span className="so-d-track-hint-text">{hint}</span>
        <span className="so-d-track-count ui-num" aria-hidden="true">{value.length}/{TRACKING_MAX}</span>
      </p>
    </div>
  );
}

// ── Teslimat bilgileri ────────────────────────────────────────────────
function DeliveryFacts({ order, missing, onSaveTracking }) {
  const headId = useId();
  const phone = customerPhone(order);
  const tel = telHref(order);
  const email = isDeletedCustomer(order) ? null : String(order.user?.email || "").trim() || null;
  const device = deviceText(order.device);
  return (
    <section className="so-d-section so-d-delivery" aria-labelledby={headId}>
      <div className="so-d-section-head">
        <h3 id={headId} className="so-d-h"><MapPin aria-hidden="true" />Teslimat</h3>
      </div>
      <dl className="so-d-facts">
        <div>
          <dt><MapPin aria-hidden="true" />{isAddressOrder(order) ? "Bölge" : "Teslimat noktası"}</dt>
          <dd>{pointLabel(order)}</dd>
        </div>
        {hasDeliveryFeeLine(order) && (
          <div>
            <dt><Bike aria-hidden="true" />Teslimat ücreti</dt>
            <dd className="ui-num" data-free={orderDeliveryFee(order) > 0 ? undefined : "true"}>{deliveryFeeLabel(order)}</dd>
          </div>
        )}
        <div>
          <dt><Phone aria-hidden="true" />Telefon</dt>
          <dd>
            {phone
              ? (tel ? <a className="ui-link ui-num" href={tel}>{formatPhoneTR(phone)}</a> : <span className="ui-num">{phone}</span>)
              : <span className="ui-muted">Telefon yok</span>}
          </dd>
        </div>
        <div>
          <dt><Mail aria-hidden="true" />E-posta</dt>
          <dd>{email ? <a className="ui-link" href={`mailto:${email}`}>{email}</a> : <span className="ui-muted">E-posta yok</span>}</dd>
        </div>
        <div>
          <dt><Wallet aria-hidden="true" />Ödeme</dt>
          <dd data-method={paymentKey(order)}>{paymentLong(order)}</dd>
        </div>
        {order.cancelReasonLabel && (
          <div>
            <dt><XCircle aria-hidden="true" />İptal nedeni</dt>
            <dd>{order.cancelReasonLabel}{order.cancelReasonNote ? ` — ${order.cancelReasonNote}` : ""}</dd>
          </div>
        )}
        <div>
          <dt><Calendar aria-hidden="true" />Sipariş zamanı</dt>
          <dd className="ui-num">{fullDateTime(order.createdAt)}</dd>
        </div>
        <div>
          <dt><Smartphone aria-hidden="true" />Cihaz</dt>
          <dd>{device || <span className="ui-muted">Bilinmiyor</span>}</dd>
        </div>
      </dl>
      <TrackingField key={order.orderId} order={order} disabled={missing} onSave={onSaveTracking} />
    </section>
  );
}

// ── Çekmece ───────────────────────────────────────────────────────────
export default function OrderDrawer({
  order, missing = false, ui, selected = false, position, nextUp = null, customer = null,
  changes = EMPTY_CHANGES, onDismissChanges, pickedKeys = EMPTY_KEYS, onPickedChange,
  products = EMPTY_PRODUCTS, productsLoading = false, productsError = null, onLoadProducts,
  onClose, onNavigate, onOpenOrder, onUndoLast, onAdvance, onUndo, onMove, onPrint, onDelete, onCopySummary, onToggleSelect,
  onSaveTracking, onUpdateQuantity, onRemoveItem, onAddProduct, onAddCustom, onMarkOutOfStock, onOpenProfile,
  couriers, couriersStatus, onConfirmCallback, onAssignCourier, onDeliveryFailed,
}) {
  const { confirm } = useConfirm();
  // ≥1280 px'te çekmece sayfayı kilitlemez (orders.css: şeffaf, tıklanabilir arka plan): modal değildir
  const modal = !useMediaQuery("(min-width: 1280px)");
  const [mode, setMode] = useState("detail");
  const [unlocked, setUnlocked] = useState(() => unlockedOrders.has(order?.orderId));
  const [stock, setStock] = useState({});
  const heroRef = useRef(null);
  const addRef = useRef(null);
  const advanceGuardRef = useRef(0);
  const orderId = order?.orderId;
  const now = ui?.now ?? Date.now();
  const status = order?.status;
  const done = isDoneStatus(status);
  const locked = done && !unlocked;
  const editable = !missing && !locked;
  const pickable = status === "Hazırlanıyor";
  const statusLabel = statusUi(status).label.toLocaleLowerCase("tr-TR");

  // Sipariş değişince: detaya dön, gövdeyi başa kaydır, odağı özet başlığına taşı. Ekleme görünümündeyken
  // başlık henüz yoktur; odak, detay çizildikten sonraki ilk düzen etkisinde taşınır.
  const modeRef = useRef(mode);
  const heroFocusRef = useRef(true);
  useLayoutEffect(() => {
    modeRef.current = "detail";
    heroFocusRef.current = true;
    setMode("detail");
    setUnlocked(unlockedOrders.has(orderId));
  }, [orderId]);
  useLayoutEffect(() => {
    if (!heroFocusRef.current) return;
    const heading = heroRef.current;
    if (!heading) return;
    heroFocusRef.current = false;
    const body = heading.closest(".ui-drawer-body");
    if (body) body.scrollTop = 0;
    heading.focus({ preventScroll: true });
  });
  // Durum değişince "e" bir süre beklesin (çift basış iki adım ilerletmesin)
  useEffect(() => {
    advanceGuardRef.current = Date.now();
  }, [status, order?.pending?.at]);
  // Sipariş listeden düştüyse ekleme görünümünden çık
  useEffect(() => {
    if (missing) setMode("detail");
  }, [missing]);
  // Ekleme görünümünden dönünce odak "Ekle" düğmesine (sipariş değişiminde değil)
  useEffect(() => {
    const prev = modeRef.current;
    modeRef.current = mode;
    if (prev === "add" && mode === "detail") requestAnimationFrame(() => (addRef.current || heroRef.current)?.focus({ preventScroll: true }));
  }, [mode]);

  // Toplama işaretleri (yalnızca güncel satırlar)
  const pickedSet = useMemo(() => {
    const current = new Set((order?.products || []).map((p) => p.lineKey));
    return new Set((pickedKeys || []).filter((k) => current.has(k)));
  }, [pickedKeys, order?.products]);
  const togglePicked = useCallback((lineKey) => {
    const next = new Set(pickedSet);
    if (next.has(lineKey)) next.delete(lineKey);
    else next.add(lineKey);
    onPickedChange?.(orderId, [...next], order?.products?.length || 0);
  }, [pickedSet, onPickedChange, orderId, order?.products?.length]);

  const unlock = useCallback(async () => {
    if (!done || unlocked) return true;
    const ok = await confirm({
      type: "warning",
      title: "Tamamlanmış siparişi düzenle",
      message: `Bu sipariş ${statusLabel}. Ürün ve tutar değişiklikleri kayda geçer ama müşteriye bildirim gitmez.`,
      confirmText: "Düzenle",
      cancelText: "Vazgeç",
    });
    if (!ok) return false;
    unlockedOrders.add(orderId);
    setUnlocked(true);
    return true;
  }, [confirm, done, unlocked, statusLabel, orderId]);

  const openAdd = useCallback(async () => {
    if (missing) return;
    if (locked && !(await unlock())) return;
    if (!products?.length && !productsLoading) onLoadProducts?.();
    setMode("add");
  }, [missing, locked, unlock, products?.length, productsLoading, onLoadProducts]);

  const markOut = async (productId) => {
    if (!productId || stock[productId] === "busy") return;
    setStock((s) => ({ ...s, [productId]: "busy" }));
    const ok = await onMarkOutOfStock?.(productId);
    setStock((s) => ({ ...s, [productId]: ok ? "done" : undefined }));
  };

  // Çekmece kısayolları (pencere düzeyinde; yazarken, ekleme görünümünde, onay/yardım açıkken ve "g" akorunda değil)
  const keysRef = useRef(null);
  keysRef.current = {
    mode, order, missing, position,
    navigate: (delta) => {
      const index = position?.index ?? -1;
      const total = position?.total ?? 0;
      if (index < 0 || total < 2) return;
      if ((delta < 0 && index <= 0) || (delta > 0 && index >= total - 1)) return;
      onNavigate?.(delta);
    },
    advance: () => {
      if (missing || !nextAction(order?.status)) return;
      if (Date.now() - advanceGuardRef.current < CLICK_GUARD_MS) return;
      advanceGuardRef.current = Date.now();
      onAdvance?.(order);
    },
    undo: () => (order?.pending ? onUndo?.(order) : onUndoLast?.()),
    print: () => onPrint?.(order),
    whatsapp: () => {
      const link = buildWhatsAppLink(order, "status");
      if (link) window.open(link, "_blank", "noopener,noreferrer");
      else toast.error("Telefon numarası tanınmadı");
    },
    copy: () => onCopySummary?.(order),
    add: () => openAdd(),
    select: () => { if (!missing) onToggleSelect?.(orderId); },
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keysRef.current;
      if (!k || k.mode !== "detail") return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector(".confirm-root, .ui-modal-backdrop")) return;
      if (inGChord(e)) return;
      // Başka bir çekmece (filtre, toplama…) üstteyse ya da odak onun içindeyse onun işi
      const target = e.target instanceof Element ? e.target : null;
      const dialog = target?.closest?.('[role="dialog"]');
      if (dialog && !dialog.classList.contains("so-d")) return;
      const layers = document.querySelectorAll(".ui-drawer-backdrop");
      const top = layers[layers.length - 1];
      if (top && !top.querySelector(".so-d")) return;
      const run = (fn) => { e.preventDefault(); fn(); };
      switch (e.key) {
        // Ok tuşları çekmece gövdesini kaydırmak için tarayıcıda kalır; siparişler arasında yalnızca j / k
        case "j": run(() => k.navigate(1)); break;
        case "k": run(() => k.navigate(-1)); break;
        case "e": if (!e.repeat) run(k.advance); break;
        case "u": if (!e.repeat) run(k.undo); break;
        case "p": case "y": if (!e.repeat) run(k.print); break;
        case "w": if (!e.repeat) run(k.whatsapp); break;
        case "c": if (!e.repeat) run(k.copy); break;
        case "a": if (!e.repeat) run(k.add); break;
        case "x": if (!e.repeat) run(k.select); break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!order) return null;
  const code = orderCode(order);
  const name = customerName(order);

  // ── Ekleme görünümü ──
  if (mode === "add") {
    return (
      <Drawer
        title="Ürün ekle"
        subtitle={<><span className="so-code" title={orderCodeTitle(order)}>{code}</span> · {name}</>}
        icon={PackagePlus}
        width={520}
        className="so-d"
        bodyClassName="so-d-body"
        modal={modal}
        onClose={() => setMode("detail")}
        footer={null}
      >
        <AddItemPanel
          order={order}
          products={products}
          loading={productsLoading}
          error={productsError}
          onReload={onLoadProducts}
          onAddProduct={(product, qty) => onAddProduct?.(order, product, qty)}
          onAddCustom={(amount, label) => onAddCustom?.(order, amount, label)}
          onDone={() => setMode("detail")}
        />
      </Drawer>
    );
  }

  // ── Detay görünümü ──
  const ordinal = order.orderOrdinal ? `${order.orderOrdinal}. sipariş` : null;
  const platform = platformLabel(order.device);
  const subtitle = (
    <>
      <span className="so-code" title={orderCodeTitle(order)}>{code}</span>
      {" · "}<span title={fullDateTime(order.createdAt)}>{formatDateTime(order.createdAt)}</span>
      {ordinal && <> · {ordinal}</>}
      {platform && <> · {platform}</>}
    </>
  );
  const active = isActiveStatus(status);
  const transfer = paymentKey(order) === "bank_transfer";
  const changeList = Array.isArray(changes) ? changes : EMPTY_CHANGES;
  const removedProducts = [];
  for (const c of changeList) {
    if (c.type === "removed" && c.productId && !removedProducts.some((r) => r.productId === c.productId)) removedProducts.push(c);
  }
  const storeOut = (productId) => (products || []).some((p) => String(p?._id) === String(productId) && p.isOutOfStock);
  const changedLink = buildWhatsAppLink(order, "changed", { changes: changeList });
  const hasNext = Boolean(nextAction(status) || order.pending);
  const completed = done ? lastStatusTime(order, status) : null;

  const menuItems = [
    { type: "label", label: "Durumu değiştir" },
    ...moveTargets(status).map((t) => ({
      id: `move-${t.status}`, label: t.label, icon: t.icon, danger: t.danger, disabled: missing,
      onSelect: () => { onMove?.(order, t.status); },
    })),
    { type: "divider" },
    {
      id: "select", label: selected ? "Seçimden çıkar" : "Seçime ekle", icon: selected ? Square : CheckSquare, hint: "x", disabled: missing,
      onSelect: () => onToggleSelect?.(orderId),
    },
    { id: "copy", label: "Özeti kopyala", icon: Copy, hint: "c", onSelect: () => onCopySummary?.(order) },
    { id: "whatsapp", label: "WhatsApp’tan yaz", icon: MessageCircle, hint: "w", disabled: !buildWhatsAppLink(order, "status"), onSelect: () => keysRef.current?.whatsapp() },
    { type: "divider" },
    { id: "delete", label: "Siparişi sil", icon: Trash2, danger: true, disabled: missing, onSelect: () => { onDelete?.(order); } },
  ];

  const footer = (
    <>
      <MenuButton
        label="Diğer"
        icon={MoreHorizontal}
        items={menuItems}
        placement="top"
        align="start"
        className="so-d-more"
        menuLabel="Diğer işlemler"
        buttonProps={{ "aria-label": "Diğer işlemler", "data-action": "order-more" }}
      />
      <button type="button" className="ui-btn so-d-print" onClick={() => onPrint?.(order)} title="Fişi yazdır (p)" aria-label="Fişi yazdır">
        <Printer aria-hidden="true" /><span className="so-d-btn-label">Yazdır</span>
      </button>
      {hasNext ? (
        <NextStepButton order={order} variant="solid" size="lg" block kbd="e" disabled={missing}
          onAdvance={onAdvance} onUndo={onUndo} className="so-d-next" />
      ) : (
        <span className="so-d-foot-note">
          <StatusBadge status={status} />
          {completed && <span className="ui-num">{shortWhen(completed, now)}</span>}
        </span>
      )}
    </>
  );

  return (
    <Drawer
      title={name}
      subtitle={subtitle}
      width={520}
      className="so-d"
      bodyClassName="so-d-body"
      modal={modal}
      onClose={onClose}
      footer={footer}
    >
      <Hero order={order} now={now} position={position} nextUp={nextUp} printedAt={ui?.printedAt?.get?.(orderId)}
        headingRef={heroRef} onNavigate={onNavigate} onOpenOrder={onOpenOrder} />

      {(missing || order.pending || (active && transfer) || changeList.length > 0) && (
        <div className="so-d-banners">
          {missing && (
            <Banner tone="warn" icon={AlertTriangle} role="alert">
              <strong>Bu sipariş artık listede değil (silinmiş olabilir).</strong> Durum ve ürün değişiklikleri kapalı.
            </Banner>
          )}
          {order.pending && !missing && (
            <Banner tone="info" icon={Info}
              action={(
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => onUndo?.(order)}>
                  <RotateCcw aria-hidden="true" />Geri al
                </button>
              )}>
              Durum 5 sn içinde “{statusUi(order.pending.to).label}” olarak kaydedilecek.
            </Banner>
          )}
          {active && transfer && !missing && (
            <Banner tone="warn" icon={Landmark}>
              {status === "Yolda"
                ? <><strong>Havale / EFT:</strong> teslim etmeden önce ödemenin hesaba geçtiğini kontrol edin.</>
                : <><strong>Havale / EFT:</strong> yola çıkarmadan önce ödemenin hesaba geçtiğini kontrol edin.</>}
            </Banner>
          )}
          {changeList.length > 0 && (
            <Banner tone="warn" icon={PackageX}
              onClose={() => onDismissChanges?.(orderId)} closeLabel="Değişiklik notunu kapat"
              actions={(
                <>
                  {changedLink ? (
                    <a className="ui-btn ui-btn--sm" href={changedLink} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden="true" />WhatsApp ile bildir
                    </a>
                  ) : (
                    <button type="button" className="ui-btn ui-btn--sm" disabled title="Telefon numarası tanınmadı">
                      <MessageCircle aria-hidden="true" />WhatsApp ile bildir
                    </button>
                  )}
                  {removedProducts.map((c) => {
                    const state = stock[c.productId] || (storeOut(c.productId) ? "done" : undefined);
                    const label = state === "done"
                      ? (removedProducts.length > 1 ? `${c.name}: tükendi` : "Tükendi olarak işaretli")
                      : (removedProducts.length > 1 ? `${c.name}: tükendi işaretle` : "Ürünü tükendi işaretle");
                    return (
                      <button key={c.productId} type="button" className="ui-btn ui-btn--sm so-d-stock-btn" data-state={state}
                        disabled={state === "busy" || state === "done"} onClick={() => markOut(c.productId)}
                        title="Ürünün güncel stok durumu sunucudan okunur; yalnızca stoktaysa tükendi yapılır">
                        {state === "busy" ? <Loader2 className="ui-spin" aria-hidden="true" /> : state === "done" ? <Check aria-hidden="true" /> : <PackageX aria-hidden="true" />}
                        <span className="so-d-stock-label">{label}</span>
                      </button>
                    );
                  })}
                </>
              )}>
              <strong>Sipariş değişti:</strong> {describeChanges(changeList)} · Yeni toplam <strong className="ui-num">{money(order.totalAmount)}</strong>
            </Banner>
          )}
        </div>
      )}

      <CallbackPanel order={order} disabled={missing} onConfirm={onConfirmCallback} />
      <OutcomeNote order={order} />

      {order.hasNote && (
        <div className="ui-note so-d-note">
          <AlertTriangle aria-hidden="true" />
          <div>
            <p className="ui-note-label">Müşteri notu</p>
            <p className="ui-note-body">{String(order.note).trim()}</p>
          </div>
        </div>
      )}

      <DeliveryAddress order={order} />

      <DeliveryOpsSection order={order} missing={missing} couriers={couriers} couriersStatus={couriersStatus}
        onAssignCourier={onAssignCourier} onDeliveryFailed={onDeliveryFailed} />

      <OrderItems
        order={order}
        editable={editable}
        locked={locked}
        disabled={missing}
        statusLabel={statusLabel}
        pickable={pickable}
        pickedKeys={pickedSet}
        onTogglePicked={togglePicked}
        onQuantity={(lineKey, qty) => onUpdateQuantity?.(order, lineKey, qty)}
        onRemove={(lineKey) => onRemoveItem?.(order, lineKey)}
        onAdd={openAdd}
        onUnlock={unlock}
        addRef={addRef}
      />

      <ContactActions order={order} changes={changeList} onCopySummary={onCopySummary} />

      <DeliveryFacts order={order} missing={missing} onSaveTracking={onSaveTracking} />

      <OrderTimeline key={orderId} order={order} />

      <CustomerPanel order={order} customer={customer} now={now} onOpenOrder={onOpenOrder} onOpenProfile={onOpenProfile} />
    </Drawer>
  );
}
