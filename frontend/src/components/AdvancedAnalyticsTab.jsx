// Satış analizi: seçili dönem (bugün / bu hafta / bu ay / bu yıl) önceki dönemin aynı noktasına
// kadarki kısmıyla karşılaştırılır. Veri kaynakları:
//   GET /analytics/compare?period=   → KPI'lar, delta, günlük seri, saat, yurt/bölge, kategori, ürün, hazırlama süresi
//   Ciro ürün tutarıdır; teslimat ücreti (deliveryFeeRevenue) ayrı gösterilir. byZone yoksa (eski sunucu) byDorm kullanılır.
//   GET /analytics?timeRange=        → genel göstergeler (dönüşüm, sadakat, toplamlar) ve sipariş durumu dağılımı
//   GET /products/shelf-performance  → ShelfPerformanceCard (raf performansı)
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Clock, Download, Minus, Package2, Percent,
  RefreshCw, ShoppingBag, Ticket, TrendingUp, Users, Wallet, XCircle,
} from "lucide-react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import axios from "../lib/axios";
import ShelfPerformanceCard from "./ShelfPerformanceCard";
import { categoryName, downloadText } from "./products/productUtils";
import {
  PageHeader, EmptyState, KpiCard, KpiGrid, Segmented, SkeletonCards, SkeletonBlock, usePref, useIsMobile,
  money, compactMoney, formatDate, formatDateTime,
} from "./admin/ui";
import "../styles/analytics.css";

const PERIODS = [
  { value: "day", label: "Bugün", prev: "dün", timeRange: "week" },
  { value: "week", label: "Bu hafta", prev: "geçen hafta", timeRange: "week" },
  { value: "month", label: "Bu ay", prev: "geçen ay", timeRange: "month" },
  { value: "year", label: "Bu yıl", prev: "geçen yıl", timeRange: "year" },
];
const DORMS = { girlsDorm: "Kız yurdu", boysDorm: "Erkek yurdu", unknown: "Belirtilmemiş" };
const STATUS_TONE = { "Hazırlanıyor": "warn", "Yolda": "info", "Teslim Edildi": "ok", "İptal Edildi": "danger" };
const DAYPARTS = [
  { label: "Sabah", hint: "06–11", hours: [6, 7, 8, 9, 10] },
  { label: "Öğle", hint: "11–17", hours: [11, 12, 13, 14, 15, 16] },
  { label: "Akşam", hint: "17–22", hours: [17, 18, 19, 20, 21] },
  { label: "Gece", hint: "22–06", hours: [22, 23, 0, 1, 2, 3, 4, 5] },
];
const TOOLTIP_STYLE = { background: "var(--ui-surface)", border: "1px solid var(--ui-line)", borderRadius: 8, color: "var(--ui-text)", boxShadow: "var(--ui-shadow-pop)", fontSize: 12 };
const pad2 = (n) => String(n).padStart(2, "0");
const num = (n, digits = 0) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: digits });
const minutes = (m) => (m === null || m === undefined ? "—" : m >= 90 ? `${num(m / 60, 1)} sa` : `${num(m)} dk`);

// CSV: noktalı virgül ayraçlı, Excel'in Türkçe ayarlarıyla doğrudan açılır
const csvCell = (v) => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (head, rows) => "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
const tr = (n) => String(n ?? "").replace(".", ",");

/** Delta göstergesi: yüzde ya da mutlak fark; `invert` artışın kötü olduğu ölçütler için (iptal, süre) */
const Delta = ({ value, unit = "%", invert = false, label }) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return <span className="anl-delta" data-dir="none">önceki dönem verisi yok</span>;
  const n = Number(value);
  const dir = n > 0 ? "up" : n < 0 ? "down" : "flat";
  const good = dir === "flat" ? "flat" : (dir === "up") !== invert ? "good" : "bad";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const text = unit === "%" ? `%${num(Math.abs(n), 1)}` : `${num(Math.abs(n), 1)} ${unit}`;
  return (
    <span className="anl-delta" data-tone={good}>
      <Icon aria-hidden="true" />{dir === "flat" ? "değişmedi" : text}{label && <span className="anl-delta-label"> · {label}</span>}
    </span>
  );
};

/** Grafik ipucu: değer önde, seri adı arkada; arka plan yüzey belirteci */
const ChartTip = ({ active, payload, formatValue, title }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="anl-tip" style={TOOLTIP_STYLE}>
      {title && <strong className="anl-tip-title">{title(row)}</strong>}
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <div key={p.dataKey} className="anl-tip-row">
          <i className="anl-tip-key" data-key={p.dataKey} aria-hidden="true" />
          <strong>{formatValue(p.value)}</strong>
          <span>{p.name}</span>
        </div>
      ))}
    </div>
  );
};

/** Saat dilimi ısı çubukları (tek renk, yoğunluk opaklıkla) */
const HourlyHeat = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.orders));
  const total = rows.reduce((s, r) => s + r.orders, 0);
  const peak = rows.reduce((best, r) => (r.orders > (best?.orders || 0) ? r : best), null);
  const parts = DAYPARTS.map((p) => {
    const orders = p.hours.reduce((s, h) => s + (rows[h]?.orders || 0), 0);
    return { ...p, orders, share: total ? Math.round((orders / total) * 100) : 0 };
  });
  return (
    <div className="anl-heat">
      <div className="anl-heat-strip" role="list" aria-label="Saat dilimine göre sipariş">
        {rows.map((r) => (
          <div key={r.hour} className="anl-heat-cell" role="listitem" tabIndex={0}
            title={`${pad2(r.hour)}:00–${pad2((r.hour + 1) % 24)}:00 · ${r.orders} sipariş · ${money(r.revenue)}`}
            aria-label={`${pad2(r.hour)}:00, ${r.orders} sipariş`}>
            <i style={{ opacity: r.orders ? 0.2 + 0.8 * (r.orders / max) : 0 }} />
            <span className="anl-heat-tip"><strong>{r.orders} sipariş</strong><span>{pad2(r.hour)}:00 · {compactMoney(r.revenue)}</span></span>
          </div>
        ))}
      </div>
      <div className="anl-heat-axis" aria-hidden="true">
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <span key={h}>{pad2(h)}</span>)}
        <span>24</span>
      </div>
      <div className="anl-dayparts">
        {parts.map((p) => (
          <div key={p.label} className="anl-daypart">
            <span className="anl-daypart-head"><strong>{p.label}</strong><small className="ui-muted">{p.hint}</small></span>
            <span className="ui-progress"><div style={{ width: `${p.share}%` }} /></span>
            <span className="anl-daypart-val ui-num">{p.orders} · %{p.share}</span>
          </div>
        ))}
      </div>
      {peak && peak.orders > 0 && (
        <p className="ui-hint anl-foot">En yoğun saat <strong>{pad2(peak.hour)}:00–{pad2((peak.hour + 1) % 24)}:00</strong> ({peak.orders} sipariş).</p>
      )}
    </div>
  );
};

const AdvancedAnalyticsTab = () => {
  const [period, setPeriod] = usePref("admin-analytics-period", "week");
  const [metric, setMetric] = useState("revenue");
  const [compare, setCompare] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isMobile = useIsMobile();
  const periodMeta = PERIODS.find((p) => p.value === period) || PERIODS[1];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [cmp, old] = await Promise.allSettled([
      axios.get(`/analytics/compare?period=${periodMeta.value}`),
      axios.get(`/analytics?timeRange=${periodMeta.timeRange}`),
    ]);
    if (cmp.status === "fulfilled") setCompare(cmp.value.data);
    else setError(cmp.reason?.response?.data?.message || "Analiz verileri yüklenemedi.");
    setLegacy(old.status === "fulfilled" ? old.value.data : null);
    setLoading(false);
  }, [periodMeta.value, periodMeta.timeRange]);

  useEffect(() => { load(); }, [load]);

  // ── Türetilmiş veriler ───────────────────────────────────────────────
  const daily = useMemo(() => {
    if (!compare) return [];
    const cur = new Map(compare.salesByDay.current.map((d) => [d.dayIndex, d]));
    const prev = new Map(compare.salesByDay.previous.map((d) => [d.dayIndex, d]));
    const length = Math.max(1, ...cur.keys(), ...prev.keys());
    // Bu dönemde henüz gelmemiş günler null kalır: çizgi bugünde biter, sıfıra düşmez
    const elapsedDays = Math.floor((new Date(compare.current.end) - new Date(compare.current.start)) / 86400000) + 1;
    return Array.from({ length }, (_, i) => {
      const idx = i + 1;
      const c = cur.get(idx);
      const p = prev.get(idx);
      const future = idx > elapsedDays;
      const curDate = new Date(new Date(compare.current.start).getTime() + i * 86400000);
      return {
        dayIndex: idx, label: formatDate(curDate), previousDate: p?.date,
        current: future ? null : c?.amount || 0, currentOrders: future ? null : c?.orders || 0,
        previous: p?.amount || 0, previousOrders: p?.orders || 0,
      };
    });
  }, [compare]);

  const categories = useMemo(() => {
    if (!compare) return [];
    const rows = compare.byCategory.map((c) => ({ ...c, name: categoryName(c.category) }));
    if (rows.length <= 8) return rows;
    const head = rows.slice(0, 7);
    const rest = rows.slice(7);
    return [...head, { name: "Diğer", category: "diger", revenue: rest.reduce((s, r) => s + r.revenue, 0), units: rest.reduce((s, r) => s + r.units, 0), share: rest.reduce((s, r) => s + r.share, 0) }];
  }, [compare]);

  const hasOrders = Boolean(compare && (compare.current.orders > 0 || compare.current.cancelled > 0));

  // ── CSV ──────────────────────────────────────────────────────────────
  const downloadDaily = () => {
    const rows = daily.map((d) => [d.dayIndex, d.label, tr(d.current), d.currentOrders, d.previousDate || "", tr(d.previous), d.previousOrders]);
    downloadText(toCsv(["Gün", "Tarih", "Ciro", "Sipariş", "Önceki dönem tarihi", "Önceki ciro", "Önceki sipariş"], rows), `gunluk-ciro-${period}.csv`);
  };
  const downloadHourly = () => downloadText(toCsv(["Saat", "Sipariş", "Ciro"], compare.hourly.map((h) => [`${pad2(h.hour)}:00`, h.orders, tr(h.revenue)])), `saatlik-${period}.csv`);
  const downloadCategories = () => downloadText(toCsv(["Kategori", "Ciro", "Adet", "Pay %"], categories.map((c) => [c.name, tr(c.revenue), c.units, tr(c.share)])), `kategori-ciro-${period}.csv`);
  const downloadProducts = () => downloadText(toCsv(["Sıra", "Ürün", "Kategori", "Adet", "Sipariş", "Ciro"], compare.topProducts.map((p, i) => [i + 1, p.name, categoryName(p.category), p.units, p.orders, tr(p.revenue)])), `cok-satanlar-${period}.csv`);

  const header = (
    <PageHeader
      title="Satış analizi"
      description={compare
        ? `${formatDate(compare.current.start)} – ${formatDateTime(compare.current.end)} · karşılaştırma: ${periodMeta.prev} aynı saate kadar (${formatDate(compare.previous.start)} – ${formatDateTime(compare.previous.end)})`
        : "Seçili dönemi önceki dönemle karşılaştırın; kırılımlar seçili dönem içindir."}
      actions={
        <>
          <Segmented ariaLabel="Dönem" options={PERIODS.map(({ value, label }) => ({ value, label }))} value={period} onChange={setPeriod} />
          <button type="button" className="ui-btn" onClick={load} disabled={loading}><RefreshCw className={loading ? "ui-spin" : undefined} /> Yenile</button>
        </>
      }
    />
  );

  if (loading && !compare) {
    return (
      <div className="ui-page anl-page">
        {header}
        <SkeletonCards count={6} />
        <SkeletonBlock height={300} />
        <div className="ui-grid-2 anl-grid"><SkeletonBlock height={260} /><SkeletonBlock height={260} /></div>
        <div className="ui-grid-2 anl-grid"><SkeletonBlock height={260} /><SkeletonBlock height={260} /></div>
      </div>
    );
  }

  if (error && !compare) {
    return (
      <div className="ui-page anl-page">
        {header}
        <div className="ui-banner ui-banner--danger anl-banner">
          <AlertTriangle /><span>{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}>Tekrar dene</button>
        </div>
      </div>
    );
  }

  const { current, previous, deltas } = compare;
  const metricIsMoney = metric === "revenue";
  // Teslimat ücreti: yalnızca dönemde ücretli teslimat varsa görünür (eski veride her şey bugünkü gibi)
  const feeNow = Number(current.deliveryFeeRevenue) || 0;
  const feePrev = Number(previous.deliveryFeeRevenue) || 0;
  const showFee = feeNow > 0 || feePrev > 0;
  // Bölge kırılımı: sunucu byZone verirse ve veride yurt dışı bölge varsa; aksi halde bugünkü yurt kırılımı
  const zoneRows = Array.isArray(compare.byZone) ? compare.byZone : [];
  const useZones = zoneRows.some((z) => z.zoneId !== "girlsDorm" && z.zoneId !== "boysDorm" && z.zoneId !== "unknown");
  const splitRows = useZones
    ? zoneRows.map((z) => ({ key: z.zoneId, label: z.name || DORMS[z.zoneId] || z.zoneId, orders: z.orders, revenue: z.revenue, fee: Number(z.deliveryFeeRevenue) || 0 }))
    : compare.byDorm.map((d) => ({ key: d.deliveryPoint, label: DORMS[d.deliveryPoint] || d.deliveryPoint, orders: d.orders, revenue: d.revenue, fee: 0 }));
  const fmtMetric = (v) => (metricIsMoney ? money(v) : `${num(v)} sipariş`);

  return (
    <div className="ui-page anl-page" data-busy={loading || undefined}>
      {header}
      {error && (
        <div className="ui-banner ui-banner--danger anl-banner">
          <AlertTriangle /><span>{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={load}>Tekrar dene</button>
        </div>
      )}

      {/* KPI kartları */}
      <KpiGrid columns={isMobile ? 2 : 6} className="anl-kpis">
        <KpiCard icon={Wallet} tone="brand" label={showFee ? "Ciro (ürün)" : "Ciro"} value={compactMoney(current.revenue)}
          note={<><Delta value={deltas.revenue} /><span className="anl-prev">önceki {compactMoney(previous.revenue)}</span>
            {showFee && <span className="anl-prev" title={`Teslimat ücreti cirodan ayrıdır · önceki dönem ${money(feePrev)}`}>+ {compactMoney(feeNow)} teslimat</span>}</>} />
        <KpiCard icon={ShoppingBag} tone="info" label="Sipariş" value={num(current.orders)}
          note={<><Delta value={deltas.orders} /><span className="anl-prev">önceki {num(previous.orders)}</span></>} />
        <KpiCard icon={TrendingUp} tone="ok" label="Ortalama sepet" value={money(current.averageOrderValue)}
          note={<><Delta value={deltas.averageOrderValue} /><span className="anl-prev">{num(current.units)} adet ürün</span></>} />
        <KpiCard icon={XCircle} tone={current.cancelRate > 10 ? "danger" : "warn"} label="İptal oranı" value={current.cancelRate === null ? "—" : `%${num(current.cancelRate, 1)}`}
          note={<><Delta value={deltas.cancelRate} unit="puan" invert /><span className="anl-prev">{current.cancelled} iptal · {compactMoney(current.cancelledAmount)}</span></>} />
        <KpiCard icon={Clock} tone="warn" label="Ort. hazırlama" value={minutes(current.avgPrepMinutes)}
          note={<><Delta value={deltas.avgPrepMinutes} unit="dk" invert /><span className="anl-prev">{current.prepSampled ? `${current.prepSampled} sipariş · ortanca ${minutes(current.medianPrepMinutes)}` : "Yolda kaydı yok"}</span></>} />
        <KpiCard icon={Ticket} label="Kupon" value={`${num(current.couponOrders)} sipariş`}
          note={<><Delta value={deltas.couponDiscount} /><span className="anl-prev">{money(current.couponDiscount)} indirim</span></>} />
      </KpiGrid>

      {/* Ana grafik: günlük (ya da bugün için saatlik) seri */}
      <section className="ui-panel anl-panel">
        <div className="ui-panel-head anl-head">
          <div>
            <h2>{period === "day" ? "Saatlik satış" : "Günlük satış"}</h2>
            <p>{period === "day" ? "Bugün, saat dilimine göre" : `${periodMeta.label} ve ${periodMeta.prev}, dönem başından itibaren gün gün`}</p>
          </div>
          <div className="ui-cluster anl-head-tools">
            <Segmented size="sm" ariaLabel="Ölçüt" value={metric} onChange={setMetric} options={[{ value: "revenue", label: "Ciro" }, { value: "orders", label: "Sipariş" }]} />
            {period !== "day" && (
              <span className="anl-legend" aria-hidden="true">
                <span><i className="anl-legend-key" data-key="current" /> {periodMeta.label}</span>
                <span><i className="anl-legend-key" data-key="previous" /> {periodMeta.prev[0].toLocaleUpperCase("tr") + periodMeta.prev.slice(1)}</span>
              </span>
            )}
          </div>
        </div>
        <div className="ui-panel-body anl-chart-body">
          {!hasOrders ? (
            <EmptyState compact icon={BarChart3} title="Bu dönemde sipariş yok" description="Sipariş geldikçe grafik burada oluşur." />
          ) : period === "day" ? (
            <div className="anl-chart">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={compare.hourly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--ui-line)" />
                  <XAxis dataKey="hour" tickFormatter={(h) => pad2(h)} tick={{ fill: "var(--ui-text-3)", fontSize: 11 }} axisLine={{ stroke: "var(--ui-line)" }} tickLine={false} interval={isMobile ? 3 : 1} />
                  <YAxis width={metricIsMoney ? 56 : 32} tick={{ fill: "var(--ui-text-3)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => (metricIsMoney ? compactMoney(v) : num(v))} />
                  <Tooltip cursor={{ fill: "var(--ui-surface-3)" }} content={<ChartTip formatValue={fmtMetric} title={(r) => `${pad2(r.hour)}:00–${pad2((r.hour + 1) % 24)}:00`} />} />
                  <Bar dataKey={metricIsMoney ? "revenue" : "orders"} name="Bugün" fill="var(--ui-brand)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="anl-chart">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="anl-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--ui-brand)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--ui-brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--ui-line)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--ui-text-3)", fontSize: 11 }} axisLine={{ stroke: "var(--ui-line)" }} tickLine={false} minTickGap={isMobile ? 40 : 24} />
                  <YAxis width={metricIsMoney ? 56 : 32} tick={{ fill: "var(--ui-text-3)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => (metricIsMoney ? compactMoney(v) : num(v))} />
                  <Tooltip cursor={{ stroke: "var(--ui-line-strong)", strokeDasharray: "3 3" }} content={<ChartTip formatValue={fmtMetric} title={(r) => `Gün ${r.dayIndex} · ${r.label}${r.previousDate ? ` / ${formatDate(r.previousDate)}` : ""}`} />} />
                  <Line type="monotone" dataKey={metricIsMoney ? "previous" : "previousOrders"} name={periodMeta.prev} stroke="var(--ui-text-3)" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 4, fill: "var(--ui-text-3)", stroke: "var(--ui-surface)", strokeWidth: 2 }} isAnimationActive={false} />
                  <Area type="monotone" dataKey={metricIsMoney ? "current" : "currentOrders"} name={periodMeta.label} stroke="var(--ui-brand)" strokeWidth={2} fill="url(#anl-fill)" dot={false} activeDot={{ r: 4, fill: "var(--ui-brand)", stroke: "var(--ui-surface)", strokeWidth: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="anl-foot-bar">
          <span className="ui-hint">
            {period === "day" ? `Toplam ${num(current.orders)} sipariş · ${money(current.revenue)}`
              : `Önceki dönemin tamamı: ${money(compare.previousFull?.revenue ?? 0)} · ${num(compare.previousFull?.orders ?? 0)} sipariş`}
          </span>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={period === "day" ? downloadHourly : downloadDaily} disabled={!hasOrders}><Download /> CSV indir</button>
        </div>
      </section>

      {/* Saat dilimi + yurt */}
      <div className="ui-grid-2 anl-grid">
        <section className="ui-panel anl-panel">
          <div className="ui-panel-head">
            <div><h2>Saat dilimine göre sipariş</h2><p>{periodMeta.label}, Türkiye saati</p></div>
          </div>
          <div className="ui-panel-body">
            {hasOrders ? <HourlyHeat rows={compare.hourly} /> : <EmptyState compact icon={Clock} title="Veri yok" description="Sipariş geldikçe saat dağılımı oluşur." />}
          </div>
          <div className="anl-foot-bar">
            <span className="ui-hint">24 dilim · koyuluk sipariş sayısını gösterir</span>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={downloadHourly} disabled={!hasOrders}><Download /> CSV indir</button>
          </div>
        </section>

        <section className="ui-panel anl-panel">
          <div className="ui-panel-head">
            {useZones
              ? <div><h2>Bölgeye göre</h2><p>Teslimat bölgesine göre sipariş, ürün cirosu ve teslimat ücreti</p></div>
              : <div><h2>Yurda göre</h2><p>Teslimat noktasına göre sipariş ve ciro</p></div>}
          </div>
          <div className="ui-panel-body anl-dorms">
            {splitRows.length === 0 ? (
              <EmptyState compact icon={Users} title="Veri yok" description="Bu dönemde teslim edilen sipariş yok." />
            ) : splitRows.map((d) => {
              const share = current.revenue > 0 ? Math.round((d.revenue / current.revenue) * 100) : 0;
              return (
                <div key={d.key} className="anl-dorm">
                  <div className="anl-dorm-head">
                    <strong>{d.label}</strong>
                    <span className="ui-num">{money(d.revenue)} <small className="ui-muted">· %{share}</small></span>
                  </div>
                  <span className="ui-progress"><div style={{ width: `${share}%` }} /></span>
                  <span className="ui-hint anl-dorm-sub">
                    {num(d.orders)} sipariş · ortalama {money(d.orders ? d.revenue / d.orders : 0)}
                    {useZones && ` · teslimat ${d.fee > 0 ? money(d.fee) : "ücretsiz"}`}
                  </span>
                </div>
              );
            })}
          </div>
          {legacy?.orderStatusBreakdown?.length > 0 && (
            <>
              <div className="ui-panel-head anl-subhead"><div><h2>Sipariş durumları</h2><p>Tüm zamanlar</p></div></div>
              <div className="ui-panel-body anl-status">
                {legacy.orderStatusBreakdown.map((s) => (
                  <div key={s.status} className="anl-status-row">
                    <span className={`ui-dot ${STATUS_TONE[s.status] ? `ui-dot--${STATUS_TONE[s.status]}` : ""}`} />
                    <span className="anl-status-name">{s.status}</span>
                    <span className="ui-num anl-status-val">{num(s.count)} <small className="ui-muted">· %{num(s.percentage, 1)}</small></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Kategori + en çok satanlar */}
      <div className="ui-grid-2 anl-grid">
        <section className="ui-panel anl-panel">
          <div className="ui-panel-head">
            <div><h2>Kategoriye göre ciro</h2><p>Sipariş satırlarındaki kategori · iptaller hariç</p></div>
          </div>
          <div className="ui-panel-body anl-chart-body">
            {categories.length === 0 ? (
              <EmptyState compact icon={Percent} title="Veri yok" description="Bu dönemde satış satırı yok." />
            ) : (
              <div className="anl-chart">
                <ResponsiveContainer width="100%" height={Math.max(180, categories.length * 34 + 20)}>
                  <BarChart data={categories} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 0 }} barCategoryGap={6}>
                    <CartesianGrid horizontal={false} stroke="var(--ui-line)" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={isMobile ? 96 : 150} tick={{ fill: "var(--ui-text-2)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "var(--ui-surface-3)" }} content={<ChartTip formatValue={(v) => money(v)} title={(r) => `${r.name} · ${num(r.units)} adet · %${num(r.share, 1)}`} />} />
                    <Bar dataKey="revenue" name="Ciro" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} label={{ position: "right", fill: "var(--ui-text-2)", fontSize: 11, formatter: (v) => compactMoney(v) }}>
                      {categories.map((c) => <Cell key={c.category} fill={c.category === "diger" ? "var(--ui-line-strong)" : "var(--ui-brand)"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="anl-foot-bar">
            <span className="ui-hint">{categories.length > 0 ? `${num(compare.byCategory.length)} kategori · en yüksek ${categories[0].name}` : "—"}</span>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={downloadCategories} disabled={categories.length === 0}><Download /> CSV indir</button>
          </div>
        </section>

        <section className="ui-panel anl-panel">
          <div className="ui-panel-head">
            <div><h2>En çok satan ürünler</h2><p>Adede göre ilk 10 · iptaller hariç</p></div>
          </div>
          {compare.topProducts.length === 0 ? (
            <EmptyState compact icon={Package2} title="Veri yok" description="Bu dönemde satılan ürün yok." />
          ) : (
            <div className="ui-table-wrap anl-table-wrap">
              <table className="ui-table anl-table">
                <thead>
                  <tr><th>#</th><th>Ürün</th><th className="ui-num">Adet</th><th className="ui-num">Sipariş</th><th className="ui-num">Ciro</th></tr>
                </thead>
                <tbody>
                  {compare.topProducts.map((p, i) => (
                    <tr key={p.productId || p.name}>
                      <td><span className="ui-rank">{i + 1}</span></td>
                      <td className="anl-product">
                        <span className="ui-truncate anl-product-name">{p.name}</span>
                        <small className="ui-muted">{categoryName(p.category)}</small>
                      </td>
                      <td className="ui-num">{num(p.units)}</td>
                      <td className="ui-num">{num(p.orders)}</td>
                      <td className="ui-num anl-strong">{money(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="anl-foot-bar">
            <span className="ui-hint">{compare.topProducts.length > 0 ? `İlk ${compare.topProducts.length} ürün ${money(compare.topProducts.reduce((s, p) => s + p.revenue, 0))} ciro` : "—"}</span>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={downloadProducts} disabled={compare.topProducts.length === 0}><Download /> CSV indir</button>
          </div>
        </section>
      </div>

      {/* Genel göstergeler + raf performansı */}
      <div className="ui-grid-2 anl-grid">
        <section className="ui-panel anl-panel">
          <div className="ui-panel-head">
            <div><h2>Genel göstergeler</h2><p>Tüm zamanlar · müşteri tabanı</p></div>
          </div>
          {legacy ? (
            <dl className="anl-facts">
              <div><dt><Activity /> Dönüşüm oranı</dt><dd>%{num(legacy.conversionRate, 1)}<small className="ui-muted">sipariş veren müşteri / kayıtlı müşteri</small></dd></div>
              <div><dt><Users /> Müşteri sadakati</dt><dd>%{num(legacy.customerRetention, 1)}<small className="ui-muted">birden fazla sipariş veren müşteri oranı</small></dd></div>
              <div><dt><Wallet /> Toplam ciro</dt><dd>{money(legacy.totalRevenue)}<small className="ui-muted">{num(legacy.totalOrders)} sipariş · iptaller hariç{Number(legacy.totalDeliveryFeeRevenue) > 0 ? ` · teslimat ücreti ayrı: ${money(legacy.totalDeliveryFeeRevenue)}` : ""}</small></dd></div>
              <div><dt><Package2 /> Katalog</dt><dd>{num(legacy.totalProducts)} ürün<small className="ui-muted">{num(legacy.totalUsers)} kayıtlı müşteri</small></dd></div>
            </dl>
          ) : (
            <EmptyState compact icon={Activity} title="Genel göstergeler yüklenemedi" description="Yenileyerek tekrar deneyin." action={<button type="button" className="ui-btn ui-btn--sm" onClick={load}>Tekrar dene</button>} />
          )}
        </section>
        <div className="anl-shelf"><ShelfPerformanceCard /></div>
      </div>
    </div>
  );
};

export default AdvancedAnalyticsTab;
