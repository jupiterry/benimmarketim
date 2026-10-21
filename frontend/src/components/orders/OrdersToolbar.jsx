// Siparişler ekranının araç çubuğu (C4): arama, görünüme özgü filtreler, "Filtreler" düğmesi ve etkin filtre etiketleri.
// Filtre çekmecesi (FilterDrawer) P6'dadır; bu bileşen yalnızca onOpenFilters çağırır.
// Stil: styles/orders-overview.css (önek so-ov-). Sözleşme: scratchpad/orders-design/CONTRACTS.md §7.3
import { AlertCircle, ArrowUpDown, CalendarDays, Layers, Search, SlidersHorizontal, X } from "lucide-react";
import {
  DATE_OPTIONS, DEFAULT_FILTERS, DELAY_HINT, POINT_FILTERS, SORTS, STATUS_CHIPS, filterTags, hasAnyFilter,
} from "./shared";
import "../../styles/orders-overview.css";

const count = (n) => (Number(n) || 0).toLocaleString("tr-TR");

/** Simgeli, etiketi ekran okuyucuya verilen seçim kutusu (tarih / sıralama) */
const IconSelect = ({ icon: Icon, label, value, options, onChange, active = false, title, optionTitle, className = "" }) => (
  <span className={`so-ov-select ${className}`} data-active={active ? "true" : undefined} title={title}>
    <Icon aria-hidden="true" />
    <select className="ui-field ui-field--auto" aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value} title={optionTitle?.(o)}>{o.label}</option>)}
    </select>
  </span>
);

export default function OrdersToolbar({
  view = "now", filters, onFilters, onClear, searchRef, statusCounts, pointCounts, lateCount = 0,
  groupByPoint = false, onGroupByPoint, sort = "newest", onSort, advancedCount = 0, filtersOpen = false, onOpenFilters,
  resultCount = 0, scopeNote = null,
}) {
  const f = filters || DEFAULT_FILTERS;
  const q = f.q ?? "";
  const patch = (next) => onFilters?.(next);
  const showTags = hasAnyFilter(f, view);
  const tags = showTags ? filterTags(f, { view }) : [];
  const late = Math.max(0, Number(lateCount) || 0);
  const lateOn = f.attention === "delayed";
  const dateTitle = f.date === "all" && scopeNote ? scopeNote : undefined;

  const clearSearch = () => {
    patch({ q: "" });
    searchRef?.current?.focus({ preventScroll: true });
  };

  const dateSelect = (
    <IconSelect icon={CalendarDays} label="Tarih" value={f.date} options={DATE_OPTIONS} onChange={(v) => patch({ date: v })}
      active={f.date !== "all"} title={dateTitle} optionTitle={(o) => (o.value === "all" && scopeNote ? scopeNote : undefined)}
      className="so-ov-date" />
  );

  return (
    <section className="so-ov-tools" data-view={view} aria-label="Arama ve filtreler">
      <div className="so-ov-bar">
        <div className="ui-search so-ov-searchbox" role="search">
          <Search aria-hidden="true" />
          <input ref={searchRef} type="search" className="ui-field so-ov-search" data-esc-clear="1" value={q}
            placeholder="Sipariş no, müşteri, telefon, ürün…" aria-label="Sipariş ara" autoComplete="off" spellCheck={false}
            enterKeyHint="search" onChange={(e) => patch({ q: e.target.value })} />
          {q ? (
            <button type="button" className="so-ov-search-clear" onClick={clearSearch} aria-label="Aramayı temizle" title="Aramayı temizle (Esc)">
              <X aria-hidden="true" />
            </button>
          ) : (
            <kbd className="ui-kbd so-ov-search-kbd" aria-hidden="true">/</kbd>
          )}
        </div>

        {view === "now" && (
          <div className="so-ov-chips-area">
            <div className="ui-chips so-ov-chips" role="group" aria-label="Teslimat noktası">
              {POINT_FILTERS.map((p) => {
                const pressed = f.point === p.value;
                return (
                  <button key={p.value} type="button" aria-pressed={pressed}
                    onClick={() => patch({ point: pressed && p.value !== "all" ? "all" : p.value })}>
                    {p.label}<span className="ui-count">{count(pointCounts?.[p.value])}</span>
                  </button>
                );
              })}
            </div>
            <span className="so-ov-sep" aria-hidden="true" />
            <div className="ui-chips so-ov-chips">
              <button type="button" className="so-ov-late" aria-pressed={lateOn} title={DELAY_HINT}
                onClick={() => patch({ attention: lateOn ? "none" : "delayed" })}>
                <AlertCircle aria-hidden="true" />Geciken
                <span className="ui-count" data-tone={late ? "danger" : undefined}>{count(late)}</span>
              </button>
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="so-ov-chips-area">
            <div className="ui-chips so-ov-chips so-ov-status" role="group" aria-label="Durum">
              {STATUS_CHIPS.map((chip) => (
                <button key={chip.value} type="button" aria-pressed={f.status === chip.value} onClick={() => patch({ status: chip.value })}>
                  {chip.tone && <i className={`ui-dot ui-dot--${chip.tone}`} aria-hidden="true" />}
                  {chip.label}<span className="ui-count">{count(statusCounts?.[chip.value])}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="so-ov-end">
          {view === "now" && (
            <button type="button" className="ui-btn so-ov-group" aria-pressed={Boolean(groupByPoint)} aria-label="Yurda göre grupla"
              title="Şeritleri teslimat noktasına göre böl" onClick={() => onGroupByPoint?.(!groupByPoint)}>
              <Layers aria-hidden="true" /><span className="so-ov-group-label">Yurda göre grupla</span>
            </button>
          )}
          {(view === "list" || view === "board") && dateSelect}
          {view === "list" && (
            <IconSelect icon={ArrowUpDown} label="Sıralama" value={sort} options={SORTS} onChange={(v) => onSort?.(v)}
              className="so-ov-sort" />
          )}
          <button type="button" className="ui-btn so-ov-filters" data-action="filters" aria-expanded={Boolean(filtersOpen)}
            aria-haspopup="dialog" onClick={() => onOpenFilters?.()} title="Tüm filtreler (f)"
            aria-label={advancedCount > 0 ? `Filtreler, ${advancedCount} etkin` : undefined}>
            <SlidersHorizontal aria-hidden="true" />
            <span>Filtreler</span>
            {advancedCount > 0 && <span className="ui-count" aria-hidden="true">{advancedCount}</span>}
          </button>
        </div>
      </div>

      {showTags && (
        <div className="so-ov-tags">
          {tags.length > 0 && (
            <ul className="so-ov-tag-list" aria-label="Etkin filtreler">
              {tags.map((tag) => (
                <li key={tag.key} className="ui-badge ui-badge--brand so-ov-tag">
                  <span>{tag.label}</span>
                  <button type="button" onClick={() => patch(tag.patch)} aria-label={`${tag.label} filtresini kaldır`} title="Kaldır">
                    <X aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="so-ov-tags-end">
            <span className="so-ov-result" role="status" title={scopeNote || undefined}>
              <strong className="ui-num">{count(resultCount)}</strong> sipariş
            </span>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm so-ov-clear" onClick={() => onClear?.()}>
              <X aria-hidden="true" />Filtreleri temizle
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
