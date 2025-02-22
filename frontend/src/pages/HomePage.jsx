import { useEffect } from "react";
import CategoryItem from "../components/CategoryItem";
import { useProductStore } from "../stores/useProductStore";
import FeaturedProducts from "../components/FeaturedProducts";

const categories = [
	{ href: "/gida", name: "Gıda", displayName: "Sağlıklı Gıdalar", imageUrl: "/food.png" },
	{ href: "/meyve-sebze", name: "Meyve & Sebze", displayName: "Taze Meyve & Sebzeler", imageUrl: "/fruit.png" },
	{ href: "/sut", name: "Süt & Süt Ürünleri", displayName: "Doğal Süt Ürünleri", imageUrl: "/milk.png" },
	{ href: "/atistirma", name: "Atıştırmalıklar", displayName: "Lezzetli Atıştırmalıklar", imageUrl: "/atistirma.png" },
	{ href: "/temizlik", name: "Temizlik & Hijyen", displayName: "Temizlik & Kişisel Bakım", imageUrl: "/clean.png" },
	{ href: "/et", name: "Şarküteri & Et Ürünleri", displayName: "Taze Et & Şarküteri", imageUrl: "/chicken.png" },
	{ href: "/icecekler", name: "İçecek", displayName: "Serinletici İçecekler", imageUrl: "/juice.png" },
];

const HomePage = () => {
	const { fetchFeaturedProducts, products, isLoading } = useProductStore();

	useEffect(() => {
		fetchFeaturedProducts();
	}, [fetchFeaturedProducts]);

	return (
		<div className='relative min-h-screen text-white overflow-hidden'>
			<div className='relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16'>
				<h1 className='text-center text-5xl sm:text-6xl font-bold text-emerald-400 mb-4'>
					Alışverişin En Kolay Yolu, Benim Marketim!
				</h1>
				<p className='text-center text-xl text-gray-300 mb-12'>En yeni ürünleri keşfedin</p>
				{/* Kategoriler */}
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8'>
					{categories.map((category) => (
						<CategoryItem category={category} key={category.href} />
					))}
				</div>

				{/* Öne Çıkan Ürünler */}
				{!isLoading && products.length > 0 && <FeaturedProducts featuredProducts={products} />}
			</div>
		</div>
	);
};

export default HomePage;