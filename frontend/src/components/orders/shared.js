// Siparişler ekranının ortak sabitleri ve saf yardımcıları (React yok, ağ isteği yok).
// Tüm paketler (başlık, Şimdi, Liste, Pano, detay çekmecesi, araç çekmeceleri ve veri kancası)
// durum, SLA, filtre, sıralama, özet, cihaz deposu ve WhatsApp metinlerini YALNIZCA buradan alır.
// Sözleşme: scratchpad/orders-design/CONTRACTS.md
import {
  Banknote, CheckCircle2, Circle, Clock, CreditCard, KanbanSquare, Landmark, LayoutList, Truck, XCircle, Zap,
} from "lucide-react";
import { formatDate, formatTime, money, readPref, writePref } from "../admin/ui";
import {
  deliveryFeeLabel, getStatusTime, hasDeliveryFeeLine, isAddressOrder, normalizeSearch, onlyDigits, orderAddressLines, orderDeliveryFee,
  orderMapsLink, orderProductTotal, orderZoneId, orderZoneName, shortOrderId, toWhatsAppNumber,
} from "../../lib/orderTools";

// Teslimat yardımcıları (lib/orderTools) ekranın tek kaynağından da dışa aktarılır
export {
  deliveryFeeLabel, hasDeliveryFeeLine, isAddressOrder, orderAddressLines, orderDeliveryFee, orderMapsLink, orderProductTotal, orderZoneName,
};

// ── Zaman sabitleri ───────────────────────────────────────────────────────
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const TZ = "Europe/Istanbul";
// Türkiye 2016'dan beri yaz saati uygulamıyor (sabit UTC+3); backend startOfTrDay ile birebir aynı hesap.
const TR_OFFSET_MS = 3 * HOUR;

export const UNDO_MS = 5000; // durum / silme / ürün çıkarma geri alma süresi
export const UNDO_MAX_MS = 10_000; // birleşik geri alma penceresi en geç bu kadar sonra kaydedilir
export const CLICK_GUARD_MS = 400; // sonraki adım düğmesi bir değişiklikten sonra bu süre tıklama almaz
export const FRESH_MS = 12_000; // yeni gelen sipariş vurgusu
export const NOW_TICK_MS = 15_000; // canlı sayaçların yenilenme aralığı
export const POLL_MS = 30_000; // otomatik yenileme
export const FULL_RELOAD_MS = 5 * MINUTE; // tam yeniden yükleme (silinenler kaybolsun)
export const VISIBLE_RESYNC_MS = 10_000; // sekme görünür olunca son eşitleme bundan eskiyse yenile
export const WINDOW_DAYS = 30; // ilk yüklemede tarih penceresi
export const OLDER_PAGE = 200; // "daha eski siparişleri yükle" sayfası
export const IDS_CHUNK = 50; // ?ids isteği başına en fazla kimlik
export const SEARCH_LIMIT = 50; // sunucu araması sonuç sınırı
export const QTY_DEBOUNCE_MS = 500; // adet değişikliği satır başına bu kadar bekleyip kaydedilir
export const UNSEEN_WINDOW_MS = 6 * HOUR; // bundan eski siparişler "yeni" sayılmaz
export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;
export const BULK_MAX = 100;
export const SAVED_FILTERS_MAX = 8;
export const ORDERS_COUNT_EVENT = "admin-orders-count";

/** Date | ISO | ms → ms (geçersizse NaN) */
export const toMs = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
};
const toDate = (value) => {
  const ms = toMs(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── İstanbul günü ─────────────────────────────────────────────────────────
/** İstanbul gününün başlangıcı (ms) */
export const startOfDay = (value = Date.now()) => {
  const ms = toMs(value);
  return Math.floor((ms + TR_OFFSET_MS) / DAY) * DAY - TR_OFFSET_MS;
};
/** İstanbul tarihine göre "YYYY-MM-DD" (gün ayırıcıları ve dosya adları için) */
export const dayKey = (value) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + TR_OFFSET_MS).toISOString().slice(0, 10);
};
/** İstanbul saatine göre 0–23 */
export const hourOf = (value) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return 0;
  return Math.floor((((ms + TR_OFFSET_MS) % DAY) + DAY) % DAY / HOUR);
};
/** "Bugün" / "Dün" / "4 Ekim Cumartesi" (farklı yılda "4 Ekim 2025 Cumartesi") */
export const dayLabel = (value, now = Date.now()) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "Tarih yok";
  const diff = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  const sameYear = dayKey(ms).slice(0, 4) === dayKey(now).slice(0, 4);
  return new Date(ms).toLocaleDateString("tr-TR", {
    timeZone: TZ, day: "numeric", month: "long", weekday: "long", ...(sameYear ? {} : { year: "numeric" }),
  });
};
/** Kısa zaman: "21:14" / "Dün 23:10" / "8 Eki 21:14" */
export const shortWhen = (value, now = Date.now()) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "";
  const label = dayLabel(ms, now);
  const clock = formatTime(ms);
  if (label === "Bugün") return clock;
  if (label === "Dün") return `Dün ${clock}`;
  const sameYear = dayKey(ms).slice(0, 4) === dayKey(now).slice(0, 4);
  return `${formatDate(ms, sameYear ? {} : { year: "numeric" })} ${clock}`;
};
/** "21:14:05" (canlı durum satırının title değeri) */
export const formatTimeSeconds = (value) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
/** "12 dk" / "1 sa 5 dk" / "2 sa" / "1 g 3 sa"; geçersizse "" */
export const formatMinutes = (minutes) => {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return "";
  const v = Math.max(0, Math.round(Number(minutes)));
  if (v < 60) return `${v} dk`;
  if (v < 1440) {
    const h = Math.floor(v / 60);
    const r = v % 60;
    return r ? `${h} sa ${r} dk` : `${h} sa`;
  }
  const d = Math.floor(v / 1440);
  const h = Math.floor((v % 1440) / 60);
  return h ? `${d} g ${h} sa` : `${d} g`;
};
/** Tarih filtresi aralığı: { from, to } (ms, to hariç; to null = açık uç) ya da null */
export const dateRange = (value, now = Date.now()) => {
  const today = startOfDay(now);
  if (value === "today") return { from: today, to: null };
  if (value === "yesterday") return { from: today - DAY, to: today };
  if (value === "7d") return { from: now - 7 * DAY, to: null };
  if (value === "30d") return { from: now - 30 * DAY, to: null };
  return null;
};

// ── Durumlar ──────────────────────────────────────────────────────────────
export const ORDER_STATUSES = ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"];
export const isActiveStatus = (status) => status === "Hazırlanıyor" || status === "Yolda";
export const isDoneStatus = (status) => status === "Teslim Edildi" || status === "İptal Edildi";

/** Tek durum haritası: etiketler cümle düzeninde, ton yalnızca var olan ui-badge tonlarından */
export const STATUS = {
  "Hazırlanıyor": {
    key: "prep", label: "Hazırlanıyor", tab: "Hazırlık", lane: "Hazırlanıyor", tone: "warn", icon: Clock,
    verb: "hazırlanıyor’a alındı", timeline: "Hazırlanıyor’a alındı", waiting: "Yola çıkması bekleniyor",
  },
  "Yolda": {
    key: "road", label: "Yolda", tab: "Yolda", lane: "Yolda", tone: "info", icon: Truck,
    verb: "yola çıktı", timeline: "Yola çıktı", waiting: "Teslim edilmesi bekleniyor",
  },
  "Teslim Edildi": {
    key: "done", label: "Teslim edildi", tab: "Teslim", lane: "Teslim edildi", tone: "ok", icon: CheckCircle2,
    verb: "teslim edildi", timeline: "Teslim edildi", waiting: null,
  },
  "İptal Edildi": {
    key: "cancel", label: "İptal edildi", tab: "İptal", lane: "İptal edildi", tone: "danger", icon: XCircle,
    verb: "iptal edildi", timeline: "İptal edildi", waiting: null,
  },
};
/** Bilinmeyen durumda güvenli karşılık (tone undefined → nötr rozet) */
export const statusUi = (status) =>
  STATUS[status] || {
    key: "unknown", label: status || "Bilinmiyor", tab: status || "—", lane: status || "—", tone: undefined, icon: Circle,
    verb: "güncellendi", timeline: status || "Durum değişti", waiting: null,
  };

/** Aktif siparişin tek sonraki adımı */
export const NEXT_ACTION = {
  "Hazırlanıyor": { status: "Yolda", label: "Yola çıkar", done: "yola çıktı", icon: Truck, kind: "way" },
  "Yolda": { status: "Teslim Edildi", label: "Teslim et", done: "teslim edildi", icon: CheckCircle2, kind: "done" },
};
export const nextAction = (status) => NEXT_ACTION[status] || null;

const FLOW_RANK = { "Hazırlanıyor": 0, "Yolda": 1, "Teslim Edildi": 2 };
/**
 * Geri yönde mi? Yolda→Hazırlanıyor, Teslim Edildi→Hazırlanıyor/Yolda ve İptal Edildi'den başka bir
 * duruma geçiş. İptal'e geçiş geri yön sayılmaz (kendi onayı vardır).
 */
export const isBackward = (from, to) => {
  if (!from || !to || from === to || to === "İptal Edildi") return false;
  if (from === "İptal Edildi") return true;
  return (FLOW_RANK[to] ?? 0) < (FLOW_RANK[from] ?? 0);
};
/** Menülerdeki eylem adı (emir kipi) */
export const moveLabel = (to, from) => {
  if (to === "Hazırlanıyor") return "Hazırlanıyor’a geri al";
  if (to === "Yolda") return isDoneStatus(from) ? "Yolda’ya geri al" : "Yola çıkar";
  if (to === "Teslim Edildi") return "Teslim edildi olarak işaretle";
  if (to === "İptal Edildi") return "İptal et";
  return to;
};
/** Bir siparişin taşınabileceği diğer durumlar (Pano "Taşı", çekmece "⋯ Diğer", toplu menü) */
export const moveTargets = (status) =>
  ORDER_STATUSES.filter((s) => s !== status).map((s) => ({
    status: s, label: moveLabel(s, status), icon: STATUS[s].icon, danger: s === "İptal Edildi", tone: STATUS[s].tone,
  }));

export const STATUS_CHIPS = [
  { value: "all", label: "Tümü" },
  { value: "active", label: "Aktif" },
  { value: "Hazırlanıyor", label: "Hazırlanıyor", tone: "warn" },
  { value: "Yolda", label: "Yolda", tone: "info" },
  { value: "Teslim Edildi", label: "Teslim edildi", tone: "ok" },
  { value: "İptal Edildi", label: "İptal", tone: "danger" },
];

// ── Teslimat noktası ve ödeme ─────────────────────────────────────────────
export const DELIVERY_POINTS = [
  { value: "girlsDorm", label: "Kız yurdu", long: "Kız KYK Yurdu" },
  { value: "boysDorm", label: "Erkek yurdu", long: "Erkek KYK Yurdu" },
];
const POINT_BY_CODE = Object.fromEntries(DELIVERY_POINTS.map((p) => [p.value, p]));
export const POINT_FILTERS = [{ value: "all", label: "Tümü" }, ...DELIVERY_POINTS.map(({ value, label }) => ({ value, label }))];
/** "Yurda göre grupla" bölümleri (sıra sabit); veride başka bölge varsa yurtlardan sonra adıyla eklenir */
export const POINT_GROUPS = [
  { key: "girlsDorm", label: "Kız KYK Yurdu", short: "Kız yurdu" },
  { key: "boysDorm", label: "Erkek KYK Yurdu", short: "Erkek yurdu" },
  { key: "other", label: "Diğer", short: "Diğer" },
];
const DORM_KEYS = new Set(DELIVERY_POINTS.map((p) => p.value));
/**
 * Bölge anahtarı: yurt siparişinde (eski ya da yeni) 'girlsDorm' | 'boysDorm'; adresli siparişte bölge
 * kimliği (ör. 'mah-cumhuriyet'); bilinmeyen nokta 'other'.
 */
export const pointKey = (order) => {
  if (POINT_BY_CODE[order?.deliveryPoint]) return order.deliveryPoint;
  return orderZoneId(order) || "other";
};
// Veride görülen bölge adları (kimlik → ad); filtre etiketi ve seçenekleri için enrichOrders doldurur
const ZONE_NAMES = new Map();
const rememberZone = (order) => {
  const key = pointKey(order);
  if (key === "other" || DORM_KEYS.has(key)) return;
  const name = orderZoneName(order);
  if (name) ZONE_NAMES.set(key, name);
};
/** Bölge kimliğinin görünen adı ("Kız yurdu", "Cumhuriyet Mah."…) */
export const zoneLabel = (key, { short = true } = {}) => {
  const known = POINT_BY_CODE[key];
  if (known) return short ? known.label : known.long;
  if (key === "other") return "Diğer";
  return ZONE_NAMES.get(key) || String(key || "");
};
/** Çip: "Kız yurdu", bilgi: "Kız KYK Yurdu"; adresli siparişte bölge adı; bilinmeyen nokta için sunucudaki ad */
export const pointLabel = (order, { short = false } = {}) => {
  const known = POINT_BY_CODE[order?.deliveryPoint];
  if (known) return short ? known.label : known.long;
  const zone = orderZoneName(order);
  if (zone) return zone;
  return String(order?.deliveryPointName || order?.city || "").trim() || "Belirtilmemiş";
};
/** Veride yurt dışında bölge (adresli sipariş) var mı — "Yurda göre" metinleri "Bölgeye göre" olur */
export const hasZoneOrders = (orders) => (orders || []).some((o) => {
  const key = pointKey(o);
  return key !== "other" && !DORM_KEYS.has(key);
});
/**
 * Bölge filtresi seçenekleri: Tümü, iki yurt (her zaman, bugünkü gibi), ardından veride görülen diğer bölgeler
 * (ada göre). include: ayrıca gösterilecek kimlikler (ör. seçili filtre).
 */
export const zoneFilterOptions = (orders, { include = [] } = {}) => {
  const extra = new Map();
  for (const o of orders || []) {
    const key = pointKey(o);
    if (key === "other" || DORM_KEYS.has(key) || extra.has(key)) continue;
    extra.set(key, pointLabel(o, { short: true }));
  }
  for (const key of include) {
    if (key && key !== "all" && key !== "other" && !DORM_KEYS.has(key) && !extra.has(key)) extra.set(key, zoneLabel(key));
  }
  const zones = [...extra.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
  return [...POINT_FILTERS, ...zones];
};

// ── Teslimat operasyonu: ilk sipariş teyidi, teslim edilemedi, kurye ─────────
/** Teyit için aranmayı bekliyor mu (yalnızca aktif siparişte; iptal / teslim edilende rozet çıkmaz) */
export const needsCallbackPending = (order) =>
  order?.needsCallback === true && !order?.callbackConfirmedAt && isActiveStatus(order?.status);
/** "Teslim edilemedi" nedenleri (sunucu: backend/lib/feedbackOptions.js DELIVERY_OUTCOMES ile aynı) */
export const DELIVERY_OUTCOMES = [
  { value: "adres_bulunamadi", label: "Adres bulunamadı" },
  { value: "cevap_yok", label: "Müşteriye ulaşılamadı" },
  { value: "reddetti", label: "Müşteri teslim almadı" },
  { value: "diger", label: "Diğer" },
];
export const DELIVERY_OUTCOME_NOTE_MAX = 200;
export const deliveryOutcomeLabel = (order) => {
  const code = order?.deliveryOutcome?.code;
  if (!code) return "";
  return order.deliveryOutcome.label || DELIVERY_OUTCOMES.find((o) => o.value === code)?.label || "";
};
/** Kurye anahtarı: kurye kimliği ya da 'none' (atanmamış) */
export const courierKey = (order) => (order?.courier?.id ? String(order.courier.id) : "none");
export const courierName = (order) => String(order?.courier?.name || "").trim();
// Bilinen kurye adları (kimlik → ad): ayarlardaki liste + siparişlerde görülenler (filtre etiketi için)
const COURIER_NAMES = new Map();
export const rememberCouriers = (couriers) => {
  for (const c of couriers || []) if (c?._id && c.name) COURIER_NAMES.set(String(c._id), String(c.name));
};
export const courierLabel = (key) => (key === "none" ? "Kurye atanmamış" : COURIER_NAMES.get(String(key)) || "Kurye");
/**
 * Kurye filtresi seçenekleri: Tümü, ayarlardaki kuryeler (pasifler yalnızca siparişi varsa), siparişte görülen
 * eski kuryeler ve "Atanmamış". counts: { [key]: n } (isteğe bağlı)
 */
export const courierFilterOptions = (couriers, orders, { include = [] } = {}) => {
  const out = new Map();
  const seen = new Set((orders || []).map(courierKey));
  for (const c of couriers || []) {
    const id = String(c._id);
    if (c.active !== false || seen.has(id) || include.includes(id)) out.set(id, c.name);
  }
  for (const o of orders || []) {
    const key = courierKey(o);
    if (key !== "none" && !out.has(key)) out.set(key, courierName(o) || courierLabel(key));
  }
  return [
    { value: "all", label: "Tümü" },
    ...[...out.entries()].map(([value, label]) => ({ value, label })),
    { value: "none", label: "Atanmamış" },
  ];
};

export const PAYMENT = {
  cash: { label: "Nakit", long: "Kapıda nakit", icon: Banknote },
  card: { label: "Kart", long: "Kapıda kart (POS)", icon: CreditCard },
  bank_transfer: { label: "Havale", long: "Havale / EFT", tone: "warn", icon: Landmark },
};
export const PAYMENT_FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "cash", label: "Nakit" },
  { value: "card", label: "Kart" },
  { value: "bank_transfer", label: "Havale" },
  { value: "none", label: "Belirtilmemiş" },
];
/** 'cash' | 'card' | 'bank_transfer' | 'none' */
export const paymentKey = (order) => (PAYMENT[order?.paymentMethod] ? order.paymentMethod : "none");
/** Kısa etiket ("Nakit"…) ya da null (eski siparişlerde yöntem yok) */
export const paymentShort = (order) => PAYMENT[order?.paymentMethod]?.label || null;
/** Uzun etiket ("Kapıda nakit"…), yoksa "Belirtilmedi" */
export const paymentLong = (order) => PAYMENT[order?.paymentMethod]?.long || order?.paymentMethodLabel || "Belirtilmedi";

// ── SLA ───────────────────────────────────────────────────────────────────
/** Tek SLA tablosu (dakika). Hazırlık createdAt'ten, yol son "Yolda" kaydından ölçülür. */
export const SLA = {
  "Hazırlanıyor": { warn: 10, late: 20 },
  "Yolda": { warn: 15, late: 25 },
};
export const DELAY_HINT = "Hazırlıkta 20 dk, yolda 25 dk’yı geçenler";

/** Durum geçmişinde bu durumun EN SON verildiği an (Date | null) */
export const lastStatusTime = (order, status) => {
  let best = null;
  for (const entry of order?.statusHistory || []) {
    if (entry?.status !== status) continue;
    const ms = toMs(entry.changedAt);
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  }
  return best === null ? null : new Date(best);
};
/** Şu anki aşamanın başlangıcı: hazırlıkta createdAt, yolda son "Yolda" kaydı (yoksa updatedAt) */
export const stageStart = (order) => {
  if (order?.status === "Hazırlanıyor") return toDate(order.createdAt);
  if (order?.status === "Yolda") return lastStatusTime(order, "Yolda") || toDate(order.updatedAt) || toDate(order.createdAt);
  return null;
};
/**
 * Aktif siparişin SLA durumu; tamamlanmış/bilinmeyen siparişte null.
 * → { stage:'prep'|'road', minutes, level:'ok'|'warn'|'late', progress:0..1, label:'12 dk',
 *     hint:'Hazırlıkta 12 dk', title (gecikmede "gecikti" sözcüğü), warn, late }
 */
export const getSla = (order, now = Date.now()) => {
  const rule = SLA[order?.status];
  if (!rule) return null;
  const start = stageStart(order);
  if (!start) return null;
  const minutes = Math.max(0, Math.floor((now - start.getTime()) / MINUTE));
  const level = minutes >= rule.late ? "late" : minutes >= rule.warn ? "warn" : "ok";
  const stage = order.status === "Hazırlanıyor" ? "prep" : "road";
  const label = formatMinutes(minutes);
  const hint = `${stage === "prep" ? "Hazırlıkta" : "Yolda"} ${label}`;
  const title = level === "late"
    ? `${hint} · gecikti (sınır ${rule.late} dk)`
    : level === "warn" ? `${hint} · gecikmek üzere (sınır ${rule.late} dk)` : hint;
  return { stage, minutes, level, progress: Math.min(1, minutes / rule.late), label, hint, title, warn: rule.warn, late: rule.late };
};
export const isLate = (order, now = Date.now()) => getSla(order, now)?.level === "late";
/** Tamamlanma anı: son Teslim/İptal kaydı, yoksa updatedAt (aktifte null) */
export const completedAt = (order) => {
  if (!isDoneStatus(order?.status)) return null;
  return lastStatusTime(order, order.status) || toDate(order.updatedAt);
};
/** Aktifte createdAt→şimdi, tamamlanmışta createdAt→tamamlanma (dk); geçersizse null */
export const durationMinutes = (order, now = Date.now()) => {
  const created = toMs(order?.createdAt);
  if (!Number.isFinite(created)) return null;
  const end = isDoneStatus(order.status) ? completedAt(order)?.getTime() : now;
  if (!Number.isFinite(end) || end < created) return null;
  return Math.floor((end - created) / MINUTE);
};
const withinDay = (m) => (m !== null && m >= 0 && m < 1440 ? m : null);
/** Hazırlık süresi: createdAt → ilk "Yolda" (dk | null) */
export const prepMinutes = (order) => {
  const created = toMs(order?.createdAt);
  const onWay = getStatusTime(order, "Yolda");
  if (!onWay || !Number.isFinite(created)) return null;
  return withinDay(Math.round((onWay.getTime() - created) / MINUTE));
};
/** Toplam teslim süresi: createdAt → son "Teslim Edildi" (dk | null; 24 sa üstü yok sayılır) */
export const deliveryMinutes = (order) => {
  if (order?.status !== "Teslim Edildi") return null;
  const created = toMs(order.createdAt);
  const delivered = lastStatusTime(order, "Teslim Edildi");
  if (!delivered || !Number.isFinite(created)) return null;
  return withinDay(Math.round((delivered.getTime() - created) / MINUTE));
};

// ── Kimlik, müşteri, cihaz ────────────────────────────────────────────────
/** "#B3D30E" (sipariş nesnesi ya da kimlik) */
export const orderCode = (orderOrId, length = 6) =>
  `#${shortOrderId(typeof orderOrId === "object" && orderOrId !== null ? orderOrId.orderId : orderOrId, length)}`;
/** title özniteliği için 8 haneli kod: "Sipariş #6AC8BC3D" */
export const orderCodeTitle = (orderOrId) => `Sipariş ${orderCode(orderOrId, 8)}`;
export const platformLabel = (device) => {
  const platform = typeof device === "string" ? device : device?.platform;
  return { ios: "iOS", android: "Android", web: "Web" }[String(platform || "").toLowerCase()] || null;
};
/** Hesabı silinmiş müşteri mi (sunucu user.deleted ya da order.userDeleted) */
export const isDeletedCustomer = (order) => Boolean(order?.user?.deleted || order?.userDeleted);
/** Ekranda gösterilecek ad; silinmiş hesapta "Silinmiş hesap" */
export const customerName = (order) =>
  (isDeletedCustomer(order) ? "Silinmiş hesap" : String(order?.user?.name || "").trim() || "Müşteri");
/** Müşteriye yazılan metinlerdeki ilk ad; silinmiş hesapta "" (selamlamada ad kullanılmaz) */
export const customerFirstName = (order) =>
  (isDeletedCustomer(order) ? "" : String(order?.user?.name || "").trim().split(/\s+/)[0] || "");
export const customerPhone = (order) => String(order?.phone || order?.user?.phone || "").trim();
/** Müşteri gruplama anahtarı: gerçek kullanıcı kimliği, yoksa e-posta, o da yoksa siparişe özel */
export const customerKey = (order) => {
  const id = order?.user?.id;
  if (id && id !== "deleted") return `u:${id}`;
  const email = order?.user?.email;
  if (email && !isDeletedCustomer(order)) return `e:${String(email).toLowerCase()}`;
  return `o:${order?.orderId}`;
};
/** Avatar tonu 0–5 (müşteriler ekranıyla aynı karma) */
export const faceTone = (name) => {
  let hash = 0;
  for (const char of String(name || "?")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 6;
};

// ── Veri hazırlama ────────────────────────────────────────────────────────
/**
 * Ürün satırının kararlı anahtarı: sunucu lineId verirse "l:<lineId>", vermezse "n:<ad>|<birim fiyat>".
 * Aynı siparişte aynı ad+fiyat tekrar ederse enrichOrders sonuna "#2", "#3" ekler.
 */
export const lineKey = (product) =>
  (product?.lineId ? `l:${product.lineId}` : `n:${normalizeSearch(product?.name)}|${round2(product?.price).toFixed(2)}`);

const buildSearchText = (order) => normalizeSearch([
  order.orderId, order.user?.name, order.user?.email, order.deliveryPointName, pointLabel(order), pointLabel(order, { short: true }),
  orderAddressLines(order)?.oneLine,
  order.note, order.couponCode, order.deliveryTracking, paymentShort(order), paymentLong(order), order.courier?.name,
  ...order.products.map((p) => p.name),
].filter(Boolean).join(" | "));

const enrichOne = (raw, user) => {
  const seen = new Map();
  const products = (Array.isArray(raw.products) ? raw.products : []).map((p) => {
    const base = lineKey(p);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return {
      ...p,
      quantity: Number(p?.quantity) || 0,
      price: Number(p?.price) || 0,
      lineId: p?.lineId ? String(p.lineId) : undefined,
      productId: p?.productId ? String(p.productId) : null,
      lineKey: n > 1 ? `${base}#${n}` : base,
    };
  });
  const createdMs = toMs(raw.createdAt);
  const order = {
    ...raw,
    orderId: String(raw.orderId),
    user,
    products,
    code: shortOrderId(raw.orderId),
    createdMs: Number.isFinite(createdMs) ? createdMs : 0,
    itemCount: products.length,
    unitCount: products.reduce((sum, p) => sum + p.quantity, 0),
    hasNote: Boolean(String(raw.note || "").trim()),
    userDeleted: Boolean(raw.userDeleted || user.deleted),
  };
  order.customerKey = customerKey(order);
  rememberZone(order);
  if (order.courier?.id && order.courier?.name && !COURIER_NAMES.has(String(order.courier.id))) COURIER_NAMES.set(String(order.courier.id), order.courier.name);
  order.searchText = buildSearchText(order);
  order.phoneDigits = [onlyDigits(raw.phone), onlyDigits(user.phone)].filter(Boolean).join(" ");
  return order;
};

/**
 * Sunucunun müşteriye göre gruplu listesini düz, zenginleştirilmiş Order[] dizisine çevirir
 * (createdMs azalan). Kaplamalar (bekleyen durum, çıkarılan satır…) ÖNCEDEN uygulanmış olmalıdır;
 * `pending` alanı olduğu gibi korunur.
 * Sıra numarası (orderOrdinal) ve ilk sipariş bayrağı:
 *  (a) user.stats varsa: ordinal = stats.orderCount − (bu müşterinin daha yeni yüklü sipariş sayısı).
 *      windowStart'tan eski siparişlerde yalnızca müşterinin pencere öncesi siparişlerinin TAMAMI
 *      yüklüyse hesaplanır, değilse null. isFirstOrder = orderId === stats.firstOrderId.
 *  (b) stats yok ve hasOlder false: yüklü geçmiş eksiksizdir, yüklü sıra kullanılır.
 *  (c) aksi halde ordinal ve isFirstOrder null (bilinmiyor). userOrderCount = ordinal || 0 (fiş uyumu).
 */
export const enrichOrders = (usersOrders, { hasOlder = false, windowStart = null } = {}) => {
  const windowMs = Number.isFinite(toMs(windowStart)) ? toMs(windowStart) : -Infinity;
  const flat = [];
  for (const group of usersOrders || []) {
    if (!group) continue;
    const user = { ...(group.user || {}), id: group.user?.id != null ? String(group.user.id) : null };
    for (const raw of group.orders || []) {
      if (raw && raw.orderId) flat.push(enrichOne(raw, user));
    }
  }
  const byCustomer = new Map();
  for (const order of flat) {
    const list = byCustomer.get(order.customerKey);
    if (list) list.push(order);
    else byCustomer.set(order.customerKey, [order]);
  }
  for (const list of byCustomer.values()) {
    list.sort((a, b) => a.createdMs - b.createdMs || (a.orderId < b.orderId ? -1 : 1));
    const stats = list[list.length - 1].user?.stats || null;
    const anonymous = !list[0].user?.id;
    const inWindow = list.filter((o) => o.createdMs >= windowMs).length;
    const beforeWindow = list.length - inWindow;
    const loadedCancelled = list.filter((o) => o.status === "İptal Edildi").length;
    list.forEach((order, index) => {
      let ordinal = null;
      let first = null;
      if (stats && Number(stats.orderCount) > 0) {
        const contiguous = order.createdMs >= windowMs || beforeWindow === Math.max(0, stats.orderCount - inWindow);
        if (contiguous) {
          const value = stats.orderCount - (list.length - 1 - index);
          ordinal = value >= 1 ? value : null;
        }
        first = stats.firstOrderId ? String(order.orderId) === String(stats.firstOrderId) : ordinal === null ? null : ordinal === 1;
      } else if (!hasOlder && !anonymous) {
        ordinal = index + 1;
        first = index === 0;
      }
      order.orderOrdinal = ordinal;
      order.isFirstOrder = first;
      order.userOrderCount = ordinal || 0;
      order.cancelBadge = stats
        ? (Number(stats.cancelledCount) >= 1 ? Number(stats.cancelledCount) : 0)
        : (loadedCancelled >= 2 ? loadedCancelled : 0);
    });
  }
  flat.sort((a, b) => b.createdMs - a.createdMs || (a.orderId < b.orderId ? 1 : -1));
  return flat;
};
/** Pencere dışı "arşiv" siparişi mi (?ids / ?q ile gelen, windowStart'tan eski ve aktif olmayan) */
export const isOutsideWindow = (order, windowStart) => {
  const windowMs = toMs(windowStart);
  return Number.isFinite(windowMs) && order.createdMs < windowMs && !isActiveStatus(order.status);
};

// ── Filtreler ─────────────────────────────────────────────────────────────
export const DEFAULT_FILTERS = Object.freeze({
  q: "", status: "all", date: "all", point: "all", payment: "all", min: "", max: "", attention: "none", courier: "all",
});
export const FILTER_KEYS = Object.keys(DEFAULT_FILTERS);
/** Her görünümde geçerli filtre anahtarları: Şimdi durum ve tarihi, Pano durumu yok sayar */
export const VIEW_FILTER_KEYS = {
  now: ["q", "point", "payment", "min", "max", "attention", "courier"],
  list: [...FILTER_KEYS],
  board: ["q", "date", "point", "payment", "min", "max", "attention", "courier"],
};
export const ADVANCED_FILTER_KEYS = ["point", "payment", "min", "max", "attention", "courier"];
export const filterApplies = (key, view = "list") => (VIEW_FILTER_KEYS[view] || VIEW_FILTER_KEYS.list).includes(key);
export const ATTENTION_OPTIONS = [
  { value: "delayed", label: "Geciken siparişler", hint: DELAY_HINT },
  { value: "problem", label: "Sorunlu siparişler", hint: "Gecikenler ve iptal edilenler" },
  { value: "callback", label: "Teyit bekleyenler", hint: "İlk siparişi telefonla teyit edilmemiş aktif siparişler" },
];
export const DATE_OPTIONS = [
  { value: "all", label: "Tüm tarihler" },
  { value: "today", label: "Bugün" },
  { value: "yesterday", label: "Dün" },
  { value: "7d", label: "Son 7 gün" },
  { value: "30d", label: "Son 30 gün" },
];
export const SORTS = [
  { value: "newest", label: "En yeni" },
  { value: "oldest", label: "En eski" },
  { value: "amount", label: "Tutar (yüksek)" },
  { value: "wait", label: "Bekleme (uzun)" },
];
const ENUMS = {
  status: ["all", "active", ...ORDER_STATUSES],
  date: DATE_OPTIONS.map((o) => o.value),
  payment: PAYMENT_FILTERS.map((o) => o.value),
  attention: ["none", "delayed", "problem", "callback"],
};
const LEGACY_DATE = { lastWeek: "7d", lastMonth: "30d" };
/** Eksik/eski/geçersiz değerleri düzelterek tam bir Filters nesnesi döndürür */
export const normalizeFilters = (partial = {}) => {
  const out = { ...DEFAULT_FILTERS };
  for (const key of FILTER_KEYS) {
    let value = partial?.[key];
    if (value === undefined || value === null) continue;
    if (key === "date") value = LEGACY_DATE[value] || value;
    if (ENUMS[key]) out[key] = ENUMS[key].includes(value) ? value : DEFAULT_FILTERS[key];
    // Bölge: yurt anahtarı ya da bölge kimliği (slug); geçersiz değer "Tümü" olur
    else if (key === "point") out.point = /^[A-Za-z0-9_-]{1,60}$/.test(String(value)) ? String(value) : DEFAULT_FILTERS.point;
    // Kurye: kurye kimliği (24 hane) ya da 'none' (atanmamış)
    else if (key === "courier") out.courier = /^([0-9a-f]{24}|none|all)$/i.test(String(value)) ? String(value).toLowerCase() : DEFAULT_FILTERS.courier;
    else out[key] = String(value);
  }
  return out;
};
export const isFilterSet = (filters, key) => {
  const value = filters?.[key];
  if (key === "q" || key === "min" || key === "max") return String(value ?? "").trim() !== "";
  return value !== undefined && value !== null && value !== DEFAULT_FILTERS[key];
};
/** "Filtreler" düğmesindeki sayı: geçerli gelişmiş filtreler (mobilde tarih de çekmecede olduğundan includeDate) */
export const countAdvanced = (filters, view = "list", { includeDate = false } = {}) =>
  [...ADVANCED_FILTER_KEYS, ...(includeDate ? ["date"] : [])]
    .filter((key) => filterApplies(key, view) && isFilterSet(filters, key)).length;
/** Bu görünümde daraltan herhangi bir filtre (arama ve durum dahil) var mı */
export const hasAnyFilter = (filters, view = "list") =>
  FILTER_KEYS.some((key) => filterApplies(key, view) && isFilterSet(filters, key));
/**
 * Türkçe tutar girdisi → sayı; boş/geçersiz → null.
 * "12,5" | "12.5" | "1.250" | "1.250,50" | "₺1.250" | "1 250,50". Virgül varsa ondalık ayırıcıdır ve noktalar
 * binliktir; yalnızca nokta varsa ve 3'lü gruplar halindeyse ("1.250", "12.500") binlik sayılır, aksi halde ondalıktır.
 * Yazarken ara durumlar ("12,") geçerli kalır; "1e3", "0x10", "-5", "1,2,3" reddedilir.
 */
export const parseAmount = (value) => {
  let text = String(value ?? "").replace(/[\s₺]/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", "."); // 1.250,50 → 1250.50 (ikinci virgül aşağıda düşer)
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, ""); // 1.250 / 12.500 → binlik
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};
/** Arama sorgusu → { text, digits, raw } ya da null */
export const parseQuery = (q) => {
  const raw = String(q ?? "").trim();
  if (!raw) return null;
  const text = normalizeSearch(raw).replace(/^#/, "");
  const digits = onlyDigits(raw).replace(/^(90|0)/, "");
  if (!text && digits.length < 3) return null;
  return { text, digits, raw };
};
/** Türkçe duyarsız arama + 3 ve üzeri rakamda telefon eşleşmesi (sipariş ve hesap telefonu) */
export const matchesQuery = (order, parsed) =>
  !parsed ||
  (parsed.text !== "" && String(order?.searchText || "").includes(parsed.text)) ||
  (parsed.digits.length >= 3 && String(order?.phoneDigits || "").includes(parsed.digits));

/**
 * Filtre fonksiyonu üretir (tarih sınırları ve sorgu bir kez hesaplanır).
 * view'da geçerli olmayan anahtarlar ve `ignore` içindeki anahtarlar uygulanmaz
 * (örn. durum çipi sayıları için ignore:['status']).
 */
export const createOrderFilter = (filters, { now = Date.now(), view = "list", ignore = [] } = {}) => {
  const f = filters || DEFAULT_FILTERS;
  const use = (key) => filterApplies(key, view) && !ignore.includes(key) && isFilterSet(f, key);
  const parsed = use("q") ? parseQuery(f.q) : null;
  const range = use("date") ? dateRange(f.date, now) : null;
  const min = use("min") ? parseAmount(f.min) : null;
  const max = use("max") ? parseAmount(f.max) : null;
  const status = use("status") ? f.status : null;
  const point = use("point") ? f.point : null;
  const payment = use("payment") ? f.payment : null;
  const attention = use("attention") ? f.attention : null;
  const courier = use("courier") ? f.courier : null;
  return (order) => {
    if (!order) return false;
    if (status && (status === "active" ? !isActiveStatus(order.status) : order.status !== status)) return false;
    if (point && pointKey(order) !== point) return false;
    if (payment && paymentKey(order) !== payment) return false;
    if (courier && courierKey(order).toLowerCase() !== courier) return false;
    if (min !== null && !(Number(order.totalAmount) >= min)) return false;
    if (max !== null && !(Number(order.totalAmount) <= max)) return false;
    if (range && !(order.createdMs >= range.from && (range.to === null || order.createdMs < range.to))) return false;
    if (attention === "callback") {
      if (!needsCallbackPending(order)) return false;
    } else if (attention) {
      const late = isLate(order, now);
      if (attention === "delayed" ? !late : !(late || order.status === "İptal Edildi")) return false;
    }
    if (parsed && !matchesQuery(order, parsed)) return false;
    return true;
  };
};

/** Kaldırılabilir etiketler (arama ve durum çipi zaten görünür olduğundan etiket olmaz) */
export const filterTags = (filters, { view = "list" } = {}) => {
  const f = filters || DEFAULT_FILTERS;
  const tags = [];
  const on = (key) => filterApplies(key, view) && isFilterSet(f, key);
  if (on("date")) tags.push({ key: "date", label: DATE_OPTIONS.find((o) => o.value === f.date)?.label || f.date, patch: { date: "all" } });
  if (on("point")) tags.push({ key: "point", label: zoneLabel(f.point), patch: { point: "all" } });
  if (on("courier")) tags.push({ key: "courier", label: f.courier === "none" ? "Kurye atanmamış" : `Kurye: ${courierLabel(f.courier)}`, patch: { courier: "all" } });
  if (on("payment")) tags.push({ key: "payment", label: `Ödeme: ${PAYMENT_FILTERS.find((o) => o.value === f.payment)?.label || f.payment}`, patch: { payment: "all" } });
  const min = parseAmount(f.min);
  const max = parseAmount(f.max);
  if (on("min") && min !== null) tags.push({ key: "min", label: `En az ${money(min)}`, patch: { min: "" } });
  if (on("max") && max !== null) tags.push({ key: "max", label: `En çok ${money(max)}`, patch: { max: "" } });
  if (on("attention")) tags.push({ key: "attention", label: ATTENTION_OPTIONS.find((o) => o.value === f.attention)?.label || f.attention, patch: { attention: "none" } });
  return tags;
};

// ── Sıralama ──────────────────────────────────────────────────────────────
const byNewest = (a, b) => b.createdMs - a.createdMs || (a.orderId < b.orderId ? 1 : -1);
/** Liste sıralaması (yeni dizi döner) */
export const sortOrders = (orders, sort = "newest", now = Date.now()) => {
  const list = [...(orders || [])];
  if (sort === "oldest") return list.sort((a, b) => -byNewest(a, b));
  if (sort === "amount") return list.sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0) || byNewest(a, b));
  if (sort === "wait") {
    const wait = new Map(list.map((o) => [o.orderId, durationMinutes(o, now) ?? -1]));
    return list.sort((a, b) => wait.get(b.orderId) - wait.get(a.orderId) || byNewest(a, b));
  }
  return list.sort(byNewest);
};
const LEVEL_RANK = { late: 0, warn: 1, ok: 2 };
/** Aciliyet: gecikenler, sonra uyarıdakiler, sonra aşamaya en eski girenler (yeni dizi) */
export const urgencySort = (orders, now = Date.now()) => {
  const meta = new Map((orders || []).map((o) => {
    const sla = getSla(o, now);
    return [o.orderId, { rank: sla ? LEVEL_RANK[sla.level] : 3, start: stageStart(o)?.getTime() ?? o.createdMs }];
  }));
  return [...(orders || [])].sort((a, b) => {
    const ma = meta.get(a.orderId);
    const mb = meta.get(b.orderId);
    return ma.rank - mb.rank || ma.start - mb.start || a.createdMs - b.createdMs;
  });
};

// ── Görünüm ───────────────────────────────────────────────────────────────
export const VIEWS = [
  { value: "now", label: "Şimdi", icon: Zap, title: "Aktif siparişler, aciliyete göre" },
  { value: "list", label: "Liste", icon: LayoutList, title: "Geçmiş ve arama" },
  { value: "board", label: "Pano", icon: KanbanSquare, title: "Duruma göre sütunlar" },
];
export const VIEW_KEY = "admin-order-view";
const VIEW_VALUES = VIEWS.map((v) => v.value);
/** Kayıtlı görünüm: önce ham değer ('list'/'board'/'now', eski sürüm JSON'suz yazıyordu), sonra JSON; varsayılan 'now' */
export const readView = () => {
  let raw = null;
  try {
    raw = localStorage.getItem(VIEW_KEY);
  } catch {
    return "now";
  }
  if (raw === null) return "now";
  if (VIEW_VALUES.includes(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return VIEW_VALUES.includes(parsed) ? parsed : "now";
  } catch {
    return "now";
  }
};
/** Görünümü kaydeder (yalnızca kullanıcı seçtiğinde; aktarımla değişen görünüm kaydedilmez) */
export const writeView = (view) => {
  if (VIEW_VALUES.includes(view)) writePref(VIEW_KEY, view);
};
/** Pano sütunları: aktifler sınırsız ve aciliyete göre, tamamlananlar en yeni N tane */
export const BOARD_COLUMNS = [
  { status: "Hazırlanıyor", label: "Hazırlanıyor", limit: Infinity },
  { status: "Yolda", label: "Yolda", limit: Infinity },
  { status: "Teslim Edildi", label: "Teslim edildi", limit: 12 },
  { status: "İptal Edildi", label: "İptal edildi", limit: 8 },
];
/** Şimdi şeritleri ve Pano sütunlarının DOM kimlikleri (konteyner focusStatus ile kaydırır) */
export const LANE_IDS = { "Hazırlanıyor": "so-lane-prep", "Yolda": "so-lane-road" };
export const COLUMN_IDS = { "Hazırlanıyor": "so-col-prep", "Yolda": "so-col-road", "Teslim Edildi": "so-col-done", "İptal Edildi": "so-col-cancel" };

// ── Kısayollar ────────────────────────────────────────────────────────────
/** ShortcutHelp items (varsayılan / j k ↵ Esc ? satırlarına eklenir; etiketler benzersiz olmalı) */
export const SHORTCUT_ITEMS = [
  [["e"], "Sıradaki adım: yola çıkar / teslim et"],
  [["u"], "Son durum değişikliğini geri al"],
  [["x"], "Siparişi seç / bırak"],
  [["p"], "Fişi yazdır (y de olur)"],
  [["1", "2", "3"], "Şimdi · Liste · Pano görünümü"],
  [["v"], "Görünümü sırayla değiştir"],
  [["f"], "Filtreleri aç"],
  [["l"], "Toplama listesini aç"],
  [["r"], "Listeyi yenile"],
  [["w"], "Detayda: WhatsApp mesajı"],
  [["c"], "Detayda: özeti kopyala"],
  [["a"], "Detayda: ürün ekle"],
  [[], "“Yeni”, “Fiş” ve “Toplandı” işaretleri yalnızca bu cihazda tutulur"],
];
/** Sayfa altındaki kısa ipucu */
export const KBD_HINT = [
  [["/"], "ara"], [["j", "k"], "gez"], [["↵"], "aç"], [["e"], "sonraki adım"], [["x"], "seç"], [["u"], "geri al"], [["?"], "yardım"],
];

// AdminPage'in "g + harf" kısayolu: g'den sonraki tuş bu ekranın kısayolu olarak çalışmamalı.
// Yakalama aşamasında izlenir; o tuşun olayı sürerken inGChord() true döner.
let gPressedAt = 0;
let chordFlag = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Shift") return;
    const now = Date.now();
    if (gPressedAt && now - gPressedAt < 1000) {
      gPressedAt = 0;
      chordFlag = true;
      setTimeout(() => { chordFlag = false; }, 0);
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    // AdminPage.jsx'teki "g" kısayoluyla AYNI seçici olmalı (onay kutusu dahil hiçbir girdide akor başlamaz)
    if (e.key === "g" && !target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) gPressedAt = now;
  }, true);
}
/** Şu an işlenen tuş "g"nin kendisi ya da AdminPage "g + harf" kombinasyonunun ikinci tuşu mu */
export const inGChord = (e) => chordFlag || e?.key === "g";

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"]';
/**
 * Enter kısayolunun hedefi: .so-open üzerinde → o siparişi aç; başka bir etkileşimli öğede → o öğeye tıkla
 * (useListShortcuts preventDefault yaptığı için); aksi halde imleçteki siparişi aç.
 */
export const enterAction = (e) => {
  const el = e?.target instanceof Element ? e.target : null;
  if (el && el !== document.body) {
    const open = el.closest(".so-open");
    const item = open?.closest("[data-order-id]");
    if (item) return { kind: "open", orderId: item.getAttribute("data-order-id") };
    if (el.matches(INTERACTIVE)) return { kind: "click", el };
  }
  return { kind: "cursor" };
};

// ── Durum değişikliği metinleri (onay, geri alma, hata) ───────────────────
const quoteStatus = (s) => `“${statusUi(s).label}”`;
/**
 * C5 onayları. `orders` yalnızca durumu GERÇEKTEN değişecek siparişlerdir (to'dan farklı olanlar).
 * Öncelik: iptal (danger) > geri yön (warning) > 10'dan fazla (warning); gerekmiyorsa null.
 * → { title, message, confirmText, cancelText, type } (useConfirm'e olduğu gibi verilir)
 */
export const buildStatusConfirm = (orders, to) => {
  const list = (orders || []).filter(Boolean);
  if (!list.length) return null;
  const single = list.length === 1 ? list[0] : null;
  if (to === "İptal Edildi") {
    if (single) {
      const who = isDeletedCustomer(single)
        ? `${orderCode(single)} numaralı sipariş (silinmiş hesap)`
        : `${customerName(single)} adlı müşterinin ${orderCode(single)} numaralı siparişi`;
      return {
        title: "Siparişi iptal et",
        message: `${who} iptal edilecek. 5 sn içinde geri alabilirsiniz; sonra müşteriye bildirim gider ve kupon varsa geri açılır.`,
        confirmText: "Evet, iptal et", cancelText: "Vazgeç", type: "danger",
      };
    }
    return {
      title: "Toplu iptal",
      message: `${list.length} sipariş iptal edilecek. 5 sn içinde geri alabilirsiniz; sonra müşterilere bildirim gider ve kuponlar geri açılır.`,
      confirmText: "Evet, iptal et", cancelText: "Vazgeç", type: "danger",
    };
  }
  const backward = list.filter((o) => isBackward(o.status, to));
  if (backward.length) {
    const one = backward.length === 1 && single;
    // İptalden çıkan siparişin kuponu sunucuda yeniden kullanılmış sayılır (iptalde geri açılmıştı)
    const coupons = backward.filter((o) => o.status === "İptal Edildi" && String(o.couponCode || "").trim());
    const couponNote = !coupons.length ? ""
      : one ? ` Kupon (${String(single.couponCode).trim()}) yeniden kullanılmış sayılacak.`
        : ` ${coupons.length} siparişin kuponu yeniden kullanılmış sayılacak.`;
    return {
      title: "Durumu geri al",
      message: one
        ? `${orderCode(single)} ${quoteStatus(single.status)} durumundan ${quoteStatus(to)} durumuna alınacak. Müşteriye yeni durum bildirimi gider.${couponNote}`
        : `${list.length} siparişin durumu ${quoteStatus(to)} olarak geri alınacak${backward.length < list.length ? ` (${backward.length} tanesi geri yönde)` : ""}. Müşterilere yeni durum bildirimi gider.${couponNote}`,
      confirmText: "Evet, geri al", cancelText: "Vazgeç", type: "warning",
    };
  }
  if (list.length > 10) {
    return {
      title: "Toplu durum değişikliği",
      message: `${list.length} siparişin durumu ${quoteStatus(to)} olarak güncellenecek. Müşterilere bildirim gönderilir.`,
      confirmText: "Evet, güncelle", cancelText: "Vazgeç", type: "warning",
    };
  }
  return null;
};
/** Birleşik geri alma bildiriminin metni. changes: Array<{ order, to }> */
export const statusChangeMessage = (changes) => {
  const list = (changes || []).filter((c) => c?.order);
  if (!list.length) return "";
  const targets = new Set(list.map((c) => c.to));
  if (targets.size === 1) {
    const verb = statusUi(list[0].to).verb;
    return list.length === 1 ? `${orderCode(list[0].order)} ${verb}` : `${list.length} sipariş ${verb}`;
  }
  return `${list.length} siparişin durumu değişti`;
};
export const statusConflictMessage = (order, current) =>
  `${orderCode(order)} bu arada ${quoteStatus(current)} olmuş; değişiklik uygulanmadı`;
export const statusFailMessage = (order) => `${orderCode(order)} durumu güncellenemedi`;
/** Aktif siparişi silme onayı (yalnızca Hazırlanıyor/Yolda için; tamamlanmışta null) */
export const buildDeleteConfirm = (order) => {
  if (!isActiveStatus(order?.status)) return null;
  return {
    title: "Aktif siparişi sil",
    message: `${orderCode(order)} hâlâ ${quoteStatus(order.status)}. Silmek yerine iptal etmek müşteriye bildirim gönderir ve kuponu geri açar. Yine de kalıcı olarak silinsin mi?`,
    confirmText: "Kalıcı olarak sil", cancelText: "Vazgeç", type: "danger",
  };
};
/** Satır/kart açma düğmesinin erişilebilir adı */
export const orderAriaLabel = (order, now = Date.now()) => {
  const sla = getSla(order, now);
  const timing = sla
    ? `${sla.hint}${sla.level === "late" ? ", gecikti" : ""}`
    : (() => { const m = durationMinutes(order, now); return m === null ? "" : `toplam ${formatMinutes(m)}`; })();
  const pending = order?.pending ? ", değişiklik 5 sn içinde kaydedilecek" : "";
  return [customerName(order), orderCode(order), statusUi(order?.status).label, timing, money(order?.totalAmount)]
    .filter(Boolean).join(", ") + `${pending} — detayı aç`;
};

// ── Özetler ───────────────────────────────────────────────────────────────
/** Adet, tutar ve ödeme yöntemine göre dağılım */
export const summarizeOrders = (orders) => {
  const out = {
    count: 0, units: 0, total: 0, productTotal: 0, deliveryFee: 0,
    cash: { count: 0, total: 0 }, card: { count: 0, total: 0 }, transfer: { count: 0, total: 0 }, none: { count: 0, total: 0 },
  };
  for (const o of orders || []) {
    const amount = Number(o.totalAmount) || 0;
    out.count += 1;
    out.units += Number(o.unitCount) || 0;
    out.total += amount;
    out.productTotal += orderProductTotal(o);
    out.deliveryFee += orderDeliveryFee(o);
    const key = paymentKey(o);
    const bucket = key === "bank_transfer" ? out.transfer : out[key];
    bucket.count += 1;
    bucket.total += amount;
  }
  out.total = round2(out.total);
  out.productTotal = round2(out.productTotal);
  out.deliveryFee = round2(out.deliveryFee);
  for (const k of ["cash", "card", "transfer", "none"]) out[k].total = round2(out[k].total);
  return out;
};
const average = (list) => (list.length ? Math.round(list.reduce((s, v) => s + v, 0) / list.length) : null);
/**
 * Filtreden bağımsız KPI'lar (tüm yüklü siparişler, kaplamalar uygulanmış).
 * "Bugün" İstanbul günüdür. today* oluşturulma gününe; todayDelivered/todayCancelled ve
 * avgDeliveryMinutes tamamlanma anına (son Teslim/İptal kaydı); avgPrepMinutes bugün yola çıkanlara göredir.
 */
export const computeKpis = (orders, now = Date.now(), { unseenIds } = {}) => {
  const today = startOfDay(now);
  const k = {
    prep: 0, road: 0, active: 0, late: 0, latePrep: 0, lateRoad: 0, unseen: 0, oldestPrepMinutes: null,
    roadCash: 0, roadCashCount: 0, roadCard: 0, roadTransfer: 0,
    todayCount: 0, todayValid: 0, todayRevenue: 0, todayAvgBasket: 0, todayDelivered: 0, todayCancelled: 0,
    todayDeliveryFee: 0, todayPaidDelivery: 0, todayAddress: 0, callbacks: 0,
    avgDeliveryMinutes: null, avgPrepMinutes: null,
  };
  const deliveries = [];
  const preps = [];
  for (const o of orders || []) {
    const amount = Number(o.totalAmount) || 0;
    if (needsCallbackPending(o)) k.callbacks += 1;
    if (o.status === "Hazırlanıyor") {
      k.prep += 1;
      const sla = getSla(o, now);
      if (sla?.level === "late") k.latePrep += 1;
      if (sla && (k.oldestPrepMinutes === null || sla.minutes > k.oldestPrepMinutes)) k.oldestPrepMinutes = sla.minutes;
      if (unseenIds?.has?.(o.orderId)) k.unseen += 1;
    } else if (o.status === "Yolda") {
      k.road += 1;
      if (isLate(o, now)) k.lateRoad += 1;
      const pay = paymentKey(o);
      if (pay === "cash") { k.roadCash += amount; k.roadCashCount += 1; }
      else if (pay === "card") k.roadCard += 1;
      else if (pay === "bank_transfer") k.roadTransfer += 1;
    }
    if (o.createdMs >= today) {
      k.todayCount += 1;
      // Ciro ürün tutarıdır; teslimat ücreti ayrı toplanır (kasa/yoldaki nakit müşterinin ödediği tutardır)
      if (o.status !== "İptal Edildi") {
        k.todayValid += 1;
        k.todayRevenue += orderProductTotal(o);
        const fee = orderDeliveryFee(o);
        k.todayDeliveryFee += fee;
        if (fee > 0) k.todayPaidDelivery += 1;
        if (isAddressOrder(o)) k.todayAddress += 1;
      }
    }
    const done = completedAt(o);
    if (done && done.getTime() >= today) {
      if (o.status === "Teslim Edildi") {
        k.todayDelivered += 1;
        const m = deliveryMinutes(o);
        if (m !== null) deliveries.push(m);
      } else {
        k.todayCancelled += 1;
      }
    }
    const onWay = getStatusTime(o, "Yolda");
    if (onWay && onWay.getTime() >= today) {
      const m = prepMinutes(o);
      if (m !== null) preps.push(m);
    }
  }
  k.active = k.prep + k.road;
  k.late = k.latePrep + k.lateRoad;
  k.roadCash = round2(k.roadCash);
  k.todayRevenue = round2(k.todayRevenue);
  k.todayDeliveryFee = round2(k.todayDeliveryFee);
  k.todayAvgBasket = k.todayValid ? round2(k.todayRevenue / k.todayValid) : 0;
  k.avgDeliveryMinutes = average(deliveries);
  k.avgPrepMinutes = average(preps);
  return k;
};
/** Bugün saat saat (İstanbul): { hours:number[24], max, peak:number|null, currentHour, total } */
export const hourlyToday = (orders, now = Date.now()) => {
  const today = startOfDay(now);
  const hours = Array.from({ length: 24 }, () => 0);
  let total = 0;
  for (const o of orders || []) {
    if (o.createdMs >= today && o.createdMs < today + DAY) {
      hours[hourOf(o.createdMs)] += 1;
      total += 1;
    }
  }
  const max = Math.max(0, ...hours);
  return { hours, max, peak: max > 0 ? hours.indexOf(max) : null, currentHour: hourOf(now), total };
};
/** Durum dağılımı (ORDER_STATUSES sırasıyla): [{ status, count, share (0–100 tam sayı) }] */
export const statusDistribution = (orders) => {
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  let total = 0;
  for (const o of orders || []) {
    if (counts[o.status] !== undefined) { counts[o.status] += 1; total += 1; }
  }
  return ORDER_STATUSES.map((status) => ({ status, count: counts[status], share: total ? Math.round((counts[status] * 100) / total) : 0 }));
};
/** Aktif siparişlerin teslimat noktasına göre dağılımı: [{ code (bilinen kod | null), name, prep, road }] */
export const activeByPoint = (orders) => {
  const map = new Map();
  for (const o of orders || []) {
    if (!isActiveStatus(o.status)) continue;
    const zone = pointKey(o);
    const key = zone === "other" ? `name:${pointLabel(o)}` : zone;
    if (!map.has(key)) map.set(key, { code: zone === "other" ? null : zone, name: pointLabel(o), prep: 0, road: 0 });
    const entry = map.get(key);
    if (o.status === "Hazırlanıyor") entry.prep += 1;
    else entry.road += 1;
  }
  return [...map.values()].sort((a, b) => (b.prep + b.road) - (a.prep + a.road) || a.name.localeCompare(b.name, "tr"));
};
/**
 * Bölgeye göre gruplar (boş gruplar atlanır): önce iki yurt (bugünkü sıra), sonra diğer bölgeler adlarına göre,
 * en sonda "Diğer". → [{ key, label, short, zone (yurt dışı bölge mi), orders, summary }]
 */
export const pointGroups = (orders) => {
  const buckets = new Map(POINT_GROUPS.map((g) => [g.key, []]));
  const zones = new Map();
  for (const o of orders || []) {
    const key = pointKey(o);
    if (buckets.has(key)) buckets.get(key).push(o);
    else {
      if (!zones.has(key)) zones.set(key, { key, label: pointLabel(o), short: pointLabel(o, { short: true }), zone: true, orders: [] });
      zones.get(key).orders.push(o);
    }
  }
  const zoneGroups = [...zones.values()].sort((a, b) => a.label.localeCompare(b.label, "tr"));
  const dorms = POINT_GROUPS.filter((g) => g.key !== "other").map((g) => ({ ...g, orders: buckets.get(g.key) }));
  const other = { ...POINT_GROUPS.find((g) => g.key === "other"), orders: buckets.get("other") };
  return [...dorms, ...zoneGroups, other].filter((g) => g.orders.length)
    .map((g) => ({ ...g, summary: summarizeOrders(g.orders) }));
};
/** customerKey → Order[] (en yeni önce; girdi createdMs azalan sıradaysa sıra korunur) */
export const buildCustomerIndex = (orders) => {
  const index = new Map();
  for (const o of orders || []) {
    const list = index.get(o.customerKey);
    if (list) list.push(o);
    else index.set(o.customerKey, [o]);
  }
  return index;
};
/**
 * Müşteri özeti. user.stats varsa ömür boyu değerler (source 'stats'), yoksa yüklü siparişler (source 'loaded').
 * others her zaman yüklü diğer siparişlerdir (en yeni önce).
 * → { source, count, validCount, spent, average, cancelled, delivered, firstAt:Date|null, lastAt:Date|null, others }
 */
export const customerSummary = (source, order) => {
  if (!order) return null;
  const index = source instanceof Map ? source : buildCustomerIndex(source || []);
  const list = index.get(order.customerKey) || [order];
  const others = list.filter((o) => o.orderId !== order.orderId);
  const stats = order.user?.stats;
  if (stats && Number(stats.orderCount) > 0) {
    const cancelled = Number(stats.cancelledCount) || 0;
    const validCount = Number(stats.validCount ?? stats.orderCount - cancelled) || 0;
    const spent = round2(stats.totalSpent);
    return {
      source: "stats", count: Number(stats.orderCount), validCount, spent, average: validCount ? round2(spent / validCount) : 0,
      cancelled, delivered: Number(stats.deliveredCount) || 0, firstAt: toDate(stats.firstOrderAt), lastAt: toDate(stats.lastOrderAt), others,
    };
  }
  let spent = 0;
  let cancelled = 0;
  let delivered = 0;
  let firstMs = Infinity;
  let lastMs = -Infinity;
  for (const o of list) {
    if (o.status === "İptal Edildi") cancelled += 1;
    else spent += orderProductTotal(o);
    if (o.status === "Teslim Edildi") delivered += 1;
    firstMs = Math.min(firstMs, o.createdMs);
    lastMs = Math.max(lastMs, o.createdMs);
  }
  const validCount = list.length - cancelled;
  spent = round2(spent);
  return {
    source: "loaded", count: list.length, validCount, spent, average: validCount ? round2(spent / validCount) : 0,
    cancelled, delivered, firstAt: Number.isFinite(firstMs) ? new Date(firstMs) : null, lastAt: Number.isFinite(lastMs) ? new Date(lastMs) : null, others,
  };
};

// ── Cihaza özel depolar (localStorage; hata olursa sessizce boş) ──────────
export const PRINTED_KEY = "admin-order-printed";
export const SEEN_KEY = "admin-order-seen";
export const PICKED_KEY = "admin-order-picked";
export const SAVED_FILTERS_KEY = "admin-order-filters";
const PRINTED_TTL = 3 * DAY;
const PRINTED_MAX = 600;
const SEEN_MAX = 1000;
const PICKED_TTL = 2 * DAY;

/** Yazdırılan fişler: { [orderId]: ms }; 3 günden eski ya da 600'ü aşan kayıtlar budanır */
export const printedStore = {
  read() {
    const raw = readPref(PRINTED_KEY, {});
    const cutoff = Date.now() - PRINTED_TTL;
    const entries = Object.entries(raw && typeof raw === "object" ? raw : {})
      .filter(([, at]) => Number.isFinite(at) && at >= cutoff)
      .sort((a, b) => b[1] - a[1])
      .slice(0, PRINTED_MAX);
    return new Map(entries);
  },
  /** ids'i yazdırıldı olarak işaretler, güncel haritayı döndürür */
  mark(ids, at = Date.now()) {
    const map = this.read();
    for (const id of ids || []) if (id) map.set(String(id), at);
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, PRINTED_MAX);
    writePref(PRINTED_KEY, Object.fromEntries(entries));
    return new Map(entries);
  },
};
/** Görülen siparişler: id dizisi. Anahtar hiç yoksa read() null döner (ilk kullanım). */
export const seenStore = {
  read() {
    const raw = readPref(SEEN_KEY, null);
    return Array.isArray(raw) ? new Set(raw.map(String)) : null;
  },
  write(set) {
    const list = [...(set || [])].map(String);
    writePref(SEEN_KEY, list.slice(-SEEN_MAX));
  },
  /** ids'i ekler ve yazar; güncel Set döner */
  add(ids) {
    const set = this.read() || new Set();
    for (const id of ids || []) if (id) set.add(String(id));
    this.write(set);
    return set;
  },
};
/** "Yeni" adayı: Hazırlanıyor ve son 6 saatte oluşturulmuş */
export const isUnseenCandidate = (order, now = Date.now()) =>
  order?.status === "Hazırlanıyor" && now - (order.createdMs || 0) < UNSEEN_WINDOW_MS;
/** Görülmemiş sipariş kimlikleri: aday olup ne görülen ne yazdırılan kümede olanlar (seen null → boş) */
export const computeUnseenIds = (orders, { seen, printed, now = Date.now() } = {}) => {
  const out = new Set();
  if (!seen) return out;
  for (const o of orders || []) {
    if (isUnseenCandidate(o, now) && !seen.has(o.orderId) && !printed?.has?.(o.orderId)) out.add(o.orderId);
  }
  return out;
};
/** Toplanan satırlar: { [orderId]: { keys:string[], total:number, at:number } }; 2 günden eskiler budanır */
export const pickedStore = {
  read() {
    const raw = readPref(PICKED_KEY, {});
    const cutoff = Date.now() - PICKED_TTL;
    const map = new Map();
    for (const [id, entry] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      if (entry && Array.isArray(entry.keys) && Number(entry.at) >= cutoff) {
        map.set(id, { keys: entry.keys.map(String), total: Number(entry.total) || 0, at: Number(entry.at) });
      }
    }
    return map;
  },
  get(orderId) {
    return this.read().get(String(orderId))?.keys || [];
  },
  /** Siparişin toplanan satır anahtarlarını yazar (boş dizi kaydı siler); güncel haritayı döndürür */
  set(orderId, keys, total = 0) {
    const map = this.read();
    const list = [...new Set((keys || []).map(String))];
    if (list.length) map.set(String(orderId), { keys: list, total: Number(total) || 0, at: Date.now() });
    else map.delete(String(orderId));
    writePref(PICKED_KEY, Object.fromEntries(map));
    return map;
  },
};
/**
 * Hazırlanıyor siparişinin toplama ilerlemesi (güncel satırlara göre): { done, total, complete } ya da null
 * (hiç işaret yoksa ya da sipariş Hazırlanıyor değilse).
 */
export const pickProgress = (order, entry) => {
  if (!order || order.status !== "Hazırlanıyor" || !entry?.keys?.length) return null;
  const keys = new Set(entry.keys);
  const total = order.products.length;
  const done = order.products.filter((p) => keys.has(p.lineKey)).length;
  if (!done || !total) return null;
  return { done, total, complete: done === total };
};
/** orderId → pickProgress (yalnızca ilerlemesi olanlar) */
export const buildPickedMap = (orders, picked) => {
  const out = new Map();
  if (!picked?.size) return out;
  for (const o of orders || []) {
    const info = pickProgress(o, picked.get(o.orderId));
    if (info) out.set(o.orderId, info);
  }
  return out;
};

// ── Kayıtlı filtreler ─────────────────────────────────────────────────────
const withoutQuery = (filters) => {
  const out = normalizeFilters(filters);
  delete out.q;
  return out;
};
/** Eski kayıtlar ({ name, statusFilter, dateFilter, problemOnly, delayedOnly }) yeni biçime çevrilir */
export const readSavedFilters = () => {
  const raw = readPref(SAVED_FILTERS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => entry && typeof entry.name === "string" && entry.name.trim()).map((entry) => {
    const filters = entry.filters && typeof entry.filters === "object"
      ? withoutQuery(entry.filters)
      : withoutQuery({
        status: entry.statusFilter, date: entry.dateFilter,
        attention: entry.delayedOnly ? "delayed" : entry.problemOnly ? "problem" : "none",
      });
    return { name: entry.name.trim().slice(0, 40), filters };
  }).slice(-SAVED_FILTERS_MAX);
};
export const writeSavedFilters = (list) => writePref(SAVED_FILTERS_KEY, (list || []).slice(-SAVED_FILTERS_MAX));
/** Kaydedilecek kayıt: ad en çok 40 karakter, arama hariç tüm filtreler */
export const toSavedFilter = (name, filters) => ({ name: String(name || "").trim().slice(0, 40), filters: withoutQuery(filters) });
/** Kayıtlı filtreyi uygular: aramayı korur, diğer her alanı kayıttaki değere getirir */
export const applySavedFilter = (entry, current) => ({ ...normalizeFilters(entry?.filters), q: current?.q ?? "" });

// ── WhatsApp ve iletişim ──────────────────────────────────────────────────
const greeting = (order) => {
  const first = customerFirstName(order);
  return first ? `Merhaba ${first},` : "Merhaba,";
};
/** "Kız KYK Yurdu girişinde" / "<ad> adresinde" / "teslimat noktanda" */
const arrivalPlace = (order) => {
  const known = POINT_BY_CODE[order?.deliveryPoint];
  if (known) return `${known.long} girişinde`;
  if (isAddressOrder(order)) {
    const street = orderAddressLines(order)?.street;
    return street ? `${street} adresinde` : "adresinde";
  }
  const name = String(order?.deliveryPointName || "").trim();
  return name ? `${name} adresinde` : "teslimat noktanda";
};
/** Müşteriye giden metinde ödeme adı (panel etiketleri "Kapıda kart (POS)" / "Belirtilmedi" müşteriye gitmez) */
const PAY_TO_CUSTOMER = { cash: "kapıda nakit", card: "kapıda kartla", bank_transfer: "havale / EFT" };
/** "Tutar: ₺245,50, ödeme: kapıda nakit." — yöntem bilinmiyorsa ödeme kısmı yazılmaz */
const amountLine = (o) => {
  const pay = PAY_TO_CUSTOMER[o?.paymentMethod];
  return `Tutar: ${money(o?.totalAmount)}${pay ? `, ödeme: ${pay}` : ""}.`;
};
/** Duruma göre müşteri metinleri (sen dili) — TEK kaynak */
export const WHATSAPP_STATUS_TEXT = {
  "Hazırlanıyor": (o) => `${orderCode(o)} numaralı siparişini hazırlıyoruz.`,
  "Yolda": (o) => `${orderCode(o)} numaralı siparişin yola çıktı, birazdan ${arrivalPlace(o)} olacak.`,
  "Teslim Edildi": (o) => `${orderCode(o)} numaralı siparişin teslim edildi. Afiyet olsun!`,
  "İptal Edildi": (o) => `${orderCode(o)} numaralı siparişin hakkında yazıyoruz.`,
};
const changeText = (c) => {
  if (c.type === "removed") return `${c.name} çıkarıldı`;
  if (c.type === "added") return `${c.name} eklendi`;
  if (c.type === "qty") return `${c.name} ${c.from}→${c.to} adet`;
  return c.name;
};
/** "Ülker Çikolata çıkarıldı, Su 1→3 adet" */
export const describeChanges = (changes) => (changes || []).map(changeText).join(", ");
/**
 * Hazır mesajlar. build(order, ctx) metni döndürür; enabled(order, ctx) false ise menüde pasif.
 * ctx: { changes?: Array<{ type:'removed'|'qty'|'added', name, from?, to?, amount }> }
 */
export const WHATSAPP_TEMPLATES = [
  {
    id: "status", label: "Duruma göre mesaj",
    enabled: () => true,
    build: (o) => `${greeting(o)} Benim Marketim'den yazıyoruz. ${(WHATSAPP_STATUS_TEXT[o?.status] || WHATSAPP_STATUS_TEXT["İptal Edildi"])(o)}`,
  },
  {
    id: "preparing", label: "Hazırlıyoruz",
    enabled: () => true,
    build: (o) => `${greeting(o)} ${orderCode(o)} numaralı siparişini hazırlıyoruz, birazdan yola çıkacak.`,
  },
  {
    id: "onway", label: "Yola çıktı",
    enabled: () => true,
    build: (o) => `${greeting(o)} ${orderCode(o)} numaralı siparişin yola çıktı, birkaç dakika içinde ${arrivalPlace(o)} olacak. ${amountLine(o)}`,
  },
  {
    id: "arrived", label: "Girişteyiz",
    enabled: () => true,
    build: (o) => `${greeting(o)} ${orderCode(o)} numaralı siparişin ${arrivalPlace(o)}, kuryemiz seni bekliyor. ${amountLine(o)}`,
  },
  {
    id: "changed", label: "Sipariş değişti", hint: "Bu oturumdaki ürün değişikliklerini yazar",
    enabled: (o, ctx) => Boolean(ctx?.changes?.length),
    build: (o, ctx) => `${greeting(o)} ${orderCode(o)} numaralı siparişinde değişiklik yaptık: ${describeChanges(ctx?.changes) || "ürünler güncellendi"}. Yeni tutar: ${money(o?.totalAmount)}. Bir sorun olursa bu mesaja yazabilirsin.`,
  },
  {
    id: "unreachable", label: "Ulaşamadık",
    enabled: () => true,
    build: (o) => `${greeting(o)} ${orderCode(o)} numaralı siparişin için seni aradık ama ulaşamadık. Müsait olduğunda bu mesaja dönebilir misin?`,
  },
  {
    id: "transfer", label: "Havale bilgisi",
    enabled: () => true,
    build: (o) => `${greeting(o)} ${orderCode(o)} numaralı siparişinin tutarı ${money(o?.totalAmount)}. Havale / EFT yaptıysan dekontu bu mesaja gönderebilir misin? Ödeme hesaba geçince siparişini yola çıkaracağız.`,
  },
];
/** Şablon metni (bilinmeyen kimlikte 'status') */
export const buildWhatsAppText = (order, templateId = "status", ctx = {}) => {
  const template = WHATSAPP_TEMPLATES.find((t) => t.id === templateId) || WHATSAPP_TEMPLATES[0];
  return template.build(order, ctx);
};
/** wa.me numarası (905551234567) ya da null */
export const whatsAppNumber = (order) => toWhatsAppNumber(customerPhone(order));
/** wa.me bağlantısı ya da null (numara geçerli bir TR numarası değilse) */
export const buildWhatsAppLink = (order, templateId = "status", ctx = {}) => {
  const number = whatsAppNumber(order);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsAppText(order, templateId, ctx))}`;
};
/** "tel:05551234567" ya da null (en az 7 rakam yoksa) */
export const telHref = (order) => {
  const digits = onlyDigits(customerPhone(order));
  return digits.length >= 7 ? `tel:${digits}` : null;
};
/** Panoya kopyalar; clipboard yoksa gizli textarea + execCommand. Başarıyı döndürür. */
export const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text ?? ""));
      return true;
    }
  } catch {
    /* aşağıdaki yönteme düş */
  }
  try {
    const area = document.createElement("textarea");
    area.value = String(text ?? "");
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
};

// ── Diğer ─────────────────────────────────────────────────────────────────
/** "siparisler-2026-10-21.csv" (İstanbul tarihi) */
export const csvFilename = (now = Date.now()) => `siparisler-${dayKey(now)}.csv`;
/** 'default' | 'granted' | 'denied' | 'unsupported' */
export const notificationPermission = () =>
  (typeof window === "undefined" || typeof window.Notification === "undefined" ? "unsupported" : window.Notification.permission);
/**
 * Ekranlar arası aktarım değeri: 24 hane hex → { kind:'id', id }, 6–8 hane hex (başında # olabilir) →
 * { kind:'code', code (BÜYÜK) }, diğer → { kind:'text', text }; boşsa null.
 */
export const classifyHandoff = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^[0-9a-f]{24}$/i.test(text)) return { kind: "id", id: text.toLowerCase() };
  const code = text.replace(/^#/, "");
  if (/^[0-9a-f]{6,8}$/i.test(code)) return { kind: "code", code: code.toUpperCase() };
  return { kind: "text", text };
};
/** Kodu (son 6–8 hane) eşleşen siparişler */
export const findByCode = (orders, code) => {
  const needle = String(code || "").replace(/^#/, "").toLowerCase();
  if (!needle) return [];
  return (orders || []).filter((o) => String(o.orderId).toLowerCase().endsWith(needle));
};
/** Diziyi n'lik parçalara böler */
export const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < (list || []).length; i += size) out.push(list.slice(i, i + size));
  return out;
};
