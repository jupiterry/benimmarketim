// Müşteri 360: profil zaman çizelgesi (GET /users/:id/profile → timeline, openIssues), "daha fazla" sayfası (?before=),
// personelin iç notu ve işaretleri (PATCH /users/:userId/staff-note), müşteri listesi satırı ve Mesajlar müşteri kartı.
// Veritabanı yok: her sorgu taklit edilir (taklit edilmeyen sorgu ~10 sn bekler; testler hızlı kalmalı).
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import Feedback from "../models/feedback.model.js";
import Coupon from "../models/coupon.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import Referral from "../models/referral.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import userRoutes from "../routes/userRoutes.js";
import { getChatContext } from "../controllers/chat.controller.js";
import { getAllUsers, toListUser } from "../controllers/userController.js";
import {
  TIMELINE_ORDER_LIMIT, TIMELINE_PAGE_SIZE, TIMELINE_SOURCE_LIMIT, buildOpenIssues, buildTimelineEvents, cleanStaffNoteText,
  couponSourceOf, couponStateOf, deliveryFailureSummary, getCustomerProfile, getUserInfo, isFeedbackAnswered, isLowFeedback,
  paginateTimeline, parseStaffNoteBody, parseTimelineBefore, staffNoteView, updateStaffNote,
} from "../controllers/user.controller.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-02T18:00:00Z"); // İstanbul 21:00
const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const USER_ID = "507f191e810c19729de8a001";
const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin", name: "Deniz Yönetici" };
const OTHER_ADMIN = "507f191e810c19729de860eb";
const ORDER = (n) => hex("6ac8bc", n);
const CHAT = (n) => hex("c4a7", n);
const REQ = (n) => hex("5e", n);
const FB = (n) => hex("fb", n);
const CPN = (n) => hex("c0", n);
const at = (offset) => new Date(NOW - offset);
const names = new Map([[ADMIN._id, ADMIN.name], [OTHER_ADMIN, "Ali Kurye"]]);

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
/** find/findOne/findById zinciri; çağrı bilgisi record'a yazılır */
const chain = (result, record = {}) => {
  const c = {
    select(arg) { record.select = arg; return c; },
    sort(arg) { record.sort = arg; return c; },
    limit(arg) { record.limit = arg; return c; },
    populate(...args) { record.populate = args; return c; },
    lean: async () => (typeof result === "function" ? result(record) : result),
  };
  return c;
};
const order = (n, fields = {}) => ({
  _id: ORDER(n),
  user: USER_ID,
  status: "Hazırlanıyor",
  totalAmount: 150,
  createdAt: at(n * HOUR),
  updatedAt: at(n * HOUR),
  products: [{ quantity: 2 }, { quantity: 1 }],
  deliveryPoint: "girlsDorm",
  deliveryZone: { id: "girlsDorm", name: "Kız KYK Yurdu", type: "dorm" },
  statusHistory: [],
  ...fields,
});
const byType = (events, type) => events.filter((event) => event.type === type);
const one = (events, type) => {
  const found = byType(events, type);
  assert.equal(found.length, 1, `${type} olayı bir kez olmalı`);
  return found[0];
};

// ── Siparişler ─────────────────────────────────────────────────────
test("timeline: order placed shows code, total, zone, payment, items and coupon; delivered uses the status history time", () => {
  const deliveredAt = at(1 * HOUR);
  const events = buildTimelineEvents({
    orders: [order(2, {
      status: "Teslim Edildi", paymentMethod: "cash", couponCode: "hos10", couponDiscount: 15,
      statusHistory: [{ status: "Yolda", changedAt: at(90 * MIN) }, { status: "Teslim Edildi", changedAt: deliveredAt, changedBy: ADMIN._id }],
    })],
  }, { userId: USER_ID, names, now: NOW });
  const placed = one(events, "order_placed");
  assert.equal(placed.title, `Sipariş verdi · #${ORDER(2).slice(-6).toUpperCase()}`);
  assert.match(placed.detail, /₺150,00/);
  assert.match(placed.detail, /Kız KYK Yurdu/);
  assert.match(placed.detail, /Kapıda nakit/);
  assert.match(placed.detail, /3 ürün/);
  assert.match(placed.detail, /Kupon HOS10/);
  assert.equal(placed.group, "orders");
  assert.deepEqual(placed.ref, { kind: "order", id: ORDER(2) });
  assert.equal(placed.at, NOW - 2 * HOUR);
  const delivered = one(events, "order_delivered");
  assert.equal(delivered.at, deliveredAt.getTime());
  assert.equal(delivered.tone, "ok");
  const used = one(events, "coupon_used");
  assert.equal(used.group, "coupons");
  assert.equal(used.title, "Kupon kullandı · HOS10");
  assert.match(used.detail, /−₺15,00/);
  assert.deepEqual(used.ref, { kind: "order", id: ORDER(2) });
});

test("timeline: cancellation says who cancelled and why; a cancelled order's coupon is not counted as used", () => {
  const events = buildTimelineEvents({
    orders: [
      order(3, {
        status: "İptal Edildi", couponCode: "HOS10", couponDiscount: 10,
        cancelReason: { code: "fikir", note: "yanlış   adres" },
        statusHistory: [{ status: "İptal Edildi", changedAt: at(170 * MIN), changedBy: USER_ID }],
      }),
      order(4, { status: "İptal Edildi", statusHistory: [{ status: "İptal Edildi", changedAt: at(230 * MIN), changedBy: ADMIN._id }] }),
      order(5, { status: "İptal Edildi", statusHistory: [] }),
    ],
  }, { userId: USER_ID, names, now: NOW });
  const cancels = byType(events, "order_cancelled");
  const [customer, staff, unknown] = [ORDER(3), ORDER(4), ORDER(5)].map((id) => cancels.find((event) => event.ref.id === id));
  assert.match(customer.title, /^Müşteri iptal etti · #/);
  assert.match(customer.detail, /Neden: Fikrimi değiştirdim \(yanlış adres\)/);
  assert.equal(customer.at, NOW - 170 * MIN);
  assert.equal(customer.by, "customer");
  assert.match(staff.title, /^Panelden iptal edildi · #/);
  assert.match(staff.detail, /Deniz Yönetici/);
  assert.equal(staff.by, "staff");
  assert.match(unknown.title, /^İptal edildi · #/);
  assert.equal(byType(events, "coupon_used").length, 0, "iptalde kupon iade edilir");
});

test("timeline: delivery failure shows the reason and who marked it; first-order callback confirmation is an event", () => {
  const events = buildTimelineEvents({
    orders: [
      order(6, {
        status: "İptal Edildi",
        deliveryOutcome: { code: "cevap_yok", label: "Müşteriye ulaşılamadı", note: "3 kez arandı", at: at(5 * HOUR), by: OTHER_ADMIN },
        statusHistory: [{ status: "İptal Edildi", changedAt: at(5 * HOUR), changedBy: OTHER_ADMIN }],
      }),
      order(8, {
        status: "Yolda", needsCallback: true, callbackConfirmedAt: at(7 * HOUR + 50 * MIN), callbackConfirmedBy: ADMIN._id,
        deliveryPoint: "address", deliveryZone: { id: "devrek", name: "Devrek", type: "district" }, deliveryAddress: { neighborhood: "Cumhuriyet Mah." },
        paymentMethod: "card",
      }),
    ],
  }, { userId: USER_ID, names, now: NOW });
  const failed = one(events, "delivery_failed");
  assert.match(failed.title, /^Teslim edilemedi · #/);
  assert.match(failed.detail, /^Müşteriye ulaşılamadı: 3 kez arandı · Ali Kurye/);
  assert.equal(failed.tone, "danger");
  assert.equal(byType(events, "order_cancelled").length, 0, "teslim edilemedi ayrı olaydır, iptal olarak tekrar yazılmaz");
  const confirmed = one(events, "callback_confirmed");
  assert.equal(confirmed.at, NOW - 7 * HOUR - 50 * MIN);
  assert.match(confirmed.detail, /Deniz Yönetici/);
  const placed = byType(events, "order_placed").find((event) => event.ref.id === ORDER(8));
  assert.match(placed.detail, /Devrek, Cumhuriyet Mah\./);
  assert.match(placed.detail, /Kapıda kart \(POS\)/);
});

test("timeline: an order without status history uses its last change only within the order day; a staff cancel hides an older customer reason", () => {
  const events = buildTimelineEvents({
    orders: [
      order(48, { status: "Teslim Edildi", statusHistory: undefined, updatedAt: at(46 * HOUR) }),
      order(240, { status: "Teslim Edildi", statusHistory: undefined, updatedAt: at(HOUR) }),
      order(5, {
        status: "İptal Edildi", cancelReason: { code: "fikir", note: "eski neden" },
        statusHistory: [
          { status: "İptal Edildi", changedAt: at(4 * HOUR), changedBy: USER_ID },
          { status: "Hazırlanıyor", changedAt: at(3 * HOUR), changedBy: ADMIN._id },
          { status: "İptal Edildi", changedAt: at(2 * HOUR), changedBy: ADMIN._id },
        ],
      }),
    ],
  }, { userId: USER_ID, names, now: NOW });
  const delivered = byType(events, "order_delivered");
  assert.equal(delivered.find((event) => event.ref.id === ORDER(48)).at, NOW - 46 * HOUR);
  assert.equal(delivered.find((event) => event.ref.id === ORDER(240)).at, NOW - 240 * HOUR, "sonradan yapılan güncelleme eski siparişi bugüne taşımaz");
  const cancelled = one(events, "order_cancelled");
  assert.match(cancelled.title, /^Panelden iptal edildi/);
  assert.equal(cancelled.at, NOW - 2 * HOUR, "son iptal kaydı");
  assert.doesNotMatch(cancelled.detail, /Neden|eski neden/, "geri alınmış müşteri iptalinin nedeni personel iptaline yazılmaz");
});

// ── Sohbet ve destek ───────────────────────────────────────────────
test("timeline: chat started / handed to human / closed; the support close time is used and the agent is named", () => {
  const events = buildTimelineEvents({
    chats: [
      { _id: CHAT(1), type: "general", status: "active", createdAt: at(10 * HOUR), updatedAt: at(9 * HOUR) },
      { _id: CHAT(2), type: "order", order: ORDER(2), status: "closed", createdAt: at(20 * HOUR), updatedAt: at(1 * HOUR) },
    ],
    supportRequests: [
      { _id: REQ(1), conversation: CHAT(2), status: "closed", reason: "Ürün eksik geldi, iade istiyor", priority: "high", assignedTo: ADMIN._id, createdAt: at(19 * HOUR), closedAt: at(18 * HOUR) },
      { _id: REQ(2), conversation: CHAT(1), status: "waiting", reason: "Canlı destek istedi", priority: "normal", createdAt: at(9 * HOUR + 30 * MIN) },
      { _id: REQ(3), conversation: CHAT(3), status: "in_progress", reason: "Kurye gecikti", assignedTo: OTHER_ADMIN, createdAt: at(30 * HOUR) },
    ],
  }, { userId: USER_ID, names, now: NOW });
  const started = byType(events, "chat_started");
  assert.equal(started.length, 2);
  const orderChat = started.find((event) => event.ref.id === CHAT(2));
  assert.equal(orderChat.title, "Sipariş için sohbet başlattı");
  assert.equal(orderChat.snippetChat, CHAT(2), "müşterinin ilk mesajı sayfalamadan sonra eklenir");
  const closed = one(events, "chat_closed");
  assert.equal(closed.at, NOW - 18 * HOUR, "kapanış: destek talebinin closedAt zamanı (sohbetin son değişikliği değil)");
  const handoffs = byType(events, "chat_handoff");
  assert.equal(handoffs.length, 3);
  const [closedHandoff, waiting, inProgress] = [REQ(1), REQ(2), REQ(3)].map((id) => handoffs.find((event) => event.id === `chat_handoff:${id}`));
  assert.match(closedHandoff.detail, /^Yüksek öncelik · Ürün eksik geldi, iade istiyor · Kapandı$/);
  assert.deepEqual(closedHandoff.ref, { kind: "chat", id: CHAT(2) });
  assert.equal(waiting.tone, "warn");
  assert.match(waiting.detail, /Temsilci bekliyor/);
  assert.match(inProgress.detail, /Ali Kurye ilgileniyor/);
  assert.equal(new Set(events.map((event) => event.id)).size, events.length, "olay kimlikleri tekildir");
});

// ── Geri bildirim ──────────────────────────────────────────────────
test("low rating detection: 1–3 stars, thumbs down, problem items, NPS 0–6 and complaint category; abandon never", () => {
  assert.equal(isLowFeedback({ kind: "order", rating: 3 }), true);
  assert.equal(isLowFeedback({ kind: "order", rating: 4 }), false);
  assert.equal(isLowFeedback({ kind: "quick", thumb: "down" }), true);
  assert.equal(isLowFeedback({ kind: "quick", thumb: "up" }), false);
  assert.equal(isLowFeedback({ kind: "quick", thumb: "up", problemItems: [{ name: "Süt", issue: "bozuk" }] }), true);
  assert.equal(isLowFeedback({ kind: "nps", npsScore: 6 }), true);
  assert.equal(isLowFeedback({ kind: "nps", npsScore: 7 }), false);
  assert.equal(isLowFeedback({ kind: "nps", npsScore: null }), false, "puansız NPS kaydı düşük sayılmaz");
  assert.equal(isLowFeedback({ kind: "general", category: "Şikayet", rating: 5 }), true);
  assert.equal(isLowFeedback({ kind: "general", ratings: { usability: 2, overall: 2 } }), true, "eski çoklu puanın ortalaması");
  assert.equal(isLowFeedback({ kind: "abandon", reason: "fiyat" }), false);
  assert.equal(isFeedbackAnswered({ adminReply: { text: "  " } }), false);
  assert.equal(isFeedbackAnswered({ adminReply: { text: "Özür dileriz" } }), true);
  assert.equal(isFeedbackAnswered({ compensation: { code: "TELAFI1A2B3C" } }), true);
  assert.equal(isFeedbackAnswered({ status: "Çözüldü" }), true);
});

test("timeline: feedback event shows score, comment snippet and whether it was answered; low ones are marked", () => {
  const events = buildTimelineEvents({
    feedbacks: [
      { _id: FB(1), kind: "order", milestone: 1, rating: 2, message: "Ekmek bayattı,\n\nsüt ezikti", problemItems: [{ name: "Süt", issue: "bozuk" }], status: "Yeni", createdAt: at(2 * DAY) },
      { _id: FB(2), kind: "quick", thumb: "up", message: "Siparişten memnun kaldı", createdAt: at(3 * DAY) },
      { _id: FB(3), kind: "nps", npsScore: 4, message: "Tavsiye puanı: 4/10", adminReply: { text: "Teşekkürler" }, compensation: { code: "TELAFI1A2B3C", amount: 50 }, createdAt: at(4 * DAY) },
      { _id: FB(4), kind: "abandon", reason: "fiyat", message: "Fiyatlar yüksek", createdAt: at(5 * DAY) },
    ],
  }, { userId: USER_ID, names, now: NOW });
  const [low, happy, nps, abandon] = [1, 2, 3, 4].map((n) => events.find((event) => event.ref.id === FB(n)));
  assert.equal(low.title, "1. sipariş anketi · 2/5");
  assert.equal(low.low, true);
  assert.equal(low.tone, "danger");
  assert.match(low.detail, /“Ekmek bayattı, süt ezikti”/);
  assert.match(low.detail, /Sorunlu ürün: Süt \(bozuk \/ ezik\)/);
  assert.match(low.detail, /Yanıt bekliyor$/);
  assert.deepEqual(low.ref, { kind: "feedback", id: FB(1) });
  assert.equal(happy.title, "Siparişten memnun kaldı");
  assert.equal(happy.detail, "", "hazır metin yorum sayılmaz");
  assert.equal(happy.tone, "ok");
  assert.equal(nps.title, "Tavsiye puanı · 4/10");
  assert.match(nps.detail, /Yanıtlandı, Telafi ₺50,00/);
  assert.equal(abandon.title, "Sepetten vazgeçti · Fiyatlar yüksek");
  assert.equal(abandon.low, false);
  assert.ok(events.every((event) => event.group === "feedback"));
});

// ── Kuponlar ───────────────────────────────────────────────────────
test("personal coupon source comes from the code the system generated; unknown codes are 'manual'", () => {
  assert.equal(couponSourceOf({ code: "TELAFI1A2B3C" }), "compensation");
  assert.equal(couponSourceOf({ code: "GOREV0A1B2C3D4E" }), "mission");
  assert.equal(couponSourceOf({ code: "HOSGELDINABC123" }), "referral");
  assert.equal(couponSourceOf({ code: "TESEKKUR9F8E7D" }), "referral");
  assert.equal(couponSourceOf({ code: "IKINCI1234ABC" }), "automation");
  assert.equal(couponSourceOf({ code: "DONUS1234ABC" }), "automation");
  assert.equal(couponSourceOf({ code: "OTO1234ABC" }), "automation");
  assert.equal(couponSourceOf({ code: "TOP0123456789AB" }), "campaign");
  assert.equal(couponSourceOf({ code: "TOPLU10" }), "manual", "yöneticinin seçtiği benzer kod yanlış sınıflanmaz");
  assert.equal(couponSourceOf({ code: "OZEL50", description: "Kupon süresi doluyor (otomatik bildirim)" }), "automation");
  assert.equal(couponSourceOf({ code: "DAVET1", isReferralCoupon: true }), "referral");
  assert.equal(couponSourceOf({ code: "VIP2026" }), "manual");
});

test("coupon state: used (with order), inactive, expired, available; expiry text uses Istanbul calendar days", () => {
  const base = { code: "TELAFI1A2B3C", isActive: true, expirationDate: new Date(NOW + 2 * DAY), usedBy: [] };
  assert.deepEqual(
    couponStateOf({ ...base, usedBy: [{ user: USER_ID, usedAt: at(HOUR), orderId: ORDER(1) }] }, USER_ID, NOW),
    { state: "used", expiresAt: NOW + 2 * DAY, usedAt: NOW - HOUR, orderId: ORDER(1) },
  );
  assert.equal(couponStateOf({ ...base, usedBy: [{ user: OTHER_ADMIN }] }, USER_ID, NOW).state, "available", "başkasının kullanımı sayılmaz");
  assert.equal(couponStateOf({ ...base, isActive: false }, USER_ID, NOW).state, "inactive");
  assert.equal(couponStateOf({ ...base, expirationDate: at(MIN) }, USER_ID, NOW).state, "expired");

  // 21:00 İstanbul'da: gece 01:00'de biten kupon "yarın", 23:59'da biten "bugün" biter
  const events = buildTimelineEvents({
    coupons: [
      { ...base, _id: CPN(1), code: "GOREV0A1B2C3D4E", discountType: "fixed", discountAmount: 25, minimumOrderAmount: 100, expirationDate: new Date(NOW + 4 * HOUR), createdAt: at(DAY) },
      { ...base, _id: CPN(2), discountType: "percentage", discountPercentage: 7.5, maximumDiscount: 40, expirationDate: new Date(NOW + 2 * HOUR + 59 * MIN), createdAt: at(2 * DAY) },
      { ...base, _id: CPN(3), code: "TOP0123456789AB", usedBy: [{ user: USER_ID, orderId: ORDER(9) }], createdAt: at(3 * DAY) },
      { ...base, _id: CPN(4), code: "VIP2026", expirationDate: at(DAY), createdAt: at(9 * DAY) },
    ],
  }, { userId: USER_ID, names, now: NOW });
  const [mission, percent, used, expired] = [1, 2, 3, 4].map((n) => events.find((event) => event.ref.id === CPN(n)));
  assert.equal(mission.title, "Kupon tanımlandı · GOREV0A1B2C3D4E");
  assert.equal(mission.detail, "Görev ödülü · ₺25,00 · ₺100,00 üzeri · Kullanılmadı, yarın bitiyor (bitiş 3 Kas 01:00)");
  assert.equal(mission.source, "mission");
  assert.equal(mission.tone, "brand");
  assert.match(percent.detail, /%7,5 \(en çok ₺40,00\)/);
  assert.match(percent.detail, /bugün bitiyor \(bitiş 2 Kas 23:59\)$/);
  assert.match(used.detail, new RegExp(`Kullanıldı \\(#${ORDER(9).slice(-6).toUpperCase()}\\)$`));
  assert.equal(used.tone, "ok");
  assert.match(expired.detail, /^Özel kupon · .* · Süresi doldu \(1 Kas\)$/);
  assert.ok(events.every((event) => event.type === "coupon_granted" && event.group === "coupons"));
});

// ── Sayfalama ──────────────────────────────────────────────────────
const fakeEvents = (count, { step = MIN, start = NOW } = {}) =>
  Array.from({ length: count }, (_, i) => ({ id: `e${String(i).padStart(4, "0")}`, type: "feedback", at: start - Math.floor(i / 1) * step }));

test("pagination: newest first, ~60 per page, walking 'daha fazla' returns every event exactly once", () => {
  const events = fakeEvents(150);
  const seen = [];
  let before = null;
  let guard = 0;
  do {
    const page = paginateTimeline(events, { before });
    assert.ok(page.events.length <= TIMELINE_PAGE_SIZE);
    for (let i = 1; i < page.events.length; i += 1) assert.ok(page.events[i - 1].at >= page.events[i].at, "yeniden eskiye");
    seen.push(...page.events.map((event) => event.id));
    before = page.hasMore ? page.nextBefore : null;
    guard += 1;
  } while (before !== null && guard < 10);
  assert.equal(guard, 3);
  assert.equal(seen.length, 150);
  assert.equal(new Set(seen).size, 150);
});

test("pagination: events at the same moment are never split across pages", () => {
  // 58 tekil + aynı anda 5 olay (59.–63.) + 10 eski
  const events = [
    ...fakeEvents(58),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `tie${i}`, type: "order_placed", at: NOW - 100 * MIN })),
    ...fakeEvents(10, { start: NOW - 200 * MIN }).map((event) => ({ ...event, id: `old${event.id}` })),
  ];
  const first = paginateTimeline(events);
  assert.equal(first.events.length, 63, "sınırdaki aynı zamanlı olaylar sayfada kalır");
  assert.equal(first.hasMore, true);
  assert.equal(first.nextBefore, NOW - 100 * MIN);
  const second = paginateTimeline(events, { before: first.nextBefore });
  assert.equal(second.events.length, 10);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextBefore, null);
});

test("pagination: a capped source sets a horizon; older (possibly incomplete) events wait for the next page", () => {
  const events = fakeEvents(20, { step: HOUR });
  const horizon = NOW - 10 * HOUR;
  const page = paginateTimeline(events, { horizon });
  assert.equal(page.events.length, 10, "ufuk ve öncesi bu sayfada yok");
  assert.ok(page.events.every((event) => event.at > horizon));
  assert.equal(page.hasMore, true);
  assert.equal(page.nextBefore, horizon + 1, "sonraki sayfa ufuktaki olayı da kapsar");
  // İlerlemeyen sayfa sonsuz döngü yaratmaz
  const stuck = paginateTimeline(events, { before: horizon + 1, horizon });
  assert.equal(stuck.hasMore, false);
});

test("?before= accepts only a sane ISO time", () => {
  assert.equal(parseTimelineBefore("2026-11-01T10:00:00.000Z", NOW), Date.parse("2026-11-01T10:00:00.000Z"));
  assert.equal(parseTimelineBefore(["2026-11-01T10:00:00.000Z"], NOW), Date.parse("2026-11-01T10:00:00.000Z"));
  assert.equal(parseTimelineBefore("bozuk", NOW), null);
  assert.equal(parseTimelineBefore("1990-01-01T00:00:00Z", NOW), null);
  assert.equal(parseTimelineBefore("2030-01-01T00:00:00Z", NOW), null);
  assert.equal(parseTimelineBefore({ $gt: "" }, NOW), null);
  assert.equal(parseTimelineBefore("x".repeat(100), NOW), null);
});

// ── Açık konular ───────────────────────────────────────────────────
test("open issues: active order, pending callback, open support, unanswered low rating, coupon ending in 3 days, repeated delivery failures", () => {
  const failure = (n, days) => order(n, {
    status: "İptal Edildi", deliveryOutcome: { code: "adres_bulunamadi", label: "Adres bulunamadı", at: at(days * DAY) },
  });
  const sources = {
    orders: [
      order(1, { status: "Hazırlanıyor", needsCallback: true, callbackConfirmedAt: null }),
      order(2, { status: "Yolda" }),
      order(3, { status: "Teslim Edildi" }),
      failure(10, 2), failure(11, 12), failure(12, 45),
    ],
    supportRequests: [
      { _id: REQ(1), conversation: CHAT(1), status: "waiting", reason: "Siparişim gelmedi", createdAt: at(HOUR) },
      { _id: REQ(2), conversation: CHAT(2), status: "in_progress", reason: "İade", assignedTo: ADMIN._id, createdAt: at(2 * HOUR) },
      { _id: REQ(3), conversation: CHAT(3), status: "closed", reason: "Eski", createdAt: at(9 * DAY) },
    ],
    feedbacks: [
      { _id: FB(1), kind: "quick", thumb: "down", message: "Kurye kabaydı", status: "Yeni", createdAt: at(DAY) },
      { _id: FB(2), kind: "order", rating: 1, adminReply: { text: "Özür dileriz" }, createdAt: at(DAY) },
      { _id: FB(3), kind: "order", rating: 5, createdAt: at(DAY) },
    ],
    coupons: [
      { _id: CPN(1), code: "TELAFI1A2B3C", discountType: "fixed", discountAmount: 50, isActive: true, expirationDate: new Date(NOW + 2 * DAY), usedBy: [] },
      { _id: CPN(2), code: "TELAFI4D5E6F", discountType: "fixed", discountAmount: 50, isActive: true, expirationDate: new Date(NOW + 5 * DAY), usedBy: [] },
      { _id: CPN(3), code: "TELAFI7A8B9C", discountType: "fixed", discountAmount: 50, isActive: true, expirationDate: new Date(NOW + DAY), usedBy: [{ user: USER_ID }] },
    ],
  };
  const issues = buildOpenIssues(sources, { userId: USER_ID, names, now: NOW });
  const types = issues.map((issue) => issue.type);
  assert.deepEqual(types.slice(0, 3).sort(), ["delivery_failures", "open_support", "unanswered_feedback"], "kırmızılar önce");
  assert.equal(types.filter((type) => type === "active_order").length, 2);
  assert.equal(types.filter((type) => type === "pending_callback").length, 1);
  assert.equal(types.filter((type) => type === "open_support").length, 2, "kapalı talep konu değildir");
  assert.equal(types.filter((type) => type === "unanswered_feedback").length, 1, "yanıtlanan ve yüksek puan konu değildir");
  const coupons = issues.filter((issue) => issue.type === "expiring_coupon");
  assert.deepEqual(coupons.map((issue) => issue.ref.id), [CPN(1)], "yalnızca 3 gün içinde biten, kullanılmamış kupon");
  assert.match(coupons[0].detail, /Telafi · ₺50,00 · 2 gün kaldı \(bitiş 4 Kas 21:00\)/);
  const failures = issues.find((issue) => issue.type === "delivery_failures");
  assert.equal(failures.title, "Son 30 günde 2 kez teslim edilemedi");
  assert.deepEqual(failures.ref, { kind: "order", id: ORDER(10) });
  const support = issues.filter((issue) => issue.type === "open_support");
  assert.equal(support[0].title, "Destek talebi temsilci bekliyor");
  assert.match(support[1].detail, /Deniz Yönetici ilgileniyor/);
  const callback = issues.find((issue) => issue.type === "pending_callback");
  assert.deepEqual(callback.ref, { kind: "order", id: ORDER(1) });
  assert.ok(issues.every((issue) => typeof issue.id === "string" && (issue.at === null || typeof issue.at === "string")));
  assert.equal(new Set(issues.map((issue) => issue.id)).size, issues.length);
});

test("delivery failure summary counts all-time and last 30 days", () => {
  const summary = deliveryFailureSummary([
    order(1, { status: "İptal Edildi", deliveryOutcome: { code: "reddetti", at: at(3 * DAY) } }),
    order(2, { status: "İptal Edildi", deliveryOutcome: { code: "cevap_yok", label: "Müşteriye ulaşılamadı", at: at(40 * DAY) } }),
    order(3, { status: "İptal Edildi" }),
    order(4, { status: "Teslim Edildi" }),
  ], NOW);
  assert.deepEqual(summary, { total: 2, last30Days: 1, lastAt: at(3 * DAY).toISOString(), lastLabel: "Müşteri teslim almadı", lastOrderId: ORDER(1) });
  assert.deepEqual(deliveryFailureSummary([], NOW), { total: 0, last30Days: 0, lastAt: null, lastLabel: null, lastOrderId: null });
});

// ── GET /users/:id/profile ─────────────────────────────────────────
const mockProfile = (t, { user, orders = [], chats = [], supportRequests = [], feedbacks = [], coupons = [], messages = {} } = {}) => {
  const calls = { order: [], chat: [], support: [], feedback: [], coupon: [], userFind: [], message: [] };
  t.mock.method(User, "findById", () => chain(user, (calls.userById = {})));
  t.mock.method(User, "exists", async (filter) => { calls.exists = filter; return user ? { _id: new mongoose.Types.ObjectId(USER_ID) } : null; });
  t.mock.method(User, "find", (filter) => {
    const record = { filter };
    calls.userFind.push(record);
    return chain(() => filter._id.$in.map((id) => ({ _id: id, name: names.get(String(id)) || "?" })), record);
  });
  const recorder = (list, rows) => (filter) => {
    const record = { filter };
    list.push(record);
    return chain(() => (typeof rows === "function" ? rows(filter) : rows), record);
  };
  t.mock.method(Order, "find", recorder(calls.order, orders));
  t.mock.method(Chat, "find", recorder(calls.chat, chats));
  t.mock.method(SupportRequest, "find", recorder(calls.support, supportRequests));
  t.mock.method(Feedback, "find", recorder(calls.feedback, feedbacks));
  t.mock.method(Coupon, "find", recorder(calls.coupon, coupons));
  t.mock.method(Referral, "findOne", () => chain(null));
  t.mock.method(Message, "findOne", (filter) => {
    const record = { filter };
    calls.message.push(record);
    return chain(messages[String(filter.chat)] || null, record);
  });
  return calls;
};
const profileUser = (fields = {}) => ({
  _id: new mongoose.Types.ObjectId(USER_ID), name: "Ayşe Kaya", email: "ayse@x.com", phone: "05551112233", role: "customer",
  createdAt: new Date("2026-01-10T08:00:00Z"), cartItems: [],
  staffNote: { text: "Kapı zili bozuk, kapıyı çalın.", updatedAt: at(DAY), updatedBy: new mongoose.Types.ObjectId(OTHER_ADMIN) },
  staffFlags: ["hard_address", "call_before", "eski_anahtar"],
  ...fields,
});

test("GET profile: timeline, open issues, staff note and flags; every extra source is bounded, projected and per-customer", async (t) => {
  const calls = mockProfile(t, {
    user: profileUser(),
    orders: [order(1, { status: "Yolda" }), order(30, { status: "Teslim Edildi", statusHistory: [{ status: "Teslim Edildi", changedAt: at(29 * HOUR) }] })],
    chats: [{ _id: CHAT(1), type: "general", status: "active", createdAt: at(2 * HOUR), updatedAt: at(2 * HOUR) }],
    supportRequests: [{ _id: REQ(1), conversation: CHAT(1), status: "waiting", reason: "Siparişim nerede?", createdAt: at(90 * MIN) }],
    feedbacks: [{ _id: FB(1), kind: "quick", thumb: "down", message: "Geç geldi", status: "Yeni", createdAt: at(20 * HOUR) }],
    // Uç gerçek saati kullanır: kuponun bitişi de gerçek saate göre (sabit tarih birkaç gün sonra "süresi doldu" olur)
    coupons: [{ _id: CPN(1), code: "TELAFI1A2B3C", discountType: "fixed", discountAmount: 50, isActive: true, expirationDate: new Date(Date.now() + DAY), usedBy: [], createdAt: at(10 * HOUR) }],
    messages: { [CHAT(1)]: { content: "  Merhaba,   siparişim   nerede? ", type: "text" } },
  });
  const res = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: {}, user: ADMIN }, res);
  assert.equal(res.statusCode, 200);
  const { profile } = res.body;

  // Sorgular: müşteriye ait, sınırlı, yeniden eskiye, yalnızca gereken alanlar
  assert.equal(calls.order.length, 1, "siparişler profil sorgusundan gelir (ikinci sorgu yok)");
  assert.match(calls.order[0].select, /statusHistory/);
  assert.match(calls.order[0].select, /deliveryOutcome/);
  for (const key of ["chat", "support", "feedback", "coupon"]) {
    assert.equal(calls[key].length, 1, `${key} bir kez okunur`);
    assert.equal(calls[key][0].limit, TIMELINE_SOURCE_LIMIT, `${key} sınırlı`);
    assert.deepEqual(calls[key][0].sort, { createdAt: -1 });
    assert.ok(calls[key][0].select, `${key} projeksiyonlu`);
    assert.equal("createdAt" in calls[key][0].filter, false, "ilk sayfada tarih süzgeci yok");
  }
  assert.equal(String(calls.chat[0].filter.user), USER_ID);
  assert.deepEqual(calls.chat[0].filter.isDeleted, { $ne: true }, "arşivlenen sohbetler listede de yok");
  assert.equal(String(calls.coupon[0].filter.userId), USER_ID, "yalnızca kişiye özel kuponlar");
  assert.equal(String(calls.coupon[0].select.usedBy.$elemMatch.user), USER_ID, "yalnızca bu müşterinin kullanım kaydı");
  assert.match(calls.userById.select, /\+staffNote/);
  assert.match(calls.userById.select, /-password/);
  assert.deepEqual(calls.message[0].filter, { chat: CHAT(1), sender: "user" });
  assert.deepEqual(calls.message[0].sort, { createdAt: 1 });

  // Zaman çizelgesi
  const { timeline } = profile;
  for (let i = 1; i < timeline.length; i += 1) assert.ok(timeline[i - 1].at >= timeline[i].at, "yeniden eskiye");
  assert.ok(timeline.every((event) => typeof event.at === "string" && event.id && event.group && event.title !== undefined && !("snippetChat" in event) && !("sourceId" in event)));
  assert.deepEqual(timeline.slice(0, 4).map((event) => event.type), ["order_placed", "chat_handoff", "chat_started", "coupon_granted"]);
  const started = timeline.find((event) => event.type === "chat_started");
  assert.equal(started.detail, "“Merhaba, siparişim nerede?”");
  assert.equal(profile.timelineHasMore, false);
  assert.equal(profile.timelineNextBefore, null);

  // Açık konular
  assert.deepEqual(profile.openIssues.map((issue) => issue.type), ["open_support", "unanswered_feedback", "expiring_coupon", "active_order"]);
  // İç not ve işaretler (yazan yöneticinin adı tek sorguyla)
  assert.deepEqual(profile.staffNote, { text: "Kapı zili bozuk, kapıyı çalın.", updatedAt: at(DAY).toISOString(), updatedBy: { _id: OTHER_ADMIN, name: "Ali Kurye" } });
  assert.deepEqual(profile.staffFlags, ["hard_address", "call_before"], "bilinmeyen anahtar atılır");
  assert.equal(calls.userFind.length, 1);
  assert.equal("staffNote" in profile.user, false, "profil.user yalnızca izinli alanlar");
  assert.equal(profile.deliveryFailures.total, 0);
});

test("GET profile ?before=: only the next timeline page, every source filtered to older records", async (t) => {
  const before = new Date(NOW - 5 * HOUR);
  const calls = mockProfile(t, {
    user: profileUser(),
    orders: (filter) => [order(6, { status: "Teslim Edildi", statusHistory: [{ status: "Teslim Edildi", changedAt: at(4 * HOUR) }] }), order(9)]
      .filter((row) => row.createdAt < filter.createdAt.$lt),
    feedbacks: [{ _id: FB(1), kind: "quick", thumb: "up", createdAt: at(7 * HOUR) }],
  });
  const res = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: { before: before.toISOString() }, user: ADMIN }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ["serverTime", "success", "timeline", "timelineHasMore", "timelineNextBefore"]);
  assert.equal(calls.userById, undefined, "profil yeniden hesaplanmaz");
  assert.equal(calls.order[0].limit, TIMELINE_ORDER_LIMIT);
  assert.match(calls.order[0].select, /products\.quantity/);
  assert.doesNotMatch(calls.order[0].select, /products(?!\.)/, "ürün ayrıntısı okunmaz");
  for (const key of ["order", "chat", "support", "feedback", "coupon"]) {
    assert.equal(calls[key][0].filter.createdAt.$lt.getTime(), before.getTime(), `${key} yalnızca daha eski kayıtlar`);
  }
  const types = res.body.timeline.map((event) => event.type);
  assert.deepEqual(types, ["order_placed", "feedback", "order_placed"], "sayfa sınırından sonra teslim edilen sipariş bu sayfada değil");
  assert.ok(res.body.timeline.every((event) => Date.parse(event.at) < before.getTime()));
  assert.equal(res.body.timelineHasMore, false);
});

test("GET profile ?before=: a capped source makes the page stop at its oldest record and offers more", async (t) => {
  const coupons = Array.from({ length: TIMELINE_SOURCE_LIMIT }, (_, i) => ({
    _id: CPN(i + 1), code: `VIP${i}`, discountType: "fixed", discountAmount: 10, isActive: true, expirationDate: new Date(NOW + 30 * DAY), usedBy: [], createdAt: at((i + 1) * HOUR),
  }));
  mockProfile(t, { user: profileUser(), coupons, orders: [order(100)] });
  const res = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: { before: new Date(NOW).toISOString() }, user: ADMIN }, res);
  const oldest = NOW - TIMELINE_SOURCE_LIMIT * HOUR;
  assert.equal(res.body.timeline.length, TIMELINE_SOURCE_LIMIT - 1, "ufuktaki (en eski) kupon sonraki sayfaya kalır");
  assert.ok(res.body.timeline.every((event) => Date.parse(event.at) > oldest));
  assert.equal(res.body.timelineHasMore, true);
  assert.equal(res.body.timelineNextBefore, new Date(oldest + 1).toISOString());
});

test("GET profile ?before=: when orders hit the cap, an older order's later delivery still reaches the page (its 'placed' does not)", async (t) => {
  const before = NOW;
  const start = NOW - HOUR;
  const main = Array.from({ length: TIMELINE_ORDER_LIMIT }, (_, i) => order(i + 1, { status: "Yolda", createdAt: new Date(start - i * MIN) }));
  const oldest = start - (TIMELINE_ORDER_LIMIT - 1) * MIN;
  const late = order(999, {
    status: "Teslim Edildi", createdAt: new Date(oldest - MIN),
    statusHistory: [{ status: "Teslim Edildi", changedAt: new Date(NOW - 30 * MIN) }],
  });
  const calls = mockProfile(t, { user: profileUser(), orders: (filter) => (filter.$or ? [late] : main) });
  const res = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: { before: new Date(before).toISOString() }, user: ADMIN }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.order.length, 2, "sınır dolunca geç olaylar için ikinci, daraltılmış sorgu");
  const lateFilter = calls.order[1].filter;
  assert.equal(lateFilter.createdAt.$lte.getTime(), oldest);
  assert.equal(lateFilter.$or.length, 4);
  assert.equal(String(lateFilter.user), USER_ID);
  const first = res.body.timeline[0];
  assert.equal(first.type, "order_delivered");
  assert.equal(first.ref.id, ORDER(999));
  assert.ok(!res.body.timeline.some((event) => event.id === `order_placed:${ORDER(999)}`), "ufkun gerisindeki 'verdi' bu sayfada yok");
  assert.equal(res.body.timelineHasMore, true);
});

test("GET profile: when chats hit the cap, an older chat closed recently still shows (close time from its support request)", async (t) => {
  const chats = Array.from({ length: TIMELINE_SOURCE_LIMIT }, (_, i) => ({ _id: CHAT(i + 1), type: "general", status: "active", createdAt: at((i + 1) * HOUR), updatedAt: at((i + 1) * HOUR) }));
  const lateChat = { _id: CHAT(500), type: "general", status: "closed", createdAt: at(80 * HOUR), updatedAt: at(2 * HOUR) };
  const closure = { _id: REQ(500), conversation: CHAT(500), status: "closed", reason: "Eski konu", createdAt: at(79 * HOUR), closedAt: at(2 * HOUR + 1000) };
  const calls = mockProfile(t, {
    user: profileUser({ staffNote: undefined }),
    chats: (filter) => (filter.status === "closed" ? [lateChat] : chats),
    supportRequests: (filter) => (filter.conversation ? [closure] : []),
  });
  const res = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: {}, user: ADMIN }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.chat.length, 2);
  assert.equal(calls.chat[1].filter.status, "closed");
  assert.deepEqual(calls.chat[1].filter.isDeleted, { $ne: true });
  assert.deepEqual(calls.support[1].filter.conversation.$in.map(String), [CHAT(500)]);
  const { timeline, openIssues } = res.body.profile;
  const closed = timeline.find((event) => event.type === "chat_closed");
  assert.equal(closed.ref.id, CHAT(500));
  assert.equal(closed.at, at(2 * HOUR + 1000).toISOString(), "kapanış zamanı destek talebinden (sohbetin son değişikliği değil)");
  assert.ok(!timeline.some((event) => event.type === "chat_handoff"), "yalnızca kapanış için okunan talep olay üretmez");
  assert.ok(!timeline.some((event) => event.id === `chat_started:${CHAT(500)}`), "ufkun gerisindeki başlangıç bu sayfada yok");
  assert.ok(!openIssues.some((issue) => issue.type === "open_support"));
  assert.equal(res.body.profile.timelineHasMore, true);
  assert.equal(res.body.profile.timelineNextBefore, new Date(NOW - TIMELINE_SOURCE_LIMIT * HOUR + 1).toISOString());
});

test("GET profile: bad ?before= → 400, unknown customer → 404 (both modes)", async (t) => {
  const bad = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: { before: "dün" }, user: ADMIN }, bad);
  assert.equal(bad.statusCode, 400);
  mockProfile(t, { user: null });
  const missingPage = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: { before: new Date(NOW).toISOString() }, user: ADMIN }, missingPage);
  assert.equal(missingPage.statusCode, 404);
  const missing = response();
  await getCustomerProfile({ params: { id: USER_ID }, query: {}, user: ADMIN }, missing);
  assert.equal(missing.statusCode, 404);
});

// ── PATCH /users/:userId/staff-note ────────────────────────────────
const staffReq = (body, userId = USER_ID) => ({
  params: { userId }, body, user: ADMIN, method: "PATCH", originalUrl: `/api/users/${userId}/staff-note`,
});
const mockStaffNote = (t, { current, updated = undefined, latest = undefined } = {}) => {
  const calls = { update: [], audit: [], findById: 0 };
  t.mock.method(User, "findById", () => {
    calls.findById += 1;
    return chain(calls.findById === 1 ? current : latest === undefined ? current : latest);
  });
  t.mock.method(User, "findOneAndUpdate", (filter, update, options) => {
    const record = { filter, update, options };
    calls.update.push(record);
    if (updated instanceof Error) return { select: () => ({ lean: async () => { throw updated; } }) };
    return chain(updated === undefined ? null : typeof updated === "function" ? updated(update) : updated, record);
  });
  t.mock.method(User, "find", (filter) => chain(filter._id.$in.map((id) => ({ _id: id, name: names.get(String(id)) || "?" }))));
  t.mock.method(AdminAudit, "create", async (doc) => { calls.audit.push(doc); return doc; });
  return calls;
};
const applyUpdate = (base) => (update) => {
  const next = { ...base, ...(update.$set || {}) };
  for (const key of Object.keys(update.$unset || {})) delete next[key];
  return next;
};

test("staff note: saving cleans the text, records who and when, never writes the note text to the audit log", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", email: "ayse@x.com" };
  const calls = mockStaffNote(t, { current, updated: applyUpdate(current) });
  const req = staffReq({ text: "  Kapı zili bozuk\r\n\r\n\r\n\r\n2. kat, sağdaki kapı  \u0007", baseUpdatedAt: null });
  const res = response();
  await updateStaffNote(req, res);
  await tick();
  assert.equal(res.statusCode, 200);
  const [{ filter, update, options }] = calls.update;
  assert.equal(update.$set.staffNote.text, "Kapı zili bozuk\n\n2. kat, sağdaki kapı");
  assert.equal(String(update.$set.staffNote.updatedBy), ADMIN._id);
  assert.ok(update.$set.staffNote.updatedAt instanceof Date);
  assert.deepEqual(filter, { _id: USER_ID, "staffNote.updatedAt": null }, "not okunduktan sonra yazılan not ezilmez");
  assert.equal(options.timestamps, false, "müşteri kaydının updatedAt'i değişmez");
  assert.equal(options.runValidators, true);
  assert.equal(res.body.success, true);
  assert.equal(res.body.staffNote.text, "Kapı zili bozuk\n\n2. kat, sağdaki kapı");
  assert.deepEqual(res.body.staffNote.updatedBy, { _id: ADMIN._id, name: ADMIN.name });
  assert.deepEqual(res.body.staffFlags, []);
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].action, "İç not güncellendi");
  assert.equal(calls.audit[0].category, "customer");
  assert.equal(calls.audit[0].targetName, "Ayşe Kaya");
  assert.deepEqual(calls.audit[0].changes, [{ label: "İç not", from: "Yok", to: "Eklendi" }]);
  assert.doesNotMatch(JSON.stringify(calls.audit[0]), /zili/, "notun metni işlem kaydına yazılmaz");
  assert.equal(req.auditRecorded, true);
});

test("staff note: flags are normalized to known keys in a fixed order; the audit shows the flag labels", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", staffNote: { text: "Eski not", updatedAt: at(DAY), updatedBy: OTHER_ADMIN }, staffFlags: ["hard_address"] };
  const calls = mockStaffNote(t, { current, updated: applyUpdate(current) });
  const res = response();
  await updateStaffNote(staffReq({ flags: ["pays_card", "call_before", "call_before", "bilinmeyen"] }), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.update[0].update, { $set: { staffFlags: ["call_before", "pays_card"] } });
  assert.deepEqual(calls.update[0].filter, { _id: USER_ID }, "yalnızca işaret değişince not sürümü aranmaz");
  assert.deepEqual(res.body.staffFlags, ["call_before", "pays_card"]);
  assert.deepEqual(res.body.staffNote.updatedBy, { _id: OTHER_ADMIN, name: "Ali Kurye" }, "notu yazan diğer yönetici adıyla döner");
  assert.equal(calls.audit[0].action, "Müşteri işaretleri güncellendi");
  assert.deepEqual(calls.audit[0].changes, [{ label: "İşaretler", from: "Adres tarifi zor", to: "Siparişten önce ara, Kapıda kartla öder" }]);
});

test("staff note: empty text deletes the note, empty flag list removes all flags", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", staffNote: { text: "Eski not", updatedAt: at(DAY), updatedBy: ADMIN._id }, staffFlags: ["call_before"] };
  const calls = mockStaffNote(t, { current, updated: applyUpdate(current) });
  const res = response();
  await updateStaffNote(staffReq({ text: "   ", flags: [], baseUpdatedAt: at(DAY).toISOString() }), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.update[0].update, { $unset: { staffNote: 1, staffFlags: 1 } });
  assert.equal(calls.update[0].filter["staffNote.updatedAt"].getTime(), at(DAY).getTime());
  assert.equal(res.body.staffNote, null);
  assert.deepEqual(res.body.staffFlags, []);
  assert.deepEqual(calls.audit[0].changes.map((change) => change.to), ["Silindi", "Yok"]);
});

test("staff note: nothing changed → no write, no audit entry", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", staffNote: { text: "Aynı not", updatedAt: at(DAY), updatedBy: ADMIN._id }, staffFlags: ["pays_card"] };
  const calls = mockStaffNote(t, { current });
  const req = staffReq({ text: " Aynı not ", flags: ["pays_card"] });
  const res = response();
  await updateStaffNote(req, res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.unchanged, true);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.audit.length, 0);
  assert.equal(req.auditRecorded, true, "genel işlem kaydı da yazılmaz");
});

test("staff note: someone else saved the note meanwhile → 409 with the latest note, nothing overwritten", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", staffNote: { text: "Ali'nin notu", updatedAt: at(HOUR), updatedBy: OTHER_ADMIN } };
  const calls = mockStaffNote(t, { current });
  const res = response();
  await updateStaffNote(staffReq({ text: "Benim notum", baseUpdatedAt: at(DAY).toISOString() }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.conflict, true);
  assert.equal(res.body.staffNote.text, "Ali'nin notu");
  assert.equal(calls.update.length, 0);

  // Okuma ile yazma arasında değişirse koşullu güncelleme boş döner → yine 409
  t.mock.restoreAll();
  const race = mockStaffNote(t, { current: { _id: USER_ID, name: "Ayşe" }, updated: null, latest: { staffNote: { text: "Yeni gelen", updatedAt: at(MIN), updatedBy: OTHER_ADMIN } } });
  const raced = response();
  await updateStaffNote(staffReq({ text: "Benim notum", baseUpdatedAt: null }), raced);
  assert.equal(raced.statusCode, 409);
  assert.equal(raced.body.staffNote.text, "Yeni gelen");
  assert.equal(race.audit.length, 0);
});

test("staff note: validation (id, length, types, list size, empty body) and 404", async (t) => {
  const cases = [
    [staffReq({ text: "x" }, "bozuk"), /Geçersiz müşteri/],
    [staffReq({ text: "x".repeat(501) }), /500 karakter/],
    [staffReq({ text: 42 }), /metin/],
    [staffReq({ flags: "call_before" }), /liste/],
    [staffReq({ flags: Array.from({ length: 21 }, () => "call_before") }), /Çok fazla/],
    [staffReq({ flags: [{ $gt: "" }] }), /Geçersiz işaret/],
    [staffReq({}), /değişiklik yok/],
    [staffReq({ text: "x", baseUpdatedAt: "dün" }), /sürüm/],
    [{ ...staffReq(null), body: ["text"] }, /Geçersiz istek/],
  ];
  for (const [req, message] of cases) {
    const res = response();
    await updateStaffNote(req, res);
    assert.equal(res.statusCode, 400, String(message));
    assert.match(res.body.message, message);
  }
  assert.equal(parseStaffNoteBody({ text: "x".repeat(500) }).value.text.length, 500, "tam 500 karakter kabul edilir");
  assert.equal(cleanStaffNoteText("a\r\nb\rc"), "a\nb\nc");
  mockStaffNote(t, { current: null });
  const missing = response();
  await updateStaffNote(staffReq({ text: "Not" }), missing);
  assert.equal(missing.statusCode, 404);
});

test("staff note: a schema validation error becomes 400, not 500", async (t) => {
  const error = Object.assign(new Error("geçersiz"), { name: "ValidationError" });
  mockStaffNote(t, { current: { _id: USER_ID, name: "Ayşe" }, updated: error });
  const res = response();
  await updateStaffNote(staffReq({ flags: ["call_before"] }), res);
  assert.equal(res.statusCode, 400);
});

test("staffNoteView: empty note → null; author name from the map", () => {
  assert.equal(staffNoteView(null), null);
  assert.equal(staffNoteView({ text: "   " }), null);
  assert.deepEqual(staffNoteView({ text: " Not ", updatedAt: at(HOUR), updatedBy: ADMIN._id }, names), { text: "Not", updatedAt: at(HOUR).toISOString(), updatedBy: { _id: ADMIN._id, name: ADMIN.name } });
});

// ── Yollar ve gizlilik ─────────────────────────────────────────────
test("PATCH /:userId/staff-note is admin-only; the profile route still is too", () => {
  const routes = userRoutes.stack.filter((layer) => layer.route).map((layer) => layer.route);
  const patch = routes.find((route) => route.path === "/:userId/staff-note" && route.methods.patch);
  assert.ok(patch, "yol yok");
  assert.deepEqual(patch.stack.map((layer) => layer.handle.name), ["protectRoute", "adminRoute", "updateStaffNote"]);
  const profile = routes.find((route) => route.path === "/:id/profile" && route.methods.get);
  assert.deepEqual(profile.stack.map((layer) => layer.handle.name), ["protectRoute", "adminRoute", "getCustomerProfile"]);
});

test("customer-facing GET /users/:id never returns the staff note or flags", async (t) => {
  let selectArg = null;
  t.mock.method(User, "findById", () => ({ select: async (arg) => { selectArg = arg; return { _id: USER_ID, name: "Ayşe" }; } }));
  const res = response();
  await getUserInfo({ params: { id: USER_ID }, user: { _id: { equals: (id) => id === USER_ID }, role: "customer" } }, res);
  assert.equal(res.statusCode, 200);
  t.mock.restoreAll();
  // Uygulamanın kullandığı seçim, şemadaki select: false sayesinde iç alanları dışarıda bırakır
  const query = User.find().select(selectArg);
  query._applyPaths();
  assert.equal(query._fields.staffNote, 0);
  assert.equal(query._fields.staffFlags, 0);
  const plain = User.find();
  plain._applyPaths();
  assert.equal(plain._fields.staffNote, 0, "seçim yapılmasa da gelmez");
});

// ── Müşteri listesi satırı ─────────────────────────────────────────
test("customer list rows carry staff flags and a trimmed note (selected explicitly in the projection)", async (t) => {
  const row = toListUser({ _id: USER_ID, name: "Ayşe", staffFlags: ["pays_card", "bilinmeyen"], staffNote: { text: "  Zil çalışmıyor ", updatedAt: at(HOUR) } });
  assert.deepEqual(row.staffFlags, ["pays_card"]);
  assert.deepEqual(row.staffNote, { text: "Zil çalışmıyor", updatedAt: at(HOUR).toISOString() });
  const bare = toListUser({ _id: USER_ID, name: "Ayşe" });
  assert.deepEqual(bare.staffFlags, []);
  assert.equal(bare.staffNote, null);

  const pipelines = [];
  t.mock.method(User, "countDocuments", async () => 1);
  t.mock.method(User, "aggregate", async (pipeline) => { pipelines.push(pipeline); return [{ _id: USER_ID, name: "Ayşe", staffFlags: ["call_before"] }]; });
  t.mock.method(Order, "aggregate", async () => []);
  const res = response();
  await getAllUsers({ query: {} }, res);
  const project = pipelines[0].find((stage) => stage.$project).$project;
  assert.equal(project.staffFlags, 1);
  assert.equal(project["staffNote.text"], 1);
  assert.equal(project["staffNote.updatedBy"], undefined, "liste için yazan bilgisi gerekmez");
  assert.deepEqual(res.body.users[0].staffFlags, ["call_before"]);
});

// ── Mesajlar müşteri kartı ─────────────────────────────────────────
test("chat context adds staff flags and note (with author) without changing the customer object", async (t) => {
  const userCalls = {};
  t.mock.method(Chat, "findById", () => chain({ _id: CHAT(1), user: USER_ID, status: "active", mode: "HUMAN" }));
  t.mock.method(User, "findById", () => chain({
    _id: USER_ID, name: "Ayşe Kaya", email: "ayse@x.com",
    staffNote: { text: " Önce arayın ", updatedAt: at(HOUR), updatedBy: { _id: OTHER_ADMIN, name: "Ali Kurye" } },
    staffFlags: ["call_before", "bilinmeyen"],
  }, userCalls));
  t.mock.method(Order, "countDocuments", async () => 2);
  t.mock.method(Order, "findOne", () => chain(null));
  t.mock.method(SupportRequest, "findOne", () => chain(null));
  const res = response();
  await getChatContext({ params: { chatId: CHAT(1) } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(userCalls.select, /staffNote/);
  assert.match(userCalls.select, /staffFlags/);
  assert.deepEqual(userCalls.populate, ["staffNote.updatedBy", "name"]);
  assert.deepEqual(res.body.staffFlags, ["call_before"]);
  assert.deepEqual(res.body.staffNote, { text: "Önce arayın", updatedAt: at(HOUR), updatedBy: { _id: OTHER_ADMIN, name: "Ali Kurye" } });
  assert.equal("staffNote" in res.body.customer, false);
  assert.equal("staffFlags" in res.body.customer, false);
  assert.equal(res.body.customer.name, "Ayşe Kaya");

  // Notu ve işareti olmayan müşteri
  t.mock.method(User, "findById", () => chain({ _id: USER_ID, name: "Misafir" }));
  const empty = response();
  await getChatContext({ params: { chatId: CHAT(1) } }, empty);
  assert.deepEqual(empty.body.staffFlags, []);
  assert.equal(empty.body.staffNote, null);
});
