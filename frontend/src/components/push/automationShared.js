// Otomatik bildirimler paneli için ortak sabitler ve yardımcılar.
// Sunucudaki kurallar (backend/services/notificationAutomation.service.js) esastır; buradaki kontroller
// yalnızca yöneticiye kaydetmeden önce anında geri bildirim vermek içindir.
import { CalendarClock, HeartHandshake, Store, Ticket } from "lucide-react";

export const TYPES = ["secondOrder", "winBack", "couponExpiry", "closedCart"];
export const TITLE_LIMIT = 60;
export const BODY_LIMIT = 180;

export const INFO = {
  secondOrder: {
    icon: CalendarClock,
    label: "İkinci sipariş teşviki",
    who: "İlk siparişi teslim edilen ve henüz ikinci siparişini vermeyen müşteriye bir kez gider.",
    target: "Ana sayfa",
  },
  winBack: {
    icon: HeartHandshake,
    label: "Geri kazanma",
    who: "Son siparişinin üzerinden belirli bir süre geçen ve o günden beri sipariş vermeyen müşteriye gider.",
    target: "Ana sayfa",
  },
  couponExpiry: {
    icon: Ticket,
    label: "Kuponunun süresi doluyor",
    who: "Kişiye özel tanımlanmış, henüz kullanılmamış kuponu bitmek üzere olan müşteriye kupon başına bir kez gider.",
    target: "Sepet",
  },
  closedCart: {
    icon: Store,
    label: "Açıldık, sepetin hazır",
    who: "Mağaza kapalıyken sepet kuran müşteriye, mağaza açıldıktan kısa süre sonra bir kez gider. Bu sepet için ayrıca sepet hatırlatması gitmez.",
    target: "Sepet",
  },
};

// Zamanlama alanları: [alan, etiket, birim, en az, en çok, ipucu]
export const TIMING = {
  secondOrder: [
    { key: "afterDays", label: "Teslimattan kaç gün sonra", unit: "gün", min: 1, max: 60 },
    { key: "maxDays", label: "En geç", unit: "gün", min: 2, max: 365, hint: "Daha eski tek siparişliler geri kazanmaya kalır." },
  ],
  winBack: [
    { key: "afterDays", label: "Kaç gündür sipariş yoksa", unit: "gün", min: 7, max: 365 },
    { key: "maxDays", label: "En fazla kaç gündür yoksa", unit: "gün", min: 8, max: 730, hint: "Çok uzun süredir gelmeyenler rahatsız edilmez." },
    { key: "cooldownDays", label: "İki bildirim arası", unit: "gün", min: 7, max: 180 },
    { key: "maxSends", label: "Her sessiz dönemde en fazla", unit: "bildirim", min: 1, max: 5, hint: "Müşteri yeniden sipariş verince sayaç sıfırlanır." },
  ],
  couponExpiry: [
    { key: "hoursBefore", label: "Bitmesine kaç saat kala", unit: "saat", min: 2, max: 72 },
  ],
  closedCart: [
    { key: "delayMinutes", label: "Açılıştan kaç dakika sonra", unit: "dk", min: 0, max: 120, hint: "Kontrol 10 dakikada bir yapılır." },
    { key: "windowMinutes", label: "En geç (açılıştan sonra)", unit: "dk", min: 30, max: 360 },
  ],
};

export const PLACEHOLDER_HINTS = {
  secondOrder: { ad: "Müşterinin adı", kupon: "Kupon kodu", indirim: "İndirim (%10 / 50 TL)", gun: "Kupon kaç gün geçerli" },
  winBack: { ad: "Müşterinin adı", kupon: "Kupon kodu", indirim: "İndirim (%10 / 50 TL)", gun: "Kupon kaç gün geçerli" },
  couponExpiry: { ad: "Müşterinin adı", kupon: "Kupon kodu", indirim: "Kuponun indirimi", saat: "Kalan saat" },
  closedCart: { ad: "Müşterinin adı", adet: "Sepetteki ürün adedi", urun: "Sepetteki ilk ürünler" },
};
export const COUPON_ONLY = new Set(["kupon", "indirim", "gun"]);
export const COUPON_SUFFIX = " Sana özel {indirim} indirim kuponun: {kupon} ({gun} gün geçerli).";

export const discountText = (type, value) => {
  const amount = Number(value) || 0;
  return type === "fixed" ? `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL` : `%${amount}`;
};

/** Sunucudaki renderTemplate ile aynı: alanları doldurur, boş kalanın izlerini temizler. */
export const renderTemplate = (text, vars = {}) => {
  let emptied = false;
  let out = String(text || "").replace(/\{([^{}\s]+)\}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") {
      emptied = true;
      return "";
    }
    return String(value);
  });
  if (emptied) out = out.replace(/\s+([,.!?])/g, "$1").replace(/,([!?.])/g, "$1").replace(/^[\s,]+/, "");
  return out.replace(/\s{2,}/g, " ").trim();
};

/** Canlı önizleme için örnek değerler */
export const sampleVars = (type, draft) => {
  const vars = { ad: "Ayşe" };
  if (draft?.coupon?.enabled) Object.assign(vars, { kupon: type === "winBack" ? "DONUS7F3A2C" : "IKINCI4B9E1D", indirim: discountText(draft.coupon.type, draft.coupon.value), gun: draft.coupon.validDays });
  if (type === "couponExpiry") Object.assign(vars, { kupon: "KAMPUS15", indirim: "%15", saat: Math.min(Number(draft?.hoursBefore) || 24, 12) });
  if (type === "closedCart") Object.assign(vars, { adet: 3, urun: "Süt, Ekmek ve 1 ürün daha" });
  return vars;
};

export const placeholdersIn = (text) => [...String(text || "").matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]);

/** Kaydetmeden önce gösterilen hatalar: { alan: mesaj } */
export const validateDraft = (type, draft) => {
  const errors = {};
  const title = String(draft?.title || "").trim();
  const body = String(draft?.body || "").trim();
  if (!title) errors.title = "Başlık yazın";
  else if (title.length > TITLE_LIMIT) errors.title = `En fazla ${TITLE_LIMIT} karakter`;
  if (!body) errors.body = "Mesaj yazın";
  else if (body.length > BODY_LIMIT) errors.body = `En fazla ${BODY_LIMIT} karakter`;
  const allowed = PLACEHOLDER_HINTS[type];
  const used = [...placeholdersIn(title), ...placeholdersIn(body)];
  const unknown = used.find((key) => !allowed[key]);
  if (unknown) errors.text = `{${unknown}} bu bildirimde kullanılamaz`;
  else if (draft?.coupon && !draft.coupon.enabled && used.some((key) => COUPON_ONLY.has(key))) {
    errors.text = "Metinde kupon alanı var; kuponu açın ya da alanı metinden çıkarın";
  }
  for (const field of TIMING[type]) {
    const value = Number(draft?.[field.key]);
    if (!Number.isInteger(value) || value < field.min || value > field.max) errors[field.key] = `${field.min}–${field.max} arası`;
  }
  if (draft?.maxDays !== undefined && Number(draft.maxDays) <= Number(draft.afterDays) && !errors.maxDays) errors.maxDays = "İlk değerden büyük olmalı";
  if (draft?.coupon?.enabled) {
    const c = draft.coupon;
    const [min, max] = c.type === "fixed" ? [1, 1000] : [1, 50];
    const value = Number(c.value);
    if (!Number.isFinite(value) || value < min || value > max || (c.type !== "fixed" && !Number.isInteger(value))) errors.couponValue = c.type === "fixed" ? "1–1000 TL" : "%1–%50";
    if (!Number.isInteger(Number(c.validDays)) || Number(c.validDays) < 1 || Number(c.validDays) > 60) errors.couponDays = "1–60 gün";
    if (!Number.isFinite(Number(c.minOrderAmount)) || Number(c.minOrderAmount) < 0 || Number(c.minOrderAmount) > 10000) errors.couponMin = "0–10.000 TL";
  }
  return errors;
};

// Sunucuya gönderilecek biçim (sayılar sayıya çevrilir)
export const toPayload = (type, draft) => {
  const out = { title: String(draft.title || "").trim(), body: String(draft.body || "").trim() };
  for (const field of TIMING[type]) out[field.key] = Number(draft[field.key]);
  if (draft.coupon) {
    out.coupon = {
      enabled: Boolean(draft.coupon.enabled),
      type: draft.coupon.type === "fixed" ? "fixed" : "percentage",
      value: Number(draft.coupon.value),
      validDays: Number(draft.coupon.validDays),
      minOrderAmount: Number(draft.coupon.minOrderAmount),
    };
  }
  return out;
};

export const sameDraft = (type, a, b) => JSON.stringify(toPayload(type, a)) === JSON.stringify(toPayload(type, b));

export const SKIP_LABELS = {
  disabled: "Tüm otomasyonlar kapalı",
  quiet_hours: "Gönderim saatleri dışında",
  not_configured: "Bildirim servisi yapılandırılmamış",
};
