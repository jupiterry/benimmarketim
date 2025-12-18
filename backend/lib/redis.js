import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    // 3 denemeden sonra vazgeç
    if (times > 3) {
      console.warn('Redis bağlantısı başarısız, Redis olmadan devam ediliyor');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
  enableOfflineQueue: true, // Offline komutları sıraya al
  connectTimeout: 10000
});

// Hata durumunda uygulamayı çökertme
redis.on('error', (err) => {
  console.warn('Redis bağlantı uyarısı:', err.message);
});

redis.on('connect', () => {
  console.log('✅ Redis bağlantısı başarılı');
});

redis.on('ready', () => {
  console.log('✅ Redis kullanıma hazır');
});
