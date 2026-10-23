/**
 * address.controller.js — müşterinin kayıtlı teslimat adresleri (/api/addresses, protectRoute).
 * Her işlem yalnızca oturumdaki kullanıcının kendi adresleri üzerinde çalışır; başkasının adresi
 * 404 döner. Kişi başı en fazla MAX_ADDRESSES_PER_USER adres. İlk adres varsayılan olur; varsayılan
 * adres silinirse en son güncellenen adres varsayılan yapılır.
 * Bölge kuralları (validateAddressForZone): Devrek'te mahalle, cadde/sokak, bina no ve konum zorunlu; konum yüklü
 * Devrek sınırının dışındaysa 400 OUT_OF_AREA. Yurtta alan zorunlu değil. Eski (kapatılmış) bölgelerdeki
 * kayıtlı adresler zoneEnabled: false ile listelenir.
 */

import UserAddress, { MAX_ADDRESSES_PER_USER } from "../models/userAddress.model.js";
import Settings from "../models/settings.model.js";
import { getZone, isValidObjectId, listZones, normalizeAddressInput, validateAddressForZone } from "../services/delivery.service.js";

const fail = (res, status, message, extra = {}) => res.status(status).json({ error: message, message, ...extra });
const serverError = (res, label, error) => {
  console.error(`${label}:`, error.message);
  return res.status(500).json({ error: "İşlem sırasında bir hata oluştu", message: "İşlem sırasında bir hata oluştu" });
};

const SORT = { isDefault: -1, updatedAt: -1 };

/** Adres + bölge bilgisi (ad, tür, açık mı) — istemci kapalı bölgeyi uyarabilsin. */
export const serializeAddress = (address, zoneMap) => {
  const zone = zoneMap?.get(address.zoneId);
  return {
    _id: address._id,
    label: address.label || "",
    zoneId: address.zoneId,
    zoneName: zone?.name || "",
    zoneType: zone?.type || null,
    zoneEnabled: Boolean(zone?.enabled),
    neighborhood: address.neighborhood || "",
    street: address.street || "",
    buildingNo: address.buildingNo || "",
    buildingName: address.buildingName || "",
    floor: address.floor || "",
    apartment: address.apartment || "",
    directions: address.directions || "",
    location: address.location?.lat !== undefined && address.location?.lng !== undefined ? { lat: address.location.lat, lng: address.location.lng } : null,
    isDefault: Boolean(address.isDefault),
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
};

const zoneMapFor = async () => {
  try {
    const zones = await listZones({ includeRetired: true });
    return new Map(zones.map((zone) => [zone._id, zone]));
  } catch (error) {
    console.warn("Adres listesi için bölgeler okunamadı:", error.message);
    return new Map();
  }
};

const listFor = async (userId) => {
  const [addresses, zoneMap] = await Promise.all([
    UserAddress.find({ user: userId }).sort(SORT).lean(),
    zoneMapFor(),
  ]);
  return addresses.map((address) => serializeAddress(address, zoneMap));
};

const findOwn = async (req) => {
  const id = String(req.params.id || "");
  if (!isValidObjectId(id)) return null;
  return UserAddress.findOne({ _id: id, user: req.user._id });
};

/**
 * Adresi bölgesine göre denetler. requireOpen: bölge açık olmalı (yeni adres ya da bölge değişikliği).
 * @returns {Promise<{ status, message, code? } | null>} hata ya da null
 */
const addressProblem = async (address, { requireOpen }) => {
  const settings = await Settings.getSettings();
  const zone = await getZone(address.zoneId, { settings, withArea: true });
  if (!zone) return { status: 400, message: "Teslimat bölgesi bulunamadı", code: "ZONE_NOT_FOUND" };
  if (requireOpen && !zone.enabled) return { status: 400, message: `${zone.name} bölgesine şu anda teslimat yapılamıyor`, code: "ZONE_CLOSED" };
  const check = validateAddressForZone(address, zone);
  if (check.error) return { status: 400, message: check.error, code: check.code };
  return null;
};

const failWith = (res, problem) => fail(res, problem.status, problem.message, problem.code ? { code: problem.code } : {});

const clearOtherDefaults = (userId, keepId) =>
  UserAddress.updateMany({ user: userId, _id: { $ne: keepId }, isDefault: true }, { $set: { isDefault: false } });

// Müşterinin kendi adres işlemleri yönetici işlem kaydına yazılmaz
const skipAudit = (req) => {
  req.auditRecorded = true;
};

export const listAddresses = async (req, res) => {
  try {
    res.json({ addresses: await listFor(req.user._id), max: MAX_ADDRESSES_PER_USER });
  } catch (error) {
    return serverError(res, "Adresler getirilemedi", error);
  }
};

export const createAddress = async (req, res) => {
  skipAudit(req);
  try {
    const { value, error } = normalizeAddressInput(req.body || {});
    if (error) return fail(res, 400, error);
    const count = await UserAddress.countDocuments({ user: req.user._id });
    if (count >= MAX_ADDRESSES_PER_USER) {
      return fail(res, 400, `En fazla ${MAX_ADDRESSES_PER_USER} adres kaydedebilirsiniz. Yeni adres için birini silin.`, { code: "ADDRESS_LIMIT" });
    }
    const problem = await addressProblem(value, { requireOpen: true });
    if (problem) return failWith(res, problem);

    const isDefault = count === 0 || value.isDefault === true;
    const created = await UserAddress.create({ ...value, user: req.user._id, isDefault });
    if (isDefault && count > 0) await clearOtherDefaults(req.user._id, created._id);

    const addresses = await listFor(req.user._id);
    res.status(201).json({ address: addresses.find((a) => String(a._id) === String(created._id)), addresses });
  } catch (error) {
    return serverError(res, "Adres kaydedilemedi", error);
  }
};

export const updateAddress = async (req, res) => {
  skipAudit(req);
  try {
    const address = await findOwn(req);
    if (!address) return fail(res, 404, "Adres bulunamadı");
    const { value, error } = normalizeAddressInput(req.body || {}, { partial: true });
    if (error) return fail(res, 400, error);
    // Birleşik adres bölgesine göre denetlenir; bölge değişiyorsa yeni bölge açık olmalı
    const current = typeof address.toObject === "function" ? address.toObject() : { ...address };
    const merged = { ...current, ...value };
    const problem = await addressProblem(merged, { requireOpen: value.zoneId !== undefined && value.zoneId !== address.zoneId });
    if (problem) return failWith(res, problem);
    const makeDefault = value.isDefault === true;
    delete value.isDefault; // varsayılanlık yalnızca açıkça true ile verilir (kaldırmak için başka adresi varsayılan yapın)
    Object.assign(address, value);
    if (makeDefault) address.isDefault = true;
    await address.save();
    if (makeDefault) await clearOtherDefaults(req.user._id, address._id);

    const addresses = await listFor(req.user._id);
    res.json({ address: addresses.find((a) => String(a._id) === String(address._id)), addresses });
  } catch (error) {
    if (error?.name === "ValidationError") return fail(res, 400, Object.values(error.errors || {})[0]?.message || "Adres bilgileri geçersiz");
    return serverError(res, "Adres güncellenemedi", error);
  }
};

export const deleteAddress = async (req, res) => {
  skipAudit(req);
  try {
    const address = await findOwn(req);
    if (!address) return fail(res, 404, "Adres bulunamadı");
    await UserAddress.deleteOne({ _id: address._id, user: req.user._id });
    if (address.isDefault) {
      const next = await UserAddress.findOne({ user: req.user._id }).sort({ updatedAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    res.json({ success: true, deletedId: address._id, addresses: await listFor(req.user._id) });
  } catch (error) {
    return serverError(res, "Adres silinemedi", error);
  }
};

export const setDefaultAddress = async (req, res) => {
  skipAudit(req);
  try {
    const address = await findOwn(req);
    if (!address) return fail(res, 404, "Adres bulunamadı");
    if (!address.isDefault) {
      address.isDefault = true;
      await address.save();
    }
    await clearOtherDefaults(req.user._id, address._id);
    const addresses = await listFor(req.user._id);
    res.json({ address: addresses.find((a) => String(a._id) === String(address._id)), addresses });
  } catch (error) {
    return serverError(res, "Varsayılan adres ayarlanamadı", error);
  }
};
