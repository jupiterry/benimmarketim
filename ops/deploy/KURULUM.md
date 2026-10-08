# Benim Marketim otomatik web yayını

Bu dosyalar tek başına kurulum yapmaz; workflow aşağıdaki sunucu ön koşullarına ihtiyaç duyar.
Mobil repo, uygulama sürümü, `.env`, yüklemeler ve veritabanı değiştirilmez.

## 8 Ekim 2026 kurulum notu

Canlı klasör main adlı temiz bir Git checkout olarak hazırlandı. Önceki kaynak farkları `/var/backups/benimmarketim-git-bootstrap-20261008T202144Z.tar.gz` içinde korundu. Mevcut sunucuya özel 105 dosya `.git/info/exclude` ile yerinde bırakıldı. Ortam şablonunun yerel kopyasını korumak için yalnızca `.env.example` dosyasında `skip-worktree` kullanıldı; gerçek `.env` dosyaları takip edilmiyor. Şablon main'de değişirse bunu yönetici ayrıca incelemelidir.

Repo public olduğundan origin salt okunur HTTPS kullanıyor; GitHub'a erişim için ayrı repo anahtarı gerekmedi. `bmdeploy` kullanıcısının parolası kapalı. Home ve `.ssh` dizinleri root'a ait; root'a ait `authorized_keys` içindeki `restrict,command=...` kuralı sadece yayın giriş betiğine izin veriyor. Genel SSH ayarları değiştirilmedi. Aşağıdaki `/etc/ssh/authorized_keys` yöntemi alternatif ilk kurulum tarifidir; mevcut kurulumda tekrar uygulanması gerekmez.

Resmi checksum'u doğrulanan Node v22.23.3 `/opt/benimmarketim-node22` içine kuruldu. Sistem Node 20 ve Telegram süreci değiştirilmedi. Sonraki backend yayınları API'yi açıkça bu Node 22 yorumlayıcısıyla reload eder. GitHub Actions environment secret'ları kullanıcı tarafından girildi; bunların doğruluğu ilk gerçek workflow çalışmasıyla sınanır.

## İncelemede doğrulanan yapı

- Kök `package.json`: `start` → `node backend/server.js`; test → `npm run test:ai-support`.
- Frontend: `npm run build --prefix frontend`; Vite ve SEO betiği `frontend/dist` üretir.
- Express, production modunda bu dizini sunar. `ops/nginx/seo-locations.conf` ana sayfa ve kategorileri aynı dizinden doğrudan sunar.
- Repoda ecosystem, Docker veya systemd uygulama tanımı bulunmadı. Önceki canlı dağıtımlarda `benimmarketim-api`, root PM2 altında **fork** modunda çalışıyordu.
- `ops/SEO_DEPLOYMENT.md` canlı dizinin Git checkout olmadığını kaydediyor. Bu bilgi yeni kurulumdan önce sunucuda tekrar doğrulanmalıdır.
- Şu an yerel dal `deploy`; yeni workflow **main** dalını yayınlar. Güncel web değişikliklerini inceleyerek main'e birleştirmeden yayını açmayın.

## Yayının davranışı

1. Main push veya main seçilerek elle çalıştırma: Node 22, gerçek `npm ci`, backend testleri, frontend kurulumu/derlemesi ve SEO kontrolü.
2. Testler başarılıysa `production` ortamının secret'larıyla yalnızca SSH anahtarı üzerinden bağlantı.
3. Sunucuda `flock` kilidi, temiz Git checkout ve test edilen commit kontrolü. Sunucuda elle değişiklik varsa yayın durur.
4. Aday kod ayrı dizine çıkarılır; canlı `.env` dosyaları oraya kopyalanmaz. Kilit dosyası değişmişse `npm ci`, değişmemişse mevcut bağımlılıklar kopyalanır. Frontend bağımlılıkları ilk kez yoksa da kurulur. Bu istisna ilk kuruluma aittir.
5. Gereken frontend derlemesi canlı dizinin dışında yapılır. Derleme başarısızsa canlı dosyalar değişmez. Ardından `git pull --ff-only` ile **tam olarak test edilen main commit'i** alınır.
6. Backend/kök package dosyaları değiştiyse `pm2 reload benimmarketim-api`. Yalnızca frontend değiştiyse PM2'ye dokunulmaz. Nginx ayarları değişmediği için Nginx reload gerekmez.
7. Site ve `/api/products` HTTP 200 kontrolü yaklaşık 60 saniye boyunca tekrar denenir. Başarısızlıkta önceki commit, derleme ve değişmiş bağımlılıklar geri alınır; işlem hata koduyla biter.
8. GitHub ayrıca dışarıdan aynı adresleri kontrol eder. **Sadece bu son dış kontrol başarısızsa otomatik geri alma olmaz**; sunucu kontrolü ve bağlantı durumu incelenir.

Fork modunda `reload` kısa kesinti yaratabilir. Cluster'a otomatik geçilmez: zamanlanmış sepet bildirimlerinin çoğalması ve Socket.IO bağlantıları ayrıca tasarlanmalıdır. Frontend klasör değişimi de iki rename işlemidir; bu nedenle mutlak sıfır kesinti garantisi yoktur.

Eski hash'li asset'ler korunur; otomatik 30 günlük silme uygulanmaz. Geri dönüş dizinleri ve bağımlılık kopyaları da korunur. Disk alanını izleyin; eski yedekleri çalışan bir yayın dışında yönetici temizleyebilir.

## 1. Ön kontrol ve yedek (sunucu yöneticisi)

Bu adımları mevcut yönetici oturumunda çalıştırın. Secret veya `.env` içeriğini ekrana dökmeyin.

```bash
node --version
npm --version
command -v node npm pm2
pm2 describe benimmarketim-api
nginx -t
df -h /var/www /var/lib
git -C /var/www/benimmarketim rev-parse --is-inside-work-tree
```

Son komut eski düzende hata verebilir. PM2 adı, cwd (`/var/www/benimmarketim`), root sahipliği ve fork modu beklenenle aynı değilse kurulumu durdurup gerçek düzene göre betiği uyarlayın. Betik PATH olarak `/opt/benimmarketim-node22/bin:/usr/local/bin:/usr/bin:/bin` kullanır; root'un interaktif NVM profiline dayanmaz. Resmi Node 22 dağıtımı checksum doğrulamasıyla `/opt/benimmarketim-node22` altına kurulmuştur; sistemin `/usr/bin/node` dosyası değiştirilmez.

```bash
install -d -m 700 /var/backups/benimmarketim-setup
umask 077
tar -czf /var/backups/benimmarketim-setup/before-actions.tar.gz \
  -C /var/www benimmarketim
tar -czf /var/backups/benimmarketim-setup/nginx-before-actions.tar.gz /etc/nginx
```

Bu yedekler gizli dosyalar içerebilir; yalnızca sunucuda root erişiminde tutun, GitHub'a yüklemeyin. Otomatik betik `.env` yedeği almaz veya içeriğini okumaz.

## 2. Sunucunun GitHub'dan kod okuyabilmesi

Linux'taki temiz npm kurulumu için resim işleme paketlerinin derleme araçları da gerekir. Debian/Ubuntu sunucuda `build-essential pkg-config libpng-dev autoconf automake libtool nasm` paketlerini kurun. Workflow bunları GitHub runner'da otomatik kurar.

Bu anahtar, GitHub Actions'ın sunucuya bağlanacağı anahtardan **ayrıdır**.
Özel repo için root oturumunda salt okunur repo anahtarı oluşturun:

```bash
ssh-keygen -t ed25519 -f /root/.ssh/benimmarketim_repo -C benimmarketim-repo-readonly -N ''
```

`/root/.ssh/benimmarketim_repo.pub` içeriğini GitHub repo → Settings → Deploy keys → Add deploy key bölümüne ekleyin. **Allow write access kapalı** olsun. Özel dosya sunucuda kalır; Actions secret'ına konmaz.

Root'un SSH config'ine mevcut ayarları bozmadan aşağıdaki host takma adını ekleyin:

```text
Host benimmarketim-github
  HostName github.com
  User git
  IdentityFile /root/.ssh/benimmarketim_repo
  IdentitiesOnly yes
  StrictHostKeyChecking yes
```

GitHub host anahtarını resmi [GitHub fingerprint listesi](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) ile doğrulayarak root known_hosts dosyasına ekleyin. Doğrulamayı kapatmayın.

## 3. Canlı klasörü Git'e güvenle hazırlama

Önce bütün güncel web kodu ve bu kurulum dosyaları **main** üzerinde olmalı. Main'i varsayılan dal yapmak workflow_dispatch görünürlüğünü de sağlar. Mobil repo bu işlemde kullanılmaz.

```bash
git clone --branch main git@benimmarketim-github:jupiterry/benimmarketim.git /var/lib/benimmarketim-main-check
```

Klonlanan depodaki **takip edilen dosyaları** canlıdaki karşılıklarıyla karşılaştırın. Dosya içeriklerini veya `.env` farklarını CI loglarına basmayın. Canlıda olup main'de olmayan değişiklikleri önce inceleyip main'e taşıyın; sadece repoda olan test/doküman gibi eksik dosyaları inceleyerek tamamlayın. `.env`, yüklemeler, bağımlılıklar ve derlenmiş çıktı bu karşılaştırmanın dışında kalır. `rsync --delete`, `git clean` veya körlemesine `reset --hard` kullanmayın.

Dosyalar eşleştirildikten sonra, **henüz .git yoksa**, root oturumunda:

```bash
cd /var/www/benimmarketim
git init -b main
git remote add origin git@benimmarketim-github:jupiterry/benimmarketim.git
git fetch origin main
git reset --mixed origin/main
git status --short
git diff --quiet
```

`reset --mixed` dosya içeriğini değiştirmez; Git indeksini oluşturur. Son iki komutta kalan farkları **tek tek** çözün. Betik temiz checkout olmadan çalışmaz. Yerel yardımcı arşiv/klasörleri `.git/info/exclude` ile hariç tutabilirsiniz; kod farklarını gizlemeyin. `.env` ve uploads gerçekten takip edilmiyor olmalı: `git ls-files .env uploads` boş dönmeli. Git dizini, uygulama kodu ve üst dizinleri root'a ait kalmalı; deploy kullanıcısına yazma izni vermeyin. Mevcut upload/.env izinlerini değiştirmeyin.

İlk etkinleştirme öncesinde `node_modules`, `frontend/node_modules` ve `frontend/dist` main'deki lock dosyaları/kodla uyumlu olmalıdır. İlk temiz bağımlılık kurulumu ve build'i planlı bakımda yapın; workflow daha sonra yalnızca değişen lock dosyaları için kurulum yapar. Frontend build'i özel VITE ayarları gerektiriyorsa önce bunu çözün: aday build üretim `.env` dosyasını okumaz ve hiçbir gizli değeri frontend'e taşımamalıdır.

## 4. Root olmayan giriş kullanıcısı ve kısıtlı komut

```bash
adduser --disabled-password --gecos '' bmdeploy
install -o root -g root -m 755 ops/deploy/deploy.sh /usr/local/sbin/benimmarketim-deploy
install -o root -g root -m 755 ops/deploy/ssh-entry.sh /usr/local/bin/benimmarketim-ssh-entry
```

`visudo -f /etc/sudoers.d/benimmarketim-deploy` ile şu tek izni ekleyin:

```sudoers
bmdeploy ALL=(root) NOPASSWD: /usr/local/sbin/benimmarketim-deploy deploy *
```

`visudo -cf /etc/sudoers.d/benimmarketim-deploy` ile doğrulayın. Kullanıcıyı sudo grubuna eklemeyin. Root betiği eylemi, SHA'yı ve sabit uygulama dizinini yeniden doğrular. Betik kopyaları otomatik güncellenmez; değişirse yönetici inceleyip tekrar kurar.

Mevcut root PM2 korunur; SSH kullanıcısı sadece bu komutu çağırır. Main'e kod yazabilen kişiler fiilen sunucuda çalışan kodu belirler; main yazma yetkilerini, bağımlılık değişikliklerini ve production ortamını buna göre koruyun.

## 5. GitHub Actions → VPS anahtarı

Kendi güvenilir bilgisayarınızda sadece bu yayın için yeni bir anahtar oluşturun (aşağıdaki komut Bash içindir):

```bash
ssh-keygen -t ed25519 -f ./benimmarketim_actions -C benimmarketim-actions -N ''
```

- **`benimmarketim_actions.pub`**: sunucunun yetkili anahtar dosyasına.
- **`benimmarketim_actions`**: başlık ve son satır dahil tamamı GitHub `SSH_PRIVATE_KEY` secret'ına. Repoya veya sohbete yapıştırmayın.

Sunucuda root'a ait `/etc/ssh/authorized_keys/bmdeploy` dosyasını oluşturun; tek satırı şu biçimde olsun (`ssh-ed25519 ...` kısmını kendi .pub dosyanızla değiştirin):

```text
restrict,command="/usr/local/bin/benimmarketim-ssh-entry" ssh-ed25519 AAAA... benimmarketim-actions
```

Dizine 755, dosyaya 600 ve root sahipliği verin. `sshd_config` dosyasının sonuna, mevcut Match bloklarını dikkate alarak ekleyin:

```text
Match User bmdeploy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AuthorizedKeysFile /etc/ssh/authorized_keys/bmdeploy
    DisableForwarding yes
    PermitTTY no
Match all
```

`sshd -t` geçmeden SSH servisini reload etmeyin. Servisin adı dağıtıma göre `ssh` veya `sshd` olabilir; mevcut yönetici oturumunu açık tutarak doğrulayın. Root SSH ayarlarını değiştirmeyin.

Sunucu kimliği için güvenilir VPS konsolundan `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` çıktısını alın. Kendi bilgisayarınızda `ssh-keyscan -p PORT -t ed25519 HOST > known_hosts` ile alınan anahtarın fingerprint'ini `ssh-keygen -lf known_hosts` ile karşılaştırın. Eşleşirse **known_hosts dosyasının içeriğini** `SSH_KNOWN_HOSTS` yapın; sadece fingerprint metni yeterli değildir. 22 dışındaki portlarda `[host]:port` biçimini koruyun.

## 6. GitHub ayarları ve ilk deneme

Repo → Settings → Environments → **production** oluşturun; deployment branch kuralını **main** ile sınırlayın. Environment secrets:

| Secret | Değer |
|---|---|
| SSH_HOST | VPS IP'si veya SSH host adı |
| SSH_USER | bmdeploy |
| SSH_PORT | Gerçek SSH portu (genelde 22) |
| SSH_PRIVATE_KEY | Bilgisayarda oluşturulan Actions özel anahtarı |
| SSH_KNOWN_HOSTS | Yukarıda doğrulanan OpenSSH known_hosts satırı |
| APP_DIR | /var/www/benimmarketim |

Settings → Actions bölümünde workflow'lara izin verin. Main'i koruyun; ilk deneme için production ortamına reviewer eklemek tercih edilebilir. Sürekli tam otomatik yayın istenirse zorunlu reviewer beklemesi olmamalıdır.

Önce dosyaları inceleyerek main'e taşıyın, sunucu kurulumunu tamamlayın; sonra Actions → **Web production deploy** → Run workflow → **main** seçin. Aynı commit zaten canlıdaysa sunucu backend'i gereksiz yeniden başlatmaz, yine sağlık kontrolü yapar. İlk çalışmada test/derleme, SSH ve site/API kontrol adımlarının hepsi yeşil olmalı. `/`, bir kategori, giriş, yönetici paneli ve sohbeti elle kontrol edin. Sonraki main push'ları aynı akışı başlatır.

Bu hazırlık sırasında gerçek Actions çalıştırması veya VPS kurulumu yapılmadı. Yerel test sonucu Actions'taki temiz `npm ci` sonucunun yerine geçmez.

Yerel doğrulama: kurulu bağımlılıklarla 114 backend testi, frontend build ve SEO kontrolü geçti. `test_deploy.py` gerçek geçici Git depolarıyla sekiz kontrol akışını sınar; npm, PM2, HTTP ve flock taklittir. Linux izinleri, gerçek SSH, paket kurulumu ve PM2 davranışı ilk sunucu/Actions denemesinin parçasıdır. Bu testler de workflow'da her yayından önce çalışır.

## 7. Geri dönüş

Başarısız sunucu yayını otomatik olarak bir önceki sürümü geri yüklemeyi dener ve Actions kırmızı biter. Root-only log: `/var/lib/benimmarketim-deploy/<tarih>-<sha>/deploy.log`. Logları paylaşmadan önce gizli bilgi açısından inceleyin.

Başarılı ama sorunlu bir yayından sonra önce yeni main push'larını durdurun. Önceki 40 karakterlik SHA ilgili dizindeki `previous-commit` dosyasındadır. Root yönetici oturumunda:

```bash
/usr/local/sbin/benimmarketim-deploy rollback ONCEKI_40_KARAKTER_SHA /var/www/benimmarketim
```

Bu komut önceki kaynak kodu yeniden derler ve sağlık kontrolü yapar; veritabanını veya `.env` dosyalarını geri almaz. Anahtar üzerinden rollback izni verilmemiştir. Kalıcı çözüm için GitHub'da sorunlu commit'i `git revert` ile geri alın; sonraki main yayını aynı hatayı yeniden getirmesin. Otomatik recovery de başarısızsa root logunu ve `previous-dist` / `previous-node_modules` yedeklerini kullanarak manuel müdahale gerekir.

## Başvuru

- [GitHub deployment ve concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
- [PM2 reload ve cluster davranışı](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
