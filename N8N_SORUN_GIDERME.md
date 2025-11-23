# 🔧 n8n Bildirim Sorun Giderme Kılavuzu

Eğer n8n'e bildirim gelmiyorsa, aşağıdaki adımları izleyin.

## 🔍 1. Environment Variable Kontrolü

İlk olarak `.env` dosyanızda `N8N_WEBHOOK_URL` tanımlı mı kontrol edin:

```bash
# .env dosyasında şu satır olmalı:
N8N_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b
```

### Test Endpoint'i ile Kontrol

Backend sunucusunuz çalışırken, şu endpoint'i çağırın:

```bash
GET http://localhost:5000/api/n8n/test
```

veya tarayıcıda açın:
```
http://localhost:5000/api/n8n/test
```

Response'da şunu görmelisiniz:
```json
{
  "success": true,
  "environment": {
    "N8N_WEBHOOK_URL": "https://n8n.devrekbenimmar...",
    "N8N_WEBHOOK_URL_SET": true
  }
}
```

Eğer `N8N_WEBHOOK_URL_SET: false` görüyorsanız, `.env` dosyasını kontrol edin ve sunucuyu yeniden başlatın.

## 🧪 2. Test Sipariş Bildirimi Gönderme

Gerçek sipariş oluşturmadan test bildirimi göndermek için:

```bash
POST http://localhost:5000/api/n8n/test-order
```

veya curl ile:

```bash
curl -X POST http://localhost:5000/api/n8n/test-order
```

Bu endpoint, n8n'e test bir sipariş bildirimi gönderir ve sonucu döndürür.

## 📋 3. Console Log'larını Kontrol Edin

Backend sunucusunun console log'larını izleyin. Sipariş oluşturulduğunda şu mesajları görmelisiniz:

### Başarılı Durumda:
```
🔔 [Sipariş] n8n bildirimi başlatılıyor...
🔔 [Sipariş] Sipariş verisi alındı, bildirim hazırlanıyor...
🔔 [Sipariş] Bildirim verisi hazır, n8n'e gönderiliyor...
🔍 [n8n Debug] N8N_WEBHOOK_URL kontrol ediliyor...
🔍 [n8n Debug] Webhook URL: https://n8n.devrekbenimmar...
📤 [n8n Debug] n8n'e sipariş bildirimi gönderiliyor...
📤 [n8n Debug] Webhook URL: https://n8n.devrekbenimmarketim.com/...
📤 [n8n Debug] Sipariş ID: 507f1f77bcf86cd799439011
📥 [n8n Debug] Response alındı
📥 [n8n Debug] Response status: 200
✅ [n8n Success] Sipariş bildirimi başarıyla n8n'e gönderildi: 507f1f77bcf86cd799439011
✅ [Sipariş] n8n bildirimi başarıyla gönderildi!
```

### Hata Durumunda:
```
❌ [n8n Error] N8N_WEBHOOK_URL tanımlanmamış. Sipariş bildirimi gönderilmedi.
```

veya

```
❌ [n8n Error] n8n sipariş bildirimi gönderilirken hata oluştu!
❌ [n8n Error] Hata mesajı: Network Error
❌ [n8n Error] Request gönderildi ama response alınamadı!
```

## 🔧 4. Yaygın Sorunlar ve Çözümleri

### Sorun 1: N8N_WEBHOOK_URL Tanımlanmamış

**Belirtiler:**
- Console'da: `❌ [n8n Error] N8N_WEBHOOK_URL tanımlanmamış`
- Test endpoint'inde: `N8N_WEBHOOK_URL_SET: false`

**Çözüm:**
1. `.env` dosyasını açın (root dizinde olmalı)
2. Şu satırı ekleyin:
   ```env
   N8N_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b
   ```
3. Backend sunucusunu **tamamen durdurun ve yeniden başlatın**
4. `npm run dev` veya `npm start` ile yeniden başlatın

### Sorun 2: Network Hatası (Request Gönderilemedi)

**Belirtiler:**
- Console'da: `❌ [n8n Error] Request gönderildi ama response alınamadı!`

**Olası Nedenler:**
1. n8n sunucusu çalışmıyor olabilir
2. n8n URL'i yanlış olabilir
3. Network bağlantısı yok
4. Firewall/proxy isteği engelliyor

**Çözüm:**
1. n8n URL'inin doğru olduğunu kontrol edin:
   ```bash
   curl https://n8n.devrekbenimmarketim.com/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b
   ```
2. n8n sunucusunun çalıştığından emin olun
3. n8n workflow'unun aktif olduğundan emin olun
4. Firewall/proxy ayarlarını kontrol edin

### Sorun 3: Timeout Hatası

**Belirtiler:**
- Console'da: `❌ [n8n Error] timeout of 10000ms exceeded`

**Çözüm:**
1. n8n sunucusunun yanıt verme süresini kontrol edin
2. Gerekirse `backend/services/n8n.service.js` dosyasında timeout değerini artırın:
   ```javascript
   timeout: 15000, // 15 saniye
   ```

### Sorun 4: n8n'de Webhook Alınmıyor

**Belirtiler:**
- Backend console'unda başarılı mesaj görülüyor
- Ama n8n'de webhook execution görünmüyor

**Çözüm:**
1. n8n workflow'unun aktif olduğundan emin olun
2. n8n webhook node'unun ayarlarını kontrol edin:
   - HTTP Method: POST
   - Path doğru mu?
3. n8n execution log'larını kontrol edin
4. n8n'de webhook URL'inin doğru olduğundan emin olun

### Sorun 5: Yanlış Veri Formatı

**Belirtiler:**
- Webhook gönderiliyor ama n8n'de hata alınıyor

**Çözüm:**
1. Console log'larında gönderilen payload'ı kontrol edin
2. n8n'de hangi veri formatı beklendiğini kontrol edin
3. `backend/services/n8n.service.js` dosyasındaki `sendOrderNotification` fonksiyonunu gerekirse düzenleyin

## 📝 5. Debug Checklist

Sorun gidermek için şu checklist'i takip edin:

- [ ] `.env` dosyasında `N8N_WEBHOOK_URL` tanımlı mı?
- [ ] Backend sunucusu yeniden başlatıldı mı?
- [ ] Test endpoint (`/api/n8n/test`) çalışıyor mu?
- [ ] Test order endpoint (`/api/n8n/test-order`) çalışıyor mu?
- [ ] Console log'larında hata mesajı var mı?
- [ ] n8n sunucusu çalışıyor mu?
- [ ] n8n workflow aktif mi?
- [ ] n8n webhook URL'i doğru mu?
- [ ] Network bağlantısı var mı?
- [ ] Firewall/proxy webhook gönderimine izin veriyor mu?

## 🔍 6. Detaylı Debug Modu

Daha fazla bilgi için:

1. **Backend console'u açın** ve log'ları izleyin
2. **n8n execution log'larını kontrol edin**
3. **Network tab'ını açın** (tarayıcı developer tools) ve API isteklerini kontrol edin
4. **Test endpoint'lerini kullanın**:
   - `GET /api/n8n/test` - Bağlantı kontrolü
   - `POST /api/n8n/test-order` - Test bildirimi

## 🆘 Yardım

Hala sorun yaşıyorsanız:

1. Backend console log'larını paylaşın
2. Test endpoint response'larını paylaşın
3. `.env` dosyasında (şifreler olmadan) n8n URL'ini paylaşın
4. n8n execution log'larını kontrol edin

## 📞 Hızlı Test Komutları

```bash
# 1. Environment kontrolü
curl http://localhost:5000/api/n8n/test

# 2. Test sipariş bildirimi
curl -X POST http://localhost:5000/api/n8n/test-order

# 3. n8n URL'ine direkt test
curl -X POST https://n8n.devrekbenimmarketim.com/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

