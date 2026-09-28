import test from 'node:test';
import assert from 'node:assert/strict';
import { answerUserMessage } from '../services/ai/assistant.service.js';
import { classifyMessage, isServiceQuestion } from '../services/ai/policies.js';
import Chat from '../models/chat.model.js';
import Message from '../models/message.model.js';
import Settings from '../models/settings.model.js';
import AiKnowledge from '../models/aiKnowledge.model.js';
import AiRequestLog from '../models/aiRequestLog.model.js';
import SupportRequest from '../models/supportRequest.model.js';
import User from '../models/user.model.js';
import { detectToolIntent } from '../services/ai/tools.js';

const chat = { _id: '507f191e810c19729de860eb', user: '507f191e810c19729de860ea', mode: 'AI', status: 'active' };
const chain = (rows) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => rows });

test('emoji and punctuation do not change explicit support intent', () => {
  for (const query of ['👨‍💼 Canlı Destek', '🧑‍💼 Canlı Destek!', 'canli destek', 'Personelle görüşmek istiyorum', 'Yetkiliye bağlan.']) assert.equal(classifyMessage(query), 'human_request', query);
  assert.equal(classifyMessage('Canlı destek istemiyorum'), 'answer');
  for (const query of ['🖨️ Fotokopi', 'Fotokopi var mı?', 'Fotokopi çekiyor musunuz', 'Fotokopi kaç TL?', 'Çıktı alıyor musunuz?']) assert.equal(isServiceQuestion(query), true, query);
  assert.equal(isServiceQuestion('Red Bull var mı?'), false);
  for (const query of ['Minimum sipariş kaç TL?', 'En az kaç TL sipariş verebilirim?', 'Minimum sepet tutarı nedir?']) assert.equal(detectToolIntent(query).name, 'getStoreSettings');
});

test('support quick action creates request and enters waiting state without calling AI', async (t) => {
  let requested = false;
  t.mock.method(Chat, 'findOneAndUpdate', async (filter, update) => { assert.equal(update.$set.mode, 'WAITING_FOR_AGENT'); return chat; });
  t.mock.method(Chat, 'updateOne', async () => ({}));
  t.mock.method(SupportRequest, 'findOneAndUpdate', async (filter, update) => { requested = true; assert.equal(update.$setOnInsert.user, chat.user); return { _id: 'r1' }; });
  t.mock.method(User, 'findById', () => chain({ name: 'Test Kullanıcı' }));
  t.mock.method(Message, 'create', async (data) => ({ ...data, _id: 'm1' }));
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Human request must not call provider'); });
  await answerUserMessage({ chat, query: '👨‍💼 Canlı Destek' });
  assert.equal(requested, true);
});

test('photocopy quick action uses knowledge and never exposes product tools to provider', async (t) => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-only';
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  t.mock.method(Settings, 'getSettings', async () => ({ ai: { enabled: true, provider: 'openrouter', model: 'test' } }));
  t.mock.method(Message, 'find', () => chain([]));
  t.mock.method(AiKnowledge, 'find', () => chain([{ title: 'Fotokopi Hizmeti', category: 'Fotokopi', content: 'Fotokopi hizmetimiz mevcuttur.', keywords: ['fotokopi'], priority: 80 }]));
  t.mock.method(AiRequestLog, 'create', async () => ({}));
  t.mock.method(Chat, 'updateOne', async () => ({}));
  t.mock.method(Message, 'create', async (data) => ({ ...data, _id: 'm1' }));
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    const payload = JSON.parse(options.body);
    assert.equal(payload.tools, undefined);
    assert.match(payload.messages[0].content, /Fotokopi hizmetimiz mevcuttur/);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Evet, fotokopi hizmetimiz mevcut.' } }] }) };
  });
  const result = await answerUserMessage({ chat, query: '🖨️ Fotokopi' });
  assert.match(result.content, /fotokopi hizmetimiz mevcut/);
  assert.equal(calls, 1);
});
