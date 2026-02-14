import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  AlertTriangle,
  DollarSign,
  Clock,
  Users,
  Zap,
  RefreshCw,
  ChevronRight,
  Star,
  Activity,
  ArrowUpRight,
  Eye,
  Box,
  Truck,
  Percent,
  Calculator
} from "lucide-react";
import axios from "../lib/axios";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ── Dynamic Greeting ──
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi Günler";
  if (hour >= 18 && hour < 22) return "İyi Akşamlar";
  return "İyi Geceler";
};

// ── Animated Counter ──
const AnimatedCounter = ({ value, prefix = "", suffix = "", decimals = 0 }) => {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const steps = 60;
    const stepValue = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) { setDisplayValue(value); clearInterval(timer); }
      else setDisplayValue(current);
    }, 25);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{prefix}{displayValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}{suffix}</span>;
};

// ── Frosted Glass Stat Card ──
const HeroStatCard = ({ icon: Icon, title, value, subtitle, trend, trendLabel, color, delay = 0 }) => {
  const neon = {
    emerald: { border: "border-emerald-500/40", glow: "shadow-[0_4px_20px_rgba(16,185,129,0.15)]", hoverGlow: "hover:shadow-[0_4px_30px_rgba(16,185,129,0.25)]", iconBg: "bg-emerald-500/10", iconBorder: "border-emerald-500/20", iconText: "text-emerald-400", iconDrop: "drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]", bottomBorder: "border-b-emerald-400", trendPlus: "text-emerald-400 bg-emerald-500/10", numGlow: "drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]" },
    indigo: { border: "border-violet-500/40", glow: "shadow-[0_4px_20px_rgba(139,92,246,0.15)]", hoverGlow: "hover:shadow-[0_4px_30px_rgba(139,92,246,0.25)]", iconBg: "bg-violet-500/10", iconBorder: "border-violet-500/20", iconText: "text-violet-400", iconDrop: "drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]", bottomBorder: "border-b-violet-400", trendPlus: "text-violet-400 bg-violet-500/10", numGlow: "drop-shadow-[0_0_6px_rgba(139,92,246,0.3)]" },
    amber: { border: "border-amber-500/40", glow: "shadow-[0_4px_20px_rgba(245,158,11,0.15)]", hoverGlow: "hover:shadow-[0_4px_30px_rgba(245,158,11,0.25)]", iconBg: "bg-amber-500/10", iconBorder: "border-amber-500/20", iconText: "text-amber-400", iconDrop: "drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]", bottomBorder: "border-b-amber-400", trendPlus: "text-amber-400 bg-amber-500/10", numGlow: "drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]" },
    violet: { border: "border-purple-500/40", glow: "shadow-[0_4px_20px_rgba(168,85,247,0.15)]", hoverGlow: "hover:shadow-[0_4px_30px_rgba(168,85,247,0.25)]", iconBg: "bg-purple-500/10", iconBorder: "border-purple-500/20", iconText: "text-purple-400", iconDrop: "drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]", bottomBorder: "border-b-purple-400", trendPlus: "text-purple-400 bg-purple-500/10", numGlow: "drop-shadow-[0_0_6px_rgba(168,85,247,0.3)]" },
    cyan: { border: "border-cyan-500/40", glow: "shadow-[0_4px_20px_rgba(6,182,212,0.15)]", hoverGlow: "hover:shadow-[0_4px_30px_rgba(6,182,212,0.25)]", iconBg: "bg-cyan-500/10", iconBorder: "border-cyan-500/20", iconText: "text-cyan-400", iconDrop: "drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]", bottomBorder: "border-b-cyan-400", trendPlus: "text-cyan-400 bg-cyan-500/10", numGlow: "drop-shadow-[0_0_6px_rgba(6,182,212,0.3)]" },
  };
  const s = neon[color] || neon.cyan;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -4 }}
      className={`relative bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.06] border-b-[3px] ${s.bottomBorder} ${s.glow} ${s.hoverGlow} transition-all duration-300 p-5 overflow-hidden`}
    >
      {/* upper area */}
      <div className="flex items-start justify-between mb-4">
        <motion.div
          whileHover={{ scale: 1.15, rotate: 8 }}
          transition={{ type: "spring", stiffness: 300 }}
          className={`w-11 h-11 rounded-xl ${s.iconBg} border ${s.iconBorder} flex items-center justify-center`}
        >
          <Icon className={`w-5 h-5 ${s.iconText} ${s.iconDrop}`} />
        </motion.div>
        {trend !== undefined && (
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${trend >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
            {trendLabel && <span className="opacity-60 ml-0.5">{trendLabel}</span>}
          </div>
        )}
      </div>
      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">{title}</p>
      <p className={`text-2xl font-black text-white tabular-nums font-mono ${s.numGlow}`}>{value}</p>
      {subtitle && <p className="text-gray-600 text-[11px] mt-1.5">{subtitle}</p>}
    </motion.div>
  );
};

// ── Live Clock — Neon Digital ──
const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-cyan-500/[0.06] border border-cyan-500/[0.12]">
      <Clock className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
      <span className="text-cyan-300 font-mono text-base font-bold tabular-nums tracking-wider drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]">
        {timeStr}
      </span>
      <span className="text-gray-600 text-xs hidden sm:block">{dateStr}</span>
    </div>
  );
};

// ── Custom Glassmorphic Tooltip ──
const GlassTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900/80 backdrop-blur-xl border border-white/[0.08] rounded-xl px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      <p className="text-white text-xs font-bold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-emerald-400 text-sm font-mono font-bold">
          ₺{p.value?.toFixed(0)} <span className="text-gray-500 text-[10px] font-sans">satış</span>
        </p>
      ))}
    </div>
  );
};

// ── Recent Order Item — Glass Pill ──
const RecentOrderItem = ({ order, index }) => {
  const isPreparing = order.status === "Hazırlanıyor";
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, scale: 0.95 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      whileHover={{ x: -4 }}
      className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.03] backdrop-blur-xl rounded-xl border border-white/[0.05] hover:border-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.06)] transition-all duration-200 cursor-pointer group"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`w-2 h-2 rounded-full ${isPreparing ? "bg-amber-400" :
              order.status === "Yolda" ? "bg-blue-400" :
                order.status === "Teslim Edildi" ? "bg-emerald-400" : "bg-gray-500"
            }`} />
          {isPreparing && (
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-400 animate-ping opacity-60" />
          )}
        </div>
        <div>
          <p className="text-white text-xs font-semibold">{order.customerName || "Müşteri"}</p>
          <p className="text-gray-600 text-[10px]">{new Date(order.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-emerald-400 font-mono font-bold text-sm">₺{order.totalAmount?.toFixed(0)}</span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
      </div>
    </motion.div>
  );
};

// ── Status Distribution (Pie) ──
const StatusDistribution = ({ data }) => {
  const COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444"];
  return (
    <div className="flex items-center gap-6">
      <div className="w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={25} outerRadius={40} paddingAngle={3} dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color || COLORS[index] }} />
            <span className="text-gray-500">{item.name}</span>
            <span className="text-white font-bold ml-auto">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Profit Margin Calculator ──
const ProfitMarginCard = ({ allOrders }) => {
  const [profitMargin, setProfitMargin] = useState(() => {
    const saved = localStorage.getItem("profitMargin");
    return saved ? parseFloat(saved) : 10;
  });

  const totals = useMemo(() => {
    let totalWithManual = 0;
    let manualProductsTotal = 0;
    allOrders.forEach(order => {
      if (order.status !== "İptal Edildi") {
        totalWithManual += order.totalAmount || 0;
        order.products?.forEach(product => {
          if (product.isManual) manualProductsTotal += (product.price || 0) * (product.quantity || 1);
        });
      }
    });
    return { totalWithManual, totalWithoutManual: totalWithManual - manualProductsTotal, manualProductsTotal };
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
      className="bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.06] border-b-[3px] border-b-emerald-400 overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
        <h3 className="flex items-center gap-2 text-white text-sm font-bold">
          <Calculator className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
          Kar Marjı
        </h3>
        <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-2.5 py-1">
          <Percent className="w-3.5 h-3.5 text-emerald-400" />
          <input
            type="number"
            value={profitMargin}
            onChange={(e) => handleMarginChange(e.target.value)}
            className="w-12 bg-transparent text-white font-mono font-bold text-sm text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min="0" max="100" step="0.5"
          />
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between p-2.5 bg-gray-800/40 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-gray-500 text-xs">Manuel Dahil</span>
          </div>
          <span className="text-white font-mono font-bold text-sm">₺{totals.totalWithManual.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center justify-between p-2.5 bg-gray-800/40 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="text-gray-500 text-xs">Manuel Hariç</span>
          </div>
          <span className="text-white font-mono font-bold text-sm">₺{totals.totalWithoutManual.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center justify-between p-3 bg-emerald-500/[0.08] rounded-xl border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-300 text-xs font-semibold">Net Kâr</span>
          </div>
          <span className="text-emerald-400 font-mono font-black text-lg drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">₺{estimatedProfit.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
        </div>
        <p className="text-center text-[10px] text-gray-700">Manuel: ₺{totals.manualProductsTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p>
      </div>
    </motion.div>
  );
};

// ════════════════════════════════════════════════════════════
//   MAIN DASHBOARD
// ════════════════════════════════════════════════════════════
const DashboardWidgets = () => {
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
    allOrders: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [analyticsRes, productsRes, ordersRes, usersRes] = await Promise.all([
        axios.get("/analytics"),
        axios.get("/products"),
        axios.get("/orders-analytics"),
        axios.get("/users")
      ]);

      const analytics = analyticsRes.data;
      const products = productsRes.data.products || [];
      const orders = ordersRes.data.orderAnalyticsData?.usersOrders || [];
      const users = usersRes.data.users || [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allOrders = orders.flatMap(user => user.orders || []);
      const todayOrders = allOrders.filter(order => new Date(order.createdAt) >= today);
      const todaySales = todayOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      const recentOrders = allOrders
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6)
        .map(order => ({
          ...order,
          customerName: orders.find(u => u.orders?.some(o => o.orderId === order.orderId))?.user?.name || "Müşteri"
        }));

      const statusCounts = allOrders.reduce((acc, order) => { acc[order.status] = (acc[order.status] || 0) + 1; return acc; }, {});
      const statusDistribution = [
        { name: "Hazırlanıyor", value: statusCounts["Hazırlanıyor"] || 0, color: "#10b981" },
        { name: "Yolda", value: statusCounts["Yolda"] || 0, color: "#f59e0b" },
        { name: "Teslim Edildi", value: statusCounts["Teslim Edildi"] || 0, color: "#3b82f6" },
        { name: "İptal", value: statusCounts["İptal Edildi"] || 0, color: "#ef4444" },
      ].filter(s => s.value > 0);

      const productSales = {};
      allOrders.forEach(order => {
        order.products?.forEach(product => {
          const name = product.name;
          if (!productSales[name]) productSales[name] = { name, quantity: 0, revenue: 0 };
          productSales[name].quantity += product.quantity;
          productSales[name].revenue += (product.price || 0) * product.quantity;
        });
      });
      const popularProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

      const lowStockProducts = products.filter(p => p.stock < 10).sort((a, b) => a.stock - b.stock).slice(0, 5);
      const salesTrend = getLast7DaysSales(allOrders);

      setStats({
        todaySales, todayOrders: todayOrders.length,
        totalRevenue: analytics.totalRevenue || 0,
        salesTrend, popularProducts, lowStockProducts,
        liveOrderCount: allOrders.filter(o => o.status === "Hazırlanıyor").length,
        recentOrders, totalUsers: users.length, statusDistribution, allOrders
      });
    } catch (error) {
      console.error("Dashboard verileri yüklenirken hata:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchLiveData(), 10000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const fetchLiveData = async () => {
    try {
      const res = await axios.get("/orders-analytics");
      const orders = res.data.orderAnalyticsData?.usersOrders || [];
      const allOrders = orders.flatMap(user => user.orders || []);
      const liveCount = allOrders.filter(o => o.status === "Hazırlanıyor").length;
      const recentOrders = allOrders
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6)
        .map(order => ({
          ...order,
          customerName: orders.find(u => u.orders?.some(o => o.orderId === order.orderId))?.user?.name || "Müşteri"
        }));
      setStats(prev => ({ ...prev, liveOrderCount: liveCount, recentOrders, allOrders }));
    } catch (error) {
      console.error("Canlı veri güncellenirken hata:", error);
    }
  };

  const handleRefresh = () => { setRefreshing(true); fetchDashboardData(); };

  const getLast7DaysSales = (orders) => {
    const last7Days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const dayOrders = orders.filter(order => {
        const d = new Date(order.createdAt);
        return d >= date && d < nextDate;
      });
      last7Days.push({
        date: date.toLocaleDateString("tr-TR", { weekday: "short" }),
        sales: dayOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
        orders: dayOrders.length
      });
    }
    return last7Days;
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.06] p-5 animate-pulse">
              <div className="w-11 h-11 bg-gray-800 rounded-xl mb-4" />
              <div className="w-20 h-3 bg-gray-800 rounded mb-2" />
              <div className="w-28 h-7 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══════════ HEADER + GREETING ═══════════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            <span>
              {getGreeting()},{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Emirhan</span>
            </span>
          </h1>
          <p className="text-gray-600 text-xs mt-1 font-medium">Gerçek zamanlı mağaza istatistikleri</p>
        </motion.div>
        <div className="flex items-center gap-3">
          <LiveClock />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-cyan-500/[0.08] border border-cyan-500/[0.12] text-cyan-400 disabled:opacity-40 transition-all hover:shadow-[0_0_12px_rgba(6,182,212,0.15)]"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </motion.button>
        </div>
      </div>

      {/* ═══════════ STAT CARDS ═══════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroStatCard
          icon={DollarSign} title="Bugünkü Satış"
          value={<AnimatedCounter value={stats.todaySales} prefix="₺" decimals={0} />}
          subtitle={`${stats.todayOrders} sipariş`}
          trend={12} trendLabel="dün" color="emerald" delay={0}
        />
        <HeroStatCard
          icon={TrendingUp} title="Toplam Gelir"
          value={<AnimatedCounter value={stats.totalRevenue} prefix="₺" decimals={0} />}
          subtitle="Tüm zamanlar" color="indigo" delay={0.08}
        />
        <HeroStatCard
          icon={Package} title="Hazırlanan"
          value={stats.liveOrderCount}
          subtitle="Sipariş bekliyor" color="amber" delay={0.16}
        />
        <HeroStatCard
          icon={Users} title="Toplam Kullanıcı"
          value={stats.totalUsers}
          subtitle="Kayıtlı müşteri" trend={8} trendLabel="bu ay" color="violet" delay={0.24}
        />
      </div>

      {/* ═══════════ CHARTS + LIVE ORDERS ROW ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Area Chart — Glass Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.06] shadow-[0_0_30px_rgba(16,185,129,0.04)] overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
            <h3 className="flex items-center gap-2 text-white text-sm font-bold">
              <Activity className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              Son 7 Gün Satış Trendi
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Canlı
            </div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.salesTrend}>
                <defs>
                  <linearGradient id="neonSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#374151" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#374151" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₺${v}`} />
                <Tooltip content={<GlassTooltip />} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#10B981"
                  strokeWidth={3}
                  fill="url(#neonSalesGrad)"
                  dot={{ r: 4, fill: "#10B981", stroke: "#0f172a", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#10B981", stroke: "#0f172a", strokeWidth: 2, filter: "drop-shadow(0 0 6px rgba(16,185,129,0.5))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Recent Orders — "Canlı Sipariş Akışı" */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
            <h3 className="flex items-center gap-2 text-white text-sm font-bold">
              <ShoppingCart className="w-4 h-4 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              Canlı Sipariş Akışı
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
              <span className="text-emerald-400 text-[10px] font-bold">CANLI</span>
            </div>
          </div>
          <div className="p-3 space-y-2 flex-1 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {stats.recentOrders.map((order, index) => (
                <RecentOrderItem key={order.orderId} order={order} index={index} />
              ))}
            </AnimatePresence>
            {stats.recentOrders.length === 0 && (
              <div className="py-8 text-center">
                <Box className="w-8 h-8 text-gray-800 mx-auto mb-2" />
                <p className="text-gray-700 text-xs">Henüz sipariş yok</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ═══════════ BOTTOM ROW ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Profit Margin */}
        <ProfitMarginCard allOrders={stats.allOrders} />

        {/* Popular Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.06] overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
            <h3 className="flex items-center gap-2 text-white text-sm font-bold">
              <Star className="w-4 h-4 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              Popüler Ürünler
            </h3>
          </div>
          <div className="p-3 space-y-2">
            {stats.popularProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between p-2.5 bg-gray-800/30 hover:bg-gray-800/50 rounded-xl transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-white font-bold text-[10px] ${index === 0 ? "bg-gradient-to-br from-amber-400 to-orange-500" :
                      index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400" :
                        index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-700" : "bg-gray-700"
                    }`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-white font-medium text-xs truncate max-w-[130px]">{product.name}</p>
                    <p className="text-gray-600 text-[10px]">{product.quantity} Adet</p>
                  </div>
                </div>
                <p className="text-emerald-400 font-mono font-bold text-xs">₺{product.revenue.toFixed(0)}</p>
              </div>
            ))}
            {stats.popularProducts.length === 0 && (
              <div className="py-6 text-center text-gray-700 text-xs">Veri yok</div>
            )}
          </div>
        </motion.div>

        {/* Order Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/[0.06] overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
            <h3 className="flex items-center gap-2 text-white text-sm font-bold">
              <Truck className="w-4 h-4 text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
              Sipariş Durumları
            </h3>
          </div>
          <div className="p-4 flex items-center justify-center">
            {stats.statusDistribution.length > 0 ? (
              <StatusDistribution data={stats.statusDistribution} />
            ) : (
              <div className="py-6 text-center text-gray-700 text-xs">Veri yok</div>
            )}
          </div>
        </motion.div>

        {/* Low Stock Alert */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className={`bg-white/[0.03] backdrop-blur-2xl rounded-2xl border overflow-hidden ${stats.lowStockProducts.length > 0 ? "border-rose-500/20" : "border-white/[0.06]"}`}
        >
          <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
            <h3 className="flex items-center gap-2 text-white text-sm font-bold">
              <AlertTriangle className={`w-4 h-4 ${stats.lowStockProducts.length > 0 ? "text-rose-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]" : "text-gray-500"}`} />
              Stok Durumu
            </h3>
          </div>
          <div className="p-3">
            {stats.lowStockProducts.length > 0 ? (
              <div className="space-y-2">
                {stats.lowStockProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-2.5 bg-gray-800/30 rounded-xl">
                    <p className="text-white text-xs truncate flex-1 mr-3">{product.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${product.stock < 5 ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400"
                      }`}>
                      {product.stock}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Package className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                <p className="text-emerald-400 font-bold text-xs">Tüm ürünler stokta!</p>
                <p className="text-gray-700 text-[10px] mt-0.5">Kritik stok yok</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardWidgets;
