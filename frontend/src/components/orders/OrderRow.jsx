// Liste görünümünün sipariş satırı (React.memo). Sözleşme: CONTRACTS.md §4 (öğe durumları, gerilmiş bağlantı) ve §7.7.
// Geniş ekranda tablo satırı (seçim | müşteri | teslimat | durum · bekleme | tutar | sonraki adım), ≤1100 px'te
// teslimat sütunu meta satırına iner, ≤760 px'te kart olur. Satırın tamamı .so-open düğmesinin ::after katmanıyla
// detayı açar; onay kutusu ve sonraki adım düğmesi bu düğmenin KARDEŞLERİDİR. Durum biçimleri (seviye şeridi, seçili,
// imleç, bekleyen, yeni) yalnızca orders.css'tedir; burada sadece data-* öznitelikleri verilir.
import { memo } from "react";
import { Archive } from "lucide-react";
import { formatTime, money } from "../admin/ui";
import {
  CustomerFace, NextStepButton, NoteChip, OrderCode, PaymentChip, PickProgress, PointChip, PrintedMark, SelectCheck, SlaChip,
  StatusBadge, TrustBadges, UnseenBadge,
} from "./atoms";
import { customerName, getSla, nextAction, orderAriaLabel, orderCode, shortWhen, statusUi } from "./shared";
import "../../styles/orders-list.css";

const flag = (value) => (value ? "true" : undefined);

/** Teslimat noktası + ödeme çipleri (geniş ekranda kendi sütununda, dar ekranda meta satırında) */
const Delivery = ({ order, className }) => (
  <span className={className}>
    <PointChip order={order} />
    <PaymentChip order={order} />
  </span>
);

/**
 * Props (CONTRACTS §7.7): order, now, active, cursor, selected, fresh, unseen, printedAt?, picked?, selecting, archived, actions.
 * ListView'in kendi verdiği ek props: dated (tarih ayırıcısı yokken saatin yanında günü de göster),
 * mobile (≤760 px: sonraki adım düğmesi tam genişlik, 44 px).
 */
function OrderRow({
  order, now, active = false, cursor = false, selected = false, fresh = false, unseen = false, printedAt, picked,
  selecting = false, archived = false, actions, dated = false, mobile = false,
}) {
  if (!order) return null;
  const id = order.orderId;
  const sla = getSla(order, now);
  const itemCount = Number(order.itemCount ?? order.products?.length) || 0;
  const created = order.createdMs ?? order.createdAt;
  const when = dated ? shortWhen(created, now) : formatTime(created);
  const showNext = !selecting && Boolean(nextAction(order.status) || order.pending);
  const label = `${orderAriaLabel(order, now)}${archived ? " (arşiv kaydı)" : ""}`;

  return (
    <div
      className="so-item so-l-row"
      data-order-id={id}
      data-nav="1"
      data-status={statusUi(order.status).key}
      data-level={sla?.level}
      data-selected={flag(selected)}
      data-cursor={flag(cursor)}
      data-active={flag(active)}
      data-fresh={flag(fresh)}
      data-pending={flag(order.pending)}
    >
      <SelectCheck
        className="so-l-check"
        checked={selected}
        label={`${orderCode(order)} siparişini seç`}
        onChange={() => actions?.toggleSelect?.(id)}
      />

      <button
        type="button"
        className="so-open so-l-main"
        aria-label={label}
        aria-current={active ? "true" : undefined}
        onClick={() => actions?.open?.(order)}
      >
        <CustomerFace order={order} />
        <span className="so-l-who">
          <span className="so-l-name">
            <span className="so-l-name-text">{customerName(order)}</span>
            <TrustBadges order={order} />
            {unseen && <UnseenBadge />}
            {archived && (
              <span className="so-chip so-l-archive" title="Son 30 günün dışında; sunucu aramasından geldi">
                <Archive aria-hidden="true" />Arşiv
              </span>
            )}
          </span>
          <span className="so-l-meta">
            <OrderCode order={order} />
            <span className="so-l-count">{itemCount} ürün</span>
            <NoteChip order={order} />
            <PrintedMark at={printedAt} />
            <PickProgress info={picked} />
            <Delivery order={order} className="so-l-meta-dlv" />
          </span>
        </span>
      </button>

      <div className="so-l-facts">
        <Delivery order={order} className="so-l-dlv" />
        <span className="so-l-state">
          <StatusBadge status={order.status} />
          <SlaChip order={order} now={now} done />
        </span>
      </div>

      <div className="so-l-amount">
        <strong className="so-l-total">{money(order.totalAmount)}</strong>
        <span className="so-l-time">{when}</span>
      </div>

      {showNext && (
        <div className="so-l-act">
          <NextStepButton
            order={order}
            onAdvance={actions?.advance}
            onUndo={actions?.undo}
            variant="soft"
            size={mobile ? "md" : "sm"}
            block={mobile}
          />
        </div>
      )}
    </div>
  );
}

export default memo(OrderRow);
