# 🔐 Giriş ve Kayıt API Dokümantasyonu

Bu dokümantasyon, Benim Marketim uygulamasının giriş yapma ve kayıt olma API endpoint'lerini detaylı olarak açıklar.

## 📋 İçindekiler

1. [Genel Bilgiler](#genel-bilgiler)
2. [Kayıt Olma (Signup)](#kayıt-olma-signup)
3. [Giriş Yapma (Login)](#giriş-yapma-login)
4. [Çıkış Yapma (Logout)](#çıkış-yapma-logout)
5. [Token Yenileme (Refresh Token)](#token-yenileme-refresh-token)
6. [Profil Bilgisi (Get Profile)](#profil-bilgisi-get-profile)
7. [Hesap Silme (Delete Account)](#hesap-silme-delete-account)
8. [Test Endpoint'leri](#test-endpointleri)
9. [Hata Kodları](#hata-kodları)
10. [Güvenlik](#güvenlik)

---

## 🌐 Genel Bilgiler

### Base URL
```
https://devrekbenimmarketim.com/api/auth
```

### Authentication
API'ler JWT (JSON Web Token) tabanlı authentication kullanır. İki tür token vardır:
- **Access Token**: API isteklerinde kullanılır (1 yıl geçerli)
- **Refresh Token**: Access token'ı yenilemek için kullanılır (1 yıl geçerli)

### Token Kullanımı
Token'lar iki şekilde gönderilebilir:
1. **Cookie** (Web için): `accessToken` ve `refreshToken` cookie'leri otomatik olarak set edilir
2. **Authorization Header** (Mobil için): `Authorization: Bearer <accessToken>`

---

## 📝 Kayıt Olma (Signup)

Yeni kullanıcı kaydı oluşturur ve otomatik olarak giriş yapar.

### Endpoint
```
POST /api/auth/signup
```

### Request Body

```json
{
  "name": "Ahmet Yılmaz",
  "email": "ahmet@example.com",
  "password": "123456",
  "phone": "5551234567",
  "deviceType": "mobile"
}
```

### Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `name` | string | ✅ Evet | İsim ve soyisim (en az 2 kelime, her kelime en az 2 karakter) |
| `email` | string | ✅ Evet | E-posta adresi (unique, lowercase) |
| `password` | string | ✅ Evet | Şifre (minimum 6 karakter) |
| `phone` | string | ❌ Hayır | Telefon numarası |
| `deviceType` | string | ❌ Hayır | Cihaz tipi: `"desktop"`, `"mobile"`, `"tablet"`, `"unknown"` (varsayılan: `"unknown"`) |

### Başarılı Response (201)

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Ahmet Yılmaz",
  "email": "ahmet@example.com",
  "role": "customer",
  "phone": "5551234567",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Hata Response'ları

#### 400 - Kullanıcı Zaten Mevcut
```json
{
  "message": "Kullanıcı zaten mevcut"
}
```

#### 400 - Geçersiz İsim Formatı
```json
{
  "message": "Lütfen geçerli bir isim ve soyisim giriniz (örn: Ahmet Yılmaz)"
}
```

#### 400 - Şifre Çok Kısa
```json
{
  "message": "Password must be at least 6 characters long"
}
```

#### 500 - Sunucu Hatası
```json
{
  "message": "Error message"
}
```

### Örnek Kullanım

#### cURL
```bash
curl -X POST https://devrekbenimmarketim.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ahmet Yılmaz",
    "email": "ahmet@example.com",
    "password": "123456",
    "phone": "5551234567",
    "deviceType": "mobile"
  }'
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://devrekbenimmarketim.com/api/auth/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Ahmet Yılmaz',
    email: 'ahmet@example.com',
    password: '123456',
    phone: '5551234567',
    deviceType: 'mobile'
  })
});

const data = await response.json();
console.log(data);
```

### Özellikler

- ✅ Şifre otomatik olarak hash'lenir (bcrypt)
- ✅ E-posta unique kontrolü yapılır
- ✅ Kayıt sonrası otomatik giriş yapılır (token'lar döner)
- ✅ n8n'e `user.registered` event'i gönderilir (webhook)
- ✅ Cookie'ler otomatik olarak set edilir (web için)

---

## 🔑 Giriş Yapma (Login)

Mevcut kullanıcı ile giriş yapar.

### Endpoint
```
POST /api/auth/login
```

### Request Body

```json
{
  "email": "ahmet@example.com",
  "password": "123456",
  "deviceType": "mobile"
}
```

### Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `email` | string | ✅ Evet | E-posta adresi |
| `password` | string | ✅ Evet | Şifre |
| `deviceType` | string | ❌ Hayır | Cihaz tipi: `"desktop"`, `"mobile"`, `"tablet"`, `"unknown"` |

### Başarılı Response (200)

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Ahmet Yılmaz",
  "email": "ahmet@example.com",
  "role": "customer",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Hata Response'ları

#### 400 - Geçersiz Bilgiler
```json
{
  "message": "Geçersiz E-posta veya Şifre"
}
```

#### 500 - Sunucu Hatası
```json
{
  "message": "Error message"
}
```

### Örnek Kullanım

#### cURL
```bash
curl -X POST https://devrekbenimmarketim.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ahmet@example.com",
    "password": "123456",
    "deviceType": "mobile"
  }'
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://devrekbenimmarketim.com/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'ahmet@example.com',
    password: '123456',
    deviceType: 'mobile'
  })
});

const data = await response.json();
console.log(data);
```

### Özellikler

- ✅ Şifre doğrulaması yapılır (bcrypt compare)
- ✅ Device type güncellenir (varsa)
- ✅ Token'lar oluşturulur ve döner
- ✅ Cookie'ler otomatik olarak set edilir (web için)

---

## 🚪 Çıkış Yapma (Logout)

Kullanıcıyı sistemden çıkarır ve token'ları geçersiz kılar.

### Endpoint
```
POST /api/auth/logout
```

### Request

Cookie'lerden veya Authorization header'dan refresh token alınır.

### Başarılı Response (200)

```json
{
  "message": "Başarıyla çıkış yapıldı."
}
```

### Özellikler

- ✅ Refresh token Redis'ten silinir
- ✅ Cookie'ler temizlenir
- ✅ Access token geçersiz hale gelir

### Örnek Kullanım

#### cURL (Cookie ile)
```bash
curl -X POST https://devrekbenimmarketim.com/api/auth/logout \
  -H "Cookie: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://devrekbenimmarketim.com/api/auth/logout', {
  method: 'POST',
  credentials: 'include' // Cookie'leri gönder
});

const data = await response.json();
console.log(data);
```

---

## 🔄 Token Yenileme (Refresh Token)

Access token'ın süresi dolduğunda yeni access token almak için kullanılır.

### Endpoint
```
POST /api/auth/refresh-token
```

### Request Body

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `refreshToken` | string | ✅ Evet | Refresh token |

### Başarılı Response (200)

```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Hata Response'ları

#### 401 - Refresh Token Yok
```json
{
  "message": "No refresh token provided"
}
```

#### 401 - Geçersiz Refresh Token
```json
{
  "message": "Invalid refresh token"
}
```

### Örnek Kullanım

#### cURL
```bash
curl -X POST https://devrekbenimmarketim.com/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://devrekbenimmarketim.com/api/auth/refresh-token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
});

const data = await response.json();
console.log(data.accessToken);
```

### Özellikler

- ✅ Refresh token Redis'te kontrol edilir
- ✅ Yeni access token oluşturulur (1 yıl geçerli)
- ✅ Cookie güncellenir (web için)

---

## 👤 Profil Bilgisi (Get Profile)

Kullanıcının profil bilgilerini getirir. **Authentication gerekir.**

### Endpoint
```
GET /api/auth/profile
```

### Headers

```
Authorization: Bearer <accessToken>
```

veya

```
Cookie: accessToken=<accessToken>
```

### Başarılı Response (200)

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Ahmet Yılmaz",
  "email": "ahmet@example.com",
  "phone": "5551234567",
  "role": "customer",
  "deviceType": "mobile",
  "lastActive": "2024-01-15T10:30:00.000Z",
  "cartItems": [],
  "fcmToken": null,
  "pushNotificationsEnabled": true,
  "hasFeedback": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### Hata Response'ları

#### 401 - Token Yok
```json
{
  "success": false,
  "message": "No access token provided"
}
```

#### 401 - Token Süresi Dolmuş
```json
{
  "success": false,
  "message": "Unauthorized - Access token expired"
}
```

#### 401 - Geçersiz Token
```json
{
  "success": false,
  "message": "Unauthorized - Invalid access token"
}
```

### Örnek Kullanım

#### cURL
```bash
curl -X GET https://devrekbenimmarketim.com/api/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://devrekbenimmarketim.com/api/auth/profile', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const user = await response.json();
console.log(user);
```

### Özellikler

- ✅ `lastActive` otomatik olarak güncellenir
- ✅ Şifre bilgisi response'da dönmez
- ✅ Kullanıcının tüm bilgileri döner

---

## 🗑️ Hesap Silme (Delete Account)

Kullanıcının kendi hesabını silmesini sağlar. **Authentication gerekir.**

### Endpoint
```
DELETE /api/auth/delete-account
```

### Headers

```
Authorization: Bearer <accessToken>
```

### Başarılı Response (200)

```json
{
  "message": "Hesabınız başarıyla silindi",
  "deletedAt": "2024-01-15T10:30:00.000Z"
}
```

### Hata Response'ları

#### 401 - Kullanıcı Kimliği Bulunamadı
```json
{
  "message": "Kullanıcı kimliği bulunamadı"
}
```

#### 500 - Sunucu Hatası
```json
{
  "message": "Hesap silinirken hata oluştu",
  "error": "Error message"
}
```

### Örnek Kullanım

#### cURL
```bash
curl -X DELETE https://devrekbenimmarketim.com/api/auth/delete-account \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://devrekbenimmarketim.com/api/auth/delete-account', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const data = await response.json();
console.log(data);
```

### Özellikler

- ✅ Kullanıcının tüm siparişleri silinir
- ✅ Kullanıcının tüm geri bildirimleri silinir
- ✅ Redis'teki refresh token silinir
- ✅ Cookie'ler temizlenir
- ✅ Sadece kendi hesabını silebilir (güvenlik)

---

## 🧪 Test Endpoint'leri

### API Test
```
GET /api/auth/test
```

**Response:**
```json
{
  "message": "API çalışıyor",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Auth Test (Authentication Gerekir)
```
GET /api/auth/test-auth
```

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "message": "Auth çalışıyor",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Ahmet Yılmaz",
    "email": "ahmet@example.com",
    "role": "customer"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## ❌ Hata Kodları

| HTTP Status | Açıklama |
|-------------|----------|
| 200 | Başarılı |
| 201 | Oluşturuldu (Signup) |
| 400 | Geçersiz İstek (Bad Request) |
| 401 | Yetkisiz Erişim (Unauthorized) |
| 403 | Erişim Reddedildi (Forbidden) |
| 500 | Sunucu Hatası (Internal Server Error) |

---

## 🔒 Güvenlik

### Token Güvenliği

- ✅ Access token ve refresh token 1 yıl geçerlidir
- ✅ Token'lar JWT ile imzalanır
- ✅ Refresh token Redis'te saklanır
- ✅ Token'lar httpOnly cookie'lerde saklanabilir (XSS koruması)
- ✅ Cookie'ler `sameSite: strict` ile CSRF koruması sağlar
- ✅ Production'da cookie'ler `secure: true` ile HTTPS üzerinden gönderilir

### Şifre Güvenliği

- ✅ Şifreler bcrypt ile hash'lenir (salt: 10)
- ✅ Minimum şifre uzunluğu: 6 karakter
- ✅ Şifreler asla response'da dönmez

### Authentication Middleware

- ✅ `protectRoute`: Token doğrulaması yapar
- ✅ `adminRoute`: Sadece admin kullanıcılar için
- ✅ Token hem cookie hem de Authorization header'dan alınabilir

### Güvenlik Özellikleri

- ✅ XSS koruması (httpOnly cookies)
- ✅ CSRF koruması (sameSite: strict)
- ✅ Password hashing (bcrypt)
- ✅ Token expiration
- ✅ Redis token storage

---

## 📱 Mobil Uygulama Entegrasyonu

### Token Yönetimi

Mobil uygulamalarda token'ları şu şekilde kullanın:

```javascript
// Login/Signup sonrası token'ları kaydedin
const { accessToken, refreshToken } = await login(email, password);
await AsyncStorage.setItem('accessToken', accessToken);
await AsyncStorage.setItem('refreshToken', refreshToken);

// API isteklerinde token kullanın
const token = await AsyncStorage.getItem('accessToken');
fetch('https://devrekbenimmarketim.com/api/auth/profile', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Token süresi dolduğunda yenileyin
const refreshToken = await AsyncStorage.getItem('refreshToken');
const { accessToken } = await refreshAccessToken(refreshToken);
await AsyncStorage.setItem('accessToken', accessToken);
```

### Örnek Flutter/Dart Kullanımı

```dart
// Login
final response = await http.post(
  Uri.parse('https://devrekbenimmarketim.com/api/auth/login'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'email': email,
    'password': password,
    'deviceType': 'mobile',
  }),
);

final data = jsonDecode(response.body);
final accessToken = data['accessToken'];
final refreshToken = data['refreshToken'];

// Token'ları kaydet
await storage.write(key: 'accessToken', value: accessToken);
await storage.write(key: 'refreshToken', value: refreshToken);

// API isteklerinde kullan
final token = await storage.read(key: 'accessToken');
final profileResponse = await http.get(
  Uri.parse('https://devrekbenimmarketim.com/api/auth/profile'),
  headers: {'Authorization': 'Bearer $token'},
);
```

---

## 🔗 İlgili Endpoint'ler

- **n8n Webhook**: Kayıt sonrası `user.registered` event'i gönderilir
- **User Routes**: `/api/users` - Kullanıcı yönetimi (admin)
- **Cart Routes**: `/api/cart` - Sepet işlemleri
- **Order Routes**: `/api/orders` - Sipariş işlemleri

---

## 📝 Notlar

- Token'lar 1 yıl geçerlidir (kullanıcı logout yapana kadar)
- Device type otomatik olarak güncellenir (login/signup sırasında)
- Kayıt sonrası otomatik olarak giriş yapılır
- n8n webhook'u asenkron çalışır (hata olsa bile ana işlemi engellemez)
- `lastActive` alanı profil isteğinde otomatik güncellenir

---

## 🆘 Sorun Giderme

### Token Süresi Doldu Hatası

```javascript
// Refresh token ile yeni access token alın
const refreshToken = await getRefreshToken();
const response = await fetch('https://devrekbenimmarketim.com/api/auth/refresh-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken })
});
const { accessToken } = await response.json();
```

### Kullanıcı Zaten Mevcut Hatası

Kullanıcı zaten kayıtlıysa login endpoint'ini kullanın.

### Geçersiz E-posta veya Şifre

- E-posta adresinin doğru olduğundan emin olun
- Şifrenin doğru olduğundan emin olun
- Büyük/küçük harf duyarlılığına dikkat edin

---

## 📞 Destek

Sorun yaşarsanız:
1. API test endpoint'ini kontrol edin: `GET /api/auth/test`
2. Auth test endpoint'ini kontrol edin: `GET /api/auth/test-auth`
3. Token'ların geçerli olduğundan emin olun
4. Network bağlantınızı kontrol edin

---

**Son Güncelleme:** 2024-01-15

