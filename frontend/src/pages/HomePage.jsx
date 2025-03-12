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
			{/* Hero Section */}
			<div className="relative h-[500px] sm:h-[600px] overflow-hidden">
				<div className="absolute inset-0 bg-gradient-to-r from-emerald-900 to-emerald-600 opacity-90" />
				<motion.div 
					className="relative z-10 h-5/6 flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 mt-16 sm:mt-12"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					<motion.h1 
						className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-4 sm:mb-6 mt-4 sm:mt-8"
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.2 }}
					>
						<div>Alışverişin En Kolay</div>
						<div>Yolu, <span className="text-emerald-400">Benim Marketim!</span></div>
					</motion.h1>
					<motion.p 
						className="text-lg sm:text-xl md:text-2xl text-gray-200 mb-8 sm:mb-10"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.4 }}
					>
						En yeni ürünleri keşfedin
					</motion.p>
					<motion.div 
						className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-4 sm:px-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.6 }}
					>
						<button 
							onClick={scrollToCategories}
							className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white px-4 sm:px-8 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 text-base sm:text-lg"
						>
							<ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
							Alışverişe Başla
						</button>
						<button 
							onClick={scrollToFeatured}
							className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white px-4 sm:px-8 py-3 rounded-lg font-medium flex items-center justify-center gap-2 backdrop-blur-sm transition-all duration-300 text-base sm:text-lg"
						>
							<Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
							Haftanın Yıldızları
						</button>
					</motion.div>
				</motion.div>
			</div>

			{/* Announcements Section */}
			<div className="relative -mt-12 z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<motion.div 
					className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
					variants={container}
					initial="hidden"
					whileInView="show"
					viewport={{ once: true }}
				>
					{announcements.map((announcement) => (
						<motion.div
							key={announcement.title}
							className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${announcement.color} p-6 transform perspective-1000`}
							variants={item}
							whileHover={{ 
								scale: 1.02,
								rotateY: 5,
								rotateX: 5,
								translateZ: 20
							}}
							style={{
								transformStyle: "preserve-3d"
							}}
						>
							<div className="flex items-start gap-4">
								<div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
									{announcement.icon}
								</div>
								<div>
									<h3 className="text-lg font-semibold mb-1">{announcement.title}</h3>
									<p className="text-sm text-white/80">{announcement.description}</p>
								</div>
							</div>
							<div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl transform translate-x-16 -translate-y-8" />
						</motion.div>
					))}
				</motion.div>
			</div>

			{/* Features Section */}
			<div className="bg-gray-900/50 backdrop-blur-sm py-16">
				<div className="max-w-7xl mx-auto px-4">
					<motion.div 
						className="grid grid-cols-1 md:grid-cols-3 gap-8"
						variants={container}
						initial="hidden"
						whileInView="show"
						viewport={{ once: true }}
					>
						<motion.div 
							className="bg-gray-800/50 p-6 rounded-xl backdrop-blur-sm transform perspective-1000"
							variants={item}
							whileHover={{ 
								scale: 1.02,
								rotateY: 10,
								rotateX: 5,
								translateZ: 30
							}}
							style={{
								transformStyle: "preserve-3d"
							}}
						>
							<Clock className="w-12 h-12 text-emerald-400 mb-4 transform translateZ(20px)" />
							<h3 className="text-xl font-semibold mb-2 transform translateZ(20px)">Hızlı Teslimat</h3>
							<p className="text-gray-400 transform translateZ(20px)">45 dakika içinde kapınızda!</p>
						</motion.div>
						<motion.div 
							className="bg-gray-800/50 p-6 rounded-xl backdrop-blur-sm transform perspective-1000"
							variants={item}
							whileHover={{ 
								scale: 1.02,
								rotateY: 10,
								rotateX: 5,
								translateZ: 30
							}}
							style={{
								transformStyle: "preserve-3d"
							}}
						>
							<TrendingUp className="w-12 h-12 text-emerald-400 mb-4 transform translateZ(20px)" />
							<h3 className="text-xl font-semibold mb-2 transform translateZ(20px)">En İyi Fiyatlar</h3>
							<p className="text-gray-400 transform translateZ(20px)">Uygun fiyat garantisi</p>
						</motion.div>
						<motion.div 
							className="bg-gray-800/50 p-6 rounded-xl backdrop-blur-sm transform perspective-1000"
							variants={item}
							whileHover={{ 
								scale: 1.02,
								rotateY: 10,
								rotateX: 5,
								translateZ: 30
							}}
							style={{
								transformStyle: "preserve-3d"
							}}
						>
							<Sparkles className="w-12 h-12 text-emerald-400 mb-4 transform translateZ(20px)" />
							<h3 className="text-xl font-semibold mb-2 transform translateZ(20px)">Kaliteli Ürünler</h3>
							<p className="text-gray-400 transform translateZ(20px)">Seçilmiş kaliteli ürünler</p>
						</motion.div>
					</motion.div>
				</div>
			</div>

			{/* Categories Section */}
			<div ref={categoriesRef} className="py-16 bg-gray-900">
				<div className="max-w-7xl mx-auto px-4">
					<motion.h2 
						className="text-3xl md:text-4xl font-bold text-center mb-12"
						initial={{ opacity: 0 }}
						whileInView={{ opacity: 1 }}
						viewport={{ once: true }}
					>
						<span className="text-emerald-400">Kategoriler</span>
					</motion.h2>
					<motion.div 
						className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
						variants={container}
						initial="hidden"
						whileInView="show"
						viewport={{ once: true }}
					>
						{categories.map((category) => (
							<motion.a
								href={category.href}
								key={category.href}
								variants={item}
								className="relative group transform perspective-1000 block"
								whileHover={{ 
									scale: 1.02,
									rotateY: 10,
									rotateX: 5,
									translateZ: 20
								}}
								style={{
									transformStyle: "preserve-3d"
								}}
							>
								<CategoryItem category={category} />
							</motion.a>
						))}
					</motion.div>
				</div>
			</div>

			{/* Featured Section */}
			<div ref={featuredRef} className="py-16 bg-gray-900/50 backdrop-blur-sm">
				<div className="max-w-7xl mx-auto px-4">
					{!isLoading && products && products.length > 0 && (
						<FeaturedProducts featuredProducts={products} />
					)}
				</div>
			</div>
		</div>
	);
};

export default HomePage;