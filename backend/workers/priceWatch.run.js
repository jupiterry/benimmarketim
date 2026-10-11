import { startPriceWatchWorker } from "./priceWatch.worker.js";

// pm2 start backend/workers/priceWatch.run.js --name benimmarketim-price-watch --time
// Deneme (3 ürün kontrol edip çıkar): node backend/workers/priceWatch.run.js --deneme
const trialArg = process.argv.find((arg) => arg.startsWith("--deneme"));
const trial = trialArg ? Math.min(20, Math.max(1, Number(trialArg.split("=")[1]) || 3)) : 0;
startPriceWatchWorker({ trial })
  .then(() => { if (trial) process.exit(0); })
  .catch((error) => {
    console.error("Fiyat bekçisi başlatılamadı; MONGO_URI ve SEARXNG_URL ayarlarını kontrol edin.", error?.message || "");
    process.exit(1);
  });
