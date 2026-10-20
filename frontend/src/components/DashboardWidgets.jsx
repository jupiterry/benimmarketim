// Genel bakış (yönetici panosu): dönem özeti sunucuda hesaplanır (/orders-analytics/summary),
// kartlar sürükle-bırak ile sıralanır ve tercih tarayıcıda saklanır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Bell, CalendarDays, CheckCircle2, ChevronRight, Clock, GripVertical,
  Headphones, ImageOff, LayoutGrid, PackageX, Percent, Plus, RefreshCw, RotateCcw, ShoppingBag, Tag, TrendingUp, Truck,
  Users, Zap, BarChart3, Package,
} from "lucide-react";
import axios from "../lib/axios";
import socketService from "../lib/socket";
import TelegramNotificationsCard from "./TelegramNotificationsCard";
import OrderAlarmDevicesCard from "./OrderAlarmDevicesCard";
import ShelfPerformanceCard from "./ShelfPerformanceCard";
import { REVENUE_PERIODS } from "../lib/revenuePeriods";
import {
  EmptyState, HANDOFF, KpiCard, KpiGrid, PageHeader, Segmented, Skeleton, SkeletonRows, compactMoney, formatTime,
  initials, money, setHandoff, timeAgo, useNow, usePref,
} from "./admin/ui";
import "../styles/dashboard.css";

// ── Dönemler ─────────────────────────────────────────────────────────────
const QUICK_PERIODS = [
  { value: "today", label: "Bugün", description: "Bugün 00:00'dan itibaren", compare: "düne göre" },
  { value: "7d", label: "7 gün", description: "Son 7 gün", compare: "önceki 7 güne göre" },
  { value: "30d", label: "30 gün", description: "Son 30 gün", compare: "önceki 30 güne göre" },
  { value: "month", label: "Bu ay", description: "Ayın başından itibaren", compare: "geçen aya göre" },
  { value: "all", label: "Tüm zamanlar", description: "Tüm kayıtlı satışlar", compare: null },
];
// revenuePeriods.js dönemleri (faaliyet yılı tanımları) ek seçenek olarak sunulur
const EXTRA_PERIODS = REVENUE_PERIODS.filter((period) => period.id !== "all").map((period) => ({
  value: `rp:${period.id}`, label: period.label, description: period.description, start: period.start, end: period.end,
  compare: "önceki aynı uzunluktaki döneme göre",
}));
const ALL_PERIODS = [...QUICK_PERIODS, ...EXTRA_PERIODS];
const findPeriod = (value) => ALL_PERIODS.find((period) => period.value === value) || QUICK_PERIODS[0];
const periodParams = (value) => {
  const period = findPeriod(value);
  if (period.start) return { period: "custom", from: period.start.toISOString(), to: period.end ? period.end.toISOString() : undefined };
  return { period: period.value };
};

// ── Sunum yardımcıları ───────────────────────────────────────────────────
const number = (value) => Number(value || 0).toLocaleString("tr-TR");
const percent = (value) => `%${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
const STATUS_TONES = { "Hazırlanıyor": "warn", "Yolda": "info", "Teslim Edildi": "ok", "İptal Edildi": "danger" };
const DORM_NAMES = { girlsDorm: "Kız yurdu", boysDorm: "Erkek yurdu", unknown: "Belirsiz" };
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Seri anahtarını ("2026-10-20T09" / "2026-10-20" / "2026-10") eksen etiketine çevirir */
const bucketLabel = (key, bucket) => {
  if (bucket === "hour") return `${key.slice(11, 13)}:00`;
  if (bucket === "day") return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
};
/** Eksen etiketi: küçük tutarlarda kuruşsuz, büyüklerde kısaltılmış (₺12,4 B) */
const axisMoney = (value) => (Math.abs(Number(value) || 0) >= 10_000 ? compactMoney(value) : `₺${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`);
const shortId = (id) => `#${String(id || "").slice(-6).toUpperCase()}`;
const preparingMinutes = (order, now) => (order.status === "Hazırlanıyor" ? Math.floor((now - new Date(order.createdAt).getTime()) / 60000) : 0);

// ── Kart düzeni ──────────────────────────────────────────────────────────
const DEFAULT_LAYOUT = { main: ["sales", "recent", "shelf", "telegram"], side: ["status", "top", "quick", "profit", "alarm"] };
const CARD_IDS = [...DEFAULT_LAYOUT.main, ...DEFAULT_LAYOUT.side];
const CARD_TITLES = {
  sales: "Satış", recent: "Son siparişler", shelf: "Raf performansı", telegram: "Telegram bildirimleri",
  status: "Sipariş dağılımı", top: "Çok satanlar", quick: "Hızlı eylemler", profit: "Kâr tahmini", alarm: "Sipariş alarmı telefonları",
};
/** Saklanan düzeni doğrular: bilinmeyen kartları atar, eksikleri varsayılan yerine ekler */
const normalizeLayout = (saved) => {
  const main = Array.isArray(saved?.main) ? saved.main.filter((id) => CARD_IDS.includes(id)) : [];
  const side = Array.isArray(saved?.side) ? saved.side.filter((id) => CARD_IDS.includes(id) && !main.includes(id)) : [];
  const seen = new Set([...main, ...side]);
  for (const id of DEFAULT_LAYOUT.main) if (!seen.has(id)) main.push(id);
  for (const id of DEFAULT_LAYOUT.side) if (!seen.has(id)) side.push(id);
  return { main, side };
};
const sameLayout = (a, b) => a.main.join() === b.main.join() && a.side.join() === b.side.join();

// ── Grafik ───────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, metric }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="dsh-tip" role="status">
      <strong>{metric === "revenue" ? money(point.revenue) : `${number(point.orders)} sipariş`}</strong>
      <span>{point.label} · {metric === "revenue" ? `${number(point.orders)} sipariş` : money(point.revenue)}</span>
    </div>
  );
};
const SalesChart = ({ data, metric }) => {
  const axisProps = { tick: { fill: "var(--ui-text-3)", fontSize: 11 }, axisLine: false, tickLine: false };
  const yFormat = (value) => (metric === "revenue" ? axisMoney(value) : number(value));
  const interval = data.length > 16 ? Math.ceil(data.length / 8) - 1 : 0;
  // recharts çocukları tek tek okur; Fragment yerine anahtarlı dizi
  const shared = [
    <CartesianGrid key="grid" vertical={false} stroke="var(--ui-line)" strokeDasharray="2 4" />,
    <XAxis key="x" dataKey="label" {...axisProps} interval={interval} minTickGap={16} tickMargin={6} />,
    <YAxis key="y" {...axisProps} width={52} tickFormatter={yFormat} allowDecimals={false} />,
    <Tooltip key="tip" content={<ChartTip metric={metric} />} cursor={metric === "revenue" ? { stroke: "var(--ui-line-strong)" } : { fill: "var(--ui-surface-3)" }} />,
  ];
  return (
    <div className="dsh-chart">
      <ResponsiveContainer width="100%" height="100%">
        {metric === "revenue" ? (
          <AreaChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dsh-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ui-brand)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--ui-brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {shared}
            <Area type="monotone" dataKey="revenue" stroke="var(--ui-brand)" strokeWidth={2} fill="url(#dsh-area)" dot={data.length <= 2}
              activeDot={{ r: 4, stroke: "var(--ui-surface)", strokeWidth: 2, fill: "var(--ui-brand)" }} isAnimationActive={false} />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 0 }} barCategoryGap="28%">
            {shared}
            <Bar dataKey="orders" fill="var(--ui-brand)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

// ── Kâr tahmini (eski "Yeni faaliyet yılı" kartı; seçili dönemi izler) ───
const ProfitCard = ({ summary, period, unavailable }) => {
  const [margin, setMargin] = usePref("profitMargin", 10);
  const revenue = summary?.totals.revenue || 0;
  const manual = summary?.manualRevenue || 0;
  const base = Math.max(0, revenue - manual);
  const rate = Math.max(0, Math.min(100, Number(margin) || 0));
  return (
    <section className="ui-panel dsh-panel" aria-label="Kâr tahmini">
      <div className="ui-panel-head">
        <div>
          <h2>Kâr tahmini</h2>
          <p>{period.description} · manuel eklemeler hariç</p>
        </div>
        <label className="dsh-margin" title="Kâr marjı">
          <Percent />
          <input type="number" aria-label="Kâr marjı (yüzde)" value={margin} min="0" max="100" step="0.5"
            onChange={(event) => setMargin(Math.max(0, Math.min(100, parseFloat(event.target.value) || 0)))} />
        </label>
      </div>
      {unavailable ? <div className="ui-panel-body">{unavailable}</div> : <dl className="dsh-figures">
        <div className="dsh-figure--lead">
          <dt>Tahmini net kâr</dt>
          <dd>{money(base * (rate / 100))}</dd>
          <small>{percent(rate)} marj ile</small>
        </div>
        <div><dt>Dönem cirosu</dt><dd>{money(revenue)}</dd></div>
        <div><dt>Kâr hesabına esas</dt><dd>{money(base)}</dd></div>
        <div><dt>Manuel eklemeler</dt><dd>{money(manual)}</dd></div>
      </dl>}
    </section>
  );
};

// ── İskelet ──────────────────────────────────────────────────────────────
const DashboardSkeleton = () => (
  <div className="ui-page dsh-page" role="status" aria-label="Genel bakış yükleniyor">
    <div className="dsh-skel-head"><Skeleton width={180} height={26} /><Skeleton width={320} height={14} /></div>
    <Skeleton height={36} width={420} radius={8} />
    <Skeleton height={64} radius={10} />
    <div className="dsh-skel-kpis">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={92} radius={10} />)}</div>
    <div className="dsh-columns">
      <div className="dsh-column"><Skeleton height={320} radius={10} /><div className="ui-panel"><SkeletonRows rows={4} /></div></div>
      <div className="dsh-column"><Skeleton height={220} radius={10} /><div className="ui-panel"><SkeletonRows rows={5} avatar={false} /></div></div>
    </div>
  </div>
);

// ── Ana bileşen ──────────────────────────────────────────────────────────
const DashboardWidgets = ({ onNavigate }) => {
  const [periodValue, setPeriodValue] = usePref("dsh-period", "today");
  const period = findPeriod(periodValue);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [metric, setMetric] = usePref("dsh-metric", "revenue");
  const [savedLayout, setSavedLayout] = usePref("dsh-layout-v1", DEFAULT_LAYOUT);
  const layout = useMemo(() => normalizeLayout(savedLayout), [savedLayout]);
  const now = useNow(30000);
  const requestRef = useRef(0);
  const loadRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestRef.current;
    if (!silent) setRefreshing(true);
    try {
      const { data } = await axios.get("/orders-analytics/summary", { params: periodParams(periodValue) });
      if (id !== requestRef.current) return;
      setSummary(data.summary);
      setError(null);
    } catch (err) {
      if (id !== requestRef.current) return;
      setError(err?.response?.data?.message || "Özet alınamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      if (id === requestRef.current) { setLoading(false); setRefreshing(false); setSwitching(false); }
    }
  }, [periodValue]);
  loadRef.current = load;

  useEffect(() => { load(); }, [load]);
  // Canlı yenileme: 30 sn'de bir (sekme görünürken) ve yeni sipariş / durum değişikliği olayında
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") loadRef.current({ silent: true }); }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return undefined;
    let timer;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => loadRef.current({ silent: true }), 700); };
    socket.on("newOrder", bump);
    socket.on("orderStatusUpdated", bump);
    return () => { clearTimeout(timer); socket.off("newOrder", bump); socket.off("orderStatusUpdated", bump); };
  }, []);

  const changePeriod = (value) => { if (value === periodValue) return; setSwitching(true); setPeriodValue(value); };
  const openOrders = (preset) => onNavigate?.("orders", preset);
  const openOrder = (order) => { setHandoff(HANDOFF.order, String(order.orderId)); onNavigate?.("orders"); };
  const openProduct = (product) => { if (product.productId) setHandoff(HANDOFF.product, product.productId); onNavigate?.("products"); };

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const next = { main: [...layout.main], side: [...layout.side] };
    const [moved] = next[source.droppableId].splice(source.index, 1);
    next[destination.droppableId].splice(destination.index, 0, moved);
    setSavedLayout(next);
  };
  const customLayout = !sameLayout(layout, DEFAULT_LAYOUT);

  const chartData = useMemo(() => (summary?.series || []).map((point) => ({ ...point, label: bucketLabel(point.key, summary.range.bucket) })), [summary]);

  if (loading) return <DashboardSkeleton />;

  const totals = summary?.totals || { orders: 0, cancelled: 0, completed: 0, revenue: 0, averageBasket: 0, cancelRate: 0 };
  const delta = summary?.delta || null;
  const previous = summary?.previous || null;
  const attention = summary?.attention || {};
  const customers = summary?.customers || {};
  const statusRows = (summary?.statusDistribution || []).filter((row) => row.count > 0);
  const statusTotal = statusRows.reduce((sum, row) => sum + row.count, 0);
  const dormRows = summary?.dormDistribution || [];
  const dormMax = Math.max(1, ...dormRows.map((row) => row.orders));
  const topProducts = summary?.topProducts || [];
  const topMax = Math.max(1, ...topProducts.map((product) => product.quantity));
  const recentOrders = summary?.recentOrders || [];
  const chartTotal = metric === "revenue" ? totals.revenue : totals.completed;
  const chartPrevious = previous ? (metric === "revenue" ? previous.revenue : previous.completed) : null;
  const chartDelta = delta ? (metric === "revenue" ? delta.revenue : delta.orders) : null;

  // Delta varsa "düne göre", yoksa önceki dönemin değeri, karşılaştırma yoksa açıklama
  const compareNote = (value, previousText, fallback) => (value !== null && value !== undefined ? period.compare : previousText ? `önceki dönem ${previousText}` : fallback);
  const attentionItems = [
    { id: "delayed", icon: Clock, count: attention.delayedOrders, label: "Geciken sipariş", hint: "20 dk'dan uzun süredir hazırlanıyor", tone: attention.delayedOrders > 0 ? "danger" : null, onClick: () => openOrders("delayed") },
    { id: "active", icon: Truck, count: attention.activeOrders, label: "Aktif sipariş", hint: "Hazırlanıyor veya yolda", tone: attention.activeOrders > 0 ? "info" : null, onClick: () => openOrders() },
    { id: "support", icon: Headphones, count: attention.waitingSupport, label: "Bekleyen destek", hint: "Canlı destek sırasında", tone: attention.waitingSupport > 0 ? "warn" : null, onClick: () => onNavigate?.("support-queue") },
    { id: "stock", icon: PackageX, count: attention.productsOutOfStock, label: "Stoksuz ürün", hint: "Katalogda tükendi görünüyor", tone: attention.productsOutOfStock > 0 ? "warn" : null, onClick: () => onNavigate?.("products") },
    { id: "image", icon: ImageOff, count: attention.productsWithoutImage, label: "Görselsiz ürün", hint: "Görsel eklenince vitrine çıkar", tone: attention.productsWithoutImage > 0 ? "warn" : null, onClick: () => onNavigate?.("products") },
  ].filter((item) => item.count !== null && item.count !== undefined);
  const pendingWork = attentionItems.filter((item) => item.id !== "active" && item.count > 0).length;

  // Özet hiç alınamadıysa veri kartları boş durum yerine bunu gösterir
  const unavailable = !summary ? (
    <EmptyState compact icon={AlertTriangle} title="Veri alınamadı" description="Özet sunucudan alınamadı."
      action={<button type="button" className="ui-btn ui-btn--sm" onClick={() => load()} disabled={refreshing}>Tekrar dene</button>} />
  ) : null;

  // ── Kartlar ────────────────────────────────────────────────────────────
  const cards = {
    sales: () => (
      <section className="ui-panel dsh-panel" aria-label="Satış grafiği">
        <div className="ui-panel-head">
          <div>
            <h2>Satış</h2>
            <p>{period.description} · iptaller hariç</p>
          </div>
          <Segmented size="sm" ariaLabel="Grafik ölçümü" value={metric} onChange={setMetric}
            options={[{ value: "revenue", label: "Ciro" }, { value: "orders", label: "Sipariş" }]} />
        </div>
        <div className="ui-panel-body dsh-sales-body">
          {summary && <div className="dsh-sales-total">
            <strong>{metric === "revenue" ? money(chartTotal) : `${number(chartTotal)} sipariş`}</strong>
            {chartPrevious !== null && (
              <span>
                {chartDelta !== null && (
                  <b className="ui-kpi-delta" data-dir={chartDelta > 0 ? "up" : chartDelta < 0 ? "down" : "flat"}>
                    {chartDelta > 0 ? "▲" : chartDelta < 0 ? "▼" : "•"} {Math.abs(chartDelta).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}%
                  </b>
                )}
                {period.compare} · önceki dönem {metric === "revenue" ? money(chartPrevious) : number(chartPrevious)}
              </span>
            )}
          </div>}
          {unavailable || (totals.completed > 0 ? (
            <SalesChart data={chartData} metric={metric} />
          ) : (
            <EmptyState compact icon={BarChart3} title="Bu dönemde satış yok"
              description="Satışlar geldikçe grafik burada oluşur."
              action={periodValue !== "30d" && <button type="button" className="ui-btn ui-btn--sm" onClick={() => changePeriod("30d")}>Son 30 günü göster</button>} />
          ))}
        </div>
        <button type="button" className="ui-panel-link" onClick={() => onNavigate?.("analytics")}>
          Detaylı satış analizini aç <ArrowUpRight />
        </button>
      </section>
    ),
    recent: () => (
      <section className="ui-panel dsh-panel" aria-label="Son siparişler">
        <div className="ui-panel-head">
          <div>
            <h2>Son siparişler</h2>
            <p>En yeni 8 sipariş · dönemden bağımsız</p>
          </div>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => openOrders()}>Tüm siparişler <ArrowRight /></button>
        </div>
        {unavailable || (recentOrders.length > 0 ? (
          <ul className="dsh-list">
            {recentOrders.map((order) => {
              const waiting = preparingMinutes(order, now);
              return (
                <li key={order.orderId}>
                  <button type="button" className="dsh-row dsh-row--order" onClick={() => openOrder(order)} aria-label={`${order.customerName} siparişini aç`}>
                    <span className="ui-avatar dsh-avatar">{initials(order.customerName)}</span>
                    <span className="dsh-row-main">
                      <strong className="ui-truncate">{order.customerName}</strong>
                      <small className="ui-truncate">
                        {shortId(order.orderId)} · {number(order.itemCount)} ürün · {order.deliveryPointName || DORM_NAMES[order.deliveryPoint] || "—"}
                      </small>
                    </span>
                    <span className="dsh-row-amount">{money(order.totalAmount)}</span>
                    <span className={`ui-badge ui-badge--${STATUS_TONES[order.status] || "info"}`}>{order.status}</span>
                    <span className="dsh-row-time" data-tone={waiting >= 20 ? "danger" : undefined} title={new Date(order.createdAt).toLocaleString("tr-TR")}>
                      {waiting >= 20 ? <><Clock /> {waiting} dk</> : timeAgo(order.createdAt, now)}
                    </span>
                    <ChevronRight className="dsh-row-chevron" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon={ShoppingBag} title="Henüz sipariş yok" description="Yeni siparişler geldiğinde burada listelenir." />
        ))}
      </section>
    ),
    status: () => (
      <section className="ui-panel dsh-panel" aria-label="Sipariş dağılımı">
        <div className="ui-panel-head">
          <div>
            <h2>Sipariş dağılımı</h2>
            <p>{period.description} · {number(totals.orders)} sipariş</p>
          </div>
        </div>
        {unavailable ? <div className="ui-panel-body">{unavailable}</div> : <div className="ui-panel-body dsh-dist">
          {statusTotal > 0 ? (
            <>
              <div className="dsh-stack" role="img" aria-label={statusRows.map((row) => `${row.status}: ${row.count}`).join(", ")}>
                {statusRows.map((row) => <i key={row.status} data-tone={STATUS_TONES[row.status]} style={{ flexGrow: row.count }} />)}
              </div>
              <ul className="dsh-legend">
                {statusRows.map((row) => (
                  <li key={row.status}>
                    <i className={`ui-dot ui-dot--${STATUS_TONES[row.status]}`} />
                    <span>{row.status}</span>
                    <strong>{number(row.count)}</strong>
                    <small>{percent((row.count / statusTotal) * 100)}</small>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="ui-muted ui-text-sm dsh-note">Bu dönemde sipariş yok.</p>
          )}
          <h3 className="dsh-subhead">Yurda göre</h3>
          {dormRows.length > 0 ? (
            <ul className="dsh-meters">
              {dormRows.map((row) => (
                <li key={row.deliveryPoint}>
                  <span className="dsh-meter-label">{DORM_NAMES[row.deliveryPoint] || row.deliveryPoint}</span>
                  <span className="dsh-meter"><i style={{ width: `${(row.orders / dormMax) * 100}%` }} /></span>
                  <span className="dsh-meter-value">{number(row.orders)} sipariş · {compactMoney(row.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-muted ui-text-sm dsh-note">Teslimat verisi yok.</p>
          )}
        </div>}
      </section>
    ),
    top: () => (
      <section className="ui-panel dsh-panel" aria-label="Çok satanlar">
        <div className="ui-panel-head">
          <div>
            <h2>Çok satanlar</h2>
            <p>{period.description} · adede göre ilk 5</p>
          </div>
        </div>
        {unavailable || (topProducts.length > 0 ? (
          <ol className="dsh-list">
            {topProducts.map((product, index) => (
              <li key={product.productId || product.name}>
                <button type="button" className="dsh-row dsh-row--product" onClick={() => openProduct(product)} aria-label={`${product.name} ürününü aç`}>
                  <span className="dsh-rank">{index + 1}</span>
                  <span className="dsh-row-main">
                    <strong className="ui-truncate">{product.name}</strong>
                    <span className="dsh-meter"><i style={{ width: `${(product.quantity / topMax) * 100}%` }} /></span>
                  </span>
                  <span className="dsh-row-qty">{number(product.quantity)} adet</span>
                  <span className="dsh-row-amount">{money(product.revenue)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState compact icon={Package} title="Henüz satış yok" description="Satışlarla birlikte çok satanlar burada oluşur." />
        ))}
      </section>
    ),
    quick: () => (
      <section className="ui-panel dsh-panel" aria-label="Hızlı eylemler">
        <div className="ui-panel-head">
          <div>
            <h2>Hızlı eylemler</h2>
            <p>Sık yapılan işler</p>
          </div>
        </div>
        <div className="dsh-quick">
          <button type="button" onClick={() => onNavigate?.("create")}><Plus /><span>Yeni ürün</span></button>
          <button type="button" onClick={() => onNavigate?.("push")}><Bell /><span>Bildirim gönder</span></button>
          <button type="button" onClick={() => onNavigate?.("products")}><Zap /><span>Flash sale</span></button>
          <button type="button" onClick={() => onNavigate?.("coupons")}><Tag /><span>Kupon</span></button>
          <button type="button" onClick={() => onNavigate?.("weekly-products")}><CalendarDays /><span>Haftalık fırsat</span></button>
          <button type="button" onClick={() => onNavigate?.("users")}><Users /><span>Müşteriler</span></button>
        </div>
      </section>
    ),
    profit: () => <ProfitCard summary={summary} period={period} unavailable={unavailable} />,
    telegram: () => <TelegramNotificationsCard />,
    alarm: () => <OrderAlarmDevicesCard />,
    shelf: () => <ShelfPerformanceCard />,
  };

  const renderColumn = (droppableId) => (
    <Droppable droppableId={droppableId}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.droppableProps} className="dsh-column" data-over={snapshot.isDraggingOver || undefined}>
          {layout[droppableId].map((id, index) => (
            <Draggable key={id} draggableId={id} index={index}>
              {(drag, state) => (
                <div ref={drag.innerRef} {...drag.draggableProps} className="dsh-card" data-dragging={state.isDragging || undefined}>
                  {/* Tutamaç <button> olamaz: kütüphane etkileşimli öğelerde sürüklemeyi başlatmaz (rol/tabIndex dragHandleProps'tan gelir) */}
                  <span className="dsh-grip" {...drag.dragHandleProps} aria-label={`${CARD_TITLES[id]} kartını taşı`} title="Sürükleyerek taşı">
                    <GripVertical />
                  </span>
                  {cards[id]()}
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  return (
    <div className="ui-page dsh-page" aria-busy={switching || undefined}>
      <PageHeader
        title="Genel bakış"
        description={`${new Date(now).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })}${summary ? ` · Güncellendi ${formatTime(summary.generatedAt)}` : ""}`}
        meta={pendingWork > 0 ? <span className="ui-badge ui-badge--warn">{pendingWork} bekleyen iş</span> : undefined}
        actions={(
          <>
            <button type="button" className="ui-btn" onClick={() => load()} disabled={refreshing} aria-label="Özeti yenile">
              <RefreshCw className={refreshing ? "ui-spin" : ""} /> Yenile
            </button>
            <button type="button" className="ui-btn" onClick={() => openOrders()}>Siparişler <ArrowRight /></button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => onNavigate?.("create")}><Plus /> Ürün ekle</button>
          </>
        )}
      />

      {error && (
        <div className="ui-banner ui-banner--danger dsh-banner" role="alert">
          <AlertTriangle />
          <span>{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()} disabled={refreshing}>Tekrar dene</button>
        </div>
      )}

      <div className="dsh-toolbar">
        <div className="dsh-periods">
          <Segmented ariaLabel="Dönem" value={QUICK_PERIODS.some((p) => p.value === periodValue) ? periodValue : "__extra"} onChange={changePeriod} options={QUICK_PERIODS} />
          <select className="ui-field ui-field--auto ui-field--sm" aria-label="Faaliyet dönemi"
            value={periodValue.startsWith("rp:") ? periodValue : ""} onChange={(event) => event.target.value && changePeriod(event.target.value)}>
            <option value="">Faaliyet dönemi…</option>
            {EXTRA_PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="dsh-toolbar-end">
          {switching && <span className="ui-muted ui-text-xs dsh-switching"><RefreshCw className="ui-spin" /> Hesaplanıyor…</span>}
          {customLayout && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setSavedLayout(DEFAULT_LAYOUT)}>
              <RotateCcw /> Düzeni sıfırla
            </button>
          )}
        </div>
      </div>

      {summary && (
        <>
          <section className="dsh-attn" aria-label="Dikkat gerektirenler">
            {pendingWork === 0 && (
              <div className="dsh-attn-ok"><CheckCircle2 /><span>Bekleyen iş yok · her şey yolunda</span></div>
            )}
            {attentionItems.map((item) => (
              <button key={item.id} type="button" className="dsh-attn-item" data-tone={item.tone || undefined} onClick={item.onClick}>
                <item.icon />
                <b>{number(item.count)}</b>
                <span><strong>{item.label}</strong><small title={item.hint}>{item.hint}</small></span>
                <ChevronRight />
              </button>
            ))}
          </section>

          <KpiGrid columns={5} className="dsh-kpis">
            <KpiCard icon={TrendingUp} tone="brand" label="Ciro" value={money(totals.revenue)}
              delta={delta?.revenue ?? undefined} note={compareNote(delta?.revenue, previous && money(previous.revenue), "iptaller hariç")} />
            <KpiCard icon={ShoppingBag} label="Sipariş" value={number(totals.orders)}
              delta={delta?.orders ?? undefined} note={totals.cancelled ? `${number(totals.cancelled)} iptal` : compareNote(delta?.orders, previous && number(previous.orders), "tüm siparişler")} />
            <KpiCard icon={LayoutGrid} label="Ortalama sepet" value={money(totals.averageBasket)}
              delta={delta?.averageBasket ?? undefined} note={compareNote(delta?.averageBasket, previous && money(previous.averageBasket), "sipariş başına")} />
            <KpiCard icon={PackageX} tone={totals.cancelRate >= 10 ? "danger" : totals.cancelRate > 0 ? "warn" : "ok"} label="İptal oranı" value={percent(totals.cancelRate)}
              note={previous ? `önceki dönem ${percent(previous.cancelRate)}` : `${number(totals.cancelled)} iptal`} />
            <KpiCard icon={Users} tone="info" label="Müşteri" value={number(customers.total)}
              note={customers.new !== null && customers.new !== undefined ? `+${number(customers.new)} yeni kayıt` : "kayıtlı müşteri"} />
          </KpiGrid>
        </>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="dsh-columns">
          {renderColumn("main")}
          {renderColumn("side")}
        </div>
      </DragDropContext>
      <p className="dsh-foot ui-muted ui-text-xs">
        Kartları tutamacından sürükleyerek sıralayın; klavyede <kbd>Space</kbd> ile tutup <kbd>↑</kbd> <kbd>↓</kbd> ile taşıyın. Özet 30 saniyede bir ve her yeni siparişte yenilenir.
      </p>
    </div>
  );
};

export default DashboardWidgets;
