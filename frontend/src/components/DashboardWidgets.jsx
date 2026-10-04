import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShoppingBag,
  Package,
  Users,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Plus,
  RefreshCw,
  AlertTriangle,
  Clock,
  Truck,
  Tag,
  CalendarDays,
  MessageCircle,
} from "lucide-react";
import axios from "../lib/axios";
import TelegramNotificationsCard from "./TelegramNotificationsCard";
import { NEW_ACTIVITY_YEAR_START, REVENUE_PERIODS, summarizeRevenue } from "../lib/revenuePeriods";
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  });
const number = (value) => Number(value || 0).toLocaleString("tr-TR");
const isCurrentActivityOrder = (order) => {
  const orderDate = new Date(order.createdAt);
  return !Number.isNaN(orderDate.getTime()) && orderDate >= NEW_ACTIVITY_YEAR_START;
};

const DashboardWidgets = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrders: 0,
    salesTrend: [],
    popularProducts: [],
    unansweredChats: 0,
    liveOrderCount: 0,
    recentOrders: [],
    totalUsers: 0,
    statusDistribution: [],
    allOrders: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [chartMetric, setChartMetric] = useState("sales");
  const [revenuePeriodId, setRevenuePeriodId] = useState("current");
  const revenuePeriod = REVENUE_PERIODS.find((period) => period.id === revenuePeriodId);
  const periodSummary = useMemo(
    () => summarizeRevenue(stats.allOrders, revenuePeriod),
    [stats.allOrders, revenuePeriod],
  );
  const periodCancelled = useMemo(() => stats.allOrders.filter(order => {
    const date = new Date(order.createdAt).getTime();
    return order.status === "İptal Edildi" && (!revenuePeriod.start || date >= revenuePeriod.start.getTime()) && (!revenuePeriod.end || date < revenuePeriod.end.getTime());
  }), [stats.allOrders, revenuePeriod]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [chatsRes, ordersRes, usersRes] = await Promise.all([
        axios.get("/chat/list").catch(() => ({ data: { chats: [] } })),
        axios.get("/orders-analytics"),
        axios.get("/users"),
      ]);

      setError(false);
      const chats = chatsRes.data.chats || [];
      const orders = ordersRes.data.orderAnalyticsData?.usersOrders || [];
      const users = usersRes.data.users || [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allOrders = orders.flatMap((user) => user.orders || []);
      const todayOrders = allOrders.filter((order) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= today;
      });

      const todaySales = todayOrders.filter(o => o.status !== "İptal Edildi").reduce(
        (sum, order) => sum + (order.totalAmount || 0),
        0,
      );

      const recentOrders = allOrders
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map((order) => ({
          ...order,
          customerName:
            orders.find((u) =>
              u.orders?.some((o) => o.orderId === order.orderId),
            )?.user?.name || "Müşteri",
        }));

      // Status distribution
      const statusCounts = allOrders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      const statusDistribution = [
        {
          name: "Hazırlanıyor",
          value: statusCounts["Hazırlanıyor"] || 0,
          color: "#10b981",
        },
        { name: "Yolda", value: statusCounts["Yolda"] || 0, color: "#f59e0b" },
        {
          name: "Teslim Edildi",
          value: statusCounts["Teslim Edildi"] || 0,
          color: "#3b82f6",
        },
        {
          name: "İptal",
          value: statusCounts["İptal Edildi"] || 0,
          color: "#ef4444",
        },
      ].filter((s) => s.value > 0);

      // Popular products
      const productSales = {};
      allOrders.forEach((order) => {
        order.products?.forEach((product) => {
          const name = product.name;
          if (!productSales[name]) {
            productSales[name] = { name, quantity: 0, revenue: 0 };
          }
          productSales[name].quantity += product.quantity;
          productSales[name].revenue += (product.price || 0) * product.quantity;
        });
      });

      const popularProducts = Object.values(productSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      const salesTrend = getLast7DaysSales(allOrders);

      setStats({
        todaySales,
        todayOrders: todayOrders.length,
        salesTrend,
        popularProducts,
        unansweredChats: chats.filter(c => c.mode === "WAITING_FOR_AGENT").length,
        liveOrderCount: allOrders.filter((o) => o.status === "Hazırlanıyor" && isCurrentActivityOrder(o))
          .length,
        recentOrders,
        totalUsers: users.length,
        statusDistribution,
        allOrders,
      });
    } catch (error) {
      setError(true);
      console.error("Dashboard verileri yüklenirken hata:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    const interval = setInterval(() => {
      fetchLiveData();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const fetchLiveData = async () => {
    try {
      const res = await axios.get("/orders-analytics");
      const orders = res.data.orderAnalyticsData?.usersOrders || [];
      const allOrders = orders.flatMap((user) => user.orders || []);
      const liveCount = allOrders.filter(
        (o) => o.status === "Hazırlanıyor" && isCurrentActivityOrder(o),
      ).length;

      const recentOrders = allOrders
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map((order) => ({
          ...order,
          customerName:
            orders.find((u) =>
              u.orders?.some((o) => o.orderId === order.orderId),
            )?.user?.name || "Müşteri",
        }));

      setStats((prev) => ({
        ...prev,
        liveOrderCount: liveCount,
        recentOrders,
        allOrders,
      }));
    } catch (error) {
      console.error("Canlı veri güncellenirken hata:", error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getLast7DaysSales = (orders) => {
    const last7Days = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayOrders = orders.filter((order) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= date && orderDate < nextDate;
      });

        const daySales = dayOrders.filter(o => o.status !== "İptal Edildi").reduce(
        (sum, order) => sum + (order.totalAmount || 0),
        0,
      );

      last7Days.push({
        date: date.toLocaleDateString("tr-TR", { weekday: "short" }),
        sales: daySales,
        orders: dayOrders.length,
      });
    }

    return last7Days;
  };

  const operations = useMemo(() => {
    const activeOrders = stats.allOrders.filter((order) =>
      ["Hazırlanıyor", "Yolda"].includes(order.status) && isCurrentActivityOrder(order),
    );
    const delayedOrders = stats.allOrders.filter(
      (order) =>
        order.status === "Hazırlanıyor" && isCurrentActivityOrder(order) &&
        (Date.now() - new Date(order.createdAt).getTime()) / 60000 >= 20,
    );
    const paidTodayCount = stats.allOrders.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString() && o.status !== "İptal Edildi").length;
    const averageBasket = paidTodayCount
      ? stats.todaySales / paidTodayCount
      : 0;

    return { activeOrders, delayedOrders, averageBasket };
  }, [stats.allOrders, stats.todayOrders, stats.todaySales]);

  if (loading)
    return (
      <div className="dash" aria-label="Mağaza özeti yükleniyor" role="status">
        <div className="ui-skeleton" style={{ height: 44, width: 280 }} />
        <div className="ui-skeleton" style={{ height: 84 }} />
        <div className="dash-grid">
          <div className="ui-skeleton dash-sales" style={{ height: 320 }} />
          <div className="ui-skeleton dash-attn" style={{ height: 320 }} />
        </div>
      </div>
    );

  // ── Sunum yardımcıları (yalnızca görünüm) ───────────────────────────
  const chartMax = Math.max(0, ...stats.salesTrend.map((day) => day[chartMetric]));
  const chartTotal = stats.salesTrend.reduce((sum, day) => sum + day[chartMetric], 0);
  const formatMetric = (value) => (chartMetric === "sales" ? money(value) : number(value));
  const statusTones = { "Hazırlanıyor": "warn", "Yolda": "info", "Teslim Edildi": "ok", "İptal": "danger", "İptal Edildi": "danger" };
  const distributionTotal = stats.statusDistribution.reduce((sum, status) => sum + status.value, 0);
  const topQuantity = Math.max(1, ...stats.popularProducts.map((product) => product.quantity));

  return (
    <div className="dash">
      <header className="app-pagehead">
        <div>
          <h1>Genel bakış</h1>
          <p>
            {new Date().toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · Bugün {number(stats.todayOrders)} sipariş alındı
          </p>
        </div>
        <div className="app-pagehead-actions">
          <button
            className="ui-btn"
            aria-label="Satış verilerini yenile"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "ui-spin" : ""} />
            Yenile
          </button>
          <button className="ui-btn" onClick={() => onNavigate?.("orders")}>
            Siparişleri yönet <ArrowRight />
          </button>
          <button
            className="ui-btn ui-btn--primary"
            onClick={() => onNavigate?.("create")}
          >
            <Plus /> Ürün ekle
          </button>
        </div>
      </header>

      {error && (
        <div className="ui-banner ui-banner--danger dash-error" role="alert">
          <AlertTriangle />
          <span>
            Veriler güncellenemedi. Bağlantınızı kontrol ederek tekrar deneyin.
          </span>
          <button className="ui-btn ui-btn--sm" onClick={handleRefresh} disabled={refreshing}>
            Yeniden dene
          </button>
        </div>
      )}

      {/* Bugünün özeti: tek şerit, kart yok */}
      <section className="ui-metrics" aria-label="Bugünün özeti">
        {[
          {
            label: "Bugünkü net satış",
            value: money(stats.todaySales),
            note: `${number(stats.todayOrders)} sipariş alındı`,
          },
          {
            label: "Hazırlanacak sipariş",
            value: number(stats.liveOrderCount),
            note: "Hazırlanmayı bekleyen siparişler",
            tone: "warn",
          },
          {
            label: "Aktif sipariş",
            value: number(operations.activeOrders.length),
            note: "Hazırlanıyor veya yolda",
            tone: "info",
          },
          {
            label: "Bugünkü ortalama sepet",
            value: money(operations.averageBasket),
            note: "İptaller hariç",
          },
          {
            label: "Toplam müşteri",
            value: number(stats.totalUsers),
            note: "Kayıtlı müşteri",
          },
        ].map(({ label, value, note, tone }) => (
          <div key={label} className="ui-metric">
            <span className="ui-metric-label">
              {tone && <i className={`ui-dot ui-dot--${tone}`} />}
              {label}
            </span>
            <strong className="ui-metric-value">{value}</strong>
            <span className="ui-metric-note">{note}</span>
          </div>
        ))}
      </section>

      <div className="dash-grid">
        {/* Satış grafiği */}
        <section className="ui-panel dash-sales">
          <div className="ui-panel-head">
            <div>
              <h2>Satış performansı</h2>
              <p>Son 7 gün</p>
            </div>
            <div className="ui-segmented" aria-label="Grafik ölçümü">
              <button
                aria-pressed={chartMetric === "sales"}
                onClick={() => setChartMetric("sales")}
              >
                Satış
              </button>
              <button
                aria-pressed={chartMetric === "orders"}
                onClick={() => setChartMetric("orders")}
              >
                Sipariş
              </button>
            </div>
          </div>
          <div className="ui-panel-body">
            <p className="dash-sales-total">
              <strong>{formatMetric(chartTotal)}</strong>
              <span>
                {chartMetric === "sales"
                  ? "Haftalık satış toplamı"
                  : "Haftalık sipariş toplamı"}
              </span>
            </p>
            <div className="ui-chart dash-chart">
              <div className="ui-chart-axis">
                <span>{formatMetric(chartMax)}</span>
                <span>{formatMetric(chartMax / 2)}</span>
                <span>{formatMetric(0)}</span>
              </div>
              <div className="ui-bars">
                {stats.salesTrend.map((day, index) => (
                  <div key={`${day.date}-${index}`} className="ui-bar-col" tabIndex={0}>
                    <div className="ui-bar-track">
                      <div
                        className="ui-bar"
                        data-empty={day[chartMetric] > 0 ? undefined : "true"}
                        style={{ height: `${chartMax > 0 ? (day[chartMetric] / chartMax) * 100 : 0}%` }}
                      />
                      <div className="ui-bar-tip">
                        <strong>{formatMetric(day[chartMetric])}</strong>
                        <span>
                          {day.date} · {chartMetric === "sales" ? `${number(day.orders)} sipariş` : money(day.sales)}
                        </span>
                      </div>
                    </div>
                    <span className="ui-bar-label">{day.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button
            className="ui-panel-link"
            onClick={() => onNavigate?.("analytics")}
          >
            Detaylı satış analizini incele <ArrowUpRight />
          </button>
        </section>

        {/* Dikkat gerektiren işler */}
        <section className="ui-panel dash-attn">
          <div className="ui-panel-head">
            <div>
              <h2>Dikkat gerektirenler</h2>
              <p>Öncelikli işleriniz</p>
            </div>
          </div>
          <div className="dash-actions">
            <button
              className="dash-action"
              data-tone={operations.delayedOrders.length > 0 ? "danger" : undefined}
              onClick={() => onNavigate?.("orders", "delayed")}
            >
              <Clock />
              <span>
                <strong>Geciken sipariş</strong>
                <small>20 dakikadan uzun süredir bekliyor</small>
              </span>
              <b>{operations.delayedOrders.length}</b>
              <ChevronRight />
            </button>
            <button
              className="dash-action"
              data-tone={stats.unansweredChats > 0 ? "warn" : undefined}
              onClick={() => onNavigate?.("support-queue")}
            >
              <MessageCircle />
              <span>
                <strong>Yanıt bekleyen mesaj</strong>
                <small>Destek kuyruğunu aç</small>
              </span>
              <b>{stats.unansweredChats}</b>
              <ChevronRight />
            </button>
            <button
              className="dash-action"
              onClick={() => onNavigate?.("orders", "active")}
            >
              <Truck />
              <span>
                <strong>Aktif sipariş</strong>
                <small>Hazırlanıyor veya yolda</small>
              </span>
              <b>{operations.activeOrders.length}</b>
              <ChevronRight />
            </button>
          </div>
          <div className="dash-distribution">
            <div className="ui-between">
              <h3 className="ui-overline">Sipariş dağılımı</h3>
              <span className="ui-text-xs ui-muted ui-num">{number(distributionTotal)} sipariş</span>
            </div>
            {stats.statusDistribution.length > 0 ? (
              <>
                <div className="dash-stack" role="img" aria-label="Sipariş durumlarının dağılımı">
                  {stats.statusDistribution.map((status) => (
                    <i
                      key={status.name}
                      data-tone={statusTones[status.name]}
                      style={{ flexGrow: status.value }}
                      title={`${status.name}: ${number(status.value)}`}
                    />
                  ))}
                </div>
                <ul className="dash-legend">
                  {stats.statusDistribution.map((status) => (
                    <li key={status.name}>
                      <i className={`ui-dot ui-dot--${statusTones[status.name]}`} />
                      {status.name}
                      <strong>{number(status.value)}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="ui-text-sm ui-muted">Henüz sipariş yok</p>
            )}
          </div>
        </section>

        {/* Dönem özeti */}
        <section className="ui-panel dash-period">
          <div className="ui-panel-head">
            <div>
              <h2>Dönem özeti</h2>
              <p>{revenuePeriod.description}</p>
            </div>
            <select
              aria-label="Ciro dönemi"
              className="ui-field ui-field--auto ui-field--sm"
              value={revenuePeriodId}
              onChange={(event) => setRevenuePeriodId(event.target.value)}
            >
              {REVENUE_PERIODS.map((period) => (
                <option key={period.id} value={period.id}>{period.label}</option>
              ))}
            </select>
          </div>
          <dl className="dash-figures" aria-live="polite">
            <div className="dash-figure--lead">
              <dt>Gerçekleşen ciro</dt>
              <dd>{money(periodSummary.revenue)}</dd>
              <small>
                {number(periodSummary.count)} sipariş · İptaller hariç
                {periodSummary.count === 0 && " · Henüz satış yok"}
              </small>
            </div>
            <div>
              <dt>Dönem siparişleri</dt>
              <dd>{number(periodSummary.count)}</dd>
            </div>
            <div>
              <dt>Dönem ortalama sepet</dt>
              <dd>{money(periodSummary.count ? periodSummary.revenue / periodSummary.count : 0)}</dd>
            </div>
            <div>
              <dt>Dönem iptal tutarı</dt>
              <dd>{money(periodCancelled.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0))}</dd>
              <small>{periodCancelled.length} iptal edilen sipariş</small>
            </div>
          </dl>
        </section>

        {/* Son siparişler */}
        <section className="ui-panel dash-recent">
          <div className="ui-panel-head">
            <div>
              <h2>Son siparişler</h2>
              <p>Mağazanızdaki en yeni hareketler</p>
            </div>
            <button
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={() => onNavigate?.("orders")}
            >
              Tüm siparişler <ArrowRight />
            </button>
          </div>
          <div className="dash-rows">
            {stats.recentOrders.map((order, i) => (
              <button
                key={order.orderId || order._id || i}
                className="dash-row dash-row--order"
                aria-label={`${order.customerName} siparişlerini görüntüle`}
                onClick={() => onNavigate?.("orders")}
              >
                <span className="dash-row-main">
                  <strong>{order.customerName}</strong>
                  <small>
                    #
                    {String(order.orderId || order._id || "")
                      .slice(-6)
                      .toUpperCase()}
                  </small>
                </span>
                <span className="dash-row-time">
                  {new Date(order.createdAt).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  {new Date(order.createdAt).toLocaleTimeString("tr-TR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className={`ui-badge ui-badge--${order.status === "Teslim Edildi" ? "ok" : order.status === "Yolda" ? "info" : order.status === "İptal Edildi" ? "danger" : "warn"}`}
                >
                  {order.status}
                </span>
                <span className="dash-row-amount">{money(order.totalAmount)}</span>
              </button>
            ))}
            {stats.recentOrders.length === 0 && (
              <div className="ui-empty">
                <ShoppingBag />
                <strong>İlk sipariş için hazırız</strong>
                <p>Yeni siparişler geldiğinde burada listelenecek.</p>
              </div>
            )}
          </div>
        </section>

        {/* En çok satanlar */}
        <section className="ui-panel dash-top">
          <div className="ui-panel-head">
            <div>
              <h2>En çok tercih edilenler</h2>
              <p>Satış adedine göre ilk 5 ürün</p>
            </div>
          </div>
          <div className="dash-rows">
            {stats.popularProducts.map((product, i) => (
              <button
                key={product.name}
                className="dash-row dash-row--product"
                onClick={() => onNavigate?.("products")}
              >
                <span className="dash-rank">{i + 1}</span>
                <span className="dash-row-main">
                  <strong>{product.name}</strong>
                  <span className="dash-meter">
                    <i style={{ width: `${(product.quantity / topQuantity) * 100}%` }} />
                  </span>
                </span>
                <span className="dash-row-time">{product.quantity} adet</span>
                <span className="dash-row-amount">{money(product.revenue)}</span>
              </button>
            ))}
            {stats.popularProducts.length === 0 && (
              <div className="ui-empty">
                <Package />
                <p>Satışlarla birlikte popüler ürünler burada oluşacak.</p>
              </div>
            )}
          </div>
        </section>

        {/* Günlük aksiyonlar */}
        <section className="ui-panel dash-quick">
          <div className="ui-panel-head">
            <div>
              <h2>Hızlı işlemler</h2>
              <p>Sık kullanılan bölümler</p>
            </div>
          </div>
          <div className="dash-links">
            <button onClick={() => onNavigate?.("coupons")}>
              <Tag /> Kupon yönetimi <ChevronRight />
            </button>
            <button onClick={() => onNavigate?.("weekly-products")}>
              <CalendarDays /> Haftalık fırsatlar <ChevronRight />
            </button>
            <button onClick={() => onNavigate?.("users")}>
              <Users /> Müşteriler <ChevronRight />
            </button>
            <button onClick={() => onNavigate?.("products")}>
              <Package /> Ürünleri incele <ChevronRight />
            </button>
          </div>
        </section>

        <TelegramNotificationsCard />
      </div>
    </div>
  );
};
export default DashboardWidgets;
