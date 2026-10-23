/**
 * delivery.controller.js — teslimat bölgeleri, ücret teklifi, teslimat alanı ve adrese sipariş bayrağı.
 *
 * Bölgeler SABİTTİR: girlsDorm, boysDorm (yurt) ve devrek (ilce). Yönetici yalnızca açar/kapatır ve fiyatı ayarlar.
 *
 * Müşteri / herkese açık:
 *   GET  /api/delivery/zones              (auth yok)   açık bölgeler (+ requiresLocation, hasArea)
 *   GET  /api/delivery/zones/:id/area     (auth yok)   { area: { type, coordinates } | null, updatedAt } (harita katmanı)
 *   GET  /api/delivery/me                 (oturum)     { addressOrdering, canOrderToAddress }
 *   POST /api/delivery/quote              (oturum)     sepet + bölge → teslimat ücreti, eşik, minimum
 * Yönetici (protectRoute + adminRoute, her değişiklik recordAdminAction ile kaydedilir):
 *   GET /api/delivery/admin/zones, PUT /api/delivery/admin/zones/:id, PATCH /api/delivery/admin/zones/bulk,
 *   POST/DELETE /api/delivery/admin/zones(/:id) → 400 ZONES_FIXED (rota korunur),
 *   POST /api/delivery/admin/zones/devrek/area/fetch, PUT/DELETE /api/delivery/admin/zones/devrek/area,
 *   GET/PUT /api/delivery/admin/settings, GET/PUT /api/delivery/admin/couriers (telefonlar yalnızca burada görünür)
 */

import mongoose from "mongoose";
import DeliveryZone from "../models/deliveryZone.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";
import User from "../models/user.model.js";
import { buildOrderProducts } from "../services/order.service.js";
import { diffFields, money, recordAdminAction, yesNo } from "../services/adminAudit.service.js";
import { invalidateSettingsCache } from "./settings.controller.js";
import {
  ADDRESS_ORDERING_MODES,
  DEVREK_ZONE_ID,
  canOrderToAddress,
  computeDeliveryQuote,
  getAddressOrderingMode,
  getZone,
  isFixedZoneId,
  isValidObjectId,
  listCouriers,
  listZones,
  normalizeCouriersInput,
  normalizeZoneInput,
  serializePublicZone,
  simplifyAreaGeometry,
  summarizeArea,
  syncSettingsFromZones,
  zoneClosedMessage,
} from "../services/delivery.service.js";
import { candidateKey, fetchDevrekAreaCandidates, getCandidatePolygon } from "../services/deliveryArea.service.js";

const fail = (res, status, message, extra = {}) => res.status(status).json({ error: message, message, ...extra });
const serverError = (res, label, error) => {
  console.error(`${label}:`, error.message);
  return res.status(500).json({ error: "İşlem sırasında bir hata oluştu", message: "İşlem sırasında bir hata oluştu" });
};

const TYPE_LABEL = { yurt: "Yurt", ilce: "İlçe merkezi", mahalle: "Mahalle", koy: "Köy" };
const MODE_LABEL = { off: "Kapalı", pilot: "Pilot (seçili kullanıcılar)", public: "Herkese açık" };
const amountOrDash = (value) => (value === null || value === undefined ? "Yok" : money(value));
const feeLabel = (value) => (Number(value) === 0 ? "Ücretsiz" : money(value));
const ZONES_FIXED_MESSAGE = "Teslimat bölgeleri sabittir (Kız KYK Yurdu, Erkek KYK Yurdu, Devrek). Bölge eklenemez ya da silinemez; açıp kapatabilir ve ücretini değiştirebilirsiniz.";

export const ZONE_AUDIT_FIELDS = [
  { key: "name", label: "Bölge adı" },
  { key: "type", label: "Bölge türü", format: (v) => TYPE_LABEL[v] || v },
  { key: "enabled", label: "Teslimat", format: (v) => yesNo(v, "Açık", "Kapalı") },
  { key: "closedReason", label: "Kapanma nedeni" },
  { key: "deliveryFee", label: "Teslimat ücreti", format: feeLabel },
  { key: "freeDeliveryThreshold", label: "Ücretsiz teslimat eşiği", format: amountOrDash },
  { key: "minimumOrderAmount", label: "Minimum sepet", format: (v) => (v === null || v === undefined ? "Genel minimum" : money(v)) },
  { key: "etaText", label: "Teslimat süresi" },
  { key: "requireFirstOrderCallback", label: "İlk siparişte telefonla teyit", format: (v) => yesNo(v === true, "Açık", "Kapalı") },
  { key: "sortOrder", label: "Sıralama" },
];

// Türkiye saatine göre bu ayın başlangıcı (Türkiye sabit UTC+3)
export const turkeyMonthStart = (now = new Date()) => {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - 3 * 60 * 60 * 1000);
};

/** Bölge başına sipariş sayıları. Eski yurt siparişleri (deliveryZone yok) deliveryPoint ile eşlenir. */
export const countOrdersByZone = async (now = new Date()) => {
  const monthStart = turkeyMonthStart(now);
  const rows = await Order.aggregate([
    {
      $group: {
        _id: { $ifNull: ["$deliveryZone.id", "$deliveryPoint"] },
        ordersTotal: { $sum: 1 },
        ordersThisMonth: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
};

const candidateView = (candidate) => ({
  osmType: candidate.osmType,
  osmId: Number(candidate.osmId),
  adminLevel: candidate.adminLevel ?? null,
  kind: candidate.kind || "",
  displayName: candidate.displayName || "",
  areaKm2: candidate.areaKm2 ?? null,
});

const adminZone = (zone, counts) => {
  const row = counts?.get(String(zone._id));
  const { area, areaCandidates, areaCandidatesFetchedAt, ...rest } = zone;
  return {
    ...rest,
    id: zone._id,
    requireFirstOrderCallback: zone.requireFirstOrderCallback === true,
    requiresFirstOrderCallback: zone.requireFirstOrderCallback === true,
    ordersThisMonth: row?.ordersThisMonth || 0,
    ordersTotal: row?.ordersTotal || 0,
    // Teslimat alanı yalnızca devrek'te; koordinatlar yönetici listesinde dönmez
    ...(zone._id === DEVREK_ZONE_ID ? {
      area: summarizeArea(area),
      areaCandidates: (areaCandidates || []).map(candidateView),
      areaCandidatesFetchedAt: areaCandidatesFetchedAt || null,
    } : {}),
  };
};

// ─────────────────────────────────────────────
// Müşteri / herkese açık
// ─────────────────────────────────────────────

export const getPublicZones = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const zones = await listZones({ settings });
    res.json({
      zones: zones.filter((zone) => zone.enabled).map((zone) => serializePublicZone(zone, settings)),
      freeDeliveryEverywhere: settings?.delivery?.freeDeliveryEverywhere === true,
    });
  } catch (error) {
    return serverError(res, "Teslimat bölgeleri getirilemedi", error);
  }
};

/**
 * GET /api/delivery/zones/:id/area — mobil harita katmanı. Bölge sabit değilse 404; alanı yoksa area: null.
 * Yanıt kısa süre önbelleğe alınabilir (sınır nadiren değişir).
 */
export const getPublicZoneArea = async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!isFixedZoneId(id)) return fail(res, 404, "Teslimat bölgesi bulunamadı", { code: "ZONE_NOT_FOUND" });
    const zone = await DeliveryZone.findById(id).select("area updatedAt").lean();
    const area = zone?.area?.type && zone.area.coordinates ? { type: zone.area.type, coordinates: zone.area.coordinates } : null;
    res.set?.("Cache-Control", "public, max-age=300");
    res.json({ area, updatedAt: area ? zone.area.fetchedAt || zone.updatedAt || null : null });
  } catch (error) {
    return serverError(res, "Teslimat alanı getirilemedi", error);
  }
};

export const getMyDeliveryAccess = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      addressOrdering: getAddressOrderingMode(settings),
      canOrderToAddress: canOrderToAddress(settings, req.user?._id),
    });
  } catch (error) {
    return serverError(res, "Teslimat erişimi getirilemedi", error);
  }
};

const MAX_QUOTE_ITEMS = 200;

export const quoteDelivery = async (req, res) => {
  try {
    const { zoneId, products = [] } = req.body || {};
    if (typeof zoneId !== "string" || !zoneId.trim()) return fail(res, 400, "Lütfen teslimat bölgesi seçin");
    if (!Array.isArray(products)) return fail(res, 400, "Sepet içeriği okunamadı");
    if (products.length > MAX_QUOTE_ITEMS) return fail(res, 400, "Sepette çok fazla ürün var");

    const settings = await Settings.getSettings();
    const zone = await getZone(zoneId, { settings });
    if (!zone) return fail(res, 404, "Teslimat bölgesi bulunamadı", { code: "ZONE_NOT_FOUND" });
    if (!zone.enabled) return fail(res, 400, zoneClosedMessage(zone), { code: "ZONE_CLOSED", closedReason: zone.closedReason || "" });

    const items = products
      .filter((item) => item && typeof item === "object")
      .map((item) => ({ product: item.product?._id ?? item.product ?? item._id ?? item.productId, quantity: item.quantity }));
    let subtotal = 0;
    if (items.length) {
      try {
        // Fiyatlar sunucudan, sipariş anıyla aynı kuralla (haftalık / indirimli fiyat dahil).
        // Gizli/stoksuz ürün teklifte hata vermez; sipariş anında reddedilir.
        ({ totalAmount: subtotal } = await buildOrderProducts(items, { checkAvailability: false }));
      } catch (error) {
        // buildOrderProducts geçersiz sepet için durum kodu taşımayan düz Error fırlatır
        if (error instanceof mongoose.Error.CastError || (!error.statusCode && error.name === "Error")) {
          return fail(res, 400, error.message || "Sepet içeriği okunamadı");
        }
        throw error;
      }
    }

    res.json(computeDeliveryQuote({ zone, subtotal, settings }));
  } catch (error) {
    if (error.statusCode && error.statusCode < 500) return fail(res, error.statusCode, error.message);
    return serverError(res, "Teslimat ücreti hesaplanamadı", error);
  }
};

// ─────────────────────────────────────────────
// Yönetici: bölgeler (sabit üç bölge)
// ─────────────────────────────────────────────

export const adminListZones = async (req, res) => {
  try {
    const [zones, counts] = await Promise.all([listZones(), countOrdersByZone()]);
    res.json({ zones: zones.map((zone) => adminZone(zone, counts)) });
  } catch (error) {
    return serverError(res, "Teslimat bölgeleri (yönetici) getirilemedi", error);
  }
};

/** POST /api/delivery/admin/zones — bölgeler sabit: 400 ZONES_FIXED (eski panel 404 almasın diye rota durur). */
export const adminCreateZone = async (req, res) => {
  req.auditRecorded = true;
  return fail(res, 400, ZONES_FIXED_MESSAGE, { code: "ZONES_FIXED" });
};

/** DELETE /api/delivery/admin/zones/:id — bölgeler sabit: 400 ZONES_FIXED. */
export const adminDeleteZone = async (req, res) => {
  req.auditRecorded = true;
  return fail(res, 400, ZONES_FIXED_MESSAGE, { code: "ZONES_FIXED" });
};

export const adminUpdateZone = async (req, res) => {
  try {
    const { value, fixedFields, error } = normalizeZoneInput(req.body || {});
    if (error) return fail(res, 400, error);

    const id = String(req.params.id || "");
    if (!isFixedZoneId(id)) return fail(res, 404, "Teslimat bölgesi bulunamadı", { code: "ZONE_NOT_FOUND" });
    const before = await getZone(id);
    if (!before) return fail(res, 404, "Teslimat bölgesi bulunamadı", { code: "ZONE_NOT_FOUND" });
    // Ad, tür ve sıra sabit: aynı değer gönderilirse yok sayılır, farklıysa reddedilir
    const changedFixed = Object.entries(fixedFields || {}).filter(([key, v]) => String(v ?? "").trim() !== String(before[key] ?? "").trim());
    if (changedFixed.length) {
      return fail(res, 400, "Teslimat bölgelerinin adı, türü ve sırası değiştirilemez; yalnızca açık/kapalı durumu ve ücretleri değişir.", { code: "ZONES_FIXED" });
    }
    if (!Object.keys(value).length) return fail(res, 400, "Değiştirilecek alan yok");

    // Yurt bölgesinde ayarlardan gelen açık/kapalı ve ad belgeye de yazılır (olası kaymayı onarır)
    const set = before.legacyPoint ? { enabled: before.enabled, name: before.name, ...value } : value;
    const updated = await DeliveryZone.findByIdAndUpdate(before._id, { $set: set }, { new: true, runValidators: true }).select("-area.coordinates").lean();
    if (!updated) return fail(res, 404, "Teslimat bölgesi bulunamadı", { code: "ZONE_NOT_FOUND" });

    // Yurt: açık/kapalı mevcut uygulamanın okuduğu ayarlara da yazılır
    if (before.legacyPoint && value.enabled !== undefined) {
      const changed = await syncSettingsFromZones([{ legacyPoint: before.legacyPoint, enabled: value.enabled }]);
      if (changed) invalidateSettingsCache();
    }

    // Alanı hiç olmayan eski bölge belgesi false sayılır (sahte "Kapalı → Kapalı" kaydı yazılmasın)
    const auditView = (zone) => ({ ...zone, requireFirstOrderCallback: zone?.requireFirstOrderCallback === true });
    const changes = diffFields(auditView(before), auditView(updated), ZONE_AUDIT_FIELDS);
    if (changes.length) {
      recordAdminAction(req, {
        action: changes.length === 1 ? `Teslimat bölgesi değiştirildi: ${updated.name} (${changes[0].label})` : `Teslimat bölgesi değiştirildi: ${updated.name}`,
        category: "settings",
        target: updated._id,
        targetName: updated.name,
        changes,
      });
    } else {
      req.auditRecorded = true;
    }
    res.json({ zone: adminZone(updated) });
  } catch (error) {
    return serverError(res, "Teslimat bölgesi güncellenemedi", error);
  }
};

const BULK_FIELDS = ["deliveryFee", "freeDeliveryThreshold", "minimumOrderAmount", "enabled", "etaText", "closedReason", "requireFirstOrderCallback"];
const MAX_BULK_IDS = 10;

/** PATCH /api/delivery/admin/zones/bulk — geriye uyum; yalnızca sabit bölgelere uygulanır. */
export const adminBulkUpdateZones = async (req, res) => {
  try {
    const { ids, set } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return fail(res, 400, "En az bir bölge seçin");
    if (ids.length > MAX_BULK_IDS) return fail(res, 400, `Tek seferde en fazla ${MAX_BULK_IDS} bölge güncellenebilir`);
    if (!ids.every((id) => typeof id === "string" && id.trim() && id.length <= 80)) return fail(res, 400, "Bölge seçimi geçersiz");
    if (!set || typeof set !== "object" || Array.isArray(set)) return fail(res, 400, "Değiştirilecek alan yok");
    const unknown = Object.keys(set).filter((key) => !BULK_FIELDS.includes(key));
    if (unknown.length) return fail(res, 400, `Toplu işlemde değiştirilemeyen alan: ${unknown.join(", ")}`);
    const { value, error } = normalizeZoneInput(set);
    if (error) return fail(res, 400, error);
    if (!Object.keys(value).length) return fail(res, 400, "Değiştirilecek alan yok");

    const uniqueIds = [...new Set(ids.map((id) => id.trim()))];
    const zones = await listZones();
    const targets = zones.filter((zone) => uniqueIds.includes(zone._id));
    if (!targets.length) return fail(res, 404, "Seçilen bölgeler bulunamadı");

    const result = await DeliveryZone.updateMany({ _id: { $in: targets.map((zone) => zone._id) } }, { $set: value }, { runValidators: true });

    if (value.enabled !== undefined) {
      const changed = await syncSettingsFromZones(targets.filter((zone) => zone.legacyPoint).map((zone) => ({ legacyPoint: zone.legacyPoint, enabled: value.enabled })));
      if (changed) invalidateSettingsCache();
    }

    const changes = ZONE_AUDIT_FIELDS
      .filter(({ key }) => key in value)
      .map(({ key, label, format = (v) => v }) => ({ label, from: "—", to: format(value[key]) }));
    recordAdminAction(req, {
      action: `${targets.length} teslimat bölgesi toplu güncellendi`,
      category: "settings",
      target: targets.length === 1 ? targets[0]._id : "delivery-zones",
      targetName: targets.map((zone) => zone.name).join(", "),
      changes,
      meta: { ids: targets.map((zone) => zone._id) },
    });

    res.json({ updated: result.modifiedCount ?? 0, matched: result.matchedCount ?? targets.length });
  } catch (error) {
    return serverError(res, "Teslimat bölgeleri toplu güncellenemedi", error);
  }
};

// ─────────────────────────────────────────────
// Yönetici: Devrek teslimat alanı (OpenStreetMap sınırı)
// ─────────────────────────────────────────────

const areaFail = (res, error) => {
  if (error?.statusCode && error.statusCode < 600 && error.code) return fail(res, error.statusCode, error.message, { code: error.code });
  return null;
};

const areaAuditText = (area) => (area ? `${area.displayName || `${area.osmType}/${area.osmId}`} (~${area.areaKm2 ?? "?"} km²)` : "Yok");

/** Seçilen adayı devrek bölgesine yazar; { area, candidates } yanıt gövdesi döner. */
const storeArea = async ({ candidate, geometry, candidates }) => {
  const simplified = simplifyAreaGeometry(geometry);
  const area = {
    type: simplified.type,
    coordinates: simplified.coordinates,
    source: "osm",
    osmType: candidate.osmType,
    osmId: Number(candidate.osmId),
    adminLevel: candidate.adminLevel ?? null,
    displayName: candidate.displayName || "",
    areaKm2: candidate.areaKm2 ?? null,
    fetchedAt: new Date(),
  };
  const set = { area };
  if (candidates) {
    set.areaCandidates = candidates.map(candidateView);
    set.areaCandidatesFetchedAt = area.fetchedAt;
  }
  await DeliveryZone.updateOne({ _id: DEVREK_ZONE_ID }, { $set: set }, { runValidators: true });
  return area;
};

const devrekZoneDoc = async () => {
  await listZones(); // sabit bölgeler yoksa oluşturur
  return DeliveryZone.findById(DEVREK_ZONE_ID).select("area.osmType area.osmId area.displayName area.areaKm2 areaCandidates").lean();
};

const requireDevrek = (req, res) => {
  if (String(req.params.id || DEVREK_ZONE_ID) !== DEVREK_ZONE_ID) {
    fail(res, 400, "Teslimat alanı yalnızca Devrek bölgesi için yüklenebilir", { code: "AREA_ONLY_DEVREK" });
    return false;
  }
  return true;
};

/**
 * POST /api/delivery/admin/zones/devrek/area/fetch — Nominatim'den adayları getirir, en küçük (merkez) sınırı
 * seçer. Önceden seçilmiş sınır yeni adaylar arasındaysa o korunur (çokgeni tazelenir).
 * Yanıt: { area, candidates, selected: { osmType, osmId } }
 */
export const adminFetchZoneArea = async (req, res) => {
  try {
    if (!requireDevrek(req, res)) return undefined;
    const before = await devrekZoneDoc();
    const { candidates, polygons } = await fetchDevrekAreaCandidates();
    const current = before?.area?.osmType ? candidates.find((c) => c.osmType === before.area.osmType && Number(c.osmId) === Number(before.area.osmId)) : null;
    const chosen = current || candidates[0];
    const area = await storeArea({ candidate: chosen, geometry: polygons.get(candidateKey(chosen.osmType, chosen.osmId)), candidates });

    recordAdminAction(req, {
      action: "Devrek teslimat alanı OpenStreetMap'ten yüklendi",
      category: "settings",
      target: DEVREK_ZONE_ID,
      targetName: "Devrek",
      changes: [{ label: "Teslimat alanı", from: areaAuditText(before?.area), to: areaAuditText(area) }],
      meta: { candidates: candidates.length },
    });
    res.json({ area: summarizeArea(area), candidates: candidates.map(candidateView), selected: { osmType: area.osmType, osmId: area.osmId } });
  } catch (error) {
    return areaFail(res, error) || serverError(res, "Teslimat alanı yüklenemedi", error);
  }
};

/** PUT /api/delivery/admin/zones/devrek/area { osmType, osmId } — kayıtlı adaylardan birini seçer. */
export const adminSelectZoneArea = async (req, res) => {
  try {
    if (!requireDevrek(req, res)) return undefined;
    const osmType = String(req.body?.osmType || "").toLowerCase();
    const osmId = Number(req.body?.osmId);
    if (!["relation", "way"].includes(osmType) || !Number.isSafeInteger(osmId) || osmId <= 0) {
      return fail(res, 400, "Geçerli bir sınır seçin (osmType: relation|way, osmId)");
    }
    const before = await devrekZoneDoc();
    const known = (before?.areaCandidates || []).find((c) => c.osmType === osmType && Number(c.osmId) === osmId);
    if (!known) return fail(res, 400, "Bu sınır aday listesinde yok. Önce “Sınırı OpenStreetMap'ten yükle” düğmesine basın.", { code: "AREA_NOT_CANDIDATE" });
    const { candidate, geometry } = await getCandidatePolygon(osmType, osmId);
    const area = await storeArea({ candidate: { ...known, ...candidate }, geometry });

    if (before?.area?.osmType === osmType && Number(before?.area?.osmId) === osmId) {
      req.auditRecorded = true;
    } else {
      recordAdminAction(req, {
        action: "Devrek teslimat alanı değiştirildi",
        category: "settings",
        target: DEVREK_ZONE_ID,
        targetName: "Devrek",
        changes: [{ label: "Teslimat alanı", from: areaAuditText(before?.area), to: areaAuditText(area) }],
      });
    }
    res.json({ area: summarizeArea(area), candidates: (before?.areaCandidates || []).map(candidateView), selected: { osmType, osmId } });
  } catch (error) {
    return areaFail(res, error) || serverError(res, "Teslimat alanı seçilemedi", error);
  }
};

/** DELETE /api/delivery/admin/zones/devrek/area — alanı kaldırır (siparişler "alan doğrulanmadı" olarak alınır). */
export const adminClearZoneArea = async (req, res) => {
  try {
    if (!requireDevrek(req, res)) return undefined;
    const before = await devrekZoneDoc();
    if (!before?.area) {
      req.auditRecorded = true;
      return res.json({ area: null, cleared: false });
    }
    await DeliveryZone.updateOne({ _id: DEVREK_ZONE_ID }, { $set: { area: null } });
    recordAdminAction(req, {
      action: "Devrek teslimat alanı kaldırıldı",
      category: "settings",
      target: DEVREK_ZONE_ID,
      targetName: "Devrek",
      changes: [{ label: "Teslimat alanı", from: areaAuditText(before.area), to: "Yok" }],
    });
    res.json({ area: null, cleared: true });
  } catch (error) {
    return serverError(res, "Teslimat alanı kaldırılamadı", error);
  }
};

// ─────────────────────────────────────────────
// Yönetici: adrese sipariş ayarları
// ─────────────────────────────────────────────

const MAX_PILOT_USERS = 500;

const deliverySettingsResponse = async (settings) => {
  const ids = (settings?.delivery?.pilotUserIds || []).map(String);
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select("name email phone").lean() : [];
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return {
    addressOrdering: getAddressOrderingMode(settings),
    freeDeliveryEverywhere: settings?.delivery?.freeDeliveryEverywhere === true,
    pilotUsers: ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((user) => ({ _id: user._id, name: user.name || "", email: user.email || "", phone: user.phone || "" })),
  };
};

export const adminGetDeliverySettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json(await deliverySettingsResponse(settings));
  } catch (error) {
    return serverError(res, "Teslimat ayarları getirilemedi", error);
  }
};

export const adminUpdateDeliverySettings = async (req, res) => {
  try {
    const { addressOrdering, freeDeliveryEverywhere, pilotUserIds } = req.body || {};
    if (addressOrdering !== undefined && !ADDRESS_ORDERING_MODES.includes(addressOrdering)) {
      return fail(res, 400, "Adrese sipariş durumu off, pilot ya da public olmalı");
    }
    if (freeDeliveryEverywhere !== undefined && typeof freeDeliveryEverywhere !== "boolean") {
      return fail(res, 400, "Ücretsiz teslimat kampanyası değeri geçersiz");
    }
    let pilotIds;
    if (pilotUserIds !== undefined) {
      if (!Array.isArray(pilotUserIds)) return fail(res, 400, "Pilot kullanıcı listesi geçersiz");
      if (pilotUserIds.length > MAX_PILOT_USERS) return fail(res, 400, `En fazla ${MAX_PILOT_USERS} pilot kullanıcı seçilebilir`);
      const unique = [...new Set(pilotUserIds.map((id) => String(id)))];
      if (!unique.every(isValidObjectId)) return fail(res, 400, "Pilot kullanıcı kimliği geçersiz");
      // Yalnızca var olan kullanıcılar kaydedilir (sıra korunur)
      const existing = unique.length ? new Set((await User.find({ _id: { $in: unique } }).select("_id").lean()).map((u) => String(u._id))) : new Set();
      pilotIds = unique.filter((id) => existing.has(id));
    }

    const settings = await Settings.getSettings();
    if (!settings.delivery) settings.delivery = {};
    const before = {
      addressOrdering: getAddressOrderingMode(settings),
      freeDeliveryEverywhere: settings.delivery.freeDeliveryEverywhere === true,
      pilotCount: (settings.delivery.pilotUserIds || []).length,
      pilotIds: (settings.delivery.pilotUserIds || []).map(String).join(","),
    };
    if (addressOrdering !== undefined) settings.delivery.addressOrdering = addressOrdering;
    if (freeDeliveryEverywhere !== undefined) settings.delivery.freeDeliveryEverywhere = freeDeliveryEverywhere;
    if (pilotIds !== undefined) settings.delivery.pilotUserIds = pilotIds;
    await settings.save();
    invalidateSettingsCache();

    const after = {
      addressOrdering: getAddressOrderingMode(settings),
      freeDeliveryEverywhere: settings.delivery.freeDeliveryEverywhere === true,
      pilotCount: (settings.delivery.pilotUserIds || []).length,
      pilotIds: (settings.delivery.pilotUserIds || []).map(String).join(","),
    };
    const changes = diffFields(before, after, [
      { key: "addressOrdering", label: "Adrese sipariş", format: (v) => MODE_LABEL[v] || v },
      { key: "freeDeliveryEverywhere", label: "Tüm bölgelerde ücretsiz teslimat", format: (v) => yesNo(v, "Açık", "Kapalı") },
    ]);
    if (before.pilotIds !== after.pilotIds) changes.push({ label: "Pilot kullanıcılar", from: `${before.pilotCount} kişi`, to: `${after.pilotCount} kişi` });
    if (changes.length) {
      recordAdminAction(req, {
        action: changes.length === 1 ? `Teslimat ayarı değiştirildi: ${changes[0].label}` : "Teslimat ayarları değiştirildi",
        category: "settings",
        target: "delivery-settings",
        targetName: "Teslimat ayarları",
        changes,
      });
    } else {
      req.auditRecorded = true;
    }

    res.json({ ...(await deliverySettingsResponse(settings)), changes });
  } catch (error) {
    return serverError(res, "Teslimat ayarları kaydedilemedi", error);
  }
};

// ─────────────────────────────────────────────
// Yönetici: kuryeler
// ─────────────────────────────────────────────

export const adminGetCouriers = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ couriers: listCouriers(settings) });
  } catch (error) {
    return serverError(res, "Kuryeler getirilemedi", error);
  }
};

/**
 * PUT /api/delivery/admin/couriers { couriers: [{ _id?, name, phone, active }] } — listenin tamamı gönderilir.
 * Kimliği verilen kayıt korunur (eski siparişlerdeki kurye kimliği geçerli kalır). Yanıt: { couriers, changes }
 */
export const adminUpdateCouriers = async (req, res) => {
  try {
    const { value, error } = normalizeCouriersInput(req.body?.couriers);
    if (error) return fail(res, 400, error);

    const settings = await Settings.getSettings();
    if (!settings.delivery) settings.delivery = {};
    const before = listCouriers(settings);
    settings.delivery.couriers = value;
    settings.markModified?.("delivery.couriers");
    await settings.save();
    invalidateSettingsCache();
    const after = listCouriers(settings);

    const beforeById = new Map(before.map((c) => [c._id, c]));
    const afterIds = new Set(after.map((c) => c._id));
    const changes = [];
    for (const courier of after) {
      const old = beforeById.get(courier._id);
      if (!old) changes.push({ label: "Kurye eklendi", from: "—", to: courier.name });
      else {
        if (old.name !== courier.name) changes.push({ label: "Kurye adı", from: old.name, to: courier.name });
        if (old.phone !== courier.phone) changes.push({ label: `${courier.name}: telefon`, from: old.phone || "—", to: courier.phone || "—" });
        if (old.active !== courier.active) changes.push({ label: courier.name, from: old.active ? "Aktif" : "Pasif", to: courier.active ? "Aktif" : "Pasif" });
      }
    }
    for (const old of before) if (!afterIds.has(old._id)) changes.push({ label: "Kurye silindi", from: old.name, to: "—" });

    if (changes.length) {
      recordAdminAction(req, {
        action: changes.length === 1 ? `Kuryeler değiştirildi: ${changes[0].label}` : "Kuryeler değiştirildi",
        category: "settings",
        target: "delivery-couriers",
        targetName: "Kuryeler",
        changes,
      });
    } else {
      req.auditRecorded = true;
    }
    res.json({ couriers: after, changes });
  } catch (error) {
    return serverError(res, "Kuryeler kaydedilemedi", error);
  }
};
