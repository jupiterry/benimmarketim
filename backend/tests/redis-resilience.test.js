// Redis dayanıklılığı: kopan bağlantı sonsuza dek (en fazla 5 sn arayla) yeniden denenir, kesintide
// bellek yedeği kullanılır ve kesintide değişen anahtarlar bağlantı gelince Redis'e aktarılır.
// Socket.IO Redis adapter'ı yalnızca SOCKET_REDIS_ADAPTER=1 ile açılır; publish/subscribe redleri
// API'yi çökertmez. Gerçek Redis gerekmez: istemci taklit edilir (bir test gerçek ioredis'i kapalı
// bir porta bağlayıp istemcinin vazgeçmediğini doğrular).
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import net from "node:net";
import { readFileSync } from "node:fs";
import Redis from "ioredis";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import {
  MemoryRedis,
  ResilientRedis,
  createRedis,
  redisClientOptions,
  redisRetryStrategy,
  setupSocketRedisAdapter,
  guardRejections,
} from "../lib/redis.js";

const silentLog = () => {
  const lines = [];
  const push = (...args) => lines.push(args.join(" "));
  return { lines, log: push, warn: push, error: push, info: push };
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

const freePort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

/** ioredis benzeri taklit: status, olaylar ve Map'te tutulan veri. */
class FakeClient extends EventEmitter {
  constructor(status = "ready") {
    super();
    this.status = status;
    this.data = new Map();
    this.calls = [];
    this.fail = false;
    this.hang = false;
  }
  _cmd(name, args, fn) {
    this.calls.push([name, ...args]);
    if (this.hang) return new Promise(() => {});
    if (this.status === "connecting") {
      // ioredis "offline queue": ilk bağlantı kurulunca komut çalışır
      return new Promise((resolve) => this.once("ready", () => resolve(fn())));
    }
    if (this.status !== "ready" || this.fail) return Promise.reject(new Error("Connection is closed."));
    return Promise.resolve(fn());
  }
  get(key) { return this._cmd("get", [key], () => this.data.get(key)?.value ?? null); }
  set(key, value, ...args) {
    return this._cmd("set", [key, value, ...args], () => {
      const flags = args.map((a) => String(a).toUpperCase());
      if (flags.includes("NX") && this.data.has(key)) return null;
      this.data.set(key, { value: String(value), args });
      return "OK";
    });
  }
  del(...keys) { return this._cmd("del", keys, () => keys.filter((k) => this.data.delete(k)).length); }
  expire(key, s) { return this._cmd("expire", [key, s], () => (this.data.has(key) ? 1 : 0)); }
  ttl(key) { return this._cmd("ttl", [key], () => (this.data.has(key) ? 100 : -2)); }
  exists(...keys) { return this._cmd("exists", keys, () => keys.filter((k) => this.data.has(k)).length); }
  incr(key) { return this._cmd("incr", [key], () => 1); }
  pexpire(key, ms) { return this._cmd("pexpire", [key, ms], () => 1); }
  goDown() { this.status = "reconnecting"; this.emit("close"); }
  comeBack() { this.status = "ready"; this.emit("ready"); }
}

// ── Yeniden bağlanma stratejisi ─────────────────────────────────────────────

test("retryStrategy her denemede sayı döndürür (asla null), 5 sn ile sınırlı", () => {
  assert.equal(redisRetryStrategy(1), 500);
  assert.equal(redisRetryStrategy(2), 1000);
  assert.equal(redisRetryStrategy(10), 5000);
  for (const times of [1, 3, 9, 11, 100, 10_000, 1e9]) {
    const delay = redisRetryStrategy(times);
    assert.equal(typeof delay, "number");
    assert.ok(delay >= 500 && delay <= 5000, `times=${times} → ${delay}`);
  }
  const options = redisClientOptions();
  assert.equal(options.retryStrategy, redisRetryStrategy);
  assert.equal(options.maxRetriesPerRequest, 1);
  assert.equal(redisClientOptions({ maxRetriesPerRequest: null }).maxRetriesPerRequest, null);
});

test("lib/redis.js ve server.js'te kalıcı kapanan istemci (retryStrategy: () => null) kalmadı", () => {
  const lib = readFileSync(new URL("../lib/redis.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  for (const source of [lib, server]) assert.doesNotMatch(source, /retryStrategy:\s*\(\)\s*=>\s*null/);
  assert.doesNotMatch(server, /from\s+["']ioredis["']/);
  assert.match(server, /setupSocketRedisAdapter\(io/);
  assert.match(server, /process\.on\(["']unhandledRejection["']/);
});

test("createRedis: Redis kapalı/tanımsızsa bellek katmanı, tanımlıysa dayanıklı istemci", () => {
  assert.ok(createRedis({ url: "", disabled: false }) instanceof MemoryRedis);
  assert.ok(createRedis({ url: "redis://x", disabled: true }) instanceof MemoryRedis);
  let received;
  class Ctor extends FakeClient {
    constructor(url, options) { super("connecting"); received = { url, options }; }
  }
  const client = createRedis({ url: "redis://example:6379", disabled: false, RedisClass: Ctor, log: silentLog() });
  assert.ok(client instanceof ResilientRedis);
  assert.equal(received.url, "redis://example:6379");
  assert.equal(typeof received.options.retryStrategy(50), "number");
});

test("gerçek ioredis: erişilemeyen sunucuda vazgeçmez, yeniden bağlanmayı sürdürür; komutlar bellekten yanıtlanır", async () => {
  const port = await freePort();
  const client = new Redis(`redis://127.0.0.1:${port}`, redisClientOptions({ connectTimeout: 500 }));
  const log = silentLog();
  const store = new ResilientRedis(client, { log, timeoutMs: 300 });
  let ended = false;
  client.on("end", () => { ended = true; });
  try {
    let reconnects = 0;
    await new Promise((resolve) => {
      client.on("reconnecting", () => { reconnects += 1; if (reconnects >= 2) resolve(); });
    });
    assert.equal(ended, false);
    assert.equal(client.status, "reconnecting");
    assert.equal(await store.set("refresh_token:u1", "tok", "EX", 60), "OK");
    assert.equal(await store.get("refresh_token:u1"), "tok");
    await assert.rejects(store.incr("rl:x"));
    assert.ok(log.lines.some((line) => line.includes("Redis bağlantı hatası")));
  } finally {
    client.disconnect();
  }
});

// ── Dayanıklı katman ────────────────────────────────────────────────────────

test("bağlıyken komutlar Redis'e gider ve bellekte aynalanır; kopunca bellekten okunur", async () => {
  const client = new FakeClient("ready");
  const store = new ResilientRedis(client, { log: silentLog() });
  assert.equal(await store.set("refresh_token:u1", "tok-1", "EX", 3600), "OK");
  assert.equal(client.data.get("refresh_token:u1").value, "tok-1");
  assert.equal(await store.get("refresh_token:u1"), "tok-1");
  assert.ok(client.calls.some(([name]) => name === "get"));

  client.goDown();
  client.calls.length = 0;
  // Kesintide: Redis'e hiç gidilmez, değer bellekteki aynadan gelir, istek hata vermez
  assert.equal(await store.get("refresh_token:u1"), "tok-1");
  assert.equal(await store.get("bilinmeyen"), null);
  assert.deepEqual(client.calls, []);
  assert.equal(store.connected, false);
});

test("kesintide yazılan/silinen anahtarlar bağlantı gelince Redis'e aktarılır", async () => {
  const client = new FakeClient("ready");
  const store = new ResilientRedis(client, { log: silentLog() });
  await store.set("refresh_token:eski", "tok-eski");
  client.goDown();

  // Kesintide giriş (yeni oturum) ve çıkış (eski oturum silinir) çalışır
  assert.equal(await store.set("refresh_token:yeni", "tok-yeni", "EX", 3600), "OK");
  assert.equal(await store.del("refresh_token:eski"), 1);
  assert.equal(await store.set("kalici", "1"), "OK");
  assert.equal(await store.get("refresh_token:yeni"), "tok-yeni");
  assert.equal(client.data.get("refresh_token:eski").value, "tok-eski"); // Redis'e henüz dokunulmadı

  client.comeBack();
  await store.flushPending();
  assert.equal(client.data.get("refresh_token:yeni").value, "tok-yeni");
  const [flag, ttl] = client.data.get("refresh_token:yeni").args;
  assert.equal(flag, "PX");
  assert.ok(ttl > 3_500_000 && ttl <= 3_600_000);
  assert.equal(client.data.get("kalici").value, "1");
  assert.deepEqual(client.data.get("kalici").args, []);
  assert.equal(client.data.has("refresh_token:eski"), false); // çıkış yapılan oturum geri gelmez
  assert.equal(store.pending.size, 0);
});

test("aktarım bitmeden okunan anahtar bellekteki güncel değerden gelir", async () => {
  const client = new FakeClient("ready");
  const store = new ResilientRedis(client, { log: silentLog() });
  await store.set("k", "redis-eski");
  client.goDown();
  await store.set("k", "kesintide-yeni");
  client.status = "ready"; // bağlandı ama 'ready' olayı (aktarım) henüz işlenmedi
  client.calls.length = 0;
  assert.equal(await store.get("k"), "kesintide-yeni");
  assert.deepEqual(client.calls, []);
});

test("bağlıyken komut hata verirse ya da yanıt gelmezse istek bellek yedeğiyle tamamlanır", async () => {
  const client = new FakeClient("ready");
  const log = silentLog();
  const store = new ResilientRedis(client, { log, timeoutMs: 30 });
  await store.set("a", "1");
  client.fail = true;
  assert.equal(await store.get("a"), "1");
  assert.equal(await store.set("b", "2"), "OK");
  assert.ok(store.pending.has("b"));
  client.fail = false;
  client.hang = true;
  const started = Date.now();
  assert.equal(await store.get("a"), "1");
  assert.ok(Date.now() - started < 1000);
  assert.ok(log.lines.some((line) => line.includes("bellek yedeği")));
});

test("bağlantı açıkken tek komut başarısız olursa bekleyen anahtar kısa süre sonra Redis'e aktarılır", async () => {
  const client = new FakeClient("ready");
  const store = new ResilientRedis(client, { log: silentLog(), flushRetryMs: 20 });
  client.fail = true;
  assert.equal(await store.set("refresh_token:u9", "tok-9", "EX", 600), "OK");
  assert.ok(store.pending.has("refresh_token:u9"));
  client.fail = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  await store.flushPending();
  assert.equal(client.data.get("refresh_token:u9").value, "tok-9");
  assert.equal(store.pending.size, 0);
});

test("açılışta ilk bağlantı beklenir (oturum yenileme boş bellekten 'geçersiz' almaz); hata varsa beklenmez", async () => {
  const client = new FakeClient("connecting");
  const store = new ResilientRedis(client, { log: silentLog(), timeoutMs: 1000 });
  client.data.set("refresh_token:u1", { value: "tok", args: [] });
  const pending = store.get("refresh_token:u1");
  client.comeBack();
  assert.equal(await pending, "tok");

  const down = new FakeClient("connecting");
  const store2 = new ResilientRedis(down, { log: silentLog() });
  down.emit("error", new Error("ECONNREFUSED"));
  assert.equal(await store2.get("x"), null);
  assert.deepEqual(down.calls, []);
});

test("istek sınırlayıcı sayaçları: bağlantı yoksa incr hata verir (rateLimit kendi belleğine düşer)", async () => {
  const client = new FakeClient("ready");
  const store = new ResilientRedis(client, { log: silentLog() });
  assert.equal(await store.incr("rl:a"), 1);
  assert.equal(await store.pexpire("rl:a", 1000), 1);
  client.goDown();
  await assert.rejects(store.incr("rl:a"));
  await assert.rejects(store.pexpire("rl:a", 1000));
});

test("NX kilidi: Redis 'alınmış' derse bellekte aynalanmaz; kesintide yine yanıt döner", async () => {
  const client = new FakeClient("ready");
  const store = new ResilientRedis(client, { log: silentLog() });
  client.data.set("lock", { value: "baska", args: [] });
  assert.equal(await store.set("lock", "ben", "EX", 50, "NX"), null);
  assert.equal(await store.memory.get("lock"), null);
  client.goDown();
  assert.equal(await store.set("lock", "ben", "EX", 50, "NX"), "OK");
});

test("bellek katmanı sınırsız büyümez", async () => {
  const memory = new MemoryRedis({ maxKeys: 3 });
  for (const key of ["a", "b", "c", "d"]) await memory.set(key, key);
  assert.equal(memory.store.size, 3);
  assert.equal(await memory.get("a"), null);
  assert.equal(await memory.get("d"), "d");
});

// ── Socket.IO Redis adapter ─────────────────────────────────────────────────

class FakeIoRedis extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
  }
  duplicate(override) { return new FakeIoRedis(this.url, { ...this.options, ...override }); }
  publish() { return Promise.reject(new Error("Connection is closed.")); }
  subscribe() { return Promise.reject(new Error("Connection is closed.")); }
  psubscribe() { return Promise.reject(new Error("Connection is closed.")); }
}

const fakeIo = () => {
  const io = { adapters: [] };
  io.adapter = (value) => io.adapters.push(value);
  return io;
};

test("Socket.IO Redis adapter varsayılan olarak kapalı (tek fork süreç: bellek içi adapter)", () => {
  const io = fakeIo();
  let created = 0;
  const createAdapter = () => { created += 1; return "redis-adapter"; };
  const env = { UPSTASH_REDIS_URL: "redis://x", REDIS_DISABLED: "false" };
  assert.equal(setupSocketRedisAdapter(io, { createAdapter, env, RedisClass: FakeIoRedis, log: silentLog() }), null);
  assert.equal(setupSocketRedisAdapter(io, { createAdapter, env: { ...env, SOCKET_REDIS_ADAPTER: "true" }, RedisClass: FakeIoRedis, log: silentLog() }), null);
  assert.equal(setupSocketRedisAdapter(io, { createAdapter, env: { SOCKET_REDIS_ADAPTER: "1", REDIS_DISABLED: "true", UPSTASH_REDIS_URL: "redis://x" }, RedisClass: FakeIoRedis, log: silentLog() }), null);
  assert.equal(setupSocketRedisAdapter(io, { createAdapter, env: { SOCKET_REDIS_ADAPTER: "1" }, RedisClass: FakeIoRedis, log: silentLog() }), null);
  assert.equal(created, 0);
  assert.deepEqual(io.adapters, []);
});

test("SOCKET_REDIS_ADAPTER=1: yeniden bağlanan istemciler, publish/subscribe redleri yutulur", async () => {
  const io = fakeIo();
  let clients;
  const createAdapter = (pub, sub) => { clients = { pub, sub }; return "redis-adapter"; };
  const log = silentLog();
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const result = setupSocketRedisAdapter(io, {
      createAdapter,
      env: { SOCKET_REDIS_ADAPTER: "1", UPSTASH_REDIS_URL: "redis://cache:6379" },
      RedisClass: FakeIoRedis,
      log,
    });
    assert.ok(result);
    assert.deepEqual(io.adapters, ["redis-adapter"]);
    assert.equal(typeof clients.pub.options.retryStrategy(1000), "number");
    assert.equal(typeof clients.sub.options.retryStrategy(1000), "number");
    assert.equal(clients.sub.options.maxRetriesPerRequest, null);
    assert.ok(clients.pub.listenerCount("error") >= 1);
    assert.ok(clients.sub.listenerCount("error") >= 1);
    // Adapter'ın yaptığı gibi dönüş değerine bakmadan çağır: süreç çökmemeli
    clients.pub.publish("socket.io#/#", "msg");
    clients.sub.psubscribe("socket.io#/#*");
    clients.sub.subscribe(["a", "b"]);
    assert.equal(await clients.pub.publish("ch", "m"), 0);
    await tick();
    await tick();
    assert.deepEqual(unhandled, []);
    assert.ok(log.lines.some((line) => line.includes("Socket.IO Redis (pub) hatası")));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("guardRejections: senkron hata da yakalanır", async () => {
  const errors = [];
  const client = { publish() { throw new Error("boom"); } };
  guardRejections(client, ["publish", "missing"], (err) => errors.push(err.message));
  assert.equal(await client.publish("x", "y"), 0);
  assert.deepEqual(errors, ["boom"]);
});

test("gerçek adapter + erişilemeyen Redis: sipariş bildirimi yayını yakalanmamış red bırakmaz", async () => {
  const port = await freePort();
  const io = new Server();
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String(reason));
  process.on("unhandledRejection", onUnhandled);
  let clients;
  try {
    clients = setupSocketRedisAdapter(io, {
      createAdapter,
      env: { SOCKET_REDIS_ADAPTER: "1", UPSTASH_REDIS_URL: `redis://127.0.0.1:${port}` },
      log: silentLog(),
    });
    io.to("adminRoom").emit("newOrder", { id: 1 });
    // maxRetriesPerRequest=1: ilk yeniden deneme başarısız olunca publish/subscribe reddedilir
    let reconnects = 0;
    await new Promise((resolve) => {
      clients.pubClient.on("reconnecting", () => { reconnects += 1; if (reconnects >= 2) resolve(); });
    });
    await tick();
    assert.deepEqual(unhandled, []);
    assert.equal(clients.pubClient.status, "reconnecting");
  } finally {
    process.off("unhandledRejection", onUnhandled);
    clients?.pubClient.disconnect();
    clients?.subClient.disconnect();
    // http sunucusu olmadan io.close() kendi içinde hata verir; adapter'ı kapatmak yeterli
    await Promise.resolve(io.of("/").adapter.close?.()).catch(() => {});
  }
});
