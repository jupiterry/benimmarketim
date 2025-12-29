import { useEffect, useRef, useState, useCallback } from "react";
import CategoryItem from "../components/CategoryItem";
import { useProductStore } from "../stores/useProductStore";
import WeeklyProducts from "../components/WeeklyProducts";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ShoppingCart, Sparkles, TrendingUp, Clock, Gift, Smartphone, Download, Apple, ExternalLink, ChevronRight, Star, Zap, Truck, Shield, ArrowRight } from "lucide-react";

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
	"🎉 Süper Fırsat! Seçili ürünlerde %50'ye varan indirimler",
	"✨ Yeni Üyelere Özel: 250₺ Üzeri Alışverişte Altıncezve Oralet Hediye",
	"🚀 45 Dakikada Kapınızda! Hızlı Teslimat Garantisi",
	"📱 Mobil Uygulamamızı İndirin - Özel Fırsatları Kaçırmayın!",
	"💳 Kredi Kartına 3 Taksit İmkanı"
];

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app&hl=tr";
const APP_STORE_URL = "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr";

// Floating Product Component
const FloatingProduct = ({ emoji, delay, x, y, duration = 6 }) => (
	<motion.div
		className="absolute text-4xl sm:text-5xl md:text-6xl select-none pointer-events-none"
		style={{ left: `${x}%`, top: `${y}%` }}
		animate={{
			y: [0, -20, 0],
			rotate: [0, 10, -10, 0],
			scale: [1, 1.1, 1],
		}}
		transition={{
			duration,
			delay,
			repeat: Infinity,
			ease: "easeInOut"
		}}
	>
		{emoji}
	</motion.div>
);

// Animated Counter Component
const AnimatedCounter = ({ target, suffix = "", prefix = "", duration = 2 }) => {
	const [count, setCount] = useState(0);
	const [isVisible, setIsVisible] = useState(false);
	const ref = useRef(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && !isVisible) {
					setIsVisible(true);
				}
			},
			{ threshold: 0.5 }
		);

		if (ref.current) observer.observe(ref.current);
		return () => observer.disconnect();
	}, [isVisible]);

	useEffect(() => {
		if (!isVisible) return;

		let start = 0;
		const end = parseInt(target);
		const incrementTime = (duration * 1000) / end;
		const step = Math.ceil(end / 60);

		const timer = setInterval(() => {
			start += step;
			if (start >= end) {
				setCount(end);
				clearInterval(timer);
			} else {
				setCount(start);
			}
		}, incrementTime * step);

		return () => clearInterval(timer);
	}, [isVisible, target, duration]);

	return (
		<span ref={ref} className="tabular-nums">
			{prefix}{count}{suffix}
		</span>
	);
};

// Typewriter Component
const Typewriter = ({ texts, speed = 100, deleteSpeed = 50, pauseTime = 2000 }) => {
	const [displayText, setDisplayText] = useState("");
	const [textIndex, setTextIndex] = useState(0);
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		const currentText = texts[textIndex];

		const timeout = setTimeout(() => {
			if (!isDeleting) {
				if (displayText.length < currentText.length) {
					setDisplayText(currentText.slice(0, displayText.length + 1));
				} else {
					setTimeout(() => setIsDeleting(true), pauseTime);
				}
			} else {
				if (displayText.length > 0) {
					setDisplayText(displayText.slice(0, -1));
				} else {
					setIsDeleting(false);
					setTextIndex((prev) => (prev + 1) % texts.length);
				}
			}
		}, isDeleting ? deleteSpeed : speed);

		return () => clearTimeout(timeout);
	}, [displayText, isDeleting, textIndex, texts, speed, deleteSpeed, pauseTime]);

	return (
		<span className="inline-block">
			{displayText}
			<motion.span
				animate={{ opacity: [1, 0] }}
				transition={{ duration: 0.5, repeat: Infinity }}
				className="inline-block w-[3px] h-[1em] bg-emerald-400 ml-1 align-middle"
			/>
		</span>
	);
};

// Scroll Progress Bar
const ScrollProgressBar = () => {
	const { scrollYProgress } = useScroll();
	
	return (
		<motion.div
			className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 origin-left z-[100]"
			style={{ scaleX: scrollYProgress }}
		/>
	);
};

// Marquee Announcement Bar
const MarqueeBar = () => {
	return (
		<div className="fixed top-0 left-0 right-0 z-[99] bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white py-2 overflow-hidden">
			<motion.div
				className="flex whitespace-nowrap"
				animate={{ x: [0, -2000] }}
				transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
			>
				{[...announcements, ...announcements, ...announcements].map((text, i) => (
					<span key={i} className="mx-8 text-sm font-medium flex items-center gap-2">
						{text}
						<span className="text-emerald-300">•</span>
					</span>
				))}
			</motion.div>
		</div>
	);
};

// Feature Card
const FeatureCard = ({ icon: Icon, title, description, color, delay }) => (
	<motion.div
		initial={{ opacity: 0, y: 30 }}
		whileInView={{ opacity: 1, y: 0 }}
		viewport={{ once: true }}
		transition={{ delay, duration: 0.5 }}
		whileHover={{ y: -8, scale: 1.02 }}
		className="group relative overflow-hidden rounded-2xl p-6 bg-white/5 backdrop-blur-xl border border-white/10 hover:border-emerald-500/50 transition-all duration-300"
	>
		<div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
		<div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg`}>
			<Icon className="w-7 h-7 text-white" />
		</div>
		<h3 className="text-lg font-bold text-white mb-2">{title}</h3>
		<p className="text-gray-400 text-sm leading-relaxed">{description}</p>
	</motion.div>
);

const HomePage = () => {
	const { fetchFeaturedProducts, products, isLoading } = useProductStore();
	const categoriesRef = useRef(null);
	const featuredRef = useRef(null);
	const { scrollY } = useScroll();
	const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
	const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);

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
			transition: { staggerChildren: 0.05 }
		}
	};

	const item = {
		hidden: { opacity: 0, y: 20 },
		show: { opacity: 1, y: 0 }
	};

	return (
		<div className="relative min-h-screen text-white">
			{/* Scroll Progress Bar */}
			<ScrollProgressBar />

			{/* Hero Section */}
			<motion.div 
				style={{ opacity: heroOpacity, scale: heroScale }}
				className="relative min-h-screen overflow-hidden pt-24"
			>
				{/* Animated Background */}
				<div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-emerald-900/40 to-gray-900" />
				
				{/* Grid Pattern */}
				<div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:100px_100px]" />
				
				{/* Floating Shapes */}
				<div className="absolute top-20 left-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
				<div className="absolute top-60 right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
				<div className="absolute bottom-40 left-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
				
				{/* Floating Products */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<FloatingProduct emoji="🍎" delay={0} x={5} y={20} duration={5} />
					<FloatingProduct emoji="🥛" delay={0.5} x={90} y={25} duration={6} />
					<FloatingProduct emoji="🍞" delay={1} x={15} y={70} duration={5.5} />
					<FloatingProduct emoji="🧀" delay={1.5} x={85} y={65} duration={6.5} />
					<FloatingProduct emoji="🥬" delay={2} x={8} y={45} duration={5} />
					<FloatingProduct emoji="☕" delay={2.5} x={92} y={45} duration={6} />
					<FloatingProduct emoji="🍫" delay={3} x={20} y={85} duration={5.5} />
					<FloatingProduct emoji="🥤" delay={3.5} x={80} y={80} duration={6} />
				</div>
				
				<div className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 pt-16 pb-8">
					{/* Badge */}
					<motion.div
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.2 }}
						className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-2 mb-8"
					>
						<Zap className="w-4 h-4 text-emerald-400" />
						<span className="text-emerald-400 text-sm font-medium">Devrek'in En Hızlı Marketi</span>
					</motion.div>

					{/* Main Title */}
					<motion.div
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.8, delay: 0.3 }}
						className="mb-6"
					>
						<div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
							<motion.div 
								className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/30"
								animate={{ rotate: [0, 5, -5, 0] }}
								transition={{ duration: 4, repeat: Infinity }}
							>
								<ShoppingCart className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
							</motion.div>
							<h1 className="text-5xl sm:text-7xl md:text-8xl font-black bg-gradient-to-r from-white via-emerald-200 to-teal-200 bg-clip-text text-transparent">
								Benim Marketim
							</h1>
						</div>
					</motion.div>

					{/* Typewriter Subtitle */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.6 }}
						className="text-xl sm:text-2xl md:text-3xl text-gray-300 mb-8 h-12"
					>
						<Typewriter
							texts={[
								"Hızlı Teslimat, Uygun Fiyatlar! 🚀",
								"3000+ Ürün Çeşidi! 📦",
								"45 Dakikada Kapınızda! ⏱️",
								"Kaliteli Ürünler, Güvenli Alışveriş! ✨"
							]}
							speed={80}
							deleteSpeed={40}
							pauseTime={2500}
						/>
					</motion.div>

					{/* CTA Buttons */}
					<motion.div 
						className="flex flex-col sm:flex-row gap-4 mb-12"
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.8 }}
					>
						<motion.button 
							onClick={scrollToCategories}
							whileHover={{ scale: 1.05, boxShadow: "0 25px 50px rgba(16, 185, 129, 0.4)" }}
							whileTap={{ scale: 0.95 }}
							className="group relative bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-2xl overflow-hidden"
						>
							<span className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
							<ShoppingCart className="w-6 h-6 relative z-10" />
							<span className="relative z-10">Alışverişe Başla</span>
							<ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
						</motion.button>
						
						<motion.button 
							onClick={scrollToFeatured}
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							className="group bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all"
						>
							<Sparkles className="w-6 h-6 text-yellow-400" />
							Öne Çıkanları Gör
							<Star className="w-5 h-5 text-yellow-400 group-hover:rotate-12 transition-transform" />
						</motion.button>
					</motion.div>

					{/* Animated Stats */}
					<motion.div 
						className="grid grid-cols-3 gap-8 max-w-3xl"
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 1 }}
					>
						<div className="text-center group">
							<div className="text-3xl sm:text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
								<AnimatedCounter target="3000" suffix="+" duration={2} />
							</div>
							<div className="text-gray-400 text-sm sm:text-base mt-1 group-hover:text-emerald-400 transition-colors">Ürün Çeşidi</div>
						</div>
						<div className="text-center group">
							<div className="text-3xl sm:text-4xl md:text-5xl font-black bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
								<AnimatedCounter target="45" suffix="dk" duration={1.5} />
							</div>
							<div className="text-gray-400 text-sm sm:text-base mt-1 group-hover:text-teal-400 transition-colors">Hızlı Teslimat</div>
						</div>
						<div className="text-center group">
							<div className="text-3xl sm:text-4xl md:text-5xl font-black bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
								<AnimatedCounter target="24" suffix="/7" duration={1} />
							</div>
							<div className="text-gray-400 text-sm sm:text-base mt-1 group-hover:text-cyan-400 transition-colors">Müşteri Hizmeti</div>
						</div>
					</motion.div>

					{/* Scroll Indicator */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 1.5 }}
						className="absolute bottom-8 left-1/2 -translate-x-1/2"
					>
						<motion.div
							animate={{ y: [0, 10, 0] }}
							transition={{ duration: 1.5, repeat: Infinity }}
							className="flex flex-col items-center gap-2 text-gray-500"
						>
							<span className="text-xs uppercase tracking-widest">Keşfet</span>
							<div className="w-6 h-10 rounded-full border-2 border-gray-600 flex items-start justify-center p-2">
								<motion.div
									animate={{ y: [0, 12, 0] }}
									transition={{ duration: 1.5, repeat: Infinity }}
									className="w-1.5 h-1.5 bg-emerald-400 rounded-full"
								/>
							</div>
						</motion.div>
					</motion.div>
				</div>
			</motion.div>

			{/* Features Section */}
			<section className="relative py-20 bg-gray-900">
				<div className="container mx-auto px-4">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						className="text-center mb-12"
					>
						<h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
							Neden <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Benim Marketim?</span>
						</h2>
						<p className="text-gray-400 max-w-2xl mx-auto">Size en iyi alışveriş deneyimini sunmak için buradayız</p>
					</motion.div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
						<FeatureCard
							icon={Truck}
							title="Hızlı Teslimat"
							description="45 dakika içinde siparişiniz kapınızda. Gecikmez, bekletmez!"
							color="from-emerald-500 to-teal-600"
							delay={0}
						/>
						<FeatureCard
							icon={Shield}
							title="Güvenli Alışveriş"
							description="256-bit SSL şifreleme ile güvenli ödeme. Verileriniz bizimle güvende."
							color="from-blue-500 to-indigo-600"
							delay={0.1}
						/>
						<FeatureCard
							icon={Gift}
							title="Özel Kampanyalar"
							description="Her hafta yeni indirimler ve özel fırsatlar. Kaçırmayın!"
							color="from-purple-500 to-pink-600"
							delay={0.2}
						/>
						<FeatureCard
							icon={Star}
							title="Kaliteli Ürünler"
							description="Sadece en kaliteli ve taze ürünleri sizin için seçiyoruz."
							color="from-amber-500 to-orange-600"
							delay={0.3}
						/>
					</div>
				</div>
			</section>

			{/* Weekly Products Section */}
			<section className="relative py-20 bg-gray-900">
				<div className="container mx-auto px-4">
					<WeeklyProducts />
				</div>
			</section>

			{/* Referral Promo Section */}
			<motion.section
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				className="relative py-20 bg-gradient-to-br from-purple-900/30 via-gray-900 to-pink-900/30 overflow-hidden"
			>
				{/* Background Effects */}
				<div className="absolute inset-0">
					<div className="absolute top-20 left-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
					<div className="absolute bottom-20 right-20 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
				</div>
				
				<div className="container mx-auto px-4 relative z-10">
					<div className="max-w-4xl mx-auto text-center">
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							whileInView={{ opacity: 1, scale: 1 }}
							viewport={{ once: true }}
							className="mb-6"
						>
							<div className="inline-flex items-center gap-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-full px-6 py-3 mb-6">
								<Gift className="w-6 h-6 text-purple-400" />
								<span className="text-purple-300 font-semibold">Arkadaşını Getir, Kazan!</span>
								<Gift className="w-6 h-6 text-pink-400" />
							</div>
							
							<h2 className="text-3xl sm:text-5xl font-bold text-white mb-4">
								Arkadaşını Davet Et, 
								<span className="bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400 bg-clip-text text-transparent"> %5 İndirim</span> Kazan!
							</h2>
							
							<p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
								Referral kodunu arkadaşlarınla paylaş! Onlar <span className="text-purple-400 font-semibold">%5 indirim</span> ile ilk siparişlerini versin, 
								sen de <span className="text-pink-400 font-semibold">%5 indirim kuponu</span> kazan!
							</p>
						</motion.div>

						{/* How it works */}
						<motion.div
							initial={{ opacity: 0, y: 30 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ delay: 0.2 }}
							className="grid md:grid-cols-3 gap-6 mb-10"
						>
							{[
								{ step: 1, icon: "📤", title: "Kodunu Paylaş", desc: "Profilindeki davet kodunu arkadaşlarına gönder" },
								{ step: 2, icon: "🎁", title: "Arkadaşın Kazansın", desc: "İlk siparişlerinde %5 indirim ile başlasınlar" },
								{ step: 3, icon: "💰", title: "Sen Kazan", desc: "Başarılı davette %5 indirim kuponu al" }
							].map((item, index) => (
								<motion.div
									key={index}
									whileHover={{ y: -5, scale: 1.02 }}
									className="relative bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition-all"
								>
									<div className="absolute -top-3 -left-3 w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
										{item.step}
									</div>
									<div className="text-4xl mb-4">{item.icon}</div>
									<h3 className="text-white font-bold text-lg mb-2">{item.title}</h3>
									<p className="text-gray-400 text-sm">{item.desc}</p>
								</motion.div>
							))}
						</motion.div>

						{/* CTA */}
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ delay: 0.4 }}
							className="flex flex-col sm:flex-row gap-4 justify-center"
						>
							<a
								href="/referral"
								className="inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold px-8 py-4 rounded-2xl hover:from-purple-400 hover:to-pink-500 transition-all duration-300 shadow-2xl hover:scale-105"
							>
								<Gift className="w-5 h-5" />
								<span>Davet Kodumu Gör</span>
								<ArrowRight className="w-5 h-5" />
							</a>
							<a
								href="/signup"
								className="inline-flex items-center justify-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 text-white font-bold px-8 py-4 rounded-2xl transition-all duration-300 hover:scale-105"
							>
								<Sparkles className="w-5 h-5 text-yellow-400" />
								<span>Hemen Üye Ol</span>
							</a>
						</motion.div>
					</div>
				</div>
			</motion.section>
			<motion.section
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				className="relative bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 py-16 overflow-hidden"
			>
				<div className="absolute inset-0 opacity-20">
					<div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl" />
					<div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
				</div>

				<div className="container mx-auto px-4 relative z-10">
					<div className="max-w-4xl mx-auto text-center">
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							className="inline-flex items-center gap-3 mb-6"
						>
							<div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center">
								<Smartphone className="w-8 h-8 text-white" />
							</div>
							<h2 className="text-3xl sm:text-4xl font-bold text-white">
								Mobil Uygulamamızı İndirin!
							</h2>
						</motion.div>
						
						<motion.p
							initial={{ opacity: 0 }}
							whileInView={{ opacity: 1 }}
							viewport={{ once: true }}
							transition={{ delay: 0.2 }}
							className="text-white/90 text-lg mb-8 max-w-2xl mx-auto"
						>
							Daha hızlı sipariş, anlık bildirimler ve özel indirimler için mobil uygulamamızı indirin!
						</motion.p>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ delay: 0.3 }}
							className="flex flex-col sm:flex-row gap-4 justify-center"
						>
							<a
								href={APP_STORE_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center justify-center gap-3 bg-white text-emerald-600 font-bold px-8 py-4 rounded-2xl hover:bg-emerald-50 transition-all duration-300 shadow-2xl hover:scale-105"
							>
								<Apple className="w-6 h-6" />
								<span>App Store</span>
								<ExternalLink className="w-4 h-4" />
							</a>
							
							<a
								href={PLAY_STORE_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center justify-center gap-3 bg-white text-emerald-600 font-bold px-8 py-4 rounded-2xl hover:bg-emerald-50 transition-all duration-300 shadow-2xl hover:scale-105"
							>
								<Download className="w-6 h-6" />
								<span>Play Store</span>
								<ExternalLink className="w-4 h-4" />
							</a>
						</motion.div>
					</div>
				</div>
			</motion.section>

			{/* Categories Section */}
			<section ref={categoriesRef} className="py-20 bg-gray-900">
				<div className="container mx-auto px-4">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						className="text-center mb-12"
					>
						<h2 className="text-3xl sm:text-4xl font-bold mb-4">
							<span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
								🛍️ Kategoriler
							</span>
						</h2>
						<p className="text-gray-400">İstediğiniz kategoriye tıklayarak alışverişe başlayın</p>
					</motion.div>
					
					<motion.div 
						className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6"
						variants={container}
						initial="hidden"
						whileInView="show"
						viewport={{ once: true }}
					>
						{categories.map((category) => (
							<motion.div key={category.href} variants={item}>
								<CategoryItem category={category} />
							</motion.div>
						))}
					</motion.div>
				</div>
			</section>

			{/* Featured Products */}
			<section ref={featuredRef} className="py-20 bg-gray-900">
				<div className="container mx-auto px-4">
					<FeaturedProducts featuredProducts={products?.filter(product => !product.isHidden).slice(0, 8) || []} />
				</div>
			</section>
		</div>
	);
};

export default HomePage;