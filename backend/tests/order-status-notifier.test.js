import test from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import { buildOrderStatusMessage, notifyOrderStatusChange } from "../services/orderStatusNotifier.js";

const chain = (value) => ({ select() { return this; }, lean: async () => value });
const order = { _id: "507f191e810c19729de860aa", user: "507f191e810c19729de860ea", status: "Yolda" };
const withKeys = (t) => {
  const previous = { key: process.env.ONESIGNAL_REST_API_KEY, app: process.env.ONESIGNAL_APP_ID };
  process.env.ONESIGNAL_REST_API_KEY = "test-only"; process.env.ONESIGNAL_APP_ID = "app-test";
  t.after(() => {
    if (previous.key === undefined) delete process.env.ONESIGNAL_REST_API_KEY; else process.env.ONESIGNAL_REST_API_KEY = previous.key;
    if (previous.app === undefined) delete process.env.ONESIGNAL_APP_ID; else process.env.ONESIGNAL_APP_ID = previous.app;
  });
};

test("every order status has a customer-facing message", () => {
  for (const status of ["Hazırlanıyor", "Yolda", "Teslim Edildi", "İptal Edildi"]) assert.ok(buildOrderStatusMessage(status).title);
  assert.equal(buildOrderStatusMessage("Bilinmeyen"), null);
});

test("status change sends a push targeted at the order owner only", async (t) => {
  withKeys(t);
  t.mock.method(User, "findById", () => chain({ pushNotificationsEnabled: true, fcmToken: null }));
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => { request = { url, options }; return { ok: true, status: 200 }; });
  assert.equal(await notifyOrderStatusChange(order, "Hazırlanıyor"), true);
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api.onesignal.com/notifications");
  assert.deepEqual(body.include_aliases, { external_id: [order.user] });
  assert.equal(body.app_id, "app-test");
  assert.equal(body.headings.tr, "Siparişiniz yola çıktı");
  assert.deepEqual(body.data, { type: "order_status", orderId: order._id, status: "Yolda" });
});

test("nothing is sent when status is unchanged, user opted out, or keys are missing", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return { ok: true, status: 200 }; });
  const find = t.mock.method(User, "findById", () => chain({ pushNotificationsEnabled: true, fcmToken: null }));
  assert.equal(await notifyOrderStatusChange(order, "Yolda"), false); // anahtar yok + durum aynı
  assert.equal(await notifyOrderStatusChange(order, "Hazırlanıyor"), false); // anahtar yok
  withKeys(t);
  assert.equal(await notifyOrderStatusChange(order, "Yolda"), false);
  find.mock.mockImplementation(() => chain({ pushNotificationsEnabled: false, fcmToken: "x" }));
  assert.equal(await notifyOrderStatusChange(order, "Hazırlanıyor"), false);
  assert.equal(calls, 0);
});

test("a failing push provider never throws into the order update", async (t) => {
  withKeys(t);
  t.mock.method(User, "findById", () => chain({ pushNotificationsEnabled: true, fcmToken: null }));
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network down"); });
  t.mock.method(console, "error", () => {});
  assert.equal(await notifyOrderStatusChange(order, "Hazırlanıyor"), false);
});
