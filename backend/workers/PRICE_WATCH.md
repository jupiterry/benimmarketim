# Fiyat bekçisi

Ürünlerin internetteki piyasa fiyatını gece, yavaşça ve ücretsiz olarak kontrol eder.
Sonuçlar yönetici panelinde **Katalog → Fiyat bekçisi** sekmesinde görünür. **Hiçbir fiyat kendiliğinden değişmez**; fiyatı yönetici tek tıkla günceller (mevcut `PUT /api/products/update-price/:id`).

## Nasıl çalışır

- Kendi SearXNG sunucunuzda (`SEARXNG_URL`) her ürün için **tek arama** yapılır: `<ürün adı> fiyat`.
- Aramalar arasında **20–30 saniye** beklenir; varsayılan olarak yalnızca **01:00–07:00** (İstanbul) arasında çalışır, günde en çok **300** ürün.
- Sıra: hiç bakılmamış ürünler → son 30 günün **en çok satan 100 ürünü** (günde bir) → diğerleri (haftada bir). 1.500 ürünlük katalog yaklaşık bir haftada bir tur döner.
- Arama hatası alan ürün ertesi gün yeniden denenir. Arka arkaya 5 hata veya 10 "bulunamadı" gelirse (arama motoru engellenmiş olabilir) bir saat ara verilir.
- Arama sonuç başlıklarındaki fiyatlar okunur, sitelere girilmez. Ürün adının ilk iki anlamlı kelimesi başlıkta geçmeyen sonuçlar ve aşırı uç fiyatlar elenir; ortanca fiyat "piyasa fiyatı" sayılır.

Her ürün için `price_watch` koleksiyonunda saklananlar: piyasa ortancası, en düşük/en yüksek, kaç kaynak, kaynak bağlantıları, son kontrol zamanı, durum (`ok` / `not-found` / `error`), yönetici ayarları (`ignored`, `customQuery`).
İşçinin durumu `price_watch_state` koleksiyonundadır (bugünkü sayı, son çalışma, son hata, ara).

## Panel

- **Pahalı / Ucuz**: fiyatı piyasa ortancasından %20'den fazla yüksek / düşük olanlar (en büyük fark üstte).
- **Bulunamadı**: internette fiyatı bulunamayan veya araması başarısız olanlar. Kalem simgesiyle arama sözcüğü düzeltilebilir (ör. "pınar süt 1 lt"); kayıttan sonra hemen yeniden aranır.
- **Uyumlu / Bakılmadı / Yoksayılan**.
- Her satırda: kaynak bağlantıları, "Piyasa fiyatını yaz" kısayolu, fiyat kutusu + Kaydet, şimdi yeniden kontrol et, yoksay (yöresel/kendi ürünleriniz için).

## Kurulum (sunucu)

```bash
cd /var/www/benimmarketim
# 1) Önce birkaç ürünle deneyin (pencere ve sınıra bakmaz, 3 ürün kontrol edip çıkar)
npm run price-watch:deneme
# 2) Kalıcı süreç
pm2 start backend/workers/priceWatch.run.js --name benimmarketim-price-watch --time
pm2 save
```

API (`benimmarketim-api`) da yeni `/api/price-watch` uçları için `pm2 reload benimmarketim-api` ile yenilenmeli.

## Ayarlar (.env, hepsi isteğe bağlı)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PRICE_WATCH_ENABLED` | `true` | `false` ise işçi bekler |
| `PRICE_WATCH_HOURS` | `1-7` | Çalışma saatleri (İstanbul); `23-6` gibi gece yarısını aşan aralık da olur |
| `PRICE_WATCH_DAILY_LIMIT` | `300` | Günde en çok kaç ürün |
| `PRICE_WATCH_DELAY_SEC` | `20-30` | İki arama arasında rastgele bekleme (en az 5 sn) |
| `PRICE_WATCH_THRESHOLD` | `20` | Pahalı/ucuz sayılma eşiği (%) |
| `PRICE_WATCH_TOP_SELLERS` | `100` | Günde bir kontrol edilen en çok satan ürün sayısı |

## Sınırlar

- İnternet fiyatları market, kargo, koli/paket ve kampanya farkı içerebilir. Tek kaynaklı sonuçlar panelde "tek kaynak" olarak işaretlenir; karar yöneticinindir.
- Yöresel veya kendi ürünleriniz genelde bulunamaz; bunları **yoksay** ile listeden çıkarın.
