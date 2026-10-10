import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import HomePage from "./pages/HomePage";
import CategoryLandingPage from "./pages/CategoryLandingPage";
import { marketCategories, publicPages } from "./data/seo";
import Navbar from "./components/Navbar";
import { Toaster } from "react-hot-toast";
import { useUserStore } from "./stores/useUserStore";
import LoadingSpinner from "./components/LoadingSpinner";
import { useSettingsStore } from "./stores/useSettingsStore";
import Footer from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";
import { ConfirmProvider } from "./components/ConfirmModal";

// Ana sayfa ve kategori sayfaları ilk pakette kalır (önceden render edilip
// hemen gösterilirler). Diğer sayfalar ve admin paneli yalnızca açıldıklarında
// indirilir; böylece ana sayfanın JavaScript yükü küçülür.
const loadLoginPage = () => import("./pages/LoginPage");
const loadSignUpPage = () => import("./pages/SignUpPage");
const LoginPage = lazy(loadLoginPage);
const SignUpPage = lazy(loadSignUpPage);
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const PhotocopyPage = lazy(() => import("./pages/PhotocopyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const DistanceSalesPage = lazy(() => import("./pages/DistanceSalesPage"));
const ReturnPolicyPage = lazy(() => import("./pages/ReturnPolicyPage"));
const CookiesPage = lazy(() => import("./pages/CookiesPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const FAQPage = lazy(() => import("./pages/FAQPage"));
const KVKKPage = lazy(() => import("./pages/KVKKPage"));
const KvkkRequestPage = lazy(() => import("./pages/KvkkRequestPage"));
const AccountDeletionPage = lazy(() => import("./pages/AccountDeletionPage"));
const ReferralPage = lazy(() => import("./pages/ReferralPage"));
const BulkUpload = lazy(() => import("./components/BulkUpload"));
const FloatingChatWidget = lazy(() => import("./components/FloatingChatWidget"));
const CustomerAiChatWidget = lazy(() => import("./components/CustomerAiChatWidget"));

const ProtectedRoute = ({ children }) => {
  const { user } = useUserStore();
  if (!user) {
    return <Navigate to="/login" />;
  }
  return children;
};

function App() {
  const { user, checkAuth, checkingAuth } = useUserStore();
  const location = useLocation();
  const { fetchSettings } = useSettingsStore();
  const isAdminPanel = location.pathname === "/secret-dashboard";

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Giriş ve kayıt sayfalarını sayfa boşa çıktığında önceden indir; tıklandığında beklemesin.
  useEffect(() => {
    const prefetch = () => {
      loadLoginPage().catch(() => {});
      loadSignUpPage().catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetch, 2500);
    return () => window.clearTimeout(id);
  }, []);

  const publicPath = location.pathname.replace(/\/+$/, "") || "/";
  const isPublicPage = publicPages.includes(publicPath) ||
    marketCategories.some((category) => category.path === publicPath);
  if (checkingAuth && !isPublicPage) return <LoadingSpinner />;

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
          {!isAdminPanel && <Navbar />}
          <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            {marketCategories.map((category) => (
              <Route key={category.slug} path={category.path} element={<CategoryLandingPage category={category} />} />
            ))}
            <Route path="/signup" element={!user ? <SignUpPage /> : <Navigate to="/" />} />
            <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/secret-dashboard"
              element={user?.role === "admin" ? <AdminPage /> : <Navigate to="/login" />}
            />
            <Route path="/cart" element={<Navigate to="/" replace />} />
            <Route path="/checkout/*" element={<Navigate to="/" replace />} />
            <Route path="/products/*" element={<Navigate to="/" replace />} />
            <Route path="/product/*" element={<Navigate to="/" replace />} />
            <Route path="/categories" element={<Navigate to="/" replace />} />
            <Route path="/category/*" element={<Navigate to="/" replace />} />
            <Route path="/search" element={<Navigate to="/" replace />} />
            <Route path="/order-summary/*" element={<Navigate to="/" replace />} />
            <Route path="/siparisolusturuldu" element={<Navigate to="/" replace />} />
            <Route path="/siparislerim" element={<Navigate to="/" replace />} />
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
            <Route path="/kvkk-basvuru" element={<KvkkRequestPage />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </div>

        {!isAdminPanel && <Footer />}
        <Toaster />
        <Suspense fallback={null}>
          {user?.role === "admin" && !isAdminPanel && <FloatingChatWidget />}
          {user && user.role !== "admin" && <CustomerAiChatWidget />}
        </Suspense>
      </div>
      </ConfirmProvider>
    </HelmetProvider>
  );
}

export default App;
