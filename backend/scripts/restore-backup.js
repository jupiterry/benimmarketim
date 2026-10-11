// Yedekten geri yükleme. Varsayılan olarak yalnızca dosyayı DOĞRULAR, hiçbir şey yazmaz.
//
//   node backend/scripts/restore-backup.js <dosya>                         → doğrula ve içeriği listele
//   node backend/scripts/restore-backup.js <dosya> --apply --target "<URI>"  → başka bir veritabanına yükle (önerilen: önce böyle deneyin)
//   node backend/scripts/restore-backup.js <dosya> --apply --live --yes     → canlı veritabanının (MONGO_URI) ÜZERİNE yaz
//   --only orders,users   yalnızca bu koleksiyonlar
//
// Canlıya yüklemeden önce o anki hâlin yedeği otomatik alınır (geri dönüş için).
import path from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createBackup, inspectBackup, restoreBackup } from "../services/dbBackup.service.js";
import { backupSettings, loadEJSON } from "../workers/backup.worker.js";

dotenv.config();
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((arg, i) => !arg.startsWith("--") && !["--target", "--only"].includes(args[i - 1]));

const main = async () => {
  if (!file) throw new Error("Kullanım: node backend/scripts/restore-backup.js <yedek-dosyası> [--apply --target <URI> | --apply --live --yes] [--only a,b]");
  const settings = backupSettings();
  const EJSON = await loadEJSON();
  const only = value("--only")?.split(",").map((s) => s.trim()).filter(Boolean) || null;

  const { meta, collections } = await inspectBackup(path.resolve(file), settings.password, EJSON);
  console.log(`Yedek: ${meta.createdAt} · veritabanı ${meta.database}`);
  for (const [name, info] of Object.entries(collections)) {
    if (!only || only.includes(name)) console.log(`  ${name}: ${info.docs.length} kayıt, ${info.indexes.length} dizin`);
  }
  if (!flag("--apply")) {
    console.log("Dosya sağlam. Yüklemek için --apply ile birlikte --target <URI> ya da --live --yes verin.");
    return;
  }

  const live = flag("--live");
  const uri = live ? process.env.MONGO_URI : value("--target");
  if (!uri) throw new Error("--target <URI> ya da --live gerekli.");
  if (live && !flag("--yes")) throw new Error("Canlı veritabanının üzerine yazmak için --yes ekleyin.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  if (live) {
    const safety = await createBackup({ db, EJSON, dir: settings.dir, password: settings.password, now: new Date() });
    console.log(`Geri dönüş için şimdiki hâlin yedeği alındı: ${safety.file}`);
  }
  const result = await restoreBackup({ db, EJSON, file: path.resolve(file), password: settings.password, only });
  console.log(`Geri yüklendi (${db.databaseName}):`);
  for (const [name, count] of Object.entries(result.restored)) console.log(`  ${name}: ${count}`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  const messages = {
    BACKUP_PASSWORD_REQUIRED: "Dosya şifreli; .env içinde BACKUP_PASSWORD tanımlı olmalı.",
    BACKUP_PASSWORD_WRONG: "BACKUP_PASSWORD bu yedeğin parolası değil (ya da dosya bozuk).",
    BACKUP_INCOMPLETE: "Dosya eksik; yedek alınırken yarıda kesilmiş olabilir.",
  };
  console.error(messages[error.message] || error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
