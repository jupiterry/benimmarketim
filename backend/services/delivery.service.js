/**
 * delivery.service.js
 *
 * Teslimat bölgeleri, ücret kuralı ve adrese sipariş izni için tek kaynak.
 *
 * - computeDeliveryQuote: ücret kuralı (kampanya → bölge ücretsiz → eşik → bölge ücreti) ve minimum sepet.
 * - Yurt bölgeleri (legacyPoint dolu) settings.deliveryPoints ile eşlenir: açık/kapalı ve ad için
 *   kaynak ayarlardır (mevcut uygulama oradan okur). Okurken ayar değerleri bölgeye bindirilir
 *   (overlayLegacyZone); panelden yurt bölgesi değişince ayarlara yazılır (syncSettingsFromZones);
 *   ayarlar değişince bölge belgesi de güncellenir (syncYurtZonesFromSettings).
 * - canOrderToAddress: settings.delivery.addressOrdering 'off' → hayır, 'pilot' → pilotUserIds'te mi,
 *   'public' → evet.
 */

import mongoose from "mongoose";
import DeliveryZone, { LEGACY_POINTS, ZONE_TYPES } from "../models/deliveryZone.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";

export { LEGACY_POINTS, ZONE_TYPES };
export const ADDRESS_ORDERING_MODES = ["off", "pilot", "public"];
export const DEVREK_CITY = "Devrek";
const LEGACY_DEFAULT_NAMES = { girlsDorm: "Kız KYK Yurdu", boysDorm: "Erkek KYK Yurdu" };
const DEFAULT_MINIMUM = 250; // settings.minimumOrderAmount şema varsayılanı

export const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const isNum = (value) => typeof value === "number" && Number.isFinite(value);
const plain = (doc) => (doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {});

// ─────────────────────────────────────────────
// Ücret kuralı
// ─────────────────────────────────────────────

/**
 * Bölgenin minimum sepeti: zone.minimumOrderAmount ?? settings.minimumOrderAmount (0 = minimum yok).
 * `||` değil `??`: panelde 0 yazılırsa minimum uygulanmaz.
 */
export const resolveMinimumOrderAmount = (zone, settings) => {
  const zoneMinimum = zone?.minimumOrderAmount;
  if (zoneMinimum !== null && zoneMinimum !== undefined && Number.isFinite(Number(zoneMinimum))) return Number(zoneMinimum);
  const general = settings?.minimumOrderAmount;
  return general !== null && general !== undefined && Number.isFinite(Number(general)) ? Number(general) : DEFAULT_MINIMUM;
};

/**
 * Teslimat ücreti ve minimum sepet hesabı (tek fonksiyon).
 * @param {{ zone: object, subtotal: number, settings: object }} input
 *   subtotal = kupon öncesi ürün tutarı (minimum kontrolüyle aynı taban)
 * @returns {{ zoneId, zoneName, subtotal, deliveryFee, isFree, freeReason, remainingForFree,
 *   minimumOrderAmount, meetsMinimum, total }}
 */
export const computeDeliveryQuote = ({ zone, subtotal, settings }) => {
  const amount = roundMoney(Math.max(0, Number(subtotal) || 0));
  const zoneFee = Math.max(0, Number(zone?.deliveryFee) || 0);
  const rawThreshold = zone?.freeDeliveryThreshold;
  const threshold = rawThreshold !== null && rawThreshold !== undefined && Number.isFinite(Number(rawThreshold)) ? Number(rawThreshold) : null;

  let deliveryFee = zoneFee;
  let freeReason = null;
  if (settings?.delivery?.freeDeliveryEverywhere === true) {
    deliveryFee = 0;
    freeReason = "campaign";
  } else if (zoneFee === 0) {
    deliveryFee = 0;
    freeReason = "zone";
  } else if (threshold !== null && amount >= threshold) {
    deliveryFee = 0;
    freeReason = "threshold";
  }
  deliveryFee = roundMoney(deliveryFee);

  const minimumOrderAmount = resolveMinimumOrderAmount(zone, settings);
  return {
    zoneId: zone?._id ?? zone?.id ?? null,
    zoneName: zone?.name ?? "",
    subtotal: amount,
    deliveryFee,
    isFree: deliveryFee === 0,
    freeReason,
    remainingForFree: threshold !== null && deliveryFee > 0 ? roundMoney(threshold - amount) : null,
    minimumOrderAmount,
    meetsMinimum: minimumOrderAmount <= 0 || amount >= minimumOrderAmount,
    total: roundMoney(amount + deliveryFee),
  };
};

// ─────────────────────────────────────────────
// Adrese sipariş izni (bayrak)
// ─────────────────────────────────────────────

export const getAddressOrderingMode = (settings) => {
  const mode = settings?.delivery?.addressOrdering;
  return ADDRESS_ORDERING_MODES.includes(mode) ? mode : "off";
};

export const canOrderToAddress = (settings, userId) => {
  const mode = getAddressOrderingMode(settings);
  if (mode === "public") return true;
  if (mode === "pilot" && userId) {
    return (settings?.delivery?.pilotUserIds || []).some((id) => String(id) === String(userId));
  }
  return false;
};

// ─────────────────────────────────────────────
// Yurt bölgeleri: tohumlama ve ayarlarla eşleme
// ─────────────────────────────────────────────

const legacyPointOf = (settings, key) => {
  const points = plain(settings?.deliveryPoints);
  return points?.[key] || null;
};

/** Yurt bölgesinin açık/kapalı ve adını ayarlardan alır (mevcut uygulamayla aynı kaynak). */
export const overlayLegacyZone = (zone, settings) => {
  if (!zone?.legacyPoint) return zone;
  const point = legacyPointOf(settings, zone.legacyPoint);
  if (!point) return zone;
  return {
    ...zone,
    enabled: point.enabled === undefined ? zone.enabled : Boolean(point.enabled),
    name: typeof point.name === "string" && point.name.trim() ? point.name.trim().slice(0, 60) : zone.name,
  };
};

let seedPromise = null;

/**
 * Yurt bölgelerini (girlsDorm, boysDorm) yoksa oluşturur. Idempotent ($setOnInsert); süreç başına bir
 * kez çalışır, başarısız olursa bir sonraki çağrıda yeniden denenir.
 */
export const ensureYurtZones = async (settingsArg) => {
  if (!seedPromise) {
    seedPromise = (async () => {
      const settings = settingsArg || (await Settings.getSettings());
      await Promise.all(
        LEGACY_POINTS.map((key, index) => {
          const point = legacyPointOf(settings, key) || {};
          return DeliveryZone.updateOne(
            { _id: key },
            {
              $setOnInsert: {
                name: (typeof point.name === "string" && point.name.trim()) || LEGACY_DEFAULT_NAMES[key],
                type: "yurt",
                enabled: point.enabled === undefined ? true : Boolean(point.enabled),
                closedReason: "",
                deliveryFee: 0,
                freeDeliveryThreshold: null,
                minimumOrderAmount: null,
                etaText: "",
                sortOrder: index,
                legacyPoint: key,
              },
            },
            { upsert: true }
          );
        })
      );
      return true;
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
};

/** Testler için: tohumlama durumunu sıfırlar. */
export const resetYurtSeedState = () => {
  seedPromise = null;
};

/**
 * Ayarlar (SettingsTab) değişince yurt bölge belgelerini aynı değere çeker. En iyi çaba: okuma
 * tarafı zaten ayarları bindirir; hata yanıtı bozmaz.
 */
export const syncYurtZonesFromSettings = async (settings) => {
  try {
    await Promise.all(
      LEGACY_POINTS.map((key) => {
        const point = legacyPointOf(settings, key);
        if (!point) return null;
        const set = {};
        if (point.enabled !== undefined) set.enabled = Boolean(point.enabled);
        if (typeof point.name === "string" && point.name.trim()) set.name = point.name.trim().slice(0, 60);
        if (!Object.keys(set).length) return null;
        return DeliveryZone.updateMany({ legacyPoint: key }, { $set: set });
      })
    );
    return true;
  } catch (error) {
    console.warn("Yurt bölgeleri ayarlarla eşlenemedi:", error.message);
    return false;
  }
};

/**
 * Panelden yurt bölgesinin açık/kapalı durumu ya da adı değişince settings.deliveryPoints'e yazar.
 * @param {Array<{ legacyPoint, enabled?, name? }>} changes
 * @returns {Promise<boolean>} ayar değişti mi
 */
export const syncSettingsFromZones = async (changes = []) => {
  const set = {};
  for (const change of changes) {
    if (!change?.legacyPoint || !LEGACY_POINTS.includes(change.legacyPoint)) continue;
    if (typeof change.enabled === "boolean") set[`deliveryPoints.${change.legacyPoint}.enabled`] = change.enabled;
    if (typeof change.name === "string" && change.name.trim()) set[`deliveryPoints.${change.legacyPoint}.name`] = change.name.trim().slice(0, 60);
  }
  if (!Object.keys(set).length) return false;
  await Settings.updateOne({ name: "default" }, { $set: set });
  return true;
};

// ─────────────────────────────────────────────
// Bölge okuma
// ─────────────────────────────────────────────

const sortZones = (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || String(a.name).localeCompare(String(b.name), "tr");

/** Tüm bölgeler (yurtlar ayar değerleriyle), sortOrder sırasıyla. */
export const listZones = async ({ settings: settingsArg } = {}) => {
  const settings = settingsArg || (await Settings.getSettings());
  await ensureYurtZones(settings);
  const zones = await DeliveryZone.find({}).lean();
  return zones.map((zone) => overlayLegacyZone(zone, settings)).sort(sortZones);
};

/** Tek bölge (yurtlar ayar değerleriyle) ya da null. */
export const getZone = async (zoneId, { settings: settingsArg } = {}) => {
  if (typeof zoneId !== "string" || !zoneId.trim() || zoneId.length > 80) return null;
  const settings = settingsArg || (await Settings.getSettings());
  await ensureYurtZones(settings);
  const zone = await DeliveryZone.findById(zoneId.trim()).lean();
  return zone ? overlayLegacyZone(zone, settings) : null;
};

/** Müşteriye gösterilen bölge biçimi (GET /api/delivery/zones). */
export const serializePublicZone = (zone, settings) => {
  const deliveryFee = Math.max(0, Number(zone.deliveryFee) || 0);
  return {
    id: zone._id,
    name: zone.name,
    type: zone.type,
    deliveryFee,
    isFree: deliveryFee === 0 || settings?.delivery?.freeDeliveryEverywhere === true,
    freeDeliveryThreshold: zone.freeDeliveryThreshold ?? null,
    minimumOrderAmount: resolveMinimumOrderAmount(zone, settings),
    etaText: zone.etaText || "",
    requiresFirstOrderCallback: zone.requireFirstOrderCallback === true,
  };
};

// ─────────────────────────────────────────────
// İlk sipariş telefon teyidi
// ─────────────────────────────────────────────

/**
 * Bölgede "ilk siparişte telefonla teyit" açıksa ve müşterinin daha önce teslim edilmiş siparişi yoksa true.
 * Sipariş verme akışını asla bozmaz: sorgu hatasında false döner (sipariş teyitsiz alınır).
 */
export const needsFirstOrderCallback = async (zone, userId) => {
  if (zone?.requireFirstOrderCallback !== true || !userId) return false;
  try {
    return !(await Order.exists({ user: userId, status: "Teslim Edildi" }));
  } catch (error) {
    console.warn("İlk sipariş teyidi denetlenemedi:", error.message);
    return false;
  }
};

/** Yurt (eski) akışı: yurt bölgesinin bayrağı. Bölge okunamazsa false. */
export const legacyZoneNeedsCallback = async (legacyPoint, userId) => {
  try {
    const zone = await DeliveryZone.findById(legacyPoint).select("requireFirstOrderCallback").lean();
    return await needsFirstOrderCallback(zone, userId);
  } catch (error) {
    console.warn("Yurt bölgesi teyit ayarı okunamadı:", error.message);
    return false;
  }
};

// ─────────────────────────────────────────────
// Kuryeler (settings.delivery.couriers)
// ─────────────────────────────────────────────

export const MAX_COURIERS = 30;
export const COURIER_LIMITS = { name: 40, phone: 20 };

/** Yönetici yanıtı biçimi */
export const serializeCourier = (courier) => ({
  _id: String(courier?._id ?? ""),
  name: String(courier?.name || ""),
  phone: String(courier?.phone || ""),
  active: courier?.active !== false,
});

export const listCouriers = (settings) => (plain(settings?.delivery)?.couriers || []).map(serializeCourier);

/**
 * Kurye listesi girdisini doğrular (tüm liste gönderilir). Var olan kimlik korunur; yeni kayda kimlik üretilir.
 * @returns {{ value?: Array<{ _id, name, phone, active }>, error?: string }}
 */
export const normalizeCouriersInput = (input) => {
  if (!Array.isArray(input)) return { error: "Kurye listesi geçersiz" };
  if (input.length > MAX_COURIERS) return { error: `En fazla ${MAX_COURIERS} kurye eklenebilir` };
  const value = [];
  const names = new Set();
  const ids = new Set();
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Kurye bilgisi geçersiz" };
    if (typeof raw.name !== "string" || !cleanText(raw.name)) return { error: "Kurye adı zorunludur" };
    const name = cleanText(raw.name);
    if (name.length > COURIER_LIMITS.name) return { error: `Kurye adı en fazla ${COURIER_LIMITS.name} karakter olabilir` };
    const key = name.toLocaleLowerCase("tr");
    if (names.has(key)) return { error: `"${name}" adlı iki kurye var; adları ayırt edin` };
    names.add(key);
    if (raw.phone !== undefined && raw.phone !== null && typeof raw.phone !== "string") return { error: `${name}: telefon geçersiz` };
    const phone = cleanText(raw.phone ?? "");
    if (phone.length > COURIER_LIMITS.phone || (phone && !/^[0-9+()\s-]{7,20}$/.test(phone))) return { error: `${name}: telefon geçersiz` };
    if (raw.active !== undefined && typeof raw.active !== "boolean") return { error: `${name}: aktiflik değeri geçersiz` };
    const id = typeof raw._id === "string" && isValidObjectId(raw._id) && !ids.has(raw._id.toLowerCase())
      ? raw._id.toLowerCase()
      : new mongoose.Types.ObjectId().toString();
    ids.add(id);
    value.push({ _id: id, name, phone, active: raw.active !== false });
  }
  return { value };
};

export const zoneClosedMessage = (zone) =>
  `${zone.name} bölgesine şu anda teslimat yapılamıyor${zone.closedReason ? ` (${zone.closedReason})` : ""}.`;

// ─────────────────────────────────────────────
// Adres doğrulama ve sipariş metinleri
// ─────────────────────────────────────────────

export const ADDRESS_FIELDS = [
  ["label", 30, "Adres adı"],
  ["street", 120, "Cadde/sokak"],
  ["buildingNo", 20, "Bina no"],
  ["buildingName", 60, "Bina/site adı"],
  ["floor", 10, "Kat"],
  ["apartment", 10, "Daire"],
  ["directions", 300, "Adres tarifi"],
];

const cleanText = (value) => String(value).replace(/\s+/g, " ").trim();

const parseLocation = (value) => {
  if (value === null || value === undefined || value === "") return { value: null };
  if (typeof value !== "object" || Array.isArray(value)) return { error: "Konum bilgisi geçersiz" };
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (value.lat === null || value.lat === undefined || value.lng === null || value.lng === undefined) return { error: "Konum bilgisi geçersiz" };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "Konum bilgisi geçersiz" };
  }
  return { value: { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } };
};

/**
 * Adres girdisini doğrular ve temizler.
 * @param {object} input - { zoneId, label, street, buildingNo, buildingName, floor, apartment, directions, location }
 * @param {{ partial?: boolean }} [options] - partial: yalnızca gönderilen alanlar (PUT)
 * @returns {{ value?: object, error?: string }}
 */
export const normalizeAddressInput = (input, { partial = false } = {}) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Adres bilgileri eksik" };
  const value = {};
  if (input.zoneId !== undefined || !partial) {
    if (typeof input.zoneId !== "string" || !input.zoneId.trim() || input.zoneId.length > 80) return { error: "Lütfen teslimat bölgesi seçin" };
    value.zoneId = input.zoneId.trim();
  }
  for (const [field, max, label] of ADDRESS_FIELDS) {
    const raw = input[field];
    if (raw === undefined || raw === null) {
      if (!partial) value[field] = "";
      continue;
    }
    if (typeof raw !== "string" && typeof raw !== "number") return { error: `${label} geçersiz` };
    const text = cleanText(raw);
    if (text.length > max) return { error: `${label} en fazla ${max} karakter olabilir` };
    value[field] = text;
  }
  if ((!partial || input.street !== undefined) && !value.street) return { error: "Cadde/sokak bilgisi zorunludur" };
  if (input.location !== undefined || !partial) {
    const location = parseLocation(input.location);
    if (location.error) return { error: location.error };
    value.location = location.value;
  }
  if (input.isDefault !== undefined) value.isDefault = input.isDefault === true;
  return { value };
};

const shortZoneName = (zone) => {
  const name = String(zone?.name || "").trim();
  if (zone?.type === "mahalle") return name.replace(/\s+mahallesi$/i, " Mah.");
  return name;
};

/** Sipariş listesinde/fişte görünen kısa teslimat metni (≤60): "Cumhuriyet Mah. · Atatürk Cd. No:5" */
export const buildAddressPointName = (zone, address = {}) => {
  const parts = [address.street, address.buildingNo ? `No:${address.buildingNo}` : ""].filter(Boolean).join(" ");
  const text = [shortZoneName(zone), parts].filter(Boolean).join(" · ");
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
};

/** Siparişe kopyalanan adres (deliveryAddress). */
export const buildOrderAddress = (zone, address = {}) => ({
  zoneId: zone._id,
  zoneName: zone.name,
  street: address.street || "",
  buildingNo: address.buildingNo || "",
  buildingName: address.buildingName || "",
  floor: address.floor || "",
  apartment: address.apartment || "",
  directions: address.directions || "",
  location: address.location && isNum(address.location.lat) && isNum(address.location.lng)
    ? { lat: address.location.lat, lng: address.location.lng }
    : null,
});

export const zoneSnapshot = (zone) => ({ id: zone._id, name: zone.name, type: zone.type });

export const isValidObjectId = (value) => typeof value === "string" && mongoose.Types.ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value);

// ─────────────────────────────────────────────
// Yönetici: bölge alanı doğrulama ve kısa ad (slug)
// ─────────────────────────────────────────────

const TR_MAP = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const TYPE_PREFIX = { mahalle: "mah", koy: "koy", yurt: "yurt" };

export const slugifyZoneName = (name, type) => {
  const base = String(name || "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]|i̇/g, (ch) => TR_MAP[ch] || ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(mahallesi|mah|koyu|koy|yurdu)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const prefix = TYPE_PREFIX[type] || "bolge";
  return base ? `${prefix}-${base}` : prefix;
};

const nullableAmountField = (value, label) => {
  if (value === null || value === "") return { value: null };
  const number = Number(value);
  if (typeof value === "boolean" || !Number.isFinite(number) || number < 0 || number > 100000) return { error: `${label} 0 ya da daha büyük bir sayı olmalı` };
  return { value: roundMoney(number) };
};

/**
 * Yönetici bölge girdisini doğrular. partial: yalnızca gönderilen alanlar.
 * @returns {{ value?: object, error?: string }}
 */
export const normalizeZoneInput = (input, { partial = false } = {}) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Bölge bilgileri eksik" };
  const value = {};
  if (input.name !== undefined || !partial) {
    if (typeof input.name !== "string" || !cleanText(input.name)) return { error: "Bölge adı zorunludur" };
    const name = cleanText(input.name);
    if (name.length > 60) return { error: "Bölge adı en fazla 60 karakter olabilir" };
    value.name = name;
  }
  if (input.type !== undefined || !partial) {
    if (!ZONE_TYPES.includes(input.type)) return { error: "Bölge türü yurt, mahalle ya da köy olmalı" };
    value.type = input.type;
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") return { error: "Açık/kapalı değeri geçersiz" };
    value.enabled = input.enabled;
  }
  if (input.closedReason !== undefined) {
    if (input.closedReason !== null && typeof input.closedReason !== "string") return { error: "Kapanma nedeni geçersiz" };
    const reason = cleanText(input.closedReason ?? "");
    if (reason.length > 120) return { error: "Kapanma nedeni en fazla 120 karakter olabilir" };
    value.closedReason = reason;
  }
  if (input.deliveryFee !== undefined) {
    const fee = Number(input.deliveryFee);
    if (input.deliveryFee === null || input.deliveryFee === "" || typeof input.deliveryFee === "boolean" || !Number.isFinite(fee) || fee < 0 || fee > 10000) {
      return { error: "Teslimat ücreti 0 ya da daha büyük bir sayı olmalı (0 = ücretsiz)" };
    }
    value.deliveryFee = roundMoney(fee);
  }
  for (const [field, label] of [["freeDeliveryThreshold", "Ücretsiz teslimat eşiği"], ["minimumOrderAmount", "Minimum sepet tutarı"]]) {
    if (input[field] === undefined) continue;
    const parsed = nullableAmountField(input[field], label);
    if (parsed.error) return { error: parsed.error };
    value[field] = parsed.value;
  }
  if (input.etaText !== undefined) {
    if (input.etaText !== null && typeof input.etaText !== "string") return { error: "Teslimat süresi metni geçersiz" };
    const eta = cleanText(input.etaText ?? "");
    if (eta.length > 40) return { error: "Teslimat süresi metni en fazla 40 karakter olabilir" };
    value.etaText = eta;
  }
  if (input.requireFirstOrderCallback !== undefined) {
    if (typeof input.requireFirstOrderCallback !== "boolean") return { error: "İlk sipariş teyidi değeri geçersiz" };
    value.requireFirstOrderCallback = input.requireFirstOrderCallback;
  }
  if (input.sortOrder !== undefined) {
    const order = Number(input.sortOrder);
    if (input.sortOrder === null || input.sortOrder === "" || !Number.isInteger(order) || Math.abs(order) > 100000) return { error: "Sıralama tam sayı olmalı" };
    value.sortOrder = order;
  }
  return { value };
};
