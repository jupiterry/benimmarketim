import { startTelegramWorker } from './telegram.worker.js';

startTelegramWorker().catch(() => {
  console.error('Telegram worker could not start; check configuration and database.');
  process.exit(1);
});
