import { BarChart, PlusCircle, ShoppingBasket, Upload, Users, Package2, MessageSquare, Settings, LayoutDashboard, Bell, AlertCircle, Image, Replace } from "lucide-react";
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
import DashboardWidgets from "../components/DashboardWidgets";
import UsersTab from "../components/UsersTab";
import PhotocopyTab from "../components/PhotocopyTab";
import BannerTab from "../components/BannerTab";
import BulkTextReplaceTab from "../components/BulkTextReplaceTab";

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("products");
  const { fetchAllProducts, products } = useProductStore();
  const [editingProduct, setEditingProduct] = useState(null);
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

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
      id: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="w-5 h-5" />,
      component: <DashboardWidgets />
    },
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
        onRefresh={fetchUsers}
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
      id: "bulk-text-replace",
      label: "Metin Değiştir",
      icon: <Replace className="w-5 h-5" />,
      component: <BulkTextReplaceTab />
    },
    {
      id: "feedback",
      label: "Geri Bildirimler",
      icon: <MessageSquare className="w-5 h-5" />,
      component: <FeedbackList />
    },
    {
      id: "photocopy",
      label: "Fotokopi",
      icon: <Package2 className="w-5 h-5" />,
      component: <PhotocopyTab />
    },
    {
      id: "banners",
      label: "Banner'lar",
      icon: <Image className="w-5 h-5" />,
      component: <BannerTab />
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
          <div className="flex items-center gap-3">
            {/* Bildirim Butonu */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative bg-gray-700/50 hover:bg-gray-600/50 text-white p-3 rounded-lg transition-all duration-300"
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </motion.button>
            
            <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab("products")}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
            >
              <ShoppingBasket className="w-4 h-4" />
              Ürünleri Yönet
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab("create")}
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Yeni Ürün
            </motion.button>
            </div>
          </div>
        </div>

        {/* Bildirim Dropdown */}
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-4 top-20 bg-gray-800/90 backdrop-blur-xl border border-gray-700/50 rounded-xl p-4 w-80 z-50"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Bildirimler</h3>
              <button 
                onClick={() => setShowNotifications(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {notifications.length === 0 ? (
                <p className="text-gray-400 text-sm">Henüz bildirim yok</p>
              ) : (
                notifications.map((notification, index) => (
                  <div key={index} className="bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5" />
                      <div>
                        <p className="text-white text-sm">{notification.message}</p>
                        <p className="text-gray-400 text-xs">{notification.time}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <p className="text-gray-400 text-lg">Ürünleri, siparişleri ve kullanıcıları yönetin</p>
        </motion.div>

        {/* Hızlı İstatistikler */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-300 text-sm font-medium">Toplam Ürün</p>
                <p className="text-white text-2xl font-bold">{products?.length || 0}</p>
              </div>
              <ShoppingBasket className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-green-500/20 to-green-600/20 border border-green-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-300 text-sm font-medium">Toplam Kullanıcı</p>
                <p className="text-white text-2xl font-bold">{users?.length || 0}</p>
              </div>
              <Users className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-300 text-sm font-medium">Aktif Sipariş</p>
                <p className="text-white text-2xl font-bold">0</p>
              </div>
              <Package2 className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-300 text-sm font-medium">Günlük Satış</p>
                <p className="text-white text-2xl font-bold">₺0</p>
              </div>
              <BarChart className="w-8 h-8 text-orange-400" />
            </div>
          </div>
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

export default AdminPage;