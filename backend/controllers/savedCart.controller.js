import mongoose from "mongoose";
import SavedCart from "../models/savedCart.model.js";
import Product from "../models/product.model.js";
import { effectivePriceMap } from "../services/ai/tools.js";

export const MAX_SAVED_CARTS = 10;
export const MAX_SAVED_CART_ITEMS = 40;

const isId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const sameName = (a, b) => String(a).trim().toLocaleLowerCase("tr-TR") === String(b).trim().toLocaleLowerCase("tr-TR");

/** İstek gövdesini doğrular; aynı ürün birden fazla kez geldiyse adetleri birleştirir. */
export const validateSavedCart = (body) => {
  const name = String(body?.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return { error: "Sepet adı 2–40 karakter olmalıdır." };
  if (!Array.isArray(body?.items) || !body.items.length) return { error: "Kaydedilecek ürün bulunamadı." };
  const merged = new Map();
  for (const item of body.items) {
    const productId = String(item?.productId ?? "");
    const quantity = Number(item?.quantity);
    if (!isId(productId) || !Number.isInteger(quantity) || quantity < 1) return { error: "Sepetteki ürünler okunamadı." };
    merged.set(productId, Math.min((merged.get(productId) || 0) + quantity, 20));
  }
  if (merged.size > MAX_SAVED_CART_ITEMS) return { error: `Bir favori sepette en fazla ${MAX_SAVED_CART_ITEMS} çeşit ürün olabilir.` };
  return { data: { name, items: [...merged].map(([productId, quantity]) => ({ productId, quantity })) } };
};

// Kayıtlı sepetleri güncel fiyat ve stok bilgisiyle döndürür.
const present = async (carts) => {
  const ids = [...new Set(carts.flatMap((cart) => cart.items.map((item) => String(item.product))))];
  const products = ids.length
    ? await Product.find({ _id: { $in: ids } }).select("name price discountedPrice isDiscounted isOutOfStock isHidden category").lean()
    : [];
  const visible = products.filter((product) => !product.isHidden);
  const priced = new Map((await effectivePriceMap(visible)).map((product) => [String(product.id), product]));
  return carts.map((cart) => {
    const items = cart.items.map((item) => {
      const current = priced.get(String(item.product));
      const available = Boolean(current?.inStock);
      return { productId: String(item.product), name: current?.name || item.name, quantity: item.quantity, price: available ? current.price : null, available };
    });
    const total = items.reduce((sum, item) => sum + (item.available ? item.price * item.quantity : 0), 0);
    return {
      id: String(cart._id),
      name: cart.name,
      items,
      availableCount: items.filter((item) => item.available).length,
      total: Math.round(total * 100) / 100,
      updatedAt: cart.updatedAt,
    };
  });
};

// GET /api/saved-carts
export const listSavedCarts = async (req, res) => {
  const carts = await SavedCart.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(MAX_SAVED_CARTS).lean();
  res.json({ success: true, carts: await present(carts), limit: MAX_SAVED_CARTS });
};

// POST /api/saved-carts  { name, items: [{ productId, quantity }] }
// Aynı adla kayıtlı sepet varsa üzerine yazılır; böylece müşteri listesini güncelleyebilir.
export const saveSavedCart = async (req, res) => {
  const { data, error } = validateSavedCart(req.body);
  if (error) return res.status(400).json({ success: false, message: error });
  const products = await Product.find({ _id: { $in: data.items.map((item) => item.productId) }, isHidden: { $ne: true } }).select("name").lean();
  const names = new Map(products.map((product) => [String(product._id), product.name]));
  const items = data.items.filter((item) => names.has(item.productId))
    .map((item) => ({ product: new mongoose.Types.ObjectId(item.productId), name: names.get(item.productId), quantity: item.quantity }));
  if (!items.length) return res.status(400).json({ success: false, message: "Bu ürünler artık satışta olmadığı için sepet kaydedilemedi." });

  const existing = await SavedCart.find({ user: req.user._id }).select("name").lean();
  const match = existing.find((cart) => sameName(cart.name, data.name));
  if (!match && existing.length >= MAX_SAVED_CARTS) {
    return res.status(400).json({ success: false, message: `En fazla ${MAX_SAVED_CARTS} favori sepet kaydedebilirsiniz. Yenisini eklemek için birini silin.` });
  }
  const saved = match
    ? await SavedCart.findOneAndUpdate({ _id: match._id, user: req.user._id }, { $set: { name: data.name, items } }, { new: true }).lean()
    : (await SavedCart.create({ user: req.user._id, name: data.name, items })).toObject();
  if (!saved) return res.status(404).json({ success: false, message: "Favori sepet bulunamadı." });
  const [cart] = await present([saved]);
  res.status(match ? 200 : 201).json({ success: true, replaced: Boolean(match), cart });
};

// DELETE /api/saved-carts/:id
export const deleteSavedCart = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: "Geçersiz sepet." });
  const result = await SavedCart.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!result?.deletedCount) return res.status(404).json({ success: false, message: "Favori sepet bulunamadı." });
  res.json({ success: true });
};
