import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShoppingBag } from "lucide-react";

const CategoryItem = ({ category }) => {
	return (
		<motion.div 
			className='relative overflow-hidden h-64 sm:h-72 md:h-80 w-full rounded-xl sm:rounded-2xl group cursor-pointer'
			whileHover={{ y: -8, scale: 1.02 }}
			transition={{ duration: 0.3, type: "spring" }}
		>
			<Link to={"/category" + category.href}>
				<div className='w-full h-full relative bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm border border-gray-700/50 group-hover:border-emerald-500/50 transition-all duration-500'>
					{/* Glow Effect */}
					<div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl"></div>
					
					{/* Gradient Overlay */}
					<div className='absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-900/80 z-10' />
					
					{/* Floating Shapes */}
					<div className="absolute top-4 right-4 w-8 h-8 bg-emerald-500/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
					<div className="absolute bottom-20 left-4 w-6 h-6 bg-teal-500/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
					
					{/* Image Container */}
					<div className='absolute inset-0 flex items-center justify-center p-3 sm:p-4 md:p-6'>
						<motion.div
							className="relative"
							whileHover={{ rotate: [0, -5, 5, 0] }}
							transition={{ duration: 0.6 }}
						>
							<img
								src={category.imageUrl}
								alt={category.name}
								className='w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 object-contain transition-all duration-500 ease-out group-hover:scale-110 drop-shadow-2xl'
								loading='lazy'
							/>
							{/* Image Glow */}
							<div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-teal-400/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
						</motion.div>
					</div>
					
					{/* Content */}
					<div className='absolute bottom-0 left-0 right-0 p-3 sm:p-4 md:p-6 z-20'>
						<div className="flex items-center justify-between mb-2 sm:mb-3">
							<motion.div
								className="flex items-center gap-1 sm:gap-2"
								initial={{ x: -10, opacity: 0 }}
								animate={{ x: 0, opacity: 1 }}
								transition={{ delay: 0.2 }}
							>
								<div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full flex items-center justify-center">
									<ShoppingBag className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
								</div>
								<h3 className='text-white text-sm sm:text-base md:text-lg font-bold bg-gradient-to-r from-white to-emerald-100 bg-clip-text line-clamp-1'>
									{category.displayName || category.name}
								</h3>
							</motion.div>
							
							<motion.div
								className="opacity-0 group-hover:opacity-100 transition-all duration-300 hidden sm:block"
								whileHover={{ x: 5 }}
							>
								<ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
							</motion.div>
						</div>
						
						<p className='text-gray-300 text-xs sm:text-sm leading-relaxed mb-2 sm:mb-3 line-clamp-2'>
							Kaliteli {category.displayName || category.name} ürünleri keşfet! ✨
						</p>
						
						{/* Action Button - Sadece desktop'ta göster */}
						<motion.div 
							className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 backdrop-blur-sm border border-emerald-500/30 rounded-lg sm:rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 opacity-0 group-hover:opacity-100 transition-all duration-300 hidden sm:block"
							whileHover={{ scale: 1.05 }}
						>
							<span className="text-emerald-300 text-xs sm:text-sm font-medium flex items-center gap-2">
								<span>Ürünleri Gör</span>
								<motion.div
									animate={{ x: [0, 3, 0] }}
									transition={{ duration: 1.5, repeat: Infinity }}
								>
									→
								</motion.div>
							</span>
						</motion.div>
					</div>
				</div>
			</Link>
		</motion.div>
	);
};

export default CategoryItem;
