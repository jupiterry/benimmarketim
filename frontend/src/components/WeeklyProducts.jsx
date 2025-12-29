import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Tag, Loader } from "lucide-react";
import axios from "../lib/axios";
import { Link } from "react-router-dom";

const WeeklyProducts = () => {
  const [weeklyProducts, setWeeklyProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeeklyProducts();
  }, []);

  const fetchWeeklyProducts = async () => {
    try {
      const response = await axios.get("/weekly-products");
      if (response.data.success) {
        setWeeklyProducts(response.data.weeklyProducts || []);
      }
    } catch (error) {
      console.error("Haftalık ürünler yüklenirken hata:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (weeklyProducts.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
          <Calendar className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Haftalık Ürünler</h2>
          <p className="text-gray-400 text-sm">Bu haftanın indirimli ürünleri</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {weeklyProducts.map((wp, index) => (
          <motion.div
            key={wp._id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group relative bg-gray-800/50 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-emerald-500/30 transition-all duration-300"
          >
            {/* Discount Badge */}
            <div className="absolute top-3 left-3 z-10">
              <div className="flex items-center gap-1 px-2 py-1 bg-red-500 rounded-lg">
                <Tag className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-bold">
                  %{wp.discountPercentage}
                </span>
              </div>
            </div>

            {/* Product Image */}
            <Link to={`/product/${wp.product?._id}`}>
              <div className="aspect-square overflow-hidden">
                <img
                  src={wp.product?.image || wp.product?.thumbnail}
                  alt={wp.product?.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  onError={(e) => {
                    e.target.src = "/placeholder-product.jpg";
                  }}
                />
              </div>
            </Link>

            {/* Product Info */}
            <div className="p-4">
              <Link to={`/product/${wp.product?._id}`}>
                <h3 className="text-white font-medium line-clamp-2 mb-2 group-hover:text-emerald-400 transition-colors">
                  {wp.product?.name}
                </h3>
              </Link>

              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-lg font-bold">
                  ₺{wp.weeklyPrice?.toFixed(2)}
                </span>
                <span className="text-gray-500 text-sm line-through">
                  ₺{wp.product?.price?.toFixed(2)}
                </span>
              </div>

              <p className="text-gray-500 text-xs mt-1">
                {(wp.product?.price - wp.weeklyPrice)?.toFixed(2)}₺ tasarruf
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default WeeklyProducts;
