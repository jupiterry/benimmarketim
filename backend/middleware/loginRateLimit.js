// Giriş denemesi sınırlayıcı: IP ve e-posta için AYRI kovalar.
// Tek kova (ip:email) olsaydı saldırgan kendi IP'sinden kurbanın e-postasını kilitleyemezdi ama
// aynı IP'den farklı e-postalarla sınırsız deneyebilirdi; yalnızca e-posta kovası olsaydı bir
// saldırgan kurbanın hesabını kilitleyebilirdi. Bu yüzden IP kovası sıkı, e-posta kovası gevşektir.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 10;
const MAX_ATTEMPTS_PER_EMAIL = 20;
const MAX_TRACKED_KEYS = 10000;

const ipAttempts = new Map();
const emailAttempts = new Map();

const pruneAttempts = (store, now) => {
  if (store.size < MAX_TRACKED_KEYS) return;

  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }

  if (store.size >= MAX_TRACKED_KEYS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
};

const getEntry = (store, key, now) => {
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) return { count: 0, resetAt: now + WINDOW_MS };
  return entry;
};

const reject = (res, entry, now) => {
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({
    message: "Çok fazla giriş denemesi. Lütfen kısa süre sonra tekrar deneyin.",
  });
};

export const loginRateLimiter = (req, res, next) => {
  const now = Date.now();
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "unknown";
  // app.set("trust proxy", 1) sayesinde req.ip Nginx arkasında gerçek istemci adresidir
  const ip = req.ip || req.socket?.remoteAddress || "unknown";

  const ipEntry = getEntry(ipAttempts, ip, now);
  if (ipEntry.count >= MAX_ATTEMPTS_PER_IP) return reject(res, ipEntry, now);

  const emailEntry = getEntry(emailAttempts, email, now);
  if (emailEntry.count >= MAX_ATTEMPTS_PER_EMAIL) return reject(res, emailEntry, now);

  ipEntry.count += 1;
  ipAttempts.set(ip, ipEntry);
  emailEntry.count += 1;
  emailAttempts.set(email, emailEntry);
  pruneAttempts(ipAttempts, now);
  pruneAttempts(emailAttempts, now);
  next();
};
