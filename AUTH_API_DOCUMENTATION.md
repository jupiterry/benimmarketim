# 🔐 Authentication API Dokümantasyonu

Bu dokümantasyon, login, register ve authentication ile ilgili tüm API endpoint'lerini, istek formatlarını ve süreçleri açıklar.

---

## 📋 İçindekiler

1. [API Endpoint'leri](#api-endpointleri)
2. [Authentication Flow](#authentication-flow)
3. [Token Yönetimi](#token-yönetimi)
4. [Request/Response Örnekleri](#requestresponse-örnekleri)
5. [Güvenlik](#güvenlik)
6. [Hata Kodları](#hata-kodları)

---

## 🔌 API Endpoint'leri

### Base URL
```
http://localhost:5000/api/auth
# veya production
https://devrekbenimmarketim.com/api/auth
```

---

## 1. 📝 Kayıt Ol (Signup)

**Endpoint:** `POST /api/auth/signup`

**Açıklama:** Yeni kullanıcı kaydı oluşturur ve otomatik olarak login yapar.

**Request Body:**
```json
{
  "email": "kullanici@example.com",
  "password": "güvenliŞifre123",
  "name": "Ahmet Yılmaz",
  "phone": "5551234567",
  "deviceType": "web" // veya "mobile", "ios", "android"
}
```

**Response (201 Created):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Ahmet Yılmaz",
  "email": "kullanici@example.com",
  "role": "user",
  "phone": "5551234567",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Hata Response (400 Bad Request):**
```json
{
  "message": "Kullanıcı zaten mevcut"
}
```

**Özellikler:**
- ✅ Email kontrolü (zaten kayıtlı mı?)
- ✅ Otomatik login (kayıt sonrası token döner)
- ✅ Cookie'ye token yazılır (web için)
- ✅ Response'da token döner (mobil için)
- ✅ n8n webhook gönderilir (kullanıcı kaydı bildirimi)

**cURL Örneği:**
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "name": "Test User",
    "phone": "5551234567",
    "deviceType": "web"
  }'
```

---

## 2. 🔑 Giriş Yap (Login)

**Endpoint:** `POST /api/auth/login`

**Açıklama:** Mevcut kullanıcı ile giriş yapar ve token döner.

**Request Body:**
```json
{
  "email": "kullanici@example.com",
  "password": "güvenliŞifre123",
  "deviceType": "web" // opsiyonel
}
```

**Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Ahmet Yılmaz",
  "email": "kullanici@example.com",
  "role": "user",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Hata Response (400 Bad Request):**
```json
{
  "message": "Geçersiz E-posta veya Şifre"
}
```

**Özellikler:**
- ✅ Email ve şifre kontrolü
- ✅ Device type güncelleme (opsiyonel)
- ✅ Cookie'ye token yazılır (web için)
- ✅ Response'da token döner (mobil için)
- ✅ Refresh token Redis'e kaydedilir

**cURL Örneği:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "deviceType": "web"
  }'
```

**Mobil Uygulama İçin:**
```dart
// Flutter örneği
final response = await http.post(
  Uri.parse('https://api.example.com/api/auth/login'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'email': 'test@example.com',
    'password': 'test123',
    'deviceType': 'android', // veya 'ios'
  }),
);

final data = jsonDecode(response.body);
final accessToken = data['accessToken'];
final refreshToken = data['refreshToken'];

// Token'ları secure storage'a kaydet
await secureStorage.write(key: 'accessToken', value: accessToken);
await secureStorage.write(key: 'refreshToken', value: refreshToken);
```

---

## 3. 🚪 Çıkış Yap (Logout)

**Endpoint:** `POST /api/auth/logout`

**Açıklama:** Kullanıcıyı sistemden çıkarır, token'ları geçersiz kılar.

**Request:**
- Cookie'den `refreshToken` alınır (web için)
- Veya body'den `refreshToken` gönderilebilir (mobil için)

**Response (200 OK):**
```json
{
  "message": "Başarıyla çıkış yapıldı."
}
```

**Özellikler:**
- ✅ Refresh token Redis'ten silinir
- ✅ Cookie'ler temizlenir (web için)
- ✅ Token'lar geçersiz kılınır

**cURL Örneği (Cookie ile):**
```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Cookie: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**cURL Örneği (Body ile - Mobil için):**
```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

## 4. 🔄 Token Yenileme (Refresh Token)

**Endpoint:** `POST /api/auth/refresh-token`

**Açıklama:** Access token süresi dolduğunda yeni access token almak için kullanılır.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Hata Response (401 Unauthorized):**
```json
{
  "message": "Invalid refresh token"
}
```

**Özellikler:**
- ✅ Refresh token doğrulanır (Redis'te var mı?)
- ✅ Yeni access token oluşturulur
- ✅ Cookie güncellenir (web için)
- ✅ Response'da yeni token döner (mobil için)

**cURL Örneği:**
```bash
curl -X POST http://localhost:5000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Mobil Uygulama İçin (Otomatik Token Yenileme):**
```dart
// Flutter örneği - Interceptor ile
class AuthInterceptor extends Interceptor {
  @override
  void onError(DioError err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // Token expired, refresh et
      final refreshToken = await secureStorage.read(key: 'refreshToken');
      
      final response = await dio.post(
        '/api/auth/refresh-token',
        data: {'refreshToken': refreshToken},
      );
      
      final newAccessToken = response.data['accessToken'];
      await secureStorage.write(key: 'accessToken', value: newAccessToken);
      
      // Orijinal isteği tekrar dene
      err.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
      final retryResponse = await dio.request(err.requestOptions);
      return handler.resolve(retryResponse);
    }
    return handler.next(err);
  }
}
```

---

## 5. 👤 Profil Bilgileri (Get Profile)

**Endpoint:** `GET /api/auth/profile`

**Açıklama:** Giriş yapmış kullanıcının profil bilgilerini döner.

**Authentication:** ✅ Gerekli (Access Token)

**Request Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# veya
Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Ahmet Yılmaz",
  "email": "kullanici@example.com",
  "phone": "5551234567",
  "role": "user",
  "deviceType": "web",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Hata Response (401 Unauthorized):**
```json
{
  "success": false,
  "message": "No access token provided"
}
```

**cURL Örneği:**
```bash
curl -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 6. 🗑️ Hesap Silme (Delete Account)

**Endpoint:** `DELETE /api/auth/delete-account`

**Açıklama:** Kullanıcının kendi hesabını silmesini sağlar.

**Authentication:** ✅ Gerekli (Access Token)

**Request Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "message": "Hesabınız başarıyla silindi",
  "deletedAt": "2024-01-15T10:30:00.000Z"
}
```

**Özellikler:**
- ✅ Kullanıcının tüm siparişleri silinir
- ✅ Kullanıcının tüm geri bildirimleri silinir
- ✅ Redis'teki refresh token silinir
- ✅ Cookie'ler temizlenir

**cURL Örneği:**
```bash
curl -X DELETE http://localhost:5000/api/auth/delete-account \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 7. 🧪 Test Endpoint'leri

### Test API
**Endpoint:** `GET /api/auth/test`

**Response:**
```json
{
  "message": "API çalışıyor",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Test Auth
**Endpoint:** `GET /api/auth/test-auth`

**Authentication:** ✅ Gerekli

**Response:**
```json
{
  "message": "Auth çalışıyor",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Ahmet Yılmaz",
    "email": "kullanici@example.com"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🔄 Authentication Flow

### 1. Kayıt Ol → Login Flow

```
1. Kullanıcı kayıt formunu doldurur
   POST /api/auth/signup
   
2. Backend:
   - Email kontrolü (zaten kayıtlı mı?)
   - Şifre hash'lenir (bcrypt)
   - Kullanıcı oluşturulur
   - Access Token + Refresh Token oluşturulur
   - Refresh Token Redis'e kaydedilir
   - Cookie'lere token'lar yazılır
   - n8n webhook gönderilir
   
3. Response:
   - Kullanıcı bilgileri
   - Access Token
   - Refresh Token
   
4. Frontend/Mobil:
   - Token'ları saklar (localStorage/secure storage)
   - Sonraki isteklerde Authorization header'ına ekler
```

### 2. Login Flow

```
1. Kullanıcı email/şifre girer
   POST /api/auth/login
   
2. Backend:
   - Email ile kullanıcı bulunur
   - Şifre kontrol edilir (bcrypt compare)
   - Device type güncellenir (opsiyonel)
   - Access Token + Refresh Token oluşturulur
   - Refresh Token Redis'e kaydedilir
   - Cookie'lere token'lar yazılır
   
3. Response:
   - Kullanıcı bilgileri
   - Access Token
   - Refresh Token
```

### 3. Protected Route Access Flow

```
1. Kullanıcı protected endpoint'e istek atar
   GET /api/auth/profile
   Headers: Authorization: Bearer <accessToken>
   
2. protectRoute Middleware:
   - Token cookie'den veya header'dan alınır
   - Token doğrulanır (JWT verify)
   - Token'dan userId çıkarılır
   - Kullanıcı veritabanından bulunur
   - req.user'a kullanıcı bilgisi eklenir
   
3. Controller:
   - req.user kullanılır
   - İşlem yapılır
   - Response döner
```

### 4. Token Refresh Flow

```
1. Access token süresi doldu (401 hatası)
   
2. Frontend/Mobil:
   - Refresh token ile yeni access token ister
   POST /api/auth/refresh-token
   Body: { refreshToken: "..." }
   
3. Backend:
   - Refresh token doğrulanır
   - Redis'te var mı kontrol edilir
   - Yeni access token oluşturulur
   - Cookie güncellenir
   
4. Response:
   - Yeni access token
   
5. Frontend/Mobil:
   - Yeni token ile orijinal isteği tekrar dener
```

---

## 🔐 Token Yönetimi

### Token Türleri

#### 1. Access Token
- **Süre:** 365 gün (1 yıl)
- **Kullanım:** Her istekte Authorization header'ında
- **Saklama:** 
  - Web: Cookie (httpOnly, secure, sameSite)
  - Mobil: Secure Storage
- **Format:** JWT (JSON Web Token)

#### 2. Refresh Token
- **Süre:** 365 gün (1 yıl)
- **Kullanım:** Access token yenilemek için
- **Saklama:**
  - Web: Cookie (httpOnly, secure, sameSite)
  - Mobil: Secure Storage
  - Backend: Redis (key: `refresh_token:${userId}`)
- **Format:** JWT (JSON Web Token)

### Token Oluşturma

```javascript
// Access Token
const accessToken = jwt.sign(
  { userId: user._id },
  process.env.ACCESS_TOKEN_SECRET,
  { expiresIn: "365d" }
);

// Refresh Token
const refreshToken = jwt.sign(
  { userId: user._id },
  process.env.REFRESH_TOKEN_SECRET,
  { expiresIn: "365d" }
);
```

### Token Doğrulama

```javascript
// Access Token Doğrulama
const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
const userId = decoded.userId;

// Refresh Token Doğrulama
const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
const userId = decoded.userId;
```

---

## 🛡️ Güvenlik

### 1. Cookie Güvenliği

```javascript
{
  httpOnly: true,        // XSS saldırılarına karşı koruma
  secure: true,          // HTTPS üzerinden gönderilir (production)
  sameSite: "strict"     // CSRF saldırılarına karşı koruma
}
```

### 2. Şifre Hash'leme

- **Algoritma:** bcrypt
- **Salt Rounds:** 10 (default)
- **Saklama:** Hash'lenmiş şifre veritabanında saklanır

```javascript
// Şifre hash'leme (User model'de)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Şifre kontrolü
userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};
```

### 3. Token Güvenliği

- ✅ JWT imzalama (HMAC SHA256)
- ✅ Refresh token Redis'te saklanır
- ✅ Logout'ta token'lar geçersiz kılınır
- ✅ Token expiration kontrolü

### 4. Middleware Koruması

```javascript
// protectRoute middleware
- Token kontrolü
- Token doğrulama
- Kullanıcı varlık kontrolü
- req.user'a kullanıcı ekleme

// adminRoute middleware
- Admin rol kontrolü
- Yetkisiz erişim engelleme
```

---

## 📊 Request/Response Örnekleri

### Web Uygulama (Cookie-based)

```javascript
// Login
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Cookie gönderimi için
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123'
  })
})
.then(res => res.json())
.then(data => {
  // Token'lar cookie'de otomatik saklanır
  console.log('Login successful:', data);
});

// Protected Request
fetch('/api/auth/profile', {
  method: 'GET',
  credentials: 'include', // Cookie gönderimi için
})
.then(res => res.json())
.then(data => {
  console.log('Profile:', data);
});
```

### Mobil Uygulama (Token-based)

```dart
// Flutter/Dart örneği
class AuthService {
  final Dio dio = Dio();
  
  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await dio.post(
      'https://api.example.com/api/auth/login',
      data: {
        'email': email,
        'password': password,
        'deviceType': 'android',
      },
    );
    
    final accessToken = response.data['accessToken'];
    final refreshToken = response.data['refreshToken'];
    
    // Secure storage'a kaydet
    await secureStorage.write(key: 'accessToken', value: accessToken);
    await secureStorage.write(key: 'refreshToken', value: refreshToken);
    
    return response.data;
  }
  
  Future<Map<String, dynamic>> getProfile() async {
    final accessToken = await secureStorage.read(key: 'accessToken');
    
    final response = await dio.get(
      'https://api.example.com/api/auth/profile',
      options: Options(
        headers: {
          'Authorization': 'Bearer $accessToken',
        },
      ),
    );
    
    return response.data;
  }
}
```

---

## ❌ Hata Kodları

| HTTP Status | Mesaj | Açıklama |
|------------|-------|----------|
| 200 | OK | İşlem başarılı |
| 201 | Created | Kayıt başarılı |
| 400 | Bad Request | Geçersiz email/şifre, kullanıcı zaten mevcut |
| 401 | Unauthorized | Token yok, geçersiz veya süresi dolmuş |
| 403 | Forbidden | Yetkisiz erişim (admin only) |
| 500 | Internal Server Error | Sunucu hatası |

---

## 🔧 Environment Variables

```env
# JWT Secrets
ACCESS_TOKEN_SECRET=your-access-token-secret-key
REFRESH_TOKEN_SECRET=your-refresh-token-secret-key

# Redis (Refresh token storage)
UPSTASH_REDIS_URL=your-redis-url

# Node Environment
NODE_ENV=production
```

---

## 📝 Özet

### Endpoint'ler:
1. ✅ `POST /api/auth/signup` - Kayıt ol
2. ✅ `POST /api/auth/login` - Giriş yap
3. ✅ `POST /api/auth/logout` - Çıkış yap
4. ✅ `POST /api/auth/refresh-token` - Token yenile
5. ✅ `GET /api/auth/profile` - Profil bilgileri
6. ✅ `DELETE /api/auth/delete-account` - Hesap sil
7. ✅ `GET /api/auth/test` - API test
8. ✅ `GET /api/auth/test-auth` - Auth test

### Özellikler:
- ✅ JWT tabanlı authentication
- ✅ Access Token + Refresh Token
- ✅ Cookie ve Header desteği
- ✅ Redis ile token yönetimi
- ✅ Güvenli şifre hash'leme (bcrypt)
- ✅ XSS ve CSRF koruması
- ✅ n8n webhook entegrasyonu
- ✅ Mobil uygulama desteği

---

## 🚀 Hızlı Başlangıç

### 1. Kayıt Ol
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User","phone":"5551234567"}'
```

### 2. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 3. Profil Bilgileri
```bash
curl -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

**Tüm authentication işlemleri hem web hem mobil uygulama için hazırdır!** 🎉

