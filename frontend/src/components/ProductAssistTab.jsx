import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Camera, Check, ExternalLink, Globe, ImageOff, Layers, Link2, Loader, RefreshCw, Search, Sparkles, Wand2 } from "lucide-react";
import axios from "../lib/axios";
import { CATEGORIES, categoryName, errorMessage, formatPrice, shrinkPhoto } from "../lib/productAssist";
import { useProductStore } from "../stores/useProductStore";
import ProductAssistBulk from "./ProductAssistBulk";
import "../styles/product-assist.css";

const INITIAL = {
  photo: "",
  identity: null, // { names, categories, brand, size, note, similar, recognized }
  name: "",
  category: "",
  query: "",
  images: null, // görsel adayları; null = henüz aranmadı
  selectedUrl: "",
  prepared: null, // { image, backgroundRemoved, reason }
  price: "",
  prices: null, // internetteki fiyatlar (yalnızca referans)
  description: "",
};

// Tek ürün: fotoğraf → ad/kategori → görsel → fiyat
const SingleProductAssist = () => {
  const [state, setState] = useState(INITIAL);
  const [busy, setBusy] = useState(""); // "identify" | "search" | "prepare" | "save"
  const [errors, setErrors] = useState({});
  const [pastedUrl, setPastedUrl] = useState("");
  const fileInput = useRef(null);
  const { fetchAllProducts } = useProductStore();

  const patch = (changes) => setState((current) => ({ ...current, ...changes }));
  const setError = (key, message) => setErrors((current) => ({ ...current, [key]: message }));

  // İnternetteki fiyatlar arka planda aranır; fiyat kutusu kendiliğinden doldurulmaz
  const searchPrices = async (query) => {
    patch({ prices: null });
    try {
      const { data } = await axios.post("/product-assist/prices", { query });
      patch({ prices: { offers: data.offers || [], min: data.min, max: data.max, median: data.median } });
    } catch {
      patch({ prices: { offers: [], min: null, max: null, median: null } });
    }
  };

  const searchImages = async (query) => {
    const q = query.trim();
    if (q.length < 3) return;
    setBusy("search");
    setError("images", "");
    patch({ images: null, selectedUrl: "", prepared: null });
    try {
      const { data } = await axios.post("/product-assist/images", { query: q });
      patch({ images: data.images || [] });
    } catch (error) {
      patch({ images: [] });
      setError("images", errorMessage(error, "Görsel araması yapılamadı."));
    } finally {
      setBusy("");
    }
  };

  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let photo;
    try {
      photo = await shrinkPhoto(file);
    } catch {
      setError("photo", "Fotoğraf açılamadı. JPEG veya PNG bir fotoğraf deneyin.");
      return;
    }
    setState({ ...INITIAL, photo });
    setErrors({});
    setPastedUrl("");
    setBusy("identify");
    try {
      const { data } = await axios.post("/product-assist/identify", { photo });
      const identity = data;
      patch({
        identity,
        name: identity.names?.[0] || "",
        category: identity.categories?.[0]?.slug || "",
        query: identity.searchQuery || identity.names?.[0] || "",
      });
      setBusy("");
      if (!identity.recognized) {
        setError("identity", "Ürün tanınamadı. Ön yüzü daha net çekin ya da adı aşağıya kendiniz yazın.");
        return;
      }
      searchPrices(identity.names[0] || identity.searchQuery);
      await searchImages(identity.searchQuery || identity.names[0]);
    } catch (error) {
      setBusy("");
      setError("identity", errorMessage(error, "Fotoğraf yorumlanamadı. Tekrar deneyin."));
    }
  };

  const prepare = async (imageUrl) => {
    if (!imageUrl) return;
    setBusy("prepare");
    setError("prepare", "");
    patch({ selectedUrl: imageUrl, prepared: null });
    try {
      const { data } = await axios.post("/product-assist/prepare-image", { imageUrl });
      patch({ prepared: data });
    } catch (error) {
      setError("prepare", errorMessage(error, "Görsel hazırlanamadı. Başka bir görsel seçin."));
    } finally {
      setBusy("");
    }
  };

  const price = Number(String(state.price).replace(",", "."));
  const ready = state.name.trim().length >= 2 && state.category && state.prepared?.image && price > 0;

  const save = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy("save");
    try {
      await axios.post("/products", {
        name: state.name.trim(),
        description: state.description.trim(),
        price,
        category: state.category,
        image: state.prepared.image,
      });
      toast.success(`${state.name.trim()} kataloğa eklendi`);
      setState(INITIAL);
      setErrors({});
      setPastedUrl("");
      fetchAllProducts?.();
    } catch (error) {
      toast.error(errorMessage(error, "Ürün kaydedilemedi."));
    } finally {
      setBusy("");
    }
  };

  const identity = state.identity;
  const otherCategories = CATEGORIES.filter((category) => !identity?.categories?.some((item) => item.slug === category.slug));

  return (
    <form className="pa" onSubmit={save}>
      {/* 1 · Fotoğraf */}
      <section className="ui-panel pa-step" aria-labelledby="pa-photo">
        <header className="ui-panel-head">
          <div>
            <h2 id="pa-photo"><span className="pa-num">1</span>Ürünün fotoğrafı</h2>
            <p>Ön yüzü, yazıları okunacak şekilde çekin. Bu fotoğraf yalnızca ürünü tanımak için kullanılır.</p>
          </div>
        </header>
        <div className="ui-panel-body pa-photo-body">
          <button type="button" className="ui-dropzone pa-dropzone" onClick={() => fileInput.current?.click()} disabled={busy === "identify"}>
            {state.photo ? <img src={state.photo} alt="Yüklenen ürün fotoğrafı" /> : <Camera aria-hidden="true" />}
            <span>{state.photo ? "Başka fotoğraf seç" : "Fotoğraf çek veya seç"}</span>
          </button>
          <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
          <div className="pa-photo-status" aria-live="polite">
            {busy === "identify" && <p className="pa-working"><Loader className="ui-spin" />Ürün tanınıyor…</p>}
            {errors.photo && <p className="pa-error" role="alert">{errors.photo}</p>}
            {errors.identity && <p className="pa-error" role="alert">{errors.identity}</p>}
            {identity?.recognized && (
              <p className="pa-found"><Sparkles />{identity.brand ? `${identity.brand} · ` : ""}{identity.size || "gramaj okunamadı"}</p>
            )}
            {identity?.note && <p className="ui-hint">{identity.note}</p>}
          </div>
        </div>
      </section>

      {/* 2 · Ad ve kategori */}
      <section className="ui-panel pa-step" aria-labelledby="pa-name" data-disabled={!state.photo || busy === "identify"}>
        <header className="ui-panel-head">
          <div>
            <h2 id="pa-name"><span className="pa-num">2</span>Ad ve kategori</h2>
            <p>Önerilerden birini seçin, gerekirse düzeltin.</p>
          </div>
        </header>
        <div className="ui-panel-body ui-stack">
          {identity?.similar?.length > 0 && (
            <div className="ui-banner ui-banner--warn pa-similar" role="status">
              <AlertTriangle />
              <div>
                <strong>Katalogda benzer ürün var, tekrar eklemediğinizden emin olun:</strong>
                <ul>{identity.similar.map((item) => <li key={item._id}>{item.name} — {item.price} ₺</li>)}</ul>
              </div>
            </div>
          )}
          {identity?.names?.length > 0 && (
            <div className="pa-options" role="radiogroup" aria-label="Ürün adı önerileri">
              {identity.names.map((name) => (
                <button type="button" key={name} className="ui-option" role="radio" aria-checked={state.name === name} aria-pressed={state.name === name} onClick={() => patch({ name })}>
                  {state.name === name ? <Check /> : <span className="pa-dot" />}{name}
                </button>
              ))}
            </div>
          )}
          <div>
            <label htmlFor="pa-name-input" className="ui-label">Ürün adı</label>
            <input id="pa-name-input" className="ui-field" value={state.name} maxLength={90} placeholder="Örn. Ülker Çikolatalı Gofret 36 g"
              onChange={(event) => patch({ name: event.target.value })} />
          </div>
          <div>
            <span className="ui-label">Kategori</span>
            {identity?.categories?.length > 0 && (
              <div className="pa-options pa-options--row" role="radiogroup" aria-label="Kategori önerileri">
                {identity.categories.map((category, index) => (
                  <button type="button" key={category.slug} className="ui-option" role="radio" aria-checked={state.category === category.slug} aria-pressed={state.category === category.slug}
                    onClick={() => patch({ category: category.slug })}>
                    {state.category === category.slug ? <Check /> : <span className="pa-dot" />}
                    {category.name}{index === 0 && <span className="ui-badge ui-badge--brand">En uygun</span>}
                  </button>
                ))}
              </div>
            )}
            <select className="ui-field pa-select" aria-label="Başka kategori seç" value={identity?.categories?.some((item) => item.slug === state.category) ? "" : state.category}
              onChange={(event) => event.target.value && patch({ category: event.target.value })}>
              <option value="">{identity?.categories?.length ? "Başka bir kategori seç…" : "Kategori seç…"}</option>
              {otherCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* 3 · Görsel */}
      <section className="ui-panel pa-step pa-step--wide" aria-labelledby="pa-image" data-disabled={!state.photo || busy === "identify"}>
        <header className="ui-panel-head">
          <div>
            <h2 id="pa-image"><span className="pa-num">3</span>Mağaza görseli</h2>
            <p>Trendyol ve Getir&apos;den bulunan görsellerden birini seçin; arka planı otomatik kaldırılır.</p>
          </div>
        </header>
        <div className="ui-panel-body ui-stack">
          <div className="pa-search">
            <input className="ui-field" value={state.query} aria-label="Görsel arama sorgusu" placeholder="Aranacak ürün adı"
              onChange={(event) => patch({ query: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchImages(state.query); } }} />
            <button type="button" className="ui-btn" onClick={() => searchImages(state.query)} disabled={busy === "search" || state.query.trim().length < 3}>
              {busy === "search" ? <Loader className="ui-spin" /> : <Search />}Ara
            </button>
          </div>
          {errors.images && <p className="pa-error" role="alert">{errors.images}</p>}
          {busy === "search" && <div className="pa-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} className="ui-skeleton pa-tile" />)}</div>}
          {state.images?.length === 0 && !errors.images && busy !== "search" && (
            <p className="ui-empty pa-empty"><ImageOff />Görsel bulunamadı. Aramayı değiştirin ya da aşağıya bir görsel bağlantısı yapıştırın.</p>
          )}
          {state.images?.length > 0 && busy !== "search" && (
            <div className="pa-grid" role="radiogroup" aria-label="Görsel seçenekleri">
              {state.images.map((image) => (
                <button type="button" key={image.imageUrl} className="pa-tile" role="radio" aria-checked={state.selectedUrl === image.imageUrl}
                  data-selected={state.selectedUrl === image.imageUrl} onClick={() => prepare(image.imageUrl)} disabled={busy === "prepare"} title={image.title}>
                  <img src={image.imageUrl} alt={image.title || "Ürün görseli"} loading="lazy" referrerPolicy="no-referrer"
                    onError={(event) => { event.currentTarget.closest("button").hidden = true; }} />
                  <span className="pa-tile-source">{image.source}</span>
                  {state.selectedUrl === image.imageUrl && <span className="pa-tile-check"><Check /></span>}
                </button>
              ))}
            </div>
          )}
          <div className="pa-search">
            <input className="ui-field" value={pastedUrl} aria-label="Görsel bağlantısı" placeholder="ya da bir görsel bağlantısı yapıştırın (https://…)"
              onChange={(event) => setPastedUrl(event.target.value)} />
            <button type="button" className="ui-btn" onClick={() => prepare(pastedUrl.trim())} disabled={busy === "prepare" || !/^https?:\/\//i.test(pastedUrl.trim())}>
              <Link2 />Kullan
            </button>
          </div>
        </div>
      </section>

      {/* 4 · Önizleme, fiyat, kaydet */}
      <section className="ui-panel pa-step pa-step--wide" aria-labelledby="pa-save">
        <header className="ui-panel-head">
          <div>
            <h2 id="pa-save"><span className="pa-num">4</span>Fiyat ve kayıt</h2>
            <p>Görseli kontrol edin, fiyatı girin ve ürünü ekleyin.</p>
          </div>
        </header>
        <div className="ui-panel-body pa-final">
          <div className="pa-preview" aria-live="polite">
            {busy === "prepare" ? (
              <span className="pa-working"><Wand2 className="ui-spin" />Arka plan kaldırılıyor…</span>
            ) : state.prepared?.image ? (
              <img src={state.prepared.image} alt="Hazırlanan şeffaf ürün görseli" />
            ) : (
              <span className="ui-muted">Görsel seçilmedi</span>
            )}
          </div>
          <div className="ui-stack">
            {errors.prepare && <p className="pa-error" role="alert">{errors.prepare}</p>}
            {state.prepared && !state.prepared.backgroundRemoved && (
              <div className="ui-banner ui-banner--warn" role="status">
                <AlertTriangle />
                <span>Bu görselin zemini düz değil, arka planı kaldırılamadı. Beyaz zeminli başka bir görsel seçmeniz önerilir.</span>
              </div>
            )}
            <div className="ui-grid-2">
              <div>
                <label htmlFor="pa-price" className="ui-label">Fiyat (₺)</label>
                <input id="pa-price" className="ui-field" inputMode="decimal" value={state.price} placeholder="0,00"
                  onChange={(event) => patch({ price: event.target.value.replace(/[^\d.,]/g, "") })} />
              </div>
              <div>
                <span className="ui-label">Kategori</span>
                <p className="pa-summary">{state.category ? categoryName(state.category) : "—"}</p>
              </div>
            </div>
            {state.prices && (
              <div className="pab-prices pa-prices" aria-live="polite">
                <span className="ui-label"><Globe />İnternetteki fiyatlar</span>
                {!state.prices.offers.length ? <span className="ui-hint">Fiyat bulunamadı.</span> : (
                  <ul>
                    {state.prices.offers.map((offer) => (
                      <li key={`${offer.pageUrl}-${offer.price}`}>
                        <button type="button" className="pab-offer-use" onClick={() => patch({ price: String(offer.price).replace(".", ",") })} title="Bu fiyatı kullan">
                          <strong className="ui-num">{formatPrice(offer.price)}</strong>
                          <span>{offer.source}</span>
                        </button>
                        {offer.pageUrl && (
                          <a href={offer.pageUrl} target="_blank" rel="noopener noreferrer" className="ui-icon-btn ui-icon-btn--sm" aria-label={`${offer.source} sayfasını aç`} title={offer.title}>
                            <ExternalLink />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div>
              <label htmlFor="pa-desc" className="ui-label">Açıklama <span className="ui-muted">(isteğe bağlı)</span></label>
              <textarea id="pa-desc" className="ui-field" rows={2} maxLength={500} value={state.description} onChange={(event) => patch({ description: event.target.value })} />
            </div>
            <div className="ui-cluster pa-actions">
              <button type="submit" className="ui-btn ui-btn--primary ui-btn--lg" disabled={!ready || !!busy}>
                {busy === "save" ? <Loader className="ui-spin" /> : <Check />}Ürünü ekle
              </button>
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => { setState(INITIAL); setErrors({}); setPastedUrl(""); }} disabled={!!busy}>
                <RefreshCw />Baştan başla
              </button>
            </div>
            {!ready && state.photo && (
              <p className="ui-hint">
                Eksik: {[!(state.name.trim().length >= 2) && "ad", !state.category && "kategori", !state.prepared?.image && "görsel", !(price > 0) && "fiyat"].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
      </section>
    </form>
  );
};

// Üstte tek ürün / toplu ekleme seçimi. İki ekran da açık kalır; geçiş yapınca yarım iş kaybolmaz.
const ProductAssistTab = () => {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem("product-assist-mode") === "bulk" ? "bulk" : "single"; } catch { return "single"; }
  });
  const choose = (next) => {
    setMode(next);
    try { localStorage.setItem("product-assist-mode", next); } catch { /* tarayıcı depolaması kapalı olabilir */ }
  };

  return (
    <div className="pa-shell">
      <div className="ui-segmented pa-mode" role="tablist" aria-label="Ekleme şekli">
        <button type="button" role="tab" aria-selected={mode === "single"} aria-pressed={mode === "single"} onClick={() => choose("single")}>
          <Camera />Tek ürün
        </button>
        <button type="button" role="tab" aria-selected={mode === "bulk"} aria-pressed={mode === "bulk"} onClick={() => choose("bulk")}>
          <Layers />Toplu ekle <span className="pa-mode-hint">5–15 ürün</span>
        </button>
      </div>
      <div hidden={mode !== "single"}><SingleProductAssist /></div>
      <div hidden={mode !== "bulk"}><ProductAssistBulk /></div>
    </div>
  );
};

export default ProductAssistTab;
