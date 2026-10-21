// Siparişler ekranının filtreden bağımsız KPI kartları ve katlanır "İçgörüler" bölümü (C3).
// Değerler tüm yüklü siparişlerden (windowOrders, kaplamalar uygulanmış) gelir; arama ve çipler değiştirmez.
// Stil: styles/orders-overview.css (önek so-ov-). Sözleşme: scratchpad/orders-design/CONTRACTS.md §7.2
import { useId, useMemo } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, MapPin, ShoppingBag, Timer, Truck, Wallet,
} from "lucide-react";
import { KpiGrid, SkeletonCards, money } from "../admin/ui";
import {
  DELAY_HINT, PAYMENT, STATUS, activeByPoint, formatMinutes, hourlyToday, startOfDay, statusDistribution, summarizeOrders,
} from "./shared";
import "../../styles/orders-overview.css";

const pad2 = (n) => String(n).padStart(2, "0");
const count = (n) => (Number(n) || 0).toLocaleString("tr-TR");

/**
 * KPI kartı. admin/ui KpiCard ile aynı işaretleme (ui-kpi sınıfları); ek olarak title, kısa etiket (telefon)
 * ve aç/kapa olmayan (çekmece açan) kart için aria-haspopup desteği vardır.
 */
const Kpi = ({ icon: Icon, label, short, value, note, tone, pressed, popup = false, onClick, title, className = "" }) => (
  <button type="button" className={`ui-kpi so-ov-kpi ${className}`} data-tone={tone} title={title} onClick={onClick}
    aria-pressed={popup ? undefined : Boolean(pressed)} aria-haspopup={popup ? "dialog" : undefined}>
    <span className="ui-kpi-top">
      <span className="ui-kpi-label">
        {short ? <><span className="so-ov-kpi-long">{label}</span><span className="so-ov-kpi-short">{short}</span></> : label}
      </span>
      {Icon && <span className="ui-kpi-icon" aria-hidden="true"><Icon /></span>}
    </span>
    <span className="ui-kpi-value ui-num">{value}</span>
    {note && <span className="ui-kpi-note">{note}</span>}
  </button>
);

// ── İçgörüler panelleri ──────────────────────────────────────────────────
const HourlyPanel = ({ orders, now }) => {
  const { hours, max, peak, currentHour, total } = useMemo(() => hourlyToday(orders, now), [orders, now]);
  const summary = total
    ? `Saatlik sipariş dağılımı, en yoğun saat ${pad2(peak)}:00`
    : "Bugün henüz sipariş yok";
  return (
    <section className="ui-panel so-ov-panel so-ov-panel--hours" aria-label="Bugün saat saat">
      <header className="so-ov-panel-head">
        <h3>Bugün saat saat</h3>
        <p>{total ? <><strong className="ui-num">{count(total)}</strong> sipariş · en yoğun {pad2(peak)}:00 ({count(max)})</> : "Henüz sipariş yok"}</p>
      </header>
      <div className="so-ov-hours" role="img" aria-label={summary} data-empty={total ? undefined : "true"}>
        {!total && <span className="so-ov-hours-empty" aria-hidden="true">Bugün henüz sipariş yok</span>}
        {hours.map((n, h) => (
          <span key={h} className="so-ov-hour" title={`${pad2(h)}:00 · ${n} sipariş`}
            data-now={h === currentHour ? "true" : undefined} data-empty={n === 0 ? "true" : undefined}>
            <i style={n ? { height: `${Math.max(18, Math.round((n / max) * 100))}%` } : undefined} />
          </span>
        ))}
      </div>
      <div className="so-ov-hours-axis" aria-hidden="true">
        <span>00</span><span>06</span><span>12</span><span>18</span>
      </div>
    </section>
  );
};

const StatusPanel = ({ orders }) => {
  const rows = useMemo(() => statusDistribution(orders), [orders]);
  return (
    <section className="ui-panel so-ov-panel" aria-label="Durum dağılımı">
      <header className="so-ov-panel-head">
        <h3>Durum dağılımı</h3>
        <p>Yüklü <strong className="ui-num">{count(orders.length)}</strong> sipariş</p>
      </header>
      <ol className="so-ov-flow">
        {rows.map(({ status, count: n, share }) => {
          const ui = STATUS[status];
          const Icon = ui.icon;
          return (
            <li key={status} className="so-ov-flow-row" data-tone={ui.tone} data-empty={n === 0 ? "true" : undefined}>
              <span className="so-ov-flow-icon" aria-hidden="true"><Icon /></span>
              <span className="so-ov-flow-count ui-num">{count(n)}</span>
              <span className="so-ov-flow-label">{ui.label}</span>
              <span className="so-ov-flow-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
              <span className="so-ov-flow-share ui-num">%{share}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const PAYMENT_ROWS = [
  { key: "cash", label: PAYMENT.cash.label, icon: PAYMENT.cash.icon },
  { key: "card", label: PAYMENT.card.label, icon: PAYMENT.card.icon },
  { key: "transfer", label: PAYMENT.bank_transfer.label, icon: PAYMENT.bank_transfer.icon, tone: "warn" },
  { key: "none", label: "Belirtilmemiş", icon: Wallet },
];

const PointsPanel = ({ orders, now, pointFilter, onPointFilter }) => {
  const points = useMemo(() => activeByPoint(orders), [orders]);
  const today = startOfDay(now);
  const pay = useMemo(
    () => summarizeOrders(orders.filter((o) => o.createdMs >= today && o.status !== "İptal Edildi")),
    [orders, today],
  );
  const prep = points.reduce((s, p) => s + p.prep, 0);
  const road = points.reduce((s, p) => s + p.road, 0);
  return (
    <section className="ui-panel so-ov-panel" aria-label="Aktif teslimat noktaları ve bugünkü ödemeler">
      <header className="so-ov-panel-head">
        <h3>Aktif teslimat noktaları</h3>
        <p>{prep + road ? `${count(prep)} hazırlanıyor · ${count(road)} yolda` : "Şu an aktif sipariş yok"}</p>
      </header>
      <div className="so-ov-points">
        {points.length === 0 && <p className="so-ov-empty">Şu an aktif sipariş yok</p>}
        {points.map((p) => {
          const content = (
            <>
              <MapPin className="so-ov-point-pin" aria-hidden="true" />
              <span className="so-ov-point-name">{p.name}</span>
              <span className="so-ov-point-stats">
                {p.prep > 0 && <span data-tone="warn">{count(p.prep)} hazırlanıyor</span>}
                {p.road > 0 && <span data-tone="info">{count(p.road)} yolda</span>}
              </span>
            </>
          );
          if (!p.code) return <div key={`n:${p.name}`} className="so-ov-point">{content}</div>;
          const on = pointFilter === p.code;
          return (
            <button key={p.code} type="button" className="so-ov-point" aria-pressed={on} onClick={() => onPointFilter?.(p.code)}
              title={on ? "Filtreyi kaldır" : "Bu teslimat noktasına göre filtrele"}>
              {content}
            </button>
          );
        })}
      </div>
      <div className="so-ov-pay">
        <h4>
          <span>Bugünkü ödemeler</span>
          <span className="ui-num" title="İptal edilen siparişler hariç">{money(pay.total)}</span>
        </h4>
        <ul>
          {PAYMENT_ROWS.map(({ key, label, icon: Icon, tone }) => {
            const bucket = pay[key];
            return (
              <li key={key} data-tone={tone} data-empty={bucket.count === 0 ? "true" : undefined}>
                <Icon aria-hidden="true" />
                <span className="so-ov-pay-label">{label}</span>
                <span className="so-ov-pay-count ui-num">{count(bucket.count)} sipariş</span>
                <span className="so-ov-pay-total ui-num">{money(bucket.total)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

// ── Bileşen ──────────────────────────────────────────────────────────────
export default function OrdersKpis({
  loading = false, kpis, orders, now, active, onPrep, onRoad, onLate, onToday, onDayClose,
  insightsOpen = false, onToggleInsights, pointFilter = "all", onPointFilter,
}) {
  const panelId = `so-ov-insights-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const list = orders || [];
  const at = now ?? Date.now();

  if (loading || !kpis) {
    return (
      <div className="so-ov-kpis-loading" aria-busy="true">
        <SkeletonCards count={5} />
      </div>
    );
  }

  const k = kpis;
  const on = active || {};
  const oldest = k.oldestPrepMinutes !== null && k.oldestPrepMinutes !== undefined ? formatMinutes(k.oldestPrepMinutes) : "";

  // Hazırlanacak notu: "{u} yeni · en eski {m}" / "en eski {m}" / "Bekleyen yok"
  let prepNote = "Bekleyen yok";
  if (k.prep > 0) {
    prepNote = k.unseen > 0
      ? <span className="so-ov-kpi-new"><span className="so-new-dot" aria-hidden="true" />{count(k.unseen)} yeni{oldest && ` · en eski ${oldest}`}</span>
      : oldest ? `en eski ${oldest}` : `${count(k.prep)} sipariş`;
  }

  // Yolda notu: kapıda tahsil edilecek nakit ve POS sayısı (kuryenin ihtiyacı)
  let roadNote = "—";
  if (k.road > 0) {
    const parts = [];
    if (k.roadCashCount > 0) parts.push(`Kapıda nakit ${money(k.roadCash)}`);
    if (k.roadCard > 0) parts.push(`${count(k.roadCard)} POS`);
    roadNote = parts.length ? parts.join(" · ") : k.roadTransfer > 0 ? "Kapıda tahsilat yok (havale)" : "Ödeme yöntemi belirtilmemiş";
  }

  const lateNote = k.late > 0 ? `${count(k.latePrep)} hazırlıkta · ${count(k.lateRoad)} yolda` : "Hazırlıkta 20+, yolda 25+ dk";

  const todayNote = k.todayCount > 0
    ? <span title="İptal edilen siparişler hariç">{money(k.todayRevenue)} ciro · ort. {money(k.todayAvgBasket)}</span>
    : "Henüz sipariş yok";

  const avgValue = k.avgDeliveryMinutes !== null && k.avgDeliveryMinutes !== undefined ? formatMinutes(k.avgDeliveryMinutes) || "—" : "—";

  return (
    <>
      <KpiGrid className="so-ov-kpis">
        <Kpi icon={Clock} label="Hazırlanacak" short="Hazırlık" value={count(k.prep)} note={prepNote}
          tone={k.prep > 0 ? "warn" : undefined} pressed={on.prep} onClick={() => onPrep?.()}
          title="Hazırlanacak siparişleri göster" className="so-ov-kpi--prep" />
        <Kpi icon={Truck} label="Yolda" value={count(k.road)} note={roadNote} tone="info" pressed={on.road} onClick={() => onRoad?.()}
          title="Yoldaki siparişleri göster" className="so-ov-kpi--road" />
        <Kpi icon={k.late > 0 ? AlertTriangle : CheckCircle2} label="Geciken" value={count(k.late)} note={lateNote}
          tone={k.late > 0 ? "danger" : "ok"} pressed={on.late} onClick={() => onLate?.()}
          title={`${DELAY_HINT} · tıklayınca yalnızca gecikenler`} className="so-ov-kpi--late" />
        <Kpi icon={ShoppingBag} label="Bugün" value={count(k.todayCount)} note={todayNote} tone="brand" pressed={on.today} onClick={() => onToday?.()}
          title="Bugünün siparişlerini Liste’de göster" className="so-ov-kpi--today" />
        <Kpi icon={Timer} label="Ort. teslim" value={avgValue}
          note={`${count(k.todayDelivered)} teslim · ${count(k.todayCancelled)} iptal`}
          popup onClick={() => onDayClose?.()} title="Sipariş anından teslime ortalama süre (bugün) · Gün sonu özetini aç" className="so-ov-kpi--avg" />
      </KpiGrid>

      <section className="so-ov-insights" data-open={insightsOpen ? "true" : "false"}>
        <h2 className="so-ov-insights-title">
          <button type="button" className="so-ov-insights-toggle" aria-expanded={Boolean(insightsOpen)} aria-controls={insightsOpen ? panelId : undefined}
            onClick={() => onToggleInsights?.()}>
            <span className="so-ov-insights-label">İçgörüler</span>
            <span className="so-ov-insights-hint">Saatlik dağılım · durumlar · teslimat noktaları</span>
            <ChevronDown className="so-ov-insights-chevron" aria-hidden="true" />
          </button>
        </h2>
        {insightsOpen && (
          <div id={panelId} className="so-ov-insights-grid">
            <HourlyPanel orders={list} now={at} />
            <StatusPanel orders={list} />
            <PointsPanel orders={list} now={at} pointFilter={pointFilter} onPointFilter={onPointFilter} />
          </div>
        )}
      </section>
    </>
  );
}
