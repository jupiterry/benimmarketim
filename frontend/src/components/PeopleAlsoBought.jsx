import { useEffect, useState } from "react";
import ProductCard from "./ProductCard";
import axios from "../lib/axios";
import toast from "react-hot-toast";
import LoadingSpinner from "./LoadingSpinner";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Star } from "lucide-react";
import { useProductStore } from "../stores/useProductStore";

const PeopleAlsoBought = () => {
	const [recommendations, setRecommendations] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const { products } = useProductStore();

	const fetchRecommendations = async () => {
		try {
			const res = await axios.get("/products/recommendations", {
				params: {
					limit: 10
				}
			});
			// Ürünleri global store'dan güncelle
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
	};

	useEffect(() => {
		fetchRecommendations();
	}, [products]); // products değiştiğinde yeniden yükle

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
			className="mt-8 bg-gradient-to-b from-gray-800/50 to-gray-900/50 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-gray-700/50 shadow-xl"
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5 }}
		>
			<div className="flex items-center gap-3 mb-8">
				<div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400">
					<Star className="w-6 h-6" />
				</div>
				<div>
					<h3 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
						Haftanın Yıldızları
					</h3>
					<p className="text-gray-400 text-sm md:text-base mt-1">
						En çok tercih edilen ürünleri keşfedin
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
				{displayedProducts.map((product, index) => (
					<motion.div
						key={product._id}
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.3, delay: index * 0.1 }}
						className="flex"
					>
						<ProductCard product={product} />
					</motion.div>
				))}
			</div>

			<motion.div
				className="mt-8 flex justify-center"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.5 }}
			>
				<div className="flex items-center gap-2 text-gray-400 bg-gray-800/30 px-4 py-2 rounded-xl border border-gray-700/30">
					<TrendingUp className="w-4 h-4" />
					<span className="text-sm">Bu ürünler çok satıyor!</span>
				</div>
			</motion.div>
		</motion.div>
	);
};

export default PeopleAlsoBought;