// Müşteri 360 bağımsız inceleme: iç not / işaret kaydında eşzamanlılık ve girdi sınırları.
// - İşaretler: eski ekrandan yapılan dokunuş, bu arada başka yöneticinin eklediği / kaldırdığı işareti ezmez (baseFlags).
// - Çok büyük not gövdesi karakter karakter işlenmeden reddedilir.
// Veritabanı yok: her sorgu taklit edilir.
import test from "node:test";
import assert from "node:assert/strict";

import User from "../models/user.model.js";
import AdminAudit from "../models/adminAudit.model.js";
import { mergeStaffFlags, parseStaffNoteBody, updateStaffNote } from "../controllers/user.controller.js";

const USER_ID = "507f191e810c19729de8a001";
const ADMIN = { _id: "507f191e810c19729de860ea", role: "admin", name: "Deniz Yönetici" };

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
const chain = (result) => {
  const c = { select: () => c, sort: () => c, limit: () => c, populate: () => c, lean: async () => result };
  return c;
};
const staffReq = (body) => ({ params: { userId: USER_ID }, body, user: ADMIN, method: "PATCH", originalUrl: `/api/users/${USER_ID}/staff-note` });
/** current: veritabanındaki kayıt; findOneAndUpdate güncellemeyi bu kayda uygular */
const mockStaffNote = (t, current) => {
  const calls = { update: [], audit: [], find: 0 };
  t.mock.method(User, "findById", () => { calls.find += 1; return chain(current); });
  t.mock.method(User, "findOneAndUpdate", (filter, update, options) => {
    calls.update.push({ filter, update, options });
    const next = { ...current, ...(update.$set || {}) };
    for (const key of Object.keys(update.$unset || {})) delete next[key];
    return chain(next);
  });
  t.mock.method(User, "find", () => chain([]));
  t.mock.method(AdminAudit, "create", async (doc) => { calls.audit.push(doc); return doc; });
  return calls;
};

test("mergeStaffFlags: only this request's additions and removals are applied to the current list", () => {
  // Başka yönetici "Siparişten önce ara" ekledi; bu ekran eski listeyle "Kapıda kartla öder" ekliyor
  assert.deepEqual(mergeStaffFlags(["call_before"], ["pays_card"], []), ["call_before", "pays_card"]);
  // Başka yönetici "Adres tarifi zor"u kaldırdı; bu ekran eski listeden "Şikâyet geçmişi var"ı kaldırıyor
  assert.deepEqual(mergeStaffFlags(["complaint_history"], ["hard_address"], ["hard_address", "complaint_history"]), []);
  // Aynı işaret iki yöneticice eklendi: tek kez, değişiklik yok
  assert.deepEqual(mergeStaffFlags(["call_before"], ["call_before"], []), ["call_before"]);
  // base yoksa liste olduğu gibi (eski istemci uyumu); bilinmeyen anahtarlar atılır, sıra sabit
  assert.deepEqual(mergeStaffFlags(["call_before"], ["pays_card", "eski"], undefined), ["pays_card"]);
  assert.deepEqual(mergeStaffFlags(["pays_card", "bozuk"], ["hard_address", "call_before"], ["pays_card"]), ["call_before", "hard_address"]);
});

test("staff flags: a toggle from a stale screen keeps the flag another admin added meanwhile", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", staffFlags: ["call_before"] };
  const calls = mockStaffNote(t, current);
  const res = response();
  // Ekranda işaret yoktu (eski görünüm); yönetici "Kapıda kartla öder"e bastı
  await updateStaffNote(staffReq({ flags: ["pays_card"], baseFlags: [] }), res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.update[0].update, { $set: { staffFlags: ["call_before", "pays_card"] } });
  assert.deepEqual(res.body.staffFlags, ["call_before", "pays_card"], "ekran güncel listeyi alır");
  assert.deepEqual(calls.audit[0].changes, [{ label: "İşaretler", from: "Siparişten önce ara", to: "Siparişten önce ara, Kapıda kartla öder" }]);
});

test("staff flags: removing a flag that someone else already removed is a no-op (no write, no audit)", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", staffFlags: ["pays_card"] };
  const calls = mockStaffNote(t, current);
  const req = staffReq({ flags: [], baseFlags: ["call_before"] });
  const res = response();
  await updateStaffNote(req, res);
  await tick();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.unchanged, true);
  assert.deepEqual(res.body.staffFlags, ["pays_card"], "başka yöneticinin işareti korunur ve ekrana döner");
  assert.equal(calls.update.length, 0);
  assert.equal(calls.audit.length, 0);
  assert.equal(req.auditRecorded, true);
});

test("staff flags: removing the last flag unsets the list; without baseFlags the list is written as sent", async (t) => {
  const current = { _id: USER_ID, name: "Ayşe Kaya", staffFlags: ["call_before"] };
  const calls = mockStaffNote(t, current);
  const res = response();
  await updateStaffNote(staffReq({ flags: [], baseFlags: ["call_before"] }), res);
  await tick();
  assert.deepEqual(calls.update[0].update, { $unset: { staffFlags: 1 } });
  assert.deepEqual(res.body.staffFlags, []);

  t.mock.restoreAll();
  const legacy = mockStaffNote(t, { _id: USER_ID, name: "Ayşe Kaya", staffFlags: ["call_before", "hard_address"] });
  const plain = response();
  await updateStaffNote(staffReq({ flags: ["pays_card"] }), plain);
  await tick();
  assert.deepEqual(legacy.update[0].update, { $set: { staffFlags: ["pays_card"] } }, "baseFlags gönderilmezse eski davranış");
});

test("staff note body: baseFlags is validated like flags; an oversized note is rejected before cleaning", async (t) => {
  assert.match(parseStaffNoteBody({ flags: [], baseFlags: "call_before" }).error, /liste/);
  assert.match(parseStaffNoteBody({ flags: [], baseFlags: Array.from({ length: 21 }, () => "call_before") }).error, /Çok fazla/);
  assert.match(parseStaffNoteBody({ flags: [], baseFlags: [{ $gt: "" }] }).error, /Geçersiz işaret/);
  assert.deepEqual(parseStaffNoteBody({ flags: ["pays_card"], baseFlags: null }).value, { flags: ["pays_card"] }, "null: base yok");
  assert.deepEqual(parseStaffNoteBody({ flags: ["pays_card"], baseFlags: ["x", "call_before"] }).value, { flags: ["pays_card"], baseFlags: ["call_before"] });
  assert.equal(parseStaffNoteBody({ text: "Not", baseFlags: ["call_before"] }).value.baseFlags, undefined, "işaret yoksa base kullanılmaz");

  // Satır sonu / boşluk payı olan metin kabul edilir; çok büyük gövde işlenmeden reddedilir
  assert.equal(parseStaffNoteBody({ text: `${"a".repeat(400)}${" \n".repeat(300)}` }).value.text.length, 400);
  let touched = false;
  t.mock.method(User, "findById", () => { touched = true; return chain(null); });
  const res = response();
  const started = Date.now();
  await updateStaffNote(staffReq({ text: "x".repeat(5 * 1024 * 1024) }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /500 karakter/);
  assert.equal(touched, false, "veritabanına gidilmez");
  assert.ok(Date.now() - started < 500, "büyük gövde karakter karakter işlenmez");
});
