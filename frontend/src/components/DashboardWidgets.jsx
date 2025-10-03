import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  Activity,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Clock
} from "lucide-react";
import axios from "../lib/axios";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const DashboardWidgets = () => {
  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrders: 0,
    totalRevenue: 0,
    salesTrend: [],
    popularProducts: [],
    lowStockProducts: [],
    liveOrderCount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    
    // Canlı sipariş sayacı için her 5 saniyede bir güncelle
    const interval = setInterval(() => {
      fetchLiveOrderCount();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [analyticsRes, productsRes, ordersRes] = await Promise.all([
        axios.get("/analytics"),
        axios.get("/products"),
        axios.get("/orders-analytics")
      ]);

      const analytics = analyticsRes.data;
      const products = productsRes.data.products || [];
      const orders = ordersRes.data.orderAnalyticsData?.usersOrders || [];

      // Bugünkü satışları hesapla
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const allOrders = orders.flatMap(user => user.orders || []);
      const todayOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= today;
      });

      const todaySales = todayOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      // Popüler ürünleri hesapla
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

      // Stokta azalan ürünler (stok < 10)
      const lowStockProducts = products
        .filter(p => p.stock < 10)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5);

      // Son 7 günün satış trendi
      const salesTrend = getLast7DaysSales(allOrders);

      setStats({
        todaySales,
        todayOrders: todayOrders.length,
        totalRevenue: analytics.totalRevenue || 0,
        salesTrend,
        popularProducts,
        lowStockProducts,
        liveOrderCount: allOrders.filter(o => o.status === "Hazırlanıyor").length
      });
    } catch (error) {
      console.error("Dashboard verileri yüklenirken hata:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveOrderCount = async () => {
    try {
      const res = await axios.get("/orders-analytics");
      const orders = res.data.orderAnalyticsData?.usersOrders || [];
      const allOrders = orders.flatMap(user => user.orders || []);
      const liveCount = allOrders.filter(o => o.status === "Hazırlanıyor").length;
      
      setStats(prev => ({ ...prev, liveOrderCount: liveCount }));
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
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bugünkü Satış */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-xl p-6 border border-emerald-500/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <DollarSign className="w-6 h-6 text-emerald-400" />
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Bugünkü Satış</h3>
          <p className="text-3xl font-bold text-white">₺{stats.todaySales.toFixed(2)}</p>
          <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
            <ArrowUp className="w-3 h-3" />
            {stats.todayOrders} Sipariş
          </p>
        </motion.div>

        {/* Toplam Gelir */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl p-6 border border-blue-500/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-400" />
            </div>
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Toplam Gelir</h3>
          <p className="text-3xl font-bold text-white">₺{stats.totalRevenue.toFixed(2)}</p>
          <p className="text-xs text-blue-400 mt-2">Tüm Zamanlar</p>
        </motion.div>

        {/* Canlı Sipariş Sayacı */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 rounded-xl p-6 border border-yellow-500/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-500/20 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-yellow-400" />
            </div>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Clock className="w-5 h-5 text-yellow-400" />
            </motion.div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Hazırlanan Siparişler</h3>
          <p className="text-3xl font-bold text-white">{stats.liveOrderCount}</p>
          <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
            <Activity className="w-3 h-3 animate-pulse" />
            Canlı
          </p>
        </motion.div>

        {/* Düşük Stok Uyarısı */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-red-500/20 to-red-600/20 rounded-xl p-6 border border-red-500/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <Package className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Düşük Stok</h3>
          <p className="text-3xl font-bold text-white">{stats.lowStockProducts.length}</p>
          <p className="text-xs text-red-400 mt-2">Ürün Azaldı</p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Günlük Satış Trendi */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gray-700/50 rounded-xl p-6 border border-gray-600"
        >
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Son 7 Gün Satış Trendi
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
              <Line type="monotone" dataKey="sales" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981' }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Popüler Ürünler */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gray-700/50 rounded-xl p-6 border border-gray-600"
        >
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            En Popüler Ürünler (Top 5)
          </h3>
          <div className="space-y-3">
            {stats.popularProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-emerald-400">#{index + 1}</span>
                  <div>
                    <p className="text-white font-medium text-sm">{product.name}</p>
                    <p className="text-gray-400 text-xs">{product.quantity} Adet Satıldı</p>
                  </div>
                </div>
                <p className="text-emerald-400 font-bold">₺{product.revenue.toFixed(2)}</p>
              </div>
            ))}
            {stats.popularProducts.length === 0 && (
              <p className="text-gray-400 text-center py-4">Henüz satış yok</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Düşük Stok Uyarıları */}
      {stats.lowStockProducts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/30 rounded-xl p-6"
        >
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            ⚠️ Stokta Azalan Ürünler
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {stats.lowStockProducts.map((product, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4 border border-red-500/20">
                <p className="text-white font-medium mb-1 truncate">{product.name}</p>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Stok:</span>
                  <span className={`font-bold ${product.stock < 5 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {product.stock} Adet
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default DashboardWidgets;

