import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, BarChart, Package2, ShoppingBasket, Users, 
  MessageCircle, Tag, Gift, Image, Calendar, FileText, Upload, 
  Settings, PlusCircle, Zap, ChevronRight, ChevronLeft, X,
  Menu, Sparkles
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
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, color: "cyan" },
        { id: "analytics", label: "Gelişmiş Analiz", icon: BarChart, color: "purple" },
      ]
    },
    {
      title: "Satış Yönetimi",
      items: [
        { id: "orders", label: "Siparişler", icon: Package2, badge: orderCount, color: "green" },
        { id: "products", label: "Ürünler", icon: ShoppingBasket, color: "cyan" },
        { id: "create", label: "Ürün Ekle", icon: PlusCircle, color: "purple" },
        { id: "weekly-products", label: "Haftalık Ürünler", icon: Calendar, color: "pink" },
      ]
    },
    {
      title: "Müşteri İlişkileri",
      items: [
        { id: "users", label: "Kullanıcılar", icon: Users, color: "cyan" },
        { id: "chat", label: "Canlı Sohbet", icon: MessageCircle, badge: chatCount, color: "green" },
        { id: "feedback", label: "Geri Bildirimler", icon: MessageCircle, color: "purple" },
      ]
    },
    {
      title: "Pazarlama",
      items: [
        { id: "coupons", label: "Kuponlar", icon: Tag, color: "pink" },
        { id: "referrals", label: "Referral", icon: Gift, color: "purple" },
        { id: "banners", label: "Banner'lar", icon: Image, color: "cyan" },
      ]
    },
    {
      title: "Sistem",
      items: [
        { id: "photocopy", label: "Fotokopi", icon: FileText, color: "green" },
        { id: "bulk-upload", label: "Toplu Yükleme", icon: Upload, color: "purple" },
        { id: "settings", label: "Ayarlar", icon: Settings, color: "cyan" },
      ]
    }
  ];

  const handleItemClick = (id) => {
    onTabChange(id);
    if (mobileOpen) onMobileClose();
  };

  // Animation variants
  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.03,
        duration: 0.3,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    })
  };

  const sidebarContent = (
    <>
      {/* Logo Section */}
      <div className="admin-sidebar-header">
        <motion.div 
          className="admin-sidebar-logo"
          whileHover={{ scale: 1.05, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <Sparkles className="w-6 h-6 text-white" />
        </motion.div>
        
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 min-w-0"
            >
              <h1 className="text-white font-bold text-lg truncate admin-gradient-text">
                Benim Marketim
              </h1>
              <p className="text-gray-500 text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse" />
                Yönetici Paneli
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Desktop Collapse Button */}
        <motion.button
          whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
          whileTap={{ scale: 0.9 }}
          onClick={onCollapse}
          className="hidden lg:flex p-2 rounded-xl text-gray-400 hover:text-white transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </motion.button>
        
        {/* Mobile Close Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onMobileClose}
          className="lg:hidden p-2 rounded-xl bg-[#ff2d92]/10 hover:bg-[#ff2d92]/20 text-[#ff2d92] transition-colors"
        >
          <X className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Navigation */}
      <nav className="admin-sidebar-content">
        {menuGroups.map((group, groupIdx) => (
          <div key={group.title} className="admin-sidebar-group">
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ delay: groupIdx * 0.05 }}
                  className="admin-sidebar-group-title"
                >
                  {group.title}
                </motion.div>
              )}
            </AnimatePresence>
            
            {group.items.map((item, itemIdx) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const globalIdx = groupIdx * 10 + itemIdx;
              
              return (
                <motion.button
                  key={item.id}
                  custom={globalIdx}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ 
                    x: collapsed ? 0 : 6,
                    transition: { duration: 0.2 }
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleItemClick(item.id)}
                  className={`admin-sidebar-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <motion.div
                    animate={isActive ? { 
                      scale: [1, 1.2, 1],
                      transition: { duration: 0.3 }
                    } : {}}
                  >
                    <Icon className="admin-sidebar-item-icon" />
                  </motion.div>
                  
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex items-center justify-between min-w-0"
                      >
                        <span className="truncate text-left">{item.label}</span>
                        <div className="flex items-center gap-2">
                          {item.badge > 0 && (
                            <motion.span 
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="admin-sidebar-item-badge"
                            >
                              {item.badge > 99 ? '99+' : item.badge}
                            </motion.span>
                          )}
                          {isActive && (
                            <motion.div
                              initial={{ opacity: 0, x: -5 }}
                              animate={{ opacity: 0.5, x: 0 }}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* Badge for collapsed state */}
                  <AnimatePresence>
                    {collapsed && item.badge > 0 && (
                      <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-[#ff2d92] to-[#ff6b2c] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg"
                        style={{ boxShadow: '0 0 10px rgba(255, 45, 146, 0.5)' }}
                      >
                        {item.badge > 9 ? '9+' : item.badge}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Section */}
      <div className="admin-sidebar-footer">
        <motion.div 
          className={`admin-sidebar-user ${collapsed ? 'justify-center' : ''}`}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="admin-sidebar-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 min-w-0"
              >
                <p className="text-white text-sm font-medium truncate">
                  {user?.name || 'Admin'}
                </p>
                <p className="text-gray-500 text-xs truncate">
                  {user?.email || 'admin@example.com'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: collapsed ? 80 : 280,
          transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
        }}
        className="admin-sidebar hidden lg:flex"
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
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[55] lg:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ 
                type: 'spring', 
                damping: 30, 
                stiffness: 300,
                opacity: { duration: 0.2 }
              }}
              className="admin-sidebar lg:hidden"
              style={{ transform: 'none', boxShadow: '20px 0 60px rgba(0, 0, 0, 0.5)' }}
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Tab Bar */}
      <div className="admin-mobile-nav lg:hidden">
        <div className="admin-mobile-nav-items">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleItemClick('dashboard')}
            className={`admin-mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Ana Sayfa</span>
          </motion.button>
          
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleItemClick('orders')}
            className={`admin-mobile-nav-item ${activeTab === 'orders' ? 'active' : ''}`}
          >
            <Package2 className="w-5 h-5" />
            <span>Siparişler</span>
            {orderCount > 0 && (
              <span 
                className="absolute -top-1 right-0 w-4 h-4 text-[10px] font-bold rounded-full flex items-center justify-center"
                style={{ 
                  background: 'linear-gradient(135deg, #ff2d92, #ff6b2c)',
                  boxShadow: '0 0 10px rgba(255, 45, 146, 0.5)'
                }}
              >
                {orderCount > 9 ? '9+' : orderCount}
              </span>
            )}
          </motion.button>
          
          {/* Center FAB */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              // Toggle mobile menu
              if (mobileOpen) {
                onMobileClose();
              } else {
                // Trigger mobile menu open - we need to pass this up
                document.dispatchEvent(new CustomEvent('toggleMobileMenu'));
              }
            }}
            className="admin-mobile-nav-fab"
          >
            <Menu className="w-6 h-6" />
          </motion.button>
          
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleItemClick('products')}
            className={`admin-mobile-nav-item ${activeTab === 'products' ? 'active' : ''}`}
          >
            <ShoppingBasket className="w-5 h-5" />
            <span>Ürünler</span>
          </motion.button>
          
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleItemClick('users')}
            className={`admin-mobile-nav-item ${activeTab === 'users' ? 'active' : ''}`}
          >
            <Users className="w-5 h-5" />
            <span>Kullanıcılar</span>
          </motion.button>
        </div>
      </div>
    </>
  );
};

export default AdminSidebar;
