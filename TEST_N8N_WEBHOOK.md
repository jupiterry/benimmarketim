# 🧪 n8n Webhook Test Kılavuzu

Bu kılavuz, n8n webhook URL'inize test isteği göndermenin farklı yöntemlerini açıklar.

## 📍 Webhook URL
```
https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db
```

---

## 🚀 Yöntem 1: PowerShell'de curl ile (Önerilen)

### Basit Test (GET)
```powershell
curl https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db
```

### POST İsteği ile Test (Sipariş Formatında)
```powershell
curl -X POST https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db `
  -H "Content-Type: application/json" `
  -d '{\"event\":\"order.created\",\"timestamp\":\"2024-01-15T10:30:00.000Z\",\"order\":{\"id\":\"test-123\",\"orderNumber\":\"TEST-001\",\"user\":{\"name\":\"Test Kullanıcı\",\"email\":\"test@example.com\",\"phone\":\"5551234567\"},\"products\":[{\"name\":\"Test Ürün\",\"quantity\":1,\"price\":25.50}],\"totalAmount\":25.50,\"city\":\"İstanbul\",\"status\":\"pending\"}}'
```

### Daha Okunabilir POST İsteği (PowerShell)
```powershell
$body = @{
    event = "order.created"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    order = @{
        id = "test-order-$(Get-Date -Format 'yyyyMMddHHmmss')"
        orderNumber = "TEST-001"
        user = @{
            name = "Test Kullanıcı"
            email = "test@example.com"
            phone = "5551234567"
        }
        products = @(
            @{
                name = "Test Ürün 1"
                quantity = 2
                price = 25.50
                total = 51.00
            }
        )
        totalAmount = 51.00
        city = "İstanbul"
        deliveryPoint = "Kadıköy"
        status = "pending"
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

---

## 🌐 Yöntem 2: Tarayıcıdan Test (Sadece GET)

Tarayıcınızın adres çubuğuna şunu yazın:
```
https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db
```

**Not:** Bu sadece GET isteği gönderir. n8n webhook'ları genellikle POST bekler, bu yüzden bu yöntem sınırlıdır.

---

## 🔧 Yöntem 3: Backend Test Endpoint'i ile (En Kolay)

Backend sunucunuz çalışıyorsa, projenizde zaten test endpoint'leri var:

### Test Bağlantısı Kontrolü
```powershell
curl http://localhost:5000/api/n8n/test
```

### Test Sipariş Bildirimi Gönderme
```powershell
curl -X POST http://localhost:5000/api/n8n/test-order
```

Bu endpoint, gerçek sipariş formatında test verisi gönderir ve sonucu döndürür.

---

## 📮 Yöntem 4: Postman/Insomnia ile

### Postman Ayarları:
1. **Method:** POST
2. **URL:** `https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db`
3. **Headers:**
   - `Content-Type: application/json`
4. **Body (raw JSON):**
```json
{
  "event": "order.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "order": {
    "id": "test-order-123",
    "orderNumber": "TEST-001",
    "user": {
      "id": "user-123",
      "name": "Test Kullanıcı",
      "email": "test@example.com",
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
    "note": "Test siparişi"
  }
}
```

---

## 🐍 Yöntem 5: Python ile

```python
import requests
import json
from datetime import datetime

url = "https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db"

payload = {
    "event": "order.created",
    "timestamp": datetime.utcnow().isoformat() + "Z",
    "order": {
        "id": "test-order-123",
        "orderNumber": "TEST-001",
        "user": {
            "name": "Test Kullanıcı",
            "email": "test@example.com",
            "phone": "5551234567"
        },
        "products": [
            {
                "name": "Test Ürün",
                "quantity": 1,
                "price": 25.50,
                "total": 25.50
            }
        ],
        "totalAmount": 25.50,
        "city": "İstanbul",
        "status": "pending"
    }
}

response = requests.post(url, json=payload)
print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}")
```

---

## 📝 Yöntem 6: Node.js ile

```javascript
const axios = require('axios');

const webhookUrl = 'https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db';

const testData = {
  event: 'order.created',
  timestamp: new Date().toISOString(),
  order: {
    id: 'test-order-123',
    orderNumber: 'TEST-001',
    user: {
      name: 'Test Kullanıcı',
      email: 'test@example.com',
      phone: '5551234567'
    },
    products: [
      {
        name: 'Test Ürün',
        quantity: 1,
        price: 25.50,
        total: 25.50
      }
    ],
    totalAmount: 25.50,
    city: 'İstanbul',
    status: 'pending'
  }
};

axios.post(webhookUrl, testData)
  .then(response => {
    console.log('✅ Başarılı!', response.data);
  })
  .catch(error => {
    console.error('❌ Hata:', error.message);
  });
```

---

## ✅ Başarılı Yanıt Örneği

n8n webhook'unuz çalışıyorsa, genellikle şu tür bir yanıt alırsınız:

```json
{
  "message": "Workflow was started"
}
```

veya workflow'unuzun döndürdüğü özel yanıt.

---

## 🔍 Sorun Giderme

### Timeout Hatası
- n8n sunucusunun çalıştığından emin olun
- Network bağlantınızı kontrol edin

### 404 Not Found
- Webhook URL'inin doğru olduğundan emin olun
- n8n'de workflow'un aktif olduğundan emin olun

### 401/403 Unauthorized
- n8n webhook'unuzun authentication gerektirip gerektirmediğini kontrol edin

---

## 💡 Hızlı Test Komutu (PowerShell)

En hızlı test için bu komutu kullanın:

```powershell
Invoke-WebRequest -Uri "https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db" -Method POST -ContentType "application/json" -Body '{"test":"data"}'
```

