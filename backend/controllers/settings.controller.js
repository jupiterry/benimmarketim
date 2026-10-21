import Settings, { DEFAULT_AI_MODEL } from "../models/settings.model.js";
import { refreshOrderHoursCache } from "./cart.controller.js";
import { diffFields, money, recordAdminAction, yesNo } from "../services/adminAudit.service.js";

const AI_PROVIDERS = ["groq", "openrouter", "gemini"];
const AI_PROVIDER_LABEL = { groq: "Groq", openrouter: "OpenRouter", gemini: "Gemini" };
const DELIVERY_POINTS = [
  ["girlsDorm", "Kız KYK Yurdu"],
  ["boysDorm", "Erkek KYK Yurdu"],
];

/** IBAN'ı boşluksuz ve büyük harfle saklar: "tr12 3456 ..." → "TR123456..." */
export const normalizeIban = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const clock = (hour, minute) => `${String(hour ?? 0).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
const onOff = (value) => yesNo(value, "Açık", "Kapalı");
const plain = (doc) => (typeof doc?.toObject === "function" ? doc.toObject() : JSON.parse(JSON.stringify(doc || {})));

/**
 * İşlem kaydı için ayarları düz bir "alan → okunur değer" tablosuna indirger.
 * Saatler "10:00" biçiminde, tutar ₺ ile, anahtarlar Açık/Kapalı olarak yazılır.
 */
export const flattenSettings = (settings = {}) => {
  const flat = {
    orderStart: clock(settings.orderStartHour, settings.orderStartMinute),
    orderEnd: clock(settings.orderEndHour, settings.orderEndMinute),
    minimumOrderAmount: settings.minimumOrderAmount,
    latestVersion: settings.appVersion?.latestVersion,
    minimumVersion: settings.appVersion?.minimumVersion,
    forceUpdate: settings.appVersion?.forceUpdate,
    androidStoreUrl: settings.appVersion?.androidStoreUrl,
    iosStoreUrl: settings.appVersion?.iosStoreUrl,
    aiEnabled: settings.ai?.enabled,
    aiProvider: settings.ai?.provider,
    aiModel: settings.ai?.model,
    aiMaxHistoryMessages: settings.ai?.maxHistoryMessages,
    bankName: settings.bankTransfer?.bankName,
    bankAccountName: settings.bankTransfer?.accountName,
    bankIban: settings.bankTransfer?.iban,
  };
  for (const [key] of DELIVERY_POINTS) {
    const point = settings.deliveryPoints?.[key] || {};
    flat[`${key}Name`] = point.name;
    flat[`${key}Enabled`] = point.enabled;
    flat[`${key}Hours`] = `${clock(point.startHour, point.startMinute)}–${clock(point.endHour, point.endMinute)}`;
  }
  return flat;
};

/** İşlem kaydında görünen okunur alan etiketleri (sıra, kayıttaki sırayı belirler). */
export const SETTINGS_AUDIT_FIELDS = [
  { key: "orderStart", label: "Sipariş başlangıç saati" },
  { key: "orderEnd", label: "Sipariş bitiş saati" },
  { key: "minimumOrderAmount", label: "Minimum sipariş tutarı", format: money },
  { key: "bankName", label: "Havale/EFT banka adı" },
  { key: "bankAccountName", label: "Havale/EFT hesap sahibi" },
  { key: "bankIban", label: "Havale/EFT IBAN" },
  ...DELIVERY_POINTS.flatMap(([key, label]) => [
    { key: `${key}Enabled`, label: `${label} teslimatı`, format: onOff },
    { key: `${key}Name`, label: `${label} adı` },
    { key: `${key}Hours`, label: `${label} saatleri` },
  ]),
  { key: "latestVersion", label: "Uygulama son sürümü" },
  { key: "minimumVersion", label: "Uygulama minimum sürümü" },
  { key: "forceUpdate", label: "Zorunlu güncelleme", format: onOff },
  { key: "androidStoreUrl", label: "Google Play bağlantısı" },
  { key: "iosStoreUrl", label: "App Store bağlantısı" },
  { key: "aiEnabled", label: "Yapay zekâ asistanı", format: onOff },
  { key: "aiProvider", label: "Yapay zekâ sağlayıcısı", format: (v) => AI_PROVIDER_LABEL[v] || v },
  { key: "aiModel", label: "Yapay zekâ modeli" },
  { key: "aiMaxHistoryMessages", label: "Yapay zekâ geçmiş sınırı", format: (v) => (v === undefined || v === null ? v : `${v} mesaj`) },
];

/** İki ayar belgesi arasındaki farkları "etiket: eski → yeni" listesine çevirir. */
export const describeSettingsChanges = (before, after) => diffFields(flattenSettings(before), flattenSettings(after), SETTINGS_AUDIT_FIELDS);

/** Gönderilen alanları doğrular; ilk hatanın mesajını döndürür (hata yoksa null). */
export const validateSettingsInput = (body = {}) => {
  const { orderStartHour, orderStartMinute, orderEndHour, orderEndMinute, minimumOrderAmount, deliveryPoints, appVersion, ai, bankTransfer } = body;
  const checks = [
    [orderStartHour, 0, 23, "Sipariş başlangıç saati 0–23 arasında olmalı"],
    [orderStartMinute, 0, 59, "Sipariş başlangıç dakikası 0–59 arasında olmalı"],
    [orderEndHour, 0, 23, "Sipariş bitiş saati 0–23 arasında olmalı"],
    [orderEndMinute, 0, 59, "Sipariş bitiş dakikası 0–59 arasında olmalı"],
  ];
  for (const [value, min, max, message] of checks) if (value !== undefined && !isInt(value, min, max)) return message;
  if (minimumOrderAmount !== undefined && !(Number.isFinite(minimumOrderAmount) && minimumOrderAmount >= 0)) return "Minimum sipariş tutarı 0 ya da daha büyük bir sayı olmalı";
  if (deliveryPoints !== undefined) {
    if (!deliveryPoints || typeof deliveryPoints !== "object" || Array.isArray(deliveryPoints)) return "Geçersiz teslimat noktası ayarları";
    for (const [key, label] of DELIVERY_POINTS) {
      const point = deliveryPoints[key];
      if (point === undefined) continue;
      if (!point || typeof point !== "object") return `${label} ayarı geçersiz`;
      if (point.name !== undefined && !String(point.name).trim()) return `${label} adı boş olamaz`;
      for (const [field, max] of [["startHour", 23], ["startMinute", 59], ["endHour", 23], ["endMinute", 59]]) {
        if (point[field] !== undefined && !isInt(point[field], 0, max)) return `${label} saatleri geçersiz`;
      }
    }
  }
  if (bankTransfer !== undefined) {
    if (!bankTransfer || typeof bankTransfer !== "object" || Array.isArray(bankTransfer)) return "Geçersiz havale/EFT bilgileri";
    for (const field of ["bankName", "accountName", "iban"]) {
      if (bankTransfer[field] !== undefined && typeof bankTransfer[field] !== "string") return "Havale/EFT bilgileri metin olmalı";
    }
    if (bankTransfer.iban) {
      const iban = normalizeIban(bankTransfer.iban);
      if (!/^TR\d{24}$/.test(iban)) return "IBAN TR ile başlamalı ve 26 karakter olmalı (ör. TR00 0000 0000 0000 0000 0000 00)";
    }
  }
  if (appVersion !== undefined && (!appVersion || typeof appVersion !== "object" || Array.isArray(appVersion))) return "Geçersiz uygulama versiyon ayarları";
  if (ai !== undefined) {
    if (!ai || typeof ai !== "object" || Array.isArray(ai)) return "Geçersiz yapay zekâ ayarları";
    if (ai.provider !== undefined && !AI_PROVIDERS.includes(ai.provider)) return "Yapay zekâ sağlayıcısı groq, openrouter ya da gemini olmalı";
    if (ai.model !== undefined && !String(ai.model).trim()) return "Yapay zekâ model adı boş olamaz";
    if (ai.maxHistoryMessages !== undefined && !isInt(Number(ai.maxHistoryMessages), 2, 30)) return "Yapay zekâ geçmiş sınırı 2–30 arasında olmalı";
  }
  return null;
};

// Tüm ayarları getir
export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.status(200).json(settings);
  } catch (error) {
    console.error("Ayarlar getirilirken hata oluştu:", error);
    res.status(500).json({ message: "Ayarlar getirilirken hata oluştu", error: error.message });
  }
};

// Ayarları güncelle (yalnızca gönderilen alanlar değişir; her değişiklik işlem kaydına yazılır)
export const updateSettings = async (req, res) => {
  try {
    const { orderStartHour, orderStartMinute, orderEndHour, orderEndMinute, minimumOrderAmount, deliveryPoints, appVersion, ai, bankTransfer } = req.body || {};

    const invalid = validateSettingsInput(req.body || {});
    if (invalid) return res.status(400).json({ message: invalid });

    const settings = await Settings.getSettings();
    const before = plain(settings);

    if (appVersion !== undefined) {
      for (const field of ["latestVersion", "minimumVersion", "forceUpdate", "androidStoreUrl", "iosStoreUrl"]) {
        if (appVersion[field] !== undefined) settings.appVersion[field] = appVersion[field];
      }
    }

    if (ai !== undefined) {
      if (!settings.ai) settings.ai = {};
      if (ai.enabled !== undefined) settings.ai.enabled = ai.enabled !== false;
      if (ai.provider !== undefined) settings.ai.provider = ai.provider;
      if (ai.model !== undefined) settings.ai.model = String(ai.model).trim() || DEFAULT_AI_MODEL;
      if (ai.maxHistoryMessages !== undefined) settings.ai.maxHistoryMessages = Math.max(2, Math.min(Number(ai.maxHistoryMessages), 30));
    }

    if (bankTransfer !== undefined) {
      if (!settings.bankTransfer) settings.bankTransfer = {};
      if (bankTransfer.bankName !== undefined) settings.bankTransfer.bankName = bankTransfer.bankName.trim();
      if (bankTransfer.accountName !== undefined) settings.bankTransfer.accountName = bankTransfer.accountName.trim();
      if (bankTransfer.iban !== undefined) settings.bankTransfer.iban = normalizeIban(bankTransfer.iban);
    }

    // Sadece gönderilen alanları güncelle
    if (orderStartHour !== undefined) settings.orderStartHour = orderStartHour;
    if (orderStartMinute !== undefined) settings.orderStartMinute = orderStartMinute;
    if (orderEndHour !== undefined) settings.orderEndHour = orderEndHour;
    if (orderEndMinute !== undefined) settings.orderEndMinute = orderEndMinute;
    if (minimumOrderAmount !== undefined) settings.minimumOrderAmount = minimumOrderAmount;
    if (deliveryPoints !== undefined) {
      // Nokta bazında birleştir: gönderilmeyen nokta ya da alan olduğu gibi kalır
      const merged = plain(settings.deliveryPoints || {});
      for (const [key] of DELIVERY_POINTS) {
        if (deliveryPoints[key] !== undefined) merged[key] = { ...(merged[key] || {}), ...deliveryPoints[key] };
      }
      settings.deliveryPoints = merged;
    }

    await settings.save();

    // Sipariş saatleri değiştiyse önbelleği hemen temizle
    await refreshOrderHoursCache();

    // İşlem kaydı: hangi ayar neyden neye değişti
    const changes = describeSettingsChanges(before, plain(settings));
    if (changes.length) {
      recordAdminAction(req, {
        action: changes.length === 1 ? `Ayar değiştirildi: ${changes[0].label}` : `${changes.length} mağaza ayarı değiştirildi`,
        category: "settings",
        target: "settings",
        targetName: "Mağaza ayarları",
        changes,
      });
    } else if (req) {
      // Hiçbir alan değişmediyse rota bazlı "Ayar değişikliği" kaydı da yazılmasın
      req.auditRecorded = true;
    }

    res.status(200).json({ message: "Ayarlar başarıyla güncellendi", settings, changes });
  } catch (error) {
    console.error("Ayarlar güncellenirken hata oluştu:", error);
    res.status(500).json({ message: "Ayarlar güncellenirken hata oluştu", error: error.message });
  }
};
