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

Migration:

```bash
npm run db:migrate
```

### 3) Reverse Proxy + SSL (Nginx)

- 80/443 dışarı açık
- Uygulama container portları internal
- Let’s Encrypt (certbot) veya aaPanel üzerinden SSL

Not: QR Web Menu için aaPanel otomasyonu kullanılacaksa API tarafında `AAPANEL_*` environment değişkenleri gerekir.

## Komutlar

- `npm run dev`: tüm uygulamalar
- `npm run dev:api`: sadece API
- `npm run dev:pos`: sadece POS
- `npm run dev:admin`: sadece Admin
- `npm run dev:reseller`: sadece Bayi
- `npm run test:e2e`: Playwright E2E (api + pos)
