import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true
});

// Hata durumunda uygulamayı çökertme
redis.on('error', (err) => {
  console.warn('Redis bağlantı uyarısı:', err.message);
});

redis.on('connect', () => {
  console.log('✅ Redis bağlantısı başarılı');
});
