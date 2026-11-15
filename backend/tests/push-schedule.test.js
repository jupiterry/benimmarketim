// Planlı toplu bildirimler: planlama kuralları, sahiplenme (çift gönderim olmaz), yeniden başlatma güvenliği,
// kaçan planlar ve dakikalık tur. PushBroadcast küçük bir bellek deposuyla taklit edilir (koşullu güncellemeler gerçek).
import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { cancelScheduled, scheduleBroadcast, sendBroadcast, sendScheduledNow, updateScheduled } from "../controllers/notification.controller.js";
import { resetBroadcastCaches } from "../services/pushBroadcast.service.js";
import {
  MAX_PENDING_SCHEDULES, createScheduledBroadcast, parseScheduledFor, processScheduledBroadcast, runPushScheduleTick, sendScheduledBroadcastNow,
  updateScheduledBroadcast,
} from "../services/pushSchedule.service.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-03-10T12:00:00Z"); // İstanbul 15:00
const at = (ms) => new Date(NOW.getTime() + ms);
const oid = (n) => `65d0000000000000000${String(n).padStart(5, "0")}`;
const admin = { _id: oid(999) };
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };

// ── Bellek deposu: sorgu eşleştirme (eşitlik, $ne, $in, $nin, $gte, $lte, $lt, $or) ─────────────────────────────
const same = (a, b) => (a instanceof Date || b instanceof Date ? a !== null && b !== null && a !== undefined && b !== undefined && new Date(a).getTime() === new Date(b).getTime() : String(a) === String(b));
const matchValue = (value, condition) => {
  if (condition === null) return value === null || value === undefined;
  if (typeof condition !== "object" || condition instanceof Date) return value !== null && value !== undefined && same(value, condition);
  return Object.entries(condition).every(([op, operand]) => {
    if (op === "$ne") return !matchValue(value, operand);
    if (op === "$in") return operand.some((item) => matchValue(value, item));
    if (op === "$nin") return !operand.some((item) => matchValue(value, item));
    if (value === null || value === undefined) return false;
    const left = new Date(value).getTime(); const right = new Date(operand).getTime();
    if (op === "$gte") return left >= right;
    if (op === "$lte") return left <= right;
    if (op === "$lt") return left < right;
    throw new Error(`desteklenmeyen işleç: ${op}`);
  });
};
const matches = (doc, query) => Object.entries(query).every(([key, condition]) => (key === "$or" ? condition.some((part) => matches(doc, part)) : matchValue(doc[key], condition)));

const setup = (t, { docs = [], users = [oid(1), oid(2)], configured = true } = {}) => {
  const previous = { key: process.env.ONESIGNAL_REST_API_KEY, app: process.env.ONESIGNAL_APP_ID };
  if (configured) { process.env.ONESIGNAL_REST_API_KEY = "test-only"; process.env.ONESIGNAL_APP_ID = "app-test"; } else { delete process.env.ONESIGNAL_REST_API_KEY; delete process.env.ONESIGNAL_APP_ID; }
  t.after(() => {
    if (previous.key === undefined) delete process.env.ONESIGNAL_REST_API_KEY; else process.env.ONESIGNAL_REST_API_KEY = previous.key;
    if (previous.app === undefined) delete process.env.ONESIGNAL_APP_ID; else process.env.ONESIGNAL_APP_ID = previous.app;
  });
  resetBroadcastCaches();
  t.after(resetBroadcastCaches);
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "warn", () => {});
  const fx = { store: docs.map((doc) => ({ sent: false, zone: "", route: "/home", ...doc })), users, userFilters: [], pushes: [], seq: 100 };
  const query = (run) => { const q = { select: () => q, sort: () => q, limit: () => q, populate: () => q, lean: async () => run() }; return q; };
  t.mock.method(PushBroadcast, "findOneAndUpdate", (filter, update) => query(() => {
    const doc = fx.store.find((item) => matches(item, filter));
    if (!doc) return null;
    Object.assign(doc, update.$set);
    return { ...doc };
  }));
  t.mock.method(PushBroadcast, "findOne", (filter) => query(() => { const doc = fx.store.find((item) => matches(item, filter)); return doc ? { ...doc } : null; }));
  t.mock.method(PushBroadcast, "find", (filter) => query(() => fx.store.filter((item) => matches(item, filter)).sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor)).map((doc) => ({ ...doc }))));
  t.mock.method(PushBroadcast, "countDocuments", async (filter) => fx.store.filter((item) => matches(item, filter)).length);
  t.mock.method(PushBroadcast, "updateOne", async (filter, update) => {
    const doc = fx.store.find((item) => matches(item, filter));
    if (doc) Object.assign(doc, update.$set);
    return { modifiedCount: doc ? 1 : 0 };
  });
  t.mock.method(PushBroadcast, "updateMany", async (filter, update) => {
    const hit = fx.store.filter((item) => matches(item, filter));
    for (const doc of hit) Object.assign(doc, update.$set);
    return { modifiedCount: hit.length };
  });
  t.mock.method(PushBroadcast, "create", async (doc) => { fx.seq += 1; const record = { _id: oid(fx.seq), sent: false, ...doc }; fx.store.push(record); return record; });
  // Kitle sorgusu ve push.service'in izin sorgusu aynı kullanıcıları döndürür
  t.mock.method(User, "find", (filter) => { fx.userFilters.push(filter); return query(() => fx.users.map((_id) => ({ _id }))); });
  t.mock.method(Order, "aggregate", async () => [{ _id: oid(1), zoneId: "devrek" }, { _id: oid(2), point: "girlsDorm" }]);
  t.mock.method(globalThis, "fetch", async (_url, options) => { fx.pushes.push(JSON.parse(options.body)); return { ok: true, status: 200 }; });
  fx.get = (id) => fx.store.find((doc) => String(doc._id) === String(id));
  return fx;
};
const plan = (n, overrides = {}) => ({ _id: oid(n), title: `Plan ${n}`, body: "Mesaj", audience: "all", status: "scheduled", scheduledFor: at(-MINUTE), sentBy: admin._id, createdAt: at(-HOUR), ...overrides });
const input = (overrides = {}) => ({ title: "Akşam fırsatı", body: "Bu akşama özel", audience: "all", zone: "", target: "home", scheduledFor: at(HOUR).toISOString(), ...overrides });

test("scheduled time must carry a time zone, be in the future and at most 30 days ahead", () => {
  assert.equal(parseScheduledFor("2026-03-10T17:30:00.000Z", NOW).toISOString(), "2026-03-10T17:30:00.000Z");
  // İstanbul saatiyle yazılmış değer doğru ana çevrilir; saniyeler atılır
  assert.equal(parseScheduledFor("2026-03-10T20:30:45+03:00", NOW).toISOString(), "2026-03-10T17:30:00.000Z");
  // Saat dilimi olmayan değer sunucunun yerel saatine göre yorumlanırdı: kabul edilmez
  assert.throws(() => parseScheduledFor("2026-03-10T20:30", NOW), /Geçersiz gönderim zamanı/);
  assert.throws(() => parseScheduledFor("yarın", NOW), /Geçersiz gönderim zamanı/);
  assert.throws(() => parseScheduledFor(NOW.getTime() + HOUR, NOW), /Geçersiz gönderim zamanı/);
  assert.throws(() => parseScheduledFor({ $gt: "" }, NOW), /Geçersiz gönderim zamanı/);
  assert.throws(() => parseScheduledFor("2026-13-45T20:30:00Z", NOW), /Geçersiz gönderim zamanı/);
  assert.throws(() => parseScheduledFor(NOW.toISOString(), NOW), /en az 1 dakika/);
  assert.throws(() => parseScheduledFor(at(-HOUR).toISOString(), NOW), /en az 1 dakika/);
  assert.equal(parseScheduledFor(at(MINUTE).toISOString(), NOW).getTime(), at(MINUTE).getTime());
  assert.equal(parseScheduledFor(at(30 * 24 * HOUR).toISOString(), NOW).getTime(), at(30 * 24 * HOUR).getTime());
  assert.throws(() => parseScheduledFor(at(30 * 24 * HOUR + MINUTE).toISOString(), NOW), /en fazla 30 gün/);
});

test("scheduling stores the plan without sending and validates like an immediate send", async (t) => {
  const fx = setup(t);
  const record = await createScheduledBroadcast(input({ title: "  Akşam fırsatı ", zone: "devrek", target: "cart" }), admin, { now: NOW });
  assert.equal(record.status, "scheduled");
  assert.equal(record.title, "Akşam fırsatı");
  assert.equal(record.zone, "devrek");
  assert.equal(record.route, "/cart");
  assert.equal(String(record.sentBy), admin._id);
  assert.equal(record.scheduledFor.getTime(), at(HOUR).getTime());
  assert.equal(fx.pushes.length, 0, "planlama bildirim göndermez");
  await assert.rejects(createScheduledBroadcast(input({ title: "" }), admin, { now: NOW }), /Başlık/);
  await assert.rejects(createScheduledBroadcast(input({ audience: "self" }), admin, { now: NOW }), /Geçersiz hedef kitle/);
  await assert.rejects(createScheduledBroadcast(input({ audience: "custom" }), admin, { now: NOW }), /Geçersiz hedef kitle/);
  await assert.rejects(createScheduledBroadcast(input({ zone: "mars" }), admin, { now: NOW }), /Geçersiz bölge/);
  await assert.rejects(createScheduledBroadcast(input({ target: "https://x" }), admin, { now: NOW }), /Geçersiz açılış ekranı/);
  await assert.rejects(createScheduledBroadcast(input({ scheduledFor: undefined }), admin, { now: NOW }), /Geçersiz gönderim zamanı/);
  assert.equal(fx.store.length, 1);
});

test("the same text cannot be scheduled twice for the same ten minutes, nor sent now while it is about to go out", async (t) => {
  const fx = setup(t);
  await createScheduledBroadcast(input(), admin, { now: NOW });
  await assert.rejects(createScheduledBroadcast(input({ scheduledFor: at(HOUR + 9 * MINUTE).toISOString() }), admin, { now: NOW }), (error) => error.status === 409 && /zaten planlı/.test(error.message));
  // Aynı metin, başka bir saat: olur
  await createScheduledBroadcast(input({ scheduledFor: at(3 * HOUR).toISOString() }), admin, { now: NOW });
  // Başka metin, aynı saat: olur
  await createScheduledBroadcast(input({ body: "Başka mesaj" }), admin, { now: NOW });
  assert.equal(fx.store.length, 3);
  // Az önce gönderilmiş aynı metin, şimdiye yakın bir saate planlanamaz
  fx.store.push({ _id: oid(7), title: "Gitti", body: "Az önce", audience: "all", sent: true, status: "sent", sentAt: at(-2 * MINUTE), createdAt: at(-2 * MINUTE) });
  await assert.rejects(createScheduledBroadcast(input({ title: "Gitti", body: "Az önce", scheduledFor: at(5 * MINUTE).toISOString() }), admin, { now: NOW }), (error) => error.status === 409 && /son 10 dakika/.test(error.message));
  // Anlık gönderim: aynı metin birkaç dakika sonraya planlıysa engellenir
  fx.store.push(plan(8, { title: "Yakında", body: "Planlı", scheduledFor: new Date(Date.now() + 5 * MINUTE) }));
  const res = response();
  await sendBroadcast({ body: { title: "Yakında", body: "Planlı", audience: "all" }, user: admin }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /zaten planlı/);
  assert.equal(fx.pushes.length, 0);
});

test("at most 20 plans can wait and scheduling needs a configured push service", async (t) => {
  const fx = setup(t, { docs: Array.from({ length: MAX_PENDING_SCHEDULES }, (_, index) => plan(index + 1, { scheduledFor: at((index + 2) * HOUR) })) });
  await assert.rejects(createScheduledBroadcast(input(), admin, { now: NOW }), (error) => error.status === 409 && error.code === "limit");
  fx.store[0].status = "cancelled";
  await createScheduledBroadcast(input(), admin, { now: NOW });
  const off = setup(t, { configured: false });
  await assert.rejects(createScheduledBroadcast(input(), admin, { now: NOW }), (error) => error.status === 503);
  assert.equal(off.store.length, 0);
});

test("a due plan is claimed once, resolves its audience at send time and records the outcome", async (t) => {
  const fx = setup(t, { docs: [plan(1, { zone: "devrek", route: "/cart" })], users: [oid(1)] });
  const first = await processScheduledBroadcast(oid(1), { now: NOW });
  assert.equal(first.claimed, true);
  assert.equal(first.sent, true);
  // Kitle gönderim anında hesaplanır: bölge üyeleri + kampanya izni
  assert.deepEqual(fx.userFilters[0].$and[1]._id.$in, [oid(1)]);
  assert.deepEqual(fx.userFilters[0]["notificationPreferences.campaigns"], { $ne: false });
  assert.equal(fx.pushes.length, 1);
  assert.deepEqual(fx.pushes[0].include_aliases.external_id, [oid(1)]);
  assert.deepEqual(fx.pushes[0].data, { type: "broadcast", broadcastId: oid(1), route: "/cart" });
  const doc = fx.get(oid(1));
  assert.equal(doc.status, "sent");
  assert.equal(doc.sent, true);
  assert.equal(doc.targetedCount, 1);
  assert.equal(doc.audienceSize, 1);
  assert.equal(doc.sentAt.getTime(), NOW.getTime());
  assert.deepEqual(doc.recipients, [oid(1)]);
  assert.equal(doc.resultsAvailable, true);
  // İkinci çağrı (başka tur / başka süreç / yeniden başlatma): sahiplenemez, göndermez
  const second = await processScheduledBroadcast(oid(1), { now: NOW });
  assert.deepEqual(second, { claimed: false });
  assert.equal(fx.pushes.length, 1);
});

test("two concurrent attempts on the same plan send exactly once", async (t) => {
  const fx = setup(t, { docs: [plan(1)] });
  const outcomes = await Promise.all([processScheduledBroadcast(oid(1), { now: NOW }), processScheduledBroadcast(oid(1), { now: NOW }), sendScheduledBroadcastNow(oid(1), { now: NOW }).catch((error) => ({ claimed: false, status: error.status }))]);
  assert.equal(outcomes.filter((outcome) => outcome.claimed).length, 1);
  assert.equal(fx.pushes.length, 1);
});

test("a plan with nobody to send to, or without push keys, is marked failed and never retried", async (t) => {
  const empty = setup(t, { docs: [plan(1)], users: [] });
  let outcome = await processScheduledBroadcast(oid(1), { now: NOW });
  assert.equal(outcome.sent, false);
  assert.equal(outcome.reason, "no_audience");
  assert.equal(empty.get(oid(1)).status, "failed");
  assert.equal(empty.get(oid(1)).failureReason, "no_audience");
  assert.equal((await runPushScheduleTick({ now: at(MINUTE) })).sent, 0);
  assert.equal(empty.pushes.length, 0);

  const off = setup(t, { docs: [plan(2)], configured: false });
  outcome = await processScheduledBroadcast(oid(2), { now: NOW });
  assert.equal(outcome.reason, "not_configured");
  assert.equal(off.get(oid(2)).status, "failed");

  // Kitle sorgusu hata verirse (veritabanı): başarısız işaretlenir, bildirim gitmez
  const broken = setup(t, { docs: [plan(3)] });
  t.mock.method(console, "error", () => {});
  t.mock.method(User, "find", () => { throw new Error("connection timed out"); });
  outcome = await processScheduledBroadcast(oid(3), { now: NOW });
  assert.equal(outcome.reason, "error");
  assert.equal(broken.get(oid(3)).status, "failed");
  assert.equal(broken.pushes.length, 0);
});

test("a rejected send is recorded as failed with the provider's reason", async (t) => {
  const fx = setup(t, { docs: [plan(1)] });
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 401, json: async () => ({ errors: ["Access denied"] }) }));
  const outcome = await processScheduledBroadcast(oid(1), { now: NOW });
  assert.equal(outcome.sent, false);
  assert.equal(outcome.reason, "auth");
  const doc = fx.get(oid(1));
  assert.equal(doc.status, "failed");
  assert.equal(doc.failureReason, "auth");
  assert.deepEqual(doc.recipients, []);
  assert.equal(doc.resultsAvailable, false);
});

test("the minute tick sends due plans in order, leaves future ones and never sends twice", async (t) => {
  const fx = setup(t, { docs: [
    plan(1, { scheduledFor: at(-5 * MINUTE) }),
    plan(2, { scheduledFor: at(-30 * MINUTE) }),
    plan(3, { scheduledFor: at(MINUTE) }),
    plan(4, { status: "cancelled", scheduledFor: at(-MINUTE) }),
    // Eski kayıt: status yok, zamanlayıcı dokunmaz
    { _id: oid(5), title: "Eski", body: "Kayıt", audience: "all", sent: true, createdAt: at(-90 * 24 * HOUR) },
  ] });
  const first = await runPushScheduleTick({ now: NOW });
  assert.deepEqual(first, { interrupted: 0, missed: 0, sent: 2, failed: 0 });
  assert.deepEqual(fx.pushes.map((push) => push.data.broadcastId), [oid(2), oid(1)]);
  assert.equal(fx.get(oid(3)).status, "scheduled");
  assert.equal(fx.get(oid(4)).status, "cancelled");
  assert.equal(fx.get(oid(5)).status, undefined);
  // Aynı dakika yeniden çalışırsa (yeniden başlatma) hiçbir şey göndermez
  assert.deepEqual(await runPushScheduleTick({ now: NOW }), { interrupted: 0, missed: 0, sent: 0, failed: 0 });
  assert.equal(fx.pushes.length, 2);
  // Sonraki plan zamanı gelince gider
  assert.equal((await runPushScheduleTick({ now: at(MINUTE) })).sent, 1);
  assert.equal(fx.pushes.length, 3);
});

test("plans missed by more than two hours while the server was down are not sent", async (t) => {
  const fx = setup(t, { docs: [
    plan(1, { scheduledFor: at(-2 * HOUR - MINUTE) }),
    plan(2, { scheduledFor: at(-2 * HOUR + MINUTE) }),
  ] });
  const result = await runPushScheduleTick({ now: NOW });
  assert.equal(result.missed, 1);
  assert.equal(result.sent, 1);
  assert.equal(fx.get(oid(1)).status, "missed");
  assert.equal(fx.get(oid(1)).failureReason, "missed");
  assert.equal(fx.get(oid(1)).sent, false);
  assert.equal(fx.get(oid(2)).status, "sent");
  assert.deepEqual(fx.pushes.map((push) => push.data.broadcastId), [oid(2)]);
  // Zamanlayıcı, 2 saatten fazla gecikmiş bir planı doğrudan da sahiplenmez
  fx.store.push(plan(3, { scheduledFor: at(-3 * HOUR) }));
  assert.deepEqual(await processScheduledBroadcast(oid(3), { now: NOW, dueOnly: true }), { claimed: false });
});

test("a send interrupted by a restart is marked failed after 15 minutes and is not re-sent", async (t) => {
  const fx = setup(t, { docs: [
    plan(1, { status: "sending", claimedAt: at(-16 * MINUTE) }),
    plan(2, { status: "sending", claimedAt: at(-14 * MINUTE) }),
  ] });
  const result = await runPushScheduleTick({ now: NOW });
  assert.equal(result.interrupted, 1);
  assert.equal(fx.get(oid(1)).status, "failed");
  assert.equal(fx.get(oid(1)).failureReason, "interrupted");
  assert.equal(fx.get(oid(2)).status, "sending", "henüz 15 dakika olmadı");
  assert.equal(fx.pushes.length, 0, "yarıda kalan gönderim yeniden gönderilmez");
  assert.equal((await runPushScheduleTick({ now: at(HOUR) })).sent, 0);
  assert.equal(fx.pushes.length, 0);
});

test("one failing step does not stop the tick", async (t) => {
  const fx = setup(t, { docs: [plan(1)] });
  t.mock.method(console, "error", () => {});
  t.mock.method(PushBroadcast, "updateMany", async () => { throw new Error("write conflict"); });
  const result = await runPushScheduleTick({ now: NOW });
  assert.equal(result.sent, 1);
  assert.equal(result.error, "write conflict");
  assert.equal(fx.pushes.length, 1);
});

test("editing changes only a plan that is still scheduled; a postponed plan is not sent at its old time", async (t) => {
  const fx = setup(t, { docs: [plan(1, { scheduledFor: at(10 * MINUTE) }), plan(2, { status: "sending", claimedAt: NOW }), plan(3, { scheduledFor: at(-MINUTE) })] });
  const updated = await updateScheduledBroadcast(oid(1), input({ title: "Yeni başlık", audience: "inactive30", zone: "girlsDorm", scheduledFor: at(2 * HOUR).toISOString() }), admin, { now: NOW });
  assert.equal(updated.title, "Yeni başlık");
  assert.equal(updated.audience, "inactive30");
  assert.equal(updated.zone, "girlsDorm");
  assert.equal(updated.scheduledFor.getTime(), at(2 * HOUR).getTime());
  assert.equal(String(updated.updatedBy), admin._id);
  assert.equal(updated.status, "scheduled");
  // Gönderimi başlamış plan düzenlenemez
  await assert.rejects(updateScheduledBroadcast(oid(2), input(), admin, { now: NOW }), (error) => error.status === 409 && error.code === "not_scheduled");
  await assert.rejects(updateScheduledBroadcast("nope", input(), admin, { now: NOW }), (error) => error.status === 400);
  await assert.rejects(updateScheduledBroadcast(oid(1), input({ scheduledFor: at(-MINUTE).toISOString() }), admin, { now: NOW }), /en az 1 dakika/);
  // Kendi kendisiyle çakışmaz (aynı metin, aynı saat)
  await updateScheduledBroadcast(oid(1), input({ title: "Yeni başlık", scheduledFor: at(2 * HOUR).toISOString() }), admin, { now: NOW });
  // Zamanlayıcı listeyi okuduktan sonra ertelenen plan eski saatinde gönderilmez
  await updateScheduledBroadcast(oid(3), input({ title: "Ertelendi", scheduledFor: at(HOUR).toISOString() }), admin, { now: NOW });
  assert.deepEqual(await processScheduledBroadcast(oid(3), { now: NOW, dueOnly: true }), { claimed: false });
  assert.equal(fx.pushes.length, 0);
});

test("controller: schedule, edit, cancel and send-now answer with clear statuses", async (t) => {
  const fx = setup(t);
  const soon = new Date(Date.now() + HOUR).toISOString();
  let res = response();
  await scheduleBroadcast({ body: input({ scheduledFor: soon }), user: admin }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.broadcast.status, "scheduled");
  assert.equal(res.body.broadcast.target, "home");
  assert.match(res.body.message, /için planlandı$/);
  const planId = String(res.body.broadcast._id);
  res = response(); await scheduleBroadcast({ body: input({ scheduledFor: "2020-01-01T10:00:00Z" }), user: admin }, res);
  assert.equal(res.statusCode, 400);
  res = response(); await updateScheduled({ params: { id: planId }, body: input({ title: "Düzeltildi", target: "orders", scheduledFor: soon }), user: admin }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.broadcast.title, "Düzeltildi");
  assert.equal(res.body.broadcast.target, "orders");
  // Şimdi gönder: planı sahiplenir ve gönderir
  res = response(); await sendScheduledNow({ params: { id: planId }, user: admin }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.targeted, 2);
  assert.equal(fx.get(planId).status, "sent");
  assert.equal(fx.pushes.length, 1);
  // Gönderilmiş plan artık iptal edilemez, düzenlenemez, yeniden gönderilemez
  res = response(); await cancelScheduled({ params: { id: planId }, user: admin }, res); assert.equal(res.statusCode, 409);
  res = response(); await updateScheduled({ params: { id: planId }, body: input({ scheduledFor: soon }), user: admin }, res); assert.equal(res.statusCode, 409);
  res = response(); await sendScheduledNow({ params: { id: planId }, user: admin }, res); assert.equal(res.statusCode, 409);
  assert.equal(fx.pushes.length, 1);
  // İptal
  res = response(); await scheduleBroadcast({ body: input({ title: "İptal edilecek", scheduledFor: soon }), user: admin }, res);
  const second = String(res.body.broadcast._id);
  res = response(); await cancelScheduled({ params: { id: second }, user: admin }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(fx.get(second).status, "cancelled");
  assert.ok(fx.get(second).cancelledAt instanceof Date);
  assert.equal((await runPushScheduleTick({ now: new Date(Date.now() + 2 * HOUR) })).sent, 0);
  res = response(); await cancelScheduled({ params: { id: "x" }, user: admin }, res); assert.equal(res.statusCode, 400);
});

test("send-now is blocked when the same text went out in the last ten minutes and reports an empty audience", async (t) => {
  const fx = setup(t, { docs: [
    plan(1, { title: "Aynı", body: "Metin", scheduledFor: at(HOUR) }),
    { _id: oid(2), title: "Aynı", body: "Metin", audience: "all", sent: true, status: "sent", sentAt: at(-3 * MINUTE), createdAt: at(-3 * MINUTE) },
  ] });
  await assert.rejects(sendScheduledBroadcastNow(oid(1), { now: NOW }), (error) => error.status === 409 && error.code === "duplicate");
  assert.equal(fx.get(oid(1)).status, "scheduled");
  assert.equal(fx.pushes.length, 0);
  const empty = setup(t, { docs: [plan(3, { scheduledFor: new Date(Date.now() + HOUR) })], users: [] });
  const res = response();
  await sendScheduledNow({ params: { id: oid(3) }, user: admin }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /bildirim alabilecek müşteri yok/);
  assert.equal(empty.get(oid(3)).status, "failed");
});
