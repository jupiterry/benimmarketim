/* global Intl */
// Kampanya merkezi: saf yardımcılar (zaman, durum, metin, gezinme). Veri GET /api/campaigns/overview'dan gelir;
// öğe biçimi backend/controllers/campaignCenter.controller.js başındaki açıklamadadır.
import { BellRing, CalendarDays, Image, Tag, Target, Truck, Users, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { HANDOFF, compactMoney, money, setHandoff, writePref } from "../admin/ui";

const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
const TR_OFFSET = 3 * HOUR; // İstanbul: UTC+3, yaz saati yok
const BUSINESS_DAY_START = 4 * HOUR; // iş günü 04:00'te değişir (sunucudaki tonightCutoff ile aynı)
const TZ = "Europe/Istanbul";

/** Bildirim gönder ekranının sekme tercihi (PushBroadcastTab usePref anahtarı) */
const PUSH_TAB_PREF = "admin-push-tab";

export const TYPE_ORDER = ["flash", "weekly", "coupon", "coupon_request", "mission", "banner", "automation", "free_delivery"];
export const TYPE_META = {
  flash: { label: "Flaş indirim", plural: "Flaş indirimler", icon: Zap, screen: "Ürün kataloğu" },
  weekly: { label: "Haftalık fırsat", plural: "Haftalık fırsatlar", icon: CalendarDays, screen: "Haftalık fırsatlar" },
  coupon: { label: "Kupon", plural: "Genel kuponlar", icon: Tag, screen: "Kuponlar" },
  coupon_request: { label: "Kupon isteği", plural: "Kupon isteği kampanyası", icon: Users, screen: "Kuponlar", section: "Kupon isteği kampanyası" },
  mission: { label: "Sipariş görevi", plural: "Sipariş görevleri", icon: Target, screen: "Kuponlar", section: "Sipariş görevleri" },
  banner: { label: "Vitrin görseli", plural: "Vitrin görselleri", icon: Image, screen: "Vitrin görselleri" },
  automation: { label: "Otomatik bildirim", plural: "Otomatik bildirimler", icon: BellRing, screen: "Bildirim gönder", section: "Otomatik bildirimler" },
  free_delivery: { label: "Ücretsiz teslimat", plural: "Teslimat kampanyası", icon: Truck, screen: "Teslimat bölgeleri" },
};
/** Türün ekranına giden hedef (bölüm başlığındaki bağlantı) */
export const TYPE_TARGET = {
  flash: { tab: "products" },
  weekly: { tab: "weekly-products" },
  coupon: { tab: "coupons" },
  coupon_request: { tab: "coupons", section: "requests" },
  mission: { tab: "coupons", section: "missions" },
  banner: { tab: "banners" },
  automation: { tab: "push", section: "auto" },
  free_delivery: { tab: "delivery-zones" },
};
/** Yüklenemeyen bölüm adları (yanıttaki partial) */
export const SECTION_LABELS = {
  flash: "flaş indirimler",
  weekly: "haftalık fırsatlar",
  coupon: "kuponlar",
  coupon_request: "kupon isteği kampanyası",
  mission: "sipariş görevleri",
  banner: "vitrin görselleri",
  automation: "otomatik bildirimler",
  free_delivery: "teslimat kampanyası",
  totals: "son 7 ve 30 günün toplamları",
  flash_performance: "flaş indirim getirisi",
  weekly_performance: "haftalık fırsat getirisi",
};
const CAP_LABELS = { flash: "Flaş indirim listesi ilk 300 kayıtla", weekly: "Haftalık fırsat listesi ilk 300 kayıtla", coupon: "Kupon listesi ilk 200 kayıtla" };
export const capNote = (capped) => (Array.isArray(capped) ? capped.map((key) => CAP_LABELS[key]).filter(Boolean) : []);

// ── Zaman ─────────────────────────────────────────────────────────────────
export const toMs = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};
/** İstanbul gününün başlangıcı (ms) */
export const istanbulDayStart = (ms) => Math.floor((ms + TR_OFFSET) / DAY) * DAY - TR_OFFSET;
/** "Bugün / bu gece" sınırı: içinde bulunulan iş gününün bittiği an (ertesi gün 04:00) */
export const tonightCutoff = (ms) => istanbulDayStart(ms - BUSINESS_DAY_START) + DAY + BUSINESS_DAY_START;
const sameIstanbulDay = (a, b) => istanbulDayStart(a) === istanbulDayStart(b);

const timeFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short", weekday: "short" });
const dateTimeFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short" });
const dayNumberFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric" });
const monthFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, month: "short" });

export const clock = (ms) => (Number.isFinite(ms) ? timeFormat.format(ms) : "—");
/** "4 Kas Çar" */
export const dayName = (ms) => dayFormat.format(ms);
export const dateTime = (ms) => (Number.isFinite(ms) ? dateTimeFormat.format(ms) : "—");
export const weekdayShort = (ms) => weekdayFormat.format(ms);
export const dayNumber = (ms) => dayNumberFormat.format(ms);
export const monthShort = (ms) => monthFormat.format(ms);
/** "Bugün", "Yarın", "Dün" ya da "4 Kas Çar" */
export const dayLabel = (ms, now) => {
  const diff = Math.round((istanbulDayStart(ms) - istanbulDayStart(now)) / DAY);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return dayFormat.format(ms);
};
/** "Bugün 22:00", "Yarın 10:00", "4 Kas Çar 10:00" */
export const when = (ms, now) => (Number.isFinite(ms) ? `${dayLabel(ms, now)} ${clock(ms)}` : "—");
/** Bu iş günü biten kampanyanın bitişi: "bugün 23:00" ya da (gece yarısından sonra) "bu gece 01:00" */
export const endingWhen = (ms, now) => (Number.isFinite(ms) ? `${sameIstanbulDay(ms, now) ? "bugün" : "bu gece"} ${clock(ms)}` : "—");
/** Kalan süre: "45 dk", "3 sa", "2 gün" */
export const duration = (ms) => {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
};

// ── Durum ─────────────────────────────────────────────────────────────────
/**
 * Öğenin şimdiki durumu (sayfa açık kalsa da güncel): upcoming | ending_today | live | ended.
 * Sunucudaki campaignStatus ile aynı kural; tarihi olmayan öğe (vitrin, otomasyon) her zaman yayındadır.
 */
export const statusOf = (item, now) => {
  const start = toMs(item?.startsAt);
  const end = toMs(item?.endsAt);
  if (Number.isFinite(end) && end <= now) return "ended";
  if (Number.isFinite(start) && start > now) return "upcoming";
  if (Number.isFinite(end) && end <= tonightCutoff(now)) return "ending_today";
  return "live";
};
export const isLive = (status) => status === "live" || status === "ending_today";

/** Rozet: { status, tone, label, detail, title } */
export const statusBadge = (item, now) => {
  const status = statusOf(item, now);
  const start = toMs(item?.startsAt);
  const end = toMs(item?.endsAt);
  if (status === "upcoming") return { status, tone: "info", label: "Planlı", detail: `${when(start, now)} başlar`, title: `Başlangıç: ${dateTime(start)}` };
  if (status === "ended") return { status, tone: "", label: "Bitti", detail: dateTime(end), title: "Sayfayı yenileyince listeden çıkar" };
  if (status === "ending_today") {
    return {
      status,
      tone: "warn",
      label: sameIstanbulDay(end, now) ? "Bugün bitiyor" : "Bu gece bitiyor",
      detail: `${clock(end)} · ${duration(end - now)} kaldı`,
      title: `Bitiş: ${dateTime(end)}`,
    };
  }
  if (Number.isFinite(end)) return { status, tone: "ok", label: "Yayında", detail: `${duration(end - now)} kaldı`, title: `Bitiş: ${dateTime(end)}` };
  return { status, tone: "ok", label: "Yayında", detail: "Süresiz", title: "Bitiş tarihi yok" };
};

// ── Metin ─────────────────────────────────────────────────────────────────
export const count = (value) => (Number(value) || 0).toLocaleString("tr-TR");
const pct = (value) => `%${(Number(value) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
const pctRange = (min, max) => (Number(min) === Number(max) ? pct(max) : `${pct(min)}–${pct(max)}`);
const DAY_NAMES = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Getiri özeti: ["34 adet", "₺1.020,00 ciro", "₺204,00 indirim"]; satış yoksa boş */
export const performanceParts = (stats) => {
  if (!stats || !(Number(stats.units) > 0)) return [];
  return [`${count(stats.units)} adet`, `${compactMoney(stats.revenue)} ciro`, `${compactMoney(stats.discount)} indirim`];
};
export const inferredNote = (stats) =>
  (Number(stats?.inferredLines) > 0
    ? `${count(stats.inferredLines)} satır, fiyat bilgisi kaydedilmeden önceki siparişlerden fiyatına göre eşleştirildi (tahmini).`
    : "");

const couponDiscount = (d) => (d.discountType === "fixed"
  ? `${money(d.discountValue)} indirim`
  : `${pct(d.discountValue)} indirim${d.maximumDiscount ? ` (en fazla ${money(d.maximumDiscount)})` : ""}`);

/** Satırın ikinci satırı: türüne göre kısa açıklama */
export const itemSubtitle = (item) => {
  const d = item?.details || {};
  switch (item?.type) {
    case "flash": {
      if (d.campaign || d.productCount > 1) return `${count(d.productCount)} ürün · ${pctRange(d.minDiscount, d.maxDiscount)} indirim`;
      const child = item.children?.[0];
      const parts = [`${pctRange(d.minDiscount, d.maxDiscount)} indirim`];
      if (child && Number.isFinite(Number(child.listPrice)) && child.price !== null && child.price !== undefined) {
        parts.push(`${money(child.listPrice)} → ${money(child.price)}`);
      }
      if (d.name) parts.push(d.name);
      return parts.join(" · ");
    }
    case "weekly":
      // Hiçbir üründe indirim kalmadıysa (liste fiyatı düştü) oran yazılmaz
      return d.maxDiscount > 0 ? `${count(d.productCount)} ürün · ${pctRange(d.minDiscount, d.maxDiscount)} indirim` : `${count(d.productCount)} ürün`;
    case "coupon": {
      const parts = [couponDiscount(d)];
      if (d.minimumOrderAmount > 0) parts.push(`en az ${money(d.minimumOrderAmount)} sepet`);
      if (Array.isArray(d.validDays) && d.validDays.length) {
        parts.push(DAY_ORDER.filter((day) => d.validDays.includes(day)).map((day) => DAY_NAMES[day]).join(", "));
      }
      if (d.startTime || d.endTime) parts.push(`${d.startTime || "00:00"}–${d.endTime || "23:59"}`);
      if (d.firstOrderOnly) parts.push("ilk siparişe");
      if (d.newUsersOnly) parts.push("yeni üyelere");
      return parts.join(" · ");
    }
    case "coupon_request":
      return `${pct(d.discountPercentage)} indirim · hedef ${count(d.targetCount)} puan`;
    case "mission":
      return d.rule || d.description || "";
    case "banner":
      return d.subtitle || "Ana sayfa kaydırıcısında";
    case "automation":
      return d.coupon
        ? `Kuponlu: ${d.coupon.type === "fixed" ? money(d.coupon.value) : pct(d.coupon.value)} · ${count(d.coupon.validDays)} gün geçerli`
        : "Kuponsuz bildirim";
    case "free_delivery":
      return "Teslimat ücreti hiçbir bölgede alınmıyor";
    default:
      return "";
  }
};

/** Türüne göre kısa sonuç: getiri, kullanım, ilerleme ([metin], boşsa gösterilmez) */
export const itemStats = (item) => {
  const s = item?.stats;
  if (!s) return [];
  switch (item.type) {
    case "flash":
    case "weekly": {
      const parts = performanceParts(s);
      return parts.length ? parts : ["Henüz satış yok"];
    }
    case "coupon": {
      const usage = s.usageLimit ? `${count(s.usageCount)}/${count(s.usageLimit)} kullanım` : `${count(s.usageCount)} kullanım`;
      return s.orders30 > 0 ? [usage, `30 günde ${compactMoney(s.discount30)} indirim`] : [usage];
    }
    case "coupon_request":
      return [`${count(s.weightedCount)}/${count(s.targetCount)} puan`, `${count(s.participants)} katılımcı`];
    case "mission":
      return s.completions > 0
        ? [`${count(s.completions)} kişi tamamladı`, `${compactMoney(s.rewardTotal)} ödül kuponu`]
        : ["Henüz tamamlayan yok"];
    case "automation":
      return [`7 günde ${count(s.sent7)} bildirim`, `${count(s.conversions7)} sipariş`];
    default:
      return [];
  }
};

/** Kupon isteği ilerlemesi (0–100) */
export const progressOf = (item) => {
  const s = item?.stats;
  if (item?.type !== "coupon_request" || !s?.targetCount) return null;
  return Math.max(0, Math.min(100, Math.round((Number(s.weightedCount) / Number(s.targetCount)) * 100)));
};

// ── Dikkat gerektirenler ──────────────────────────────────────────────────
const REASON_TEXT = {
  out_of_stock: "Stokta yok: kampanya yayında ama müşteri sepete ekleyemiyor.",
  hidden: "Ürün gizli: kampanya müşteriye görünmüyor.",
  deleted: "Ürün silinmiş: kampanya kaydı hâlâ açık.",
};
/** Dikkat maddesinin açıklaması */
export const attentionMessage = (entry, now) => {
  const typeLabel = TYPE_META[entry.type]?.label || "Kampanya";
  switch (entry.kind) {
    case "product_unavailable":
      return `${REASON_TEXT[entry.reason] || "Ürün satışta değil."}${entry.campaign ? ` (${entry.campaign})` : ""}`;
    case "flash_not_applied":
      return "Flaş indirim ürüne uygulanmadı; müşteri eski fiyatı görüyor. Birkaç dakikada düzelmezse kampanyayı yeniden kaydedin.";
    case "weekly_ineffective":
      return `Haftalık fiyat (${money(entry.weeklyPrice)}) liste fiyatından (${money(entry.listPrice)}) düşük değil; müşteri liste fiyatını öder.`;
    case "ending_today":
      return `${typeLabel} · bitiş ${endingWhen(toMs(entry.at), now)}`;
    case "coupon_ending":
      return `Genel kupon · bitiş ${endingWhen(toMs(entry.at), now)}`;
    case "flash_weekly_overlap":
      if (entry.effective !== "weekly") {
        return `Flaş fiyatı (${money(entry.flashPrice)}) geçerli; haftalık fiyat (${money(entry.weeklyPrice)}) flaş bitene kadar uygulanmıyor.`;
      }
      return Number(entry.weeklyPrice) === Number(entry.flashPrice)
        ? `Haftalık fiyat flaş fiyatıyla aynı (${money(entry.weeklyPrice)}); flaş indirim ek bir indirim sağlamıyor.`
        : `Haftalık fiyat (${money(entry.weeklyPrice)}) flaş fiyatından (${money(entry.flashPrice)}) düşük; flaş indirim müşteriye yansımıyor.`;
    case "coupon_exhausted":
      return `Kullanım sınırı doldu (${count(entry.usageCount)}/${count(entry.usageLimit)}); kupon artık kullanılamıyor.`;
    default:
      return "";
  }
};
/** Madde, ilgili kampanya bitince (sayfa açık kaldıkça) düşer; `at` kampanyanın bitişidir */
export const isAttentionCurrent = (entry, now) => !(toMs(entry?.at) <= now);

// ── Gezinme ───────────────────────────────────────────────────────────────
const SECTION_HINT = {
  requests: "Kuponlar ekranında “Kupon isteği kampanyası” bölümünü açın.",
  missions: "Kuponlar ekranında “Sipariş görevleri” bölümünü açın.",
};
/**
 * Öğenin ekranını açar: ürün çekmecesi için HANDOFF.product yazılır, otomatik bildirimler için Bildirim gönder
 * ekranının sekme tercihi "auto" yapılır; kupon bölümleri için yönlendirme ipucu gösterilir.
 */
export const openTarget = (target, onNavigate) => {
  if (!target?.tab || typeof onNavigate !== "function") return;
  const handoffKey = target.handoff?.key ? HANDOFF[target.handoff.key] : null;
  if (handoffKey && target.handoff.value) setHandoff(handoffKey, target.handoff.value);
  if (target.tab === "push" && target.section === "auto") writePref(PUSH_TAB_PREF, "auto");
  onNavigate(target.tab);
  if (SECTION_HINT[target.section]) toast(SECTION_HINT[target.section], { id: `cc-hint-${target.section}`, duration: 5000 });
};
/** Düğme ipucu: "Ürünü aç", "Kuponlar › Sipariş görevleri ekranını aç" */
export const targetTitle = (target) => {
  const label = targetLabel(target);
  if (!label || target?.handoff?.key === "product") return label;
  return `${label} ekranını aç`;
};
/** Hedefin okunur adı: "Ürünü aç" (ürün çekmecesi), "Haftalık fırsatlar", "Kuponlar › Sipariş görevleri" */
export const targetLabel = (target) => {
  if (!target?.tab) return "";
  if (target.handoff?.key === "product") return "Ürünü aç";
  const meta = Object.entries(TYPE_TARGET).find(([, t]) => t.tab === target.tab && (t.section || null) === (target.section || null));
  const info = meta ? TYPE_META[meta[0]] : null;
  if (!info) return "Ekranı aç";
  return info.section ? `${info.screen} › ${info.section}` : info.screen;
};

// ── Takvim ────────────────────────────────────────────────────────────────
/** Takvime girecek (tarihli, bitmemiş) öğeler: başlangıca göre */
export const calendarItems = (items, now) => items
  .filter((item) => Number.isFinite(toMs(item.endsAt)) || Number.isFinite(toMs(item.startsAt)))
  .filter((item) => item.type !== "banner" && item.type !== "automation" && item.type !== "free_delivery")
  .filter((item) => statusOf(item, now) !== "ended")
  .sort((a, b) => {
    const sa = toMs(a.startsAt);
    const sb = toMs(b.startsAt);
    const ka = Number.isFinite(sa) ? sa : -Infinity;
    const kb = Number.isFinite(sb) ? sb : -Infinity;
    if (ka !== kb) return ka - kb;
    return (toMs(a.endsAt) || Infinity) - (toMs(b.endsAt) || Infinity);
  });

/** Ufuk içindeki günler: [{ start, end, today, weekend }] */
export const horizonDays = (fromMs, days, now) => Array.from({ length: days }, (_, index) => {
  const start = fromMs + index * DAY;
  const weekday = new Date(start + TR_OFFSET).getUTCDay();
  return { start, end: start + DAY, today: sameIstanbulDay(start, now), weekend: weekday === 0 || weekday === 6 };
});

/** Çubuğun ufuk içindeki yeri (yüzde) ve taşma bilgisi */
export const barGeometry = (item, fromMs, toMsValue) => {
  const span = toMsValue - fromMs;
  const start = toMs(item.startsAt);
  const end = toMs(item.endsAt);
  const s = Number.isFinite(start) ? Math.max(start, fromMs) : fromMs;
  const e = Number.isFinite(end) ? Math.min(end, toMsValue) : toMsValue;
  if (!(span > 0) || e <= s) return null;
  return {
    left: ((s - fromMs) / span) * 100,
    width: ((e - s) / span) * 100,
    openStart: !Number.isFinite(start) || start < fromMs,
    openEnd: !Number.isFinite(end) || end > toMsValue,
  };
};

/** Gün gün olaylar (telefon görünümü): { [günBaşı]: [{ kind: start|end, at, item }] } */
export const dayEvents = (items, days, now) => {
  const byDay = new Map(days.map((day) => [day.start, []]));
  for (const item of items) {
    for (const [kind, at] of [["start", toMs(item.startsAt)], ["end", toMs(item.endsAt)]]) {
      if (!Number.isFinite(at)) continue;
      const list = byDay.get(istanbulDayStart(at));
      // Kuponun "başlangıcı" oluşturulma anıdır; yalnızca bugün oluşturulduysa gösterilir
      if (!list || (kind === "start" && item.type === "coupon" && !sameIstanbulDay(at, now))) continue;
      list.push({ kind, at, item, past: at <= now });
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.at - b.at);
  return byDay;
};

/** Belirli bir günde süren (o gün başlamayan ve bitmeyen) kampanya sayısı */
export const ongoingOn = (items, day) => items.filter((item) => {
  const start = toMs(item.startsAt);
  const end = toMs(item.endsAt);
  const startsBefore = !Number.isFinite(start) || start < day.start;
  const endsAfter = !Number.isFinite(end) || end >= day.end;
  return startsBefore && endsAfter;
}).length;
