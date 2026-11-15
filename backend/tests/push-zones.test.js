// Toplu bildirimde bölge hedefleme: müşterinin bölgesi iptal edilmemiş son siparişinden gelir ve kitleyle VE'lenir.
import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import { getAudienceCounts, sendBroadcast } from "../controllers/notification.controller.js";
import {
  buildBroadcastFilter, countAudience, getZoneMembers, lastSendsByAudience, normalizeZone, parseBroadcastInput, resetBroadcastCaches, zoneOfOrder,
} from "../services/pushBroadcast.service.js";

const id = (n) => `507f191e810c19729de86${String(n).padStart(3, "0")}`;
const chain = (value) => ({ select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const NOW = new Date("2026-03-10T12:00:00Z");
// Toplama sorgusunun döndürdüğü satırlar: müşteri başına en yeni (iptal edilmemiş) siparişin bölgesi
const ROWS = [
  { _id: id(1), zoneId: "girlsDorm", point: "girlsDorm", type: "point" },
  { _id: id(2), point: "boysDorm" }, // eski sipariş: deliveryZone yok
  { _id: id(3), zoneId: "devrek", point: "address", type: "address" },
  { _id: id(4), zoneId: "eski-bolge", point: "address", type: "address" }, // emekli bölge: adresli → devrek
  { _id: id(5), type: "address" },
  { _id: id(6) }, // bölgesi bilinmeyen kayıt hiçbir bölgeye girmez
  { _id: null, zoneId: "devrek" },
];
const withKeys = (t) => {
  const previous = { key: process.env.ONESIGNAL_REST_API_KEY, app: process.env.ONESIGNAL_APP_ID };
  process.env.ONESIGNAL_REST_API_KEY = "test-only"; process.env.ONESIGNAL_APP_ID = "app-test";
  t.after(() => {
    if (previous.key === undefined) delete process.env.ONESIGNAL_REST_API_KEY; else process.env.ONESIGNAL_REST_API_KEY = previous.key;
    if (previous.app === undefined) delete process.env.ONESIGNAL_APP_ID; else process.env.ONESIGNAL_APP_ID = previous.app;
  });
};
const mockZones = (t, rows = ROWS) => {
  resetBroadcastCaches();
  t.after(resetBroadcastCaches);
  return t.mock.method(Order, "aggregate", async () => rows);
};

test("zone of an order: deliveryZone.id first, then deliveryPoint; address orders count as devrek", () => {
  assert.equal(zoneOfOrder({ deliveryZone: { id: "boysDorm" }, deliveryPoint: "girlsDorm" }), "boysDorm");
  assert.equal(zoneOfOrder({ deliveryPoint: "girlsDorm" }), "girlsDorm");
  assert.equal(zoneOfOrder({ deliveryZone: { id: "devrek" }, deliveryPoint: "address" }), "devrek");
  assert.equal(zoneOfOrder({ deliveryZone: { id: "kapatilan-bolge" }, deliveryPoint: "address" }), "devrek");
  assert.equal(zoneOfOrder({ deliveryType: "address" }), "devrek");
  assert.equal(zoneOfOrder({}), null);
  assert.equal(zoneOfOrder({ deliveryZone: { id: "__proto__" } }), null);
});

test("zone input: empty / 'all' mean no filter, unknown values are rejected", () => {
  assert.equal(normalizeZone(undefined), "");
  assert.equal(normalizeZone(""), "");
  assert.equal(normalizeZone("all"), "");
  assert.equal(normalizeZone("devrek"), "devrek");
  assert.equal(normalizeZone("istanbul"), null);
  assert.equal(normalizeZone({ $ne: "" }), null);
  assert.equal(normalizeZone("constructor"), null);
  assert.throws(() => parseBroadcastInput({ title: "t", body: "b", audience: "all", zone: "mars" }), /Geçersiz bölge/);
  assert.equal(parseBroadcastInput({ title: "t", body: "b", audience: "all", zone: "boysDorm" }).zone, "boysDorm");
  // Denemede bölge yok sayılır
  assert.equal(parseBroadcastInput({ title: "t", body: "b", audience: "self", zone: "mars" }, { allowTest: true }).zone, "");
});

test("zone members come from one bounded aggregation over non-cancelled orders and are cached for two minutes", async (t) => {
  const aggregate = mockZones(t);
  const members = await getZoneMembers({ now: NOW });
  assert.deepEqual(members, { girlsDorm: [id(1)], boysDorm: [id(2)], devrek: [id(3), id(4), id(5)] });
  const [pipeline, options] = aggregate.mock.calls[0].arguments;
  assert.deepEqual(pipeline[0], { $match: { status: { $ne: "İptal Edildi" } } });
  assert.deepEqual(pipeline[1], { $sort: { createdAt: -1 } });
  assert.equal(pipeline[2].$group._id, "$user");
  assert.deepEqual(pipeline[2].$group.zoneId, { $first: "$deliveryZone.id" });
  assert.ok(options.maxTimeMS > 0 && options.maxTimeMS <= 30000);
  // Önbellek: 2 dakika içinde yeniden sorgulanmaz; süre dolunca ya da fresh ile yenilenir
  await getZoneMembers({ now: new Date(NOW.getTime() + 119000) });
  assert.equal(aggregate.mock.callCount(), 1);
  await getZoneMembers({ now: new Date(NOW.getTime() + 121000) });
  assert.equal(aggregate.mock.callCount(), 2);
  await getZoneMembers({ now: new Date(NOW.getTime() + 122000), fresh: true });
  assert.equal(aggregate.mock.callCount(), 3);
});

test("a failed zone query is not cached", async (t) => {
  resetBroadcastCaches();
  t.after(resetBroadcastCaches);
  let fail = true;
  const aggregate = t.mock.method(Order, "aggregate", async () => { if (fail) throw new Error("timeout"); return ROWS; });
  await assert.rejects(getZoneMembers({ now: NOW }), /timeout/);
  fail = false;
  assert.equal((await getZoneMembers({ now: NOW })).devrek.length, 3);
  assert.equal(aggregate.mock.callCount(), 2);
});

test("zone is ANDed with the audience; customers without orders are in no zone", async (t) => {
  mockZones(t);
  Order.distinct ||= async () => [];
  t.mock.method(Order, "distinct", async (_field, query) => (query.createdAt ? [id(1)] : [id(1), id(3), id(4)]));
  // Bölge yok: kitle sorgusu olduğu gibi
  assert.deepEqual(await buildBroadcastFilter("all", "", NOW), { role: { $ne: "admin" } });
  const devrekAll = await buildBroadcastFilter("all", "devrek", NOW);
  assert.deepEqual(devrekAll, { $and: [{ role: { $ne: "admin" } }, { _id: { $in: [id(3), id(4), id(5)] } }] });
  // "Devrek + 30 gündür sipariş yok": iki koşul da ayrı ayrı korunur
  const inactive = await buildBroadcastFilter("inactive30", "devrek", NOW);
  assert.deepEqual(inactive.$and[0]._id.$in, [id(3), id(4)]);
  assert.deepEqual(inactive.$and[1]._id.$in, [id(3), id(4), id(5)]);
  // Hiç sipariş vermeyenler hiçbir bölgede değildir: $nin (siparişi olanlar) ile bölge üyeleri kesişmez
  const noOrder = await buildBroadcastFilter("noOrder", "girlsDorm", NOW);
  assert.ok(noOrder.$and[0]._id.$nin);
  assert.deepEqual(noOrder.$and[1], { _id: { $in: [id(1)] } });
  assert.equal(await buildBroadcastFilter("nope", "devrek", NOW), null);
});

test("audience count returns total and reachable for audience + zone", async (t) => {
  mockZones(t);
  const filters = [];
  t.mock.method(User, "countDocuments", async (filter) => { filters.push(filter); return filter.pushNotificationsEnabled ? 2 : 3; });
  assert.deepEqual(await countAudience("all", "devrek", NOW), { total: 3, reachable: 2 });
  assert.deepEqual(filters[1]["notificationPreferences.campaigns"], { $ne: false });
  assert.deepEqual(filters[1].$and[1]._id.$in, [id(3), id(4), id(5)]);
  assert.equal(await countAudience("nope", "", NOW), null);
});

test("last send per audience matches the same zone; old records without zone count as 'all'", async (t) => {
  let pipeline;
  t.mock.method(PushBroadcast, "aggregate", async (stages) => { pipeline = stages; return [{ _id: "all", last: NOW }, { _id: null, last: NOW }]; });
  assert.deepEqual(await lastSendsByAudience(""), { all: NOW });
  assert.deepEqual(pipeline[0].$match.zone, { $in: ["", null] });
  assert.equal(pipeline[0].$match.sent, true);
  await lastSendsByAudience("devrek");
  assert.equal(pipeline[0].$match.zone, "devrek");
  // Okunamazsa ekran bozulmaz
  t.mock.method(console, "error", () => {});
  t.mock.method(PushBroadcast, "aggregate", async () => { throw new Error("down"); });
  assert.deepEqual(await lastSendsByAudience(""), {});
});

test("audience-count endpoint validates zone and audience and returns counts with the last send", async (t) => {
  mockZones(t);
  Order.distinct ||= async () => [];
  t.mock.method(Order, "distinct", async () => [id(1)]);
  t.mock.method(User, "countDocuments", async (filter) => (filter.pushNotificationsEnabled ? 1 : 2));
  t.mock.method(PushBroadcast, "aggregate", async () => [{ _id: "inactive30", last: NOW }]);
  let res = response(); await getAudienceCounts({ query: { zone: "mars" } }, res); assert.equal(res.statusCode, 400);
  res = response(); await getAudienceCounts({ query: { zone: "devrek", audience: "nope" } }, res); assert.equal(res.statusCode, 400);
  res = response(); await getAudienceCounts({ query: { zone: ["devrek"] } }, res);
  assert.equal(res.body.zone, "", "dizi olarak gelen değer yok sayılır");
  res = response(); await getAudienceCounts({ query: { zone: "devrek" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.zoneLabel, "Devrek (adres)");
  assert.deepEqual(res.body.audiences.map((item) => item.id), ["all", "cart", "active30", "inactive30", "noOrder"]);
  assert.deepEqual(res.body.audiences[3], { id: "inactive30", label: "30 gündür sipariş vermeyenler", total: 2, reachable: 1, lastSentAt: NOW });
  assert.equal(res.body.audiences[0].lastSentAt, null);
  res = response(); await getAudienceCounts({ query: { zone: "devrek", audience: "cart" } }, res);
  assert.deepEqual(res.body.audiences.map((item) => item.id), ["cart"]);
});

test("an immediate broadcast with a zone only goes to that zone and stores the zone", async (t) => {
  withKeys(t);
  mockZones(t);
  t.mock.method(PushBroadcast, "findOne", () => chain(null));
  const filters = [];
  t.mock.method(User, "find", (query) => { filters.push(query); return chain([{ _id: id(3) }, { _id: id(4) }]); });
  const created = []; const updates = [];
  t.mock.method(PushBroadcast, "create", async (doc) => { created.push(doc); return { _id: id(50), ...doc }; });
  t.mock.method(PushBroadcast, "updateOne", async (_query, update) => { updates.push(update.$set); return {}; });
  const pushes = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => { pushes.push(JSON.parse(options.body)); return { ok: true, status: 200 }; });
  let res = response();
  await sendBroadcast({ body: { title: "t", body: "b", audience: "all", zone: "mars" }, user: { _id: id(99) } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(pushes.length, 0);
  res = response();
  await sendBroadcast({ body: { title: "Devrek'e özel", body: "Adrese teslim başladı", audience: "all", zone: "devrek" }, user: { _id: id(99) } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(filters[0].$and[1]._id.$in, [id(3), id(4), id(5)]);
  assert.deepEqual(filters[0]["notificationPreferences.campaigns"], { $ne: false });
  assert.equal(created[0].zone, "devrek");
  assert.deepEqual(pushes[0].include_aliases.external_id, [id(3), id(4)]);
  assert.deepEqual(updates[0].recipients, [id(3), id(4)]);
});
