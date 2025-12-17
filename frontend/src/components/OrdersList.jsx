import { useEffect, useState } from "react";
import axios from "../lib/axios";
import { Search, Package2, ChevronLeft, ChevronRight, RefreshCw, Printer, Filter, X } from "lucide-react";
import toast from "react-hot-toast";
import io from "socket.io-client";

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
  const [currentPage, setCurrentPage] = useStsate(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const ordersPerPage = 6;

  const handlePrint = (order) => {
    try {
      const printWindow = window.open('', '_blank', 'width=400,height=700');
      if (!printWindow) return;
  
      const css = `
        <style>
          @page { size: 76mm 127mm; margin: 0; } /* 3x5 inch */
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
            overflow: hidden; /* Taşma olmasın */
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
      console.log("Admin sipariş verileri:", response.data);
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

  // İlk yükleme ve Socket.IO bağlantısı
  useEffect(() => {
    fetchOrderAnalyticsData();

    // Socket.IO bağlantısı
    const socket = io('https://www.devrekbenimmarketim.com', {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Socket.IO bağlantısı başarılı');
      socket.emit('joinAdminRoom');
    });

    socket.on('newOrder', (data) => {
      console.log('Yeni sipariş bildirimi alındı:', data);
      fetchOrderAnalyticsData(); // Siparişleri yenile
      toast.success('Yeni sipariş geldi!', {
        icon: '🛍️',
        duration: 4000
      });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket.IO bağlantı hatası:', error);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Otomatik yenileme
  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchOrderAnalyticsData();
      }, 30000); // Her 30 saniyede bir yenile
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!orderAnalyticsData || !orderAnalyticsData.usersOrders || orderAnalyticsData.usersOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-white">
        <div className="text-6xl mb-4">��</div>
        <div className="text-xl">Henüz sipariş bulunmamaktadır.</div>
      </div>
    );
  }

  // Filtrelenmiş siparişleri sayfalama
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

  // Özel ürün ekleme state'leri
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
      fetchOrderAnalyticsData(); // Listeyi yenile
    } catch (error) {
      console.error("Ürün eklenirken hata:", error);
      toast.error(error.response?.data?.message || "Ürün eklenirken hata oluştu");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
      {/* Filtreler ve Arama - (Mevcut kodlar... burası değişmedi) */}
      <div className="bg-gray-800 p-6 rounded-lg mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
          <div className="flex-1 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Sipariş ID veya ürün ara..."
                className="w-full pl-10 pr-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto items-center flex-wrap">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                autoRefresh 
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              title={autoRefresh ? "Otomatik yenileme açık" : "Otomatik yenileme kapalı"}
            >
              <RefreshCw 
                className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} 
              />
              <span className="hidden sm:inline">
                {autoRefresh ? "Otomatik" : "Manuel"}
              </span>
            </button>
            <div className="text-sm text-gray-400 hidden lg:block">
              Son: {lastRefresh.toLocaleTimeString()}
            </div>
            <select
              className="bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">📦 Tüm Durumlar</option>
              <option value="Hazırlanıyor">📦 Hazırlanıyor</option>
              <option value="Yolda">🚚 Yolda</option>
              <option value="Teslim Edildi">✅ Teslim Edildi</option>
              <option value="İptal Edildi">❌ İptal Edildi</option>
            </select>
            <select
              className="bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">📅 Tüm Tarihler</option>
              <option value="today">📅 Bugün</option>
              <option value="yesterday">📅 Dün</option>
              <option value="lastWeek">📅 Son 7 Gün</option>
              <option value="lastMonth">📅 Son 30 Gün</option>
            </select>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showAdvancedFilters 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              <Filter className="w-5 h-5" />
              <span className="hidden sm:inline">Gelişmiş</span>
            </button>
          </div>
        </div>

        {/* Gelişmiş Filtreler */}
        {showAdvancedFilters && (
          <div className="bg-gray-700/50 rounded-lg p-4 space-y-4 animate-slideDown">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Gelişmiş Filtreler
              </h3>
              <button
                onClick={clearFilters}
                className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Temizle
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Teslimat Noktası</label>
                <select
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={deliveryPointFilter}
                  onChange={(e) => setDeliveryPointFilter(e.target.value)}
                >
                  <option value="all">Tümü</option>
                  <option value="girlsDorm">Kız KYK Yurdu</option>
                  <option value="boysDorm">Erkek KYK Yurdu</option>
                </select>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Minimum Tutar (₺)</label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Maximum Tutar (₺)</label>
                <input
                  type="number"
                  placeholder="∞"
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Aktif Filtre Bilgisi */}
            <div className="flex flex-wrap gap-2">
              {deliveryPointFilter !== "all" && (
                <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  📍 {deliveryPointFilter === "girlsDorm" ? "Kız Yurdu" : "Erkek Yurdu"}
                  <button onClick={() => setDeliveryPointFilter("all")} className="hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {minAmount && (
                <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  Min: ₺{minAmount}
                  <button onClick={() => setMinAmount("")} className="hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {maxAmount && (
                <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  Max: ₺{maxAmount}
                  <button onClick={() => setMaxAmount("")} className="hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Sipariş İstatistikleri */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-700 p-4 rounded-lg">
            <div className="text-gray-400">Toplam Sipariş</div>
            <div className="text-2xl font-bold text-white">{filteredOrders.length}</div>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <div className="text-gray-400">Hazırlanan</div>
            <div className="text-2xl font-bold text-emerald-400">
              {filteredOrders.filter(order => order.status === "Hazırlanıyor").length}
            </div>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <div className="text-gray-400">Yolda</div>
            <div className="text-2xl font-bold text-yellow-400">
              {filteredOrders.filter(order => order.status === "Yolda").length}
            </div>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <div className="text-gray-400">Teslim Edilen</div>
            <div className="text-2xl font-bold text-blue-400">
              {filteredOrders.filter(order => order.status === "Teslim Edildi").length}
            </div>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <div className="text-gray-400">İptal Edilen</div>
            <div className="text-2xl font-bold text-red-400">
              {filteredOrders.filter(order => order.status === "İptal Edildi").length}
            </div>
          </div>
        </div>
      </div>

      {/* Siparişler Listesi */}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 auto-rows-auto">
        {currentOrders.map((order, index) => {
          // Son 3 siparişin rengini belirle
          const isRecent = index < 3;
          let bgColorClass = "bg-gray-800";
          
          // Eğer sipariş durumu "Yolda", "Teslim Edildi" veya "İptal Edildi" ise
          if (order.status === "Yolda") {
            bgColorClass = "bg-yellow-500/20";
          } else if (order.status === "Teslim Edildi") {
            bgColorClass = "bg-blue-500/20";
          } else if (order.status === "İptal Edildi") {
            bgColorClass = "bg-red-500/20";
          } else if (isRecent) {
            // Son 3 sipariş için renklendirme (iptal edilmemiş siparişler için)
            if (index === 0) bgColorClass = "bg-emerald-500/20"; // En son gelen
            else if (index === 1) bgColorClass = "bg-yellow-500/20"; // İkinci son
            else if (index === 2) bgColorClass = "bg-red-500/20"; // Üçüncü son
          }

          return (
            <div 
              key={order.orderId} 
              className={`${bgColorClass} p-4 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-[1.01]`}
            >
              {/* Başlık ve Durum */}
              <div className="flex flex-col gap-3 mb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white">{order.user.name}</h3>
                    <p className="text-sm text-gray-400">ID: {order.orderId}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                        onClick={() => handleOpenAddItemModal(order.orderId)}
                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm flex items-center gap-1.5 transition-colors"
                        title="Ürün/Tutar Ekle"
                    >
                        <span className="text-lg font-bold">+</span>
                    </button>
                    <button
                        onClick={() => handlePrint(order)}
                        className="px-3 py-1.5 rounded-full bg-gray-600 hover:bg-gray-500 text-white text-sm flex items-center gap-1.5 transition-colors"
                        title="Fişi yazdır"
                    >
                        <Printer size={14}/> Yazdır
                    </button>
                  </div>
                </div>
                <div className="w-full">
                  <label className="text-xs text-gray-400 mb-1 block">Sipariş Durumu:</label>
                  <select
                    className={`w-full text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${
                      order.status === "Teslim Edildi"
                        ? "bg-blue-500 text-white"
                        : order.status === "Yolda"
                        ? "bg-yellow-500 text-gray-900"
                        : order.status === "İptal Edildi"
                        ? "bg-red-500 text-white"
                        : "bg-emerald-500 text-white"
                    }`}
                    value={order.status}
                    onChange={(e) => updateOrderStatus(order.orderId, e.target.value)}
                  >
                    <option value="Hazırlanıyor">📦 Hazırlanıyor</option>
                    <option value="Yolda">🚚 Yolda</option>
                    <option value="Teslim Edildi">✅ Teslim Edildi</option>
                    <option value="İptal Edildi">❌ İptal Edildi</option>
                  </select>
                </div>
              </div>

              {/* Müşteri Bilgileri */}
              <div className="bg-gray-700/50 p-2 rounded-lg mb-3">
                <div className="text-sm text-gray-400 space-y-1">
                  <p>📧 {order.user.email}</p>
                  <p>📱 {order.user.phone || "Telefon belirtilmemiş"}</p>
                  <p>📍 {order.deliveryPointName || order.city || "Adres belirtilmemiş"}</p>
                </div>
              </div>

              {/* Sipariş Detayları */}
              <div className="bg-gray-700/50 p-2 rounded-lg mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-emerald-400 font-bold text-lg">₺{order.totalAmount}</span>
                  <span className="text-sm text-gray-400">
                    📅 {new Date(order.createdAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
              </div>

              {/* Ürünler */}
              <div className="flex-grow">
                <div className="text-sm font-semibold text-white mb-2">Ürünler</div>
                <div className="space-y-2">
                  {order.products.map((product, index) => (
                    <div key={index} className="bg-gray-700/50 p-2 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-700 h-14 w-14 rounded-lg flex items-center justify-center overflow-hidden">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <Package2 className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white font-medium">{product.name}</p>
                          <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full">
                            <span className="text-xs font-bold text-emerald-400">×</span>
                            <span className="text-sm font-bold text-emerald-300">{product.quantity}</span>
                            <span className="text-xs font-semibold text-emerald-400">Adet</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-emerald-400 font-bold">₺{product.price}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sipariş Notu */}
              {order.note && (
                <div className="mt-3 bg-gray-700/50 p-2 rounded-lg">
                  <p className="text-xs text-gray-400">Not:</p>
                  <p className="text-sm text-gray-300">{order.note}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="p-2 bg-gray-700 rounded-lg text-white disabled:opacity-50 hover:bg-gray-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-white px-4">
            Sayfa {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="p-2 bg-gray-700 rounded-lg text-white disabled:opacity-50 hover:bg-gray-600 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm border border-gray-700 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Siparişe Ürün Ekle</h3>
              <button 
                onClick={() => setShowAddItemModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAddCustomItem} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Tutar (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={customItemAmount}
                  onChange={(e) => setCustomItemAmount(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Ürün Adı (Opsiyonel)</label>
                <input
                  type="text"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Özel Ekleme"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors"
                >
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersList;