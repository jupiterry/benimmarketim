// Kampanya merkezi: 14 günlük takvim. Geniş ekranda zaman çizelgesi (satır = kampanya, sütun = gün; çubuk saatine
// kadar doğru yerde), telefonda gün gün başlayan ve biten kampanyalar. Tarihi olmayan kampanyalar (vitrin görseli,
// otomatik bildirim, ücretsiz teslimat) üstte "süresiz" olarak özetlenir.
import { CalendarRange, Infinity as InfinityIcon } from "lucide-react";
import { EmptyState, useIsMobile } from "../admin/ui";
import {
  DAY, TYPE_META, TYPE_TARGET, barGeometry, calendarItems, clock, count, dateTime, dayEvents, dayLabel, dayName,
  dayNumber, horizonDays, isLive, istanbulDayStart, monthShort, ongoingOn, openTarget, statusOf, targetTitle, toMs,
  weekdayShort,
} from "./campaignUtils";

const UNDATED = ["banner", "automation", "free_delivery"];
const LEGEND = [["live", "Yayında"], ["ending_today", "Bugün / bu gece bitiyor"], ["upcoming", "Planlı"]];

/** "2 Kas 13:00 – 2 Kas 23:00"; kuponun başlangıcı yoktur: "bitiş 8 Kas 23:59" */
const rangeText = (item) => {
  const start = toMs(item.startsAt);
  const end = toMs(item.endsAt);
  const to = Number.isFinite(end) ? dateTime(end) : "süresiz";
  if (item.type === "coupon" || !Number.isFinite(start)) return `bitiş ${to}`;
  return `${dateTime(start)} – ${to}`;
};

const Timeline = ({ rows, days, fromMs, toMsValue, now, onNavigate }) => {
  const nowPct = ((now - fromMs) / (toMsValue - fromMs)) * 100;
  return (
    <div className="cc-tl" style={{ "--cc-days": days.length }}>
      <div className="cc-tl-head" aria-hidden="true">
        <span className="cc-tl-corner">Kampanya</span>
        <span className="cc-tl-days">
          {days.map((day, index) => (
            <span key={day.start} className="cc-tl-day" data-today={day.today || undefined} data-weekend={day.weekend || undefined}>
              <small>{weekdayShort(day.start)}</small>
              <b>{dayNumber(day.start)}</b>
              <small className="cc-tl-month">{index === 0 || dayNumber(day.start) === "1" ? monthShort(day.start) : " "}</small>
            </span>
          ))}
        </span>
      </div>
      <div className="cc-tl-body">
        <div className="cc-tl-grid" aria-hidden="true">
          {days.map((day) => <span key={day.start} data-today={day.today || undefined} data-weekend={day.weekend || undefined} />)}
        </div>
        {nowPct >= 0 && nowPct <= 100 && <span className="cc-tl-now" style={{ "--cc-now": nowPct / 100 }} aria-hidden="true" />}
        <ul className="cc-tl-rows">
          {rows.map(({ item, geometry, status }) => {
            const meta = TYPE_META[item.type] || TYPE_META.flash;
            const Icon = meta.icon;
            const range = rangeText(item);
            return (
              <li key={item.id} className="cc-tl-row" data-status={status}>
                <button type="button" className="cc-tl-label" onClick={() => openTarget(item.target, onNavigate)}
                  title={targetTitle(item.target)} aria-label={`${item.title}, ${meta.label}, ${range}`}>
                  <Icon aria-hidden="true" />
                  <span className="cc-tl-text">
                    <span className="cc-tl-title">{item.title}</span>
                    <small>{range}</small>
                  </span>
                </button>
                <span className="cc-tl-track" aria-hidden="true">
                  <span className="cc-tl-bar" data-status={status} data-open-start={geometry.openStart || undefined}
                    data-open-end={geometry.openEnd || undefined} style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
                    title={`${item.title} · ${range}`} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

const EVENT_LABEL = { start: ["Başladı", "Başlıyor"], end: ["Bitti", "Bitiyor"] };

const Agenda = ({ items, days, now, onNavigate }) => {
  const events = dayEvents(items, days, now);
  const visible = days.filter((day) => day.today || (events.get(day.start) || []).length);
  return (
    <ol className="cc-agenda">
      {visible.map((day) => {
        const list = events.get(day.start) || [];
        const ongoing = ongoingOn(items, day);
        const relative = dayLabel(day.start, now);
        const full = dayName(day.start);
        return (
          <li key={day.start} className="cc-day" data-today={day.today || undefined}>
            <h3 className="cc-day-head">{relative === full ? full : `${relative} · ${full}`}</h3>
            {list.length ? (
              <ul className="cc-day-events">
                {list.map((event) => {
                  const meta = TYPE_META[event.item.type] || TYPE_META.flash;
                  const [pastLabel, futureLabel] = EVENT_LABEL[event.kind];
                  return (
                    <li key={`${event.kind}-${event.item.id}`}>
                      <button type="button" className="cc-ev" data-kind={event.kind} onClick={() => openTarget(event.item.target, onNavigate)}
                        title={targetTitle(event.item.target)}>
                        <span className="cc-ev-time ui-num">{clock(event.at)}</span>
                        <span className="cc-ev-text">
                          <strong>{event.item.title}</strong>
                          <small>{meta.label}</small>
                        </span>
                        <span className={`ui-badge ${event.kind === "start" ? "ui-badge--info" : "ui-badge--warn"}`}>
                          {event.past ? pastLabel : futureLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cc-day-empty">Bugün başlayan ya da biten kampanya yok.</p>
            )}
            {ongoing > 0 && <p className="cc-day-ongoing">{count(ongoing)} kampanya gün boyunca sürüyor</p>}
          </li>
        );
      })}
    </ol>
  );
};

const CampaignCalendar = ({ items, horizon, now, onNavigate }) => {
  const isMobile = useIsMobile();
  const horizonFrom = toMs(horizon?.from);
  const toMsValue = toMs(horizon?.to);
  // Sayfa gece yarısını geçerek açık kaldıysa geçmiş gün gösterilmez
  const fromMs = Number.isFinite(horizonFrom) ? Math.max(horizonFrom, istanbulDayStart(now)) : NaN;
  const dayCount = Number.isFinite(fromMs) && Number.isFinite(toMsValue) ? Math.round((toMsValue - fromMs) / DAY) : 0;

  const undated = UNDATED
    .map((type) => ({ type, n: items.filter((item) => item.type === type && isLive(statusOf(item, now))).length }))
    .filter((entry) => entry.n > 0);
  const undatedLine = undated.length > 0 && (
    <div className="cc-undated">
      <InfinityIcon aria-hidden="true" />
      <span>Süresiz yayında:</span>
      {undated.map(({ type, n }) => (
        <button key={type} type="button" className="cc-undated-item" onClick={() => openTarget(TYPE_TARGET[type], onNavigate)}
          title={targetTitle(TYPE_TARGET[type])}>
          {type === "free_delivery" ? "ücretsiz teslimat" : `${count(n)} ${TYPE_META[type].label.toLocaleLowerCase("tr-TR")}`}
        </button>
      ))}
    </div>
  );

  if (dayCount < 1) {
    return (
      <EmptyState icon={CalendarRange} title="Takvim güncel değil" description="Takvimi güncellemek için sayfayı yenileyin." />
    );
  }

  const days = horizonDays(fromMs, dayCount, now);
  const dated = calendarItems(items, now);
  const rows = dated
    .map((item) => ({ item, status: statusOf(item, now), geometry: barGeometry(item, fromMs, toMsValue) }))
    .filter((row) => row.geometry);

  return (
    <div className="cc-cal">
      {undatedLine}
      {!rows.length ? (
        <EmptyState icon={CalendarRange} title="Önümüzdeki 14 günde tarihli kampanya yok"
          description="Flaş indirim, haftalık fırsat, kupon, kupon isteği ve sipariş görevleri tarihleriyle burada görünür." />
      ) : isMobile ? (
        <Agenda items={rows.map((row) => row.item)} days={days} now={now} onNavigate={onNavigate} />
      ) : (
        <>
          <Timeline rows={rows} days={days} fromMs={fromMs} toMsValue={toMsValue} now={now} onNavigate={onNavigate} />
          <ul className="cc-legend" aria-label="Renklerin anlamı">
            {LEGEND.map(([status, label]) => (
              <li key={status}><span className="cc-legend-swatch" data-status={status} aria-hidden="true" />{label}</li>
            ))}
            <li><span className="cc-legend-swatch" data-status="live" data-open-end="true" aria-hidden="true" />Takvim dışına taşıyor</li>
          </ul>
        </>
      )}
    </div>
  );
};

export default CampaignCalendar;
