import { useEffect, useState } from "react";
import { ShoppingCart, ChevronLeft, ChevronRight, Star, TrendingUp, Timer } from "lucide-react";
import { useCartStore } from "../stores/useCartStore";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

const FeaturedProducts = ({ featuredProducts }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(4);

  const { addToCart } = useCartStore();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) setItemsPerPage(1);
      else if (window.innerWidth < 1024) setItemsPerPage(2);
      else if (window.innerWidth < 1280) setItemsPerPage(3);
      else setItemsPerPage(4);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const nextSlide = () => {
    setCurrentIndex((prevIndex) => prevIndex + itemsPerPage);
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) => prevIndex - itemsPerPage);
  };

  const isStartDisabled = currentIndex === 0;
  const isEndDisabled = currentIndex >= featuredProducts.length - itemsPerPage;

  const handleAddToCart = (product) => {
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

  return (
    <div className="py-12">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <motion.div 
            className="flex items-center justify-center gap-2 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Star className="w-8 h-8 text-yellow-400" />
            <h2 className="text-4xl sm:text-5xl font-bold">
              <span className="text-emerald-400">Haftanın</span>{" "}
              <span className="text-white">Yıldızları</span>
            </h2>
            <Star className="w-8 h-8 text-yellow-400" />
          </motion.div>
          <motion.div 
            className="flex justify-center gap-8 text-gray-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>En Çok Satan</span>
            </div>
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-emerald-400" />
              <span>Sınırlı Süre</span>
            </div>
          </motion.div>
        </motion.div>

        <div className="relative">
          <div className="overflow-hidden rounded-xl">
            <motion.div
              className="flex transition-all duration-500 ease-out"
              style={{ transform: `translateX(-${currentIndex * (100 / itemsPerPage)}%)` }}
            >
              <AnimatePresence>
                {featuredProducts?.map((product, index) => (
                  <motion.div
                    key={product._id}
                    className="w-full sm:w-1/2 lg:w-1/3 xl:w-1/4 flex-shrink-0 px-3"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <motion.div
                      className="relative bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden border border-emerald-500/20 h-full"
                      whileHover={{ y: -5, scale: 1.02 }}
                    >
                      <div className="relative group">
                        <div className="aspect-square overflow-hidden">
                          <motion.img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-contain p-4"
                            initial={{ scale: 1 }}
                            whileHover={{ scale: 1.1 }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        {product.discountedPrice && (
                          <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded-full text-sm font-semibold">
                            %{Math.round((1 - product.discountedPrice / product.price) * 100)} İndirim
                          </div>
                        )}
                      </div>

                      <div className="p-4">
                        <motion.h3
                          className="text-lg font-semibold text-white mb-2 line-clamp-2 min-h-[3.5rem]"
                          initial={{ opacity: 0.8 }}
                          whileHover={{ opacity: 1 }}
                        >
                          {product.name}
                        </motion.h3>

                        <div className="flex items-end gap-2 mb-4">
                          {product.discountedPrice ? (
                            <>
                              <span className="text-2xl font-bold text-emerald-400">
                                ₺{product.discountedPrice.toFixed(2)}
                              </span>
                              <span className="text-sm text-gray-400 line-through">
                                ₺{product.price.toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <span className="text-2xl font-bold text-emerald-400">
                              ₺{product.price.toFixed(2)}
                            </span>
                          )}
                        </div>

                        <motion.button
                          onClick={() => handleAddToCart(product)}
                          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2.5 px-4 rounded-lg 
                            flex items-center justify-center gap-2 transition-colors duration-300"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <ShoppingCart className="w-5 h-5" />
                          Sepete Ekle
                        </motion.button>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>

          <motion.button
            onClick={prevSlide}
            disabled={isStartDisabled}
            className={`absolute top-1/2 -left-4 transform -translate-y-1/2 p-3 rounded-full shadow-lg transition-all duration-300 
              ${isStartDisabled 
                ? "bg-gray-600/50 cursor-not-allowed" 
                : "bg-emerald-500 hover:bg-emerald-600 hover:scale-110"}`}
            whileHover={!isStartDisabled ? { scale: 1.1 } : {}}
            whileTap={!isStartDisabled ? { scale: 0.9 } : {}}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </motion.button>

          <motion.button
            onClick={nextSlide}
            disabled={isEndDisabled}
            className={`absolute top-1/2 -right-4 transform -translate-y-1/2 p-3 rounded-full shadow-lg transition-all duration-300 
              ${isEndDisabled 
                ? "bg-gray-600/50 cursor-not-allowed" 
                : "bg-emerald-500 hover:bg-emerald-600 hover:scale-110"}`}
            whileHover={!isEndDisabled ? { scale: 1.1 } : {}}
            whileTap={!isEndDisabled ? { scale: 0.9 } : {}}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default FeaturedProducts;