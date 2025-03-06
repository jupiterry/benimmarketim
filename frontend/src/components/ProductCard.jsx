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
      className="group flex w-full relative flex-col justify-between overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 max-w-xs mx-auto min-h-[500px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
    >
      <div>
        <div className="relative mx-3 mt-3 flex h-[200px] overflow-hidden rounded-xl bg-transparent">
          <motion.img
            loading="lazy"
            className="h-full w-full object-contain mix-blend-normal group-hover:scale-110 transition-transform duration-300"
            src={product.image}
            alt={product.name}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/placeholder.png';
            }}
          />
        </div>

        <div className="mt-4 px-5">
          <motion.h5
            className="text-xl font-semibold tracking-tight text-white line-clamp-2 min-h-[3.5rem]"
            title={product.name}
          >
            {product.name}
          </motion.h5>
          
          <motion.div 
            className="mt-2 flex flex-col items-start gap-2"
          >
            <div className="flex items-center gap-2">
              {product.discountedPrice ? (
                <>
                  <span className="text-3xl font-bold text-emerald-400">
                    ₺{product.discountedPrice.toFixed(2)}
                  </span>
                  <span className="text-xl text-gray-400 line-through">
                    ₺{product.price.toFixed(2)}
                  </span>
                  <span className="text-sm text-red-500">
                    %{Math.round((1 - product.discountedPrice / product.price) * 100)} İndirim
                  </span>
                </>
              ) : (
                <span className="text-3xl font-bold text-emerald-400">
                  ₺{product.price.toFixed(2)}
                </span>
              )}
            </div>

            {isAdmin && (
              <div className="w-full">
                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={discountedPrice || ''}
                      onChange={(e) => setDiscountedPrice(e.target.value)}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-white"
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
          </motion.div>
        </div>
      </div>

      <div className="px-5 pb-5 mt-auto">
        <motion.button
          className={`flex items-center justify-center rounded-lg px-5 py-2.5 text-center text-sm font-medium text-white w-full ${
            product.isOutOfStock
              ? "bg-red-600 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-300"
          }`}
          onClick={handleAddToCart}
          disabled={product.isOutOfStock}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <ShoppingCart size={22} className="mr-2" />
          {product.isOutOfStock ? "Tükendi" : "Sepete Ekle"}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default ProductCard;