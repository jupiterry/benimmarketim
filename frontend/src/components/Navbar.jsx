import { ShoppingCart, UserPlus, LogIn, LogOut, Lock, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";
import SearchBar from "./SearchBar"; // Arama çubuğunu içe aktarın

const Navbar = () => {
  const { user, logout } = useUserStore();
  const isAdmin = user?.role === "admin";
  const { cart } = useCartStore();

  return (
    <header className="fixed top-0 left-0 w-full bg-gray-900 bg-opacity-90 backdrop-blur-md shadow-lg z-40 transition-all duration-300 border-b border-emerald-800">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Logo / Marka Adı - PNG olarak */}
          <Link to="/" className="flex items-center space-x-2">
            <img
              src="/logo.png" // Logo dosyasının yolunu buraya yazın (public klasöründeyse bu, /logo.png olmalı)
              alt="Benim Marketim Logo"
              className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 object-contain transition-transform duration-300 hover:scale-105" // Responsive boyutlar ve hover efekti
            />
          </Link>

          {/* Arama Çubuğu - Mobilde daha küçük ve hizalı */}
          <div className="flex-grow mx-4 max-w-lg md:max-w-md sm:max-w-full">
            <SearchBar />
          </div>

          {/* Navigasyon Menüsü - Mobilde hamburger menü */}
          <nav className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            {/* Ana Sayfa Linki - Mobilde her zaman görünür */}
            <Link
              to="/"
              className="text-gray-300 hover:text-emerald-400 transition duration-300 ease-in-out text-center md:text-left"
            >
              Ana Sayfa
            </Link>

            {/* Kullanıcıya Özel Linkler - Mobilde gizlenebilir */}
            <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
              {user && (
                <Link
                  to="/cart"
                  className="relative group text-gray-300 hover:text-emerald-400 transition duration-300 ease-in-out flex items-center justify-center md:justify-start"
                >
                  <ShoppingCart className="inline-block mr-1 group-hover:text-emerald-400" size={20} />
                  <span className="hidden sm:inline">Sepetim</span>
                  {cart.length > 0 && (
                    <span className="absolute -top-2 -left-2 bg-emerald-500 text-white rounded-full px-2 py-0.5 text-xs group-hover:bg-emerald-400 transition duration-300 ease-in-out">
                      {cart.length}
                    </span>
                  )}
                </Link>
              )}
              {user && !isAdmin && (
                <Link
                  to="/siparislerim"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-md font-medium transition duration-300 ease-in-out flex items-center justify-center md:justify-start"
                >
                  <Package className="inline-block mr-1" size={18} />
                  <span className="hidden sm:inline">Siparişlerim</span>
                </Link>
              )}
              {isAdmin && (
                <Link
                  className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded-md font-medium transition duration-300 ease-in-out flex items-center justify-center md:justify-start"
                  to="/secret-dashboard"
                >
                  <Lock className="inline-block mr-1" size={18} />
                  <span className="hidden sm:inline">İstatistikler</span>
                </Link>
              )}
              {user ? (
                <button
                  className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-md flex items-center justify-center md:justify-start transition duration-300 ease-in-out w-full md:w-auto"
                  onClick={logout}
                >
                  <LogOut size={18} />
                  <span className="hidden sm:inline ml-2">Çıkış</span>
                </button>
              ) : (
                <>
                  <Link
                    to="/signup"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-4 rounded-md flex items-center justify-center md:justify-start transition duration-300 ease-in-out w-full md:w-auto"
                  >
                    <UserPlus className="mr-2" size={18} />
                    Kayıt Ol
                  </Link>
                  <Link
                    to="/login"
                    className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-md flex items-center justify-center md:justify-start transition duration-300 ease-in-out w-full md:w-auto"
                  >
                    <LogIn className="mr-2" size={18} />
                    Giriş
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Navbar;