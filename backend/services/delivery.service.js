/**
 * delivery.service.js
 *
 * Teslimat bölgeleri, ücret kuralı, teslimat alanı (çokgen) ve adrese sipariş izni için tek kaynak.
 *
 * - Sabit üç bölge (FIXED_ZONE_IDS): girlsDorm, boysDorm (yurt) ve devrek (ilce). Eklenemez/silinemez;
 *   ensureFixedZones yoksa oluşturur (idempotent), başka bölge belgesi varsa kapatır. listZones yalnızca
 *   sabit bölgeleri döndürür; getZone eski (emekli) bölgeyi kapalı olarak döndürür (retired: true).
 * - computeDeliveryQuote: ücret kuralı (kampanya → bölge ücretsiz → eşik → bölge ücreti) ve minimum sepet.
 * - Yurt bölgeleri (legacyPoint dolu) settings.deliveryPoints ile eşlenir: açık/kapalı ve ad için
 *   kaynak ayarlardır (mevcut uygulama oradan okur). Okurken ayar değerleri bölgeye bindirilir
 *   (overlayLegacyZone); panelden yurt bölgesi değişince ayarlara yazılır (syncSettingsFromZones);
 *   ayarlar değişince bölge belgesi de güncellenir (syncYurtZonesFromSettings).
 * - Teslimat alanı: devrek bölgesinin GeoJSON sınırı (OpenStreetMap). pointInArea saf ışın atma (ray casting)
 *   ile nokta-çokgen testi yapar (MultiPolygon + delikler). Sınır OpenStreetMap'ten services/deliveryArea.service.js
 *   ile yüklenir.
 * - Adres kuralları (validateAddressForZone): devrek'te mahalle, cadde/sokak, bina no ve konum zorunlu; konum
 *   yüklü sınırın dışındaysa OUT_OF_AREA. Yurtta hiçbir alan zorunlu değil.
 * - canOrderToAddress: settings.delivery.addressOrdering 'off' → hayır, 'pilot' → pilotUserIds'te mi,
 *   'public' → evet.
 */

import mongoose from "mongoose";
import DeliveryZone, { DEVREK_ZONE_ID, FIXED_ZONE_IDS, LEGACY_POINTS, ZONE_TYPES } from "../models/deliveryZone.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";

export { DEVREK_ZONE_ID, FIXED_ZONE_IDS, LEGACY_POINTS, ZONE_TYPES };
export const ADDRESS_ORDERING_MODES = ["off", "pilot", "public"];
export const DEVREK_CITY = "Devrek";
const LEGACY_DEFAULT_NAMES = { girlsDorm: "Kız KYK Yurdu", boysDorm: "Erkek KYK Yurdu" };
const DEFAULT_MINIMUM = 250; // settings.minimumOrderAmount şema varsayılanı
// Devrek merkez referans noktası (koddaki mağaza adresinde koordinat yok). OpenStreetMap sınır adayı bu noktayı içermelidir.
export const STORE_POINT = Object.freeze({ lat: 41.2207, lng: 31.9563 });
export const OUT_OF_AREA_MESSAGE = "Bu adres teslimat alanımızın dışında. Haritada Devrek sınırı içinde bir nokta seç.";
export const isFixedZoneId = (id) => FIXED_ZONE_IDS.includes(id);

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
// Sabit bölgeler: tohumlama ve yurt ↔ ayar eşlemesi
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

/** Devrek bölgesinin ilk değerleri (kapalı, ücretsiz). */
export const DEVREK_DEFAULTS = Object.freeze({
  name: "Devrek",
  type: "ilce",
  enabled: false,
  closedReason: "",
  deliveryFee: 0,
  freeDeliveryThreshold: null,
  minimumOrderAmount: null,
  etaText: "",
  requireFirstOrderCallback: false,
  sortOrder: 2,
  legacyPoint: null,
  area: null,
});

let seedPromise = null;

/**
 * Sabit bölgeleri (girlsDorm, boysDorm, devrek) yoksa oluşturur ($setOnInsert + upsert, idempotent) ve sabit
 * olmayan açık bölge belgelerini kapatır (en iyi çaba). Süreç başına bir kez çalışır; başarısız olursa bir
 * sonraki çağrıda yeniden denenir.
 */
export const ensureFixedZones = async (settingsArg) => {
  if (!seedPromise) {
    seedPromise = (async () => {
      const settings = settingsArg || (await Settings.getSettings());
      await Promise.all([
        ...LEGACY_POINTS.map((key, index) => {
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
        }),
        DeliveryZone.updateOne({ _id: DEVREK_ZONE_ID }, { $setOnInsert: { ...DEVREK_DEFAULTS } }, { upsert: true }),
      ]);
      // Eski sürümde eklenmiş mahalle/köy bölgeleri: kapatılır (okuma tarafı zaten kapalı sayar)
      try {
        await DeliveryZone.updateMany({ _id: { $nin: FIXED_ZONE_IDS }, enabled: true }, { $set: { enabled: false } });
      } catch (error) {
        console.warn("Eski teslimat bölgeleri kapatılamadı:", error.message);
      }
      return true;
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
};
/** Eski ad (geriye uyum) */
export const ensureYurtZones = ensureFixedZones;

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

const FIXED_ORDER = new Map(FIXED_ZONE_IDS.map((id, index) => [id, index]));
const sortZones = (a, b) =>
  (FIXED_ORDER.get(a._id) ?? 99) - (FIXED_ORDER.get(b._id) ?? 99)
  || (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
  || String(a.name).localeCompare(String(b.name), "tr");

/** Sabit olmayan (eski sürümden kalan) bölge: her zaman kapalı. */
const retire = (zone) => ({ ...zone, enabled: false, retired: true });

/** Liste okumalarında çokgen koordinatları yüklenmez (alan özeti yeterli). */
const LIST_PROJECTION = "-area.coordinates";

/**
 * Sabit bölgeler (yurtlar ayar değerleriyle) sabit sırayla: girlsDorm, boysDorm, devrek.
 * includeRetired: eski bölgeler de (kapalı, retired: true) sona eklenir — kayıtlı adres adları için.
 * Alan koordinatları dönmez; zone.area varsa { type, osmType, ... } özeti vardır.
 */
export const listZones = async ({ settings: settingsArg, includeRetired = false } = {}) => {
  const settings = settingsArg || (await Settings.getSettings());
  await ensureFixedZones(settings);
  const zones = await DeliveryZone.find({}).select(LIST_PROJECTION).lean();
  return (zones || [])
    .filter((zone) => includeRetired || isFixedZoneId(zone._id))
    .map((zone) => (isFixedZoneId(zone._id) ? overlayLegacyZone(zone, settings) : retire(zone)))
    .sort(sortZones);
};

/**
 * Tek bölge (yurtlar ayar değerleriyle) ya da null. Eski (sabit olmayan) bölge kapalı döner (retired: true).
 * withArea: devrek alanının koordinatları da yüklenir (adres/sipariş alan denetimi için).
 */
export const getZone = async (zoneId, { settings: settingsArg, withArea = false } = {}) => {
  if (typeof zoneId !== "string" || !zoneId.trim() || zoneId.length > 80) return null;
  const settings = settingsArg || (await Settings.getSettings());
  await ensureFixedZones(settings);
  const query = DeliveryZone.findById(zoneId.trim());
  const zone = await (withArea ? query : query.select(LIST_PROJECTION)).lean();
  if (!zone) return null;
  return isFixedZoneId(zone._id) ? overlayLegacyZone(zone, settings) : retire(zone);
};

/** Bölgede yüklü bir teslimat alanı (çokgen ya da özeti) var mı? */
export const zoneHasArea = (zone) => Boolean(zone?.area && ["Polygon", "MultiPolygon"].includes(zone.area.type));

/** Bölgeye adres eklerken haritadan konum zorunlu mu? (yalnızca devrek / ilce) */
export const zoneRequiresLocation = (zone) => zone?._id === DEVREK_ZONE_ID || zone?.type === "ilce";

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
    requiresLocation: zoneRequiresLocation(zone),
    hasArea: zoneHasArea(zone),
  };
};

/** Yönetici yanıtı: alan özeti (koordinatsız) ya da null. */
export const summarizeArea = (area) => (area && area.type ? {
  type: area.type,
  source: area.source || "osm",
  osmType: area.osmType || null,
  osmId: area.osmId ?? null,
  adminLevel: area.adminLevel ?? null,
  displayName: area.displayName || "",
  areaKm2: area.areaKm2 ?? null,
  fetchedAt: area.fetchedAt || null,
} : null);

// ─────────────────────────────────────────────
// Teslimat alanı: geometri (saf fonksiyonlar)
// ─────────────────────────────────────────────

const isPosition = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
  && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
const isRing = (ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition);
const isPolygonCoords = (coords) => Array.isArray(coords) && coords.length >= 1 && coords.every(isRing);

/** GeoJSON Polygon / MultiPolygon yapısı geçerli mi? ([boylam, enlem], halkalar ≥ 4 nokta) */
export const isAreaGeometry = (geometry) => {
  if (!geometry || typeof geometry !== "object") return false;
  if (geometry.type === "Polygon") return isPolygonCoords(geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 1 && geometry.coordinates.every(isPolygonCoords);
  }
  return false;
};

/** Işın atma: (x = boylam, y = enlem) halkanın içinde mi? */
export const pointInRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const pointInPolygonCoords = (x, y, rings) => {
  if (!rings.length || !pointInRing(x, y, rings[0])) return false;
  for (let k = 1; k < rings.length; k += 1) if (pointInRing(x, y, rings[k])) return false; // delik
  return true;
};

/**
 * Nokta ({ lat, lng }) alanın (GeoJSON Polygon / MultiPolygon) içinde mi? Delikler dışarı sayılır.
 * Geçersiz geometri ya da nokta → false.
 */
export const pointInArea = (point, geometry) => {
  const x = Number(point?.lng);
  const y = Number(point?.lat);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !geometry) return false;
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) return pointInPolygonCoords(x, y, geometry.coordinates);
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some((polygon) => Array.isArray(polygon) && pointInPolygonCoords(x, y, polygon));
  }
  return false;
};

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;
// Küre üzerinde halka alanı (km²), işaretsiz
const ringAreaKm2 = (ring) => {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    total += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
};
const polygonAreaKm2 = (rings) => Math.max(0, ringAreaKm2(rings[0]) - rings.slice(1).reduce((sum, ring) => sum + ringAreaKm2(ring), 0));

/** Alanın yaklaşık yüzölçümü (km², 2 ondalık). */
export const areaKm2Of = (geometry) => {
  if (!isAreaGeometry(geometry)) return null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return Math.round(polygons.reduce((sum, rings) => sum + polygonAreaKm2(rings), 0) * 100) / 100;
};

const perpendicularDistance = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** Douglas-Peucker (yinelemeli, özyinelemesiz) — açık çizgi; uç noktalar korunur. */
export const simplifyLine = (points, tolerance) => {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const distance = perpendicularDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) { maxDistance = distance; index = i; }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

const round6 = (value) => Math.round(value * 1e6) / 1e6;
const simplifyRing = (ring, tolerance) => {
  const rounded = ring.map(([lng, lat]) => [round6(lng), round6(lat)]);
  if (tolerance <= 0 || rounded.length <= 8) return rounded;
  // Kapalı halka: ilk noktadan en uzak noktayla ikiye bölünür, iki yarı ayrı sadeleşir
  const open = rounded.slice(0, -1);
  let far = 1;
  let farDistance = -1;
  for (let i = 1; i < open.length; i += 1) {
    const distance = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (distance > farDistance) { farDistance = distance; far = i; }
  }
  const firstHalf = simplifyLine(open.slice(0, far + 1), tolerance);
  const secondHalf = simplifyLine([...open.slice(far), open[0]], tolerance);
  const result = [...firstHalf, ...secondHalf.slice(1)];
  return result.length >= 4 ? result : rounded;
};

export const countAreaPoints = (geometry) => {
  if (!geometry?.coordinates) return 0;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce((sum, rings) => sum + rings.reduce((acc, ring) => acc + ring.length, 0), 0);
};

export const AREA_SIMPLIFY = Object.freeze({ tolerance: 1e-5, minPoints: 2000, maxPoints: 20000 });

/**
 * Büyük alanı belgeye sığacak şekilde sadeleştirir (Douglas-Peucker, ~1e-5° ≈ 1 m). Koordinatlar 6 ondalığa
 * yuvarlanır. Nokta sayısı minPoints altındaysa yalnızca yuvarlar; maxPoints üstünde kalırsa toleransı büyütür.
 * @returns {{ type, coordinates }}
 */
export const simplifyAreaGeometry = (geometry, { tolerance = AREA_SIMPLIFY.tolerance, minPoints = AREA_SIMPLIFY.minPoints, maxPoints = AREA_SIMPLIFY.maxPoints } = {}) => {
  const apply = (tol) => {
    const polygon = (rings) => rings.map((ring) => simplifyRing(ring, tol));
    return geometry.type === "Polygon"
      ? { type: "Polygon", coordinates: polygon(geometry.coordinates) }
      : { type: "MultiPolygon", coordinates: geometry.coordinates.map(polygon) };
  };
  if (countAreaPoints(geometry) <= minPoints) return apply(0);
  let tol = tolerance;
  let result = apply(tol);
  for (let attempt = 0; attempt < 6 && countAreaPoints(result) > maxPoints; attempt += 1) {
    tol *= 4;
    result = apply(tol);
  }
  return result;
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
  ["neighborhood", 60, "Mahalle"],
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
 * Adres girdisinin biçimini doğrular ve temizler (uzunluk, tür, konum). Hangi alanın zorunlu olduğu bölgeye
 * bağlıdır ve validateAddressForZone ile ayrıca denetlenir.
 * @param {object} input - { zoneId, label, neighborhood, street, buildingNo, buildingName, floor, apartment, directions, location }
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
  if (input.location !== undefined || !partial) {
    const location = parseLocation(input.location);
    if (location.error) return { error: location.error };
    value.location = location.value;
  }
  if (input.isDefault !== undefined) value.isDefault = input.isDefault === true;
  return { value };
};

const hasLocation = (location) => Boolean(location) && isNum(location.lat) && isNum(location.lng);

/**
 * Bölgeye göre zorunlu alanlar ve teslimat alanı denetimi (adres ekleme/düzenleme ve sipariş verme).
 * - devrek (ilce): mahalle, cadde/sokak, bina no ve haritadan konum zorunlu. Alan yüklüyse konum içinde olmalı
 *   (değilse OUT_OF_AREA); alan yüklü değilse kabul edilir, areaVerified: false.
 * - yurt: zorunlu alan yok (tarif isteğe bağlı).
 * - eski (mahalle/köy) bölgeler: cadde/sokak zorunlu (bu bölgeler zaten kapalıdır).
 * @param {object} address - temizlenmiş adres (normalizeAddressInput ya da kayıtlı adres)
 * @param {object} zone - getZone sonucu (alan denetimi için withArea: true ile okunmalı)
 * @returns {{ error?: string, code?: string, areaVerified: boolean|null }}
 */
export const validateAddressForZone = (address = {}, zone = {}) => {
  const text = (key) => cleanText(address?.[key] ?? "");
  if (zone?.type === "yurt") return { areaVerified: null };
  if (zoneRequiresLocation(zone)) {
    if (!text("neighborhood")) return { error: "Mahalle bilgisi zorunludur", code: "NEIGHBORHOOD_REQUIRED", areaVerified: null };
    if (!text("street")) return { error: "Cadde/sokak bilgisi zorunludur", code: "STREET_REQUIRED", areaVerified: null };
    if (!text("buildingNo")) return { error: "Bina no zorunludur", code: "BUILDING_NO_REQUIRED", areaVerified: null };
    if (!hasLocation(address?.location)) {
      return { error: "Adresini haritada işaretle: konum zorunludur", code: "LOCATION_REQUIRED", areaVerified: null };
    }
    if (zone?.area && isAreaGeometry(zone.area)) {
      if (!pointInArea(address.location, zone.area)) return { error: OUT_OF_AREA_MESSAGE, code: "OUT_OF_AREA", areaVerified: false };
      return { areaVerified: true };
    }
    return { areaVerified: false };
  }
  if (!text("street")) return { error: "Cadde/sokak bilgisi zorunludur", code: "STREET_REQUIRED", areaVerified: null };
  return { areaVerified: null };
};

/** "Cumhuriyet" / "Cumhuriyet Mahallesi" / "Cumhuriyet Mah." → "Cumhuriyet Mah." */
export const neighborhoodLabel = (value) => {
  const name = cleanText(value ?? "").replace(/\s+(mahallesi|mahalle|mah\.?)$/i, "").trim();
  return name ? `${name} Mah.` : "";
};

const shortZoneName = (zone) => {
  const name = String(zone?.name || "").trim();
  if (zone?.type === "mahalle") return name.replace(/\s+mahallesi$/i, " Mah.");
  return name;
};

const fit60 = (text) => (text.length > 60 ? `${text.slice(0, 59)}…` : text);

/**
 * Sipariş listesinde/fişte görünen kısa teslimat metni (≤60).
 * devrek: "Cumhuriyet Mah. · Atatürk Cd. No:5"; diğer bölgeler: "<bölge> · <sokak> No:<bina>".
 */
export const buildAddressPointName = (zone, address = {}) => {
  const parts = [address.street, address.buildingNo ? `No:${address.buildingNo}` : ""].filter(Boolean).join(" ");
  const head = zoneRequiresLocation(zone) ? neighborhoodLabel(address.neighborhood) || shortZoneName(zone) : shortZoneName(zone);
  return fit60([head, parts].filter(Boolean).join(" · "));
};

/** Siparişe kopyalanan adres (deliveryAddress). */
export const buildOrderAddress = (zone, address = {}) => ({
  zoneId: zone._id,
  zoneName: zone.name,
  neighborhood: address.neighborhood || "",
  street: address.street || "",
  buildingNo: address.buildingNo || "",
  buildingName: address.buildingName || "",
  floor: address.floor || "",
  apartment: address.apartment || "",
  directions: address.directions || "",
  location: hasLocation(address.location) ? { lat: address.location.lat, lng: address.location.lng } : null,
});

export const zoneSnapshot = (zone) => ({ id: zone._id, name: zone.name, type: zone.type });

export const isValidObjectId = (value) => typeof value === "string" && mongoose.Types.ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value);

// ─────────────────────────────────────────────
// Yönetici: bölge alanı doğrulama
// ─────────────────────────────────────────────

const nullableAmountField = (value, label) => {
  if (value === null || value === "") return { value: null };
  const number = Number(value);
  if (typeof value === "boolean" || !Number.isFinite(number) || number < 0 || number > 100000) return { error: `${label} 0 ya da daha büyük bir sayı olmalı` };
  return { value: roundMoney(number) };
};

/** Panelden değiştirilebilen bölge alanları (ad, tür ve sıra sabittir). */
export const EDITABLE_ZONE_FIELDS = ["enabled", "closedReason", "deliveryFee", "freeDeliveryThreshold", "minimumOrderAmount", "etaText", "requireFirstOrderCallback"];
export const FIXED_ZONE_FIELDS = ["name", "type", "sortOrder"];

/**
 * Yönetici bölge girdisini doğrular (yalnızca gönderilen alanlar). Ad, tür ve sıra sabittir: gönderilirse
 * value'ya girmez, fixedFields'ta döner (denetleyici mevcut değerden farklıysa ZONES_FIXED verir).
 * @returns {{ value?: object, fixedFields?: object, error?: string }}
 */
export const normalizeZoneInput = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Bölge bilgileri eksik" };
  const value = {};
  const fixedFields = {};
  for (const key of FIXED_ZONE_FIELDS) if (input[key] !== undefined) fixedFields[key] = input[key];
  if (fixedFields.type !== undefined && !ZONE_TYPES.includes(fixedFields.type)) return { error: "Bölge türü geçersiz" };
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
  return { value, fixedFields };
};
