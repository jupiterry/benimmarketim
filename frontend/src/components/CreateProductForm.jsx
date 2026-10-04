import { useState } from "react";
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
	{ href: "/baharat", name: "Baharatlar" },
	{ href: "/dondurma", name: "Dondurmalar" }
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
			<form onSubmit={handleSubmit} className="product-form">
				<div className="ui-stack">
					{/* Temel bilgiler */}
					<section className="ui-card">
						<div className="ui-card-header">
							<h2 className="ui-title">Temel bilgiler</h2>
						</div>
						<div className="ui-card-body ui-stack">
							<div>
								<label htmlFor='name' className='ui-label'>
									Ürün Adı
								</label>
								<input
									type='text'
									id='name'
									name='name'
									value={newProduct.name}
									onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
									className='ui-field'
									placeholder="Örn: Organik Filtre Kahve"
									required
								/>
							</div>

							<div>
								<label htmlFor='description' className='ui-label'>
									Ürün Açıklaması
								</label>
								<textarea
									id='description'
									name='description'
									value={newProduct.description}
									onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
									rows='3'
									className='ui-field'
									placeholder="Ürün detaylarını buraya yazın..."
									required
								/>
							</div>
						</div>
					</section>

					{/* Fiyat ve kategori */}
					<section className="ui-card">
						<div className="ui-card-header">
							<h2 className="ui-title">Fiyat ve kategori</h2>
						</div>
						<div className="ui-card-body ui-grid-2">
							<div>
								<label htmlFor='price' className='ui-label'>
									Fiyat
								</label>
								<div className="ui-field-prefix">
									<input
										type='number'
										id='price'
										name='price'
										value={newProduct.price}
										onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
										step='0.01'
										className='ui-field'
										placeholder="0.00"
										required
									/>
									<span>₺</span>
								</div>
							</div>

							<div>
								<label htmlFor='category' className='ui-label'>
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
									className='ui-field'
									required
								>
									<option value=''>Kategori seçiniz</option>
									{categories.map((category) => (
										<option key={category.href} value={category.href}>
											{category.name}
										</option>
									))}
								</select>
							</div>
						</div>
					</section>
				</div>

				<div className="ui-stack">
					{/* Görsel Yükleme Alanı */}
					<section className="ui-card">
						<div className="ui-card-header">
							<h2 className="ui-title">Görsel</h2>
						</div>
						<div className="ui-card-body">
							<input type='file' id='image' className='hidden' accept='image/*' onChange={handleImageChange} />
							<label htmlFor='image' className='ui-dropzone'>
								{newProduct.image ? (
									<>
										<img src={newProduct.image} alt="Preview" />
										<span className="ui-dropzone-overlay">
											<Upload />
											Görseli Değiştir
										</span>
									</>
								) : (
									<>
										<ImageIcon />
										<span>Ürün görseli yüklemek için tıklayın veya sürükleyin</span>
										<span className="ui-text-xs ui-muted">PNG, JPG, GIF (max. 2MB)</span>
									</>
								)}
							</label>
						</div>
					</section>

					{/* Durum Butonları */}
					<section className="ui-card">
						<div className="ui-card-header">
							<h2 className="ui-title">Stok ve görünürlük</h2>
						</div>
						<div className="ui-card-body ui-stack ui-stack--sm">
							<button
								type="button"
								onClick={() => setNewProduct({ ...newProduct, inStock: !newProduct.inStock })}
								aria-pressed={newProduct.inStock}
								data-tone={newProduct.inStock ? undefined : "danger"}
								className="ui-option"
							>
								{newProduct.inStock ? <Check /> : <XCircle />}
								<span>{newProduct.inStock ? 'Stokta Var' : 'Tükendi'}</span>
							</button>

							<button
								type="button"
								onClick={() => setNewProduct({ ...newProduct, hidden: !newProduct.hidden })}
								aria-pressed={!newProduct.hidden}
								className="ui-option"
							>
								{newProduct.hidden ? <EyeOff /> : <Eye />}
								<span>{newProduct.hidden ? 'Gizli' : 'Görünür'}</span>
							</button>

							<button
								type="button"
								onClick={() => setNewProduct({ ...newProduct, featured: !newProduct.featured })}
								aria-pressed={newProduct.featured}
								className="ui-option"
							>
								<Star fill={newProduct.featured ? "currentColor" : "none"} />
								<span>Öne Çıkar</span>
							</button>
						</div>
					</section>

					{/* Önizleme Butonu */}
					<button
						type='submit'
						className='ui-btn ui-btn--primary ui-btn--lg ui-btn--block'
						disabled={loading}
					>
						{loading ? (
							<>
								<Loader className='ui-spin' />
								<span>Yükleniyor...</span>
							</>
						) : (
							<>
								<PlusCircle />
								<span>Ürünü Önizle</span>
							</>
						)}
					</button>
				</div>
			</form>

			{/* Onay Modalı */}
			{showConfirmModal && (
				<div className="ui-modal-backdrop">
					<div className="ui-modal" role="dialog" aria-modal="true" aria-label="Ürün Önizleme">
						<div className="ui-modal-header">
							<h3 className="ui-title">Ürün Önizleme</h3>
						</div>

						<div className="ui-modal-body ui-stack">
							{newProduct.image && (
								<div className="ui-dropzone" style={{ cursor: "default", minHeight: 200 }}>
									<img src={newProduct.image} alt={newProduct.name} />
								</div>
							)}

							<div className="ui-cluster">
								<h4 className="ui-title">{newProduct.name}</h4>
								{newProduct.featured && (
									<span className="ui-badge ui-badge--warn"><Star /> Öne çıkan</span>
								)}
								{newProduct.hidden && (
									<span className="ui-badge"><EyeOff /> Gizli</span>
								)}
								{!newProduct.inStock && (
									<span className="ui-badge ui-badge--danger"><XCircle /> Tükendi</span>
								)}
							</div>

							<p className="ui-muted ui-wrap-anywhere">{newProduct.description}</p>

							<div className="ui-between">
								<div>
									<span className="order-card-price" style={{ display: "inline" }}>₺{newProduct.price}</span>
									<span className="ui-text-sm ui-muted"> /birim</span>
								</div>
								<span className="ui-badge">
									{categories.find(cat => cat.href.replace("/", "") === newProduct.category)?.name || newProduct.category}
								</span>
							</div>
						</div>

						<div className="ui-modal-footer">
							<button
								onClick={confirmAndSubmit}
								className="ui-btn ui-btn--primary ui-grow"
								disabled={loading}
							>
								{loading ? (
									<>
										<Loader className="ui-spin" />
										<span>Yükleniyor...</span>
									</>
								) : (
									<>
										<Check />
										<span>Onayla ve Yükle</span>
									</>
								)}
							</button>

							<button
								onClick={() => setShowConfirmModal(false)}
								className="ui-btn ui-grow"
							>
								<XCircle />
								<span>İptal</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default CreateProductForm;
