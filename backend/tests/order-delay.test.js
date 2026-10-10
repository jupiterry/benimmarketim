import test from "node:test";
import assert from "node:assert/strict";
import { answerUserMessage } from "../services/ai/assistant.service.js";
import { delayNoticeMessage, extractShortOrderCode, formatWaitDuration, isAffirmative, isNegative, pickDelayedOrder, preparingMinutes } from "../services/ai/orderDelay.js";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import User from "../models/user.model.js";

const USER_ID = "507f191e810c19729de860ea";
const ORDER_ID = "64f1a2b3c4d5e6f76ac8bc4d";
const chain = (rows) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, populate() { return this; }, lean: async () => rows });
const one = (row) => ({ select() { return this; }, lean: async () => row });
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000);
const ORDER_SUMMARY = "📦 Sipariş #6ac8bc4d hakkında destek istiyorum.\n🗓️ Tarih: 09.10.2026 13:05\n💰 Tutar: ₺373,50\n📊 Durum: Hazırlanıyor";

const mockChatIo = (t, { order = null } = {}) => {
  const saved = []; const stateUpdates = []; const adminEvents = [];
  t.mock.method(Settings, "getSettings", async () => ({ ai: { enabled: true } }));
  t.mock.method(Message, "create", async (data) => { saved.push(data); return { ...data, _id: `m${saved.length}`, createdAt: new Date() }; });
  t.mock.method(Chat, "updateOne", async (filter, update) => { if (update.$set?.orderDelay) stateUpdates.push(update.$set.orderDelay); return {}; });
  t.mock.method(User, "findById", () => one({ name: "Nehir" }));
  t.mock.method(globalThis, "fetch", async () => { assert.fail("Delay flow must not call the AI provider"); });
  if (order) {
    t.mock.method(Order, "find", () => chain([order]));
    t.mock.method(Order, "findOne", () => one(order));
  }
  const io = { to: (room) => ({ emit: (event, payload) => adminEvents.push({ room, event, payload }) }) };
  return { saved, stateUpdates, adminEvents, io };
};

test("wait time is computed from the latest 'Hazırlanıyor' change and formatted in Turkish", () => {
  const now = new Date("2026-10-09T14:51:00+03:00");
  assert.equal(preparingMinutes({ status: "Hazırlanıyor", createdAt: "2026-10-09T14:01:00+03:00" }, now), 50);
  assert.equal(preparingMinutes({ status: "Hazırlanıyor", createdAt: "2026-10-09T10:00:00+03:00", statusHistory: [{ status: "Hazırlanıyor", changedAt: "2026-10-09T14:31:00+03:00" }] }, now), 20);
  assert.equal(preparingMinutes({ status: "Yolda", createdAt: "2026-10-09T10:00:00+03:00" }, now), 0);
  assert.equal(formatWaitDuration(50), "50 dakikadır");
  assert.equal(formatWaitDuration(80), "1 saat 20 dakikadır");
  assert.equal(formatWaitDuration(120), "2 saattir");
  assert.equal(formatWaitDuration(1600), "1 günü aşkın süredir");
  assert.match(delayNoticeMessage({ _id: ORDER_ID, status: "Hazırlanıyor", createdAt: "2026-10-09T14:01:00+03:00" }, now), /#6AC8BC4D\) 50 dakikadır hazırlandığını görüyorum.*market yetkilimize ilettim.*özür dileriz/);
});

test("the order the customer means is picked by id, short code or longest wait", () => {
  const now = new Date();
  const late = { _id: ORDER_ID, status: "Hazırlanıyor", createdAt: minutesAgo(70) };
  const fresh = { _id: "64f1a2b3c4d5e6f700000001", status: "Hazırlanıyor", createdAt: minutesAgo(10) };
  assert.equal(extractShortOrderCode(ORDER_SUMMARY), "6AC8BC4D");
  assert.equal(pickDelayedOrder([fresh, late], { now }), late);
  assert.equal(pickDelayedOrder([fresh, late], { shortCode: "6AC8BC4D", now }), late);
  assert.equal(pickDelayedOrder([fresh, late], { shortCode: "00000001", now }), null, "a named fresh order is not delayed");
  assert.equal(pickDelayedOrder([{ ...late, createdAt: minutesAgo(44) }], { now }), null, "under 45 minutes is not a delay");
  for (const yes of ["Evet", "evet lütfen", "Olur", "bağlayın", "Tabii"]) assert.equal(isAffirmative(yes), true, yes);
  for (const other of ["Tamam", "teşekkürler", "ne zaman gelir"]) assert.equal(isAffirmative(other), false, other);
  assert.equal(isNegative("Hayır gerek yok"), true);
});

test("delayed order: apology with computed wait, staff notified, then live support offer, then handoff on 'evet'", async (t) => {
  const order = { _id: ORDER_ID, status: "Hazırlanıyor", createdAt: minutesAgo(52) };
  const { saved, stateUpdates, adminEvents, io } = mockChatIo(t, { order });
  const chat = { _id: "507f191e810c19729de860eb", user: USER_ID, order: ORDER_ID, mode: "AI", status: "active" };

  const notice = await answerUserMessage({ chat, query: ORDER_SUMMARY, io });
  assert.match(notice.content, /#6AC8BC4D\) 52 dakikadır hazırlandığını görüyorum/);
  assert.match(notice.content, /market yetkilimize ilettim.*en kısa sürede yola çıkacaktır.*özür dileriz/);
  assert.equal(notice.meta.orderDelay.minutes, 52);
  assert.equal(stateUpdates.at(-1).stage, "notice");
  assert.ok(adminEvents.some((item) => item.room === "adminRoom" && item.event === "newChatMessage" && /Geciken sipariş #6AC8BC4D/.test(item.payload.message)));

  const offer = await answerUserMessage({ chat, query: "Ne zaman gelir acaba?", io });
  assert.match(offer.content, /canlı desteğe bağlayabilirim/);
  assert.equal(stateUpdates.at(-1).stage, "offer");

  let handoff = null;
  t.mock.method(Chat, "findOneAndUpdate", async () => chat);
  t.mock.method(SupportRequest, "findOneAndUpdate", async (filter, update) => { handoff = update.$setOnInsert; return { _id: "r1" }; });
  const result = await answerUserMessage({ chat, query: "Evet", io });
  assert.equal(result, null);
  assert.equal(handoff.priority, "high");
  assert.match(handoff.reason, /Geciken sipariş/);
  assert.equal(stateUpdates.at(-1).stage, "done");
  assert.equal(saved.filter((item) => /hazırlandığını görüyorum/.test(item.content)).length, 1, "apology is sent only once");
});

test("general chat: 'Siparişim nerede?' finds the user's own delayed order", async (t) => {
  const order = { _id: ORDER_ID, status: "Hazırlanıyor", createdAt: minutesAgo(95) };
  const { io } = mockChatIo(t);
  let filter;
  t.mock.method(Order, "find", (value) => { filter = value; return chain([order]); });
  const chat = { _id: "507f191e810c19729de860eb", user: USER_ID, mode: "AI", status: "active" };
  const reply = await answerUserMessage({ chat, query: "Siparişim nerede?", io });
  assert.equal(filter.user, USER_ID);
  assert.match(reply.content, /1 saat 35 dakikadır hazırlandığını görüyorum/);
});

test("offer is skipped once the order is on its way, and declining closes politely", async (t) => {
  const { io } = mockChatIo(t);
  t.mock.method(Order, "findOne", () => one({ status: "Yolda" }));
  t.mock.method(Order, "find", () => chain([{ _id: ORDER_ID, status: "Yolda", createdAt: minutesAgo(5), totalAmount: 100 }]));
  t.mock.method(Message, "find", () => chain([]));
  const chat = { _id: "c1", user: USER_ID, order: ORDER_ID, mode: "AI", status: "active", orderDelay: { order: ORDER_ID, stage: "notice" } };
  const reply = await answerUserMessage({ chat, query: "Teşekkürler", io });
  assert.doesNotMatch(reply.content, /canlı desteğe bağlayabilirim/);
  assert.equal(chat.orderDelay.stage, "done");

  const declined = { _id: "c2", user: USER_ID, mode: "AI", status: "active", orderDelay: { order: ORDER_ID, stage: "offer" } };
  const answer = await answerUserMessage({ chat: declined, query: "Hayır, gerek yok", io });
  assert.match(answer.content, /Başka bir konuda yardımcı olabilirsem/);
});

test("orders under 45 minutes keep the normal assistant flow", async (t) => {
  const order = { _id: ORDER_ID, status: "Hazırlanıyor", createdAt: minutesAgo(20) };
  mockChatIo(t, { order });
  t.mock.method(Message, "find", () => chain([]));
  const chat = { _id: "c3", user: USER_ID, order: ORDER_ID, mode: "AI", status: "active" };
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  const { default: AiRequestLog } = await import("../models/aiRequestLog.model.js");
  t.mock.method(AiRequestLog, "create", async () => ({}));
  globalThis.fetch.mock.mockImplementation(async (url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.messages[0].content, /"preparingMinutes":20/);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Siparişiniz hazırlanıyor." } }] }) };
  });
  const reply = await answerUserMessage({ chat, query: ORDER_SUMMARY });
  assert.equal(reply.content, "Siparişiniz hazırlanıyor.");
});
