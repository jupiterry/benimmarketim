// Explicit opt-in; all fixtures live in uniquely named temporary collections.
// No real orders are created and no requests are made to Telegram.
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { TelegramWorker } from '../workers/telegram.worker.js';
import { localDay } from '../services/telegram.helpers.js';

if (process.env.RUN_TELEGRAM_INTEGRATION !== '1') throw new Error('Explicit opt-in required');
dotenv.config();
await mongoose.connect(process.env.MONGO_URI);
const prefix = `telegram_test_${randomUUID().replaceAll('-', '')}_`;
const collections = new Map();
const db = { collection(name) {
  if (!collections.has(name)) collections.set(name, mongoose.connection.db.collection(prefix + name));
  return collections.get(name);
} };
const calls = [];
let updates = [];
let failure = false;
const api = async (method, payload) => {
  if (method === 'getUpdates') { const batch = updates; updates = []; return batch; }
  if (failure && method === 'sendMessage') throw Object.assign(new Error('test'), { telegramCode: 429, retryAfter: 60 });
  calls.push({ method, payload });
  return { message_id: calls.length };
};
try {
  const worker = new TelegramWorker(db, api, 'test-secret');
  await worker.initialize();
  await worker.states.updateOne({ _id: 'main' }, { $set: { startedAt: new Date(Date.now() - 10000), chatStartedAt: new Date(Date.now() - 10000), chatId: '123', userId: '123' } });
  await worker.subscribers.insertMany([
    { _id: '123', userId: '123', active: true, subscribedAt: new Date(Date.now() - 9000) },
    { _id: '456', userId: '456', active: true, subscribedAt: new Date(Date.now() - 9000) },
    { _id: '789', userId: '789', active: false, subscribedAt: new Date(Date.now() - 9000) },
  ]);
  const state = await worker.states.findOne({ _id: 'main' });
  const activeId = new mongoose.Types.ObjectId();
  const cancelledId = new mongoose.Types.ObjectId();
  await worker.orders.insertMany([
    { _id: activeId, createdAt: new Date(), status: 'Hazırlanıyor', totalAmount: 125, products: [{ name: 'Test ürünü', quantity: 1 }] },
    { _id: cancelledId, createdAt: new Date(), status: 'İptal Edildi', totalAmount: 50 },
    { _id: new mongoose.Types.ObjectId(), createdAt: new Date(Date.now() - 86400000), status: 'Teslim Edildi', totalAmount: 100 },
  ]);
  const chatId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  await worker.chats.insertOne({ _id: chatId, user: new mongoose.Types.ObjectId(), status: 'active', isDeleted: false });
  await worker.messages.insertOne({ _id: messageId, chat: chatId, sender: 'user', senderName: 'Test müşteri', content: 'Canlı mesaj', type: 'text', createdAt: new Date() });
  await worker.schedule(state);
  assert.equal(await worker.jobs.countDocuments({ kind: 'order' }), 2);
  assert.equal(await worker.jobs.countDocuments({ kind: 'chat' }), 1);
  for (let i = 0; i < 8; i++) await worker.deliver(state);
  assert.equal(await worker.jobs.countDocuments({ kind: { $in: ['order', 'chat'] }, status: 'sent' }), 2);
  assert.equal(await worker.jobs.countDocuments({ status: 'skipped' }), 1);
  const orderJob = await worker.jobs.findOne({ _id: `order:${activeId}` });
  const chatJob = await worker.jobs.findOne({ _id: `chat:${messageId}` });
  assert.deepEqual(orderJob.deliveries.map(d => d.chatId).sort(), ['123', '456']);
  assert.deepEqual(chatJob.deliveries.map(d => d.chatId).sort(), ['123', '456']);
  assert.equal(calls.filter(call => call.method === 'sendMessage').length, 4);
  await worker.schedule(state);
  assert.equal(await worker.jobs.countDocuments({ kind: 'order' }), 2, 'reconciliation must not duplicate orders');

  await worker.jobs.updateOne({ _id: `order:${activeId}` }, { $set: { sentAt: new Date(Date.now() - 360000) } });
  await worker.schedule(state);
  assert.equal(await worker.jobs.countDocuments({ kind: 'reminder' }), 1);
  assert.ok(await worker.body(await worker.jobs.findOne({ kind: 'reminder' })));
  updates = [{ update_id: 1, callback_query: { id: 'callback', from: { id: 456, first_name: 'Ekip' }, message: { chat: { id: 456, type: 'private' }, message_id: 1 }, data: `seen:${activeId}` } }];
  await worker.receive(state);
  assert.ok((await worker.jobs.findOne({ _id: `order:${activeId}` })).acknowledgedAt);
  assert.equal((await worker.jobs.findOne({ kind: 'reminder' })).status, 'skipped');
  assert.equal((await worker.orders.findOne({ _id: activeId })).status, 'Hazırlanıyor');
  await worker.schedule(state);
  assert.equal(await worker.jobs.countDocuments({ kind: 'reminder' }), 1);

  const yesterday = localDay(new Date(Date.now() - 86400000));
  await worker.schedule({ ...state, nextSummaryDay: yesterday });
  assert.ok(await worker.jobs.findOne({ _id: `summary:${yesterday}` }));
  for (let i = 0; i < 3; i++) await worker.deliver(state);
  await worker.enqueue('test:retry', { kind: 'test' });
  assert.equal(await worker.jobs.countDocuments({ _id: { $ne: 'test:retry' }, status: 'pending' }), 0);
  await worker.fanout(state);
  assert.equal((await worker.jobs.findOne({ _id: 'test:retry' })).deliveries.length, 1);
  failure = true;
  await worker.deliver(state);
  const retry = await worker.jobs.findOne({ _id: 'test:retry' });
  assert.equal(retry.status, 'pending');
  assert.equal(retry.attempts, 1);
  assert.ok(retry.deliveries[0].dueAt.getTime() > Date.now() + 50000);
  failure = false;
  await worker.jobs.updateOne({ _id: retry._id, 'deliveries.chatId': '123' }, { $set: { 'deliveries.$.dueAt': new Date() } });
  await worker.deliver(state);
  assert.equal((await worker.jobs.findOne({ _id: retry._id })).status, 'sent');
  console.log('PASS: real MongoDB reconciliation, historical exclusion, cancellation, deduplication, reminder, acknowledgement, summary and retry. No real Telegram messages sent.');
} finally {
  for (const collection of collections.values()) await collection.drop().catch(error => { if (error.code !== 26) throw error; });
  await mongoose.disconnect();
}
