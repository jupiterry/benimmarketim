import { useEffect, useState, useMemo } from "react";
import { useProductStore } from "../stores/useProductStore";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ProductCard from "../components/ProductCard";
import { ChevronRight, Home, Filter, SortAsc, SortDesc, Grid, List, Sparkles, ArrowUp } from "lucide-react";


const categories = [
	{ href: "/kahve", name: "Benim Kahvem", imageUrl: "/kahve.png", emoji: "☕" },
	{ href: "/category/yiyecekler", name: "Yiyecekler", imageUrl: "/foods.png", emoji: "🍕" },
	{ href: "/category/kahvalti", name: "Kahvaltılık Ürünler", imageUrl: "/kahvalti.png", emoji: "🍳" },
	{ href: "/category/gida", name: "Temel Gıda", imageUrl: "/basic.png", emoji: "🌾" },
	{ href: "/category/meyve-sebze", name: "Meyve & Sebze", imageUrl: "/fruit.png", emoji: "🍎" },
	{ href: "/category/sut", name: "Süt & Süt Ürünleri", imageUrl: "/milk.png", emoji: "🥛" },
	{ href: "/category/bespara", name: "Beş Para Etmeyen Ürünler", imageUrl: "/bespara.png", emoji: "💰" },
	{ href: "/category/tozicecekler", name: "Toz İçecekler", imageUrl: "/instant.png", emoji: "🍵" },
	{ href: "/category/cips", name: "Cips & Çerez", imageUrl: "/dd.png", emoji: "🥨" },
	{ href: "/category/cayseker", name: "Çay ve Şekerler", imageUrl: "/cay.png", emoji: "🍬" },
	{ href: "/category/atistirma", name: "Atıştırmalıklar", imageUrl: "/atistirmaa.png", emoji: "🍿" },
	{ href: "/category/temizlik", name: "Temizlik & Hijyen", imageUrl: "/clean.png", emoji: "🧹" },
	{ href: "/category/kisisel", name: "Kişisel Bakım", imageUrl: "/care.png", emoji: "🧴" },
	{ href: "/category/makarna", name: "Makarna ve Kuru Bakliyat", imageUrl: "/makarna.png", emoji: "🍝" },
	{ href: "/category/et", name: "Şarküteri & Et Ürünleri", imageUrl: "/chicken.png", emoji: "🍗" },
	{ href: "/category/icecekler", name: "Buz Gibi İçecekler", imageUrl: "/juice.png", emoji: "🧃" },
	{ href: "/category/dondurulmus", name: "Dondurulmuş Gıdalar", imageUrl: "/frozen.png", emoji: "❄️" },
	{ href: "/category/baharat", name: "Baharatlar", imageUrl: "/spices.png", emoji: "🌶️" },
  { href: "/dondurma", name: "Golf Dondurmalar", imageUrl: "/dondurma.png", emoji: "🍦" }
];

// Floating particles component
const FloatingParticles = () => {
	const particles = Array.from({ length: 20 }, (_, i) => ({
		id: i,
		size: Math.random() * 4 + 2,
		x: Math.random() * 100,
		y: Math.random() * 100,
		duration: Math.random() * 20 + 10,
		delay: Math.random() * 5,
	}));

	return (
		<div className="absolute inset-0 overflow-hidden pointer-events-none">
			{particles.map((particle) => (
				<motion.div
					key={particle.id}
					className="absolute rounded-full bg-emerald-400/20"
					style={{
						width: particle.size,
						height: particle.size,
						left: `${particle.x}%`,
						top: `${particle.y}%`,
					}}
					animate={{
						y: [-20, 20, -20],
						x: [-10, 10, -10],
						opacity: [0.2, 0.5, 0.2],
					}}
					transition={{
						duration: particle.duration,
						delay: particle.delay,
						repeat: Infinity,
						ease: "easeInOut",
					}}
				/>
			))}
		</div>
	);
};

const CategoryPage = () => {
  const { fetchProductsByCategory, products } = useProductStore();
  const { category } = useParams();
  const [filteredProducts, setFilteredProducts] = useState(products);
  const { user } = useProductStore();
  const [sortBy, setSortBy] = useState("default");
  const [viewMode, setViewMode] = useState("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Fetch products

  useEffect(() => {
    if (category) {
      fetchProductsByCategory(category.toLowerCase());
    }
  }, [fetchProductsByCategory, category]);

  useEffect(() => {
    const visibleProducts = products.filter(product => !product.isHidden);
    setFilteredProducts(visibleProducts);
  }, [products]);

  // Scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Sort products
  const sortedProducts = useMemo(() => {
    const sorted = [...filteredProducts];
    switch (sortBy) {
      case "price-asc":
        return sorted.sort((a, b) => a.price - b.price);
      case "price-desc":
        return sorted.sort((a, b) => b.price - a.price);
      case "name-asc":
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      case "name-desc":
        return sorted.sort((a, b) => b.name.localeCompare(a.name, 'tr'));
      default:
        return sorted;
    }
  }, [filteredProducts, sortBy]);

  const categoryData = categories.find((cat) => cat.href.replace("/category/", "") === category);
  const displayName = categoryData ? categoryData.name : category.charAt(0).toUpperCase() + category.slice(1);
  const categoryEmoji = categoryData?.emoji || "🛍️";

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Grid classes based on view mode
  const getGridClasses = () => {
    if (viewMode === "list") return "flex flex-col gap-4";
    return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 pt-24">
      {/* Compact Header Section */}
      <div className="relative overflow-hidden">
        {/* Subtle Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/20 via-teal-900/20 to-emerald-900/20" />
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-0 right-1/4 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl" />
        
        <div className="relative container mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <motion.nav
            className="flex items-center gap-2 text-sm mb-4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Link 
              to="/" 
              className="flex items-center gap-1 text-gray-400 hover:text-emerald-400 transition-colors"
            >
              <Home size={16} />
              <span>Ana Sayfa</span>
            </Link>
            <ChevronRight size={16} className="text-gray-600" />
            <span className="text-emerald-400 font-medium">{displayName}</span>
          </motion.nav>

          {/* Category Header - Compact Layout */}
          <motion.div
            className="flex items-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Category Icon */}
            <motion.div 
              className="relative flex-shrink-0"
              whileHover={{ scale: 1.05, rotate: 3 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-emerald-400 via-teal-500 to-green-500 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20">
                {categoryData?.imageUrl ? (
                  <img 
                    src={categoryData.imageUrl} 
                    alt={displayName}
                    className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
                  />
                ) : (
                  <span className="text-3xl sm:text-4xl">{categoryEmoji}</span>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-md">
                <Sparkles size={12} className="text-yellow-900" />
              </div>
            </motion.div>
            
            {/* Title & Count */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-green-400 bg-clip-text text-transparent truncate">
                {displayName}
              </h1>
              <p className="text-emerald-300/70 text-sm sm:text-base mt-0.5">
                {sortedProducts.length} ürün bulundu
              </p>
            </div>

            {/* Quick Stats - Hidden on Mobile */}
            <div className="hidden lg:flex items-center gap-3">
              <div className="bg-white/5 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10 flex items-center gap-2">
                <span className="text-lg">🚀</span>
                <span className="text-gray-300 text-sm">Hızlı Teslimat</span>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10 flex items-center gap-2">
                <span className="text-lg">💯</span>
                <span className="text-gray-300 text-sm">Kalite</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Sticky Filter Bar */}
      <motion.div 
        className="sticky top-[72px] z-40 bg-gray-900/80 backdrop-blur-xl border-y border-gray-700/50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left Side - Filter Toggle & Count */}
            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300 ${
                  showFilters 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Filter size={18} />
                <span className="hidden sm:inline">Filtrele</span>
              </motion.button>
              
              <div className="hidden sm:block text-gray-400 text-sm">
                <span className="text-emerald-400 font-bold">{sortedProducts.length}</span> ürün
              </div>
            </div>

            {/* Center - Sort Options */}
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-gray-800 text-gray-300 px-4 py-2 rounded-xl border border-gray-700 focus:border-emerald-500 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="default">Varsayılan Sıralama</option>
                <option value="price-asc">Fiyat: Düşükten Yükseğe</option>
                <option value="price-desc">Fiyat: Yüksekten Düşüğe</option>
                <option value="name-asc">İsim: A-Z</option>
                <option value="name-desc">İsim: Z-A</option>
              </select>
            </div>

            {/* Right Side - View Mode */}
            <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1">
              <motion.button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  viewMode === "grid" 
                    ? 'bg-emerald-500 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Grid size={18} />
              </motion.button>
              <motion.button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  viewMode === "list" 
                    ? 'bg-emerald-500 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <List size={18} />
              </motion.button>
            </div>
          </div>

          {/* Expandable Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 pb-2 flex flex-wrap gap-2">
                  <span className="text-gray-400 text-sm mr-2">Hızlı Filtreler:</span>
                  {["En Çok Satan", "Yeni Ürünler", "İndirimli", "Stokta Var"].map((filter) => (
                    <motion.button
                      key={filter}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-full border border-gray-700 hover:border-emerald-500 transition-all duration-300"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {filter}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Products Section */}
      <div className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          {/* Products Grid/List */}
          <motion.div
            className={getGridClasses()}
            layout
          >
            <AnimatePresence mode="popLayout">
              {sortedProducts?.length === 0 ? (
                <motion.div 
                  className="col-span-full"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <motion.div 
                      className="relative mb-8"
                      animate={{ 
                        y: [0, -10, 0],
                        rotate: [0, 5, -5, 0]
                      }}
                      transition={{ 
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <div className="w-32 h-32 bg-gradient-to-br from-gray-700 to-gray-600 rounded-3xl flex items-center justify-center shadow-2xl">
                        <span className="text-6xl">📦</span>
                      </div>
                      <div className="absolute -top-2 -right-2 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-xl">!</span>
                      </div>
                    </motion.div>
                    
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
                      ← Geri Dön
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                sortedProducts?.map((product, index) => (
                  <motion.div
                    key={product._id}
                    layout
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ 
                      duration: 0.4, 
                      delay: Math.min(index * 0.05, 0.5),
                      layout: { duration: 0.3 }
                    }}
                    whileHover={{ y: -5 }}
                    className={viewMode === "list" ? "w-full" : ""}
                  >
                    <ProductCard 
                      product={product} 
                      isAdmin={user?.role === 'admin'}
                      viewMode={viewMode}
                    />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-50 w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowUp size={24} className="text-white" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CategoryPage;