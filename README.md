<h1 align="center">E-Commerce Store 🛒</h1>


## 🗄️ MongoDB ve Redis Entegrasyonu
Ürünler, kullanıcılar, siparişler ve ayarlar için MongoDB kullanılan sağlam bir veritabanı mimarisi. Yüksek performanslı önbellek için Redis entegrasyonu, özellikle sipariş saatleri doğrulaması gibi zaman hassasiyeti olan işlemler için yanıt sürelerini iyileştirir ve veritabanı yükünü azaltır.
💳 Stripe Ödeme Kurulumu
Kredi kartı ödemelerine olanak tanıyan güvenli Stripe API entegrasyonu, uygun hata yönetimi ve işlem doğrulaması ile birlikte.
🔐 Güçlü Kimlik Doğrulama Sistemi
Güvenli şifre hashleme ve normal kullanıcılar ile yöneticiler arasında ayrım yapan rol tabanlı erişim kontrolü ile çok katmanlı kimlik doğrulama sistemi.
🔑 Yenileme/Erişim Tokenleri ile JWT
Gelişmiş güvenlik için ayrı yenileme ve erişim tokenları içeren JSON Web Token uygulaması. Erişim tokenları kısa ömürlüdür, yenileme tokenları ise sık sık yeniden kimlik doğrulama gerektirmeden kesintisiz oturum yönetimi sağlar.
📝 Kullanıcı Kaydı ve Girişi
Uygun doğrulama, hata yönetimi ve geri bildirim ile temiz, sezgisel kullanıcı kaydı ve giriş akışları. Şifre kurtarma seçenekleri ve hesap yönetimi içerir.
🛒 E-Ticaret Çekirdeği
React kullanan duyarlı bir ön uç, Zustand ile durum yönetimi ve Tailwind CSS ve Framer Motion animasyonları ile modern UI tasarımına sahip özellik açısından zengin bir e-ticaret platformu.
📦 Ürün ve Kategori Yönetimi
Yöneticilerin fiyat, açıklama ve görseller gibi detaylarla ürün oluşturmasına, güncellemesine ve silmesine olanak tanıyan kapsamlı ürün yönetim sistemi. Daha iyi gezinme için ürünler kategorilere göre düzenlenir.
🛍️ Alışveriş Sepeti İşlevselliği
Kullanıcıların ürünleri eklemesine, kaldırmasına ve miktarlarını güncellemesine olanak tanıyan kalıcı depolamaya sahip gerçek zamanlı sepet yönetimi. Kupon uygulaması, otomatik toplam hesaplama ve dinamik minimum sipariş tutarı uygulama gibi özellikler içerir.
💰 Stripe ile Ödeme
Güvenli ödeme işlemi için Stripe ile entegre edilmiş sorunsuz ödeme süreci, sipariş onayı ve makbuz oluşturma ile birlikte.
🏷️ Kupon Kodu Sistemi
Siparişlere uygulanabilen yüzde bazlı indirimleri destekleyen esnek kupon sistemi. Arka uç doğrulaması, indirim kurallarının doğru uygulanmasını sağlar.
👑 Yönetici Paneli
Ürünleri yönetmek, siparişleri görüntülemek, satış verilerini analiz etmek ve sipariş saatleri ve minimum sipariş tutarları da dahil olmak üzere sistem ayarlarını yapılandırmak için kapsamlı yönetici paneli. Tüm değişiklikler uygulama genelinde anında yansır.
📊 Satış Analitiği
Zaman içindeki trendleri, popüler ürünleri ve iş kararlarını bilgilendirmek için gelir metriklerini gösteren grafikler ve çizelgelerle satış verilerinin görsel temsili.
🎨 Tailwind ile Tasarım
Zümrüt vurgular, özel animasyonlar ve mobil dostu düzenler içeren koyu temalı bir arayüz ile Tailwind CSS ile uygulanan modern, duyarlı tasarım.
🛒 Sepet ve Ödeme Süreci
Gerçek zamanlı doğrulama, minimum sipariş uygulaması, net ilerleme göstergeleri ve kullanıcı dostu geri bildirim içeren kolaylaştırılmış sepet ve ödeme akışı. Adres seçimi, telefon doğrulaması ve sipariş notları içerir.
🔒 Güvenlik
Korumalı rotalar, girdi doğrulama, güvenli kimlik doğrulama ve yaygın web güvenlik açıklarına karşı koruma dahil kapsamlı güvenlik önlemleri.
🛡️ Veri Koruma
Kullanıcı verileri uygun şifreleme ve erişim kontrolleri ile güvenli bir şekilde işlenir. Hassas bilgiler en iyi uygulamalara göre korunur.
🚀 Redis ile Önbellekleme
Sipariş saatleri ayarları gibi sık erişilen veriler için Redis önbellekleme ile performans optimizasyonu. Veri tutarlılığını sağlamak için ayarlar güncellendiğinde otomatik önbellek geçersiz kılma içerir.
  
### Setup .env file

```bash
PORT=5000
MONGO_URI=your_mongo_uri

UPSTASH_REDIS_URL=your_redis_url

ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

STRIPE_SECRET_KEY=your_stripe_secret_key
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

### Run this app locally

```shell
npm run build
```

### Start the app

```shell
npm run start
```
