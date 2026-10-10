import assert from "node:assert/strict";
import test from "node:test";
import Settings from "../models/settings.model.js";
import { generateBroadcastDraft } from "../controllers/notification.controller.js";

const response = () => {
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};

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
    assert.match(request.messages[1].content, /cart/);
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
