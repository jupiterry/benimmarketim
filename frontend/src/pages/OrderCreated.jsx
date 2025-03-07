import { CheckCircle, Package2, Clock, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUserStore } from "../stores/useUserStore";
import FeedbackForm from "../components/FeedbackForm";
import axios from "../lib/axios";

const OrderCreated = () => {
	const navigate = useNavigate();
	const { user } = useUserStore();
	const [showFeedback, setShowFeedback] = useState(false);

	useEffect(() => {
		const checkFeedbackStatus = async () => {
			try {
				const response = await axios.get(`/users/${user._id}`);
				setShowFeedback(!response.data.hasFeedback);
			} catch (error) {
				console.error("Kullanıcı durumu kontrol edilirken hata:", error);
			}
		};

		checkFeedbackStatus();
	}, [user._id]);

	const handleContinue = () => {
		if (showFeedback) {
			return; // Geri bildirim gerekiyorsa devam etmeyi engelle
		}
		navigate("/");
	};

	const container = {
		hidden: { opacity: 0 },
		show: {
			opacity: 1,
			transition: {
				staggerChildren: 0.2,
				delayChildren: 0.3
			}
		}
	};

	const item = {
		hidden: { opacity: 0, y: 20 },
		show: { opacity: 1, y: 0 }
	};

	return (
		<div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-gray-900 to-gray-800">
			{/* Arka plan efektleri */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-b from-emerald-500/10 to-transparent rounded-full blur-3xl" />
				<div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-t from-emerald-500/10 to-transparent rounded-full blur-3xl" />
			</div>

			<motion.div
				variants={container}
				initial="hidden"
				animate="show"
				className="max-w-lg w-full space-y-8"
			>
				{/* Başarı Kartı */}
				<motion.div
					variants={item}
					className="bg-gray-800/50 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-gray-700/50"
				>
					<div className="p-8">
						<div className="flex justify-center">
							<motion.div
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{
									type: "spring",
									stiffness: 260,
									damping: 20,
									delay: 0.2
								}}
								className="relative"
							>
								<div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/30 to-teal-500/30 rounded-full blur-xl" />
								<CheckCircle className="w-20 h-20 text-emerald-500 relative" />
							</motion.div>
						</div>

						<motion.h1
							variants={item}
							className="mt-8 text-3xl font-bold text-center bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent"
						>
							Satın Alım İşlemi Tamamlandı
						</motion.h1>

						<motion.p
							variants={item}
							className="mt-4 text-gray-400 text-center"
						>
							{showFeedback 
								? "Devam etmeden önce lütfen deneyiminizi değerlendirin"
								: "Siparişiniz başarıyla oluşturuldu. Teşekkür ederiz!"}
						</motion.p>
					</div>

					{/* Sipariş Durumu Kartları */}
					<motion.div
						variants={item}
						className="grid grid-cols-3 divide-x divide-gray-700/50 border-t border-gray-700/50"
					>
						<div className="p-4 text-center">
							<Package2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
							<p className="text-sm font-medium text-gray-300">Hazırlanıyor</p>
						</div>
						<div className="p-4 text-center">
							<Clock className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
							<p className="text-sm font-medium text-gray-300">Takip Edilebilir</p>
						</div>
						<div className="p-4 text-center">
							<MapPin className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
							<p className="text-sm font-medium text-gray-300">Adrese Teslim</p>
						</div>
					</motion.div>
				</motion.div>

				{/* Bilgi Kartı */}
				<motion.div
					variants={item}
					className="bg-gray-800/50 backdrop-blur-xl rounded-xl p-6 border border-gray-700/50"
				>
					<p className="text-sm text-gray-400 text-center">
						Sipariş ayrıntıları ve güncellemeler için{" "}
						<Link
							to="/siparislerim"
							className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
						>
							siparişlerim
						</Link>{" "}
						bölümünü kontrol edebilirsiniz.
					</p>
				</motion.div>

				{/* Butonlar */}
				<motion.div variants={item} className="flex flex-col gap-3">
					<Link
						to="/siparislerim"
						className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl transition duration-300 flex items-center justify-center shadow-lg shadow-emerald-500/20"
					>
						Siparişlerimi Görüntüle
					</Link>
					{showFeedback ? (
						<FeedbackForm onComplete={() => setShowFeedback(false)} />
					) : (
						<button
							onClick={handleContinue}
							className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl transition duration-300 flex items-center justify-center shadow-lg shadow-emerald-500/20"
						>
							Alışverişe Devam Et
						</button>
					)}
				</motion.div>
			</motion.div>
		</div>
	);
};

export default OrderCreated;
