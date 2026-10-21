// Pano kartı (React.memo). Sözleşme: CONTRACTS.md §4 (öğe durumları, gerilmiş bağlantı) ve §7.10.
// Kartın tamamı .so-open düğmesinin ::after katmanıyla detayı açar. Sürükleme tutamacı, seçim kutusu, sonraki adım
// düğmesi ve "Taşı" menüsü bu düğmenin KARDEŞLERİDİR (iç içe etkileşimli öğe yok). Durum biçimleri (seviye şeridi,
// seçili, imleç, bekleyen, yeni, sürükleniyor) yalnızca orders.css'tedir; burada sadece data-* öznitelikleri verilir.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckSquare, GripVertical, MinusSquare } from "lucide-react";
import { formatDateTime, money } from "../admin/ui";
import {
  CustomerFace, MenuButton, NextStepButton, NoteChip, OrderCode, PaymentChip, PickProgress, PointChip, PrintedMark,
  SelectCheck, SlaChip, TrustBadges, UnseenBadge,
} from "./atoms";
import {
  completedAt, customerName, durationMinutes, formatMinutes, getSla, isDoneStatus, moveTargets, orderAriaLabel, orderCode,
  paymentKey, pointKey, shortWhen, statusUi,
} from "./shared";
import "../../styles/orders-board.css";

const flag = (value) => (value ? "true" : undefined);
const NO_MORE = { n: 0, label: "" };
const cssEscape = (value) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"'));
const MORE_RESERVE = 40; // "+n" rozetine ayrılan genişlik (px)

/**
 * Çip satırı tek satırdır: sığmayan çipler gizlenir ve sonda "+n" rozeti çıkar (gizlenenler rozetin
 * title'ında ve ekran okuyucu metninde). Ölçüm yalnızca çiplerin içeriği (sig) ya da satır genişliği
 * değiştiğinde yapılır; her 15 sn'lik saat vuruşunda tüm kartlar yeniden ölçülmez.
 */
const useChipOverflow = (ref, sig, enabled) => {
  const [more, setMore] = useState(NO_MORE);
  const measureRef = useRef(null);
  measureRef.current = () => {
    const box = ref.current;
    if (!box) return;
    const items = [...box.children].filter((el) => !el.classList.contains("so-b-more"));
    items.forEach((el) => el.style.removeProperty("display"));
    const right = box.getBoundingClientRect().right;
    let cut = items.length;
    const last = items[items.length - 1];
    if (last && last.getBoundingClientRect().right > right + 0.5) {
      cut = items.findIndex((el) => el.getBoundingClientRect().right > right - MORE_RESERVE + 0.5);
      if (cut < 1) cut = 1; // ilk çip (teslimat noktası) her zaman görünür
      items.slice(cut).forEach((el) => { el.style.display = "none"; });
    }
    const hidden = items.slice(cut);
    const label = hidden
      .map((el) => el.textContent.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((text) => (text.length > 80 ? `${text.slice(0, 79)}…` : text))
      .join(" · ");
    setMore((prev) => (prev.n === hidden.length && prev.label === label ? prev : { n: hidden.length, label }));
  };
  useLayoutEffect(() => {
    if (enabled) measureRef.current?.();
  }, [sig, enabled]);
  useEffect(() => {
    const box = ref.current;
    if (!enabled || !box || typeof ResizeObserver === "undefined") return undefined;
    let width = box.clientWidth;
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      measureRef.current?.();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [enabled, ref]);
  return enabled ? more : NO_MORE;
};

function BoardCard({
  order, index, now, active = false, cursor = false, selected = false, fresh = false, unseen = false, printedAt, picked,
  actions, dragHandleProps, draggableProps, innerRef, isDragging = false, dragDisabled = false, selecting = false,
}) {
  const chipsRef = useRef(null);
  const rootRef = useRef(null);
  const setRootRef = useCallback((el) => {
    rootRef.current = el;
    if (typeof innerRef === "function") innerRef(el);
    else if (innerRef) innerRef.current = el;
  }, [innerRef]);
  const done = isDoneStatus(order?.status);
  const sla = order && !done ? getSla(order, now) : null;
  const sig = order && !done
    ? [pointKey(order), paymentKey(order), order.hasNote ? 1 : 0, order.isFirstOrder ? 1 : 0,
      order.cancelBadge || 0, picked?.done || 0, picked?.total || 0, printedAt || 0].join("|")
    : "";
  const more = useChipOverflow(chipsRef, sig, Boolean(order) && !done);
  if (!order) return null;

  const id = order.orderId;
  const code = orderCode(order);
  const status = statusUi(order.status);
  const itemCount = Number(order.itemCount ?? order.products?.length) || 0;
  const doneAt = done ? completedAt(order) : null;
  const showGrip = !dragDisabled && Boolean(dragHandleProps);
  const showFoot = !done || Boolean(order.pending);
  const total = done ? durationMinutes(order, now) : null;
  const doneTitle = done
    ? [`${status.label}: ${doneAt ? formatDateTime(doneAt) : "—"}`, `Sipariş: ${formatDateTime(order.createdAt)}`,
      total !== null ? `Toplam süre: ${formatMinutes(total)}` : null].filter(Boolean).join(" · ")
    : "";

  // Menüyle taşıma: kart başka sütuna geçince eski düğmesi DOM'dan kalkar; odak kaybolmasın diye kartın yeni
  // yerindeki açma düğmesine, kart artık görünmüyorsa (mobilde tek sütun) eski sütunda aynı sıradaki karta gider.
  const moveTo = (to) => {
    const root = rootRef.current;
    const column = root?.closest(".so-b-col") || null;
    const position = column ? [...column.querySelectorAll(".so-b-card")].indexOf(root) : -1;
    Promise.resolve(actions?.move?.(order, to)).then((applied) => {
      if (!applied || typeof window === "undefined") return;
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return; // odak zaten bir yerde
        const moved = document.querySelector(`.so-b-card[data-order-id="${cssEscape(id)}"] .so-open`);
        if (moved) { moved.focus(); return; }
        if (!column?.isConnected) return;
        const opens = column.querySelectorAll(".so-b-card .so-open");
        (opens[position] || opens[position - 1] || column.querySelector(".so-b-col-title"))?.focus?.();
      });
    }).catch(() => {});
  };

  const menu = (
    <MenuButton
      iconOnly
      size="sm"
      label="Taşı"
      title="Taşı (durumu değiştir)"
      menuLabel={`${code} siparişini taşı`}
      className="so-b-menu"
      buttonProps={{ "aria-label": `${code} siparişini taşı` }}
      items={[
        { type: "label", label: "Taşı" },
        ...moveTargets(order.status).map((target) => ({
          id: target.status,
          label: target.label,
          icon: target.icon,
          danger: target.danger,
          onSelect: () => moveTo(target.status),
        })),
        { type: "divider" },
        {
          id: "select",
          label: selected ? "Seçimden çıkar" : "Seçime ekle",
          icon: selected ? MinusSquare : CheckSquare,
          onSelect: () => actions?.toggleSelect?.(id),
        },
      ]}
    />
  );

  return (
    <article
      ref={setRootRef}
      {...draggableProps}
      className="so-item so-b-card"
      data-order-id={id}
      data-index={index}
      data-nav="1"
      data-level={sla?.level}
      data-selected={flag(selected)}
      data-cursor={flag(cursor)}
      data-active={flag(active)}
      data-fresh={flag(fresh)}
      data-pending={flag(order.pending)}
      data-dragging={flag(isDragging)}
      data-done={flag(done)}
      data-grip={flag(showGrip)}
      data-foot={flag(showFoot)}
    >
      {showGrip && (
        <span
          {...dragHandleProps}
          className="so-b-grip"
          aria-label={`Taşı: ${code} — boşluk ile tut, oklarla sütun değiştir`}
          title="Sürükleyerek taşıyın"
        >
          <GripVertical aria-hidden="true" />
        </span>
      )}

      <span className="so-b-lead">
        {selecting
          ? <SelectCheck checked={selected} label={`${code} siparişini seç`} onChange={() => actions?.toggleSelect?.(id)} />
          : <CustomerFace order={order} size="sm" />}
      </span>

      <div className="so-b-head">
        <button
          type="button"
          className="so-open so-b-name"
          aria-label={orderAriaLabel(order, now)}
          aria-current={active ? "true" : undefined}
          onClick={() => actions?.open?.(order)}
        >
          {customerName(order)}
        </button>
        {unseen && <UnseenBadge />}
        <strong className="so-b-total">{money(order.totalAmount)}</strong>
      </div>

      <div className="so-b-sub">
        <OrderCode order={order} />
        <span className="so-b-sep" aria-hidden="true">·</span>
        {done ? (
          <span className="so-b-when" title={doneTitle}>{shortWhen(doneAt || order.createdAt, now)}</span>
        ) : (
          <span className="so-b-count">{itemCount} ürün</span>
        )}
        {done ? menu : <SlaChip order={order} now={now} className="so-b-sla" />}
      </div>

      {!done && (
        <div className="so-b-chips" ref={chipsRef}>
          <PointChip order={order} />
          <PaymentChip order={order} />
          <NoteChip order={order} />
          <TrustBadges order={order} />
          <PickProgress info={picked} />
          <PrintedMark at={printedAt} />
          {more.n > 0 && (
            <span className="so-chip so-b-more" title={more.label}>
              +{more.n}<span className="so-sr"> bilgi daha: {more.label}</span>
            </span>
          )}
        </div>
      )}

      {showFoot && (
        <div className="so-b-foot">
          <NextStepButton order={order} onAdvance={actions?.advance} onUndo={actions?.undo} variant="soft" size="sm" block />
          {!done && menu}
        </div>
      )}
    </article>
  );
}

export default memo(BoardCard);
