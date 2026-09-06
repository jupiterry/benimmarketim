const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_KEYS = 10000;

const loginAttempts = new Map();

const pruneAttempts = (now) => {
  if (loginAttempts.size < MAX_TRACKED_KEYS) return;

  for (const [key, entry] of loginAttempts) {
    if (entry.resetAt <= now) loginAttempts.delete(key);
  }

  if (loginAttempts.size >= MAX_TRACKED_KEYS) {
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey) loginAttempts.delete(oldestKey);
  }
};

export const loginRateLimiter = (req, res, next) => {
  const now = Date.now();
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "unknown";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const key = `${ip}:${email}`;

  let entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      message: "Çok fazla giriş denemesi. Lütfen kısa süre sonra tekrar deneyin.",
    });
  }

  entry.count += 1;
  loginAttempts.set(key, entry);
  pruneAttempts(now);
  next();
};
