import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Bell, Menu, ChevronRight, RefreshCw, 
  Command, Settings, LogOut, User, X,
  Clock, Wifi, Sparkles, Moon, Sun
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

  // Dropdown animation variants
  const dropdownVariants = {
    hidden: { 
      opacity: 0, 
      y: 10, 
      scale: 0.95,
      filter: "blur(4px)"
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 30
      }
    },
    exit: { 
      opacity: 0, 
      y: 10, 
      scale: 0.95,
      filter: "blur(4px)",
      transition: { duration: 0.15 }
    }
  };

  return (
    <header className="admin-header">
      {/* Mobile Menu Button */}
      <motion.button
        whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" }}
        whileTap={{ scale: 0.95 }}
        onClick={onMenuClick}
        className="lg:hidden admin-header-action-btn"
      >
        <Menu className="w-5 h-5" />
      </motion.button>

      {/* Breadcrumb & Title */}
      <div className="flex-1 min-w-0">
        <div className="admin-header-breadcrumb hidden sm:flex">
          <motion.span 
            className="admin-header-breadcrumb-item flex items-center gap-1.5"
            whileHover={{ color: "#00f5ff" }}
          >
            <Sparkles className="w-3 h-3 text-[#00f5ff]" />
            Admin
          </motion.span>
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
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-lg sm:text-xl font-bold text-white mt-0.5"
        >
          {pageTitle}
        </motion.h1>
      </div>

      {/* Search Button (Desktop) - Spotlight Style */}
      <div className="admin-header-search hidden md:block">
        <motion.button 
          onClick={onSearchClick}
          className="w-full flex items-center relative group"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <Search className="admin-header-search-icon w-4 h-4 transition-colors group-hover:text-[#00f5ff]" />
          <input
            type="text"
            readOnly
            placeholder="Komut ara veya yaz..."
            className="admin-header-search-input cursor-pointer"
            onClick={onSearchClick}
          />
          <span className="admin-header-search-shortcut">
            <Command className="w-3 h-3" />
            <span>K</span>
          </span>
        </motion.button>
      </div>

      {/* Actions */}
      <div className="admin-header-actions">
        {/* Refresh */}
        <motion.button
          whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
          whileTap={{ scale: 0.9 }}
          onClick={onRefresh}
          disabled={refreshing}
          className="admin-header-action-btn hidden sm:flex"
          title="Yenile"
        >
          <motion.div
            animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
            transition={refreshing ? { duration: 1, repeat: Infinity, ease: "linear" } : {}}
          >
            <RefreshCw className="w-4 h-4" />
          </motion.div>
        </motion.button>

        {/* Mobile Search */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onSearchClick}
          className="admin-header-action-btn md:hidden"
        >
          <Search className="w-4 h-4" />
        </motion.button>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <motion.button
            whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowNotifications(!showNotifications)}
            className="admin-header-action-btn"
          >
            <Bell className="w-4 h-4" />
            {notifications.length > 0 && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="badge"
              >
                {notifications.length > 9 ? '9+' : notifications.length}
              </motion.span>
            )}
          </motion.button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute right-0 top-full mt-3 w-80 bg-[#0a0a1a]/95 backdrop-blur-xl border border-[rgba(0,245,255,0.1)] rounded-2xl shadow-2xl overflow-hidden z-50"
                style={{ boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 245, 255, 0.1)' }}
              >
                {/* Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-[rgba(0,245,255,0.05)] to-transparent">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, 15, -15, 0] }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    >
                      <Bell className="w-4 h-4 text-[#00f5ff]" />
                    </motion.div>
                    Bildirimler
                  </h3>
                  <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                    {notifications.length} yeni
                  </span>
                </div>
                
                {/* Content */}
                <div className="max-h-80 overflow-y-auto admin-scrollbar">
                  {notifications.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="py-12 text-center"
                    >
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Bell className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                      </motion.div>
                      <p className="text-gray-500 text-sm">Henüz bildirim yok</p>
                      <p className="text-gray-600 text-xs mt-1">Yeni bildirimler burada görünecek</p>
                    </motion.div>
                  ) : (
                    notifications.map((n, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{ backgroundColor: "rgba(0, 245, 255, 0.05)" }}
                        className="p-4 border-b border-white/5 cursor-pointer transition-colors"
                      >
                        <p className="text-white text-sm">{n.message}</p>
                        <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {n.time}
                        </p>
                      </motion.div>
                    ))
                  )}
                </div>
                
                {/* Footer */}
                <div className="p-3 border-t border-white/5 bg-gradient-to-r from-transparent to-[rgba(0,245,255,0.03)]">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-2 text-sm text-[#00f5ff] hover:text-white transition-colors rounded-lg hover:bg-[rgba(0,245,255,0.1)]"
                  >
                    Tümünü Gör
                  </motion.button>
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
            className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center text-white font-bold shadow-lg relative overflow-hidden"
            style={{ 
              background: 'linear-gradient(135deg, #bf00ff, #ff2d92)',
              boxShadow: '0 4px 16px rgba(191, 0, 255, 0.4)'
            }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            {/* Online indicator */}
            <span 
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a1a]"
              style={{ 
                background: '#00ff9d',
                boxShadow: '0 0 8px #00ff9d'
              }}
            />
          </motion.button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute right-0 top-full mt-3 w-64 bg-[#0a0a1a]/95 backdrop-blur-xl border border-[rgba(0,245,255,0.1)] rounded-2xl shadow-2xl overflow-hidden z-50"
                style={{ boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(191, 0, 255, 0.1)' }}
              >
                {/* User Info */}
                <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-gradient-to-r from-[rgba(191,0,255,0.05)] to-transparent">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                    style={{ 
                      background: 'linear-gradient(135deg, #bf00ff, #ff2d92)',
                      boxShadow: '0 4px 12px rgba(191, 0, 255, 0.3)'
                    }}
                  >
                    {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{user?.name || 'Admin'}</p>
                    <p className="text-gray-500 text-xs truncate">{user?.email || 'admin@example.com'}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span 
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: '#00ff9d', boxShadow: '0 0 6px #00ff9d' }}
                      />
                      <span className="text-[10px] text-gray-500">Çevrimiçi</span>
                    </div>
                  </div>
                </div>
                
                {/* Menu Items */}
                <div className="p-2">
                  {[
                    { icon: User, label: 'Profil', color: '#00f5ff' },
                    { icon: Settings, label: 'Ayarlar', color: '#bf00ff' },
                  ].map((item, idx) => (
                    <motion.button 
                      key={item.label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.05)" }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white rounded-xl transition-colors"
                    >
                      <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      <span className="text-sm">{item.label}</span>
                    </motion.button>
                  ))}
                </div>
                
                {/* Logout */}
                <div className="p-2 border-t border-white/5">
                  <motion.button 
                    whileHover={{ x: 4, backgroundColor: "rgba(255, 45, 146, 0.1)" }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-[#ff2d92] hover:text-[#ff6b9d] rounded-xl transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">Çıkış Yap</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

// Status Bar Component - Premium Design
export const AdminStatusBar = ({ collapsed, serverStatus = 'online', lastSync }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`admin-status-bar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="flex items-center gap-6">
        {/* Status */}
        <div className="admin-status-bar-item">
          <span className={`admin-status-bar-dot ${serverStatus}`} />
          <span>{serverStatus === 'online' ? 'Sunucu Bağlı' : 'Bağlantı Kesildi'}</span>
        </div>
        
        {/* Last Sync */}
        {lastSync && (
          <div className="admin-status-bar-item">
            <RefreshCw className="w-3 h-3" />
            <span>Son güncelleme: {lastSync}</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-6">
        {/* Time */}
        <div className="admin-status-bar-item">
          <Clock className="w-3 h-3" />
          <span className="tabular-nums">
            {currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        
        {/* Copyright */}
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#00f5ff]" />
          © 2024 Benim Marketim
        </span>
      </div>
    </div>
  );
};

export default AdminHeader;
