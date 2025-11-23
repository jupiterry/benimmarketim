# 🚀 Hızlı Deploy Komutları

## ❌ Sorun

Loglarınızda n8n bildirimi görünmüyor çünkü yeni kod production sunucuya deploy edilmemiş.

## ✅ Yapmanız Gerekenler

### 1. Yeni Dosyaları Sunucuya Kopyalayın

Bu dosyaları production sunucuya kopyalayın:

```bash
# Sunucuya bağlanın
ssh root@your-server

# Yeni dosyaları kopyalayın:
# - backend/services/n8n.service.js
# - backend/controllers/n8n.controller.js
# - backend/routes/n8n.route.js
```

Ve güncellenen dosyaları:
```bash
# Güncellenen dosyalar:
# - backend/controllers/payment.controller.js
# - backend/controllers/auth.controller.js
# - backend/server.js
```

### 2. .env Dosyasına n8n URL'ini Ekleyin

```bash
cd /var/www/benimmarketim
nano .env
```

Şu satırı ekleyin:
```env
N8N_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b
```

Kaydedin (Ctrl+O, Enter, Ctrl+X)

### 3. PM2'yi Yeniden Başlatın

```bash
pm2 restart project-backend
```

### 4. Log'ları Kontrol Edin

```bash
pm2 logs project-backend-out --lines 50
```

### 5. Test Edin

```bash
# Environment kontrolü
curl http://localhost:5000/api/n8n/test

# Test sipariş bildirimi
curl -X POST http://localhost:5000/api/n8n/test-order
```

## ✅ Başarı Kontrolü

Deploy başarılı olduğunda log'larda şunu görmelisiniz:

```
🔔 [Sipariş] n8n bildirimi başlatılıyor...
🔍 [n8n Debug] N8N_WEBHOOK_URL kontrol ediliyor...
📤 [n8n Debug] n8n'e sipariş bildirimi gönderiliyor...
```

## 🆘 Sorun Giderme

Eğer log'larda hala görünmüyorsa:

1. Dosyaların kopyalandığından emin olun:
   ```bash
   ls -la /var/www/benimmarketim/backend/services/n8n.service.js
   ```

2. .env dosyasını kontrol edin:
   ```bash
   grep N8N_WEBHOOK_URL /var/www/benimmarketim/.env
   ```

3. PM2'yi tamamen durdurup yeniden başlatın:
   ```bash
   pm2 stop project-backend
   pm2 start project-backend
   ```

