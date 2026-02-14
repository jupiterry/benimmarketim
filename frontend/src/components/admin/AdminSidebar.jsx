import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, BarChart, Package2, ShoppingBasket, Users,
  MessageCircle, Tag, Gift, Image, Calendar, FileText, Upload,
  Settings, PlusCircle, ChevronRight, ChevronLeft, X,
  Menu, ChevronsLeft, LogOut
} from "lucide-react";

const AdminSidebar = ({
  activeTab,
  onTabChange,
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
  user,
  orderCount = 0,
  chatCount = 0
}) => {
  const menuGroups = [
    {
      title: "GENEL BAKIŞ",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "analytics", label: "Gelişmiş Analiz", icon: BarChart },
      ]
    },
    {
      title: "SATIŞ YÖNETİMİ",
      items: [
        { id: "orders", label: "Siparişler", icon: Package2, badge: orderCount },
        { id: "products", label: "Ürünler", icon: ShoppingBasket },
        { id: "create", label: "Ürün Ekle", icon: PlusCircle },
        { id: "weekly-products", label: "Haftalık Ürünler", icon: Calendar },
      ]
    },
    {
      title: "MÜŞTERİ İLİŞKİLERİ",
      items: [
        { id: "users", label: "Kullanıcılar", icon: Users },
        { id: "chat", label: "Canlı Sohbet", icon: MessageCircle, badge: chatCount },
        { id: "feedback", label: "Geri Bildirimler", icon: MessageCircle },
      ]
    },
    {
      title: "PAZARLAMA",
      items: [
        { id: "coupons", label: "Kuponlar", icon: Tag },
        { id: "referrals", label: "Referral", icon: Gift },
        { id: "banners", label: "Banner'lar", icon: Image },
      ]
    },
    {
      title: "SİSTEM",
      items: [
        { id: "photocopy", label: "Fotokopi", icon: FileText },
        { id: "bulk-upload", label: "Toplu Yükleme", icon: Upload },
        { id: "settings", label: "Ayarlar", icon: Settings },
      ]
    }
  ];

  const handleItemClick = (id) => {
    onTabChange(id);
    if (mobileOpen) onMobileClose();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <div className={`flex items-center gap-3 px-5 pt-6 pb-5 ${collapsed ? 'px-3 justify-center' : ''}`}>
        {/* Logo */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/20"
        >
          <span className="text-white font-black text-sm">BM</span>
        </motion.div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <h1 className="text-[15px] font-bold text-white tracking-tight truncate">Benim Marketim</h1>
              <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Yönetici Paneli
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop collapse */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onCollapse}
          className="hidden lg:flex w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] items-center justify-center text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
        </motion.button>

        {/* Mobile close */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onMobileClose}
          className="lg:hidden w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {/* ─── Navigation ─── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 space-y-6 scrollbar-thin scrollbar-thumb-white/5">
        {menuGroups.map((group) => (
          <div key={group.title}>
            {/* Group Title */}
            <AnimatePresence>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-bold text-gray-600 tracking-[0.12em] mb-2 px-3"
                >
                  {group.title}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Collapsed: thin separator line */}
            {collapsed && (
              <div className="mx-auto w-6 border-t border-white/[0.06] mb-2" />
            )}

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <motion.button
                    key={item.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleItemClick(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`
                      relative w-full flex items-center gap-3 rounded-xl transition-all duration-200
                      ${collapsed ? 'justify-center px-0 py-2.5 mx-auto' : 'px-3 py-2'}
                      ${isActive
                        ? 'bg-violet-500/[0.1] text-white'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                      }
                    `}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 stroke-[1.5] ${isActive ? 'text-violet-400' : ''
                      }`} />

                    <AnimatePresence>
                      {!collapsed && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex-1 flex items-center justify-between min-w-0"
                        >
                          <span className={`text-[13px] truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                            {item.label}
                          </span>

                          {item.badge > 0 && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="min-w-[20px] h-5 px-1.5 bg-violet-500 text-white text-[10px] font-bold rounded-md flex items-center justify-center"
                            >
                              {item.badge > 99 ? '99+' : item.badge}
                            </motion.span>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Collapsed badge */}
                    <AnimatePresence>
                      {collapsed && item.badge > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-violet-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                        >
                          {item.badge > 9 ? '9+' : item.badge}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ─── User Profile Footer ─── */}
      <div className={`border-t border-white/[0.06] px-3 py-3 ${collapsed ? 'px-2' : ''}`}>
        <motion.div
          whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
          className={`flex items-center gap-3 rounded-xl p-2 transition-colors cursor-default ${collapsed ? 'justify-center' : ''}`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-md shadow-violet-500/10">
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="flex-1 min-w-0 overflow-hidden"
              >
                <p className="text-[13px] text-white font-medium truncate leading-tight">
                  {user?.name || 'Admin'}
                </p>
                <p className="text-[11px] text-gray-600 truncate leading-tight">
                  {user?.email || 'admin@example.com'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );

  return (
    <>
      {/* ─── Desktop Sidebar ─── */}
      <motion.aside
        initial={false}
        animate={{
          width: collapsed ? 72 : 260,
          transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }
        }}
        className="hidden lg:flex flex-col fixed top-0 left-0 bottom-0 z-40 bg-[#0a0a1a] border-r border-white/[0.06]"
      >
        {sidebarContent}
      </motion.aside>

      {/* ─── Mobile Overlay ─── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[55] lg:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-[260px] z-[56] lg:hidden flex flex-col bg-[#0a0a1a] border-r border-white/[0.06] shadow-2xl shadow-black/50"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ─── Mobile Bottom Tab Bar ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#0a0a1a]/95 backdrop-blur-xl border-t border-white/[0.06]">
        <div className="flex items-center justify-around px-2 py-1.5 max-w-md mx-auto">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Ana Sayfa' },
            { id: 'orders', icon: Package2, label: 'Siparişler', badge: orderCount },
          ].map(item => (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleItemClick(item.id)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${activeTab === item.id ? 'text-violet-400' : 'text-gray-600'
                }`}
            >
              <item.icon className="w-5 h-5 stroke-[1.5]" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.badge > 0 && (
                <span className="absolute -top-0.5 right-0 w-4 h-4 bg-violet-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </motion.button>
          ))}

          {/* Center FAB */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (mobileOpen) onMobileClose();
              else document.dispatchEvent(new CustomEvent('toggleMobileMenu'));
            }}
            className="w-12 h-12 -mt-5 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/30"
          >
            <Menu className="w-5 h-5" />
          </motion.button>

          {[
            { id: 'products', icon: ShoppingBasket, label: 'Ürünler' },
            { id: 'users', icon: Users, label: 'Kullanıcılar' },
          ].map(item => (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleItemClick(item.id)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${activeTab === item.id ? 'text-violet-400' : 'text-gray-600'
                }`}
            >
              <item.icon className="w-5 h-5 stroke-[1.5]" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </>
  );
};

export default AdminSidebar;
