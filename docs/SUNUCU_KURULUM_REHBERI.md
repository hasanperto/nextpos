# NextPOS Sunucu Kurulum Rehberi (aaPanel + Node.js)

Bu rehber, NextPOS projesini **sıfırdan bir VPS sunucuya** (Ubuntu vb.) aaPanel kullanarak adım adım nasıl kuracağınızı anlatır. Bu yöntem (Yaklaşım A), QR Web Menü otomasyonunun sağlıklı çalışması için en çok önerilen yöntemdir.

---

## Adım 1: Sunucu Ön Hazırlığı ve aaPanel Kurulumu

1. **Temiz bir sunucu alın** (Önerilen: Ubuntu 22.04 LTS veya 24.04 LTS, en az 4GB RAM, 2 vCPU).
2. Sunucuya SSH ile bağlanın ve aaPanel'i kurun:
   ```bash
   URL=https://www.aapanel.com/script/install_6.0_en.sh && echo y | bash $URL aapanel
   ```
3. Kurulum bitince ekranda beliren **aaPanel giriş linkini, kullanıcı adını ve şifresini** mutlaka not alın.
4. aaPanel arayüzüne giriş yapın. İlk girişte size "One-click install" soracaktır. **LNMP** (Linux, Nginx, MySQL, PHP) seçeneğini seçin. (PHP'yi iptal edebilirsiniz, MySQL yerine biz PostgreSQL kuracağız ancak Nginx kesinlikle seçili olmalıdır).
5. Kurulumların bitmesini bekleyin.

---

## Adım 2: Gerekli Servislerin Kurulumu (aaPanel App Store)

aaPanel sol menüden **App Store**'a gidin ve şunları aratıp kurun:

1. **Node.js version manager** (Kurduktan sonra içine girip Node.js v20.x sürümünü yükleyin ve "Command line version" olarak v20'yi seçin).
2. **PostgreSQL** (Kurduktan sonra içine girin, servisin çalıştığından emin olun).
3. **Redis** (Kurduktan sonra servisin çalıştığından emin olun).
4. *Opsiyonel: PM2 manager (Eğer terminalden PM2 yönetmek zor gelirse görsel arayüz sağlar).*

---

## Adım 3: Domain (DNS) Yönlendirmeleri

Sunucunuzun IP adresini öğrendikten sonra, domain sağlayıcınızın paneline (Cloudflare, GoDaddy, vb.) gidip aşağıdaki **A kayıtlarını** sunucu IP'nize yönlendirin:

- `posapi.webotonom.de` (Backend API için)
- `nextpos.webotonom.de` (Kasiyer POS için)
- `posadmin.webotonom.de` (SaaS Admin için)
- `posreseller.webotonom.de` (Bayi paneli için)
- `*.posmenu.webotonom.de` (Wildcard kayıt - QR Menü otomasyonu için)

*(Not: Bu rehber doğrudan sizin domaininiz olan `webotonom.de` için özel olarak hazırlanmıştır).*
---

## Adım 4: Veritabanı (PostgreSQL) Hazırlığı

1. aaPanel'de **Databases -> PgSQL** sekmesine gidin.
2. **Add Database** butonuna tıklayın.
3. Database Name: `nextpos`
4. Username: `nextpos`
5. Password: `GucluBirSifre123` (Not alın)
6. "Submit" diyerek veritabanını oluşturun.

---

## Adım 5: Kodların Sunucuya Çekilmesi ve Derlenmesi (Private Repo)

Projeniz muhtemelen **Gizli (Private)** bir repo olduğu için doğrudan `git clone` komutu "Authentication failed" veya "Repository not found" hatası verecektir. GitHub'dan bir **Personal Access Token (PAT)** almanız gerekir. 
*(GitHub > Settings > Developer settings > Personal access tokens (classic) > Generate new token yolunu izleyip **repo** yetkisine sahip bir token oluşturun).*

Sunucuya SSH ile bağlıyken sırasıyla şu komutları çalıştırın:

```bash
# 1. Proje klasörüne gidin
cd /www/wwwroot

# 2. Github'dan projeyi indirin (TOKEN_BURAYA yazan yere token'ınızı yapıştırın)
git clone https://TOKEN_BURAYA@github.com/hasanperto/nextpos.git
cd nextpos

# 3. Bağımlılıkları kurun
npm ci

# 4. Frontend ortam değişkenlerini (.env) oluşturun
# Kendi domaininize göre posapi.webotonom.de kısımlarını değiştirin.
echo "VITE_API_PROXY_TARGET=http://127.0.0.1:5000" > apps/pos/.env.production
echo "VITE_API_PROXY_TARGET=http://127.0.0.1:5000" > apps/admin/.env.production
echo "VITE_API_PROXY_TARGET=http://127.0.0.1:5000" > apps/reseller/.env.production

# 5. Frontend uygulamalarını derleyin (build)
npm run build
```

---

## Adım 5.5: Sunucudaki Portları Kontrol Edin

Kuruluma başlamadan önce sunucunuzda hangi portların kullanıldığını kontrol edin:

```bash
# Tüm kullanılan portları listele
ss -tlnp

# NextPOS'un kullanacağı portlarda çakışma var mı?
ss -tlnp | grep -E ':(3001|5432|6379) '
```

Beklenen sonuç:
- **5432** → PostgreSQL (zaten kurulu, normal)
- **6379** → Redis (zaten kurulu, normal)
- **3001** → **Boş olmalı** (NextPOS API burada çalışacak)

> ⚠️ Eğer **3001 portu doluysa**, `.env` dosyasında `PORT=4500` gibi farklı bir port belirleyin ve Nginx ayarlarını da buna göre güncelleyin.
> Detay için: `docs/PORT_CONFIGURATION.md`

---

## Adım 6: API Çevre Değişkenleri (.env) ve Veritabanı Kurulumu

API klasörüne gidin ve ortam değişkenleri dosyasını oluşturun:

```bash
cd /www/wwwroot/nextpos/apps/api
cp .env.example .env
nano .env
```

`.env` dosyasının içini ok tuşlarıyla düzenleyin. En önemli ayarlar:

```env
NODE_ENV=production
PORT=3001
TRUST_PROXY=1

# JWT gizli anahtarları (güçlü rastgele değerler girin)
# Aşağıdaki komutla oluşturabilirsiniz: openssl rand -base64 48
JWT_SECRET=BURAYA_GUCLU_BIR_ANAHTAR_YAZIN
JWT_REFRESH_SECRET=BURAYA_BASKA_BIR_GUCLU_ANAHTAR_YAZIN

# Adım 4'te oluşturduğunuz DB bilgileri
DATABASE_URL="postgresql://nextpos:GucluBirSifre123@127.0.0.1:5432/nextpos"

# Redis (aaPanel'den kurduysanız şifresiz çalışır)
REDIS_URL="redis://127.0.0.1:6379"

# CORS ayarları (webotonom.de domainleri)
CORS_ORIGIN="https://nextpos.webotonom.de,https://posadmin.webotonom.de,https://posreseller.webotonom.de"
SOCKET_CORS_ORIGIN="https://nextpos.webotonom.de,https://posadmin.webotonom.de,https://posreseller.webotonom.de"

# QR Web Otomasyon Ayarları
AAPANEL_QR_AUTOMATION_ENABLED=true
AAPANEL_QR_WEB_ROOT=/www/wwwroot
AAPANEL_QR_TEMPLATE_DIR=/www/wwwroot/qr-web-template
AAPANEL_NGINX_CONF_DIR=/www/server/panel/vhost/nginx
AAPANEL_ACME_WEBROOT=/www/wwwroot/.well-known/acme-challenge
AAPANEL_QR_API_ORIGIN=https://posapi.webotonom.de
AAPANEL_CERTBOT_EMAIL=admin@webotonom.de
QR_WEB_PARENT_DOMAIN=posmenu.webotonom.de
QR_WEB_SUBDOMAIN_PREFIX=
```

Dosyayı kaydedip çıkın (`Ctrl+O`, `Enter`, `Ctrl+X`).

Şimdi veritabanı tablolarını oluşturup ilk demo verilerini (SaaS admin hesabı vb.) ekleyelim:

```bash
npx prisma migrate deploy
npm run db:setup
```

---

## Adım 7: API'yi PM2 ile Başlatma

API'nin arka planda sürekli çalışması için PM2 kullanacağız. (Eğer yüklü değilse `npm i -g pm2` ile yükleyin).

API klasöründeyken (`/www/wwwroot/nextpos/apps/api`):

```bash
# Prisma Client'ı oluşturun
npx prisma generate

# Projeyi build edin
npm run build

# PM2 ile başlatın
pm2 start dist/index.js --name nextpos-api

# API çalışıyor mu kontrol edin
curl http://127.0.0.1:3001/api/v1/health

# Sunucu yeniden başlarsa PM2'nin de otomatik başlaması için:
pm2 startup
pm2 save
```

Şu an API sunucunuzun `3001` portunda çalışıyor olmalı. (`PORT=` ile farklı bir port belirlediyseniz o portta çalışır)

---

## Adım 8: aaPanel Üzerinden Siteleri (Domainleri) Ekleme ve SSL

aaPanel arayüzüne geri dönün. **Website** sekmesine gidin. Her bir domain için şu işlemi yapacağız:

### 1. POS Frontend (`nextpos.webotonom.de`)
1. **Add site** butonuna tıklayın.
2. Domain: `nextpos.webotonom.de`
3. Document Root: `/www/wwwroot/nextpos/apps/pos/dist` (Seçim ekranından bu klasörü bulun)
4. Submit deyin.
5. Site eklendikten sonra listede sitenin adına (veya Conf ayarlarına) tıklayın.
6. **URL rewrite** sekmesine gelin ve SPA routing ile API proxy için şu kodu yapıştırıp kaydedin:
   ```nginx
   location / {
     try_files $uri $uri/ /index.html;
   }
   
   location /api/ {
     proxy_pass http://127.0.0.1:3001;
     proxy_http_version 1.1;
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
   }
   
   location /socket.io/ {
     proxy_pass http://127.0.0.1:3001;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
   }
   ```
7. **SSL** sekmesine gidin, Let's Encrypt seçip sertifika başvurusunda bulunun (Apply). Başarılı olunca "Force HTTPS" açın.

### 2. Admin Frontend (`posadmin.webotonom.de`)
Aynı işlemleri yapın. Sadece Document Root farklı olacak:
- Document Root: `/www/wwwroot/nextpos/apps/admin/dist`
- URL rewrite (SPA ve API Proxy) ayarını ve SSL işlemini unutmayın.

### 3. Bayi Frontend (`posreseller.webotonom.de`)
Aynı işlemleri yapın. Sadece Document Root farklı olacak:
- Document Root: `/www/wwwroot/nextpos/apps/reseller/dist`
- URL rewrite (SPA ve API Proxy) ayarını ve SSL işlemini unutmayın.

### 4. Backend API Reverse Proxy (`posapi.webotonom.de`)
Bu adım biraz farklı. Çünkü API statik dosya değil, Node.js uygulamasından geliyor.
1. **Add site** butonuna tıklayın.
2. Domain: `posapi.webotonom.de`
3. Document Root: Önemli değil, `/www/wwwroot/posapi.webotonom.de` olarak kalabilir.
4. Submit deyin.
5. Sitenin ayarlarına girip **SSL** sekmesinden sertifikayı alın ve "Force HTTPS" açın.
6. **Reverse proxy** sekmesine gelin. "Add reverse proxy" deyin:
   - Target URL: `http://127.0.0.1:3001`
   - Submit deyin.
7. Oluşan Proxy kuralının sağındaki "Conf" (veya Config) düzenleme ekranını açın. WebSocket'lerin çalışması için configuration metnini şu şekilde güncelleyin:

   ```nginx
   location / {
     proxy_pass http://127.0.0.1:3001;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
   }
   ```
8. Kaydedip kapatın.

---

## Adım 9: QR Web Menü Otomasyonu İçin Şablon Hazırlığı

Müşterilere yeni restoran açtığınızda sistem otomatik olarak alt domain (`restoranadi.posmenu.webotonom.de`) ve SSL kuracak. Bunun için bir referans şablon klasörü oluşturmalıyız.

Sunucuda (SSH) şu komutları çalıştırın:

```bash
# Şablon klasörünü oluştur
mkdir -p /www/wwwroot/qr-web-template

# QrMenu (Next.js) build dosyalarını şablona kopyala
# Not: Eğer apps/qrmenu kullanıyorsanız o klasörün build çıktılarını buraya kopyalamalısınız.
cp -r /www/wwwroot/nextpos/apps/qrmenu/out/* /www/wwwroot/qr-web-template/
```

*Not: Eğer Next.js uygulamanız SSR çalışacaksa statik HTML yerine onu da bir PM2 servisi olarak ayağa kaldırmanız ve şablon Nginx ayarlarında (otomasyon servisi içinde) proxy yapmanız gerekebilir.*

---

## Adım 10: Test ve Kontrol

1. Tarayıcıdan `https://nextpos.webotonom.de` adresine gidin. POS ekranının gelmesi lazım.
2. Tarayıcıdan `https://posadmin.webotonom.de` adresine gidin.
   - Seed ile oluşturulan bilgilerle (Kullanıcı: `superadmin`, Şifre: `superadmin123`) giriş yapın.
   - Giriş başarılıysa ve hata yoksa, API ve Veritabanı bağlantınız kusursuz çalışıyor demektir!

Tebrikler, NextPOS sistemi sunucunuzda canlıya alındı!
