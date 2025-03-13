import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
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
import ScrollToTop from "./components/ScrollToTop";

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
        </Routes>
      </div>

      <Footer />
      <Toaster />
    </div>
  );
}

export default App;