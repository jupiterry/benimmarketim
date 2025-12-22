import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Clock,
  BarChart2, PieChart, Activity, Package2, MapPin, RefreshCw,
  Calendar, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, change, color, prefix = "", suffix = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`relative overflow-hidden backdrop-blur-xl bg-gradient-to-br ${color} p-5 rounded-2xl border border-white/10`}
  >
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2.5 rounded-xl bg-white/10">
          <Icon className="w-5 h-5 text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${change >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-white/70 text-xs font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{prefix}{typeof value === 'number' ? value.toLocaleString('tr-TR') : value}{suffix}</p>
    </div>
  </motion.div>
);

// Hourly Chart Component
const HourlyChart = ({ data }) => {
  const maxOrders = Math.max(...data.map(d => d.orders), 1);
  
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">Saatlik Sipariş Dağılımı</h3>
      </div>
      <div className="flex items-end justify-between gap-1 h-40">
        {Array.from({ length: 24 }, (_, hour) => {
          const hourData = data.find(d => d.hour === hour) || { orders: 0 };
          const height = (hourData.orders / maxOrders) * 100;
          return (
            <div key={hour} className="flex-1 flex flex-col items-center group">
              <div className="relative w-full">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.5, delay: hour * 0.02 }}
                  className={`w-full rounded-t-sm transition-colors ${
                    hourData.orders > 0 ? 'bg-gradient-to-t from-blue-500 to-cyan-400' : 'bg-gray-700/50'
                  } group-hover:opacity-80`}
                  style={{ minHeight: '4px' }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  {hourData.orders} sipariş
                </div>
              </div>
              <span className="text-[10px] text-gray-500 mt-1">{hour}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
};

// Category Breakdown Component
const CategoryBreakdown = ({ data }) => {
  const colors = [
    'from-emerald-500 to-teal-500',
    'from-blue-500 to-indigo-500',
    'from-purple-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-red-500 to-rose-500',
    'from-cyan-500 to-blue-500',
    'from-violet-500 to-purple-500',
  ];
  
  const sortedData = [...data].sort((a, b) => b.percentage - a.percentage).slice(0, 7);
  
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <PieChart className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Kategori Dağılımı</h3>
      </div>
      <div className="space-y-3">
        {sortedData.map((cat, idx) => (
          <div key={cat.name || idx} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300 capitalize">{cat.name || 'Diğer'}</span>
              <span className="text-white font-medium">{cat.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${cat.percentage}%` }}
                transition={{ duration: 0.8, delay: idx * 0.1 }}
                className={`h-full bg-gradient-to-r ${colors[idx % colors.length]} rounded-full`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Top Products Component
const TopProducts = ({ data }) => (
  <div className="glass rounded-2xl p-6">
    <div className="flex items-center gap-2 mb-6">
      <TrendingUp className="w-5 h-5 text-emerald-400" />
      <h3 className="text-lg font-semibold text-white">En Çok Satan Ürünler</h3>
    </div>
    <div className="space-y-3">
      {data.slice(0, 5).map((product, idx) => (
        <motion.div
          key={product._id || idx}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.1 }}
          className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold ${
            idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
            idx === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
            idx === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' :
            'bg-gray-700'
          }`}>
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{product.name || 'İsimsiz Ürün'}</p>
            <p className="text-gray-500 text-xs">{product.totalSales} adet satıldı</p>
          </div>
          <div className="text-right">
            <p className="text-emerald-400 font-bold">₺{product.revenue?.toFixed(0)}</p>
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

// Order Status Component
const OrderStatusBreakdown = ({ data }) => {
  const statusColors = {
    'Hazırlanıyor': 'from-blue-500 to-indigo-500',
    'Yolda': 'from-amber-500 to-orange-500',
    'Teslim Edildi': 'from-emerald-500 to-teal-500',
    'İptal Edildi': 'from-red-500 to-rose-500',
  };
  
  const statusIcons = {
    'Hazırlanıyor': '📦',
    'Yolda': '🚚',
    'Teslim Edildi': '✅',
    'İptal Edildi': '❌',
  };
  
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <Package2 className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-white">Sipariş Durumları</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.map((status, idx) => (
          <motion.div
            key={status.status}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className={`p-4 rounded-xl bg-gradient-to-br ${statusColors[status.status] || 'from-gray-600 to-gray-700'} bg-opacity-20 border border-white/10`}
          >
            <div className="text-2xl mb-2">{statusIcons[status.status] || '📋'}</div>
            <p className="text-white font-bold text-xl">{status.count}</p>
            <p className="text-white/70 text-xs">{status.status}</p>
            <p className="text-white/50 text-xs">%{status.percentage || 0}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// Main Component
const AdvancedAnalyticsTab = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('week');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/analytics?timeRange=${timeRange}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error("Analytics error:", error);
      toast.error("Analitik verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-20">
        <Activity className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">Analitik verileri yüklenemedi</p>
        <button onClick={fetchAnalytics} className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-xl">
          Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-emerald-400" />
            Gelişmiş Analitik
          </h2>
          <p className="text-gray-400 text-sm mt-1">Detaylı satış ve müşteri analizi</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-gray-800/50 border border-gray-700 text-white px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="week">Son 7 Gün</option>
            <option value="month">Son 30 Gün</option>
            <option value="year">Son 1 Yıl</option>
          </select>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchAnalytics}
            className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Toplam Gelir"
          value={analytics.totalRevenue?.toFixed(0)}
          prefix="₺"
          change={analytics.revenueChange}
          color="from-emerald-500/20 to-teal-600/20"
        />
        <StatCard
          icon={ShoppingBag}
          label="Ortalama Sipariş"
          value={analytics.averageOrderValue?.toFixed(0)}
          prefix="₺"
          color="from-blue-500/20 to-indigo-600/20"
        />
        <StatCard
          icon={Users}
          label="Dönüşüm Oranı"
          value={analytics.conversionRate?.toFixed(1)}
          suffix="%"
          color="from-purple-500/20 to-pink-600/20"
        />
        <StatCard
          icon={Activity}
          label="Müşteri Sadakati"
          value={analytics.customerRetention?.toFixed(1)}
          suffix="%"
          color="from-amber-500/20 to-orange-600/20"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Distribution */}
        <HourlyChart data={analytics.hourlyData || []} />
        
        {/* Category Breakdown */}
        <CategoryBreakdown data={analytics.categoryBreakdown || []} />
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <TopProducts data={analytics.popularProducts || []} />
        
        {/* Order Status */}
        <OrderStatusBreakdown data={analytics.orderStatusBreakdown || []} />
      </div>

      {/* Daily Sales Chart */}
      {analytics.salesByDay && analytics.salesByDay.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Günlük Satış Trendi</h3>
            </div>
            <div className="text-sm text-gray-400">
              Toplam: ₺{analytics.salesByDay.reduce((sum, d) => sum + d.amount, 0).toLocaleString('tr-TR')}
            </div>
          </div>
          
          {/* Chart Container */}
          <div className="relative">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-xs text-gray-500">
              <span>₺{Math.max(...analytics.salesByDay.map(d => d.amount)).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
              <span>₺{(Math.max(...analytics.salesByDay.map(d => d.amount)) / 2).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
              <span>₺0</span>
            </div>
            
            {/* Bars Container */}
            <div className="ml-14 flex items-end gap-1 h-52">
              {analytics.salesByDay.map((day, idx) => {
                const maxAmount = Math.max(...analytics.salesByDay.map(d => d.amount));
                const heightPercent = maxAmount > 0 ? (day.amount / maxAmount) * 100 : 0;
                
                return (
                  <div key={day.date || idx} className="flex-1 flex flex-col items-center group h-full justify-end">
                    {/* Bar */}
                    <div className="w-full relative flex items-end justify-center" style={{ height: '100%' }}>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(heightPercent, 2)}%` }}
                        transition={{ duration: 0.6, delay: idx * 0.03, ease: "easeOut" }}
                        className={`w-full max-w-8 rounded-t-md ${
                          day.amount > 0 
                            ? 'bg-gradient-to-t from-emerald-600 via-emerald-500 to-teal-400' 
                            : 'bg-gray-700/30'
                        } group-hover:from-emerald-500 group-hover:to-cyan-300 transition-all cursor-pointer`}
                      />
                      
                      {/* Tooltip */}
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-800/95 backdrop-blur text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-xl border border-white/10">
                        <div className="font-bold text-emerald-400">₺{day.amount.toLocaleString('tr-TR')}</div>
                        <div className="text-gray-400">{new Date(day.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</div>
                      </div>
                    </div>
                    
                    {/* Date Label */}
                    <span className="text-[9px] text-gray-500 mt-2 whitespace-nowrap">
                      {new Date(day.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedAnalyticsTab;
