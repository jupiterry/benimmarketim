import test from "node:test";
import assert from "node:assert/strict";
import { PUSH_LIBRARY, PUSH_LIBRARY_SIZE, pickLibraryExamples } from "../services/pushLibrary.js";
import { buildDraftMessages, REWRITE_INSTRUCTIONS } from "../services/pushDraft.service.js";
import { BROADCAST_AUDIENCES, generateBroadcastDraft, getBroadcastLibrary } from "../controllers/notification.controller.js";

const TARGETS = new Set(["home", "cart", "orders", "referral", "rate"]);
const CLICHES = /(?<!\p{L})(kaçırma|hemen tıkla|tıkla|muhteşem|inanılmaz|acele et|değerli müşteri)/iu;
const SHOUT = /(?<!\p{L})\p{Lu}{4,}(?!\p{L})/u;
const response = () => {
  const res = { statusCode: 200, body: null, headers: {}, setHeader(k, v) { res.headers[k] = v; }, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};

test("the library holds thousands of unique notifications", () => {
  assert.ok(PUSH_LIBRARY_SIZE >= 3000, `${PUSH_LIBRARY_SIZE} bildirim`);
  assert.equal(new Set(PUSH_LIBRARY.map((t) => t.id)).size, PUSH_LIBRARY.length);
  for (const theme of PUSH_LIBRARY) {
    assert.ok(theme.titles.length >= 8 && theme.bodies.length >= 8, theme.id);
    assert.equal(new Set(theme.titles).size, theme.titles.length, `${theme.id}: tekrar eden başlık`);
    assert.equal(new Set(theme.bodies).size, theme.bodies.length, `${theme.id}: tekrar eden mesaj`);
  }
});

test("every piece fits the lock screen and follows the copy rules", () => {
  for (const theme of PUSH_LIBRARY) {
    assert.ok(TARGETS.has(theme.target), `${theme.id}: ekran`);
    assert.ok(BROADCAST_AUDIENCES[theme.audience], `${theme.id}: kitle`);
    for (const title of theme.titles) {
      assert.ok(title.length <= 48, `başlık uzun: ${title}`);
      assert.ok(!title.trim().endsWith("."), `başlık noktayla bitiyor: ${title}`);
    }
    for (const body of theme.bodies) assert.ok(body.length <= 130, `mesaj uzun: ${body}`);
    for (const text of [...theme.titles, ...theme.bodies]) {
      assert.ok(!CLICHES.test(text), `klişe: ${text}`);
      assert.ok(!SHOUT.test(text), `bağıran büyük harf: ${text}`);
      assert.ok((text.match(/!/g) || []).length <= 1, `fazla ünlem: ${text}`);
      assert.ok(!/%\s?\d|\d\s?%|\d+\s?(TL|₺)|₺\s?\d/.test(text), `uydurma indirim/fiyat: ${text}`);
    }
  }
});

test("library examples follow the prompt's topic", () => {
  const exam = PUSH_LIBRARY.find((t) => t.id === "exam");
  const examples = pickLibraryExamples("Sınav haftasında moral veren bir bildirim", { count: 3, seed: 1 });
  assert.equal(examples.length, 3);
  assert.ok(examples.some((e) => exam.titles.includes(e.title)));
  assert.equal(pickLibraryExamples("", { count: 2 }).length, 2);
});

test("the AI prompt knows the audience, real store facts, style examples and rewrite requests", () => {
  const [{ content: system }] = buildDraftMessages({
    prompt: "gece atıştırmalık", audience: "inactive30",
    facts: ["Haftalık fırsat: Lay's Klasik 30 TL (%25 indirimli)"], examples: [{ title: "Gece acıktın mı? 🌙", body: "Cips sepette" }],
  });
  assert.match(system, /30 gündür sipariş vermeyenler/);
  assert.match(system, /GERÇEK MAĞAZA BİLGİLERİ/);
  assert.match(system, /Lay's Klasik 30 TL/);
  assert.match(system, /Gece acıktın mı\?/);
  const [rewriteSystem, rewriteUser] = buildDraftMessages({ mode: "rewrite", current: { title: "Sepetin seni bekliyor", body: "Ürünler hâlâ orada" }, instruction: REWRITE_INSTRUCTIONS.shorter });
  assert.match(rewriteSystem.content, /yeniden yaz/);
  assert.match(rewriteUser.content, /Sepetin seni bekliyor/);
  assert.match(rewriteUser.content, /Daha kısa/);
});

test("rewrite mode needs the current text; library endpoint returns all themes", async () => {
  const res = response();
  await generateBroadcastDraft({ body: { mode: "rewrite", instruction: "shorter", current: { title: "", body: "" } } }, res);
  assert.equal(res.statusCode, 400);
  const lib = response();
  await getBroadcastLibrary({}, lib);
  assert.equal(lib.body.size, PUSH_LIBRARY_SIZE);
  assert.equal(lib.body.themes.length, PUSH_LIBRARY.length);
});
