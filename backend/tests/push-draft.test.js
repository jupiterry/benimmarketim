import assert from "node:assert/strict";
import test from "node:test";
import Settings, { DEFAULT_AI_MODEL, migrateLegacyAiModel } from "../models/settings.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { generateBroadcastDraft } from "../controllers/notification.controller.js";
import { buildDraftMessages, parseDraftOptions, DRAFT_TITLE_LIMIT } from "../services/pushDraft.service.js";

const response = () => {
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};

test("settings migrate the old OpenRouter default to the selected free Gemma model", async () => {
  let saved = false;
  const settings = { ai: { provider: "openrouter", model: "openai/gpt-4o" }, async save() { saved = true; } };
  assert.equal(await migrateLegacyAiModel(settings), settings);
  assert.equal(settings.ai.model, "google/gemma-4-26b-a4b-it:free");
  assert.equal(saved, true);
  const custom = { ai: { provider: "openrouter", model: "custom/model" }, async save() { throw new Error("custom model must not be rewritten"); } };
  await migrateLegacyAiModel(custom);
  assert.equal(custom.ai.model, "custom/model");
  assert.equal(DEFAULT_AI_MODEL, "google/gemma-4-26b-a4b-it:free");
});

test("push draft uses the configured AI and returns an editable title/body without sending", async (t) => {
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; });
  t.mock.method(Settings, "getSettings", async () => ({ ai: { provider: "openrouter", model: "test-model" } }));
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.model, "test-model");
    assert.equal(request.tools, undefined);
    assert.match(request.messages[0].content, /sepet ekranı/);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: "Bugün sepetine güzel bir fırsat ekle", body: "Bugünün indirimli ürünlerini keşfet; fırsatları sepetinde gör." }) } }] }) };
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  const res = response();
  await generateBroadcastDraft({ body: { prompt: "Bugün indirim var", target: "cart" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.title, "Bugün sepetine güzel bir fırsat ekle");
  assert.equal(res.body.body, "Bugünün indirimli ürünlerini keşfet; fırsatları sepetinde gör.");
});

test("push draft rejects blank or oversized prompts without contacting AI", async () => {
  const res = response();
  await generateBroadcastDraft({ body: { prompt: " " } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test("push draft rejects provider copy that exceeds push character limits", async (t) => {
  process.env.OPENROUTER_API_KEY = "test-only";
  t.after(() => { delete process.env.OPENROUTER_API_KEY; });
  t.mock.method(Settings, "getSettings", async () => ({ ai: { provider: "openrouter", model: "test-model" } }));
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: "x".repeat(61), body: "mesaj" }) } }] }) });
  t.after(() => { globalThis.fetch = oldFetch; });
  const res = response();
  await generateBroadcastDraft({ body: { prompt: "Kampanyayı duyur" } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.success, false);
});

const chain = (rows) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean() { return Promise.resolve(rows); } });
const aiReply = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });

test("prompt asks for emoji, three tones, no invented facts and the right screen", () => {
  const [system, user] = buildDraftMessages({ prompt: "Yurtta sabah kahvaltısı", target: "cart", recentTitles: ["Saat 23.00'ü geçti"] });
  assert.match(system.content, /Emoji kullan/);
  assert.match(system.content, /3 farklı/);
  assert.match(system.content, /uydurma/);
  assert.match(system.content, /sepet ekranı/);
  assert.match(system.content, /Saat 23\.00'ü geçti/);
  assert.match(user.content, /Yurtta sabah kahvaltısı/);
});

test("options are parsed, cleaned, deduplicated and limited", () => {
  const raw = "```json\n" + JSON.stringify({ options: [
    { tone: "Eğlenceli", title: "Günaydın ☕🥐", body: "Yurtta  kahvaltı keyfi bir dokunuş uzağında 🍳" },
    { tone: "Samimi", title: "Günaydın ☕🥐", body: "Yurtta  kahvaltı keyfi bir dokunuş uzağında 🍳" },
    { tone: "Uzun", title: "x".repeat(DRAFT_TITLE_LIMIT + 1), body: "olmaz" },
    { tone: "Harekete geçiren", title: "Kahvaltı hazır mı? 🍞", body: "Sabahı hızlı başlat, siparişini ver 🛒" },
  ] }) + "\n```";
  const options = parseDraftOptions(raw);
  assert.equal(options.length, 2);
  assert.equal(options[0].body, "Yurtta kahvaltı keyfi bir dokunuş uzağında 🍳");
  assert.deepEqual(parseDraftOptions('{"title":"Eski","body":"Biçim"}'), [{ tone: "", title: "Eski", body: "Biçim" }]);
  assert.deepEqual(parseDraftOptions("JSON değil"), []);
});

test("draft endpoint returns options with the first one as title/body", async (t) => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  t.mock.method(Settings, "getSettings", async () => ({ ai: { provider: "openrouter", model: "test" } }));
  t.mock.method(PushBroadcast, "find", () => chain([{ title: "Eski başlık" }]));
  let payload;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    payload = JSON.parse(options.body);
    return aiReply(JSON.stringify({ options: [{ tone: "Eğlenceli", title: "Günaydın ☕", body: "Kahvaltın yolda olabilir 🥐" }, { tone: "Samimi", title: "Sabah keyfi 🍳", body: "Yurtta güne güzel başla ☀️" }] }));
  });
  const res = response();
  await generateBroadcastDraft({ body: { prompt: "Yurtta kahvaltı", target: "home" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.title, "Günaydın ☕");
  assert.equal(res.body.options.length, 2);
  assert.equal(payload.temperature, 0.9);
  assert.equal(payload.max_tokens, 1800);
  assert.deepEqual(payload.reasoning, { enabled: false });
  assert.equal(payload.tools, undefined);
  assert.match(payload.messages[0].content, /Eski başlık/);
});

test("draft endpoint retries once when the first answer is unusable, then fails clearly", async (t) => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  t.mock.method(Settings, "getSettings", async () => ({ ai: {} }));
  t.mock.method(PushBroadcast, "find", () => chain([]));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return aiReply("üzgünüm"); });
  const res = response();
  await generateBroadcastDraft({ body: { prompt: "Kahvaltı" } }, res);
  assert.equal(calls, 2);
  assert.equal(res.statusCode, 502);
  const bad = response();
  await generateBroadcastDraft({ body: { prompt: "a" } }, bad);
  assert.equal(bad.statusCode, 400);
});

test("draft copy is polished and the least flawed option is offered first", () => {
  const options = parseDraftOptions(JSON.stringify({ options: [
    { tone: "Eğlenceli", title: "MUHTEŞEM FIRSAT!!! Hemen tıkla 🔥🔥🔥", body: "Kaçırma!!!" },
    { tone: "Samimi", title: "\"Gece acıktın mı? 🌙🍿🍫.\"", body: "Saat 23:00'e kadar %20 indirim , 1,5 litre kola dahil !! 🛒🎁🍕🥤" },
  ] }));
  assert.equal(options[0].tone, "Samimi");
  assert.equal(options[0].title, "Gece acıktın mı? 🌙🍿");
  assert.equal(options[0].body, "Saat 23:00'e kadar %20 indirim, 1,5 litre kola dahil! 🛒🎁🍕");
  assert.equal(options[1].title, "MUHTEŞEM FIRSAT! Hemen tıkla 🔥");
});
