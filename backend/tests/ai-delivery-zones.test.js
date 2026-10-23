import test from "node:test";
import assert from "node:assert/strict";
import Settings from "../models/settings.model.js";
import Order from "../models/order.model.js";
import DeliveryZone from "../models/deliveryZone.model.js";
import { getStoreInfo } from "../services/ai/storeInfo.service.js";
import { detectToolIntent, formatToolResult, orderDeliveryLabel, runAiTool } from "../services/ai/tools.js";
import { AI_TOOL_DEFINITIONS } from "../services/ai/providers.js";

const USER_ID = "507f191e810c19729de860ea";
const chain = (rows) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, populate() { return this; }, lean: async () => rows });
const settings = (extra = {}) => ({
  orderStartHour: 10, orderStartMinute: 0, orderEndHour: 1, orderEndMinute: 0, minimumOrderAmount: 250,
  deliveryPoints: { girlsDorm: { name: "Kız KYK Yurdu", enabled: true }, boysDorm: { name: "Erkek KYK Yurdu", enabled: false } },
  ...extra,
});

test("store info lists the enabled delivery zones from the panel with their real fees", async (t) => {
  t.mock.method(Settings, "getSettings", async () => settings());
  let filter;
  t.mock.method(DeliveryZone, "find", (value) => {
    filter = value;
    return chain([
      { _id: "girlsDorm", name: "Kız KYK Yurdu", type: "yurt", enabled: true, deliveryFee: 0, freeDeliveryThreshold: null, minimumOrderAmount: null, etaText: "" },
      { _id: "devrek", name: "Devrek", type: "ilce", enabled: true, deliveryFee: 30, freeDeliveryThreshold: 300, minimumOrderAmount: 200, etaText: "30-60 dk" },
    ]);
  });
  const info = await getStoreInfo();
  assert.deepEqual(filter, { _id: { $in: ["girlsDorm", "boysDorm", "devrek"] }, enabled: true }, "yalnızca üç sabit bölge");
  assert.equal(info.deliveryZones.length, 2);
  assert.deepEqual(info.deliveryZones[1], { id: "devrek", name: "Devrek", type: "ilce", deliveryFee: 30, isFree: false, freeDeliveryThreshold: 300, minimumOrderAmount: 200, etaText: "30-60 dk", description: "Devrek merkez (haritadaki sınır)" });
  assert.equal(info.deliveryZones[0].minimumOrderAmount, 250, "boş bölge minimumu genel minimuma düşer");
  const text = formatToolResult({ tool: "getStoreInfo", ...info });
  assert.match(text, /Teslimat bölgelerimiz:/);
  assert.match(text, /• Kız KYK Yurdu \(ücretsiz teslimat\)/);
  assert.match(text, /• Devrek merkez \(haritadaki sınır\) \(teslimat ücreti 30,00 TL, 300,00 TL ve üstü ücretsiz, minimum sepet 200,00 TL, 30-60 dk\)/);
  assert.doesNotMatch(text, /Erkek KYK Yurdu/);
  assert.doesNotMatch(text, /mahalle|köy/i, "mahalle/köy anlatımı yok");
});

test("free-delivery campaign and zero minimum are reported without inventing numbers", async (t) => {
  t.mock.method(Settings, "getSettings", async () => settings({ minimumOrderAmount: 0, delivery: { freeDeliveryEverywhere: true } }));
  t.mock.method(DeliveryZone, "find", () => chain([{ _id: "devrek", name: "Devrek", type: "ilce", deliveryFee: 40, freeDeliveryThreshold: 500, minimumOrderAmount: null }]));
  const info = await getStoreInfo();
  assert.equal(info.freeDeliveryEverywhere, true);
  const text = formatToolResult({ tool: "getStoreSettings", ...info });
  assert.match(text, /Minimum sepet tutarı yok\./);
  assert.match(text, /• Devrek merkez \(haritadaki sınır\) \(ücretsiz teslimat\)/);
  assert.match(text, /tüm teslimat bölgelerinde teslimat ücretsiz/);
  assert.doesNotMatch(text, /40,00 TL/);
});

test("before the zones are seeded the assistant falls back to the enabled dorm points", async (t) => {
  t.mock.method(Settings, "getSettings", async () => settings());
  t.mock.method(DeliveryZone, "find", () => chain([]));
  const info = await getStoreInfo();
  assert.deepEqual(info.deliveryZones.map((zone) => [zone.id, zone.name, zone.isFree]), [["girlsDorm", "Kız KYK Yurdu", true]]);
  assert.match(formatToolResult({ tool: "getStoreInfo", ...info }), /• Kız KYK Yurdu \(ücretsiz teslimat\)/);
  // Hiç açık bölge yoksa bunu açıkça söyler.
  assert.match(formatToolResult({ tool: "getStoreInfo", ...info, deliveryZones: [] }), /açık teslimat bölgesi bulunmuyor/);
});

test("delivery area and fee questions go to the store info tool", () => {
  for (const query of ["Teslimat ücreti ne kadar?", "Cumhuriyet mahallesine teslimat var mı", "Hangi bölgelere teslimat yapıyorsunuz", "Adrese teslimat var mı?", "Yazıcık köyüne geliyor musunuz"]) {
    assert.equal(detectToolIntent(query)?.name, "getStoreInfo", query);
  }
  assert.equal(detectToolIntent("Siparişim nerede")?.name, "getMyActiveOrders");
  const definition = AI_TOOL_DEFINITIONS.find((tool) => tool.function.name === "getStoreInfo");
  assert.match(definition.function.description, /teslimat bölgelerini/);
});

test("order answers show the zone or address summary instead of raw delivery codes", async (t) => {
  assert.equal(orderDeliveryLabel({ deliveryPoint: "girlsDorm", deliveryPointName: "" }), "Kız KYK Yurdu");
  assert.equal(orderDeliveryLabel({ deliveryPoint: "boysDorm", deliveryPointName: "boysDorm" }), "Erkek KYK Yurdu");
  assert.equal(orderDeliveryLabel({ deliveryPoint: "girlsDorm", deliveryPointName: "Kız Yurdu B Blok" }), "Kız Yurdu B Blok");
  assert.equal(orderDeliveryLabel({ deliveryPoint: "girlsDorm", deliveryZone: { id: "girlsDorm", name: "Kız KYK Yurdu" } }), "Kız KYK Yurdu");
  const addressOrder = {
    _id: "507f191e810c19729de860ff", status: "Yolda", totalAmount: 130, deliveryFee: 30, createdAt: new Date("2026-10-05T10:00:00Z"),
    deliveryPoint: "address", deliveryType: "address", deliveryPointName: "Cumhuriyet Mah. · Atatürk Cd. No:5",
    deliveryZone: { id: "devrek", name: "Devrek", type: "ilce" },
    deliveryAddress: { zoneName: "Devrek", neighborhood: "Cumhuriyet Mahallesi", street: "Atatürk Cd.", buildingNo: "5" },
  };
  assert.equal(orderDeliveryLabel(addressOrder), "Cumhuriyet Mah. · Atatürk Cd. No:5");
  assert.equal(orderDeliveryLabel({ deliveryPoint: "address" }), "Adrese teslimat");

  let projection = "";
  t.mock.method(Order, "find", () => ({ ...chain([{ _id: "507f191e810c19729de860fe", status: "Teslim Edildi", totalAmount: 300, createdAt: new Date("2026-10-04T10:00:00Z"), deliveryPoint: "girlsDorm", deliveryPointName: "" }]), select(value) { projection = value; return this; } }));
  const old = await runAiTool({ name: "getMyLastOrder" }, USER_ID);
  assert.match(projection, /deliveryAddress\.street/);
  assert.match(projection, /deliveryAddress\.neighborhood/);
  assert.equal(old.orders[0].deliveryPoint, "Kız KYK Yurdu");
  const oldText = formatToolResult(old);
  assert.match(oldText, /\(Kız KYK Yurdu\)/);
  assert.doesNotMatch(oldText, /girlsDorm/);

  t.mock.method(Order, "find", () => chain([addressOrder]));
  const result = await runAiTool({ name: "getMyActiveOrders" }, USER_ID);
  assert.equal(result.orders[0].deliveryFee, 30);
  const text = formatToolResult(result);
  assert.match(text, /\(Cumhuriyet Mah\. · Atatürk Cd\. No:5\)/);
  assert.match(text, /Teslimat ücreti: 30,00 TL \(toplama dahil\)/);
  assert.doesNotMatch(text, /\baddress\b/);
});
