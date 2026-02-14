import { useEffect, useState, useCallback } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Package2, ChevronLeft, ChevronRight, RefreshCw, Filter, X,
  Clock, Truck, CheckCircle2, XCircle, Calendar, ShoppingBag, TrendingUp,
  ChevronDown
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";
import { useConfirm } from "./ConfirmModal";
import { useCartNotification } from "../context/CartNotificationContext";
import { filterOrders, handlePrint, statusConfig, getWarningLevel, getWaitingMinutes } from "./orders/OrderHelpers";
import { SummaryCard, StatusBadge, QuickActionMenu, OrderDetailModal, AddItemModal } from "./orders/OrderSubComponents";

const OrdersList = () => {
  const [orderAnalyticsData, setOrderAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [deliveryPointFilter, setDeliveryPointFilter] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const ordersPerPage = 10;

  // Modals
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [customItemAmount, setCustomItemAmount] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [addItemTab, setAddItemTab] = useState("catalog");
  const [productList, setProductList] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [detailModalOrder, setDetailModalOrder] = useState(null);

  const { confirm } = useConfirm();
  const { showNotification } = useCartNotification();

  // ─── Data Fetching ───
  const fetchOrderAnalyticsData = useCallback(async () => {
    try {
      const response = await axios.get("/orders-analytics");
      const sortedUsersOrders = response.data.orderAnalyticsData?.usersOrders?.map(uo => ({
        ...uo,
        orders: uo.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      })) || [];
      setOrderAnalyticsData({
        totalOrders: response.data.orderAnalyticsData?.totalOrders || 0,
        usersOrders: sortedUsersOrders,
      });
      setLastRefresh(new Date());
    } catch (error) {
      console.error("API hatası:", error.response || error.message);
      toast.error("Siparişler yüklenirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrderAnalyticsData();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();

    const socket = socketService.connect();
    if (socket.connected) socket.emit('joinAdminRoom');
    else socket.on('connect', () => socket.emit('joinAdminRoom'));

    const handleNewOrder = (data) => {
      fetchOrderAnalyticsData();
      const order = data.order;

      // Browser notification (kept)
      const customerName = order?.customerName || 'Müşteri';
      const totalAmount = order?.totalAmount?.toFixed(2) || '0';
      const firstProduct = order?.products?.[0]?.name || 'Ürün';
      const productCount = order?.products?.length || 0;

      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('🛍️ Yeni Sipariş!', {
          body: `${customerName} - ₺${totalAmount}\n${productCount > 1 ? `${firstProduct} +${productCount - 1} ürün` : firstProduct}`,
          icon: '/favicon.ico', badge: '/favicon.ico', tag: `new-order-${Date.now()}`, requireInteraction: true, vibrate: [200, 100, 200]
        });
        notification.onclick = () => { window.focus(); notification.close(); };
      }

      // Trigger persistent notification via context (sound + UI + 10min loop)
      showNotification({ customerName, totalAmount, firstProduct, productCount });
    };

    socket.on('newOrder', handleNewOrder);
    return () => socket.off('newOrder', handleNewOrder);
  }, [fetchOrderAnalyticsData, showNotification]);

  useEffect(() => {
    let interval;
    if (autoRefresh) interval = setInterval(fetchOrderAnalyticsData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchOrderAnalyticsData]);

  // ─── Actions ───
  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put("/orders-analytics/update-status", { orderId, status });
      setOrderAnalyticsData(prev => ({
        ...prev,
        usersOrders: prev.usersOrders.map(uo => ({
          ...uo,
          orders: uo.orders.map(o => o.orderId === orderId ? { ...o, status } : o),
        })),
      }));
      toast.success("Sipariş durumu güncellendi");
    } catch (error) {
      toast.error("Sipariş durumu güncellenirken hata oluştu");
    }
  };

  const handleDeleteOrder = async (orderId) => {
    const confirmed = await confirm({ title: 'Siparişi Sil', message: 'Bu siparişi kalıcı olarak silmek istediğinize emin misiniz?', confirmText: 'Evet, Sil', cancelText: 'İptal', type: 'danger' });
    if (!confirmed) return;
    try {
      await axios.delete(`/orders-analytics/delete-order/${orderId}`);
      setOrderAnalyticsData(prev => ({
        ...prev,
        usersOrders: prev.usersOrders.map(uo => ({
          ...uo, orders: uo.orders.filter(o => o.orderId !== orderId),
        })).filter(uo => uo.orders.length > 0),
      }));
      toast.success("Sipariş silindi");
    } catch (error) {
      toast.error(error.response?.data?.message || "Sipariş silinirken hata oluştu");
    }
  };

  const handleOpenAddItemModal = async (orderId) => {
    setSelectedOrderId(orderId); setCustomItemAmount(""); setCustomItemName("");
    setAddItemTab("catalog"); setProductSearch(""); setSelectedProduct(null);
    setProductQuantity(1); setShowAddItemModal(true);
    setLoadingProducts(true);
    try {
      const r = await axios.get("/products");
      setProductList(r.data.products || []);
    } catch { toast.error("Ürünler yüklenemedi"); }
    finally { setLoadingProducts(false); }
  };

  const handleAddProductFromCatalog = async () => {
    if (!selectedOrderId || !selectedProduct) return toast.error("Lütfen bir ürün seçin");
    try {
      await axios.put("/orders-analytics/add-product", { orderId: selectedOrderId, productId: selectedProduct._id, quantity: productQuantity });
      toast.success(`${selectedProduct.name} eklendi`);
      setShowAddItemModal(false);
      fetchOrderAnalyticsData();
    } catch (error) { toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu"); }
  };

  const handleAddCustomItem = async (e) => {
    e.preventDefault();
    if (!selectedOrderId || !customItemAmount) return;
    try {
      await axios.put("/orders-analytics/add-item", { orderId: selectedOrderId, amount: customItemAmount, name: customItemName });
      toast.success("Ürün eklendi");
      setShowAddItemModal(false);
      fetchOrderAnalyticsData();
    } catch (error) { toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu"); }
  };

  const filteredProductList = productList.filter(p =>
    p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const clearFilters = () => {
    setSearchTerm(""); setStatusFilter("all"); setDateFilter("all");
    setDeliveryPointFilter("all"); setMinAmount(""); setMaxAmount(""); setCurrentPage(1);
  };

  // ─── Derived Data ───
  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-[20px] bg-white/[0.03] border border-white/[0.06] p-6 h-[140px]" />
          ))}
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] h-12" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.04] h-16" />)}
        </div>
      </div>
    );
  }

  if (!orderAnalyticsData?.usersOrders?.length) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[400px] rounded-3xl bg-white/[0.02] border border-white/[0.06]">
        <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-6xl mb-6">📦</motion.div>
        <h3 className="text-xl font-bold text-white mb-1">Henüz sipariş yok</h3>
        <p className="text-gray-500 text-sm">Yeni siparişler burada görünecek</p>
      </motion.div>
    );
  }

  const allFilteredOrders = orderAnalyticsData.usersOrders.flatMap(uo => {
    const sorted = [...uo.orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const firstId = sorted[0]?.orderId;
    const total = uo.orders.length;
    const mapped = uo.orders.map(o => ({ ...o, user: uo.user, isFirstOrder: o.orderId === firstId, userOrderCount: total }));
    return filterOrders(mapped, { searchTerm, statusFilter, dateFilter, deliveryPointFilter, minAmount, maxAmount });
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totalPages = Math.ceil(allFilteredOrders.length / ordersPerPage);
  const currentOrders = allFilteredOrders.slice((currentPage - 1) * ordersPerPage, currentPage * ordersPerPage);

  const allOrders = orderAnalyticsData.usersOrders.flatMap(uo => uo.orders);
  const stats = {
    pending: allOrders.filter(o => o.status === "Hazırlanıyor" || o.status === "Yolda").length,
    completed: allOrders.filter(o => o.status === "Teslim Edildi").length,
    cancelled: allOrders.filter(o => o.status === "İptal Edildi").length,
  };

  return (
    <div className="space-y-8">
      {/* ─── HEADER ─── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sipariş Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-1">Son güncelleme: {lastRefresh.toLocaleTimeString('tr-TR')}</p>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/[0.03] text-gray-500 border-white/[0.06]'
            }`}>
          <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
          {autoRefresh ? 'Otomatik Yenileme Açık' : 'Otomatik Yenileme Kapalı'}
        </motion.button>
      </motion.div>

      {/* ─── SUMMARY CARDS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <SummaryCard title="Bekleyen Siparişler" count={stats.pending} icon={Clock}
          gradient="bg-gradient-to-br from-amber-500/[0.08] to-orange-500/[0.04]"
          borderColor="border-amber-500/30 ring-amber-500/20"
          onClick={() => { setStatusFilter(statusFilter === "Hazırlanıyor" ? "all" : "Hazırlanıyor"); setCurrentPage(1); }}
          active={statusFilter === "Hazırlanıyor"} />
        <SummaryCard title="Tamamlanan" count={stats.completed} icon={CheckCircle2}
          gradient="bg-gradient-to-br from-emerald-500/[0.08] to-teal-500/[0.04]"
          borderColor="border-emerald-500/30 ring-emerald-500/20"
          onClick={() => { setStatusFilter(statusFilter === "Teslim Edildi" ? "all" : "Teslim Edildi"); setCurrentPage(1); }}
          active={statusFilter === "Teslim Edildi"} />
        <SummaryCard title="İptal Edilen" count={stats.cancelled} icon={XCircle}
          gradient="bg-gradient-to-br from-rose-500/[0.08] to-pink-500/[0.04]"
          borderColor="border-rose-500/30 ring-rose-500/20"
          onClick={() => { setStatusFilter(statusFilter === "İptal Edildi" ? "all" : "İptal Edildi"); setCurrentPage(1); }}
          active={statusFilter === "İptal Edildi"} />
      </div>

      {/* ─── FILTERS ─── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
            <input type="text" placeholder="Sipariş ara (ID, ürün, müşteri)..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.06] text-white text-sm rounded-xl focus:outline-none focus:border-violet-500/40 placeholder-gray-600 transition-colors"
              value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="bg-white/[0.03] border border-white/[0.06] text-gray-300 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-violet-500/40 appearance-none cursor-pointer">
              <option value="all">Tüm Durumlar</option>
              <option value="Hazırlanıyor">⏳ Hazırlanıyor</option>
              <option value="Yolda">🚚 Yolda</option>
              <option value="Teslim Edildi">✓ Teslim Edildi</option>
              <option value="İptal Edildi">✕ İptal Edildi</option>
            </select>
            <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
              className="bg-white/[0.03] border border-white/[0.06] text-gray-300 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-violet-500/40 appearance-none cursor-pointer">
              <option value="all">Tüm Tarihler</option>
              <option value="today">Bugün</option>
              <option value="yesterday">Dün</option>
              <option value="lastWeek">Son 7 Gün</option>
              <option value="lastMonth">Son 30 Gün</option>
            </select>
            <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm transition-all border ${showAdvancedFilters ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-white/[0.03] text-gray-500 border-white/[0.06] hover:text-gray-300'
                }`}>
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gelişmiş</span>
            </button>
            {(searchTerm || statusFilter !== "all" || dateFilter !== "all") && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-colors border border-rose-500/15">
                <X className="w-3 h-3" /> Temizle
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAdvancedFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="pt-4 mt-4 border-t border-white/[0.04] grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[11px] text-gray-500 font-medium mb-1.5 block uppercase tracking-wider">Teslimat Noktası</label>
                  <select value={deliveryPointFilter} onChange={(e) => setDeliveryPointFilter(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.06] text-gray-300 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-violet-500/40">
                    <option value="all">Tümü</option>
                    <option value="girlsDorm">Kız KYK Yurdu</option>
                    <option value="boysDorm">Erkek KYK Yurdu</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium mb-1.5 block uppercase tracking-wider">Minimum Tutar (₺)</label>
                  <input type="number" placeholder="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-violet-500/40 placeholder-gray-600" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium mb-1.5 block uppercase tracking-wider">Maximum Tutar (₺)</label>
                  <input type="number" placeholder="∞" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-violet-500/40 placeholder-gray-600" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ─── RESULTS INFO ─── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          <span className="text-white font-semibold">{allFilteredOrders.length}</span> sipariş bulundu
        </p>
      </div>

      {/* ─── ORDERS TABLE ─── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Sipariş</th>
                <th className="text-left px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Müşteri</th>
                <th className="text-left px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Tarih</th>
                <th className="text-left px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Tutar</th>
                <th className="text-left px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Durum</th>
                <th className="text-right px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {currentOrders.map((order, idx) => {
                  const wl = getWarningLevel(order.createdAt, order.status);
                  return (
                    <motion.tr key={order.orderId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => setDetailModalOrder(order)}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors group ${order.status === 'Hazırlanıyor'
                          ? 'border-l-4 border-l-amber-500 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]'
                          : wl === 'critical' ? 'bg-rose-500/[0.03]' : ''
                        }`}>

                      {/* Order Number */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${order.status === "İptal Edildi" ? "bg-rose-500/10 text-rose-400" :
                            order.status === "Teslim Edildi" ? "bg-emerald-500/10 text-emerald-400" :
                              order.status === "Yolda" ? "bg-sky-500/10 text-sky-400" :
                                "bg-amber-500/10 text-amber-400"
                            }`}>
                            {statusConfig[order.status]?.icon}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white font-mono">#{order.orderId.slice(-6).toUpperCase()}</p>
                            <p className="text-[11px] text-gray-600">{order.products?.length || 0} ürün</p>
                          </div>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/10 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {order.user?.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate max-w-[140px]">{order.user?.name}</p>
                            <p className="text-[11px] text-gray-600 truncate max-w-[140px]">{order.user?.email}</p>
                          </div>
                          {order.isFirstOrder && (
                            <span className="px-1.5 py-0.5 bg-fuchsia-500/15 text-fuchsia-400 text-[9px] font-bold rounded-md uppercase">Yeni</span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-300">{new Date(order.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</p>
                        <p className="text-[11px] text-gray-600">{new Date(order.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-white">₺{order.totalAmount?.toFixed(2)}</p>
                        {order.couponCode && <p className="text-[11px] text-violet-400">🎟️ {order.couponCode}</p>}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={order.status} />
                        {wl && (
                          <p className={`text-[10px] mt-1 font-medium ${wl === 'critical' ? 'text-rose-400' : 'text-amber-400'}`}>
                            ⚠ {getWaitingMinutes(order.createdAt)}dk bekliyor
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <QuickActionMenu order={order}
                          onStatusUpdate={updateOrderStatus}
                          onPrint={() => handlePrint(order)}
                          onViewDetail={(o) => setDetailModalOrder(o)}
                          onAddItem={handleOpenAddItemModal}
                          onDelete={handleDeleteOrder} />
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-white/[0.04]">
          <AnimatePresence mode="popLayout">
            {currentOrders.map((order, idx) => (
              <motion.div key={order.orderId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setDetailModalOrder(order)}
                className={`p-4 hover:bg-white/[0.02] cursor-pointer transition-colors ${order.status === 'Hazırlanıyor'
                    ? 'border-l-4 border-l-amber-500 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]'
                    : ''
                  }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 border border-violet-500/10 flex items-center justify-center text-white text-sm font-bold">
                      {order.user?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{order.user?.name}</p>
                      <p className="text-xs text-gray-600 font-mono">#{order.orderId.slice(-6).toUpperCase()}</p>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <QuickActionMenu order={order} onStatusUpdate={updateOrderStatus} onPrint={() => handlePrint(order)}
                      onViewDetail={(o) => setDetailModalOrder(o)} onAddItem={handleOpenAddItemModal} onDelete={handleDeleteOrder} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={order.status} />
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">₺{order.totalAmount?.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-600">{new Date(order.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ─── PAGINATION ─── */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1.5 pt-2">
          <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
            className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-400 disabled:opacity-30 hover:bg-white/[0.06] transition-all disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            let num;
            if (totalPages <= 5) num = i + 1;
            else if (currentPage <= 3) num = i + 1;
            else if (currentPage >= totalPages - 2) num = totalPages - 4 + i;
            else num = currentPage - 2 + i;
            return (
              <button key={i} onClick={() => setCurrentPage(num)}
                className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${currentPage === num ? 'bg-violet-500 text-white' : 'bg-white/[0.03] text-gray-500 hover:text-white border border-white/[0.06]'
                  }`}>{num}</button>
            );
          })}
          <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}
            className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-400 disabled:opacity-30 hover:bg-white/[0.06] transition-all disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── MODALS ─── */}
      <OrderDetailModal order={detailModalOrder} isOpen={!!detailModalOrder} onClose={() => setDetailModalOrder(null)}
        onStatusUpdate={updateOrderStatus} onPrint={(o) => handlePrint(o)} onDelete={handleDeleteOrder} />

      <AddItemModal isOpen={showAddItemModal} onClose={() => setShowAddItemModal(false)}
        addItemTab={addItemTab} setAddItemTab={setAddItemTab}
        productSearch={productSearch} setProductSearch={setProductSearch}
        filteredProducts={filteredProductList} loadingProducts={loadingProducts}
        selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct}
        productQuantity={productQuantity} setProductQuantity={setProductQuantity}
        onAddFromCatalog={handleAddProductFromCatalog}
        customItemAmount={customItemAmount} setCustomItemAmount={setCustomItemAmount}
        customItemName={customItemName} setCustomItemName={setCustomItemName}
        onAddCustom={handleAddCustomItem} />
    </div>
  );
};

export default OrdersList;