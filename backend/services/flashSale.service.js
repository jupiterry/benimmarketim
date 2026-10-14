// Flash sale yaşam döngüsü: kampanya başlayınca indirimi ürüne uygular, bitince (veya
// silinince/kapatılınca) ürünün kampanyadan önceki indirim durumunu geri yükler.
// Sipariş fiyatı ürünün isDiscounted/discountedPrice alanlarından hesaplandığı için
// kampanyanın etkisi tamamen bu alanlar üzerinden olur.
import cron from "node-cron";
import FlashSale from "../models/flashSale.model.js";
import Product from "../models/product.model.js";

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
  await product.save();
  await sale.save();
  return true;
};

/**
 * Kampanyanın ürüne etkisini geri alır. Ürün fiyatı kampanya sırasında elle değiştirildiyse
 * (indirimli fiyat artık kampanya fiyatı değilse) yöneticinin değişikliğine dokunulmaz.
 */
export const releaseSale = async (sale) => {
  const product = await Product.findById(sale.product?._id || sale.product);
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
      await product.save();
    }
  }
  sale.applied = false;
  await sale.save();
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

  // Bitmiş ya da kapatılmış ama hâlâ ürüne uygulanmış kampanyalar
  const toRelease = await FlashSale.find({
    applied: true,
    $or: [{ endDate: { $lte: now } }, { isActive: false }],
  });
  for (const sale of toRelease) {
    await releaseSale(sale);
    if (sale.isActive && new Date(sale.endDate) <= now) {
      sale.isActive = false;
      await sale.save();
    }
    released++;
  }

  // Eski sürümde oluşturulmuş, süresi dolmuş ama hiç kapatılmamış kampanyalar
  const stale = await FlashSale.find({ applied: { $ne: true }, isActive: true, endDate: { $lte: now } });
  for (const sale of stale) {
    const product = await Product.findById(sale.product);
    if (product && product.isDiscounted &&
      Math.abs(Number(product.discountedPrice) - flashPrice(product.price, sale.discountPercentage)) < 0.01) {
      product.isDiscounted = false;
      product.discountedPrice = null;
      await product.save();
    }
    sale.isActive = false;
    await sale.save();
    released++;
  }

  // Başlama zamanı gelmiş ama henüz uygulanmamış kampanyalar
  const due = await FlashSale.find({
    isActive: true,
    applied: { $ne: true },
    startDate: { $lte: now },
    endDate: { $gt: now },
  });
  for (const sale of due) {
    if (await applySale(sale)) applied++;
  }

  return { applied, released };
};

let job = null;
export const startFlashSaleJob = () => {
  if (job) return job;
  const run = () =>
    syncFlashSales()
      .then(({ applied, released }) => {
        if (applied || released) console.log(`Flash sale senkronu: ${applied} başladı, ${released} bitti`);
      })
      .catch((error) => console.error("Flash sale senkronu başarısız:", error.message));
  run();
  job = cron.schedule("* * * * *", run, { scheduled: true });
  return job;
};
