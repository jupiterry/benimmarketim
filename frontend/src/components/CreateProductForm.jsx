import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlusCircle, Upload, Loader, Eye, EyeOff, Star, XCircle, Check, Image as ImageIcon } from "lucide-react";
import { useProductStore } from "../stores/useProductStore";

const categories = [
	{ href: "/kahve", name: "Benim Kahvem" },
	{ href: "/yiyecekler", name: "Yiyecekler" },
	{ href: "/kahvalti", name: "Kahvaltılık Ürünler" },
	{ href: "/gida", name: "Temel Gıda" },
	{ href: "/meyve-sebze", name: "Meyve & Sebze" },
	{ href: "/sut", name: "Süt & Süt Ürünleri" },
	{ href: "/bespara", name: "Beş Para Etmeyen Ürünler" },
	{ href: "/tozicecekler", name: "Toz İçecekler" },
	{ href: "/cips", name: "Cips & Çerez" },
	{ href: "/cayseker", name: "Çay ve Şekerler" },
	{ href: "/atistirma", name: "Atıştırmalıklar" },
	{ href: "/temizlik", name: "Temizlik & Hijyen" },
	{ href: "/kisisel", name: "Kişisel Bakım" },
	{ href: "/makarna", name: "Makarna ve Kuru Bakliyat" },
	{ href: "/et", name: "Şarküteri & Et Ürünleri" },
	{ href: "/icecekler", name: "Buz Gibi İçecekler" },
	{ href: "/dondurulmus", name: "Dondurulmuş Gıdalar" },
	{ href: "/baharat", name: "Baharatlar" }
];

const CreateProductForm = () => {
	const [newProduct, setNewProduct] = useState({
		name: "",
		description: "",
		price: "",
		category: "",
		image: "",
		featured: false,
		hidden: false,
		inStock: true
	});

	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const { createProduct, loading } = useProductStore();

	const handleSubmit = async (e) => {
		e.preventDefault();
		setShowConfirmModal(true);
	};

	const confirmAndSubmit = async () => {
		try {
			await createProduct(newProduct);
			setNewProduct({ 
				name: "", 
				description: "", 
				price: "", 
				category: "", 
				image: "",
				featured: false,
				hidden: false,
				inStock: true
			});
			setShowConfirmModal(false);
		} catch {
			console.log("error creating a product");
		}
	};

	const handleImageChange = (e) => {
		const file = e.target.files[0];
		if (file) {
			const reader = new FileReader();

			reader.onloadend = () => {
				setNewProduct({ ...newProduct, image: reader.result });
			};

			reader.readAsDataURL(file);
		}
	};

	return (
		<>
			<motion.div
				className='relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 shadow-2xl rounded-2xl p-8 mb-8 max-w-xl mx-auto border border-gray-700/50'
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8 }}
			>
				{/* Dekoratif Arka Plan Elementleri */}
				<div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-blue-500/5" />
				<div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
				<div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
				
				<div className="relative">
					<div className="flex items-center gap-3 mb-8">
						<div className="h-12 w-1 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
						<h2 className='text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent'>
							Yeni Ürün Oluşturma
						</h2>
					</div>

					<form onSubmit={handleSubmit} className='space-y-6'>
						{/* Görsel Yükleme Alanı */}
						<div className="relative group cursor-pointer mb-8">
							<input type='file' id='image' className='hidden' accept='image/*' onChange={handleImageChange} />
							<label
								htmlFor='image'
								className='relative flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed border-gray-600 bg-gray-800/50 transition-all group-hover:border-emerald-500/50 group-hover:bg-gray-800/80'
							>
								{newProduct.image ? (
									<div className="absolute inset-0 rounded-xl overflow-hidden">
										<img
											src={newProduct.image}
											alt="Preview"
											className="w-full h-full object-cover transition-transform group-hover:scale-105"
										/>
										<div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
											<p className="text-white flex items-center gap-2">
												<Upload className="w-5 h-5" />
												Görseli Değiştir
											</p>
										</div>
									</div>
								) : (
									<div className="flex flex-col items-center gap-3 text-gray-400 group-hover:text-emerald-400 transition-colors">
										<ImageIcon className="w-10 h-10" />
										<p className="text-sm">Ürün görseli yüklemek için tıklayın veya sürükleyin</p>
										<p className="text-xs text-gray-500">PNG, JPG, GIF (max. 2MB)</p>
									</div>
								)}
							</label>
						</div>

						{/* Form Alanları */}
						<div className="space-y-6">
							<div className="grid grid-cols-2 gap-6">
								<div className="col-span-2">
									<label htmlFor='name' className='block text-sm font-medium text-gray-300 mb-1.5'>
										Ürün Adı
									</label>
									<input
										type='text'
										id='name'
										name='name'
										value={newProduct.name}
										onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
										className='w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-400
										focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
										transition-all duration-200'
										placeholder="Örn: Organik Filtre Kahve"
										required
									/>
								</div>

								<div className="col-span-2">
									<label htmlFor='description' className='block text-sm font-medium text-gray-300 mb-1.5'>
										Ürün Açıklaması
									</label>
									<textarea
										id='description'
										name='description'
										value={newProduct.description}
										onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
										rows='3'
										className='w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-400
										focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
										transition-all duration-200 resize-none'
										placeholder="Ürün detaylarını buraya yazın..."
										required
									/>
								</div>

								<div>
									<label htmlFor='price' className='block text-sm font-medium text-gray-300 mb-1.5'>
										Fiyat
									</label>
									<div className="relative">
										<input
											type='number'
											id='price'
											name='price'
											value={newProduct.price}
											onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
											step='0.01'
											className='w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-8 pr-4 py-3 text-white placeholder-gray-400
											focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
											transition-all duration-200'
											placeholder="0.00"
											required
										/>
										<span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₺</span>
									</div>
								</div>

								<div>
									<label htmlFor='category' className='block text-sm font-medium text-gray-300 mb-1.5'>
										Kategori
									</label>
									<select
										id='category'
										name='category'
										value={newProduct.category ? `/${newProduct.category}` : ""}
										onChange={(e) => {
											const categoryValue = e.target.value.replace("/", "");
											setNewProduct({ ...newProduct, category: categoryValue });
										}}
										className='w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white
										focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
										transition-all duration-200'
										required
									>
										<option value=''>Kategori seçiniz</option>
										{categories.map((category) => (
											<option key={category.href} value={category.href} className="bg-gray-800">
												{category.name}
											</option>
										))}
									</select>
								</div>
							</div>

							{/* Durum Butonları */}
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<button
									type="button"
									onClick={() => setNewProduct({ ...newProduct, featured: !newProduct.featured })}
									className={`group relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-300
									${newProduct.featured 
										? 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10' 
										: 'border-gray-700 text-gray-400 hover:border-yellow-500/30 hover:bg-yellow-500/5'
									}`}
								>
									<Star size={20} className={`transition-transform duration-300 ${newProduct.featured ? 'scale-110' : 'group-hover:scale-110'}`} />
									<span>Öne Çıkar</span>
								</button>

								<button
									type="button"
									onClick={() => setNewProduct({ ...newProduct, hidden: !newProduct.hidden })}
									className={`group relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-300
									${newProduct.hidden 
										? 'border-purple-500/50 text-purple-400 bg-purple-500/10' 
										: 'border-gray-700 text-gray-400 hover:border-purple-500/30 hover:bg-purple-500/5'
									}`}
								>
									{newProduct.hidden ? (
										<EyeOff size={20} className="transition-transform duration-300 scale-110" />
									) : (
										<Eye size={20} className="transition-transform duration-300 group-hover:scale-110" />
									)}
									<span>{newProduct.hidden ? 'Gizli' : 'Görünür'}</span>
								</button>

								<button
									type="button"
									onClick={() => setNewProduct({ ...newProduct, inStock: !newProduct.inStock })}
									className={`group relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-300
									${newProduct.inStock 
										? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' 
										: 'border-red-500/50 text-red-400 bg-red-500/10'
									}`}
								>
									{newProduct.inStock ? (
										<Check size={20} className="transition-transform duration-300 scale-110" />
									) : (
										<XCircle size={20} className="transition-transform duration-300 scale-110" />
									)}
									<span>{newProduct.inStock ? 'Stokta Var' : 'Tükendi'}</span>
								</button>
							</div>

							{/* Önizleme Butonu */}
							<button
								type='submit'
								className='w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-4 px-6 rounded-xl
								font-medium text-sm hover:from-emerald-600 hover:to-teal-700 transition-all duration-300
								focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-gray-900
								disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
								disabled={loading}
							>
								{loading ? (
									<>
										<Loader className='w-5 h-5 animate-spin' />
										<span>Yükleniyor...</span>
									</>
								) : (
									<>
										<PlusCircle className='w-5 h-5' />
										<span>Ürünü Önizle</span>
									</>
								)}
							</button>
						</div>
					</form>
				</div>
			</motion.div>

			{/* Onay Modalı */}
			<AnimatePresence>
				{showConfirmModal && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
					>
						<motion.div
							initial={{ scale: 0.95, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.95, opacity: 0 }}
							className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-700/50"
						>
							{/* Dekoratif Arka Plan */}
							<div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-blue-500/5" />
							<div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
							<div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
							
							<div className="relative">
								<div className="flex items-center gap-3 mb-6">
									<div className="h-10 w-1 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
									<h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
										Ürün Önizleme
									</h3>
								</div>
								
								<div className="space-y-6">
									{newProduct.image && (
										<div className="relative w-full h-56 rounded-xl overflow-hidden">
											<img
												src={newProduct.image}
												alt={newProduct.name}
												className="w-full h-full object-cover"
											/>
											<div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent" />
										</div>
									)}
									
									<div className="space-y-4">
										<div className="flex items-center gap-2">
											<h4 className="text-xl font-medium text-white">{newProduct.name}</h4>
											<div className="flex gap-1.5">
												{newProduct.featured && (
													<Star size={18} className="text-yellow-400" />
												)}
												{newProduct.hidden && (
													<EyeOff size={18} className="text-purple-400" />
												)}
												{!newProduct.inStock && (
													<XCircle size={18} className="text-red-400" />
												)}
											</div>
										</div>
										
										<p className="text-gray-300 text-sm leading-relaxed">{newProduct.description}</p>
										
										<div className="flex items-center justify-between pt-2">
											<div className="flex items-baseline gap-1">
												<span className="text-2xl font-bold text-emerald-400">₺{newProduct.price}</span>
												<span className="text-sm text-emerald-500/70">/birim</span>
											</div>
											<span className="px-3 py-1 rounded-lg bg-gray-700/50 text-sm text-gray-300 border border-gray-700">
												{categories.find(cat => cat.href.replace("/", "") === newProduct.category)?.name || newProduct.category}
											</span>
										</div>
									</div>
								</div>
								
								<div className="flex gap-4 mt-8">
									<button
										onClick={confirmAndSubmit}
										className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 px-4 rounded-xl
										font-medium text-sm hover:from-emerald-600 hover:to-teal-700 transition-all duration-300
										focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-gray-900
										disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
										disabled={loading}
									>
										{loading ? (
											<>
												<Loader className="h-5 w-5 animate-spin" />
												<span>Yükleniyor...</span>
											</>
										) : (
											<>
												<Check className="h-5 w-5" />
												<span>Onayla ve Yükle</span>
											</>
										)}
									</button>
									
									<button
										onClick={() => setShowConfirmModal(false)}
										className="flex-1 bg-gray-700/50 hover:bg-gray-700 text-white py-3 px-4 rounded-xl
										font-medium text-sm transition-all duration-300 border border-gray-600
										focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:ring-offset-2 focus:ring-offset-gray-900
										flex items-center justify-center gap-2"
									>
										<XCircle className="h-5 w-5" />
										<span>İptal</span>
									</button>
								</div>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
};

export default CreateProductForm;
