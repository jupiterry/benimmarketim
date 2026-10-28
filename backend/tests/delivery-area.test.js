// Sabit teslimat bölgeleri (girlsDorm, boysDorm, devrek) ve Devrek teslimat alanı: nokta-çokgen testi
// (MultiPolygon + delikler), sadeleştirme, OUT_OF_AREA (adres ekleme/düzenleme ve sipariş), alan yüklü değilken
// areaVerified: false, OpenStreetMap (Nominatim) yükleme uç noktası (global fetch taklit edilir; mağazayı içeren en
// küçük aday seçilir), aday seçme/kaldırma, herkese açık alan uç noktası ve ZONES_FIXED.
// Veritabanı ve ağ yok: modeller t.mock.method ile, fetch globalThis.fetch ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Settings from "../models/settings.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import DeliveryZone from "../models/deliveryZone.model.js";
import UserAddress from "../models/userAddress.model.js";
import {
  OUT_OF_AREA_MESSAGE,
  STORE_POINT,
  areaKm2Of,
  countAreaPoints,
  isAreaGeometry,
  pointInArea,
  resetYurtSeedState,
  simplifyAreaGeometry,
  validateAddressForZone,
} from "../services/delivery.service.js";
import { NOMINATIM_USER_AGENT, clearAreaCache, nominatimConfig } from "../services/deliveryArea.service.js";
import { placeOrder, resetDuplicateOrderGuard } from "../controllers/cart.controller.js";
import {
  adminClearZoneArea,
  adminCreateZone,
  adminDeleteZone,
  adminFetchZoneArea,
  adminListZones,
  adminSelectZoneArea,
  getPublicZoneArea,
  getPublicZones,
} from "../controllers/delivery.controller.js";
import { createAddress, listAddresses, updateAddress } from "../controllers/address.controller.js";
import { invalidateSettingsCache } from "../controllers/settings.controller.js";
import deliveryRouter from "../routes/delivery.route.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const USER = (n) => hex("507f1f77bcf8", n);
const PRODUCT = (n) => hex("99cc", n);
const ADMIN = { _id: hex("ad", 1), role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

const response = () => ({
  statusCode: 200,
  headers: {},
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  set(key, value) { this.headers[key] = value; return this; },
  setHeader(key, value) { this.headers[key] = value; },
  json(body) { this.body = body; return this; },
});

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

// ── Geometri fikstürleri (GeoJSON: [boylam, enlem]) ─────────────────────────
const rect = (lng1, lat1, lng2, lat2) => [[lng1, lat1], [lng2, lat1], [lng2, lat2], [lng1, lat2], [lng1, lat1]];
// Devrek merkez (mağaza noktasını içerir) ~5,6 km²
const TOWN = { type: "Polygon", coordinates: [rect(31.94, 41.21, 31.97, 41.23)] };
// Devrek ilçesi (köyler dahil) — çok daha büyük
const DISTRICT = { type: "Polygon", coordinates: [rect(31.8, 41.1, 32.1, 41.35)] };
// Mağazayı içermeyen bir çokgen
const ELSEWHERE = { type: "Polygon", coordinates: [rect(31.0, 41.0, 31.1, 41.1)] };
const INSIDE = { lat: 41.2207, lng: 31.9563 };
const OUTSIDE = { lat: 41.30, lng: 32.0 }; // ilçede ama merkez sınırının dışında

// ── Saf fonksiyonlar ─────────────────────────────────────────────────────────

test("nokta-çokgen: Polygon, delik (hole), MultiPolygon ve geçersiz girdiler", () => {
  assert.equal(pointInArea(INSIDE, TOWN), true);
  assert.equal(pointInArea(OUTSIDE, TOWN), false);
  assert.equal(pointInArea(STORE_POINT, TOWN), true, "mağaza noktası merkezde");
  // Delikli çokgen: delik içindeki nokta dışarıda sayılır
  const withHole = { type: "Polygon", coordinates: [rect(31.94, 41.21, 31.97, 41.23), rect(31.95, 41.215, 31.96, 41.225)] };
  assert.equal(pointInArea({ lat: 41.22, lng: 31.955 }, withHole), false, "delikte");
  assert.equal(pointInArea({ lat: 41.212, lng: 31.942 }, withHole), true, "dış halka içinde, delik dışında");
  // MultiPolygon: parçalardan herhangi birinde
  const multi = { type: "MultiPolygon", coordinates: [[rect(31.0, 41.0, 31.1, 41.1)], withHole.coordinates] };
  assert.equal(pointInArea({ lat: 41.05, lng: 31.05 }, multi), true);
  assert.equal(pointInArea({ lat: 41.212, lng: 31.942 }, multi), true);
  assert.equal(pointInArea({ lat: 41.22, lng: 31.955 }, multi), false);
  assert.equal(pointInArea({ lat: 40, lng: 30 }, multi), false);
  // Geçersiz
  assert.equal(pointInArea(null, TOWN), false);
  assert.equal(pointInArea({ lat: "x", lng: 31.95 }, TOWN), false);
  assert.equal(pointInArea(INSIDE, null), false);
  assert.equal(pointInArea(INSIDE, { type: "Point", coordinates: [31.95, 41.22] }), false);
  assert.equal(isAreaGeometry(TOWN), true);
  assert.equal(isAreaGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 1]]] }), false, "halka en az 4 nokta");
  assert.equal(isAreaGeometry({ type: "LineString", coordinates: [] }), false);
});

test("alan hesabı ve Douglas-Peucker sadeleştirme", () => {
  const km2 = areaKm2Of(TOWN);
  assert.ok(km2 > 5.2 && km2 < 6.0, `~5,6 km² (${km2})`);
  assert.ok(areaKm2Of(DISTRICT) > km2 * 50);
  const withHole = { type: "Polygon", coordinates: [rect(31.94, 41.21, 31.97, 41.23), rect(31.95, 41.215, 31.96, 41.225)] };
  assert.ok(areaKm2Of(withHole) < km2, "delik alandan düşülür");

  // Kenarları çok sık noktalı (her biri doğru üzerinde) büyük bir halka: sadeleşince köşeler kalır
  const dense = [];
  const steps = 1500;
  for (let i = 0; i < steps; i += 1) dense.push([31.94 + (0.03 * i) / steps, 41.21]);
  for (let i = 0; i < steps; i += 1) dense.push([31.97, 41.21 + (0.02 * i) / steps]);
  for (let i = 0; i < steps; i += 1) dense.push([31.97 - (0.03 * i) / steps, 41.23]);
  for (let i = 0; i < steps; i += 1) dense.push([31.94, 41.23 - (0.02 * i) / steps]);
  dense.push(dense[0]);
  const big = { type: "Polygon", coordinates: [dense] };
  const simplified = simplifyAreaGeometry(big);
  const ring = simplified.coordinates[0];
  assert.ok(countAreaPoints(simplified) < 20, `sadeleşti (${countAreaPoints(simplified)} nokta)`);
  assert.deepEqual(ring[0], ring.at(-1), "halka kapalı kalır");
  assert.equal(pointInArea(INSIDE, simplified), true);
  assert.ok(Math.abs(areaKm2Of(simplified) - km2) < 0.05, "alan korunur");
  // Küçük çokgen yalnızca yuvarlanır
  const small = simplifyAreaGeometry({ type: "Polygon", coordinates: [rect(31.9400001234, 41.21, 31.97, 41.23)] });
  assert.equal(small.coordinates[0][0][0], 31.94);
  assert.equal(countAreaPoints(small), 5);
});

test("adres kuralı: alan yüklüyse dışarıdaki konum OUT_OF_AREA, içerideki doğrulanır; yüklü değilse areaVerified false", () => {
  const address = { neighborhood: "Cumhuriyet", street: "Atatürk Cd.", buildingNo: "5", location: INSIDE };
  const devrek = { _id: "devrek", type: "ilce", area: { ...TOWN, osmType: "relation", osmId: 1 } };
  assert.deepEqual(validateAddressForZone(address, devrek), { areaVerified: true });
  assert.deepEqual(validateAddressForZone({ ...address, location: OUTSIDE }, devrek), { error: OUT_OF_AREA_MESSAGE, code: "OUT_OF_AREA", areaVerified: false });
  assert.deepEqual(validateAddressForZone(address, { ...devrek, area: null }), { areaVerified: false });
  assert.equal(OUT_OF_AREA_MESSAGE, "Bu adres teslimat alanımızın dışında. Haritada Devrek sınırı içinde bir nokta seç.");
});

// ── Taklitler ────────────────────────────────────────────────────────────────

const settingsDoc = (fields = {}) => new Settings({
  name: "default", orderStartHour: 0, orderStartMinute: 0, orderEndHour: 0, orderEndMinute: 0, minimumOrderAmount: 100, ...fields,
});
const mockSettings = (t, fields) => {
  const doc = settingsDoc(fields);
  doc.save = async () => doc;
  t.mock.method(Settings, "getSettings", async () => doc);
  t.mock.method(Settings, "updateOne", async () => ({ modifiedCount: 1 }));
  return doc;
};

const ZONES = ({ area = null } = {}) => [
  { _id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt", enabled: true, closedReason: "", deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", sortOrder: 0, legacyPoint: "girlsDorm" },
  { _id: "boysDorm", name: "Erkek KYK Yurdu", type: "yurt", enabled: true, closedReason: "", deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", sortOrder: 1, legacyPoint: "boysDorm" },
  { _id: "devrek", name: "Devrek", type: "ilce", enabled: true, closedReason: "", deliveryFee: 30, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "30-60 dk", sortOrder: 2, legacyPoint: null, area, updatedAt: new Date("2026-10-20T10:00:00Z") },
  { _id: "koy-yazicik", name: "Yazıcık Köyü", type: "koy", enabled: false, closedReason: "", deliveryFee: 60, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "", sortOrder: 3, legacyPoint: null },
];
const loadedArea = (geometry = TOWN) => ({
  ...geometry, source: "osm", osmType: "relation", osmId: 111, adminLevel: 8, displayName: "Devrek, Zonguldak, Türkiye", areaKm2: areaKm2Of(geometry), fetchedAt: new Date("2026-10-22T08:00:00Z"),
});

const mockZones = (t, zones = ZONES()) => {
  const fx = { zones, seeds: [], sets: [] };
  const find = (id) => fx.zones.find((z) => z._id === id);
  t.mock.method(DeliveryZone, "updateOne", async (filter, update) => {
    if (update.$setOnInsert) { fx.seeds.push(filter._id); return {}; }
    fx.sets.push({ filter, update });
    const zone = find(filter._id);
    if (zone) Object.assign(zone, update.$set);
    return { modifiedCount: zone ? 1 : 0 };
  });
  t.mock.method(DeliveryZone, "updateMany", async () => ({ modifiedCount: 0 }));
  t.mock.method(DeliveryZone, "find", () => chain(() => fx.zones.map((z) => ({ ...z }))));
  t.mock.method(DeliveryZone, "findById", (id) => chain(() => (find(id) ? structuredClone(find(id)) : null)));
  t.mock.method(DeliveryZone, "findByIdAndUpdate", (id, update) => chain(() => {
    const zone = find(id);
    if (!zone) return null;
    Object.assign(zone, update.$set);
    return { ...zone };
  }));
  return fx;
};

const mockAudit = (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  return writes;
};

const adminReq = (body = {}, params = { id: "devrek" }, method = "POST") => ({ body, params, user: ADMIN, method, originalUrl: "/api/delivery/admin/zones/devrek/area" });

test.beforeEach(() => {
  resetDuplicateOrderGuard();
  resetYurtSeedState();
  invalidateSettingsCache();
  clearAreaCache();
  nominatimConfig.delayMs = 0;
});

// ── Adres ve sipariş: OUT_OF_AREA / areaVerified ─────────────────────────────

const customer = (n = 1) => ({
  _id: new mongoose.Types.ObjectId(USER(n)), name: "Ayşe", phone: "05551112233", role: "customer", cartItems: [],
  async save() { return this; },
});

const mockAddresses = (t, initial = []) => {
  const fx = { rows: initial.map((a) => ({ ...a })) };
  const match = (row, filter = {}) =>
    (filter.user === undefined || String(row.user) === String(filter.user))
    && (filter._id === undefined || (filter._id?.$ne !== undefined ? String(row._id) !== String(filter._id.$ne) : String(row._id) === String(filter._id)))
    && (filter.isDefault === undefined || row.isDefault === filter.isDefault);
  t.mock.method(UserAddress, "find", (filter) => chain(() => fx.rows.filter((r) => match(r, filter)).map((r) => ({ ...r }))));
  t.mock.method(UserAddress, "findOne", (filter) => {
    const row = fx.rows.find((r) => match(r, filter));
    const doc = row ? Object.assign(Object.create({ async save() { Object.assign(row, this); return this; } }), row) : null;
    return { lean: async () => (row ? { ...row } : null), sort() { return this; }, then: (ok, err) => Promise.resolve(doc).then(ok, err) };
  });
  t.mock.method(UserAddress, "countDocuments", async (filter) => fx.rows.filter((r) => match(r, filter)).length);
  t.mock.method(UserAddress, "create", async (doc) => {
    const row = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date(), ...doc };
    fx.rows.push(row);
    return row;
  });
  t.mock.method(UserAddress, "updateMany", async () => ({}));
  return fx;
};

const addressInput = (fields = {}) => ({ label: "Ev", zoneId: "devrek", neighborhood: "Cumhuriyet", street: "Atatürk Cd.", buildingNo: "5", location: INSIDE, ...fields });

test("adres ekleme/düzenleme: alan yüklüyse sınır dışı 400 OUT_OF_AREA, içi 201; konum zorunlu; yurtta alan gerekmez", async (t) => {
  mockSettings(t);
  mockZones(t, ZONES({ area: loadedArea() }));
  const fx = mockAddresses(t);
  const owner = customer(1);

  const outside = response();
  await createAddress({ user: owner, body: addressInput({ location: OUTSIDE }) }, outside);
  assert.equal(outside.statusCode, 400);
  assert.equal(outside.body.code, "OUT_OF_AREA");
  assert.equal(outside.body.message, OUT_OF_AREA_MESSAGE);
  assert.equal(outside.body.error, OUT_OF_AREA_MESSAGE);

  const noLocation = response();
  await createAddress({ user: owner, body: addressInput({ location: null }) }, noLocation);
  assert.equal(noLocation.statusCode, 400);
  assert.equal(noLocation.body.code, "LOCATION_REQUIRED");

  const noNeighborhood = response();
  await createAddress({ user: owner, body: addressInput({ neighborhood: "" }) }, noNeighborhood);
  assert.equal(noNeighborhood.statusCode, 400);
  assert.equal(noNeighborhood.body.message, "Mahalle bilgisi zorunludur");

  const inside = response();
  await createAddress({ user: owner, body: addressInput() }, inside);
  assert.equal(inside.statusCode, 201, JSON.stringify(inside.body));
  assert.equal(inside.body.address.neighborhood, "Cumhuriyet");
  assert.deepEqual(inside.body.address.location, INSIDE);

  // Düzenleme: konumu sınır dışına taşımak reddedilir, kayıt değişmez
  const id = String(inside.body.address._id);
  const moved = response();
  await updateAddress({ user: owner, body: { location: OUTSIDE }, params: { id } }, moved);
  assert.equal(moved.statusCode, 400);
  assert.equal(moved.body.code, "OUT_OF_AREA");
  assert.deepEqual(fx.rows[0].location, INSIDE);
  const renamed = response();
  await updateAddress({ user: owner, body: { label: "Annem", neighborhood: "Yeni Mahallesi" }, params: { id } }, renamed);
  assert.equal(renamed.statusCode, 200, JSON.stringify(renamed.body));
  assert.equal(renamed.body.address.neighborhood, "Yeni Mahallesi");

  // Yurt adresi: sokak/konum/mahalle gerekmez
  const dorm = response();
  await createAddress({ user: owner, body: { zoneId: "girlsDorm", directions: "B blok" } }, dorm);
  assert.equal(dorm.statusCode, 201, JSON.stringify(dorm.body));
  assert.equal(dorm.body.address.zoneType, "yurt");
});

test("kayıtlı adres eski (emekli) bölgedeyse zoneEnabled: false ile listelenir", async (t) => {
  mockSettings(t);
  mockZones(t);
  const owner = customer(2);
  mockAddresses(t, [{ _id: new mongoose.Types.ObjectId(), user: owner._id, zoneId: "koy-yazicik", street: "Köy içi", isDefault: true, location: null }]);
  const res = response();
  await listAddresses({ user: owner }, res);
  assert.equal(res.body.addresses.length, 1);
  assert.deepEqual(
    [res.body.addresses[0].zoneEnabled, res.body.addresses[0].zoneName, res.body.addresses[0].neighborhood],
    [false, "Yazıcık Köyü", ""],
  );
});

const PRODUCTS = [{ _id: new mongoose.Types.ObjectId(PRODUCT(1)), name: "Süt", price: 50, category: "sut" }];
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
const orderRequest = (body, user = customer(3)) => ({ body, user, app: { get: () => ({ to: () => ({ emit: () => {} }) }) } });
const orderBody = (deliveryAddress = {}) => ({
  paymentMethod: "cash",
  products: [{ product: PRODUCT(1), quantity: 4 }],
  phone: "05551112233",
  zoneId: "devrek",
  deliveryAddress: { neighborhood: "Cumhuriyet", street: "Atatürk Cd.", buildingNo: "5", location: INSIDE, ...deliveryAddress },
});

test("sipariş: alan yüklüyse sınır dışı 400 OUT_OF_AREA, içi areaVerified true; alan yoksa kabul ve areaVerified false", async (t) => {
  mockSettings(t, { delivery: { addressOrdering: "public" } });
  mockCatalog(t);
  const fx = mockZones(t, ZONES({ area: loadedArea() }));
  const created = mockOrderCreate(t);

  const outside = response();
  await placeOrder(orderRequest(orderBody({ location: OUTSIDE })), outside);
  assert.equal(outside.statusCode, 400);
  assert.equal(outside.body.code, "OUT_OF_AREA");
  assert.equal(outside.body.message, OUT_OF_AREA_MESSAGE);
  assert.equal(created.length, 0);

  const inside = response();
  await placeOrder(orderRequest(orderBody()), inside);
  assert.equal(inside.statusCode, 201, JSON.stringify(inside.body));
  assert.equal(created[0].areaVerified, true);
  assert.equal(created[0].deliveryPointName, "Cumhuriyet Mah. · Atatürk Cd. No:5");
  assert.equal(created[0].deliveryAddress.neighborhood, "Cumhuriyet");
  assert.equal(created[0].deliveryFee, 30);
  await new Order({ ...created[0], _id: undefined }).validate();

  // Sınır henüz yüklenmedi: sipariş alınır, "alan doğrulanmadı"
  fx.zones.find((z) => z._id === "devrek").area = null;
  const unverified = response();
  resetDuplicateOrderGuard(); // aynı sepet 2 dk içinde mükerrer sayılır; burada ayrı senaryo
  await placeOrder(orderRequest(orderBody({ location: OUTSIDE })), unverified);
  assert.equal(unverified.statusCode, 201, JSON.stringify(unverified.body));
  assert.equal(created[1].areaVerified, false);

  // Yurt siparişinde areaVerified yazılmaz
  const dorm = response();
  await placeOrder(orderRequest({ paymentMethod: "cash", products: [{ product: PRODUCT(1), quantity: 4 }], phone: "05551112233", zoneId: "girlsDorm", deliveryAddress: { directions: "B blok" } }), dorm);
  assert.equal(dorm.statusCode, 201, JSON.stringify(dorm.body));
  assert.equal("areaVerified" in created[2], false);
});

// ── Herkese açık alan ve bölge listesi ───────────────────────────────────────

test("GET /zones/devrek/area: yüklü alanın GeoJSON'u (yalnızca type + coordinates); yoksa null; bilinmeyen bölge 404; liste hasArea", async (t) => {
  const settings = mockSettings(t);
  const fx = mockZones(t, ZONES({ area: loadedArea() }));
  const res = response();
  await getPublicZoneArea({ params: { id: "devrek" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { area: { type: "Polygon", coordinates: TOWN.coordinates }, updatedAt: new Date("2026-10-22T08:00:00Z") });
  assert.match(res.headers["Cache-Control"], /max-age=300/);

  const zones = response();
  await getPublicZones({}, zones);
  const devrek = zones.body.zones.find((z) => z.id === "devrek");
  assert.deepEqual([devrek.requiresLocation, devrek.hasArea, devrek.type], [true, true, "ilce"]);
  assert.equal(zones.body.zones.some((z) => z.id === "koy-yazicik"), false);
  assert.deepEqual(zones.body.zones.map((z) => z.id), ["girlsDorm", "boysDorm", "devrek"]);
  assert.ok(settings);

  fx.zones.find((z) => z._id === "devrek").area = null;
  const empty = response();
  await getPublicZoneArea({ params: { id: "devrek" } }, empty);
  assert.deepEqual(empty.body, { area: null, updatedAt: null });
  const yurt = response();
  await getPublicZoneArea({ params: { id: "girlsDorm" } }, yurt);
  assert.deepEqual(yurt.body, { area: null, updatedAt: null });
  const unknown = response();
  await getPublicZoneArea({ params: { id: "koy-yazicik" } }, unknown);
  assert.equal(unknown.statusCode, 404);
});

// ── Yönetici: OpenStreetMap'ten yükleme ──────────────────────────────────────

const nominatimItem = (osmId, geojson, extra = {}) => ({
  osm_type: "relation", osm_id: osmId, display_name: `Devrek ${osmId}`, category: "boundary", type: "administrative", place_rank: 16, geojson, ...extra,
});
const mockFetch = (t, responder) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), options });
    const result = await responder(String(url), calls.length);
    if (result instanceof Error) throw result;
    return { ok: result.ok ?? true, status: result.status ?? 200, json: async () => result.body };
  });
  return calls;
};

test("POST …/devrek/area/fetch: yalnızca mağazayı içeren çokgenler aday olur, alana göre sıralanır, en küçüğü (merkez) seçilir", async (t) => {
  mockSettings(t);
  const fx = mockZones(t);
  const audits = mockAudit(t);
  const calls = mockFetch(t, () => ({
    body: [
      nominatimItem(222, DISTRICT, { extratags: { admin_level: "6" }, display_name: "Devrek, Zonguldak, Karadeniz Bölgesi, Türkiye" }),
      { osm_type: "node", osm_id: 5, display_name: "Devrek (yer)", category: "place", type: "town", geojson: { type: "Point", coordinates: [31.95, 41.22] } },
      nominatimItem(333, ELSEWHERE),
      nominatimItem(111, TOWN, { extratags: { admin_level: "8" }, display_name: "Devrek, Zonguldak, Türkiye" }),
      nominatimItem(111, TOWN), // yinelenen sonuç
    ],
  }));
  const req = adminReq();
  const res = response();
  await adminFetchZoneArea(req, res);
  await tick();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));

  // Tek sorgu yeterli (iki aday bulundu); Nominatim kurallarına uygun istek
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?q=Devrek%2C%20Zonguldak%2C%20T%C3%BCrkiye&format=jsonv2&polygon_geojson=1&limit=10/);
  assert.equal(calls[0].options.headers["User-Agent"], NOMINATIM_USER_AGENT);
  assert.equal(NOMINATIM_USER_AGENT, "BenimMarketim/1.0 (+https://devrekbenimmarketim.com)");
  assert.ok(calls[0].options.signal, "zaman aşımı sinyali");

  assert.deepEqual(res.body.candidates.map((c) => [c.osmType, c.osmId, c.adminLevel]), [["relation", 111, 8], ["relation", 222, 6]]);
  assert.ok(res.body.candidates[0].areaKm2 < res.body.candidates[1].areaKm2);
  assert.deepEqual(res.body.selected, { osmType: "relation", osmId: 111 });
  assert.equal(res.body.area.displayName, "Devrek, Zonguldak, Türkiye");
  assert.equal("coordinates" in res.body.area, false, "yanıtta koordinat yok");

  const devrek = fx.zones.find((z) => z._id === "devrek");
  assert.equal(devrek.area.type, "Polygon");
  assert.deepEqual(devrek.area.coordinates, TOWN.coordinates);
  assert.deepEqual([devrek.area.source, devrek.area.osmType, devrek.area.osmId, devrek.area.adminLevel], ["osm", "relation", 111, 8]);
  assert.ok(devrek.area.fetchedAt instanceof Date);
  assert.equal(devrek.areaCandidates.length, 2);
  assert.equal("geojson" in devrek.areaCandidates[0] || "coordinates" in devrek.areaCandidates[0], false, "adaylar çokgensiz saklanır");
  // Şemaya uygun
  await new DeliveryZone({ ...devrek }).validate();

  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "Devrek teslimat alanı OpenStreetMap'ten yüklendi");
  assert.equal(audits[0].changes[0].label, "Teslimat alanı");

  // Yönetici listesi alan özetini ve adayları döndürür (koordinatsız)
  t.mock.method(Order, "aggregate", async () => []);
  const list = response();
  await adminListZones({}, list);
  const listed = list.body.zones.find((z) => z.id === "devrek");
  assert.equal(listed.area.osmId, 111);
  assert.equal("coordinates" in listed.area, false);
  assert.equal(listed.areaCandidates.length, 2);

  // Aday seçimi (önbellekten, yeni istek yok): ilçe sınırı
  const select = response();
  await adminSelectZoneArea(adminReq({ osmType: "relation", osmId: 222 }, { id: "devrek" }, "PUT"), select);
  await tick();
  assert.equal(select.statusCode, 200, JSON.stringify(select.body));
  assert.equal(calls.length, 1, "çokgen önbellekten");
  assert.deepEqual(devrek.area.coordinates, DISTRICT.coordinates);
  assert.equal(devrek.area.osmId, 222);
  assert.equal(audits.at(-1).action, "Devrek teslimat alanı değiştirildi");

  // Yeniden yükleme: seçili aday hâlâ listede → korunur
  const refetch = response();
  await adminFetchZoneArea(adminReq(), refetch);
  assert.deepEqual(refetch.body.selected, { osmType: "relation", osmId: 222 });

  // Aday listesinde olmayan sınır reddedilir
  const unknown = response();
  await adminSelectZoneArea(adminReq({ osmType: "relation", osmId: 999 }, { id: "devrek" }, "PUT"), unknown);
  assert.equal(unknown.statusCode, 400);
  assert.equal(unknown.body.code, "AREA_NOT_CANDIDATE");
  const invalid = response();
  await adminSelectZoneArea(adminReq({ osmType: "node", osmId: 5 }, { id: "devrek" }, "PUT"), invalid);
  assert.equal(invalid.statusCode, 400);

  // Kaldırma
  const cleared = response();
  await adminClearZoneArea(adminReq({}, { id: "devrek" }, "DELETE"), cleared);
  await tick();
  assert.deepEqual(cleared.body, { area: null, cleared: true });
  assert.equal(devrek.area, null);
  assert.equal(audits.at(-1).action, "Devrek teslimat alanı kaldırıldı");
});

test("fetch: önbellek boşsa seçim Nominatim lookup ile yapılır; tek aday varsa ikinci (yapılandırılmış) sorgu denenir", async (t) => {
  mockSettings(t);
  const fx = mockZones(t);
  mockAudit(t);
  const calls = mockFetch(t, (url) => {
    if (url.includes("/search?q=")) return { body: [nominatimItem(222, DISTRICT)] };
    if (url.includes("/search?city=Devrek")) return { body: [nominatimItem(111, TOWN, { osm_type: "R" })] };
    if (url.includes("/lookup?osm_ids=R222")) return { body: [nominatimItem(222, DISTRICT)] };
    return { ok: false, status: 404, body: [] };
  });
  const res = response();
  await adminFetchZoneArea(adminReq(), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /search\?city=Devrek&state=Zonguldak&country=T%C3%BCrkiye&format=jsonv2&polygon_geojson=1/);
  assert.deepEqual(res.body.candidates.map((c) => c.osmId), [111, 222]);
  assert.deepEqual(res.body.selected, { osmType: "relation", osmId: 111 });

  clearAreaCache();
  const select = response();
  await adminSelectZoneArea(adminReq({ osmType: "relation", osmId: "222" }, { id: "devrek" }, "PUT"), select);
  assert.equal(select.statusCode, 200, JSON.stringify(select.body));
  assert.match(calls.at(-1).url, /\/lookup\?osm_ids=R222&format=jsonv2&polygon_geojson=1/);
  assert.equal(fx.zones.find((z) => z._id === "devrek").area.osmId, 222);
});

test("fetch hataları: ağ hatası 502 AREA_FETCH_FAILED, uygun aday yoksa 404 AREA_NOT_FOUND; mevcut alan değişmez", async (t) => {
  mockSettings(t);
  const fx = mockZones(t, ZONES({ area: loadedArea() }));
  mockAudit(t);
  let mode = "network";
  mockFetch(t, () => {
    if (mode === "network") return new TypeError("fetch failed");
    if (mode === "busy") return { ok: false, status: 429, body: [] };
    return { body: [nominatimItem(333, ELSEWHERE)] };
  });
  const failed = response();
  await adminFetchZoneArea(adminReq(), failed);
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.body.code, "AREA_FETCH_FAILED");
  assert.ok(failed.body.message && failed.body.error);

  mode = "busy";
  const busy = response();
  await adminFetchZoneArea(adminReq(), busy);
  assert.equal(busy.statusCode, 502);
  assert.match(busy.body.message, /çok sık/);

  mode = "none";
  const none = response();
  await adminFetchZoneArea(adminReq(), none);
  assert.equal(none.statusCode, 404);
  assert.equal(none.body.code, "AREA_NOT_FOUND");
  assert.equal(fx.zones.find((z) => z._id === "devrek").area.osmId, 111, "eski alan korunur");

  const notDevrek = response();
  await adminFetchZoneArea(adminReq({}, { id: "girlsDorm" }), notDevrek);
  assert.equal(notDevrek.statusCode, 400);
});

// ── ZONES_FIXED ve rotalar ───────────────────────────────────────────────────

test("ZONES_FIXED: bölge ekleme ve silme 400; rotalar korunur ve yönetici korumalı", async () => {
  for (const handler of [adminCreateZone, adminDeleteZone]) {
    const res = response();
    await handler({ body: { name: "Yeni", type: "mahalle" }, params: { id: "devrek" }, user: ADMIN, method: "POST", originalUrl: "/x" }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "ZONES_FIXED");
  }
  const names = (method, path) => deliveryRouter.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route.stack.map((layer) => layer.handle.name);
  assert.deepEqual(names("post", "/admin/zones"), ["protectRoute", "adminRoute", "adminCreateZone"]);
  assert.deepEqual(names("delete", "/admin/zones/:id"), ["protectRoute", "adminRoute", "adminDeleteZone"]);
  assert.deepEqual(names("post", "/admin/zones/:id/area/fetch"), ["protectRoute", "adminRoute", "adminFetchZoneArea"]);
  assert.deepEqual(names("put", "/admin/zones/:id/area"), ["protectRoute", "adminRoute", "adminSelectZoneArea"]);
  assert.deepEqual(names("delete", "/admin/zones/:id/area"), ["protectRoute", "adminRoute", "adminClearZoneArea"]);
  assert.deepEqual(names("get", "/zones/:id/area"), ["getPublicZoneArea"]);
});
