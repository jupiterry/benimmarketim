// Pano görünümü: dört durum sütunu (Hazırlanıyor · Yolda · Teslim edildi · İptal edildi). Sözleşme: CONTRACTS.md §7.9.
// Sürükle-bırak @hello-pangea/dnd ile (fare, dokunmatik uzun basma ve klavye: tutamaçta boşluk, oklar, boşluk / Esc);
// her kartta aynı işi yapan "Taşı" menüsü de vardır. Yerleşim (orders-board.css):
//   grid    dört sütun (≥256 px) sığıyorsa — ≥1280 px ekran: sütun gövdeleri kendi içinde kayar, başlıklar yapışkan
//   scroll  sığmıyorsa — 761–1279 px (ve kenar çubuğu açık dar masaüstü): yatay, yaslanarak kayan sütunlar
//           (sütun içi kaydırma YOK: iç içe kaydırma kapları dnd'de desteklenmez); sayfa aşağı kayınca sütun
//           başlıklarının bir kopyası üstte yapışık kalır (yatay kaydırmayla eşlenir)
//   tabs    ≤760 px: sütun sekmeleri, tek sütun, sürükleme kapalı (taşıma menüden)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { ListFilter } from "lucide-react";
import { Segmented, formatDate, money, useIsMobile } from "../admin/ui";
import BoardCard from "./BoardCard";
import { LoadOlderButton } from "./atoms";
import { COLUMN_IDS, buildStatusConfirm, isDoneStatus, moveLabel, orderCode, startOfDay, statusUi } from "./shared";
import "../../styles/orders-board.css";

/** Dört sütunun yan yana sığdığı en dar pano genişliği: 4 × 256 px + 3 × 12 px aralık */
const GRID_MIN_WIDTH = 4 * 256 + 3 * 12;

/** Ekran okuyucu için Türkçe sürükleme yönergesi (tutamacın aria-describedby metni) */
const DRAG_INSTRUCTIONS =
  "Taşımak için boşluk tuşuna basın. Taşırken sağ ve sol ok tuşlarıyla sütun değiştirin, boşluk tuşuyla bırakın, " +
  "Esc ile vazgeçin. Bazı ekran okuyucularda önce odak moduna geçmeniz gerekir. Kartın Taşı menüsü de aynı işi yapar.";

const columnName = (status) => `“${statusUi(status).label}”`;
const flag = (value) => (value ? "true" : undefined);

/** Sütun başlığı: ikon, ad, sayı, tutar toplamı (gerçek başlık ve yapışkan kopya aynı işaretlemeyi kullanır) */
const ColumnHead = ({ column, headingId, mirror = false }) => {
  const ui = statusUi(column.status);
  const Icon = ui.icon;
  const count = column.items?.length || 0;
  const Title = mirror ? "span" : "h2";
  return (
    <div className="so-b-col-head" data-tone={ui.tone}>
      <span className="so-b-col-icon" aria-hidden="true"><Icon /></span>
      <Title className="so-b-col-title" id={mirror ? undefined : headingId} tabIndex={mirror ? undefined : -1}>{column.label}</Title>
      <span className="so-b-col-count" title={`${count} sipariş`}>
        {count}{!mirror && <span className="so-sr"> sipariş</span>}
      </span>
      <span className="so-b-col-sum" title="Sütundaki siparişlerin toplam tutarı">{money(column.sum)}</span>
    </div>
  );
};

/** Bir durum sütunu: başlık + bırakma alanı (Droppable) + "+N sipariş daha" bağlantısı */
const BoardColumn = ({ column, ui, actions, now, dayNow, dragFrom, dragDisabled, onShowAll }) => {
  const { status, items = [], visible = [], hidden = 0 } = column;
  const headingId = `${COLUMN_IDS[status] || "so-col"}-title`;
  const tone = statusUi(status).tone;
  const done = isDoneStatus(status);
  const canDrop = Boolean(dragFrom) && dragFrom !== status;
  const selectedIds = ui?.selectedIds;
  return (
    <section
      className="so-b-col"
      id={COLUMN_IDS[status]}
      data-status={statusUi(status).key}
      data-tone={tone}
      aria-labelledby={headingId}
    >
      <ColumnHead column={column} headingId={headingId} />
      <Droppable droppableId={status} isDropDisabled={dragFrom === status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="so-b-col-body"
            data-target={flag(canDrop)}
            data-over={flag(snapshot.isDraggingOver)}
          >
            {visible.map((order, index) => (
              <Draggable key={order.orderId} draggableId={order.orderId} index={index} isDragDisabled={dragDisabled}>
                {(drag, dragSnapshot) => (
                  <BoardCard
                    order={order}
                    index={index}
                    now={done ? dayNow : now}
                    active={ui?.activeId === order.orderId}
                    cursor={ui?.cursorId === order.orderId}
                    selected={Boolean(selectedIds?.has(order.orderId))}
                    fresh={Boolean(ui?.freshIds?.has(order.orderId))}
                    unseen={Boolean(ui?.unseenIds?.has(order.orderId))}
                    printedAt={ui?.printedAt?.get(order.orderId)}
                    picked={ui?.picked?.get(order.orderId)}
                    actions={actions}
                    innerRef={drag.innerRef}
                    draggableProps={drag.draggableProps}
                    dragHandleProps={drag.dragHandleProps}
                    isDragging={dragSnapshot.isDragging}
                    dragDisabled={dragDisabled}
                    selecting={Boolean(ui?.selecting)}
                  />
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {items.length === 0 && (
              <p className="so-b-empty" data-drop={flag(canDrop)}>
                {canDrop || snapshot.isDraggingOver ? "Buraya bırakın" : "Sipariş yok"}
              </p>
            )}
          </div>
        )}
      </Droppable>
      {hidden > 0 && (
        <button type="button" className="so-b-col-more" onClick={() => onShowAll?.(status)}>
          <ListFilter aria-hidden="true" />
          <span>+{hidden} sipariş daha · listede gör</span>
        </button>
      )}
    </section>
  );
};

export default function BoardView({
  columns = [], ui, actions, onShowAll, mobileColumn, onMobileColumn,
  hasOlder = false, loadingOlder = false, onLoadOlder, windowStart, onDragStateChange,
}) {
  const isMobile = useIsMobile();
  // Yerleşim kipi panonun gerçek genişliğinden (kenar çubuğu açık/kapalı fark etmez); ilk boyamadan önce ölçülür
  const rootRef = useRef(null);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => { if (el.clientWidth) setWide(el.clientWidth >= GRID_MIN_WIDTH); };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const layout = isMobile ? "tabs" : wide ? "grid" : "scroll";
  const [drag, setDrag] = useState(null); // { id, from } — kaynak sütun bırakmaya kapatılır
  const now = ui?.now || Date.now();
  const dayNow = startOfDay(now);

  const byId = useMemo(() => {
    const map = new Map();
    for (const column of columns) for (const order of column.visible || []) map.set(order.orderId, order);
    return map;
  }, [columns]);
  const latest = useRef({});
  latest.current = { byId, actions, onDragStateChange };

  // Hiç sürükleme bitmeden bileşen kalkarsa konteynerin "sürükleniyor" bayrağı takılı kalmasın
  useEffect(() => () => { if (latest.current.dragging) latest.current.onDragStateChange?.(false); }, []);

  const shownColumns = useMemo(() => {
    if (!isMobile) return columns;
    const current = columns.find((column) => column.status === mobileColumn) || columns[0];
    return current ? [current] : [];
  }, [columns, isMobile, mobileColumn]);

  // ── Sürükleme yanıtlayıcıları (duyurular Türkçe) ─────────────────────
  const onBeforeCapture = useCallback((before) => {
    const order = latest.current.byId.get(before.draggableId);
    setDrag({ id: before.draggableId, from: order?.status || null });
    latest.current.dragging = true;
    latest.current.onDragStateChange?.(true);
  }, []);

  const onDragStart = useCallback((start, provided) => {
    const from = start.source.droppableId;
    setDrag((current) => (current?.id === start.draggableId && current.from === from ? current : { id: start.draggableId, from }));
    const order = latest.current.byId.get(start.draggableId);
    provided.announce(
      `${order ? orderCode(order) : "Sipariş"} taşınıyor, şu an ${columnName(from)} sütununda. ` +
      "Sağ ve sol ok tuşlarıyla sütun değiştirin, boşluk tuşuyla bırakın, Esc ile vazgeçin.",
    );
  }, []);

  const onDragUpdate = useCallback((update, provided) => {
    const from = update.source.droppableId;
    const to = update.destination?.droppableId;
    provided.announce(
      to && to !== from
        ? `${columnName(to)} sütununun üzerinde. Bırakırsanız: ${moveLabel(to, from)}.`
        : "Bırakılabilecek bir sütunun üzerinde değil; bırakırsanız sipariş yerinde kalır.",
    );
  }, []);

  const onDragEnd = useCallback((result, provided) => {
    setDrag(null);
    latest.current.dragging = false;
    // Sürüklemeyi bitiren tuş (Esc / boşluk) olayı pencereye ulaşana kadar bayrak açık kalsın:
    // konteynerin Esc → seçimi temizle / oklar → imleç kısayolları bu tuşla tetiklenmesin.
    setTimeout(() => latest.current.onDragStateChange?.(false), 0);
    const order = latest.current.byId.get(result.draggableId);
    const code = order ? orderCode(order) : "Sipariş";
    const from = result.source.droppableId;
    const to = result.destination?.droppableId;
    if (result.reason === "CANCEL") {
      provided.announce(`Taşıma iptal edildi. ${code} ${columnName(from)} sütununda kaldı.`);
      return;
    }
    if (!order || !to || to === from) {
      provided.announce(`${code} bir sütuna bırakılmadı; yerinde kaldı.`);
      return;
    }
    const needsConfirm = Boolean(buildStatusConfirm([order], to));
    provided.announce(
      needsConfirm
        ? `${code} ${columnName(to)} sütununa bırakıldı; onayınız bekleniyor.`
        : `${code} ${columnName(to)} sütununa taşındı. 5 saniye içinde geri alabilirsiniz (u).`,
    );
    const move = () => Promise.resolve(latest.current.actions?.move?.(order, to)).catch(() => {});
    // Onay gerekmiyorsa aynı anda uygulanır (iyimser katman eşzamanlı → kart geri sıçramaz). Onay gerekiyorsa
    // bir tur sonra: bırakmayı izleyen tıklama yeni açılan onay penceresinin arka planına düşüp onu kapatmasın.
    if (needsConfirm) setTimeout(move, 0);
    else move();
  }, []);

  // ── scroll kipi: yapışkan başlık kopyası (yatay kaydırmayla eşlenir) ──
  const sentinelRef = useRef(null);
  const stickRef = useRef(null);
  const rowRef = useRef(null);
  const scrollerRef = useRef(null);
  useEffect(() => {
    if (layout !== "scroll") return undefined;
    const scroller = scrollerRef.current;
    const stick = stickRef.current;
    const row = rowRef.current;
    const sentinel = sentinelRef.current;
    if (!scroller || !stick || !row || !sentinel) return undefined;
    let frame = 0;
    let stuck = null;
    const follow = () => { row.style.transform = `translate3d(${-scroller.scrollLeft}px, 0, 0)`; };
    const check = () => {
      frame = 0;
      const top = parseFloat(getComputedStyle(stick).top) || 0;
      const next = sentinel.getBoundingClientRect().top < top - 0.5;
      if (next !== stuck) {
        stuck = next;
        stick.setAttribute("data-stuck", next ? "true" : "false");
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    const onScroller = () => { follow(); schedule(); };
    follow();
    check();
    scroller.addEventListener("scroll", onScroller, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onScroller);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroller);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onScroller);
      stick.removeAttribute("data-stuck");
    };
  }, [layout]);

  const dragDisabled = isMobile;
  const since = windowStart ? formatDate(windowStart, { year: "numeric" }) : null;

  return (
    <section ref={rootRef} className="so-b" aria-label="Sipariş panosu" data-layout={layout} data-dragging={flag(drag)}>
      {isMobile && columns.length > 0 && (
        <div className="so-b-tabs">
          <Segmented
            ariaLabel="Pano sütunu"
            value={shownColumns[0]?.status}
            onChange={(status) => onMobileColumn?.(status)}
            options={columns.map((column) => ({
              value: column.status,
              label: statusUi(column.status).tab,
              count: column.items?.length || 0,
              tone: statusUi(column.status).tone,
              title: `${column.label}: ${column.items?.length || 0} sipariş`,
            }))}
          />
        </div>
      )}

      <DragDropContext
        dragHandleUsageInstructions={DRAG_INSTRUCTIONS}
        onBeforeCapture={onBeforeCapture}
        onDragStart={onDragStart}
        onDragUpdate={onDragUpdate}
        onDragEnd={onDragEnd}
      >
        <div className="so-b-board">
          <div className="so-b-sentinel" ref={sentinelRef} aria-hidden="true" />
          {!isMobile && (
            <div className="so-b-stick" ref={stickRef} aria-hidden="true">
              <div className="so-b-stick-clip">
                <div className="so-b-stick-row" ref={rowRef}>
                  {shownColumns.map((column) => <ColumnHead key={column.status} column={column} mirror />)}
                </div>
              </div>
            </div>
          )}
          <div className="so-b-scroller" ref={scrollerRef} data-count={shownColumns.length}>
            {shownColumns.map((column) => (
              <BoardColumn
                key={column.status}
                column={column}
                ui={ui}
                actions={actions}
                now={now}
                dayNow={dayNow}
                dragFrom={drag?.from || null}
                dragDisabled={dragDisabled}
                onShowAll={onShowAll}
              />
            ))}
          </div>
        </div>
      </DragDropContext>

      {hasOlder && (
        <footer className="so-b-footer">
          {since && <span className="so-b-foot-note">{since} sonrası ve tüm aktif siparişler gösteriliyor</span>}
          <LoadOlderButton hasOlder={hasOlder} loading={loadingOlder} onLoad={onLoadOlder} windowStart={windowStart} />
        </footer>
      )}
    </section>
  );
}
