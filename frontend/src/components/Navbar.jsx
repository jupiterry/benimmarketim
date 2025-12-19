import { ShoppingCart, UserPlus, LogIn, LogOut, Lock, Package, Menu, X, Bell, FileText, ChevronDown, User, Settings, Heart, Gift } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";
import SearchBar from "./SearchBar";
import { useState, useEffect, useRef } from "react";
import socketService from "../lib/socket.js";
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// Cart Preview Component
const CartPreview = ({ cart, onClose }) => {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="absolute right-0 top-full mt-2 w-80 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-50"
    >
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            Sepetim ({cart.length})
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="p-8 text-center">
            <ShoppingCart className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Sepetiniz boş</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {cart.slice(0, 4).map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-white/5 rounded-xl">
                <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.name}</p>
                  <p className="text-gray-400 text-xs">{item.quantity} x ₺{item.price?.toFixed(2)}</p>
                </div>
                <p className="text-emerald-400 font-bold text-sm">₺{(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
            {cart.length > 4 && (
              <p className="text-center text-gray-500 text-xs py-2">+{cart.length - 4} ürün daha</p>
            )}
          </div>
        )}
      </div>
      
      {cart.length > 0 && (
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Toplam</span>
            <span className="text-white font-bold text-lg">₺{total.toFixed(2)}</span>
          </div>
          <Link
            to="/cart"
            onClick={onClose}
            className="block w-full text-center py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
          >
            Sepete Git
          </Link>
        </div>
      )}
    </motion.div>
  );
};

// User Menu Component
const UserMenu = ({ user, onLogout, onClose }) => {
  const isAdmin = user?.role === "admin";
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="absolute right-0 top-full mt-2 w-56 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-50"
    >
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{user?.name}</p>
            <p className="text-gray-400 text-xs truncate">{user?.email}</p>
          </div>
        </div>
      </div>
      
      <div className="p-2">
        {!isAdmin && (
          <Link
            to="/fotokopi"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>Fotokopi Talebi</span>
          </Link>
        )}
        {isAdmin && (
          <Link
            to="/secret-dashboard"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
          >
            <Lock className="w-4 h-4" />
            <span>Yönetici Paneli</span>
          </Link>
        )}
      </div>
      
      <div className="p-2 border-t border-white/10">
        <button
          onClick={() => { onLogout(); onClose(); }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </motion.div>
  );
};

// OrderNotification bileşeni
const OrderNotification = () => {
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSoundSettings, setShowSoundSettings] = useState(false);
    const { user } = useUserStore();
    const [selectedSound, setSelectedSound] = useState(() => localStorage.getItem('notificationSound') || 'ringtone');
    const [currentAudio, setCurrentAudio] = useState(null);
    const notificationSounds = {
        ringtone: new Audio('/ringtone.mp3'),
        bell: new Audio('/bell.mp3'),
        chime: new Audio('/chime.mp3'),
        furelise: new Audio('/fur-elise.mp3'),
        gnosienne: new Audio('/gnosienne-no1.mp3'),
        vivaldi: new Audio('/vivaldi-winter.mp3')
    };

    const changeNotificationSound = (soundName) => {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
        setSelectedSound(soundName);
        localStorage.setItem('notificationSound', soundName);
        const newAudio = notificationSounds[soundName];
        setCurrentAudio(newAudio);
        newAudio.play().catch(err => console.log('Ses çalma hatası:', err));
    };

    const playNotificationSound = () => {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
        const audio = notificationSounds[selectedSound];
        setCurrentAudio(audio);
        audio.play().catch(err => console.log('Ses çalma hatası:', err));
    };

    useEffect(() => {
        if (user?.role === 'admin') {
            const socket = socketService.connect();
            socket.removeAllListeners("newOrder");
            
            const handleConnect = () => {
                socket.emit('joinAdminRoom');
            };

            socket.on('connect', handleConnect);
            if (socket.connected) handleConnect();

            socket.on('newOrder', (data) => {
                if (data.order.id === 'test') return;
                playNotificationSound();

                const notification = {
                    message: data.message,
                    order: {
                        id: data.order.id,
                        totalAmount: data.order.totalAmount,
                        status: data.order.status,
                        createdAt: data.order.createdAt,
                        customerName: data.order.customerName,
                        city: data.order.city,
                        phone: data.order.phone
                    }
                };
                setNotifications(prev => [notification, ...prev]);
                
                toast.custom((t) => (
                    <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-gray-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                        <div className="flex-1 w-0 p-4">
                            <div className="flex items-start">
                                <div className="flex-shrink-0 pt-0.5">
                                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                        <Package className="h-6 w-6 text-emerald-500" />
                                    </div>
                                </div>
                                <div className="ml-3 flex-1">
                                    <p className="text-sm font-medium text-white flex items-center justify-between">
                                        <span>Yeni Sipariş!</span>
                                        <span className="text-xs text-gray-400">
                                            {new Date(data.order.createdAt).toLocaleTimeString()}
                                        </span>
                                    </p>
                                    <div className="mt-1 text-sm text-gray-400 space-y-1">
                                        <p className="font-medium text-emerald-400">{data.order.customerName}</p>
                                        <div className="flex items-center justify-between">
                                            <p>{data.order.city}</p>
                                            <p className="font-medium">₺{data.order.totalAmount.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex border-l border-gray-700">
                            <button onClick={() => toast.dismiss(t.id)} className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-emerald-400 hover:text-emerald-500 focus:outline-none">
                                Kapat
                            </button>
                        </div>
                    </div>
                ), { duration: Infinity, position: 'top-right' });
            });

            return () => {
                socket.off('newOrder');
                socket.off('connect', handleConnect);
                socketService.disconnect();
            };
        }
    }, [user]);

    const clearNotifications = () => {
        setNotifications([]);
        setShowNotifications(false);
    };

    if (user?.role !== 'admin') return null;

    return (
        <div className="relative">
            <div className="flex items-center gap-1">
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                    <Bell size={18} />
                    {notifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-bold">
                            {notifications.length > 9 ? '9+' : notifications.length}
                        </span>
                    )}
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowSoundSettings(!showSoundSettings)}
                    className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors"
                    title="Bildirim Sesi"
                >
                    {selectedSound === 'ringtone' ? '🔔' : selectedSound === 'bell' ? '🎵' : selectedSound === 'chime' ? '🎶' : selectedSound === 'furelise' ? '🎹' : selectedSound === 'gnosienne' ? '🎼' : '🎻'}
                </motion.button>
            </div>

            <AnimatePresence>
                {showSoundSettings && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-50"
                    >
                        <div className="p-2 space-y-1">
                            {['ringtone', 'bell', 'chime', 'furelise', 'gnosienne', 'vivaldi'].map((sound) => (
                                <button
                                    key={sound}
                                    onClick={() => changeNotificationSound(sound)}
                                    className={`w-full p-2.5 text-left rounded-xl transition-colors ${selectedSound === sound ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:bg-white/5'}`}
                                >
                                    {sound === 'ringtone' ? '🔔 Varsayılan' : sound === 'bell' ? '🎵 Zil' : sound === 'chime' ? '🎶 iPhone' : sound === 'furelise' ? '🎹 Für Elise' : sound === 'gnosienne' ? '🎼 Gnosienne' : '🎻 Vivaldi'}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showNotifications && notifications.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 mt-2 w-80 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-50"
                    >
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-bold">Bildirimler</h3>
                            <button onClick={clearNotifications} className="text-sm text-gray-400 hover:text-white transition-colors">
                                Temizle
                            </button>
                        </div>
                        <div className="max-h-80 overflow-auto">
                            {notifications.map((notif, index) => (
                                <div key={index} className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors">
                                    <p className="text-white font-medium">{notif.message}</p>
                                    <p className="text-sm text-emerald-400 mt-1">₺{notif.order.totalAmount}</p>
                                    <p className="text-xs text-gray-500 mt-1">{new Date(notif.order.createdAt).toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Navbar = () => {
  const { user, logout } = useUserStore();
  const isAdmin = user?.role === "admin";
  const { cart } = useCartStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showCartPreview, setShowCartPreview] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const cartRef = useRef(null);
  const userRef = useRef(null);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    document.body.style.overflow = !isMenuOpen ? 'hidden' : 'unset';
  };

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (cartRef.current && !cartRef.current.contains(event.target)) {
        setShowCartPreview(false);
      }
      if (userRef.current && !userRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const mobileMenu = document.getElementById('mobile-menu');
      const menuButton = document.getElementById('menu-button');
      
      if (isMenuOpen && mobileMenu && !mobileMenu.contains(event.target) && !menuButton.contains(event.target)) {
        setIsMenuOpen(false);
        document.body.style.overflow = 'unset';
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <header className="fixed top-0 left-0 w-full bg-gray-900/80 backdrop-blur-xl shadow-2xl border-b border-white/10 z-50">
      <div className="container mx-auto py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0 group">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-all duration-300">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-white font-bold text-lg leading-tight">Benim</h1>
                <p className="text-emerald-400 text-xs font-medium -mt-1">Marketim</p>
              </div>
            </div>
          </Link>
          
          {/* Search Bar - Desktop */}
          <div className="flex-1 max-w-lg mx-4 hidden md:block">
            <SearchBar />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {user && (
              <>
                {/* Cart Button with Preview */}
                <div className="relative" ref={cartRef}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCartPreview(!showCartPreview)}
                    className="relative flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 rounded-xl border border-emerald-500/30 transition-all"
                  >
                    <ShoppingCart size={18} />
                    <span className="font-medium">Sepet</span>
                    {cart.length > 0 && (
                      <span className="bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        {cart.length}
                      </span>
                    )}
                  </motion.button>
                  <AnimatePresence>
                    {showCartPreview && <CartPreview cart={cart} onClose={() => setShowCartPreview(false)} />}
                  </AnimatePresence>
                </div>

                {!isAdmin && (
                  <>
                    <Link to="/siparislerim">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-xl border border-blue-500/30 transition-all"
                      >
                        <Package size={18} />
                        <span className="font-medium">Siparişler</span>
                      </motion.button>
                    </Link>
                    <Link to="/fotokopi">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-xl border border-orange-500/30 transition-all"
                      >
                        <FileText size={18} />
                        <span className="font-medium">Fotokopi</span>
                      </motion.button>
                    </Link>
                  </>
                )}

                {isAdmin && (
                  <>
                    <OrderNotification />
                    <Link to="/secret-dashboard">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 text-purple-300 rounded-xl border border-purple-500/30 transition-all"
                      >
                        <Lock size={18} />
                        <span className="font-medium">Panel</span>
                      </motion.button>
                    </Link>
                  </>
                )}

                {/* User Menu */}
                <div className="relative" ref={userRef}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all"
                  >
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </motion.button>
                  <AnimatePresence>
                    {showUserMenu && <UserMenu user={user} onLogout={logout} onClose={() => setShowUserMenu(false)} />}
                  </AnimatePresence>
                </div>
              </>
            )}

            {!user && (
              <div className="flex items-center gap-2">
                <Link to="/signup">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all"
                  >
                    <UserPlus size={18} />
                    <span>Kayıt Ol</span>
                  </motion.button>
                </Link>
                <Link to="/login">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium border border-white/10 transition-all"
                  >
                    <LogIn size={18} />
                    <span>Giriş</span>
                  </motion.button>
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <motion.button
            id="menu-button"
            onClick={toggleMenu}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="md:hidden p-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl border border-white/10 transition-all"
          >
            <AnimatePresence mode="wait">
              {isMenuOpen ? (
                <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                  <X size={22} />
                </motion.div>
              ) : (
                <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                  <Menu size={22} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Mobile Search */}
        <div className="md:hidden mt-3">
          <SearchBar />
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              id="mobile-menu"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden mt-4 overflow-hidden"
            >
              {user && (
                <div className="mb-4 p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl border border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{user.name}</p>
                      <p className="text-emerald-300 text-sm">{user.email}</p>
                    </div>
                  </div>
                </div>
              )}

              <nav className="space-y-2">
                {user && (
                  <>
                    <Link to="/cart" onClick={toggleMenu} className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl border border-emerald-500/20">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-xl"><ShoppingCart className="w-5 h-5 text-emerald-400" /></div>
                        <span className="text-white font-semibold">Sepetim</span>
                      </div>
                      {cart.length > 0 && <span className="bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">{cart.length}</span>}
                    </Link>

                    {!isAdmin && (
                      <>
                        <Link to="/siparislerim" onClick={toggleMenu} className="flex items-center gap-3 p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                          <div className="p-2 bg-blue-500/20 rounded-xl"><Package className="w-5 h-5 text-blue-400" /></div>
                          <span className="text-white font-semibold">Siparişlerim</span>
                        </Link>
                        <Link to="/fotokopi" onClick={toggleMenu} className="flex items-center gap-3 p-4 bg-orange-500/10 rounded-2xl border border-orange-500/20">
                          <div className="p-2 bg-orange-500/20 rounded-xl"><FileText className="w-5 h-5 text-orange-400" /></div>
                          <span className="text-white font-semibold">Fotokopi</span>
                        </Link>
                      </>
                    )}

                    {isAdmin && (
                      <Link to="/secret-dashboard" onClick={toggleMenu} className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20">
                        <div className="p-2 bg-purple-500/20 rounded-xl"><Lock className="w-5 h-5 text-purple-400" /></div>
                        <span className="text-white font-semibold">Yönetici Paneli</span>
                      </Link>
                    )}

                    <button onClick={() => { logout(); toggleMenu(); }} className="w-full flex items-center gap-3 p-4 bg-red-500/10 rounded-2xl border border-red-500/20 mt-4">
                      <div className="p-2 bg-red-500/20 rounded-xl"><LogOut className="w-5 h-5 text-red-400" /></div>
                      <span className="text-white font-semibold">Çıkış Yap</span>
                    </button>
                  </>
                )}

                {!user && (
                  <div className="space-y-2">
                    <Link to="/signup" onClick={toggleMenu} className="flex items-center gap-3 p-4 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl border border-emerald-500/20">
                      <div className="p-2 bg-emerald-500/20 rounded-xl"><UserPlus className="w-5 h-5 text-emerald-400" /></div>
                      <span className="text-white font-semibold">Kayıt Ol</span>
                    </Link>
                    <Link to="/login" onClick={toggleMenu} className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                      <div className="p-2 bg-white/10 rounded-xl"><LogIn className="w-5 h-5 text-gray-400" /></div>
                      <span className="text-white font-semibold">Giriş Yap</span>
                    </Link>
                  </div>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

export default Navbar;