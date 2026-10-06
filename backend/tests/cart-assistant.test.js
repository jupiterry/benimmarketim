import test from "node:test";
import assert from "node:assert/strict";
import Settings from "../models/settings.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Order from "../models/order.model.js";
import { extractBudget, pickTemplate, suggestCartForPrompt, suggestExtras } from "../services/ai/cartAssistant.service.js";
import { suggestCart } from "../controllers/cartAssistant.controller.js";

const USER = "507f191e810c19729de860ea";
const chain = (rows) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => rows });
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
let productId = 0;
// Katalog taklidi: aranan kelimeye göre tek ürün döner; "ejderha" hiç bulunmaz.
const mockCatalog = (t, prices = {}) => {
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", (filter) => {
    const key = JSON.stringify(filter).toLowerCase();
    if (key.includes("ejderha")) return chain([]);
    const word = (key.match(/"\$regex":"([^"]+)"/) || [])[1] || "urun";
    const name = word.replace(/\[(.)[^\]]*\]/g, "$1");
    productId += 1;
    return chain([{ _id: `507f191e810c19729de8${String(productId).padStart(4, "0")}`, name, price: prices[name] ?? 40 }]);
  });
};
const withAi = (t, handler) => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  t.after(() => { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; });
  t.mock.method(Settings, "getSettings", async () => ({ ai: { enabled: true, provider: "openrouter", model: "test" } }));
  t.mock.method(globalThis, "fetch", handler);
};
const toolCall = (args) => ({ ok: true, json: async () => ({ choices: [{ message: { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "suggestCart", arguments: JSON.stringify(args) } }] } }] }) });

test("budgets are read from the request text; head counts are not budgets", () => {
  assert.equal(extractBudget("Bu hafta 600 TL bütçem var"), 600);
  assert.equal(extractBudget("300 tl'ye kahvaltılık"), 300);
  assert.equal(extractBudget("₺450 ile ne alınır"), 450);
  assert.equal(extractBudget("250 lira"), 250);
  assert.equal(extractBudget("4 kişilik makarna"), null);
  assert.equal(extractBudget("5 TL"), null);
});

test("ready-made lists cover the common requests", () => {
  assert.equal(pickTemplate("300 TL'ye kahvaltılık hazırla", 300).id, "kahvalti");
  assert.equal(pickTemplate("4 kişilik makarna yapacağım", null).id, "makarna");
  assert.equal(pickTemplate("film gecesi için atıştırmalık", null).id, "atistirmalik");
  assert.equal(pickTemplate("bu hafta 600 TL'm var", 600).id, "temel");
  assert.equal(pickTemplate("merhaba nasılsın", null), null);
  // Ana sayfadaki tek dokunuşluk kısayollar
  assert.equal(pickTemplate("Kahvaltılık hazırla", null).id, "kahvalti");
  assert.equal(pickTemplate("Akşam yemeği için alışveriş", null).id, "aksam");
  assert.equal(pickTemplate("Misafir geliyor, ikramlık lazım", null).id, "misafir");
});

test("the AI plan is resolved against the catalogue and kept within the budget", async (t) => {
  mockCatalog(t, { makarna: 30, salca: 60, kasar: 150 });
  let sent;
  withAi(t, async (_url, options) => { sent = JSON.parse(options.body); return toolCall({ items: "2 makarna, 1 salça, 1 kaşar", budget: 99999 }); });
  const result = await suggestCartForPrompt({ prompt: "4 kişilik makarna, 130 TL bütçem var", userId: USER });
  assert.equal(sent.tools.length, 1);
  assert.equal(sent.tools[0].function.name, "suggestCart");
  assert.equal(result.source, "ai");
  assert.equal(result.proposal.budget, 130); // modelin yazdığı bütçe değil, müşterinin yazdığı geçerli
  assert.ok(result.proposal.total <= 130);
  assert.deepEqual(result.proposal.removedForBudget, ["kasar"]);
  assert.match(result.message, /sepetiniz hazır/);
});

test("when the AI is unavailable a ready-made list is used instead of failing", async (t) => {
  mockCatalog(t);
  t.mock.method(console, "error", () => {});
  withAi(t, async () => { throw new Error("network down"); });
  const result = await suggestCartForPrompt({ prompt: "300 TL'ye kahvaltılık hazırla", userId: USER });
  assert.equal(result.source, "template");
  assert.ok(result.proposal.items.length >= 5);
  assert.ok(result.proposal.total <= 300);
  assert.match(result.message, /hazır bir listedir/);
});

test("a disabled assistant or a missing key also falls back to the ready-made list", async (t) => {
  mockCatalog(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return { ok: true, json: async () => ({}) }; });
  t.mock.method(Settings, "getSettings", async () => ({ ai: { enabled: false } }));
  const result = await suggestCartForPrompt({ prompt: "haftalık temel alışveriş", budget: 500, userId: USER });
  assert.equal(calls, 0);
  assert.equal(result.source, "template");
  assert.equal(result.proposal.budget, 500);
});

test("unrelated or unmatched requests get a helpful message, never an error", async (t) => {
  mockCatalog(t);
  withAi(t, async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "YOK" } }] }) }));
  let result = await suggestCartForPrompt({ prompt: "bana bir şiir yaz", userId: USER });
  assert.equal(result.proposal, null);
  assert.match(result.message, /biraz daha açık/);
  globalThis.fetch.mock.mockImplementation(async () => toolCall({ items: "1 ejderha meyvesi" }));
  result = await suggestCartForPrompt({ prompt: "ejderha meyvesi istiyorum", userId: USER });
  assert.equal(result.proposal, null);
  assert.match(result.message, /katalogda bulamadım/);
});

test("the endpoint validates input and never leaks internal errors", async (t) => {
  const req = (body) => ({ body, user: { _id: USER } });
  let res = response(); await suggestCart(req({ prompt: " a " }), res); assert.equal(res.statusCode, 400);
  res = response(); await suggestCart(req({ prompt: "x".repeat(301) }), res); assert.equal(res.statusCode, 400);
  res = response(); await suggestCart(req({ prompt: "kahvaltılık", budget: 5 }), res); assert.equal(res.statusCode, 400);
  res = response(); await suggestCart(req({ prompt: "kahvaltılık", budget: "abc" }), res); assert.equal(res.statusCode, 400);
  mockCatalog(t);
  t.mock.method(Settings, "getSettings", async () => ({ ai: { enabled: false } }));
  res = response(); await suggestCart(req({ prompt: "kahvaltılık hazırla", budget: 300 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.proposal.items.every((item) => item.productId && item.quantity >= 1));
});

test("each proposed item carries swap options that are not already in the cart", async (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Settings, "getSettings", async () => ({ ai: { enabled: false } }));
  t.mock.method(Order, "find", () => chain([]));
  const p = (n, name, price) => ({ _id: `507f191e810c19729de87${String(n).padStart(3, "0")}`, name, price });
  t.mock.method(Product, "find", (filter) => {
    const key = JSON.stringify(filter).toLowerCase();
    if (key.includes("isfeatured")) return chain([]);
    if (key.includes("\"makarna\"")) return chain([p(1, "Ankara Burgu Makarna 500 g", 35), p(2, "Filiz Kalem Makarna 500 g", 28), p(3, "Makarna Sosu", 60)]);
    return chain([]);
  });
  const result = await suggestCartForPrompt({ prompt: "4 kişilik makarna", userId: USER });
  const [line] = result.proposal.items;
  assert.equal(line.name, "Filiz Kalem Makarna 500 g"); // aynı ölçüde uyanlardan en uygun fiyatlısı
  assert.deepEqual(line.alternatives, [{ productId: p(1)._id, name: "Ankara Burgu Makarna 500 g", price: 35 }]);
});

test("money left in the budget is offered as products the customer buys most often", async (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  const a = "507f191e810c19729de88001"; const b = "507f191e810c19729de88002"; const c = "507f191e810c19729de88003"; const d = "507f191e810c19729de88004";
  t.mock.method(Order, "find", () => chain([
    { products: [{ product: a, quantity: 1 }, { product: b, quantity: 2 }] },
    { products: [{ product: b, quantity: 1 }, { product: c, quantity: 1 }, { product: d, quantity: 1 }] },
  ]));
  t.mock.method(Product, "find", (filter) => chain(filter.isFeatured
    ? [{ _id: "507f191e810c19729de88009", name: "Öne Çıkan", price: 30 }]
    : [{ _id: a, name: "Süt", price: 40 }, { _id: b, name: "Ekmek", price: 20 }, { _id: c, name: "Zeytinyağı", price: 400 }, { _id: d, name: "Yumurta", price: 90 }]));
  const frequent = await suggestExtras({ userId: USER, left: 100, excludeIds: [d] });
  assert.equal(frequent.source, "frequent");
  // En sık alınan önce; bütçeyi aşan (Zeytinyağı) ve sepette olan (Yumurta) önerilmez
  assert.deepEqual(frequent.items, [{ productId: b, name: "Ekmek", price: 20 }, { productId: a, name: "Süt", price: 40 }]);
  // Geçmiş siparişi olmayan müşteriye öne çıkan ürünler önerilir
  Order.find.mock.mockImplementation(() => chain([]));
  const featured = await suggestExtras({ userId: USER, left: 100 });
  assert.equal(featured.source, "featured");
  assert.equal(featured.items[0].name, "Öne Çıkan");
  // Kalan tutar çok azsa ya da sorgu hata verirse öneri boş döner, istek bozulmaz
  assert.deepEqual(await suggestExtras({ userId: USER, left: 5 }), { source: null, items: [] });
  t.mock.method(console, "error", () => {});
  Order.find.mock.mockImplementation(() => { throw new Error("db down"); });
  assert.deepEqual(await suggestExtras({ userId: USER, left: 100 }), { source: null, items: [] });
});
