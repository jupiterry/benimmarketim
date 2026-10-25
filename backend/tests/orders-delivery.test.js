// Devrek teslimat genişlemesi (Aşama 1, C): sipariş listesine teslimat alanları, yönetici ürün
// düzenlemelerinde kilitli teslimat ücreti (totalAmount = productTotal + deliveryFee) ve ciro =
// ürün cirosu (teslimat ücreti ayrı) kuralı. Veritabanı yok: modeller t.mock.method ile taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Product from "../models/product.model.js";
import SupportRequest from "../models/supportRequest.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import {
  groupOrdersByUser,
  deliveryFields,
  applyTotalsDelta,
  getOrderAnalyticsData,
  updateItemQuantity,
  removeItemFromOrder,
  addCustomItemToOrder,
  computeDashboardSummary,
  attachCustomerStats,
} from "../controllers/ordersAnalytics.controller.js";
import { summarizeCompareOrders, zoneBreakdown, dormBreakdown, buildCompareResponse, resolveComparePeriods, dailySeries } from "../controllers/analytics.controller.js";
import { buildCustomerProfile, getBestCustomers } from "../controllers/user.controller.js";
import { fetchCleanupDataset } from "../services/accountCleanup.service.js";
import { countQualifyingOrders } from "../services/mission.service.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const ORDER = (n) => hex("6ac8bc", n);
const USER = (n) => hex("507f1f77bcf8", n);
const LINE = (n) => hex("11aa22bb", n);
const ADMIN = { _id: hex("ad", 1), role: "admin" };
const NOW = new Date("2026-10-20T12:30:00+03:00");

const response = () => ({
  statusCode: 200,
  body: undefined,
  headers: {},
  set(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (body = {}) => ({
  body, params: {}, query: {}, user: ADMIN, method: "PUT", originalUrl: "/api/orders-analytics/x",
  app: { get: () => ({ to: () => ({ emit() {} }) }) },
});
const chain = (result, record = {}) => {
  const c = {
    select(arg) { record.select = arg; return c; },
    populate() { return c; },
    sort() { return c; },
    limit() { return c; },
    lean: async () => result,
  };
  return c;
};

const ADDRESS = {
  zoneId: "devrek", zoneName: "Devrek", neighborhood: "Cumhuriyet", street: "Atatürk Cd.", buildingNo: "5", buildingName: "Gül Apt.",
  floor: "2", apartment: "4", directions: "Eczanenin üstü", location: { lat: 41.2195, lng: 31.9512 },
};
const dormOrder = (fields = {}) => ({
  _id: new mongoose.Types.ObjectId(ORDER(1)),
  user: { _id: new mongoose.Types.ObjectId(USER(1)), name: "Ayşe", email: "a@x.com" },
  products: [{ _id: new mongoose.Types.ObjectId(LINE(1)), name: "Süt", quantity: 2, price: 40 }],
  totalAmount: 80, subtotalAmount: 80, status: "Hazırlanıyor", city: "Devrek", phone: "0555", deliveryPoint: "girlsDorm",
  deliveryPointName: "Kız KYK Yurdu", createdAt: NOW, updatedAt: NOW, ...fields,
});
const addressOrder = (fields = {}) => dormOrder({
  _id: new mongoose.Types.ObjectId(ORDER(2)),
  deliveryPoint: "address", deliveryType: "address", deliveryPointName: "Cumhuriyet Mah. · Atatürk Cd. No:5",
  deliveryZone: { id: "devrek", name: "Devrek", type: "ilce" }, deliveryAddress: ADDRESS, areaVerified: false,
  productTotal: 80, deliveryFee: 40, totalAmount: 120, ...fields,
});

// ── Liste ────────────────────────────────────────────────────────────────────

test("liste: adresli siparişte bölge, adres, ücret ve ürün tutarı; eski yurt siparişinde varsayılanlar", () => {
  const [group] = groupOrdersByUser([dormOrder(), addressOrder()]);
  const [old, fresh] = group.orders;
  // Eski alanlar aynen korunur
  assert.equal(old.totalAmount, 80);
  assert.equal(old.deliveryPoint, "girlsDorm");
  assert.equal(old.deliveryPointName, "Kız KYK Yurdu");
  assert.deepEqual(
    { deliveryType: old.deliveryType, deliveryZone: old.deliveryZone, deliveryAddress: old.deliveryAddress, deliveryFee: old.deliveryFee, productTotal: old.productTotal },
    { deliveryType: "point", deliveryZone: null, deliveryAddress: null, deliveryFee: 0, productTotal: 80 },
  );
  assert.equal(fresh.deliveryType, "address");
  assert.deepEqual(fresh.deliveryZone, { id: "devrek", name: "Devrek", type: "ilce" });
  assert.deepEqual(fresh.deliveryAddress, ADDRESS);
  assert.equal(fresh.areaVerified, false, "sınır yüklenmeden alınan Devrek siparişi");
  assert.equal(old.areaVerified, null, "yurt/eski siparişte null");
  // Eski adresli siparişte (mahalle alanı yok) neighborhood boş metin döner
  const [legacyGroup] = groupOrdersByUser([addressOrder({ deliveryAddress: { ...ADDRESS, neighborhood: undefined }, areaVerified: undefined })]);
  assert.equal(legacyGroup.orders[0].deliveryAddress.neighborhood, "");
  assert.equal(legacyGroup.orders[0].areaVerified, null);
  assert.equal(fresh.deliveryFee, 40);
  assert.equal(fresh.productTotal, 80);
  assert.equal(fresh.totalAmount, 120);
});

test("liste: yurt siparişinin bölge kopyası döner; boş adres nesnesi null olur, konum yoksa null", () => {
  const fields = deliveryFields(dormOrder({ deliveryType: "point", deliveryZone: { id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt" }, deliveryAddress: {}, deliveryFee: 0, productTotal: 80 }));
  assert.deepEqual(fields.deliveryZone, { id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt" });
  assert.equal(fields.deliveryAddress, null);
  const noLocation = deliveryFields(addressOrder({ deliveryAddress: { ...ADDRESS, location: { lat: null, lng: null } } }));
  assert.equal(noLocation.deliveryAddress.location, null);
  assert.equal(noLocation.deliveryAddress.street, "Atatürk Cd.");
});

test("liste sorgusu yeni teslimat alanlarını seçer", async (t) => {
  const record = {};
  t.mock.method(Order, "find", () => chain([addressOrder()], record));
  t.mock.method(Order, "countDocuments", async () => 1);
  const data = await getOrderAnalyticsData({ active: true });
  for (const key of ["deliveryType", "deliveryZone", "deliveryAddress", "deliveryFee", "productTotal", "totalAmount", "deliveryPoint"]) {
    assert.ok(record.select.split(" ").includes(key), key);
  }
  assert.equal(data.usersOrders[0].orders[0].deliveryFee, 40);
});

test("müşteri istatistiği: harcama ürün tutarından (teslimat ücreti hariç)", async (t) => {
  let pipeline;
  t.mock.method(Order, "aggregate", async (p) => { pipeline = p; return []; });
  await attachCustomerStats([{ user: { id: USER(1) }, orders: [] }]);
  const group = pipeline.find((stage) => stage.$group).$group;
  assert.deepEqual(group.totalSpent.$sum.$cond[1], { $ifNull: ["$productTotal", "$totalAmount"] });
});

// ── Yönetici ürün düzenlemeleri ─────────────────────────────────────────────

const editDoc = (fields = {}) => ({
  ...addressOrder(),
  user: new mongoose.Types.ObjectId(USER(1)),
  products: [
    { _id: new mongoose.Types.ObjectId(LINE(1)), name: "Süt", quantity: 2, price: 40 },
    { _id: new mongoose.Types.ObjectId(LINE(2)), name: "Ekmek", quantity: 1, price: 20 },
  ],
  productTotal: 100, subtotalAmount: 100, deliveryFee: 40, totalAmount: 140,
  increment() {},
  async save() { return this; },
  ...fields,
});
const mockAudit = (t) => {
  const audits = [];
  t.mock.method(AdminAudit, "create", async (doc) => { audits.push(doc); return doc; });
  return audits;
};

test("düzenleme: adet artınca ürün tutarı değişir, teslimat ücreti kilitli kalır", async (t) => {
  const audits = mockAudit(t);
  const doc = editDoc();
  t.mock.method(Order, "findById", async () => doc);
  const res = response();
  await updateItemQuantity(request({ orderId: ORDER(2), lineId: LINE(1), newQuantity: 3 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(doc.productTotal, 140);
  assert.equal(doc.deliveryFee, 40);
  assert.equal(doc.totalAmount, 180);
  assert.equal(doc.subtotalAmount, 140);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audits[0]?.changes?.at(-1)?.label, "Toplam");
});

test("düzenleme: satır silme ve özel tutar eklemede toplam = ürün tutarı + ücret", async (t) => {
  mockAudit(t);
  const doc = editDoc();
  t.mock.method(Order, "findById", async () => doc);
  await removeItemFromOrder(request({ orderId: ORDER(2), lineId: LINE(2) }), response());
  assert.deepEqual([doc.productTotal, doc.totalAmount], [80, 120]);

  t.mock.method(Product, "findOne", async () => ({ _id: new mongoose.Types.ObjectId() }));
  await addCustomItemToOrder(request({ orderId: ORDER(2), amount: 12.5 }), response());
  assert.deepEqual([doc.productTotal, doc.totalAmount, doc.deliveryFee], [92.5, 132.5, 40]);
});

test("düzenleme: ücretsiz adresli siparişte toplam ürün tutarına eşit kalır", () => {
  const doc = editDoc({ productTotal: 100, deliveryFee: 0, totalAmount: 100 });
  const totals = applyTotalsDelta(doc, -20);
  assert.deepEqual([doc.productTotal, doc.totalAmount], [80, 80]);
  assert.deepEqual(totals, { before: 100, after: 80, productBefore: 100, productAfter: 80, fee: 0 });
});

test("düzenleme: productTotal'ı olmayan eski yurt siparişi eskisi gibi güncellenir (yeni alan yazılmaz)", () => {
  const doc = { totalAmount: 140, subtotalAmount: 140 };
  applyTotalsDelta(doc, 20);
  assert.deepEqual(doc, { totalAmount: 160, subtotalAmount: 160 });
});

test("düzenleme: ürün tutarı sıfırın altına inmez, ücret yine eklenir", () => {
  const doc = { productTotal: 10, deliveryFee: 40, totalAmount: 50 };
  applyTotalsDelta(doc, -30);
  assert.deepEqual([doc.productTotal, doc.totalAmount], [0, 40]);
});

// ── Pano özeti ──────────────────────────────────────────────────────────────

const mockDashboard = (t, facet) => {
  const calls = [];
  t.mock.method(Order, "aggregate", async (pipeline) => {
    calls.push(pipeline);
    if (pipeline.some((stage) => stage.$facet)) return [{ totals: [], byStatus: [], byDorm: [], byZone: [], series: [], topProducts: [], manual: [], ...facet }];
    return [{ orders: 2, cancelled: 0, revenue: 100, deliveryFee: 20 }];
  });
  t.mock.method(Order, "countDocuments", async () => 0);
  t.mock.method(Order, "find", () => chain([addressOrder()]));
  t.mock.method(Product, "countDocuments", async () => 0);
  t.mock.method(SupportRequest, "countDocuments", async () => 0);
  t.mock.method(User, "countDocuments", async () => 0);
  return calls;
};

test("pano: ciro ürün tutarından; teslimat ücreti ayrı; bölge dağılımı", async (t) => {
  const calls = mockDashboard(t, {
    totals: [{ orders: 3, cancelled: 1, revenue: 200, deliveryFee: 40 }],
    byZone: [
      { _id: "girlsDorm", name: null, type: null, orders: 1, revenue: 120, deliveryFee: 0 },
      { _id: "mah-cumhuriyet", name: "Cumhuriyet Mah.", type: "mahalle", orders: 1, revenue: 80, deliveryFee: 40 },
    ],
  });
  const summary = await computeDashboardSummary({ period: "7d" }, NOW);
  const facet = calls[0][1].$facet;
  const totalsGroup = facet.totals[0].$group;
  assert.deepEqual(totalsGroup.revenue.$sum.$cond[2], { $ifNull: ["$productTotal", "$totalAmount"] });
  assert.deepEqual(totalsGroup.deliveryFee.$sum.$cond[2], { $ifNull: ["$deliveryFee", 0] });
  assert.deepEqual(facet.series.find((s) => s.$group).$group.revenue, { $sum: { $ifNull: ["$productTotal", "$totalAmount"] } });
  assert.deepEqual(facet.byDorm.find((s) => s.$group).$group.revenue, { $sum: { $ifNull: ["$productTotal", "$totalAmount"] } });

  assert.equal(summary.totals.revenue, 200);
  assert.equal(summary.totals.averageBasket, 100);
  assert.equal(summary.totals.deliveryFeeRevenue, 40);
  assert.equal(summary.previous.deliveryFeeRevenue, 20);
  assert.equal(summary.delta.deliveryFeeRevenue, 100);
  assert.deepEqual(summary.zoneDistribution, [
    { zoneId: "girlsDorm", name: "", type: "yurt", orders: 1, revenue: 120, deliveryFeeRevenue: 0 },
    { zoneId: "mah-cumhuriyet", name: "Cumhuriyet Mah.", type: "mahalle", orders: 1, revenue: 80, deliveryFeeRevenue: 40 },
  ]);
  // Eski anahtar değişmeden durur
  assert.ok(Array.isArray(summary.dormDistribution));
  assert.equal(summary.recentOrders[0].totalAmount, 120);
  assert.equal(summary.recentOrders[0].productTotal, 80);
  assert.equal(summary.recentOrders[0].deliveryFee, 40);
  assert.equal(summary.recentOrders[0].deliveryZoneName, "Devrek");
});

// ── Analitik karşılaştırma ──────────────────────────────────────────────────

const compareOrders = [
  { status: "Teslim Edildi", totalAmount: 80, deliveryPoint: "girlsDorm", createdAt: NOW, products: [] },
  { status: "Teslim Edildi", totalAmount: 120, productTotal: 80, deliveryFee: 40, deliveryPoint: "address", deliveryZone: { id: "mah-cumhuriyet", name: "Cumhuriyet Mah.", type: "mahalle" }, createdAt: NOW, products: [] },
  { status: "Teslim Edildi", totalAmount: 60, productTotal: 60, deliveryFee: 0, deliveryPoint: "address", deliveryZone: { id: "mah-cumhuriyet", name: "Cumhuriyet Mah.", type: "mahalle" }, createdAt: NOW, products: [] },
  { status: "İptal Edildi", totalAmount: 140, productTotal: 100, deliveryFee: 40, deliveryPoint: "address", createdAt: NOW, products: [] },
];

test("karşılaştırma: ciro ürün tutarı, teslimat ücreti ayrı, iptaller hariç", () => {
  const summary = summarizeCompareOrders(compareOrders);
  assert.equal(summary.revenue, 220);
  assert.equal(summary.deliveryFeeRevenue, 40);
  assert.equal(summary.paidDeliveryOrders, 1);
  assert.equal(summary.cancelledAmount, 100);
  assert.equal(summary.averageOrderValue, 73.33);
  assert.equal(dailySeries(compareOrders, NOW)[0].amount, 220);
});

test("karşılaştırma: bölge kırılımı eski yurt siparişlerini yurt anahtarıyla sayar", () => {
  assert.deepEqual(zoneBreakdown(compareOrders), [
    { zoneId: "mah-cumhuriyet", name: "Cumhuriyet Mah.", type: "mahalle", orders: 2, revenue: 140, deliveryFeeRevenue: 40 },
    { zoneId: "girlsDorm", name: "", type: "yurt", orders: 1, revenue: 80, deliveryFeeRevenue: 0 },
  ]);
  // Eski yurt kırılımı aynı anahtarlarla döner (ciro ürün tutarından)
  assert.deepEqual(dormBreakdown(compareOrders).map((row) => Object.keys(row)), [["deliveryPoint", "orders", "revenue"], ["deliveryPoint", "orders", "revenue"]]);
  const ranges = resolveComparePeriods("week", NOW);
  const body = buildCompareResponse({ ranges, currentOrders: compareOrders, previousOrders: [], categories: [] });
  assert.equal(body.current.deliveryFeeRevenue, 40);
  assert.equal(body.previousFull.deliveryFeeRevenue, 0);
  assert.equal(body.byZone.length, 2);
  assert.ok("deliveryFeeRevenue" in body.deltas);
});

// ── Müşteri harcaması, hesap temizliği, görevler ────────────────────────────

test("müşteri profili: toplam harcama ürün tutarından, teslimat ücreti ayrı alanda", () => {
  const profile = buildCustomerProfile({ _id: USER(1), name: "Ayşe" }, compareOrders.map((o, i) => ({ ...o, _id: ORDER(i + 10), createdAt: new Date(NOW.getTime() - i * 1000) })));
  assert.equal(profile.stats.totalSpent, 220);
  assert.equal(profile.stats.deliveryFeeTotal, 40);
  assert.equal(profile.recentOrders[1].totalAmount, 120);
  assert.equal(profile.recentOrders[1].productTotal, 80);
  assert.equal(profile.recentOrders[1].deliveryFee, 40);
});

test("en iyi müşteriler ve hesap temizliği harcamayı ürün tutarından toplar", async (t) => {
  const pipelines = [];
  t.mock.method(Order, "aggregate", async (p) => { pipelines.push(p); return []; });
  t.mock.method(User, "find", () => chain([]));
  await getBestCustomers({ query: {} }, response());
  assert.deepEqual(pipelines[0].find((s) => s.$group).$group.totalSpent, { $sum: { $ifNull: ["$productTotal", "$totalAmount"] } });
  await fetchCleanupDataset();
  const cond = pipelines[1][0].$group.totalSpent.$sum.$cond;
  assert.deepEqual(cond[2], { $ifNull: ["$productTotal", { $ifNull: ["$totalAmount", 0] }] });
});

test("görev alt tutarı ürün tutarına uygulanır (eski siparişte totalAmount)", async (t) => {
  let filter;
  t.mock.method(Order, "countDocuments", async (q) => { filter = q; return 0; });
  await countQualifyingOrders({ minOrderAmount: 150, startsAt: NOW, endsAt: NOW }, USER(1));
  assert.deepEqual(filter.$or, [{ productTotal: { $gte: 150 } }, { productTotal: null, totalAmount: { $gte: 150 } }]);
  assert.equal(filter.totalAmount, undefined);
});
