import { useEffect, useState } from 'react';
import axios from '../lib/axios';

const kinds = { order: 'Yeni sipariş', chat: 'Canlı sohbet mesajı', reminder: 'Hatırlatma', summary: 'Günlük özet', today: 'Bugünkü özet', waiting: 'Aktif siparişler', legacyWaiting: 'Eski açık kayıtlar', health: 'Durum', test: 'Test', welcome: 'Abonelik', unsubscribed: 'Abonelik durduruldu' };
const statuses = { pending: 'Sırada', sent: 'Gönderildi', failed: 'Gönderilemedi', skipped: 'Gönderilmedi (artık gerekli değil)' };

export default function TelegramNotificationsCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await axios.get('/telegram/status');
        if (active) { setData(response.data); setError(''); }
      } catch { if (active) setError('Bildirim durumu alınamadı.'); }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  const sendTest = async () => {
    setSending(true);
    try {
      const response = await axios.post('/telegram/test');
      setNotice(response.data.message);
    } catch (failure) { setNotice(failure.response?.data?.message || 'Test gönderilemedi.'); }
    finally { setSending(false); }
  };
  return (
    <section className="studio-panel" style={{ marginBottom: 24 }} aria-label="Telegram bildirimleri">
      <div className="studio-panel-heading" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Telegram sipariş ve mesaj bildirimleri</h2>
          <p>{error || (!data ? 'Kontrol ediliyor…' : !data.paired ? 'Botta Başlat’a basarak bildirimlere abone olun.' : data.online ? `Aktif · ${data.subscriberCount} aboneye sipariş ve canlı sohbet bildirimi gönderiliyor` : 'Servise ulaşılamıyor · Bildirimler kuyrukta korunur')}</p>
        </div>
        <button className="studio-primary" disabled={!data?.paired || !data?.online || sending} onClick={sendTest}>
          {sending ? 'Sıraya alınıyor…' : 'Test bildirimi gönder'}
        </button>
      </div>
      <div style={{ padding: '0 24px 20px', fontSize: 13 }}>
        <p>Bekleyen: {data?.counts?.pending || 0} · Gönderilen: {data?.counts?.sent || 0} · Hatırlatma: 5 dakika · Günlük özet: 00.05</p>
        <p><a href="https://t.me/benimmarketim_siparis_bot" target="_blank" rel="noreferrer">Botu aç ve Başlat’a bas</a> · Abonelikten çıkmak için /stop</p>
        {(notice || data?.lastError) && <p role="status">{notice || data.lastError}</p>}
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer' }}>Son bildirimler</summary>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data?.recent?.map(job => <li key={job._id} style={{ padding: '8px 0', borderBottom: '1px solid #e8ece5' }}>
              {kinds[job.kind] || 'Bildirim'} · {job.acknowledgedAt ? `Görüldü (${job.acknowledgedBy})` : statuses[job.status] || job.status}
              {job.lastError && ` · Tekrar denenecek (${job.lastError})`}
              {' · '}{new Date(job.sentAt || job.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
            </li>)}
            {data?.recent?.length === 0 && <li>Henüz bildirim yok.</li>}
          </ul>
        </details>
      </div>
    </section>
  );
}
