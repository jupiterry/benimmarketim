import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import mongoose from "mongoose";
import {
  backupFileName, createBackup, inspectBackup, pruneBackups, readBackupLines, restoreBackup,
} from "../services/dbBackup.service.js";
import { runBackupOnce } from "../workers/backup.worker.js";

const { EJSON, ObjectId, Decimal128 } = mongoose.mongo.BSON;

// Bellekte çalışan küçük sahte veritabanı (yalnızca yedek/geri yüklemenin kullandığı yöntemler)
const fakeDb = (seed = {}, name = "benimmarketim") => {
  const data = new Map(Object.entries(seed).map(([key, docs]) => [key, { docs: [...docs], indexes: [] }]));
  const ensure = (key) => { if (!data.has(key)) data.set(key, { docs: [], indexes: [] }); return data.get(key); };
  return {
    databaseName: name,
    data,
    listCollections: () => ({ toArray: async () => [...data.keys()].map((key) => ({ name: key })) }),
    collection: (key) => ({
      indexes: async () => [{ v: 2, key: { _id: 1 }, name: "_id_" }, ...ensure(key).indexes],
      find: () => ({ async *[Symbol.asyncIterator]() { yield* ensure(key).docs; }, sort: () => ({ limit: () => ({ toArray: async () => [...ensure(key).docs].sort((a, b) => b.at - a.at).slice(0, 1) }) }) }),
      findOne: async (query) => ensure(key).docs.find((doc) => doc._id === query._id) || null,
      insertOne: async (doc) => { ensure(key).docs.push(doc); },
      insertMany: async (docs) => { ensure(key).docs.push(...docs); },
      deleteMany: async () => {},
      drop: async () => { if (!data.has(key)) throw new Error("ns not found"); data.delete(key); },
      createIndex: async (spec, options) => { ensure(key).indexes.push({ v: 2, key: spec, ...options }); },
    }),
  };
};

const sample = () => {
  const userId = new ObjectId();
  return {
    users: [{ _id: userId, name: "Şeyma Yıldız", phone: "0555 123 45 67", createdAt: new Date("2026-10-01T10:00:00Z") }],
    orders: Array.from({ length: 1203 }, (_, i) => ({ _id: new ObjectId(), user: userId, totalAmount: 10 + i / 100, status: "Teslim Edildi", createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) })),
    products: [{ _id: new ObjectId(), name: "Ülker Gofret", price: Decimal128.fromString("12.50"), tags: ["atıştırmalık"], meta: { nested: [1, 2] } }],
    "system.views": [{ _id: 1 }],
  };
};

const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), "bm-backup-"));

test("backup file name uses Istanbul time", () => {
  assert.equal(backupFileName(new Date("2026-10-11T00:30:00Z")), "benimmarketim-2026-10-11-0330.json.gz");
  assert.equal(backupFileName(new Date("2026-10-10T22:15:00Z"), true), "benimmarketim-2026-10-11-0115.json.gz.enc");
});

test("encrypted backup round-trips every document with types intact", async () => {
  const dir = await tempDir();
  const seed = sample();
  const source = fakeDb(seed);
  source.data.get("orders").indexes.push({ v: 2, key: { user: 1, createdAt: -1 }, name: "user_1_createdAt_-1" });
  source.data.get("users").indexes.push({ v: 2, key: { email: 1 }, name: "email_1", unique: true });

  const result = await createBackup({ db: source, EJSON, dir, password: "çok-gizli" });
  assert.equal(result.encrypted, true);
  assert.deepEqual(result.collections, { orders: 1203, products: 1, users: 1 });
  assert.equal(result.documents, 1205);
  assert.ok(result.file.endsWith(".json.gz.enc"));
  const raw = await fs.readFile(result.file);
  assert.equal(raw.subarray(0, 5).toString(), "BMBK1");
  assert.ok(!raw.includes(Buffer.from("Şeyma")), "kişisel veri düz metin olarak görünmemeli");

  const target = fakeDb({ orders: [{ _id: 1, stale: true }], other: [{ _id: 9 }] }, "geri_yukleme");
  const restored = await restoreBackup({ db: target, EJSON, file: result.file, password: "çok-gizli" });
  assert.deepEqual(restored.restored, { orders: 1203, products: 1, users: 1 });
  const orders = target.data.get("orders").docs;
  assert.equal(orders.length, 1203, "eski kayıtlar silinip yedektekiler yazılır");
  assert.ok(orders[0]._id instanceof ObjectId);
  assert.ok(orders[5].createdAt instanceof Date);
  assert.equal(orders[5].createdAt.toISOString(), seed.orders[5].createdAt.toISOString());
  assert.ok(target.data.get("products").docs[0].price instanceof Decimal128);
  assert.equal(target.data.get("products").docs[0].price.toString(), "12.50");
  // Sayılar Int32/Double sarmalayıcısıyla döner; sürücü bunları özgün türüyle yazar
  assert.deepEqual(target.data.get("products").docs[0].meta.nested.map(Number), [1, 2]);
  assert.equal(target.data.get("products").docs[0].meta.nested[0]._bsontype, "Int32");
  assert.equal(target.data.get("users").docs[0].name, "Şeyma Yıldız");
  assert.deepEqual(target.data.get("users").indexes.map((index) => [index.name, index.unique]), [["email_1", true]]);
  assert.equal(target.data.get("orders").indexes[0].name, "user_1_createdAt_-1");
  assert.ok(target.data.has("other"), "yedekte olmayan koleksiyonlara dokunulmaz");
  assert.ok(!target.data.has("system.views"));
});

test("wrong or missing password is reported, plain backups need none", async () => {
  const dir = await tempDir();
  const encrypted = await createBackup({ db: fakeDb(sample()), EJSON, dir, password: "doğru", now: new Date("2026-10-11T00:00:00Z") });
  await assert.rejects(readBackupLines(encrypted.file, ""), /BACKUP_PASSWORD_REQUIRED/);
  await assert.rejects(readBackupLines(encrypted.file, "yanlış"), /BACKUP_PASSWORD_WRONG/);
  const plain = await createBackup({ db: fakeDb(sample()), EJSON, dir, now: new Date("2026-10-11T01:00:00Z") });
  assert.equal(plain.encrypted, false);
  const { collections } = await inspectBackup(plain.file, "", EJSON);
  assert.equal(collections.orders.docs.length, 1203);
});

test("only selected collections are restored; dry run writes nothing", async () => {
  const dir = await tempDir();
  const { file } = await createBackup({ db: fakeDb(sample()), EJSON, dir, password: "p" });
  const target = fakeDb({ users: [{ _id: "mevcut" }] });
  const dry = await restoreBackup({ db: target, EJSON, file, password: "p", dryRun: true });
  assert.deepEqual(dry.restored, { orders: 1203, products: 1, users: 1 });
  assert.equal(target.data.get("users").docs[0]._id, "mevcut");
  await restoreBackup({ db: target, EJSON, file, password: "p", only: ["orders"] });
  assert.equal(target.data.get("orders").docs.length, 1203);
  assert.equal(target.data.get("users").docs[0]._id, "mevcut");
});

test("truncated or tampered files are rejected before anything is written", async () => {
  const dir = await tempDir();
  const { file } = await createBackup({ db: fakeDb(sample()), EJSON, dir, password: "p" });
  const raw = await fs.readFile(file);
  const tampered = path.join(dir, "bozuk.json.gz.enc");
  const copy = Buffer.from(raw); copy[60] ^= 0xff;
  await fs.writeFile(tampered, copy);
  await assert.rejects(inspectBackup(tampered, "p", EJSON), /BACKUP_PASSWORD_WRONG/);

  const plain = await createBackup({ db: fakeDb(sample()), EJSON, dir: await tempDir() });
  const lines = (await readBackupLines(plain.file)).slice(0, -3).join("\n");
  const zlib = await import("node:zlib");
  const cut = path.join(dir, "eksik.json.gz");
  await fs.writeFile(cut, zlib.gzipSync(lines));
  const target = fakeDb({ orders: [{ _id: "dokunulmamalı" }] });
  await assert.rejects(restoreBackup({ db: target, EJSON, file: cut }), /BACKUP_INCOMPLETE/);
  assert.equal(target.data.get("orders").docs[0]._id, "dokunulmamalı");
});

test("old backups are pruned, newest kept", async () => {
  const dir = await tempDir();
  for (let day = 1; day <= 5; day += 1) await fs.writeFile(path.join(dir, `benimmarketim-2026-10-0${day}-0330.json.gz.enc`), "x");
  await fs.writeFile(path.join(dir, "başka-dosya.txt"), "x");
  const removed = await pruneBackups(dir, 3);
  assert.deepEqual(removed.sort(), ["benimmarketim-2026-10-01-0330.json.gz.enc", "benimmarketim-2026-10-02-0330.json.gz.enc"]);
  const left = await fs.readdir(dir);
  assert.equal(left.length, 4);
  assert.ok(left.includes("başka-dosya.txt"), "yedek olmayan dosyalara dokunulmaz");
  for (const day of [3, 4, 5]) assert.ok(left.includes(`benimmarketim-2026-10-0${day}-0330.json.gz.enc`));
});

test("nightly run records success, skips its own log and records failure", async (t) => {
  const dir = await tempDir();
  const db = fakeDb({ ...sample(), backup_state: [{ _id: "main", note: "x" }] });
  const fetchCalls = [];
  t.mock.method(globalThis, "fetch", async (url) => { fetchCalls.push(String(url)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; });
  const settings = { dir, keep: 14, password: "p" };
  const ok = await runBackupOnce({ db, settings, EJSON });
  assert.equal(ok.ok, true);
  assert.equal(ok.encrypted, true);
  assert.deepEqual(Object.keys(ok).sort(), ["at", "bytes", "collections", "documents", "durationMs", "encrypted", "file", "ok", "removed"], "yedek kaydında dış gönderim alanı yoktur");
  assert.equal(db.data.get("backup_runs").docs.length, 1);
  assert.ok(!("backup_runs" in ok.collections));
  assert.ok("backup_state" in ok.collections);
  const files = await fs.readdir(dir);
  assert.equal(files.length, 1);
  assert.equal(files[0], ok.file);

  const broken = { ...db, listCollections: () => ({ toArray: async () => { throw new Error("Atlas bağlantısı koptu"); } }) };
  const failed = await runBackupOnce({ db: broken, settings, EJSON });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /Atlas/);
  assert.equal(db.data.get("backup_runs").docs.length, 2);
  assert.equal(fetchCalls.length, 0, "hiçbir dış servise istek atılmaz");
});
