import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, Download, RefreshCw, X, Star, Zap, Pencil, Trash2, Eye, EyeOff, Package, PackageX, ImageOff,
  Percent, Tag, GripVertical, ArrowUpToLine, ArrowDownToLine, ChevronUp, ChevronDown, ListOrdered, Check,
  ToggleLeft, ToggleRight, Layers, FolderInput, AlertTriangle, Boxes
} from "lucide-react";
import toast from "react-hot-toast";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import axios from "../lib/axios";
import { cloudinaryImage } from "../lib/image";
import { useProductStore } from "../stores/useProductStore";
import { useConfirm } from "./ConfirmModal";
import ProductDrawer from "./products/ProductDrawer";
import { FlashBadge, FlashSaleForm, FlashSaleManager } from "./products/FlashSale";
import {
  CATEGORIES, FILTERS, SORTS, buildCsv, categoryName, discountPct, downloadText, errorMessage, flashIndex,
  flashStatus, fold, hasImage, isPublished, matchesFilter, mergeOrder, money, normalizeCategory, parsePrice, readPrefs,
  roundMoney, runPool, sortProducts, writePrefs
} from "./products/productUtils";
import "../styles/products.css";

const PAGE = 60;
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color"]);
const isTypingTarget = (el) => Boolean(el) && (
  (el.tagName === "INPUT" && !NON_TEXT_INPUTS.has(el.type)) ||
  el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
);

// Store'daki ürünleri yerinde günceller (tüm katalog yeniden çekilmeden)
const patchProducts = (ids, fieldsOrFn) => {
  const set = new Set(ids);
  useProductStore.setState((s) => ({
    products: (s.products || []).map((p) => (set.has(p._id)
      ? { ...p, ...(typeof fieldsOrFn === "function" ? fieldsOrFn(p) : fieldsOrFn) }
      : p)),
  }));
};
const removeProducts = (ids) => {
  const set = new Set(ids);
  useProductStore.setState((s) => ({ products: (s.products || []).filter((p) => !set.has(p._id)) }));
};

const useNow = (ms) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

const Kpi = ({ icon: Icon, label, value, note, tone, active, onClick }) => (
  <button type="button" className="prd-kpi" data-tone={tone} aria-pressed={active} onClick={onClick}>
    <span className="prd-kpi-top">
      <span className="prd-kpi-label">{label}</span>
      <span className="prd-kpi-icon"><Icon /></span>
    </span>
    <span className="prd-kpi-value">{value}</span>
    {note && <span className="prd-kpi-note">{note}</span>}
  </button>
);

const Switch = ({ on, onClick, label, disabled }) => (
  <button type="button" className="ui-icon-btn ui-switch prd-switch" data-on={on} onClick={onClick} disabled={disabled}
    role="switch" aria-checked={on} aria-label={label} title={label}>
    {on ? <ToggleRight /> : <ToggleLeft />}
  </button>
);

/** Satır içi fiyat düzenleyici: Enter kaydeder, Esc vazgeçer */
const PriceCell = ({ product, editing, busy, onStart, onCancel, onCommit }) => {
  const [value, setValue] = useState(String(product.price ?? ""));
  useEffect(() => { if (editing) setValue(String(product.price ?? "")); }, [editing, product.price]);
  const invalidDiscount = product.isDiscounted && Number(product.discountedPrice) >= Number(product.price);

  if (editing) {
    const commit = () => {
      const n = parsePrice(value);
      if (!Number.isFinite(n) || n <= 0) return toast.error("Geçerli bir fiyat girin");
      if (roundMoney(n) === roundMoney(product.price)) return onCancel();
      onCommit(roundMoney(n));
    };
    return (
      <div className="prd-price-edit">
        <input autoFocus className="ui-field ui-field--sm" inputMode="decimal" value={value} aria-label="Yeni fiyat"
          onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
          }} />
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={commit} disabled={busy} aria-label="Kaydet">
          {busy ? <RefreshCw className="ui-spin" /> : <Check />}
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="prd-price" onClick={onStart} title="Fiyatı düzenlemek için tıklayın">
      {product.isDiscounted ? (
        <>
          <strong className={invalidDiscount ? "prd-warn-text" : ""}>{money(product.discountedPrice)}</strong>
          <s>{money(product.price)}</s>
        </>
      ) : <strong>{money(product.price)}</strong>}
      {invalidDiscount && <span className="prd-price-warn" title="İndirimli fiyat satış fiyatından yüksek"><AlertTriangle /></span>}
      <Pencil className="prd-price-pen" />
    </button>
  );
};

const ProductRow = memo(({
  product, selected, flash, now, editingPrice, busy, onSelect, onOpen, onToggle, onPriceStart, onPriceCancel,
  onPriceCommit, onFlash, onDelete
}) => {
  const pct = discountPct(product);
  return (
    <div className="prd-row" role="row" data-selected={selected || undefined}
      data-muted={product.isHidden || product.isOutOfStock || undefined}>
      <div className="prd-cell prd-cell--check" role="cell">
        <input type="checkbox" className="ui-checkbox" checked={selected} onChange={(e) => onSelect(product._id, e.nativeEvent.shiftKey)}
          aria-label={`${product.name} seç`} />
      </div>
      <div className="prd-cell prd-cell--product" role="cell">
        <button type="button" className="prd-thumb" onClick={() => onOpen(product._id)} aria-label={`${product.name} detayını aç`}>
          {hasImage(product) ? <img src={cloudinaryImage(product.thumbnail || product.image, 120)} alt="" loading="lazy" /> : <ImageOff />}
        </button>
        <div className="prd-name-wrap">
          <button type="button" className="prd-name" onClick={() => onOpen(product._id)}>{product.name}</button>
          <div className="prd-meta">
            <span className="prd-cat">{categoryName(product.category)}</span>
            {product.isFeatured && <span className="prd-tag prd-tag--star"><Star />Öne çıkan</span>}
            {pct > 0 && !flash && <span className="prd-tag prd-tag--disc">-%{pct}</span>}
            <FlashBadge entry={flash} now={now} />
            {!hasImage(product) && <span className="prd-tag prd-tag--warn">Görsel yok</span>}
          </div>
        </div>
      </div>
      <div className="prd-cell prd-cell--price" role="cell">
        <PriceCell product={product} editing={editingPrice} busy={busy?.price}
          onStart={() => onPriceStart(product._id)} onCancel={onPriceCancel} onCommit={(v) => onPriceCommit(product._id, v)} />
      </div>
      <div className="prd-cell prd-cell--switch" role="cell">
        <span className="prd-cell-label">Stok</span>
        <Switch on={!product.isOutOfStock} disabled={busy?.stock} onClick={() => onToggle(product._id, "stock")}
          label={product.isOutOfStock ? "Stokta yok — stoka al" : "Stokta — tükendi olarak işaretle"} />
      </div>
      <div className="prd-cell prd-cell--switch" role="cell">
        <span className="prd-cell-label">Görünür</span>
        <Switch on={!product.isHidden} disabled={busy?.hidden} onClick={() => onToggle(product._id, "hidden")}
          label={product.isHidden ? "Gizli — yayınla" : "Görünür — gizle"} />
      </div>
      <div className="prd-cell prd-cell--actions" role="cell">
        <button type="button" className="ui-icon-btn ui-icon-btn--sm prd-star" data-on={Boolean(product.isFeatured)}
          onClick={() => onToggle(product._id, "featured")} disabled={busy?.featured}
          aria-label={product.isFeatured ? "Öne çıkarmayı kaldır" : "Öne çıkar"} title={product.isFeatured ? "Öne çıkarmayı kaldır" : "Öne çıkar"}>
          <Star />
        </button>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm prd-zap" data-on={Boolean(flash)} onClick={() => onFlash(product)}
          aria-label="Flash sale başlat" title="Flash sale başlat"><Zap /></button>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => onOpen(product._id)} aria-label="Düzenle" title="Düzenle">
          <Pencil />
        </button>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" onClick={() => onDelete(product)}
          aria-label="Sil" title="Sil"><Trash2 /></button>
      </div>
    </div>
  );
});
ProductRow.displayName = "ProductRow";

/** Toplu işlem penceresi: fiyat, indirim, kategori, flash sale */
const BulkModal = ({ mode, products, busy, onClose, onSubmit }) => {
  const [priceType, setPriceType] = useState("percentage");
  const [value, setValue] = useState("");
  const [discountMode, setDiscountMode] = useState("apply");
  const [category, setCategory] = useState(CATEGORIES[0].slug);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const n = parsePrice(value);
  const titles = {
    price: "Toplu fiyat güncelle", discount: "Toplu indirim", category: "Kategori taşı",
    flash: products.length === 1 ? `Flash sale · ${products[0].name}` : "Toplu flash sale",
  };
  const example = products[0];
  let preview = null;
  if (mode === "price" && Number.isFinite(n) && example) {
    const p = Number(example.price);
    const next = priceType === "set" ? n : priceType === "increase" ? p + n : priceType === "decrease" ? p - n : p * (1 + n / 100);
    preview = <>Örnek: {example.name} <s>{money(p)}</s> → <strong>{money(Math.max(0, next))}</strong></>;
  }
  if (mode === "discount" && discountMode === "apply" && Number.isFinite(n) && example) {
    preview = <>Örnek: {example.name} <s>{money(example.price)}</s> → <strong>{money(example.price * (1 - n / 100))}</strong></>;
  }
  const valid = mode === "category" || (mode === "discount" && discountMode === "remove") ||
    (mode === "price" && Number.isFinite(n) && (priceType === "percentage" ? n > -100 && n !== 0 : priceType === "set" ? n > 0 : n > 0)) ||
    (mode === "discount" && Number.isFinite(n) && n >= 1 && n <= 99);

  const submit = (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    if (mode === "price") onSubmit({ priceType, priceValue: roundMoney(n) });
    if (mode === "discount") onSubmit({ discountMode, pct: n });
    if (mode === "category") onSubmit({ category });
  };

  return (
    <div className="ui-modal-backdrop prd-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="ui-modal prd-modal" role="dialog" aria-modal="true" aria-label={titles[mode]}>
        <div className="ui-modal-header">
          <div>
            <h2 className="ui-title">{titles[mode]}</h2>
            <p className="ui-muted ui-text-sm">{products.length} ürün seçili</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} disabled={busy} aria-label="Kapat"><X /></button>
        </div>
        {mode === "flash" ? (
          <div className="ui-modal-body">
            <FlashSaleForm products={products} busy={busy} onCancel={onClose}
              submitLabel={products.length > 1 ? `${products.length} ürüne uygula` : "Flash sale başlat"}
              onSubmit={(payload) => onSubmit(payload)} />
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="ui-modal-body prd-modal-body">
              {mode === "price" && (
                <>
                  <div className="ui-segmented prd-seg">
                    {[["percentage", "Yüzde"], ["increase", "+ ₺"], ["decrease", "− ₺"], ["set", "Sabit fiyat"]].map(([k, l]) => (
                      <button key={k} type="button" aria-pressed={priceType === k} onClick={() => setPriceType(k)}>{l}</button>
                    ))}
                  </div>
                  <div className="ui-field-prefix">
                    <span>{priceType === "percentage" ? "%" : "₺"}</span>
                    <input autoFocus className="ui-field" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
                      placeholder={priceType === "percentage" ? "Örn. 10 (zam) ya da -5 (indirim)" : "Tutar"} aria-label="Değer" />
                  </div>
                  <p className="ui-hint">Fiyatın altında kalmayan eski indirimler otomatik kaldırılır.</p>
                </>
              )}
              {mode === "discount" && (
                <>
                  <div className="ui-segmented prd-seg">
                    <button type="button" aria-pressed={discountMode === "apply"} onClick={() => setDiscountMode("apply")}>İndirim uygula</button>
                    <button type="button" aria-pressed={discountMode === "remove"} onClick={() => setDiscountMode("remove")}>İndirimi kaldır</button>
                  </div>
                  {discountMode === "apply" && (
                    <>
                      <div className="ui-field-prefix">
                        <span>%</span>
                        <input autoFocus className="ui-field" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
                          placeholder="İndirim oranı (1-99)" aria-label="İndirim oranı" />
                      </div>
                      <div className="ui-chips prd-wrap">
                        {[5, 10, 15, 20, 25, 30].map((p) => (
                          <button key={p} type="button" aria-pressed={n === p} onClick={() => setValue(String(p))}>%{p}</button>
                        ))}
                      </div>
                      <p className="ui-hint">Kalıcı indirimdir. Belirli bir süre için Flash sale kullanın.</p>
                    </>
                  )}
                </>
              )}
              {mode === "category" && (
                <select className="ui-field" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Hedef kategori">
                  {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              )}
              {preview && <p className="prd-preview">{preview}</p>}
            </div>
            <div className="ui-modal-footer">
              <button type="button" className="ui-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
              <button type="submit" className="ui-btn ui-btn--primary" disabled={!valid || busy}>
                {busy ? <RefreshCw className="ui-spin" /> : <Check />}Uygula
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const ProductsList = ({ onCreate }) => {
  const products = useProductStore((s) => s.products);
  const fetchAllProducts = useProductStore((s) => s.fetchAllProducts);
  const { confirm } = useConfirm();
  const now = useNow(30000);

  const prefs = useMemo(readPrefs, []);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState(prefs.category || "");
  const [filter, setFilter] = useState(prefs.filter || "all");
  const [sort, setSort] = useState(prefs.sort || "order");
  const [selected, setSelected] = useState(() => new Set());
  const [visible, setVisible] = useState(PAGE);
  const [detailId, setDetailId] = useState(null);
  const [priceEditId, setPriceEditId] = useState(null);
  const [busy, setBusy] = useState({});
  const [bulk, setBulk] = useState(null); // { mode, ids }
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesBusyId, setSalesBusyId] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [reorder, setReorder] = useState(null); // sıralama modundaki liste
  const [reorderSaving, setReorderSaving] = useState(false);
  const searchRef = useRef(null);
  const sentinelRef = useRef(null);
  const lastClickedRef = useRef(null);

  useEffect(() => writePrefs({ category, filter, sort }), [category, filter, sort]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    await fetchAllProducts();
    setLoading(false);
  }, [fetchAllProducts]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const res = await axios.get("/flash-sales");
      setSales(res.data.flashSales || []);
    } catch (error) {
      toast.error(errorMessage(error, "Flash sale'ler yüklenemedi"));
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); loadSales(); }, [loadProducts, loadSales]);

  const catalog = useMemo(() => (Array.isArray(products) ? products : []), [products]);
  const flashByProduct = useMemo(() => flashIndex(sales, now), [sales, now]);

  // Kategoriye göre kapsam (KPI ve çip sayıları bu kapsamdan hesaplanır)
  const scoped = useMemo(() => (category
    ? catalog.filter((p) => normalizeCategory(p.category) === category)
    : catalog), [catalog, category]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map((f) => [f.key, 0]));
    for (const p of scoped) for (const f of FILTERS) if (matchesFilter(p, f.key, flashByProduct)) c[f.key]++;
    return c;
  }, [scoped, flashByProduct]);

  const categoryCounts = useMemo(() => {
    const m = new Map();
    for (const p of catalog) {
      const k = normalizeCategory(p.category);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [catalog]);

  const rows = useMemo(() => {
    const q = fold(deferredQuery.trim());
    const terms = q ? q.split(/\s+/) : [];
    const list = scoped.filter((p) => {
      if (!matchesFilter(p, filter, flashByProduct)) return false;
      if (!terms.length) return true;
      const hay = fold(`${p.name} ${categoryName(p.category)} ${p.brand || ""}`);
      return terms.every((t) => hay.includes(t));
    });
    return sortProducts(list, sort);
  }, [scoped, filter, flashByProduct, deferredQuery, sort]);

  // Filtre değişince listeyi başa sar ve görünmeyen seçimleri koru (toplu işlem yalnızca görünenlere uygulanır)
  useEffect(() => { setVisible(PAGE); }, [deferredQuery, filter, category, sort]);

  // Aşağı kaydırdıkça daha fazla satır çiz
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !("IntersectionObserver" in window)) return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible((v) => Math.min(v + PAGE, rows.length));
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, visible]);

  const rowIds = useMemo(() => rows.map((p) => p._id), [rows]);
  const selectedRows = useMemo(() => rows.filter((p) => selected.has(p._id)), [rows, selected]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  const onSelect = useCallback((id, shift) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const last = lastClickedRef.current;
      if (shift && last && last !== id) {
        const a = rowIds.indexOf(last);
        const b = rowIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const on = !prev.has(id);
          for (const rid of rowIds.slice(Math.min(a, b), Math.max(a, b) + 1)) (on ? next.add(rid) : next.delete(rid));
          lastClickedRef.current = id;
          return next;
        }
      }
      next.has(id) ? next.delete(id) : next.add(id);
      lastClickedRef.current = id;
      return next;
    });
  }, [rowIds]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Klavye: "/" arama, Esc seçimi temizler
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector(".ui-drawer-backdrop, .ui-modal-backdrop")) return;
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && !isTypingTarget(e.target)) {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  const setBusyFlag = (id, key, on) => setBusy((b) => ({ ...b, [id]: { ...b[id], [key]: on } }));

  // ---- Tekil işlemler ----
  const onToggle = useCallback(async (id, kind) => {
    const urls = {
      stock: `/products/toggle-out-of-stock/${id}`,
      hidden: `/products/toggle-hidden/${id}`,
      featured: `/products/${id}`,
    };
    const field = { stock: "isOutOfStock", hidden: "isHidden", featured: "isFeatured" }[kind];
    const before = useProductStore.getState().products.find((p) => p._id === id);
    if (!before) return;
    setBusyFlag(id, kind, true);
    patchProducts([id], { [field]: !before[field] }); // iyimser güncelleme
    try {
      const res = await axios.patch(urls[kind]);
      const updated = res.data?.product || (kind === "featured" ? res.data : null);
      if (updated && typeof updated[field] === "boolean") patchProducts([id], { [field]: updated[field] });
      const msg = {
        stock: (v) => (v ? "Ürün tükendi olarak işaretlendi" : "Ürün stoka alındı"),
        hidden: (v) => (v ? "Ürün gizlendi" : "Ürün yayında"),
        featured: (v) => (v ? "Ürün öne çıkarıldı" : "Öne çıkanlardan kaldırıldı"),
      }[kind];
      toast.success(msg(updated ? updated[field] : !before[field]));
    } catch (error) {
      patchProducts([id], { [field]: before[field] });
      toast.error(errorMessage(error, "İşlem başarısız"));
    } finally {
      setBusyFlag(id, kind, false);
    }
  }, []);

  const savePrice = useCallback(async (id, price) => {
    setBusyFlag(id, "price", true);
    try {
      const res = await axios.put(`/products/update-price/${id}`, { price });
      const p = res.data?.product;
      patchProducts([id], p ? { price: p.price, isDiscounted: p.isDiscounted, discountedPrice: p.discountedPrice } : { price });
      setPriceEditId((cur) => (cur === id ? null : cur));
      toast.success("Fiyat güncellendi");
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Fiyat güncellenemedi"));
      return false;
    } finally {
      setBusyFlag(id, "price", false);
    }
  }, []);

  const deleteOne = useCallback(async (product) => {
    const ok = await confirm({
      title: "Ürün silinsin mi?",
      message: `"${product.name}" katalogdan kalıcı olarak silinecek. Satıştan çekmek için gizlemek yeterli olabilir.`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      type: "danger",
    });
    if (!ok) return;
    try {
      await axios.delete(`/products/${product._id}`);
      removeProducts([product._id]);
      setSelected((prev) => { const n = new Set(prev); n.delete(product._id); return n; });
      setDetailId((cur) => (cur === product._id ? null : cur));
      toast.success("Ürün silindi");
    } catch (error) {
      toast.error(errorMessage(error, "Ürün silinemedi"));
    }
  }, [confirm]);

  const openFlash = useCallback((product) => setBulk({ mode: "flash", ids: [product._id] }), []);
  const onPriceStart = useCallback((id) => setPriceEditId(id), []);
  const onPriceCancel = useCallback(() => setPriceEditId(null), []);

  // ---- Flash sale ----
  const refreshAfterFlash = async () => {
    await Promise.all([loadSales(), fetchAllProducts()]);
  };

  const createFlash = async (productIds, payload) => {
    const failures = [];
    const { ok, fail } = await runPool(productIds, async (productId) => {
      try {
        await axios.post("/flash-sales", { productId, ...payload });
      } catch (error) {
        failures.push(errorMessage(error, "Hata"));
        throw error;
      }
    });
    await refreshAfterFlash();
    if (ok) toast.success(ok === 1 ? "Flash sale oluşturuldu" : `${ok} ürün için flash sale oluşturuldu`);
    if (fail) toast.error(fail === 1 ? failures[0] : `${fail} ürün atlandı (çakışan kampanya ya da hata)`);
    return ok > 0;
  };

  const endFlash = async (sale) => {
    const ok = await confirm({
      title: flashStatus(sale) === "upcoming" ? "Planlı kampanya iptal edilsin mi?" : "Kampanya bitirilsin mi?",
      message: "Ürün kampanyadan önceki fiyatına döner. Kayıt geçmişte kalır.",
      confirmText: "Bitir",
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!ok) return;
    setSalesBusyId(sale._id);
    try {
      await axios.post(`/flash-sales/${sale._id}/end`);
      await refreshAfterFlash();
      toast.success("Kampanya bitirildi");
    } catch (error) {
      toast.error(errorMessage(error, "Kampanya bitirilemedi"));
    } finally {
      setSalesBusyId(null);
    }
  };

  const deleteFlash = async (sale) => {
    const ok = await confirm({
      title: "Kampanya kaydı silinsin mi?",
      message: "Kampanya yayındaysa önce sonlandırılır ve ürün eski fiyatına döner.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      type: "danger",
    });
    if (!ok) return;
    setSalesBusyId(sale._id);
    try {
      await axios.delete(`/flash-sales/${sale._id}`);
      await refreshAfterFlash();
      toast.success("Kampanya silindi");
    } catch (error) {
      toast.error(errorMessage(error, "Kampanya silinemedi"));
    } finally {
      setSalesBusyId(null);
    }
  };

  // ---- Toplu işlemler ----
  const bulkVisibility = async (isHidden) => {
    const ids = selectedRows.map((p) => p._id);
    try {
      await axios.post("/products/bulk-visibility", { productIds: ids, isHidden });
      patchProducts(ids, { isHidden });
      toast.success(`${ids.length} ürün ${isHidden ? "gizlendi" : "yayınlandı"}`);
    } catch (error) {
      toast.error(errorMessage(error, "İşlem başarısız"));
    }
  };

  const bulkStock = async (outOfStock) => {
    const targets = selectedRows.filter((p) => Boolean(p.isOutOfStock) !== outOfStock);
    if (!targets.length) return toast(`Seçili ürünler zaten ${outOfStock ? "stokta yok" : "stokta"}`);
    const { ok, fail } = await runPool(targets, async (p) => {
      await axios.patch(`/products/toggle-out-of-stock/${p._id}`);
      patchProducts([p._id], { isOutOfStock: outOfStock });
    });
    if (ok) toast.success(`${ok} ürün ${outOfStock ? "tükendi olarak işaretlendi" : "stoka alındı"}`);
    if (fail) toast.error(`${fail} ürün güncellenemedi`);
  };

  const bulkDelete = async () => {
    const ids = selectedRows.map((p) => p._id);
    const ok = await confirm({
      title: `${ids.length} ürün silinsin mi?`,
      message: "Seçili ürünler katalogdan kalıcı olarak silinecek. Bu işlem geri alınamaz.",
      confirmText: "Hepsini sil",
      cancelText: "Vazgeç",
      type: "danger",
    });
    if (!ok) return;
    try {
      await axios.post("/products/bulk-delete", { productIds: ids });
      removeProducts(ids);
      clearSelection();
      toast.success(`${ids.length} ürün silindi`);
    } catch (error) {
      toast.error(errorMessage(error, "Toplu silme başarısız"));
    }
  };

  const exportCsv = (list) => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(buildCsv(list), `urunler-${stamp}.csv`);
    toast.success(`${list.length} ürün dışa aktarıldı`);
  };

  const submitBulk = async (payload) => {
    const ids = bulk.ids;
    const targets = catalog.filter((p) => ids.includes(p._id));
    setBulkBusy(true);
    try {
      if (bulk.mode === "flash") {
        if (await createFlash(ids, payload)) setBulk(null);
        return;
      }
      if (bulk.mode === "price") {
        const res = await axios.post("/products/bulk-price-update", { productIds: ids, ...payload });
        await fetchAllProducts();
        toast.success(res.data?.message || "Fiyatlar güncellendi");
      }
      if (bulk.mode === "discount") {
        const { ok, fail } = await runPool(targets, async (p) => {
          if (payload.discountMode === "remove") {
            if (!p.isDiscounted) return;
            await axios.delete(`/products/${p._id}/discount`);
            patchProducts([p._id], { isDiscounted: false, discountedPrice: null });
          } else {
            const discountedPrice = roundMoney(Number(p.price) * (1 - payload.pct / 100));
            await axios.patch(`/products/${p._id}/discount`, { discountedPrice });
            patchProducts([p._id], { isDiscounted: true, discountedPrice });
          }
        });
        if (ok) toast.success(`${ok} ürün güncellendi`);
        if (fail) toast.error(`${fail} ürün güncellenemedi`);
      }
      if (bulk.mode === "category") {
        const { ok, fail } = await runPool(targets, async (p) => {
          await axios.put(`/products/${p._id}`, { name: p.name, category: payload.category, subcategory: p.subcategory || "" });
          patchProducts([p._id], { category: payload.category });
        });
        if (ok) toast.success(`${ok} ürün "${categoryName(payload.category)}" kategorisine taşındı`);
        if (fail) toast.error(`${fail} ürün taşınamadı`);
      }
      setBulk(null);
    } catch (error) {
      toast.error(errorMessage(error, "Toplu işlem başarısız"));
    } finally {
      setBulkBusy(false);
    }
  };

  // ---- Sıralama modu ----
  const canReorder = sort === "order" && filter === "all" && !query.trim();
  const startReorder = () => {
    if (!canReorder) {
      setSort("order"); setFilter("all"); setQuery("");
    }
    const base = sortProducts(category ? catalog.filter((p) => normalizeCategory(p.category) === category) : catalog, "order");
    setReorder(base);
    clearSelection();
  };
  const moveItem = (from, to) => setReorder((list) => {
    if (to < 0 || to >= list.length || from === to) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
  const saveReorder = async () => {
    const full = mergeOrder(sortProducts(catalog, "order"), reorder);
    const productIds = full.map((p) => p._id);
    setReorderSaving(true);
    try {
      await axios.post("/products/reorder", { productIds });
      const pos = new Map(productIds.map((id, i) => [id, i]));
      useProductStore.setState((s) => ({ products: (s.products || []).map((p) => ({ ...p, order: pos.get(p._id) ?? p.order })) }));
      setReorder(null);
      toast.success("Vitrin sırası kaydedildi");
    } catch (error) {
      toast.error(errorMessage(error, "Sıralama kaydedilemedi"));
    } finally {
      setReorderSaving(false);
    }
  };

  // ---- Çekmece ----
  const detail = detailId ? catalog.find((p) => p._id === detailId) : null;
  const detailBusy = detail ? (busy[detail._id] || {}) : {};
  const withDetailBusy = async (key, fn) => {
    const id = detail._id;
    setBusyFlag(id, key, true);
    try { return await fn(id); } finally { setBusyFlag(id, key, false); }
  };

  const kpis = [
    { key: "all", icon: Boxes, label: "Toplam ürün", value: counts.all, note: category ? categoryName(category) : `${categoryCounts.size} kategori` },
    { key: "published", icon: Eye, label: "Yayında", value: counts.published, tone: "ok", note: counts.all ? `%${Math.round((counts.published / counts.all) * 100)} satışta` : null },
    { key: "outOfStock", icon: PackageX, label: "Stokta yok", value: counts.outOfStock, tone: counts.outOfStock ? "danger" : undefined },
    { key: "hidden", icon: EyeOff, label: "Gizli", value: counts.hidden, tone: counts.hidden ? "warn" : undefined },
    { key: "discounted", icon: Percent, label: "İndirimli", value: counts.discounted, tone: "info" },
    { key: "flash", icon: Zap, label: "Flash sale", value: counts.flash, tone: "flash", note: "Kampanyaları yönet", manager: true },
    { key: "noImage", icon: ImageOff, label: "Görselsiz", value: counts.noImage, tone: counts.noImage ? "warn" : undefined },
  ];

  const hasFilters = Boolean(query.trim() || category || filter !== "all");
  const shown = rows.slice(0, visible);

  return (
    <div className="ui-page prd-page">
      <header className="prd-head">
        <div>
          <h1 className="prd-h1">Ürünler</h1>
          <p className="ui-muted">Fiyat, stok, görünürlük ve kampanyaları tek ekrandan yönetin.</p>
        </div>
        <div className="ui-cluster prd-head-actions">
          <button type="button" className="ui-btn" onClick={() => setManagerOpen(true)}>
            <Zap />Flash sale
            {flashByProduct.size > 0 && <span className="ui-count">{flashByProduct.size}</span>}
          </button>
          <button type="button" className="ui-btn" onClick={startReorder} disabled={Boolean(reorder)}>
            <ListOrdered />Sırala
          </button>
          <button type="button" className="ui-btn" onClick={() => exportCsv(rows)} disabled={!rows.length}>
            <Download />CSV
          </button>
          {onCreate && (
            <button type="button" className="ui-btn ui-btn--primary" onClick={onCreate}><Plus />Yeni ürün</button>
          )}
        </div>
      </header>

      <div className="prd-kpis">
        {kpis.map(({ key, manager, ...k }) => (
          <Kpi key={key} {...k} active={filter === key}
            onClick={() => { if (manager && filter === "flash") setManagerOpen(true); else setFilter(filter === key ? "all" : key); }} />
        ))}
      </div>

      {reorder ? (
        <section className="prd-panel">
          <div className="prd-reorder-head">
            <div>
              <h2 className="ui-title"><ListOrdered /> Vitrin sırası {category && `· ${categoryName(category)}`}</h2>
              <p className="ui-muted ui-text-sm">Sürükleyin ya da oklarla taşıyın. Müşteriler ürünleri bu sırayla görür.</p>
            </div>
            <div className="ui-cluster">
              <select className="ui-field ui-field--sm prd-cat-select" value={category} aria-label="Kategori"
                onChange={(e) => {
                  const c = e.target.value;
                  setCategory(c);
                  setReorder(sortProducts(c ? catalog.filter((p) => normalizeCategory(p.category) === c) : catalog, "order"));
                }}>
                <option value="">Tüm kategoriler</option>
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <button type="button" className="ui-btn" onClick={() => setReorder(null)} disabled={reorderSaving}>Vazgeç</button>
              <button type="button" className="ui-btn ui-btn--primary" onClick={saveReorder} disabled={reorderSaving}>
                {reorderSaving ? <RefreshCw className="ui-spin" /> : <Check />}Sırayı kaydet
              </button>
            </div>
          </div>
          <DragDropContext onDragEnd={({ source, destination }) => destination && moveItem(source.index, destination.index)}>
            <Droppable droppableId="prd-reorder">
              {(provided) => (
                <ol className="prd-reorder-list" ref={provided.innerRef} {...provided.droppableProps}>
                  {reorder.map((p, index) => (
                    <Draggable key={p._id} draggableId={p._id} index={index}>
                      {(drag, snapshot) => (
                        <li ref={drag.innerRef} {...drag.draggableProps} className="prd-reorder-item" data-dragging={snapshot.isDragging || undefined}>
                          <span className="prd-grip" {...drag.dragHandleProps} aria-label="Sürükle"><GripVertical /></span>
                          <span className="prd-reorder-index">{index + 1}</span>
                          <span className="prd-thumb prd-thumb--sm">{hasImage(p) ? <img src={cloudinaryImage(p.thumbnail || p.image, 120)} alt="" loading="lazy" /> : <ImageOff />}</span>
                          <span className="prd-reorder-name">
                            <strong className="ui-truncate">{p.name}</strong>
                            <small>{categoryName(p.category)} · {money(p.isDiscounted ? p.discountedPrice : p.price)}</small>
                          </span>
                          {!isPublished(p) && <span className="ui-badge">{p.isHidden ? "Gizli" : "Stokta yok"}</span>}
                          <span className="prd-reorder-moves">
                            <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => moveItem(index, 0)} disabled={index === 0} aria-label="En başa al" title="En başa al"><ArrowUpToLine /></button>
                            <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => moveItem(index, index - 1)} disabled={index === 0} aria-label="Yukarı taşı"><ChevronUp /></button>
                            <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => moveItem(index, index + 1)} disabled={index === reorder.length - 1} aria-label="Aşağı taşı"><ChevronDown /></button>
                            <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => moveItem(index, reorder.length - 1)} disabled={index === reorder.length - 1} aria-label="En sona al" title="En sona al"><ArrowDownToLine /></button>
                          </span>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ol>
              )}
            </Droppable>
          </DragDropContext>
        </section>
      ) : (
        <section className="prd-panel">
          <div className="prd-toolbar">
            <div className="ui-search prd-search">
              <Search aria-hidden="true" />
              <input ref={searchRef} className="ui-field" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara…  ( / )" aria-label="Ürün ara"
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setQuery(""); e.currentTarget.blur(); } }} />
            </div>
            <select className="ui-field prd-cat-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori">
              <option value="">Tüm kategoriler ({catalog.length})</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({categoryCounts.get(c.slug) || 0})</option>)}
            </select>
            <select className="ui-field prd-sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button type="button" className="ui-icon-btn" onClick={() => { loadProducts(); loadSales(); }} aria-label="Yenile" title="Yenile">
              <RefreshCw className={loading ? "ui-spin" : ""} />
            </button>
          </div>

          <div className="ui-chips prd-chips" role="group" aria-label="Durum filtresi">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.tone && <span className={`ui-dot ui-dot--${f.tone}`} />}
                {f.key === "flash" && <Zap className="prd-chip-zap" />}
                {f.label}
                <span className="ui-count">{counts[f.key]}</span>
              </button>
            ))}
            {hasFilters && (
              <button type="button" className="prd-clear" onClick={() => { setQuery(""); setCategory(""); setFilter("all"); }}>
                <X />Filtreleri temizle
              </button>
            )}
          </div>

          {selectedRows.length > 0 && (
            <div className="ui-bulkbar prd-bulkbar">
              <span className="ui-bulkbar-count">{selectedRows.length} seçili</span>
              <div className="prd-bulk-actions">
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => bulkVisibility(false)}><Eye />Yayınla</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => bulkVisibility(true)}><EyeOff />Gizle</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => bulkStock(false)}><Package />Stoka al</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => bulkStock(true)}><PackageX />Tükendi</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setBulk({ mode: "price", ids: selectedRows.map((p) => p._id) })}><Tag />Fiyat</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setBulk({ mode: "discount", ids: selectedRows.map((p) => p._id) })}><Percent />İndirim</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setBulk({ mode: "flash", ids: selectedRows.map((p) => p._id) })}><Zap />Flash sale</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setBulk({ mode: "category", ids: selectedRows.map((p) => p._id) })}><FolderInput />Kategori</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => exportCsv(selectedRows)}><Download />CSV</button>
                <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={bulkDelete}><Trash2 />Sil</button>
              </div>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={clearSelection}><X />Seçimi kaldır</button>
            </div>
          )}

          <div className="prd-table" role="table" aria-label="Ürün listesi" aria-rowcount={rows.length}>
            <div className="prd-row prd-row--head" role="row">
              <div className="prd-cell prd-cell--check" role="columnheader">
                <input type="checkbox" className="ui-checkbox" checked={allSelected} aria-label="Tümünü seç"
                  ref={(el) => { if (el) el.indeterminate = selectedRows.length > 0 && !allSelected; }}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rowIds))} />
              </div>
              <div className="prd-cell prd-cell--product" role="columnheader">
                Ürün <span className="ui-muted">· {rows.length}{rows.length !== catalog.length ? ` / ${catalog.length}` : ""}</span>
              </div>
              <div className="prd-cell prd-cell--price" role="columnheader">Fiyat</div>
              <div className="prd-cell prd-cell--switch" role="columnheader">Stok</div>
              <div className="prd-cell prd-cell--switch" role="columnheader">Görünür</div>
              <div className="prd-cell prd-cell--actions" role="columnheader"><span className="prd-sr">İşlemler</span></div>
            </div>

            {loading && !catalog.length ? (
              Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="prd-row prd-row--skeleton" role="row">
                  <div className="ui-skeleton prd-skel-thumb" />
                  <div className="ui-skeleton prd-skel-line" />
                </div>
              ))
            ) : rows.length === 0 ? (
              <div className="ui-empty prd-empty">
                <Layers />
                <strong>{catalog.length ? "Bu filtrelere uyan ürün yok" : "Henüz ürün eklenmemiş"}</strong>
                {hasFilters ? (
                  <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setQuery(""); setCategory(""); setFilter("all"); }}>Filtreleri temizle</button>
                ) : onCreate && (
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onCreate}><Plus />İlk ürünü ekle</button>
                )}
              </div>
            ) : (
              shown.map((p) => (
                <ProductRow key={p._id} product={p} selected={selected.has(p._id)} flash={flashByProduct.get(p._id)} now={now}
                  editingPrice={priceEditId === p._id} busy={busy[p._id]} onSelect={onSelect} onOpen={setDetailId}
                  onToggle={onToggle} onPriceStart={onPriceStart} onPriceCancel={onPriceCancel} onPriceCommit={savePrice}
                  onFlash={openFlash} onDelete={deleteOne} />
              ))
            )}
            {visible < rows.length && (
              <div ref={sentinelRef} className="prd-more">
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setVisible((v) => v + PAGE * 3)}>
                  Daha fazla göster ({rows.length - visible} ürün daha)
                </button>
              </div>
            )}
          </div>
          <p className="prd-foot-hint ui-muted ui-text-xs">
            İpucu: <kbd>/</kbd> arama · fiyata tıklayıp <kbd>Enter</kbd> ile kaydedin · <kbd>Shift</kbd> ile aralık seçin · <kbd>Esc</kbd> seçimi temizler
          </p>
        </section>
      )}

      {detail && (
        <ProductDrawer
          product={detail}
          sales={sales}
          now={now}
          busy={detailBusy}
          onClose={() => setDetailId(null)}
          onToggle={(kind) => onToggle(detail._id, kind)}
          onSavePrice={(price) => savePrice(detail._id, price)}
          onSaveInfo={(data) => withDetailBusy("info", async (id) => {
            try {
              const res = await axios.put(`/products/${id}`, { ...data, subcategory: detail.subcategory || "" });
              const p = res.data?.product;
              patchProducts([id], p ? { name: p.name, category: p.category } : data);
              toast.success("Ürün bilgileri kaydedildi");
            } catch (error) {
              toast.error(errorMessage(error, "Kaydedilemedi"));
            }
          })}
          onSaveDiscount={(discountedPrice) => withDetailBusy("discount", async (id) => {
            try {
              await axios.patch(`/products/${id}/discount`, { discountedPrice });
              patchProducts([id], { isDiscounted: true, discountedPrice });
              toast.success("İndirim uygulandı");
            } catch (error) {
              toast.error(errorMessage(error, "İndirim uygulanamadı"));
            }
          })}
          onRemoveDiscount={() => withDetailBusy("discount", async (id) => {
            try {
              await axios.delete(`/products/${id}/discount`);
              patchProducts([id], { isDiscounted: false, discountedPrice: null });
              toast.success("İndirim kaldırıldı");
            } catch (error) {
              toast.error(errorMessage(error, "İndirim kaldırılamadı"));
            }
          })}
          onImage={(file, error) => {
            if (error) return toast.error(error);
            withDetailBusy("image", (id) => new Promise((resolve) => {
              const reader = new FileReader();
              reader.onerror = () => { toast.error("Dosya okunamadı"); resolve(); };
              reader.onload = async () => {
                try {
                  const res = await axios.patch(`/products/${id}/image`, { image: reader.result });
                  // Yanıt yalnızca yeni görseli döner; eski küçük görsel yerine yenisi gösterilsin
                  patchProducts([id], { image: res.data?.image, thumbnail: null });
                  toast.success("Görsel güncellendi");
                } catch (err) {
                  toast.error(errorMessage(err, "Görsel yüklenemedi"));
                }
                resolve();
              };
              reader.readAsDataURL(file);
            }));
          }}
          onDelete={() => deleteOne(detail)}
          onCreateFlash={(payload) => withDetailBusy("flash", () => createFlash([detail._id], payload))}
          onEndFlash={endFlash}
          onDeleteFlash={deleteFlash}
        />
      )}

      {bulk && (
        <BulkModal mode={bulk.mode} busy={bulkBusy} onClose={() => setBulk(null)} onSubmit={submitBulk}
          products={catalog.filter((p) => bulk.ids.includes(p._id))} />
      )}

      {managerOpen && (
        <FlashSaleManager sales={sales} loading={salesLoading} now={now} busyId={salesBusyId}
          onClose={() => setManagerOpen(false)} onRefresh={loadSales} onEnd={endFlash} onDelete={deleteFlash}
          onOpenProduct={(id) => { setManagerOpen(false); setDetailId(id); }} />
      )}
    </div>
  );
};

export default ProductsList;
