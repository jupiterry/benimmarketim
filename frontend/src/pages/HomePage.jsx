import { useEffect, useRef, useState, useCallback } from "react";
import CategoryItem from "../components/CategoryItem";
import WeeklyProducts from "../components/WeeklyProducts";
import { motion, useScroll, useTransform, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { ShoppingCart, Sparkles, TrendingUp, Clock, Gift, Smartphone, Download, ExternalLink, ChevronRight, Star, Zap, Truck, Shield, ArrowRight, Flame, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { useProductStore } from "../stores/useProductStore";
import ProductCard from "../components/ProductCard";

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
	{ href: "/dondurma", name: "Dondurmalar", imageUrl: "/dondurma.png" }
];

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app&hl=tr";
const APP_STORE_URL = "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr";

// ── Typewriter ──
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

// ── Animated Counter ──
const AnimatedCounter = ({ target, suffix = "", prefix = "", duration = 2 }) => {
	const [count, setCount] = useState(0);
	const [isVisible, setIsVisible] = useState(false);
	const ref = useRef(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => { if (entry.isIntersecting && !isVisible) setIsVisible(true); },
			{ threshold: 0.5 }
		);
		if (ref.current) observer.observe(ref.current);
		return () => observer.disconnect();
	}, [isVisible]);

	useEffect(() => {
		if (!isVisible) return;
		let start = 0;
		const end = parseInt(target);
		const step = Math.ceil(end / 60);
		const incrementTime = (duration * 1000) / end;
		const timer = setInterval(() => {
			start += step;
			if (start >= end) { setCount(end); clearInterval(timer); }
			else setCount(start);
		}, incrementTime * step);
		return () => clearInterval(timer);
	}, [isVisible, target, duration]);

	return <span ref={ref} className="tabular-nums">{prefix}{count}{suffix}</span>;
};

// ── Scroll Progress Bar ──
const ScrollProgressBar = () => {
	const { scrollYProgress } = useScroll();
	return (
		<motion.div
			className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500 origin-left z-[100]"
			style={{ scaleX: scrollYProgress }}
		/>
	);
};

// ── Section Header (Glowing Title with pulsing line) ──
const SectionHeader = ({ title, subtitle, delay = 0 }) => (
	<motion.div
		initial={{ opacity: 0, y: 20 }}
		whileInView={{ opacity: 1, y: 0 }}
		viewport={{ once: true }}
		transition={{ delay }}
		className="text-center mb-12"
	>
		<h2 className="text-3xl sm:text-4xl font-black text-white mb-3 tracking-tight">
			{title}
		</h2>
		{subtitle && <p className="text-gray-500 text-sm max-w-lg mx-auto">{subtitle}</p>}
		<div className="flex items-center justify-center mt-5">
			<div className="h-[1px] w-16 bg-gradient-to-r from-transparent to-emerald-500/50" />
			<motion.div
				className="w-2.5 h-2.5 rounded-full bg-emerald-400 mx-3"
				animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
				transition={{ duration: 2, repeat: Infinity }}
			/>
			<div className="h-[1px] w-16 bg-gradient-to-l from-transparent to-emerald-500/50" />
		</div>
	</motion.div>
);

const HomePage = () => {
	const categoriesRef = useRef(null);
	const { scrollY } = useScroll();
	const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
	const heroScale = useTransform(scrollY, [0, 500], [1, 0.95]);

	// 3D Parallax tilt for hero card
	const mouseX = useMotionValue(0);
	const mouseY = useMotionValue(0);
	const rotateX = useSpring(useTransform(mouseY, [-300, 300], [6, -6]), { stiffness: 150, damping: 20 });
	const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-6, 6]), { stiffness: 150, damping: 20 });

	const handleMouseMove = useCallback((e) => {
		const rect = e.currentTarget.getBoundingClientRect();
		mouseX.set(e.clientX - rect.left - rect.width / 2);
		mouseY.set(e.clientY - rect.top - rect.height / 2);
	}, [mouseX, mouseY]);

	const handleMouseLeave = useCallback(() => {
		mouseX.set(0);
		mouseY.set(0);
	}, [mouseX, mouseY]);

	const scrollToCategories = () => {
		categoriesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	const { fetchFeaturedProducts, products } = useProductStore();

	useEffect(() => {
		fetchFeaturedProducts();
	}, [fetchFeaturedProducts]);

	const container = {
		hidden: { opacity: 0 },
		show: { opacity: 1, transition: { staggerChildren: 0.05 } }
	};
	const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

	return (
		<div className="relative min-h-screen text-white">
			<ScrollProgressBar />

			{/* ═══════════════════════════════════════════════════════
			    §1  HERO — The Showstopper
			═══════════════════════════════════════════════════════ */}
			<motion.section
				style={{ opacity: heroOpacity, scale: heroScale }}
				className="relative min-h-screen overflow-hidden flex items-center justify-center"
			>
				{/* Deep animated gradient mesh background */}
				<div className="absolute inset-0 bg-gray-900" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(16,185,129,0.08),transparent_60%)]" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(6,182,212,0.08),transparent_60%)]" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,rgba(139,92,246,0.05),transparent_50%)]" />

				{/* Pulsing orbs */}
				<div className="absolute top-[15%] left-[10%] w-80 h-80 bg-emerald-500/[0.07] rounded-full blur-3xl animate-pulse" />
				<div className="absolute top-[30%] right-[8%] w-96 h-96 bg-cyan-500/[0.06] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
				<div className="absolute bottom-[20%] left-[30%] w-72 h-72 bg-teal-500/[0.05] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "3s" }} />

				{/* Grid pattern */}
				<div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />

				{/* ── Frosted Glass Card — 3D Parallax ── */}
				<div className="relative z-10 px-4 sm:px-6 w-full max-w-4xl mx-auto pt-28 pb-16">
					<motion.div
						className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 sm:p-12 md:p-16 shadow-[0_0_80px_rgba(16,185,129,0.06)]"
						style={{ rotateX, rotateY, transformPerspective: 1200 }}
						onMouseMove={handleMouseMove}
						onMouseLeave={handleMouseLeave}
						initial={{ opacity: 0, y: 40 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, delay: 0.2 }}
					>
						{/* Badge */}
						<motion.div
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.5 }}
							className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5 mb-8"
						>
							<Zap className="w-3.5 h-3.5 text-emerald-400" />
							<span className="text-emerald-400 text-xs font-bold tracking-wide">Devrek'in En Hızlı Marketi</span>
						</motion.div>

						{/* Title */}
						<motion.div
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.7, delay: 0.4 }}
							className="mb-6"
						>
							<div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
								<motion.div
									className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)]"
									animate={{ rotate: [0, 5, -5, 0] }}
									transition={{ duration: 5, repeat: Infinity }}
								>
									<ShoppingCart className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
								</motion.div>
								<h1 className="text-5xl sm:text-6xl md:text-7xl font-black">
									<span className="bg-gradient-to-r from-white via-emerald-100 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(16,185,129,0.15)]">
										Benim Marketim
									</span>
								</h1>
							</div>
						</motion.div>

						{/* Typewriter */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ delay: 0.7 }}
							className="text-lg sm:text-xl md:text-2xl text-gray-400 mb-10 h-10 font-light"
						>
							<Typewriter
								texts={["Hızlı Teslimat, Uygun Fiyatlar! 🚀", "3000+ Ürün Çeşidi! 📦", "45 Dakikada Kapınızda! ⏱️", "Kaliteli Ürünler, Güvenli Alışveriş! ✨"]}
								speed={80}
								deleteSpeed={40}
								pauseTime={2500}
							/>
						</motion.div>

						{/* CTA Buttons */}
						<motion.div
							className="flex flex-col sm:flex-row gap-3 mb-10"
							initial={{ opacity: 0, y: 15 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.9 }}
						>
							{/* Primary: Shimmer button */}
							<motion.button
								onClick={scrollToCategories}
								whileHover={{ scale: 1.03 }}
								whileTap={{ scale: 0.97 }}
								className="group relative bg-gradient-to-r from-emerald-500 to-cyan-500 text-white px-8 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(16,185,129,0.25)] hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-shadow overflow-hidden"
							>
								{/* Shimmer sweep */}
								<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
								<ShoppingCart className="w-5 h-5 relative z-10" />
								<span className="relative z-10">Alışverişe Başla</span>
								<ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
							</motion.button>

							<motion.button
								onClick={scrollToCategories}
								whileHover={{ scale: 1.03 }}
								whileTap={{ scale: 0.97 }}
								className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] hover:border-emerald-500/20 hover:bg-white/[0.08] text-white px-8 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all"
							>
								<Sparkles className="w-5 h-5 text-amber-400" />
								Kategorileri Keşfet
							</motion.button>
						</motion.div>

						{/* Stats row */}
						<motion.div
							className="grid grid-cols-3 gap-6"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ delay: 1.1 }}
						>
							{[
								{ target: "3000", suffix: "+", label: "Ürün Çeşidi", gradient: "from-emerald-400 to-teal-400" },
								{ target: "45", suffix: "dk", label: "Hızlı Teslimat", gradient: "from-cyan-400 to-blue-400" },
								{ target: "24", suffix: "/7", label: "Müşteri Hizmeti", gradient: "from-violet-400 to-purple-400" },
							].map((stat) => (
								<div key={stat.label} className="text-center">
									<div className={`text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
										<AnimatedCounter target={stat.target} suffix={stat.suffix} duration={2} />
									</div>
									<div className="text-gray-600 text-[11px] sm:text-xs mt-1 font-semibold uppercase tracking-wider">{stat.label}</div>
								</div>
							))}
						</motion.div>
					</motion.div>

					{/* Scroll indicator */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 1.5 }}
						className="flex justify-center mt-10"
					>
						<motion.div
							animate={{ y: [0, 8, 0] }}
							transition={{ duration: 1.5, repeat: Infinity }}
							className="flex flex-col items-center gap-2 text-gray-600"
						>
							<span className="text-[10px] uppercase tracking-[0.2em] font-bold">Keşfet</span>
							<div className="w-5 h-8 rounded-full border border-gray-700 flex items-start justify-center p-1.5">
								<motion.div
									animate={{ y: [0, 10, 0] }}
									transition={{ duration: 1.5, repeat: Infinity }}
									className="w-1 h-1 bg-emerald-400 rounded-full"
								/>
							</div>
						</motion.div>
					</motion.div>
				</div>
			</motion.section>

			{/* ═══════════════════════════════════════════════════════
			    §2  CATEGORIES — The Neon Grid
			═══════════════════════════════════════════════════════ */}
			<section ref={categoriesRef} className="relative py-24 bg-gray-900">
				<div className="container mx-auto px-4">
					<SectionHeader
						title={<><span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Kategoriler</span></>}
						subtitle="İstediğiniz kategoriye tıklayarak alışverişe başlayın"
					/>

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

			{/* ═══════════════════════════════════════════════════════
			    §3  WEEKLY PRODUCTS + FEATURED
			═══════════════════════════════════════════════════════ */}
			<section className="relative py-24 bg-gray-900">
				{/* subtle separator */}
				<div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />

				<div className="container mx-auto px-4">
					<WeeklyProducts />
				</div>
			</section>

			{/* ═══════════════════════════════════════════════════════
			    §4  FEATURED PRODUCTS — Best Sellers
			═══════════════════════════════════════════════════════ */}
			{products && products.length > 0 && (
				<section className="relative py-24 bg-gray-900">
					<div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />

					<div className="container mx-auto px-4">
						<SectionHeader
							title={<><span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Çok Satanlar</span></>}
							subtitle="Müşterilerimizin en çok tercih ettiği ürünler"
						/>

						<motion.div
							className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6"
							variants={container}
							initial="hidden"
							whileInView="show"
							viewport={{ once: true }}
						>
							{products.slice(0, 10).map((product) => (
								<motion.div key={product._id} variants={item}>
									<ProductCard product={product} />
								</motion.div>
							))}
						</motion.div>
					</div>
				</section>
			)}

			{/* ═══════════════════════════════════════════════════════
			    §5  WHY US — Features
			═══════════════════════════════════════════════════════ */}
			<section className="relative py-24 bg-gray-900 overflow-hidden">
				<div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
				{/* decorative orb */}
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/[0.02] rounded-full blur-3xl pointer-events-none" />

				<div className="container mx-auto px-4 relative z-10">
					<SectionHeader
						title={<>Neden <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Benim Marketim?</span></>}
						subtitle="Size en iyi alışveriş deneyimini sunmak için buradayız"
					/>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
						{[
							{ icon: Truck, title: "Hızlı Teslimat", desc: "45 dakika içinde siparişiniz kapınızda. Gecikmez, bekletmez!", color: "emerald" },
							{ icon: Shield, title: "Güvenli Ödeme", desc: "256-bit SSL şifreleme ile güvenli ödeme. Verileriniz bizimle güvende.", color: "cyan" },
							{ icon: Gift, title: "Özel Kampanyalar", desc: "Her hafta yeni indirimler ve özel fırsatlar. Kaçırmayın!", color: "violet" },
							{ icon: Star, title: "Kaliteli Ürünler", desc: "Sadece en kaliteli ve taze ürünleri sizin için seçiyoruz.", color: "amber" },
						].map((feat, i) => (
							<motion.div
								key={feat.title}
								initial={{ opacity: 0, y: 25 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ delay: i * 0.08 }}
								whileHover={{ y: -6 }}
								className={`group relative bg-gray-900/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 hover:border-${feat.color}-500/30 hover:shadow-[0_0_25px_rgba(var(--glow),0.08)] transition-all duration-300`}
								style={{ "--glow": feat.color === "emerald" ? "16,185,129" : feat.color === "cyan" ? "6,182,212" : feat.color === "violet" ? "139,92,246" : "245,158,11" }}
							>
								<div className={`w-12 h-12 rounded-xl bg-${feat.color}-500/10 border border-${feat.color}-500/15 flex items-center justify-center mb-4`}>
									<feat.icon className={`w-5 h-5 text-${feat.color}-400 drop-shadow-[0_0_6px_rgba(var(--glow),0.4)]`} />
								</div>
								<h3 className="text-white font-bold text-sm mb-2">{feat.title}</h3>
								<p className="text-gray-500 text-xs leading-relaxed">{feat.desc}</p>
							</motion.div>
						))}
					</div>
				</div>
			</section>

			{/* ═══════════════════════════════════════════════════════
			    §6  REFERRAL PROMO
			═══════════════════════════════════════════════════════ */}
			<section className="relative py-24 overflow-hidden">
				<div className="absolute inset-0 bg-gradient-to-br from-violet-950/40 via-gray-900 to-pink-950/30" />
				<div className="absolute top-[20%] left-[15%] w-72 h-72 bg-purple-500/[0.08] rounded-full blur-3xl animate-pulse" />
				<div className="absolute bottom-[20%] right-[15%] w-80 h-80 bg-pink-500/[0.08] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />

				<div className="container mx-auto px-4 relative z-10">
					<div className="max-w-3xl mx-auto text-center">
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
						>
							<div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-6">
								<Gift className="w-4 h-4 text-purple-400" />
								<span className="text-purple-300 text-xs font-bold">Arkadaşını Getir, Kazan!</span>
							</div>
							<h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4">
								Arkadaşını Davet Et,{" "}
								<span className="bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400 bg-clip-text text-transparent">%5 İndirim</span> Kazan!
							</h2>
							<p className="text-gray-400 text-base max-w-xl mx-auto mb-10">
								Referral kodunu arkadaşlarınla paylaş! Onlar <span className="text-purple-400 font-semibold">%5 indirim</span> ile ilk siparişlerini versin,
								sen de <span className="text-pink-400 font-semibold">%5 indirim kuponu</span> kazan!
							</p>
						</motion.div>

						{/* Steps */}
						<motion.div
							initial={{ opacity: 0, y: 25 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ delay: 0.15 }}
							className="grid md:grid-cols-3 gap-5 mb-10"
						>
							{[
								{ step: 1, emoji: "📤", title: "Kodunu Paylaş", desc: "Profilindeki davet kodunu arkadaşlarına gönder" },
								{ step: 2, emoji: "🎁", title: "Arkadaşın Kazansın", desc: "İlk siparişlerinde %5 indirim ile başlasınlar" },
								{ step: 3, emoji: "💰", title: "Sen Kazan", desc: "Başarılı davette %5 indirim kuponu al" },
							].map((s, i) => (
								<motion.div
									key={i}
									whileHover={{ y: -4 }}
									className="relative bg-white/[0.04] backdrop-blur-xl rounded-2xl p-6 border border-white/[0.06] hover:border-purple-500/30 transition-all"
								>
									<div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-[0_0_12px_rgba(168,85,247,0.3)]">
										{s.step}
									</div>
									<div className="text-3xl mb-3">{s.emoji}</div>
									<h3 className="text-white font-bold text-sm mb-1">{s.title}</h3>
									<p className="text-gray-500 text-xs">{s.desc}</p>
								</motion.div>
							))}
						</motion.div>

						{/* CTA */}
						<motion.div
							initial={{ opacity: 0, y: 15 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ delay: 0.3 }}
							className="flex flex-col sm:flex-row gap-3 justify-center"
						>
							<Link
								to="/referral"
								className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-7 py-3.5 rounded-xl hover:shadow-[0_0_25px_rgba(168,85,247,0.3)] transition-all text-sm"
							>
								<Gift className="w-4 h-4" />
								Davet Kodumu Gör
								<ArrowRight className="w-4 h-4" />
							</Link>
							<Link
								to="/signup"
								className="inline-flex items-center justify-center gap-2.5 bg-white/[0.05] border border-white/[0.08] hover:border-purple-500/20 text-white font-bold px-7 py-3.5 rounded-xl transition-all text-sm"
							>
								<Sparkles className="w-4 h-4 text-amber-400" />
								Hemen Üye Ol
							</Link>
						</motion.div>
					</div>
				</div>
			</section>

			{/* ═══════════════════════════════════════════════════════
			    §7  MOBILE APP CTA
			═══════════════════════════════════════════════════════ */}
			<section className="relative py-20 overflow-hidden">
				<div className="absolute inset-0 bg-gradient-to-r from-emerald-900/40 via-teal-900/50 to-emerald-900/40" />
				<div className="absolute top-0 left-[20%] w-96 h-96 bg-emerald-500/[0.06] rounded-full blur-3xl" />
				<div className="absolute bottom-0 right-[20%] w-96 h-96 bg-teal-500/[0.06] rounded-full blur-3xl" />

				<div className="container mx-auto px-4 relative z-10">
					<div className="max-w-2xl mx-auto text-center">
						<motion.div
							initial={{ opacity: 0, y: 15 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							className="inline-flex items-center gap-3 mb-5"
						>
							<div className="w-12 h-12 bg-white/[0.08] backdrop-blur-xl rounded-xl border border-white/[0.1] flex items-center justify-center">
								<Smartphone className="w-6 h-6 text-white" />
							</div>
							<h2 className="text-2xl sm:text-3xl font-black text-white">Mobil Uygulamamızı İndirin!</h2>
						</motion.div>

						<motion.p
							initial={{ opacity: 0 }}
							whileInView={{ opacity: 1 }}
							viewport={{ once: true }}
							transition={{ delay: 0.1 }}
							className="text-white/70 text-sm mb-8 max-w-lg mx-auto"
						>
							Daha hızlı sipariş, anlık bildirimler ve özel indirimler için mobil uygulamamızı indirin!
						</motion.p>

						<motion.div
							initial={{ opacity: 0, y: 15 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ delay: 0.2 }}
							className="flex flex-col sm:flex-row gap-3 justify-center"
						>
							<a
								href={APP_STORE_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center justify-center gap-3 bg-white text-gray-900 font-bold px-7 py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all text-sm hover:scale-[1.03]"
							>
								<svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
									<path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
								</svg>
								App Store
								<ExternalLink className="w-3.5 h-3.5" />
							</a>
							<a
								href={PLAY_STORE_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center justify-center gap-3 bg-white text-gray-900 font-bold px-7 py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all text-sm hover:scale-[1.03]"
							>
								<Download className="w-5 h-5" />
								Play Store
								<ExternalLink className="w-3.5 h-3.5" />
							</a>
						</motion.div>
					</div>
				</div>
			</section>
		</div>
	);
};

export default HomePage;