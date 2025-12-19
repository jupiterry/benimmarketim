import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { LogIn, Mail, Lock, ArrowRight, Loader, ShoppingCart, Sparkles, Eye, EyeOff } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";

const LoginPage = () => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const { login, loading } = useUserStore();

	const handleSubmit = (e) => {
		e.preventDefault();
		login(email, password);
	};

	// Features list
	const features = [
		{ icon: "🚀", text: "Hızlı Teslimat" },
		{ icon: "🛡️", text: "Güvenli Ödeme" },
		{ icon: "💯", text: "Kaliteli Ürünler" }
	];

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-[#0a1218] to-gray-900 relative overflow-hidden px-4 py-8">
			{/* Animated Background */}
			<div className="absolute inset-0 overflow-hidden">
				<div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
				<div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-full blur-3xl"></div>
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
						Alışverişin En <br />
						<span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
							Kolay Hali
						</span>
					</h2>
					
					<p className="text-gray-400 text-lg mb-8">
						Taze ürünler, hızlı teslimat ve kaliteli hizmet. Hesabınıza giriş yapın ve alışverişe başlayın.
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
				</motion.div>

				{/* Right Side - Login Form */}
				<motion.div
					initial={{ opacity: 0, y: 20, scale: 0.95 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={{ duration: 0.8 }}
					className="w-full"
				>
					<div className="bg-gray-800/40 backdrop-blur-2xl rounded-3xl p-8 md:p-10 border border-white/10 shadow-2xl">
						{/* Mobile Logo */}
						<div className="lg:hidden flex justify-center mb-8">
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
						<div className="text-center mb-8">
							<motion.div
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ type: "spring", stiffness: 300, damping: 20 }}
								className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4"
							>
								<Sparkles className="w-4 h-4 text-emerald-400" />
								<span className="text-emerald-400 text-sm font-medium">Hoş Geldiniz</span>
							</motion.div>
							<h2 className="text-3xl font-bold text-white mb-2">Giriş Yap</h2>
							<p className="text-gray-400">Hesabınıza erişin</p>
						</div>

						<form onSubmit={handleSubmit} className="space-y-5">
							{/* Email */}
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-2">
									E-Mail Adresi
								</label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<Mail className="h-5 w-5 text-emerald-400" />
									</div>
									<input
										type="email"
										required
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										className="block w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl 
										text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
										focus:border-emerald-500/50 transition-all duration-300 hover:bg-white/[0.07]"
										placeholder="ornek@email.com"
									/>
								</div>
							</div>

							{/* Password */}
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-2">
									Şifre
								</label>
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<Lock className="h-5 w-5 text-emerald-400" />
									</div>
									<input
										type={showPassword ? "text" : "password"}
										required
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										className="block w-full pl-12 pr-12 py-4 bg-white/5 border border-white/10 rounded-2xl 
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

							{/* Submit Button */}
							<motion.button
								type="submit"
								disabled={loading}
								whileHover={{ scale: 1.02 }}
								whileTap={{ scale: 0.98 }}
								className="relative w-full mt-6"
							>
								<div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl blur opacity-60 group-hover:opacity-100 transition duration-300"></div>
								<div className="relative flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 
								hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-2xl 
								disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-emerald-500/30">
									{loading ? (
										<>
											<Loader className="w-5 h-5 animate-spin" />
											<span>Giriş Yapılıyor...</span>
										</>
									) : (
										<>
											<LogIn className="w-5 h-5" />
											<span>Giriş Yap</span>
										</>
									)}
								</div>
							</motion.button>
						</form>

						{/* Divider */}
						<div className="relative my-8">
							<div className="absolute inset-0 flex items-center">
								<div className="w-full border-t border-white/10"></div>
							</div>
							<div className="relative flex justify-center">
								<span className="bg-gray-800/40 px-4 text-sm text-gray-500">veya</span>
							</div>
						</div>

						{/* Sign Up Link */}
						<p className="text-center text-gray-400">
							Hesabınız yok mu?{" "}
							<Link 
								to="/signup" 
								className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1"
							>
								Hemen Kayıt Olun
								<ArrowRight className="w-4 h-4" />
							</Link>
						</p>
					</div>
				</motion.div>
			</div>
		</div>
	);
};

export default LoginPage;
