import mongoose from "mongoose";
import Product from "../../models/product.model.js";
import WeeklyProduct from "../../models/weeklyProduct.model.js";
import FlashSale from "../../models/flashSale.model.js";
import Coupon from "../../models/coupon.model.js";
import Order from "../../models/order.model.js";
import User from "../../models/user.model.js";
import { evaluateCoupon } from "../coupon.service.js";
import { getStoreInfo } from "./storeInfo.service.js";
import { preparingMinutes } from "./orderDelay.js";

const normalize = (value) => String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const ownedOrderFilter = (orderId, authenticatedUserId) => ({
  ...(orderId ? { _id: orderId } : {}),
  user: authenticatedUserId,
});

// Ürün adları "Süt", "Çikolata", "Yoğurt" gibi Türkçe harflerle kayıtlıdır; arama terimi ise
// aksansız hâle getirilir. Bu desen "sut" yazıldığında "Süt" ile, "cikolata" yazıldığında
// "Çikolata" ile eşleşmeyi sağlar.
const TURKISH_LETTER_CLASSES = { c: "[cçCÇ]", g: "[gğGĞ]", i: "[iıİI]", o: "[oöOÖ]", s: "[sşSŞ]", u: "[uüUÜ]" };
export const turkishInsensitivePattern = (term) => [...normalize(term)]
  .map((char) => TURKISH_LETTER_CLASSES[char] || escapeRegex(char)).join("");

// Soru kalıpları ve dolgu kelimeleri; ürün adının parçası olamayacak kadar genel olanlar.
const PRODUCT_FILLER_WORDS = new Set(["sizde", "sizin", "sizlerde", "bana", "bize", "bir", "tane", "adet", "hangi", "hangileri", "kac", "ne", "mi", "mu", "tl", "lira", "satiyor", "satiliyor", "satiyormusunuz", "musunuz", "misiniz", "miyim", "bulabilir", "bulabilirim", "alabilir", "almak", "elinizde", "markette", "marketinizde", "magazada", "uygulamada", "var", "yok", "kaldi", "geldi", "icin", "ve", "ile", "ya", "da", "de", "sey", "olan", "olarak", "cesit", "cesitleri", "cesitleriniz", "neler", "nelerdir", "soyler", "soyle", "goster", "bak", "bakar", "selam", "iyi", "gunler", "aksamlar", "tesekkurler", "rica", "ediyorum", "edebilir", "ogrenebilir", "ogrenmek"]);

export const getProductSearchTerms = (query) => normalize(query)
  .replace(/\b(var mi|var mu|var mı|var mı|stokta mi|stokta mı|stok durumu|kac tl|kaç tl|kac lira|kac para|fiyati ne|fiyatı ne|fiyati nedir|ne kadar|fiyati|fiyat|stokta|stok|urunu|urunler|urun|ürün|bulunuyor mu|mevcut mu|kaldi mi|geldi mi|satiyor musunuz|kampanya|indirim|lutfen|nedir)\b/g, " ")
  .replace(/\b(benim|marketim|acaba|merhaba|istiyorum|bakabilir misin|bakar misin|soyler misin)\b/g, " ")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().split(/\s+/)
  .filter((word) => word.length >= 2 && !PRODUCT_FILLER_WORDS.has(word)).slice(0, 6);

// "Kupon kodu ABCD20 geçerli mi?" gibi cümlelerde ilk kelimeyi değil, gerçekten koda benzeyen
// parçayı seçer: önce rakam içeren, sonra büyük harfle yazılmış, son olarak kısa mesajdaki tek aday.
const COUPON_NOISE_WORDS = new Set(["KUPON", "KUPONU", "KUPONUM", "KUPONUMU", "KUPONLAR", "KUPONLARIM", "KUPONA", "KUPONUN", "KUPONDA", "KODU", "KODUM", "KODUNU", "KODUMU", "KODUYLA", "KODUN", "PROMOSYON", "INDIRIM", "INDIRIMI", "GECERLI", "GECERLIMI", "AKTIF", "NEDIR", "NASIL", "NEDEN", "HANGI", "BENIM", "BANA", "HESABIMDA", "KULLANABILIR", "KULLANABILIRIM", "KULLANAMIYORUM", "KULLANMAK", "KULLANILIR", "CALISMIYOR", "CALISIYOR", "ISTIYORUM", "MIYIM", "MISIN", "MERHABA", "SELAM", "ACABA", "LUTFEN", "KONTROL", "EDER", "MISINIZ", "KADAR", "TARIHI", "SURESI", "YENI", "ILAVE", "HEDIYE"]);
export const extractCouponCode = (query) => {
  const original = String(query || "").match(/[\p{L}\p{N}]+/gu) || [];
  const tokens = original.map((token) => ({ raw: token, code: token.toUpperCase().replace(/İ/g, "I") }))
    .filter(({ code }) => /^[A-Z0-9]{4,20}$/.test(code) && !COUPON_NOISE_WORDS.has(code));
  const withDigit = tokens.find(({ code }) => /\d/.test(code) && /[A-Z]/.test(code)) || tokens.find(({ code }) => /\d/.test(code));
  if (withDigit) return withDigit.code;
  const typedUppercase = tokens.find(({ raw }) => raw === raw.toLocaleUpperCase("tr-TR"));
  if (typedUppercase) return typedUppercase.code;
  return original.length <= 4 && tokens.length === 1 ? tokens[0].code : null;
};

// "İçecek kategorisinde neler var", "atıştırmalık reyonu", "kahvaltılık çeşitleri" gibi
// kategoriye göz atma isteklerinden kategori adını çıkarır.
export const extractCategoryTerm = (query) => {
  const text = normalize(query).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const match = text.match(/([\p{L}]+(?: [\p{L}]+)?) (?:kategorisi\p{L}*|reyonu\p{L}*|cesitleri\p{L}*|turu urunler\p{L}*)\b/u);
  if (!match) return null;
  const words = match[1].split(" ").filter((word) => word.length >= 3 && !PRODUCT_FILLER_WORDS.has(word));
  return words.length ? words.join(" ") : null;
};

// "300 TL'ye kahvaltılık hazırla", "4 kişilik makarna yapacağım", "600 TL bütçem var" gibi
// sepet kurma istekleri: ürün listesini model planlar, bu yüzden tek adımlı araç yönlendirmesi atlanır.
export const isCartRequest = (query) => {
  const text = normalize(query);
  return /(sepet|liste|alisveris).{0,24}(hazirla|olustur|yap|kur|oner|cikar)|(hazirla|olustur|oner).{0,24}(sepet|liste)|butce|\d+\s*(tl|lira).{0,30}(hazirla|olustur|sepet|alisveris|yetecek|ne alabilirim|ne alinir)|\d+\s*kisilik|yapacagim|pisirecegim|yapmak istiyorum|malzeme(ler)?i|tarif/.test(text);
};

// "2 süt, 1 yumurta, makarna" → [{ name: "süt", quantity: 2 }, ...]
export const parseCartItems = (value) => String(value || "").split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean).slice(0, 15).map((part) => {
  const match = part.match(/^(\d{1,2})\s*(?:x|adet|tane|paket|kutu|sise)?\s+(.+)$/i);
  const quantity = match ? Math.min(Math.max(Number(match[1]), 1), 20) : 1;
  return { name: (match ? match[2] : part).slice(0, 60).trim(), quantity };
}).filter((item) => item.name.length >= 2);

// Ürün adının istenen kelimelerle ne kadar örtüştüğü. Tam kelime eşleşmesi, adın o kelimeyle başlaması ve
// kelimenin ürünün asıl adı olması ("Sütaş Yoğurt 1 Kg") öne alınır; kelimenin yalnızca çeşni ya da hammadde
// olduğu ürünler ("Lays Yoğurt Mevsim Yeşillikleri", "Pirinç Unu") geriye düşer.
const SIZE_WORD = /^(\d.*|gr|g|kg|lt|l|ml|cl|adet|li|lu|lik|luk|paket|pet|cam|sise|kutu|teneke|x)$/;
const DERIVATIVE_WORDS = new Set(["unu", "cipsi", "suyu", "sosu", "tozu", "kremasi", "kolonyasi", "sabunu", "sampuani", "sirkesi", "ezmesi", "kurabiyesi", "biskuvisi", "gofreti", "cikolatasi", "dondurmasi", "receli", "salatasi", "corbasi", "harci", "salcasi", "puresi", "nisastasi", "yagi", "cayi", "cesnisi", "bulyon", "aromasi", "kokusu", "mamasi", "krakeri", "kraker", "patlagi", "kolasi", "gazozu", "sakizi", "sekeri"]);
const INFLECTION_SUFFIXES = new Set(["i", "u", "si", "su", "lar", "ler", "lari", "leri"]);
const FLAVOUR_WORDS = new Set(["lays", "doritos", "ruffles", "cheetos", "pringles", "patos", "cerezza", "cips", "aromali", "cesnili", "tadinda", "soslu"]);
export const cartMatchScore = (productName, terms) => {
  const words = normalize(productName).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const nameWords = words.filter((word) => !SIZE_WORD.test(word));
  let score = -words.length * 0.1;
  for (const term of terms) {
    // Tam kelime yoksa ek almış hâli de sayılır ("salça" → "Salçası", "pirinç" → "Pirinci"); "-li/-lu" türevleri sayılmaz ("Sütlü").
    const exact = words.indexOf(term);
    const index = exact !== -1 ? exact : words.findIndex((word) => word.startsWith(term) && INFLECTION_SUFFIXES.has(word.slice(term.length)));
    if (index === -1) continue;
    score += (exact !== -1 ? 3 : 2.5) + (index === 0 ? 2 : 0) + (nameWords[nameWords.length - 1] === words[index] ? 2 : 0);
    const next = words[index + 1];
    if (next && DERIVATIVE_WORDS.has(next) && !terms.includes(next)) score -= 4;
  }
  if (!terms.some((term) => FLAVOUR_WORDS.has(term)) && words.some((word) => FLAVOUR_WORDS.has(word))) score -= 4;
  return score;
};

// Bütçeyi aşan sepeti sırasıyla şu adımlarla bütçeye indirir: adetleri azaltır, pahalı ürünü aynı isteğin
// daha uygun fiyatlı dengiyle değiştirir, en son en pahalı kalemden başlayarak ürün çıkarır.
// Böylece tek bir pahalı ürün yüzünden bütçeye sığan diğer ürünler sepetten atılmaz.
export const fitCartToBudget = (items, budget, { keepAlternatives = false } = {}) => {
  const lines = items.map((item) => ({ ...item, alternatives: [...(item.alternatives || [])] }));
  const removed = [];
  const total = () => lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const finish = () => ({ lines: lines.map(({ alternatives, ...line }) => (keepAlternatives ? { ...line, alternatives } : line)), removed, total: total() });
  // Bir satırın ürünü değişince eski ürün, müşteri geri dönebilsin diye denkler arasına alınır.
  const replace = (line, option) => {
    const previous = { productId: line.productId, name: line.name, price: line.price };
    line.alternatives = [previous, ...line.alternatives.filter((item) => item.productId !== option.productId)];
    Object.assign(line, { productId: option.productId, name: option.name, price: option.price });
  };
  if (!(budget > 0)) return finish();
  while (total() > budget) {
    const reducible = lines.filter((line) => line.quantity > 1).sort((a, b) => b.price - a.price)[0];
    if (!reducible) break;
    reducible.quantity -= 1;
  }
  while (total() > budget) {
    const used = new Set(lines.map((line) => line.productId));
    const swap = lines.map((line) => ({ line, option: line.alternatives.filter((option) => option.price < line.price && !used.has(option.productId)).sort((a, b) => a.price - b.price)[0] }))
      .filter((entry) => entry.option).sort((a, b) => (b.line.price - b.option.price) - (a.line.price - a.option.price))[0];
    if (!swap) break;
    replace(swap.line, swap.option);
  }
  const dropped = [];
  while (total() > budget && lines.length) {
    const priciest = lines.reduce((worst, line) => (line.price > worst.price ? line : worst), lines[0]);
    dropped.push(priciest);
    lines.splice(lines.indexOf(priciest), 1);
  }
  // Çıkarılan kalemler, kalan bütçeye sığan en uygun fiyatlı dengiyle geri eklenir; sığmayanlar müşteriye bildirilir.
  for (const line of dropped) {
    const used = new Set(lines.map((item) => item.productId));
    const option = [{ productId: line.productId, name: line.name, price: line.price }, ...line.alternatives]
      .filter((item) => !used.has(item.productId) && item.price * line.quantity <= budget - total()).sort((a, b) => a.price - b.price)[0];
    if (!option) { removed.push(line.name); continue; }
    if (option.productId !== line.productId) replace(line, option);
    lines.push(line);
  }
  return finish();
};

export const detectToolIntent = (query) => {
  const text = normalize(query);
  const id = String(query).match(/\b[a-f\d]{24}\b/i)?.[0] || null;
  if (/minimum.{0,18}(sepet|siparis)|(sepet|siparis).{0,18}minimum|en az.{0,18}(tl|siparis)|kac tl.{0,30}alisveris|sepet alt limiti/.test(text)) return { name: "getStoreSettings" };
  if (/\b(sepetimde|sepetim|sepetimdeki)\b/.test(text)) return { name: "getMyCart" };
  if (text.includes("kupon") || text.includes("promosyon kodu") || text.includes("indirim kodu")) {
    const code = extractCouponCode(query);
    const asksForList = /kuponlarim|kuponum|kuponlar|kupon var|kuponu var|hangi kupon|kupon(um|larim)? (ne|neler|nedir)|tanimli kupon/.test(text);
    if (asksForList && !(code && /\d/.test(code))) return { name: "getMyCoupons" };
    return { name: "getCouponInfo", code };
  }
  if (/siparis|\border/.test(text)) {
    if (id) return { name: "getOrderDetails", orderId: id };
    if (/son|gecen/.test(text)) return { name: "getMyLastOrder" };
    if (/saat|kadar|acik|calisma|su an|verebilir miyim|siparis aliyor/.test(text)) return { name: "getStoreOpeningStatus" };
    return { name: "getMyActiveOrders" };
  }
  if (/kaca kadar acik|kacta acil|ne zaman kapani|ne zaman kapaniy|acik misiniz|market acik/.test(text)) return { name: "getStoreOpeningStatus" };
  if (/siparis.{0,18}(saat|kadar)|saat.{0,18}(siparis|kadar)|ne zamana kadar/.test(text)) return { name: "getStoreOpeningStatus" };
  if (/minimum.{0,18}(sepet|siparis)|(sepet|siparis).{0,18}minimum|en az.{0,12}(sepet|siparis)|kac tl.{0,30}(alisveris|siparis)|sepet alt limiti/.test(text)) return { name: "getStoreSettings" };
  if ((text.includes("market") || text.includes("magaza") || text.includes("siparis")) && /acik|kapan|saat|calisma/.test(text)) return { name: "getStoreOpeningStatus" };
  if (/teslimat ucreti|ucretsiz teslimat|odeme yontem|teslimat bolgesi/.test(text)) return { name: "getStoreInfo" };
  if (/kampanya|indirim|firsat|haftanin urun/.test(text)) return { name: "getActiveCampaigns" };
  if (/en cok (ne )?al|sik aldigim|her zamanki|genelde ne al|surekli aldigim|daha once (ne )?al/.test(text)) return { name: "getMyFrequentProducts" };
  const category = extractCategoryTerm(query);
  if (category) return { name: "getCategoryProducts", category };
  if (/urun|stok|fiyat|\btl\b|\d\s?tl\b|\blira\b|kac para|var mi|var mu|bulunuyor|kaldi mi|geldi mi|satiyor mu/.test(text)) return { name: "searchProducts", terms: getProductSearchTerms(query) };
  return null;
};

export const effectivePriceMap = async (products) => {
  const ids = products.map((product) => product._id);
  const weekly = await WeeklyProduct.find({ isActive: true, product: { $in: ids } }).select("product weeklyPrice").lean();
  const map = new Map(weekly.map((item) => [String(item.product), Number(item.weeklyPrice)]));
  return products.map((product) => {
    const discount = product.isDiscounted && Number(product.discountedPrice) >= 0 && Number(product.discountedPrice) < Number(product.price) ? Number(product.discountedPrice) : Number(product.price);
    return { id: String(product._id), name: product.name, category: product.category, inStock: !product.isOutOfStock, price: map.get(String(product._id)) ?? discount, currency: "TRY" };
  });
};

export const runAiTool = async (intent, authenticatedUserId) => {
  if (!authenticatedUserId || !mongoose.isValidObjectId(authenticatedUserId)) throw new Error("AUTHENTICATED_USER_REQUIRED");
  const now = new Date();
  if (intent.name === "searchProducts") {
    const terms = (intent.terms || []).filter((word) => typeof word === "string" && word.length <= 50).slice(0, 6);
    if (!terms.length) return { tool: intent.name, found: false, products: [] };
    const fields = "name price discountedPrice isDiscounted isOutOfStock category";
    const patterns = terms.map((term) => turkishInsensitivePattern(term));
    let products = await Product.find({ isHidden: { $ne: true }, $and: patterns.map((pattern) => ({ name: { $regex: pattern, $options: "i" } })) }).select(fields).limit(8).lean();
    let partialMatch = false;
    if (!products.length && patterns.length > 1) {
      // Tüm kelimeler birlikte geçmiyorsa en çok kelimesi eşleşen ürünleri öner ("coca cola 1 litre" → "Coca Cola 1 L").
      const candidates = await Product.find({ isHidden: { $ne: true }, $or: patterns.map((pattern) => ({ name: { $regex: pattern, $options: "i" } })) }).select(fields).limit(60).lean();
      const matchers = patterns.map((pattern) => new RegExp(pattern, "i"));
      const required = Math.max(1, Math.ceil(patterns.length / 2));
      products = candidates.map((product) => ({ product, hits: matchers.filter((matcher) => matcher.test(product.name)).length }))
        .filter(({ hits }) => hits >= required).sort((a, b) => b.hits - a.hits).slice(0, 8).map(({ product }) => product);
      partialMatch = products.length > 0;
    }
    return { tool: intent.name, found: products.length > 0, ...(partialMatch ? { partialMatch: true } : {}), products: await effectivePriceMap(products) };
  }
  if (intent.name === "getProductDetails" || intent.name === "getProductStock" || intent.name === "getProductPrice") {
    if (!mongoose.isValidObjectId(intent.productId)) return { tool: intent.name, found: false };
    const products = await Product.find({ _id: intent.productId, isHidden: { $ne: true } }).select("name price discountedPrice isDiscounted isOutOfStock category description").limit(1).lean();
    const items = await effectivePriceMap(products);
    return { tool: intent.name, found: Boolean(items[0]), product: items[0] || null, ...(intent.name === "getProductDetails" ? { description: products[0]?.description || "" } : {}) };
  }
  if (["getMyActiveOrders", "getMyLastOrder", "getOrderStatus", "getOrderDetails"].includes(intent.name)) {
    const orderId = intent.orderId || null;
    if (orderId && !mongoose.isValidObjectId(orderId)) return { tool: intent.name, found: false };
    const filter = ownedOrderFilter(orderId, authenticatedUserId);
    const projection = intent.name === "getOrderDetails" ? "status totalAmount subtotalAmount couponDiscount deliveryPointName deliveryTracking createdAt products.name products.quantity products.price" : "status totalAmount deliveryPointName deliveryTracking createdAt";
    const orders = intent.name === "getMyActiveOrders"
      ? await Order.find({ ...filter, status: { $in: ["Hazırlanıyor", "Yolda"] } }).sort({ createdAt: -1 }).select(projection).limit(5).lean()
      : await Order.find(filter).sort({ createdAt: -1 }).select(projection).limit(1).lean();
    if (orderId && !orders.length) {
      const exists = await Order.exists({ _id: orderId });
      return { tool: intent.name, found: false, ownershipDenied: Boolean(exists) };
    }
    return { tool: intent.name, found: orders.length > 0, orders: orders.map((order) => ({ id: String(order._id), status: order.status, totalAmount: order.totalAmount, deliveryPoint: order.deliveryPointName, createdAt: order.createdAt, ...(order.status === "Hazırlanıyor" ? { preparingMinutes: preparingMinutes(order) } : {}), ...(order.deliveryTracking ? { deliveryTracking: order.deliveryTracking } : {}), ...(order.products ? { products: order.products.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price })) } : {}), ...(order.couponDiscount ? { couponDiscount: order.couponDiscount } : {}) })) };
  }
  if (intent.name === "getActiveCampaigns") {
    const campaigns = await FlashSale.find({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }).populate({ path: "product", match: { isHidden: { $ne: true } }, select: "name price isOutOfStock" }).sort({ endDate: 1 }).limit(10).lean();
    const active = campaigns.filter((item) => item.product).map((item) => ({ product: item.product.name, discountPercentage: item.discountPercentage, endDate: item.endDate, inStock: !item.product.isOutOfStock }));
    // Haftanın ürünleri: yönetici panelinden belirlenen özel fiyatlı ürünler
    const weeklyRows = await WeeklyProduct.find({ isActive: true, $or: [{ endDate: null }, { endDate: { $gte: now } }] }).populate({ path: "product", match: { isHidden: { $ne: true } }, select: "name price isOutOfStock" }).sort({ order: 1 }).limit(10).lean();
    const weeklyDeals = weeklyRows.filter((item) => item.product).map((item) => ({ product: item.product.name, weeklyPrice: Number(item.weeklyPrice), regularPrice: Number(item.product.price), inStock: !item.product.isOutOfStock }));
    return { tool: intent.name, found: active.length > 0 || weeklyDeals.length > 0, campaigns: active, weeklyDeals };
  }
  if (intent.name === "getCouponInfo") {
    const code = String(intent.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) return { tool: intent.name, needsCode: true };
    const coupon = await Coupon.findOne({ code, isActive: true, $or: [{ userId: null }, { userId: authenticatedUserId }] }).select("code description discountType discountPercentage discountAmount minimumOrderAmount expirationDate userId").lean();
    if (!coupon) return { tool: intent.name, found: false };
    const evaluation = await evaluateCoupon(coupon, { userId: authenticatedUserId, now });
    return { tool: intent.name, found: true, code: coupon.code, description: coupon.description, valid: evaluation.valid, reason: evaluation.valid ? null : evaluation.message, discount: coupon.discountType === "percentage" ? `%${coupon.discountPercentage}` : `${coupon.discountAmount} TL`, minimumOrderAmount: coupon.minimumOrderAmount, expirationDate: coupon.expirationDate };
  }
  if (intent.name === "getMyCoupons") {
    // Yalnızca giriş yapmış kullanıcıya özel tanımlanmış, süresi dolmamış kuponlar listelenir.
    const coupons = await Coupon.find({ userId: authenticatedUserId, isActive: true, expirationDate: { $gte: now } })
      .select("code description discountType discountPercentage discountAmount minimumOrderAmount expirationDate usedBy userUsageLimit usageLimit usageCount").sort({ expirationDate: 1 }).limit(10).lean();
    const usable = coupons.filter((coupon) => {
      const used = (coupon.usedBy || []).filter((entry) => String(entry.user) === String(authenticatedUserId)).length;
      const limitReached = coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit;
      return used < (coupon.userUsageLimit ?? 1) && !limitReached;
    }).map((coupon) => ({ code: coupon.code, description: coupon.description, discount: coupon.discountType === "percentage" ? `%${coupon.discountPercentage}` : `${coupon.discountAmount} TL`, minimumOrderAmount: coupon.minimumOrderAmount, expirationDate: coupon.expirationDate }));
    return { tool: intent.name, found: usable.length > 0, coupons: usable };
  }
  if (["getStoreInfo", "getStoreSettings", "getStoreOpeningStatus"].includes(intent.name)) {
    return { tool: intent.name, ...await getStoreInfo() };
  }
  if (intent.name === "getCategoryProducts") {
    const category = String(intent.category || "").trim().slice(0, 50);
    if (category.length < 3) return { tool: intent.name, found: false, products: [] };
    const fields = "name price discountedPrice isDiscounted isOutOfStock category";
    const pattern = turkishInsensitivePattern(category);
    let products = await Product.find({ isHidden: { $ne: true }, category: { $regex: pattern, $options: "i" } }).select(fields).sort({ isOutOfStock: 1, name: 1 }).limit(10).lean();
    // Kategori adı eşleşmezse aynı kelimeyi ürün adlarında arar ("çikolata çeşitleri").
    if (!products.length) products = await Product.find({ isHidden: { $ne: true }, name: { $regex: pattern, $options: "i" } }).select(fields).limit(10).lean();
    return { tool: intent.name, category, found: products.length > 0, products: await effectivePriceMap(products) };
  }
  if (intent.name === "getMyFrequentProducts") {
    // Yalnızca giriş yapmış kullanıcının kendi geçmiş siparişlerinden hesaplanır.
    const orders = await Order.find({ user: authenticatedUserId, status: { $ne: "İptal Edildi" } }).sort({ createdAt: -1 }).select("products.name products.quantity").limit(30).lean();
    const counts = new Map();
    for (const order of orders) for (const item of order.products || []) {
      if (!item?.name) continue;
      const entry = counts.get(item.name) || { name: item.name, orderCount: 0, totalQuantity: 0 };
      entry.orderCount += 1; entry.totalQuantity += Number(item.quantity) || 1;
      counts.set(item.name, entry);
    }
    const products = [...counts.values()].sort((a, b) => b.orderCount - a.orderCount || b.totalQuantity - a.totalQuantity).slice(0, 6);
    return { tool: intent.name, found: products.length > 0, orderCount: orders.length, products };
  }
  if (intent.name === "suggestCart") {
    // Model ürün listesini planlar; burada her kalem katalogdaki gerçek, stokta olan bir ürüne bağlanır.
    const wanted = parseCartItems(intent.items);
    const budget = Number(intent.budget) > 0 ? Math.min(Number(intent.budget), 100000) : null;
    if (!wanted.length) return { tool: intent.name, found: false, items: [], missing: [], total: 0, budget };
    const fields = "name price discountedPrice isDiscounted isOutOfStock category";
    const resolved = [];
    const missing = [];
    for (const item of wanted) {
      const terms = getProductSearchTerms(item.name);
      if (!terms.length) { missing.push(item.name); continue; }
      const patterns = terms.map((term) => turkishInsensitivePattern(term));
      const base = { isHidden: { $ne: true }, isOutOfStock: { $ne: true } };
      let candidates = await Product.find({ ...base, $and: patterns.map((pattern) => ({ name: { $regex: pattern, $options: "i" } })) }).select(fields).limit(60).lean();
      const byName = candidates.length > 0;
      if (!candidates.length) candidates = await Product.find({ ...base, category: { $regex: patterns[0], $options: "i" } }).select(fields).limit(12).lean();
      if (!candidates.length) { missing.push(item.name); continue; }
      // Önce adı isteğe en çok uyan ("süt" için "Sütlü çikolata" değil "Süt 1 L"), sonra en uygun fiyatlı ürün seçilir; aynı ürün iki kez eklenmez.
      // Aynı ölçüde uyan diğer ürünler, bütçe aşılırsa yerine konabilecek denkler olarak saklanır.
      const priced = (await effectivePriceMap(candidates)).filter((product) => !resolved.some((line) => line.productId === product.id))
        .map((product) => ({ product, score: cartMatchScore(product.name, terms) }))
        .sort((a, b) => b.score - a.score || a.product.price - b.product.price);
      if (!priced.length) continue;
      const [best, ...rest] = priced;
      // Ada göre bulunan en iyi aday bile istenen ürünün kendisi değilse ("pirinç" için yalnızca "Pirinç Unu") yanlış ürün eklenmez.
      if (byName && best.score <= 0) { missing.push(item.name); continue; }
      const alternatives = rest.filter((entry) => entry.score >= best.score - 1).slice(0, 5).map(({ product }) => ({ productId: product.id, name: product.name, price: product.price }));
      resolved.push({ productId: best.product.id, name: best.product.name, price: best.product.price, quantity: item.quantity, alternatives });
    }
    const fitted = fitCartToBudget(resolved, budget, { keepAlternatives: true });
    const inCart = new Set(fitted.lines.map((line) => line.productId));
    // Her kalemin yanında, müşterinin tek dokunuşla geçebileceği en fazla üç denk ürün döner.
    const items = fitted.lines.map(({ alternatives, ...line }) => ({
      ...line,
      lineTotal: Math.round(line.price * line.quantity * 100) / 100,
      alternatives: alternatives.filter((option) => !inCart.has(option.productId)).slice(0, 3),
    }));
    return { tool: intent.name, found: items.length > 0, items, missing, removedForBudget: fitted.removed, total: Math.round(fitted.total * 100) / 100, budget, currency: "TRY" };
  }
  if (intent.name === "getMyCart") {
    const user = await User.findById(authenticatedUserId).select("cartItems").populate({ path: "cartItems.product", select: "name price discountedPrice isDiscounted isOutOfStock isHidden category" }).lean();
    const products = (user?.cartItems || []).filter((item) => item.product && !item.product.isHidden);
    const priced = await effectivePriceMap(products.map((item) => item.product));
    const priceMap = new Map(priced.map((item) => [item.id, item]));
    const items = products.map((item) => ({ ...priceMap.get(String(item.product._id)), quantity: item.quantity }));
    return { tool: intent.name, found: true, items, total: items.reduce((sum, item) => sum + item.price * item.quantity, 0), currency: "TRY" };
  }
  throw new Error("AI_TOOL_NOT_ALLOWED");
};

export const executeModelToolCall = async (call, authenticatedUserId) => {
  const name = call?.function?.name;
  let args;
  try { args = JSON.parse(call?.function?.arguments || "{}"); }
  catch { throw new Error("AI_TOOL_ARGUMENTS_INVALID"); }
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("AI_TOOL_ARGUMENTS_INVALID");
  const allowed = new Set(["searchProducts", "getProductDetails", "getProductStock", "getProductPrice", "getMyActiveOrders", "getMyLastOrder", "getOrderStatus", "getOrderDetails", "getActiveCampaigns", "getCouponInfo", "getMyCoupons", "getStoreInfo", "getMyCart", "getCategoryProducts", "getMyFrequentProducts", "suggestCart"]);
  if (!allowed.has(name)) throw new Error("AI_TOOL_NOT_ALLOWED");
  const safeArgs = Object.fromEntries(Object.entries(args).filter(([key]) => key !== "userId" && key !== "user_id"));
  const intent = { ...safeArgs, name: name === "getStoreInfo" ? "getStoreSettings" : name };
  if (name === "searchProducts") intent.terms = getProductSearchTerms(String(safeArgs.query || "").slice(0, 120));
  return runAiTool(intent, authenticatedUserId);
};

export const toolResponseWithoutModel = (result) => {
  if (result.ownershipDenied) return "Bu sipariş hesabınıza ait görünmüyor. Güvenlik nedeniyle detaylarını paylaşamıyorum.";
  if (result.tool === "searchProducts" && !result.found) return "Aradığınız ürünü güncel ürün kataloğunda bulamadım. İsterseniz ürün adını farklı yazarak tekrar deneyebilirsiniz.";
  if (result.tool === "getCouponInfo" && result.needsCode) return "Kontrol etmem için kupon kodunu paylaşır mısınız?";
  if (result.tool === "getCouponInfo" && !result.found) return "Bu kodla eşleşen, hesabınızda kullanılabilir aktif bir kupon bulamadım.";
  if (result.tool === "getActiveCampaigns" && !result.found) return "Şu anda aktif bir kampanya görünmüyor.";
  if (result.tool === "getCategoryProducts" && !result.found) return "Bu kategoride listelenen bir ürün bulamadım. Aradığınız ürünün adını yazarsanız kataloğa bakabilirim.";
  if (result.tool === "getMyFrequentProducts" && !result.found) return "Hesabınızda henüz tamamlanmış bir sipariş görünmüyor; bu yüzden sık aldığınız ürünleri çıkaramadım.";
  if (result.tool === "getMyCoupons" && !result.found) return "Hesabınıza tanımlı, şu anda kullanılabilir bir kupon görünmüyor. Elinizde bir kupon kodu varsa yazın, geçerli olup olmadığını kontrol edeyim.";
  if (result.tool === "getMyActiveOrders" && !result.found) return "Şu anda hazırlanan veya yolda olan bir siparişiniz görünmüyor. Dilerseniz son siparişinizin durumuna bakabilirim.";
  if (result.tool === "getMyCart" && result.found && !result.items?.length) return "Sepetiniz şu anda boş görünüyor.";
  if (result.tool === "suggestCart" && !result.found) return "İstediğiniz ürünleri şu anda katalogda bulamadım. Ürün adlarını yazarsanız tekrar bakabilirim.";
  if (result.tool.startsWith("getMy") && !result.found && result.tool !== "getMyCart" && result.tool !== "getMyFrequentProducts") return "Hesabınızda bu ölçüte uyan bir sipariş bulamadım.";
  return null;
};

// ── Araç sonucunu model olmadan, doğrudan Türkçe cümleye çevirir ──────────────
// Sağlayıcıya ulaşılamadığında veya model yanıt üretemediğinde, elde doğrulanmış veri varken
// müşteriyi boş yere canlı desteğe aktarmamak için kullanılır. Yalnızca araç verisini aktarır.
const formatMoney = (value) => `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
const formatDate = (value) => new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
const formatDateTime = (value) => new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const productLine = (product) => `• ${product.name} — ${formatMoney(product.price)}${product.inStock ? "" : " (şu anda tükendi)"}`;

export const formatToolResult = (result) => {
  if (!result || typeof result !== "object") return null;
  const direct = toolResponseWithoutModel(result);
  if (direct) return direct;
  if (result.tool === "searchProducts" && result.products?.length) {
    const lines = result.products.slice(0, 6).map(productLine).join("\n");
    return `${result.partialMatch ? "Tam eşleşme bulamadım, en yakın ürünler şunlar:" : "Güncel katalogda bulduklarım:"}\n${lines}`;
  }
  if (["getProductDetails", "getProductStock", "getProductPrice"].includes(result.tool)) {
    if (!result.product) return "Bu ürünü güncel katalogda bulamadım.";
    const description = result.description ? `\n${String(result.description).slice(0, 300)}` : "";
    return `${result.product.name}: ${formatMoney(result.product.price)}, ${result.product.inStock ? "stokta var" : "şu anda tükendi"}.${description}`;
  }
  if (["getMyActiveOrders", "getMyLastOrder", "getOrderStatus", "getOrderDetails"].includes(result.tool) && result.orders?.length) {
    return result.orders.map((order) => {
      const point = order.deliveryPoint ? ` (${order.deliveryPoint})` : "";
      const head = `• ${formatDateTime(order.createdAt)} tarihli siparişiniz: ${order.status} — ${formatMoney(order.totalAmount)}${point}`;
      const items = order.products?.length ? `\n  ${order.products.map((item) => `${item.quantity} × ${item.name}`).join(", ")}` : "";
      const tracking = order.deliveryTracking ? `\n  Teslimat notu: ${order.deliveryTracking}` : "";
      return head + items + tracking;
    }).join("\n");
  }
  if (result.tool === "getActiveCampaigns" && (result.campaigns?.length || result.weeklyDeals?.length)) {
    const lines = (result.campaigns || []).slice(0, 8).map((item) => `• ${item.product}: %${item.discountPercentage} indirim, ${formatDateTime(item.endDate)} tarihine kadar${item.inStock ? "" : " (tükendi)"}`);
    const weekly = (result.weeklyDeals || []).slice(0, 8).map((item) => `• ${item.product}: ${formatMoney(item.weeklyPrice)}${item.regularPrice > item.weeklyPrice ? ` (normal fiyatı ${formatMoney(item.regularPrice)})` : ""}${item.inStock ? "" : " (tükendi)"}`);
    return [lines.length ? `Şu anki kampanyalar:\n${lines.join("\n")}` : "", weekly.length ? `Haftanın ürünleri:\n${weekly.join("\n")}` : ""].filter(Boolean).join("\n\n");
  }
  if (result.tool === "getCategoryProducts" && result.products?.length) {
    return `Bu kategoride bulduklarım:\n${result.products.slice(0, 8).map(productLine).join("\n")}`;
  }
  if (result.tool === "suggestCart" && result.items?.length) {
    const lines = result.items.map((item) => `• ${item.quantity} × ${item.name} — ${formatMoney(item.lineTotal)}`);
    const notes = [
      result.missing?.length ? `Bulamadıklarım: ${result.missing.join(", ")}.` : "",
      result.removedForBudget?.length ? `Bütçeye sığmadığı için çıkardıklarım: ${result.removedForBudget.join(", ")}.` : "",
    ].filter(Boolean).join(" ");
    return `Sizin için hazırladığım sepet:\n${lines.join("\n")}\nToplam: ${formatMoney(result.total)}${result.budget ? ` (bütçe ${formatMoney(result.budget)})` : ""}${notes ? `\n${notes}` : ""}\nBeğendiyseniz aşağıdaki düğmeyle sepetinize ekleyebilirsiniz.`;
  }
  if (result.tool === "getMyFrequentProducts" && result.products?.length) {
    return `Son siparişlerinizde en sık aldıklarınız:\n${result.products.map((item) => `• ${item.name} — ${item.orderCount} siparişte`).join("\n")}`;
  }
  const minimumNote = (amount) => (Number(amount) > 0 ? `, minimum sepet ${formatMoney(amount)}` : "");
  if (result.tool === "getCouponInfo" && result.found) {
    const base = `${result.code} kuponu: ${result.discount} indirim${minimumNote(result.minimumOrderAmount)}, son kullanım ${formatDate(result.expirationDate)}.`;
    return result.valid || /minimum sipariş/i.test(result.reason || "") ? base : `${base}\nNot: ${result.reason}.`;
  }
  if (result.tool === "getMyCoupons" && result.coupons?.length) {
    const lines = result.coupons.map((coupon) => `• ${coupon.code}: ${coupon.discount} indirim${minimumNote(coupon.minimumOrderAmount)}, son kullanım ${formatDate(coupon.expirationDate)}`);
    return `Hesabınıza tanımlı kuponlar:\n${lines.join("\n")}`;
  }
  if (["getStoreInfo", "getStoreSettings", "getStoreOpeningStatus"].includes(result.tool) && result.orderStartTime) {
    const points = (result.deliveryPoints || []).filter((point) => point.enabled).map((point) => point.name).filter(Boolean);
    return [
      `Sipariş saatlerimiz ${result.orderStartTime} – ${result.orderEndTime}. Şu anda sipariş ${result.orderingOpen ? "alıyoruz" : "almıyoruz"}.`,
      `Minimum sepet tutarı ${formatMoney(result.minimumOrderAmount)}.`,
      points.length ? `Teslimat noktaları: ${points.join(", ")}.` : "",
    ].filter(Boolean).join("\n");
  }
  if (result.tool === "getMyCart" && result.items?.length) {
    const lines = result.items.map((item) => `• ${item.quantity} × ${item.name} — ${formatMoney(item.price * item.quantity)}`);
    return `Sepetinizde ${result.items.length} ürün var:\n${lines.join("\n")}\nToplam: ${formatMoney(result.total)}`;
  }
  return null;
};
