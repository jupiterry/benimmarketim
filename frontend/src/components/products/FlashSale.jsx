import { useEffect, useMemo, useRef, useState } from "react";
import { X, Zap, Square, Ban, Trash2, Package, RefreshCw, AlertTriangle, TrendingUp } from "lucide-react";
import {
  DURATIONS, flashStatus, formatDateTime, localInputToIso, money, remaining, roundMoney, toLocalInput
} from "./productUtils";
import { cloudinaryImage } from "../../lib/image";
import axios from "../../lib/axios";
import { Skeleton, compactMoney } from "../admin/ui";
import "../../styles/campaign-center.css";

const QUICK_PCTS = [10, 15, 20, 25, 30, 40];

/**
 * Flash sale formu. Tarihler yerel saatle girilir, sunucuya ISO (saat dilimli) gider.
 * "Hemen" seçiliyse başlangıç ve (hazır sürelerde) bitiş sunucu saatine göre hesaplanır
 * (startNow + durationHours); bilgisayarın saati yanlış olsa da kampanya hemen başlar.
 * `products` önizleme içindir: tek ürünse eski → yeni fiyat gösterilir.
 */
/** Ürünün [start, end) aralığıyla çakışan açık kampanyaları (sunucudaki çakışma kuralıyla aynı) */
const overlappingSales = (sales, productId, start, end, now) => sales.filter((sale) => {
  const id = sale.product?._id || sale.product;
  if (String(id) !== String(productId) || flashStatus(sale, now) === "ended") return false;
  return new Date(sale.startDate).getTime() < end.getTime() && start.getTime() < new Date(sale.endDate).getTime();
});

/**
 * `bulk`: birden çok ürün için ortak kampanya. Kampanya adı, ürün ürün eski → yeni fiyat önizlemesi ve
 * aynı tarihlerde flaş indirimi olan ürünler için "atla / yenisiyle değiştir" seçimi eklenir.
 * `sales`: tüm kampanyalar (çakışma önizlemesi için; asıl denetim sunucuda).
 */
export const FlashSaleForm = ({ products = [], busy, submitLabel = "Flash sale başlat", onSubmit, onCancel, bulk = false, sales = [] }) => {
  const [name, setName] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [pct, setPct] = useState("20");
  const [startMode, setStartMode] = useState("now");
  const [start, setStart] = useState(() => toLocalInput(Date.now() + 60 * 60 * 1000));
  const [hours, setHours] = useState(24);
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(Date.now() + 25 * 60 * 60 * 1000));

  const pctNum = Number(String(pct).replace(",", "."));
  const pctValid = Number.isFinite(pctNum) && pctNum >= 1 && pctNum <= 99;
  const startDate = startMode === "now" ? new Date() : new Date(start);
  const endDate = hours === "custom" ? new Date(customEnd) : new Date(startDate.getTime() + hours * 3600 * 1000);
  const datesValid = !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) &&
    endDate > startDate && endDate > new Date();
  const error = !pctValid ? "İndirim oranı 1-99 arasında olmalı"
    : !datesValid ? "Bitiş, başlangıçtan ve şimdiden sonra olmalı" : "";

  const single = products.length === 1 && !bulk ? products[0] : null;

  // Toplu önizleme: yeni fiyat (liste fiyatından, sunucuyla aynı yuvarlama) ve çakışan kampanya
  const nowMs = Date.now();
  const preview = useMemo(() => (bulk ? products.map((product) => {
    const conflicts = datesValid ? overlappingSales(sales, product._id, startDate, endDate, nowMs) : [];
    return {
      product,
      next: pctValid ? roundMoney(Number(product.price) * (1 - pctNum / 100)) : null,
      conflict: conflicts[0] || null,
    };
  }) : []), [bulk, products, sales, datesValid, pctValid, pctNum, startDate.getTime(), endDate.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const conflictCount = preview.filter((row) => row.conflict).length;
  const willCreate = bulk ? (replaceExisting ? preview.length : preview.length - conflictCount) : products.length;
  const bulkError = bulk && !error && willCreate === 0 ? "Seçili ürünlerin hepsinde bu tarihlerde flaş indirim var; değiştirmeyi seçin ya da tarihleri değiştirin." : "";

  const submit = (e) => {
    e.preventDefault();
    if (error || bulkError || busy) return;
    onSubmit({
      ...(bulk ? { name: name.trim(), replaceExisting } : {}),
      discountPercentage: roundMoney(pctNum),
      startNow: startMode === "now",
      startDate: startMode === "now" ? new Date().toISOString() : localInputToIso(start),
      endDate: endDate.toISOString(),
      ...(hours !== "custom" ? { durationHours: hours } : {}),
    });
  };

  return (
    <form className="prd-flash-form" onSubmit={submit}>
      {bulk && (
        <div className="prd-form-row">
          <label className="ui-label" htmlFor="prd-flash-name">Kampanya adı <span className="ui-hint">(isteğe bağlı)</span></label>
          <input id="prd-flash-name" className="ui-field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Pepsi haftası" />
        </div>
      )}

      <div className="prd-form-row">
        <label className="ui-label" htmlFor="prd-flash-pct">{bulk ? "İndirim oranı (hepsine aynı)" : "İndirim oranı"}</label>
        <div className="prd-pct">
          <div className="ui-field-prefix prd-pct-input">
            <input id="prd-flash-pct" className="ui-field" inputMode="decimal" value={pct}
              onChange={(e) => setPct(e.target.value)} aria-invalid={!pctValid} />
            <span>%</span>
          </div>
          <div className="ui-chips prd-wrap">
            {QUICK_PCTS.map((v) => (
              <button key={v} type="button" aria-pressed={pctNum === v} onClick={() => setPct(String(v))}>%{v}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="prd-form-row">
        <span className="ui-label">Başlangıç</span>
        <div className="ui-segmented prd-seg">
          <button type="button" aria-pressed={startMode === "now"} onClick={() => setStartMode("now")}>Hemen</button>
          <button type="button" aria-pressed={startMode === "later"} onClick={() => setStartMode("later")}>İleri tarihte</button>
        </div>
        {startMode === "later" && (
          <input type="datetime-local" className="ui-field" value={start} onChange={(e) => setStart(e.target.value)}
            aria-label="Başlangıç tarihi" />
        )}
      </div>

      <div className="prd-form-row">
        <span className="ui-label">Süre</span>
        <div className="ui-chips prd-wrap">
          {DURATIONS.map((d) => (
            <button key={d.hours} type="button" aria-pressed={hours === d.hours} onClick={() => setHours(d.hours)}>{d.label}</button>
          ))}
          <button type="button" aria-pressed={hours === "custom"} onClick={() => setHours("custom")}>Bitiş seç</button>
        </div>
        {hours === "custom" && (
          <input type="datetime-local" className="ui-field" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
            aria-label="Bitiş tarihi" />
        )}
      </div>

      <div className="prd-flash-summary">
        {single && pctValid ? (
          <span>
            <s>{money(single.price)}</s> → <strong>{money(single.price * (1 - pctNum / 100))}</strong>
          </span>
        ) : (
          <span>{bulk ? `${willCreate} ürüne aynı oran ve tarihle uygulanır` : products.length > 1 ? `${products.length} ürüne ayrı ayrı uygulanır` : ""}</span>
        )}
        {datesValid && (
          <span className="ui-muted">
            {startMode === "now" ? "Şimdi" : formatDateTime(startDate)} – {formatDateTime(endDate)}
          </span>
        )}
      </div>

      {bulk && (
        <div className="prd-form-row">
          <span className="ui-label">Ürünler <span className="ui-hint">· {products.length}</span></span>
          {conflictCount > 0 && (
            <div className="prd-bulk-conflict" role="status">
              <AlertTriangle />
              <span className="ui-grow">{conflictCount} üründe bu tarihlerde zaten flaş indirim var.</span>
              <div className="ui-segmented">
                <button type="button" aria-pressed={!replaceExisting} onClick={() => setReplaceExisting(false)}>Atla</button>
                <button type="button" aria-pressed={replaceExisting} onClick={() => setReplaceExisting(true)}>Yenisiyle değiştir</button>
              </div>
            </div>
          )}
          <ul className="prd-bulk-preview">
            {preview.map(({ product, next, conflict }) => (
              <li key={product._id} data-skip={conflict && !replaceExisting ? "1" : undefined}>
                <span className="prd-bulk-name">
                  {product.name}
                  {product.isHidden && <span className="ui-badge">Gizli</span>}
                  {product.isOutOfStock && <span className="ui-badge ui-badge--danger">Stokta yok</span>}
                  {conflict && (
                    <span className="ui-badge ui-badge--warn" title={`${formatDateTime(conflict.startDate)} – ${formatDateTime(conflict.endDate)}`}>
                      Mevcut %{conflict.discountPercentage} · {replaceExisting ? "iptal edilip yenisi uygulanır" : "atlanır"}
                    </span>
                  )}
                </span>
                <span className="prd-bulk-price ui-num">
                  <s>{money(product.price)}</s>
                  {next !== null && <> → <strong>{money(next)}</strong></>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(error || bulkError) && <p className="prd-form-error" role="alert">{error || bulkError}</p>}

      <div className="prd-form-actions">
        {onCancel && <button type="button" className="ui-btn" onClick={onCancel}>Vazgeç</button>}
        <button type="submit" className="ui-btn ui-btn--primary" disabled={Boolean(error) || Boolean(bulkError) || busy}>
          {busy ? <RefreshCw className="ui-spin" /> : <Zap />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

export const FlashBadge = ({ entry, now }) => {
  if (!entry) return null;
  const { sale, status } = entry;
  return status === "active" ? (
    <span className="prd-flash-badge" data-status="active" title={`Bitiş: ${formatDateTime(sale.endDate)}`}>
      <Zap />%{sale.discountPercentage} · {remaining(sale.endDate, now)}
    </span>
  ) : (
    <span className="prd-flash-badge" data-status="upcoming" title={`Başlangıç: ${formatDateTime(sale.startDate)}`}>
      <Zap />%{sale.discountPercentage} · {remaining(sale.startDate, now)} sonra
    </span>
  );
};

const STATUS_LABEL = { active: "Yayında", upcoming: "Planlandı", ended: "Bitti" };
const STATUS_TONE = { active: "ok", upcoming: "info", ended: "" };
const count = (value) => (Number(value) || 0).toLocaleString("tr-TR");

/**
 * Kampanyanın getirisi (GET /api/campaigns/performance): "34 adet · ₺1.020 ciro · ₺204 indirim".
 * performance: { state: "loading" } | { state: "ready", data } | { state: "error" }; hata olursa satır gizlenir.
 * `measurable`: kampanya ürüne kayıtlı bir fiyatla uygulanmış mı (appliedPrice). Uygulanmamış kampanyada
 * (planlıyken iptal, silinmiş ürün ya da fiyat kaydı tutulmadan önceki eski kampanya) satış ölçülemez;
 * "satış olmadı" yazılmaz, satır gizlenir.
 */
const PerformanceLine = ({ performance, status, measurable = true }) => {
  if (!performance || status === "upcoming") return null;
  if (performance.state === "loading") return <Skeleton width={150} height={10} className="prd-flash-perf-wait" />;
  const data = performance.state === "ready" ? performance.data : null;
  if (!data) return null;
  if (!(Number(data.units) > 0)) {
    if (!measurable) return null;
    return (
      <span className="prd-flash-perf" data-empty="true">
        <TrendingUp aria-hidden="true" />{status === "active" ? "Henüz satış yok" : "Bu kampanyada satış olmadı"}
      </span>
    );
  }
  return (
    <span className="prd-flash-perf" title={`${count(data.orders)} siparişte · ciro kupon öncesi satır tutarı, indirim liste fiyatına göre`}>
      <TrendingUp aria-hidden="true" />
      <span>{count(data.units)} adet</span>
      <span>{compactMoney(data.revenue)} ciro</span>
      <span>{compactMoney(data.discount)} indirim</span>
      {Number(data.inferredLines) > 0 && (
        <span className="cc-estimate" title={`${count(data.inferredLines)} satır, fiyat bilgisi kaydedilmeden önceki siparişlerden fiyatına göre eşleştirildi.`}>
          tahmini
        </span>
      )}
    </span>
  );
};

/**
 * Tek kampanya satırı (çekmecede ve yöneticide ortak).
 * Yayında → "Bitir", planlı → "İptal et" (ikisi de onay ister, ürün eski fiyatına hemen döner);
 * biten/iptal edilen kayıt → yalnızca "Kaydı sil". `performance` verilirse (yönetici) getiri satırı gösterilir.
 */
export const FlashSaleRow = ({ sale, now, onEnd, onDelete, onOpenProduct, showProduct = true, busy, performance }) => {
  const status = flashStatus(sale, now);
  const cancelled = status === "ended" && Boolean(sale.cancelledAt);
  const product = typeof sale.product === "object" ? sale.product : null;
  const price = product ? Number(product.price) : null;
  return (
    <li className="prd-flash-row" data-status={status} data-cancelled={cancelled || undefined}>
      {showProduct && (
        <button type="button" className="ui-thumb prd-flash-thumb" onClick={() => product && onOpenProduct?.(product._id)}
          aria-label={product ? `${product.name} ürününü aç` : "Ürün silinmiş"}>
          {product?.image ? <img src={cloudinaryImage(product.thumbnail || product.image, 120)} alt="" loading="lazy" /> : <Package />}
        </button>
      )}
      <div className="prd-flash-main">
        {showProduct && <strong className="ui-truncate">{product?.name || "Silinmiş ürün"}</strong>}
        <span className="prd-flash-meta">
          {cancelled ? (
            <span className="ui-badge ui-badge--danger">İptal edildi</span>
          ) : (
            <span className={`ui-badge ${STATUS_TONE[status] ? `ui-badge--${STATUS_TONE[status]}` : ""}`}>{STATUS_LABEL[status]}</span>
          )}
          <span className="prd-flash-pct">%{sale.discountPercentage}</span>
          {price != null && <span>{money(price * (1 - sale.discountPercentage / 100))}</span>}
        </span>
        <span className="ui-muted ui-text-xs">
          {formatDateTime(sale.startDate)} – {formatDateTime(sale.endDate)}
          {status === "active" && ` · ${remaining(sale.endDate, now)} kaldı`}
          {status === "upcoming" && ` · ${remaining(sale.startDate, now)} sonra başlar`}
        </span>
        {cancelled && (
          <span className="ui-muted ui-text-xs">
            İptal: {formatDateTime(sale.cancelledAt)}{sale.cancelledBy ? ` · ${sale.cancelledBy}` : ""}
          </span>
        )}
        <PerformanceLine performance={performance} status={status}
          measurable={sale.appliedPrice !== null && sale.appliedPrice !== undefined} />
      </div>
      <div className="prd-flash-actions">
        {status === "active" && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onEnd(sale)} disabled={busy}
            title="Kampanyayı şimdi bitir; ürün eski fiyatına döner">
            <Square />Bitir
          </button>
        )}
        {status === "upcoming" && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onEnd(sale)} disabled={busy}
            title="Planlı kampanyayı iptal et">
            <Ban />İptal et
          </button>
        )}
        {status === "ended" && (
          <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" onClick={() => onDelete(sale)}
            disabled={busy} aria-label="Kaydı sil" title="Kaydı sil"><Trash2 /></button>
        )}
      </div>
    </li>
  );
};

// Yöneticide bir seferde gösterilen satır; "Daha fazla göster" bir sayfa ekler. Getiri yalnızca görünen
// satırlar için ve tek istekte alınır (sunucu sınırı: istek başına 100 kampanya).
const MANAGER_PAGE = 50;
const PERFORMANCE_BATCH = 100;

/**
 * Görünen kampanyaların getirisi: GET /campaigns/performance?type=flash&ids=… Kampanya listesi yenilenince
 * (sales değişince) ya da kampanyanın durumu değişince (başladı, bitti) yeniden ölçülür; hata sessizdir.
 * @returns {(sale) => { state: "loading" | "ready" | "error", data? } | undefined}
 */
const useFlashPerformance = (sales, visible, now) => {
  const [entries, setEntries] = useState({});
  const requested = useRef(new Set());
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    requested.current = new Set();
    setEntries({});
  }, [sales]);
  useEffect(() => () => { generation.current += 1; }, []);

  const keyOf = (sale) => `${sale._id}|${flashStatus(sale, now)}`;
  const keys = visible.filter((sale) => sale?._id && flashStatus(sale, now) !== "upcoming").map(keyOf).join(",");
  useEffect(() => {
    const missing = (keys ? keys.split(",") : []).filter((key) => !requested.current.has(key));
    if (!missing.length) return;
    const gen = generation.current;
    for (const key of missing) requested.current.add(key);
    setEntries((prev) => ({ ...prev, ...Object.fromEntries(missing.map((key) => [key, { state: "loading" }])) }));
    for (let i = 0; i < missing.length; i += PERFORMANCE_BATCH) {
      const chunk = missing.slice(i, i + PERFORMANCE_BATCH);
      const ids = [...new Set(chunk.map((key) => key.split("|")[0]))];
      const settle = (pick) => {
        if (gen !== generation.current) return;
        setEntries((prev) => ({ ...prev, ...Object.fromEntries(chunk.map((key) => [key, pick(key.split("|")[0])])) }));
      };
      axios.get("/campaigns/performance", { params: { type: "flash", ids: ids.join(",") } })
        .then(({ data }) => settle((id) => (data?.items?.[id] ? { state: "ready", data: data.items[id] } : { state: "error" })))
        .catch(() => settle(() => ({ state: "error" })));
    }
  }, [keys, sales]);

  return (sale) => entries[keyOf(sale)];
};

/** Tüm kampanyaları durumlarına göre listeleyen çekmece */
export const FlashSaleManager = ({ sales, loading, now, clockSkew = 0, busyId, onClose, onEnd, onDelete, onOpenProduct, onRefresh }) => {
  const groups = useMemo(() => {
    const g = { active: [], upcoming: [], ended: [] };
    for (const sale of sales) g[flashStatus(sale, now)].push(sale);
    g.active.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    g.upcoming.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    g.ended.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
    return g;
  }, [sales, now]);
  const [tab, setTab] = useState(() => (groups.active.length ? "active" : groups.upcoming.length ? "upcoming" : "active"));
  const [limit, setLimit] = useState(MANAGER_PAGE);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector(".ui-modal-backdrop")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = groups[tab];
  const visible = list.slice(0, limit);
  const performanceOf = useFlashPerformance(sales, visible, now);
  return (
    <div className="ui-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="ui-drawer prd-drawer" role="dialog" aria-modal="true" aria-label="Flash sale kampanyaları">
        <div className="ui-drawer-head">
          <div className="prd-drawer-title">
            <h2><Zap /> Flash sale kampanyaları</h2>
            <p>Kampanyalar başlangıç saatinde otomatik açılır, bitişte ürünün eski fiyatına döner.</p>
          </div>
          <div className="ui-cluster">
            <button type="button" className="ui-icon-btn" onClick={onRefresh} aria-label="Yenile" title="Yenile">
              <RefreshCw className={loading ? "ui-spin" : ""} />
            </button>
            <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Kapat"><X /></button>
          </div>
        </div>
        <div className="ui-drawer-tabs">
          <div className="ui-segmented">
            {[["active", "Yayında"], ["upcoming", "Planlı"], ["ended", "Biten"]].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); setLimit(MANAGER_PAGE); }}>
                {label}<span className="ui-count">{groups[key].length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ui-drawer-body">
          {Math.abs(clockSkew) > 2 * 60 * 1000 && (
            <div className="ui-banner ui-banner--warn prd-flash-skew" role="status">
              <AlertTriangle />
              <span>
                Bilgisayarınızın saati sunucudan {Math.round(Math.abs(clockSkew) / 60000)} dk {clockSkew > 0 ? "geri" : "ileri"}.
                Kampanya saatleri sunucu saatine göre gösterilir.
              </span>
            </div>
          )}
          {list.length === 0 ? (
            <div className="ui-empty">
              <Zap />
              <strong>{tab === "active" ? "Şu an yayında kampanya yok" : tab === "upcoming" ? "Planlanmış kampanya yok" : "Biten kampanya yok"}</strong>
              <span className="ui-muted">Ürün satırındaki ⚡ düğmesiyle ya da toplu seçimle kampanya başlatabilirsiniz.</span>
            </div>
          ) : (
            <>
              <ul className="prd-flash-list">
                {visible.map((sale) => (
                  <FlashSaleRow key={sale._id} sale={sale} now={now} busy={busyId === sale._id}
                    onEnd={onEnd} onDelete={onDelete} onOpenProduct={onOpenProduct} performance={performanceOf(sale)} />
                ))}
              </ul>
              {list.length > visible.length && (
                <button type="button" className="ui-btn prd-flash-more" onClick={() => setLimit((value) => value + MANAGER_PAGE)}>
                  Daha fazla göster ({count(list.length - visible.length)} kampanya daha)
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};
