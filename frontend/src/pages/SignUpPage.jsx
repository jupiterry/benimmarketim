import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Mail, Lock, User, ArrowRight, Loader, Phone } from "lucide-react";
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

	const { signup, loading } = useUserStore();

	const handleSubmit = (e) => {
		e.preventDefault();
		signup(formData);
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 relative overflow-hidden">
			{/* Animated Background Elements */}
			<div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
			<div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
			<div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>

			<motion.div
				className="max-w-md w-full space-y-8 p-6 relative z-10 mt-16"
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8 }}
			>
				<div>
					<motion.div
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.3 }}
						className="mt-6 text-center mb-8"
					>
						<motion.div
							className="mx-auto w-fit mb-6"
							initial={{ scale: 0, rotate: -180 }}
							animate={{ scale: 1, rotate: 0 }}
							transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.4 }}
						>
							<div className="relative">
								<div className="w-24 h-24 bg-gradient-to-tr from-emerald-500 via-emerald-400 to-emerald-300 rounded-3xl flex items-center justify-center shadow-2xl">
									<UserPlus className="w-12 h-12 text-white" />
								</div>
								<div className="absolute -inset-1 bg-gradient-to-tr from-emerald-500 to-emerald-300 rounded-3xl blur opacity-30 animate-pulse"></div>
							</div>
						</motion.div>
						<h2 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-200 bg-clip-text text-transparent mb-2">
							Hesabını Oluştur
						</h2>
						<p className="text-gray-400 text-sm">
							Hemen üye ol, alışverişin keyfini çıkar!
						</p>
					</motion.div>
				</div>

				<motion.div
					className="backdrop-blur-xl bg-white/5 rounded-2xl p-8 shadow-2xl border border-white/10"
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.5, delay: 0.4 }}
				>
					<form onSubmit={handleSubmit} className="space-y-6">
						<motion.div
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5, delay: 0.5 }}
						>
							<label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
								İsim Soyisim
							</label>
							<div className="relative group">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
									<User className="h-5 w-5 text-emerald-400" />
								</div>
								<input
									id="name"
									type="text"
									required
									value={formData.name}
									onChange={(e) => setFormData({ ...formData, name: e.target.value })}
									className="block w-full pl-10 px-4 py-4 bg-gray-800/30 border border-gray-700/50 rounded-2xl 
									text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
									focus:border-emerald-500/50 transition-all duration-300 hover:bg-gray-800/40"
									placeholder="Örn: Ahmet Yılmaz"
									pattern="^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]{2,}\s+[a-zA-ZğüşıöçĞÜŞİÖÇ\s]{2,}$"
									title="Lütfen geçerli bir isim ve soyisim giriniz (en az ikişer harfli)"
								/>
								<div className="absolute inset-0 rounded-xl border border-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
							</div>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5, delay: 0.6 }}
						>
							<label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">
								Telefon Numarası
							</label>
							<div className="relative group">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
									<Phone className="h-5 w-5 text-emerald-400" />
								</div>
								<input
									id="phone"
									type="tel"
									required
									value={formData.phone}
									onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
									className="block w-full pl-10 px-4 py-4 bg-gray-800/30 border border-gray-700/50 rounded-2xl 
									text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
									focus:border-emerald-500/50 transition-all duration-300 hover:bg-gray-800/40"
									placeholder="05XX XXX XX XX"
								/>
								<div className="absolute inset-0 rounded-xl border border-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
							</div>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5, delay: 0.7 }}
						>
							<label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
								E-Mail
							</label>
							<div className="relative group">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
									<Mail className="h-5 w-5 text-emerald-400" />
								</div>
								<input
									id="email"
									type="email"
									required
									value={formData.email}
									onChange={(e) => setFormData({ ...formData, email: e.target.value })}
									className="block w-full pl-10 px-4 py-4 bg-gray-800/30 border border-gray-700/50 rounded-2xl 
									text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
									focus:border-emerald-500/50 transition-all duration-300 hover:bg-gray-800/40"
									placeholder="benimmarketim@example.com"
								/>
								<div className="absolute inset-0 rounded-xl border border-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
							</div>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5, delay: 0.8 }}
						>
							<label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
								Şifre
							</label>
							<div className="relative group">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
									<Lock className="h-5 w-5 text-emerald-400" />
								</div>
								<input
									id="password"
									type="password"
									required
									value={formData.password}
									onChange={(e) => setFormData({ ...formData, password: e.target.value })}
									className="block w-full pl-10 px-4 py-4 bg-gray-800/30 border border-gray-700/50 rounded-2xl 
									text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
									focus:border-emerald-500/50 transition-all duration-300 hover:bg-gray-800/40"
									placeholder="••••••••"
								/>
								<div className="absolute inset-0 rounded-xl border border-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
							</div>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.5, delay: 0.9 }}
						>
							<label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
								Şifre Onay
							</label>
							<div className="relative group">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
									<Lock className="h-5 w-5 text-emerald-400" />
								</div>
								<input
									id="confirmPassword"
									type="password"
									required
									value={formData.confirmPassword}
									onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
									className="block w-full pl-10 px-4 py-4 bg-gray-800/30 border border-gray-700/50 rounded-2xl 
									text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
									focus:border-emerald-500/50 transition-all duration-300 hover:bg-gray-800/40"
									placeholder="••••••••"
								/>
								<div className="absolute inset-0 rounded-xl border border-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
							</div>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: 1 }}
						>
							<button
								type="submit"
								className="relative w-full group overflow-hidden"
								disabled={loading}
							>
								<div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 rounded-2xl blur opacity-60 group-hover:opacity-100 transition duration-300"></div>
								<div className="relative flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-emerald-600 to-emerald-500 
								hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-2xl 
								disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300">
									{loading ? (
										<>
											<Loader className="h-5 w-5 animate-spin" />
											<span>Kayıt Olunuyor...</span>
										</>
									) : (
										<>
											<UserPlus className="h-5 w-5" />
											<span>Kayıt Ol</span>
										</>
									)}
								</div>
							</button>
						</motion.div>
					</form>

					<motion.p
						className="mt-8 text-center text-sm text-gray-400"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.5, delay: 1.1 }}
					>
						Zaten bir hesabınız var mı?{" "}
						<Link 
							to="/login" 
							className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 group"
						>
							Buradan giriş yapın
							<ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
						</Link>
					</motion.p>
				</motion.div>
			</motion.div>
		</div>
	);
};

export default SignUpPage;
