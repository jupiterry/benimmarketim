import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "../stores/useCartStore";
import { Gift, X, Check, Ticket } from "lucide-react";

const GiftCouponCard = () => {
	const { applyCoupon, removeCoupon, coupon, isCouponApplied } = useCartStore();
	const [code, setCode] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleApplyCoupon = async () => {
		if (!code.trim()) return;
		setIsLoading(true);
		try {
			await applyCoupon(code);
			setCode("");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<motion.div
			className="rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm p-4 shadow-sm sm:p-6"
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5 }}
		>
			<div className="flex items-center gap-2 mb-4">
				<Gift className="w-5 h-5 text-emerald-400" />
				<h3 className="text-lg font-semibold text-white">Kupon Kodu</h3>
			</div>

			<AnimatePresence mode="wait">
				{isCouponApplied ? (
					<motion.div
						key="applied"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
						className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4"
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
									<Check className="w-5 h-5 text-emerald-500" />
								</div>
								<div>
									<p className="text-emerald-400 font-medium">{coupon.code}</p>
									<p className="text-sm text-gray-400">%{coupon.discountPercentage} İndirim</p>
								</div>
							</div>
							<motion.button
								whileHover={{ scale: 1.1 }}
								whileTap={{ scale: 0.9 }}
								onClick={removeCoupon}
								className="text-gray-400 hover:text-red-400 transition-colors"
							>
								<X className="w-5 h-5" />
							</motion.button>
						</div>
					</motion.div>
				) : (
					<motion.div
						key="input"
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						className="space-y-4"
					>
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
								<input
									type="text"
									value={code}
									onChange={(e) => setCode(e.target.value.toUpperCase())}
									placeholder="Kupon kodunuzu girin"
									className="w-full pl-10 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
								/>
							</div>
							<motion.button
								whileHover={{ scale: 1.02 }}
								whileTap={{ scale: 0.98 }}
								onClick={handleApplyCoupon}
								disabled={isLoading || !code.trim()}
								className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoading ? "Uygulanıyor..." : "Uygula"}
							</motion.button>
						</div>
						<div className="flex items-center gap-2 text-sm text-gray-400">
							<Gift className="w-4 h-4" />
							<p>Kupon kodunuz varsa buraya girebilirsiniz</p>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

export default GiftCouponCard;
