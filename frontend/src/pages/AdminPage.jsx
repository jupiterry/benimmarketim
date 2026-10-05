import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import { useProductStore } from "../stores/useProductStore";
import { useUserStore } from "../stores/useUserStore";
import socketService from "../lib/socket";

// Admin Theme CSS
import "../styles/admin-theme.css";

// New Admin Components
import AdminSidebar from "../components/admin/AdminSidebar";
import AdminHeader from "../components/admin/AdminHeader";
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
import AdminAuditTab from "../components/AdminAuditTab";
import ChatTab from "../components/ChatTab";
import WeeklyProductsTab from "../components/WeeklyProductsTab";
import AiKnowledgeCenter from "../components/AiKnowledgeCenter";
import SupportQueueTab from "../components/SupportQueueTab";

import { Package, Upload } from "lucide-react";

const loadStoredNotifications = () => {
  try {
    return JSON.parse(
      localStorage.getItem("admin-order-notifications") || "[]",
    );
  } catch {
    return [];
  }
};

// Bulk Upload Section Component
const BulkUploadSection = ({ onUpload }) => (
  <div className="ui-card" style={{ maxWidth: 640 }}>
    <div className="ui-card-header">
      <div>
        <h2 className="ui-title">Toplu Ürün Yükleme</h2>
        <p className="ui-subtitle">CSV dosyası ile ürünleri toplu olarak yükleyin</p>
      </div>
    </div>
    <div className="ui-card-body ui-stack">
      <div>
        <p className="ui-label">CSV dosyası aşağıdaki başlıklara sahip olmalıdır:</p>
        <code className="ui-code">
          name,description,price,image,category,stock,isOutOfStock,isHidden,discountedPrice
        </code>
      </div>

      <label className="ui-dropzone">
        <Upload />
        <span className="ui-strong">CSV dosyası seçin veya sürükleyin</span>
        <span className="ui-text-xs ui-muted">Maksimum 10MB</span>
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onUpload}
        />
      </label>
    </div>
  </div>
);

const AdminPage = () => {
  // State
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return ["orders", "chat", "support-queue", "ai-knowledge"].includes(tab) ? tab : "dashboard";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState(loadStoredNotifications);
  const [lastSync, setLastSync] = useState(null);
  const [adminBadges, setAdminBadges] = useState({ orders: 0, chats: 0 });
  const handledOrderIdsRef = useRef(new Set());

  // Stores
  const { fetchAllProducts, products } = useProductStore();
  const { user } = useUserStore();

  // Product edit state
  const [editingProduct, setEditingProduct] = useState(null);

  // Users state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState(null);

  // Tab labels for breadcrumbs
  const tabLabels = useMemo(
    () => ({
      dashboard: "Genel bakış",
      analytics: "Satış analizi",
      orders: "Siparişler",
      chat: "Mesajlar",
      "support-queue": "Bekleyen Destekler",
      "ai-knowledge": "Yapay Zekâ Bilgi Merkezi",
      products: "Ürün kataloğu",
      create: "Ürün Ekle",
      users: "Müşteriler",
      coupons: "Kuponlar",
      referrals: "Davet sistemi",
      feedback: "Geri Bildirimler",
      photocopy: "Fotokopi",
      "weekly-products": "Haftalık fırsatlar",
      banners: "Vitrin görselleri",
      "bulk-upload": "Toplu Yükleme",
      settings: "Ayarlar",
      audit: "İşlem kayıtları",
    }),
    [],
  );

  const tabDescriptions = {
    analytics:
      "Satış verilerinizden mağazanızın büyümesine uzanan net bir bakış.",
    orders: "Yeni siparişten teslimata, tüm süreci tek yerden yönetin.",
    products:
      "Mağazanızın ürünlerini, fiyatlarını ve görünürlüğünü düzenleyin.",
    create: "Kataloğunuza yeni bir ürün ekleyin, müşterilerinizle buluşturun.",
    users: "Müşterilerinizi tanıyın ve hesaplarını kolayca yönetin.",
    coupons:
      "Doğru fırsatı sunun. Kuponları ve kullanım geçmişlerini takip edin.",
    referrals:
      "Davetleri, kazanılan ödülleri ve müşteri bağlantılarını inceleyin.",
    chat: "Müşterilerinizle iletişimde kalın, sorularını yanıtlayın.",
    "support-queue": "Yapay zekânın ekibinize aktardığı görüşmeleri yönetin.",
    "ai-knowledge": "Asistanın kullanacağı doğrulanmış mağaza bilgilerini yönetin.",
    feedback: "Müşterilerinizin sesini dinleyin, deneyimlerini iyileştirin.",
    photocopy: "Fotokopi taleplerini ve dosyalarını buradan yönetin.",
    "weekly-products":
      "Haftanın fırsatlarını seçin ve mağazanızı güncel tutun.",
    banners: "Mağazanızın vitrinini kampanyalarınıza uygun şekilde düzenleyin.",
    "bulk-upload": "Ürün kataloğunuzu CSV dosyasıyla toplu olarak güncelleyin.",
    settings: "Mağazanızın çalışma düzenini ve tercihlerini belirleyin.",
    audit: "Yöneticilerin yaptığı hassas işlemleri inceleyin.",
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Command Palette: Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }

      // Quick navigation shortcuts (when not in input)
      if (
        !e.target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      ) {
        if (e.key === "g") {
          const nextKey = (e2) => {
            e2.preventDefault();
            if (e2.key === "d") setActiveTab("dashboard");
            else if (e2.key === "o") setActiveTab("orders");
            else if (e2.key === "p") setActiveTab("products");
            else if (e2.key === "u") setActiveTab("users");
            else if (e2.key === "s") setActiveTab("settings");
            else if (e2.key === "c") setActiveTab("chat");
            window.removeEventListener("keydown", nextKey);
          };
          window.addEventListener("keydown", nextKey, { once: true });
          setTimeout(
            () => window.removeEventListener("keydown", nextKey),
            1000,
          );
        }
        if (e.key === "n") {
          setActiveTab("create");
        }
      }
    };

    // Mobile menu toggle event handler
    const handleMobileMenuToggle = () => {
      setMobileMenuOpen((prev) => !prev);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("toggleMobileMenu", handleMobileMenuToggle);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("toggleMobileMenu", handleMobileMenuToggle);
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
        axios.get("/orders-analytics"),
        axios.get("/chat/unread-count"),
      ]);
      const usersOrders =
        ordersResponse.data?.orderAnalyticsData?.usersOrders || [];
      const orders = usersOrders.flatMap((entry) => entry.orders || []);
      setAdminBadges({
        orders: orders.filter((order) => order.status === "Hazırlanıyor")
          .length,
        chats: Number(
          chatResponse.data?.count || chatResponse.data?.unreadCount || 0,
        ),
      });
    } catch {
      // Rozet verisi yardımcı bilgidir; ana paneli engellemez.
    }
  };

  const updateLastSync = () => {
    setLastSync(
      new Date().toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
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
      toast.error(
        error.response?.data?.message ||
          "Kullanıcılar yüklenirken hata oluştu.",
      );
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchAllProducts(), fetchUsers(), fetchAdminBadges()]);
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
      if (handledOrderIdsRef.current.has(order.id)) return;
      handledOrderIdsRef.current.add(order.id);
      window.setTimeout(
        () => handledOrderIdsRef.current.delete(order.id),
        60000,
      );
      const notification = {
        id: order.id,
        message: `${order.customerName || "Müşteri"} yeni sipariş verdi · ₺${Number(order.totalAmount || 0).toFixed(2)}`,
        time: new Date(order.createdAt || Date.now()).toLocaleTimeString(
          "tr-TR",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        ),
        order,
      };

      setNotifications((current) => {
        const next = [
          notification,
          ...current.filter((item) => item.id !== notification.id),
        ].slice(0, 30);
        localStorage.setItem("admin-order-notifications", JSON.stringify(next));
        return next;
      });
      setAdminBadges((current) => ({ ...current, orders: current.orders + 1 }));
      updateLastSync();

      const selectedSound =
        localStorage.getItem("notificationSound") || "ringtone";
      const audio = new Audio(`/${selectedSound}.mp3`);
      audio.volume = 0.75;
      audio.play().catch(() => {
        // Tarayıcı ilk kullanıcı etkileşimine kadar otomatik sesi engelleyebilir.
      });

      toast.custom(
        (t) => (
          <div
            className={`${t.visible ? "animate-enter" : "animate-leave"} admin-toast`}
          >
            <div className="admin-toast-head">
              <span className="admin-toast-icon">
                <Package size={16} />
              </span>
              <div>
                <p className="admin-toast-title">Yeni sipariş alındı</p>
                <p className="admin-toast-name">
                  {order.customerName || "Müşteri"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="admin-toast-close"
              >
                Kapat
              </button>
            </div>
            <p className="admin-toast-meta">
              #{String(order.id).slice(-6).toUpperCase()} ·{" "}
              {order.products?.length || 0} ürün ·{" "}
              {order.deliveryPointName || order.city || "Teslimat"}
            </p>
            <div className="admin-toast-foot">
              <p className="admin-toast-amount">
                ₺{Number(order.totalAmount || 0).toFixed(2)}
              </p>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  setActiveTab("orders");
                }}
                className="admin-toast-action"
              >
                Siparişi incele
              </button>
            </div>
          </div>
        ),
        { id: `order-${order.id}`, duration: 9000, position: "top-right" },
      );

      if ("Notification" in window && Notification.permission === "granted") {
        const browserNotification = new Notification(
          "Benim Marketim · Yeni Sipariş",
          {
            body: `${order.customerName || "Müşteri"} · ₺${Number(order.totalAmount || 0).toFixed(2)}`,
            icon: "/favicon.ico",
            tag: `order-${order.id}`,
          },
        );
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
      toast.error(
        error.response?.data?.message || "Ürün güncellenirken hata oluştu",
      );
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
      toast.error(
        error.response?.data?.message || "Yükleme sırasında hata oluştu",
      );
    }
  };

  const handleTabChange = useCallback((tab, preset) => {
    if (tab === "orders" && preset) sessionStorage.setItem("admin-order-preset", preset);
    setActiveTab(tab);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardWidgets onNavigate={handleTabChange} />;
      case "analytics":
        return <AdvancedAnalyticsTab />;
      case "orders":
        return <OrdersList />;
      case "chat":
        return <ChatTab />;
      case "support-queue":
        return <SupportQueueTab onOpenChat={(chatId) => { const url = new URL(window.location.href); url.searchParams.set("tab", "chat"); url.searchParams.set("chatId", chatId); window.history.replaceState({}, "", url); setActiveTab("chat"); }} />;
      case "ai-knowledge":
        return <AiKnowledgeCenter />;
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
            onOpenChat={(chatId) => { const url = new URL(window.location.href); url.searchParams.set("tab", "chat"); url.searchParams.set("chatId", chatId); window.history.replaceState({}, "", url); setActiveTab("chat"); }}
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
      case "audit":
        return <AdminAuditTab />;
      default:
        return <DashboardWidgets onNavigate={handleTabChange} />;
    }
  };

  return (
    <div className={`admin-layout app ${sidebarCollapsed ? "is-rail" : ""}`}>
      <a className="app-skip" href="#admin-workspace">
        İçeriğe geç
      </a>
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
      <main className="app-main">
        {/* Header */}
        <AdminHeader
          pageTitle={tabLabels[activeTab] || "Dashboard"}
          onMenuClick={() => setMobileMenuOpen(true)}
          onSearchClick={() => setCommandPaletteOpen(true)}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          notifications={notifications}
          onClearNotifications={clearNotifications}
          onViewNotifications={() => setActiveTab("orders")}
          onNavigate={handleTabChange}
          user={user}
          lastSync={lastSync}
        />

        {/* Content Area */}
        <div
          id="admin-workspace"
          tabIndex={-1}
          className="admin-content app-content"
          data-tab={activeTab}
        >
          {!["dashboard", "orders", "analytics", "weekly-products", "coupons", "banners", "referrals", "feedback", "photocopy", "settings", "support-queue"].includes(activeTab) && (
            <header className="app-pagehead">
              <div>
                <h1>{tabLabels[activeTab]}</h1>
                <p>{tabDescriptions[activeTab]}</p>
              </div>
            </header>
          )}
          <div key={activeTab}>{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
