const buckets = new Map();

export const aiRateLimit = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  const now = Date.now();
  const key = String(req.user?._id || req.ip);
  const current = buckets.get(key) || { count: 0, resetAt: now + 60000 };
  if (now >= current.resetAt) { current.count = 0; current.resetAt = now + 60000; }
  current.count += 1;
  buckets.set(key, current);
  if (current.count > 12) return res.status(429).json({ success: false, message: "Çok fazla mesaj gönderdiniz. Lütfen kısa bir süre sonra tekrar deneyin." });
  if (buckets.size > 10000) for (const [bucketKey, value] of buckets) if (value.resetAt < now) buckets.delete(bucketKey);
  next();
};
