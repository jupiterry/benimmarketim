import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
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
      </div>
      </ConfirmProvider>
    </HelmetProvider>
  );
}

export default App;