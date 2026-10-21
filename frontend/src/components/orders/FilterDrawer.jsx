// Siparişler — "Filtreler" çekmecesi (C4). Görünüme göre geçerli olmayan filtreler gizlenir
// (Şimdi: tarih ve sıralama yok; Pano: sıralama yok). Kayıtlı filtreler 'admin-order-filters'
// biçimindedir (okuma/yazma konteynerde, shared.readSavedFilters/writeSavedFilters).
// Sözleşme: scratchpad/orders-design/CONTRACTS.md §7.13
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Banknote, Bookmark, BookmarkCheck, CalendarDays, Clock, MapPin, Plus, RotateCcw, SlidersHorizontal, SortDesc, Sparkles, Wallet, X,
} from "lucide-react";
import { Drawer, Segmented } from "../admin/ui";
import {
  ATTENTION_OPTIONS, DATE_OPTIONS, FILTER_KEYS, PAYMENT_FILTERS, POINT_FILTERS, SAVED_FILTERS_MAX, SORTS, STATUS_CHIPS,
  filterApplies, filterTags, hasAnyFilter, normalizeFilters, parseAmount,
} from "./shared";
import "../../styles/orders-tools.css";

const ATTENTION_ICONS = { delayed: Clock, problem: AlertTriangle };

// Çekmece açılınca odak, sıradaki seçicilerden ilk eşleşene (hiçbiri yoksa çekmecenin Kapat düğmesine)
// gider; kapanınca odak kaybolduysa çekmeceyi açan düğmeye döner
const useDrawerFocus = (ref, selectors) => {
  useEffect(() => {
    const opener = document.activeElement;
    const root = ref.current;
    const target = root
      && (selectors.map((selector) => root.querySelector(selector)).find(Boolean)
        || root.closest(".ui-drawer")?.querySelector(".ui-drawer-head button"));
    target?.focus({ preventScroll: true });
    return () => {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && opener?.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [ref, selectors]);
};
// İlk odak: seçili nokta düğmesi (çekmece açılınca klavyeyle doğrudan değiştirilebilir)
const FOCUS_ORDER = ['[aria-pressed="true"]', "button, input"];

// Arama dışındaki tüm alanlar aynıysa kayıtlı filtre "uygulanmış" sayılır
const sameFilters = (a, b) => {
  const x = normalizeFilters(a);
  const y = normalizeFilters(b);
  return FILTER_KEYS.every((key) => key === "q" || String(x[key]).trim() === String(y[key]).trim());
};
// Kayıtlı filtrenin kısa tarifi: "Hazırlanıyor · Bugün · Geciken siparişler"
const describeSaved = (filters) => {
  const f = normalizeFilters(filters);
  const parts = [];
  if (f.status !== "all") parts.push(STATUS_CHIPS.find((chip) => chip.value === f.status)?.label || f.status);
  for (const tag of filterTags(f, { view: "list" })) parts.push(tag.label);
  return parts.length ? parts.join(" · ") : "Tüm siparişler";
};
// Bu görünümde uygulanmayan alan içeriyor mu (örn. Şimdi'de durum / tarih)
const hasInapplicable = (filters, view) => {
  const f = normalizeFilters(filters);
  return ["status", "date"].some((key) => f[key] !== "all" && !filterApplies(key, view));
};
const amountState = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return { empty: true, valid: true, amount: null };
  const amount = parseAmount(text);
  return { empty: false, valid: amount !== null && amount >= 0, amount };
};

const Section = ({ icon: Icon, title, meta, children, id }) => (
  <section className="so-t-sec" aria-labelledby={id}>
    <h3 className="so-t-h" id={id}>
      {Icon && <Icon aria-hidden="true" />}
      {title}
      {meta && <span className="so-t-h-meta">{meta}</span>}
    </h3>
    {children}
  </section>
);

export default function FilterDrawer({
  filters, onChange, onClear, resultCount = 0, view = "list", sort = "newest", onSort, onClose,
  saved = [], onSave, onApplySaved, onDeleteSaved,
}) {
  const uid = useId();
  const bodyRef = useRef(null);
  const [name, setName] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const f = useMemo(() => normalizeFilters(filters), [filters]);
  useDrawerFocus(bodyRef, FOCUS_ORDER);

  useEffect(() => {
    if (!savedNote) return undefined;
    const id = setTimeout(() => setSavedNote(""), 3500);
    return () => clearTimeout(id);
  }, [savedNote]);

  const showDate = filterApplies("date", view);
  const showSort = view === "list";
  const min = amountState(filters?.min);
  const max = amountState(filters?.max);
  const crossed = min.valid && max.valid && min.amount !== null && max.amount !== null && min.amount > max.amount;
  const anyToSave = hasAnyFilter({ ...f, q: "" }, "list");
  const anyFilter = hasAnyFilter(f, "list");
  const trimmed = name.trim();
  const canSave = Boolean(trimmed) && anyToSave;
  const count = Number(resultCount) || 0;

  const submitSave = (e) => {
    e.preventDefault();
    if (!canSave) return;
    const finalName = trimmed.slice(0, 40);
    onSave?.(finalName);
    setName("");
    setSavedNote(`“${finalName}” kaydedildi.`);
  };

  const footer = (
    <>
      <button type="button" className="ui-btn so-t-foot-secondary" onClick={() => onClear?.()} disabled={!anyFilter}
        title={anyFilter ? "Arama dahil tüm filtreleri sıfırla" : "Etkin filtre yok"}>
        <RotateCcw aria-hidden="true" />Temizle
      </button>
      <button type="button" className="ui-btn ui-btn--primary so-t-foot-primary" onClick={() => onClose?.()}>
        {`${count.toLocaleString("tr-TR")} siparişi göster`}
      </button>
    </>
  );

  return (
    <Drawer
      title="Filtreler"
      subtitle={count > 0 ? `${count.toLocaleString("tr-TR")} sipariş eşleşiyor` : "Eşleşen sipariş yok"}
      icon={SlidersHorizontal}
      width={440}
      onClose={onClose}
      className="so-t-drawer so-t-filter"
      bodyClassName="so-t-body"
      footer={footer}
    >
      <div className="so-t-stack" ref={bodyRef}>
        <Section icon={MapPin} title="Teslimat noktası" id={`${uid}-point`}>
          <div className="so-t-seg">
            <Segmented options={POINT_FILTERS} value={f.point} onChange={(v) => onChange?.({ point: v })} ariaLabel="Teslimat noktası" />
          </div>
        </Section>

        <Section icon={Wallet} title="Ödeme yöntemi" id={`${uid}-pay`}>
          <div className="so-t-seg so-t-seg--wrap">
            <Segmented options={PAYMENT_FILTERS} value={f.payment} onChange={(v) => onChange?.({ payment: v })} ariaLabel="Ödeme yöntemi" size="sm" />
          </div>
        </Section>

        {showDate && (
          <Section icon={CalendarDays} title="Tarih" id={`${uid}-date`}>
            <div className="ui-chips so-t-chips" role="group" aria-labelledby={`${uid}-date`}>
              {DATE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" aria-pressed={f.date === opt.value} onClick={() => onChange?.({ date: opt.value })}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Section>
        )}

        {showSort && (
          <Section icon={SortDesc} title="Sıralama" id={`${uid}-sort`}>
            <select className="ui-field so-t-select" value={sort} onChange={(e) => onSort?.(e.target.value)} aria-labelledby={`${uid}-sort`}>
              {SORTS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Section>
        )}

        <Section icon={Banknote} title="Tutar aralığı" id={`${uid}-amount`}>
          <div className="so-t-range">
            <div className="so-t-field">
              <label className="ui-label" htmlFor={`${uid}-min`}>En az (₺)</label>
              <input id={`${uid}-min`} className="ui-field" type="text" inputMode="decimal" autoComplete="off" placeholder="0"
                value={filters?.min ?? ""} onChange={(e) => onChange?.({ min: e.target.value })}
                aria-invalid={!min.valid || crossed ? "true" : undefined} aria-describedby={`${uid}-amount-hint`} />
            </div>
            <div className="so-t-field">
              <label className="ui-label" htmlFor={`${uid}-max`}>En çok (₺)</label>
              <input id={`${uid}-max`} className="ui-field" type="text" inputMode="decimal" autoComplete="off" placeholder="Sınır yok"
                value={filters?.max ?? ""} onChange={(e) => onChange?.({ max: e.target.value })}
                aria-invalid={!max.valid || crossed ? "true" : undefined} aria-describedby={`${uid}-amount-hint`} />
            </div>
          </div>
          <p className="ui-hint so-t-hint" id={`${uid}-amount-hint`} data-tone={!min.valid || !max.valid || crossed ? "warn" : undefined}>
            {!min.valid || !max.valid
              ? "Geçerli bir tutar girin (örn. 150 ya da 99,90). Geçersiz değer filtrelemede yok sayılır."
              : crossed
                ? "En az tutar en çok tutardan büyük; hiçbir sipariş eşleşmez."
                : "Sipariş toplamına göre (kupon indirimi düşülmüş tutar)."}
          </p>
        </Section>

        <Section icon={Sparkles} title="Hazır filtreler" id={`${uid}-preset`}>
          <div className="so-t-options">
            {ATTENTION_OPTIONS.map((opt) => {
              const Icon = ATTENTION_ICONS[opt.value] || AlertTriangle;
              const on = f.attention === opt.value;
              return (
                <button key={opt.value} type="button" className="ui-option so-t-option" aria-pressed={on}
                  onClick={() => onChange?.({ attention: on ? "none" : opt.value })}>
                  <Icon aria-hidden="true" />
                  <span className="so-t-option-text">
                    <span>{opt.label}</span>
                    <small>{opt.hint}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={Bookmark} title="Kayıtlı filtreler" meta={saved.length ? `${saved.length}/${SAVED_FILTERS_MAX}` : null} id={`${uid}-saved`}>
          {saved.length === 0 ? (
            <p className="so-t-empty-note">Henüz kayıtlı filtre yok.</p>
          ) : (
            <ul className="so-t-saved">
              {saved.map((entry, index) => {
                const active = sameFilters(entry.filters, f);
                const partial = hasInapplicable(entry.filters, view);
                return (
                  <li key={`${entry.name}-${index}`} className="so-t-saved-item">
                    <button type="button" className="so-t-saved-apply" aria-pressed={active} onClick={() => onApplySaved?.(entry)}
                      title={active ? "Bu filtre şu an uygulanıyor" : "Filtreyi uygula (arama korunur)"}>
                      {active ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                      <span className="so-t-saved-text">
                        <span className="so-t-saved-name">{entry.name}</span>
                        <small>
                          {describeSaved(entry.filters)}
                          {partial && <span className="so-t-saved-na"> · durum/tarih bu görünümde uygulanmaz</span>}
                        </small>
                      </span>
                    </button>
                    <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--danger so-t-saved-del"
                      aria-label={`“${entry.name}” filtresini sil`} title="Sil" onClick={() => onDeleteSaved?.(index)}>
                      <X aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <form className="so-t-save" onSubmit={submitSave}>
            <label className="so-sr" htmlFor={`${uid}-name`}>Filtre adı</label>
            <input id={`${uid}-name`} className="ui-field" type="text" placeholder="Filtre adı" maxLength={40} autoComplete="off"
              value={name} onChange={(e) => setName(e.target.value)} aria-describedby={`${uid}-save-hint`} />
            <button type="submit" className="ui-btn so-t-save-btn" disabled={!canSave}>
              <Plus aria-hidden="true" />Bu filtreyi kaydet
            </button>
          </form>
          <p className="ui-hint so-t-hint" id={`${uid}-save-hint`} role="status">
            {savedNote
              || (!anyToSave
                ? "Kaydetmek için önce bir filtre seçin. Arama kaydedilmez."
                : saved.length >= SAVED_FILTERS_MAX
                  ? `En fazla ${SAVED_FILTERS_MAX} filtre saklanır; yeni kayıt en eskisinin yerini alır.`
                  : "Arama dışındaki tüm filtreler kaydedilir; bu cihazda saklanır.")}
          </p>
        </Section>
      </div>
    </Drawer>
  );
}
