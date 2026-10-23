// Şimdi görünümünün sipariş kartı (React.memo). Sözleşme: CONTRACTS.md §4 (öğe durumları, gerilmiş bağlantı) ve §7.5.
// Kartın tamamı .so-open düğmesinin ::after katmanıyla detayı açar; onay kutusu ve sonraki adım düğmesi
// bu düğmenin KARDEŞLERİDİR (iç içe etkileşimli öğe yok). Durum biçimleri (seviye şeridi, seçili, imleç,
// bekleyen, yeni) yalnızca orders.css'tedir; burada sadece data-* öznitelikleri verilir.
import { memo } from "react";
import { StickyNote } from "lucide-react";
import { money } from "../admin/ui";
import {
  AddressLine, CallbackBadge, CourierChip, CustomerFace, NextStepButton, OrderCode, PaymentChip, PickProgress, PointChip, PrintedMark,
  SelectCheck, SlaChip, TrustBadges, UnseenBadge,
} from "./atoms";
import { customerName, getSla, isAddressOrder, needsCallbackPending, orderAriaLabel, orderCode } from "./shared";
import "../../styles/orders-queue.css";

const flag = (value) => (value ? "true" : undefined);

function QueueCard({
  order, now, active = false, cursor = false, selected = false, fresh = false, unseen = false, printedAt, picked, actions,
}) {
  if (!order) return null;
  const id = order.orderId;
  const sla = getSla(order, now);
  const note = String(order.note || "").trim();
  const itemCount = Number(order.itemCount ?? order.products?.length) || 0;
  const unitCount = Number(order.unitCount) || 0;

  return (
    <article
      className="so-item so-q-card"
      data-order-id={id}
      data-nav="1"
      data-level={sla?.level}
      data-selected={flag(selected)}
      data-cursor={flag(cursor)}
      data-active={flag(active)}
      data-fresh={flag(fresh)}
      data-pending={flag(order.pending)}
      data-note={note ? "true" : undefined}
      data-addr={isAddressOrder(order) ? "true" : undefined}
      data-callback={needsCallbackPending(order) ? "true" : undefined}
    >
      <SelectCheck
        className="so-q-check"
        checked={selected}
        label={`${orderCode(order)} siparişini seç`}
        onChange={() => actions?.toggleSelect?.(id)}
      />
      <CustomerFace order={order} className="so-q-face" />

      <div className="so-q-head">
        <div className="so-q-who">
          <button
            type="button"
            className="so-open so-q-name"
            aria-label={orderAriaLabel(order, now)}
            aria-current={active ? "true" : undefined}
            onClick={() => actions?.open?.(order)}
          >
            {customerName(order)}
          </button>
          <CallbackBadge order={order} />
          <TrustBadges order={order} />
          {unseen && <UnseenBadge />}
        </div>
        <strong className="so-q-total">{money(order.totalAmount)}</strong>
      </div>

      <div className="so-q-meta">
        <OrderCode order={order} />
        <span className="so-q-count">{itemCount} ürün · {unitCount} adet</span>
        <PointChip order={order} />
        <PaymentChip order={order} />
        <CourierChip order={order} />
        <PrintedMark at={printedAt} />
        <PickProgress info={picked} />
      </div>

      <AddressLine order={order} className="so-q-addr" />

      {note && (
        <p className="so-q-note" title={note}>
          <StickyNote aria-hidden="true" />
          <span className="so-q-note-text">{note}</span>
        </p>
      )}

      <div className="so-q-side">
        <SlaChip order={order} now={now} bar size="md" />
        <NextStepButton order={order} onAdvance={actions?.advance} onUndo={actions?.undo} variant="soft" size="md" block />
      </div>
    </article>
  );
}

export default memo(QueueCard);
