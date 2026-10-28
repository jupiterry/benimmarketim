import Product from "../models/product.model.js";
import { normalizePaymentMethod } from "../lib/paymentMethods.js";
import Order from "../models/order.model.js";
import Settings from "../models/settings.model.js";
import { redis } from "../lib/redis.js";
import {
  buildOrderProducts,
  validateAndCalculateCoupon,
  commitCouponUsage,
  dispatchOrderNotifications,
} from "../services/order.service.js";
import { applyCartSync, normalizeSyncedCart } from "../services/cartSync.service.js";
import { meetsMinimumAmount } from "../services/productPricing.js";
import UserAddress from "../models/userAddress.model.js";
import {
  DEVREK_CITY,
  LEGACY_POINTS,
  buildAddressPointName,
  buildOrderAddress,
  canOrderToAddress,
  computeDeliveryQuote,
  getZone,
  isValidObjectId,
  legacyZoneNeedsCallback,
  needsFirstOrderCallback,
  normalizeAddressInput,
  resolveMinimumOrderAmount,
  validateAddressForZone,
  roundMoney,
  zoneClosedMessage,
  zoneSnapshot,
} from "../services/delivery.service.js";

// ─────────────────────────────────────────────────────────────────
// #12 — Sipariş saatleri: Redis-based cache (PM2 cluster uyumlu)
// In-memory global değişken yerine Redis kullanılır; böylece tüm
// worker process'ler aynı, güncel veriyi görür.
// ─────────────────────────────────────────────────────────────────
const ORDER_HOURS_CACHE_KEY = "order_hours_cache";
const CACHE_TTL_SECONDS = 60; // 1 dakika

/** Sipariş saatleri ayarlarını Redis'ten veya DB'den getirir. */
const getOrderHoursSettings = async () => {
  try {
    const cached = await redis.get(ORDER_HOURS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis erişim hatası → DB'ye düş
  }

  const settings = await Settings.getSettings();
  const hours = {
    startHour: settings.orderStartHour,
    startMinute: settings.orderStartMinute,
    endHour: settings.orderEndHour,
    endMinute: settings.orderEndMinute,
  };

  try {
    await redis.set(ORDER_HOURS_CACHE_KEY, JSON.stringify(hours), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Redis yazma hatası → sessizce devam et
  }

  return hours;
};

/** Admin ayarları değiştirdiğinde cache'i temizler. */
export const refreshOrderHoursCache = async () => {
  try {
    await redis.del(ORDER_HOURS_CACHE_KEY);
    // Hemen yeniden doldur (ilk isteği hızlandırmak için)
    await getOrderHoursSettings();
    return true;
  } catch (error) {
    console.error("Sipariş saatleri önbelleği yenilenirken hata:", error);
    return false;
  }
};

/** Şimdiki Türkiye saatinin sipariş aralığı içinde olup olmadığını kontrol eder. */
const isWithinOrderHours = async () => {
  const nowTr = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" })
  );

  const hours = await getOrderHoursSettings();

  const currentTimeInMinutes = nowTr.getHours() * 60 + nowTr.getMinutes();
  const startTimeInMinutes = hours.startHour * 60 + hours.startMinute;
  const rawEndTimeInMinutes = hours.endHour * 60 + hours.endMinute;

  // 00:00 kapanış saati: başlangıç 00:00 değilse günün sonuna (24:00) eşitlenir
  const endTimeInMinutes =
    rawEndTimeInMinutes === 0 && startTimeInMinutes !== 0
      ? 24 * 60
      : rawEndTimeInMinutes;

  // 00:00–00:00: 24 saat açık
  if (startTimeInMinutes === 0 && endTimeInMinutes === 0) {
    return true;
  }

  // Normal durum (aynı gün): ör. 10:00–22:00
  if (startTimeInMinutes < endTimeInMinutes) {
    return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
  }

  // Gece yarısını geçen durum: ör. 22:00–02:00
  return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
};

const clockText = (hour, minute) => `${String(Number(hour) || 0).padStart(2, "0")}:${String(Number(minute) || 0).padStart(2, "0")}`;

/** Sipariş saati hata mesajı: "Siparişler yalnızca 10:00 ile 01:00 saatleri arasında verilebilir." */
export const formatOrderHoursMessage = (hours) =>
  `Siparişler yalnızca ${clockText(hours.startHour, hours.startMinute)} ile ${clockText(hours.endHour, hours.endMinute)} saatleri arasında verilebilir.`;

const getOrderHoursMessage = async () => {
  try {
    return formatOrderHoursMessage(await getOrderHoursSettings());
  } catch {
    return "Siparişler yalnızca belirlenen saatler arasında verilebilir.";
  }
};

// ─────────────────────────────────────────────────────────────────
// #6 — addToCart: Saat kontrolü KALDIRILDI (kötü UX)
// Kullanıcı iş saatleri dışında sepetini hazırlayabilmeli.
// Saat kontrolü yalnızca placeOrder'da yapılır.
//
// #1 — Sepet toplam miktar üst sınırı: Mevcut + yeni miktar
// birlikte MAX_CART_ITEM_QTY'yi geçemez.
// ─────────────────────────────────────────────────────────────────
const MAX_CART_ITEM_QTY = 99;

export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const user = req.user;

    if (!productId) {
      return res.status(400).json({ error: "Ürün ID eksik!" });
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_CART_ITEM_QTY) {
      return res.status(400).json({ error: "Geçersiz miktar! (1–99 arası olmalı)" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Ürün bulunamadı!" });
    }
    if (product.isHidden) {
      return res.status(400).json({ error: `"${product.name}" artık satışta değil.` });
    }
    if (product.isOutOfStock) {
      return res.status(400).json({ error: `"${product.name}" şu anda stokta yok.` });
    }

    const existingItem = user.cartItems.find(
      (item) => item.product?.toString() === productId
    );

    // #1 — Toplamda üst sınır kontrolü
    const currentQty = existingItem?.quantity ?? 0;
    const newQty = currentQty + qty;

    if (newQty > MAX_CART_ITEM_QTY) {
      return res.status(400).json({
        error: `Bir üründen en fazla ${MAX_CART_ITEM_QTY} adet ekleyebilirsiniz. (Sepette: ${currentQty})`,
      });
    }

    if (existingItem) {
      existingItem.quantity = newQty;
      existingItem.addedAt = new Date();
    } else {
      user.cartItems.push({ product: productId, quantity: qty, addedAt: new Date() });
    }

    user.cartLastUpdated = new Date();
    await user.save({ validateModifiedOnly: true });
    res.status(200).json(user.cartItems);
  } catch (error) {
    console.error("Sepete ürün eklerken hata:", error.message);
    res.status(500).json({ message: "Sepete ürün eklenirken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Sepetteki ürünleri getir
// ─────────────────────────────────────────────
export const getCartProducts = async (req, res) => {
  try {
    const validCartItems = req.user.cartItems.filter((item) => item.product);
    const products = await Product.find({
      _id: { $in: validCartItems.map((item) => item.product) },
    }).lean();

    // Fiyatlandırma (haftalık/indirimli) order.service ile aynı kuralla hesaplanır.
    // Sepet görünümünde gizli/stoksuz ürün hata vermez; sipariş anında reddedilir.
    const { orderProducts } = await buildOrderProducts(
      validCartItems.map((item) => ({
        product: item.product.toString(),
        quantity: item.quantity,
      })),
      { checkAvailability: false }
    );
    const pricingMap = new Map(
      orderProducts.map((item) => [item.product.toString(), item])
    );

    const cartItems = products.map((product) => {
      const item = validCartItems.find(
        (cartItem) => cartItem.product.toString() === product._id.toString()
      );
      const pricing = pricingMap.get(product._id.toString());
      return {
        ...product,
        price: pricing?.price ?? product.price,
        originalPrice: product.price,
        actualPrice: pricing?.price ?? product.price,
        isDiscounted: Boolean(pricing && pricing.price < product.price),
        discountedPrice: pricing && pricing.price < product.price ? pricing.price : null,
        quantity: item.quantity,
      };
    });

    res.json(cartItems);
  } catch (error) {
    console.error("getCartProducts hatası:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Mobil uygulamadaki sepeti sunucuya eşitle (ayrıntı: services/cartSync.service.js)
// PUT /api/cart/sync  { items: [{ productId, quantity }] }
// ─────────────────────────────────────────────
export const syncCart = async (req, res) => {
  try {
    const items = normalizeSyncedCart(req.body?.items);
    if (!items) return res.status(400).json({ success: false, message: "Sepet içeriği okunamadı" });
    const changed = await applyCartSync(req.user, items);
    res.json({ success: true, changed, count: items.length });
  } catch (error) {
    console.error("syncCart hatası:", error.message);
    res.status(500).json({ success: false, message: "Sepet eşitlenemedi" });
  }
};

// ─────────────────────────────────────────────
// Sepeti temizle
// ─────────────────────────────────────────────
export const clearCart = async (req, res) => {
  try {
    const user = req.user;
    user.cartItems = [];
    user.cartLastUpdated = new Date();
    await user.save({ validateModifiedOnly: true });
    res.json(user.cartItems);
  } catch (error) {
    console.error("clearCart hatası:", error.message);
    res.status(500).json({ message: "Sepet temizlenirken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Sepetten ürün kaldır
// ─────────────────────────────────────────────
export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const user = req.user;

    if (!productId) {
      return res.status(400).json({ message: "Ürün ID gerekli" });
    }

    user.cartItems = user.cartItems.filter(
      (item) => item.product && item.product.toString() !== productId
    );
    user.cartLastUpdated = new Date();
    await user.save({ validateModifiedOnly: true });
    res.json(user.cartItems);
  } catch (error) {
    console.error("removeFromCart hatası:", error.message);
    res.status(500).json({ message: "Ürün sepetten kaldırılırken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────
// Sepet ürün miktarını güncelle
// ─────────────────────────────────────────────
export const updateQuantity = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { quantity } = req.body;
    const user = req.user;

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_CART_ITEM_QTY) {
      return res.status(400).json({ message: "Geçersiz miktar! (0–99 arası)" });
    }

    const existingItem = user.cartItems.find(
      (item) => item.product && item.product.toString() === productId
    );

    if (!existingItem) {
      return res.status(404).json({ message: "Ürün sepette bulunamadı" });
    }

    if (qty === 0) {
      user.cartItems = user.cartItems.filter(
        (item) => item.product.toString() !== productId
      );
    } else {
      existingItem.quantity = qty;
    }

    user.cartLastUpdated = new Date();
    await user.save({ validateModifiedOnly: true });
    res.json(user.cartItems);
  } catch (error) {
    console.error("updateQuantity hatası:", error.message);
    res.status(500).json({ message: "Miktar güncellenirken hata oluştu", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// #2 — Sipariş oluşturma: Ortak order.service.js kullanılıyor
// Fiyat hesaplama, kupon doğrulama ve bildirimler tek bir serviste.
//
// İki akış:
//  - Yurt (eski) akışı: deliveryPoint = girlsDorm | boysDorm, adres alanı yok. Bugünkü davranış;
//    teslimat ücreti HER ZAMAN 0. (Yeni istemci zoneId = girlsDorm | boysDorm da gönderebilir.)
//  - Adres akışı: gövdede addressId ya da deliveryAddress (+ zoneId) varsa. Yalnızca
//    settings.delivery.addressOrdering izin veriyorsa; ücret ve minimum sunucuda hesaplanıp kilitlenir.
//    Devrek bölgesinde mahalle/sokak/bina no/konum zorunlu; konum yüklü sınırın dışındaysa 400 OUT_OF_AREA,
//    sınır yüklenmemişse sipariş alınır ve areaVerified: false yazılır.
// Her 4xx yanıtı hem `error` (web) hem `message` (mobil) taşır.
// ─────────────────────────────────────────────────────────────────
const fail = (res, status, message, extra = {}) => res.status(status).json({ error: message, message, ...extra });

const hasValue = (value) => value !== undefined && value !== null && value !== "";

/** Gövde adrese teslimat mı istiyor? */
export const isAddressOrderRequest = (body = {}) => {
  if (hasValue(body.addressId)) return true;
  if (body.deliveryAddress && typeof body.deliveryAddress === "object") return true;
  if (body.deliveryPoint === "address") return true;
  // zoneId tek başına: yurt bölgesi eski akışa gider, diğerleri adres ister
  return hasValue(body.zoneId) && !LEGACY_POINTS.includes(body.zoneId);
};

const orderChannel = (body) => body.channel || body.device?.platform || "web";

/** Kupon kaydı, sepet temizliği, telefon güncellemesi, bildirimler ve 201 yanıtı (iki akış için ortak). */
const finalizeOrder = async (req, res, newOrder, appliedCoupon, phone) => {
  // Kupon kullanımını atomik olarak kaydet (order.service)
  if (appliedCoupon) {
    await commitCouponUsage(appliedCoupon, req.user._id, newOrder._id);
    // commitCouponUsage hata atarsa sipariş otomatik silinir
  }

  // Sepeti temizle
  req.user.cartItems = [];
  // Siparişte girilen numara profildekinden farklıysa profil güncellenir;
  // böylece uygulama bir sonraki siparişte doğru numarayı önerir.
  const orderPhone = String(phone).trim();
  if (orderPhone && orderPhone !== (req.user.phone || "")) {
    req.user.phone = orderPhone;
  }
  await req.user.save({ validateModifiedOnly: true });

  // Referral ödülü artık sipariş oluşturulduğunda değil, ilk sipariş "Teslim Edildi"
  // olduğunda verilir (ordersAnalytics.controller.js → grantReferralRewardIfDelivered).

  // Sipariş alarmı + Socket.IO admin bildirimi (order.service — arka planda)
  const io = req.app?.get?.("io");
  dispatchOrderNotifications(io, newOrder, req.user);

  if (res.locals && typeof res.locals === "object") res.locals.createdOrder = newOrder;
  else res.locals = { createdOrder: newOrder };
  return res.status(201).json({
    success: true,
    message: "Sipariş başarıyla oluşturuldu.",
    orderId: newOrder._id,
    order: newOrder,
  });
};

/** Adrese teslimat akışı (placeOrder ortak kontrollerden sonra çağırır). */
const placeAddressOrder = async (req, res, { products, phone, note, couponCode, paymentMethod }) => {
  const body = req.body || {};
  if (!phone) return fail(res, 400, "Telefon numarası zorunludur!");

  const settings = await Settings.getSettings();
  if (!canOrderToAddress(settings, req.user._id)) {
    return fail(res, 400, "Adrese teslimat henüz açık değil", { code: "ADDRESS_ORDERING_DISABLED" });
  }

  // Adres: kayıtlı adres (addressId) ya da gövdedeki adres (zoneId + deliveryAddress)
  let address;
  if (hasValue(body.addressId)) {
    const addressId = String(body.addressId);
    const saved = isValidObjectId(addressId)
      ? await UserAddress.findOne({ _id: addressId, user: req.user._id }).lean()
      : null;
    if (!saved) return fail(res, 404, "Kayıtlı adres bulunamadı. Lütfen adresinizi yeniden seçin.");
    address = saved;
  } else {
    if (!body.deliveryAddress || typeof body.deliveryAddress !== "object") {
      return fail(res, 400, "Lütfen teslimat adresinizi girin.");
    }
    const { value, error } = normalizeAddressInput({
      ...body.deliveryAddress,
      zoneId: hasValue(body.zoneId) ? body.zoneId : body.deliveryAddress.zoneId,
    });
    if (error) return fail(res, 400, error);
    address = value;
  }

  const zone = await getZone(address.zoneId, { settings, withArea: true });
  if (!zone) return fail(res, 400, "Teslimat bölgesi bulunamadı. Lütfen adresinizi güncelleyin.", { code: "ZONE_NOT_FOUND" });
  if (!zone.enabled) return fail(res, 400, zoneClosedMessage(zone), { code: "ZONE_CLOSED", closedReason: zone.closedReason || "" });
  // Bölge kuralları: Devrek'te mahalle/sokak/bina no/konum zorunlu ve konum yüklü sınırın içinde olmalı
  const areaCheck = validateAddressForZone(address, zone);
  if (areaCheck.error) return fail(res, 400, areaCheck.error, { code: areaCheck.code });

  // Fiyat hesaplama (order.service) ve teslimat ücreti (delivery.service) — istemci değerleri kullanılmaz.
  // Tüm tutarlar kuruşa yuvarlanır; minimum kuruş üzerinden karşılaştırılır (tam 250,00 TL geçer).
  const { orderProducts, totalAmount: rawSubtotal } = await buildOrderProducts(products);
  const subtotal = roundMoney(rawSubtotal);
  const quote = computeDeliveryQuote({ zone, subtotal, settings });
  if (!quote.meetsMinimum) {
    return fail(res, 400, `${zone.name} için sipariş tutarı minimum ${quote.minimumOrderAmount} TL olmalıdır!`, {
      code: "BELOW_MINIMUM",
      minimumOrderAmount: quote.minimumOrderAmount,
    });
  }

  const { appliedCoupon, couponDiscount } = await validateAndCalculateCoupon(couponCode, req.user._id, subtotal, {
    orderProducts,
    deliveryPoint: zone.legacyPoint || "address",
    deliveryZone: zone._id,
    canOrderToAddress: true,
    channel: orderChannel(body),
  });

  const productTotal = roundMoney(Math.max(0, subtotal - roundMoney(couponDiscount)));
  const deliveryFee = roundMoney(quote.deliveryFee);
  // Bölgede "ilk siparişte telefonla teyit" açıksa ve müşterinin teslim edilmiş siparişi yoksa
  const needsCallback = await needsFirstOrderCallback(zone, req.user._id);

  const newOrder = await Order.create({
    user: req.user._id,
    products: orderProducts,
    totalAmount: roundMoney(productTotal + deliveryFee),
    subtotalAmount: subtotal,
    productTotal,
    deliveryFee,
    city: DEVREK_CITY,
    phone,
    note: note || "",
    deliveryPoint: "address",
    deliveryPointName: buildAddressPointName(zone, address),
    deliveryType: "address",
    deliveryZone: zoneSnapshot(zone),
    deliveryAddress: buildOrderAddress(zone, address),
    couponCode: appliedCoupon?.code || null,
    couponDiscount: roundMoney(couponDiscount),
    paymentMethod,
    needsCallback,
    // Devrek: alan yüklüyse ve konum içindeyse true, alan yüklenmemişken false; yurtta alan yok
    ...(typeof areaCheck.areaVerified === "boolean" ? { areaVerified: areaCheck.areaVerified } : {}),
  });

  return finalizeOrder(req, res, newOrder, appliedCoupon, phone);
};

// ─────────────────────────────────────────────────────────────────
// Mükerrer sipariş koruması
// Çift dokunuş ya da zaman aşımı sonrası yeniden deneme aynı siparişi ikinci kez oluşturmasın.
//  - Aynı kullanıcının sipariş istekleri sırayla işlenir (API tek PM2 sürecinde çalışır).
//  - Aynı kullanıcı DUPLICATE_WINDOW_MS içinde aynı ürün/adet ve aynı teslimat hedefiyle yeniden
//    isterse yeni sipariş açılmaz; ilk sipariş 200 ve duplicate: true ile döner.
// ─────────────────────────────────────────────────────────────────
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const orderQueues = new Map(); // userId → son işin bitiş sözü
const recentOrders = new Map(); // userId → { signature, at, order }

/** Sepet, teslimat hedefi, kupon, telefon ve nottan sıra bağımsız imza (aynı ürün iki satırda ise adetler toplanır) */
export const orderSignature = (body = {}) => {
  const quantities = new Map();
  for (const item of Array.isArray(body.products) ? body.products : []) {
    const id = String(item?.product?._id ?? item?.product ?? "");
    quantities.set(id, (quantities.get(id) || 0) + (Number(item?.quantity) || 0));
  }
  const items = [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([id, qty]) => `${id}x${qty}`).join(",");
  const target = body.addressId ? `a:${body.addressId}`
    : body.deliveryAddress && typeof body.deliveryAddress === "object"
      ? `d:${body.zoneId || body.deliveryAddress.zoneId || ""}:${body.deliveryAddress.street || ""}:${body.deliveryAddress.buildingNo || ""}`
      : `p:${body.deliveryPoint || body.zoneId || ""}`;
  const extras = [body.couponCode, body.phone, body.note].map((value) => String(value ?? "").trim().toUpperCase());
  return `${items}|${target}|${extras.join("|")}`;
};

/** Aynı kullanıcının işlerini sırayla çalıştırır; hata kuyruğu kilitlemez */
export const runSerializedForUser = async (userId, task) => {
  const key = String(userId);
  const previous = orderQueues.get(key) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(() => {}, () => {});
  orderQueues.set(key, tail);
  try {
    return await run;
  } finally {
    if (orderQueues.get(key) === tail) orderQueues.delete(key);
  }
};

const findRecentDuplicate = (userId, signature, now = Date.now()) => {
  for (const [key, entry] of recentOrders) if (now - entry.at > DUPLICATE_WINDOW_MS) recentOrders.delete(key);
  const entry = recentOrders.get(String(userId));
  return entry && entry.signature === signature ? entry : null;
};

/** Testler için: koruma belleğini temizler */
export const resetDuplicateOrderGuard = () => {
  orderQueues.clear();
  recentOrders.clear();
};

export const placeOrder = (req, res) => {
  const userId = req.user?._id;
  if (!userId) return placeOrderUnguarded(req, res);
  return runSerializedForUser(userId, async () => {
    const signature = orderSignature(req.body || {});
    let duplicate = findRecentDuplicate(userId, signature);
    // İlk sipariş bu arada iptal edildiyse aynı sepet yeniden verilebilir (okunamazsa mükerrer sayılır)
    if (duplicate) {
      const current = await Order.findById(duplicate.order?._id).select("status").lean().catch(() => null);
      if (current?.status === "İptal Edildi") {
        recentOrders.delete(String(userId));
        duplicate = null;
      }
    }
    if (duplicate) {
      console.warn(`Mükerrer sipariş isteği engellendi: kullanıcı ${userId}, sipariş ${duplicate.order?._id}`);
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: "Bu sipariş zaten alındı.",
        orderId: duplicate.order?._id,
        order: duplicate.order,
      });
    }
    await placeOrderUnguarded(req, res);
    // finalizeOrder başarılı siparişi res.locals.createdOrder'a yazar
    const order = res.locals?.createdOrder;
    if (order) recentOrders.set(String(userId), { signature, at: Date.now(), order });
  });
};

const placeOrderUnguarded = async (req, res) => {
  try {
    // Sipariş saati kontrolü (sadece sipariş verirken)
    if (!(await isWithinOrderHours())) {
      return fail(res, 400, await getOrderHoursMessage());
    }

    const body = req.body || {};
    const { products, city, phone, note, deliveryPointName, couponCode } = body;
    // Yeni istemci yurdu bölge olarak (zoneId) gönderebilir; eski istemci deliveryPoint gönderir
    const deliveryPoint = body.deliveryPoint || (LEGACY_POINTS.includes(body.zoneId) ? body.zoneId : body.deliveryPoint);

    // Ödeme yöntemi: uygulama seçimi zorunlu tutar. Alanı hiç göndermeyen eski
    // uygulama sürümleri için sipariş "Belirtilmedi" olarak kaydedilir.
    const rawPaymentMethod = body.paymentMethod;
    const paymentMethod = normalizePaymentMethod(rawPaymentMethod);
    if (rawPaymentMethod !== undefined && rawPaymentMethod !== null && rawPaymentMethod !== "" && !paymentMethod) {
      return fail(res, 400, "Geçersiz ödeme yöntemi! Kapıda nakit, kapıda kart ya da havale/EFT seçin.");
    }

    // Zorunlu alan kontrolleri
    if (!products || products.length === 0) {
      return fail(res, 400, "Sepet boş!");
    }

    if (isAddressOrderRequest(body)) {
      return await placeAddressOrder(req, res, { products, phone, note, couponCode, paymentMethod });
    }

    if (!city || !phone) {
      return fail(res, 400, "Şehir ve telefon numarası zorunludur!");
    }
    if (!deliveryPoint) {
      return fail(res, 400, "Lütfen teslimat noktası seçiniz!");
    }
    if (!LEGACY_POINTS.includes(deliveryPoint)) {
      return fail(res, 400, "Geçersiz teslimat noktası! Lütfen teslimat noktanızı yeniden seçin.");
    }

    // Minimum tutar ve teslimat noktası ayarlarını tek sorguda al
    const settings = await Settings.getSettings();
    // `??` anlamı: panelde 0 = minimum yok (yalnızca tanımsızsa varsayılan 250)
    const minimumOrderAmount = resolveMinimumOrderAmount(null, settings);

    // Teslimat noktası kontrolü
    const deliveryPointsStatus = settings.deliveryPoints;
    if (!deliveryPointsStatus) {
      return fail(res, 400, "Teslimat noktaları ayarları bulunamadı!");
    }

    const selectedPoint = deliveryPointsStatus[deliveryPoint];

    if (!selectedPoint?.enabled) {
      return fail(res, 400, "Seçilen teslimat noktası şu anda aktif değil!");
    }

    // Fiyat hesaplama (order.service) — kuruşa yuvarlanmış; minimum kuruş üzerinden karşılaştırılır
    const { orderProducts, totalAmount: rawTotalAmount } = await buildOrderProducts(products);
    const totalAmount = roundMoney(rawTotalAmount);

    if (!meetsMinimumAmount(totalAmount, minimumOrderAmount)) {
      return fail(res, 400, `Sipariş tutarı minimum ${minimumOrderAmount} TL olmalıdır!`);
    }

    // Kupon doğrulama (order.service)
    const { appliedCoupon, couponDiscount } = await validateAndCalculateCoupon(
      couponCode,
      req.user._id,
      totalAmount,
      {
        orderProducts,
        deliveryPoint,
        deliveryZone: deliveryPoint,
        channel: orderChannel(body),
      }
    );

    const finalTotalAmount = roundMoney(Math.max(0, totalAmount - roundMoney(couponDiscount)));
    // Yurt bölgesinde "ilk siparişte telefonla teyit" açıksa (bölge okunamazsa teyitsiz alınır)
    const needsCallback = await legacyZoneNeedsCallback(deliveryPoint, req.user._id);

    // Sipariş kaydet (yurt siparişi: teslimat ücreti yok, productTotal = ödenecek tutar)
    const newOrder = await Order.create({
      user: req.user._id,
      products: orderProducts,
      totalAmount: finalTotalAmount,
      subtotalAmount: totalAmount,
      productTotal: finalTotalAmount,
      deliveryFee: 0,
      city,
      phone,
      note: note || "",
      deliveryPoint,
      deliveryPointName: deliveryPointName || "",
      deliveryType: "point",
      deliveryZone: { id: deliveryPoint, name: selectedPoint.name || "", type: "yurt" },
      couponCode: appliedCoupon?.code || null,
      couponDiscount: roundMoney(couponDiscount),
      paymentMethod,
      needsCallback,
    });

    return await finalizeOrder(req, res, newOrder, appliedCoupon, phone);
  } catch (error) {
    // Şema doğrulaması (ör. geçersiz telefon) istemci hatasıdır: ilk alanın okunur mesajıyla 400
    if (error?.name === "ValidationError" && error._message === "Order validation failed" && error.errors) {
      const first = Object.values(error.errors)[0];
      const message = first?.message || "Sipariş bilgileri geçersiz";
      return res.status(400).json({ message, error: message, details: error.errors });
    }
    // commitCouponUsage'dan gelen 409 hatası
    const statusCode = error.statusCode || 500;
    console.error("Sipariş oluşturulurken hata:", error.message);
    res.status(statusCode).json({
      message: error.message || "Sipariş oluşturulurken hata oluştu",
      error: error.message,
      details: error.errors || {},
    });
  }
};
