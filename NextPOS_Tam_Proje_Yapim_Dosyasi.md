# 🚀 NextPOS — TAM PROJE YAPIM DOSYASI
**Yeni Nesil Hibrit Restoran Otomasyon Sistemi**

> **Sürüm:** 2.1 (Eksikler kapatıldı: i18n tabloları, RLS, ödeme/fiskal, API, sync, test örnekleri)
> **Tarih:** 28 Mart 2026
> **Temel Referans:** PizzaPOS (PHP/MySQL) → React + Node.js + PostgreSQL
> **Desteklenen Diller:** 🇩🇪 Almanca | 🇹🇷 Türkçe | 🇬🇧 İngilizce

---

## 📋 İÇİNDEKİLER

1. [Mevcut Planda Eksikler & Geliştirilmesi Gerekenler](#1-eksikler--geliştirmeler)
2. [Mimari & Teknoloji Yığını](#2-mimari--teknoloji-yığını)
3. [Klasör Yapısı (Monorepo)](#3-klasör-yapısı-monorepo)
4. [Veritabanı Şeması (Tam)](#4-veritabanı-şeması-tam)
5. [Modüller — Detaylı Özellik Listesi](#5-modüller--detaylı-özellik-listesi)
6. [API Endpoint Tasarımı (Tam)](#6-api-endpoint-tasarımı-tam)
7. [WebSocket Olay Haritası](#7-websocket-olay-haritası)
8. [Offline & Senkronizasyon Mimarisi](#8-offline--senkronizasyon-mimarisi)
9. [Test Stratejisi](#9-test-stratejisi)
10. [CI/CD & DevOps Pipeline](#10-cicd--devops-pipeline)
11. [Hata Yönetimi & Loglama](#11-hata-yönetimi--loglama)
12. [Performans & Ölçeklendirme](#12-performans--ölçeklendirme)
13. [Güvenlik Mimarisi (Detaylı)](#13-güvenlik-mimarisi-detaylı)
14. [SaaS Çok-Kiracılı (Multi-Tenant) Mimari](#14-saas-çok-kiracılı-multi-tenant-mimari)
15. [Donanım Entegrasyonu (Detaylı)](#15-donanım-entegrasyonu-detaylı)
16. [Çoklu Dil (i18n) Sistemi](#16-çoklu-dil-i18n-sistemi)
17. [UI/UX & Tema Sistemi](#17-uiux--tema-sistemi)
18. [Migrasyon Planı (PizzaPOS → NextPOS)](#18-migrasyon-planı)
19. [Geliştirme Yol Haritası (Detaylı Sprint Planı)](#19-geliştirme-yol-haritası)
20. [Geliştirici Ortamı Kurulum Kılavuzu](#20-geliştirici-ortamı-kurulum)

---

## 1. Eksikler & Geliştirmeler

### 🔴 KRİTİK EKSİKLER (Mevcut Planda Yoktu)

#### 1.1 Test Stratejisi — TAMAMEN EKSİKTİ
Mevcut planda hiç test mimarisi yoktu. Üretim kaliteli bir sistem için zorunludur:
- Unit test (Jest + Testing Library)
- Integration test (Supertest)
- E2E test (Playwright veya Cypress)
- Offline senaryo testleri

#### 1.2 CI/CD Pipeline — EKSİKTİ
Sadece "Docker Compose" dışında deployment detayı yoktu. Eklendi:
- GitHub Actions workflow tanımları
- Otomatik test, build, deploy adımları
- Rollback mekanizması

#### 1.3 Hata Yönetimi & Loglama — EKSİKTİ
Sistematik error handling ve log yönetimi hiç tanımlanmamıştı. Eklendi:
- Merkezi hata sınıflandırması
- Winston/Pino loglama
- Sentry entegrasyonu
- Alert mekanizmaları

#### 1.4 SaaS Multi-Tenant Mimari — YARIM KALMIŞTI
Planda SaaS admin paneli ve URL'leri vardı ama mimari detay yoktu. Eklendi:
- Tenant izolasyon stratejisi (Row-level Security)
- Abonelik planları ve faturalama
- Tenant yönetim API'leri

#### 1.5 Performans & Ölçeklendirme — EKSİKTİ
Yük altında sistemin nasıl davranacağı tanımsızdı. Eklendi:
- Redis cache stratejisi
- Database connection pooling
- Horizontal scaling rehberi

#### 1.6 Detaylı Donanım Entegrasyonu — EKSİKTİ
"ESC/POS protokolü" dışında hiçbir detay yoktu. Eklendi:
- Yazıcı bağlantı mimarisi (USB/Network/Bluetooth)
- Para çekmecesi tetikleme
- Barkod/QR okuyucu entegrasyon kodu
- Müşteri ekranı (customer display) protokolü

#### 1.7 Rate Limiting & API Throttling — TAMAMLANDI (Bkz. §13.1 + aşağı)
**Uygulama özeti:** NestJS `@nestjs/throttler` veya `@fastify/rate-limit` ile IP + kullanıcı başına limit; Redis store ile çoklu instance tutarlılığı.

```typescript
// apps/api/src/app.module.ts — örnek
ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60000, limit: 100 }],
  storage: new ThrottlerStorageRedisService(redis),
});
// Controller: @Throttle({ default: { limit: 30, ttl: 60000 } })
// Auth endpoint: ayrı katı limit (ör. 5/dk) — §13.1 Brute force ile uyumlu
```

#### 1.8 Backup & Disaster Recovery — TAMAMLANDI (Bkz. §10.3 + §11.3)

| Hedef | Değer | Not |
|--------|--------|-----|
| **RPO** (kabul edilebilir veri kaybı) | ≤ 24 saat | Günlük `pg_dump` + saatlik kritik tablolar (opsiyonel WAL) |
| **RTO** (ne kadar sürede ayağa kalkmalı) | ≤ 4 saat | Docker compose + son yedek + `migrate deploy` |
| Yedek saklama | 7 gün yerel + 30 gün S3/Object Storage | Şifreli bucket, farklı bölge (opsiyonel) |
| Kurtarma testi | Aylık | Staging’de yedekten restore script’i |

### 🟡 GELİŞTİRİLMESİ GEREKENLER (Dokümante edildi)

#### 1.9 Geliştirme Yol Haritası — ÇOK YÜZEYSEL
Sadece faz listesi vardı, sprint detayları ve bağımlılıklar yoktu. **§19** altında sprint checklist ile genişletildi.

#### 1.10 Klasör Yapısı — EKSİKTİ
Monorepo içindeki dosya organizasyonu hiç tanımlanmamıştı. **§3** ile tanımlandı.

#### 1.11 Environment Variables & Konfigürasyon — EKSİKTİ
**§20.1** `.env.example` şablonu ile tamamlandı; `Zod`/`Joi` ile `config/validation.ts` önerilir.

#### 1.12 Ödeme Sistemi & Fiskalizasyon — TAMAMLANDI (detay)

**Kart / online ödeme (Stripe):**
1. `POST /payments/stripe/intent` → `PaymentIntent` (amount, currency EUR, metadata: `orderId`, `tenantId`).
2. POS/QR ön yüz Stripe.js ile onaylar → `POST /payments/stripe/confirm`.
3. Webhook: `POST /webhooks/stripe` (imza doğrulama `STRIPE_WEBHOOK_SECRET`) → ödeme kaydı `completed`, Socket `order:status`.
4. İade: Stripe Refund API + `POST /payments/:id/refund` ile mutabakat.

**PayPal / yerel POS sağlayıcıları:** Aynı kalıp — `provider` alanı + webhook endpoint’leri; abonelik faturaları için Stripe Billing önerilir (SaaS planları).

**Almanya (KassenSichV / Kassengesetz):**
- **TSE** zorunlu: `orders.tss_signature`, `payments.tss_signature`, `z_reports.tss_signature` alanları doldurulur.
- **DSFinV‑K** export: vergi denetimi için yıllık/aylık dosya üretimi (ayrı batch job).
- Ürün **MwSt.**: `tax_class` / `tax_rate` ile %7 ve %19 ayrımı; Z raporunda `tax_7_*` / `tax_19_*` alanları.
- **Not:** TSE SDK/donanım (Swissbit, Epson vb.) üretici dokümanına göre `apps/api/src/modules/fiscal/` modülünde sarılır.

---

## 2. Mimari & Teknoloji Yığını

### 2.1 Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BULUT (VPS / K8s)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  PostgreSQL   │  │   NestJS     │  │     Socket.io Server    │  │
│  │  + pgBouncer  │◄─┤  REST API    │◄─┤  (Gerçek Zamanlı WS)   │  │
│  │  (pool)       │  │  (Auth/RBAC) │  └─────────┬───────────────┘  │
│  └──────────────┘  └──────┬───────┘            │                  │
│                           │                    │                  │
│  ┌──────────────┐  ┌──────┴────────┐           │                  │
│  │    Redis      │  │  Bull Queue   │           │                  │
│  │  (cache/pub)  │  │  (async jobs) │           │                  │
│  └──────────────┘  └──────────────┘            │                  │
└───────────────────────────┼───────────────────┼──────────────────┘
                            │ HTTPS/WSS (TLS)   │
        ┌───────────────────┼───────────────────┼────────────────┐
        │              RESTORAN YEREL AĞI (Wi-Fi / LAN)          │
        │                                                        │
  ┌─────┴──────┐  ┌────────┴───┐  ┌──────────┐  ┌───────────┐  │
  │  KASİYER   │  │   GARSON   │  │  MUTFAK  │  │  MÜŞTERİ  │  │
  │  React SPA │  │  PWA/Tab.  │  │ KDS Ekran│  │  QR Menü  │  │
  │ IndexedDB  │  │ IndexedDB  │  │ Socket.io│  │  Next.js  │  │
  └─────┬──────┘  └────────────┘  └──────────┘  └───────────┘  │
        │                                                        │
  ┌─────┴──────┐  ┌────────────┐  ┌──────────────────────────┐  │
  │  KURYE     │  │  ADMİN     │  │   DONANIM KATMANI        │  │
  │  Mobil PWA │  │  React SPA │  │  Yazıcı/Para Çekm./Ekran │  │
  └────────────┘  └────────────┘  └──────────────────────────┘  │
        └────────────────────────────────────────────────────────┘
```

### 2.2 Teknoloji Yığını

| Katman | Teknoloji | Sürüm | Gerekçe |
|--------|-----------|-------|---------|
| **Frontend** | React.js + Vite | 18+ / 5+ | SPA, hızlı HMR, component bazlı |
| **Müşteri QR** | Next.js | 14+ | SSR/ISR ile hızlı yükleme, SEO |
| **Mobil/Tablet** | PWA (React) | — | Kiosk modu, offline, native hissi |
| **Backend** | Node.js + NestJS | 20 LTS | TypeScript, modüler, güçlü DI, dekoratörler |
| **Gerçek Zamanlı** | Socket.io | 4+ | WebSocket + fallback, room/namespace desteği |
| **DB (Bulut)** | PostgreSQL | 16+ | JSONB, RLS (Row-Level Security), güçlü raporlama |
| **DB (Yerel)** | IndexedDB + Dexie.js | 4+ | Tarayıcıda offline veri |
| **Cache** | Redis | 7+ | Oturum cache, pub/sub, Bull queue backend |
| **Queue** | BullMQ | 5+ | Async job'lar (yazıcı, email, sync) |
| **State** | Zustand | 4+ | Hafif global state |
| **UI** | Shadcn/ui + Tailwind | — | Erişilebilir, özelleştirilebilir |
| **Grafikler** | Recharts | 2+ | React-native grafik |
| **Auth** | JWT (Access + Refresh) | — | Stateless, 48 saat offline desteği |
| **ORM** | Prisma | 5+ | Type-safe DB erişimi, migration yönetimi |
| **Yazıcı** | ESC/POS + node-escpos | — | Termal yazıcı |
| **i18n** | react-i18next | 23+ | Namespace bazlı çeviri |
| **Test** | Jest + Playwright | — | Unit + E2E |
| **Monitoring** | Sentry + Pino + Grafana | — | Hata takibi + metrikler |
| **CI/CD** | GitHub Actions + Docker | — | Otomatik pipeline |

---

## 3. Klasör Yapısı (Monorepo)

```
nextpos/                            # Monorepo kökü
├── package.json                    # Root workspace
├── turbo.json                      # Turborepo konfigürasyonu
├── docker-compose.yml              # Geliştirme ortamı
├── docker-compose.prod.yml         # Prodüksiyon
├── .env.example                    # Tüm env değişkenleri şablonu
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Test + lint
│       └── deploy.yml              # Build + deploy
│
├── apps/
│   ├── pos/                        # Kasiyer & yönetim SPA (React + Vite)
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── pages/
│   │   │   │   ├── CashierPage.tsx
│   │   │   │   ├── AdminPage.tsx
│   │   │   │   └── LoginPage.tsx
│   │   │   ├── modules/
│   │   │   │   ├── cashier/        # Kasiyer modülü
│   │   │   │   ├── waiter/         # Garson modülü
│   │   │   │   ├── kitchen/        # Mutfak KDS
│   │   │   │   ├── courier/        # Kurye modülü
│   │   │   │   └── admin/          # Admin paneli
│   │   │   ├── components/
│   │   │   │   ├── ui/             # Shadcn bileşenleri
│   │   │   │   ├── layout/
│   │   │   │   ├── printing/       # Yazıcı bileşenleri
│   │   │   │   └── shared/
│   │   │   ├── store/              # Zustand store'ları
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── orderStore.ts
│   │   │   │   ├── tableStore.ts
│   │   │   │   └── settingsStore.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useSocket.ts
│   │   │   │   ├── useOffline.ts
│   │   │   │   ├── usePrinter.ts
│   │   │   │   └── useSync.ts
│   │   │   ├── services/
│   │   │   │   ├── api.ts          # Axios instance + interceptor
│   │   │   │   ├── socket.ts       # Socket.io client
│   │   │   │   ├── db.ts           # Dexie.js IndexedDB
│   │   │   │   ├── printer.ts      # ESC/POS yazıcı
│   │   │   │   └── sync.ts         # Offline sync yöneticisi
│   │   │   ├── i18n/
│   │   │   │   └── config.ts
│   │   │   └── locales/
│   │   │       ├── de/
│   │   │       ├── tr/
│   │   │       └── en/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── qrmenu/                     # Müşteri QR menü (Next.js)
│   │   ├── app/
│   │   │   ├── [lang]/
│   │   │   │   └── menu/
│   │   │   │       └── [tableId]/
│   │   │   │           └── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── api/                        # Backend (NestJS)
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── config/
│       │   │   ├── configuration.ts
│       │   │   └── validation.ts
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   │   ├── auth.module.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── strategies/
│       │   │   │   │   ├── jwt.strategy.ts
│       │   │   │   │   └── refresh.strategy.ts
│       │   │   │   └── guards/
│       │   │   │       ├── jwt-auth.guard.ts
│       │   │   │       └── roles.guard.ts
│       │   │   ├── menu/
│       │   │   ├── orders/
│       │   │   ├── tables/
│       │   │   ├── kitchen/
│       │   │   ├── payments/
│       │   │   ├── customers/
│       │   │   ├── deliveries/
│       │   │   ├── reports/
│       │   │   ├── sync/
│       │   │   ├── websocket/
│       │   │   │   └── events.gateway.ts
│       │   │   ├── printing/
│       │   │   │   └── print-queue.service.ts
│       │   │   └── tenants/        # SaaS multi-tenant
│       │   ├── common/
│       │   │   ├── filters/        # Global exception filter
│       │   │   ├── interceptors/   # Logging, transform
│       │   │   ├── decorators/     # Custom decorators
│       │   │   ├── pipes/          # Validation pipes
│       │   │   └── middleware/     # Rate limiting, etc.
│       │   ├── database/
│       │   │   ├── prisma.service.ts
│       │   │   └── migrations/
│       │   └── queue/
│       │       ├── print.processor.ts
│       │       └── sync.processor.ts
│       ├── prisma/
│       │   └── schema.prisma       # Prisma şeması
│       ├── test/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── e2e/
│       ├── Dockerfile
│       └── package.json
│
└── packages/                       # Paylaşılan paketler
    ├── shared-types/               # TypeScript tipleri (tüm apps'te kullanılır)
    │   ├── src/
    │   │   ├── order.types.ts
    │   │   ├── user.types.ts
    │   │   ├── menu.types.ts
    │   │   └── socket.types.ts
    │   └── package.json
    ├── ui/                         # Paylaşılan UI bileşenleri
    └── escpos/                     # ESC/POS yazıcı kütüphanesi
```

---

## 4. Veritabanı Şeması (Tam)

### 4.1 Temel Tablolar

```sql
-- ═══════════════════════════════════════
-- TENANT (SaaS Çok Kiracılı)
-- ═══════════════════════════════════════

CREATE TABLE tenants (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(50) UNIQUE NOT NULL,   -- 'ozperto-pizza'
  name          VARCHAR(100) NOT NULL,
  plan          VARCHAR(20) DEFAULT 'starter'
                CHECK (plan IN ('starter','professional','enterprise')),
  status        VARCHAR(20) DEFAULT 'active'
                CHECK (status IN ('active','suspended','trial','cancelled')),
  trial_ends_at TIMESTAMPTZ,
  billing_email VARCHAR(100),
  stripe_customer_id VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- KULLANICI & YETKİLENDİRME
-- ═══════════════════════════════════════

CREATE TABLE branches (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  address       TEXT,
  phone         VARCHAR(20),
  tax_number    VARCHAR(30),             -- Almanya: Steuernummer
  ustid         VARCHAR(20),             -- Almanya: Umsatzsteuer-ID (USt-IdNr.)
  tss_client_id VARCHAR(100),            -- KassenSichV TSE client ID (Almanya için)
  license_key   VARCHAR(255) UNIQUE,
  license_expiry TIMESTAMPTZ,
  is_online     BOOLEAN DEFAULT true,
  last_sync     TIMESTAMPTZ,
  default_language VARCHAR(5) DEFAULT 'de',
  supported_languages TEXT[] DEFAULT '{de,tr,en}',
  currency      VARCHAR(3) DEFAULT 'EUR',
  tax_rate      DECIMAL(5,2) DEFAULT 19.00,  -- MwSt. %19 (Almanya)
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     INTEGER REFERENCES branches(id),
  username      VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL
                CHECK (role IN ('superadmin','admin','manager','cashier','waiter','kitchen','courier')),
  pin_code      VARCHAR(6),
  avatar_url    VARCHAR(255),
  preferred_language VARCHAR(5) DEFAULT 'de',
  status        VARCHAR(20) DEFAULT 'active'
                CHECK (status IN ('active','inactive','suspended')),
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, username)
);

CREATE TABLE refresh_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(255) NOT NULL,
  device_info   TEXT,
  ip_address    INET,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- MENÜ YÖNETİMİ
-- ═══════════════════════════════════════

CREATE TABLE categories (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     INTEGER REFERENCES branches(id),
  name          VARCHAR(100) NOT NULL,
  translations  JSONB DEFAULT '{"de":"","tr":"","en":""}',
  icon          VARCHAR(50) DEFAULT 'utensils',
  image_url     VARCHAR(255),
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     INTEGER REFERENCES branches(id),
  category_id   INTEGER REFERENCES categories(id),
  sku           VARCHAR(50),
  barcode       VARCHAR(50),
  name          VARCHAR(150) NOT NULL,
  translations  JSONB DEFAULT '{"de":{"name":"","description":""},"tr":{"name":"","description":""},"en":{"name":"","description":""}}',
  description   TEXT,
  base_price    DECIMAL(10,2) NOT NULL,
  image_url     VARCHAR(255),
  is_active     BOOLEAN DEFAULT true,
  is_available  BOOLEAN DEFAULT true,  -- Stok/günlük durumu
  prep_time_min INTEGER DEFAULT 15,
  allergens     TEXT[],                -- ['gluten','lactose','nuts']
  allergen_data JSONB,                 -- Almanya: detaylı alerjen bilgisi
  nutritional   JSONB,
  sort_order    INTEGER DEFAULT 0,
  tax_class     VARCHAR(20) DEFAULT 'standard',  -- 'standard'(19%), 'reduced'(7%) - Almanya
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_variants (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER REFERENCES products(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  translations  JSONB DEFAULT '{"de":"","tr":"","en":""}',
  price         DECIMAL(10,2) NOT NULL,
  sku           VARCHAR(50),
  sort_order    INTEGER DEFAULT 0,
  is_default    BOOLEAN DEFAULT false
);

CREATE TABLE modifier_groups (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id),
  name          VARCHAR(100) NOT NULL,           -- 'Saus Seçimi', 'Ekstra Malzeme'
  translations  JSONB DEFAULT '{"de":"","tr":"","en":""}',
  min_select    INTEGER DEFAULT 0,
  max_select    INTEGER DEFAULT 1,
  is_required   BOOLEAN DEFAULT false
);

CREATE TABLE modifiers (
  id            SERIAL PRIMARY KEY,
  group_id      INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
  tenant_id     INTEGER REFERENCES tenants(id),
  name          VARCHAR(100) NOT NULL,
  translations  JSONB DEFAULT '{"de":"","tr":"","en":""}',
  price         DECIMAL(10,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE product_modifier_groups (
  product_id    INTEGER REFERENCES products(id) ON DELETE CASCADE,
  group_id      INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order    INTEGER DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

-- ═══════════════════════════════════════
-- STOK YÖNETİMİ (YENİ — Mevcut planda yoktu)
-- ═══════════════════════════════════════

CREATE TABLE inventory_items (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id),
  branch_id     INTEGER REFERENCES branches(id),
  name          VARCHAR(100) NOT NULL,
  unit          VARCHAR(20),             -- 'kg', 'L', 'adet'
  current_stock DECIMAL(10,3) DEFAULT 0,
  min_stock     DECIMAL(10,3) DEFAULT 0,
  cost_per_unit DECIMAL(10,2),
  supplier      VARCHAR(100),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_ingredients (
  product_id    INTEGER REFERENCES products(id) ON DELETE CASCADE,
  item_id       INTEGER REFERENCES inventory_items(id),
  quantity      DECIMAL(10,3) NOT NULL,   -- Bu üründen kaç birim düşer
  PRIMARY KEY (product_id, item_id)
);

CREATE TABLE stock_movements (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  item_id       INTEGER REFERENCES inventory_items(id),
  type          VARCHAR(20) CHECK (type IN ('in','out','adjustment','waste')),
  quantity      DECIMAL(10,3) NOT NULL,
  reference_id  INTEGER,                 -- order_id veya manual
  notes         TEXT,
  user_id       INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- RESTORAN DÜZENI
-- ═══════════════════════════════════════

CREATE TABLE sections (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  name          VARCHAR(100) NOT NULL,
  floor         INTEGER DEFAULT 0,
  layout_data   JSONB,
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE tables (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  section_id    INTEGER REFERENCES sections(id),
  name          VARCHAR(50) NOT NULL,
  capacity      INTEGER DEFAULT 4,
  shape         VARCHAR(20) DEFAULT 'square',
  position_x    INTEGER,
  position_y    INTEGER,
  width         INTEGER DEFAULT 60,
  height        INTEGER DEFAULT 60,
  qr_code       VARCHAR(255),
  qr_secret     VARCHAR(50),             -- QR doğrulama için gizli anahtar
  status        VARCHAR(20) DEFAULT 'available'
                CHECK (status IN ('available','occupied','reserved','waiting_order','bill_requested','cleaning')),
  current_session_id INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- MÜŞTERİ YÖNETİMİ (CRM)
-- ═══════════════════════════════════════

CREATE TABLE customers (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants(id),
  customer_code   VARCHAR(20) UNIQUE,
  name            VARCHAR(100) NOT NULL,
  phone           VARCHAR(20),
  email           VARCHAR(100),
  personal_qr     VARCHAR(255) UNIQUE,
  tier            VARCHAR(20) DEFAULT 'bronze'
                  CHECK (tier IN ('bronze','silver','gold','platinum')),
  points          INTEGER DEFAULT 0,
  total_visits    INTEGER DEFAULT 0,
  total_spent     DECIMAL(12,2) DEFAULT 0,
  last_visit      TIMESTAMPTZ,
  favorite_products INTEGER[],
  allergies       TEXT[],
  birthday        DATE,                  -- Doğum günü kampanyaları için
  notes           TEXT,
  preferred_language VARCHAR(5) DEFAULT 'de',
  gdpr_consent    BOOLEAN DEFAULT false, -- KVKK/GDPR onayı (AB için zorunlu)
  gdpr_consent_date TIMESTAMPTZ,
  marketing_opt_in BOOLEAN DEFAULT false,
  is_blacklisted  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_addresses (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  label         VARCHAR(50),
  address       TEXT NOT NULL,
  district      VARCHAR(100),
  city          VARCHAR(50),
  postal_code   VARCHAR(10),
  country_code  VARCHAR(2) DEFAULT 'DE',
  lat           DECIMAL(10,8),
  lng           DECIMAL(11,8),
  is_default    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- SİPARİŞ YÖNETİMİ
-- ═══════════════════════════════════════

CREATE TABLE table_sessions (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  table_id      INTEGER REFERENCES tables(id),
  customer_id   INTEGER REFERENCES customers(id),
  guest_name    VARCHAR(100),
  guest_count   INTEGER DEFAULT 1,
  waiter_id     INTEGER REFERENCES users(id),
  status        VARCHAR(20) DEFAULT 'active'
                CHECK (status IN ('active','bill_requested','paid','cancelled')),
  opened_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  notes         TEXT
);

CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants(id),
  branch_id       INTEGER REFERENCES branches(id),
  session_id      INTEGER REFERENCES table_sessions(id),
  table_id        INTEGER REFERENCES tables(id),
  customer_id     INTEGER REFERENCES customers(id),
  waiter_id       INTEGER REFERENCES users(id),
  cashier_id      INTEGER REFERENCES users(id),
  order_type      VARCHAR(20) DEFAULT 'dine_in'
                  CHECK (order_type IN ('dine_in','takeaway','delivery','web','phone','qr_menu')),
  source          VARCHAR(20) DEFAULT 'cashier'
                  CHECK (source IN ('cashier','waiter','customer_qr','web','phone')),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','preparing','ready','served','completed','cancelled')),
  payment_status  VARCHAR(20) DEFAULT 'unpaid'
                  CHECK (payment_status IN ('unpaid','partial','paid','refunded')),
  order_number    VARCHAR(20),           -- Günlük sıra no: ORD-0001
  subtotal        DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  discount_type   VARCHAR(20),
  discount_reason TEXT,
  tax_amount      DECIMAL(10,2) DEFAULT 0,
  tax_rate        DECIMAL(5,2),          -- %7 veya %19 (Almanya)
  total_amount    DECIMAL(10,2) DEFAULT 0,
  is_urgent       BOOLEAN DEFAULT false,
  is_split_bill   BOOLEAN DEFAULT false,
  points_earned   INTEGER DEFAULT 0,
  points_redeemed INTEGER DEFAULT 0,
  notes           TEXT,
  delivery_address TEXT,
  delivery_phone  VARCHAR(20),
  courier_id      INTEGER REFERENCES users(id),
  estimated_ready TIMESTAMPTZ,
  tss_signature   TEXT,                  -- KassenSichV TSE imzası (Almanya)
  tss_transaction_no VARCHAR(50),        -- TSE işlem numarası
  offline_id      VARCHAR(50),
  synced          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id),
  variant_id    INTEGER REFERENCES product_variants(id),
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    DECIMAL(10,2) NOT NULL,
  total_price   DECIMAL(10,2) NOT NULL,
  modifiers     JSONB DEFAULT '[]',
  notes         TEXT,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','sent_to_kitchen','preparing','ready','served','cancelled')),
  kitchen_station VARCHAR(50),          -- 'hot','cold','bar' — birden fazla istasyon
  kitchen_printed BOOLEAN DEFAULT false,
  voided        BOOLEAN DEFAULT false,
  void_reason   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- MUTFAK SİSTEMİ (KDS)
-- ═══════════════════════════════════════

CREATE TABLE kitchen_stations (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  name          VARCHAR(50) NOT NULL,   -- 'Ana Mutfak', 'Bar', 'Soğuk Mutfak'
  code          VARCHAR(20) NOT NULL,   -- 'hot', 'cold', 'bar'
  display_color VARCHAR(7),             -- '#EF4444'
  is_active     BOOLEAN DEFAULT true
);

CREATE TABLE kitchen_tickets (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER REFERENCES orders(id),
  station_id    INTEGER REFERENCES kitchen_stations(id),
  branch_id     INTEGER REFERENCES branches(id),
  table_name    VARCHAR(50),
  waiter_name   VARCHAR(100),
  order_type    VARCHAR(20),
  status        VARCHAR(20) DEFAULT 'waiting'
                CHECK (status IN ('waiting','preparing','ready','completed','cancelled')),
  priority      INTEGER DEFAULT 0,
  is_urgent     BOOLEAN DEFAULT false,
  ticket_number INTEGER,
  items         JSONB NOT NULL,
  started_at    TIMESTAMPTZ,
  ready_at      TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  prep_duration INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- ÖDEME SİSTEMİ
-- ═══════════════════════════════════════

CREATE TABLE payments (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants(id),
  branch_id       INTEGER REFERENCES branches(id),
  order_id        INTEGER REFERENCES orders(id),
  session_id      INTEGER REFERENCES table_sessions(id),
  amount          DECIMAL(10,2) NOT NULL,
  method          VARCHAR(20) NOT NULL
                  CHECK (method IN ('cash','card','online','voucher','split','loyalty_points')),
  status          VARCHAR(20) DEFAULT 'completed'
                  CHECK (status IN ('pending','completed','failed','refunded')),
  tip_amount      DECIMAL(10,2) DEFAULT 0,
  change_amount   DECIMAL(10,2) DEFAULT 0,
  received_amount DECIMAL(10,2),
  reference       VARCHAR(100),          -- Kart slip no / online ref
  stripe_payment_intent VARCHAR(100),    -- Stripe entegrasyonu
  cashier_id      INTEGER REFERENCES users(id),
  receipt_number  VARCHAR(20),           -- Z-raporu bazlı fiş numarası
  tss_signature   TEXT,                  -- KassenSichV (Almanya)
  notes           TEXT,
  offline_id      VARCHAR(50),
  synced          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refunds (
  id            SERIAL PRIMARY KEY,
  payment_id    INTEGER REFERENCES payments(id),
  order_id      INTEGER REFERENCES orders(id),
  amount        DECIMAL(10,2) NOT NULL,
  reason        TEXT,
  processed_by  INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- TESLİMAT & KURYE
-- ═══════════════════════════════════════

CREATE TABLE delivery_zones (
  id              SERIAL PRIMARY KEY,
  branch_id       INTEGER REFERENCES branches(id),
  name            VARCHAR(100),
  min_order       DECIMAL(10,2) DEFAULT 0,
  delivery_fee    DECIMAL(10,2) DEFAULT 0,
  free_delivery_above DECIMAL(10,2),   -- Bu tutarın üstünde ücretsiz
  est_minutes     INTEGER DEFAULT 30,
  polygon         JSONB,
  is_active       BOOLEAN DEFAULT true
);

CREATE TABLE deliveries (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER REFERENCES orders(id),
  courier_id      INTEGER REFERENCES users(id),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','assigned','picked_up','on_the_way','delivered','returned','cancelled')),
  address         TEXT,
  phone           VARCHAR(20),
  customer_name   VARCHAR(100),
  lat             DECIMAL(10,8),
  lng             DECIMAL(11,8),
  estimated_time  INTEGER,
  actual_time     INTEGER,
  delivery_notes  TEXT,
  payment_collected VARCHAR(20),
  courier_lat     DECIMAL(10,8),        -- Anlık kurye konumu
  courier_lng     DECIMAL(11,8),
  location_updated_at TIMESTAMPTZ,
  assigned_at     TIMESTAMPTZ,
  picked_at       TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- GARSON ÇAĞRI & BİLDİRİM
-- ═══════════════════════════════════════

CREATE TABLE service_calls (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  table_id      INTEGER REFERENCES tables(id),
  session_id    INTEGER REFERENCES table_sessions(id),
  call_type     VARCHAR(30) NOT NULL
                CHECK (call_type IN ('call_waiter','clear_table','request_bill','request_bill_cash','request_bill_card','water','custom')),
  message       TEXT,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','seen','in_progress','completed')),
  responded_by  INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  responded_at  TIMESTAMPTZ
);

-- ═══════════════════════════════════════
-- RAPORLAMA & FİSKALİZASYON (Almanya KassenSichV)
-- ═══════════════════════════════════════

CREATE TABLE z_reports (
  id              SERIAL PRIMARY KEY,
  branch_id       INTEGER REFERENCES branches(id),
  cashier_id      INTEGER REFERENCES users(id),
  z_number        INTEGER NOT NULL,     -- Şube bazlı sıra (1,2,3… — uygulama atar)
  report_date     DATE NOT NULL,
  total_orders    INTEGER DEFAULT 0,
  total_revenue   DECIMAL(12,2) DEFAULT 0,
  cash_total      DECIMAL(12,2) DEFAULT 0,
  card_total      DECIMAL(12,2) DEFAULT 0,
  online_total    DECIMAL(12,2) DEFAULT 0,
  tax_7_base      DECIMAL(12,2) DEFAULT 0,  -- %7 KDV matrahı (Almanya)
  tax_7_amount    DECIMAL(12,2) DEFAULT 0,
  tax_19_base     DECIMAL(12,2) DEFAULT 0,  -- %19 KDV matrahı
  tax_19_amount   DECIMAL(12,2) DEFAULT 0,
  discount_total  DECIMAL(10,2) DEFAULT 0,
  refund_total    DECIMAL(10,2) DEFAULT 0,
  cancelled_count INTEGER DEFAULT 0,
  avg_order_value DECIMAL(10,2) DEFAULT 0,
  top_products    JSONB,
  hourly_data     JSONB,
  opening_cash    DECIMAL(10,2),
  closing_cash    DECIMAL(10,2),
  tss_signature   TEXT,                 -- TSE Z-raporu imzası (Almanya)
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  UNIQUE(branch_id, z_number)
);

CREATE TABLE daily_summaries (
  id              SERIAL PRIMARY KEY,
  branch_id       INTEGER REFERENCES branches(id),
  report_date     DATE NOT NULL,
  total_orders    INTEGER DEFAULT 0,
  total_revenue   DECIMAL(12,2) DEFAULT 0,
  data            JSONB,                -- Detaylı özet verisi
  UNIQUE(branch_id, report_date)
);

CREATE TABLE point_history (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER REFERENCES customers(id),
  branch_id     INTEGER REFERENCES branches(id),
  points        INTEGER NOT NULL,
  type          VARCHAR(20) CHECK (type IN ('earn','redeem','expire','adjust','bonus')),
  reference_id  INTEGER,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- OFFLİNE SENKRONIZASYON
-- ═══════════════════════════════════════

CREATE TABLE sync_queue (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  entity_type   VARCHAR(50) NOT NULL,
  entity_id     VARCHAR(50),
  action        VARCHAR(20) CHECK (action IN ('create','update','delete')),
  payload       JSONB NOT NULL,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','processing','synced','failed')),
  priority      INTEGER DEFAULT 0,
  retry_count   INTEGER DEFAULT 0,
  max_retries   INTEGER DEFAULT 5,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  synced_at     TIMESTAMPTZ
);

-- ═══════════════════════════════════════
-- AUDIT LOG (YENİ — Mevcut planda yoktu)
-- ═══════════════════════════════════════

CREATE TABLE audit_logs (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id),
  branch_id     INTEGER REFERENCES branches(id),
  user_id       INTEGER REFERENCES users(id),
  action        VARCHAR(50) NOT NULL,   -- 'order.create', 'payment.void', 'user.login'
  entity_type   VARCHAR(50),
  entity_id     INTEGER,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- INDEX'LER
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(created_at DESC);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_branch ON orders(branch_id);
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_kitchen_status ON kitchen_tickets(status, branch_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_service_calls_status ON service_calls(status, branch_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(status, priority DESC);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_products_branch ON products(branch_id, is_active);

-- ÇOKLU DİL & ADİSYON ŞABLONLARI (DB tarafı — isteğe bağlı cache ile birlikte)
CREATE TABLE languages (
  code          VARCHAR(5) PRIMARY KEY,
  name          VARCHAR(50) NOT NULL,
  native_name   VARCHAR(50) NOT NULL,
  flag_emoji    VARCHAR(10),
  direction     VARCHAR(3) DEFAULT 'ltr',
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0
);

INSERT INTO languages (code, name, native_name, flag_emoji, sort_order) VALUES
  ('de', 'Almanca', 'Deutsch', '🇩🇪', 1),
  ('tr', 'Türkçe', 'Türkçe', '🇹🇷', 2),
  ('en', 'İngilizce', 'English', '🇬🇧', 3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE ui_translations (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  namespace     VARCHAR(50) NOT NULL,
  key           VARCHAR(200) NOT NULL,
  lang          VARCHAR(5) REFERENCES languages(code),
  value         TEXT NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, namespace, key, lang)
);

CREATE TABLE receipt_templates (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  lang          VARCHAR(5) REFERENCES languages(code),
  header_text   TEXT,
  footer_text   TEXT,
  tax_label     VARCHAR(50),
  subtotal_label VARCHAR(50),
  total_label   VARCHAR(50),
  payment_labels JSONB,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, lang)
);

CREATE INDEX idx_ui_translations_lookup ON ui_translations(tenant_id, namespace, lang);

-- ROW LEVEL SECURITY (Multi-tenant izolasyon)
-- Her istekte: SET LOCAL app.tenant_id = '<jwt tenant_id>'; (Prisma $executeRaw veya transaction hook)

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_orders ON orders
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::integer)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::integer);

CREATE POLICY tenant_isolation_payments ON payments
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::integer)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::integer);

CREATE POLICY tenant_isolation_customers ON customers
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::integer)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::integer);

-- Not: Superadmin veya migration için BYPASSRLS rolü / service role bağlantısı kullanın.
-- app.tenant_id her istekte transaction içinde SET LOCAL ile atanmalıdır.
```

**Uygulama notları (migration / Prisma):**
- `customers.customer_code` için üretimde **`UNIQUE (tenant_id, customer_code)`** önerilir (kiracılar arası çakışmayı önler).
- `languages` seed tekrar çalıştırılabilsin diye: `INSERT ... ON CONFLICT (code) DO UPDATE` veya `DO NOTHING`.
- `z_reports`: şube başına `z_number` artışı transaction + `SELECT ... FOR UPDATE` veya sıra tablosu ile üretilmelidir.
- Prisma şemasında PostgreSQL `INET` tipi gerekirse `Unsupported("inet")` veya metin olarak saklanabilir.

---

## 5. Modüller — Detaylı Özellik Listesi

### 5.1 Kasiyer Ekranı

**Temel İşlevler:**
- Masa grid + görsel kat planı (sürükle-bırak editörü)
- Sipariş oluşturma: kategori + ürün + boyut + modifikasyon
- Nakit/Kart/Online/Voucher/Puan ödeme
- Para üstü hesaplama
- Hesap bölme (ürün bazlı + kişi bazlı)
- Masa taşıma + birleştirme
- İndirim/kupon uygulama
- ESC/POS termal yazıcı ile fiş/adisyon
- Garson çağrı bildirimleri (Socket.io)
- Offline çalışma (48 saat, IndexedDB)
- Hızlı PIN ile giriş/çıkış
- Paket servis + kurye atama
- Çoklu dil (DE/TR/EN)

**Kasa Yönetimi:**
- Günlük kasa açma (açılış kasası sayımı)
- Kasa kapama + Z raporu
- Gün içi X raporu
- Para çekmecesi kontrolü

**Yeni Eklenenler (Mevcut planda yoktu):**
- Stok uyarısı: Ürün tükenince ekranda görünür
- Bekleyen online siparişler bildirimi
- GDPR-uyumlu müşteri silme talebi yönetimi

### 5.2 Garson Ekranı (Tablet PWA)

**Temel İşlevler:**
- Renk kodlu görsel kat planı
- Masa başında sipariş alma
- QR okutma ile müşteri tanıma
- Bildirim merkezi (mutfak hazır, müşteri çağrısı, yeni sipariş talebi)
- Sipariş durumu takibi
- Personel istatistikleri (günlük servis sayısı, ortalama süre)

**Yeni Eklenenler:**
- "Hafıza modu": Son 5 masanın sipariş geçmişi hızlı görünüm
- Müşteri özel notu: Alerjen hatırlatması

### 5.3 Mutfak KDS Ekranı

**Temel İşlevler:**
- 3 sütun Kanban: Bekleyen / Hazırlanıyor / Hazır
- Süre takibi (5dk→sarı, 15dk→kırmızı, yanıp söner)
- Ses bildirimleri
- Tam ekran kiosk modu
- Anlık sipariş düşmesi (Socket.io)
- Acil sipariş işaretleme
- Sipariş kaynağı etiketi (Masa/QR/Paket/Telefon)
- "Hazır" basınca garsona anında bildirim

**Yeni Eklenenler:**
- Çoklu istasyon desteği: Ana Mutfak / Bar / Soğuk Mutfak
- Günlük mutfak performans skoru
- Ürün bazlı görünüm modu (fiş yerine)

### 5.4 Kurye Ekranı (Mobil PWA)

**Temel İşlevler:**
- Atanan siparişler listesi (öncelik sıralı)
- Müşteri bilgileri + adres + telefon
- Google Maps / Waze deep link
- Durum güncelleme: Hazırlandı → Alındı → Yolda → Teslim Edildi
- Kapıda ödeme yönetimi
- Teslim edilemeyen iade akışı
- Günlük teslimat özeti

**Yeni Eklenenler:**
- Anlık konum paylaşımı (kasiyer haritada görür)
- Toplu teslimat desteği (aynı adrese birden fazla sipariş)

### 5.5 Admin Paneli

| Alt Modül | Özellikler |
|-----------|------------|
| **Dashboard** | Anlık satış, sipariş sayısı, aktif masalar, online şubeler, grafik |
| **Menü Yönetimi** | Kategori/ürün CRUD, boyut/modifikasyon, alerjen, resim yükleme, toplu fiyat güncelleme, QR menü önizleme |
| **Masa & Bölüm** | Sürükle-bırak kat planı editörü, QR üretme/yazdırma, kat sekmesi |
| **Personel** | CRUD, rol, PIN, vardiya, performans raporu |
| **Müşteri CRM** | Arama, puan, kara liste, GDPR silme talebi, doğum günü kampanyası |
| **Stok** | Envanter CRUD, günlük stok durumu, düşük stok uyarısı |
| **Raporlama** | Günlük/Haftalık/Aylık ciro, en çok satanlar, saatlik ısı haritası, personel perf., indirim raporu |
| **Kasa** | Z raporu, X raporu, kasa geçmişi, KassenSichV raporu (Almanya) |
| **Teslimat Bölgeleri** | Bölge haritası, ücret tanımlama, minimum sipariş |
| **Adisyon Tasarımı** | Canlı önizleme, logo, font, kağıt boyutu (58mm/80mm) |
| **Dil Yönetimi** | Çeviri editörü, ürün çevirileri, adisyon dil şablonları |
| **Yazıcı Ayarları** | Yazıcı ekleme, test yazdırma, kağıt boyutu, otomatik kesim |
| **Entegrasyonlar** | Stripe, Lieferdienst API'leri (Lieferando vb.) |
| **Ayarlar** | Firma bilgileri, KDV oranı, para birimi, offline süre, bildirim sesleri |

### 5.6 Müşteri QR Menü / Kiosk

**Temel İşlevler:**
- Masadaki QR ile direkt menü açılışı
- Kişisel QR ile müşteri tanıma + "Hoş geldin!"
- Favori ve son sipariş hızlı erişimi
- Alerjen filtreleme
- Sepet yönetimi + sipariş gönderme (garson onay akışı)
- Garson çağırma + hesap isteme + özel mesaj
- Dil algılama (tarayıcı dili) + manuel bayrak seçici

**Yeni Eklenenler:**
- Puan bakiyesi gösterimi ("🌟 125 puanınız var")
- Ürün yorumları + puan değerlendirme (sipariş sonrası)
- "Tekrar sipariş ver" one-click butonu
- Kiosk tablet için ekran koruyucu modu

---

## 6. API Endpoint Tasarımı (Tam)

```
BASE URL: /api/v1

// ═══ AUTH ═══
POST   /auth/login                    # username + password → tokens
POST   /auth/login/pin                # PIN → kısa süreli token
POST   /auth/refresh                  # Refresh token → yeni access token
POST   /auth/logout                   # Token revoke
GET    /auth/me                       # Mevcut kullanıcı bilgisi

// ═══ MENÜ ═══
GET    /menu/categories               # Kategoriler (lang param. ile)
GET    /menu/products                 # Ürünler (categoryId, lang, available)
GET    /menu/products/:id             # Ürün detayı + varyantlar + modifikasyon
POST   /menu/products                 # Ürün ekle (admin)
PUT    /menu/products/:id             # Ürün güncelle
PATCH  /menu/products/:id/availability # Stok durumu hızlı güncelle
DELETE /menu/products/:id             # Sil (soft delete)
POST   /menu/products/bulk-price      # Toplu fiyat güncelleme

GET    /menu/modifier-groups          # Modifikasyon grupları
POST   /menu/modifier-groups          # Grup ekle
GET    /menu/modifier-groups/:id/modifiers

// ═══ MASALAR ═══
GET    /tables                        # Tüm masalar (sectionId filter)
GET    /tables/:id                    # Masa detayı
GET    /tables/:id/session            # Aktif oturum
POST   /tables/:id/open               # Oturum aç
POST   /tables/:id/close              # Oturum kapat
POST   /tables/:id/transfer           # Masa taşı
POST   /tables/merge                  # Masa birleştir
PUT    /tables/:id/layout             # Pozisyon güncelle (kat planı editörü)

// ═══ SİPARİŞLER ═══
GET    /orders                        # Sipariş listesi (filtre: status, date, tableId)
POST   /orders                        # Sipariş oluştur
GET    /orders/:id                    # Sipariş detayı
GET    /orders/by-offline-id/:offlineId  # Offline senkron doğrulama (idempotent)
PUT    /orders/:id/status             # Durum güncelle
POST   /orders/:id/items              # Ürün ekle
DELETE /orders/:id/items/:itemId      # Ürün çıkar (void)
POST   /orders/:id/send-kitchen       # Mutfağa gönder
POST   /orders/:id/confirm            # Garson onayla (QR siparişi)
POST   /orders/:id/cancel             # İptal et
PUT    /orders/:id/discount           # İndirim uygula

// ═══ ÖDEME ═══
POST   /payments                      # Ödeme al
POST   /payments/split                # Hesap böl
POST   /payments/:id/refund           # İade
GET    /payments/order/:orderId       # Sipariş ödemeleri
POST   /payments/stripe/intent        # Stripe ödeme niyeti oluştur
POST   /payments/stripe/confirm       # Stripe ödeme onayla

// ═══ MUTFAK ═══
GET    /kitchen/tickets               # Aktif fişler (stationId, status)
PUT    /kitchen/tickets/:id           # Durum güncelle
POST   /kitchen/tickets/:id/bump      # Tamamla

// ═══ MÜŞTERİ ═══
GET    /customers/search              # Ara (phone, name, qr, code)
GET    /customers/:id                 # Detay
POST   /customers                     # Yeni müşteri
PUT    /customers/:id                 # Güncelle
DELETE /customers/:id                 # GDPR silme
GET    /customers/:id/orders          # Geçmiş siparişler
POST   /customers/:id/points          # Puan işlemi
GET    /customers/:id/points/history  # Puan geçmişi

// ═══ TESLİMAT ═══
GET    /deliveries                    # Aktif teslimatlar
POST   /deliveries                    # Teslimat oluştur
PUT    /deliveries/:id/status         # Durum güncelle
PUT    /deliveries/:id/assign         # Kurye ata
PUT    /deliveries/:id/location       # Kurye konum güncelle

// ═══ SERVİS ÇAĞRILARI ═══
POST   /service-calls                 # Yeni çağrı (müşteri QR'dan)
GET    /service-calls/active          # Aktif çağrılar
PUT    /service-calls/:id             # Yanıtla / tamamla

// ═══ RAPORLAR ═══
GET    /reports/dashboard             # Anlık dashboard özeti
GET    /reports/daily                 # Günlük özet (date param)
GET    /reports/products              # Ürün satış raporu
GET    /reports/staff                 # Personel raporu
GET    /reports/hourly                # Saatlik dağılım
GET    /reports/customers             # Müşteri raporu (LTV, segmentasyon)
POST   /reports/z-report              # Z Raporu kapat ve oluştur
GET    /reports/z-report/:id          # Z Raporu PDF indir

// ═══ STOK ═══
GET    /inventory                     # Envanter listesi
POST   /inventory                     # Ürün ekle
PUT    /inventory/:id                 # Güncelle
POST   /inventory/:id/adjustment      # Stok düzeltme
GET    /inventory/low-stock           # Düşük stok uyarısı

// ═══ SENKRONIZASYON ═══
POST   /sync/push                     # Offline verileri gönder
GET    /sync/pull                     # Güncel verileri çek (son sync'ten)
GET    /sync/status                   # Sync durumu

// ═══ DİL (i18n) ═══
GET    /languages                     # Aktif diller
PUT    /users/me/language             # Dil tercihi güncelle
GET    /translations/:ns/:lang        # Çeviri dosyası
PUT    /translations/:ns/:lang        # Çeviri güncelle (admin)
GET    /receipt-templates/:lang       # Adisyon şablonu

// ═══ YAZICI ═══
GET    /printers                      # Yazıcı listesi
POST   /printers/test                 # Test yazdırma
POST   /printers/print                # Manuel yazdırma komutu

// ═══ TENANT (SaaS Super Admin) ═══
GET    /tenants                       # Tüm kiracılar
POST   /tenants                       # Yeni kiracı
PUT    /tenants/:id/status            # Askıya al / aktif et
GET    /tenants/:id/stats             # Kullanım istatistikleri
GET    /subscriptions/plans           # Genel plan listesi (fiyatlandırma)
PUT    /tenants/:id/plan              # Plan değişikliği (superadmin)
POST   /tenants/:id/billing-portal    # Stripe Customer Portal URL (opsiyonel)

// ═══ WEBHOOK (dış sistemler) ═══
POST   /webhooks/stripe               # Stripe imza doğrulama + ödeme/abonelik olayları

// ═══ GDPR / KVKK ═══
POST   /gdpr/export                   # Müşteri verisi JSON/ZIP (yetki: admin veya self)
POST   /gdpr/erasure-request          # Silme talebi kaydı (workflow)
DELETE /customers/:id/erase          # Onay sonrası kalıcı anonimleştirme

// ═══ FİSKAL (Almanya) ═══
POST   /fiscal/tse/sign               # TSE ile işlem imzala (order/payment id)
GET    /fiscal/dsfinvk/export         # DSFinV-K dönem export (query: from, to)
```

---

## 7. WebSocket Olay Haritası

```javascript
// ROOM YAPISI
`branch:${branchId}`          // Şube geneli
`table:${tableId}`             // Masa bazlı
`kitchen:${branchId}:${stationCode}` // Mutfak istasyon bazlı
`waiter:${userId}`             // Garson kişisel
`courier:${userId}`            // Kurye kişisel
`admin:${branchId}`            // Admin bildirimleri

// ═══ Sipariş Olayları ═══
'order:new'           → Mutfak + Kasiyer
'order:confirmed'     → Mutfak (garson onay sonrası)
'order:status'        → İlgili herkes
'order:cancelled'     → Mutfak + Kasiyer
'order:urgent'        → Mutfak (acil işaret)

// ═══ Mutfak Olayları ═══
'kitchen:new_ticket'  → KDS Ekranı
'kitchen:preparing'   → Masa ekranı / Garson
'kitchen:ready'       → Garson + Kasiyer + Müşteri QR
'kitchen:bump'        → Tüm KDS

// ═══ Masa Olayları ═══
'table:status'        → Garson + Kasiyer
'table:session_open'  → Garson
'table:session_close' → Garson + Kasiyer
'table:transfer'      → Garson

// ═══ Müşteri QR Olayları ═══
'qr:order_request'    → Garson (onay bekliyor)
'qr:order_approved'   → Müşteri cihazı
'qr:order_rejected'   → Müşteri cihazı
'qr:service_call'     → Garson + Kasiyer

// ═══ Teslimat Olayları ═══
'delivery:assigned'   → Kurye
'delivery:status'     → Kasiyer
'delivery:location'   → Kasiyer (harita güncelleme)

// ═══ Stok Olayları (YENİ) ═══
'stock:low'           → Admin + Kasiyer (ürün tükeniyor uyarısı)
'stock:out'           → Mutfak + Kasiyer (ürün tükendi)

// ═══ Sistem Olayları ═══
'sync:complete'       → İlgili cihaz
'menu:updated'        → Tüm cihazlar (menü cache yenile)
'announcement'        → Tüm personel
```

---

## 8. Offline & Senkronizasyon Mimarisi

### 8.1 Dexie.js Şeması

```javascript
const db = new Dexie('NextPOS');
db.version(1).stores({
  // Sipariş kuyruğu
  pendingOrders:    '++id, offlineId, status, createdAt',
  pendingPayments:  '++id, offlineId, orderId, createdAt',
  // Menü cache
  categories:       'id, sortOrder',
  products:         'id, categoryId, isActive, isAvailable',
  variants:         'id, productId',
  modifierGroups:   'id',
  modifiers:        'id, groupId',
  // Müşteri cache
  customers:        'id, phone, personalQr',
  // Masa cache
  tables:           'id, status, branchId',
  sections:         'id',
  // Sync
  syncQueue:        '++id, entityType, action, status, priority, createdAt',
  // Auth
  settings:         'key',
  authToken:        'key',
  // Çeviri cache
  translations:     '[namespace+lang]',
  languages:        'code',
});
```

### 8.2 Senkronizasyon Çakışma Çözümü

```
Çakışma Senaryosu: Aynı masa hem offline hem online siparişle güncellendi.

Kural: "Son yazma kazanır" (Last Write Wins) — createdAt timestamp bazlı
Özel Kural (sipariş): Offline sipariş her zaman sunucuya gönderilir,
                      sunucu mevcut durumu kontrol eder ve çakışmayı çözer.

Çakışma Log: sync_queue.error_message'e kaydedilir, admin'e bildirilir.
```

**Ek kurallar (üretim için):**
| Varlık | Çözüm |
|--------|--------|
| Yeni satır (sipariş kalemi) | Birleştir: sunucu kalemleri + offline kalemler (çift ürün → miktar topla veya ayrı satır) |
| Fiyat / menü | Sunucu versiyonu kazanır; offline sipariş satırı eski fiyatla ise uyarı flag’i |
| Ödeme | Asla çift tahsilat: `offline_id` idempotent key; API tekrarlı POST’u reddeder |
| Masa durumu | Optimistic lock: `tables.updated_at` veya `version` alanı eşleşmezse 409 + yeniden yükle |

İsteğe bağlı: entity bazlı **vector clock** veya **Lamport** sayacı büyük şube kurulumlarında eklenir.

---

## 9. Test Stratejisi

### 9.1 Test Piramidi

```
         /\
        /E2E\          ← 10% — Playwright (kritik akışlar)
       /──────\
      / Integr. \      ← 20% — Supertest (API uç noktaları)
     /────────────\
    /    Unit       \  ← 70% — Jest (servisler, utils, hooks)
   /────────────────\
```

### 9.2 Unit Test Örnekleri

```typescript
// apps/api/src/modules/orders/__tests__/orders.service.spec.ts
describe('OrdersService', () => {
  it('should calculate total correctly with discount', async () => {
    const result = service.calculateTotal({
      items: [{ price: 10, qty: 2 }, { price: 5, qty: 1 }],
      discountType: 'percent',
      discountValue: 10,
    });
    expect(result.subtotal).toBe(25);
    expect(result.discountAmount).toBe(2.5);
    expect(result.total).toBe(22.5);
  });

  it('should create offline order with UUID', async () => {
    const order = await service.createOfflineOrder({ tableId: 1, items: [] });
    expect(order.offlineId).toMatch(/^[0-9a-f-]{36}$/);
    expect(order.synced).toBe(false);
  });
});
```

### 9.3 E2E Test Senaryoları (Playwright)

```typescript
// Kritik akış 1: Sipariş oluşturma → Mutfak → Ödeme
test('full order lifecycle', async ({ page }) => {
  await page.goto('/login');
  await loginAs(page, 'cashier');
  await selectTable(page, 'Masa 5');
  await addProduct(page, 'Margherita', 'L');
  await sendToKitchen(page);
  await switchToKitchen(page);
  await markAsReady(page);
  await switchToCashier(page);
  await completePayment(page, 'cash', 20);
  await expect(page.getByText('Ödeme Başarılı')).toBeVisible();
});

// Kritik akış 2: Offline sipariş → Senkronizasyon
test('offline order sync', async ({ page, request }) => {
  await page.context().setOffline(true);
  const offlineId = await createOrder(page); // UI'dan data-testid veya store'dan offline UUID döner
  await expect(page.getByText('OFFLINE')).toBeVisible();
  await page.context().setOffline(false);
  await page.waitForSelector('[data-testid="sync-complete"]');
  const res = await request.get(`/api/v1/orders/by-offline-id/${offlineId}`, {
    headers: { Authorization: `Bearer ${process.env.E2E_TOKEN}` },
  });
  expect(res.ok()).toBeTruthy();
  const order = await res.json();
  expect(order.offlineId ?? order.offline_id).toBe(offlineId);
});
```

---

## 10. CI/CD & DevOps Pipeline

### 10.1 GitHub Actions — CI

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: nextpos_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run build
```

### 10.2 GitHub Actions — Deploy

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker images
        run: docker compose -f docker-compose.prod.yml build
      - name: Push to registry
        run: |
          docker tag nextpos-api registry.example.com/nextpos-api:${{ github.sha }}
          docker push registry.example.com/nextpos-api:${{ github.sha }}
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_KEY }}
          script: |
            cd /opt/nextpos
            docker compose pull
            docker compose up -d --no-deps api
            docker compose exec api npx prisma migrate deploy
```

### 10.3 Docker Compose (Prodüksiyon)

```yaml
# docker-compose.prod.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    volumes:
      - pg_data:/var/lib/postgresql/data
    env_file: .env.prod
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER"]
      interval: 10s

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  api:
    image: registry.example.com/nextpos-api:latest
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    env_file: .env.prod
    ports:
      - "3000:3000"

  nginx:
    image: nginx:alpine
    restart: always
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./apps/pos/dist:/usr/share/nginx/html/pos
      - certbot_data:/etc/letsencrypt
    ports:
      - "80:80"
      - "443:443"

  backup:
    image: postgres:16-alpine
    volumes:
      - pg_data:/data:ro
      - ./backups:/backups
    entrypoint: /bin/sh
    command: -c "pg_dump -h postgres -U $POSTGRES_USER $POSTGRES_DB | gzip > /backups/$(date +%Y%m%d_%H%M%S).sql.gz"
    profiles: [backup]   # Manuel: docker compose --profile backup run backup

volumes:
  pg_data:
  redis_data:
  certbot_data:
```

---

## 11. Hata Yönetimi & Loglama

### 11.1 NestJS Global Exception Filter

```typescript
// common/filters/http-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let status = 500;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as any).message;
      code = (body as any).code ?? 'HTTP_ERROR';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        message = 'Duplicate entry';
        code = 'DUPLICATE_ERROR';
      }
    }

    // Sentry'ye gönder (500 hataları)
    if (status >= 500) {
      Sentry.captureException(exception);
      this.logger.error({ exception, request: { url: request.url, method: request.method } });
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### 11.2 Frontend Hata Yönetimi

```typescript
// services/api.ts — Axios interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token süresi doldu → refresh
      try {
        await authStore.getState().refreshToken();
        return api(error.config); // Tekrar dene
      } catch {
        authStore.getState().logout();
        window.location.href = '/login';
      }
    }

    if (!navigator.onLine) {
      // Offline → IndexedDB'ye ekle
      syncQueue.add(error.config);
      return { data: { offline: true } };
    }

    // Toast bildirimi
    toast.error(error.response?.data?.message ?? 'Bağlantı hatası');
    return Promise.reject(error);
  }
);
```

### 11.3 Backup & Disaster Recovery

```bash
# Günlük otomatik backup (cron: 03:00)
0 3 * * * docker compose --profile backup run --rm backup

# Backup saklama: 7 gün yerel + S3'e yükle
aws s3 sync ./backups s3://nextpos-backups/$(hostname)/

# Recovery testi: Her Pazar
0 4 * * 0 /opt/nextpos/scripts/test-recovery.sh
```

---

## 12. Performans & Ölçeklendirme

### 12.1 Redis Cache Stratejisi

```typescript
// Her API isteğinde menüyü DB'den çekme — Redis'ten al
const MENU_CACHE_KEY = (branchId: number) => `menu:${branchId}`;
const MENU_TTL = 5 * 60; // 5 dakika

async getMenu(branchId: number) {
  const cached = await redis.get(MENU_CACHE_KEY(branchId));
  if (cached) return JSON.parse(cached);

  const menu = await this.prisma.product.findMany({ where: { branchId, isActive: true } });
  await redis.setex(MENU_CACHE_KEY(branchId), MENU_TTL, JSON.stringify(menu));
  return menu;
}

// Menü güncellenince cache'i temizle
async updateProduct(id: number, data: UpdateProductDto) {
  const product = await this.prisma.product.update({ where: { id }, data });
  await redis.del(MENU_CACHE_KEY(product.branchId));
  // Socket.io ile tüm cihazları bildir
  this.socketGateway.emit(`branch:${product.branchId}`, 'menu:updated', {});
  return product;
}
```

### 12.2 Veritabanı Optimizasyonu

- **pgBouncer**: Connection pooling (max 100 bağlantı → pooler → 20 DB bağlantısı)
- **Partitioning**: `orders` tablosu aylık bölümleme (büyük kurulumlar için)
- **Materialized Views**: Günlük özet raporlar için
- **Query Optimization**: EXPLAIN ANALYZE ile yavaş sorgu takibi

---

## 13. Güvenlik Mimarisi (Detaylı)

### 13.1 Güvenlik Katmanları

| Katman | Mekanizma | Detay |
|--------|-----------|-------|
| **Kimlik Doğrulama** | JWT Access (15dk) + Refresh (7gün) | Device fingerprint ile bağlı |
| **Yetkilendirme** | RBAC + RLS (PostgreSQL) | Her tenant kendi verisini görür |
| **API Rate Limiting** | 100 req/dk per IP, 1000 req/dk per user | Redis tabanlı |
| **Brute Force** | 5 başarısız login → 15dk ban | IP + username bazlı |
| **Veri Şifreleme** | AES-256 (hassas veriler), bcrypt(12) (şifreler) | — |
| **İletişim** | HTTPS + WSS (TLS 1.3) | HSTS header |
| **CORS** | Whitelist (sadece bilinen domain'ler) | — |
| **XSS** | React auto-escape + CSP header + DOMPurify | — |
| **SQL Injection** | Prisma parameterized queries | — |
| **Audit Log** | Her kritik işlem loglanır | Silinemeyen kayıtlar |
| **GDPR** | Müşteri silme API, consent kayıt, veri ihracat | AB mevzuatı uyumu |

### 13.2 Almanya KassenSichV Uyumu

```
Almanya'da restoran POS sistemleri için zorunlu:
- TSE (Technische Sicherheitseinrichtung) sertifikalı donanım
- Her fiş/sipariş için TSE imzası (tss_signature alanı)
- Z raporu TSE imzalı olmalı
- Veri silinmez / değiştirilemez (audit log)
- DSFinV-K format export (vergi denetimi için)

Not: TSE donanım/yazılım tedarikçileri: Swissbit, Epson, Diebold Nixdorf
```

---

## 14. SaaS Çok-Kiracılı (Multi-Tenant) Mimari

### 14.1 Tenant İzolasyonu

```
Strateji: Shared Database + Row Level Security (RLS)
Neden: Küçük/orta ölçek için maliyet etkin

Alternatif (büyük kurulum): Her tenant'a ayrı DB schema
  → Daha yüksek izolasyon, daha karmaşık yönetim

Her API isteğinde:
1. JWT'den tenant_id çıkar
2. Prisma middleware ile WHERE clause'a otomatik ekle
3. PostgreSQL RLS policy ikinci güvenlik katmanı
```

### 14.2 Abonelik Planları

| Plan | Şube | Kullanıcı | Fiyat/ay |
|------|------|-----------|----------|
| **Starter** | 1 | 5 | €29 |
| **Professional** | 3 | 20 | €79 |
| **Enterprise** | Sınırsız | Sınırsız | €199+ |

### 14.3 SaaS Admin Dashboard

URL: `/saas-admin` (superadmin rolü)

Özellikler:
- Tüm tenantların listesi + durum
- Abonelik yönetimi + plan değiştirme
- Kullanım metrikleri (sipariş sayısı, aktif kullanıcı)
- Tenant askıya alma / aktif etme
- Sistem sağlığı (uptime, response time, error rate)
- Yeni tenant oluşturma + onboarding akışı

---

## 15. Donanım Entegrasyonu (Detaylı)

### 15.1 ESC/POS Termal Yazıcı

```typescript
// packages/escpos/src/printer.ts
import { Printer, USB, TCP, Bluetooth } from 'node-escpos';

export class POSPrinter {
  private device: USB | TCP | Bluetooth;

  constructor(config: PrinterConfig) {
    if (config.type === 'usb') {
      this.device = new USB(config.vendorId, config.productId);
    } else if (config.type === 'tcp') {
      this.device = new TCP(config.host, config.port ?? 9100);
    }
  }

  async printReceipt(order: Order, template: ReceiptTemplate): Promise<void> {
    const printer = new Printer(this.device, { encoding: 'UTF-8' });
    await this.device.open();

    printer
      .align('ct')
      .style('bu')
      .size(1, 1)
      .text(template.headerText)
      .style('normal')
      .text('─'.repeat(32))
      .align('lt');

    for (const item of order.items) {
      const name = getProductName(item.product, template.lang);
      const price = `€${item.totalPrice.toFixed(2)}`;
      printer.text(`${item.quantity}x ${name.padEnd(20)} ${price.padStart(8)}`);
    }

    printer
      .text('─'.repeat(32))
      .align('rt')
      .style('b')
      .text(`${template.totalLabel}: €${order.totalAmount.toFixed(2)}`)
      .style('normal')
      .align('ct')
      .text(template.footerText)
      .cut()
      .close();
  }

  async openCashDrawer(): Promise<void> {
    // ESC/POS drawer kick: ESC p 0 25 250
    const printer = new Printer(this.device);
    await this.device.open();
    printer.cashdraw(2).close();
  }
}
```

### 15.2 Yazıcı Kuyruğu (BullMQ)

```typescript
// api/src/queue/print.processor.ts
@Processor('print-queue')
export class PrintProcessor {
  @Process('receipt')
  async printReceipt(job: Job<PrintJob>) {
    const { orderId, printerId, lang } = job.data;
    const printer = this.printerRegistry.get(printerId);
    const order = await this.ordersService.findOne(orderId);
    const template = await this.receiptService.getTemplate(order.branchId, lang);

    try {
      await printer.printReceipt(order, template);
    } catch (error) {
      // Yazıcı hatası → 3 kez tekrar dene, sonra admin'e bildir
      throw new Error(`Print failed: ${error.message}`);
    }
  }
}
```

### 15.3 Müşteri Ekranı (Pole Display)

```
Protokol: VFD (Vacuum Fluorescent Display) — RS-232 / USB-Serial
Format: 2 satır × 20 karakter

Sipariş sırasında:
Satır 1: "Margherita L     €12.00"
Satır 2: "TOPLAM:          €25.50"

Boşta:
Satır 1: "  NextPOS Hoş    "
Satır 2: "  Geldiniz!       "
```

---

## 16. Çoklu Dil (i18n) Sistemi

### 16.1 Mimari Özet

```
KİM → HANGİ DİL?
─────────────────────────────────────────
Personel    → users.preferred_language → localStorage → i18next
QR Menü     → URL ?lang= > müşteri profili > tarayıcı > şube varsayılanı
Kiosk       → Şube varsayılanı + ekran dil seçici
Adisyon/Fiş → receipt_templates tablosu (şube bazlı, her dil ayrı şablon)
```

### 16.2 Çeviri Dosya Yapısı

Her dil klasöründe aynı dosya adları kullanılır (`namespace` = dosya adı, uzantısız):

| Dosya | İçerik |
|--------|--------|
| `common.json` | Butonlar, genel etiketler, validasyon hataları |
| `pos.json` | Kasiyer terminali |
| `waiter.json` | Garson tablet |
| `kitchen.json` | Mutfak KDS |
| `courier.json` | Kurye PWA |
| `admin.json` | Şube admin |
| `saas.json` | SaaS süper admin |
| `qrmenu.json` | Müşteri QR / kiosk |
| `reports.json` | Rapor ve Z/X metinleri |

```
src/locales/
├── de/
│   ├── common.json
│   ├── pos.json
│   ├── waiter.json
│   ├── kitchen.json
│   ├── courier.json
│   ├── admin.json
│   ├── saas.json
│   ├── qrmenu.json
│   └── reports.json
├── tr/
│   └── (yukarıdaki ile aynı dosya adları)
└── en/
    └── (yukarıdaki ile aynı dosya adları)
```

**Sunucu senkronu:** `GET /translations/:ns/:lang` ile CDN veya API’den çekilir; offline için §8.1 `translations` store’una yazılır.

---

## 17. UI/UX & Tema Sistemi

### 17.1 Renk Paleti (Koyu Tema)

| Token | Değer | Kullanım |
|-------|-------|----------|
| `--bg-primary` | `#0F1923` | Ana arka plan |
| `--bg-secondary` | `#1A2634` | Kart / panel |
| `--bg-tertiary` | `#243447` | Hover / aktif |
| `--accent-primary` | `#10B981` | Butonlar, badge (Yeşil/Teal) |
| `--text-primary` | `#F1F5F9` | Ana metin |
| `--text-secondary` | `#94A3B8` | İkincil metin |
| `--danger` | `#EF4444` | Hata, iptal |
| `--warning` | `#F59E0B` | Uyarı |
| `--info` | `#3B82F6` | Bilgi |

### 17.2 Masa Durum Renkleri

| Durum | Renk | Kod |
|-------|------|-----|
| Müsait | Yeşil | `#10B981` |
| Dolu | Kırmızı | `#EF4444` |
| Sipariş Bekliyor | Sarı (pulse) | `#F59E0B` |
| Hesap İstedi | Mavi | `#3B82F6` |
| Yemek Hazır | Turuncu | `#F97316` |
| Temizleniyor | Gri | `#64748B` |

### 17.3 Touch-First Tasarım Kuralları

| Kural | Değer |
|-------|-------|
| Min dokunma alanı | 44×44px (Apple HIG) |
| Buton arası boşluk | min 8px |
| Font minimum | 12px |
| Kontrast (WCAG AA) | min 4.5:1 |
| Animasyon süresi | max 300ms |

---

## 18. Migrasyon Planı (PizzaPOS → NextPOS)

### 18.1 Veri Eşleşme Tablosu

| PizzaPOS Tablosu | → NextPOS Tablosu | Özel Notlar |
|---|---|---|
| `categories` | `categories` | `icon`, `sort_order` korunur; `translations` eklenir |
| `products` | `products` + `product_variants` | Boyutlar ayrı tabloya; `tax_class` eklenir |
| `sections` | `sections` | `layout_data` yeni |
| `tables` | `tables` | `position_x/y`, `shape`, `qr_secret` yeni |
| `customers` | `customers` | `personal_qr`, `gdpr_consent` yeni |
| `customer_addresses` | `customer_addresses` | `postal_code`, `country_code` yeni |
| `orders` | `orders` | `source`, `offline_id`, `order_number`, `tss_signature` yeni |
| `order_items` | `order_items` | `modifiers` JSONB, `kitchen_station` yeni |
| `kitchen_orders` | `kitchen_tickets` | Fiş bazlı yapıya geçiş |
| `payments` | `payments` | `tip_amount`, `change_amount`, `receipt_number` yeni |
| `settings` | `branches.settings` | JSONB formatına dönüştür |
| `check_design` | `branches.settings.receiptDesign` | JSONB alt objesi |
| `users` | `users` | `pin_code`, `branch_id`, `tenant_id` yeni |

### 18.2 Migrasyon Script Sırası

```bash
# 1. Ortam hazırlama
npm run db:migrate:create-schema   # Yeni şemayı oluştur (veriler olmadan)

# 2. Veri aktarımı sırası
node scripts/migrate/01-tenants.js
node scripts/migrate/02-branches.js
node scripts/migrate/03-users.js       # Şifreleri bcrypt ile yeniden hashle
node scripts/migrate/04-categories.js  # i18n çevirilerini başlat (DE = mevcut isim)
node scripts/migrate/05-products.js    # Boyutları variant tabloya böl
node scripts/migrate/06-modifiers.js
node scripts/migrate/07-sections.js
node scripts/migrate/08-tables.js      # QR kod yeniden üret
node scripts/migrate/09-customers.js   # personal_qr UUID üret
node scripts/migrate/10-orders.js      # order_number üret, offline_id = NULL
node scripts/migrate/11-payments.js
node scripts/migrate/12-verify.js      # Sayım doğrulaması

# 3. Doğrulama
node scripts/migrate/validate.js
# → Beklenen: Tüm kayıt sayıları eşleşmeli
```

### 18.3 Geçiş Stratejisi (Zero Downtime)

```
Hafta 1: NextPOS test ortamında çalışıyor, PizzaPOS production'da
Hafta 2: Paralel çalıştırma (her ikisi de aktif)
Hafta 3: NextPOS production'a geçiş, PizzaPOS 2 hafta yedekte
Hafta 5: PizzaPOS kapatılır
```

---

## 19. Geliştirme Yol Haritası (Sprint Planı)

### Faz 0 — Proje Kurulumu (1 Hafta)
**Sprint 0.1:**
- [ ] Turborepo monorepo kurulumu
- [ ] ESLint + Prettier + Husky pre-commit hooks
- [ ] TypeScript strict config
- [ ] Docker Compose (postgres + redis)
- [ ] GitHub Actions CI temel pipeline
- [ ] i18next yapılandırması + boş çeviri dosyaları
- [ ] Shared-types paketi (temel tipler)

### Faz 1 — Veritabanı & API Temeli (2 Hafta)
**Sprint 1.1:**
- [ ] Prisma şeması (tüm tablolar)
- [ ] Migration çalıştırma
- [ ] Seed data (test branch, kullanıcılar, menü)
- [ ] NestJS proje yapısı + modüller

**Sprint 1.2:**
- [ ] JWT Auth (login, refresh, logout, PIN)
- [ ] RBAC guards
- [ ] Users CRUD API
- [ ] Menu (categories + products + variants + modifiers) API

### Faz 2 — Kasiyer Ekranı + Offline (3 Hafta)
**Sprint 2.1:**
- [ ] React + Vite proje kurulumu
- [ ] Login sayfası (username/password + PIN)
- [ ] Zustand store'ları (auth, order, table)
- [ ] Masa grid + bölüm sekmeleri

**Sprint 2.2:**
- [ ] Ürün listesi + kategori filtre
- [ ] Sipariş oluşturma akışı (boyut + modifikasyon + not)
- [ ] Adisyon paneli (sepet)
- [ ] Mutfağa gönder akışı

**Sprint 2.3:**
- [ ] Ödeme ekranı (Nakit/Kart/Split)
- [ ] ESC/POS yazıcı entegrasyonu (USB)
- [ ] IndexedDB (Dexie.js) kurulumu
- [ ] Offline sipariş oluşturma
- [ ] Senkronizasyon yöneticisi

### Faz 3 — Garson + WebSocket (2 Hafta)
**Sprint 3.1:**
- [ ] Socket.io server (NestJS Gateway)
- [ ] Garson PWA — görsel kat planı
- [ ] Bildirim merkezi (toast + ses)
- [ ] Sipariş akışı (masa başında)

**Sprint 3.2:**
- [ ] QR okutma ile müşteri tanıma
- [ ] Masa başından sipariş → garson onay akışı
- [ ] Garson istatistikleri
- [ ] Dil seçici + profil ayarları

### Faz 4 — Mutfak KDS + Kurye + QR Menü (3 Hafta)
**Sprint 4.1:**
- [ ] Mutfak KDS ekranı (Kanban)
- [ ] Süre sayacı + renk kodlama
- [ ] "Hazır" → garson bildirimi akışı
- [ ] Çoklu istasyon desteği

**Sprint 4.2:**
- [ ] Kurye PWA (sipariş listesi, navigasyon, konum)
- [ ] Teslimat bölgeleri yönetimi

**Sprint 4.3:**
- [ ] Next.js QR menü uygulaması
- [ ] Dil algılama + bayrak seçici
- [ ] Garson onay akışı
- [ ] Hizmet çağrıları (çağır/hesap/su)

### Faz 5 — Admin Paneli + Raporlar (2 Hafta)
**Sprint 5.1:**
- [ ] Dashboard (anlık metrikler)
- [ ] Menü yönetimi (CRUD + çeviri editörü)
- [ ] Kat planı editörü (sürükle-bırak)
- [ ] Personel yönetimi

**Sprint 5.2:**
- [ ] Raporlama dashboard (günlük/haftalık/aylık)
- [ ] Z Raporu + X Raporu
- [ ] Stok yönetimi
- [ ] Adisyon tasarımcısı

### Faz 6 — Yazıcı + Donanım + Güvenlik (1 Hafta)
- [ ] TCP/IP yazıcı desteği
- [ ] Bluetooth yazıcı desteği
- [ ] Para çekmecesi tetikleme
- [ ] Kiosk modu (tam ekran PWA)
- [ ] KassenSichV TSE entegrasyonu (Almanya)
- [ ] Rate limiting ince ayar
- [ ] GDPR araçları (silme, ihracat)

### Faz 7 — Test & Canlıya Alma (1 Hafta)
- [ ] E2E test senaryoları (Playwright)
- [ ] Yük testi (k6 veya Artillery)
- [ ] Offline senaryo testleri
- [ ] Güvenlik taraması (OWASP ZAP)
- [ ] VPS deployment + SSL
- [ ] Monitoring (Sentry + Grafana) kurulumu
- [ ] Dokümantasyon (Swagger API docs)
- [ ] Personel eğitimi + onboarding

**TOPLAM: ~15 Hafta**

---

## 20. Geliştirici Ortamı Kurulum

### 20.1 Environment Variables

```bash
# .env.example

# ═══ VERİTABANI ═══
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nextpos_dev"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/nextpos_test"

# ═══ REDIS ═══
REDIS_URL="redis://localhost:6379"

# ═══ JWT ═══
JWT_ACCESS_SECRET="change-me-in-production-min-32-chars"
JWT_REFRESH_SECRET="change-me-in-production-min-32-chars-2"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"

# ═══ UYGULAMA ═══
NODE_ENV="development"
PORT=3000
CORS_ORIGINS="http://localhost:5173,http://localhost:3001"
OFFLINE_MAX_HOURS=48

# ═══ STRIPE ═══
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# ═══ SENTRY ═══
SENTRY_DSN=""

# ═══ TENANT ═══
SUPER_ADMIN_SECRET="change-me"

# ═══ YAZICI ═══
DEFAULT_PRINTER_TYPE="tcp"
DEFAULT_PRINTER_HOST="192.168.1.100"
DEFAULT_PRINTER_PORT=9100

# ═══ TSE (Almanya KassenSichV) ═══
TSE_ENABLED=false
TSE_CLIENT_ID=""
TSE_API_URL=""
```

### 20.2 Hızlı Başlangıç

```bash
# 1. Depoyu klonla
git clone https://github.com/yourorg/nextpos.git
cd nextpos

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini hazırla
cp .env.example .env
# .env dosyasını düzenle

# 4. Veritabanını başlat
docker compose up -d postgres redis

# 5. Prisma migration + seed
cd apps/api
npx prisma migrate dev
npx prisma db seed

# 6. Tüm uygulamaları başlat
cd ../..
npm run dev

# Açılan URL'ler:
# POS SPA:     http://localhost:5173
# QR Menü:     http://localhost:3001
# API:         http://localhost:3000
# API Docs:    http://localhost:3000/api/docs
# SaaS Admin:  http://localhost:5173/saas-admin

# Test kullanıcıları (seed'den):
# Admin:   admin / admin123
# Kasiyer: cashier / kasa123
# PIN:     123456
```

---

> **📌 SON NOTLAR**
>
> Bu doküman PizzaPOS (PHP/MySQL) sisteminin 25+ tablosu, 74 AJAX endpoint'i ve 6 modülü analiz edilerek hazırlanmıştır.
>
> **Kritik Başlangıç Noktaları:**
> 1. Faz 0 ile başla → Turborepo + i18next + CI/CD önce kurulmalı
> 2. Faz 1'de Prisma şemasını çalıştır → Migrations temel (`languages`, `ui_translations`, `receipt_templates` dahil)
> 3. Almanya için KassenSichV (TSE) gerekliliklerini baştan planla — sonradan eklemek çok maliyetli
> 4. Multi-tenant RLS: `SET LOCAL app.tenant_id` + policy `WITH CHECK` (INSERT dahil)
> 5. Offline sync çakışma kuralları §8.2; ödeme idempotency ve Stripe webhook §1.12
> 6. Gerçek proje MySQL + Express kullanıyorsa: bu doküman hedef mimari; Prisma şeması PostgreSQL’e migrate edilirken tip uyarlaması yapın

---
*Son Güncelleme: 28 Mart 2026 | NextPOS v2.1 Tam Proje Yapım Dosyası*
