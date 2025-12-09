# 🛒 Sipariş Bildirim Sistemi

Bu dokümantasyon, web sitemize gelen siparişleri n8n'e otomatik bildirme sistemini açıklar.

## 🎯 Sistem Özeti

Her yeni sipariş oluşturulduğunda, sistem otomatik olarak n8n'e webhook gönderir. Bu sayede:

- ✅ Email bildirimi gönderebilirsiniz
- ✅ WhatsApp/SMS bildirimi gönderebilirsiniz
- ✅ Slack/Telegram bildirimi gönderebilirsiniz
- ✅ Veritabanına kayıt yapabilirsiniz
- ✅ CRM sistemine veri aktarabilirsiniz
- ✅ İstediğiniz herhangi bir otomasyonu çalıştırabilirsiniz

## 🔧 Kurulum

### 1. .env Dosyasına n8n URL'ini Ekleyin

`.env` dosyanızın root dizinde olduğundan emin olun ve aşağıdaki satırı ekleyin:

```env
N8N_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db
```

### 2. Sunucuyu Yeniden Başlatın

`.env` dosyasını güncelledikten sonra backend sunucusunu yeniden başlatın:

```bash
npm run dev
# veya production için
npm start
```

## 📨 Gönderilen Veri Formatı

Her sipariş oluşturulduğunda, n8n'e aşağıdaki formatta veri gönderilir:

```json
{
  "event": "order.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "order": {
    "id": "507f1f77bcf86cd799439011",
    "orderNumber": "507f1f77bcf86cd799439011",
    "user": {
      "id": "507f191e810c19729de860ea",
      "name": "Ahmet Yılmaz",
      "email": "ahmet@example.com",
      "phone": "5551234567"
    },
    "products": [
      {
        "name": "Süt",
        "quantity": 2,
        "price": 25.50,
        "total": 51.00
      },
      {
        "name": "Ekmek",
        "quantity": 1,
        "price": 5.00,
        "total": 5.00
      }
    ],
    "totalAmount": 56.00,
    "city": "İstanbul",
    "deliveryPoint": "Kadıköy",
    "deliveryPointName": "Kadıköy Şubesi",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "note": "Sabah teslim edin lütfen"
  }
}
```

### Veri Alanları Açıklaması

- **event**: Olay tipi (her zaman "order.created")
- **timestamp**: Webhook gönderilme zamanı (ISO format)
- **order.id**: Sipariş ID'si (MongoDB ObjectId)
- **order.orderNumber**: Sipariş numarası (şimdilik ID ile aynı)
- **order.user**: Siparişi veren kullanıcı bilgileri
- **order.products**: Sipariş edilen ürünler listesi
- **order.totalAmount**: Toplam tutar
- **order.city**: Teslimat şehri
- **order.deliveryPoint**: Teslimat noktası
- **order.deliveryPointName**: Teslimat noktası adı
- **order.status**: Sipariş durumu (genellikle "pending")
- **order.createdAt**: Sipariş oluşturulma zamanı
- **order.note**: Kullanıcı notu (varsa)

## 🔍 n8n Workflow Örnekleri

### Örnek 1: Basit Email Bildirimi

1. n8n'de **Webhook** node'unu ekleyin (trigger olarak)
2. **Send Email** node'unu ekleyin (Gmail, Outlook vb.)
3. Email içeriğini şu şekilde yapılandırın:

```
Konu: Yeni Sipariş! - {{ $json.order.id }}

Merhaba,

Yeni bir sipariş geldi:

Müşteri: {{ $json.order.user.name }}
Email: {{ $json.order.user.email }}
Telefon: {{ $json.order.user.phone }}
Toplam: {{ $json.order.totalAmount }} TL
Şehir: {{ $json.order.city }}
Teslimat Noktası: {{ $json.order.deliveryPointName }}

Ürünler:
{{ $json.order.products.map(p => '- ' + p.name + ' x' + p.quantity + ' = ' + p.total + ' TL').join('\n') }}

Sipariş ID: {{ $json.order.id }}
```

### Örnek 2: WhatsApp Bildirimi

1. **Webhook** node'unu ekleyin
2. **HTTP Request** node'unu ekleyin
3. WhatsApp Business API'ye istek gönderin:

```
Method: POST
URL: https://api.whatsapp.com/send
Headers:
  Authorization: Bearer YOUR_TOKEN
Body:
  phone: YOUR_ADMIN_PHONE
  message: Yeni sipariş! Müşteri: {{ $json.order.user.name }}, Tutar: {{ $json.order.totalAmount }} TL
```

### Örnek 3: Veritabanına Kayıt

1. **Webhook** node'unu ekleyin
4. **MySQL** veya **PostgreSQL** node'unu ekleyin
5. Sipariş verilerini veritabanına kaydedin

### Örnek 4: Slack Bildirimi

1. **Webhook** node'unu ekleyin
2. **Slack** node'unu ekleyin
3. Slack kanalına bildirim gönderin

## ✅ Test Etme

### 1. n8n Webhook'unu Test Edin

Test endpoint'ini çağırarak bağlantıyı kontrol edin:

```bash
curl http://localhost:5000/api/n8n/test
```

### 2. Test Siparişi Oluşturun

Web sitenizden veya API üzerinden test siparişi oluşturun:

```bash
POST http://localhost:5000/api/orders/create-order
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "products": [...],
  "city": "İstanbul",
  "phone": "5551234567",
  "deliveryPoint": "Kadıköy",
  "deliveryPointName": "Kadıköy Şubesi"
}
```

### 3. Console Log'larını Kontrol Edin

Backend console'unda şu mesajları görmelisiniz:

```
✅ Sipariş bildirimi başarıyla n8n'e gönderildi: {orderId}
```

Eğer hata varsa:

```
❌ n8n sipariş bildirimi gönderilirken hata oluştu: {error}
```

## 🛠️ Sorun Giderme

### Webhook Gönderilmiyor

1. **.env dosyasını kontrol edin:**
   - `N8N_WEBHOOK_URL` tanımlı mı?
   - URL doğru mu?

2. **n8n webhook'unun çalıştığından emin olun:**
   - n8n'de workflow aktif mi?
   - Webhook URL'ine manuel POST isteği göndererek test edin

3. **Network bağlantısını kontrol edin:**
   - Backend sunucusu n8n URL'ine erişebiliyor mu?
   - Firewall/proxy ayarları webhook gönderimine izin veriyor mu?

4. **Console log'larını kontrol edin:**
   - Hata mesajları detaylı bilgi verir

### Webhook Gönderiliyor Ama n8n'de Görünmüyor

1. **n8n workflow'unun aktif olduğundan emin olun**
2. **Webhook node'unun ayarlarını kontrol edin**
3. **n8n execution log'larını kontrol edin**

### Timeout Hatası

Eğer timeout hatası alıyorsanız, `backend/services/n8n.service.js` dosyasındaki timeout değerini artırabilirsiniz:

```javascript
timeout: 10000, // 10 saniye (varsayılan)
```

## 🔐 Güvenlik

- Webhook gönderimi **asenkron** olarak yapılır, ana işlemi engellemez
- Webhook gönderimi başarısız olsa bile sipariş oluşturulur
- Webhook secret kullanarak güvenliği artırabilirsiniz (ileride)

## 📝 Notlar

- Sipariş bildirimi her sipariş oluşturulduğunda **otomatik** gönderilir
- Bildirim gönderimi **non-blocking**'dir (ana işlemi yavaşlatmaz)
- Webhook gönderimi başarısız olsa bile sipariş başarıyla oluşturulur
- Tüm webhook gönderimleri console'a loglanır

## 🎉 Başarılı Kurulum Kontrol Listesi

- [ ] `.env` dosyasına `N8N_WEBHOOK_URL` eklendi
- [ ] Backend sunucusu yeniden başlatıldı
- [ ] n8n'de webhook workflow'u oluşturuldu ve aktif
- [ ] Test siparişi oluşturuldu
- [ ] n8n'de webhook alındı ve işlendi
- [ ] Console'da başarılı mesaj görüldü

## 📞 Destek

Sorun yaşarsanız:
1. Console log'larını kontrol edin
2. n8n execution log'larını kontrol edin
3. Network bağlantısını test edin
4. `.env` dosyasındaki URL'yi doğrulayın

