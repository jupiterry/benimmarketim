import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Plus,
  BarChart2,
  Package2,
  Users,
  Upload,
  MessageSquare,
  Star,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Download,
  ThumbsUp,
  ThumbsDown,
  Monitor,
  Smartphone,
  Tablet
} from "lucide-react";
import axios from "../lib/axios";
import toast from "react-hot-toast";

// Device type helper functions
const getDeviceIcon = (deviceType) => {
  switch (deviceType) {
    case 'desktop':
      return <Monitor className="w-4 h-4" />;
    case 'mobile':
      return <Smartphone className="w-4 h-4" />;
    case 'tablet':
      return <Tablet className="w-4 h-4" />;
    default:
      return <Monitor className="w-4 h-4" />;
  }
};

const getDeviceName = (deviceType) => {
  switch (deviceType) {
    case 'desktop':
      return 'Bilgisayar';
    case 'mobile':
      return 'Telefon';
    case 'tablet':
      return 'Tablet';
    default:
      return 'Bilinmiyor';
  }
};

const getDeviceColor = (deviceType) => {
  switch (deviceType) {
    case 'desktop':
      return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    case 'mobile':
      return 'text-green-400 bg-green-500/20 border-green-500/30';
    case 'tablet':
      return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
    default:
      return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
  }
};

const DashboardPage = () => {
  const [activeTab, setActiveTab] = useState("products");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalUsers: 0,
    revenueChange: 0,
    ordersChange: 0,
    salesByDay: [],
    popularProducts: []
  });
  const [feedback, setFeedback] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Verileri yükleme
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [analyticsRes, ordersRes, usersRes, feedbackRes] = await Promise.all([
          axios.get("/analytics"),
          axios.get("/orders-analytics"),
          axios.get("/users"),
          axios.get("/feedback")
        ]);

        setAnalytics(analyticsRes.data);
        setOrders(ordersRes.data.orderAnalyticsData?.usersOrders || []);
        setUsers(usersRes.data);
        setFeedback(feedbackRes.data);
      } catch (error) {
        console.error("Veri yüklenirken hata:", error);
        toast.error("Veriler yüklenirken bir hata oluştu");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const tabs = [
    { id: "products", icon: <ShoppingBag size={20} />, label: "Ürünler" },
    { id: "add-product", icon: <Plus size={20} />, label: "Ürün Ekle" },
    { id: "analytics", icon: <BarChart2 size={20} />, label: "Analiz" },
    { id: "orders", icon: <Package2 size={20} />, label: "Siparişler" },
    { id: "users", icon: <Users size={20} />, label: "Kullanıcılar" },
    { id: "bulk-upload", icon: <Upload size={20} />, label: "Toplu Yükleme" },
    { id: "feedback", icon: <MessageSquare size={20} />, label: "Geri Bildirimler" }
  ];

  // Excel şablonu indirme
  const downloadTemplate = () => {
    // Excel şablonu indirme mantığı
    toast.success("Excel şablonu indiriliyor...");
  };

  // Toplu yükleme işlemi
  const handleBulkUpload = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post("/products/bulk-upload", formData);
      toast.success("Ürünler başarıyla yüklendi");
    } catch (error) {
      console.error("Yükleme hatası:", error);
      toast.error("Ürünler yüklenirken bir hata oluştu");
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 pt-24 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-emerald-400 mb-2">Yönetici Paneli</h1>
          <p className="text-gray-400">Ürünleri, siparişleri ve kullanıcıları yönetin</p>
        </div>

        {/* Tab Menüsü */}
        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                activeTab === tab.id
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* İçerik Alanı */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden">
          {/* Ürünler Sekmesi */}
          {activeTab === "products" && (
            <div className="p-6">
              <div className="flex flex-col lg:flex-row gap-4 mb-6">
                {/* Kategori Seçici */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Kategori Seçin
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="all">Tüm Kategoriler</option>
                    <option value="kahve">Kahve</option>
                    <option value="atistirma">Atıştırmalık</option>
                    {/* Diğer kategoriler */}
                  </select>
                </div>

                {/* Arama Kutusu */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Ürün Ara
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Ürün adı ile ara..."
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Ürün Tablosu */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">ÜRÜN</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">FİYAT</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">KATEGORİ</th>
                      <th className="text-center py-3 px-4 text-gray-400 font-medium">ÖNE ÇIKANLAR</th>
                      <th className="text-center py-3 px-4 text-gray-400 font-medium">GİZLİ</th>
                      <th className="text-center py-3 px-4 text-gray-400 font-medium">TÜKENDİ</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">İŞLEMLER</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Örnek ürün satırı */}
                    <tr className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src="/kahve.png"
                            alt="Ürün"
                            className="w-12 h-12 rounded-lg object-cover bg-gray-700"
                          />
                          <div>
                            <div className="font-medium text-white">Eti Hoşbeş Fındıklı</div>
                            <div className="text-sm text-gray-400">142gr</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-emerald-400 font-medium">₺38.00</td>
                      <td className="py-4 px-4 text-gray-300">atistirma</td>
                      <td className="py-4 px-4 text-center">
                        <button className="text-gray-400 hover:text-yellow-400">
                          <Star size={20} />
                        </button>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button className="px-3 py-1 rounded-full text-sm bg-emerald-500/10 text-emerald-400">
                          Görünür
                        </button>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button className="px-3 py-1 rounded-full text-sm bg-emerald-500/10 text-emerald-400">
                          Stokta
                        </button>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                            Düzenle
                          </button>
                          <button className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Analiz Sekmesi */}
          {activeTab === "analytics" && (
            <div className="p-6 space-y-6">
              {/* Özet Kartları */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-700/50 p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-300">Toplam Gelir</h3>
                    <DollarSign className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">₺{analytics.totalRevenue.toLocaleString()}</p>
                  <p className={`text-sm ${analytics.revenueChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {analytics.revenueChange >= 0 ? "+" : ""}{analytics.revenueChange}% geçen aya göre
                  </p>
                </div>

                <div className="bg-gray-700/50 p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-300">Toplam Sipariş</h3>
                    <Package2 className="w-6 h-6 text-blue-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{analytics.totalOrders}</p>
                  <p className={`text-sm ${analytics.ordersChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {analytics.ordersChange >= 0 ? "+" : ""}{analytics.ordersChange}% geçen aya göre
                  </p>
                </div>

                <div className="bg-gray-700/50 p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-300">Toplam Kullanıcı</h3>
                    <Users className="w-6 h-6 text-purple-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{analytics.totalUsers}</p>
                </div>

                <div className="bg-gray-700/50 p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-300">Popüler Ürünler</h3>
                    <TrendingUp className="w-6 h-6 text-yellow-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{analytics.popularProducts.length}</p>
                </div>
              </div>

              {/* Satış Grafiği */}
              <div className="bg-gray-700/50 p-6 rounded-xl">
                <h3 className="text-lg font-medium text-gray-300 mb-4">Günlük Satışlar</h3>
                <div className="h-64">
                  <div className="flex items-end justify-between h-full">
                    {analytics.salesByDay.map((sale, index) => (
                      <div
                        key={index}
                        className="w-8 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-t-lg transition-all relative group"
                        style={{ height: `${(sale.amount / analytics.totalRevenue) * 100}%` }}
                      >
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          ₺{sale.amount}
                          <br />
                          {sale.date}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Siparişler Sekmesi */}
          {activeTab === "orders" && (
            <div className="p-6">
              <div className="space-y-6">
                {orders.map((userOrder) => (
                  <div key={userOrder.user.id} className="bg-gray-700/50 rounded-xl overflow-hidden">
                    <div className="p-4 bg-gray-600/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-medium text-white">{userOrder.user.name}</h3>
                          <p className="text-sm text-gray-400">{userOrder.user.email}</p>
                        </div>
                        <div className="text-sm text-gray-400">
                          {userOrder.orders.length} Sipariş
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-700">
                      {userOrder.orders.map((order) => (
                        <div key={order.orderId} className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-lg ${
                                order.status === "Teslim Edildi" ? "bg-emerald-500/10 text-emerald-400" :
                                order.status === "Yolda" ? "bg-yellow-500/10 text-yellow-400" :
                                "bg-blue-500/10 text-blue-400"
                              }`}>
                                {order.status === "Teslim Edildi" ? <CheckCircle className="w-5 h-5" /> :
                                 order.status === "Yolda" ? <Clock className="w-5 h-5" /> :
                                 <Package2 className="w-5 h-5" />}
                              </div>
                              <div>
                                <p className="text-sm text-gray-400">Sipariş ID</p>
                                <p className="text-white">{order.orderId}</p>
                              </div>
                            </div>
                            <div className="text-lg font-bold text-emerald-400">
                              ₺{order.totalAmount}
                            </div>
                          </div>
                          <div className="grid gap-4">
                            {order.products.map((product, index) => (
                              <div key={index} className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg">
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-12 bg-gray-700 rounded-lg overflow-hidden">
                                    {product.image && (
                                      <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-white">{product.name}</p>
                                    <p className="text-sm text-gray-400">{product.quantity} Adet</p>
                                  </div>
                                </div>
                                <p className="text-emerald-400 font-medium">₺{product.price}</p>
                              </div>
                            ))}
                          </div>
                          {order.note && (
                            <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
                              <p className="text-sm text-gray-400">Sipariş Notu:</p>
                              <p className="text-white">{order.note}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kullanıcılar Sekmesi */}
          {activeTab === "users" && (
            <div className="p-6">
              <div className="grid gap-4">
                {users.map((user) => (
                  <div key={user._id} className="bg-gray-700/50 p-4 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-gray-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-white">{user.name}</h3>
                          <p className="text-sm text-gray-400">{user.email}</p>
                          {user.deviceType && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getDeviceColor(user.deviceType)}`}>
                                {getDeviceIcon(user.deviceType)}
                                {getDeviceName(user.deviceType)}
                              </span>
                              {user.lastDeviceType && user.lastDeviceType !== user.deviceType && (
                                <span className="text-gray-500 text-xs">
                                  (Önceki: {getDeviceName(user.lastDeviceType)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="px-3 py-1 rounded-full text-sm bg-emerald-500/10 text-emerald-400">
                          {user.role === "admin" ? "Admin" : "Kullanıcı"}
                        </button>
                        <button className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                          <XCircle size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toplu Yükleme Sekmesi */}
          {activeTab === "bulk-upload" && (
            <div className="p-6">
              <div className="space-y-6">
                {/* Excel Şablonu İndirme */}
                <div className="bg-gray-700/50 p-6 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-white mb-2">Excel Şablonu</h3>
                      <p className="text-sm text-gray-400">
                        Toplu ürün yüklemesi için örnek Excel şablonunu indirin
                      </p>
                    </div>
                    <button
                      onClick={downloadTemplate}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                    >
                      <Download size={20} />
                      Şablonu İndir
                    </button>
                  </div>
                </div>

                {/* Dosya Yükleme Alanı */}
                <div className="bg-gray-700/50 p-6 rounded-xl">
                  <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center">
                    <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Excel Dosyası Yükle</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      .xlsx veya .xls formatında dosya yükleyin
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => handleBulkUpload(e.target.files[0])}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 cursor-pointer"
                    >
                      <Upload size={20} />
                      Dosya Seç
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Geri Bildirimler Sekmesi */}
          {activeTab === "feedback" && (
            <div className="p-6">
              <div className="grid gap-6">
                {feedback.map((item) => (
                  <div key={item._id} className="bg-gray-700/50 rounded-xl overflow-hidden">
                    <div className="p-4 bg-gray-600/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            item.rating >= 4 ? "bg-emerald-500/10 text-emerald-400" :
                            item.rating <= 2 ? "bg-red-500/10 text-red-400" :
                            "bg-yellow-500/10 text-yellow-400"
                          }`}>
                            {item.rating >= 4 ? <ThumbsUp className="w-5 h-5" /> :
                             item.rating <= 2 ? <ThumbsDown className="w-5 h-5" /> :
                             <MessageSquare className="w-5 h-5" />}
                          </div>
                          <div>
                            <h3 className="text-lg font-medium text-white">{item.user?.name || "Anonim"}</h3>
                            <p className="text-sm text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, index) => (
                            <Star
                              key={index}
                              className={`w-5 h-5 ${
                                index < item.rating ? "text-yellow-400 fill-current" : "text-gray-600"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-gray-300">{item.comment}</p>
                      {item.response && (
                        <div className="mt-4 pl-4 border-l-2 border-gray-600">
                          <p className="text-sm text-gray-400">Yanıt:</p>
                          <p className="text-gray-300">{item.response}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage; 