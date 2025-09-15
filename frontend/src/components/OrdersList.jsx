import { useEffect, useState } from "react";
import axios from "../lib/axios";
import { Search, Package2, ChevronLeft, ChevronRight, RefreshCw, Printer } from "lucide-react";
import toast from "react-hot-toast";
import io from "socket.io-client";

const OrdersList = () => {
  const [orderAnalyticsData, setOrderAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const ordersPerPage = 6;

  const handlePrint = (order) => {
    try {
      const printWindow = window.open('', '_blank', 'width=450,height=800');
      if (!printWindow) return;

      const css = `
        <style>
          @page { size: 3in 5in; margin: 6mm; }
          body { font-family: Arial, sans-serif; color: #000; }
          .receipt { width: 100%; }
          .header { text-align: center; margin-bottom: 8px; }
          .title { font-size: 16px; font-weight: bold; }
          .meta { font-size: 12px; }
          .row { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; }
          .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin: 6px 0; }
          .item { display: flex; justify-content: space-between; font-size: 12px; }
          .totals { font-size: 13px; font-weight: bold; }
        </style>`;

      const createdAt = new Date(order.createdAt).toLocaleString('tr-TR');
      const itemsHtml = order.products.map(p => `
        <div class="item">
          <div>${p.name} x ${p.quantity}</div>
          <div>₺${(p.price).toFixed(2)}</div>
        </div>
      `).join('');

      const noteHtml = order.note ? `<div class="row"><div>Not:</div><div>${order.note}</div></div>` : '';

      const html = `
        <html>
          <head><meta charset="utf-8"/>${css}</head>
          <body>
            <div class="receipt">
              <div class="header">
                <div class="title">Benim Marketim</div>
                <div class="meta">Sipariş ID: ${order.orderId}</div>
                <div class="meta">Tarih: ${createdAt}</div>
              </div>
              <div class="row"><div>Müşteri</div><div>${order.user.name}</div></div>
              <div class="row"><div>Telefon</div><div>${order.user.phone || '-'}</div></div>
              <div class="row"><div>Adres</div><div style="max-width: 170px; text-align:right;">${order.user.address || '-'}</div></div>
              <div class="items">${itemsHtml}</div>
              <div class="totals row"><div>Toplam</div><div>₺${(order.totalAmount).toFixed(2)}</div></div>
              ${noteHtml}
            </div>
            <script>window.onload = function(){ window.print(); setTimeout(()=>window.close(), 300); }<\/script>
          </body>
        </html>`;

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
        );

      const matchesStatus = 
        statusFilter === "all" || order.status === statusFilter;

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

      return matchesSearch && matchesStatus && matchesDate;
    });
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20">
      {/* Filtreler ve Arama */}
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
          <div className="flex gap-4 w-full md:w-auto items-center">
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
            <div className="text-sm text-gray-400">
              Son yenileme: {lastRefresh.toLocaleTimeString()}
            </div>
            <select
              className={`bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="Hazırlanıyor">Hazırlanıyor</option>
              <option value="Yolda">Yolda</option>
              <option value="Teslim Edildi">Teslim Edildi</option>
              <option value="İptal Edildi">İptal Edildi</option>
            </select>
            <select
              className="bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">Tüm Tarihler</option>
              <option value="today">Bugün</option>
              <option value="yesterday">Dün</option>
              <option value="lastWeek">Son 7 Gün</option>
              <option value="lastMonth">Son 30 Gün</option>
            </select>
          </div>
        </div>

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
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{order.user.name}</h3>
                  <p className="text-sm text-gray-400">ID: {order.orderId}</p>
                </div>
                <div className="flex gap-2 items-center">
                <button
                  onClick={() => handlePrint(order)}
                  className="px-3 py-1 rounded-full bg-gray-600 hover:bg-gray-500 text-white text-sm flex items-center gap-1"
                  title="Fişi yazdır"
                >
                  <Printer size={14}/> Yazdır
                </button>
                <select
                  className={`text-sm px-3 py-1 rounded-full font-semibold ${
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
                  <option value="Hazırlanıyor">Hazırlanıyor</option>
                  <option value="Yolda">Yolda</option>
                  <option value="Teslim Edildi">Teslim Edildi</option>
                  <option value="İptal Edildi">İptal Edildi</option>
                </select>
                </div>
              </div>

              {/* Müşteri Bilgileri */}
              <div className="bg-gray-700/50 p-2 rounded-lg mb-3">
                <div className="text-sm text-gray-400 space-y-1">
                  <p>📧 {order.user.email}</p>
                  <p>📱 {order.user.phone || "Telefon belirtilmemiş"}</p>
                  <p>📍 {order.user.address || "Adres belirtilmemiş"}</p>
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
                          <p className="text-xs text-gray-400">{product.quantity} Adet</p>
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
    </div>
  );
};

export default OrdersList;