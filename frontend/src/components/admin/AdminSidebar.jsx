import { motion } from "framer-motion";
import { 
  LayoutDashboard, BarChart, Package2, ShoppingBasket, Users, 
  MessageCircle, Tag, Gift, Image, Calendar, FileText, Upload, 
  Settings, PlusCircle, Zap, ChevronRight, ChevronLeft, X,
  Menu, LogOut
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
      title: "Genel Bakış",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "analytics", label: "Gelişmiş Analiz", icon: BarChart },
      ]
    },
    {
      title: "Satış",
      items: [
        { id: "orders", label: "Siparişler", icon: Package2, badge: orderCount },
        { id: "products", label: "Ürünler", icon: ShoppingBasket },
        { id: "create", label: "Ürün Ekle", icon: PlusCircle },
        { id: "weekly-products", label: "Haftalık Ürünler", icon: Calendar },
      ]
    },
    {
      title: "Müşteriler",
      items: [
        { id: "users", label: "Kullanıcılar", icon: Users },
        { id: "chat", label: "Canlı Sohbet", icon: MessageCircle, badge: chatCount },
        { id: "feedback", label: "Geri Bildirimler", icon: MessageCircle },
      ]
    },
    {
      title: "Pazarlama",
      items: [
        { id: "coupons", label: "Kuponlar", icon: Tag },
        { id: "referrals", label: "Referral", icon: Gift },
        { id: "banners", label: "Banner'lar", icon: Image },
      ]
    },
    {
      title: "Sistem",
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
    <>
      {/* Logo Section */}
      <div className="admin-sidebar-header">
        <div className="admin-sidebar-logo">
          <Zap className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 min-w-0"
          >
            <h1 className="text-white font-bold text-lg truncate">Benim Marketim</h1>
            <p className="text-gray-500 text-xs">Yönetici Paneli</p>
          </motion.div>
        )}
        
        {/* Desktop Collapse Button */}
        <button
          onClick={onCollapse}
          className="hidden lg:flex p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        
        {/* Mobile Close Button */}
        <button
          onClick={onMobileClose}
          className="lg:hidden p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="admin-sidebar-content admin-scrollbar">
        {menuGroups.map((group, groupIdx) => (
          <div key={group.title} className="admin-sidebar-group">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: groupIdx * 0.05 }}
                className="admin-sidebar-group-title"
              >
                {group.title}
              </motion.div>
            )}
            
            {group.items.map((item, itemIdx) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (groupIdx * group.items.length + itemIdx) * 0.02 }}
                  whileHover={{ x: collapsed ? 0 : 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleItemClick(item.id)}
                  className={`admin-sidebar-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="admin-sidebar-item-icon" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {item.badge > 0 && (
                        <span className="admin-sidebar-item-badge">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-4 h-4 opacity-50" />}
                    </>
                  )}
                  {collapsed && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Section */}
      <div className="admin-sidebar-footer">
        <div className={`admin-sidebar-user ${collapsed ? 'justify-center' : ''}`}>
          <div className="admin-sidebar-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name || 'Admin'}</p>
              <p className="text-gray-500 text-xs truncate">{user?.email || 'admin@example.com'}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 80 : 280 }}
        className={`admin-sidebar hidden lg:flex`}
      >
        {sidebarContent}
      </motion.aside>

      {/* Mobile Overlay */}
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
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="admin-sidebar lg:hidden"
              style={{ transform: 'none' }}
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0d1321]/95 backdrop-blur-xl border-t border-white/10 z-50 lg:hidden safe-area-bottom">
        <div className="flex items-center justify-around py-2 px-2">
          <button
            onClick={() => handleItemClick('dashboard')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeTab === 'dashboard' ? 'text-emerald-400' : 'text-gray-500'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px]">Ana</span>
          </button>
          <button
            onClick={() => handleItemClick('orders')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors relative ${
              activeTab === 'orders' ? 'text-emerald-400' : 'text-gray-500'
            }`}
          >
            <Package2 className="w-5 h-5" />
            <span className="text-[10px]">Siparişler</span>
            {orderCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {orderCount > 9 ? '9+' : orderCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onMobileClose() || document.querySelector('.admin-sidebar')?.classList.toggle('open')}
            className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white -mt-4 shadow-lg shadow-emerald-500/30"
          >
            <Menu className="w-6 h-6" />
          </button>
          <button
            onClick={() => handleItemClick('products')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeTab === 'products' ? 'text-emerald-400' : 'text-gray-500'
            }`}
          >
            <ShoppingBasket className="w-5 h-5" />
            <span className="text-[10px]">Ürünler</span>
          </button>
          <button
            onClick={() => handleItemClick('users')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeTab === 'users' ? 'text-emerald-400' : 'text-gray-500'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px]">Kullanıcı</span>
          </button>
        </div>
      </div>
    </>
  );
};

// AnimatePresence import için
import { AnimatePresence } from "framer-motion";

export default AdminSidebar;
