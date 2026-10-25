// Haftalık fırsatlar: müşteri uygulamasındaki "Haftalık fırsatlar" rafını yönetir.
// Uç noktalar: GET /weekly-products/all · POST /weekly-products · PUT /weekly-products/:id
// · PATCH /weekly-products/:id/toggle · DELETE /weekly-products/:id · GET /products?fields=card
// Socket: "weeklyProductsUpdated" gelince liste sessizce yenilenir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  ArrowRight,
  Battery,
  CalendarClock,
  Clock,
  GripVertical,
  Hourglass,
  Infinity as InfinityIcon,
  Package,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Signal,
  Smartphone,
  Sparkles,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import socketService from "../lib/socket";
import { cloudinaryImage } from "../lib/image";
import { useConfirm } from "./ConfirmModal";
import {
  Drawer,
  EmptyState,
  KpiCard,
  KpiGrid,
  PageHeader,
  ShortcutHelp,
  Skeleton,
  SkeletonCards,
  SkeletonRows,
  fold,
  formatDateTime,
  money,
  undoable,
  useListShortcuts,
  useNow,
  usePref,
} from "./admin/ui";
import "../styles/weekly.css";

// ── Yardımcılar ───────────────────────────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const pad2 = (n) => String(n).padStart(2, "0");

/** Tarihi <input type="datetime-local"> değerine çevirir (yerel saat) */
const toLocalInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
/** Bu haftanın son günü (pazar) 23:59 */
const endOfWeek = (now) => {
  const d = new Date(now);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? 0 : 7 - day));
  d.setHours(23, 59, 0, 0);
  return d;
};
const daysFromNow = (days, now) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d;
};

const pctOf = (price, weekly) => (price > 0 ? Math.max(0, Math.round(((price - weekly) / price) * 100)) : 0);
const priceFromPct = (price, pct) => Math.round(price * (1 - pct / 100) * 100) / 100;
const num = (v) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** live | paused | expired */
// Süresi dolan fırsatı sunucu dakikada bir kapatır (isActive:false); bitiş tarihi önce bakılır ki
// "Durduruldu" değil "Süresi doldu" görünsün.
const statusOf = (wp, now) => {
  if (wp.endDate && new Date(wp.endDate).getTime() <= now) return "expired";
  if (!wp.isActive) return "paused";
  return "live";
};

/** Kalan süre etiketi: { label, sub, tone, icon } */
const remaining = (endDate, now) => {
  if (!endDate) return { label: "Süresiz", sub: "Bitiş tarihi yok", tone: "", icon: InfinityIcon };
  const end = new Date(endDate).getTime();
  const diff = end - now;
  if (diff <= 0) return { label: "Süresi doldu", sub: formatDateTime(endDate), tone: "danger", icon: Hourglass };
  if (diff < HOUR) return { label: `${Math.max(1, Math.round(diff / 60000))} dk kaldı`, sub: formatDateTime(endDate), tone: "warn", icon: AlertTriangle };
  if (diff < DAY) return { label: `${Math.round(diff / HOUR)} sa kaldı`, sub: formatDateTime(endDate), tone: "warn", icon: AlertTriangle };
  const days = Math.max(1, Math.round(diff / DAY));
  return { label: `${days} gün kaldı`, sub: formatDateTime(endDate), tone: "", icon: Clock };
};

const productImage = (product, width = 120) => cloudinaryImage(product?.thumbnail || product?.image || "", width);

// Ürün kataloğu: çekmece ilk açıldığında bir kez çekilir, 5 dk bellekte kalır
const CATALOG_TTL = 5 * 60 * 1000;
let catalogCache = null;
const loadCatalog = async (force = false) => {
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL) return catalogCache.products;
  const response = await axios.get("/products", { params: { fields: "card", limit: 5000 } });
  const products = (response.data?.products || []).filter((p) => !p.isHidden);
  catalogCache = { at: Date.now(), products };
  return products;
};

const FILTERS = [
  { id: "all", label: "Tümü" },
  { id: "live", label: "Yayında", dot: "ok" },
  { id: "ending", label: "Bitmek üzere", dot: "warn" },
  { id: "paused", label: "Pasif" },
  { id: "expired", label: "Süresi dolmuş", dot: "danger" },
];
const EMPTY_TEXT = {
  live: "Yayında fırsat yok. Pasif bir fırsatı açın ya da yeni ekleyin.",
  ending: "7 gün içinde bitecek fırsat yok.",
  paused: "Pasif fırsat yok.",
  expired: "Süresi dolmuş fırsat yok.",
};

// ── Telefon rafındaki tek ürün kartı ───────────────────────────────────────
const PhoneCard = ({ product, price, pct, ghost }) => {
  const img = productImage(product, 160);
  return (
    <div className="wky-pcard" data-ghost={ghost || undefined}>
      <div className="wky-pcard-img">
        {img ? <img src={img} alt="" loading="lazy" /> : <Package aria-hidden="true" />}
        {pct > 0 && <span className="wky-pcard-pct">%{pct}</span>}
      </div>
      <span className="wky-pcard-name">{product?.name || "Ürün"}</span>
      <span className="wky-pcard-prices">
        <b>{money(price)}</b>
        {product?.price > price && <s>{money(product.price)}</s>}
      </span>
      <span className="wky-pcard-add">Sepete ekle</span>
    </div>
  );
};

// ── Telefon çerçevesi: müşteri uygulamasındaki raf ────────────────────────
const PhonePreview = ({ live, ghost, now }) => {
  const time = new Date(now).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const count = live.length + (ghost ? 1 : 0);
  return (
    <div className="wky-phone" aria-label="Müşteri uygulaması önizlemesi">
      <div className="wky-phone-screen">
        <span className="wky-phone-notch" aria-hidden="true" />
        <div className="wky-phone-status" aria-hidden="true">
          <span>{time}</span>
          <span><Signal /><Wifi /><Battery /></span>
        </div>
        <div className="wky-phone-app">
          <div className="wky-phone-search" aria-hidden="true"><Search />Ürün ara…</div>
          <div className="wky-phone-title">
            <strong><Zap />Haftalık fırsatlar</strong>
            {count > 0 && <span>Tümü ›</span>}
          </div>
          {count === 0 ? (
            <div className="wky-shelf-empty">
              <Sparkles aria-hidden="true" />
              Raf boş. Yayında fırsat yokken müşteri bu bölümü görmez.
            </div>
          ) : (
            <div className="wky-shelf">
              {ghost && <PhoneCard product={ghost.product} price={ghost.price} pct={ghost.pct} ghost />}
              {live.map((wp) => (
                <PhoneCard key={wp._id} product={wp.product} price={wp.weeklyPrice} pct={wp.discountPercentage} />
              ))}
            </div>
          )}
          <div className="wky-phone-rest" aria-hidden="true"><span /><span /></div>
        </div>
      </div>
    </div>
  );
};

// ── Ekleme / düzenleme çekmecesi ──────────────────────────────────────────
const END_OPTIONS = [
  { id: "none", label: "Süresiz", icon: InfinityIcon },
  { id: "week", label: "Pazar 23:59" },
  { id: "3", label: "3 gün" },
  { id: "7", label: "7 gün" },
  { id: "14", label: "14 gün" },
  { id: "custom", label: "Tarih seç", icon: CalendarClock },
];
const QUICK_PCT = [10, 15, 20, 25, 30, 40, 50];

const WeeklyForm = ({ mode, item, items, now, onClose, onSaved, onGhost }) => {
  const { confirm } = useConfirm();
  const editing = mode === "edit";
  const [product, setProduct] = useState(editing ? item.product : null);
  const [price, setPrice] = useState(editing ? String(item.weeklyPrice ?? "") : "");
  const [pct, setPct] = useState(editing && item.product?.price > item.weeklyPrice ? String(pctOf(item.product.price, item.weeklyPrice)) : "");
  const [endMode, setEndMode] = useState(editing && item.endDate ? "custom" : "none");
  const [endCustom, setEndCustom] = useState(editing ? toLocalInput(item.endDate) : "");
  const [order, setOrder] = useState(editing ? String(item.order ?? 0) : "");
  const [isActive, setIsActive] = useState(editing ? item.isActive !== false : true);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // Ürün kataloğu (yalnızca eklemede)
  const [catalog, setCatalog] = useState(catalogCache?.products || null);
  const [catalogError, setCatalogError] = useState(null);
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState(0);
  const searchRef = useRef(null);
  const priceRef = useRef(null);

  useEffect(() => {
    if (editing || catalog) return undefined;
    let cancelled = false;
    loadCatalog()
      .then((list) => { if (!cancelled) setCatalog(list); })
      .catch(() => { if (!cancelled) setCatalogError("Ürünler yüklenemedi"); });
    return () => { cancelled = true; };
  }, [editing, catalog]);

  useEffect(() => {
    if (!editing && !product) searchRef.current?.focus();
    else if (!editing && product) priceRef.current?.focus();
  }, [editing, product]);

  const activeIds = useMemo(() => new Set(items.filter((wp) => wp.isActive && wp.product?._id).map((wp) => wp.product._id)), [items]);
  const results = useMemo(() => {
    if (!catalog) return [];
    const q = fold(query.trim());
    const list = q ? catalog.filter((p) => fold(p.name).includes(q)) : catalog;
    return list.filter((p) => !activeIds.has(p._id)).slice(0, 40);
  }, [catalog, query, activeIds]);
  useEffect(() => { setPick(0); }, [query]);

  const basePrice = Number(product?.price) || 0;
  const priceNum = num(price);
  const pctNum = num(pct);
  const resolvedEnd = useMemo(() => {
    if (endMode === "none") return null;
    if (endMode === "week") return endOfWeek(now);
    if (endMode === "custom") return endCustom ? new Date(endCustom) : null;
    return daysFromNow(Number(endMode), now);
  }, [endMode, endCustom, now]);

  const priceError = !price ? null
    : !(priceNum > 0) ? "Geçerli bir fiyat girin"
      : basePrice && priceNum >= basePrice ? "Fırsat fiyatı mağaza fiyatından düşük olmalı" : null;
  const endError = endMode === "custom" && endCustom && resolvedEnd && resolvedEnd.getTime() <= now ? "Bitiş tarihi geçmişte kaldı" : null;
  const canSave = Boolean(product) && price && !priceError && !endError && !(endMode === "custom" && !endCustom);
  const savings = basePrice && priceNum > 0 ? basePrice - priceNum : 0;
  const effectivePct = basePrice && priceNum > 0 ? pctOf(basePrice, priceNum) : 0;

  // Rafta hayalet kart: ekleme sırasında ürün seçilince
  useEffect(() => {
    if (!onGhost) return undefined;
    onGhost(!editing && product && priceNum > 0 ? { product, price: priceNum, pct: effectivePct } : null);
    return () => onGhost(null);
  }, [onGhost, editing, product, priceNum, effectivePct]);

  const changePrice = (value) => {
    setTouched(true);
    setPrice(value);
    const n = num(value);
    setPct(basePrice && n > 0 && n < basePrice ? String(pctOf(basePrice, n)) : "");
  };
  const changePct = (value) => {
    setTouched(true);
    setPct(value);
    const n = num(value);
    if (basePrice && n > 0 && n < 100) setPrice(priceFromPct(basePrice, n).toFixed(2));
  };
  const choose = (p) => {
    setProduct(p);
    setQuery("");
    setTouched(true);
    if (price) changePrice(price);
  };
  const onSearchKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setPick((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPick((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && results[pick]) { e.preventDefault(); choose(results[pick]); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    const payload = {
      weeklyPrice: priceNum,
      discountPercentage: effectivePct,
      endDate: resolvedEnd ? resolvedEnd.toISOString() : null,
    };
    try {
      if (editing) {
        payload.order = Number.isFinite(num(order)) ? num(order) : item.order;
        payload.isActive = isActive;
        const response = await axios.put(`/weekly-products/${item._id}`, payload);
        onSaved("edit", response.data?.weeklyProduct, item);
      } else {
        payload.productId = product._id;
        payload.order = items.reduce((max, wp) => Math.max(max, Number(wp.order) || 0), -1) + 1;
        const response = await axios.post("/weekly-products", payload);
        onSaved("add", response.data?.weeklyProduct);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const dirty = touched && !saving;
  const onDirtyClose = () => confirm({
    title: "Kaydedilmemiş değişiklik var",
    message: "Çekmeceyi kapatırsanız girdikleriniz kaybolur.",
    confirmText: "Kapat",
    cancelText: "Düzenlemeye dön",
    type: "warning",
  });

  return (
    <Drawer
      title={editing ? "Fırsatı düzenle" : "Fırsat ekle"}
      subtitle={editing ? item.product?.name || "Ürün silinmiş" : "Ürün seçin, fiyatı ve bitişi belirleyin"}
      icon={editing ? Pencil : Plus}
      width={460}
      onClose={onClose}
      dirty={dirty}
      onDirtyClose={onDirtyClose}
      footer={(
        <>
          <button type="button" className="ui-btn" onClick={onClose} disabled={saving}>İptal</button>
          <button type="submit" form="wky-form" className="ui-btn ui-btn--primary" disabled={!canSave || saving}>
            {saving ? <span className="ui-loader" /> : editing ? "Kaydet" : "Rafa ekle"}
          </button>
        </>
      )}
    >
      <form id="wky-form" className="wky-form" onSubmit={submit} noValidate>
        {/* Ürün */}
        <div>
          <span className="ui-label">Ürün</span>
          {product ? (
            <div className="wky-selected">
              <div className="ui-thumb wky-thumb">
                {productImage(product) ? <img src={productImage(product)} alt="" /> : <Package aria-hidden="true" />}
              </div>
              <div>
                <strong>{product.name}</strong>
                <small>
                  Mağaza fiyatı {money(product.price)}
                  {product.isDiscounted && product.discountedPrice ? ` · şu an indirimli ${money(product.discountedPrice)}` : ""}
                  {product.isOutOfStock ? " · stokta yok" : ""}
                </small>
              </div>
              {!editing && (
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setProduct(null); setPrice(""); setPct(""); }}>Değiştir</button>
              )}
            </div>
          ) : (
            <div className="wky-picker">
              <div className="ui-search">
                <Search aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  className="ui-field"
                  placeholder="Ürün adı yazın…"
                  aria-label="Ürün ara"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  autoComplete="off"
                />
              </div>
              <div className="wky-picker-list" role="listbox" aria-label="Ürünler">
                {catalogError ? (
                  <div className="wky-picker-empty">
                    {catalogError} · <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setCatalogError(null); setCatalog(null); }}>Tekrar dene</button>
                  </div>
                ) : !catalog ? (
                  <SkeletonRows rows={4} height={50} />
                ) : results.length === 0 ? (
                  <div className="wky-picker-empty">{query ? `"${query}" için ürün bulunamadı` : "Ürün yok"}</div>
                ) : results.map((p, i) => (
                  <button
                    key={p._id}
                    type="button"
                    role="option"
                    aria-selected={i === pick}
                    className="wky-picker-item"
                    data-cursor={i === pick}
                    onMouseEnter={() => setPick(i)}
                    onClick={() => choose(p)}
                  >
                    <span className="ui-thumb">
                      {productImage(p, 80) ? <img src={productImage(p, 80)} alt="" loading="lazy" /> : <Package aria-hidden="true" />}
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.category || "Kategori yok"}{p.isOutOfStock ? " · stokta yok" : ""}</small>
                    </span>
                    <span className="ui-num">{money(p.price)}</span>
                  </button>
                ))}
              </div>
              <p className="ui-hint">Zaten yayında olan ürünler listede görünmez. <kbd className="ui-kbd">↑</kbd> <kbd className="ui-kbd">↓</kbd> ile gezin, <kbd className="ui-kbd">↵</kbd> ile seçin.</p>
            </div>
          )}
        </div>

        {/* Fiyat / indirim */}
        <div>
          <span className="ui-label">Fırsat fiyatı</span>
          <div className="wky-calc">
            <div className="ui-field-prefix">
              <span>₺</span>
              <input
                ref={priceRef}
                id="wky-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="ui-field"
                placeholder={basePrice ? priceFromPct(basePrice, 20).toFixed(2) : "0,00"}
                aria-label="Fırsat fiyatı (₺)"
                value={price}
                onChange={(e) => changePrice(e.target.value)}
                disabled={!product}
              />
            </div>
            <div className="wky-calc-suffix">
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                max="99"
                className="ui-field"
                placeholder="İndirim"
                aria-label="İndirim yüzdesi"
                value={pct}
                onChange={(e) => changePct(e.target.value)}
                disabled={!product}
              />
              <span>%</span>
            </div>
          </div>
          <div className="wky-quick" role="group" aria-label="Hızlı indirim">
            {QUICK_PCT.map((q) => (
              <button key={q} type="button" aria-pressed={pctNum === q} onClick={() => changePct(String(q))} disabled={!product}>
                <Percent />{q}
              </button>
            ))}
          </div>
          {priceError ? (
            <p className="wky-calc-result" data-tone="danger" role="alert" style={{ marginTop: 8 }}>{priceError}</p>
          ) : product && priceNum > 0 ? (
            <p className="wky-calc-result" style={{ marginTop: 8 }}>
              <span>{money(basePrice)} <ArrowRight className="wky-price-arrow" aria-hidden="true" /> <span className="ui-num">{money(priceNum)}</span></span>
              <span>%{effectivePct} indirim · {money(savings)} tasarruf</span>
            </p>
          ) : null}
        </div>

        {/* Bitiş */}
        <div>
          <span className="ui-label">Bitiş</span>
          <div className="wky-quick" role="group" aria-label="Bitiş tarihi" style={{ marginTop: 0 }}>
            {END_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" aria-pressed={endMode === opt.id} onClick={() => { setEndMode(opt.id); setTouched(true); }}>
                {opt.icon && <opt.icon />}{opt.label}
              </button>
            ))}
          </div>
          {endMode === "custom" && (
            <input
              type="datetime-local"
              className="ui-field"
              aria-label="Bitiş tarihi ve saati"
              value={endCustom}
              min={toLocalInput(now)}
              onChange={(e) => { setEndCustom(e.target.value); setTouched(true); }}
              style={{ marginTop: 8 }}
            />
          )}
          {endError ? (
            <p className="ui-hint" role="alert" style={{ color: "var(--ui-danger-ink)" }}>{endError}</p>
          ) : (
            <p className="ui-hint">
              {resolvedEnd
                ? `Bitiş: ${formatDateTime(resolvedEnd)} · ${remaining(resolvedEnd, now).label}. Süre dolunca fırsat raftan düşer, kayıt silinmez.`
                : "Süresiz fırsat siz durdurana kadar yayında kalır."}
            </p>
          )}
        </div>

        {editing && (
          <>
            <div className="wky-form-row">
              <div>
                <strong>Yayında</strong>
                <small>Kapalıyken müşteri rafta görmez; kayıt durur.</small>
              </div>
              <button
                type="button"
                className="ui-icon-btn ui-switch"
                data-on={isActive}
                role="switch"
                aria-checked={isActive}
                aria-label="Yayında"
                onClick={() => { setIsActive((v) => !v); setTouched(true); }}
              >
                {isActive ? <ToggleRight /> : <ToggleLeft />}
              </button>
            </div>
            <div className="wky-form-row">
              <div>
                <strong>Sıra</strong>
                <small>Küçük sayı rafta öne gelir. Listede sürükleyerek de değiştirebilirsiniz.</small>
              </div>
              <input
                type="number"
                className="ui-field ui-field--auto"
                style={{ width: 84 }}
                aria-label="Sıra"
                min="0"
                value={order}
                onChange={(e) => { setOrder(e.target.value); setTouched(true); }}
              />
            </div>
          </>
        )}

        {product && priceNum > 0 && !priceError && (
          <div className="wky-card-preview">
            <PhoneCard product={product} price={priceNum} pct={effectivePct} />
            <p>
              <strong>Müşteri böyle görür</strong>
              Kart, uygulamanın ana sayfasındaki Haftalık fırsatlar rafında çıkar. Yüzde rozeti sunucuda fiyattan yeniden hesaplanır.
            </p>
          </div>
        )}
      </form>
    </Drawer>
  );
};

// ── Ekran ────────────────────────────────────────────────────────────────
const WeeklyProductsTab = () => {
  const now = useNow(30000);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [drawer, setDrawer] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [previewOpen, setPreviewOpen] = usePref("wky-preview-open", true);
  const [reordering, setReordering] = useState(false);
  const searchRef = useRef(null);
  const pendingRemoval = useRef(new Set());

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const response = await axios.get("/weekly-products/all");
      setItems((response.data?.weeklyProducts || []).filter((wp) => !pendingRemoval.current.has(wp._id)));
      setError(null);
    } catch (e) {
      if (!quiet) setError(e.response?.data?.message || "Haftalık fırsatlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Başka bir cihazdan ya da mobil uygulama tarafından yapılan değişiklikler
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return undefined;
    let timer = null;
    const onUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load({ quiet: true }), 500);
    };
    socket.on("weeklyProductsUpdated", onUpdate);
    return () => {
      clearTimeout(timer);
      socket.off("weeklyProductsUpdated", onUpdate);
    };
  }, [load]);

  // ── Türetilen veriler ──
  const stats = useMemo(() => {
    const s = { live: 0, paused: 0, ending: 0, expired: 0, pctSum: 0 };
    for (const wp of items) {
      const state = statusOf(wp, now);
      if (state === "live") {
        s.live += 1;
        s.pctSum += Number(wp.discountPercentage) || 0;
        if (wp.endDate && new Date(wp.endDate).getTime() - now < 7 * DAY) s.ending += 1;
      } else if (state === "paused") s.paused += 1;
      else s.expired += 1;
    }
    return { ...s, avg: s.live ? Math.round(s.pctSum / s.live) : 0 };
  }, [items, now]);
  const counts = { all: items.length, live: stats.live, ending: stats.ending, paused: stats.paused, expired: stats.expired };

  const rows = useMemo(() => {
    const q = fold(query.trim());
    return items.filter((wp) => {
      const state = statusOf(wp, now);
      if (filter === "live" && state !== "live") return false;
      if (filter === "paused" && state !== "paused") return false;
      if (filter === "expired" && state !== "expired") return false;
      if (filter === "ending" && !(state === "live" && wp.endDate && new Date(wp.endDate).getTime() - now < 7 * DAY)) return false;
      if (q && !fold(wp.product?.name || "Ürün silinmiş").includes(q)) return false;
      return true;
    });
  }, [items, filter, query, now]);
  const live = useMemo(() => items.filter((wp) => statusOf(wp, now) === "live" && wp.product), [items, now]);
  const canReorder = filter === "all" && !query.trim() && rows.length > 1 && !reordering;
  const filtered = filter !== "all" || Boolean(query.trim());

  useEffect(() => { setCursor(-1); }, [filter, query]);
  useEffect(() => {
    if (cursor < 0) return;
    const id = rows[cursor]?._id;
    if (id) document.querySelector(`[data-wky-row="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, rows]);

  // ── İşlemler ──
  const openEdit = (wp) => setDrawer({ mode: "edit", item: wp });
  const openAdd = () => setDrawer({ mode: "add" });

  const toggle = async (wp) => {
    const nextActive = !wp.isActive;
    setItems((cur) => cur.map((x) => (x._id === wp._id ? { ...x, isActive: nextActive } : x)));
    try {
      const response = await axios.patch(`/weekly-products/${wp._id}/toggle`);
      const updated = response.data?.weeklyProduct;
      if (updated) setItems((cur) => cur.map((x) => (x._id === wp._id ? { ...x, ...updated, product: x.product || updated.product } : x)));
      toast.success(nextActive ? "Yayına alındı" : "Durduruldu");
    } catch (e) {
      setItems((cur) => cur.map((x) => (x._id === wp._id ? { ...x, isActive: wp.isActive } : x)));
      toast.error(e.response?.data?.message || "Durum değiştirilemedi");
    }
  };

  const remove = (wp) => {
    const index = items.findIndex((x) => x._id === wp._id);
    pendingRemoval.current.add(wp._id);
    setItems((cur) => cur.filter((x) => x._id !== wp._id));
    if (drawer?.item?._id === wp._id) setDrawer(null);
    undoable({
      message: `${wp.product?.name || "Ürün"} raftan kaldırıldı`,
      icon: <Trash2 />,
      commit: async () => {
        try {
          await axios.delete(`/weekly-products/${wp._id}`);
        } catch (e) {
          toast.error(e.response?.data?.message || "Kaldırılamadı, liste yenilendi");
          pendingRemoval.current.delete(wp._id);
          load({ quiet: true });
        } finally {
          pendingRemoval.current.delete(wp._id);
        }
      },
      undo: () => {
        pendingRemoval.current.delete(wp._id);
        setItems((cur) => {
          if (cur.some((x) => x._id === wp._id)) return cur;
          const next = [...cur];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, wp);
          return next;
        });
      },
    });
  };

  const onDragEnd = async (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const before = new Map(items.map((wp) => [wp._id, Number(wp.order) || 0]));
    const next = [...items];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    const renumbered = next.map((wp, i) => ({ ...wp, order: i }));
    setItems(renumbered);
    const changed = renumbered.filter((wp) => before.get(wp._id) !== wp.order);
    if (!changed.length) return;
    setReordering(true);
    try {
      await Promise.all(changed.map((wp) => axios.put(`/weekly-products/${wp._id}`, { order: wp.order })));
      toast.success("Sıra kaydedildi");
    } catch (e) {
      toast.error(e.response?.data?.message || "Sıra kaydedilemedi");
      load({ quiet: true });
    } finally {
      setReordering(false);
    }
  };

  const onSaved = (mode, saved, previous) => {
    setDrawer(null);
    if (mode === "add") {
      if (saved) setItems((cur) => [...cur.filter((x) => x._id !== saved._id), saved]);
      toast.success("Fırsat rafa eklendi");
    } else if (saved) {
      setItems((cur) => cur.map((x) => (x._id === saved._id ? { ...x, ...saved, product: saved.product || previous?.product } : x)));
      toast.success("Fırsat güncellendi");
    }
    load({ quiet: true });
  };

  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: (d) => setCursor((c) => (rows.length ? Math.min(rows.length - 1, Math.max(0, c + d)) : -1)),
    open: () => { if (rows[cursor]) openEdit(rows[cursor]); },
    escape: () => { if (cursor >= 0) setCursor(-1); else if (filtered) { setFilter("all"); setQuery(""); } },
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
    extra: { n: openAdd },
  });

  const previewHead = (
    <div className="wky-preview-head">
      <div>
        <h2><Smartphone />Müşteri görünümü</h2>
        <p>{live.length ? `${live.length} ürün rafta` : "Raf boş"} · canlı</p>
      </div>
      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setPreviewOpen((v) => !v)} aria-expanded={previewOpen}>
        {previewOpen ? "Gizle" : "Göster"}
      </button>
    </div>
  );

  // ── Yükleniyor ──
  if (loading) {
    return (
      <div className="ui-page">
        <PageHeader title="Haftalık fırsatlar" description="Ana sayfadaki fırsat rafını yönetin." />
        <SkeletonCards count={4} />
        <div className="wky-layout">
          <div className="wky-main">
            <Skeleton height={54} radius={10} />
            <div className="ui-panel"><SkeletonRows rows={5} height={72} /></div>
          </div>
          <aside className="wky-side"><div className="ui-panel ui-panel-body"><Skeleton height={420} radius={26} /></div></aside>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Haftalık fırsatlar"
        meta={stats.live ? `${stats.live} yayında` : undefined}
        description="Ana sayfadaki fırsat rafını yönetin: ürün ekleyin, fiyat ve bitiş belirleyin, sırayı sürükleyerek değiştirin."
        actions={(
          <>
            <button type="button" className="ui-icon-btn" onClick={() => load({ quiet: true })} aria-label="Yenile" title="Yenile"><RefreshCw /></button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={openAdd}><Plus />Fırsat ekle</button>
          </>
        )}
      />

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle />
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard icon={Zap} label="Yayında" value={stats.live} tone="ok" note="müşteri rafında" active={filter === "live"} onClick={() => setFilter(filter === "live" ? "all" : "live")} />
        <KpiCard icon={ToggleLeft} label="Pasif" value={stats.paused} note="kayıt duruyor" active={filter === "paused"} onClick={() => setFilter(filter === "paused" ? "all" : "paused")} />
        <KpiCard icon={Hourglass} label="Bu hafta biten" value={stats.ending} tone={stats.ending ? "warn" : undefined} note="7 gün içinde biter" active={filter === "ending"} onClick={() => setFilter(filter === "ending" ? "all" : "ending")} />
        <KpiCard icon={Percent} label="Ortalama indirim" value={`%${stats.avg}`} tone="brand" note="yayındakilerde" />
      </KpiGrid>

      <div className="wky-layout">
        <div className="wky-main">
          {items.length === 0 && error ? null : items.length === 0 ? (
            <section className="ui-panel">
              <EmptyState
                icon={Sparkles}
                title="Henüz fırsat yok"
                description="İlk ürünü ekleyin; indirimli fiyat ana sayfadaki rafta hemen görünsün."
                action={<button type="button" className="ui-btn ui-btn--primary" onClick={openAdd}><Plus />İlk fırsatı ekle</button>}
              />
            </section>
          ) : (
            <>
              <div className="wky-toolbar">
                <div className="ui-search">
                  <Search aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    className="ui-field"
                    placeholder="Fırsatlarda ara…"
                    aria-label="Fırsatlarda ara"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-esc-clear="1"
                  />
                </div>
                <div className="ui-chips" role="group" aria-label="Durum filtresi">
                  {FILTERS.filter((f) => f.id !== "expired" || counts.expired > 0).map((f) => (
                    <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                      {f.dot && <span className={`ui-dot ui-dot--${f.dot}`} />}
                      {f.label}
                      <span className="ui-count">{counts[f.id]}</span>
                    </button>
                  ))}
                </div>
                {filtered && (
                  <div className="wky-toolbar-right">
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => { setFilter("all"); setQuery(""); }}>Filtreleri temizle</button>
                  </div>
                )}
              </div>

              <section className="ui-panel" aria-label="Fırsat listesi">
                {filtered && rows.length > 1 && (
                  <div className="wky-list-note"><GripVertical />Sıralamak için filtreleri temizleyin; sıra tüm liste üzerinden belirlenir.</div>
                )}
                {rows.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Search}
                    title="Sonuç yok"
                    description={query ? `"${query}" ile eşleşen fırsat yok.` : EMPTY_TEXT[filter]}
                    action={<button type="button" className="ui-btn ui-btn--sm" onClick={() => { setFilter("all"); setQuery(""); }}>Filtreleri temizle</button>}
                  />
                ) : (
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="wky-list">
                      {(dropProvided) => (
                        <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="wky-list">
                          {rows.map((wp, i) => {
                            const state = statusOf(wp, now);
                            const product = wp.product;
                            const left = remaining(wp.endDate, now);
                            const LeftIcon = left.icon;
                            const img = productImage(product);
                            const position = items.indexOf(wp) + 1;
                            return (
                              <Draggable key={wp._id} draggableId={wp._id} index={i} isDragDisabled={!canReorder}>
                                {(dragProvided, snapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    className="wky-row"
                                    data-state={state}
                                    data-cursor={cursor === i}
                                    data-dragging={snapshot.isDragging}
                                    data-wky-row={wp._id}
                                    onMouseEnter={() => setCursor(i)}
                                  >
                                    <span
                                      className="wky-handle"
                                      {...dragProvided.dragHandleProps}
                                      aria-disabled={!canReorder}
                                      aria-label={`${product?.name || "Ürün"} sırasını değiştir`}
                                      title={canReorder ? "Sürükleyerek sırala" : "Sıralamak için filtreleri temizleyin"}
                                    >
                                      <GripVertical />
                                    </span>
                                    <div className="ui-thumb wky-thumb">
                                      {img ? <img src={img} alt="" loading="lazy" /> : <Package aria-hidden="true" />}
                                      <span className="wky-order" aria-label={`Sıra ${position}`}>{position}</span>
                                    </div>
                                    <div className="wky-main-cell">
                                      <span className="wky-name">
                                        {product ? (
                                          <button type="button" onClick={() => openEdit(wp)} title="Düzenle">{product.name}</button>
                                        ) : (
                                          <span className="ui-badge ui-badge--danger"><AlertTriangle />Ürün silinmiş</span>
                                        )}
                                      </span>
                                      <span className="wky-prices">
                                        {product?.price > 0 && (
                                          <>
                                            <span className="wky-price-old">{money(product.price)}</span>
                                            <ArrowRight className="wky-price-arrow" aria-hidden="true" />
                                          </>
                                        )}
                                        <span className="wky-price-new">{money(wp.weeklyPrice)}</span>
                                        {wp.discountPercentage > 0 && <span className="wky-pct"><Tag />%{wp.discountPercentage}</span>}
                                        {product?.price > wp.weeklyPrice && <span className="wky-saving">{money(product.price - wp.weeklyPrice)} tasarruf</span>}
                                        {product?.price > 0 && wp.weeklyPrice >= product.price && <span className="ui-badge ui-badge--warn"><AlertTriangle />Mağaza fiyatından düşük değil</span>}
                                        {product?.isOutOfStock && <span className="ui-badge ui-badge--warn">Stokta yok</span>}
                                      </span>
                                    </div>
                                    <div className="wky-time" data-tone={state === "paused" ? "" : left.tone}>
                                      {state === "paused" ? (
                                        <>
                                          <strong><ToggleLeft />Pasif</strong>
                                          <span>{wp.endDate ? `Bitiş ${formatDateTime(wp.endDate)}` : "Süresiz"}</span>
                                        </>
                                      ) : (
                                        <>
                                          <strong><LeftIcon />{left.label}</strong>
                                          <span>{left.sub}</span>
                                        </>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      className="ui-icon-btn ui-switch wky-switch"
                                      data-on={wp.isActive}
                                      role="switch"
                                      aria-checked={wp.isActive}
                                      aria-label={wp.isActive ? "Yayından kaldır" : "Yayına al"}
                                      title={wp.isActive ? "Yayından kaldır" : "Yayına al"}
                                      onClick={() => toggle(wp)}
                                    >
                                      {wp.isActive ? <ToggleRight /> : <ToggleLeft />}
                                    </button>
                                    <div className="wky-actions">
                                      <button type="button" className="ui-icon-btn" onClick={() => openEdit(wp)} aria-label="Düzenle" title="Düzenle (↵)"><Pencil /></button>
                                      <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={() => remove(wp)} aria-label="Raftan kaldır" title="Raftan kaldır"><Trash2 /></button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {dropProvided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
                <div className="wky-foot">
                  <p>{rows.length === items.length ? `${items.length} fırsat` : `${rows.length} / ${items.length} fırsat`}{reordering ? " · sıra kaydediliyor…" : canReorder ? " · tutamacı sürükleyerek sıralayın" : ""}</p>
                  <p className="wky-foot-hint">İpucu: <kbd>/</kbd> ara · <kbd>j</kbd> <kbd>k</kbd> gez · <kbd>↵</kbd> düzenle · <kbd>n</kbd> yeni · <kbd>?</kbd> yardım</p>
                </div>
              </section>
            </>
          )}
        </div>

        <aside className="wky-side" data-collapsed={!previewOpen}>
          <div className="ui-panel ui-panel-body">
            {previewHead}
            {previewOpen && (
              <>
                <PhonePreview live={live} ghost={ghost} now={now} />
                <p className="wky-preview-note"><span className="ui-dot ui-dot--ok" />Yayındaki ürünler sırayla, temsili görünüm</p>
              </>
            )}
          </div>
        </aside>
      </div>

      {drawer && (
        <WeeklyForm
          key={drawer.item?._id || "new"}
          mode={drawer.mode}
          item={drawer.item}
          items={items}
          now={now}
          onClose={() => setDrawer(null)}
          onSaved={onSaved}
          onGhost={setGhost}
        />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={[[["n"], "Yeni fırsat ekle"]]} />
    </div>
  );
};

export default WeeklyProductsTab;
