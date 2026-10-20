// Yeni ürün ekleme ekranı: solda form, sağda müşteri uygulamasındaki kart gibi canlı önizleme
// ve son eklenen ürünler. Görsel tarayıcıda küçültülür (en fazla 1200px, isteğe bağlı kare kırpma)
// ve base64 olarak gönderilir; sunucu Cloudinary'ye yükler.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, Crop, ExternalLink, Eye, EyeOff, Loader, Package2, PlusCircle,
  RotateCcw, Save, ShoppingCart, Star, Trash2, Upload, X,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { cloudinaryImage } from "../lib/image";
import { useProductStore } from "../stores/useProductStore";
import { CATEGORIES, parsePrice, roundMoney, errorMessage } from "./products/productUtils";
import { PageHeader, EmptyState, HANDOFF, setHandoff, money, timeAgo } from "./admin/ui";
import "../styles/create-product.css";

const MAX_IMAGE_PX = 1200;
const MAX_FILE_MB = 8;

// Kategoriye göre ad öneri çipleri (ada eklenir: "Süt" → "Süt 1 L")
const NAME_HINTS = {
  sut: ["1 L", "500 ml", "200 ml", "Yarım yağlı", "Laktozsuz"],
  icecekler: ["330 ml", "500 ml", "1 L", "2,5 L", "6'lı"],
  tozicecekler: ["250 g", "500 g", "Şekersiz"],
  kahve: ["Sütlü", "Sade", "Buzlu", "Orta boy", "Büyük boy"],
  cips: ["Büyük boy", "Süper boy", "Acılı", "Tuzlu"],
  cayseker: ["500 g", "1 kg", "Küp şeker", "Bardak poşet"],
  gida: ["1 kg", "2 kg", "5 kg", "Kavanoz"],
  makarna: ["500 g", "1 kg", "Paket"],
  et: ["100 g", "250 g", "Dilimli", "Kg"],
  "meyve-sebze": ["Kg", "Adet", "500 g", "Demet"],
  temizlik: ["1 L", "750 ml", "2 L", "3'lü"],
  kisisel: ["250 ml", "400 ml", "Adet"],
  baharat: ["50 g", "100 g", "Cam kavanoz"],
  dondurma: ["Külah", "Çubuk", "Kutu", "500 ml"],
  dondurulmus: ["500 g", "1 kg", "Paket"],
  atistirma: ["Paket", "Çoklu paket", "Mini"],
  kahvalti: ["250 g", "500 g", "Dilimli", "Kavanoz"],
  yiyecekler: ["Porsiyon", "Adet", "Menü"],
  bespara: ["Adet", "Paket"],
};
const DEFAULT_HINTS = ["Adet", "Paket", "500 g", "1 L"];

const EMPTY = { name: "", category: "", price: "", discountedPrice: "", description: "", image: "", featured: false, hidden: false, inStock: true };

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Görsel okunamadı")); };
  img.src = url;
});

/** Görseli canvas ile en fazla `maxSize` piksele küçültür; `square` ise ortadan kare kırpar */
const shrinkImage = async (file, { maxSize = MAX_IMAGE_PX, square = false } = {}) => {
  const img = await loadImage(file);
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (square) {
    const side = Math.min(sw, sh);
    sx = Math.round((sw - side) / 2);
    sy = Math.round((sh - side) / 2);
    sw = side;
    sh = side;
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  if (!keepAlpha) {
    // JPEG saydamlık taşımaz; şeffaf alanlar beyaz zemine basılır
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const dataUrl = canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", 0.86);
  const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
  return { dataUrl, width: w, height: h, bytes, original: { width: img.naturalWidth, height: img.naturalHeight, bytes: file.size } };
};

const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.round(bytes / 1024)} KB`);
const createdTime = (p) => (p?.createdAt ? new Date(p.createdAt).getTime() || 0 : 0);
const openProduct = (id) => {
  setHandoff(HANDOFF.product, id);
  window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "products" }));
};

/** Alan doğrulaması: ad ≥ 2 karakter, kategori, fiyat > 0, indirim < fiyat */
const validateProduct = (form) => {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = "Ürün adı en az 2 karakter olmalı.";
  if (!form.category) errors.category = "Kategori seçin.";
  const price = parsePrice(form.price);
  if (!(price > 0)) errors.price = "Fiyat 0'dan büyük olmalı.";
  if (form.discountedPrice !== "") {
    const discounted = parsePrice(form.discountedPrice);
    if (!(discounted >= 0)) errors.discountedPrice = "Geçerli bir indirimli fiyat girin.";
    else if (price > 0 && discounted >= price) errors.discountedPrice = "İndirimli fiyat normal fiyattan düşük olmalı.";
  }
  return errors;
};

// ── Canlı kart önizlemesi (müşteri uygulamasındaki ürün kartı) ─────────────
const PreviewCard = ({ form }) => {
  const price = parsePrice(form.price);
  const discounted = form.discountedPrice !== "" ? parsePrice(form.discountedPrice) : NaN;
  const hasDiscount = price > 0 && discounted >= 0 && discounted < price;
  const pct = hasDiscount ? Math.round((1 - discounted / price) * 100) : 0;
  return (
    <div className="crp-card" data-out={form.inStock ? undefined : "true"} aria-label="Ürün kartı önizlemesi">
      <div className="crp-card-img">
        {form.image ? <img src={form.image} alt="" /> : <Package2 aria-hidden="true" />}
        {hasDiscount && <span className="crp-card-off">%{pct}</span>}
        {form.featured && <span className="crp-card-star" title="Öne çıkan"><Star /></span>}
        {!form.inStock && <span className="crp-card-sold">Tükendi</span>}
      </div>
      <div className="crp-card-body">
        <strong className="crp-card-name">{form.name.trim() || "Ürün adı"}</strong>
        <div className="crp-card-price">
          <span className="crp-card-now ui-num">{money(hasDiscount ? discounted : (price > 0 ? price : 0))}</span>
          {hasDiscount && <s className="crp-card-old ui-num">{money(price)}</s>}
        </div>
        <span className="crp-card-btn" aria-hidden="true"><ShoppingCart /> Sepete ekle</span>
      </div>
    </div>
  );
};

const CreateProductForm = () => {
  const { createProduct, setProducts, products } = useProductStore();
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [square, setSquare] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const originalFile = useRef(null);
  const nameRef = useRef(null);

  const errors = useMemo(() => validateProduct(form), [form]);
  const showError = (key) => (touched[key] || submitted) && errors[key];
  const categoryName = CATEGORIES.find((c) => c.slug === form.category)?.name;
  const hints = NAME_HINTS[form.category] || DEFAULT_HINTS;

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const touch = (key) => setTouched((t) => ({ ...t, [key]: true }));

  // Kaydedilmemiş değişiklik varken sekme kapatma/yenileme uyarısı
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── Görsel ────────────────────────────────────────────────────────────
  const applyImage = useCallback(async (file, squareCrop) => {
    if (!file || !file.type.startsWith("image/")) { toast.error("Yalnızca görsel dosyası yükleyin."); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`Görsel ${MAX_FILE_MB} MB'tan küçük olmalı.`); return; }
    setImageBusy(true);
    try {
      const result = await shrinkImage(file, { maxSize: MAX_IMAGE_PX, square: squareCrop });
      originalFile.current = file;
      setImageInfo(result);
      setForm((f) => ({ ...f, image: result.dataUrl }));
      setDirty(true);
    } catch {
      toast.error("Görsel işlenemedi.");
    } finally {
      setImageBusy(false);
    }
  }, []);
  const onFile = (e) => { applyImage(e.target.files?.[0], square); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDragging(false); applyImage(e.dataTransfer.files?.[0], square); };
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); applyImage(item.getAsFile(), square); }
  };
  const toggleSquare = () => {
    const next = !square;
    setSquare(next);
    if (originalFile.current) applyImage(originalFile.current, next);
  };
  const clearImage = () => { originalFile.current = null; setImageInfo(null); update({ image: "" }); };

  const addHint = (hint) => {
    const name = form.name.trim();
    if (name.toLocaleLowerCase("tr").includes(hint.toLocaleLowerCase("tr"))) return;
    update({ name: name ? `${name} ${hint}` : hint });
    nameRef.current?.focus();
  };

  const reset = (keepCategory = true) => {
    setForm({ ...EMPTY, category: keepCategory ? form.category : "" });
    setTouched({});
    setSubmitted(false);
    setDirty(false);
    setImageInfo(null);
    originalFile.current = null;
    setTimeout(() => nameRef.current?.focus(), 0);
  };

  // ── Kaydet ────────────────────────────────────────────────────────────
  const save = async (addAnother) => {
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: roundMoney(parsePrice(form.price)),
        category: form.category,
        image: form.image,
        isHidden: form.hidden,
      };
      const before = useProductStore.getState().products;
      await createProduct(payload); // mağaza hatayı bildirir ve fırlatmaz; başarı listeye eklenmesinden anlaşılır
      const after = useProductStore.getState().products;
      if (after.length <= before.length) return;
      const raw = after[after.length - 1];
      let created = raw?.product || raw; // mağaza sunucu yanıtını olduğu gibi ekler ({ message, product })
      if (!created?._id) return;

      // İndirim, öne çıkarma ve stok yalnızca kayıt sonrası uç noktalarla ayarlanır
      const followUps = [];
      if (form.discountedPrice !== "") followUps.push(["İndirim", () => axios.patch(`/products/${created._id}/discount`, { discountedPrice: roundMoney(parsePrice(form.discountedPrice)) })]);
      if (form.featured) followUps.push(["Öne çıkarma", () => axios.patch(`/products/${created._id}`)]);
      if (!form.inStock) followUps.push(["Tükendi işareti", () => axios.patch(`/products/toggle-out-of-stock/${created._id}`)]);
      for (const [label, call] of followUps) {
        try {
          const res = await call();
          created = { ...created, ...(res.data?.product || (res.data?._id ? res.data : {})) };
        } catch (error) {
          toast.error(`${label} uygulanamadı: ${errorMessage(error, "sunucu hatası")}`);
        }
      }
      // Listedeki ham yanıtı normalleştirilmiş ürünle değiştir
      setProducts(after.map((p) => (p === raw ? created : p)));
      setLastSaved(created);
      setDirty(false);
      if (addAnother) reset(true);
      else { setSubmitted(false); setTouched({}); }
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e) => { e.preventDefault(); save(false); };
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(e.shiftKey); }
  };

  const recent = useMemo(() => [...(Array.isArray(products) ? products : [])]
    .filter((p) => p && p._id && p.name)
    .sort((a, b) => createdTime(b) - createdTime(a))
    .slice(0, 5), [products]);

  const discountPctNow = (() => {
    const p = parsePrice(form.price);
    const d = parsePrice(form.discountedPrice);
    return form.discountedPrice !== "" && p > 0 && d >= 0 && d < p ? Math.round((1 - d / p) * 100) : null;
  })();

  return (
    <div className="ui-page crp-page" onPaste={onPaste}>
      <PageHeader
        title="Yeni ürün"
        description="Ürünü doldurun; sağdaki kart müşterinin göreceği hali anında gösterir."
        actions={
          <button type="button" className="ui-btn" onClick={() => window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "products" }))}>
            <ArrowLeft /> Ürünlere dön
          </button>
        }
      />

      {lastSaved && !dirty && (
        <div className="ui-banner ui-banner--info crp-saved" role="status">
          <Check />
          <span className="crp-saved-text">
            <strong>{lastSaved.name}</strong> kaydedildi{lastSaved.isHidden ? " (gizli)" : ""}.
          </span>
          <span className="ui-cluster crp-saved-actions">
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => openProduct(lastSaved._id)}><ExternalLink /> Ürünü aç</button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => reset(true)}><PlusCircle /> Yenisini ekle</button>
            <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label="Bildirimi kapat" onClick={() => setLastSaved(null)}><X /></button>
          </span>
        </div>
      )}

      <form className="crp-layout" onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate>
        <div className="ui-panel crp-form">
          {/* Temel bilgiler */}
          <section className="crp-section">
            <header className="crp-section-head">
              <h2>Temel bilgiler</h2>
              <p>Mağazada görünen ad ve reyon.</p>
            </header>
            <div className="crp-fields">
              <div className="crp-field">
                <label htmlFor="crp-name" className="ui-label">Ürün adı</label>
                <input
                  ref={nameRef} id="crp-name" className="ui-field" type="text" value={form.name} autoFocus
                  placeholder="Örn. Sütaş Süt" maxLength={120} aria-invalid={showError("name") ? "true" : undefined}
                  onChange={(e) => update({ name: e.target.value })} onBlur={() => touch("name")}
                />
                {showError("name") ? <p className="ui-hint crp-error">{errors.name}</p> : (
                  <div className="ui-chips crp-hints" aria-label="Ad önerileri">
                    {hints.map((h) => (
                      <button key={h} type="button" aria-pressed={form.name.toLocaleLowerCase("tr").includes(h.toLocaleLowerCase("tr"))} onClick={() => addHint(h)}>{h}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="crp-field">
                <label htmlFor="crp-category" className="ui-label">Kategori</label>
                <select
                  id="crp-category" className="ui-field" value={form.category} aria-invalid={showError("category") ? "true" : undefined}
                  onChange={(e) => update({ category: e.target.value })} onBlur={() => touch("category")}
                >
                  <option value="">Kategori seçin</option>
                  {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
                {showError("category") && <p className="ui-hint crp-error">{errors.category}</p>}
              </div>
            </div>
          </section>

          {/* Fiyat */}
          <section className="crp-section">
            <header className="crp-section-head">
              <h2>Fiyat</h2>
              <p>İndirimli fiyat girilirse kartta rozetle gösterilir.</p>
            </header>
            <div className="crp-fields crp-fields--2">
              <div className="crp-field">
                <label htmlFor="crp-price" className="ui-label">Fiyat</label>
                <div className="ui-field-prefix crp-money">
                  <span>₺</span>
                  <input
                    id="crp-price" className="ui-field ui-num" type="text" inputMode="decimal" value={form.price} placeholder="0,00"
                    aria-invalid={showError("price") ? "true" : undefined}
                    onChange={(e) => update({ price: e.target.value })} onBlur={() => touch("price")}
                  />
                </div>
                {showError("price") && <p className="ui-hint crp-error">{errors.price}</p>}
              </div>
              <div className="crp-field">
                <label htmlFor="crp-discount" className="ui-label">İndirimli fiyat <span className="ui-muted">(isteğe bağlı)</span></label>
                <div className="ui-field-prefix crp-money">
                  <span>₺</span>
                  <input
                    id="crp-discount" className="ui-field ui-num" type="text" inputMode="decimal" value={form.discountedPrice} placeholder="—"
                    aria-invalid={showError("discountedPrice") ? "true" : undefined}
                    onChange={(e) => update({ discountedPrice: e.target.value })} onBlur={() => touch("discountedPrice")}
                  />
                </div>
                {showError("discountedPrice") ? <p className="ui-hint crp-error">{errors.discountedPrice}</p>
                  : discountPctNow !== null && <p className="ui-hint">%{discountPctNow} indirim · kart üzerinde rozet olarak görünür</p>}
              </div>
            </div>
          </section>

          {/* Açıklama */}
          <section className="crp-section">
            <header className="crp-section-head">
              <h2>Açıklama</h2>
              <p>Ürün detayında görünür; kısa ve bilgilendirici olsun.</p>
            </header>
            <div className="crp-field">
              <label htmlFor="crp-desc" className="ui-label">Açıklama <span className="ui-muted">(isteğe bağlı)</span></label>
              <textarea
                id="crp-desc" className="ui-field crp-textarea" rows={3} value={form.description} maxLength={600}
                placeholder="İçindekiler, gramaj, saklama koşulu…" onChange={(e) => update({ description: e.target.value })}
              />
              <p className="ui-hint crp-counter">{form.description.length}/600</p>
            </div>
          </section>

          {/* Görsel */}
          <section className="crp-section">
            <header className="crp-section-head">
              <h2>Görsel</h2>
              <p>Sürükleyip bırakın, tıklayın ya da panodan yapıştırın. En fazla {MAX_IMAGE_PX} piksele küçültülür.</p>
            </header>
            <input ref={fileRef} type="file" accept="image/*" className="crp-file" onChange={onFile} aria-label="Görsel dosyası seç" />
            <div
              className="crp-drop" data-dragging={dragging || undefined} data-filled={form.image ? "true" : undefined} role="button" tabIndex={0}
              onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
              aria-label={form.image ? "Görseli değiştir" : "Görsel yükle"}
            >
              {imageBusy ? (
                <span className="crp-drop-empty"><Loader className="ui-spin" /><strong>Küçültülüyor…</strong></span>
              ) : form.image ? (
                <>
                  <span className="crp-drop-thumb"><img src={form.image} alt="Seçilen görsel" /></span>
                  <span className="crp-drop-text">
                    <strong>{imageInfo ? `${imageInfo.width}×${imageInfo.height}px · ${kb(imageInfo.bytes)}` : "Görsel yüklendi"}</strong>
                    {imageInfo && imageInfo.original.bytes > imageInfo.bytes && (
                      <span className="ui-muted">Orijinal {imageInfo.original.width}×{imageInfo.original.height}px · {kb(imageInfo.original.bytes)}</span>
                    )}
                    <span className="ui-muted">Değiştirmek için tıklayın ya da yeni görsel bırakın.</span>
                  </span>
                </>
              ) : (
                <span className="crp-drop-empty">
                  <span className="crp-drop-icon"><Upload /></span>
                  <strong>Görseli buraya bırakın</strong>
                  <span className="ui-muted">PNG, JPG veya WebP · en fazla {MAX_FILE_MB} MB</span>
                </span>
              )}
            </div>
            <div className="crp-image-tools">
              <button type="button" className="ui-btn ui-btn--sm" aria-pressed={square} onClick={toggleSquare}>
                <Crop /> Kare kırp
              </button>
              {form.image && (
                <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={clearImage}><Trash2 /> Görseli kaldır</button>
              )}
              <span className="ui-hint crp-image-hint">{square ? "Ortadan kare kesilir; kartlar kare görselle en iyi görünür." : "Oran korunur, yalnızca küçültülür."}</span>
            </div>
          </section>

          {/* Görünürlük */}
          <section className="crp-section">
            <header className="crp-section-head">
              <h2>Görünürlük ve stok</h2>
              <p>Kaydedildiğinde ürünün mağazadaki durumu.</p>
            </header>
            <div className="crp-toggles">
              <label className="crp-toggle">
                <input type="checkbox" checked={form.hidden} onChange={(e) => update({ hidden: e.target.checked })} />
                <span className="crp-toggle-icon">{form.hidden ? <EyeOff /> : <Eye />}</span>
                <span className="crp-toggle-text"><strong>Gizli olarak ekle</strong><small>Kontrol edene kadar mağazada listelenmez.</small></span>
              </label>
              <label className="crp-toggle">
                <input type="checkbox" checked={form.featured} onChange={(e) => update({ featured: e.target.checked })} />
                <span className="crp-toggle-icon"><Star /></span>
                <span className="crp-toggle-text"><strong>Öne çıkar</strong><small>Vitrinde öne çıkanlar arasında gösterilir.</small></span>
              </label>
              <label className="crp-toggle">
                <input type="checkbox" checked={!form.inStock} onChange={(e) => update({ inStock: !e.target.checked })} />
                <span className="crp-toggle-icon"><Package2 /></span>
                <span className="crp-toggle-text"><strong>Tükendi olarak işaretle</strong><small>Kart görünür ama sepete eklenemez.</small></span>
              </label>
            </div>
          </section>

          <footer className="crp-actions">
            <div className="ui-cluster crp-actions-main">
              <button type="submit" className="ui-btn ui-btn--primary" disabled={saving || (Boolean(lastSaved) && !dirty)} title={lastSaved && !dirty ? "Bu ürün zaten kaydedildi; değişiklik yapın ya da yenisini ekleyin" : undefined}>
                {saving ? <Loader className="ui-spin" /> : <Save />} Kaydet
              </button>
              <button type="button" className="ui-btn" disabled={saving || (Boolean(lastSaved) && !dirty)} onClick={() => save(true)}>
                <PlusCircle /> Kaydet ve yenisini ekle
              </button>
              {dirty && (
                <button type="button" className="ui-btn ui-btn--ghost" disabled={saving} onClick={() => reset(false)}><RotateCcw /> Temizle</button>
              )}
            </div>
            <span className="ui-hint crp-kbd">
              <kbd>Ctrl</kbd><kbd>↵</kbd> kaydet · <kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>↵</kbd> kaydet ve yenisini ekle
              {dirty && <span className="ui-badge ui-badge--warn crp-dirty">Kaydedilmedi</span>}
            </span>
          </footer>
        </div>

        <aside className="crp-side">
          <section className="ui-panel crp-preview" aria-label="Canlı önizleme">
            <div className="ui-panel-head">
              <div>
                <h2>Canlı önizleme</h2>
                <p>Müşteri uygulamasındaki kart</p>
              </div>
              {categoryName && <span className="ui-badge ui-badge--brand">{categoryName}</span>}
            </div>
            <div className="ui-panel-body crp-preview-body">
              <PreviewCard form={form} />
              <ul className="crp-preview-meta">
                <li>
                  <span className={`ui-badge ${form.hidden ? "ui-badge--warn" : "ui-badge--ok"}`}>{form.hidden ? <EyeOff /> : <Eye />}{form.hidden ? "Gizli" : "Görünür"}</span>
                  <span className={`ui-badge ${form.inStock ? "ui-badge--ok" : "ui-badge--danger"}`}>{form.inStock ? "Stokta" : "Tükendi"}</span>
                  {form.featured && <span className="ui-badge ui-badge--info"><Star /> Öne çıkan</span>}
                </li>
                <li className="ui-muted">{form.description.trim() ? form.description.trim() : "Açıklama girilmedi."}</li>
              </ul>
            </div>
          </section>

          <section className="ui-panel crp-recent" aria-label="Son eklenenler">
            <div className="ui-panel-head">
              <div>
                <h2>Son eklenenler</h2>
                <p>Kataloğa eklenen son 5 ürün</p>
              </div>
            </div>
            {recent.length === 0 ? (
              <EmptyState compact icon={Package2} title="Henüz ürün yok" description="Kaydettiğiniz ürünler burada listelenir." />
            ) : (
              <ul className="crp-recent-list">
                {recent.map((p) => (
                  <li key={p._id} className="crp-recent-row">
                    <span className="ui-thumb">{p.image ? <img src={cloudinaryImage(p.image, 120)} alt="" loading="lazy" /> : <Package2 />}</span>
                    <span className="crp-recent-text">
                      <strong className="ui-truncate">{p.name}</strong>
                      <small className="ui-muted">
                        {money(p.isDiscounted && p.discountedPrice ? p.discountedPrice : p.price)}
                        {p.isHidden && " · gizli"}
                        {p.createdAt && ` · ${timeAgo(p.createdAt)}`}
                      </small>
                    </span>
                    <button type="button" className="ui-icon-btn ui-icon-btn--sm" aria-label={`${p.name} ürününü aç`} title="Ürünü aç" onClick={() => openProduct(p._id)}>
                      <ExternalLink />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </form>
    </div>
  );
};

export default CreateProductForm;
