// Şimdi (operasyon kuyruğu): tüm aktif siparişler sayfalanmadan iki şeritte — Hazırlanıyor ve Yolda.
// Şerit başlıkları özet + toplu eylemler; "Yurda göre grupla" açıkken şeritler yurt bölümlerine ayrılır;
// altta katlanabilir "Bugün tamamlanan". Mobilde yapışkan şerit sekmeleri, bir seferde tek şerit.
// Sözleşme: CONTRACTS.md §7.4 / §7.5. Stil: styles/orders-queue.css (önek so-q-).
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ArrowDown, CheckCheck, CheckCircle2, ChevronRight, ClipboardList, Clock, ListChecks, MapPin, PackageCheck, Printer,
  SearchX, Truck,
} from "lucide-react";
import { EmptyState, Skeleton, formatDateTime, formatTime, money, useIsMobile } from "../admin/ui";
import {
  CustomerFace, NewDot, NextStepButton, OrderCode, PaymentChip, PointChip, SelectCheck, SlaChip, StatePanel, StatusBadge,
  useStepGuard,
} from "./atoms";
import {
  LANE_IDS, completedAt, customerName, orderAriaLabel, pointGroups, statusUi, summarizeOrders,
} from "./shared";
import QueueCard from "./QueueCard";
import "../../styles/orders-queue.css";

const PREP = "Hazırlanıyor";
const ROAD = "Yolda";
const DONE = "done";
const LANE_META = {
  [PREP]: { key: "prep", title: "Hazırlanıyor", icon: Clock, empty: "Hazırlanan sipariş yok", emptyHint: "Yeni sipariş gelince burada görünür." },
  [ROAD]: { key: "road", title: "Yolda", icon: Truck, empty: "Yolda sipariş yok", emptyHint: "Yola çıkan siparişler burada görünür." },
};
const EMPTY_SET = new Set();
const EMPTY_LIST = [];
const EMPTY_MAP = new Map();
const flag = (value) => (value ? "true" : undefined);
const byOldest = (a, b) => (a.createdMs || 0) - (b.createdMs || 0);
const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const safeId = (orderId) =>
  typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(orderId)) : String(orderId).replace(/"/g, "");
const cardSelector = (orderId) => `.so-q-card[data-order-id="${safeId(orderId)}"]`;

/** "Nakit ₺245,30 · POS 2 · Havale 1 (kontrol)" — sıfır olan parçalar gösterilmez */
const PaymentParts = ({ summary, cashLabel = "Nakit", check = false }) => {
  const parts = [];
  if (summary.cash.count) {
    parts.push(<span key="cash" className="so-q-pay-part">{cashLabel} <b className="ui-num">{money(summary.cash.total)}</b></span>);
  }
  if (summary.card.count) {
    parts.push(<span key="card" className="so-q-pay-part" title="Kapıda kart (POS) ile ödenecek sipariş sayısı">POS <b className="ui-num">{summary.card.count}</b></span>);
  }
  if (summary.transfer.count) {
    parts.push(
      <span key="transfer" className="so-q-pay-part" data-tone="warn" title="Havale / EFT: ödemenin hesaba geçtiğini kontrol edin">
        Havale <b className="ui-num">{summary.transfer.count}</b>{check ? " (kontrol)" : ""}
      </span>,
    );
  }
  return parts.flatMap((part, i) => (i ? [<span key={`s${i}`} className="so-q-sep" aria-hidden="true">·</span>, part] : [part]));
};

/** Kart listesi: sıralama korunur (konteyner aciliyete göre sıralar) */
const CardList = ({ orders, ui, actions }) => (
  <div className="so-q-cards">
    {orders.map((order) => {
      const id = order.orderId;
      return (
        <QueueCard
          key={id}
          order={order}
          now={ui.now}
          active={ui.activeId === id}
          cursor={ui.cursorId === id}
          selected={ui.selectedIds.has(id)}
          fresh={ui.freshIds.has(id)}
          unseen={ui.unseenIds.has(id)}
          printedAt={ui.printedAt.get(id)}
          picked={ui.picked.get(id)}
          actions={actions}
        />
      );
    })}
  </div>
);

/** Yurt bölümü: özet, toplu seçim kutusu ve bölüm eylemleri */
const PointGroup = ({ group, status, ui, actions, laneKey }) => {
  const ids = group.orders.map((o) => o.orderId);
  const selectedCount = ids.reduce((n, id) => n + (ui.selectedIds.has(id) ? 1 : 0), 0);
  const all = ids.length > 0 && selectedCount === ids.length;
  const titleId = `so-q-${laneKey}-${group.key}`;
  const n = group.orders.length;
  const { summary } = group;
  return (
    <section className="so-q-group" aria-labelledby={titleId}>
      <div className="so-q-group-head">
        <SelectCheck
          className="so-q-group-check"
          checked={all}
          indeterminate={selectedCount > 0 && !all}
          label={`${group.label}: ${all ? "seçimi kaldır" : "tümünü seç"}`}
          onChange={(checked) => actions?.selectMany?.(ids, checked)}
        />
        <div className="so-q-group-text">
          <h3 id={titleId} className="so-q-group-title"><MapPin aria-hidden="true" />{group.label}</h3>
          <p className="so-q-group-sum">
            <span className="so-q-pay-part"><b className="ui-num">{n}</b> sipariş</span>
            <span className="so-q-sep" aria-hidden="true">·</span>
            <span className="so-q-pay-part"><b className="ui-num">{summary.units}</b> adet</span>
            {(summary.cash.count > 0 || summary.card.count > 0 || summary.transfer.count > 0) && (
              <span className="so-q-sep" aria-hidden="true">·</span>
            )}
            <PaymentParts summary={summary} check />
          </p>
        </div>
        <div className="so-q-group-actions">
          {status === PREP ? (
            <>
              <button type="button" className="ui-btn ui-btn--sm so-q-btn" data-kind="way" onClick={() => actions?.advanceMany?.(group.orders)}
                aria-label={`${group.label}: ${n} siparişin hepsini yola çıkar`}>
                <Truck aria-hidden="true" />Hepsini yola çıkar ({n})
              </button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => actions?.pickMany?.(group.orders, group.short)}
                aria-label={`${group.label}: toplama listesi`}>
                <ListChecks aria-hidden="true" />Toplama listesi
              </button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => actions?.printMany?.(group.orders)}
                aria-label={`${group.label}: ${n} fişi yazdır`}>
                <Printer aria-hidden="true" />Fişleri yazdır
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ui-btn ui-btn--sm so-q-btn" data-kind="done" onClick={() => actions?.advanceMany?.(group.orders)}
                aria-label={`${group.label}: ${n} siparişin hepsini teslim et`}>
                <CheckCircle2 aria-hidden="true" />Hepsini teslim et ({n})
              </button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => actions?.runSheet?.(group.orders, group.short)}
                aria-label={`${group.label}: kurye fişi yazdır`} title="Kurye için sipariş listesi (telefon, tutar, ödeme)">
                <ClipboardList aria-hidden="true" />Kurye fişi
              </button>
            </>
          )}
        </div>
      </div>
      <CardList orders={group.orders} ui={ui} actions={actions} />
    </section>
  );
};

/** Şerit: başlık (simge, ad, sayı, tutar, eylemler) + kartlar ya da yurt bölümleri */
const Lane = ({ status, orders, groups, total, headActions, ui, actions }) => {
  const meta = LANE_META[status];
  const Icon = meta.icon;
  const laneId = LANE_IDS[status];
  const sum = useMemo(() => summarizeOrders(orders).total, [orders]);
  const count = orders.length;
  const filteredOut = Number.isFinite(total) && total > count;
  return (
    <section id={laneId} className="so-q-lane" data-lane={meta.key} aria-labelledby={`${laneId}-title`}>
      <header className="so-q-lane-head">
        <div className="so-q-lane-title">
          <span className="so-q-lane-icon" aria-hidden="true"><Icon /></span>
          <h2 id={`${laneId}-title`} tabIndex={-1}>{meta.title}</h2>
          <span className="so-q-lane-count ui-num" data-filtered={flag(filteredOut)}
            title={filteredOut ? `Filtreye uyan ${count} · toplam ${total}` : `${count} sipariş`}>
            {filteredOut ? `${count}/${total}` : count}
            <span className="so-sr"> sipariş</span>
          </span>
          {count > 0 && (
            <span className="so-q-lane-sum ui-num" title="Şeritteki siparişlerin toplam tutarı">
              <span className="so-q-lane-sum-label">Toplam </span>{money(sum)}
            </span>
          )}
        </div>
        {headActions}
      </header>
      <div className="so-q-lane-body">
        {count === 0 ? (
          <div className="so-q-lane-empty">
            <EmptyState compact icon={status === PREP ? PackageCheck : Truck} title={meta.empty} description={meta.emptyHint} />
          </div>
        ) : groups ? (
          groups.map((group) => <PointGroup key={group.key} group={group} status={status} ui={ui} actions={actions} laneKey={meta.key} />)
        ) : (
          <CardList orders={orders} ui={ui} actions={actions} />
        )}
      </div>
    </section>
  );
};

/** Bugün tamamlanan siparişin kısa satırı (detayı açar; klavye gezinmesine katılır) */
const DoneRow = memo(function DoneRow({ order, now, active, cursor, selected, fresh, actions }) {
  const id = order.orderId;
  const at = completedAt(order);
  return (
    <div
      className="so-item so-q-done-row"
      data-order-id={id}
      data-nav="1"
      data-selected={flag(selected)}
      data-cursor={flag(cursor)}
      data-active={flag(active)}
      data-fresh={flag(fresh)}
      data-pending={flag(order.pending)}
      data-status={order.status === "İptal Edildi" ? "cancel" : "done"}
    >
      <span className="so-q-done-time ui-num" title={at ? `Tamamlandı: ${formatDateTime(at)}` : undefined}>{at ? formatTime(at) : "—"}</span>
      <CustomerFace order={order} size="sm" className="so-q-done-face" />
      <span className="so-q-done-who">
        <button
          type="button"
          className="so-open so-q-done-name"
          aria-label={orderAriaLabel(order, now)}
          aria-current={active ? "true" : undefined}
          onClick={() => actions?.open?.(order)}
        >
          {customerName(order)}
        </button>
        <OrderCode order={order} />
      </span>
      <span className="so-q-done-chips">
        <PointChip order={order} />
        <PaymentChip order={order} />
      </span>
      <span className="so-q-done-state">
        <StatusBadge status={order.status} />
        <SlaChip order={order} now={now} done />
      </span>
      <NextStepButton order={order} onAdvance={actions?.advance} onUndo={actions?.undo} size="sm" className="so-q-done-undo" />
      <strong className="so-q-done-total ui-num" data-cancelled={order.status === "İptal Edildi" ? "true" : undefined}>
        {money(order.totalAmount)}
      </strong>
    </div>
  );
});

/** "Bugün tamamlanan": katlanabilir bölüm (mobilde "Biten" sekmesinde hep açık) */
const DoneSection = ({ done, open, onToggle, forceOpen = false, hasFilter, ui, actions }) => {
  const stats = useMemo(() => {
    let delivered = 0;
    let cancelled = 0;
    let revenue = 0;
    for (const o of done) {
      if (o.status === "Teslim Edildi") {
        delivered += 1;
        revenue += Number(o.totalAmount) || 0;
      } else if (o.status === "İptal Edildi") {
        cancelled += 1;
      }
    }
    return { delivered, cancelled, revenue };
  }, [done]);
  const expanded = forceOpen || open;
  const summary = done.length ? (
    <span className="so-q-done-sum">
      <span><b className="ui-num">{stats.delivered}</b> teslim</span>
      <span className="so-q-sep" aria-hidden="true">·</span>
      <span><b className="ui-num">{stats.cancelled}</b> iptal</span>
      <span className="so-q-sep" aria-hidden="true">·</span>
      <span title="Teslim edilenlerin toplamı"><b className="ui-num">{money(stats.revenue)}</b></span>
    </span>
  ) : (
    <span className="so-q-done-sum">{hasFilter ? "Filtreye uyan yok" : "Henüz yok"}</span>
  );
  return (
    <section className="so-q-done" aria-labelledby="so-q-done-title" data-open={flag(expanded)}>
      {forceOpen ? (
        <div className="so-q-done-head">
          <CheckCircle2 className="so-q-done-icon" aria-hidden="true" />
          <h2 id="so-q-done-title" className="so-q-done-title">Bugün tamamlanan</h2>
          {summary}
        </div>
      ) : (
        <h2 className="so-q-done-h">
          <button type="button" className="so-q-done-head so-q-done-toggle" aria-expanded={expanded} aria-controls="so-q-done-list" onClick={onToggle}>
            <ChevronRight className="so-q-done-caret" aria-hidden="true" />
            <span id="so-q-done-title" className="so-q-done-title">Bugün tamamlanan</span>
            {summary}
            <span className="so-q-done-hint">{expanded ? "Gizle" : "Göster"}</span>
          </button>
        </h2>
      )}
      {expanded && (
        <div id="so-q-done-list" className="so-q-done-list">
          {done.length ? (
            done.map((order) => {
              const id = order.orderId;
              return (
                <DoneRow
                  key={id}
                  order={order}
                  now={ui.now}
                  active={ui.activeId === id}
                  cursor={ui.cursorId === id}
                  selected={ui.selectedIds.has(id)}
                  fresh={ui.freshIds.has(id)}
                  actions={actions}
                />
              );
            })
          ) : (
            <EmptyState
              compact
              icon={CheckCircle2}
              title={hasFilter ? "Filtreye uyan tamamlanan sipariş yok" : "Bugün henüz tamamlanan sipariş yok"}
              description={hasFilter ? undefined : "Teslim edilen ve iptal edilen siparişler burada listelenir."}
            />
          )}
        </div>
      )}
    </section>
  );
};

/** Yükleniyor görünümü (isteğe bağlı; konteyner genelde OrdersSkeleton çizer) */
const QueueSkeleton = () => (
  <div className="so-q so-q-skeleton" aria-busy="true" aria-label="Siparişler yükleniyor">
    <div className="so-q-lanes">
      {[PREP, ROAD].map((status) => (
        <div key={status} className="so-q-lane">
          <div className="so-q-lane-head">
            <Skeleton width="45%" height={20} />
            <Skeleton width="70%" height={12} />
          </div>
          <div className="so-q-cards">
            {[0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={10} />)}
          </div>
        </div>
      ))}
    </div>
  </div>
);

function QueueView({
  lanes, done = EMPTY_LIST, counts, ui: uiProp, actions: actionsProp, groupByPoint = false, laneFocus = PREP, onLaneFocus, doneOpen = false,
  onToggleDone, hasFilter = false, onClearFilters, query = "", loading = false,
}) {
  const isMobile = useIsMobile();
  const rootRef = useRef(null);
  const pendingJumpRef = useRef(null);
  const timersRef = useRef(new Set());

  // Görünüm genelinde tıklama koruması ve odak koruması (atoms.jsx useStepGuard)
  const actions = useStepGuard(actionsProp, rootRef);

  const prep = lanes?.prep || EMPTY_LIST;
  const road = lanes?.road || EMPTY_LIST;
  const ui = useMemo(() => ({
    now: uiProp?.now || Date.now(),
    activeId: uiProp?.activeId ?? null,
    cursorId: uiProp?.cursorId ?? null,
    selectedIds: uiProp?.selectedIds || EMPTY_SET,
    freshIds: uiProp?.freshIds || EMPTY_SET,
    unseenIds: uiProp?.unseenIds || EMPTY_SET,
    printedAt: uiProp?.printedAt || EMPTY_MAP,
    picked: uiProp?.picked || EMPTY_MAP,
  }), [uiProp]);
  const focus = laneFocus === ROAD || laneFocus === DONE ? laneFocus : PREP;

  // Yurt bölümleri (yalnızca gruplama açıkken)
  const prepGroups = useMemo(() => (groupByPoint ? pointGroups(prep) : null), [groupByPoint, prep]);
  const roadGroups = useMemo(() => (groupByPoint ? pointGroups(road) : null), [groupByPoint, road]);

  // Hazırlanıyor şeridi: görülmemişler (ekrandaki sırayla), yazdırılmamışlar (en eski önce), toplaması bitenler
  const prepShown = useMemo(() => (prepGroups ? prepGroups.flatMap((g) => g.orders) : prep), [prepGroups, prep]);
  const unseen = useMemo(() => prepShown.filter((o) => ui.unseenIds.has(o.orderId)), [prepShown, ui.unseenIds]);
  const unprinted = useMemo(() => prep.filter((o) => !ui.printedAt.get(o.orderId)).sort(byOldest), [prep, ui.printedAt]);
  const ready = useMemo(() => prep.filter((o) => ui.picked.get(o.orderId)?.complete), [prep, ui.picked]);
  const roadSummary = useMemo(() => summarizeOrders(road), [road]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  /** Kartı görünür alana getirir, açma düğmesine odaklanır ve kısa süre vurgular */
  const revealCard = useCallback((orderId) => {
    const el = rootRef.current?.querySelector(cardSelector(orderId));
    if (!el) return false;
    el.querySelector(".so-open")?.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    el.setAttribute("data-flash", "true");
    const timer = setTimeout(() => {
      el.removeAttribute("data-flash");
      timersRef.current.delete(timer);
    }, 1400);
    timersRef.current.add(timer);
    return true;
  }, []);

  const firstUnseenId = unseen[0]?.orderId || null;
  const jumpToUnseen = useCallback(() => {
    if (!firstUnseenId) return;
    if (isMobile && focus !== PREP) {
      pendingJumpRef.current = firstUnseenId;
      onLaneFocus?.(PREP);
      return;
    }
    revealCard(firstUnseenId);
  }, [firstUnseenId, isMobile, focus, onLaneFocus, revealCard]);

  // Mobilde başka sekmedeyken atlama istendiyse Hazırlık sekmesi çizildikten sonra karta git
  useEffect(() => {
    if (!pendingJumpRef.current || (isMobile && focus !== PREP)) return;
    const id = pendingJumpRef.current;
    pendingJumpRef.current = null;
    revealCard(id);
  }, [focus, isMobile, revealCard]);

  if (loading) return <QueueSkeleton />;

  const unseenCount = unseen.length;
  const jumpLabel = `İlk yeni siparişe git (${unseenCount} yeni)`;

  const prepActions = (unseenCount > 0 || unprinted.length > 0 || ready.length > 0) && (
    <div className="so-q-lane-actions">
      {unseenCount > 0 && (
        <span className="so-q-unseen" role="group" aria-label={`${unseenCount} yeni sipariş`}>
          {/* Mobilde atlama çipi yapışkan sekme çubuğundadır; burada yalnızca "{u} yeni · Gördüm" kalır */}
          {!isMobile && (
            <button type="button" className="so-q-unseen-jump" onClick={jumpToUnseen} aria-label={jumpLabel} title="İlk yeni siparişe git">
              <ArrowDown aria-hidden="true" />{unseenCount} yeni
            </button>
          )}
          <button type="button" className="so-q-unseen-seen" onClick={() => actions?.markSeen?.(unseen.map((o) => o.orderId))}
            aria-label={`${unseenCount} yeni siparişi görüldü olarak işaretle`} title="“Yeni” işaretlerini kaldır (bu cihaz)">
            <CheckCheck aria-hidden="true" />{isMobile ? <span><b className="ui-num">{unseenCount}</b> yeni · Gördüm</span> : "Gördüm"}
          </button>
        </span>
      )}
      {unprinted.length > 0 && (
        <button type="button" className="ui-btn ui-btn--sm so-q-print" onClick={() => actions?.printMany?.(unprinted)}
          aria-label={`Yazdırılmamış ${unprinted.length} fişi yazdır`} title="Bu cihazda yazdırılmamış fişleri en eskiden başlayarak yazdır">
          <Printer aria-hidden="true" />
          <span>Yazdırılmamış <b className="ui-num">{unprinted.length}</b></span>
          <span className="so-q-sep" aria-hidden="true">·</span>
          <span className="so-q-print-go">Yazdır</span>
        </button>
      )}
      {ready.length > 0 && (
        <button type="button" className="ui-btn ui-btn--sm so-q-btn" data-kind="way" onClick={() => actions?.advanceMany?.(ready)}
          aria-label={`Toplaması biten ${ready.length} siparişi yola çıkar`} title="Toplama listesinde tüm ürünleri işaretlenen siparişler">
          <Truck aria-hidden="true" />Hazır olanları yola çıkar ({ready.length})
        </button>
      )}
    </div>
  );

  const roadActions = road.length > 0 && (
    <div className="so-q-lane-actions">
      {(roadSummary.cash.count > 0 || roadSummary.card.count > 0 || roadSummary.transfer.count > 0) && (
        <p className="so-q-lane-note"><PaymentParts summary={roadSummary} cashLabel="Kapıda nakit" /></p>
      )}
      <button type="button" className="ui-btn ui-btn--sm so-q-runsheet" onClick={() => actions?.runSheet?.(road, ROAD)}
        title="Yoldaki tüm siparişler için kurye listesi (telefon, tutar, ödeme)">
        <ClipboardList aria-hidden="true" />Kurye fişi
      </button>
    </div>
  );

  const activeCount = prep.length + road.length;
  const statePanel = activeCount === 0 && (
    hasFilter ? (
      <StatePanel
        className="so-q-state"
        icon={SearchX}
        title="Aktif siparişlerde eşleşme yok"
        description={query
          ? `“${query}” aramasına uyan aktif sipariş yok. Tamamlanmış ve eski siparişler için listede arayın.`
          : "Seçili filtrelere uyan aktif sipariş yok."}
        action={(
          <>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => onClearFilters?.()}>Filtreleri temizle</button>
            <button type="button" className="ui-btn" onClick={() => actions?.showInList?.()}>{query ? "Listede ara" : "Listede gör"}</button>
          </>
        )}
      />
    ) : (
      <StatePanel
        className="so-q-state"
        icon={CheckCircle2}
        title="Şu an bekleyen sipariş yok"
        description="Yeni sipariş gelince burada görünür."
        action={<button type="button" className="ui-btn" onClick={() => actions?.showInList?.()}>Listeye git</button>}
      />
    )
  );

  const prepLane = (
    <Lane key={PREP} status={PREP} orders={prep} groups={prepGroups} total={counts?.prep} headActions={prepActions} ui={ui} actions={actions} />
  );
  const roadLane = (
    <Lane key={ROAD} status={ROAD} orders={road} groups={roadGroups} total={counts?.road} headActions={roadActions} ui={ui} actions={actions} />
  );
  const doneSection = (
    <DoneSection
      done={done}
      open={doneOpen}
      onToggle={onToggleDone}
      forceOpen={isMobile && focus === DONE}
      hasFilter={hasFilter}
      ui={ui}
      actions={actions}
    />
  );

  if (isMobile) {
    // Pano sekmeleriyle aynı kısa adlar ve etkin sekme tonu (Hazırlık = uyarı, Yolda = bilgi)
    const tabs = [
      { value: PREP, label: statusUi(PREP).tab, tone: statusUi(PREP).tone, count: prep.length },
      { value: ROAD, label: statusUi(ROAD).tab, tone: statusUi(ROAD).tone, count: road.length },
      { value: DONE, label: "Biten", count: done.length },
    ];
    return (
      <section ref={rootRef} className="so-q" data-mobile="true" aria-label="Şimdi: aktif siparişler">
        <div className="so-q-tabs">
          <div className="ui-segmented so-q-seg" role="group" aria-label="Şerit">
            {tabs.map((tab) => (
              <button key={tab.value} type="button" aria-pressed={focus === tab.value} data-tone={tab.tone} onClick={() => onLaneFocus?.(tab.value)}>
                <span className="so-q-seg-label">{tab.label}</span>
                <span className="ui-count">{tab.count}</span>
                {tab.value === PREP && unseenCount > 0 && <NewDot label={`${unseenCount} yeni sipariş`} />}
              </button>
            ))}
          </div>
          {unseenCount > 0 && (
            <button type="button" className="so-q-jump" onClick={jumpToUnseen} aria-label={jumpLabel} title="İlk yeni siparişe git">
              <ArrowDown aria-hidden="true" />{unseenCount}<span className="so-q-jump-word"> yeni</span>
            </button>
          )}
        </div>
        {focus === DONE
          ? doneSection
          : statePanel || <div className="so-q-lanes" data-single="true">{focus === ROAD ? roadLane : prepLane}</div>}
      </section>
    );
  }

  return (
    <section ref={rootRef} className="so-q" aria-label="Şimdi: aktif siparişler">
      {statePanel || (
        <div className="so-q-lanes">
          {prepLane}
          {roadLane}
        </div>
      )}
      {doneSection}
    </section>
  );
}

export default QueueView;
