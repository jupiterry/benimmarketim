# Devrek geneline teslimat planı

**Hedef:** Sadece KYK yurtlarına değil, Devrek ilçesinin tamamına (mahalleler ve köyler) teslimat yapmak.
**Sipariş kanalı:** Yalnızca mobil uygulama. Web sitesinden sipariş açılmayacak.
**Teslimat ücreti:** Bölge bölge yönetici panelinden ayarlanır. Ücretsiz bölgelerde müşteri "Ücretsiz teslimat" görür.

> **Güncelleme (karar):** Bölgeler sabit üç tanedir: **Kız KYK Yurdu**, **Erkek KYK Yurdu** ve **Genel Devrek**. Genel Devrek'in alanı, sitedeki haritada görünen Devrek merkez sınırıdır (OpenStreetMap'ten yüklenir, panelden doğrulanır). Devrek adreslerinde mahalle, sokak, bina no ve haritada pin zorunludur; pin sınır dışındaysa sipariş alınmaz. Aşağıdaki mahalle/köy katmanlarından ve köy günü rotalarından söz eden bölümler bu karara göre geçersizdir. Mobil için güncel prompt: `docs/mobil-asama-2-prompt.md`.

## Temel kararlar

| Konu | Karar |
|---|---|
| Sipariş kanalı | Mobil uygulama. Web sitesi bilgi ve yönetici paneli olarak kalır. |
| Eski uygulama sürümleri | Zorunlu güncelleme var; eski sürümler için ayrıca uyumluluk tutulmaz. |
| Teslimat ücreti | Her bölge için panelden: ücretsiz ya da ücretli (TL). İsteğe bağlı "şu tutarın üstü ücretsiz" eşiği. |
| Ücretsiz gösterimi | Ücret 0 ise uygulamada "Ücretsiz teslimat" yazar. Eşik varsa "X TL daha ekle, teslimat ücretsiz". |
| KYK yurtları | Bölge listesinde ücretsiz birer teslimat yeri olarak kalır. Eski siparişlerdeki yurt bilgisi aynen korunur. |
| Sıra | 1) Web: backend + yönetici paneli, 2) mobil uygulama, 3) pilot ve genişleme. |

---

## Aşama 1 — Web (backend + yönetici paneli)

Bu aşama bitince sistem adresli siparişe hazır olur. Bir bayrakla kapalı başlar, mevcut uygulama hiçbir fark görmez.

### 1.1 Hazırlık ve düzeltmeler
- Panelde minimum sepete 0 yazılınca 250 sayılması hatası düzeltilir (`cart.controller.js`).
- Hata mesajları düzeltilir ("sabah 1:00" gibi metinler), tanımsız teslimat değeri 500 yerine anlaşılır hata döner.
- Sipariş ve adres uç noktalarına istek sınırı (rate limit) eklenir.
- Herkese açık ayarlar uç noktası yalnızca gereken alanları döndürür ve önbelleğe alınır.
- CI tüm backend testlerini çalıştırır.

### 1.2 Veri modeli
- **Teslimat bölgesi (yeni):** ad, tür (mahalle / köy / yurt), açık/kapalı, teslimat ücreti (0 = ücretsiz), ücretsiz teslimat eşiği (isteğe bağlı), minimum sepet (isteğe bağlı, boşsa genel minimum), teslimat süresi bilgisi (ör. "30-60 dk"), sıralama.
- **Kayıtlı adres (yeni, ayrı koleksiyon):** bölge, sokak/cadde, bina no, kat/daire, adres tarifi, isteğe bağlı konum (enlem/boylam), varsayılan adres. Kişi başı en fazla 5 adres.
- **Sipariş (eklemeler):** bölge bilgisinin sipariş anındaki kopyası, teslimat adresi, teslimat ücreti, ürün tutarı (ücret hariç). Toplam = ürün tutarı − kupon + teslimat ücreti.
- Yurtlar bölge olarak eklenir. Eski siparişler yurt bölgelerine eşlenir; hiçbir eski alan silinmez.
- Hesap silme ve pasif hesap temizliği kayıtlı adresleri de siler (KVKK).

### 1.3 API
- `GET /api/delivery/zones`: açık bölgeler, her birinin ücreti ya da "ücretsiz" bilgisi, eşik ve minimum.
- `POST /api/delivery/quote`: sepet + bölge → teslimat ücreti, ücretsiz mi, eşiğe kalan tutar, minimum sağlanıyor mu.
- Adres işlemleri: listele / ekle / düzenle / sil / varsayılan yap.
- Sipariş verme: bölge + adres kabul eder. Ücreti istemci değil, sunucu hesaplar ve siparişe kilitler.
- Bayrak: `adresli sipariş` kapalı → pilot (seçili kullanıcılar) → herkese açık.

### 1.4 Yönetici paneli: "Teslimat bölgeleri" ekranı
- Bölge listesi: ad, tür, durum, ücret ("Ücretsiz" ya da "40 TL"), eşik, minimum, bu ayki sipariş sayısı.
- Bölge ekle / düzenle / kapat (kapatma nedeniyle: yoğunluk, hava, yol).
- Toplu işlem: birden çok bölge seçip "Ücretsiz yap" ya da "Ücreti X TL yap".
- Tek anahtar: "Tüm bölgelerde ücretsiz teslimat" (kampanya dönemleri için).
- Yapılan her değişiklik işlem kayıtlarına yazılır.

### 1.5 Yönetici paneli: mevcut ekranların uyarlanması
- **Siparişler:** adres ve "Haritada aç" linki, yurt çipleri yerine bölge filtresi ve bölgeye göre gruplama, çekmecede teslimat ücreti satırı.
- **Çıktılar:** fiş, kurye fişi, toplama listesi, gün sonu ve CSV'de adres ve teslimat ücreti.
- **Analitik ve raporlar:** ciro ürün tutarından hesaplanır, teslimat ücreti ayrı raporlanır (müşteri harcaması, kupon raporu ve Telegram özeti de buna göre).
- **Kuponlar:** yurt hedefleme yerine bölge hedefleme.
- **Ayarlar:** genel minimum sepet ve sipariş saatleri burada kalır; bölge ayarları yeni ekranda.

### 1.6 Metinler ve yasal sayfalar
- Bildirim kütüphanesindeki ve sitedeki "yurda kadar", "KYK" metinleri ilçe geneline göre güncellenir.
- Yapay zekâ asistanının bilgi ve yanıtları güncellenir.
- Web sitesi: "Teslimat bölgeleri" sayfası (bölgeler ve ücretler panelden otomatik gelir), SSS güncellemesi.
- Mesafeli satış sözleşmesi ve KVKK metinlerine adres/konum ve teslimat ücreti eklenir; satıcı bilgileri (unvan, adres, vergi no) doldurulur.

**Aşama 1 bitiş ölçütü:** Panelden bölge ve ücret yönetilebiliyor, API pilot kullanıcı için adresli sipariş alıyor, mevcut uygulamada hiçbir şey değişmemiş, tüm testler yeşil.

---

## Aşama 2 — Mobil uygulama

### 2.1 Adres
- "Adreslerim" ekranı: adres ekle / düzenle / sil / varsayılan.
- Adres eklerken önce bölge (mahalle ya da köy) seçilir, sonra sokak, bina no, daire ve tarif girilir.
- İsteğe bağlı harita pini ("Konumumu kullan" ya da pini sürükle).

### 2.2 Sepet ve ödeme
- Ödeme ekranında teslimat adresi seçimi (yurt seçimi bunun yerine geçer; yurtlar da listede).
- Teslimat ücreti satırı:
  - ücret 0 ise **"Ücretsiz teslimat"**,
  - eşik varsa **"X TL daha ekle, teslimat ücretsiz"**,
  - ücretli ise **"Teslimat ücreti: 40 TL"** ve toplamda dahil.
- Bölgenin minimum sepeti ve kapalı bölge uyarısı.
- Tahmini teslimat süresi.

### 2.3 Diğer
- Sipariş detayında adres ve teslimat ücreti.
- İptal nedenlerine "Bölgeme gelmiyor" ve "Teslimat ücreti yüksek".
- Uygulamadaki yurt odaklı metinlerin güncellenmesi (paylaşım metni, profil, ana sayfa).
- Konum izni ve mağaza gizlilik formları.

### 2.4 Yayın
- Yeni sürüm iki mağazaya gönderilir.
- Onaylanınca zorunlu güncelleme açılır ve backend'deki bayrak açılır.

**Aşama 2 bitiş ölçütü:** Gerçek cihazda merkez adresine sipariş, ücretli ve ücretsiz bölge, eşik, minimum altı ve kapalı bölge senaryoları sorunsuz.

---

## Aşama 3 — Pilot ve genişleme

1. **Merkez mahalleler:** önce personel ve birkaç güvenilir müşteri, sonra herkes.
2. **Çaydeğirmeni ve yol üstündeki yakın köyler:** sabit seferlerle (ör. günde 2-3).
3. **Uzak köyler:** haftalık "köy günü" rotasıyla (ilkbahar önerilir; kışın yollar için kapatma kuralı).

Operasyon için:
- Kurye ataması ve kurye bazında gün sonu kasası.
- "Teslim edilemedi" işlemi (adres bulunamadı / cevap yok).
- Uzak bölgede ilk siparişte telefonla teyit.

**Pilot bitiş ölçütü:** Siparişlerin en az %90'ı söz verilen sürede teslim, "adres bulunamadı" %3'ün altında, yanlış ücret tahsili yok.

---

## Senden beklenenler

- [ ] Mahalle ve köy listesi (hangileri ilk açılacak)
- [ ] Başlangıç teslimat ücretleri ve ücretsiz eşikleri (sonra panelden değiştirilebilir)
- [ ] Bölgelere göre minimum sepet (istenirse)
- [ ] Köylere teslimat sıklığı ve saatleri
- [ ] Konum pini zorunlu mu (öneri: köylerde zorunlu, merkezde isteğe bağlı)
- [ ] Satıcı bilgileri (unvan, adres, vergi no) ve teslimat ücretinin faturalanması için mali müşavir görüşü
