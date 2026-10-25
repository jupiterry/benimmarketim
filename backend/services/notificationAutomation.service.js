// Otomatik müşteri bildirimleri (mağaza sahibi panelden açar; hepsi varsayılan KAPALI):
//  - secondOrder   İkinci sipariş teşviki: tek siparişi teslim edilmiş, sonra sipariş vermemiş müşteri (ömür boyu 1 kez)
//  - winBack       Geri kazanma: son teslim edilen siparişinin üzerinden N gün geçmiş, o günden beri siparişi yok
//  - couponExpiry  "Kuponunun süresi doluyor": kişiye özel, kullanılmamış ve müşterinin uygulamada kullanabileceği kupon
//                  H saat içinde bitiyor (kupon başına 1 kez)
//  - closedCart    "Açıldık, sepetin hazır": mağaza kapalıyken sepet kuran müşteriye açılıştan kısa süre sonra
//
// Ortak kurallar: yalnızca izin verilen saatlerde (varsayılan 10:00–21:30, İstanbul) gönderilir; bir müşteriye
// 24 saatte en fazla 1 otomatik bildirim; bildirimleri ya da kampanya bildirimlerini kapatan, yönetici olan ve
// bildirim alabilecek bir cihazı görünmeyen müşteri atlanır.
// Her gönderim önce AutomationLog'a "pending" olarak yazılır (benzersiz indeks → aynı bildirim iki kez gitmez),
// sonra kupon (isteğe bağlı) oluşturulur ve bildirim gönderilir. Zamanlayıcı 10 dakikada bir çalışır; aynı anda
// tek sürecin çalışması Redis NX kilidiyle sağlanır. Bu servisteki hiçbir hata çağıranı düşürmez.
import { createHash, randomUUID } from "node:crypto";
import cron from "node-cron";
import AutomationSettings from "../models/automationSettings.model.js";
import AutomationLog from "../models/automationLog.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Coupon from "../models/coupon.model.js";
import Settings from "../models/settings.model.js";
import { redis } from "../lib/redis.js";
import { isPushConfigured, sendPushToUsers } from "./push.service.js";
import { canUserOrderToAddress, isAddressOnlyCoupon } from "./coupon.service.js";

export const TZ = "Europe/Istanbul";
export const AUTOMATION_TYPES = ["secondOrder", "winBack", "couponExpiry", "closedCart"];
// Aynı turda öncelik: süreye bağlı olanlar önce (kupon bitiyor, açılış), sonra teşvikler
const TICK_ORDER = ["couponExpiry", "closedCart", "secondOrder", "winBack"];
export const AUTOMATION_LABELS = {
  secondOrder: "İkinci sipariş teşviki",
  winBack: "Geri kazanma",
  couponExpiry: "Kupon süresi doluyor",
  closedCart: "Açıldık, sepetin hazır",
};
// Bildirime dokununca açılacak ekran (mobil uygulamanın kabul ettiği yollar: services/push.service.js)
const ROUTES = { secondOrder: "/home", winBack: "/home", couponExpiry: "/cart", closedCart: "/cart" };
const COUPON_PREFIX = { secondOrder: "IKINCI", winBack: "DONUS" };

const DELIVERED = "Teslim Edildi";
const CANCELLED = "İptal Edildi";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const ATTRIBUTION_WINDOW_MS = 72 * HOUR;
const CART_REMINDER_GAP_MS = 12 * HOUR; // son 12 saatte sepet hatırlatması gittiyse "Açıldık" gönderilmez
const MIN_COUPON_AGE_MS = 12 * HOUR; // yeni tanımlanmış kupon için hemen "süresi doluyor" denmez
const MAX_PER_TYPE_PER_TICK = 200;
const SEND_CONCURRENCY = 5;
export const TITLE_LIMIT = 60;
export const BODY_LIMIT = 180;
// Sistem kaynaklı hatalar (anahtar, ağ, yapılandırma, sunucu/veritabanı hatası): kayıt silinir, sonraki turda yeniden denenir
const SYSTEM_FAILURES = new Set(["auth", "rejected", "network", "not_configured", "error"]);

// ── Varsayılanlar ─────────────────────────────────────────────────────────
const DEFAULT_COUPON = { enabled: false, type: "percentage", value: 10, validDays: 7, minOrderAmount: 0 };
export const DEFAULT_AUTOMATION_SETTINGS = Object.freeze({
  window: { start: "10:00", end: "21:30" },
  minHoursBetween: 24,
  secondOrder: {
    enabled: false,
    title: "İlk siparişin nasıldı, {ad}? 🛒",
    body: "Eksiklerini sepete ekle, ikinci siparişin birkaç dokunuşla kapında olsun.",
    afterDays: 3,
    maxDays: 14,
    coupon: { ...DEFAULT_COUPON },
  },
  winBack: {
    enabled: false,
    title: "Seni özledik, {ad} 💚",
    body: "Bir süredir uğramıyorsun. Atıştırmalıktan temel ihtiyaçlara kadar aradığın her şey birkaç dokunuşla kapında.",
    afterDays: 21,
    maxDays: 180,
    cooldownDays: 30,
    maxSends: 2,
    coupon: { ...DEFAULT_COUPON },
  },
  couponExpiry: {
    enabled: false,
    title: "Kuponunun süresi doluyor ⏰",
    body: "{kupon} kodlu {indirim} indirim kuponunu kullanmak için son {saat} saat. Sepetine göz at!",
    hoursBefore: 24,
  },
  closedCart: {
    enabled: false,
    title: "Açıldık, sepetin hazır 🛒",
    body: "Sipariş almaya başladık, {ad}! Sepetindeki {adet} ürün seni bekliyor.",
    delayMinutes: 5,
    windowMinutes: 120,
  },
});

// Metinlerde kullanılabilen alanlar
export const PLACEHOLDERS = {
  secondOrder: { ad: "Müşterinin adı", kupon: "Kupon kodu", indirim: "İndirim (%10 / 50 TL)", gun: "Kuponun geçerlilik günü" },
  winBack: { ad: "Müşterinin adı", kupon: "Kupon kodu", indirim: "İndirim (%10 / 50 TL)", gun: "Kuponun geçerlilik günü" },
  couponExpiry: { ad: "Müşterinin adı", kupon: "Kupon kodu", indirim: "Kuponun indirimi", saat: "Kalan saat" },
  closedCart: { ad: "Müşterinin adı", adet: "Sepetteki ürün adedi", urun: "Sepetteki ilk ürünler" },
};
// Yalnızca kupon açıkken anlamlı olan alanlar (secondOrder, winBack)
const COUPON_ONLY = new Set(["kupon", "indirim", "gun"]);

// Sayısal alanların sınırları: [en az, en çok, panel etiketi]
const RANGES = {
  minHoursBetween: [24, 168, "İki otomatik bildirim arası (saat)"],
  "secondOrder.afterDays": [1, 60, "İkinci sipariş · teslimattan kaç gün sonra"],
  "secondOrder.maxDays": [2, 365, "İkinci sipariş · en geç kaç gün sonra"],
  "winBack.afterDays": [7, 365, "Geri kazanma · kaç gündür sipariş yoksa"],
  "winBack.maxDays": [8, 730, "Geri kazanma · en fazla kaç gündür yoksa"],
  "winBack.cooldownDays": [7, 180, "Geri kazanma · iki bildirim arası (gün)"],
  "winBack.maxSends": [1, 5, "Geri kazanma · en fazla bildirim"],
  "couponExpiry.hoursBefore": [2, 72, "Kupon hatırlatma · kaç saat kala"],
  "closedCart.delayMinutes": [0, 120, "Açıldık · açılıştan kaç dakika sonra"],
  "closedCart.windowMinutes": [30, 360, "Açıldık · en geç kaç dakika içinde"],
};
const COUPON_RANGES = {
  percentage: [1, 50],
  fixed: [1, 1000],
  validDays: [1, 60],
  minOrderAmount: [0, 10000],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const getPath = (obj, path) => path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
const clamp = (value, [min, max], fallback, decimals = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const factor = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(n * factor) / factor));
};
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const clockToMinutes = (value) => {
  if (!CLOCK.test(String(value || ""))) return null;
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
};

const normalizeCoupon = (raw) => {
  const src = isPlainObject(raw) ? raw : {};
  const type = src.type === "fixed" ? "fixed" : "percentage";
  return {
    enabled: src.enabled === true,
    type,
    // Yüzde tam sayı; tutar ve alt sipariş tutarı kuruşlu olabilir
    value: clamp(src.value, COUPON_RANGES[type], DEFAULT_COUPON.value, type === "fixed" ? 2 : 0),
    validDays: clamp(src.validDays, COUPON_RANGES.validDays, DEFAULT_COUPON.validDays),
    minOrderAmount: clamp(src.minOrderAmount, COUPON_RANGES.minOrderAmount, DEFAULT_COUPON.minOrderAmount, 2),
  };
};

/** Kayıtlı (ya da hiç olmayan) ayarı varsayılanlarla birleştirir ve sınırlara oturtur. Hata fırlatmaz. */
export const normalizeAutomationSettings = (raw) => {
  const src = isPlainObject(raw) ? raw : {};
  const out = clone(DEFAULT_AUTOMATION_SETTINGS);
  const start = CLOCK.test(src.window?.start || "") ? src.window.start : out.window.start;
  const end = CLOCK.test(src.window?.end || "") ? src.window.end : out.window.end;
  out.window = clockToMinutes(start) < clockToMinutes(end) ? { start, end } : out.window;
  out.minHoursBetween = clamp(src.minHoursBetween, RANGES.minHoursBetween, out.minHoursBetween);
  for (const type of AUTOMATION_TYPES) {
    const stored = isPlainObject(src[type]) ? src[type] : {};
    const target = out[type];
    target.enabled = stored.enabled === true;
    if (typeof stored.title === "string" && stored.title.trim()) target.title = stored.title.trim().slice(0, TITLE_LIMIT);
    if (typeof stored.body === "string" && stored.body.trim()) target.body = stored.body.trim().slice(0, BODY_LIMIT);
    for (const [path, range] of Object.entries(RANGES)) {
      const [owner, key] = path.split(".");
      if (owner === type && key) target[key] = clamp(stored[key], range, target[key]);
    }
    if ("coupon" in target) target.coupon = normalizeCoupon(stored.coupon);
  }
  // Çapraz kurallar: "en geç" her zaman "en erken"den büyük
  if (out.secondOrder.maxDays <= out.secondOrder.afterDays) out.secondOrder.maxDays = Math.min(365, out.secondOrder.afterDays + 1);
  if (out.winBack.maxDays <= out.winBack.afterDays) out.winBack.maxDays = Math.min(730, out.winBack.afterDays + 1);
  return out;
};

const placeholdersIn = (text) => [...String(text || "").matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]);

/**
 * PUT gövdesini mevcut ayarın üzerine birleştirir ve doğrular.
 * @returns {{ error?: string, data?: object, changes?: Array<{label, from, to}> }}
 */
export const validateAutomationSettingsInput = (body, current) => {
  const before = normalizeAutomationSettings(current);
  if (!isPlainObject(body)) return { error: "Geçersiz istek" };
  const merged = clone(before);
  if (body.window !== undefined) {
    if (!isPlainObject(body.window)) return { error: "Gönderim saatleri geçersiz" };
    const start = body.window.start ?? merged.window.start;
    const end = body.window.end ?? merged.window.end;
    if (!CLOCK.test(String(start)) || !CLOCK.test(String(end))) return { error: "Gönderim saatleri SS:DD biçiminde olmalı (örn. 10:00)" };
    if (clockToMinutes(start) >= clockToMinutes(end)) return { error: "Gönderim başlangıç saati bitiş saatinden önce olmalı" };
    merged.window = { start: String(start), end: String(end) };
  }
  if (body.minHoursBetween !== undefined) merged.minHoursBetween = body.minHoursBetween;
  for (const type of AUTOMATION_TYPES) {
    const input = body[type];
    if (input === undefined) continue;
    if (!isPlainObject(input)) return { error: `${AUTOMATION_LABELS[type]}: geçersiz ayar` };
    const target = merged[type];
    if (input.enabled !== undefined) {
      if (typeof input.enabled !== "boolean") return { error: `${AUTOMATION_LABELS[type]}: açık/kapalı değeri geçersiz` };
      target.enabled = input.enabled;
    }
    for (const field of ["title", "body"]) {
      if (input[field] === undefined) continue;
      if (typeof input[field] !== "string") return { error: `${AUTOMATION_LABELS[type]}: ${field === "title" ? "başlık" : "mesaj"} geçersiz` };
      target[field] = input[field].trim();
    }
    for (const [path] of Object.entries(RANGES)) {
      const [owner, key] = path.split(".");
      if (owner === type && key && input[key] !== undefined) target[key] = input[key];
    }
    if ("coupon" in target && input.coupon !== undefined) {
      if (!isPlainObject(input.coupon)) return { error: `${AUTOMATION_LABELS[type]}: kupon ayarı geçersiz` };
      target.coupon = { ...target.coupon, ...input.coupon };
    }
  }

  // Sayılar: tam sayı ve aralıkta olmalı
  for (const [path, [min, max, label]] of Object.entries(RANGES)) {
    const value = Number(getPath(merged, path));
    if (!Number.isInteger(value) || value < min || value > max) return { error: `${label} ${min}–${max} arasında bir tam sayı olmalı` };
    const [owner, key] = path.split(".");
    if (key) merged[owner][key] = value;
    else merged[owner] = value;
  }
  if (merged.secondOrder.maxDays <= merged.secondOrder.afterDays) return { error: "İkinci sipariş: “en geç” gün sayısı “kaç gün sonra”dan büyük olmalı" };
  if (merged.winBack.maxDays <= merged.winBack.afterDays) return { error: "Geri kazanma: “en fazla” gün sayısı “kaç gündür”den büyük olmalı" };

  for (const type of AUTOMATION_TYPES) {
    const target = merged[type];
    const label = AUTOMATION_LABELS[type];
    if (!target.title || target.title.length > TITLE_LIMIT) return { error: `${label}: başlık 1–${TITLE_LIMIT} karakter olmalı` };
    if (!target.body || target.body.length > BODY_LIMIT) return { error: `${label}: mesaj 1–${BODY_LIMIT} karakter olmalı` };
    const allowed = PLACEHOLDERS[type];
    for (const key of [...placeholdersIn(target.title), ...placeholdersIn(target.body)]) {
      if (!allowed[key]) return { error: `${label}: {${key}} alanı bu bildirimde kullanılamaz. Kullanılabilenler: ${Object.keys(allowed).map((k) => `{${k}}`).join(" ")}` };
      if ("coupon" in target && COUPON_ONLY.has(key) && !target.coupon?.enabled) return { error: `${label}: {${key}} alanı için önce kuponu açın` };
    }
    if ("coupon" in target) {
      const c = target.coupon;
      if (typeof c.enabled !== "boolean") return { error: `${label}: kupon açık/kapalı değeri geçersiz` };
      if (!["percentage", "fixed"].includes(c.type)) return { error: `${label}: kupon türü yüzde ya da tutar olmalı` };
      const valueRange = COUPON_RANGES[c.type];
      const value = Number(c.value);
      if (!Number.isFinite(value) || value < valueRange[0] || value > valueRange[1] || (c.type === "percentage" && !Number.isInteger(value))) {
        return { error: `${label}: kupon indirimi ${c.type === "percentage" ? `%${valueRange[0]}–%${valueRange[1]}` : `${valueRange[0]}–${valueRange[1]} TL`} arasında olmalı` };
      }
      const validDays = Number(c.validDays);
      if (!Number.isInteger(validDays) || validDays < COUPON_RANGES.validDays[0] || validDays > COUPON_RANGES.validDays[1]) return { error: `${label}: kupon geçerliliği 1–60 gün olmalı` };
      const minOrderAmount = Number(c.minOrderAmount);
      if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0 || minOrderAmount > COUPON_RANGES.minOrderAmount[1]) return { error: `${label}: kupon alt sipariş tutarı 0–10.000 TL olmalı` };
      target.coupon = { enabled: c.enabled, type: c.type, value: Math.round(value * 100) / 100, validDays, minOrderAmount: Math.round(minOrderAmount * 100) / 100 };
    }
  }
  return { data: merged, changes: describeSettingsChanges(before, merged) };
};

const onOff = (value) => (value ? "Açık" : "Kapalı");
const couponText = (c) => (c?.enabled ? `${c.type === "fixed" ? `${c.value} TL` : `%${c.value}`} · ${c.validDays} gün · alt tutar ${c.minOrderAmount} TL` : "Kapalı");
/** İşlem kaydı için "etiket: eski → yeni" listesi */
export const describeSettingsChanges = (before, after) => {
  const changes = [];
  const push = (label, from, to) => { if (String(from) !== String(to)) changes.push({ label, from, to }); };
  push("Gönderim saatleri", `${before.window.start}–${before.window.end}`, `${after.window.start}–${after.window.end}`);
  push(RANGES.minHoursBetween[2], before.minHoursBetween, after.minHoursBetween);
  for (const type of AUTOMATION_TYPES) {
    const label = AUTOMATION_LABELS[type];
    push(label, onOff(before[type].enabled), onOff(after[type].enabled));
    push(`${label} · başlık`, before[type].title, after[type].title);
    push(`${label} · mesaj`, before[type].body, after[type].body);
    for (const [path, [, , fieldLabel]] of Object.entries(RANGES)) {
      const [owner, key] = path.split(".");
      if (owner === type && key) push(fieldLabel, before[type][key], after[type][key]);
    }
    if ("coupon" in after[type]) push(`${label} · kupon`, couponText(before[type].coupon), couponText(after[type].coupon));
  }
  return changes;
};

export const getAutomationSettings = async () => {
  const doc = await AutomationSettings.findOne({ key: "default" }).lean();
  return normalizeAutomationSettings(doc);
};

export const saveAutomationSettings = async (data, userId = null) => {
  const settings = normalizeAutomationSettings(data);
  await AutomationSettings.findOneAndUpdate(
    { key: "default" },
    { $set: { ...settings, updatedBy: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return settings;
};

// ── Zaman (İstanbul) ──────────────────────────────────────────────────────
const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export const istanbulParts = (date) => {
  const p = Object.fromEntries(partsFormat.formatToParts(new Date(date)).map((part) => [part.type, part.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute) };
};
/** İstanbul duvar saatini (yıl, ay, gün, günün dakikası) gerçek zamana çevirir; taşan gün/dakika normalize edilir. */
export const istanbulTime = (year, month, day, minutesOfDay) => {
  const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay);
  const p = istanbulParts(new Date(guess));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset);
};
export const istanbulMinutes = (date) => {
  const p = istanbulParts(date);
  return p.hour * 60 + p.minute;
};
const clockLabel = (date) => {
  const p = istanbulParts(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

/** İzin verilen gönderim aralığında mıyız? (başlangıç dahil, bitiş hariç) */
export const isWithinSendWindow = (window, now = new Date()) => {
  const start = clockToMinutes(window?.start);
  const end = clockToMinutes(window?.end);
  if (start === null || end === null) return false;
  const current = istanbulMinutes(now);
  return current >= start && current < end;
};

// Mağaza saatleri (Settings.orderStart*/orderEnd*) → dakika. 00:00 kapanış günün sonu sayılır (sepet uç noktasıyla aynı).
const storeMinutes = (hours = {}) => {
  const start = (Number(hours.startHour) || 0) * 60 + (Number(hours.startMinute) || 0);
  let end = (Number(hours.endHour) || 0) * 60 + (Number(hours.endMinute) || 0);
  if (end === 0 && start !== 0) end = 24 * 60;
  const alwaysOpen = start === end || (start === 0 && end === 24 * 60);
  return { start, end, alwaysOpen };
};

/**
 * En son biten kapalı dönem: { closedAt, openedAt } (openedAt <= now). Gece yarısından sonra kapanan
 * mağaza (ör. 10:00–01:00) için kapalı dönem aynı günün 01:00–10:00'ıdır. 24 saat açık mağazada null.
 */
export const computeLastClosedPeriod = (hours, now = new Date()) => {
  const { start, end, alwaysOpen } = storeMinutes(hours);
  if (alwaysOpen) return null;
  const today = istanbulParts(now);
  let openedAt = istanbulTime(today.year, today.month, today.day, start);
  if (openedAt > now) openedAt = istanbulTime(today.year, today.month, today.day - 1, start);
  const openDay = istanbulParts(openedAt);
  let closedAt = istanbulTime(openDay.year, openDay.month, openDay.day, end);
  if (closedAt >= openedAt) closedAt = istanbulTime(openDay.year, openDay.month, openDay.day - 1, end);
  return { closedAt, openedAt };
};

/**
 * Önizleme için ilgili kapalı dönem: mağaza şu an kapalıysa süren dönem (açılışta gönderilecek, upcoming: true),
 * açıksa en son biten dönem.
 */
export const computeRelevantClosedPeriod = (hours, now = new Date()) => {
  const last = computeLastClosedPeriod(hours, now);
  if (!last) return null;
  const { start, end } = storeMinutes(hours);
  const openDay = istanbulParts(last.openedAt);
  let nextClose = istanbulTime(openDay.year, openDay.month, openDay.day, end);
  if (nextClose <= last.openedAt) nextClose = istanbulTime(openDay.year, openDay.month, openDay.day + 1, end);
  if (now < nextClose) return { ...last, upcoming: false };
  return { closedAt: nextClose, openedAt: istanbulTime(openDay.year, openDay.month, openDay.day + 1, start), upcoming: true };
};

const getStoreHours = async () => {
  const settings = await Settings.getSettings();
  return {
    startHour: settings.orderStartHour, startMinute: settings.orderStartMinute,
    endHour: settings.orderEndHour, endMinute: settings.orderEndMinute,
  };
};

// ── Metin ─────────────────────────────────────────────────────────────────
export const firstName = (name) => String(name || "").trim().split(/\s+/)[0]?.slice(0, 20) || "";
export const discountText = (type, value) => {
  const amount = Number(value) || 0;
  return type === "fixed" ? `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL` : `%${amount}`;
};
const couponDiscountText = (coupon) => (coupon?.discountType === "fixed"
  ? discountText("fixed", coupon.discountAmount)
  : discountText("percentage", coupon?.discountPercentage));

/** {ad} gibi alanları doldurur; boş kalan alanın bıraktığı ", ?" / çift boşluk gibi izler temizlenir. */
export const renderTemplate = (text, vars = {}) => {
  let emptied = false;
  let out = String(text || "").replace(/\{([^{}\s]+)\}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") {
      emptied = true;
      return "";
    }
    return String(value);
  });
  if (emptied) out = out.replace(/\s+([,.!?])/g, "$1").replace(/,([!?.])/g, "$1").replace(/^[\s,]+/, "");
  return out.replace(/\s{2,}/g, " ").trim();
};

export const renderMessage = (config, vars) => ({
  title: renderTemplate(config.title, vars).slice(0, 80),
  body: renderTemplate(config.body, vars).slice(0, 240),
});

// ── Uygunluk kuralları (saf fonksiyonlar) ─────────────────────────────────
const idOf = (value) => String(value?._id || value || "");

/** Siparişin teslim edildiği an: durum geçmişindeki son "Teslim Edildi", yoksa son güncelleme. */
export const deliveredAtOf = (order) => {
  const history = Array.isArray(order?.statusHistory) ? order.statusHistory : [];
  const entry = [...history].reverse().find((item) => item?.status === DELIVERED && item.changedAt);
  return new Date(entry?.changedAt || order?.updatedAt || order?.createdAt);
};

/**
 * (a) İkinci sipariş: iptal edilmemiş TEK siparişi olan, o sipariş teslim edilmiş ve teslimattan bu yana
 * afterDays–maxDays gün geçmiş müşteriler. orders: adayların iptal edilmemiş tüm siparişleri.
 */
export const pickSecondOrderCandidates = (orders, config, now = new Date()) => {
  const byUser = new Map();
  for (const order of orders || []) {
    if (!order?.user || order.status === CANCELLED) continue;
    const key = idOf(order.user);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(order);
  }
  const out = [];
  for (const [userId, list] of byUser) {
    if (list.length !== 1 || list[0].status !== DELIVERED) continue;
    const deliveredAt = deliveredAtOf(list[0]);
    const age = now - deliveredAt;
    if (age < config.afterDays * DAY || age > config.maxDays * DAY) continue;
    out.push({ userId, refKey: "lifetime", orderId: idOf(list[0]), since: deliveredAt });
  }
  return out;
};

/**
 * (b) Geri kazanma. rows: müşteri başına iptal edilmemiş SON sipariş ({ _id: userId, last }).
 * logs: bu müşterilere daha önce giden geri kazanma kayıtları ({ user, sentAt }).
 * Son sipariş teslim edilmiş ve afterDays–maxDays gün önce olmalı; bu sessiz dönemde en fazla maxSends kez,
 * iki gönderim arasında en az cooldownDays gün.
 */
export const pickWinBackCandidates = (rows, logs, config, now = new Date()) => {
  const logsByUser = new Map();
  for (const log of logs || []) {
    const key = idOf(log.user);
    if (!logsByUser.has(key)) logsByUser.set(key, []);
    logsByUser.get(key).push(new Date(log.sentAt));
  }
  const out = [];
  for (const row of rows || []) {
    const last = row?.last;
    const userId = idOf(row?._id || last?.user);
    if (!userId || !last || last.status !== DELIVERED) continue;
    const deliveredAt = deliveredAtOf(last);
    const age = now - deliveredAt;
    if (age < config.afterDays * DAY || age > config.maxDays * DAY) continue;
    const sent = logsByUser.get(userId) || [];
    const thisLapse = sent.filter((at) => at > new Date(last.createdAt || deliveredAt)).length;
    if (thisLapse >= config.maxSends) continue;
    const lastSent = sent.length ? Math.max(...sent.map(Number)) : null;
    if (lastSent && now - lastSent < config.cooldownDays * DAY) continue;
    out.push({ userId, refKey: `${idOf(last)}:${thisLapse + 1}`, orderId: idOf(last), since: deliveredAt });
  }
  return out;
};

// Mobil uygulama kuponu android/ios kanalından kullanır
const APP_CHANNELS = new Set(["android", "ios"]);

/**
 * Sahibi bu kuponu uygulamada gerçekten kullanabilir mi? Cüzdanın (coupon.controller getCoupon) ve
 * evaluateCoupon'ın kurallarıyla aynı: ilk siparişe özel kupon siparişi olan müşteriye, yeni üyelere özel kupon
 * süresi geçmiş üyeye, yalnızca adrese teslimat bölgelerine özel kupon adrese sipariş veremeyen müşteriye ve
 * uygulama kanalını dışlayan kupon gönderilmez. context: { orderedUserIds: Set, userCreatedAt: Map,
 * canOrderToAddress: (userId) => boolean }; gereken bilgi yoksa kupon atlanır.
 */
export const isCouponUsableByOwner = (coupon, owner, context = {}, now = new Date()) => {
  if (coupon?.firstOrderOnly && (!context.orderedUserIds || context.orderedUserIds.has(owner))) return false;
  if (coupon?.newUsersOnly) {
    const createdAt = context.userCreatedAt?.get(owner);
    const days = Math.max(1, Number(coupon.newUserDays || 30));
    if (!createdAt || new Date(createdAt) < new Date(now.getTime() - days * DAY)) return false;
  }
  if (isAddressOnlyCoupon(coupon) && !(typeof context.canOrderToAddress === "function" && context.canOrderToAddress(owner))) return false;
  if (Array.isArray(coupon?.channels) && coupon.channels.length && !coupon.channels.some((channel) => APP_CHANNELS.has(String(channel).toLowerCase()))) return false;
  return true;
};

/**
 * (c) Kupon süresi doluyor: kişiye özel, aktif, sahibi tarafından kullanılmamış, sahibinin kullanabileceği
 * (isCouponUsableByOwner) ve hoursBefore saat içinde biten kuponlar. Bir müşterinin birden çok kuponu varsa
 * kullanabileceği kuponlar içinde en yakın biteni seçilir.
 */
export const pickCouponExpiryCandidates = (coupons, config, now = new Date(), context = {}) => {
  const best = new Map();
  for (const coupon of coupons || []) {
    if (!coupon?.userId || coupon.isActive === false) continue;
    const left = new Date(coupon.expirationDate) - now;
    if (!(left > 0) || left > config.hoursBefore * HOUR) continue;
    if (coupon.createdAt && now - new Date(coupon.createdAt) < MIN_COUPON_AGE_MS) continue;
    if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && Number(coupon.usageCount || 0) >= Number(coupon.usageLimit)) continue;
    const owner = idOf(coupon.userId);
    const used = (coupon.usedBy || []).filter((entry) => idOf(entry?.user) === owner).length;
    if (used >= Number(coupon.userUsageLimit ?? 1)) continue;
    // Kullanılamayan kupon en yakın kupon seçiminden önce elenir; yoksa kullanılabilir olanı gizlerdi
    if (!isCouponUsableByOwner(coupon, owner, context, now)) continue;
    const current = best.get(owner);
    if (current && new Date(current.coupon.expirationDate) <= new Date(coupon.expirationDate)) continue;
    best.set(owner, {
      userId: owner,
      refKey: `coupon:${idOf(coupon)}`,
      coupon,
      vars: { kupon: coupon.code, indirim: couponDiscountText(coupon), saat: Math.max(1, Math.round(left / HOUR)) },
    });
  }
  return [...best.values()];
};

/**
 * (d) Kapalıyken sepet: sepetini kapalı dönemde ([closedAt, until)) güncellemiş, sepetinde satışta ürün olan ve
 * son 12 saatte sepet hatırlatması almamış müşteriler.
 */
export const pickClosedCartCandidates = (users, period, now = new Date(), until = period?.openedAt) => {
  if (!period) return [];
  const out = [];
  for (const user of users || []) {
    const updated = user?.cartLastUpdated ? new Date(user.cartLastUpdated) : null;
    if (!updated || updated < period.closedAt || updated >= until) continue;
    if (user.cartReminderSentAt && now - new Date(user.cartReminderSentAt) < CART_REMINDER_GAP_MS) continue;
    const items = (user.cartItems || []).filter((item) => item?.product && typeof item.product === "object" && !item.product.isHidden && !item.product.isOutOfStock);
    const count = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    if (!count) continue;
    const names = items.map((item) => item.product.name).filter(Boolean);
    const preview = names.slice(0, 2).join(", ") + (names.length > 2 ? ` ve ${names.length - 2} ürün daha` : "");
    out.push({ userId: idOf(user), refKey: `open:${period.openedAt.toISOString()}`, vars: { adet: count, urun: preview } });
  }
  return out;
};

/** Bildirim alabilir mi? (sorgu filtresinin JS karşılığı; eski/eksik kayıtlara karşı ikinci kontrol) */
export const isReachableUser = (user) => Boolean(user)
  && user.role !== "admin"
  && user.pushNotificationsEnabled !== false
  && user.notificationPreferences?.campaigns !== false
  && Boolean(user.appActivity?.lastSeenAt || (typeof user.fcmToken === "string" && user.fcmToken.trim()));

// Mobil uygulamayı bildirim destekli sürümden beri açmış (OneSignal kimliği eşlenir) ya da FCM adresi olan
const PUSH_TARGET = { $or: [{ "appActivity.lastSeenAt": { $ne: null } }, { fcmToken: { $nin: [null, ""] } }] };
const REACHABLE_FILTER = {
  role: { $ne: "admin" },
  pushNotificationsEnabled: { $ne: false },
  "notificationPreferences.campaigns": { $ne: false },
  ...PUSH_TARGET,
};

// ── Aday bulma (veritabanı) ───────────────────────────────────────────────
const findSecondOrderCandidates = async (config, now) => {
  const latest = new Date(now - config.afterDays * DAY);
  const earliest = new Date(now - (config.maxDays + 3) * DAY);
  const recent = await Order.find({ status: DELIVERED, user: { $ne: null }, userDeleted: { $ne: true }, createdAt: { $gte: earliest, $lte: latest } })
    .select("user").limit(5000).lean();
  const ids = [...new Set(recent.map((order) => idOf(order.user)).filter(Boolean))];
  if (!ids.length) return [];
  const done = new Set((await AutomationLog.distinct("user", { type: "secondOrder", user: { $in: ids } })).map(String));
  const open = ids.filter((id) => !done.has(id));
  if (!open.length) return [];
  const orders = await Order.find({ user: { $in: open }, status: { $ne: CANCELLED } })
    .select("user status createdAt updatedAt statusHistory").lean();
  return pickSecondOrderCandidates(orders, config, now);
};

const findWinBackCandidates = async (config, now) => {
  const earliest = new Date(now - (config.maxDays + 3) * DAY);
  const rows = await Order.aggregate([
    { $match: { user: { $ne: null }, userDeleted: { $ne: true }, status: { $ne: CANCELLED }, createdAt: { $gte: earliest } } },
    { $project: { user: 1, status: 1, createdAt: 1, updatedAt: 1, statusHistory: 1 } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$user", last: { $first: "$$ROOT" } } },
  ]);
  const latest = new Date(now - config.afterDays * DAY);
  const due = (rows || []).filter((row) => row?.last?.status === DELIVERED && new Date(row.last.createdAt) <= latest);
  if (!due.length) return [];
  const logs = await AutomationLog.find({ type: "winBack", user: { $in: due.map((row) => row._id) } }).select("user sentAt").lean();
  return pickWinBackCandidates(due, logs, config, now);
};

/** isCouponUsableByOwner için gereken bilgiler; yalnızca kuponlardan biri gerektiriyorsa sorgulanır. */
const loadCouponOwnerContext = async (coupons) => {
  const owners = (predicate) => [...new Set((coupons || []).filter((c) => c?.userId && predicate(c)).map((c) => idOf(c.userId)))];
  const firstOrderOwners = owners((c) => c.firstOrderOnly);
  const newUserOwners = owners((c) => c.newUsersOnly);
  const needsSettings = (coupons || []).some((c) => c?.userId && isAddressOnlyCoupon(c));
  const [ordered, users, settings] = await Promise.all([
    // Durum filtresi yok: evaluateCoupon ve cüzdan iptal edilenler dahil her siparişi sayar
    firstOrderOwners.length ? Order.distinct("user", { user: { $in: firstOrderOwners } }) : [],
    newUserOwners.length ? User.find({ _id: { $in: newUserOwners } }).select("createdAt").lean() : [],
    needsSettings ? Settings.getSettings() : null,
  ]);
  return {
    orderedUserIds: new Set((ordered || []).map(String)),
    userCreatedAt: new Map((users || []).map((user) => [idOf(user), user.createdAt])),
    canOrderToAddress: (userId) => canUserOrderToAddress(settings, userId),
  };
};

const findCouponExpiryCandidates = async (config, now) => {
  const coupons = await Coupon.find({
    isActive: true,
    userId: { $ne: null },
    expirationDate: { $gt: now, $lte: new Date(now.getTime() + config.hoursBefore * HOUR) },
  }).select("code userId discountType discountPercentage discountAmount expirationDate usedBy usageCount usageLimit userUsageLimit isActive createdAt firstOrderOnly newUsersOnly newUserDays deliveryZones deliveryPoints channels")
    .limit(2000).lean();
  if (!coupons?.length) return [];
  const context = await loadCouponOwnerContext(coupons);
  const candidates = pickCouponExpiryCandidates(coupons, config, now, context);
  if (!candidates.length) return [];
  const done = new Set(await AutomationLog.distinct("refKey", { type: "couponExpiry", refKey: { $in: candidates.map((c) => c.refKey) } }));
  return candidates.filter((c) => !done.has(c.refKey));
};

const findClosedCartCandidates = async (period, now, until = period?.openedAt) => {
  if (!period) return [];
  const users = await User.find({
    role: { $ne: "admin" },
    "cartItems.0": { $exists: true },
    cartLastUpdated: { $gte: period.closedAt, $lt: until },
  }).select("cartItems cartLastUpdated cartReminderSentAt")
    .populate("cartItems.product", "name isHidden isOutOfStock")
    .limit(1000).lean();
  const candidates = pickClosedCartCandidates(users, period, now, until);
  if (!candidates.length) return [];
  const done = new Set((await AutomationLog.distinct("user", { type: "closedCart", refKey: candidates[0].refKey })).map(String));
  return candidates.filter((c) => !done.has(c.userId));
};

/**
 * "Açıldık" bildiriminin gönderilmeye başlayacağı an: açılış + delayMinutes. Gönderim saatleri (window) verilirse
 * ve bu an açılış günündeki gönderim başlangıcından önceyse, gönderim başlangıcına kaydırılır (ör. mağaza 07:00'de
 * açılıyor, gönderim 10:00'da başlıyor → 10:00). Yoksa aralık tamamen sessiz saatlere düşer ve bildirim hiç gitmez.
 */
export const closedCartDueStart = (period, config, window) => {
  if (!period) return null;
  const dueStart = new Date(period.openedAt.getTime() + config.delayMinutes * MINUTE);
  const windowStart = clockToMinutes(window?.start);
  if (windowStart === null) return dueStart;
  const day = istanbulParts(period.openedAt);
  const sendStart = istanbulTime(day.year, day.month, day.day, windowStart);
  return dueStart < sendStart ? sendStart : dueStart;
};

/** Mağazanın açılışından sonraki gönderim aralığında mıyız? window: gönderim saatleri (isteğe bağlı, bkz. closedCartDueStart) */
export const closedCartDue = (period, config, now = new Date(), window) => {
  const dueStart = closedCartDueStart(period, config, window);
  if (!dueStart) return false;
  return now >= dueStart && now - dueStart <= config.windowMinutes * MINUTE;
};

const findCandidates = async (type, settings, now, { period } = {}) => {
  const config = settings[type];
  if (type === "secondOrder") return findSecondOrderCandidates(config, now);
  if (type === "winBack") return findWinBackCandidates(config, now);
  if (type === "couponExpiry") return findCouponExpiryCandidates(config, now);
  if (type === "closedCart") {
    const resolved = period === undefined ? computeLastClosedPeriod(await getStoreHours(), now) : period;
    if (!resolved) return [];
    if (period === undefined && !closedCartDue(resolved, config, now, settings.window)) return [];
    const until = resolved.upcoming ? now : resolved.openedAt;
    return findClosedCartCandidates(resolved, now, until);
  }
  return [];
};

/**
 * Global kurallar: bildirim/kampanya izni, yönetici değil, cihazı var, son minHoursBetween saatte otomatik
 * bildirim almamış ve bu turda başka bir otomasyondan bildirim almamış (exclude).
 */
export const filterReachableCandidates = async (candidates, settings, now, exclude = new Set()) => {
  const ids = [...new Set(candidates.map((c) => c.userId))].filter((id) => !exclude.has(id));
  if (!ids.length) return [];
  const [users, recent] = await Promise.all([
    User.find({ _id: { $in: ids }, ...REACHABLE_FILTER })
      .select("_id name role pushNotificationsEnabled notificationPreferences appActivity.lastSeenAt fcmToken").lean(),
    AutomationLog.distinct("user", { user: { $in: ids }, status: { $in: ["pending", "sent"] }, sentAt: { $gte: new Date(now - settings.minHoursBetween * HOUR) } }),
  ]);
  const capped = new Set((recent || []).map(String));
  const byId = new Map(users.filter(isReachableUser).map((user) => [idOf(user), user]));
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const user = byId.get(candidate.userId);
    if (!user || capped.has(candidate.userId) || exclude.has(candidate.userId) || seen.has(candidate.userId)) continue;
    seen.add(candidate.userId);
    out.push({ ...candidate, name: user.name || "", vars: { ...(candidate.vars || {}), ad: firstName(user.name) } });
  }
  return out;
};

// ── Kupon ─────────────────────────────────────────────────────────────────
export const automationCouponCode = (type, userId, refKey) =>
  `${COUPON_PREFIX[type] || "OTO"}${createHash("sha1").update(`${type}:${userId}:${refKey}`).digest("hex").slice(0, 7).toUpperCase()}`;

/**
 * Kişiye özel, tek kullanımlık kupon. Kod (tür, müşteri, refKey)'den türetilir: aynı gönderim yeniden denense de
 * ikinci kupon oluşmaz. Yeniden denemede kupon yeniden etkinleştirilir ve süresi baştan başlar.
 */
export const ensureAutomationCoupon = async (type, userId, refKey, couponConfig, now = new Date()) => {
  const code = automationCouponCode(type, userId, refKey);
  const percentage = couponConfig.type !== "fixed";
  const coupon = await Coupon.findOneAndUpdate(
    { code },
    {
      $setOnInsert: {
        code,
        description: `${AUTOMATION_LABELS[type]} (otomatik bildirim)`,
        discountType: percentage ? "percentage" : "fixed",
        discountPercentage: percentage ? Number(couponConfig.value) : 0,
        discountAmount: percentage ? 0 : Number(couponConfig.value),
        minimumOrderAmount: Number(couponConfig.minOrderAmount) || 0,
        usageLimit: 1,
        userUsageLimit: 1,
        userId,
      },
      $set: { isActive: true, expirationDate: new Date(now.getTime() + couponConfig.validDays * DAY) },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  if (!coupon || idOf(coupon.userId) !== String(userId)) throw new Error("AUTOMATION_COUPON_CONFLICT");
  return coupon;
};

// ── Gönderim ──────────────────────────────────────────────────────────────
/**
 * Tek müşteriye tek otomatik bildirim. Önce kayıt alınır (benzersiz indeks); kayıt alınamazsa (başka süreç ya da
 * önceki tur göndermiş) hiçbir şey yapılmaz.
 * @returns {Promise<{status: "sent"|"failed"|"duplicate"|"retry"|"error", reason?: string}>}
 */
export const deliverAutomation = async (type, candidate, settings, now = new Date(), { send = sendPushToUsers } = {}) => {
  const config = settings[type];
  let log;
  try {
    log = await AutomationLog.create({ user: candidate.userId, type, refKey: candidate.refKey, status: "pending", sentAt: now });
  } catch (error) {
    if (error?.code === 11000) return { status: "duplicate" };
    throw error;
  }
  let coupon = null;
  try {
    const vars = { ...(candidate.vars || {}) };
    if (config.coupon?.enabled) {
      coupon = await ensureAutomationCoupon(type, candidate.userId, candidate.refKey, config.coupon, now);
      Object.assign(vars, { kupon: coupon.code, indirim: discountText(config.coupon.type, config.coupon.value), gun: config.coupon.validDays });
    }
    const message = renderMessage(config, vars);
    const result = await send([candidate.userId], message, { type: "automation", automation: type, automationLogId: String(log._id), route: ROUTES[type] },
      { category: "campaigns", collapseId: `auto-${type}` });
    if (result?.sent) {
      // Bildirim müşteriye ulaştı: bundan sonraki yazma hataları gönderimi geri almaz. Kayıt silinmez (yoksa sonraki
      // turda aynı bildirim yeniden gider) ve kupon kapatılmaz (müşteri kodu aldı). Güncellenemeyen kayıt "pending"
      // kalır; tekrar gönderim engeli ve kişi başı sınır "pending"i de sayar.
      try {
        await AutomationLog.updateOne({ _id: log._id }, { $set: {
          status: "sent", title: message.title, body: message.body, couponId: coupon?._id || null, couponCode: coupon?.code || null,
          pushResult: { sent: true, reason: null, targeted: result.targeted || 0 },
        } });
      } catch (error) {
        console.error(`Otomatik bildirim (${type}) gönderildi ama kayıt güncellenemedi:`, error.message);
      }
      // Sepet hatırlatması aynı sepet için ayrıca gönderilmesin (cartReminder.service bu alana bakar)
      if (type === "closedCart") {
        await User.updateOne({ _id: candidate.userId }, { $set: { cartReminderSentAt: now } }, { timestamps: false })
          .catch((error) => console.error(`Otomatik bildirim (closedCart) gönderildi ama sepet hatırlatma zamanı yazılamadı:`, error.message));
      }
      return { status: "sent" };
    }
    if (coupon) await Coupon.updateOne({ _id: coupon._id }, { $set: { isActive: false } });
    if (SYSTEM_FAILURES.has(result?.reason)) {
      // Servis hatası: müşteri suçu değil, kayıt silinir ve sonraki turda yeniden denenir
      await AutomationLog.deleteOne({ _id: log._id });
      return { status: "retry", reason: result.reason };
    }
    const reason = result?.reason || "opted_out";
    await AutomationLog.updateOne({ _id: log._id }, { $set: {
      status: "failed", title: message.title, body: message.body, couponId: coupon?._id || null, couponCode: coupon?.code || null,
      pushResult: { sent: false, reason, targeted: result?.targeted || 0 },
    } });
    return { status: "failed", reason };
  } catch (error) {
    // Beklenmeyen hata: kayıt bırakılmaz ki yeniden denenebilsin; kupon kapatılır
    console.error(`Otomatik bildirim (${type}) gönderilemedi:`, error.message);
    await AutomationLog.deleteOne({ _id: log._id }).catch(() => {});
    if (coupon) await Coupon.updateOne({ _id: coupon._id }, { $set: { isActive: false } }).catch(() => {});
    return { status: "error", reason: error.message };
  }
};

const deliverBatch = async (type, candidates, settings, now, deps) => {
  const summary = { candidates: candidates.length, sent: 0, failed: 0, duplicate: 0, retry: 0, error: 0, sentUsers: [], systemFailure: null };
  for (let i = 0; i < candidates.length; i += SEND_CONCURRENCY) {
    const chunk = candidates.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.all(chunk.map((candidate) => deliverAutomation(type, candidate, settings, now, deps)
      .catch((error) => ({ status: "error", reason: error.message }))));
    results.forEach((result, index) => {
      summary[result.status] = (summary[result.status] || 0) + 1;
      if (result.status === "sent") summary.sentUsers.push(chunk[index].userId);
      if (result.status === "retry" && !summary.systemFailure) summary.systemFailure = result.reason;
    });
    // Bildirim servisi çalışmıyorsa bu turda daha fazla denenmez
    if (summary.systemFailure) break;
  }
  return summary;
};

/**
 * Tek tur: açık otomasyonların adaylarını bulur ve gönderir. Hata fırlatmaz.
 * deps: { send, configured } (testler için)
 */
export const runAutomationTick = async ({ now = new Date(), send = sendPushToUsers, configured } = {}) => {
  const started = Date.now();
  const result = { at: now.toISOString(), skipped: null, types: {} };
  try {
    const settings = await getAutomationSettings();
    const enabled = TICK_ORDER.filter((type) => settings[type].enabled);
    if (!enabled.length) return { ...result, skipped: "disabled" };
    if (!(configured ?? isPushConfigured())) return { ...result, skipped: "not_configured" };
    if (!isWithinSendWindow(settings.window, now)) return { ...result, skipped: "quiet_hours" };
    const touched = new Set();
    for (const type of enabled) {
      try {
        const candidates = await findCandidates(type, settings, now);
        const reachable = (await filterReachableCandidates(candidates, settings, now, touched)).slice(0, MAX_PER_TYPE_PER_TICK);
        const summary = await deliverBatch(type, reachable, settings, now, { send });
        summary.sentUsers.forEach((id) => touched.add(id));
        result.types[type] = { found: candidates.length, eligible: reachable.length, sent: summary.sent, failed: summary.failed, duplicate: summary.duplicate, retry: summary.retry, error: summary.error };
        if (summary.systemFailure) {
          result.systemFailure = summary.systemFailure;
          break;
        }
      } catch (error) {
        console.error(`Otomatik bildirim turu (${type}) hatası:`, error.message);
        result.types[type] = { error: error.message };
      }
    }
  } catch (error) {
    console.error("Otomatik bildirim turu hatası:", error.message);
    result.error = error.message;
  }
  result.durationMs = Date.now() - started;
  return result;
};

// ── Kilit ve zamanlayıcı ──────────────────────────────────────────────────
export const LOCK_KEY = "notification-automation:tick:lock";
const LOCK_TTL_SEC = 9 * 60; // tur aralığından (10 dk) kısa: takılan süreç bir sonraki turu kilitlemez
const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, "TIMEOUT");
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
};

/**
 * Turu yalnızca bir sürecin çalıştırması için kilit. Redis bağlıysa SET NX EX; bağlı değilse (bellek yedeği NX
 * desteklemez) PM2 kümesinde yalnızca ilk süreç (NODE_APP_INSTANCE 0 ya da tanımsız) çalışır.
 * Aynı bildirim zaten benzersiz indeksle iki kez gönderilemez; kilit gereksiz yükü ve kişi başı sınırı korur.
 */
export const acquireAutomationLock = async (client = redis, env = process.env) => {
  const noop = async () => {};
  if (client && client.connected === true) {
    const token = `${process.pid}:${randomUUID()}`;
    try {
      const reply = await withTimeout(client.set(LOCK_KEY, token, "EX", LOCK_TTL_SEC, "NX"), 1500);
      if (reply === "OK") {
        return {
          ok: true,
          mode: "redis",
          release: async () => {
            try {
              if ((await withTimeout(client.get(LOCK_KEY), 1000)) === token) await withTimeout(client.del(LOCK_KEY), 1000);
            } catch {
              /* kilit süre dolunca kendiliğinden açılır */
            }
          },
        };
      }
      if (reply !== "TIMEOUT") return { ok: false, mode: "redis", reason: "locked", release: noop };
    } catch {
      /* Redis yanıt vermedi: aşağıdaki yerel kurala düş */
    }
  }
  const instance = env?.NODE_APP_INSTANCE;
  if (instance === undefined || instance === null || instance === "" || String(instance) === "0") return { ok: true, mode: "local", release: noop };
  return { ok: false, mode: "local", reason: "not_primary", release: noop };
};

let running = false;
let lastTick = null;
export const getLastAutomationTick = () => lastTick;

/** Kilitli tur (zamanlayıcı bunu çağırır). Asla hata fırlatmaz. */
export const runAutomationTickLocked = async ({ now = new Date(), client = redis, env = process.env, ...deps } = {}) => {
  if (running) return { skipped: "busy" };
  running = true;
  try {
    const lock = await acquireAutomationLock(client, env);
    if (!lock.ok) return { skipped: lock.reason || "locked" };
    try {
      const result = await runAutomationTick({ now, ...deps });
      lastTick = result;
      const sent = Object.values(result.types || {}).reduce((sum, item) => sum + (item.sent || 0), 0);
      if (sent) console.log(`Otomatik bildirim turu: ${sent} bildirim gönderildi`, JSON.stringify(result.types));
      return result;
    } finally {
      await lock.release();
    }
  } catch (error) {
    console.error("Otomatik bildirim turu başarısız:", error.message);
    return { error: error.message };
  } finally {
    running = false;
  }
};

let job = null;
/** server.js açılışta çağırır: 10 dakikada bir (İstanbul saati) tur. */
export const startNotificationAutomationJobs = () => {
  if (job) return job;
  job = cron.schedule("*/10 * * * *", () => {
    runAutomationTickLocked().catch((error) => console.error("Otomatik bildirim zamanlayıcısı hatası:", error.message));
  }, { scheduled: true, timezone: TZ });
  return job;
};
export const stopNotificationAutomationJobs = () => {
  job?.stop();
  job = null;
};

// ── Panel: önizleme, test, istatistik ─────────────────────────────────────
/** Paneldeki kaydedilmemiş değişiklikleri (yalnızca o otomasyon) geçici olarak uygular. */
export const applyOverride = (settings, type, override) => {
  if (!isPlainObject(override)) return settings;
  const { data, error } = validateAutomationSettingsInput({ [type]: override }, settings);
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }
  return data;
};

/** Şu an kaç kişiye gider? (gönderim yapmaz) */
export const previewAutomation = async (type, { now = new Date(), override } = {}) => {
  const settings = applyOverride(await getAutomationSettings(), type, override);
  const config = settings[type];
  const notes = [];
  let period;
  if (type === "closedCart") {
    const relevant = computeRelevantClosedPeriod(await getStoreHours(), now);
    if (!relevant) {
      return { count: 0, samples: [], candidates: 0, enabled: config.enabled, inWindow: isWithinSendWindow(settings.window, now), notes: ["Mağaza 24 saat açık görünüyor; bu bildirim gönderilmez."] };
    }
    period = relevant;
    if (relevant.upcoming) {
      const dueStart = closedCartDueStart(relevant, config, settings.window);
      const shifted = dueStart > new Date(relevant.openedAt.getTime() + config.delayMinutes * MINUTE);
      notes.push(shifted
        ? `Mağaza şu an kapalı. ${clockLabel(relevant.closedAt)}'dan bu yana sepet kuranlara gönderim saatleri başlayınca (${clockLabel(dueStart)}) gider.`
        : `Mağaza şu an kapalı. ${clockLabel(relevant.closedAt)}'dan bu yana sepet kuranlara açılıştan ${config.delayMinutes} dk sonra (${clockLabel(dueStart)}) gider.`);
    } else if (closedCartDue(relevant, config, now, settings.window)) {
      notes.push(`Şu an açılış sonrası gönderim aralığındayız (${clockLabel(relevant.closedAt)}–${clockLabel(relevant.openedAt)} arası sepet kuranlar).`);
    } else {
      notes.push(`Son açılıştaki gönderim aralığı geçti; sayı ${clockLabel(relevant.closedAt)}–${clockLabel(relevant.openedAt)} kapalı döneminde sepet kuranları gösterir. Sonraki açılışta yeni sepetler için çalışır.`);
    }
  }
  const candidates = await findCandidates(type, settings, now, { period });
  const reachable = await filterReachableCandidates(candidates, settings, now, new Set());
  const inWindow = isWithinSendWindow(settings.window, now);
  if (!inWindow) notes.push(`Şu an gönderim saatleri (${settings.window.start}–${settings.window.end}) dışında; ilk uygun turda gider.`);
  if (reachable.length > MAX_PER_TYPE_PER_TICK) notes.push(`Her 10 dakikada en fazla ${MAX_PER_TYPE_PER_TICK} kişiye gönderilir; kalanlar sonraki turlara kalır.`);
  return {
    count: reachable.length,
    candidates: candidates.length,
    samples: reachable.slice(0, 3).map((c) => c.name).filter(Boolean),
    enabled: config.enabled,
    inWindow,
    notes,
  };
};

/** Panelde "Bana test gönder": yalnızca isteyen yöneticiye, örnek değerlerle. Kayıt ya da kupon oluşturmaz. */
export const sendAutomationTest = async (type, adminUser, { override, send = sendPushToUsers } = {}) => {
  const settings = applyOverride(await getAutomationSettings(), type, override);
  const config = settings[type];
  const vars = { ad: firstName(adminUser?.name) };
  if (config.coupon?.enabled) Object.assign(vars, { kupon: `${COUPON_PREFIX[type]}ORNEK`, indirim: discountText(config.coupon.type, config.coupon.value), gun: config.coupon.validDays });
  if (type === "couponExpiry") Object.assign(vars, { kupon: "ORNEK10", indirim: "%10", saat: Math.min(config.hoursBefore, 12) });
  if (type === "closedCart") Object.assign(vars, { adet: 3, urun: "Süt, Ekmek ve 1 ürün daha" });
  const message = renderMessage(config, vars);
  const result = await send([adminUser._id], message, { type: "automation_test", automation: type, route: ROUTES[type] }, { category: "campaigns" });
  return { ...result, message };
};

/**
 * Atıf: gönderimden sonraki 72 saat içinde verilen sipariş, o müşteriye o siparişten önce giden EN SON otomatik
 * bildirime yazılır (son dokunuş). Dönen harita: logId → { orders, revenue }.
 */
export const attributeConversions = (logs, orders, windowMs = ATTRIBUTION_WINDOW_MS) => {
  const byUser = new Map();
  for (const log of logs || []) {
    const key = idOf(log.user);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(log);
  }
  for (const list of byUser.values()) list.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
  const result = new Map();
  for (const order of orders || []) {
    const list = byUser.get(idOf(order.user));
    if (!list) continue;
    const at = new Date(order.createdAt);
    let match = null;
    for (const log of list) {
      const sentAt = new Date(log.sentAt);
      if (sentAt <= at && at - sentAt <= windowMs) match = log;
    }
    if (!match) continue;
    const key = idOf(match);
    const entry = result.get(key) || { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += Number(order.totalAmount) || 0;
    result.set(key, entry);
  }
  return result;
};

/** Son 7 ve 30 günün gönderim / dönüşüm sayıları (türe göre). */
export const getAutomationStats = async (now = new Date()) => {
  const since30 = new Date(now - 30 * DAY);
  const since7 = new Date(now - 7 * DAY);
  const logs = await AutomationLog.find({ sentAt: { $gte: since30 }, status: { $in: ["sent", "failed"] } })
    .select("user type status sentAt").sort({ sentAt: -1 }).limit(20000).lean();
  const sent = logs.filter((log) => log.status === "sent");
  const userIds = [...new Set(sent.map((log) => idOf(log.user)))];
  const orders = userIds.length
    ? await Order.find({ user: { $in: userIds }, status: { $ne: CANCELLED }, createdAt: { $gte: since30 } }).select("user createdAt totalAmount").lean()
    : [];
  const attribution = attributeConversions(sent, orders);
  const blank = () => ({ sent7: 0, sent30: 0, failed30: 0, conversions7: 0, conversions30: 0, revenue30: 0, lastSentAt: null });
  const types = Object.fromEntries(AUTOMATION_TYPES.map((type) => [type, blank()]));
  for (const log of logs) {
    const row = types[log.type];
    if (!row) continue;
    if (log.status === "failed") {
      row.failed30 += 1;
      continue;
    }
    const recent = new Date(log.sentAt) >= since7;
    row.sent30 += 1;
    if (recent) row.sent7 += 1;
    if (!row.lastSentAt || new Date(log.sentAt) > new Date(row.lastSentAt)) row.lastSentAt = log.sentAt;
    const conv = attribution.get(idOf(log));
    if (conv) {
      row.conversions30 += 1;
      row.revenue30 += conv.revenue;
      if (recent) row.conversions7 += 1;
    }
  }
  const totals = blank();
  for (const row of Object.values(types)) {
    row.revenue30 = Math.round(row.revenue30 * 100) / 100;
    for (const key of ["sent7", "sent30", "failed30", "conversions7", "conversions30", "revenue30"]) totals[key] += row[key];
  }
  totals.revenue30 = Math.round(totals.revenue30 * 100) / 100;
  return { types, totals, attributionHours: ATTRIBUTION_WINDOW_MS / HOUR };
};
