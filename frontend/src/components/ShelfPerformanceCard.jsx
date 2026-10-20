import { useEffect, useState } from 'react';
import axios from '../lib/axios';

// Sipariş satırlarının geldiği raf/ekran (order.products[].source). Mobil uygulama bu alanı
// gönderdiğinde dolmaya başlar; gönderilmeyen satırlar "Kaynak bilinmiyor" altında toplanır.
const LABELS = {
  home_deals: 'Ana sayfa · Fırsatlar',
  home_foryou: 'Ana sayfa · Sana özel',
  home_popular: 'Ana sayfa · Çok satanlar',
  flash: 'Flash sale',
  category: 'Kategori',
  search: 'Arama',
  detail_similar: 'Ürün detayı · Benzerler',
  cart_suggestion: 'Sepet önerisi',
  weekly: 'Haftalık fırsatlar',
  favorites: 'Favoriler',
  reorder: 'Tekrar sipariş',
  saved_cart: 'Kayıtlı sepet',
  unknown: 'Kaynak bilinmiyor',
};
const money = (value) => Number(value || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

export default function ShelfPerformanceCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/products/shelf-performance')
      .then((response) => setData(response.data))
      .catch(() => setError('Raf performansı alınamadı.'));
  }, []);

  const sources = data?.sources || [];
  const tracked = sources.filter((row) => row.source !== 'unknown');
  const total = sources.reduce((sum, row) => sum + row.revenue, 0);

  return (
    <section className="ui-panel dash-sidecard" aria-label="Raf performansı">
      <div className="ui-panel-head">
        <div>
          <h2>Raf performansı</h2>
          <p>{error || (!data ? 'Hesaplanıyor…' : `Son ${data.days} gün · ürünlerin sepete eklendiği yere göre`)}</p>
        </div>
      </div>
      {data && (
        <div className="ui-panel-body dash-sidecard-body">
          {tracked.length === 0 && (
            <p>Henüz kaynak bilgisi gelmedi. Mobil uygulama sipariş satırlarında kaynağı göndermeye başladığında burada rafların sipariş, adet ve cirosu görünecek.</p>
          )}
          {sources.length > 0 && (
            <table className="ui-table">
              <thead>
                <tr><th>Kaynak</th><th className="ui-num">Sipariş</th><th className="ui-num">Adet</th><th className="ui-num">Ciro</th></tr>
              </thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.source}>
                    <td>{LABELS[row.source] || row.source}</td>
                    <td className="ui-num">{row.orders}</td>
                    <td className="ui-num">{row.units}</td>
                    <td className="ui-num">{money(row.revenue)}{total > 0 && <small className="ui-muted"> · %{Math.round((row.revenue / total) * 100)}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
