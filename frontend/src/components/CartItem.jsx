import { Minus, Plus, Trash, Package2, Sparkles } from "lucide-react";
import { useCartStore } from "../stores/useCartStore";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

const CartItem = ({ item }) => {
	const { removeFromCart, updateQuantity } = useCartStore();
	const [isRemoving, setIsRemoving] = useState(false);
	const [prevPrice, setPrevPrice] = useState(item.price * item.quantity);
	const [isUpdating, setIsUpdating] = useState(false);
	const currentPrice = item.price * item.quantity;

	useEffect(() => {
		if (prevPrice !== currentPrice) {
			setIsUpdating(true);
			const timer = setTimeout(() => setIsUpdating(false), 500);
			return () => clearTimeout(timer);
		}
		setPrevPrice(currentPrice);
	}, [currentPrice, prevPrice]);

	const handleRemove = async () => {
		setIsRemoving(true);
		// Animasyon için biraz bekle
		await new Promise(resolve => setTimeout(resolve, 300));
		removeFromCart(item._id);
		toast.success("Ürün sepetten çıkarıldı!", {
			icon: "🗑️",
			position: "top-center",
			style: {
				borderRadius: "10px",
				background: "#333",
				color: "#fff",
			},
		});
	};

	return (
		<motion.div 
			className='relative group rounded-2xl border p-4 md:p-6 border-gray-700/50 bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl shadow-xl hover:shadow-2xl hover:shadow-emerald-500/5 transition-all duration-500'
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: isRemoving ? 0 : 1, y: isRemoving ? -20 : 0, scale: isRemoving ? 0.8 : 1 }}
			exit={{ opacity: 0, y: -20 }}
			transition={{ duration: 0.3 }}
			layout
			whileHover={{ y: -2 }}
		>
			{/* Gradient Border Effect */}
			<div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-transparent to-green-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
			
			{/* Shimmer Effect on Price Update */}
			{isUpdating && (
				<motion.div 
					className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent"
					initial={{ x: "-100%" }}
					animate={{ x: "100%" }}
					transition={{ duration: 0.5 }}
				/>
			)}

			<div className='flex flex-col md:flex-row items-start md:items-center gap-4 relative'>
				{/* Ürün Görseli */}
				<motion.div 
					className='relative group/image'
					animate={{ rotate: isRemoving ? [0, -5, 5, -5, 0] : 0 }}
					transition={{ duration: 0.3 }}
				>
					<div className='w-24 h-24 md:w-32 md:h-32 rounded-xl overflow-hidden bg-gradient-to-br from-gray-700/50 to-gray-800/50 flex items-center justify-center relative'>
						{/* Glow Effect */}
						<div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />
						
						{item.image ? (
							<motion.img 
								src={item.image} 
								alt={item.name}
								className='w-full h-full object-contain transform group-hover/image:scale-110 transition-transform duration-500'
								whileHover={{ scale: 1.1 }}
							/>
						) : (
							<div className="flex flex-col items-center justify-center gap-2">
								<Package2 className='w-8 h-8 text-gray-400' />
								<span className="text-xs text-gray-500">Görsel yok</span>
							</div>
						)}
					</div>
					
					{/* Quantity Badge */}
					<motion.div 
						className="absolute -top-2 -right-2 w-7 h-7 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30"
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						key={item.quantity}
					>
						<span className="text-white text-xs font-bold">{item.quantity}</span>
					</motion.div>
				</motion.div>

				{/* Ürün Bilgileri */}
				<div className='flex-1 min-w-0'>
					<h3 className='text-lg font-semibold text-white truncate group-hover:text-emerald-300 transition-colors duration-300'>
						{item.name}
					</h3>
					
					<div className="flex flex-wrap items-center gap-3 mt-2">
						<p className='text-sm text-gray-400 flex items-center gap-1'>
							<span className="text-gray-500">Birim:</span>
							<span className="text-emerald-400 font-medium">₺{item.price.toFixed(2)}</span>
						</p>
						
						<motion.div 
							className={`px-3 py-1 rounded-full text-sm font-semibold ${isUpdating ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700/50 text-white'} transition-all duration-300`}
							animate={isUpdating ? { scale: [1, 1.1, 1] } : {}}
						>
							<span className="flex items-center gap-1">
								{isUpdating && <Sparkles className="w-3 h-3" />}
								Toplam: ₺{currentPrice.toFixed(2)}
							</span>
						</motion.div>
					</div>
				</div>

				{/* Miktar Kontrolü */}
				<div className='flex items-center gap-1 bg-gradient-to-r from-gray-700/80 to-gray-800/80 rounded-xl p-1.5 border border-gray-600/30'>
					<motion.button
						whileHover={{ scale: 1.15, backgroundColor: "rgba(239, 68, 68, 0.2)" }}
						whileTap={{ scale: 0.9 }}
						className='w-9 h-9 flex items-center justify-center rounded-lg bg-gray-600/50 hover:bg-red-500/20 text-white transition-all duration-200'
						onClick={() => updateQuantity(item._id, item.quantity - 1)}
					>
						<Minus className='w-4 h-4' />
					</motion.button>

					<input
						type="number"
						min="1"
						value={item.quantity}
						onChange={(e) => {
							const value = parseInt(e.target.value);
							if (value > 0) updateQuantity(item._id, value);
						}}
						className='w-14 text-center bg-transparent border-none text-white font-bold text-lg focus:outline-none focus:ring-0'
					/>

					<motion.button
						whileHover={{ scale: 1.15, backgroundColor: "rgba(16, 185, 129, 0.2)" }}
						whileTap={{ scale: 0.9 }}
						className='w-9 h-9 flex items-center justify-center rounded-lg bg-gray-600/50 hover:bg-emerald-500/20 text-white transition-all duration-200'
						onClick={() => updateQuantity(item._id, item.quantity + 1)}
					>
						<Plus className='w-4 h-4' />
					</motion.button>
				</div>

				{/* Silme Butonu */}
				<motion.button
					whileHover={{ scale: 1.1 }}
					whileTap={{ scale: 0.9 }}
					className='absolute top-3 right-3 md:relative md:top-auto md:right-auto p-3 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-300'
					onClick={handleRemove}
					disabled={isRemoving}
				>
					<Trash className='w-5 h-5' />
				</motion.button>
			</div>
		</motion.div>
	);
};

export default CartItem;
