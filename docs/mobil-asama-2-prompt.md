# Mobil Aşama 2 — Claude Code için prompt

Aşağıdaki metnin tamamını `benimmarketim-app` (Flutter) deposunda açılan yeni bir Claude Code oturumuna yapıştır.

---

Sen Benim Marketim'in Flutter mobil uygulamasında (`benimmarketim-app`) çalışıyorsun. Mağaza Devrek'te (Zonguldak). Bugüne kadar yalnızca iki KYK yurduna (`girlsDorm` / `boysDorm`) teslimat yapıyordu. Şimdi Devrek'in mahalle ve köylerine adrese teslimat açıyoruz. Backend ve yönetici paneli hazır ve canlıda (`benimmarketim` deposu, `docs/devrek-teslimat-plani.md` Aşama 1). Senin işin **Aşama 2: mobil uygulama**.

## Kesin kurallar
- Backend'e dokunma. Aşağıdaki API sözleşmesi canlıda çalışıyor; birebir ona göre yaz.
- Uygulamada **zorunlu güncelleme** var: yeni sürüm yayınlanınca herkes güncelleyecek. Eski sürüm uyumluluğu düşünmene gerek yok. Yine de yeni sürüm, backend'deki **adrese teslimat anahtarı kapalıyken** bugünkü yurt akışıyla sorunsuz çalışmalı. Mağaza incelemesi sırasında anahtar kapalı olacak.
- Eksik ya da yarım iş bırakma. Her ekran için yükleniyor / hata / boş durumlarını ele al. Türkçe metin kullan, müşteriye "sen" diye hitap et.
- Yeni paket eklemen gerekirse (harita, konum) önce bana sor. Önerim: konum için `geolocator`, harita için mevcut bir paket varsa onu kullan. Yoksa pin özelliğini atla; konum isteğe bağlı.
- İşi bitirince `flutter analyze` hatasız olmalı. Değişikliklerin için birim ya da widget testi yaz.

## Backend API (canlı, base URL uygulamadaki mevcut API adresi)
Bütün hata yanıtları şu biçimdedir: `{ error, message, code? }`. Kullanıcıya `message` göster.

### 1. Adrese teslimat açık mı?
`GET /api/delivery/me` (giriş gerekli) → `{ addressOrdering: "off"|"pilot"|"public", canOrderToAddress: bool }`
- `canOrderToAddress == false` ise uygulama **bugünkü yurt akışını** gösterir: ödeme ekranında yurt seçimi. Bu durumda adres ekranlarını gizle.
- `true` ise yeni adres akışı açılır.
- Uygulama açılışta, oturum açınca ve uygulama ön plana gelince bu uç noktayı çağırır. Değer değişirse ekranları yenile (`notifyListeners`).
- İstek hata verirse (ağ, 404, 5xx) güvenli tarafta kal: `canOrderToAddress = false` say ve yurt akışını göster.

### 2. Teslimat bölgeleri
`GET /api/delivery/zones` (giriş gerekmez) →
```json
{ "zones": [{ "id": "mah-cumhuriyet", "name": "Cumhuriyet Mahallesi", "type": "mahalle",
              "deliveryFee": 40, "isFree": false, "freeDeliveryThreshold": 500,
              "minimumOrderAmount": 250, "etaText": "30-60 dk",
              "requiresFirstOrderCallback": false }],
  "freeDeliveryEverywhere": false }
```
- Liste yalnızca açık bölgeleri ve sıralı olarak döner.
- `type`: `yurt` | `mahalle` | `koy`. Yurtlar da bu listededir (id: `girlsDorm`, `boysDorm`).
- `minimumOrderAmount` her zaman uygulanacak değerdir (bölgenin kendi değeri, yoksa genel minimum).
- `freeDeliveryEverywhere` true ise kampanya vardır: her bölgede `isFree: true` gelir. `deliveryFee` bölgenin normal ücretini göstermeye devam eder (üstü çizili göstermek için).
- `requiresFirstOrderCallback`: bu bölgede ilk siparişten önce mağaza müşteriyi arayıp teyit eder.

### 3. Kayıtlı adresler (giriş gerekli, kişi başı en fazla 5)
- `GET /api/addresses` → `{ addresses: [Address], max: 5 }`
- `POST /api/addresses` gövde: `{ label, zoneId, street, buildingNo, buildingName, floor, apartment, directions, location: { lat, lng } | null, isDefault? }` → 201 `{ address, addresses }`
- `PUT /api/addresses/:id` (yalnızca değişen alanlar) → `{ address, addresses }`
- `DELETE /api/addresses/:id` → `{ success, deletedId, addresses }`
- `PATCH /api/addresses/:id/default` → `{ address, addresses }`
- Address: `{ _id, label, zoneId, zoneName, zoneType, zoneEnabled, street, buildingNo, buildingName, floor, apartment, directions, location, isDefault, createdAt, updatedAt }`
- Uzunluk sınırları: label ≤30, street ≤120, buildingNo ≤20, buildingName ≤60, floor ≤10, apartment ≤10, directions ≤300.
- İlk eklenen adres varsayılan olur. 6. adres 400 `ADDRESS_LIMIT` döner. Adres yalnızca açık bir bölgeye eklenebilir.
- `zoneEnabled == false` olan kayıtlı adres (bölge sonradan kapatılmış) listede görünür ama ödemede seçilemez. "Bu bölgeye şu an teslimat yok" yazar.

### 4. Ücret ve minimum (sepet ve ödeme ekranında)
`POST /api/delivery/quote` (giriş gerekli) gövde `{ zoneId, products: [{ product: "<id>", quantity }] }` →
```json
{ "zoneId": "...", "zoneName": "...", "subtotal": 140, "deliveryFee": 40, "isFree": false,
  "freeReason": null, "remainingForFree": 360, "minimumOrderAmount": 250,
  "meetsMinimum": false, "total": 180 }
```
- `freeReason`: `"campaign"` | `"zone"` | `"threshold"` | `null`.
- `total` kupon öncesidir. Kupon indirimi ayrıca düşülür; kupon teslimat ücretine uygulanmaz.
- Hatalar: bilinmeyen bölge 404 `ZONE_NOT_FOUND`; kapalı bölge 400 `ZONE_CLOSED` (`message` kapanma nedenini içerir).
- Sepet ya da seçili adres değiştikçe çağır (300-500 ms gecikmeyle, aynı anda tek istek). Sunucu dakikada 60 istekle sınırlar.

### 5. Sipariş verme
`POST /api/cart/place-order`
- **Yurt akışı** (`canOrderToAddress == false`, ya da kullanıcı yurt seçtiyse): bugünkü gövde aynen kullanılır (`deliveryPoint: "girlsDorm"|"boysDorm"`, `deliveryPointName`, `city`, `phone`, `products`, `note`, `couponCode`, `paymentMethod`, `device`). Yurt yeni akışta bölge olarak seçildiyse `zoneId: "girlsDorm"` da gönderilebilir; sonuç aynıdır.
- **Adres akışı:** gövde `{ paymentMethod, products: [{ product, quantity }], phone, note, couponCode, device, addressId: "<kayıtlı adres id>" }`. Kayıtlı adres olmadan gönderilecekse `addressId` yerine `zoneId` + `deliveryAddress: { street, buildingNo, buildingName, floor, apartment, directions, location }` kullanılır.
- Teslimat ücretini ve toplamı **sunucu hesaplar**; istemcinin gönderdiği tutarlar yok sayılır. Ekranda quote sonucunu göster, sipariş yanıtındaki tutarlar esastır.
- Hata kodları:
  - `ADDRESS_ORDERING_DISABLED`: anahtar kapandı → `/me`'yi yenile, yurt akışına dön.
  - `ZONE_NOT_FOUND`, `ZONE_CLOSED`
  - `BELOW_MINIMUM` (`minimumOrderAmount` alanıyla)
  - Sipariş saati dışı
  - 429: çok sık istek, `message` göster.

### 6. Sipariş listesi ve detayı
`GET /api/orders-analytics/user-orders` yanıtında her sipariş için şu alanlar gelir:
- `deliveryType`: `"point"` | `"address"`
- `deliveryZone`: `{ id, name, type }`
- `deliveryAddress`: adresli siparişte adres nesnesi, diğerlerinde null
- `deliveryFee`: TL, 0 = ücretsiz
- `productTotal`: ürün tutarı − kupon, teslimat hariç
- `totalAmount`: ödenecek toplam = productTotal + deliveryFee
- `deliveryPointName`: kısa özet, ör. "Cumhuriyet Mah. · Atatürk Cd. No:5"
- `needsCallback`: bool; true ise mağaza siparişi teyit etmek için arayacak
- `callbackConfirmedAt`: teyit edildiyse tarih, yoksa null
- `deliveryOutcomeLabel`: teslim edilemediyse neden (ör. "Teslim edilemedi: Adres bulunamadı"), yoksa ""
- `cancelReasonLabel`, `cancelReasonNote`: müşteri iptal ettiyse

### 7. İptal nedenleri
Müşteri iptalinde gönderilen `reason` kodları:
`gec`, `fikir`, `yanlis_siparis`, `fiyat`, `baska_yer`, `bolge_disi` ("Adresime teslimat yok"), `ucret_yuksek` ("Teslimat ücreti yüksek"), `diger`.
Son ikisi yeni; iptal ekranındaki listeye ekle (`orders_page.dart` içindeki sabit liste).

### 8. Kuponlar
Kupon cüzdanı ve öneri isteklerine `zoneAware=1` ekle (`GET /coupons?zoneAware=1`, recommend ve validate gövdesine `zoneAware: true`). Adres seçiliyse `deliveryZone: "<zoneId>"` gönder. Bölgeye özel kuponlar ancak bu durumda görünür. `couponPublicData`'daki `deliveryZones` dizisi doluysa kuponda "Belirli bölgelerde geçerli" yazsın.

## Yapılacaklar

### A. Adreslerim
- Profil'e "Adreslerim" girişi ekle. Yalnızca `canOrderToAddress == true` iken görünsün.
- Liste: etiket ("Ev", "İş"), bölge adı, sokak/bina özeti, varsayılan rozeti, düzenle, sil (onaylı), varsayılan yap. Kapalı bölgedeki adres soluk görünsün ve uyarı taşısın.
- Adres formu:
  1. Bölge seçimi: arama kutulu liste; mahalleler ve köyler ayrı gruplarda; her satırda "Ücretsiz teslimat" ya da "Teslimat 40 TL" ve süre.
  2. Alanlar: sokak/cadde, bina no, bina/site adı, kat, daire, adres tarifi.
  3. Zorunluluk: mahallede sokak ve bina no zorunlu; köyde sokak isteğe bağlı ama adres tarifi zorunlu (en az 10 karakter); yurtta yalnızca blok/oda tarifi istenir, isteğe bağlı.
  4. Etiket, "Varsayılan yap".
  5. İsteğe bağlı "Konumumu kullan": yalnızca butona basınca, tek seferlik, uygulama açıkken. İzin reddedilirse sorun yok, konumsuz devam edilir.
- Sınır: 5 adres. Doluysa "Adres ekle" pasif ve açıklamalı olsun.

### B. Sepet ve ödeme
- Ödeme ekranındaki yurt seçimini `canOrderToAddress == true` iken **teslimat adresi seçimine** çevir:
  - varsayılan adres seçili gelir;
  - "Adres değiştir" kayıtlı adreslerden seçtirir ya da yeni adres ekletir;
  - yurtlar da listede seçilebilir ("Kız KYK Yurdu — girişte teslim").
- Teslimat ücreti satırı (quote sonucundan):
  - `isFree` ve `freeReason == "campaign"` → **"Ücretsiz teslimat"** + kampanya etiketi; normal ücret üstü çizili.
  - `isFree` (zone/threshold) → **"Ücretsiz teslimat"**.
  - Ücretli → **"Teslimat ücreti: 40 TL"**. `remainingForFree` varsa altında "**X TL daha ekle, teslimat ücretsiz**".
- Toplam satırı: ürünler − kupon + teslimat = **Ödenecek tutar**.
- Minimum: `meetsMinimum == false` ise siparişi engelle ve "Bu bölge için en az X TL'lik sipariş gerekiyor (Y TL daha ekle)" yaz.
- Kapalı bölge ya da `ZONE_CLOSED`: siparişi engelle, nedeni göster, başka adres seçtir.
- `requiresFirstOrderCallback == true` olan bölgede, kullanıcının ilk siparişiyse bilgi notu göster: "İlk siparişin için seni arayıp teyit edeceğiz."
- Tahmini süre (`etaText`) ödeme ekranında ve sipariş onayında görünsün.
- Not alanının altında küçük bilgi: "Adresini not yerine adres alanına yaz."
- Sepet ekranında da teslimat ücreti ve "X TL daha ekle, teslimat ücretsiz" ipucu görünsün. Adres yoksa bölge listesinin en düşük ücretiyle "Teslimat ücreti bölgeye göre değişir" yaz.
- `canOrderToAddress == false` iken ödeme ekranı **bugünküyle birebir aynı** kalır: yurt seçimi, ücret satırı yok.

### C. Sipariş onayı, listesi, detayı
- Teslimat adresi (adresli siparişte tam adres; yurtta yurt adı), teslimat ücreti ("Ücretsiz teslimat" ya da tutar), ürün tutarı ve ödenecek toplam.
- `needsCallback && callbackConfirmedAt == null` → "Siparişini teyit etmek için seni arayacağız".
- `deliveryOutcomeLabel` doluysa iptal edilmiş siparişte bu metni göster.
- Ana sayfadaki aktif sipariş kartı ve geri bildirim özetinde `deliveryPointName` kullanılmaya devam eder (kısa adres özeti gelir).

### D. Metinler
"Yurda kadar", "yurduna", "KYK", "öğrenci" geçen müşteri metinlerini "kapına kadar" / "teslimat bölgelerimiz" diye güncelle. Bilinen yerler: `product_detail_page.dart` (paylaşım metni "yurda kadar getiriyorlar"), `profile_page.dart` (Mağaza bilgileri › Teslimat noktaları: artık `GET /api/delivery/zones`'tan bölge listesi ve ücretleri), `market_home_header.dart`, `market_mascot.dart`, `auth_ui.dart`, `home_quick_carts.dart`, `feedback_parts.dart`. Tam liste için şunu çalıştır: `grep -rniE "yurd|yurt|kyk|öğrenci" lib`.
- "Tüm Devrek'e geliyoruz" deme; bölge listesine yönlendir.

### E. Ayarlar ve yenileme
- `settings_viewmodel.dart` ayarları sessizce yeniliyor ve `notifyListeners` çağırmıyor. Ayar ya da `/me` değişince dinleyicileri bilgilendir.
- Ayar sorgu aralığını 5 sn'den 60 sn'ye çıkar; ayrıca uygulama ön plana gelince yenile.

### F. Mağaza ve gizlilik
- Konum izni metinleri: Android'de izin, iOS'ta `NSLocationWhenInUseUsageDescription` = "Teslimat adresini haritada doğru işaretlemek için konumun yalnızca sen istediğinde kullanılır."
- Arka planda konum yok.
- Google Play Data safety ve App Store App Privacy formlarına "Konum (yaklaşık/kesin, isteğe bağlı, teslimat için)" ve "Adres" eklenmesi gerektiğini bitiş raporunda bana hatırlat.

### G. Sürüm
- `pubspec.yaml` sürümünü bir sonraki minöre çıkar (ör. 6.0.0+47 → 6.1.0+48).
- Bitiş raporunda yayın sırası: 1) yeni sürümü iki mağazaya gönder; 2) onaylanınca panelden zorunlu güncellemeyi yeni sürüme ayarla; 3) Teslimat bölgeleri ekranında anahtarı önce **Pilot** yap (kendini ve test hesabını ekle); 4) sorun yoksa **Herkese açık** yap. Mağaza inceleme notuna: "Adrese teslimat sunucu tarafında aşamalı açılmaktadır; inceleme hesabı pilot listesine eklendi" yazılmalı. İnceleme hesabını panelde pilot listesine eklemem gerektiğini hatırlat.

## Bitiş kontrol listesi
- [ ] `canOrderToAddress == false`: ödeme ekranı bugünküyle aynı, yurt siparişi çalışıyor.
- [ ] `canOrderToAddress == true`:
  - [ ] adres ekle / düzenle / sil / varsayılan yap;
  - [ ] ücretsiz bölgede "Ücretsiz teslimat";
  - [ ] ücretli bölgede ücret ve doğru toplam;
  - [ ] eşik ipucu, eşik aşılınca ücretsiz;
  - [ ] minimum altı engel;
  - [ ] kapalı bölge engeli;
  - [ ] kampanya gösterimi;
  - [ ] ilk sipariş teyit notu;
  - [ ] sipariş verildi.
- [ ] Sipariş listesi ve detayında adres, ücret, teyit ve teslim edilemedi bilgisi.
- [ ] Yeni iptal nedenleri.
- [ ] Bölgeye özel kupon görünürlüğü.
- [ ] Metinlerde yurt/KYK kalmadı (yurtların kendi adları hariç).
- [ ] `flutter analyze` temiz, testler yeşil.
