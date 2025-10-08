import { useEffect, useRef } from "react";
import CategoryItem from "../components/CategoryItem";
import { useProductStore } from "../stores/useProductStore";
import FeaturedProducts from "../components/FeaturedProducts";
import { motion } from "framer-motion";
import { ShoppingCart, Sparkles, TrendingUp, Clock, Gift } from "lucide-react";

const categories = [
	{ href: "/kahve", name: "Benim Kahvem", imageUrl: "/kahve.png" },
	{ href: "/yiyecekler", name: "Yiyecekler", imageUrl: "/foods.png" },
	{ href: "/kahvalti", name: "Kahvaltılık Ürünler", imageUrl: "/kahvalti.png" },
	{ href: "/gida", name: "Temel Gıda", imageUrl: "/basic.png" },
	{ href: "/meyve-sebze", name: "Meyve & Sebze", imageUrl: "/fruit.png" },
	{ href: "/sut", name: "Süt & Süt Ürünleri", imageUrl: "/milk.png" },
	{ href: "/bespara", name: "Beş Para Etmeyen Ürünler", imageUrl: "/bespara.png" },
	{ href: "/tozicecekler", name: "Toz İçecekler", imageUrl: "/instant.png" },
	{ href: "/cips", name: "Cips & Çerez", imageUrl: "/dd.png" },
	{ href: "/cayseker", name: "Çay ve Şekerler", imageUrl: "/cay.png" },
	{ href: "/atistirma", name: "Atıştırmalıklar", imageUrl: "/atistirmaa.png" },
	{ href: "/temizlik", name: "Temizlik & Hijyen", imageUrl: "/clean.png" },
	{ href: "/kisisel", name: "Kişisel Bakım", imageUrl: "/care.png" },
	{ href: "/makarna", name: "Makarna ve Kuru Bakliyat", imageUrl: "/makarna.png" },
	{ href: "/et", name: "Şarküteri & Et Ürünleri", imageUrl: "/chicken.png" },
	{ href: "/icecekler", name: "Buz Gibi İçecekler", imageUrl: "/juice.png" },
	{ href: "/dondurulmus", name: "Dondurulmuş Gıdalar", imageUrl: "/frozen.png" },
	{ href: "/baharat", name: "Baharatlar", imageUrl: "/spices.png" },
	{ href: "/dondurma", name: "Golf Dondurmalar", imageUrl: "/dondurma.png" }
];

const announcements = [
	{
		title: "Süper Fırsat!",
		description: "Seçili ürünlerde %50'ye varan indirimler",
		icon: <Gift className="w-6 h-6 text-emerald-400" />,
		color: "from-purple-600 to-blue-600"
	},
	{
		title: "Yeni Üyelere Özel",
		description: "250₺ Üzerine İlk Siparişinizde Altıncezve Oralet Hediye",
		icon: <Sparkles className="w-6 h-6 text-yellow-400" />,
		color: "from-orange-600 to-red-600"
	},
	{
		title: "Hızlı Teslimat",
		description: "45 dakika içinde kapınızda",
		icon: <Clock className="w-6 h-6 text-emerald-400" />,
		color: "from-emerald-600 to-teal-600"
	}
];

const HomePage = () => {
	const { fetchFeaturedProducts, products, isLoading } = useProductStore();
	const categoriesRef = useRef(null);
	const featuredRef = useRef(null);

	useEffect(() => {
		fetchFeaturedProducts();
	}, [fetchFeaturedProducts]);

	const scrollToCategories = () => {
		categoriesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	const scrollToFeatured = () => {
		featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
		<div className='relative min-h-screen text-white'>
			{/* Hero Section - Muhteşem Tasarım */}
			<div className="relative min-h-[100vh] sm:h-[800px] overflow-hidden">
				{/* Arka Plan Gradient */}
				<div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-700 to-teal-800"></div>
				<div className="absolute inset-0 bg-gradient-to-t from-gray-900/50 via-transparent to-transparent"></div>
				
				{/* Floating Shapes */}
				<div className="absolute top-20 left-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
				<div className="absolute top-40 right-20 w-24 h-24 bg-teal-500/20 rounded-full blur-xl animate-pulse delay-1000"></div>
				<div className="absolute bottom-40 left-20 w-40 h-40 bg-green-500/20 rounded-full blur-xl animate-pulse delay-2000"></div>
				
				<motion.div 
					className="relative z-10 min-h-full flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 py-8 sm:py-16"
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8 }}
				>
					{/* Ana Başlık */}
					<motion.div
						className="mb-8"
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.8, delay: 0.2 }}
					>
						<div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8">
							<div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full flex items-center justify-center shadow-2xl">
								<ShoppingCart className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
							</div>
							<h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-green-400 bg-clip-text text-transparent text-center leading-tight">
								Benim Marketim
							</h1>
							<div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-teal-500 to-green-500 rounded-full flex items-center justify-center shadow-2xl">
								<span className="text-3xl sm:text-4xl">🛍️</span>
							</div>
						</div>
					</motion.div>

					{/* Alt Başlık */}
					<motion.p 
						className="text-lg sm:text-xl md:text-2xl text-emerald-100 mb-8 sm:mb-12 max-w-3xl leading-relaxed"
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.4, duration: 0.8 }}
					>
						Alışverişin en kolay ve hızlı yolu! ✨<br />
						<span className="text-emerald-300">Kaliteli ürünler, uygun fiyatlar, hızlı teslimat</span> 🚀
					</motion.p>

					{/* CTA Butonları */}
					<motion.div 
						className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-8 sm:mb-12"
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.6, duration: 0.8 }}
					>
						<motion.button 
							onClick={scrollToCategories}
							whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)" }}
							whileTap={{ scale: 0.95 }}
							className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-2xl transition-all duration-300 w-full sm:w-auto"
						>
							<motion.div
								whileHover={{ rotate: 360 }}
								transition={{ duration: 0.5 }}
							>
								<ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
							</motion.div>
							Alışverişe Başla
							<span className="text-xl sm:text-2xl">🛒</span>
						</motion.button>
						
						<motion.button 
							onClick={scrollToFeatured}
							whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(251, 191, 36, 0.4)" }}
							whileTap={{ scale: 0.95 }}
							className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-2xl transition-all duration-300 w-full sm:w-auto"
						>
							<Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
							Öne Çıkanlar
							<span className="text-xl sm:text-2xl">⭐</span>
						</motion.button>
					</motion.div>

					{/* Özel Fırsatlar - Hero Section İçinde */}
					<motion.div 
						className="mt-8 sm:mt-16"
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.8, duration: 0.8 }}
					>
						<h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-6 sm:mb-8 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
							🎉 Özel Fırsatlar
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
							{announcements.map((announcement, index) => (
								<motion.div
									key={index}
									className={`relative overflow-hidden rounded-2xl p-4 sm:p-6 bg-gradient-to-br ${announcement.color} shadow-2xl border border-white/20`}
									initial={{ opacity: 0, y: 30 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 1.0 + index * 0.2 }}
									whileHover={{ scale: 1.05, y: -5 }}
								>
									<div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full -translate-y-12 sm:-translate-y-16 translate-x-12 sm:translate-x-16"></div>
									<div className="relative z-10">
										<div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
											{announcement.icon}
											<h4 className="text-base sm:text-lg font-bold text-white">{announcement.title}</h4>
										</div>
										<p className="text-white/90 leading-relaxed text-xs sm:text-sm">{announcement.description}</p>
									</div>
								</motion.div>
							))}
						</div>
					</motion.div>

					{/* İstatistikler */}
					<motion.div 
						className="grid grid-cols-3 gap-4 sm:gap-8 max-w-2xl mt-8 sm:mt-12"
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.8, duration: 0.8 }}
					>
						<div className="text-center">
							<div className="text-2xl sm:text-3xl font-bold text-emerald-400">3000+</div>
							<div className="text-emerald-200 text-xs sm:text-sm">Ürün Çeşidi</div>
						</div>
						<div className="text-center">
							<div className="text-2xl sm:text-3xl font-bold text-teal-400">45dk</div>
							<div className="text-teal-200 text-xs sm:text-sm">Hızlı Teslimat</div>
						</div>
						<div className="text-center">
							<div className="text-2xl sm:text-3xl font-bold text-green-400">24/7</div>
							<div className="text-green-200 text-xs sm:text-sm">Müşteri Hizmeti</div>
						</div>
					</motion.div>
				</motion.div>
			</div>

			{/* Kategoriler */}
			<div ref={categoriesRef} className="py-16 bg-gray-900">
				<div className="container mx-auto px-4">
					<motion.h2 
						className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-8 sm:mb-12 bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent"
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.2 }}
					>
						🛍️ Kategoriler
					</motion.h2>
					<motion.div 
						className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6"
						variants={container}
						initial="hidden"
						animate="show"
					>
						{categories.map((category, index) => (
							<motion.div key={category.href} variants={item}>
								<CategoryItem category={category} />
							</motion.div>
						))}
					</motion.div>
				</div>
			</div>

			{/* Öne Çıkan Ürünler - En Aşağıya Taşındı */}
			<div ref={featuredRef} className="py-16 bg-gray-900">
				<div className="container mx-auto px-4">
					<FeaturedProducts featuredProducts={products?.filter(product => !product.isHidden).slice(0, 8) || []} />
				</div>
			</div>
		</div>
	);
};

export default HomePage;