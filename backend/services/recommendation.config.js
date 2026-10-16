// Öneri puanlamasının ayarları tek yerde. Bir rafın davranışını değiştirmek için
// genellikle yalnızca buradaki sayıları oynamak yeterlidir.
export const RECO_WEIGHTS = {
  // Popülerlik: log1p(adet) × ağırlık
  popularity7: 3,
  popularity30: 2,
  // Seçilen yurdun son 30 gün adedi için ek ağırlık (log1p)
  deliveryPoint: 2.5,
  // Kategorinin bu saat dilimindeki satış payı / genel pay (lift). (lift - 1) × ağırlık
  hourFit: 2,
  // Kullanıcının kategori payı (0..1) × ağırlık
  category: 6,
  // Tekrar alım: yenileme zamanı geldiyse / geçtiyse / çok yakın zamanda alındıysa
  repurchaseDue: 10,
  repurchaseOverdue: 6,
  repurchaseEarly: 2,
  repurchaseTooSoon: -6,
  // Yalnızca bir kez alınmış ürün: log1p(adet) × ağırlık
  repurchaseOnce: 2,
  // Son 3 siparişteki ürünlerle birlikte alınanlar (normalize puan toplamı, en çok 1) × ağırlık
  coPurchase: 4,
  // İndirim yüzdesi başına (50 indirim ≈ 4 puan)
  discountPerPercent: 0.08,
  // Rafta indirim derinliği daha belirleyici
  dealDiscountPerPercent: 0.2,
  featured: 1.5,
  // Son `newDays` günde eklenen ürün
  newness: 1.5,
};

export const RECO_RULES = {
  newDays: 14,
  maxPerCategory: 4,
  // forYou rafında günlük tohumla seçilen keşif ürünlerinin payı
  explorationShare: 0.12,
  // Keşif havuzu: son 30 günde en çok bu kadar satılmış ya da yeni ürünler
  explorationMaxUnits30: 1,
  // Yenileme penceresi (ortalama alım aralığına oran)
  repurchaseWindow: [0.7, 1.3],
  repurchaseTooSoonRatio: 0.4,
  // Saat uyumu için kategori başına gereken en az adet
  hourMinUnits: 5,
  // Birlikte alınanlar: ürün başına tutulan eş sayısı, çift üretilen en büyük sipariş
  coPurchaseTop: 10,
  coPurchaseMaxItemsPerOrder: 40,
};

export const RECO_CACHE = {
  statsKey: "reco:stats:v1",
  lockKey: "reco:stats:lock",
  statsTtlSec: 2 * 60 * 60,
  lockTtlSec: 5 * 60,
  // Bellekteki istatistik bundan eskiyse arka planda yenilenir
  refreshAfterMs: 65 * 60 * 1000,
  // Redis'i en sık bu aralıkla yeniden okur (başka süreç hesaplamış olabilir)
  redisCheckMs: 2 * 60 * 1000,
  catalogTtlMs: 60 * 1000,
  flashTtlMs: 30 * 1000,
  guestFeedTtlMs: 5 * 60 * 1000,
};
