// Devrek'i herkese açmadan önce: "Yayına hazırlık" listesi ve "Pilot karnesi" (GET /api/delivery/admin/readiness).
// Saf yardımcılar (süre metni, sürüm karşılaştırma, yüzdelik, kontrol maddeleri, karne özeti), uç nokta (taklit
// modellerle), pilot başlangıcının kaydı ve rota koruması. Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Settings from "../models/settings.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import DeliveryZone from "../models/deliveryZone.model.js";
import {
  ADDRESS_APP_MIN_VERSION,
  PILOT_DURATION_SAMPLE,
  buildPilotReportPipeline,
  buildReadinessChecks,
  compareAppVersions,
  parseAppVersion,
  parseEtaMaxMinutes,
  pilotOrderMatch,
  quantile,
  resetYurtSeedState,
  summarizePilotReport,
} from "../services/delivery.service.js";
import { adminGetReadiness, adminUpdateDeliverySettings } from "../controllers/delivery.controller.js";
import deliveryRouter from "../routes/delivery.route.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const USER = (n) => hex("507f1f77bcf8", n);
const ORDER = (n) => hex("6ac8bc", n);
const ADMIN = { _id: hex("ad", 1), role: "admin" };
const MIN = 60 * 1000;
const at = (iso) => new Date(iso);

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  set(key, value) { this.headers[key] = value; return this; },
  setHeader(key, value) { this.headers[key] = value; },
  json(body) { this.body = body; return this; },
});

const chain = (result) => {
  const resolve = async () => (typeof result === "function" ? result() : result);
  const c = {
    select() { return c; },
    sort() { return c; },
    limit() { return c; },
    populate() { return c; },
    lean: resolve,
    then(onOk, onErr) { return resolve().then(onOk, onErr); },
  };
  return c;
};

// ── Ortak örnek veriler ─────────────────────────────────────────────────────

const READY_DEVREK = () => ({
  _id: "devrek",
  name: "Devrek",
  type: "ilce",
  enabled: true,
  closedReason: "",
  deliveryFee: 40,
  freeDeliveryThreshold: 500,
  minimumOrderAmount: 200,
  etaText: "30-60 dk",
  requireFirstOrderCallback: true,
  sortOrder: 2,
  legacyPoint: null,
  area: {
    type: "MultiPolygon", source: "osm", osmType: "relation", osmId: 111, adminLevel: 8,
    displayName: "Devrek, Zonguldak, Karadeniz Bölgesi, Türkiye", areaKm2: 5.6, fetchedAt: at("2026-10-30T18:00:00Z"),
  },
  areaCandidates: [
    { osmType: "relation", osmId: 111, adminLevel: 8, displayName: "Devrek", areaKm2: 5.6 },
    { osmType: "relation", osmId: 222, adminLevel: 6, displayName: "Devrek İlçesi", areaKm2: 980 },
  ],
});
const DORMS = () => [
  { _id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt", enabled: true, deliveryFee: 0, etaText: "", sortOrder: 0, legacyPoint: "girlsDorm" },
  { _id: "boysDorm", name: "Erkek KYK Yurdu", type: "yurt", enabled: true, deliveryFee: 0, etaText: "10-20 dk", sortOrder: 1, legacyPoint: "boysDorm" },
];
const settingsFor = (fields = {}) => new Settings({
  name: "default",
  orderStartHour: 10, orderStartMinute: 0, orderEndHour: 1, orderEndMinute: 0,
  minimumOrderAmount: 250,
  appVersion: { latestVersion: "7.1.0", minimumVersion: "7.1.0", forceUpdate: true },
  ...fields,
});
const COURIERS = () => [{ _id: hex("c0c0", 1), name: "Mehmet", phone: "0555 111 22 33", active: true }];
const byId = (checks) => Object.fromEntries(checks.map((check) => [check.id, check]));

// ── Saf yardımcılar ─────────────────────────────────────────────────────────

test("tahmini süre metni: en geç dakika okunur, okunamayan metin null", () => {
  const cases = [
    ["30-60 dk", 60], ["20 - 40 dk.", 40], ["30–45 DK", 45], ["45 dakikada", 45], ["Yaklaşık 40 dakika", 40],
    ["1-2 saat", 120], ["1,5 saat", 90], ["1 saat 30 dk", 90], ["1 saat ve 30 dakika", 90], ["2 sa", 120],
    ["30 ila 60 dk", 60], ["30 dk - 1 saat", 60], ["en geç 1 saat", 60], ["10 min", 10],
    ["30-60", 60], ["45", 45],
    // Yazıyla süre
    ["yarım saat", 30], ["Yarım saatte kapında", 30], ["YARIM SAAT", 30], ["bir saat içinde", 60], ["bir buçuk saat", 90],
    ["1 buçuk saat", 90], ["iki saat", 120], ["30 dk ile bir saat", 60], ["birkaç saat", null],
    ["hızlı", null], ["", null], [null, null], [undefined, null], ["0 dk", null], ["48 saat", null], ["2 gün", null],
  ];
  for (const [text, expected] of cases) assert.equal(parseEtaMaxMinutes(text), expected, String(text));
});

test("uygulama sürümü: okuma ve karşılaştırma (yapı numarası ve önek yok sayılır)", () => {
  assert.deepEqual(parseAppVersion("7.1.0"), [7, 1, 0]);
  assert.deepEqual(parseAppVersion("v7.1"), [7, 1, 0]);
  assert.deepEqual(parseAppVersion("7.1.0+51"), [7, 1, 0]);
  assert.deepEqual(parseAppVersion(" 7 "), [7, 0, 0]);
  for (const bad of ["7.1.0.5", "abc", "", null, undefined]) assert.equal(parseAppVersion(bad), null, String(bad));
  assert.equal(compareAppVersions("7.1.0", ADDRESS_APP_MIN_VERSION), 0);
  assert.ok(compareAppVersions("7.0.9", "7.1.0") < 0);
  assert.ok(compareAppVersions("7.10.0", "7.1.0") > 0, "sayısal karşılaştırma (metin değil)");
  assert.ok(compareAppVersions("8", "7.1.0") > 0);
  assert.equal(compareAppVersions("bozuk", "7.1.0"), null);
});

test("yüzdelik: ortanca ve p90 doğrusal ara değerle; boş dizi null", () => {
  assert.equal(quantile([10, 20], 0.5), 15);
  assert.equal(quantile([10, 20, 30], 0.5), 20);
  assert.equal(quantile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9), 91);
  assert.equal(quantile([42], 0.9), 42);
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile(undefined, 0.5), null);
});

// ── Pilot karnesi: sorgu hattı ──────────────────────────────────────────────

test("pilot karnesi hattı: adres + Devrek siparişleri, tek $facet; pilot kullanıcıları yalnızca varsa", () => {
  assert.deepEqual(pilotOrderMatch(), { $or: [{ deliveryType: "address" }, { "deliveryZone.id": "devrek" }] });
  // Kayıtlı pilot başlangıcı: yalnızca o andan sonraki siparişler (öncesindeki deneme siparişleri sayılmaz)
  const start = at("2026-11-02T18:30:00Z");
  assert.deepEqual(pilotOrderMatch(start), { $or: [{ deliveryType: "address" }, { "deliveryZone.id": "devrek" }], createdAt: { $gte: start } });
  assert.deepEqual(pilotOrderMatch("2026-11-02T18:30:00.000Z").createdAt, { $gte: start }, "metin tarih de okunur");
  for (const empty of [null, undefined, "", "bozuk"]) assert.equal("createdAt" in pilotOrderMatch(empty), false, String(empty));
  assert.deepEqual(buildPilotReportPipeline({ since: start })[0], { $match: pilotOrderMatch(start) });
  const plainPipeline = buildPilotReportPipeline();
  assert.equal(plainPipeline.length, 2);
  assert.deepEqual(plainPipeline[0], { $match: pilotOrderMatch() });
  const facet = plainPipeline[1].$facet;
  assert.deepEqual(Object.keys(facet), ["totals", "customers", "failedByReason", "zones", "neighborhoods", "durations", "problems", "feedback"]);
  assert.equal("users" in facet, false, "pilot kullanıcısı yoksa kullanıcı dökümü yok");
  // Her alt hat boş olmamalı (Mongo $facet kuralı)
  for (const [key, stages] of Object.entries(facet)) assert.ok(Array.isArray(stages) && stages.length, key);
  assert.equal(facet.durations.find((stage) => stage.$limit).$limit, PILOT_DURATION_SAMPLE);
  assert.equal(facet.problems.find((stage) => stage.$limit).$limit, 5);
  assert.equal(facet.feedback.find((stage) => stage.$lookup).$lookup.from, "feedbacks");
  // Teslim edilemedi sayımı Genel bakıştakiyle aynı süzgeç
  assert.deepEqual(facet.failedByReason[0].$match, { status: "İptal Edildi", "deliveryOutcome.code": { $exists: true, $nin: ["", null] } });

  const ids = [new mongoose.Types.ObjectId(USER(1)), new mongoose.Types.ObjectId(USER(2))];
  const withUsers = buildPilotReportPipeline({ pilotUserIds: ids, feedbackCollection: "geri_bildirim", durationSample: 50 })[1].$facet;
  assert.deepEqual(withUsers.users[0], { $match: { user: { $in: ids } } });
  assert.ok(withUsers.users[0].$match.user.$in.every((id) => id instanceof mongoose.Types.ObjectId), "aggregate dönüştürmez: ObjectId gider");
  assert.equal(withUsers.feedback.find((stage) => stage.$lookup).$lookup.from, "geri_bildirim");
  assert.equal(withUsers.durations.find((stage) => stage.$limit).$limit, 50);
});

// ── Pilot karnesi: özet ─────────────────────────────────────────────────────

const created = at("2026-10-31T17:00:00Z");
const facetFixture = () => ({
  totals: [{
    orders: 12, delivered: 8, cancelled: 3, active: 1,
    callbacksNeeded: 5, callbacksPending: 1, callbacksConfirmed: 3,
    areaUnverified: 2, revenue: 2700.456, deliveryFees: 320, firstAt: at("2026-10-29T15:00:00Z"), lastAt: at("2026-11-01T20:00:00Z"),
  }],
  customers: [{ count: 7 }],
  failedByReason: [{ _id: "adres_bulunamadi", count: 1 }, { _id: "cevap_yok", count: 1 }, { _id: "bilinmeyen", count: 0 }],
  zones: [{ _id: "devrek", name: "Devrek", orders: 11 }, { _id: "girlsDorm", name: "Kız KYK Yurdu", orders: 1 }, { _id: null, orders: 3 }],
  neighborhoods: [
    { _id: "Cumhuriyet", orders: 4, delivered: 3, cancelled: 1 },
    { _id: "cumhuriyet mahallesi", orders: 2, delivered: 2, cancelled: 0 },
    { _id: "Fatih Mah.", orders: 3, delivered: 2, cancelled: 0 },
    { _id: "   ", orders: 9, delivered: 0, cancelled: 0 },
    // Türkçe büyük harf: "İ" ile yazılan ek de tanınır, aynı mahalleye düşer
    { _id: "CUMHURİYET MAHALLESİ", orders: 1, delivered: 0, cancelled: 1 },
    { _id: "FATİH MAH", orders: 1, delivered: 1, cancelled: 0 },
  ],
  durations: [
    { zoneId: "devrek", createdAt: created, deliveredAt: new Date(created.getTime() + 30 * MIN) },
    { zoneId: "devrek", createdAt: created, deliveredAt: new Date(created.getTime() + 40 * MIN) },
    { zoneId: "devrek", createdAt: created, deliveredAt: new Date(created.getTime() + 60 * MIN + 20 * 1000) }, // 60 dk sayılır
    { zoneId: "devrek", createdAt: created, deliveredAt: new Date(created.getTime() + 75 * MIN) }, // geç
    { zoneId: "girlsDorm", createdAt: created, deliveredAt: new Date(created.getTime() + 20 * MIN) }, // yurtta süre yazılı değil
    { zoneId: "devrek", createdAt: created, deliveredAt: null }, // geçmişi olmayan eski sipariş
    { zoneId: "devrek", createdAt: created, deliveredAt: new Date(created.getTime() - MIN) }, // saat hatası
  ],
  problems: [
    {
      _id: ORDER(0xabc), createdAt: at("2026-11-01T19:00:00Z"), updatedAt: at("2026-11-01T21:00:00Z"),
      deliveryOutcome: { code: "adres_bulunamadi", label: "", note: "  Bina   numarası yanlış  ", at: at("2026-11-01T20:10:00Z") },
      neighborhood: "cumhuriyet mahallesi", zoneName: "Devrek", cancelledAt: at("2026-11-01T20:10:00Z"),
    },
    { _id: ORDER(2), createdAt: at("2026-10-31T19:00:00Z"), cancelReason: { code: "fikir", note: "" }, zoneName: "Devrek", cancelledAt: at("2026-10-31T19:05:00Z") },
    { _id: ORDER(3), createdAt: at("2026-10-30T19:00:00Z"), updatedAt: at("2026-10-30T19:30:00Z") },
  ],
  feedback: [{ responses: 6, rated: 4, ratingSum: 17, deliveryRated: 3, deliveryRatingSum: 14, low: 2 }],
  users: [{ _id: new mongoose.Types.ObjectId(USER(1)), orders: 3, delivered: 2, failed: 1, lastAt: at("2026-11-01T19:00:00Z") }],
});

test("pilot karnesi özeti: sayılar, süreler, söz verilen süre, adres bulunamadı oranı, puanlar", () => {
  const zones = [READY_DEVREK(), ...DORMS()];
  const report = summarizePilotReport(facetFixture(), { zones, pilotStartedAt: at("2026-10-30T09:00:00Z") });
  assert.equal(report.orders, 12);
  assert.equal(report.delivered, 8);
  assert.equal(report.cancelled, 3);
  assert.equal(report.active, 1);
  assert.equal(report.customers, 7);
  assert.deepEqual(report.callbacks, { needed: 5, pending: 1, confirmed: 3 });
  assert.equal(report.areaUnverified, 2);
  assert.equal(report.revenue, 2700.46, "kuruşa yuvarlanır");
  assert.equal(report.averageBasket, 300.05, "iptal edilmeyen 9 siparişin ortalaması");
  assert.equal(report.deliveryFeeRevenue, 320);
  assert.deepEqual(report.failed, {
    total: 2,
    byReason: [{ code: "adres_bulunamadi", label: "Adres bulunamadı", count: 1 }, { code: "cevap_yok", label: "Müşteriye ulaşılamadı", count: 1 }],
  });

  // Süreler: geçersiz iki satır atlanır → [20, 30, 40, 60.33, 75]
  assert.equal(report.deliveryMinutes.count, 5);
  assert.equal(report.deliveryMinutes.median, 40);
  assert.equal(report.deliveryMinutes.p90, 69, "60,33 + (75 − 60,33) × 0,6 ≈ 69");
  assert.equal(report.deliveryMinutes.capped, false);
  // Söz verilen süre: Devrek "30-60 dk" → 60; yurdun süresi yazılı değil (ölçülmez)
  assert.deepEqual(report.onTime, { measured: 4, within: 3, rate: 75, target: 90 });
  // Adres bulunamadı: 1 / (8 teslim + 2 teslim edilemedi)
  assert.deepEqual(report.addressNotFound, { count: 1, attempts: 10, rate: 10, target: 3 });

  assert.deepEqual(report.feedback, { responses: 6, rated: 4, averageRating: 4.3, deliveryRated: 3, averageDeliveryRating: 4.7, low: 2, lowThreshold: 3 });

  // Mahalle yazımları (büyük harfli Türkçe ek dahil) birleşir, en çok kullanılan yazım görünür; boş mahalle atlanır
  assert.deepEqual(report.neighborhoods, [
    { name: "Cumhuriyet Mah.", orders: 7, delivered: 5, cancelled: 2 },
    { name: "Fatih Mah.", orders: 4, delivered: 3, cancelled: 0 },
  ]);
  assert.equal(report.neighborhoodCount, 2);
  assert.deepEqual(report.zones, [{ id: "devrek", name: "Devrek", orders: 11 }, { id: "girlsDorm", name: "Kız KYK Yurdu", orders: 1 }]);

  const [failed, cancelled, silent] = report.problems;
  assert.equal(failed.orderId, ORDER(0xabc));
  assert.equal(failed.code, `#${ORDER(0xabc).slice(-6).toUpperCase()}`);
  assert.equal(failed.kind, "failed");
  assert.equal(failed.reason, "Teslim edilemedi: Adres bulunamadı");
  assert.equal(failed.note, "Bina numarası yanlış");
  assert.equal(failed.neighborhood, "cumhuriyet Mah.");
  assert.equal(failed.at.toISOString(), "2026-11-01T20:10:00.000Z");
  assert.equal(cancelled.kind, "cancelled");
  assert.equal(cancelled.reason, "İptal nedeni: Fikrimi değiştirdim");
  assert.equal(cancelled.at.toISOString(), "2026-10-31T19:05:00.000Z");
  assert.equal(silent.reason, "İptal edildi (neden yazılmadı)");
  assert.equal(silent.at.toISOString(), "2026-10-30T19:30:00.000Z", "iptal kaydı yoksa son güncelleme");

  assert.deepEqual(report.users, [{ userId: USER(1), orders: 3, delivered: 2, failed: 1, lastAt: at("2026-11-01T19:00:00Z") }]);
  // Kayıtlı başlangıç esas alınır (sorgu da yalnızca o andan sonrasını sayar)
  assert.equal(report.startedAt.toISOString(), "2026-10-30T09:00:00.000Z");
  assert.equal(report.startedAtSource, "settings");
  assert.equal(report.lastOrderAt.toISOString(), "2026-11-01T20:00:00.000Z");

  // Kayıtlı başlangıç yoksa (pilot bu sürümden önce açıldıysa) ilk adres siparişi
  const legacy = summarizePilotReport(facetFixture(), { zones, pilotStartedAt: null });
  assert.equal(legacy.startedAt.toISOString(), "2026-10-29T15:00:00.000Z");
  assert.equal(legacy.startedAtSource, "firstOrder");

  // Büyük harfle yazılmış mahalle sorunlu siparişte de düzgün kısaltılır
  const [shouted] = summarizePilotReport({ problems: [{ _id: ORDER(9), neighborhood: "  KARŞIYAKA   MAHALLESİ " }] }).problems;
  assert.equal(shouted.neighborhood, "KARŞIYAKA Mah.");
});

test("pilot karnesi özeti: veri yokken sayılar 0, oranlar ve ortalamalar null; başlangıç kayıttan", () => {
  const empty = summarizePilotReport({}, { zones: [READY_DEVREK()], pilotStartedAt: at("2026-11-01T09:00:00Z") });
  assert.equal(empty.orders, 0);
  assert.equal(empty.delivered, 0);
  assert.equal(empty.customers, 0);
  assert.equal(empty.averageBasket, null);
  assert.deepEqual(empty.deliveryMinutes, { median: null, p90: null, count: 0, capped: false });
  assert.deepEqual(empty.onTime, { measured: 0, within: 0, rate: null, target: 90 });
  assert.deepEqual(empty.addressNotFound, { count: 0, attempts: 0, rate: null, target: 3 });
  assert.deepEqual(empty.feedback, { responses: 0, rated: 0, averageRating: null, deliveryRated: 0, averageDeliveryRating: null, low: 0, lowThreshold: 3 });
  assert.deepEqual(empty.failed, { total: 0, byReason: [] });
  assert.deepEqual([empty.neighborhoods, empty.problems, empty.users, empty.zones], [[], [], [], []]);
  assert.equal(empty.startedAt.toISOString(), "2026-11-01T09:00:00.000Z");
  assert.equal(empty.startedAtSource, "settings");
  assert.equal(empty.lastOrderAt, null);

  const none = summarizePilotReport(undefined);
  assert.equal(none.startedAt, null);
  assert.equal(none.startedAtSource, null);

  // Örnek sınırı aşılınca işaretlenir
  const big = summarizePilotReport({ totals: [{ orders: 3000, delivered: 2500 }] }, { durationSample: 2000 });
  assert.equal(big.deliveryMinutes.capped, true);
});

// ── Yayına hazırlık listesi ─────────────────────────────────────────────────

const readyInput = (overrides = {}) => ({
  settings: settingsFor({ delivery: { addressOrdering: "pilot", pilotUserIds: [USER(1)], couriers: COURIERS() } }),
  zones: [...DORMS(), READY_DEVREK()],
  couriers: COURIERS(),
  pilotUserCount: 2,
  pilot: { orders: 9, delivered: 6 },
  orderingOpen: true,
  ...overrides,
});

test("hazırlık listesi: her şey hazırsa engel yok; maddeler sabit sırada ve Türkçe", () => {
  const checks = buildReadinessChecks(readyInput());
  assert.deepEqual(checks.map((check) => check.id), ["devrek_open", "area", "pricing", "eta", "callback", "couriers", "app_version", "hours", "pilot"]);
  assert.deepEqual(checks.map((check) => check.status), Array(9).fill("ok"));
  for (const check of checks) {
    assert.ok(check.title && check.detail, check.id);
    assert.ok(check.fix && check.fix.hint, `${check.id} düzeltme ipucu`);
    assert.ok(check.fix.target || check.fix.tab, `${check.id} hedef`);
  }
  const c = byId(checks);
  assert.equal(c.area.detail, "Yüklü: Devrek · ~5,6 km² · 30 Ekim 2026 tarihinde yüklendi.");
  assert.equal(c.pricing.detail, "40 TL · 500 TL üstü ücretsiz. Minimum sepet 200 TL.");
  assert.equal(c.eta.detail, "Müşteri “30-60 dk” görür; en geç 60 dk sayılır.");
  assert.equal(c.couriers.detail, "1 aktif kurye.");
  assert.equal(c.app_version.detail, "Minimum sürüm 7.1.0, zorunlu güncelleme açık.");
  assert.equal(c.hours.detail, "10:00–01:00 · şu an sipariş alınıyor.");
  assert.equal(c.pilot.detail, "2 pilot kullanıcı · 6 adres siparişi teslim edildi.");
  assert.deepEqual(c.app_version.fix, { tab: "settings", section: "app", hint: c.app_version.fix.hint });
  assert.deepEqual([c.devrek_open.fix.target, c.devrek_open.fix.focus], ["zone-devrek", "enabled"]);
  assert.deepEqual([c.pricing.fix.focus, c.eta.fix.focus, c.callback.fix.focus], ["fee", "etaText", "callback"]);
  assert.deepEqual([c.area.fix.target, c.couriers.fix.target, c.pilot.fix.target], ["area", "couriers", "pilot"]);
});

test("hazırlık listesi: varsayılan (hiç hazırlanmamış) Devrek dört engel ve uyarılar verir", () => {
  const devrek = { _id: "devrek", name: "Devrek", type: "ilce", enabled: false, closedReason: "", deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", requireFirstOrderCallback: false, area: null };
  const checks = buildReadinessChecks({
    settings: settingsFor({ appVersion: { minimumVersion: "4.0.3", forceUpdate: true } }),
    zones: [...DORMS(), devrek],
    couriers: [],
    pilotUserCount: 0,
    pilot: { orders: 0, delivered: 0 },
    orderingOpen: false,
  });
  const c = byId(checks);
  assert.deepEqual(Object.fromEntries(checks.map((check) => [check.id, check.status])), {
    devrek_open: "block", area: "block", pricing: "warn", eta: "warn", callback: "warn", couriers: "block", app_version: "block", hours: "ok", pilot: "warn",
  });
  assert.equal(c.devrek_open.detail, "Kapalı: Devrek adreslerine sipariş verilemez.");
  assert.match(c.area.detail, /Sınır yüklenmedi/);
  assert.equal(c.pricing.detail, "Devrek'te teslimat ücretsiz olacak. Bilerek seçtiyseniz sorun yok. Minimum sepet girilmedi; genel minimum (250 TL) geçerli.");
  assert.equal(c.eta.detail, "Yazılı değil: müşteri tahmini teslimat süresini görmez.");
  assert.match(c.callback.detail, /^Kapalı/);
  assert.equal(c.couriers.detail, "Kurye eklenmemiş: siparişleri kimin götüreceği belli değil.");
  assert.equal(c.app_version.detail, "Minimum sürüm 4.0.3. Adrese teslimat 7.1.0 ve üstünde çalışır; eski sürümdeki müşteri adres seçemez.");
  assert.equal(c.hours.detail, "10:00–01:00 · şu an sipariş alınmıyor.");
  assert.match(c.pilot.detail, /^Pilot başlamadı/);
});

test("hazırlık listesi: ücret uyarıları (kampanya, eşik ≤ minimum), kapanma nedeni ve geniş sınır", () => {
  const campaign = byId(buildReadinessChecks(readyInput({
    settings: settingsFor({ delivery: { addressOrdering: "pilot", freeDeliveryEverywhere: true } }),
  })));
  assert.equal(campaign.pricing.status, "warn");
  assert.match(campaign.pricing.detail, /^“Her yerde ücretsiz teslimat” açık; Devrek'te şu an ücret alınmıyor \(bölge ücreti: 40 TL · 500 TL üstü ücretsiz\)/);
  // Ücreti alınmayan sebep kampanya: "Düzelt" bölge ücretine değil kampanya anahtarına götürür
  assert.equal(campaign.pricing.fix.target, "campaign");
  assert.match(campaign.pricing.fix.hint, /anahtarını kapatın/);

  const lowThreshold = byId(buildReadinessChecks(readyInput({ zones: [{ ...READY_DEVREK(), freeDeliveryThreshold: 150, minimumOrderAmount: null }] })));
  assert.equal(lowThreshold.pricing.status, "warn");
  assert.equal(lowThreshold.pricing.detail, "Ücretsiz teslimat eşiği (150 TL) minimum sepetten (250 TL) yüksek değil; her sipariş ücretsiz gider.");

  const noMinimum = byId(buildReadinessChecks(readyInput({ zones: [{ ...READY_DEVREK(), freeDeliveryThreshold: null, minimumOrderAmount: 0 }] })));
  assert.equal(noMinimum.pricing.status, "ok");
  assert.equal(noMinimum.pricing.detail, "40 TL · ücretsiz eşiği yok. Minimum sepet yok.");

  // Bölge minimumu boş, genel minimum 0: "genel minimum (yok)" gibi bozuk cümle kurulmaz
  const generalZero = byId(buildReadinessChecks(readyInput({
    settings: settingsFor({ minimumOrderAmount: 0 }),
    zones: [{ ...READY_DEVREK(), freeDeliveryThreshold: null, minimumOrderAmount: null }],
  })));
  assert.equal(generalZero.pricing.status, "ok");
  assert.equal(generalZero.pricing.detail, "40 TL · ücretsiz eşiği yok. Minimum sepet girilmedi; genel ayarda da minimum yok.");

  const closed = byId(buildReadinessChecks(readyInput({ zones: [{ ...READY_DEVREK(), enabled: false, closedReason: "Kurye yetersizliği" }] })));
  assert.equal(closed.devrek_open.status, "block");
  assert.equal(closed.devrek_open.detail, "Kapalı (Kurye yetersizliği): Devrek adreslerine sipariş verilemez.");

  const wide = READY_DEVREK();
  wide.area = { ...wide.area, osmId: 222, areaKm2: 980 };
  const wideArea = byId(buildReadinessChecks(readyInput({ zones: [wide] })));
  assert.equal(wideArea.area.status, "warn");
  assert.equal(wideArea.area.detail, "Seçili sınır (~980 km²) önerilen merkez sınırından (~5,6 km²) büyük; köyler de alana girebilir.");
  // Yeniden yüklemek seçili sınırı korur: "Düzelt" aday listesine (önerilen sınır) götürür
  assert.deepEqual([wideArea.area.fix.target, wideArea.area.fix.focus], ["area", "candidates"]);
  assert.match(wideArea.area.fix.hint, /Merkez sınırı · önerilen/);

  const missing = byId(buildReadinessChecks(readyInput({ zones: DORMS() })));
  assert.equal(missing.devrek_open.status, "block");
  assert.equal(missing.area.status, "block");

  const vagueEta = byId(buildReadinessChecks(readyInput({ zones: [{ ...READY_DEVREK(), etaText: "Hızlı teslimat" }] })));
  assert.equal(vagueEta.eta.status, "warn");
  assert.match(vagueEta.eta.detail, /“Hızlı teslimat” dakikaya çevrilemiyor/);
});

test("hazırlık listesi: kurye, uygulama sürümü ve saat maddeleri", () => {
  const passive = byId(buildReadinessChecks(readyInput({ couriers: [{ name: "Ali", phone: "05551112233", active: false }, { name: "Can", phone: "", active: false }] })));
  assert.equal(passive.couriers.status, "block");
  assert.equal(passive.couriers.detail, "2 kuryenin hepsi pasif: siparişlere kurye atanamaz.");
  const noPhone = byId(buildReadinessChecks(readyInput({ couriers: [{ name: "Ali", phone: "", active: true }] })));
  assert.equal(noPhone.couriers.status, "warn");
  const partial = byId(buildReadinessChecks(readyInput({ couriers: [{ name: "Ali", phone: "0555 111 2233", active: true }, { name: "Can", phone: "", active: true }] })));
  assert.equal(partial.couriers.status, "ok");
  assert.equal(partial.couriers.detail, "2 aktif kurye · 1 kuryenin telefonu yok.");

  const appCase = (appVersion) => byId(buildReadinessChecks(readyInput({ settings: settingsFor({ appVersion }) }))).app_version;
  assert.equal(appCase({ minimumVersion: "7.2.0", forceUpdate: true }).status, "ok");
  const notForced = appCase({ minimumVersion: "7.1.0", forceUpdate: false });
  assert.equal(notForced.status, "block");
  assert.equal(notForced.detail, "Zorunlu güncelleme kapalı. Adrese teslimat 7.1.0 ve üstünde çalışır; eski sürümdeki müşteri adres seçemez.");
  assert.equal(appCase({ minimumVersion: "7.0.9", forceUpdate: false }).detail.startsWith("Minimum sürüm 7.0.9, zorunlu güncelleme kapalı."), true);
  const unreadable = appCase({ minimumVersion: "yeni", forceUpdate: true });
  assert.equal(unreadable.status, "block");
  assert.match(unreadable.detail, /^Minimum sürüm okunamadı \(“yeni”\)/);

  const allDay = byId(buildReadinessChecks(readyInput({
    settings: settingsFor({ orderStartHour: 0, orderStartMinute: 0, orderEndHour: 0, orderEndMinute: 0 }), orderingOpen: null,
  })));
  assert.equal(allDay.hours.detail, "24 saat açık.");
  assert.equal(allDay.hours.status, "ok", "bilgi maddesi engel olmaz");
});

test("hazırlık listesi: pilot maddesi moda, kullanıcıya ve gerçek siparişe göre", () => {
  const pilotCheck = (mode, pilotUserCount, pilot) => byId(buildReadinessChecks(readyInput({
    settings: settingsFor({ delivery: { addressOrdering: mode } }), pilotUserCount, pilot,
  }))).pilot;
  assert.deepEqual(pilotCheck("pilot", 0, { orders: 0, delivered: 0 }), {
    id: "pilot", status: "warn", title: "Pilot", detail: "Pilot açık ama listede kimse yok: kimse adrese sipariş veremiyor.", fix: pilotCheck("pilot", 0, null).fix,
  });
  assert.equal(pilotCheck("pilot", 3, { orders: 0, delivered: 0 }).detail, "3 pilot kullanıcı var; henüz adres siparişi yok. Herkese açmadan önce gerçek bir siparişle deneyin.");
  assert.equal(pilotCheck("pilot", 3, { orders: 2, delivered: 0 }).detail, "3 pilot kullanıcı · 2 adres siparişi var ama henüz teslim edilen yok.");
  assert.equal(pilotCheck("pilot", 3, { orders: 2, delivered: 0 }).status, "warn");
  assert.equal(pilotCheck("pilot", 3, null).status, "warn", "karne okunamadı");
  assert.match(pilotCheck("pilot", 3, null).detail, /^3 pilot kullanıcı\. Pilot sonuçları şu an okunamadı/);
  assert.equal(pilotCheck("off", 0, { orders: 0, delivered: 0 }).status, "warn");
  assert.match(pilotCheck("off", 0, { orders: 0, delivered: 0 }).detail, /^Pilot başlamadı\. Kendi hesabınızı/);
  // Kapalıyken listede pilot kullanıcı varsa yeniden "ekleyin" denmez; daha önce açıldıysa "başlamadı" denmez
  assert.equal(pilotCheck("off", 2, { orders: 0, delivered: 0 }).detail, "Pilot başlamadı. Listede 2 pilot kullanıcı hazır; “Pilot”u seçip gerçek bir siparişle deneyin.");
  const reopened = pilotCheck("off", 2, { orders: 0, delivered: 0, startedAt: at("2026-11-01T09:00:00Z") });
  assert.equal(reopened.status, "warn");
  assert.equal(reopened.detail, "Pilot açılmıştı ama adres siparişi gelmedi. Listede 2 pilot kullanıcı hazır; “Pilot”u seçip gerçek bir siparişle deneyin.");
  assert.equal(pilotCheck("off", 0, { orders: 5, delivered: 4 }).detail, "Pilotta 4 adres siparişi teslim edildi.");
  assert.equal(pilotCheck("off", 0, { orders: 5, delivered: 4 }).status, "ok");
  assert.equal(pilotCheck("public", 0, { orders: 50, delivered: 40 }).detail, "Herkese açık; 40 adres siparişi teslim edildi.");
  assert.equal(pilotCheck("public", 0, null).status, "ok");
});

// ── Uç nokta ────────────────────────────────────────────────────────────────

const mockScreen = (t, { settings, zones = [...DORMS(), READY_DEVREK()], facet = facetFixture(), aggregateError = null, pilotUsers = 1 } = {}) => {
  resetYurtSeedState();
  const doc = settings || settingsFor({ delivery: { addressOrdering: "pilot", pilotUserIds: [USER(1), USER(1)], couriers: COURIERS(), pilotStartedAt: at("2026-10-30T09:00:00Z") } });
  t.mock.method(Settings, "getSettings", async () => doc);
  t.mock.method(DeliveryZone, "updateOne", async () => ({}));
  t.mock.method(DeliveryZone, "updateMany", async () => ({ modifiedCount: 0 }));
  t.mock.method(DeliveryZone, "find", () => chain(() => zones.map((zone) => ({ ...zone }))));
  const pipelines = [];
  const options = [];
  t.mock.method(Order, "aggregate", async (pipeline, option) => {
    pipelines.push(pipeline);
    options.push(option);
    if (aggregateError) throw aggregateError;
    return [facet];
  });
  const counts = [];
  t.mock.method(User, "countDocuments", async (filter) => { counts.push(filter); return pilotUsers; });
  return { doc, pipelines, options, counts };
};

test("GET /admin/readiness: liste + karne tek yanıtta; pilot kimlikleri tekil ObjectId; önbelleğe alınmaz", async (t) => {
  const { pipelines, options, counts } = mockScreen(t);
  const res = response();
  await adminGetReadiness({ user: ADMIN, method: "GET", query: {}, params: {} }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.body.mode, "pilot");
  assert.equal(res.body.ready, true);
  assert.equal(res.body.pilotError, null);
  assert.equal(typeof res.body.generatedAt, "string");
  assert.equal(res.body.checks.length, 9);
  assert.ok(res.body.checks.every((check) => ["ok", "warn", "block"].includes(check.status)));
  assert.equal(byId(res.body.checks).pilot.detail, "1 pilot kullanıcı · 8 adres siparişi teslim edildi.");

  // Karne: güncel bölgelerin süresiyle hesaplanır; başlangıç kayıtlı pilot başlangıcı
  assert.equal(res.body.pilot.orders, 12);
  assert.equal(res.body.pilot.onTime.rate, 75);
  assert.equal(res.body.pilot.startedAt.toISOString(), "2026-10-30T09:00:00.000Z");
  assert.equal(res.body.pilot.startedAtSource, "settings");

  assert.equal(pipelines.length, 1, "tek sorgu");
  assert.deepEqual(pipelines[0][0].$match.createdAt, { $gte: at("2026-10-30T09:00:00Z") }, "yalnızca pilot başlangıcından sonraki siparişler");
  assert.deepEqual(options[0], { maxTimeMS: 15000 }, "yavaş sorgu sınırlı");
  const ids = pipelines[0][1].$facet.users[0].$match.user.$in;
  assert.deepEqual(ids.map(String), [USER(1)], "tekrarlı kimlik ayıklanır");
  assert.ok(ids[0] instanceof mongoose.Types.ObjectId);
  assert.equal(pipelines[0][1].$facet.feedback.find((stage) => stage.$lookup).$lookup.from, "feedbacks");
  assert.deepEqual(counts.map((filter) => filter._id.$in.map(String)), [[USER(1)]]);
});

test("GET /admin/readiness: karne hesaplanamazsa liste yine döner (pilot: null), engel varsa ready: false", async (t) => {
  const settings = settingsFor({ appVersion: { minimumVersion: "4.0.3", forceUpdate: true }, delivery: { addressOrdering: "off", couriers: [] } });
  const { counts, pipelines } = mockScreen(t, { settings, aggregateError: new Error("bağlantı koptu") });
  const errors = [];
  t.mock.method(console, "error", (...args) => { errors.push(args.join(" ")); });
  const res = response();
  await adminGetReadiness({ user: ADMIN, method: "GET" }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pilot, null);
  assert.match(res.body.pilotError, /Pilot sonuçları/);
  assert.equal(res.body.mode, "off");
  assert.equal(res.body.ready, false);
  const c = byId(res.body.checks);
  assert.equal(c.couriers.status, "block");
  assert.equal(c.app_version.status, "block");
  assert.equal(c.pilot.status, "warn");
  assert.equal(counts.length, 0, "pilot listesi boşken kullanıcı sayılmaz");
  assert.equal("createdAt" in pipelines[0][0].$match, false, "kayıtlı başlangıç yoksa tarih süzgeci yok (ilk adres siparişinden bu yana)");
  assert.ok(errors.some((line) => line.includes("Pilot karnesi hesaplanamadı")));
});

test("GET /admin/readiness: bölgeler okunamazsa 500 ve Türkçe hata", async (t) => {
  mockScreen(t);
  t.mock.method(DeliveryZone, "find", () => chain(() => { throw new Error("db down"); }));
  t.mock.method(console, "error", () => {});
  const res = response();
  await adminGetReadiness({ user: ADMIN, method: "GET" }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "İşlem sırasında bir hata oluştu");
});

// ── Pilot başlangıcı ────────────────────────────────────────────────────────

test("pilot başlangıcı: Kapalı → Pilot'ta bir kez yazılır; sonraki geçişler değiştirmez; işlem kaydı aynı kalır", async (t) => {
  const doc = settingsFor();
  doc.save = async () => doc;
  t.mock.method(Settings, "getSettings", async () => doc);
  t.mock.method(User, "find", () => chain([]));
  const audits = [];
  t.mock.method(AdminAudit, "create", async (entry) => { audits.push(entry); return entry; });
  const put = async (body) => {
    const res = response();
    await adminUpdateDeliverySettings({ user: ADMIN, method: "PUT", originalUrl: "/api/delivery/admin/settings", body }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal("pilotStartedAt" in res.body, false, "ayar yanıtı değişmez");
    return res;
  };

  assert.equal(doc.delivery.pilotStartedAt, null);
  await put({ freeDeliveryEverywhere: true });
  assert.equal(doc.delivery.pilotStartedAt, null, "kampanya değişikliği başlatmaz");
  await put({ addressOrdering: "off" });
  assert.equal(doc.delivery.pilotStartedAt, null, "Kapalı → Kapalı başlatmaz");

  const before = Date.now();
  const res = await put({ addressOrdering: "pilot" });
  const first = doc.delivery.pilotStartedAt;
  assert.ok(first instanceof Date && first.getTime() >= before);
  assert.deepEqual(res.body.changes.map((change) => change.label), ["Adrese sipariş"]);

  await put({ addressOrdering: "public" });
  await put({ addressOrdering: "off" });
  await put({ addressOrdering: "pilot" });
  assert.equal(doc.delivery.pilotStartedAt.getTime(), first.getTime(), "ilk açılış korunur");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(audits.length >= 4);
  assert.ok(audits.every((entry) => !JSON.stringify(entry.changes).includes("pilotStartedAt")));

  // Doğrudan Kapalı → Herkese açık da başlangıç yazar; herkese açık GET /api/settings yanıtına sızmaz
  const fresh = settingsFor();
  fresh.save = async () => fresh;
  t.mock.method(Settings, "getSettings", async () => fresh);
  await put({ addressOrdering: "public" });
  assert.ok(fresh.delivery.pilotStartedAt instanceof Date);
  assert.equal(JSON.stringify(fresh.toJSON()).includes("pilotStartedAt"), false);

  // Bu sürümden önce açılmış pilot (başlangıç kaydı yok): Pilot → Herkese açık sonradan başlangıç yazmaz,
  // yoksa karne o güne kadarki gerçek pilot siparişlerini dışarıda bırakırdı (ilk adres siparişi esas kalır)
  const legacy = settingsFor({ delivery: { addressOrdering: "pilot" } });
  legacy.save = async () => legacy;
  t.mock.method(Settings, "getSettings", async () => legacy);
  await put({ addressOrdering: "public" });
  assert.equal(legacy.delivery.addressOrdering, "public");
  assert.equal(legacy.delivery.pilotStartedAt, null);
});

// ── Rota ────────────────────────────────────────────────────────────────────

test("rota: GET /admin/readiness yönetici korumalı", () => {
  const layer = deliveryRouter.stack.find((entry) => entry.route?.path === "/admin/readiness" && entry.route.methods.get);
  assert.ok(layer, "rota tanımlı");
  assert.deepEqual(layer.route.stack.map((entry) => entry.handle.name), ["protectRoute", "adminRoute", "adminGetReadiness"]);
});
