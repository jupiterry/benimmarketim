import { useEffect, useState } from "react";
import { useProductStore } from "../stores/useProductStore";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import ProductCard from "../components/ProductCard";


const categories = [
	{ href: "/kahve", name: "Benim Kahvem", imageUrl: "/kahve.png" },
	{ href: "/category/yiyecekler", name: "Yiyecekler", imageUrl: "/foods.png" },
	{ href: "/category/kahvalti", name: "Kahvaltılık Ürünler", imageUrl: "/kahvalti.png" },
	{ href: "/category/gida", name: "Temel Gıda", imageUrl: "/basic.png" },
	{ href: "/category/meyve-sebze", name: "Meyve & Sebze", imageUrl: "/fruit.png" },
	{ href: "/category/sut", name: "Süt & Süt Ürünleri", imageUrl: "/milk.png" },
	{ href: "/category/bespara", name: "Beş Para Etmeyen Ürünler", imageUrl: "/bespara.png" },
	{ href: "/category/tozicecekler", name: "Toz İçecekler", imageUrl: "/instant.png" },
	{ href: "/category/cips", name: "Cips & Çerez", imageUrl: "/dd.png" },
	{ href: "/category/cayseker", name: "Çay ve Şekerler", imageUrl: "/cay.png" },
	{ href: "/category/atistirma", name: "Atıştırmalıklar", imageUrl: "/atistirmaa.png" },
	{ href: "/category/temizlik", name: "Temizlik & Hijyen", imageUrl: "/clean.png" },
	{ href: "/category/kisisel", name: "Kişisel Bakım", imageUrl: "/care.png" },
	{ href: "/category/makarna", name: "Makarna ve Kuru Bakliyat", imageUrl: "/makarna.png" },
	{ href: "/category/et", name: "Şarküteri & Et Ürünleri", imageUrl: "/chicken.png" },
	{ href: "/category/icecekler", name: "Buz Gibi İçecekler", imageUrl: "/juice.png" },
	{ href: "/category/dondurulmus", name: "Dondurulmuş Gıdalar", imageUrl: "/frozen.png" },
	{ href: "/category/baharat", name: "Baharatlar", imageUrl: "/spices.png" },
  { href: "/dondurma", name: "Golf Dondurmalar", imageUrl: "/dondurma.png" }
];

const CategoryPage = () => {
  const { fetchProductsByCategory, products } = useProductStore();
  const { category } = useParams();
  const [filteredProducts, setFilteredProducts] = useState(products);
  const { user } = useProductStore();


  useEffect(() => {
    if (category) {
      fetchProductsByCategory(category.toLowerCase());
    }
  }, [fetchProductsByCategory, category]);

  useEffect(() => {
    // Gizlenen ürünleri filtrele
    const visibleProducts = products.filter(product => !product.isHidden);
    setFilteredProducts(visibleProducts);
  }, [products]);

  const categoryData = categories.find((cat) => cat.href.replace("/category/", "") === category);
  const displayName = categoryData ? categoryData.name : category.charAt(0).toUpperCase() + category.slice(1);

  // Flexbox ile responsive grid - boş alan olmayacak
  const getGridClasses = (productCount) => {
    if (productCount === 0) return "flex flex-col items-center";
    if (productCount === 1) return "flex justify-center";
    if (productCount === 2) return "flex flex-col sm:flex-row gap-4 justify-center";
    if (productCount === 3) return "flex flex-col sm:flex-row md:grid md:grid-cols-3 gap-4";
    if (productCount === 4) return "grid grid-cols-2 md:grid-cols-4 gap-4";
    if (productCount === 5) return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4";
    if (productCount === 6) return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4";
    // 7+ ürün için standart grid
    return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Hero Section */}
      <div className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/30 via-teal-900/30 to-emerald-900/30"></div>
        <div className="absolute top-10 left-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-24 h-24 bg-teal-500/20 rounded-full blur-xl animate-pulse delay-1000"></div>
        
        <div className="relative container mx-auto px-4 pt-16">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              className="inline-flex items-center gap-4 mb-6"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              {categoryData?.imageUrl && (
                <div className="w-16 h-16 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full flex items-center justify-center shadow-2xl">
                  <img 
                    src={categoryData.imageUrl} 
                    alt={displayName}
                    className="w-10 h-10 object-contain"
                  />
                </div>
              )}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-green-400 bg-clip-text text-transparent">
                {displayName}
              </h1>
              <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-green-500 rounded-full flex items-center justify-center shadow-2xl">
                <span className="text-2xl">🛍️</span>
              </div>
            </motion.div>
            
            <motion.p 
              className="text-xl text-emerald-100 mb-8 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              {filteredProducts.length} ürün bulundu ✨
            </motion.p>
          </motion.div>
        </div>
      </div>

      <div className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {/* Ürünler Grid */}
          <motion.div
            className={getGridClasses(filteredProducts?.length || 0)}
            initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {filteredProducts?.length === 0 ? (
            <div className="col-span-full">
              <motion.div 
                className="flex flex-col items-center justify-center py-20 px-4"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                <div className="relative mb-8">
                  <div className="w-32 h-32 bg-gradient-to-r from-gray-700 to-gray-600 rounded-full flex items-center justify-center shadow-2xl">
                    <span className="text-6xl">📦</span>
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xl">❌</span>
                  </div>
                </div>
                
                <h2 className="text-3xl font-bold text-gray-300 text-center mb-4">
                  Ürün Bulunamadı
                </h2>
                <p className="text-gray-400 text-center max-w-md text-lg leading-relaxed mb-8">
                  Bu kategoride henüz ürün bulunmuyor. Yakında yeni ürünler eklenecek! 🚀
                </p>
                
                <motion.button
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-emerald-500/25"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => window.history.back()}
                >
                  🔙 Geri Dön
                </motion.button>
              </motion.div>
            </div>
          ) : (
            filteredProducts?.map((product, index) => (
              <motion.div
                key={product._id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
              >
                <ProductCard 
                  product={product} 
                  isAdmin={user?.role === 'admin'} 
                />
              </motion.div>
            ))
          )}
        </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default CategoryPage;