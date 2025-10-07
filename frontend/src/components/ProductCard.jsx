import toast from "react-hot-toast";
import { ShoppingCart, Package2, Clock, Zap } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { isWithinOrderHours } from "../lib/orderHours";
import { useState, useEffect } from "react";
import axios from "axios";
import { motion } from "framer-motion";

const ProductCard = ({ product, isAdmin }) => {
  const { user } = useUserStore();
  const { addToCart } = useCartStore();
  const { settings } = useSettingsStore();
  const [isEditing, setIsEditing] = useState(false);
  const [discountedPrice, setDiscountedPrice] = useState(product?.discountedPrice);
  const [imageError, setImageError] = useState(false);
  const [flashSales, setFlashSales] = useState([]);

  // Product undefined ise bileşeni render etme
  if (!product) {
    return null;
  }
  
  // Sipariş saatleri kontrolü
  const isOrderHoursActive = isWithinOrderHours(settings);

  // Flash Sale verilerini yükle
  useEffect(() => {
    fetchFlashSales();
  }, []);

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

  // Süresi biten Flash Sale'leri temizle
  const cleanupExpiredFlashSale = async (flashSaleId) => {
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

  const handleAddToCart = async () => {
    if (!user) {
      toast.error("Sepete ürün eklemek için lütfen sisteme giriş yapın.", { id: "login" });
      return;
    }
    if (product?.isOutOfStock) {
      toast.error("Bu ürün tükenmiştir.", { id: "out-of-stock" });
      return;
    }
    if (!isOrderHoursActive) {
      toast.error("Sipariş saatleri dışındayız. Lütfen daha sonra tekrar deneyin.", { id: "order-hours" });
      return;
    }
    
    try {
      await addToCart(product);
      toast.success("Ürün sepete eklendi!", {
        icon: "🛍️",
        position: "top-center",
        style: {
          borderRadius: "10px",
          background: "#333",
          color: "#fff",
        },
      });
    } catch (error) {
      // Hata mesajı useCartStore içinde gösteriliyor, burada bir şey yapmaya gerek yok
    }
  };

  const handleDiscountUpdate = async () => {
    try {
      await axios.put(`/api/products/update-discount/${product?._id}`, {
        discountedPrice: Number(discountedPrice)
      });
      setIsEditing(false);
      toast.success("İndirim fiyatı güncellendi");
    } catch (error) {
      console.error("İndirim fiyatı güncellenirken hata oluştu:", error);
      toast.error("İndirim fiyatı güncellenirken hata oluştu");
    }
  };

  const handleImageError = (e) => {
    console.error('Görsel yükleme hatası:', e);
    console.log('Yüklenemeyen görsel URL:', product?.image);
    setImageError(true);
  };

  if (product?.isHidden) return null;

  return (
    <motion.div 
      className="group relative flex flex-col h-full overflow-hidden rounded-2xl border border-gray-700/50 bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm shadow-2xl hover:shadow-emerald-500/20 hover:border-emerald-500/50 transition-all duration-500"
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, type: "spring" }}
      whileHover={{ scale: 1.02, y: -8 }}
    >
      {/* Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl"></div>
      
      <div className="relative flex flex-col flex-1">
        <div className="relative aspect-square overflow-hidden rounded-t-lg bg-white/5">
          {!imageError ? (
            <img
              src={product?.image}
              alt={product?.name || 'Ürün'}
              onError={handleImageError}
              className="w-full h-full object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <Package2 className="w-12 h-12 text-gray-600" />
            </div>
          )}
          {product?.isOutOfStock && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-bold text-lg">Tükendi</span>
            </div>
          )}
          
          {/* Flash Sale Süre Göstergesi */}
          {getFlashSaleTimeRemaining(product?._id) && (
            <div className={`absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-bold text-white shadow-lg ${
              getFlashSaleStatus(product?._id) === 'active' ? 'bg-gradient-to-r from-red-500 to-orange-500 animate-pulse' :
              getFlashSaleStatus(product?._id) === 'upcoming' ? 'bg-gradient-to-r from-blue-500 to-purple-500' :
              'bg-gray-500'
            }`}>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="whitespace-nowrap">{getFlashSaleTimeRemaining(product?._id)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 flex flex-col flex-1">
          <motion.h5
            className="text-base font-medium tracking-tight text-white line-clamp-2 mb-2 min-h-[2.5rem]"
            title={product?.name || 'Ürün'}
          >
            {product?.name || 'Ürün'}
          </motion.h5>
          
          <motion.div className="flex flex-wrap items-center gap-2 mt-auto">
            {product?.discountedPrice ? (
              <>
                <span className="text-xl font-bold text-emerald-400">
                  ₺{product.discountedPrice.toFixed(2)}
                </span>
                <span className="text-sm text-gray-400 line-through">
                  ₺{product?.price?.toFixed(2) || '0.00'}
                </span>
                <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                  %{Math.round((1 - product.discountedPrice / (product?.price || 1)) * 100)} İndirim
                </span>
              </>
            ) : (
              <span className="text-xl font-bold text-emerald-400">
                ₺{product?.price?.toFixed(2) || '0.00'}
              </span>
            )}
          </motion.div>

          {isAdmin && (
            <div className="mt-2 w-full">
              {isEditing ? (
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={discountedPrice || ''}
                    onChange={(e) => setDiscountedPrice(e.target.value)}
                    className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                    placeholder="İndirim fiyatı"
                  />
                  <button
                    onClick={handleDiscountUpdate}
                    className="px-2 py-1 bg-emerald-600 rounded text-white"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setDiscountedPrice(product?.discountedPrice);
                    }}
                    className="px-2 py-1 bg-red-600 rounded text-white"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full px-2 py-1 bg-blue-600 rounded text-white text-sm"
                >
                  İndirim Ekle/Düzenle
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 pt-0">
        <motion.button
          className={`relative overflow-hidden flex items-center justify-center rounded-xl px-4 py-3 text-center font-semibold text-white w-full transition-all duration-300 ${
            product?.isOutOfStock
              ? "bg-gradient-to-r from-red-500/50 to-red-600/50 cursor-not-allowed border border-red-500/30"
              : !isOrderHoursActive
              ? "bg-gradient-to-r from-gray-500/50 to-gray-600/50 cursor-not-allowed border border-gray-500/30"
              : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg hover:shadow-emerald-500/25 border border-emerald-500/30 hover:border-emerald-400/50"
          }`}
          onClick={handleAddToCart}
          disabled={product?.isOutOfStock || !isOrderHoursActive}
          whileHover={!product?.isOutOfStock && isOrderHoursActive ? { scale: 1.05 } : {}}
          whileTap={!product?.isOutOfStock && isOrderHoursActive ? { scale: 0.95 } : {}}
        >
          {!product?.isOutOfStock && isOrderHoursActive && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
          )}
          <motion.div
            className="flex items-center gap-2"
            whileHover={!product?.isOutOfStock && isOrderHoursActive ? { x: 2 } : {}}
          >
            <motion.div
              whileHover={!product?.isOutOfStock && isOrderHoursActive ? { rotate: 360 } : {}}
              transition={{ duration: 0.5 }}
            >
              {!isOrderHoursActive ? <Clock size={18} /> : <ShoppingCart size={18} />}
            </motion.div>
            {product?.isOutOfStock 
              ? "🚫 Tükendi" 
              : !isOrderHoursActive 
              ? "⏰ Saat Dışı" 
              : "🛒 Sepete Ekle"}
          </motion.div>
        </motion.button>
      </div>
    </motion.div>
  );
};

export default ProductCard;