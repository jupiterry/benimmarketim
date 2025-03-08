import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCartStore } from "../stores/useCartStore";
import { useUserStore } from "../stores/useUserStore";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const FeaturedProducts = ({ featuredProducts }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { addToCart } = useCartStore();
  const { user } = useUserStore();
  const navigate = useNavigate();

  const handleAddToCart = (product) => {
    if (!user) {
      toast.error("Sepete ürün eklemek için lütfen giriş yapın");
      navigate("/login");
      return;
    }
    addToCart(product);
    toast.success("Ürün sepete eklendi!");
  };

  const nextSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex + getVisibleProducts() >= featuredProducts.length ? 0 : prevIndex + getVisibleProducts()
    );
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex - getVisibleProducts() < 0 
        ? Math.max(0, featuredProducts.length - getVisibleProducts()) 
        : prevIndex - getVisibleProducts()
    );
  };

  // Ekran boyutuna göre görünecek ürün sayısını belirle
  const getVisibleProducts = () => {
    if (typeof window === 'undefined') return 4;
    if (window.innerWidth < 640) return 1; // sm
    if (window.innerWidth < 1024) return 2; // lg
    if (window.innerWidth < 1280) return 3; // xl
    return 4; // 2xl ve üzeri
  };

  useEffect(() => {
    const handleResize = () => {
      const visibleProducts = getVisibleProducts();
      if (currentIndex + visibleProducts > featuredProducts.length) {
        setCurrentIndex(Math.max(0, featuredProducts.length - visibleProducts));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentIndex, featuredProducts.length]);

  if (!featuredProducts || featuredProducts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        Henüz haftanın yıldızı ürün bulunmuyor
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-2xl p-6 backdrop-blur-xl border border-gray-700/50">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-2xl">⭐</span>
          <h2 className="text-2xl font-bold text-white">Haftanın Yıldızları</h2>
          <span className="text-yellow-400 text-2xl">⭐</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={prevSlide}
            className="p-2 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 transition-all duration-200"
          >
            <ChevronLeft className="h-5 w-5" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={nextSlide}
            className="p-2 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 transition-all duration-200"
          >
            <ChevronRight className="h-5 w-5" />
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {featuredProducts.slice(currentIndex, currentIndex + getVisibleProducts()).map((product) => (
          <motion.div
            key={product._id}
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="relative aspect-square rounded-lg overflow-hidden mb-4 bg-gray-700/50">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-contain hover:scale-110 transition-transform duration-300"
              />
              {product.isDiscounted && (
                <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                  %{(((product.price - product.discountedPrice) / product.price) * 100).toFixed(0)} İndirim
                </div>
              )}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 flex-grow">{product.name}</h3>
            <div className="space-y-1">
              {product.isDiscounted ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 line-through">
                      ₺{product.price.toFixed(2)}
                    </span>
                    <span className="text-lg font-bold text-red-400">
                      ₺{product.discountedPrice.toFixed(2)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-lg font-bold text-emerald-400">
                  ₺{product.price.toFixed(2)}
                </div>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full mt-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 
                py-2 px-4 rounded-lg font-medium transition-all duration-200"
              onClick={() => handleAddToCart(product)}
            >
              Sepete Ekle
            </motion.button>
          </motion.div>
        ))}
      </div>

      {featuredProducts.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Henüz haftanın yıldızı ürün bulunmuyor
        </div>
      )}
    </div>
  );
};

export default FeaturedProducts;