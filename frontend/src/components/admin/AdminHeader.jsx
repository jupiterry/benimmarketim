import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Bell, Menu, ChevronRight, RefreshCw, 
  Command, Moon, Sun, Settings, LogOut, User,
  Clock, Wifi, WifiOff
} from "lucide-react";

const AdminHeader = ({ 
  pageTitle, 
  breadcrumbs = [],
  onMenuClick,
  onSearchClick,
  onRefresh,
  refreshing = false,
  notifications = [],
  user,
  collapsed
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const notificationRef = useRef(null);
  const userMenuRef = useRef(null);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="admin-header">
      {/* Mobile Menu Button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden admin-header-action-btn"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb & Title */}
      <div className="flex-1 min-w-0">
        <div className="admin-header-breadcrumb hidden sm:flex">
          <span className="admin-header-breadcrumb-item">Admin</span>
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-2">
              <ChevronRight className="admin-header-breadcrumb-separator w-3 h-3" />
              <span className={`admin-header-breadcrumb-item ${idx === breadcrumbs.length - 1 ? 'active' : ''}`}>
                {crumb}
              </span>
            </span>
          ))}
        </div>
        <motion.h1 
          key={pageTitle}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg sm:text-xl font-bold text-white mt-0.5"
        >
          {pageTitle}
        </motion.h1>
      </div>

      {/* Search Button (Desktop) */}
      <div className="admin-header-search hidden md:block">
        <button 
          onClick={onSearchClick}
          className="w-full flex items-center"
        >
          <Search className="admin-header-search-icon w-4 h-4" />
          <input
            type="text"
            readOnly
            placeholder="Ara veya komut..."
            className="admin-header-search-input cursor-pointer"
            onClick={onSearchClick}
          />
          <span className="admin-header-search-shortcut">
            <Command className="w-3 h-3" />
            <span>K</span>
          </span>
        </button>
      </div>

      {/* Actions */}
      <div className="admin-header-actions">
        {/* Refresh */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRefresh}
          disabled={refreshing}
          className="admin-header-action-btn hidden sm:flex"
          title="Yenile"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </motion.button>

        {/* Mobile Search */}
        <button
          onClick={onSearchClick}
          className="admin-header-action-btn md:hidden"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifications(!showNotifications)}
            className="admin-header-action-btn"
          >
            <Bell className="w-4 h-4" />
            {notifications.length > 0 && (
              <span className="badge">{notifications.length > 9 ? '9+' : notifications.length}</span>
            )}
          </motion.button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-80 bg-[#0f172a] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50"
              >
                <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    Bildirimler
                  </h3>
                  <span className="text-xs text-gray-500">{notifications.length} yeni</span>
                </div>
                <div className="max-h-80 overflow-y-auto admin-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Henüz bildirim yok</p>
                    </div>
                  ) : (
                    notifications.map((n, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="p-3 hover:bg-white/5 border-b border-gray-800/50 cursor-pointer transition-colors"
                      >
                        <p className="text-white text-sm">{n.message}</p>
                        <p className="text-gray-500 text-xs mt-1">{n.time}</p>
                      </motion.div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-gray-800">
                  <button className="w-full py-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
                    Tümünü Gör
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="hidden sm:flex w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 items-center justify-center text-white font-bold shadow-lg"
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </motion.button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-56 bg-[#0f172a] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50"
              >
                <div className="p-4 border-b border-gray-800">
                  <p className="text-white font-medium">{user?.name || 'Admin'}</p>
                  <p className="text-gray-500 text-sm truncate">{user?.email || 'admin@example.com'}</p>
                </div>
                <div className="p-2">
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                    <User className="w-4 h-4" />
                    <span className="text-sm">Profil</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                    <Settings className="w-4 h-4" />
                    <span className="text-sm">Ayarlar</span>
                  </button>
                </div>
                <div className="p-2 border-t border-gray-800">
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors">
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">Çıkış Yap</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

// Status Bar Component
export const AdminStatusBar = ({ collapsed, serverStatus = 'online', lastSync }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`admin-status-bar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="flex items-center gap-4">
        <div className="admin-status-bar-item">
          <span className={`admin-status-bar-dot ${serverStatus}`} />
          <span>{serverStatus === 'online' ? 'Bağlı' : 'Bağlantı Kesildi'}</span>
        </div>
        {lastSync && (
          <div className="admin-status-bar-item">
            <RefreshCw className="w-3 h-3" />
            <span>Son: {lastSync}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="admin-status-bar-item">
          <Clock className="w-3 h-3" />
          <span>{currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <span>© 2024 Benim Marketim</span>
      </div>
    </div>
  );
};

export default AdminHeader;
