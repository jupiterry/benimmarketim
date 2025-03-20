import { BarChart, PlusCircle, ShoppingBasket, Upload, Users, Package2, MessageSquare, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useProductStore } from "../stores/useProductStore";

import AnalyticsTab from "../components/AnalyticsTab";
import CreateProductForm from "../components/CreateProductForm";
import ProductsList from "../components/ProductsList";
import OrdersList from "../components/OrdersList";
import FeedbackList from "../components/FeedbackList";
import SettingsTab from "../components/SettingsTab";

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("products");
  const { fetchAllProducts, products } = useProductStore();
  const [editingProduct, setEditingProduct] = useState(null);
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState(null);

  useEffect(() => {
    fetchAllProducts();
    fetchUsers();
  }, [fetchAllProducts]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await axios.get("/users");
      setUsers(response.data.users || []);
      setErrorUsers(null);
    } catch (error) {
      console.error("Kullanıcılar getirilirken hata:", error);
      setErrorUsers("Kullanıcılar yüklenemedi.");
      toast.error(error.response?.data?.message || "Kullanıcılar yüklenirken hata oluştu.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUpdateUser = async (userId, updatedData) => {
    try {
      const response = await axios.put(`/users/${userId}`, updatedData);
      if (response.data.success) {
        setUsers(users.map((user) => (user._id === userId ? response.data.user : user)));
        setEditingUser(null);
        toast.success("Kullanıcı başarıyla güncellendi!");
      }
    } catch (error) {
      console.error("Kullanıcı güncellenirken hata:", error);
      toast.error(error.response?.data?.message || "Kullanıcı güncellenirken hata oluştu.");
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
  };

  const handleSave = async (productId, updatedData) => {
    try {
      const response = await axios.put(`/products/${productId}`, updatedData);
      if (response.data) {
        setEditingProduct(null);
        toast.success("Ürün başarıyla güncellendi!");
        fetchAllProducts();
      }
    } catch (error) {
      console.error("Güncelleme hatası:", error);
      toast.error(error.response?.data?.message || "Ürün güncellenirken hata oluştu");
    }
  };

  const handleBulkUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      toast.error("Lütfen bir dosya seçin.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post("/products/bulk-upload", formData);
      if (response.data.success) {
        toast.success("Ürünler başarıyla yüklendi!");
        fetchAllProducts();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Yükleme sırasında hata oluştu");
    }
  };

  const tabs = [
    {
      id: "products",
      label: "Ürünler",
      icon: <ShoppingBasket className="w-5 h-5" />,
      component: <ProductsList
        products={products}
        onEdit={handleEdit}
        editingProduct={editingProduct}
        setEditingProduct={setEditingProduct}
        onSave={handleSave}
      />
    },
    {
      id: "create",
      label: "Ürün Ekle",
      icon: <PlusCircle className="w-5 h-5" />,
      component: <CreateProductForm />
    },
    {
      id: "analytics",
      label: "Analiz",
      icon: <BarChart className="w-5 h-5" />,
      component: <AnalyticsTab />
    },
    {
      id: "orders",
      label: "Siparişler",
      icon: <Package2 className="w-5 h-5" />,
      component: <OrdersList />
    },
    {
      id: "users",
      label: "Kullanıcılar",
      icon: <Users className="w-5 h-5" />,
      component: <UsersTab
        users={users}
        loading={loadingUsers}
        error={errorUsers}
        onEdit={setEditingUser}
        onUpdate={handleUpdateUser}
        onCancel={() => setEditingUser(null)}
        editingUser={editingUser}
      />
    },
    {
      id: "bulk-upload",
      label: "Toplu Yükleme",
      icon: <Upload className="w-5 h-5" />,
      component: <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto bg-gray-700/30 rounded-xl p-8 border border-gray-600/30"
      >
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Ürünleri Toplu Yükle</h2>
        <div className="mb-6 text-gray-300 text-sm">
          <p>CSV dosyası ile ürünleri toplu olarak yükleyebilirsiniz. CSV dosyası aşağıdaki başlıklara sahip olmalıdır:</p>
          <code className="block mt-2 p-3 bg-gray-800 rounded-md overflow-x-auto">
            name,description,price,image,category,stock,isOutOfStock,isHidden,discountedPrice
          </code>
        </div>
        <div className="flex flex-col items-center">
          <label className="w-full flex flex-col items-center px-4 py-6 bg-gray-700 text-gray-300 rounded-lg shadow-lg tracking-wide border border-gray-600 cursor-pointer hover:bg-gray-600 transition-colors">
            <Upload className="w-8 h-8" />
            <span className="mt-2 text-base">CSV Dosyası Seç</span>
          <input
            type="file"
            accept=".csv"
              className="hidden" 
            onChange={handleBulkUpload}
          />
        </label>
        </div>
      </motion.div>
    },
    {
      id: "feedback",
      label: "Geri Bildirimler",
      icon: <MessageSquare className="w-5 h-5" />,
      component: <FeedbackList />
    },
    {
      id: "settings",
      label: "Ayarlar",
      icon: <Settings className="w-5 h-5" />,
      component: <SettingsTab />
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Yönetici Paneli</h1>
        </div>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-gray-400 text-lg">Ürünleri, siparişleri ve kullanıcıları yönetin</p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <AnimatePresence mode="wait">
            {tabs.map((tab) => (
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <TabButton
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  icon={tab.icon}
                  text={tab.label}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 pointer-events-none" />
            
            {tabs.find(tab => tab.id === activeTab)?.component}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, text }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-300 ${
      active
        ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
        : "bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white"
    }`}
  >
    {icon}
    <span className="font-medium">{text}</span>
  </motion.button>
);

const UsersTab = ({ users, loading, error, onEdit, onUpdate, onCancel, editingUser }) => {
  const [editedUser, setEditedUser] = useState({});
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetInfo, setResetInfo] = useState({ userId: "", userName: "", tempPassword: "" });
  const [customTempPassword, setCustomTempPassword] = useState("");
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  // Kullanıcıları son aktiflik durumuna göre sırala
  const sortedUsers = [...users].sort((a, b) => {
    const aLastActive = a.lastActive ? new Date(a.lastActive).getTime() : 0;
    const bLastActive = b.lastActive ? new Date(b.lastActive).getTime() : 0;
    return bLastActive - aLastActive; // En son aktif olan üstte olacak şekilde sırala
  });

  useEffect(() => {
    if (editingUser) {
      setEditedUser(editingUser);
    }
  }, [editingUser]);

  // Server ile client arasındaki zaman farkını hesapla
  useEffect(() => {
    const calculateTimeOffset = () => {
      const serverTime = new Date(users?.[0]?.serverTime || Date.now()).getTime();
      const clientTime = Date.now();
      setServerTimeOffset(serverTime - clientTime);
    };

    calculateTimeOffset();
    // Her 30 saniyede bir zaman farkını güncelle
    const interval = setInterval(calculateTimeOffset, 30000);
    return () => clearInterval(interval);
  }, [users]);

  // Kullanıcı listesini periyodik olarak güncelle
  useEffect(() => {
    const interval = setInterval(() => {
      window.location.reload(); // Sayfayı yenile
    }, 60000); // Her 1 dakikada bir
    return () => clearInterval(interval);
  }, []);

  // Aktif kullanıcıları hesapla
  const calculateActiveUsers = () => {
    const now = new Date(Date.now() + serverTimeOffset);
    const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
    const last5Minutes = new Date(now - 5 * 60 * 1000);

    return {
      total: users.length,
      activeNow: users.filter(user => {
        const lastActive = new Date(user.lastActive);
        return lastActive > last5Minutes;
      }).length,
      last24Hours: users.filter(user => {
        const lastActive = new Date(user.lastActive);
        return lastActive > last24Hours;
      }).length
    };
  };

  const activeUsers = calculateActiveUsers();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedUser((prev) => ({ ...prev, [name]: value }));
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Bu kullanıcıyı silmek istediğinizden emin misiniz?")) {
      return;
    }

    try {
      await axios.delete(`/users/${userId}`);
      toast.success("Kullanıcı başarıyla silindi");
      window.location.reload();
    } catch (error) {
      console.error("Kullanıcı silinirken hata:", error);
      toast.error(error.response?.data?.message || "Kullanıcı silinirken hata oluştu");
    }
  };

  const handleResetPassword = async (userId, userName) => {
    setResetInfo({
      userId: userId,
      userName: userName,
      tempPassword: ""
    });
    setCustomTempPassword("");
    setShowResetModal(true);
  };

  const handleConfirmReset = async () => {
    if (!customTempPassword) {
      toast.error("Lütfen geçici şifre belirleyin");
      return;
    }

    try {
      const response = await axios.post(`/users/${resetInfo.userId}/reset-password`, {
        tempPassword: customTempPassword
      });
      
      if (response.data.success) {
        setResetInfo(prev => ({
          ...prev,
          tempPassword: customTempPassword
        }));
        toast.success("Şifre başarıyla sıfırlandı");
      }
    } catch (error) {
      console.error("Şifre sıfırlanırken hata:", error);
      toast.error(error.response?.data?.message || "Şifre sıfırlanırken hata oluştu");
    }
  };

  // Tarih formatlamak için yardımcı fonksiyon
  const formatDate = (dateString) => {
    if (!dateString) return "Belirtilmemiş";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Geçersiz Tarih";
      
      return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error("Tarih formatlanırken hata:", error);
      return "Tarih Hatası";
    }
  };

  // Ne kadar zaman önce hesaplamak için yardımcı fonksiyon
  const timeAgo = (dateString) => {
    if (!dateString) return "Belirtilmemiş";
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Geçersiz Tarih";
      
      const now = new Date(Date.now() + serverTimeOffset); // Server zamanını kullan
      const diffInSeconds = Math.floor((now - date) / 1000);
      
      // Eğer fark negatifse veya çok büyükse, normal tarihi göster
      if (diffInSeconds < 0 || diffInSeconds > 31536000 * 2) { // 2 yıldan fazlaysa
        return formatDate(dateString);
      }
      
      if (diffInSeconds < 60) return `${diffInSeconds} saniye önce`;
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} dakika önce`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} saat önce`;
      if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} gün önce`;
      if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} ay önce`;
      return `${Math.floor(diffInSeconds / 31536000)} yıl önce`;
    } catch (error) {
      console.error("Zaman hesaplanırken hata:", error);
      return formatDate(dateString);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="relative w-32 h-32">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full animate-[spin_3s_linear_infinite]"></div>
          <div className="absolute inset-4 border-4 border-teal-500/20 rounded-full animate-[spin_2s_linear_infinite_reverse]"></div>
          <div className="absolute inset-8 border-4 border-emerald-400/20 rounded-full animate-[spin_1s_linear_infinite]"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-500 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 bg-red-500/10 rounded-full animate-ping"></div>
          <div className="relative flex items-center justify-center w-full h-full bg-red-500/20 rounded-full">
            <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
        <div className="text-red-400 text-xl font-medium mb-4">{error}</div>
        <motion.button
          whileHover={{ scale: 1.05, rotate: 360 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.5 }}
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500/20 transition-all duration-300 inline-flex items-center gap-2 group"
        >
          <svg className="w-5 h-5 group-hover:animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Yeniden Dene
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div>
      {/* Aktif Kullanıcılar Özeti */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl p-6 border border-emerald-500/20"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-emerald-400">{activeUsers.total}</span>
          </div>
          <h3 className="text-lg font-medium text-white mt-4">Toplam Kullanıcı</h3>
          <p className="text-gray-400 text-sm mt-1">Sistemde kayıtlı tüm kullanıcılar</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-2xl p-6 border border-blue-500/20"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-blue-400">{activeUsers.activeNow}</span>
          </div>
          <h3 className="text-lg font-medium text-white mt-4">Şu An Aktif</h3>
          <p className="text-gray-400 text-sm mt-1">Son 5 dakika içinde aktif olan kullanıcılar</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl p-6 border border-purple-500/20"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-purple-400">{activeUsers.last24Hours}</span>
          </div>
          <h3 className="text-lg font-medium text-white mt-4">24 Saat İçinde</h3>
          <p className="text-gray-400 text-sm mt-1">Son 24 saat içinde aktif olan kullanıcılar</p>
        </motion.div>
      </div>

      {/* Mevcut kullanıcı listesi */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {sortedUsers.map((user, index) => (
          <motion.div
              key={user._id}
            initial={{ opacity: 0, y: 20, rotateX: -15 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, y: -20, rotateX: 15 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="group relative perspective-1000"
          >
            <div className="relative transform-gpu transition-all duration-500 group-hover:scale-[1.02] group-hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-blue-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              
              <div className="relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl border border-gray-700/50 rounded-2xl overflow-hidden shadow-xl">
                {/* 3D Hover Efekti */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]"></div>
                
                {editingUser && editingUser._id === user._id ? (
                  // Düzenleme modu
                  <div className="relative p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">Ad Soyad</label>
                  <input
                    type="text"
                    name="name"
                    value={editedUser.name || ""}
                    onChange={handleChange}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">E-posta</label>
                  <input
                    type="email"
                    name="email"
                    value={editedUser.email || ""}
                    onChange={handleChange}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">Telefon</label>
                  <input
                    type="tel"
                    name="phone"
                    value={editedUser.phone || ""}
                    onChange={handleChange}
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200"
                      />
                    </div>
                    
                    <div className="flex gap-3 pt-4">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      onClick={() => onUpdate(user._id, editedUser)}
                        className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-4 py-2.5 rounded-xl transition-all duration-200"
                    >
                      Kaydet
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      onClick={onCancel}
                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2.5 rounded-xl transition-all duration-200"
                    >
                      İptal
                    </motion.button>
                    </div>
                  </div>
                ) : (
                  // Normal görünüm modu
                  <div className="relative">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-semibold text-white group-hover:text-emerald-400 transition-colors duration-300">{user.name}</h3>
                        <div className={`px-3 py-1 text-xs rounded-full ${
                          user.role === "admin" 
                            ? "bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/30" 
                            : "bg-gray-700/50 text-gray-300 group-hover:bg-gray-700/70"
                        } transition-colors duration-300`}>
                          {user.role === "admin" ? "Admin" : "Müşteri"}
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/10 transition-all duration-300">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <span className="text-gray-300 group-hover:text-white transition-colors duration-300">{user.email}</span>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/10 transition-all duration-300">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <span className="text-gray-300 group-hover:text-white transition-colors duration-300">{user.phone || "Belirtilmemiş"}</span>
                        </div>
                      </div>
                      
                      <div className="mt-6 pt-4 border-t border-gray-700/30 space-y-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/10 transition-all duration-300">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <span className="block text-sm text-gray-400">Son aktiflik</span>
                            <span className="block text-gray-300 group-hover:text-white transition-colors duration-300 mt-0.5">
                              {user.lastActive ? timeAgo(user.lastActive) : "Henüz aktif değil"}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/10 transition-all duration-300">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <span className="block text-sm text-gray-400">Kayıt tarihi</span>
                            <span className="block text-gray-300 group-hover:text-white transition-colors duration-300 mt-0.5">
                              {timeAgo(user.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Sepetteki Ürünler */}
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/10 transition-all duration-300">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                          </div>
                          <div>
                            <span className="block text-sm text-gray-400">Sepetteki Ürünler</span>
                            <div className="mt-2 space-y-2">
                              {user.cartItems && user.cartItems.length > 0 ? (
                                user.cartItems.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between bg-gray-800/30 rounded-lg p-2">
                                    <span className="text-gray-300 text-sm">{item.product?.name || 'Ürün bulunamadı'}</span>
                                    <span className="text-emerald-400 text-sm font-medium">x{item.quantity}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="block text-gray-500 text-sm italic">Sepet boş</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex border-t border-gray-700/30">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      onClick={() => onEdit(user)}
                        className="flex-1 flex items-center justify-center gap-2 py-4 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all duration-300"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Düzenle</span>
                      </motion.button>
                      
                      <div className="w-px bg-gray-700/30"></div>
                      
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleResetPassword(user._id, user.name)}
                        className="flex-1 flex items-center justify-center gap-2 py-4 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 transition-all duration-300"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span>Şifre Sıfırla</span>
                      </motion.button>
                      
                      <div className="w-px bg-gray-700/30"></div>
                      
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDeleteUser(user._id)}
                        className="flex-1 flex items-center justify-center gap-2 py-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-300"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Sil</span>
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      
      {users.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-gray-700/30 rounded-full animate-pulse"></div>
            <div className="relative flex items-center justify-center w-full h-full">
              <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="text-gray-400 text-lg">Henüz kullanıcı bulunmuyor.</div>
        </motion.div>
      )}

      {/* Şifre Sıfırlama Modal - Mevcut modal kodunu koru */}
      {showResetModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowResetModal(false)}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-700/50"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-2xl"></div>
            
            <div className="relative">
              <h3 className="text-xl font-bold text-emerald-400 mb-4">Şifre Sıfırlama</h3>
              <p className="mb-4 text-gray-300">
                <span className="font-semibold">{resetInfo.userName}</span> kullanıcısı için yeni geçici şifre belirleyin.
              </p>
              
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">Geçici Şifre</label>
                <div className="flex items-center">
                  <input 
                    type="text" 
                    value={customTempPassword}
                    onChange={(e) => setCustomTempPassword(e.target.value)}
                    placeholder="Geçici şifre girin"
                    className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200"
                  />
                </div>
                
                <p className="text-sm text-gray-400 mt-2">
                  <span className="text-yellow-400">Not:</span> Bu şifreyi kullanıcıya güvenli bir şekilde iletmeyi unutmayın.
                </p>
              </div>
              
              <div className="flex justify-end gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 transition-colors duration-200"
                >
                  İptal
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirmReset}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors duration-200"
                >
                  Şifreyi Sıfırla
                    </motion.button>
              </div>
              
              {resetInfo.tempPassword && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-gray-800/50 rounded-xl border border-emerald-500/20"
                >
                  <div className="flex items-center gap-2 text-emerald-400 mb-3">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">Şifre başarıyla sıfırlandı!</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={resetInfo.tempPassword}
                      readOnly
                      className="flex-1 bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-white focus:outline-none"
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        navigator.clipboard.writeText(resetInfo.tempPassword);
                        toast.success("Şifre panoya kopyalandı");
                      }}
                      className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors duration-200"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
                  </div>
                )}
    </div>
  );
};

export default AdminPage;