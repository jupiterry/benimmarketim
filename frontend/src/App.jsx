import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SignUpPage from "./pages/SignUpPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import CategoryPage from "./pages/CategoryPage";
import UserOrders from "./pages/UserOrders";
import Navbar from "./components/Navbar";
import { Toaster } from "react-hot-toast";
import { useUserStore } from "./stores/useUserStore";
import { useEffect } from "react";
import LoadingSpinner from "./components/LoadingSpinner";
import CartPage from "./pages/CartPage";
import { useCartStore } from "./stores/useCartStore";
import PurchaseSuccessPage from "./pages/PurchaseSuccessPage";
import OrderCreated from "./pages/OrderCreated";
import Footer from "./components/Footer";
import SearchResultsPage from "./pages/SearchResultsPage"; // 🔥 Yeni eklenen sayfa
import BulkUpload from "./components/BulkUpload"; // Yeni eklenen bileşen

function App() {
  const { user, checkAuth, checkingAuth } = useUserStore();
  const { getCartItems } = useCartStore();

  useEffect(() => {
      checkAuth();
  }, [checkAuth]);

  useEffect(() => {
      if (!user) return;
      getCartItems();
  }, [getCartItems, user]);

  if (checkingAuth) return <LoadingSpinner />;

  return (
      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden flex flex-col">
          <div className="absolute inset-0 overflow-hidden">
              <div className="absolute inset-0">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.3)_0%,rgba(10,80,60,0.2)_45%,rgba(0,0,0,0.1)_100%)]" />
              </div>
          </div>

          <div className="relative z-50 pt-20 flex-grow">
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
                  <Route path="/siparisolusturuldu" element={user ? <OrderCreated /> : <Navigate to="/login" />} />
                  <Route path="/siparislerim" element={user ? <UserOrders /> : <Navigate to="/login" />} />
                  <Route path="/search" element={<SearchResultsPage />} />
                  {/* Yeni eklenen toplu ürün yükleme sayfası */}
                  <Route
                      path="/bulk-upload"
                      element={user?.role === "admin" ? <BulkUpload /> : <Navigate to="/login" />}
                  />
              </Routes>
          </div>

          <Footer />
          <Toaster />
      </div>
  );
}

export default App;