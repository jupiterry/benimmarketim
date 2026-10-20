import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import Settings from "../models/settings.model.js";
import AdminAudit from "../models/adminAudit.model.js";

// cart.controller Redis'e bağlanır; ayar denetleyicisi gerçek, önbellek yenileme sahte.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./cart.controller.js" && context.parentURL?.endsWith("/settings.controller.js")) {
      return { url: "data:text/javascript,export const refreshOrderHoursCache = async () => {};", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { updateSettings, describeSettingsChanges, validateSettingsInput } = await import("../controllers/settings.controller.js");
hooks.deregister();

const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = () => ({
  code: 200,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (body) => ({ user: ADMIN, method: "PUT", originalUrl: "/api/settings", body });

/** Bellekte tutulan tek ayar belgesi: save() doğrular ve "veritabanına" yazar */
const mockStore = (t, initial = {}) => {
  let stored = new Settings({ name: "default", ...initial }).toObject();
  const saves = [];
  t.mock.method(Settings, "getSettings", async () => {
    const document = new Settings(stored);
    document.save = async () => { await document.validate(); stored = document.toObject(); saves.push(stored); };
    return document;
  });
  return { get: () => stored, saves };
};
const captureAudit = (t) => {
  const writes = [];
  t.mock.method(AdminAudit, "create", async (doc) => { writes.push(doc); return doc; });
  return writes;
};

test("işlem kaydı: değişen her ayar okunur etiket ve eski → yeni değerle yazılır", async (t) => {
  const store = mockStore(t);
  const writes = captureAudit(t);
  const req = request({
    orderStartHour: 9, orderStartMinute: 30, orderEndHour: 1, orderEndMinute: 0,
    minimumOrderAmount: 300,
    deliveryPoints: { girlsDorm: { enabled: false, name: "Kız KYK Yurdu" } },
    appVersion: { forceUpdate: false, latestVersion: "4.1.0" },
    ai: { enabled: true, provider: "groq", model: "llama-3.1-8b-instant", maxHistoryMessages: 20 },
  });
  const res = response();
  await updateSettings(req, res);
  await tick();

  assert.equal(res.code, 200);
  assert.equal(req.auditRecorded, true);
  assert.equal(writes.length, 1);
  const [entry] = writes;
  assert.equal(entry.category, "settings");
  assert.equal(entry.target, "settings");
  assert.equal(entry.targetName, "Mağaza ayarları");
  assert.equal(entry.summary, "PUT /api/settings");
  assert.match(entry.action, /^\d+ mağaza ayarı değiştirildi$/);
  const byLabel = Object.fromEntries(entry.changes.map((c) => [c.label, [c.from, c.to]]));
  assert.deepEqual(byLabel["Sipariş başlangıç saati"], ["10:00", "09:30"]);
  assert.equal(byLabel["Sipariş bitiş saati"], undefined, "değişmeyen alan listelenmez");
  assert.deepEqual(byLabel["Minimum sipariş tutarı"], ["₺250,00", "₺300,00"]);
  assert.deepEqual(byLabel["Kız KYK Yurdu teslimatı"], ["Açık", "Kapalı"]);
  assert.equal(byLabel["Erkek KYK Yurdu teslimatı"], undefined, "gönderilmeyen nokta olduğu gibi kalır");
  assert.deepEqual(byLabel["Zorunlu güncelleme"], ["Açık", "Kapalı"]);
  assert.deepEqual(byLabel["Uygulama son sürümü"], ["4.0.3", "4.1.0"]);
  assert.deepEqual(byLabel["Yapay zekâ sağlayıcısı"], ["OpenRouter", "Groq"]);
  assert.deepEqual(byLabel["Yapay zekâ modeli"][1], "llama-3.1-8b-instant");
  assert.deepEqual(byLabel["Yapay zekâ geçmiş sınırı"], ["12 mesaj", "20 mesaj"]);
  // Yanıt da değişiklik listesini taşır; kaydedilen belge güncel
  assert.equal(res.body.changes.length, entry.changes.length);
  assert.equal(store.get().ai.provider, "groq");
  assert.equal(store.get().deliveryPoints.girlsDorm.enabled, false);
  assert.equal(store.get().deliveryPoints.boysDorm.enabled, true);
  assert.equal(store.get().deliveryPoints.girlsDorm.startHour, 10, "gönderilmeyen nokta alanı korunur");
});

test("tek alan değişince eylem adı alanı söyler; hiçbir şey değişmezse kayıt yazılmaz", async (t) => {
  mockStore(t);
  const writes = captureAudit(t);
  const one = request({ minimumOrderAmount: 275 });
  await updateSettings(one, response());
  await tick();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, "Ayar değiştirildi: Minimum sipariş tutarı");
  assert.deepEqual(writes[0].changes, [{ label: "Minimum sipariş tutarı", from: "₺250,00", to: "₺275,00" }]);

  const same = request({ minimumOrderAmount: 275, orderStartHour: 10 });
  const res = response();
  await updateSettings(same, res);
  await tick();
  assert.equal(res.code, 200);
  assert.equal(writes.length, 1, "değişiklik yoksa yeni kayıt yok");
  assert.equal(same.auditRecorded, true, "rota bazlı genel kayıt da bastırılır");
  assert.deepEqual(res.body.changes, []);
});

test("geçersiz değerler kaydedilmeden 400 ile reddedilir ve kayıt yazılmaz", async (t) => {
  const store = mockStore(t);
  const writes = captureAudit(t);
  const cases = [
    [{ orderStartHour: 24 }, /0–23/],
    [{ orderEndMinute: -1 }, /0–59/],
    [{ orderStartHour: "10" }, /0–23/],
    [{ minimumOrderAmount: -5 }, /0 ya da daha büyük/],
    [{ minimumOrderAmount: "abc" }, /0 ya da daha büyük/],
    [{ deliveryPoints: { girlsDorm: { name: "   " } } }, /adı boş olamaz/],
    [{ deliveryPoints: { boysDorm: { endHour: 25 } } }, /saatleri geçersiz/],
    [{ appVersion: null }, /versiyon/],
    [{ ai: { provider: "openai" } }, /sağlayıcısı/],
    [{ ai: { model: " " } }, /model adı/],
    [{ ai: { maxHistoryMessages: 99 } }, /2–30/],
  ];
  for (const [body, pattern] of cases) {
    const res = response();
    await updateSettings(request(body), res);
    assert.equal(res.code, 400, JSON.stringify(body));
    assert.match(res.body.message, pattern);
  }
  await tick();
  assert.equal(store.saves.length, 0);
  assert.equal(writes.length, 0);
  assert.equal(validateSettingsInput({ orderStartHour: 0, orderEndHour: 23, minimumOrderAmount: 0 }), null);
});

test("describeSettingsChanges nokta adı ve saatleri ile mağaza bağlantılarını da izler", () => {
  const before = new Settings({ name: "default" }).toObject();
  const after = new Settings({
    name: "default",
    deliveryPoints: { ...before.deliveryPoints, boysDorm: { ...before.deliveryPoints.boysDorm, name: "Erkek Yurdu (Yeni)", endHour: 23, endMinute: 30 } },
    appVersion: { ...before.appVersion, iosStoreUrl: "https://apps.apple.com/x" },
    ai: { ...before.ai, enabled: false },
  }).toObject();
  const changes = describeSettingsChanges(before, after);
  assert.deepEqual(changes, [
    { label: "Erkek KYK Yurdu adı", from: "Erkek KYK Yurdu", to: "Erkek Yurdu (Yeni)" },
    { label: "Erkek KYK Yurdu saatleri", from: "10:00–01:00", to: "10:00–23:30" },
    { label: "App Store bağlantısı", from: before.appVersion.iosStoreUrl, to: "https://apps.apple.com/x" },
    { label: "Yapay zekâ asistanı", from: "Açık", to: "Kapalı" },
  ]);
  assert.deepEqual(describeSettingsChanges(before, before), []);
});

test("oturum bilgisi olmayan istek (eski testler, araçlar) kayıt yazmadan çalışır", async (t) => {
  mockStore(t);
  const writes = captureAudit(t);
  const res = response();
  await updateSettings({ body: { minimumOrderAmount: 260 } }, res);
  await tick();
  assert.equal(res.code, 200);
  assert.equal(writes.length, 0);
});
