// Bildirim ekranının bağımlılıksız yardımcıları (frontend/src/components/push/broadcastShared.js): İstanbul saati,
// "Ne zaman" seçenekleri, saat uyarıları ve sonuç metinleri. Her sınama `now` değerini açıkça verir.
import test from "node:test";
import assert from "node:assert/strict";
import {
  agoLabel, describeResult, formatWhen, fromTrInput, historyState, lastSendHint, resolveWhen, scheduleProblem, sendTimeWarnings, toTrInput, trMinutesOfDay,
} from "../../frontend/src/components/push/broadcastShared.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// 10 Mart 2026 Salı, İstanbul 15:00 (UTC 12:00)
const NOW = Date.UTC(2026, 2, 10, 12, 0);

test("datetime-local values are Istanbul time whatever the computer's zone", () => {
  assert.equal(toTrInput(NOW), "2026-03-10T15:00");
  assert.equal(fromTrInput("2026-03-10T15:00"), NOW);
  // Gece yarısından sonra İstanbul'da ertesi gün
  assert.equal(toTrInput(Date.UTC(2026, 2, 10, 21, 30)), "2026-03-11T00:30");
  assert.equal(fromTrInput("2026-03-11T00:30"), Date.UTC(2026, 2, 10, 21, 30));
  assert.equal(new Date(fromTrInput("2026-03-10T20:30")).toISOString(), "2026-03-10T17:30:00.000Z");
  assert.ok(Number.isNaN(fromTrInput("")));
  assert.ok(Number.isNaN(fromTrInput("2026-02-31T10:00")));
  assert.ok(Number.isNaN(fromTrInput("2026-03-10T25:00")));
  assert.equal(toTrInput("bozuk"), "");
  assert.equal(trMinutesOfDay(NOW), 15 * 60);
  assert.equal(trMinutesOfDay(Date.UTC(2026, 2, 10, 21, 30)), 30);
});

test("'Bugün 20:30' and 'Yarın 12:00' resolve to Istanbul wall-clock times", () => {
  assert.equal(resolveWhen("now", "", NOW), null);
  assert.equal(new Date(resolveWhen("today", "", NOW)).toISOString(), "2026-03-10T17:30:00.000Z");
  assert.equal(new Date(resolveWhen("tomorrow", "", NOW)).toISOString(), "2026-03-11T09:00:00.000Z");
  // UTC'de hâlâ 10 Mart, İstanbul'da 11 Mart 01:00: "bugün" 11 Mart'tır
  const lateNight = Date.UTC(2026, 2, 10, 22, 0);
  assert.equal(new Date(resolveWhen("today", "", lateNight)).toISOString(), "2026-03-11T17:30:00.000Z");
  assert.equal(new Date(resolveWhen("tomorrow", "", lateNight)).toISOString(), "2026-03-12T09:00:00.000Z");
  assert.equal(resolveWhen("custom", "2026-03-12T09:15", NOW), Date.UTC(2026, 2, 12, 6, 15));
  assert.ok(Number.isNaN(resolveWhen("custom", "", NOW)));
});

test("a schedule time must be in the future and within the limit", () => {
  assert.equal(scheduleProblem(null, NOW), "");
  assert.match(scheduleProblem(NaN, NOW), /Tarih ve saat seçin/);
  assert.match(scheduleProblem(NOW - MINUTE, NOW), /geçti/);
  assert.match(scheduleProblem(NOW + MINUTE, NOW), /çok yakın/);
  assert.equal(scheduleProblem(NOW + 2 * MINUTE, NOW), "");
  assert.equal(scheduleProblem(NOW + 30 * DAY, NOW), "");
  assert.match(scheduleProblem(NOW + 30 * DAY + MINUTE, NOW), /en fazla 30 gün/);
  assert.match(scheduleProblem(NOW + 8 * DAY, NOW, { maxScheduleDays: 7 }), /en fazla 7 gün/);
  // 20:30'dan sonra "Bugün 20:30" seçilemez
  const evening = Date.UTC(2026, 2, 10, 17, 45);
  assert.notEqual(scheduleProblem(resolveWhen("today", "", evening), evening), "");
  assert.equal(scheduleProblem(resolveWhen("tomorrow", "", evening), evening), "");
});

test("warnings when the time is outside order hours or the automation send window", () => {
  const hours = { orderHours: { startHour: 10, startMinute: 0, endHour: 1, endMinute: 0 }, sendWindow: { start: "09:00", end: "22:30" } };
  const trTime = (h, m = 0) => fromTrInput(`2026-03-12T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  assert.deepEqual(sendTimeWarnings(trTime(15), hours, NOW), []);
  // Gece yarısını aşan sipariş saatleri: 00:30 açık, ama gönderim aralığının dışında
  let warnings = sendTimeWarnings(trTime(0, 30), hours, NOW);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Seçilen saat otomatik bildirimlerin gönderim aralığının \(09:00–22:30\) dışında/);
  // 09:30: gönderim aralığında, mağaza kapalı
  warnings = sendTimeWarnings(trTime(9, 30), hours, NOW);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /sipariş saatlerinin \(10:00–01:00\) dışında/);
  // 03:00: ikisi de
  assert.equal(sendTimeWarnings(trTime(3), hours, NOW).length, 2);
  // Bitiş saati hariçtir
  assert.equal(sendTimeWarnings(trTime(22, 30), hours, NOW).length, 1);
  assert.equal(sendTimeWarnings(trTime(22, 29), hours, NOW).length, 0);
  // "Şimdi" için şu anki saat denetlenir
  assert.match(sendTimeWarnings(null, hours, fromTrInput("2026-03-12T03:00"))[0], /^Şu an sipariş saatlerinin/);
  // 24 saat açık mağaza ve 00:00 kapanış (gün sonu)
  assert.deepEqual(sendTimeWarnings(trTime(3), { orderHours: { startHour: 0, startMinute: 0, endHour: 0, endMinute: 0 } }, NOW), []);
  assert.deepEqual(sendTimeWarnings(trTime(23, 59), { orderHours: { startHour: 9, startMinute: 0, endHour: 0, endMinute: 0 } }, NOW), []);
  assert.equal(sendTimeWarnings(trTime(8, 59), { orderHours: { startHour: 9, startMinute: 0, endHour: 0, endMinute: 0 } }, NOW).length, 1);
  // Ayarlar okunamadıysa uyarı yok; geçersiz an için de yok
  assert.deepEqual(sendTimeWarnings(trTime(3), {}, NOW), []);
  assert.deepEqual(sendTimeWarnings(trTime(3), undefined, NOW), []);
  assert.deepEqual(sendTimeWarnings(NaN, hours, NOW), []);
});

test("times are labelled relative to today in Istanbul", () => {
  assert.equal(formatWhen(resolveWhen("today", "", NOW), NOW), "Bugün 20:30");
  assert.equal(formatWhen(resolveWhen("tomorrow", "", NOW), NOW), "Yarın 12:00");
  // UTC'de aynı gün, İstanbul'da ertesi gün
  assert.equal(formatWhen(Date.UTC(2026, 2, 10, 21, 30), NOW), "Yarın 00:30");
  assert.match(formatWhen(fromTrInput("2026-03-20T09:05"), NOW), /^20 Mar \S+ 09:05$/);
  assert.equal(formatWhen("bozuk", NOW), "–");
  assert.equal(agoLabel(NOW - 20 * 1000, NOW), "az önce");
  assert.equal(agoLabel(NOW - 5 * MINUTE, NOW), "5 dk önce");
  assert.equal(agoLabel(NOW - 5 * HOUR, NOW), "5 saat önce");
  assert.equal(agoLabel(NOW - 2 * DAY, NOW), "2 gün önce");
  assert.equal(lastSendHint(null, NOW), null);
  assert.deepEqual(lastSendHint(new Date(NOW - 2 * DAY).toISOString(), NOW), { recent: false, text: "Bu kitleye son gönderim: 2 gün önce." });
  const recent = lastSendHint(NOW - 3 * HOUR, NOW);
  assert.equal(recent.recent, true);
  assert.match(recent.text, /^Bu kitleye son gönderim: 3 saat önce\. Sık gelen bildirim/);
});

test("result text is honest about unfinished windows and unavailable data", () => {
  const numbers = { orders24: 14, buyers24: 12, revenue24: 3100, orders72: 31, buyers72: 25, revenue72: 8420.4 };
  const final = describeResult({ state: "final", done24: true, done72: true, ...numbers });
  assert.equal(final.text, "24 saatte 14 sipariş · 72 saatte 31 sipariş · ₺8.420");
  assert.equal(final.pending, false);
  assert.match(final.title, /bildirimden sonra sipariş verenler: 24 saatte 12 kişi, 72 saatte 25 kişi/);
  assert.match(final.title, /bildirim sayesinde verildiği anlamına gelmez/);
  const early = describeResult({ state: "measuring", done24: false, done72: false, ...numbers, orders24: 3, orders72: 3, revenue72: 450 });
  assert.equal(early.text, "24 saat ölçülüyor (şu ana kadar 3 sipariş) · ₺450");
  assert.equal(early.pending, true);
  const mid = describeResult({ state: "measuring", done24: true, done72: false, ...numbers });
  assert.equal(mid.text, "24 saatte 14 sipariş · 72 saat ölçülüyor (şu ana kadar 31 sipariş) · ₺8.420");
  assert.equal(describeResult({ state: "measuring", done24: false, done72: false, orders24: 0, orders72: 0, revenue72: 0 }).text, "24 saat ölçülüyor (şu ana kadar 0 sipariş)");
  assert.equal(describeResult({ state: "final", done24: true, done72: true, orders24: 0, orders72: 0, revenue72: 0 }).text, "24 saatte 0 sipariş · 72 saatte 0 sipariş · ₺0");
  assert.equal(describeResult({ state: "unavailable" }).text, "sonuç ölçülemiyor");
  assert.equal(describeResult(undefined), null);
  assert.equal(describeResult({ state: "tuhaf" }), null);
});

test("history rows: old records without status read as sent / failed", () => {
  assert.equal(historyState({ sent: true }).label, "Gönderildi");
  assert.equal(historyState({ sent: false, failureReason: "network" }).label, "Bağlantı hatası");
  assert.equal(historyState({ sent: false }).label, "Başarısız");
  assert.equal(historyState({ status: "sending" }).tone, "wait");
  assert.equal(historyState({ status: "missed", failureReason: "missed" }).tone, "bad");
  assert.match(historyState({ status: "missed" }).label, /gönderilmedi/);
  assert.match(historyState({ status: "failed", failureReason: "interrupted" }).label, /Yarıda kaldı/);
  assert.equal(historyState({ status: "failed", failureReason: "no_audience" }).label, "Kitlede kimse yoktu");
  assert.equal(historyState({ status: "sent", sent: true }).tone, "ok");
});
