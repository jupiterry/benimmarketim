import { startBackupWorker } from "./backup.worker.js";

// pm2 start backend/workers/backup.run.js --name benimmarketim-backup --time
// Tek seferlik: node backend/workers/backup.run.js --now
const once = process.argv.includes("--now");
startBackupWorker({ once })
  .then((record) => { if (once) process.exit(record?.ok ? 0 : 1); })
  .catch((error) => {
    console.error("Yedek görevi başlatılamadı; MONGO_URI ve ayarları kontrol edin.", error?.message || "");
    process.exit(1);
  });
