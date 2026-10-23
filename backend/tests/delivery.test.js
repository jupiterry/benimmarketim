// Devrek teslimat genişlemesi (Aşama 1) backend'i: ücret kuralı, adrese sipariş bayrağı, yurt (eski)
// sipariş akışının değişmediği, adresli sipariş, bölge yönetimi + işlem kaydı, yurt ↔ ayar eşlemesi,
// kayıtlı adresler, hesap silme ve GET /api/settings sızıntı/önbellek davranışı.
// Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Settings from "../models/settings.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import User from "../models/user.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import DeliveryZone from "../models/deliveryZone.model.js";
import UserAddress from "../models/userAddress.model.js";
import Feedback from "../models/feedback.model.js";
import Chat from "../models/chat.model.js";
import SavedCart from "../models/savedCart.model.js";
import PhotocopyFile from "../models/photocopyFile.model.js";
import Referral from "../models/referral.model.js";
import Coupon from "../models/coupon.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import {
  computeDeliveryQuote,
  canOrderToAddress,
  resolveMinimumOrderAmount,
  slugifyZoneName,
  buildAddressPointName,
  normalizeAddressInput,
  normalizeZoneInput,
  resetYurtSeedState,
} from "../services/delivery.service.js";
import { placeOrder, isAddressOrderRequest, formatOrderHoursMessage } from "../controllers/cart.controller.js";
import {
  getPublicZones,
  getMyDeliveryAccess,
  quoteDelivery,
  adminListZones,
  adminCreateZone,
  adminUpdateZone,
  adminDeleteZone,
  adminBulkUpdateZones,
  adminGetDeliverySettings,
  adminUpdateDeliverySettings,
  turkeyMonthStart,
} from "../controllers/delivery.controller.js";
import { listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress } from "../controllers/address.controller.js";
import { getSettings, updateSettings, invalidateSettingsCache } from "../controllers/settings.controller.js";
import { deleteUserAccount } from "../services/account.service.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const USER = (n) => hex("507f1f77bcf8", n);
const PRODUCT = (n) => hex("99cc", n);
const ADDRESS = (n) => hex("adde55", n);
const ADMIN = { _id: hex("ad", 1), role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  setHeader(key, value) { this.headers[key] = value; },
  json(body) { this.body = body; return this; },
});

// Sorgu zinciri: select/sort/limit/populate kaydedilir; lean() ya da await sonucu döner
const chain = (result) => {
  const resolve = async () => (typeof result === "function" ? result() : result);
  const c = {
    select() { return c; },
    sort() { return c; },
    limit() { return c; },
    populate() { return c; },
    lean: resolve,
    then(onOk, onErr) { return resolve().then(onOk, onErr); },
  };
  return c;
};

// 24 saat açık mağaza; delivery ayarı isteğe göre
const settingsDoc = (fields = {}) =>
  new Settings({
    name: "default",
    orderStartHour: 0, orderStartMinute: 0, orderEndHour: 0, orderEndMinute: 0,
    minimumOrderAmount: 100,
    ...fields,
  });

const mockSettings = (t, fields) => {
  const doc = fields instanceof Settings ? fields : settingsDoc(fields);
  const saves = [];
  doc.save = async () => { saves.push(doc.toObject()); return doc; };
  t.mock.method(Settings, "getSettings", async () => doc);
  const updates = [];
  t.mock.method(Settings, "updateOne", async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 }; });
  return { doc, saves, updates };
};

const ZONES = () => [
  { _id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt", enabled: true, closedReason: "", deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", sortOrder: 0, legacyPoint: "girlsDorm" },
  { _id: "boysDorm", name: "Erkek KYK Yurdu", type: "yurt", enabled: true, closedReason: "", deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", sortOrder: 1, legacyPoint: "boysDorm" },
  { _id: "mah-cumhuriyet", name: "Cumhuriyet Mahallesi", type: "mahalle", enabled: true, closedReason: "", deliveryFee: 40, freeDeliveryThreshold: 500, minimumOrderAmount: null, etaText: "30-60 dk", sortOrder: 5, legacyPoint: null },
  { _id: "koy-yazicik", name: "Yazıcık Köyü", type: "koy", enabled: false, closedReason: "Yol kapalı", deliveryFee: 60, freeDeliveryThreshold: null, minimumOrderAmount: 300, etaText: "", sortOrder: 3, legacyPoint: null },
];

/** DeliveryZone taklidi: bellekte bölge listesi; updateMany/findByIdAndUpdate gerçekten uygulanır */
const mockZones = (t, zones = ZONES()) => {
  const fx = { zones, seeds: [], updateMany: [], created: [], deleted: [] };
  t.mock.method(DeliveryZone, "updateOne", async (filter, update) => { fx.seeds.push({ filter, update }); return {}; });
  t.mock.method(DeliveryZone, "find", (filter = {}) => chain(() => {
    if (filter._id?.$regex) {
      const re = new RegExp(filter._id.$regex);
      return fx.zones.filter((z) => re.test(z._id)).map((z) => ({ _id: z._id }));
    }
    return fx.zones.map((z) => ({ ...z }));
  }));
  t.mock.method(DeliveryZone, "findById", (id) => chain(() => {
    const zone = fx.zones.find((z) => z._id === id);
    return zone ? { ...zone } : null;
  }));
  t.mock.method(DeliveryZone, "findOne", () => chain(() => [...fx.zones].sort((a, b) => b.sortOrder - a.sortOrder)[0] || null));
  t.mock.method(DeliveryZone, "findByIdAndUpdate", (id, update) => chain(() => {
    const zone = fx.zones.find((z) => z._id === id);
    if (!zone) return null;
    Object.assign(zone, update.$set);
    return { ...zone };
  }));
  t.mock.method(DeliveryZone, "updateMany", async (filter, update) => {
    fx.updateMany.push({ filter, update });
    let modified = 0;
    for (const zone of fx.zones) {
      const match = filter._id?.$in ? filter._id.$in.includes(zone._id) : filter.legacyPoint ? zone.legacyPoint === filter.legacyPoint : false;
      if (match) { Object.assign(zone, update.$set); modified += 1; }
    }
    return { matchedCount: modified, modifiedCount: modified };
  });
  t.mock.method(DeliveryZone, "create", async (input) => {
    const model = new DeliveryZone(input); // şema varsayılanları ve doğrulama gerçek
    await model.validate();
    const doc = model.toObject();
    fx.created.push(doc);
    fx.zones.push({ ...doc });
    return { toObject: () => ({ ...doc }) };
  });
  t.mock.method(DeliveryZone, "deleteOne", async (filter) => { fx.deleted.push(filter._id); return { deletedCount: 1 }; });
  return fx;
};

const PRODUCTS = [
  { _id: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Süt", price: 50, category: "sut" },
  { _id: new mongoose.Types.ObjectId(PRODUCT(2)), name: "Ekmek", price: 10, isDiscounted: true, discountedPrice: 8, category: "firin" },
];
const mockCatalog = (t) => {
  t.mock.method(WeeklyProduct, "find", () => chain([]));
  t.mock.method(Product, "find", () => chain(PRODUCTS));
};

const mockOrderCreate = (t) => {
  const created = [];
  t.mock.method(Order, "create", async (doc) => {
    const order = { _id: new mongoose.Types.ObjectId(), status: "Hazırlanıyor", createdAt: new Date(), ...doc };
    created.push(order);
    return order;
  });
  return created;
};

const customer = (n = 1, fields = {}) => ({
  _id: new mongoose.Types.ObjectId(USER(n)),
  name: "Ayşe",
  phone: "05551112233",
  role: "customer",
  cartItems: [{ product: PRODUCT(1), quantity: 1 }],
  saves: 0,
  async save() { this.saves += 1; return this; },
  ...fields,
});

const emits = [];
const orderRequest = (body, user = customer()) => ({
  body,
  user,
  app: { get: (key) => (key === "io" ? { to: () => ({ emit: (event, payload) => emits.push({ event, payload }) }) } : null) },
});

// Mevcut mobil uygulamanın (6.x) gönderdiği gövde
const legacyBody = (fields = {}) => ({
  paymentMethod: "cash",
  products: [{ product: PRODUCT(1), quantity: 2 }, { product: PRODUCT(2), quantity: 5 }],
  totalAmount: 140,
  city: "Devrek",
  phone: "05551112233",
  deliveryPoint: "girlsDorm",
  deliveryPointName: "Kız KYK Yurdu",
  note: "Kapıda arayın",
  device: { platform: "android", model: "Pixel", appVersion: "6.2.0" },
  ...fields,
});

test.beforeEach(() => {
  resetYurtSeedState();
  invalidateSettingsCache();
});

// ── Ücret kuralı ─────────────────────────────────────────────────────────────

test("ücret kuralı: bölge ücretsiz, ücretli, eşik ve kampanya", () => {
  const settings = settingsDoc();
  const paid = { _id: "mah-a", name: "A Mah.", deliveryFee: 40, freeDeliveryThreshold: 500, minimumOrderAmount: null };

  const free = computeDeliveryQuote({ zone: { ...paid, deliveryFee: 0 }, subtotal: 120, settings });
  assert.equal(free.deliveryFee, 0);
  assert.equal(free.isFree, true);
  assert.equal(free.freeReason, "zone");
  assert.equal(free.remainingForFree, null);

  const below = computeDeliveryQuote({ zone: paid, subtotal: 320, settings });
  assert.deepEqual(below, {
    zoneId: "mah-a", zoneName: "A Mah.", subtotal: 320, deliveryFee: 40, isFree: false, freeReason: null,
    remainingForFree: 180, minimumOrderAmount: 100, meetsMinimum: true, total: 360,
  });

  const atThreshold = computeDeliveryQuote({ zone: paid, subtotal: 500, settings });
  assert.equal(atThreshold.deliveryFee, 0);
  assert.equal(atThreshold.freeReason, "threshold");
  assert.equal(atThreshold.remainingForFree, null);
  assert.equal(atThreshold.total, 500);

  const noThreshold = computeDeliveryQuote({ zone: { ...paid, freeDeliveryThreshold: null }, subtotal: 5000, settings });
  assert.equal(noThreshold.deliveryFee, 40);
  assert.equal(noThreshold.remainingForFree, null);

  const campaign = computeDeliveryQuote({ zone: paid, subtotal: 120, settings: settingsDoc({ delivery: { freeDeliveryEverywhere: true } }) });
  assert.equal(campaign.deliveryFee, 0);
  assert.equal(campaign.freeReason, "campaign");
  assert.equal(campaign.total, 120);
});

test("minimum sepet ?? anlamı: 0 = minimum yok, null = genel minimum", () => {
  assert.equal(resolveMinimumOrderAmount({ minimumOrderAmount: 0 }, { minimumOrderAmount: 250 }), 0);
  assert.equal(resolveMinimumOrderAmount({ minimumOrderAmount: null }, { minimumOrderAmount: 0 }), 0);
  assert.equal(resolveMinimumOrderAmount({ minimumOrderAmount: null }, { minimumOrderAmount: 180 }), 180);
  assert.equal(resolveMinimumOrderAmount({ minimumOrderAmount: 300 }, { minimumOrderAmount: 180 }), 300);
  assert.equal(resolveMinimumOrderAmount(null, {}), 250, "tanımsızsa şema varsayılanı");
  const zone = { _id: "z", name: "Z", deliveryFee: 10, minimumOrderAmount: 0 };
  assert.equal(computeDeliveryQuote({ zone, subtotal: 1, settings: { minimumOrderAmount: 250 } }).meetsMinimum, true);
  assert.equal(computeDeliveryQuote({ zone: { ...zone, minimumOrderAmount: 300 }, subtotal: 299.99, settings: {} }).meetsMinimum, false);
});

test("sipariş saati mesajı doğal saat biçiminde", () => {
  assert.equal(formatOrderHoursMessage({ startHour: 10, startMinute: 0, endHour: 1, endMinute: 0 }), "Siparişler yalnızca 10:00 ile 01:00 saatleri arasında verilebilir.");
  assert.equal(formatOrderHoursMessage({ startHour: 9, startMinute: 30, endHour: 23, endMinute: 45 }), "Siparişler yalnızca 09:30 ile 23:45 saatleri arasında verilebilir.");
});

test("yardımcılar: adres doğrulama, kısa ad ve teslimat metni", () => {
  assert.equal(slugifyZoneName("Cumhuriyet Mahallesi", "mahalle"), "mah-cumhuriyet");
  assert.equal(slugifyZoneName("Yazıcık Köyü", "koy"), "koy-yazicik");
  assert.equal(slugifyZoneName("Çaydeğirmeni", "koy"), "koy-caydegirmeni");
  assert.equal(slugifyZoneName("Şirinköy Mah.", "mahalle"), "mah-sirinkoy");
  assert.equal(buildAddressPointName({ name: "Cumhuriyet Mahallesi", type: "mahalle" }, { street: "Atatürk Cd.", buildingNo: "5" }), "Cumhuriyet Mah. · Atatürk Cd. No:5");
  assert.ok(buildAddressPointName({ name: "X", type: "koy" }, { street: "a".repeat(100) }).length <= 60);
  assert.equal(normalizeAddressInput({ zoneId: "mah-a" }).error, "Cadde/sokak bilgisi zorunludur");
  assert.equal(normalizeAddressInput({ zoneId: "mah-a", street: "x", location: { lat: 200, lng: 1 } }).error, "Konum bilgisi geçersiz");
  assert.deepEqual(normalizeAddressInput({ zoneId: "mah-a", street: "  Atatürk   Cd. ", location: { lat: "41.2", lng: 31.95 } }).value.location, { lat: 41.2, lng: 31.95 });
  assert.equal(normalizeZoneInput({ name: "A", type: "mahalle", deliveryFee: -1 }).error.startsWith("Teslimat ücreti"), true);
  assert.deepEqual(normalizeZoneInput({ freeDeliveryThreshold: "", minimumOrderAmount: "150" }, { partial: true }).value, { freeDeliveryThreshold: null, minimumOrderAmount: 150 });
  assert.equal(isAddressOrderRequest(legacyBody()), false);
  assert.equal(isAddressOrderRequest({ zoneId: "girlsDorm" }), false);
  assert.equal(isAddressOrderRequest({ addressId: ADDRESS(1) }), true);
  assert.equal(isAddressOrderRequest({ zoneId: "mah-a", deliveryAddress: {} }), true);
  assert.equal(turkeyMonthStart(new Date("2026-10-31T22:30:00Z")).toISOString(), "2026-10-31T21:00:00.000Z", "TR'de 1 Kasım 01:30 → Kasım");
});

// ── Bayrak: off / pilot / public ─────────────────────────────────────────────

test("adrese sipariş bayrağı: off → hayır, pilot → listedeyse, public → herkes; GET /api/delivery/me", async (t) => {
  const pilot = USER(7);
  assert.equal(canOrderToAddress(settingsDoc(), pilot), false);
  assert.equal(canOrderToAddress(settingsDoc({ delivery: { addressOrdering: "pilot", pilotUserIds: [pilot] } }), pilot), true);
  assert.equal(canOrderToAddress(settingsDoc({ delivery: { addressOrdering: "pilot", pilotUserIds: [pilot] } }), USER(8)), false);
  assert.equal(canOrderToAddress(settingsDoc({ delivery: { addressOrdering: "public" } }), USER(8)), true);

  mockSettings(t, { delivery: { addressOrdering: "pilot", pilotUserIds: [pilot] } });
  const res = response();
  await getMyDeliveryAccess({ user: { _id: pilot } }, res);
  assert.deepEqual(res.body, { addressOrdering: "pilot", canOrderToAddress: true });
  const other = response();
  await getMyDeliveryAccess({ user: { _id: USER(8) } }, other);
  assert.deepEqual(other.body, { addressOrdering: "pilot", canOrderToAddress: false });
});

// ── Eski yurt akışı ──────────────────────────────────────────────────────────

test("yurt siparişi (bayrak kapalı, mevcut uygulama gövdesi): bugünkü gibi, ücret 0, productTotal = toplam", async (t) => {
  mockSettings(t);
  mockCatalog(t);
  const zones = mockZones(t);
  const created = mockOrderCreate(t);
  const user = customer();
  const res = response();
  await placeOrder(orderRequest(legacyBody(), user), res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body), ["success", "message", "orderId", "order"]);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, "Sipariş başarıyla oluşturuldu.");
  assert.equal(created.length, 1);
  const order = created[0];
  // 2 × 50 + 5 × 8 (indirimli)
  assert.equal(order.subtotalAmount, 140);
  assert.equal(order.totalAmount, 140);
  assert.equal(order.productTotal, 140);
  assert.equal(order.deliveryFee, 0);
  assert.equal(order.deliveryPoint, "girlsDorm");
  assert.equal(order.deliveryPointName, "Kız KYK Yurdu");
  assert.equal(order.city, "Devrek");
  assert.equal(order.deliveryType, "point");
  assert.deepEqual(order.deliveryZone, { id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt" });
  assert.equal(order.deliveryAddress, undefined);
  assert.equal(order.paymentMethod, "cash");
  assert.deepEqual(user.cartItems, []);
  assert.equal(user.saves, 1);
  assert.equal(zones.seeds.length, 0, "yurt akışı bölge koleksiyonuna dokunmaz");
  assert.ok(emits.some((e) => e.event === "newOrder" && e.payload.order.deliveryPoint === "girlsDorm"));
});

test("yurt siparişi: genel minimum 0 ise minimum yok (?? anlamı); minimum altı 400 error + message", async (t) => {
  mockCatalog(t);
  mockZones(t);
  const created = mockOrderCreate(t);
  const small = legacyBody({ products: [{ product: PRODUCT(2), quantity: 1 }] }); // 8 TL

  const store = mockSettings(t, { minimumOrderAmount: 0 });
  const ok = response();
  await placeOrder(orderRequest(small), ok);
  assert.equal(ok.statusCode, 201, JSON.stringify(ok.body));
  assert.equal(created.at(-1).totalAmount, 8);

  store.doc.minimumOrderAmount = 250;
  const low = response();
  await placeOrder(orderRequest(small), low);
  assert.equal(low.statusCode, 400);
  assert.equal(low.body.error, "Sipariş tutarı minimum 250 TL olmalıdır!");
  assert.equal(low.body.message, low.body.error);
  assert.equal(created.length, 1);
});

test("place-order 4xx: tanımsız teslimat noktası 400 (500 değil); her hata error + message taşır", async (t) => {
  const store = mockSettings(t);
  mockCatalog(t);
  mockZones(t);
  const created = mockOrderCreate(t);
  const cases = [
    [legacyBody({ deliveryPoint: "mars" }), "Geçersiz teslimat noktası! Lütfen teslimat noktanızı yeniden seçin."],
    [legacyBody({ deliveryPoint: "" }), "Lütfen teslimat noktası seçiniz!"],
    [legacyBody({ products: [] }), "Sepet boş!"],
    [legacyBody({ city: "" }), "Şehir ve telefon numarası zorunludur!"],
    [legacyBody({ paymentMethod: "bitcoin" }), "Geçersiz ödeme yöntemi! Kapıda nakit, kapıda kart ya da havale/EFT seçin."],
  ];
  for (const [body, message] of cases) {
    const res = response();
    await placeOrder(orderRequest(body), res);
    assert.equal(res.statusCode, 400, message);
    assert.equal(res.body.error, message);
    assert.equal(res.body.message, message);
  }
  store.doc.deliveryPoints.boysDorm.enabled = false;
  const closed = response();
  await placeOrder(orderRequest(legacyBody({ deliveryPoint: "boysDorm" })), closed);
  assert.equal(closed.statusCode, 400);
  assert.equal(closed.body.message, "Seçilen teslimat noktası şu anda aktif değil!");
  assert.equal(created.length, 0);
});

test("place-order: şema doğrulama hatası (geçersiz telefon) okunur mesajla 400", async (t) => {
  mockSettings(t);
  mockCatalog(t);
  mockZones(t);
  t.mock.method(Order, "create", async (doc) => {
    await new Order(doc).validate();
    return doc;
  });
  const res = response();
  await placeOrder(orderRequest(legacyBody({ phone: "123" })), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Geçerli bir telefon numarası girin! (En az 10 rakam)");
  assert.equal(res.body.error, res.body.message);
});

// ── Adresli sipariş ──────────────────────────────────────────────────────────

const addressBody = (fields = {}) => ({
  paymentMethod: "card",
  products: [{ product: PRODUCT(1), quantity: 4 }], // 200 TL
  phone: "05551112233",
  zoneId: "mah-cumhuriyet",
  deliveryAddress: { street: "Atatürk Cd.", buildingNo: "5", floor: "2", apartment: "4", directions: "Eczanenin üstü", location: { lat: 41.2167, lng: 31.95 } },
  // İstemcinin gönderdiği tutarlar yok sayılır
  totalAmount: 1, deliveryFee: 0,
  note: "",
  ...fields,
});

test("adresli sipariş: bayrak kapalıyken 400 'Adrese teslimat henüz açık değil' (error + message)", async (t) => {
  mockSettings(t);
  mockCatalog(t);
  mockZones(t);
  const created = mockOrderCreate(t);
  for (const body of [addressBody(), addressBody({ zoneId: undefined, deliveryAddress: undefined, addressId: ADDRESS(1) }), legacyBody({ deliveryPoint: "address" })]) {
    const res = response();
    await placeOrder(orderRequest(body), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "Adrese teslimat henüz açık değil");
    assert.equal(res.body.message, "Adrese teslimat henüz açık değil");
  }
  assert.equal(created.length, 0);
});

test("adresli sipariş (pilot kullanıcı): ücret sunucuda hesaplanır, city/deliveryPointName/deliveryZone yazılır", async (t) => {
  const user = customer(3);
  mockSettings(t, { delivery: { addressOrdering: "pilot", pilotUserIds: [user._id] } });
  mockCatalog(t);
  mockZones(t);
  const created = mockOrderCreate(t);

  // Pilot olmayan kullanıcı reddedilir
  const outsider = response();
  await placeOrder(orderRequest(addressBody(), customer(4)), outsider);
  assert.equal(outsider.statusCode, 400);
  assert.equal(outsider.body.message, "Adrese teslimat henüz açık değil");

  const res = response();
  await placeOrder(orderRequest(addressBody(), user), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body), ["success", "message", "orderId", "order"]);
  const order = created[0];
  assert.equal(order.subtotalAmount, 200);
  assert.equal(order.productTotal, 200);
  assert.equal(order.deliveryFee, 40, "eşik 500, sepet 200 → ücretli");
  assert.equal(order.totalAmount, 240);
  assert.equal(order.city, "Devrek");
  assert.equal(order.deliveryPoint, "address");
  assert.equal(order.deliveryType, "address");
  assert.equal(order.deliveryPointName, "Cumhuriyet Mah. · Atatürk Cd. No:5");
  assert.deepEqual(order.deliveryZone, { id: "mah-cumhuriyet", name: "Cumhuriyet Mahallesi", type: "mahalle" });
  assert.deepEqual(order.deliveryAddress, {
    zoneId: "mah-cumhuriyet", zoneName: "Cumhuriyet Mahallesi", street: "Atatürk Cd.", buildingNo: "5", buildingName: "",
    floor: "2", apartment: "4", directions: "Eczanenin üstü", location: { lat: 41.2167, lng: 31.95 },
  });
  assert.equal(order.paymentMethod, "card");
  // Şemaya uygun (gerçek Order doğrulaması)
  await new Order({ ...order, _id: undefined }).validate();

  // Eşik üstü → ücretsiz
  const big = response();
  await placeOrder(orderRequest(addressBody({ products: [{ product: PRODUCT(1), quantity: 10 }] }), user), big);
  assert.equal(big.statusCode, 201);
  assert.equal(created[1].deliveryFee, 0);
  assert.equal(created[1].totalAmount, 500);
});

test("adresli sipariş: kayıtlı adres (addressId) yalnızca sahibinden okunur", async (t) => {
  const user = customer(5);
  mockSettings(t, { delivery: { addressOrdering: "public" } });
  mockCatalog(t);
  mockZones(t);
  const created = mockOrderCreate(t);
  const lookups = [];
  t.mock.method(UserAddress, "findOne", (filter) => {
    lookups.push(filter);
    return chain(String(filter.user) === String(user._id) && filter._id === ADDRESS(1)
      ? { _id: ADDRESS(1), user: user._id, zoneId: "mah-cumhuriyet", street: "İnönü Sk.", buildingNo: "12", buildingName: "Gül Apt.", floor: "", apartment: "", directions: "", location: null }
      : null);
  });

  const res = response();
  await placeOrder(orderRequest({ paymentMethod: "cash", products: [{ product: PRODUCT(1), quantity: 4 }], phone: "05551112233", addressId: ADDRESS(1) }, user), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].deliveryPointName, "Cumhuriyet Mah. · İnönü Sk. No:12");
  assert.equal(created[0].deliveryAddress.buildingName, "Gül Apt.");
  assert.equal(created[0].deliveryAddress.location, null);
  assert.equal(String(lookups[0].user), String(user._id));

  const foreign = response();
  await placeOrder(orderRequest({ products: [{ product: PRODUCT(1), quantity: 4 }], phone: "05551112233", addressId: ADDRESS(1) }, customer(6)), foreign);
  assert.equal(foreign.statusCode, 404);
  assert.ok(foreign.body.error && foreign.body.message);
  assert.equal(created.length, 1);
});

test("adresli sipariş: kapalı bölge 400 (kapanma nedeniyle), bölge minimumu altı 400, bilinmeyen bölge 400", async (t) => {
  mockSettings(t, { delivery: { addressOrdering: "public" } });
  mockCatalog(t);
  const zones = mockZones(t);
  const created = mockOrderCreate(t);

  const closed = response();
  await placeOrder(orderRequest(addressBody({ zoneId: "koy-yazicik" })), closed);
  assert.equal(closed.statusCode, 400);
  assert.equal(closed.body.code, "ZONE_CLOSED");
  assert.match(closed.body.message, /Yazıcık Köyü bölgesine şu anda teslimat yapılamıyor \(Yol kapalı\)/);
  assert.equal(closed.body.error, closed.body.message);

  zones.zones.find((z) => z._id === "koy-yazicik").enabled = true;
  const low = response();
  await placeOrder(orderRequest(addressBody({ zoneId: "koy-yazicik" })), low); // 200 < 300
  assert.equal(low.statusCode, 400);
  assert.equal(low.body.code, "BELOW_MINIMUM");
  assert.equal(low.body.message, "Yazıcık Köyü için sipariş tutarı minimum 300 TL olmalıdır!");

  const unknown = response();
  await placeOrder(orderRequest(addressBody({ zoneId: "mah-yok" })), unknown);
  assert.equal(unknown.statusCode, 400);
  assert.equal(unknown.body.code, "ZONE_NOT_FOUND");

  const noStreet = response();
  await placeOrder(orderRequest(addressBody({ deliveryAddress: { buildingNo: "3" } })), noStreet);
  assert.equal(noStreet.statusCode, 400);
  assert.equal(noStreet.body.message, "Cadde/sokak bilgisi zorunludur");
  assert.equal(created.length, 0);
});

// ── Herkese açık bölgeler ve teklif ──────────────────────────────────────────

test("GET /api/delivery/zones: yalnızca açık bölgeler, sıralı; yurt açık/kapalı ayarlardan gelir; tohumlama idempotent", async (t) => {
  const store = mockSettings(t, { minimumOrderAmount: 150 });
  store.doc.deliveryPoints.boysDorm.enabled = false;
  const zones = mockZones(t);
  const res = response();
  await getPublicZones({}, res);
  assert.deepEqual(res.body, {
    zones: [
      { id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt", deliveryFee: 0, isFree: true, freeDeliveryThreshold: null, minimumOrderAmount: 150, etaText: "", requiresFirstOrderCallback: false },
      { id: "mah-cumhuriyet", name: "Cumhuriyet Mahallesi", type: "mahalle", deliveryFee: 40, isFree: false, freeDeliveryThreshold: 500, minimumOrderAmount: 150, etaText: "30-60 dk", requiresFirstOrderCallback: false },
    ],
    freeDeliveryEverywhere: false,
  });
  // Tohumlama: iki yurt, $setOnInsert + upsert; ikinci çağrı tekrar yazmaz
  assert.equal(zones.seeds.length, 2);
  assert.ok(zones.seeds.every((s) => s.update.$setOnInsert && s.update.$setOnInsert.deliveryFee === 0 && s.update.$setOnInsert.type === "yurt"));
  assert.equal(zones.seeds.find((s) => s.filter._id === "boysDorm").update.$setOnInsert.enabled, false, "seed ayardaki değeri alır");
  await getPublicZones({}, response());
  assert.equal(zones.seeds.length, 2);
});

test("POST /api/delivery/quote: sunucu fiyatlarıyla ücret, eşiğe kalan ve minimum", async (t) => {
  mockSettings(t, { minimumOrderAmount: 100 });
  mockCatalog(t);
  mockZones(t);
  const res = response();
  await quoteDelivery({ user: customer(), body: { zoneId: "mah-cumhuriyet", products: [{ product: PRODUCT(1), quantity: 2 }, { _id: PRODUCT(2), quantity: 5 }] } }, res);
  assert.deepEqual(res.body, {
    zoneId: "mah-cumhuriyet", zoneName: "Cumhuriyet Mahallesi", subtotal: 140, deliveryFee: 40, isFree: false, freeReason: null,
    remainingForFree: 360, minimumOrderAmount: 100, meetsMinimum: true, total: 180,
  });
  const closed = response();
  await quoteDelivery({ user: customer(), body: { zoneId: "koy-yazicik", products: [] } }, closed);
  assert.equal(closed.statusCode, 400);
  assert.equal(closed.body.code, "ZONE_CLOSED");
  const missing = response();
  await quoteDelivery({ user: customer(), body: { zoneId: "yok", products: [] } }, missing);
  assert.equal(missing.statusCode, 404);
  const bad = response();
  await quoteDelivery({ user: customer(), body: { zoneId: "mah-cumhuriyet", products: [{ product: PRODUCT(1), quantity: 500 }] } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.ok(bad.body.message && bad.body.error);
});

// ── Yönetici: bölgeler ───────────────────────────────────────────────────────

const adminReq = (body = {}, params = {}, method = "PUT") => ({ body, params, user: ADMIN, method, originalUrl: "/api/delivery/admin/zones" });
const captureAudit = (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  return writes;
};

test("yönetici toplu güncelleme: seçili bölgelere uygulanır, işlem kaydı yazılır, yurt kapatılınca ayar da kapanır", async (t) => {
  const store = mockSettings(t);
  const zones = mockZones(t);
  const audits = captureAudit(t);
  const req = adminReq({ ids: ["mah-cumhuriyet", "girlsDorm", "yok"], set: { deliveryFee: 0, enabled: false } }, {}, "PATCH");
  const res = response();
  await adminBulkUpdateZones(req, res);
  await tick();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.updated, 2);
  assert.deepEqual(zones.updateMany[0].filter, { _id: { $in: ["girlsDorm", "mah-cumhuriyet"] } });
  assert.deepEqual(zones.updateMany[0].update, { $set: { enabled: false, deliveryFee: 0 } });
  assert.deepEqual(store.updates, [{ filter: { name: "default" }, update: { $set: { "deliveryPoints.girlsDorm.enabled": false } } }]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].category, "settings");
  assert.equal(audits[0].action, "2 teslimat bölgesi toplu güncellendi");
  assert.deepEqual(audits[0].meta, { ids: ["girlsDorm", "mah-cumhuriyet"] });
  assert.deepEqual(audits[0].changes.map((c) => [c.label, c.to]), [["Teslimat", "Kapalı"], ["Teslimat ücreti", "Ücretsiz"]]);
  assert.equal(req.auditRecorded, true);

  const invalid = response();
  await adminBulkUpdateZones(adminReq({ ids: ["mah-cumhuriyet"], set: { name: "x" } }), invalid);
  assert.equal(invalid.statusCode, 400);
  const empty = response();
  await adminBulkUpdateZones(adminReq({ ids: [], set: { deliveryFee: 5 } }), empty);
  assert.equal(empty.statusCode, 400);
});

test("yönetici bölge listesi: sipariş sayıları (eski yurt siparişleri deliveryPoint ile eşlenir)", async (t) => {
  mockSettings(t);
  mockZones(t);
  let pipeline;
  t.mock.method(Order, "aggregate", async (p) => { pipeline = p; return [{ _id: "girlsDorm", ordersTotal: 12, ordersThisMonth: 3 }, { _id: "mah-cumhuriyet", ordersTotal: 1, ordersThisMonth: 1 }]; });
  const res = response();
  await adminListZones(adminReq({}, {}, "GET"), res);
  assert.deepEqual(pipeline[0].$group._id, { $ifNull: ["$deliveryZone.id", "$deliveryPoint"] });
  const byId = Object.fromEntries(res.body.zones.map((z) => [z.id, z]));
  assert.equal(res.body.zones.length, 4, "kapalı bölgeler de listelenir");
  assert.deepEqual([byId.girlsDorm.ordersTotal, byId.girlsDorm.ordersThisMonth], [12, 3]);
  assert.deepEqual([byId["koy-yazicik"].ordersTotal, byId["koy-yazicik"].closedReason], [0, "Yol kapalı"]);
  assert.equal(byId["mah-cumhuriyet"].deliveryFee, 40);
});

test("yönetici bölge ekleme / güncelleme / silme: kısa ad, çakışma eki, yurt koruması, siparişli bölge 409", async (t) => {
  const store = mockSettings(t);
  const zones = mockZones(t);
  const audits = captureAudit(t);

  const created = response();
  await adminCreateZone(adminReq({ name: "Cumhuriyet Mahallesi", type: "mahalle", deliveryFee: 25, etaText: "45 dk" }, {}, "POST"), created);
  await tick();
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.equal(created.body.zone._id, "mah-cumhuriyet-2", "var olan 'mah-cumhuriyet' ile çakışınca sayı eki");
  assert.equal(created.body.zone.enabled, false, "yeni bölge varsayılan kapalı");
  assert.equal(created.body.zone.sortOrder, 6);
  assert.equal(created.body.zone.legacyPoint, null);
  assert.equal(audits.at(-1).action, "Teslimat bölgesi eklendi: Cumhuriyet Mahallesi");

  const badType = response();
  await adminCreateZone(adminReq({ name: "X", type: "il" }, {}, "POST"), badType);
  assert.equal(badType.statusCode, 400);

  // Yurt bölgesi kapatılınca ayar da kapanır (iki yönlü eşleme)
  const yurt = response();
  await adminUpdateZone(adminReq({ enabled: false, closedReason: "Yoğunluk" }, { id: "boysDorm" }), yurt);
  await tick();
  assert.equal(yurt.statusCode, 200, JSON.stringify(yurt.body));
  assert.equal(yurt.body.zone.enabled, false);
  assert.deepEqual(store.updates.at(-1).update, { $set: { "deliveryPoints.boysDorm.enabled": false } });
  assert.deepEqual(audits.at(-1).changes.map((c) => c.label), ["Teslimat", "Kapanma nedeni"]);
  const typeChange = response();
  await adminUpdateZone(adminReq({ type: "mahalle" }, { id: "boysDorm" }), typeChange);
  assert.equal(typeChange.statusCode, 400);

  // Silme kuralları
  t.mock.method(Order, "exists", async (filter) => filter.$or.some((c) => c["deliveryZone.id"] === "mah-cumhuriyet"));
  t.mock.method(UserAddress, "countDocuments", async () => 0);
  const protectedYurt = response();
  await adminDeleteZone(adminReq({}, { id: "girlsDorm" }, "DELETE"), protectedYurt);
  assert.equal(protectedYurt.statusCode, 409);
  const withOrders = response();
  await adminDeleteZone(adminReq({}, { id: "mah-cumhuriyet" }, "DELETE"), withOrders);
  assert.equal(withOrders.statusCode, 409);
  assert.equal(withOrders.body.code, "ZONE_HAS_ORDERS");
  const ok = response();
  await adminDeleteZone(adminReq({}, { id: "koy-yazicik" }, "DELETE"), ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(zones.deleted, ["koy-yazicik"]);
  const missing = response();
  await adminDeleteZone(adminReq({}, { id: "yok" }, "DELETE"), missing);
  assert.equal(missing.statusCode, 404);
});

test("yurt eşlemesi: ayarlardan (SettingsTab) yurt kapatılınca bölge belgesi de güncellenir", async (t) => {
  const store = mockSettings(t);
  const zones = mockZones(t);
  captureAudit(t);
  const res = response();
  await updateSettings({ user: ADMIN, method: "PUT", originalUrl: "/api/settings", body: { deliveryPoints: { girlsDorm: { enabled: false, name: "Kız Yurdu" } } } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(store.saves.length, 1);
  assert.deepEqual(zones.updateMany.find((u) => u.filter.legacyPoint === "girlsDorm").update, { $set: { enabled: false, name: "Kız Yurdu" } });
  assert.equal(zones.zones.find((z) => z._id === "girlsDorm").enabled, false);
  assert.equal(zones.zones.find((z) => z._id === "boysDorm").enabled, true);
});

test("yönetici teslimat ayarları: bayrak, kampanya, pilot kullanıcılar (yalnızca var olanlar) + işlem kaydı", async (t) => {
  const store = mockSettings(t);
  const audits = captureAudit(t);
  const existing = [{ _id: new mongoose.Types.ObjectId(USER(1)), name: "Ali", email: "ali@x.com", phone: "0555" }];
  t.mock.method(User, "find", (filter) => chain(existing.filter((u) => (filter._id.$in || []).map(String).includes(String(u._id)))));

  const bad = response();
  await adminUpdateDeliverySettings(adminReq({ addressOrdering: "acik" }), bad);
  assert.equal(bad.statusCode, 400);

  const res = response();
  const req = adminReq({ addressOrdering: "pilot", freeDeliveryEverywhere: true, pilotUserIds: [USER(1), USER(2), USER(1)] });
  await adminUpdateDeliverySettings(req, res);
  await tick();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.addressOrdering, "pilot");
  assert.equal(res.body.freeDeliveryEverywhere, true);
  assert.deepEqual(res.body.pilotUsers, [{ _id: existing[0]._id, name: "Ali", email: "ali@x.com", phone: "0555" }]);
  assert.deepEqual(store.doc.delivery.pilotUserIds.map(String), [USER(1)]);
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].changes.map((c) => c.label), ["Adrese sipariş", "Tüm bölgelerde ücretsiz teslimat", "Pilot kullanıcılar"]);

  const get = response();
  await adminGetDeliverySettings(adminReq({}, {}, "GET"), get);
  assert.deepEqual(get.body, { addressOrdering: "pilot", freeDeliveryEverywhere: true, pilotUsers: res.body.pilotUsers });
});

// ── GET /api/settings: sızıntı yok, önbellek ────────────────────────────────

test("GET /api/settings pilotUserIds'i (ve teslimat bayrağını) asla göstermez; mevcut alanlar aynen kalır; ~10 sn önbellek", async (t) => {
  const doc = settingsDoc({ delivery: { addressOrdering: "pilot", pilotUserIds: [USER(1)], freeDeliveryEverywhere: true } });
  const store = mockSettings(t, doc);
  const res = response();
  await getSettings({}, res);
  const json = JSON.parse(JSON.stringify(res.body));
  assert.equal("delivery" in json, false);
  assert.equal(JSON.stringify(json).includes("pilotUserIds"), false);
  assert.equal(JSON.stringify(json).includes(USER(1)), false);
  for (const key of ["minimumOrderAmount", "orderStartHour", "orderStartMinute", "orderEndHour", "orderEndMinute", "deliveryPoints", "bankTransfer", "appVersion", "ai", "_id"]) {
    assert.ok(key in json, `${key} korunur`);
  }
  assert.deepEqual(Object.keys(json.deliveryPoints.girlsDorm), ["name", "enabled", "startHour", "startMinute", "endHour", "endMinute"]);

  // Önbellek: ikinci istek veritabanına gitmez; güncelleme önbelleği boşaltır
  const calls = () => Settings.getSettings.mock.callCount();
  const before = calls();
  await getSettings({}, response());
  assert.equal(calls(), before, "10 sn içinde önbellekten");
  captureAudit(t);
  const put = response();
  await updateSettings({ user: ADMIN, method: "PUT", originalUrl: "/api/settings", body: { minimumOrderAmount: 0 } }, put);
  assert.equal(put.statusCode, 200);
  assert.equal(JSON.stringify(put.body).includes("pilotUserIds"), false, "PUT yanıtı da sızdırmaz");
  assert.equal(store.doc.minimumOrderAmount, 0);
  const afterPut = calls();
  const fresh = response();
  await getSettings({}, fresh);
  assert.equal(calls(), afterPut + 1, "güncellemeden sonra yeniden okunur");
  assert.equal(JSON.parse(JSON.stringify(fresh.body)).minimumOrderAmount, 0);
});

// ── Kayıtlı adresler ─────────────────────────────────────────────────────────

/** UserAddress taklidi: bellekte kullanıcı adresleri, kaydedilebilir belgeler */
const mockAddresses = (t, initial = []) => {
  const fx = { rows: initial.map((a) => ({ ...a })), deleteMany: [] };
  const docOf = (row) => Object.assign(Object.create({
    async save() { Object.assign(row, this, { updatedAt: new Date() }); return this; },
  }), row);
  const match = (row, filter = {}) =>
    (filter.user === undefined || String(row.user) === String(filter.user)) &&
    (filter._id === undefined || (filter._id?.$ne !== undefined ? String(row._id) !== String(filter._id.$ne) : String(row._id) === String(filter._id))) &&
    (filter.isDefault === undefined || row.isDefault === filter.isDefault) &&
    (filter.zoneId === undefined || row.zoneId === filter.zoneId);
  t.mock.method(UserAddress, "find", (filter) => chain(() => fx.rows.filter((r) => match(r, filter)).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map((r) => ({ ...r }))));
  t.mock.method(UserAddress, "findOne", (filter) => {
    const row = fx.rows.find((r) => match(r, filter));
    const doc = row ? docOf(row) : null;
    return { lean: async () => (row ? { ...row } : null), sort() { return this; }, then: (ok, err) => Promise.resolve(doc).then(ok, err) };
  });
  t.mock.method(UserAddress, "countDocuments", async (filter) => fx.rows.filter((r) => match(r, filter)).length);
  t.mock.method(UserAddress, "create", async (doc) => {
    const row = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date(), ...doc };
    fx.rows.push(row);
    return row;
  });
  t.mock.method(UserAddress, "updateMany", async (filter, update) => {
    for (const row of fx.rows) if (match(row, filter)) Object.assign(row, update.$set);
    return {};
  });
  t.mock.method(UserAddress, "deleteOne", async (filter) => {
    fx.rows = fx.rows.filter((r) => !match(r, filter));
    return { deletedCount: 1 };
  });
  t.mock.method(UserAddress, "deleteMany", async (filter) => { fx.deleteMany.push(filter); return { deletedCount: 0 }; });
  return fx;
};

const addrReq = (user, body = {}, params = {}) => ({ user, body, params, method: "POST", originalUrl: "/api/addresses" });

test("adresler: ekleme (ilk adres varsayılan), en fazla 5, başkasının adresi 404, varsayılan değişimi, silme", async (t) => {
  mockSettings(t);
  mockZones(t);
  const owner = customer(1);
  const other = customer(2);
  const fx = mockAddresses(t);
  const input = { label: "Ev", zoneId: "mah-cumhuriyet", street: "Atatürk Cd.", buildingNo: "5", location: { lat: 41.2, lng: 31.9 } };

  const first = response();
  const req = addrReq(owner, input);
  await createAddress(req, first);
  assert.equal(first.statusCode, 201, JSON.stringify(first.body));
  assert.equal(req.auditRecorded, true, "müşteri adres işlemi yönetici kaydına yazılmaz");
  assert.equal(first.body.address.isDefault, true);
  assert.equal(first.body.address.zoneName, "Cumhuriyet Mahallesi");
  assert.equal(first.body.address.zoneEnabled, true);
  assert.deepEqual(first.body.address.location, { lat: 41.2, lng: 31.9 });

  const closedZone = response();
  await createAddress(addrReq(owner, { ...input, zoneId: "koy-yazicik" }), closedZone);
  assert.equal(closedZone.statusCode, 400);

  const second = response();
  await createAddress(addrReq(owner, { ...input, label: "İş", isDefault: true }), second);
  assert.equal(second.body.address.isDefault, true);
  assert.equal(fx.rows.filter((r) => r.isDefault).length, 1, "tek varsayılan");

  for (let i = 0; i < 3; i += 1) await createAddress(addrReq(owner, { ...input, label: `A${i}` }), response());
  assert.equal(fx.rows.length, 5);
  const sixth = response();
  await createAddress(addrReq(owner, input), sixth);
  assert.equal(sixth.statusCode, 400);
  assert.equal(sixth.body.code, "ADDRESS_LIMIT");
  assert.match(sixth.body.message, /En fazla 5 adres/);
  // Başka kullanıcı kendi sınırına tabidir
  const otherFirst = response();
  await createAddress(addrReq(other, input), otherFirst);
  assert.equal(otherFirst.statusCode, 201);

  const ownId = String(first.body.address._id);
  for (const [handler, body] of [[updateAddress, { street: "Hack" }], [deleteAddress, {}], [setDefaultAddress, {}]]) {
    const res = response();
    await handler(addrReq(other, body, { id: ownId }), res);
    assert.equal(res.statusCode, 404, handler.name);
  }
  assert.equal(fx.rows.find((r) => String(r._id) === ownId).street, "Atatürk Cd.");
  const badId = response();
  await updateAddress(addrReq(owner, {}, { id: "x" }), badId);
  assert.equal(badId.statusCode, 404);

  const updated = response();
  await updateAddress(addrReq(owner, { street: "İnönü Sk.", directions: "Mavi kapı" }, { id: ownId }), updated);
  assert.equal(updated.statusCode, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.address.street, "İnönü Sk.");

  const makeDefault = response();
  await setDefaultAddress(addrReq(owner, {}, { id: ownId }), makeDefault);
  assert.equal(makeDefault.body.address.isDefault, true);
  assert.equal(fx.rows.filter((r) => String(r.user) === String(owner._id) && r.isDefault).length, 1);

  const removed = response();
  await deleteAddress(addrReq(owner, {}, { id: ownId }), removed);
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.body.addresses.length, 4);
  assert.equal(removed.body.addresses.filter((a) => a.isDefault).length, 1, "varsayılan silinince başka adres varsayılan olur");

  const list = response();
  await listAddresses(addrReq(other), list);
  assert.equal(list.body.addresses.length, 1);
  assert.equal(list.body.max, 5);
});

// ── Hesap silme ──────────────────────────────────────────────────────────────

test("hesap silme kayıtlı adresleri de siler", async (t) => {
  const userId = USER(9);
  t.mock.method(User, "findById", () => chain({ _id: userId, avatar: "" }));
  t.mock.method(Order, "updateMany", async () => ({ modifiedCount: 0 }));
  t.mock.method(Feedback, "deleteMany", async () => ({}));
  t.mock.method(Chat, "find", () => ({ distinct: async () => [] }));
  t.mock.method(SupportRequest, "deleteMany", async () => ({}));
  t.mock.method(SavedCart, "deleteMany", async () => ({}));
  t.mock.method(PhotocopyFile, "find", () => chain([]));
  t.mock.method(PhotocopyFile, "deleteMany", async () => ({}));
  t.mock.method(Referral, "deleteMany", async () => ({}));
  t.mock.method(Referral, "updateMany", async () => ({}));
  t.mock.method(Coupon, "deleteMany", async () => ({}));
  t.mock.method(Coupon, "updateMany", async () => ({}));
  t.mock.method(User, "findByIdAndDelete", async () => ({}));
  const fx = mockAddresses(t);
  await deleteUserAccount(userId);
  assert.equal(fx.deleteMany.length, 1);
  assert.equal(String(fx.deleteMany[0].user), userId);
});
