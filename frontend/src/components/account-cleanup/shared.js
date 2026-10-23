/* global Intl */
// Pasif hesap temizliği ekranının sabitleri ve saf yardımcıları.
// Sözleşme: GET/POST /api/account-cleanup/* (summary, users, ids, delete, export).
// Kural ("reel sayı"): ekrandaki sayıların hepsi sunucu yanıtından gelir; burada yalnızca biçimlendirme yapılır.
import { Globe, LogIn, ShoppingBag, ShoppingCart, Smartphone, UserPlus } from "lucide-react";

export const MONTH_OPTIONS = [6, 10, 12, 18, 24];
export const DEFAULT_MONTHS = 10;
export const PAGE_SIZES = [25, 50, 100, 200];
export const DEFAULT_PAGE_SIZE = 50;
/** Silme isteği başına hesap sayısı (sunucu sınırı 100) */
export const DELETE_CHUNK = 50;
export const SEARCH_MAX = 60;
/** Onay için yazılacak sözcük */
export const CONFIRM_WORD = "SİL";

export const SEGMENTS = ["inactive", "never"];

const NUM = new Intl.NumberFormat("tr-TR");
/** 2431 → "2.431" (tr-TR) */
export const num = (value) => NUM.format(Number(value) || 0);
/** Yüzde (bir ondalık): 25.18 → "%25,2" */
export const pct = (part, whole) => {
  const p = Number(whole) > 0 ? (Number(part) / Number(whole)) * 100 : 0;
  return `%${p.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
};

export const normalizeMonths = (value) => (MONTH_OPTIONS.includes(Number(value)) ? Number(value) : DEFAULT_MONTHS);

/** Takvim ayı ekler (sunucudaki setMonth ile aynı kural) */
export const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const TZ = "Europe/Istanbul";
/** "22 Ara 2025" */
export const longDate = (value) =>
  value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }) : "—";

/** Geçen süre: "12 gün", "3 ay", "1 yıl 4 ay" (ekran metni; hesap değil) */
export const elapsed = (value, now = Date.now()) => {
  if (!value) return "";
  const from = new Date(value);
  const to = new Date(now);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 1) {
    const days = Math.max(0, Math.floor((to - from) / 86400000));
    return days === 0 ? "bugün" : `${days} gün`;
  }
  if (months < 12) return `${months} ay`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} yıl ${rest} ay` : `${years} yıl`;
};
export const ago = (value, now) => {
  const text = elapsed(value, now);
  if (!text) return "";
  return text === "bugün" ? "bugün" : `${text} önce`;
};

/** Son etkinlik kaynağı (lastSeenSource) */
export const SOURCES = {
  web: { label: "Web sitesi", icon: Globe, hint: "Siteye en son girişi" },
  login: { label: "Oturum açma", icon: LogIn, hint: "En son oturum açtığı an" },
  app: { label: "Uygulama", icon: Smartphone, hint: "Mobil uygulamadaki son etkinliği" },
  cart: { label: "Sepet", icon: ShoppingCart, hint: "Sepetini en son güncellediği an" },
  order: { label: "Sipariş", icon: ShoppingBag, hint: "En son sipariş verdiği an" },
  signup: { label: "Yalnızca kayıt", icon: UserPlus, hint: "Kayıt olduktan sonra hiç geri gelmedi", tone: "warn" },
};
export const sourceOf = (key) => SOURCES[key] || null;

/** Satırdaki engel nedeni (blockReason) */
export const BLOCK_REASONS = {
  active_order: { label: "Aktif siparişi var", tone: "warn" },
  too_new: { label: "Hesap çok yeni", tone: "info" },
};

/** Silme yanıtındaki atlama nedenleri (skipped[].reason) */
export const SKIP_REASONS = {
  not_found: "Hesap bulunamadı (zaten silinmiş olabilir)",
  admin: "Yönetici hesabı",
  self: "Kendi hesabınız",
  not_in_segment: "Artık bu listede değil (yeniden etkinleşmiş)",
  active_order: "Aktif siparişi var (hazırlanıyor / yolda)",
  too_new: "Hesap henüz çok yeni",
  error: "Silme sırasında sunucu hatası",
};
export const skipLabel = (reason) => SKIP_REASONS[reason] || "Bilinmeyen neden";

/** Sıralama seçenekleri (sunucuya sort + dir olarak gider). `never` sekmesinde son görülme anlamsızdır. */
export const SORTS = [
  { value: "lastSeen:asc", label: "En uzun süredir gelmeyen", segments: ["inactive"] },
  { value: "lastSeen:desc", label: "En son gelen", segments: ["inactive"] },
  { value: "created:asc", label: "En eski kayıt" },
  { value: "created:desc", label: "En yeni kayıt" },
  { value: "orders:desc", label: "En çok sipariş", segments: ["inactive"] },
  { value: "spent:desc", label: "En çok harcama", segments: ["inactive"] },
  { value: "name:asc", label: "Ad (A–Z)" },
];
export const DEFAULT_SORT = { inactive: "lastSeen:asc", never: "created:asc" };
/** Başlıktan sıralamada ilk tıklamanın yönü */
export const FIRST_DIR = { lastSeen: "asc", created: "asc", orders: "desc", spent: "desc", name: "asc" };

/**
 * Dağılım anahtarını ay aralığına çevirir: "0-1" → [0, 1], "24+" → [24, ∞], "never" → null.
 * Kesim çizgisinin hangi sütunlar arasına düştüğünü bulmak için kullanılır.
 */
export const bucketRange = (key) => {
  const k = String(key || "");
  if (k === "never") return null;
  const plus = /^(\d+)\+$/.exec(k);
  if (plus) return [Number(plus[1]), Infinity];
  const span = /^(\d+)-(\d+)$/.exec(k);
  if (span) return [Number(span[1]), Number(span[2])];
  return null;
};
/** Sütunun kesime göre konumu: "active" (kesimden yeni), "inactive" (kesimden eski), "split" (kesim içinde), "never" */
export const bucketSide = (key, months) => {
  const range = bucketRange(key);
  if (!range) return "never";
  const [from, to] = range;
  if (to <= months) return "active";
  if (from >= months) return "inactive";
  return "split";
};
/** Eksen için kısa ad: "0-1" → "<1 ay", "12-24" → "1–2 yıl", "24+" → "2+ yıl" */
export const bucketShort = (key, label) => {
  const range = bucketRange(key);
  if (!range) return key === "never" ? "Kayıt yok" : label || key;
  const [from, to] = range;
  const unit = (m) => (m >= 12 && m % 12 === 0 ? `${m / 12}` : `${m}`);
  const yearly = from % 12 === 0 && from >= 12 && (to === Infinity || to % 12 === 0);
  if (to === Infinity) return yearly ? `${unit(from)}+ yıl` : `${from}+ ay`;
  if (from === 0) return `<${to} ay`;
  if (yearly) return `${unit(from)}–${unit(to)} yıl`;
  return `${from}–${to} ay`;
};

/** Content-Disposition'dan dosya adı (filename*=UTF-8''… öncelikli) */
export const filenameFrom = (header, fallback) => {
  const value = String(header || "");
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(value);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* düz ada düş */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(value);
  return plain ? plain[1].trim() : fallback;
};

/** Blob olarak dönen hata yanıtından sunucu mesajını okur */
export const blobErrorMessage = async (error, fallback) => {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      return JSON.parse(text)?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return data?.message || fallback;
};

/** Onay sözcüğü: Türkçe klavyede "SİL"/"sil", başka klavyede "SIL" kabul edilir */
export const isConfirmWord = (value) => {
  const v = String(value || "").trim();
  return v.toLocaleUpperCase("tr-TR") === CONFIRM_WORD || v.toUpperCase() === "SIL";
};

/** Sunucu hata mesajı */
export const errorMessage = (error, fallback) =>
  error?.response?.data?.message || (error?.code === "ERR_NETWORK" ? "Sunucuya ulaşılamadı" : null) || fallback;
