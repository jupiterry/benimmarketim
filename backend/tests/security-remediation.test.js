import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Chat from "../models/chat.model.js";
import userRoutes from "../routes/userRoutes.js";
import { getUserInfo } from "../controllers/user.controller.js";
import {
  getUserOrders,
  updateOrderStatus as updateAnalyticsOrderStatus,
} from "../controllers/ordersAnalytics.controller.js";
import analyticsRoutes from "../routes/analytics.route.js";
import { createChat } from "../controllers/chat.controller.js";
import { loginRateLimiter } from "../middleware/loginRateLimit.js";

function response() {
  return {
    code: 200,
    headers: {},
    status(code) { this.code = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    json(body) { this.body = body; return this; },
  };
}

function targetedIo() {
  const targeted = [];
  const global = [];
  return {
    targeted,
    global,
    io: {
      to(firstRoom) {
        const rooms = [firstRoom];
        return {
          to(room) { rooms.push(room); return this; },
          emit(event, payload) { targeted.push({ rooms: [...rooms], event, payload }); },
        };
      },
      emit(...args) { global.push(args); },
    },
  };
}

test("add-phone-field maintenance route is removed", () => {
  const route = userRoutes.stack.find((layer) => layer.route?.path === "/add-phone-field");
  assert.equal(route, undefined);
});

test("profile lookup allows self/admin and rejects another normal user", async (t) => {
  const findById = t.mock.method(User, "findById", () => ({
    select: async () => ({ _id: "user-1", name: "Self" }),
  }));

  const selfRes = response();
  await getUserInfo({ params: { id: "user-1" }, user: { _id: { toString: () => "user-1" }, role: "customer" } }, selfRes);
  assert.equal(selfRes.code, 200);
  assert.equal(findById.mock.callCount(), 1);

  const foreignRes = response();
  await getUserInfo({ params: { id: "user-2" }, user: { _id: { toString: () => "user-1" }, role: "customer" } }, foreignRes);
  assert.equal(foreignRes.code, 403);
  assert.equal(findById.mock.callCount(), 1);

  const adminRes = response();
  await getUserInfo({ params: { id: "user-2" }, user: { _id: { toString: () => "admin-1" }, role: "admin" } }, adminRes);
  assert.equal(adminRes.code, 200);
  assert.equal(findById.mock.callCount(), 2);
});

test("user order history ignores foreign userId unless requester is admin", async (t) => {
  const filters = [];
  t.mock.method(Order, "find", (filter) => {
    filters.push(filter);
    return {
      populate() { return this; },
      sort: async () => [],
    };
  });

  await getUserOrders({ query: { userId: "victim" }, user: { _id: "self", role: "customer" } }, response());
  await getUserOrders({ query: { userId: "victim" }, user: { _id: "admin", role: "admin" } }, response());

  assert.equal(filters[0].user, "self");
  assert.equal(filters[1].user, "victim");
});

test("chat creation rejects an order that does not belong to requester", async (t) => {
  t.mock.method(Order, "exists", async () => null);
  const findChat = t.mock.method(Chat, "findOne", async () => {
    throw new Error("chat lookup should not run for a foreign order");
  });

  const res = response();
  await createChat({ user: { _id: "user-1" }, body: { orderId: "foreign-order" } }, res);

  assert.equal(res.code, 403);
  assert.equal(findChat.mock.callCount(), 0);
});

test("order status updates emit only to owner and admin rooms", async (t) => {
  const order = {
    _id: "order-1",
    user: { toString: () => "user-1" },
    status: "Hazırlanıyor",
    statusHistory: [],
    save: async () => {},
  };
  t.mock.method(Order, "findById", async () => order);

  const current = targetedIo();
  const currentRes = response();
  await updateAnalyticsOrderStatus({
    body: { orderId: "order-1", status: "Yolda" },
    user: { _id: "admin-1", role: "admin" },
    app: { get: () => current.io },
  }, currentRes);
  assert.equal(currentRes.code, 200);
  assert.equal(current.global.length, 0);
  assert.deepEqual(current.targeted[0].rooms, ["user_user-1", "adminRoom"]);
  assert.equal(current.targeted[0].event, "orderStatusUpdated");
});

test("legacy PUT /api/analytics/update-order-status is removed (status changes go through /orders-analytics)", () => {
  const route = analyticsRoutes.stack.find((layer) => layer.route?.path === "/update-order-status");
  assert.equal(route, undefined);
  for (const layer of analyticsRoutes.stack.filter((l) => l.route)) {
    const names = layer.route.stack.map((l) => l.handle.name);
    assert.deepEqual(names.slice(0, 2), ["protectRoute", "adminRoute"], `${layer.route.path} must be admin-only`);
  }
});

test("login limiter: 10 attempts per IP, separate and more lenient bucket per email", () => {
  const email = "rate-limit-security-test@example.com";
  const makeReq = (ip = "203.0.113.9") => ({ ip, body: { email } });
  const attempt = (req) => {
    let called = false;
    const res = response();
    loginRateLimiter(req, res, () => { called = true; });
    return { called, res };
  };

  for (let i = 0; i < 10; i += 1) {
    const { called, res } = attempt(makeReq());
    assert.equal(called, true);
    assert.equal(res.code, 200);
  }

  const blocked = attempt(makeReq());
  assert.equal(blocked.called, false);
  assert.equal(blocked.res.code, 429);
  assert.ok(Number(blocked.res.headers["Retry-After"]) >= 1);

  // Aynı e-posta, başka IP: e-posta kovası (20) henüz dolmadı → kurban kilitlenmez
  const otherIp = attempt(makeReq("198.51.100.7"));
  assert.equal(otherIp.called, true);

  // Aynı IP, başka e-posta: IP kovası dolu → engellenir
  const otherEmail = attempt({ ip: "203.0.113.9", body: { email: "someone-else@example.com" } });
  assert.equal(otherEmail.called, false);
  assert.equal(otherEmail.res.code, 429);

  // E-posta kovası: 10 (ilk IP) + 1 + 9 = 20 deneme sonrası 21. engellenir
  for (let i = 0; i < 9; i += 1) assert.equal(attempt(makeReq("198.51.100.7")).called, true);
  const emailBlocked = attempt(makeReq("192.0.2.33"));
  assert.equal(emailBlocked.called, false);
  assert.equal(emailBlocked.res.code, 429);
});

test("sensitive signup logs and global order status broadcasts are absent", () => {
  const userStore = fs.readFileSync(new URL("../../frontend/src/stores/useUserStore.js", import.meta.url), "utf8");
  const orderAnalytics = fs.readFileSync(new URL("../controllers/ordersAnalytics.controller.js", import.meta.url), "utf8");
  const analytics = fs.readFileSync(new URL("../controllers/analytics.controller.js", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");

  assert.equal(userStore.includes("Gönderilen kayıt verileri:"), false);
  assert.equal(userStore.includes("Backend'den dönen yanıt:"), false);
  assert.equal(userStore.includes('console.error("Kayıt hatası:", error.response?.data || error)'), false);
  assert.equal(orderAnalytics.includes("io.emit('orderStatusUpdated'"), false);
  assert.equal(analytics.includes("io.emit('orderStatusUpdated'"), false);
  assert.ok(server.includes("socket.join(`user_${user._id.toString()}`)"));
});
