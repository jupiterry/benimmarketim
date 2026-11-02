// Müşteri profili: "Geçmiş" (siparişler, sohbetler, destek, geri bildirim ve kuponlar tek akışta, yeniden eskiye)
// ve çekmecenin üstündeki "Açık konular" şeridi. Veriler GET /users/:id/profile → timeline, openIssues; "Daha fazla
// göster" aynı uca ?before= ile gider ve yalnızca çizelgenin sonraki sayfasını alır.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCheck, ChevronRight, Gift, Headphones, History, MessageCircle, MessageSquare, PackageCheck, PackageX, PhoneCall, RefreshCw,
  ShoppingBag, Ticket, ThumbsDown, ThumbsUp, XCircle,
} from "lucide-react";
import axios from "../../lib/axios";
import { EmptyState, formatDateTime, formatTime } from "../admin/ui";
import { relativeTime } from "../../lib/customers";

const TZ = "Europe/Istanbul";
const FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "orders", label: "Siparişler", hint: "Verilen, teslim edilen, iptal edilen ve teslim edilemeyen siparişler" },
  { value: "chats", label: "Sohbetler", hint: "Başlayan, canlı desteğe aktarılan ve kapanan sohbetler" },
  { value: "feedback", label: "Şikâyetler", hint: "Geri bildirimler ve anketler; düşük puanlar kırmızı" },
  { value: "coupons", label: "Kuponlar", hint: "Müşteriye tanımlanan ve kullandığı kuponlar" },
];
// Sunucu "group" gönderir; eski yanıtlar için türden bulunur
const TYPE_GROUP = {
  order_placed: "orders", order_delivered: "orders", order_cancelled: "orders", delivery_failed: "orders", callback_confirmed: "orders",
  chat_started: "chats", chat_handoff: "chats", chat_closed: "chats", feedback: "feedback", coupon_granted: "coupons", coupon_used: "coupons",
};
const TYPE_ICON = {
  order_placed: ShoppingBag, order_delivered: PackageCheck, order_cancelled: XCircle, delivery_failed: PackageX, callback_confirmed: PhoneCall,
  chat_started: MessageCircle, chat_handoff: Headphones, chat_closed: CheckCheck, coupon_granted: Gift, coupon_used: Ticket,
};
const ISSUE_ICON = {
  active_order: ShoppingBag, pending_callback: PhoneCall, open_support: Headphones, unanswered_feedback: ThumbsDown, expiring_coupon: Ticket, delivery_failures: PackageX,
};
// Göreli zamanı anlamlı olan konular (kupon için "at" bitiş zamanıdır, ayrıntıda yazar)
const RELATIVE_ISSUES = new Set(["active_order", "pending_callback", "open_support", "unanswered_feedback"]);
// Tıklanınca açılan ekran (kupon kayıtları bilgi amaçlıdır)
const OPEN_LABEL = { order: "Siparişi aç", chat: "Sohbeti aç", feedback: "Geri bildirimlere git" };
const TONES = new Set(["ok", "info", "warn", "danger", "brand", "neutral"]);

const toneOf = (value) => (TONES.has(value) ? value : "neutral");
const groupOf = (event) => event.group || TYPE_GROUP[event.type] || "other";
const openLabelOf = (ref) => (ref?.id ? OPEN_LABEL[ref.kind] || null : null);
const eventIcon = (event) => {
  if (event.type === "feedback") return event.low ? ThumbsDown : event.tone === "ok" ? ThumbsUp : MessageSquare;
  return TYPE_ICON[event.type] || History;
};
/** İstanbul takvim günü anahtarı "2026-11-02" */
const dayKey = (value) => new Date(value).toLocaleDateString("en-CA", { timeZone: TZ });
const dayLabel = (key, now) => {
  const today = dayKey(now);
  if (key === today) return "Bugün";
  if (key === dayKey(now - 86400000)) return "Dün";
  const date = new Date(`${key}T12:00:00+03:00`);
  return date.toLocaleDateString("tr-TR", {
    timeZone: TZ, day: "numeric", month: "long", weekday: "long", ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
};
const timeOf = (event) => new Date(event?.at).getTime();
const validEvent = (event) => Boolean(event?.id) && Number.isFinite(timeOf(event));
/** Yeniden eskiye (eşit zamanda gelen sıra korunur) */
const newestFirst = (list) => [...list].sort((a, b) => timeOf(b) - timeOf(a));

const TimelineItem = ({ event, onOpen }) => {
  const Icon = eventIcon(event);
  const openLabel = onOpen ? openLabelOf(event.ref) : null;
  const content = (
    <>
      <span className="cus-tl-main">
        <span className="cus-tl-title">
          <span>{event.title}</span>
          {event.low && <span className="ui-badge ui-badge--danger">Düşük puan</span>}
        </span>
        {event.detail && <span className="cus-tl-detail">{event.detail}</span>}
      </span>
      <time className="cus-tl-time ui-num" dateTime={event.at} title={formatDateTime(event.at)}>{formatTime(event.at)}</time>
      {openLabel && <ChevronRight className="cus-tl-go" aria-hidden="true" />}
    </>
  );
  return (
    <li className="cus-tl-item" data-tone={toneOf(event.tone)}>
      <span className="cus-tl-icon" aria-hidden="true"><Icon /></span>
      {openLabel ? (
        <button type="button" className="cus-tl-body" onClick={() => onOpen(event.ref)} title={openLabel}>
          {content}
          <span className="cus-sr">{openLabel}</span>
        </button>
      ) : (
        <div className="cus-tl-body">{content}</div>
      )}
    </li>
  );
};

/** "Geçmiş" görünümü: tür süzgeci, güne göre gruplu olaylar, "Daha fazla göster" */
const Timeline = ({ userId, initialEvents, initialHasMore, initialNextBefore, now, onOpen }) => {
  const [events, setEvents] = useState(() => newestFirst(Array.isArray(initialEvents) ? initialEvents.filter(validEvent) : []));
  const [nextBefore, setNextBefore] = useState(initialHasMore && initialNextBefore ? initialNextBefore : null);
  const [filter, setFilter] = useState("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(null);
  const requestRef = useRef(null);
  const loadingRef = useRef(false); // hızlı çift tıklama iki istek göndermesin
  const headingId = useId();
  const hasMore = Boolean(nextBefore);

  // Çekmece kapanınca / başka müşteriye geçince yarım kalan istek iptal edilir
  useEffect(() => () => requestRef.current?.abort(), []);

  const loadMore = async () => {
    if (loadingRef.current || !nextBefore) return;
    const controller = new AbortController();
    requestRef.current = controller;
    loadingRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const { data } = await axios.get(`/users/${userId}/profile`, { params: { before: nextBefore }, signal: controller.signal });
      const page = Array.isArray(data?.timeline) ? data.timeline.filter(validEvent) : [];
      setEvents((current) => {
        const seen = new Set(current.map((event) => event.id));
        return newestFirst([...current, ...page.filter((event) => !seen.has(event.id))]);
      });
      setNextBefore(data?.timelineHasMore && data?.timelineNextBefore ? data.timelineNextBefore : null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMoreError(error.response?.data?.message || "Daha eski kayıtlar yüklenemedi");
    } finally {
      loadingRef.current = false;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  const counts = useMemo(() => {
    const result = { all: events.length };
    for (const event of events) result[groupOf(event)] = (result[groupOf(event)] || 0) + 1;
    return result;
  }, [events]);
  const days = useMemo(() => {
    const list = [];
    for (const event of filter === "all" ? events : events.filter((item) => groupOf(item) === filter)) {
      const key = dayKey(event.at);
      const last = list[list.length - 1];
      if (last?.key === key) last.events.push(event);
      else list.push({ key, events: [event] });
    }
    return list;
  }, [events, filter]);

  return (
    <section className="cus-section cus-tl" aria-labelledby={headingId}>
      <div className="cus-section-head">
        <h3 id={headingId}>Geçmiş</h3>
        <span className="ui-hint">Yeniden eskiye · satıra tıklayınca kayıt açılır</span>
      </div>
      <div className="ui-chips cus-tl-filters" role="group" aria-label="Kayıt türü">
        {FILTERS.map((item) => (
          <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} title={item.hint}>
            {item.label}
            {/* Sayılar yalnızca tüm geçmiş yüklüyken gösterilir (eksik sayı yanıltmasın) */}
            {!hasMore && <span className="ui-count">{counts[item.value] || 0}</span>}
          </button>
        ))}
      </div>

      {events.length === 0 && !hasMore ? (
        <EmptyState icon={History} title="Henüz kayıt yok" description="Sipariş, sohbet, geri bildirim ya da kupon olduğunda burada görünür." compact />
      ) : days.length === 0 ? (
        <p className="cus-tl-empty">
          {hasMore ? "Yüklenen dönemde bu türde kayıt yok. Daha eski kayıtlar için “Daha fazla göster”e basın." : "Bu türde kayıt yok."}
        </p>
      ) : (
        <ol className="cus-tl-days">
          {days.map((day) => (
            <li key={day.key} className="cus-tl-day">
              <h4 className="cus-tl-day-label">{dayLabel(day.key, now)}</h4>
              <ol className="cus-tl-list">
                {day.events.map((event) => <TimelineItem key={event.id} event={event} onOpen={onOpen} />)}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {moreError && (
        <div className="ui-banner ui-banner--danger cus-tl-error" role="alert">
          <AlertTriangle />
          <span className="ui-grow">{moreError}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={loadMore} disabled={loadingMore}><RefreshCw />Tekrar dene</button>
        </div>
      )}
      {hasMore && !moreError && (
        <button type="button" className="ui-btn ui-btn--sm cus-tl-more" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore || undefined}>
          {loadingMore ? <><span className="cus-mini-spin" aria-hidden="true" />Yükleniyor…</> : <><History />Daha fazla göster</>}
        </button>
      )}
    </section>
  );
};

/** Çekmecenin üstündeki "Açık konular" şeridi (konu yoksa hiçbir şey çizilmez) */
export const OpenIssues = ({ issues, now, onOpen }) => {
  const headingId = useId();
  const list = Array.isArray(issues) ? issues.filter((issue) => issue?.id && issue.title) : [];
  if (!list.length) return null;
  return (
    <section className="cus-issues" aria-labelledby={headingId}>
      <h3 id={headingId} className="cus-issues-head">
        <AlertTriangle aria-hidden="true" />
        Açık konular
        <span className="ui-count">{list.length}</span>
      </h3>
      <ul className="cus-issues-list">
        {list.map((issue) => {
          const Icon = ISSUE_ICON[issue.type] || AlertTriangle;
          const openLabel = onOpen ? openLabelOf(issue.ref) : null;
          const when = RELATIVE_ISSUES.has(issue.type) && issue.at ? relativeTime(issue.at, now) : "";
          const sub = [issue.detail, when].filter(Boolean).join(" · ");
          const body = (
            <>
              <Icon className="cus-issue-icon" aria-hidden="true" />
              <span className="cus-issue-text">
                <strong>{issue.title}</strong>
                {sub && <span>{sub}</span>}
              </span>
              {openLabel && <ChevronRight className="cus-issue-go" aria-hidden="true" />}
            </>
          );
          return (
            <li key={issue.id}>
              {openLabel ? (
                <button type="button" className="cus-issue" data-tone={toneOf(issue.tone)} onClick={() => onOpen(issue.ref)} title={openLabel}>
                  {body}
                  <span className="cus-sr">{openLabel}</span>
                </button>
              ) : (
                <div className="cus-issue" data-tone={toneOf(issue.tone)}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default Timeline;
