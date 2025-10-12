import { ShoppingCart, UserPlus, LogIn, LogOut, Lock, Package, Menu, X, Bell, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";
import SearchBar from "./SearchBar";
import { useState, useEffect } from "react";
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

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

    // Ses değiştirme fonksiyonu
    const changeNotificationSound = (soundName) => {
        // Eğer çalan bir ses varsa durdur
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }

        setSelectedSound(soundName);
        localStorage.setItem('notificationSound', soundName);
        const newAudio = notificationSounds[soundName];
        setCurrentAudio(newAudio);
        
        // Yeni sesi çal
        newAudio.play().catch(err => {
            console.log('Ses çalma hatası:', err);
        });
    };

    // Yeni sipariş bildirimi geldiğinde ses çalma
    const playNotificationSound = () => {
        // Eğer çalan bir ses varsa durdur
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }

        const audio = notificationSounds[selectedSound];
        setCurrentAudio(audio);
        audio.play().catch(err => {
            console.log('Ses çalma hatası:', err);
        });
    };

    useEffect(() => {
        if (user?.role === 'admin') {
            console.log('Admin bağlantısı başlatılıyor...');
          
            
            // Basit Socket.IO konfigürasyonu
            const getSocketURL = () => {
                if (import.meta.env.DEV) {
                    return 'http://localhost:5000';
                }
                return 'https://www.devrekbenimmarketim.com';
            };
            
            const socket = io(getSocketURL(), {
                withCredentials: true,
                transports: ['polling'], // Sadece polling - daha güvenilir
                reconnectionDelay: 2000,
                reconnectionAttempts: 3,
                timeout: 5000,
                forceNew: true
            });

            socket.io.on("error", (error) => {
                console.error('Socket.IO altyapı hatası:', error);
            });

            socket.io.on("reconnect_attempt", (attempt) => {
                console.log('Yeniden bağlanma denemesi:', attempt);
            });

            socket.on('connect', () => {
                console.log('Socket.IO bağlantısı başarılı! Socket ID:', socket.id);
                socket.emit('joinAdminRoom');
                console.log('Admin odası katılım isteği gönderildi');
            });

            socket.on('connect_error', (error) => {
                console.error('Socket.IO bağlantı hatası:', error.message);
            });

            socket.on('disconnect', (reason) => {
                console.log('Socket.IO bağlantısı kesildi:', reason);
            });

            socket.on('newOrder', (data) => {
                console.log('Yeni sipariş bildirimi alındı:', data);
                if (data.order.id === 'test') {
                    console.log('Test bildirimi olduğu için işleme alınmadı');
                    return;
                }

                // Bildirim sesi çal
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
                                        <span>Yeni Sipariş Alındı!</span>
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
                                        <p className="text-xs text-gray-500">{data.order.phone}</p>
                                        <p className="flex items-center gap-1">
                                            <span className={`w-2 h-2 rounded-full ${
                                                data.order.status === 'Hazırlanıyor' ? 'bg-yellow-500' :
                                                data.order.status === 'Yolda' ? 'bg-blue-500' :
                                                data.order.status === 'Teslim Edildi' ? 'bg-emerald-500' :
                                                'bg-red-500'
                                            }`} />
                                            {data.order.status}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex border-l border-gray-700">
                            <button
                                onClick={() => toast.dismiss(t.id)}
                                className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-emerald-400 hover:text-emerald-500 focus:outline-none"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                ), {
                    duration: Infinity,
                    position: 'top-right'
                });
            });

            return () => {
                if (socket) {
                    socket.disconnect();
                }
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
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2 text-gray-400 hover:text-white transition-colors"
                >
                    <Bell size={20} />
                    {notifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                            {notifications.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setShowSoundSettings(!showSoundSettings)}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    title="Bildirim Sesi Ayarları"
                >
                    {selectedSound === 'ringtone' ? '🔔' : 
                     selectedSound === 'bell' ? '🎵' : 
                     selectedSound === 'chime' ? '🎶' :
                     selectedSound === 'furelise' ? '🎹' :
                     selectedSound === 'gnosienne' ? '🎼' : '🎻'}
                </button>
            </div>

            {/* Ses Ayarları Menüsü */}
            <AnimatePresence>
                {showSoundSettings && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 mt-2 w-64 bg-gray-800 rounded-lg shadow-lg overflow-hidden z-50"
                    >
                        <div className="p-2 space-y-1">
                            <button
                                onClick={() => changeNotificationSound('ringtone')}
                                className={`w-full p-2 text-left rounded-lg transition-colors ${
                                    selectedSound === 'ringtone' 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'text-gray-400 hover:bg-gray-700'
                                }`}
                            >
                                🔔 Varsayılan Ses
                            </button>
                            <button
                                onClick={() => changeNotificationSound('bell')}
                                className={`w-full p-2 text-left rounded-lg transition-colors ${
                                    selectedSound === 'bell' 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'text-gray-400 hover:bg-gray-700'
                                }`}
                            >
                                🎵 Zil Sesi
                            </button>
                            <button
                                onClick={() => changeNotificationSound('chime')}
                                className={`w-full p-2 text-left rounded-lg transition-colors ${
                                    selectedSound === 'chime' 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'text-gray-400 hover:bg-gray-700'
                                }`}
                            >
                                🎶 İphone Ses
                            </button>
                            <div className="my-2 border-t border-gray-700"></div>
                            <button
                                onClick={() => changeNotificationSound('furelise')}
                                className={`w-full p-2 text-left rounded-lg transition-colors ${
                                    selectedSound === 'furelise' 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'text-gray-400 hover:bg-gray-700'
                                }`}
                            >
                                🎹 Für Elise
                            </button>
                            <button
                                onClick={() => changeNotificationSound('gnosienne')}
                                className={`w-full p-2 text-left rounded-lg transition-colors ${
                                    selectedSound === 'gnosienne' 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'text-gray-400 hover:bg-gray-700'
                                }`}
                            >
                                🎼 Gnosienne No.1
                            </button>
                            <button
                                onClick={() => changeNotificationSound('vivaldi')}
                                className={`w-full p-2 text-left rounded-lg transition-colors ${
                                    selectedSound === 'vivaldi' 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'text-gray-400 hover:bg-gray-700'
                                }`}
                            >
                                🎻 Vivaldi - Winter
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bildirimler Menüsü */}
            <AnimatePresence>
                {showNotifications && notifications.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 mt-2 w-80 bg-gray-800 rounded-lg shadow-lg overflow-hidden z-50"
                    >
                        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                            <h3 className="text-white font-medium">Bildirimler</h3>
                            <button
                                onClick={clearNotifications}
                                className="text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                Tümünü Temizle
                            </button>
                        </div>
                        <div className="max-h-96 overflow-auto">
                            {notifications.map((notif, index) => (
                                <div
                                    key={index}
                                    className="p-4 border-b border-gray-700 hover:bg-gray-700/50 transition-colors"
                                >
                                    <p className="text-white font-medium">{notif.message}</p>
                                    <p className="text-sm text-gray-400 mt-1">
                                        Tutar: ₺{notif.order.totalAmount}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {new Date(notif.order.createdAt).toLocaleString()}
                                    </p>
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

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    document.body.style.overflow = !isMenuOpen ? 'hidden' : 'unset';
  };

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
    <header className="fixed top-0 left-0 w-full bg-gradient-to-r from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl shadow-2xl border-b border-emerald-500/20 z-50 transition-all duration-300">
      <div className="container mx-auto py-3 px-4">
        <div className="flex items-center justify-between gap-6">
          {/* Logo ve Arama Çubuğu Grubu */}
          <div className="flex items-center justify-between gap-4 flex-1">
            {/* Logo */}
            <Link to="/" className="flex-shrink-0 group">
              <div className="flex items-center gap-2">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-2 rounded-lg shadow-lg group-hover:shadow-emerald-500/50 transition-all duration-300">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-white font-bold text-lg leading-tight">Benim</h1>
                  <p className="text-emerald-400 text-xs font-medium -mt-1">Marketim</p>
                </div>
              </div>
            </Link>
            
            {/* Arama Çubuğu */}
            <div className="flex-1 max-w-md mx-auto hidden md:block">
              <SearchBar />
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-3">
            {user && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  to="/cart"
                  className="relative group bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 hover:text-emerald-200 transition-all duration-300 flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 hover:border-emerald-400/50 backdrop-blur-sm"
                >
                  <ShoppingCart size={18} />
                  <span className="font-medium">Sepetim</span>
                  {cart.length > 0 && (
                    <motion.span 
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-lg"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500 }}
                    >
                      {cart.length}
                    </motion.span>
                  )}
                </Link>
              </motion.div>
            )}
            {user && !isAdmin && (
              <>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link
                    to="/siparislerim"
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-blue-500/25"
                  >
                    <Package size={18} />
                    <span>Siparişlerim</span>
                  </Link>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link
                    to="/fotokopi"
                    className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-orange-500/25"
                  >
                    <FileText size={18} />
                    <span>Fotokopi</span>
                  </Link>
                </motion.div>
              </>
            )}
            {isAdmin && (
              <>
                <OrderNotification />
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                    <Link
                      to="/secret-dashboard"
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-emerald-500/25"
                    >
                      <Lock size={18} />
                      <span>İstatistikler</span>
                    </Link>
                  </motion.div>
                </>
              )}
              {user ? (
                <motion.button
                  onClick={logout}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500 text-white px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-red-500/25"
                >
                  <LogOut size={18} />
                  <span>Çıkış</span>
                </motion.button>
              ) : (
                <div className="flex items-center gap-3">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Link
                      to="/signup"
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-emerald-500/25"
                    >
                      <UserPlus size={18} />
                      <span>Kayıt Ol</span>
                    </Link>
                  </motion.div>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                      <Link
                        to="/login"
                        className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-gray-500/25 border border-gray-500/30"
                      >
                        <LogIn size={18} />
                        <span>Giriş</span>
                      </Link>
                    </motion.div>
                  </div>
                )}
          </nav>

          {/* Mobil Menü Butonu */}
          <motion.button
            id="menu-button"
            onClick={toggleMenu}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="md:hidden relative p-3 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 hover:text-emerald-200 rounded-xl border border-emerald-500/30 hover:border-emerald-400/50 backdrop-blur-sm transition-all duration-300 shadow-lg hover:shadow-emerald-500/25"
          >
            <AnimatePresence mode="wait">
              {isMenuOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -180, opacity: 0, scale: 0.8 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 180, opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="relative"
                >
                  <X size={22} />
                  <div className="absolute inset-0 bg-emerald-400/20 rounded-full animate-ping"></div>
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 180, opacity: 0, scale: 0.8 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -180, opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <Menu size={22} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Mobil Arama Çubuğu */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="md:hidden mt-3"
        >
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-2 border border-gray-700/50">
            <SearchBar />
          </div>
        </motion.div>

        {/* Mobil Menü */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              id="mobile-menu"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="md:hidden mt-4"
            >
              {/* Kullanıcı Bilgisi */}
              {user && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-4 p-4 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl border border-emerald-500/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {user.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-white font-medium">{user.name}</p>
                      <p className="text-emerald-300 text-sm">{user.email}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              <nav className="flex flex-col gap-3">
                {/* Sepet */}
                {user && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Link
                      to="/cart"
                      onClick={toggleMenu}
                      className="relative flex items-center justify-between bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-500 hover:to-teal-500 p-4 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                          <ShoppingCart size={20} className="text-white" />
                        </div>
                        <span className="text-white font-bold">Sepetim</span>
                      </div>
                      {cart.length > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="bg-white text-emerald-600 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shadow-lg"
                        >
                          {cart.length}
                        </motion.span>
                      )}
                    </Link>
                  </motion.div>
                )}

                {/* Kullanıcı Menüleri */}
                {user && !isAdmin && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col gap-3"
                  >
                    <Link
                      to="/siparislerim"
                      onClick={toggleMenu}
                      className="flex items-center gap-3 bg-gradient-to-r from-blue-600/80 to-indigo-600/80 hover:from-blue-500 hover:to-indigo-500 p-4 rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all duration-300 group"
                    >
                      <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                        <Package size={20} className="text-white" />
                      </div>
                      <span className="text-white font-bold">Siparişlerim</span>
                    </Link>

                    <Link
                      to="/fotokopi"
                      onClick={toggleMenu}
                      className="flex items-center gap-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 p-4 rounded-xl shadow-lg hover:shadow-orange-500/25 transition-all duration-300 group"
                    >
                      <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                        <FileText size={20} className="text-white" />
                      </div>
                      <span className="text-white font-bold">Fotokopi</span>
                    </Link>
                  </motion.div>
                )}

                {/* Admin Menüsü */}
                {isAdmin && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Link
                      to="/secret-dashboard"
                      onClick={toggleMenu}
                      className="flex items-center gap-3 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500 p-4 rounded-xl shadow-lg hover:shadow-purple-500/25 transition-all duration-300 group"
                    >
                      <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                        <Lock size={20} className="text-white" />
                      </div>
                      <span className="text-white font-bold">Admin Paneli</span>
                    </Link>
                  </motion.div>
                )}

                {/* Giriş/Çıkış Butonları */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-4 pt-4 border-t border-gray-700/50"
                >
                  {user ? (
                    <button
                      onClick={() => {
                        logout();
                        toggleMenu();
                      }}
                      className="flex items-center gap-3 bg-gradient-to-r from-red-600/80 to-pink-600/80 hover:from-red-500 hover:to-pink-500 p-4 rounded-xl shadow-lg hover:shadow-red-500/25 transition-all duration-300 w-full group"
                    >
                      <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                        <LogOut size={20} className="text-white" />
                      </div>
                      <span className="text-white font-bold">Çıkış Yap</span>
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <Link
                        to="/signup"
                        onClick={toggleMenu}
                        className="flex items-center gap-3 bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-500 hover:to-teal-500 p-4 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 group"
                      >
                        <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                          <UserPlus size={20} className="text-white" />
                        </div>
                        <span className="text-white font-bold">Kayıt Ol</span>
                      </Link>
                      <Link
                        to="/login"
                        onClick={toggleMenu}
                        className="flex items-center gap-3 bg-gradient-to-r from-gray-600/80 to-gray-700/80 hover:from-gray-500 hover:to-gray-600 p-4 rounded-xl shadow-lg hover:shadow-gray-500/25 transition-all duration-300 group"
                      >
                        <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                          <LogIn size={20} className="text-white" />
                        </div>
                        <span className="text-white font-bold">Giriş Yap</span>
                      </Link>
                    </div>
                  )}
                </motion.div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

export default Navbar;