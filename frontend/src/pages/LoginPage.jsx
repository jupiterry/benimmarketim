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
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900">
			<div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
			
			<motion.div
				className="relative w-full max-w-md px-6 pt-10 pb-8 bg-gray-800/50 shadow-xl backdrop-blur-xl rounded-3xl border border-gray-700"
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8 }}
			>
				<motion.div
					className="mx-auto w-fit"
					initial={{ scale: 0 }}
					animate={{ scale: 1 }}
					transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
				>
					<div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-emerald-300 rounded-2xl flex items-center justify-center shadow-lg mb-8">
						<LogIn className="w-10 h-10 text-white" />
					</div>
				</motion.div>

				<motion.h2 
					className="text-center text-3xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent mb-8"
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.3 }}
				>
					Giriş Yap
				</motion.h2>

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
								className="block w-full pl-10 px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl 
								text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 
								focus:border-transparent transition-all duration-200"
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
								className="block w-full pl-10 px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl 
								text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 
								focus:border-transparent transition-all duration-200"
								placeholder="••••••••"
							/>
						</div>
					</motion.div>

					<motion.button
						type="submit"
						className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 
						hover:from-emerald-500 hover:to-emerald-400 text-white font-medium rounded-xl focus:outline-none 
						focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-800 
						disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02]"
						disabled={loading}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.6 }}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
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
