import { useEffect, useRef, useState } from "react";
import {
  X, Upload, Check, RefreshCw, Trash2, Star, Eye, EyeOff, PackageX, Package, Percent, Zap, ImageOff, ToggleLeft, ToggleRight
} from "lucide-react";
import {
  CATEGORIES, categoryName, discountPct, flashStatus, money, normalizeCategory, parsePrice, roundMoney
} from "./productUtils";
import { FlashSaleForm, FlashSaleRow } from "./FlashSale";
import axios from "../../lib/axios";
import { AuditEntry } from "../AdminAuditTab";

/** Ürünün işlem kayıtları (açılınca yüklenir; ürün değişince yenilenir) */
const ProductHistory = ({ productId, version }) => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    axios.get("/orders-analytics/audit", { params: { target: productId, limit: 30 } })
      .then(({ data }) => { if (alive) { setEntries(data.entries || []); setError(""); } })
      .catch(() => { if (alive) setError("Geçmiş yüklenemedi"); });
    return () => { alive = false; };
  }, [open, productId, version]);
  return (
    <details className="prd-past aud-history" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Değişiklik geçmişi</summary>
      {error && <p className="prd-form-error">{error}</p>}
      {open && !entries && !error && <p className="ui-muted ui-text-sm">Yükleniyor…</p>}
      {entries && entries.length === 0 && <p className="ui-muted ui-text-sm">Bu ürün için kayıt yok. Bundan sonraki fiyat, stok, indirim ve kampanya değişiklikleri burada görünür.</p>}
      {entries && entries.length > 0 && (
        <ul className="aud-list">{entries.map((entry) => <AuditEntry key={entry._id} entry={entry} compact />)}</ul>
      )}
    </details>
  );
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const Switch = ({ on, onClick, label, disabled }) => (
  <button type="button" className="ui-icon-btn ui-switch" data-on={on} onClick={onClick} disabled={disabled}
    role="switch" aria-checked={on} aria-label={label} title={label}>
    {on ? <ToggleRight /> : <ToggleLeft />}
  </button>
);

/**
 * Ürün detay/düzenleme çekmecesi. Her bölüm kendi düğmesiyle kaydedilir; böylece fiyat
 * değişikliği ile ad değişikliği birbirini beklemez.
 */
const ProductDrawer = ({
  product, sales, now, busy, onClose, onSaveInfo, onSavePrice, onSaveDiscount, onRemoveDiscount,
  onToggle, onImage, onDelete, onCreateFlash, onEndFlash, onDeleteFlash
}) => {
  const [name, setName] = useState(product.name || "");
  const [category, setCategory] = useState(normalizeCategory(product.category));
  const [price, setPrice] = useState(String(product.price ?? ""));
  const [discount, setDiscount] = useState(product.isDiscounted ? String(product.discountedPrice ?? "") : "");
  const [showFlashForm, setShowFlashForm] = useState(false);
  const fileRef = useRef(null);

  // Ürün dışarıdan güncellenince (ör. satırdan fiyat değişti) alanları eşitle
  useEffect(() => { setName(product.name || ""); setCategory(normalizeCategory(product.category)); }, [product._id, product.name, product.category]);
  useEffect(() => { setPrice(String(product.price ?? "")); }, [product._id, product.price]);
  useEffect(() => {
    setDiscount(product.isDiscounted ? String(product.discountedPrice ?? "") : "");
  }, [product._id, product.isDiscounted, product.discountedPrice]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector(".ui-modal-backdrop")) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT") && t.dataset.escClear) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const infoDirty = name.trim() !== (product.name || "") || category !== normalizeCategory(product.category);
  const priceNum = parsePrice(price);
  const priceDirty = Number.isFinite(priceNum) && roundMoney(priceNum) !== roundMoney(product.price);
  const priceValid = Number.isFinite(priceNum) && priceNum > 0;
  const discNum = parsePrice(discount);
  const discValid = Number.isFinite(discNum) && discNum > 0 && discNum < Number(product.price);
  const pct = discValid ? Math.round((1 - discNum / Number(product.price)) * 100) : 0;

  const productSales = sales.filter((s) => (s.product?._id || s.product) === product._id);
  const openSales = productSales.filter((s) => flashStatus(s, now) !== "ended");
  const pastSales = productSales.filter((s) => flashStatus(s, now) === "ended").slice(0, 5);
  const activeFlash = openSales.find((s) => flashStatus(s, now) === "active");

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return onImage(null, "Lütfen bir görsel dosyası seçin");
    if (file.size > MAX_IMAGE_BYTES) return onImage(null, "Görsel 5 MB'tan küçük olmalı");
    onImage(file);
  };

  const setPctDiscount = (p) => setDiscount(String(roundMoney(Number(product.price) * (1 - p / 100))));

  return (
    <div className="ui-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="ui-drawer prd-drawer" role="dialog" aria-modal="true" aria-label={`${product.name} ürün detayı`}>
        <div className="ui-drawer-head">
          <div className="prd-drawer-title">
            <h2 className="ui-truncate">{product.name}</h2>
            <p>{categoryName(product.category)}</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Kapat"><X /></button>
        </div>

        <div className="ui-drawer-body prd-drawer-body">
          {/* Görsel + özet */}
          <section className="prd-hero">
            <div className="prd-hero-img">
              {product.image ? <img src={product.image} alt={product.name} /> : <div className="prd-noimg"><ImageOff /><span>Görsel yok</span></div>}
              {busy.image && <div className="prd-hero-loading"><RefreshCw className="ui-spin" /></div>}
            </div>
            <div className="prd-hero-side">
              <div className="prd-hero-price">
                {product.isDiscounted ? (
                  <>
                    <strong>{money(product.discountedPrice)}</strong>
                    <s>{money(product.price)}</s>
                    <span className="ui-badge ui-badge--info">-%{discountPct(product)}</span>
                  </>
                ) : <strong>{money(product.price)}</strong>}
              </div>
              <div className="prd-hero-badges">
                <span className={`ui-badge ${product.isOutOfStock ? "ui-badge--danger" : "ui-badge--ok"}`}>
                  {product.isOutOfStock ? "Stokta yok" : "Stokta"}
                </span>
                <span className={`ui-badge ${product.isHidden ? "ui-badge--warn" : ""}`}>{product.isHidden ? "Gizli" : "Görünür"}</span>
                {product.isFeatured && <span className="ui-badge ui-badge--brand">Öne çıkan</span>}
                {activeFlash && <span className="ui-badge ui-badge--ok">Flash %{activeFlash.discountPercentage}</span>}
              </div>
              {activeFlash && (
                <button type="button" className="ui-btn ui-btn--sm prd-flash-end" onClick={() => onEndFlash(activeFlash)} disabled={busy.flash}>
                  Flaş indirimi şimdi bitir
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => fileRef.current?.click()} disabled={busy.image}>
                <Upload />{product.image ? "Görseli değiştir" : "Görsel yükle"}
              </button>
            </div>
          </section>

          {/* Durum */}
          <section className="prd-sec">
            <h3>Durum</h3>
            <div className="prd-toggles">
              <div className="prd-toggle">
                {product.isOutOfStock ? <PackageX /> : <Package />}
                <span><strong>Stokta</strong><small>Kapalıyken müşteri sepete ekleyemez</small></span>
                <Switch on={!product.isOutOfStock} onClick={() => onToggle("stock")} label="Stok durumunu değiştir" disabled={busy.stock} />
              </div>
              <div className="prd-toggle">
                {product.isHidden ? <EyeOff /> : <Eye />}
                <span><strong>Sitede görünür</strong><small>Gizli ürünler listelerde çıkmaz</small></span>
                <Switch on={!product.isHidden} onClick={() => onToggle("hidden")} label="Görünürlüğü değiştir" disabled={busy.hidden} />
              </div>
              <div className="prd-toggle">
                <Star />
                <span><strong>Öne çıkan</strong><small>Ana sayfadaki öne çıkanlarda gösterilir</small></span>
                <Switch on={Boolean(product.isFeatured)} onClick={() => onToggle("featured")} label="Öne çıkarmayı değiştir" disabled={busy.featured} />
              </div>
            </div>
          </section>

          {/* Bilgiler */}
          <section className="prd-sec">
            <h3>Bilgiler</h3>
            <form className="prd-form" onSubmit={(e) => { e.preventDefault(); if (infoDirty && name.trim()) onSaveInfo({ name: name.trim(), category }); }}>
              <div className="prd-form-row">
                <label className="ui-label" htmlFor="prd-name">Ürün adı</label>
                <input id="prd-name" className="ui-field" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
              </div>
              <div className="prd-form-row">
                <label className="ui-label" htmlFor="prd-cat">Kategori</label>
                <select id="prd-cat" className="ui-field" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {!CATEGORIES.some((c) => c.slug === category) && <option value={category}>{categoryName(category)}</option>}
                  {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
              {infoDirty && (
                <div className="prd-form-actions">
                  <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setName(product.name || ""); setCategory(normalizeCategory(product.category)); }}>Geri al</button>
                  <button type="submit" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!name.trim() || busy.info}>
                    {busy.info ? <RefreshCw className="ui-spin" /> : <Check />}Kaydet
                  </button>
                </div>
              )}
            </form>
          </section>

          {/* Fiyat ve indirim */}
          <section className="prd-sec">
            <h3>Fiyat ve indirim</h3>
            <form className="prd-form prd-inline-form" onSubmit={(e) => { e.preventDefault(); if (priceDirty && priceValid) onSavePrice(roundMoney(priceNum)); }}>
              <div className="prd-form-row ui-grow">
                <label className="ui-label" htmlFor="prd-price">Satış fiyatı</label>
                <div className="ui-field-prefix">
                  <span>₺</span>
                  <input id="prd-price" className="ui-field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!priceValid} />
                </div>
              </div>
              <button type="submit" className="ui-btn ui-btn--primary" disabled={!priceDirty || !priceValid || busy.price}>
                {busy.price ? <RefreshCw className="ui-spin" /> : <Check />}Fiyatı kaydet
              </button>
            </form>
            {product.isDiscounted && Number(product.discountedPrice) >= Number(product.price) && (
              <p className="prd-form-error">İndirimli fiyat satış fiyatından yüksek; indirimi güncelleyin ya da kaldırın.</p>
            )}

            <form className="prd-form" onSubmit={(e) => { e.preventDefault(); if (discValid) onSaveDiscount(roundMoney(discNum)); }}>
              <div className="prd-inline-form">
                <div className="prd-form-row ui-grow">
                  <label className="ui-label" htmlFor="prd-disc">İndirimli fiyat</label>
                  <div className="ui-field-prefix">
                    <span>₺</span>
                    <input id="prd-disc" className="ui-field" inputMode="decimal" value={discount} placeholder="İndirim yok"
                      onChange={(e) => setDiscount(e.target.value)} aria-invalid={discount !== "" && !discValid} />
                  </div>
                </div>
                <button type="submit" className="ui-btn" disabled={!discValid || busy.discount ||
                  (product.isDiscounted && roundMoney(discNum) === roundMoney(product.discountedPrice))}>
                  <Percent />Uygula
                </button>
                {product.isDiscounted && (
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={onRemoveDiscount} disabled={busy.discount}>Kaldır</button>
                )}
              </div>
              <div className="ui-chips prd-wrap">
                {[5, 10, 15, 20, 25, 30].map((p) => (
                  <button key={p} type="button" aria-pressed={pct === p} onClick={() => setPctDiscount(p)}>-%{p}</button>
                ))}
                {discValid && <span className="ui-muted ui-text-xs prd-disc-note">Müşteri {money(Number(product.price) - discNum)} tasarruf eder (%{pct})</span>}
                {discount !== "" && !discValid && <span className="prd-form-error">İndirimli fiyat 0 ile satış fiyatı arasında olmalı</span>}
              </div>
              {activeFlash && (
                <p className="ui-hint">Bu ürün şu an flash sale’de. Kampanya bitince ürünün önceki indirimi geri yüklenir.</p>
              )}
            </form>
          </section>

          {/* Flash sale */}
          <section className="prd-sec">
            <div className="prd-sec-head">
              <h3><Zap /> Flash sale</h3>
              {!showFlashForm && (
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setShowFlashForm(true)}>
                  <Zap />Yeni kampanya
                </button>
              )}
            </div>
            {showFlashForm && (
              <FlashSaleForm products={[product]} busy={busy.flash}
                onCancel={() => setShowFlashForm(false)}
                onSubmit={async (payload) => { if (await onCreateFlash(payload)) setShowFlashForm(false); }} />
            )}
            {openSales.length > 0 ? (
              <ul className="prd-flash-list">
                {openSales.map((sale) => (
                  <FlashSaleRow key={sale._id} sale={{ ...sale, product }} now={now} showProduct={false}
                    busy={busy.flash} onEnd={onEndFlash} onDelete={onDeleteFlash} />
                ))}
              </ul>
            ) : !showFlashForm && <p className="ui-muted ui-text-sm">Bu ürün için açık kampanya yok.</p>}
            {pastSales.length > 0 && (
              <details className="prd-past">
                <summary>Geçmiş kampanyalar ({pastSales.length})</summary>
                <ul className="prd-flash-list">
                  {pastSales.map((sale) => (
                    <FlashSaleRow key={sale._id} sale={{ ...sale, product }} now={now} showProduct={false}
                      busy={busy.flash} onEnd={onEndFlash} onDelete={onDeleteFlash} />
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="prd-sec">
            <h3>Geçmiş</h3>
            <ProductHistory productId={product._id} version={product.updatedAt} />
          </section>

          <section className="prd-sec prd-danger">
            <div>
              <strong>Ürünü sil</strong>
              <p className="ui-muted ui-text-sm">Ürün katalogdan kalıcı olarak kaldırılır. Sadece satıştan çekmek için gizlemeyi tercih edin.</p>
            </div>
            <button type="button" className="ui-btn ui-btn--danger" onClick={onDelete}><Trash2 />Sil</button>
          </section>
        </div>
      </aside>
    </div>
  );
};

export default ProductDrawer;
