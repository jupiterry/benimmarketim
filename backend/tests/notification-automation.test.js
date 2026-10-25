import test from "node:test";
import assert from "node:assert/strict";
import AutomationSettings from "../models/automationSettings.model.js";
import AutomationLog from "../models/automationLog.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Coupon from "../models/coupon.model.js";
import Settings from "../models/settings.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import {
  DEFAULT_AUTOMATION_SETTINGS,
  LOCK_KEY,
  TEST_RECIPIENT_LABEL,
  acquireAutomationLock,
  attributeConversions,
  automationCouponCode,
  closedCartDue,
  closedCartDueStart,
  computeLastClosedPeriod,
  computeRelevantClosedPeriod,
  deliverAutomation,
  deliveredAtOf,
  describeTestSend,
  ensureAutomationCoupon,
  filterReachableCandidates,
  getAutomationStats,
  hasPushTarget,
  isCouponUsableByOwner,
  isReachableUser,
  isWithinSendWindow,
  istanbulTime,
  normalizeAutomationSettings,
  pickClosedCartCandidates,
  pickCouponExpiryCandidates,
  pickSecondOrderCandidates,
  pickWinBackCandidates,
  previewAutomation,
  recipientLabel,
  renderTemplate,
  resolveTestRecipient,
  runAutomationTick,
  runAutomationTickLocked,
  sendAutomationTest,
  toTestRecipient,
  validateAutomationSettingsInput,
} from "../services/notificationAutomation.service.js";
import { getSettings, previewType, testType, updateSettings } from "../controllers/notificationAutomation.controller.js";

const MIN = 60 * 1000;
const H = 60 * MIN;
const DAY = 24 * H;
const id = (n) => `507f191e810c19729de87${String(n).padStart(3, "0")}`;
// İstanbul UTC+3: 2026-10-25 12:00 İstanbul = 09:00Z
const NOON = new Date("2026-10-25T09:00:00Z");
const chain = (value) => ({ select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
const response = () => {
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};
const settingsWith = (patch = {}) => {
  const base = normalizeAutomationSettings({});
  for (const [key, value] of Object.entries(patch)) base[key] = typeof value === "object" && !Array.isArray(value) ? { ...base[key], ...value } : value;
  return base;
};
const reachableUser = (n, fields = {}) => ({ _id: id(n), name: `Müşteri${n} Soyad`, role: "customer", appActivity: { lastSeenAt: new Date() }, ...fields });

// ── Ayarlar ────────────────────────────────────────────────────────────────
test("defaults: every automation is off, texts and timings have safe defaults", () => {
  const settings = normalizeAutomationSettings(null);
  for (const type of ["secondOrder", "winBack", "couponExpiry", "closedCart"]) assert.equal(settings[type].enabled, false);
  assert.deepEqual(settings.window, { start: "10:00", end: "21:30" });
  assert.equal(settings.minHoursBetween, 24);
  assert.equal(settings.secondOrder.afterDays, 3);
  assert.equal(settings.winBack.afterDays, 21);
  assert.equal(settings.winBack.cooldownDays, 30);
  assert.equal(settings.winBack.maxSends, 2);
  assert.equal(settings.couponExpiry.hoursBefore, 24);
  assert.equal(settings.closedCart.delayMinutes, 5);
  assert.equal(settings.secondOrder.coupon.enabled, false);
  // Varsayılan metinler indirim vaat etmez
  for (const type of ["secondOrder", "winBack", "closedCart"]) assert.doesNotMatch(`${settings[type].title} ${settings[type].body}`, /%|indirim|kupon/i);
  // Bozuk kayıtlar sınırlara oturtulur
  const odd = normalizeAutomationSettings({ window: { start: "22:00", end: "08:00" }, minHoursBetween: 2, winBack: { afterDays: 9999, maxSends: -1, enabled: "yes" } });
  assert.deepEqual(odd.window, DEFAULT_AUTOMATION_SETTINGS.window);
  assert.equal(odd.minHoursBetween, 24);
  assert.equal(odd.winBack.afterDays, 365);
  assert.equal(odd.winBack.maxDays, 366);
  assert.equal(odd.winBack.maxSends, 1);
  assert.equal(odd.winBack.enabled, false);
});

test("validation: partial update merges, numbers are checked, changes are listed", () => {
  const current = normalizeAutomationSettings({});
  const ok = validateAutomationSettingsInput({ secondOrder: { enabled: true, afterDays: "5" }, window: { start: "09:30" } }, current);
  assert.equal(ok.error, undefined);
  assert.equal(ok.data.secondOrder.enabled, true);
  assert.equal(ok.data.secondOrder.afterDays, 5);
  assert.equal(ok.data.window.start, "09:30");
  assert.equal(ok.data.window.end, "21:30");
  assert.equal(ok.data.winBack.enabled, false);
  assert.ok(ok.changes.some((c) => c.label === "İkinci sipariş teşviki" && c.from === "Kapalı" && c.to === "Açık"));
  assert.ok(ok.changes.some((c) => c.label === "Gönderim saatleri"));

  assert.match(validateAutomationSettingsInput({ winBack: { afterDays: 3 } }, current).error, /7–365/);
  assert.match(validateAutomationSettingsInput({ secondOrder: { afterDays: 20, maxDays: 10 } }, current).error, /en geç/);
  assert.match(validateAutomationSettingsInput({ window: { start: "22:00", end: "10:00" } }, current).error, /önce/);
  assert.match(validateAutomationSettingsInput({ window: { start: "9" } }, current).error, /SS:DD/);
  assert.match(validateAutomationSettingsInput({ minHoursBetween: 6 }, current).error, /24–168/);
  assert.match(validateAutomationSettingsInput({ closedCart: { title: "" } }, current).error, /başlık/);
  assert.match(validateAutomationSettingsInput({ closedCart: { body: "x".repeat(181) } }, current).error, /mesaj/);
  assert.match(validateAutomationSettingsInput({ secondOrder: { enabled: "true" } }, current).error, /açık\/kapalı/);
});

test("validation: placeholders are checked per automation; coupon fields need the coupon on", () => {
  const current = normalizeAutomationSettings({});
  assert.match(validateAutomationSettingsInput({ closedCart: { body: "{kupon} hazır" } }, current).error, /\{kupon\} alanı bu bildirimde kullanılamaz/);
  assert.match(validateAutomationSettingsInput({ secondOrder: { body: "Kuponun: {kupon}" } }, current).error, /önce kuponu açın/);
  const withCoupon = validateAutomationSettingsInput({ secondOrder: { body: "Sana özel {indirim}: {kupon}, {gun} gün", coupon: { enabled: true, type: "fixed", value: "25", validDays: 5, minOrderAmount: 150 } } }, current);
  assert.equal(withCoupon.error, undefined);
  assert.deepEqual(withCoupon.data.secondOrder.coupon, { enabled: true, type: "fixed", value: 25, validDays: 5, minOrderAmount: 150 });
  // Kuruşlu tutar kaydedilirken yuvarlanıp bozulmaz
  const cents = validateAutomationSettingsInput({ winBack: { coupon: { enabled: true, type: "fixed", value: 12.5, validDays: 3, minOrderAmount: 99.9 } } }, current).data;
  assert.deepEqual(normalizeAutomationSettings(cents).winBack.coupon, { enabled: true, type: "fixed", value: 12.5, validDays: 3, minOrderAmount: 99.9 });
  assert.match(validateAutomationSettingsInput({ winBack: { coupon: { enabled: true, type: "percentage", value: 80 } } }, current).error, /%1–%50/);
  assert.match(validateAutomationSettingsInput({ winBack: { coupon: { enabled: true, validDays: 0 } } }, current).error, /1–60 gün/);
  assert.match(validateAutomationSettingsInput({ winBack: { coupon: { type: "bedava" } } }, current).error, /yüzde ya da tutar/);
  // Kupon kapatılırsa metindeki kupon alanı kalamaz
  const on = validateAutomationSettingsInput({ winBack: { body: "{kupon}", coupon: { enabled: true } } }, current).data;
  assert.match(validateAutomationSettingsInput({ winBack: { coupon: { enabled: false } } }, on).error, /önce kuponu açın/);
});

test("templates fill placeholders and tidy up empty ones", () => {
  assert.equal(renderTemplate("Seni özledik, {ad} 💚", { ad: "Ayşe" }), "Seni özledik, Ayşe 💚");
  assert.equal(renderTemplate("İlk siparişin nasıldı, {ad}? 🛒", {}), "İlk siparişin nasıldı? 🛒");
  assert.equal(renderTemplate("Sipariş almaya başladık, {ad}! Sepetindeki {adet} ürün", { adet: 3 }), "Sipariş almaya başladık! Sepetindeki 3 ürün");
  assert.equal(renderTemplate("{kupon} ile {indirim}", { kupon: "IKINCI1", indirim: "%10" }), "IKINCI1 ile %10");
});

// ── Zaman ──────────────────────────────────────────────────────────────────
test("send window uses Istanbul time: start inclusive, end exclusive", () => {
  const window = { start: "10:00", end: "21:30" };
  const at = (h, m) => istanbulTime(2026, 10, 25, h * 60 + m);
  assert.equal(isWithinSendWindow(window, at(9, 59)), false);
  assert.equal(isWithinSendWindow(window, at(10, 0)), true);
  assert.equal(isWithinSendWindow(window, at(21, 29)), true);
  assert.equal(isWithinSendWindow(window, at(21, 30)), false);
  assert.equal(isWithinSendWindow(window, at(3, 0)), false);
  assert.equal(at(10, 0).toISOString(), "2026-10-25T07:00:00.000Z");
});

test("closed period: closing after midnight (10:00–01:00)", () => {
  const hours = { startHour: 10, startMinute: 0, endHour: 1, endMinute: 0 };
  const now = istanbulTime(2026, 10, 25, 10 * 60 + 7);
  const period = computeLastClosedPeriod(hours, now);
  assert.equal(period.closedAt.toISOString(), istanbulTime(2026, 10, 25, 60).toISOString()); // aynı gün 01:00
  assert.equal(period.openedAt.toISOString(), istanbulTime(2026, 10, 25, 600).toISOString()); // 10:00
  // Gece 03:00'te (kapalıyken) en son biten dönem dünün 01:00–10:00'ıdır; süren dönem ise bugünün
  const night = istanbulTime(2026, 10, 26, 3 * 60);
  assert.equal(computeLastClosedPeriod(hours, night).openedAt.toISOString(), istanbulTime(2026, 10, 25, 600).toISOString());
  const relevant = computeRelevantClosedPeriod(hours, night);
  assert.equal(relevant.upcoming, true);
  assert.equal(relevant.closedAt.toISOString(), istanbulTime(2026, 10, 26, 60).toISOString());
  assert.equal(relevant.openedAt.toISOString(), istanbulTime(2026, 10, 26, 600).toISOString());
  // 23:30'da mağaza açık: ilgili dönem bugünün sabahı
  const late = computeRelevantClosedPeriod(hours, istanbulTime(2026, 10, 25, 23 * 60 + 30));
  assert.equal(late.upcoming, false);
  assert.equal(late.openedAt.toISOString(), istanbulTime(2026, 10, 25, 600).toISOString());
});

test("closed period: same-day closing, midnight closing and 24h open", () => {
  const sameDay = computeLastClosedPeriod({ startHour: 10, startMinute: 0, endHour: 22, endMinute: 0 }, istanbulTime(2026, 10, 25, 12 * 60));
  assert.equal(sameDay.closedAt.toISOString(), istanbulTime(2026, 10, 24, 22 * 60).toISOString());
  assert.equal(sameDay.openedAt.toISOString(), istanbulTime(2026, 10, 25, 600).toISOString());
  const midnight = computeLastClosedPeriod({ startHour: 9, startMinute: 30, endHour: 0, endMinute: 0 }, istanbulTime(2026, 10, 25, 12 * 60));
  assert.equal(midnight.closedAt.toISOString(), istanbulTime(2026, 10, 25, 0).toISOString());
  assert.equal(midnight.openedAt.toISOString(), istanbulTime(2026, 10, 25, 570).toISOString());
  assert.equal(computeLastClosedPeriod({ startHour: 0, startMinute: 0, endHour: 0, endMinute: 0 }, NOON), null);
  assert.equal(computeLastClosedPeriod({ startHour: 8, startMinute: 0, endHour: 8, endMinute: 0 }, NOON), null);
  // Açılıştan +5 dk ile +125 dk arası gönderim aralığı
  const period = { closedAt: istanbulTime(2026, 10, 25, 60), openedAt: istanbulTime(2026, 10, 25, 600) };
  const config = { delayMinutes: 5, windowMinutes: 120 };
  assert.equal(closedCartDue(period, config, new Date(+period.openedAt + 4 * MIN)), false);
  assert.equal(closedCartDue(period, config, new Date(+period.openedAt + 10 * MIN)), true);
  assert.equal(closedCartDue(period, config, new Date(+period.openedAt + 126 * MIN)), false);
});

test("closed cart: opening before the send window shifts the due window to the send-window start", () => {
  // Mağaza 07:00'de açılıyor, gönderim 10:00–21:30: 07:05–09:05 aralığı tamamen sessiz saatlerde kalırdı
  const period = { closedAt: istanbulTime(2026, 10, 25, 60), openedAt: istanbulTime(2026, 10, 25, 7 * 60) };
  const config = { delayMinutes: 5, windowMinutes: 120 };
  const window = { start: "10:00", end: "21:30" };
  const at = (h, m) => istanbulTime(2026, 10, 25, h * 60 + m);
  assert.equal(closedCartDueStart(period, config, window).toISOString(), at(10, 0).toISOString());
  assert.equal(closedCartDue(period, config, at(7, 10), window), false);
  assert.equal(closedCartDue(period, config, at(9, 50), window), false);
  assert.equal(closedCartDue(period, config, at(10, 0), window), true);
  assert.equal(closedCartDue(period, config, at(12, 0), window), true);
  assert.equal(closedCartDue(period, config, at(12, 1), window), false);
  // Her 10 dakikalık turdan en az biri hem gönderim saatinde hem gönderim aralığında
  let dueTicks = 0;
  for (let minute = 0; minute < 24 * 60; minute += 10) {
    const now = at(0, minute);
    if (isWithinSendWindow(window, now) && closedCartDue(period, config, now, window)) dueTicks += 1;
  }
  assert.ok(dueTicks > 0);
  // Gönderim saatinden sonra açılan mağazada aralık değişmez; window verilmezse eski davranış
  const late = { closedAt: istanbulTime(2026, 10, 25, 60), openedAt: at(11, 0) };
  assert.equal(closedCartDueStart(late, config, window).toISOString(), at(11, 5).toISOString());
  assert.equal(closedCartDue(period, config, at(7, 10)), true);
});

// ── Uygunluk kuralları ─────────────────────────────────────────────────────
test("second order: exactly one delivered order, delivered 3–14 days ago, no later order", () => {
  const cfg = { afterDays: 3, maxDays: 14 };
  const delivered = (user, daysAgo, extra = {}) => ({ _id: `o${user}${daysAgo}`, user, status: "Teslim Edildi", createdAt: new Date(+NOON - daysAgo * DAY - H), updatedAt: new Date(+NOON - daysAgo * DAY), ...extra });
  const orders = [
    delivered(id(1), 4), // uygun
    delivered(id(2), 4), { user: id(2), status: "Hazırlanıyor", createdAt: NOON }, // sonradan sipariş var
    delivered(id(3), 2), // çok yeni
    delivered(id(4), 30), // çok eski
    { user: id(5), status: "Yolda", createdAt: new Date(+NOON - 5 * DAY) }, // teslim edilmemiş
    delivered(id(6), 5), { user: id(6), status: "İptal Edildi", createdAt: NOON }, // iptal sayılmaz
    // Durum geçmişindeki teslim zamanı esas alınır (güncelleme zamanı değil)
    delivered(id(7), 10, { updatedAt: new Date(+NOON - DAY), statusHistory: [{ status: "Teslim Edildi", changedAt: new Date(+NOON - 6 * DAY) }] }),
  ];
  const picked = pickSecondOrderCandidates(orders, cfg, NOON).map((c) => c.userId).sort();
  assert.deepEqual(picked, [id(1), id(6), id(7)]);
  assert.equal(pickSecondOrderCandidates(orders, cfg, NOON)[0].refKey, "lifetime");
  assert.equal(deliveredAtOf({ statusHistory: [{ status: "Teslim Edildi", changedAt: "2026-10-01T10:00:00Z" }], updatedAt: NOON }).toISOString(), "2026-10-01T10:00:00.000Z");
});

test("win-back: inactivity window, cooldown between sends and max sends per quiet period", () => {
  const cfg = { afterDays: 21, maxDays: 180, cooldownDays: 30, maxSends: 2 };
  const row = (n, daysAgo, status = "Teslim Edildi") => ({ _id: id(n), last: { _id: `o${n}`, status, createdAt: new Date(+NOON - daysAgo * DAY - H), updatedAt: new Date(+NOON - daysAgo * DAY) } });
  const rows = [row(1, 25), row(2, 10), row(3, 200), row(4, 25, "Hazırlanıyor"), row(5, 70), row(6, 100), row(7, 90)];
  const logs = [
    { user: id(5), sentAt: new Date(+NOON - 10 * DAY) }, // bekleme süresi dolmadı
    { user: id(6), sentAt: new Date(+NOON - 75 * DAY) }, { user: id(6), sentAt: new Date(+NOON - 40 * DAY) }, // bu dönemde 2 kez gitti
    { user: id(7), sentAt: new Date(+NOON - 200 * DAY) }, // önceki sessiz dönem: sayılmaz
  ];
  const picked = pickWinBackCandidates(rows, logs, cfg, NOON);
  assert.deepEqual(picked.map((c) => c.userId), [id(1), id(7)]);
  assert.equal(picked[0].refKey, "o1:1");
  assert.equal(picked[1].refKey, "o7:1");
  // Bir gönderim sonrası (30+ gün) ikinci gönderim n=2 olur
  const second = pickWinBackCandidates([row(8, 60)], [{ user: id(8), sentAt: new Date(+NOON - 35 * DAY) }], cfg, NOON);
  assert.equal(second[0].refKey, "o8:2");
});

test("coupon expiring: personal, unused, active coupons expiring within the window; soonest per user", () => {
  const cfg = { hoursBefore: 24 };
  const coupon = (n, user, hoursLeft, extra = {}) => ({
    _id: `c${n}`, code: `KOD${n}`, userId: user, isActive: true, discountType: "percentage", discountPercentage: 15,
    expirationDate: new Date(+NOON + hoursLeft * H), createdAt: new Date(+NOON - 5 * DAY), usedBy: [], usageCount: 0, usageLimit: 1, userUsageLimit: 1, ...extra,
  });
  const coupons = [
    coupon(1, id(1), 20),
    coupon(2, id(1), 5, { discountType: "fixed", discountAmount: 50 }), // aynı müşteri, daha yakın
    coupon(3, id(2), 30), // pencere dışında
    coupon(4, id(3), 10, { usedBy: [{ user: id(3) }], usageCount: 1 }), // kullanılmış
    coupon(5, null, 10), // genel kupon
    coupon(6, id(4), 10, { createdAt: new Date(+NOON - 2 * H) }), // yeni tanımlanmış
    coupon(7, id(5), -1), // süresi dolmuş
    coupon(8, id(6), 10, { usageLimit: null, userUsageLimit: 2, usedBy: [{ user: id(6) }] }), // bir hakkı daha var
  ];
  const picked = pickCouponExpiryCandidates(coupons, cfg, NOON);
  assert.deepEqual(picked.map((c) => c.userId).sort(), [id(1), id(6)]);
  const first = picked.find((c) => c.userId === id(1));
  assert.equal(first.refKey, "coupon:c2");
  assert.deepEqual(first.vars, { kupon: "KOD2", indirim: "50 TL", saat: 5 });
});

test("coupon expiring: coupons the owner can no longer use in the app are skipped before picking the soonest", () => {
  const cfg = { hoursBefore: 24 };
  const coupon = (n, user, hoursLeft, extra = {}) => ({
    _id: `c${n}`, code: `KOD${n}`, userId: user, isActive: true, discountType: "percentage", discountPercentage: 10,
    expirationDate: new Date(+NOON + hoursLeft * H), createdAt: new Date(+NOON - 6 * DAY), usedBy: [], usageCount: 0, usageLimit: 1, userUsageLimit: 1, ...extra,
  });
  const context = {
    orderedUserIds: new Set([id(1), id(3)]),
    userCreatedAt: new Map([[id(4), new Date(+NOON - 40 * DAY)], [id(5), new Date(+NOON - 3 * DAY)]]),
    canOrderToAddress: (userId) => userId === id(7),
  };
  const coupons = [
    // id1: siparişi var → ilk siparişe özel HOSGELDIN kuponu atlanır
    coupon(1, id(1), 5, { firstOrderOnly: true }),
    // id2: siparişi yok → ilk siparişe özel kupon hâlâ hatırlatılır
    coupon(2, id(2), 5, { firstOrderOnly: true }),
    // id3: daha yakın biten kullanılamaz kupon, sonra biten kullanılabilir kuponu gizlemez
    coupon(3, id(3), 3, { firstOrderOnly: true }),
    coupon(4, id(3), 20),
    // id4: 40 gün önce üye → yeni üyelere özel (30 gün) kupon atlanır; id5: 3 gün önce üye → uygun
    coupon(5, id(4), 5, { newUsersOnly: true }),
    coupon(6, id(5), 5, { newUsersOnly: true, newUserDays: 7 }),
    // id6: adrese sipariş veremez → yalnızca adres bölgelerine özel kupon atlanır; id7 verebilir → uygun
    coupon(7, id(6), 5, { deliveryZones: ["merkez"] }),
    coupon(8, id(7), 5, { deliveryZones: ["merkez"] }),
    // id8: yurt hedefli kupon adrese sipariş izni gerektirmez
    coupon(9, id(8), 5, { deliveryPoints: ["girlsDorm"] }),
    // id9: yalnızca web kanalı → uygulamada kullanılamaz; id10: android dahil → uygun
    coupon(10, id(9), 5, { channels: ["web"] }),
    coupon(11, id(10), 5, { channels: ["web", "android"] }),
  ];
  const picked = pickCouponExpiryCandidates(coupons, cfg, NOON, context);
  assert.deepEqual(picked.map((c) => c.userId).sort(), [id(10), id(2), id(3), id(5), id(7), id(8)].sort());
  assert.equal(picked.find((c) => c.userId === id(3)).refKey, "coupon:c4");
  // Bağlam yüklenmemişse kısıtlı kupon gönderilmez (doğrulanamayan kupon için "son saatler" denmez)
  assert.equal(isCouponUsableByOwner(coupon(1, id(2), 5, { firstOrderOnly: true }), id(2), {}, NOON), false);
  assert.equal(isCouponUsableByOwner(coupon(1, id(2), 5), id(2), {}, NOON), true);
});

test("coupon expiring candidates load orders only for first-order coupons; any order (even cancelled) counts", async (t) => {
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => null }));
  let selected = "";
  t.mock.method(Coupon, "find", () => ({
    select(fields) { selected = fields; return this; },
    limit() { return this; },
    lean: async () => [1, 2].map((n) => ({
      _id: `c${n}`, code: `HOSGELDIN${n}`, userId: id(n), isActive: true, firstOrderOnly: true, discountType: "percentage", discountPercentage: 10,
      expirationDate: new Date(+NOON + 5 * H), createdAt: new Date(+NOON - 6 * DAY), usedBy: [], usageCount: 0, usageLimit: 1, userUsageLimit: 1,
    })),
  }));
  let orderFilter;
  t.mock.method(Order, "distinct", async (field, filter) => { orderFilter = { field, filter }; return [id(1)]; });
  t.mock.method(AutomationLog, "distinct", async () => []);
  t.mock.method(User, "find", (filter) => chain(filter._id.$in.map((userId) => reachableUser(Number(userId.slice(-3))))));
  const preview = await previewAutomation("couponExpiry", { now: NOON });
  assert.equal(preview.count, 1);
  for (const field of ["firstOrderOnly", "newUsersOnly", "newUserDays", "deliveryZones", "deliveryPoints", "channels"]) assert.match(selected, new RegExp(`\\b${field}\\b`));
  assert.equal(orderFilter.field, "user");
  assert.deepEqual(orderFilter.filter, { user: { $in: [id(1), id(2)] } });
});

test("closed-hours cart: cart built while closed, sellable items, no recent cart reminder", () => {
  const period = { closedAt: istanbulTime(2026, 10, 25, 60), openedAt: istanbulTime(2026, 10, 25, 600) };
  const now = new Date(+period.openedAt + 10 * MIN);
  const product = (name, extra = {}) => ({ _id: name, name, isHidden: false, isOutOfStock: false, ...extra });
  const user = (n, updatedAt, items, extra = {}) => ({ _id: id(n), cartLastUpdated: updatedAt, cartItems: items, ...extra });
  const users = [
    user(1, new Date(+period.closedAt + H), [{ product: product("Süt"), quantity: 2 }, { product: product("Ekmek") }, { product: product("Çay") }]),
    user(2, new Date(+period.closedAt - H), [{ product: product("Süt") }]), // kapanmadan önce
    user(3, new Date(+period.openedAt + MIN), [{ product: product("Süt") }]), // açıldıktan sonra
    user(4, new Date(+period.closedAt + H), [{ product: product("Süt", { isOutOfStock: true }) }]), // satışta ürün yok
    user(5, new Date(+period.closedAt + H), [{ product: product("Süt") }], { cartReminderSentAt: new Date(+now - 3 * H) }), // yakında hatırlatma gitti
    user(6, new Date(+period.closedAt + H), [{ product: product("Süt") }], { cartReminderSentAt: new Date(+now - 20 * H) }),
  ];
  const picked = pickClosedCartCandidates(users, period, now);
  assert.deepEqual(picked.map((c) => c.userId), [id(1), id(6)]);
  assert.equal(picked[0].refKey, `open:${period.openedAt.toISOString()}`);
  assert.deepEqual(picked[0].vars, { adet: 4, urun: "Süt, Ekmek ve 1 ürün daha" });
  assert.deepEqual(pickClosedCartCandidates(users, null, now), []);
});

test("reachability: preferences, admins, push target, 24h cap and this-tick exclusions", async (t) => {
  assert.equal(isReachableUser(reachableUser(1)), true);
  assert.equal(isReachableUser(reachableUser(1, { role: "admin" })), false);
  assert.equal(isReachableUser(reachableUser(1, { pushNotificationsEnabled: false })), false);
  assert.equal(isReachableUser(reachableUser(1, { notificationPreferences: { campaigns: false } })), false);
  assert.equal(isReachableUser(reachableUser(1, { appActivity: { lastSeenAt: null } })), false);
  assert.equal(isReachableUser(reachableUser(1, { appActivity: {}, fcmToken: "tok" })), true);

  let userFilter;
  let capFilter;
  // Sorgu filtreye uymayanları da döndürse bile JS kontrolü eler
  t.mock.method(User, "find", (filter) => {
    userFilter = filter;
    return chain([reachableUser(1), reachableUser(2, { notificationPreferences: { campaigns: false } }), reachableUser(3, { role: "admin" }), reachableUser(4), reachableUser(5)]);
  });
  t.mock.method(AutomationLog, "distinct", async (_field, filter) => { capFilter = filter; return [id(4)]; });
  const settings = settingsWith();
  const candidates = [1, 2, 3, 4, 5, 6].map((n) => ({ userId: id(n), refKey: "x" }));
  const out = await filterReachableCandidates(candidates, settings, NOON, new Set([id(5)]));
  assert.deepEqual(out.map((c) => c.userId), [id(1)]);
  assert.equal(out[0].vars.ad, "Müşteri1");
  assert.deepEqual(userFilter.pushNotificationsEnabled, { $ne: false });
  assert.deepEqual(userFilter["notificationPreferences.campaigns"], { $ne: false });
  assert.deepEqual(userFilter.role, { $ne: "admin" });
  assert.ok(Array.isArray(userFilter.$or));
  assert.equal(capFilter.sentAt.$gte.toISOString(), new Date(+NOON - 24 * H).toISOString());
  assert.deepEqual(capFilter.status, { $in: ["pending", "sent"] });
  assert.ok(!userFilter._id.$in.includes(id(5)));
});

// ── Gönderim ───────────────────────────────────────────────────────────────
test("delivery claims a unique log first: a duplicate claim sends nothing", async (t) => {
  t.mock.method(AutomationLog, "create", async () => { const error = new Error("E11000 duplicate key"); error.code = 11000; throw error; });
  let sent = 0;
  const result = await deliverAutomation("secondOrder", { userId: id(1), refKey: "lifetime", vars: { ad: "Ali" } }, settingsWith(), NOON, { send: async () => { sent += 1; return { sent: true }; } });
  assert.deepEqual(result, { status: "duplicate" });
  assert.equal(sent, 0);
});

test("delivery with a coupon: creates the personal coupon, sends and records; closed-cart marks the cart reminder", async (t) => {
  const updates = [];
  t.mock.method(AutomationLog, "create", async (doc) => ({ _id: "log1", ...doc }));
  t.mock.method(AutomationLog, "updateOne", async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 }; });
  let couponCall;
  t.mock.method(Coupon, "findOneAndUpdate", (filter, update, options) => {
    couponCall = { filter, update, options };
    return { lean: async () => ({ _id: "cp1", code: filter.code, userId: id(1) }) };
  });
  const settings = settingsWith({ secondOrder: { body: "Sana özel {indirim} kupon: {kupon}, {gun} gün geçerli", coupon: { enabled: true, type: "percentage", value: 10, validDays: 7, minOrderAmount: 200 } } });
  const sends = [];
  const send = async (ids, message, data, options) => { sends.push({ ids, message, data, options }); return { sent: true, targeted: 1 }; };
  const result = await deliverAutomation("secondOrder", { userId: id(1), refKey: "lifetime", vars: { ad: "Ali" } }, settings, NOON, { send });
  assert.equal(result.status, "sent");
  const code = automationCouponCode("secondOrder", id(1), "lifetime");
  assert.match(code, /^IKINCI[0-9A-F]{7}$/);
  assert.equal(couponCall.filter.code, code);
  assert.equal(couponCall.update.$setOnInsert.userId, id(1));
  assert.equal(couponCall.update.$setOnInsert.discountPercentage, 10);
  assert.equal(couponCall.update.$setOnInsert.minimumOrderAmount, 200);
  assert.equal(couponCall.update.$setOnInsert.usageLimit, 1);
  assert.equal(couponCall.update.$set.expirationDate.toISOString(), new Date(+NOON + 7 * DAY).toISOString());
  assert.equal(couponCall.options.upsert, true);
  assert.equal(sends[0].message.body, `Sana özel %10 kupon: ${code}, 7 gün geçerli`);
  assert.equal(sends[0].options.category, "campaigns");
  assert.equal(sends[0].data.route, "/home");
  assert.equal(updates[0].update.$set.status, "sent");
  assert.equal(updates[0].update.$set.couponCode, code);

  // Açıldık bildirimi: sepet hatırlatması aynı sepet için ayrıca gitmesin
  let userUpdate;
  t.mock.method(User, "updateOne", async (filter, update) => { userUpdate = { filter, update }; return {}; });
  const closed = await deliverAutomation("closedCart", { userId: id(2), refKey: "open:x", vars: { ad: "Ece", adet: 2 } }, settingsWith(), NOON, { send });
  assert.equal(closed.status, "sent");
  assert.equal(userUpdate.update.$set.cartReminderSentAt.toISOString(), NOON.toISOString());
  assert.equal(sends[1].data.route, "/cart");
  assert.equal(sends[1].message.title, "Açıldık, sepetin hazır 🛒");
});

test("delivery failures: service errors are retried later, unreachable customers are recorded; coupon is deactivated", async (t) => {
  const deleted = [];
  const updates = [];
  const couponUpdates = [];
  t.mock.method(AutomationLog, "create", async (doc) => ({ _id: "log2", ...doc }));
  t.mock.method(AutomationLog, "deleteOne", async (filter) => { deleted.push(filter); return {}; });
  t.mock.method(AutomationLog, "updateOne", async (_f, update) => { updates.push(update); return {}; });
  t.mock.method(Coupon, "findOneAndUpdate", (filter) => ({ lean: async () => ({ _id: "cp2", code: filter.code, userId: id(1) }) }));
  t.mock.method(Coupon, "updateOne", async (filter, update) => { couponUpdates.push({ filter, update }); return {}; });
  const settings = settingsWith({ winBack: { coupon: { enabled: true, type: "fixed", value: 30, validDays: 5, minOrderAmount: 0 } } });
  const candidate = { userId: id(1), refKey: "o1:1", vars: { ad: "Ali" } };

  const network = await deliverAutomation("winBack", candidate, settings, NOON, { send: async () => ({ sent: false, reason: "network" }) });
  assert.deepEqual(network, { status: "retry", reason: "network" });
  assert.deepEqual(deleted, [{ _id: "log2" }]);
  assert.deepEqual(couponUpdates[0].update, { $set: { isActive: false } });

  const noDevice = await deliverAutomation("winBack", candidate, settings, NOON, { send: async () => ({ sent: false, reason: "no_devices", targeted: 1 }) });
  assert.deepEqual(noDevice, { status: "failed", reason: "no_devices" });
  assert.equal(updates.at(-1).$set.status, "failed");
  assert.equal(updates.at(-1).$set.pushResult.reason, "no_devices");
  assert.equal(couponUpdates.length, 2);

  const optedOut = await deliverAutomation("winBack", candidate, settingsWith(), NOON, { send: async () => ({ sent: false, reason: null, targeted: 0 }) });
  assert.equal(optedOut.reason, "opted_out");

  // Sunucu/veritabanı hatası (push servisi reason "error" döner): müşteri suçu değil, kayıt silinir ve yeniden denenir
  deleted.length = 0;
  const serverError = await deliverAutomation("winBack", candidate, settings, NOON, { send: async () => ({ sent: false, reason: "error", targeted: 0 }) });
  assert.deepEqual(serverError, { status: "retry", reason: "error" });
  assert.deepEqual(deleted, [{ _id: "log2" }]);
  assert.deepEqual(couponUpdates.at(-1).update, { $set: { isActive: false } });
});

test("delivery: a DB error after the push went out keeps the log and the coupon (no duplicate push next tick)", async (t) => {
  const deleted = [];
  const couponUpdates = [];
  t.mock.method(console, "error", () => {});
  t.mock.method(AutomationLog, "create", async (doc) => ({ _id: "log3", ...doc }));
  t.mock.method(AutomationLog, "deleteOne", async (filter) => { deleted.push(filter); return {}; });
  t.mock.method(AutomationLog, "updateOne", async () => { throw new Error("Mongo bağlantısı koptu"); });
  t.mock.method(Coupon, "findOneAndUpdate", (filter) => ({ lean: async () => ({ _id: "cp3", code: filter.code, userId: id(1) }) }));
  t.mock.method(Coupon, "updateOne", async (filter, update) => { couponUpdates.push({ filter, update }); return {}; });
  t.mock.method(User, "updateOne", async () => { throw new Error("Mongo bağlantısı koptu"); });
  const settings = settingsWith({ secondOrder: { coupon: { enabled: true, type: "percentage", value: 10, validDays: 7, minOrderAmount: 0 } } });
  const send = async () => ({ sent: true, targeted: 1 });

  const result = await deliverAutomation("secondOrder", { userId: id(1), refKey: "lifetime", vars: { ad: "Ali" } }, settings, NOON, { send });
  assert.deepEqual(result, { status: "sent" });
  assert.equal(deleted.length, 0);
  assert.equal(couponUpdates.length, 0);

  const closed = await deliverAutomation("closedCart", { userId: id(2), refKey: "open:x", vars: { ad: "Ece", adet: 2 } }, settingsWith(), NOON, { send });
  assert.deepEqual(closed, { status: "sent" });
  assert.equal(deleted.length, 0);
});

test("coupon helper refuses a code owned by another customer", async (t) => {
  t.mock.method(Coupon, "findOneAndUpdate", () => ({ lean: async () => ({ _id: "cp", code: "X", userId: id(9) }) }));
  await assert.rejects(() => ensureAutomationCoupon("winBack", id(1), "o1:1", { type: "percentage", value: 10, validDays: 7, minOrderAmount: 0 }, NOON), /CONFLICT/);
  assert.notEqual(automationCouponCode("winBack", id(1), "o1:1"), automationCouponCode("winBack", id(1), "o1:2"));
});

// ── Tur ────────────────────────────────────────────────────────────────────
const mockSettings = (t, stored) => t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => stored }));

test("tick skips when everything is off, outside the send window or without push keys", async (t) => {
  mockSettings(t, null);
  assert.equal((await runAutomationTick({ now: NOON, configured: true })).skipped, "disabled");
  mockSettings(t, { secondOrder: { enabled: true } });
  assert.equal((await runAutomationTick({ now: NOON, configured: false })).skipped, "not_configured");
  const night = istanbulTime(2026, 10, 25, 22 * 60);
  assert.equal((await runAutomationTick({ now: night, configured: true })).skipped, "quiet_hours");
});

test("tick sends second-order and win-back once each, one push per customer per tick, never throws", async (t) => {
  mockSettings(t, { secondOrder: { enabled: true, maxDays: 30 }, winBack: { enabled: true }, couponExpiry: { enabled: true } });
  const deliveredDaysAgo = (user, days) => ({ _id: `o-${user}`, user, status: "Teslim Edildi", createdAt: new Date(+NOON - days * DAY - H), updatedAt: new Date(+NOON - days * DAY) });
  // secondOrder: id1 (4 gün), id2 (25 gün, maxDays 30 → hem ikinci sipariş hem geri kazanma adayı)
  t.mock.method(Order, "find", (filter) => chain(filter.status === "Teslim Edildi" ? [{ user: id(1) }, { user: id(2) }] : [deliveredDaysAgo(id(1), 4), deliveredDaysAgo(id(2), 25)]));
  t.mock.method(Order, "aggregate", async () => [
    { _id: id(2), last: deliveredDaysAgo(id(2), 25) },
    { _id: id(3), last: deliveredDaysAgo(id(3), 40) },
  ]);
  t.mock.method(Coupon, "find", () => { throw new Error("veritabanı yok"); }); // bir otomasyonun hatası diğerlerini durdurmaz
  t.mock.method(console, "error", () => {});
  t.mock.method(AutomationLog, "distinct", async () => []);
  t.mock.method(AutomationLog, "find", () => chain([]));
  t.mock.method(User, "find", (filter) => chain(filter._id.$in.map((userId) => reachableUser(Number(userId.slice(-3))))));
  const created = [];
  t.mock.method(AutomationLog, "create", async (doc) => { created.push(doc); return { _id: `log${created.length}`, ...doc }; });
  t.mock.method(AutomationLog, "updateOne", async () => ({}));
  const sends = [];
  const result = await runAutomationTick({ now: NOON, configured: true, send: async (ids, message, data) => { sends.push({ ids, message, data }); return { sent: true, targeted: 1 }; } });
  assert.equal(result.skipped, null);
  assert.match(result.types.couponExpiry.error, /veritabanı yok/);
  assert.equal(result.types.secondOrder.sent, 2);
  // id2 bu turda ikinci sipariş bildirimini aldı; geri kazanma yalnızca id3'e gider
  assert.equal(result.types.winBack.sent, 1);
  assert.deepEqual(created.map((doc) => `${doc.type}:${doc.user}`), [`secondOrder:${id(1)}`, `secondOrder:${id(2)}`, `winBack:${id(3)}`]);
  assert.equal(sends[0].message.title, "İlk siparişin nasıldı, Müşteri1? 🛒");
  assert.equal(sends[0].data.automation, "secondOrder");
});

test("preview counts reachable customers and shows three sample names without sending", async (t) => {
  mockSettings(t, null);
  t.mock.method(Coupon, "find", () => chain([1, 2, 3, 4].map((n) => ({
    _id: `c${n}`, code: `K${n}`, userId: id(n), isActive: true, discountType: "percentage", discountPercentage: 10,
    expirationDate: new Date(+NOON + 5 * H), createdAt: new Date(+NOON - 3 * DAY), usedBy: [], usageCount: 0, usageLimit: 1, userUsageLimit: 1,
  }))));
  t.mock.method(AutomationLog, "distinct", async () => []);
  t.mock.method(User, "find", (filter) => chain(filter._id.$in.map((userId) => reachableUser(Number(userId.slice(-3))))));
  let created = 0;
  t.mock.method(AutomationLog, "create", async () => { created += 1; return {}; });
  const preview = await previewAutomation("couponExpiry", { now: NOON });
  assert.equal(preview.count, 4);
  assert.equal(preview.samples.length, 3);
  assert.equal(preview.enabled, false);
  assert.equal(preview.inWindow, true);
  assert.equal(created, 0);
  // Kaydedilmemiş ayar (ör. 2 saat kala) önizlemede kullanılır
  const narrow = await previewAutomation("couponExpiry", { now: NOON, override: { hoursBefore: 2 } });
  assert.equal(narrow.count, 0);
  await assert.rejects(() => previewAutomation("couponExpiry", { now: NOON, override: { hoursBefore: 500 } }), /2–72/);
});

test("closed-cart preview while the store is closed counts carts for the coming opening", async (t) => {
  mockSettings(t, null);
  t.mock.method(Settings, "getSettings", async () => ({ orderStartHour: 10, orderStartMinute: 0, orderEndHour: 1, orderEndMinute: 0 }));
  const night = istanbulTime(2026, 10, 26, 3 * 60);
  let userFilter;
  t.mock.method(User, "find", (filter) => {
    if (filter["cartItems.0"]) {
      userFilter = filter;
      return chain([{ _id: id(1), cartLastUpdated: new Date(+night - 30 * MIN), cartItems: [{ product: { name: "Su", isHidden: false, isOutOfStock: false } }] }]);
    }
    return chain([reachableUser(1)]);
  });
  t.mock.method(AutomationLog, "distinct", async () => []);
  const preview = await previewAutomation("closedCart", { now: night });
  assert.equal(preview.count, 1);
  assert.equal(userFilter.cartLastUpdated.$gte.toISOString(), istanbulTime(2026, 10, 26, 60).toISOString());
  assert.equal(userFilter.cartLastUpdated.$lt.toISOString(), night.toISOString());
  assert.match(preview.notes.join(" "), /şu an kapalı/);
});

// ── Kilit ──────────────────────────────────────────────────────────────────
const fakeRedis = ({ connected = true, setReply = "OK" } = {}) => {
  const store = new Map();
  const calls = [];
  return {
    connected, store, calls,
    async set(key, value, ...args) { calls.push(["set", key, ...args]); if (typeof setReply === "function") return setReply(); if (setReply === "OK") store.set(key, value); return setReply; },
    async get(key) { return store.get(key) ?? null; },
    async del(key) { calls.push(["del", key]); return store.delete(key) ? 1 : 0; },
  };
};

test("lock: Redis NX lets one process run; release only removes its own token", async () => {
  const client = fakeRedis();
  const lock = await acquireAutomationLock(client, {});
  assert.equal(lock.ok, true);
  assert.equal(lock.mode, "redis");
  assert.deepEqual(client.calls[0].slice(1), [LOCK_KEY, "EX", 540, "NX"]);
  client.store.set(LOCK_KEY, "someone-else");
  await lock.release();
  assert.equal(client.store.get(LOCK_KEY), "someone-else");

  const busy = await acquireAutomationLock(fakeRedis({ setReply: null }), {});
  assert.deepEqual([busy.ok, busy.reason], [false, "locked"]);
  // Redis bağlı değilse: yalnızca ilk PM2 süreci çalışır
  assert.equal((await acquireAutomationLock(fakeRedis({ connected: false }), { NODE_APP_INSTANCE: "1" })).ok, false);
  assert.equal((await acquireAutomationLock(fakeRedis({ connected: false }), { NODE_APP_INSTANCE: "0" })).ok, true);
  assert.equal((await acquireAutomationLock(undefined, {})).mode, "local");
  // Redis hata verirse de aynı yerel kurala düşer
  const broken = await acquireAutomationLock(fakeRedis({ setReply: () => { throw new Error("down"); } }), { NODE_APP_INSTANCE: "2" });
  assert.deepEqual([broken.ok, broken.reason], [false, "not_primary"]);
});

test("locked tick: skipped when another process holds the lock; releases its own lock after running", async (t) => {
  const busy = await runAutomationTickLocked({ now: NOON, client: fakeRedis({ setReply: null }), env: {} });
  assert.equal(busy.skipped, "locked");
  mockSettings(t, null);
  const client = fakeRedis();
  const result = await runAutomationTickLocked({ now: NOON, client, env: {}, configured: true });
  assert.equal(result.skipped, "disabled");
  assert.equal(client.store.has(LOCK_KEY), false);
  // Ayarlar okunamazsa da hata fırlatmaz
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => { throw new Error("db down"); } }));
  t.mock.method(console, "error", () => {});
  const failed = await runAutomationTickLocked({ now: NOON, client: fakeRedis(), env: {}, configured: true });
  assert.equal(failed.error, "db down");
});

// ── İstatistik ─────────────────────────────────────────────────────────────
test("attribution: orders within 72h count for the latest automated push before them", () => {
  const logs = [
    { _id: "a", user: id(1), sentAt: new Date(+NOON - 5 * DAY) },
    { _id: "b", user: id(1), sentAt: new Date(+NOON - 2 * DAY) },
    { _id: "c", user: id(2), sentAt: new Date(+NOON - 10 * DAY) },
  ];
  const orders = [
    { user: id(1), createdAt: new Date(+NOON - 4 * DAY), totalAmount: 100 }, // a
    { user: id(1), createdAt: new Date(+NOON - 1 * DAY), totalAmount: 60 }, // b (son dokunuş)
    { user: id(2), createdAt: new Date(+NOON - 6 * DAY), totalAmount: 80 }, // 72 saati geçti
    { user: id(3), createdAt: NOON, totalAmount: 50 },
  ];
  const result = attributeConversions(logs, orders);
  assert.deepEqual(result.get("a"), { orders: 1, revenue: 100 });
  assert.deepEqual(result.get("b"), { orders: 1, revenue: 60 });
  assert.equal(result.has("c"), false);
});

test("stats: sent and conversions for the last 7 and 30 days per automation", async (t) => {
  t.mock.method(AutomationLog, "find", () => chain([
    { _id: "l1", user: id(1), type: "winBack", status: "sent", sentAt: new Date(+NOON - 2 * DAY) },
    { _id: "l2", user: id(2), type: "winBack", status: "sent", sentAt: new Date(+NOON - 20 * DAY) },
    { _id: "l3", user: id(3), type: "secondOrder", status: "failed", sentAt: new Date(+NOON - DAY) },
  ]));
  let orderFilter;
  t.mock.method(Order, "find", (filter) => { orderFilter = filter; return chain([
    { user: id(1), createdAt: new Date(+NOON - DAY), totalAmount: 120.5 },
    { user: id(2), createdAt: new Date(+NOON - 19 * DAY), totalAmount: 80 },
  ]); });
  const stats = await getAutomationStats(NOON);
  assert.deepEqual(orderFilter.status, { $ne: "İptal Edildi" });
  assert.equal(stats.types.winBack.sent7, 1);
  assert.equal(stats.types.winBack.sent30, 2);
  assert.equal(stats.types.winBack.conversions7, 1);
  assert.equal(stats.types.winBack.conversions30, 2);
  assert.equal(stats.types.winBack.revenue30, 200.5);
  assert.equal(stats.types.secondOrder.failed30, 1);
  assert.equal(stats.totals.sent30, 2);
  assert.equal(stats.attributionHours, 72);
});

// ── Uç noktalar ────────────────────────────────────────────────────────────
test("settings endpoint validates input and writes an audit record for changes", async (t) => {
  mockSettings(t, null);
  let saved;
  t.mock.method(AutomationSettings, "findOneAndUpdate", async (_f, update) => { saved = update.$set; return update.$set; });
  const audits = [];
  t.mock.method(AdminAudit, "create", async (doc) => { audits.push(doc); return doc; });
  const req = { user: { _id: id(99), role: "admin" }, method: "PUT", originalUrl: "/api/notification-automations/settings", body: { winBack: { enabled: true } } };
  const res = response();
  await updateSettings(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.settings.winBack.enabled, true);
  assert.equal(saved.winBack.enabled, true);
  assert.equal(audits[0].action, "Otomatik bildirim açıldı");
  assert.equal(audits[0].category, "campaign");
  assert.equal(audits[0].targetName, "Geri kazanma");

  const bad = response();
  await updateSettings({ ...req, body: { winBack: { cooldownDays: 1 } } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.match(bad.body.message, /7–180/);

  const unknown = response();
  await previewType({ ...req, params: { type: "spam" }, body: {} }, unknown);
  assert.equal(unknown.statusCode, 400);
});

// ── Test alıcısı ───────────────────────────────────────────────────────────
const STORE = { _id: id(70), name: "Benim Marketim", email: "benimmarketim@gmail.com", phone: "05550000000", role: "customer", appActivity: { lastSeenAt: new Date("2026-10-20T10:00:00Z") }, fcmToken: "secret-fcm" };
const OWNER = { _id: id(71), name: "Jüpiter Yönetici", email: "jupiterryhd@gmail.com", role: "admin" };
const withPushKeys = (t) => {
  const previous = { key: process.env.ONESIGNAL_REST_API_KEY, app: process.env.ONESIGNAL_APP_ID };
  process.env.ONESIGNAL_REST_API_KEY = "test-only";
  process.env.ONESIGNAL_APP_ID = "app-test";
  t.after(() => {
    if (previous.key === undefined) delete process.env.ONESIGNAL_REST_API_KEY; else process.env.ONESIGNAL_REST_API_KEY = previous.key;
    if (previous.app === undefined) delete process.env.ONESIGNAL_APP_ID; else process.env.ONESIGNAL_APP_ID = previous.app;
  });
};
// User.findById(id).select().lean() → kimliğe göre tablodan
const mockUsersById = (t, users) => t.mock.method(User, "findById", (userId) => chain(users.find((user) => String(user._id) === String(userId)) || null));

test("test recipient: id is stored lower-case, validated, cleared with null and listed as a change", () => {
  const current = normalizeAutomationSettings({});
  assert.equal(current.testRecipientId, null);
  assert.equal(normalizeAutomationSettings({ testRecipientId: "nope" }).testRecipientId, null);
  const set = validateAutomationSettingsInput({ testRecipientId: id(70).toUpperCase() }, current);
  assert.equal(set.data.testRecipientId, id(70));
  assert.deepEqual(set.changes, [{ label: TEST_RECIPIENT_LABEL, from: "Giriş yapan yönetici", to: id(70) }]);
  // Başka bir alanın kaydı alıcıyı korur
  const other = validateAutomationSettingsInput({ winBack: { enabled: true } }, set.data);
  assert.equal(other.data.testRecipientId, id(70));
  assert.equal(other.changes.some((change) => change.label === TEST_RECIPIENT_LABEL), false);
  assert.equal(validateAutomationSettingsInput({ testRecipientId: null }, set.data).data.testRecipientId, null);
  assert.equal(validateAutomationSettingsInput({ testRecipientId: "" }, set.data).data.testRecipientId, null);
  for (const bad of ["123", "zzzzzzzzzzzzzzzzzzzzzzzz", 42, { $ne: null }, [id(70)]]) {
    assert.match(validateAutomationSettingsInput({ testRecipientId: bad }, current).error, /Test alıcısı geçersiz/);
  }
});

test("test recipient summary: push target heuristic, label, no device token leaked", () => {
  assert.equal(hasPushTarget(STORE), true);
  assert.equal(hasPushTarget({ fcmToken: "  " }), false);
  assert.equal(hasPushTarget({ fcmToken: "tok" }), true);
  assert.equal(hasPushTarget(OWNER), false);
  const summary = toTestRecipient({ ...STORE, notificationPreferences: { campaigns: false } });
  assert.deepEqual(summary, { _id: id(70), name: "Benim Marketim", email: "benimmarketim@gmail.com", phone: "05550000000", role: "customer", hasPushTarget: true, pushEnabled: true, campaignsEnabled: false });
  assert.doesNotMatch(JSON.stringify(summary), /secret-fcm/);
  assert.equal(toTestRecipient(null), null);
  assert.equal(recipientLabel(STORE), "Benim Marketim (benimmarketim@gmail.com)");
  assert.equal(recipientLabel({ phone: "0555" }), "0555");
});

test("test recipient resolution: chosen account > saved recipient > requesting admin", async (t) => {
  const other = { ...STORE, _id: id(72), name: "Ayşe", email: "ayse@example.com" };
  const findById = mockUsersById(t, [STORE, other]);
  const saved = settingsWith({ testRecipientId: id(70) });
  // İstekte seçilen hesap kayıtlı alıcının önüne geçer
  let resolved = await resolveTestRecipient({ recipientId: id(72), requester: OWNER, settings: saved });
  assert.equal(resolved.source, "request");
  assert.equal(resolved.user.email, "ayse@example.com");
  resolved = await resolveTestRecipient({ requester: OWNER, settings: saved });
  assert.equal(resolved.source, "saved");
  assert.equal(resolved.user.email, "benimmarketim@gmail.com");
  resolved = await resolveTestRecipient({ requester: OWNER, settings: settingsWith({}) });
  assert.equal(resolved.source, "self");
  assert.equal(resolved.user, OWNER);
  // Kayıtlı alıcı yöneticinin kendisiyse sorgu yapılmaz
  const calls = findById.mock.callCount();
  resolved = await resolveTestRecipient({ requester: OWNER, settings: settingsWith({ testRecipientId: id(71) }) });
  assert.equal(resolved.source, "self");
  assert.equal(findById.mock.callCount(), calls);
  // Kayıtlı alıcı silinmişse isteyen yöneticiye düşer
  resolved = await resolveTestRecipient({ requester: OWNER, settings: settingsWith({ testRecipientId: id(79) }) });
  assert.equal(resolved.source, "self");
  // Ayar verilmezse veritabanından okunur
  mockSettings(t, { testRecipientId: id(70) });
  assert.equal((await resolveTestRecipient({ requester: OWNER })).source, "saved");
  // Geçersiz ya da bulunamayan seçim açıkça reddedilir
  await assert.rejects(resolveTestRecipient({ recipientId: "abc", requester: OWNER, settings: saved }), (error) => error.status === 400 && /geçersiz/.test(error.message));
  await assert.rejects(resolveTestRecipient({ recipientId: { $ne: null }, requester: OWNER, settings: saved }), (error) => error.status === 400);
  await assert.rejects(resolveTestRecipient({ recipientId: id(79), requester: OWNER, settings: saved }), (error) => error.status === 404 && /bulunamadı/.test(error.message));
});

test("automation test: recipient's first name, campaign preference skipped, disabled pushes not sent", async (t) => {
  mockSettings(t, null);
  const sends = [];
  const send = async (ids, message, data, options) => { sends.push({ ids, message, data, options }); return { targeted: 1, sent: true, reason: null, detail: "", unreachable: 0 }; };
  const result = await sendAutomationTest("closedCart", { ...STORE, notificationPreferences: { campaigns: false } }, { send });
  assert.equal(result.sent, true);
  assert.deepEqual(sends[0].ids, [id(70)]);
  assert.match(sends[0].message.body, /Benim!/); // {ad} → alıcının adı
  assert.deepEqual(sends[0].options, { category: "campaigns", respectCategory: false });
  assert.equal(sends[0].data.type, "automation_test");
  // Hesapta bildirimler tamamen kapalı: gönderilmez, nedeni açıkça döner
  const off = await sendAutomationTest("secondOrder", { ...STORE, pushNotificationsEnabled: false }, { send, settings: settingsWith({}) });
  assert.equal(off.sent, false);
  assert.equal(off.reason, "push_disabled");
  assert.match(off.message.title, /Benim/);
  assert.equal(sends.length, 1);
});

test("test send messages name the receiving account", () => {
  const store = { ...STORE };
  assert.deepEqual(describeTestSend({ sent: true }, store), { status: 200, success: true, message: "Test bildirimi Benim Marketim (benimmarketim@gmail.com) hesabının telefonuna gönderildi" });
  assert.match(describeTestSend({ sent: true }, { ...store, notificationPreferences: { campaigns: false } }).message, /kampanya bildirimleri kapalı; test yine de gönderildi/);
  const none = describeTestSend({ sent: false, reason: "no_devices" }, store);
  assert.equal(none.status, 422);
  assert.equal(none.reason, "no_devices");
  assert.match(none.message, /Benim Marketim \(benimmarketim@gmail\.com\) hesabıyla mobil uygulamada oturum açılmamış ya da bildirim izni verilmemiş/);
  const disabled = describeTestSend({ sent: false, reason: "push_disabled" }, store);
  assert.equal(disabled.status, 422);
  assert.match(disabled.message, /Benim Marketim \(benimmarketim@gmail\.com\) hesabında bildirimler kapalı/);
  assert.match(describeTestSend({ sent: false, reason: null }, store).message, /bildirim almaya izin vermiyor/);
  assert.equal(describeTestSend({ sent: false, reason: "error" }, store).status, 500);
  assert.equal(describeTestSend({ sent: false, reason: "network" }, store).status, 502);
  assert.equal(describeTestSend({ sent: false, reason: "auth" }, store, { systemMessage: "Anahtar reddedildi" }).message, "Anahtar reddedildi");
});

test("settings endpoint returns the saved test recipient with its push readiness", async (t) => {
  mockSettings(t, { testRecipientId: id(70) });
  mockUsersById(t, [STORE]);
  let res = response();
  await getSettings({ user: OWNER }, res);
  assert.equal(res.body.settings.testRecipientId, id(70));
  assert.deepEqual(res.body.testRecipient, { _id: id(70), name: "Benim Marketim", email: "benimmarketim@gmail.com", phone: "05550000000", role: "customer", hasPushTarget: true, pushEnabled: true, campaignsEnabled: true });
  assert.equal(res.body.testRecipientMissing, false);
  assert.equal(res.body.testRecipientSelf.email, "jupiterryhd@gmail.com");
  assert.equal(res.body.testRecipientSelf.hasPushTarget, false);
  // Kayıtlı hesap silinmiş: alıcı yok, panel uyarır
  AutomationSettings.findOne.mock.mockImplementation(() => ({ lean: async () => ({ testRecipientId: id(79) }) }));
  res = response();
  await getSettings({ user: OWNER }, res);
  assert.equal(res.body.testRecipient, null);
  assert.equal(res.body.testRecipientMissing, true);
  AutomationSettings.findOne.mock.mockImplementation(() => ({ lean: async () => null }));
  res = response();
  await getSettings({ user: OWNER }, res);
  assert.equal(res.body.testRecipient, null);
  assert.equal(res.body.testRecipientMissing, false);
});

test("settings endpoint saves, validates and audits the test recipient", async (t) => {
  let stored = null;
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => stored }));
  const saves = [];
  t.mock.method(AutomationSettings, "findOneAndUpdate", async (_f, update) => { saves.push(update.$set); stored = update.$set; return update.$set; });
  const audits = [];
  t.mock.method(AdminAudit, "create", async (doc) => { audits.push(doc); return doc; });
  mockUsersById(t, [STORE]);
  const req = (body) => ({ user: OWNER, method: "PUT", originalUrl: "/api/notification-automations/settings", body });

  let res = response();
  await updateSettings(req({ testRecipientId: id(70) }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saves.at(-1).testRecipientId, id(70));
  assert.equal(res.body.testRecipient.email, "benimmarketim@gmail.com");
  assert.equal(res.body.testRecipient.hasPushTarget, true);
  assert.equal(audits.at(-1).action, "Test bildirimi alıcısı değiştirildi");
  assert.deepEqual(audits.at(-1).changes, [{ label: TEST_RECIPIENT_LABEL, from: "Giriş yapan yönetici", to: "Benim Marketim (benimmarketim@gmail.com)" }]);

  // Var olmayan hesap ve bozuk kimlik kaydedilmez
  const before = saves.length;
  res = response();
  await updateSettings(req({ testRecipientId: id(79) }), res);
  assert.equal(res.statusCode, 404);
  res = response();
  await updateSettings(req({ testRecipientId: "benimmarketim@gmail.com" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(saves.length, before);

  // Kart kaydı alıcıyı korur ve yanıtta alıcı dönmez
  res = response();
  await updateSettings(req({ winBack: { enabled: true } }), res);
  assert.equal(saves.at(-1).testRecipientId, id(70));
  assert.equal("testRecipient" in res.body, false);

  // "Kendim": null → isteyen yönetici
  res = response();
  await updateSettings(req({ testRecipientId: null }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saves.at(-1).testRecipientId, null);
  assert.equal(res.body.testRecipient, null);
  assert.equal(res.body.testRecipientSelf.email, "jupiterryhd@gmail.com");
  assert.deepEqual(audits.at(-1).changes, [{ label: TEST_RECIPIENT_LABEL, from: "Benim Marketim (benimmarketim@gmail.com)", to: "Giriş yapan yönetici" }]);
});

test("test endpoint sends to the saved recipient, names it, and rate-limits per requesting admin", async (t) => {
  withPushKeys(t);
  mockSettings(t, { testRecipientId: id(70) });
  const people = [STORE, { ...STORE, _id: id(73), name: "Ali Veli", email: "ali@example.com", pushNotificationsEnabled: false }];
  mockUsersById(t, people);
  const filters = [];
  t.mock.method(User, "find", (filter) => { filters.push(filter); return chain(filter._id.$in.map((value) => ({ _id: value }))); });
  const pushes = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (_url, options) => { pushes.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ id: "n1" }) }; });
  const audits = [];
  t.mock.method(AdminAudit, "create", async (doc) => { audits.push(doc); return doc; });
  const admin = (n) => ({ _id: id(n), name: `Yönetici${n}`, email: `y${n}@example.com`, role: "admin" });
  const call = async (user, body = {}) => {
    const res = response();
    await testType({ user, params: { type: "secondOrder" }, body, method: "POST", originalUrl: "/api/notification-automations/secondOrder/test" }, res);
    return res;
  };

  let res = await call(admin(80));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Test bildirimi Benim Marketim (benimmarketim@gmail.com) hesabının telefonuna gönderildi");
  assert.equal(res.body.recipient.email, "benimmarketim@gmail.com");
  assert.deepEqual(pushes[0].include_aliases.external_id, [id(70)]);
  assert.match(pushes[0].headings.tr, /Benim/);
  assert.equal(filters[0]["notificationPreferences.campaigns"], undefined); // test: kampanya tercihi atlanır
  assert.deepEqual(filters[0].pushNotificationsEnabled, { $ne: false });
  assert.deepEqual(audits.at(-1).changes[0], { label: "Alıcı", from: "—", to: "Benim Marketim (benimmarketim@gmail.com)" });

  // Sıklık sınırı isteyen yönetici başına: aynı yönetici beklemeli, başka yönetici hemen gönderebilir
  assert.equal((await call(admin(80), { recipientId: id(73) })).statusCode, 429);
  // Seçilen hesapta bildirimler kapalı: gönderilmez ve açıkça söylenir
  res = await call(admin(81), { recipientId: id(73) });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.reason, "push_disabled");
  assert.match(res.body.message, /Ali Veli \(ali@example\.com\) hesabında bildirimler kapalı/);
  assert.equal(pushes.length, 1);

  // Geçersiz / bulunamayan seçim: 400 / 404 ve sıklık sınırı harcanmaz
  assert.equal((await call(admin(82), { recipientId: "x" })).statusCode, 400);
  assert.equal((await call(admin(82), { recipientId: id(79) })).statusCode, 404);
  // Kayıtlı cihaz yok: mesaj hesabı adıyla söyler
  fetchMock.mock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ id: "", errors: { invalid_aliases: { external_id: [id(70)] } } }) }));
  res = await call(admin(82));
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.reason, "no_devices");
  assert.match(res.body.message, /Benim Marketim \(benimmarketim@gmail\.com\) hesabıyla mobil uygulamada oturum açılmamış ya da bildirim izni verilmemiş/);
});
