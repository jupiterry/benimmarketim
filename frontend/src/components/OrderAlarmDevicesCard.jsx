import { useEffect, useState } from 'react';
import axios from '../lib/axios';

// Sipariş alarmı Android uygulaması (siparis-alarm-android/) ile eşlenen telefonlar.
// Telefon her ~25 sn'de sunucuya bağlanır; "son görülme" en çok dakikada bir yazılır.
const ONLINE_MS = 3 * 60 * 1000;
const time = (value) => new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function OrderAlarmDevicesCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      const response = await axios.get('/order-alarm/status');
      setData(response.data);
      setError('');
    } catch {
      setError('Telefon listesi alınamadı.');
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const remove = async (id) => {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
    setBusy(id);
    try {
      await axios.delete(`/order-alarm/devices/${encodeURIComponent(id)}`);
      setConfirming('');
      await load();
    } catch (failure) {
      setError(failure.response?.data?.message || 'Telefon kaldırılamadı.');
    } finally {
      setBusy('');
    }
  };

  const devices = (data?.devices || []).filter((device) => !device.revokedAt);
  const now = Date.now();
  const online = devices.filter((device) => device.lastSeenAt && now - new Date(device.lastSeenAt).getTime() < ONLINE_MS).length;

  return (
    <section className="ui-panel dash-sidecard" aria-label="Sipariş alarmı telefonları">
      <div className="ui-panel-head">
        <div>
          <h2>Sipariş alarmı telefonları</h2>
          <p>{error || (!data ? 'Kontrol ediliyor…' : devices.length === 0 ? 'Henüz eşlenmiş telefon yok.' : `${devices.length} telefon eşli · ${online} telefon şu an bağlı`)}</p>
        </div>
      </div>
      <div className="ui-panel-body dash-sidecard-body">
        <p>Telefona “Sipariş Alarmı” uygulamasını kurup yönetici hesabıyla giriş yapın. Yeni siparişte telefon, birisi “Siparişi Gördüm” ya da “Kabul Et” diyene kadar çalar; bir telefonda verilen onay diğerlerini de susturur.</p>
        {devices.length > 0 && (
          <ul>
            {devices.map((device) => {
              const isOnline = device.lastSeenAt && now - new Date(device.lastSeenAt).getTime() < ONLINE_MS;
              return (
                <li key={device.id} className="dash-alarm-device">
                  <span>
                    <strong>{device.name}</strong>
                    {' · '}{isOnline ? 'Bağlı' : device.lastSeenAt ? `Son bağlantı ${time(device.lastSeenAt)}` : 'Hiç bağlanmadı'}
                    {device.appVersion && ` · v${device.appVersion}`}
                  </span>
                  <button className="ui-btn ui-btn--sm ui-btn--danger" disabled={busy === device.id} onClick={() => remove(device.id)}>
                    {busy === device.id ? 'Kaldırılıyor…' : confirming === device.id ? 'Emin misiniz? Kaldır' : 'Kaldır'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <details>
          <summary>Son onaylar</summary>
          <ul>
            {data?.recentAcks?.map((ack) => (
              <li key={ack.orderId}>
                {ack.number} · {ack.action === 'accepted' ? 'Kabul edildi' : 'Görüldü'} · {ack.deviceName} · {time(ack.at)}
              </li>
            ))}
            {data?.recentAcks?.length === 0 && <li>Henüz onay yok.</li>}
          </ul>
        </details>
      </div>
    </section>
  );
}
