// "Ne zaman gönderilsin?": Şimdi / Bugün 20:30 / Yarın 12:00 / Tarih ve saat seç. Saatler bilgisayarın saat
// diliminden bağımsız olarak Türkiye (İstanbul) saatidir. Saat uyarıları yalnızca bilgi verir, göndermeyi engellemez.
import { AlertTriangle, CalendarClock, Clock, Send } from "lucide-react";
import { WHEN_OPTIONS, formatWhen, resolveWhen, scheduleProblem, toTrInput } from "./broadcastShared";

const ICONS = { now: Send, today: Clock, tomorrow: Clock, custom: CalendarClock };
const DAY = 24 * 60 * 60 * 1000;

/** Saat uyarıları (sipariş saatleri / gönderim aralığı dışında) */
export const TimeWarnings = ({ warnings }) => (warnings?.length ? (
  <ul className="pbx-warnings" role="status">
    {warnings.map((warning) => <li key={warning}><AlertTriangle aria-hidden="true" /><span>{warning}</span></li>)}
  </ul>
) : null);

/** timeOnly: yalnızca tarih-saat alanı (planlı bildirimi düzenlerken hazır seçenekler gösterilmez) */
export default function ScheduleField({ when, onWhen, custom, onCustom, now, limits, warnings, problem, inputId = "push-when-custom", timeOnly = false }) {
  const maxDays = Number(limits?.maxScheduleDays) || 30;
  return (
    <div className="ui-stack ui-stack--sm">
      {!timeOnly && <div className="push-targets" role="group" aria-label="Gönderim zamanı">
        {WHEN_OPTIONS.map((option) => {
          const Icon = ICONS[option.id];
          // Saati geçmiş hazır seçenek seçilemez (ör. 20:30'dan sonra "Bugün 20:30")
          const passed = option.id !== "now" && option.id !== "custom" && Boolean(scheduleProblem(resolveWhen(option.id, "", now), now, limits));
          return (
            <button type="button" key={option.id} className="push-target" aria-pressed={when === option.id} disabled={passed && when !== option.id}
              title={passed ? "Bu saat geçti" : undefined} onClick={() => onWhen(option.id)}>
              <Icon />{option.label}
            </button>
          );
        })}
      </div>}
      {when === "custom" && (
        <div>
          <label className="ui-label" htmlFor={inputId}>Tarih ve saat (Türkiye saati)</label>
          <input id={inputId} type="datetime-local" className="ui-field pbx-datetime" value={custom}
            min={toTrInput(now)} max={toTrInput(now + maxDays * DAY)} onChange={(event) => onCustom(event.target.value)} />
        </div>
      )}
      {when !== "now" && (problem
        ? <p className="pbx-problem" role="alert">{problem}</p>
        : !timeOnly && <p className="ui-hint" style={{ marginTop: 0 }}>
          Gönderim zamanı: {formatWhen(resolveWhen(when, custom, now), now)} (Türkiye saati). Kitle, gönderim anında yeniden hesaplanır; bildirim o zamana kadar Planlı listesinden düzenlenebilir ya da iptal edilebilir.
        </p>)}
      <TimeWarnings warnings={warnings} />
    </div>
  );
}
