// Müşteri eylemleri bağımsız incelemesi: bulunan hataların testleri. Veritabanı ve OneSignal taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../models/user.model.js";
import Coupon from "../models/coupon.model.js";
import PushBroadcast from "../models/pushBroadcast.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import AutomationSettings from "../models/automationSettings.model.js";
import { giveCouponsToCustomers, previewCustomerActions } from "../controllers/customerActions.controller.js";
import { parseTarget, resetCustomerActionMemory } from "../services/customerActions.service.js";

const ID = (n) => `64b000000000000000000${String(n).padStart(3, "0")}`;
const ADMIN = ID(99);
// 2 Kasım 2026 19:00 (İstanbul): otomatik bildirim saatleri içinde
const EVENING = Date.parse("2026-11-02T16:00:00Z");

const chain = (value) => {
  const query = { select: () => query, sort: () => query, limit: () => query, lean: async () => (typeof value === "function" ? value() : value) };
  return query;
};
const response = () => {
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } };
  return res;
};
const request = (body, path) => ({ body, user: { _id: ADMIN, role: "admin" }, method: "POST", originalUrl: path });

const customers = {
  [ID(1)]: { _id: ID(1), name: "Ayşe Yılmaz", role: "customer", appActivity: { lastSeenAt: new Date(EVENING) } },
  [ID(2)]: { _id: ID(2), name: "Mehmet Kaya", role: "customer", appActivity: { lastSeenAt: new Date(EVENING) } },
};

const setup = (t, { recentCoupons = [] } = {}) => {
  resetCustomerActionMemory();
  const fx = { aggregates: [], inserted: [], audits: [] };
  t.mock.method(User, "find", (filter) => {
    const ids = filter?._id?.$in?.map((id) => String(id).toLowerCase());
    return chain(() => Object.values(customers).filter((user) => !ids || ids.includes(user._id)).map((user) => ({ ...user })));
  });
  t.mock.method(User, "aggregate", async (pipeline) => { fx.aggregates.push(pipeline); return []; });
  t.mock.method(User, "countDocuments", async () => 0);
  t.mock.method(AutomationSettings, "findOne", () => ({ lean: async () => null }));
  t.mock.method(PushBroadcast, "find", () => chain([]));
  t.mock.method(Coupon, "find", (filter) => chain(filter?.userId ? recentCoupons : []));
  t.mock.method(Coupon, "insertMany", async (docs) => { fx.inserted.push(...docs.map((doc) => ({ ...doc }))); return docs; });
  t.mock.method(AdminAudit, "create", async (doc) => { fx.audits.push(doc); return doc; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("OneSignal'a gidilmemeli"); });
  return fx;
};

test("a search with nothing searchable is not a filter: the target never widens to every customer", async (t) => {
  // Yalnızca birleşik aksan işareti: liste ucunda arama koşulu üretmez, yani "Tümü" ile aynı kitleyi döndürürdü
  const accentOnly = "́";
  assert.throws(() => parseTarget({ filter: { q: accentOnly } }, EVENING), (error) => error.status === 400 && error.code === "empty_filter");
  assert.throws(() => parseTarget({ filter: { q: ` ${accentOnly}${accentOnly} ` } }, EVENING), (error) => error.code === "empty_filter");
  // Başka bir süzgeçle birlikte anlamsız arama zararsızdır (kitleyi segment sınırlar)
  assert.equal(parseTarget({ filter: { segment: "active", q: accentOnly } }, EVENING).type, "filter");
  // Gerçek arama metinleri süzgeçtir: ad, telefonun 3+ hanesi, noktalama
  for (const q of ["ali", "555", "a.b"]) assert.equal(parseTarget({ filter: { q } }, EVENING).type, "filter", q);

  setup(t);
  const res = response();
  await previewCustomerActions(request({ channel: "push", target: { filter: { q: accentOnly } } }, "/api/customer-actions/preview"), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "empty_filter");
  assert.equal(User.aggregate.mock.callCount(), 0, "tüm müşteriler sorgulanmaz");
});

test("the coupon code is returned only when a single customer was targeted", async (t) => {
  t.mock.method(console, "error", () => {});
  const coupon = { discountType: "fixed", value: 40, validDays: 2 };

  // İki kişi seçildi, biri bu kuponu az önce almış: tek kupon yazılsa da kodu kime ait olduğu belirsiz kalırdı
  const fx = setup(t, { recentCoupons: [{ userId: new mongoose.Types.ObjectId(ID(1)) }] });
  const bulk = response();
  await giveCouponsToCustomers(request({ target: { userIds: [ID(1), ID(2)] }, coupon }, "/api/customer-actions/coupons"), bulk);
  assert.equal(bulk.statusCode, 200, JSON.stringify(bulk.body));
  assert.equal(bulk.body.created, 1);
  assert.equal(bulk.body.duplicates, 1);
  assert.equal(bulk.body.code, null, "toplu verilişte kod dönmez");
  assert.equal(fx.audits.length, 1);

  // Tek müşteri: kod telefonda söylenebilsin diye döner
  const single = response();
  Coupon.find.mock.mockImplementation(() => chain([]));
  await giveCouponsToCustomers(request({ target: { userIds: [ID(2)] }, coupon }, "/api/customer-actions/coupons"), single);
  assert.equal(single.statusCode, 200, JSON.stringify(single.body));
  assert.equal(single.body.created, 1);
  assert.match(single.body.code, /^OZEL[A-HJ-NP-Z2-9]{7}$/);
  assert.equal(single.body.code, fx.inserted.at(-1).code);
});
