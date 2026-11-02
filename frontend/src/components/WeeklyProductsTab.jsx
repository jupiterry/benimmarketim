/* global Intl */
// Haftalık fırsatlar: müşteri uygulamasındaki "Haftalık fırsatlar" rafını yönetir. Fırsatlar önceden
// planlanabilir (Pazar akşamından Pazartesi 00:00'a) ve geçen haftanınkiler tek tıkla yeni haftaya kopyalanır.
// Uç noktalar: GET /weekly-products/all · POST /weekly-products · POST /weekly-products/copy
// · PUT /weekly-products/:id · PATCH /weekly-products/:id/toggle · DELETE /weekly-products/:id
// · GET /products?fields=card · GET /campaigns/performance?type=weekly&ids=… (yoksa satış rakamları gizlenir)
// Tüm tarih ve saatler İstanbul saatidir (sabit UTC+3), bilgisayarın saat dilimi ne olursa olsun.
// Socket: "weeklyProductsUpdated" gelince liste sessizce yenilenir.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  ArrowRight,
  Battery,
  CalendarClock,
  Check,
  Clock,
  CopyPlus,
  GripVertical,
  Hourglass,
  Infinity as InfinityIcon,
  ListChecks,
  Package,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Signal,
  Smartphone,
  Sparkles,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "../lib/axios";
import socketService from "../lib/socket";
import { cloudinaryImage } from "../lib/image";
import { useConfirm } from "./ConfirmModal";
import {
  Drawer,
  EmptyState,
  KpiCard,
  KpiGrid,
  PageHeader,
  Segmented,
  ShortcutHelp,
  Skeleton,
  SkeletonCards,
  SkeletonRows,
  compactMoney,
  fold,
  formatDate,
  formatDateTime,
  money,
  undoable,
  useListShortcuts,
  useNow,
  usePref,
} from "./admin/ui";
import "../styles/weekly.css";

// ── Zaman: İstanbul (sabit UTC+3) ─────────────────────────────────────────
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TR_OFFSET = 3 * HOUR;
const pad2 = (n) => String(n).padStart(2, "0");

/** Date | ISO | ms → ms (boş ya da geçersizse NaN) */
const msOf = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
};
/** İstanbul gününün 00:00'ı */
const trMidnight = (ms) => Math.floor((ms + TR_OFFSET) / DAY) * DAY - TR_OFFSET;
/** İstanbul'a göre haftanın günü (0 pazar … 6 cumartesi) */
const trWeekday = (ms) => new Date(ms + TR_OFFSET).getUTCDay();
const tomorrowStart = (now) => trMidnight(now) + DAY;
/** Bir sonraki pazartesi 00:00 (bugün pazartesiyse gelecek hafta) */
const nextMondayStart = (now) => {
  const today = trMidnight(now);
  return today + (((8 - trWeekday(today)) % 7) || 7) * DAY;
};
/** Bu haftanın pazartesi 00:00'ı */
const thisMondayStart = (now) => {
  const today = trMidnight(now);
  return today - ((trWeekday(today) + 6) % 7) * DAY;
};
/** Günün sonu: 23:59:59.999 (takvimden seçilen bitiş günü böyle saklanır) */
const endOfTrDay = (ms) => trMidnight(ms) + DAY - 1;
/** Verilen anın haftasının pazarı 23:59:59.999 */
const endOfTrWeek = (ms) => {
  const day = trMidnight(ms);
  return day + (((7 - trWeekday(day)) % 7) + 1) * DAY - 1;
};
/** "n gün": pazartesi 00:00 + 7 gün = pazar 23:59; gün içinden başlayınca n gün sonrasının sonu */
const endAfterDays = (startMs, days) => endOfTrDay(startMs + days * DAY - 1);

/** <input type="datetime-local"> değeri (İstanbul saati) */
const toTrInput = (value) => {
  const ms = msOf(value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + TR_OFFSET);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
/** İstanbul saatiyle girilen değer → ms. Bitişte ":59" o dakikanın sonudur (23:59 = gün sonu). */
const fromTrInput = (value, { end = false } = {}) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!m) return NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - TR_OFFSET;
  return end && m[5] === "59" ? ms + MINUTE - 1 : ms;
};

const TR_WEEKDAY = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", weekday: "short" });
/** "Bugün" · "Yarın" · "Pzt" (bir hafta içinde) · "9 Kas" */
const dayWord = (ms, now) => {
  const diff = Math.round((trMidnight(ms) - trMidnight(now)) / DAY);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff > 1 && diff < 7) return TR_WEEKDAY.format(new Date(ms));
  return formatDate(ms);
};
const clockOf = (ms) => {
  const d = new Date(ms + TR_OFFSET);
  return [d.getUTCHours(), d.getUTCMinutes()];
};
// Saatin okunuşundaki son sözcüğe göre bulunma eki: 00:00'da, 18:00'de, 13:00'te, 09:40'ta
const UNIT_SUFFIX = ["da", "de", "de", "te", "te", "te", "da", "de", "de", "da"]; // sıfır, bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz
const TENS_SUFFIX = { 1: "da", 2: "de", 3: "da", 4: "ta", 5: "de" }; // on, yirmi, otuz, kırk, elli
const locative = (h, m) => {
  const n = m === 0 ? h : m;
  if (n === 0) return "da";
  return n % 10 === 0 ? TENS_SUFFIX[n / 10] : UNIT_SUFFIX[n % 10];
};
/** "Pzt 00:00" */
const whenShort = (ms, now) => {
  const [h, m] = clockOf(ms);
  return `${dayWord(ms, now)} ${pad2(h)}:${pad2(m)}`;
};
/** "Pzt 00:00'da" · "Yarın 18:00'de" */
const atLabel = (ms, now) => {
  const [h, m] = clockOf(ms);
  return `${whenShort(ms, now)}'${locative(h, m)}`;
};
/** "9 Kas 00:00 – 15 Kas 23:59" */
const rangeText = (startMs, endMs) => `${formatDateTime(startMs)} – ${endMs === null ? "süresiz" : formatDateTime(endMs)}`;
/** [aS, aE) ile [bS, bE) çakışıyor mu? NaN başlangıç: en baştan; null/NaN bitiş: süresiz */
const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const as = Number.isFinite(aStart) ? aStart : -Infinity;
  const ae = Number.isFinite(aEnd) ? aEnd : Infinity;
  const bs = Number.isFinite(bStart) ? bStart : -Infinity;
  const be = Number.isFinite(bEnd) ? bEnd : Infinity;
  return as < be && bs < ae;
};

// ── Fiyat ve indirim (sunucudaki weeklyPrice.service ile aynı kurallar) ───
const toKurus = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7);
};
const roundMoney = (value) => toKurus(value) / 100;
const positive = (value) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
/** Fırsat fiyatının liste fiyatına göre indirim yüzdesi (0–99) */
const discountPct = (listPrice, weeklyPrice) => {
  const list = positive(listPrice);
  if (!list || weeklyPrice === null || weeklyPrice === undefined || weeklyPrice === "") return 0;
  const weekly = Number(weeklyPrice);
  if (!Number.isFinite(weekly) || weekly < 0 || toKurus(weekly) >= toKurus(list)) return 0;
  return Math.min(99, Math.max(0, Math.round(((list - weekly) / list) * 100)));
};
/** Fırsatın kurulduğundaki indirim oranı (0–1): listPriceAtStart'tan; yoksa kayıttaki yüzde ya da güncel fiyat */
const dealRatio = (deal, currentList) => {
  const weekly = positive(deal?.weeklyPrice);
  if (!weekly) return 0;
  const base = positive(deal?.listPriceAtStart);
  if (base) return weekly < base ? (base - weekly) / base : 0;
  const list = positive(currentList);
  const stored = Math.round(Number(deal?.startDiscountPercentage ?? deal?.discountPercentage));
  const storedValid = Number.isFinite(stored) && stored >= 1 && stored <= 99;
  if (storedValid && (!list || stored !== discountPct(list, weekly))) return stored / 100;
  if (list && weekly < list) return (list - weekly) / list;
  return 0;
};
/** Kuruşa; "90"/"50": en yakın ,90 / ,50 ile biten fiyat (liste fiyatına ulaşmadan, eşitlikte düşük olan) */
const roundDealPrice = (price, mode, listPrice) => {
  const kurus = toKurus(price);
  if (mode !== "90" && mode !== "50") return kurus / 100;
  const ending = mode === "90" ? 90 : 50;
  const list = positive(listPrice);
  const listKurus = list ? toKurus(list) : Infinity;
  const lira = Math.floor(kurus / 100) * 100;
  const candidates = [lira - 100 + ending, lira + ending, lira + 100 + ending]
    .filter((c) => c > 0 && c < listKurus)
    .sort((a, b) => Math.abs(a - kurus) - Math.abs(b - kurus) || a - b);
  return (candidates.length ? candidates[0] : kurus) / 100;
};
/** Aynı indirim oranı güncel liste fiyatına: { price, percent } ya da null */
const carryOver = (deal, listPrice, mode = "none") => {
  const list = positive(listPrice);
  if (!list) return null;
  const ratio = dealRatio(deal, list);
  if (!(ratio > 0) || ratio >= 1) return null;
  const price = roundDealPrice(list * (1 - ratio), mode, list);
  if (!(price > 0) || toKurus(price) >= toKurus(list)) return null;
  return { price, percent: discountPct(list, price) };
};
const priceFromPct = (price, pct) => roundMoney(price * (1 - pct / 100));
const num = (v) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const TRY0 = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 });
/** Tam liralık tutar "₺30", kuruşlu "₺29,90" */
const priceText = (value) => (toKurus(value) % 100 === 0 ? TRY0.format(roundMoney(value)) : money(value));
/** Satış rakamları: "₺1.020"; 10.000 üzeri kısaltılır */
const wholeMoney = (value) => {
  const n = Number(value) || 0;
  return Math.abs(n) >= 10000 ? compactMoney(n) : TRY0.format(Math.round(n));
};

// ── Durum ─────────────────────────────────────────────────────────────────
const STUCK_AFTER = 5 * MINUTE;
/**
 * live | planned | starting (başlangıç geldi, sunucu bir dakika içinde açar) | stuck (açılamadı)
 * | paused (durduruldu) | expired (bitti). Bitiş tarihi önce bakılır: süresi dolan "Bitti" görünür.
 */
const statusOf = (wp, now) => {
  const end = msOf(wp.endDate);
  if (Number.isFinite(end) && end <= now) return "expired";
  const start = msOf(wp.startDate);
  if (wp.scheduled) {
    if (!Number.isFinite(start) || start > now) return "planned";
    return now - start < STUCK_AFTER ? "starting" : "stuck";
  }
  if (!wp.isActive) return "paused";
  if (Number.isFinite(start) && start > now) return "planned";
  return "live";
};
const isPlannedState = (state) => state === "planned" || state === "starting" || state === "stuck";
const STATE_RANK = { live: 0, starting: 1, stuck: 1, planned: 2, paused: 3, expired: 4 };
/** Ürünü meşgul eden aktif kayıt (bitmemiş) */
const isRunning = (wp, now) => wp.isActive === true && !wp.scheduled && !(msOf(wp.endDate) <= now);
const endsSoon = (wp, now) => {
  const end = msOf(wp.endDate);
  return Number.isFinite(end) && end - now < 7 * DAY;
};
/** Fırsat [from, to) aralığında bir an yayında mıydı? (Durdurulanın kapanma anı ≈ updatedAt) */
const wasLiveDuring = (wp, from, to) => {
  if (wp.scheduled) return false;
  const start = msOf(wp.startDate ?? wp.createdAt);
  const rawEnd = msOf(wp.endDate);
  const end = Number.isFinite(rawEnd) ? rawEnd : Infinity;
  if (Number.isFinite(start) && start >= to) return false;
  if (end <= from) return false;
  if (wp.isActive) return true;
  const updated = msOf(wp.updatedAt);
  return Math.min(end, Number.isFinite(updated) ? updated : end) > from;
};
/** Aynı ürünün birden çok kaydından en son başlayanı */
const latestPerProduct = (list) => {
  const byProduct = new Map();
  const rest = [];
  for (const wp of list) {
    const key = wp.product?._id;
    if (!key) { rest.push(wp); continue; }
    const prev = byProduct.get(key);
    if (!prev || (msOf(wp.startDate) || 0) > (msOf(prev.startDate) || 0)) byProduct.set(key, wp);
  }
  return [...byProduct.values(), ...rest];
};
/** Raf sırası: order, durum, başlangıç, yeni eklenen önce (uygulamadaki sıra ile aynı) */
const byShelfOrder = (now) => (a, b) =>
  (Number(a.order) || 0) - (Number(b.order) || 0)
  || STATE_RANK[statusOf(a, now)] - STATE_RANK[statusOf(b, now)]
  || (msOf(a.startDate) || 0) - (msOf(b.startDate) || 0)
  || (msOf(b.createdAt) || 0) - (msOf(a.createdAt) || 0)
  || String(a._id).localeCompare(String(b._id));

/** Kalan süre etiketi: { label, sub, tone, icon } */
const remaining = (endDate, now) => {
  if (!endDate) return { label: "Süresiz", sub: "Bitiş tarihi yok", tone: "", icon: InfinityIcon };
  const end = msOf(endDate);
  const diff = end - now;
  if (diff <= 0) return { label: "Süresi doldu", sub: formatDateTime(endDate), tone: "danger", icon: Hourglass };
  if (diff < HOUR) return { label: `${Math.max(1, Math.round(diff / MINUTE))} dk kaldı`, sub: formatDateTime(endDate), tone: "warn", icon: AlertTriangle };
  if (diff < DAY) return { label: `${Math.round(diff / HOUR)} sa kaldı`, sub: formatDateTime(endDate), tone: "warn", icon: AlertTriangle };
  const days = Math.max(1, Math.round(diff / DAY));
  return { label: `${days} gün kaldı`, sub: formatDateTime(endDate), tone: "", icon: Clock };
};

/** Satırdaki durum etiketi */
const statusChip = (wp, state, now) => {
  if (state === "live") return { cls: "ui-badge--ok", label: "Yayında", icon: Zap };
  if (state === "planned") return { cls: "ui-badge--info", label: `Planlı · ${atLabel(msOf(wp.startDate), now)} başlar`, icon: CalendarClock };
  if (state === "starting") return { cls: "ui-badge--info", label: "Planlı · şimdi başlıyor", icon: CalendarClock };
  if (state === "stuck") return { cls: "ui-badge--warn", label: "Planlı · başlamadı", icon: AlertTriangle };
  if (state === "paused") return { cls: "ui-badge--warn", label: "Durduruldu", icon: ToggleLeft };
  return { cls: "", label: "Bitti", icon: Hourglass };
};
/** Durum etiketinin altındaki açıklama */
const statusDetail = (wp, state, now) => {
  const end = msOf(wp.endDate);
  if (state === "live") {
    const left = remaining(wp.endDate, now);
    return { text: wp.endDate ? `${left.label} · ${left.sub}` : "Süresiz", tone: left.tone };
  }
  if (isPlannedState(state)) {
    if (state === "stuck") return { text: wp.product ? "Sunucu henüz yayına almadı. Listeyi yenileyin." : "Ürün silindiği için yayına alınamadı.", tone: "warn" };
    if (!Number.isFinite(end)) return { text: "Bitiş yok (süresiz)", tone: "" };
    const days = Math.max(1, Math.round((end + 1 - msOf(wp.startDate)) / DAY));
    return { text: `${days} gün · bitiş ${formatDateTime(end)}`, tone: "" };
  }
  if (state === "paused") return { text: Number.isFinite(end) ? `Bitiş ${formatDateTime(end)}` : "Süresiz", tone: "" };
  return { text: Number.isFinite(end) ? formatDateTime(end) : "—", tone: "" };
};

/** Liste fiyatı fırsat kurulduktan sonra değiştiyse uyarı bilgisi */
const staleInfo = (wp) => {
  const list = positive(wp.product?.price);
  if (!list) return null;
  const weekly = Number(wp.weeklyPrice);
  const nowPct = discountPct(list, weekly);
  const base = positive(wp.listPriceAtStart);
  let thenPct;
  let lead;
  if (base) {
    if (toKurus(base) === toKurus(list)) return null;
    thenPct = discountPct(base, weekly);
    lead = `Liste fiyatı ${priceText(base)} → ${priceText(list)} oldu`;
  } else {
    thenPct = Math.round(Number(wp.startDiscountPercentage));
    if (!(thenPct >= 1) || thenPct === nowPct) return null;
    lead = `Liste fiyatı değişmiş (şimdi ${priceText(list)})`;
  }
  const tail = toKurus(weekly) >= toKurus(list) ? "fırsat fiyatı artık liste fiyatından düşük değil" : `indirim %${thenPct} → %${nowPct}`;
  return { list, thenPct, nowPct, text: `${lead}; ${tail}` };
};

/** Satış özeti: "34 adet · ₺1.020 ciro · ₺204 indirim" */
const perfText = (p, state) => {
  const units = Number(p.units) || 0;
  if (units <= 0) return state === "live" ? "Henüz satış yok" : "Satış olmadı";
  const parts = [`${units.toLocaleString("tr-TR")} adet`, `${wholeMoney(p.revenue)} ciro`];
  if (Number(p.discount) > 0) parts.push(`${wholeMoney(p.discount)} indirim`);
  return parts.join(" · ");
};
const validPerf = (p) => Boolean(p) && typeof p === "object" && Number.isFinite(Number(p.units));

const productImage = (product, width = 120) => cloudinaryImage(product?.thumbnail || product?.image || "", width);

// Ürün kataloğu: çekmece ilk açıldığında bir kez çekilir, 5 dk bellekte kalır
const CATALOG_TTL = 5 * 60 * 1000;
let catalogCache = null;
const loadCatalog = async (force = false) => {
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL) return catalogCache.products;
  const response = await axios.get("/products", { params: { fields: "card", limit: 5000 } });
  const products = (response.data?.products || []).filter((p) => !p.isHidden);
  catalogCache = { at: Date.now(), products };
  return products;
};

const FILTERS = [
  { id: "current", label: "Güncel" },
  { id: "live", label: "Yayında", dot: "ok" },
  { id: "planned", label: "Planlı", dot: "info" },
  { id: "ending", label: "Bitmek üzere", dot: "warn" },
  { id: "paused", label: "Durduruldu" },
  { id: "expired", label: "Bitti" },
];
const EMPTY_TEXT = {
  current: "Yayında, planlı ya da durdurulmuş fırsat yok.",
  live: "Yayında fırsat yok. Durdurulan bir fırsatı açın ya da yeni ekleyin.",
  planned: "Planlı fırsat yok. Fırsat eklerken başlangıç seçin ya da geçen haftayı kopyalayın.",
  ending: "7 gün içinde bitecek fırsat yok.",
  paused: "Durdurulmuş fırsat yok.",
  expired: "Biten fırsat yok.",
};
const PERF_MAX_IDS = 100;

// ── Telefon rafındaki tek ürün kartı ───────────────────────────────────────
const PhoneCard = ({ product, price, pct, ghost }) => {
  const img = productImage(product, 160);
  return (
    <div className="wky-pcard" data-ghost={ghost || undefined}>
      <div className="wky-pcard-img">
        {img ? <img src={img} alt="" loading="lazy" /> : <Package aria-hidden="true" />}
        {pct > 0 && <span className="wky-pcard-pct">%{pct}</span>}
      </div>
      <span className="wky-pcard-name">{product?.name || "Ürün"}</span>
      <span className="wky-pcard-prices">
        <b>{money(price)}</b>
        {product?.price > price && <s>{money(product.price)}</s>}
      </span>
      <span className="wky-pcard-add">Sepete ekle</span>
    </div>
  );
};

// ── Telefon çerçevesi: müşteri uygulamasındaki raf ────────────────────────
const PhonePreview = ({ live, ghost, now }) => {
  const [h, m] = clockOf(now);
  const count = live.length + (ghost ? 1 : 0);
  return (
    <div className="wky-phone" aria-label="Müşteri uygulaması önizlemesi">
      <div className="wky-phone-screen">
        <span className="wky-phone-notch" aria-hidden="true" />
        <div className="wky-phone-status" aria-hidden="true">
          <span>{pad2(h)}:{pad2(m)}</span>
          <span><Signal /><Wifi /><Battery /></span>
        </div>
        <div className="wky-phone-app">
          <div className="wky-phone-search" aria-hidden="true"><Search />Ürün ara…</div>
          <div className="wky-phone-title">
            <strong><Zap />Haftalık fırsatlar</strong>
            {count > 0 && <span>Tümü ›</span>}
          </div>
          {count === 0 ? (
            <div className="wky-shelf-empty">
              <Sparkles aria-hidden="true" />
              Raf boş. Yayında fırsat yokken müşteri bu bölümü görmez.
            </div>
          ) : (
            <div className="wky-shelf">
              {ghost && <PhoneCard product={ghost.product} price={ghost.price} pct={ghost.pct} ghost />}
              {live.map((wp) => (
                <PhoneCard key={wp._id} product={wp.product} price={wp.weeklyPrice} pct={wp.discountPercentage} />
              ))}
            </div>
          )}
          <div className="wky-phone-rest" aria-hidden="true"><span /><span /></div>
        </div>
      </div>
    </div>
  );
};

// ── Başlangıç / bitiş seçenekleri ─────────────────────────────────────────
const START_OPTIONS = [
  { id: "now", label: "Şimdi", icon: Zap },
  { id: "tomorrow", label: "Yarın 00:00" },
  { id: "monday", label: "Pazartesi 00:00" },
  { id: "custom", label: "Tarih seç", icon: CalendarClock },
];
const END_OPTIONS = [
  { id: "none", label: "Süresiz", icon: InfinityIcon },
  { id: "week", label: "Pazar 23:59" },
  { id: "3", label: "3 gün" },
  { id: "7", label: "7 gün" },
  { id: "14", label: "14 gün" },
  { id: "custom", label: "Tarih seç", icon: CalendarClock },
];
const COPY_START_OPTIONS = [
  { id: "monday", label: "Pazartesi 00:00" },
  { id: "tomorrow", label: "Yarın 00:00" },
  { id: "now", label: "Şimdi", icon: Zap },
  { id: "custom", label: "Tarih seç", icon: CalendarClock },
];
const COPY_END_OPTIONS = [
  { id: "week", label: "Pazar 23:59" },
  { id: "7", label: "7 gün" },
  { id: "14", label: "14 gün" },
  { id: "custom", label: "Tarih seç", icon: CalendarClock },
];
const ROUNDING_OPTIONS = [
  { value: "none", label: "Yuvarlama yok", title: "Kuruşuna kadar aynı oran" },
  { value: "90", label: "Sonu ,90", title: "En yakın ,90'lı fiyat (29,88 → 29,90)" },
  { value: "50", label: "Sonu ,50", title: "En yakın ,50'li fiyat (29,88 → 29,50)" },
];
const QUICK_PCT = [10, 15, 20, 25, 30, 40, 50];

/** Başlangıç seçeneğinin anı (seçenekler çekmece/pencere açıldığı ana göre sabittir) */
const startOptionMs = (mode, base, custom) => {
  if (mode === "tomorrow") return tomorrowStart(base);
  if (mode === "monday") return nextMondayStart(base);
  if (mode === "custom") return fromTrInput(custom);
  return base;
};
/** Bitiş seçeneğinin anı (null: süresiz, NaN: seçilmedi/geçersiz) */
const endOptionMs = (mode, startMs, custom) => {
  if (mode === "none") return null;
  if (mode === "custom") return custom ? fromTrInput(custom, { end: true }) : NaN;
  if (!Number.isFinite(startMs)) return NaN;
  if (mode === "week") return endOfTrWeek(startMs);
  return endAfterDays(startMs, Number(mode));
};
/** Planlı fırsatı düzenlerken kayıtlı başlangıca uyan seçenek */
const initialStartMode = (item, base) => {
  const ms = msOf(item?.startDate);
  if (!Number.isFinite(ms)) return "custom";
  if (ms === nextMondayStart(base)) return "monday";
  if (ms === tomorrowStart(base)) return "tomorrow";
  return "custom";
};

const OptionChips = ({ options, value, onChange, label }) => (
  <div className="wky-quick" role="group" aria-label={label} style={{ marginTop: 0 }}>
    {options.map((opt) => (
      <button key={opt.id} type="button" aria-pressed={value === opt.id} onClick={() => onChange(opt.id)}>
        {opt.icon && <opt.icon />}{opt.label}
      </button>
    ))}
  </div>
);

// ── Ekleme / düzenleme / planlama çekmecesi ───────────────────────────────
const WeeklyForm = ({ mode, item, items, now, onClose, onSaved, onGhost }) => {
  const { confirm } = useConfirm();
  const editing = mode === "edit";
  const plannedItem = editing && item.scheduled === true;
  const canPlan = !editing || plannedItem; // başlangıç yalnızca eklemede ve planlı fırsatta seçilir
  // Seçenek anları açılış anına göre sabit: gece yarısını geçen açık çekmecede "Pazartesi" kaymaz
  const [openedAt] = useState(now);
  const [product, setProduct] = useState(editing ? item.product : null);
  const [price, setPrice] = useState(editing ? String(item.weeklyPrice ?? "") : "");
  const [pct, setPct] = useState(editing && item.product?.price > item.weeklyPrice ? String(discountPct(item.product.price, item.weeklyPrice)) : "");
  const [startMode, setStartMode] = useState(plannedItem ? initialStartMode(item, openedAt) : "now");
  const [startCustom, setStartCustom] = useState(plannedItem ? toTrInput(item.startDate) : "");
  const [endMode, setEndMode] = useState(editing && item.endDate ? "custom" : "none");
  const [endCustom, setEndCustom] = useState(editing ? toTrInput(item.endDate) : "");
  const [order, setOrder] = useState(editing ? String(item.order ?? 0) : "");
  const [isActive, setIsActive] = useState(editing ? item.isActive !== false : true);
  const [endLive, setEndLive] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // Ürün kataloğu (yalnızca eklemede)
  const [catalog, setCatalog] = useState(catalogCache?.products || null);
  const [catalogError, setCatalogError] = useState(null);
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState(0);
  const searchRef = useRef(null);
  const priceRef = useRef(null);

  useEffect(() => {
    if (editing || catalog) return undefined;
    let cancelled = false;
    loadCatalog()
      .then((list) => { if (!cancelled) setCatalog(list); })
      .catch(() => { if (!cancelled) setCatalogError("Ürünler yüklenemedi"); });
    return () => { cancelled = true; };
  }, [editing, catalog]);

  useEffect(() => {
    if (!editing && !product) searchRef.current?.focus();
    else if (!editing && product) priceRef.current?.focus();
  }, [editing, product]);

  // Ürün başına yayındaki / planlı kayıt (seçicide rozet)
  const dealState = useMemo(() => {
    const map = new Map();
    for (const wp of items) {
      const id = wp.product?._id;
      if (!id) continue;
      if (isRunning(wp, now)) map.set(id, "live");
      else if (wp.scheduled && !(msOf(wp.endDate) <= now) && !map.has(id)) map.set(id, "planned");
    }
    return map;
  }, [items, now]);
  const results = useMemo(() => {
    if (!catalog) return [];
    const q = fold(query.trim());
    const list = q ? catalog.filter((p) => fold(p.name).includes(q)) : catalog;
    return list.slice(0, 40);
  }, [catalog, query]);
  useEffect(() => { setPick(0); }, [query]);

  const basePrice = Number(product?.price) || 0;
  const priceNum = num(price);
  const pctNum = num(pct);

  // ── Tarihler ──
  const startMs = canPlan ? startOptionMs(startMode, openedAt, startCustom) : NaN;
  const planning = canPlan && startMode !== "now" && Number.isFinite(startMs) && startMs > now;
  const effectiveStart = planning ? startMs : now;
  const endBase = canPlan && startMode !== "now" && Number.isFinite(startMs) ? startMs : openedAt;
  const endMs = endOptionMs(endMode, endBase, endCustom);
  const endValid = endMs === null || Number.isFinite(endMs);

  const priceError = !price ? null
    : !(priceNum > 0) ? "Geçerli bir fiyat girin"
      : basePrice && toKurus(priceNum) >= toKurus(basePrice) ? "Fırsat fiyatı mağaza fiyatından düşük olmalı" : null;
  const startError = !canPlan || startMode !== "custom" ? null
    : !startCustom || !Number.isFinite(startMs) ? "Başlangıç tarihi ve saatini seçin"
      : startMs <= now ? "Başlangıç geçmişte kaldı. Hemen başlatmak için Şimdi'yi seçin." : null;
  const endError = endMode === "custom" && (!endCustom || !Number.isFinite(endMs)) ? "Bitiş tarihi ve saatini seçin"
    : endMs !== null && Number.isFinite(endMs) && endMs <= now ? "Bitiş tarihi geçmişte kaldı"
      : endMs !== null && Number.isFinite(endMs) && endMs <= effectiveStart ? "Bitiş, başlangıçtan sonra olmalı" : null;

  // ── Aynı ürünün diğer kayıtlarıyla çakışma (sunucu da denetler) ──
  const resultsLive = !editing || plannedItem || isActive; // kayıt sonunda yayında ya da planlı olacak mı
  const others = useMemo(
    () => (product?._id ? items.filter((wp) => wp.product?._id === product._id && wp._id !== item?._id) : []),
    [items, product, item],
  );
  const plannedClash = resultsLive && endValid && !startError
    ? others.find((wp) => wp.scheduled && !(msOf(wp.endDate) <= now)
      && rangesOverlap(effectiveStart, endMs === null ? NaN : endMs, msOf(wp.startDate), msOf(wp.endDate))) : null;
  const running = resultsLive ? others.find((wp) => isRunning(wp, now)) : null;
  const runningEnd = running ? msOf(running.endDate) : NaN;
  // Planlı fırsat başlarken yayındaki hâlâ sürüyor (bitişi başlangıca çekilebilir)
  const liveClash = running && planning && !(Number.isFinite(runningEnd) && runningEnd <= startMs) ? running : null;
  // Hemen başlayacak: planlı fırsat "Şimdi" başlatılıyorsa yayındaki şimdi bitirilebilir; yeni eklemede engel
  const nowClash = running && !planning && (plannedItem || !editing) ? running : null;
  const otherLive = running && editing && !plannedItem && !item.isActive && isActive ? running : null;
  const fixableLive = (liveClash || (nowClash && plannedItem)) ? running : null;
  const conflictBlocks = Boolean(plannedClash) || Boolean(otherLive) || (Boolean(nowClash) && !plannedItem) || (Boolean(fixableLive) && !endLive);
  const showEndLive = Boolean(fixableLive) || (serverError && (serverError.code === "LIVE_OVERLAP" || (serverError.code === "ALREADY_LIVE" && plannedItem)));

  const canSave = Boolean(product) && Boolean(price) && !priceError && !startError && !endError && !conflictBlocks;
  const savings = basePrice && priceNum > 0 ? basePrice - priceNum : 0;
  const effectivePct = basePrice && priceNum > 0 ? discountPct(basePrice, priceNum) : 0;

  // Rafta hayalet kart: hemen yayına girecek ekleme sırasında
  useEffect(() => {
    if (!onGhost) return undefined;
    onGhost(!editing && !planning && product && priceNum > 0 ? { product, price: priceNum, pct: effectivePct } : null);
    return () => onGhost(null);
  }, [onGhost, editing, planning, product, priceNum, effectivePct]);

  const touch = () => { setTouched(true); setServerError(null); };
  const changePrice = (value) => {
    touch();
    setPrice(value);
    const n = num(value);
    setPct(basePrice && n > 0 && n < basePrice ? String(discountPct(basePrice, n)) : "");
  };
  const changePct = (value) => {
    touch();
    setPct(value);
    const n = num(value);
    if (basePrice && n > 0 && n < 100) setPrice(priceFromPct(basePrice, n).toFixed(2));
  };
  const choose = (p) => {
    setProduct(p);
    setQuery("");
    touch();
    if (price) {
      const n = num(price);
      const list = Number(p.price) || 0;
      setPct(list && n > 0 && n < list ? String(discountPct(list, n)) : "");
    }
  };
  const onSearchKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setPick((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPick((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && results[pick]) { e.preventDefault(); choose(results[pick]); }
  };
  const setEndTo = (ms) => {
    touch();
    setEndMode("custom");
    setEndCustom(toTrInput(ms));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setServerError(null);
    const payload = {
      weeklyPrice: roundMoney(priceNum),
      endDate: endMs === null ? null : new Date(endMs).toISOString(),
    };
    if (canPlan) {
      if (planning) payload.startDate = new Date(startMs).toISOString();
      else if (plannedItem) payload.startDate = "now";
      if (endLive) payload.endLiveAtStart = true;
    }
    try {
      if (editing) {
        payload.order = Number.isFinite(num(order)) && num(order) >= 0 ? Math.round(num(order)) : item.order;
        if (!plannedItem) payload.isActive = isActive;
        const response = await axios.put(`/weekly-products/${item._id}`, payload);
        onSaved("edit", response.data?.weeklyProduct, item);
      } else {
        payload.productId = product._id;
        payload.order = items.reduce((max, wp) => Math.max(max, Number(wp.order) || 0), -1) + 1;
        const response = await axios.post("/weekly-products", payload);
        onSaved(planning ? "plan" : "add", response.data?.weeklyProduct);
      }
    } catch (error) {
      const data = error.response?.data;
      const message = data?.message || "Kaydedilemedi";
      setServerError({ message, code: data?.code || null });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const dirty = touched && !saving;
  const onDirtyClose = () => confirm({
    title: "Kaydedilmemiş değişiklik var",
    message: "Çekmeceyi kapatırsanız girdikleriniz kaybolur.",
    confirmText: "Kapat",
    cancelText: "Düzenlemeye dön",
    type: "warning",
  });

  const title = editing ? (plannedItem ? "Planlı fırsatı düzenle" : "Fırsatı düzenle") : "Fırsat ekle";
  const submitLabel = editing ? "Kaydet" : planning ? "Planla" : "Rafa ekle";

  return (
    <Drawer
      title={title}
      subtitle={editing ? item.product?.name || "Ürün silinmiş" : "Ürün seçin, fiyatı, başlangıcı ve bitişi belirleyin"}
      icon={editing ? Pencil : Plus}
      width={480}
      onClose={onClose}
      dirty={dirty}
      onDirtyClose={onDirtyClose}
      footer={(
        <>
          <button type="button" className="ui-btn" onClick={onClose} disabled={saving}>İptal</button>
          <button type="submit" form="wky-form" className="ui-btn ui-btn--primary" disabled={!canSave || saving}>
            {saving ? <span className="ui-loader" /> : submitLabel}
          </button>
        </>
      )}
    >
      <form id="wky-form" className="wky-form" onSubmit={submit} noValidate>
        {/* Ürün */}
        <div>
          <span className="ui-label">Ürün</span>
          {product ? (
            <div className="wky-selected">
              <div className="ui-thumb wky-thumb">
                {productImage(product) ? <img src={productImage(product)} alt="" /> : <Package aria-hidden="true" />}
              </div>
              <div>
                <strong>{product.name}</strong>
                <small>
                  Mağaza fiyatı {money(product.price)}
                  {product.isDiscounted && product.discountedPrice ? ` · şu an indirimli ${money(product.discountedPrice)}` : ""}
                  {product.isOutOfStock ? " · stokta yok" : ""}
                </small>
              </div>
              {!editing && (
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setProduct(null); setPrice(""); setPct(""); setEndLive(false); touch(); }}>Değiştir</button>
              )}
            </div>
          ) : (
            <div className="wky-picker">
              <div className="ui-search">
                <Search aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  className="ui-field"
                  placeholder="Ürün adı yazın…"
                  aria-label="Ürün ara"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  autoComplete="off"
                />
              </div>
              <div className="wky-picker-list" role="listbox" aria-label="Ürünler">
                {catalogError ? (
                  <div className="wky-picker-empty">
                    {catalogError} · <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setCatalogError(null); setCatalog(null); }}>Tekrar dene</button>
                  </div>
                ) : !catalog ? (
                  <SkeletonRows rows={4} height={50} />
                ) : results.length === 0 ? (
                  <div className="wky-picker-empty">{query ? `"${query}" için ürün bulunamadı` : "Ürün yok"}</div>
                ) : results.map((p, i) => {
                  const state = dealState.get(p._id);
                  return (
                    <button
                      key={p._id}
                      type="button"
                      role="option"
                      aria-selected={i === pick}
                      className="wky-picker-item"
                      data-cursor={i === pick}
                      onMouseEnter={() => setPick(i)}
                      onClick={() => choose(p)}
                    >
                      <span className="ui-thumb">
                        {productImage(p, 80) ? <img src={productImage(p, 80)} alt="" loading="lazy" /> : <Package aria-hidden="true" />}
                      </span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.category || "Kategori yok"}{p.isOutOfStock ? " · stokta yok" : ""}
                          {state === "live" ? " · fırsat yayında" : state === "planned" ? " · planlı fırsatı var" : ""}
                        </small>
                      </span>
                      <span className="ui-num">{money(p.price)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="ui-hint">Yayındaki ürün için yeni fırsatı ileri bir başlangıçla planlayın. <kbd className="ui-kbd">↑</kbd> <kbd className="ui-kbd">↓</kbd> ile gezin, <kbd className="ui-kbd">↵</kbd> ile seçin.</p>
            </div>
          )}
        </div>

        {/* Fiyat / indirim */}
        <div>
          <span className="ui-label">Fırsat fiyatı</span>
          <div className="wky-calc">
            <div className="ui-field-prefix">
              <span>₺</span>
              <input
                ref={priceRef}
                id="wky-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="ui-field"
                placeholder={basePrice ? priceFromPct(basePrice, 20).toFixed(2) : "0,00"}
                aria-label="Fırsat fiyatı (₺)"
                value={price}
                onChange={(e) => changePrice(e.target.value)}
                disabled={!product}
              />
            </div>
            <div className="wky-calc-suffix">
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                max="99"
                className="ui-field"
                placeholder="İndirim"
                aria-label="İndirim yüzdesi"
                value={pct}
                onChange={(e) => changePct(e.target.value)}
                disabled={!product}
              />
              <span>%</span>
            </div>
          </div>
          <div className="wky-quick" role="group" aria-label="Hızlı indirim">
            {QUICK_PCT.map((q) => (
              <button key={q} type="button" aria-pressed={pctNum === q} onClick={() => changePct(String(q))} disabled={!product}>
                <Percent />{q}
              </button>
            ))}
          </div>
          {priceError ? (
            <p className="wky-calc-result" data-tone="danger" role="alert" style={{ marginTop: 8 }}>{priceError}</p>
          ) : product && priceNum > 0 ? (
            <p className="wky-calc-result" style={{ marginTop: 8 }}>
              <span>{money(basePrice)} <ArrowRight className="wky-price-arrow" aria-hidden="true" /> <span className="ui-num">{money(priceNum)}</span></span>
              <span>%{effectivePct} indirim · {money(savings)} tasarruf</span>
            </p>
          ) : null}
        </div>

        {/* Başlangıç */}
        {canPlan && (
          <div>
            <span className="ui-label">Başlangıç <span className="wky-tz">İstanbul saati</span></span>
            <OptionChips
              options={START_OPTIONS}
              value={startMode}
              label="Başlangıç"
              onChange={(id) => {
                setStartMode(id);
                if (id === "custom" && !startCustom) setStartCustom(toTrInput(nextMondayStart(openedAt)));
                touch();
              }}
            />
            {startMode === "custom" && (
              <input
                type="datetime-local"
                className="ui-field wky-datetime"
                aria-label="Başlangıç tarihi ve saati (İstanbul)"
                value={startCustom}
                min={toTrInput(now)}
                onChange={(e) => { setStartCustom(e.target.value); touch(); }}
              />
            )}
            {startError ? (
              <p className="ui-hint wky-hint-error" role="alert">{startError}</p>
            ) : (
              <p className="ui-hint">
                {planning
                  ? `Planlı: ${atLabel(startMs, now)} kendiliğinden yayına girer. O zamana kadar müşteri görmez.`
                  : startMode !== "now" && Number.isFinite(startMs)
                    ? "Bu an geldi; kaydedince fırsat hemen yayına girer."
                    : "Kaydedince fırsat hemen rafta görünür."}
              </p>
            )}
          </div>
        )}

        {/* Bitiş */}
        <div>
          <span className="ui-label">Bitiş{!canPlan ? null : <span className="wky-tz">İstanbul saati</span>}</span>
          <OptionChips
            options={END_OPTIONS}
            value={endMode}
            label="Bitiş"
            onChange={(id) => {
              setEndMode(id);
              if (id === "custom" && !endCustom) setEndCustom(toTrInput(endOfTrWeek(Number.isFinite(effectiveStart) ? effectiveStart : now)));
              touch();
            }}
          />
          {endMode === "custom" && (
            <input
              type="datetime-local"
              className="ui-field wky-datetime"
              aria-label="Bitiş tarihi ve saati (İstanbul)"
              value={endCustom}
              min={toTrInput(Math.max(now, Number.isFinite(effectiveStart) ? effectiveStart : now))}
              onChange={(e) => { setEndCustom(e.target.value); touch(); }}
            />
          )}
          {endError ? (
            <p className="ui-hint wky-hint-error" role="alert">{endError}</p>
          ) : (
            <p className="ui-hint">
              {endMs !== null && Number.isFinite(endMs)
                ? `Bitiş: ${formatDateTime(endMs)} · ${remaining(endMs, now).label}. Süre dolunca fırsat raftan düşer, kayıt silinmez.`
                : "Süresiz fırsat siz durdurana kadar yayında kalır."}
            </p>
          )}
        </div>

        {/* Çakışmalar */}
        {plannedClash && (
          <div className="wky-conflict" data-tone="danger" role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Bu ürünün planlı fırsatıyla çakışıyor</strong>
              <span>Planlı fırsat: {rangeText(msOf(plannedClash.startDate), Number.isFinite(msOf(plannedClash.endDate)) ? msOf(plannedClash.endDate) : null)}. Tarihleri değiştirin.</span>
              {!planning && msOf(plannedClash.startDate) > now && (
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setEndTo(msOf(plannedClash.startDate))}>
                  Bitişi {whenShort(msOf(plannedClash.startDate), now)} yap
                </button>
              )}
            </div>
          </div>
        )}
        {!plannedClash && nowClash && !plannedItem && (
          <div className="wky-conflict" data-tone="warn" role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Bu ürün şu an yayında</strong>
              <span>Mevcut fırsat: {money(nowClash.weeklyPrice)} · bitiş {Number.isFinite(runningEnd) ? formatDateTime(runningEnd) : "süresiz"}. Yeni fırsatı ileri bir tarihe planlayın ya da mevcut fırsatı düzenleyin.</span>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setStartMode("monday"); touch(); }}>
                {"Pazartesi 00:00'dan başlat"}
              </button>
            </div>
          </div>
        )}
        {otherLive && (
          <div className="wky-conflict" data-tone="danger" role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Bu ürünün yayında başka bir fırsatı var</strong>
              <span>Bu fırsatı açmadan önce yayındakini durdurun.</span>
            </div>
          </div>
        )}
        {!plannedClash && showEndLive && (
          <div className="wky-conflict" data-tone="warn">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>{planning ? "Mevcut fırsat planlı başlangıçtan sonra bitiyor" : "Bu ürün şu an yayında"}</strong>
              <span>
                {running
                  ? `Yayındaki fırsat: ${money(running.weeklyPrice)} · bitiş ${Number.isFinite(runningEnd) ? formatDateTime(runningEnd) : "süresiz"}.`
                  : serverError?.message}
              </span>
              <label className="ui-check wky-check-row">
                <input type="checkbox" checked={endLive} onChange={(e) => { setEndLive(e.target.checked); setTouched(true); setServerError(null); }} />
                {planning ? `Mevcut fırsatın bitişini başlangıca çek (${whenShort(startMs, now)})` : "Mevcut fırsatı şimdi bitir"}
              </label>
            </div>
          </div>
        )}
        {serverError && !showEndLive && !plannedClash && (
          <p className="wky-calc-result" data-tone="danger" role="alert">{serverError.message}</p>
        )}

        {editing && (
          <>
            {plannedItem ? (
              <div className="wky-form-row">
                <div>
                  <strong>Planlı</strong>
                  <small>Başlangıçta kendiliğinden yayına girer. Planı iptal etmek için listede çöp kutusuna basın.</small>
                </div>
                <CalendarClock className="wky-form-row-icon" aria-hidden="true" />
              </div>
            ) : (
              <div className="wky-form-row">
                <div>
                  <strong>Yayında</strong>
                  <small>Kapalıyken müşteri rafta görmez; kayıt durur.</small>
                </div>
                <button
                  type="button"
                  className="ui-icon-btn ui-switch"
                  data-on={isActive}
                  role="switch"
                  aria-checked={isActive}
                  aria-label="Yayında"
                  onClick={() => { setIsActive((v) => !v); touch(); }}
                >
                  {isActive ? <ToggleRight /> : <ToggleLeft />}
                </button>
              </div>
            )}
            <div className="wky-form-row">
              <div>
                <strong>Sıra</strong>
                <small>Küçük sayı rafta öne gelir. Listede sürükleyerek de değiştirebilirsiniz.</small>
              </div>
              <input
                type="number"
                inputMode="numeric"
                className="ui-field ui-field--auto wky-order-input"
                aria-label="Sıra"
                min="0"
                value={order}
                onChange={(e) => { setOrder(e.target.value); touch(); }}
              />
            </div>
          </>
        )}

        {product && priceNum > 0 && !priceError && (
          <div className="wky-card-preview">
            <PhoneCard product={product} price={priceNum} pct={effectivePct} />
            <p>
              <strong>Müşteri böyle görür{planning ? ` · ${atLabel(startMs, now)} itibarıyla` : ""}</strong>
              Kart, uygulamanın ana sayfasındaki Haftalık fırsatlar rafında çıkar. Yüzde rozeti sunucuda güncel liste fiyatından hesaplanır.
            </p>
          </div>
        )}
      </form>
    </Drawer>
  );
};

// ── Yeni haftaya kopyalama penceresi ──────────────────────────────────────
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
/** Pencere içinde Tab döngüsü (üstte onay penceresi yokken) */
const trapDialogTab = (e, root) => {
  if (e.key !== "Tab" || !root || document.querySelector(".confirm-root")) return;
  const list = [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.getClientRects().length > 0);
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
};

const CopyDialog = ({ items, ids, now, onClose, onDone }) => {
  const titleId = useId();
  const dialogRef = useRef(null);
  const [openedAt] = useState(now);
  const fromSelection = Array.isArray(ids);
  const lastWeek = useMemo(() => {
    const monday = thisMondayStart(openedAt);
    return { from: monday - 7 * DAY, to: monday };
  }, [openedAt]);
  const liveDeals = useMemo(() => items.filter((wp) => statusOf(wp, now) === "live"), [items, now]);
  const lastWeekDeals = useMemo(() => latestPerProduct(items.filter((wp) => wasLiveDuring(wp, lastWeek.from, lastWeek.to))), [items, lastWeek]);
  const [source, setSource] = useState(() => (fromSelection ? "selected" : liveDeals.length || !lastWeekDeals.length ? "live" : "lastWeek"));
  const [startMode, setStartMode] = useState("monday");
  const [startCustom, setStartCustom] = useState(() => toTrInput(nextMondayStart(openedAt)));
  const [endMode, setEndMode] = useState("week");
  const [endCustom, setEndCustom] = useState(() => toTrInput(endOfTrWeek(nextMondayStart(openedAt))));
  const [storedRounding, setRounding] = usePref("wky-copy-rounding", "none");
  const rounding = ROUNDING_OPTIONS.some((o) => o.value === storedRounding) ? storedRounding : "none";
  const [endLive, setEndLive] = useState(true);
  const [overrides, setOverrides] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // Odak pencereye taşınır, kapanınca açan öğeye döner; Esc kapatır (kaydederken değil)
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector(".confirm-root")) return;
      e.stopPropagation();
      if (!busyRef.current) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev && prev !== document.body && prev.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, []);

  const sourceDeals = useMemo(() => {
    const list = source === "selected"
      ? items.filter((wp) => ids.includes(wp._id))
      : source === "live" ? liveDeals : lastWeekDeals;
    return [...list].sort(byShelfOrder(now));
  }, [source, items, ids, liveDeals, lastWeekDeals, now]);

  // ── Tarihler ──
  const startMs = startMode === "now" ? now : startOptionMs(startMode, openedAt, startCustom);
  const immediate = startMode === "now" || (Number.isFinite(startMs) && startMs <= now);
  const effectiveStart = immediate ? now : startMs;
  const endBase = startMode === "now" ? openedAt : startMs;
  const endMs = endOptionMs(endMode, endBase, endCustom);
  const startError = startMode !== "custom" ? null
    : !startCustom || !Number.isFinite(startMs) ? "Başlangıç tarihi ve saatini seçin"
      : startMs <= now ? "Başlangıç geçmişte kaldı. Hemen başlatmak için Şimdi'yi seçin." : null;
  const endError = !Number.isFinite(endMs) ? "Bitiş tarihi ve saatini seçin"
    : endMs <= now ? "Bitiş tarihi geçmişte kaldı"
      : endMs <= effectiveStart ? "Bitiş, başlangıçtan sonra olmalı" : null;
  const datesValid = !startError && !endError;

  // ── Önizleme ──
  const rows = useMemo(() => {
    const seen = new Set();
    return sourceDeals.map((wp) => {
      const product = wp.product;
      const pid = product?._id;
      const duplicate = Boolean(pid) && seen.has(pid);
      if (pid) seen.add(pid);
      const list = positive(product?.price);
      const next = product && list ? carryOver(wp, list, rounding) : null;
      const productDeals = pid ? items.filter((x) => x.product?._id === pid) : [];
      const plannedClash = datesValid && productDeals.some((x) => x.scheduled && !(msOf(x.endDate) <= now)
        && rangesOverlap(effectiveStart, endMs, msOf(x.startDate), msOf(x.endDate)));
      const running = productDeals.find((x) => isRunning(x, now));
      const runningEnd = running ? msOf(running.endDate) : NaN;
      const liveClash = datesValid && Boolean(running) && (immediate || !(Number.isFinite(runningEnd) && runningEnd <= effectiveStart));
      let otherBlock = null;
      if (!product) otherBlock = "Ürün silinmiş";
      else if (duplicate) otherBlock = "Aynı ürün listede bir kez daha var";
      else if (!list) otherBlock = "Liste fiyatı yok";
      else if (!next) otherBlock = "İndirim hesaplanamadı";
      else if (plannedClash) otherBlock = "Bu tarihlerde planlı fırsatı var";
      const blocked = otherBlock
        || (liveClash && !endLive ? (immediate ? "Ürün şu an yayında" : "Yayındaki fırsatı yeni başlangıçtan sonra bitiyor") : null);
      const flags = [];
      if (product?.isHidden) flags.push("Gizli");
      if (product?.isOutOfStock) flags.push("Stokta yok");
      const notes = [];
      if (!blocked && liveClash) notes.push(immediate ? "Yayındaki fırsat hemen biter" : `Yayındaki fırsat ${atLabel(effectiveStart, now)} biter`);
      const base = positive(wp.listPriceAtStart);
      if (!blocked && list && base && toKurus(base) !== toKurus(list)) notes.push(`Liste fiyatı ${priceText(base)} → ${priceText(list)}`);
      const prevPct = Number.isFinite(Number(wp.startDiscountPercentage)) ? Math.round(Number(wp.startDiscountPercentage)) : Math.round(Number(wp.discountPercentage) || 0);
      return { wp, product, list, next, blocked, flags, notes, liveClash: liveClash && !otherBlock, prevPct };
    });
  }, [sourceDeals, items, rounding, datesValid, effectiveStart, endMs, immediate, endLive, now]);

  const isChecked = (row) => !row.blocked && (overrides.has(row.wp._id) ? overrides.get(row.wp._id) : row.flags.length === 0);
  const checkedRows = rows.filter(isChecked);
  const selectable = rows.filter((row) => !row.blocked);
  const liveClashCount = rows.filter((row) => row.liveClash).length;
  const allChecked = selectable.length > 0 && checkedRows.length === selectable.length;
  const setChecked = (row, value) => setOverrides((cur) => new Map(cur).set(row.wp._id, value));
  const toggleAll = () => setOverrides(() => new Map(selectable.map((row) => [row.wp._id, !allChecked])));
  const canSubmit = datesValid && checkedRows.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const payload = {
      ids: checkedRows.map((row) => row.wp._id),
      startDate: immediate ? "now" : new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
      rounding,
      endLiveAtStart: endLive,
      includeUnavailable: checkedRows.some((row) => row.flags.length > 0),
    };
    try {
      const response = await axios.post("/weekly-products/copy", payload);
      const created = response.data?.created || [];
      const skipped = response.data?.skipped || [];
      onDone(created, { immediate });
      const verb = immediate ? "yayına alındı" : "planlandı";
      if (!skipped.length) {
        toast.success(created.length ? `${created.length} fırsat ${verb}` : "Fırsat oluşturulmadı");
        onClose();
        return;
      }
      setResult({ created: created.length, skipped, verb });
    } catch (error) {
      toast.error(error.response?.data?.message || "Kopyalanamadı");
    } finally {
      setBusy(false);
    }
  };

  const sourceOptions = [
    { value: "live", label: `Şu an yayındakiler (${liveDeals.length})` },
    { value: "lastWeek", label: `Geçen hafta (${lastWeekDeals.length})`, title: `${formatDate(lastWeek.from)} – ${formatDate(lastWeek.to - 1)} arasında yayında olanlar` },
  ];
  const submitLabel = immediate ? `${checkedRows.length} fırsatı yayına al` : `${checkedRows.length} fırsatı planla`;

  return (
    <div className="ui-modal-backdrop wky-copy-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        ref={dialogRef}
        className="ui-modal ui-modal--wide wky-copy"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => trapDialogTab(e, dialogRef.current)}
      >
        <div className="ui-modal-header">
          <div>
            <h2 id={titleId} className="ui-title wky-copy-title"><CopyPlus aria-hidden="true" />Yeni haftaya kopyala</h2>
            <p className="ui-muted ui-text-sm">Her ürüne önceki fırsatın indirim oranı, ürünün güncel liste fiyatı üzerinden uygulanır.</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} disabled={busy} aria-label="Kapat"><X /></button>
        </div>

        {result ? (
          <>
            <div className="ui-modal-body wky-copy-body">
              <p className="wky-copy-result-lead">
                <Check aria-hidden="true" />
                {result.created ? `${result.created} fırsat ${result.verb}.` : "Hiçbir fırsat oluşturulmadı."} {result.skipped.length} ürün atlandı:
              </p>
              <ul className="wky-copy-skipped">
                {result.skipped.map((item) => (
                  <li key={`${item.id}-${item.reason}`}>
                    <strong>{item.productName && item.productName !== "—" ? item.productName : "Ürün"}</strong>
                    <span>{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ui-modal-footer">
              <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>Tamam</button>
            </div>
          </>
        ) : (
          <>
            <div className="ui-modal-body wky-copy-body">
              {fromSelection ? (
                <p className="wky-copy-source-note"><ListChecks aria-hidden="true" />Listede seçtiğiniz {sourceDeals.length} fırsat kopyalanacak.</p>
              ) : (
                <section className="wky-copy-section" aria-label="Hangi fırsatlar kopyalansın">
                  <span className="ui-label">Kopyalanacak fırsatlar</span>
                  <Segmented options={sourceOptions} value={source} onChange={(value) => { setSource(value); setOverrides(new Map()); }} ariaLabel="Kopyalanacak fırsatlar" />
                  <p className="ui-hint">
                    {source === "live"
                      ? "Pazar akşamı plan yapıyorsanız bu haftanın, yani şu an yayındaki fırsatları kopyalayın."
                      : `${formatDate(lastWeek.from)} – ${formatDate(lastWeek.to - 1)} haftasında yayında olan fırsatlar. Pazartesi sabahı plan yapıyorsanız bunu seçin.`}
                  </p>
                </section>
              )}

              <section className="wky-copy-dates">
                <div>
                  <span className="ui-label">Başlangıç <span className="wky-tz">İstanbul saati</span></span>
                  <OptionChips options={COPY_START_OPTIONS} value={startMode} label="Başlangıç" onChange={setStartMode} />
                  {startMode === "custom" && (
                    <input type="datetime-local" className="ui-field wky-datetime" aria-label="Başlangıç tarihi ve saati (İstanbul)"
                      value={startCustom} min={toTrInput(now)} onChange={(e) => setStartCustom(e.target.value)} />
                  )}
                  {startError && <p className="ui-hint wky-hint-error" role="alert">{startError}</p>}
                </div>
                <div>
                  <span className="ui-label">Bitiş</span>
                  <OptionChips options={COPY_END_OPTIONS} value={endMode} label="Bitiş" onChange={setEndMode} />
                  {endMode === "custom" && (
                    <input type="datetime-local" className="ui-field wky-datetime" aria-label="Bitiş tarihi ve saati (İstanbul)"
                      value={endCustom} min={toTrInput(Number.isFinite(effectiveStart) ? Math.max(now, effectiveStart) : now)} onChange={(e) => setEndCustom(e.target.value)} />
                  )}
                  {endError && !startError && <p className="ui-hint wky-hint-error" role="alert">{endError}</p>}
                </div>
                {datesValid && (
                  <p className="wky-copy-range">
                    <CalendarClock aria-hidden="true" />
                    {immediate ? `Hemen yayına girer · bitiş ${formatDateTime(endMs)}` : `${rangeText(startMs, endMs)} · ${atLabel(startMs, now)} kendiliğinden yayına girer`}
                  </p>
                )}
              </section>

              <section className="wky-copy-section">
                <span className="ui-label">Yeni fiyatı yuvarla</span>
                <Segmented options={ROUNDING_OPTIONS} value={rounding} onChange={setRounding} ariaLabel="Yuvarlama" size="sm" />
              </section>

              {liveClashCount > 0 && (
                <label className="ui-check wky-check-row wky-copy-endlive">
                  <input type="checkbox" checked={endLive} onChange={(e) => setEndLive(e.target.checked)} />
                  <span>
                    Yayındaki fırsatların bitişini {immediate ? "şimdiye" : "yeni başlangıca"} çek ({liveClashCount} ürün)
                    <small>Kapalıysa bu ürünler atlanır.</small>
                  </span>
                </label>
              )}

              {rows.length === 0 ? (
                <EmptyState
                  compact
                  icon={Sparkles}
                  title="Kopyalanacak fırsat yok"
                  description={source === "live" ? "Şu an yayında fırsat yok. Geçen haftayı deneyin." : source === "lastWeek" ? "Geçen hafta yayında olan fırsat bulunamadı." : "Seçtiğiniz fırsatlar listede yok."}
                />
              ) : (
                <div className="wky-copy-table-wrap">
                  <table className="ui-table wky-copy-table">
                    <thead>
                      <tr>
                        <th scope="col" className="wky-copy-checkcell">
                          <input type="checkbox" className="ui-checkbox" checked={allChecked} disabled={!selectable.length}
                            onChange={toggleAll} aria-label="Tümünü seç" />
                        </th>
                        <th scope="col">Ürün</th>
                        <th scope="col" className="wky-copy-num">Liste fiyatı</th>
                        <th scope="col" className="wky-copy-num">Önceki fırsat</th>
                        <th scope="col" className="wky-copy-num">Yeni fırsat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const checked = isChecked(row);
                        const name = row.product?.name || "Ürün silinmiş";
                        return (
                          <tr key={row.wp._id} data-blocked={Boolean(row.blocked)} data-checked={checked}
                            onClick={(e) => { if (!row.blocked && e.target.tagName !== "INPUT") setChecked(row, !checked); }}>
                            <td className="wky-copy-checkcell">
                              <input type="checkbox" className="ui-checkbox" checked={checked} disabled={Boolean(row.blocked)}
                                onChange={(e) => setChecked(row, e.target.checked)} aria-label={`${name} kopyalansın`} />
                            </td>
                            <td className="wky-copy-productcell">
                              <div className="wky-copy-product">
                                <span className="ui-thumb">
                                  {productImage(row.product, 80) ? <img src={productImage(row.product, 80)} alt="" loading="lazy" /> : <Package aria-hidden="true" />}
                                </span>
                                <span>
                                  <strong>{name}</strong>
                                  {(row.blocked || row.flags.length > 0 || row.notes.length > 0) && (
                                    <span className="wky-copy-tags">
                                      {row.blocked && <span className="ui-badge ui-badge--danger">{row.blocked}</span>}
                                      {row.flags.map((flag) => <span key={flag} className="ui-badge ui-badge--warn">{flag}</span>)}
                                      {row.notes.map((note) => <span key={note} className="ui-badge ui-badge--info">{note}</span>)}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="wky-copy-num" data-label="Liste fiyatı">{row.list ? money(row.list) : "—"}</td>
                            <td className="wky-copy-num" data-label="Önceki fırsat">
                              {money(row.wp.weeklyPrice)}{row.prevPct > 0 ? <small> · %{row.prevPct}</small> : null}
                            </td>
                            <td className="wky-copy-num wky-copy-new" data-label="Yeni fırsat">
                              {row.next ? <><strong>{money(row.next.price)}</strong><small> · %{row.next.percent}</small></> : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {rows.some((row) => !row.blocked && row.flags.length) && (
                <p className="ui-hint">Gizli ya da stokta olmayan ürünler varsayılan olarak atlanır; isterseniz işaretleyin.</p>
              )}
            </div>
            <div className="ui-modal-footer wky-copy-foot">
              <span className="wky-copy-count">{checkedRows.length} / {rows.length} fırsat seçili</span>
              <button type="button" className="ui-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
              <button type="button" className="ui-btn ui-btn--primary" onClick={submit} disabled={!canSubmit}>
                {busy ? <span className="ui-loader" /> : <CopyPlus />}{submitLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Tek fırsat satırı ─────────────────────────────────────────────────────
const DealRow = ({
  wp, state, now, position, cursor, selected, perfItem, canReorder, busy, dragProvided, snapshot,
  onHover, onSelect, onEdit, onToggle, onRemove, onRefreshPrice, onAcknowledge,
}) => {
  const product = wp.product;
  const img = productImage(product);
  const planned = isPlannedState(state);
  const chip = statusChip(wp, state, now);
  const detail = statusDetail(wp, state, now);
  const stale = state !== "expired" ? staleInfo(wp) : null;
  const pct = Number(wp.discountPercentage) || 0;
  const name = product?.name || "Ürün";
  return (
    <div
      ref={dragProvided.innerRef}
      {...dragProvided.draggableProps}
      className="wky-row"
      data-state={state}
      data-cursor={cursor}
      data-dragging={snapshot.isDragging}
      data-selected={selected}
      data-wky-row={wp._id}
      onMouseEnter={onHover}
    >
      <label className="wky-check" title="Kopyalamak için seç">
        <input type="checkbox" className="ui-checkbox" checked={selected} onChange={onSelect} aria-label={`${name} seç`} />
      </label>
      <span
        className="wky-handle"
        {...dragProvided.dragHandleProps}
        aria-disabled={!canReorder}
        aria-label={`${name} sırasını değiştir`}
        title={canReorder ? "Sürükleyerek sırala" : "Sıralamak için Güncel görünümde aramayı temizleyin"}
      >
        <GripVertical />
      </span>
      <div className="ui-thumb wky-thumb">
        {img ? <img src={img} alt="" loading="lazy" /> : <Package aria-hidden="true" />}
        {position ? <span className="wky-order" aria-label={`Rafta ${position}. sırada`}>{position}</span> : null}
      </div>
      <div className="wky-main-cell">
        <span className="wky-name">
          {product ? (
            <button type="button" onClick={onEdit} title="Düzenle">{product.name}</button>
          ) : (
            <span className="ui-badge ui-badge--danger"><AlertTriangle />Ürün silinmiş</span>
          )}
        </span>
        <span className="wky-prices">
          {product?.price > 0 && (
            <>
              <span className="wky-price-old">{money(product.price)}</span>
              <ArrowRight className="wky-price-arrow" aria-hidden="true" />
            </>
          )}
          <span className="wky-price-new">{money(wp.weeklyPrice)}</span>
          {pct > 0 && <span className="wky-pct"><Tag />%{pct}</span>}
          {product?.price > wp.weeklyPrice && <span className="wky-saving">{money(product.price - wp.weeklyPrice)} tasarruf</span>}
          {product?.price > 0 && toKurus(wp.weeklyPrice) >= toKurus(product.price) && <span className="ui-badge ui-badge--warn"><AlertTriangle />Mağaza fiyatından düşük değil</span>}
          {product?.isOutOfStock && <span className="ui-badge ui-badge--warn">Stokta yok</span>}
          {product?.isHidden && <span className="ui-badge">Gizli ürün</span>}
        </span>
        {perfItem && (
          <span
            className="wky-perf"
            title={`${perfItem.from ? formatDateTime(perfItem.from) : "Başlangıç"} – ${perfItem.to ? formatDateTime(perfItem.to) : "şimdi"} arası siparişler${Number(perfItem.inferredLines) > 0 ? ". Bazı eski siparişlerde fiyat kaynağı kayıtlı olmadığından tahmin edildi." : ""}`}
          >
            <TrendingUp aria-hidden="true" />
            {perfText(perfItem, state)}
            {Number(perfItem.inferredLines) > 0 && Number(perfItem.units) > 0 && <em>tahmini</em>}
          </span>
        )}
        {stale && (
          <div className="wky-stale" role="note">
            <AlertTriangle aria-hidden="true" />
            <span className="wky-stale-text">{stale.text}</span>
            <span className="wky-stale-actions">
              <button type="button" className="ui-btn ui-btn--sm" onClick={onRefreshPrice} disabled={busy}>
                {busy ? <span className="ui-loader" /> : null}Fırsat fiyatını güncelle
              </button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onAcknowledge} disabled={busy}>Böyle kalsın</button>
            </span>
          </div>
        )}
      </div>
      <div className="wky-time" data-tone={detail.tone}>
        <span className={`ui-badge ${chip.cls}`}><chip.icon aria-hidden="true" />{chip.label}</span>
        <span className="wky-time-sub">{detail.text}</span>
      </div>
      {planned ? (
        <span className="wky-switch wky-switch-gap" aria-hidden="true" />
      ) : (
        <button
          type="button"
          className="ui-icon-btn ui-switch wky-switch"
          data-on={wp.isActive}
          role="switch"
          aria-checked={wp.isActive}
          aria-label={wp.isActive ? `${name} yayından kaldır` : `${name} yayına al`}
          title={wp.isActive ? "Yayından kaldır" : "Yayına al"}
          onClick={onToggle}
          disabled={busy}
        >
          {wp.isActive ? <ToggleRight /> : <ToggleLeft />}
        </button>
      )}
      <div className="wky-actions">
        <button type="button" className="ui-icon-btn" onClick={onEdit} aria-label={`${name} düzenle`} title="Düzenle (↵)"><Pencil /></button>
        <button
          type="button"
          className="ui-icon-btn ui-icon-btn--danger"
          onClick={onRemove}
          aria-label={planned ? `${name} planını iptal et` : `${name} raftan kaldır`}
          title={planned ? "Planı iptal et" : "Raftan kaldır"}
        >
          <Trash2 />
        </button>
      </div>
    </div>
  );
};

// ── Ekran ────────────────────────────────────────────────────────────────
const WeeklyProductsTab = () => {
  const { confirm } = useConfirm();
  // Durumlar sunucu saatine göre: bilgisayarın saati yanlışsa "Planlı" fırsat erken "Yayında" görünmesin
  const [clockSkew, setClockSkew] = useState(0);
  const now = useNow(30000) + clockSkew;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("current");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [drawer, setDrawer] = useState(null);
  const [copy, setCopy] = useState(null); // { ids: string[] | null }
  const [ghost, setGhost] = useState(null);
  const [previewOpen, setPreviewOpen] = usePref("wky-preview-open", true);
  const [reordering, setReordering] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [perf, setPerf] = useState({ items: {}, failed: false });
  const [perfNonce, setPerfNonce] = useState(0);
  const perfTick = useNow(5 * 60 * 1000);
  const searchRef = useRef(null);
  const pendingRemoval = useRef(new Set());
  const loadSeq = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const seq = ++loadSeq.current;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const response = await axios.get("/weekly-products/all");
      if (seq !== loadSeq.current) return;
      const serverTime = Date.parse(response.data?.serverTime);
      if (Number.isFinite(serverTime)) setClockSkew(serverTime - Date.now());
      setItems((response.data?.weeklyProducts || []).filter((wp) => !pendingRemoval.current.has(wp._id)));
      setError(null);
    } catch (e) {
      if (seq === loadSeq.current && !quiet) setError(e.response?.data?.message || "Haftalık fırsatlar yüklenemedi");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Başka bir cihazdan ya da mobil uygulama tarafından yapılan değişiklikler
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return undefined;
    let timer = null;
    const onUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load({ quiet: true }), 500);
    };
    socket.on("weeklyProductsUpdated", onUpdate);
    return () => {
      clearTimeout(timer);
      socket.off("weeklyProductsUpdated", onUpdate);
    };
  }, [load]);

  // Planlı fırsat başlayınca (sunucu dakikalık işle açar) liste kendiliğinden yenilenir
  useEffect(() => {
    let next = Infinity;
    for (const wp of items) {
      if (!wp.scheduled) continue;
      const start = msOf(wp.startDate);
      if (!Number.isFinite(start)) continue;
      const target = start + 65 * 1000;
      if (target > now) next = Math.min(next, target);
      else if (now - start < STUCK_AFTER) next = Math.min(next, now + 30 * 1000);
    }
    if (!Number.isFinite(next) || next - now > DAY) return undefined;
    const timer = setTimeout(() => load({ quiet: true }), Math.max(1000, next - now));
    return () => clearTimeout(timer);
  }, [items, now, load]);

  // ── Türetilen veriler ──
  const stats = useMemo(() => {
    const s = { live: 0, planned: 0, paused: 0, ending: 0, expired: 0, current: 0, pctSum: 0, nextStart: null };
    for (const wp of items) {
      const state = statusOf(wp, now);
      if (state === "live") {
        s.live += 1;
        s.pctSum += Number(wp.discountPercentage) || 0;
        if (endsSoon(wp, now)) s.ending += 1;
      } else if (isPlannedState(state)) {
        s.planned += 1;
        const start = msOf(wp.startDate);
        if (Number.isFinite(start) && start > now && (s.nextStart === null || start < s.nextStart)) s.nextStart = start;
      } else if (state === "paused") s.paused += 1;
      else s.expired += 1;
      if (state !== "expired") s.current += 1;
    }
    return { ...s, avg: s.live ? Math.round(s.pctSum / s.live) : 0 };
  }, [items, now]);
  const counts = { current: stats.current, live: stats.live, planned: stats.planned, ending: stats.ending, paused: stats.paused, expired: stats.expired };

  const rows = useMemo(() => {
    const q = fold(query.trim());
    const list = items.filter((wp) => {
      const state = statusOf(wp, now);
      if (filter === "current" && state === "expired") return false;
      if (filter === "live" && state !== "live") return false;
      if (filter === "planned" && !isPlannedState(state)) return false;
      if (filter === "paused" && state !== "paused") return false;
      if (filter === "expired" && state !== "expired") return false;
      if (filter === "ending" && !(state === "live" && endsSoon(wp, now))) return false;
      if (q && !fold(wp.product?.name || "Ürün silinmiş").includes(q)) return false;
      return true;
    });
    const shelf = byShelfOrder(now);
    if (filter === "planned") return list.sort((a, b) => (msOf(a.startDate) || 0) - (msOf(b.startDate) || 0) || shelf(a, b));
    if (filter === "expired") return list.sort((a, b) => (msOf(b.endDate) || 0) - (msOf(a.endDate) || 0) || shelf(a, b));
    return list.sort(shelf);
  }, [items, filter, query, now]);
  const live = useMemo(() => items.filter((wp) => statusOf(wp, now) === "live" && wp.product).sort(byShelfOrder(now)), [items, now]);
  const livePosition = useMemo(() => new Map(live.map((wp, i) => [wp._id, i + 1])), [live]);
  const canReorder = filter === "current" && !query.trim() && rows.length > 1 && !reordering;
  const filtered = filter !== "current" || Boolean(query.trim());

  // Bu haftanın fırsatları (KPI) ve satış rakamı istenecek fırsatlar: tek istek, en fazla 100
  const weekStart = thisMondayStart(now);
  const weekDeals = useMemo(
    () => items.filter((wp) => !isPlannedState(statusOf(wp, now)) && wasLiveDuring(wp, weekStart, now + 1)),
    [items, now, weekStart],
  );
  const perfKey = useMemo(() => {
    const ids = [];
    const seen = new Set();
    const add = (wp) => {
      if (ids.length >= PERF_MAX_IDS || !wp?._id || seen.has(wp._id) || isPlannedState(statusOf(wp, now))) return;
      seen.add(wp._id);
      ids.push(wp._id);
    };
    weekDeals.forEach(add);
    rows.forEach(add);
    return ids.sort().join(",");
  }, [weekDeals, rows, now]);
  useEffect(() => {
    if (!perfKey || perf.failed) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await axios.get("/campaigns/performance", { params: { type: "weekly", ids: perfKey } });
        if (cancelled) return;
        const data = response.data;
        if (!data || data.success === false || !data.items || typeof data.items !== "object") {
          setPerf((cur) => ({ ...cur, failed: true }));
          return;
        }
        setPerf((cur) => ({ items: { ...cur.items, ...data.items }, failed: false }));
      } catch {
        // Uç nokta yoksa ya da hata verirse rakamlar sessizce gizlenir
        if (!cancelled) setPerf((cur) => ({ ...cur, failed: true }));
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [perfKey, perf.failed, perfTick, perfNonce]);
  const perfOf = (wp) => {
    if (perf.failed || isPlannedState(statusOf(wp, now))) return null;
    const item = perf.items[wp._id];
    return validPerf(item) ? item : null;
  };
  const weekPerf = useMemo(() => {
    if (perf.failed) return null;
    let revenue = 0;
    let units = 0;
    let known = 0;
    let inferred = false;
    for (const wp of weekDeals) {
      const item = perf.items[wp._id];
      if (!validPerf(item)) continue;
      known += 1;
      revenue += Number(item.revenue) || 0;
      units += Number(item.units) || 0;
      if (Number(item.inferredLines) > 0) inferred = true;
    }
    return known ? { revenue, units, inferred, deals: known } : null;
  }, [perf, weekDeals]);

  // Seçim yalnızca görünen satırlarda kalır (görmediğiniz fırsat kopyalanmaz)
  useEffect(() => {
    setSelected((cur) => {
      if (!cur.size) return cur;
      const visible = new Set(rows.map((wp) => wp._id));
      const next = new Set([...cur].filter((id) => visible.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [rows]);
  const toggleSelect = useCallback((id) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const allSelected = rows.length > 0 && rows.every((wp) => selected.has(wp._id));
  const someSelected = rows.some((wp) => selected.has(wp._id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((wp) => wp._id)));

  useEffect(() => { setCursor(-1); }, [filter, query]);
  useEffect(() => {
    if (cursor < 0) return;
    const id = rows[cursor]?._id;
    if (id) document.querySelector(`[data-wky-row="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, rows]);

  // ── İşlemler ──
  const openEdit = (wp) => setDrawer({ mode: "edit", item: wp });
  const openAdd = () => setDrawer({ mode: "add" });
  const openCopy = (ids = null) => setCopy({ ids });
  const resetFilters = () => { setFilter("current"); setQuery(""); };

  const mergeSaved = (saved) => {
    if (!saved?._id) return;
    setItems((cur) => (cur.some((x) => x._id === saved._id)
      ? cur.map((x) => (x._id === saved._id ? { ...x, ...saved, product: saved.product || x.product } : x))
      : [...cur, saved]));
  };
  const setBusy = (id, on) => setBusyIds((cur) => {
    const next = new Set(cur);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  const toggle = async (wp) => {
    if (busyIds.has(wp._id)) return;
    const nextActive = !wp.isActive;
    setBusy(wp._id, true);
    setItems((cur) => cur.map((x) => (x._id === wp._id ? { ...x, isActive: nextActive } : x)));
    try {
      const response = await axios.patch(`/weekly-products/${wp._id}/toggle`);
      mergeSaved(response.data?.weeklyProduct);
      toast.success(nextActive ? "Yayına alındı" : "Durduruldu");
    } catch (e) {
      setItems((cur) => cur.map((x) => (x._id === wp._id ? { ...x, isActive: wp.isActive } : x)));
      toast.error(e.response?.data?.message || "Durum değiştirilemedi");
    } finally {
      setBusy(wp._id, false);
    }
  };

  const quickUpdate = async (wp, payload, success) => {
    if (busyIds.has(wp._id)) return;
    setBusy(wp._id, true);
    try {
      const response = await axios.put(`/weekly-products/${wp._id}`, payload);
      mergeSaved(response.data?.weeklyProduct);
      toast.success(success);
    } catch (e) {
      toast.error(e.response?.data?.message || "Kaydedilemedi");
      load({ quiet: true });
    } finally {
      setBusy(wp._id, false);
    }
  };
  const acknowledgePrice = (wp) => quickUpdate(wp, { acknowledgeListPrice: true }, "Uyarı kaldırıldı; fırsat fiyatı aynı kaldı");
  const refreshPrice = async (wp) => {
    const list = positive(wp.product?.price);
    const next = list ? carryOver(wp, list, "none") : null;
    if (!next) {
      toast.error("Yeni fırsat fiyatı hesaplanamadı. Fiyatı düzenleyerek girin.");
      openEdit(wp);
      return;
    }
    if (toKurus(next.price) === toKurus(wp.weeklyPrice)) {
      acknowledgePrice(wp);
      return;
    }
    const ok = await confirm({
      title: "Fırsat fiyatı güncellensin mi?",
      message: `${wp.product.name}: ${money(wp.weeklyPrice)} → ${money(next.price)}. Yeni liste fiyatı ${money(list)}; %${next.percent} indirim korunur.`,
      confirmText: "Fiyatı güncelle",
      cancelText: "Vazgeç",
      type: "info",
    });
    if (ok) quickUpdate(wp, { weeklyPrice: next.price }, "Fırsat fiyatı güncellendi");
  };

  const remove = (wp) => {
    const index = items.findIndex((x) => x._id === wp._id);
    const planned = wp.scheduled === true;
    pendingRemoval.current.add(wp._id);
    setItems((cur) => cur.filter((x) => x._id !== wp._id));
    setSelected((cur) => {
      if (!cur.has(wp._id)) return cur;
      const next = new Set(cur);
      next.delete(wp._id);
      return next;
    });
    if (drawer?.item?._id === wp._id) setDrawer(null);
    undoable({
      message: planned ? `${wp.product?.name || "Ürün"} planı iptal edildi` : `${wp.product?.name || "Ürün"} raftan kaldırıldı`,
      icon: <Trash2 />,
      commit: async () => {
        try {
          await axios.delete(`/weekly-products/${wp._id}`);
        } catch (e) {
          toast.error(e.response?.data?.message || "Kaldırılamadı, liste yenilendi");
          pendingRemoval.current.delete(wp._id);
          load({ quiet: true });
        } finally {
          pendingRemoval.current.delete(wp._id);
        }
      },
      undo: () => {
        pendingRemoval.current.delete(wp._id);
        setItems((cur) => {
          if (cur.some((x) => x._id === wp._id)) return cur;
          const next = [...cur];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, wp);
          return next;
        });
      },
    });
  };

  // Sürükle-bırak: görünen (güncel) satırlar 0..n-1 sırasına yeniden numaralanır; biten fırsatların sırası önemsizdir
  const onDragEnd = async (result) => {
    if (!canReorder || !result.destination || result.destination.index === result.source.index) return;
    const next = [...rows];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    const newOrder = new Map(next.map((wp, i) => [wp._id, i]));
    const changed = next.filter((wp) => (Number(wp.order) || 0) !== newOrder.get(wp._id));
    setItems((cur) => cur.map((wp) => (newOrder.has(wp._id) ? { ...wp, order: newOrder.get(wp._id) } : wp)));
    if (!changed.length) return;
    setReordering(true);
    try {
      await Promise.all(changed.map((wp) => axios.put(`/weekly-products/${wp._id}`, { order: newOrder.get(wp._id) })));
      toast.success("Sıra kaydedildi");
    } catch (e) {
      toast.error(e.response?.data?.message || "Sıra kaydedilemedi");
      load({ quiet: true });
    } finally {
      setReordering(false);
    }
  };

  const onSaved = (mode, saved) => {
    setDrawer(null);
    mergeSaved(saved);
    if (mode === "plan") {
      const start = msOf(saved?.startDate);
      toast.success(Number.isFinite(start) ? `Fırsat planlandı · ${atLabel(start, now)} başlar` : "Fırsat planlandı");
    } else {
      toast.success(mode === "add" ? "Fırsat rafa eklendi" : "Fırsat güncellendi");
    }
    load({ quiet: true });
  };

  const onCopied = (created, { immediate }) => {
    for (const deal of created) mergeSaved(deal);
    setSelected(new Set());
    if (created.length) {
      setFilter(immediate ? "live" : "planned");
      setQuery("");
    }
    load({ quiet: true });
  };

  const refresh = () => {
    setPerf((cur) => ({ ...cur, failed: false }));
    setPerfNonce((n) => n + 1);
    load({ quiet: true });
  };

  const { helpOpen, setHelpOpen } = useListShortcuts({
    search: () => searchRef.current?.focus(),
    move: (d) => setCursor((c) => (rows.length ? Math.min(rows.length - 1, Math.max(0, c + d)) : -1)),
    open: () => { if (rows[cursor]) openEdit(rows[cursor]); },
    escape: () => {
      if (cursor >= 0) setCursor(-1);
      else if (selected.size) setSelected(new Set());
      else if (filtered) resetFilters();
    },
    searchEscape: () => { setQuery(""); searchRef.current?.blur(); },
    extra: {
      n: openAdd,
      x: () => { if (rows[cursor]) toggleSelect(rows[cursor]._id); },
    },
  }, { enabled: !copy });

  const previewHead = (
    <div className="wky-preview-head">
      <div>
        <h2><Smartphone />Müşteri görünümü</h2>
        <p>{live.length ? `${live.length} ürün rafta` : "Raf boş"} · canlı</p>
      </div>
      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setPreviewOpen((v) => !v)} aria-expanded={previewOpen}>
        {previewOpen ? "Gizle" : "Göster"}
      </button>
    </div>
  );

  // ── Yükleniyor ──
  if (loading) {
    return (
      <div className="ui-page">
        <PageHeader title="Haftalık fırsatlar" description="Ana sayfadaki fırsat rafını yönetin." />
        <SkeletonCards count={4} />
        <div className="wky-layout">
          <div className="wky-main">
            <Skeleton height={54} radius={10} />
            <div className="ui-panel"><SkeletonRows rows={5} height={72} /></div>
          </div>
          <aside className="wky-side"><div className="ui-panel ui-panel-body"><Skeleton height={420} radius={26} /></div></aside>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Haftalık fırsatlar"
        meta={stats.live ? `${stats.live} yayında` : undefined}
        description="Ana sayfadaki fırsat rafını yönetin: fırsatları önceden planlayın, geçen haftayı tek tıkla kopyalayın, sırayı sürükleyerek değiştirin."
        actions={(
          <>
            <button type="button" className="ui-icon-btn" onClick={refresh} aria-label="Yenile" title="Yenile"><RefreshCw /></button>
            <button type="button" className="ui-btn" onClick={() => openCopy(null)} title="Geçen haftanın ya da yayındaki fırsatları yeni haftaya kopyalayın">
              <CopyPlus />Geçen haftayı kopyala
            </button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={openAdd}><Plus />Fırsat ekle</button>
          </>
        )}
      />

      {error && (
        <div className="ui-banner ui-banner--danger" role="alert">
          <AlertTriangle />
          <span className="ui-grow">{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => load()}>Tekrar dene</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard icon={Zap} label="Yayında" value={stats.live} tone="ok" note="müşteri rafında" active={filter === "live"} onClick={() => setFilter(filter === "live" ? "current" : "live")} />
        <KpiCard
          icon={CalendarClock}
          label="Planlı"
          value={stats.planned}
          tone={stats.planned ? "info" : undefined}
          note={stats.nextStart ? `ilki ${whenShort(stats.nextStart, now)}` : "henüz plan yok"}
          active={filter === "planned"}
          onClick={() => setFilter(filter === "planned" ? "current" : "planned")}
        />
        <KpiCard icon={Hourglass} label="Bitmek üzere" value={stats.ending} tone={stats.ending ? "warn" : undefined} note="7 gün içinde biter" active={filter === "ending"} onClick={() => setFilter(filter === "ending" ? "current" : "ending")} />
        <KpiCard icon={ToggleLeft} label="Durduruldu" value={stats.paused} note="kayıt duruyor" active={filter === "paused"} onClick={() => setFilter(filter === "paused" ? "current" : "paused")} />
        <KpiCard icon={Percent} label="Ortalama indirim" value={`%${stats.avg}`} tone="brand" note="yayındakilerde" />
        {weekPerf && (
          <KpiCard
            icon={TrendingUp}
            label="Bu haftaki fırsat cirosu"
            value={wholeMoney(weekPerf.revenue)}
            tone="ok"
            note={`${weekPerf.units.toLocaleString("tr-TR")} adet · ${weekPerf.deals} fırsat${weekPerf.inferred ? " · tahmini" : ""}`}
          />
        )}
      </KpiGrid>

      <div className="wky-layout">
        <div className="wky-main">
          {items.length === 0 && error ? null : items.length === 0 ? (
            <section className="ui-panel">
              <EmptyState
                icon={Sparkles}
                title="Henüz fırsat yok"
                description="İlk ürünü ekleyin; indirimli fiyat ana sayfadaki rafta hemen görünsün ya da Pazartesi'ye planlayın."
                action={<button type="button" className="ui-btn ui-btn--primary" onClick={openAdd}><Plus />İlk fırsatı ekle</button>}
              />
            </section>
          ) : (
            <>
              <div className="wky-toolbar">
                <div className="ui-search">
                  <Search aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    className="ui-field"
                    placeholder="Fırsatlarda ara…"
                    aria-label="Fırsatlarda ara"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-esc-clear="1"
                  />
                </div>
                <div className="ui-chips" role="group" aria-label="Durum filtresi">
                  {FILTERS.filter((f) => f.id !== "expired" || counts.expired > 0 || filter === "expired").map((f) => (
                    <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                      {f.dot && <span className={`ui-dot ui-dot--${f.dot}`} />}
                      {f.label}
                      <span className="ui-count">{counts[f.id]}</span>
                    </button>
                  ))}
                </div>
                {filtered && (
                  <div className="wky-toolbar-right">
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={resetFilters}>Filtreleri temizle</button>
                  </div>
                )}
              </div>

              {selected.size > 0 && (
                <div className="ui-bulkbar wky-bulkbar" role="region" aria-label="Toplu işlem">
                  <span className="ui-bulkbar-count"><ListChecks aria-hidden="true" />{selected.size} fırsat seçili</span>
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => openCopy([...selected])}>
                    <CopyPlus />Seçilenleri yeni haftaya kopyala
                  </button>
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
                </div>
              )}

              <section className="ui-panel" aria-label="Fırsat listesi">
                {rows.length > 0 && (
                  <div className="wky-listhead">
                    <label className="wky-check" title="Görünen fırsatların tümünü seç">
                      <input
                        type="checkbox"
                        className="ui-checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={toggleAll}
                        aria-label="Görünen fırsatların tümünü seç"
                      />
                    </label>
                    <span>{someSelected ? `${selected.size} / ${rows.length} seçili` : "Tümünü seç"}</span>
                    {filtered && rows.length > 1 && (
                      <span className="wky-listhead-note"><GripVertical aria-hidden="true" />Sıralamak için Güncel görünüme dönüp aramayı temizleyin.</span>
                    )}
                  </div>
                )}
                {rows.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Search}
                    title="Sonuç yok"
                    description={query ? `"${query}" ile eşleşen fırsat yok.` : EMPTY_TEXT[filter]}
                    action={filter === "planned" && !query ? (
                      <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => openCopy(null)}><CopyPlus />Geçen haftayı kopyala</button>
                    ) : filtered ? (
                      <button type="button" className="ui-btn ui-btn--sm" onClick={resetFilters}>Filtreleri temizle</button>
                    ) : null}
                  />
                ) : (
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="wky-list">
                      {(dropProvided) => (
                        <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="wky-list">
                          {rows.map((wp, i) => (
                            <Draggable key={wp._id} draggableId={wp._id} index={i} isDragDisabled={!canReorder}>
                              {(dragProvided, snapshot) => (
                                <DealRow
                                  wp={wp}
                                  state={statusOf(wp, now)}
                                  now={now}
                                  position={livePosition.get(wp._id)}
                                  cursor={cursor === i}
                                  selected={selected.has(wp._id)}
                                  perfItem={perfOf(wp)}
                                  canReorder={canReorder}
                                  busy={busyIds.has(wp._id)}
                                  dragProvided={dragProvided}
                                  snapshot={snapshot}
                                  onHover={() => setCursor(i)}
                                  onSelect={() => toggleSelect(wp._id)}
                                  onEdit={() => openEdit(wp)}
                                  onToggle={() => toggle(wp)}
                                  onRemove={() => remove(wp)}
                                  onRefreshPrice={() => refreshPrice(wp)}
                                  onAcknowledge={() => acknowledgePrice(wp)}
                                />
                              )}
                            </Draggable>
                          ))}
                          {dropProvided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
                <div className="wky-foot">
                  <p>{rows.length === items.length ? `${items.length} fırsat` : `${rows.length} / ${items.length} fırsat`}{reordering ? " · sıra kaydediliyor…" : canReorder ? " · tutamacı sürükleyerek sıralayın" : ""}</p>
                  <p className="wky-foot-hint">İpucu: <kbd>/</kbd> ara · <kbd>j</kbd> <kbd>k</kbd> gez · <kbd>x</kbd> seç · <kbd>↵</kbd> düzenle · <kbd>n</kbd> yeni · <kbd>?</kbd> yardım</p>
                </div>
              </section>
            </>
          )}
        </div>

        <aside className="wky-side" data-collapsed={!previewOpen}>
          <div className="ui-panel ui-panel-body">
            {previewHead}
            {previewOpen && (
              <>
                <PhonePreview live={live} ghost={ghost} now={now} />
                <p className="wky-preview-note"><span className="ui-dot ui-dot--ok" />Yayındaki ürünler sırayla, temsili görünüm</p>
              </>
            )}
          </div>
        </aside>
      </div>

      {drawer && (
        <WeeklyForm
          key={drawer.item?._id || "new"}
          mode={drawer.mode}
          item={drawer.item}
          items={items}
          now={now}
          onClose={() => setDrawer(null)}
          onSaved={onSaved}
          onGhost={setGhost}
        />
      )}
      {copy && (
        <CopyDialog
          items={items}
          ids={copy.ids}
          now={now}
          onClose={() => setCopy(null)}
          onDone={onCopied}
        />
      )}
      <ShortcutHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        items={[[["n"], "Yeni fırsat ekle"], [["x"], "Satırı seç (yeni haftaya kopyalamak için)"]]}
      />
    </div>
  );
};

export default WeeklyProductsTab;
