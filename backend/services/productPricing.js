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

/** Ürünün kendi geçerli indirimli fiyatı (yoksa undefined) */
export const validDiscountPrice = (product) => {
  if (!product?.isDiscounted || !finite(product.discountedPrice)) return undefined;
  const discounted = Number(product.discountedPrice);
  return discounted >= 0 && discounted < Number(product.price) ? discounted : undefined;
};

/**
 * @param {{ price: number, isDiscounted?: boolean, discountedPrice?: number|null }} product
 * @param {number|undefined|null} weeklyPrice aktif haftalık fırsat fiyatı (yoksa undefined)
 * @returns {{ price: number, source: "weekly"|"discount"|"list" }}
 */
export const resolveUnitPrice = (product, weeklyPrice) => {
  const list = Number(product?.price) || 0;
  let best = { price: list, source: "list" };
  const discount = validDiscountPrice(product);
  if (discount !== undefined && discount < best.price) best = { price: discount, source: "discount" };
  if (finite(weeklyPrice) && Number(weeklyPrice) >= 0 && Number(weeklyPrice) < best.price) {
    best = { price: Number(weeklyPrice), source: "weekly" };
  }
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
