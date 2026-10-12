import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, RefreshCw, Download, Tag, X, Check, Power, Trash2, ArrowUp, ArrowDown,
  TrendingUp, TrendingDown, Percent, Ticket, Users, Coins, AlertTriangle, ChevronRight, Copy
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import { useConfirm } from "./ConfirmModal";
import CouponRequestCampaignPanel from "./CouponRequestCampaignPanel";
import MissionsPanel from "./MissionsPanel";
import CouponComposer from "./coupons/CouponComposer";
import CouponDetail from "./coupons/CouponDetail";
import UsageBars from "./coupons/UsageBars";
import {
  FILTERS, TYPE_FILTERS, SORTS, matchesType, sortCoupons, getStatus, expiryText, isLive, isSoon,
  isExpired, discountLabel, discountSub, shortTags, dailyUsage, attentionItems, buildCsv,
  downloadText, money, compactMoney, formatDate, readPref, writePref
} from "./coupons/couponUtils";
import "../styles/coupons.css";

const useMediaQuery = (query) => {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
};

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color"]);
const isTypingTarget = (el) =>
  Boolean(el) && (
    (el.tagName === "INPUT" && !NON_TEXT_INPUTS.has(el.type)) ||
    el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
  );

// Sütun başlığı: tıklanınca o sıralamaya geçer
const SortHead = ({ label, sortKey, sort, onSort, className = "" }) => (
  <button type="button" className={`cpn-th cpn-th--sortable ${className}`} onClick={() => onSort(sortKey)}
    aria-pressed={sort === sortKey} title={`${label} göre sırala`}>
    {label}
    {sort === sortKey && (sortKey === "expiring" || sortKey === "code" ? <ArrowUp /> : <ArrowDown />)}
  </button>
);

const Kpi = ({ icon: Icon, label, value, note, tone }) => (
  <div className="cpn-kpi">
    <div className="cpn-kpi-top">
      <span className="cpn-kpi-label">{label}</span>
      <span className="cpn-kpi-icon" data-tone={tone}><Icon /></span>
    </div>
    <span className="cpn-kpi-value">{value}</span>
    {note && <span className="cpn-kpi-note">{note}</span>}
  </div>
);

const SkeletonPage = () => (
  <div className="ui-page cpn" aria-busy="true" aria-label="Kuponlar yükleniyor">
    <div className="cpn-skel-head"><div className="ui-skeleton" /><div className="ui-skeleton" /></div>
    <div className="cpn-overview">
      <div className="ui-skeleton cpn-skel-hero" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="ui-skeleton cpn-skel-kpi" />)}
    </div>
    <div className="cpn-skel-list">
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="ui-skeleton" />)}
    </div>
  </div>
);

const CouponsTab = () => {
  const [coupons, setCoupons] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState("coupons");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState(() => readPref("cpn.filter", "all"));
  const [typeFilter, setTypeFilter] = useState(() => readPref("cpn.type", "all"));
  const [sort, setSort] = useState(() => readPref("cpn.sort", "newest"));
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [composer, setComposer] = useState(null); // { mode, coupon }
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const searchRef = useRef(null);
  const wide = useMediaQuery("(min-width: 1280px)");
  const { confirm } = useConfirm();

  useEffect(() => writePref("cpn.filter", filter), [filter]);
  useEffect(() => writePref("cpn.type", typeFilter), [typeFilter]);
  useEffect(() => writePref("cpn.sort", sort), [sort]);

  const fetchCoupons = useCallback(async () => {
    setRefreshing(true);
    try {
      const [response, analyticsResponse] = await Promise.all([
        axios.get("/coupons/all"),
        axios.get("/coupons/analytics")
      ]);
      const list = response.data.coupons || [];
      setCoupons(list);
      setAnalytics(analyticsResponse.data);
      setLoadError(false);
      return list;
    } catch (error) {
      setLoadError(true);
      toast.error("Kuponlar yüklenirken hata oluştu");
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const now = useMemo(() => Date.now(), [coupons]); // eslint-disable-line react-hooks/exhaustive-deps

  const campaignMap = useMemo(
    () => new Map((analytics?.campaigns || []).map((item) => [item.code, item])),
    [analytics]
  );
  const existingCodes = useMemo(() => new Set(coupons.map((c) => c.code)), [coupons]);

  const stats = useMemo(() => {
    const summary = analytics?.summary || {};
    const revenue = Number(summary.attributedRevenue || 0);
    const discount = Number(summary.totalDiscount || 0);
    return {
      total: coupons.length,
      active: coupons.filter((c) => isLive(c, now)).length,
      soon: coupons.filter((c) => isSoon(c, now)).length,
      expired: coupons.filter((c) => isExpired(c, now)).length,
      totalUsage: coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0),
      revenue,
      discount,
      orders: Number(summary.couponOrders || 0),
      discountRate: revenue + discount > 0 ? (discount / (revenue + discount)) * 100 : 0,
      perLira: discount > 0 ? revenue / discount : 0
    };
  }, [coupons, analytics, now]);

  const usage30 = useMemo(() => dailyUsage(coupons, 30, now), [coupons, now]);
  const attention = useMemo(() => attentionItems(coupons, now), [coupons, now]);

  const typed = useMemo(() => coupons.filter((c) => matchesType(c, typeFilter)), [coupons, typeFilter]);
  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, typed.filter((c) => f.match(c, now)).length])),
    [typed, now]
  );

  const visibleCoupons = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase("tr-TR");
    const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
    const list = typed.filter((c) => {
      if (!active.match(c, now)) return false;
      if (!q) return true;
      return (c.code || "").toLocaleLowerCase("tr-TR").includes(q) ||
        (c.description || "").toLocaleLowerCase("tr-TR").includes(q);
    });
    return sortCoupons(list, sort, campaignMap, now);
  }, [typed, searchTerm, filter, sort, campaignMap, now]);

  const selected = coupons.find((c) => c._id === selectedId) || null;
  const filtersActive = filter !== "all" || typeFilter !== "all" || searchTerm.trim() !== "";

  // Silinen/kaybolan kuponları seçimlerden temizle
  useEffect(() => {
    const ids = new Set(coupons.map((c) => c._id));
    setChecked((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    if (selectedId && !ids.has(selectedId)) setSelectedId(null);
  }, [coupons, selectedId]);

  // Klavye kısayolları: "/" arama, "n" yeni kupon, Esc detayı kapatır
  useEffect(() => {
    if (section !== "coupons") return undefined;
    const onKey = (e) => {
      if (composer || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector(".ui-modal-backdrop")) return;
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === "n" || e.key === "N") && !isTypingTarget(e.target)) {
        e.preventDefault();
        setComposer({ mode: "create", coupon: null });
      } else if (e.key === "Escape" && selectedId && !isTypingTarget(e.target)) {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section, composer, selectedId]);

  const setBusy = (id, on) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const handleToggle = async (coupon) => {
    setBusy(coupon._id, true);
    setCoupons((prev) => prev.map((c) => (c._id === coupon._id ? { ...c, isActive: !c.isActive } : c)));
    try {
      await axios.patch(`/coupons/${coupon._id}/toggle`);
      toast.success(coupon.isActive ? `${coupon.code} pasife alındı` : `${coupon.code} yayında`);
      fetchCoupons();
    } catch (error) {
      setCoupons((prev) => prev.map((c) => (c._id === coupon._id ? { ...c, isActive: coupon.isActive } : c)));
      toast.error("Kupon durumu güncellenemedi");
    } finally {
      setBusy(coupon._id, false);
    }
  };

  const handleDelete = async (coupon) => {
    const used = coupon.usedBy?.length || 0;
    const ok = await confirm({
      title: `${coupon.code} silinsin mi?`,
      message: used
        ? `Bu kupon ${used} kez kullanıldı; silerseniz kullanım geçmişi de kaybolur. Geçmişi korumak için pasife almayı düşünün.`
        : "Kupon kalıcı olarak silinecek.",
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!ok) return;
    try {
      await axios.delete(`/coupons/${coupon._id}`);
      toast.success("Kupon silindi");
      if (selectedId === coupon._id) setSelectedId(null);
      fetchCoupons();
    } catch (error) {
      toast.error("Silme işlemi başarısız");
    }
  };

  const handleCopyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`${code} kopyalandı`);
    } catch {
      toast.error("Kod kopyalanamadı");
    }
  };

  // Toplu işlemler (mevcut uç noktalarla, kupon başına istek)
  const checkedCoupons = coupons.filter((c) => checked.has(c._id));

  const runBulk = async (targets, request, successText) => {
    if (targets.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(targets.map(request));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`${failed} kupon için işlem başarısız oldu`);
    if (targets.length - failed > 0) toast.success(successText(targets.length - failed));
    setBulkBusy(false);
    setChecked(new Set());
    fetchCoupons();
  };

  const bulkActivate = () =>
    runBulk(checkedCoupons.filter((c) => !c.isActive), (c) => axios.patch(`/coupons/${c._id}/toggle`), (n) => `${n} kupon yayına alındı`);
  const bulkDeactivate = () =>
    runBulk(checkedCoupons.filter((c) => c.isActive), (c) => axios.patch(`/coupons/${c._id}/toggle`), (n) => `${n} kupon pasife alındı`);
  const bulkDelete = async () => {
    const usedCount = checkedCoupons.filter((c) => (c.usedBy?.length || 0) > 0).length;
    const ok = await confirm({
      title: `${checkedCoupons.length} kupon silinsin mi?`,
      message: usedCount
        ? `Seçilenlerden ${usedCount} tanesi kullanılmış; silerseniz kullanım geçmişleri de kaybolur.`
        : "Seçilen kuponlar kalıcı olarak silinecek.",
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!ok) return;
    runBulk(checkedCoupons, (c) => axios.delete(`/coupons/${c._id}`), (n) => `${n} kupon silindi`);
  };

  const allVisibleChecked = visibleCoupons.length > 0 && visibleCoupons.every((c) => checked.has(c._id));
  const someVisibleChecked = visibleCoupons.some((c) => checked.has(c._id));
  const toggleAllVisible = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visibleCoupons.forEach((c) => next.delete(c._id));
      else visibleCoupons.forEach((c) => next.add(c._id));
      return next;
    });
  const toggleChecked = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const list = checkedCoupons.length ? sortCoupons(checkedCoupons, sort, campaignMap, now) : visibleCoupons;
    if (!list.length) return toast.error("Dışa aktarılacak kupon yok");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(buildCsv(list, campaignMap, now), `kuponlar-${stamp}.csv`);
    toast.success(`${list.length} kupon CSV olarak indirildi`);
  };

  const handleSaved = async (code) => {
    const list = await fetchCoupons();
    const saved = list?.find((c) => c.code === code);
    if (saved) {
      setSelectedId(saved._id);
      setSection("coupons");
    }
  };

  const openCreate = () => {
    setSection("coupons");
    setComposer({ mode: "create", coupon: null });
  };

  const clearFilters = () => {
    setFilter("all");
    setTypeFilter("all");
    setSearchTerm("");
  };

  const selectFromAttention = (id) => {
    setFilter("all");
    setTypeFilter("all");
    setSearchTerm("");
    setSelectedId(id);
    setTimeout(() => document.getElementById(`cpn-row-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  };

  if (loading) return <SkeletonPage />;

  const sections = [
    { key: "coupons", label: "Kuponlar", count: coupons.length },
    { key: "requests", label: "Kupon isteği kampanyası" },
    { key: "missions", label: "Sipariş görevleri" }
  ];
  // Küçük örneklerde yüzde yanıltıcı olur; önceki dönemde en az 5 kullanım varsa göster
  const trend = usage30.previous >= 5 ? ((usage30.current - usage30.previous) / usage30.previous) * 100 : null;
  const showInlineDetail = wide && selected;

  const detail = selected && (
    <CouponDetail
      key={selected._id}
      coupon={selected}
      stats={campaignMap.get(selected.code)}
      now={now}
      onClose={() => setSelectedId(null)}
      onEdit={(c) => setComposer({ mode: "edit", coupon: c })}
      onDuplicate={(c) => setComposer({ mode: "duplicate", coupon: c })}
      onToggle={handleToggle}
      onDelete={handleDelete}
      onCopy={handleCopyCode}
      toggling={busyIds.has(selected._id)}
    />
  );

  return (
    <div className="ui-page cpn">
      <header className="app-pagehead cpn-head">
        <div>
          <h1>Kuponlar</h1>
          <p>Kampanyalarınızı oluşturun, performansını izleyin, zamanında müdahale edin.</p>
        </div>
        <div className="cpn-head-actions">
          {section === "coupons" && (
            <button type="button" className="ui-btn" onClick={exportCsv} title="Listeyi CSV olarak indir">
              <Download />CSV
            </button>
          )}
          <button type="button" onClick={openCreate} className="ui-btn ui-btn--primary">
            <Plus />Yeni kupon<kbd className="cpn-kbd cpn-kbd--onbrand">N</kbd>
          </button>
        </div>
      </header>

      <nav className="cpn-sections" role="tablist" aria-label="Kupon bölümleri">
        {sections.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={section === s.key}
            onClick={() => setSection(s.key)} className="cpn-section">
            {s.label}
            {typeof s.count === "number" && <span className="cpn-section-count">{s.count}</span>}
          </button>
        ))}
      </nav>

      {section === "requests" && <CouponRequestCampaignPanel />}
      {section === "missions" && <MissionsPanel />}

      {section === "coupons" && (
        <>
          {loadError && coupons.length === 0 ? (
            <div className="ui-panel ui-empty">
              <AlertTriangle />
              <p>Kuponlar yüklenemedi.</p>
              <button type="button" className="ui-btn ui-btn--sm" onClick={fetchCoupons}><RefreshCw />Tekrar dene</button>
            </div>
          ) : (
            <>
              {/* Genel bakış */}
              <div className="cpn-overview">
                <div className="cpn-hero">
                  <div className="cpn-hero-top">
                    <div>
                      <span className="cpn-hero-label">Kuponlu sipariş geliri</span>
                      <strong className="cpn-hero-value">{money(stats.revenue)}</strong>
                      <span className="cpn-hero-note">{stats.orders.toLocaleString("tr-TR")} siparişten · tüm zamanlar</span>
                    </div>
                    <span className="cpn-hero-icon"><TrendingUp /></span>
                  </div>
                  <div className="cpn-hero-chart">
                    <div className="cpn-hero-chart-head">
                      <span>Son 30 günde <strong>{usage30.current}</strong> kullanım</span>
                      {trend !== null && (
                        <span className="cpn-trend" data-dir={trend >= 0 ? "up" : "down"}>
                          {trend >= 0 ? <TrendingUp /> : <TrendingDown />}
                          %{Math.abs(trend).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                    <UsageBars buckets={usage30.buckets} variant="onbrand" height={70} />
                  </div>
                </div>

                <Kpi icon={Percent} label="Verilen toplam indirim" value={money(stats.discount)}
                  note={`Sepet tutarının %${stats.discountRate.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}'i`} />
                <Kpi icon={Ticket} label="Aktif kupon" tone="ok"
                  value={<>{stats.active}<small> / {stats.total}</small></>}
                  note={stats.soon > 0 ? `${stats.soon} tanesi 7 gün içinde bitiyor` : "7 gün içinde biten yok"} />
                <Kpi icon={Users} label="Toplam kullanım" value={stats.totalUsage.toLocaleString("tr-TR")}
                  note={`${stats.expired} kuponun süresi doldu`} />
                <Kpi icon={Coins} label="İndirim verimi" tone="info"
                  value={stats.perLira ? <>{money(stats.perLira, 1)}<small> / ₺1</small></> : "-"}
                  note="₺1 indirim başına sipariş geliri" />
              </div>

              {attention.length > 0 && (
                <section className="cpn-attention" aria-label="Dikkat gerektiren kuponlar">
                  <div className="cpn-attention-head">
                    <AlertTriangle />
                    <strong>{attention.length} kupon ilgini bekliyor</strong>
                  </div>
                  <div className="cpn-attention-list">
                    {attention.slice(0, 6).map((a) => (
                      <button key={a.id} type="button" className="cpn-attention-item" data-tone={a.tone} onClick={() => selectFromAttention(a.id)}>
                        <span className="ui-mono">{a.code}</span>
                        <small>{a.text}</small>
                        <ChevronRight />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Çalışma alanı: liste + detay */}
              <div className="cpn-workspace" data-detail={showInlineDetail ? "open" : "closed"}>
                <section className="ui-panel cpn-list" data-compact={showInlineDetail ? "true" : "false"}>
                  <div className="cpn-toolbar">
                    <div className="ui-search cpn-search">
                      <Search />
                      <input ref={searchRef} type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Kod veya açıklama ara" aria-label="Kupon ara" className="ui-field" />
                      {!searchTerm && <kbd className="cpn-kbd cpn-search-kbd">/</kbd>}
                    </div>
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="ui-field cpn-select" aria-label="Kupon türü">
                      {TYPE_FILTERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value)} className="ui-field cpn-select" aria-label="Sıralama">
                      {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button type="button" onClick={fetchCoupons} className="ui-icon-btn" title="Yenile" aria-label="Yenile" disabled={refreshing}>
                      <RefreshCw className={refreshing ? "ui-spin" : undefined} />
                    </button>
                  </div>
                  <div className="cpn-filterbar">
                    <div className="ui-chips cpn-filters" role="group" aria-label="Durum filtresi">
                      {FILTERS.map((f) => (
                        <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
                          {f.tone && <span className={`ui-dot ui-dot--${f.tone}`} />}
                          {f.label}
                          <span className="cpn-chip-count">{filterCounts[f.key] || 0}</span>
                        </button>
                      ))}
                    </div>
                    {filtersActive && (
                      <button type="button" className="cpn-clear" onClick={clearFilters}><X />Filtreleri temizle</button>
                    )}
                  </div>

                  {checked.size > 0 && (
                    <div className="cpn-bulk" role="region" aria-label="Toplu işlemler">
                      <span className="cpn-bulk-count"><Check />{checked.size} kupon seçildi</span>
                      <div className="cpn-bulk-actions">
                        <button type="button" className="ui-btn ui-btn--sm" onClick={bulkActivate} disabled={bulkBusy}><Power />Yayına al</button>
                        <button type="button" className="ui-btn ui-btn--sm" onClick={bulkDeactivate} disabled={bulkBusy}><Power />Pasife al</button>
                        <button type="button" className="ui-btn ui-btn--sm" onClick={exportCsv} disabled={bulkBusy}><Download />CSV</button>
                        <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={bulkDelete} disabled={bulkBusy}><Trash2 />Sil</button>
                        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => setChecked(new Set())} aria-label="Seçimi temizle"><X /></button>
                      </div>
                    </div>
                  )}

                  {visibleCoupons.length === 0 ? (
                    <div className="ui-empty cpn-empty">
                      <Tag />
                      <p>{coupons.length === 0 ? "Henüz kupon yok" : "Bu filtrelere uyan kupon yok"}</p>
                      <span className="ui-text-xs ui-muted">
                        {coupons.length === 0 ? "İlk kuponunu hazır şablonlardan biriyle saniyeler içinde oluşturabilirsin." : "Filtreleri değiştirmeyi ya da aramayı temizlemeyi dene."}
                      </span>
                      {coupons.length === 0 ? (
                        <button type="button" onClick={openCreate} className="ui-btn ui-btn--primary ui-btn--sm"><Plus />İlk kuponu oluştur</button>
                      ) : (
                        <button type="button" onClick={clearFilters} className="ui-btn ui-btn--sm">Filtreleri temizle</button>
                      )}
                    </div>
                  ) : (
                    <div className="cpn-table" role="table" aria-label="Kuponlar" aria-rowcount={visibleCoupons.length}>
                      <div className="cpn-tr cpn-thead" role="row">
                        <span className="cpn-th cpn-col-check" role="columnheader">
                          <input type="checkbox" checked={allVisibleChecked}
                            ref={(el) => { if (el) el.indeterminate = !allVisibleChecked && someVisibleChecked; }}
                            onChange={toggleAllVisible} aria-label="Görünen tüm kuponları seç" />
                        </span>
                        <SortHead label="Kupon" sortKey="code" sort={sort} onSort={setSort} className="cpn-col-main" />
                        <span className="cpn-th cpn-col-status" role="columnheader">Durum</span>
                        <span className="cpn-th cpn-col-value" role="columnheader">İndirim</span>
                        <SortHead label="Kullanım" sortKey="usage" sort={sort} onSort={setSort} className="cpn-col-usage" />
                        <SortHead label="Gelir" sortKey="revenue" sort={sort} onSort={setSort} className="cpn-col-revenue" />
                        <SortHead label="Bitiş" sortKey="expiring" sort={sort} onSort={setSort} className="cpn-col-expiry" />
                        <span className="cpn-th cpn-col-toggle" role="columnheader"><span className="cpn-sr">Yayında</span></span>
                      </div>

                      {visibleCoupons.map((c) => {
                        const st = getStatus(c, now);
                        const s = campaignMap.get(c.code);
                        const used = c.usageCount || 0;
                        const pct = c.usageLimit ? Math.min(100, (used / c.usageLimit) * 100) : null;
                        const tags = shortTags(c);
                        const isSel = selectedId === c._id;
                        return (
                          <div
                            key={c._id}
                            id={`cpn-row-${c._id}`}
                            role="row"
                            tabIndex={0}
                            className="cpn-tr cpn-row"
                            data-status={st.key}
                            data-selected={isSel}
                            data-checked={checked.has(c._id)}
                            onClick={() => setSelectedId(isSel ? null : c._id)}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(isSel ? null : c._id); }
                            }}
                            aria-selected={isSel}
                          >
                            <span className="cpn-td cpn-col-check" role="cell" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={checked.has(c._id)} onChange={() => toggleChecked(c._id)} aria-label={`${c.code} seç`} />
                            </span>
                            <span className="cpn-td cpn-col-main" role="cell">
                              <span className="cpn-code-line">
                                <span className="cpn-code">{c.code}</span>
                                <button type="button" className="cpn-copy" onClick={(e) => { e.stopPropagation(); handleCopyCode(c.code); }} aria-label={`${c.code} kodunu kopyala`} title="Kodu kopyala">
                                  <Copy />
                                </button>
                                <span className={`ui-badge cpn-inline-status ${st.tone ? `ui-badge--${st.tone}` : ""}`}>{st.label}</span>
                              </span>
                              <span className="cpn-desc">{c.description || "Açıklama yok"}</span>
                              {tags.length > 0 && (
                                <span className="cpn-tags">{tags.map((t) => <span key={t} className="cpn-tag">{t}</span>)}</span>
                              )}
                            </span>
                            <span className="cpn-td cpn-col-status" role="cell">
                              <span className={`ui-badge ${st.tone ? `ui-badge--${st.tone}` : ""}`}>
                                <span className={`ui-dot ${st.tone ? `ui-dot--${st.tone}` : ""}`} />{st.label}
                              </span>
                            </span>
                            <span className="cpn-td cpn-col-value" role="cell">
                              <span className="cpn-value-chip" data-type={c.discountType}>{discountLabel(c)}</span>
                              <small>{discountSub(c)}</small>
                            </span>
                            <span className="cpn-td cpn-col-usage" role="cell">
                              <span className="cpn-num"><strong>{used.toLocaleString("tr-TR")}</strong><small>{c.usageLimit ? ` / ${c.usageLimit}` : " / ∞"}</small></span>
                              {pct !== null && (
                                <span className="cpn-meter" data-full={pct >= 100} data-high={pct >= 80}><i style={{ width: `${pct}%` }} /></span>
                              )}
                            </span>
                            <span className="cpn-td cpn-col-revenue" role="cell">
                              <span className="cpn-num"><strong>{compactMoney(s?.revenue)}</strong></span>
                              <small>{s?.discount ? `−${compactMoney(s.discount)}` : "—"}</small>
                            </span>
                            <span className="cpn-td cpn-col-expiry" role="cell">
                              <span className="cpn-num">{formatDate(c.expirationDate)}</span>
                              <small data-tone={st.key === "soon" ? "warn" : st.key === "expired" ? "danger" : undefined}>{expiryText(c, now)}</small>
                            </span>
                            <span className="cpn-td cpn-col-toggle" role="cell" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="ui-toggle" aria-pressed={Boolean(c.isActive)}
                                onClick={() => handleToggle(c)} disabled={busyIds.has(c._id)}
                                aria-label={c.isActive ? `${c.code} pasife al` : `${c.code} yayına al`}
                                title={c.isActive ? "Pasife al" : "Yayına al"}>
                                <i />
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="cpn-list-foot">
                    <span>{visibleCoupons.length} / {coupons.length} kupon</span>
                    <span className="cpn-list-foot-hint">
                      <kbd className="cpn-kbd">/</kbd> ara · <kbd className="cpn-kbd">N</kbd> yeni kupon · satıra tıkla: detay
                    </span>
                  </div>
                </section>

                {showInlineDetail && <aside className="ui-panel cpn-detail-panel" aria-label="Kupon detayı">{detail}</aside>}
              </div>
            </>
          )}
        </>
      )}

      {/* Dar ekranlarda detay çekmecede açılır */}
      {section === "coupons" && selected && !wide && !composer && (
        <div className="ui-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
          <aside className="ui-drawer cpn-detail-drawer" role="dialog" aria-modal="true" aria-label={`${selected.code} detayı`}>
            {detail}
          </aside>
        </div>
      )}

      {composer && (
        <CouponComposer
          mode={composer.mode}
          coupon={composer.coupon}
          existingCodes={existingCodes}
          onClose={() => setComposer(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default CouponsTab;
