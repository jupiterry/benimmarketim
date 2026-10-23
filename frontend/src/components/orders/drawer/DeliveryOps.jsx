// Detay çekmecesinin teslimat operasyonu parçaları:
//  - CallbackPanel: ilk sipariş telefon teyidi ("Teyit için ara" + müşteri telefonu + "Arandı, teyit edildi")
//  - DeliveryOpsSection: kurye seçimi ve "Teslim edilemedi" (yalnızca Hazırlanıyor / Yolda; neden + not + onay)
//  - OutcomeNote: iptal edilmiş siparişte teslim edilememe nedeni
// Uç noktalar: PUT /orders-analytics/confirm-callback, /assign-courier, /delivery-failed (useOrdersData üzerinden).
// Stil: styles/orders-ops.css (önek so-ops-).
import { useEffect, useId, useState } from "react";
import { Bike, Check, CheckCircle2, Loader2, PackageX, Phone, PhoneCall, Settings2, X } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTime } from "../../admin/ui";
import { formatPhoneTR } from "../../../lib/orderTools";
import { useConfirm } from "../../ConfirmModal";
import {
  DELIVERY_OUTCOMES, DELIVERY_OUTCOME_NOTE_MAX, customerPhone, deliveryOutcomeLabel, isActiveStatus, needsCallbackPending, orderCode, telHref,
} from "../shared";
import "../../../styles/orders-ops.css";

const goToZones = () => window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "delivery-zones" }));

// ── İlk sipariş telefon teyidi ───────────────────────────────────────────
export function CallbackPanel({ order, disabled = false, onConfirm }) {
  const [busy, setBusy] = useState(false);
  if (order?.needsCallback !== true) return null;
  const confirmedAt = order.callbackConfirmedAt;
  if (confirmedAt) {
    return (
      <p className="so-ops-callback-done" role="status">
        <CheckCircle2 aria-hidden="true" />
        <span>Telefonla teyit edildi · <span className="ui-num">{formatDateTime(confirmedAt)}</span></span>
      </p>
    );
  }
  if (!needsCallbackPending(order)) return null;
  const phone = customerPhone(order);
  const tel = telHref(order);
  const confirm = async () => {
    if (busy || disabled) return;
    setBusy(true);
    const ok = await onConfirm?.(order);
    setBusy(false);
    if (ok) toast.success(`${orderCode(order)} teyit edildi`);
  };
  return (
    <section className="so-ops-callback" aria-label="İlk sipariş telefon teyidi" role="alert">
      <div className="so-ops-callback-head">
        <PhoneCall aria-hidden="true" />
        <div>
          <strong>Teyit için ara</strong>
          <p>Müşterinin bu bölgedeki ilk siparişi. Hazırlamadan önce arayıp adresi ve siparişi teyit edin.</p>
        </div>
      </div>
      <div className="so-ops-callback-actions">
        {tel ? (
          <a className="ui-btn so-ops-callback-tel" href={tel} aria-label={`Müşteriyi ara: ${formatPhoneTR(phone)}`}>
            <Phone aria-hidden="true" /><span className="ui-num">{formatPhoneTR(phone) || phone}</span>
          </a>
        ) : (
          <span className="ui-muted so-ops-callback-tel">Telefon yok</span>
        )}
        <button type="button" className="ui-btn ui-btn--primary so-ops-callback-ok" onClick={confirm} disabled={busy || disabled}>
          {busy ? <Loader2 className="ui-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Arandı, teyit edildi
        </button>
      </div>
    </section>
  );
}

// ── İptal edilmiş siparişte teslim edilememe nedeni ──────────────────────
export function OutcomeNote({ order }) {
  const label = order?.status === "İptal Edildi" ? deliveryOutcomeLabel(order) : "";
  if (!label) return null;
  const note = String(order.deliveryOutcome?.note || "").trim();
  return (
    <div className="ui-banner ui-banner--danger so-ops-outcome" role="status">
      <PackageX aria-hidden="true" />
      <span className="ui-grow">
        <strong>Teslim edilemedi: {label}</strong>
        {note && <span className="so-ops-outcome-note"> — {note}</span>}
        {order.deliveryOutcome?.at && <span className="so-ops-outcome-time ui-num"> · {formatDateTime(order.deliveryOutcome.at)}</span>}
      </span>
    </div>
  );
}

// ── Kurye seçimi ─────────────────────────────────────────────────────────
function CourierField({ order, couriers, couriersStatus, disabled, onAssign }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const current = order?.courier?.id ? String(order.courier.id) : "";
  const list = couriers || [];
  // Pasif ya da silinmiş kurye atanmışsa seçenek olarak yine görünür
  const options = list.filter((c) => c.active || c._id === current);
  const missing = current && !options.some((c) => c._id === current);

  if (couriersStatus === "error") {
    return <p className="ui-hint so-ops-hint">Kurye listesi yüklenemedi. {order?.courier?.name ? `Atanan kurye: ${order.courier.name}` : ""}</p>;
  }
  if (couriersStatus === "ready" && !list.length) {
    return (
      <div className="so-ops-empty">
        <p className="ui-hint">Henüz kurye eklenmedi.</p>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={goToZones}>
          <Settings2 aria-hidden="true" />Kurye ekle
        </button>
      </div>
    );
  }
  const change = async (value) => {
    if (value === current) return;
    const courier = value ? list.find((c) => c._id === value) || null : null;
    setBusy(true);
    const ok = await onAssign?.(order, courier);
    setBusy(false);
    if (ok) toast.success(courier ? `${orderCode(order)} → ${courier.name}` : `${orderCode(order)}: kurye ataması kaldırıldı`);
  };
  return (
    <div className="so-ops-field">
      <label className="ui-label" htmlFor={id}><Bike aria-hidden="true" />Kurye</label>
      <div className="so-ops-courier">
        <select id={id} className="ui-field" value={current} disabled={disabled || busy || couriersStatus !== "ready"}
          onChange={(e) => change(e.target.value)}>
          <option value="">Atanmamış</option>
          {missing && <option value={current}>{order.courier.name || "Kurye"} (listede yok)</option>}
          {options.map((c) => <option key={c._id} value={c._id}>{c.name}{c.active ? "" : " (pasif)"}</option>)}
        </select>
        {busy && <Loader2 className="ui-spin so-ops-busy" aria-label="Kaydediliyor" />}
      </div>
    </div>
  );
}

// ── Teslim edilemedi ─────────────────────────────────────────────────────
function FailedDelivery({ order, disabled, onFail }) {
  const uid = useId();
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const orderId = order?.orderId;
  // Başka siparişe geçince form kapanır
  useEffect(() => {
    setOpen(false);
    setCode("");
    setNote("");
    setError("");
  }, [orderId]);

  if (!isActiveStatus(order?.status)) return null;
  const blocked = disabled || Boolean(order.pending);
  const label = DELIVERY_OUTCOMES.find((o) => o.value === code)?.label || "";
  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    if (!code) { setError("Bir neden seçin."); return; }
    const text = note.trim();
    if (code === "diger" && !text) { setError("“Diğer” için kısa bir açıklama yazın."); return; }
    const ok = await confirm({
      type: "danger",
      title: "Sipariş teslim edilemedi olarak işaretlensin mi?",
      message: `Sipariş iptal edilir, kupon varsa geri açılır ve müşteriye “Siparişin teslim edilemedi: ${label}” bildirimi gider.`,
      confirmText: "Teslim edilemedi",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setBusy(true);
    const done = await onFail?.(order, code, text);
    setBusy(false);
    if (done) {
      toast.success(`${orderCode(order)} teslim edilemedi olarak kaydedildi`);
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="ui-btn ui-btn--sm ui-btn--danger so-ops-fail-open" disabled={blocked} onClick={() => setOpen(true)}
        title={order.pending ? "Bekleyen durum değişikliği kaydedildikten sonra kullanılabilir" : "Adres bulunamadı, cevap yok…"}>
        <PackageX aria-hidden="true" />Teslim edilemedi
      </button>
    );
  }
  return (
    <form className="so-ops-fail" onSubmit={submit} aria-labelledby={`${uid}-t`}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
      <div className="so-ops-fail-head">
        <strong id={`${uid}-t`}><PackageX aria-hidden="true" />Teslim edilemedi</strong>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => setOpen(false)} aria-label="Vazgeç" title="Vazgeç (Esc)">
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="so-ops-reasons" role="radiogroup" aria-label="Neden">
        {DELIVERY_OUTCOMES.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={code === o.value} className="so-ops-reason"
            onClick={() => { setCode(o.value); setError(""); }}>
            {o.label}
          </button>
        ))}
      </div>
      <label className="ui-label" htmlFor={`${uid}-note`}>Not <span className="ui-muted">({code === "diger" ? "zorunlu" : "isteğe bağlı"})</span></label>
      <textarea id={`${uid}-note`} className="ui-field so-ops-note" rows={2} maxLength={DELIVERY_OUTCOME_NOTE_MAX} value={note}
        placeholder="ör. 3 kez arandı, kapıyı açan olmadı" onChange={(e) => { setNote(e.target.value); setError(""); }} />
      <p className="ui-hint so-ops-note-hint">
        <span className={error ? "so-ops-error" : undefined} role={error ? "alert" : undefined}>{error || "Not yalnızca panelde görünür; müşteri nedeni görür."}</span>
        <span className="ui-num" aria-hidden="true">{note.length}/{DELIVERY_OUTCOME_NOTE_MAX}</span>
      </p>
      <div className="so-ops-fail-actions">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
        <button type="submit" className="ui-btn ui-btn--sm ui-btn--danger" disabled={busy || blocked}>
          {busy ? <Loader2 className="ui-spin" aria-hidden="true" /> : <PackageX aria-hidden="true" />}Kaydet ve iptal et
        </button>
      </div>
    </form>
  );
}

/** Kurye + "Teslim edilemedi" bölümü. İptal edilmiş siparişte yalnızca kurye bilgisi (varsa) gösterilir. */
export default function DeliveryOpsSection({ order, missing = false, couriers, couriersStatus = "loading", onAssignCourier, onDeliveryFailed }) {
  const headId = useId();
  const cancelled = order?.status === "İptal Edildi";
  if (cancelled && !order?.courier?.name) return null;
  return (
    <section className="so-d-section so-ops" aria-labelledby={headId}>
      <div className="so-d-section-head">
        <h3 id={headId} className="so-d-h"><Bike aria-hidden="true" />Kurye ve teslimat</h3>
      </div>
      {cancelled ? (
        <p className="ui-hint so-ops-hint">Kurye: {order.courier.name}</p>
      ) : (
        <div className="so-ops-row">
          <CourierField order={order} couriers={couriers} couriersStatus={couriersStatus} disabled={missing} onAssign={onAssignCourier} />
          <FailedDelivery order={order} disabled={missing} onFail={onDeliveryFailed} />
        </div>
      )}
    </section>
  );
}
