// Siparişe ürün ekleme ve muadil seçme panellerinin ortak katalog yardımcıları (React yok, ağ isteği yok).
// Fiyat kuralı sunucudaki resolveEffectiveUnitPrice ile aynıdır: haftalık fiyat, geçerli indirim (flaş indirim dahil)
// ve liste fiyatının en düşüğü.
import { normalizeSearch } from "../../lib/orderTools";

const PLACEHOLDER_NAME = normalizeSearch("Özel Ekleme");

/** Ürünün siparişe girecek birim fiyatı */
export const effectivePrice = (product) => {
  const price = Number(product?.price) || 0;
  let best = price;
  const discounted = Number(product?.discountedPrice);
  if (product?.isDiscounted && Number.isFinite(discounted) && discounted >= 0 && discounted < best) best = discounted;
  const weekly = product?.weeklyPrice;
  if (weekly !== null && weekly !== undefined && Number.isFinite(Number(weekly)) && Number(weekly) >= 0 && Number(weekly) < best) best = Number(weekly);
  return best;
};

/** Panelden elle eklenen tutarların gizli yer tutucu ürünü ("Özel Ekleme"); listelerde gösterilmez */
export const isPlaceholder = (product) => Boolean(product?.isHidden) && normalizeSearch(product?.name) === PLACEHOLDER_NAME;

/** Arama dizini: ürün başına bir kez (ad + kategori, Türkçe duyarsız) */
export const buildProductIndex = (products) => (Array.isArray(products) ? products : [])
  .filter((p) => p && p._id && !isPlaceholder(p))
  .map((p) => ({
    product: p,
    name: normalizeSearch(p.name),
    text: normalizeSearch(`${p.name || ""} ${p.category || ""}`),
    price: effectivePrice(p),
  }));

/** Sorguya uyanlar: tüm sözcükler geçmeli; adı sorgunun ilk sözcüğüyle başlayanlar önce (sıra korunur) */
export const searchProducts = (index, query) => {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (!tokens.length) return index;
  const rank = (entry) => (entry.name.startsWith(tokens[0]) ? 0 : entry.name.split(" ").some((w) => w.startsWith(tokens[0])) ? 1 : 2);
  return index
    .filter((entry) => tokens.every((t) => entry.text.includes(t)))
    .map((entry, i) => ({ entry, i, r: rank(entry) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ entry }) => entry);
};

const kurus = (n) => Math.round((Number(n) || 0) * 100);
/** Birim fiyat farkı (kuruş kırıntısız): muadil − eksik ürün */
export const unitDifference = (candidatePrice, linePrice) => (kurus(candidatePrice) - kurus(linePrice)) / 100;

/**
 * Muadil önerileri: eksik ürünle aynı kategoride, görünür ve stokta olan diğer ürünler; birim fiyat farkı en küçük
 * olanlar önce (eşitlikte ada göre). Ürün katalogda yoksa ya da kategorisi bilinmiyorsa boş dizi.
 * → [{ product, price, diff }] (en çok limit)
 */
export const substituteSuggestions = (index, { productId, linePrice, limit = 5 } = {}) => {
  const source = index.find((entry) => String(entry.product._id) === String(productId))?.product;
  const category = normalizeSearch(source?.category);
  if (!category) return [];
  return index
    .filter((entry) => {
      const p = entry.product;
      return String(p._id) !== String(productId) && !p.isHidden && !p.isOutOfStock && normalizeSearch(p.category) === category;
    })
    .map((entry) => ({ product: entry.product, price: entry.price, diff: unitDifference(entry.price, linePrice) }))
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || String(a.product.name || "").localeCompare(String(b.product.name || ""), "tr"))
    .slice(0, limit);
};
