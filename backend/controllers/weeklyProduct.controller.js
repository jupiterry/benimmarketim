// Haftalık fırsatlar. Müşteri uygulaması yalnızca GET / ucunu kullanır (alanlar yalnızca eklenir).
// Planlı fırsat: isActive:false + scheduled:true + ileri bir startDate. Müşteri uçları isActive:true kayıtları
// okuduğu için başlayana kadar görünmez; weeklyPrice.service dakikalık işi başlangıçta yayına alır.
// Aynı ürünün en fazla bir aktif kaydı olabilir (tekil kısmi indeks); planlı aralıklar birbiriyle ve yayındaki
// fırsatla çakışamaz (findWeeklyConflict). Tüm yazmalar runWeeklyWrite sırasında çalışır.
// İndirim yüzdesi her okumada ürünün güncel liste fiyatından hesaplanır (kayıttaki alan bayatlayabilir).
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Product from "../models/product.model.js";
import {
  WEEKLY_ROUNDING,
  carryOverDealPrice,
  findWeeklyConflict,
  invalidateWeeklyPriceCache,
  runWeeklyWrite,
  serializeWeeklyDeal,
  weeklyDiscountPercent,
  withLiveDiscount,
} from "../services/weeklyPrice.service.js";
import { activeWeeklyFilter, isWeeklyDealLive, roundMoney, toKurus } from "../services/productPricing.js";
import { money, recordAdminAction } from "../services/adminAudit.service.js";

export const EXPIRED_ACTIVATE_MESSAGE = "Bu fırsatın bitiş tarihi geçmiş. Yayına almak için yeni bir bitiş tarihi seçin.";
export const PLANNED_TOGGLE_MESSAGE = "Planlı fırsat başlangıç zamanında kendiliğinden yayına girer. Hemen başlatmak için düzenleyip başlangıcı \"Şimdi\" seçin.";
export const ALREADY_LIVE_MESSAGE = "Bu ürün zaten haftalık ürünler listesinde";
export const OTHER_LIVE_MESSAGE = "Bu ürünün yayında başka bir fırsatı var. Önce onu durdurun.";
export const WEEKLY_COPY_MAX = 100;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AHEAD_MS = 366 * DAY_MS; // başlangıç en fazla bir yıl sonra, aralık en fazla bir yıl
const MAX_PRICE = 1_000_000;
const MAX_ORDER = 1_000_000;
const ADMIN_PRODUCT_SELECT = "name price image thumbnail category description isOutOfStock isHidden isDiscounted discountedPrice";
const PUBLIC_PRODUCT_SELECT = "name price image thumbnail category description isOutOfStock isDiscounted discountedPrice";
const INVALID = Symbol("invalid");
const NOW = Symbol("now");
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const isId = (value) => typeof value === "string" && OBJECT_ID.test(value);

const isPast = (value, now = new Date()) => {
  if (value === null || value === undefined || value === "") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date <= now;
};

const TR_WHEN = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** "9 Kas 00:00" (İstanbul); boşsa "süresiz" */
const when = (value) => {
  if (value === null || value === undefined || value === "") return "süresiz";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "süresiz" : TR_WHEN.format(date);
};
const rangeText = (start, end) => `${when(start)} – ${when(end)}`;

// ── Girdi ayrıştırma ──────────────────────────────────────────────────────
/** undefined: alan yok · null: boş (süresiz) · Date · INVALID */
const parseDate = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return INVALID;
  if (typeof value === "string" && value.length > 40) return INVALID;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? INVALID : date;
};
/** Başlangıç: undefined (alan yok) · NOW ("now", boş) · Date · INVALID */
const parseStart = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === "now") return NOW;
  return parseDate(value);
};
const parsePrice = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "" || typeof value === "boolean" || typeof value === "object") return INVALID;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_PRICE ? roundMoney(n) : INVALID;
};
const parseOrder = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "" || typeof value === "boolean" || typeof value === "object") return INVALID;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= MAX_ORDER ? Math.round(n) : INVALID;
};

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** Çakışma yanıtı (409): code ve çakışan kaydın tarihleri; panel buna göre düzeltme önerir */
const conflictMessage = (conflict) => {
  const { code, deal } = conflict;
  if (code === "PLANNED_OVERLAP") return `Bu ürünün ${rangeText(deal.startDate, deal.endDate)} tarihli planlı fırsatı var; tarihler çakışıyor.`;
  if (code === "LIVE_OVERLAP") {
    return `Bu ürün şu an yayında (bitiş: ${when(deal.endDate)}). Planlı fırsat başlamadan önce mevcut fırsat bitmeli.`;
  }
  return ALREADY_LIVE_MESSAGE;
};
const sendConflict = (res, conflict, { status = 409, message = conflictMessage(conflict) } = {}) => fail(res, status, message, {
  code: conflict.code,
  conflict: { _id: String(conflict.deal._id), startDate: conflict.deal.startDate ?? null, endDate: conflict.deal.endDate ?? null },
});
const isDuplicateKey = (error) => error?.code === 11000;

const emitUpdated = (req) => {
  const io = req.app?.get?.("io");
  if (io) io.emit("weeklyProductsUpdated");
};

const auditWeekly = (req, product, action, changes = []) =>
  recordAdminAction(req, { action, category: "campaign", target: String(product?._id || product || ""), targetName: product?.name || "Haftalık fırsat", changes });

/** Ürünün diğer aktif/planlı kayıtları (çakışma denetimi için) */
const otherDealsOf = (productId, excludeId = null) => WeeklyProduct.find({
  product: productId,
  ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  $or: [{ isActive: true }, { scheduled: true }],
}).select("_id product isActive scheduled startDate endDate").lean();

const loadAdminDeal = async (id) => {
  const deal = await WeeklyProduct.findById(id).populate({ path: "product", select: ADMIN_PRODUCT_SELECT }).lean();
  return deal ? serializeWeeklyDeal(deal) : null;
};

/**
 * Yayındaki fırsatla çakışmayı istenirse giderir: planlı fırsat için yayındakinin bitişi başlangıca çekilir,
 * hemen başlayacak fırsat için yayındaki şimdi kapatılır. Koşullu güncelleme: kayıt bu arada değiştiyse
 * dokunulmaz. @returns {{ deal, from, to } | null}
 */
const endRunningDeal = async (deal, { planned, start, now }) => {
  const at = planned ? start : now;
  const update = planned ? { endDate: at } : { endDate: at, isActive: false };
  const result = await WeeklyProduct.updateOne({ _id: deal._id, isActive: true }, { $set: update });
  const changed = Number(result?.modifiedCount ?? result?.nModified ?? 0) > 0;
  return changed ? { deal, from: deal.endDate ?? null, to: at } : null;
};

/** endRunningDeal'i geri alır: yeni fırsat kaydedilemezse yayındaki fırsat eski hâline döner */
const restoreRunningDeal = async (ended, { planned }) => {
  if (!ended) return;
  try {
    await WeeklyProduct.updateOne({ _id: ended.deal._id }, { $set: { endDate: ended.from, ...(planned ? {} : { isActive: true }) } });
  } catch (error) {
    console.error(`Haftalık fırsat ${ended.deal._id} eski hâline döndürülemedi:`, error.message);
  }
};

// ── Okuma ─────────────────────────────────────────────────────────────────

/**
 * Şu an geçerli haftalık ürünleri getir (Public API). Başlamamış (planlı dahil) ya da süresi dolmuş fırsat
 * dönmez. discountPercentage ürünün güncel liste fiyatından hesaplanır.
 */
export const getWeeklyProducts = async (req, res) => {
  try {
    const now = new Date();
    const weeklyProducts = await WeeklyProduct.find(activeWeeklyFilter(now))
      .populate({
        path: "product",
        select: PUBLIC_PRODUCT_SELECT,
        match: { isHidden: { $ne: true } }
      })
      .sort({ order: 1, createdAt: -1 });

    // Null olan product'ları filtrele (silinmiş veya gizli ürünler); tarih denetimi ikinci emniyet
    const validProducts = weeklyProducts.filter(wp => wp.product !== null && isWeeklyDealLive(wp, now)).map(withLiveDiscount);

    res.json({
      success: true,
      weeklyProducts: validProducts,
    });
  } catch (error) {
    console.error("Haftalık ürünler alınırken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürünler alınırken hata oluştu",
      error: error.message,
    });
  }
};

/**
 * Admin için tüm haftalık ürünleri getir (yayında, planlı, durdurulmuş, biten). Her kayıtta güncel yüzde,
 * fiyat belirlendiğindeki yüzde (startDiscountPercentage) ve planlı bayrağı; serverTime panelin saat farkı için.
 */
export const getAllWeeklyProducts = async (req, res) => {
  try {
    const weeklyProducts = await WeeklyProduct.find()
      .populate({ path: "product", select: ADMIN_PRODUCT_SELECT })
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      weeklyProducts: (weeklyProducts || []).map(serializeWeeklyDeal),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Tüm haftalık ürünler alınırken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürünler alınırken hata oluştu",
      error: error.message,
    });
  }
};

// ── Ekleme / planlama ─────────────────────────────────────────────────────

/**
 * Yeni haftalık fırsat (Admin). startDate yok/"now": hemen yayında; ileri bir tarih: planlı.
 * body: { productId, weeklyPrice, startDate?, endDate?, order?, endLiveAtStart? }
 * endLiveAtStart: ürünün yayındaki fırsatı planlı başlangıçtan sonra bitiyorsa bitişi başlangıca çekilir
 * (hemen başlayan fırsatta yayındaki şimdi kapatılır). Yoksa 409 ve code döner.
 */
export const addWeeklyProduct = (req, res) => runWeeklyWrite(async () => {
  try {
    const body = req.body || {};
    const { productId } = body;
    if (!isId(productId)) return fail(res, 400, "Geçersiz ürün");
    const weeklyPrice = parsePrice(body.weeklyPrice);
    if (weeklyPrice === undefined || weeklyPrice === INVALID) return fail(res, 400, "Geçerli bir fırsat fiyatı girin");
    const startInput = parseStart(body.startDate);
    if (startInput === INVALID) return fail(res, 400, "Geçersiz başlangıç tarihi");
    const endInput = parseDate(body.endDate);
    if (endInput === INVALID) return fail(res, 400, "Geçersiz bitiş tarihi");
    const order = parseOrder(body.order);
    if (order === INVALID) return fail(res, 400, "Geçersiz sıra");

    // Ürün var mı kontrol et
    const product = await Product.findById(productId).select("name price isHidden isOutOfStock").lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Ürün bulunamadı",
      });
    }

    const now = new Date();
    const planned = startInput instanceof Date && startInput > now;
    const start = planned ? startInput : now;
    const end = endInput ?? null;
    if (planned && start.getTime() - now.getTime() > MAX_AHEAD_MS) return fail(res, 400, "Başlangıç en fazla bir yıl sonrası olabilir");
    if (isPast(end, now)) return fail(res, 400, "Bitiş tarihi geçmiş olamaz");
    if (end && end <= start) return fail(res, 400, "Bitiş, başlangıçtan sonra olmalı");
    if (end && end.getTime() - start.getTime() > MAX_AHEAD_MS) return fail(res, 400, "Fırsat en fazla bir yıl sürebilir");

    const list = Number(product.price);
    if (!(list > 0)) return fail(res, 400, "Ürünün liste fiyatı yok; fırsat eklenemez");
    if (toKurus(weeklyPrice) >= toKurus(list)) return fail(res, 400, `Fırsat fiyatı liste fiyatından (${money(list)}) düşük olmalı`);

    let others = await otherDealsOf(productId);
    // Süresi dolmuş ama zamanlayıcının henüz kapatmadığı kayıt yeni fırsatı engellemez: kapatılır
    let closedStale = false;
    for (const deal of others) {
      if (deal.isActive === true && isPast(deal.endDate, now)) {
        await WeeklyProduct.updateOne({ _id: deal._id, isActive: true }, { $set: { isActive: false } });
        closedStale = true;
      }
    }
    if (closedStale) others = others.filter((deal) => !(deal.isActive === true && isPast(deal.endDate, now)));

    const candidate = { start, end, planned };
    let conflict = findWeeklyConflict(candidate, others, now);
    let endedLive = null;
    if (conflict && conflict.code !== "PLANNED_OVERLAP" && body.endLiveAtStart === true) {
      endedLive = await endRunningDeal(conflict.deal, { planned, start, now });
      if (!endedLive) return fail(res, 409, "Ürünün yayındaki fırsatı bu sırada değişti. Listeyi yenileyip tekrar deneyin.");
      others = others.filter((deal) => String(deal._id) !== String(conflict.deal._id));
      conflict = findWeeklyConflict(candidate, others, now);
    }
    if (conflict) {
      if (closedStale) invalidateWeeklyPriceCache();
      // Ürün zaten yayındaysa eskisi gibi 400 döner
      return sendConflict(res, conflict, conflict.code === "ALREADY_LIVE" ? { status: 400 } : undefined);
    }

    const percent = weeklyDiscountPercent(list, weeklyPrice);
    let weeklyProduct;
    try {
      weeklyProduct = await WeeklyProduct.create({
        product: productId,
        weeklyPrice,
        discountPercentage: percent,
        listPriceAtStart: roundMoney(list),
        startDate: start,
        endDate: end,
        order: order ?? 0,
        isActive: !planned,
        scheduled: planned,
      });
    } catch (error) {
      await restoreRunningDeal(endedLive, { planned });
      if (closedStale || endedLive) invalidateWeeklyPriceCache();
      if (!isDuplicateKey(error)) throw error;
      return fail(res, 400, ALREADY_LIVE_MESSAGE, { code: "ALREADY_LIVE" });
    }
    if (!planned || closedStale || endedLive) invalidateWeeklyPriceCache();
    auditWeekly(req, product, planned ? "Haftalık fırsat planlandı" : "Haftalık fırsata eklendi", [
      { label: "Haftalık fiyat", from: money(list), to: `${money(weeklyPrice)}${percent ? ` (%${percent})` : ""}` },
      planned && { label: "Başlangıç", from: "—", to: when(start) },
      (planned || end) && { label: "Bitiş", from: "—", to: when(end) },
      endedLive && { label: "Yayındaki fırsatın bitişi", from: when(endedLive.from), to: when(endedLive.to) },
    ].filter(Boolean));

    const populatedProduct = await loadAdminDeal(weeklyProduct._id);
    emitUpdated(req);

    res.status(201).json({
      success: true,
      message: planned ? "Haftalık fırsat planlandı" : "Haftalık ürün eklendi",
      weeklyProduct: populatedProduct,
    });
  } catch (error) {
    console.error("Haftalık ürün eklenirken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün eklenirken hata oluştu",
      error: error.message,
    });
  }
});

// ── Düzenleme ─────────────────────────────────────────────────────────────

/**
 * Haftalık ürünü güncelle (Admin).
 * body: { weeklyPrice?, endDate?, order?, isActive?, startDate? (yalnızca planlıda; "now" hemen başlatır),
 *         acknowledgeListPrice? (liste fiyatı değişikliği uyarısını kapatır), endLiveAtStart? }
 * Fiyat değişince listPriceAtStart güncel liste fiyatı olur (uyarı kalkar). Yalnızca sıra değişikliği
 * (sürükle-bırak) hiçbir denetime takılmaz.
 */
export const updateWeeklyProduct = (req, res) => runWeeklyWrite(async () => {
  try {
    const { id } = req.params;
    if (!isId(id)) return fail(res, 400, "Geçersiz fırsat kimliği");
    const body = req.body || {};
    const weeklyPrice = parsePrice(body.weeklyPrice);
    if (weeklyPrice === INVALID) return fail(res, 400, "Geçerli bir fırsat fiyatı girin");
    const endInput = parseDate(body.endDate);
    if (endInput === INVALID) return fail(res, 400, "Geçersiz bitiş tarihi");
    const startInput = parseStart(body.startDate);
    if (startInput === INVALID) return fail(res, 400, "Geçersiz başlangıç tarihi");
    const order = parseOrder(body.order);
    if (order === INVALID) return fail(res, 400, "Geçersiz sıra");
    if (body.isActive !== undefined && typeof body.isActive !== "boolean") return fail(res, 400, "Geçersiz durum");
    const acknowledge = body.acknowledgeListPrice === true;

    const weeklyProduct = await WeeklyProduct.findById(id).populate("product");
    if (!weeklyProduct) {
      return res.status(404).json({
        success: false,
        message: "Haftalık ürün bulunamadı",
      });
    }

    const now = new Date();
    const product = weeklyProduct.product || null;
    const list = Number(product?.price) > 0 ? Number(product.price) : null;
    const wasPlanned = weeklyProduct.scheduled === true;

    if (startInput !== undefined && !wasPlanned) {
      return fail(res, 400, "Yayındaki ya da biten fırsatın başlangıcı değiştirilemez. Yeni dönem için fırsatı kopyalayın.");
    }
    if (wasPlanned && body.isActive === true) return fail(res, 400, PLANNED_TOGGLE_MESSAGE);

    // Süresi dolmuş fırsat yayına alınamaz (zamanlayıcı bir dakika içinde yeniden kapatırdı); yalnızca
    // sıralama gibi isActive/endDate göndermeyen düzenlemeler engellenmez
    const nextEndDate = endInput !== undefined ? endInput : (weeklyProduct.endDate ?? null);
    const nextActive = wasPlanned ? false : (body.isActive ?? weeklyProduct.isActive);
    if (!wasPlanned && nextActive && (body.isActive === true || endInput !== undefined) && isPast(nextEndDate, now)) {
      return fail(res, 400, EXPIRED_ACTIVATE_MESSAGE);
    }

    // Fiyat yalnızca değişiyorsa denetlenir (form fiyatı her kayıtta aynen gönderir)
    const priceChanged = weeklyPrice !== undefined && toKurus(weeklyPrice) !== toKurus(weeklyProduct.weeklyPrice);
    if ((priceChanged || acknowledge) && !list) {
      return fail(res, 400, "Ürün silinmiş ya da liste fiyatı yok; fırsat fiyatı değiştirilemez");
    }
    if (priceChanged && toKurus(weeklyPrice) >= toKurus(list)) {
      return fail(res, 400, `Fırsat fiyatı liste fiyatından (${money(list)}) düşük olmalı`);
    }

    // Planlı fırsatın tarihleri
    let nextStart = weeklyProduct.startDate ?? null;
    let goLiveNow = false;
    if (wasPlanned && startInput !== undefined) {
      if (startInput === NOW || startInput <= now) {
        goLiveNow = true;
        nextStart = now;
      } else {
        if (startInput.getTime() - now.getTime() > MAX_AHEAD_MS) return fail(res, 400, "Başlangıç en fazla bir yıl sonrası olabilir");
        nextStart = startInput;
      }
    }
    if (wasPlanned && (startInput !== undefined || endInput !== undefined)) {
      if (isPast(nextEndDate, now)) return fail(res, 400, "Bitiş tarihi geçmiş olamaz");
      if (nextEndDate && nextStart && new Date(nextEndDate) <= new Date(nextStart)) return fail(res, 400, "Bitiş, başlangıçtan sonra olmalı");
      if (nextEndDate && nextStart && new Date(nextEndDate) - new Date(nextStart) > MAX_AHEAD_MS) return fail(res, 400, "Fırsat en fazla bir yıl sürebilir");
    }
    if (goLiveNow && !product) return fail(res, 400, "Ürün silinmiş; fırsat yayına alınamaz");

    // Çakışma: tarihler ya da yayın durumu değişiyorsa (yalnızca sıra/fiyat değişikliğinde sorgu yok)
    const reactivating = !wasPlanned && body.isActive === true && !weeklyProduct.isActive;
    const datesChange = wasPlanned ? (startInput !== undefined || endInput !== undefined) : (nextActive && endInput !== undefined);
    let endedLive = null;
    if (datesChange || reactivating) {
      // Ürün silinmişse populate alanı null olur; asıl kimlik populated() ile okunur
      const productId = product?._id ?? weeklyProduct.populated?.("product") ?? weeklyProduct.product;
      let others = await otherDealsOf(productId, weeklyProduct._id);
      const planned = wasPlanned && !goLiveNow;
      const candidate = { id: weeklyProduct._id, start: planned ? nextStart : now, end: nextEndDate, planned };
      let conflict = findWeeklyConflict(candidate, others, now);
      if (conflict && conflict.code !== "PLANNED_OVERLAP" && body.endLiveAtStart === true) {
        endedLive = await endRunningDeal(conflict.deal, { planned, start: candidate.start, now });
        if (!endedLive) return fail(res, 409, "Ürünün yayındaki fırsatı bu sırada değişti. Listeyi yenileyip tekrar deneyin.");
        others = others.filter((deal) => String(deal._id) !== String(conflict.deal._id));
        conflict = findWeeklyConflict(candidate, others, now);
      }
      if (conflict) {
        if (endedLive) invalidateWeeklyPriceCache();
        return sendConflict(res, conflict, conflict.code === "ALREADY_LIVE" ? { message: OTHER_LIVE_MESSAGE } : undefined);
      }
    }

    const before = {
      weeklyPrice: weeklyProduct.weeklyPrice,
      isActive: weeklyProduct.isActive,
      startDate: weeklyProduct.startDate ?? null,
      endDate: weeklyProduct.endDate ?? null,
      listPriceAtStart: weeklyProduct.listPriceAtStart ?? null,
    };
    if (priceChanged) weeklyProduct.weeklyPrice = weeklyPrice;
    // Fiyat değiştiyse (ya da uyarı kapatıldıysa) yeni dayanak bugünkü liste fiyatıdır
    if (priceChanged || acknowledge) {
      weeklyProduct.listPriceAtStart = roundMoney(list);
      weeklyProduct.discountPercentage = weeklyDiscountPercent(list, weeklyProduct.weeklyPrice);
    }
    if (endInput !== undefined) weeklyProduct.endDate = endInput;
    if (order !== undefined) weeklyProduct.order = order;
    if (wasPlanned) {
      weeklyProduct.startDate = nextStart;
      if (goLiveNow) {
        weeklyProduct.isActive = true;
        weeklyProduct.scheduled = false;
      }
    } else if (body.isActive !== undefined) {
      weeklyProduct.isActive = body.isActive;
    }

    try {
      await weeklyProduct.save();
    } catch (error) {
      await restoreRunningDeal(endedLive, { planned: wasPlanned && !goLiveNow });
      if (endedLive) invalidateWeeklyPriceCache();
      if (!isDuplicateKey(error)) throw error;
      return fail(res, 409, OTHER_LIVE_MESSAGE, { code: "ALREADY_LIVE" });
    }
    invalidateWeeklyPriceCache();
    const statusLabel = (active, scheduled) => (scheduled ? "Planlı" : active ? "Yayında" : "Pasif");
    auditWeekly(req, product || weeklyProduct.product, wasPlanned && !goLiveNow ? "Planlı haftalık fırsat düzenlendi" : "Haftalık fırsat düzenlendi", [
      priceChanged && { label: "Haftalık fiyat", from: money(before.weeklyPrice), to: money(weeklyProduct.weeklyPrice) },
      before.isActive !== weeklyProduct.isActive && {
        label: "Durum",
        from: statusLabel(before.isActive, wasPlanned),
        to: statusLabel(weeklyProduct.isActive, weeklyProduct.scheduled === true),
      },
      wasPlanned && String(when(before.startDate)) !== String(when(weeklyProduct.startDate)) && { label: "Başlangıç", from: when(before.startDate), to: when(weeklyProduct.startDate) },
      endInput !== undefined && when(before.endDate) !== when(weeklyProduct.endDate) && { label: "Bitiş", from: when(before.endDate), to: when(weeklyProduct.endDate) },
      acknowledge && !priceChanged && { label: "Liste fiyatı uyarısı", from: money(before.listPriceAtStart), to: `${money(list)} (fiyat aynı kaldı)` },
      endedLive && { label: "Yayındaki fırsatın bitişi", from: when(endedLive.from), to: when(endedLive.to) },
    ].filter(Boolean));

    const updatedProduct = await loadAdminDeal(id);
    emitUpdated(req);

    res.json({
      success: true,
      message: "Haftalık ürün güncellendi",
      weeklyProduct: updatedProduct,
    });
  } catch (error) {
    console.error("Haftalık ürün güncellenirken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün güncellenirken hata oluştu",
      error: error.message,
    });
  }
});

// ── Kaldırma / iptal ──────────────────────────────────────────────────────

/**
 * Haftalık ürünü kaldır (Admin). Planlı fırsatta bu işlem planı iptal eder.
 */
export const removeWeeklyProduct = (req, res) => runWeeklyWrite(async () => {
  try {
    const { id } = req.params;
    if (!isId(id)) return fail(res, 400, "Geçersiz fırsat kimliği");

    const weeklyProduct = await WeeklyProduct.findByIdAndDelete(id).populate("product", "name");
    if (!weeklyProduct) {
      return res.status(404).json({
        success: false,
        message: "Haftalık ürün bulunamadı",
      });
    }
    invalidateWeeklyPriceCache();
    const wasPlanned = weeklyProduct.scheduled === true;
    auditWeekly(req, weeklyProduct.product, wasPlanned ? "Planlı haftalık fırsat iptal edildi" : "Haftalık fırsattan çıkarıldı", [
      { label: "Haftalık fiyat", from: money(weeklyProduct.weeklyPrice), to: "—" },
      wasPlanned && { label: "Planlanan dönem", from: rangeText(weeklyProduct.startDate, weeklyProduct.endDate), to: "İptal" },
    ].filter(Boolean));

    emitUpdated(req);

    res.json({
      success: true,
      message: wasPlanned ? "Planlı fırsat iptal edildi" : "Haftalık ürün kaldırıldı",
    });
  } catch (error) {
    console.error("Haftalık ürün kaldırılırken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün kaldırılırken hata oluştu",
      error: error.message,
    });
  }
});

// ── Yayına al / durdur ────────────────────────────────────────────────────

/**
 * Haftalık ürün durumunu toggle et (Admin). Planlı fırsat bu uçla açılmaz; yeniden yayına alınan fırsat
 * ürünün planlı fırsatıyla çakışamaz.
 */
export const toggleWeeklyProductStatus = (req, res) => runWeeklyWrite(async () => {
  try {
    const { id } = req.params;
    if (!isId(id)) return fail(res, 400, "Geçersiz fırsat kimliği");

    const weeklyProduct = await WeeklyProduct.findById(id);
    if (!weeklyProduct) {
      return res.status(404).json({
        success: false,
        message: "Haftalık ürün bulunamadı",
      });
    }

    if (weeklyProduct.scheduled === true) return fail(res, 400, PLANNED_TOGGLE_MESSAGE);
    if (!weeklyProduct.isActive && isPast(weeklyProduct.endDate)) {
      return res.status(400).json({ success: false, message: EXPIRED_ACTIVATE_MESSAGE });
    }

    if (!weeklyProduct.isActive) {
      const now = new Date();
      const others = await otherDealsOf(weeklyProduct.product, weeklyProduct._id);
      const conflict = findWeeklyConflict({ id: weeklyProduct._id, start: now, end: weeklyProduct.endDate ?? null, planned: false }, others, now);
      if (conflict) return sendConflict(res, conflict, conflict.code === "ALREADY_LIVE" ? { message: OTHER_LIVE_MESSAGE } : undefined);
    }

    weeklyProduct.isActive = !weeklyProduct.isActive;
    try {
      await weeklyProduct.save();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return fail(res, 409, OTHER_LIVE_MESSAGE, { code: "ALREADY_LIVE" });
    }
    invalidateWeeklyPriceCache();
    const toggledProduct = await Product.findById(weeklyProduct.product).select("name").lean();
    auditWeekly(req, toggledProduct || weeklyProduct.product, weeklyProduct.isActive ? "Haftalık fırsat yayına alındı" : "Haftalık fırsat durduruldu",
      [{ label: "Durum", from: weeklyProduct.isActive ? "Pasif" : "Yayında", to: weeklyProduct.isActive ? "Yayında" : "Pasif" }]);

    const updatedProduct = await loadAdminDeal(id);
    emitUpdated(req);

    res.json({
      success: true,
      message: `Haftalık ürün ${weeklyProduct.isActive ? "aktif" : "pasif"} edildi`,
      weeklyProduct: updatedProduct,
    });
  } catch (error) {
    console.error("Haftalık ürün durumu değiştirilirken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık ürün durumu değiştirilirken hata oluştu",
      error: error.message,
    });
  }
});

// ── Yeni haftaya kopyalama ────────────────────────────────────────────────

const SKIP = {
  missing: "Fırsat bulunamadı",
  deleted: "Ürün silinmiş",
  duplicate: "Aynı ürün listede bir kez daha var",
  hidden: "Ürün gizli",
  outOfStock: "Stokta yok",
  noPrice: "Liste fiyatı yok",
  noDiscount: "İndirim hesaplanamadı (fırsat fiyatı liste fiyatından düşük değil)",
  planned: "Bu tarihlerde planlı fırsatı var",
  live: "Ürünün yayındaki fırsatı yeni başlangıçtan sonra bitiyor",
  liveNow: "Ürün şu an yayında",
  liveChanged: "Ürünün yayındaki fırsatı bu sırada değişti",
  failed: "Kaydedilemedi",
};

/**
 * Seçilen fırsatları yeni bir döneme kopyalar (Admin). Her ürün için önceki fırsatın indirim oranı
 * GÜNCEL liste fiyatına uygulanır (kuruşa; rounding "90"/"50" ise ,90/,50'ye yuvarlanır).
 * body: { ids: [≤100], startDate ("now" ya da tarih), endDate, rounding?: "none"|"90"|"50",
 *         includeUnavailable?: gizli/stokta olmayan ürünler de kopyalansın, endLiveAtStart?: yayındaki fırsatın
 *         bitişi yeni başlangıca çekilsin (başlangıç şimdiyse yayındaki kapatılır) }
 * Dönüş: { created: [fırsat], skipped: [{ id, productName, reason }] }
 * Başlangıç ileride: planlı fırsat oluşur; geçmişte/şimdi: hemen yayında.
 */
export const copyWeeklyProducts = (req, res) => runWeeklyWrite(async () => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.ids) || body.ids.length === 0) return fail(res, 400, "Kopyalanacak fırsatları seçin");
    if (body.ids.length > WEEKLY_COPY_MAX) return fail(res, 400, `Tek seferde en fazla ${WEEKLY_COPY_MAX} fırsat kopyalanabilir`);
    if (!body.ids.every(isId)) return fail(res, 400, "Geçersiz fırsat kimliği");
    const ids = [...new Set(body.ids.map((id) => id.toLowerCase()))];
    const rounding = body.rounding === undefined || body.rounding === null || body.rounding === "" ? "none" : body.rounding;
    if (!WEEKLY_ROUNDING.includes(rounding)) return fail(res, 400, "Geçersiz yuvarlama seçeneği");
    const startInput = parseStart(body.startDate);
    if (startInput === undefined || startInput === INVALID) return fail(res, 400, "Geçerli bir başlangıç tarihi seçin");
    const endInput = parseDate(body.endDate);
    if (!(endInput instanceof Date)) return fail(res, 400, "Geçerli bir bitiş tarihi seçin");
    const includeUnavailable = body.includeUnavailable === true;
    const endLiveAtStart = body.endLiveAtStart === true;

    const now = new Date();
    const planned = startInput instanceof Date && startInput > now;
    const start = planned ? startInput : now;
    const end = endInput;
    if (planned && start.getTime() - now.getTime() > MAX_AHEAD_MS) return fail(res, 400, "Başlangıç en fazla bir yıl sonrası olabilir");
    if (end <= now) return fail(res, 400, "Bitiş tarihi geçmiş olamaz");
    if (end <= start) return fail(res, 400, "Bitiş, başlangıçtan sonra olmalı");
    if (end.getTime() - start.getTime() > MAX_AHEAD_MS) return fail(res, 400, "Fırsat en fazla bir yıl sürebilir");

    const sources = await WeeklyProduct.find({ _id: { $in: ids } })
      .populate({ path: "product", select: "name price isHidden isOutOfStock" })
      .lean();
    const byId = new Map((sources || []).map((deal) => [String(deal._id), deal]));
    const productIds = [...new Set((sources || []).filter((deal) => deal.product?._id).map((deal) => String(deal.product._id)))];
    const existing = productIds.length
      ? await WeeklyProduct.find({ product: { $in: productIds }, $or: [{ isActive: true }, { scheduled: true }] })
        .select("_id product isActive scheduled startDate endDate").lean()
      : [];
    // Hemen başlayan kopyada süresi dolmuş ama zamanlayıcının henüz kapatmadığı kayıt engel olmasın
    let closedStale = false;
    if (!planned && productIds.length) {
      const stale = await WeeklyProduct.updateMany(
        { product: { $in: productIds }, isActive: true, endDate: { $ne: null, $lte: now } },
        { $set: { isActive: false } }
      );
      closedStale = Number(stale?.modifiedCount ?? stale?.nModified ?? 0) > 0;
    }
    const dealsByProduct = new Map();
    for (const deal of existing || []) {
      const key = String(deal.product);
      if (!dealsByProduct.has(key)) dealsByProduct.set(key, []);
      dealsByProduct.get(key).push(deal);
    }

    const skipped = [];
    const createdIds = [];
    const createdNames = [];
    const endedLive = [];
    const seenProducts = new Set();
    const skip = (id, productName, reason) => skipped.push({ id, productName: productName || "—", reason });

    for (const id of ids) {
      const source = byId.get(id);
      if (!source) { skip(id, "", SKIP.missing); continue; }
      const product = source.product;
      if (!product?._id) { skip(id, "", SKIP.deleted); continue; }
      const productKey = String(product._id);
      const name = product.name || "Ürün";
      if (seenProducts.has(productKey)) { skip(id, name, SKIP.duplicate); continue; }
      seenProducts.add(productKey);
      if (!includeUnavailable && product.isHidden === true) { skip(id, name, SKIP.hidden); continue; }
      if (!includeUnavailable && product.isOutOfStock === true) { skip(id, name, SKIP.outOfStock); continue; }
      const list = Number(product.price);
      if (!(list > 0)) { skip(id, name, SKIP.noPrice); continue; }
      const next = carryOverDealPrice(source, list, rounding);
      if (!next) { skip(id, name, SKIP.noDiscount); continue; }

      const others = (dealsByProduct.get(productKey) || []).filter((deal) => !(deal.isActive === true && isPast(deal.endDate, now)));
      const candidate = { start, end, planned };
      const conflict = findWeeklyConflict(candidate, others, now);
      if (conflict?.code === "PLANNED_OVERLAP") { skip(id, name, SKIP.planned); continue; }
      let ended = null;
      if (conflict) {
        if (!endLiveAtStart) { skip(id, name, planned ? SKIP.live : SKIP.liveNow); continue; }
        ended = await endRunningDeal(conflict.deal, { planned, start, now });
        if (!ended) { skip(id, name, SKIP.liveChanged); continue; }
      }

      try {
        const created = await WeeklyProduct.create({
          product: product._id,
          weeklyPrice: next.price,
          discountPercentage: next.percent,
          listPriceAtStart: roundMoney(list),
          startDate: start,
          endDate: end,
          order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
          isActive: !planned,
          scheduled: planned,
        });
        createdIds.push(created._id);
        createdNames.push(`${name}: ${money(next.price)}`);
        if (ended) {
          endedLive.push({ ...ended, name });
          ended.deal.endDate = ended.to;
          if (!planned) ended.deal.isActive = false;
        }
      } catch (error) {
        await restoreRunningDeal(ended, { planned });
        if (!isDuplicateKey(error)) console.error(`Haftalık fırsat kopyalanamadı (${id}):`, error.message);
        skip(id, name, isDuplicateKey(error) ? SKIP.liveNow : SKIP.failed);
      }
    }

    if (closedStale || endedLive.length || (!planned && createdIds.length)) invalidateWeeklyPriceCache();
    const created = createdIds.length
      ? (await WeeklyProduct.find({ _id: { $in: createdIds } }).populate({ path: "product", select: ADMIN_PRODUCT_SELECT }).sort({ order: 1, createdAt: -1 }).lean() || [])
        .map(serializeWeeklyDeal)
      : [];

    // Hiçbiri oluşturulmasa da işlem kaydı yazılır (genel kayıt yerine sayılarla)
    recordAdminAction(req, {
      action: !createdIds.length
        ? "Haftalık fırsat kopyalama: hiçbiri oluşturulmadı"
        : planned ? "Haftalık fırsatlar yeni döneme planlandı" : "Haftalık fırsatlar kopyalanıp yayına alındı",
      category: "campaign",
      target: "weekly-copy",
      targetName: `${createdIds.length} fırsat`,
      changes: [
        { label: "Dönem", from: "—", to: rangeText(start, end) },
        { label: "Kopyalanan", from: String(ids.length), to: `${createdIds.length} oluşturuldu, ${skipped.length} atlandı` },
        rounding !== "none" && { label: "Yuvarlama", from: "Kuruş", to: `,${rounding}` },
        ...endedLive.slice(0, 5).map((item) => ({ label: `${item.name} yayındaki bitiş`, from: when(item.from), to: when(item.to) })),
        ...createdNames.slice(0, 12).map((text) => ({ label: "Yeni fırsat", from: "—", to: text })),
      ].filter(Boolean),
    });
    if (createdIds.length || endedLive.length || closedStale) emitUpdated(req);

    res.status(createdIds.length ? 201 : 200).json({ success: true, created, skipped });
  } catch (error) {
    console.error("Haftalık fırsatlar kopyalanırken hata:", error.message);
    res.status(500).json({
      success: false,
      message: "Haftalık fırsatlar kopyalanırken hata oluştu",
      error: error.message,
    });
  }
});

