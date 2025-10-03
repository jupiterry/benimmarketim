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
		<div className="relative overflow-hidden">
			{/* Arka Plan Gradient */}
			<div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-red-500/10 rounded-3xl"></div>
			<div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/20 to-gray-900/40 rounded-3xl"></div>
			
			<div className="relative bg-gray-900/60 rounded-3xl p-8 backdrop-blur-xl border border-purple-500/20 shadow-2xl">
				{/* Header */}
				<div className="text-center mb-8">
					<motion.div 
						className="inline-flex items-center gap-3 mb-4"
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6 }}
					>
						<div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
							<span className="text-2xl">💎</span>
						</div>
						<h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
							Önerilen Ürünler
						</h2>
						<div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-red-500 rounded-full flex items-center justify-center shadow-lg">
							<span className="text-2xl">✨</span>
						</div>
					</motion.div>
					<motion.p 
						className="text-gray-300 text-lg max-w-2xl mx-auto"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.6, delay: 0.2 }}
					>
						Size özel seçtiğimiz popüler ürünler! 🎯
					</motion.p>
				</div>

				{/* Products Grid */}
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
					{displayedProducts.map((product, index) => (
						<motion.div
							key={product._id}
							className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/30 hover:border-purple-500/50 flex flex-col shadow-xl hover:shadow-2xl transition-all duration-500"
							initial={{ opacity: 0, y: 30, scale: 0.9 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							transition={{ duration: 0.5, delay: index * 0.1 }}
							whileHover={{ y: -8, scale: 1.02 }}
						>
							{/* Glow Effect */}
							<div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl"></div>
							
							<ProductCard product={product} />
						</motion.div>
					))}
				</div>

				{/* Bottom Badge */}
				<motion.div
					className="mt-8 flex justify-center"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.8 }}
				>
					<div className="flex items-center gap-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm px-6 py-3 rounded-2xl border border-purple-500/30 shadow-lg">
						<TrendingUp className="w-5 h-5 text-purple-400" />
						<span className="text-purple-300 font-medium">Bu ürünler çok popüler!</span>
						<span className="text-xl">🔥</span>
					</div>
				</motion.div>
			</div>
		</div>
	);
};

export default PeopleAlsoBought;