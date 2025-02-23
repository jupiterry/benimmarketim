import { useEffect } from "react";
import { useProductStore } from "../stores/useProductStore";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import ProductCard from "../components/ProductCard";

const categories = [
	{ href: "/yiyecekler", name: "Yiyecekler", displayName: "Lezzetli Yiyecekler", imageUrl: "/foods.png" },
	{ href: "/gida", name: "Gıda", displayName: "Sağlıklı Gıdalar", imageUrl: "/food.png" },
	{ href: "/meyve-sebze", name: "Meyve & Sebze", displayName: "Taze Meyve & Sebzeler", imageUrl: "/fruit.png" },
	{ href: "/sut", name: "Süt & Süt Ürünleri", displayName: "Doğal Süt Ürünleri", imageUrl: "/milk.png" },
	{ href: "/atistirma", name: "Atıştırmalıklar", displayName: "Lezzetli Atıştırmalıklar", imageUrl: "/atistirma.png" },
	{ href: "/temizlik", name: "Temizlik & Hijyen", displayName: "Temizlik & Kişisel Bakım", imageUrl: "/clean.png" },
	{ href: "/et", name: "Şarküteri & Et Ürünleri", displayName: "Taze Et & Şarküteri", imageUrl: "/chicken.png" },
	{ href: "/icecekler", name: "İçecek", displayName: "Serinletici İçecekler", imageUrl: "/juice.png" },
];

const CategoryPage = () => {
	const { fetchProductsByCategory, products } = useProductStore();
	const { category } = useParams();

	// URL'deki kategoriye uygun `displayName` bul
	const categoryData = categories.find((cat) => cat.href.replace("/","") === category);
	const displayName = categoryData ? categoryData.displayName : category.charAt(0).toUpperCase() + category.slice(1);

	useEffect(() => {
		if (category) {
			fetchProductsByCategory(category.toLowerCase());
		}
	}, [fetchProductsByCategory, category]);

	useEffect(() => {
	}, [products]);

	return (
		<div className='min-h-screen'>
			<div className='relative z-10 max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-16'>
				{/* Kategori Başlığı */}
				<motion.h1
					className='text-center text-4xl sm:text-5xl font-bold text-emerald-400 mb-8'
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8 }}
				>
					{displayName}
				</motion.h1>

				{/* Ürün Listesi */}
				<motion.div
					className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 justify-items-center'
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, delay: 0.2 }}
				>
					{products?.length === 0 && (
						<h2 className='text-3xl font-semibold text-gray-300 text-center col-span-full'>
							Ürün Bulunamadı
						</h2>
					)}

					{products?.map((product) => (
						<ProductCard key={product._id} product={product} />
					))}
				</motion.div>
			</div>
		</div>
	);
};

export default CategoryPage;
