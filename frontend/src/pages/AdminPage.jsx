import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useProductStore } from "../stores/useProductStore";
import { useUserStore } from "../stores/useUserStore";
import { useNavigate } from "react-router-dom";
import socketService from "../lib/socket";

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

import { Package, Upload } from "lucide-react";

const loadStoredNotifications = () => {
  try {
    return JSON.parse(localStorage.getItem("admin-order-notifications") || "[]");
  } catch {
    return [];
  }
};

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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState(loadStoredNotifications);
  const [lastSync, setLastSync] = useState(null);
  const [adminBadges, setAdminBadges] = useState({ orders: 0, chats: 0 });

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

    // Mobile menu toggle event handler
    const handleMobileMenuToggle = () => {
      setMobileMenuOpen(prev => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('toggleMobileMenu', handleMobileMenuToggle);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('toggleMobileMenu', handleMobileMenuToggle);
    };
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchAllProducts();
    fetchUsers();
    fetchAdminBadges();
    updateLastSync();
  }, [fetchAllProducts]);

  const fetchAdminBadges = async () => {
    try {
      const [ordersResponse, chatResponse] = await Promise.all([
        axios.get('/orders-analytics'),
        axios.get('/chat/unread-count'),
      ]);
      const usersOrders = ordersResponse.data?.orderAnalyticsData?.usersOrders || [];
      const orders = usersOrders.flatMap((entry) => entry.orders || []);
      setAdminBadges({
        orders: orders.filter((order) => order.status === 'Hazırlanıyor').length,
        chats: Number(chatResponse.data?.count || chatResponse.data?.unreadCount || 0),
      });
    } catch {
      // Rozet verisi yardımcı bilgidir; ana paneli engellemez.
    }
  };

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
        fetchUsers(),
        fetchAdminBadges()
      ]);
      updateLastSync();
      toast.success("Veriler güncellendi");
    } catch (error) {
      toast.error("Güncelleme başarısız");
    } finally {
      setRefreshing(false);
    }
  }, [fetchAllProducts]);

  // Yeni siparişleri yönetici panelinin hangi sekmesi açık olursa olsun dinle.
  // Liste localStorage'da tutulduğu için sayfa yenilendiğinde de kaybolmaz.
  useEffect(() => {
    if (user?.role !== "admin") return undefined;

    const socket = socketService.connect();
    window.__adminGlobalOrderNotifications = true;

    const joinAdminRoom = () => socketService.joinAdminRoom(user?.accessToken);
    const handleNewOrder = (data) => {
      if (!data?.order || data.order.id === "test") return;

      const order = data.order;
      const notification = {
        id: order.id,
        message: `${order.customerName || "Müşteri"} yeni sipariş verdi · ₺${Number(order.totalAmount || 0).toFixed(2)}`,
        time: new Date(order.createdAt || Date.now()).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        order,
      };

      setNotifications((current) => {
        const next = [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 30);
        localStorage.setItem("admin-order-notifications", JSON.stringify(next));
        return next;
      });
      setAdminBadges((current) => ({ ...current, orders: current.orders + 1 }));
      updateLastSync();

      const selectedSound = localStorage.getItem("notificationSound") || "ringtone";
      const audio = new Audio(`/${selectedSound}.mp3`);
      audio.volume = 0.75;
      audio.play().catch(() => {
        // Tarayıcı ilk kullanıcı etkileşimine kadar otomatik sesi engelleyebilir.
      });

      toast.custom((t) => (
        <div className={`${t.visible ? "animate-enter" : "animate-leave"} w-full max-w-sm rounded-2xl border border-emerald-400/25 bg-[#101a18]/95 p-4 text-white shadow-2xl backdrop-blur-xl`}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15">
              <Package className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Yeni mobil sipariş</p>
              <p className="mt-1 truncate text-sm text-gray-300">{order.customerName || "Müşteri"}</p>
              <p className="mt-1 text-lg font-extrabold text-emerald-400">₺{Number(order.totalAmount || 0).toFixed(2)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              setActiveTab("orders");
            }}
            className="mt-3 w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-400"
          >
            Siparişi aç
          </button>
        </div>
      ), { duration: 10000, position: "top-right" });

      if ("Notification" in window && Notification.permission === "granted") {
        const browserNotification = new Notification("Benim Marketim · Yeni Sipariş", {
          body: `${order.customerName || "Müşteri"} · ₺${Number(order.totalAmount || 0).toFixed(2)}`,
          icon: "/favicon.ico",
          tag: `order-${order.id}`,
        });
        browserNotification.onclick = () => {
          window.focus();
          setActiveTab("orders");
          browserNotification.close();
        };
      }
    };

    socket.on("connect", joinAdminRoom);
    socket.on("newOrder", handleNewOrder);
    if (socket.connected) joinAdminRoom();

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      socket.off("connect", joinAdminRoom);
      socket.off("newOrder", handleNewOrder);
      window.__adminGlobalOrderNotifications = false;
    };
  }, [user?.role, user?.accessToken]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    localStorage.removeItem("admin-order-notifications");
  }, []);

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
        orderCount={adminBadges.orders}
        chatCount={adminBadges.chats}
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
          onClearNotifications={clearNotifications}
          onViewNotifications={() => setActiveTab("orders")}
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
