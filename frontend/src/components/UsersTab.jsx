// Müşteriler ekranı: KPI kartları, içgörü panelleri, arama/süzgeç/sıralama, sunucu sayfalı liste ve profil çekmecesi.
// Uç noktalar: GET /users (sayfa, arama, sıralama, segment; hafif alanlar + sipariş özeti), GET /users/stats (KPI,
// süzgeç sayıları, uygulama hunisi, kayıt grafiği), en iyi müşteriler için GET /users?sort=spent&limit=6. Panel açılışında liste ön yüklenmez;
// ekran açılınca yalnızca görünen sayfa istenir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Keyboard, RefreshCw, Search, ShoppingBag, Trash2, UserPlus, Users, X, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import {
  EmptyState, HANDOFF, KpiCard, KpiGrid, PageHeader, ShortcutHelp, SkeletonCards, SkeletonRows, formatDateTime, takeHandoff, undoable, useDebounced, useIsMobile, useListShortcuts, useNow, usePref,
} from "./admin/ui";
import { toCsv } from "../lib/customers";
import CustomerRow from "./customers/CustomerRow";
import CustomerDrawer from "./customers/CustomerDrawer";
import { AppTrackingPanel, BestCustomersPanel, RegistrationsPanel } from "./customers/Insights";
import {
  ACTIVE_DAYS, APP_FILTERS, PAGE_SIZES, SEGMENTS, appPeriodStart, browserTimeZone, customerTags, isAdmin, lastSeenAt, orderInfoOf, registeredAt, startOfLocalDay,
} from "./customers/shared";
import "../styles/customers.css";

const SORTS = [
  { id: "seen", label: "Son görülme" },
  { id: "newest", label: "Kayıt: en yeni" },
  { id: "oldest", label: "Kayıt: en eski" },
  { id: "name", label: "İsim (A–Z)" },
  { id: "spent", label: "Harcama: en çok" },
  { id: "orders", label: "Sipariş: en çok" },
];
const SORT_IDS = SORTS.map((s) => s.id);
const SHORTCUT_ITEMS = [[["x"], "Satırı seç / bırak"], [["e"], "Listeyi CSV olarak indir"], [["r"], "Listeyi yenile"]];
const EXPORT_PAGE = 100; // sunucunun izin verdiği en büyük sayfa
const EXPORT_MAX_PAGES = 100; // en fazla 10.000 kişi
const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const num = (value) => Number(value || 0).toLocaleString("tr-TR");
// Listeye yalnızca hafif alanlar alınır (PUT yanıtı tam kullanıcıyı döndürür)
const SAFE_EDIT_FIELDS = ["name", "email", "phone", "avatar", "role"];

/** « 1 … 4 5 6 … 20 » için sayfa listesi */
const pageList = (page, pages) => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) items.push("gap-start");
  for (let p = from; p <= to; p += 1) items.push(p);
  if (to < pages - 1) items.push("gap-end");
  items.push(pages);
  return items;
};

const UsersTab = ({ onOpenChat }) => {
  const { confirm } = useConfirm();
  const now = useNow(30000);
  const isMobile = useIsMobile();
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const listTopRef = useRef(null);

  // ── Süzgeç / sıralama / sayfa durumu ──
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim(), 300);
  const [segment, setSegment] = useState("all");
  const [onlyToday, setOnlyToday] = useState(false);
  const [appPeriod, setAppPeriod] = usePref("cus-app-period", "today");
  const [appFilter, setAppFilter] = useState(null);
  const [sortPref, setSort] = usePref("cus-sort", "seen");
  const sort = SORT_IDS.includes(sortPref) ? sortPref : "seen";
  const [limitPref, setLimit] = usePref("cus-limit", 50);
  const limit = PAGE_SIZES.includes(Number(limitPref)) ? Number(limitPref) : 50;
  const [insightsOpen, setInsightsOpen] = usePref("cus-insights", true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [removed, setRemoved] = useState(() => new Set()); // iyimser silinen (geri alınabilir) kayıtlar
  const [open, setOpen] = useState(null); // { id, tab, focusPassword, user }
  const [exporting, setExporting] = useState(false);
  // Dönem başlangıcı yalnızca yenilemede / dönem değişiminde kayar (her 30 sn'de liste yeniden istenmesin)
  const [anchor, setAnchor] = useState(() => Date.now());
  const appSince = useMemo(() => appPeriodStart(appPeriod, anchor), [appPeriod, anchor]);
  const todayStart = useMemo(() => startOfLocalDay(anchor).toISOString(), [anchor]);

  // ── Liste (sunucu sayfası) ──
  const [list, setList] = useState(null); // { key, users, total, page, pages }
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listRequest = useRef(0);

  const params = useMemo(() => ({
    sort,
    limit,
    segment,
    q: search || undefined,
    registeredSince: onlyToday ? todayStart : undefined,
    app: appFilter || undefined,
    appSince: appFilter ? new Date(appSince).toISOString() : undefined,
  }), [sort, limit, segment, search, onlyToday, todayStart, appFilter, appSince]);
  // Yalnızca yöneticinin seçtiği süzgeçler: yenilemede kayan tarihler (appSince, todayStart) burada yok, yoksa
  // "Yenile" 7/30 günlük uygulama süzgecinde ilk sayfaya döner ve seçimi silerdi. İstek her zaman güncel params'ı gönderir.
  const filterKey = useMemo(() => JSON.stringify({
    sort, limit, segment, search, onlyToday, appFilter, appPeriod: appFilter ? appPeriod : undefined,
  }), [sort, limit, segment, search, onlyToday, appFilter, appPeriod]);
  const requestKey = `${filterKey}|${page}`;
  const lastFilterKey = useRef(filterKey);

  useEffect(() => {
    // Süzgeç değişince ilk sayfaya dönülür; seçim ve imleç sıfırlanır
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      setSelected(new Set());
      setCursor(-1);
      if (page !== 1) { setPage(1); return undefined; }
    }
    const id = ++listRequest.current;
    const controller = new AbortController();
    setListLoading(true);
    axios.get("/users", { params: { ...params, page }, signal: controller.signal })
      .then(({ data }) => {
        if (id !== listRequest.current) return;
        const pages = Math.max(1, Number(data.pages) || 1);
        setList({ key: requestKey, users: Array.isArray(data.users) ? data.users : [], total: Number(data.total) || 0, page: Number(data.page) || page, pages });
        setListError(null);
        // Sunucu sayfayı son sayfaya çektiyse (ör. silme sonrası) durumu eşitle
        if (Number(data.page) && Number(data.page) !== page) setPage(Number(data.page));
      })
      .catch((error) => {
        if (id !== listRequest.current || controller.signal.aborted) return;
        setListError(errorText(error, "Müşteri listesi yüklenemedi"));
      })
      .finally(() => {
        if (id === listRequest.current) setListLoading(false);
      });
    return () => controller.abort();
    // requestKey filterKey + page'den türer; params'taki tarihler yenilemede (reloadKey ile birlikte) tazelenir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, reloadKey]);

  // ── Özet: KPI, süzgeç sayıları, uygulama hunisi, kayıt grafiği ──
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [statsTick, setStatsTick] = useState(0); // yenilemede dönem değişmese de özet yeniden istensin
  const statsRequest = useRef(0);
  const fetchStats = useCallback(async () => {
    const id = ++statsRequest.current;
    setStatsLoading(true);
    try {
      const { data } = await axios.get("/users/stats", {
        params: { appSince: new Date(appSince).toISOString(), todayStart, tz: browserTimeZone() },
      });
      if (id === statsRequest.current) { setStats(data.stats || null); setStatsError(null); }
    } catch (error) {
      // Özet yardımcı bilgidir; liste çalışmaya devam eder
      if (id === statsRequest.current) setStatsError(errorText(error, "Müşteri özeti yüklenemedi"));
    } finally {
      if (id === statsRequest.current) setStatsLoading(false);
    }
  }, [appSince, todayStart]);
  useEffect(() => { fetchStats(); }, [fetchStats, statsTick]);

  // ── En iyi müşteriler paneli ──
  const [best, setBest] = useState(null);
  const [bestLoading, setBestLoading] = useState(false);
  const fetchBest = useCallback(async () => {
    setBestLoading(true);
    try {
      // Sunucu tüm müşterileri harcamaya göre sıralar (iptaller hariç); yalnızca paneldeki ilk 6 kişi iner
      const res = await axios.get("/users", { params: { sort: "spent", limit: 6 } });
      const rows = Array.isArray(res.data.users) ? res.data.users : [];
      setBest(rows
        .filter((u) => Number(u.orderCount) > 0)
        .map((u) => ({ userId: u._id, name: u.name, email: u.email, totalSpent: u.totalSpent, orderCount: u.orderCount, avgOrderValue: u.avgOrderValue })));
    } catch {
      setBest((current) => current || []);
    } finally {
      setBestLoading(false);
    }
  }, []);
  useEffect(() => { fetchBest(); }, [fetchBest]);

  const reloadList = useCallback(() => setReloadKey((k) => k + 1), []);
  const reloadStats = useCallback(() => setStatsTick((k) => k + 1), []);
  const refreshAll = useCallback(() => {
    setAnchor(Date.now()); // dönem / gün başı tazelenir
    reloadList();
    reloadStats();
    fetchBest();
  }, [reloadList, reloadStats, fetchBest]);
  const afterChange = useCallback(() => { reloadList(); reloadStats(); fetchBest(); }, [reloadList, reloadStats, fetchBest]);

  // Panel başlığındaki "Yenile" ve uygulama etkinliği (AdminPage soket olaylarını pencere olayı olarak iletir)
  useEffect(() => {
    const onRefresh = () => refreshAll();
    const onActivity = (event) => {
      const { userId, appActivity, patch } = event.detail || {};
      if (!userId) return;
      const apply = (user) => (user._id === String(userId)
        ? { ...user, appActivity: appActivity || { ...user.appActivity, ...patch } }
        : user);
      setList((current) => (current && current.users.some((u) => u._id === String(userId)) ? { ...current, users: current.users.map(apply) } : current));
    };
    window.addEventListener("admin-refresh", onRefresh);
    window.addEventListener("admin-user-activity", onActivity);
    return () => {
      window.removeEventListener("admin-refresh", onRefresh);
      window.removeEventListener("admin-user-activity", onActivity);
    };
  }, [refreshAll]);

  // ── Türetilmiş ──
  const stale = !list || list.key !== requestKey; // gösterilen sayfa istenen süzgece ait değil
  const rows = useMemo(() => (list ? list.users.filter((u) => !removed.has(u._id)) : []), [list, removed]);
  const rowsById = useMemo(() => new Map(rows.map((u) => [u._id, u])), [rows]);
  const shown = useMemo(() => (stale && listLoading ? [] : rows), [stale, listLoading, rows]);
  const total = list ? Math.max(0, list.total - (list.users.length - rows.length)) : 0;
  const pages = list?.pages || 1;
  const rangeFrom = total ? (page - 1) * limit + 1 : 0;
  const rangeTo = Math.min(total, (page - 1) * limit + shown.length);
  const hasFilter = Boolean(search || segment !== "all" || onlyToday || appFilter);
  const clearFilters = useCallback(() => { setQuery(""); setSegment("all"); setOnlyToday(false); setAppFilter(null); }, []);

  const kpis = {
    total: stats?.customers,
    admins: stats?.admins,
    active: stats?.active,
    noOrders: stats?.noOrders,
    risk: stats?.risk,
    today: stats?.today,
  };
  const value = (n) => (n === undefined || n === null ? "…" : num(n));

  // ── Seçim ──
  const toggleSelect = useCallback((id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const allShownSelected = shown.length > 0 && shown.every((u) => selected.has(u._id));
  const toggleAllShown = () => setSelected((current) => {
    const next = new Set(current);
    if (allShownSelected) shown.forEach((u) => next.delete(u._id));
    else shown.forEach((u) => next.add(u._id));
    return next;
  });

  // ── Profil açma: satırdaki nesne ya da (sayfada yoksa) kimlikle sunucudan ──
  const openUser = useCallback((user, tab = "orders", focusPassword = false) => setOpen({ id: user._id, tab, focusPassword, user }), []);
  const openById = useCallback(async (id, tab = "orders") => {
    if (!id) return;
    const known = rowsById.get(String(id));
    if (known) { openUser(known, tab); return; }
    try {
      const { data } = await axios.get("/users", { params: { ids: String(id), limit: 1 } });
      const user = data.users?.[0];
      if (user) openUser(user, tab);
      else toast.error("Müşteri bulunamadı; hesap silinmiş olabilir");
    } catch (error) {
      toast.error(errorText(error, "Müşteri açılamadı"));
    }
  }, [rowsById, openUser]);
  const openFromPanel = useCallback((user) => openById(user?._id), [openById]);
  // Çekmeceye verilen nesne yalnızca içeriği değişince yenilenir (liste yenilemesi yazılan formu sıfırlamasın)
  const liveOpen = open ? rowsById.get(open.id) : null;
  const liveOpenSig = liveOpen ? JSON.stringify(liveOpen) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openUserObj = useMemo(() => (open ? liveOpen || open.user : null), [open, liveOpenSig]);

  // Komut paletinden gelen müşteri: açılışta ve ekran açıkken gelen aktarımda
  const openByIdRef = useRef(openById);
  openByIdRef.current = openById;
  useEffect(() => {
    const consume = () => {
      const id = takeHandoff(HANDOFF.user);
      if (id) openByIdRef.current(id, "orders");
    };
    consume();
    const onHandoff = (event) => { if (event.detail?.key === HANDOFF.user) consume(); };
    window.addEventListener("admin-handoff", onHandoff);
    return () => window.removeEventListener("admin-handoff", onHandoff);
  }, []);

  // ── Eylemler ──
  const deleteUser = useCallback((user) => {
    setOpen((current) => (current?.id === user._id ? null : current));
    setRemoved((current) => new Set(current).add(user._id));
    setSelected((current) => { if (!current.has(user._id)) return current; const next = new Set(current); next.delete(user._id); return next; });
    undoable({
      message: `"${user.name || "İsimsiz"}" silindi`,
      icon: <Trash2 />,
      undo: () => setRemoved((current) => { const next = new Set(current); next.delete(user._id); return next; }),
      commit: async () => {
        try {
          await axios.delete(`/users/${user._id}`);
          afterChange();
        } catch (e) {
          toast.error(errorText(e, "Kullanıcı silinemedi"));
          setRemoved((current) => { const next = new Set(current); next.delete(user._id); return next; });
        }
      },
    });
  }, [afterChange]);

  const bulkDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: "Toplu silme",
      message: `${ids.length} kullanıcı kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmText: `${ids.length} kullanıcıyı sil`,
      cancelText: "Vazgeç",
      type: "danger",
    });
    if (!ok) return;
    let failed = 0;
    for (const id of ids) {
      try { await axios.delete(`/users/${id}`); } catch { failed += 1; }
    }
    if (failed) toast.error(`${failed} kullanıcı silinemedi`);
    else toast.success(`${ids.length} kullanıcı silindi`);
    setSelected(new Set());
    afterChange();
  };

  // Profilde kaydedilen bilgiler satıra ve açık çekmeceye hemen yansır
  const onSaved = useCallback((saved) => {
    if (!saved?._id) { reloadList(); return; }
    const id = String(saved._id);
    const patch = Object.fromEntries(SAFE_EDIT_FIELDS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    setList((current) => (current ? { ...current, users: current.users.map((u) => (u._id === id ? { ...u, ...patch } : u)) } : current));
    setOpen((current) => (current?.id === id ? { ...current, user: { ...current.user, ...patch } } : current));
    reloadList();
  }, [reloadList]);
  const onRoleChanged = useCallback((user, role) => {
    setList((current) => (current ? { ...current, users: current.users.map((u) => (u._id === user._id ? { ...u, role } : u)) } : current));
    setOpen((current) => (current?.id === user._id ? { ...current, user: { ...current.user, role } } : current));
    afterChange();
  }, [afterChange]);

  // CSV: geçerli süzgece uyan herkes, sunucudan 100'erli sayfalarla
  const exportCsv = useCallback(async () => {
    if (exporting) return;
    if (!total) { toast.error("Dışa aktarılacak kayıt yok"); return; }
    setExporting(true);
    const toastId = toast.loading("CSV hazırlanıyor…");
    try {
      const all = [];
      let pageCount = 1;
      for (let p = 1; p <= Math.min(pageCount, EXPORT_MAX_PAGES); p += 1) {
        const { data } = await axios.get("/users", { params: { ...params, page: p, limit: EXPORT_PAGE } });
        const batch = Array.isArray(data.users) ? data.users : [];
        all.push(...batch);
        pageCount = Math.max(1, Number(data.pages) || 1);
        if (batch.length < EXPORT_PAGE) break;
        if (pageCount > 1) toast.loading(`CSV hazırlanıyor… ${num(all.length)} / ${num(data.total)}`, { id: toastId });
      }
      const people = all.filter((u) => !removed.has(u._id));
      const rowsCsv = [
        ["Ad Soyad", "E-posta", "Telefon", "Rol", "Etiketler", "Kayıt", "Son görülme", "Sipariş", "Toplam harcama", "Uygulama ziyareti"],
        ...people.map((u) => {
          const info = orderInfoOf(u);
          return [
            u.name, u.email, u.phone || "", isAdmin(u) ? "Yönetici" : "Müşteri",
            customerTags(u, now).map((t) => t.label).join(", "),
            formatDateTime(registeredAt(u)), lastSeenAt(u) ? formatDateTime(lastSeenAt(u)) : "",
            info?.orderCount || 0, (info?.totalSpent || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            u.appActivity?.visitCount || 0,
          ];
        }),
      ];
      const blob = new Blob([toCsv(rowsCsv)], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `musteriler-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      const capped = pageCount > EXPORT_MAX_PAGES;
      toast.success(`${num(people.length)} kişi CSV olarak indirildi${capped ? " (ilk 10.000 kişi)" : ""}`, { id: toastId });
    } catch (error) {
      toast.error(errorText(error, "CSV hazırlanamadı"), { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [exporting, total, params, removed, now]);

  const goPage = useCallback((next) => {
    const target = Math.min(Math.max(1, next), pages);
    if (target === page) return;
    setPage(target);
    setCursor(-1);
    requestAnimationFrame(() => {
      const top = listTopRef.current;
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [page, pages]);

  // ── Klavye ──
  const moveCursor = useCallback((delta) => {
    if (!shown.length) return;
    setCursor((current) => {
      const next = Math.max(0, Math.min(shown.length - 1, (current < 0 ? (delta > 0 ? -1 : shown.length) : current) + delta));
      requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${shown[next]?._id}"]`)?.scrollIntoView({ block: "nearest" }));
      return next;
    });
  }, [shown]);
  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
    move: moveCursor,
    open: () => { if (cursor >= 0 && shown[cursor]) openUser(shown[cursor]); },
    escape: () => { if (selected.size) setSelected(new Set()); else if (hasFilter) clearFilters(); else setCursor(-1); },
    extra: {
      x: () => { if (cursor >= 0 && shown[cursor]) toggleSelect(shown[cursor]._id); },
      e: exportCsv,
      r: refreshAll,
    },
  });

  // ── Görünüm ──
  const initial = listLoading && !list && !listError;
  const failed = Boolean(listError) && !list && !listLoading; // liste hiç gelmedi
  const appFilterLabel = appFilter ? APP_FILTERS.find((f) => f.id === appFilter)?.label : null;
  const busy = listLoading || statsLoading;

  return (
    <div className="ui-page cus">
      <PageHeader
        title="Müşteriler"
        description="Kayıtlı müşteriler, etkinlikleri ve sipariş özetleri. Satıra tıklayınca profil açılır."
        meta={kpis.total !== undefined && kpis.total !== null && <span className="ui-badge ui-badge--brand ui-num">{num(kpis.total)}</span>}
        actions={(
          <>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm cus-help-btn" onClick={() => setHelpOpen(true)} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)"><Keyboard /></button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={exportCsv} disabled={initial || exporting || !total} title="Süzgece uyan herkesi indir (e)">
              <Download className={exporting ? "ui-spin" : undefined} />CSV
            </button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll} disabled={busy} title="Yenile (r)"><RefreshCw className={busy ? "ui-spin" : undefined} />Yenile</button>
          </>
        )}
      />

      {listError && list && (
        <div className="ui-banner ui-banner--danger cus-banner" role="alert">
          <AlertTriangle />
          <span className="ui-grow">{listError}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={reloadList}><RefreshCw />Tekrar dene</button>
        </div>
      )}

      {statsError && !statsLoading && (
        <div className="ui-banner ui-banner--warn cus-banner" role="status">
          <AlertTriangle />
          <span className="ui-grow">{statsError}. Liste çalışıyor; sayılar ve grafikler güncel değil.</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={reloadStats}><RefreshCw />Tekrar dene</button>
        </div>
      )}

      {initial ? (
        <>
          <SkeletonCards count={5} />
          <SkeletonRows rows={8} />
        </>
      ) : failed ? (
        <section className="ui-panel">
          <EmptyState icon={AlertTriangle} title="Liste yüklenemedi" description={`${listError} Bağlantıyı kontrol edip tekrar deneyin.`} action={<button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={refreshAll}><RefreshCw />Tekrar dene</button>} />
        </section>
      ) : (
        <>
          <KpiGrid columns={5} className="cus-kpis">
            <KpiCard icon={Users} label="Toplam müşteri" value={value(kpis.total)} note={kpis.admins !== undefined ? `${num(kpis.admins)} yönetici hariç` : "hesaplanıyor"} active={segment === "all" && !onlyToday && !appFilter} onClick={() => { setSegment("all"); setOnlyToday(false); setAppFilter(null); }} />
            <KpiCard icon={Zap} tone="ok" label={`Son ${ACTIVE_DAYS} gün aktif`} value={value(kpis.active)} note={kpis.total ? `müşterilerin %${Math.round(((kpis.active || 0) / kpis.total) * 100)}'i` : "—"} active={segment === "active"} onClick={() => { setSegment("active"); setOnlyToday(false); }} />
            <KpiCard icon={ShoppingBag} tone="info" label="Sipariş vermemiş" value={value(kpis.noOrders)} note="ilk siparişi bekleyenler" active={segment === "noOrders"} onClick={() => { setSegment("noOrders"); setOnlyToday(false); }} />
            <KpiCard icon={AlertTriangle} tone={kpis.risk ? "warn" : undefined} label="Risk altında" value={value(kpis.risk)} note={`${ACTIVE_DAYS}+ gündür sessiz`} active={segment === "risk"} onClick={() => { setSegment("risk"); setOnlyToday(false); }} />
            <KpiCard icon={UserPlus} tone={kpis.today ? "brand" : undefined} label="Bugün kayıt olan" value={value(kpis.today)} note="bugün üye olanlar" active={onlyToday} onClick={() => { setOnlyToday((v) => !v); setSegment("all"); setSort("newest"); }} />
          </KpiGrid>

          <section className="cus-insights" data-open={insightsOpen}>
            <button type="button" className="cus-insights-toggle" onClick={() => setInsightsOpen((v) => !v)} aria-expanded={insightsOpen}>
              <span>İçgörüler</span>
              <span className="ui-hint">Yeni kayıtlar · en iyi müşteriler · uygulama takibi</span>
              {insightsOpen ? <ChevronUp /> : <ChevronDown />}
            </button>
            {insightsOpen && (
              <div className="cus-insights-grid">
                <RegistrationsPanel registrations={stats?.registrations} latest={stats?.latest || []} loading={statsLoading && !stats} now={now} onOpen={openFromPanel} />
                <BestCustomersPanel best={best || []} loading={bestLoading && !best} onOpen={openFromPanel} />
                <AppTrackingPanel counts={stats?.app} loading={statsLoading} period={appPeriod}
                  onPeriod={(next) => { setAppPeriod(next); setAnchor(Date.now()); }} filter={appFilter} onFilter={setAppFilter} />
              </div>
            )}
          </section>

          <section className="ui-panel cus-list" ref={listTopRef} aria-busy={listLoading || undefined}>
            <div className="cus-toolbar">
              <label className="ui-search cus-search">
                <Search />
                <input ref={searchRef} type="search" className="ui-field" placeholder="Ad, e-posta veya telefon ara" aria-label="Müşteri ara" value={query} onChange={(e) => setQuery(e.target.value)} data-esc-clear="1" />
              </label>
              <div className="ui-chips cus-chips" role="group" aria-label="Süzgeç">
                {SEGMENTS.map((s) => (
                  <button key={s.id} type="button" aria-pressed={segment === s.id} onClick={() => setSegment(s.id)} title={s.hint}>
                    {s.label}<span className="ui-count">{stats?.segments ? num(stats.segments[s.id]) : "…"}</span>
                  </button>
                ))}
              </div>
              <select className="ui-field ui-field--auto cus-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {(onlyToday || appFilter || search) && (
              <div className="cus-active">
                <span className="ui-text-sm">{stale ? <span className="ui-muted">Aranıyor…</span> : <><strong className="ui-num">{num(total)}</strong> kişi</>}</span>
                {search && <span className="ui-badge ui-badge--brand">“{search}”</span>}
                {onlyToday && <span className="ui-badge ui-badge--brand">Bugün kayıt olan</span>}
                {appFilterLabel && <span className="ui-badge ui-badge--brand">{appFilterLabel}{appFilter !== "now" ? ` · ${{ today: "bugün", week: "7 gün", month: "30 gün" }[appPeriod]}` : ""}</span>}
                <span className="ui-grow" />
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={clearFilters}><X />Filtreleri temizle</button>
              </div>
            )}

            {selected.size > 0 && (
              <div className="ui-bulkbar cus-bulkbar">
                <span className="ui-bulkbar-count"><Users />{selected.size} kişi seçildi</span>
                <span className="ui-grow" />
                <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={bulkDelete}><Trash2 />Seçilenleri sil</button>
                <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => setSelected(new Set())} aria-label="Seçimi temizle" title="Seçimi temizle (Esc)"><X /></button>
              </div>
            )}

            <div className="cus-head" role="row">
              <label className="cus-check"><input type="checkbox" className="ui-checkbox" checked={allShownSelected} onChange={toggleAllShown} disabled={!shown.length} aria-label="Bu sayfadakilerin hepsini seç" /></label>
              <span>Müşteri</span>
              <span>Kayıt</span>
              <span>Son görülme</span>
              <span>Siparişler</span>
              <span>Cihaz / uygulama</span>
              <span className="ui-right">İşlemler</span>
            </div>

            {stale && listLoading ? (
              <SkeletonRows rows={Math.min(limit, 8)} />
            ) : (
              <div className="cus-rows" ref={listRef} role="rowgroup">
                {shown.map((user, index) => (
                  <CustomerRow
                    key={user._id}
                    user={user}
                    now={now}
                    appSince={appSince}
                    selected={selected.has(user._id)}
                    cursor={index === cursor}
                    onSelect={toggleSelect}
                    onOpen={openUser}
                    onEdit={(u) => openUser(u, "account")}
                    onResetPw={(u) => openUser(u, "account", true)}
                    onDelete={deleteUser}
                  />
                ))}
              </div>
            )}

            {!listLoading && !stale && shown.length === 0 && (
              hasFilter ? (
                <EmptyState icon={Search} title="Bu süzgeçlere uyan kişi yok" description="Aramayı ya da süzgeçleri değiştirin." action={<button type="button" className="ui-btn ui-btn--sm" onClick={clearFilters}><X />Filtreleri temizle</button>} />
              ) : total > 0 ? (
                <EmptyState icon={Users} title="Bu sayfada kimse kalmadı" description="Listeyi yenileyin ya da önceki sayfaya dönün." action={<button type="button" className="ui-btn ui-btn--sm" onClick={reloadList}><RefreshCw />Yenile</button>} />
              ) : (
                <EmptyState icon={Users} title="Henüz müşteri yok" description="Uygulamadan ya da siteden kayıt olan ilk müşteri burada görünür." action={<button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll}><RefreshCw />Yenile</button>} />
              )
            )}

            <div className="cus-foot">
              <span className="ui-text-sm ui-muted ui-num">{total ? `${num(rangeFrom)}–${num(rangeTo)} / ${num(total)} kişi` : "0 kişi"}</span>
              {pages > 1 && (
                <nav className="ui-pagination" aria-label="Sayfalar">
                  <button type="button" onClick={() => goPage(page - 1)} disabled={page <= 1 || listLoading} aria-label="Önceki sayfa" title="Önceki sayfa"><ChevronLeft /></button>
                  {isMobile ? (
                    <span className="ui-text-sm ui-num" aria-live="polite">{num(page)} / {num(pages)}</span>
                  ) : pageList(page, pages).map((p) => (typeof p === "number" ? (
                    <button key={p} type="button" onClick={() => goPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Sayfa ${p}`} disabled={listLoading && p !== page}>{num(p)}</button>
                  ) : <span key={p} className="ui-muted" aria-hidden="true">…</span>))}
                  <button type="button" onClick={() => goPage(page + 1)} disabled={page >= pages || listLoading} aria-label="Sonraki sayfa" title="Sonraki sayfa"><ChevronRight /></button>
                </nav>
              )}
              <label className="ui-cluster">
                <span className="ui-hint">Sayfa başına</span>
                <select className="ui-field ui-field--auto ui-field--sm" value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Sayfa başına kişi">
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <span className="ui-grow" />
              <span className="cus-kbd ui-hint"><kbd className="ui-kbd">/</kbd> ara · <kbd className="ui-kbd">j</kbd><kbd className="ui-kbd">k</kbd> gez · <kbd className="ui-kbd">↵</kbd> aç · <kbd className="ui-kbd">?</kbd> yardım</span>
            </div>
          </section>
        </>
      )}

      {openUserObj && (
        <CustomerDrawer
          key={openUserObj._id}
          user={openUserObj}
          now={now}
          initialTab={open.tab}
          focusPassword={open.focusPassword}
          onClose={() => setOpen(null)}
          onOpenChat={onOpenChat}
          onSaved={onSaved}
          onRoleChanged={onRoleChanged}
          onDelete={deleteUser}
        />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={SHORTCUT_ITEMS} />
    </div>
  );
};

export default UsersTab;
