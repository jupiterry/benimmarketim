// Flash sale yaşam döngüsü: kampanya başlayınca indirimi ürüne uygular, bitince (veya
// silinince/kapatılınca) ürünün kampanyadan önceki indirim durumunu geri yükler.
// Sipariş fiyatı ürünün isDiscounted/discountedPrice alanlarından hesaplandığı için
// kampanyanın etkisi tamamen bu alanlar üzerinden olur (bkz. productPricing.js).
// Ürüne ayrıca `flashSale` özeti yazılır; ürün uç noktaları bunu rozet/geri sayım için verir.
// Her uygulama/geri alma ürün önbelleklerini (tüm sunucu süreçlerinde) temizler.
import cron from "node-cron";
import FlashSale from "../models/flashSale.model.js";
import Product from "../models/product.model.js";
import { redis } from "../lib/redis.js";
import { invalidateProductCaches } from "./productCache.service.js";
import { syncWeeklyDealSchedule } from "./weeklyPrice.service.js";

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export const flashPrice = (price, discountPercentage) =>
  round2(Number(price) * (1 - Number(discountPercentage) / 100));

export const isLive = (sale, now = new Date()) =>
  Boolean(sale.isActive) && new Date(sale.startDate) <= now && new Date(sale.endDate) > now;

export const saleStatus = (sale, now = new Date()) => {
  if (!sale.isActive) return "ended";
  if (new Date(sale.endDate) <= now) return "ended";
  if (new Date(sale.startDate) > now) return "upcoming";
  return "active";
};

// İki tarih aralığı çakışıyor mu? [aStart, aEnd) ve [bStart, bEnd)
export const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);

// Eski ürün kayıtlarında zorunlu bir alan eksik olabilir; yalnızca değişen alanlar doğrulanır
// (aksi hâlde tek bir bozuk ürün kampanyanın hiç uygulanmamasına yol açıyordu).
const saveProduct = (product) => product.save({ validateModifiedOnly: true });

const sameSale = (info, sale) => Boolean(info?.sale) && String(info.sale) === String(sale._id);

/** Kampanyayı ürüne uygular; ürünün önceki indirim durumunu kampanyada saklar. */
export const applySale = async (sale) => {
  const product = await Product.findById(sale.product?._id || sale.product);
  if (!product) return false;
  const price = flashPrice(product.price, sale.discountPercentage);
  // Eski kayıtlar oluşturulurken indirim doğrudan uygulanıyordu; ürün zaten kampanya
  // fiyatındaysa bunu "önceki indirim" sanmayalım.
  const alreadyFlash = product.isDiscounted && Math.abs(Number(product.discountedPrice) - price) < 0.01;
  sale.previousIsDiscounted = alreadyFlash ? false : Boolean(product.isDiscounted);
  sale.previousDiscountedPrice = alreadyFlash ? null : (product.discountedPrice ?? null);
  sale.appliedPrice = price;
  sale.applied = true;
  product.isDiscounted = true;
  product.discountedPrice = price;
  product.flashSale = {
    sale: sale._id,
    discountPercentage: Number(sale.discountPercentage),
    price,
    startDate: sale.startDate,
    endDate: sale.endDate,
  };
  await saveProduct(product);
  await sale.save();
  invalidateProductCaches();
  return true;
};

/**
 * Kampanyanın ürüne etkisini geri alır. Ürün fiyatı kampanya sırasında elle değiştirildiyse
 * (indirimli fiyat artık kampanya fiyatı değilse) yöneticinin değişikliğine dokunulmaz.
 */
export const releaseSale = async (sale) => {
  const product = await Product.findById(sale.product?._id || sale.product);
  let changed = false;
  if (product) {
    const expected = sale.appliedPrice ?? flashPrice(product.price, sale.discountPercentage);
    const stillFlash = product.isDiscounted && Math.abs(Number(product.discountedPrice) - Number(expected)) < 0.01;
    if (stillFlash) {
      const prevValid =
        sale.previousIsDiscounted &&
        Number.isFinite(Number(sale.previousDiscountedPrice)) &&
        Number(sale.previousDiscountedPrice) < Number(product.price);
      product.isDiscounted = Boolean(prevValid);
      product.discountedPrice = prevValid ? Number(sale.previousDiscountedPrice) : null;
      changed = true;
    }
    // Kampanya özeti her durumda temizlenir (fiyat elle değiştirilmiş olsa bile rozet kalmasın)
    if (sameSale(product.flashSale, sale)) {
      product.flashSale = null;
      changed = true;
    }
    if (changed) await saveProduct(product);
  }
  sale.applied = false;
  await sale.save();
  invalidateProductCaches();
};

/** Tek kampanyayı şimdiki zamana göre doğru duruma getirir. */
export const syncSale = async (sale, now = new Date()) => {
  const live = isLive(sale, now);
  if (live && !sale.applied) return applySale(sale);
  if (!live && sale.applied) {
    await releaseSale(sale);
    return true;
  }
  return false;
};

/** Tüm kampanyaları senkronlar: başlayanları uygular, bitenleri geri alır ve kapatır. */
export const syncFlashSales = async (now = new Date()) => {
  let applied = 0;
  let released = 0;

  // Tek bir kampanyadaki hata (silinmiş/bozuk ürün) diğerlerinin uygulanmasını engellemez
  const safely = async (sale, fn) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`Flash sale ${sale?._id} senkronlanamadı:`, error.message);
      return false;
    }
  };

  // Bitmiş ya da kapatılmış ama hâlâ ürüne uygulanmış kampanyalar
  const toRelease = await FlashSale.find({
    applied: true,
    $or: [{ endDate: { $lte: now } }, { isActive: false }],
  });
  for (const sale of toRelease) {
    const ok = await safely(sale, async () => {
      await releaseSale(sale);
      if (sale.isActive && new Date(sale.endDate) <= now) {
        sale.isActive = false;
        await sale.save();
      }
      return true;
    });
    if (ok) released++;
  }

  // Eski sürümde oluşturulmuş, süresi dolmuş ama hiç kapatılmamış kampanyalar
  const stale = await FlashSale.find({ applied: { $ne: true }, isActive: true, endDate: { $lte: now } });
  for (const sale of stale) {
    const ok = await safely(sale, async () => {
      const product = await Product.findById(sale.product);
      if (product && product.isDiscounted &&
        Math.abs(Number(product.discountedPrice) - flashPrice(product.price, sale.discountPercentage)) < 0.01) {
        product.isDiscounted = false;
        product.discountedPrice = null;
        if (sameSale(product.flashSale, sale)) product.flashSale = null;
        await saveProduct(product);
        invalidateProductCaches();
      }
      sale.isActive = false;
      await sale.save();
      return true;
    });
    if (ok) released++;
  }

  // Başlama zamanı gelmiş ama henüz uygulanmamış kampanyalar
  const due = await FlashSale.find({
    isActive: true,
    applied: { $ne: true },
    startDate: { $lte: now },
    endDate: { $gt: now },
  });
  for (const sale of due) {
    if (await safely(sale, () => applySale(sale))) applied++;
  }

  return { applied, released };
};

// PM2 cluster'da aynı dakikada tek süreç senkronlar (Redis SET NX). Redis yoksa yerel çalışır.
const LOCK_KEY = "flash-sale:sync:lock";
const LOCK_TTL_SEC = 50;
const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, "TIMEOUT");
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
};

/** Kilitli senkron: başka süreç o an senkronluyorsa atlanır ({ skipped: true }). */
export const syncFlashSalesLocked = async (now = new Date()) => {
  let locked = false;
  try {
    const result = await withTimeout(redis.set(LOCK_KEY, String(process.pid), "EX", LOCK_TTL_SEC, "NX"), 500);
    // Redis yanıt vermezse yine de senkronla: işlemler idempotent (applied bayrağı)
    if (result !== "OK" && result !== "TIMEOUT") return { applied: 0, released: 0, skipped: true };
    locked = result === "OK";
  } catch {
    /* Redis yok: yalnızca bu süreç */
  }
  try {
    return await syncFlashSales(now);
  } finally {
    if (locked) {
      try {
        await withTimeout(redis.del(LOCK_KEY), 500);
      } catch {
        /* kilit süre dolunca kendiliğinden açılır */
      }
    }
  }
};

// Herkese açık /flash-sales/active isteği de (en sık 10 sn'de bir) senkronu tetikler; zamanlayıcı
// bir sebeple çalışmasa bile başlayan kampanya uygulanır, biten geri alınır.
const LAZY_SYNC_MS = 10 * 1000;
let lastLazySync = 0;
let lazyPending = null;
export const ensureFlashSalesSynced = async () => {
  if (lazyPending) return lazyPending;
  if (Date.now() - lastLazySync < LAZY_SYNC_MS) return null;
  lastLazySync = Date.now();
  lazyPending = syncFlashSalesLocked()
    .catch((error) => {
      console.error("Flash sale senkronu (istek) başarısız:", error.message);
      return null;
    })
    .finally(() => { lazyPending = null; });
  return lazyPending;
};

/** Yalnızca testler için */
export const resetFlashSyncState = () => {
  lastLazySync = 0;
  lazyPending = null;
};

/**
 * Dakikalık zamanlanmış işin tek adımı: flash sale senkronu ve ardından haftalık fırsat takvimi
 * (süresi dolanı kapatır, başlayan/biten olursa ürün önbelleklerini temizler). Biri hata verirse
 * diğeri yine çalışır.
 */
export const runScheduledPricingJob = async (now = new Date()) => {
  let flash = null;
  let weekly = null;
  try {
    flash = await syncFlashSalesLocked(now);
    if (flash?.applied || flash?.released) console.log(`Flash sale senkronu: ${flash.applied} başladı, ${flash.released} bitti`);
  } catch (error) {
    console.error("Flash sale senkronu başarısız:", error.message);
  }
  try {
    weekly = await syncWeeklyDealSchedule(now);
    if (weekly.expired || weekly.started) console.log(`Haftalık fırsat takvimi: ${weekly.started} başladı, ${weekly.expired} süresi doldu`);
  } catch (error) {
    console.error("Haftalık fırsat takvimi senkronu başarısız:", error.message);
  }
  return { flash, weekly };
};

let job = null;
export const startFlashSaleJob = () => {
  if (job) return job;
  const run = () => runScheduledPricingJob();
  run();
  job = cron.schedule("* * * * *", run, { scheduled: true });
  return job;
};
