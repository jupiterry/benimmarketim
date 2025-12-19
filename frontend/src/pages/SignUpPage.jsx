import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Mail, Lock, User, ArrowRight, Loader, Phone, ShoppingCart, Sparkles, Eye, EyeOff, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { useUserStore } from "../stores/useUserStore";

const SignUpPage = () => {
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		password: "",
		confirmPassword: "",
		phone: "",
	});
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);

	const { signup, loading } = useUserStore();

	const handleSubmit = (e) => {
		e.preventDefault();
		signup(formData);
	};

	// Password strength check
	const passwordChecks = [
		{ label: "En az 6 karakter", valid: formData.password.length >= 6 },
		{ label: "Şifreler eşleşiyor", valid: formData.password === formData.confirmPassword && formData.confirmPassword.length > 0 }
	];

	// Features
	const features = [
		{ icon: "🎁", text: "Özel İndirimler" },
		{ icon: "🚀", text: "Hızlı Teslimat" },
		{ icon: "📱", text: "Mobil Uygulama" }
	];

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-[#0a1218] to-gray-900 relative overflow-hidden px-4 py-8">
			{/* Animated Background */}
			<div className="absolute inset-0 overflow-hidden">
				<div className="absolute top-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse"></div>
				<div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-teal-500/5 to-emerald-500/5 rounded-full blur-3xl"></div>
			</div>
			
			{/* Grid Pattern */}
			<div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-5"></div>
			
			{/* Main Content */}
			<div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
				{/* Left Side - Branding */}
				<motion.div
					initial={{ opacity: 0, x: -50 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.8 }}
					className="hidden lg:block"
				>
					<div className="flex items-center gap-3 mb-8">
						<div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/30">
							<ShoppingCart className="w-8 h-8 text-white" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-white">Benim Marketim</h1>
							<p className="text-emerald-400 text-sm">Online Alışveriş</p>
						</div>
					</div>
					
					<h2 className="text-4xl font-bold text-white mb-4 leading-tight">
						Ailemize <br />
						<span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
							Katılın
						</span>
					</h2>
					
					<p className="text-gray-400 text-lg mb-8">
						Ücretsiz hesap oluşturun ve ayrıcalıklı fırsatlardan yararlanın. Alışverişin keyfini çıkarın!
					</p>
					
					<div className="space-y-4">
						{features.map((feature, index) => (
							<motion.div
								key={index}
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: 0.3 + index * 0.1 }}
								className="flex items-center gap-3"
							>
								<div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl">
									{feature.icon}
								</div>
								<span className="text-gray-300">{feature.text}</span>
							</motion.div>
						))}
					</div>

					{/* Trust Badge */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.6 }}
						className="mt-10 p-4 bg-white/5 rounded-2xl border border-white/10"
					>
						<div className="flex items-center gap-3">
							<div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center">
								<span className="text-2xl">⭐</span>
							</div>
							<div>
								<p className="text-white font-semibold">1000+ Mutlu Müşteri</p>
								<p className="text-gray-400 text-sm">Güvenle alışveriş yapın</p>
							</div>
						</div>
					</motion.div>
				</motion.div>

				{/* Right Side - Sign Up Form */}
				<motion.div
					initial={{ opacity: 0, y: 20, scale: 0.95 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={{ duration: 0.8 }}
					className="w-full"
				>
					<div className="bg-gray-800/40 backdrop-blur-2xl rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl">
						{/* Mobile Logo */}
						<div className="lg:hidden flex justify-center mb-6">
							<div className="flex items-center gap-3">
								<div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
									<ShoppingCart className="w-6 h-6 text-white" />
								</div>
								<div>
									<h1 className="text-xl font-bold text-white">Benim Marketim</h1>
									<p className="text-emerald-400 text-xs">Online Alışveriş</p>
								</div>
							</div>
						</div>

						{/* Header */}
						<div className="text-center mb-6">
							<motion.div
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ type: "spring", stiffness: 300, damping: 20 }}
								className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 border border-teal-500/20 rounded-full mb-4"
							>
								<Sparkles className="w-4 h-4 text-teal-400" />
								<span className="text-teal-400 text-sm font-medium">Ücretsiz Kayıt</span>
							</motion.div>
							<h2 className="text-2xl font-bold text-white mb-2">Hesap Oluştur</h2>
							<p className="text-gray-400 text-sm">Hemen üye ol, alışverişe başla!</p>
						</div>

						<form onSubmit={handleSubmit} className="space-y-4">
							{/* Name */}
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-1.5">
									İsim Soyisim
								</label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<User className="h-5 w-5 text-emerald-400" />
									</div>
									<input
										type="text"
										required
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										className="block w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl 
										text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
										focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/[0.07]"
										placeholder="Örn: Ahmet Yılmaz"
										pattern="^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]{2,}\s+[a-zA-ZğüşıöçĞÜŞİÖÇ\s]{2,}$"
										title="Lütfen geçerli bir isim ve soyisim giriniz"
									/>
								</div>
							</div>

							{/* Phone */}
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-1.5">
									Telefon Numarası
								</label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<Phone className="h-5 w-5 text-emerald-400" />
									</div>
									<input
										type="tel"
										required
										value={formData.phone}
										onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
										className="block w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl 
										text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
										focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/[0.07]"
										placeholder="05XX XXX XX XX"
									/>
								</div>
							</div>

							{/* Email */}
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-1.5">
									E-Mail Adresi
								</label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<Mail className="h-5 w-5 text-emerald-400" />
									</div>
									<input
										type="email"
										required
										value={formData.email}
										onChange={(e) => setFormData({ ...formData, email: e.target.value })}
										className="block w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl 
										text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
										focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/[0.07]"
										placeholder="ornek@email.com"
									/>
								</div>
							</div>

							{/* Password */}
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-1.5">
									Şifre
								</label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<Lock className="h-5 w-5 text-emerald-400" />
									</div>
									<input
										type={showPassword ? "text" : "password"}
										required
										value={formData.password}
										onChange={(e) => setFormData({ ...formData, password: e.target.value })}
										className="block w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl 
										text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
										focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/[0.07]"
										placeholder="••••••••"
									/>
									<button
										type="button"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors"
									>
										{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
									</button>
								</div>
							</div>

							{/* Confirm Password */}
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-1.5">
									Şifre Onayı
								</label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<Lock className="h-5 w-5 text-emerald-400" />
									</div>
									<input
										type={showConfirmPassword ? "text" : "password"}
										required
										value={formData.confirmPassword}
										onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
										className="block w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl 
										text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
										focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/[0.07]"
										placeholder="••••••••"
									/>
									<button
										type="button"
										onClick={() => setShowConfirmPassword(!showConfirmPassword)}
										className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors"
									>
										{showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
									</button>
								</div>
							</div>

							{/* Password Strength Indicators */}
							{formData.password && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									className="flex flex-wrap gap-2"
								>
									{passwordChecks.map((check, index) => (
										<div
											key={index}
											className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
												check.valid
													? "bg-emerald-500/20 text-emerald-400"
													: "bg-gray-700/50 text-gray-400"
											}`}
										>
											{check.valid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
											{check.label}
										</div>
									))}
								</motion.div>
							)}

							{/* Referral Code - İsteğe Bağlı */}
							<div className="pt-2">
								<label className="block text-sm font-medium text-gray-300 mb-1.5">
									<div className="flex items-center justify-between">
										<span className="flex items-center gap-2">
											<Gift className="w-4 h-4 text-purple-400" />
											Davet Kodu
										</span>
										<span className="text-xs text-gray-500">(İsteğe Bağlı)</span>
									</div>
								</label>
								<div className="relative">
									<input
										type="text"
										value={referralCode}
										onChange={handleReferralCodeChange}
										className={`block w-full px-4 py-3.5 bg-white/5 border rounded-xl 
										text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all duration-300 hover:bg-white/[0.07]
										${referralValid === true 
											? 'border-emerald-500/50 focus:ring-emerald-500/50 focus:border-emerald-500/50' 
											: referralValid === false 
											? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50'
											: 'border-white/10 focus:ring-purple-500/50 focus:border-purple-500/50'
										}`}
										placeholder="REF123ABC"
										maxLength={12}
									/>
									<div className="absolute inset-y-0 right-0 pr-4 flex items-center">
										{checkingReferral ? (
											<Loader className="w-4 h-4 text-gray-400 animate-spin" />
										) : referralValid === true ? (
											<Check className="w-5 h-5 text-emerald-400" />
										) : referralValid === false ? (
											<X className="w-5 h-5 text-red-400" />
										) : null}
									</div>
								</div>
								{referralMessage && (
									<motion.p
										initial={{ opacity: 0, y: -5 }}
										animate={{ opacity: 1, y: 0 }}
										className={`text-xs mt-1.5 ${referralValid ? 'text-emerald-400' : 'text-red-400'}`}
									>
										{referralValid && '🎁 '}{referralMessage}
										{referralValid && ' - İlk siparişte %15 indirim!'}
									</motion.p>
								)}
								{!referralCode && (
									<p className="text-xs text-gray-500 mt-1.5">
										Arkadaşınızdan aldığınız davet kodunu girin ve ilk siparişinizde %15 indirim kazanın!
									</p>
								)}
							</div>
							<motion.button
								type="submit"
								disabled={loading}
								whileHover={{ scale: 1.02 }}
								whileTap={{ scale: 0.98 }}
								className="relative w-full mt-4"
							>
								<div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl blur opacity-60 group-hover:opacity-100 transition duration-300"></div>
								<div className="relative flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 
								hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl 
								disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-emerald-500/30">
									{loading ? (
										<>
											<Loader className="w-5 h-5 animate-spin" />
											<span>Kayıt Olunuyor...</span>
										</>
									) : (
										<>
											<UserPlus className="w-5 h-5" />
											<span>Kayıt Ol</span>
										</>
									)}
								</div>
							</motion.button>
						</form>

						{/* Login Link */}
						<p className="text-center text-gray-400 mt-6 text-sm">
							Zaten hesabınız var mı?{" "}
							<Link 
								to="/login" 
								className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1"
							>
								Giriş Yapın
								<ArrowRight className="w-4 h-4" />
							</Link>
						</p>
					</div>
				</motion.div>
			</div>
		</div>
	);
};

export default SignUpPage;
