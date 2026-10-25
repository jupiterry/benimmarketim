// Altyapı temizliği: kayıt/giriş sırasında sunucu loglarına kişisel veri (e-posta, telefon, parola
// özeti, kupon kodu) yazılmaz; Telegram botu projeden tamamen kaldırıldı ve geri gelmez.
// Veritabanı yok: User modeli t.mock.method ile taklit edilir, Redis bellek katmanıdır.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import User from "../models/user.model.js";
import { signup, login, safeErrorSummary } from "../controllers/auth.controller.js";

process.env.ACCESS_TOKEN_SECRET ||= "test-access-secret";
process.env.REFRESH_TOKEN_SECRET ||= "test-refresh-secret";

const EMAIL = "ayse.yilmaz@example.com";
const PHONE = "05321234567";
const PASSWORD = "Gizli-Parola-123";
const HASH = "$2a$10$abcdefghijklmnopqrstuvCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const USER_ID = "507f1f77bcf86cd799439011";

const response = () => ({
  statusCode: 200,
  body: undefined,
  cookies: {},
  cookie(name, value) { this.cookies[name] = value; return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

/** console.log/info/warn/error çıktısını yakalar. */
const captureConsole = (t) => {
  const lines = [];
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    t.mock.method(console, method, (...args) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a) ?? String(a))).join(" "));
    });
  }
  return lines;
};

const assertNoPersonalData = (lines) => {
  const all = lines.join("\n");
  for (const secret of [EMAIL, PHONE, PASSWORD, HASH, "$2a$10$"]) {
    assert.ok(!all.includes(secret), `log kişisel veri içeriyor: ${secret}\n${all}`);
  }
};

test("kayıt: kullanıcı belgesi (parola özeti, e-posta, telefon) loglanmaz, yalnızca kimlik yazılır", async (t) => {
  const lines = captureConsole(t);
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async (data) => ({
    _id: USER_ID, name: data.name, email: data.email, phone: data.phone, password: HASH, role: "customer",
    toString() { return JSON.stringify(this); },
  }));
  const res = response();
  await signup({ body: { email: EMAIL, password: PASSWORD, name: "Ayşe Yılmaz", phone: PHONE, deviceType: "android" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body._id, USER_ID);
  assert.equal(res.body.password, undefined);
  assertNoPersonalData(lines);
  assert.ok(lines.some((line) => line.includes(USER_ID)));
});

test("kayıt hatası: yinelenen e-posta iletisindeki değer loglanmaz", async (t) => {
  const lines = captureConsole(t);
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async () => {
    const error = new Error(`E11000 duplicate key error collection: users index: email_1 dup key: { email: "${EMAIL}" }`);
    error.code = 11000;
    error.keyPattern = { email: 1 };
    error.keyValue = { email: EMAIL };
    throw error;
  });
  await signup({ body: { email: EMAIL, password: PASSWORD, name: "Ayşe Yılmaz", phone: PHONE } }, response());
  assertNoPersonalData(lines);
  assert.ok(lines.some((line) => line.includes("E11000") && line.includes("email")));
});

test("giriş: e-posta loglanmaz", async (t) => {
  const lines = captureConsole(t);
  const user = {
    _id: USER_ID, name: "Ayşe", email: EMAIL, phone: PHONE, role: "customer", password: HASH,
    comparePassword: async (candidate) => candidate === PASSWORD,
    save: async () => user,
  };
  t.mock.method(User, "findOne", async () => user);
  const res = response();
  await login({ body: { email: EMAIL, password: PASSWORD, deviceType: "ios" }, headers: {}, get: () => undefined }, res);
  assert.equal(res.statusCode, 200);
  assertNoPersonalData(lines);

  const wrong = captureConsole(t);
  await login({ body: { email: EMAIL, password: "yanlis" }, headers: {} }, response());
  assertNoPersonalData(wrong);
});

test("safeErrorSummary: alan adını yazar, gönderilen değeri yazmaz", () => {
  const dup = Object.assign(new Error(`dup key: { phone: "${PHONE}" }`), { code: 11000, keyValue: { phone: PHONE } });
  assert.equal(safeErrorSummary(dup), "E11000 yinelenen kayıt (alan: phone)");
  const validation = Object.assign(new Error(`User validation failed: email: ${EMAIL} geçersiz`), {
    name: "ValidationError", errors: { email: {}, phone: {} },
  });
  assert.equal(safeErrorSummary(validation), "ValidationError (alan: email, phone)");
  const cast = Object.assign(new Error(`Cast to string failed for value "${PHONE}"`), { name: "CastError", path: "phone" });
  assert.equal(safeErrorSummary(cast), "CastError (alan: phone)");
  assert.equal(safeErrorSummary(null), "bilinmeyen hata");
});

// ── Telegram botu kaldırıldı ────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
};

test("Telegram botu: backend ve frontend kaynağında dosya ya da başvuru kalmadı", () => {
  const files = [...walk(join(ROOT, "backend")), ...walk(join(ROOT, "frontend", "src"))];
  assert.ok(files.length > 50);
  const offenders = files
    .filter((file) => file !== SELF && /\.(m?js|jsx|ts|tsx|json|md)$/.test(file))
    .filter((file) => /telegram/i.test(file) || /telegram/i.test(readFileSync(file, "utf8")))
    .map((file) => relative(ROOT, file));
  assert.deepEqual(offenders, []);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /telegram/i);
});

test("yayın betiği eski Telegram PM2 sürecini her yayında, yoksa hata vermeden kaldırır", () => {
  const deploy = readFileSync(join(ROOT, "ops", "deploy", "deploy.sh"), "utf8");
  assert.match(deploy, /LEGACY_TELEGRAM=benimmarketim-telegram/);
  assert.match(deploy, /if pm2 describe "\$LEGACY_TELEGRAM" >\/dev\/null 2>&1; then/);
  assert.match(deploy, /pm2 delete "\$LEGACY_TELEGRAM" \|\| true/);
  assert.match(deploy, /pm2 save \|\| true/);
});
