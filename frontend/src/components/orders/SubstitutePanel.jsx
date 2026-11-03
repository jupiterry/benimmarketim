// Detay çekmecesinin "Muadille değiştir" görünümü (Hazırlanıyor siparişinde eksik ürün). Önce aynı kategoriden, görünür
// ve stokta olan en yakın fiyatlı 5 ürün önerilir ("+₺2,50", "−₺1,00"); altında tüm katalogda arama vardır (AddItemPanel
// ile aynı arama). Bir ürüne dokunmak satırı aynı adetle o ürünle değiştirir (tek adım, tek "Geri al"); ardından
// detaya dönülür ve müşteriye hazır mesaj ("… kalmamıştı, yerine … koyduk") "Sipariş değişti" şeridinden gönderilir.
// "Ürünü tükendi işaretle" varsayılan açıktır (kayıttan sonra uygulanır; geri alınırsa uygulanmaz). Stil: orders-drawer.css.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Package2, RefreshCw, Replace, Search } from "lucide-react";
import { EmptyState, Skeleton, money, useDebounced } from "../admin/ui";
import { cloudinaryImage } from "../../lib/image";
import { signedMoney } from "./shared";
import { buildProductIndex, searchProducts, substituteSuggestions, unitDifference } from "./productSearch";
import "../../styles/orders-drawer.css";

const RESULT_LIMIT = 30;
const NO_PRODUCTS = [];

/** "+₺2,50" / "−₺1,00" / "Aynı fiyat" rozeti (birim fiyat farkı) */
const DiffBadge = ({ diff }) => {
  const tone = diff > 0 ? "warn" : diff < 0 ? "ok" : undefined;
  return (
    <span className={`ui-badge so-d-sub-diff${tone ? ` ui-badge--${tone}` : ""}`} title="Birim fiyat farkı (muadil − eksik ürün)">
      {diff === 0 ? "Aynı fiyat" : signedMoney(diff)}
    </span>
  );
};

const Thumb = ({ src }) => (
  <span className="ui-thumb so-d-add-thumb" aria-hidden="true">
    {src ? <img src={cloudinaryImage(src, 120)} alt="" loading="lazy" decoding="async" /> : <Package2 />}
  </span>
);

/**
 * Props: order, line (zenginleştirilmiş ürün satırı: name, quantity, price, productId, lineKey), products, loading, error,
 * onReload, onChoose(product, { markOut }) → boolean (uygulandıysa true), onDone
 */
export default function SubstitutePanel({ line, products = NO_PRODUCTS, loading = false, error = null, onReload, onChoose, onDone }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 120);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [markOut, setMarkOut] = useState(Boolean(line?.productId));
  const searchRef = useRef(null);
  const firstRef = useRef(null);
  const listId = `so-d-sub-list-${uid}`;
  const optionId = (index) => `so-d-sub-opt-${uid}-${index}`;

  const linePrice = Number(line?.price) || 0;
  const qty = Number(line?.quantity) || 1;
  const index = useMemo(() => buildProductIndex(products), [products]);
  const suggestions = useMemo(
    () => (line?.productId ? substituteSuggestions(index, { productId: line.productId, linePrice }) : []),
    [index, line?.productId, linePrice],
  );
  const results = useMemo(() => {
    if (!q.trim()) return [];
    return searchProducts(index, q).filter((entry) => String(entry.product._id) !== String(line?.productId)).slice(0, RESULT_LIMIT);
  }, [index, q, line?.productId]);
  const known = index.some((entry) => String(entry.product._id) === String(line?.productId));

  // Açılınca odak ilk öneriye (öneri yoksa aramaya). Katalog sonradan yüklenirse odak yerinden oynatılmaz (yazılan kaybolmaz).
  useEffect(() => {
    (firstRef.current || searchRef.current)?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    setActiveIndex(q.trim() ? 0 : -1);
  }, [q]);
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`so-d-sub-opt-${uid}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, uid]);

  if (!line) return null;
  const choose = (product) => {
    if (!product) return;
    if (onChoose?.(product, { markOut: markOut && Boolean(line.productId) })) onDone?.();
  };
  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = results[activeIndex] || (results.length === 1 ? results[0] : null);
      if (entry) choose(entry.product);
    } else if (e.key === "Escape") {
      // data-esc-clear: çekmece kapanmaz; dolu aramayı temizler, boşsa detaya döner
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery("");
      else onDone?.();
    }
  };
  const showSkeleton = loading && !index.length;
  const activeId = activeIndex >= 0 && results[activeIndex] ? optionId(activeIndex) : undefined;

  return (
    <div className="so-d-add so-d-sub">
      <div className="so-d-add-head">
        <div className="so-d-add-bar">
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost so-d-add-back" onClick={onDone}>
            <ArrowLeft aria-hidden="true" />Siparişe dön
          </button>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onReload} disabled={loading}
            title="Ürün listesini sunucudan yeniden yükle">
            <RefreshCw className={loading ? "ui-spin" : undefined} aria-hidden="true" />Yenile
          </button>
        </div>
        <div className="so-d-sub-missing">
          <Replace aria-hidden="true" />
          <div>
            <p className="so-d-sub-missing-name"><strong>{line.name || "Ürün"}</strong> yerine</p>
            <p className="so-d-sub-missing-meta ui-num">{money(linePrice)} × {qty} · muadil aynı adetle ({qty}) siparişe girer</p>
          </div>
        </div>
        {line.productId && (
          <label className="so-d-sub-markout">
            <input type="checkbox" className="ui-checkbox" checked={markOut} onChange={(e) => setMarkOut(e.target.checked)} />
            <span>{line.name || "Ürün"} tükendi olarak işaretlensin</span>
          </label>
        )}
      </div>

      {error && (
        <div className="ui-banner ui-banner--danger so-d-banner" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span className="so-d-banner-text"><strong>Ürünler yüklenemedi.</strong> {index.length ? "Liste eski olabilir." : "Bağlantınızı kontrol edip tekrar deneyin."}</span>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onReload} disabled={loading}>
            {loading ? <Loader2 className="ui-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}Tekrar dene
          </button>
        </div>
      )}

      <section className="so-d-sub-sec" aria-labelledby={`${uid}-sug`}>
        <h3 id={`${uid}-sug`} className="so-d-sub-h">Önerilen muadiller</h3>
        {showSkeleton ? (
          <div className="so-d-add-skeleton" aria-busy="true" aria-label="Ürünler yükleniyor">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={52} radius={8} />)}
          </div>
        ) : suggestions.length ? (
          <ul className="so-d-sub-list" aria-label="Aynı kategoriden, stokta olan ürünler">
            {suggestions.map((entry, i) => (
              <li key={entry.product._id}>
                <button ref={i === 0 ? firstRef : undefined} type="button" className="so-d-add-opt so-d-sub-opt" onClick={() => choose(entry.product)}
                  aria-label={`${line.name || "Ürün"} yerine ${entry.product.name}, ${money(entry.price)}, ${entry.diff === 0 ? "aynı fiyat" : `birim fark ${signedMoney(entry.diff)}`}`}>
                  <Thumb src={entry.product.image} />
                  <span className="so-d-add-opt-main">
                    <span className="so-d-add-opt-name">{entry.product.name}</span>
                    <span className="so-d-add-opt-meta">{entry.product.category && <span>{entry.product.category}</span>}</span>
                  </span>
                  <span className="so-d-add-opt-side">
                    <span className="so-d-add-price ui-num"><strong>{money(entry.price)}</strong></span>
                    <DiffBadge diff={entry.diff} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-hint so-d-sub-empty">
            {!line.productId || !known
              ? "Bu ürün katalogda bulunamadı; muadili aşağıdan arayın."
              : "Bu kategoride stokta başka ürün yok; aşağıdan arayın."}
          </p>
        )}
      </section>

      <section className="so-d-sub-sec" aria-labelledby={`${uid}-search`}>
        <h3 id={`${uid}-search`} className="so-d-sub-h">Katalogda ara</h3>
        <div className="ui-search so-d-add-search">
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            className="ui-field"
            placeholder="Ürün adı veya kategori"
            aria-label="Muadil için katalogda ürün ara"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={results.length > 0 ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            data-esc-clear="true"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>
        {q.trim() && !showSkeleton && (results.length ? (
          <div id={listId} role="listbox" aria-label="Arama sonuçları" className="so-d-add-list">
            {results.map((entry, i) => {
              const p = entry.product;
              const diff = unitDifference(entry.price, linePrice);
              return (
                <button key={p._id} id={optionId(i)} type="button" role="option" tabIndex={-1} aria-selected={i === activeIndex}
                  className="so-d-add-opt" data-active={i === activeIndex ? "true" : undefined} data-out={p.isOutOfStock ? "true" : undefined}
                  onClick={() => choose(p)}>
                  <Thumb src={p.image} />
                  <span className="so-d-add-opt-main">
                    <span className="so-d-add-opt-name">{p.name}</span>
                    <span className="so-d-add-opt-meta">{p.category && <span>{p.category}</span>}</span>
                  </span>
                  <span className="so-d-add-opt-side">
                    <span className="so-d-add-price ui-num"><strong>{money(entry.price)}</strong></span>
                    <DiffBadge diff={diff} />
                    {(p.isOutOfStock || p.isHidden) && (
                      <span className="so-d-add-flags">
                        {p.isOutOfStock && <span className="ui-badge ui-badge--warn">Tükendi</span>}
                        {p.isHidden && <span className="ui-badge">Gizli</span>}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Search} compact title="Ürün bulunamadı" description={`“${q.trim()}” için sonuç yok.`} />
        ))}
      </section>
    </div>
  );
}
