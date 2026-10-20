// Mağaza ayarları ekranının saf yardımcıları: varsayılanlar, normalizasyon, taslak/kayıt farkı,
// alan bazlı doğrulama ve saat hesapları. React'e bağımlı değildir.

export const DELIVERY_POINT_KEYS = ["girlsDorm", "boysDorm"];
export const DELIVERY_POINT_META = {
  girlsDorm: { defaultName: "Kız KYK Yurdu", hint: "Kız öğrenci yurdu" },
  boysDorm: { defaultName: "Erkek KYK Yurdu", hint: "Erkek öğrenci yurdu" },
};

export const AI_PROVIDERS = [
  { value: "groq", label: "Groq", note: "Hızlı, ücretsiz kota", models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"] },
  { value: "openrouter", label: "OpenRouter", note: "Ücretsiz model havuzu", models: ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"] },
  { value: "gemini", label: "Gemini", note: "Google", models: ["gemini-2.0-flash", "gemini-1.5-flash"] },
];

export const SECTIONS = [
  { id: "orders", label: "Sipariş", short: "Saatler, minimum tutar", prefixes: ["orderStartHour", "orderStartMinute", "orderEndHour", "orderEndMinute", "minimumOrderAmount"] },
  { id: "delivery", label: "Teslimat", short: "Yurtlar ve noktalar", prefixes: ["deliveryPoints"] },
  { id: "ai", label: "Yapay zekâ", short: "Sağlayıcı ve model", prefixes: ["ai"] },
  { id: "app", label: "Uygulama", short: "Sürüm ve mağazalar", prefixes: ["appVersion"] },
  { id: "integrations", label: "Entegrasyonlar", short: "Telegram, bildirim servisi", prefixes: [] },
];

const pointDefaults = (key) => ({
  name: DELIVERY_POINT_META[key].defaultName,
  enabled: true,
  startHour: 10,
  startMinute: 0,
  endHour: 1,
  endMinute: 0,
});

export const DEFAULT_SETTINGS = {
  orderStartHour: 10,
  orderStartMinute: 0,
  orderEndHour: 1,
  orderEndMinute: 0,
  minimumOrderAmount: 250,
  deliveryPoints: { girlsDorm: pointDefaults("girlsDorm"), boysDorm: pointDefaults("boysDorm") },
  appVersion: {
    latestVersion: "4.0.3",
    minimumVersion: "4.0.3",
    forceUpdate: true,
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app",
    iosStoreUrl: "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr",
  },
  ai: { enabled: true, provider: "openrouter", model: "google/gemma-4-26b-a4b-it:free", maxHistoryMessages: 12 },
};

const num = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : fallback);

/** Sunucudan gelen belgeyi, ekranın beklediği tam şekle getirir (eksik alanlar varsayılana düşer). */
export const normalizeSettings = (raw = {}) => {
  const d = DEFAULT_SETTINGS;
  const points = {};
  for (const key of DELIVERY_POINT_KEYS) {
    const p = raw.deliveryPoints?.[key] || {};
    const base = pointDefaults(key);
    points[key] = {
      name: typeof p.name === "string" && p.name ? p.name : base.name,
      enabled: p.enabled === undefined ? base.enabled : Boolean(p.enabled),
      startHour: num(p.startHour, base.startHour),
      startMinute: num(p.startMinute, base.startMinute),
      endHour: num(p.endHour, base.endHour),
      endMinute: num(p.endMinute, base.endMinute),
    };
  }
  const v = raw.appVersion || {};
  const ai = raw.ai || {};
  return {
    orderStartHour: num(raw.orderStartHour, d.orderStartHour),
    orderStartMinute: num(raw.orderStartMinute, d.orderStartMinute),
    orderEndHour: num(raw.orderEndHour, d.orderEndHour),
    orderEndMinute: num(raw.orderEndMinute, d.orderEndMinute),
    minimumOrderAmount: num(raw.minimumOrderAmount, d.minimumOrderAmount),
    deliveryPoints: points,
    appVersion: {
      latestVersion: v.latestVersion ?? d.appVersion.latestVersion,
      minimumVersion: v.minimumVersion ?? d.appVersion.minimumVersion,
      forceUpdate: v.forceUpdate === undefined ? d.appVersion.forceUpdate : Boolean(v.forceUpdate),
      androidStoreUrl: v.androidStoreUrl ?? d.appVersion.androidStoreUrl,
      iosStoreUrl: v.iosStoreUrl ?? d.appVersion.iosStoreUrl,
    },
    ai: {
      enabled: ai.enabled === undefined ? d.ai.enabled : ai.enabled !== false,
      provider: AI_PROVIDERS.some((p) => p.value === ai.provider) ? ai.provider : d.ai.provider,
      model: typeof ai.model === "string" ? ai.model : d.ai.model,
      maxHistoryMessages: num(ai.maxHistoryMessages, d.ai.maxHistoryMessages),
    },
    updatedAt: raw.updatedAt || null,
  };
};

/** Sunucuya gönderilen gövde: updatedAt gibi salt okunur alanlar çıkarılır. */
export const toPayload = (settings) => {
  const rest = { ...settings };
  delete rest.updatedAt;
  return rest;
};

// ── Yol tabanlı okuma/yazma ("deliveryPoints.girlsDorm.enabled") ──
export const getPath = (obj, path) => path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
export const setPath = (obj, path, value) => {
  const keys = path.split(".");
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  let cursor = next;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
    } else {
      cursor[key] = cursor[key] && typeof cursor[key] === "object" ? { ...cursor[key] } : {};
      cursor = cursor[key];
    }
  });
  return next;
};

/** Nesneyi "yol → değer" tablosuna düzleştirir (karşılaştırma için). */
export const flatten = (obj, prefix = "", out = {}) => {
  for (const [key, value] of Object.entries(obj || {})) {
    if (key === "updatedAt") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
};

/** Taslak ile kayıtlı hal arasında değişen yollar. */
export const changedPaths = (saved, draft) => {
  const a = flatten(saved);
  const b = flatten(draft);
  const paths = new Set();
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (String(a[key] ?? "") !== String(b[key] ?? "")) paths.add(key);
  }
  return paths;
};

export const isSameSettings = (a, b) => changedPaths(a, b).size === 0;

/** Bir bölümün kapsadığı yollardan kaç tanesi değişti */
export const countInSection = (paths, section) =>
  [...paths].filter((path) => section.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))).length;

// ── Saat yardımcıları ──
export const clock = (hour, minute) => `${String(num(hour, 0)).padStart(2, "0")}:${String(num(minute, 0)).padStart(2, "0")}`;
export const parseClock = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};
const toMinutes = (hour, minute) => num(hour, 0) * 60 + num(minute, 0);

/** Aralık özeti: süre (dk), gece yarısını aşıyor mu, tüm gün mü */
export const describeRange = (startHour, startMinute, endHour, endMinute) => {
  const start = toMinutes(startHour, startMinute);
  const rawEnd = toMinutes(endHour, endMinute);
  const allDay = start === 0 && rawEnd === 0;
  const end = rawEnd === 0 && start !== 0 ? 1440 : rawEnd;
  const overnight = !allDay && end < start;
  const duration = allDay ? 1440 : overnight ? 1440 - start + end : end - start;
  return { start, end, allDay, overnight, duration, sameTime: !allDay && start === rawEnd };
};

/** Şu an (Türkiye saati) aralık içinde mi — sunucudaki isWithinOrderSchedule ile aynı kural */
export const isWithinSchedule = ({ startHour, startMinute, endHour, endMinute }, date = new Date()) => {
  const local = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const current = local.getHours() * 60 + local.getMinutes();
  const { start, end, allDay } = describeRange(startHour, startMinute, endHour, endMinute);
  if (allDay) return true;
  return start < end ? current >= start && current <= end : current >= start || current <= end;
};

export const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} dk`;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
};

// ── Doğrulama ──
const SEMVER = /^\d+\.\d+\.\d+$/;
const compareVersions = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** Alan bazlı hata tablosu: { yol: mesaj }. Boş nesne = geçerli. */
export const validateSettings = (s) => {
  const errors = {};
  const range = describeRange(s.orderStartHour, s.orderStartMinute, s.orderEndHour, s.orderEndMinute);
  if (range.sameTime) errors.orderEndHour = "Bitiş, başlangıçla aynı olamaz (tüm gün için 00:00–00:00 kullanın)";
  if (!(Number.isFinite(s.minimumOrderAmount) && s.minimumOrderAmount >= 0)) errors.minimumOrderAmount = "0 ya da daha büyük bir tutar girin";
  for (const key of DELIVERY_POINT_KEYS) {
    const p = s.deliveryPoints[key];
    if (!String(p.name || "").trim()) errors[`deliveryPoints.${key}.name`] = "Nokta adı boş olamaz";
    if (describeRange(p.startHour, p.startMinute, p.endHour, p.endMinute).sameTime) errors[`deliveryPoints.${key}.endHour`] = "Bitiş, başlangıçla aynı olamaz";
  }
  const v = s.appVersion;
  if (!SEMVER.test(String(v.latestVersion || "").trim())) errors["appVersion.latestVersion"] = "Sürüm 1.2.3 biçiminde olmalı";
  if (!SEMVER.test(String(v.minimumVersion || "").trim())) errors["appVersion.minimumVersion"] = "Sürüm 1.2.3 biçiminde olmalı";
  if (!errors["appVersion.latestVersion"] && !errors["appVersion.minimumVersion"] && compareVersions(v.minimumVersion, v.latestVersion) > 0) {
    errors["appVersion.minimumVersion"] = "Minimum sürüm, son sürümden büyük olamaz";
  }
  if (!isHttpsUrl(v.androidStoreUrl)) errors["appVersion.androidStoreUrl"] = "https:// ile başlayan geçerli bir bağlantı girin";
  if (!isHttpsUrl(v.iosStoreUrl)) errors["appVersion.iosStoreUrl"] = "https:// ile başlayan geçerli bir bağlantı girin";
  if (!String(s.ai.model || "").trim()) errors["ai.model"] = "Model adı zorunlu";
  if (!Number.isInteger(s.ai.maxHistoryMessages) || s.ai.maxHistoryMessages < 2 || s.ai.maxHistoryMessages > 30) errors["ai.maxHistoryMessages"] = "2 ile 30 arasında bir sayı girin";
  return errors;
};

/** Değişen bir alanın okunur etiketi ("Geri al" ipuçları ve özet için) */
export const FIELD_LABELS = {
  orderStartHour: "Sipariş başlangıç saati",
  orderStartMinute: "Sipariş başlangıç dakikası",
  orderEndHour: "Sipariş bitiş saati",
  orderEndMinute: "Sipariş bitiş dakikası",
  minimumOrderAmount: "Minimum sipariş tutarı",
  "deliveryPoints.girlsDorm.enabled": "Kız yurdu teslimatı",
  "deliveryPoints.girlsDorm.name": "Kız yurdu adı",
  "deliveryPoints.boysDorm.enabled": "Erkek yurdu teslimatı",
  "deliveryPoints.boysDorm.name": "Erkek yurdu adı",
  "appVersion.latestVersion": "Son sürüm",
  "appVersion.minimumVersion": "Minimum sürüm",
  "appVersion.forceUpdate": "Zorunlu güncelleme",
  "appVersion.androidStoreUrl": "Google Play bağlantısı",
  "appVersion.iosStoreUrl": "App Store bağlantısı",
  "ai.enabled": "Yapay zekâ asistanı",
  "ai.provider": "Sağlayıcı",
  "ai.model": "Model",
  "ai.maxHistoryMessages": "Geçmiş sınırı",
};

/** Taslak değer için okunur metin (eski değer ipuçları) */
export const displayValue = (path, value) => {
  if (typeof value === "boolean") return value ? "Açık" : "Kapalı";
  if (path === "minimumOrderAmount") return `₺${Number(value || 0).toLocaleString("tr-TR")}`;
  if (path === "ai.provider") return AI_PROVIDERS.find((p) => p.value === value)?.label || String(value);
  if (value === "" || value === null || value === undefined) return "—";
  return String(value);
};

// Oturum içi taslak (sekme değişince kaybolmasın)
export const DRAFT_KEY = "stg-settings-draft";
export const readDraft = () => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
export const writeDraft = (value) => {
  try {
    if (value) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* depolama kapalı olabilir */
  }
};
