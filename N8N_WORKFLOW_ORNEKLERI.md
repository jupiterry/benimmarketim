# 🎯 n8n Workflow Örnekleri

## ✅ Sistem Çalışıyor!

n8n'e bildirimler geliyor. İşte gelen veri formatı ve workflow örnekleri.

## 📨 Gelen Veri Formatı

n8n workflow'unuzda gelen veri şu formatta:

```json
{
  "event": "order.created",
  "timestamp": "2025-11-23T00:30:13.369Z",
  "order": {
    "id": "69225595359e81b9ec57283a",
    "orderNumber": "69225595359e81b9ec57283a",
    "user": {
      "id": "67b90b1a5c8f59d61c399669",
      "name": "Emirhan Gemicioğlu",
      "email": "jupiterryhd@gmail.com",
      "phone": "5555555555"
    },
    "products": [
      {
        "name": "Aile Boyu Çiğköfte (600Gr)",
        "quantity": 1,
        "price": 250,
        "total": 250
      },
      {
        "name": "Çiğköfte 1kg",
        "quantity": 1,
        "price": 450,
        "total": 450
      }
    ],
    "totalAmount": 700,
    "city": "Erkek KYK Yurdu",
    "deliveryPoint": "boysDorm",
    "deliveryPointName": "Erkek KYK Yurdu",
    "status": "Hazırlanıyor",
    "createdAt": "2025-11-23T00:30:13.173Z",
    "note": ""
  }
}
```

## 🔧 n8n'de Veriye Erişim

n8n workflow'unuzda veriyi şu şekilde kullanabilirsiniz:

### Temel Alanlar:
- **Sipariş ID**: `{{ $json.body.order.id }}`
- **Sipariş Numarası**: `{{ $json.body.order.orderNumber }}`
- **Müşteri Adı**: `{{ $json.body.order.user.name }}`
- **Email**: `{{ $json.body.order.user.email }}`
- **Telefon**: `{{ $json.body.order.user.phone }}`
- **Toplam Tutar**: `{{ $json.body.order.totalAmount }}`
- **Şehir**: `{{ $json.body.order.city }}`
- **Teslimat Noktası**: `{{ $json.body.order.deliveryPointName }}`
- **Durum**: `{{ $json.body.order.status }}`
- **Oluşturulma Zamanı**: `{{ $json.body.order.createdAt }}`
- **Not**: `{{ $json.body.order.note }}`

### Ürünler Array'i:
```javascript
{{ $json.body.order.products }}
```

## 📧 Örnek 1: Email Bildirimi (Gmail)

### Adımlar:
1. **Webhook** node'u (zaten var)
2. **Gmail** node'u ekleyin

### Gmail Ayarları:

**To (Alıcı):**
```
info@devrekbenimmarketim.com
```

**Subject (Konu):**
```
🛒 Yeni Sipariş! - #{{ $json.body.order.orderNumber }}
```

**Message (Mesaj):**
```
Merhaba,

Yeni bir sipariş geldi!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 SİPARİŞ BİLGİLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sipariş No: {{ $json.body.order.orderNumber }}
Tarih: {{ $json.body.order.createdAt }}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 MÜŞTERİ BİLGİLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ad Soyad: {{ $json.body.order.user.name }}
Email: {{ $json.body.order.user.email }}
Telefon: {{ $json.body.order.user.phone }}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 TESLİMAT BİLGİLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Teslimat Noktası: {{ $json.body.order.deliveryPointName }}
Şehir: {{ $json.body.order.city }}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛒 ÜRÜNLER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{ $json.body.order.products.map(p => '• ' + p.name + ' x' + p.quantity + ' = ' + p.total + ' TL').join('\n') }}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 TOPLAM: {{ $json.body.order.totalAmount }} TL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{ $json.body.order.note ? 'Not: ' + $json.body.order.note : '' }}

İyi çalışmalar!
```

## 📱 Örnek 2: WhatsApp Bildirimi

### Adımlar:
1. **Webhook** node'u
2. **WhatsApp Business API** node'u veya **HTTP Request** node'u ekleyin

### HTTP Request ile WhatsApp (Baasel.io, Twilio vb.):

**Method:** `POST`

**URL:**
```
https://your-whatsapp-api.com/send
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

**Body (JSON):**
```json
{
  "to": "YOUR_PHONE_NUMBER",
  "message": "🛒 Yeni Sipariş!\n\nSipariş No: {{ $json.body.order.orderNumber }}\nMüşteri: {{ $json.body.order.user.name }}\nTelefon: {{ $json.body.order.user.phone }}\nToplam: {{ $json.body.order.totalAmount }} TL\n\nÜrünler:\n{{ $json.body.order.products.map(p => '• ' + p.name + ' x' + p.quantity).join('\n') }}"
}
```

## 💬 Örnek 3: Slack Bildirimi

### Adımlar:
1. **Webhook** node'u
2. **Slack** node'u ekleyin

### Slack Message:

**Channel:** `#siparisler` (veya istediğiniz kanal)

**Message:**
```
🛒 *Yeni Sipariş Geldi!*

*Sipariş No:* {{ $json.body.order.orderNumber }}
*Müşteri:* {{ $json.body.order.user.name }}
*Telefon:* {{ $json.body.order.user.phone }}
*Toplam:* {{ $json.body.order.totalAmount }} TL
*Teslimat:* {{ $json.body.order.deliveryPointName }}

*Ürünler:*
{{ $json.body.order.products.map(p => '• ' + p.name + ' x' + p.quantity + ' = ' + p.total + ' TL').join('\n') }}
```

## 📊 Örnek 4: Veritabanına Kayıt

### Adımlar:
1. **Webhook** node'u
2. **PostgreSQL** veya **MySQL** node'u ekleyin

### SQL Query:

```sql
INSERT INTO orders (
  order_id,
  order_number,
  customer_name,
  customer_email,
  customer_phone,
  total_amount,
  delivery_point,
  status,
  created_at,
  products_json
) VALUES (
  '{{ $json.body.order.id }}',
  '{{ $json.body.order.orderNumber }}',
  '{{ $json.body.order.user.name }}',
  '{{ $json.body.order.user.email }}',
  '{{ $json.body.order.user.phone }}',
  {{ $json.body.order.totalAmount }},
  '{{ $json.body.order.deliveryPointName }}',
  '{{ $json.body.order.status }}',
  '{{ $json.body.order.createdAt }}',
  '{{ JSON.stringify($json.body.order.products) }}'
);
```

## 📱 Örnek 5: SMS Gönderme (Twilio)

### Adımlar:
1. **Webhook** node'u
2. **Twilio** node'u ekleyin

### Twilio Ayarları:

**To:** `YOUR_ADMIN_PHONE`

**Message:**
```
🛒 Yeni Sipariş!

Sipariş No: {{ $json.body.order.orderNumber }}
Müşteri: {{ $json.body.order.user.name }}
Telefon: {{ $json.body.order.user.phone }}
Toplam: {{ $json.body.order.totalAmount }} TL
Teslimat: {{ $json.body.order.deliveryPointName }}
```

## 🎯 Örnek 6: Çoklu Bildirim (Email + Slack + SMS)

### Workflow Yapısı:
```
Webhook → Function (Veri Hazırlama) → [Split] 
                                    ├─→ Gmail
                                    ├─→ Slack
                                    └─→ Twilio (SMS)
```

### Function Node (Veri Hazırlama):

```javascript
// Sipariş verisini hazırla
const order = items[0].json.body.order;

// Ürün listesini formatla
const productsList = order.products.map(p => 
  `• ${p.name} x${p.quantity} = ${p.total} TL`
).join('\n');

return [{
  json: {
    orderNumber: order.orderNumber,
    customerName: order.user.name,
    customerEmail: order.user.email,
    customerPhone: order.user.phone,
    totalAmount: order.totalAmount,
    deliveryPoint: order.deliveryPointName,
    products: productsList,
    formattedMessage: `
🛒 Yeni Sipariş!
Sipariş No: ${order.orderNumber}
Müşteri: ${order.user.name}
Telefon: ${order.user.phone}
Toplam: ${order.totalAmount} TL
Teslimat: ${order.deliveryPointName}

Ürünler:
${productsList}
    `
  }
}];
```

## 🔔 Örnek 7: Koşullu Bildirim (Telegram)

### Adımlar:
1. **Webhook** node'u
2. **IF** node'u (Koşul: Toplam tutar > 500 TL)
3. **Telegram** node'u ekleyin

### IF Koşulu:
```javascript
{{ $json.body.order.totalAmount }} > 500
```

### Telegram Message:
```
🚨 Büyük Sipariş!

Sipariş No: {{ $json.body.order.orderNumber }}
Müşteri: {{ $json.body.order.user.name }}
Toplam: {{ $json.body.order.totalAmount }} TL
```

## 📝 Örnek 8: Özelleştirilmiş Email Template

### HTML Email Gönderme:

**Subject:**
```
🛒 Yeni Sipariş #{{ $json.body.order.orderNumber }}
```

**HTML Body:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .header { background: #10b981; color: white; padding: 20px; }
    .content { padding: 20px; }
    .order-info { background: #f3f4f6; padding: 15px; margin: 10px 0; }
    .products { margin: 10px 0; }
    .total { font-size: 24px; font-weight: bold; color: #10b981; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛒 Yeni Sipariş!</h1>
  </div>
  <div class="content">
    <div class="order-info">
      <h2>Sipariş Bilgileri</h2>
      <p><strong>Sipariş No:</strong> {{ $json.body.order.orderNumber }}</p>
      <p><strong>Tarih:</strong> {{ $json.body.order.createdAt }}</p>
    </div>
    
    <div class="order-info">
      <h2>Müşteri Bilgileri</h2>
      <p><strong>Ad Soyad:</strong> {{ $json.body.order.user.name }}</p>
      <p><strong>Email:</strong> {{ $json.body.order.user.email }}</p>
      <p><strong>Telefon:</strong> {{ $json.body.order.user.phone }}</p>
    </div>
    
    <div class="order-info">
      <h2>Teslimat Bilgileri</h2>
      <p><strong>Teslimat Noktası:</strong> {{ $json.body.order.deliveryPointName }}</p>
      <p><strong>Şehir:</strong> {{ $json.body.order.city }}</p>
    </div>
    
    <div class="products">
      <h2>Ürünler</h2>
      <ul>
        {{ $json.body.order.products.map(p => '<li>' + p.name + ' x' + p.quantity + ' = ' + p.total + ' TL</li>').join('') }}
      </ul>
    </div>
    
    <div class="total">
      <p>Toplam: {{ $json.body.order.totalAmount }} TL</p>
    </div>
  </div>
</body>
</html>
```

## ✅ Kontrol Listesi

Workflow'unuz hazır olana kadar:

- [x] Webhook node'u çalışıyor ✅
- [x] Veri geliyor ✅
- [ ] İstediğiniz bildirim türünü seçtiniz
- [ ] Node'u eklediniz
- [ ] Ayarları yaptınız
- [ ] Test ettiniz
- [ ] Workflow aktif

## 🎉 Özet

Artık n8n'e bildirimler geliyor! İstediğiniz bildirim türünü ekleyip workflow'unuzu tamamlayabilirsiniz.

**Gelen veriler:**
- ✅ Sipariş bilgileri
- ✅ Müşteri bilgileri
- ✅ Ürün listesi
- ✅ Teslimat bilgileri
- ✅ Toplam tutar

**Yapabilecekleriniz:**
- ✅ Email gönderme
- ✅ WhatsApp mesajı
- ✅ Slack bildirimi
- ✅ SMS gönderme
- ✅ Veritabanına kayıt
- ✅ Telegram bildirimi
- ✅ İstediğiniz herhangi bir otomasyon

Sistem çalışıyor! 🚀

