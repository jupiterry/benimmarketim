import { useState } from "react";
import { motion } from "framer-motion";
import { Trash, Star } from "lucide-react";
import { useProductStore } from "../stores/useProductStore";

const ProductsList = () => {
	const { deleteProduct, toggleFeaturedProduct, products, updateProductPrice } = useProductStore();
	const [editingPrice, setEditingPrice] = useState({}); // Hangi ürünün düzenlendiğini takip eder
	const [newPrices, setNewPrices] = useState({}); // Güncellenen fiyatları saklar

	// Fiyat değişikliklerini kaydet
	const handlePriceChange = (id, value) => {
		setNewPrices({ ...newPrices, [id]: value });
	};

	// Güncellenen fiyatı kaydetme
	const savePrice = (id) => {
		if (newPrices[id] !== undefined) {
			updateProductPrice(id, parseFloat(newPrices[id])); // Backend'e fiyatı gönder
			setEditingPrice({ ...editingPrice, [id]: false }); // Düzenleme modundan çık
		}
	};

	return (
		<motion.div
			className='bg-gray-800 shadow-lg rounded-lg overflow-hidden max-w-4xl mx-auto'
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.8 }}
		>
			<table className='min-w-full divide-y divide-gray-700'>
				<thead className='bg-gray-700'>
					<tr>
						<th className='px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>Ürün</th>
						<th className='px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>Fiyat</th>
						<th className='px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>Kategori</th>
						<th className='px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>Öne Çıkanlar</th>
						<th className='px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>Ürünü Sil</th>
					</tr>
				</thead>

				<tbody className='bg-gray-800 divide-y divide-gray-700'>
					{products?.map((product) => (
						<tr key={product._id} className='hover:bg-gray-700'>
							<td className='px-6 py-4 whitespace-nowrap'>
								<div className='flex items-center'>
									<div className='flex-shrink-0 h-10 w-10'>
										<img className='h-10 w-10 rounded-full object-cover' src={product.image} alt={product.name} />
									</div>
									<div className='ml-4'>
										<div className='text-sm font-medium text-white'>{product.name}</div>
									</div>
								</div>
							</td>

							<td className='px-6 py-4 whitespace-nowrap'>
								{editingPrice[product._id] ? (
									<div className="flex">
										<input
											type="number"
											value={newPrices[product._id] ?? product.price}
											onChange={(e) => handlePriceChange(product._id, e.target.value)}
											className="bg-gray-700 text-white border border-gray-500 rounded px-2 py-1 w-20"
										/>
										<button onClick={() => savePrice(product._id)} className="ml-2 text-green-400 hover:text-green-300">
											✔
										</button>
									</div>
								) : (
									<div className="flex items-center">
										<span className='text-sm text-gray-300'>₺{product.price.toFixed(2)}</span>
										<button onClick={() => setEditingPrice({ ...editingPrice, [product._id]: true })} className="ml-2 text-blue-400 hover:text-blue-300">
											✏
										</button>
									</div>
								)}
							</td>

							<td className='px-6 py-4 whitespace-nowrap'>
								<div className='text-sm text-gray-300'>{product.category}</div>
							</td>

							<td className='px-6 py-4 whitespace-nowrap'>
								<button
									onClick={() => toggleFeaturedProduct(product._id)}
									className={`p-1 rounded-full ${
										product.isFeatured ? "bg-yellow-400 text-gray-900" : "bg-gray-600 text-gray-300"
									} hover:bg-yellow-500 transition-colors duration-200`}
								>
									<Star className='h-5 w-5' />
								</button>
							</td>

							<td className='px-6 py-4 whitespace-nowrap text-sm font-medium'>
								<button onClick={() => deleteProduct(product._id)} className='text-red-400 hover:text-red-300'>
									<Trash className='h-5 w-5' />
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</motion.div>
	);
};

export default ProductsList;
