import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { protectRoute, adminRoute } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protectRoute, adminRoute);
router.get('/status', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const [state, counts, recent, subscriberCount] = await Promise.all([
      db.collection('telegram_state').findOne({ _id: 'main' }),
      db.collection('telegram_jobs').aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      db.collection('telegram_jobs').find({}, { projection: { kind: 1, status: 1, sentAt: 1, createdAt: 1, acknowledgedAt: 1, acknowledgedBy: 1, lastError: 1, attempts: 1 } }).sort({ createdAt: -1 }).limit(8).toArray(),
      db.collection('telegram_subscribers').countDocuments({ active: true }),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ paired: subscriberCount > 0, subscriberCount, online: Boolean(state?.heartbeatAt && Date.now() - state.heartbeatAt.getTime() < 60000),
      lastSentAt: state?.lastSentAt, lastError: state?.lastError, counts: Object.fromEntries(counts.map(c => [c._id, c.count])), recent });
  } catch {
    res.status(503).json({ message: 'Telegram bildirim durumu alınamadı.' });
  }
});
router.post('/test', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const allowed = await db.collection('telegram_state').updateOne({ _id: 'main', chatId: { $exists: true },
      $or: [{ lastTestAt: { $lt: new Date(Date.now() - 60000) } }, { lastTestAt: { $exists: false } }],
    }, { $set: { lastTestAt: new Date() } });
    if (!allowed.matchedCount) return res.status(429).json({ message: 'Önce botu bağlayın; testler arasında bir dakika bekleyin.' });
    await db.collection('telegram_jobs').insertOne({ _id: `test:${randomUUID()}`, kind: 'test', status: 'pending', dueAt: new Date(), createdAt: new Date(), attempts: 0 });
    res.status(202).json({ message: 'Test bildirimi sıraya alındı.' });
  } catch {
    res.status(503).json({ message: 'Test bildirimi sıraya alınamadı.' });
  }
});
export default router;
