# Fiyat bekçisi

Ürünlerin internetteki piyasa fiyatını gece, yavaşça ve ücretsiz olarak kontrol eder.
Sonuçlar yönetici panelinde **Katalog → Fiyat bekçisi** sekmesinde görünür. **Hiçbir fiyat kendiliğinden değişmez**; fiyatı yönetici tek tıkla günceller (mevcut `PUT /api/products/update-price/:id`).

## Nasıl çalışır

Kaynak sırası: **Market Fiyatı (ücretsiz) → Camgöz (kredi; yalnızca Market Fiyatı bulamazsa) → market sayfaları (SearXNG)**.
Her kaynağın `price_watch_state` içinde kendi kaydı vardır (`_id: "marketfiyati" | "camgoz" | "pages"`: `lastOkAt`, `lastErrorAt`, `lastError {status, message, detail}`, `consecutiveMisses`, `pausedUntil`).
Bir kaynak engellenir ya da sınıra takılırsa **yalnızca o kaynak** ara verir; bekçi diğerleriyle devam eder. Panelde "Kaynaklar" satırı her kaynağın durumunu gösterir ve "Şimdi dene" ile üretimden tek canlı istek atılabilir (`POST /api/price-watch/providers/:id/test`).

### 0. Market Fiyatı (ana kaynak, ücretsiz)

[Market Fiyatı](https://marketfiyati.org.tr), TÜBİTAK BİLGEM'in halka açık fiyat platformudur (A101, BİM, Migros, Şok, CarrefourSA, Hakmar, Tarım Kredi şubeleri). Resmî/belgelenmiş bir API değildir; sitenin kendi JSON uçları (`POST https://api.marketfiyati.org.tr/api/v2/search`, `/api/v2/searchByIdentity`) okunur. Kullanım koşullarına uyum işletmenin sorumluluğundadır: <https://marketfiyati.org.tr/kullanim-kosullari>.
- Konum **Devrek (41.2207, 31.9563)**, yarıçap **60 km**; o alanda şube yoksa bir kez **150 km** ile denenir. Şube mesafesi sunucuda da (haversine) süzülür.
- Barkod biliniyorsa önce `searchByIdentity` (`identityType: "barcode"`; platform bu türü kabul etmezse isimle devam edilir), yoksa isimle arama (20 sonuç) ve gramaj/ad eşleşmesiyle en uygun ürün seçilir (Camgöz'dekiyle aynı `matchProduct`).
- Her zincir için en güncel günün şube fiyatlarının **ortancası** alınır; `indexTime` 14 günden eskiyse sayılmaz (`MARKETFIYATI_MAX_AGE_DAYS`).
- İstekler arası en az **2,5 sn** + rastgele ek (süreç içi tek sıra); aynı sorgu 6 saat önbellekten döner.
- 429/403/401/5xx, zaman aşımı ve ağ hatasında kaynak **15 dk** ara verir; tekrarında süre ikiye katlanır (**en çok 6 saat**). Bulunamayan ürün 7 gün yeniden sorulmaz (`marketfiyatiMissAt`).
- Ayarlar panelden (Fiyat bekçisi → Market Fiyatı) değiştirilir ve `price_watch_state` (`_id: "marketfiyati_config"`) içinde tutulur; `.env` değerleri varsayılandır.
- Deneme: `node backend/workers/priceWatch.run.js --marketfiyati="Pınar Süt 1 L"` (veritabanı gerekmez).

### 1. Camgöz (yedek, kredi)

`JOJAPI_API_KEY` tanımlıysa önce [Camgöz](https://camgoz.net) API'sine (JoJ API, `X-JoJAPI-Key` başlığı) sorulur.
- Camgöz barkod bazında A101, Migros, Şok, Hakmar gibi zincirlerin günlük güncellenen fiyatlarını verir.
- **İlk kez:** ürün adıyla aranır (en çok 10 ürün döner, ~12 kredi), gramaj kontrolüyle doğru ürün seçilir ve **barkodu kaydedilir**.
- **Sonraki kontroller:** barkodla aranır (~2 kredi).
- Camgöz'de bulunamayan ürün için isimle arama 30 gün tekrarlanmaz (kredi boşa gitmesin).
- Panelde kalemle **barkod** elle yazılabilir; elle yazılan barkod kesin kabul edilir ve otomatik değiştirilmez.
- Yalnızca zincir marketler sayılır (`CAMGOZ_MARKETS`); küçük online dükkânların fiyatları alınmaz.
- **Güncellik:** son 90 günde (`CAMGOZ_MAX_AGE_DAYS`) güncellenmemiş market fiyatı, stokta olmayan ürün ve Camgöz'de yanlış ürüne bağlanmış market kaydı (ör. 144 g ürünün altında 4x36 g paket) elenir.
- **Kredi:** varsayılan olarak (`CAMGOZ_PACING=even`) aylık kredi ay boyunca eşit dağıtılır; Market Fiyatı'nın bulduğu ürünler için Camgöz'e hiç sorulmaz. `CAMGOZ_PACING=none` yapılırsa kredi bitene kadar kullanılır. Harcanan kredi API'nin `X-Jojapi-Credits-Used` başlığından okunur, `price_watch_state` (`_id: "camgoz"`) içinde tutulur ve panelde görünür.
- **Günlük sınır yalnızca market sayfaları için:** `PRICE_WATCH_DAILY_LIMIT` sitelere bakılan ürün sayısını sınırlar. Sınır dolunca bekçi Camgöz kredisi kaldığı sürece yalnızca Camgöz'le devam eder (ürünler arası 3 sn); Camgöz'de bulunamayan ürünlere ertesi gün market sayfalarından bakılır (`pagesPending`).
- Anahtar hatası / kredi bitti / istek sınırı (401, 402, 403, 429) gelirse Camgöz 6 saat denenmez.
- Ücretsiz paket (500 kredi) ile yaklaşık 40 yeni ürün eşleşir ya da ~160 barkodlu ürün kontrol edilir; 1.500 ürünün düzenli takibi için Başlangıç ($9/ay, 10.000 kredi) paketi gerekir.

### Anahtarı panelden değiştirme

Fiyat bekçisi ekranında "Camgöz kredisi" kutusundaki **Anahtar** bağlantısı (kredi bitince "Yeni anahtar gir" düğmesi) açılır:
- Yeni anahtar önce Camgöz'ün ücretsiz `/api/external/last` ucuyla denenir (kredi harcamaz); abonelik yoksa kaydedilmez ve JoJ'un yanıtı gösterilir.
- Geçerli anahtar veritabanında (`price_watch_state`, `_id: "camgoz_key"`) `ACCESS_TOKEN_SECRET`'ten türetilen anahtarla **AES-256-GCM şifreli** saklanır; panelde ve API yanıtlarında yalnızca son 4 karakteri görünür, işlem kaydına (Kayıtlar) anahtar yazılmaz.
- Panel anahtarı `.env`'deki `JOJAPI_API_KEY`'in yerine geçer; **.env dosyasına dokunulmaz**. "Panel anahtarını sil" ile .env anahtarına dönülür.
- Yeni anahtar kaydedilince bu ayın kredi sayacı ve Camgöz hata/ara bilgisi sıfırlanır; bekçi bir sonraki adımda (en geç 5 dk) yeni anahtarla devam eder, yeniden başlatma gerekmez.
- Aylık kredi (paket değişince) aynı pencereden güncellenir.
- `ACCESS_TOKEN_SECRET` değişirse panel anahtarı çözülemez; panel uyarı verir ve .env anahtarı kullanılır — anahtarı yeniden girin.
- Not: JoJ'un kullanım koşulları ücretsiz kotayı aşmak için birden çok hesap açmayı yasaklıyor olabilir; düzenli kullanımda ücretli pakete geçmek en sağlamı.

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
- Arka arkaya 5 arama hatası veya 25 "bulunamadı" gelirse yalnızca market sayfaları kaynağı bir saat ara verir (`price_watch_state`, `_id: "pages"`); Market Fiyatı ve Camgöz sürer.
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
| `PRICE_WATCH_DAILY_LIMIT` | `300` | Günde en çok kaç ürünün market sayfasına bakılır (Camgöz kontrolleri hariç) |
| `PRICE_WATCH_DELAY_SEC` | `20-30` | İki arama arasında rastgele bekleme (en az 5 sn) |
| `PRICE_WATCH_THRESHOLD` | `20` | Pahalı/ucuz sayılma eşiği (%) |
| `PRICE_WATCH_TOP_SELLERS` | `100` | Günde bir kontrol edilen en çok satan ürün sayısı |
| `JOJAPI_API_KEY` | — | Camgöz API anahtarı (yoksa Market Fiyatı ve market sayfaları) |
| `CAMGOZ_MONTHLY_CREDITS` | `500` | Aylık kredi bütçesi (paketinize göre) |
| `CAMGOZ_MAX_AGE_DAYS` | `90` | Bundan eski market fiyatı sayılmaz |
| `CAMGOZ_PACING` | `even` | `even`: krediyi ay boyunca eşit dağıt; `none`: bitene kadar kullan |
| `CAMGOZ_MARKETS` | zincirler | Sayılacak marketler (virgülle; Market Fiyatı için de geçerli) |
| `MARKETFIYATI_ENABLED` | `true` | `false` ise Market Fiyatı sorulmaz (panelden de kapatılabilir) |
| `MARKETFIYATI_LAT` / `MARKETFIYATI_LON` | `41.2207` / `31.9563` | Şube seçimi için konum (Devrek) |
| `MARKETFIYATI_DISTANCE_KM` | `60` | Yarıçap; boşsa bir kez 150 km denenir |
| `MARKETFIYATI_MIN_INTERVAL_MS` | `2500` | İstekler arası en az bekleme |
| `MARKETFIYATI_MAX_AGE_DAYS` | `14` | Bundan eski şube fiyatı sayılmaz |
| `MARKETFIYATI_TIMEOUT_MS` | `12000` | İstek zaman aşımı |

## Sınırlar

- Trendyol ve Hepsiburada pazar yeri olduğu için satıcı fiyatları zincir market fiyatından farklı olabilir; kaynak adı her fiyatın yanında yazar, karar yöneticinindir.
- Market siteleri sayfa yapısını değiştirirse fiyat okunamayabilir; `--sayfa` denemesiyle kontrol edilir.
- Yöresel veya kendi ürünleriniz genelde bulunamaz; bunları **yoksay** ile listeden çıkarın.
