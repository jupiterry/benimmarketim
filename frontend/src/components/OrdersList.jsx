import { useEffect, useState } from "react";
import axios from "../lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Package2, ChevronLeft, ChevronRight, RefreshCw, Printer, Filter, X, 
  Clock, Truck, CheckCircle2, XCircle, MapPin, Phone, Mail, User, Calendar,
  TrendingUp, ShoppingBag, AlertTriangle
} from "lucide-react";
import toast from "react-hot-toast";
import socketService from "../lib/socket.js";

// Skeleton Loading Component
const SkeletonCard = () => (
  <div className="glass rounded-2xl p-5 space-y-4">
    <div className="flex justify-between items-start">
      <div className="space-y-2">
        <div className="skeleton h-5 w-32 rounded-lg"></div>
        <div className="skeleton h-4 w-24 rounded-lg"></div>
      </div>
      <div className="skeleton h-8 w-20 rounded-full"></div>
    </div>
    <div className="skeleton h-20 w-full rounded-xl"></div>
    <div className="space-y-2">
      <div className="skeleton h-16 w-full rounded-xl"></div>
      <div className="skeleton h-16 w-full rounded-xl"></div>
    </div>
  </div>
);

// Modern Stat Card Component
const StatCard = ({ icon: Icon, title, value, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className={`stat-card glass rounded-2xl p-5 relative overflow-hidden group cursor-default`}
  >
    <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-20 group-hover:opacity-30 transition-opacity duration-300`}></div>
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <TrendingUp className="w-4 h-4 text-gray-500 group-hover:text-emerald-400 transition-colors" />
      </div>
      <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-3xl font-bold text-white"
      >
        {value}
      </motion.p>
    </div>
    <div className={`absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${color} opacity-10 blur-xl group-hover:opacity-20 transition-opacity`}></div>
  </motion.div>
);

// Status Timeline Component
const StatusTimeline = ({ status }) => {
  const statuses = [
    { key: "Hazırlanıyor", icon: Clock, label: "Hazırlanıyor" },
    { key: "Yolda", icon: Truck, label: "Yolda" },
    { key: "Teslim Edildi", icon: CheckCircle2, label: "Teslim Edildi" }
  ];
  
  const isCancelled = status === "İptal Edildi";
  const currentIndex = statuses.findIndex(s => s.key === status);

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-xl">
        <XCircle className="w-5 h-5 text-red-400" />
        <span className="text-red-400 font-medium">İptal Edildi</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 w-full">
      {statuses.map((s, index) => {
        const isActive = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const Icon = s.icon;
        
        return (
          <div key={s.key} className="flex items-center flex-1">
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: isCurrent ? 1.1 : 1 }}
              className={`timeline-dot flex items-center justify-center w-8 h-8 rounded-full ${
                isActive 
                  ? isCurrent 
                    ? 'bg-emerald-500 active' 
                    : 'bg-emerald-600/50' 
                  : 'bg-gray-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
            </motion.div>
            {index < statuses.length - 1 && (
              <div className={`flex-1 h-1 mx-1 rounded-full ${
                index < currentIndex ? 'bg-emerald-500' : 'bg-gray-700'
              }`}></div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Order Card Component
const OrderCard = ({ order, index, onStatusUpdate, onPrint, onAddItem }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const getCardGradient = () => {
    switch (order.status) {
      case "Yolda": return "from-amber-500/10 to-orange-500/10 border-amber-500/30";
      case "Teslim Edildi": return "from-blue-500/10 to-indigo-500/10 border-blue-500/30";
      case "İptal Edildi": return "from-red-500/10 to-pink-500/10 border-red-500/30";
      default: return "from-emerald-500/10 to-teal-500/10 border-emerald-500/30";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      layout
      className={`order-card glass rounded-2xl p-5 border bg-gradient-to-br ${getCardGradient()}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-emerald-400" />
            <h3 className="text-lg font-bold text-white">{order.user.name}</h3>
          </div>
          <p className="text-xs text-gray-500 font-mono">#{order.orderId.slice(-8).toUpperCase()}</p>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onAddItem(order.orderId)}
            className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors"
            title="Ürün Ekle"
          >
            <span className="text-lg font-bold">+</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onPrint(order)}
            className="p-2 rounded-xl bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition-colors"
            title="Yazdır"
          >
            <Printer className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* Status Timeline */}
      <div className="mb-4">
        <StatusTimeline status={order.status} />
      </div>

      {/* Status Selector */}
      <div className="mb-4">
        <select
          className={`modern-select w-full px-4 py-3 rounded-xl font-semibold transition-all cursor-pointer ${
            order.status === "Teslim Edildi"
              ? "bg-blue-500/30 text-blue-300 border border-blue-500/40"
              : order.status === "Yolda"
              ? "bg-amber-500/30 text-amber-300 border border-amber-500/40"
              : order.status === "İptal Edildi"
              ? "bg-red-500/30 text-red-300 border border-red-500/40"
              : "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
          }`}
          value={order.status}
          onChange={(e) => onStatusUpdate(order.orderId, e.target.value)}
        >
          <option value="Hazırlanıyor">📦 Hazırlanıyor</option>
          <option value="Yolda">🚚 Yolda</option>
          <option value="Teslim Edildi">✅ Teslim Edildi</option>
          <option value="İptal Edildi">❌ İptal Edildi</option>
        </select>
      </div>

      {/* Customer Info */}
      <motion.div 
        className="glass-dark rounded-xl p-3 mb-4 space-y-2"
        initial={false}
      >
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Mail className="w-4 h-4 text-gray-500" />
          <span className="truncate">{order.user.email}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Phone className="w-4 h-4 text-gray-500" />
          <span>{order.user.phone || "Belirtilmemiş"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <MapPin className="w-4 h-4 text-gray-500" />
          <span className="truncate">{order.deliveryPointName || order.city || "Belirtilmemiş"}</span>
        </div>
      </motion.div>

      {/* Order Summary */}
      <div className="flex items-center justify-between mb-4 px-3 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-emerald-400" />
          <span className="text-gray-400 text-sm">{order.products.length} ürün</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-emerald-400">₺{order.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
        <Calendar className="w-3 h-3" />
        {new Date(order.createdAt).toLocaleString("tr-TR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })}
      </div>

      {/* Products Toggle */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
      >
        <Package2 className="w-4 h-4" />
        {isExpanded ? "Ürünleri Gizle" : "Ürünleri Göster"}
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ▼
        </motion.span>
      </motion.button>

      {/* Products List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-2">
              {order.products.map((product, idx) => (
                <motion.div
                  key={idx}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3 p-3 glass-dark rounded-xl"
                >
                  <div className="w-12 h-12 rounded-lg bg-gray-700/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package2 className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{product.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-medium">
                        x{product.quantity}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-emerald-400">₺{product.price}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Note */}
      {order.note && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-amber-400/70 font-medium mb-1">Müşteri Notu</p>
              <p className="text-sm text-amber-200">{order.note}</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

// Main Component
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
  const ordersPerPage = 6;

  // Custom item modal states
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [customItemAmount, setCustomItemAmount] = useState("");
  const [customItemName, setCustomItemName] = useState("");

  const handleOpenAddItemModal = (orderId) => {
    setSelectedOrderId(orderId);
    setCustomItemAmount("");
    setCustomItemName("");
    setShowAddItemModal(true);
  };

  const handleAddCustomItem = async (e) => {
    e.preventDefault();
    if (!selectedOrderId || !customItemAmount) return;

    try {
      await axios.put("/orders-analytics/add-item", {
        orderId: selectedOrderId,
        amount: customItemAmount,
        name: customItemName
      });
      
      toast.success("Ürün başarıyla eklendi");
      setShowAddItemModal(false);
      fetchOrderAnalyticsData();
    } catch (error) {
      console.error("Ürün eklenirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu");
    }
  };

  const handlePrint = (order) => {
    try {
      const printWindow = window.open('', '_blank', 'width=400,height=700');
      if (!printWindow) return;
  
      const css = `
        <style>
          @page { size: 76mm 127mm; margin: 0; }
          html, body {
            width: 76mm;
            height: 127mm;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: Arial, sans-serif;
            color: #000;
            line-height: 1.25;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
  
          .receipt {
            width: 76mm;
            height: 127mm;
            box-sizing: border-box;
            padding: 6mm;
            overflow: hidden;
          }
          .header { text-align: center; margin-bottom: 6px; }
          .title { font-size: 14px; font-weight: bold; }
          .meta { font-size: 11px; }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin: 3px 0;
            gap: 6px;
          }
          .items {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 4px 0;
            margin: 4px 0;
          }
          .item {
            display: grid;
            grid-template-columns: 1fr auto;
            column-gap: 8px;
            font-size: 11px;
            align-items: start;
          }
          .item .name { max-width: 60%; word-break: break-word; }
          .item .price { min-width: 48px; text-align: right; font-weight: bold; }
          .totals { font-size: 12px; font-weight: bold; }
          * { page-break-inside: avoid; }
        </style>
      `;
  
      const createdAt = new Date(order.createdAt).toLocaleString('tr-TR');
      const itemsHtml = order.products.map(p => `
        <div class="item">
          <div class="name">${p.name} x ${p.quantity}</div>
          <div class="price">₺${Number(p.price || 0).toFixed(2)}</div>
        </div>
      `).join('');
  
      const noteHtml = order.note
        ? `<div class="row"><div>Not:</div><div>${order.note}</div></div>`
        : '';
  
      const deliveryInfo = order.deliveryPointName || order.city || 'Teslimat Noktası Belirtilmemiş';
      
      const html = `
        <html>
          <head><meta charset="utf-8"/>${css}</head>
          <body>
            <div class="receipt">
              <div class="header">
                <div class="title">Benim Marketim</div>
                <div class="meta">Sipariş ID: ${order.orderId}</div>
                <div class="meta">Tarih: ${createdAt}</div>
                <div class="meta">📍 ${deliveryInfo}</div>
              </div>
              <div class="row"><div>Müşteri</div><div>${order.user.name}</div></div>
              <div class="row"><div>Telefon</div><div>${order.user.phone || '-'}</div></div>
              <div class="row"><div>Adres</div><div style="max-width: 170px; text-align:right;">${order.user.address || '-'}</div></div>
              <div class="items">${itemsHtml}</div>
              <div class="totals row"><div>Toplam</div><div>₺${(order.totalAmount).toFixed(2)}</div></div>
              ${noteHtml}
            </div>
            <script>
              window.onload = function(){
                try {
                  const el = document.querySelector('.receipt');
                  const maxH = el.clientHeight;
                  const actual = el.scrollHeight;
                  if (actual > maxH) {
                    const scale = maxH / actual;
                    el.style.transformOrigin = 'top left';
                    el.style.transform = 'scale(' + scale.toFixed(3) + ')';
                    el.style.height = maxH + 'px';
                  }
                } catch(e){}
                window.print();
                setTimeout(()=>window.close(), 500);
              }
            <\/script>
          </body>
        </html>
      `;
  
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (e) {
      console.error('Yazdırma hatası:', e);
      toast.error('Yazdırma sırasında hata oluştu');
    }
  };
  
  const fetchOrderAnalyticsData = async () => {
    try {
      const response = await axios.get("/orders-analytics");
      const sortedUsersOrders = response.data.orderAnalyticsData?.usersOrders?.map(userOrder => ({
        ...userOrder,
        orders: userOrder.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      })) || [];

      setOrderAnalyticsData({
        totalOrders: response.data.orderAnalyticsData?.totalOrders || 0,
        usersOrders: sortedUsersOrders,
      });
      setLastRefresh(new Date());
    } catch (error) {
      console.error("API isteği sırasında hata:", error.response || error.message);
      toast.error("Siparişler yüklenirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderAnalyticsData();

    const socket = socketService.connect();

    if (socket.connected) {
        socket.emit('joinAdminRoom');
    } else {
        socket.on('connect', () => {
            socket.emit('joinAdminRoom');
        });
    }

    const handleNewOrder = (data) => {
      console.log('Yeni sipariş bildirimi alındı:', data);
      fetchOrderAnalyticsData();
      toast.success('Yeni sipariş geldi!', {
        icon: '🛍️',
        duration: 4000
      });
    };

    socket.on('newOrder', handleNewOrder);

    return () => {
      socket.off('newOrder', handleNewOrder);
    };
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchOrderAnalyticsData();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put("/orders-analytics/update-status", { orderId, status });
      setOrderAnalyticsData((prevData) => ({
        ...prevData,
        usersOrders: prevData.usersOrders.map((userOrder) => ({
          ...userOrder,
          orders: userOrder.orders.map((order) =>
            order.orderId === orderId ? { ...order, status } : order
          ),
        })),
      }));
      toast.success("Sipariş durumu güncellendi");
    } catch (error) {
      console.error("Sipariş durumu güncellenirken hata:", error);
      toast.error("Sipariş durumu güncellenirken hata oluştu");
    }
  };

  const filterOrders = (orders) => {
    return orders.filter((order) => {
      const matchesSearch = 
        order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.products.some(product => 
          product.name.toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        order.user.name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = 
        statusFilter === "all" || order.status === statusFilter;

      const matchesDeliveryPoint = 
        deliveryPointFilter === "all" || 
        order.deliveryPoint === deliveryPointFilter ||
        order.deliveryPointName?.toLowerCase().includes(deliveryPointFilter.toLowerCase());

      const matchesAmount = 
        (!minAmount || order.totalAmount >= parseFloat(minAmount)) &&
        (!maxAmount || order.totalAmount <= parseFloat(maxAmount));

      const orderDate = new Date(order.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      let matchesDate = true;
      if (dateFilter === "today") {
        matchesDate = orderDate.toDateString() === today.toDateString();
      } else if (dateFilter === "yesterday") {
        matchesDate = orderDate.toDateString() === yesterday.toDateString();
      } else if (dateFilter === "lastWeek") {
        matchesDate = orderDate >= lastWeek;
      } else if (dateFilter === "lastMonth") {
        matchesDate = orderDate >= lastMonth;
      }

      return matchesSearch && matchesStatus && matchesDate && matchesDeliveryPoint && matchesAmount;
    });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFilter("all");
    setDeliveryPointFilter("all");
    setMinAmount("");
    setMaxAmount("");
    setCurrentPage(1);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 space-y-3">
              <div className="skeleton h-10 w-10 rounded-xl"></div>
              <div className="skeleton h-4 w-20 rounded-lg"></div>
              <div className="skeleton h-8 w-16 rounded-lg"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty State
  if (!orderAnalyticsData || !orderAnalyticsData.usersOrders || orderAnalyticsData.usersOrders.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[400px] glass rounded-2xl"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-7xl mb-6"
        >
          📦
        </motion.div>
        <h3 className="text-2xl font-bold text-white mb-2">Henüz sipariş yok</h3>
        <p className="text-gray-400">Yeni siparişler burada görünecek</p>
      </motion.div>
    );
  }

  const filteredOrders = orderAnalyticsData.usersOrders.flatMap(userOrder =>
    filterOrders(userOrder.orders).map(order => ({
      ...order,
      user: userOrder.user
    }))
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const currentOrders = filteredOrders.slice(
    (currentPage - 1) * ordersPerPage,
    currentPage * ordersPerPage
  );

  const stats = {
    total: filteredOrders.length,
    preparing: filteredOrders.filter(o => o.status === "Hazırlanıyor").length,
    onWay: filteredOrders.filter(o => o.status === "Yolda").length,
    delivered: filteredOrders.filter(o => o.status === "Teslim Edildi").length,
    cancelled: filteredOrders.filter(o => o.status === "İptal Edildi").length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-white">Sipariş Yönetimi</h2>
          <p className="text-gray-400 text-sm mt-1">
            Son güncelleme: {lastRefresh.toLocaleTimeString('tr-TR')}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            autoRefresh 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
          <span className="text-sm font-medium">{autoRefresh ? 'Otomatik Yenileme Açık' : 'Otomatik Yenileme Kapalı'}</span>
        </motion.button>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard 
          icon={Package2} 
          title="Toplam Sipariş" 
          value={stats.total} 
          color="from-violet-500 to-purple-600"
          delay={0}
        />
        <StatCard 
          icon={Clock} 
          title="Hazırlanıyor" 
          value={stats.preparing} 
          color="from-emerald-500 to-teal-600"
          delay={0.1}
        />
        <StatCard 
          icon={Truck} 
          title="Yolda" 
          value={stats.onWay} 
          color="from-amber-500 to-orange-600"
          delay={0.2}
        />
        <StatCard 
          icon={CheckCircle2} 
          title="Teslim Edildi" 
          value={stats.delivered} 
          color="from-blue-500 to-indigo-600"
          delay={0.3}
        />
        <StatCard 
          icon={XCircle} 
          title="İptal Edildi" 
          value={stats.cancelled} 
          color="from-red-500 to-rose-600"
          delay={0.4}
        />
      </div>

      {/* Filters */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-5"
      >
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Sipariş ID, ürün veya müşteri ara..."
              className="w-full pl-12 pr-4 py-3 bg-gray-800/50 border border-gray-700/50 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              className="modern-select bg-gray-800/50 border border-gray-700/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">📦 Tüm Durumlar</option>
              <option value="Hazırlanıyor">⏳ Hazırlanıyor</option>
              <option value="Yolda">🚚 Yolda</option>
              <option value="Teslim Edildi">✅ Teslim Edildi</option>
              <option value="İptal Edildi">❌ İptal Edildi</option>
            </select>

            <select
              className="modern-select bg-gray-800/50 border border-gray-700/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">📅 Tüm Tarihler</option>
              <option value="today">📅 Bugün</option>
              <option value="yesterday">📅 Dün</option>
              <option value="lastWeek">📅 Son 7 Gün</option>
              <option value="lastMonth">📅 Son 30 Gün</option>
            </select>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all ${
                showAdvancedFilters 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:text-white'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Gelişmiş</span>
            </motion.button>
          </div>
        </div>

        {/* Advanced Filters */}
        <AnimatePresence>
          {showAdvancedFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="pt-4 mt-4 border-t border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Filter className="w-4 h-4 text-emerald-400" />
                    Gelişmiş Filtreler
                  </h3>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Temizle
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Teslimat Noktası</label>
                    <select
                      className="modern-select w-full bg-gray-800/50 border border-gray-700/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      value={deliveryPointFilter}
                      onChange={(e) => setDeliveryPointFilter(e.target.value)}
                    >
                      <option value="all">Tümü</option>
                      <option value="girlsDorm">Kız KYK Yurdu</option>
                      <option value="boysDorm">Erkek KYK Yurdu</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Minimum Tutar (₺)</label>
                    <input
                      type="number"
                      placeholder="0"
                      className="w-full bg-gray-800/50 border border-gray-700/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Maximum Tutar (₺)</label>
                    <input
                      type="number"
                      placeholder="∞"
                      className="w-full bg-gray-800/50 border border-gray-700/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                    />
                  </div>
                </div>

                {/* Active Filters Tags */}
                {(deliveryPointFilter !== "all" || minAmount || maxAmount) && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {deliveryPointFilter !== "all" && (
                      <span className="status-badge bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-emerald-500/30">
                        📍 {deliveryPointFilter === "girlsDorm" ? "Kız Yurdu" : "Erkek Yurdu"}
                        <button onClick={() => setDeliveryPointFilter("all")} className="hover:text-white ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {minAmount && (
                      <span className="status-badge bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-emerald-500/30">
                        Min: ₺{minAmount}
                        <button onClick={() => setMinAmount("")} className="hover:text-white ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {maxAmount && (
                      <span className="status-badge bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-emerald-500/30">
                        Max: ₺{maxAmount}
                        <button onClick={() => setMaxAmount("")} className="hover:text-white ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Orders Grid */}
      <motion.div 
        layout
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      >
        <AnimatePresence mode="popLayout">
          {currentOrders.map((order, index) => (
            <OrderCard
              key={order.orderId}
              order={order}
              index={index}
              onStatusUpdate={updateOrderStatus}
              onPrint={handlePrint}
              onAddItem={handleOpenAddItemModal}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center items-center gap-2 pt-4"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="p-3 glass rounded-xl text-white disabled:opacity-30 hover:bg-gray-700/50 transition-all disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
          
          <div className="flex items-center gap-1">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-10 h-10 rounded-xl font-medium transition-all ${
                    currentPage === pageNum
                      ? 'bg-emerald-500 text-white'
                      : 'glass text-gray-400 hover:text-white'
                  }`}
                >
                  {pageNum}
                </motion.button>
              );
            })}
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="p-3 glass rounded-xl text-white disabled:opacity-30 hover:bg-gray-700/50 transition-all disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      )}

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAddItemModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddItemModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl p-6 w-full max-w-sm border border-gray-700/50"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Siparişe Ürün Ekle</h3>
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowAddItemModal(false)}
                  className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
              
              <form onSubmit={handleAddCustomItem} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Tutar (TL) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={customItemAmount}
                    onChange={(e) => setCustomItemAmount(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Ürün Adı (Opsiyonel)</label>
                  <input
                    type="text"
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="Özel Ekleme"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAddItemModal(false)}
                    className="flex-1 px-4 py-3 bg-gray-700/50 hover:bg-gray-600/50 text-white rounded-xl transition-colors"
                  >
                    İptal
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-semibold transition-all"
                  >
                    Ekle
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrdersList;