import { 
  BarChart, PlusCircle, ShoppingBasket, Upload, Users, Package2, 
  MessageSquare, Settings, LayoutDashboard, Bell, AlertCircle, Image,
  Menu, X, ChevronRight, LogOut, Search, Moon, Sun, TrendingUp, Clock,
  FileText, Zap
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useProductStore } from "../stores/useProductStore";
import { useUserStore } from "../stores/useUserStore";
import { useNavigate } from "react-router-dom";

import CreateProductForm from "../components/CreateProductForm";
import ProductsList from "../components/ProductsList";
import OrdersList from "../components/OrdersList";
import FeedbackList from "../components/FeedbackList";
import SettingsTab from "../components/SettingsTab";
import DashboardWidgets from "../components/DashboardWidgets";
import UsersTab from "../components/UsersTab";
import PhotocopyTab from "../components/PhotocopyTab";
import BannerTab from "../components/BannerTab";
import CouponsTab from "../components/CouponsTab";
import ReferralsTab from "../components/ReferralsTab";
import AdvancedAnalyticsTab from "../components/AdvancedAnalyticsTab";
import { Tag, Gift } from "lucide-react";

// Sidebar Menu Item Component
const SidebarItem = ({ icon: Icon, label, active, onClick, badge, collapsed }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ x: 4 }}
    whileTap={{ scale: 0.98 }}
    className={`
      w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
      ${active 
        ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30' 
        : 'text-gray-400 hover:text-white hover:bg-white/5'
      }
    `}
  >
    <div className={`relative ${active ? 'text-emerald-400' : ''}`}>
      <Icon className="w-5 h-5" />
      {badge > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
    {!collapsed && (
      <>
        <span className="flex-1 text-left text-sm font-medium">{label}</span>
        {active && <ChevronRight className="w-4 h-4" />}
      </>
    )}
  </motion.button>
);

// Quick Stat Card
const QuickStatCard = ({ icon: Icon, label, value, trend, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="glass rounded-2xl p-4 stat-card group"
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          <TrendingUp className={`w-3 h-3 ${trend < 0 ? 'rotate-180' : ''}`} />
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    <p className="text-gray-400 text-xs font-medium mb-1">{label}</p>
    <p className="text-2xl font-bold text-white">{value}</p>
  </motion.div>
);

// Notification Panel
const NotificationPanel = ({ notifications, onClose }) => (
  <motion.div
    initial={{ opacity: 0, x: 20, scale: 0.95 }}
    animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, x: 20, scale: 0.95 }}
    className="absolute right-0 top-14 w-80 glass rounded-2xl p-4 z-50 shadow-2xl border border-gray-700/50"
  >
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        <Bell className="w-4 h-4 text-emerald-400" />
        Bildirimler
      </h3>
      <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
    <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
      {notifications.length === 0 ? (
        <div className="text-center py-8">
          <Bell className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Henüz bildirim yok</p>
        </div>
      ) : (
        notifications.map((notification, index) => (
          <motion.div 
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white/5 rounded-xl p-3 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{notification.message}</p>
                <p className="text-gray-500 text-xs mt-1">{notification.time}</p>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  </motion.div>
);

// Bulk Upload Component (Inline)
const BulkUploadSection = ({ onUpload }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="max-w-2xl mx-auto"
  >
    <div className="glass rounded-2xl p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Toplu Ürün Yükleme</h2>
        <p className="text-gray-400">CSV dosyası ile ürünleri toplu olarak yükleyin</p>
      </div>
      
      <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700/50">
        <p className="text-sm text-gray-400 mb-2">CSV dosyası aşağıdaki başlıklara sahip olmalıdır:</p>
        <code className="block text-xs text-emerald-400 bg-gray-900/50 p-3 rounded-lg overflow-x-auto font-mono">
          name,description,price,image,category,stock,isOutOfStock,isHidden,discountedPrice
        </code>
      </div>
      
      <label className="block">
        <div className="border-2 border-dashed border-gray-600 hover:border-emerald-500/50 rounded-2xl p-8 text-center cursor-pointer transition-all group hover:bg-emerald-500/5">
          <Upload className="w-10 h-10 text-gray-500 group-hover:text-emerald-400 mx-auto mb-3 transition-colors" />
          <p className="text-white font-medium mb-1">CSV dosyası seçin veya sürükleyin</p>
          <p className="text-gray-500 text-sm">Maksimum 10MB</p>
        </div>
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onUpload}
        />
      </label>
    </div>
  </motion.div>
);

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { fetchAllProducts, products } = useProductStore();
  const { user } = useUserStore();
  const navigate = useNavigate();
  const [editingProduct, setEditingProduct] = useState(null);
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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

  const menuItems = useMemo(() => [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "analytics", label: "Gelişmiş Analiz", icon: BarChart },
    { id: "orders", label: "Siparişler", icon: Package2, badge: 0 },
    { id: "products", label: "Ürünler", icon: ShoppingBasket },
    { id: "create", label: "Ürün Ekle", icon: PlusCircle },
    { id: "users", label: "Kullanıcılar", icon: Users },
    { id: "coupons", label: "Kuponlar", icon: Tag },
    { id: "referrals", label: "Referral", icon: Gift },
    { id: "feedback", label: "Geri Bildirimler", icon: MessageSquare },
    { id: "photocopy", label: "Fotokopi", icon: FileText },
    { id: "banners", label: "Banner'lar", icon: Image },
    { id: "bulk-upload", label: "Toplu Yükleme", icon: Upload },
    { id: "settings", label: "Ayarlar", icon: Settings },
  ], []);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardWidgets />;
      case "analytics":
        return <AdvancedAnalyticsTab />;
      case "orders":
        return <OrdersList />;
      case "products":
        return (
          <ProductsList
            products={products}
            onEdit={handleEdit}
            editingProduct={editingProduct}
            setEditingProduct={setEditingProduct}
            onSave={handleSave}
          />
        );
      case "create":
        return <CreateProductForm />;
      case "users":
        return (
          <UsersTab
            users={users}
            loading={loadingUsers}
            error={errorUsers}
            onRefresh={fetchUsers}
          />
        );
      case "feedback":
        return <FeedbackList />;
      case "photocopy":
        return <PhotocopyTab />;
      case "banners":
        return <BannerTab />;
      case "bulk-upload":
        return <BulkUploadSection onUpload={handleBulkUpload} />;
      case "coupons":
        return <CouponsTab />;
      case "referrals":
        return <ReferralsTab />;
      case "settings":
        return <SettingsTab />;
      default:
        return <DashboardWidgets />;
    }
  };

  const activeMenuItem = menuItems.find(item => item.id === activeTab);

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: sidebarCollapsed ? 80 : 280,
          x: mobileMenuOpen ? 0 : (window.innerWidth < 1024 ? -280 : 0)
        }}
        className={`
          fixed lg:relative h-screen z-50 
          bg-[#0d1321]/95 backdrop-blur-xl border-r border-white/5
          flex flex-col
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo Section */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1"
              >
                <h1 className="text-white font-bold text-lg">Benim Marketim</h1>
                <p className="text-gray-500 text-xs">Yönetici Paneli</p>
              </motion.div>
            )}
            {/* Desktop: Collapse Button / Mobile: Close Button */}
            <button 
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setMobileMenuOpen(false);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            >
              {mobileMenuOpen && window.innerWidth < 1024 ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.id}
              badge={item.badge}
              collapsed={sidebarCollapsed}
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
            />
          ))}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-white/5">
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{user?.name || 'Admin'}</p>
                <p className="text-gray-500 text-xs truncate">{user?.email || 'admin@example.com'}</p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-[#0a0f1a]/80 backdrop-blur-xl border-b border-white/5 px-4 lg:px-6 py-3">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Page Title */}
            <div className="flex-1 min-w-0">
              <motion.h2 
                key={activeTab}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold text-white"
              >
                {activeMenuItem?.label || 'Dashboard'}
              </motion.h2>
              <p className="text-gray-500 text-xs">
                {currentTime.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            {/* Search */}
            <div className="hidden md:flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2 border border-white/5 focus-within:border-emerald-500/50 transition-colors">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-white text-sm placeholder:text-gray-500 focus:outline-none w-48"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2.5 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </motion.button>
                
                <AnimatePresence>
                  {showNotifications && (
                    <NotificationPanel 
                      notifications={notifications} 
                      onClose={() => setShowNotifications(false)} 
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* User Avatar */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="hidden sm:flex w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20"
              >
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </motion.button>
            </div>
          </div>
        </header>

        {/* Quick Stats (Only on Dashboard) */}
        {activeTab === "dashboard" && (
          <div className="px-4 lg:px-6 py-4 border-b border-white/5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <QuickStatCard 
                icon={ShoppingBasket} 
                label="Toplam Ürün" 
                value={products?.length || 0}
                trend={12}
                color="from-blue-500 to-indigo-600"
                delay={0}
              />
              <QuickStatCard 
                icon={Users} 
                label="Kullanıcılar" 
                value={users?.length || 0}
                trend={8}
                color="from-emerald-500 to-teal-600"
                delay={0.1}
              />
              <QuickStatCard 
                icon={Package2} 
                label="Aktif Sipariş" 
                value="0"
                color="from-violet-500 to-purple-600"
                delay={0.2}
              />
              <QuickStatCard 
                icon={BarChart} 
                label="Günlük Gelir" 
                value="₺0"
                trend={-5}
                color="from-amber-500 to-orange-600"
                delay={0.3}
              />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="px-4 lg:px-6 py-3 border-t border-white/5 bg-[#0a0f1a]/50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <p>© 2024 Benim Marketim. Tüm hakları saklıdır.</p>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3" />
              <span>{currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AdminPage;