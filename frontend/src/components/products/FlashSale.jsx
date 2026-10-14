import { useEffect, useMemo, useState } from "react";
import { X, Zap, Square, Trash2, Package, RefreshCw } from "lucide-react";
import {
  DURATIONS, flashStatus, formatDateTime, localInputToIso, money, remaining, roundMoney, toLocalInput
} from "./productUtils";

const QUICK_PCTS = [10, 15, 20, 25, 30, 40];

/**
 * Flash sale formu. Tarihler yerel saatle girilir, sunucuya ISO (saat dilimli) gider.
 * `products` önizleme içindir: tek ürünse eski → yeni fiyat gösterilir.
 */
export const FlashSaleForm = ({ products = [], busy, submitLabel = "Flash sale başlat", onSubmit, onCancel }) => {
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

  const single = products.length === 1 ? products[0] : null;

  const submit = (e) => {
    e.preventDefault();
    if (error || busy) return;
    onSubmit({
      discountPercentage: roundMoney(pctNum),
      startDate: startMode === "now" ? new Date().toISOString() : localInputToIso(start),
      endDate: endDate.toISOString(),
    });
  };

  return (
    <form className="prd-flash-form" onSubmit={submit}>
      <div className="prd-form-row">
        <label className="ui-label" htmlFor="prd-flash-pct">İndirim oranı</label>
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
          <span>{products.length > 1 ? `${products.length} ürüne ayrı ayrı uygulanır` : ""}</span>
        )}
        {datesValid && (
          <span className="ui-muted">
            {startMode === "now" ? "Şimdi" : formatDateTime(startDate)} – {formatDateTime(endDate)}
          </span>
        )}
      </div>

      {error && <p className="prd-form-error" role="alert">{error}</p>}

      <div className="prd-form-actions">
        {onCancel && <button type="button" className="ui-btn" onClick={onCancel}>Vazgeç</button>}
        <button type="submit" className="ui-btn ui-btn--primary" disabled={Boolean(error) || busy}>
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

/** Tek kampanya satırı (çekmecede ve yöneticide ortak) */
export const FlashSaleRow = ({ sale, now, onEnd, onDelete, onOpenProduct, showProduct = true, busy }) => {
  const status = flashStatus(sale, now);
  const product = typeof sale.product === "object" ? sale.product : null;
  const price = product ? Number(product.price) : null;
  return (
    <li className="prd-flash-row" data-status={status}>
      {showProduct && (
        <button type="button" className="ui-thumb prd-flash-thumb" onClick={() => product && onOpenProduct?.(product._id)}
          aria-label={product ? `${product.name} ürününü aç` : "Ürün silinmiş"}>
          {product?.image ? <img src={product.thumbnail || product.image} alt="" loading="lazy" /> : <Package />}
        </button>
      )}
      <div className="prd-flash-main">
        {showProduct && <strong className="ui-truncate">{product?.name || "Silinmiş ürün"}</strong>}
        <span className="prd-flash-meta">
          <span className={`ui-badge ${STATUS_TONE[status] ? `ui-badge--${STATUS_TONE[status]}` : ""}`}>{STATUS_LABEL[status]}</span>
          <span className="prd-flash-pct">%{sale.discountPercentage}</span>
          {price != null && <span>{money(price * (1 - sale.discountPercentage / 100))}</span>}
        </span>
        <span className="ui-muted ui-text-xs">
          {formatDateTime(sale.startDate)} – {formatDateTime(sale.endDate)}
          {status === "active" && ` · ${remaining(sale.endDate, now)} kaldı`}
          {status === "upcoming" && ` · ${remaining(sale.startDate, now)} sonra başlar`}
        </span>
      </div>
      <div className="prd-flash-actions">
        {status !== "ended" && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onEnd(sale)} disabled={busy}>
            <Square />{status === "active" ? "Bitir" : "İptal"}
          </button>
        )}
        <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" onClick={() => onDelete(sale)}
          disabled={busy} aria-label="Kaydı sil" title="Kaydı sil"><Trash2 /></button>
      </div>
    </li>
  );
};

/** Tüm kampanyaları durumlarına göre listeleyen çekmece */
export const FlashSaleManager = ({ sales, loading, now, busyId, onClose, onEnd, onDelete, onOpenProduct, onRefresh }) => {
  const groups = useMemo(() => {
    const g = { active: [], upcoming: [], ended: [] };
    for (const sale of sales) g[flashStatus(sale, now)].push(sale);
    g.active.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    g.upcoming.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    g.ended.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
    return g;
  }, [sales, now]);
  const [tab, setTab] = useState(() => (groups.active.length ? "active" : groups.upcoming.length ? "upcoming" : "active"));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector(".ui-modal-backdrop")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = groups[tab];
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
              <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
                {label}<span className="ui-count">{groups[key].length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ui-drawer-body">
          {list.length === 0 ? (
            <div className="ui-empty">
              <Zap />
              <strong>{tab === "active" ? "Şu an yayında kampanya yok" : tab === "upcoming" ? "Planlanmış kampanya yok" : "Biten kampanya yok"}</strong>
              <span className="ui-muted">Ürün satırındaki ⚡ düğmesiyle ya da toplu seçimle kampanya başlatabilirsiniz.</span>
            </div>
          ) : (
            <ul className="prd-flash-list">
              {list.map((sale) => (
                <FlashSaleRow key={sale._id} sale={sale} now={now} busy={busyId === sale._id}
                  onEnd={onEnd} onDelete={onDelete} onOpenProduct={onOpenProduct} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
};
