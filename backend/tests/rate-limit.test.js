// İstek sınırlayıcı (backend/middleware/rateLimit.js): sabit pencere, kullanıcı/IP anahtarı, 429 gövdesi,
// Redis → bellek yedeği ve rotalara bağlandığı yerler (place-order, auth, quote, adresler).
import test from "node:test";
import assert from "node:assert/strict";
import {
  createRateLimiter,
  createMemoryStore,
  createRedisStore,
  clientKey,
  placeOrderRateLimit,
  authRateLimit,
  deliveryQuoteRateLimit,
  addressRateLimit,
} from "../middleware/rateLimit.js";
import cartRouter from "../routes/cart.route.js";
import authRouter from "../routes/auth.route.js";
import deliveryRouter from "../routes/delivery.route.js";
import addressRouter from "../routes/address.route.js";

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

/** Aracı katmanı bir kez çalıştırır: { passed, res } */
const run = async (limiter, req) => {
  const res = response();
  let passed = false;
  await limiter(req, res, () => { passed = true; });
  return { passed, res };
};

const userReq = (id, ip = "10.0.0.1") => ({ user: { _id: id }, ip });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("sınır aşılınca 429: Türkçe message + error, Retry-After; kullanıcılar birbirini etkilemez", async () => {
  const limiter = createRateLimiter({ name: "t1", windowMs: 60000, max: 3, message: "Yavaş!", store: createMemoryStore() });
  for (let i = 0; i < 3; i += 1) {
    const { passed, res } = await run(limiter, userReq("u1"));
    assert.equal(passed, true);
    assert.equal(res.headers["X-RateLimit-Remaining"], String(2 - i));
  }
  const { passed, res } = await run(limiter, userReq("u1"));
  assert.equal(passed, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.message, "Yavaş!");
  assert.equal(res.body.error, "Yavaş!");
  assert.equal(res.body.success, false);
  assert.ok(Number(res.headers["Retry-After"]) >= 1 && Number(res.headers["Retry-After"]) <= 60);
  // Aynı IP'den başka kullanıcı: anahtar kullanıcı kimliğidir
  assert.equal((await run(limiter, userReq("u2"))).passed, true);
});

test("oturum yoksa IP ile; keyBy 'ip' oturum olsa da IP kullanır", async () => {
  assert.equal(clientKey({ user: { _id: "abc" }, ip: "1.1.1.1" }), "u:abc");
  assert.equal(clientKey({ ip: "1.1.1.1" }), "ip:1.1.1.1");
  assert.equal(clientKey({ socket: { remoteAddress: "2.2.2.2" } }), "ip:2.2.2.2");

  const byIp = createRateLimiter({ name: "t2", windowMs: 60000, max: 2, keyBy: "ip", store: createMemoryStore() });
  assert.equal((await run(byIp, userReq("a", "9.9.9.9"))).passed, true);
  assert.equal((await run(byIp, userReq("b", "9.9.9.9"))).passed, true);
  assert.equal((await run(byIp, userReq("c", "9.9.9.9"))).res.statusCode, 429, "farklı kullanıcı, aynı IP");
  assert.equal((await run(byIp, { ip: "8.8.8.8" })).passed, true);
});

test("sabit pencere dolunca sayaç sıfırlanır", async () => {
  const limiter = createRateLimiter({ name: "t3", windowMs: 80, max: 1, store: createMemoryStore() });
  // Pencere sınırına yakın başlamamak için yeni bir pencerenin başını bekle
  await sleep(80 - (Date.now() % 80) + 2);
  assert.equal((await run(limiter, userReq("u"))).passed, true);
  assert.equal((await run(limiter, userReq("u"))).passed, false);
  await sleep(100);
  assert.equal((await run(limiter, userReq("u"))).passed, true);
});

test("Redis sayacı: incr + pexpire; Redis hata verirse ya da incr yoksa bellek yedeği", async () => {
  const calls = [];
  const counters = new Map();
  const fakeRedis = {
    async incr(key) { calls.push(["incr", key]); const n = (counters.get(key) || 0) + 1; counters.set(key, n); return n; },
    async pexpire(key, ms) { calls.push(["pexpire", key, ms]); return 1; },
  };
  const store = createRedisStore(fakeRedis, createMemoryStore());
  const limiter = createRateLimiter({ name: "t4", windowMs: 60000, max: 2, store });
  await run(limiter, userReq("r"));
  await run(limiter, userReq("r"));
  assert.equal((await run(limiter, userReq("r"))).res.statusCode, 429);
  assert.match(calls[0][1], /^rl:t4:u:r:\d+$/);
  assert.equal(calls.filter(([op]) => op === "pexpire").length, 1, "süre yalnızca ilk artışta verilir");
  assert.equal(calls.find(([op]) => op === "pexpire")[2], 61000);

  const broken = { incr: async () => { throw new Error("Connection is closed"); }, pexpire: async () => 1 };
  const fallbackLimiter = createRateLimiter({ name: "t5", windowMs: 60000, max: 1, store: createRedisStore(broken, createMemoryStore()) });
  assert.equal((await run(fallbackLimiter, userReq("f"))).passed, true);
  assert.equal((await run(fallbackLimiter, userReq("f"))).res.statusCode, 429, "bellek yedeği saymaya devam eder");

  const noIncr = createRateLimiter({ name: "t6", windowMs: 60000, max: 1, store: createRedisStore({ get: async () => null }, createMemoryStore()) });
  assert.equal((await run(noIncr, userReq("m"))).passed, true);
  assert.equal((await run(noIncr, userReq("m"))).res.statusCode, 429);

  // Sayaç tamamen erişilemezse istek engellenmez
  const dead = createRateLimiter({ name: "t7", windowMs: 60000, max: 1, store: { hit: async () => { throw new Error("x"); } } });
  assert.equal((await run(dead, userReq("d"))).passed, true);
  assert.equal((await run(dead, userReq("d"))).passed, true);
});

test("place-order sınırı: kullanıcı başına dakikada 10, 11. istek 429 (varsayılan sayaçla)", async () => {
  const req = userReq(`order-${Date.now()}`);
  for (let i = 0; i < 10; i += 1) assert.equal((await run(placeOrderRateLimit, req)).passed, true, `istek ${i + 1}`);
  const { passed, res } = await run(placeOrderRateLimit, req);
  assert.equal(passed, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.message, "Çok sık sipariş denemesi yaptınız. Lütfen bir dakika sonra tekrar deneyin.");
  assert.equal(res.body.error, res.body.message);
});

test("auth sınırı: IP başına 10 dakikada 300; adres ve teklif dakikada 60", async () => {
  const ip = `203.0.113.${Date.now() % 250}`;
  for (let i = 0; i < 300; i += 1) assert.equal((await run(authRateLimit, { ip })).passed, true);
  const blocked = await run(authRateLimit, { ip });
  assert.equal(blocked.res.statusCode, 429);
  assert.ok(blocked.res.body.message && blocked.res.body.error);
  assert.ok(Number(blocked.res.headers["Retry-After"]) <= 600);

  for (const limiter of [deliveryQuoteRateLimit, addressRateLimit]) {
    const req = userReq(`u-${Math.random()}`);
    for (let i = 0; i < 60; i += 1) assert.equal((await run(limiter, req)).passed, true);
    assert.equal((await run(limiter, req)).res.statusCode, 429);
  }
});

const routeHandlers = (router, method, path) =>
  router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route.stack.map((s) => s.handle) || [];

test("sınırlar rotalara bağlı: place-order (oturumdan sonra), signup/login, quote, adresler", () => {
  const order = routeHandlers(cartRouter, "post", "/place-order");
  assert.equal(order.indexOf(placeOrderRateLimit), 1, "protectRoute'tan hemen sonra (kullanıcı anahtarı)");
  assert.ok(routeHandlers(authRouter, "post", "/signup").includes(authRateLimit));
  assert.ok(routeHandlers(authRouter, "post", "/login").includes(authRateLimit));
  assert.equal(routeHandlers(deliveryRouter, "post", "/quote").indexOf(deliveryQuoteRateLimit), 1);
  const routerLevel = addressRouter.stack.filter((layer) => !layer.route).map((layer) => layer.handle);
  assert.ok(routerLevel.includes(addressRateLimit));
  // Yenileme ve çıkış sınırlanmaz (mobil uygulama sık yeniler)
  assert.equal(routeHandlers(authRouter, "post", "/refresh-token").includes(authRateLimit), false);
});
