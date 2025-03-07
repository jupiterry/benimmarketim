import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import axios from "../lib/axios";

const FeaturedProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchFeaturedProducts = async () => {
      try {
        const response = await axios.get("/products/featured");
        setProducts(response.data);
      } catch (error) {
        console.error("Haftanın yıldızları yüklenirken hata:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeaturedProducts();
  }, []);

  const nextSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex + 4 >= products.length ? 0 : prevIndex + 4
    );
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex - 4 < 0 ? Math.max(0, products.length - 4) : prevIndex - 4
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
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

      <div className="grid grid-cols-4 gap-4">
        {products.slice(currentIndex, currentIndex + 4).map((product) => (
          <motion.div
            key={product._id}
            className={`bg-gray-800/30 rounded-xl p-4 border ${
              product.isDiscounted 
                ? 'border-red-500/50 shadow-lg shadow-red-500/10' 
                : 'border-gray-700/50 hover:border-emerald-500/50'
            } transition-all duration-200`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-900/50 mb-4 relative">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-contain p-2"
              />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-white font-medium truncate flex-1" title={product.name}>
                {product.name}
              </h3>
              {product.isDiscounted && (
                <div className="bg-red-500/20 text-red-400 px-2 py-1 rounded-lg text-sm font-bold whitespace-nowrap">
                  %{((1 - product.discountedPrice / product.price) * 100).toFixed(0)}
                </div>
              )}
            </div>
            <div className="space-y-1">
              {product.isDiscounted ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 line-through">
                      ₺{product.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-red-400">
                    ₺{product.discountedPrice.toFixed(2)}
                  </div>
                </>
              ) : (
                <div className="text-lg font-bold text-emerald-400">
                  ₺{product.price.toFixed(2)}
                </div>
              )}
              <div className="text-sm text-gray-400">
                {product.category}
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full mt-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 
                py-2 px-4 rounded-lg font-medium transition-all duration-200"
            >
              Sepete Ekle
            </motion.button>
          </motion.div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Henüz haftanın yıldızı ürün bulunmuyor
        </div>
      )}
    </div>
  );
};

export default FeaturedProducts;