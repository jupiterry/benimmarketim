// Detay çekmecesinin "Ürün ekle" görünümü (C13). Sözleşme: CONTRACTS.md §7.12. Stil: orders-drawer.css (so-d-add-).
// Katalogdan: Türkçe duyarsız arama (ad + kategori, 120 ms gecikmeli), görsel, etkin fiyat, Tükendi / Gizli rozetleri,
// ↑ ↓ Enter ile seçim; alttaki yapışkan çubukta adet (1–99), satır toplamı ve "Siparişe ekle". Ekleme sonrası
// seçim sıfırlanır, panel açık kalır (art arda ekleme). Manuel tutar: tutar (zorunlu, > 0) + isteğe bağlı ad.
// Ürün listesi ve yükleme / hata durumu konteynerden gelir (useProductStore.loading/error KULLANILMAZ).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Loader2, Minus, Package2, Plus, RefreshCw, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState, Segmented, Skeleton, money, useDebounced } from "../admin/ui";
import { cloudinaryImage } from "../../lib/image";
import { normalizeSearch } from "../../lib/orderTools";
import { parseAmount } from "./shared";
import "../../styles/orders-drawer.css";

const RESULT_LIMIT = 30;
const NO_PRODUCTS = [];
const QTY_MAX = 99;
const AMOUNT_MAX = 100000;
const PLACEHOLDER_NAME = normalizeSearch("Özel Ekleme");
const TABS = [
  { value: "catalog", label: "Katalogdan" },
  { value: "manual", label: "Manuel tutar" },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
/** Sunucunun resolveEffectiveUnitPrice kuralı: haftalık fiyat, geçerli indirim (flash sale dahil) ve liste fiyatının en düşüğü */
const effectivePrice = (product) => {
  const price = Number(product?.price) || 0;
  let best = price;
  const discounted = Number(product?.discountedPrice);
  if (product?.isDiscounted && Number.isFinite(discounted) && discounted >= 0 && discounted < best) best = discounted;
  const weekly = product?.weeklyPrice;
  if (weekly !== null && weekly !== undefined && Number.isFinite(Number(weekly)) && Number(weekly) >= 0 && Number(weekly) < best) best = Number(weekly);
  return best;
};
const isPlaceholder = (product) => Boolean(product?.isHidden) && normalizeSearch(product?.name) === PLACEHOLDER_NAME;

function CatalogSkeleton() {
  return (
    <div className="so-d-add-skeleton" aria-busy="true" aria-label="Ürünler yükleniyor">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="so-d-add-skeleton-row">
          <Skeleton width={44} height={44} radius={6} />
          <div className="so-d-add-skeleton-lines">
            <Skeleton width={`${50 + ((i * 13) % 35)}%`} />
            <Skeleton width={`${25 + ((i * 7) % 20)}%`} height={10} />
          </div>
          <Skeleton width={56} height={16} />
        </div>
      ))}
    </div>
  );
}

export default function AddItemPanel({ order, products = NO_PRODUCTS, loading = false, error = null, onReload, onAddProduct, onAddCustom, onDone }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [tab, setTab] = useState("catalog");
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 120);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [customName, setCustomName] = useState("");
  const [amountError, setAmountError] = useState("");
  const [savingCustom, setSavingCustom] = useState(false);
  const searchRef = useRef(null);
  const addBtnRef = useRef(null);
  const amountRef = useRef(null);
  const listId = `so-d-add-list-${uid}`;
  const optionId = (index) => `so-d-add-opt-${uid}-${index}`;

  // Arama dizini: ürün başına bir kez (ad + kategori, Türkçe duyarsız)
  const index = useMemo(() => (Array.isArray(products) ? products : [])
    .filter((p) => p && p._id && !isPlaceholder(p))
    .map((p) => ({ product: p, name: normalizeSearch(p.name), text: normalizeSearch(`${p.name || ""} ${p.category || ""}`), price: effectivePrice(p) })), [products]);

  const matches = useMemo(() => {
    const tokens = normalizeSearch(q).split(" ").filter(Boolean);
    if (!tokens.length) return index;
    const rank = (entry) => (entry.name.startsWith(tokens[0]) ? 0 : entry.name.split(" ").some((w) => w.startsWith(tokens[0])) ? 1 : 2);
    return index
      .filter((entry) => tokens.every((t) => entry.text.includes(t)))
      .map((entry, i) => ({ entry, i, r: rank(entry) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map(({ entry }) => entry);
  }, [index, q]);
  const results = matches.slice(0, RESULT_LIMIT);

  // Siparişte zaten olan ürünler (ürün kimliğine göre adet)
  const inOrder = useMemo(() => {
    const map = new Map();
    for (const p of order?.products || []) {
      if (p.productId) map.set(String(p.productId), (map.get(String(p.productId)) || 0) + (Number(p.quantity) || 0));
    }
    return map;
  }, [order?.products]);

  // Sorgu değişince ilk sonuç etkin olur (Enter onu seçer)
  useEffect(() => {
    setActiveIndex(q.trim() ? 0 : -1);
  }, [q]);
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`so-d-add-opt-${uid}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, uid]);
  // Sekme değişince ilgili alana odak
  useEffect(() => {
    const target = tab === "catalog" ? searchRef.current : amountRef.current;
    target?.focus({ preventScroll: true });
  }, [tab]);

  const choose = (product, { focusAdd = false } = {}) => {
    if (!product) return;
    if (String(selected?._id) !== String(product._id)) setQty(1);
    setSelected(product);
    if (focusAdd) requestAnimationFrame(() => addBtnRef.current?.focus({ preventScroll: true }));
  };
  const clearSelection = () => {
    setSelected(null);
    setQty(1);
    searchRef.current?.focus({ preventScroll: true });
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
      if (entry) choose(entry.product, { focusAdd: true });
    } else if (e.key === "Escape") {
      // data-esc-clear: çekmece kapanmaz; dolu aramayı temizler, boşsa detaya döner
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        setQuery("");
        setActiveIndex(-1);
      } else {
        onDone?.();
      }
    }
  };

  const addSelected = async () => {
    if (!selected || adding) return;
    setAdding(true);
    const product = selected;
    const ok = await onAddProduct?.(product, qty);
    setAdding(false);
    if (ok) {
      toast.success(`${product.name} siparişe eklendi`);
      setSelected(null);
      setQty(1);
      requestAnimationFrame(() => {
        searchRef.current?.focus({ preventScroll: true });
        searchRef.current?.select();
      });
    }
  };

  const parsedAmount = parseAmount(amount);
  const validAmount = parsedAmount !== null && round2(parsedAmount) > 0 && parsedAmount <= AMOUNT_MAX ? round2(parsedAmount) : null;
  const submitCustom = async (e) => {
    e.preventDefault();
    if (savingCustom) return;
    if (validAmount === null) {
      setAmountError(parsedAmount !== null && parsedAmount > AMOUNT_MAX ? "Tutar en fazla ₺100.000 olabilir" : "Geçerli bir tutar girin (ör. 12,50)");
      amountRef.current?.focus();
      return;
    }
    setSavingCustom(true);
    const ok = await onAddCustom?.(validAmount, customName.trim().slice(0, 80));
    setSavingCustom(false);
    if (ok) {
      toast.success("Tutar siparişe eklendi");
      onDone?.();
    }
  };
  const goManualWithQuery = () => {
    if (query.trim()) setCustomName(query.trim().slice(0, 80));
    setTab("manual");
  };

  const selectedPrice = selected ? effectivePrice(selected) : 0;
  const total = Number(order?.totalAmount) || 0;
  const hasProducts = index.length > 0;
  const showSkeleton = loading && !hasProducts;
  const activeId = activeIndex >= 0 && results[activeIndex] ? optionId(activeIndex) : undefined;

  return (
    <div className="so-d-add" data-tab={tab}>
      <div className="so-d-add-head">
        <div className="so-d-add-bar">
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost so-d-add-back" onClick={onDone}>
            <ArrowLeft aria-hidden="true" />Siparişe dön
          </button>
          {tab === "catalog" && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onReload} disabled={loading}
              title="Ürün listesini sunucudan yeniden yükle">
              <RefreshCw className={loading ? "ui-spin" : undefined} aria-hidden="true" />Yenile
            </button>
          )}
        </div>
        <Segmented ariaLabel="Ekleme yöntemi" options={TABS} value={tab} onChange={setTab} />
        {tab === "catalog" && (
          <div className="ui-search so-d-add-search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              className="ui-field"
              placeholder="Ürün adı veya kategori"
              aria-label="Katalogda ürün ara"
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
        )}
      </div>

      {tab === "catalog" ? (
        <>
          {error && (
            <div className="ui-banner ui-banner--danger so-d-banner" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span className="so-d-banner-text"><strong>Ürünler yüklenemedi.</strong> {hasProducts ? "Liste eski olabilir." : "Bağlantınızı kontrol edip tekrar deneyin."}</span>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onReload} disabled={loading}>
                {loading ? <Loader2 className="ui-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}Tekrar dene
              </button>
            </div>
          )}
          {showSkeleton ? (
            <CatalogSkeleton />
          ) : !hasProducts ? (
            !error && (
              <EmptyState icon={Package2} compact title="Katalogda ürün yok"
                description="Ürünler yüklenmediyse yenileyin ya da manuel tutar ekleyin."
                action={<button type="button" className="ui-btn ui-btn--sm" onClick={goManualWithQuery}>Manuel tutar ekle</button>} />
            )
          ) : results.length === 0 ? (
            <EmptyState icon={Search} compact title="Ürün bulunamadı"
              description={`“${q.trim()}” için sonuç yok. Kataloğa eklenmemiş bir şeyse manuel tutar olarak ekleyebilirsiniz.`}
              action={<button type="button" className="ui-btn ui-btn--sm" onClick={goManualWithQuery}>Manuel tutar ekle</button>} />
          ) : (
            <>
              <div id={listId} role="listbox" aria-label="Ürünler" className="so-d-add-list">
                {results.map((entry, i) => {
                  const p = entry.product;
                  const chosen = String(selected?._id) === String(p._id);
                  const listPrice = Number(p.price) || 0;
                  const discounted = entry.price < listPrice;
                  const count = inOrder.get(String(p._id));
                  return (
                    <button
                      key={p._id}
                      id={optionId(i)}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={chosen}
                      className="so-d-add-opt"
                      data-active={i === activeIndex ? "true" : undefined}
                      data-out={p.isOutOfStock ? "true" : undefined}
                      onClick={() => { setActiveIndex(i); choose(p); }}
                    >
                      <span className="ui-thumb so-d-add-thumb" aria-hidden="true">
                        {p.image ? <img src={cloudinaryImage(p.image, 120)} alt="" loading="lazy" decoding="async" /> : <Package2 />}
                      </span>
                      <span className="so-d-add-opt-main">
                        <span className="so-d-add-opt-name">{p.name}</span>
                        <span className="so-d-add-opt-meta">
                          {p.category && <span>{p.category}</span>}
                          {count ? <span className="so-d-add-inorder">Siparişte ×{count}</span> : null}
                        </span>
                      </span>
                      <span className="so-d-add-opt-side">
                        <span className="so-d-add-price ui-num">
                          {discounted && <s>{money(listPrice)}</s>}
                          <strong>{money(entry.price)}</strong>
                        </span>
                        {(p.isOutOfStock || p.isHidden) && (
                          <span className="so-d-add-flags">
                            {p.isOutOfStock && <span className="ui-badge ui-badge--warn">Tükendi</span>}
                            {p.isHidden && <span className="ui-badge">Gizli</span>}
                          </span>
                        )}
                      </span>
                      <Check className="so-d-add-check" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              {matches.length > RESULT_LIMIT && (
                <p className="ui-hint so-d-add-more">{matches.length} sonuçtan {RESULT_LIMIT}’u gösteriliyor · aramayı daraltın</p>
              )}
            </>
          )}

          <div className="so-d-add-foot" data-selected={selected ? "true" : undefined}>
            {selected ? (
              <div className="so-d-add-pick">
                <span className="ui-thumb so-d-add-thumb" aria-hidden="true">
                  {selected.image ? <img src={cloudinaryImage(selected.image, 120)} alt="" /> : <Package2 />}
                </span>
                <span className="so-d-add-pick-main">
                  <strong className="so-d-add-pick-name">{selected.name}</strong>
                  <span className="so-d-add-pick-meta ui-num">
                    {money(selectedPrice)} / adet
                    {selected.isOutOfStock && <span className="so-d-add-pick-warn"> · tükendi olarak işaretli</span>}
                  </span>
                </span>
                <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={clearSelection} aria-label="Seçimi kaldır" title="Seçimi kaldır">
                  <X aria-hidden="true" />
                </button>
              </div>
            ) : (
              <p className="so-d-add-foot-hint">Listeden bir ürün seçin; art arda birden fazla ürün ekleyebilirsiniz.</p>
            )}
            <div className="so-d-add-actions">
              {selected && (
                <>
                  <span className="ui-stepper so-d-stepper" role="group" aria-label="Eklenecek adet">
                    <button type="button" aria-label="Adedi azalt" title={qty <= 1 ? "En az 1 adet" : "Adedi azalt"} disabled={qty <= 1}
                      onClick={() => setQty((v) => Math.max(1, v - 1))}>
                      <Minus aria-hidden="true" />
                    </button>
                    <span className="ui-num" aria-live="polite" aria-atomic="true">{qty}</span>
                    <button type="button" aria-label="Adedi artır" title={qty >= QTY_MAX ? `En çok ${QTY_MAX} adet` : "Adedi artır"} disabled={qty >= QTY_MAX}
                      onClick={() => setQty((v) => Math.min(QTY_MAX, v + 1))}>
                      <Plus aria-hidden="true" />
                    </button>
                  </span>
                  <strong className="so-d-add-line-total ui-num" aria-label={`Satır toplamı ${money(selectedPrice * qty)}`}>{money(selectedPrice * qty)}</strong>
                </>
              )}
              <button type="button" className="ui-btn ui-btn--ghost so-d-add-done" onClick={onDone}>Bitti</button>
              <button type="button" ref={addBtnRef} className="ui-btn ui-btn--primary so-d-add-submit" disabled={!selected || adding} onClick={addSelected}>
                {adding ? <Loader2 className="ui-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {adding ? "Ekleniyor…" : "Siparişe ekle"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <form className="so-d-add-manual" onSubmit={submitCustom} noValidate>
          <div className="so-d-add-field">
            <label className="ui-label" htmlFor={`so-d-add-amount-${uid}`}>Tutar (₺)</label>
            <div className="ui-field-prefix">
              <span aria-hidden="true">₺</span>
              <input
                ref={amountRef}
                id={`so-d-add-amount-${uid}`}
                className="ui-field ui-num"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                required
                aria-required="true"
                aria-invalid={amountError ? "true" : undefined}
                aria-describedby={`so-d-add-amount-hint-${uid}`}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); if (amountError) setAmountError(""); }}
              />
            </div>
            <p id={`so-d-add-amount-hint-${uid}`} className={amountError ? "so-d-add-error" : "ui-hint"} role={amountError ? "alert" : undefined}>
              {amountError || (validAmount !== null
                ? `Sipariş toplamı ${money(total)} → ${money(total + validAmount)}`
                : "Siparişe 1 adet olarak eklenir ve toplamı artırır. Kuruş için virgül kullanın (12,50).")}
            </p>
          </div>
          <div className="so-d-add-field">
            <label className="ui-label" htmlFor={`so-d-add-name-${uid}`}>Ürün adı (isteğe bağlı)</label>
            <input
              id={`so-d-add-name-${uid}`}
              className="ui-field"
              maxLength={80}
              placeholder="Özel ekleme"
              autoComplete="off"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <p className="ui-hint">Fişte ve ürün listesinde “Elle eklendi” olarak görünür.</p>
          </div>
          <div className="so-d-add-foot">
            <div className="so-d-add-actions">
              <button type="button" className="ui-btn ui-btn--ghost so-d-add-done" onClick={onDone}>Vazgeç</button>
              <button type="submit" className="ui-btn ui-btn--primary so-d-add-submit" disabled={savingCustom}>
                {savingCustom ? <Loader2 className="ui-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {savingCustom ? "Ekleniyor…" : "Siparişe ekle"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
