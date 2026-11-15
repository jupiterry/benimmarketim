import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, Download, RefreshCw, X, Star, Zap, Pencil, Trash2, Eye, EyeOff, Package, PackageX, ImageOff,
  Percent, Tag, GripVertical, ArrowUpToLine, ArrowDownToLine, ChevronUp, ChevronDown, ListOrdered, Check,
  ToggleLeft, ToggleRight, Layers, FolderInput, AlertTriangle, Boxes, ZapOff, TrendingUp, TrendingDown
} from "lucide-react";
import toast from "react-hot-toast";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import axios from "../lib/axios";
import { cloudinaryImage } from "../lib/image";
import socketService from "../lib/socket";
import { useProductStore } from "../stores/useProductStore";
import { useConfirm } from "./ConfirmModal";
import { HANDOFF, takeHandoff } from "./admin/ui";
import ProductDrawer from "./products/ProductDrawer";
import { FlashBadge, FlashSaleForm, FlashSaleManager } from "./products/FlashSale";
import { confirmPriceChange, savePriceRequest, showPriceUndo } from "./products/priceSafety";
import {
  CATEGORIES, DISCOUNT_MODES, FILTERS, SORTS, STATS_FILTERS, buildCsv, categoryName, discountPct, downloadText,
  errorMessage, flashIndex, flashStatus, fold, hasImage, isPublished, matchesFilter, mergeOrder, money, normalizeCategory,
  outOfStockLabel, parsePrice, previewBulkPrice, readPrefs, roundMoney, runPool, salesTrend, sortProducts, statsOf,
  willRemoveDiscount, writePrefs
} from "./products/productUtils";
import "../styles/products.css";

const BULK_FLASH_MAX = 200; // sunucudaki sınırla aynı (flashSale.controller BULK_FLASH_MAX)
const BULK_STATE_MAX = 500; // sunucudaki sınırla aynı (product.controller BULK_STATE_MAX)
// Başka cihazdan gelen değişiklikte (productsChanged) satıra yazılabilen alanlar
const LIVE_FIELDS = ["name", "category", "price", "isDiscounted", "discountedPrice", "isOutOfStock", "isHidden", "isFeatured", "outOfStockSince"];
const pickLive = (source) => {
  const out = {};
  for (const key of LIVE_FIELDS) if (source && source[key] !== undefined) out[key] = source[key];
  return out;
};
const sameValue = (a, b) => (typeof a === "boolean" || typeof b === "boolean"
  ? Boolean(a) === Boolean(b)
  : String(a ?? "") === String(b ?? ""));
const priceFields = (p) => ({
  price: p.price, isDiscounted: Boolean(p.isDiscounted), discountedPrice: p.discountedPrice ?? null,
  ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
});
const stateFields = (p) => ({
  isOutOfStock: Boolean(p.isOutOfStock), isHidden: Boolean(p.isHidden), isFeatured: Boolean(p.isFeatured),
  outOfStockSince: p.outOfStockSince ?? null, ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
});
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

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
    const typed = parsePrice(value);
    const commit = () => {
      if (busy) return;
      if (!Number.isFinite(typed) || roundMoney(typed) <= 0) return toast.error("Geçerli bir fiyat girin (0'dan büyük)");
      if (roundMoney(typed) === roundMoney(product.price)) return onCancel();
      onCommit(roundMoney(typed));
    };
    // İndirimdeki üründe kutu liste fiyatını değiştirir; müşterinin ödediği fiyat ayrıca söylenir
    const hint = !product.isDiscounted || invalidDiscount ? null
      : Number.isFinite(typed) && typed > 0 && willRemoveDiscount(product, roundMoney(typed))
        ? `Bu fiyatla ${money(product.discountedPrice)} indirim kalkar.`
        : `Liste fiyatı. Müşteri ${money(product.discountedPrice)} ödemeye devam eder.`;
    return (
      <div className="prd-price-edit-wrap">
        <div className="prd-price-edit">
          <input autoFocus className="ui-field ui-field--sm" inputMode="decimal" value={value} aria-label="Yeni liste fiyatı"
            onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
            }} />
          <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={commit} disabled={busy} aria-label="Kaydet">
            {busy ? <RefreshCw className="ui-spin" /> : <Check />}
          </button>
        </div>
        {hint && <span className="prd-price-hint">{hint}</span>}
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

/** "30 gün: 42 adet ↑" (satış özeti yüklenmediyse hiçbir şey göstermez) */
const SalesNote = ({ stat }) => {
  if (!stat) return null;
  if (!stat.units30) return <span className="prd-sales prd-sales--none">30 gün: satış yok</span>;
  const trend = salesTrend(stat);
  return (
    <span className="prd-sales" title={`Son 30 günde ${stat.units30} adet, ${stat.orders30} sipariş · son 7 günde ${stat.units7} adet`}>
      30 gün: {stat.units30} adet
      {trend === "up" && <TrendingUp className="prd-sales-up" aria-label="Son 7 günde hızlandı" />}
      {trend === "down" && <TrendingDown className="prd-sales-down" aria-label="Son 7 günde yavaşladı" />}
    </span>
  );
};

const ProductRow = memo(({
  product, selected, flash, now, stat, editingPrice, busy, onSelect, onOpen, onToggle, onPriceStart, onPriceCancel,
  onPriceCommit, onFlash, onEndFlash, onDelete
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
            {product.isOutOfStock && <span className="prd-tag prd-tag--oos">{outOfStockLabel(product, now)}</span>}
            <SalesNote stat={stat} />
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
        {flash ? (
          // Yayındaki ya da planlı flaş indirim: süre dolmadan buradan bitirilir / iptal edilir
          <button type="button" className="ui-btn ui-btn--sm prd-flash-end" onClick={() => onEndFlash(flash.sale)}
            aria-label={flash.status === "upcoming" ? `${product.name} planlı flaş indirimini iptal et` : `${product.name} flaş indirimini bitir`}
            title={flash.status === "upcoming" ? "Planlı flaş indirimi iptal et" : "Flaş indirimi şimdi bitir"}>
            <ZapOff />{flash.status === "upcoming" ? "İptal et" : "Bitir"}
          </button>
        ) : (
          <button type="button" className="ui-icon-btn ui-icon-btn--sm prd-zap" onClick={() => onFlash(product)}
            aria-label="Flash sale başlat" title="Flash sale başlat"><Zap /></button>
        )}
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
const isFlashPriced = (p) => Boolean(p.flashSale && p.isDiscounted) &&
  Math.abs(Number(p.discountedPrice) - Number(p.flashSale.price)) < 0.01;

/** Toplu fiyat önizlemesi: seçili her ürünün eski → yeni liste ve müşteri fiyatı, en büyük değişiklik başta */
const BulkPricePreview = ({ rows }) => (
  <div className="prd-bulk-preview" role="table" aria-label="Fiyat önizlemesi">
    <div className="prd-bulk-preview-row prd-bulk-preview-head" role="row">
      <span role="columnheader">Ürün</span>
      <span role="columnheader">Liste fiyatı</span>
      <span role="columnheader">Müşteri öder</span>
    </div>
    {rows.map(({ product, plan }) => (
      <div key={product._id} className="prd-bulk-preview-row" role="row" data-invalid={plan.invalid || undefined}>
        <span role="cell" className="prd-bulk-preview-name">
          <span className="ui-truncate">{product.name}</span>
          {plan.invalid && <small className="prd-warn-text">Fiyat 0 ₺ ya da altına iniyor</small>}
          {!plan.invalid && plan.flash && <small>Flaş indirim: fiyat yeniden hesaplanır</small>}
          {!plan.invalid && plan.discountRemoved && <small className="prd-warn-text">İndirim kalkar</small>}
        </span>
        <span role="cell" className="ui-num"><s>{money(plan.oldPrice)}</s> → <strong>{money(plan.price)}</strong></span>
        <span role="cell" className="ui-num">
          {plan.invalid ? "—" : <><s>{money(plan.customerBefore)}</s> → <strong>{money(plan.customerAfter)}</strong></>}
        </span>
      </div>
    ))}
  </div>
);

const BulkModal = ({ mode, products, sales = [], busy, onClose, onSubmit }) => {
  const [priceType, setPriceType] = useState("percentage");
  const [value, setValue] = useState("");
  const [discountMode, setDiscountMode] = useState("apply");
  const [priceDiscountMode, setPriceDiscountMode] = useState("keepRatio");
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
  // Toplu fiyat: seçimdeki indirimli / flaş indirimli ürünler ve her ürünün önizlemesi
  const deferredN = useDeferredValue(n);
  const priceRuleValid = mode === "price" && Number.isFinite(deferredN) && (priceType === "percentage" ? deferredN !== 0 : deferredN > 0);
  const flashCount = useMemo(() => (mode === "price" ? products.filter(isFlashPriced).length : 0), [mode, products]);
  const discountedCount = useMemo(
    () => (mode === "price" ? products.filter((p) => p.isDiscounted && !isFlashPriced(p)).length : 0), [mode, products]);
  const priceRows = useMemo(() => {
    if (!priceRuleValid) return [];
    const rule = { priceType, priceValue: roundMoney(deferredN), discountMode: priceDiscountMode };
    const size = (plan) => Math.max(Math.abs(plan.price - plan.oldPrice), Math.abs(plan.customerAfter - plan.customerBefore));
    return products
      .map((product) => ({ product, plan: previewBulkPrice(product, rule, isFlashPriced(product) ? product.flashSale : null) }))
      .sort((a, b) => Number(b.plan.invalid) - Number(a.plan.invalid) || size(b.plan) - size(a.plan));
  }, [priceRuleValid, products, priceType, deferredN, priceDiscountMode]);
  const invalidCount = priceRows.filter((r) => r.plan.invalid).length;
  const previewStale = mode === "price" && Number.isFinite(n) && roundMoney(n) !== roundMoney(deferredN);
  if (mode === "discount" && discountMode === "apply" && Number.isFinite(n) && example) {
    preview = <>Örnek: {example.name} <s>{money(example.price)}</s> → <strong>{money(example.price * (1 - n / 100))}</strong></>;
  }
  const valid = mode === "category" || (mode === "discount" && discountMode === "remove") ||
    (mode === "price" && Number.isFinite(n) && (priceType === "percentage" ? n > -100 && n !== 0 : n > 0) &&
      priceRows.length > 0 && invalidCount === 0 && !previewStale) ||
    (mode === "discount" && Number.isFinite(n) && n >= 1 && n <= 99);

  const submit = (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    if (mode === "price") onSubmit({ priceType, priceValue: roundMoney(n), discountMode: priceDiscountMode });
    if (mode === "discount") onSubmit({ discountMode, pct: n });
    if (mode === "category") onSubmit({ category });
  };

  return (
    <div className="ui-modal-backdrop prd-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="ui-modal prd-modal" data-mode={mode} role="dialog" aria-modal="true" aria-label={titles[mode]}>
        <div className="ui-modal-header">
          <div>
            <h2 className="ui-title">{titles[mode]}</h2>
            <p className="ui-muted ui-text-sm">{products.length} ürün seçili</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} disabled={busy} aria-label="Kapat"><X /></button>
        </div>
        {mode === "flash" ? (
          <div className="ui-modal-body">
            <FlashSaleForm products={products} busy={busy} onCancel={onClose} bulk={products.length > 1} sales={sales}
              submitLabel={products.length > 1 ? "Ürünlere uygula" : "Flash sale başlat"}
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
                  {(discountedCount > 0 || flashCount > 0) && (
                    <p className="prd-bulk-note">
                      {products.length} ürünün{" "}
                      {[discountedCount > 0 && `${discountedCount} tanesi indirimde`, flashCount > 0 && `${flashCount} tanesi flaş indirimde`].filter(Boolean).join(", ")}.
                    </p>
                  )}
                  {(discountedCount > 0 || flashCount > 0) && (
                    <fieldset className="prd-bulk-modes">
                      <legend className="ui-label">İndirimdeki ürünlerde</legend>
                      {DISCOUNT_MODES.map((m) => (
                        <label key={m.key} className="prd-bulk-mode" data-on={priceDiscountMode === m.key || undefined}>
                          <input type="radio" name="prd-discount-mode" value={m.key} checked={priceDiscountMode === m.key}
                            onChange={() => setPriceDiscountMode(m.key)} />
                          <span><strong>{m.label}</strong><small>{m.hint}</small></span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {flashCount > 0 && (
                    <p className="ui-hint">Flaş indirimdeki ürünlerde flaş fiyatı, yeni liste fiyatından aynı yüzdeyle yeniden hesaplanır. Seçiminiz, kampanya bitince dönülecek indirime uygulanır.</p>
                  )}
                  {invalidCount > 0 && (
                    <p className="prd-form-error" role="alert">
                      {invalidCount} ürünün fiyatı 0 ₺ ya da altına iniyor. Değeri küçültün ya da bu ürünleri seçimden çıkarın.
                    </p>
                  )}
                  {priceRows.length > 0
                    ? <BulkPricePreview rows={priceRows} />
                    : (
                      <p className="ui-hint">
                        {Number.isFinite(n) && n <= 0 && priceType !== "percentage"
                          ? "0'dan büyük bir tutar yazın. Fiyatı düşürmek için “− ₺” seçin."
                          : "Bir değer yazın; her ürünün yeni fiyatını burada görürsünüz."}
                      </p>
                    )}
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
  // Kampanya durumları sunucu saatine göre: bilgisayarın saati yanlışsa panel "Yayında" derken
  // sunucu kampanyayı henüz başlatmamış olabiliyordu
  const [clockSkew, setClockSkew] = useState(0);
  const now = useNow(30000) + clockSkew;

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
  const [stats, setStats] = useState(null); // { "<ürünId>": { units7, units30, orders30 } }; yüklenemediyse null
  const [statsFailed, setStatsFailed] = useState(false);
  const [bulkStateBusy, setBulkStateBusy] = useState(false);
  const [remoteNote, setRemoteNote] = useState("");
  const savingPriceRef = useRef(new Set());
  const ownRef = useRef({ active: 0, until: 0 }); // bu ekranın kendi işlemi sürüyor mu (canlı bildirim notu için)
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
      const serverTime = Date.parse(res.data.serverTime);
      if (Number.isFinite(serverTime)) setClockSkew(serverTime - Date.now());
    } catch (error) {
      toast.error(errorMessage(error, "Flash sale'ler yüklenemedi"));
    } finally {
      setSalesLoading(false);
    }
  }, []);

  // Satış özeti: yüklenemezse liste rakamsız çalışır (hata bildirimi gösterilmez)
  const loadStats = useCallback(async (refresh = false) => {
    try {
      const res = await axios.get("/products/sales-stats", refresh ? { params: { refresh: 1 } } : undefined);
      const map = res.data?.stats;
      if (!map || typeof map !== "object") throw new Error("stats");
      setStats(map);
      setStatsFailed(false);
    } catch {
      setStatsFailed(true);
    }
  }, []);

  useEffect(() => { loadProducts(); loadSales(); loadStats(); }, [loadProducts, loadSales, loadStats]);

  // Bu ekranın kendi işlemi: sürerken gelen canlı bildirim "başka cihazdan" sayılmaz
  const asOwn = useCallback(async (fn) => {
    ownRef.current.active += 1;
    try {
      return await fn();
    } finally {
      ownRef.current.active -= 1;
      ownRef.current.until = Date.now() + 2000;
    }
  }, []);

  // Başka cihazdan (ya da başka yöneticiden) gelen ürün değişiklikleri: satırlar yerinde güncellenir
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return undefined;
    let reloadTimer = null;
    let noteTimer = null;
    const note = (text) => {
      if (ownRef.current.active > 0 || Date.now() < ownRef.current.until) return;
      setRemoteNote(text);
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => setRemoteNote(""), 8000);
    };
    const onChanged = (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (payload.reload) {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => { fetchAllProducts(); loadSales(); }, 800);
        note("Ürünler başka bir cihazdan değiştirildi; liste yenilendi.");
        return;
      }
      const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
      if (!ids.length) return;
      const current = new Map((useProductStore.getState().products || []).map((p) => [p._id, p]));
      if (payload.changes?.deleted) {
        const present = ids.filter((id) => current.has(id));
        if (!present.length) return;
        removeProducts(present);
        setSelected((prev) => {
          const next = new Set(prev);
          present.forEach((id) => next.delete(id));
          return next;
        });
        note(`${present.length} ürün başka bir cihazdan silindi.`);
        return;
      }
      const common = pickLive(payload.changes);
      const perProduct = new Map((Array.isArray(payload.products) ? payload.products : []).map((p) => [String(p._id), pickLive(p)]));
      let changed = 0;
      const patches = new Map();
      for (const id of ids) {
        const product = current.get(id);
        if (!product) continue;
        const fields = { ...common, ...(perProduct.get(id) || {}) };
        if (!Object.keys(fields).length) continue;
        if (Object.entries(fields).some(([key, value]) => !sameValue(product[key], value))) changed += 1;
        patches.set(id, fields);
      }
      if (!changed) return;
      patchProducts([...patches.keys()], (p) => patches.get(p._id));
      note(changed === 1 ? "1 ürün başka bir cihazdan güncellendi." : `${changed} ürün başka bir cihazdan güncellendi.`);
    };
    socket.on("productsChanged", onChanged);
    return () => {
      clearTimeout(reloadTimer);
      clearTimeout(noteTimer);
      socket.off("productsChanged", onChanged);
    };
  }, [fetchAllProducts, loadSales]);
  // Komut paletinden "ürünü aç" ile gelindiyse çekmeceyi aç
  useEffect(() => {
    const id = takeHandoff(HANDOFF.product);
    if (id) setDetailId(id);
  }, []);

  const catalog = useMemo(() => (Array.isArray(products) ? products : []), [products]);
  const flashByProduct = useMemo(() => flashIndex(sales, now), [sales, now]);

  // Kategoriye göre kapsam (KPI ve çip sayıları bu kapsamdan hesaplanır)
  const scoped = useMemo(() => (category
    ? catalog.filter((p) => normalizeCategory(p.category) === category)
    : catalog), [catalog, category]);

  // Satış özeti yoksa satışa dayalı filtre ve sıralama kullanılmaz (kayıtlı tercih öyle olsa bile)
  const activeFilter = !stats && STATS_FILTERS.has(filter) ? "all" : filter;
  const activeSort = !stats && sort === "sold30" ? "order" : sort;
  const filterCtx = useMemo(() => ({ stats, now }), [stats, now]);
  const filterOptions = useMemo(() => FILTERS.filter((f) => !f.needsStats || stats), [stats]);
  const sortOptions = useMemo(() => SORTS.filter((s) => !s.needsStats || stats), [stats]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map((f) => [f.key, 0]));
    for (const p of scoped) for (const f of FILTERS) if (matchesFilter(p, f.key, flashByProduct, filterCtx)) c[f.key]++;
    return c;
  }, [scoped, flashByProduct, filterCtx]);

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
      if (!matchesFilter(p, activeFilter, flashByProduct, filterCtx)) return false;
      if (!terms.length) return true;
      const hay = fold(`${p.name} ${categoryName(p.category)} ${p.brand || ""}`);
      return terms.every((t) => hay.includes(t));
    });
    // "Çok satan ama tükendi" vitrin sırasıyla değil, en çok satandan başlayarak listelenir
    return sortProducts(list, activeFilter === "lostSales" && activeSort === "order" ? "sold30" : activeSort, filterCtx);
  }, [scoped, activeFilter, flashByProduct, deferredQuery, activeSort, filterCtx]);

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
  // Durum "şuna ayarla" ucuyla yazılır (PATCH /products/:id/state): iki cihaz aynı anda bassa da ürün
  // geri dönmez; ekrana sunucunun döndürdüğü durum yazılır.
  const onToggle = useCallback((id, kind) => asOwn(async () => {
    const field = { stock: "isOutOfStock", hidden: "isHidden", featured: "isFeatured" }[kind];
    const before = useProductStore.getState().products.find((p) => p._id === id);
    if (!before || !field) return;
    const target = !before[field];
    setBusyFlag(id, kind, true);
    patchProducts([id], { [field]: target }); // iyimser güncelleme
    try {
      const res = await axios.patch(`/products/${id}/state`, { [field]: target });
      const updated = res.data?.product;
      if (updated) patchProducts([id], stateFields(updated));
      const value = updated ? Boolean(updated[field]) : target;
      const msg = {
        stock: (v) => (v ? "Ürün tükendi olarak işaretlendi" : "Ürün stoka alındı"),
        hidden: (v) => (v ? "Ürün gizlendi" : "Ürün yayında"),
        featured: (v) => (v ? "Ürün öne çıkarıldı" : "Öne çıkanlardan kaldırıldı"),
      }[kind];
      toast.success(msg(value));
    } catch (error) {
      patchProducts([id], { [field]: before[field] });
      toast.error(errorMessage(error, "İşlem başarısız"));
    } finally {
      setBusyFlag(id, kind, false);
    }
  }), [asOwn]);

  // Tekil fiyat kaydı (satır içi ve çekmece): büyük sapmada / indirim kalkacaksa önce sorar, sonra "Geri al" sunar
  const savePrice = useCallback((id, price) => asOwn(async () => {
    if (savingPriceRef.current.has(id)) return false;
    const before = useProductStore.getState().products.find((p) => p._id === id);
    if (!before) return false;
    savingPriceRef.current.add(id);
    try {
      if (!(await confirmPriceChange(confirm, before, price))) return false;
      setBusyFlag(id, "price", true);
      const data = await savePriceRequest(id, price);
      const after = data.product || { price, isDiscounted: before.isDiscounted, discountedPrice: before.discountedPrice };
      patchProducts([id], priceFields(after));
      setPriceEditId((cur) => (cur === id ? null : cur));
      showPriceUndo({ before, after, wrap: asOwn, onRestored: (restored) => patchProducts([id], priceFields(restored)) });
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Fiyat güncellenemedi"));
      return false;
    } finally {
      setBusyFlag(id, "price", false);
      savingPriceRef.current.delete(id);
    }
  }), [asOwn, confirm]);

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
      await asOwn(() => axios.delete(`/products/${product._id}`));
      removeProducts([product._id]);
      setSelected((prev) => { const n = new Set(prev); n.delete(product._id); return n; });
      setDetailId((cur) => (cur === product._id ? null : cur));
      toast.success("Ürün silindi");
    } catch (error) {
      toast.error(errorMessage(error, "Ürün silinemedi"));
    }
  }, [asOwn, confirm]);

  const openFlash = useCallback((product) => setBulk({ mode: "flash", ids: [product._id] }), []);
  const onPriceStart = useCallback((id) => setPriceEditId(id), []);
  const onPriceCancel = useCallback(() => setPriceEditId(null), []);

  // ---- Flash sale ----
  const refreshAfterFlash = async () => {
    await Promise.all([loadSales(), fetchAllProducts()]);
  };

  const createFlash = async (productIds, payload) => {
    const failures = [];
    const warnings = [];
    const { ok, fail } = await runPool(productIds, async (productId) => {
      try {
        const res = await axios.post("/flash-sales", { productId, ...payload });
        if (res.data?.warning) warnings.push(res.data.warning);
      } catch (error) {
        failures.push(errorMessage(error, "Hata"));
        throw error;
      }
    });
    await refreshAfterFlash();
    if (ok) toast.success(ok === 1 ? "Flash sale oluşturuldu" : `${ok} ürün için flash sale oluşturuldu`);
    if (fail) toast.error(fail === 1 ? failures[0] : `${fail} ürün atlandı (çakışan kampanya ya da hata)`);
    if (warnings.length) toast(warnings[0], { duration: 6000 });
    return ok > 0;
  };

  // Birden çok ürün: tek istekte ortak oran ve tarih (POST /flash-sales/bulk); sonuç ürün ürün döner
  const createBulkFlash = async (productIds, payload) => {
    try {
      const { data } = await axios.post("/flash-sales/bulk", { productIds, ...payload });
      await refreshAfterFlash();
      const created = data.created?.length || 0;
      const skipped = data.skipped || [];
      const failed = data.failed || [];
      if (created) {
        toast.success(`${created} ürün için flaş indirim oluşturuldu${data.replaced ? ` (${data.replaced} eski kampanya iptal edildi)` : ""}`);
      }
      const misses = [...skipped, ...failed];
      if (misses.length) {
        const names = misses.slice(0, 3).map((item) => item.name || "Silinmiş ürün").join(", ");
        toast.error(`${misses.length} ürün atlandı: ${names}${misses.length > 3 ? "…" : ""}${skipped.some((item) => item.existingSale) ? " (aynı tarihlerde flaş indirimi var)" : ""}`, { duration: 7000 });
      }
      if (data.warning) toast(data.warning, { duration: 6000 });
      return created > 0;
    } catch (error) {
      toast.error(errorMessage(error, "Flaş indirim oluşturulamadı"));
      return false;
    }
  };

  // Yayındaki kampanyayı bitirir / planlı kampanyayı iptal eder; ürün eski fiyatına hemen döner
  const endFlash = async (sale, { silent = false } = {}) => {
    const upcoming = flashStatus(sale, now) === "upcoming";
    const product = typeof sale.product === "object" ? sale.product : catalog.find((p) => p._id === sale.product);
    const restorePrice = sale.previousIsDiscounted && Number(sale.previousDiscountedPrice) < Number(product?.price)
      ? Number(sale.previousDiscountedPrice)
      : Number(product?.price);
    const name = product?.name ? `“${product.name}”` : "Ürün";
    const ok = silent || await confirm({
      title: upcoming ? "Planlı kampanya iptal edilsin mi?" : "Kampanya şimdi bitirilsin mi?",
      message: upcoming
        ? `%${sale.discountPercentage} kampanya başlamayacak; ürünün fiyatı değişmez. Kayıt geçmişte “İptal edildi” olarak kalır.`
        : `${name} hemen${Number.isFinite(restorePrice) ? ` ${money(restorePrice)}` : " eski"} fiyatına döner; uygulama ve sitede de güncellenir. Kayıt geçmişte “İptal edildi” olarak kalır.`,
      confirmText: upcoming ? "İptal et" : "Bitir",
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!ok) return;
    setSalesBusyId(sale._id);
    try {
      const res = await axios.post(`/flash-sales/${sale._id}/end`);
      if (silent) return true;
      await refreshAfterFlash();
      toast.success(res.data?.message || (upcoming ? "Kampanya iptal edildi" : "Kampanya bitirildi"));
      return true;
    } catch (error) {
      if (!silent) toast.error(errorMessage(error, upcoming ? "Kampanya iptal edilemedi" : "Kampanya bitirilemedi"));
      return false;
    } finally {
      setSalesBusyId(null);
    }
  };

  // Seçili ürünlerin yayındaki/planlı flaş indirimlerini tek onayla bitirir
  const bulkEndFlash = async () => {
    const targets = selectedRows.map((p) => flashByProduct.get(p._id)).filter(Boolean);
    if (!targets.length) return;
    const ok = await confirm({
      title: `${targets.length} flaş indirim bitirilsin mi?`,
      message: "Yayındaki indirimler hemen biter ve ürünler eski fiyatlarına döner; planlı olanlar iptal edilir. Uygulama ve sitede de güncellenir.",
      confirmText: "Bitir",
      cancelText: "Vazgeç",
      type: "warning",
    });
    if (!ok) return;
    let done = 0;
    for (const entry of targets) if (await endFlash(entry.sale, { silent: true })) done += 1;
    await refreshAfterFlash();
    if (done === targets.length) toast.success(`${done} flaş indirim bitirildi`);
    else toast.error(`${done}/${targets.length} flaş indirim bitirildi; kalanlar için tekrar deneyin`);
  };
  const selectedFlashCount = useMemo(() => selectedRows.filter((p) => flashByProduct.has(p._id)).length, [selectedRows, flashByProduct]);

  const deleteFlash = async (sale) => {
    const ok = await confirm({
      title: "Kampanya kaydı silinsin mi?",
      message: flashStatus(sale, now) === "ended"
        ? "Kayıt geçmişten kalıcı olarak silinir. Ürünün fiyatı değişmez."
        : "Kampanya yayındaysa önce sonlandırılır ve ürün eski fiyatına döner.",
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
  // Toplu stok / görünürlük: tek istekte "şuna ayarla" (POST /products/bulk-state); ekrana sunucunun yanıtı yazılır
  const bulkState = (changes, messages) => asOwn(async () => {
    if (bulkStateBusy) return;
    const ids = selectedRows.map((p) => p._id);
    if (!ids.length) return;
    setBulkStateBusy(true);
    let updated = 0;
    let missing = 0;
    let failed = 0;
    let lastError = null;
    for (const part of chunk(ids, BULK_STATE_MAX)) {
      try {
        const res = await axios.post("/products/bulk-state", { productIds: part, ...changes });
        const byId = new Map((res.data?.products || []).map((p) => [String(p._id), stateFields(p)]));
        if (byId.size) patchProducts([...byId.keys()], (p) => byId.get(p._id));
        const gone = res.data?.missing || [];
        if (gone.length) {
          removeProducts(gone);
          setSelected((prev) => { const next = new Set(prev); gone.forEach((id) => next.delete(id)); return next; });
        }
        updated += Number(res.data?.updatedCount) || 0;
        missing += gone.length;
      } catch (error) {
        failed += part.length;
        lastError = error;
      }
    }
    setBulkStateBusy(false);
    if (failed) toast.error(errorMessage(lastError, `${failed} ürün güncellenemedi`));
    else if (updated) toast.success(messages.done(updated));
    else toast(messages.none);
    if (missing) toast(`${missing} ürün başka bir cihazdan silinmiş; listeden çıkarıldı.`);
  });
  const bulkVisibility = (isHidden) => bulkState({ isHidden }, {
    done: (n) => `${n} ürün ${isHidden ? "gizlendi" : "yayınlandı"}`,
    none: `Seçili ürünler zaten ${isHidden ? "gizli" : "yayında"}`,
  });
  const bulkStock = (outOfStock) => bulkState({ isOutOfStock: outOfStock }, {
    done: (n) => `${n} ürün ${outOfStock ? "tükendi olarak işaretlendi" : "stoka alındı"}`,
    none: `Seçili ürünler zaten ${outOfStock ? "stokta yok" : "stokta"}`,
  });

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
      await asOwn(() => axios.post("/products/bulk-delete", { productIds: ids }));
      removeProducts(ids);
      clearSelection();
      toast.success(`${ids.length} ürün silindi`);
    } catch (error) {
      toast.error(errorMessage(error, "Toplu silme başarısız"));
    }
  };

  const exportCsv = (list) => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(buildCsv(list, stats), `urunler-${stamp}.csv`);
    toast.success(`${list.length} ürün dışa aktarıldı`);
  };

  const submitBulk = (payload) => asOwn(async () => {
    if (bulkBusy) return;
    const ids = bulk.ids;
    const targets = catalog.filter((p) => ids.includes(p._id));
    setBulkBusy(true);
    try {
      if (bulk.mode === "flash") {
        const done = ids.length > 1 ? await createBulkFlash(ids, payload) : await createFlash(ids, payload);
        if (done) {
          setBulk(null);
          clearSelection();
        }
        return;
      }
      if (bulk.mode === "price") {
        const res = await axios.post("/products/bulk-price-update", { productIds: ids, ...payload });
        // Flaş indirimdeki ürünlerde kampanya fiyatı da değişir: kampanya listesi de yenilenir
        await Promise.all([fetchAllProducts(), loadSales()]);
        const extra = [
          res.data?.discountsRemoved ? `${res.data.discountsRemoved} indirim kalktı` : "",
          res.data?.flashUpdated ? `${res.data.flashUpdated} flaş fiyatı yeniden hesaplandı` : "",
        ].filter(Boolean).join(", ");
        toast.success(`${res.data?.message || "Fiyatlar güncellendi"}${extra ? ` (${extra})` : ""}`, { duration: extra ? 6000 : undefined });
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
      toast.error(errorMessage(error, "Toplu işlem başarısız"), { duration: 7000 });
    } finally {
      setBulkBusy(false);
    }
  });

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
  const withDetailBusy = (key, fn) => asOwn(async () => {
    const id = detail._id;
    setBusyFlag(id, key, true);
    try { return await fn(id); } finally { setBusyFlag(id, key, false); }
  });

  const kpis = [
    { key: "all", icon: Boxes, label: "Toplam ürün", value: counts.all, note: category ? categoryName(category) : `${categoryCounts.size} kategori` },
    { key: "published", icon: Eye, label: "Yayında", value: counts.published, tone: "ok", note: counts.all ? `%${Math.round((counts.published / counts.all) * 100)} satışta` : null },
    { key: "outOfStock", icon: PackageX, label: "Stokta yok", value: counts.outOfStock, tone: counts.outOfStock ? "danger" : undefined },
    { key: "hidden", icon: EyeOff, label: "Gizli", value: counts.hidden, tone: counts.hidden ? "warn" : undefined },
    { key: "discounted", icon: Percent, label: "İndirimli", value: counts.discounted, tone: "info" },
    { key: "flash", icon: Zap, label: "Flash sale", value: counts.flash, tone: "flash", note: "Kampanyaları yönet", manager: true },
    { key: "noImage", icon: ImageOff, label: "Görselsiz", value: counts.noImage, tone: counts.noImage ? "warn" : undefined },
  ];

  const hasFilters = Boolean(query.trim() || category || activeFilter !== "all");
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
          <Kpi key={key} {...k} active={activeFilter === key}
            onClick={() => { if (manager && activeFilter === "flash") setManagerOpen(true); else setFilter(activeFilter === key ? "all" : key); }} />
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
            <select className="ui-field prd-sort-select" value={activeSort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">
              {sortOptions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button type="button" className="ui-icon-btn" onClick={() => { loadProducts(); loadSales(); loadStats(true); }} aria-label="Yenile" title="Yenile">
              <RefreshCw className={loading ? "ui-spin" : ""} />
            </button>
          </div>

          <div className="ui-chips prd-chips" role="group" aria-label="Durum filtresi">
            {filterOptions.map((f) => (
              <button key={f.key} type="button" aria-pressed={activeFilter === f.key} onClick={() => setFilter(f.key)}>
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

          {remoteNote && (
            <p className="prd-remote-note" role="status">
              <RefreshCw aria-hidden="true" />{remoteNote}
              <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => setRemoteNote("")} aria-label="Notu kapat"><X /></button>
            </p>
          )}

          {hasFilters && selectedRows.length === 0 && rows.length > 0 && (
            <div className="prd-scope-bar">
              <span className="ui-text-sm">Listelenen <strong className="ui-num">{rows.length}</strong> ürün</span>
              <button type="button" className="ui-btn ui-btn--sm" disabled={rows.length > BULK_FLASH_MAX}
                onClick={() => setBulk({ mode: "flash", ids: rowIds })}
                title={rows.length > BULK_FLASH_MAX ? `Tek seferde en fazla ${BULK_FLASH_MAX} ürün; aramayı daraltın` : "Listelenen tüm ürünlere ortak oran ve tarihle flaş indirim"}>
                <Zap />Hepsine flaş indirim
              </button>
              {rows.length > BULK_FLASH_MAX && <span className="ui-hint">En fazla {BULK_FLASH_MAX} ürün; aramayı daraltın.</span>}
            </div>
          )}

          {selectedRows.length > 0 && (
            <div className="ui-bulkbar prd-bulkbar">
              <span className="ui-bulkbar-count">{selectedRows.length} seçili</span>
              <div className="prd-bulk-actions">
                <button type="button" className="ui-btn ui-btn--sm" disabled={bulkStateBusy} onClick={() => bulkVisibility(false)}><Eye />Yayınla</button>
                <button type="button" className="ui-btn ui-btn--sm" disabled={bulkStateBusy} onClick={() => bulkVisibility(true)}><EyeOff />Gizle</button>
                <button type="button" className="ui-btn ui-btn--sm" disabled={bulkStateBusy} onClick={() => bulkStock(false)}><Package />Stoka al</button>
                <button type="button" className="ui-btn ui-btn--sm" disabled={bulkStateBusy} onClick={() => bulkStock(true)}><PackageX />Tükendi</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setBulk({ mode: "price", ids: selectedRows.map((p) => p._id) })}><Tag />Fiyat</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setBulk({ mode: "discount", ids: selectedRows.map((p) => p._id) })}><Percent />İndirim</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setBulk({ mode: "flash", ids: selectedRows.map((p) => p._id) })}><Zap />Flash sale</button>
                {selectedFlashCount > 0 && (
                  <button type="button" className="ui-btn ui-btn--sm" onClick={bulkEndFlash}><ZapOff />Flaş indirimi bitir ({selectedFlashCount})</button>
                )}
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
                  stat={statsOf(stats, p._id)}
                  editingPrice={priceEditId === p._id} busy={busy[p._id]} onSelect={onSelect} onOpen={setDetailId}
                  onToggle={onToggle} onPriceStart={onPriceStart} onPriceCancel={onPriceCancel} onPriceCommit={savePrice}
                  onFlash={openFlash} onEndFlash={endFlash} onDelete={deleteOne} />
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
            {stats && " · satış adetleri iptal edilmeyen siparişlerden, son 30 gün"}
          </p>
          {statsFailed && !stats && (
            <p className="prd-foot-hint ui-muted ui-text-xs">
              Satış bilgileri alınamadı; liste rakamsız gösteriliyor.{" "}
              <button type="button" className="prd-link" onClick={() => loadStats()}>Tekrar dene</button>
            </p>
          )}
        </section>
      )}

      {detail && (
        <ProductDrawer
          product={detail}
          sales={sales}
          now={now}
          stat={statsOf(stats, detail._id)}
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
        <BulkModal mode={bulk.mode} busy={bulkBusy} onClose={() => setBulk(null)} onSubmit={submitBulk} sales={sales}
          products={catalog.filter((p) => bulk.ids.includes(p._id))} />
      )}

      {managerOpen && (
        <FlashSaleManager sales={sales} loading={salesLoading} now={now} clockSkew={clockSkew} busyId={salesBusyId}
          onClose={() => setManagerOpen(false)} onRefresh={loadSales} onEnd={endFlash} onDelete={deleteFlash}
          onOpenProduct={(id) => { setManagerOpen(false); setDetailId(id); }} />
      )}
    </div>
  );
};

export default ProductsList;
