import mongoose from "mongoose";
import Product from "../../models/product.model.js";
import WeeklyProduct from "../../models/weeklyProduct.model.js";
import FlashSale from "../../models/flashSale.model.js";
import Coupon from "../../models/coupon.model.js";
import Order from "../../models/order.model.js";
import User from "../../models/user.model.js";
import { evaluateCoupon } from "../coupon.service.js";
import { getStoreInfo } from "./storeInfo.service.js";

const normalize = (value) => String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const ownedOrderFilter = (orderId, authenticatedUserId) => ({
  ...(orderId ? { _id: orderId } : {}),
  user: authenticatedUserId,
});

export const getProductSearchTerms = (query) => normalize(query)
  .replace(/\b(var mi|var mu|var mı|var mı|stokta mi|stokta mı|stok durumu|kac tl|kaç tl|fiyati ne|fiyatı ne|ne kadar|fiyat|stok|urun|ürün|bulunuyor mu|mevcut mu|kampanya|indirim|lutfen|nedir)\b/g, " ")
  .replace(/\b(benim|marketim|acaba|merhaba|istiyorum|bakabilir misin)\b/g, " ")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().split(/\s+/).filter((word) => word.length >= 2).slice(0, 6);

export const detectToolIntent = (query) => {
  const text = normalize(query);
  const id = String(query).match(/\b[a-f\d]{24}\b/i)?.[0] || null;
  if (/minimum.{0,18}(sepet|siparis)|(sepet|siparis).{0,18}minimum|en az.{0,18}(tl|siparis)|kac tl.{0,30}alisveris|sepet alt limiti/.test(text)) return { name: "getStoreSettings" };
  if (/\b(sepetimde|sepetim|sepetimdeki)\b/.test(text)) return { name: "getMyCart" };
  if (text.includes("kupon") || text.includes("promosyon kodu")) {
    const code = String(query).toLocaleUpperCase("tr-TR").match(/\b[A-Z0-9]{4,20}\b/)?.[0] || null;
    return { name: "getCouponInfo", code };
  }
  if (/siparis|order/.test(text)) {
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
  if (/kampanya|indirim|firsat/.test(text)) return { name: "getActiveCampaigns" };
  if (/urun|stok|fiyat|tl|var mi|bulunuyor/.test(text)) return { name: "searchProducts", terms: getProductSearchTerms(query) };
  return null;
};

const effectivePriceMap = async (products) => {
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
    const products = await Product.find({ isHidden: { $ne: true }, $and: terms.map((term) => ({ name: { $regex: escapeRegex(term), $options: "i" } })) }).select("name price discountedPrice isDiscounted isOutOfStock category").limit(8).lean();
    return { tool: intent.name, found: products.length > 0, products: await effectivePriceMap(products) };
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
    const projection = intent.name === "getOrderDetails" ? "status totalAmount subtotalAmount couponDiscount deliveryPointName createdAt products.name products.quantity products.price" : "status totalAmount deliveryPointName createdAt";
    const orders = intent.name === "getMyActiveOrders"
      ? await Order.find({ ...filter, status: { $in: ["Hazırlanıyor", "Yolda"] } }).sort({ createdAt: -1 }).select(projection).limit(5).lean()
      : await Order.find(filter).sort({ createdAt: -1 }).select(projection).limit(1).lean();
    if (orderId && !orders.length) {
      const exists = await Order.exists({ _id: orderId });
      return { tool: intent.name, found: false, ownershipDenied: Boolean(exists) };
    }
    return { tool: intent.name, found: orders.length > 0, orders: orders.map((order) => ({ id: String(order._id), status: order.status, totalAmount: order.totalAmount, deliveryPoint: order.deliveryPointName, createdAt: order.createdAt, ...(order.products ? { products: order.products.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price })) } : {}), ...(order.couponDiscount ? { couponDiscount: order.couponDiscount } : {}) })) };
  }
  if (intent.name === "getActiveCampaigns") {
    const campaigns = await FlashSale.find({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }).populate({ path: "product", match: { isHidden: { $ne: true } }, select: "name price isOutOfStock" }).sort({ endDate: 1 }).limit(10).lean();
    const active = campaigns.filter((item) => item.product).map((item) => ({ product: item.product.name, discountPercentage: item.discountPercentage, endDate: item.endDate, inStock: !item.product.isOutOfStock }));
    return { tool: intent.name, found: active.length > 0, campaigns: active };
  }
  if (intent.name === "getCouponInfo") {
    const code = String(intent.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) return { tool: intent.name, needsCode: true };
    const coupon = await Coupon.findOne({ code, isActive: true, $or: [{ userId: null }, { userId: authenticatedUserId }] }).select("code description discountType discountPercentage discountAmount minimumOrderAmount expirationDate userId").lean();
    if (!coupon) return { tool: intent.name, found: false };
    const evaluation = await evaluateCoupon(coupon, { userId: authenticatedUserId, now });
    return { tool: intent.name, found: true, code: coupon.code, description: coupon.description, valid: evaluation.valid, reason: evaluation.valid ? null : evaluation.message, discount: coupon.discountType === "percentage" ? `%${coupon.discountPercentage}` : `${coupon.discountAmount} TL`, minimumOrderAmount: coupon.minimumOrderAmount, expirationDate: coupon.expirationDate };
  }
  if (["getStoreInfo", "getStoreSettings", "getStoreOpeningStatus"].includes(intent.name)) {
    return { tool: intent.name, ...await getStoreInfo() };
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
  const allowed = new Set(["searchProducts", "getProductDetails", "getProductStock", "getProductPrice", "getMyActiveOrders", "getMyLastOrder", "getOrderStatus", "getOrderDetails", "getActiveCampaigns", "getCouponInfo", "getStoreInfo", "getMyCart"]);
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
  if (result.tool.startsWith("getMy") && !result.found && result.tool !== "getMyCart") return "Hesabınızda bu ölçüte uyan bir sipariş bulamadım.";
  return null;
};
