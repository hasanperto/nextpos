# NextPOS

SaaS Admin → Bayi (Reseller) → Restoran (Tenant) → Şube → POS / Garson / Mutfak / Kurye / QR Menü.

Monorepo yapısı (Turborepo):
- `apps/api`: Backend API (Node.js/TypeScript) + PostgreSQL (Prisma)
- `apps/pos`: POS + Restoran Admin (React/Vite/TypeScript)
- `apps/admin`: SaaS Admin paneli (Vite)
- `apps/reseller`: Bayi paneli (Vite)

## Hızlı Başlangıç (Yerel)

Gereksinimler:
- Node.js >= 20
- Docker (PostgreSQL + Redis için)

Kurulum:

```bash
npm install
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
```

Yerel URL’ler (varsayılan):
- API: http://127.0.0.1:3001 (sağlık: `/api/v1/health`)
- POS: http://127.0.0.1:5173
- Admin: http://127.0.0.1:5176
- Bayi: http://127.0.0.1:4001

Demo hesaplar için: `apps/api/prisma/seed.ts`

## GitHub’a Yükleme Rehberi (Commit + Push)

Bu repo zaten `origin` remote’una bağlı: `https://github.com/hasanperto/nextpos.git`.

### 1) Güvenlik Kontrolü (Zorunlu)

- `.env` dosyaları repoya eklenmez (ignore). Sadece `.env.example` commitlenir.
- Build çıktıları commitlenmez (`dist/`, `.next/`, `.turbo/` ignore).

Kontrol:

```bash
git status -sb
```

### 2) Lint + Build (Push’tan önce)

```bash
npm run lint
npm run build
```

### 3) Dosyaları Stage Etme (Önerilen)

Her şeyi tek seferde eklemek yerine, önce sistem dosyalarını stage etmek daha güvenlidir:

```bash
git add .github .gitignore README.md package.json package-lock.json turbo.json playwright.config.ts
git add apps packages docs scripts e2e docker-compose.yml docker-compose.production.yml Dockerfile.*
```

Stage kontrol:

```bash
git status
git diff --cached
```

### 4) Commit ve Push

```bash
git commit -m "chore: ship latest changes"
git push origin main
```

Eğer push sırasında yetki hatası alırsanız:
- GitHub’da Personal Access Token (PAT) oluşturun
- GitHub Desktop veya Git Credential Manager ile giriş yapın

## Sunucuya Yükleme Rehberi (VPS / Docker Compose)

Bu bölüm “ilk canlı kurulum” için minimum adımları anlatır. (Detaylar projedeki `docker-compose.production.yml` ve `docs/PORT_CONFIGURATION.md` ile şekillenir.)

### 1) Sunucuda Hazırlık

- Docker + Docker Compose
- Domain + DNS (API, Admin, POS, Reseller subdomain’leri)
- PostgreSQL ve Redis (container veya managed)

### 2) Kurulum Akışı (Önerilen)

```bash
git clone https://github.com/hasanperto/nextpos.git
cd nextpos
npm install
```

Ortam değişkenleri:
- `apps/api/.env` üretim değerleri (DB/Redis/JWT/CORS/Stripe vb.)
- `.env.example` dosyalarını referans alın

Prod stack:

```bash
docker compose -f docker-compose.production.yml up -d --build
```

Portları env ile değiştirme (docker compose):

```bash
API_PORT=5000 POS_PORT=8080 docker compose -f docker-compose.production.yml up -d --build
```

Migration:

```bash
npm run db:migrate
```

### 3) Reverse Proxy + SSL (Nginx)

- 80/443 dışarı açık
- Uygulama container portları internal
- Let’s Encrypt (certbot) veya aaPanel üzerinden SSL

Not: QR Web Menu için aaPanel otomasyonu kullanılacaksa API tarafında `AAPANEL_*` environment değişkenleri gerekir.

## Sunucuya Yükleme Rehberi (VPS / aaPanel / Docker)

Sunucuya adım adım sıfırdan yükleme yapmak (aaPanel + Node.js yaklaşımı) için detaylı rehbere buradan ulaşabilirsiniz:
👉 [**Sunucu Kurulum Rehberi (Adım Adım)**](docs/SUNUCU_KURULUM_REHBERI.md)

Aşağıda mimari yaklaşımların kısa özetlerini bulabilirsiniz.

### Yaklaşım A (Önerilen): aaPanel + Host üzerinde Node (PM2) + Nginx

Bu modelde aaPanel Nginx’i yönetir. API Node (PM2) ile host üzerinde çalışır. Vite uygulamaları build edilip Nginx ile statik servis edilir. QR Web Menü otomasyonu için en uygun yöntemdir.

**Detaylı kurulum adımları için [Sunucu Kurulum Rehberi](docs/SUNUCU_KURULUM_REHBERI.md) dokümanını okuyun.**

**Önerilen domainler:**
- `posapi.example.com` → API (Node)
- `nextpos.example.com` → POS (statik)
- `posadmin.example.com` → SaaS Admin (statik)
- `posreseller.example.com` → Bayi (statik)
- `posmenu.example.com` → QR web menü parent domain (altında her restoran için ayrı subdomain)

**Önerilen portlar (host üzerinde):**
- API: `5000` (tamamı `apps/api/.env` içindeki `PORT` ile değişir; dışarıdan direkt açmak yerine Nginx reverse proxy ile)
- PostgreSQL: `5432` (dışarı açmayın)
- Redis: `6379` (dışarı açmayın)

#### 1) Sunucu hazırlığı

- aaPanel kurulu (Nginx seçili)
- Node.js >= 20 (aaPanel “App Store → Node.js” veya sistem paketi)
- PostgreSQL 16 + Redis 7 (aaPanel üzerinden veya Docker)
- PM2 (global): `npm i -g pm2`

#### 2) API prod ayarı (`apps/api/.env`)

Örnek:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://nextpos:nextpos@127.0.0.1:5432/nextpos
REDIS_URL=redis://127.0.0.1:6379

CORS_ORIGIN=https://nextpos.example.com,https://posadmin.example.com,https://posreseller.example.com
SOCKET_CORS_ORIGIN=https://nextpos.example.com,https://posadmin.example.com,https://posreseller.example.com
```

#### 3) Build + migration

```bash
cd /www/wwwroot/nextpos
npm ci
npm run build
cd apps/api
npx prisma migrate deploy
```

#### 4) API’yi PM2 ile ayağa kaldırma

```bash
cd /www/wwwroot/nextpos/apps/api
pm2 start dist/index.js --name nextpos-api
pm2 save
```

#### 5) aaPanel “Website” ile statik SPA’ları servis etme

Her domain için “Website → Add site”:
- `nextpos.example.com` root: `.../apps/pos/dist`
- `posadmin.example.com` root: `.../apps/admin/dist`
- `posreseller.example.com` root: `.../apps/reseller/dist`

SPA routing için Nginx rewrite (site conf içine):

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

API proxy (POS/Admin/Reseller domainleri içinde `/api` üzerinden):

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Socket.io (WebSocket) için ayrıca:

```nginx
location /socket.io/ {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "Upgrade";
  proxy_set_header Host $host;
}
```

#### 6) SSL

aaPanel → Website → ilgili domain → SSL → Let’s Encrypt ile sertifika alın.

### Yaklaşım B: Docker Compose + aaPanel sadece reverse proxy

Repo içindeki `docker-compose.production.yml` şu portları map ediyor:
- API: `${API_PORT:-3001}:3001` (container içi 3001, dış port env ile değişir)
- POS container: `${POS_PORT:-8080}:80` (dış port env ile değişir)

Bu modelde aaPanel Nginx reverse proxy ile:
- `posapi.example.com` → `http://127.0.0.1:${API_PORT}` (örn. `API_PORT=3001` ise `http://127.0.0.1:3001`)
- `nextpos.example.com` → `http://127.0.0.1:${POS_PORT}` (örn. `POS_PORT=8080` ise `http://127.0.0.1:8080`)

Bu yaklaşımda **QR Web aaPanel otomasyonu** (Nginx conf yazma + certbot çalıştırma) container içinden host’a erişemeyeceği için pratikte kapatılmalıdır:

```env
AAPANEL_QR_AUTOMATION_ENABLED=false
```

### QR Web aaPanel Otomasyonu (her restoran için ayrı QR domain)

Bu otomasyon, tenant açılınca QR web menü için domain klasörü + Nginx conf + SSL üretir. Çalışması için API prosesinin **host üzerinde** aşağıdaki kaynaklara erişmesi gerekir.

Domain mantığı:
- `QR_WEB_PARENT_DOMAIN=posmenu.example.com` ise her tenant için domain şu şekilde üretilir: `<label>.posmenu.example.com`
- `<label>` restoran adından türetilir, çakışmada sonuna sayı eklenir
- DNS tarafında `*.posmenu.example.com` wildcard A kaydı sunucu IP’sine yönlenmelidir

Zorunlu environment değişkenleri:

```env
AAPANEL_QR_AUTOMATION_ENABLED=true
AAPANEL_QR_WEB_ROOT=/www/wwwroot
AAPANEL_QR_TEMPLATE_DIR=/www/wwwroot/qr-web-template
AAPANEL_NGINX_CONF_DIR=/www/server/panel/vhost/nginx
AAPANEL_ACME_WEBROOT=/www/wwwroot/.well-known/acme-challenge
AAPANEL_QR_API_ORIGIN=https://posapi.example.com
AAPANEL_CERTBOT_EMAIL=admin@example.com
QR_WEB_PARENT_DOMAIN=posmenu.example.com
QR_WEB_SUBDOMAIN_PREFIX=
```

Opsiyonel:
- `AAPANEL_CERTBOT_BIN=certbot`
- `AAPANEL_NGINX_BIN=nginx`
- `AAPANEL_CERT_PATH_BASE=/etc/letsencrypt/live`
- `AAPANEL_QR_LOG_FILE=/www/wwwlogs/qr-web-automation.log`

Önemli notlar:
- `AAPANEL_QR_TEMPLATE_DIR` içindeki template, otomasyon tarafından yeni domain klasörüne kopyalanır.
- Nginx conf yazacağı için `AAPANEL_NGINX_CONF_DIR` yazılabilir olmalıdır.
- `certbot` ve `nginx` komutları host’ta çalışır olmalıdır.

## Komutlar

- `npm run dev`: tüm uygulamalar
- `npm run dev:api`: sadece API
- `npm run dev:pos`: sadece POS
- `npm run dev:admin`: sadece Admin
- `npm run dev:reseller`: sadece Bayi
- `npm run test:e2e`: Playwright E2E (api + pos)
