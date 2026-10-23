/**
 * delivery.controller.js — teslimat bölgeleri, ücret teklifi ve adrese sipariş bayrağı.
 *
 * Müşteri / herkese açık:
 *   GET  /api/delivery/zones   (auth yok)   açık bölgeler
 *   GET  /api/delivery/me      (oturum)     { addressOrdering, canOrderToAddress }
 *   POST /api/delivery/quote   (oturum)     sepet + bölge → teslimat ücreti, eşik, minimum
 * Yönetici (protectRoute + adminRoute, her değişiklik recordAdminAction ile kaydedilir):
 *   GET/POST /api/delivery/admin/zones, PUT/DELETE /api/delivery/admin/zones/:id,
 *   PATCH /api/delivery/admin/zones/bulk, GET/PUT /api/delivery/admin/settings
 */

import mongoose from "mongoose";
import DeliveryZone from "../models/deliveryZone.model.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";
import User from "../models/user.model.js";
import UserAddress from "../models/userAddress.model.js";
import { buildOrderProducts } from "../services/order.service.js";
import { diffFields, money, recordAdminAction, yesNo } from "../services/adminAudit.service.js";
import { invalidateSettingsCache } from "./settings.controller.js";
import {
  ADDRESS_ORDERING_MODES,
  canOrderToAddress,
  computeDeliveryQuote,
  ensureYurtZones,
  getAddressOrderingMode,
  getZone,
  isValidObjectId,
  listZones,
  normalizeZoneInput,
  serializePublicZone,
  slugifyZoneName,
  syncSettingsFromZones,
  zoneClosedMessage,
} from "../services/delivery.service.js";

const fail = (res, status, message, extra = {}) => res.status(status).json({ error: message, message, ...extra });
const serverError = (res, label, error) => {
  console.error(`${label}:`, error.message);
  return res.status(500).json({ error: "İşlem sırasında bir hata oluştu", message: "İşlem sırasında bir hata oluştu" });
};

const TYPE_LABEL = { yurt: "Yurt", mahalle: "Mahalle", koy: "Köy" };
const MODE_LABEL = { off: "Kapalı", pilot: "Pilot (seçili kullanıcılar)", public: "Herkese açık" };
const amountOrDash = (value) => (value === null || value === undefined ? "Yok" : money(value));
const feeLabel = (value) => (Number(value) === 0 ? "Ücretsiz" : money(value));

export const ZONE_AUDIT_FIELDS = [
  { key: "name", label: "Bölge adı" },
  { key: "type", label: "Bölge türü", format: (v) => TYPE_LABEL[v] || v },
  { key: "enabled", label: "Teslimat", format: (v) => yesNo(v, "Açık", "Kapalı") },
  { key: "closedReason", label: "Kapanma nedeni" },
  { key: "deliveryFee", label: "Teslimat ücreti", format: feeLabel },
  { key: "freeDeliveryThreshold", label: "Ücretsiz teslimat eşiği", format: amountOrDash },
  { key: "minimumOrderAmount", label: "Minimum sepet", format: (v) => (v === null || v === undefined ? "Genel minimum" : money(v)) },
  { key: "etaText", label: "Teslimat süresi" },
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

const zoneHasOrders = async (zone) => {
  const or = [{ "deliveryZone.id": zone._id }];
  if (zone.legacyPoint) or.push({ deliveryPoint: zone.legacyPoint });
  return Boolean(await Order.exists({ $or: or }));
};

const adminZone = (zone, counts) => {
  const row = counts?.get(String(zone._id));
  return {
    ...zone,
    id: zone._id,
    ordersThisMonth: row?.ordersThisMonth || 0,
    ordersTotal: row?.ordersTotal || 0,
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
// Yönetici: bölgeler
// ─────────────────────────────────────────────

export const adminListZones = async (req, res) => {
  try {
    const [zones, counts] = await Promise.all([listZones(), countOrdersByZone()]);
    res.json({ zones: zones.map((zone) => adminZone(zone, counts)) });
  } catch (error) {
    return serverError(res, "Teslimat bölgeleri (yönetici) getirilemedi", error);
  }
};

const uniqueZoneId = async (base) => {
  const taken = new Set(
    (await DeliveryZone.find({ _id: { $regex: `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?$` } }).select("_id").lean()).map((z) => z._id)
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now()}`;
};

export const adminCreateZone = async (req, res) => {
  try {
    const { value, error } = normalizeZoneInput(req.body || {});
    if (error) return fail(res, 400, error);
    await ensureYurtZones();
    if (value.sortOrder === undefined) {
      const last = await DeliveryZone.findOne({}).sort({ sortOrder: -1 }).select("sortOrder").lean();
      value.sortOrder = (Number(last?.sortOrder) || 0) + 1;
    }
    const _id = await uniqueZoneId(slugifyZoneName(value.name, value.type));
    const created = await DeliveryZone.create({ ...value, _id, legacyPoint: null });
    const zone = created.toObject();

    recordAdminAction(req, {
      action: `Teslimat bölgesi eklendi: ${zone.name}`,
      category: "settings",
      target: zone._id,
      targetName: zone.name,
      changes: diffFields({}, zone, ZONE_AUDIT_FIELDS).map((c) => ({ ...c, from: "—" })),
    });
    res.status(201).json({ zone: adminZone(zone) });
  } catch (error) {
    if (error?.code === 11000) return fail(res, 409, "Bu adla bir bölge zaten var, lütfen tekrar deneyin");
    return serverError(res, "Teslimat bölgesi eklenemedi", error);
  }
};

export const adminUpdateZone = async (req, res) => {
  try {
    const { value, error } = normalizeZoneInput(req.body || {}, { partial: true });
    if (error) return fail(res, 400, error);
    if (!Object.keys(value).length) return fail(res, 400, "Değiştirilecek alan yok");

    const before = await getZone(String(req.params.id || ""));
    if (!before) return fail(res, 404, "Teslimat bölgesi bulunamadı");
    if (before.legacyPoint && value.type !== undefined && value.type !== "yurt") return fail(res, 400, "Yurt bölgesinin türü değiştirilemez");

    // Yurt bölgesinde ayarlardan gelen açık/kapalı ve ad belgeye de yazılır (olası kaymayı onarır)
    const set = before.legacyPoint ? { enabled: before.enabled, name: before.name, ...value } : value;
    const updated = await DeliveryZone.findByIdAndUpdate(before._id, { $set: set }, { new: true, runValidators: true }).lean();
    if (!updated) return fail(res, 404, "Teslimat bölgesi bulunamadı");

    // Yurt: açık/kapalı ve ad mevcut uygulamanın okuduğu ayarlara da yazılır
    if (before.legacyPoint && (value.enabled !== undefined || value.name !== undefined)) {
      const changed = await syncSettingsFromZones([{ legacyPoint: before.legacyPoint, enabled: value.enabled, name: value.name }]);
      if (changed) invalidateSettingsCache();
    }

    const changes = diffFields(before, updated, ZONE_AUDIT_FIELDS);
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

export const adminDeleteZone = async (req, res) => {
  try {
    const zone = await getZone(String(req.params.id || ""));
    if (!zone) return fail(res, 404, "Teslimat bölgesi bulunamadı");
    if (zone.legacyPoint || ["girlsDorm", "boysDorm"].includes(zone._id)) {
      return fail(res, 409, "Yurt bölgeleri silinemez; teslimatı kapatabilirsiniz", { code: "ZONE_PROTECTED" });
    }
    if (await zoneHasOrders(zone)) {
      return fail(res, 409, "Bu bölgeye verilmiş siparişler var, bölge silinemez; teslimatı kapatabilirsiniz", { code: "ZONE_HAS_ORDERS" });
    }
    const addressCount = await UserAddress.countDocuments({ zoneId: zone._id });
    if (addressCount > 0) {
      return fail(res, 409, `${addressCount} müşterinin kayıtlı adresi bu bölgede, bölge silinemez; teslimatı kapatabilirsiniz`, { code: "ZONE_HAS_ADDRESSES" });
    }
    await DeliveryZone.deleteOne({ _id: zone._id });
    recordAdminAction(req, {
      action: `Teslimat bölgesi silindi: ${zone.name}`,
      category: "settings",
      target: zone._id,
      targetName: zone.name,
    });
    res.json({ success: true, deletedId: zone._id });
  } catch (error) {
    return serverError(res, "Teslimat bölgesi silinemedi", error);
  }
};

const BULK_FIELDS = ["deliveryFee", "freeDeliveryThreshold", "minimumOrderAmount", "enabled", "etaText", "closedReason"];
const MAX_BULK_IDS = 500;

export const adminBulkUpdateZones = async (req, res) => {
  try {
    const { ids, set } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return fail(res, 400, "En az bir bölge seçin");
    if (ids.length > MAX_BULK_IDS) return fail(res, 400, `Tek seferde en fazla ${MAX_BULK_IDS} bölge güncellenebilir`);
    if (!ids.every((id) => typeof id === "string" && id.trim() && id.length <= 80)) return fail(res, 400, "Bölge seçimi geçersiz");
    if (!set || typeof set !== "object" || Array.isArray(set)) return fail(res, 400, "Değiştirilecek alan yok");
    const unknown = Object.keys(set).filter((key) => !BULK_FIELDS.includes(key));
    if (unknown.length) return fail(res, 400, `Toplu işlemde değiştirilemeyen alan: ${unknown.join(", ")}`);
    const { value, error } = normalizeZoneInput(set, { partial: true });
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

    const after = { ...value };
    const changes = ZONE_AUDIT_FIELDS
      .filter(({ key }) => key in value)
      .map(({ key, label, format = (v) => v }) => ({ label, from: "—", to: format(after[key]) }));
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
