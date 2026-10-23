// Sabit pencereli istek sınırlayıcı (yeni paket yok).
// Sayaçlar Redis'te tutulur (PM2 cluster'da tüm süreçler aynı sayacı görür); Redis yoksa, hata verirse
// ya da yavaş yanıt verirse süreç içi belleğe düşülür. Anahtar: oturum açmış kullanıcının kimliği,
// yoksa IP (app.set("trust proxy", 1) sayesinde Nginx arkasında req.ip gerçek istemci adresidir).
// Sınır aşılınca 429 + Retry-After; gövdede hem `message` (mobil) hem `error` (web) Türkçe.
import { redis } from "../lib/redis.js";

const REDIS_TIMEOUT_MS = 250;
const MAX_MEMORY_KEYS = 20000;

/** Süreç içi sabit pencere sayacı (yedek ve testler için). */
export const createMemoryStore = () => {
  const buckets = new Map(); // key → { count, resetAt }
  return {
    async hit(key, windowMs, now = Date.now()) {
      let entry = buckets.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: (Math.floor(now / windowMs) + 1) * windowMs };
        buckets.set(key, entry);
      }
      entry.count += 1;
      if (buckets.size > MAX_MEMORY_KEYS) {
        for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
        if (buckets.size > MAX_MEMORY_KEYS) buckets.delete(buckets.keys().next().value);
      }
      return { count: entry.count, resetAt: entry.resetAt };
    },
    reset() {
      buckets.clear();
    },
    get size() {
      return buckets.size;
    },
  };
};

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("rate-limit redis timeout")), ms).unref?.()),
  ]);

/**
 * Redis destekli sayaç; Redis istemcisi incr desteklemiyorsa (bellek uyumluluk katmanı) ya da
 * hata verirse bellek sayacını kullanır.
 */
export const createRedisStore = (client = redis, fallback = createMemoryStore()) => ({
  async hit(key, windowMs, now = Date.now()) {
    const windowIndex = Math.floor(now / windowMs);
    const resetAt = (windowIndex + 1) * windowMs;
    if (client && typeof client.incr === "function" && typeof client.pexpire === "function") {
      try {
        const redisKey = `rl:${key}:${windowIndex}`;
        const count = Number(await withTimeout(client.incr(redisKey), REDIS_TIMEOUT_MS));
        if (count === 1) client.pexpire(redisKey, windowMs + 1000).catch(() => {});
        if (Number.isFinite(count)) return { count, resetAt };
      } catch {
        // Redis erişilemiyor → bellek sayacı
      }
    }
    return fallback.hit(key, windowMs, now);
  },
});

const defaultStore = createRedisStore();

export const clientKey = (req) => {
  if (req.user?._id) return `u:${String(req.user._id)}`;
  return `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
};

/**
 * @param {{ name: string, windowMs: number, max: number, message?: string,
 *   keyBy?: "user" | "ip" | ((req) => string), store?: { hit: Function }, skip?: (req) => boolean }} options
 */
export const createRateLimiter = ({
  name,
  windowMs,
  max,
  message = "Çok fazla istek gönderdiniz. Lütfen biraz sonra tekrar deneyin.",
  keyBy = "user",
  store = defaultStore,
  skip,
}) => {
  if (!name || !(windowMs > 0) || !(max > 0)) throw new Error("createRateLimiter: name, windowMs ve max zorunlu");
  const keyOf = typeof keyBy === "function"
    ? keyBy
    : keyBy === "ip"
      ? (req) => `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`
      : clientKey;

  return async function rateLimit(req, res, next) {
    if (skip?.(req)) return next();
    let result;
    try {
      result = await store.hit(`${name}:${keyOf(req)}`, windowMs);
    } catch {
      return next(); // sayaç tamamen erişilemezse isteği engelleme
    }
    const remaining = Math.max(0, max - result.count);
    res.setHeader?.("X-RateLimit-Limit", String(max));
    res.setHeader?.("X-RateLimit-Remaining", String(remaining));
    if (result.count > max) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      res.setHeader?.("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, error: message, message, retryAfter });
    }
    return next();
  };
};

// ── Uygulamada kullanılan sınırlar ──
export const placeOrderRateLimit = createRateLimiter({
  name: "place-order",
  windowMs: 60 * 1000,
  max: 10,
  message: "Çok sık sipariş denemesi yaptınız. Lütfen bir dakika sonra tekrar deneyin.",
});

// Yurtlarda yüzlerce kişi aynı IP'yi paylaşır: sınır geniş tutulur; şifre denemesine karşı
// asıl koruma loginRateLimiter'daki IP + e-posta kovalarıdır.
export const authRateLimit = createRateLimiter({
  name: "auth",
  windowMs: 10 * 60 * 1000,
  max: 300,
  keyBy: "ip",
  message: "Çok fazla deneme yaptınız. Lütfen birkaç dakika sonra tekrar deneyin.",
});

export const deliveryQuoteRateLimit = createRateLimiter({
  name: "delivery-quote",
  windowMs: 60 * 1000,
  max: 60,
});

export const addressRateLimit = createRateLimiter({
  name: "addresses",
  windowMs: 60 * 1000,
  max: 60,
});
