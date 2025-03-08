import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import { motion } from "framer-motion";
import { Search, PackageSearch, ArrowLeft } from "lucide-react";

const SearchResultsPage = () => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();
  const query = new URLSearchParams(location.search).get("q");

  useEffect(() => {
    const fetchSearchResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await axios.get(`/api/products/search?q=${query}`);
        console.log("API Yanıtı:", res.data);
        
        if (!res.data || !Array.isArray(res.data.products)) {
          throw new Error("API'den geçerli veri alınamadı");
        }

        const visibleProducts = res.data.products.filter(product => !product.isHidden);
        console.log("Filtrelenmiş Ürünler:", visibleProducts);
        setProducts(visibleProducts);
      } catch (error) {
        console.error("Arama sonuçları alınamadı:", error);
        setError(error.message || "Ürünler yüklenirken bir hata oluştu");
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (query) {
      fetchSearchResults();
    }
  }, [query]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-900 to-gray-800 text-white pt-32">
      <div className="max-w-[2000px] mx-auto px-4 sm:px-6 h-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 sm:gap-4 mb-6"
        >
          <button
            onClick={() => window.history.back()}
            className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-emerald-400" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <Search className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" />
              <h1 className="text-2xl sm:text-3xl font-bold text-emerald-400">
                Arama Sonuçları
              </h1>
            </div>
            <p className="text-sm sm:text-base text-gray-400">
              &quot;{query}&quot; için {products.length} sonuç bulundu
            </p>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-400 mb-4" />
            <p className="text-gray-400">Ürünler yükleniyor...</p>
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-center"
          >
            <PackageSearch className="w-16 h-16 text-red-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-red-400">Bir Hata Oluştu</h2>
            <p className="text-gray-400 max-w-md">
              {error}. Lütfen daha sonra tekrar deneyin.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white transition-colors"
            >
              Tekrar Dene
            </button>
          </motion.div>
        ) : products.length > 0 ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4"
          >
            {products.map((product) => (
              <motion.div 
                key={product._id} 
                variants={item} 
                className="w-full"
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-center"
          >
            <PackageSearch className="w-16 h-16 text-gray-600 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ürün Bulunamadı</h2>
            <p className="text-gray-400 max-w-md">
              &quot;{query}&quot; ile ilgili ürün bulunamadı. Lütfen farklı anahtar kelimelerle tekrar deneyin.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SearchResultsPage;