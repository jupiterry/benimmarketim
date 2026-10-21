// Liste görünümü: geçmiş ve arama aracı. Sıralanabilir başlıklar, sayfadakileri seçme (kısmi seçimde ara durum),
// gün ayırıcıları, sayfa boyutu (25/50/100), sayfalama, daha eski siparişleri yükleme ve sunucuda
// "Tüm siparişlerde ara". Sözleşme: CONTRACTS.md §7.6. Stil: styles/orders-list.css (önek so-l-).
import { Fragment, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox, Loader2,
  RefreshCw, Search, X,
} from "lucide-react";
import { EmptyState, useIsMobile } from "../admin/ui";
import { LoadOlderButton, SelectCheck, useStepGuard } from "./atoms";
import { PAGE_SIZES, SEARCH_LIMIT, dayKey, dayLabel } from "./shared";
import OrderRow from "./OrderRow";
import "../../styles/orders-list.css";

const EMPTY_SET = new Set();
const EMPTY_MAP = new Map();
const SEARCH_MIN = 3;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Kayan 5 sayfalık pencere: [1 2 3 4 5], [4 5 6 7 8] … */
const pageWindow = (page, pageCount) => {
  const size = Math.min(5, pageCount);
  let start = Math.max(1, page - 2);
  start = Math.min(start, pageCount - size + 1);
  return Array.from({ length: size }, (_, i) => start + i);
};

/**
 * Sıralama başlığı. admin/ui SortHead ile aynı görünüm (ui-th), ama Türkçe yönelme ekli ve yön bildiren
 * erişilebilir ad ("Tutara göre sırala…"); SortHead'in sabit title'ı "Tutar göre sırala" olurdu.
 */
const SortButton = ({ label, active, dir = "desc", state, onClick, title, className = "" }) => (
  <button type="button" className={`ui-th so-l-sort ${className}`} aria-pressed={active} onClick={onClick} title={title}>
    <span>{label}</span>
    {active && state && <span className="so-sr">, {state}</span>}
    {active && (dir === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />)}
  </button>
);

/** Gün ayırıcı: "Bugün · 21 Ekim Çarşamba", "Dün · …", "4 Ekim Cumartesi" */
const DaySeparator = ({ value, now }) => {
  const label = dayLabel(value, now);
  const relative = label === "Bugün" || label === "Dün";
  const full = relative
    ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" })
    : null;
  return (
    <div className="so-l-day" role="heading" aria-level={3}>
      <span className="so-l-day-label">{label}</span>
      {full && <span className="so-l-day-date">{full}</span>}
    </div>
  );
};

/** Sunucu araması durumu: idle → düğme, loading → "Aranıyor…", done → sonuç sayısı, error → tekrar dene */
const SearchAllStrip = ({ query, state, count, onSearchAll, scopeNote }) => {
  if (state === "loading") {
    return (
      <div className="so-l-search" data-state="loading">
        <Loader2 className="ui-spin" aria-hidden="true" />
        <span className="so-l-search-text">Tüm siparişlerde “{query}” aranıyor…</span>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="so-l-search" data-state="done">
        <CheckCircle2 aria-hidden="true" />
        <span className="so-l-search-text">
          <strong>Sunucuda {count} sipariş bulundu</strong>
          {count >= SEARCH_LIMIT
            ? ` · ilk ${SEARCH_LIMIT} sonuç listeye eklendi; aramayı daraltın.`
            : count > 0 ? " · son 30 günün dışındakiler “Arşiv” etiketiyle listede." : " · başka eşleşme yok."}
        </span>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="so-l-search" data-state="error">
        <AlertTriangle aria-hidden="true" />
        <span className="so-l-search-text"><strong>Sunucu araması yapılamadı.</strong> Bağlantıyı kontrol edip tekrar deneyin.</span>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onSearchAll}>
          <RefreshCw aria-hidden="true" />Tekrar dene
        </button>
      </div>
    );
  }
  return (
    <div className="so-l-search" data-state="idle">
      <Search aria-hidden="true" />
      <span className="so-l-search-text">
        Yalnızca yüklü siparişlerde arandı{scopeNote ? ` (${scopeNote})` : ""}.
      </span>
      <button type="button" className="ui-btn ui-btn--sm" onClick={onSearchAll}>
        <Search aria-hidden="true" />Tüm siparişlerde ara
      </button>
    </div>
  );
};

/**
 * Masaüstü: « ‹ 1 2 3 4 5 › » · mobil: ‹ 2 / 5 ›. İlk / son sayfaya geçiş, basılan ok düğmesini devre dışı bırakır;
 * odak <body>'ye düşmesin diye geçerli sayfa düğmesine (mobilde karşı oka) taşınır.
 */
const Pagination = ({ page, pageCount, onPage, compact }) => {
  const navRef = useRef(null);
  const go = (n, e) => {
    const next = Math.min(Math.max(1, n), pageCount);
    if (next === page) return;
    const button = e?.currentTarget;
    const hadFocus = Boolean(button) && document.activeElement === button;
    onPage?.(next);
    const forward = next > page;
    if (!hadFocus || !button.hasAttribute("data-edge") || (forward ? next < pageCount : next > 1)) return;
    requestAnimationFrame(() => {
      const nav = navRef.current;
      const current = document.activeElement;
      if (!nav?.isConnected || (current && current !== document.body && current.isConnected && !current.disabled)) return;
      const target = compact
        ? nav.querySelector(`[data-edge="${forward ? "prev" : "next"}"]:not(:disabled)`)
        : nav.querySelector('[aria-current="page"]');
      target?.focus({ preventScroll: true });
    });
  };
  if (compact) {
    return (
      <nav ref={navRef} className="ui-pagination so-l-pages" data-compact="true" aria-label="Sayfalama">
        <button type="button" data-edge="prev" onClick={(e) => go(page - 1, e)} disabled={page <= 1} aria-label="Önceki sayfa" title="Önceki sayfa">
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className="so-l-pages-now"><span className="so-sr">Sayfa </span>{page} / {pageCount}</span>
        <button type="button" data-edge="next" onClick={(e) => go(page + 1, e)} disabled={page >= pageCount} aria-label="Sonraki sayfa" title="Sonraki sayfa">
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>
    );
  }
  return (
    <nav ref={navRef} className="ui-pagination so-l-pages" aria-label="Sayfalama">
      <button type="button" data-edge="prev" onClick={(e) => go(1, e)} disabled={page <= 1} aria-label="İlk sayfa" title="İlk sayfa">
        <ChevronsLeft aria-hidden="true" />
      </button>
      <button type="button" data-edge="prev" onClick={(e) => go(page - 1, e)} disabled={page <= 1} aria-label="Önceki sayfa" title="Önceki sayfa">
        <ChevronLeft aria-hidden="true" />
      </button>
      {pageWindow(page, pageCount).map((n) => (
        <button key={n} type="button" onClick={() => go(n)} aria-current={n === page ? "page" : undefined} aria-label={`${n}. sayfa`}>
          {n}
        </button>
      ))}
      <button type="button" data-edge="next" onClick={(e) => go(page + 1, e)} disabled={page >= pageCount} aria-label="Sonraki sayfa" title="Sonraki sayfa">
        <ChevronRight aria-hidden="true" />
      </button>
      <button type="button" data-edge="next" onClick={(e) => go(pageCount, e)} disabled={page >= pageCount} aria-label="Son sayfa" title="Son sayfa">
        <ChevronsRight aria-hidden="true" />
      </button>
    </nav>
  );
};

export default function ListView({
  orders = [], total = 0, page = 1, pageCount = 1, onPage, pageSize = PAGE_SIZES[0], onPageSize, sort = "newest", onSort,
  ui, actions: actionsProp, hasFilter = false, onClearFilters, query = "", scopeNote = null,
  hasOlder = false, loadingOlder = false, onLoadOlder, windowStart,
  searchAll, onSearchAll,
}) {
  const isMobile = useIsMobile();
  const rootRef = useRef(null);

  // Görünüm genelinde tıklama koruması ve odak koruması (atoms.jsx useStepGuard)
  const actions = useStepGuard(actionsProp, rootRef);
  const now = ui?.now ?? Date.now();
  const selectedIds = ui?.selectedIds || EMPTY_SET;
  const selecting = Boolean(ui?.selecting ?? selectedIds.size > 0);

  // ── Sayfadakileri seç (kısmi seçimde ara durum) ──
  const pageIds = useMemo(() => orders.map((o) => o.orderId), [orders]);
  const selectedOnPage = pageIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0);
  const allSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  // ── Sıralama ──
  const dateSort = sort === "newest" || sort === "oldest";
  const dayGroups = dateSort; // tutar/bekleme sıralamasında gün ayırıcısı her satırda araya girerdi
  const sortOrder = () => onSort?.(sort === "newest" ? "oldest" : "newest");
  const sortBy = (key) => onSort?.(sort === key ? "newest" : key);

  // ── Sunucu araması ──
  const q = String(query || "").trim();
  const searchable = q.length >= SEARCH_MIN;
  const staleSearch = searchAll?.query !== undefined && searchAll?.query !== null && String(searchAll.query).trim() !== q;
  const searchState = !searchAll || staleSearch ? "idle" : searchAll.state || "idle";
  const searchCount = Number(searchAll?.count) || 0;
  // Her şey yüklüyse (daha eski sipariş yoksa) sunucu araması yeni bir şey bulamaz; düğme gizlenir
  const showSearch = searchable && (hasOlder || searchState !== "idle");

  // ── Sayfa değişince listenin başına dön (yalnızca liste başı görünür alanın üstündeyse) ──
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const el = rootRef.current;
    if (!el || el.getBoundingClientRect().top >= 0) return;
    el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [page]);

  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const extraIds = ui?.extraIds || EMPTY_SET;
  const printedAt = ui?.printedAt || EMPTY_MAP;
  const picked = ui?.picked || EMPTY_MAP;
  const unseenIds = ui?.unseenIds || EMPTY_SET;
  const freshIds = ui?.freshIds || EMPTY_SET;

  // ── Boş durum ──
  if (!orders.length) {
    const actionsRow = (
      <>
        {hasFilter && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={onClearFilters}>
            <X aria-hidden="true" />Filtreleri temizle
          </button>
        )}
        {showSearch && searchState === "idle" && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onSearchAll}>
            <Search aria-hidden="true" />Tüm siparişlerde ara
          </button>
        )}
        <LoadOlderButton hasOlder={hasOlder} loading={loadingOlder} onLoad={onLoadOlder} windowStart={windowStart} compact />
      </>
    );
    const hasActions = hasFilter || (showSearch && searchState === "idle") || hasOlder;
    return (
      <section ref={rootRef} className="ui-panel so-l" data-empty="true" aria-label="Sipariş listesi">
        {hasFilter ? (
          <EmptyState
            icon={Search}
            title="Bu filtrelere uyan sipariş yok"
            description="Aramayı ya da filtreleri değiştirin."
            action={hasActions ? actionsRow : null}
            className="so-l-empty"
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title={hasOlder ? "Son 30 günde sipariş yok" : "Henüz sipariş yok"}
            description={hasOlder
              ? "Daha eski siparişleri yükleyebilirsiniz. Yeni sipariş gelince burada anında görünür."
              : "İlk sipariş geldiğinde burada anında görünür."}
            action={hasActions ? actionsRow : null}
            className="so-l-empty"
          />
        )}
        {showSearch && searchState !== "idle" && (
          <SearchAllStrip query={q} state={searchState} count={searchCount} onSearchAll={onSearchAll} scopeNote={scopeNote} />
        )}
      </section>
    );
  }

  // ── Satırlar (tarih sıralamasında gün değişince ayırıcı) ──
  let lastDay = null;
  const rows = orders.map((order) => {
    const id = order.orderId;
    const created = order.createdMs ?? order.createdAt;
    const day = dayKey(created);
    const separator = dayGroups && day !== lastDay;
    lastDay = day;
    return (
      <Fragment key={id}>
        {separator && <DaySeparator value={created} now={now} />}
        <OrderRow
          order={order}
          now={now}
          active={ui?.activeId === id}
          cursor={ui?.cursorId === id}
          selected={selectedIds.has(id)}
          fresh={freshIds.has(id)}
          unseen={unseenIds.has(id)}
          printedAt={printedAt.get(id)}
          picked={picked.get(id)}
          selecting={selecting}
          archived={extraIds.has(id)}
          actions={actions}
          dated={!dayGroups}
          mobile={isMobile}
        />
      </Fragment>
    );
  });

  return (
    <section ref={rootRef} className="ui-panel so-l" aria-label="Sipariş listesi" data-selecting={selecting ? "true" : undefined}>
      <div className="so-l-head">
        <SelectCheck
          className="so-l-check"
          checked={allSelected}
          indeterminate={someSelected}
          label="Bu sayfadakileri seç"
          onChange={() => actions?.selectMany?.(pageIds, !allSelected)}
        />
        <span className="so-l-h so-l-h-main">
          <SortButton
            label="Sipariş"
            active={dateSort}
            dir={sort === "oldest" ? "asc" : "desc"}
            state={sort === "oldest" ? "en eski üstte" : "en yeni üstte"}
            onClick={sortOrder}
            title={sort === "newest" ? "Sipariş tarihine göre sırala: en eski üstte" : "Sipariş tarihine göre sırala: en yeni üstte"}
          />
          {isMobile && <span className="so-l-h-note">{dateSort ? (sort === "oldest" ? "En eski üstte" : "En yeni üstte") : sort === "amount" ? "Tutara göre" : "Beklemeye göre"}</span>}
        </span>
        <span className="so-l-h so-l-h-dlv">Teslimat</span>
        <span className="so-l-h so-l-h-state">
          <span>Durum</span>
          <span className="so-l-h-sep" aria-hidden="true">·</span>
          <SortButton
            label="Bekleme"
            active={sort === "wait"}
            state="en uzun bekleyen üstte"
            onClick={() => sortBy("wait")}
            title={sort === "wait" ? "En yeniye göre sıralamaya dön" : "Bekleme süresine göre sırala: en uzun üstte"}
          />
        </span>
        <span className="so-l-h so-l-h-amount">
          <SortButton
            label="Tutar"
            active={sort === "amount"}
            state="en yüksek üstte"
            onClick={() => sortBy("amount")}
            title={sort === "amount" ? "En yeniye göre sıralamaya dön" : "Tutara göre sırala: en yüksek üstte"}
          />
        </span>
        <span className="so-l-h so-l-h-act" aria-hidden="true" />
      </div>

      <div className="so-l-rows">{rows}</div>

      <div className="so-l-foot">
        <span className="so-l-foot-info">
          <span className="so-l-foot-count">
            <strong className="ui-num">{total}</strong> sipariş
            {pageCount > 1 && <span className="so-l-foot-range ui-num"> · {from}–{to} arası</span>}
          </span>
          {scopeNote && <span className="so-l-foot-scope" title="Liste bu kapsamdaki siparişleri gösterir">{scopeNote}</span>}
        </span>
        <LoadOlderButton hasOlder={hasOlder} loading={loadingOlder} onLoad={onLoadOlder} windowStart={windowStart} compact />
        <span className="so-l-foot-grow" />
        {(total > PAGE_SIZES[0] || pageSize !== PAGE_SIZES[0]) && (
          <label className="so-l-size">
            <span>Sayfada</span>
            <select
              className="ui-field ui-field--sm ui-field--auto"
              value={pageSize}
              onChange={(e) => onPageSize?.(Number(e.target.value))}
              aria-label="Sayfa başına sipariş sayısı"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPage={onPage} compact={isMobile} />}
      </div>

      {showSearch && (
        <SearchAllStrip query={q} state={searchState} count={searchCount} onSearchAll={onSearchAll} scopeNote={scopeNote} />
      )}
    </section>
  );
}
