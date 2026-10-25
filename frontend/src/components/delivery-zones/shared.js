// Teslimat bölgeleri ekranının ortak sabitleri ve yardımcıları (biçimlendirme, doğrulama).
// Bölgeler sabittir: girlsDorm, boysDorm (yurt) ve devrek (ilce). Eski mahalle/köy türleri yalnızca okunur.
/* global Intl */
import { Building2, Home, Landmark, Trees } from "lucide-react";
import { fold } from "../admin/ui";

export const TYPES = {
  yurt: { label: "Yurt", plural: "Yurtlar", icon: Building2, tone: "info" },
  ilce: { label: "Devrek merkez", plural: "Devrek merkez", icon: Landmark, tone: "brand" },
  mahalle: { label: "Mahalle", plural: "Mahalleler", icon: Home, tone: "brand" },
  koy: { label: "Köy", plural: "Köyler", icon: Trees, tone: "warn" },
};

// Sabit üç bölge (sunucu da yalnızca bunları döndürür): kart başlığı ve açıklaması
export const FIXED_ZONES = [
  { id: "girlsDorm", title: "Kız KYK Yurdu", note: "Yurt girişinde teslim. Mağaza ayarlarındaki yurt anahtarıyla aynıdır." },
  { id: "boysDorm", title: "Erkek KYK Yurdu", note: "Yurt girişinde teslim. Mağaza ayarlarındaki yurt anahtarıyla aynıdır." },
  { id: "devrek", title: "Genel Devrek", note: "Devrek merkez: haritadaki Devrek sınırı içindeki adreslere teslimat." },
];
export const DEVREK_ID = "devrek";

export const MODES = [
  { value: "off", label: "Kapalı", tone: "neutral" },
  { value: "pilot", label: "Pilot", tone: "warn" },
  { value: "public", label: "Herkese açık", tone: "ok" },
];

export const CLOSE_REASONS = ["Yoğunluk nedeniyle geçici olarak kapalı", "Hava koşulları nedeniyle kapalı", "Yol çalışması nedeniyle kapalı", "Kurye yetersizliği"];
export const ETA_PRESETS = ["20-40 dk", "30-60 dk", "45-90 dk"];

export const LIMITS = { name: 60, closedReason: 120, etaText: 40, maxMoney: 100000 };

const NUM = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
/** 40 → "40 TL", 12.5 → "12,5 TL" */
export const tl = (value) => `${NUM.format(Number(value) || 0)} TL`;
export const num = (value) => NUM.format(Number(value) || 0);

export const isSet = (value) => value !== null && value !== undefined && value !== "";

/** "40", "12,5", " 7.25 " → sayı; boş → null; geçersiz → NaN */
export const parseMoney = (raw) => {
  const text = String(raw ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN;
  return Number(text);
};
/** Sayıyı form alanına yazılacak metne çevirir (12.5 → "12,5") */
export const moneyText = (value) => (isSet(value) && Number.isFinite(Number(value)) ? String(Number(value)).replace(".", ",") : "");

export const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.response?.data?.error || (error?.message === "Network Error" ? "Sunucuya ulaşılamadı" : null) || fallback;

/** Sunucudan gelen bölgeyi tek biçime getirir (eksik alanlara güvenli varsayılan) */
export const normalizeZone = (z = {}) => ({
  ...z,
  _id: String(z._id ?? z.id ?? ""),
  name: String(z.name || ""),
  type: TYPES[z.type] ? z.type : "mahalle",
  enabled: Boolean(z.enabled),
  closedReason: String(z.closedReason || ""),
  deliveryFee: Number(z.deliveryFee) > 0 ? Number(z.deliveryFee) : 0,
  freeDeliveryThreshold: isSet(z.freeDeliveryThreshold) && Number.isFinite(Number(z.freeDeliveryThreshold)) ? Number(z.freeDeliveryThreshold) : null,
  minimumOrderAmount: isSet(z.minimumOrderAmount) && Number.isFinite(Number(z.minimumOrderAmount)) ? Number(z.minimumOrderAmount) : null,
  etaText: String(z.etaText || ""),
  requireFirstOrderCallback: Boolean(z.requireFirstOrderCallback ?? z.requiresFirstOrderCallback),
  sortOrder: Number.isFinite(Number(z.sortOrder)) ? Number(z.sortOrder) : 0,
  ordersThisMonth: Number(z.ordersThisMonth) || 0,
  ordersTotal: Number(z.ordersTotal) || 0,
  area: z.area && z.area.osmType ? z.area : null,
  areaCandidates: Array.isArray(z.areaCandidates) ? z.areaCandidates : [],
});

/** Müşterinin göreceği kısa özet: "40 TL · 300 TL üstü ücretsiz" */
export const feeSummary = (zone, campaign) => {
  if (campaign || zone.deliveryFee === 0) return "Ücretsiz teslimat";
  return zone.freeDeliveryThreshold != null
    ? `${tl(zone.deliveryFee)} · ${tl(zone.freeDeliveryThreshold)} üstü ücretsiz`
    : tl(zone.deliveryFee);
};

// ── Form ──────────────────────────────────────────────────────────────────
export const sameForm = (a, b) => Object.keys(a).every((k) => String(a[k]) === String(b[k]));

/** Formu doğrular; { errors, payload } döner. payload sunucuya gidecek gövdedir. */
export const validateForm = (form, { zones = [], editingId = null, isYurt = false } = {}) => {
  const errors = {};
  const name = form.name.trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Bölge adını yazın.";
  else if (name.length > LIMITS.name) errors.name = `En fazla ${LIMITS.name} karakter.`;
  else if (zones.some((z) => z._id !== editingId && fold(z.name) === fold(name))) errors.name = "Bu adda bir bölge zaten var.";

  const closedReason = form.closedReason.trim();
  if (!form.enabled && closedReason.length > LIMITS.closedReason) errors.closedReason = `En fazla ${LIMITS.closedReason} karakter.`;

  let deliveryFee = 0;
  let freeDeliveryThreshold = null;
  if (form.feeMode === "paid") {
    const fee = parseMoney(form.fee);
    if (fee === null) errors.fee = "Ücreti TL olarak yazın ya da “Ücretsiz”i seçin.";
    else if (Number.isNaN(fee)) errors.fee = "Geçerli bir tutar yazın (ör. 40 ya da 12,5).";
    else if (fee <= 0) errors.fee = "Ücret 0'dan büyük olmalı; ücretsiz için “Ücretsiz”i seçin.";
    else if (fee > 1000) errors.fee = "Teslimat ücreti en fazla 1.000 TL olabilir.";
    else deliveryFee = fee;

    const threshold = parseMoney(form.threshold);
    if (Number.isNaN(threshold)) errors.threshold = "Geçerli bir tutar yazın ya da boş bırakın.";
    else if (threshold !== null && threshold <= 0) errors.threshold = "Eşik 0'dan büyük olmalı; eşik istemiyorsanız boş bırakın.";
    else if (threshold !== null && threshold > LIMITS.maxMoney) errors.threshold = "Çok büyük bir tutar.";
    else freeDeliveryThreshold = threshold;
  }

  const minimum = parseMoney(form.minimum);
  if (Number.isNaN(minimum)) errors.minimum = "Geçerli bir tutar yazın ya da boş bırakın (genel minimum).";
  else if (minimum !== null && minimum > LIMITS.maxMoney) errors.minimum = "Çok büyük bir tutar.";

  const etaText = form.etaText.trim();
  if (etaText.length > LIMITS.etaText) errors.etaText = `En fazla ${LIMITS.etaText} karakter.`;

  const sortText = String(form.sortOrder).trim();
  const sortOrder = sortText === "" ? 0 : Number(sortText);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) errors.sortOrder = "0 ile 9999 arasında tam sayı yazın.";

  const payload = {
    name,
    enabled: Boolean(form.enabled),
    closedReason: form.enabled ? "" : closedReason,
    deliveryFee,
    freeDeliveryThreshold,
    minimumOrderAmount: Number.isNaN(minimum) ? null : minimum,
    etaText,
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
    requireFirstOrderCallback: Boolean(form.callback),
  };
  if (!isYurt) payload.type = form.type;
  return { errors, payload };
};

// ── Sabit bölge kartı formu (ad, tür ve sıra değişmez) ────────────────────
export const cardFormFromZone = (z) => ({
  enabled: Boolean(z.enabled),
  closedReason: z.closedReason || "",
  feeMode: z.deliveryFee > 0 ? "paid" : "free",
  fee: z.deliveryFee > 0 ? moneyText(z.deliveryFee) : "",
  threshold: moneyText(z.freeDeliveryThreshold),
  minimum: moneyText(z.minimumOrderAmount),
  etaText: z.etaText || "",
  callback: Boolean(z.requireFirstOrderCallback),
});

/** Kart formunu doğrular; { errors, payload } döner (payload: PUT /delivery/admin/zones/:id gövdesi). */
export const validateCardForm = (form) => {
  const { errors, payload } = validateForm({ ...form, name: "x", sortOrder: "0", type: "yurt" }, { isYurt: true });
  delete errors.name;
  delete errors.sortOrder;
  const rest = { ...payload };
  delete rest.name;
  delete rest.sortOrder;
  return { errors, payload: rest };
};

/** OpenStreetMap'te nesne bağlantısı: https://www.openstreetmap.org/relation/123 */
export const osmLink = (osmType, osmId) => (osmType && osmId ? `https://www.openstreetmap.org/${osmType}/${osmId}` : null);
/** 5.6 → "~5,6 km²" */
export const km2 = (value) => (Number.isFinite(Number(value)) && value !== null ? `~${NUM.format(Number(value))} km²` : "Alan bilinmiyor");
