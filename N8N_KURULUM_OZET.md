# 🚀 n8n Sipariş Bildirim Sistemi - Özet Kılavuz

## 📋 Ne Yapıldı?

### ✅ Backend'de Yapılanlar:

1. **n8n Service Oluşturuldu** (`backend/services/n8n.service.js`)
   - Sipariş bildirimlerini n8n'e gönderen fonksiyonlar eklendi
   - Detaylı debug logları eklendi
   - Hata yakalama ve loglama sistemi kuruldu

2. **Payment Controller Güncellendi** (`backend/controllers/payment.controller.js`)
   - Her yeni sipariş oluşturulduğunda otomatik olarak n8n'e bildirim gönderiliyor
   - Sipariş verileri hazırlanıp formatlanıyor
   - Ana sipariş işlemini engellemeyecek şekilde (non-blocking) çalışıyor

3. **Test Endpoint'leri Eklendi**
   - `GET /api/n8n/test` - Bağlantı kontrolü
   - `POST /api/n8n/test-order` - Test sipariş bildirimi

4. **n8n Route'ları Oluşturuldu** (`backend/routes/n8n.route.js`)
   - n8n'den gelen webhook'ları almak için endpoint

### 🔧 Teknik Detaylar:

- Her sipariş oluşturulduğunda **otomatik** olarak n8n'e webhook gönderilir
- Webhook gönderimi **asenkron** çalışır (sipariş işlemini yavaşlatmaz)
- Hata olsa bile sipariş oluşturulur (non-blocking)
- Tüm işlemler console'a detaylı loglar yazar

## 🎯 n8n'de Ne Yapmanız Gerekiyor?

### 1. n8n'de Workflow Oluşturun

n8n arayüzünde (https://n8n.devrekbenimmarketim.com):

1. **Yeni Workflow Oluştur** butonuna tıklayın
2. İsim verin (örn: "Sipariş Bildirimleri")

### 2. Webhook Trigger Ekleyin

1. Workflow'unuzda **"+"** butonuna tıklayın
2. **"Webhook"** node'unu seçin
3. Webhook ayarlarını yapın:
   
   **Settings:**
   - **HTTP Method**: `POST`
   - **Path**: `/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b`
   - **Response Mode**: `Respond to Webhook` (veya `When Last Node Finishes`)
   - **Production URL**: Otomatik oluşturulur veya zaten varsa:
     ```
     https://n8n.devrekbenimmarketim.com/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b
     ```

4. **"Save"** butonuna tıklayın

### 3. Workflow'u Test Edin

Webhook node'unda **"Test"** butonuna tıklayın. Bu, örnek bir request gönderir ve veriyi görüntülemenizi sağlar.

### 4. İstediğiniz İşlemleri Ekleyin

Webhook node'undan sonra istediğiniz node'ları ekleyebilirsiniz:

#### Örnek 1: Email Gönderme
1. **Gmail** veya **SMTP Email** node'u ekleyin
2. Webhook node'undan gelen verileri kullanarak email gönderin

**Email İçeriği Örneği:**
```
Konu: Yeni Sipariş! - {{ $json.body.order.id }}

Merhaba,

Yeni bir sipariş geldi!

Sipariş Detayları:
- Sipariş ID: {{ $json.body.order.id }}
- Müşteri: {{ $json.body.order.user.name }}
- Email: {{ $json.body.order.user.email }}
- Telefon: {{ $json.body.order.user.phone }}
- Toplam: {{ $json.body.order.totalAmount }} TL
- Şehir: {{ $json.body.order.city }}
- Teslimat Noktası: {{ $json.body.order.deliveryPointName }}

Ürünler:
{{ $json.body.order.products.map(p => '- ' + p.name + ' x' + p.quantity + ' = ' + p.total + ' TL').join('\n') }}

Not: {{ $json.body.order.note }}
```

#### Örnek 2: Slack Bildirimi
1. **Slack** node'u ekleyin
2. Slack kanalınıza bildirim gönderin

#### Örnek 3: WhatsApp Bildirimi
1. **WhatsApp Business API** node'u ekleyin
2. Telefon numaranıza WhatsApp mesajı gönderin

#### Örnek 4: Veritabanına Kayıt
1. **MySQL** veya **PostgreSQL** node'u ekleyin
2. Sipariş verilerini veritabanına kaydedin

#### Örnek 5: SMS Gönderme
1. **Twilio** veya başka bir SMS servisi node'u ekleyin
2. SMS gönderin

### 5. Workflow'u Aktif Edin

1. Workflow'un sağ üst köşesindeki **"Inactive"** butonuna tıklayın
2. **"Active"** durumuna geçirin
3. Workflow artık webhook'ları almaya hazır!

## 📨 Gönderilen Veri Formatı

Web sitemizden n8n'e şu formatta veri gönderilir:

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

### n8n'de Veriyi Kullanma

n8n'de veriyi kullanmak için:

- **Sipariş ID**: `{{ $json.body.order.id }}`
- **Müşteri Adı**: `{{ $json.body.order.user.name }}`
- **Email**: `{{ $json.body.order.user.email }}`
- **Telefon**: `{{ $json.body.order.user.phone }}`
- **Toplam Tutar**: `{{ $json.body.order.totalAmount }}`
- **Şehir**: `{{ $json.body.order.city }}`
- **Ürünler**: `{{ $json.body.order.products }}`

## ✅ Kontrol Listesi

n8n workflow'unuz hazır olana kadar:

- [ ] n8n'de yeni workflow oluşturuldu
- [ ] Webhook node'u eklendi
- [ ] Webhook path: `/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b`
- [ ] HTTP Method: `POST`
- [ ] Workflow aktif edildi
- [ ] Test edildi (Test butonu ile)
- [ ] İstediğiniz işlemler eklendi (Email, Slack, vb.)

## 🔧 Backend'de Yapmanız Gerekenler

### 1. .env Dosyasını Kontrol Edin

Root dizinde `.env` dosyanızda şu satır olmalı:

```env
N8N_WEBHOOK_URL=https://n8n.devrekbenimmarketim.com/webhook-test/39247763-73fa-48e3-a6ad-16cecffa7e7b
```

### 2. Backend Sunucusunu Yeniden Başlatın

`.env` dosyasını güncelledikten sonra:

```bash
npm run dev
```

veya production için:

```bash
npm start
```

### 3. Test Edin

Test endpoint'lerini kullanarak bağlantıyı test edin:

```bash
# 1. Environment kontrolü
GET http://localhost:5000/api/n8n/test

# 2. Test sipariş bildirimi
POST http://localhost:5000/api/n8n/test-order
```

## 🎯 Çalışma Prensibi

1. **Kullanıcı sipariş oluşturur** → Web sitenizde
2. **Backend siparişi kaydeder** → MongoDB'ye
3. **Otomatik olarak n8n'e webhook gönderilir** → Asenkron
4. **n8n workflow tetiklenir** → Webhook alınır
5. **İstediğiniz işlemler yapılır** → Email, SMS, Slack, vb.

## 📊 n8n'de Veriyi Görüntüleme

Webhook node'una tıkladığınızda, gelen veriyi görebilirsiniz. Test etmek için:

1. Webhook node'unda **"Test"** butonuna tıklayın
2. Veya gerçek bir sipariş oluşturun ve n8n'de execution log'larını kontrol edin

## 🆘 Sorun Giderme

Eğer bildirim gelmiyorsa:

1. **Backend console log'larını kontrol edin**
   - `✅ Sipariş bildirimi başarıyla n8n'e gönderildi` mesajını arayın
   - Hata varsa `❌` ile başlayan mesajları kontrol edin

2. **n8n'de workflow'un aktif olduğundan emin olun**
   - Workflow'un durumu "Active" olmalı

3. **Test endpoint'ini kullanın**
   - `POST /api/n8n/test-order` ile test edin

4. **n8n execution log'larını kontrol edin**
   - n8n'de execution geçmişini kontrol edin

Detaylı sorun giderme için `N8N_SORUN_GIDERME.md` dosyasına bakın.

## 📞 Özet

**Backend'de:**
- ✅ Her sipariş otomatik olarak n8n'e gönderiliyor
- ✅ .env dosyasında URL tanımlı olmalı
- ✅ Sunucu yeniden başlatılmış olmalı

**n8n'de:**
- ✅ Webhook node'u eklenmeli
- ✅ Path doğru olmalı
- ✅ Workflow aktif olmalı
- ✅ İstediğiniz işlemleri ekleyin (Email, Slack, vb.)

Her şey hazır! Artık her yeni sipariş geldiğinde n8n workflow'unuz otomatik çalışacak! 🎉

