// Ürün birim fiyatı için tek kural. Sipariş (order.service), sepet, kupon, teslimat ücreti,
// ürün listeleri (actualPrice) ve yapay zekâ araçları aynı sonucu bu dosyadan alır; böylece
// müşteriye gösterilen fiyat siparişte alınan fiyatla her zaman aynıdır.
//
// Kural: geçerli fiyatların EN DÜŞÜĞÜ uygulanır.
//   - liste fiyatı (price)
//   - ürün indirimi (isDiscounted + discountedPrice < price). Flash sale de buraya yazılır.
//   - haftalık fırsat fiyatı (WeeklyProduct.weeklyPrice)
// Eskiden haftalık fiyat her zaman kazanıyordu; ürün haftalık fırsattayken başlatılan daha
// derin bir flash sale ne uygulamada görünüyor ne de siparişte uygulanıyordu.

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

// ─────────────────────────────────────────────
// Kuruş yuvarlaması
// ─────────────────────────────────────────────
// Fiyatlar ondalıklı sayı olarak toplanınca 38.699999 gibi değerler çıkar; böyle bir sepet
// "minimum 250 TL" denetimine 249.99999 olarak takılabiliyordu. Tüm tutarlar kuruşa yuvarlanır,
// karşılaştırmalar tam sayı kuruş üzerinden yapılır. (1e-7: 1.005 * 100 = 100.4999… hatası)

/** Tutarı tam sayı kuruşa çevirir (geçersiz değer → 0) */
export const toKurus = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7);
};

/** Tutarı 2 ondalığa (kuruşa) yuvarlar: 38.699999 → 38.7, 1.005 → 1.01 */
export const roundMoney = (value) => toKurus(value) / 100;

/** Tutar minimumu karşılıyor mu? Kuruş üzerinden karşılaştırılır (tam 250,00 TL, 250 TL minimumu geçer). 0/boş minimum = yok */
export const meetsMinimumAmount = (amount, minimum) => {
  const min = Number(minimum);
  if (!Number.isFinite(min) || min <= 0) return true;
  return toKurus(amount) >= toKurus(min);
};

// ─────────────────────────────────────────────
// Haftalık fırsat geçerliliği
// ─────────────────────────────────────────────
// Haftalık fırsatın startDate/endDate alanları eskiden hiç okunmuyordu: süresi dolan fırsat,
// yönetici elle durdurana kadar haftalık fiyatla satılıyordu. Haftalık fiyatın okunduğu her yer
// (sipariş, sepet, ürün listeleri, haftalık raf, yapay zekâ, bildirim taslağı) bu filtreyi kullanır.
// Eksik startDate/endDate: sınırsız sayılır (eski kayıtlar).

/** Şu an geçerli haftalık fırsatlar için Mongo filtresi (başlamış, bitmemiş, aktif) */
export const activeWeeklyFilter = (now = new Date()) => ({
  isActive: true,
  $and: [
    { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
    { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gt: now } }] },
  ],
});

const validDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Haftalık fırsat kaydı şu an geçerli mi? (activeWeeklyFilter'ın JS karşılığı; önbellekteki kayıtlar
 * ve sorgudan dönen satırlar için ikinci emniyet). isActive alanı okunmamışsa (projeksiyon) aktif sayılır.
 */
export const isWeeklyDealLive = (deal, now = new Date()) => {
  if (!deal || deal.isActive === false) return false;
  const start = validDate(deal.startDate);
  if (start && start > now) return false;
  const end = validDate(deal.endDate);
  if (end && end <= now) return false;
  return true;
};

/** Ürünün kendi geçerli indirimli fiyatı (yoksa undefined) */
export const validDiscountPrice = (product) => {
  if (!product?.isDiscounted || !finite(product.discountedPrice)) return undefined;
  const discounted = Number(product.discountedPrice);
  return discounted >= 0 && discounted < Number(product.price) ? discounted : undefined;
};

/**
 * @param {{ price: number, isDiscounted?: boolean, discountedPrice?: number|null }} product
 * @param {number|undefined|null} weeklyPrice aktif haftalık fırsat fiyatı (yoksa undefined)
 * @returns {{ price: number, source: "weekly"|"discount"|"list" }} price kuruşa yuvarlanmış
 */
export const resolveUnitPrice = (product, weeklyPrice) => {
  const list = Number(product?.price) || 0;
  let best = { price: list, source: "list" };
  const discount = validDiscountPrice(product);
  if (discount !== undefined && discount < best.price) best = { price: discount, source: "discount" };
  if (finite(weeklyPrice) && Number(weeklyPrice) >= 0 && Number(weeklyPrice) < best.price) {
    best = { price: Number(weeklyPrice), source: "weekly" };
  }
  // Birim fiyat kuruşa yuvarlanır (listede gösterilen = siparişte alınan)
  best.price = roundMoney(best.price);
  return best;
};

/**
 * Ürünün şu an süren (ve fiyatı gerçekten uygulanmış) flash sale bilgisi; yoksa null.
 * Ürün belgesindeki `flashSale` alanını flashSale.service yazar/temizler. Yönetici kampanya
 * sırasında indirimi elle değiştirdiyse ya da bitiş geçtiyse (zamanlayıcı henüz geri almadıysa)
 * rozet gösterilmez.
 */
export const liveFlashInfo = (product, now = new Date()) => {
  const info = product?.flashSale;
  if (!info || !info.endDate) return null;
  if (new Date(info.endDate) <= now) return null;
  if (info.startDate && new Date(info.startDate) > now) return null;
  const discount = validDiscountPrice(product);
  if (discount === undefined || !finite(info.price) || Math.abs(discount - Number(info.price)) >= 0.01) return null;
  return {
    _id: info.sale ? String(info.sale) : undefined,
    discountPercentage: Number(info.discountPercentage),
    price: Number(info.price),
    startDate: info.startDate ? new Date(info.startDate).toISOString() : undefined,
    endDate: new Date(info.endDate).toISOString(),
  };
};
