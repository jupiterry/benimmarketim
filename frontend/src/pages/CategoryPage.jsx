import { useEffect, useState } from "react";
import { useProductStore } from "../stores/useProductStore";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import ProductCard from "../components/ProductCard";
import axios from "../lib/axios";

const categories = [
  { href: "/kahve", name: "Benim Kahvem", displayName: "Benim Kahvem", imageUrl: "/kahve.png" },
  { href: "/yiyecekler", name: "Yiyecekler", displayName: "Lezzetli Yiyecekler", imageUrl: "/foods.png" },
  { href: "/kahvalti", name: "Kahvaltılık Ürünler", displayName: "Kahvaltılık Ürünler", imageUrl: "/foods.png" },
  { href: "/gida", name: "Temel Gıda", displayName: "Temel Gıda", imageUrl: "/food.png" },
  { href: "/meyve-sebze", name: "Meyve & Sebze", displayName: "Taze Meyve & Sebzeler", imageUrl: "/fruit.png" },
  { href: "/sut", name: "Süt & Süt Ürünleri", displayName: "Doğal Süt Ürünleri", imageUrl: "/milk.png" },
  { href: "/bespara", name: "Beş Para Etmeyen Ürünler", displayName: "Beş Para Etmeyen Ürünler", imageUrl: "/milk.png" },
  { href: "/tozicecekler", name: "Toz İçecekler", displayName: "Toz İçecekler", imageUrl: "/kahve.png" },
  { href: "/cips", name: "Cips & Çerez", displayName: "Cips & Çerez", imageUrl: "/kahve.png" },
  { href: "/cayseker", name: "Çay ve Şekerler", displayName: "Çay ve Şekerler", imageUrl: "/kahve.png" },
  { href: "/atistirma", name: "Atıştırmalıklar", displayName: "Lezzetli Atıştırmalıklar", imageUrl: "/atistirma.png" },
  { href: "/temizlik", name: "Temizlik & Hijyen", displayName: "Temizlik & Kişisel Bakım", imageUrl: "/clean.png" },
  { href: "/kisisel", name: "Kişisel Bakım", displayName: "Kişisel Bakım", imageUrl: "/clean.png" },
  { href: "/makarna", name: "Makarna ve Kuru Bakliyat", displayName: "Makarna ve Kuru Bakliyat", imageUrl: "/kahve.png" },
  { href: "/et", name: "Şarküteri & Et Ürünleri", displayName: "Taze Et & Şarküteri", imageUrl: "/chicken.png" },
  { href: "/icecekler", name: "İçecek", displayName: "Serinletici İçecekler", imageUrl: "/juice.png" },
  { href: "/dondulurmus", name: "Dondurulmuş Gıdalar", displayName: "Dondurulmuş Gıdalar", imageUrl: "/juice.png" },
  { href: "/baharat", name: "Baharatlar", displayName: "Baharatlar", imageUrl: "/juice.png" },
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
  const [dynamicBrands, setDynamicBrands] = useState([]); // API'den gelen markalar
  const [loading, setLoading] = useState(false); // Yükleme durumu
  const [error, setError] = useState(null); // Hata durumu
  const [searchTerm, setSearchTerm] = useState(""); // Arama terimi için state

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
    <div className="filter-section bg-emerald-800 p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">Markalar</h3>
      <input
        type="text"
        placeholder="Marka ara..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full p-2 mb-4 rounded border border-emerald-300 text-black" 
      />
      {loading && <p>Yükleniyor...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && filteredBrands.length === 0 && (
        <p>Bu kategoride marka bulunamadı.</p>
      )}
      {!loading && !error && filteredBrands.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto"> {/* Liste yüksekliğini 60px ile sınırlayıp kaydırma çubuğu ekleme */}
          {filteredBrands.map((marka) => (
            <label key={marka} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedFilters.marka.includes(marka)}
                onChange={() => handleFilterChange("marka", marka)}
                className="form-checkbox h-5 w-5 text-emerald-400"
              />
              <span>{marka}</span>
            </label>
          ))}
        </div>
      )}

      <h3 className="text-lg font-semibold mt-6 mb-4">İndirimler</h3>
      <div className="space-y-2">
        {filtersForCategory.indirimler.map((indirim) => (
          <label key={indirim} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectedFilters.indirim}
              onChange={(e) => handleFilterChange("indirim", e.target.checked)}
              className="form-checkbox h-5 w-5 text-emerald-400"
            />
            <span>{indirim}</span>
          </label>
        ))}
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

  const categoryData = categories.find((cat) => cat.href.replace("/", "") === category);
  const displayName = categoryData ? categoryData.displayName : category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div className="min-h-screen">
      <div className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Filtreleme Bileşeni - Sola Hizalı */}
          <div className="lg:col-span-1">
            <FilterComponent onFilter={handleFilter} category={category} />
          </div>

          {/* Kategori Başlığı ve Ürün Listesi - Ortaya Hizalı, 5 Kolonlu */}
          <div className="lg:col-span-4">
            <motion.h1
              className="text-center text-4xl sm:text-5xl font-bold text-emerald-400 mb-8"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              {displayName}
            </motion.h1>

            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 justify-items-center" // 5 kolonlu ve ortalanmış
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              {filteredProducts?.length === 0 && (
                <h2 className="text-3xl font-semibold text-gray-300 text-center col-span-full">
                  Ürün Bulunamadı
                </h2>
              )}

              {filteredProducts?.map((product) => (
                <ProductCard 
                  key={product._id} 
                  product={product} 
                  isAdmin={user?.role === 'admin'} 
                />
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryPage;