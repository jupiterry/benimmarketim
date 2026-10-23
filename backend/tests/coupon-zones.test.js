import test from "node:test";
import assert from "node:assert/strict";
import Coupon from "../models/coupon.model.js";
import Settings from "../models/settings.model.js";
import { couponPublicData, evaluateCoupon, isAddressOnlyCoupon, splitZoneTargets } from "../services/coupon.service.js";
import { createCoupon, getCoupon, recommendCoupons, updateCoupon, validateCoupon } from "../controllers/coupon.controller.js";

const USER_ID = "507f1f77bcf86cd799439011";
const future = () => new Date(Date.now() + 86400000);
const coupon = (fields) => new Coupon({ code: "ZONE10", discountType: "fixed", discountAmount: 10, expirationDate: future(), ...fields });
const response = () => {
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};

test("legacy dorm targeting keeps working and dorm codes count as the dorm zones", async () => {
  const dorm = coupon({ deliveryPoints: ["girlsDorm"] });
  assert.equal((await evaluateCoupon(dorm, { userId: USER_ID, totalAmount: 100, deliveryPoint: "girlsDorm" })).valid, true);
  const wrong = await evaluateCoupon(dorm, { userId: USER_ID, totalAmount: 100, deliveryPoint: "boysDorm" });
  assert.equal(wrong.valid, false);
  assert.equal(wrong.message, "Bu kupon seçtiğiniz teslimat noktasında geçerli değil");
  // Yeni istemci yurdu bölge kimliğiyle gönderir: aynı sonuç.
  assert.equal((await evaluateCoupon(dorm, { userId: USER_ID, totalAmount: 100, deliveryPoint: "address", deliveryZone: "girlsDorm" })).valid, true);
  // Bölge seçilmeden (sepette) ertelenir; eski uygulama requiresDeliveryPoint'i okur.
  const deferred = await evaluateCoupon(dorm, { userId: USER_ID, totalAmount: 100, deferDeliveryPoint: true });
  assert.equal(deferred.valid, true);
  assert.equal(deferred.requiresDeliveryPoint, true);
});

test("zone-only coupons are unusable for clients that cannot order to addresses", async () => {
  const zoneOnly = coupon({ deliveryZones: ["devrek"] });
  assert.equal(isAddressOnlyCoupon(zoneOnly), true);
  assert.equal(isAddressOnlyCoupon(coupon({ deliveryPoints: ["boysDorm"], deliveryZones: ["devrek"] })), false);
  assert.equal(isAddressOnlyCoupon(coupon({})), false);

  const oldApp = await evaluateCoupon(zoneOnly, { userId: USER_ID, totalAmount: 100, deferDeliveryPoint: true });
  assert.equal(oldApp.valid, false);
  assert.equal(oldApp.reason, "delivery_zone");
  const dormOrder = await evaluateCoupon(zoneOnly, { userId: USER_ID, totalAmount: 100, deliveryPoint: "girlsDorm" });
  assert.equal(dormOrder.valid, false);

  const pilot = await evaluateCoupon(zoneOnly, { userId: USER_ID, totalAmount: 100, deferDeliveryPoint: true, canOrderToAddress: true });
  assert.equal(pilot.valid, true);
  assert.equal(pilot.requiresDeliveryPoint, true);
  const matching = await evaluateCoupon(zoneOnly, { userId: USER_ID, totalAmount: 100, deliveryPoint: "address", deliveryZone: "devrek" });
  assert.equal(matching.valid, true);
  const otherZone = await evaluateCoupon(zoneOnly, { userId: USER_ID, totalAmount: 100, deliveryPoint: "address", deliveryZone: "girlsDorm" });
  assert.equal(otherZone.message, "Bu kupon seçtiğiniz teslimat bölgesinde geçerli değil");
  // Sipariş anında (erteleme yok) bölge yoksa kupon reddedilir.
  const noZone = await evaluateCoupon(zoneOnly, { userId: USER_ID, totalAmount: 100, deliveryPoint: "address", canOrderToAddress: true });
  assert.equal(noZone.valid, false);
});

test("panel zone selection is stored as legacy dorm points plus new zones", () => {
  assert.deepEqual(splitZoneTargets(["girlsDorm", "devrek", "devrek", " mah-eski ", "", null]), { deliveryPoints: ["girlsDorm"], deliveryZones: ["devrek", "mah-eski"] });
  const data = couponPublicData(coupon({ deliveryPoints: ["boysDorm"], deliveryZones: ["devrek"] }));
  assert.deepEqual(data.deliveryPoints, ["boysDorm"]);
  assert.deepEqual(data.deliveryZones, ["devrek"]);
});

test("create and update split deliveryZones; old panels sending deliveryPoints still work", async (t) => {
  t.mock.method(Coupon, "findOne", async () => null);
  const saved = [];
  t.mock.method(Coupon.prototype, "save", async function save() { saved.push(this); return this; });
  const res = response();
  await createCoupon({ body: { code: "yeni", discountType: "fixed", discountAmount: 20, expirationDate: future(), deliveryZones: ["boysDorm", "devrek"] } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual([...saved[0].deliveryPoints], ["boysDorm"]);
  assert.deepEqual([...saved[0].deliveryZones], ["devrek"]);

  await createCoupon({ body: { code: "eski", discountType: "fixed", discountAmount: 20, expirationDate: future(), deliveryPoints: ["girlsDorm"] } }, response());
  assert.deepEqual([...saved[1].deliveryPoints], ["girlsDorm"]);
  assert.deepEqual([...saved[1].deliveryZones], []);

  const existing = coupon({ deliveryPoints: ["girlsDorm"] });
  t.mock.method(Coupon, "findById", async () => existing);
  const upd = response();
  await updateCoupon({ params: { id: "x" }, body: { deliveryZones: ["devrek"] } }, upd);
  assert.equal(upd.statusCode, 200);
  assert.deepEqual([...existing.deliveryPoints], []);
  assert.deepEqual([...existing.deliveryZones], ["devrek"]);
});

test("wallet and recommendations hide zone-only coupons from the current app", async (t) => {
  const coupons = [coupon({ code: "DORM", deliveryPoints: ["girlsDorm"] }), coupon({ code: "DEVREK", deliveryZones: ["devrek"] }), coupon({ code: "HERKES" })];
  t.mock.method(Coupon, "find", () => ({ sort: async () => coupons }));
  const settingsCalls = t.mock.method(Settings, "getSettings", async () => ({ delivery: { addressOrdering: "public" } }));

  const wallet = response();
  await getCoupon({ user: { _id: USER_ID }, query: {} }, wallet);
  assert.deepEqual(wallet.body.coupons.map((c) => c.code), ["DORM", "HERKES"]);
  assert.equal(settingsCalls.mock.callCount(), 0, "eski istemci için ayar okunmaz");

  const newApp = response();
  await getCoupon({ user: { _id: USER_ID }, query: { zoneAware: "1" } }, newApp);
  assert.deepEqual(newApp.body.coupons.map((c) => c.code), ["DORM", "DEVREK", "HERKES"]);

  const rec = response();
  await recommendCoupons({ user: { _id: USER_ID }, body: { orderAmount: 100 } }, rec);
  const listed = [...rec.body.eligibleCoupons, ...rec.body.unavailableCoupons].map((c) => c.code);
  assert.ok(!listed.includes("DEVREK"));
  assert.ok(rec.body.eligibleCoupons.some((c) => c.code === "DORM" && c.requiresDeliveryPoint));

  const zoneRec = response();
  await recommendCoupons({ user: { _id: USER_ID }, body: { orderAmount: 100, deliveryZone: "devrek" } }, zoneRec);
  assert.deepEqual(zoneRec.body.eligibleCoupons.map((c) => c.code).sort(), ["DEVREK", "HERKES"]);

  // Adrese sipariş kapalıyken (off) yeni uygulama da bu kuponu görmez.
  settingsCalls.mock.mockImplementation(async () => ({ delivery: { addressOrdering: "off" } }));
  const off = response();
  await getCoupon({ user: { _id: USER_ID }, query: { zoneAware: "1" } }, off);
  assert.deepEqual(off.body.coupons.map((c) => c.code), ["DORM", "HERKES"]);
});

test("validate endpoint accepts the zone a new client sends", async (t) => {
  const zoneOnly = coupon({ code: "DEVREK", deliveryZones: ["devrek"] });
  t.mock.method(Coupon, "findOne", async () => zoneOnly);
  t.mock.method(Settings, "getSettings", async () => ({ delivery: { addressOrdering: "pilot", pilotUserIds: [USER_ID] } }));
  const oldApp = response();
  await validateCoupon({ user: { _id: USER_ID }, body: { code: "devrek", orderAmount: 100 } }, oldApp);
  assert.equal(oldApp.statusCode, 400);
  const ok = response();
  await validateCoupon({ user: { _id: USER_ID }, body: { code: "devrek", orderAmount: 100, deliveryZone: "devrek" } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body.coupon.deliveryZones, ["devrek"]);
});
