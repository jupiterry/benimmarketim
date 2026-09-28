import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { canPair, isOwner, privateChatId, chatMessageText, CHAT_PANEL_URL, CURRENT_ACTIVITY_START, orderText, orderButtons, summaryText, localDay, dayRange, nextDay, retryDelay, PANEL_URL } from '../services/telegram.helpers.js';

// Separate process: an unavailable Telegram service never blocks checkout.
export class TelegramWorker {
  constructor(db, api, pairingCode) {
    this.states = db.collection('telegram_state');
    this.jobs = db.collection('telegram_jobs');
    this.orders = db.collection('orders');
    this.messages = db.collection('messages');
    this.chats = db.collection('chats');
    this.subscribers = db.collection('telegram_subscribers');
    this.api = api;
    this.pairingCode = pairingCode;
    this.owner = randomUUID();
    this.lastScan = 0;
  }

  async initialize() {
    await this.jobs.createIndex({ status: 1, dueAt: 1 });
    await this.jobs.createIndex({ orderId: 1, kind: 1 });
    await this.orders.createIndex({ createdAt: 1 });
    await this.messages.createIndex({ sender: 1, createdAt: 1 });
    await this.subscribers.createIndex({ active: 1, subscribedAt: 1 });
    await this.states.updateOne({ _id: 'main' }, { $setOnInsert: { startedAt: new Date(), offset: 0 } }, { upsert: true });
    await this.states.updateOne({ _id: 'main', chatStartedAt: { $exists: false } }, { $set: { chatStartedAt: new Date() } });
    const state = await this.states.findOne({ _id: 'main' });
    // Preserve the existing destination without broadcasting old events again.
    if (state.chatId) await this.subscribers.updateOne({ _id: state.chatId }, { $setOnInsert: {
      active: true, userId: state.userId, subscribedAt: state.startedAt,
    } }, { upsert: true });
  }

  async enqueue(id, fields) {
    await this.jobs.updateOne({ _id: id }, { $setOnInsert: { status: 'pending', dueAt: new Date(), createdAt: new Date(), attempts: 0, ...fields } }, { upsert: true });
  }

  async receive(state) {
    const updates = await this.api('getUpdates', { offset: state.offset || 0, timeout: 0, limit: 30, allowed_updates: ['message', 'callback_query'] });
    for (const update of updates) {
      const message = update.message;
      const chatId = privateChatId(message);
      const command = (message?.text || '').trim().split(/[ @]/)[0].toLocaleLowerCase('tr-TR');
      if (canPair(state, message, this.pairingCode)) {
        await this.states.updateOne({ _id: 'main', chatId: { $exists: false } }, { $set: {
          chatId: String(message.chat.id), userId: String(message.from.id), pairedAt: new Date(),
        } });
        state = await this.states.findOne({ _id: 'main' });
      }
      if (chatId && ['/start', 'başlat', 'baslat'].includes(command)) {
        const existing = await this.subscribers.findOne({ _id: chatId });
        await this.subscribers.updateOne({ _id: chatId }, { $set: { active: true, userId: String(message.from.id),
          subscribedAt: existing?.active ? existing.subscribedAt : new Date(), updatedAt: new Date(),
        } }, { upsert: true });
        await this.enqueue(`command:${update.update_id}`, { kind: 'welcome', targetChatId: chatId });
      } else if (chatId && ['/stop', '/durdur'].includes(command)) {
        await this.subscribers.updateOne({ _id: chatId }, { $set: { active: false, updatedAt: new Date() } });
        await this.enqueue(`command:${update.update_id}`, { kind: 'unsubscribed', targetChatId: chatId });
      } else if (chatId && await this.subscribers.findOne({ _id: chatId, active: true })) {
        const publicKind = { '/test': 'test', '/yardim': 'welcome' }[command];
        const ownerKind = isOwner(state, message.chat, message.from) && { '/bugun': 'today', '/bekleyen': 'waiting', '/eskibekleyen': 'legacyWaiting', '/durum': 'health' }[command];
        if (publicKind || ownerKind) await this.enqueue(`command:${update.update_id}`, { kind: publicKind || ownerKind, targetChatId: chatId });
      }
      const callback = update.callback_query;
      const callbackChatId = privateChatId({ chat: callback?.message?.chat, from: callback?.from });
      if (callbackChatId && await this.subscribers.findOne({ _id: callbackChatId, active: true })) {
        const match = /^seen:([a-f0-9]{24})$/.exec(callback.data || '');
        if (match) {
          const id = `order:${match[1]}`;
          const job = await this.jobs.findOne({ _id: id });
          const received = job?.deliveries?.some(d => d.chatId === callbackChatId && d.status === 'sent') ||
            (job?.status === 'sent' && !job.deliveries && callbackChatId === state.chatId);
          if (received) {
            await this.jobs.updateOne({ _id: id, acknowledgedAt: { $exists: false } }, { $set: { acknowledgedAt: new Date(), acknowledgedBy: String(callback.from.first_name || 'Yönetici').slice(0, 100) } });
            // Seen is an acknowledgement only; it never changes order status.
            await this.jobs.updateOne({ _id: `reminder:${match[1]}`, status: 'pending' }, { $set: { status: 'skipped' } });
            await this.api('answerCallbackQuery', { callback_query_id: callback.id, text: 'Görüldü olarak kaydedildi. Sipariş durumu değişmedi.' }).catch(() => {});
            await this.api('editMessageReplyMarkup', { chat_id: callbackChatId, message_id: callback.message.message_id, reply_markup: orderButtons(match[1], true) }).catch(() => {});
          }
        }
      }
      await this.states.updateOne({ _id: 'main' }, { $set: { offset: update.update_id + 1 } });
    }
    return state;
  }

  async schedule(state) {
    // Reconcile saved orders against the durable outbox. No fragile in-memory hook,
    // so restarts and failures between order creation and notification cannot lose orders.
    const missing = await this.orders.aggregate([
      { $match: { createdAt: { $gte: state.startedAt } } },
      { $lookup: { from: this.jobs.collectionName, let: { key: { $concat: ['order:', { $toString: '$_id' }] } }, pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$key'] } } }, { $project: { _id: 1 } }], as: 'notification' } },
      { $match: { 'notification.0': { $exists: false } } },
      { $sort: { createdAt: 1 } }, { $limit: 100 }, { $project: { _id: 1, createdAt: 1 } },
    ]).toArray();
    for (const order of missing) await this.enqueue(`order:${order._id}`, { kind: 'order', orderId: order._id, audienceAt: order.createdAt });

    const newMessages = await this.messages.aggregate([
      { $match: { sender: 'user', type: { $ne: 'system' }, createdAt: { $gte: state.chatStartedAt || state.startedAt } } },
      { $lookup: { from: this.jobs.collectionName, let: { key: { $concat: ['chat:', { $toString: '$_id' }] } }, pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$key'] } } }, { $project: { _id: 1 } }], as: 'notification' } },
      { $match: { 'notification.0': { $exists: false } } },
      { $sort: { createdAt: 1 } }, { $limit: 100 }, { $project: { _id: 1, createdAt: 1 } },
    ]).toArray();
    for (const message of newMessages) await this.enqueue(`chat:${message._id}`, { kind: 'chat', sourceMessageId: message._id, audienceAt: message.createdAt });

    const unseen = await this.jobs.find({ kind: 'order', acknowledgedAt: { $exists: false }, reminderQueuedAt: { $exists: false }, sentAt: { $lte: new Date(Date.now() - 300000) } }).limit(100).toArray();
    for (const job of unseen) {
      await this.enqueue(`reminder:${job.orderId}`, { kind: 'reminder', orderId: job.orderId, audienceAt: job.audienceAt || job.createdAt });
      await this.jobs.updateOne({ _id: job._id }, { $set: { reminderQueuedAt: new Date() } });
    }

    // At 00:05 Turkey time, report the full previous calendar day (including 23:59).
    const day = state.nextSummaryDay || localDay(state.startedAt);
    if (Date.now() >= dayRange(day).end.getTime() + 300000) {
      await this.enqueue(`summary:${day}`, { kind: 'summary', day, targetChatId: state.chatId });
      await this.states.updateOne({ _id: 'main' }, { $set: { nextSummaryDay: nextDay(day) } });
    }
  }

  async body(job) {
    if (job.kind === 'chat') {
      const message = await this.messages.findOne({ _id: job.sourceMessageId, sender: 'user', type: { $ne: 'system' } });
      if (!message) return null;
      const chat = await this.chats.findOne({ _id: message.chat });
      if (!chat || chat.isDeleted) return null;
      return { text: chatMessageText(message), reply_markup: { inline_keyboard: [[{ text: '💬 Canlı sohbeti aç', url: CHAT_PANEL_URL }]] } };
    }
    if (job.kind === 'unsubscribed') return { text: '🔕 Sipariş ve canlı sohbet bildirimleri durduruldu. Yeniden almak için /start yazın.' };
    if (job.kind === 'order' || job.kind === 'reminder') {
      const order = await this.orders.findOne({ _id: job.orderId });
      if (!order || order.status === 'İptal Edildi') return null;
      if (job.kind === 'reminder') {
        const original = await this.jobs.findOne({ _id: `order:${job.orderId}` });
        if (original?.acknowledgedAt || order.status !== 'Hazırlanıyor') return null;
      }
      return { text: orderText(order, job.kind === 'reminder'), reply_markup: orderButtons(String(order._id), Boolean(job.acknowledgedAt)) };
    }
    if (job.kind === 'summary' || job.kind === 'today') {
      const day = job.day || localDay();
      const { start, end } = dayRange(day);
      const orders = await this.orders.find({ createdAt: { $gte: start, $lt: end } }, { projection: { totalAmount: 1, status: 1 } }).toArray();
      return { text: summaryText(day, orders) };
    }
    if (job.kind === 'waiting' || job.kind === 'legacyWaiting') {
      const query = { status: { $in: ['Hazırlanıyor', 'Yolda'] }, createdAt: job.kind === 'waiting'
        ? { $gte: CURRENT_ACTIVITY_START } : { $lt: CURRENT_ACTIVITY_START } };
      const [count, orders] = await Promise.all([this.orders.countDocuments(query), this.orders.find(query).sort({ createdAt: -1 }).limit(15).toArray()]);
      const heading = job.kind === 'waiting' ? `📦 Yeni dönemde ${count} aktif sipariş` : `🗃 Önceki dönemlerden ${count} açık durumlu kayıt`;
      return { text: [heading, ...orders.map(o => `#${String(o._id).slice(-8).toUpperCase()} · ${o.status} · ${new Date(o.createdAt).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}`),
        ...(count > 15 ? ['Diğer kayıtlar panelde.'] : []), ...(count === 0 ? ['Kayıt bulunmuyor.'] : [])].join('\n') };
    }
    if (job.kind === 'health') {
      const pending = await this.jobs.countDocuments({ status: 'pending' });
      const retrying = await this.jobs.countDocuments({ status: 'pending', attempts: { $gt: 0 } });
      return { text: `🟢 Bildirim servisi çalışıyor.\nKuyruk: ${Math.max(0, pending - 1)}\nTekrar denenen: ${retrying}\nHatırlatma: 5 dakika sonra, bir kez\nGünlük özet: 00.05 (Türkiye)` };
    }
    if (job.kind === 'test') return { text: '✅ Test bildirimi başarıyla gönderildi. Gerçek sipariş oluşturulmadı.' };
    return { text: '✅ Sipariş ve canlı sohbet bildirimlerine abone oldunuz.\n\nBundan sonraki yeni siparişler ve müşterilerden gelen canlı sohbet mesajları bu hesaba gönderilir. Siparişte “Gördüm” düğmesi ekip adına onaylar; sipariş durumunu değiştirmez.\n\n/test — Test mesajı\n/stop — Bildirimleri durdur\n/start — Yeniden abone ol\n/yardim — Bu açıklama\n\nYönetici hesabı ayrıca /bugun, /bekleyen, /eskibekleyen ve /durum komutlarını kullanabilir; günlük özet yöneticiye gider.' };
  }

  async fanout(state) {
    const events = await this.jobs.find({ status: 'pending', deliveries: { $exists: false } }).sort({ createdAt: 1 }).limit(30).toArray();
    for (const event of events) {
      const broadcast = ['order', 'reminder', 'chat'].includes(event.kind);
      const recipients = broadcast
        ? await this.subscribers.find({ active: true, subscribedAt: { $lte: event.audienceAt || event.createdAt } }).toArray()
        : [{ _id: event.targetChatId || state.chatId }].filter(s => s._id);
      const deliveries = recipients.map(subscriber => ({ chatId: subscriber._id, status: 'pending', attempts: 0, dueAt: event.dueAt || new Date() }));
      await this.jobs.updateOne({ _id: event._id, deliveries: { $exists: false } }, { $set: { deliveries,
        ...(deliveries.length ? {} : { status: 'skipped' }),
      } });
    }
  }

  async completeEvent(id) {
    const event = await this.jobs.findOne({ _id: id });
    if (!event?.deliveries || event.deliveries.some(d => d.status === 'pending')) return;
    const status = event.deliveries.some(d => d.status === 'sent') ? 'sent'
      : event.deliveries.some(d => d.status === 'failed') ? 'failed' : 'skipped';
    await this.jobs.updateOne({ _id: id, status: 'pending' }, { $set: { status } });
  }

  async deliver(state) {
    if (state.rateLimitedUntil && state.rateLimitedUntil > new Date()) return;
    await this.fanout(state);
    const job = await this.jobs.findOne({ status: 'pending', deliveries: { $elemMatch: { status: 'pending', dueAt: { $lte: new Date() } } } }, { sort: { createdAt: 1 } });
    if (!job) return;
    const delivery = job.deliveries.find(d => d.status === 'pending' && d.dueAt <= new Date());
    const target = { _id: job._id, 'deliveries.chatId': delivery.chatId };
    const subscriber = await this.subscribers.findOne({ _id: delivery.chatId, active: true });
    const broadcast = ['order', 'reminder', 'chat'].includes(job.kind);
    const inAudience = subscriber && (!broadcast || subscriber.subscribedAt <= (job.audienceAt || job.createdAt));
    if (!inAudience && job.kind !== 'unsubscribed') {
      await this.jobs.updateOne(target, { $set: { 'deliveries.$.status': 'skipped' } });
      await this.completeEvent(job._id);
      return;
    }
    try {
      const body = await this.body(job);
      if (!body) {
        await this.jobs.updateOne({ _id: job._id }, { $set: { status: 'skipped' } });
        return;
      }
      const sent = await this.api('sendMessage', { chat_id: delivery.chatId, protect_content: true, link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [[{ text: '📋 Panelde aç', url: PANEL_URL }]] }, ...body });
      const sentAt = new Date();
      await this.jobs.updateOne(target, { $set: { 'deliveries.$.status': 'sent', 'deliveries.$.messageId': sent.message_id,
        'deliveries.$.sentAt': sentAt, 'deliveries.$.lastError': null, lastError: null },
        $min: { sentAt }, $inc: { 'deliveries.$.attempts': 1, attempts: 1 } });
      await this.states.updateOne({ _id: 'main' }, { $set: { lastSentAt: sentAt, lastError: null } });
    } catch (error) {
      const delay = retryDelay(delivery.attempts + 1, error.retryAfter);
      const safeError = error.telegramCode ? `Telegram ${error.telegramCode}` : 'Bağlantı veya kayıt hatası';
      const permanent = error.telegramCode === 403 || error.telegramCode === 400;
      await this.jobs.updateOne(target, { $set: { 'deliveries.$.dueAt': new Date(Date.now() + delay),
        'deliveries.$.lastError': safeError, lastError: safeError,
        ...(permanent ? { 'deliveries.$.status': error.telegramCode === 403 ? 'skipped' : 'failed' } : {}),
      }, $inc: { 'deliveries.$.attempts': 1, attempts: 1 } });
      if (error.telegramCode === 403) await this.subscribers.updateOne({ _id: delivery.chatId }, { $set: { active: false, updatedAt: new Date() } });
      await this.states.updateOne({ _id: 'main' }, { $set: { lastError: safeError, ...(error.telegramCode === 429 ? { rateLimitedUntil: new Date(Date.now() + delay) } : {}) } });
    }
    await this.completeEvent(job._id);
  }

  async tick() {
    // Single active worker across accidental duplicate processes; short network timeouts
    // and lease renewal before sending keep the outbox serialized.
    const lease = await this.states.updateOne({ _id: 'main', $or: [{ leaseOwner: this.owner }, { leaseUntil: { $lt: new Date() } }, { leaseUntil: { $exists: false } }] }, { $set: { leaseOwner: this.owner, leaseUntil: new Date(Date.now() + 120000), heartbeatAt: new Date() } });
    if (!lease.matchedCount) return;
    let state = await this.states.findOne({ _id: 'main' });
    state = await this.receive(state);
    if (Date.now() - this.lastScan > 10000) {
      await this.schedule(state);
      this.lastScan = Date.now();
    }
    const renewed = await this.states.updateOne({ _id: 'main', leaseOwner: this.owner, leaseUntil: { $gt: new Date() } }, { $set: { leaseUntil: new Date(Date.now() + 120000) } });
    if (renewed.matchedCount) await this.deliver(state);
  }
}

export async function startTelegramWorker() {
  dotenv.config();
  dotenv.config({ path: '.telegram.env' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !process.env.MONGO_URI) throw new Error('Missing configuration');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, socketTimeoutMS: 15000 });
  const api = async (method, payload) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!data.ok) {
      const error = new Error('Telegram request failed');
      error.telegramCode = data.error_code;
      error.retryAfter = data.parameters?.retry_after;
      throw error;
    }
    return data.result;
  };
  const worker = new TelegramWorker(mongoose.connection.db, api, process.env.TELEGRAM_PAIRING_CODE);
  await api('getMe', {});
  await worker.initialize();
  await worker.states.updateOne({ _id: 'main' }, { $set: { lastError: null }, $unset: { rateLimitedUntil: '' } });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; });
  console.log('Telegram worker ready');
  while (!stopping) {
    try { await worker.tick(); }
    catch (error) {
      const lastError = error.telegramCode ? `Telegram ${error.telegramCode}` : 'Bildirim servisi bağlantı hatası';
      console.error(lastError);
      await worker.states.updateOne({ _id: 'main' }, { $set: { lastError } }).catch(() => {});
    }
    await sleep(3100);
  }
  await worker.states.updateOne({ _id: 'main', leaseOwner: worker.owner }, { $unset: { leaseOwner: '', leaseUntil: '' } });
  await mongoose.disconnect();
}
