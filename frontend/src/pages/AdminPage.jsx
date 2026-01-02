import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useProductStore } from "../stores/useProductStore";
import { useUserStore } from "../stores/useUserStore";
import { useNavigate } from "react-router-dom";

// Admin Theme CSS
import "../styles/admin-theme.css";

// New Admin Components
import AdminSidebar from "../components/admin/AdminSidebar";
import AdminHeader, { AdminStatusBar } from "../components/admin/AdminHeader";
import CommandPalette from "../components/admin/CommandPalette";

// Tab Components
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
import ChatTab from "../components/ChatTab";
import WeeklyProductsTab from "../components/WeeklyProductsTab";

import { Upload } from "lucide-react";

// Bulk Upload Section Component
const BulkUploadSection = ({ onUpload }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="max-w-2xl mx-auto"
  >
    <div className="admin-card">
      <div className="admin-card-body">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/30">
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
    </div>
  </motion.div>
);

const AdminPage = () => {
  // State
  const [activeTab, setActiveTab] = useState("orders");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  // Stores
  const { fetchAllProducts, products } = useProductStore();
  const { user } = useUserStore();
  const navigate = useNavigate();

  // Product edit state
  const [editingProduct, setEditingProduct] = useState(null);
  
  // Users state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState(null);

  // Tab labels for breadcrumbs
  const tabLabels = useMemo(() => ({
    dashboard: "Dashboard",
    analytics: "Gelişmiş Analiz",
    orders: "Siparişler",
    chat: "Canlı Sohbet",
    products: "Ürünler",
    create: "Ürün Ekle",
    users: "Kullanıcılar",
    coupons: "Kuponlar",
    referrals: "Referral",
    feedback: "Geri Bildirimler",
    photocopy: "Fotokopi",
    "weekly-products": "Haftalık Ürünler",
    banners: "Banner'lar",
    "bulk-upload": "Toplu Yükleme",
    settings: "Ayarlar",
  }), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Command Palette: Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      
      // Quick navigation shortcuts (when not in input)
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        if (e.key === 'g') {
          const nextKey = (e2) => {
            e2.preventDefault();
            if (e2.key === 'd') setActiveTab('dashboard');
            else if (e2.key === 'o') setActiveTab('orders');
            else if (e2.key === 'p') setActiveTab('products');
            else if (e2.key === 'u') setActiveTab('users');
            else if (e2.key === 's') setActiveTab('settings');
            else if (e2.key === 'c') setActiveTab('chat');
            window.removeEventListener('keydown', nextKey);
          };
          window.addEventListener('keydown', nextKey, { once: true });
          setTimeout(() => window.removeEventListener('keydown', nextKey), 1000);
        }
        if (e.key === 'n') {
          setActiveTab('create');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchAllProducts();
    fetchUsers();
    updateLastSync();
  }, [fetchAllProducts]);

  const updateLastSync = () => {
    setLastSync(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  };

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchAllProducts(),
        fetchUsers()
      ]);
      updateLastSync();
      toast.success("Veriler güncellendi");
    } catch (error) {
      toast.error("Güncelleme başarısız");
    } finally {
      setRefreshing(false);
    }
  }, [fetchAllProducts]);

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

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardWidgets />;
      case "analytics":
        return <AdvancedAnalyticsTab />;
      case "orders":
        return <OrdersList />;
      case "chat":
        return <ChatTab />;
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
      case "weekly-products":
        return <WeeklyProductsTab />;
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

  return (
    <div className="admin-layout">
      {/* Command Palette */}
      <CommandPalette 
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleTabChange}
        currentTab={activeTab}
      />

      {/* Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        user={user}
        orderCount={0}
        chatCount={0}
      />

      {/* Main Content */}
      <main className={`admin-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Header */}
        <AdminHeader
          pageTitle={tabLabels[activeTab] || "Dashboard"}
          breadcrumbs={[tabLabels[activeTab] || "Dashboard"]}
          onMenuClick={() => setMobileMenuOpen(true)}
          onSearchClick={() => setCommandPaletteOpen(true)}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          notifications={notifications}
          user={user}
          collapsed={sidebarCollapsed}
        />

        {/* Content Area */}
        <div className="admin-content pb-20 lg:pb-8">
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
        </div>

        {/* Status Bar (Desktop) */}
        <AdminStatusBar 
          collapsed={sidebarCollapsed}
          serverStatus="online"
          lastSync={lastSync}
        />
      </main>
    </div>
  );
};

export default AdminPage;