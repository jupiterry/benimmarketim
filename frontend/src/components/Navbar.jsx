import { ShoppingCart, UserPlus, LogIn, LogOut, Lock, Package, Menu, X, Bell } from "lucide-react";
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
            const socket = io('http://devrekbenimmarketim.com', {
                withCredentials: true,
                transports: ['polling', 'websocket'],
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 10,
                timeout: 20000,
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

  // Menü dışına tıklandığında menüyü kapat
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
    <header className="fixed top-0 left-0 w-full bg-gray-900/90 backdrop-blur-lg shadow-[0_2px_15px_-3px_rgba(0,0,0,0.3)] z-40 transition-all duration-300">
      <div className="container mx-auto py-4 px-4">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link to="/">
              <img
                src="/logo2.png"
                alt="Benim Marketim Logo"
                className="h-12 w-48 object-contain transition-transform duration-300 hover:scale-105"
              />
            </Link>
          </div>

          {/* Spacer */}
          <div className="flex-grow"></div>

          {/* Arama Çubuğu - Her zaman görünür ve küçük */}
          <div className="w-[280px]">
            <SearchBar />
          </div>

          {/* Spacer */}
          <div className="flex-grow"></div>

          {/* Mobil Menü Butonu */}
          <button
            id="menu-button"
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
              <>
                <OrderNotification />
                <Link
                  to="/secret-dashboard"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
                >
                  <Lock size={18} />
                  <span>İstatistikler</span>
                </Link>
              </>
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

        {/* Mobil Menü */}
        {isMenuOpen && (
          <div 
            id="mobile-menu"
            className="fixed inset-0 bg-gray-900/95 backdrop-blur-md z-50 transition-transform duration-300 md:hidden"
          >
            <div className="flex flex-col h-full pt-20 px-6">
              {/* Kapatma Butonu */}
              <button
                onClick={toggleMenu}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              
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
        )}
      </div>
    </header>
  );
};

export default Navbar;