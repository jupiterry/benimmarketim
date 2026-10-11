# Fiyat bekçisi

Ürünlerin internetteki piyasa fiyatını gece, yavaşça ve ücretsiz olarak kontrol eder.
Sonuçlar yönetici panelinde **Katalog → Fiyat bekçisi** sekmesinde görünür. **Hiçbir fiyat kendiliğinden değişmez**; fiyatı yönetici tek tıkla günceller (mevcut `PUT /api/products/update-price/:id`).

## Nasıl çalışır

### 1. Camgöz (ana kaynak)

`JOJAPI_API_KEY` tanımlıysa önce [Camgöz](https://camgoz.net) API'sine (JoJ API, `X-JoJAPI-Key` başlığı) sorulur.
- Camgöz barkod bazında A101, Migros, Şok, Hakmar gibi zincirlerin günlük güncellenen fiyatlarını verir.
- **İlk kez:** ürün adıyla aranır (en çok 10 ürün döner, ~12 kredi), gramaj kontrolüyle doğru ürün seçilir ve **barkodu kaydedilir**.
- **Sonraki kontroller:** barkodla aranır (~2 kredi).
- Camgöz'de bulunamayan ürün için isimle arama 30 gün tekrarlanmaz (kredi boşa gitmesin).
- Panelde kalemle **barkod** elle yazılabilir; elle yazılan barkod kesin kabul edilir ve otomatik değiştirilmez.
- Yalnızca zincir marketler sayılır (`CAMGOZ_MARKETS`); küçük online dükkânların fiyatları alınmaz.
- **Güncellik:** son 90 günde (`CAMGOZ_MAX_AGE_DAYS`) güncellenmemiş market fiyatı, stokta olmayan ürün ve Camgöz'de yanlış ürüne bağlanmış market kaydı (ör. 144 g ürünün altında 4x36 g paket) elenir.
- **Kredi bütçesi:** `CAMGOZ_MONTHLY_CREDITS` (varsayılan 500 = ücretsiz paket) ay boyunca eşit dağıtılır; gece işçisi günlük payı aşmaz, panelden elle kontrol yalnızca aylık sınıra bakar. Harcanan kredi API'nin `X-Jojapi-Credits-Used` başlığından okunur, `price_watch_state` (`_id: "camgoz"`) içinde tutulur ve panelde görünür.
- Anahtar hatası / kredi bitti / istek sınırı (401, 402, 403, 429) gelirse Camgöz 6 saat denenmez.
- Ücretsiz paketle ayda yaklaşık 40 yeni ürün eşleşir ya da ~160 barkodlu ürün kontrol edilir. 1.500 ürünün düzenli takibi için Başlangıç ($9/ay, 10.000 kredi) paketi gerekir; `CAMGOZ_MONTHLY_CREDITS=10000` yapılır.

### 2. Market sayfaları (yedek)

Camgöz kapalıysa, kredi dolduysa ya da ürün bulunamazsa:

- **Güncel fiyat şartı:** fiyat, market ürün sayfası o gece açılarak okunur. Arama motoru yalnızca ürün sayfasının adresini bulmak için kullanılır; arama sonuç özetlerindeki fiyatlar (Cimri/Akakçe/Instagram özetleri gibi, çoğu aylarca eski) kullanılmaz.
- **Okunan marketler:** Şok (sokmarket.com.tr), Trendyol, Hepsiburada. Üçünün robots.txt'i ürün sayfalarına izin veriyor; kendi arama sayfalarına girilmez.
  - Migros ve A101 fiyatı sayfa açıldıktan sonra tarayıcıda yüklediği için okunamaz; BİM'in online satışı yok.
- Her ürün için: 1 arama (`<ürün> site:sokmarket.com.tr OR site:trendyol.com OR site:hepsiburada.com`), sonuç yoksa 1 yedek arama (`<ürün> fiyat`), en çok 3 ürün sayfası (her marketten biri, sayfalar arası 3–6 sn).
- **Eşleşme kontrolü:** sayfadaki ürünün markası ve adının çoğu tutmalı; gramaj iki tarafta da yazıyorsa aynı olmalı (±%5), paket adedi (6x200 ml, 8'li) aynı olmalı. Tutmayan sayfa elenir ve panelde neden elendiği yazar.
- **Emin değil:** ürün adında gramaj yoksa ya da fark %100'den fazla pahalı / %60'tan fazla ucuzsa sonuç Pahalı/Ucuz'a değil "Emin değil" listesine düşer. Çözüm: kalemle arama sözcüğüne gramaj ekleyin.
- Ürünler arasında 20–30 sn beklenir; varsayılan olarak yalnızca 01:00–07:00 (İstanbul) arasında çalışır, günde en çok 300 ürün.
- Sıra: hiç bakılmamış ürünler → son 30 günün en çok satan 100 ürünü (günde bir) → diğerleri (haftada bir).
- Arka arkaya 5 arama hatası veya 25 "bulunamadı" gelirse bir saat ara verilir.
- Eski sürümün (arama özetinden) kayıtları gösterilmez; o ürünler "Bakılmadı" sayılır ve ilk gece yeniden kontrol edilir. Yoksay ve arama sözcüğü ayarları korunur.

Her ürün için `price_watch` koleksiyonunda saklananlar: okunan fiyatlar (market, sayfa, okunma zamanı), ortanca / en düşük / en yüksek, güven (`high`/`low`) ve açıklama, elenen sayfalar ve nedenleri, son kontrol zamanı, durum (`ok` / `not-found` / `error`), yönetici ayarları (`ignored`, `customQuery`), kayıt sürümü (`v: 2`).
İşçinin durumu `price_watch_state` koleksiyonundadır.

## Panel

- **Pahalı / Ucuz**: fiyatı market fiyatından %20'den fazla yüksek / düşük olanlar (en büyük fark üstte).
- **Emin değil**: gramajsız ürün adı ya da şüphe uyandıracak kadar büyük fark.
- **Bulunamadı**: desteklenen marketlerde bulunamayan, sayfası eşleşmeyen (elenme nedeni yazılır) veya araması başarısız olanlar. Kalem simgesiyle arama sözcüğü düzeltilebilir (ör. "pınar süt 1 lt"); kayıttan sonra hemen yeniden aranır.
- **Uyumlu / Bakılmadı / Yoksayılan**.
- Her satırda: kaynak bağlantıları, "Piyasa fiyatını yaz" kısayolu, fiyat kutusu + Kaydet, şimdi yeniden kontrol et, yoksay (yöresel/kendi ürünleriniz için).

## Kurulum (sunucu)

```bash
cd /var/www/benimmarketim
# 1) Önce birkaç ürünle deneyin (pencere ve sınıra bakmaz, 3 ürün kontrol edip çıkar)
npm run price-watch:deneme
# Camgöz denemesi (kredi harcar: isimle ~12, barkodla ~2)
node backend/workers/priceWatch.run.js --camgoz="Eti Sütlü Kare Çikolata 65 g"
node backend/workers/priceWatch.run.js --camgoz=8690526019222
# Tek bir market sayfasını deneyin (fiyat okunuyor mu, ürünle eşleşiyor mu?)
node backend/workers/priceWatch.run.js --sayfa=https://www.sokmarket.com.tr/lipton-yellow-label-poset-cay-25-li-p-4729 --ad="Lipton Yellow Label Poşet Çay 25'li"
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
| `JOJAPI_API_KEY` | — | Camgöz API anahtarı (yoksa yalnızca market sayfaları) |
| `CAMGOZ_MONTHLY_CREDITS` | `500` | Aylık kredi bütçesi (paketinize göre) |
| `CAMGOZ_MAX_AGE_DAYS` | `90` | Bundan eski market fiyatı sayılmaz |
| `CAMGOZ_MARKETS` | zincirler | Sayılacak marketler (virgülle) |

## Sınırlar

- Trendyol ve Hepsiburada pazar yeri olduğu için satıcı fiyatları zincir market fiyatından farklı olabilir; kaynak adı her fiyatın yanında yazar, karar yöneticinindir.
- Market siteleri sayfa yapısını değiştirirse fiyat okunamayabilir; `--sayfa` denemesiyle kontrol edilir.
- Yöresel veya kendi ürünleriniz genelde bulunamaz; bunları **yoksay** ile listeden çıkarın.
