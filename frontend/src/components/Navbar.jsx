import { ShoppingCart, UserPlus, LogIn, LogOut, Lock, Package, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";
import SearchBar from "./SearchBar";
import { useState } from "react";

const Navbar = () => {
  const { user, logout } = useUserStore();
  const isAdmin = user?.role === "admin";
  const { cart } = useCartStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    // Menü açıkken scroll'u engelle
    document.body.style.overflow = !isMenuOpen ? 'hidden' : 'unset';
  };

  return (
    <header className="fixed top-0 left-0 w-full bg-gray-900/90 backdrop-blur-lg shadow-[0_2px_15px_-3px_rgba(0,0,0,0.3)] z-40 transition-all duration-300">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img
              src="/logo.png"
              alt="Benim Marketim Logo"
              className="w-12 h-12 object-contain transition-transform duration-300 hover:scale-105"
            />
          </Link>

          {/* Arama Çubuğu - Mobilde gizli, tablet ve üstünde görünür */}
          <div className="hidden md:block flex-grow max-w-xl">
            <SearchBar />
          </div>

          {/* Mobil Menü Butonu */}
          <button
            onClick={toggleMenu}
            className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4">
            {user && (
              <Link
                to="/cart"
                className="relative group text-gray-300 hover:text-emerald-400 transition-all duration-300 flex items-center gap-2"
              >
                <ShoppingCart size={20} />
                <span>Sepetim</span>
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    {cart.length}
                  </span>
                )}
              </Link>
            )}
            {user && !isAdmin && (
              <Link
                to="/siparislerim"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
              >
                <Package size={18} />
                <span>Siparişlerim</span>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/secret-dashboard"
                className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
              >
                <Lock size={18} />
                <span>İstatistikler</span>
              </Link>
            )}
            {user ? (
              <button
                onClick={logout}
                className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
              >
                <LogOut size={18} />
                <span>Çıkış</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/signup"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
                >
                  <UserPlus size={18} />
                  <span>Kayıt Ol</span>
                </Link>
                <Link
                  to="/login"
                  className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
                >
                  <LogIn size={18} />
                  <span>Giriş</span>
                </Link>
              </div>
            )}
          </nav>
        </div>

        {/* Mobil Arama Çubuğu - Her zaman görünür */}
        <div className="mt-2 md:hidden">
          <SearchBar />
        </div>

        {/* Mobil Menü */}
        <div
          className={`fixed inset-0 bg-gray-900/95 backdrop-blur-md z-50 transition-transform duration-300 md:hidden ${
            isMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex flex-col h-full pt-20 px-6">
            <div className="flex flex-col gap-4">
              {user && (
                <Link
                  to="/cart"
                  onClick={toggleMenu}
                  className="relative flex items-center justify-between bg-gray-800/50 hover:bg-gray-800 p-4 rounded-xl transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingCart size={20} className="text-emerald-400" />
                    <span className="text-white font-medium">Sepetim</span>
                  </div>
                  {cart.length > 0 && (
                    <span className="bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                      {cart.length}
                    </span>
                  )}
                </Link>
              )}
              {user && !isAdmin && (
                <Link
                  to="/siparislerim"
                  onClick={toggleMenu}
                  className="flex items-center gap-3 bg-blue-600/80 hover:bg-blue-600 p-4 rounded-xl transition-all duration-300"
                >
                  <Package size={20} className="text-white" />
                  <span className="text-white font-medium">Siparişlerim</span>
                </Link>
              )}
              {isAdmin && (
                <Link
                  to="/secret-dashboard"
                  onClick={toggleMenu}
                  className="flex items-center gap-3 bg-emerald-700/80 hover:bg-emerald-700 p-4 rounded-xl transition-all duration-300"
                >
                  <Lock size={20} className="text-white" />
                  <span className="text-white font-medium">İstatistikler</span>
                </Link>
              )}
              {user ? (
                <button
                  onClick={() => {
                    logout();
                    toggleMenu();
                  }}
                  className="flex items-center gap-3 bg-gray-800/50 hover:bg-gray-800 p-4 rounded-xl transition-all duration-300"
                >
                  <LogOut size={20} className="text-red-400" />
                  <span className="text-white font-medium">Çıkış</span>
                </button>
              ) : (
                <>
                  <Link
                    to="/signup"
                    onClick={toggleMenu}
                    className="flex items-center gap-3 bg-emerald-600/80 hover:bg-emerald-600 p-4 rounded-xl transition-all duration-300"
                  >
                    <UserPlus size={20} className="text-white" />
                    <span className="text-white font-medium">Kayıt Ol</span>
                  </Link>
                  <Link
                    to="/login"
                    onClick={toggleMenu}
                    className="flex items-center gap-3 bg-gray-800/50 hover:bg-gray-800 p-4 rounded-xl transition-all duration-300"
                  >
                    <LogIn size={20} className="text-white" />
                    <span className="text-white font-medium">Giriş</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;