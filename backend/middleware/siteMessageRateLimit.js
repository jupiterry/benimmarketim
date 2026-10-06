// Herkese açık form olduğu için IP başına sınır: 10 dakikada 5 gönderim
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const buckets = new Map();
export const siteMessageRateLimit = (req, res, next) => {
  const now = Date.now();
  // Sunucu ters vekil (nginx) arkasında olduğundan önce vekilin ilettiği adres kullanılır
  const forwarded = String(req.headers?.["x-real-ip"] || req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || req.ip || req.socket?.remoteAddress || "unknown";
  const current = buckets.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  entry.count += 1;
  buckets.set(key, entry);
  if (buckets.size > 10000) for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
  if (entry.count > MAX_PER_WINDOW) return res.status(429).json({ success: false, message: "Çok fazla gönderim yaptınız. Lütfen biraz sonra tekrar deneyin." });
  next();
};
