import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENROUTER_MODELS_URL, availableIds, freeModels, getOpenRouterModels, isAvailable, parseOpenRouterModels,
  rankFreeModels, resetOpenRouterModelCache,
} from "../services/ai/openrouterModels.service.js";
import { OpenAiCompatibleProvider, createAiProvider } from "../services/ai/providers.js";
import { describeAiDraftFailure, generateBroadcastDraft } from "../controllers/notification.controller.js";
import { getAiModels } from "../controllers/settings.controller.js";
import Settings, { DEFAULT_AI_MODEL, resolveAiConfig } from "../models/settings.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";

const CHAT_URL = "https://example.invalid/chat";

const MODEL_LIST = {
  data: [
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", context_length: 65536, supported_parameters: ["tools", "temperature"] },
    { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B (free)", context_length: 96000, supported_parameters: ["temperature"] },
    { id: "google/gemma-3-12b-it:free", name: "Gemma 3 12B (free)", context_length: 32768, supported_parameters: ["temperature", "tools"] },
    { id: "some-lab/unknown-model:free", name: "Unknown (free)", context_length: 200000, supported_parameters: ["tools"] },
    { id: "openrouter/stealth-model:free", name: "Stealth", context_length: 1000000, supported_parameters: ["tools"] },
    { id: "lab/inkling-preview:free", name: "Inkling", context_length: 128000, supported_parameters: ["tools"] },
    { id: "tiny/model:free", name: "Tiny", context_length: 4096, supported_parameters: ["tools"] },
    { id: "image/gen:free", name: "Image", context_length: 32768, architecture: { output_modalities: ["image"] } },
    { id: "openai/gpt-4o", name: "GPT-4o", context_length: 128000, supported_parameters: ["tools"] },
  ],
};

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const quiet = (t) => { t.mock.method(console, "warn", () => {}); t.mock.method(console, "info", () => {}); };

const withKey = (t, value = "test-key") => {
  const old = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = value;
  t.after(() => { if (old === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = old; });
};

// fetch'i adrese göre yönlendirir: model listesi ve sohbet uç noktası ayrı sayılır.
const routeFetch = (t, { models = () => reply(200, MODEL_LIST), chat }) => {
  const calls = { models: [], chat: [] };
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (url === OPENROUTER_MODELS_URL) { calls.models.push(options); return models(calls.models.length); }
    const payload = JSON.parse(options.body);
    calls.chat.push(payload);
    return chat(payload, calls.chat.length, url);
  });
  return calls;
};

const openrouter = (model) => new OpenAiCompatibleProvider({ name: "openrouter", model, apiKey: "test", url: CHAT_URL });

test("discovery parses the model list and ranks free models (known families, tools, context; privacy exclusions)", () => {
  const models = parseOpenRouterModels(MODEL_LIST);
  assert.equal(models.length, MODEL_LIST.data.length);
  const llama = models.find((m) => m.id === "meta-llama/llama-3.3-70b-instruct:free");
  assert.deepEqual({ free: llama.free, tools: llama.tools, context: llama.context, name: llama.name }, { free: true, tools: true, context: 65536, name: "Llama 3.3 70B (free)" });
  assert.equal(models.find((m) => m.id === "openai/gpt-4o").free, false);

  assert.deepEqual(rankFreeModels(models).map((m) => m.id), [
    "google/gemma-3-27b-it:free", // bilinen aile, geniş bağlam
    "google/gemma-3-12b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "some-lab/unknown-model:free", // bilinmeyen aile en sonda
  ]);
  assert.deepEqual(rankFreeModels(models, { needsTools: true }).map((m) => m.id), [
    "google/gemma-3-12b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "some-lab/unknown-model:free",
  ]);
  assert.equal(parseOpenRouterModels({ choices: [] }), null);
  assert.equal(parseOpenRouterModels(null), null);
});

test("discovery caches the list, sends the API key, and answers availability", async (t) => {
  await resetOpenRouterModelCache();
  withKey(t, "secret-key");
  const calls = routeFetch(t, { chat: () => { throw new Error("chat must not be called"); } });
  assert.equal(await getOpenRouterModels({ cachedOnly: true }), null); // ağa çıkmaz
  assert.equal(calls.models.length, 0);
  const ids = await availableIds();
  assert.ok(ids.has("openai/gpt-4o"));
  assert.equal(calls.models[0].headers.Authorization, "Bearer secret-key");
  assert.equal(calls.models[0].method, "GET");
  assert.ok(calls.models[0].signal); // zaman aşımı için
  assert.deepEqual((await freeModels({ needsTools: true })).slice(0, 1), ["google/gemma-3-12b-it:free"]);
  assert.equal(await isAvailable("google/gemma-3-27b-it:free"), true);
  assert.equal(await isAvailable("google/gemma-4-26b-a4b-it:free"), false);
  assert.ok(await getOpenRouterModels({ cachedOnly: true }));
  assert.equal(calls.models.length, 1); // 6 saatlik önbellekten
  await getOpenRouterModels({ refresh: true });
  assert.equal(calls.models.length, 2);
});

test("discovery failures return null (unknown), never throw, and back off", async (t) => {
  quiet(t);
  await resetOpenRouterModelCache();
  const calls = routeFetch(t, { models: () => reply(503, {}), chat: () => reply(200, {}) });
  assert.equal(await availableIds(), null);
  assert.equal(await freeModels(), null);
  assert.equal(await isAvailable("x"), null);
  assert.equal(calls.models.length, 1); // ardışık çağrılar beklemede, tekrar istek atılmaz

  await resetOpenRouterModelCache();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("ECONNRESET"); });
  assert.equal(await availableIds(), null);
  await resetOpenRouterModelCache();
  t.mock.method(globalThis, "fetch", async () => reply(200, { not: "a list" }));
  assert.equal(await availableIds(), null);
});

test("provider retries once with discovered free models when the configured model returns 404", async (t) => {
  quiet(t);
  await resetOpenRouterModelCache();
  const calls = routeFetch(t, {
    chat: (_payload, n) => n === 1
      ? reply(404, { error: { code: 404, message: "No endpoints found for google/gemma-4-26b-a4b-it:free." } })
      : reply(200, { model: "google/gemma-3-27b-it:free", choices: [{ message: { content: "Hazır" } }] }),
  });
  const result = await openrouter(DEFAULT_AI_MODEL).complete([{ role: "user", content: "x" }], [], { reasoning: false });
  assert.equal(result.content, "Hazır");
  assert.equal(calls.chat.length, 2);
  // İlk deneme: liste bilinmiyordu, statik yedekler gönderildi
  assert.equal(calls.chat[0].models[0], DEFAULT_AI_MODEL);
  // İkinci deneme: canlı listeden, denenmemiş ve en fazla 3 model
  assert.deepEqual(calls.chat[1].models, ["google/gemma-3-27b-it:free", "google/gemma-3-12b-it:free", "meta-llama/llama-3.3-70b-instruct:free"]);
  assert.ok(calls.chat[1].models.every((id) => !calls.chat[0].models.includes(id)));
  assert.deepEqual(calls.chat[1].reasoning, { enabled: false });
  assert.equal(calls.models.length, 1);
});

test("tool requests only fall back to tool-capable models, also for 400 'tool use' errors", async (t) => {
  quiet(t);
  await resetOpenRouterModelCache();
  const calls = routeFetch(t, {
    chat: (_payload, n) => n === 1
      ? reply(400, { error: { code: 400, message: "No endpoints found that support tool use." } })
      : reply(200, { model: "google/gemma-3-12b-it:free", choices: [{ message: { content: "", tool_calls: [{ id: "1", type: "function", function: { name: "getStoreInfo", arguments: "{}" } }] } }] }),
  });
  const result = await openrouter(DEFAULT_AI_MODEL).complete([{ role: "user", content: "saat kaç açıksınız" }]);
  assert.equal(result.tool_calls[0].function.name, "getStoreInfo");
  assert.deepEqual(calls.chat[1].models, ["google/gemma-3-12b-it:free", "meta-llama/llama-3.3-70b-instruct:free", "some-lab/unknown-model:free"]);
  assert.ok(calls.chat[1].tools.length > 0);
});

test("with a warm model list, unavailable configured/fallback ids are dropped before sending", async (t) => {
  quiet(t);
  await resetOpenRouterModelCache();
  const calls = routeFetch(t, { chat: () => reply(200, { model: "google/gemma-3-27b-it:free", choices: [{ message: { content: "Tamam" } }] }) });
  await getOpenRouterModels(); // açılıştaki ısıtma gibi
  await openrouter(DEFAULT_AI_MODEL).complete([{ role: "user", content: "x" }], []);
  assert.equal(calls.chat.length, 1);
  assert.deepEqual(calls.chat[0].models, ["google/gemma-3-27b-it:free", "google/gemma-3-12b-it:free", "meta-llama/llama-3.3-70b-instruct:free"]);
  assert.ok(!calls.chat[0].models.includes(DEFAULT_AI_MODEL));

  // Geçerli ücretli model olduğu gibi tek başına gönderilir
  await openrouter("openai/gpt-4o").complete([{ role: "user", content: "x" }], []);
  assert.equal(calls.chat[1].model, "openai/gpt-4o");
  assert.equal(calls.chat[1].models, undefined);
  // Geçerli ücretsiz model başta kalır
  await openrouter("meta-llama/llama-3.3-70b-instruct:free").complete([{ role: "user", content: "x" }], []);
  assert.equal(calls.chat[2].models[0], "meta-llama/llama-3.3-70b-instruct:free");
  assert.equal(calls.models.length, 1);
});

test("when discovery is unavailable the static fallbacks are the last resort and 404 is not retried blindly", async (t) => {
  quiet(t);
  await resetOpenRouterModelCache();
  const calls = routeFetch(t, { models: () => reply(500, {}), chat: () => reply(404, { error: { code: 404, message: "No endpoints found for x." } }) });
  await assert.rejects(openrouter(DEFAULT_AI_MODEL).complete([{ role: "user", content: "x" }], []), (error) => error.message === "AI_PROVIDER_404" && /No endpoints/.test(error.providerMessage));
  assert.equal(calls.chat.length, 1);
  assert.equal(calls.chat[0].models.length, 3);
});

test("retry happens at most once: a second 404 is surfaced with the provider's reason", async (t) => {
  quiet(t);
  await resetOpenRouterModelCache();
  const policy = "No endpoints found matching your data policy (Free model publication). Configure: https://openrouter.ai/settings/privacy";
  const calls = routeFetch(t, { chat: () => reply(404, { error: { code: 404, message: policy } }) });
  const error = await openrouter(DEFAULT_AI_MODEL).complete([{ role: "user", content: "x" }], []).catch((e) => e);
  assert.equal(error.message, "AI_PROVIDER_404");
  assert.equal(error.providerMessage, policy);
  assert.equal(calls.chat.length, 2);

  const described = describeAiDraftFailure(error, "openrouter", DEFAULT_AI_MODEL);
  assert.equal(described.status, 502);
  assert.match(described.message, /Ayarlar › Privacy bölümünde ücretsiz modellere izin verin \(Enable free endpoints that may train on inputs \/ publish prompts\)/);
  assert.doesNotMatch(described.message, /model(i)? bulunamadı/i);
});

test("failure messages distinguish a missing model from the data policy and keep other mappings", () => {
  const err = (status, providerMessage) => Object.assign(new Error(`AI_PROVIDER_${status}`), { status, providerMessage });
  assert.match(describeAiDraftFailure(err(404, "No endpoints found for foo:free."), "openrouter", "foo:free").message, /modeli bulunamadı \(openrouter \/ foo:free, HTTP 404\)/);
  assert.match(describeAiDraftFailure(new Error("AI_PROVIDER_404"), "groq", "x").message, /modeli bulunamadı/);
  assert.match(describeAiDraftFailure(err(400, "foo is not a valid model ID"), "openrouter", "foo").message, /modeli bulunamadı/);
  assert.match(describeAiDraftFailure(err(400, "messages: invalid"), "openrouter", "foo").message, /isteği reddetti/);
  assert.match(describeAiDraftFailure(new Error("AI_PROVIDER_401"), "openrouter", "foo").message, /API anahtarını kabul etmedi/);
});

test("push draft endpoint recovers from a removed default model with the same response shape", async (t) => {
  quiet(t);
  await resetOpenRouterModelCache();
  withKey(t);
  t.mock.method(Settings, "getSettings", async () => ({ ai: { provider: "openrouter", model: DEFAULT_AI_MODEL } }));
  t.mock.method(PushBroadcast, "find", () => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [] }));
  const options = { options: [{ tone: "Samimi", title: "Akşam molası 🌙", body: "Atıştırmalıklar bu akşam indirimde 🍫" }] };
  const calls = routeFetch(t, {
    chat: (_payload, n) => n === 1
      ? reply(404, { error: { code: 404, message: "No endpoints found for google/gemma-4-26b-a4b-it:free." } })
      : reply(200, { model: "google/gemma-3-27b-it:free", choices: [{ message: { content: JSON.stringify(options) } }] }),
  });
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await generateBroadcastDraft({ body: { prompt: "Akşam atıştırmalık indirimi", useStoreData: false } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ["body", "facts", "options", "success", "title"]);
  assert.equal(res.body.title, "Akşam molası 🌙");
  assert.equal(calls.chat.length, 2);
});

test("groq and gemini keep their behaviour: no discovery, no model swap, 404 not retried", async (t) => {
  await resetOpenRouterModelCache();
  const oldGroq = process.env.GROQ_API_KEY;
  const oldGemini = process.env.GEMINI_API_KEY;
  process.env.GROQ_API_KEY = "groq-key";
  process.env.GEMINI_API_KEY = "gemini-key";
  t.after(() => {
    if (oldGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldGroq;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGemini;
  });
  const urls = [];
  const payloads = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    urls.push(url);
    payloads.push(JSON.parse(options.body));
    return reply(404, { error: { code: 404, message: "model not found" } });
  });
  await assert.rejects(createAiProvider({ provider: "groq", model: "llama-3.3-70b-versatile" }).complete([{ role: "user", content: "x" }], []), /AI_PROVIDER_404/);
  await assert.rejects(createAiProvider({ provider: "gemini", model: "gemini-2.0-flash" }).complete([{ role: "user", content: "x" }], []), /AI_PROVIDER_404/);
  assert.equal(urls.length, 2);
  assert.ok(!urls.includes(OPENROUTER_MODELS_URL));
  assert.equal(payloads[0].model, "llama-3.3-70b-versatile");
  assert.equal(payloads[0].models, undefined);
  assert.equal(payloads[0].reasoning, undefined);
  assert.match(urls[1], /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.0-flash:generateContent/);
});

test("GET /api/settings/ai-models lists live OpenRouter models (free first) and an empty list for others", async (t) => {
  await resetOpenRouterModelCache();
  routeFetch(t, { chat: () => reply(200, {}) });
  const res = () => ({ statusCode: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const r1 = res();
  await getAiModels({ query: { provider: "openrouter" } }, r1);
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.body.provider, "openrouter");
  assert.ok(r1.body.fetchedAt);
  assert.deepEqual(Object.keys(r1.body.models[0]).sort(), ["context", "free", "id", "name", "tools"]);
  assert.equal(r1.body.models[0].id, "google/gemma-3-27b-it:free");
  const firstPaid = r1.body.models.findIndex((m) => !m.free);
  assert.ok(firstPaid > 0 && r1.body.models.slice(firstPaid).every((m) => !m.free));
  assert.ok(!r1.body.models.some((m) => m.id === "image/gen:free"));

  const r2 = res();
  await getAiModels({ query: { provider: "groq" } }, r2);
  assert.deepEqual(r2.body, { provider: "groq", models: [], fetchedAt: null });

  await resetOpenRouterModelCache();
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => reply(500, {}));
  const r3 = res();
  await getAiModels({ query: { provider: "openrouter" } }, r3);
  assert.deepEqual(r3.body, { provider: "openrouter", models: [], fetchedAt: null });
});

test("AI defaults come from one place", () => {
  const old = { p: process.env.AI_DEFAULT_PROVIDER, m: process.env.AI_DEFAULT_MODEL };
  delete process.env.AI_DEFAULT_PROVIDER;
  delete process.env.AI_DEFAULT_MODEL;
  try {
    assert.deepEqual(resolveAiConfig({}), { provider: "openrouter", model: DEFAULT_AI_MODEL });
    assert.deepEqual(resolveAiConfig(undefined), { provider: "openrouter", model: DEFAULT_AI_MODEL });
    assert.deepEqual(resolveAiConfig({ provider: "groq", model: " llama " }), { provider: "groq", model: "llama" });
  } finally {
    if (old.p !== undefined) process.env.AI_DEFAULT_PROVIDER = old.p;
    if (old.m !== undefined) process.env.AI_DEFAULT_MODEL = old.m;
  }
});
