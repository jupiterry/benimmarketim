// Siparişler ekranı — konteyner (P0c). Veri useOrdersData'dan gelir; görünüm, filtre, sıralama, seçim, imleç,
// çekmece ve katman durumu burada tutulur. Görünümler (Şimdi / Liste / Pano), çekmeceler ve klavye akışı bu
// dosyada birbirine bağlanır. Sözleşme: scratchpad/orders-design/CONTRACTS.md §6.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Inbox, Package2, RefreshCw } from "lucide-react";
import {
  HANDOFF, ShortcutHelp, formatDate, isTypingTarget, money, setHandoff, takeHandoff, undoable, useDebounced, useIsMobile,
  useListShortcuts, usePref,
} from "../admin/ui";
import { useUserStore } from "../../stores/useUserStore";
import { buildOrderSummaryText, buildOrdersCsv, downloadTextFile, printReceipts, printRunSheet } from "../../lib/orderTools";
import useOrdersData from "./useOrdersData";
import OrdersHeader from "./OrdersHeader";
import OrdersKpis from "./OrdersKpis";
import OrdersToolbar from "./OrdersToolbar";
import QueueView from "./QueueView";
import ListView from "./ListView";
import BulkBar from "./BulkBar";
import BoardView from "./BoardView";
import OrderDrawer from "./OrderDrawer";
import FilterDrawer from "./FilterDrawer";
import PickingDrawer from "./PickingDrawer";
import DayCloseDrawer from "./DayCloseDrawer";
import {
  BOARD_COLUMNS, BULK_MAX, CLICK_GUARD_MS, COLUMN_IDS, DEFAULT_FILTERS, DEFAULT_PAGE_SIZE, LANE_IDS, PAGE_SIZES, SHORTCUT_ITEMS, SORTS, VIEWS,
  applySavedFilter, buildCustomerIndex, buildPickedMap, classifyHandoff, completedAt, computeKpis, computeUnseenIds, copyText,
  countAdvanced, createOrderFilter, csvFilename, customerName, customerSummary, enterAction, findByCode, hasAnyFilter, inGChord,
  isActiveStatus, isDoneStatus, isLate, isUnseenCandidate, matchesQuery, nextAction, normalizeFilters, notificationPermission,
  parseQuery, pickedStore, pointGroups, pointKey, pointLabel, printedStore, readSavedFilters, readView, seenStore, sortOrders,
  startOfDay, toSavedFilter, urgencySort, writeSavedFilters, writeView, hasZoneOrders, zoneFilterOptions,
} from "./shared";
import {
  KbdHint, LiveRegion, LoadErrorPanel, LoadOlderButton, OrdersSkeleton, StaleBanner, StatePanel, useOrdersNow,
} from "./atoms";

const PREP = "Hazırlanıyor";
const ROAD = "Yolda";
const DONE_LANE = "done";
const EMPTY_KEYS = [];
const VIEW_ORDER = VIEWS.map((v) => v.value);
const SORT_VALUES = SORTS.map((s) => s.value);
const IDLE_SEARCH = Object.freeze({ state: "idle", count: 0, query: "", ids: [] });
const POPUP_BLOCKED = "Yazdırma penceresi açılamadı. Tarayıcıda bu site için açılır pencerelere izin verin.";
const LOAD_FAILED = "Siparişler yüklenemedi";
const FLASH_MS = 1400;

const oldestFirst = (orders) => [...(orders || [])].sort((a, b) => a.createdMs - b.createdMs);
const completedMs = (order) => completedAt(order)?.getTime() ?? 0;
const sumTotal = (orders) => orders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
/** Gruplama açıkken ekrandaki sıra (Kız, Erkek, diğer bölgeler, Diğer bölümleri) — j/k gösterilenle aynı sırada gezer */
const displayOrder = (orders, grouped) => (grouped ? pointGroups(orders).flatMap((g) => g.orders) : orders);
const countStatuses = (orders) => {
  const out = { all: orders.length, active: 0, [PREP]: 0, [ROAD]: 0, "Teslim Edildi": 0, "İptal Edildi": 0 };
  for (const o of orders) {
    if (out[o.status] !== undefined) out[o.status] += 1;
    if (isActiveStatus(o.status)) out.active += 1;
  }
  return out;
};
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const itemSelector = (orderId) => `.so [data-nav="1"][data-order-id="${String(orderId).replace(/["\\]/g, "")}"]`;
/** Olayın hedefi bir kartın / satırın içindeyse o siparişin kimliği */
const itemIdOf = (target) => target?.closest?.('[data-nav="1"][data-order-id]')?.getAttribute("data-order-id") || null;
/** Kartın / satırın açma düğmesine odaklanır ve görünür alana getirir; bulunamazsa false */
const focusItem = (orderId, { scroll = true } = {}) => {
  if (!orderId) return false;
  const item = document.querySelector(itemSelector(orderId));
  const open = item?.querySelector(".so-open");
  if (!open) return false;
  open.focus({ preventScroll: true });
  if (scroll) item.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
};
/**
 * Şerit / sütunu görünür alana kaydırıp kısa süre vurgular (data-flash, orders.css); odak başlığına (tabIndex -1)
 * taşınır, klavye kullanıcısı Tab ile oradan karta devam eder
 */
const flashElement = (id, { inline = "nearest" } = {}) => {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ block: "nearest", inline, behavior: reducedMotion() ? "auto" : "smooth" });
  document.getElementById(`${id}-title`)?.focus({ preventScroll: true });
  el.removeAttribute("data-flash");
  // Aynı öğe art arda vurgulanabilsin diye animasyon bir sonraki karede yeniden başlatılır
  requestAnimationFrame(() => {
    el.setAttribute("data-flash", "true");
    setTimeout(() => el.removeAttribute("data-flash"), FLASH_MS);
  });
  return true;
};
const popupToast = () => toast.error(POPUP_BLOCKED, { id: "so-popup-blocked" });
const capToast = () => toast.error(`En fazla ${BULK_MAX} sipariş seçebilirsiniz`, { id: "so-bulk-max" });

export default function OrdersScreen() {
  const accessToken = useUserStore((state) => state.user?.accessToken);
  const data = useOrdersData({ accessToken });
  const now = useOrdersNow();
  const isMobile = useIsMobile();

  // ── Durum ───────────────────────────────────────────────────────────
  const [view, setViewState] = useState(readView);
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const qDebounced = useDebounced(filters.q, 150);
  const [sortPref, setSortPref] = usePref("admin-order-sort", "newest");
  const sort = SORT_VALUES.includes(sortPref) ? sortPref : "newest";
  const [pageSizePref, setPageSizePref] = usePref("admin-order-page-size", DEFAULT_PAGE_SIZE);
  const pageSize = PAGE_SIZES.includes(Number(pageSizePref)) ? Number(pageSizePref) : DEFAULT_PAGE_SIZE;
  const [groupPref, setGroupPref] = usePref("admin-order-group", false);
  const groupByPoint = groupPref === true;
  const [insightsPref, setInsightsPref] = usePref("admin-order-insights", false);
  const [donePref, setDonePref] = usePref("admin-order-done-open", false);
  const [page, setPage] = useState(1);
  const [laneFocus, setLaneFocus] = useState(PREP);
  const [boardColumn, setBoardColumn] = useState(PREP);
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [cursorId, setCursorId] = useState(null);
  const [layer, setLayer] = useState(null);
  const [picking, setPicking] = useState({ scope: "preparing", custom: null });
  const [printed, setPrinted] = useState(() => printedStore.read());
  const [seen, setSeen] = useState(() => seenStore.read());
  const [picked, setPicked] = useState(() => pickedStore.read());
  const [saved, setSaved] = useState(() => readSavedFilters());
  const [searchAll, setSearchAll] = useState(IDLE_SEARCH);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  const [permission, setPermission] = useState(notificationPermission);

  const searchRef = useRef(null);
  const draggingRef = useRef(false);
  const snapshotRef = useRef(null);
  const openerRef = useRef(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const searchSeqRef = useRef(0);
  const handoffRef = useRef(null);
  const implRef = useRef(null);

  const ready = data.status === "ready";
  const loading = data.status === "loading";
  const failed = data.status === "error";
  const { windowOrders, ordersById, extraIds, refresh: refreshData, searchServer } = data;

  // ── Türetilmiş listeler ─────────────────────────────────────────────
  const eff = useMemo(() => ({ ...filters, q: qDebounced }), [filters, qDebounced]);
  const unseenIds = useMemo(() => computeUnseenIds(windowOrders, { seen, printed, now }), [windowOrders, seen, printed, now]);
  const kpis = useMemo(() => (ready ? computeKpis(windowOrders, now, { unseenIds }) : null), [ready, windowOrders, now, unseenIds]);
  const pickedMap = useMemo(() => buildPickedMap(windowOrders, picked), [windowOrders, picked]);
  const customerIndex = useMemo(() => buildCustomerIndex(data.orders), [data.orders]);

  // Liste: pencere + yalnızca etkin sunucu aramasının arşiv sonuçları (arama temizlenince listeden çıkar)
  const searchQuery = qDebounced.trim();
  const searchDone = searchAll.state === "done" && searchQuery !== "" && searchAll.query === searchQuery;
  const listSource = useMemo(() => {
    if (!searchDone || !searchAll.ids.length) return windowOrders;
    const extras = searchAll.ids.map((id) => ordersById.get(id)).filter((o) => o && extraIds.has(o.orderId));
    return extras.length ? [...windowOrders, ...extras] : windowOrders;
  }, [searchDone, searchAll.ids, windowOrders, ordersById, extraIds]);
  const statusCounts = useMemo(
    () => countStatuses(listSource.filter(createOrderFilter(eff, { now, view: "list", ignore: ["status"] }))),
    [listSource, eff, now],
  );
  const list = useMemo(() => sortOrders(listSource.filter(createOrderFilter(eff, { now, view: "list" })), sort, now), [listSource, eff, now, sort]);
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageSlice = useMemo(() => list.slice((safePage - 1) * pageSize, safePage * pageSize), [list, safePage, pageSize]);

  // Şimdi: aktif siparişler aciliyete göre, bugün tamamlananlar en yeni önce
  const activeOrders = useMemo(() => windowOrders.filter((o) => isActiveStatus(o.status)), [windowOrders]);
  const lanes = useMemo(() => {
    const match = createOrderFilter(eff, { now, view: "now" });
    const prep = [];
    const road = [];
    for (const o of activeOrders) if (match(o)) (o.status === PREP ? prep : road).push(o);
    return { prep: urgencySort(prep, now), road: urgencySort(road, now) };
  }, [activeOrders, eff, now]);
  const done = useMemo(() => {
    const match = createOrderFilter(eff, { now, view: "now", ignore: ["attention"] });
    const dayStart = startOfDay(now);
    return windowOrders
      .filter((o) => isDoneStatus(o.status) && completedMs(o) >= dayStart && match(o))
      .sort((a, b) => completedMs(b) - completedMs(a));
  }, [windowOrders, eff, now]);
  const pointCounts = useMemo(() => {
    const match = createOrderFilter(eff, { now, view: "now", ignore: ["point"] });
    // Bölge anahtarına göre (eski yurt siparişinde yurt kodu; adresli siparişte bölge kimliği)
    const out = { all: 0, girlsDorm: 0, boysDorm: 0 };
    for (const o of activeOrders) {
      if (!match(o)) continue;
      out.all += 1;
      const key = pointKey(o);
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  }, [activeOrders, eff, now]);
  // Bölge seçenekleri: iki yurt her zaman; diğer bölgeler veride görüldükçe (filtre çekmecesi tümünü,
  // Şimdi çipleri yalnızca aktif siparişi olanları ve seçili olanı gösterir)
  const zonesPresent = useMemo(() => hasZoneOrders(windowOrders), [windowOrders]);
  const zoneOptions = useMemo(() => zoneFilterOptions(windowOrders, { include: [filters.point] }), [windowOrders, filters.point]);
  const pointChipOptions = useMemo(
    () => zoneOptions.filter((o) => o.value === "all" || o.value === "girlsDorm" || o.value === "boysDorm"
      || o.value === filters.point || (pointCounts[o.value] || 0) > 0),
    [zoneOptions, pointCounts, filters.point],
  );
  const lateCount = useMemo(() => {
    const match = createOrderFilter(eff, { now, view: "now", ignore: ["attention"] });
    return activeOrders.filter((o) => match(o) && isLate(o, now)).length;
  }, [activeOrders, eff, now]);

  // Pano: aktif sütunlar aciliyete, tamamlananlar tamamlanma zamanına göre
  const boardBase = useMemo(() => windowOrders.filter(createOrderFilter(eff, { now, view: "board" })), [windowOrders, eff, now]);
  const boardColumns = useMemo(() => BOARD_COLUMNS.map((column) => {
    const items = boardBase.filter((o) => o.status === column.status);
    const sorted = isActiveStatus(column.status) ? urgencySort(items, now) : items.sort((a, b) => completedMs(b) - completedMs(a));
    const visible = Number.isFinite(column.limit) ? sorted.slice(0, column.limit) : sorted;
    return { status: column.status, label: column.label, items: sorted, visible, hidden: sorted.length - visible.length, sum: sumTotal(sorted) };
  }), [boardBase, now]);

  const unprinted = useMemo(
    () => oldestFirst(windowOrders.filter((o) => o.status === PREP && !printed.has(o.orderId))),
    [windowOrders, printed],
  );

  // Klavye gezintisi: ekranda gösterilen sırayla (mobilde yalnızca görünen şerit / sütun)
  const navOrders = useMemo(() => {
    if (view === "list") return pageSlice;
    if (view === "board") {
      if (isMobile) return (boardColumns.find((c) => c.status === boardColumn) || boardColumns[0])?.visible || [];
      return boardColumns.flatMap((c) => c.visible);
    }
    const prep = displayOrder(lanes.prep, groupByPoint);
    const road = displayOrder(lanes.road, groupByPoint);
    if (isMobile) return laneFocus === ROAD ? road : laneFocus === DONE_LANE ? done : prep;
    return donePref === true ? [...prep, ...road, ...done] : [...prep, ...road];
  }, [view, pageSlice, isMobile, boardColumns, boardColumn, lanes, groupByPoint, laneFocus, done, donePref]);

  // Seçim filtre dışında kalanlar: görünümün tüm eşleşenleri (sayfalama hariç)
  const visibleIds = useMemo(() => {
    const source = view === "list" ? list : view === "board" ? boardBase : [...lanes.prep, ...lanes.road, ...done];
    return new Set(source.map((o) => o.orderId));
  }, [view, list, boardBase, lanes, done]);
  const selectedOrders = useMemo(() => [...selected].map((id) => ordersById.get(id)).filter(Boolean), [selected, ordersById]);
  const hiddenCount = selectedOrders.reduce((n, o) => n + (visibleIds.has(o.orderId) ? 0 : 1), 0);

  const resultCount = view === "list" ? list.length : view === "board" ? boardBase.length : lanes.prep.length + lanes.road.length;
  const scopeNote = data.hasOlder && data.windowStart
    ? `${formatDate(data.windowStart, { year: "numeric" })} sonrası + tüm aktif siparişler`
    : null;
  // Liste altbilgisi: sunucu aramasından gelen arşiv siparişleri gösterilirken kapsam notu bunu da söyler
  const listScopeNote = listSource !== windowOrders ? `${scopeNote || "Yüklü siparişler"} + sunucu araması` : scopeNote;

  const ui = useMemo(() => ({
    now, activeId: openId, cursorId, selectedIds: selected, freshIds: data.freshIds, unseenIds, printedAt: printed,
    picked: pickedMap, extraIds, selecting: selected.size > 0,
  }), [now, openId, cursorId, selected, data.freshIds, unseenIds, printed, pickedMap, extraIds]);

  // Detay çekmecesi: canlı kopya, yoksa son görülen kopya ("listede değil" şeridiyle)
  const liveOpen = openId ? ordersById.get(openId) || null : null;
  useEffect(() => {
    if (liveOpen) snapshotRef.current = liveOpen;
  }, [liveOpen]);
  const openOrder = openId ? liveOpen || (snapshotRef.current?.orderId === openId ? snapshotRef.current : null) : null;
  // ≥1440 px'te çekmece yer ayırır (orders.css) ve içerik daralıp yeniden dizilir: açık sipariş görünür alanda kalsın
  useEffect(() => {
    if (!openId || !window.matchMedia?.("(min-width: 1440px)").matches) return undefined;
    const raf = requestAnimationFrame(() => document.querySelector(itemSelector(openId))?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    return () => cancelAnimationFrame(raf);
  }, [openId]);
  const missing = Boolean(openId) && !liveOpen;
  const position = useMemo(() => ({ index: openId ? navOrders.findIndex((o) => o.orderId === openId) : -1, total: navOrders.length }), [navOrders, openId]);
  const nextUp = useMemo(() => lanes.prep.find((o) => o.orderId !== openId) || null, [lanes.prep, openId]);
  const customer = useMemo(() => (openOrder ? customerSummary(customerIndex, openOrder) : null), [customerIndex, openOrder]);

  // Toplama listesi kapsamı
  const pickingScope = (picking.scope === "selected" && selectedOrders.length) || (picking.scope === "custom" && picking.custom)
    ? picking.scope : "preparing";
  const preparingOrders = useMemo(() => oldestFirst(windowOrders.filter((o) => o.status === PREP)), [windowOrders]);
  const customOrders = useMemo(
    () => (picking.custom ? oldestFirst(picking.custom.ids.map((id) => ordersById.get(id)).filter(Boolean)) : []),
    [picking.custom, ordersById],
  );
  const pickingOrders = useMemo(() => {
    if (pickingScope === "selected") return oldestFirst(selectedOrders);
    if (pickingScope === "custom") return customOrders;
    return preparingOrders;
  }, [pickingScope, selectedOrders, customOrders, preparingOrders]);
  const pickingScopes = useMemo(() => [
    { value: "preparing", label: "Hazırlanıyor", count: preparingOrders.length },
    selectedOrders.length > 0 && { value: "selected", label: "Seçili", count: selectedOrders.length },
    picking.custom && { value: "custom", label: picking.custom.label, count: customOrders.length },
  ].filter(Boolean), [preparingOrders.length, selectedOrders.length, picking.custom, customOrders.length]);

  // ── Yardımcı eylemler ───────────────────────────────────────────────
  const announce = useCallback((text) => setAnnouncement({ text, at: Date.now() }), []);
  const resetSearchAll = useCallback(() => {
    searchSeqRef.current += 1;
    setSearchAll(IDLE_SEARCH);
  }, []);
  const patchFilters = useCallback((patch) => {
    if (!patch) return;
    setFilters((prev) => normalizeFilters({ ...prev, ...patch }));
    setPage(1);
    if (patch.q !== undefined) resetSearchAll();
  }, [resetSearchAll]);
  const clearFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
    setPage(1);
    resetSearchAll();
  }, [resetSearchAll]);
  /** Kullanıcının seçtiği görünüm kaydedilir; aktarımla (handoff) gelen görünüm yalnızca bu oturum için geçerlidir */
  const applyView = useCallback((next, { persist = true } = {}) => {
    if (!VIEW_ORDER.includes(next)) return;
    setViewState(next);
    if (persist) writeView(next);
    setPage(1);
    setCursorId(null);
  }, []);
  const changeView = useCallback((next) => applyView(next), [applyView]);
  const markSeen = useCallback((ids) => {
    const list = (ids || []).filter(Boolean);
    if (list.length) setSeen(seenStore.add(list));
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData({ full: true });
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);
  const openLayer = useCallback((name) => {
    setOpenId(null);
    setLayer(name);
  }, []);
  const closeLayer = useCallback(() => setLayer(null), []);
  const openPicking = useCallback((scope) => {
    setPicking((p) => ({ scope: scope || (selected.size ? "selected" : "preparing"), custom: scope === "custom" ? p.custom : null }));
    openLayer("picking");
  }, [selected.size, openLayer]);
  /**
   * scoped: pencereye bağlı dışa aktarım (Liste / Pano) → "son 30 gün + aktif" notu; note: kapsamı açıkça söyleyen not;
   * fileAt: dosya adındaki tarih (gün sonu: iş gününün başlangıcı — gece yarısından sonra da o günün adını taşır)
   */
  const exportOrders = useCallback((orders, { scoped = true, note = null, fileAt = null } = {}) => {
    if (!orders?.length) {
      toast.error("Dışa aktarılacak sipariş yok");
      return;
    }
    try {
      downloadTextFile(buildOrdersCsv(orders), csvFilename(fileAt ?? Date.now()));
    } catch (e) {
      console.error("CSV oluşturulamadı:", e);
      toast.error("CSV dosyası oluşturulamadı");
      return;
    }
    const suffix = note ? ` · ${note}` : scoped && data.hasOlder ? " · son 30 gün + aktif kapsamında" : "";
    toast.success(`${orders.length} sipariş CSV olarak indirildi${suffix}`);
  }, [data.hasOlder]);
  // Şimdi'nin kapsamı (aktifler + bugün tamamlananlar) 30 günlük pencereye bağlı değildir; tüm pencere Liste / Pano'dan
  const exportCurrent = () => {
    if (view === "now") {
      exportOrders([...lanes.prep, ...lanes.road, ...done], { scoped: false, note: "aktif + bugün tamamlananlar" });
      return;
    }
    exportOrders(view === "list" ? list : boardBase);
  };
  const requestNotifications = async () => {
    if (typeof window === "undefined" || typeof window.Notification === "undefined") return;
    try {
      const result = await window.Notification.requestPermission();
      setPermission(result);
      if (result === "granted") toast.success("Tarayıcı bildirimleri açıldı");
      else if (result === "denied") toast.error("Bildirim izni verilmedi. Tarayıcı ayarlarından açabilirsiniz.");
    } catch {
      toast.error("Bildirim izni istenemedi");
    }
  };
  const openProfile = (user) => {
    if (!user?.id || user.deleted) return;
    setHandoff(HANDOFF.user, user.id);
    window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "users" }));
  };
  const copySummary = async (order) => {
    if (!order) return;
    const ok = await copyText(buildOrderSummaryText(order));
    if (ok) toast.success("Sipariş özeti kopyalandı");
    else toast.error("Kopyalanamadı");
  };
  const undoLast = () => {
    if (!data.undoLast()) toast("Geri alınacak değişiklik yok", { id: "so-nothing-to-undo" });
  };
  const onPicked = useCallback((orderId, keys, total) => {
    setPicked(new Map(pickedStore.set(orderId, keys, total)));
  }, []);

  /** Sunucuda arama ("Tüm siparişlerde ara" ve aktarım); sonuçlar arşiv olarak listeye girer */
  const runServerSearch = useCallback(async (raw, { openSingle = false } = {}) => {
    const query = String(raw || "").trim();
    if (query.length < 2) return null;
    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    setSearchAll({ state: "loading", count: 0, query, ids: [] });
    try {
      const result = await searchServer(query);
      if (searchSeqRef.current !== seq) return null;
      setSearchAll({ state: "done", count: result.count, query, ids: result.ids });
      announce(result.count ? `Sunucuda ${result.count} sipariş bulundu` : "Sunucuda eşleşen sipariş bulunamadı");
      if (openSingle && result.ids.length === 1) implRef.current?.openById(result.ids[0]);
      return result;
    } catch {
      if (searchSeqRef.current !== seq) return null;
      setSearchAll({ state: "error", count: 0, query, ids: [] });
      announce("Sunucu araması yapılamadı");
      return null;
    }
  }, [searchServer, announce]);

  // ── Sipariş eylemleri (tek, kalıcı nesne; kartlar React.memo) ───────
  implRef.current = {
    open: (order) => {
      if (!order?.orderId) return;
      const id = order.orderId;
      if (!openId) openerRef.current = id;
      snapshotRef.current = order;
      setLayer(null);
      setOpenId(id);
      setCursorId(id);
      markSeen([id]);
    },
    openById: (id) => {
      const order = ordersById.get(id);
      if (order) implRef.current.open(order);
    },
    advance: async (order) => {
      const ok = await data.advance(order);
      if (ok) markSeen([order.orderId]);
      return ok;
    },
    undo: (order) => data.undo(order?.orderId ?? order),
    move: async (order, status) => {
      const ok = await data.changeStatus(order, status, { source: "move" });
      if (ok) markSeen([order.orderId]);
      return ok;
    },
    changeStatus: (target, to, opts) => data.changeStatus(target, to, opts),
    advanceMany: async (orders) => {
      const ok = await data.advanceMany(orders);
      if (ok) markSeen((orders || []).map((o) => o.orderId));
      return ok;
    },
    toggleSelect: (orderId) => {
      if (!orderId) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(orderId)) next.delete(orderId);
        else if (next.size >= BULK_MAX) {
          capToast();
          return prev;
        } else next.add(orderId);
        return next;
      });
    },
    selectMany: (orderIds, on) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of orderIds || []) {
          if (!on) next.delete(id);
          else if (!next.has(id)) {
            if (next.size >= BULK_MAX) {
              capToast();
              break;
            }
            next.add(id);
          }
        }
        return next;
      });
    },
    print: (order) => {
      if (!order) return false;
      let ok = false;
      try {
        ok = printReceipts([order]);
      } catch (e) {
        console.error("Fiş yazdırılamadı:", e);
        toast.error("Yazdırma sırasında hata oluştu");
        return false;
      }
      if (!ok) {
        popupToast();
        return false;
      }
      setPrinted(printedStore.mark([order.orderId]));
      markSeen([order.orderId]);
      return true;
    },
    printMany: (orders) => {
      const list = oldestFirst(orders);
      if (!list.length) return false;
      let ok = false;
      try {
        ok = printReceipts(list);
      } catch (e) {
        console.error("Toplu yazdırma hatası:", e);
        toast.error("Yazdırma sırasında hata oluştu");
        return false;
      }
      if (!ok) {
        popupToast();
        return false;
      }
      const ids = list.map((o) => o.orderId);
      setPrinted(printedStore.mark(ids));
      markSeen(ids);
      return true;
    },
    pickMany: (orders, label) => {
      const ids = (orders || []).map((o) => o.orderId);
      if (!ids.length) return;
      setPicking({ scope: "custom", custom: { ids, label: label || "Grup" } });
      openLayer("picking");
    },
    runSheet: (orders, label) => {
      const list = oldestFirst(orders);
      if (!list.length) return false;
      let ok = false;
      try {
        ok = printRunSheet(list, { title: label });
      } catch (e) {
        console.error("Kurye fişi yazdırılamadı:", e);
        toast.error("Yazdırma sırasında hata oluştu");
        return false;
      }
      if (!ok) popupToast();
      return ok;
    },
    markSeen,
    showInList: (patch) => {
      applyView("list");
      if (patch && Object.keys(patch).length) setFilters((prev) => normalizeFilters({ ...prev, ...patch }));
    },
    /** Aktarım (komut paleti, genel bakış, geri bildirim, sohbet kartı) */
    applyPreset: (preset) => {
      if (preset === "active") applyView("now", { persist: false });
      if (preset === "delayed") {
        applyView("now", { persist: false });
        setFilters((prev) => ({ ...prev, attention: "delayed" }));
      }
    },
    runHandoff: () => {
      const value = handoffRef.current;
      if (!value || data.status !== "ready") return;
      handoffRef.current = null;
      implRef.current.processHandoff(value);
    },
    processHandoff: async (value) => {
      const target = classifyHandoff(value);
      if (!target) return;
      const showSearch = (q) => {
        applyView("list", { persist: false });
        setFilters({ ...DEFAULT_FILTERS, q });
        resetSearchAll();
      };
      if (target.kind === "id") {
        const loaded = ordersById.get(target.id);
        if (loaded) {
          implRef.current.open(loaded);
          return;
        }
        const found = await data.fetchByIds([target.id]);
        const hit = found.find((o) => o.orderId === target.id) || found[0];
        if (hit) {
          implRef.current.open(hit);
          return;
        }
        toast.error("Sipariş bulunamadı");
        showSearch(target.id.slice(-6).toUpperCase());
        return;
      }
      if (target.kind === "code") {
        const matches = findByCode(data.orders, target.code);
        if (matches.length === 1) {
          implRef.current.open(matches[0]); // tek ve kesin eşleşme: görünüm ve arama değişmez
          return;
        }
        showSearch(target.code);
        if (!matches.length) runServerSearch(target.code, { openSingle: true });
        return;
      }
      const text = target.text.trim();
      showSearch(text);
      const parsed = parseQuery(text);
      const matches = parsed ? data.orders.filter((o) => matchesQuery(o, parsed)) : [];
      if (matches.length === 1) implRef.current.open(matches[0]);
      else if (!matches.length && text.length >= 3) runServerSearch(text, { openSingle: true });
    },
  };
  const actions = useMemo(() => ({
    open: (order) => implRef.current.open(order),
    advance: (order) => implRef.current.advance(order),
    undo: (order) => implRef.current.undo(order),
    move: (order, status) => implRef.current.move(order, status),
    changeStatus: (target, to, opts) => implRef.current.changeStatus(target, to, opts),
    advanceMany: (orders) => implRef.current.advanceMany(orders),
    toggleSelect: (orderId) => implRef.current.toggleSelect(orderId),
    selectMany: (orderIds, on) => implRef.current.selectMany(orderIds, on),
    print: (order) => implRef.current.print(order),
    printMany: (orders) => implRef.current.printMany(orders),
    pickMany: (orders, label) => implRef.current.pickMany(orders, label),
    runSheet: (orders, label) => implRef.current.runSheet(orders, label),
    markSeen: (ids) => implRef.current.markSeen(ids),
    showInList: (patch) => implRef.current.showInList(patch),
  }), []);

  const closeDrawer = useCallback(() => {
    const id = openId;
    setOpenId(null);
    if (!id) return;
    setCursorId(id);
    const opener = openerRef.current;
    openerRef.current = null;
    // Odak, çekmeceyi açan karta / satıra döner (j/k ile başka siparişe geçildiyse o siparişin kartına)
    requestAnimationFrame(() => {
      if (!focusItem(id)) focusItem(opener);
    });
  }, [openId]);
  const navigateDrawer = (delta) => {
    if (!navOrders.length) return;
    const index = navOrders.findIndex((o) => o.orderId === openId);
    const nextIndex = index < 0 ? (delta > 0 ? 0 : navOrders.length - 1) : Math.min(navOrders.length - 1, Math.max(0, index + delta));
    const target = navOrders[nextIndex];
    if (target && target.orderId !== openId) actions.open(target);
  };
  const deleteOrder = async (order) => {
    const index = navOrders.findIndex((o) => o.orderId === order?.orderId);
    const ok = await data.deleteOrder(order);
    if (ok && order?.orderId === openId) {
      setOpenId(null);
      openerRef.current = null;
      // Klavye kullanıcısı için imleç ve odak silinen siparişin komşusuna geçer
      const neighbour = index >= 0 ? navOrders[index + 1] || navOrders[index - 1] || null : null;
      setCursorId(neighbour?.orderId || null);
      if (neighbour) requestAnimationFrame(() => focusItem(neighbour.orderId));
    }
    return ok;
  };

  // Toplu durum: seçili siparişlerden durumu gerçekten değişecek olanlar; uygulanınca seçim bırakılır
  const bulkStatus = async (orders, to) => {
    if (!orders.length) return;
    const ok = await data.changeStatus(orders, to, { source: "bulk" });
    if (!ok) return;
    markSeen(orders.map((o) => o.orderId));
    setSelected(new Set());
    requestAnimationFrame(() => focusItem(cursorId, { scroll: false }));
  };
  const keepVisible = () => setSelected((prev) => new Set([...prev].filter((id) => visibleIds.has(id))));
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // KPI kartları: Şimdi'de şeride, Pano'da sütuna git; Liste'de durum çipini aç/kapat
  const focusStatus = (status) => {
    if (view === "list") {
      patchFilters({ status: filters.status === status ? "all" : status });
      return;
    }
    if (view === "board") {
      if (isMobile) setBoardColumn(status);
      else flashElement(COLUMN_IDS[status], { inline: "start" });
      return;
    }
    if (isMobile) setLaneFocus(status);
    else flashElement(LANE_IDS[status]);
  };
  const toggleToday = () => {
    const on = view === "list" && filters.date === "today";
    if (view !== "list") applyView("list");
    patchFilters({ date: on ? "all" : "today" });
  };

  // ── Kalıcı tercihler ve yan etkiler ─────────────────────────────────
  // Seçim ve imleç: silinen / artık yüklü olmayan siparişler düşer
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const next = new Set([...prev].filter((id) => ordersById.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setCursorId((id) => (id && !ordersById.has(id) ? null : id));
  }, [ordersById]);

  // "Yeni" işaretleri: ilk kullanımda (anahtar yok) mevcut adayların hepsi görüldü sayılır; sonra yüklü olanlara budanır
  const seenInitRef = useRef(false);
  useEffect(() => {
    if (!ready || seenInitRef.current) return;
    seenInitRef.current = true;
    const current = seenStore.read();
    if (current === null) {
      const at = Date.now();
      const initial = new Set(windowOrders.filter((o) => isUnseenCandidate(o, at)).map((o) => o.orderId));
      seenStore.write(initial);
      setSeen(initial);
      return;
    }
    const pruned = new Set([...current].filter((id) => ordersById.has(id)));
    if (pruned.size !== current.size) seenStore.write(pruned);
    setSeen(pruned);
  }, [ready, windowOrders, ordersById]);

  // Ekranlar arası aktarım: açılışta ve ekran açıkken gelen "admin-handoff" olayıyla
  useEffect(() => {
    const take = () => {
      const preset = takeHandoff(HANDOFF.orderPreset);
      if (preset) implRef.current.applyPreset(preset);
      const value = takeHandoff(HANDOFF.order);
      if (value) {
        handoffRef.current = value;
        implRef.current.runHandoff();
      }
    };
    take();
    const onHandoff = (e) => {
      const key = e.detail?.key;
      if (key === HANDOFF.order || key === HANDOFF.orderPreset) take();
    };
    window.addEventListener("admin-handoff", onHandoff);
    return () => window.removeEventListener("admin-handoff", onHandoff);
  }, []);
  useEffect(() => {
    if (ready) implRef.current.runHandoff();
  }, [ready]);

  // Yeni sipariş duyurusu (ekran okuyucu)
  const freshSeenRef = useRef(new Set());
  useEffect(() => {
    const prev = freshSeenRef.current;
    freshSeenRef.current = data.freshIds;
    const fresh = [...data.freshIds].filter((id) => !prev.has(id)).map((id) => ordersById.get(id)).filter((o) => o?.status === PREP);
    if (!fresh.length) return;
    const [first] = fresh;
    announce(fresh.length === 1
      ? `Yeni sipariş: ${customerName(first)}, ${pointLabel(first, { short: true })}, ${money(first.totalAmount)}`
      : `${fresh.length} yeni sipariş geldi`);
  }, [data.freshIds, ordersById, announce]);

  // ── Klavye ──────────────────────────────────────────────────────────
  const cursorOrder = () => (cursorId ? ordersById.get(cursorId) || null : null);
  /** Harf kısayollarının hedefi: odaktaki kart / satır, yoksa imleç (Enter'ın enterAction'ı gibi) */
  const keyTarget = (e) => {
    const id = itemIdOf(e?.target);
    return (id && ordersById.get(id)) || cursorOrder();
  };
  // İmleç odağı izler (Tab / tıklama): tek "geçerli" kart olur, e/x/p/u odaktaki siparişe uygulanır
  const onRootFocus = (e) => {
    if (draggingRef.current) return;
    const id = itemIdOf(e.target);
    if (id && ordersById.has(id)) setCursorId(id);
  };
  const moveCursor = (step) => {
    if (draggingRef.current || inGChord() || !navOrders.length) return;
    const index = cursorId ? navOrders.findIndex((o) => o.orderId === cursorId) : -1;
    const nextIndex = index < 0 ? (step > 0 ? 0 : navOrders.length - 1) : Math.min(navOrders.length - 1, Math.max(0, index + step));
    const target = navOrders[nextIndex];
    if (!target) return;
    focusItem(target.orderId);
    setCursorId(target.orderId);
  };
  // Basılı tutulan harf (otomatik tekrar) yalnızca bir kez çalışır; j/k/oklar move ile tekrarlamaya devam eder
  const letter = (fn) => (e) => {
    if (e?.repeat || draggingRef.current || inGChord(e)) return;
    fn(e);
  };
  // "e" çift basış / tıklamadan hemen sonra tuş aynı siparişi iki adım ilerletmesin (çekmece ve NextStepButton ile aynı 400 ms)
  const keyStepRef = useRef({ id: null, at: 0 });
  const advanceByKey = (e) => {
    const order = keyTarget(e);
    if (!order || !nextAction(order.status)) return;
    const at = Date.now();
    const last = keyStepRef.current;
    if (last.id === order.orderId && at - last.at < CLICK_GUARD_MS) return;
    if (order.pending && at - order.pending.at < CLICK_GUARD_MS) return;
    keyStepRef.current = { id: order.orderId, at };
    // Şimdi'de kart şerit değiştirince odaklı düğmesi DOM'dan kalkar: odak body'ye düştüyse kartın yeni yerine geçer
    Promise.resolve(actions.advance(order)).then((ok) => {
      if (!ok) return;
      requestAnimationFrame(() => {
        const current = document.activeElement;
        if (current && current !== document.body && current.isConnected) return;
        focusItem(order.orderId);
      });
    });
  };
  // Klavyeyle görünüm değişince odak sökülen karttaysa görünüm düğmesine taşınır (body'ye düşmesin)
  const switchView = (next) => {
    if (next === view) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || Boolean(active.closest?.('.so [data-nav="1"]'));
    changeView(next);
    if (lost) requestAnimationFrame(() => document.querySelector('.so [aria-label="Görünüm"] [aria-pressed="true"]')?.focus({ preventScroll: true }));
  };
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => {
      if (draggingRef.current) return;
      searchRef.current?.focus();
      searchRef.current?.select?.();
    },
    searchEscape: (e) => {
      if (e.target !== searchRef.current) return;
      if (filters.q) patchFilters({ q: "" });
      e.target.blur();
    },
    move: moveCursor,
    open: (e) => {
      if (draggingRef.current) return;
      const action = enterAction(e);
      if (action.kind === "open") {
        const order = ordersById.get(action.orderId);
        if (order) actions.open(order);
        return;
      }
      if (action.kind === "click") {
        action.el.click();
        return;
      }
      const order = cursorOrder();
      if (order) actions.open(order);
    },
    // Esc: önce seçim, sonra imleç — filtreler asla Esc ile temizlenmez
    escape: () => {
      if (draggingRef.current) return;
      if (selected.size) {
        // Odak toplu işlem çubuğundaysa çubuk kalkınca odak imleçteki karta / başlık kutusuna / ilk karta döner
        const inBar = Boolean(document.activeElement?.closest?.(".so-bulk"));
        const cursor = cursorId;
        clearSelection();
        if (inBar) {
          requestAnimationFrame(() => {
            if (focusItem(cursor, { scroll: false })) return;
            document.querySelector(".so .so-l-head .so-check input, .so .so-item .so-open")?.focus({ preventScroll: true });
          });
        }
      } else if (cursorId) setCursorId(null);
    },
    extra: {
      e: letter(advanceByKey),
      u: letter(undoLast),
      x: letter((e) => {
        const order = keyTarget(e);
        if (order) actions.toggleSelect(order.orderId);
      }),
      p: letter((e) => {
        const order = keyTarget(e);
        if (order) actions.print(order);
      }),
      y: letter((e) => {
        const order = keyTarget(e);
        if (order) actions.print(order);
      }),
      1: letter(() => switchView("now")),
      2: letter(() => switchView("list")),
      3: letter(() => switchView("board")),
      v: letter(() => switchView(VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length])),
      f: letter(() => openLayer("filters")),
      l: letter(() => openPicking()),
      r: letter(() => refresh()),
    },
  }, { enabled: !dragging });

  // "?" çekmeceler açıkken de yardımı açar (useListShortcuts açık katmanda durur; P5 "?" dinlemez)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      if (!document.querySelector(".so .ui-drawer-backdrop")) return;
      if (document.querySelector(".ui-modal-backdrop, .confirm-root, .command-palette-backdrop")) return;
      e.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setHelpOpen]);

  const onDragStateChange = useCallback((value) => {
    draggingRef.current = value;
    setDragging(value);
  }, []);

  // ── Çizim ───────────────────────────────────────────────────────────
  const hasFilterNow = hasAnyFilter(eff, view);
  const zero = ready && windowOrders.length === 0;
  const refreshButton = (
    <button type="button" className="ui-btn" onClick={refresh} disabled={refreshing}>
      <RefreshCw className={refreshing ? "ui-spin" : undefined} aria-hidden="true" />Yenile
    </button>
  );
  const zeroPanel = data.hasOlder ? (
    <StatePanel
      icon={Package2}
      title="Son 30 günde sipariş yok"
      description="Daha eski siparişleri yükleyebilirsiniz. Yeni sipariş gelince burada anında görünür."
      action={(
        <>
          <LoadOlderButton hasOlder loading={data.loadingOlder} onLoad={data.loadOlder} windowStart={data.windowStart} />
          {refreshButton}
        </>
      )}
    />
  ) : (
    <StatePanel icon={Inbox} title="Henüz sipariş yok" description="İlk sipariş geldiğinde burada anında görünür." action={refreshButton} />
  );

  let content = null;
  if (view === "now") {
    content = (
      <QueueView
        lanes={lanes}
        done={done}
        counts={{ prep: lanes.prep.length, road: lanes.road.length, done: done.length }}
        ui={ui}
        actions={actions}
        groupByPoint={groupByPoint}
        laneFocus={laneFocus}
        onLaneFocus={setLaneFocus}
        doneOpen={donePref === true}
        onToggleDone={() => setDonePref((v) => !v)}
        hasFilter={hasFilterNow}
        onClearFilters={clearFilters}
        query={qDebounced}
      />
    );
  } else if (view === "list") {
    content = (
      <ListView
        orders={pageSlice}
        total={list.length}
        page={safePage}
        pageCount={pageCount}
        onPage={setPage}
        pageSize={pageSize}
        onPageSize={(n) => {
          setPageSizePref(n);
          setPage(1);
        }}
        sort={sort}
        onSort={(v) => {
          setSortPref(v);
          setPage(1);
        }}
        ui={ui}
        actions={actions}
        hasFilter={hasFilterNow}
        onClearFilters={clearFilters}
        query={qDebounced}
        scopeNote={listScopeNote}
        hasOlder={data.hasOlder}
        loadingOlder={data.loadingOlder}
        onLoadOlder={data.loadOlder}
        windowStart={data.windowStart}
        searchAll={searchAll}
        onSearchAll={() => runServerSearch(qDebounced)}
      />
    );
  } else {
    content = (
      <BoardView
        columns={boardColumns}
        ui={ui}
        actions={actions}
        onShowAll={(status) => actions.showInList({ status })}
        mobileColumn={boardColumn}
        onMobileColumn={setBoardColumn}
        hasOlder={data.hasOlder}
        loadingOlder={data.loadingOlder}
        onLoadOlder={data.loadOlder}
        windowStart={data.windowStart}
        onDragStateChange={onDragStateChange}
      />
    );
  }

  return (
    <div className="ui-page so" data-view={view} data-selecting={selected.size ? "true" : undefined} aria-busy={loading || undefined}
      onFocus={onRootFocus}>
      <OrdersHeader
        loading={loading}
        view={view}
        onView={changeView}
        prepCount={kpis?.prep ?? 0}
        onOpenPicking={() => openPicking()}
        onRefresh={refresh}
        syncing={refreshing}
        live={{
          autoRefresh: data.autoRefresh,
          onToggle: () => data.setAutoRefresh((v) => !v),
          lastSyncAt: data.lastSyncAt,
          stale: data.stale || failed,
          now,
          onRetry: failed ? undefined : refresh, // ilk yükleme hatasında tek "Tekrar dene" hata şeridindedir
        }}
        onExportCsv={exportCurrent}
        onOpenDayClose={() => openLayer("dayclose")}
        unprintedCount={unprinted.length}
        onPrintUnprinted={() => actions.printMany(unprinted)}
        onHelp={() => setHelpOpen(true)}
        notify={{ permission, onRequest: requestNotifications }}
      />

      {ready && data.stale && <StaleBanner lastSyncAt={data.lastSyncAt} onRetry={refresh} syncing={refreshing || data.syncing} />}

      {loading && <OrdersSkeleton view={view} />}
      {failed && (
        <LoadErrorPanel onRetry={refresh} retrying={refreshing || data.syncing} message={data.error && data.error !== LOAD_FAILED ? data.error : undefined} />
      )}
      {ready && (
        <>
          <OrdersKpis
            loading={false}
            kpis={kpis}
            orders={windowOrders}
            now={now}
            active={{
              // Şimdi / Pano'da bu kartlar şeride / sütuna gider (aç/kapa değil): aria-pressed yazılmaz
              prep: view === "list" ? filters.status === PREP : undefined,
              road: view === "list" ? filters.status === ROAD : undefined,
              late: filters.attention === "delayed",
              today: view === "list" && filters.date === "today",
            }}
            onPrep={() => focusStatus(PREP)}
            onRoad={() => focusStatus(ROAD)}
            onLate={() => patchFilters({ attention: filters.attention === "delayed" ? "none" : "delayed" })}
            onToday={toggleToday}
            onDayClose={() => openLayer("dayclose")}
            insightsOpen={insightsPref === true}
            onToggleInsights={() => setInsightsPref((v) => !v)}
            pointFilter={filters.point}
            onPointFilter={(code) => patchFilters({ point: filters.point === code ? "all" : code })}
          />
          {zero ? zeroPanel : (
            <>
              <OrdersToolbar
                view={view}
                filters={filters}
                onFilters={patchFilters}
                onClear={clearFilters}
                searchRef={searchRef}
                statusCounts={statusCounts}
                pointCounts={pointCounts}
                pointOptions={pointChipOptions}
                zonesPresent={zonesPresent}
                lateCount={lateCount}
                groupByPoint={groupByPoint}
                onGroupByPoint={(next) => setGroupPref(Boolean(next))}
                sort={sort}
                onSort={(v) => {
                  setSortPref(v);
                  setPage(1);
                }}
                advancedCount={countAdvanced(filters, view, { includeDate: isMobile })}
                filtersOpen={layer === "filters"}
                onOpenFilters={() => openLayer("filters")}
                resultCount={resultCount}
                scopeNote={scopeNote}
              />
              {content}
              {/* İçeriğin altında (masaüstünde ekranın altına yapışık): ilk seçimde kartlar / satırlar kaymaz */}
              {selected.size > 0 && (
                <BulkBar
                  orders={selectedOrders}
                  hiddenCount={hiddenCount}
                  max={BULK_MAX}
                  onAdvance={(to) => bulkStatus(selectedOrders.filter((o) => o.status === (to === ROAD ? PREP : ROAD)), to)}
                  onSetStatus={(to) => bulkStatus(selectedOrders.filter((o) => o.status !== to), to)}
                  onPrint={() => actions.printMany(selectedOrders)}
                  onPicking={() => openPicking("selected")}
                  onKeepVisible={keepVisible}
                  onClear={clearSelection}
                />
              )}
              <KbdHint />
            </>
          )}
        </>
      )}

      {openOrder && (
        <OrderDrawer
          order={openOrder}
          missing={missing}
          ui={ui}
          selected={selected.has(openOrder.orderId)}
          position={position}
          nextUp={nextUp}
          customer={customer}
          changes={data.changeLog.get(openOrder.orderId) || EMPTY_KEYS}
          onDismissChanges={data.dismissChanges}
          pickedKeys={picked.get(openOrder.orderId)?.keys || EMPTY_KEYS}
          onPickedChange={onPicked}
          products={data.products}
          productsLoading={data.productsLoading}
          productsError={data.productsError}
          onLoadProducts={() => data.loadProducts({ force: Boolean(data.productsError) })}
          onClose={closeDrawer}
          onNavigate={navigateDrawer}
          onOpenOrder={actions.open}
          onUndoLast={undoLast}
          onAdvance={actions.advance}
          onUndo={actions.undo}
          onMove={actions.move}
          onPrint={actions.print}
          onDelete={deleteOrder}
          onCopySummary={copySummary}
          onToggleSelect={actions.toggleSelect}
          onSaveTracking={data.saveTracking}
          onUpdateQuantity={data.updateQuantity}
          onRemoveItem={data.removeItem}
          onAddProduct={data.addProduct}
          onAddCustom={data.addCustomItem}
          onMarkOutOfStock={data.markOutOfStock}
          onOpenProfile={openProfile}
        />
      )}
      {layer === "filters" && (
        <FilterDrawer
          filters={filters}
          pointOptions={zoneOptions}
          onChange={patchFilters}
          onClear={clearFilters}
          resultCount={resultCount}
          view={view}
          sort={sort}
          onSort={(v) => {
            setSortPref(v);
            setPage(1);
          }}
          onClose={closeLayer}
          saved={saved}
          onSave={(name) => {
            const next = [...savedRef.current, toSavedFilter(name, filters)];
            writeSavedFilters(next);
            setSaved(readSavedFilters());
          }}
          onApplySaved={(entry) => {
            setFilters((prev) => applySavedFilter(entry, prev));
            setPage(1);
          }}
          onDeleteSaved={(index) => {
            const entry = savedRef.current[index];
            if (!entry) return;
            setSaved(savedRef.current.filter((_, i) => i !== index));
            undoable({
              message: `“${entry.name}” filtresi silindi`,
              commit: () => writeSavedFilters(savedRef.current),
              undo: () => {
                const restored = [...savedRef.current];
                restored.splice(Math.min(index, restored.length), 0, entry);
                writeSavedFilters(restored);
                setSaved(restored);
              },
            });
          }}
        />
      )}
      {layer === "picking" && (
        <PickingDrawer
          orders={pickingOrders}
          scope={pickingScope}
          scopes={pickingScopes}
          onScope={(scope) => setPicking((p) => ({ ...p, scope }))}
          onClose={closeLayer}
          picked={picked}
          onPicked={onPicked}
        />
      )}
      {layer === "dayclose" && (
        <DayCloseDrawer
          orders={windowOrders}
          now={now}
          onClose={closeLayer}
          onOpenOrder={actions.open}
          onExportCsv={(orders, opts) => exportOrders(orders, { scoped: false, fileAt: opts?.dayStart ?? null })}
        />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={SHORTCUT_ITEMS} />
      <LiveRegion message={announcement} />
    </div>
  );
}
