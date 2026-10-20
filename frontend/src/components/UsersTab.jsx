// Müşteriler ekranı: KPI kartları, içgörü panelleri, arama/süzgeç/sıralama, hafif liste ve profil çekmecesi.
// Liste verisi AdminPage'den gelir (GET /users); sipariş özeti GET /users/best-customers ile tek seferde alınır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, ChevronUp, Download, Keyboard, RefreshCw, Search, ShoppingBag, Trash2, UserPlus, Users, X, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import {
  EmptyState, HANDOFF, KpiCard, KpiGrid, PageHeader, ShortcutHelp, SkeletonCards, SkeletonRows, formatDateTime, takeHandoff, undoable, useDebounced, useListShortcuts, useNow, usePref,
} from "./admin/ui";
import { matchesSearch, toCsv } from "../lib/customers";
import CustomerRow from "./customers/CustomerRow";
import CustomerDrawer from "./customers/CustomerDrawer";
import { AppTrackingPanel, BestCustomersPanel, RegistrationsPanel } from "./customers/Insights";
import {
  ACTIVE_DAYS, APP_FILTERS, PAGE_SIZE, SEGMENTS, appPeriodStart, customerTags, hasOrders, isActive, isAdmin, isAtRisk, lastSeenAt, orderInfoOf, registeredAt, registeredToday,
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
const time = (date) => (date ? new Date(date).getTime() : 0);
const SHORTCUT_ITEMS = [[["x"], "Satırı seç / bırak"], [["e"], "Listeyi CSV olarak indir"], [["r"], "Listeyi yenile"]];

const UsersTab = ({ users = [], loading, error, onRefresh, onOpenChat }) => {
  const { confirm } = useConfirm();
  const now = useNow(30000);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  // ── Süzgeç / sıralama durumu ──
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 200);
  const [segment, setSegment] = useState("all");
  const [onlyToday, setOnlyToday] = useState(false);
  const [appPeriod, setAppPeriod] = usePref("cus-app-period", "today");
  const [appFilter, setAppFilter] = useState(null);
  const [sort, setSort] = usePref("cus-sort", "seen");
  const [insightsOpen, setInsightsOpen] = usePref("cus-insights", true);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [removed, setRemoved] = useState(() => new Set()); // iyimser silinen (geri alınabilir) kayıtlar
  const [open, setOpen] = useState(null); // { id, tab, focusPassword }

  // ── Sipariş özeti (müşteri başına sipariş sayısı / harcama) ──
  const [best, setBest] = useState(null);
  const [bestLoading, setBestLoading] = useState(false);
  const fetchBest = useCallback(async () => {
    setBestLoading(true);
    try {
      const res = await axios.get("/users/best-customers", { params: { limit: 5000 } });
      setBest(res.data.customers || []);
    } catch {
      setBest((current) => current || []);
    } finally {
      setBestLoading(false);
    }
  }, []);
  useEffect(() => { fetchBest(); }, [fetchBest]);
  const orderMap = useMemo(() => (best ? new Map(best.map((c) => [String(c.userId), c])) : null), [best]);

  // ── Komut paletinden gelen müşteri ──
  const handoff = useRef(undefined);
  useEffect(() => {
    if (handoff.current === undefined) handoff.current = takeHandoff(HANDOFF.user);
    if (!handoff.current) return;
    const user = users.find((u) => u._id === handoff.current);
    if (user) {
      handoff.current = null;
      setOpen({ id: user._id, tab: "orders" });
    }
  }, [users]);

  // ── Türetilmiş veriler ──
  const live = useMemo(() => users.filter((u) => !removed.has(u._id)), [users, removed]);
  const usersById = useMemo(() => new Map(live.map((u) => [String(u._id), u])), [live]);
  const customers = useMemo(() => live.filter((u) => !isAdmin(u)), [live]);
  const appSince = useMemo(() => appPeriodStart(appPeriod, now), [appPeriod, now]);

  const kpis = useMemo(() => ({
    total: customers.length,
    active: customers.filter((u) => isActive(u, now)).length,
    noOrders: orderMap ? customers.filter((u) => !hasOrders(orderMap, u)).length : null,
    risk: customers.filter((u) => isAtRisk(u, now)).length,
    today: customers.filter((u) => registeredToday(u, now)).length,
  }), [customers, orderMap, now]);

  const segmentCounts = useMemo(() => {
    const counts = {};
    for (const s of SEGMENTS) counts[s.id] = live.filter((u) => s.test(u, now, orderMap)).length;
    return counts;
  }, [live, now, orderMap]);

  const filtered = useMemo(() => {
    const seg = SEGMENTS.find((s) => s.id === segment) || SEGMENTS[0];
    const app = appFilter ? APP_FILTERS.find((f) => f.id === appFilter) : null;
    const rows = live.filter((u) => {
      if (!seg.test(u, now, orderMap)) return false;
      if (onlyToday && !registeredToday(u, now)) return false;
      if (app && (isAdmin(u) || !app.test(u, appSince, now))) return false;
      return matchesSearch(u, search);
    });
    const info = (u) => orderInfoOf(orderMap, u);
    const sorters = {
      seen: (a, b) => time(lastSeenAt(b)) - time(lastSeenAt(a)),
      newest: (a, b) => time(registeredAt(b)) - time(registeredAt(a)),
      oldest: (a, b) => time(registeredAt(a)) - time(registeredAt(b)),
      name: (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr"),
      spent: (a, b) => (info(b)?.totalSpent || 0) - (info(a)?.totalSpent || 0),
      orders: (a, b) => (info(b)?.orderCount || 0) - (info(a)?.orderCount || 0),
    };
    return rows.sort(sorters[sort] || sorters.seen);
  }, [live, segment, onlyToday, appFilter, appSince, search, sort, orderMap, now]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const hasFilter = Boolean(search || segment !== "all" || onlyToday || appFilter);
  const clearFilters = () => { setQuery(""); setSegment("all"); setOnlyToday(false); setAppFilter(null); };

  // Süzgeç değişince liste başa döner ve imleç sıfırlanır
  useEffect(() => { setVisible(PAGE_SIZE); setCursor(-1); }, [search, segment, onlyToday, appFilter, sort]);
  // Listeden düşen seçimleri temizle
  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => usersById.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [usersById]);

  // ── Seçim ──
  const toggleSelect = useCallback((id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const allShownSelected = shown.length > 0 && shown.every((u) => selected.has(u._id));
  const toggleAllShown = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((u) => u._id)));

  // ── Eylemler ──
  const openUser = useCallback((user, tab = "orders", focusPassword = false) => setOpen({ id: user._id, tab, focusPassword }), []);
  const openUserObj = open ? usersById.get(open.id) : null;
  useEffect(() => { if (open && !openUserObj) setOpen(null); }, [open, openUserObj]);

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
          onRefresh?.();
        } catch (e) {
          toast.error(e.response?.data?.message || "Kullanıcı silinemedi");
          setRemoved((current) => { const next = new Set(current); next.delete(user._id); return next; });
        }
      },
    });
  }, [onRefresh]);

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
    onRefresh?.();
  };

  const exportCsv = useCallback(() => {
    if (!filtered.length) { toast.error("Dışa aktarılacak kayıt yok"); return; }
    const rows = [
      ["Ad Soyad", "E-posta", "Telefon", "Rol", "Etiketler", "Kayıt", "Son görülme", "Sipariş", "Toplam harcama", "Uygulama ziyareti"],
      ...filtered.map((u) => {
        const info = orderInfoOf(orderMap, u);
        return [
          u.name, u.email, u.phone || "", isAdmin(u) ? "Yönetici" : "Müşteri",
          customerTags(u, orderMap, now).map((t) => t.label).join(", "),
          formatDateTime(registeredAt(u)), lastSeenAt(u) ? formatDateTime(lastSeenAt(u)) : "",
          info?.orderCount || 0, (info?.totalSpent || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          u.appActivity?.visitCount || 0,
        ];
      }),
    ];
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `musteriler-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${filtered.length} kişi CSV olarak indirildi`);
  }, [filtered, orderMap, now]);

  const refreshAll = useCallback(() => { onRefresh?.(); fetchBest(); }, [onRefresh, fetchBest]);

  // ── Klavye ──
  const moveCursor = useCallback((delta) => {
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
  const initial = loading && users.length === 0;
  const failed = Boolean(error) && users.length === 0 && !loading; // liste hiç gelmedi
  const appFilterLabel = appFilter ? APP_FILTERS.find((f) => f.id === appFilter)?.label : null;

  return (
    <div className="ui-page cus">
      <PageHeader
        title="Müşteriler"
        description="Kayıtlı müşteriler, etkinlikleri ve sipariş özetleri. Satıra tıklayınca profil açılır."
        meta={!initial && <span className="ui-badge ui-badge--brand ui-num">{customers.length}</span>}
        actions={(
          <>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm cus-help-btn" onClick={() => setHelpOpen(true)} aria-label="Klavye kısayolları" title="Klavye kısayolları (?)"><Keyboard /></button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={exportCsv} disabled={initial}><Download />CSV</button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll} disabled={loading}><RefreshCw className={loading ? "ui-spin" : undefined} />Yenile</button>
          </>
        )}
      />

      {error && (
        <div className="ui-banner ui-banner--danger cus-banner" role="alert">
          <AlertTriangle />
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={onRefresh}><RefreshCw />Tekrar dene</button>
        </div>
      )}

      {initial ? (
        <>
          <SkeletonCards count={5} />
          <SkeletonRows rows={8} />
        </>
      ) : failed ? (
        <section className="ui-panel">
          <EmptyState icon={AlertTriangle} title="Liste yüklenemedi" description="Sunucuya ulaşılamadı ya da yetki hatası oluştu. Bağlantıyı kontrol edip tekrar deneyin." action={<button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={refreshAll}><RefreshCw />Tekrar dene</button>} />
        </section>
      ) : (
        <>
          <KpiGrid columns={5} className="cus-kpis">
            <KpiCard icon={Users} label="Toplam müşteri" value={kpis.total} note={`${live.length - customers.length} yönetici hariç`} active={segment === "all" && !onlyToday && !appFilter} onClick={() => { setSegment("all"); setOnlyToday(false); setAppFilter(null); }} />
            <KpiCard icon={Zap} tone="ok" label={`Son ${ACTIVE_DAYS} gün aktif`} value={kpis.active} note={kpis.total ? `müşterilerin %${Math.round((kpis.active / kpis.total) * 100)}'i` : "—"} active={segment === "active"} onClick={() => { setSegment("active"); setOnlyToday(false); }} />
            <KpiCard icon={ShoppingBag} tone="info" label="Sipariş vermemiş" value={kpis.noOrders ?? "…"} note={orderMap ? "ilk siparişi bekleyenler" : "sipariş özeti yükleniyor"} active={segment === "noOrders"} onClick={() => { setSegment("noOrders"); setOnlyToday(false); }} />
            <KpiCard icon={AlertTriangle} tone={kpis.risk ? "warn" : undefined} label="Risk altında" value={kpis.risk} note={`${ACTIVE_DAYS}+ gündür sessiz`} active={segment === "risk"} onClick={() => { setSegment("risk"); setOnlyToday(false); }} />
            <KpiCard icon={UserPlus} tone={kpis.today ? "brand" : undefined} label="Bugün kayıt olan" value={kpis.today} note="bugün üye olanlar" active={onlyToday} onClick={() => { setOnlyToday((v) => !v); setSegment("all"); setSort("newest"); }} />
          </KpiGrid>

          <section className="cus-insights" data-open={insightsOpen}>
            <button type="button" className="cus-insights-toggle" onClick={() => setInsightsOpen((v) => !v)} aria-expanded={insightsOpen}>
              <span>İçgörüler</span>
              <span className="ui-hint">Yeni kayıtlar · en iyi müşteriler · uygulama takibi</span>
              {insightsOpen ? <ChevronUp /> : <ChevronDown />}
            </button>
            {insightsOpen && (
              <div className="cus-insights-grid">
                <RegistrationsPanel customers={customers} now={now} onOpen={openUser} />
                <BestCustomersPanel best={best || []} loading={bestLoading && !best} usersById={usersById} onOpen={openUser} />
                <AppTrackingPanel customers={customers} now={now} appSince={appSince} period={appPeriod} onPeriod={setAppPeriod} filter={appFilter} onFilter={setAppFilter} />
              </div>
            )}
          </section>

          <section className="ui-panel cus-list">
            <div className="cus-toolbar">
              <label className="ui-search cus-search">
                <Search />
                <input ref={searchRef} type="search" className="ui-field" placeholder="Ad, e-posta veya telefon ara" aria-label="Müşteri ara" value={query} onChange={(e) => setQuery(e.target.value)} data-esc-clear="1" />
              </label>
              <div className="ui-chips cus-chips" role="group" aria-label="Süzgeç">
                {SEGMENTS.map((s) => (
                  <button key={s.id} type="button" aria-pressed={segment === s.id} onClick={() => setSegment(s.id)} title={s.hint}>
                    {s.label}<span className="ui-count">{segmentCounts[s.id]}</span>
                  </button>
                ))}
              </div>
              <select className="ui-field ui-field--auto cus-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {(onlyToday || appFilter || search) && (
              <div className="cus-active">
                <span className="ui-text-sm"><strong className="ui-num">{filtered.length}</strong> kişi</span>
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
              <label className="cus-check"><input type="checkbox" className="ui-checkbox" checked={allShownSelected} onChange={toggleAllShown} aria-label="Görünenlerin hepsini seç" /></label>
              <span>Müşteri</span>
              <span>Kayıt</span>
              <span>Son görülme</span>
              <span>Siparişler</span>
              <span>Cihaz / uygulama</span>
              <span className="ui-right">İşlemler</span>
            </div>

            <div className="cus-rows" ref={listRef} role="rowgroup">
              {shown.map((user, index) => (
                <CustomerRow
                  key={user._id}
                  user={user}
                  orderMap={orderMap}
                  ordersLoaded={Boolean(orderMap)}
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

            {filtered.length === 0 && (
              hasFilter ? (
                <EmptyState icon={Search} title="Bu süzgeçlere uyan kişi yok" description="Aramayı ya da süzgeçleri değiştirin." action={<button type="button" className="ui-btn ui-btn--sm" onClick={clearFilters}><X />Filtreleri temizle</button>} />
              ) : (
                <EmptyState icon={Users} title="Henüz müşteri yok" description="Uygulamadan ya da siteden kayıt olan ilk müşteri burada görünür." action={<button type="button" className="ui-btn ui-btn--sm" onClick={refreshAll}><RefreshCw />Yenile</button>} />
              )
            )}

            <div className="cus-foot">
              <span className="ui-text-sm ui-muted ui-num">{shown.length} / {filtered.length} gösteriliyor</span>
              {filtered.length > shown.length && (
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>Daha fazla göster</button>
              )}
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
          orderMap={orderMap}
          now={now}
          initialTab={open.tab}
          focusPassword={open.focusPassword}
          onClose={() => setOpen(null)}
          onOpenChat={onOpenChat}
          onSaved={() => onRefresh?.()}
          onRoleChanged={() => onRefresh?.()}
          onDelete={deleteUser}
        />
      )}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} items={SHORTCUT_ITEMS} />
    </div>
  );
};

export default UsersTab;
