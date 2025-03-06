import { useEffect, useState } from "react";
import { useProductStore } from "../stores/useProductStore";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import ProductCard from "../components/ProductCard";
import axios from "../lib/axios";

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
	{ href: "/category/dondulurmus", name: "Dondurulmuş Gıdalar", imageUrl: "/frozen.png" },
	{ href: "/category/baharat", name: "Baharatlar", imageUrl: "/spices.png" },
];


// Statik filtreler (artık tüm kategoriler için API'den çekeceğimizden gerek kalmayabilir)
const categoryFilters = {
  gida: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  temizlik: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  atistirma: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  sut: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  kahve: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  meyve: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  et: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  icecekler: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
  yiyecekler: { indirimler: ["Benim Marketim İndirimli Ürünler"] },
};

const FilterComponent = ({ onFilter, category }) => {
  const [selectedFilters, setSelectedFilters] = useState({
    marka: [],
    indirim: false,
  });
  const [dynamicBrands, setDynamicBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false); // Mobile için filtre açma/kapama

  // API'den markaları çekme (tüm kategoriler için)
  useEffect(() => {
    const fetchBrands = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/products/brands/${category}`);
        console.log(`${category} için API yanıtı:`, response.data);
        setDynamicBrands(response.data.brands || []);
      } catch (error) {
        console.error("Markalar çekilirken hata oluştu:", error);
        setError("Markalar yüklenemedi.");
      } finally {
        setLoading(false);
      }
    };
    fetchBrands();
  }, [category]);

  // Alfabetik sıralama ve arama filtreleme
  const filteredBrands = dynamicBrands
    .filter(brand => brand.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.localeCompare(b)); // Alfabetik sıralama

  const filtersForCategory = {
    markalar: filteredBrands, // API'den gelen ve filtrelenmiş markalar
    indirimler: categoryFilters[category]?.indirimler || ["Benim Marketim İndirimli Ürünler"], // Varsayılan indirim
  };

  const handleFilterChange = (filterType, value) => {
    const newFilters = { ...selectedFilters };
    if (filterType === "indirim") {
      newFilters.indirim = value;
    } else {
      if (newFilters[filterType].includes(value)) {
        newFilters[filterType] = newFilters[filterType].filter((item) => item !== value);
      } else {
        newFilters[filterType].push(value);
      }
    }
    setSelectedFilters(newFilters);
    onFilter(newFilters);
  };

  return (
    <div className="filter-section">
      {/* Mobile Filtre Butonu */}
      <button
        onClick={() => setIsFilterOpen(!isFilterOpen)}
        className="lg:hidden w-full bg-emerald-500 text-white p-3 rounded-lg mb-4 flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
        </svg>
        Filtreleri Göster
      </button>

      <div className={`lg:block ${isFilterOpen ? 'block' : 'hidden'} bg-gray-800/90 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-gray-700`}>
        <div className="relative">
          <input
            type="text"
            placeholder="Marka ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 rounded-xl bg-gray-700/50 border border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mt-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="mt-6">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Markalar
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {filteredBrands.map((marka) => (
                  <label key={marka} className="flex items-center gap-3 p-2 hover:bg-gray-700/30 rounded-lg transition-colors cursor-pointer group">
                    <div className="relative w-5 h-5">
                      <input
                        type="checkbox"
                        checked={selectedFilters.marka.includes(marka)}
                        onChange={() => handleFilterChange("marka", marka)}
                        className="peer absolute opacity-0 w-5 h-5 cursor-pointer"
                      />
                      <div className="absolute top-0 left-0 w-5 h-5 border-2 border-gray-500 rounded peer-checked:border-emerald-500 peer-checked:bg-emerald-500 transition-all">
                        <svg className="w-3 h-3 absolute top-0.5 left-0.5 text-white scale-0 peer-checked:scale-100 transition-transform" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13.7071 4.29289C14.0976 4.68342 14.0976 5.31658 13.7071 5.70711L7.70711 11.7071C7.31658 12.0976 6.68342 12.0976 6.29289 11.7071L2.29289 7.70711C1.90237 7.31658 1.90237 6.68342 2.29289 6.29289C2.68342 5.90237 3.31658 5.90237 3.70711 6.29289L7 9.58579L12.2929 4.29289C12.6834 3.90237 13.3166 3.90237 13.7071 4.29289Z" fill="currentColor"/>
                        </svg>
                      </div>
                    </div>
                    <span className="text-gray-300 group-hover:text-white transition-colors">{marka}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.616a1 1 0 01.894-1.79l1.599.8L9 4.323V3a1 1 0 011-1zm-5 8.274l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L5 10.274zm10 0l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L15 10.274z" clipRule="evenodd" />
                </svg>
                İndirimler
              </h3>
              <div className="space-y-2">
                {filtersForCategory.indirimler.map((indirim) => (
                  <label key={indirim} className="flex items-center gap-3 p-2 hover:bg-gray-700/30 rounded-lg transition-colors cursor-pointer group">
                    <div className="relative w-5 h-5">
                      <input
                        type="checkbox"
                        checked={selectedFilters.indirim}
                        onChange={(e) => handleFilterChange("indirim", e.target.checked)}
                        className="peer absolute opacity-0 w-5 h-5 cursor-pointer"
                      />
                      <div className="absolute top-0 left-0 w-5 h-5 border-2 border-gray-500 rounded peer-checked:border-emerald-500 peer-checked:bg-emerald-500 transition-all">
                        <svg className="w-3 h-3 absolute top-0.5 left-0.5 text-white scale-0 peer-checked:scale-100 transition-transform" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13.7071 4.29289C14.0976 4.68342 14.0976 5.31658 13.7071 5.70711L7.70711 11.7071C7.31658 12.0976 6.68342 12.0976 6.29289 11.7071L2.29289 7.70711C1.90237 7.31658 1.90237 6.68342 2.29289 6.29289C2.68342 5.90237 3.31658 5.90237 3.70711 6.29289L7 9.58579L12.2929 4.29289C12.6834 3.90237 13.3166 3.90237 13.7071 4.29289Z" fill="currentColor"/>
                        </svg>
                      </div>
                    </div>
                    <span className="text-gray-300 group-hover:text-white transition-colors">{indirim}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const CategoryPage = () => {
  const { fetchProductsByCategory, products } = useProductStore();
  const { category } = useParams();
  const [filteredProducts, setFilteredProducts] = useState(products);
  const { user } = useProductStore();

  const handleFilter = (filters) => {
    let filtered = products;

    if (filters.marka.length > 0) {
      filtered = filtered.filter((product) => filters.marka.includes(product.brand));
    }

    if (filters.indirim) {
      filtered = filtered.filter((product) => product.discounted);
    }

    setFilteredProducts(filtered);
  };

  useEffect(() => {
    if (category) {
      fetchProductsByCategory(category.toLowerCase());
    }
  }, [fetchProductsByCategory, category]);

  useEffect(() => {
    setFilteredProducts(products);
  }, [products]);

  const categoryData = categories.find((cat) => cat.href.replace("/category/", "") === category);
  const displayName = categoryData ? categoryData.name : category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Filtreleme Bileşeni */}
          <div className="lg:col-span-1 sticky top-24 h-fit">
            <FilterComponent onFilter={handleFilter} category={category} />
          </div>

          {/* Kategori Başlığı ve Ürün Listesi */}
          <div className="lg:col-span-4">
            <motion.div
              className="relative mb-12"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="text-center text-4xl sm:text-5xl font-bold text-white">
                {displayName}
              </h1>
              <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-24 h-1 bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full"></div>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              {filteredProducts?.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 px-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <h2 className="text-2xl font-medium text-gray-400 text-center">
                    Ürün Bulunamadı
                  </h2>
                  <p className="mt-2 text-gray-500 text-center max-w-md">
                    Seçtiğiniz filtrelere uygun ürün bulunmamaktadır. Lütfen farklı filtreler deneyiniz.
                  </p>
                </div>
              ) : (
                filteredProducts?.map((product) => (
                  <ProductCard 
                    key={product._id} 
                    product={product} 
                    isAdmin={user?.role === 'admin'} 
                  />
                ))
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryPage;