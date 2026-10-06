// Mobil uygulama sepeti telefonda tutar. Sepet hatırlatması ve "sepetinde ürün olanlar" bildirimi
// sunucudaki sepete baktığı için uygulama, sepet değiştikçe son hâlini sunucuya yollar.
export const MAX_SYNCED_CART_ITEMS = 100;

/** İstek gövdesini temizler: geçersiz satırlar atılır, aynı ürün birleştirilir. Geçersiz gövdede null döner. */
export const normalizeSyncedCart = (items) => {
  if (!Array.isArray(items)) return null;
  const merged = new Map();
  for (const item of items.slice(0, MAX_SYNCED_CART_ITEMS)) {
    const productId = String(item?.productId ?? "");
    const quantity = Math.floor(Number(item?.quantity));
    if (!/^[a-f\d]{24}$/i.test(productId) || !(quantity >= 1)) continue;
    merged.set(productId, Math.min((merged.get(productId) || 0) + quantity, 99));
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
};

const cartSignature = (items) => items.map((item) => `${item.productId}:${item.quantity}`).sort().join("|");

/**
 * Kullanıcının sunucudaki sepetini telefondaki sepete eşitler.
 * Sepet değişmediyse dokunulmaz; aksi halde her uygulama açılışı hatırlatma süresini sıfırlardı.
 * @returns {Promise<boolean>} sepet değiştiyse true
 */
export const applyCartSync = async (user, items, now = new Date()) => {
  const current = (user.cartItems || []).filter((item) => item.product)
    .map((item) => ({ productId: String(item.product), quantity: item.quantity || 1 }));
  if (cartSignature(current) === cartSignature(items)) return false;
  user.cartItems = items.map((item) => ({ product: item.productId, quantity: item.quantity, addedAt: now }));
  user.cartLastUpdated = now;
  await user.save();
  return true;
};
