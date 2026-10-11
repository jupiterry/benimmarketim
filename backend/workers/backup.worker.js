// Gece veritabanı yedeği: yedek alınır, eskiler silinir, şifreli dosya Telegram'da botun sahibine gönderilir.
// Ayrı bir PM2 süreci olarak çalışır (API'yi yavaşlatmaz, API birden çok kopya çalışsa da yedek bir kez alınır).
import path from "node:path";
import cron from "node-cron";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createBackup, pruneBackups, sendBackupToTelegram, sendTelegramText } from "../services/dbBackup.service.js";

const DEFAULT_SCHEDULE = "30 3 * * *"; // her gece 03:30 (İstanbul); BACKUP_SCHEDULE ile değiştirilebilir
const CATCH_UP_HOURS = 26; // sunucu kapalı kaldıysa açılışta eksik yedek hemen alınır

export const backupSettings = () => ({
  dir: process.env.BACKUP_DIR || path.resolve("backups"),
  keep: Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 14),
  password: process.env.BACKUP_PASSWORD || "",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
});

export const loadEJSON = async () => mongoose.mongo?.BSON?.EJSON || (await import("bson")).EJSON;

/** Bir kez yedek alır; sonucu backup_runs koleksiyonuna yazar. Hata fırlatmaz, sonucu döndürür. */
export const runBackupOnce = async ({ db = mongoose.connection.db, notify = true, settings = backupSettings(), EJSON } = {}) => {
  const runs = db.collection("backup_runs");
  const owner = await db.collection("telegram_state").findOne({ _id: "main" }).catch(() => null);
  try {
    if (!settings.password) console.warn("BACKUP_PASSWORD tanımlı değil: yedek şifresiz yazılır ve Telegram'a gönderilmez.");
    const result = await createBackup({ db, EJSON: EJSON || (await loadEJSON()), dir: settings.dir, password: settings.password, exclude: ["backup_runs"] });
    const removed = await pruneBackups(settings.dir, settings.keep);
    let telegram = { sent: false, reason: "disabled" };
    if (notify) {
      try {
        telegram = await sendBackupToTelegram({ token: settings.telegramToken, chatId: owner?.chatId, result });
      } catch (error) {
        telegram = { sent: false, reason: error.message };
      }
    }
    const record = {
      at: new Date(), ok: true, file: path.basename(result.file), bytes: result.bytes, documents: result.documents,
      collections: result.collections, encrypted: result.encrypted, durationMs: result.durationMs, removed, telegram,
    };
    await runs.insertOne(record);
    await runs.deleteMany({ at: { $lt: new Date(Date.now() - 90 * 86400000) } });
    console.log(`Yedek alındı: ${record.file} (${result.documents} kayıt, ${result.bytes} bayt, Telegram: ${telegram.sent ? "gönderildi" : telegram.reason})`);
    return record;
  } catch (error) {
    const record = { at: new Date(), ok: false, error: String(error?.message || error).slice(0, 500) };
    await runs.insertOne(record).catch(() => {});
    console.error("Yedek alınamadı:", record.error);
    if (notify) {
      await sendTelegramText({ token: settings.telegramToken, chatId: owner?.chatId, text: `⚠️ Veritabanı yedeği alınamadı\n${record.error}` }).catch(() => {});
    }
    return record;
  }
};

const lastSuccessAt = async (db) => (await db.collection("backup_runs").find({ ok: true }).sort({ at: -1 }).limit(1).toArray())[0]?.at || null;

export const startBackupWorker = async ({ once = false } = {}) => {
  dotenv.config();
  dotenv.config({ path: ".telegram.env" });
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;

  if (once) {
    const record = await runBackupOnce({ db });
    await mongoose.disconnect();
    return record;
  }

  const last = await lastSuccessAt(db);
  if (!last || Date.now() - new Date(last).getTime() > CATCH_UP_HOURS * 3600000) await runBackupOnce({ db });

  const schedule = process.env.BACKUP_SCHEDULE || DEFAULT_SCHEDULE;
  let running = false;
  cron.schedule(schedule, async () => {
    if (running) return;
    running = true;
    try { await runBackupOnce({ db }); } finally { running = false; }
  }, { scheduled: true, timezone: "Europe/Istanbul" });
  console.log(`Yedek görevi hazır: ${schedule} (Europe/Istanbul), klasör ${backupSettings().dir}`);
  return null;
};
