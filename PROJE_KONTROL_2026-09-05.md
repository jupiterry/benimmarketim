# Proje kontrolü — 5 Eylül 2026

İnceleme yerel web/backend ve Flutter kaynak kodunda yapıldı. Canlı sunucu, mağazadaki uygulama, gerçek kullanıcı verileri ve fiziksel iPhone üzerinde doğrulama yapılmadı. Bu belge tüm projenin güvenlik denetimi değildir.

## Bu kontrolde tamamlananlar

- iOS LaunchScreen zaten Flutter açılışıyla aynı #053D2A rengindeydi. Main.storyboard içindeki FlutterViewController arka planı beyaz kalmıştı; o da aynı renge getirildi. İki storyboard XML olarak okundu ve arka plan eşleşmesi doğrulandı.
- Backend kupon cüzdanında, sipariş geçmişi olan kullanıcıların ilk sipariş kuponları elendi. Bu kontrol, eski kuponlarda usedBy kaydı eksik olsa da geçerlidir. Mevcut doğrulama davranışıyla aynı şekilde herhangi bir sipariş ilk sipariş hakkını bitirir; iptal edilen siparişler de buna dahildir.
- Genel kullanım limiti dolan kuponlar cüzdandan elendi. Flutter modeli de kalan kişisel/genel hakları kontrol ediyor.
- Mobilde başarılı siparişten sonra eski kupon listesi hemen temizleniyor ve sunucudan yeniden alınıyor. Zorunlu yenileme devam eden başka bir yükleme nedeniyle atlanmıyor. Eski istek yanıtları güncel listeyi geri değiştiremiyor; çıkıştan sonra önceki hesabın yanıtları da yok sayılıyor.
- Uygulama değerlendirme servisindeki hata, başarılı sipariş sonrası sepet ve kupon temizliğini engellemeyecek şekilde ayrıldı.
- Kullanıcı listesinden gizleme veritabanındaki kupon/kullanım kayıtlarını silmiyor. Mevcut yönetim panelinin kullanım geçmişinde ad, e-posta, sipariş numarası ve kullanım tarihi görülebiliyor.

## Öncelikli eksikler ve geliştirmeler

1. **Stok ve satışa kapalı ürün kontrolü (yüksek):** backend/services/order.service.js içindeki buildOrderProducts ürün varlığını, miktarı ve fiyatı kontrol ediyor; isOutOfStock/isHidden alanlarını kontrol etmiyor. Sepette bekleyen veya doğrudan API'ye gönderilen satışa kapalı ürün siparişe girebilir. Sunucuda reddetme kontrolü eklenmeli. Ürün modelinde adet bazlı stok bulunmuyor; stok adedi, eşzamanlı rezervasyon ve düşük stok bildirimi eklenebilir.
2. **Mükerrer sipariş ve işlem bütünlüğü (yüksek):** incelenen sipariş akışında tekrar gönderilen isteği aynı siparişle eşleyen bir anahtar yok. Sipariş kaydı, kupon tüketimi ve sepet temizliği ayrı yazmalar. Kupon limit kontrolünün atomik olması bütün sipariş işlemini atomik yapmıyor. Ağ kesintisi/yeniden deneme senaryosu ve veritabanı hataları için tekil istek anahtarı ve işlem bütünlüğü gerekli.
3. **Yönetim geçmişini koruma (yüksek):** coupon.controller.js içindeki deleteCoupon hâlâ findByIdAndDelete kullanıyor. Yönetici kuponu silerse embedded usedBy geçmişi de kaybolur. Kullanılmış kuponlar arşivlenmeli; yönetici değişiklikleri ayrıca kaydedilmeli. Bu kontrolde yönetici silme davranışı değiştirilmedi.
4. **Kupon denetim ekranı:** mevcut arama kupon kodu/açıklamasında çalışıyor. Kullanıcı, tarih, sipariş durumu ve kanal filtreleri; indirim tutarı; sipariş detayına bağlantı ve CSV dışa aktarma eklenebilir. API sipariş tutarı/indirim/durum alanlarını zaten dolduruyor, mevcut kullanım satırları bunları göstermiyor.
5. **İptal ve referans ödülü politikası:** referans ödülü teslimatta değil, ilk sipariş oluşturulduğunda işleniyor. İptalde ilk sipariş hakkı ve ödülün ne olacağı netleştirilmeli; ödülün teslimata bağlanması veya iptal kaydıyla geri alınması değerlendirilmeli.
6. **Açılış süresi ve hata takibi:** lib/main.dart runApp öncesinde bildirim servisini bekliyor; servis bildirim izni istiyor. Bu ilk Flutter karesini geciktirebilir. İzin isteme kullanıcıya uygun bir ekrana taşınabilir. Release hata raporlama bölümü yorum olarak bırakılmış; çalışan bir hata izleme entegrasyonu gerekli.
7. **Test kapsamı:** mobil test/widget_test.dart uygulamaya uymayan varsayılan sayaç testi içeriyor. Kayıt → referans → sipariş → teslimat/iptal → kupon cüzdanı akışını kapsayan entegrasyon testleri eklenmeli. Bu kontrolde yalnızca ilgili yeni regresyon testleri çalıştırıldı.
8. **Kupon bağlantı hatası:** ApiService.getUserCoupons ağ hatasını boş listeye çeviriyor. Arayüz gerçek boş cüzdan ile bağlantı hatasını ayırt edemiyor. Ayrı hata durumu, yeniden dene düğmesi ve uygulamaya dönüşte yenileme eklenebilir.

## Doğrulama

- node --test backend/tests/coupon-wallet.test.js: 1 test geçti (sipariş geçmişi olan/olmayan kullanıcı, kullanılan ve genel limiti dolan kuponlar, kayıtların korunması).
- flutter test test/coupon_refresh_test.dart: 4 test geçti (hak kontrolü, ters sırayla tamamlanan istekler, başarısız yenileme, çıkış sonrası eski yanıt).
- Hedeflenen Dart dosyalarının analizi: hata/uyarı seviyesinde bulgu yok; 67 bilgi seviyesinde lint bildirimi mevcut (print, eski API kullanımı ve async context kullanımı dahil).
- Her iki depoda git diff --check geçti.
- iOS build/cihaz testi yapılmadı. Yeni mobil derleme ve backend yayını yapılmadı; ZIP paketleri güncellenmedi. Testler canlı MongoDB veya gerçek sipariş oluşturmadan çalıştı.

Önerilen sıra: stok/sipariş güvenilirliği → kupon arşivi ve raporlama → iptal/ödül akışı → açılış ve hata takibi → yeni müşteri özellikleri. Daha sonra önceki siparişi tekrar sepete ekleme, teslimat zaman aralığı ve kişiye özel favori ürün kampanyaları değerlendirilebilir.
