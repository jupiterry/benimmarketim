import test from 'node:test';
import assert from 'node:assert/strict';
import { canPair, isOwner, privateChatId, chatMessageText, CURRENT_ACTIVITY_START, orderText, orderButtons, summaryText, localDay, dayRange, nextDay, retryDelay } from '../services/telegram.helpers.js';
import { TelegramWorker } from '../workers/telegram.worker.js';

const state = { chatId: '123', userId: '123' };
const chat = { id: 123, type: 'private' };
const from = { id: 123, first_name: 'Yönetici' };
const id = '507f1f77bcf86cd799439011';

test('pairing requires unexpired secret in a private chat and cannot replace the owner', () => {
  const unpaired = { startedAt: new Date() };
  const message = { chat, from, text: '/start secret' };
  assert.equal(canPair(unpaired, message, 'secret'), true);
  assert.equal(canPair(unpaired, message, 'wrong'), false);
  assert.equal(canPair({ ...unpaired, ...state }, message, 'secret'), false);
  assert.equal(canPair(unpaired, { ...message, chat: { ...chat, type: 'group' } }, 'secret'), false);
  assert.equal(canPair(unpaired, { ...message, from: { id: 456 } }, 'secret'), false);
  assert.equal(canPair({ startedAt: new Date(0) }, message, 'secret'), false);
  assert.equal(isOwner(state, chat, from), true);
  assert.equal(isOwner(state, chat, { id: 456 }), false);
  assert.equal(isOwner(state, { ...chat, type: 'group' }, from), false);
});

test('daily totals include all Turkey calendar-day sales except cancellations', () => {
  assert.equal(CURRENT_ACTIVITY_START.toISOString(), '2026-09-05T21:00:00.000Z');
  assert.equal(localDay(new Date('2026-09-20T21:00:00Z')), '2026-09-21');
  assert.equal(dayRange('2026-09-20').start.toISOString(), '2026-09-19T21:00:00.000Z');
  assert.equal(dayRange('2026-09-20').end.toISOString(), '2026-09-20T21:00:00.000Z');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  const text = summaryText('2026-09-20', [{ totalAmount: 100, status: 'Teslim Edildi' }, { totalAmount: 50, status: 'Hazırlanıyor' }, { totalAmount: 900, status: 'İptal Edildi' }]);
  assert.match(text, /150,00/);
  assert.match(text, /Sipariş: 2/);
  assert.match(text, /İptal: 1/);
});

test('only real private users can subscribe and chat notifications omit contact data', () => {
  assert.equal(privateChatId({ chat, from }), '123');
  assert.equal(privateChatId({ chat: { id: -100123, type: 'group' }, from }), null);
  assert.equal(privateChatId({ chat, from: { ...from, id: 456 } }), null);
  assert.equal(privateChatId({ chat, from: { ...from, is_bot: true } }), null);
  const text = chatMessageText({ senderName: 'Ayşe', content: 'Siparişim nerede?', phone: 'PRIVATE_PHONE', createdAt: new Date() });
  assert.match(text, /Ayşe/);
  assert.match(text, /Siparişim nerede/);
  assert.ok(!text.includes('PRIVATE_PHONE'));
});

test('order text stays within Telegram limits and omits customer contact fields', () => {
  const text = orderText({ _id: id, createdAt: new Date(), phone: 'PRIVATE_PHONE', user: { email: 'PRIVATE_EMAIL' }, totalAmount: 150, products: Array.from({ length: 100 }, () => ({ name: '<b>' + 'x'.repeat(500), quantity: 2 })), note: 'n'.repeat(5000) });
  assert.ok(text.length < 4096);
  assert.ok(!text.includes('PRIVATE_PHONE') && !text.includes('PRIVATE_EMAIL'));
  assert.ok(text.includes('Diğer ürünler panelde'));
  assert.equal(orderButtons(id).inline_keyboard[0][0].callback_data, `seen:${id}`);
  assert.equal(orderButtons(id, true).inline_keyboard.length, 1);
});

function workerFixture(api = async () => ({ message_id: 77 })) {
  const writes = [];
  const collections = Object.fromEntries(['telegram_state', 'telegram_jobs', 'orders', 'messages', 'chats', 'telegram_subscribers'].map(name => [name, {
    updateOne: async (query, update, options) => { writes.push({ name, query, update, options }); return { matchedCount: 1 }; },
    findOne: async () => name === 'telegram_subscribers' ? { _id: '123', active: true, subscribedAt: new Date(0) } : null,
    find: () => ({ sort() { return this; }, limit() { return this; }, toArray: async () => [] }),
  }]));
  return { worker: new TelegramWorker({ collection: name => collections[name] }, api, 'secret'), collections, writes };
}

test('delivery records success durably without writing orders', async () => {
  const sent = [];
  const { worker, collections, writes } = workerFixture(async (method, payload) => { sent.push({ method, payload }); return { message_id: 77 }; });
  collections.telegram_jobs.findOne = async () => ({ _id: 'test:1', kind: 'test', attempts: 0, deliveries: [{ chatId: '123', status: 'pending', attempts: 0, dueAt: new Date(0) }] });
  await worker.deliver(state);
  assert.equal(sent[0].payload.chat_id, '123');
  assert.equal(sent[0].payload.protect_content, true);
  assert.equal(writes[0].update.$set['deliveries.$.status'], 'sent');
  assert.equal(writes[0].update.$set['deliveries.$.messageId'], 77);
  assert.ok(writes.every(write => write.name !== 'orders'));
});

test('Telegram failure leaves a durable retry and honors retry_after', async () => {
  const { worker, collections, writes } = workerFixture(async () => { throw Object.assign(new Error('secret URL'), { telegramCode: 429, retryAfter: 90 }); });
  collections.telegram_jobs.findOne = async () => ({ _id: 'test:1', kind: 'test', attempts: 0, deliveries: [{ chatId: '123', status: 'pending', attempts: 0, dueAt: new Date(0) }] });
  const before = Date.now();
  await worker.deliver(state);
  assert.ok(writes[0].update.$set['deliveries.$.dueAt'].getTime() >= before + 90000);
  assert.equal(writes[0].update.$set.lastError, 'Telegram 429');
  assert.equal(writes[0].update.$set.status, undefined);
  assert.equal(writes[0].update.$inc.attempts, 1);
  assert.ok(!JSON.stringify(writes).includes('secret URL'));
  assert.ok(retryDelay(999) <= 3600000);
});

test('cancelled orders and seen or completed reminders are skipped', async () => {
  const { worker, collections } = workerFixture();
  collections.orders.findOne = async () => ({ status: 'İptal Edildi' });
  assert.equal(await worker.body({ kind: 'order', orderId: id }), null);
  collections.orders.findOne = async () => ({ status: 'Yolda' });
  assert.equal(await worker.body({ kind: 'reminder', orderId: id }), null);
  collections.orders.findOne = async () => ({ status: 'Hazırlanıyor' });
  collections.telegram_jobs.findOne = async () => ({ acknowledgedAt: new Date() });
  assert.equal(await worker.body({ kind: 'reminder', orderId: id }), null);
});

test('untrusted commands and callbacks cannot read sales or acknowledge orders', async () => {
  const updates = [{ update_id: 1, message: { chat, from: { id: 456 }, text: '/bugun' } },
    { update_id: 2, callback_query: { id: 'c', from: { id: 456 }, message: { chat }, data: `seen:${id}` } }];
  const { worker, writes } = workerFixture(async () => updates);
  await worker.receive(state);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(write => write.name === 'telegram_state' && write.update.$set.offset));
});

test('owner acknowledgement records seen and cancels reminder but never changes order status', async () => {
  const updates = [{ update_id: 1, callback_query: { id: 'c', from, message: { chat, message_id: 77 }, data: `seen:${id}` } }];
  const { worker, collections, writes } = workerFixture(async method => method === 'getUpdates' ? updates : true);
  collections.telegram_jobs.findOne = async () => ({ status: 'sent' });
  await worker.receive(state);
  assert.ok(writes.some(write => write.update.$set.acknowledgedAt));
  assert.ok(writes.some(write => write.query._id === `reminder:${id}` && write.update.$set.status === 'skipped'));
  assert.ok(writes.every(write => write.name !== 'orders'));
});

test('outbox uses unique event IDs and insert-only writes for replay safety', async () => {
  const { worker, writes } = workerFixture();
  await worker.enqueue(`order:${id}`, { kind: 'order', orderId: id });
  await worker.enqueue(`order:${id}`, { kind: 'order', orderId: id });
  assert.equal(writes[0].query._id, writes[1].query._id);
  assert.equal(writes[0].options.upsert, true);
  assert.equal(writes[0].update.$set, undefined);
});
