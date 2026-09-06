import { AnimatePresence, motion } from "framer-motion";
import { Home, LogIn, LogOut, Menu, ShoppingBag, User, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useUserStore } from "../stores/useUserStore";

const navClass = ({ isActive }) =>
  `inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
    isActive ? "bg-emerald-500/15 text-emerald-300" : "text-gray-300 hover:bg-white/5 hover:text-white"
  }`;

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useUserStore();

  const closeMenu = () => setIsOpen(false);

  const handleLogout = async () => {
    await logout();
    closeMenu();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link to="/" onClick={closeMenu} className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/20">
            <ShoppingBag className="h-5 w-5 text-white" />
          </span>
          <span>
            <span className="block text-base font-bold leading-none text-white">Benim Marketim</span>
            <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400">Mobilde alışveriş</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/" className={navClass}>
            <Home className="h-4 w-4" /> Ana Sayfa
          </NavLink>

          {user ? (
            <>
              <NavLink to="/profile" className={navClass}>
                <User className="h-4 w-4" /> Hesabım
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" /> Çıkış Yap
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navClass}>
                <LogIn className="h-4 w-4" /> Giriş Yap
              </NavLink>
              <Link
                to="/signup"
                className="ml-2 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                <UserPlus className="h-4 w-4" /> Kayıt Ol
              </Link>
            </>
          )}
        </nav>

        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-gray-200 md:hidden"
          aria-label="Menüyü aç veya kapat"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-white/10 bg-gray-950/95 md:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-4">
              <NavLink to="/" onClick={closeMenu} className={navClass}>
                <Home className="h-4 w-4" /> Ana Sayfa
              </NavLink>
              {user ? (
                <>
                  <NavLink to="/profile" onClick={closeMenu} className={navClass}>
                    <User className="h-4 w-4" /> Hesabım / Profil
                  </NavLink>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10"
                  >
                    <LogOut className="h-4 w-4" /> Çıkış Yap
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" onClick={closeMenu} className={navClass}>
                    <LogIn className="h-4 w-4" /> Giriş Yap
                  </NavLink>
                  <NavLink to="/signup" onClick={closeMenu} className={navClass}>
                    <UserPlus className="h-4 w-4" /> Kayıt Ol
                  </NavLink>
                </>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
