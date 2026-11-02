# Yönetici paneli: geliştirme fikirleri ve bulunan hatalar

2 Kasım 2026 · Panelin tüm ekranları kod üzerinden incelendi: altı bölüm ayrı ayrı okundu, her öneri ikinci bir incelemeyle kodda doğrulandı. Zaten var olan ya da işe yaramayacak 3 fikir elendi; kalan **90 fikir** aşağıda. İncelemede bugün yanlış çalışan şeyler de çıktı: **10 tanesi Devrek açılışından önce** düzeltilmeli, **11 madde** daha var. Önce onlar.

**Okuma rehberi:** Etki 1–5 arası, bu işletme için değeri gösterir. Efor: Küçük (1 günden az), Orta (1–3 gün), Büyük (3 günden fazla). “Sunucu” işareti, backend değişikliği de gerektiğini gösterir. Hiçbir öneri yeni paket gerektirmiyor.

## 1. Önce düzeltilmesi gereken hatalar

### Devrek açılışından önce

1. **“Mağazayı kapat” Devrek siparişlerini durdurmuyor.** Anahtar yalnızca iki yurdu kapatıyor. Adrese teslimat açıldığında mağaza kapalı görünürken Devrek'ten sipariş gelmeye devam eder; onay metni ise “hiçbir teslimat noktasına sipariş verilemez” diyor. _Ayrıntı: “'Mağazayı kapat' Devrek'i de kapsasın; süreli mola ve başlıkta mağaza durumu”._
2. **Flaş indirim, daha derin indirimi ezip fiyatı yükseltiyor.** Örnek: 100 ₺'lik ürün kalıcı indirimle 70 ₺ iken %20 flaş başlatılınca müşteri flaş süresince 80 ₺ öder ve “%20 flaş” rozeti görür. “İndirimli” süzgecinde “Hepsine flaş indirim” bunu toplu yapar. _Ayrıntı: “Flaş indirim, daha derin kalıcı indirimi ezip müşteri fiyatını yükseltiyor”._
3. **Kuponun son günü sabah 03:00'te bitiyor.** Tarih gece yarısı UTC olarak kaydediliyor, bu da İstanbul saatiyle 03:00 ediyor. Son gün akşamı müşteri “süresi dolmuş” hatası alıyor, kupon cüzdandan da kalkıyor. _Ayrıntı: “Kuponun son günü gece 03:00'te bitmesin: bitişi 23:59 olarak kaydet”._
4. **Müşteri iptali panelde sessiz kalıyor.** Ses ya da kalıcı uyarı çıkmıyor; kart “Bugün tamamlanan” bölümüne düşüyor. Fişi basılmış ya da toplanmış bir sipariş fark edilmeden hazırlanmaya devam edebilir. _Ayrıntı: “Müşteri iptal edince sesli ve kalıcı uyarı; kart sessizce kaybolmasın”._
5. **Canlı bağlantı kısa bir kesintiden sonra kalıcı olarak kopuyor.** İnternet yaklaşık 20 saniyeden uzun giderse panel, sayfa yenilenene kadar yeni sipariş sesi ve bildirimi vermiyor. _Ayrıntı: “Canlı bağlantı yaklaşık 20 sn'lik bir kesintiden sonra kalıcı olarak kopuyor; panel sessizce sipariş uyarısı vermeyi bırakıyor”._
6. **Fiyat hatasına karşı koruma yok.** Fiyat bekçisinde kutu boşken kaydedilirse ürün 0 ₺ oluyor. Toplu “− ₺” fiyatı 0'a indirebiliyor. Büyük fiyat farkında onay ve “Geri al” yok. _Ayrıntı: “Fiyat hatasına güvenlik ağı: boş/0 fiyat engeli, büyük sapma onayı, Geri al”._
7. **Toplu zam, indirimdeki ürünlere yansımıyor.** Liste fiyatı artıyor ama indirimli fiyat sabit kalıyor; müşterinin ödediği fiyat değişmiyor, uygulamadaki indirim oranı şişiyor. _Ayrıntı: “Zam indirimdeki ürünlerde müşteriye yansımıyor; indirim oranı şişiyor”._
8. **İlk sipariş teyidi tek tıkla atlanabiliyor.** Teyit yalnızca hatırlatma olarak duruyor. “Yola çıkar”, toplu düğmeler ve alarm telefonu teyit edilmemiş siparişi soru sormadan ilerletiyor. _Ayrıntı: “Teyit edilmemiş ilk sipariş, aranmadan yola çıkarılamasın”._
9. **Toplu ürün yükleme başarıyı bildirmiyor.** Başarılı yüklemede ekranda hiçbir şey çıkmıyor; tekrar yüklenirse kopya ürünler oluşuyor. Tek hatalı satır bütün dosyayı reddediyor ve hangi satır olduğunu söylemiyor. _Ayrıntı: “Toplu yükleme: sonucu doğru bildir, satır satır doğrula, şablon indir”._
10. **Stok ve görünürlük düğmeleri durumu tersine çeviriyor.** İki cihaz birlikte kullanıldığında toplu “Tükendi” bir ürünü sunucuda stoka geri alabiliyor, ekran ise “Tükendi” göstermeye devam ediyor. _Ayrıntı: “Stokta 'tersine çevir' yerine 'şuna ayarla' + cihazlar arası canlı güncelleme”._

### Diğer hatalar

- Sipariş satırında kategori kaydedilmiyor; Satış analizindeki çok satanlarda ve CSV'de ürünler “Kategorisiz” görünüyor. Nedeni, flaş indirim bilgisindeki hatayla aynı: alan sipariş şemasında tanımlı değil. _Ayrıntı: “Sipariş satırında kategori kaydedilmiyor: çok satanlarda her ürün “Kategorisiz””._
- Mesajlar ekranı açıkken başlayan yeni sohbet listeye düşmüyor. Mesajlar rozeti okunduktan sonra azalmıyor. _Ayrıntı: “Mesajlar açıkken başlayan yeni sohbetler listeye düşmüyor”; “Destek, başvuru ve geri bildirim rozetleri; düşmeyen Mesajlar sayısı”._
- Silinen sohbet aslında açık kalıyor ve müşteri boşluğa yazmaya devam ediyor. Kapatılan sohbet diğer cihazlardaki kuyruğa yansımıyor. _Ayrıntı: “Sohbeti sil/kapat yan etkileri: silinen sohbet açık kalıyor, kapanış diğer ekranlara yayılmıyor”._
- İptal edilen ilk sipariş, ilk siparişe özel kuponu yakıyor; müşteri yeniden denediğinde kupon geçersiz sayılıyor. _Ayrıntı: “İptal edilen ilk sipariş, ilk siparişe özel kuponu yakmasın”._
- Genel bakışta “Bu ay” geçen ayın tamamıyla kıyaslandığı için ay başında hep büyük bir düşüş görünüyor. “Bugün” gece yarısı sıfırlanıyor, Gün sonu ise iş gününü 05:00'ten sayıyor; iki ekran farklı rakam veriyor. _Ayrıntı: “Genel bakışta adil kıyas: “Bu ay” geçen ayın tamamıyla kıyaslanmasın”; ““Bugün” gece yarısında sıfırlanıyor; Gün sonu ise iş gününü 05:00'ten sayıyor”._
- Kupon analitiği iptal edilen siparişleri de sayıyor ve Satış analiziyle farklı sonuç veriyor. _Ayrıntı: “Kupon sonuçlarını doğru say: iptaller hariç, dönemli, yeni müşteri odaklı”._
- Haftalık fırsatın indirim yüzdesi, ürünün liste fiyatı değişince eski değerde kalıyor. _Ayrıntı: “Liste fiyatı değişince haftalık fırsatın indirim yüzdesi güncellensin”._
- Ayarlar kaydı, başka bir cihazdan yapılmış değişikliği sessizce geri alabiliyor; örneğin kapatılmış bir yurt yeniden açılıyor. _Ayrıntı: “Ayar kaydı, başka yerden yapılmış değişikliği sessizce geri almasın”._
- Asistan fotokopi için yanlış bilgi veriyor: 50 MB ve Excel diyor, sistem ise 20 MB ve yalnızca PDF, JPG, PNG ve Word kabul ediyor. Silinen hazır bilgi her oturumda geri geliyor. _Ayrıntı: “Asistanın hazır fotokopi bilgisi yanlış ve silinse de her oturumda geri geliyor”._
- Telefonda zil ve çıkış menüsü kırpılıyor. Koyu temada bazı düğme ve kartların yazısı okunmuyor. Android'de geri hareketi panelden çıkarıyor; sayfa yenilenince çoğu ekran Genel bakış'a dönüyor. _Ayrıntı: “Telefonda zil ve çıkış menüsü kırpılıyor; alt çubuk rozetsiz, düğmeler küçük”; “Koyu temada görünmeyen metinleri ve düşük kontrastlı düğmeleri düzelt”; “Açık ekran adres çubuğunda dursun: geri hareketi ve yenileme paneli bozmasın”._
- Yeni sipariş bildirimindeki “Siparişi incele” siparişi açmıyor, yalnızca Siparişler ekranına geçiyor. Genel “n” kısayolu bazı ekranların kendi “n” kısayoluyla çakışıyor. _Ayrıntı: “'Siparişi incele' gerçekten o siparişi açsın”; “'n' kısayol çakışması, Flash sale/Flaş indirim ikiliği ve ekran adı farkları”._

## 2. Önerilen sıra

### 1. Hatalar

Yukarıdaki hataların tamamı. Çoğu küçük iş; Devrek açılışından önce bitmesi gerekenler ilk on madde.

Bu paketteki işler yukarıdaki listede.

### 2. Devrek açılışı

Adrese teslimatı herkese açmadan önce işi kolaylaştıran ve hatayı önleyenler.

- Herkese açmadan önce hazırlık listesi ve pilot karnesi · etki 5/5 · orta · sunucu
- Süreli bölge kapatma ve ücretsiz teslimat kampanyasına bitiş saati · etki 4/5 · orta · sunucu
- Kuryeye teslim tek adım: yola çıkarırken kurye seç, rotayı WhatsApp'la gönder · etki 3/5 · orta
- Devrek siparişleri mahalleye göre gruplansın, aynı adrese gidenler birleşsin · etki 3/5 · küçük
- Gecikme, bölgenin müşteriye söz verdiği süreye göre ölçülsün · etki 4/5 · orta · sunucu
- Bölge başına teslim süresi: söz verilen ile gerçekleşen (+ Devrek mahalleleri) · etki 4/5 · orta · sunucu
- Müşteriye iç not ve 'Dikkat' bayrağı (profil, sohbet, sipariş) · etki 3/5 · orta · sunucu
- Panelden iptalde neden seçilsin, müşteriye nedenli bildirim gitsin · etki 3/5 · orta · sunucu
- Bölge kartında ücret/eşik/minimum için “ne olurdu” önizlemesi · etki 3/5 · orta · sunucu

### 3. Günlük hız ve sipariş kaçırmama

Her akşam zaman kazandıranlar.

- Sipariş kaçırmaya karşı: ses ayarı, ses engeli uyarısı, alarm telefonu çipi · etki 4/5 · orta
- Zil ve rozetler tüm bekleyen işi göstersin; sayaç yalnızca okunmamışı saysın · etki 4/5 · orta · sunucu
- Mesajlar: 'Yanıt bekleyen' kutusu, bekleme süresi ve AI sohbetlerinin arşivi · etki 4/5 · orta · sunucu
- Ekipçe ortak, değişkenli hızlı yanıtlar (sohbet ve geri bildirim) · etki 3/5 · orta · sunucu
- Devirde dürüst bekleme mesajı ve bekleyen talepte telefona uyarı · etki 4/5 · orta · sunucu
- Müşteri profili: tek zaman çizelgesi ve 'Açık konular' şeridi · etki 4/5 · orta · sunucu
- Profil, sohbet ve geri bildirimden siparişe tek tıkla, kesin geçiş · etki 3/5 · küçük
- Eksik ürüne tek dokunuşla muadil önerisi ve hazır müşteri mesajı · etki 3/5 · orta
- Aynı müşterinin birden çok aktif siparişi kartta görünsün, birlikte gitsin · etki 3/5 · orta
- Genel bakış ve analizdeki sayılardan filtreli listeye tek dokunuş · etki 3/5 · küçük
- Telefonda Genel bakış: sıfırları topla, iş gerektiren kartları üste al · etki 2/5 · küçük
- Menüyü günlük işe göre düzenle: 'Bugün' grubu, tek 'Ürün ekle', ayrı 'Bakım' · etki 2/5 · küçük

### 4. Ürün ve fiyat

Katalog bakımını hızlandıran ve fiyat kararını veriye bağlayanlar.

- Listede satış ve tükenme bilgisi: '30 günde 42 adet', 'kaç gündür tükendi' · etki 4/5 · orta · sunucu
- Ürünler ekranına 'Dikkat' şeridi: sorunlu ürünleri tek tıkla bul ve düzelt · etki 3/5 · küçük
- Toplu fiyatta tam önizleme ve yuvarlama; fiyat bekçisinde seçip toplu uygula · etki 4/5 · orta · sunucu
- Fiyat bekçisi müşterinin ödediği fiyatla kıyaslasın (indirim, flaş, haftalık) · etki 3/5 · küçük · sunucu
- Haftalık fırsatı ve müşteri fiyatını satırda göster; flaşla çakışmayı uyar · etki 3/5 · küçük
- Yeni üründe 'katalogda var' uyarısı ve 'Benzerini ekle' ile kopyalayarak ekleme · etki 3/5 · küçük
- Ürün çekmecesi: sekmeler, kayıp değişiklik uyarısı, j/k geçiş, açıklama düzenleme · etki 3/5 · orta · sunucu
- Görselsiz ürünlere internetten görsel bul (fotoğrafla ekle motoruyla) · etki 3/5 · orta

### 5. Kampanya ve kâr

Hangi kampanyanın kazandırdığını, hangisinin marjı erittiğini gösterenler.

- Kampanya merkezi: şu an yayında olanlar, 14 günlük takvim, maliyet ve getiri · etki 3/5 · orta · sunucu
- Haftalık fırsat ve flaş indirimlerin satış etkisini göster · etki 4/5 · orta · sunucu
- İndirim maliyeti paneli: kupon, flaş, haftalık fırsat ve ürün indirimi · etki 4/5 · büyük · sunucu
- Aynı üründe çakışan fırsatları ve rafta satılamayan ürünleri uyar · etki 4/5 · orta · sunucu
- Kuponlarda marj koruması: indirimli ürünü hariç tut, tavan, en kötü maliyet · etki 3/5 · orta · sunucu
- Fırsat fiyatı girerken kâr/zarar göster (kategori marjı veya alış fiyatı) · etki 3/5 · orta · sunucu
- Haftalık fırsatları önceden planla, geçen haftayı kopyala, toplu ekle · etki 4/5 · orta · sunucu
- Bildirim: bölgeye göre gönder, ileri saate planla, 72 saatte sonucunu gör · etki 4/5 · büyük · sunucu
- Süzgeçten eyleme: seçili kişilere ya da tek müşteriye bildirim ve kupon · etki 4/5 · orta · sunucu
- Kupon listesini ayır: kampanya kuponları ve otomatik/kişiye özel kuponlar · etki 3/5 · küçük · sunucu
- Vitrin görsellerine yayın takvimi: kendiliğinden başlasın ve bitsin · etki 3/5 · orta · sunucu
- Davet ödüllerini panelden ayarla, programın gerçek maliyetini göster · etki 3/5 · orta · sunucu
- Telafi döngüsü: önce müşteri geçmişi, sonra kupon ve geri dönüş takibi · etki 3/5 · orta · sunucu
- Kampanya ekranlarından siparişe, müşteriye ve ürüne tek tıkla geç · etki 2/5 · küçük
- Kampanya ekranlarında “siz” dili ve ortak bileşenlerle tutarlılık · etki 2/5 · küçük

### 6. Raporlar

Ay sonu ve sezon kararları için.

- Geçmiş ay seçimi ve tek tıkla ay sonu raporu (yazdır + CSV) · etki 4/5 · orta · sunucu
- “Geçen yıl aynı dönem” karşılaştırması (öğrenci sezonuna uygun) · etki 3/5 · orta · sunucu
- Yükselen/düşen ürünler ve kategoriler, olası nedeniyle birlikte · etki 3/5 · orta · sunucu
- Gün × saat yoğunluk haritası: vardiya ve bildirim saati planı · etki 3/5 · orta · sunucu
- Kâr tahmini: sunucuda marj, indirim etkisi, teslimat ücreti ve kurye maliyeti · etki 3/5 · orta · sunucu
- Bekleyen destekler: KPI'lar kapananları da saysın, 'Çözülenler' görünümü · etki 2/5 · küçük · sunucu
- Memnuniyet raporu: 'address' yerine bölge adları ve kurye kırılımı · etki 2/5 · küçük · sunucu
- İşlem kayıtları: kayıttan ürüne git, büyük fiyat farkını işaretle, geri al · etki 2/5 · orta · sunucu

### 7. Büyük işler

Değerli ama birkaç günlük işler; yukarıdakilerden sonra.

- Barkodu ürüne kaydet: barkodla ara, telefon kamerasıyla okut, stoğu değiştir · etki 3/5 · büyük · sunucu
- Alış fiyatı ve marj: zarar ettiren fiyat, indirim ve flaşa uyarı · etki 3/5 · büyük · sunucu
- CSV ile toplu güncelleme: Excel'de düzelt, önizlemeyle geri yükle · etki 2/5 · büyük · sunucu
- Personel rolü ve oturum kontrolü: yalnız sipariş yetkisi, tüm cihazlardan çıkış · etki 3/5 · orta · sunucu
- Gün sonu kaydedilsin: kasa farkı geçmişi ve kuryeden nakit teslim alma · etki 3/5 · orta · sunucu
- Yeni/Fiş/Toplandı işaretleri cihazlar ve alarm telefonlarıyla ortak olsun · etki 3/5 · orta · sunucu
- Kapıda tahsilat kaydı: yöntem değişince düzelt, havale gelince işaretle · etki 3/5 · orta · sunucu
- Ekranları ihtiyaç anında yükle; 1,7 MB'lık tek paket yerine ekran başına parça · etki 2/5 · orta
- KVKK başvurusu: hesap eşleştirme, veri dökümü, silme ve yanıt kaydı · etki 2/5 · orta · sunucu
- Hesap işlemlerinde güvenlik: aktif siparişte silme engeli, etki özeti · etki 3/5 · orta · sunucu
- Fotokopi dosyaları teslimden sonra süreli silinsin (KVKK), toplu temizlik · etki 3/5 · orta · sunucu
- Asistan bilgileri: cevaplanamayan sorular, 'Soruyu dene' kutusu ve tek AI ayarı · etki 3/5 · orta · sunucu

## 3. Bölüm bölüm tüm öneriler

### Siparişler

#### Müşteri iptal edince sesli ve kalıcı uyarı; kart sessizce kaybolmasın

Etki 5/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Müşteri uygulamadan iptal ettiğinde (yalnızca Hazırlanıyor'da mümkün) sunucu adminRoom'a 'Müşteri siparişi iptal etti: ‹neden›' mesajlı orderStatusUpdated olayı yolluyor. Bu olay zil akışına yazılmıyor, AdminPage onu dinlemiyor. Siparişler ekranı mesajı okumuyor, listeyi sessizce yeniliyor. Kart Hazırlanıyor şeridinden ve açık Toplama listesinden sessizce düşüp varsayılan olarak kapalı 'Bugün tamamlanan' bölümüne gidiyor. Ses de kalıcı uyarı da yok. O sırada 5 sn'lik 'Yola çıkar' penceresi açıksa yalnızca kısa süreli bir hata bildirimi çıkıyor. Fişin bu cihazda basıldığı ve toplama ilerlemesi biliniyor ama personele söylenmiyor. Detay çekmecesi o siparişte açıksa üstte 'Müşteri iptal etti: ‹neden›' zaten yazıyor.

**Öneri:** orderStatusUpdated hangi ekran açık olursa olsun AdminPage'de dinlenir. newStatus 'İptal Edildi' ise ve mesaj 'Müşteri siparişi iptal etti' ile başlıyorsa: (1) Yeni sipariş sesinden farklı, kısa bir uyarı sesi çalar. (2) Kendiliğinden kapanmayan kırmızı bir şerit çıkar: '#AB12CD müşteri tarafından iptal edildi · Neden: Fikrimi değiştirdim'. Altında bu cihazdaki bilgiye göre satırlar yer alır: 'Fiş 21:14'te basıldı, fişi ayırın', '3/5 ürün toplandı, ürünleri rafa geri koyun', 'Kurye Ali'ye atanmıştı, haber verin'. Şeritte 'Siparişi aç' ve 'Tamam, ilgilendim' düğmeleri bulunur, birden çok iptal tek şeritte listelenir. (3) Toplama listesi açıkken iptal edilen siparişin satırları kaybolmaz, üstü çizili ve 'İptal edildi' yazılı olarak kalır. (4) Sunucu bu olayı notifyAdmins ile zil akışına da yazar (iptal türü). Böylece diğer cihazlarda ve panel sonradan açıldığında da görünür. Kartı Hazırlanıyor şeridinde tutmaya gerek yoktur.

**Neden önemli:** Akşam yoğunluğunda iptal edilmiş siparişin hazırlanıp yola çıkmasını, boşa kurye yolunu ve kapıda tartışmayı önler; toplanan ürünler rafa döner. Personelin şans eseri fark etmesine bırakılan bir olay ekranın sorumluluğuna geçer.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/ordersAnalytics.controller.js:1065-1084`
- `frontend/src/components/orders/useOrdersData.js:1398-1402`
- `frontend/src/pages/AdminPage.jsx:533-539`
- `frontend/src/components/orders/OrdersScreen.jsx:115`
- `frontend/src/components/orders/OrdersScreen.jsx:174-188`
- `frontend/src/components/orders/shared.js:1146-1165`
- `frontend/src/components/orders/shared.js:1196-1221`

</details>

#### Gecikme, bölgenin müşteriye söz verdiği süreye göre ölçülsün

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Gecikme sınırı tek bir tablo: hazırlıkta 10/20 dk, yolda 15/25 dk. Yurt ve Devrek siparişleri aynı ölçülüyor, aciliyet sıralaması da buna dayanıyor. 'Geciken' KPI notu sabit. Bölgenin müşteriye gösterilen süresi (etaText) 40 karakterlik serbest metin olduğundan ölçülemiyor. Devrek planındaki pilot bitiş ölçütü 'siparişlerin en az %90'ı söz verilen sürede teslim', ama bu oran panelde hiçbir yerde hesaplanmıyor. Siparişler ekranı bölgelerin açık/kapalı durumunu göstermiyor.

**Öneri:** Her bölgeye sayısal 'Hedef teslim süresi (dk)' alanı eklenir. etaText müşteriye gösterilen metin olarak kalır; Teslimat bölgeleri ekranında ikisi çelişirse uyarı çıkar. Sipariş anında hedef, siparişteki bölge kopyasına (deliveryZone) yazılır; böylece hedef sonradan değişse de geçmiş bozulmaz. Panel gecikmeyi bu hedefe göre ölçer, hedef yoksa bugünkü tabloyu kullanır. Kartta 'Söz 21:40 · 8 dk kaldı' yazar, süre aşılınca 'Gecikti' olur; aciliyet söze kalan süreye göre sıralanır. Gün sonunda ve Genel bakışta bölge bazında 'Söz tutma: %92' gösterilir. Geciken sayısı eşiği aşınca Şimdi'de öneri çıkar: 'Yoğunluk var · [Devrek'i durdur]'. Bu, mevcut bölge güncelleme ucuyla ve kapanma nedeni seçilerek çalışır. Otomatik yeniden açma zamanlayıcısı ve etaText'i sayıdan üretmek ilk sürümde yer almaz.

**Neden önemli:** Devrek adres siparişleri yurttan uzun sürecek: sabit 20/25 dk ile ya her şey 'gecikmiş' görünür ya da gerçek gecikme gözden kaçar. Sahip müşteriye verilen sözü yönetir, yoğunlukta ekran değiştirmeden önlem alır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/shared.js:341-345`
- `frontend/src/components/orders/shared.js:368-382`
- `frontend/src/components/orders/shared.js:732-742`
- `frontend/src/components/orders/OrdersKpis.jsx:213`
- `backend/models/deliveryZone.model.js:52-53`
- `backend/models/deliveryZone.model.js:60`
- `backend/routes/delivery.route.js:40`

</details>

#### Teyit edilmemiş ilk sipariş, aranmadan yola çıkarılamasın

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Bölgede ilk sipariş teyidi açıksa kartta 'Teyit için ara' rozeti, üstte kırmızı 'N sipariş teyit bekliyor' şeridi, çekmecede 'Arandı, teyit edildi' kutusu, kurye fişinde 'TEYİT İÇİN ARA' var. Bunların hepsi yalnızca hatırlatma. Kartın 'Yola çıkar' düğmesi, 'e' kısayolu, Pano'da taşıma, 'Hepsini yola çıkar', 'Hazır olanları yola çıkar' ve toplu çubuk teyitsiz siparişi soru sormadan ilerletiyor. Onay yalnızca iptal, geri alma ve 10'dan fazla siparişte çıkıyor. Sunucudaki update-status, bulk-status ve alarm telefonunun durum ucu teyidi denetlemiyor. Hazırlık başında basılan sipariş fişinde teyit uyarısı yok, yalnızca 'İLK SİPARİŞ' yazıyor; teyit ise ilk sipariş olmayan müşteride de gerekebilir. Alarm telefonu özetinde adres yalnızca 'mahalle · sokak No · Devrek'. Kat/daire, bina adı, tarif, konum ve teyit bilgisi yok.

**Öneri:** Teyit bekleyen siparişte kartın ana düğmesi 'Önce ara' olur (dokununca arama açılır), 'Arandı, teyit edildi' denince 'Yola çıkar'a döner. Tekli ilerletmede ('e' ve Pano dahil) kısa bir soru çıkar: 'İlk sipariş henüz teyit edilmedi' · [Arandım, teyit et ve yola çıkar] [Yine de yola çıkar] [Vazgeç]. Toplu düğmeler teyitsizleri atlar ve '2 sipariş teyit beklediği için yola çıkarılmadı · Göster' der. Sunucu, teyitsiz siparişin Hazırlanıyor'dan ileri geçişini 'force' bayrağı olmadan 409 ile reddeder. Bu 409, mevcut durum çakışmasıyla karışmasın diye ayrı bir neden kodu taşır. 'Yine de' seçimi bayrakla gider ve işlem kaydına 'teyitsiz yola çıkarıldı' yazılır. Alarm telefonu teyitsiz siparişi ilerletemez; mevcut uygulama 409 mesajını zaten gösteriyor. Sipariş fişine 'TEYİT İÇİN ARA' satırı eklenir. Hemen yapılabilecek ayrı bir küçük iş (S): alarm telefonu özetindeki mevcut address ve note metinlerine kat/daire, bina adı, tarif ve 'TEYİT İÇİN ARA' eklenir. Bu, uygulama güncellemesi olmadan telefonda görünür. Harita bağlantısı gibi yeni alanlar ise Android uygulamasının yeni sürümünü gerektirir.

**Neden önemli:** Teyit kuralı Devrek'e açılışın güvenlik kemeri; bugün ekranda yazıyor ama tek tıkla atlanıyor. Sahte ya da yanlış adresli ilk siparişlerde boşa kurye yolu ve kayıp ürün önlenir; kuralı hatırlamak personelin değil ekranın işi olur.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/drawer/DeliveryOps.jsx:44-50`
- `frontend/src/components/orders/shared.js:851-896`
- `frontend/src/components/orders/useOrdersData.js:955-986`
- `frontend/src/components/orders/QueueView.jsx:113-118`
- `frontend/src/components/orders/QueueView.jsx:447-451`
- `frontend/src/components/orders/OrdersScreen.jsx:465-469`
- `frontend/src/components/orders/OrdersScreen.jsx:814-831`
- `backend/controllers/ordersAnalytics.controller.js:573-618`
- `backend/controllers/orderAlarm.controller.js:129-149`
- `backend/services/orderAlarm.service.js:78-111`

</details>

#### Devrek siparişleri mahalleye göre gruplansın, aynı adrese gidenler birleşsin

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** 'Bölgeye göre grupla' bölge kimliğine göre çalışıyor, tüm Devrek adres siparişleri tek 'Devrek' grubuna düşüyor. Mahalle bilgisi siparişte var (fiş ve kurye fişinde yazıyor) ama gruplama ve çipler kullanmıyor. Mahalle uygulamada serbest metin olarak giriliyor (en çok 60 karakter); aynı mahalle farklı yazımlarla gelebilir. Adresli sipariş bayrağı henüz kapalı, pilotun başında hacim düşük olacak.

**Öneri:** Gruplama açıkken Devrek grubu mahalle alt bölümlerine ayrılır ('Cumhuriyet Mah. · 3 sipariş · Nakit ₺520') ve sipariş sayısına göre sıralanır. Gruplama anahtarı, mahalle adı Türkçe küçük harfe çevrilip 'Mah./Mahallesi' eki atılarak üretilir (neighborhoodLabel eki zaten atıyor). Mahallesi olmayan eski siparişler 'Mahalle yok' altında toplanır. Her alt bölümde mevcut grup eylemleri bulunur: Hepsini yola çıkar, Toplama listesi, Fişleri yazdır, Kurye fişi. Devrek çipi seçiliyken ve en az iki mahalle varsa altında mahalle çipleri çıkar. 'Aynı adres' rozeti sonraya bırakılır; aynı müşterinin birden çok aktif siparişi ayrı bir fikir olarak ele alınıyor.

**Neden önemli:** Devrek'e açılınca rota mahalleye göre kurulur; sahip tek bakışta 'Cumhuriyet'e 3 paket hazır' görür, aynı yöne gidenleri tek seferde yollar. Her akşam yol ve süre kazancı.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/shared.js:220-223`
- `frontend/src/components/orders/shared.js:1069-1085`
- `backend/models/deliveryZone.model.js:3-12`
- `frontend/src/lib/orderTools.js:86-101`
- `frontend/src/components/orders/QueueView.jsx:82-145`

</details>

#### Aynı müşterinin birden çok aktif siparişi kartta görünsün, birlikte gitsin

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: hayır

**Şu an:** Sunucu yalnızca 2 dk içindeki birebir aynı siparişi engelliyor; unutulan ürün için verilen ikinci sipariş ayrı kart olarak geliyor. Ekran müşteri dizinini kuruyor ama yalnızca detay çekmecesindeki 'Diğer siparişleri' bölümünde kullanıyor; kartlarda, toplama listesinde ve kurye fişinde 'bu müşterinin başka aktif siparişi var' bilgisi yok.

**Öneri:** Kartta '+1 aktif sipariş (#CD34EF)' çipi çıkar; dokununca diğer siparişe gider. Birini yola çıkarırken 'Ayşe'nin #CD34EF siparişi de hazırlanıyor · [Birlikte yola çıkar] [Yalnız bunu]' sorusu çıkar. Toplama listesinde aynı müşterinin siparişleri yan yana, kurye fişinde tek durakta birleşik tutarla ('2 sipariş · Nakit ₺310') basılır.

**Neden önemli:** Yurtta 'bir şey unuttum' siparişi sık; iki ayrı kurye yolu ya da birinin geride kalması önlenir, kapıda tek tahsilat yapılır.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/cart.controller.js:488-494`
- `frontend/src/components/orders/OrdersScreen.jsx:154`
- `frontend/src/components/orders/OrdersScreen.jsx:297`
- `frontend/src/components/orders/QueueCard.jsx:50-77`
- `frontend/src/components/orders/drawer/CustomerPanel.jsx:76-101`
- `frontend/src/lib/orderTools.js:1049-1081`

</details>

#### Eksik ürüne tek dokunuşla muadil önerisi ve hazır müşteri mesajı

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: hayır

**Şu an:** Rafta olmayan ürün için personel satırı çıkarıyor (geri alınabilir bildirim), 'Ekle'ye gidip muadili adıyla arıyor, adedi giriyor, sonra 'Sipariş değişti' şeridinden WhatsApp'a ve 'Ürünü tükendi işaretle'ye basıyor. Çıkarma ve ekleme ayrı istekler, ayrı geri almalar; hazır mesaj 'X çıkarıldı, Y eklendi' diyor, 'yerine' demiyor. Ekleme paneli yalnızca yazılan metne göre arıyor, aynı kategoriden öneri sunmuyor.

**Öneri:** Hazırlanıyor siparişinde her satıra 'Yok' menüsü gelir: 'Çıkar' ve 'Muadille değiştir'. Değiştir; aynı kategoriden, stokta ve görünür ürünleri fiyat farkına göre sıralı 5 öneri olarak gösterir ('+₺2,50', '−₺1,00'), altında arama kutusu durur. Seçince aynı adetle tek işlemde çıkar + ekle yapılır, tek 'Geri al' çıkar; değişiklik günlüğüne 'yerine' kaydı düşer. Hazır mesaj: 'Kakaolu süt kalmamıştı, yerine Pınar Kakaolu Süt koyduk (+₺2,50). İstemezsen yaz, çıkaralım.' 'Ürünü tükendi işaretle' kutusu varsayılan açık gelir.

**Neden önemli:** Akşam yoğunluğunun en sık aksaklığı 6–7 adımdan 2 adıma iner. Müşteri kapıda sürprizle karşılaşmaz, sepet tutarı korunur, katalogdaki stok da aynı anda düzelir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/drawer/OrderItems.jsx:82-86`
- `frontend/src/components/orders/OrderDrawer.jsx:644-676`
- `frontend/src/components/orders/AddItemPanel.jsx:74-89`
- `frontend/src/components/orders/useOrdersData.js:1102-1149`
- `frontend/src/components/orders/shared.js:1301-1308`
- `frontend/src/components/orders/shared.js:1334-1338`

</details>

#### Gün sonu kaydedilsin: kasa farkı geçmişi ve kuryeden nakit teslim alma

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Gün sonu çekmecesi beklenen nakdi, kurye bazında tahsilatı ve 'Sayılan nakit' alanını gösteriyor ama sayım kaydedilmiyor (çekmece de bunu söylüyor); yalnızca yazdırılan kâğıtta kalıyor. Geçmiş günlerin kasa farkı ve günü kimin kapattığı tutulmuyor. Hesap yalnızca uygulama siparişlerinin teslimat nakdini kapsıyor, mağaza içi satışlar dahil değil.

**Öneri:** Çekmecenin altına 'Günü kapat' düğmesi eklenir. İş gününün özeti sunucuya tek kayıt olarak yazılır: sipariş, ciro, ödeme dağılımı, beklenen ve sayılan nakit, fark, POS toplamı, isteğe bağlı POS cihazının gün sonu tutarı, not ve kapatan kişi. Aynı gün yeniden kapatılırsa kayıt güncellenir ve işlem kaydına düşer. 'Geçmiş günler' sekmesinde son 30 gün, fark rozetleri ve 30 günlük toplam fark görünür. Kurye için 'nakdi teslim aldım' tikleri, önceki gün kapatılmadıysa çıkan şerit ve 24 saatlik düzeltme kuralı, birden çok kurye nakit taşımaya başlayınca eklenir. Ekranda adı 'Teslimat kasası' olur, mağaza kasasıyla karışmaz.

**Neden önemli:** Kasa açıkları ve kurye nakdi takip edilebilir olur; personel değişse de geçmiş kaybolmaz. Devrek'te birden çok kuryenin nakit taşıması güvenle yönetilir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/DayCloseDrawer.jsx:1-4`
- `frontend/src/components/orders/DayCloseDrawer.jsx:76`
- `frontend/src/components/orders/DayCloseDrawer.jsx:243-276`
- `frontend/src/components/orders/DayCloseDrawer.jsx:278-307`
- `frontend/src/lib/orderTools.js:940-1027`

</details>

#### Kapıda tahsilat kaydı: yöntem değişince düzelt, havale gelince işaretle

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Ödeme yöntemi sipariş anında yazılıyor; panelde değiştirecek bir uç ya da düğme yok. Kapıda yöntem değişirse (karttan nakde ya da tersi) gün sonundaki beklenen nakit, POS toplamı ve kurye bazında tahsilat yanlış çıkıyor, kasa farkı da yanlış görünüyor. Havale/EFT siparişinde yalnızca 'ödemenin hesaba geçtiğini kontrol edin' hatırlatması var. 'Geldi' diye işaretlenemiyor, başka cihazdaki kişi ödemenin kontrol edildiğini bilmiyor.

**Öneri:** 'Teslim et' adımına seçim eklenmez. Bunun yerine çekmecede 'Ödeme yöntemini düzelt' (Nakit / Kart / Havale) bulunur. Yeni bir yönetici ucu yöntemi değiştirir, işlem kaydına 'Kart → Nakit' yazar ve orderUpdated ile diğer cihazlara yansıtır. Gün sonu ve kurye satırları zaten bu alanı okuduğu için kendiliğinden düzelir; gün sonunda 'Yöntemi sonradan değişen (2)' notu çıkar. Havale siparişinde 'Ödeme hesaba geçti' anahtarı olur (kim, ne zaman). Kartta 'Havale · onaylandı' ya da 'Havale · bekliyor' yazar; onaylanmamış Havale siparişi yola çıkarılırken kısa bir soru çıkar.

**Neden önemli:** Kasa sayımındaki farkın gerçek açık mı, yöntem değişikliği mi olduğu ayrılır; sahip her gece elle düzeltme hesabı yapmaz. Havalede parası gelmeden yola çıkma hatası önlenir.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/cart.controller.js:586-589`
- `backend/routes/ordersAnalytics.route.js:175-205`
- `frontend/src/lib/orderTools.js:776-807`
- `frontend/src/components/orders/OrderDrawer.jsx:637-643`
- `frontend/src/components/orders/QueueView.jsx:48-53`
- `frontend/src/components/orders/DayCloseDrawer.jsx:246-266`

</details>

#### Kuryeye teslim tek adım: yola çıkarırken kurye seç, rotayı WhatsApp'la gönder

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: hayır

**Şu an:** 'Yola çıkar' yalnızca durumu değiştiriyor; kurye ataması ayrı yerde (çekmecedeki seçim ya da toplu çubuktaki menü). Atanmadan yola çıkan siparişler gün sonunda 'Atanmamış' satırına düşüyor ve kurye bazında nakit güvenilmez oluyor. Kurye fişi yalnızca yazdırılıyor, en eskiden yeniye sıralı ve harita bağlantısı yok. Kurye telefonu ayarlarda var ve ekrana yükleniyor ama Siparişler ekranında hiç kullanılmıyor.

**Öneri:** Aktif kurye varken kuryesiz siparişte 'Yola çıkar' bölünmüş düğme olur: ana kısım son kullanılan kuryeyle yola çıkarır ('Ali ile yola çıkar'), ok kısmı diğer kuryeleri listeler. Tek aktif kurye varsa otomatik atanır, geri alma bildiriminde 'Kurye: Ali · Değiştir' yazar. Grup ve toplu 'Hepsini yola çıkar' bir kez kurye sorar. Kurye fişi menüsüne ve atamadan sonra 'WhatsApp ile kuryeye gönder' gelir: kuryenin numarasına mahalleye göre sıralı tek mesaj; her durak için #kod, ad, telefon, adres + kat/daire, tarif, harita bağlantısı ve 'NAKİT ₺245,50 / POS / Havale'; sonda toplam nakit. Kurye telefonu kayıtlı değilse 'Kopyala' ve Teslimat bölgelerine bağlantı çıkar.

**Neden önemli:** Kuryeye verme 3–4 adımdan bire iner; kurye adres yazmak yerine haritayı tek dokunuşla açar; gün sonundaki kurye bazında nakit doğru çıkar. Devrek'teki her adres siparişinde dakika kazandırır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/atoms.jsx:337-343`
- `frontend/src/components/orders/drawer/DeliveryOps.jsx:86-130`
- `frontend/src/components/orders/BulkBar.jsx:89-103`
- `frontend/src/components/orders/useCouriers.js:7-9`
- `frontend/src/components/orders/OrdersHeader.jsx:79-85`
- `frontend/src/components/orders/OrdersScreen.jsx:548-561`
- `frontend/src/lib/orderTools.js:1039-1101`
- `frontend/src/lib/orderTools.js:793-799`

</details>

#### Panelden iptalde neden seçilsin, müşteriye nedenli bildirim gitsin

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Panelden 'İptal et' (tekli, toplu, Pano) yalnızca onay istiyor, neden sormuyor. update-status yalnızca orderId, status ve expectedStatus kabul ediyor. Nedenli panel iptali yalnızca 'Teslim edilemedi' akışında var (adres bulunamadı, ulaşılamadı, teslim almadı, diğer); bu akışta müşteriye 'Siparişin teslim edilemedi: ‹neden›' bildirimi gidiyor. Diğer panel iptallerinde müşteriye nedensiz 'Siparişiniz iptal edildi…' gidiyor. Durum bildirimlerinin tamamı siz dilinde, yalnızca teslim edilemedi bildirimi sen dilinde. Gün sonunda yalnızca iptal sayısı ve tutarı var. CSV'de müşterinin iptal nedeni sütunu yok, oysa bu veri liste yanıtında mevcut.

**Öneri:** İptal onayı neden seçilen küçük bir forma döner: Ürün kalmadı · Müşteri telefonda vazgeçti · Teyit için ulaşılamadı · Mükerrer sipariş · Diğer (+ not). Toplu iptalde tek neden hepsine uygulanır. Neden, müşterinin cancelReason alanından ayrı bir alana yazılır (kod, not, kim, ne zaman); böylece Geri bildirim raporundaki müşteri iptal nedenleri karışmaz. Müşteri bildirimi nedene göre ve sen diliyle gider; STATUS_MESSAGES'taki tüm durum bildirimleri de sen diline geçer. 'Ürün kalmadı' seçilince hangi ürün olduğu sorulur ve ürün tek dokunuşla tükendi işaretlenir. Neden kartta, zaman çizelgesinde ve Liste'de görünür. Gün sonunda 'Müşteri iptali / Panel iptali' ayrımı ve neden dağılımı yer alır. CSV'ye hem müşteri hem panel nedenini içeren 'İptal nedeni' sütunu eklenir.

**Neden önemli:** Sahip iptallerin stoktan mı, adresten mi, müşteriden mi geldiğini görür ve doğru yere müdahale eder. Müşteri nedenini öğrenir, destek sohbetine 'neden iptal oldu' diye yazmaz; uygulama dili tutarlı olur.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/shared.js:855-871`
- `backend/controllers/ordersAnalytics.controller.js:573-575`
- `backend/models/order.model.js:131-134`
- `backend/services/orderStatusNotifier.js:6-11`
- `frontend/src/components/orders/DayCloseDrawer.jsx:207-210`
- `frontend/src/lib/orderTools.js:573-577`

</details>

#### Yeni/Fiş/Toplandı işaretleri cihazlar ve alarm telefonlarıyla ortak olsun

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Yeni, Fiş ve Toplandı işaretleri yalnızca tarayıcı deposunda tutuluyor. Panelde siparişi açmak ya da 'Gördüm' demek alarm telefonlarını susturmuyor, çünkü onay ucu yalnızca cihaz anahtarıyla çalışıyor. Telefonda 'Kabul Et' denmesi kartta görünmüyor, yalnızca Genel bakıştaki 'Son onaylar' listesinde. Sipariş listesi yanıtında onay, fiş ya da toplama bilgisi yok. Telefonlar, sipariş Hazırlanıyor'dan çıkana ya da bir telefonda onaylanana kadar çalıyor.

**Öneri:** İlk adım: panelde siparişi açmak ya da 'Gördüm' demek, sunucuya bir yönetici onayı yazar (mevcut onay koleksiyonu, cihaz adı 'Panel · ‹kullanıcı›'). Bu onay telefonları susturur. Sipariş listesi yanıtına onay bilgisi eklenir. Kartta 'Kasa telefonunda kabul · 21:14' ya da 'Kimse görmedi' yazar; 'Yeni' rozeti sunucudaki onaya dayanır ve orderUpdated ile diğer cihazlara anında yansır. İkinci adım: 'Fiş basıldı' bilgisi (kim, ne zaman) sunucuya yazılır, böylece 'Yazdırılmamış' sayısı her cihazda aynı olur. Satır satır toplama işaretlerinin eşitlenmesi ilk sürümde yapılmaz, cihaza özel kalır.

**Neden önemli:** Sahip, personel ve alarm telefonlarıyla çalışan ekipte 'bakan oldu mu, fiş basıldı mı, toplandı mı' sorusu sözlü sorulmadan ekranda yanıtlanır; çift fiş, unutulan sipariş ve yanlış 'Hazır' kararları azalır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/orders/shared.js:799`
- `frontend/src/components/orders/shared.js:1136-1221`
- `frontend/src/components/orders/QueueView.jsx:368-372`
- `frontend/src/components/orders/QueueView.jsx:432-435`
- `frontend/src/components/orders/QueueView.jsx:447-451`
- `backend/services/orderAlarm.service.js:185-225`
- `backend/routes/orderAlarm.route.js:23`
- `frontend/src/components/OrderAlarmDevicesCard.jsx:81-90`
- `backend/controllers/ordersAnalytics.controller.js:280-326`

</details>

#### 'Siparişi incele' gerçekten o siparişi açsın

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Yeni sipariş bildirimindeki 'Siparişi incele' düğmesi, tarayıcı bildirimine tıklama ve zildeki sipariş satırı yalnızca Siparişler sekmesine geçiyor, ilgili siparişi açmıyor. Şimdi görünümünde yeni sipariş, aciliyet sıralaması nedeniyle Hazırlanıyor şeridinin altına düşüyor. Oysa ekranlar arası aktarım (HANDOFF.order) hazır; Genel bakış ve komut paleti siparişi doğrudan açıyor.

**Öneri:** Üç girişte de setHandoff(HANDOFF.order, sipariş kimliği) yapılıp Siparişler'e geçilsin. Detay çekmecesi o siparişle açılsın ve 'Yeni' işareti kalksın.

**Neden önemli:** Akşam yoğunluğunda bildirimden siparişe tek tıkla geçilir, doğru kartı aramak gerekmez. Düğme, adının söylediği işi yapar.

<details><summary>Kod kanıtı</summary>

- `frontend/src/pages/AdminPage.jsx:500-506`
- `frontend/src/pages/AdminPage.jsx:524-528`
- `frontend/src/pages/AdminPage.jsx:755`
- `frontend/src/components/DashboardWidgets.jsx:332`
- `frontend/src/components/orders/OrdersScreen.jsx:749-768`
- `frontend/src/components/orders/shared.js:732-742`

</details>

### Genel bakış, Satış analizi, Teslimat bölgeleri

#### Herkese açmadan önce hazırlık listesi ve pilot karnesi

Etki 5/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru. Ek bağlam: açılış için yapılacaklar docs/devrek-teslimat-plani.md:17-21'de yazılı. Bunlar sınırı yüklemek; Devrek ücretini, eşiğini, minimumunu ve süresini girmek; önce pilot sonra herkese açmak ve 7.1.0 sürümüne zorunlu güncellemeyi çekmek. Pilot bitiş ölçütü de :128'de yazılı: siparişlerin en az %90'ı söz verilen sürede teslim edilmeli, “adres bulunamadı” %3'ün altında kalmalı ve yanlış ücret alınmamalı. Panel bunların hiçbirini toplu olarak denetlemiyor. Uygulamanın zorunlu güncelleme sürümü (appVersion.minimumVersion, varsayılan 4.0.3) de anahtarla ilişkilendirilmemiş.

**Öneri:** Adrese teslimat kartına “Yayına hazırlık” listesi eklenir. Maddeler plandaki açılış listesiyle birebir aynıdır:
- Genel Devrek açık
- Teslimat alanı yüklü
- Ücret, eşik ve minimum bilinçli girilmiş (0 TL ise sarı uyarı: “Devrek'te teslimat ücretsiz olacak”)
- Tahmini süre yazılı
- İlk sipariş teyidi açık
- En az 1 aktif kurye var
- Zorunlu güncelleme adrese teslimatı destekleyen sürümde (minimumVersion ≥ 7.1.0 ve forceUpdate açık)

Pilot karnesi plan ölçütlerini kullanır:
- Teslim edilen adres siparişi sayısı
- Söz verilen sürede teslim oranı; hedef ≥ %90 (ölçüm için zones-eta-promise-vs-actual gerekir)
- “Adres bulunamadı” oranı; hedef ‹ %3
- Alanı doğrulanmamış sipariş sayısı
- Bekleyen teyit sayısı

Her satırda ilgili karta kaydıran bir “Düzelt” bağlantısı olur. “Herkese aç” onayı karşılanmayan maddeleri listeler. Kırmızı madde varken düğme “Yine de herkese aç” olur ve ek onay ister. Pilot çiplerinde “3 sipariş · son: dün · 1 teslim edilemedi” yazar. Sunucu tarafında tek bir GET /delivery/admin/readiness uç noktası yeterli.

**Neden önemli:** Sahip Devrek'i herkese açarken en pahalı hataları (yanlışlıkla ücretsiz teslimat, doğrulanmamış adresler, kuryesiz açılış, teyitsiz ilk siparişler) yapmaz; pilotun ne zaman yeterli olduğuna veriyle karar verir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/delivery-zones/RolloutCard.jsx:94-99 (yalnızca 'açık bölge yok' ve 'pilot listesi boş' uyarısı)`
- `frontend/src/components/DeliveryZonesTab.jsx:135-145 (Herkese aç onayı: sadece açık bölge sayısı)`
- `backend/services/delivery.service.js:143-156 (DEVREK_DEFAULTS: deliveryFee 0, etaText '', requireFirstOrderCallback false)`
- `frontend/src/components/delivery-zones/DevrekAreaSection.jsx:102-109 (alan yoksa siparişler 'alan doğrulanmadı')`
- `frontend/src/components/delivery-zones/CouriersCard.jsx:84-96 ve frontend/src/components/DeliveryZonesTab.jsx:283 (kuryeler ayrı yükleniyor, RolloutCard'a gelmiyor)`
- `frontend/src/components/delivery-zones/PilotPicker.jsx:92-107 (pilot çipi: ad + telefon)`
- `backend/controllers/delivery.controller.js:461-473 (ayar yanıtında pilot sipariş bilgisi yok)`

</details>

#### Genel bakışta adil kıyas: “Bu ay” geçen ayın tamamıyla kıyaslanmasın

Etki 4/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** “Bu ay” seçilince ay başından bugüne ciro, geçen ayın TAMAMIYLA kıyaslanıyor (test de bunu sabitliyor). Ör. 2 Kasım'da 1,5 günlük ciro 31 günlük Ekim'le kıyaslanıp KPI'da ve satış kartında kırmızı “▼ %90 · geçen aya göre” görünüyor. “7 gün / 30 gün”de bu dönem 6 tam gün + bugünün geçen saatleri, önceki dönem 7 tam gün; akşamı yoğun bu işte gün içinde değişim hep eksi çıkıyor. Satış analizi ise “önceki dönemin aynı anına kadar” kıyaslıyor; iki ekran aynı “Bu ay” için farklı değişim gösteriyor.

**Öneri:** Önceki pencere aynı geçen süreye göre alınır: Bu ay → geçen ayın 1'inden aynı gün ve saate kadar; 7/30 gün → [başlangıç − N gün, şimdi − N gün]. KPI notu “geçen ayın aynı anına göre” olur. Geçen ayın tamamı ayrı ve gri bir satırda gösterilir (“Geçen ayın tamamı ₺48.200”), Satış analizindeki gibi. dashboard-summary testleri yeni pencereye göre güncellenir.

**Neden önemli:** Sahip ay başında yanlış alarm görmez; kampanya ve fiyat kararlarını gerçek değişime göre verir. İki ekran aynı rakamı söyler (“hata istemiyorum” standardı).

<details><summary>Kod kanıtı</summary>

- `backend/controllers/ordersAnalytics.controller.js:1518-1522 (7d/30d: önceki = N tam gün, bu dönem bugün dahil kısmi)`
- `backend/controllers/ordersAnalytics.controller.js:1523-1526 (month: previous = geçen ayın tamamı)`
- `backend/tests/dashboard-summary.test.js:51-54 (previous.end === month.start)`
- `frontend/src/components/DashboardWidgets.jsx:26-29 (not metni 'geçen aya göre')`
- `frontend/src/components/DashboardWidgets.jsx:727-731 ve 410-421 (KPI ve satış kartında delta)`
- `frontend/src/styles/admin-system.css:1936 (düşüş kırmızı)`
- `backend/controllers/analytics.controller.js:408-424 (Satış analizi: aynı geçen süreye göre kıyas)`

</details>

#### Bölge başına teslim süresi: söz verilen ile gerçekleşen (+ Devrek mahalleleri)

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru.

Önemli bağlam: planın pilot bitiş ölçütü “siparişlerin en az %90'ı söz verilen sürede teslim”. Ama bu oran hiçbir ekranda ölçülmüyor.

Veri kalitesi notu: teslim anı, personelin ya da alarm telefonunun durumu “Teslim Edildi”ye ilerlettiği an. Geç işaretleme süreyi şişirir.

**Öneri:** Bölgeye sayısal bir üst sınır eklenir (etaMaxMinutes):
- Hazır seçenekler 40, 60 ve 90 dk'ya eşlenir.
- Serbest metinde “A-B dk” biçimi ayrıştırılır; ayrıştırılamazsa kartta uyarı çıkar.

Bölge kartında ve Satış analizi bölge listesinde son 30 gün için şunlar gösterilir:
- Ortanca toplam süre (sipariş → son “Teslim Edildi”)
- Siparişlerin %90'ının teslim süresi
- Söz içinde teslim oranı
- Teslim edilemedi oranı
- Örnek sayısı (n ‹ 20 ise “az veri” notu)

Oran %90'ın altına düşerse sarı bir not ve süre önerisi çıkar; öneri alanı doldurur, Kaydet'le kaydedilir. Devrek mahalle kırılımı, Devrek'te sipariş hacmi oluşunca eklenir.

**Neden önemli:** Müşteriye verilen süre sözü dürüst kalır; sahip kurye ihtiyacını ve sorunlu mahalleleri Devrek büyürken erkenden görür.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/delivery-zones/ZoneCard.jsx:182-189 ve frontend/src/components/delivery-zones/shared.js:29 (serbest metin süre, hazır seçenekler)`
- `backend/controllers/analytics.controller.js:432-442 (prepMinutes: yalnızca Hazırlanıyor→Yolda)`
- `backend/controllers/analytics.controller.js:521-535 (zoneBreakdown: sipariş, ciro, ücret)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:263-264 ve 355-369`
- `frontend/src/lib/orderTools.js:755-772 ve frontend/src/components/orders/DayCloseDrawer.jsx:231-239 (yol/toplam süre yalnızca bugün)`
- `backend/models/order.model.js:99 ve 170 (mahalle ve durum geçmişi saklanıyor)`

</details>

#### Geçmiş ay seçimi ve tek tıkla ay sonu raporu (yazdır + CSV)

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru: geçmiş bir ay seçilemiyor, Genel bakışta tarih seçici yok, dönem özetlerinde ödeme yöntemi kırılımı yok ve yazdırılabilir rapor yalnızca Gün sonu'nda, bugün için var.

Düzeltme: “Geçen ayı görmenin yolu yok” ifadesi fazla. “Bu ay” seçiliyken altta geçen ayın tamamının cirosu ve sipariş sayısı görünüyor. Eksik olanlar gün, bölge, ödeme ve kategori kırılımları. Siparişler CSV'si en fazla “Son 30 gün” süzülebiliyor (orders/shared.js:585-591).

**Öneri:** Satış analizine bir ay seçici eklenir (“‹ Ekim 2026 ›”). Sunucu: /analytics/compare?period=month&month=2026-10. Geçmiş bir ay için önceki dönem, bir önceki ayın tamamıdır. Kısmi (aynı ana kadar) kıyas yalnızca içinde bulunulan ayda yapılır.

Dönem özetine ödeme yöntemi kırılımı eklenir: nakit, kart, havale ve belirtilmemiş (iptaller hariç).

“Ay sonu raporu” Gün sonu yazdırma düzeniyle tek A4 sayfa ve tek CSV olarak alınır:
- Günlük satırlar: sipariş, ürün cirosu, teslimat ücreti, kupon, iptal tutarı, nakit, kart, havale
- Ay toplamı
- Bölge ve kurye toplamları

“Geçen yıl aynı ay” sütunu YoY fikrine bırakılır.

**Neden önemli:** Ay kapanışında sahip muhasebeciye rakamları ve POS mutabakatını gün sonu fişlerini toplamadan bir dakikada hazırlar; geçen ayın performansını ay başında da görür.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/AdvancedAnalyticsTab.jsx:24-29 (yalnızca içinde bulunulan gün/hafta/ay/yıl)`
- `frontend/src/components/DashboardWidgets.jsx:25-37 (hızlı dönemler + sabit faaliyet dönemleri)`
- `backend/controllers/ordersAnalytics.controller.js:1527-1539 (custom from/to destekleniyor)`
- `frontend/src/components/orders/DayCloseDrawer.jsx:106-125 (yazdır/CSV yalnızca bugün)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:180-187 (grafik başına ayrı CSV)`
- `backend/controllers/ordersAnalytics.controller.js:1719-1766 ve backend/controllers/analytics.controller.js:452-475 (ödeme yöntemi kırılımı yok)`

</details>

#### Süreli bölge kapatma ve ücretsiz teslimat kampanyasına bitiş saati

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru: süre alanı yok, kampanya düz bir anahtar ve Genel bakış ile durum çubuğu bunları göstermiyor.

Ek olarak:
- Ayarlar'daki “Mağazayı kapat” iki yurdu birlikte kapatıyor ve bu durum da panoda görünmüyor.
- Kart “Kapanma nedeni … müşteriye gösterilir” diyor (ZoneCard.jsx:117). Ama mevcut uygulamanın yurt akışında kapalı yurt için genel “Seçilen teslimat noktası şu anda aktif değil!” mesajı dönüyor (cart.controller.js:621-625). settings.deliveryPoints'te neden alanı yok. Neden yalnızca adres akışındaki ZONE_CLOSED hatasında görünüyor (delivery.service.js:565-566).
- “Her yerde ücretsiz teslimat” yalnızca adresli siparişi etkiliyor; yurt akışında ücret hep 0. Adrese teslimat şu an kapalı.

**Öneri:** 1) Görünürlük (S): Özet uç noktasına kapalı bölgeler (ne zamandan beri kapalı, neden) ve kampanya durumu eklenir. Genel bakış dikkat şeridinde “Kapalı bölge: Erkek KYK Yurdu · 1 sa 10 dk'dır”, “Mağaza kapalı” ve “Ücretsiz teslimat açık” öğeleri görünür. Üst durum çubuğunda kırmızı ya da sarı bir çip çıkar.

2) Süreli kapatma (M): Kapatırken “30 dk · 1 saat · Yarın açılışta · Süresiz” çipleri seçilir ve bölgeye bir reopenAt değeri yazılır. Mevcut dakikalık iş (runScheduledPricingJob) süresi gelen bölgeyi açar. Yurtta deliveryPoints'i de eşler, önbelleği temizler ve işlem kaydına “otomatik açıldı” yazar. Ayarlar'dan elle açılırsa zamanlayıcı silinir. Kartta “22:40'ta açılacak · Şimdi aç” görünür.

Yurt akışındaki kapalı hata mesajı nedeni ve açılış saatini içerir. Kart metni de gerçek davranışa göre düzeltilir.

3) Kampanya bitiş saati ikinci önceliktir; Devrek herkese açılınca anlamlı olur.

**Neden önemli:** Yoğun bir akşam kapatılan yurt ertesi gün unutulup bütün gün sipariş kaçırılmaz; ücretsiz teslimat haftalarca açık kalıp marj eritmez.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/delivery-zones/ZoneCard.jsx:104-131 (aç/kapa + neden, süre yok)`
- `frontend/src/components/delivery-zones/shared.js:28 (hazır nedenler: 'geçici olarak kapalı', 'Kurye yetersizliği')`
- `backend/models/deliveryZone.model.js:52-53 (yalnızca enabled, closedReason)`
- `backend/models/settings.model.js:158 (freeDeliveryEverywhere: düz Boolean)`
- `frontend/src/components/delivery-zones/RolloutCard.jsx:107-121 (kampanya anahtarı, bitiş yok)`
- `frontend/src/components/DeliveryZonesTab.jsx:233-242 (kampanya bandı yalnızca bu sayfada)`
- `frontend/src/components/DashboardWidgets.jsx:381-388 (dikkat öğelerinde bölge/kampanya yok)`
- `frontend/src/components/admin/AdminHeader.jsx:83-92 (durum çubuğu: bağlantı, sipariş, mesaj)`
- `backend/controllers/delivery.controller.js:252-256 (yurtta açık/kapalı ayarlara eşleniyor)`
- `backend/services/flashSale.service.js:262 (node-cron zaten kullanılıyor)`

</details>

#### İndirim maliyeti paneli: kupon, flaş, haftalık fırsat ve ürün indirimi

Etki 4/5 · Efor: Büyük (3 günden fazla) · Sunucu: evet

**Şu an:** Tespitler büyük ölçüde doğru:
- Satırda originalPrice, priceSource, flashSaleId ve flashDiscountPercentage var.
- Satış analizi yalnızca kupon sayısını ve tutarını veriyor.
- Flaş, haftalık fırsat ve ürün indiriminin dönem toplamı hiçbir ekranda yok. Yalnızca sipariş çekmecesinde sipariş başına productDiscountTotal var.
- Kupon değişimi “iyi” (yeşil) sayılıyor.

Düzeltmeler:
- Satırda kategori SAKLANMIYOR: products alt şemasında yok, Mongoose atıyor.
- Fiyat bilgisi yalnızca bu alanlar eklendikten sonraki siparişlerde var. Eski siparişlerde yalnızca flaş geriye dönük tahmin ediliyor.
- Toplu flaş her ürün için ayrı bir FlashSale kaydı açıyor.

**Öneri:** Satış analizine “İndirim maliyeti” paneli eklenir. Liste fiyatıyla ürün tutarından şu kalemler düşülür: flaş −₺, haftalık fırsat −₺, ürün indirimi −₺ ve kupon −₺. Sonuç ödenen ürün cirosudur.

Panelde şunlar gösterilir:
- Her kalemin ciroya oranı ve önceki döneme göre değişimi
- Fiyat bilgisi olmayan eski satırlar ayrı bir “bilinmiyor” kalemi olarak, veri başlangıç tarihi notuyla
- “En çok indirim verilen 10 ürün”: verilen indirim, adet ve satışın yüzde kaçının indirimli olduğu

Flaş etkisi kampanya kaydı yerine ürün bazında ölçülür: flaş süresince günlük adet, flaştan hemen önceki eşit süreyle kıyaslanır. Önceki pencerede en az 5 adet satmış ürünler alınır. Toplu flaşlar tek bir özet kartında toplanır.

Kupon değişimi nötr (gri) gösterilir; kupon kullanımının artması kötü sayılmaz. Panel CSV olarak da indirilebilir.

**Neden önemli:** Sahip hangi kampanyanın gerçekten ek satış getirdiğini, hangisinin yalnızca marjı yediğini görür; iyi flaşları tekrarlar, zarar ettirenleri durdurur.

<details><summary>Kod kanıtı</summary>

- `backend/models/order.model.js:33-37 (originalPrice, priceSource, flashSaleId, flashDiscountPercentage)`
- `backend/services/order.service.js:95-111 (sipariş anında liste fiyatı, kaynak ve kategori yazılıyor)`
- `backend/controllers/analytics.controller.js:468-469 (özet yalnızca couponOrders ve couponDiscount)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:49-61 (Delta: invert verilmezse artış 'good')`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:265-266 (Kupon KPI'ı invert olmadan)`
- `backend/controllers/flashSale.controller.js:68-414 (yalnızca CRUD/bitir; satış istatistiği yok)`

</details>

#### Genel bakış ve analizdeki sayılardan filtreli listeye tek dokunuş

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Tespitler doğru.

Not: Siparişler tarih süzgeci yalnızca Tümü, Bugün, Dün, Son 7 gün ve Son 30 gün seçeneklerini sunuyor; liste de 30 günlük pencereyle yükleniyor. Bu yüzden Genel bakıştaki “Bu ay”, “Tüm zamanlar” ya da faaliyet dönemi Siparişler'e birebir aktarılamaz.

**Öneri:** Ürünler:
- Ekranlar arası aktarıma (HANDOFF) ürün filtre ön ayarı eklenir: stokta yok, görselsiz, flaş ve kategori. ProductsList bunu açılışta okur.
- Genel bakışta Stoksuz ve Görselsiz kutuları Ürünler'i süzülü açar; “Flash sale” flaş süzgeciyle açar.

Siparişler:
- Dikkat süzgecine “Teslim edilemeyenler” seçeneği eklenir; yeni ön ayarlar: failed ve zone:‹id›.
- Teslim edilemedi KPI'ı, neden ve bölge satırları ile bölge çubukları Siparişler'i süzülü açar.
- Tarih yalnızca Bugün, 7 gün ve 30 gün dönemlerinde aktarılır. Diğer dönemlerde liste “Son 30 gün” notuyla açılır.

Satış analizi:
- Ekrana onNavigate verilir.
- Ürün satırına tıklayınca ürün çekmecesi açılır.
- Kategori çubuğuna tıklayınca Ürünler o kategoriye süzülü açılır.

**Neden önemli:** Sahip sayıyı gördüğü anda işe geçer; her gün tekrarlanan arama/filtreleme adımları kalkar, teslim edilemeyen siparişlerin peşine hemen düşülür.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/DashboardWidgets.jsx:386-387 ve 627-632 (filtresiz products'a gidiş)`
- `frontend/src/components/ProductsList.jsx:356-360 (aktarım yalnızca ürün kimliği)`
- `frontend/src/components/ProductsList.jsx:790-797 (outOfStock, noImage, flash filtreleri mevcut)`
- `frontend/src/components/orders/OrdersScreen.jsx:568-578 (yalnızca active/delayed/callback)`
- `frontend/src/components/orders/shared.js:580-584 (dikkat filtresinde 'teslim edilemedi' yok)`
- `frontend/src/components/DashboardWidgets.jsx:506-521, 559-583, 726-746 (bölge/neden satırları ve KPI'lar tıklanmıyor)`
- `frontend/src/components/admin/ui/index.jsx:170-174 (KpiCard onClick desteği)`
- `frontend/src/pages/AdminPage.jsx:613-617 ve 636-637 (AdvancedAnalyticsTab'a onNavigate verilmiyor)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:433-444`

</details>

#### Sipariş satırında kategori kaydedilmiyor: çok satanlarda her ürün “Kategorisiz”

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Sipariş oluşturulurken satıra category yazılıyor; isWeeklyDiscount ve isProductDiscount da yazılıyor. Ama Order şemasının products alt şemasında bu alanlar yok ve Mongoose strict modu bunları kaydetmeden atıyor. Yerel kontrolde new Order({ products: [{ …, category: 'sut' }] }).toObject() satırında category çıkmadı.

Sonuçları:
- Satış analizindeki “En çok satan ürünler” tablosu satırdaki category'yi okuduğu için her ürünün altında “Kategorisiz” yazıyor.
- CSV'nin Kategori sütunu da her satırda “Kategorisiz”.
- “Kategoriye göre ciro” başlığı “Sipariş satırlarındaki kategori” dese de hesap her zaman ürünün bugünkü kategorisine düşüyor.

Mevcut test kategoriyi elle verilmiş bir satırla doğruladığı için hatayı yakalamıyor.

**Öneri:** order.model.js'teki products alt şemasına category: String eklenir; yeni siparişlerde sipariş anındaki kategori saklanır. topProductsBreakdown eski siparişler için kategoriyi ürün kaydından tamamlar (tek bir Product.find ya da categoryRevenue'daki gibi $lookup ile). Kalıcılık testi eklenir: Order.create sonrası satırda category olmalı. isWeeklyDiscount ve isProductDiscount zaten priceSource ile karşılandığı için buildOrderProducts'tan kaldırılır ya da şemaya eklenir.

**Neden önemli:** Satış analizindeki çok satanlar tablosu ve CSV doğru kategoriyi gösterir. Yükselen/düşen ürünler ve kategori marjı gibi sonraki analizler sağlam veriye dayanır.

<details><summary>Kod kanıtı</summary>

- `backend/services/order.service.js:109-111 (category, isWeeklyDiscount, isProductDiscount satıra yazılıyor)`
- `backend/models/order.model.js:10-45 (products alt şemasında category yok)`
- `backend/controllers/analytics.controller.js:545 (topProductsBreakdown: category: line.category || null)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:438 ve 187 (tabloda ve CSV'de categoryName(p.category))`
- `frontend/src/components/products/productUtils.js:27-31 (boş kategori → 'Kategorisiz')`
- `backend/controllers/analytics.controller.js:575 ve frontend/src/components/AdvancedAnalyticsTab.jsx:393 (satırda kategori hiç olmadığından hep ürün kaydına düşüyor)`
- `backend/tests/analytics-compare.test.js:92 (saf fonksiyon testi; kalıcılık test edilmiyor)`

</details>

#### “Bugün” gece yarısında sıfırlanıyor; Gün sonu ise iş gününü 05:00'ten sayıyor

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Genel bakış ve Satış analizinde “Bugün” Türkiye saatiyle 00:00'da başlıyor. Mağaza 01:00'e kadar açık ve yoğunluk gece saatlerinde; Gün sonu çekmecesi bu yüzden iş gününü 05:00–05:00 sayıyor.

Gece 00:00'dan sonra panodaki “Bugün” yalnızca birkaç dakikalık veri gösteriyor. Aynı vardiyanın siparişleri panoda iki güne bölünüyor ve panodaki “Bugün” cirosu Gün sonu'ndakiyle tutmuyor.

**Öneri:** “Bugün” iş günü olarak hesaplanır. Sipariş bitiş saati gece yarısını geçiyorsa gün 05:00'te başlar; Gün sonu ile aynı sabit, sunucuda tek bir yardımcıdan alınır. “Düne göre” kıyası önceki iş gününün aynı anına kadar yapılır. Saatlik seri açılış saatinden itibaren çizilir. Etiket “Bugün · iş günü 05:00'ten” olur. Satış analizindeki “Bugün” de aynı sınırı kullanır ve testler güncellenir.

**Neden önemli:** Sahip gece yoğunluğunda ya da kapanışta panoya baktığında gerçek vardiyayı görür. Genel bakış, Satış analizi ve Gün sonu aynı rakamı söyler.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/ordersAnalytics.controller.js:1487 ve 1512-1516 (today = TR 00:00)`
- `backend/controllers/analytics.controller.js:383 (day = TR 00:00)`
- `frontend/src/components/DashboardWidgets.jsx:26 ('Bugün 00:00'dan itibaren')`
- `frontend/src/components/orders/DayCloseDrawer.jsx:1-4 ve 21-24 (iş günü 05:00'te başlıyor)`
- `backend/models/settings.model.js:32-37 (orderEndHour varsayılan 1)`

</details>

#### Bölge kartında ücret/eşik/minimum için “ne olurdu” önizlemesi

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru. Sınırlar:
- Minimumun altındaki sepetler reddedildiği için hiç kaydedilmiyor. Bu yüzden minimumu düşürmenin etkisi geçmiş veriyle ölçülemez; yalnızca yükseltmenin etkisi ölçülebilir.
- Devrek'te henüz sipariş yok (bayrak kapalı). Tahmin öğrenci sepetlerine dayanır ve Devrek hanelerini temsil etmeyebilir.
- Kart ve sayfa başlığındaki sipariş sayıları iptalleri de içeriyor.

**Öneri:** Devrek kartına küçük bir “Sepet dağılımı” eklenir: son 30 ya da 90 günün iptal edilmemiş siparişlerinin ara toplam dağılımı. Kovalara ayırma sunucuda yapılır (ör. 25 TL'lik); grafikte eşik ve minimum çizgileri görünür.

Yazılan değerlere göre gecikmeli bir satır güncellenir: “Bu eşikle siparişlerin %38'i ücretsiz teslimat alırdı; kalanlardan ≈ ₺X teslimat geliri.”
- Minimum yükseltilirse: “%Y'si bu minimumun altında kalırdı.”
- Minimum düşürülürse: “Mevcut minimumun altındaki sepetler kayıtlı olmadığı için ölçülemez.”

Devrek verisi azken “Yurt sepetleriyle tahmin (temsili değildir)” etiketi gösterilir. Ayrıca kart ve sayfa başlığındaki sipariş sayıları iptalleri saymaz.

**Neden önemli:** Devrek açılışında ücret, eşik ve minimum sepet tahminle değil gerçek sepetlerle belirlenir; müşterilerin onda birini kaçıran bir minimum fark edilmeden kaydedilmez.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/delivery-zones/ZoneCard.jsx:209-216 (önizleme yalnızca metin)`
- `frontend/src/components/delivery-zones/ZoneCard.jsx:94-98 (yalnızca sipariş sayıları)`
- `backend/controllers/delivery.controller.js:79-91 (countOrdersByZone durum süzmeden sayıyor)`
- `backend/services/delivery.service.js:67-101 (computeDeliveryQuote saf fonksiyon)`
- `backend/models/order.model.js:180 (subtotalAmount)`
- `backend/controllers/cart.controller.js:465 ve 657 (adresli ve yurt akışında subtotalAmount yazılıyor)`
- `frontend/src/components/delivery-zones/ZoneCard.jsx:165-167 (yurtta ücret yalnızca yeni akışta)`

</details>

#### Gün × saat yoğunluk haritası: vardiya ve bildirim saati planı

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru. Ek olarak hücrelerde tıklama yok; telefonda ayrıntı güvenilir biçimde açılmıyor. Sipariş saatleri Ayarlar'dan değiştirilebildiği için 10:00–01:00 sabit yazılmamalı.

**Öneri:** Satırlar Pzt–Paz, sütunlar Ayarlar'daki sipariş saatleri olur. Hücreler son 4 ya da 8 TAM haftada saat başına ortalama siparişi gösterir; hesap sunucuda $dayOfWeek ve $hour ile, +03:00 saat diliminde yapılır.

Hücreye dokununca ya da tıklayınca altta seçili hücrenin bilgisi görünür: “Perşembe 22:00–23:00 · ort. 9,5 sipariş · ₺2.140”.

Dilimler de Ayarlar'daki saatlere göre bölünür.

“En yoğun 3 saat” ve “en sakin 3 saat” yalnızca bilgi olarak gösterilir, bildirim saati önerisi olarak sunulmaz.

**Neden önemli:** Hafta sonu yurttan eve gidiş gibi gün farkları görünür; personel ve kurye vardiyası ile push bildirim saati veriyle planlanır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/AdvancedAnalyticsTab.jsx:32-37 (DAYPARTS mağaza saatine uymuyor)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:82-120 (HourlyHeat: tek şerit)`
- `backend/controllers/analytics.controller.js:495-505 (hourlyBreakdown yalnızca bu dönem, gün kırılımı yok)`
- `frontend/src/components/orders/DayCloseDrawer.jsx:1-3 (mağaza 10:00–01:00)`
- `frontend/src/styles/analytics.css:165-169 ve 192-195 (ipucu yalnızca :hover / :focus-visible)`

</details>

#### Kâr tahmini: sunucuda marj, indirim etkisi, teslimat ücreti ve kurye maliyeti

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru: kart (ciro − manuel eklemeler) × tek bir marj hesaplıyor. Marj tarayıcıda tutuluyor. Başlık “Tahmini net kâr” ama gider düşülmüyor. Teslimat ücreti ayrı gösteriliyor.

Düzeltme: sipariş satırında kategori SAKLANMIYOR. Liste fiyatı ve fiyat kaynağı da yalnızca bu alanlar eklendikten sonraki siparişlerde var.

Ayrıca ciro, kupon sonrası ürün tutarı. Marj bunun üstüne uygulandığı için derin indirimli ya da kuponlu dönemlerde kâr olduğundan yüksek görünüyor.

**Öneri:** Başlık “Tahmini brüt kâr” olur. Marj Ayarlar'da sunucuda saklanır, böylece her cihazda aynı kâr görünür.

Hesap indirimleri dikkate alır:
- Maliyet ≈ liste fiyatı × (1 − marj); originalPrice olmayan satırlarda ödenen fiyat kullanılır.
- Kâr = ödenen ürün tutarı − maliyet (kupon zaten düşülmüş).

Kartta “İndirimlerin kâra etkisi −₺…” satırı ve “Marjından büyük indirimle satılan satır: N” uyarısı yer alır. Teslimat ücreti ayrı satır olarak kalır.

Kategori marjları (ürün kaydındaki kategoriyle) ve teslimat başına kurye maliyeti sonraki adıma bırakılır; kurye ödeme modeli netleşince eklenir.

**Neden önemli:** Sahip her cihazda aynı kârı görür; Devrek teslimatının kendini karşılayıp karşılamadığını ve hangi indirimlerin zarar ettirdiğini bilir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/DashboardWidgets.jsx:231-265 (ProfitCard)`
- `frontend/src/components/DashboardWidgets.jsx:232 (usePref('profitMargin', 10))`
- `frontend/src/components/admin/ui/index.jsx:54-80 (usePref = localStorage)`
- `frontend/src/components/DashboardWidgets.jsx:237-238 ve 253-256 ('Tahmini net kâr', teslimat ücreti hesaba girmiyor)`
- `backend/models/order.model.js:34-35 ve backend/services/order.service.js:106-111 (satırda liste fiyatı, kaynak, kategori)`

</details>

#### Yükselen/düşen ürünler ve kategoriler, olası nedeniyle birlikte

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Tespitler doğru. Ek olarak:
- Önceki dönem “aynı ana kadar” penceresiyle alınıyor. Hafta ya da gün başında bu pencere birkaç saatlik veri; ürün düzeyindeki değişim yanıltıcı olur.
- Sipariş satırında kategori kaydedilmediği için tablodaki her ürün “Kategorisiz” görünüyor.

**Öneri:** Ürün ve kategori değişimi eşit ve tam pencerelerle hesaplanır, seçili dönemden bağımsız olarak: son 14 gün ile önceki 14 gün.

Tabloya bir “Değişim” sütunu eklenir. Yeni “Düşüşte” sekmesi, önceki pencerede en az 5 adet satıp %40'tan fazla düşen ürünleri listeler. Her ürün için neden çipleri gösterilir:
- “Şu an stokta yok / gizli”
- “Ortalama satış fiyatı arttı (₺18 → ₺22)”
- “Önceki pencerede flaş / haftalık fırsattaydı” (satırdaki priceSource'tan)
- “Zincirlerden %12 pahalı”

Satıra tıklayınca ürün çekmecesi açılır (HANDOFF.product). Kategori ▲▼ oranları ürün kaydındaki kategoriyle hesaplanır.

**Neden önemli:** Stok, fiyat ya da rekabet yüzünden kaybedilen satış haftalar sonra değil hemen fark edilir; sahip doğrudan ürüne gidip fiyatı veya stoku düzeltir.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/analytics.controller.js:537-553 (topProductsBreakdown yalnızca verilen siparişler)`
- `backend/controllers/analytics.controller.js:559-582 (categoryRevenue yalnızca bu dönem)`
- `backend/controllers/analytics.controller.js:607-612 ve 619-623 (önceki dönem yükleniyor, kırılım yalnızca currentOrders)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:389-453 (tablo ve grafikte değişim yok)`
- `frontend/src/components/PriceWatchTab.jsx:74-80 ('%X pahalı' bilgisi)`

</details>

#### “Geçen yıl aynı dönem” karşılaştırması (öğrenci sezonuna uygun)

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Satış analizi bu dönemi yalnızca bir önceki gün/hafta/ay/yılla kıyaslıyor. Genel bakıştaki faaliyet dönemleri (“Yeni dönem” 6 Eylül 2026'dan itibaren) “önceki aynı uzunluktaki dönem”le kıyaslanıyor; bu pencere yurtların boş olduğu yaz arasına denk geliyor ve anlamsız büyük artışlar gösteriyor. Eylül başında “geçen hafta” da yaz tatili.

**Öneri:** İki ekrana “Karşılaştır: Önceki dönem | Geçen yıl” seçimi. Geçen yıl seçilince gün/hafta 364 gün geri kaydırılır (Pazartesi Pazartesi'yle eşleşir), ay/yıl/faaliyet dönemi takvim yılı kadar. Grafik iki çizgiyle (Bu yıl / Geçen yıl) çizilir, başlıkta “Geçen yıl aynı hafta: 3–9 Kasım 2025” yazar. “Yeni dönem” varsayılan olarak 2025-26 döneminin aynı ilk N günüyle kıyaslanır.

**Neden önemli:** Yurt öğrencisine bağlı bir işte asıl soru “geçen yılın aynı haftasından iyi miyiz?” sorusudur; Devrek genişlemesinin ve kampanyaların gerçek büyüme getirip getirmediği görülür.

<details><summary>Kod kanıtı</summary>

- `frontend/src/lib/revenuePeriods.js:4-25 (Yeni dönem / 2025-26 dönemi / Dönem arası)`
- `frontend/src/components/DashboardWidgets.jsx:33-36 ('önceki aynı uzunluktaki döneme göre')`
- `backend/controllers/ordersAnalytics.controller.js:1527-1538 (custom: önceki = hemen öncesindeki aynı uzunluk)`
- `frontend/src/components/AdvancedAnalyticsTab.jsx:24-29 (prev: dün/geçen hafta/geçen ay/geçen yıl)`
- `backend/controllers/analytics.controller.js:395-424 (shiftPeriod yalnızca −1 birim)`

</details>

#### Telefonda Genel bakış: sıfırları topla, iş gerektiren kartları üste al

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Tespitler doğru.

Düzeltme: düzen localStorage'da tutuluyor. Bu yüzden telefon kendi sırasını zaten ayrı saklıyor; ayrı bir kayıt anahtarına gerek yok. Kartlar dokunmatikte de sürüklenebiliyor (@hello-pangea/dnd).

**Öneri:** 760 px altında yalnızca değeri sıfırdan büyük dikkat öğeleri, iki sütunlu kompakt kutular olarak gösterilir. Sıfırlar tek satırda toplanır: “Diğerleri temiz (4)”; dokununca açılır.

Kayıtlı düzen yoksa dar ekranda varsayılan sıra şöyle olur: Dikkat → KPI → Sipariş dağılımı → Teslim edilemedi → Son siparişler → Satış.

Kart daraltma ve ayrı bir “Düzeni düzenle” modu eklenmez.

**Neden önemli:** Sahip akşam yoğunluğunda telefondan baktığında yapılacak işi ilk ekranda görür; kaydırmadan aksiyona geçer.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/DashboardWidgets.jsx:381-388 (0 değerli öğeler de listede; yalnızca null eleniyor)`
- `frontend/src/components/DashboardWidgets.jsx:712-714 ('Bekleyen iş yok' satırı ek olarak)`
- `frontend/src/styles/dashboard.css:200-204 (dar kapta her öğe %100)`
- `frontend/src/styles/dashboard.css:796-798 (min-height 56px)`
- `frontend/src/styles/dashboard.css:762-766 (tek sütun)`
- `frontend/src/components/DashboardWidgets.jsx:150 ve 291 (tek varsayılan düzen ve tek kayıt anahtarı)`

</details>

### Ürünler ve fiyat bekçisi

#### Fiyat hatasına güvenlik ağı: boş/0 fiyat engeli, büyük sapma onayı, Geri al

Etki 5/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Fiyat bekçisinde fiyat kutusu silinip Enter'a basılırsa boş değer 0 sayılıyor (parsePrice('') = 0, 'changed' 0'ı kabul ediyor) ve ürün 0 ₺ olarak kaydediliyor; sunucu da yalnızca negatif fiyatı reddediyor (toplu 'Sabit fiyat' dahil). Satır içi ve çekmecede virgül unutulursa (23,90 yerine 2390) hiçbir uyarı olmadan kaydediliyor. Yeni fiyat indirimli fiyatın altına inerse indirim sunucuda sessizce kaldırılıyor, ekranda yalnızca 'Fiyat güncellendi' yazıyor. Fiyat değişikliğinde 'Geri al' yok; ortak undoable bileşeni var ama ürünlerde kullanılmıyor.

**Öneri:** 1) Sunucu tüm fiyat uçlarında (update-price, bulk-price-update, PUT /products/:id) 0 ve altını reddetsin; fiyat bekçisinde kutu boşken Kaydet pasif olsun. 2) Yeni fiyat eskinin 3 katından fazla ya da yarısından azsa kaydetmeden önce satırda küçük onay: '25,00 ₺ → 2.390,00 ₺ (95 kat). Doğru mu?' [Kaydet] [Düzelt]. 3) Yeni fiyat mevcut indirimi geçersiz kılacaksa önceden yazsın: 'Bu fiyatla 24,00 ₺ indirim kalkacak'. 4) Satırda, çekmecede ve fiyat bekçisinde her tekil fiyat kaydından sonra 10 sn 'Fiyat 25,00 → 27,50 ₺ · Geri al' bildirimi; Geri al eski fiyatı ve kalkan indirimi geri yazsın.

**Neden önemli:** Gece yoğunluğunda yanlış fiyatla sipariş alınmasını, müşteri itirazını ve kâr kaybını önler; sahibin 'hata istemiyorum' beklentisini doğrudan karşılar.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/PriceWatchTab.jsx:383-386`
- `frontend/src/components/PriceWatchTab.jsx:483-488`
- `frontend/src/lib/productAssist.js:53`
- `backend/controllers/product.controller.js:387-390`
- `backend/controllers/product.controller.js:399-403`
- `backend/controllers/product.controller.js:738-740`
- `frontend/src/components/ProductsList.jsx:80-85`
- `frontend/src/components/ProductsList.jsx:484-492`
- `frontend/src/components/products/ProductDrawer.jsx:81-83`
- `frontend/src/components/admin/ui/index.jsx:294-326`

</details>

#### Flaş indirim, daha derin kalıcı indirimi ezip müşteri fiyatını yükseltiyor

Etki 4/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** applySale flaş fiyatını her zaman liste fiyatından hesaplayıp ürünün indirimli fiyatının yerine yazıyor; mevcut indirimin daha derin olup olmadığına bakmıyor. Örnek: liste 30 ₺, kalıcı indirim 20 ₺; %20 flaş başlatılınca discountedPrice 24 ₺ olur, müşteri kampanya süresince 20 yerine 24 ₺ öder ve uygulamada '⚡ %20' rozeti görür (indirim flaş fiyatına eşit olduğu için liveFlashInfo eşleşir). Tekil ve toplu flaş önizlemesi de yalnızca liste fiyatından '30,00 → 24,00' gösterdiği için sahip bunu fark etmez; 'İndirimli' filtresindeyken 'Hepsine flaş indirim' bu durumu toplu üretir. Testler yalnızca flaşın mevcut indirimden derin olduğu durumu kapsıyor.

**Öneri:** Sunucu: flaş fiyatı ürünün şu anki müşteri fiyatından (geçerli indirim ve haftalık fiyatın en düşüğü) düşük değilse kampanya uygulanmasın. Tekil oluşturmada 400 ve açıklama ('Ürün zaten 20,00 ₺; %20 flaşla 24,00 ₺ olur, fiyat artar'), toplu oluşturmada ürün 'skipped' listesine 'Mevcut indirim daha derin' nedeniyle eklensin. Form önizlemesi 'Müşteri şu an öder 20,00 ₺ → flaşla 24,00 ₺ (fiyat artar)' satırını göstersin, bu ürünler toplu flaşta varsayılan olarak atlansın; isteğe bağlı 'Şu anki müşteri fiyatından %X indir' seçeneği. Bu durum için test eklensin.

**Neden önemli:** Kampanya etiketi altında fiyat artışı (müşteriye yanıltıcı indirim, şikâyet riski) önlenir; toplu flaşta sahip hangi ürünün gerçekten ucuzladığını görür.

<details><summary>Kod kanıtı</summary>

- `backend/services/flashSale.service.js:40-60`
- `backend/services/productPricing.js:86-97`
- `backend/services/productPricing.js:105`
- `backend/services/weeklyPrice.service.js:82-84`
- `frontend/src/components/products/FlashSale.jsx:54`
- `frontend/src/components/products/FlashSale.jsx:130`
- `frontend/src/components/products/FlashSale.jsx:169`
- `frontend/src/components/ProductsList.jsx:926-933`
- `backend/tests/flash-sale.test.js:47-60`

</details>

#### Zam indirimdeki ürünlerde müşteriye yansımıyor; indirim oranı şişiyor

Etki 4/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Toplu fiyat güncelleme yalnızca liste fiyatını (price) değiştiriyor; indirimli fiyat yalnızca yeni fiyatın altında kalmazsa siliniyor. %10 zamda indirimdeki ürünlerin müşterinin ödediği fiyatı aynı kalıyor (zam yansımıyor), uygulamadaki '-%X' rozeti büyüyor (ör. liste 30→33 ₺, indirimli 25 ₺ sabit: %17 → %24). Pencere seçimin kaçının indirimde olduğunu söylemiyor, önizleme yalnızca ilk ürünün liste fiyatını gösteriyor, tek ipucu indirimlerin 'kaldırılabileceği'. Satır içinde de indirimdeki üründe kalın görünen indirimli fiyata tıklanınca kutu liste fiyatıyla açılıyor; yazılan değer liste fiyatına gidiyor, müşteri fiyatı değişmiyor ve ekranda söylenmiyor.

**Öneri:** Toplu fiyat penceresinde seçimde indirimli ürün varsa üstte '38 ürünün 12'si indirimde' notu ve seçim: 'İndirim oranını koru' (varsayılan; indirimli fiyat da aynı oranda değişir) · 'İndirimli fiyatı sabit tut' · 'İndirimi kaldır'. Sunucu bulk-price-update bir discountMode alanı alsın, indirimli fiyatı kuruşa yuvarlayıp yeni fiyatın altında tutsun ve işlem kaydına iki fiyatı da yazsın; aktif flaş indirimdeki ürünlerin flaş fiyatına dokunulmasın, önizlemede ayrıca belirtilsin. Satır içi düzenleyici indirimdeki üründe 'Liste' ve 'İndirimli' iki kutu göstersin (ya da en azından 'Liste fiyatını değiştiriyorsunuz; müşteri 25,00 ₺ ödemeye devam eder' satırı).

**Neden önemli:** Toptancı zammı indirimdeki ürünlerde de müşteri fiyatına yansır, kâr sessizce erimez; uygulamada şişirilmiş, yanıltıcı indirim oranı oluşmaz.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/product.controller.js:745-766`
- `frontend/src/components/ProductsList.jsx:201-206`
- `frontend/src/components/ProductsList.jsx:254`
- `frontend/src/components/ProductsList.jsx:75-76`
- `frontend/src/components/ProductsList.jsx:101-107`
- `backend/services/productPricing.js:86-97`

</details>

#### Listede satış ve tükenme bilgisi: '30 günde 42 adet', 'kaç gündür tükendi'

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Ürün satırında ve çekmecede satış bilgisi yok; sıralamalar vitrin, ad, fiyat, indirim, yenilik ve güncellenme ile sınırlı. Sunucu öneri sistemi için ürün başına son 30/7 gün adet ve sipariş sayısını zaten bellekte hesaplıyor (getStats) ama panele vermiyor. Stok durumu çıplak bir evet/hayır: ne zaman tükendiği tutulmuyor, dün biten ile iki aydır bitik ürün ayırt edilemiyor; tükenen ürünün kartı uygulamada görünmeye devam ediyor.

**Öneri:** Yönetici ucu GET /products/sales-stats (getStats'tan units30/units7/orders30) ve üründe outOfStockSince alanı (tükendi yapılınca yazılır, stoka alınınca silinir). Satırda küçük metin: '30 gün: 42 adet ↑' ve tükenenlerde '12 gündür tükendi'. Yeni sıralamalar: 'Çok satan (30 gün)', 'En uzun süredir tükenen'. Yeni çipler: 'Çok satan ama tükendi' (kayıp satış), 'Yayında ama 30 gündür satmayan'. 'Stokta yok' filtresinde 'Toptancı listesi' düğmesi: kategoriye göre gruplu, 30 günlük satış adediyle yazdırılabilir / WhatsApp'a kopyalanabilir liste.

**Neden önemli:** Önce hangi ürünün tedarik edileceği, hangisinin gizlenip indirime sokulacağı veriyle belli olur; kayıp satışlar ve rafta çürüyen ürünler görünür hale gelir.

<details><summary>Kod kanıtı</summary>

- `backend/services/recommendation.service.js:93-99`
- `backend/services/recommendation.service.js:125-131`
- `backend/services/recommendation.service.js:487-494`
- `frontend/src/components/products/productUtils.js:45-53`
- `frontend/src/components/ProductsList.jsx:114-180`
- `backend/models/product.model.js:37-40`
- `backend/controllers/product.controller.js:559-584`
- `frontend/src/components/CreateProductForm.jsx:459`

</details>

#### Toplu fiyatta tam önizleme ve yuvarlama; fiyat bekçisinde seçip toplu uygula

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Toplu fiyat penceresi yüzlerce seçili ürün için yalnızca ilk ürünün örneğini gösteriyor; %10 zam 27,39 ₺ gibi kuruşlu fiyatlar üretiyor (yuvarlama kuralı yok), uygulamadan sonra geri alma yok. Fiyat bekçisinde her ürün tek tek yazılıp kaydediliyor; öneri ham ortanca (ör. 23,47 ₺). Liste yalnızca fark yüzdesine göre sıralanıyor (en çok satanlar sadece gece kontrol sırası için kullanılıyor); 30 gündür satmayan ürün her gün satan ürünün üstünde olabiliyor. Ürün adına tıklayıp ürünü (stok, flaş, geçmiş) açmak mümkün değil.

**Öneri:** Ortak 'fiyat önizleme' bileşeni: seçilen tüm ürünler eski → yeni ve fark (₺ / %) ile, en büyük değişim üstte; yuvarlama seçimi 'Kuruşlu bırak · ,50 · ,90 · Tam lira (yukarı)'. Toplu fiyat ve toplu indirim bu bileşeni kullansın, uygulamadan sonra 'Geri al' çıksın. Fiyat bekçisinde satır onay kutuları + 'Seçilenleri piyasaya çek' aynı önizlemeyle açılsın (ürün başına ayrı yeni fiyat). Sıralama seçeneği 'Önce çok satan' (30 gün adet × fark); ürün adı tıklanınca ürün çekmecesi açılsın.

**Neden önemli:** Zam ve indirim günlerinde yüzlerce ürün raf fiyatı gibi düzgün rakamlarla, gözle kontrol edilerek birkaç dakikada güncellenir; önce ciroyu en çok etkileyen ürünlere bakılır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/ProductsList.jsx:201-206`
- `backend/controllers/product.controller.js:757-761`
- `frontend/src/components/ProductsList.jsx:717-726`
- `frontend/src/components/PriceWatchTab.jsx:385`
- `frontend/src/components/PriceWatchTab.jsx:393-396`
- `frontend/src/components/PriceWatchTab.jsx:473-494`
- `backend/services/priceWatch.service.js:552-556`
- `backend/services/priceWatch.service.js:235-246`

</details>

#### Fiyat bekçisi müşterinin ödediği fiyatla kıyaslasın (indirim, flaş, haftalık)

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Pahalı/ucuz sınıflaması her zaman liste fiyatıyla (product.price) yapılıyor; satır verisine haftalık fırsat fiyatı hiç girmiyor. Kalıcı indirimi, flaş indirimi ya da haftalık fırsatı olan ürün, müşteri piyasadan ucuza alsa bile 'Pahalı' listesinde ve '%25 pahalı' etiketiyle çıkıyor; satırda yalnızca 'İndirimde X' rozeti var. 'Piyasa fiyatını yaz' liste fiyatını değiştiriyor; zaten indirimde olan ürünün liste fiyatını gereksiz yere düşürmeye yol açabiliyor.

**Öneri:** Satır iki fiyat göstersin: 'Liste 30,00 ₺ · Müşteri öder 22,50 ₺ (indirim/flaş/haftalık)'. Sınıflama müşterinin şu an ödediği fiyatla (actualPrice: liste, indirim/flaş ve haftalık fiyatın en düşüğü) yapılsın; liste fiyatı pahalı ama müşteri fiyatı uyumluysa ürün 'Uyumlu (indirimle)' sayılsın. Fiyat geçici kampanyadan geliyorsa satırda ek not: 'Kampanya bitince liste fiyatı %25 pahalı'. Kampanyadaki üründe öneri düğmesi 'Liste fiyatını (kampanya sonrası) yaz' diye etiketlensin.

**Neden önemli:** Yanlış alarmlar ve gereksiz liste fiyatı indirimleri (kâr kaybı) önlenir; 'Pahalı' listesi gerçekten müdahale gereken ürünlere iner.

<details><summary>Kod kanıtı</summary>

- `backend/services/priceWatch.service.js:506`
- `backend/services/priceWatch.service.js:518-524`
- `backend/controllers/priceWatch.controller.js:42`
- `backend/controllers/priceWatch.controller.js:48-56`
- `frontend/src/components/PriceWatchTab.jsx:398-401`
- `frontend/src/components/PriceWatchTab.jsx:490-494`
- `backend/services/productPricing.js:5-9`

</details>

#### Haftalık fırsatı ve müşteri fiyatını satırda göster; flaşla çakışmayı uyar

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Ürün listesi sunucudan her ürün için actualPrice, isWeeklyProduct ve weeklyPrice alıyor ama ekran bunları hiç göstermiyor: satırda yalnızca liste/indirimli fiyat var, 'Haftalık' rozeti ya da filtresi yok. Fiyat kuralı en düşük fiyatı uyguluyor; haftalık fiyatı zaten daha düşük olan ürüne flaş indirim başlatılırsa indirim müşteriye yansımıyor ve uygulamada flaş bilgisi de gösterilmiyor. Flaş formunun önizlemesi yalnızca liste fiyatından hesaplıyor; sunucu da bu durumda uyarı vermiyor.

**Öneri:** Fiyat hücresinde müşteri fiyatı gösterilen fiyattan farklıysa ikinci satır: 'Müşteri öder 19,90 ₺ · Haftalık'. Satır etiketlerine 'Haftalık' rozeti, durum çiplerine 'Haftalık fırsat' filtresi eklensin; çekmecede fırsatın bitiş tarihi ve 'Haftalık fırsatlarda aç' bağlantısı olsun. Flaş formu (tekil ve toplu önizleme) haftalık fiyatı daha düşük ürünlerde 'Bu indirim müşteriye yansımaz (haftalık 19,90 ₺)' uyarısı göstersin; toplu flaşta bu ürünler varsayılan olarak atlansın.

**Neden önemli:** Sahip ekranda müşterinin gerçekten ödediği fiyatı görür; boşa açılan kampanya ve 'uygulamada başka fiyat yazıyor' karışıklığı biter.

<details><summary>Kod kanıtı</summary>

- `backend/services/weeklyPrice.service.js:67-84`
- `backend/services/productPricing.js:5-9`
- `frontend/src/components/ProductsList.jsx:100-111`
- `frontend/src/components/ProductsList.jsx:132-138`
- `frontend/src/components/products/productUtils.js:34-43`
- `frontend/src/components/products/FlashSale.jsx:50-55`
- `frontend/src/components/products/FlashSale.jsx:128-131`
- `frontend/src/components/products/FlashSale.jsx:155-170`
- `backend/controllers/flashSale.controller.js:158-172`

</details>

#### Yeni üründe 'katalogda var' uyarısı ve 'Benzerini ekle' ile kopyalayarak ekleme

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Fotoğrafla ekle akışı katalogda benzer ürün olup olmadığını gösteriyor ama elle ekleme formunda hiçbir kopya kontrolü yok; oysa tüm katalog zaten bellekte. Form her seferinde boş başlıyor (yalnızca kategori korunuyor); 330 ml'si olan ürünün 1 L'sini eklerken ad, kategori, açıklama ve görsel baştan giriliyor; çekmecede kopyalama düğmesi yok. Ürünler ekranındaki 'Yeni ürün' düğmesi o an seçili kategoriyi forma taşımıyor.

**Öneri:** Ad yazılırken (Türkçe harf ve büyük/küçük harf duyarsız) alanın altında 'Katalogda benzer: Pınar Süt 1 L — 32,50 ₺ [Aç]' satırı çıksın; birebir aynı ad varsa Kaydet 'Aynı adla ürün var, yine de eklensin mi?' diye sorsun. Ürün çekmecesine 'Benzerini ekle' düğmesi: yeni ürün formu ad, kategori, açıklama, görsel ve fiyatla dolu açılır, imleç adın sonunda bekler (gramajı değiştirmek için). Ürünler ekranında bir kategori seçiliyken 'Yeni ürün' o kategoriyle açılsın.

**Neden önemli:** Boy/gramaj varyantı eklemek yarı sürede biter; aynı ürünün iki kez eklenip müşteriyi ve stok takibini karıştırması önlenir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/CreateProductForm.jsx:44`
- `frontend/src/components/CreateProductForm.jsx:133`
- `frontend/src/components/CreateProductForm.jsx:204-212`
- `frontend/src/components/CreateProductForm.jsx:316-320`
- `backend/controllers/productAssist.controller.js:27-32`
- `frontend/src/components/ProductAssistTab.jsx:184-192`
- `frontend/src/components/ProductsList.jsx:821-823`

</details>

#### Ürünler ekranına 'Dikkat' şeridi: sorunlu ürünleri tek tıkla bul ve düzelt

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Hatalı indirim (indirimli ≥ satış fiyatı) satırda yalnızca ünlemle işaretleniyor, süzülemiyor; 19 koddan biri olmayan kategoriler seçicide yok ve uygulamada kategori listelerine düşmüyor; aynı adlı kopyalar işaretlenmiyor. Genel bakıştaki 'Stoksuz ürün' ve 'Görselsiz ürün' kartları Ürünler ekranını son kullanılan filtreyle açıyor; üstelik bu kartlar yalnızca gizli olmayan ürünleri sayarken Ürünler ekranındaki 'Stokta yok'/'Görselsiz' sayıları gizlileri de içeriyor, iki ekran farklı sayı gösteriyor. (Son eklenen gizliler 'Gizli' + 'En yeni' ile, 0 ₺ ürünler 'Fiyat (artan)' ile zaten bulunabiliyor.)

**Öneri:** Ürünler ekranına filtre aktarımı (HANDOFF + admin-handoff dinleyicisi) eklensin; Genel bakış kartları ekranı 'gizli olmayan ve stokta yok' / 'gizli olmayan ve görselsiz' kapsamıyla açsın, sayılar birebir tutsun. KPI'ların üstünde yalnızca sorun varsa görünen çipler: 'İndirim hatalı (3)' → 'İndirimi kaldır'; 'Kategorisi tanımsız (5)' → 'Kategori taşı'; 'Aynı ad (4 çift)' → çiftleri yan yana listele. 'Gizli ve 14 günden yeni' ile '0 ₺' çipleri düşük öncelik (mevcut filtre/sıralamayla bulunuyor; #1 sonrası yeni 0 ₺ kayıt oluşmaz).

**Neden önemli:** Müşterinin göremediği ya da yanlış gördüğü ürünler her gün tek bakışta yakalanır; katalog temizliği ayda bir yapılan büyük iş olmaktan çıkar, günde birkaç tıka iner.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/ProductsList.jsx:77`
- `frontend/src/components/ProductsList.jsx:108`
- `frontend/src/components/products/productUtils.js:34-43`
- `frontend/src/components/ProductsList.jsx:898-901`
- `frontend/src/components/products/ProductDrawer.jsx:185`
- `backend/controllers/product.controller.js:282-289`
- `backend/controllers/product.controller.js:535-536`
- `frontend/src/components/DashboardWidgets.jsx:386-387`
- `frontend/src/components/ProductsList.jsx:313-315`
- `frontend/src/components/ProductsList.jsx:357-360`
- `frontend/src/components/admin/ui/index.jsx:458`
- `frontend/src/components/ProductAssistBulk.jsx:451-453`

</details>

#### Görselsiz ürünlere internetten görsel bul (fotoğrafla ekle motoruyla)

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: hayır

**Şu an:** 'Görselsiz' filtresi (gizliler dahil) sayıyı gösteriyor ama mevcut ürüne görsel yalnızca bilgisayardan dosya seçilerek ekleniyor; dosya küçültülmeden/kırpılmadan gönderiliyor (yeni ürün formu 1200 px'e küçültüp kare kırpıyor). Trendyol/Getir görsel arama ve arka plan temizleme yalnızca yeni ürün eklerken kullanılıyor. Arka plan temizleme sunucuda senkron JS piksel döngüsüyle yapıldığı için tek süreçte işlemciyi meşgul ediyor.

**Öneri:** Çekmecede 'İnternetten bul': ürün adıyla aday görseller ızgarada gelir; yalnızca seçilen görsel hazırlanır (arka plan temizlenir) ve 'Bu görseli kullan' PATCH /products/:id/image ile kaydeder. 'Görselsiz' filtresinde 'Sırayla görsel bul' ekranı: sonraki ürünün araması önceden yapılabilir ama hazırlama aynı anda tek görselle ve yalnızca seçimden sonra çalışır; akşam yoğunluğunda (18:00–01:00) 'sipariş akışını yavaşlatabilir' uyarısı. Enter kullan, S atla, oklar aday değiştirir; üstte '34/120'. Bilgisayardan yüklenen dosya da yeni ürün formundaki gibi küçültülüp kare kırpılsın.

**Neden önemli:** Görselli kart uygulamada daha çok satar; ürün başına birkaç dakikalık ara-indir-yükle işi birkaç saniyeye iner.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/ProductsList.jsx:797`
- `frontend/src/components/products/ProductDrawer.jsx:93-100`
- `frontend/src/components/products/ProductDrawer.jsx:145-148`
- `frontend/src/components/ProductsList.jsx:1052-1069`
- `frontend/src/components/CreateProductForm.jsx:55-82`
- `frontend/src/components/ProductAssistTab.jsx:48-63`
- `frontend/src/components/ProductAssistTab.jsx:102-115`
- `backend/routes/productAssist.route.js:9-13`
- `backend/controllers/product.controller.js:586-629`

</details>

#### Stokta 'tersine çevir' yerine 'şuna ayarla' + cihazlar arası canlı güncelleme

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Stok, görünürlük ve öne çıkarma uçları durumu tersine çeviriyor (toggle). Ürün listesi ekran açılınca bir kez yükleniyor; ürün değişikliği için soket olayı olmadığından başka cihazdaki değişiklik gelmiyor. Toplu 'Tükendi' yerel (eski olabilecek) duruma bakıp her ürün için toggle çağırıyor ve sunucu yanıtını okumadan ekranı 'Tükendi' yapıyor. Siparişler ekranı bu yüzden önce taze GET yapmak zorunda kalmış ('uç nokta yalnızca tersine çevirir'). Örnek: personel kasadaki bilgisayardan bir ürünü tükendi yaptıysa, sahibin telefonundaki eski listeden yapılan toplu 'Tükendi' o ürünü sunucuda stoka geri alır, ekran ise 'Tükendi' gösterir.

**Öneri:** Sunucuya idempotent uçlar: PATCH /products/:id/state { isOutOfStock | isHidden | isFeatured } ve POST /products/bulk-stock { productIds, isOutOfStock }; güncel ürünleri döndürsün, ekran yalnızca yanıtı yazsın. Ürün router'ındaki başarılı yazma kancası admin odasına 'productsChanged' (id + değişen alanlar) yayınlasın; açık Ürünler ekranı satırları yerinde güncellesin ve üstte sessiz bir not göstersin: '2 ürün başka cihazdan tükendi yapıldı'. Siparişler ekranındaki taze-GET geçici çözümü de bu uca geçsin.

**Neden önemli:** Sahip, personel ve birden çok cihaz aynı anda çalışırken stok bilgisi ters dönmez; müşteri olmayan ürünü sipariş edemez, sipariş düzeltme ve telefon trafiği azalır.

<details><summary>Kod kanıtı</summary>

- `backend/routes/product.route.js:160-162`
- `backend/controllers/product.controller.js:559-584`
- `backend/controllers/product.controller.js:230-256`
- `frontend/src/components/ProductsList.jsx:455-482`
- `frontend/src/components/ProductsList.jsx:661-670`
- `frontend/src/components/ProductsList.jsx:355`
- `frontend/src/components/orders/useOrdersData.js:1315-1349`
- `backend/routes/product.route.js:38-45`

</details>

#### Toplu yükleme: sonucu doğru bildir, satır satır doğrula, şablon indir

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Ekran 'response.data.success' bekliyor ama sunucu yalnızca { message } dönüyor: başarılı yüklemede hiçbir bildirim çıkmıyor ve liste yenilenmiyor; kullanıcı tekrar yüklerse kopya ürünler oluşuyor. Ekranda 'Maksimum 10MB' yazıyor, sunucu sınırı 5 MB. 'Sürükleyin' yazıyor ama bırakma desteği yok. Başlık listesinde şemada olmayan 'stock' var; 'discountedPrice' verilse de isDiscounted varsayılan false olduğu için indirim hiç görünmüyor. insertMany tek hatalı satırda ('12,50' fiyat, boş kategori) tüm dosyayı reddediyor ve hangi satır olduğunu söylemiyor; kategori 19 koddan biri mi diye bakılmıyor, görsel sütunu Cloudinary'ye yüklenmeden dış bağlantı olarak kaydediliyor. Ayrıca /bulk-upload adresinde eski Tailwind bileşeni hâlâ duruyor.

**Öneri:** Sunucu dosyayı satır satır doğrulasın (ad, fiyat › 0, Türkçe ondalık, kategori adı/kodunu 19 koda eşleme, indirimli fiyat ‹ fiyat ise isDiscounted: true), geçerli satırları eklesin ve dönsün: { eklenen, atlanan: [{satır, neden}], kopya: [{satır, mevcut ürün}] }. Ekran sonuç tablosu göstersin ('42 ürün eklendi · 3 satır atlandı'), 'Hatalı satırları indir' ve 'Şablonu indir' (kategori kodlarıyla) düğmeleri olsun; ürünler varsayılan 'gizli' eklensin (fotoğrafla toplu eklemedeki gibi); boyut metni 5 MB'a düzeltilsin, sürükle-bırak çalışsın, eski /bulk-upload rotası kaldırılsın.

**Neden önemli:** Toplu ürün ekleme sessizce başarısız ya da yarım kalmaz; kopya ve uygulamada kategoriye düşmeyen ürün oluşmaz.

<details><summary>Kod kanıtı</summary>

- `frontend/src/pages/AdminPage.jsx:56-85`
- `frontend/src/pages/AdminPage.jsx:590-611`
- `backend/routes/product.route.js:49`
- `backend/routes/product.route.js:84-106`
- `backend/models/product.model.js:13-16`
- `frontend/src/App.jsx:130-133`
- `frontend/src/components/BulkUpload.jsx:1-65`

</details>

#### Ürün çekmecesi: sekmeler, kayıp değişiklik uyarısı, j/k geçiş, açıklama düzenleme

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Ürün çekmecesi ortak Drawer'ı kullanmıyor: Esc ya da dışarı tıklama kaydedilmemiş ad/kategori/fiyat/indirim değişikliğini uyarmadan atıyor, odak tuzağı yok. Listede önceki/sonraki ürüne geçiş yok; filtreli listeyi düzeltirken her üründe kapat-aç gerekiyor. Açıklama yalnızca eklerken yazılabiliyor: çekmecede alan yok, PUT /products/:id açıklamayı yok sayıyor; oysa açıklama uygulama içi aramada ve yapay zekâ asistanının ürün detayında kullanılıyor.

**Öneri:** Çekmece ortak Drawer'a taşınsın (dirty + onDirtyClose: 'Değişiklikler kaydedilmedi, yine de kapatılsın mı?', odak tuzağı); tek sütun düzeni korunsun, sekme eklenmesin. Başlıkta ↑/↓ ve j/k ile o anki filtre/sıralamadaki önceki/sonraki ürüne geçiş ve '12/48' sayacı (kaydedilmemiş değişiklik varsa önce sorar). 'Bilgiler' bölümüne 600 karakter sayaçlı 'Açıklama' alanı; sunucu PUT /products/:id açıklamayı kaydedip işlem kaydına fark olarak yazsın.

**Neden önemli:** Sahip bir filtredeki onlarca ürünü art arda hızla düzeltir, yazdığı fiyat yanlışlıkla kaybolmaz; asistan ve uygulama araması müşteriye doğru açıklamayı verir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/products/ProductDrawer.jsx:69-78`
- `frontend/src/components/products/ProductDrawer.jsx:105-106`
- `frontend/src/components/products/ProductDrawer.jsx:174-198`
- `frontend/src/components/admin/ui/index.jsx:225-268`
- `frontend/src/components/orders/OrderDrawer.jsx:165-170`
- `backend/controllers/product.controller.js:516-537`
- `backend/controllers/product.controller.js:452`
- `backend/services/ai/tools.js:292-296`

</details>

#### Alış fiyatı ve marj: zarar ettiren fiyat, indirim ve flaşa uyarı

Etki 3/5 · Efor: Büyük (3 günden fazla) · Sunucu: evet

**Şu an:** Üründe alış fiyatı yok; Genel bakış kârı ciro × tarayıcıda saklanan tek marj (%10) ile tahmin ediliyor; flaş, toplu indirim ve bekçi önerisi maliyet bilmeden çalışıyor, 'maliyetin altında' denetimi yok. Maliyeti toplu girmenin de bir yolu yok.

**Öneri:** İsteğe bağlı 'Alış fiyatı' + 'maliyet güncellendi' tarihi (çekmece, yeni ürün formu ve #3'teki CSV güncellemesiyle toplu). İlk aşama yalnızca koruma: maliyeti girilmiş üründe yeni fiyat, indirimli fiyat ya da flaş fiyatı maliyetin altına düşerse kaydetmeden önce kırmızı uyarı ('ürün başına 2,40 ₺ zarar'); 60 günden eski maliyet 'güncel olmayabilir' diye işaretlensin. Satırda marj etiketi, bekçi önerisinin yanında marj ve Genel bakışta kapsamı gösteren karma kâr hesabı ('cironun %64'ü gerçek maliyetle') ikinci aşama.

**Neden önemli:** Kampanya ve piyasaya çekme kararları kârı eritmeden verilir; sahip hangi ürünün gerçekten para kazandırdığını görür.

<details><summary>Kod kanıtı</summary>

- `backend/models/product.model.js:3-72`
- `frontend/src/components/DashboardWidgets.jsx:232-236`
- `frontend/src/components/PriceWatchTab.jsx:490-494`
- `frontend/src/components/ProductsList.jsx:717-726`
- `frontend/src/components/products/FlashSale.jsx:50-55`

</details>

#### Barkodu ürüne kaydet: barkodla ara, telefon kamerasıyla okut, stoğu değiştir

Etki 3/5 · Efor: Büyük (3 günden fazla) · Sunucu: evet

**Şu an:** Üründe barkod alanı yok. Barkod yalnızca fiyat bekçisi kaydında tutuluyor (elle girilen ya da Camgöz'ün bulduğu; satırda rozet, düzenleyicide alan) ve bekçi elle girilen barkodla zaten kesin eşleşme yapıyor. Katalog araması ve komut paleti ad/kategoriyle arıyor; elde ürünle duran kişi adını yazmak zorunda. Fotoğraftan tanımada barkod okunmuyor.

**Öneri:** Aşamalı: (1) Product'a benzersiz, boş olabilen barcode alanı; bekçideki elle girilmiş barkodlar ürüne taşınsın, Camgöz'ün bulduğu otomatikler çekmecede 'doğrulanmamış' öneri olarak onaya sunulsun; bekçi ürün barkodunu kullansın. (2) Çekmecede barkod alanı; Ürünler araması ve komut paleti 8–14 rakamı barkod olarak birebir eşleştirsin (klavye gibi çalışan okuyucu: okut → Enter → çekmece). (3) Telefonda 'Barkod okut' BarcodeDetector ile (yalnızca Android Chrome; desteklenmezse düğme gizli), büyük 'Stokta/Tükendi' ve fiyat düğmeleri; barkod katalogda yoksa yeni ürün formu barkodla açılsın, varsa 'Bu barkod X ürününde' uyarısı. İlk dolum için 'Barkodsuz ürünler' sırası (okut → sonraki).

**Neden önemli:** Raf turunda tükenenleri işaretlemek ve fiyat kontrolü saniyeler sürer; kopya ürün eklemek imkânsızlaşır, piyasa fiyatı eşleşmesi doğrulaşır.

<details><summary>Kod kanıtı</summary>

- `backend/models/product.model.js:3-72`
- `frontend/src/components/PriceWatchTab.jsx:321-376`
- `backend/controllers/priceWatch.controller.js:265-276`
- `frontend/src/components/ProductsList.jsx:391`
- `frontend/src/components/admin/CommandPalette.jsx:99`
- `backend/services/productAssist.service.js:56`
- `backend/services/productAssist.service.js:184`

</details>

#### CSV ile toplu güncelleme: Excel'de düzelt, önizlemeyle geri yükle

Etki 2/5 · Efor: Büyük (3 günden fazla) · Sunucu: evet

**Şu an:** Dışa aktarılan CSV ';' ayraçlı, Türkçe başlıklı, kategori adıyla ve ID'siz iniyor; toplu yükleme ',' ayraç ve İngilizce başlık bekliyor ve yalnızca insertMany ile yeni ürün ekliyor. İndirilen dosya geri yüklenirse tek sütun olarak okunur ve tamamı doğrulama hatasıyla reddedilir (kopya oluşmaz, hiçbir şey eklenmez). Excel'de düzeltilen fiyatları sisteme geri almanın yolu yok.

**Öneri:** #4'ten sonra yapılsın ve aynı yeni ayrıştırıcıyı kullansın: panelin kendi dışa aktarımını da tanısın (';' ya da ',', '12,50', Türkçe başlıklar). Dışa aktarıma 'ID' ve 'Kategori kodu' sütunları eklensin. ID'li satırlar güncelleme sayılsın; uygulamadan önce fark tablosu (fiyatı/indirimli fiyatı/stoğu/görünürlüğü değişecek ürün sayıları, hatalı satırlar satır numarasıyla) gösterilsin, satırlar tek tek çıkarılabilsin. Uygulama tek toplu uçla yapılsın ve işlem kaydına her ürünün eski değeri yazılsın (geri dönüş buradan); ayrı 30 dakikalık geri alma sayacı gerekmez. Alış fiyatı (#13) yapılırsa maliyet girişi de bu yoldan olsun.

**Neden önemli:** Toptancı zam listeleri ve enflasyon güncellemeleri yüzlerce ürün için dakikalar içinde, gözle kontrol edilerek uygulanır; kopya ürün ve yanlış toplu değişiklik riski kalkar.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/products/productUtils.js:186-201`
- `frontend/src/components/ProductsList.jsx:692-696`
- `frontend/src/pages/AdminPage.jsx:66-69`
- `backend/routes/product.route.js:70-111`

</details>

### Kampanya ve vitrin

#### Kuponun son günü gece 03:00'te bitmesin: bitişi 23:59 olarak kaydet

Etki 5/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Son kullanma tarihi yalnızca gün olarak seçiliyor (type=date). Sunucu bunu new Date('2026-11-05') ile 00:00 UTC, yani İstanbul saatiyle o günün 03:00'ü olarak kaydediyor. Kupon, 'son gün' sanılan günün sabahı 03:00'te bitiyor: doğrulama 'süresi dolmuş' diyor ve kupon cüzdandan da kalkıyor, bu yüzden o akşamın yoğun saatlerinde müşteri kuponu kullanamıyor. Form uyarısı 23:59'a göre, önizleme 'Son gün 5 Kasım' diyor; listede ise aynı gün 'Süresi doldu · 1 gün önce bitti' yazıyor. Bugünün tarihi seçilince form uyarmıyor ama sunucu reddediyor. Düzenlemede tarih denetimi olmadığından kupon anında süresi dolmuş olarak kaydedilebiliyor. Düzenleme formu mevcut bitişi UTC güne kırpıyor; saatli bir kupon (ör. sistemin ürettiği TOP…/GOREV…/IKINCI… kuponu) panelden düzenlenip kaydedilince bitişi aynı günün 03:00'üne çekiliyor. Hızlı gün düğmeleri UTC tarih kullandığından 00:00–03:00 arasında bir gün kayıyor.

**Öneri:** Sunucu yalnız tarih ('YYYY-MM-DD') alırsa bitişi İstanbul saatiyle o günün 23:59:59'u olarak kaydetsin. Oluşturma ve güncellemede aynı kural geçerli olsun, geçmiş bitiş iki yolda da reddedilsin. Formda tarihin yanına isteğe bağlı bir saat alanı (varsayılan 23:59) ve hızlı seçimler eklensin: 'Bugün 23:59', 'Pazar 23:59', 7/14/30 gün. Haftalık fırsat formundaki END_OPTIONS + datetime-local deseni (WeeklyProductsTab.jsx:69-83, 196-203) aynen kullanılabilir. Düzenleme formu mevcut bitişi yerel tarih ve saatle göstersin, kaydederken saati korusun. Liste ve detayda 'Son gün 5 Kas 23:59 · 6 sa kaldı' yazsın. Tek seferlik düzeltme: userId'si olmayan (panelden açılmış), bitişi tam 00:00:00.000Z olan ve bitiş günü bugün ya da ileride olan kuponların bitişi aynı günün 20:59:59Z'sine (İstanbul 23:59:59) çekilsin. Önce etkilenecek kupon sayısı gösterilsin.

**Neden önemli:** Kupon, söylenen gün boyunca çalışır. Son gün akşamı (en yoğun sipariş saati) müşteri hata almaz; “kupon çalışmıyor” şikâyeti ve destek yükü biter. “Kuponunun süresi doluyor” otomatik bildirimi de doğru saate göre gider.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/coupons/CouponComposer.jsx:472-480 (type=date + 7/14/30/90 gün)`
- `frontend/src/components/coupons/CouponComposer.jsx:276-278 (uyarı 23:59:59'a göre)`
- `frontend/src/components/coupons/CouponComposer.jsx:643 (“Son gün” önizlemesi)`
- `frontend/src/components/coupons/CouponComposer.jsx:42 (dateIn → toISOString, UTC tarih)`
- `backend/controllers/coupon.controller.js:345 (geçmiş tarih reddi)`
- `backend/controllers/coupon.controller.js:377 (expirationDate: new Date(expirationDate))`
- `backend/controllers/coupon.controller.js:410-436 (güncellemede tarih denetimi yok)`
- `backend/services/coupon.service.js:114 (now › expirationDate → süresi dolmuş)`
- `frontend/src/components/coupons/couponUtils.js:54-76 (isExpired / daysLeft / expiryText)`

</details>

#### Aynı üründe çakışan fırsatları ve rafta satılamayan ürünleri uyar

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Fiyat kuralı “en düşük fiyat geçerli”. Liste fiyatı ₺30 olan ürün haftalık rafta ₺25'teyken %10 flaş (₺27) başlatılırsa flaş hiçbir işe yaramıyor, ürün kartlarında flaş rozeti de çıkmıyor; panel bunu söylemiyor. Flaş formu yalnızca başka bir flaşla çakışmayı denetliyor. Ürün listesi, sunucudan gelen “haftalık fırsatta” bilgisini (isWeeklyProduct, weeklyPrice) hiç göstermiyor. Haftalık fırsat eklerken yalnızca “şu an indirimli” yazıyor; süren ya da planlı flaş görünmüyor. Stokta olmayan ürün haftalık rafta görünmeye devam ediyor ama müşteri sepete ekleyemiyor; panelde yalnızca küçük bir rozet var, “Yayında” sayısı ve telefon önizlemesi onu da sayıyor. Gizli ürünün fırsatı müşteriye hiç görünmüyor ama panel isHidden bilgisini almadığından “Yayında” gösteriyor.

**Öneri:** Ürün listesinde “Haftalık ₺25” etiketi ve “Haftalık fırsatta” filtresi. Flaş formunda (tekli ve toplu önizleme) ürün başına: “Haftalık fırsat ₺25 daha düşük → bu flaş etkisiz kalır” (kırmızı; toplu formda “Haftalık fırsattakileri atla” seçeneği) ya da “Flaş daha düşük; müşteri flaş bitene kadar ₺22 öder” (bilgi). Haftalık fırsat formunda ürün seçilince süren/planlı flaş varsa: “Bu üründe %40 flaş var (Cuma 23:00'e kadar); o süre boyunca müşteri flaş fiyatını öder”. Haftalık ekranın üstünde “Raf sağlığı” şeridi: “2 ürün stokta yok: müşteri görüyor ama sepete ekleyemiyor · 1 ürün gizli: rafta görünmüyor” + “Durdur” / “Ürünü aç”. Telefon önizlemesinde bu kartlar soluk ve etiketli. Panel uç noktası isHidden'ı da döndürsün.

**Neden önemli:** Başlatılan flaşın sessizce boşa gitmesi, müşterinin en görünür rafta alamadığı ürünle karşılaşması ve “yayında sandığım fırsat görünmüyor” karışıklığı önlenir.

<details><summary>Kod kanıtı</summary>

- `backend/services/productPricing.js:86-92 (en düşük fiyat kazanır)`
- `backend/services/weeklyPrice.service.js:83 (flaş rozeti yalnızca indirim kazanınca)`
- `frontend/src/components/products/FlashSale.jsx:16-21 (yalnızca flaş–flaş çakışması)`
- `frontend/src/components/products/FlashSale.jsx:46-57 (toplu önizlemede haftalık bilgi yok)`
- `backend/controllers/product.controller.js:345-346 (liste haftalık fiyatla geliyor)`
- `frontend/src/components/WeeklyProductsTab.jsx:360-371 (seçili üründe flaş bilgisi yok)`
- `backend/controllers/weeklyProduct.controller.js:26-27 (müşteri rafı gizliyi eler, stoksuzu elemez)`
- `backend/controllers/weeklyProduct.controller.js:56 (panel isHidden almıyor)`
- `backend/controllers/cart.controller.js:160-161 (stoksuz ürün sepete eklenemez)`
- `frontend/src/components/WeeklyProductsTab.jsx:640 (önizleme stoksuz/gizliyi de sayıyor)`
- `frontend/src/components/WeeklyProductsTab.jsx:913 (yalnızca küçük rozet)`

</details>

#### Haftalık fırsat ve flaş indirimlerin satış etkisini göster

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Sipariş satırları hangi fiyattan satıldığını kaydediyor (originalPrice, priceSource: weekly/flash/discount, flashSaleId); eski siparişler için flaş eşleştirmesi de var. Ama hiçbir ekran bunu kampanya bazında toplamıyor. Haftalık fırsatlar ekranındaki göstergeler yalnız sayım (Yayında, Pasif, Bu hafta biten, Ortalama indirim), satırda yalnız eski → yeni fiyat var. Flash sale çekmecesinde bir kampanyanın adedi, cirosu ve verdiği indirim görünmüyor. Raf performansı kartı yalnız 'eklendiği raf' bazında toplam veriyor. Toplu flaş kampanyalarının ortak bir kimliği yok: kampanya adı her ürün kaydına 'Pepsi haftası · Ürün' olarak yazılıyor ve çekmecede ürünler ayrı satırlarda duruyor; biten kampanyada yalnız 'Kaydı sil' var. Haftalık fırsat 'Raftan kaldır' ile veritabanından kalıcı siliniyor; biten fırsatın dönemi ve fiyatı yalnız işlem kaydında kalıyor.

**Öneri:** Sunucuda kampanya performansı hesaplansın (iptaller hariç). Flaş için flashSaleId'li satırlar; haftalık fırsat için ürün + priceSource=weekly + fırsatın başlangıç–bitiş aralığındaki satırlar kullanılsın. Çıktı: adet, sipariş, ciro ve verilen indirim = Σ(originalPrice − price) × adet. Haftalık satırına kısa özet eklensin ('34 adet · ₺1.020 ciro · ₺204 indirim'); göstergelere 'Bu haftaki fırsat cirosu' ve 'Verilen fırsat indirimi' gelsin. 3 günde hiç satmayan fırsata 'Satmıyor' rozeti ve 'Fiyatı düşür / Raftan al' önerisi çıksın. 'Önceki eşit süre' kıyası yalnız yeterli satış varsa gösterilsin; küçük adetlerde yanıltıcıdır. Haftalık kayıt silinmesin, arşivlensin (archivedAt; liste varsayılan olarak gizler) ki biten fırsatın sonucu görülebilsin. Toplu flaşa batchId ve campaignName alanı eklensin; eski kayıtlar ' · ' önekine ve aynı başlangıç/bitiş/orana göre gruplansın. Çekmecede grup satırı '12 ürün · %20 · 340 adet · ₺5.100' biçiminde olsun; grupta 'Tümünü bitir', biten grupta 'Aynı ürünlerle tekrar başlat' düğmesi bulunsun (toplu flaş formu dolu açılır).

**Neden önemli:** Sahibi hangi fırsatın gerçekten satış artırdığını, hangisinin sadece indirim verdiğini görür; işe yarayanı tekrarlar, satmayanı rafta tutmaz. Haftalık raf seçimi tahminden veriye döner.

<details><summary>Kod kanıtı</summary>

- `backend/models/order.model.js:34-39 (originalPrice, priceSource, flashSaleId, source)`
- `backend/services/order.service.js:95-110 (satıra fiyat kaynağı yazılıyor)`
- `backend/controllers/ordersAnalytics.controller.js:187-230 (eski siparişte flaş eşleştirme)`
- `backend/controllers/recommendation.controller.js:128-150 (yalnızca raf kaynağına göre özet)`
- `frontend/src/components/WeeklyProductsTab.jsx:794-799 (göstergeler yalnızca sayım)`
- `frontend/src/components/WeeklyProductsTab.jsx:902-914 (satırda yalnızca fiyat)`
- `frontend/src/components/products/FlashSale.jsx:213-268 (FlashSaleRow: satış bilgisi yok)`
- `frontend/src/components/products/FlashSale.jsx:271-343 (grup ve tekrar başlat yok)`

</details>

#### Haftalık fırsatları önceden planla, geçen haftayı kopyala, toplu ekle

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Haftalık fırsat modelinde başlangıç tarihi var ve müşteri tarafı buna göre süzüyor (başlamamış fırsat görünmüyor, zamanlayıcı başlayanları sayıyor). Ama ekleme uç noktası startDate'i okumuyor, formda yalnızca bitiş seçenekleri var; yeni haftanın fırsatları ancak o gün elle eklenebiliyor. Ürünler tek tek ekleniyor (çekmece başına bir ürün, çoklu seçim yok). Süresi dolan fırsatı yeniden açmak için her ürünü açıp yeni bitiş seçmek ve yayına almak gerekiyor; doğrudan açınca “bitiş tarihi geçmiş” hatası dönüyor. “Ürün başına tek aktif kayıt” indeksi ileri tarihli ikinci kaydı da engelliyor.

**Öneri:** Formda “Başlangıç” seçimi: Şimdi / Yarın 00:00 / Pazartesi 00:00 / Tarih seç. Listede yeni durum “Planlı · Pzt 00:00'da başlar”, filtre ve gösterge. Sunucu startDate'i alsın; benzersiz indeks yerine “aynı ürün için tarih aralıkları çakışmasın” denetimi. Listeye çoklu seçim ve toplu işlem: “Seçilenleri yeni haftaya kopyala” (aynı indirim oranı güncel liste fiyatından yeniden hesaplanır, yeni başlangıç/bitiş) ve “Durdur / Kaldır”. “Rafa toplu ekle” çekmecesi: arama + çoklu seçim + ortak % ve tarih, ürün ürün eski → yeni fiyat önizlemesi (toplu flaş formundaki gibi).

**Neden önemli:** “Pazartesi sabahı tek tek ekle” rutini “pazar akşamı 2 dakikada planla”ya döner. Başarılı haftayı tekrar kullanmak tek tık; hafta başında raf boş kalmaz.

<details><summary>Kod kanıtı</summary>

- `backend/models/weeklyProduct.model.js:22-25 (startDate alanı var)`
- `backend/models/weeklyProduct.model.js:41 (ürün başına tek aktif kayıt indeksi)`
- `backend/services/productPricing.js:47-53 (müşteri tarafı startDate'e uyuyor)`
- `backend/services/weeklyPrice.service.js:119-126 (zamanlayıcı başlayanları sayıyor)`
- `backend/controllers/weeklyProduct.controller.js:79 (startDate okunmuyor)`
- `backend/controllers/weeklyProduct.controller.js:118-125 (kayıtta startDate yok)`
- `backend/controllers/weeklyProduct.controller.js:283 (süresi dolanı açma hatası)`
- `frontend/src/components/WeeklyProductsTab.jsx:197-204 (yalnızca bitiş seçenekleri)`
- `frontend/src/components/WeeklyProductsTab.jsx:300-319 (startDate gönderilmiyor)`
- `frontend/src/components/WeeklyProductsTab.jsx:242-248 (tek ürün seçimi)`

</details>

#### Kupon sonuçlarını doğru say: iptaller hariç, dönemli, yeni müşteri odaklı

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Kupon analitiği tüm zamanları alıyor ve iptal edilen siparişleri de sayıyor (yalnızca couponCode dolu mu diye bakıyor). Oysa iptalde kupon kullanımı geri alınıyor ve Satış analizi kupon indirimini iptaller hariç, dönemli gösteriyor; iki ekran farklı sayı veriyor. “İndirim verimi: ₺1 indirim başına ₺X gelir” siparişin tamamını kupona yazıyor; kupon olmadan da gelecek müşteriyi ayırmıyor. Kuponun kaç yeni müşteri getirdiği, onların tekrar gelip gelmediği görünmüyor. İlk sipariş kontrolü yalnızca hesap bazında; aynı numarayla açılmış ikinci hesap “yeni” sayılıyor (Müşteriler ekranı “Aynı numara” gruplarını zaten hesaplıyor). İstek kampanyası “dağıtılan kupon”, görevler “tanımlanan kupon ₺” gösteriyor: bunlar verilen söz, kullanılan ve gerçekten harcanan değil.

**Öneri:** Analitik uç noktası from/to alsın ve “İptal Edildi” siparişleri dışlasın. Kuponlar ekranına dönem seçici (Bugün / 7 gün / 30 gün / Bu ay / Tümü). Her kupon için iki yeni sütun: “Yeni müşteri” (kuponlu sipariş müşterinin ilk geçerli siparişiyse; aynı telefonla daha önce sipariş verilmişse sayılmaz ve detayda “Aynı numarayla önceki sipariş var” rozeti çıkar) ve “30 günde tekrar gelen” (bu yeni müşterilerden kaçı ikinci sipariş verdi). “İndirim verimi” yerine “Yeni müşteri başına maliyet” ve “Tekrar gelme oranı”. İstek kampanyası ve görev kartlarında: “Kullanılan 18/30 · verilen indirim ₺540 · ciro ₺6.200” (TOP… ve GOREV… kodları kampanyaya bağlanabiliyor).

**Neden önemli:** Sahibi hangi kuponun gerçekten yeni ve kalıcı müşteri getirdiğini, hangisinin zaten gelecek müşteriye indirim dağıttığını görür; bütçeyi işe yarayana kaydırır. Ekranlar arası çelişkili sayılar biter.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/coupon.controller.js:258-305 (tüm zamanlar, iptal filtresi yok)`
- `backend/services/order.service.js:186-205 (iptalde kupon kullanımı geri alınıyor)`
- `backend/controllers/analytics.controller.js:326-339 (Satış analizi iptalleri dışlıyor)`
- `frontend/src/components/CouponsTab.jsx:418-420 (“tüm zamanlar”)`
- `frontend/src/components/CouponsTab.jsx:445-447 (“İndirim verimi”)`
- `frontend/src/components/coupons/CouponDetail.jsx:78-81 (₺1 indirim başına gelir)`
- `backend/services/coupon.service.js:166-175 (ilk sipariş: hesap bazında)`
- `backend/controllers/userController.js:175 (duplicatePhoneGroups mevcut)`
- `frontend/src/components/CouponRequestCampaignPanel.jsx:340 (dağıtılan kupon)`
- `frontend/src/components/MissionsPanel.jsx:176 (tanımlanan kupon ₺)`
- `backend/controllers/mission.controller.js:45 (totalReward = tamamlama × ödül)`

</details>

#### Bildirim: bölgeye göre gönder, ileri saate planla, 72 saatte sonucunu gör

Etki 4/5 · Efor: Büyük (3 günden fazla) · Sunucu: evet

**Şu an:** Kitleler yalnızca tüm müşteriler, sepeti dolu, son 30 günde sipariş veren, 30 gündür vermeyen ve hiç vermeyen; teslimat bölgesine göre kitle yok. Oysa kuponlar bölgeye özel açılabiliyor ve siparişler bölge bilgisini taşıyor; Devrek'e özel bir kupon yalnızca Devrek müşterisine duyurulamıyor. Bildirim yalnızca “şimdi” gidiyor; akşam yoğunluğu için öğleden hazırlayıp planlamak mümkün değil, sipariş saatleri dışında gönderime uyarı da yok. Otomatik bildirimlerde 72 saatlik dönüşüm ve ciro var, ama tek seferlik bildirim geçmişinde yalnızca “gönderildi · kaç kişi” var; alıcılar kaydedilmediği için sonuç ölçülemiyor. Aynı kitleye aynı akşam birden fazla bildirime karşı yalnızca “10 dk içinde aynı metin” denetimi var. Telefonda (≤900 px) gönder düğmesi ve önizleme; yapay zekâ kutusu, 9 hazır metin ve kitle kartlarının altında kalıyor.

**Öneri:** (1) Kime: “Bölge” seçimi (Kız yurdu / Erkek yurdu / Devrek adres) = son geçerli siparişi o bölgeye olanlar; mevcut kitleyle birleşir (ör. “Devrek + 30 gündür yok”), ulaşılacak kişi sayısı anında görünür. (2) Ne zaman: “Şimdi / Bugün 20:30 / Yarın 12:00 / Tarih seç”; sipariş saatleri dışında ya da mağaza kapalıyken uyarı; “Planlı” listesi (düzenle / iptal); gönderimi mevcut dakikalık zamanlayıcı yapar; “Bu kitleye son 24 saatte 1 bildirim gitti” uyarısı. (3) Sonuç: gönderimde alıcı kimlikleri saklanır; geçmişte her satırda “72 saatte 23 sipariş · ₺5.480 · alıcıların %5,6'sı” ve kıyas “aynı kişiler önceki 72 saatte %2,1”. (4) Telefonda gönderim kartı alta yapışık çubuk olur: “Tüm müşteriler · 412 kişi · Test · Gönder”.

**Neden önemli:** Doğru kişiye doğru saatte bildirim gider; yurt öğrencisi Devrek kampanyasıyla, Devrek müşterisi yurt duyurusuyla rahatsız edilmez. Sahibi hangi metnin sipariş getirdiğini görüp onu tekrarlar; bildirim yorgunluğu ve izin kapatma azalır.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/notification.controller.js:22-28 (kitlelerde bölge yok)`
- `backend/controllers/notification.controller.js:175-195 (buildAudienceFilter)`
- `backend/controllers/notification.controller.js:276-330 (anında gönderim, yalnızca 10 dk aynı metin denetimi)`
- `backend/models/pushBroadcast.model.js:4-19 (plan, alıcı, dönüşüm alanı yok)`
- `frontend/src/components/PushBroadcastTab.jsx:452-468 (kitle kartları)`
- `frontend/src/components/PushBroadcastTab.jsx:537-565 (geçmiş: yalnızca gönderildi/kişi)`
- `frontend/src/components/push/AutomationPanel.jsx:190-191 (otomasyonda dönüşüm ve ciro var)`
- `backend/services/notificationAutomation.service.js:1123-1150 (attributeConversions)`
- `frontend/src/components/coupons/CouponComposer.jsx:527-556 (kupon bölgeye özel olabiliyor)`
- `backend/models/order.model.js:72-91 (siparişte yurt/bölge bilgisi)`
- `backend/models/settings.model.js:20-43 (sipariş saatleri)`
- `backend/services/flashSale.service.js:262 (dakikalık zamanlayıcı)`
- `frontend/src/styles/admin-theme.css:1942-1948 (telefonda gönder kartı en altta)`

</details>

#### Kupon listesini ayır: kampanya kuponları ve otomatik/kişiye özel kuponlar

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Panelden açılan genel kuponlar ile sistemin ürettiği kişiye özel kuponlar (davet HOSGELDIN/TESEKKUR, istek kampanyası TOP…, görev GOREV…, otomasyon IKINCI…/DONUS…, şikâyet telafisi TELAFI…) aynı listede duruyor; varsayılan filtre 'Tümü'. 'Aktif kupon' göstergesi hepsini sayıyor. Dikkat şeridindeki '3 gün içinde sona eriyor' kuralı kişisel kuponlara da uygulandığı için istek kampanyası ya da otomasyon kuponları şeridi dolduruyor ve sahibinin kendi kuponları görünmez oluyor. Kaynak alanı yok ama ayırmak için gereken bilgi zaten var: panel kuponlarında userId yok, her sistem kuponunda userId ve sabit bir kod öneki var. /coupons/all tüm kişisel kuponları kullanım geçmişleriyle birlikte sayfasız yüklüyor; otomasyon kuponları biriktikçe ekran ağırlaşacak.

**Öneri:** Kaynak, şema değişikliği yapmadan türetilsin (couponUtils.sourceOf). userId yoksa Kampanya; isReferralCoupon ise Davet · hoş geldin; TESEKKUR ise Davet · teşekkür; TOP ise İstek kampanyası; GOREV ise Görev; IKINCI/DONUS ise Otomasyon; TELAFI ise Telafi. Kuponlar ekranında iki sekme olsun: 'Kampanya kuponları' (varsayılan) ve 'Kişiye özel kuponlar'. İkinci sekmede kaynak başına özet kart gösterilsin, örneğin 'Görev kuponları: 42 verildi · 17 kullanıldı · ₺850 indirim · 6'sı 3 gün içinde bitiyor'; karta tıklayınca o kaynağın listesi açılsın. Dikkat şeridi ve 'Aktif kupon' göstergesi yalnız kampanya kuponlarını saysın; kişisel kuponlar şeritte kaynak başına tek satır olsun. İsteğe bağlı sunucu adımı: /coupons/all?scope=campaign|personal ile kişisel kuponlar ayrı ve sayfalı gelsin.

**Neden önemli:** Sahibi kendi kampanyalarını kalabalık içinde aramaz; dikkat şeridi yeniden işe yarar. Otomatik kuponların toplam maliyeti kaynak bazında görünür.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/CouponsTab.jsx:83-84 (varsayılan “Tümü”)`
- `frontend/src/components/CouponsTab.jsx:139 (Aktif kupon hepsini sayıyor)`
- `frontend/src/components/CouponsTab.jsx:450-466 (dikkat şeridi ilk 6 madde)`
- `frontend/src/components/coupons/couponUtils.js:86-100 (tür filtreleri, kaynak yok)`
- `frontend/src/components/coupons/couponUtils.js:228-245 (“3 gün” kuralı kişisel kuponlara da)`
- `backend/models/coupon.model.js:3-140 (kaynak alanı yok)`
- `backend/controllers/couponRequest.controller.js:66-76 (TOP… kuponları)`
- `backend/services/mission.service.js:34-52 (GOREV… kuponları)`
- `backend/services/notificationAutomation.service.js:38 (IKINCI/DONUS önekleri)`
- `backend/services/feedbackFollowUp.service.js:96-110 (telafi kuponu)`
- `backend/controllers/referral.controller.js:199-210 (TESEKKUR referans işaretsiz)`

</details>

#### Liste fiyatı değişince haftalık fırsatın indirim yüzdesi güncellensin

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Haftalık fırsatın indirim yüzdesi yalnız eklerken ya da düzenlerken, o anki liste fiyatından hesaplanıp kaydediliyor. Sonra ürünün liste fiyatı (satır içi ya da toplu fiyat güncellemesiyle) değişirse yüzde eski kalıyor. Örnek: liste ₺30'dan ₺36'ya çıkınca ₺25'lik fırsat gerçekte %31 indirimdir, ama satırda, telefon önizlemesinde ve 'Ortalama indirim' göstergesinde %17 yazar. API de kayıtlı yüzdeyi (discountPercentage / weeklyDiscountPercentage) güncel liste fiyatıyla (originalPrice) yan yana döndürüyor. Fiyat güncellemesi normal indirimi yeni fiyata göre düzeltiyor ama haftalık fırsatlara hiç bakmıyor. Sahibi, zamdan sonra fırsatın marjı ne kadar erittiğini görmüyor.

**Öneri:** Yüzde, okunurken güncel liste fiyatından hesaplansın; getWeeklyProducts, getAllWeeklyProducts ve decorateProduct aynı yardımcıyı kullansın. Kayıtlı alan yalnız geriye uyumluluk için dolu kalsın. Fırsata eklendiği andaki liste fiyatı saklansın; değiştiyse satırda uyarı çıksın: 'Liste fiyatı ₺30 → ₺36 oldu; fırsat indirimi %17 → %31', yanında 'Fırsat fiyatını güncelle' düğmesi. Ürün kataloğunda, haftalık fırsattaki bir ürünün fiyatı değiştirilirken bilgi notu gösterilsin.

**Neden önemli:** Müşteriye gösterilen indirim oranı her zaman doğru olur. Zamdan sonra haftalık fırsatın marjı sessizce erimez; sahibi farkı görüp fiyatı tek tıkla düzeltir.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/weeklyProduct.controller.js:114-122 (yüzde yalnız eklemede kaydediliyor)`
- `backend/services/weeklyPrice.service.js:48-49, 78-79 (kayıtlı yüzde ve güncel liste fiyatı birlikte dönüyor)`
- `backend/controllers/product.controller.js:380-405 (fiyat güncellemesi yalnız normal indirimi düzeltiyor, haftalık fırsatlara dokunmuyor)`
- `frontend/src/components/WeeklyProductsTab.jsx:910-911 (kayıtlı yüzde ile canlı tasarruf yan yana)`
- `frontend/src/components/WeeklyProductsTab.jsx:185, 613-619 (telefon önizlemesi ve 'Ortalama indirim' kayıtlı yüzdeden)`

</details>

#### İptal edilen ilk sipariş, ilk siparişe özel kuponu yakmasın

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** 'Yalnız ilk sipariş' kuralı, durumuna bakmadan müşterinin herhangi bir siparişi var mı diye bakıyor; iptal edilen sipariş de sayılıyor. İptalde kupon kullanımı geri açılıyor (usedBy kaydı çekiliyor). Ama müşteri yeniden denediğinde 'Bu kupon sadece ilk siparişiniz için geçerlidir' hatası alıyor ve kupon cüzdanından da kalkıyor. Davet hoş geldin kuponu ve paneldeki 'Hoş geldin' şablonu bu kuralı kullanıyor. İlk siparişte telefon teyidi yaygınlaştıkça (teyit için ulaşılamayan ilk sipariş elle iptal edildiğinde) bu durum daha sık yaşanacak. Teyit kuralı ise 'teslim edilmiş sipariş var mı' üzerinden çalışıyor. Otomasyon kodu bu davranışı yalnız tutarlılık için taklit ediyor ('iptal edilenler dahil her siparişi sayar'); iş kuralı olarak bilinçli seçilmiş değil.

**Öneri:** İlk sipariş denetimi yalnız iptal edilmemiş siparişlere baksın (status ≠ 'İptal Edildi'). Kural evaluateCoupon, cüzdan ve otomasyon bağlamında tek bir yardımcıdan gelsin ki üçü yine aynı sonucu versin. Kupon kural özetine 'İptal edilen sipariş sayılmaz' notu eklensin. Sipariş çekmecesinde ilk sipariş iptal edilirken bilgi çıksın: 'Müşterinin hoş geldin kuponu geri açılacak'.

**Neden önemli:** İlk siparişi teyit edilemediği ya da stok yüzünden iptal edilen yeni müşteri, hoş geldin indirimini kaybetmez; 'kuponum kayboldu' şikâyeti olmaz. Devrek açılışında yeni müşteri kazanmak tam da bu ilk sipariş anına dayanıyor.

<details><summary>Kod kanıtı</summary>

- `backend/services/coupon.service.js:165-174 (firstOrderOnly denetimi Order.exists({ user }) ile, durum filtresi yok)`
- `backend/controllers/coupon.controller.js:57-60, 86 (cüzdan, siparişi olan müşteride ilk sipariş kuponunu gizliyor)`
- `backend/services/order.service.js:185-206 (iptalde kupon kullanımı geri açılıyor)`
- `backend/services/notificationAutomation.service.js:619 ('iptal edilenler dahil her siparişi sayar' notu)`
- `backend/services/delivery.service.js:494-501 (ilk sipariş teyidi 'Teslim Edildi' durumuna bakıyor)`
- `backend/controllers/referral.controller.js:155 ve frontend/src/components/coupons/CouponComposer.jsx:64 (hoş geldin kuponları firstOrderOnly)`

</details>

#### Davet ödüllerini panelden ayarla, programın gerçek maliyetini göster

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Davet ödülleri kodda sabit. Davet edilen kayıt anında %5 kupon alıyor (en fazla ₺50, ₺50 sepet, 7 gün). Davet eden, davetlinin ilk teslim edilen siparişinden sonra %5 kupon alıyor (en fazla ₺25, 30 gün). Her kod 1 başarılı davetle sınırlı. Uygulamaya giden yanıt ödülü yalnız yüzde alanlarıyla taşıyor (inviteeDiscountPercent, rewardDiscountPercent, rewardExpiresInDays); kod kontrol mesajı ve ödül bildirimi '%5' yazıyor, paneldeki 'Nasıl işler' adımlarında da '%5' elle yazılmış. Kod başına davet sınırı (maxReferrals) her davet kaydına ayrı yazılıyor ve sınırı dolan kod kapatılıyor. 'Verilen kupon' göstergesi 'başarılı × 2' ile hesaplanıyor; oysa hoş geldin kuponu kayıt anında her davetliye veriliyor, bu yüzden sayı eksik çıkıyor. Kuponların kaçının kullanıldığı, ne kadar indirim verdiği ve davetle gelenlerin ne kadar alışveriş yaptığı görünmüyor.

**Öneri:** Davet sistemi ekranına, sunucuda saklanan bir 'Ödüller' kartı eklensin: davet edilen ve davet eden için yüzde, tavan (₺), min. sepet ve geçerlilik (gün). Kupon üretimi, uygulamaya giden yüzde alanları, kod kontrol mesajı, ödül bildirimi ve 'Nasıl işler' adımları bu ayardan okunsun. Sabit ₺ ödül türü, uygulama güncellenene kadar eklenmesin. Kod başına davet sayısı yalnız yeni kodlara uygulansın; mevcut kodlara uygulamak için açık bir 'mevcut kodları da güncelle' adımı olsun (sınırı dolmuş kodlar yeniden açılır). Göstergeler gerçek kupon verisinden (kod önekiyle) gelsin: hoş geldin kuponu verilen (= toplam davet) / kullanılan; teşekkür kuponu verilen / kullanılan; verilen indirim (iptaller hariç); davetle gelenlerin cirosu; kazanılan müşteri başına maliyet.

**Neden önemli:** Devrek açılışında en ucuz müşteri kazanma yolu davet; sahibi ödülü yazılım beklemeden ayarlar ve programın kâr ettirip ettirmediğini rakamla görür.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/referral.controller.js:37-39 (uygulamaya sabit %5 / %5 / 30 gün)`
- `backend/controllers/referral.controller.js:91 (sabit “%5” mesajı)`
- `backend/controllers/referral.controller.js:141-158 (hoş geldin kuponu kayıt anında)`
- `backend/controllers/referral.controller.js:196-210 (teşekkür kuponu, referans işaretsiz)`
- `backend/models/referral.model.js:26-30 (maxReferrals: 1)`
- `frontend/src/components/ReferralsTab.jsx:32-37 (adımlarda elle “%5”)`
- `frontend/src/components/ReferralsTab.jsx:275 (Verilen kupon = başarılı × 2)`

</details>

#### Fırsat fiyatı girerken kâr/zarar göster (kategori marjı veya alış fiyatı)

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Ürünlerde alış fiyatı ya da marj bilgisi yok ve 1.500 ürün için girilmesi gerçekçi değil. Haftalık fırsat formu yalnız '%X indirim · ₺Y tasarruf' gösteriyor (hızlı seçimler %50'ye kadar, elle %99). Flaş formu %1–99 kabul ediyor, toplu uygulama 200 ürüne kadar gidiyor. Derin indirimde ek onay yok; %9 yerine %90 yazmak tek tıkla yayına çıkar. Fiyat bekçisi ürün başına piyasa ortancasını tutuyor ama fırsat formlarında görünmüyor. Genel bakıştaki 'Kâr tahmini' tarayıcıda saklanan tek bir marjı indirimli ciroya uyguluyor; kampanya indirimi marjı eritse de kâr aynı oranda görünüyor.

**Öneri:** (1) Haftalık fırsat, tekli/toplu flaş ve 'Hepsine flaş indirim' formlarında %40 ve üstü indirim açık onay istesin: '%90 indirim: ₺30 → ₺3. Emin misiniz?'. Toplu önizlemede derin indirimli satırlar vurgulansın. (2) Fiyat bekçisinde kaydı olan ürün seçilince formda 'Piyasa ortancası ₺31 (3 market · 4 gün önce)' satırı çıksın; fırsat fiyatı ortancanın çok altındaysa bilgi notu gösterilsin. (3) Kâr tahmini kartında, siparişlerdeki originalPrice ile 'Kampanya indirimi' [Σ(liste − satış) × adet + kupon indirimi] ayrı satır olsun. Tahmin 'liste cirosu × marj − kampanya indirimi' ile hesaplansın; marj tarayıcı yerine sunucuda (Ayarlar) saklansın. Alış fiyatı ve kategori marjı tablosu şimdilik yapılmasın.

**Neden önemli:** Küçük bir markette en pahalı hata zararına fırsattır. Sahibi fiyatı girerken kârı görür; %9 yerine %90 gibi hatalı oranlar yayına çıkmaz, piyasa fiyatı sayesinde gereğinden derin indirim de yapılmaz.

<details><summary>Kod kanıtı</summary>

- `backend/models/product.model.js:3-60 (alış fiyatı/marj alanı yok)`
- `frontend/src/components/WeeklyProductsTab.jsx:205 (hızlı seçim %50'ye kadar)`
- `frontend/src/components/WeeklyProductsTab.jsx:466-479 (yalnızca tasarruf gösteriliyor)`
- `frontend/src/components/products/FlashSale.jsx:37-38 (%1–99, derin indirim onayı yok)`
- `frontend/src/components/products/FlashSale.jsx:127-140 (özet yalnızca eski → yeni fiyat)`
- `backend/controllers/flashSale.controller.js:195 (toplu en çok 200 ürün)`
- `backend/services/priceWatch.service.js:83-91 (piyasa ortancası)`
- `frontend/src/components/DashboardWidgets.jsx:230-262 (tek marj, indirimleri düşmüyor)`

</details>

#### Kampanya merkezi: şu an yayında olanlar, 14 günlük takvim, maliyet ve getiri

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Kampanyalar 6 ayrı yerde: Haftalık fırsatlar, Kuponlar (içinde istek kampanyası ve görevler), Vitrin görselleri, Bildirim gönder (otomasyonlar dahil), Davet sistemi; flaş indirimler ise Ürün kataloğundaki bir çekmecede. Hiçbir ekran 'şu an neler yayında, bu akşam ne bitiyor' sorusunu tek bakışta cevaplamıyor. Genel bakış'taki dikkat şeridi yalnız sipariş, destek, stok ve görsel maddelerine bakıyor. Kupon ve vitrin kayıtlarında başlangıç tarihi olmadığı için bugün anlamlı bir kampanya takvimi çizilemez.

**Öneri:** Genel bakış'a sürüklenebilir bir 'Kampanyalar' kartı eklensin. Satırlar: Flaş (yayında N · en yakın bitiş '2 sa'), Haftalık raf (N ürün · stoksuz M), Genel kupon (N · bugün biten K), Kupon isteği (% ilerleme), Görev (N), Vitrin görseli (N), Otomatik bildirim (açık/4). Her satır admin-navigate ile ilgili ekrana gider. Dikkat şeridine kampanya maddeleri eklensin: 'Bu akşam biten kampanya', 'Haftalık rafta stoksuz/gizli ürün', 'Yayında haftalık fırsat yok'. Sunucuda tek hafif uç nokta yeter (GET /api/campaigns/summary: yalnız sayımlar ve en yakın bitişler); alternatif olarak dashboard özetine bir 'campaigns' alanı eklenebilir. Takvim görünümü ve 'son 30 gün sonuçları' tablosu, vitrin takvimi ile fırsat ve kupon performans verisi geldikten sonra ayrıca değerlendirilsin.

**Neden önemli:** Sahibi her akşam tek ekrana bakıp neyin yayında olduğunu, neyin biteceğini ve hangisinin para kazandırdığını görür. Biten kampanyayı unutma, boş raf, aynı güne yığılmış kampanya gibi hatalar kalmaz; “devam ettir / durdur” kararı veriye dayanır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/admin/adminNavigation.js:54-63 (5 ayrı kampanya ekranı)`
- `frontend/src/components/admin/adminNavigation.js:46 (flash sale ürün kataloğunun içinde)`
- `frontend/src/components/ProductsList.jsx:1084 (FlashSaleManager yalnızca ürün ekranında)`
- `frontend/src/components/DashboardWidgets.jsx:381-388 (dikkat şeridinde kampanya yok)`
- `frontend/src/components/DashboardWidgets.jsx:628-631 (yalnızca ekran kısayolları)`
- `frontend/src/components/coupons/couponUtils.js:228-245 (dikkat listesi yalnızca kuponlar)`
- `backend/models/coupon.model.js:66-69 (yalnızca bitiş tarihi)`
- `backend/models/banner.model.js:3-31 (tarih alanı yok)`
- `backend/server.js:296-331 (kampanya özeti uç noktası yok)`

</details>

#### Kuponlarda marj koruması: indirimli ürünü hariç tut, tavan, en kötü maliyet

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Kupon, sepetteki ürünlerin indirimli (haftalık/flaş) fiyatı üzerinden hesaplanıyor; %30 haftalık fırsatın üstüne %20 kupon binip %44 indirime dönüşebiliyor ve bunu kapatacak bir seçenek yok. Yüzde kuponda “En fazla indirim” boş bırakılınca “Sınırsız” oluyor, form uyarmıyor; toplam kullanım limiti de boş bırakılabiliyor. Formdaki uyarılar yalnızca tarih, saat aralığı ve “sabit indirim ≥ min. sepet” için. Kupon isteği kampanyasında indirim %100'e kadar girilebiliyor ve dağıtılan kişisel kuponlara hiç tavan konmuyor. Maliyet uyarısı yalnızca görev formunda var (“ödül, toplam sipariş tutarının %30'undan fazla”).

**Öneri:** (1) Kupon formuna “İndirimli ürünlerde geçerli değil” anahtarı: açıkken sunucu indirimi yalnızca liste fiyatından satılan satırlar üzerinden hesaplar; kural özetinde ve uygulamada “İndirimli ürünler hariç” yazar; şablonlarda varsayılan açık. (2) Yüzde kuponda tavan boşsa uyarı ve öneri: “%20 ve tavan yok: ₺2.000'lik sepette ₺400 indirim. ₺75 tavan önerilir.” (3) Önizlemeye “Maliyet” kutusu: “Kupon başına en fazla ₺75 · toplam limit 100 → en kötü ihtimalle ₺7.500”; limit yoksa “Toplam maliyet sınırsız”. (4) Kupon isteği formuna “En fazla indirim (₺)” alanı; dağıtılan kuponlara bu tavan yazılsın.

**Neden önemli:** Kampanyalar üst üste binip zararına satışa dönmez. Sahibi bir kuponun en kötü durumda kaça mal olacağını yayına almadan görür.

<details><summary>Kod kanıtı</summary>

- `backend/services/coupon.service.js:35-51 (kupon satırın indirimli fiyatı üzerinden)`
- `backend/services/order.service.js:95-110 (satır fiyatı haftalık/flaş)`
- `backend/models/coupon.model.js:3-140 (hariç tutma alanı yok)`
- `frontend/src/components/coupons/CouponComposer.jsx:275-288 (mevcut uyarılar)`
- `frontend/src/components/coupons/CouponComposer.jsx:446-456 (tavan boş = Sınırsız)`
- `frontend/src/components/coupons/CouponComposer.jsx:483-487 (toplam limit boş = Sınırsız)`
- `backend/controllers/couponRequest.controller.js:66-76 (dağıtılan kuponda tavan yok)`
- `frontend/src/components/coupons/CouponRequestComposer.jsx:166-205 (%1–100, tavan alanı yok)`
- `frontend/src/components/coupons/MissionComposer.jsx:92 (tek maliyet uyarısı görevde)`

</details>

#### Vitrin görsellerine yayın takvimi: kendiliğinden başlasın ve bitsin

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Vitrin görseli yalnızca “Yayında” anahtarıyla açılıp kapanıyor; başlangıç/bitiş tarihi yok, müşteri uç noktası isActive olan her görseli döndürüyor. Formdaki örnek başlık bile süreli bir kampanya (“Hafta sonu %20 indirim”); hafta sonu bitince kapatmak unutulursa müşteri artık olmayan bir indirimi görür. Filtreler yalnızca Yayında / Pasif; “planlı” ya da “bitti” durumu yok.

**Öneri:** Görsel formuna isteğe bağlı “Yayın başlangıcı” ve “Yayın bitişi” + hızlı seçimler (Bu hafta sonu: Cuma 18:00–Pazar 23:59, 3 gün, Pazar 23:59). Müşteri uç noktası yalnızca zamanı gelmiş ve bitmemiş görselleri döndürsün (uygulamada değişiklik gerekmez). Kartlarda durum rozeti: “Planlı · Cuma 18:00”, “Yayında · 2 gün kaldı”, “Bitti”; filtrelere “Planlı” ve “Biten”, göstergeye “Bu hafta biten”. Telefon önizlemesine saat seçici (“Cumartesi 20:00'de kaydırıcı”). Biten görsel silinmez; “Tekrar yayınla” ile yeni tarih verilir.

**Neden önemli:** Süresi geçmiş kampanya görseli müşteriye gösterilmez, yanıltıcı indirim şikâyeti olmaz. Hafta sonu görseli cuma öğleden hazırlanıp kendiliğinden yayına girer ve çıkar.

<details><summary>Kod kanıtı</summary>

- `backend/models/banner.model.js:3-31 (yalnızca isActive ve order)`
- `backend/controllers/banner.controller.js:23-27 (müşteriye isActive olan her görsel)`
- `frontend/src/components/BannerTab.jsx:105-109 (filtre: Yayında / Pasif)`
- `frontend/src/components/BannerTab.jsx:408-418 (örnek başlık “Hafta sonu %20 indirim”)`
- `frontend/src/components/BannerTab.jsx:446-462 (yalnızca aç/kapa anahtarı)`

</details>

#### Kampanya ekranlarında “siz” dili ve ortak bileşenlerle tutarlılık

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Panel “siz” dilini kullanıyor ama bu ekranlarda “sen” kalmış: “kupon ilgini bekliyor”, “İlk kuponunu … oluşturabilirsin”, “aramayı temizlemeyi dene”, “bir kampanya başlat”, “Müşterilerini … teşvik et”, “Kuralı belirle”, “düzenleyebilirsin”, “beğendiğini seç”, “Birine dokun”, “anlatmayı dene”. Ayrıca Kuponlar ekranı ortak kitteki PageHeader, KpiCard, SortHead, useMediaQuery, isTypingTarget ve klavye kısayollarının kendi kopyalarını kullanıyor (j/k gezinme ve “?” yardımı yok); Bildirim gönder kendi başlığını ve “ui-stat” kutularını, istek kampanyası ile görevler “cpg-kpi” kutularını kullanıyor. Aynı gruptaki Haftalık fırsatlar, Vitrin ve Davet ekranları ortak kiti kullandığından görünüm ve kısayollar ekrandan ekrana değişiyor.

**Öneri:** Metinleri “siz”e çevir: “kupon ilginizi bekliyor”, “İlk kuponunuzu hazır şablonlardan biriyle saniyeler içinde oluşturabilirsiniz”, “Filtreleri değiştirmeyi ya da aramayı temizlemeyi deneyin”, “Müşterilerin birlikte kupon kazandığı bir kampanya başlatın”, “Müşterilerinizi tekrar sipariş vermeye teşvik edin”, “Kuralı belirleyin”, “göndermeden önce düzenleyebilirsiniz”, “beğendiğinizi seçin”, “Birine dokunun, forma dolsun”, “Yapay zekâya anlatmayı deneyin”. Kuponlar ve Bildirim gönder başlıklarını PageHeader'a, göstergeleri KpiGrid/KpiCard'a taşı; kopya yardımcıları sil; Kuponlar listesine useListShortcuts (/, j/k, ↵, n, ?) ve ShortcutHelp ekle.

**Neden önemli:** Sahibinin “eksik ve tutarsızlık olmasın” standardı karşılanır; tüm kampanya ekranları aynı görünür ve aynı kısayollarla çalışır, öğrenme yükü ve bakım maliyeti düşer.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/CouponsTab.jsx:454, 521 (“ilgini”, “oluşturabilirsin”, “dene”)`
- `frontend/src/components/CouponRequestCampaignPanel.jsx:238 (“başlat”)`
- `frontend/src/components/MissionsPanel.jsx:160, 162 (“Müşterilerini”, “belirle”)`
- `frontend/src/components/PushBroadcastTab.jsx:180, 205 (“düzenleyebilirsin”, “beğendiğini seç”)`
- `frontend/src/components/push/PushLibrary.jsx:107, 135 (“dokun”, “dene”)`
- `frontend/src/components/CouponsTab.jsx:21-60, 185-203, 373-388 (kopya yardımcılar, kendi başlık ve kısayol)`
- `frontend/src/components/PushBroadcastTab.jsx:284-295, 318-335 (kendi başlık ve ui-stat)`
- `frontend/src/components/CouponRequestCampaignPanel.jsx:336-341 (cpg-kpi)`
- `frontend/src/components/MissionsPanel.jsx:172-177 (cpg-kpi)`
- `frontend/src/components/admin/ui/index.jsx:13, 82, 112, 170, 333, 423 (ortak kit karşılıkları)`

</details>

#### Kampanya ekranlarından siparişe, müşteriye ve ürüne tek tıkla geç

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Panelde ekranlar arası geçiş altyapısı hazır (sipariş, müşteri, ürün aktarımı; Siparişler, Müşteriler ve Ürün kataloğu bunu dinliyor; Genel bakış, Geri bildirimler ve komut paleti kullanıyor). Kampanya ekranları hiç kullanmıyor: kupon detayındaki kullanım geçmişinde sipariş no “#A1B2C3” düz metin, müşteri adı tıklanamıyor. Kupon isteği katılımcıları ve davet zincirindeki kişiler müşteri profiline açılmıyor. Haftalık fırsattaki ürün adı yalnızca fırsat düzenlemeyi açıyor; ürünün stok/fiyat/görseline gitmek için katalogda yeniden aramak gerekiyor.

**Öneri:** Kupon detayında sipariş no bağlantı olsun (Siparişler ekranında o sipariş açılır); müşteri adı Müşteriler › profil çekmecesini açsın. Kupon isteği katılımcıları ve davet zincirindeki kişiler de profile açılsın. Haftalık fırsat satırına küçük “Ürünü aç” düğmesi (Ürün kataloğunda ürün çekmecesi açılır). Hepsi mevcut setHandoff + admin-navigate ile yapılır; sunucu değişikliği gerekmez.

**Neden önemli:** Bir kuponu kimin hangi siparişte kullandığını kontrol etmek ya da stoksuz fırsat ürününü düzeltmek için arama yapmak gerekmez; günlük kontroller saniyelere iner.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/admin/ui/index.jsx:439-458 (setHandoff / takeHandoff / HANDOFF)`
- `frontend/src/pages/AdminPage.jsx:620-630 (admin-navigate olayı)`
- `frontend/src/components/orders/OrdersScreen.jsx:750-766 (sipariş aktarımını dinliyor)`
- `frontend/src/components/UsersTab.jsx:278 (müşteri aktarımını dinliyor)`
- `frontend/src/components/ProductsList.jsx:358 (ürün aktarımını dinliyor)`
- `frontend/src/components/coupons/CouponDetail.jsx:131-141 (sipariş no düz metin)`
- `frontend/src/components/CouponRequestCampaignPanel.jsx:76-93 (katılımcı satırları bağlantısız)`
- `frontend/src/components/ReferralsTab.jsx:60, 127 (kişiler bağlantısız)`
- `frontend/src/components/WeeklyProductsTab.jsx:897 (ürün adı yalnızca düzenlemeyi açıyor)`

</details>

### Müşteri ve destek

#### Destek, başvuru ve geri bildirim rozetleri; düşmeyen Mesajlar sayısı

Etki 4/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Kenar çubuğunda rozet yalnızca Siparişler ve Mesajlar'da. Mesajlar rozeti ve üstteki 'N mesaj' çipi başka ekrandayken gelen her mesajda 1 artıyor ama okununca düşmüyor; sayı ancak Yenile ya da sayfa yenilemesiyle düzeliyor. siteMessageCreated panelde dinlenmiyor ve zile kaydedilmiyor; lowFeedbackCreated yalnızca Geri bildirimler ekranı açıkken dinleniyor. Olumsuz geri bildirim sayısını veren hafif bir uç yok.

**Öneri:** Rozetler: 'Bekleyen destek' (bekleyen talep sayısı; biri 15 dk'yı aştıysa kırmızı; GET /support-requests ve destek soket olaylarıyla güncellenir), 'Başvurular' (site mesajlarının açık sayıları; 7 gün ya da daha az kalan KVKK başvurusu varsa kırmızı), 'Geri bildirimler' (yanıt bekleyen olumsuz kayıt; yeni hafif sayım ucu). Mesajlar ekranı okuma ve yanıttan sonra sayım olayı yayar (siparişlerdeki ORDERS_COUNT_EVENT gibi); kabuk sekmeye dönülünce /chat/unread-count'u tazeler. siteMessageCreated ve lowFeedbackCreated sunucuda notifyAdmins ile yayılır ve zile kaydedilir; panelde 'Aç' düğmeli toast çıkar. Üst durum çubuğuna 'destek' çipi eklenir.

**Neden önemli:** Sahip hangi ekranda olursa olsun bekleyen işi görür; KVKK süresi ya da kızgın müşteri gözden kaçmaz. Hiç düşmeyen yanlış mesaj sayısı panele güveni zedelemez.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/admin/adminNavigation.js:37`
- `frontend/src/components/admin/adminNavigation.js:70-73`
- `frontend/src/components/admin/AdminSidebar.jsx:177`
- `frontend/src/pages/AdminPage.jsx:99`
- `frontend/src/pages/AdminPage.jsx:270-299`
- `frontend/src/pages/AdminPage.jsx:398-411`
- `frontend/src/components/admin/AdminHeader.jsx:91-92`
- `frontend/src/components/ChatTab.jsx:129-132`
- `backend/controllers/siteMessage.controller.js:34`
- `frontend/src/components/FeedbackList.jsx:459-467`

</details>

#### Mesajlar açıkken başlayan yeni sohbetler listeye düşmüyor

Etki 4/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Mesajlar yalnızca açılışta /chat/list ile yüklenen sohbetleri gösteriyor. 'newChat' dinleyicisi var ama sunucu bu olayı hiçbir yerde yayınlamıyor; createChat hiçbir olay göndermiyor. 'chatUpdate' listede olmayan sohbeti yok sayıyor; 'SupportRequestCreated' yalnızca listede olan sohbeti güncelliyor. Panel Mesajlar sekmesindeyken kabuk yeni mesaj bildirimini de tümden atlıyor: rozet, toast ve zil yok. Sonuç: ekran açıldıktan sonra yapay zekâyla başlayıp insana aktarılan bir öğrencinin sohbeti ve sonraki mesajları 'Yenile'ye basılana kadar görünmüyor; yalnızca 6 sn'lik 'canlı destek bekliyor' toast'ı çıkıyor.

**Öneri:** Listede olmayan bir sohbet için chatUpdate ya da SupportRequestCreated gelirse sohbet GET /chat/:id ve /chat/:id/context ile çekilip listenin başına eklenir (openChatById'daki mantık; aynı sohbet için tekrar istek atılmaması için kısa süreli bir 'yükleniyor' kümesi tutulur). İsteğe bağlı olarak sunucu devir ve üstlenme anında adminRoom'a populate edilmiş sohbetle 'newChat' yayınlar. Mesajlar açıkken gelen yeni mesajda satır vurgulanır ve sekme başlığında sayı görünür.

**Neden önemli:** Akşam yoğunluğunda Mesajlar ekranında oturan sahip, canlı destek isteyen yeni öğrenciyi ve yazdıklarını anında görür; 'listede yoktu' diye geç kalınan yanıt biter.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/ChatTab.jsx:170-184`
- `frontend/src/components/ChatTab.jsx:199`
- `frontend/src/components/ChatTab.jsx:69-72`
- `backend/controllers/chat.controller.js:11-75`
- `backend/controllers/chat.controller.js:246-252`
- `frontend/src/pages/AdminPage.jsx:398-400`
- `backend/services/ai/assistant.service.js:47-50`

</details>

#### Devirde dürüst bekleme mesajı ve bekleyen talepte telefona uyarı

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Asistan devrederken saatten bağımsız sabit 'birazdan katılacak' mesajı gidiyor, gece 03:00'te de. Sunucu sipariş saatini biliyor ama devir kullanmıyor. Yöneticiye yalnızca soket ve zil bildirimi gidiyor; panelde destek talebi için ses yok, yalnızca kısa bir toast çıkıyor. Alarm telefonu ayrı bir Android uygulaması ve yalnızca 'Hazırlanıyor' siparişlerinde çalıyor. 15 dakikayı aşan talep yalnızca ekranda renk değiştiriyor.

**Öneri:** 1) Devir mesajı saate göre seçilir. Sipariş saatindeyse: 'Ekibimiz en kısa sürede görüşmeye katılacak.' Saat dışındaysa: 'Mesajın bize ulaştı; ekibimiz {açılış saati}'nde yanıtlayacak.' Saat dışındaki talep 'Mesai dışı' işaretlenir ve kuyruktaki 15 dk gecikme sayacı açılış saatinden başlar. Sayısal bekleme tahmini verilmez. 2) Panelde destek talebi ses (ayrı seçilebilir) ve siparişteki gibi tarayıcı bildirimi verir; toast'a 'Aç' düğmesi eklenir. 3) İkinci aşama: 3 dk'yı geçen bekleyen talep için alarm uygulamasının bekleyen siparişler ucuna 'destek bekliyor' kaydı (Android uygulaması güncellenir) ya da yönetici hesaplarına push. 15. dakikada bir kez tekrarlanır; yüksek ya da acil öncelikte hemen gönderilir.

**Neden önemli:** Gece yazan öğrenciye tutulamayacak söz verilmez; ne zaman dönüleceğini bilir. Sahip dağıtımdayken bile canlı destek isteyen müşteriyi kaçırmaz; şikâyet büyümeden yakalanır.

<details><summary>Kod kanıtı</summary>

- `backend/services/ai/assistant.service.js:15`
- `backend/services/ai/assistant.service.js:33-52`
- `backend/services/ai/storeInfo.service.js:66`
- `backend/services/adminFeed.service.js:122-125`
- `frontend/src/pages/AdminPage.jsx:376-395`
- `frontend/src/pages/AdminPage.jsx:460-466`
- `backend/services/orderAlarm.service.js:18`
- `frontend/src/components/chat/chatShared.jsx:33-34`

</details>

#### Mesajlar: 'Yanıt bekleyen' kutusu, bekleme süresi ve AI sohbetlerinin arşivi

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Varsayılan süzgeç 'Tümü'; sunucu tüm açık sohbetleri sınırsız döndürüyor. AI sohbetlerini kapatan bir iş yok ve sipariş başına ayrı AI sohbeti açılabildiği için liste zamanla AI sohbetleriyle doluyor. 'Okunmamış' süzgeci okunmamış sayısına bakıyor; sohbet açılınca sayı sıfırlandığı için yanıtlanmamış sohbet bu süzgeçten çıkıyor. 'İnsana aktarıldı' süzgeci devredilen sohbetleri ayırıyor ama yanıtlanmış olanları da içeriyor. Satırda yalnızca son mesajın saati var; bekleme süresi, öncelik ve AI özeti yok. Ekran 50'den eski mesajları yükleyemiyor.

**Öneri:** Varsayılan süzgeç 'Yanıt bekleyen' olur: modu WAITING_FOR_AGENT ya da HUMAN, açık ve son mesajı müşteriden ya da sistemden gelen sohbetler; en uzun bekleyen üstte. Sohbete awaitingSince alanı eklenir (müşteri yazdığında boşsa doldurulur, ekip yanıtlayınca null olur). Bekleme çipi bu alandan hesaplanır: 5 dk sarı, 15 dk kırmızı. Satırda öncelik rozeti ve AI özetinin ilk satırı görünür (liste ucu destek talebi özetini ekler). Okumak sohbeti kutudan çıkarmaz; yanıt yazmak, 'Yanıt gerekmiyor' (awaitingSince=null) ya da kapatmak çıkarır. AI sohbetleri kapatılmaz; /chat/list?mode=&page= ile sunucuda süzülür ve sayfalanır, 'Yapay zekâ' sekmesi yalnızca açılınca yüklenir. Konuşmanın başına mevcut page parametresini kullanan 'Önceki mesajlar' düğmesi eklenir.

**Neden önemli:** 21:00–01:00 yoğunluğunda sahibin önüne yalnızca cevap bekleyen müşteriler gelir. Göz atılıp unutulan mesaj kalmaz, cevap süresi kısalır; kaçan sipariş ve kötü yorum azalır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/ChatTab.jsx:19-25`
- `frontend/src/components/ChatTab.jsx:41`
- `frontend/src/components/ChatTab.jsx:129-132`
- `frontend/src/components/ChatTab.jsx:304-319`
- `backend/controllers/chat.controller.js:25-46`
- `backend/controllers/chat.controller.js:83-95`
- `backend/controllers/chat.controller.js:135-161`
- `frontend/src/components/chat/ChatList.jsx:31-33`
- `frontend/src/components/SupportQueueTab.jsx:50-51`

</details>

#### Müşteri profili: tek zaman çizelgesi ve 'Açık konular' şeridi

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Profil çekmecesinde yalnızca Siparişler, Ürünler ve Hesap sekmeleri var; geri bildirim tek satırda 'Bıraktı / Yok'. Kupon bölümü yalnızca siparişte kullanılmış kodları sayıyor. Telafi, görev, kupon talebi, davet ve otomasyonla müşteriye tanımlanan özel kuponlar ve bunların durumu görünmüyor. Profil sorgusu iptal nedenini, teslim edilemedi nedenini, teyit durumunu ve adresi çekmiyor; destek talepleri listelenmiyor. Mesajlar'daki müşteri kartı sipariş sayısını, son siparişi ve yalnızca o sohbetin destek talebini gösteriyor. (Siparişler çekmecesindeki Müşteri bölümü sipariş, harcama ve iptal sayılarını zaten veriyor.)

**Öneri:** Yeni 'Geçmiş' ucu yerine mevcut GET /users/:id/profile genişletilir. (1) Son siparişlerde durumla birlikte iptal nedeni, teslim edilemedi nedeni, teyit durumu (needsCallback/callbackConfirmedAt), bölge ve tek satır adres gösterilir; satıra tıklayınca sipariş açılır. (2) 'Kuponlar' bölümü: müşteriye özel kuponlar kaynağıyla (telafi, görev, kupon talebi, davet, otomasyon) ve durumuyla (kullanıldı / kullanılmadı · N gün kaldı / süresi doldu). (3) 'Destek' bölümü: son geri bildirimler (puan ya da 👍/👎, etiket, yanıt, telafi) ve son destek talepleri (neden, AI özeti, durum, kim üstlendi). (4) Çekmecenin üstünde sunucuda hesaplanan 'Açık konular' şeridi: aktif sipariş, bekleyen destek talebi, yanıtsız şikâyet, kullanılmamış telafi kuponu (kalan gün), teyit bekleyen ilk sipariş, 'son 30 günde N kez teslim edilemedi'. Aynı şerit getChatContext'e eklenir ve Mesajlar'daki müşteri kartında da görünür. Her şeyi tek akışta gösteren zaman çizelgesi ikinci aşamaya kalır.

**Neden önemli:** Bir öğrenci 'siparişim eksik geldi' yazdığında sahip dört ekran gezmeden tüm geçmişi 10 saniyede görür: daha önce telafi aldı mı, kaç kez kapıda bulunamadı, açık talebi var mı. Karar doğru ve hızlı verilir; personel de aynı bilgiyle konuşur.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/customers/CustomerDrawer.jsx:15-19`
- `frontend/src/components/customers/CustomerDrawer.jsx:195`
- `frontend/src/components/customers/CustomerDrawer.jsx:72-85`
- `frontend/src/components/customers/CustomerDrawer.jsx:283-288`
- `backend/controllers/user.controller.js:205-216`
- `backend/controllers/user.controller.js:341-345`
- `frontend/src/components/chat/CustomerCard.jsx:64-96`
- `backend/controllers/chat.controller.js:418-437`

</details>

#### Süzgeçten eyleme: seçili kişilere ya da tek müşteriye bildirim ve kupon

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Müşteriler ekranında segment ve uygulama süzgeçleri ile çoklu seçim var; toplu çubuktaki tek eylem 'Seçilenleri sil'. Bildirim ekranı 5 sabit kitleye gönderiyor, başka kitleyi reddediyor. Tek kişiye bildirim yalnızca 'Deneme alıcısı' yoluyla gidiyor; geçmişe 'Deneme' diye yazılıyor ve bu yol kampanya tercihini atlıyor. Kupon oluşturma ucu müşteriye özel kupon almıyor; yöneticinin elle özel kupon verebildiği tek yer geri bildirimdeki telafi. 'Geri kazanma' (21–180 gün sessiz, isteğe bağlı kupon) ve 'İkinci sipariş' otomasyonları ise zaten var.

**Öneri:** 1) Profil çekmecesine 'Kupon tanımla': tutar ya da yüzde, alt sepet, geçerlilik günü, 'müşteriye bildir' seçeneği. createCompensationCoupon genelleştirilir ve POST /users/:id/coupons ucu eklenir (tek kullanımlık, userId'li, işlem kaydına yazılır). 2) Profilde ve toplu çubukta 'Bildirim gönder': Bildirimler ekranı 'Seçili müşteriler (N)' kitlesiyle açılır. Sunucuda audience=custom + userIds (üst sınır, ör. 500) ve kampanya izni süzgeci olur; ulaşılabilir kişi sayısı ve deneme akışı aynen çalışır; geçmişte 'Seçili N kişi' olarak görünür. 3) Seçili kişilere toplu özel kupon ikinci aşamaya kalır. Pasif temizlikteki 'Geri çağır' çıkarılır, çünkü geri kazanma otomasyonu bu işi zaten yapıyor.

**Neden önemli:** Bugün uygulamayı açıp sipariş vermeyen 20 kişiye aynı akşam hatırlatma, 30+ gündür sessiz sadık müşterilere geri dönüş kuponu, telefonla şikâyet eden öğrenciye anında gönül alma kuponu tek akışla verilir. Müşteri verisi doğrudan ciroya döner.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/UsersTab.jsx:529-547`
- `frontend/src/components/customers/shared.jsx:63-71`
- `frontend/src/components/customers/shared.jsx:148-155`
- `backend/controllers/notification.controller.js:22-28`
- `backend/controllers/notification.controller.js:284`
- `frontend/src/components/PushBroadcastTab.jsx:239`
- `frontend/src/components/PushBroadcastTab.jsx:556`
- `backend/controllers/coupon.controller.js:313-336`
- `backend/services/feedbackFollowUp.service.js:95-115`
- `frontend/src/components/admin/ui/index.jsx:458`
- `frontend/src/components/AccountCleanupTab.jsx:588-611`

</details>

#### Profil, sohbet ve geri bildirimden siparişe tek tıkla, kesin geçiş

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Profildeki son 10 sipariş tıklanamayan düz satır; ürünleri ya da adresi görmek için kodu akılda tutup Siparişler'de aramak gerekiyor. Mesajlar'daki 'Siparişlerini aç' müşterinin adını arama metni olarak gönderiyor (aynı adlı müşteriler karışır); son sipariş kutusu tıklanamıyor. Geri bildirimdeki 'Siparişi aç' kimliğin yalnızca son 6 hanesini gönderiyor; oysa Siparişler ekranı 24 haneli kimlikle siparişi doğrudan çekmecede açabiliyor. Geri bildirim çekmecesinde ve destek kuyruğu kartında 'Profili aç' yok.

**Öneri:** Profildeki her sipariş satırı ve sohbet kartındaki son sipariş kutusu tam kimlikle (HANDOFF.order) Siparişler'de o siparişin çekmecesini açar. 'Siparişlerini aç' ad yerine tekil e-postayla arar. Geri bildirimdeki 'Siparişi aç' tam kimliği gönderir. Geri bildirim çekmecesine ve destek kuyruğu kartına 'Profili aç' (HANDOFF.user) eklenir. Sunucu değişikliği gerekmez.

**Neden önemli:** Şikâyet ya da soru sırasında doğru siparişe tek dokunuşla ulaşılır; aynı adlı iki öğrencinin siparişleri karışıp yanlış kişiye işlem yapılması önlenir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/customers/CustomerDrawer.jsx:55-70`
- `frontend/src/components/chat/CustomerCard.jsx:79-90`
- `frontend/src/components/chat/CustomerCard.jsx:124`
- `frontend/src/components/FeedbackList.jsx:619-623`
- `frontend/src/components/FeedbackList.jsx:189`
- `frontend/src/components/SupportQueueTab.jsx:78-86`
- `frontend/src/components/orders/shared.js:1405-1411`
- `frontend/src/components/orders/OrdersScreen.jsx:594-604`

</details>

#### Sohbeti sil/kapat yan etkileri: silinen sohbet açık kalıyor, kapanış diğer ekranlara yayılmıyor

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** 'Sohbeti sil (arşivle)' yalnızca isDeleted=true yapıyor; durum 'active', mod (AI/HUMAN) ve açık destek talebi olduğu gibi kalıyor. createChat mevcut sohbeti ararken isDeleted'a bakmıyor, sendMessage silinmiş sohbete yazmaya izin veriyor, openFeedbackSupport da silinmiş sohbeti yeniden kullanabiliyor. Müşteri bu silinmiş sohbete yazmayı sürdürüyor; sohbet ne paneldeki listede ne müşterinin kendi listesinde görünüyor ve okunmamış mesajları rozet sayımına girmiyor. Liste AI sohbetleriyle dolduğu için sahibin temizlik amacıyla 'Sil'e basması olası. Ayrıca 'Sohbeti kapat' destek talebini veritabanında kapatıyor ama adminRoom'a SupportRequestClosed yayınlamıyor ve kapanış mesajını müşteriye newMessage ile göndermiyor. Başka cihazdaki Bekleyen destekler ekranı eski kartı göstermeye devam ediyor ve 'Çözüldü' 404 veriyor.

**Öneri:** Sunucu silerken sohbeti de kapatır: status closed, mode CLOSED, açık talep kapatılır, chatClosed ve SupportRequestClosed yayınlanır. Alternatif olarak açık sohbette 'Sil' pasif olur ve 'Önce kapatın' der. createChat, openFeedbackSupport ve sendMessage silinmiş kayıtları dışlar; müşteri yeni bir sohbete yönlendirilir. closeChat kapanış mesajını newMessage ile müşteriye, SupportRequestClosed'u adminRoom'a yayınlar ve lastMessage'ı günceller.

**Neden önemli:** Silinen ya da kapatılan konuşmada müşteri boşluğa yazmaz; sahip ve personel aynı güncel kuyruğu görür. Sohbetin yaşam döngüsü 'hata istemiyorum' standardına uygun ve temiz olur.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/chat.controller.js:388-407`
- `backend/controllers/chat.controller.js:25-30`
- `backend/controllers/chat.controller.js:184-197`
- `backend/services/feedbackFollowUp.service.js:56-58`
- `backend/controllers/chat.controller.js:83`
- `backend/controllers/chat.controller.js:120`
- `backend/controllers/chat.controller.js:373-376`
- `backend/controllers/chat.controller.js:333-368`
- `frontend/src/components/chat/ChatThread.jsx:228`

</details>

#### Ekipçe ortak, değişkenli hızlı yanıtlar (sohbet ve geri bildirim)

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Hızlı cevaplar tarayıcının yerel deposunda; başka cihazda ve personelde görünmüyor, tarayıcı verisi silinince kayboluyor. Şablonlar düz metin, değişken yok. Varsayılanlar 'siz' diliyle; sipariş çekmecesindeki WhatsApp şablonları ise 'sen' diliyle ve kod/tutarla yazıyor. Sohbetin geri kalanı da 'siz': asistan istemi, karşılama mesajı ve devir mesajı müşteriye 'siz' diye hitap ediyor. Geri bildirim yanıtında şablon yok.

**Öneri:** Şablonlar Ayarlar'da, sunucuda tutulur; tüm yöneticiler ve cihazlar aynı listeyi görür. Kategoriler olur, yazma alanında '/' ile arama açılır, Alt+1-9 korunur. Değişkenler ({ad}, {siparisKodu}, {durum}, {tutar}, {kurye}, {kuponKodu}) getChatContext'teki aktif ya da son siparişten dolar; kurye ve kupon için bağlam ucuna alan eklenir. Dolmayan değişkende uyarı verilir. Aynı liste geri bildirim yanıtında da seçilebilir. Ton: sahip destek kanalı için tek bir ses seçer. 'Sen' seçilirse asistan istemi, karşılama ve devir mesajları ile destek bildirim metinleri de aynı işte 'sen'e çevrilir; yalnızca şablonları değiştirmek aynı sohbette siz/sen karışıklığı yaratır.

**Neden önemli:** Yoğun saatte aynı cümleyi tekrar yazmak biter. Personel sahip kadar hızlı ve aynı üslupla yanıt verir; sipariş kodu ve tutar elle yazılmadığı için yanlış bilgi gitmez.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/chat/ChatThread.jsx:74`
- `frontend/src/components/ChatTab.jsx:64`
- `frontend/src/components/admin/ui/index.jsx:55-80`
- `frontend/src/components/chat/chatShared.jsx:36-44`
- `frontend/src/components/orders/shared.js:1313-1349`
- `frontend/src/components/FeedbackList.jsx:391-402`

</details>

#### Hesap işlemlerinde güvenlik: aktif siparişte silme engeli, etki özeti

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Her satırda ve mobil kartta Profil, Düzenle, Şifre ve Sil ikonları yan yana duruyor; silme 5 sn'lik 'Geri al' süresinden sonra kesinleşiyor. DELETE /users/:id, 'Hazırlanıyor' ya da 'Yolda' siparişi olan müşteriyi de siliyor; pasif temizlik ise bunu engelliyor. Silme sohbetleri, destek taleplerini, adresleri, özel kuponları ve davetleri de kaldırıyor ama çekmece yalnızca 'Kullanıcı kaydı silinir' diyor. Toplu silme tek onayla sırayla istek atıyor ve yalnızca başarısız sayısını söylüyor. Pasif temizlikteki DeleteDialog'un arkasındaki uç yalnızca pasif segmentteki hesapları silebiliyor. Geçici şifrede uzunluk kontrolü yok.

**Öneri:** Sunucu, aktif siparişi olan müşteriyi silmeyi 409 ile reddeder ('#A1B2C3 teslim edilince silebilirsiniz'). GET /users/:id/delete-preview ucu silinecek sohbet, adres, kullanılmamış özel kupon ve açık destek talebi sayılarını döndürür. Çekmecede 'Silinecekler / Korunanlar' özeti ve 'SİL' yazma onayı olur. Toplu silme mevcut döngüde kalır ama ilerleme gösterir ve 409/404 nedenlerini 'atlananlar' olarak listeler; DeleteDialog'un görünümü paylaşılabilir ama uç farklıdır. Mobil kartta eylemler 'Ara', 'WhatsApp' ve 'Profil' olur; düzenle, şifre ve sil çekmeceye taşınır. Şifre sıfırlamaya 'Güçlü şifre üret' düğmesi gelir; sunucuda kayıt kuralıyla aynı biçimde en az 6 karakter denetlenir.

**Neden önemli:** Gece yoğunluğunda telefonda yanlış dokunuşla yoldaki siparişin sahibini ve sohbet geçmişini silmek gibi geri dönüşsüz hatalar önlenir. Telefondan en sık yapılan iş (müşteriyi aramak) tek dokunuşa iner.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/customers/CustomerRow.jsx:76-81`
- `frontend/src/styles/customers.css:921-922`
- `frontend/src/components/UsersTab.jsx:288-306`
- `frontend/src/components/UsersTab.jsx:308-326`
- `backend/controllers/userController.js:593-628`
- `backend/services/accountCleanup.service.js:39`
- `backend/services/accountCleanup.service.js:232`
- `frontend/src/components/account-cleanup/DeleteDialog.jsx:233-238`
- `backend/services/account.service.js:69-115`
- `frontend/src/components/customers/CustomerDrawer.jsx:248-253`
- `backend/controllers/userController.js:531-569`

</details>

#### Müşteriye iç not ve 'Dikkat' bayrağı (profil, sohbet, sipariş)

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Müşteri kaydında ekibin yazabileceği not ya da uyarı alanı yok; profil çekmecesinde ve sohbet kartında da yok. Siparişteki 'not' müşterinin kendi notu. 'Teslim edilemedi' nedenleri (adres bulunamadı, cevap yok, reddetti) sipariş başına tutuluyor ama müşteri düzeyinde uyarıya dönüşmüyor; bir sonraki siparişte personel bunu bilmiyor.

**Öneri:** Profilde 'İç not' (yalnızca yöneticiler görür; yazan ve tarih) ve hazır 'Dikkat' bayrakları: 'Siparişten önce ara', 'Adres tarifi zor', 'Kapıda kartla öder', 'Şikâyet geçmişi var'. Bayrak Mesajlar'daki müşteri kartında, Siparişler kuyruk kartı ve çekmecesinde, kurye fişinde çip olarak görünür. Aynı müşteride ikinci 'teslim edilemedi' kaydında 'Siparişten önce ara' bayrağı önerilir.

**Neden önemli:** Devrek'e adres teslimatı açılırken kurye ve personel aynı bilgiyle çalışır; boşa giden kurye seferi ve tekrar eden 'teslim edilemedi' azalır. Sahibin aklında tuttuğu bilgi ekibe geçer.

<details><summary>Kod kanıtı</summary>

- `backend/models/user.model.js:6-117`
- `frontend/src/components/customers/CustomerDrawer.jsx:118-256`
- `frontend/src/components/chat/CustomerCard.jsx:56-120`
- `backend/models/order.model.js:67-70`
- `backend/models/order.model.js:140-150`

</details>

#### Telafi döngüsü: önce müşteri geçmişi, sonra kupon ve geri dönüş takibi

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Çözüm bölümünde telafi tutarı yalnızca sipariş tutarından öneriliyor. Müşterinin sipariş ve şikâyet sayısı ile önceki telafileri görünmüyor, 'Profili aç' da yok. Sunucu yalnızca aynı geri bildirime ikinci kuponu engelliyor; aynı müşteri her şikâyette yeni kupon alabiliyor. Kupon verildikten sonra yalnızca 'X TL kupon' rozeti kalıyor; kuponun kullanılıp kullanılmadığı görünmüyor, oysa kupon kaydı bu bilgiyi tutuyor. Kupon süresi doluyor otomasyonu (açıksa) kullanılmamış kuponu zaten hatırlatıyor.

**Öneri:** Çözüm bölümüne profil ucundan beslenen bir müşteri şeridi eklenir: 'X sipariş · Y TL · son 90 günde N şikâyet · önceki telafiler (tutar, tarih, durum)' ve 'Profili aç'. Müşteri son 30 günde telafi aldıysa uyarı ve ikinci onay çıkar; sunucu da bu durumda açık onay bayrağı olmadan 409 döner. Kupon verildikten sonra bir durum satırı görünür: 'Kullanıldı · 3 gün sonra · #A1B2C3', 'Kullanılmadı · 9 gün kaldı' ya da 'Süresi doldu' (GET /feedback yanıtına kupon durumu eklenir). Listeye 'Telafi verildi, kullanılmadı' çipi eklenir. Hatırlatma otomasyona bırakılır; kaydın durumu kendiliğinden değişmez. Telafi sonrası geri dönüş oranı KPI'ı ikinci aşamaya kalır.

**Neden önemli:** Şikâyet eden öğrencinin gerçekten geri dönüp dönmediği ölçülür; işe yaramayan telafi tekrarlanmaz. Aynı kişiye üst üste kupon verilerek kâr kaybı önlenir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/FeedbackList.jsx:154`
- `frontend/src/components/FeedbackList.jsx:300-331`
- `frontend/src/components/FeedbackList.jsx:189`
- `backend/controllers/feedback.controller.js:246`
- `backend/services/feedbackFollowUp.service.js:24-29`
- `backend/models/coupon.model.js:44-69`
- `backend/models/feedback.model.js:110-117`

</details>

#### Bekleyen destekler: KPI'lar kapananları da saysın, 'Çözülenler' görünümü

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Ekran /support-requests'i durum vermeden çağırıyor; sunucu yalnızca açık talepleri döndürüyor. 'Ort. ilk yanıt' ve 'Bugün açılan' yalnızca açık taleplerden hesaplanıyor, talepler kapandıkça değerler değişiyor. Yönetici sohbete doğrudan katıldığında açılan talepler 0 dk ilk yanıtla ortalamayı aşağı çekiyor ve kartta 'Yapay zekâ aktardı' görünüyor. Kapanmış görüşmeler Mesajlar › Kapalı süzgecinde ve müşteri kartındaki talep bilgisinde görülebiliyor.

**Öneri:** Küçük bir GET /support-requests/stats?since=bugün ucu eklenir: bugün açılan ve çözülen sayısı, medyan ilk yanıt, en uzun bekleme ve mesai dışı gelen talepler. Medyan ilk yanıta yalnızca AI'nın aktardığı talepler girer; 'Yönetici sohbete doğrudan katıldı' kayıtları hariç tutulur. Kartta bu kayıtlar 'Siz katıldınız' etiketiyle görünür. Ayrı 'Çözülenler' listesi yerine KPI'dan Mesajlar › Kapalı'ya geçiş yeterli; gerekirse ikinci aşamada ?status=closed&since=7g eklenir.

**Neden önemli:** Sahip gün sonunda 'bugün kaç kişi canlı destek istedi, ne kadar beklettik' sorusunun doğru cevabını görür; oynayan, yanıltıcı ortalamaya göre karar verilmez.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/SupportQueueTab.jsx:110`
- `backend/controllers/supportRequest.controller.js:8`
- `frontend/src/components/SupportQueueTab.jsx:39-43`
- `frontend/src/components/SupportQueueTab.jsx:160-164`
- `frontend/src/components/SupportQueueTab.jsx:226-229`
- `frontend/src/components/SupportQueueTab.jsx:149`

</details>

#### Memnuniyet raporu: 'address' yerine bölge adları ve kurye kırılımı

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** 'Teslimat noktasına göre' tablosu yalnızca iki yurdun adını biliyor; adrese teslim siparişlerin değerlendirmeleri ham 'address' yazısıyla çıkacak. Anket kaydı siparişten yalnızca deliveryPoint'i kopyalıyor; üç sabit bölge bu alanla birebir eşleşiyor. Kurye bilgisi ankete kopyalanmıyor. Devrek planı kurye bazında gün sonu kasası ve %90 zamanında teslim ölçütü öngörüyor, kurye bazında memnuniyet takibini değil.

**Öneri:** Tablo 'Bölgeye göre' olur: girlsDorm → Kız KYK Yurdu, boysDorm → Erkek KYK Yurdu, address → Devrek (adrese teslim); bilinmeyen değer için 'Diğer' yedeği. Satıra tıklayınca liste o bölgeyle süzülür. Kurye kırılımı, adres teslimatı herkese açılıp anket sayısı anlamlı olduğunda eklenir (ör. kurye başına en az 20 değerlendirme); o aşamada ankete siparişin courier.id değeri kopyalanır.

**Neden önemli:** Pilotta hangi bölgede ve hangi kuryede memnuniyetin düştüğü haftalık görülür; sorun kurye kaynaklıysa erken müdahale edilir, 'herkese aç' kararı veriyle verilir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/feedback/SatisfactionReport.jsx:14`
- `frontend/src/components/feedback/SatisfactionReport.jsx:169`
- `backend/controllers/feedbackReport.controller.js:107-125`
- `backend/controllers/orderFeedback.controller.js:191`
- `backend/models/order.model.js:71-75`
- `backend/models/order.model.js:87-91`
- `backend/models/order.model.js:154-158`
- `docs/devrek-teslimat-plani.md:124`
- `docs/devrek-teslimat-plani.md:128`

</details>

#### KVKK başvurusu: hesap eşleştirme, veri dökümü, silme ve yanıt kaydı

Etki 2/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** KVKK çekmecesinde başvuranın bilgileri, durum, süre çubuğu ve hazır e-posta taslağı var; başvurunun müşteri hesabıyla bağı yok. Kayıtta yalnızca durum, son işlem yapan ve zamanı tutuluyor; verilen yanıt saklanmıyor. 30 günlük süre yalnızca tarayıcıda hesaplanıyor, hatırlatma yok. Liste durumdan bağımsız son 200 kayıt; 'Açık' süzgeci tarayıcıda uygulanıyor. Hesap eşleştirme için mevcut /users/search ucu kullanılabilir. Başvuru sıklığı çok düşük.

**Öneri:** Çekmeceye 'Eşleşen hesap' kartı eklenir: e-posta ya da telefonla /users/search'ten bulunan müşterinin adı, sipariş sayısı, son görülmesi ve 'Profili aç' düğmesi. Silme ve düzeltme profil üzerinden yapılır. 'Tamamlandı' için kısa bir yanıt notu zorunlu olur; kayda replyNote, repliedAt ve repliedBy eklenir ve çekmecede gösterilir. Açık kayıtlar sunucuda süzülür (200 sınırı yalnızca kapananlara uygulanır) ve kalan güne göre sıralanır. Süre dolmadan 7 ve 2 gün önce günlük bir kontrolle zile bildirim düşer. 'Veri dökümünü indir' ikinci aşamaya kalır.

**Neden önemli:** Yasal 30 gün kaçırılmaz ve yapılan işlem ispatlanabilir. Sahip KVKK talebini ekran değiştirmeden, doğru hesapta ve eksiksiz veriyle dakikalar içinde kapatır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/SiteMessagesTab.jsx:36-38`
- `frontend/src/components/SiteMessagesTab.jsx:54-58`
- `frontend/src/components/SiteMessagesTab.jsx:61-117`
- `backend/models/siteMessage.model.js:4-14`
- `backend/controllers/siteMessage.controller.js:44`
- `frontend/src/components/SiteMessagesTab.jsx:143`
- `frontend/src/components/SiteMessagesTab.jsx:172`
- `frontend/src/components/SiteMessagesTab.jsx:329`
- `backend/routes/userRoutes.js:13-21`

</details>

### Kabuk, sistem ekranları ve tutarlılık

#### 'Mağazayı kapat' Devrek'i de kapsasın; süreli mola ve başlıkta mağaza durumu

Etki 5/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Ayarlar › Sipariş'teki 'Mağaza açık/kapalı' anahtarı yalnızca iki yurt noktasını değiştiriyor (OrderSection.jsx:21-37). Onay metni ise 'müşteriler hiçbir teslimat noktasına sipariş veremez' diyor. Adres akışı yalnızca yayın bayrağına (canOrderToAddress) ve devrek bölgesinin kendi durumuna bakıyor (cart.controller.js:398-431); iki akış için ortak tek kontrol çalışma saati (573-576). Bayrak bugün canlıda kapalı; pilot açıldığı anda 'kapattım' denen mağazaya Devrek'ten sipariş düşer. Bölge kartlarında kapanma nedeni (closedReason) var ama süreli kapatma ya da kendiliğinden açılma yok. Ayarlar › Teslimat'taki yurt saatleri düzenlenebiliyor ama siparişi etkilemiyor. Yurtlar üç ayrı yerden açılıp kapatılabiliyor. Başlıkta mağaza durumu görünmüyor.

**Öneri:** 1) Ayarlara tek bir 'mağaza durumu' kaydı eklensin: open / paused / closed, pausedUntil ve müşteriye gösterilecek neden. Kontrol placeOrderUnguarded'ın en başında, saat kontrolünün yanında yapılsın (cart.controller.js:571-576); böylece yurt ve adres akışı birlikte durur. 2) Mola bir üst katman olsun ve yurt ya da bölge bayraklarını değiştirmesin. Böylece süre dolunca sahibin ayrıca kapattığı bir bölge yanlışlıkla açılmaz. Süre istek anında pausedUntil ile kontrol edilir, zamanlanmış iş gerekmez. 3) Eski uygulama sürümleri de doğru görsün diye mola ya da kapalı durumda GET /settings ve GET /delivery/zones yanıtları noktaları ve bölgeleri kapalı, nedeniyle birlikte dönsün. Asistanın getStoreInfo'su da bu kaydı okusun. 4) Başlıkta durum çipi olsun: 'Açık · 01:00'e kadar', 'Saat dışı · 10:00'da açılır', 'Mola · 21:30'a kadar'. Çipe tıklayınca '30 dk mola', '1 saat mola', 'Bugünlük kapat', 'Şimdi aç' seçenekleri çıksın (onaylı ve işlem kaydına yazılır). Aynı komutlar komut paletinde de olsun. 5) Ayarlar'daki anahtar bu kayda bağlansın. Ayarlar › Teslimat'taki yurt anahtarları ve etkisiz saat alanları kaldırılıp 'Teslimat bölgelerinde yönetilir' bağlantısına dönsün. Kaldırmadan önce mobil uygulamanın nokta saatlerini gösterip göstermediği kontrol edilmeli.

**Neden önemli:** Adrese teslimat açıldığında, 'kapattım' sanılan anda Devrek'ten sipariş düşmesi engellenir. Yoğunlukta, kurye yokken ya da hastalıkta iki dokunuşla güvenli mola verilir. Açmayı unutmak ciro kaybettirmez.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/settings/OrderSection.jsx:21-37 (anahtar yalnızca iki yurt noktasını değiştirir)`
- `frontend/src/components/settings/OrderSection.jsx:66-77 ('Her iki teslimat noktası kapalı' metni)`
- `frontend/src/components/settings/settingsModel.js:4 (DELIVERY_POINT_KEYS = girlsDorm, boysDorm)`
- `frontend/src/components/settings/DeliverySection.jsx:59-71 (saat alanları 'bilgi amaçlıdır')`
- `backend/models/deliveryZone.model.js:3-9 (devrek ayrı sabit bölge)`
- `backend/controllers/cart.controller.js:397-431 (adres akışı yalnızca canOrderToAddress ve zone.enabled'a bakar)`
- `frontend/src/components/admin/AdminHeader.jsx:83-94 (durum çubuğunda mağaza durumu yok)`

</details>

#### Canlı bağlantı yaklaşık 20 sn'lik bir kesintiden sonra kalıcı olarak kopuyor; panel sessizce sipariş uyarısı vermeyi bırakıyor

Etki 4/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Socket.IO istemcisi reconnectionAttempts: 5 ile kuruluyor. Kütüphane 5 başarısız denemeden sonra (bekleme 1-2-4-5-5 sn, toplam yaklaşık 17 sn) 'reconnect_failed' yayıp yeniden bağlanmayı tamamen bırakıyor. Bu olayı dinleyen ya da tarayıcı 'online' olunca veya sekme görünür olunca socket.connect() çağıran kod yok; socketService.connect() var olan soketi döndürüyor. Dükkân internetinin 20 sn'den uzun gitmesi ya da dizüstünün uykudan geç ağa bağlanması yeterli: panel yenilenene kadar yeni sipariş sesi, bildirim kartı, tarayıcı bildirimi ve rozet artışı olmuyor. 1279 px altında başlıkta yalnızca küçük bir bağlantı simgesi kalıyor. Bağlantı geri gelse bile kesinti sırasında gelen sipariş için ses çalınmıyor: yeniden bağlanınca yalnızca zil listesi HTTP ile yenileniyor; sipariş rozeti (fetchAdminBadges) yalnızca açılışta ve elle yenilemede çekiliyor. Siparişler ekranındaki 30 sn'lik yoklama yalnızca o ekran açık ve görünürken listeyi tazeliyor ve ses çalmıyor.

**Öneri:** 1) Deneme sınırı kaldırılsın (Infinity, reconnectionDelayMax 10 sn) ya da 'reconnect_failed' olunca 30 sn'de bir socket.connect() denensin. Tarayıcı 'online' olunca ve sekme görünür olunca bağlantı kopuksa hemen bağlanılsın. 2) Yeniden bağlanınca ve sekme görünür olunca bekleyen siparişler HTTP ile çekilsin. Son bilinen sipariş kimliklerine göre yeni sipariş varsa bir kez ses, bildirim kartı ve tarayıcı bildirimi verilsin, rozet güncellensin. 3) Bağlantı 30 sn'den uzun koparsa başlıkta kırmızı 'Canlı bağlantı yok · siparişler 30 sn'de bir kontrol ediliyor' şeridi çıksın. Bu sürede, hangi ekran açık olursa olsun panel genelinde 30 sn'lik yedek yoklama çalışsın.

**Neden önemli:** Akşam yoğunluğunda kısa bir internet kesintisi ya da bilgisayarın uykudan uyanması, panelin sayfa yenilenene kadar sessiz kalmasına yol açmaz. Sahip, alarm telefonu yanında değilken de sipariş geldiğini kaçırmaz. Diğer uyarı iyileştirmeleri (ses seçimi, tekrar, alarm çipi) de ancak bağlantı canlıysa işe yarar.

<details><summary>Kod kanıtı</summary>

- `frontend/src/lib/socket.js:19-25 (reconnectionAttempts: 5; yeniden bağlanma yardımcısı yok)`
- `frontend/node_modules/socket.io-client/build/esm/manager.js:322-325 (sınır dolunca reconnect_failed yayılır ve denemeler durur)`
- `frontend/src/pages/AdminPage.jsx:124-133 (yalnızca connect/disconnect durumu tutulur)`
- `frontend/src/pages/AdminPage.jsx:350-353, 533-541 (yeniden bağlanınca yalnızca loadFeed; ses ya da rozet yok)`
- `frontend/src/pages/AdminPage.jsx:263-268, 311-324 (fetchAdminBadges yalnızca açılışta ve elle yenilemede)`
- `frontend/src/components/orders/useOrdersData.js:1452-1454, 1482-1486 ve orders/shared.js:32 (30 sn yoklama yalnızca Siparişler ekranı görünürken, sessiz)`
- `frontend/src/styles/admin-theme.css:2027-2029 (1279 px altında 'Bağlantı yok' yazısı gizli, yalnızca simge kalıyor)`

</details>

#### Sipariş kaçırmaya karşı: ses ayarı, ses engeli uyarısı, alarm telefonu çipi

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: hayır

**Şu an:** Yeni siparişte ses bir kez çalıyor. Ses dosyası localStorage 'notificationSound' anahtarından okunuyor ama bu anahtarı yazan bir ekran yok; public klasöründeki 7 sesten hep 'ringtone' çalıyor. Tarayıcı sesi engellerse hata sessizce yutuluyor, ekranda iz kalmıyor. Panelde sessize alma yok (useUserStore'daki soundEnabled kullanılmıyor). Tarayıcı bildirimi yalnızca siparişte var; destek talebi sadece toast. Bildirim izni panel açılır açılmaz tıklama olmadan isteniyor (Safari ve Firefox bunu engeller); elle açma seçeneği Siparişler › Diğer işlemler menüsünde gizli. Alarm telefonlarının bağlı olup olmadığı yalnızca Genel bakış'ta, varsayılan düzende yan sütunun en altındaki kartta görünüyor.

**Öneri:** 1) Zil panelinde 'Ses ve uyarılar' bölümü: 7 sesten seçim ve 'Dene' düğmesi, ses düzeyi, sessize al. Tercih tarayıcıda, mevcut notificationSound anahtarıyla saklansın. 2) audio.play() reddedilirse başlıkta sarı 'Ses kapalı · açmak için tıklayın' çipi çıksın; tek tıklama sesi açar ve bir kez dener. 3) Tekrarlayan ses yalnızca gerektiğinde çalsın: sipariş 'Hazırlanıyor'da kaldıkça ve hiçbir alarm telefonu onaylamadıkça (recentAcks) ya da bağlı telefon yoksa 30 sn'de bir, en çok 5 kez. Durum değişince, telefon 'Gördüm/Kabul' deyince ya da sipariş panelde açılınca dursun. 4) Destek talebinde de tarayıcı bildirimi gelsin. İzin açılışta tıklamasız istenmesin; zil panelindeki 'Masaüstü bildirimlerini aç' düğmesiyle istensin. 5) Başlıkta 'Alarm 2/2' çipi olsun (60 sn'de bir /order-alarm/status). Sipariş saatlerinde bağlı telefon sayısı 0'a düşerse kırmızı olsun ve bir kez tarayıcı bildirimi göndersin. Not: Canlı bağlantının kalıcı kopması bunlardan daha temel bir sorun; ayrı bulgu olarak verildi.

**Neden önemli:** Akşam yoğunluğunda sekme arkadayken ya da alarm telefonunun şarjı bitmişken sipariş dakikalarca beklemez. Bekleyen öğrenci, iptal ve kötü puan azalır.

<details><summary>Kod kanıtı</summary>

- `frontend/src/pages/AdminPage.jsx:460-466 (tek seferlik ses, hata yutulur)`
- `frontend/src/pages/AdminPage.jsx:516-530 (tarayıcı bildirimi yalnızca siparişte)`
- `frontend/src/pages/AdminPage.jsx:393-395 (destek talebi yalnızca toast)`
- `frontend/src/pages/AdminPage.jsx:544-546 (izin tıklamasız istenir)`
- `frontend/src/stores/useUserStore.js:16-18 (soundEnabled/toggleSound panelde kullanılmıyor)`
- `frontend/public/ (bell, chime, fur-elise, gnosienne-no1, notification, ringtone, vivaldi-winter .mp3 — seçim arayüzü yok)`
- `frontend/src/components/orders/OrdersHeader.jsx:87-89 (izin düğmesi menüde gizli)`
- `frontend/src/components/OrderAlarmDevicesCard.jsx:6, 24-28 (telefon durumu yalnızca bu kartta)`
- `frontend/src/components/DashboardWidgets.jsx:150 (alarm kartı yan sütunun sonunda)`
- `frontend/src/components/admin/AdminHeader.jsx:83-94 (durum çubuğunda alarm yok)`

</details>

#### Telefonda zil ve çıkış menüsü kırpılıyor; alt çubuk rozetsiz, düğmeler küçük

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: hayır

**Şu an:** 760 px altında başlığa (.app-top) 'overflow: hidden' veriliyor. Zil paneli ve hesap menüsü başlığın içinde 'position: absolute' ile başlığın altına açıldığı için kırpılıyor; telefonda bildirim listesi ve 'Güvenli çıkış' görünmüyor. Mobil menü çekmecesinde de çıkış düğmesi yok. Alt çubuk sabit 'Özet / Siparişler / Ürünler / Menü' ve sayı rozeti göstermiyor. Düğmeler 28–32 px, metin alanları 13 px; iOS'ta alana dokununca sayfa yakınlaşıyor. 16 px düzeltmesi yalnızca birkaç ekranda tek tek yapılmış.

**Öneri:** 1) Telefonda zil ve hesap menüsü alttan açılan sayfa (position: fixed) olsun ya da başlıktaki overflow kısıtı kaldırılıp taşma başka yoldan çözülsün. 2) Mobil menünün altına 'Tema' ve 'Çıkış yap'. 3) Alt çubukta sipariş ve mesaj rozetleri; sahip 3 sekmeyi kendisi seçebilsin (ör. Siparişler, Mesajlar, Fotokopi; tercih tarayıcıda saklanır). 4) Tek '@media (pointer: coarse)' kuralı: ui-btn ve ui-icon-btn en az 40 px, tüm alanlar 16 px yazı.

**Neden önemli:** Sahip akşamları panele telefondan bakıyor. Bildirimleri görür, yeni mesajı alt çubuktan fark eder; yanlış düğmeye basma ve iOS yakınlaşması biter. Telefon kaybolursa çıkış da menüden yapılabilir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/styles/admin-theme.css:2072-2080 (.app-top overflow: hidden, ≤760 px)`
- `frontend/src/styles/admin-theme.css:519-536 (.app-pop absolute, başlığın altına açılır)`
- `frontend/src/components/admin/AdminHeader.jsx:136-151, 246-261, 279-287 (zil ve hesap menüsü başlığın içinde)`
- `frontend/src/components/admin/AdminSidebar.jsx:200-234 (mobil menüde çıkış yok)`
- `frontend/src/components/admin/AdminSidebar.jsx:256-280 (alt çubuk sabit ve rozetsiz)`
- `frontend/src/styles/admin-system.css:149-161, 223-228, 256-264, 902-905 (32/28 px düğme, 13 px alan)`
- `frontend/src/styles/orders-drawer.css:1456 ve admin-theme.css:893 (16 px düzeltmesi tek tek)`

</details>

#### Zil ve rozetler tüm bekleyen işi göstersin; sayaç yalnızca okunmamışı saysın

Etki 4/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Menüde yalnızca Siparişler ve Mesajlar rozet alıyor. Sunucu yeni KVKK/iletişim başvurusunda 'siteMessageCreated' yayınlıyor ama panelde bunu dinleyen yok. Düşük puanlı anket ('lowFeedbackCreated') yalnızca Geri bildirimler ekranı açıkken duyuluyor. Fotokopi yüklemesi hiç bildirim üretmiyor. Zil sayacı listedeki tüm kayıtları (en çok 30) sayıyor; sık gelen 'uygulamayı açtı' kayıtları (10'a kadar) da buna dahil. Okundu bilgisi yok, yalnızca 'Temizle' var. Alt bağlantı her durumda 'Siparişlere git'. Sipariş rozeti için tüm aktif siparişler indirilip tarayıcıda sayılıyor.

**Öneri:** 1) Sunucu fotokopi yüklemesi, site başvurusu ve düşük puan için de notifyAdmins çağırsın (zile kaydedilsin). 2) Zil: 'okunmamış' sayacı (paneli son açış zamanı hesaba yazılır). Sekmeler: Tümü / Sipariş / Destek ve mesaj / Fotokopi ve başvuru / Uygulama. 'Uygulamayı açtı' sayaca girmesin; alt bağlantı seçili sekmenin ekranına gitsin. 3) Tek hafif uç GET /admin/badges: hazırlanan sipariş, okunmamış mesaj, bekleyen destek, bekleyen fotokopi, açık KVKK (7 günden az kaldıysa kırmızı), yanıtsız düşük puan. Kenar menüsü, alt çubuk ve sekme başlığı bunu kullansın; socket olaylarında tazelensin.

**Neden önemli:** Sınav öncesi fotokopi bekleyen öğrenci, 30 günlük yasal süresi işleyen KVKK başvurusu ve kızgın müşterinin düşük puanı ekran açılmadan görülür. Zil 'hep dolu' olmaktan çıkar; gerçek iş gürültüde kaybolmaz.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/admin/adminNavigation.js:37, 70 (rozet yalnızca orders ve chats)`
- `frontend/src/components/admin/AdminSidebar.jsx:176-189`
- `frontend/src/pages/AdminPage.jsx:280-300 (rozet için aktif sipariş listesi indirilir)`
- `frontend/src/pages/AdminPage.jsx:533-539 (dinlenen olaylar)`
- `backend/controllers/siteMessage.controller.js:34 (siteMessageCreated yayınlanır, frontend'de dinleyen yok)`
- `backend/controllers/orderFeedback.controller.js:152 + frontend/src/components/FeedbackList.jsx:465 (yalnızca ekran açıkken)`
- `backend/controllers/photocopy.controller.js:11-41 (yüklemede bildirim yok)`
- `frontend/src/components/admin/AdminHeader.jsx:143-149, 228-241 (sayaç = toplam kayıt; 'Siparişlere git')`
- `backend/services/adminFeed.service.js:9-10, 128-138 (30/10 sınırı, yalnızca temizleme)`

</details>

#### Asistanın hazır fotokopi bilgisi yanlış ve silinse de her oturumda geri geliyor

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: evet

**Şu an:** Bilgi merkezine kendiliğinden eklenen 'Fotokopi için hangi dosyaları yükleyebilirim?' kaydı asistana 'PDF, JPG, PNG, GIF, BMP, TIFF, Word, Excel, PowerPoint ve metin; dosya başına 50 MB' dedirtiyor. Sunucu ise yalnızca PDF, JPG, PNG, DOC, DOCX ve en çok 20 MB kabul ediyor. Excel, PowerPoint, GIF ya da 20 MB üstü dosya yükleyen öğrenci 'Yalnızca PDF, JPG, PNG, DOC ve DOCX yüklenebilir' hatası alıyor. Web'deki fotokopi sayfası da 50 MB yazıyor ve Excel, PowerPoint ile metin dosyası seçtiriyor. Ayrıca Asistan bilgileri ekranı her yeni tarayıcı oturumunda POST /ai/knowledge/seed çağırıyor. Tohumlama başlığa göre $setOnInsert ile çalıştığı için sahip bu kaydı silerse ya da başlığını değiştirirse yanlış kayıt bir sonraki oturumda aktif olarak geri geliyor. İçerik kodda düzeltilse bile veritabanındaki mevcut kayıt değişmiyor.

**Öneri:** 1) İzin verilen türler ve üst sınır sunucuda tek bir sabitte dursun; asistan kaydı ve web sayfası buradan beslensin (ör. GET /photocopy/rules). En azından üç metin '20 MB · PDF, JPG, PNG, Word' olarak düzeltilsin. 2) Veritabanındaki mevcut hazır kayıt bir kez düzeltilsin; tohumlama eski kaydı değiştirmez. 3) Tohumlama gerçekten bir kez olsun: sunucuda 'aiKnowledgeSeededAt' bayrağı tutulsun ya da silinen hazır kayıt 'kaldırıldı' olarak işaretlensin. Sahip sildiği bilgiyi bir daha görmesin.

**Neden önemli:** Sınav döneminde dosyası reddedilen öğrencinin asistandan yanlış bilgi alıp canlı desteğe düşmesi biter. Sahip sildiği bilginin geri gelmesiyle uğraşmaz; bilgi merkezine güveni artar.

<details><summary>Kod kanıtı</summary>

- `backend/controllers/aiKnowledge.controller.js:8 (50 MB ve geniş biçim listesi)`
- `backend/controllers/aiKnowledge.controller.js:15-27 (başlığa göre upsert, $setOnInsert)`
- `frontend/src/components/AiKnowledgeCenter.jsx:196-202 (her tarayıcı oturumunda seed çağrısı)`
- `backend/routes/photocopy.route.js:33-48 (yalnızca 5 MIME türü, 20 MB sınırı)`
- `frontend/src/pages/PhotocopyPage.jsx:48, 62-68, 295, 305 (50 MB; Excel, PowerPoint ve metin kabul ediliyor görünür)`

</details>

#### Açık ekran adres çubuğunda dursun: geri hareketi ve yenileme paneli bozmasın

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Açık ekran yalnızca bellekte tutuluyor; ekran değişimi URL'ye ve tarayıcı geçmişine yazılmıyor. Sayfa yenilenince çoğunlukla Genel bakış açılıyor (URL'den yalnızca orders, chat, support-queue ve ai-knowledge okunuyor). Android'de geri hareketi panelden tamamen çıkarıyor. Sohbete gidince URL'ye '?tab=chat&chatId=…' yazılıyor ama başka ekrana geçince silinmiyor; sonraki yenilemede yanlış ekran açılıyor.

**Öneri:** Ekran değişiminde '?tab=products' gibi parametre pushState ile yazılsın; popstate'te o ekran açılsın. Yenileme aynı ekranda kalsın ve tüm ekranlar URL'den açılabilsin. Ekrana özgü parametreler (chatId vb.) ekran değişince temizlensin. Telefonda açık çekmece varken geri hareketi önce çekmeceyi kapatsın.

**Neden önemli:** Telefonda alışkanlıkla geri hareketi yapan sahip panelden düşmez, panel baştan yüklenmez. Belirli bir ekran yer imi yapılabilir ya da ekiple bağlantı olarak paylaşılabilir.

<details><summary>Kod kanıtı</summary>

- `frontend/src/pages/AdminPage.jsx:89-92 (URL'den yalnızca 4 değer okunur)`
- `frontend/src/pages/AdminPage.jsx:613-617 (handleTabChange URL'ye yazmaz)`
- `frontend/src/pages/AdminPage.jsx:645, 668, 747-752 (yalnızca sohbet için replaceState; sonra temizlenmez)`
- `frontend/src/components/ChatTab.jsx:119-123 (popstate yalnızca sohbet içinde dinlenir)`

</details>

#### Koyu temada görünmeyen metinleri ve düşük kontrastlı düğmeleri düzelt

Etki 3/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Koyu temada birincil düğme beyaz yazı ve #3fa876 zemin kullanıyor: kontrast 2,97:1, üzerine gelince #58bd8c ile 2,31:1. Siparişler ve Hesap temizliği bunu ekran içinde 'color: var(--ui-bg)' ile düzeltmiş; diğer ekranlarda sorun sürüyor. Bildirim gönder'deki 'Yapay zekâ ile yaz' kartının zemini koyu temada da açık degrade (#f3faf6'dan #fff'e), başlığı açık renk (#e8ecef): 1,12:1, başlık görünmüyor. Öneri çipleri beyaz zemin üzerinde gri. Kuponlarda işaretli satırın zemini sabit #f3f8f5; koyu temada satır yazısı 1,11:1 ile kayboluyor. push-check kutuları (admin-theme.css:1292-1299) da sabit açık renk. Alan odak halkası iki temada da %16 saydam koyu yeşil ve koyu zeminde neredeyse görünmüyor; kenarlık rengi değiştiği için odak yine de seçilebiliyor.

**Öneri:** 1) admin-system.css'e '--ui-on-brand' belirteci eklensin (açık temada #fff, koyu temada var(--ui-bg)). .ui-btn--primary ve marka zeminli sayaçlar bunu kullansın; orders.css ve account-cleanup.css'teki yerel düzeltmeler silinsin. 2) .push-ai, .push-idea, .push-check--ok/--bad ve .cpn-row[data-checked] belirteçlerle yazılsın (--ui-surface-2, --ui-brand-soft, --ui-ok-bg, --ui-danger-bg). 3) İki temaya ayrı '--ui-focus' belirteci tanımlansın. 4) İsteğe bağlı: paket eklemeden küçük bir node betiği, admin CSS'lerinin background değerlerindeki ham açık renkleri (#f…, #fff, rgba(255,255,255,…)) listeleyip uyarsın.

**Neden önemli:** Gece çalışan sahip koyu temada her metni ve düğmeyi rahat okur; kampanya bildirimi yazarken seçenekler görünür. Yeni ekranlarda aynı hata tekrar etmez.

<details><summary>Kod kanıtı</summary>

- `frontend/src/styles/admin-system.css:76-77 (koyu --ui-brand #3fa876, --ui-brand-strong #58bd8c)`
- `frontend/src/styles/admin-system.css:182-190 (birincil düğme color: #fff)`
- `frontend/src/styles/admin-theme.css:1477-1488 (.push-ai sabit beyaz degrade)`
- `frontend/src/styles/admin-theme.css:1509-1513, 1525-1531 (başlık var(--ui-text); çip beyaz zemin)`
- `frontend/src/styles/coupons.css:624-626 (işaretli satır #f3f8f5)`
- `frontend/src/styles/admin-system.css:277-281 (odak halkası rgba(23,87,61,.16))`
- `frontend/src/components/PushBroadcastTab.jsx:340-344 (kartın kullanıldığı yer)`

</details>

#### Asistan bilgileri: cevaplanamayan sorular, 'Soruyu dene' kutusu ve tek AI ayarı

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Asistan bilgi merkezinde eşleşen kayıt ya da araç sonucu bulamayınca AiRequestLog'a 'model_uncertain_offer' yazıyor; bu kayıtları okuyan hiçbir uç ya da ekran yok. Ancak AiRequestLog müşterinin sorusunu saklamıyor; alanları conversation, provider, model, responseTimeMs, success, errorCode ve handoffReason. Bilgi merkezindeki 'Sağlayıcı ayarları' çekmecesi serbest metin model alanı kullanıyor ve asistanı kapatırken onay sormuyor. /ai/config yüklenemezse KPI kartı, sunucu varsayılanından (openrouter/gemma) farklı olan Groq · llama-3.1-8b-instant'ı gösteriyor. Ayarlar › Yapay zekâ ise canlı model listesi ve kapatma onayıyla çalışıyor.

**Öneri:** 1) AiRequestLog'a kısaltılmış bir 'query' alanı eklensin; yalnızca model_uncertain_offer ve provider_error için doldurulsun ve 30 günlük TTL verilsin. Müşteri mesajı zaten Message'ta saklandığı için yeni bir kişisel veri türü doğmaz. 2) Bilgi merkezinin üstünde 'Asistanın cevaplayamadığı sorular (son 7 gün)' listesi: basit normalizasyonla gruplanmış soru, kaç kez soruldu, son tarih. Her satırda 'Bilgi ekle' (başlığı soruyla dolu çekmece) ve 'Yoksay'. 3) 'Soruyu dene' kutusu: sunucuda rankKnowledgeRows ile eşleşen kayıtlar ve sıraları gösterilsin; model çağrılmaz, maliyetsiz. 4) Sağlayıcı çekmecesi kaldırılsın; Asistan KPI kartı Ayarlar › Yapay zekâ'yı açsın, böylece AI ayarı tek, onaylı ve doğru yerden değişir. Başarı oranı ve yanıt süresi KPI'ı isteğe bağlı.

**Neden önemli:** Akşam yoğunluğunda canlı desteğe düşen soru azalır. Sahip neyi yazacağını tahmin etmez, gerçek müşteri sorularına göre karar verir. AI ayarı tek yerden, onaylı ve doğru gösterilir.

<details><summary>Kod kanıtı</summary>

- `backend/services/ai/assistant.service.js:258-265 ('model_uncertain_offer' kaydı)`
- `backend/models/aiRequestLog.model.js:3-11`
- `backend/services/ai/assistant.service.js:19-22, 213 (findKnowledge / rankKnowledgeRows)`
- `frontend/src/components/AiKnowledgeCenter.jsx:17-22 (DEFAULT_CONFIG groq/llama)`
- `frontend/src/components/AiKnowledgeCenter.jsx:130-166 (onaysız, serbest metin sağlayıcı çekmecesi)`
- `frontend/src/components/AiKnowledgeCenter.jsx:192-194, 333 (hata olursa varsayılan gösterilir)`
- `frontend/src/components/settings/AiSection.jsx:14-33, 45-57 (canlı liste ve kapatma onayı)`
- `backend/controllers/aiKnowledge.controller.js:71-85`

</details>

#### Ayar kaydı, başka yerden yapılmış değişikliği sessizce geri almasın

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Kaydet, taslağın tamamını PUT /settings ile gönderiyor (SettingsTab.jsx:97; toPayload tüm belgeyi döndürür). Sunucu gönderilen her alanı yazıyor; temel değer ya da sürüm karşılaştırması yok ve deliveryPoints gelince yurt bölgelerini yeniden eşliyor (settings.controller.js:150-203). Aynı ayar belgesine Teslimat bölgeleri ekranı (yurt aç/kapat: delivery.service.js:244-254; yayın modu ve kuryeler: delivery.controller.js:515, 574) ve Asistan bilgileri çekmecesi (aiKnowledge.controller.js:76-85) de yazıyor. Aynı cihazda ekran değişince taslak, sunucu değiştiyse zaten atılıyor (SettingsTab.jsx:46-56). Sorun çok cihazda ya da çok sekmede çıkıyor: Ayarlar ekranı bir cihazda açık kalmışken başka cihazdan yurt kapatılırsa, ilk cihazda yalnızca minimum tutar değiştirilip kaydedildiğinde yurt eski 'Açık' değeriyle yeniden açılıyor. Hiç uyarı çıkmıyor.

**Öneri:** 1) Yalnızca değişen yollar gönderilsin. changedPaths zaten hesaplanıyor; sunucu kısmi gövdeyi alan alan birleştiriyor. Bu adım tek başına 'kapalı yurt geri açıldı' hatasını kapatır (S). 2) Her değişen yol için taslağın başladığı sunucu değeri (base) de gönderilsin. Sunucu yalnızca bu yolların şu anki değerini karşılaştırsın; farklıysa 409 ve güncel değerleri dönsün. updatedAt karşılaştırması kullanılmasın: kurye ekleme ve yayın modu aynı belgeyi kaydettiği için ilgisiz değişikliklerde de sahte çakışma çıkar. 3) 409 gelince ekranda alan alan 'Sunucudaki değer / Sizin değeriniz' kartı ile 'Benimkini uygula' ve 'Güncel değeri al' düğmeleri çıksın. 4) Kaydet çubuğunda kısa değişiklik özeti gösterilsin (FIELD_LABELS ve displayValue hazır).

**Neden önemli:** Sahip telefonu ve bilgisayarı birlikte kullanıyor. Kapatılmış bir yurdun ya da değiştirilmiş AI modelinin fark edilmeden geri açılması önlenir. Teslim edilemeyecek sipariş ve şikâyet riski kalkar.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/SettingsTab.jsx:89-116 (97: axios.put('/settings', toPayload(draft)))`
- `frontend/src/components/settings/settingsModel.js:108-113 (toPayload tüm belgeyi gönderir)`
- `backend/controllers/settings.controller.js:150-203 (sürüm kontrolü yok; 187-193 deliveryPoints birleştirme; 196 kayıt; 203 yurt bölgesi eşleme)`
- `backend/services/delivery.service.js:244-253 (Teslimat bölgeleri ekranı aynı ayar belgesine yazar)`
- `backend/controllers/aiKnowledge.controller.js:76-85 (AI çekmecesi settings.ai'yi üzerine yazar)`

</details>

#### Fotokopi dosyaları teslimden sonra süreli silinsin (KVKK), toplu temizlik

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Müşterilerin yüklediği belgeler (ödev, dilekçe gibi kişisel dosyalar) sunucu diskinde süresiz kalıyor. Silme yalnızca tek tek 'Dosyayı sil' ile ya da müşteri hesabı silinince yapılıyor. Otomatik temizleme işi yok (backend/jobs altında yalnızca sepet hatırlatma var). KVKK sayfasının 'Saklama Süreleri' bölümünde fotokopi dosyaları geçmiyor. Teslim edilen dosyaları toplu silme seçeneği yok.

**Öneri:** 1) Ayarlara 'Fotokopi dosyaları teslimden X gün sonra silinsin' (varsayılan 7 gün). Gece çalışan iş dosyayı diskten siler; kaydı (ücret, ödeme, kopya bilgisi) 'Dosya silindi' olarak tutar. 2) Listede teslim edilen satırda '3 gün sonra silinecek' etiketi, çekmecede 'Şimdi sil'. 3) 'Teslim edilenlerin dosyalarını sil (12)' toplu düğmesi, mevcut geri al süresiyle. 4) KVKK metnine fotokopi saklama süresi satırı eklensin.

**Neden önemli:** Öğrencilerin kişisel belgelerini gereğinden uzun tutmaktan doğan KVKK riski ve disk dolması önlenir. Sahip elle temizlik yapmak zorunda kalmaz.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/PhotocopyTab.jsx:209-214, 336-354 (yalnızca tek dosya silme)`
- `backend/controllers/photocopy.controller.js:71-85 (deleteFile)`
- `backend/services/account.service.js:89-92 (dosyalar yalnızca hesap silinince silinir)`
- `backend/models/photocopyFile.model.js:3-20 (saklama/silinme alanı yok)`
- `backend/jobs/cartReminder.job.js (tek zamanlanmış iş)`
- `frontend/src/pages/KVKKPage.jsx:153-168 (saklama sürelerinde fotokopi yok)`

</details>

#### Personel rolü ve oturum kontrolü: yalnız sipariş yetkisi, tüm cihazlardan çıkış

Etki 3/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Rol yalnızca 'customer' ya da 'admin'. Erişim tokeni 365 gün geçerli ve protectRoute yalnızca imzayı ve kullanıcının varlığını kontrol ediyor. 'Güvenli çıkış' yalnızca o tarayıcıyı kapatıyor; kaybolan telefondaki yönetici oturumunu uzaktan kapatmanın yolu yok. Alarm telefonları ayrı cihaz anahtarıyla çalışıyor ve panelden tek tek kaldırılabiliyor, ama eşleme yönetici şifresi istiyor ve işlem kayıtlarında eşleyen yönetici adına görünüyor. Personel bugün siparişi zaten alarm telefonundan, yalnızca ileri durumla yürütüyor.

**Öneri:** Önce oturum güvenliği (M): 1) Kullanıcıya tokenVersion alanı eklensin; token bu sürümü taşısın ve protectRoute karşılaştırsın. Kullanıcı zaten her istekte okunduğu için ek maliyet yok. 2) Hesap menüsüne 'Diğer tüm cihazlardan çık' eklensin: tokenVersion artar, yenileme anahtarı silinir. Yönetici için erişim tokeni daha kısa ömürlü olsun ve sessizce yenilensin. 3) İsteğe bağlı 'Oturumlar' listesi. Personel rolü (yalnızca Siparişler, Fotokopi ve Mesajlar; menü, rota ve uçlar role göre süzülür; alarm telefonu personel hesabıyla eşlenir) Devrek genişlemesinde personel ve kurye sayısı artınca ayrı bir L işi olarak ele alınsın.

**Neden önemli:** Sahip personeline sipariş ekranını gönül rahatlığıyla verir; yanlışlıkla fiyat değişmesi ya da tüm müşterilere bildirim gitmesi riski kalkar. İşlem kayıtlarında kimin ne yaptığı gerçekten görünür; kaybolan telefon tek tıkla etkisiz kalır.

<details><summary>Kod kanıtı</summary>

- `backend/models/user.model.js:91-95 (enum: customer, admin)`
- `backend/middleware/auth.middleware.js:6-27, 61-66 (yalnızca JWT imzası; adminRoute)`
- `frontend/src/App.jsx:116-119 (panel yalnızca admin rolüne açık)`
- `backend/controllers/user.controller.js:378-388 (müşteri → yönetici tek seçenek)`
- `backend/controllers/orderAlarm.controller.js:50-66 (eşleme yönetici şifresi ister)`
- `backend/controllers/auth.controller.js:39-54, 222 (365 gün token; kullanıcı başına tek yenileme anahtarı)`
- `frontend/src/components/admin/AdminHeader.jsx:279-287 (çıkış yalnızca bu tarayıcı)`
- `frontend/src/components/admin/AdminSidebar.jsx:230 ('Mağaza yöneticisi' sabit yazı)`

</details>

#### 'n' kısayol çakışması, Flash sale/Flaş indirim ikiliği ve ekran adı farkları

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** Genel 'n' kısayolu (AdminPage.jsx:243-245) her ekranda 'Ürün ekle'ye geçiriyor. Haftalık fırsatlar, Vitrin görselleri, Asistan bilgileri ve Kuponlar ekranlarında da 'n' = 'Yeni'. İki dinleyici birlikte çalıştığı için ekran kendi çekmecesini açarken panel 'Ürün ekle'ye atlıyor ve çekmece kayboluyor. Henüz yazı yazılmadığından veri kaybı yok, ama kullanıcı yanlış ekrana düşüyor. 'g u', 'g s', 'g c' çalışıyor ama yardımda yok. Ürünler'de aynı özellik bir yerde 'Flash sale', bir yerde 'Flaş indirim' diye geçiyor. 6 ekranın başlık adı menüdekinden farklı; alt çubukta 'Özet', menüde 'Genel bakış' yazıyor.

**Öneri:** 1) Genel dinleyici pencereye ilk kaydolduğu için önce çalışır; bu yüzden defaultPrevented kontrolü tek başına işe yaramaz. Genel 'n' kaldırılsın (Yeni ürün zaten Ctrl+K paletinde ve başlıkta var) ya da yalnızca kendi 'n'si olmayan ekranlarda çalışsın. 2) '?' yardımına 'g u / g s / g c' eklensin. 3) Tek terim seçilsin ('Flaş indirim'); düğme, toast ve işlem kaydı etiketleri buna çevrilsin (adminAudit.service.js:57 dahil). Ayrı bir terim sözlüğü dosyası gerekmez. 4) Başlık adı adminNavigation'daki label'dan gelsin, AdminPage'deki tabLabels kaldırılsın; alt çubukta da 'Genel bakış' yazsın.

**Neden önemli:** Kısayolla çalışan sahip yanlış ekrana düşmez, yarım kalan form kaybolmaz. Aynı şeye iki ad verilmediği için personel ve sahip aynı dili konuşur.

<details><summary>Kod kanıtı</summary>

- `frontend/src/pages/AdminPage.jsx:226-245 (g ve n genel kısayolları; defaultPrevented kontrolü yok)`
- `frontend/src/components/WeeklyProductsTab.jsx:740, 958, 990`
- `frontend/src/components/BannerTab.jsx:732, 874, 904`
- `frontend/src/components/AiKnowledgeCenter.jsx:307, 443, 448`
- `frontend/src/components/admin/ui/index.jsx:399-400 (yardımda yalnızca g o / g p / g d)`
- `frontend/src/components/ProductsList.jsx:165, 170, 932, 948, 950 (Flash sale ve Flaş indirim karışık)`
- `frontend/src/components/products/ProductDrawer.jsx:142, 253`
- `frontend/src/pages/AdminPage.jsx:146-174 ile frontend/src/components/admin/adminNavigation.js:36-84 (6 ad farkı)`
- `frontend/src/components/admin/AdminSidebar.jsx:258 ('Özet')`

</details>

#### Menüyü günlük işe göre düzenle: 'Bugün' grubu, tek 'Ürün ekle', ayrı 'Bakım'

Etki 2/5 · Efor: Küçük (1 günden az) · Sunucu: hayır

**Şu an:** 24 öğe 5 grupta. Menüde arama, tarayıcıda hatırlanan grup aç/kapa, Ctrl+K paleti ve g kısayolları zaten var. Asıl tuhaflıklar şunlar: canlı bir müşteri kuyruğu olan Fotokopi 'Sistem' grubunda duruyor; nadiren kullanılan Hesap temizliği günlük destek ekranlarının arasında; ürün eklemek için 3 ayrı menü öğesi var (Ürün ekle, Fotoğrafla ekle, Toplu yükleme).

**Öneri:** Küçük ve düşük riskli bir düzenleme yeterli. 1) Fotokopi 'Müşteri ve destek' grubuna, Mesajlar ve Bekleyen destek'in yanına taşınsın ve bekleyen dosya rozeti alsın. Hesap temizliği 'Sistem'e geçsin. 2) Üç ürün ekleme girişi tek bir 'Ürün ekle' ekranında sekmelere dönüşsün (Elle / Fotoğrafla / CSV); komut paleti eylemleri korunur. Yeni grup yapısı, yıldızla sabitleme ve başlıktaki 'Hızlı işlem' menüsü şimdilik yapılmasın: tasarım yenilemesinin hemen ardından menüyü baştan dizmek alışkanlığı bozar.

**Neden önemli:** Sahibin akşam boyunca gidip geldiği ekranlar yan yana ve rozetli olur; menüde kaydırma ve arama azalır. Nadir ve geri dönüşü zor ekranlar (toplu hesap silme, CSV yükleme) yanlışlıkla açılmaz.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/admin/adminNavigation.js:31-86 (özellikle 37, 47-49, 69-71, 81-82)`
- `frontend/src/components/admin/AdminSidebar.jsx:86-105, 156-195 (grup aç/kapa ve çizim)`
- `frontend/src/components/admin/AdminHeader.jsx:103-110 ('Yeni ürün' her ekranda birincil düğme)`

</details>

#### Ekranları ihtiyaç anında yükle; 1,7 MB'lık tek paket yerine ekran başına parça

Etki 2/5 · Efor: Orta (1–3 gün) · Sunucu: hayır

**Şu an:** AdminPage 23 ekranın hepsini statik içe aktarıyor. Panel JS'i 1.691.031 bayt (gzip yaklaşık 474 KB), CSS'i 540.525 bayt. Her açılışta tüm ürün listesi çekiliyor. Varsayılan ekran Genel bakış recharts kullandığı için ilk açılışta grafik kütüphanesi yine iner; kazanç diğer 22 ekrandan gelir. Yayın betiği eski asset dosyalarını yeni dist'e kopyaladığı için (ops/deploy/deploy.sh:134-135) yayından sonra eski parçaların 404 vermesi beklenmez. Panel günlerce açık kaldığında yeni sürümün yayınlandığını söyleyen bir uyarı yok.

**Öneri:** 1) Önce ucuz ve değerli olan yapılsın: 'Panelin yeni sürümü var · Yenile' şeridi. index.html'deki ana paket adı 5 dakikada bir ve sekme görünür olunca kontrol edilir. 2) Ürün listesi Ürünler, Fiyat bekçisi ya da komut paleti ilk açıldığında ya da tarayıcı boştayken (requestIdleCallback) yüklensin. 3) Ekranlar React.lazy ve Suspense ile parçalara ayrılsın; yedek görünüm mevcut Skeleton'lar olsun. Siparişler ve Mesajlar boştayken önceden indirilsin. CSS de parçalanacağı için stil sırası değişebilir; her ekran açık ve koyu temada gözle kontrol edilmeli. Parça indirilemezse ErrorBoundary bir kez kendiliğinden yenilesin.

**Neden önemli:** Telefondan ve mobil veriyle açılış belirgin hızlanır; sahip Siparişler'e daha çabuk ulaşır. Güncellemeden sonra eski kodla çalışan sekmeden kaynaklanan tuhaf hatalar biter.

<details><summary>Kod kanıtı</summary>

- `frontend/src/pages/AdminPage.jsx:19-41 (23 ekran statik içe aktarım)`
- `frontend/src/App.jsx:25 (yalnızca AdminPage lazy)`
- `frontend/dist/assets/AdminPage-DDLp5m5z.js (1.691.031 bayt, gzip ≈ 474 KB)`
- `frontend/dist/assets/AdminPage-CrT6YHJW.css (540.525 bayt)`
- `frontend/src/pages/AdminPage.jsx:264-268 (açılışta tüm ürünler çekilir)`
- `frontend/vite.config.js:6-57 (parça ayırma ayarı yok)`
- `frontend/src/components/admin/ui/ErrorBoundary.jsx:26-38 (parça indirme hatasına özel davranış yok)`

</details>

#### İşlem kayıtları: kayıttan ürüne git, büyük fiyat farkını işaretle, geri al

Etki 2/5 · Efor: Orta (1–3 gün) · Sunucu: evet

**Şu an:** Kayıttaki hedef adı düz metin. Sunucu target, actor ve before parametrelerini destekliyor ama ekranda yalnızca bölüm ve arama var; eski bir güne 50'şer 'Daha eski kayıtlar' ile gidiliyor. Ürün çekmecesi o ürünün geçmişini zaten gösteriyor. Fiyat değişimi yalnızca '₺12,50 → ₺1,25' metni olarak saklanıyor; büyük düşüş vurgulanmıyor. Panelin pratikte tek yöneticisi sahip olduğu için 'Kim' filtresinin değeri düşük.

**Öneri:** 1) Hedef adı bağlantı olsun: ürün kaydı ürün çekmecesini, sipariş kaydı sipariş çekmecesini, müşteri kaydı profili açsın (HANDOFF anahtarları hazır). 2) Araç çubuğuna tarih seçimi eklensin; seçilen günün sonu 'before' olarak gider. 3) Bundan sonraki fiyat ve indirim kayıtlarına ham sayılar meta olarak yazılsın. %30'dan büyük değişime '−%90' rozeti ve 'Büyük fiyat değişimleri' filtresi eklensin. 'Eski fiyata dön', 'Kim' filtresi ve CSV şimdilik yapılmasın; yanlış fiyata karşı asıl koruma, giriş anında onay ve 'Geri al' olmalı.

**Neden önemli:** Yanlış girilen fiyat (12,50 yerine 1,25) saniyeler içinde bulunur ve tek tıkla düzeltilir. Marj kaybı ve 'bunu kim değiştirdi' sorusu biter.

<details><summary>Kod kanıtı</summary>

- `frontend/src/components/AdminAuditTab.jsx:37 (hedef adı düz metin)`
- `frontend/src/components/AdminAuditTab.jsx:75-95 (yalnızca category, q, before parametreleri)`
- `frontend/src/components/AdminAuditTab.jsx:154-160 ('Daha eski kayıtlar')`
- `backend/routes/ordersAnalytics.route.js:150-153 (target, actor, before destekli)`
- `backend/controllers/product.controller.js:12-13, 405-407 (hedef = ürün _id; fiyat metin olarak yazılır)`
- `backend/services/adminAudit.service.js:20-37 (changes yalnızca metin)`
- `frontend/src/components/admin/ui/index.jsx:458 (HANDOFF product/order/user hazır)`

</details>

## 4. Elenen fikirler

- **Kart içeriği şeride göre değişsin:** Kart, kapıda alınacak tutarı ve ödeme yöntemini zaten gösteriyor; kazanç küçük.
- **Kurye kendi telefonundan “Teslim ettim” desin:** Eşlenmiş bir alarm telefonu bugün de siparişi “Teslim Edildi” yapabiliyor; kuryeye eşli telefon vermek yeterli.
- **Kurye performansı ve hakediş CSV'si:** Siparişler ekranındaki kurye süzgeci ve CSV ile bugün de alınabiliyor.
