import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "../stores/useCartStore";
import { Gift, X, Check, Ticket, Sparkles, Clock, Tag, ChevronDown, ChevronUp } from "lucide-react";
import axios from "../lib/axios";

const GiftCouponCard = () => {
	const { applyCoupon, removeCoupon, coupon, isCouponApplied } = useCartStore();
	const [code, setCode] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [availableCoupons, setAvailableCoupons] = useState([]);
	const [showAvailable, setShowAvailable] = useState(true);
	const [loadingCoupons, setLoadingCoupons] = useState(false);

	// Kullanıcının kuponlarını getir
	useEffect(() => {
		fetchUserCoupons();
	}, []);

	const fetchUserCoupons = async () => {
		try {
			setLoadingCoupons(true);
			const response = await axios.get("/coupons");
			if (response.data.success && response.data.coupons) {
				setAvailableCoupons(response.data.coupons);
			}
		} catch (error) {
			console.error("Kuponlar getirilirken hata:", error);
		} finally {
			setLoadingCoupons(false);
		}
	};

	const handleApplyCoupon = async (couponCode = code) => {
		if (!couponCode.trim()) return;
		setIsLoading(true);
		try {
			await applyCoupon(couponCode);
			setCode("");
		} finally {
			setIsLoading(false);
		}
	};

	const formatDate = (date) => {
		return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
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
									<p className="text-sm text-gray-400">
										{coupon.discountType === 'fixed' 
											? `₺${coupon.discountAmount || coupon.calculatedDiscount} İndirim`
											: `%${coupon.discountPercentage || 0} İndirim`
										}
									</p>
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
						{/* Mevcut Kuponlar */}
						{availableCoupons.length > 0 && (
							<div className="mb-4">
								<button
									onClick={() => setShowAvailable(!showAvailable)}
									className="flex items-center justify-between w-full text-left"
								>
									<div className="flex items-center gap-2">
										<Sparkles className="w-4 h-4 text-purple-400" />
										<span className="text-sm font-medium text-purple-300">
											Kullanılabilir Kuponlar ({availableCoupons.length})
										</span>
									</div>
									{showAvailable ? (
										<ChevronUp className="w-4 h-4 text-gray-400" />
									) : (
										<ChevronDown className="w-4 h-4 text-gray-400" />
									)}
								</button>
								
								<AnimatePresence>
									{showAvailable && (
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											className="mt-3 space-y-2"
										>
											{availableCoupons.slice(0, 3).map((c) => (
												<motion.div
													key={c._id}
													whileHover={{ scale: 1.02 }}
													className={`p-3 rounded-lg border cursor-pointer transition-all ${
														c.isReferralCoupon || c.userId
															? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30'
															: 'bg-gray-700/50 border-gray-600/50 hover:border-emerald-500/50'
													}`}
													onClick={() => handleApplyCoupon(c.code)}
												>
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-3">
															<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
																c.isReferralCoupon || c.userId
																	? 'bg-gradient-to-br from-purple-500 to-pink-600'
																	: 'bg-emerald-500/20'
															}`}>
																{c.isReferralCoupon || c.userId ? (
																	<Gift className="w-5 h-5 text-white" />
																) : (
																	<Tag className="w-5 h-5 text-emerald-400" />
																)}
															</div>
															<div>
																<div className="flex items-center gap-2">
																	<span className="font-mono font-bold text-white">{c.code}</span>
																	{(c.isReferralCoupon || c.userId) && (
																		<span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">
																			Size Özel
																		</span>
																	)}
																</div>
																<p className="text-xs text-gray-400">{c.description}</p>
															</div>
														</div>
														<div className="text-right">
															<p className="text-lg font-bold text-emerald-400">
																{c.discountType === 'percentage' 
																	? `%${c.discountPercentage}` 
																	: `₺${c.discountAmount}`
																}
															</p>
															<div className="flex items-center gap-1 text-xs text-gray-500">
																<Clock className="w-3 h-3" />
																{formatDate(c.expirationDate)}
															</div>
														</div>
													</div>
												</motion.div>
											))}
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						)}

						{/* Manuel Kod Girişi */}
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
								onClick={() => handleApplyCoupon()}
								disabled={isLoading || !code.trim()}
								className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isLoading ? "Uygulanıyor..." : "Uygula"}
							</motion.button>
						</div>
						
						{availableCoupons.length === 0 && (
							<div className="flex items-center gap-2 text-sm text-gray-400">
								<Gift className="w-4 h-4" />
								<p>Kupon kodunuz varsa buraya girebilirsiniz</p>
							</div>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

export default GiftCouponCard;
