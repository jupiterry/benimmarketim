import { useEffect, useState, useCallback } from "react";
import ProductCard from "./ProductCard";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import LoadingSpinner from "./LoadingSpinner";
import { motion } from "framer-motion";
import { TrendingUp, Star } from "lucide-react";
import { useProductStore } from "../stores/useProductStore";

const PeopleAlsoBought = () => {
	const [recommendations, setRecommendations] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const { products } = useProductStore();

	const fetchRecommendations = useCallback(async () => {
		try {
			const res = await axios.get("/products/recommendations", {
				params: { limit: 10 }
			});
			const updatedRecommendations = res.data.map(rec => {
				const updatedProduct = products.find(p => p._id === rec._id);
				return updatedProduct || rec;
			});
			setRecommendations(updatedRecommendations);
		} catch (error) {
			console.error("Öneriler yüklenirken hata:", error);
			toast.error("Öneriler yüklenirken bir hata oluştu");
		} finally {
			setIsLoading(false);
		}
	}, [products]);

	useEffect(() => {
		fetchRecommendations();
	}, [fetchRecommendations]);

	if (isLoading) return (
		<div className="flex justify-center items-center min-h-[200px]">
			<LoadingSpinner />
		</div>
	);

	const displayedProducts = recommendations.slice(0, 9);

	if (displayedProducts.length === 0) {
		return null;
	}

	return (
		<motion.div
			className="mt-8 bg-gradient-to-b from-gray-800/50 to-gray-900/50 backdrop-blur-sm rounded-2xl p-4 sm:p-6 md:p-8 border border-gray-700/50 shadow-xl"
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5 }}
		>
			<div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
				<div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 text-emerald-400">
					<Star className="w-5 h-5 sm:w-6 sm:h-6" />
				</div>
				<div>
					<h3 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
						Haftanın Yıldızları
					</h3>
					<p className="text-gray-400 text-xs sm:text-sm md:text-base mt-1">
						En çok tercih edilen ürünleri keşfedin
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4 md:gap-6">
				{displayedProducts.map((product, index) => (
					<motion.div
						key={product._id}
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.3, delay: index * 0.1 }}
						className="w-full"
					>
						<ProductCard product={product} />
					</motion.div>
				))}
			</div>

			<motion.div
				className="mt-6 sm:mt-8 flex justify-center"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.5 }}
			>
				<div className="flex items-center gap-2 text-gray-400 bg-gray-800/30 px-3 sm:px-4 py-2 rounded-xl border border-gray-700/30">
					<TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
					<span className="text-xs sm:text-sm">Bu ürünler çok satıyor!</span>
				</div>
			</motion.div>
		</motion.div>
	);
};

export default PeopleAlsoBought;