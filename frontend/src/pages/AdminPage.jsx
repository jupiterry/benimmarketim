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
import { PageHeader, usePref } from "../components/admin/ui";
import ErrorBoundary from "../components/admin/ui/ErrorBoundary";

// Tab Components
import CreateProductForm from "../components/CreateProductForm";
import ProductAssistTab from "../components/ProductAssistTab";
import PriceWatchTab from "../components/PriceWatchTab";
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
import PushBroadcastTab from "../components/PushBroadcastTab";
import SiteMessagesTab from "../components/SiteMessagesTab";

import { Package, Upload } from "lucide-react";

// Zil bildirimleri sunucuda saklanır (her cihazda aynı liste). Saat: bugünse "18:52", değilse "10 Eki 18:52".
const notificationTime = (at) => {
  const date = new Date(at || Date.now());
  const clock = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString()
    ? clock
    : `${date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${clock}`;
};
const withTime = (item) => ({ ...item, time: notificationTime(item.at) });

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
  const [notifications, setNotifications] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [adminBadges, setAdminBadges] = useState({ orders: 0, chats: 0 });
  // Tema: açık / koyu / sisteme göre; tercih tarayıcıda saklanır
  const [themePref, setThemePref] = usePref("admin-theme", "system");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  useEffect(() => {
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return undefined;
    const onChange = () => setSystemDark(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  const resolvedTheme = themePref === "system" ? (systemDark ? "dark" : "light") : themePref;
  const toggleTheme = useCallback(() => {
    setThemePref((current) => {
      const isDark = current === "system" ? systemDark : current === "dark";
      return isDark ? "light" : "dark";
    });
  }, [setThemePref, systemDark]);
  // Canlı bağlantı durumu (başlıktaki durum çubuğu)
  const [socketConnected, setSocketConnected] = useState(() => Boolean(socketService.socket?.connected));
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const handledOrderIdsRef = useRef(new Set());
  useEffect(() => {
    const socket = socketService.connect();
    const on = () => setSocketConnected(true);
    const off = () => setSocketConnected(false);
    setSocketConnected(Boolean(socket.connected));
    socket.on("connect", on);
    socket.on("disconnect", off);
    socket.on("connect_error", off);
    return () => { socket.off("connect", on); socket.off("disconnect", off); socket.off("connect_error", off); };
  }, []);

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
      "photo-create": "Fotoğraftan ürün ekle",
      "price-watch": "Fiyat bekçisi",
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
      push: "Bildirim gönder",
      "site-messages": "Başvurular ve mesajlar",
    }),
    [],
  );

  // Tarayıcı sekmesi: bekleyen sipariş sayısı + açık bölüm
  useEffect(() => {
    const previous = document.title;
    const pending = adminBadges.orders > 0 ? `(${adminBadges.orders}) ` : "";
    document.title = `${pending}${tabLabels[activeTab] || "Yönetim"} · Benim Marketim`;
    return () => { document.title = previous; };
  }, [activeTab, adminBadges.orders, tabLabels]);

  const tabDescriptions = {
    analytics:
      "Satış verilerinizden mağazanızın büyümesine uzanan net bir bakış.",
    orders: "Yeni siparişten teslimata, tüm süreci tek yerden yönetin.",
    products:
      "Mağazanızın ürünlerini, fiyatlarını ve görünürlüğünü düzenleyin.",
    create: "Kataloğunuza yeni bir ürün ekleyin, müşterilerinizle buluşturun.",
    "photo-create": "Fotoğrafını çekin; ad, kategori ve şeffaf görsel seçenekleri hazırlansın, siz fiyatı girip onaylayın.",
    "price-watch": "Ürünlerinizin internetteki piyasa fiyatıyla karşılaştırması. Gece kendiliğinden kontrol edilir, fiyatı siz değiştirirsiniz.",
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
    audit: "Ürün ekleme, fiyat, indirim, stok, görünürlük, kampanya, sipariş ve ayar değişikliklerinin tamamı; kim, ne zaman, neyi neye çevirdi.",
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
        // Rozet yalnızca aktif siparişlere bakar; tüm sipariş geçmişini indirmeye gerek yok
        axios.get("/orders-analytics", { params: { active: 1 } }),
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
  // Bildirimler sunucuda da saklanır: panel açılınca, bağlantı yenilenince ve sekmeye dönülünce
  // sunucudaki liste okunur; böylece başka bilgisayarda ya da aynı hesapla başka cihazda da görünür.
  useEffect(() => {
    if (user?.role !== "admin") return undefined;

    const socket = socketService.connect();
    window.__adminGlobalOrderNotifications = true;
    // Eski sürümün bu tarayıcıya özel listesi artık kullanılmıyor
    try {
      localStorage.removeItem("admin-order-notifications");
    } catch {
      // tarayıcı depolaması kapalı olabilir
    }

    let cancelled = false;
    const loadFeed = async () => {
      try {
        const response = await axios.get("/admin-notifications");
        if (!cancelled) setNotifications((response.data?.items || []).map(withTime));
      } catch {
        // Ağ hatasında mevcut liste korunur; bir sonraki bağlantıda yeniden denenir
      }
    };
    const joinAdminRoom = () => {
      socketService.joinAdminRoom(user?.accessToken);
      loadFeed();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") loadFeed();
    };
    const nowLabel = () => notificationTime(Date.now());
    const pushNotification = (notification) => {
      setNotifications((current) => {
        // Uygulama açılışları sık gelir; sipariş ve mesaj bildirimlerini
        // listeden itmemesi için en yeni 10 tanesi tutulur (sunucu da aynı kuralı uygular).
        let appOpens = 0;
        return [
          { at: new Date().toISOString(), ...notification },
          ...current.filter((item) => item.id !== notification.id),
        ]
          .filter((item) => item.kind !== "app-open" || ++appOpens <= 10)
          .slice(0, 30);
      });
    };
    // Aynı hesap başka bir cihazda "Bildirimleri temizle" dediyse burada da temizlenir
    const handleFeedCleared = (data) => {
      if (data?.userId && String(data.userId) === String(user?._id)) setNotifications([]);
    };
    // Yapay zekânın ekibe aktardığı destek talepleri
    const handleSupportRequest = (data) => {
      const requestId = data?.supportRequestId;
      if (!requestId) return;
      const key = `support-${requestId}`;
      if (handledOrderIdsRef.current.has(key)) return;
      handledOrderIdsRef.current.add(key);
      window.setTimeout(() => handledOrderIdsRef.current.delete(key), 60000);
      const customer = data.customerName || "Müşteri";
      pushNotification({
        id: key,
        kind: "support",
        title: customer,
        detail: data.reason || "Canlı destek bekliyor",
        chatId: data.conversationId ? String(data.conversationId) : null,
        time: nowLabel(),
      });
      updateLastSync();
      if (activeTabRef.current !== "support-queue") {
        toast(`${customer} canlı destek bekliyor`, { id: key, icon: "🎧", duration: 6000, position: "top-right" });
      }
    };
    // Müşteriden gelen yeni sohbet mesajları (sohbet başına tek satır)
    const handleChatMessage = (data) => {
      if (!data?.chatId) return;
      if (activeTabRef.current === "chat") return;
      const sender = data.senderName || "Müşteri";
      pushNotification({
        id: `message-${data.chatId}`,
        kind: "message",
        title: sender,
        detail: String((typeof data.message === "string" ? data.message : data.message?.content) || "Yeni mesaj").slice(0, 80),
        chatId: String(data.chatId),
        time: nowLabel(),
      });
      setAdminBadges((current) => ({ ...current, chats: current.chats + 1 }));
      toast(`${sender} yeni mesaj gönderdi`, { id: `message-${data.chatId}`, icon: "💬", duration: 5000, position: "top-right" });
    };
    // Müşteri mobil uygulamayı açtı (müşteri başına tek satır, sessiz uyarı)
    const handleAppOpened = (data) => {
      if (!data?.userId) return;
      const customer = data.name || "Müşteri";
      const key = `app-${data.userId}`;
      pushNotification({
        id: key,
        kind: "app-open",
        title: customer,
        detail: "Uygulamayı açtı",
        userId: String(data.userId),
        time: nowLabel(),
      });
      if (data.appActivity) {
        setUsers((current) =>
          current.map((item) =>
            item._id === data.userId
              ? { ...item, appActivity: data.appActivity }
              : item,
          ),
        );
      }
      toast(`${customer} uygulamayı açtı`, { id: key, icon: "📱", duration: 4000, position: "top-right" });
    };
    // Açık ziyaret sürerken gelen sessiz güncelleme: son görülme ve huni adımları
    const handleAppSeen = (data) => {
      if (!data?.userId) return;
      const { userId, ...fields } = data;
      setUsers((current) =>
        current.map((item) =>
          item._id === userId
            ? { ...item, appActivity: { ...item.appActivity, ...fields } }
            : item,
        ),
      );
    };
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
        at: new Date(order.createdAt || Date.now()).toISOString(),
        time: notificationTime(order.createdAt),
        order,
      };

      pushNotification(notification);
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
    socket.on("SupportRequestCreated", handleSupportRequest);
    socket.on("newChatMessage", handleChatMessage);
    socket.on("appOpened", handleAppOpened);
    socket.on("appSeen", handleAppSeen);
    socket.on("adminFeedCleared", handleFeedCleared);
    document.addEventListener("visibilitychange", onVisible);
    if (socket.connected) joinAdminRoom();
    else loadFeed();

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      socket.off("connect", joinAdminRoom);
      socket.off("newOrder", handleNewOrder);
      socket.off("SupportRequestCreated", handleSupportRequest);
      socket.off("newChatMessage", handleChatMessage);
      socket.off("appOpened", handleAppOpened);
      socket.off("appSeen", handleAppSeen);
      socket.off("adminFeedCleared", handleFeedCleared);
      document.removeEventListener("visibilitychange", onVisible);
      cancelled = true;
      window.__adminGlobalOrderNotifications = false;
    };
  }, [user?.role, user?.accessToken, user?._id]);

  // Temizleme hesaba işlenir: aynı hesapla açık diğer cihazlarda da liste boşalır
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    axios.post("/admin-notifications/clear").catch(() => {
      toast.error("Bildirimler sunucuda temizlenemedi; sayfa yenilenince geri gelebilir.");
    });
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
    setMobileMenuOpen(false);
  }, []);

  // Ekran bileşenleri başka bir bölüme geçmek için bu olayı yayınlar:
  // window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "users" | { tab, preset } }))
  useEffect(() => {
    const onNavigate = (event) => {
      const detail = event.detail;
      if (!detail) return;
      if (typeof detail === "string") handleTabChange(detail);
      else if (detail.tab) handleTabChange(detail.tab, detail.preset);
    };
    window.addEventListener("admin-navigate", onNavigate);
    return () => window.removeEventListener("admin-navigate", onNavigate);
  }, [handleTabChange]);

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
            onCreate={() => handleTabChange("create")}
          />
        );
      case "create":
        return <CreateProductForm />;
      case "photo-create":
        return <ProductAssistTab />;
      case "price-watch":
        return <PriceWatchTab />;
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
      case "push":
        return <PushBroadcastTab />;
      case "site-messages":
        return <SiteMessagesTab />;
      default:
        return <DashboardWidgets onNavigate={handleTabChange} />;
    }
  };

  return (
    <div className={`admin-layout app ${sidebarCollapsed ? "is-rail" : ""}`} data-theme={resolvedTheme}>
      <a className="app-skip" href="#admin-workspace">
        İçeriğe geç
      </a>
      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleTabChange}
        currentTab={activeTab}
        products={products}
        users={users}
        onToggleTheme={toggleTheme}
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
          onViewNotifications={(notification) => {
            if (notification?.kind === "support") return setActiveTab("support-queue");
            if (notification?.kind === "app-open") return setActiveTab("users");
            if (notification?.kind === "message") {
              if (notification.chatId) {
                const url = new URL(window.location.href);
                url.searchParams.set("tab", "chat");
                url.searchParams.set("chatId", notification.chatId);
                window.history.replaceState({}, "", url);
              }
              return setActiveTab("chat");
            }
            return setActiveTab("orders");
          }}
          onNavigate={handleTabChange}
          user={user}
          lastSync={lastSync}
          status={{ connected: socketConnected, orders: adminBadges.orders, chats: adminBadges.chats }}
          theme={resolvedTheme}
          onToggleTheme={toggleTheme}
        />

        {/* Content Area */}
        <div
          id="admin-workspace"
          tabIndex={-1}
          className="admin-content app-content"
          data-tab={activeTab}
        >
          {/* Ekranlar kendi başlığını çizer; yalnızca küçük yardımcı sekmeler ortak başlığı kullanır */}
          {["audit", "bulk-upload"].includes(activeTab) && (
            <PageHeader title={tabLabels[activeTab]} description={tabDescriptions[activeTab]} />
          )}
          <ErrorBoundary resetKey={activeTab}>
            <div key={activeTab}>{renderContent()}</div>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
