import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { HelmetProvider } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import HomePage from "./pages/HomePage";
import SignUpPage from "./pages/SignUpPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import CategoryPage from "./pages/CategoryPage";
import UserOrders from "./pages/UserOrders";
import Navbar from "./components/Navbar";
import { Toaster } from "react-hot-toast";
import { useUserStore } from "./stores/useUserStore";
import LoadingSpinner from "./components/LoadingSpinner";
import CartPage from "./pages/CartPage";
import { useCartStore } from "./stores/useCartStore";
import { useSettingsStore } from "./stores/useSettingsStore";
import PurchaseSuccessPage from "./pages/PurchaseSuccessPage";
import OrderCreated from "./pages/OrderCreated";
import Footer from "./components/Footer";
import SearchResultsPage from "./pages/SearchResultsPage";
import BulkUpload from "./components/BulkUpload";
import FeedbackPage from "./pages/FeedbackPage";
import PrivacyPage from "./pages/PrivacyPage";
import PhotocopyPage from "./pages/PhotocopyPage";
import TermsPage from "./pages/TermsPage";
import DistanceSalesPage from "./pages/DistanceSalesPage";
import ReturnPolicyPage from "./pages/ReturnPolicyPage";
import CookiesPage from "./pages/CookiesPage";
import ContactPage from "./pages/ContactPage";
import AboutPage from "./pages/AboutPage";
import FAQPage from "./pages/FAQPage";
import KVKKPage from "./pages/KVKKPage";
import AccountDeletionPage from "./pages/AccountDeletionPage";
import ReferralPage from "./pages/ReferralPage";
import ScrollToTop from "./components/ScrollToTop";
import AppDownloadModal from "./components/AppDownloadModal";
import { ConfirmProvider } from "./components/ConfirmModal";
import FloatingChatWidget from "./components/FloatingChatWidget";
import { CartNotificationProvider, useCartNotification } from "./context/CartNotificationContext";

const ProtectedRoute = ({ children }) => {
  const { user } = useUserStore();
  if (!user) {
    return <Navigate to="/login" />;
  }
  return children;
};

function App() {
  const { user, checkAuth, checkingAuth } = useUserStore();
  const { getCartItems } = useCartStore();
  const { fetchSettings } = useSettingsStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!user) return;
    getCartItems();
  }, [getCartItems, user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (checkingAuth) return <LoadingSpinner />;

  return (
    <HelmetProvider>
      <ConfirmProvider>
        <CartNotificationProvider>
          <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden flex flex-col">
            <ScrollToTop />
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute inset-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.1)_0%,rgba(0,0,0,0)_50%)]" />
              </div>
            </div>

            <div className="relative z-50 flex-grow">
              <Navbar />
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/signup" element={!user ? <SignUpPage /> : <Navigate to="/" />} />
                <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
                <Route
                  path="/secret-dashboard"
                  element={user?.role === "admin" ? <AdminPage /> : <Navigate to="/login" />}
                />
                <Route path="/category/:category" element={<CategoryPage />} />
                <Route path="/cart" element={user ? <CartPage /> : <Navigate to="/login" />} />
                <Route
                  path="/order-summary/"
                  element={user ? <PurchaseSuccessPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/siparisolusturuldu"
                  element={user ? <OrderCreated /> : <Navigate to="/login" />}
                />
                <Route
                  path="/siparislerim"
                  element={user ? <UserOrders /> : <Navigate to="/login" />}
                />
                <Route path="/search" element={<SearchResultsPage />} />
                <Route
                  path="/bulk-upload"
                  element={user?.role === "admin" ? <BulkUpload /> : <Navigate to="/login" />}
                />
                <Route
                  path="/feedback"
                  element={
                    <ProtectedRoute>
                      <FeedbackPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/distance-sales" element={<DistanceSalesPage />} />
                <Route path="/return-policy" element={<ReturnPolicyPage />} />
                <Route path="/cookies" element={<CookiesPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/faq" element={<FAQPage />} />
                <Route path="/kvkk" element={<KVKKPage />} />
                <Route
                  path="/fotokopi"
                  element={
                    <ProtectedRoute>
                      <PhotocopyPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/hesap-silme" element={<AccountDeletionPage />} />
                <Route
                  path="/referral"
                  element={
                    <ProtectedRoute>
                      <ReferralPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </div>

            <Footer />
            <Toaster />
            {user?.role === "admin" && <FloatingChatWidget />}
            <AppDownloadModal />

            {/* Dev Tool — global, bottom-left, only in dev mode for admins */}
            {import.meta.env.DEV && user?.role === "admin" && <DevToolSimulator />}
          </div>
        </CartNotificationProvider>
      </ConfirmProvider>
    </HelmetProvider>
  );
}

/* ═══════════════════════════════════════════════════════
   DEV TOOL — Notification Simulator (Global)
   ═══════════════════════════════════════════════════════ */
const DevToolSimulator = () => {
  const [open, setOpen] = useState(false);
  const { showNotification } = useCartNotification();

  const simulateNewOrder = () => {
    const names = ['Ahmet Yılmaz', 'Elif Demir', 'Mehmet Kaya', 'Zeynep Çelik', 'Mustafa Şahin', 'Ayşe Arslan', 'Emre Koç', 'Fatma Öztürk'];
    const items = [
      { name: 'Süt 1L', price: 32.50 }, { name: 'Ekmek', price: 12.00 }, { name: 'Yumurta (10lu)', price: 65.00 },
      { name: 'Peynir 500g', price: 89.90 }, { name: 'Domates 1kg', price: 28.00 }, { name: 'Çay 1kg', price: 120.00 },
    ];
    const n = Math.floor(Math.random() * 4) + 1;
    const picked = Array.from({ length: n }, () => items[Math.floor(Math.random() * items.length)]);
    const total = picked.reduce((s, p) => s + p.price * (Math.floor(Math.random() * 3) + 1), 0);

    showNotification({
      customerName: names[Math.floor(Math.random() * names.length)],
      totalAmount: total,
      firstProduct: picked[0]?.name || 'Ürün',
      productCount: picked.length,
    });
  };

  return (
    <div className="fixed bottom-6 left-6 z-[60]">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute bottom-14 left-0 w-64 bg-white/[0.95] backdrop-blur-2xl rounded-2xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.2)] border border-gray-200/80 overflow-hidden mb-2"
          >
            <div className="p-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">🛠 Dev Araçları</p>
              <button
                onClick={simulateNewOrder}
                className="w-full px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" /> Sipariş Simüle Et
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm shadow-lg transition-all ${open
          ? 'bg-gray-900 text-white shadow-gray-900/30'
          : 'bg-white/90 backdrop-blur-xl text-gray-500 hover:text-gray-700 border border-gray-200/80 shadow-black/5'
          }`}
      >
        🛠
      </motion.button>
    </div>
  );
};

export default App;