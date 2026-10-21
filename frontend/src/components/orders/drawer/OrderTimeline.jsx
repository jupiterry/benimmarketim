// Detay çekmecesinin "Zaman çizelgesi" bölümü (C11). "Sipariş alındı" ile başlar, durum geçmişini
// zaman sırasıyla gösterir; her adımda bir öncekinden geçen süre (+N dk) ve saat (<time>) yazar.
// Siparişle aynı anda yazılan ilk "Hazırlanıyor" kaydı (2 dk içinde) atlanır. Aktif siparişte sonda
// canlı sayan bir "… bekleniyor" satırı vardır. Aktif siparişte açık, tamamlanmışta kapalı başlar.
import { useId, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { formatDateTime, formatTime } from "../../admin/ui";
import { useOrdersNow } from "../atoms";
import { MINUTE, dayKey, durationMinutes, formatMinutes, isActiveStatus, shortWhen, statusUi, toMs } from "../shared";

const SAME_AS_CREATED_MS = 2 * MINUTE;

/** Zaman çizelgesi adımları: { key, label, at (ms), tone, delta (dk | null), pending } */
const buildSteps = (order) => {
  const steps = [];
  const created = toMs(order?.createdAt);
  if (Number.isFinite(created)) steps.push({ key: "created", label: "Sipariş alındı", at: created, tone: "brand" });
  const history = (order?.statusHistory || [])
    .map((entry, index) => ({ status: entry?.status, at: toMs(entry?.changedAt), by: entry?.changedBy, index }))
    .filter((entry) => entry.status && Number.isFinite(entry.at))
    .sort((a, b) => a.at - b.at || a.index - b.index);
  const userId = order?.user?.id ? String(order.user.id) : null;
  history.forEach((entry, i) => {
    if (i === 0 && entry.status === "Hazırlanıyor" && steps[0] && Math.abs(entry.at - steps[0].at) < SAME_AS_CREATED_MS) return;
    const ui = statusUi(entry.status);
    const byCustomer = entry.status === "İptal Edildi" && userId && entry.by && String(entry.by) === userId;
    steps.push({ key: `${entry.status}-${entry.index}`, label: byCustomer ? "Müşteri iptal etti" : ui.timeline, at: entry.at, tone: ui.tone, status: entry.status });
  });
  // Bekleyen (henüz kaydedilmemiş) değişikliğin yapay geçmiş kaydı: son eşleşen adım
  if (order?.pending) {
    for (let i = steps.length - 1; i > 0; i -= 1) {
      if (steps[i].status === order.pending.to) {
        steps[i] = { ...steps[i], pending: true };
        break;
      }
    }
  }
  return steps.map((step, i) => ({
    ...step,
    delta: i === 0 ? null : Math.max(0, Math.round((step.at - steps[i - 1].at) / MINUTE)),
  }));
};

/** Gün değişiminde tarih de yazılır ("Dün 23:10", "8 Eki 21:14"), aynı günde yalnızca saat */
const stepClock = (at, prevAt, now) => {
  if (prevAt === null) return shortWhen(at, now);
  return dayKey(at) === dayKey(prevAt) ? formatTime(at) : shortWhen(at, now);
};

export default function OrderTimeline({ order }) {
  const now = useOrdersNow();
  const active = isActiveStatus(order?.status);
  const [open, setOpen] = useState(active);
  const listId = useId();
  const steps = buildSteps(order);
  const last = steps[steps.length - 1] || null;
  const waiting = active ? statusUi(order.status).waiting : null;
  const waitedMinutes = waiting && last ? Math.max(0, Math.floor((now - last.at) / MINUTE)) : null;
  const total = active ? null : durationMinutes(order, now);
  const summary = active
    ? (waiting && waitedMinutes !== null ? `${waiting.toLocaleLowerCase("tr-TR")} · ${formatMinutes(waitedMinutes)}` : "")
    : (total !== null ? `toplam ${formatMinutes(total)}` : "");

  return (
    <section className="so-d-section so-d-tl-sec">
      <h3 className="so-d-h">
        <button type="button" className="so-d-collapse" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
          <History aria-hidden="true" />
          <span>Zaman çizelgesi</span>
          {summary && !open && <span className="so-d-h-meta">· {summary}</span>}
          <ChevronDown className="so-d-collapse-caret" aria-hidden="true" />
        </button>
      </h3>
      {open && (
        <ol id={listId} className="so-d-timeline">
          {steps.map((step, i) => (
            <li key={step.key} className="so-d-tl-item" data-tone={step.tone} data-pending={step.pending ? "true" : undefined}>
              <span className="so-d-tl-dot" aria-hidden="true" />
              <span className="so-d-tl-label">
                {step.label}
                {step.pending && <span className="so-d-tl-tag">kaydedilecek</span>}
              </span>
              <span className="so-d-tl-delta ui-num">{step.delta !== null ? `+${formatMinutes(step.delta)}` : ""}</span>
              <time className="so-d-tl-time ui-num" dateTime={new Date(step.at).toISOString()} title={formatDateTime(step.at)}>
                {stepClock(step.at, i === 0 ? null : steps[i - 1].at, now)}
              </time>
            </li>
          ))}
          {waiting && last && (
            <li className="so-d-tl-item" data-tone="waiting">
              <span className="so-d-tl-dot" aria-hidden="true" />
              <span className="so-d-tl-label">{waiting}</span>
              <span className="so-d-tl-delta ui-num">{formatMinutes(waitedMinutes)}</span>
              <span className="so-d-tl-time" aria-hidden="true" />
            </li>
          )}
          {!steps.length && <li className="so-d-tl-empty ui-muted">Bu sipariş için zaman bilgisi yok.</li>}
        </ol>
      )}
    </section>
  );
}
