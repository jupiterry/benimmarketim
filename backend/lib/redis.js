import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Yerel geliştirmede/Redis erişilemediğinde API'nin tamamen çökmesini önleyen
// küçük bir bellek tabanlı uyumluluk katmanı. Üretimde gerçek Redis kullanılır;
// bağlantı koptuğunda aynı katman geçici yedek olarak devreye girer (ResilientRedis).
// set(key, value, "EX", saniye) ile verilen TTL'ye uyulur; expire/ttl de desteklenir.
const MEMORY_MAX_KEYS = 100000;

export class MemoryRedis {
  constructor({ maxKeys = MEMORY_MAX_KEYS } = {}) {
    this.store = new Map(); // key → { value, expiresAt|null }
    this.maxKeys = maxKeys;
  }
  _live(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }
  // Bellek sınırsız büyümesin: önce süresi dolanlar, yetmezse en eski anahtar atılır.
  _trim() {
    if (this.store.size <= this.maxKeys) return;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.store.delete(key);
    }
    while (this.store.size > this.maxKeys) this.store.delete(this.store.keys().next().value);
  }
  async get(key) {
    return this._live(key)?.value ?? null;
  }
  async set(key, value, ...args) {
    let expiresAt = null;
    for (let i = 0; i < args.length; i += 1) {
      const flag = String(args[i]).toUpperCase();
      if (flag === "EX") expiresAt = Date.now() + Number(args[i + 1]) * 1000;
      else if (flag === "PX") expiresAt = Date.now() + Number(args[i + 1]);
    }
    this.store.delete(key); // yeniden yazılan anahtar "en yeni" sıraya geçsin
    this.store.set(key, { value: String(value), expiresAt });
    this._trim();
    return "OK";
  }
  async del(...keys) {
    let removed = 0;
    for (const key of keys.flat()) {
      if (this.store.delete(key)) removed += 1;
    }
    return removed;
  }
  async expire(key, seconds) {
    const entry = this._live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + Number(seconds) * 1000;
    return 1;
  }
  async ttl(key) {
    const entry = this._live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }
  async exists(...keys) {
    return keys.flat().filter((key) => this._live(key)).length;
  }
}

/**
 * Kopan bağlantı hiç bırakılmadan yeniden denenir: 0,5 sn, 1 sn, 1,5 sn … en fazla 5 sn arayla.
 * (Eskiden `() => null` idi: tek bir kopmadan sonra istemci kalıcı olarak kapanıyor, giriş,
 * oturum yenileme ve önbellek komutları süreç yeniden başlatılana kadar hata veriyordu.)
 */
export const redisRetryStrategy = (times) => Math.min(Math.max(1, Number(times) || 1) * 500, 5000);

export const redisClientOptions = (overrides = {}) => ({
  maxRetriesPerRequest: 1,
  retryStrategy: redisRetryStrategy,
  connectTimeout: 5000,
  ...overrides,
});

/** Aynı hatayı her 5 sn'de bir loglayıp kayıtları doldurmamak için: dakikada en çok bir satır. */
export const createThrottledLogger = (label, { intervalMs = 60_000, log = console } = {}) => {
  let last = 0;
  let suppressed = 0;
  return (err) => {
    const now = Date.now();
    if (now - last < intervalMs) {
      suppressed += 1;
      return;
    }
    const extra = suppressed ? ` (+${suppressed} benzer hata)` : "";
    last = now;
    suppressed = 0;
    log.error(`${label}: ${err?.message || err}${extra}`);
  };
};

const COMMAND_TIMEOUT_MS = 1500;
const CONNECTING_STATES = new Set(["wait", "connecting", "connect"]);

/**
 * Gerçek Redis istemcisinin önüne konan dayanıklı katman.
 * - Bağlantı hazırken komutlar Redis'e gider (davranış eskisiyle aynı); yazılanlar ayrıca bellekte
 *   aynalanır ki kesinti sırasında okunabilsin.
 * - Bağlantı yokken (veya komut hata/zaman aşımı verirse) okuma ve yazma bellekten yapılır; istek
 *   asla Redis yüzünden 500'e düşmez, süreç çökmez.
 * - Kesintide değişen anahtarlar bağlantı geri gelince Redis'e yazılır (çıkışta silinen oturum
 *   anahtarı da Redis'ten silinir), aktarılana kadar bellekteki değer esas alınır.
 */
export class ResilientRedis {
  constructor(client, { memory = new MemoryRedis(), timeoutMs = COMMAND_TIMEOUT_MS, flushRetryMs = 2000, log = console } = {}) {
    this.client = client;
    this.memory = memory;
    this.timeoutMs = timeoutMs;
    this.flushRetryMs = flushRetryMs;
    this.log = log;
    this.pending = new Set();
    this.flushing = null;
    this.flushTimer = null;
    this.everReady = client.status === "ready";
    this.hadError = false;
    this.down = false;
    const logError = createThrottledLogger("Redis bağlantı hatası", { log });
    this.logFailure = createThrottledLogger("Redis komutu başarısız, bellek yedeği kullanılıyor", { log });
    // 'error' dinleyicisi şart: dinleyicisiz EventEmitter hatası süreci çökertir.
    client.on("error", (err) => {
      this.hadError = true;
      logError(err);
    });
    client.on("close", () => {
      if (this.everReady && !this.down) {
        this.down = true;
        log.warn("⚠️ Redis bağlantısı koptu; yeniden bağlanana kadar bellek yedeği kullanılıyor.");
      }
    });
    client.on("ready", () => {
      if (this.down) log.log("✅ Redis bağlantısı geri geldi.");
      this.everReady = true;
      this.down = false;
      this.flushPending().catch(() => {});
    });
  }

  get status() {
    return this.client.status;
  }

  get connected() {
    return this.client.status === "ready";
  }

  // İlk bağlantı sürerken (henüz hata yoksa) komut ioredis kuyruğunda bağlantıyı bekler; açılıştaki
  // ilk oturum yenileme istekleri boş bellekten "geçersiz" yanıtı almasın. Kesinti anında beklenmez.
  _useRedis() {
    const { status } = this.client;
    if (status === "ready") return true;
    return !this.everReady && !this.hadError && CONNECTING_STATES.has(status);
  }

  // Bağlantı açıkken tek bir komut hata/zaman aşımı verdiyse 'ready' olayı gelmeyebilir: bekleyen
  // anahtarlar kısa bir süre sonra yine Redis'e aktarılmaya çalışılır.
  _markPending(keys) {
    for (const key of keys) this.pending.add(key);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.client.status === "ready") this.flushPending().catch(() => {});
    }, this.flushRetryMs);
    this.flushTimer.unref?.();
  }

  _timed(promise) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Redis zaman aşımı")), this.timeoutMs);
      timer.unref?.();
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
  }

  async _read(command, key, args) {
    if (!this.pending.has(key) && this._useRedis()) {
      try {
        return await this._timed(this.client[command](key, ...args));
      } catch (err) {
        this.logFailure(err);
      }
    }
    return this.memory[command](key, ...args);
  }

  get(key) {
    return this._read("get", key, []);
  }

  ttl(key) {
    return this._read("ttl", key, []);
  }

  async exists(...keys) {
    const list = keys.flat();
    if (!list.some((key) => this.pending.has(key)) && this._useRedis()) {
      try {
        return await this._timed(this.client.exists(...list));
      } catch (err) {
        this.logFailure(err);
      }
    }
    return this.memory.exists(...list);
  }

  async set(key, value, ...args) {
    if (this._useRedis()) {
      try {
        const result = await this._timed(this.client.set(key, value, ...args));
        if (result === "OK") {
          await this.memory.set(key, value, ...args);
          this.pending.delete(key);
        }
        return result;
      } catch (err) {
        this.logFailure(err);
      }
    }
    this._markPending([key]);
    return this.memory.set(key, value, ...args);
  }

  async del(...keys) {
    const list = keys.flat();
    if (this._useRedis()) {
      try {
        const removed = await this._timed(this.client.del(...list));
        await this.memory.del(...list);
        for (const key of list) this.pending.delete(key);
        return removed;
      } catch (err) {
        this.logFailure(err);
      }
    }
    this._markPending(list);
    return this.memory.del(...list);
  }

  async expire(key, seconds) {
    if (this._useRedis()) {
      try {
        const result = await this._timed(this.client.expire(key, seconds));
        await this.memory.expire(key, seconds);
        return result;
      } catch (err) {
        this.logFailure(err);
      }
    }
    this._markPending([key]);
    return this.memory.expire(key, seconds);
  }

  // Sayaçlar (istek sınırlayıcı) yalnızca Redis'te tutulur; bağlantı yoksa hata verilir ve
  // middleware/rateLimit.js kendi süreç içi sayacına düşer.
  async incr(key) {
    if (!this._useRedis()) throw new Error("Redis bağlı değil");
    return this._timed(this.client.incr(key));
  }

  async pexpire(key, ms) {
    if (!this._useRedis()) throw new Error("Redis bağlı değil");
    return this._timed(this.client.pexpire(key, ms));
  }

  /** Kesinti sırasında bellekte değişen anahtarları Redis'e aktarır (bağlantı geri gelince). */
  flushPending() {
    if (this.flushing) return this.flushing;
    if (!this.pending.size) return Promise.resolve();
    this.flushing = (async () => {
      for (const key of [...this.pending]) {
        if (this.client.status !== "ready") break;
        const entry = this.memory._live(key);
        try {
          const ttlMs = entry && entry.expiresAt !== null ? Math.ceil(entry.expiresAt - Date.now()) : null;
          if (!entry || (ttlMs !== null && ttlMs <= 0)) await this._timed(this.client.del(key));
          else if (ttlMs === null) await this._timed(this.client.set(key, entry.value));
          else await this._timed(this.client.set(key, entry.value, "PX", ttlMs));
          this.pending.delete(key);
        } catch (err) {
          this.logFailure(err);
          break; // bir sonraki 'ready' olayında kalanlar tekrar denenir
        }
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
}

export const createRedis = ({
  url = process.env.UPSTASH_REDIS_URL,
  disabled = process.env.REDIS_DISABLED === "true",
  RedisClass = Redis,
  log = console,
} = {}) => {
  if (disabled || !url) return new MemoryRedis();
  return new ResilientRedis(new RedisClass(url, redisClientOptions()), { log });
};

export const redis = createRedis();

// ── Socket.IO Redis adapter ─────────────────────────────────────────────────

/**
 * Promise döndüren istemci metotlarının reddini yakalar: Redis kopukken yapılan publish/subscribe
 * "unhandled rejection" olup API sürecini çökertmesin. Hata loglanır, çağırana boş sonuç döner.
 */
export const guardRejections = (client, methods, onError) => {
  for (const name of methods) {
    if (typeof client[name] !== "function") continue;
    const original = client[name].bind(client);
    client[name] = (...args) => {
      let result;
      try {
        result = original(...args);
      } catch (err) {
        onError(err);
        return Promise.resolve(name === "publish" ? 0 : undefined);
      }
      return Promise.resolve(result).catch((err) => {
        onError(err);
        return name === "publish" ? 0 : undefined;
      });
    };
  }
  return client;
};

/**
 * Socket.IO Redis adapter'ı yalnızca SOCKET_REDIS_ADAPTER=1 ile açılır. API PM2'de tek bir fork
 * süreç olarak çalıştığından varsayılan bellek içi adapter yeterlidir; çok süreçli (cluster)
 * kuruluma geçilirse açılmalıdır. Açıkken istemciler sürekli yeniden bağlanır ve publish
 * hataları yutulup loglanır.
 */
export const setupSocketRedisAdapter = (io, {
  createAdapter,
  env = process.env,
  RedisClass = Redis,
  log = console,
} = {}) => {
  if (env.SOCKET_REDIS_ADAPTER !== "1") {
    log.log("Socket.IO bellek içi adapter ile çalışıyor (tek süreç). Redis adapter için SOCKET_REDIS_ADAPTER=1.");
    return null;
  }
  if (!env.UPSTASH_REDIS_URL || env.REDIS_DISABLED === "true") {
    log.warn("⚠️ SOCKET_REDIS_ADAPTER=1 ama Redis tanımlı değil; Socket.IO bellek içi adapter ile çalışıyor.");
    return null;
  }
  if (typeof createAdapter !== "function") throw new Error("createAdapter gerekli");
  const pubClient = new RedisClass(env.UPSTASH_REDIS_URL, redisClientOptions());
  // Abone bağlantısı komutlarını bağlantı gelene kadar bekletir; ioredis yeniden bağlanınca
  // abonelikleri kendisi yeniler (autoResubscribe).
  const subClient = pubClient.duplicate({ maxRetriesPerRequest: null });
  const pubError = createThrottledLogger("Socket.IO Redis (pub) hatası", { log });
  const subError = createThrottledLogger("Socket.IO Redis (sub) hatası", { log });
  pubClient.on("error", pubError);
  subClient.on("error", subError);
  pubClient.on("ready", () => log.log("✅ Socket.IO Redis pub bağlantısı hazır"));
  subClient.on("ready", () => log.log("✅ Socket.IO Redis sub bağlantısı hazır"));
  guardRejections(pubClient, ["publish", "spublish"], pubError);
  guardRejections(subClient, ["subscribe", "psubscribe", "unsubscribe", "punsubscribe"], subError);
  io.adapter(createAdapter(pubClient, subClient));
  log.log("✅ Socket.IO Redis adapter kuruldu (SOCKET_REDIS_ADAPTER=1)");
  return { pubClient, subClient };
};
