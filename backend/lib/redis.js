import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL;

// Yerel geliştirmede/Redis erişilemediğinde API'nin tamamen çökmesini önleyen
// küçük bir bellek tabanlı uyumluluk katmanı. Üretimde gerçek Redis kullanılır.
// set(key, value, "EX", saniye) ile verilen TTL'ye uyulur; expire/ttl de desteklenir.
class MemoryRedis {
  constructor() {
    this.store = new Map(); // key → { value, expiresAt|null }
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
    this.store.set(key, { value: String(value), expiresAt });
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

export const redis = process.env.REDIS_DISABLED === 'true' || !redisUrl
  ? new MemoryRedis()
  : new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
