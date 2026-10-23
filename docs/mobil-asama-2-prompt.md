# Mobil Aşama 2 — Claude Code için prompt

Aşağıdaki metnin tamamını `benimmarketim-app` (Flutter) deposunda açılan yeni bir Claude Code oturumuna yapıştır.

---

Sen Benim Marketim'in Flutter mobil uygulamasında (`benimmarketim-app`) çalışıyorsun. Mağaza Devrek'te (Zonguldak). Bugüne kadar yalnızca iki KYK yurduna teslimat yapıyordu. Şimdi **Devrek merkezine adrese teslimat** açıyoruz. Backend ve yönetici paneli hazır ve canlıda. Senin işin mobil uygulama.

## Teslimat modeli (sabit)
Tam olarak üç teslimat bölgesi var. Mağaza sahibi her birini panelden açıp kapatır ve fiyatlar:

| id | Ad | Tür | Müşteriden istenen |
|---|---|---|---|
| `girlsDorm` | Kız KYK Yurdu | `yurt` | Yalnızca seçim. Blok/oda tarifi isteğe bağlı. |
| `boysDorm` | Erkek KYK Yurdu | `yurt` | Yalnızca seçim. Blok/oda tarifi isteğe bağlı. |
| `devrek` | Devrek | `ilce` | Mahalle, sokak, bina no **ve haritada pin** zorunlu. Pin, Devrek merkez sınırının içinde olmalı. |

Her bölgenin ayarları: ücretsiz ya da ücretli (TL), isteğe bağlı "şu tutarın üstü ücretsiz" eşiği, minimum sepet, tahmini süre. Ücret 0 ise müşteriye **"Ücretsiz teslimat"** yazılır.

## Kesin kurallar
- Backend'e dokunma. Aşağıdaki API canlıda; birebir ona göre yaz.
- Uygulamada **zorunlu güncelleme** var, eski sürüm uyumluluğu gerekmez.
- Yeni sürüm, backend'deki **adrese teslimat anahtarı kapalıyken** bugünkü yurt akışıyla çalışmalı. Mağaza incelemesi sırasında anahtar kapalı ya da pilot modda olacak.
- Paketler: harita için `flutter_map` + `latlong2` (OpenStreetMap karoları; ekranda "© OpenStreetMap katkıcıları" atfı zorunlu), konum için `geolocator`. Bu üç paket mağaza sahibinin onayıyla eklenebilir; bunların dışında yeni paket eklemeden önce sor. Projede zaten bir harita paketi varsa onu kullan.
- Eksik ya da yarım iş bırakma. Her ekran için yükleniyor / hata / boş durumlarını ele al. Türkçe metin kullan, müşteriye "sen" diye hitap et.
- İşi bitirince `flutter analyze` hatasız olmalı. Birim ve widget testleri yaz.

## Backend API (base URL uygulamadaki mevcut API adresi)
Bütün hata yanıtları şu biçimdedir: `{ error, message, code? }`. Kullanıcıya `message` göster; dallanmayı `code`'a göre yap.

### 1. Adrese teslimat açık mı?
`GET /api/delivery/me` (giriş gerekli) → `{ addressOrdering: "off"|"pilot"|"public", canOrderToAddress: bool }`
- `false` ise uygulama **bugünkü yurt akışını** gösterir ve adres ekranlarını gizler.
- `true` ise yeni akış açılır.
- Ne zaman çağrılır: açılışta, oturum açınca, uygulama ön plana gelince. Değer değişirse `notifyListeners` çağır.
- Ağ hatası, 404 ya da 5xx gelirse `false` say.

### 2. Bölgeler
`GET /api/delivery/zones` (giriş gerekmez) →
```json
{ "zones": [
    { "id": "girlsDorm", "name": "Kız KYK Yurdu", "type": "yurt", "deliveryFee": 0, "isFree": true,
      "freeDeliveryThreshold": null, "minimumOrderAmount": 250, "etaText": "30-45 dk",
      "requiresFirstOrderCallback": false, "requiresLocation": false, "hasArea": false },
    { "id": "devrek", "name": "Devrek", "type": "ilce", "deliveryFee": 40, "isFree": false,
      "freeDeliveryThreshold": 500, "minimumOrderAmount": 300, "etaText": "45-60 dk",
      "requiresFirstOrderCallback": true, "requiresLocation": true, "hasArea": true } ],
  "freeDeliveryEverywhere": false }
```
- Yalnızca açık bölgeler döner.
- `minimumOrderAmount` uygulanacak değerdir (bölgeninki, yoksa genel minimum).
- `freeDeliveryEverywhere` true ise kampanya vardır: hepsinde `isFree: true` gelir, `deliveryFee` normal ücreti gösterir (üstü çizili göstermek için).
- `requiresFirstOrderCallback`: bu bölgede ilk siparişten önce mağaza arayıp teyit eder.

### 3. Devrek sınırı (harita için)
`GET /api/delivery/zones/devrek/area` (giriş gerekmez, 5 dk önbelleklenebilir) → `{ area: { type: "Polygon"|"MultiPolygon", coordinates: [...] } | null, updatedAt }`
- GeoJSON'dır; koordinatlar `[lng, lat]` sırasındadır.
- Haritada sınırı çiz ve pin seçiminde ön kontrol yap (point-in-polygon). Kesin kontrolü sunucu yapar.
- `area == null` ise sınır henüz yüklenmemiştir: pin yine zorunlu, ama istemci tarafı sınır kontrolü yapılmaz.

### 4. Kayıtlı adresler (giriş gerekli, en fazla 5)
- `GET /api/addresses` → `{ addresses: [Address], max: 5 }`
- `POST /api/addresses` gövde: `{ label, zoneId, neighborhood, street, buildingNo, buildingName, floor, apartment, directions, location: { lat, lng } | null, isDefault? }` → 201 `{ address, addresses }`
- `PUT /api/addresses/:id` (yalnızca değişen alanlar) → `{ address, addresses }`
- `DELETE /api/addresses/:id` → `{ success, deletedId, addresses }`
- `PATCH /api/addresses/:id/default` → `{ address, addresses }`
- Address: `{ _id, label, zoneId, zoneName, zoneType, zoneEnabled, neighborhood, street, buildingNo, buildingName, floor, apartment, directions, location, isDefault, createdAt, updatedAt }`
- Uzunluk sınırları: label ≤30, neighborhood ≤60, street ≤120, buildingNo ≤20, buildingName ≤60, floor ≤10, apartment ≤10, directions ≤300.
- `devrek` hata kodları: `NEIGHBORHOOD_REQUIRED`, `STREET_REQUIRED`, `BUILDING_NO_REQUIRED`, `LOCATION_REQUIRED`, `OUT_OF_AREA` (mesaj: "Bu adres teslimat alanımızın dışında. Haritada Devrek sınırı içinde bir nokta seç.").
- Diğer hatalar: `ADDRESS_LIMIT` (6. adres), `ZONE_CLOSED` (kapalı bölgeye adres eklenemez).
- İlk eklenen adres varsayılan olur.
- `zoneEnabled == false` olan adres listede soluk görünür, ödemede seçilemez, "Bu bölgeye şu an teslimat yok" yazar.

### 5. Ücret teklifi
`POST /api/delivery/quote` (giriş gerekli) gövde `{ zoneId, products: [{ product: "<id>", quantity }] }` →
```json
{ "zoneId": "devrek", "zoneName": "Devrek", "subtotal": 140, "deliveryFee": 40, "isFree": false,
  "freeReason": null, "remainingForFree": 360, "minimumOrderAmount": 300,
  "meetsMinimum": false, "total": 180 }
```
- `freeReason`: `"campaign"` | `"zone"` | `"threshold"` | `null`.
- `total` kupon öncesidir. Kupon yalnızca ürünlere uygulanır, teslimat ücretine uygulanmaz.
- Hatalar: `ZONE_NOT_FOUND` (404), `ZONE_CLOSED` (400, mesaj kapanma nedenini içerir).
- Sepet ya da seçili adres değişince çağır (300-500 ms gecikmeyle, aynı anda tek istek). Sunucu dakikada 60 istekle sınırlar.

### 6. Sipariş verme
`POST /api/cart/place-order`
- **Yurt akışı** (`canOrderToAddress == false`, ya da yurt seçildiyse): bugünkü gövde aynen kullanılır (`deliveryPoint: "girlsDorm"|"boysDorm"`, `deliveryPointName`, `city`, `phone`, `products`, `note`, `couponCode`, `paymentMethod`, `device`). Yeni akışta yurt seçildiyse `zoneId: "girlsDorm"` göndermek de aynı sonucu verir.
- **Devrek adres akışı:** `{ paymentMethod, products: [{ product, quantity }], phone, note, couponCode, device, addressId: "<kayıtlı adres id>" }`. Kayıtlı adres olmadan: `addressId` yerine `zoneId: "devrek"` + `deliveryAddress: { neighborhood, street, buildingNo, buildingName, floor, apartment, directions, location: { lat, lng } }`.
- Ücret ve toplamı **sunucu hesaplar**, istemcinin gönderdiği tutarlar yok sayılır. Ekranda quote sonucunu göster.
- Hata kodları:
  - `ADDRESS_ORDERING_DISABLED`: `/me`'yi yenile, yurt akışına dön.
  - `ZONE_NOT_FOUND`, `ZONE_CLOSED`
  - `BELOW_MINIMUM` (`minimumOrderAmount` alanıyla)
  - `OUT_OF_AREA`, `LOCATION_REQUIRED`, `NEIGHBORHOOD_REQUIRED`, `STREET_REQUIRED`, `BUILDING_NO_REQUIRED`
  - sipariş saati dışı
  - 429: çok sık istek.

### 7. Siparişler
`GET /api/orders-analytics/user-orders` yanıtında her sipariş için:
- `deliveryType`: `"point"` | `"address"`
- `deliveryZone`: `{ id, name, type }`
- `deliveryAddress`: adresli siparişte `{ zoneId, zoneName, neighborhood, street, buildingNo, buildingName, floor, apartment, directions, location }`, diğerlerinde null
- `deliveryFee`: 0 = ücretsiz
- `productTotal`: ürün tutarı − kupon
- `totalAmount`: productTotal + deliveryFee
- `deliveryPointName`: Devrek'te `"<Mahalle> Mah. · <Sokak> No:<bina>"`
- `needsCallback`, `callbackConfirmedAt`: teyit araması
- `deliveryOutcomeLabel`: ör. "Teslim edilemedi: Adres bulunamadı", yoksa ""
- `cancelReasonLabel`, `cancelReasonNote`

### 8. İptal nedenleri
Gönderilen `reason` kodları: `gec`, `fikir`, `yanlis_siparis`, `fiyat`, `baska_yer`, `bolge_disi` ("Adresime teslimat yok"), `ucret_yuksek` ("Teslimat ücreti yüksek"), `diger`. Son ikisi yeni; `orders_page.dart` içindeki sabit listeye ekle.

### 9. Kuponlar
- Kupon isteklerine `zoneAware` bilgisini ekle: `GET /coupons?zoneAware=1`; recommend ve validate gövdesine `zoneAware: true`.
- Adres seçiliyse `deliveryZone: "<zoneId>"` gönder.
- `couponPublicData.deliveryZones` doluysa kuponda "Belirli bölgelerde geçerli" yazsın.

## Yapılacaklar

### A. Adreslerim (yalnızca `canOrderToAddress == true` iken görünür)
- Profilde "Adreslerim" girişi.
- Liste:
  - etiket, bölge, adres özeti, varsayılan rozeti;
  - düzenle, sil (onaylı), varsayılan yap;
  - kapalı bölgedeki adres soluk görünür ve uyarı taşır;
  - 5 adres doluysa "Adres ekle" pasif ve açıklamalı.
- Adres ekleme akışı:
  1. Bölge seç: açık bölgeler listelenir, her satırda "Ücretsiz teslimat" ya da "Teslimat 40 TL" ve süre.
  2. **Yurt seçildiyse:** etiket + isteğe bağlı blok/oda tarifi. Pin ve konum yok.
  3. **Devrek seçildiyse:**
     - **Harita ekranı:** Devrek sınırı çizili gelir.
       - Kullanıcı "Konumumu kullan" der: `geolocator`, yalnızca butona basınca, tek seferlik, uygulama açıkken.
       - Ya da haritayı sürükleyip ortadaki pini konumlandırır.
       - Pin sınır dışındaysa "Bu nokta teslimat alanımızın dışında" uyarısı çıkar, devam butonu pasif olur.
       - Konum izni reddedilirse elle pin bırakmak yeterli.
     - **Form:** Mahalle (zorunlu), Sokak/Cadde (zorunlu), Bina no (zorunlu), Bina/site adı, Kat, Daire, Adres tarifi, Etiket, Varsayılan yap.
     - Sunucu `OUT_OF_AREA` dönerse kullanıcıyı harita adımına geri götür.

### B. Sepet ve ödeme
- `canOrderToAddress == true` iken ödeme ekranındaki yurt seçimi **teslimat adresi seçimine** dönüşür:
  - varsayılan adres seçili gelir;
  - "Adres değiştir" kayıtlı adresleri ve yeni adres eklemeyi açar.
  - Yurtlar da bu listede seçilebilir. Yurt için kayıtlı adres gerekmez, doğrudan "Kız KYK Yurdu — girişte teslim" seçeneği olur.
- Teslimat ücreti satırı (quote'tan):
  - kampanya varsa: **"Ücretsiz teslimat"** + kampanya etiketi, normal ücret üstü çizili;
  - `isFree` ise: **"Ücretsiz teslimat"**;
  - ücretli ise: **"Teslimat ücreti: 40 TL"**; `remainingForFree` varsa altında "**X TL daha ekle, teslimat ücretsiz**".
- Toplam satırı: ürünler − kupon + teslimat = **Ödenecek tutar**.
- Engeller:
  - Minimum altında siparişi engelle: "Bu bölge için en az X TL'lik sipariş gerekiyor (Y TL daha ekle)".
  - Kapalı bölgede (`ZONE_CLOSED`) siparişi engelle, nedeni göster, başka adres seçtir.
- Bilgiler:
  - `requiresFirstOrderCallback` olan bölgede ve kullanıcının ilk siparişiyse: "İlk siparişin için seni arayıp teyit edeceğiz."
  - `etaText` ödeme ekranında ve sipariş onayında görünsün.
  - Not alanının altında: "Adresini not yerine adres alanına yaz."
- Sepet ekranında da ücret satırı ve "X TL daha ekle, teslimat ücretsiz" ipucu olsun. Adres seçili değilse: "Teslimat ücreti bölgeye göre değişir".
- `canOrderToAddress == false` iken ödeme ekranı **bugünküyle birebir aynı** kalır.

### C. Sipariş onayı, listesi, detayı
- Teslimat yeri: yurt adı ya da tam adres (mahalle, sokak, bina, kat, daire, tarif).
- Teslimat ücreti ("Ücretsiz teslimat" ya da tutar), ürün tutarı, ödenecek toplam.
- `needsCallback && callbackConfirmedAt == null` → "Siparişini teyit etmek için seni arayacağız".
- İptal edilmiş siparişte `deliveryOutcomeLabel` doluysa bu metni göster.

### D. Metinler
- "Yurda kadar", "yurduna", "öğrenci" geçen müşteri metinlerini "kapına kadar" / "teslimat bölgelerimiz" yap. Yurtların kendi adları (Kız/Erkek KYK Yurdu) kalır.
- Bilinen yerler:
  - `product_detail_page.dart`: paylaşım metni.
  - `profile_page.dart`: Mağaza bilgileri › Teslimat noktaları; artık `GET /api/delivery/zones`'tan bölgeler ve ücretleri gelir.
  - `market_home_header.dart`, `market_mascot.dart`, `auth_ui.dart`, `home_quick_carts.dart`, `feedback_parts.dart`.
- Tam liste: `grep -rniE "yurd|yurt|kyk|öğrenci" lib`.

### E. Ayarlar ve yenileme
- `settings_viewmodel.dart` sessiz yenilemede `notifyListeners` çağırmıyor; düzelt.
- Sorgu aralığını 5 sn'den 60 sn'ye çıkar ve uygulama ön plana gelince de yenile.

### F. İzin ve gizlilik
- Konum izin metinleri:
  - iOS `NSLocationWhenInUseUsageDescription`: "Teslimat adresini haritada doğru işaretlemek için konumun yalnızca sen istediğinde kullanılır."
  - Android: yalnızca `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`, arka plan izni yok.
- OpenStreetMap atfını haritada göster.
- Bitiş raporunda bana hatırlat: Google Play Data safety ve App Store App Privacy formlarına "Konum (isteğe bağlı değil, Devrek adresi için pin; yalnızca kullanıcı istediğinde)" ve "Adres" eklenmeli.

### G. Sürüm ve yayın
- `pubspec.yaml` sürümünü bir sonraki minöre çıkar (ör. 6.0.0+47 → 6.1.0+48).
- Bitiş raporunda yayın sırasını yaz:
  1. İki mağazaya gönder. İnceleme notu: "Adrese teslimat sunucu tarafında aşamalı açılmaktadır; inceleme hesabı pilot listesine eklendi."
  2. Panelde inceleme hesabını pilot listesine ekle.
  3. Onaylanınca zorunlu güncellemeyi yeni sürüme ayarla.
  4. Panelde: Devrek sınırını yükle ve "Haritada kontrol et" ile doğrula, Genel Devrek bölgesini aç, anahtarı **Pilot** yap.
  5. Sorun yoksa **Herkese açık** yap.

## Bitiş kontrol listesi
- [ ] Anahtar kapalı: ödeme ekranı bugünküyle aynı, yurt siparişi çalışıyor.
- [ ] Anahtar açık:
  - [ ] yurt seçip sipariş;
  - [ ] Devrek adresi ekle (harita + sınır kontrolü + form), düzenle, sil, varsayılan yap;
  - [ ] sınır dışı pin engelleniyor;
  - [ ] ücretsiz / ücretli / eşik / kampanya gösterimi doğru;
  - [ ] minimum altı ve kapalı bölge engelleri;
  - [ ] ilk sipariş teyit notu;
  - [ ] sipariş verildi.
- [ ] Sipariş listesi ve detayında adres, ücret, teyit ve teslim edilemedi bilgisi.
- [ ] Yeni iptal nedenleri; bölgeye özel kupon görünürlüğü.
- [ ] Metinlerde "yurda kadar"/"öğrenci" kalmadı.
- [ ] `flutter analyze` temiz, testler yeşil.
