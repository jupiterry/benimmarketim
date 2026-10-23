// Pasif hesap temizliği: uzun süredir gelmeyen ve hiç etkinlik kaydı olmayan müşteri hesaplarını listeler ve
// silmeye izin verir. Yalnızca hesap silinir; siparişler (userDeleted işaretiyle), ciro ve geri bildirimler kalır.
// Tüm sayılar sunucuda, tüm müşteri koleksiyonu üzerinden hesaplanır (GET /account-cleanup/summary, /users, /ids);
// istemci sayfa verisinden sayı türetmez. Silme 50'şerlik parçalarla POST /account-cleanup/delete ile yapılır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckSquare, ChevronLeft, ChevronRight, Clock, Download, Ghost, Keyboard, Loader2, PackageCheck, RefreshCw,
  Search, ShieldCheck, Trash2, UserCheck, UserX, Users, X,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import {
  EmptyState, HANDOFF, KpiCard, KpiGrid, PageHeader, Segmented, ShortcutHelp, SkeletonBlock, SkeletonCards, SkeletonRows, SortHead, Tabs,
  compactMoney, formatTime, setHandoff, useDebounced, useListShortcuts, useNow, usePref,
} from "./admin/ui";
import CleanupRow from "./account-cleanup/CleanupRow";
import DeleteDialog from "./account-cleanup/DeleteDialog";
import Distribution from "./account-cleanup/Distribution";
import {
  DEFAULT_PAGE_SIZE, DEFAULT_SORT, FIRST_DIR, MONTH_OPTIONS, PAGE_SIZES, SEARCH_MAX, SORTS, addMonths, blobErrorMessage, errorMessage, filenameFrom,
  longDate, normalizeMonths, num, pct,
} from "./account-cleanup/shared";
import "../styles/account-cleanup.css";

const EMPTY = new Set();
/** Sunucu alanı gerçekten bir sayı mı (undefined/null/"" → hayır; Number(null) 0 olduğu için ayrıca bakılır) */
const isCount = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const SHORTCUT_ITEMS = [
  [["x"], "Satırı seç / bırak"], [["⇧", "tık"], "Aralık seç"], [["Del"], "Seçilenleri sil"],
  [["←", "→"], "Önceki / sonraki sayfa"], [["e"], "Listeyi CSV indir"], [["r"], "Yenile"],
];
const ORDER_FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "with", label: "Siparişi olan" },
  { value: "without", label: "Siparişi olmayan" },
];

/** Klavyeyle seçilen satırı görünür alana getirir: yapışkan tablo başlığının altında, seçim çubuğunun üstünde kalsın */
const revealRow = (el) => {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const top = (parseFloat(getComputedStyle(el).getPropertyValue("--app-top")) || 52) + 48;
  const bottom = window.innerHeight - 96;
  if (rect.top < top) window.scrollBy({ top: rect.top - top });
  else if (rect.bottom > bottom) window.scrollBy({ top: rect.bottom - bottom });
};

/** 1, 2, …, n sayfa düğmeleri (kısaltılmış) */
const pageList = (page, pages) => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => set.add(p));
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
};

const AccountCleanupTab = ({ onAccountsDeleted }) => {
  const now = useNow(60000);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const headCheckRef = useRef(null);
  const rowCache = useRef(new Map()); // id → sunucudan gelen son satır (onay penceresindeki kesin sipariş toplamı için)
  const lastToggle = useRef(-1);

  // ── Süzgeçler ──
  const [monthsPref, setMonthsPref] = usePref("ac-months", 10);
  const months = normalizeMonths(monthsPref);
  const [segment, setSegment] = usePref("ac-segment", "inactive");
  const seg = segment === "never" ? "never" : "inactive";
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim().slice(0, SEARCH_MAX), 300);
  const [orders, setOrders] = useState("all");
  const [source, setSource] = useState("all");
  const [sortPref, setSortPref] = usePref("ac-sort", DEFAULT_SORT);
  const sortValue = SORTS.some((s) => s.value === sortPref?.[seg] && (!s.segments || s.segments.includes(seg))) ? sortPref[seg] : DEFAULT_SORT[seg];
  const [sortKey, sortDir] = sortValue.split(":");
  const [limitPref, setLimitPref] = usePref("ac-limit", DEFAULT_PAGE_SIZE);
  const limit = PAGE_SIZES.includes(Number(limitPref)) ? Number(limitPref) : DEFAULT_PAGE_SIZE;
  const effOrders = seg === "inactive" ? orders : "all";
  const effSource = seg === "inactive" ? source : "all";
  const filterParams = useMemo(() => ({ segment: seg, months, q: search, orders: effOrders, source: effSource }), [seg, months, search, effOrders, effSource]);
  const filterKey = JSON.stringify(filterParams);
  const hasFilter = Boolean(search || effOrders !== "all" || effSource !== "all");

  // Süzgeç değişince sayfa 1'e ve seçim boşa döner (anahtar eşleşmezse türetilmiş değer sıfırdır; fazladan istek olmaz)
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = useCallback((p) => setPageState({ key: filterKey, page: Math.max(1, p) }), [filterKey]);
  const [selState, setSelState] = useState({ key: filterKey, ids: EMPTY });
  const selected = selState.key === filterKey ? selState.ids : EMPTY;
  const setSelected = useCallback((next) => setSelState((cur) => {
    const base = cur.key === filterKey ? cur.ids : EMPTY;
    return { key: filterKey, ids: typeof next === "function" ? next(base) : next };
  }), [filterKey]);

  const [reload, setReload] = useState(0);

  // ── Özet ──
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    setSummaryLoading(true);
    axios.get("/account-cleanup/summary", { params: { months }, signal: ctrl.signal })
      .then((res) => { setSummary(res.data); setSummaryError(null); })
      .catch((e) => { if (!ctrl.signal.aborted) setSummaryError(errorMessage(e, "Özet yüklenemedi")); })
      .finally(() => { if (!ctrl.signal.aborted) setSummaryLoading(false); });
    return () => ctrl.abort();
  }, [months, reload]);

  // ── Liste ──
  const listParams = useMemo(() => ({ ...filterParams, sort: sortKey, dir: sortDir, page, limit }), [filterParams, sortKey, sortDir, page, limit]);
  const listKey = JSON.stringify(listParams);
  const [list, setList] = useState(null); // { users, total, page, pages, limit, segment, months, key }
  const [listError, setListError] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    setListLoading(true);
    axios.get("/account-cleanup/users", { params: JSON.parse(listKey), signal: ctrl.signal })
      .then((res) => {
        const data = res.data || {};
        const users = Array.isArray(data.users) ? data.users : [];
        for (const u of users) rowCache.current.set(String(u._id), u);
        setList({ ...data, users, key: listKey });
        setListError(null);
      })
      .catch((e) => { if (!ctrl.signal.aborted) setListError(errorMessage(e, "Liste yüklenemedi")); })
      .finally(() => { if (!ctrl.signal.aborted) setListLoading(false); });
    return () => ctrl.abort();
  }, [listKey, reload]);
  // Silmeden sonra sayfa sayısı azaldıysa son sayfaya geç
  useEffect(() => {
    if (list && list.pages > 0 && page > list.pages) setPage(list.pages);
  }, [list, page, setPage]);

  const listMatches = list?.segment === undefined || list.segment === seg; // eski sekmenin verisi bir an görünmesin
  const rows = useMemo(() => (listMatches ? list?.users || [] : []), [list, listMatches]);
  const total = Number(list?.total) || 0;
  const pages = Math.max(1, Number(list?.pages) || 1);
  const stale = listLoading && list?.key !== listKey;

  // ── Eşleşen silinebilir kimlikler ("eşleşen tümünü seç" için; yalnızca seçim varken istenir) ──
  const [idsInfo, setIdsInfo] = useState(null); // { key, ids, total, deletable, blocked }
  const idsKey = `${filterKey}#${reload}`;
  const needIds = selected.size > 0;
  useEffect(() => {
    if (!needIds || idsInfo?.key === idsKey) return undefined;
    const ctrl = new AbortController();
    axios.get("/account-cleanup/ids", { params: JSON.parse(filterKey), signal: ctrl.signal })
      .then((res) => {
        const d = res.data || {};
        setIdsInfo({ key: idsKey, ids: Array.isArray(d.ids) ? d.ids.map(String) : [], total: Number(d.total) || 0, deletable: Number(d.deletable ?? d.ids?.length) || 0, blocked: Number(d.blocked) || 0, ordersPreserved: d.ordersPreserved, revenuePreserved: d.revenuePreserved, withOrders: d.withOrders });
      })
      .catch((e) => { if (!ctrl.signal.aborted) setIdsInfo({ key: idsKey, error: errorMessage(e, "Eşleşen hesaplar alınamadı"), ids: [] }); });
    return () => ctrl.abort();
  }, [needIds, idsKey, filterKey, idsInfo?.key]);
  const ids = idsInfo?.key === idsKey ? idsInfo : null;
  const allMatchingSelected = Boolean(ids && ids.ids.length > 0 && selected.size === ids.ids.length && ids.ids.every((id) => selected.has(id)));

  // ── Seçim ──
  const deletableRows = useMemo(() => rows.filter((u) => u.deletable), [rows]);
  const pageSelectedCount = deletableRows.filter((u) => selected.has(String(u._id))).length;
  const allPageSelected = deletableRows.length > 0 && pageSelectedCount === deletableRows.length;
  useEffect(() => {
    if (headCheckRef.current) headCheckRef.current.indeterminate = pageSelectedCount > 0 && !allPageSelected;
  }, [pageSelectedCount, allPageSelected]);

  const toggle = useCallback((id, index, shift) => {
    const key = String(id);
    const anchor = lastToggle.current; // güncelleyici sonra çalışır; çapa şimdiden okunur
    setSelected((cur) => {
      const next = new Set(cur);
      if (shift && anchor >= 0 && anchor !== index) {
        const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)];
        const on = !cur.has(key);
        for (const u of rows.slice(a, b + 1)) {
          if (!u.deletable) continue;
          if (on) next.add(String(u._id)); else next.delete(String(u._id));
        }
      } else if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    lastToggle.current = index;
  }, [rows, setSelected]);
  const togglePage = () => setSelected((cur) => {
    const next = new Set(cur);
    for (const u of deletableRows) {
      if (allPageSelected) next.delete(String(u._id)); else next.add(String(u._id));
    }
    return next;
  });
  const clearSelection = useCallback(() => { setSelected(EMPTY); lastToggle.current = -1; }, [setSelected]);
  useEffect(() => { lastToggle.current = -1; }, [listKey]); // Shift ile aralık seçimi yalnızca aynı sayfada

  // ── Süzgeç eylemleri ──
  const changeMonths = (m) => { setMonthsPref(m); clearSelection(); };
  const changeSegment = (s) => { setSegment(s); setCursor(-1); };
  const clearFilters = () => { setQuery(""); setOrders("all"); setSource("all"); };
  const onSort = (key) => {
    const next = key === sortKey ? `${key}:${sortDir === "asc" ? "desc" : "asc"}` : `${key}:${FIRST_DIR[key] || "asc"}`;
    setSortPref((cur) => ({ ...DEFAULT_SORT, ...(cur || {}), [seg]: next }));
    setPage(1);
  };
  const onSortSelect = (value) => { setSortPref((cur) => ({ ...DEFAULT_SORT, ...(cur || {}), [seg]: value })); setPage(1); };

  const refreshAll = useCallback(() => setReload((r) => r + 1), []);

  // ── Profil (Müşteriler ekranında açılır) ──
  const openProfile = useCallback((user) => {
    setHandoff(HANDOFF.user, user._id);
    window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "users" }));
  }, []);

  // ── Silme ──
  const [dialog, setDialog] = useState(null); // { ids, preserved, segment, months, fromSelection, target }
  // Onay penceresindeki "korunacak sipariş" yalnızca kesin biliniyorsa gösterilir (tahmin yok):
  // · "Etkinlik kaydı yok" ve "Siparişi olmayan" listelerinde tanım gereği sipariş yoktur;
  // · eşleşenlerin tümü seçiliyse /ids yanıtındaki sunucu toplamı (varsa); süzgeçsiz pasif listede özet kartındaki toplam birebir aynıdır;
  // · aksi halde seçilen her hesabın sunucudan gelen satırı biliniyorsa onların toplamı; biri bile bilinmiyorsa sayı silme sonunda raporlanır.
  const preservedFor = useCallback((idList) => {
    if (seg === "never" || effOrders === "without") return { orders: 0, revenue: 0, withOrders: 0 };
    if (ids && allMatchingSelected && idList.length === ids.ids.length && isCount(ids.ordersPreserved)) {
      return { orders: Number(ids.ordersPreserved), revenue: Number(ids.revenuePreserved) || 0, withOrders: isCount(ids.withOrders) ? Number(ids.withOrders) : null };
    }
    const st = summary?.totals;
    if (ids && allMatchingSelected && idList.length === ids.ids.length && !hasFilter && st && Number(summary.months) === months
      && Number(st.inactiveDeletable) === ids.ids.length && Number.isFinite(Number(st.ordersPreserved))) {
      return { orders: Number(st.ordersPreserved), revenue: Number(st.revenuePreserved) || 0, withOrders: Number(st.candidatesWithOrders) || 0 };
    }
    let ordersSum = 0;
    let revenue = 0;
    let withOrders = 0;
    for (const id of idList) {
      const row = rowCache.current.get(String(id));
      if (!row) return null; // satırı hiç görülmemiş hesap var: kesin sayı silme sonunda raporlanır
      const n = Number(row.orderCount) || 0;
      ordersSum += n;
      revenue += Number(row.totalSpent) || 0;
      if (n > 0) withOrders += 1;
    }
    return { orders: ordersSum, revenue, withOrders };
  }, [seg, effOrders, ids, allMatchingSelected, summary, hasFilter, months]);
  // fromSelection: pencere seçim çubuğundan mı açıldı (satırdaki çöp kutusu seçime dokunmaz).
  // target: tek hesap siliniyorsa kim olduğu (ad, e-posta, telefon) onay penceresinde gösterilir.
  const openDelete = useCallback((idList, { fromSelection = false, user = null } = {}) => {
    if (!idList.length) return;
    const row = idList.length === 1 ? user || rowCache.current.get(String(idList[0])) || null : null;
    setDialog({
      ids: idList.map(String), preserved: preservedFor(idList), segment: seg, months, fromSelection,
      target: row ? { name: row.name, email: row.email, phone: row.phone } : null,
    });
  }, [preservedFor, seg, months]);
  const deleteSelected = () => openDelete([...selected], { fromSelection: true });
  const openDeleteRef = useRef(openDelete);
  openDeleteRef.current = openDelete;
  const deleteOne = useCallback((user) => openDeleteRef.current([user._id], { user }), []);
  const onDialogClose = (result) => {
    const fromSelection = Boolean(dialog?.fromSelection);
    setDialog(null);
    if (!result) return;
    const remaining = result.remaining || [];
    const deletedIds = result.deleted || [];
    if (fromSelection) {
      setSelected(remaining.length && (result.stopped || result.error) ? new Set(remaining) : EMPTY);
      lastToggle.current = -1;
    } else if (deletedIds.length) {
      // Tek satır silindi: yöneticinin mevcut seçimi korunur, yalnızca silinen hesap seçimden düşer
      setSelected((cur) => {
        const next = new Set(cur);
        for (const id of deletedIds) next.delete(String(id));
        return next.size === cur.size ? cur : next;
      });
    }
    for (const id of deletedIds) rowCache.current.delete(String(id));
    if ((result.deleted || []).length) onAccountsDeleted?.();
    refreshAll();
  };

  // ── CSV ──
  const [exporting, setExporting] = useState(false);
  const exportCsv = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await axios.get("/account-cleanup/export", { params: { ...filterParams, sort: sortKey, dir: sortDir }, responseType: "blob" });
      const fallback = `pasif-hesaplar-${seg === "never" ? "kayitsiz" : `${months}ay`}-${new Date().toISOString().slice(0, 10)}.csv`;
      const name = filenameFrom(res.headers?.["content-disposition"], fallback);
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success(list?.key === listKey ? `${num(total)} hesap CSV olarak indirildi` : "CSV indirildi");
    } catch (e) {
      toast.error(await blobErrorMessage(e, "CSV indirilemedi"));
    } finally {
      setExporting(false);
    }
  }, [exporting, filterParams, sortKey, sortDir, seg, months, list?.key, listKey, total]);

  // ── Klavye ──
  const [cursorState, setCursorState] = useState({ key: listKey, index: -1 });
  const cursor = cursorState.key === listKey ? cursorState.index : -1;
  const setCursor = (index) => setCursorState({ key: listKey, index });
  const moveCursor = (delta) => {
    if (!rows.length) return;
    const next = Math.max(0, Math.min(rows.length - 1, (cursor < 0 ? (delta > 0 ? -1 : rows.length) : cursor) + delta));
    setCursor(next);
    requestAnimationFrame(() => revealRow(listRef.current?.querySelector(`[data-id="${rows[next]?._id}"]`)));
  };
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    searchEscape: () => { if (query) setQuery(""); else searchRef.current?.blur(); },
    move: moveCursor,
    open: () => { if (cursor >= 0 && rows[cursor]) openProfile(rows[cursor]); },
    escape: () => { if (selected.size) clearSelection(); else if (hasFilter) clearFilters(); else setCursor(-1); },
    extra: {
      x: () => { const u = rows[cursor]; if (u?.deletable) toggle(u._id, cursor, false); },
      Delete: () => { if (selected.size) deleteSelected(); },
      e: exportCsv,
      r: refreshAll,
      ArrowLeft: () => { if (page > 1) setPage(page - 1); },
      ArrowRight: () => { if (page < pages) setPage(page + 1); },
    },
  }, { enabled: !dialog });

  // ── Görünüm ──
  const t = summary?.totals || {};
  const sm = Number(summary?.months) || months; // kartların başlığı her zaman gösterdiği sayının kesimiyle
  // Liste her zaman seçili kesimle (months) gelir; özet henüz o kesimle gelmediyse (yükleniyor ya da başarısız)
  // liste alanındaki sayılar "—" olur, eski kesimin sayıları yeni listeye yazılmaz.
  const summaryFresh = Number(summary?.months) === months;
  const freshNum = (value) => (summaryFresh ? num(value) : "—");
  const listCutoff = summaryFresh && summary?.cutoff ? summary.cutoff : addMonths(now, -months);
  const initial = !summary && summaryLoading;
  const summaryFailed = !summary && !summaryLoading && Boolean(summaryError);
  const deletableTotal = (Number(t.inactiveDeletable) || 0) + (Number(t.neverDeletable) || 0);
  const segTotal = seg === "inactive" ? t.inactive : t.never;
  const deleted = summary?.deletedAccounts || {};
  const rangeFrom = total ? (page - 1) * limit + 1 : 0;
  const rangeTo = Math.min(total, page * limit);
  const sortOptions = SORTS.filter((s) => !s.segments || s.segments.includes(seg));
  const listInitial = listLoading && (!list || !listMatches); // ilk yükleme ya da sekme değişimi: iskelet

  const listEmpty = !listLoading && !listError && list?.key === listKey && rows.length === 0;

  return (
    <div className="ui-page ac" data-selecting={selected.size > 0 || undefined}>
      <PageHeader
        title="Pasif hesap temizliği"
        description="Uzun süredir gelmeyen müşteri hesaplarını bulun ve silin. Yalnızca hesap silinir; geçmiş siparişler ve ciro raporları olduğu gibi kalır."
        actions={(
          <>
            <div className="ac-cutoff" role="group" aria-labelledby="ac-cutoff-label">
              <span className="ac-cutoff-label" id="ac-cutoff-label">Pasiflik süresi</span>
              <Segmented ariaLabel="Pasiflik süresi (ay)" value={months} onChange={changeMonths}
                options={MONTH_OPTIONS.map((m) => ({ value: m, label: `${m} ay`, title: `${m} aydır gelmeyenler` }))} />
            </div>
            <button type="button" className="ui-btn ui-btn--sm" onClick={exportCsv} disabled={exporting || initial} title="Bu listeyi (süzgeçlerle) CSV olarak indir (e)">
              {exporting ? <Loader2 className="ui-spin" /> : <Download />}CSV indir
            </button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll} disabled={summaryLoading && listLoading} title="Yenile (r)">
              <RefreshCw className={summaryLoading || listLoading ? "ui-spin" : undefined} />Yenile
            </button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ac-help-btn" onClick={() => setHelpOpen(true)} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)"><Keyboard /></button>
          </>
        )}
      />

      {summaryError && summary && (
        <div className="ui-banner ui-banner--danger ac-banner" role="alert">
          <AlertTriangle />
          <span className="ui-grow">Özet güncellenemedi: {summaryError}. Gösterilen sayılar son başarılı hesaplamadan.</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll}><RefreshCw />Tekrar dene</button>
        </div>
      )}

      {initial ? (
        <>
          <SkeletonCards count={5} />
          <SkeletonBlock height={232} />
          <SkeletonRows rows={8} />
        </>
      ) : summaryFailed ? (
        <section className="ui-panel">
          <EmptyState icon={AlertTriangle} title="Pasif hesap özeti yüklenemedi" description={`${summaryError}. Bağlantıyı kontrol edip tekrar deneyin.`}
            action={<button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={refreshAll}><RefreshCw />Tekrar dene</button>} />
        </section>
      ) : (
        <>
          <KpiGrid columns={5} className={`ac-kpis${summaryLoading ? " is-loading" : ""}`}>
            <KpiCard icon={Users} label="Toplam müşteri" value={num(t.customers)} note={`${num(t.admins)} yönetici hariç`} />
            <KpiCard icon={Clock} tone="warn" label={`${sm}+ ay pasif`} value={num(t.inactive)}
              note={`${pct(t.inactive, t.customers)} · ${num(t.inactiveDeletable)} silinebilir`} active={seg === "inactive"} onClick={() => changeSegment("inactive")} />
            <KpiCard icon={Ghost} tone="info" label="Etkinlik kaydı yok" value={num(t.never)}
              note={`${num(t.neverDeletable)} silinebilir · ${num(t.neverTooNew)} çok yeni`} active={seg === "never"} onClick={() => changeSegment("never")} />
            <KpiCard icon={UserX} tone="danger" label="Silinebilir toplam" value={num(deletableTotal)}
              note={t.blockedActiveOrders ? `Aktif siparişli ${num(t.blockedActiveOrders)} hesap hariç` : "Aktif siparişli aday yok"} />
            <KpiCard icon={PackageCheck} tone="ok" label="Korunacak sipariş" value={num(t.ordersPreserved)}
              note={`${compactMoney(t.revenuePreserved)} ciro · ${num(t.candidatesWithOrders)} hesapta`} />
          </KpiGrid>

          <div className="ac-assure">
            <ShieldCheck aria-hidden="true" />
            <p>
              <strong>Silme yalnızca müşteri hesabını kaldırır.</strong> Siparişler, ciro raporları ve geri bildirimler olduğu gibi kalır
              {Number(deleted.users) > 0 ? <>; silinmiş hesaplardan kalan <strong className="ui-num">{num(deleted.orders)}</strong> sipariş (<strong className="ui-num">{num(deleted.users)}</strong> müşteriye ait) raporlarda duruyor.</> : "."}
            </p>
            {summary?.generatedAt && (
              <span className="ac-assure-meta ui-num" title="Sayılar sunucuda tüm müşteri kayıtları taranarak hesaplanır">
                Tüm kayıtlardan hesaplandı · {formatTime(summary.generatedAt)}
              </span>
            )}
          </div>

          <Distribution summary={summary} />

          <section className="ui-panel ac-list" aria-label="Pasif hesaplar">
            <div className="ac-list-top">
              <Tabs ariaLabel="Hesap grubu" value={seg} onChange={changeSegment}
                tabs={[
                  { value: "inactive", label: `${months}+ ay pasif`, icon: Clock, count: freshNum(t.inactive) },
                  { value: "never", label: "Etkinlik kaydı yok", icon: Ghost, count: freshNum(t.never) },
                ]} />
              <p className="ac-intro">
                {seg === "inactive" ? (
                  <>En son etkinliği (web, oturum, uygulama, sepet ya da sipariş) <strong>{longDate(listCutoff)}</strong> tarihinden önce olan müşteriler.{" "}
                    {summaryFresh ? (
                      <>
                        <span className="ui-num"><strong>{num(t.inactiveDeletable)}</strong> silinebilir</span>
                        {Number(t.inactive) - Number(t.inactiveDeletable) > 0 && <>, <span className="ui-num">{num(Number(t.inactive) - Number(t.inactiveDeletable))}</span> hesabın aktif siparişi var</>}.
                      </>
                    ) : <span className="ui-muted">{summaryLoading ? "Silinebilir hesaplar sayılıyor…" : "Silinebilir hesap sayısı güncellenemedi."}</span>}</>
                ) : (
                  <>Kayıt olduktan sonra hiçbir etkinlik izi bırakmamış hesaplar (oturum, uygulama, sepet, sipariş yok).{" "}
                    {summaryFresh ? (
                      <>
                        <span className="ui-num"><strong>{num(t.neverDeletable)}</strong> silinebilir</span>
                        {Number(t.neverTooNew) > 0 && <>; <span className="ui-num">{num(t.neverTooNew)}</span> hesap {months} aydan yeni olduğu için şimdilik silinemez</>}.
                      </>
                    ) : <span className="ui-muted">{summaryLoading ? "Silinebilir hesaplar sayılıyor…" : "Silinebilir hesap sayısı güncellenemedi."}</span>}</>
                )}
              </p>
            </div>

            <div className="ac-toolbar">
              <label className="ui-search ac-search">
                <Search />
                <input ref={searchRef} type="search" className="ui-field" placeholder="Ad, e-posta veya telefon ara" aria-label="Hesap ara"
                  value={query} maxLength={SEARCH_MAX} onChange={(e) => setQuery(e.target.value)} data-esc-clear="1" />
              </label>
              {seg === "inactive" && (
                <div className="ac-chips-wrap">
                  <div className="ui-chips ac-chips" role="group" aria-label="Sipariş durumu">
                    {ORDER_FILTERS.map((f) => (
                      <button key={f.value} type="button" aria-pressed={orders === f.value} onClick={() => setOrders(f.value)}>{f.label}</button>
                    ))}
                  </div>
                  <div className="ui-chips ac-chips" role="group" aria-label="Son etkinlik">
                    <button type="button" aria-pressed={source === "signup"} onClick={() => setSource((v) => (v === "signup" ? "all" : "signup"))}
                      title="Son etkinliği kayıt anı olan, kayıttan sonra hiç geri gelmemiş müşteriler">
                      Kayıttan sonra hiç gelmedi<span className="ui-count">{freshNum(t.signupOnly)}</span>
                    </button>
                  </div>
                </div>
              )}
              <select className="ui-field ui-field--auto ac-sort" value={sortValue} onChange={(e) => onSortSelect(e.target.value)} aria-label="Sıralama">
                {sortOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div className="ac-result" aria-live="polite" hidden={!list && Boolean(listError)}>
              {list ? (
                <span className="ui-text-sm">
                  <strong className="ui-num">{num(total)}</strong> hesap{hasFilter ? <> eşleşiyor{summaryFresh && <> <span className="ui-muted ui-num">({num(segTotal)} içinde)</span></>}</> : ""}
                </span>
              ) : !listError && <span className="ui-text-sm ui-muted">Yükleniyor…</span>}
              {search && <span className="ui-badge ui-badge--brand">“{search}”</span>}
              {effOrders !== "all" && <span className="ui-badge ui-badge--brand">{ORDER_FILTERS.find((f) => f.value === effOrders)?.label}</span>}
              {effSource === "signup" && <span className="ui-badge ui-badge--brand">Kayıttan sonra hiç gelmedi</span>}
              {listLoading && list && <Loader2 className="ui-spin ac-result-spin" aria-label="Yükleniyor" />}
              <span className="ui-grow" />
              {deletableRows.length > 0 && (
                <label className="ac-page-select">
                  <input type="checkbox" className="ui-checkbox" checked={allPageSelected} onChange={togglePage} />
                  <span>Bu sayfadaki silinebilirleri seç</span>
                </label>
              )}
              {hasFilter && <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={clearFilters}><X />Filtreleri temizle</button>}
            </div>

            {listError && list && (
              <div className="ui-banner ui-banner--danger ac-list-banner" role="alert">
                <AlertTriangle />
                <span className="ui-grow">{listError}</span>
                <button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll}><RefreshCw />Tekrar dene</button>
              </div>
            )}

            {listInitial ? (
              <div className="ac-skel"><SkeletonRows rows={8} /></div>
            ) : listError && !list ? (
              <EmptyState icon={AlertTriangle} title="Liste yüklenemedi" description={`${listError}. Bağlantıyı kontrol edip tekrar deneyin.`}
                action={<button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={refreshAll}><RefreshCw />Tekrar dene</button>} />
            ) : listEmpty ? (
              hasFilter ? (
                <EmptyState icon={Search} title="Bu süzgeçlere uyan hesap yok" description="Aramayı ya da süzgeçleri değiştirin."
                  action={<button type="button" className="ui-btn ui-btn--sm" onClick={clearFilters}><X />Filtreleri temizle</button>} />
              ) : seg === "inactive" ? (
                <EmptyState icon={UserCheck} title={`${months} aydan uzun süredir gelmeyen müşteri yok`}
                  description="Tüm müşterileriniz bu süre içinde en az bir kez siteye, uygulamaya ya da siparişe uğradı."
                  action={months > MONTH_OPTIONS[0] && <button type="button" className="ui-btn ui-btn--sm" onClick={() => changeMonths(MONTH_OPTIONS[0])}><Clock />{MONTH_OPTIONS[0]} aylık kesimi dene</button>} />
              ) : (
                <EmptyState icon={UserCheck} title="Etkinlik kaydı olmayan hesap yok" description="Her müşteri hesabında en az bir oturum, uygulama, sepet ya da sipariş izi var." />
              )
            ) : (
              <div className="ac-table" role="table" aria-label={seg === "inactive" ? `${months}+ ay pasif hesaplar` : "Etkinlik kaydı olmayan hesaplar"}
                aria-busy={listLoading || undefined} data-segment={seg} data-stale={stale || undefined}>
                <div className="ac-row ac-head" role="row">
                  <span className="ac-cell ac-cell--check" role="columnheader">
                    <label className="ac-check" title="Bu sayfadaki silinebilir hesapları seç">
                      <input ref={headCheckRef} type="checkbox" className="ui-checkbox" checked={allPageSelected} onChange={togglePage}
                        disabled={!deletableRows.length} aria-label="Bu sayfadaki silinebilir hesapların hepsini seç" />
                    </label>
                  </span>
                  <span className="ac-cell ac-cell--person" role="columnheader"><SortHead label="Müşteri" sortKey="name" sort={sortKey} dir={sortDir} onSort={onSort} /></span>
                  <span className="ac-cell ac-cell--created" role="columnheader"><SortHead label="Kayıt" sortKey="created" sort={sortKey} dir={sortDir} onSort={onSort} /></span>
                  {seg === "inactive" && (
                    <>
                      <span className="ac-cell ac-cell--seen" role="columnheader"><SortHead label="Son görülme" sortKey="lastSeen" sort={sortKey} dir={sortDir} onSort={onSort} /></span>
                      <span className="ac-cell ac-cell--orders" role="columnheader">
                        <span className="ac-head-pair">
                          <SortHead label="Siparişler" sortKey="orders" sort={sortKey} dir={sortDir} onSort={onSort} />
                          <span aria-hidden="true">·</span>
                          <SortHead label="Harcama" sortKey="spent" sort={sortKey} dir={sortDir} onSort={onSort} />
                        </span>
                      </span>
                    </>
                  )}
                  <span className="ac-cell ac-cell--status" role="columnheader">Durum</span>
                  <span className="ac-cell ac-cell--actions" role="columnheader"><span className="ac-sr">İşlemler</span></span>
                </div>
                <div className="ac-body" role="rowgroup" ref={listRef}>
                  {rows.map((user, index) => (
                    <CleanupRow key={user._id} user={user} index={index} segment={seg} months={months} now={now}
                      selected={selected.has(String(user._id))} cursor={index === cursor}
                      onToggle={toggle} onOpenProfile={openProfile} onDelete={deleteOne} />
                  ))}
                </div>
              </div>
            )}

            {!listInitial && total > 0 && (
              <div className="ac-foot">
                <span className="ui-text-sm ui-muted ui-num">{num(rangeFrom)}–{num(rangeTo)} / {num(total)}</span>
                {pages > 1 && (
                  <nav className="ui-pagination ac-pages" aria-label="Sayfalar">
                    <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Önceki sayfa"><ChevronLeft /></button>
                    {pageList(page, pages).map((p) => (typeof p === "number" ? (
                      <button key={p} type="button" onClick={() => setPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Sayfa ${p}`}>{num(p)}</button>
                    ) : <span key={p} className="ac-pages-gap" aria-hidden="true">…</span>))}
                    <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Sonraki sayfa"><ChevronRight /></button>
                  </nav>
                )}
                <label className="ac-limit">
                  <span className="ui-hint">Sayfa başına</span>
                  <select className="ui-field ui-field--auto ui-field--sm" value={limit} onChange={(e) => { setLimitPref(Number(e.target.value)); setPage(1); }}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <span className="ac-kbd ui-hint"><kbd className="ui-kbd">/</kbd> ara · <kbd className="ui-kbd">j</kbd><kbd className="ui-kbd">k</kbd> gez · <kbd className="ui-kbd">x</kbd> seç · <kbd className="ui-kbd">?</kbd> yardım</span>
              </div>
            )}

            {selected.size > 0 && (
              <div className="ui-bulkbar ac-bulk" role="region" aria-label="Seçili hesaplar">
                <span className="ui-bulkbar-count"><CheckSquare aria-hidden="true" /><span><span className="ui-num">{num(selected.size)}</span> hesap seçili</span></span>
                <span className="ac-bulk-scope">
                  {!ids ? (
                    <span className="ac-bulk-note"><Loader2 className="ui-spin" aria-hidden="true" />Eşleşen hesaplar sayılıyor…</span>
                  ) : ids.error ? (
                    <span className="ac-bulk-note">{ids.error}</span>
                  ) : allMatchingSelected ? (
                    <span className="ac-bulk-note">
                      Eşleşen <strong className="ui-num">{num(ids.deletable)}</strong> silinebilir hesabın tümü seçili
                      {ids.blocked > 0 && <span className="ui-muted"> · {num(ids.blocked)} hesap silinemez</span>}
                    </span>
                  ) : ids.ids.length > 0 ? (
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost ac-bulk-all" onClick={() => setSelected(new Set(ids.ids))}>
                      <span>Eşleşen tüm <strong className="ui-num">{num(ids.deletable)}</strong> silinebilir hesabı seç</span>
                    </button>
                  ) : null}
                </span>
                <span className="ui-grow" />
                <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={deleteSelected}><Trash2 />Seçilenleri sil</button>
                <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={clearSelection} aria-label="Seçimi temizle" title="Seçimi temizle (Esc)"><X /></button>
              </div>
            )}
          </section>
        </>
      )}

      {dialog && (
        <DeleteDialog ids={dialog.ids} segment={dialog.segment} months={dialog.months} preserved={dialog.preserved} target={dialog.target} onClose={onDialogClose} />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={SHORTCUT_ITEMS} />
    </div>
  );
};

export default AccountCleanupTab;
