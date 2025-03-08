import toast from "react-hot-toast";
import { ShoppingCart } from "lucide-react";
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

  const handleAddToCart = () => {
    if (!user) {
      toast.error("Sepete ürün eklemek için lütfen sisteme giriş yapın.", { id: "login" });
      return;
    }
    if (product.isOutOfStock) {
      toast.error("Bu ürün tükenmiştir.", { id: "out-of-stock" });
      return;
    }
    addToCart(product);
    toast.success("Ürün sepete eklendi!", {
      icon: "🛍️",
      position: "top-center",
      style: {
        borderRadius: "10px",
        background: "#333",
        color: "#fff",
      },
    });
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
          <motion.img
            loading="lazy"
            className="h-full w-full object-contain p-2 mix-blend-normal group-hover:scale-110 transition-transform duration-300"
            src={product.thumbnail || product.image || '/placeholder.png'}
            srcSet={`${product.thumbnail || product.image || '/placeholder.png'} 300w,
                    ${product.image || '/placeholder.png'} 600w`}
            sizes="(max-width: 768px) 300px,
                   600px"
            alt={product.name}
            decoding="async"
            fetchpriority="low"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/placeholder.png';
            }}
          />
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