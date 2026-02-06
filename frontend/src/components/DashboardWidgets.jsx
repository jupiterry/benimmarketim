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
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

// Animated Counter Component
const AnimatedCounter = ({ value, prefix = "", suffix = "", decimals = 0 }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const stepValue = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(current);
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return <span>{prefix}{displayValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}{suffix}</span>;
};

// Hero Stat Card - Premium Neon Design
const HeroStatCard = ({ icon: Icon, title, value, subtitle, trend, trendLabel, color, delay = 0 }) => {
  // Map color names to neon colors
  const colorMap = {
    emerald: { bg: 'from-[#00ff9d] to-[#00d4aa]', glow: '#00ff9d', border: 'rgba(0, 255, 157, 0.2)' },
    cyan: { bg: 'from-[#00f5ff] to-[#2d7cff]', glow: '#00f5ff', border: 'rgba(0, 245, 255, 0.2)' },
    indigo: { bg: 'from-[#bf00ff] to-[#7c3aed]', glow: '#bf00ff', border: 'rgba(191, 0, 255, 0.2)' },
    purple: { bg: 'from-[#bf00ff] to-[#ff2d92]', glow: '#bf00ff', border: 'rgba(191, 0, 255, 0.2)' },
    amber: { bg: 'from-[#f59e0b] to-[#ff6b2c]', glow: '#f59e0b', border: 'rgba(245, 158, 11, 0.2)' },
    violet: { bg: 'from-[#8b5cf6] to-[#bf00ff]', glow: '#8b5cf6', border: 'rgba(139, 92, 246, 0.2)' },
    pink: { bg: 'from-[#ff2d92] to-[#ff6b2c]', glow: '#ff2d92', border: 'rgba(255, 45, 146, 0.2)' },
    green: { bg: 'from-[#00ff9d] to-[#00d4aa]', glow: '#00ff9d', border: 'rgba(0, 255, 157, 0.2)' },
  };
  const colorStyle = colorMap[color] || colorMap.cyan;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="relative p-6 rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(16, 16, 42, 0.7)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${colorStyle.border}`,
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px ${colorStyle.glow}15`
      }}
    >
      {/* Gradient Orb Background */}
      <div 
        className="absolute -top-1/2 -right-1/2 w-[200px] h-[200px] rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, ${colorStyle.glow}, transparent 70%)` }}
      />
      
      <div className="relative z-10">
        <motion.div 
          className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colorStyle.bg} flex items-center justify-center mb-4`}
          style={{ boxShadow: `0 8px 24px ${colorStyle.glow}40` }}
          whileHover={{ scale: 1.1, rotate: 5 }}
        >
          <Icon className="w-7 h-7 text-white" />
        </motion.div>
        <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
        {trend !== undefined && (
          <div className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ${trend >= 0 ? 'bg-[#00ff9d]/10 text-[#00ff9d]' : 'bg-[#ff2d92]/10 text-[#ff2d92]'}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{Math.abs(trend)}%</span>
            {trendLabel && <span className="opacity-70">{trendLabel}</span>}
          </div>
        )}
        {subtitle && <p className="text-gray-500 text-sm mt-2">{subtitle}</p>}
      </div>
    </motion.div>
  );
};

// Quick Action Button
const QuickAction = ({ icon: Icon, label, onClick, color = "emerald" }) => (
  <motion.button
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`flex items-center gap-3 p-4 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 hover:border-${color}-500/30 rounded-xl transition-all group`}
  >
    <div className={`p-2 rounded-lg bg-${color}-500/20`}>
      <Icon className={`w-5 h-5 text-${color}-400`} />
    </div>
    <span className="text-white font-medium">{label}</span>
    <ArrowUpRight className="w-4 h-4 text-gray-500 group-hover:text-white ml-auto transition-colors" />
  </motion.button>
);

// Recent Order Item
const RecentOrderItem = ({ order, index }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.1 }}
    className="flex items-center justify-between p-3 bg-gray-800/30 hover:bg-gray-700/30 rounded-xl border border-gray-700/30 transition-colors cursor-pointer group"
  >
    <div className="flex items-center gap-3">
      <div className={`w-2.5 h-2.5 rounded-full ${
        order.status === 'Hazırlanıyor' ? 'bg-amber-400 animate-pulse' :
        order.status === 'Yolda' ? 'bg-blue-400' :
        order.status === 'Teslim Edildi' ? 'bg-emerald-400' : 'bg-gray-400'
      }`} />
      <div>
        <p className="text-white text-sm font-medium">{order.customerName || 'Müşteri'}</p>
        <p className="text-gray-500 text-xs">{new Date(order.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-emerald-400 font-bold">₺{order.totalAmount?.toFixed(0)}</span>
      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
    </div>
  </motion.div>
);

// Live Clock Widget
const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return (
    <div 
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
      style={{
        background: 'rgba(0, 245, 255, 0.05)',
        border: '1px solid rgba(0, 245, 255, 0.1)',
        boxShadow: '0 0 20px rgba(0, 245, 255, 0.05)'
      }}
    >
      <Clock className="w-4 h-4 text-[#00f5ff]" />
      <span className="text-white font-mono text-lg tabular-nums">
        {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-gray-500 text-sm hidden sm:block">
        {time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
    </div>
  );
};

// Order Status Distribution - Neon Colors
const StatusDistribution = ({ data }) => {
  const COLORS = ['#00ff9d', '#f59e0b', '#00f5ff', '#ff2d92'];
  
  return (
    <div className="flex items-center gap-6">
      <div className="w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={25}
              outerRadius={40}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || COLORS[index] }} />
            <span className="text-gray-400">{item.name}</span>
            <span className="text-white font-medium ml-auto">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Profit Margin Card Component
const ProfitMarginCard = ({ allOrders }) => {
  const [profitMargin, setProfitMargin] = useState(() => {
    const saved = localStorage.getItem('profitMargin');
    return saved ? parseFloat(saved) : 10;
  });

  // Calculate totals
  const totals = useMemo(() => {
    let totalWithManual = 0;
    let manualProductsTotal = 0;

    allOrders.forEach(order => {
      // İptal edilen siparişleri hariç tut (gerçek satış değil)
      if (order.status !== 'İptal Edildi') {
        totalWithManual += order.totalAmount || 0;
        
        // Manuel ürünlerin tutarını hesapla
        order.products?.forEach(product => {
          if (product.isManual) {
            manualProductsTotal += (product.price || 0) * (product.quantity || 1);
          }
        });
      }
    });

    return { 
      totalWithManual, 
      totalWithoutManual: totalWithManual - manualProductsTotal,
      manualProductsTotal 
    };
  }, [allOrders]);

  const estimatedProfit = totals.totalWithoutManual * (profitMargin / 100);

  const handleMarginChange = (value) => {
    const numValue = Math.max(0, Math.min(100, parseFloat(value) || 0));
    setProfitMargin(numValue);
    localStorage.setItem('profitMargin', numValue.toString());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="admin-card bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border-emerald-500/30"
    >
      <div className="admin-card-header">
        <h3 className="admin-card-title">
          <Calculator className="w-5 h-5 text-emerald-400" />
          Kar Marjı Hesaplaması
        </h3>
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
        {/* Total With Manual */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-gray-400 text-sm">Manuel Dahil Toplam</span>
          </div>
          <span className="text-white font-bold">₺{totals.totalWithManual.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
        </div>

        {/* Total Without Manual */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-gray-400 text-sm">Manuel Hariç Toplam</span>
          </div>
          <span className="text-white font-bold">₺{totals.totalWithoutManual.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
        </div>

        {/* Estimated Profit */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl border border-emerald-500/30">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-300 font-medium">Tahmini Net Kâr</span>
          </div>
          <span className="text-2xl font-bold text-emerald-400">₺{estimatedProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
        </div>

        {/* Manual Amount Info */}
        <div className="text-center text-xs text-gray-500 mt-2">
          Manuel Eklemeler: ₺{totals.manualProductsTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </div>
      </div>
    </motion.div>
  );
};

// Main Dashboard Component
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
      const todayOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= today;
      });

      const todaySales = todayOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      const recentOrders = allOrders
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(order => ({
          ...order,
          customerName: orders.find(u => u.orders?.some(o => o.orderId === order.orderId))?.user?.name || 'Müşteri'
        }));

      // Status distribution
      const statusCounts = allOrders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});
      
      const statusDistribution = [
        { name: 'Hazırlanıyor', value: statusCounts['Hazırlanıyor'] || 0, color: '#10b981' },
        { name: 'Yolda', value: statusCounts['Yolda'] || 0, color: '#f59e0b' },
        { name: 'Teslim Edildi', value: statusCounts['Teslim Edildi'] || 0, color: '#3b82f6' },
        { name: 'İptal', value: statusCounts['İptal Edildi'] || 0, color: '#ef4444' },
      ].filter(s => s.value > 0);

      // Popular products
      const productSales = {};
      allOrders.forEach(order => {
        order.products?.forEach(product => {
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
        .filter(p => p.stock < 10)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5);

      const salesTrend = getLast7DaysSales(allOrders);

      setStats({
        todaySales,
        todayOrders: todayOrders.length,
        totalRevenue: analytics.totalRevenue || 0,
        salesTrend,
        popularProducts,
        lowStockProducts,
        liveOrderCount: allOrders.filter(o => o.status === "Hazırlanıyor").length,
        recentOrders,
        totalUsers: users.length,
        statusDistribution,
        allOrders
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
    
    const interval = setInterval(() => {
      fetchLiveData();
    }, 10000);

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
        .slice(0, 5)
        .map(order => ({
          ...order,
          customerName: orders.find(u => u.orders?.some(o => o.orderId === order.orderId))?.user?.name || 'Müşteri'
        }));
      
      setStats(prev => ({ ...prev, liveOrderCount: liveCount, recentOrders, allOrders }));
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

      const dayOrders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= date && orderDate < nextDate;
      });

      const daySales = dayOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      last7Days.push({
        date: date.toLocaleDateString('tr-TR', { weekday: 'short' }),
        sales: daySales,
        orders: dayOrders.length
      });
    }

    return last7Days;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="admin-stat-card">
            <div className="admin-skeleton w-12 h-12 rounded-xl mb-4" />
            <div className="admin-skeleton w-24 h-4 mb-2" />
            <div className="admin-skeleton w-32 h-8" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#00f5ff]" style={{ filter: 'drop-shadow(0 0 8px #00f5ff)' }} />
            <span className="admin-gradient-text">Dashboard</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Gerçek zamanlı mağaza istatistikleri</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveClock />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl transition-colors disabled:opacity-50"
            style={{
              background: 'rgba(0, 245, 255, 0.1)',
              color: '#00f5ff',
              boxShadow: '0 0 15px rgba(0, 245, 255, 0.2)'
            }}
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <HeroStatCard
          icon={DollarSign}
          title="Bugünkü Satış"
          value={<AnimatedCounter value={stats.todaySales} prefix="₺" decimals={0} />}
          subtitle={`${stats.todayOrders} sipariş`}
          trend={12}
          trendLabel="dün"
          color="emerald"
          delay={0}
        />
        <HeroStatCard
          icon={TrendingUp}
          title="Toplam Gelir"
          value={<AnimatedCounter value={stats.totalRevenue} prefix="₺" decimals={0} />}
          subtitle="Tüm zamanlar"
          color="indigo"
          delay={0.1}
        />
        <HeroStatCard
          icon={Package}
          title="Hazırlanan"
          value={stats.liveOrderCount}
          subtitle="Sipariş bekliyor"
          color="amber"
          delay={0.2}
        />
        <HeroStatCard
          icon={Users}
          title="Toplam Kullanıcı"
          value={stats.totalUsers}
          subtitle="Kayıtlı müşteri"
          trend={8}
          trendLabel="bu ay"
          color="violet"
          delay={0.3}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 admin-card"
        >
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <Activity className="w-5 h-5 text-emerald-400" />
              Son 7 Gün Satış Trendi
            </h3>
          </div>
          <div className="admin-card-body">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={stats.salesTrend}>
                <defs>
                  <linearGradient id="colorSalesV2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₺${v}`} />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #334155', 
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                  formatter={(value) => [`₺${value.toFixed(0)}`, 'Satış']}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#10B981" 
                  strokeWidth={3} 
                  fill="url(#colorSalesV2)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="admin-card"
        >
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
              Son Siparişler
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Canlı
            </div>
          </div>
          <div className="admin-card-body space-y-2">
            <AnimatePresence>
              {stats.recentOrders.map((order, index) => (
                <RecentOrderItem key={order.orderId} order={order} index={index} />
              ))}
            </AnimatePresence>
            {stats.recentOrders.length === 0 && (
              <div className="py-8 text-center">
                <Box className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Henüz sipariş yok</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Profit Margin Calculator */}
        <ProfitMarginCard allOrders={stats.allOrders} />
        {/* Popular Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="admin-card"
        >
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <Star className="w-5 h-5 text-amber-400" />
              En Popüler Ürünler
            </h3>
          </div>
          <div className="admin-card-body space-y-3">
            {stats.popularProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                    index === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                    index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                    index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' :
                    'bg-gray-700'
                  }`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm truncate max-w-[140px]">{product.name}</p>
                    <p className="text-gray-500 text-xs">{product.quantity} Adet</p>
                  </div>
                </div>
                <p className="text-emerald-400 font-bold">₺{product.revenue.toFixed(0)}</p>
              </div>
            ))}
            {stats.popularProducts.length === 0 && (
              <div className="py-6 text-center text-gray-500 text-sm">Veri yok</div>
            )}
          </div>
        </motion.div>

        {/* Order Status Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="admin-card"
        >
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <Truck className="w-5 h-5 text-blue-400" />
              Sipariş Durumları
            </h3>
          </div>
          <div className="admin-card-body flex items-center justify-center">
            {stats.statusDistribution.length > 0 ? (
              <StatusDistribution data={stats.statusDistribution} />
            ) : (
              <div className="py-6 text-center text-gray-500 text-sm">Veri yok</div>
            )}
          </div>
        </motion.div>

        {/* Low Stock Alert */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className={`admin-card ${stats.lowStockProducts.length > 0 ? 'border-red-500/30' : ''}`}
        >
          <div className="admin-card-header">
            <h3 className="admin-card-title">
              <AlertTriangle className={`w-5 h-5 ${stats.lowStockProducts.length > 0 ? 'text-red-400' : 'text-gray-400'}`} />
              Stok Durumu
            </h3>
          </div>
          <div className="admin-card-body">
            {stats.lowStockProducts.length > 0 ? (
              <div className="space-y-3">
                {stats.lowStockProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
                    <p className="text-white text-sm truncate flex-1 mr-4">{product.name}</p>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      product.stock < 5 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {product.stock} Adet
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Package className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <p className="text-emerald-400 font-medium">Tüm ürünler stokta!</p>
                <p className="text-gray-500 text-sm mt-1">Stok durumu kritik değil</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardWidgets;
