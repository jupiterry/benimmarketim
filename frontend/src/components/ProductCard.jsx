import toast from "react-hot-toast";
import { ShoppingCart, Package2 } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";
import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";

const ProductCard = ({ product, isAdmin }) => {
  const { user } = useUserStore();
  const { addToCart } = useCartStore();
  const [isEditing, setIsEditing] = useState(false);
  const [discountedPrice, setDiscountedPrice] = useState(product.discountedPrice);
  const [imageError, setImageError] = useState(false);

  const handleAddToCart = async () => {
    if (!user) {
      toast.error("Sepete ürün eklemek için lütfen sisteme giriş yapın.", { id: "login" });
      return;
    }
    if (product.isOutOfStock) {
      toast.error("Bu ürün tükenmiştir.", { id: "out-of-stock" });
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
      await axios.put(`/api/products/update-discount/${product._id}`, {
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
    console.log('Yüklenemeyen görsel URL:', product.image);
    setImageError(true);
  };

  if (product.isHidden) return null;

  return (
    <motion.div 
      className="group flex flex-col h-full overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm shadow-lg hover:shadow-emerald-500/10 transition-all duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex flex-col flex-1">
        <div className="relative aspect-square overflow-hidden rounded-t-lg bg-white/5">
          {!imageError ? (
            <img
              src={product.image}
              alt={product.name}
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
          {product.isOutOfStock && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-bold text-lg">Tükendi</span>
            </div>
          )}
        </div>

        <div className="p-3 flex flex-col flex-1">
          <motion.h5
            className="text-base font-medium tracking-tight text-white line-clamp-2 mb-2 min-h-[2.5rem]"
            title={product.name}
          >
            {product.name}
          </motion.h5>
          
          <motion.div className="flex flex-wrap items-center gap-2 mt-auto">
            {product.discountedPrice ? (
              <>
                <span className="text-xl font-bold text-emerald-400">
                  ₺{product.discountedPrice.toFixed(2)}
                </span>
                <span className="text-sm text-gray-400 line-through">
                  ₺{product.price.toFixed(2)}
                </span>
                <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                  %{Math.round((1 - product.discountedPrice / product.price) * 100)} İndirim
                </span>
              </>
            ) : (
              <span className="text-xl font-bold text-emerald-400">
                ₺{product.price.toFixed(2)}
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
                      setDiscountedPrice(product.discountedPrice);
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

      <div className="p-3 pt-0">
        <motion.button
          className={`flex items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-medium text-white w-full ${
            product.isOutOfStock
              ? "bg-red-600/50 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
          onClick={handleAddToCart}
          disabled={product.isOutOfStock}
          whileHover={!product.isOutOfStock ? { scale: 1.02 } : {}}
          whileTap={!product.isOutOfStock ? { scale: 0.98 } : {}}
        >
          <ShoppingCart size={18} className="mr-2" />
          {product.isOutOfStock ? "Tükendi" : "Sepete Ekle"}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default ProductCard;