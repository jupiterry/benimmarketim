import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL;

// Yerel geliştirmede/Redis erişilemediğinde API'nin tamamen çökmesini önleyen
// küçük bir bellek tabanlı uyumluluk katmanı. Üretimde gerçek Redis kullanılır.
class MemoryRedis {
  constructor() {
    this.store = new Map();
  }
  async get(key) {
    return this.store.get(key) ?? null;
  }
  async set(key, value) {
    this.store.set(key, String(value));
    return 'OK';
  }
  async del(key) {
    return this.store.delete(key) ? 1 : 0;
  }
}

export const redis = process.env.REDIS_DISABLED === 'true' || !redisUrl
  ? new MemoryRedis()
  : new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
