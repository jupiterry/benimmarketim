export const PANEL_URL = 'https://devrekbenimmarketim.com/secret-dashboard?tab=orders';
export const CHAT_PANEL_URL = 'https://devrekbenimmarketim.com/secret-dashboard?tab=chat';
export const CURRENT_ACTIVITY_START = new Date('2026-09-06T00:00:00+03:00');
export function privateChatId(message) {
  return message?.chat?.type === 'private' && Number.isSafeInteger(message.chat.id) && message.chat.id > 0 && message.from?.id === message.chat.id && !message.from?.is_bot
    ? String(message.chat.id) : null;
}
export function chatMessageText(message) {
  const content = message.type === 'image' ? '📷 Fotoğraf gönderdi.' : message.type === 'file' ? '📎 Dosya gönderdi.' : String(message.content || '').slice(0, 800);
  return [`💬 Canlı sohbette yeni mesaj`, `Gönderen: ${String(message.senderName || 'Müşteri').slice(0, 100)}`, content,
    `Saat: ${new Date(message.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`, 'Yanıtlamak için yönetim panelini açın.'].join('\n\n');
}
export const currency = (value) => Number(value || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
export const localDay = (date = new Date()) => new Date(date.getTime() + 10800000).toISOString().slice(0, 10);
export function dayRange(day) {
  const start = new Date(`${day}T00:00:00+03:00`);
  return { start, end: new Date(start.getTime() + 86400000) };
}
export const nextDay = (day) => localDay(dayRange(day).end);
export const retryDelay = (attempt, retryAfter = 0) => Math.max(Number(retryAfter) * 1000, Math.min(3600000, 5000 * 2 ** Math.min(attempt, 10)));

export function isOwner(state, chat, from) {
  return Boolean(state?.chatId && chat?.type === 'private' && String(chat.id) === state.chatId && String(from?.id) === state.userId);
}

export function canPair(state, message, code, now = new Date()) {
  return Boolean(!state.chatId && code && message?.chat?.type === 'private' && !message.from?.is_bot &&
    message.from?.id === message.chat.id && message.text === `/start ${code}` &&
    now.getTime() - new Date(state.startedAt).getTime() < 86400000);
}

export function orderText(order, reminder = false) {
  const products = (order.products || []).slice(0, 18).map(p => `• ${Number(p.quantity) || 0} × ${String(p.name || 'Ürün').slice(0, 100)}`);
  if ((order.products || []).length > 18) products.push('Diğer ürünler panelde.');
  return [reminder ? '⏰ Sipariş henüz görülmedi' : '🛍 Yeni sipariş',
    `Sipariş: #${String(order._id).slice(-8).toUpperCase()}`,
    `Saat: ${new Date(order.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
    `Teslimat: ${String(order.deliveryPointName || (order.deliveryPoint === 'girlsDorm' ? 'Kız yurdu' : order.deliveryPoint === 'boysDorm' ? 'Erkek yurdu' : order.city) || 'Panelde').slice(0, 180)}`,
    '', ...products, '', `Toplam: ${currency(order.totalAmount)}`,
    order.note ? `Not: ${String(order.note).slice(0, 400)}` : '',
    '\nMüşteri iletişim bilgileri yönetim panelinde.'].filter(Boolean).join('\n').slice(0, 3800);
}

export function orderButtons(id, seen = false) {
  return { inline_keyboard: [
    ...(seen ? [] : [[{ text: '✅ Gördüm', callback_data: `seen:${id}` }]]),
    [{ text: '📋 Panelde aç', url: PANEL_URL }],
  ] };
}

export function summaryText(day, orders) {
  const valid = orders.filter(o => o.status !== 'İptal Edildi');
  const total = valid.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  return [`📊 ${day.split('-').reverse().join('.')} satış özeti`,
    `Ciro: ${currency(total)}`, `Sipariş: ${valid.length}`,
    `Ortalama sepet: ${currency(valid.length ? total / valid.length : 0)}`,
    `Hazırlanıyor: ${valid.filter(o => o.status === 'Hazırlanıyor').length}`,
    `Yolda: ${valid.filter(o => o.status === 'Yolda').length}`,
    `Teslim edildi: ${valid.filter(o => o.status === 'Teslim Edildi').length}`,
    `İptal: ${orders.length - valid.length}`, 'Ciroda iptal edilen siparişler hariçtir.'].join('\n');
}
