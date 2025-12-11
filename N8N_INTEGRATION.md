# n8n Entegrasyonu Kılavuzu

Bu projeye n8n entegrasyonu başarıyla eklenmiştir. Bu kılavuz, n8n'i nasıl kullanacağınızı açıklar.

## 📋 İçindekiler

1. [Kurulum](#kurulum)
2. [Webhook Gönderme (Siteden n8n'e)](#webhook-gönderme)
3. [Webhook Alma (n8n'den Siteye)](#webhook-alma)
4. [Kullanım Örnekleri](#kullanım-örnekleri)
5. [API Endpoint'leri](#api-endpointleri)

## 🚀 Kurulum

### 1. Environment Değişkenlerini Ayarlayın

`.env` dosyanıza aşağıdaki değişkenleri ekleyin:

```env
# n8n Webhook URL'i - Genel bildirimler için (sipariş, kayıt vb.)
# Bu URL'ye siparişler ve diğer genel event'ler otomatik olarak gönderilir
N8N_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db

# (Opsiyonel) n8n Login Webhook URL'i - Kullanıcı giriş bildirimleri için
# Eğer login bildirimleri için ayrı bir workflow kullanıyorsanız bu URL'i tanımlayın
# Tanımlanmazsa, login bildirimleri de N8N_WEBHOOK_URL'e gönderilir
N8N_LOGIN_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook-test/login-webhook

# (Opsiyonel) n8n Base URL (workflow-specific webhook'lar için)
N8N_BASE_URL=https://n8n.devrekbenimmarketim.com

# (Opsiyonel) Webhook güvenliği için secret
N8N_WEBHOOK_SECRET=your-secret-key-here
```

**Önemli:** `.env` dosyanızın root dizinde olduğundan emin olun. Eğer `.env` dosyanız yoksa, oluşturup yukarıdaki `N8N_WEBHOOK_URL` değerini ekleyin.

### 2. n8n'de Webhook Oluşturma

n8n'de bir webhook oluşturmak için:

1. n8n arayüzüne giriş yapın
2. Yeni bir workflow oluşturun
3. "Webhook" trigger'ı ekleyin
4. Webhook ayarlarını yapın:
   - **HTTP Method**: POST
   - **Path**: İstediğiniz path (örn: `/order-webhook`)
   - **Response Mode**: Respond to Webhook
5. Webhook URL'ini kopyalayın ve `.env` dosyasına ekleyin

## 📤 Webhook Gönderme (Siteden n8n'e)

Sitenizdeki belirli olaylar otomatik olarak n8n'e webhook olarak gönderilir:

### Otomatik Gönderilen Event'ler

#### 1. Yeni Sipariş (order.created) 🔔

**Her yeni sipariş oluşturulduğunda otomatik olarak n8n'e bildirim gönderilir.**

Bir sipariş oluşturulduğunda, aşağıdaki format ile veriler n8n'e gönderilir:

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
        "name": "Ürün Adı",
        "quantity": 2,
        "price": 25.50,
        "total": 51.00
      }
    ],
    "totalAmount": 51.00,
    "city": "İstanbul",
    "deliveryPoint": "Kadıköy",
    "deliveryPointName": "Kadıköy Şubesi",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "note": "Ekstra not"
  }
}
```

**Önemli:** Sipariş bildirimleri `sendOrderNotification()` fonksiyonu ile gönderilir ve ana sipariş işlemini engellemez. Webhook gönderimi başarısız olsa bile sipariş oluşturulur.

#### 2. Yeni Kullanıcı Kaydı (user.registered)

Bir kullanıcı kayıt olduğunda:

```json
{
  "event": "user.registered",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "userId": "507f191e810c19729de860ea",
    "name": "Ahmet Yılmaz",
    "email": "ahmet@example.com",
    "phone": "5551234567",
    "role": "user",
    "deviceType": "web",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "registeredAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### 3. Kullanıcı Girişi (user.logged_in) 🔐

Bir kullanıcı sisteme giriş yaptığında:

```json
{
  "event": "user.logged_in",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "userId": "507f191e810c19729de860ea",
    "name": "Ahmet Yılmaz",
    "email": "ahmet@example.com",
    "phone": "5551234567",
    "role": "user",
    "deviceType": "web",
    "lastLoginAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Kullanım:** Bu event ile kullanıcı girişlerini Telegram, Email veya diğer platformlara bildirebilirsiniz.

### Manuel Webhook Gönderme

Kod içinde manuel olarak webhook göndermek için:

```javascript
import { sendToN8N, sendToN8NWorkflow } from "../services/n8n.service.js";

// Genel webhook gönderme
await sendToN8N('custom.event', {
  customData: "veri",
  timestamp: new Date().toISOString()
});

// Belirli bir workflow'a webhook gönderme
await sendToN8NWorkflow('workflow-id', {
  data: "veri"
});
```

## 📥 Webhook Alma (n8n'den Siteye)

Siteniz, n8n'den gelen webhook'ları almak için hazırdır.

### Webhook Endpoint'i

**URL**: `POST /api/n8n/webhook`

**Örnek Request**:
```json
{
  "event": "update_order_status",
  "data": {
    "orderId": "507f1f77bcf86cd799439011",
    "status": "delivered"
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Webhook başarıyla alındı ve işlendi",
  "receivedAt": "2024-01-15T10:30:00.000Z"
}
```

### n8n'de HTTP Request Node Kullanımı

n8n workflow'unuzda sitenize webhook göndermek için:

1. **HTTP Request** node'u ekleyin
2. Ayarları yapın:
   - **Method**: POST
   - **URL**: `https://your-site.com/api/n8n/webhook`
   - **Body**: JSON formatında
   - **Headers**: 
     ```
     Content-Type: application/json
     ```
3. Body örneği:
   ```json
   {
     "event": "update_order_status",
     "data": {
       "orderId": "{{ $json.orderId }}",
       "status": "delivered"
     }
   }
   ```

## 💡 Kullanım Örnekleri

### Örnek 1: Sipariş Bildirimi

n8n workflow'unuz yeni sipariş geldiğinde:

1. Email gönderebilir
2. Slack'e bildirim gönderebilir
3. WhatsApp mesajı gönderebilir
4. Veritabanına kayıt yapabilir

### Örnek 2: Otomatik Sipariş Durumu Güncelleme

n8n workflow'unuz:
1. Kargo firmasından teslimat durumunu kontrol eder
2. Sipariş durumunu otomatik günceller
3. Müşteriye bildirim gönderir

### Örnek 3: Yeni Kullanıcı Hoş Geldin Mesajı

Yeni kullanıcı kayıt olduğunda:
1. Hoş geldin email'i gönderilir
2. Kullanıcıya özel indirim kuponu oluşturulur
3. CRM sistemine kayıt eklenir

## 🔌 API Endpoint'leri

### Test Endpoint

**URL**: `GET /api/n8n/test`

Bağlantıyı test etmek için kullanılır.

**Response**:
```json
{
  "success": true,
  "message": "n8n API endpoint'i çalışıyor",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "endpoints": {
    "webhook": "/api/n8n/webhook",
    "test": "/api/n8n/test"
  }
}
```

### Webhook Endpoint

**URL**: `POST /api/n8n/webhook`

n8n'den gelen webhook'ları alır.

## 🔒 Güvenlik

- Webhook secret kullanarak güvenliği artırabilirsiniz
- `.env` dosyanıza `N8N_WEBHOOK_SECRET` ekleyin
- n8n'de de aynı secret'i kullanın
- Webhook imza doğrulaması için `backend/services/n8n.service.js` dosyasındaki `verifyN8NWebhook` fonksiyonunu geliştirebilirsiniz

## 🛠️ Sorun Giderme

### Webhook Gönderilmiyor

1. `.env` dosyasında `N8N_WEBHOOK_URL` doğru ayarlanmış mı kontrol edin
2. n8n webhook URL'inin erişilebilir olduğundan emin olun
3. Console log'larını kontrol edin (webhook hataları loglanır ama ana işlemi engellemez)

### Webhook Alınamıyor

1. n8n'den gönderilen request'in doğru formatta olduğundan emin olun
2. CORS ayarlarını kontrol edin (gerekirse `server.js`'deki CORS ayarlarına n8n domain'inizi ekleyin)
3. Endpoint'in doğru olduğundan emin olun: `/api/n8n/webhook`

## 📝 Notlar

- Webhook gönderim hataları ana işlemleri engellemez (non-blocking)
- Tüm webhook işlemleri asenkron olarak çalışır
- Webhook gönderimi başarısız olsa bile sipariş/kayıt işlemleri devam eder
- Webhook gönderim hataları console'a loglanır

## 🔗 Faydalı Linkler

- [n8n Dokümantasyonu](https://docs.n8n.io/)
- [n8n Webhook Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [n8n HTTP Request Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)

