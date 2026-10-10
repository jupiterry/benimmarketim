import { Fragment, useEffect, useRef, useState } from "react";
import axios from "../lib/axios";
import {
  Search, Package2, ChevronLeft, ChevronRight, RefreshCw, Printer, SlidersHorizontal, X,
  Clock, Truck, CheckCircle2, XCircle, MapPin, Phone, Mail, Calendar,
  AlertTriangle, Trash2, Plus, Minus, Timer, AlertCircle, Tag, Bookmark,
  LayoutList, KanbanSquare, ClipboardList, Download, Keyboard, MessageCircle, Copy,
  History, UserRound, ListChecks, StickyNote
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";
import { useConfirm } from "./ConfirmModal";
import { useUserStore } from "../stores/useUserStore";
import {
  normalizeSearch, onlyDigits, formatMoney, formatPhoneTR, toWhatsAppNumber, getDeliveryMinutes,
  printReceipts, buildPickingList, printPickingList, buildOrdersCsv, downloadTextFile,
  buildOrderSummaryText, buildWhatsAppMessage,
} from "../lib/orderTools";

// Helper: Sipariş süresini hesapla
const getOrderDuration = (createdAt, updatedAt, status) => {
  const start = new Date(createdAt);
  const end = status === "Teslim Edildi" || status === "İptal Edildi" 
    ? new Date(updatedAt) 
    : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Yeni";
  }
  
  const diffMs = end - start;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins}dk`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}s ${mins}dk` : `${hours}s`;
};

// Helper: Bekleyen sipariş uyarı seviyesi
const getWarningLevel = (createdAt, status) => {
  if (status !== "Hazırlanıyor") return null;
  
  const diffMins = Math.floor((new Date() - new Date(createdAt)) / 60000);
  
  if (diffMins >= 30) return "critical"; // Kırmızı
  if (diffMins >= 15) return "warning";  // Turuncu
  return null;
};

// Helper: Dakika cinsinden bekleme süresi
const getWaitingMinutes = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((new Date() - date) / 60000));
};

const formatOrderDate = (date) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Tarih bilgisi yok";
  return parsed.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ── Sunum yardımcıları (yalnızca görünüm) ─────────────────────────────
const ORDER_STATUSES = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];

const STATUS_UI = {
  "Hazırlanıyor": { tone: "warn", icon: Clock, short: "Hazırlanıyor" },
  "Yolda": { tone: "info", icon: Truck, short: "Yolda" },
  "Teslim Edildi": { tone: "ok", icon: CheckCircle2, short: "Teslim" },
  "İptal Edildi": { tone: "danger", icon: XCircle, short: "İptal" },
};

const STATUS_CHIPS = [
  { value: "all", label: "Tümü" },
  { value: "active", label: "Aktif" },
  { value: "Hazırlanıyor", label: "Hazırlanıyor", tone: "warn" },
  { value: "Yolda", label: "Yolda", tone: "info" },
  { value: "Teslim Edildi", label: "Teslim edildi", tone: "ok" },
  { value: "İptal Edildi", label: "İptal", tone: "danger" },
];

const StatusBadge = ({ status }) => {
  const ui = STATUS_UI[status] || { tone: "neutral", icon: Clock };
  return (
    <span className={`ui-badge ui-badge--${ui.tone}`}>
      <i className={`ui-dot ui-dot--${ui.tone}`} /> {status}
    </span>
  );
};

// Liste ve detayda kullanılan görsel yardımcılar
const STATUS_FLOW = ["Hazırlanıyor", "Yolda", "Teslim Edildi"];

const getInitials = (name) =>
  String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR")).join("") || "?";

const formatOrderClock = (createdAt) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

// Listeyi günlere ayıran başlık: "Bugün", "Dün" veya "4 Ekim Cumartesi"
const getDayLabel = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (dayDiff === 0) return "Bugün";
  if (dayDiff === 1) return "Dün";
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
};

// Kısa zaman: "21:14", "Dün 23:10" ya da "8 Eki 21:14"
const formatShortWhen = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const label = getDayLabel(createdAt);
  const clock = formatOrderClock(createdAt);
  if (label === "Bugün") return clock;
  if (label === "Dün") return `Dün ${clock}`;
  return `${date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${clock}`;
};

const getPlatformLabel = (platform) =>
  platform === "ios" ? "iOS" : platform === "android" ? "Android" : "Web";

// Aktif siparişin bir sonraki adımı (liste ve "Sıradaki" şeridindeki hızlı düğme)
const NEXT_STEP = {
  "Hazırlanıyor": { status: "Yolda", label: "Yola çıkar", icon: Truck },
  "Yolda": { status: "Teslim Edildi", label: "Teslim et", icon: CheckCircle2 },
};

// Pano sütunları: tamamlanan sütunlarda yalnızca en yeni kartlar gösterilir
const BOARD_COLUMNS = [
  { status: "Hazırlanıyor", label: "Hazırlanıyor", limit: Infinity },
  { status: "Yolda", label: "Yolda", limit: Infinity },
  { status: "Teslim Edildi", label: "Teslim edildi", limit: 10 },
  { status: "İptal Edildi", label: "İptal", limit: 8 },
];

const TIMELINE_LABELS = {
  "Hazırlanıyor": "Hazırlanıyor'a alındı",
  "Yolda": "Yola çıktı",
  "Teslim Edildi": "Teslim edildi",
  "İptal Edildi": "İptal edildi",
};

const WAITING_LABELS = {
  "Hazırlanıyor": "Yola çıkması bekleniyor",
  "Yolda": "Teslim edilmesi bekleniyor",
};

const formatMinutes = (minutes) => {
  if (minutes == null || Number.isNaN(minutes)) return "";
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
};

// Durum geçmişinden okunur bir zaman çizelgesi: "Sipariş alındı → Yola çıktı (+11 dk) → …".
// Eski siparişlerde geçmiş boş olabilir; o zaman yalnızca sipariş anı gösterilir.
const buildTimeline = (order) => {
  const created = new Date(order.createdAt);
  const steps = Number.isNaN(created.getTime()) ? [] : [{ key: "created", label: "Sipariş alındı", at: created, tone: "warn" }];
  const history = [...(order.statusHistory || [])]
    .map((entry) => ({ ...entry, at: new Date(entry.changedAt) }))
    .filter((entry) => entry.status && !Number.isNaN(entry.at.getTime()))
    .sort((a, b) => a.at - b.at);

  history.forEach((entry, index) => {
    // Siparişle aynı anda yazılan ilk "Hazırlanıyor" kaydı "Sipariş alındı" ile aynıdır
    if (index === 0 && entry.status === "Hazırlanıyor" && steps[0] && Math.abs(entry.at - steps[0].at) < 120000) return;
    steps.push({ key: `${entry.status}-${index}`, label: TIMELINE_LABELS[entry.status] || entry.status, at: entry.at, tone: STATUS_UI[entry.status]?.tone || "neutral" });
  });

  return steps.map((step, index) => ({
    ...step,
    delta: index === 0 ? null : Math.max(0, Math.round((step.at - steps[index - 1].at) / 60000)),
  }));
};

const formatClock = (date) => date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

// Liste satırı: müşteri (avatar, sipariş no, teslimat noktası), süre, durum, tutar ve hızlı adım
const OrderRow = ({ order, active, selected, fresh, onSelectChange, onOpen, onAdvance }) => {
  const warningLevel = getWarningLevel(order.createdAt, order.status);
  const next = NEXT_STEP[order.status];
  const NextIcon = next?.icon;

  return (
    <div className="ord-row" data-order-id={order.orderId} data-active={active} data-checked={selected} data-fresh={fresh || undefined} data-tone={STATUS_UI[order.status]?.tone}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelectChange}
        aria-label={`#${String(order.orderId).slice(-6)} siparişini seç`}
      />
      <button
        className="ord-row-main"
        onClick={() => onOpen(order)}
        aria-label={`${order.user?.name || "Müşteri"} siparişinin detayını aç`}
        aria-current={active ? "true" : undefined}
      >
        <span className="ord-avatar" aria-hidden="true">{getInitials(order.user?.name)}</span>
        <span className="ord-c-customer">
          <strong>
            <span>{order.user?.name}</span>
            {order.isFirstOrder && <span className="ui-badge ui-badge--brand">Yeni</span>}
          </strong>
          <small>
            <span className="ui-mono">#{order.orderId.slice(-6).toUpperCase()}</span>
            <span>{order.products?.length || 0} ürün</span>
            <span className="ord-c-point"><MapPin />{order.deliveryPointName || order.city || "Belirtilmemiş"}</span>
            {order.note && String(order.note).trim() && (
              <span className="ord-c-note" title={`Müşteri notu: ${order.note}`}><StickyNote />Not</span>
            )}
          </small>
        </span>
        <span className="ord-c-time" data-level={warningLevel || undefined} title="Sipariş süresi">
          {warningLevel ? <AlertCircle /> : <Timer />}
          {getOrderDuration(order.createdAt, order.updatedAt, order.status)}
        </span>
        <span className="ord-c-status">
          <StatusBadge status={order.status} />
        </span>
        <span className="ord-c-total">
          <strong>₺{order.totalAmount?.toFixed(2)}</strong>
          <small>{formatOrderClock(order.createdAt)}</small>
        </span>
      </button>
      <span className="ord-row-act">
        {next && onAdvance && (
          <button type="button" className="ui-btn ui-btn--sm" data-next={next.status === "Yolda" ? "way" : "done"}
            onClick={() => onAdvance(order.orderId, next.status)}
            aria-label={`${order.user?.name || "Müşteri"} siparişini “${next.status}” yap`}>
            <NextIcon />{next.label}
          </button>
        )}
      </span>
    </div>
  );
};

// Sağ detay paneli: seçili siparişin tüm bilgisi ve aksiyonları
const OrderDetail = ({ order, customer, onClose, onStatusUpdate, onDeliveryTracking, onPrint, onDelete, onAddItem, onRemoveItem, onUpdateQuantity, onOpenOrder, onCopy }) => {
  const warningLevel = getWarningLevel(order.createdAt, order.status);
  const duration = getOrderDuration(order.createdAt, order.updatedAt, order.status);
  const phone = order.phone || order.user?.phone || "";
  const waNumber = toWhatsAppNumber(phone);
  const timeline = buildTimeline(order);
  const waiting = WAITING_LABELS[order.status];
  const lastStepAt = timeline.length ? timeline[timeline.length - 1].at : null;
  const otherOrders = (customer?.orders || []).filter((item) => item.orderId !== order.orderId).slice(0, 4);

  return (
    <>
      <div className="ord-d-head">
        <span className="ord-avatar ord-avatar--lg" aria-hidden="true">{getInitials(order.user?.name)}</span>
        <div className="ord-d-title">
          <h2>
            {order.user?.name}
            {order.isFirstOrder && <span className="ui-badge ui-badge--brand">Yeni</span>}
          </h2>
          <p>
            #{order.orderId.slice(-8).toUpperCase()} · {order.userOrderCount || 1}. sipariş
            {order.device && <> · {getPlatformLabel(order.device.platform)}</>}
          </p>
        </div>
        <button onClick={onClose} className="ui-icon-btn ord-d-close" aria-label="Detayı kapat">
          <X />
        </button>
      </div>

      {/* Hızlı iletişim: ara, WhatsApp'tan yaz, kuryeye özet kopyala */}
      <div className="ord-d-quick">
        {phone ? (
          <a className="ui-btn ui-btn--sm" href={`tel:${onlyDigits(phone)}`}><Phone />Ara</a>
        ) : (
          <button className="ui-btn ui-btn--sm" disabled><Phone />Ara</button>
        )}
        {waNumber ? (
          <a className="ui-btn ui-btn--sm ord-wa" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle />WhatsApp
          </a>
        ) : (
          <button className="ui-btn ui-btn--sm" disabled title="Telefon numarası tanınmadı"><MessageCircle />WhatsApp</button>
        )}
        <button className="ui-btn ui-btn--sm" onClick={() => onCopy(order)} title="Sipariş özetini kopyala (kurye için)">
          <Copy />Özeti kopyala
        </button>
      </div>

      <div className="ord-d-body">
        {/* Durum */}
        <section className="ord-d-section">
          <div className="ord-d-tags">
            <StatusBadge status={order.status} />
            <span className="ui-badge" title="Sipariş süresi">
              <Timer /> {duration}
            </span>
            {warningLevel && (
              <span className={`ui-badge ${warningLevel === 'critical' ? 'ui-badge--danger' : 'ui-badge--warn'}`} title="Bekleme süresi">
                <AlertCircle /> {getWaitingMinutes(order.createdAt)}dk bekliyor
              </span>
            )}
          </div>
          <div className="ord-steps" role="group" aria-label="Sipariş durumunu değiştir" data-cancelled={order.status === "İptal Edildi"}>
            {ORDER_STATUSES.map(status => {
              const ui = STATUS_UI[status];
              const Icon = ui.icon;
              const stepIndex = STATUS_FLOW.indexOf(status);
              const currentIndex = STATUS_FLOW.indexOf(order.status);
              return (
                <button
                  key={status}
                  onClick={() => {
                    const result = onStatusUpdate(order.orderId, status);
                    // İptal onay ister; vazgeçilirse panel açık kalır
                    if (status === "İptal Edildi") Promise.resolve(result).then((done) => { if (done !== false) onClose(); });
                    else onClose();
                  }}
                  title={`${status} olarak güncelle`}
                  aria-pressed={order.status === status}
                  data-tone={ui.tone}
                  data-step={stepIndex === -1 ? "cancel" : stepIndex < currentIndex ? "done" : stepIndex === currentIndex ? "current" : "todo"}
                >
                  <span className="ord-step-dot"><Icon /></span>
                  <span className="ord-step-label">{ui.short}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Müşteri notu */}
        {order.note && (
          <div className="ui-note">
            <AlertTriangle />
            <div>
              <p className="ui-note-label">Müşteri Notu</p>
              <p className="ui-note-body">{order.note}</p>
            </div>
          </div>
        )}

        {/* Zaman çizelgesi: hangi adım ne zaman, kaç dakika sürdü */}
        <section className="ord-d-section">
          <h3 className="ui-overline"><History /> Zaman çizelgesi</h3>
          <ol className="ord-timeline">
            {timeline.map((step) => (
              <li key={step.key} data-tone={step.tone}>
                <span className="ord-timeline-dot" aria-hidden="true" />
                <span className="ord-timeline-label">{step.label}</span>
                {step.delta != null && <span className="ord-timeline-delta">+{formatMinutes(step.delta)}</span>}
                <time className="ui-num" dateTime={step.at.toISOString()}>{formatClock(step.at)}</time>
              </li>
            ))}
            {waiting && lastStepAt && (
              <li data-tone="pending">
                <span className="ord-timeline-dot" aria-hidden="true" />
                <span className="ord-timeline-label">{waiting}</span>
                <span className="ord-timeline-delta">{formatMinutes(Math.max(0, Math.round((Date.now() - lastStepAt) / 60000)))}</span>
                <time />
              </li>
            )}
          </ol>
        </section>

        {/* Müşteri ve teslimat */}
        <section className="ord-d-section">
          <h3 className="ui-overline">Müşteri ve teslimat</h3>
          <dl className="ord-d-facts">
            <div><dt><Mail /> E-posta</dt><dd>{order.user?.email ? <a className="ui-link" href={`mailto:${order.user.email}`}>{order.user.email}</a> : "E-posta yok"}</dd></div>
            <div><dt><Phone /> Telefon</dt><dd>{(order.phone || order.user?.phone) ? <a className="ui-link ui-num" href={`tel:${order.phone || order.user?.phone}`}>{formatPhoneTR(order.phone || order.user?.phone)}</a> : '-'}</dd></div>
            <div><dt><MapPin /> Teslimat</dt><dd>{order.deliveryPointName || order.deliveryPoint || order.city || 'Belirtilmemiş'}</dd></div>
            <div><dt><Calendar /> Sipariş zamanı</dt><dd>{formatOrderDate(order.createdAt)}</dd></div>
          </dl>
          <label className="ui-label" htmlFor="delivery-tracking-input">Kargo / teslimat takibi</label>
          <div className="ord-d-tracking">
            <input key={order.orderId} id="delivery-tracking-input" defaultValue={order.deliveryTracking || ""} maxLength={120} placeholder="Takip numarası veya teslimat notu" className="ui-field" />
            <button className="ui-btn" onClick={() => onDeliveryTracking(order.orderId, document.getElementById("delivery-tracking-input")?.value || "")}>Takibi kaydet</button>
          </div>
        </section>

        {/* Ürünler */}
        <section className="ord-d-section">
          <div className="ui-between">
            <h3 className="ui-overline">
              Ürünler · {order.products?.length || 0} ürün, {order.products?.reduce((s, p) => s + (p.quantity || 1), 0)} adet
            </h3>
            <button onClick={() => onAddItem(order.orderId)} className="ui-btn ui-btn--sm">
              <Plus /> Ekle
            </button>
          </div>
          <div className="ord-d-items">
            {order.products?.map((product, idx) => (
              <div key={idx} className="ord-d-item">
                <div className="ui-thumb">
                  {product.image ? (
                    <img src={product.image} alt={product.name} />
                  ) : (
                    <Package2 size={16} />
                  )}
                </div>
                <div className="ord-d-item-text">
                  <p>{product.name}</p>
                  <small>Birim: ₺{product.price}</small>
                </div>
                <div className="ui-stepper">
                  <button
                    onClick={() => onUpdateQuantity(order.orderId, idx, product.quantity - 1)}
                    disabled={product.quantity <= 1}
                    title={product.quantity <= 1 ? "Minimum miktar: 1" : "Miktarı Azalt"}
                    aria-label="Miktarı Azalt"
                  >
                    <Minus />
                  </button>
                  <span>{product.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(order.orderId, idx, product.quantity + 1)}
                    title="Miktarı Artır"
                    aria-label="Miktarı Artır"
                  >
                    <Plus />
                  </button>
                </div>
                <strong className="ord-d-item-total">₺{(product.price * product.quantity).toFixed(2)}</strong>
                <button
                  onClick={() => onRemoveItem(order.orderId, idx, product.name)}
                  className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger"
                  title="Ürünü Sil"
                  aria-label="Ürünü Sil"
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <dl className="ord-d-totals">
            {order.couponCode && order.subtotalAmount > 0 && (
              <div><dt>Ara toplam</dt><dd>₺{order.subtotalAmount?.toFixed(2)}</dd></div>
            )}
            {order.couponCode && (
              <div>
                <dt><span className="ui-badge"><Tag /> {order.couponCode}</span></dt>
                <dd>₺{(order.couponDiscount || 0).toFixed(0)} indirim</dd>
              </div>
            )}
            <div className="ord-d-grand"><dt>Toplam Tutar</dt><dd>₺{order.totalAmount?.toFixed(2)}</dd></div>
          </dl>
        </section>

        {/* Müşteri geçmişi: sadakat ve iptal eğilimi bir bakışta */}
        {customer && (
          <section className="ord-d-section">
            <h3 className="ui-overline"><UserRound /> Müşteri geçmişi</h3>
            <dl className="ord-cust-stats">
              <div><dt>Sipariş</dt><dd className="ui-num">{customer.count}</dd></div>
              <div><dt>Harcama</dt><dd className="ui-num">{formatMoney(customer.spent)}</dd></div>
              <div><dt>Ort. sepet</dt><dd className="ui-num">{formatMoney(customer.average)}</dd></div>
              <div data-alert={customer.cancelled > 0 || undefined}><dt>İptal</dt><dd className="ui-num">{customer.cancelled}</dd></div>
            </dl>
            {customer.firstAt && (
              <p className="ui-hint">
                {customer.count === 1 ? "İlk siparişi" : `İlk siparişi ${customer.firstAt.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`}
              </p>
            )}
            {otherOrders.length > 0 && (
              <ul className="ord-cust-orders">
                {otherOrders.map((item) => (
                  <li key={item.orderId}>
                    <button type="button" onClick={() => onOpenOrder(item)}>
                      <i className={`ui-dot ui-dot--${STATUS_UI[item.status]?.tone || "neutral"}`} />
                      <span className="ui-mono">#{String(item.orderId).slice(-6).toUpperCase()}</span>
                      <span className="ord-cust-date">{formatOrderDate(item.createdAt)}</span>
                      <span className="ord-cust-items">{item.products?.length || 0} ürün</span>
                      <strong className="ui-num">{formatMoney(item.totalAmount)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="ord-d-foot">
        <button onClick={() => { onPrint(order); onClose(); }} className="ui-btn">
          <Printer /> Yazdır
        </button>
        <button onClick={() => { onDelete(order.orderId); onClose(); }} className="ui-btn ui-btn--danger">
          <Trash2 /> Sil
        </button>
      </div>
    </>
  );
};

// Pano kartı: sürüklenebilir; tıklanınca detay açılır, alttaki düğme sonraki adıma geçirir
const BoardCard = ({ order, active, fresh, dragging, onOpen, onAdvance, onDragStart, onDragEnd }) => {
  const warningLevel = getWarningLevel(order.createdAt, order.status);
  const next = NEXT_STEP[order.status];
  const NextIcon = next?.icon;
  const hasNote = order.note && String(order.note).trim();
  // Tamamlanan kartlar sade: süre ve teslimat noktası yerine sipariş zamanı
  const compact = order.status === "Teslim Edildi" || order.status === "İptal Edildi";

  return (
    <article
      className="ord-card"
      data-compact={compact || undefined}
      data-order-id={order.orderId}
      data-tone={STATUS_UI[order.status]?.tone}
      data-active={active || undefined}
      data-fresh={fresh || undefined}
      data-dragging={dragging || undefined}
      data-level={warningLevel || undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(order.orderId));
        onDragStart(order.orderId);
      }}
      onDragEnd={onDragEnd}
    >
      <button type="button" className="ord-card-open" onClick={() => onOpen(order)} aria-label={`${order.user?.name || "Müşteri"} siparişinin detayını aç`}>
        <span className="ord-card-top">
          <span className="ord-avatar" aria-hidden="true">{getInitials(order.user?.name)}</span>
          <span className="ord-card-name">
            <strong>{order.user?.name || "Müşteri"}</strong>
            <small>
              <span className="ui-mono">#{String(order.orderId).slice(-6).toUpperCase()}</span> · {compact ? formatShortWhen(order.createdAt) : `${order.products?.length || 0} ürün`}
            </small>
          </span>
          <span className="ord-card-total ui-num">{formatMoney(order.totalAmount)}</span>
        </span>
        {!compact && (
        <span className="ord-card-meta">
          <span className="ord-chip" data-level={warningLevel || undefined} title="Sipariş süresi">
            {warningLevel ? <AlertCircle /> : <Timer />}{getOrderDuration(order.createdAt, order.updatedAt, order.status)}
          </span>
          <span className="ord-chip"><MapPin />{order.deliveryPointName || order.city || "Belirtilmemiş"}</span>
          {hasNote && <span className="ord-chip" data-tone="warn" title={`Müşteri notu: ${order.note}`}><StickyNote />Not</span>}
          {order.isFirstOrder && <span className="ord-chip" data-tone="brand">İlk sipariş</span>}
        </span>
        )}
      </button>
      {next && (
        <button type="button" className="ui-btn ui-btn--sm ord-card-go" data-next={next.status === "Yolda" ? "way" : "done"}
          onClick={() => onAdvance(order.orderId, next.status)}
          aria-label={`${order.user?.name || "Müşteri"} siparişini “${next.status}” yap`}>
          <NextIcon />{next.label}
        </button>
      )}
    </article>
  );
};

// Pano: durum sütunları. Kart başka sütuna bırakılınca durum değişir (iptal onay ister).
const OrderBoard = ({ columns, activeId, freshIds, onOpen, onAdvance, onMove, onShowAll }) => {
  const [draggingId, setDraggingId] = useState(null);
  const [dropStatus, setDropStatus] = useState(null);
  const draggingStatus = draggingId
    ? columns.flatMap((column) => column.items).find((order) => order.orderId === draggingId)?.status
    : null;
  const endDrag = () => { setDraggingId(null); setDropStatus(null); };

  return (
    <section className="ord-board" aria-label="Sipariş panosu" data-dragging={draggingId ? true : undefined}>
      {columns.map((column) => {
        const ui = STATUS_UI[column.status];
        const Icon = ui.icon;
        const canDrop = Boolean(draggingId) && draggingStatus !== column.status;
        return (
          <div
            key={column.status}
            className="ord-col"
            data-tone={ui.tone}
            data-droppable={canDrop || undefined}
            data-over={(canDrop && dropStatus === column.status) || undefined}
            onDragOver={(e) => {
              if (!canDrop) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropStatus !== column.status) setDropStatus(column.status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDropStatus((current) => (current === column.status ? null : current));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const orderId = draggingId || e.dataTransfer.getData("text/plain");
              endDrag();
              if (canDrop && orderId) onMove(orderId, column.status);
            }}
          >
            <header className="ord-col-head">
              <span className="ord-col-icon" aria-hidden="true"><Icon /></span>
              <strong>{column.label}</strong>
              <span className="ord-col-count ui-num">{column.items.length}</span>
              <span className="ord-col-sum ui-num">{formatMoney(column.sum)}</span>
            </header>
            <div className="ord-col-body">
              {column.visible.map((order) => (
                <BoardCard
                  key={order.orderId}
                  order={order}
                  active={activeId === order.orderId}
                  fresh={freshIds.includes(order.orderId)}
                  dragging={draggingId === order.orderId}
                  onOpen={onOpen}
                  onAdvance={onAdvance}
                  onDragStart={setDraggingId}
                  onDragEnd={endDrag}
                />
              ))}
              {column.items.length === 0 && (
                <p className="ord-col-empty">{canDrop ? "Buraya bırakın" : "Sipariş yok"}</p>
              )}
              {column.hidden > 0 && (
                <button type="button" className="ord-col-more" onClick={() => onShowAll(column.status)}>
                  +{column.hidden} sipariş daha · listede gör
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
};

const SHORTCUTS = [
  [["j"], "Sonraki siparişi aç"],
  [["k"], "Önceki siparişi aç"],
  [["x"], "Açık siparişi seç / bırak"],
  [["y"], "Açık siparişin fişini yazdır"],
  [["/"], "Aramaya git"],
  [["v"], "Liste / pano görünümü"],
  [["Esc"], "Paneli veya çekmeceyi kapat"],
  [["?"], "Bu yardımı aç / kapat"],
];

// Main Component
const OrdersList = () => {
  const { user } = useUserStore();
  const accessToken = user?.accessToken;
  const [orderAnalyticsData, setOrderAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [savedFilters, setSavedFilters] = useState(() => { try { return JSON.parse(localStorage.getItem("admin-order-filters") || "[]"); } catch { return []; } });
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [problemOnly, setProblemOnly] = useState(false);
  const [delayedOnly, setDelayedOnly] = useState(false);
  useEffect(() => { const preset = sessionStorage.getItem("admin-order-preset"); if (preset === "active") setStatusFilter("active"); if (preset === "delayed") setDelayedOnly(true); sessionStorage.removeItem("admin-order-preset"); }, []);
  const [dateFilter, setDateFilter] = useState("all");
  const [deliveryPointFilter, setDeliveryPointFilter] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const ordersPerPage = 10;

  // Custom item modal states
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [customItemAmount, setCustomItemAmount] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  
  // Product selection states
  const [addItemTab, setAddItemTab] = useState("catalog"); // "catalog" veya "manual"
  const [productList, setProductList] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  
  // Order Detail Modal state
  const [detailModalOrder, setDetailModalOrder] = useState(null);

  // Görünüm (liste / pano), toplama listesi, kısayol yardımı, yeni gelen siparişlerin vurgusu
  const [view, setView] = useState(() => {
    try { return localStorage.getItem("admin-order-view") === "board" ? "board" : "list"; } catch { return "list"; }
  });
  const [pickingOpen, setPickingOpen] = useState(false);
  const [pickingScope, setPickingScope] = useState("preparing");
  const [pickedKeys, setPickedKeys] = useState([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [freshIds, setFreshIds] = useState([]);
  const knownIdsRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const keyboardRef = useRef({});

  const { confirm } = useConfirm();

  const handleOpenAddItemModal = async (orderId) => {
    setSelectedOrderId(orderId);
    setCustomItemAmount("");
    setCustomItemName("");
    setAddItemTab("catalog");
    setProductSearch("");
    setSelectedProduct(null);
    setProductQuantity(1);
    setShowAddItemModal(true);
    
    // Ürün listesini çek
    await fetchProducts();
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await axios.get("/products");
      setProductList(response.data.products || []);
    } catch (error) {
      console.error("Ürünler yüklenirken hata:", error);
      toast.error("Ürünler yüklenemedi");
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleAddProductFromCatalog = async () => {
    if (!selectedOrderId || !selectedProduct) {
      toast.error("Lütfen bir ürün seçin");
      return;
    }

    try {
      await axios.put("/orders-analytics/add-product", {
        orderId: selectedOrderId,
        productId: selectedProduct._id,
        quantity: productQuantity
      });
      
      toast.success(`${selectedProduct.name} siparişe eklendi`);
      setShowAddItemModal(false);
      fetchOrderAnalyticsData();
    } catch (error) {
      console.error("Ürün eklenirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu");
    }
  };

  const handleAddCustomItem = async (e) => {
    e.preventDefault();
    if (!selectedOrderId || !customItemAmount) return;

    try {
      await axios.put("/orders-analytics/add-item", {
        orderId: selectedOrderId,
        amount: customItemAmount,
        name: customItemName
      });
      
      toast.success("Ürün başarıyla eklendi");
      setShowAddItemModal(false);
      fetchOrderAnalyticsData();
    } catch (error) {
      console.error("Ürün eklenirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu");
    }
  };

  // Filtrelenmiş ürün listesi
  const filteredProducts = productList.filter(product => 
    product.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.category?.toLowerCase().includes(productSearch.toLowerCase())
  );


  // Fiş içeriği ve biçimi lib/orderTools içindedir; tek fiş çıktısı öncekiyle aynıdır
  const handlePrint = (order) => {
    try {
      if (!printReceipts([order])) {
        toast.error("Yazdırma penceresi açılamadı. Tarayıcıda bu site için açılır pencerelere izin verin.");
      }
    } catch (e) {
      console.error('Yazdırma hatası:', e);
      toast.error('Yazdırma sırasında hata oluştu');
    }
  };

  const fetchOrderAnalyticsData = async () => {
    try {
      const response = await axios.get("/orders-analytics");
      const sortedUsersOrders = response.data.orderAnalyticsData?.usersOrders?.map(userOrder => ({
        ...userOrder,
        orders: userOrder.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      })) || [];

      setOrderAnalyticsData({
        totalOrders: response.data.orderAnalyticsData?.totalOrders || 0,
        usersOrders: sortedUsersOrders,
      });
      setLastRefresh(new Date());

      // Son yenilemeden bu yana gelen siparişler listede kısa süre vurgulanır
      const ids = sortedUsersOrders.flatMap((userOrder) => userOrder.orders.map((order) => order.orderId));
      if (knownIdsRef.current) {
        const added = ids.filter((id) => !knownIdsRef.current.has(id));
        if (added.length) {
          setFreshIds((current) => [...new Set([...current, ...added])]);
          setTimeout(() => setFreshIds((current) => current.filter((id) => !added.includes(id))), 12000);
        }
      }
      knownIdsRef.current = new Set(ids);
      // Silinmiş siparişler seçimde kalmasın
      setSelectedOrderIds((selected) => selected.filter((id) => knownIdsRef.current.has(id)));
    } catch (error) {
      console.error("API isteği sırasında hata:", error.response || error.message);
      toast.error("Siparişler yüklenirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderAnalyticsData();

    // Browser Notification izni iste
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const socket = socketService.connect();

    const handleConnect = () => socket.emit('joinAdminRoom', { token: accessToken });
    socket.on('connect', handleConnect);
    if (socket.connected) handleConnect();

    const handleNewOrder = (data) => {
      console.log('Yeni sipariş bildirimi alındı:', data);
      fetchOrderAnalyticsData();
      // Bildirim, ses ve tarayıcı uyarısı AdminPage tarafından tek noktadan
      // yönetilir. Bu bileşen yalnızca sipariş listesini yeniler.
    };

    socket.on('newOrder', handleNewOrder);

    // Başka bir yönetici durumu değiştirdiğinde ya da müşteri uygulamadan iptal ettiğinde
    // liste 30 sn'yi beklemeden yenilenir. Art arda gelen olaylar tek istekte birleşir.
    const handleStatusUpdated = () => {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => fetchOrderAnalyticsData(), 700);
    };
    socket.on('orderStatusUpdated', handleStatusUpdated);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('newOrder', handleNewOrder);
      socket.off('orderStatusUpdated', handleStatusUpdated);
      clearTimeout(refreshTimerRef.current);
    };
  }, [accessToken]);

  // Klavye kısayolları. Güncel liste ve eylemler her çizimde keyboardRef'e yazılır;
  // dinleyici bir kez bağlanır. Yönetim panelinin "g" + harf ve "n" kısayollarıyla çakışmaz.
  useEffect(() => {
    const onKeyDown = (e) => {
      const kb = keyboardRef.current;
      if (!kb?.ready || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector(".confirm-root")) return;
      const typing = e.target?.closest?.('input, textarea, select, [contenteditable="true"]');

      if (e.key === "Escape") {
        if (typing) { if (e.target === searchInputRef.current) e.target.blur(); return; }
        if (kb.closeTopLayer()) e.preventDefault();
        return;
      }
      if (typing) return;
      if (e.key === "?") { e.preventDefault(); kb.toggleShortcuts(); return; }
      if (document.querySelector('.ord [aria-modal="true"]')) return;

      if (e.key === "/") { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if (e.key === "j" || e.key === "k") { e.preventDefault(); kb.move(e.key === "j" ? 1 : -1); return; }
      if (e.key === "v") { kb.toggleView(); return; }
      if (e.key === "x") { kb.toggleSelectActive(); return; }
      if (e.key === "y") { kb.printActive(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchOrderAnalyticsData();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put("/orders-analytics/update-status", { orderId, status });
      // Sunucunun yaptığı gibi geçmişe kayıt düşülür; süre ve zaman çizelgesi yenilemeyi beklemez
      const changedAt = new Date().toISOString();
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.map((order) =>
            order.orderId === orderId
              ? { ...order, status, updatedAt: changedAt, statusHistory: [...(order.statusHistory || []), { status, changedAt }] }
              : order
          ),
        })),
      }));
      toast.success("Sipariş durumu güncellendi");
    } catch (error) {
      console.error("Sipariş durumu güncellenirken hata:", error);
      toast.error("Sipariş durumu güncellenirken hata oluştu");
    }
  };

  const updateDeliveryTracking = async (orderId, deliveryTracking) => {
    try {
      await axios.put("/orders-analytics/delivery-tracking", { orderId, deliveryTracking });
      toast.success("Teslimat bilgisi kaydedildi");
      fetchOrderAnalyticsData();
    } catch { toast.error("Teslimat bilgisi kaydedilemedi"); }
  };

  const bulkUpdateStatus = async (status) => {
    if (!selectedOrderIds.length) return;
    // Toplu değişiklik birden çok müşteriye bildirim gönderir; önce onay alınır
    const confirmed = await confirm({
      title: "Toplu durum değişikliği",
      message: `${selectedOrderIds.length} siparişin durumu “${status}” olarak güncellenecek. Durumu değişen siparişlerin müşterilerine bildirim gönderilir.`,
      confirmText: "Evet, güncelle",
      cancelText: "Vazgeç",
      type: status === "İptal Edildi" ? "danger" : "warning",
    });
    if (!confirmed) return;
    try {
      await axios.put("/orders-analytics/bulk-status", { orderIds: selectedOrderIds, status });
      setSelectedOrderIds([]);
      fetchOrderAnalyticsData();
      toast.success("Seçili siparişler güncellendi");
    } catch { toast.error("Toplu işlem tamamlanamadı"); }
  };

  // Detay, pano ve klavyeden gelen durum değişiklikleri buradan geçer:
  // aynı duruma tekrar basmak boş geçmiş kaydı oluşturmaz, iptal onay ister.
  const requestStatusChange = async (orderId, status) => {
    let current = null;
    for (const userOrder of orderAnalyticsData?.usersOrders || []) {
      const match = userOrder.orders.find((order) => order.orderId === orderId);
      if (match) { current = { ...match, user: userOrder.user }; break; }
    }
    if (current && current.status === status) return false;
    if (status === "İptal Edildi") {
      const confirmed = await confirm({
        title: "Siparişi iptal et",
        message: `${current?.user?.name ? `${current.user.name} adlı müşterinin` : "Bu"} #${String(orderId).slice(-6).toUpperCase()} numaralı siparişi iptal edilecek ve müşteriye bildirim gönderilecek. Emin misiniz?`,
        confirmText: "Evet, iptal et",
        cancelText: "Vazgeç",
        type: "danger",
      });
      if (!confirmed) return false;
    }
    await updateOrderStatus(orderId, status);
    return true;
  };

  // Kuryeye ya da mesaja yapıştırmak için sipariş özeti
  const handleCopySummary = async (order) => {
    const text = buildOrderSummaryText(order);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Sipariş özeti kopyalandı");
    } catch {
      // Pano izni yoksa (eski tarayıcı, http) gizli metin alanı ile kopyalanır
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (copied) toast.success("Sipariş özeti kopyalandı");
      else toast.error("Kopyalanamadı");
    }
  };

  const handleDeleteOrder = async (orderId) => {
    const confirmed = await confirm({
      title: 'Siparişi Sil',
      message: 'Bu siparişi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!',
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      type: 'danger'
    });
    
    if (!confirmed) return;
    
    try {
      await axios.delete(`/orders-analytics/delete-order/${orderId}`);
      
      // State'ten siparişi kaldır
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.filter((order) => order.orderId !== orderId),
        })).filter(userOrder => userOrder.orders.length > 0),
      }));
      // Silinen sipariş seçili kalırsa sonraki toplu işlem "bulunamadı" hatası verir
      setSelectedOrderIds((ids) => ids.filter((id) => id !== orderId));

      toast.success("Sipariş başarıyla silindi!");
    } catch (error) {
      console.error("Sipariş silinirken hata:", error);
      toast.error(error.response?.data?.message || "Sipariş silinirken hata oluştu");
    }
  };

  // Siparişten ürün silme handler'ı
  const handleRemoveItem = async (orderId, productIndex, productName) => {
    const confirmed = await confirm({
      title: 'Ürünü Sil',
      message: `"${productName}" ürününü siparişten silmek istediğinize emin misiniz?`,
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      type: 'warning'
    });
    
    if (!confirmed) return;
    
    try {
      await axios.delete("/orders-analytics/remove-item", {
        data: { orderId, productIndex }
      });
      
      toast.success(`${productName} siparişten silindi`);
      fetchOrderAnalyticsData();
    } catch (error) {
      console.error("Ürün silinirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün silinirken hata oluştu");
    }
  };

  // Ürün miktarını güncelleme handler'ı
  const handleUpdateQuantity = async (orderId, productIndex, newQuantity) => {
    if (newQuantity < 1) {
      toast.error("Miktar en az 1 olmalı!");
      return;
    }
    
    try {
      await axios.put("/orders-analytics/update-item-quantity", {
        orderId,
        productIndex,
        newQuantity
      });
      
      // Optimistic update - state'i hemen güncelle
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.map((order) => {
            if (order.orderId === orderId) {
              const updatedProducts = [...order.products];
              const oldQuantity = updatedProducts[productIndex].quantity;
              const priceDiff = updatedProducts[productIndex].price * (newQuantity - oldQuantity);
              updatedProducts[productIndex] = {
                ...updatedProducts[productIndex],
                quantity: newQuantity
              };
              return {
                ...order,
                products: updatedProducts,
                totalAmount: order.totalAmount + priceDiff
              };
            }
            return order;
          }),
        })),
      }));
      
      toast.success("Miktar güncellendi");
    } catch (error) {
      console.error("Miktar güncellenirken hata:", error);
      toast.error(error.response?.data?.message || "Miktar güncellenirken hata oluştu");
      // Hata durumunda veriyi yeniden çek
      fetchOrderAnalyticsData();
    }
  };

  // Arama Türkçe uyumludur (İ/ı, ç/c…) ve sipariş no, müşteri, e-posta, ürün,
  // teslimat noktası, not, kupon, takip notu ile telefonun rakamlarında çalışır.
  const filterOrders = (orders, { ignoreStatus = false } = {}) => {
    const query = normalizeSearch(searchTerm).replace(/^#/, "");
    const queryDigits = onlyDigits(searchTerm).replace(/^(90|0)/, "");
    return orders.filter((order) => {
      const matchesSearch = !query ||
        [
          order.orderId, order.user?.name, order.user?.email, order.deliveryPointName,
          order.note, order.couponCode, order.deliveryTracking,
          ...(order.products || []).map((product) => product.name),
        ].some((value) => value && normalizeSearch(value).includes(query)) ||
        (queryDigits.length >= 3 && [order.phone, order.user?.phone].some((phone) => onlyDigits(phone).includes(queryDigits)));

      const matchesStatus = ignoreStatus ||
        statusFilter === "all" || order.status === statusFilter || (statusFilter === "active" && ["Hazırlanıyor", "Yolda"].includes(order.status));

      const matchesDeliveryPoint = 
        deliveryPointFilter === "all" || 
        order.deliveryPoint === deliveryPointFilter ||
        order.deliveryPointName?.toLowerCase().includes(deliveryPointFilter.toLowerCase());

      const matchesAmount = 
        (!minAmount || order.totalAmount >= parseFloat(minAmount)) &&
        (!maxAmount || order.totalAmount <= parseFloat(maxAmount));

      const orderDate = new Date(order.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      let matchesDate = true;
      if (dateFilter === "today") {
        matchesDate = orderDate.toDateString() === today.toDateString();
      } else if (dateFilter === "yesterday") {
        matchesDate = orderDate.toDateString() === yesterday.toDateString();
      } else if (dateFilter === "lastWeek") {
        matchesDate = orderDate >= lastWeek;
      } else if (dateFilter === "lastMonth") {
        matchesDate = orderDate >= lastMonth;
      }

      const needsAttention = order.status === "Hazırlanıyor" && getWaitingMinutes(order.createdAt) >= 20;
      return matchesSearch && matchesStatus && matchesDate && matchesDeliveryPoint && matchesAmount && (!problemOnly || needsAttention || order.status === "İptal Edildi") && (!delayedOnly || needsAttention);
    });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFilter("all");
    setDeliveryPointFilter("all");
    setMinAmount("");
    setMaxAmount("");
    setProblemOnly(false);
    setDelayedOnly(false);
    setCurrentPage(1);
  };

  // Loading State
  if (isLoading) {
    keyboardRef.current = {};
    return (
      <div className="ord" aria-busy="true">
        <div className="ui-skeleton" style={{ height: 40, width: 240 }}></div>
        <div className="ui-skeleton" style={{ height: 76 }}></div>
        <div className="ui-panel ord-list">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="ord-row">
              <div className="ui-skeleton" style={{ width: "100%", height: 18, gridColumn: "1 / -1" }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty State
  if (!orderAnalyticsData || !orderAnalyticsData.usersOrders || orderAnalyticsData.usersOrders.length === 0) {
    keyboardRef.current = {};
    return (
      <div className="ord">
        <header className="app-pagehead">
          <div>
            <h1>Siparişler</h1>
            <p>Yeni siparişten teslimata, tüm süreci tek yerden yönetin.</p>
          </div>
        </header>
        <div className="ui-panel ui-empty">
          <Package2 />
          <h3 className="ui-title">Henüz sipariş yok</h3>
          <p>Yeni siparişler burada görünecek</p>
        </div>
      </div>
    );
  }

  // Tüm siparişler müşteri bilgisiyle birlikte, en yeni önce
  const allOrders = orderAnalyticsData.usersOrders.flatMap(userOrder => {
    // Kullanıcının en eski siparişini bul (ilk sipariş)
    const sortedByDate = [...userOrder.orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const firstOrderId = sortedByDate.length > 0 ? sortedByDate[0].orderId : null;
    const totalOrders = userOrder.orders.length;
    
    return userOrder.orders.map(order => ({
      ...order,
      user: userOrder.user,
      isFirstOrder: order.orderId === firstOrderId,
      userOrderCount: totalOrders
    }));
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pano durumları sütunlarla gösterdiği için durum çipini yok sayar
  const filteredOrders = filterOrders(allOrders, { ignoreStatus: view === "board" });

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
  // Arama ya da silme sonrası sayfa sayısı azalırsa boş bir sayfada kalınmaz
  const safePage = Math.min(currentPage, Math.max(1, totalPages));
  const currentOrders = filteredOrders.slice(
    (safePage - 1) * ordersPerPage,
    safePage * ordersPerPage
  );

  const stats = {
    total: filteredOrders.length,
    preparing: filteredOrders.filter(o => o.status === "Hazırlanıyor").length,
    onWay: filteredOrders.filter(o => o.status === "Yolda").length,
    delivered: filteredOrders.filter(o => o.status === "Teslim Edildi").length,
    cancelled: filteredOrders.filter(o => o.status === "İptal Edildi").length
  };

  const priorityOrders = filteredOrders
    .filter((order) => order.status === "Hazırlanıyor" || order.status === "Yolda")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, 3);

  // ── Sunum için türetilen değerler (veri akışını değiştirmez) ─────────
  // Detay paneli yalnızca kullanıcı bir sipariş seçtiğinde açılır; seçili kaydın güncel hâlini gösterir.
  const detailOrder = detailModalOrder
    ? allOrders.find((o) => o.orderId === detailModalOrder.orderId) || detailModalOrder
    : null;
  const advancedFilterCount =
    (deliveryPointFilter !== "all" ? 1 : 0) + (minAmount ? 1 : 0) + (maxAmount ? 1 : 0) + (problemOnly ? 1 : 0) + (delayedOnly ? 1 : 0);
  const allOnPageSelected = currentOrders.length > 0 && currentOrders.every(o => selectedOrderIds.includes(o.orderId));

  // Bugün: iptal edilen siparişler ciroya ve ortalama sepete katılmaz
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayOrders = filteredOrders.filter(o => new Date(o.createdAt) >= startOfToday);
  const todayValid = todayOrders.filter(o => o.status !== "İptal Edildi");
  const todayRevenue = todayValid.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const avgOrderValue = todayValid.length > 0 ? todayRevenue / todayValid.length : 0;
  const pendingOrders = todayOrders.filter(o => o.status === 'Hazırlanıyor').length;
  const deliveryTimes = todayOrders.map(getDeliveryMinutes).filter((minutes) => minutes != null);
  const avgDelivery = deliveryTimes.length ? Math.round(deliveryTimes.reduce((sum, m) => sum + m, 0) / deliveryTimes.length) : null;
  const hourly = Array.from({ length: 24 }, () => 0);
  todayOrders.forEach((o) => {
    const hour = new Date(o.createdAt).getHours();
    if (hour >= 0 && hour < 24) hourly[hour] += 1;
  });
  const hourlyMax = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const currentHour = new Date().getHours();

  // Teslimat noktasına göre aktif siparişler (kurye hangi yurda kaç sipariş götürecek)
  const activePointMap = new Map();
  for (const order of filteredOrders) {
    if (order.status !== "Hazırlanıyor" && order.status !== "Yolda") continue;
    const name = order.deliveryPointName || order.city || "Belirtilmemiş";
    if (!activePointMap.has(name)) activePointMap.set(name, { name, code: order.deliveryPoint, preparing: 0, onWay: 0 });
    const point = activePointMap.get(name);
    if (order.status === "Hazırlanıyor") point.preparing += 1;
    else point.onWay += 1;
  }
  const activeByPoint = [...activePointMap.values()].sort((a, b) => (b.preparing + b.onWay) - (a.preparing + a.onWay));

  // Müşteri geçmişi: sipariş sayısı, harcama (iptaller hariç), iptal sayısı
  const customerIndex = new Map();
  for (const order of allOrders) {
    const key = String(order.user?.id ?? order.user?.email ?? "");
    if (!customerIndex.has(key)) customerIndex.set(key, { orders: [], count: 0, validCount: 0, spent: 0, cancelled: 0, firstAt: null });
    const entry = customerIndex.get(key);
    entry.orders.push(order);
    entry.count += 1;
    if (order.status === "İptal Edildi") entry.cancelled += 1;
    else { entry.validCount += 1; entry.spent += Number(order.totalAmount) || 0; }
    const created = new Date(order.createdAt);
    if (!Number.isNaN(created.getTime()) && (!entry.firstAt || created < entry.firstAt)) entry.firstAt = created;
  }
  const getCustomer = (order) => {
    const entry = customerIndex.get(String(order?.user?.id ?? order?.user?.email ?? ""));
    return entry ? { ...entry, average: entry.validCount ? entry.spent / entry.validCount : 0 } : null;
  };

  // Pano sütunları: aktif sütunlarda en eski sipariş üstte (önce o çıkar), tamamlananlarda en yeni
  const boardColumns = BOARD_COLUMNS.map((column) => {
    const matching = filteredOrders.filter((o) => o.status === column.status);
    const items = ["Hazırlanıyor", "Yolda"].includes(column.status) ? [...matching].reverse() : matching;
    const visible = Number.isFinite(column.limit) ? items.slice(0, column.limit) : items;
    return { ...column, items, visible, hidden: items.length - visible.length, sum: items.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0) };
  });

  // Toplama listesi: seçim varsa seçili siparişler, yoksa hazırlanan tüm siparişler (filtrelerden bağımsız)
  const selectedOrders = allOrders.filter((o) => selectedOrderIds.includes(o.orderId));
  const preparingAll = allOrders.filter((o) => o.status === "Hazırlanıyor").reverse();
  const pickingOrders = pickingScope === "selected" && selectedOrders.length ? selectedOrders : preparingAll;
  const picking = pickingOpen ? buildPickingList(pickingOrders) : null;
  const pickedCount = picking ? picking.items.filter((item) => pickedKeys.includes(item.key)).length : 0;

  const popupBlocked = () => toast.error("Yazdırma penceresi açılamadı. Tarayıcıda bu site için açılır pencerelere izin verin.");

  const changeView = (next) => {
    setView(next);
    setCurrentPage(1);
    try { localStorage.setItem("admin-order-view", next); } catch { /* tarayıcı depolaması kapalı olabilir */ }
  };

  const showAllInList = (status) => {
    changeView("list");
    setStatusFilter(status);
  };

  const openPicking = () => {
    setPickingScope(selectedOrderIds.length ? "selected" : "preparing");
    setPickedKeys([]);
    setPickingOpen(true);
  };

  const handlePrintPicking = () => {
    if (!picking?.items.length) return;
    try {
      if (!printPickingList(picking)) popupBlocked();
    } catch (e) {
      console.error("Toplama listesi yazdırılamadı:", e);
      toast.error("Yazdırma sırasında hata oluştu");
    }
  };

  // Seçili siparişlerin fişleri tek seferde, en eski sipariş ilk sırada basılır
  const handlePrintSelected = () => {
    if (!selectedOrders.length) return;
    try {
      if (!printReceipts([...selectedOrders].reverse())) popupBlocked();
    } catch (e) {
      console.error("Toplu yazdırma hatası:", e);
      toast.error("Yazdırma sırasında hata oluştu");
    }
  };

  const handleExport = () => {
    if (!filteredOrders.length) {
      toast.error("Aktarılacak sipariş yok");
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    downloadTextFile(buildOrdersCsv(filteredOrders), `siparisler-${stamp}.csv`);
    toast.success(`${filteredOrders.length} sipariş Excel dosyasına aktarıldı`);
  };

  // Klavye kısayollarının kullandığı güncel liste ve eylemler
  const navOrders = view === "board" ? boardColumns.flatMap((column) => column.visible) : currentOrders;
  keyboardRef.current = {
    ready: true,
    move: (step) => {
      if (!navOrders.length) return;
      const index = detailOrder ? navOrders.findIndex((o) => o.orderId === detailOrder.orderId) : -1;
      const nextIndex = index === -1 ? (step > 0 ? 0 : navOrders.length - 1) : Math.min(navOrders.length - 1, Math.max(0, index + step));
      const target = navOrders[nextIndex];
      setDetailModalOrder(target);
      requestAnimationFrame(() => {
        document.querySelector(`[data-order-id="${target.orderId}"]`)?.scrollIntoView({ block: "nearest" });
      });
    },
    toggleView: () => changeView(view === "board" ? "list" : "board"),
    toggleSelectActive: () => {
      if (!detailOrder) return;
      const id = detailOrder.orderId;
      setSelectedOrderIds((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
    },
    printActive: () => { if (detailOrder) handlePrint(detailOrder); },
    toggleShortcuts: () => setShowShortcuts((open) => !open),
    closeTopLayer: () => {
      if (showShortcuts) { setShowShortcuts(false); return true; }
      if (pickingOpen) { setPickingOpen(false); return true; }
      if (showAddItemModal) { setShowAddItemModal(false); return true; }
      if (showAdvancedFilters) { setShowAdvancedFilters(false); return true; }
      if (detailModalOrder) { setDetailModalOrder(null); return true; }
      return false;
    },
  };

  return (
    <div className="ord">
      {/* Header */}
      <header className="app-pagehead">
        <div>
          <h1>Siparişler</h1>
          <p className="ord-sync">
            <i className="ord-live" data-on={autoRefresh} aria-hidden="true" />
            Son güncelleme: <span className="ui-num">{lastRefresh.toLocaleTimeString('tr-TR')}</span>
          </p>
        </div>
        <div className="app-pagehead-actions ord-head-actions">
          <div className="ui-segmented ord-view" role="group" aria-label="Görünüm">
            <button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")}>
              <LayoutList />Liste
            </button>
            <button type="button" aria-pressed={view === "board"} onClick={() => changeView("board")}>
              <KanbanSquare />Pano
            </button>
          </div>
          <button type="button" className="ui-btn" onClick={openPicking} title="Hazırlanan siparişlerin ürünlerini tek listede topla">
            <ClipboardList />
            <span>Toplama listesi</span>
            {preparingAll.length > 0 && <b className="ui-count">{preparingAll.length}</b>}
          </button>
          <button type="button" className="ui-btn" onClick={handleExport} title="Filtrelenmiş siparişleri Excel'de açılan CSV dosyası olarak indir">
            <Download />
            <span>Excel</span>
          </button>
          <button type="button" className="ui-icon-btn ord-keys-btn" onClick={() => setShowShortcuts(true)} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)">
            <Keyboard />
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            aria-pressed={autoRefresh}
            className="ui-toggle"
          >
            <i />
            <span>{autoRefresh ? 'Otomatik Yenileme Açık' : 'Otomatik Yenileme Kapalı'}</span>
          </button>
        </div>
      </header>

      {/* Özet: bugün kartı + sipariş akışı */}
      <section className="ord-overview" aria-label="Sipariş özeti">
        <div className="ord-today">
          <span className="ord-today-label">Bugün</span>
          <strong className="ord-today-value">{todayOrders.length} <small>sipariş</small></strong>
          <div
            className="ord-hours"
            role="img"
            aria-label={todayOrders.length ? `Saatlik sipariş dağılımı, en yoğun saat ${String(peakHour).padStart(2, "0")}:00` : "Bugün henüz sipariş yok"}
          >
            {hourly.map((count, hour) => (
              <span
                key={hour}
                className="ord-hour"
                data-now={hour === currentHour || undefined}
                data-empty={count === 0 || undefined}
                title={`${String(hour).padStart(2, "0")}:00 · ${count} sipariş`}
              >
                <i style={{ height: count ? `${Math.max(18, Math.round((count / hourlyMax) * 100))}%` : undefined }} />
              </span>
            ))}
          </div>
          <div className="ord-hours-axis" aria-hidden="true">
            <span>00</span><span>06</span><span>12</span><span>18</span>
          </div>
          <dl className="ord-today-facts">
            <div title="İptal edilen siparişler hariç"><dt>Ciro</dt><dd>₺{todayRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</dd></div>
            <div><dt>Ort. sepet</dt><dd>₺{avgOrderValue.toFixed(0)}</dd></div>
            <div><dt>Bekleyen</dt><dd>{pendingOrders > 0 ? pendingOrders : "Yok"}</dd></div>
            <div title="Sipariş anından teslime kadar geçen ortalama süre"><dt>Ort. teslim</dt><dd>{avgDelivery != null ? `${avgDelivery} dk` : "—"}</dd></div>
          </dl>
        </div>
        <div className="ord-flow">
          <div className="ord-flow-head">
            <span className="ui-overline">Sipariş akışı</span>
            <span className="ord-flow-total"><strong className="ui-num">{stats.total}</strong> sipariş</span>
          </div>
          <ol className="ord-flow-steps">
            {[
              { status: "Hazırlanıyor", count: stats.preparing },
              { status: "Yolda", count: stats.onWay },
              { status: "Teslim Edildi", count: stats.delivered },
              { status: "İptal Edildi", count: stats.cancelled },
            ].map(({ status, count }) => {
              const ui = STATUS_UI[status];
              const Icon = ui.icon;
              const share = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <li key={status} className="ord-flow-step" data-tone={ui.tone} data-empty={count === 0}>
                  <span className="ord-flow-icon"><Icon /></span>
                  <span className="ord-flow-text">
                    <strong className="ui-num">{count}</strong>
                    <span>{status}</span>
                  </span>
                  <span className="ord-flow-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
                  <span className="ord-flow-share ui-num">%{share}</span>
                </li>
              );
            })}
          </ol>
          <div className="ord-points" aria-label="Teslimat noktalarına göre aktif siparişler">
            <span className="ord-points-label">Aktif teslimat</span>
            {activeByPoint.length === 0 && <span className="ord-points-empty">Şu an aktif sipariş yok</span>}
            {activeByPoint.map((point) => {
              const content = (
                <>
                  <MapPin />
                  <strong>{point.name}</strong>
                  {point.preparing > 0 && <span data-tone="warn">{point.preparing} hazırlanıyor</span>}
                  {point.onWay > 0 && <span data-tone="info">{point.onWay} yolda</span>}
                </>
              );
              // Bilinen yurtlar tıklanınca o teslimat noktasına göre filtrelenir
              return ["girlsDorm", "boysDorm"].includes(point.code) ? (
                <button
                  key={point.name}
                  type="button"
                  className="ord-point"
                  aria-pressed={deliveryPointFilter === point.code}
                  title={deliveryPointFilter === point.code ? "Filtreyi kaldır" : "Bu teslimat noktasına göre filtrele"}
                  onClick={() => { setDeliveryPointFilter(deliveryPointFilter === point.code ? "all" : point.code); setCurrentPage(1); }}
                >
                  {content}
                </button>
              ) : (
                <span key={point.name} className="ord-point">{content}</span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Araç çubuğu: arama, durum, tarih, filtreler */}
      <div className="ord-toolbar">
        <div className="ui-search ord-search">
          <Search />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Sipariş no, müşteri, telefon, ürün…"
            aria-label="Sipariş ara"
            className="ui-field"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
          {searchTerm && (
            <button type="button" className="ord-search-clear" onClick={() => { setSearchTerm(""); setCurrentPage(1); }} aria-label="Aramayı temizle">
              <X />
            </button>
          )}
        </div>

        {view === "list" && (
          <div className="ui-chips" role="group" aria-label="Durum filtresi">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.value}
                aria-pressed={statusFilter === chip.value}
                onClick={() => { setStatusFilter(chip.value); setCurrentPage(1); }}
              >
                {chip.tone && <i className={`ui-dot ui-dot--${chip.tone}`} />}
                {chip.label}
              </button>
            ))}
          </div>
        )}

        <select
          className="ui-field ui-field--auto"
          aria-label="Tarih filtresi"
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="all">Tüm Tarihler</option>
          <option value="today">Bugün</option>
          <option value="yesterday">Dün</option>
          <option value="lastWeek">Son 7 Gün</option>
          <option value="lastMonth">Son 30 Gün</option>
        </select>

        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          aria-expanded={showAdvancedFilters}
          className="ui-btn"
        >
          <SlidersHorizontal />
          <span>Filtreler</span>
          {advancedFilterCount > 0 && <b className="ui-count">{advancedFilterCount}</b>}
        </button>
      </div>

      {/* Etkin filtre etiketleri */}
      {advancedFilterCount > 0 && (
        <div className="ord-tags">
          {deliveryPointFilter !== "all" && (
            <span className="ui-badge ui-badge--brand">
              <MapPin /> {deliveryPointFilter === "girlsDorm" ? "Kız Yurdu" : "Erkek Yurdu"}
              <button onClick={() => setDeliveryPointFilter("all")} aria-label="Teslimat noktası filtresini kaldır">
                <X />
              </button>
            </span>
          )}
          {minAmount && (
            <span className="ui-badge ui-badge--brand">
              Min: ₺{minAmount}
              <button onClick={() => setMinAmount("")} aria-label="Minimum tutar filtresini kaldır">
                <X />
              </button>
            </span>
          )}
          {maxAmount && (
            <span className="ui-badge ui-badge--brand">
              Max: ₺{maxAmount}
              <button onClick={() => setMaxAmount("")} aria-label="Maximum tutar filtresini kaldır">
                <X />
              </button>
            </span>
          )}
          {problemOnly && (
            <span className="ui-badge ui-badge--brand">
              <AlertTriangle /> Sorunlu siparişler
              <button onClick={() => setProblemOnly(false)} aria-label="Sorunlu siparişler filtresini kaldır">
                <X />
              </button>
            </span>
          )}
          {delayedOnly && (
            <span className="ui-badge ui-badge--brand">
              <Clock /> Geciken siparişler
              <button onClick={() => setDelayedOnly(false)} aria-label="Geciken siparişler filtresini kaldır">
                <X />
              </button>
            </span>
          )}
          <button onClick={clearFilters} className="ui-btn ui-btn--ghost ui-btn--sm">
            Temizle
          </button>
        </div>
      )}

      {/* Sıradaki aksiyonlar: en eski aktif siparişler (pano görünümünde sütunlar aynı işi görür) */}
      {view === "list" && (
      <section className="ord-next" aria-label="Operasyon kuyruğu">
          <div className="ord-next-head">
            <span className="ui-overline">Sıradaki</span>
            <button onClick={() => { setStatusFilter("Hazırlanıyor"); setCurrentPage(1); }} className="ui-btn ui-btn--sm ui-btn--ghost"><i className="ui-dot ui-dot--warn" />{stats.preparing} hazırlanıyor</button>
            <button onClick={() => { setStatusFilter("Yolda"); setCurrentPage(1); }} className="ui-btn ui-btn--sm ui-btn--ghost"><i className="ui-dot ui-dot--info" />{stats.onWay} yolda</button>
          </div>
          {priorityOrders.length === 0 && (
            <p className="ord-next-empty"><CheckCircle2 /> Şu an aksiyon bekleyen aktif sipariş bulunmuyor.</p>
          )}
          {priorityOrders.map((order) => {
            const waitingMinutes = getWaitingMinutes(order.createdAt);
            const needsAttention = order.status === "Hazırlanıyor" && waitingMinutes >= 20;
            const nextStatus = order.status === "Hazırlanıyor" ? "Yolda" : "Teslim Edildi";
            const nextLabel = order.status === "Hazırlanıyor" ? "Yola çıkar" : "Teslim edildi";
            const NextIcon = order.status === "Hazırlanıyor" ? Truck : CheckCircle2;
            return (
              <div key={`priority-${order.orderId}`} className="ord-next-item" data-attention={needsAttention} data-tone={STATUS_UI[order.status]?.tone}>
                <button className="ord-next-open" onClick={() => setDetailModalOrder(order)} title="Detay">
                  <span className="ord-next-top">
                    <span className="ord-avatar" aria-hidden="true">{getInitials(order.user?.name)}</span>
                    <span className="ord-next-name">
                      <strong>{order.user?.name || "Müşteri"}</strong>
                      <small>
                        <span className="ui-mono">#{String(order.orderId).slice(-6).toUpperCase()}</span> · {order.products?.length || 0} ürün · ₺{Number(order.totalAmount || 0).toFixed(2)}
                      </small>
                    </span>
                  </span>
                  <span className="ord-next-meta">
                    <span className="ord-next-wait">{needsAttention ? <AlertCircle /> : <Timer />}{getOrderDuration(order.createdAt, order.updatedAt, order.status)}</span>
                    <span className="ord-next-point"><MapPin />{order.deliveryPointName || order.city || "Belirtilmemiş"}</span>
                  </span>
                </button>
                <button onClick={() => updateOrderStatus(order.orderId, nextStatus)} className="ui-btn ui-btn--sm ui-btn--primary ord-next-go"><NextIcon />{nextLabel}</button>
              </div>
            );
          })}
      </section>
      )}

      {/* Liste ya da pano + sağ detay paneli */}
      <div className="ord-split" data-view={view} data-detail-open={!!detailModalOrder}>
        {view === "board" ? (
          <OrderBoard
            columns={boardColumns}
            activeId={detailOrder?.orderId}
            freshIds={freshIds}
            onOpen={(order) => setDetailModalOrder(order)}
            onAdvance={updateOrderStatus}
            onMove={requestStatusChange}
            onShowAll={showAllInList}
          />
        ) : (
        <section className="ui-panel ord-list" aria-label="Sipariş listesi">
          <div className="ord-list-head" data-selecting={selectedOrderIds.length > 0}>
            <input
              type="checkbox"
              aria-label="Bu sayfadakileri seç"
              title="Bu sayfadakileri seç"
              checked={allOnPageSelected}
              onChange={e => setSelectedOrderIds(e.target.checked ? [...new Set([...selectedOrderIds, ...currentOrders.map(o => o.orderId)])] : selectedOrderIds.filter(id => !currentOrders.some(o => o.orderId === id)))}
            />
            {selectedOrderIds.length > 0 ? (
              <div className="ord-bulk">
                <strong className="ui-num">{selectedOrderIds.length} seçili</strong>
                <button type="button" className="ui-btn ui-btn--sm" data-next="way" onClick={() => bulkUpdateStatus("Yolda")}><Truck />Yola çıkar</button>
                <button type="button" className="ui-btn ui-btn--sm" data-next="done" onClick={() => bulkUpdateStatus("Teslim Edildi")}><CheckCircle2 />Teslim et</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={handlePrintSelected}><Printer />Fişleri yazdır</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={openPicking}><ListChecks />Toplama listesi</button>
                <select className="ui-field ui-field--auto ui-field--sm" aria-label="Toplu durum değiştir" defaultValue="" onChange={e => { bulkUpdateStatus(e.target.value); e.target.value = ""; }}><option value="" disabled>Diğer durum…</option>{["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"].map(s => <option key={s} value={s}>{s}</option>)}</select>
                <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setSelectedOrderIds([])}><X />Seçimi bırak</button>
              </div>
            ) : (
              <div className="ord-cols" aria-hidden="true">
                <span>Müşteri</span>
                <span>Süre</span>
                <span>Durum</span>
                <span>Tutar</span>
              </div>
            )}
          </div>

          {currentOrders.length > 0 ? (
            currentOrders.map((order, index) => {
              const dayLabel = getDayLabel(order.createdAt);
              const startsDay = index === 0 || getDayLabel(currentOrders[index - 1].createdAt) !== dayLabel;
              return (
                <Fragment key={order.orderId}>
                  {startsDay && <div className="ord-day">{dayLabel}</div>}
                  <OrderRow
                    order={order}
                    active={detailOrder?.orderId === order.orderId}
                    selected={selectedOrderIds.includes(order.orderId)}
                    fresh={freshIds.includes(order.orderId)}
                    onSelectChange={e => setSelectedOrderIds(e.target.checked ? [...selectedOrderIds, order.orderId] : selectedOrderIds.filter(id => id !== order.orderId))}
                    onOpen={(order) => setDetailModalOrder(order)}
                    onAdvance={updateOrderStatus}
                  />
                </Fragment>
              );
            })
          ) : (
            <div className="ui-empty">
              <Search />
              <h3 className="ui-title">Eşleşen sipariş yok</h3>
              <p>Arama veya filtreleri değiştirerek tekrar deneyin.</p>
            </div>
          )}

          <div className="ord-list-foot">
            <span className="ui-num">{filteredOrders.length} sipariş</span>
            {/* Pagination */}
            {totalPages > 1 && (
              <nav className="ui-pagination" aria-label="Sayfalama">
                <button
                  onClick={() => setCurrentPage(Math.max(safePage - 1, 1))}
                  disabled={safePage === 1}
                  aria-label="Önceki sayfa"
                >
                  <ChevronLeft />
                </button>

                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (safePage <= 3) {
                    pageNum = i + 1;
                  } else if (safePage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = safePage - 2 + i;
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(pageNum)}
                      aria-current={safePage === pageNum ? "page" : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage(Math.min(safePage + 1, totalPages))}
                  disabled={safePage === totalPages}
                  aria-label="Sonraki sayfa"
                >
                  <ChevronRight />
                </button>
              </nav>
            )}
          </div>
        </section>
        )}

        <div className="ord-detail-scrim" onClick={() => setDetailModalOrder(null)} />
        <aside className="ui-panel ord-detail" aria-label="Sipariş detayı">
          {detailOrder ? (
            <OrderDetail
              order={detailOrder}
              customer={getCustomer(detailOrder)}
              onClose={() => setDetailModalOrder(null)}
              onStatusUpdate={requestStatusChange}
              onDeliveryTracking={updateDeliveryTracking}
              onPrint={handlePrint}
              onDelete={handleDeleteOrder}
              onAddItem={handleOpenAddItemModal}
              onRemoveItem={handleRemoveItem}
              onUpdateQuantity={handleUpdateQuantity}
              onOpenOrder={(order) => setDetailModalOrder(order)}
              onCopy={handleCopySummary}
            />
          ) : (
            <div className="ui-empty">
              <Package2 />
              <h3 className="ui-title">Sipariş seçin</h3>
              <p>Detayları görmek için listeden bir sipariş seçin.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Filtre çekmecesi */}
      {showAdvancedFilters && (
        <div className="ui-drawer-backdrop" onClick={() => setShowAdvancedFilters(false)}>
          <aside
            className="ui-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Gelişmiş Filtreler"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-drawer-head">
              <h3 className="ui-title">Filtreler</h3>
              <button onClick={() => setShowAdvancedFilters(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>

            <div className="ui-drawer-body">
              <div>
                <label className="ui-label" htmlFor="orders-delivery-point">Teslimat Noktası</label>
                <select
                  id="orders-delivery-point"
                  className="ui-field"
                  value={deliveryPointFilter}
                  onChange={(e) => setDeliveryPointFilter(e.target.value)}
                >
                  <option value="all">Tümü</option>
                  <option value="girlsDorm">Kız KYK Yurdu</option>
                  <option value="boysDorm">Erkek KYK Yurdu</option>
                </select>
              </div>

              <div className="ui-grid-2">
                <div>
                  <label className="ui-label" htmlFor="orders-min-amount">Minimum Tutar (₺)</label>
                  <input
                    id="orders-min-amount"
                    type="number"
                    placeholder="0"
                    className="ui-field"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                  />
                </div>

                <div>
                  <label className="ui-label" htmlFor="orders-max-amount">Maximum Tutar (₺)</label>
                  <input
                    id="orders-max-amount"
                    type="number"
                    placeholder="∞"
                    className="ui-field"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* Hazır ve kayıtlı filtreler */}
              <div>
                <span className="ui-label">Hazır filtreler</span>
                <div className="ord-presets">
                  <button className="ui-option" aria-pressed={problemOnly} onClick={() => { setProblemOnly(!problemOnly); setDelayedOnly(false); setCurrentPage(1); }}>
                    <AlertTriangle />
                    <span>Sorunlu siparişler<small>20 dk&#39;dır hazırlanan veya iptal edilen</small></span>
                  </button>
                  <button className="ui-option" aria-pressed={delayedOnly} onClick={() => { setDelayedOnly(!delayedOnly); setProblemOnly(false); setCurrentPage(1); }}>
                    <Clock />
                    <span>Geciken siparişler<small>20 dk&#39;dır hazırlanıyor durumunda</small></span>
                  </button>
                </div>
              </div>

              <div>
                <span className="ui-label">Kayıtlı filtreler</span>
                <div className="ord-saved">
                  {savedFilters.map((item, index) => <span key={index} className="ord-saved-item"><button className="ui-btn ui-btn--sm" onClick={() => { setStatusFilter(item.statusFilter); setDateFilter(item.dateFilter); setProblemOnly(item.problemOnly); setDelayedOnly(item.delayedOnly || false); setCurrentPage(1); }}><Bookmark />{item.name}</button><button aria-label={`${item.name} filtresini sil`} className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" onClick={() => { const next = savedFilters.filter((_, i) => i !== index); setSavedFilters(next); localStorage.setItem("admin-order-filters", JSON.stringify(next)); }}><X /></button></span>)}
                  {savedFilters.length === 0 && <p className="ui-hint">Henüz kayıtlı filtre yok.</p>}
                </div>
                <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => { const name = window.prompt("Filtre adı"); if (!name?.trim()) return; const next = [...savedFilters, { name: name.trim().slice(0, 40), statusFilter, dateFilter, problemOnly, delayedOnly }].slice(-8); setSavedFilters(next); localStorage.setItem("admin-order-filters", JSON.stringify(next)); }}><Plus />Bu filtreyi kaydet</button>
              </div>
            </div>

            <div className="ui-drawer-foot">
              <button onClick={clearFilters} className="ui-btn">
                <X />
                Temizle
              </button>
              <button onClick={() => setShowAdvancedFilters(false)} className="ui-btn ui-btn--primary">
                {filteredOrders.length} siparişi göster
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Siparişe ürün ekleme çekmecesi */}
      {showAddItemModal && (
        <div className="ui-drawer-backdrop" onClick={() => setShowAddItemModal(false)}>
          <aside
            className="ui-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Siparişe Ürün Ekle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-drawer-head">
              <h3 className="ui-title">Siparişe Ürün Ekle</h3>
              <button onClick={() => setShowAddItemModal(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>

            <div className="ui-drawer-tabs">
              {/* Tab Buttons */}
              <div className="ui-segmented">
                <button onClick={() => setAddItemTab("catalog")} aria-pressed={addItemTab === "catalog"}>
                  Katalogdan Seç
                </button>
                <button onClick={() => setAddItemTab("manual")} aria-pressed={addItemTab === "manual"}>
                  Manuel Ekle
                </button>
              </div>
            </div>

            {/* Catalog Tab */}
            {addItemTab === "catalog" && (
              <>
                <div className="ui-drawer-body">
                  {/* Search */}
                  <div className="ui-search">
                    <Search />
                    <input
                      type="text"
                      placeholder="Ürün ara..."
                      aria-label="Ürün ara"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="ui-field"
                    />
                  </div>

                  {/* Product List */}
                  <div className="ord-catalog">
                    {loadingProducts ? (
                      <div className="ui-empty">
                        <RefreshCw className="ui-spin" />
                        Ürünler yükleniyor...
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="ui-empty">
                        Ürün bulunamadı
                      </div>
                    ) : (
                      filteredProducts.slice(0, 20).map((product) => (
                        <div
                          key={product._id}
                          onClick={() => setSelectedProduct(product)}
                          className="ord-catalog-item"
                          data-selected={selectedProduct?._id === product._id}
                        >
                          <div className="ui-thumb">
                            {product.image ? (
                              <img src={product.image} alt={product.name} />
                            ) : (
                              <Package2 size={16} />
                            )}
                          </div>
                          <div className="ord-d-item-text">
                            <p>{product.name}</p>
                            <small>{product.category}</small>
                          </div>
                          <strong className="ord-d-item-total">₺{product.price}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Selected Product & Quantity */}
                {selectedProduct && (
                  <div className="ord-pick">
                    <div className="ord-d-item-text">
                      <p>{selectedProduct.name}</p>
                      <small>Adet</small>
                    </div>
                    <div className="ui-stepper">
                      <button
                        type="button"
                        onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))}
                        aria-label="Adedi azalt"
                      >
                        <Minus />
                      </button>
                      <span>{productQuantity}</span>
                      <button
                        type="button"
                        onClick={() => setProductQuantity(productQuantity + 1)}
                        aria-label="Adedi artır"
                      >
                        <Plus />
                      </button>
                    </div>
                    <strong className="ord-d-item-total">₺{(selectedProduct.price * productQuantity).toFixed(2)}</strong>
                  </div>
                )}

                {/* Actions */}
                <div className="ui-drawer-foot">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="ui-btn"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleAddProductFromCatalog}
                    disabled={!selectedProduct}
                    className="ui-btn ui-btn--primary"
                  >
                    Ekle
                  </button>
                </div>
              </>
            )}

            {/* Manual Tab */}
            {addItemTab === "manual" && (
              <form onSubmit={handleAddCustomItem} className="ui-drawer-form">
                <div className="ui-drawer-body">
                  <div>
                    <label className="ui-label" htmlFor="orders-custom-amount">Tutar (TL) *</label>
                    <input
                      id="orders-custom-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={customItemAmount}
                      onChange={(e) => setCustomItemAmount(e.target.value)}
                      className="ui-field"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="ui-label" htmlFor="orders-custom-name">Ürün Adı (Opsiyonel)</label>
                    <input
                      id="orders-custom-name"
                      type="text"
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      className="ui-field"
                      placeholder="Özel Ekleme"
                    />
                  </div>
                </div>

                <div className="ui-drawer-foot">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="ui-btn"
                  >
                    İptal
                  </button>
                  <button type="submit" className="ui-btn ui-btn--primary">
                    Ekle
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      )}

      {/* Toplama listesi: ürünleri raftan tek seferde toplamak için */}
      {pickingOpen && picking && (
        <div className="ui-drawer-backdrop" onClick={() => setPickingOpen(false)}>
          <aside
            className="ui-drawer ord-pick-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Toplama listesi"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-drawer-head">
              <div>
                <h3 className="ui-title">Toplama listesi</h3>
                <p className="ui-hint ui-num">
                  {picking.orderCount} sipariş · {picking.items.length} çeşit · {picking.unitCount} adet
                </p>
              </div>
              <button onClick={() => setPickingOpen(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>

            {selectedOrders.length > 0 && (
              <div className="ui-drawer-tabs">
                <div className="ui-segmented">
                  <button aria-pressed={pickingScope !== "selected"} onClick={() => { setPickingScope("preparing"); setPickedKeys([]); }}>
                    Hazırlanıyor ({preparingAll.length})
                  </button>
                  <button aria-pressed={pickingScope === "selected"} onClick={() => { setPickingScope("selected"); setPickedKeys([]); }}>
                    Seçili ({selectedOrders.length})
                  </button>
                </div>
              </div>
            )}

            <div className="ui-drawer-body">
              {picking.items.length === 0 ? (
                <div className="ui-empty">
                  <CheckCircle2 />
                  <h3 className="ui-title">Toplanacak ürün yok</h3>
                  <p>Hazırlanıyor durumunda sipariş bulunmuyor.</p>
                </div>
              ) : (
                <>
                  <div className="ord-pick-progress">
                    <div className="ui-progress" aria-hidden="true">
                      <div style={{ width: `${Math.round((pickedCount / picking.items.length) * 100)}%` }} />
                    </div>
                    <span className="ui-num">{pickedCount}/{picking.items.length} toplandı</span>
                  </div>
                  <ul className="ord-pick-list">
                    {picking.items.map((item) => {
                      const done = pickedKeys.includes(item.key);
                      return (
                        <li key={item.key} data-done={done || undefined}>
                          <label>
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={() => setPickedKeys((keys) => (done ? keys.filter((key) => key !== item.key) : [...keys, item.key]))}
                            />
                            <b className="ord-pick-qty ui-num">{item.quantity}×</b>
                            <span className="ord-pick-name">
                              <span>{item.name}</span>
                              <small>
                                {item.orders.map((entry) => `#${entry.shortId}${entry.quantity > 1 ? ` ×${entry.quantity}` : ""}`).join(" · ")}
                              </small>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>

                  <h4 className="ui-overline ord-pick-sub">Teslimat noktaları</h4>
                  <div className="ord-pick-points">
                    {picking.points.map((point) => (
                      <div key={point.name} className="ord-pick-point">
                        <div className="ord-pick-point-head">
                          <MapPin />
                          <strong>{point.name}</strong>
                          <span className="ui-num">{point.orders.length} sipariş · {formatMoney(point.total)}</span>
                        </div>
                        <ul>
                          {point.orders.map((entry) => (
                            <li key={entry.orderId}>
                              <span className="ui-mono">#{entry.shortId}</span>
                              <span className="ord-pick-customer">{entry.customer}</span>
                              <span className="ui-num">{formatPhoneTR(entry.phone) || "-"}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="ui-drawer-foot">
              <button onClick={() => setPickingOpen(false)} className="ui-btn">Kapat</button>
              <button onClick={handlePrintPicking} disabled={!picking.items.length} className="ui-btn ui-btn--primary">
                <Printer />
                Yazdır
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Klavye kısayolları */}
      {showShortcuts && (
        <div className="ui-modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <div
            className="ui-modal ord-keys"
            role="dialog"
            aria-modal="true"
            aria-label="Klavye kısayolları"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-modal-header">
              <h3 className="ui-title">Klavye kısayolları</h3>
              <button onClick={() => setShowShortcuts(false)} className="ui-icon-btn" aria-label="Kapat">
                <X />
              </button>
            </div>
            <div className="ui-modal-body">
              <dl className="ord-keys-list">
                {SHORTCUTS.map(([keys, label]) => (
                  <div key={label}>
                    <dt>{keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt>
                    <dd>{label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersList;
