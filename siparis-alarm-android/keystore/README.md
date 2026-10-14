# İmza anahtarı

- `siparis-alarm.jks`: APK imza anahtarı (PKCS12, takma ad `siparisalarm`)
- `keystore.properties`: anahtar dosyasının adı ve şifreleri. Gradle ve `build-apk.sh` buradan okur.

Bu iki dosya `.gitignore` ile depodan hariç tutulur. Depo herkese açık olduğu için **asla eklemeyin**.
Güvenli bir yere yedekleyin: güncellemeler aynı anahtarla imzalanmazsa telefona eskisinin üstüne kurulmaz.
