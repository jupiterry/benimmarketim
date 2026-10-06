import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import User from "../models/user.model.js";
import { VISIT_GAP_MS, isAppRequest, recordAppActivity, trackAppStage } from "../services/appActivity.service.js";

let seq = 0;
const customer = () => ({ _id: `507f191e810c19729de8c${String(++seq).padStart(3, "0")}`, role: "customer" });
const socket = () => { const sent = []; return { sent, to(room) { return { emit: (event, payload) => sent.push({ room, event, payload }) }; } }; };
// Veritabanını taklit eder: koşullu "yeni ziyaret" güncellemesi yalnızca ara yeterince uzunsa eşleşir
const fakeDb = (t, stored = {}) => {
  const state = { lastSeenAt: null, visitCount: 0, ...stored };
  t.mock.method(User, "findOneAndUpdate", (filter, update, options) => {
    assert.equal(options.timestamps, false); // updatedAt değişmemeli
    const limit = filter.$or[1]["appActivity.lastSeenAt"].$lt;
    const matches = state.lastSeenAt === null || state.lastSeenAt < limit;
    if (matches) {
      for (const [key, value] of Object.entries(update.$set)) state[key.replace("appActivity.", "")] = value;
      state.visitCount += update.$inc["appActivity.visitCount"];
    }
    return { select() { return this; }, lean: async () => (matches ? { name: "Ayşe Kaya", phone: "0555", appActivity: { ...state } } : null) };
  });
  t.mock.method(User, "updateOne", async (filter, update) => {
    for (const [key, value] of Object.entries(update.$set)) state[key.replace("appActivity.", "")] = value;
    return { modifiedCount: 1 };
  });
  return state;
};

test("the app is told apart from the website by how the request is signed", () => {
  assert.equal(isAppRequest({ headers: { "user-agent": "Dart/3.5 (dart:io)" }, cookies: {} }), true);
  assert.equal(isAppRequest({ headers: { authorization: "Bearer abc", "user-agent": "okhttp" }, cookies: {} }), true);
  assert.equal(isAppRequest({ headers: { "user-agent": "Mozilla/5.0" }, cookies: { accessToken: "x" } }), false);
  assert.equal(isAppRequest({ headers: { authorization: "Bearer abc", "user-agent": "Mozilla/5.0" }, cookies: { accessToken: "x" } }), false);
  assert.equal(isAppRequest({}), false);
});

test("the first request after a long pause starts a visit and notifies the panel once", async (t) => {
  const state = fakeDb(t); const io = socket(); const user = customer();
  const start = new Date("2026-10-06T09:00:00Z");
  assert.deepEqual(await recordAppActivity(user, null, { io, now: start }), { newVisit: true });
  assert.equal(io.sent.length, 1);
  assert.equal(io.sent[0].room, "adminRoom");
  assert.equal(io.sent[0].event, "appOpened");
  assert.equal(io.sent[0].payload.name, "Ayşe Kaya");
  assert.equal(io.sent[0].payload.visitCount, 1);
  assert.equal(state.visitStartedAt, start);

  // Bir dakika içindeki sıradan istekler veritabanına yazılmaz
  assert.equal(await recordAppActivity(user, null, { io, now: new Date(start.getTime() + 20_000) }), null);
  // Aynı ziyaret içindeki sonraki istek yalnızca "son görülme"yi günceller
  const later = new Date(start.getTime() + 10 * 60_000);
  assert.deepEqual(await recordAppActivity(user, null, { io, now: later }), { newVisit: false });
  assert.equal(state.lastSeenAt, later);
  assert.equal(io.sent.length, 1);

  // 30 dakikadan uzun aradan sonra yeni ziyaret ve yeni bildirim
  const again = new Date(later.getTime() + VISIT_GAP_MS + 1000);
  assert.deepEqual(await recordAppActivity(user, null, { io, now: again }), { newVisit: true });
  assert.equal(io.sent.length, 2);
  assert.equal(state.visitCount, 2);
});

test("funnel steps are stamped even right after another request", async (t) => {
  const state = fakeDb(t); const io = socket(); const user = customer();
  const start = new Date("2026-10-06T09:00:00Z");
  await recordAppActivity(user, null, { io, now: start });
  const checkout = new Date(start.getTime() + 5000);
  assert.deepEqual(await recordAppActivity(user, "checkout", { io, now: checkout }), { newVisit: false });
  assert.equal(state.checkoutAt, checkout);
  const order = new Date(start.getTime() + 9000);
  await recordAppActivity(user, "order", { io, now: order });
  assert.equal(state.orderAt, order);
  assert.equal(io.sent.length, 1);
  assert.equal(await recordAppActivity(user, "bilinmeyen", { io, now: order }), null);
});

test("admins and missing users are never tracked", async (t) => {
  const state = fakeDb(t); const io = socket();
  assert.equal(await recordAppActivity({ _id: "507f191e810c19729de8cfff", role: "admin" }, null, { io }), null);
  assert.equal(await recordAppActivity(null, null, { io }), null);
  assert.equal(state.visitCount, 0);
  assert.equal(io.sent.length, 0);
});

test("a step is only counted when the request succeeds and comes from the app", async (t) => {
  const state = fakeDb(t);
  const run = async (statusCode, headers) => {
    const res = new EventEmitter(); res.statusCode = statusCode;
    let nexted = false;
    trackAppStage("order")({ headers, cookies: {}, user: customer(), app: { get: () => null } }, res, () => { nexted = true; });
    assert.equal(nexted, true);
    res.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));
  };
  await run(400, { authorization: "Bearer abc" });
  assert.equal(state.orderAt, undefined);
  await run(201, { "user-agent": "Mozilla/5.0" });
  assert.equal(state.orderAt, undefined);
  await run(201, { authorization: "Bearer abc" });
  assert.ok(state.orderAt instanceof Date);
});
