import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Zap } from "lucide-react";
import { useCartStore } from "../stores/useCartStore";
import { useUserStore } from "../stores/useUserStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { isWithinOrderHours } from "../lib/orderHours";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "../lib/axios";

const FeaturedProducts = ({ featuredProducts }) => {
  const [flashSales, setFlashSales] = useState([]);
  const { addToCart } = useCartStore();
  const { user } = useUserStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  
  // Sipariş saatleri kontrolü
  const isOrderHoursActive = isWithinOrderHours(settings);

  // Flash Sale verilerini yükle (sadece giriş yapmış kullanıcılar için)
  useEffect(() => {
    if (user) {
      fetchFlashSales();
    }
  }, [user]);

  // Flash Sale süre güncellemesi için interval
  useEffect(() => {
    const interval = setInterval(() => {
      setFlashSales(prev => [...prev]);
    }, 60000); // Her dakika güncelle

    return () => clearInterval(interval);
  }, []);


  const fetchFlashSales = async () => {
    try {
      const response = await axios.get("/flash-sales/active");
      setFlashSales(response.data.flashSales || []);
    } catch (error) {
      // 401 hatası normal - kullanıcı giriş yapmamış
      if (error.response?.status !== 401) {
        console.error("Flash sale'ler getirilemedi:", error);
      }
    }
  };

  // Süresi biten Flash Sale'leri temizle (sadece admin kullanıcılar için)
  const cleanupExpiredFlashSale = async (flashSaleId) => {
    // Sadece admin kullanıcılar flash sale silebilir
    if (!user || user.role !== 'admin') {
      return;
    }
    
    try {
      await axios.delete(`/flash-sales/${flashSaleId}`);
      // Flash sale listesini güncelle
      setFlashSales(prev => prev.filter(sale => sale._id !== flashSaleId));
    } catch (error) {
      console.error("Flash sale silinemedi:", error);
    }
  };

  // Flash Sale kalan süre hesaplama
  const getFlashSaleTimeRemaining = (productId) => {
    const flashSale = flashSales.find(sale => sale.product?._id === productId);
    if (!flashSale) return null;

    const now = new Date();
    const start = new Date(flashSale.startDate);
    const end = new Date(flashSale.endDate);

    // Sona ermiş - flash sale'i temizle
    if (now > end) {
      // Flash sale'i backend'den sil
      cleanupExpiredFlashSale(flashSale._id);
      return null; // Artık gösterme
    }

    // Henüz başlamamış
    if (now < start) {
      const diff = start - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) return `${days}g ${hours}s sonra başlar`;
      if (hours > 0) return `${hours}s ${minutes}d sonra başlar`;
      return `${minutes}d sonra başlar`;
    }

    // Aktif - kalan süre
    const diff = end - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}g ${hours}s kaldı`;
    if (hours > 0) return `${hours}s ${minutes}d kaldı`;
    return `${minutes}d kaldı`;
  };

  // Flash Sale durumu
  const getFlashSaleStatus = (productId) => {
    const flashSale = flashSales.find(sale => sale.product?._id === productId);
    if (!flashSale) return null;

    const now = new Date();
    const start = new Date(flashSale.startDate);
    const end = new Date(flashSale.endDate);

    if (now < start) return "upcoming";
    if (now > end) return "expired";
    return "active";
  };

  const calculateDiscountPercentage = (price, discountedPrice) => {
    if (!price || !discountedPrice) return 0;
    return (((price - discountedPrice) / price) * 100).toFixed(0);
  };

  const handleAddToCart = async (product) => {
    if (!user) {
      toast.error("Sepete ürün eklemek için lütfen giriş yapın");
      navigate("/login");
      return;
    }
    if (!isOrderHoursActive) {
      toast.error("Sipariş saatleri dışındayız. Lütfen daha sonra tekrar deneyin.", { id: "order-hours" });
      return;
    }
    
    try {
      await addToCart(product);
      toast.success("Ürün sepete eklendi!");
    } catch (error) {
      // Hata mesajı useCartStore içinde gösteriliyor
    }
  };


  if (!featuredProducts || !Array.isArray(featuredProducts) || featuredProducts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        Henüz haftanın yıldızı ürün bulunmuyor
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      {/* Arka Plan Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 rounded-3xl"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/20 to-gray-900/40 rounded-3xl"></div>
      
      <div className="relative bg-gray-900/60 rounded-3xl p-8 backdrop-blur-xl border border-yellow-500/20 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div 
            className="inline-flex items-center gap-3 mb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-2xl">⭐</span>
            </div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
              Haftanın Yıldızları
            </h2>
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-2xl">🌟</span>
            </div>
          </motion.div>
          <motion.p 
            className="text-gray-300 text-lg max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            En çok sevilen ve en kaliteli ürünlerimizi keşfedin! ✨
          </motion.p>
        </div>

        {/* Products Grid - Dikey Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 sm:gap-8">
          {Array.isArray(featuredProducts) && featuredProducts.map((product, index) => (
            <motion.div
              key={product._id}
              className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/30 hover:border-yellow-500/50 flex flex-col shadow-xl hover:shadow-2xl transition-all duration-500"
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
            >
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl"></div>
              
              {/* Product Image */}
              <div className="relative aspect-square rounded-xl overflow-hidden mb-4 bg-gradient-to-br from-gray-700/30 to-gray-800/30 border border-gray-600/20">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-contain hover:scale-110 transition-transform duration-500 p-2"
                />
                
                {/* Discount Badge */}
                {product.isDiscounted && product.price && product.discountedPrice && (
                  <motion.div 
                    className="absolute top-3 left-3 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.5, type: "spring" }}
                  >
                    <span className="flex items-center gap-1">
                      🔥 %{calculateDiscountPercentage(product.price, product.discountedPrice)}
                    </span>
                  </motion.div>
                )}
                
                {/* Flash Sale Timer */}
                {getFlashSaleTimeRemaining(product._id) && (
                  <motion.div 
                    className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-lg ${
                      getFlashSaleStatus(product._id) === 'active' ? 'bg-gradient-to-r from-red-500 to-orange-500 animate-pulse' :
                      getFlashSaleStatus(product._id) === 'upcoming' ? 'bg-gradient-to-r from-blue-500 to-purple-500' :
                      'bg-gray-500'
                    }`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span className="whitespace-nowrap">{getFlashSaleTimeRemaining(product._id)}</span>
                    </div>
                  </motion.div>
                )}
                
                {/* Star Rating */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400 text-sm">⭐</span>
                  ))}
                </div>
              </div>

              {/* Product Info */}
              <div className="flex-grow">
                <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 group-hover:text-yellow-400 transition-colors duration-300">
                  {product.name}
                </h3>
                
                {/* Price */}
                <div className="mb-3">
                  {product.isDiscounted ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
                        ₺{(product.discountedPrice || 0).toFixed(2)}
                      </span>
                      <span className="text-sm text-gray-400 line-through">₺{(product.price || 0).toFixed(2)}</span>
                    </div>
                  ) : (
                    <span className="text-xl font-bold text-white">₺{(product.price || 0).toFixed(2)}</span>
                  )}
                </div>
                
                {/* Features */}
                <div className="flex items-center gap-2 mb-3 text-xs text-gray-300">
                  <span className="bg-gray-700/50 px-2 py-1 rounded-full">✨ Premium</span>
                  <span className="bg-gray-700/50 px-2 py-1 rounded-full">🚚 Hızlı Teslimat</span>
                </div>
              </div>
              
              {/* Add to Cart Button */}
              <motion.button
                whileHover={isOrderHoursActive ? { scale: 1.05, boxShadow: "0 10px 30px rgba(16, 185, 129, 0.4)" } : {}}
                whileTap={isOrderHoursActive ? { scale: 0.95 } : {}}
                onClick={() => handleAddToCart(product)}
                disabled={!isOrderHoursActive}
                className={`w-full font-bold py-2 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg text-sm ${
                  isOrderHoursActive
                    ? "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white"
                    : "bg-gradient-to-r from-gray-500 to-gray-600 text-gray-300 cursor-not-allowed"
                }`}
              >
                <motion.div
                  whileHover={isOrderHoursActive ? { rotate: 360 } : {}}
                  transition={{ duration: 0.5 }}
                >
                  {isOrderHoursActive ? <Zap className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </motion.div>
                {isOrderHoursActive ? "Sepete Ekle" : "⏰ Saat Dışı"}
              </motion.button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeaturedProducts;