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
- Profil yönetimi: telefon güncelleme (`PUT /api/auth/update-phone`) ve profil fotoğrafı
  (`PUT`/`DELETE /api/auth/profile-photo`, Cloudinary `avatars/` klasörü)
- Sipariş geçmişi takibi
- Hesap silme: siparişler anonimleştirilerek saklanır, kişisel veriler silinir

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

### 🔔 Bildirimler ve Yedek
- Yeni sipariş: yönetici paneline Socket.IO bildirimi ve sipariş alarmı uygulaması
- Müşteriye sipariş durumu bildirimleri (OneSignal/FCM)
- Gece veritabanı yedeği yalnızca sunucuda tutulur (`backend/workers/BACKUP.md`)

## 🛠️ Teknoloji Yığını

**Frontend:**
- React
- Zustand (durum yönetimi)
- Tailwind CSS
- Framer Motion
- Vite

Backend bağımlılıkları kök `package.json`, frontend bağımlılıkları `frontend/package.json` içindedir.

**Backend:**
- Node.js
- Express
- MongoDB
- Redis
- JWT Kimlik Doğrulama

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- Node.js (v14+)
- MongoDB
- Redis

### Backend Kurulumu
```bash
# Proje kökünde bağımlılıkları kur
npm install

# .env dosyasını oluştur (örnek .env.example dosyasını kopyalayabilirsiniz)
cp .env.example .env

# Sunucuyu başlat
npm run dev

# Backend testleri
npm run test:ai-support
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
