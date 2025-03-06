import { Minus, Plus, Trash, Package2 } from "lucide-react";
import { useCartStore } from "../stores/useCartStore";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

const CartItem = ({ item }) => {
	const { removeFromCart, updateQuantity } = useCartStore();
	const [isRemoving, setIsRemoving] = useState(false);
	const [prevPrice, setPrevPrice] = useState(item.price * item.quantity);
	const currentPrice = item.price * item.quantity;

	useEffect(() => {
		setPrevPrice(currentPrice);
	}, [currentPrice]);

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

	const priceVariants = {
		initial: { scale: 1, color: "#34D399" },
		updated: { 
			scale: [1, 1.2, 1],
			color: ["#34D399", "#60A5FA", "#34D399"],
			transition: { duration: 0.5 }
		}
	};

	return (
		<motion.div 
			className='rounded-lg border p-4 shadow-sm border-gray-700 bg-gray-800/50 backdrop-blur-sm hover:bg-gray-800/70 transition-all duration-300 md:p-6'
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: isRemoving ? 0 : 1, y: isRemoving ? -20 : 0, scale: isRemoving ? 0.8 : 1 }}
			exit={{ opacity: 0, y: -20 }}
			transition={{ duration: 0.3 }}
			layout
		>
			<div className='flex flex-col md:flex-row items-start md:items-center gap-4 relative'>
				{/* Ürün Görseli */}
				<motion.div 
					className='relative group'
					animate={{ rotate: isRemoving ? [0, -5, 5, -5, 0] : 0 }}
					transition={{ duration: 0.3 }}
				>
					<div className='w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden bg-gray-700 flex items-center justify-center'>
						{item.image ? (
							<img 
								src={item.image} 
								alt={item.name}
								className='w-full h-full object-contain transform group-hover:scale-110 transition-transform duration-300'
							/>
						) : (
							<Package2 className='w-8 h-8 text-gray-400' />
						)}
					</div>
				</motion.div>

				{/* Ürün Bilgileri */}
				<div className='flex-1 min-w-0'>
					<h3 className='text-lg font-semibold text-white truncate'>{item.name}</h3>
					<p className='text-sm text-gray-400 mt-1'>Birim Fiyat: ₺{item.price.toFixed(2)}</p>
					<motion.p 
						className='text-sm font-medium mt-1'
						variants={priceVariants}
						initial="initial"
						animate={prevPrice !== currentPrice ? "updated" : "initial"}
						key={currentPrice}
					>
						Toplam: ₺{currentPrice.toFixed(2)}
					</motion.p>
				</div>

				{/* Miktar Kontrolü */}
				<div className='flex items-center gap-3 bg-gray-700/50 rounded-lg p-2'>
					<motion.button
						whileHover={{ scale: 1.1 }}
						whileTap={{ scale: 0.9 }}
						className='w-8 h-8 flex items-center justify-center rounded-md bg-gray-600 hover:bg-gray-500 text-white transition-colors'
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
						className='w-16 text-center bg-gray-700 border border-gray-600 rounded-md text-white px-2 py-1'
					/>

					<motion.button
						whileHover={{ scale: 1.1 }}
						whileTap={{ scale: 0.9 }}
						className='w-8 h-8 flex items-center justify-center rounded-md bg-gray-600 hover:bg-gray-500 text-white transition-colors'
						onClick={() => updateQuantity(item._id, item.quantity + 1)}
					>
						<Plus className='w-4 h-4' />
					</motion.button>
				</div>

				{/* Silme Butonu */}
				<motion.button
					whileHover={{ scale: 1.1, color: '#ef4444' }}
					whileTap={{ scale: 0.9 }}
					className='absolute top-0 right-0 md:relative md:top-auto md:right-auto p-2 text-gray-400 hover:text-red-500 transition-colors'
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
