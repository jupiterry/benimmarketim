import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { LogIn, Mail, Lock, ArrowRight, Loader } from "lucide-react";
import { useUserStore } from "../stores/useUserStore";

const LoginPage = () => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const { login, loading } = useUserStore();

	const handleSubmit = (e) => {
		e.preventDefault();
		login(email, password);
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 relative overflow-hidden">
			{/* Animated Background Elements */}
			<div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
			<div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
			<div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
			
			<motion.div
				className="relative w-full max-w-md px-8 pt-12 pb-10 bg-gray-800/30 shadow-2xl backdrop-blur-xl rounded-3xl border border-gray-700/50"
				initial={{ opacity: 0, y: 20, scale: 0.95 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
			>
				<motion.div
					className="mx-auto w-fit mb-8"
					initial={{ scale: 0, rotate: -180 }}
					animate={{ scale: 1, rotate: 0 }}
					transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
				>
					<div className="relative">
						<div className="w-24 h-24 bg-gradient-to-tr from-emerald-500 via-emerald-400 to-emerald-300 rounded-3xl flex items-center justify-center shadow-2xl">
							<LogIn className="w-12 h-12 text-white" />
						</div>
						<div className="absolute -inset-1 bg-gradient-to-tr from-emerald-500 to-emerald-300 rounded-3xl blur opacity-30 animate-pulse"></div>
					</div>
				</motion.div>

				<motion.div
					className="text-center mb-8"
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.3 }}
				>
					<h2 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-200 bg-clip-text text-transparent mb-2">
						Hoş Geldiniz
					</h2>
					<p className="text-gray-400 text-sm">
						Hesabınıza giriş yapın ve alışverişe başlayın
					</p>
				</motion.div>

				<form onSubmit={handleSubmit} className="space-y-6">
					<motion.div
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.5, delay: 0.4 }}
					>
						<label className="block text-sm font-medium text-gray-300 mb-2">
							E-Mail
						</label>
						<div className="relative">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
								<Mail className="h-5 w-5 text-emerald-400" />
							</div>
							<input
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="block w-full pl-10 px-4 py-4 bg-gray-700/30 border border-gray-600/50 rounded-2xl 
								text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
								focus:border-emerald-500/50 transition-all duration-300 hover:bg-gray-700/40"
								placeholder="benimmarketim@example.com"
							/>
						</div>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.5, delay: 0.5 }}
					>
						<label className="block text-sm font-medium text-gray-300 mb-2">
							Parola
						</label>
						<div className="relative">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
								<Lock className="h-5 w-5 text-emerald-400" />
							</div>
							<input
								type="password"
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="block w-full pl-10 px-4 py-4 bg-gray-700/30 border border-gray-600/50 rounded-2xl 
								text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 
								focus:border-emerald-500/50 transition-all duration-300 hover:bg-gray-700/40"
								placeholder="••••••••"
							/>
						</div>
					</motion.div>

					<motion.button
						type="submit"
						className="relative w-full group overflow-hidden"
						disabled={loading}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.6 }}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 rounded-2xl blur opacity-60 group-hover:opacity-100 transition duration-300"></div>
						<div className="relative flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-emerald-600 to-emerald-500 
						hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-2xl 
						disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300">
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

					<motion.p
						className="mt-8 text-center text-sm text-gray-400"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.5, delay: 0.7 }}
					>
						Hala üye değil misiniz?{" "}
						<Link 
							to="/signup" 
							className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 group"
						>
							Hemen Hesap Oluşturun
							<ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
						</Link>
					</motion.p>
				</form>
			</motion.div>
		</div>
	);
};

export default LoginPage;
