/* eslint-disable react-refresh/only-export-components */
// Mağaza ayarları ekranının ortak alan parçaları: bağlam, değişiklik vurgusu, anahtar,
// saat girişi ve 24 saatlik zaman çizelgesi. Stil: styles/settings.css (stg-*).
import { createContext, useContext, useId } from "react";
import { RotateCcw, AlertCircle } from "lucide-react";
import { clock, describeRange, displayValue, FIELD_LABELS, getPath, parseClock } from "./settingsModel";

export const SettingsContext = createContext(null);
export const useSettingsForm = () => useContext(SettingsContext);

/**
 * Tek bir ayar alanı: etiket, kontrol, ipucu/hata. Alan kayıtlı değerden farklıysa
 * sol kenar vurgulanır, "Değişti" rozeti ve alan bazlı "Geri al" düğmesi görünür.
 * `paths` birden fazla yol kapsayabilir (saat + dakika gibi).
 */
export const Field = ({ path, paths, label, hint, children, wide = false, className = "" }) => {
  const form = useSettingsForm();
  const list = paths || (path ? [path] : []);
  const changedList = list.filter((p) => form.changed.has(p));
  const changed = changedList.length > 0;
  const error = list.map((p) => form.errors[p]).find(Boolean);
  const oldValue = changedList.length === 1 ? displayValue(changedList[0], getPath(form.saved, changedList[0])) : null;
  const name = label || FIELD_LABELS[list[0]] || "";
  return (
    <div className={`stg-field ${wide ? "stg-field--wide" : ""} ${className}`} data-changed={changed} data-invalid={Boolean(error)}>
      {(label || changed) && (
        <div className="stg-field-head">
          {label && <span className="ui-label stg-field-label">{label}</span>}
          {changed && (
            <span className="stg-field-tools">
              <span className="stg-changed-chip">Değişti</span>
              <button
                type="button"
                className="ui-icon-btn ui-icon-btn--sm stg-field-reset"
                onClick={() => form.reset(list)}
                aria-label={`${name} alanını geri al`}
                title={oldValue !== null ? `Kayıtlı değer: ${oldValue}` : "Kayıtlı değere dön"}
              >
                <RotateCcw />
              </button>
            </span>
          )}
        </div>
      )}
      <div className="stg-field-control">{children}</div>
      {error ? (
        <p className="stg-field-error" role="alert"><AlertCircle />{error}</p>
      ) : hint ? (
        <p className="ui-hint stg-field-hint">{hint}</p>
      ) : null}
    </div>
  );
};

/** Metin/sayı girişi: yoldaki değeri okur, değişiklikte taslağı günceller */
export const Input = ({ path, type = "text", parse, className = "", ...rest }) => {
  const form = useSettingsForm();
  const value = getPath(form.draft, path);
  const invalid = Boolean(form.errors[path]);
  return (
    <input
      type={type}
      className={`ui-field ${className}`}
      value={value ?? ""}
      aria-invalid={invalid || undefined}
      onChange={(e) => form.update(path, parse ? parse(e.target.value) : e.target.value)}
      {...rest}
    />
  );
};

/** Anahtar (role="switch"). `size="lg"` mağaza kapalı gibi tehlikeli ayarlar için büyük görünüm. */
export const Switch = ({ checked, onChange, label, size, tone, disabled, id }) => (
  <button
    type="button"
    id={id}
    role="switch"
    aria-checked={Boolean(checked)}
    aria-label={label}
    disabled={disabled}
    data-size={size}
    data-tone={tone}
    className="stg-switch"
    onClick={() => onChange(!checked)}
  >
    <span className="stg-switch-track"><span className="stg-switch-knob" /></span>
  </button>
);

/** Saat girişi (HH:MM). Saat ve dakika ayrı yollarda tutulur. */
export const TimeField = ({ hourPath, minutePath, label, ...rest }) => {
  const form = useSettingsForm();
  const id = useId();
  const value = clock(getPath(form.draft, hourPath), getPath(form.draft, minutePath));
  const invalid = Boolean(form.errors[hourPath] || form.errors[minutePath]);
  return (
    <input
      id={id}
      type="time"
      className="ui-field ui-mono stg-time"
      value={value}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const parsed = parseClock(e.target.value);
        if (!parsed) return; // tarayıcı boş değer verirse önceki saat kalır
        form.updateMany({ [hourPath]: parsed.hour, [minutePath]: parsed.minute });
      }}
      {...rest}
    />
  );
};

/** 24 saatlik çizelge: açık aralık dolu, gece yarısını aşan aralık iki parça, şimdiki saat işaretli. */
export const HoursTimeline = ({ startHour, startMinute, endHour, endMinute, now, compact = false, label = "Çalışma saatleri çizelgesi" }) => {
  const range = describeRange(startHour, startMinute, endHour, endMinute);
  const pct = (minutes) => `${(minutes / 1440) * 100}%`;
  const segments = range.allDay
    ? [[0, 1440]]
    : range.overnight
      ? [[range.start, 1440], [0, range.end]]
      : [[range.start, range.end]];
  let nowMinutes = null;
  if (now) {
    const local = new Date(new Date(now).toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    nowMinutes = local.getHours() * 60 + local.getMinutes();
  }
  return (
    <div className={`stg-timeline ${compact ? "stg-timeline--compact" : ""}`} role="img" aria-label={`${label}: ${clock(startHour, startMinute)} – ${clock(endHour, endMinute)}`}>
      <div className="stg-timeline-track">
        {Array.from({ length: 24 }, (_, i) => <span key={i} className="stg-timeline-tick" data-major={i % 6 === 0} style={{ left: pct(i * 60) }} />)}
        {segments.map(([from, to]) => (
          <span key={`${from}-${to}`} className="stg-timeline-fill" data-sametime={range.sameTime} style={{ left: pct(from), width: pct(to - from) }} />
        ))}
        {nowMinutes !== null && <span className="stg-timeline-now" style={{ left: pct(nowMinutes) }} title="Şu an (Türkiye saati)" />}
      </div>
      {!compact && (
        <div className="stg-timeline-labels" aria-hidden="true">
          {[0, 6, 12, 18, 24].map((h) => <span key={h} style={{ left: pct(h * 60) }}>{String(h).padStart(2, "0")}</span>)}
        </div>
      )}
    </div>
  );
};

/** Bölüm başlığı: ad, kısa açıklama ve sağda durum */
export const SectionHead = ({ icon: Icon, title, description, aside }) => (
  <div className="ui-panel-head stg-section-head">
    <div className="stg-section-title">
      {Icon && <span className="stg-section-icon"><Icon /></span>}
      <div>
        <h2 className="ui-title">{title}</h2>
        {description && <p className="ui-subtitle">{description}</p>}
      </div>
    </div>
    {aside && <div className="stg-section-aside">{aside}</div>}
  </div>
);

/** Durum rozeti: nokta + metin. tone: ok | warn | danger | info | muted */
export const StatusPill = ({ tone = "muted", children }) => (
  <span className={`ui-badge ${tone !== "muted" ? `ui-badge--${tone}` : ""} stg-pill`}>
    <span className={`ui-dot ${tone !== "muted" ? `ui-dot--${tone}` : ""}`} />
    {children}
  </span>
);

/** Satır: solda başlık/açıklama, sağda kontrol (anahtar vb.) */
export const Row = ({ title, description, children, danger = false }) => (
  <div className={`stg-row ${danger ? "stg-row--danger" : ""}`}>
    <div className="stg-row-text">
      <span className="stg-row-title">{title}</span>
      {description && <span className="stg-row-desc">{description}</span>}
    </div>
    <div className="stg-row-control">{children}</div>
  </div>
);
