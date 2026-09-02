import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import { motion } from "framer-motion";
import { Search, PackageSearch, ArrowLeft, Brain, SortAsc } from "lucide-react";

const SearchResultsPage = () => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [smartSorting, setSmartSorting] = useState(true);
  const [originalProducts, setOriginalProducts] = useState([]);
  const location = useLocation();
  const query = new URLSearchParams(location.search).get("q");

  // Flexbox ile responsive grid - boş alan olmayacak
  const getGridClasses = (productCount) => {
    // productCount undefined, null veya 0 ise varsayılan değer döndür
    if (!productCount || productCount === 0) return "flex flex-col items-center";
    if (productCount === 1) return "flex justify-center";
    if (productCount === 2) return "flex flex-col sm:flex-row gap-4 justify-center";
    if (productCount === 3) return "flex flex-col sm:flex-row md:grid md:grid-cols-3 gap-4";
    if (productCount === 4) return "grid grid-cols-2 md:grid-cols-4 gap-4";
    if (productCount === 5) return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4";
    if (productCount === 6) return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4";
    // 7+ ürün için standart grid
    return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";
  };

  useEffect(() => {
    const fetchSearchResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Arama terimini temizle ve encode et
        const cleanQuery = query.trim();
        if (!cleanQuery) {
          setProducts([]);
          setIsLoading(false);
          return;
        }
        
        const res = await axios.get(`/products/search?q=${encodeURIComponent(cleanQuery)}`);
        console.log("API Yanıtı:", res.data);
        
        if (!res.data || !res.data.success) {
          throw new Error(res.data?.message || "API'den geçerli veri alınamadı");
        }

        const searchResults = res.data.products || [];
        console.log("Arama Sonuçları:", searchResults);
        // Gizlenen ürünleri filtrele ve null/undefined kontrolü yap
        const visibleProducts = (searchResults || []).filter(product => 
          product && 
          !product.isHidden && 
          product.name && 
          typeof product.name === 'string'
        );
        setProducts(visibleProducts);
        setOriginalProducts(visibleProducts);
      } catch (error) {
        console.error("Arama sonuçları alınamadı:", error);
        setError(error.response?.data?.message || error.message || "Ürünler yüklenirken bir hata oluştu");
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (query) {
      fetchSearchResults();
    }
  }, [query]);

  // Akıllı sıralama toggle fonksiyonu
  const toggleSmartSorting = () => {
    if (smartSorting) {
      // Akıllı sıralamayı kapat - alfabetik sıralama
      const sortedProducts = [...originalProducts].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setProducts(sortedProducts);
    } else {
      // Akıllı sıralamayı aç - backend'den gelen sıralama
      setProducts(originalProducts);
    }
    setSmartSorting(!smartSorting);
  };

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
        {/* Gelişmiş Arama Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 backdrop-blur-xl rounded-2xl p-6 mb-8 border border-emerald-500/20"
        >
          <div className="flex items-center gap-3 sm:gap-4 mb-4">
            <button
              onClick={() => window.history.back()}
              className="p-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="w-5 h-5 text-emerald-400" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <Search className="w-6 h-6 text-emerald-400" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Arama Sonuçları
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-sm sm:text-base text-gray-300">
                  <span className="font-semibold text-emerald-400">&quot;{query}&quot;</span> için 
                  <span className="mx-2 px-3 py-1 bg-emerald-500/20 rounded-full text-emerald-300 font-bold">
                    {products?.length || 0}
                  </span>
                  sonuç bulundu
                </p>
                {(products?.length || 0) > 0 && (
                  <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                    <span>Akıllı sıralama aktif</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Arama İpuçları */}
          {(products?.length || 0) === 0 && !isLoading && (
            <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <h3 className="text-yellow-400 font-semibold mb-2">💡 Arama İpuçları:</h3>
              <ul className="text-sm text-yellow-200 space-y-1">
                <li>• Daha genel terimler kullanın (örn: "et" yerine "tavuk")</li>
                <li>• Ürün kategorisini deneyin (örn: "kahve", "süt")</li>
                <li>• Marka adı yazın (örn: "nescafe", "sütaş")</li>
              </ul>
            </div>
          )}
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
        ) : (products?.length || 0) > 0 ? (
          <div>
            {/* Sonuç İstatistikleri */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${smartSorting ? 'bg-emerald-400' : 'bg-blue-400'}`}></div>
                    <span className="text-sm text-gray-300">
                      {smartSorting ? 'Akıllı sıralama aktif' : 'Alfabetik sıralama aktif'}
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
                    <span>{smartSorting ? 'Skorlama sistemi aktif' : 'A-Z sıralama'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleSmartSorting}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ${
                      smartSorting 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {smartSorting ? <Brain className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
                    <span className="text-sm font-medium">
                      {smartSorting ? 'Akıllı' : 'Alfabetik'}
                    </span>
                  </button>
                  <div className="text-sm text-emerald-400 font-semibold">
                    {products?.length || 0} ürün
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Ürün Grid */}
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className={getGridClasses(products && Array.isArray(products) ? products.length : 0)}
            >
              {(products || []).map((product, index) => (
                <motion.div 
                  key={product._id} 
                  variants={item}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="w-full"
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </motion.div>
          </div>
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
