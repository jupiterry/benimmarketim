import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Package,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowRight,
  Plus,
  RefreshCw,
  AlertTriangle,
  Clock,
  Truck,
  Calculator,
  Percent,
  Tag,
  CalendarDays,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import axios from "../lib/axios";
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  });
const number = (value) => Number(value || 0).toLocaleString("tr-TR");

const PREVIOUS_ACTIVITY_START = new Date("2025-09-01T00:00:00+03:00");
const PREVIOUS_ACTIVITY_END = new Date("2026-08-01T00:00:00+03:00");
const NEW_ACTIVITY_YEAR_START = new Date("2026-09-06T00:00:00+03:00");

const ProfitMarginCard = ({ allOrders }) => {
  const [profitMargin, setProfitMargin] = useState(() => {
    const saved = localStorage.getItem("profitMargin");
    return saved ? parseFloat(saved) : 10;
  });

  // Calculate totals
  const totals = useMemo(() => {
    let totalWithManual = 0;
    let manualProductsTotal = 0;

    allOrders.forEach((order) => {
      const orderDate = new Date(order.createdAt);

      if (
        Number.isNaN(orderDate.getTime()) ||
        orderDate < NEW_ACTIVITY_YEAR_START
      ) {
        return;
      }

      // İptal edilen siparişleri hariç tut (gerçek satış değil)
      if (order.status !== "İptal Edildi") {
        totalWithManual += order.totalAmount || 0;

        // Manuel ürünlerin tutarını hesapla
        order.products?.forEach((product) => {
          if (product.isManual) {
            manualProductsTotal +=
              (product.price || 0) * (product.quantity || 1);
          }
        });
      }
    });

    return {
      totalWithManual,
      totalWithoutManual: totalWithManual - manualProductsTotal,
      manualProductsTotal,
    };
  }, [allOrders]);

  const estimatedProfit = totals.totalWithoutManual * (profitMargin / 100);

  const handleMarginChange = (value) => {
    const numValue = Math.max(0, Math.min(100, parseFloat(value) || 0));
    setProfitMargin(numValue);
    localStorage.setItem("profitMargin", numValue.toString());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="admin-card bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border-emerald-500/30"
    >
      <div className="admin-card-header">
        <div>
          <h3 className="admin-card-title">
            <Calculator className="w-5 h-5 text-emerald-400" />
            Yeni Faaliyet Yılı
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            6 Eylül 2026 itibarıyla kâr marjı ve kazanç görünümü
          </p>
        </div>
        <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-1.5">
          <Percent className="w-4 h-4 text-emerald-400" />
          <input
            type="number"
            value={profitMargin}
            onChange={(e) => handleMarginChange(e.target.value)}
            className="w-14 bg-transparent text-white font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min="0"
            max="100"
            step="0.5"
          />
        </div>
      </div>
      <div className="admin-card-body space-y-4">
        <p className="text-sm text-gray-400">
          Yeni dönem 6 Eylül 2026’da başlar. Ciro ve tahmini kazanç yalnızca
          bu tarihten itibaren alınan siparişlerle oluşur; önceki dönem
          satışları bu hesaba dahil değildir.
        </p>
        {/* Total With Manual */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-gray-400 text-sm">Yeni Dönem Cirosu</span>
          </div>
          <span className="text-white font-bold">
            ₺
            {totals.totalWithManual.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Total Without Manual */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-gray-400 text-sm">Kâr Hesabına Esas Ciro</span>
          </div>
          <span className="text-white font-bold">
            ₺
            {totals.totalWithoutManual.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Estimated Profit */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl border border-emerald-500/30">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-300 font-medium">
              Yeni Dönem Tahmini Net Kâr
            </span>
          </div>
          <span className="text-2xl font-bold text-emerald-400">
            ₺
            {estimatedProfit.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Manual Amount Info */}
        <div className="text-center text-xs text-gray-500 mt-2">
          Manuel Eklemeler: ₺
          {totals.manualProductsTotal.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
          })}
        </div>
      </div>
    </motion.div>
  );
};

const DashboardWidgets = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrders: 0,
    totalRevenue: 0,
    salesTrend: [],
    popularProducts: [],
    lowStockProducts: [],
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

  const fetchDashboardData = useCallback(async () => {
    try {
      const [productsRes, ordersRes, usersRes] = await Promise.all([
        axios.get("/products"),
        axios.get("/orders-analytics"),
        axios.get("/users"),
      ]);

      setError(false);
      const products = productsRes.data.products || [];
      const orders = ordersRes.data.orderAnalyticsData?.usersOrders || [];
      const users = usersRes.data.users || [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allOrders = orders.flatMap((user) => user.orders || []);
      const previousPeriodRevenue = allOrders.reduce((sum, order) => {
        const orderDate = new Date(order.createdAt);

        if (
          Number.isNaN(orderDate.getTime()) ||
          orderDate < PREVIOUS_ACTIVITY_START ||
          orderDate >= PREVIOUS_ACTIVITY_END ||
          order.status === "İptal Edildi"
        ) {
          return sum;
        }

        return sum + (order.totalAmount || 0);
      }, 0);
      const todayOrders = allOrders.filter((order) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= today;
      });

      const todaySales = todayOrders.reduce(
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

      const lowStockProducts = products
        .filter((p) => p.stock < 10)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5);

      const salesTrend = getLast7DaysSales(allOrders);

      setStats({
        todaySales,
        todayOrders: todayOrders.length,
        totalRevenue: previousPeriodRevenue,
        salesTrend,
        popularProducts,
        lowStockProducts,
        liveOrderCount: allOrders.filter((o) => o.status === "Hazırlanıyor")
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
        (o) => o.status === "Hazırlanıyor",
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

      const daySales = dayOrders.reduce(
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
      ["Hazırlanıyor", "Yolda"].includes(order.status),
    );
    const delayedOrders = stats.allOrders.filter(
      (order) =>
        order.status === "Hazırlanıyor" &&
        (Date.now() - new Date(order.createdAt).getTime()) / 60000 >= 20,
    );
    const averageBasket = stats.todayOrders
      ? stats.todaySales / stats.todayOrders
      : 0;

    return { activeOrders, delayedOrders, averageBasket };
  }, [stats.allOrders, stats.todayOrders, stats.todaySales]);

  if (loading)
    return (
      <div
        className="studio-dashboard-skeleton"
        aria-label="Mağaza özeti yükleniyor"
        role="status"
      >
        <div className="admin-skeleton" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="admin-skeleton" />
        ))}
        <div className="admin-skeleton" />
      </div>
    );

  return (
    <div className="studio-dashboard">
      <div className="studio-page-intro">
        <div>
          <div className="studio-eyebrow">
            <span /> MAĞAZANIZIN NABZI
          </div>
          <h1>
            Her şey bir bakışta<span>.</span>
          </h1>
          <p>Satışları takip edin, öncelikleri görün, güne hazır olun.</p>
        </div>
        <div className="studio-intro-actions">
          <span className="studio-date">
            <CalendarDays size={16} />
            {new Date().toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <button
            className="studio-primary"
            onClick={() => onNavigate?.("create")}
          >
            <Plus size={17} /> Ürün ekle
          </button>
        </div>
      </div>
      {error && (
        <div className="studio-error" role="alert">
          <AlertTriangle size={20} />
          <span>
            Veriler güncellenemedi. Bağlantınızı kontrol ederek tekrar deneyin.
          </span>
          <button onClick={handleRefresh} disabled={refreshing}>
            Yeniden dene
          </button>
        </div>
      )}
      <div className="studio-metrics">
        {[
          {
            label: "Bugünkü satış",
            value: money(stats.todaySales),
            note: `${number(stats.todayOrders)} sipariş alındı`,
            icon: ShoppingBag,
            accent: true,
          },
          {
            label: "Gerçekleşen ciro",
            value: money(stats.totalRevenue),
            note: "Eylül 2025 – Temmuz 2026 dönemi",
            icon: TrendingUp,
          },
          {
            label: "Hazırlanan sipariş",
            value: number(stats.liveOrderCount),
            note: "Hazırlanmayı bekleyen siparişler",
            icon: Package,
          },
          {
            label: "Toplam müşteri",
            value: number(stats.totalUsers),
            note: "Kayıtlı müşteri",
            icon: Users,
          },
        ].map(({ label, value, note, icon: Icon, accent }) => (
          <article
            key={label}
            className={`studio-metric ${accent ? "is-featured" : ""}`}
          >
            <div className="studio-metric-top">
              <span>{label}</span>
              <Icon size={19} strokeWidth={1.6} />
            </div>
            <strong>{value}</strong>
            <div className="studio-metric-note">
              <span className="studio-metric-dot" />
              {note}
            </div>
          </article>
        ))}
      </div>
      <div className="studio-overview-grid">
        <section className="studio-panel studio-sales-panel">
          <div className="studio-panel-heading">
            <div>
              <h2>Satış performansı</h2>
              <p>Son 7 günün mağaza hareketleri</p>
            </div>
            <div className="studio-segment" aria-label="Grafik ölçümü">
              <button
                aria-pressed={chartMetric === "sales"}
                className={chartMetric === "sales" ? "is-active" : ""}
                onClick={() => setChartMetric("sales")}
              >
                Satış
              </button>
              <button
                aria-pressed={chartMetric === "orders"}
                className={chartMetric === "orders" ? "is-active" : ""}
                onClick={() => setChartMetric("orders")}
              >
                Sipariş
              </button>
            </div>
          </div>
          <div className="studio-chart-summary">
            <strong>
              {chartMetric === "sales"
                ? money(
                    stats.salesTrend.reduce((sum, day) => sum + day.sales, 0),
                  )
                : number(
                    stats.salesTrend.reduce((sum, day) => sum + day.orders, 0),
                  )}
            </strong>
            <span>
              <i />{" "}
              {chartMetric === "sales"
                ? "Haftalık satış toplamı"
                : "Haftalık sipariş toplamı"}
            </span>
            <button
              className="studio-icon-button"
              aria-label="Satış verilerini yenile"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
          <div className="studio-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats.salesTrend}
                margin={{ top: 12, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="studioSalesFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#258168" stopOpacity={0.2} />
                    <stop
                      offset="100%"
                      stopColor="#258168"
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="#edf0ed"
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#77817b", fontSize: 11 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#77817b", fontSize: 11 }}
                  width={62}
                  allowDecimals={chartMetric === "sales"}
                  tickFormatter={(v) =>
                    chartMetric === "sales" ? money(v) : number(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e2e8e3",
                    borderRadius: 10,
                    color: "#233b31",
                  }}
                  formatter={(v) => [
                    chartMetric === "sales" ? money(v) : number(v),
                    chartMetric === "sales" ? "Satış" : "Sipariş",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey={chartMetric}
                  stroke="#258168"
                  strokeWidth={2.5}
                  fill="url(#studioSalesFill)"
                  activeDot={{ r: 5, stroke: "white", strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <button
            className="studio-chart-link"
            onClick={() => onNavigate?.("analytics")}
          >
            Detaylı satış analizini incele <ArrowUpRight size={15} />
          </button>
        </section>
        <aside className="studio-priorities">
          <div className="studio-priority-title">
            <span className="studio-soft-icon">
              <Clock size={19} />
            </span>
            <span>
              Günün odağı<small>Öncelikli işleriniz</small>
            </span>
          </div>
          <h2>
            İşler yolunda,
            <br />
            kontrol sizde.
          </h2>
          <p>Sipariş akışını buradan takip edin.</p>
          <button
            className="studio-priority-row"
            onClick={() => onNavigate?.("orders")}
          >
            <span className="studio-priority-icon amber">
              <Clock size={18} />
            </span>
            <span>
              <strong>
                {operations.delayedOrders.length} sipariş bekliyor
              </strong>
              <small>20 dakikadan uzun süredir</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <button
            className="studio-priority-row"
            onClick={() => onNavigate?.("orders")}
          >
            <span className="studio-priority-icon green">
              <Truck size={18} />
            </span>
            <span>
              <strong>{operations.activeOrders.length} aktif sipariş</strong>
              <small>Hazırlanıyor veya yolda</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <div className="studio-average">
            <span>Bugünkü ortalama sepet</span>
            <strong>{money(operations.averageBasket)}</strong>
          </div>
          <button
            className="studio-primary"
            onClick={() => onNavigate?.("orders")}
          >
            Siparişleri yönet <ArrowRight size={16} />
          </button>
        </aside>
      </div>
      <section className="studio-panel studio-recent">
        <div className="studio-panel-heading">
          <div>
            <h2>Son siparişler</h2>
            <p>Mağazanızdaki en yeni hareketler</p>
          </div>
          <button
            className="studio-text-button"
            onClick={() => onNavigate?.("orders")}
          >
            Tüm siparişler <ArrowRight size={15} />
          </button>
        </div>
        <div className="studio-table-scroll">
          <table className="studio-order-table">
            <thead>
              <tr>
                <th>Sipariş / Müşteri</th>
                <th>Tarih</th>
                <th>Durum</th>
                <th>Tutar</th>
                <th>
                  <span className="sr-only">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((order, i) => (
                <tr key={order.orderId || order._id || i}>
                  <td>
                    <div className="studio-customer">
                      <span className="studio-customer-avatar">
                        {order.customerName
                          ?.charAt(0)
                          ?.toLocaleUpperCase("tr-TR") || "M"}
                      </span>
                      <span>
                        <strong>{order.customerName}</strong>
                        <small>
                          #
                          {String(order.orderId || order._id || "")
                            .slice(-6)
                            .toUpperCase()}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span>
                      {new Date(order.createdAt).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <small>
                      {new Date(order.createdAt).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`studio-order-status ${order.status === "Teslim Edildi" ? "delivered" : order.status === "Yolda" ? "transit" : order.status === "İptal Edildi" ? "cancelled" : "pending"}`}
                    >
                      <i />
                      {order.status}
                    </span>
                  </td>
                  <td className="studio-order-amount">
                    {money(order.totalAmount)}
                  </td>
                  <td>
                    <button
                      className="studio-icon-button"
                      aria-label={`${order.customerName} siparişlerini görüntüle`}
                      onClick={() => onNavigate?.("orders")}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats.recentOrders.length === 0 && (
          <div className="studio-empty">
            <ShoppingBag size={30} />
            <strong>İlk sipariş için hazırız</strong>
            <p>Yeni siparişler geldiğinde burada listelenecek.</p>
          </div>
        )}
      </section>
      <div className="studio-detail-grid">
        <section className="studio-panel">
          <div className="studio-panel-heading">
            <div>
              <h2>En çok tercih edilenler</h2>
              <p>Satış adedine göre ilk 5 ürün</p>
            </div>
            <Package size={19} />
          </div>
          <div className="studio-popular-list">
            {stats.popularProducts.map((product, i) => (
              <button
                key={product.name}
                className="studio-popular"
                onClick={() => onNavigate?.("products")}
              >
                <span className="studio-rank">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.quantity} adet satıldı</small>
                </span>
                <b>{money(product.revenue)}</b>
              </button>
            ))}
            {stats.popularProducts.length === 0 && (
              <div className="studio-empty">
                <Package size={26} />
                <p>Satışlarla birlikte popüler ürünler burada oluşacak.</p>
              </div>
            )}
          </div>
        </section>
        <ProfitMarginCard allOrders={stats.allOrders} />
      </div>
      <section className="studio-bottom-summary">
        <div>
          <h2>Sipariş dağılımı</h2>
          <div className="studio-status-chips">
            {stats.statusDistribution.map((status) => (
              <span key={status.name}>
                <i style={{ background: status.color }} />
                {status.name}
                <strong>{number(status.value)}</strong>
              </span>
            ))}
            {stats.statusDistribution.length === 0 && (
              <span>Henüz sipariş yok</span>
            )}
          </div>
        </div>
        <button
          className="studio-text-button"
          onClick={() => onNavigate?.("products")}
        >
          {stats.lowStockProducts.length
            ? `${stats.lowStockProducts.length} ürünün stokunu incele`
            : "Ürün durumlarını incele"}
          <ArrowUpRight size={16} />
        </button>
      </section>
      <div className="studio-shortcuts">
        <span>HIZLI İŞLEMLER</span>
        <button onClick={() => onNavigate?.("coupons")}>
          <Tag size={16} /> Kupon yönetimi <ArrowUpRight size={14} />
        </button>
        <button onClick={() => onNavigate?.("weekly-products")}>
          <CalendarDays size={16} /> Haftalık fırsatlar{" "}
          <ArrowUpRight size={14} />
        </button>
        <button onClick={() => onNavigate?.("users")}>
          <Users size={16} /> Müşteriler <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
};
export default DashboardWidgets;
