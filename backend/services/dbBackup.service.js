// Veritabanı yedeği: tüm koleksiyonlar (dizinleriyle birlikte) tek dosyaya, sıkıştırılmış ve
// istenirse şifreli olarak yazılır; aynı dosyadan geri yüklenir.
// MongoDB Atlas ücretsiz (M0) kümede otomatik yedek olmadığı için bu iş sunucuda gece çalışır.
// mongodump gibi ek araç gerekmez; bağlantı mongoose üzerinden kurulur.
//
// Dosya biçimi (sıkıştırma öncesi): her satır bir JSON kaydı
//   {"type":"meta",...}                    → başlık
//   {"type":"collection","name","indexes"} → koleksiyon başlangıcı ve dizinleri
//   {"c":"orders","d":{...}}               → belge (Canonical Extended JSON: ObjectId, tarih vb. korunur)
//   {"type":"end","name","count"}          → koleksiyon sonu (geri yüklemede sayı doğrulanır)
//   {"type":"done"}                        → dosya eksiksiz
// Şifreli dosya: "BMBK1" + tuz(16) + iv(12) + AES-256-GCM(gzip) + etiket(16). Anahtar = scrypt(parola, tuz).

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";

export const BACKUP_FORMAT = 1;
export const BACKUP_PREFIX = "benimmarketim-";
const MAGIC = Buffer.from("BMBK1");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const INSERT_BATCH = 500;

const deriveKey = (password, salt) => crypto.scryptSync(String(password), salt, 32);

// İstanbul saatine göre dosya adı: benimmarketim-2026-10-11-0330.json.gz(.enc)
export const backupFileName = (date = new Date(), encrypted = false) => {
  const local = new Date(date.getTime() + 3 * 3600000).toISOString();
  const stamp = `${local.slice(0, 10)}-${local.slice(11, 13)}${local.slice(14, 16)}`;
  return `${BACKUP_PREFIX}${stamp}.json.gz${encrypted ? ".enc" : ""}`;
};

const listCollectionNames = async (db, exclude = []) =>
  (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((info) => info.name)
    .filter((name) => !name.startsWith("system.") && !exclude.includes(name))
    .sort();

/** Yedek satırlarını sırayla üretir; summary nesnesine koleksiyon başına belge sayısı yazılır. */
export async function* backupLines(db, EJSON, { now = new Date(), exclude = [], summary = {} } = {}) {
  const names = await listCollectionNames(db, exclude);
  yield `${JSON.stringify({ type: "meta", format: BACKUP_FORMAT, createdAt: now.toISOString(), database: db.databaseName, collections: names })}\n`;
  for (const name of names) {
    const collection = db.collection(name);
    let indexes = [];
    try {
      indexes = (await collection.indexes()).filter((index) => index.name !== "_id_");
    } catch {
      // dizin bilgisi okunamazsa belgeler yine de yedeklenir
    }
    yield `${EJSON.stringify({ type: "collection", name, indexes }, { relaxed: false })}\n`;
    let count = 0;
    for await (const doc of collection.find({}, { batchSize: INSERT_BATCH })) {
      count += 1;
      yield `${EJSON.stringify({ c: name, d: doc }, { relaxed: false })}\n`;
    }
    summary[name] = count;
    yield `${JSON.stringify({ type: "end", name, count })}\n`;
  }
  yield `${JSON.stringify({ type: "done" })}\n`;
}

/**
 * Yedek dosyası oluşturur. password verilirse dosya şifrelenir.
 * Dönen: { file, bytes, encrypted, collections: { ad: sayı }, documents, durationMs }
 */
export const createBackup = async ({ db, EJSON, dir, password = "", now = new Date(), exclude = [] }) => {
  const started = Date.now();
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const encrypted = Boolean(password);
  const file = path.join(dir, backupFileName(now, encrypted));
  const temp = `${file}.part`;
  const summary = {};
  const source = Readable.from(backupLines(db, EJSON, { now, exclude, summary }));
  const gzip = zlib.createGzip({ level: 9 });

  try {
    if (encrypted) {
      const salt = crypto.randomBytes(SALT_BYTES);
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
      await fsp.writeFile(temp, Buffer.concat([MAGIC, salt, iv]), { mode: 0o600 });
      await pipeline(source, gzip, cipher, fs.createWriteStream(temp, { flags: "a" }));
      await fsp.appendFile(temp, cipher.getAuthTag());
    } else {
      await pipeline(source, gzip, fs.createWriteStream(temp, { mode: 0o600 }));
    }
    await fsp.rename(temp, file);
  } catch (error) {
    await fsp.rm(temp, { force: true });
    throw error;
  }

  const { size } = await fsp.stat(file);
  return {
    file,
    bytes: size,
    encrypted,
    collections: summary,
    documents: Object.values(summary).reduce((sum, count) => sum + count, 0),
    durationMs: Date.now() - started,
  };
};

/** Dosyayı açar (gerekirse şifresini çözer) ve satırları döndürür. */
export const readBackupLines = async (file, password = "") => {
  const raw = await fsp.readFile(file);
  let gz = raw;
  if (raw.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (!password) throw new Error("BACKUP_PASSWORD_REQUIRED");
    const salt = raw.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
    const iv = raw.subarray(MAGIC.length + SALT_BYTES, MAGIC.length + SALT_BYTES + IV_BYTES);
    const body = raw.subarray(MAGIC.length + SALT_BYTES + IV_BYTES, raw.length - TAG_BYTES);
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(password, salt), iv);
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    try {
      gz = Buffer.concat([decipher.update(body), decipher.final()]);
    } catch {
      throw new Error("BACKUP_PASSWORD_WRONG");
    }
  }
  const text = zlib.gunzipSync(gz).toString("utf8");
  return text.split("\n").filter(Boolean);
};

/** Dosyayı okuyup doğrular: eksiksiz mi, sayılar tutuyor mu. Veritabanına dokunmaz. */
export const inspectBackup = async (file, password, EJSON) => {
  const lines = await readBackupLines(file, password);
  const meta = JSON.parse(lines[0]);
  if (meta.type !== "meta" || meta.format !== BACKUP_FORMAT) throw new Error("BACKUP_FORMAT_UNKNOWN");
  const collections = {};
  let complete = false;
  for (const line of lines.slice(1)) {
    // Belgeler türleri korunarak (canonical), başlık satırları düz sayılarla (relaxed) okunur
    const entry = EJSON.parse(line, { relaxed: !line.startsWith('{"c":') });
    if (entry.type === "collection") collections[entry.name] = { indexes: entry.indexes || [], docs: [], expected: null };
    else if (entry.type === "end") collections[entry.name].expected = entry.count;
    else if (entry.type === "done") complete = true;
    else if (entry.c) collections[entry.c].docs.push(entry.d);
  }
  if (!complete) throw new Error("BACKUP_INCOMPLETE");
  for (const [name, info] of Object.entries(collections)) {
    if (info.expected !== info.docs.length) throw new Error(`BACKUP_COUNT_MISMATCH:${name}`);
  }
  return { meta, collections };
};

/**
 * Yedeği bir veritabanına geri yükler. Seçilen her koleksiyon önce SİLİNİR, sonra yedekteki hâliyle yazılır.
 * only: yalnızca bu koleksiyonlar; dryRun: hiçbir şey yazmadan ne yapılacağını döndürür.
 */
export const restoreBackup = async ({ db, EJSON, file, password = "", only = null, dryRun = false }) => {
  const { meta, collections } = await inspectBackup(file, password, EJSON);
  const names = Object.keys(collections).filter((name) => !only || only.includes(name));
  const result = { createdAt: meta.createdAt, database: meta.database, restored: {} };
  for (const name of names) {
    const { docs, indexes } = collections[name];
    result.restored[name] = docs.length;
    if (dryRun) continue;
    const collection = db.collection(name);
    await collection.drop().catch(() => {}); // yoksa sorun değil
    for (let i = 0; i < docs.length; i += INSERT_BATCH) {
      await collection.insertMany(docs.slice(i, i + INSERT_BATCH), { ordered: false });
    }
    for (const index of indexes) {
      // v ve ns sunucuya özel alanlar; yeni dizine aktarılmaz
      const { key, ...options } = index;
      delete options.v;
      delete options.ns;
      await collection.createIndex(key, options).catch((error) => {
        console.warn(`Dizin oluşturulamadı (${name}.${index.name}):`, error.message);
      });
    }
  }
  return result;
};

/** Klasörde en yeni `keep` yedeği bırakır, eskileri siler. Silinen dosya adlarını döndürür. */
export const pruneBackups = async (dir, keep = 14) => {
  const files = (await fsp.readdir(dir).catch(() => []))
    .filter((name) => name.startsWith(BACKUP_PREFIX) && /\.json\.gz(\.enc)?$/.test(name))
    .sort()
    .reverse();
  const removed = files.slice(keep);
  await Promise.all(removed.map((name) => fsp.rm(path.join(dir, name), { force: true })));
  return removed;
};

// ── Telegram'a gönderim (yalnızca botun sahibine) ─────────────────────

export const TELEGRAM_FILE_LIMIT = 49 * 1024 * 1024; // bot API belge sınırı 50 MB

const formatBytes = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const backupCaption = (result) => {
  const top = Object.entries(result.collections)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name}: ${count.toLocaleString("tr-TR")}`)
    .join(" · ");
  return [
    "🗄 Veritabanı yedeği",
    `${path.basename(result.file)} · ${formatBytes(result.bytes)}`,
    `${Object.keys(result.collections).length} koleksiyon, ${result.documents.toLocaleString("tr-TR")} kayıt`,
    top,
    result.encrypted ? "Dosya şifreli; geri yüklemek için BACKUP_PASSWORD gerekir." : "",
  ].filter(Boolean).join("\n");
};

const telegramCall = async (token, method, form) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(`TELEGRAM_${response.status}`);
  return body;
};

/** Yedek dosyasını Telegram'a belge olarak gönderir; çok büyükse yalnızca bilgi mesajı atar. */
export const sendBackupToTelegram = async ({ token, chatId, result }) => {
  if (!token || !chatId) return { sent: false, reason: "telegram-not-configured" };
  if (!result.encrypted) return { sent: false, reason: "not-encrypted" }; // kişisel veriler şifresiz gönderilmez
  const caption = backupCaption(result);
  if (result.bytes > TELEGRAM_FILE_LIMIT) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("text", `${caption}\n\n⚠️ Dosya Telegram sınırından büyük olduğu için gönderilmedi; sunucuda duruyor.`);
    await telegramCall(token, "sendMessage", form);
    return { sent: false, reason: "too-large" };
  }
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption.slice(0, 1000));
  form.append("protect_content", "true");
  form.append("document", new Blob([await fsp.readFile(result.file)]), path.basename(result.file));
  await telegramCall(token, "sendDocument", form);
  return { sent: true };
};

export const sendTelegramText = async ({ token, chatId, text }) => {
  if (!token || !chatId) return false;
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("text", text.slice(0, 3800));
  await telegramCall(token, "sendMessage", form);
  return true;
};
