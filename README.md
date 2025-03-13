# E-Commerce Store 🛒

Modern tasarıma sahip, React ve Node.js ile geliştirilmiş kapsamlı bir e-ticaret platformu.


## 🚀 Özellikler

### 🗄️ MongoDB ve Redis Entegrasyonu
- Ürünler, kullanıcılar, siparişler ve ayarlar için MongoDB kullanılan sağlam bir veritabanı mimarisi
- Yüksek performanslı önbellek için Redis entegrasyonu
- Özellikle sipariş saatleri doğrulaması gibi zaman hassasiyeti olan işlemler için optimizasyon

### 🔐 Güvenlik Sistemleri
- Güvenli şifre hashleme ile güçlü kimlik doğrulama
- Rol tabanlı erişim kontrolü (Kullanıcı/Yönetici)
- JWT ile gelişmiş kimlik doğrulama
- Ayrı yenileme ve erişim tokenleri
- Korumalı rotalar ve güvenli API'ler

### 📝 Kullanıcı Yönetimi
- Sezgisel kullanıcı kaydı ve giriş akışları
- Profil yönetimi
- Sipariş geçmişi takibi
- Şifre kurtarma seçenekleri

### 🛒 E-Ticaret Özellikleri
- Kategoriler halinde düzenlenmiş ürün yönetimi
- Gerçek zamanlı sepet işlevselliği
- Kupon kodu sistemi (%'lik indirimler)
- Dinamik minimum sipariş tutarı uygulaması
- Sipariş zamanı doğrulama ve kontrol

### 👑 Yönetici Paneli
- Ürün ekleme, düzenleme ve silme
- Kategori yönetimi
- Sipariş görüntüleme ve yönetimi
- Sistem ayarları yapılandırması
- Minimum sipariş tutarı ve çalışma saatleri ayarları

### 🎨 Modern Tasarım
- Tailwind CSS ile duyarlı tasarım
- Framer Motion ile animasyonlar
- Mobil dostu arayüz
- Koyu tema ve zümrüt vurgular

### 🚀 Performans Optimizasyonu
- Redis önbellekleme ile hızlı yanıt süreleri
- Otomatik önbellek yenileme
- Optimum veritabanı kullanımı

## 🛠️ Teknoloji Yığını

**Frontend:**
- React
- Zustand (durum yönetimi)
- Tailwind CSS
- Framer Motion
- Vite

**Backend:**
- Node.js
- Express
- MongoDB
- Redis
- JWT Kimlik Doğrulama

**Ödeme İşleme:**
- Stripe API

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- Node.js (v14+)
- MongoDB
- Redis

### Backend Kurulumu
```bash
# Backend dizinine git
cd backend

# Bağımlılıkları kur
npm install

# .env dosyasını oluştur (örnek .env.example dosyasını kopyalayabilirsiniz)
cp .env.example .env

# Sunucuyu başlat
npm run dev
```

### Frontend Kurulumu
```bash
# Frontend dizinine git
cd frontend

# Bağımlılıkları kur
npm install

# Geliştirme sunucusunu başlat
npm run dev
```

## 📝 Lisans
MIT

---

Geliştirici: [jupiterry](https://github.com/jupiterry)
