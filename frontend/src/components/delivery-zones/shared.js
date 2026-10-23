// Teslimat bölgeleri ekranının ortak sabitleri ve yardımcıları (biçimlendirme, doğrulama, sıralama).
/* global Intl */
import { Building2, Home, Trees } from "lucide-react";
import { fold } from "../admin/ui";

export const TYPES = {
  yurt: { label: "Yurt", plural: "Yurtlar", icon: Building2, tone: "info" },
  mahalle: { label: "Mahalle", plural: "Mahalleler", icon: Home, tone: "brand" },
  koy: { label: "Köy", plural: "Köyler", icon: Trees, tone: "warn" },
};
export const TYPE_ORDER = ["yurt", "mahalle", "koy"];

export const MODES = [
  { value: "off", label: "Kapalı", tone: "neutral" },
  { value: "pilot", label: "Pilot", tone: "warn" },
  { value: "public", label: "Herkese açık", tone: "ok" },
];

export const CLOSE_REASONS = ["Yoğunluk nedeniyle geçici olarak kapalı", "Hava koşulları nedeniyle kapalı", "Yol çalışması nedeniyle kapalı", "Kurye yetersizliği"];
export const ETA_PRESETS = ["20-40 dk", "30-60 dk", "45-90 dk"];

export const LIMITS = { name: 60, closedReason: 120, etaText: 40, maxMoney: 100000 };

export const SORTS = [
  { value: "sortOrder", label: "Liste sırası", dir: "asc" },
  { value: "name", label: "Ad (A→Z)", dir: "asc" },
  { value: "orders", label: "Bu ay en çok sipariş", dir: "desc" },
  { value: "fee", label: "Ücret (yüksekten)", dir: "desc" },
];
export const FIRST_DIR = { sortOrder: "asc", name: "asc", orders: "desc", fee: "desc", minimum: "desc" };

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
  sortOrder: Number.isFinite(Number(z.sortOrder)) ? Number(z.sortOrder) : 0,
  ordersThisMonth: Number(z.ordersThisMonth) || 0,
  ordersTotal: Number(z.ordersTotal) || 0,
});

/** Silinebilir mi: yurt değil ve hiç siparişi yok */
export const deleteBlock = (zone) => {
  if (zone.type === "yurt") return "Yurt bölgeleri silinemez; kapatabilirsiniz.";
  if (zone.ordersTotal > 0) return `${num(zone.ordersTotal)} siparişi olduğu için silinemez; kapatabilirsiniz.`;
  return null;
};

/** Müşterinin göreceği kısa özet: "40 TL · 300 TL üstü ücretsiz" */
export const feeSummary = (zone, campaign) => {
  if (campaign || zone.deliveryFee === 0) return "Ücretsiz teslimat";
  return zone.freeDeliveryThreshold != null
    ? `${tl(zone.deliveryFee)} · ${tl(zone.freeDeliveryThreshold)} üstü ücretsiz`
    : tl(zone.deliveryFee);
};

export const matchesQuery = (zone, q) => {
  if (!q) return true;
  return fold(`${zone.name} ${TYPES[zone.type]?.label} ${zone.etaText} ${zone.closedReason} ${zone._id}`).includes(q);
};

const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
export const sortZones = (list, key, dir) => {
  const m = dir === "asc" ? 1 : -1;
  const by = {
    sortOrder: (a, b) => a.sortOrder - b.sortOrder || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || collator.compare(a.name, b.name),
    name: (a, b) => collator.compare(a.name, b.name),
    orders: (a, b) => a.ordersThisMonth - b.ordersThisMonth || collator.compare(b.name, a.name),
    fee: (a, b) => a.deliveryFee - b.deliveryFee || (a.freeDeliveryThreshold ?? Infinity) - (b.freeDeliveryThreshold ?? Infinity),
    minimum: (a, b) => (a.minimumOrderAmount ?? -1) - (b.minimumOrderAmount ?? -1),
  }[key] || (() => 0);
  return [...list].sort((a, b) => by(a, b) * m);
};

// ── Form ──────────────────────────────────────────────────────────────────
export const emptyForm = (nextSort = 0) => ({
  name: "", type: "mahalle", enabled: false, closedReason: "",
  feeMode: "free", fee: "", threshold: "", minimum: "", etaText: "", sortOrder: String(nextSort),
});
export const formFromZone = (z) => ({
  name: z.name, type: z.type, enabled: z.enabled, closedReason: z.closedReason,
  feeMode: z.deliveryFee > 0 ? "paid" : "free", fee: z.deliveryFee > 0 ? moneyText(z.deliveryFee) : "",
  threshold: moneyText(z.freeDeliveryThreshold), minimum: moneyText(z.minimumOrderAmount),
  etaText: z.etaText, sortOrder: String(z.sortOrder),
});
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
  };
  if (!isYurt) payload.type = form.type;
  return { errors, payload };
};
