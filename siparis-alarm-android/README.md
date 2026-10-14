# Benim Marketim — Sipariş Alarmı (Android)

Yeni sipariş geldiğinde telefonu, gelen arama gibi yüksek sesle çaldıran ve titreten ayrı bir Android uygulaması.
Google Play'e konmaz; APK dosyası doğrudan telefona kurulur.

- Uygulama kapalı ya da telefon kilitliyken de çalışır. Kilit ekranının üstünde tam ekran sipariş kartı açılır.
- Kartta sipariş numarası, müşteri adı ve telefonu (Ara düğmesi), ürünler, teslimat adresi, ödeme yöntemi, not ve toplam tutar görünür.
- **Siparişi Gördüm** ya da **Kabul Et**'e basılana kadar alarm susmaz. Ses kısılırsa uygulama birkaç saniye içinde sesi yeniden en yükseğe çıkarır.
- Birden fazla telefon eşlenebilir. Bir telefonda verilen onay diğer telefonları da susturur.
- Birden fazla sipariş birikirse alarm ekranında **Tümünü kabul et** düğmesi çıkar.
- **Sesli okuma (1.1.0):** Alarm çalarken her 20 saniyede bir zil kısa süre durur ve sipariş Türkçe okunur: "Yeni sipariş. Kız KYK Yurdu. 3 ürün. Toplam 245 lira 50 kuruş." Telefonun kendi okuma motoru kullanılır, internet gerekmez. Ayarlardan kapatılabilir.
- **Yeni görünüm (1.2.0):** Gelen arama gibi dalga animasyonlu alarm ekranı, siparişin kaç dakikadır beklediğini gösteren sayaç, ikonlu bilgi kartı. Tablette yatay iki sütunlu düzen; telefonda dikey. Ana ekranda renkli durum kartı (yeşil: açık, turuncu: bağlantı bekleniyor, kırmızı: kapalı), hızlı işlem kutuları, ayar ilerleme çubuğu. Geniş ekranlarda içerik ortada sınırlı genişlikte durur.
- **Flaş ışığı (1.1.0, isteğe bağlı):** Gürültülü ortam için alarm çalarken arka flaş yanıp söner. Varsayılan kapalı.
- **Bugünün siparişleri (1.1.0):** Günlük sipariş sayısı, ciro (iptaller hariç), bekleyenler. Duruma göre süzme. Hangi telefonda kim onayladı görünür. Siparişe dokununca ürünler, not, Ara düğmesi ve **Yola çıktı** / **Teslim edildi** düğmeleri açılır. Müşteriye paneldeki gibi bildirim gider. Telefondan yalnızca ileri adım atılır; iptal ve geri alma panelde kalır.
- Sipariş panelde Yolda ya da İptal yapılırsa alarm kendiliğinden durur.
- Onaylar sipariş durumunu değiştirmez; yalnızca alarmı susturur. Panelde "Sipariş alarmı telefonları" kartında görünür.

APK: `release/BenimMarketim-SiparisAlarmi-<sürüm>.apk`

## Önce: backend'i yayınlayın

Uygulama, sitenin sunucusundaki `/api/order-alarm` uçlarını kullanır. Bu uçlar backend'e eklendi:

| Dosya | Görev |
|---|---|
| `backend/services/orderAlarm.service.js` | Cihaz anahtarı, bekleyen sipariş listesi, onaylar, uzun bekletme |
| `backend/controllers/orderAlarm.controller.js`, `backend/routes/orderAlarm.route.js` | `/api/order-alarm/*` uçları |
| `backend/server.js` | Rota bağlandı |
| `backend/services/order.service.js` | Yeni siparişte bekleyen telefonlar anında uyandırılır |
| `frontend/src/components/OrderAlarmDevicesCard.jsx` | Panel ana sayfasında eşli telefonlar, telefon kaldırma, son onaylar |

Sunucuya yükleyip yeniden başlatmadan uygulama giriş yapamaz ("Sunucuda sipariş alarmı bulunamadı (404)" der).
İsteğe bağlı ortam değişkenleri: `ORDER_ALARM_WINDOW_HOURS` (varsayılan 12) ve `ORDER_ALARM_PAYMENT_LABEL` (varsayılan "Teslimatta ödeme").

### Uçlar

| Uç | Kim | Ne yapar |
|---|---|---|
| `POST /api/order-alarm/pair` `{email, password, deviceName}` | Yönetici hesabı | Telefona cihaz anahtarı verir. Şifre telefonda saklanmaz. |
| `GET /api/order-alarm/pending?known=…&wait=25` | Cihaz anahtarı | Onay bekleyen siparişler. Liste değişmediyse 25 sn'ye kadar bekletir. |
| `POST /api/order-alarm/orders/:id/ack` `{action: "seen" \| "accepted"}` | Cihaz anahtarı | Alarmı tüm telefonlarda susturur. İlk onay geçerlidir. |
| `GET /api/order-alarm/orders/today` | Cihaz anahtarı | Bugünün (İstanbul saati) siparişleri, özet ve onay bilgisi |
| `PUT /api/order-alarm/orders/:id/status` `{status: "Yolda" \| "Teslim Edildi"}` | Cihaz anahtarı | Hazırlanıyor → Yolda/Teslim Edildi, Yolda → Teslim Edildi. Müşteri bildirimi, görev ödülü ve canlı panel güncellemesi paneldekiyle aynı. İşlem kaydına "Sipariş durumu (alarm telefonu)" olarak yazılır. |
| `POST /api/order-alarm/logout` | Cihaz anahtarı | Telefon kendi eşlemesini kaldırır. |
| `GET /api/order-alarm/status` | Yönetici oturumu | Eşli telefonlar ve son onaylar |
| `DELETE /api/order-alarm/devices/:id` | Yönetici oturumu | Kaybolan telefonun erişimini kapatır |

"Bekleyen sipariş": durumu Hazırlanıyor olan, son 12 saatte ve telefon eşlendikten sonra verilmiş, henüz onaylanmamış sipariş.

## Telefona kurulum

1. APK dosyasını telefona gönderin (WhatsApp, e-posta, USB). Dosyaya dokunun.
2. "Bilinmeyen uygulamaları yükle" izni sorulursa dosyayı açan uygulamaya (ör. Dosyalar, Chrome) izin verin.
3. Play Protect uyarı verirse **Ayrıntılar → Yine de yükle** deyin. Uygulama Play'den gelmediği için bu uyarı normaldir.
4. Uygulamayı açın, yönetici e-posta ve şifresiyle giriş yapın, telefona bir ad verin (ör. "Kasa telefonu").
5. Ekrandaki **Kesintisiz çalışma ayarları** listesinde kırmızı işaretli ne varsa tek tek açın:
   - Bildirimler
   - Tam ekran uyarı (Android 14 ve sonrası)
   - Pil optimizasyonu kapalı
   - Diğer uygulamaların üzerinde göster (önerilir: telefon kullanılırken de ekran hemen açılır)
   - Xiaomi, Huawei, Oppo, Vivo ve Samsung telefonlarda listede gösterilen ek üretici ayarları (otomatik başlatma vb.)
6. **Test alarmı çal**'a basın ve telefonu kilitleyin. 10 saniye sonra kilit ekranında alarm çalmalı.

Telefonu şarjda ve internete bağlı tutun. Uygulama, ekran kapalıyken de bağlantıyı korumak için işlemciyi uyutmaz. Bu yüzden pil tüketimi normal bir uygulamadan fazladır.

## Nasıl çalışır

- `AlarmService` ön plan servisidir ("Sipariş alarmı açık" bildirimi). Sunucuya uzun bekletmeli istek (long-poll) açık tutar. Firebase/Google servisi gerekmez.
- Yeni siparişte `AlarmSound` telefonun zil sesini **alarm kanalından** döngüyle çalar, bu yüzden sessiz modda da duyulur. Ses seçilebilir: telefonun zil sesi, uygulamanın kendi zil sesi ya da başka bir ses. Alarm bitince ses seviyesi eski haline döner.
- Kilitliyken tam ekran bildirim `AlarmActivity`'yi açar. Telefon açıkken "üstte göster" izni varsa ekran doğrudan açılır, yoksa üstte kalıcı bildirim çıkar (düğmeler bildirimde de var).
- Telefon yeniden başlayınca (`BootReceiver`), uygulama güncellenince ya da sistem servisi kapatırsa (`Watchdog`, 15 dakikada bir kontrol) servis kendiliğinden yeniden başlar.
- İnternet giderse 2 dakika sonra "Siparişler alınamıyor" uyarısı çıkar. Bağlantı gelince uygulama otomatik devam eder.
- Onay ağ yokken verilirse alarm yine hemen susar; onay telefonda sıraya alınır ve bağlantı gelince gönderilir.

### Sınırlar

- Uygulamayı Ayarlar'dan **Durmaya zorla** ile kapatırsanız Android uygulamayı tamamen durdurur. Uygulama bir kez açılana kadar alarm çalmaz.
- "Rahatsız Etmeyin" modunda **alarmlara izin verilmiyorsa** ("Tam sessizlik") ses çıkmaz; titreşim ve ekran yine çalışır.
- Telefonun zil sesi telefona sonradan yüklenmiş bir dosyaysa ve okunamıyorsa uygulamanın kendi zil sesi çalar.
- Siparişlerde ödeme yöntemi alanı yoktur. Ekranda `ORDER_ALARM_PAYMENT_LABEL` (varsayılan "Teslimatta ödeme") görünür. Siparişe ileride `paymentMethod` eklenirse (`cash`, `card`, `online` ya da serbest metin) o gösterilir.

## Derleme

Ek kütüphane kullanılmaz; yalnızca Android API'leri (Java). minSdk 26 (Android 8), targetSdk 35 (Android 15).

- **Android Studio:** klasörü açın → *Build → Generate Signed App Bundle / APK → APK*. Ya da `gradlew assembleRelease` (Gradle wrapper yoksa Android Studio oluşturur). `keystore/keystore.properties` varsa release otomatik imzalanır.
- **Komut satırı (SDK araçlarıyla):** `build-apk.sh`. İlk APK bu betikle derlendi (aapt2 + javac + d8 + zipalign + apksigner).

Sürüm yükseltirken `app/build.gradle` içindeki `versionCode` / `versionName` ve `BuildInfo.VERSION_NAME` değerlerini birlikte artırın.

### İmza anahtarı — kaybetmeyin

`keystore/siparis-alarm.jks` ve şifresi `keystore/keystore.properties` içindedir. Bu ikisi git'e **eklenmez** (`.gitignore`), çünkü depo herkese açık.
Güncellemeleri aynı anahtarla imzalamanız gerekir. Anahtar kaybolursa yeni sürüm eskisinin üstüne kurulmaz; telefonlardan uygulamayı silip yeniden kurmak ve yeniden eşlemek gerekir.
Bu iki dosyayı güvenli bir yere (ör. şifreli bulut klasörü) yedekleyin.

## Doğrulama durumu (14 Ekim 2026)

- Backend: `node --test backend/tests/order-alarm.test.js` → 9/9 geçti. Testler bellek içi veritabanı ve mongoose taklidiyle çalıştı. Gerçek MongoDB ile denenmedi.
- Uygulamanın sunucu istemcisi (`ApiClient`, `AlarmOrder`), gerçek `orderAlarm.service` fonksiyonlarını kullanan bir deneme sunucusuna karşı JVM'de uçtan uca denendi: eşleme, yanlış şifre, sipariş gelişi, uzun bekletme, onay, kalıcı hata, bağlantı kesme ve çıkış sonrası 401 doğru çalıştı. 1.1.0'da ayrıca bugünün listesi, onay bilgisi, Yolda/Teslim edildi, geri almanın reddi, sesli okuma metni ve eski sunucuda "henüz desteklemiyor" mesajı denendi.
- 1.1.0'daki yeni uçlar (`/orders/today`, `/orders/:id/status`) backend yeniden yayınlanmadan çalışmaz; uygulama bu durumda "Sunucu bu özelliği henüz desteklemiyor" der, alarm ise etkilenmez.
- APK derlendi ve imzalandı (v2 + v3 imza doğrulandı).
- **Gerçek telefonda denenmedi.** Kurulumdan sonra yukarıdaki 6. adımdaki test alarmını ve gerçek bir deneme siparişini mutlaka deneyin.
