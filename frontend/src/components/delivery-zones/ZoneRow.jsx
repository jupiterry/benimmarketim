// Bölge listesinin satırı: geniş ekranda tablo satırı, ≤900 px'te kart (CSS ile dönüşür).
import { memo } from "react";
import { Pencil, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { TYPES, deleteBlock, num, tl } from "./shared";

export const TypeChip = ({ type }) => {
  const info = TYPES[type] || TYPES.mahalle;
  const Icon = info.icon;
  return <span className="dz-type" data-type={type}><Icon aria-hidden="true" />{info.label}</span>;
};

const ZoneRow = memo(function ZoneRow({
  zone, index, selected, cursor, campaign, generalMinimum, onToggleSelect, onOpen, onToggleEnabled, onDelete,
}) {
  const block = deleteBlock(zone);
  const paid = zone.deliveryFee > 0;
  return (
    <div className="dz-row" role="row" data-id={zone._id} data-selected={selected || undefined} data-cursor={cursor || undefined}
      data-closed={!zone.enabled || undefined} aria-selected={selected}>
      <span className="dz-cell dz-cell--check" role="cell">
        <label className="dz-check">
          <input type="checkbox" className="ui-checkbox" checked={selected}
            onClick={(e) => onToggleSelect(zone._id, index, e.shiftKey)} onChange={() => {}} aria-label={`${zone.name} seç`} />
        </label>
      </span>

      <span className="dz-cell dz-cell--name" role="cell">
        <button type="button" className="dz-name" onClick={() => onOpen(zone)} title="Bölgeyi düzenle">
          <span className="ui-truncate">{zone.name}</span>
        </button>
        <span className="dz-sub dz-name-sub">
          <TypeChip type={zone.type} />
          {zone.legacyPoint && <span className="dz-legacy" title="Mevcut mobil uygulamadaki yurt seçeneğiyle eşlenik">Uygulamada seçenek</span>}
        </span>
      </span>

      <span className="dz-cell dz-cell--status" role="cell">
        <span className="ui-cell-label">Durum</span>
        {zone.enabled ? (
          <span className="ui-badge ui-badge--ok"><span className="ui-dot ui-dot--ok" aria-hidden="true" />Açık</span>
        ) : (
          <>
            <span className="ui-badge"><span className="ui-dot" aria-hidden="true" />Kapalı</span>
            {zone.closedReason && <span className="dz-sub dz-reason" title={zone.closedReason}>{zone.closedReason}</span>}
          </>
        )}
      </span>

      <span className="dz-cell dz-cell--fee" role="cell">
        <span className="ui-cell-label">Teslimat ücreti</span>
        {campaign ? (
          <span className="dz-fee-wrap">
            <span className="dz-fee" data-free="true">Ücretsiz</span>
            {paid && <span className="dz-sub dz-strike ui-num" title="Kampanya bitince geçerli olur">{tl(zone.deliveryFee)}</span>}
          </span>
        ) : paid ? (
          <span className="dz-fee ui-num">{tl(zone.deliveryFee)}</span>
        ) : (
          <span className="dz-fee" data-free="true">Ücretsiz</span>
        )}
      </span>

      <span className="dz-cell dz-cell--threshold" role="cell">
        <span className="ui-cell-label">Ücretsiz eşiği</span>
        {paid && zone.freeDeliveryThreshold != null ? (
          <span className="dz-main ui-num">{tl(zone.freeDeliveryThreshold)} üstü ücretsiz</span>
        ) : (
          <span className="dz-main ui-muted">{paid ? "Eşik yok" : "—"}</span>
        )}
      </span>

      <span className="dz-cell dz-cell--minimum" role="cell">
        <span className="ui-cell-label">Minimum sepet</span>
        {zone.minimumOrderAmount != null ? (
          <span className="dz-main ui-num">{zone.minimumOrderAmount === 0 ? "Minimum yok" : tl(zone.minimumOrderAmount)}</span>
        ) : (
          <span className="dz-main ui-muted ui-num">Genel{generalMinimum != null ? ` (${tl(generalMinimum)})` : ""}</span>
        )}
      </span>

      <span className="dz-cell dz-cell--eta" role="cell">
        <span className="ui-cell-label">Süre</span>
        <span className={`dz-main ui-num${zone.etaText ? "" : " ui-muted"}`}>{zone.etaText || "—"}</span>
      </span>

      <span className="dz-cell dz-cell--orders" role="cell">
        <span className="ui-cell-label">Bu ay</span>
        <span className="dz-main ui-num" title={`Toplam ${num(zone.ordersTotal)} sipariş`}>
          <strong>{num(zone.ordersThisMonth)}</strong><span className="dz-orders-unit"> sipariş</span>
        </span>
      </span>

      <span className="dz-cell dz-cell--actions" role="cell">
        <button type="button" className="ui-icon-btn ui-switch dz-switch" data-on={zone.enabled}
          role="switch" aria-checked={zone.enabled}
          onClick={() => onToggleEnabled(zone)} aria-label={`${zone.name} siparişe ${zone.enabled ? "açık; kapat" : "kapalı; aç"}`}
          title={zone.enabled ? "Siparişe kapat" : "Siparişe aç"}>
          {zone.enabled ? <ToggleRight /> : <ToggleLeft />}
        </button>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => onOpen(zone)} aria-label={`${zone.name} düzenle`} title="Düzenle">
          <Pencil />
        </button>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger" onClick={() => onDelete(zone)} disabled={Boolean(block)}
          aria-label={`${zone.name} sil`} title={block || "Bölgeyi sil"}>
          <Trash2 />
        </button>
      </span>
    </div>
  );
});

export default ZoneRow;
