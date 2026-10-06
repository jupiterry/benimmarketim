import test from "node:test";
import assert from "node:assert/strict";
import SiteMessage from "../models/siteMessage.model.js";
import { createSiteMessage, updateSiteMessageStatus, validateSiteMessage } from "../controllers/siteMessage.controller.js";
import { siteMessageRateLimit } from "../middleware/siteMessageRateLimit.js";

const response = () => { const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res; }, json(body) { res.body = body; return res; } }; return res; };
const valid = { kind: "kvkk", name: "Ayşe Kaya", email: " Ayse@Example.com ", phone: "0555 111 22 33", topic: "silme", message: "Hesabımdaki verilerin silinmesini talep ediyorum." };
const request = (body) => ({ body, app: { get: () => null } });

test("form input is validated and normalised", () => {
  assert.equal(validateSiteMessage(valid).data.email, "ayse@example.com");
  assert.match(validateSiteMessage({ ...valid, kind: "admin" }).error, /form türü/);
  assert.match(validateSiteMessage({ ...valid, name: "A" }).error, /Ad soyad/);
  assert.match(validateSiteMessage({ ...valid, email: "ayse@" }).error, /e-posta/);
  assert.match(validateSiteMessage({ ...valid, phone: "" }).error, /telefon/);
  assert.match(validateSiteMessage({ ...valid, phone: "abc" }).error, /telefon/);
  assert.match(validateSiteMessage({ ...valid, topic: "siparis" }).error, /konu/);
  assert.match(validateSiteMessage({ ...valid, message: "kısa" }).error, /Mesaj/);
  assert.match(validateSiteMessage({ ...valid, message: "x".repeat(2001) }).error, /Mesaj/);
  // İletişim formunda telefon isteğe bağlıdır
  assert.ok(validateSiteMessage({ ...valid, kind: "contact", topic: "genel", phone: "" }).data);
});

test("a valid application is stored with only the whitelisted fields", async (t) => {
  const created = [];
  t.mock.method(SiteMessage, "create", async (doc) => { created.push(doc); return { _id: "507f191e810c19729de860ab", ...doc }; });
  const res = response();
  await createSiteMessage(request({ ...valid, status: "done", handledBy: "x" }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.reference, "E860AB");
  assert.deepEqual(Object.keys(created[0]).sort(), ["email", "kind", "message", "name", "phone", "topic"]);
});

test("invalid input and bot submissions never create a record", async (t) => {
  const create = t.mock.method(SiteMessage, "create", async () => ({ _id: "x" }));
  let res = response(); await createSiteMessage(request({ ...valid, email: "nope" }), res);
  assert.equal(res.statusCode, 400);
  res = response(); await createSiteMessage(request({ ...valid, website: "http://spam" }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(create.mock.callCount(), 0);
});

test("status updates accept only known states and valid ids", async (t) => {
  const update = t.mock.method(SiteMessage, "findByIdAndUpdate", () => ({ populate() { return this; }, lean: async () => ({ _id: "507f191e810c19729de860ab", status: "done" }) }));
  const req = (id, status) => ({ params: { id }, body: { status }, user: { _id: "admin" } });
  let res = response(); await updateSiteMessageStatus(req("507f191e810c19729de860ab", "deleted"), res); assert.equal(res.statusCode, 400);
  res = response(); await updateSiteMessageStatus(req("not-an-id", "done"), res); assert.equal(res.statusCode, 400);
  assert.equal(update.mock.callCount(), 0);
  res = response(); await updateSiteMessageStatus(req("507f191e810c19729de860ab", "done"), res);
  assert.equal(res.body.message.status, "done");
  assert.equal(update.mock.calls[0].arguments[1].$set.handledBy, "admin");
});

test("the public form is rate limited per IP", () => {
  const hit = (ip) => { const res = response(); let passed = false; siteMessageRateLimit({ ip }, res, () => { passed = true; }); return passed ? 200 : res.statusCode; };
  assert.deepEqual(Array.from({ length: 6 }, () => hit("10.0.0.1")), [200, 200, 200, 200, 200, 429]);
  assert.equal(hit("10.0.0.2"), 200);
});
