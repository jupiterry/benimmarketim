# 🚀 Production Deploy Kılavuzu

## ❌ Sorun Tespiti

Loglarınızda n8n bildirimi görünmüyor. Bu, yeni kodun production sunucuya deploy edilmediği anlamına geliyor.

**Mevcut Log:**
```
Sipariş başarıyla kaydedildi: new ObjectId('6922537bfab235c8bb9a8663')
Socket.IO bildirimi gönderiliyor...
```

**Beklenen Log:**
```
🔔 [Sipariş] n8n bildirimi başlatılıyor...
🔍 [n8n Debug] N8N_WEBHOOK_URL kontrol ediliyor...
```

## ✅ Deploy Adımları

### 1. Yeni Dosyaları Sunucuya Kopyalayın

SSH ile sunucuya bağlanın ve yeni dosyaları kopyalayın:

```bash
# Yeni oluşturulan dosyalar:
# - backend/services/n8n.service.js
# - backend/controllers/n8n.controller.js
# - backend/routes/n8n.route.js

# Güncellenen dosyalar:
# - backend/controllers/payment.controller.js
# - backend/controllers/auth.controller.js
# - backend/server.js
```

### 2. .env Dosyasını Güncelleyin

Production sunucudaki `.env` dosyasına n8n URL'ini ekleyin:

```bash
# Sunucuda .env dosyasını düzenleyin
nano /var/www/benimmarketim/.env
# veya
vi /var/www/benimmarketim/.env
```

Şu satırı ekleyin:
```env
# Production URL (webhook-test değil, webhook kullanın)
N8N_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook/e28ba3af-75a2-4d06-9436-00332405e9db
```

### 3. NPM Paketlerini Kontrol Edin

Gerekli paketler yüklü mü kontrol edin:

```bash
cd /var/www/benimmarketim
npm install
```

**Not:** `axios` paketi zaten yüklü olmalı (package.json'da var).

### 4. PM2'yi Yeniden Başlatın

```bash
# PM2'yi yeniden başlatın
pm2 restart project-backend

# veya tüm uygulamaları yeniden başlatın
pm2 restart all
```

### 5. Log'ları Kontrol Edin

```bash
# Log'ları canlı olarak izleyin
pm2 logs project-backend --lines 50

# Sadece output log'larını görmek için
pm2 logs project-backend-out --lines 50

# Sadece error log'larını görmek için
pm2 logs project-backend-error --lines 50
```

### 6. Test Endpoint'lerini Kullanın

Backend sunucusu çalıştıktan sonra test edin:

```bash
# Environment kontrolü
curl http://localhost:5000/api/n8n/test

# Test sipariş bildirimi
curl -X POST http://localhost:5000/api/n8n/test-order
```

## 📋 Kontrol Listesi

Deploy sonrası kontrol edin:

- [ ] Yeni dosyalar sunucuya kopyalandı
  - [ ] `backend/services/n8n.service.js`
  - [ ] `backend/controllers/n8n.controller.js`
  - [ ] `backend/routes/n8n.route.js`
- [ ] Güncellenen dosyalar kopyalandı
  - [ ] `backend/controllers/payment.controller.js`
  - [ ] `backend/controllers/auth.controller.js`
  - [ ] `backend/server.js`
- [ ] `.env` dosyasına `N8N_WEBHOOK_URL` eklendi
- [ ] PM2 yeniden başlatıldı
- [ ] Test endpoint'leri çalışıyor
- [ ] Log'larda n8n mesajları görünüyor

## 🔍 Deploy Sonrası Test

### 1. Test Endpoint'i Çağırın

```bash
curl http://localhost:5000/api/n8n/test
```

**Beklenen Response:**
```json
{
  "success": true,
  "environment": {
    "N8N_WEBHOOK_URL": "https://n8n.devrekbenimmar...",
    "N8N_WEBHOOK_URL_SET": true
  }
}
```

### 2. Test Sipariş Bildirimi Gönderin

```bash
curl -X POST http://localhost:5000/api/n8n/test-order
```

### 3. Gerçek Sipariş Oluşturun

Web sitenizden bir test siparişi oluşturun ve log'ları kontrol edin:

```bash
pm2 logs project-backend-out --lines 100
```

**Beklenen Log'lar:**
```
🔔 [Sipariş] n8n bildirimi başlatılıyor...
🔍 [n8n Debug] N8N_WEBHOOK_URL kontrol ediliyor...
📤 [n8n Debug] n8n'e sipariş bildirimi gönderiliyor...
✅ [n8n Success] Sipariş bildirimi başarıyla n8n'e gönderildi
```

## ⚠️ Yaygın Hatalar

### Hata 1: Module Not Found

**Belirtiler:**
```
Error: Cannot find module '../services/n8n.service.js'
```

**Çözüm:**
- `backend/services/n8n.service.js` dosyasının sunucuda olduğundan emin olun
- Dosya yolunu kontrol edin

### Hata 2: N8N_WEBHOOK_URL Tanımlanmamış

**Belirtiler:**
```
❌ [n8n Error] N8N_WEBHOOK_URL tanımlanmamış
```

**Çözüm:**
- `.env` dosyasında `N8N_WEBHOOK_URL` olduğundan emin olun
- PM2'yi yeniden başlatın (`.env` değişiklikleri için gerekli)

### Hata 3: Import Hatası

**Belirtiler:**
```
SyntaxError: Cannot use import statement outside a module
```

**Çözüm:**
- `package.json` dosyasında `"type": "module"` olduğundan emin olun

## 📝 Hızlı Deploy Komutları

```bash
# 1. Sunucuya bağlan
ssh root@your-server

# 2. Proje dizinine git
cd /var/www/benimmarketim

# 3. .env dosyasını düzenle (N8N_WEBHOOK_URL ekle)
nano .env

# 4. PM2'yi yeniden başlat
pm2 restart project-backend

# 5. Log'ları izle
pm2 logs project-backend-out --lines 50

# 6. Test et
curl http://localhost:5000/api/n8n/test
```

## 🎯 Git Kullanarak Deploy (Önerilen)

Eğer Git kullanıyorsanız:

```bash
# 1. Local'de commit edin
git add .
git commit -m "n8n entegrasyonu eklendi"
git push

# 2. Sunucuda pull edin
cd /var/www/benimmarketim
git pull

# 3. .env dosyasını kontrol edin (N8N_WEBHOOK_URL)
nano .env

# 4. PM2'yi yeniden başlatın
pm2 restart project-backend

# 5. Log'ları kontrol edin
pm2 logs project-backend-out
```

## 🆘 Sorun Giderme

Deploy sonrası sorun yaşarsanız:

1. **Log'ları kontrol edin:**
   ```bash
   pm2 logs project-backend --lines 100
   ```

2. **Test endpoint'lerini kullanın:**
   ```bash
   curl http://localhost:5000/api/n8n/test
   curl -X POST http://localhost:5000/api/n8n/test-order
   ```

3. **Dosya varlığını kontrol edin:**
   ```bash
   ls -la /var/www/benimmarketim/backend/services/n8n.service.js
   ls -la /var/www/benimmarketim/backend/routes/n8n.route.js
   ```

4. **Environment variable'ı kontrol edin:**
   ```bash
   cd /var/www/benimmarketim
   node -e "require('dotenv').config(); console.log(process.env.N8N_WEBHOOK_URL)"
   ```

## ✅ Başarı Kontrolü

Deploy başarılı olduğunda:

1. ✅ Test endpoint response dönüyor
2. ✅ Log'larda `🔔 [Sipariş] n8n bildirimi başlatılıyor...` görünüyor
3. ✅ Test sipariş bildirimi gönderiliyor
4. ✅ Gerçek sipariş oluşturulduğunda n8n'e bildirim gidiyor

## 📞 Sonuç

Deploy tamamlandıktan sonra:
- Her yeni sipariş otomatik olarak n8n'e gönderilecek
- n8n workflow'unuz tetiklenecek
- İstediğiniz işlemleri (Email, Slack, vb.) yapabilirsiniz

**Önemli:** PM2'yi her `.env` değişikliğinden sonra yeniden başlatmayı unutmayın!

