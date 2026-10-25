/* eslint-disable react-refresh/only-export-components */
// Siparişler ekranının küçük, ortak görünüm parçaları (avatar, durum rozeti, SLA çipi, ödeme/nokta
// çipleri, sonraki adım düğmesi, erişilebilir açılır menü…). Stil: styles/orders.css (önek so-).
// Sözleşme: scratchpad/orders-design/CONTRACTS.md
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle, AlertTriangle, Bike, Check, ChevronDown, History, Home, ListChecks, Loader2, MapPin, MoreHorizontal, PackageCheck,
  PackageX, PhoneCall, Printer, RefreshCw, RotateCcw, Sparkles, StickyNote, Timer, UserX, Wallet,
} from "lucide-react";
import {
  EmptyState, Skeleton, SkeletonCards, SkeletonRows, formatDate, formatDateTime, formatTime, initials, money,
} from "../admin/ui";
import {
  CLICK_GUARD_MS, KBD_HINT, NOW_TICK_MS, PAYMENT, customerName, durationMinutes, faceTone, formatMinutes, getSla,
  isDeletedCustomer, nextAction, orderCode, orderCodeTitle, paymentKey, paymentLong, pointKey, pointLabel, shortWhen, statusUi,
  isAddressOrder, orderAddressLines, needsCallbackPending, courierName, deliveryOutcomeLabel,
} from "./shared";
import "../../styles/orders.css";

// ── Ortak saat (tek setInterval, tüm abonelere aynı "şimdi") ─────────────
const tickers = new Map();
const tickerFor = (ms) => {
  let t = tickers.get(ms);
  if (!t) {
    t = { now: Date.now(), listeners: new Set(), id: null };
    tickers.set(ms, t);
  }
  return t;
};
const subscribeTicker = (ms, listener) => {
  const t = tickerFor(ms);
  t.listeners.add(listener);
  if (!t.id) {
    t.now = Date.now();
    t.id = setInterval(() => {
      t.now = Date.now();
      t.listeners.forEach((l) => l());
    }, ms);
  }
  return () => {
    t.listeners.delete(listener);
    if (!t.listeners.size && t.id) {
      clearInterval(t.id);
      t.id = null;
    }
  };
};
const NOOP_UNSUBSCRIBE = () => {};
/**
 * Paylaşılan canlı saat: aynı aralığı kullanan tüm bileşenler tek bir zamanlayıcıdan beslenir.
 * enabled=false iken abone olmaz ve 0 döner.
 */
export const useOrdersNow = (ms = NOW_TICK_MS, enabled = true) => {
  const subscribe = useCallback((listener) => (enabled ? subscribeTicker(ms, listener) : NOOP_UNSUBSCRIBE), [ms, enabled]);
  const getSnapshot = useCallback(() => (enabled ? tickerFor(ms).now : 0), [ms, enabled]);
  return useSyncExternalStore(subscribe, getSnapshot);
};

// ── Erişilebilirlik ──────────────────────────────────────────────────────
/** Görsel olarak gizli, ekran okuyucuda okunan metin */
export const SrOnly = ({ as: Tag = "span", children, ...rest }) => <Tag className="so-sr" {...rest}>{children}</Tag>;
/**
 * Kibar (polite) canlı bölge. message: string ya da { text, at } (aynı metni yeniden okutmak için at değişir).
 */
export const LiveRegion = ({ message, politeness = "polite" }) => {
  const text = typeof message === "string" ? message : message?.text || "";
  const stamp = typeof message === "string" ? message : message?.at;
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    if (!text) return undefined;
    const id = setTimeout(() => setShown(text), 80);
    return () => clearTimeout(id);
  }, [text, stamp]);
  return <div className="so-sr" role="status" aria-live={politeness} aria-atomic="true">{shown}</div>;
};

// ── Müşteri ve sipariş kimliği ───────────────────────────────────────────
/** Müşteri avatarı: fotoğraf, yoksa baş harfler (6 ton); silinmiş hesapta nötr simge. sm 32 · md 36 · lg 48 px */
export const CustomerFace = ({ order, user: userProp, size = "md", className = "" }) => {
  const user = userProp || order?.user || null;
  const deleted = order ? isDeletedCustomer(order) : Boolean(user?.deleted);
  const name = order ? customerName(order) : user?.name || "";
  const [failedSrc, setFailedSrc] = useState(null);
  const src = !deleted && user?.avatar && failedSrc !== user.avatar ? user.avatar : null;
  return (
    <span className={`so-face ${className}`} data-size={size} data-tone={src ? undefined : deleted ? "muted" : faceTone(name)} aria-hidden="true">
      {src
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
        : deleted ? <UserX /> : initials(name)}
    </span>
  );
};
/** "#B3D30E" (mono); 8 haneli kod title'da */
export const OrderCode = ({ order, className = "" }) => (
  <span className={`so-code ${className}`} title={orderCodeTitle(order)}>{orderCode(order)}</span>
);

// ── Durum ve süre ────────────────────────────────────────────────────────
/** Durum rozeti; bilinmeyen durumda nötr (asla var olmayan bir ton üretmez) */
export const StatusBadge = ({ status, className = "" }) => {
  const ui = statusUi(status);
  return (
    <span className={`ui-badge so-status${ui.tone ? ` ui-badge--${ui.tone}` : ""} ${className}`} data-status={ui.key}>
      <i className={`ui-dot${ui.tone ? ` ui-dot--${ui.tone}` : ""}`} aria-hidden="true" />
      {ui.label}
    </span>
  );
};
/**
 * Canlı SLA çipi. `now` verilirse onu kullanır (konteyner zaten sayıyor), verilmezse paylaşılan 15 sn saatine abone olur.
 * Aktif değilse null; `done` true ise tamamlanmış siparişte toplam süreyi nötr çip olarak gösterir.
 */
export const SlaChip = ({ order, now, bar = false, size = "sm", done = false, className = "" }) => {
  const live = useOrdersNow(NOW_TICK_MS, now === undefined || now === null);
  const at = now ?? live;
  const sla = getSla(order, at);
  if (!sla) {
    if (!done) return null;
    const minutes = durationMinutes(order, at);
    if (minutes === null) return null;
    return (
      <span className={`so-chip so-sla ${className}`} data-level="done" data-size={size} title={`Toplam süre: ${formatMinutes(minutes)}`}>
        <Timer aria-hidden="true" />{formatMinutes(minutes)}
      </span>
    );
  }
  const Icon = sla.level === "late" ? AlertCircle : Timer;
  return (
    <span className={`so-chip so-sla ${className}`} data-level={sla.level} data-size={size} data-bar={bar ? "true" : undefined} title={sla.title}>
      <Icon aria-hidden="true" />
      <span className="so-sla-text">{sla.label}</span>
      {sla.level !== "ok" && <span className="so-sr">{sla.level === "late" ? ", gecikti" : ", gecikmek üzere"}</span>}
      {bar && <span className="so-sla-bar" aria-hidden="true"><i style={{ width: `${Math.round(sla.progress * 100)}%` }} /></span>}
    </span>
  );
};

// ── Bilgi çipleri ────────────────────────────────────────────────────────
/** Ödeme yöntemi (Havale uyarı tonunda); yöntem yoksa null. amount=true → "Nakit · ₺245,50" */
export const PaymentChip = ({ order, amount = false, className = "" }) => {
  const key = paymentKey(order);
  const meta = PAYMENT[key];
  if (!meta && !amount) return null;
  const Icon = meta?.icon || Wallet;
  return (
    <span className={`so-chip so-pay ${className}`} data-method={key} data-tone={meta?.tone} title={paymentLong(order)}>
      <Icon aria-hidden="true" />
      <span className="so-chip-text">{meta?.label || "Ödeme belirtilmedi"}</span>
      {amount && <span className="so-pay-amount">{money(order?.totalAmount)}</span>}
    </span>
  );
};
/**
 * Teslimat noktası; çipte kısa ad ("Kız yurdu"), title'da uzun ad. Adrese teslim siparişte bölge adı
 * (ev simgesiyle) ve title'da açık adres; yurt siparişi bugünkü gibi.
 */
export const PointChip = ({ order, short = true, className = "" }) => {
  const address = isAddressOrder(order) ? orderAddressLines(order) : null;
  const Icon = address ? Home : MapPin;
  return (
    <span className={`so-chip so-point ${className}`} data-point={pointKey(order)} data-address={address ? "true" : undefined}
      title={address ? `${pointLabel(order)} · ${address.oneLine}` : pointLabel(order)}>
      <Icon aria-hidden="true" /><span className="so-chip-text">{pointLabel(order, { short })}</span>
    </span>
  );
};
/** Adrese teslim siparişin kısa adres satırı (sokak/bina · kat/daire); yurt siparişinde null */
export const AddressLine = ({ order, className = "" }) => {
  const address = isAddressOrder(order) ? orderAddressLines(order) : null;
  if (!address) return null;
  const text = [address.street, address.building, address.unit].filter(Boolean).join(" · ") || address.oneLine;
  if (!text) return null;
  return (
    <p className={`so-addr-line ${className}`} title={[address.oneLine, address.directions].filter(Boolean).join(" — ")}>
      <Home aria-hidden="true" /><span className="so-addr-line-text">{text}</span>
    </p>
  );
};
/** Müşteri notu var işareti (tam metin title'da); not yoksa null */
export const NoteChip = ({ order, className = "" }) => {
  if (!order?.hasNote && !String(order?.note || "").trim()) return null;
  return (
    <span className={`so-chip so-note-chip ${className}`} data-tone="warn" title={String(order.note).trim()}>
      <StickyNote aria-hidden="true" />Not<span className="so-sr">: {String(order.note).trim()}</span>
    </span>
  );
};
/**
 * "İlk sipariş" (yalnızca kesin biliniyorsa) ve müşterinin iptal geçmişi ("{n} iptali var") rozetleri; yoksa null.
 * İptal rozeti bu siparişin durumu gibi okunmasın diye kırmızı değil uyarı tonunda ve geçmiş simgesiyle çizilir
 * (kırmızı yalnızca siparişin kendi durumu ve gecikme için). Sayı müşterinin ömür boyu iptalleridir (bu sipariş dahil).
 */
export const TrustBadges = ({ order, className = "" }) => {
  const first = order?.isFirstOrder === true;
  const cancels = Number(order?.cancelBadge) || 0;
  if (!first && !cancels) return null;
  return (
    <>
      {first && <span className={`so-chip so-trust ${className}`} data-tone="brand" title="Müşterinin ilk siparişi"><Sparkles aria-hidden="true" />İlk sipariş</span>}
      {cancels > 0 && (
        <span className={`so-chip so-trust ${className}`} data-tone="warn" data-kind="cancels" title="Müşterinin toplam iptal sayısı">
          <History aria-hidden="true" />{cancels} iptali var<span className="so-sr"> (müşterinin toplam iptal sayısı)</span>
        </span>
      )}
    </>
  );
};
/** "Teyit için ara": ilk sipariş telefonla teyit edilmemiş aktif sipariş; değilse null */
export const CallbackBadge = ({ order, className = "" }) => {
  if (!needsCallbackPending(order)) return null;
  return (
    <span className={`so-chip so-callback ${className}`} data-tone="danger" title="İlk sipariş: hazırlamadan önce müşteriyi arayıp teyit edin">
      <PhoneCall aria-hidden="true" />Teyit için ara
    </span>
  );
};
/** Atanan kurye adı; atanmamışsa null */
export const CourierChip = ({ order, className = "" }) => {
  const name = courierName(order);
  if (!name) return null;
  return (
    <span className={`so-chip so-courier ${className}`} data-tone="info" title={`Kurye: ${name}`}>
      <Bike aria-hidden="true" /><span className="so-chip-text">{name}</span>
    </span>
  );
};
/** İptal edilmiş siparişte "Teslim edilemedi: neden"; yoksa null */
export const OutcomeChip = ({ order, className = "" }) => {
  const label = order?.status === "İptal Edildi" ? deliveryOutcomeLabel(order) : "";
  if (!label) return null;
  return (
    <span className={`so-chip so-outcome ${className}`} data-tone="danger" title={`Teslim edilemedi: ${label}${order.deliveryOutcome?.note ? ` — ${order.deliveryOutcome.note}` : ""}`}>
      <PackageX aria-hidden="true" /><span className="so-chip-text">Teslim edilemedi</span>
    </span>
  );
};
/** "Yeni" (bu cihazda henüz görülmedi), hafif nabız animasyonlu */
export const UnseenBadge = ({ className = "" }) => (
  <span className={`so-chip so-new ${className}`} data-tone="brand" title="Henüz görülmedi (bu cihaz)">Yeni</span>
);
/** Yalnızca nokta (dar yerler, sekmeler) */
export const NewDot = ({ label = "Yeni sipariş var", className = "" }) => (
  <span className={`so-new-dot ${className}`} role="img" aria-label={label} />
);
/** "Fiş 21:14" (bu cihazda yazdırıldı); at yoksa null */
export const PrintedMark = ({ at, className = "" }) => {
  if (!at) return null;
  return (
    <span className={`so-chip so-printed ${className}`} title={`Fiş yazdırıldı: ${formatDateTime(at)} (bu cihaz)`}>
      <Printer aria-hidden="true" />Fiş {shortWhen(at)}
    </span>
  );
};
/** Toplama ilerlemesi "3/5" ya da tamamlandıysa "Hazır"; info yoksa null */
export const PickProgress = ({ info, className = "" }) => {
  if (!info || !info.total || !info.done) return null;
  if (info.done >= info.total) {
    return <span className={`so-chip so-pick ${className}`} data-tone="ok" title="Tüm ürünler toplandı (bu cihaz)"><PackageCheck aria-hidden="true" />Hazır</span>;
  }
  return (
    <span className={`so-chip so-pick ${className}`} title={`${info.done}/${info.total} ürün toplandı (bu cihaz)`}>
      <ListChecks aria-hidden="true" />{info.done}/{info.total}
    </span>
  );
};

// ── Seçim kutusu ─────────────────────────────────────────────────────────
/** 40 px dokunma alanlı onay kutusu (label sarmalı). onChange(checked:boolean, event) */
export const SelectCheck = ({ checked, indeterminate = false, onChange, label, disabled = false, className = "" }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);
  return (
    <label className={`so-check ${className}`} title={label}>
      <input ref={ref} type="checkbox" className="ui-checkbox" checked={Boolean(checked)} disabled={disabled}
        aria-label={label} onChange={(e) => onChange?.(e.target.checked, e)} />
    </label>
  );
};

// ── Sonraki adım ─────────────────────────────────────────────────────────
/**
 * Tek büyük "Yola çıkar" / "Teslim et" düğmesi. Sonraki adım order.status'tan (bekleyen değişiklik varsa
 * HEDEF durumdan) hesaplanır; bekleyen değişiklik varken yanında küçük ayrı bir "Geri al" düğmesi çıkar.
 * Bir değişiklikten sonra 400 ms tıklama almaz (çift tıklama iki adım ilerletmesin / hemen geri almasın);
 * çift tıklamanın ikinci tıklaması (event.detail > 1) süre ne olursa olsun yok sayılır.
 * Odaktaki düğme değişiklikle kalkarsa ("Teslim et" → yalnızca "Geri al") odak diğer düğmeye geçer, <body>'ye düşmez.
 */
export const NextStepButton = memo(function NextStepButton({
  order, onAdvance, onUndo, variant = "soft", size = "md", block = false, kbd, disabled = false, className = "",
}) {
  const next = nextAction(order?.status);
  const pending = order?.pending || null;
  const changeKey = `${order?.status}|${pending?.at || ""}`;
  const keyRef = useRef(changeKey);
  const guardRef = useRef(0);
  const nextRef = useRef(null);
  const undoRef = useRef(null);
  const handoffRef = useRef(null); // { from: "next" | "undo", key } — basıldığında odak o düğmedeydi
  useEffect(() => {
    if (keyRef.current !== changeKey) {
      keyRef.current = changeKey;
      guardRef.current = Date.now();
    }
  }, [changeKey]);
  useLayoutEffect(() => {
    const handoff = handoffRef.current;
    if (!handoff || handoff.key === changeKey) return;
    handoffRef.current = null;
    const gone = handoff.from === "next" ? !nextRef.current : !undoRef.current;
    const active = document.activeElement;
    if (!gone || (active && active !== document.body && active.isConnected)) return;
    (handoff.from === "next" ? undoRef : nextRef).current?.focus({ preventScroll: true });
  }, [changeKey]);
  if (!order || (!next && !pending)) return null;
  const guarded = () => Date.now() - guardRef.current < CLICK_GUARD_MS;
  const code = orderCode(order);
  const remember = (e, from) => {
    handoffRef.current = document.activeElement === e.currentTarget ? { from, key: changeKey } : null;
  };
  const advance = (e) => {
    e.stopPropagation();
    if (disabled || e.detail > 1 || guarded()) return;
    guardRef.current = Date.now();
    remember(e, "next");
    onAdvance?.(order);
  };
  const undo = (e) => {
    e.stopPropagation();
    if (e.detail > 1 || guarded()) return;
    guardRef.current = Date.now();
    remember(e, "undo");
    onUndo?.(order);
  };
  const NextIcon = next?.icon;
  return (
    <span className={`so-next-wrap ${className}`} data-block={block ? "true" : undefined} data-size={size}>
      {next && (
        <button ref={nextRef} type="button" className="so-next" data-variant={variant} data-kind={next.kind} data-size={size} disabled={disabled}
          onClick={advance} aria-label={`${code} siparişini ${next.label.toLocaleLowerCase("tr-TR")}`}
          title={kbd ? `${next.label} (${kbd})` : next.label}>
          <NextIcon aria-hidden="true" />
          <span className="so-next-label">{next.label}</span>
          {kbd && <kbd className="ui-kbd so-next-kbd" aria-hidden="true">{kbd}</kbd>}
        </button>
      )}
      {pending && (
        <button ref={undoRef} type="button" className="so-next-undo" data-alone={next ? undefined : "true"} data-size={size} onClick={undo}
          aria-label={`${code} durum değişikliğini geri al`} title={`“${statusUi(pending.from).label}” durumuna geri al (u)`}>
          <RotateCcw aria-hidden="true" /><span>Geri al</span>
        </button>
      )}
    </span>
  );
});

// ── Görünüm genelinde adım koruması ──────────────────────────────────────
const cssId = (value) =>
  typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "");
const navItemSelector = (orderId) => `[data-nav="1"][data-order-id="${cssId(orderId)}"]`;
const navItemsOf = (list) => [...list.children].filter((el) => el.matches('[data-nav="1"]'));
/**
 * Kartın / satırın kendi düğmesiyle (sonraki adım / Geri al) yapılan değişiklik öğeyi başka şeride / sütuna taşıyabilir
 * ya da odaklı düğmeyi kaldırabilir. Odak <body>'ye düşmesin: öğe aynı listede kaldıysa yerine gelen adım düğmesine,
 * başka listeye taşındıysa oradaki açma düğmesine, görünmüyorsa (mobilde tek şerit / sütun, katlanmış bölüm) eski
 * listede aynı sıradaki öğeye gider. Odak o öğede değilse dokunulmaz. Dönen fonksiyon işlem bitince çağrılır.
 */
export const keepStepFocus = (root, orderId) => {
  const item = orderId ? root?.querySelector(navItemSelector(orderId)) : null;
  const active = typeof document !== "undefined" ? document.activeElement : null;
  if (!item?.parentElement || !active || !item.contains(active)) return () => {};
  let keyboard = false; // klavyeyle basıldıysa yeni odak görünür alana getirilir; fareyle sayfa kaymaz
  try { keyboard = active.matches(":focus-visible"); } catch { /* eski tarayıcı */ }
  const list = item.parentElement;
  const index = navItemsOf(list).indexOf(item);
  return (applied) => {
    if (applied === false || typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const current = document.activeElement;
      if (current && current !== document.body && current.isConnected) return; // odak zaten bir yerde
      const moved = root.isConnected ? root.querySelector(navItemSelector(orderId)) : null;
      const siblings = list.isConnected ? navItemsOf(list) : [];
      const stayed = moved?.parentElement === list ? moved.querySelector(".so-next, .so-next-undo") : null;
      const target = moved
        ? stayed || moved.querySelector(".so-open")
        : (siblings[index] || siblings[index - 1])?.querySelector(".so-open");
      if (!target) return;
      target.focus({ preventScroll: true });
      if (keyboard) target.closest('[data-nav="1"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };
};
/**
 * Görünüm genelinde tıklama koruması (Şimdi, Liste, Pano): ilerletilen öğe yerinden çıkınca alttaki öğe imlecin
 * altına kayar; çift tıklamanın ikinci tıklaması o BAŞKA siparişi ilerletmesin / geri almasın (NextStepButton
 * koruması yalnızca kendi örneğindedir). advance / undo sarılır, diğer eylemler aynen geçer; odak keepStepFocus ile korunur.
 */
export const useStepGuard = (actions, rootRef) => {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const lastStepRef = useRef(0);
  return useMemo(() => {
    if (!actions) return actions;
    const guarded = (name) => (order) => {
      const now = Date.now();
      if (now - lastStepRef.current < CLICK_GUARD_MS) return Promise.resolve(false);
      lastStepRef.current = now;
      const restore = keepStepFocus(rootRef?.current, order?.orderId);
      const result = Promise.resolve(actionsRef.current?.[name]?.(order));
      result.then(restore, () => {});
      return result;
    };
    return { ...actions, advance: guarded("advance"), undo: guarded("undo") };
  }, [actions, rootRef]);
};

// ── Açılır menü ──────────────────────────────────────────────────────────
const cleanItems = (items) => {
  const list = (items || []).filter(Boolean);
  const out = [];
  for (const item of list) {
    if (item.type === "divider" && (!out.length || out[out.length - 1].type === "divider")) continue;
    out.push(item);
  }
  while (out.length && out[out.length - 1].type === "divider") out.pop();
  return out;
};
const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
/**
 * Erişilebilir açılır menü (ARIA menu kalıbı). Açılır kutu, düğme bir diyaloğun (çekmece, aria-modal) içindeyse
 * o diyaloğa, değilse .admin-layout köküne portal ile çizilir (modal dışında kalıp ekran okuyucuda gizlenmesin);
 * position: fixed; altta yer yoksa yukarı açılır, ekran kenarlarına 8 px yaklaşır. Dışarı tıklama,
 * kaydırma ve yeniden boyutlandırma kapatır. Klavye: ↑ ↓ Home End Enter Boşluk Esc (+ harfle atlama);
 * işlediği her tuşun yayılmasını durdurur (Esc çekmeceyi kapatmaz). Seçimden sonra odak düğmeye döner.
 * items: Array<{ id, label, icon?, onSelect, danger?, disabled?, hint?, description?, checked?, title? }
 *              | { type:'divider' } | { type:'label', label } | false | null>
 */
export const MenuButton = ({
  label, icon: Icon, iconOnly = false, items, align = "end", placement = "bottom", size = "md", variant,
  className = "", buttonClassName = "", menuClassName = "", buttonProps = {}, disabled = false, title, menuLabel,
  caret = false, children, onOpenChange,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [host, setHost] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const focusRef = useRef("first");
  const typeRef = useRef({ text: "", at: 0 });
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const menuId = `so-menu-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const list = cleanItems(items);

  const close = useCallback((returnFocus) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) btnRef.current?.focus({ preventScroll: true });
  }, []);
  const openMenu = (focus = "first") => {
    if (disabled || !list.length) return;
    focusRef.current = focus;
    setHost(btnRef.current?.closest('[role="dialog"]') || btnRef.current?.closest(".admin-layout") || document.body);
    setOpen(true);
  };

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onOpenChangeRef.current?.(open);
  }, [open]);

  const menuItems = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
  const focusAt = (index) => {
    const els = menuItems();
    if (!els.length) return;
    els[(index + els.length) % els.length].focus({ preventScroll: true });
  };

  // Konumlandırma (ölç → yerleştir)
  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const M = 8;
    const GAP = 4;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const natural = Math.min(menu.scrollHeight, vh - 2 * M);
    const mw = Math.min(menu.offsetWidth, vw - 2 * M);
    const below = vh - r.bottom - GAP - M;
    const above = r.top - GAP - M;
    const up = placement === "top" ? above >= natural || above > below : below < natural && above > below;
    // İki tarafa da sığmıyorsa geniş tarafa açılır ve içeride kayar (düğmeyi örtmez)
    const room = up ? above : below;
    const maxHeight = natural > room && room >= 160 ? room : vh - 2 * M;
    const mh = Math.min(natural, maxHeight);
    const top = clamp(up ? r.top - GAP - mh : r.bottom + GAP, M, vh - M - mh);
    const left = clamp(align === "start" ? r.left : r.right - mw, M, vw - M - mw);
    setPos({ top, left, maxHeight, up });
  }, [open, align, placement, list.length]);

  // Açılınca ilk (ya da son) öğeye odak
  const positioned = Boolean(pos);
  useEffect(() => {
    if (!open || !positioned) return;
    const els = menuItems();
    if (!els.length) return;
    (focusRef.current === "last" ? els[els.length - 1] : els[0]).focus({ preventScroll: true });
  }, [open, positioned]);

  // Dışarı tıklama / kaydırma / boyut değişimi kapatır
  useEffect(() => {
    if (!open) return undefined;
    const inside = (target) => target instanceof Node && (menuRef.current?.contains(target) || btnRef.current?.contains(target));
    const onDown = (e) => { if (!inside(e.target)) close(false); };
    const onScroll = (e) => { if (!(e.target instanceof Node && menuRef.current?.contains(e.target))) close(false); };
    const onResize = () => close(false);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const select = (item) => {
    if (!item || item.disabled) return;
    close(true);
    item.onSelect?.();
  };

  const onButtonKeyDown = (e) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      if (open) close(true);
      else openMenu(e.key === "ArrowUp" ? "last" : "first");
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const onMenuKeyDown = (e) => {
    const els = menuItems();
    const index = els.indexOf(document.activeElement);
    switch (e.key) {
      case "ArrowDown": focusAt(index + 1); break;
      case "ArrowUp": focusAt(index < 0 ? -1 : index - 1); break;
      case "Home": focusAt(0); break;
      case "End": focusAt(els.length - 1); break;
      case "Escape": close(true); break;
      case "Enter":
      case " ": {
        const id = document.activeElement?.getAttribute?.("data-item");
        select(list[Number(id)]);
        break;
      }
      case "Tab": close(true); return; // odak düğmeye döner, Tab oradan devam eder
      default: {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length !== 1 || !/\S/.test(e.key)) { e.stopPropagation(); return; }
        const now = Date.now();
        const text = (now - typeRef.current.at < 700 ? typeRef.current.text : "") + e.key.toLocaleLowerCase("tr-TR");
        typeRef.current = { text, at: now };
        const start = index + 1;
        const order = [...els.slice(start), ...els.slice(0, start)];
        const match = order.find((el) => el.textContent.trim().toLocaleLowerCase("tr-TR").startsWith(text));
        match?.focus({ preventScroll: true });
      }
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const DefaultIcon = Icon || (iconOnly ? MoreHorizontal : null);
  const btnClass = iconOnly
    ? `ui-icon-btn${size === "sm" ? " ui-icon-btn--sm" : ""}`
    : `ui-btn${size === "sm" ? " ui-btn--sm" : ""}${variant ? ` ui-btn--${variant}` : ""}`;

  const menu = open && host ? createPortal(
    <div ref={menuRef} id={menuId} role="menu" aria-label={menuLabel || (typeof label === "string" ? label : undefined)}
      className={`so-menu ${menuClassName}`} data-size={size} data-up={pos?.up ? "true" : undefined}
      style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: "hidden" }}
      onKeyDown={onMenuKeyDown}>
      {list.map((item, i) => {
        if (item.type === "divider") return <div key={`d${i}`} role="separator" className="so-menu-divider" />;
        if (item.type === "label") return <div key={`l${i}`} role="presentation" className="so-menu-label">{item.label}</div>;
        const ItemIcon = item.icon;
        return (
          <button key={item.id ?? i} type="button" role="menuitem" tabIndex={-1} data-item={i} className="so-menu-item"
            data-danger={item.danger ? "true" : undefined} disabled={Boolean(item.disabled)} title={item.title}
            onClick={() => select(item)}>
            {ItemIcon ? <ItemIcon aria-hidden="true" /> : <span className="so-menu-icon-gap" aria-hidden="true" />}
            <span className="so-menu-text">
              <span>{item.label}</span>
              {item.description && <small>{item.description}</small>}
            </span>
            {item.hint !== undefined && item.hint !== null && item.hint !== "" && <span className="so-menu-hint">{item.hint}</span>}
            {item.checked && <Check className="so-menu-check" aria-hidden="true" />}
          </button>
        );
      })}
    </div>,
    host,
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" {...buttonProps}
        className={`${btnClass} so-menu-btn ${className} ${buttonClassName}`.trim()}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label={buttonProps["aria-label"] ?? (iconOnly ? label : undefined)}
        title={title ?? (iconOnly ? label : undefined)} disabled={disabled}
        onClick={() => (open ? close(false) : openMenu("first"))} onKeyDown={onButtonKeyDown}>
        {DefaultIcon && <DefaultIcon aria-hidden="true" />}
        {!iconOnly && <span className="so-menu-btn-label">{label}</span>}
        {children}
        {!iconOnly && caret && <ChevronDown className="so-menu-caret" aria-hidden="true" />}
      </button>
      {menu}
    </>
  );
};

// ── Daha eski siparişler, ipucu, durum panelleri ─────────────────────────
/** "Daha eski siparişleri yükle"; hasOlder false ise null */
export const LoadOlderButton = ({ hasOlder, loading = false, onLoad, windowStart, compact = false, className = "" }) => {
  if (!hasOlder) return null;
  const since = windowStart ? formatDate(windowStart, { year: "numeric" }) : null;
  return (
    <button type="button" className={`ui-btn${compact ? " ui-btn--sm ui-btn--ghost" : ""} so-older ${className}`}
      onClick={() => { if (!loading) onLoad?.(); }} disabled={loading} aria-busy={loading ? "true" : undefined}
      title={since ? `Şu an ${since} sonrası ve tüm aktif siparişler gösteriliyor` : undefined}>
      {loading ? <Loader2 className="ui-spin" aria-hidden="true" /> : <History aria-hidden="true" />}
      <span>{loading ? "Yükleniyor…" : "Daha eski siparişleri yükle"}</span>
    </button>
  );
};
/**
 * Geri alma bildiriminin gövdesi (react-hot-toast içinde; admin-system.css ui-undo sınıfları).
 * useOrdersData.js JSX içeremediği için: toast(() => createElement(UndoToast, { message, onUndo }), { id, duration })
 */
export const UndoToast = ({ message, onUndo, undoLabel = "Geri al" }) => (
  <span className="ui-undo">
    <span className="ui-undo-text">{message}</span>
    <button type="button" className="ui-undo-btn" onClick={onUndo}><RotateCcw aria-hidden="true" />{undoLabel}</button>
  </span>
);
/** Sayfa altındaki kısayol ipucu (masaüstü; dokunmatik/mobilde gizli) */
export const KbdHint = ({ items = KBD_HINT, className = "" }) => (
  <p className={`so-kbd-hint ${className}`}>
    {items.map(([keys, text], i) => (
      <span key={text} className="so-kbd-hint-item">
        {i > 0 && <span className="so-kbd-hint-sep" aria-hidden="true">·</span>}
        {keys.map((k) => <kbd key={k} className="ui-kbd">{k}</kbd>)}
        <span>{text}</span>
      </span>
    ))}
  </p>
);
/** Arka plan eşitlemesi başarısız: veri duruyor ama eski olabilir */
export const StaleBanner = ({ lastSyncAt, onRetry, syncing = false, className = "" }) => (
  <div className={`ui-banner ui-banner--danger so-banner ${className}`} role="alert">
    <AlertTriangle aria-hidden="true" />
    <span className="so-banner-text">
      <strong>Siparişler güncellenemiyor</strong>
      {lastSyncAt ? ` · son başarılı güncelleme ${formatTime(lastSyncAt)}.` : "."} Liste eski olabilir.
    </span>
    <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry} disabled={syncing}>
      <RefreshCw className={syncing ? "ui-spin" : undefined} aria-hidden="true" />Tekrar dene
    </button>
  </div>
);
/** İlk yükleme hatası: tehlike şeridi + tek "Tekrar dene" (altında iskelet yok; yükleniyor gibi görünmesin) */
export const LoadErrorPanel = ({ onRetry, retrying = false, message, className = "" }) => (
  <div className={`so-load-error ${className}`}>
    <div className="ui-banner ui-banner--danger so-banner" role="alert">
      <AlertTriangle aria-hidden="true" />
      <span className="so-banner-text">
        <strong>Siparişler yüklenemedi.</strong> {message || "Sunucuya ulaşılamadı ya da oturum süresi doldu. Bağlantınızı kontrol edip tekrar deneyin."}
      </span>
      <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? "ui-spin" : undefined} aria-hidden="true" />Tekrar dene
      </button>
    </div>
  </div>
);
/** Panel içinde boş durum (EmptyState sarmalı) */
export const StatePanel = ({ icon, title, description, action, compact = false, className = "" }) => (
  <div className={`ui-panel so-state ${className}`}>
    <EmptyState icon={icon} title={title} description={description} action={action} compact={compact} />
  </div>
);
const SKELETON_COLS = { now: 2, board: 4 };
/**
 * İlk yükleme iskeleti: KPI kartları (yüklenmiş KPI satırıyla aynı kırılımlar: so-ov-kpis-loading), 40 px araç
 * çubuğu ve görünüme göre gövde (Şimdi: iki şerit · Pano: dört sütun · Liste: satırlar; dar ekranda tek sütun).
 */
export const OrdersSkeleton = ({ view = "list" }) => {
  const cols = SKELETON_COLS[view] || 1;
  return (
    <div className="so-skeleton" aria-busy="true" aria-label="Siparişler yükleniyor">
      {/* Telefonda yüklenmiş KPI satırı 4 kompakt karttır ("Ort. teslim" gizli): 5. kart orders-overview.css'te gizlenir */}
      <div className="so-ov-kpis-loading"><SkeletonCards count={5} /></div>
      <Skeleton height={40} radius={8} />
      {cols > 1 ? (
        <div className="so-skeleton-cols" data-cols={cols}>
          {Array.from({ length: cols }, (_, i) => <div key={i} className="ui-panel"><SkeletonRows rows={view === "board" ? 4 : 5} /></div>)}
        </div>
      ) : <div className="ui-panel"><SkeletonRows rows={8} /></div>}
    </div>
  );
};
