import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  Activity,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Clock,
  Users,
  Zap,
  Eye,
  Plus,
  Bell,
  RefreshCw,
  ChevronRight,
  Star
} from "lucide-react";
import axios from "../lib/axios";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

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
  
  return <span>{prefix}{displayValue.toFixed(decimals)}{suffix}</span>;
};

// Live Clock Component
const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return (
    <div className="flex items-center gap-3 bg-gray-800/50 rounded-xl px-4 py-2 border border-gray-700/50">
      <Clock className="w-4 h-4 text-emerald-400" />
      <span className="text-white font-mono text-lg">
        {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-gray-500 text-sm hidden sm:block">
        {time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
    </div>
  );
};

// Recent Order Item
const RecentOrderItem = ({ order, index }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.1 }}
    className="flex items-center justify-between p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 hover:bg-gray-700/30 transition-colors cursor-pointer group"
  >
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full ${
        order.status === 'Hazırlanıyor' ? 'bg-yellow-400 animate-pulse' :
        order.status === 'Yolda' ? 'bg-blue-400' :
        order.status === 'Teslim Edildi' ? 'bg-emerald-400' : 'bg-gray-400'
      }`} />
      <div>
        <p className="text-white text-sm font-medium">{order.customerName || 'Müşteri'}</p>
        <p className="text-gray-500 text-xs">{new Date(order.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-emerald-400 font-bold">₺{order.totalAmount?.toFixed(0)}</span>
      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
    </div>
  </motion.div>
);

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
    hourlyData: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    
    const interval = setInterval(() => {
      fetchLiveOrderCount();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
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
        hourlyData: analytics.hourlyData || []
      });
    } catch (error) {
      console.error("Dashboard verileri yüklenirken hata:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const fetchLiveOrderCount = async () => {
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
      
      setStats(prev => ({ ...prev, liveOrderCount: liveCount, recentOrders }));
    } catch (error) {
      console.error("Canlı sipariş sayısı güncellenirken hata:", error);
    }
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

      const daySales = orders
        .filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate >= date && orderDate < nextDate;
        })
        .reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      last7Days.push({
        date: date.toLocaleDateString('tr-TR', { weekday: 'short' }),
        sales: daySales,
        orders: orders.filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate >= date && orderDate < nextDate;
        }).length
      });
    }

    return last7Days;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Live Clock & Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-400" />
            Dashboard
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
            className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bugünkü Satış */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-2xl p-6 border border-emerald-500/30"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex items-center gap-1 text-emerald-400 text-sm">
                <TrendingUp className="w-4 h-4" />
                Bugün
              </div>
            </div>
            <h3 className="text-gray-400 text-sm mb-1">Bugünkü Satış</h3>
            <p className="text-3xl font-bold text-white">
              <AnimatedCounter value={stats.todaySales} prefix="₺" decimals={2} />
            </p>
            <p className="text-sm text-emerald-400 mt-2 flex items-center gap-1">
              <ShoppingCart className="w-3 h-3" />
              {stats.todayOrders} Sipariş
            </p>
          </div>
        </motion.div>

        {/* Toplam Gelir */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl p-6 border border-blue-500/30"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <TrendingUp className="w-6 h-6 text-blue-400" />
              </div>
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-gray-400 text-sm mb-1">Toplam Gelir</h3>
            <p className="text-3xl font-bold text-white">
              <AnimatedCounter value={stats.totalRevenue} prefix="₺" decimals={2} />
            </p>
            <p className="text-sm text-blue-400 mt-2">Tüm Zamanlar</p>
          </div>
        </motion.div>

        {/* Canlı Sipariş */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative overflow-hidden bg-gradient-to-br from-yellow-500/20 to-orange-600/20 rounded-2xl p-6 border border-yellow-500/30"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-yellow-500/20 rounded-xl">
                <Package className="w-6 h-6 text-yellow-400" />
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="flex items-center gap-1 text-yellow-400 text-sm"
              >
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                CANLI
              </motion.div>
            </div>
            <h3 className="text-gray-400 text-sm mb-1">Hazırlanan</h3>
            <p className="text-3xl font-bold text-white">{stats.liveOrderCount}</p>
            <p className="text-sm text-yellow-400 mt-2">Sipariş Bekliyor</p>
          </div>
        </motion.div>

        {/* Kullanıcılar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative overflow-hidden bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-2xl p-6 border border-purple-500/30"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Users className="w-6 h-6 text-purple-400" />
              </div>
              <Star className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-gray-400 text-sm mb-1">Toplam Kullanıcı</h3>
            <p className="text-3xl font-bold text-white">{stats.totalUsers}</p>
            <p className="text-sm text-purple-400 mt-2">Kayıtlı Müşteri</p>
          </div>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Satış Trendi */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 bg-gray-800/30 backdrop-blur rounded-2xl p-6 border border-gray-700/50"
        >
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Son 7 Gün Satış Trendi
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.salesTrend}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '12px' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value) => [`₺${value.toFixed(0)}`, 'Satış']}
              />
              <Area type="monotone" dataKey="sales" stroke="#10B981" strokeWidth={3} fill="url(#colorSales)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Son Siparişler */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gray-800/30 backdrop-blur rounded-2xl p-6 border border-gray-700/50"
        >
          <h3 className="text-white font-semibold mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-400" />
              Son Siparişler
            </span>
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Canlı
            </span>
          </h3>
          <div className="space-y-2">
            <AnimatePresence>
              {stats.recentOrders.map((order, index) => (
                <RecentOrderItem key={order.orderId} order={order} index={index} />
              ))}
            </AnimatePresence>
            {stats.recentOrders.length === 0 && (
              <p className="text-gray-500 text-center py-8">Henüz sipariş yok</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popüler Ürünler */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/30 backdrop-blur rounded-2xl p-6 border border-gray-700/50"
        >
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            En Popüler Ürünler
          </h3>
          <div className="space-y-3">
            {stats.popularProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold ${
                    index === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                    index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                    index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' :
                    'bg-gray-700'
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-white font-medium text-sm">{product.name}</p>
                    <p className="text-gray-400 text-xs">{product.quantity} Adet</p>
                  </div>
                </div>
                <p className="text-emerald-400 font-bold">₺{product.revenue.toFixed(0)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Stok Durumu */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-6 border ${
            stats.lowStockProducts.length > 0 
              ? 'bg-red-500/10 border-red-500/30' 
              : 'bg-gray-800/30 border-gray-700/50'
          }`}
        >
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${stats.lowStockProducts.length > 0 ? 'text-red-400' : 'text-gray-400'}`} />
            Stok Durumu
          </h3>
          {stats.lowStockProducts.length > 0 ? (
            <div className="space-y-3">
              {stats.lowStockProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
                  <p className="text-white text-sm truncate flex-1">{product.name}</p>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    product.stock < 5 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {product.stock} Adet
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-emerald-400 font-medium">Tüm ürünler stokta!</p>
              <p className="text-gray-500 text-sm">Stok durumu kritik değil</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardWidgets;
