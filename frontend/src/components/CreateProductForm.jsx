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

	// ── Sunum yardımcıları (yalnızca görünüm) ─────────────────────────
	const categoryName = categories.find(cat => cat.href.replace("/", "") === newProduct.category)?.name || newProduct.category;
	const checklist = [
		{ label: "Ürün adı", done: !!newProduct.name.trim() },
		{ label: "Açıklama", done: !!newProduct.description.trim() },
		{ label: "Fiyat", done: newProduct.price !== "" },
		{ label: "Kategori", done: !!newProduct.category },
		{ label: "Görsel", done: !!newProduct.image, optional: true },
	];

	return (
		<>
			<form onSubmit={handleSubmit} className="pf">
				<div className="ui-panel pf-main">
					{/* 1 · Genel bilgiler */}
					<section className="pf-section" aria-labelledby="pf-general">
						<header className="pf-section-head">
							<h2 id="pf-general">Genel bilgiler</h2>
							<p>Müşterinin mağazada göreceği ad ve açıklama.</p>
						</header>
						<div className="pf-section-body">
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

					{/* 2 · Görsel */}
					<section className="pf-section" aria-labelledby="pf-image">
						<header className="pf-section-head">
							<h2 id="pf-image">Görsel</h2>
							<p>Kare, sade arka planlı bir ürün fotoğrafı en iyi sonucu verir.</p>
						</header>
						<div className="pf-section-body">
							<input type='file' id='image' className='hidden' accept='image/*' onChange={handleImageChange} />
							<label htmlFor='image' className='pf-image' data-filled={!!newProduct.image || undefined}>
								{newProduct.image ? (
									<>
										<img src={newProduct.image} alt="Preview" />
										<span className="pf-image-text">
											<strong>Görsel yüklendi</strong>
											<span className="ui-btn ui-btn--sm">
												<Upload />
												Görseli Değiştir
											</span>
										</span>
									</>
								) : (
									<>
										<span className="pf-image-icon"><ImageIcon /></span>
										<span className="pf-image-text">
											<strong>Ürün görseli yüklemek için tıklayın veya sürükleyin</strong>
											<span className="ui-text-xs ui-muted">PNG, JPG, GIF (max. 2MB)</span>
										</span>
									</>
								)}
							</label>
						</div>
					</section>

					{/* 3 · Fiyatlandırma */}
					<section className="pf-section" aria-labelledby="pf-price">
						<header className="pf-section-head">
							<h2 id="pf-price">Fiyatlandırma</h2>
							<p>Birim satış fiyatı. İndirim ürün kataloğundan eklenir.</p>
						</header>
						<div className="pf-section-body pf-narrow">
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
						</div>
					</section>

					{/* 4 · Kategori */}
					<section className="pf-section" aria-labelledby="pf-category">
						<header className="pf-section-head">
							<h2 id="pf-category">Kategori</h2>
							<p>Ürünün mağazada listeleneceği reyon.</p>
						</header>
						<div className="pf-section-body pf-narrow">
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

					{/* 5 · Stok ve görünürlük */}
					<section className="pf-section" aria-labelledby="pf-status">
						<header className="pf-section-head">
							<h2 id="pf-status">Stok ve görünürlük</h2>
							<p>Yayına alındığında ürünün mağazadaki durumu.</p>
						</header>
						<div className="pf-section-body pf-switches">
							<button
								type="button"
								onClick={() => setNewProduct({ ...newProduct, inStock: !newProduct.inStock })}
								aria-pressed={newProduct.inStock}
								className="pf-switch"
							>
								<span>
									<strong>{newProduct.inStock ? 'Stokta Var' : 'Tükendi'}</strong>
									<small>Kapalıyken ürün “Tükendi” olarak görünür.</small>
								</span>
								<i className="pf-switch-track" />
							</button>

							<button
								type="button"
								onClick={() => setNewProduct({ ...newProduct, hidden: !newProduct.hidden })}
								aria-pressed={!newProduct.hidden}
								className="pf-switch"
							>
								<span>
									<strong>{newProduct.hidden ? 'Gizli' : 'Görünür'}</strong>
									<small>Gizli ürünler mağazada listelenmez.</small>
								</span>
								<i className="pf-switch-track" />
							</button>

							<button
								type="button"
								onClick={() => setNewProduct({ ...newProduct, featured: !newProduct.featured })}
								aria-pressed={newProduct.featured}
								className="pf-switch"
							>
								<span>
									<strong>Öne Çıkar</strong>
									<small>Öne çıkan ürünler vitrinde gösterilir.</small>
								</span>
								<i className="pf-switch-track" />
							</button>
						</div>
					</section>
				</div>

				{/* Sağ özet: canlı önizleme ve gönderim */}
				<aside className="ui-panel pf-aside" aria-label="Ürün özeti">
					<div className="pf-preview">
						<span className="pf-preview-img">
							{newProduct.image ? <img src={newProduct.image} alt="" /> : <ImageIcon />}
						</span>
						<div className="pf-preview-text">
							<strong>{newProduct.name || "Ürün adı"}</strong>
							<span className="ui-num">{newProduct.price !== "" ? `₺${newProduct.price}` : "₺0.00"}</span>
							<small>{newProduct.category ? categoryName : "Kategori seçilmedi"}</small>
						</div>
					</div>
					<div className="pf-preview-tags">
						<span className={`ui-badge ${newProduct.inStock ? "ui-badge--ok" : "ui-badge--danger"}`}>
							{newProduct.inStock ? <Check /> : <XCircle />}
							{newProduct.inStock ? "Stokta" : "Tükendi"}
						</span>
						<span className="ui-badge">
							{newProduct.hidden ? <EyeOff /> : <Eye />}
							{newProduct.hidden ? "Gizli" : "Görünür"}
						</span>
						{newProduct.featured && (
							<span className="ui-badge ui-badge--warn"><Star /> Öne çıkan</span>
						)}
					</div>

					<ul className="pf-checklist" aria-label="Doldurulan alanlar">
						{checklist.map((item) => (
							<li key={item.label} data-done={item.done || undefined}>
								<i>{item.done && <Check />}</i>
								{item.label}
								{item.optional && <small>isteğe bağlı</small>}
							</li>
						))}
					</ul>

					{/* Önizleme Butonu */}
					<div className="pf-submit">
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
						<p className="ui-hint">Yayına almadan önce son bir kez onaylamanız istenir.</p>
					</div>
				</aside>
			</form>

			{/* Onay Modalı */}
			{showConfirmModal && (
				<div className="ui-modal-backdrop">
					<div className="ui-modal" role="dialog" aria-modal="true" aria-label="Ürün Önizleme">
						<div className="ui-modal-header">
							<h3 className="ui-title">Ürün Önizleme</h3>
						</div>

						<div className="ui-modal-body pf-confirm">
							{newProduct.image && (
								<span className="pf-confirm-img">
									<img src={newProduct.image} alt={newProduct.name} />
								</span>
							)}

							<div className="pf-confirm-text">
								<h4 className="ui-title">{newProduct.name}</h4>
								<p className="pf-confirm-price">
									<strong className="ui-num">₺{newProduct.price}</strong>
									<span className="ui-text-sm ui-muted"> /birim</span>
								</p>
								<div className="pf-preview-tags">
									<span className="ui-badge">
										{categories.find(cat => cat.href.replace("/", "") === newProduct.category)?.name || newProduct.category}
									</span>
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
							</div>

							<p className="pf-confirm-desc ui-muted ui-wrap-anywhere">{newProduct.description}</p>
						</div>

						<div className="ui-modal-footer">
							<button
								onClick={() => setShowConfirmModal(false)}
								className="ui-btn"
							>
								<XCircle />
								<span>İptal</span>
							</button>

							<button
								onClick={confirmAndSubmit}
								className="ui-btn ui-btn--primary"
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
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default CreateProductForm;
