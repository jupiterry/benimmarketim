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
    setFilteredProducts(products);
  }, [products]);

  const categoryData = categories.find((cat) => cat.href.replace("/category/", "") === category);
  const displayName = categoryData ? categoryData.name : category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 md:pt-28 pb-16">
        <motion.div
          className="relative mb-8 sm:mb-12 flex flex-col items-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
            {displayName}
          </h1>
          <div className="mt-4 w-24 h-1 bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full"></div>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6"
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
  );
};

export default CategoryPage;