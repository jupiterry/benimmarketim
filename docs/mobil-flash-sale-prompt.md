# Mobil: flash sale fiyat düzeltmesi — Claude Code için prompt

Aşağıdaki metnin tamamını `benimmarketim-app` (Flutter) deposunda açılan yeni bir Claude Code oturumuna yapıştır. Bu prompt Aşama 2 prompt'undan bağımsızdır; istersen önce bunu yap.

---

Sen Benim Marketim'in Flutter uygulamasında (`benimmarketim-app`) çalışıyorsun. Sorun: web panelinden başlatılan flash sale, uygulamada ürün fiyatına yansımıyordu; flash sale bitince ya da iptal edilince de eski fiyat geri gelmiyordu.

**Backend tarafı düzeltildi ve canlıda.** Değişen davranış:
- Her ürün yanıtında `actualPrice` her zaman var. Bu, siparişte alınacak fiyattır: liste fiyatı, ürün indirimi (flash sale dahil) ve haftalık fırsat fiyatının en düşüğü. Şu uç noktaların hepsinde geçerli: `/products`, `/products/featured`, `/products/home-feed`, `/products/popular`, `/products/personalized`, `/products/search`, `/products/:id`, `/products/:id/similar`.
- Flash sale sürerken ve fiyatı belirleyen indirim oysa, ürün yanıtında `flashSale: { _id, discountPercentage, price, startDate, endDate }` gelir. Flash sale yoksa bu alan hiç gelmez.
- `GET /flash-sales/active`:
  - yalnızca fiyatı gerçekten uygulanmış satışları döndürür;
  - yanıtında `serverTime` vardır;
  - her satışın `product` nesnesinde `actualPrice` bulunur;
  - `Cache-Control: no-store` ile gelir;
  - çağrıldığında sunucu satışları en fazla 10 saniyede bir senkronlar.
- `/products` ve `/products/featured` artık `Cache-Control: private, no-cache` gönderiyor.

## Kurallar
- Backend'e dokunma.
- Yeni paket ekleme.
- `flutter analyze` hatasız olmalı; değişiklikler için test yaz.
- Türkçe metin, müşteriye "sen" diye hitap.

## Yapılacaklar
1. **Fiyat:** her yerde gösterilen fiyat `actualPrice` olsun (`Product.fromJson` zaten önce `actualPrice` okuyor; kontrol et). `FlashSale.flashPrice` için `product.actualPrice` kullan.
2. **Rozet ve geri sayım:** ürün kartında ve detayında indirim rozetini ve geri sayımı yeni `product.flashSale` alanından göster: `discountPercentage`, `price`, `endDate`. Ürünü `/flash-sales/active` içinde aramak yerine bu alanı tercih et.
3. **Cihaz saati:**
   - `FlashSaleViewModel.refreshActive`, satışları telefonun saatiyle (`isLiveAt(DateTime.now())`) eliyor. Telefonun saati yanlışsa canlı satış gizleniyor ya da erken bitiyor.
   - `/flash-sales/active` yanıtındaki `serverTime` ile `offset = serverTime − DateTime.now()` hesapla.
   - `isLiveAt`, geri sayım ve `remainingTime` hesaplarında `DateTime.now() + offset` kullan.
4. **Sepet fiyatları (sqflite):**
   - Sepet bugün yalnızca flash view model bir değişiklik görünce yeniden fiyatlanıyor. Soğuk açılışta önceki liste boş olduğu için, uygulama kapalıyken biten ya da iptal edilen satış hiç "bitti" sayılmıyor ve sepette flash fiyatı kalıyor.
   - Uygulama açılışında, ön plana gelişte ve sipariş özeti ekranından önce sepet kalemlerini sunucudan yeniden fiyatla. Giriş yapılmışsa `GET /api/cart` sunucu fiyatlarını döndürür; yapılmamışsa kalem başına `/products/:id`.
   - Fiyat değişen kalem varsa kullanıcıya kısa bir bilgi göster: "Sepetindeki bazı ürünlerin fiyatı güncellendi."
5. **Listeleri yenile:**
   - `FlashSaleViewModel` bir satışın başladığını ya da bittiğini görünce `HomePageViewModel.refreshProducts()` çağır ve `CategoryProductsViewModel` bellek önbelleğini temizle.
   - Ana sayfanın `_staleAfter` değerini 10 dk'dan 2 dk'ya indir.
   - Uygulama 1 dk'dan uzun süre arka planda kaldıysa, ön plana gelince yenile.
6. **Yoklama:** uygulama ön plandayken `/flash-sales/active` isteğini 2 dk yerine 60 sn'de bir at. `endGrace` değerini 75 sn'den 15 sn'ye indir.
7. **Ürün detayı:** sayfa açılınca `/products/:id` isteğini yeniden at. Liste 3 günlük disk önbelleğinden gelmiş olsa bile fiyat ve rozet güncel olsun.
8. **HTTP önbelleği:** ileride eklenirse `Cache-Control: no-cache` başlığına uy, yani her istekte yeniden doğrula.

## Bitiş kontrol listesi
- [ ] Panelden flash sale başlatılınca en geç 1 dk içinde uygulamada indirimli fiyat ve rozet görünüyor (ana sayfa, kategori, arama, detay).
- [ ] Haftalık fırsattaki üründe daha derin flash sale başlatılınca flash fiyatı görünüyor.
- [ ] Flash sale bitirilince ya da iptal edilince fiyat en geç 1 dk içinde normale dönüyor; sepet de yeniden fiyatlanıyor.
- [ ] Telefon saati yanlışken de satış doğru görünüyor.
- [ ] `flutter analyze` temiz, testler yeşil.
