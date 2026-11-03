// "Yayına hazırlık" listesi ve "Pilot karnesi": GET /delivery/admin/readiness yanıtını tek biçime getirir,
// sayıları biçimlendirir ve "Düzelt" bağlantısının gideceği yeri (ekrandaki kart ya da başka sekme) açar.
/* global Intl */
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { HANDOFF, setHandoff, writePref } from "../admin/ui";

export const READINESS_API = "/delivery/admin/readiness";

/** Madde durumları: ok (yeşil), warn (sarı), block (kırmızı, herkese açmayı engeller) */
export const CHECK_STATUS = {
  ok: { label: "Hazır", icon: CheckCircle2 },
  warn: { label: "Uyarı", icon: AlertTriangle },
  block: { label: "Engel", icon: XCircle },
};
const STATUSES = Object.keys(CHECK_STATUS);
const MODES = ["off", "pilot", "public"];

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));
const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0);
const numOrNull = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
const dateOrNull = (value) => (value && !Number.isNaN(new Date(value).getTime()) ? value : null);

const normalizeFix = (fix) => (fix && typeof fix === "object" ? {
  target: text(fix.target),
  focus: text(fix.focus),
  tab: text(fix.tab),
  section: text(fix.section),
  hint: text(fix.hint),
} : null);

/** Pilot karnesi (sunucu: summarizePilotReport); eksik alanlar güvenli varsayılana düşer */
export const normalizePilot = (p = {}) => ({
  startedAt: dateOrNull(p.startedAt),
  startedAtSource: p.startedAtSource === "settings" || p.startedAtSource === "firstOrder" ? p.startedAtSource : null,
  lastOrderAt: dateOrNull(p.lastOrderAt),
  orders: count(p.orders),
  delivered: count(p.delivered),
  cancelled: count(p.cancelled),
  active: count(p.active),
  customers: count(p.customers),
  failed: {
    total: count(p.failed?.total),
    byReason: list(p.failed?.byReason)
      .map((row) => ({ code: text(row?.code), label: text(row?.label) || "Diğer", count: count(row?.count) }))
      .filter((row) => row.count),
  },
  callbacks: { needed: count(p.callbacks?.needed), pending: count(p.callbacks?.pending), confirmed: count(p.callbacks?.confirmed) },
  areaUnverified: count(p.areaUnverified),
  revenue: numOrNull(p.revenue) ?? 0,
  averageBasket: numOrNull(p.averageBasket),
  deliveryFeeRevenue: numOrNull(p.deliveryFeeRevenue) ?? 0,
  deliveryMinutes: {
    median: numOrNull(p.deliveryMinutes?.median),
    p90: numOrNull(p.deliveryMinutes?.p90),
    count: count(p.deliveryMinutes?.count),
    capped: p.deliveryMinutes?.capped === true,
  },
  onTime: {
    measured: count(p.onTime?.measured),
    within: count(p.onTime?.within),
    rate: numOrNull(p.onTime?.rate),
    target: numOrNull(p.onTime?.target) ?? 90,
  },
  addressNotFound: {
    count: count(p.addressNotFound?.count),
    attempts: count(p.addressNotFound?.attempts),
    rate: numOrNull(p.addressNotFound?.rate),
    target: numOrNull(p.addressNotFound?.target) ?? 3,
  },
  feedback: {
    responses: count(p.feedback?.responses),
    rated: count(p.feedback?.rated),
    averageRating: numOrNull(p.feedback?.averageRating),
    deliveryRated: count(p.feedback?.deliveryRated),
    averageDeliveryRating: numOrNull(p.feedback?.averageDeliveryRating),
    low: count(p.feedback?.low),
    // Bu puan ve altı düşük sayılır (sunucu: LOW_RATING); eski yanıtta yoksa 3
    lowThreshold: count(p.feedback?.lowThreshold) || 3,
  },
  neighborhoods: list(p.neighborhoods)
    .map((row) => ({ name: text(row?.name), orders: count(row?.orders), delivered: count(row?.delivered), cancelled: count(row?.cancelled) }))
    .filter((row) => row.name && row.orders),
  neighborhoodCount: count(p.neighborhoodCount),
  zones: list(p.zones)
    .map((row) => ({ id: text(row?.id), name: text(row?.name) || text(row?.id), orders: count(row?.orders) }))
    .filter((row) => row.id && row.orders),
  problems: list(p.problems)
    .map((row) => ({
      orderId: text(row?.orderId),
      code: text(row?.code) || `#${text(row?.orderId).slice(-6).toUpperCase()}`,
      kind: row?.kind === "failed" ? "failed" : "cancelled",
      reason: text(row?.reason) || "İptal edildi",
      note: text(row?.note),
      neighborhood: text(row?.neighborhood),
      zoneName: text(row?.zoneName),
      at: dateOrNull(row?.at) || dateOrNull(row?.createdAt),
    }))
    .filter((row) => /^[0-9a-f]{24}$/i.test(row.orderId)),
  users: list(p.users)
    .map((row) => ({ userId: text(row?.userId), orders: count(row?.orders), delivered: count(row?.delivered), failed: count(row?.failed), lastAt: dateOrNull(row?.lastAt) }))
    .filter((row) => row.userId),
});

/** Sunucu yanıtı → { mode, ready, checks, counts, pilot, pilotError, generatedAt } */
export const normalizeReadiness = (data = {}) => {
  const checks = list(data?.checks)
    .filter((check) => check && typeof check === "object" && check.id)
    .map((check) => ({
      id: text(check.id),
      status: STATUSES.includes(check.status) ? check.status : "warn",
      title: text(check.title) || text(check.id),
      detail: text(check.detail),
      fix: normalizeFix(check.fix),
    }));
  const counts = { ok: 0, warn: 0, block: 0 };
  for (const check of checks) counts[check.status] += 1;
  return {
    mode: MODES.includes(data?.mode) ? data.mode : "off",
    ready: counts.block === 0,
    checks,
    counts,
    pilot: data?.pilot && typeof data.pilot === "object" ? normalizePilot(data.pilot) : null,
    pilotError: text(data?.pilotError),
    generatedAt: dateOrNull(data?.generatedAt),
  };
};

/** Engelleyici maddeler (herkese açma onayında listelenir) */
export const blockersOf = (readiness) => (readiness?.checks || []).filter((check) => check.status === "block");

// ── Biçimlendirme ──
const NUM = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
export const num1 = (value) => NUM.format(Number(value) || 0);
/** 92.5 → "%92,5"; null → "—" */
export const percentText = (value) => (value === null || value === undefined ? "—" : `%${NUM.format(Number(value))}`);
/** 38 → "38 dk", 75 → "1 sa 15 dk", 120 → "2 sa"; null → "—" */
export const minutesText = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const total = Math.max(0, Math.round(Number(value)));
  if (total < 60) return `${total} dk`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} sa ${minutes} dk` : `${hours} sa`;
};
/** Oran: parça / bütün (%), bütün 0 ise null */
export const shareOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

// ── "Düzelt": ekrandaki kart ya da başka sekme ──

/** Ekrandaki hedefler: kaydırılacak kart ve odaklanacak alan (kimlikler ilgili bileşenlerde) */
const TARGETS = {
  "zone-devrek": {
    card: "dz-devrek-card",
    focus: {
      enabled: ["dz-devrek-enabled"],
      fee: ["dz-devrek-fee", "dz-devrek-feebox"],
      etaText: ["dz-devrek-etaText"],
      callback: ["dz-devrek-callback"],
    },
  },
  // candidates: seçili sınır önerilenden büyükse aday listesindeki ilk (önerilen) sınır
  area: { card: "dz-devrek-area", focus: { default: ["dz-area-fetch"], candidates: ["dz-area-cands", "dz-area-fetch"] } },
  couriers: { card: "dz-couriers", focus: { default: ["dz-courier-add"] } },
  pilot: { card: "dz-pilot", focus: { default: ["dz-pilot-search"] } },
  campaign: { card: "dz-campaign", focus: { default: ["dz-campaign-switch"] } },
};
const FOCUSABLE = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]";
const flashTimers = new WeakMap();

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Kartı kısa süre vurgular (hareket azaltma tercihinde yalnızca çerçeve) */
const flash = (element) => {
  window.clearTimeout(flashTimers.get(element));
  element.removeAttribute("data-dz-flash");
  // Aynı karta arka arkaya basılınca canlandırma yeniden başlasın
  void element.offsetWidth;
  element.setAttribute("data-dz-flash", "");
  flashTimers.set(element, window.setTimeout(() => element.removeAttribute("data-dz-flash"), 1800));
};

/** Kimlik listesindeki ilk odaklanabilir öğe (öğe kapsayıcıysa içindeki ilk düğme/alan) */
const focusableFrom = (ids) => {
  for (const id of ids || []) {
    const element = document.getElementById(id);
    if (!element) continue;
    if (element.matches(FOCUSABLE)) return element;
    const inner = element.querySelector('[aria-pressed="true"]:not(:disabled)') || element.querySelector(FOCUSABLE);
    if (inner) return inner;
  }
  return null;
};

/**
 * Maddenin "Düzelt" bağlantısı: fix.tab varsa o sekmeye geçer (Mağaza ayarlarında ilgili bölüm açılır),
 * yoksa ekrandaki karta kaydırır, ilgili alana odaklanır ve kartı vurgular. Hedef bulunamazsa false döner.
 */
export const runFix = (fix) => {
  if (!fix) return false;
  if (fix.tab) {
    if (fix.tab === "settings" && fix.section) writePref("stg-section", fix.section);
    window.dispatchEvent(new CustomEvent("admin-navigate", { detail: fix.tab }));
    return true;
  }
  const target = TARGETS[fix.target];
  const card = target ? document.getElementById(target.card) : null;
  if (!card) return false;
  card.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  const field = focusableFrom(target.focus[fix.focus] || target.focus.default);
  field?.focus({ preventScroll: true });
  flash(card);
  return true;
};

/** Siparişler ekranında siparişi açar (tam kimlikle doğrudan çekmece) */
export const openOrder = (orderId) => {
  setHandoff(HANDOFF.order, orderId);
  window.dispatchEvent(new CustomEvent("admin-navigate", { detail: "orders" }));
};
/** Siparişler ekranını hazır süzgeçle açar (ör. "callback": teyit bekleyenler) */
export const openOrdersPreset = (preset) => {
  window.dispatchEvent(new CustomEvent("admin-navigate", { detail: { tab: "orders", preset } }));
};
