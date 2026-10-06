import test from "node:test";
import assert from "node:assert/strict";
import { answerUserMessage } from "../services/ai/assistant.service.js";
import { rankKnowledgeRows, smallTalkReply } from "../services/ai/policies.js";
import { detectToolIntent, extractCouponCode, formatToolResult, getProductSearchTerms, runAiTool, turkishInsensitivePattern } from "../services/ai/tools.js";
import { AI_TOOL_DEFINITIONS, OpenAiCompatibleProvider } from "../services/ai/providers.js";
import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import Settings from "../models/settings.model.js";
import AiKnowledge from "../models/aiKnowledge.model.js";
import AiRequestLog from "../models/aiRequestLog.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Coupon from "../models/coupon.model.js";

const USER_ID = "507f191e810c19729de860ea";
const chat = { _id: "507f191e810c19729de860eb", user: USER_ID, mode: "AI", status: "active" };
const chain = (rows) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, populate() { return this; }, lean: async () => rows });

const mockConversation = (t, { knowledge = [], products = null } = {}) => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  const logs = [];
  t.mock.method(Settings, "getSettings", async () => ({ ai: { enabled: true, provider: "openrouter", model: "test" } }));
  t.mock.method(Message, "find", () => chain([]));
  t.mock.method(Message, "create", async (data) => ({ ...data, _id: "m1", createdAt: new Date() }));
  t.mock.method(AiKnowledge, "find", () => chain(knowledge));
  t.mock.method(AiRequestLog, "create", async (data) => { logs.push(data); return data; });
  t.mock.method(Chat, "updateOne", async () => ({}));
  if (products) {
    t.mock.method(Product, "find", () => chain(products));
    t.mock.method(WeeklyProduct, "find", () => chain([]));
  }
  return logs;
};

test("greetings, thanks and capability questions get a canned reply", () => {
  for (const query of ["Merhaba", "Selam 👋", "merhaba nasılsın", "Teşekkürler", "çok teşekkür ederim", "Sağ ol", "tamam", "Kimsin?", "Neler yapabilirsin?", "İyi akşamlar", "Kolay gelsin"]) {
    assert.equal(typeof smallTalkReply(query), "string", query);
  }
});

test("small talk never swallows a real question", () => {
  for (const query of ["Merhaba, süt var mı?", "Teşekkürler ama siparişim gelmedi", "Siparişim nerede?", "Fotokopi", "Selam kuponum var mı", "tamam o zaman iade nasıl yapılır"]) {
    assert.equal(smallTalkReply(query), null, query);
  }
});

test("a greeting is answered without calling the provider or offering live support", async (t) => {
  mockConversation(t);
  t.mock.method(globalThis, "fetch", async () => { assert.fail("Small talk must not call the provider"); });
  const reply = await answerUserMessage({ chat, query: "Merhaba" });
  assert.match(reply.content, /yardımcı olabilirim/);
  assert.doesNotMatch(reply.content, /doğrulanmış bilgi bulamadım/);
});

test("product search matches Turkish letters typed without accents", () => {
  const matches = (term, name) => new RegExp(turkishInsensitivePattern(term), "i").test(name);
  assert.equal(matches("sut", "Tam Yağlı Süt 1 L"), true);
  assert.equal(matches("süt", "TAM YAĞLI SÜT"), true);
  assert.equal(matches("cikolata", "Sütlü Çikolata 80 g"), true);
  assert.equal(matches("yogurt", "Yoğurt 1 kg"), true);
  assert.equal(matches("seker", "Toz Şeker"), true);
  assert.equal(matches("isik", "IŞIK Ampul"), true);
  assert.equal(matches("sut", "Su 5 L"), false);
  assert.equal(matches("a+b", "a+b"), true);
});

test("filler words are removed from product search terms", () => {
  assert.deepEqual(getProductSearchTerms("sizde süt var mı"), ["sut"]);
  assert.deepEqual(getProductSearchTerms("çikolata kaç lira"), ["cikolata"]);
  assert.deepEqual(getProductSearchTerms("şeker kaldı mı"), ["seker"]);
  assert.deepEqual(getProductSearchTerms("Coca Cola var mı?"), ["coca", "cola"]);
});

test("words that merely contain 'tl' are not treated as price questions", () => {
  assert.equal(detectToolIntent("Teşekkürler mutlu günler"), null);
  assert.equal(detectToolIntent("atlet"), null);
  assert.equal(detectToolIntent("Red Bull kaç TL?").name, "searchProducts");
  assert.equal(detectToolIntent("bu 50 tl mi").name, "searchProducts");
});

test("coupon code is picked by shape, not by position in the sentence", () => {
  assert.equal(extractCouponCode("ABCD20 kuponu geçerli mi?"), "ABCD20");
  assert.equal(extractCouponCode("Kupon kodu ABCD20 geçerli mi"), "ABCD20");
  assert.equal(extractCouponCode("indirim20 kuponu"), "INDIRIM20");
  assert.equal(extractCouponCode("HOSGELDIN kuponu geçerli mi"), "HOSGELDIN");
  assert.equal(extractCouponCode("kupon kodum çalışmıyor"), null);
  assert.deepEqual(detectToolIntent("kupon kodum çalışmıyor"), { name: "getCouponInfo", code: null });
});

test("questions about the customer's own coupons list them instead of asking for a code", () => {
  for (const query of ["Kuponlarım neler?", "kuponum var mı", "Hangi kuponları kullanabilirim"]) assert.deepEqual(detectToolIntent(query), { name: "getMyCoupons" }, query);
  assert.ok(AI_TOOL_DEFINITIONS.some((tool) => tool.function.name === "getMyCoupons"));
});

test("coupon list is scoped to the authenticated user and hides used-up coupons", async (t) => {
  let filter;
  t.mock.method(Coupon, "find", (query) => { filter = query; return chain([
    { code: "HOSGELDIN", description: "", discountType: "percentage", discountPercentage: 10, minimumOrderAmount: 0, expirationDate: new Date("2030-01-01"), usedBy: [], userUsageLimit: 1, usageLimit: null, usageCount: 0 },
    { code: "KULLANILDI", description: "", discountType: "fixed", discountAmount: 25, minimumOrderAmount: 0, expirationDate: new Date("2030-01-01"), usedBy: [{ user: USER_ID }], userUsageLimit: 1, usageLimit: null, usageCount: 1 },
  ]); });
  const result = await runAiTool({ name: "getMyCoupons" }, USER_ID);
  assert.equal(filter.userId, USER_ID);
  assert.equal(filter.isActive, true);
  assert.deepEqual(result.coupons.map((coupon) => coupon.code), ["HOSGELDIN"]);
});

test("product search falls back to the closest partial matches", async (t) => {
  const calls = [];
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", (query) => {
    calls.push(query);
    return chain(query.$and ? [] : [
      { _id: "p1", name: "Coca Cola 1 L", price: 55, category: "icecekler" },
      { _id: "p2", name: "Cola Turka 330 ml", price: 20, category: "icecekler" },
    ]);
  });
  const result = await runAiTool({ name: "searchProducts", terms: ["coca", "cola", "litre"] }, USER_ID);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].$and[0].name.$regex, turkishInsensitivePattern("coca"));
  assert.equal(result.partialMatch, true);
  assert.deepEqual(result.products.map((product) => product.name), ["Coca Cola 1 L"]);
});

test("tool results can be phrased without a model", () => {
  assert.match(formatToolResult({ tool: "searchProducts", found: true, products: [{ name: "Süt 1 L", price: 42.5, inStock: true }, { name: "Süt 200 ml", price: 12, inStock: false }] }), /Süt 1 L — 42,50 TL[\s\S]*Süt 200 ml — 12,00 TL \(şu anda tükendi\)/);
  assert.match(formatToolResult({ tool: "getStoreOpeningStatus", orderingOpen: false, orderStartTime: "10:00", orderEndTime: "01:00", minimumOrderAmount: 250, deliveryPoints: [] }), /10:00 – 01:00[\s\S]*almıyoruz[\s\S]*250,00 TL/);
  assert.match(formatToolResult({ tool: "getMyActiveOrders", found: true, orders: [{ status: "Yolda", totalAmount: 345, createdAt: "2026-10-05T17:04:00+03:00" }] }), /Yolda — 345,00 TL/);
  assert.match(formatToolResult({ tool: "getMyCart", found: true, items: [{ name: "Süt", price: 42.5, quantity: 2 }], total: 85 }), /2 × Süt — 85,00 TL[\s\S]*Toplam: 85,00 TL/);
  assert.equal(formatToolResult(null), null);
});

test("provider outage with verified tool data answers the customer instead of handing off", async (t) => {
  const logs = mockConversation(t, { products: [{ _id: "p1", name: "Tam Yağlı Süt 1 L", price: 42.5, category: "sut" }] });
  t.mock.method(SupportRequest, "findOneAndUpdate", async () => { assert.fail("Must not create a support request when data is available"); });
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503, json: async () => ({}) }));
  const reply = await answerUserMessage({ chat, query: "Süt var mı?" });
  assert.match(reply.content, /Tam Yağlı Süt 1 L — 42,50 TL/);
  assert.equal(logs[0].success, false);
  assert.equal(logs[0].handoffReason, "tool_result_formatted");
});

test("a model that answers HANDOFF despite tool data still gets the verified data", async (t) => {
  mockConversation(t, { products: [{ _id: "p1", name: "Filtre Kahve 250 g", price: 189.9, category: "kahve" }] });
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "HANDOFF" } }] }) }));
  const reply = await answerUserMessage({ chat, query: "Filtre kahve fiyatı ne kadar?" });
  assert.match(reply.content, /Filtre Kahve 250 g — 189,90 TL/);
});

test("knowledge records reach the model in the first call together with the tools", async (t) => {
  mockConversation(t, { knowledge: [{ title: "İade politikası", category: "İade", content: "Açılmamış ürünler 24 saat içinde iade edilebilir.", keywords: ["iade"], priority: 10 }] });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls += 1;
    const payload = JSON.parse(options.body);
    assert.match(payload.messages[0].content, /24 saat içinde iade/);
    assert.ok(payload.tools.length > 0);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "**Açılmamış ürünleri** 24 saat içinde iade edebilirsiniz." } }] }) };
  });
  const reply = await answerUserMessage({ chat, query: "İadeler nasıl yapılıyor?" });
  assert.equal(calls, 1);
  assert.equal(reply.content, "Açılmamış ürünleri 24 saat içinde iade edebilirsiniz.");
});

test("an unverifiable model answer is replaced by the optional live-support offer", async (t) => {
  mockConversation(t);
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "Kargo bedava!" } }] }) }));
  const reply = await answerUserMessage({ chat, query: "Dronla teslimat yapıyor musunuz acaba bugün" });
  assert.match(reply.content, /doğrulanmış bilgi bulamadım/);
});

test("knowledge search matches words that carry Turkish suffixes", () => {
  const rows = [{ title: "Teslimat süresi", category: "Teslimat", content: "…", keywords: ["teslimat"], priority: 1, updatedAt: new Date() }];
  assert.equal(rankKnowledgeRows("Teslimatı ne zaman yaparsınız", rows)[0]?.title, "Teslimat süresi");
  assert.equal(rankKnowledgeRows("Süt var mı", [{ title: "Sütun bilgisi", category: "Genel", content: "…", keywords: [], priority: 1, updatedAt: new Date() }]).length, 0);
});

test("transient provider errors are retried once, client errors are not", async (t) => {
  const provider = new OpenAiCompatibleProvider({ name: "openrouter", url: "https://example.invalid", apiKey: "test", model: "m" });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return calls === 1 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => ({ choices: [{ message: { content: "Tamam" } }] }) };
  });
  assert.equal((await provider.complete([{ role: "user", content: "x" }])).content, "Tamam");
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch.mock.mockImplementation(async () => { calls += 1; return { ok: false, status: 401, json: async () => ({}) }; });
  await assert.rejects(provider.complete([{ role: "user", content: "x" }]), /AI_PROVIDER_401/);
  assert.equal(calls, 1);
});

test("category browsing and frequent-product questions are routed to their tools", () => {
  assert.deepEqual(detectToolIntent("İçecek kategorisinde neler var?"), { name: "getCategoryProducts", category: "icecek" });
  assert.deepEqual(detectToolIntent("atıştırmalık çeşitleri"), { name: "getCategoryProducts", category: "atistirmalik" });
  assert.equal(detectToolIntent("En çok ne alıyorum?").name, "getMyFrequentProducts");
  assert.equal(detectToolIntent("haftanın ürünleri neler").name, "getActiveCampaigns");
  // Mevcut yönlendirmeler değişmedi
  assert.equal(detectToolIntent("süt var mı").name, "searchProducts");
  assert.equal(detectToolIntent("siparişim nerede").name, "getMyActiveOrders");
  const names = AI_TOOL_DEFINITIONS.map((tool) => tool.function.name);
  assert.ok(names.includes("getCategoryProducts") && names.includes("getMyFrequentProducts"));
});

test("category tool lists visible products of the category and falls back to names", async (t) => {
  const queries = [];
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", (filter) => {
    queries.push(filter);
    return chain(filter.category ? [] : [{ _id: "507f191e810c19729de860f1", name: "Sütlü Çikolata", price: 30, category: "Atıştırmalık", isOutOfStock: false }]);
  });
  const result = await runAiTool({ name: "getCategoryProducts", category: "çikolata" }, USER_ID);
  assert.equal(queries.length, 2);
  assert.ok(queries.every((filter) => filter.isHidden.$ne === true));
  assert.equal(result.products[0].name, "Sütlü Çikolata");
  assert.match(formatToolResult(result), /Sütlü Çikolata — 30,00 TL/);
});

test("frequent products are computed only from the authenticated user's own orders", async (t) => {
  const { default: Order } = await import("../models/order.model.js");
  let seenFilter;
  t.mock.method(Order, "find", (filter) => {
    seenFilter = filter;
    return chain([
      { products: [{ name: "Süt 1 L", quantity: 2 }, { name: "Ekmek", quantity: 1 }] },
      { products: [{ name: "Süt 1 L", quantity: 1 }] },
    ]);
  });
  const result = await runAiTool({ name: "getMyFrequentProducts", userId: "aaaaaaaaaaaaaaaaaaaaaaaa" }, USER_ID);
  assert.equal(seenFilter.user, USER_ID);
  assert.deepEqual(result.products[0], { name: "Süt 1 L", orderCount: 2, totalQuantity: 3 });
  assert.match(formatToolResult(result), /Süt 1 L — 2 siparişte/);
});

test("campaign answers include the weekly special-price products", async (t) => {
  const { default: FlashSale } = await import("../models/flashSale.model.js");
  t.mock.method(FlashSale, "find", () => chain([]));
  t.mock.method(WeeklyProduct, "find", () => chain([{ weeklyPrice: 20, product: { name: "Ayran", price: 25, isOutOfStock: false } }, { weeklyPrice: 5, product: null }]));
  const result = await runAiTool({ name: "getActiveCampaigns" }, USER_ID);
  assert.equal(result.found, true);
  assert.equal(result.weeklyDeals.length, 1);
  assert.match(formatToolResult(result), /Haftanın ürünleri:\n• Ayran: 20,00 TL \(normal fiyatı 25,00 TL\)/);
});

test("order answers carry the delivery tracking note when the store set one", () => {
  const text = formatToolResult({ tool: "getMyActiveOrders", found: true, orders: [{ id: "1", status: "Yolda", totalAmount: 100, createdAt: new Date("2026-10-05T10:00:00Z"), deliveryTracking: "Kurye 10 dk içinde kapıda" }] });
  assert.match(text, /Teslimat notu: Kurye 10 dk içinde kapıda/);
});

test("cart requests are recognised and left to the model instead of a single lookup", async () => {
  const { isCartRequest } = await import("../services/ai/tools.js");
  for (const text of ["300 TL'ye kahvaltılık hazırla", "4 kişilik makarna yapacağım", "Bu hafta 600 TL bütçem var", "bana haftalık sepet oluştur", "menemen malzemeleri"]) assert.equal(isCartRequest(text), true, text);
  for (const text of ["süt var mı", "sepetimde ne var", "siparişim nerede", "kuponlarım neler", "ekmek kaç tl"]) assert.equal(isCartRequest(text), false, text);
});

test("cart item text is parsed into names and quantities", async () => {
  const { parseCartItems, cartMatchScore } = await import("../services/ai/tools.js");
  assert.deepEqual(parseCartItems("2 süt, 1 adet yumurta, makarna; 3x salça"), [{ name: "süt", quantity: 2 }, { name: "yumurta", quantity: 1 }, { name: "makarna", quantity: 1 }, { name: "salça", quantity: 3 }]);
  assert.equal(parseCartItems("99 süt")[0].quantity, 20);
  assert.equal(parseCartItems("").length, 0);
  // "süt" için tam kelime eşleşmesi, "sütlü" gibi türevlerin önüne geçer
  assert.ok(cartMatchScore("Süt 1 L", ["sut"]) > cartMatchScore("Sütlü Çikolata", ["sut"]));
});

test("a cart over budget is trimmed by quantity first, then by dropping items", async () => {
  const { fitCartToBudget } = await import("../services/ai/tools.js");
  const items = [{ name: "Süt", price: 40, quantity: 2 }, { name: "Peynir", price: 120, quantity: 1 }, { name: "Zeytin", price: 90, quantity: 1 }];
  assert.equal(fitCartToBudget(items, null).total, 290);
  const fitted = fitCartToBudget(items, 200);
  assert.ok(fitted.total <= 200);
  assert.deepEqual(fitted.lines.map((line) => [line.name, line.quantity]), [["Süt", 1], ["Peynir", 1]]);
  assert.deepEqual(fitted.removed, ["Zeytin"]);
  assert.equal(items[0].quantity, 2); // girdi değişmez
  assert.equal(fitCartToBudget([{ name: "Pahalı", price: 500, quantity: 1 }], 100).lines.length, 0);
});

test("suggestCart resolves items to in-stock catalogue products and respects the budget", async (t) => {
  const filters = [];
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", (filter) => {
    filters.push(filter);
    const key = JSON.stringify(filter);
    if (/\[sşSŞ\]\[uüUÜ\]t/.test(key)) return chain([{ _id: "507f191e810c19729de860a1", name: "Sütlü Çikolata", price: 15 }, { _id: "507f191e810c19729de860a2", name: "Süt 1 L", price: 42 }]);
    if (/makarna/.test(key)) return chain([{ _id: "507f191e810c19729de860a3", name: "Burgu Makarna 500 g", price: 28 }]);
    return chain([]);
  });
  const result = await runAiTool({ name: "suggestCart", items: "2 süt, 3 makarna, 1 ejderha meyvesi", budget: 120 }, USER_ID);
  assert.ok(filters.every((filter) => filter.isHidden.$ne === true && filter.isOutOfStock.$ne === true));
  assert.equal(result.items[0].name, "Süt 1 L");
  assert.deepEqual(result.missing, ["ejderha meyvesi"]);
  assert.ok(result.total <= 120);
  assert.equal(result.total, result.items.reduce((sum, item) => sum + item.lineTotal, 0));
  assert.match(formatToolResult(result), /Toplam: .* TL \(bütçe 120,00 TL\)/);
});

test("the assistant stores the cart proposal with its reply so the app can offer an add-to-cart button", async (t) => {
  mockConversation(t);
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", () => chain([{ _id: "507f191e810c19729de860a3", name: "Burgu Makarna 500 g", price: 28 }]));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return { ok: true, json: async () => ({ choices: [{ message: calls === 1
      ? { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "suggestCart", arguments: JSON.stringify({ items: "2 makarna", userId: "baskasi" }) } }] }
      : { content: "Makarna için 2 paket Burgu Makarna önerdim, toplam 56 TL." } }] }) };
  });
  const reply = await answerUserMessage({ chat, query: "4 kişilik makarna yapacağım" });
  assert.equal(calls, 2);
  assert.equal(reply.meta.cartProposal.total, 56);
  assert.deepEqual(reply.meta.cartProposal.items[0], { productId: "507f191e810c19729de860a3", name: "Burgu Makarna 500 g", price: 28, quantity: 2, lineTotal: 56 });
});

test("the cart quick button asks what to prepare without calling the model", async (t) => {
  mockConversation(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return { ok: true, json: async () => ({}) }; });
  const reply = await answerUserMessage({ chat, query: "🧺 Sepet Hazırla" });
  assert.match(reply.content, /Ne için sepet hazırlayayım/);
  assert.equal(calls, 0);
});
