// Haftalık fırsatlar (P4) bağımsız inceleme düzeltmeleri: planlı fırsat düzenlenirken dakikalık işin onu yayına
// alması (yarış), kopyalamada son okuma hatası ve panel listesinin sınırı. Veritabanı yok: modeller taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import WeeklyProduct from "../models/weeklyProduct.model.js";
import Product from "../models/product.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import {
  WEEKLY_ADMIN_HISTORY_DAYS,
  copyWeeklyProducts,
  getAllWeeklyProducts,
  updateWeeklyProduct,
} from "../controllers/weeklyProduct.controller.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const PID = (n) => hex("45aa", n);
const WID = (n) => hex("78bb", n);
const ADMIN = hex("adad", 2);
const oid = (id) => new mongoose.Types.ObjectId(id);
const MIN = 60 * 1000;
const H = 60 * MIN;
const DAY = 24 * H;

const chain = (result) => {
  const resolve = async () => (typeof result === "function" ? result() : result);
  const c = {
    select() { return c; },
    sort() { return c; },
    limit() { return c; },
    populate(arg) { c.populated = arg; return c; },
    lean: resolve,
    then(onOk, onErr) { return resolve().then(onOk, onErr); },
  };
  return c;
};

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const adminReq = ({ body = {}, params = {}, method = "PUT", url = "/api/weekly-products" } = {}) => {
  const emits = [];
  return {
    body,
    params,
    method,
    originalUrl: url,
    user: { _id: ADMIN, role: "admin" },
    app: { get: (key) => (key === "io" ? { emit: (event) => emits.push(event) } : null) },
    emits,
  };
};
const captureAudit = (t) => {
  const entries = [];
  t.mock.method(AdminAudit, "create", async (entry) => { entries.push(entry); return entry; });
  return entries;
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Panel planlı fırsatı düzenlerken dakikalık iş onu yayına almış: kayıt artık yayında (scheduled:false) */
const activatedDoc = (fields = {}) => ({
  _id: oid(WID(1)),
  product: { _id: oid(PID(1)), name: "Deterjan", price: 36 },
  weeklyPrice: 30,
  discountPercentage: 17,
  listPriceAtStart: 36,
  isActive: true,
  scheduled: false,
  startDate: new Date(Date.now() - 30 * 1000),
  endDate: new Date(Date.now() + 6 * DAY),
  order: 1,
  saves: 0,
  async save() { this.saves += 1; },
  ...fields,
});

const mockUpdate = (t, doc, { others = [] } = {}) => {
  t.mock.method(WeeklyProduct, "findById", () => chain(doc));
  t.mock.method(WeeklyProduct, "find", () => chain(others));
  t.mock.method(WeeklyProduct, "updateOne", async () => ({ matchedCount: 1, modifiedCount: 1 }));
  t.mock.method(Product, "findById", () => chain({ name: "Deterjan" }));
};

test("yarış: planlı fırsat formu 'şimdi başlat' gönderirken iş fırsatı açmışsa istek reddedilmez, diğer değişiklikler uygulanır", async (t) => {
  captureAudit(t);
  const doc = activatedDoc();
  mockUpdate(t, doc);
  const res = response();
  await updateWeeklyProduct(adminReq({ params: { id: WID(1) }, body: { weeklyPrice: 29.9, startDate: "now", endDate: doc.endDate.toISOString() } }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.weeklyPrice, 29.9);
  assert.equal(doc.isActive, true);
  assert.equal(doc.scheduled, false);
  assert.equal(doc.saves, 1);
});

test("yarış: kayıtlı başlangıçla aynı ya da geçmiş başlangıç da karşılanmış sayılır; ileri bir başlangıç yine reddedilir", async (t) => {
  captureAudit(t);
  const doc = activatedDoc();
  mockUpdate(t, doc);

  const same = response();
  await updateWeeklyProduct(adminReq({ params: { id: WID(1) }, body: { startDate: doc.startDate.toISOString(), order: 3 } }), same);
  assert.equal(same.statusCode, 200, JSON.stringify(same.body));
  assert.equal(doc.order, 3);

  const past = response();
  await updateWeeklyProduct(adminReq({ params: { id: WID(1) }, body: { startDate: new Date(Date.now() - H).toISOString() } }), past);
  assert.equal(past.statusCode, 200, JSON.stringify(past.body));
  assert.ok(Math.abs(+doc.startDate - (Date.now() - 30 * 1000)) < 5000, "başlangıç değişmez");

  const future = response();
  await updateWeeklyProduct(adminReq({ params: { id: WID(1) }, body: { startDate: new Date(Date.now() + DAY).toISOString() } }), future);
  assert.equal(future.statusCode, 400, "yayındaki fırsat ertelenemez");
  assert.match(future.body.message, /başlangıcı değiştirilemez/);

  // Durdurulmuş (aktif olmayan) fırsatta "şimdi" de başlangıç değişikliğidir: reddedilir
  const paused = activatedDoc({ isActive: false });
  mockUpdate(t, paused);
  const res = response();
  await updateWeeklyProduct(adminReq({ params: { id: WID(1) }, body: { startDate: "now" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(paused.saves, 0);
});

// ── Kopyalama: son okuma hatası ─────────────────────────────────────────────

const mondayAhead = () => {
  const trNow = new Date(Date.now() + 3 * H);
  const days = ((8 - trNow.getUTCDay()) % 7) || 7;
  const midnight = Date.UTC(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate()) - 3 * H;
  return new Date(midnight + days * DAY);
};

test("kopyalama: fırsatlar oluştuktan sonra son okuma başarısız olursa 500 değil 201; işlem kaydı ve yayın yine yapılır", async (t) => {
  const audit = captureAudit(t);
  t.mock.method(console, "error", () => {});
  const start = mondayAhead();
  const end = new Date(+start + 7 * DAY - 1);
  const source = {
    _id: oid(WID(5)),
    product: { _id: oid(PID(5)), name: "Süt", price: 40, isHidden: false, isOutOfStock: false },
    weeklyPrice: 30,
    listPriceAtStart: 40,
    discountPercentage: 25,
    isActive: true,
    scheduled: false,
    startDate: new Date(Date.now() - 3 * DAY),
    endDate: start,
    order: 2,
  };
  const created = [];
  t.mock.method(WeeklyProduct, "find", (filter) => {
    if (filter?._id?.$in && created.length) return chain(() => { throw new Error("bağlantı koptu"); });
    if (filter?._id?.$in) return chain([source]);
    return chain([{ ...source, product: source.product._id }]);
  });
  t.mock.method(WeeklyProduct, "create", async (doc) => {
    const out = { _id: oid(WID(50)), ...doc };
    created.push(out);
    return out;
  });
  t.mock.method(WeeklyProduct, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(WeeklyProduct, "updateMany", async () => ({ modifiedCount: 0 }));

  const req = adminReq({ method: "POST", url: "/api/weekly-products/copy", body: { ids: [WID(5)], startDate: start.toISOString(), endDate: end.toISOString() } });
  const res = response();
  await copyWeeklyProducts(req, res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.created.length, 1);
  assert.equal(res.body.created[0].product.name, "Süt", "ürün bilgisi kaynaktan");
  assert.equal(res.body.created[0].scheduled, true);
  assert.equal(res.body.created[0].weeklyPrice, 30);
  assert.deepEqual(req.emits, ["weeklyProductsUpdated"]);
  await flush();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "Haftalık fırsatlar yeni döneme planlandı");
});

// ── Panel listesi sınırı ────────────────────────────────────────────────────

test("panel listesi: bitenler son 90 günle sınırlı; yayında/planlı/süresiz kayıtların hepsi döner; ürün açıklaması okunmaz", async (t) => {
  let filter = null;
  let populated = null;
  t.mock.method(WeeklyProduct, "find", (f) => {
    filter = f;
    const c = chain([]);
    const populate = c.populate;
    c.populate = (arg) => { populated = arg; return populate(arg); };
    return c;
  });
  const res = response();
  await getAllWeeklyProducts({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.historyDays, WEEKLY_ADMIN_HISTORY_DAYS);
  assert.equal(WEEKLY_ADMIN_HISTORY_DAYS, 90);
  const clauses = filter.$or;
  assert.ok(clauses.some((c) => c.isActive === true), "yayında olanlar");
  assert.ok(clauses.some((c) => c.scheduled === true), "planlı olanlar");
  assert.ok(clauses.some((c) => Object.prototype.hasOwnProperty.call(c, "endDate") && c.endDate === null), "süresiz/eski kayıtlar");
  const cutoff = clauses.find((c) => c.endDate?.$gte)?.endDate.$gte;
  assert.ok(cutoff instanceof Date);
  assert.ok(Math.abs(Date.now() - 90 * DAY - cutoff.getTime()) < 5000, "son 90 gün");
  assert.ok(!/description/.test(populated.select), "panelde kullanılmayan uzun alan gönderilmez");
  assert.match(populated.select, /isHidden/);
});
