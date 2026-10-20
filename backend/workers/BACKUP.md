# Gece veritabanı yedeği

MongoDB Atlas ücretsiz (M0) kümede otomatik yedek yoktur. Bu görev her gece 03:30'da (İstanbul)
tüm koleksiyonları dizinleriyle birlikte tek bir sıkıştırılmış dosyaya yazar, son 14 yedeği saklar
ve eskileri siler. Yedekler yalnızca sunucuda (`BACKUP_DIR`) tutulur; dışarıya gönderilmez. mongodump gerekmez.

## Kurulum (sunucuda, bir kez)

1. `.env` dosyasına ekleyin:
   ```
   BACKUP_PASSWORD=<uzun ve güçlü bir parola>
   BACKUP_DIR=/var/backups/benimmarketim-db
   BACKUP_KEEP_DAYS=14
   ```
   **Parolayı ayrıca güvenli bir yere (şifre yöneticisi, kâğıt) yazın.** Parola olmadan şifreli yedek açılamaz.
   Parola yoksa yedek şifresiz yazılır; dosya kişisel veri içerdiği için klasör izinlerini (700) koruyun.
2. Klasörü oluşturun: `install -d -m 700 /var/backups/benimmarketim-db`
3. Proje klasöründe bir kez elle deneyin:
   ```
   npm run backup:now
   ```
   `BACKUP_DIR` altında `benimmarketim-<tarih>.json.gz.enc` dosyası oluşmalı.
4. Gece görevini başlatın:
   ```
   pm2 start backend/workers/backup.run.js --name benimmarketim-backup --time
   pm2 save
   ```
   Sunucu kapalı kaldıysa açılışta son başarılı yedek 26 saatten eskiyse hemen bir yedek alınır.

Her çalıştırma `backup_runs` koleksiyonuna yazılır (son 90 gün). Hata olursa kayıt `ok: false` ve hata mesajıyla düşer;
`pm2 logs benimmarketim-backup` ile görülebilir.

## Sunucu dışı kopya (önerilir)

Sunucu tamamen kaybolursa yedekler de kaybolur. `BACKUP_DIR` klasörünü düzenli olarak başka bir yere
(ör. `rsync`/`scp` ile kendi bilgisayarınıza ya da bir nesne depolamaya) kopyalayın. Şifreli dosyalar
`BACKUP_PASSWORD` olmadan açılamadığı için taşınmaları güvenlidir.

## Geri yükleme

```
# 1) Yalnızca doğrula (hiçbir şey yazmaz)
npm run backup:restore -- /var/backups/benimmarketim-db/benimmarketim-2026-10-11-0330.json.gz.enc

# 2) Önce ayrı bir veritabanına yükleyip kontrol edin (Atlas'ta aynı kümede farklı veritabanı adı olabilir)
npm run backup:restore -- <dosya> --apply --target "mongodb+srv://.../benimmarketim_kontrol?..."

# 3) Canlı veritabanının üzerine yazın (önce o anki hâlin yedeği otomatik alınır)
npm run backup:restore -- <dosya> --apply --live --yes

# Yalnızca bazı koleksiyonlar
npm run backup:restore -- <dosya> --apply --live --yes --only orders,users
```

Seçilen her koleksiyon önce silinir, sonra yedekteki hâliyle yazılır; yedekte olmayan koleksiyonlara dokunulmaz.
Geri yüklemeden önce API'yi durdurmak (`pm2 stop benimmarketim-api`) ve bittikten sonra başlatmak önerilir.

## Bilinmesi gerekenler

- Atlas ücretsiz katmanda veri aktarımı sınırlıdır; küçük bir market veritabanı için gece bir yedek sorun olmaz.
- Dosya biçimi ve şifreleme: `backend/services/dbBackup.service.js` başındaki açıklama. Testler: `node --test backend/tests/db-backup.test.js`.
