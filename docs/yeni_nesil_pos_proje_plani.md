# 🚀 YENİ NESİL RESTORAN POS SİSTEMİ — PROJE PLANLAMA DOSYASI

> **Proje Adı:** NextPOS — Hibrit (Bulut + Offline) Restoran Otomasyon Sistemi  
> **Tarih:** 21 Mart 2026  
> **Mevcut Sistem Referansı:** PizzaPOS (PHP/MySQL) → Yeni Sistem: React + Node.js + PostgreSQL  
> **Hedef:** Pizza & Kebap restoranı için 6 modüllü, gerçek zamanlı, offline destekli POS  
> **Desteklenen Diller:** 🇩🇪 Almanca (Deutsch) | 🇹🇷 Türkçe | 🇬🇧 İngilizce (English)

---

## 📋 İÇİNDEKİLER

1. [Mimari & Teknoloji Yığını](#1-mimari--teknoloji-yığını)
2. [Veritabanı Şeması (PostgreSQL)](#2-veritabanı-şeması)
3. [Modül 1: Kasiyer Ekranı](#3-modül-1-kasiyer-ekranı)
4. [Modül 2: Garson Ekranı](#4-modül-2-garson-ekranı)
5. [Modül 3: Mutfak Ekranı (KDS)](#5-modül-3-mutfak-ekranı)
6. [Modül 4: Kurye Ekranı](#6-modül-4-kurye-ekranı)
7. [Modül 5: Admin Paneli](#7-modül-5-admin-paneli)
8. [Modül 6: Müşteri QR Menü / Kiosk](#8-modül-6-müşteri-qr-menü)
9. [Offline & Senkronizasyon](#9-offline--senkronizasyon)
10. [Lisans & Güvenlik](#10-lisans--güvenlik)
11. [WebSocket Olay Haritası](#11-websocket-olay-haritası)
12. [API Endpoint Tasarımı](#12-api-endpoint-tasarımı)
13. [Geliştirme Yol Haritası](#13-geliştirme-yol-haritası)
14. [Donanım Gereksinimleri](#14-donanım-gereksinimleri)
15. [Mevcut PizzaPOS'tan Migrasyon](#15-mevcut-pizzapostan-migrasyon)
16. [Çoklu Dil (i18n) Sistemi](#16-çoklu-dil-i18n-sistemi)
17. [UI/UX & Tema Sistemi](#17-uiux--tema-sistemi)

---

## 1. Mimari & Teknoloji Yığını

### Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BULUT SUNUCU (VPS)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │  PostgreSQL   │  │   Node.js    │  │     Socket.io Server    │   │
│  │  (Ana DB)     │◄─┤  (REST API)  │◄─┤  (Gerçek Zamanlı WS)   │   │
│  └──────────────┘  │  NestJS/     │  └─────────┬───────────────┘   │
│                    │  Express     │            │                    │
│                    └──────┬───────┘            │                    │
│                           │                    │                    │
│                    ┌──────┴────────┐           │                    │
│                    │   JWT Auth    │           │                    │
│                    │  + Lisans     │           │                    │
│                    └──────────────┘            │                    │
└───────────────────────────┼───────────────────┼────────────────────┘
                            │ HTTPS/WSS         │
        ┌───────────────────┼───────────────────┼──────────────┐
        │                RESTORAN YEREL AĞI (Wi-Fi)            │
        │                                                      │
  ┌─────┴──────┐  ┌────────┴───┐  ┌──────────┐  ┌───────────┐ │
  │  KASİYER   │  │   GARSON   │  │  MUTFAK  │  │  MÜŞTERİ  │ │
  │  React SPA │  │  PWA/Tab.  │  │ KDS Ekran│  │  QR Menü  │ │
  │ IndexedDB  │  │ IndexedDB  │  │ Socket.io│  │  Next.js  │ │
  └────────────┘  └────────────┘  └──────────┘  └───────────┘ │
        │                                                      │
  ┌─────┴──────┐  ┌────────────┐                               │
  │  KURYE     │  │  ADMİN     │                               │
  │  Mobil PWA │  │  React SPA │                               │
  └────────────┘  └────────────┘                               │
        └──────────────────────────────────────────────────────┘
```

### Teknoloji Detayları

| Katman | Teknoloji | Versiyon | Neden? |
|--------|-----------|----------|--------|
| **Frontend** | React.js + Vite | 18+ | SPA, hızlı render, component bazlı |
| **Müşteri QR** | Next.js | 14+ | SSR ile hızlı yükleme, SEO |
| **Mobil/Tablet** | PWA (React) | — | Kiosk modu, native hissi, offline |
| **Backend** | Node.js + NestJS | 20+ LTS | TypeScript, modüler, güçlü DI |
| **Gerçek Zamanlı** | Socket.io | 4+ | WebSocket fallback, room desteği |
| **Veritabanı (Bulut)** | PostgreSQL | 16+ | İlişkisel, JSON desteği, güçlü raporlama |
| **Veritabanı (Yerel)** | IndexedDB + Dexie.js | 4+ | Tarayıcıda veri, offline çalışma |
| **State Yönetimi** | Zustand | 4+ | Hafif, basit, React uyumlu |
| **UI Kütüphanesi** | Shadcn/ui + Tailwind | — | Modern, erişilebilir, özelleştirilebilir |
| **Grafik/Rapor** | Recharts | 2+ | React native grafikler |
| **Kimlik Doğrulama** | JWT + Refresh Token | — | Stateles, 48 saat offline |
| **Yazıcı** | ESC/POS protokolü | — | Termal yazıcı desteği |
| **QR Kod** | qrcode.react + html5-qrcode | — | Üretim ve okuma |
| **Çoklu Dil (i18n)** | react-i18next + i18next | 23+ | 🇩🇪 DE / 🇹🇷 TR / 🇬🇧 EN — namespace bazlı çeviri |
| **Tarih/Saat** | date-fns + locale | — | Dil bazlı tarih/para formatı |

---

## 2. Veritabanı Şeması

> [!NOTE]
> Mevcut PizzaPOS'taki 25+ tablo korunarak PostgreSQL'e uyarlandı. Yeni tablolar eklendi.

### Temel Tablolar

```sql
-- ═══════════════════════════════════════
-- KULLANICI & YETKİLENDİRME
-- ═══════════════════════════════════════

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('admin','cashier','waiter','kitchen','courier')),
  pin_code      VARCHAR(6),                    -- Hızlı giriş için PIN
  avatar_url    VARCHAR(255),
  preferred_language VARCHAR(5) DEFAULT 'de',   -- 🌍 Personel arayüz dili
  status        VARCHAR(20) DEFAULT 'active',
  last_login    TIMESTAMPTZ,
  branch_id     INTEGER REFERENCES branches(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  address       TEXT,
  phone         VARCHAR(20),
  tax_number    VARCHAR(30),
  license_key   VARCHAR(255) UNIQUE,
  license_expiry TIMESTAMPTZ,
  is_online     BOOLEAN DEFAULT true,
  last_sync     TIMESTAMPTZ,
  default_language VARCHAR(5) DEFAULT 'de',    -- 🌍 Şube varsayılan dili
  supported_languages TEXT[] DEFAULT '{de,tr,en}', -- 🌍 Desteklenen diller
  settings      JSONB DEFAULT '{}',           -- Şube bazlı ayarlar
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- MENÜ YÖNETİMİ
-- ═══════════════════════════════════════

CREATE TABLE categories (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,          -- Varsayılan isim (fallback)
  translations  JSONB DEFAULT '{              -- 🌍 Çoklu dil çevirileri
    "de": "Kategoriename",
    "tr": "Kategori Adı",
    "en": "Category Name"
  }',
  icon          VARCHAR(50) DEFAULT 'utensils',
  image_url     VARCHAR(255),
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  branch_id     INTEGER REFERENCES branches(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id            SERIAL PRIMARY KEY,
  category_id   INTEGER REFERENCES categories(id),
  name          VARCHAR(150) NOT NULL,          -- Varsayılan isim (fallback)
  translations  JSONB DEFAULT '{              -- 🌍 Çoklu dil çevirileri
    "de": {"name": "", "description": ""},
    "tr": {"name": "", "description": ""},
    "en": {"name": "", "description": ""}
  }',
  description   TEXT,
  base_price    DECIMAL(10,2) NOT NULL,
  image_url     VARCHAR(255),
  is_active     BOOLEAN DEFAULT true,
  prep_time_min INTEGER DEFAULT 15,            -- Tahmini hazırlama süresi (dk)
  allergens     TEXT[],                         -- Alerjen bilgileri (dizi)
  nutritional   JSONB,                         -- Besin değerleri
  sort_order    INTEGER DEFAULT 0,
  branch_id     INTEGER REFERENCES branches(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_variants (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER REFERENCES products(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,          -- Varsayılan: "Klein"
  translations  JSONB DEFAULT '{              -- 🌍 {"de":"Klein","tr":"Küçük","en":"Small"}
    "de": "", "tr": "", "en": ""
  }',
  price         DECIMAL(10,2) NOT NULL,
  sort_order    INTEGER DEFAULT 0,
  is_default    BOOLEAN DEFAULT false
);

CREATE TABLE modifiers (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,          -- Varsayılan: "Extra Käse"
  translations  JSONB DEFAULT '{              -- 🌍 {"de":"Extra Käse","tr":"Ekstra Peynir","en":"Extra Cheese"}
    "de": "", "tr": "", "en": ""
  }',
  price         DECIMAL(10,2) DEFAULT 0,
  category      VARCHAR(50),                    -- "topping", "sauce", "crust"
  is_active     BOOLEAN DEFAULT true
);

CREATE TABLE product_modifiers (
  product_id    INTEGER REFERENCES products(id) ON DELETE CASCADE,
  modifier_id   INTEGER REFERENCES modifiers(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, modifier_id)
);

-- ═══════════════════════════════════════
-- RESTORAN DÜZENI
-- ═══════════════════════════════════════

CREATE TABLE sections (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,          -- "İç Salon", "Bahçe", "Teras"
  floor         INTEGER DEFAULT 0,              -- Kat
  layout_data   JSONB,                          -- Görsel kat planı verisi
  is_active     BOOLEAN DEFAULT true,
  branch_id     INTEGER REFERENCES branches(id),
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE tables (
  id            SERIAL PRIMARY KEY,
  section_id    INTEGER REFERENCES sections(id),
  name          VARCHAR(50) NOT NULL,           -- "Masa 1", "VIP-3"
  capacity      INTEGER DEFAULT 4,
  shape         VARCHAR(20) DEFAULT 'square',   -- square, round, rectangle
  position_x    INTEGER,                        -- Kat planı X koordinatı
  position_y    INTEGER,                        -- Kat planı Y koordinatı
  qr_code       VARCHAR(255),
  status        VARCHAR(20) DEFAULT 'available'
                CHECK (status IN ('available','occupied','reserved',
                       'waiting_order','bill_requested','cleaning')),
  current_session_id INTEGER,
  branch_id     INTEGER REFERENCES branches(id)
);

-- ═══════════════════════════════════════
-- MÜŞTERİ YÖNETİMİ (CRM)
-- ═══════════════════════════════════════

CREATE TABLE customers (
  id              SERIAL PRIMARY KEY,
  customer_code   VARCHAR(20) UNIQUE,           -- Otomatik: MUS000001
  name            VARCHAR(100) NOT NULL,
  phone           VARCHAR(20),
  email           VARCHAR(100),
  personal_qr     VARCHAR(255) UNIQUE,          -- Kişisel QR kod
  tier            VARCHAR(20) DEFAULT 'bronze'
                  CHECK (tier IN ('bronze','silver','gold','platinum')),
  points          INTEGER DEFAULT 0,
  total_visits    INTEGER DEFAULT 0,
  total_spent     DECIMAL(12,2) DEFAULT 0,
  last_visit      TIMESTAMPTZ,
  favorite_products INTEGER[],                   -- Favori ürün ID'leri
  allergies       TEXT[],
  notes           TEXT,
  preferred_language VARCHAR(5) DEFAULT 'tr',
  is_blacklisted  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_addresses (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  label         VARCHAR(50),                    -- "Ev", "İş"
  address       TEXT NOT NULL,
  district      VARCHAR(100),
  city          VARCHAR(50),
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
  table_id      INTEGER REFERENCES tables(id),
  customer_id   INTEGER REFERENCES customers(id),
  guest_name    VARCHAR(100),                   -- Tanınmayan müşteri
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
  session_id      INTEGER REFERENCES table_sessions(id),
  table_id        INTEGER REFERENCES tables(id),
  customer_id     INTEGER REFERENCES customers(id),
  waiter_id       INTEGER REFERENCES users(id),
  cashier_id      INTEGER REFERENCES users(id),
  order_type      VARCHAR(20) DEFAULT 'dine_in'
                  CHECK (order_type IN ('dine_in','takeaway','delivery',
                         'web','phone','qr_menu')),
  source          VARCHAR(20) DEFAULT 'cashier'
                  CHECK (source IN ('cashier','waiter','customer_qr','web','phone')),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','preparing',
                         'ready','served','completed','cancelled')),
  payment_status  VARCHAR(20) DEFAULT 'unpaid'
                  CHECK (payment_status IN ('unpaid','partial','paid','refunded')),
  subtotal        DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  discount_type   VARCHAR(20),                  -- 'percent', 'fixed', 'coupon'
  discount_reason TEXT,
  tax_amount      DECIMAL(10,2) DEFAULT 0,
  total_amount    DECIMAL(10,2) DEFAULT 0,
  is_urgent       BOOLEAN DEFAULT false,
  is_split_bill   BOOLEAN DEFAULT false,
  notes           TEXT,
  delivery_address TEXT,
  delivery_phone  VARCHAR(20),
  courier_id      INTEGER REFERENCES users(id),
  estimated_ready TIMESTAMPTZ,
  offline_id      VARCHAR(50),                  -- Offline oluşturulan siparişler için UUID
  synced          BOOLEAN DEFAULT true,
  branch_id       INTEGER REFERENCES branches(id),
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
  modifiers     JSONB DEFAULT '[]',             -- [{id, name, price}]
  notes         TEXT,                           -- "Acısız", "Glutensiz"
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','sent_to_kitchen','preparing',
                       'ready','served','cancelled')),
  kitchen_printed BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- MUTFAK SİSTEMİ (KDS)
-- ═══════════════════════════════════════

CREATE TABLE kitchen_tickets (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER REFERENCES orders(id),
  table_name    VARCHAR(50),
  waiter_name   VARCHAR(100),
  status        VARCHAR(20) DEFAULT 'waiting'
                CHECK (status IN ('waiting','preparing','ready',
                       'completed','cancelled')),
  is_urgent     BOOLEAN DEFAULT false,
  ticket_number INTEGER,                        -- Günlük sıra no
  items         JSONB NOT NULL,                 -- [{product, qty, notes, modifiers}]
  started_at    TIMESTAMPTZ,
  ready_at      TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  prep_duration INTEGER,                        -- Gerçek süre (saniye)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- ÖDEME SİSTEMİ
-- ═══════════════════════════════════════

CREATE TABLE payments (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER REFERENCES orders(id),
  session_id      INTEGER REFERENCES table_sessions(id),
  amount          DECIMAL(10,2) NOT NULL,
  method          VARCHAR(20) NOT NULL
                  CHECK (method IN ('cash','card','online','voucher','split')),
  status          VARCHAR(20) DEFAULT 'completed',
  tip_amount      DECIMAL(10,2) DEFAULT 0,
  change_amount   DECIMAL(10,2) DEFAULT 0,      -- Para üstü
  received_amount DECIMAL(10,2),                 -- Alınan tutar
  reference       VARCHAR(100),                  -- Kart slip no
  cashier_id      INTEGER REFERENCES users(id),
  notes           TEXT,
  offline_id      VARCHAR(50),
  synced          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- TESLİMAT & KURYE
-- ═══════════════════════════════════════

CREATE TABLE delivery_zones (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100),
  min_order       DECIMAL(10,2) DEFAULT 0,
  delivery_fee    DECIMAL(10,2) DEFAULT 0,
  est_minutes     INTEGER DEFAULT 30,
  polygon         JSONB,                        -- GeoJSON polygon
  is_active       BOOLEAN DEFAULT true,
  branch_id       INTEGER REFERENCES branches(id)
);

CREATE TABLE deliveries (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER REFERENCES orders(id),
  courier_id      INTEGER REFERENCES users(id),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','assigned','picked_up',
                         'on_the_way','delivered','returned','cancelled')),
  address         TEXT,
  phone           VARCHAR(20),
  customer_name   VARCHAR(100),
  lat             DECIMAL(10,8),
  lng             DECIMAL(11,8),
  estimated_time  INTEGER,                      -- Tahmini dk
  actual_time     INTEGER,                      -- Gerçek dk
  delivery_notes  TEXT,
  payment_collected VARCHAR(20),                -- Kapıda ödeme tipi
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
  table_id      INTEGER REFERENCES tables(id),
  session_id    INTEGER REFERENCES table_sessions(id),
  call_type     VARCHAR(30) NOT NULL
                CHECK (call_type IN ('call_waiter','clear_table',
                       'request_bill','request_bill_cash',
                       'request_bill_card','water','custom')),
  message       TEXT,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','seen','in_progress','completed')),
  responded_by  INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  responded_at  TIMESTAMPTZ
);

-- ═══════════════════════════════════════
-- RAPORLAMA & İSTATİSTİKLER
-- ═══════════════════════════════════════

CREATE TABLE daily_summaries (
  id              SERIAL PRIMARY KEY,
  branch_id       INTEGER REFERENCES branches(id),
  report_date     DATE NOT NULL,
  total_orders    INTEGER DEFAULT 0,
  total_revenue   DECIMAL(12,2) DEFAULT 0,
  cash_total      DECIMAL(12,2) DEFAULT 0,
  card_total      DECIMAL(12,2) DEFAULT 0,
  avg_order_value DECIMAL(10,2) DEFAULT 0,
  cancelled_count INTEGER DEFAULT 0,
  discount_total  DECIMAL(10,2) DEFAULT 0,
  tax_total       DECIMAL(10,2) DEFAULT 0,
  top_products    JSONB,                        -- [{id, name, qty, revenue}]
  hourly_data     JSONB,                        -- [{hour, orders, revenue}]
  cashier_id      INTEGER REFERENCES users(id),
  z_report_no     VARCHAR(20),
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  opening_cash    DECIMAL(10,2),
  closing_cash    DECIMAL(10,2),
  UNIQUE(branch_id, report_date)
);

CREATE TABLE point_history (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER REFERENCES customers(id),
  points        INTEGER NOT NULL,
  type          VARCHAR(20) CHECK (type IN ('earn','redeem','expire','adjust')),
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
  entity_type   VARCHAR(50) NOT NULL,           -- 'order', 'payment', 'customer'
  entity_id     VARCHAR(50),
  action        VARCHAR(20),                    -- 'create', 'update', 'delete'
  payload       JSONB NOT NULL,
  status        VARCHAR(20) DEFAULT 'pending',
  retry_count   INTEGER DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  synced_at     TIMESTAMPTZ
);

-- ═══════════════════════════════════════
-- 🌍 ÇOKLU DİL (i18n) SİSTEMİ
-- ═══════════════════════════════════════

CREATE TABLE languages (
  code          VARCHAR(5) PRIMARY KEY,         -- 'de', 'tr', 'en'
  name          VARCHAR(50) NOT NULL,           -- 'Deutsch', 'Türkçe', 'English'
  native_name   VARCHAR(50) NOT NULL,           -- 'Deutsch', 'Türkçe', 'English'
  flag_emoji    VARCHAR(10),                    -- '🇩🇪', '🇹🇷', '🇬🇧'
  direction     VARCHAR(3) DEFAULT 'ltr',       -- 'ltr' veya 'rtl'
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0
);

INSERT INTO languages (code, name, native_name, flag_emoji, sort_order) VALUES
  ('de', 'Almanca', 'Deutsch', '🇩🇪', 1),
  ('tr', 'Türkçe', 'Türkçe', '🇹🇷', 2),
  ('en', 'İngilizce', 'English', '🇬🇧', 3);

-- Arayüz çevirileri (statik metinler: butonlar, etiketler, mesajlar)
CREATE TABLE ui_translations (
  id            SERIAL PRIMARY KEY,
  namespace     VARCHAR(50) NOT NULL,           -- 'common','pos','kitchen','waiter','admin','qrmenu'
  key           VARCHAR(200) NOT NULL,          -- 'button.pay', 'status.preparing'
  lang          VARCHAR(5) REFERENCES languages(code),
  value         TEXT NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(namespace, key, lang)
);

-- Adisyon/Fiş çeviri şablonları
CREATE TABLE receipt_templates (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  lang          VARCHAR(5) REFERENCES languages(code),
  header_text   TEXT,                           -- Firma adı/başlık
  footer_text   TEXT,                           -- Alt bilgi/teşekkür mesajı
  tax_label     VARCHAR(50),                    -- 'MwSt.' / 'KDV' / 'VAT'
  subtotal_label VARCHAR(50),                   -- 'Zwischensumme' / 'Ara Toplam' / 'Subtotal'
  total_label   VARCHAR(50),                    -- 'Gesamtsumme' / 'Toplam' / 'Total'
  payment_labels JSONB,                         -- {'cash':'Bar','card':'Karte'}
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, lang)
);

-- ═══════════════════════════════════════
-- INDEX'LER (Performans)
-- ═══════════════════════════════════════

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(created_at);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_branch ON orders(branch_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_kitchen_status ON kitchen_tickets(status);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_qr ON customers(personal_qr);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_service_calls_status ON service_calls(status);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_ui_translations_ns ON ui_translations(namespace, lang);
```

---

## 3. Modül 1: Kasiyer Ekranı

### Özellikler (Mevcut PizzaPOS'tan devralınan + Yeni)

| Özellik | PizzaPOS'ta Var | Yeni Eklenen |
|---------|:-:|:-:|
| Masa grid görünümü & bölüm filtreleme | ✅ | Görsel kat planı (drag & drop) |
| Sipariş oluşturma & ürün seçimi | ✅ | Boyut/modifikasyon seçimi |
| Nakit / Kart ödeme | ✅ | Voucher, online ödeme |
| Hesap bölme (ürün bazlı) | ✅ | Kişi bazlı bölme |
| Masa taşıma / birleştirme | ✅ | Sürükle-bırak taşıma |
| Garson çağrı bildirimi | ✅ | Socket.io anlık bildirim |
| Günlük raporlar & grafikler | ✅ | Z Raporu, kasa açma/kapama |
| Müşteri arama & kayıt | ✅ | QR tanıma, favori sipariş |
| Adisyon yazdırma | ✅ | ESC/POS direkt yazıcı |
| — | — | **Offline çalışma (48 saat)** |
| — | — | **İndirim/kupon sistemi** |
| — | — | **Hızlı PIN ile giriş** |
| — | — | **Paket servis kurye atama** |
| — | — | **🌍 Çoklu dil arayüz (DE/TR/EN)** |

### Ekran Düzeni

```
┌────────────────────────────────────────────────────────────┐
│  HEADER: Logo | Mod (Masa/Gel-Al/Paket) | Bildirimler | Profil │
├──────────────────────┬─────────────────────────────────────┤
│                      │                                     │
│   MASA PLANI /       │    SİPARİŞ PANELİ                  │
│   KATEGORİ MENÜ      │    ├─ Sepet Listesi                │
│                      │    ├─ Modifikasyonlar               │
│   [Bölüm Sekmeleri]  │    ├─ Notlar                       │
│                      │    ├─ Toplam / İndirim              │
│   Grid / Kat Planı   │    └─ Aksiyon Butonları            │
│                      │       (Mutfağa Gönder / Ödeme)     │
│                      │                                     │
├──────────────────────┴─────────────────────────────────────┤
│  FOOTER: Raporlar | Mutfak | Kasa | 🌍 DE/TR/EN | Offline  │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Modül 2: Garson Ekranı (Tablet PWA)

### Özellikler

- **Görsel Kat Planı:** Renk kodlu masa durumu
  - 🟢 Yeşil: Boş | 🔴 Kırmızı: Dolu | 🟡 Sarı: Sipariş bekliyor
  - 🔵 Mavi: Hesap istedi | 🟠 Turuncu: Yemek hazır
- **Masa Başında Sipariş:** Ürün arama, boyut/modifikasyon seçimi, hızlı not
- **Müşteri Tanıma:** QR okutma veya isim/telefon ile arama
- **Bildirim Merkezi (Socket.io):**
  - Kasiyerden masa yönlendirmesi
  - Mutfaktan "Yemek Hazır" bildirimi
  - Müşteri QR'dan "Garson Çağır" / "Hesap İste" bildirimleri
  - Müşteri QR'dan gelen sipariş onay talebi
- **🌍 Dil Seçimi:** Garson kendi tabletinde DE/TR/EN seçebilir (profil ayarları)
- **İstatistikler:** Günlük performans, servis süresi, en çok satanlar

### Garson Bildirim Akışı

```
Mutfak "Hazır" ──► Socket.io ──► Garson Tableti
                                  ├─ Ses bildirimi 🔔
                                  ├─ Toast mesajı
                                  └─ Badge güncelle

Müşteri QR "Sipariş Gönder" ──► Socket.io ──► Garson Tableti
                                               ├─ "Onay Bekliyor" popup
                                               ├─ Onaylarsa → Mutfağa
                                               └─ Reddederse → Müşteriye bilgi
```

---

## 5. Modül 3: Mutfak Ekranı (KDS)

### Özellikler (Mevcut + Yeni)

| Mevcut (PizzaPOS) | Yeni Eklenen |
|---|---|
| 3 sütunlu kanban (Bekleyen/Hazırlanan/Hazır) | Fiş bazlı VEYA ürün bazlı görünüm |
| Süre takibi (renk kodlu) | Otomatik sıralama (FIFO) |
| Ses bildirimi | Socket.io anlık sipariş düşmesi |
| Tam ekran modu | Bump Bar (fiziksel tuş) desteği |
| Acil sipariş badge | Sipariş kaynağı etiketi (Masa/QR/Paket) |
| — | "Hazır" basınca garsona anlık bildirim |
| — | Günlük mutfak performans skoru |
| — | 🌍 Ürün adları mutfak dilinde (varsayılan: DE) |

---

## 6. Modül 4: Kurye Ekranı (Mobil PWA)

### Özellikler

- Atanan siparişleri listeleme (öncelik sırasıyla)
- Müşteri bilgileri: Ad, adres, telefon, sipariş detayı
- **Tek tıkla navigasyon:** Google Maps / Waze entegrasyonu
- Durum güncelleme: Yola Çıktım → Teslim Ettim
- Kapıda ödeme bildirimi (Nakit/Kart)
- Teslim edilemeyen siparişleri iade etme
- Günlük teslimat özeti ve kazanç

---

## 7. Modül 5: Admin Paneli

### Alt Modüller

| Alt Modül | Özellikler |
|-----------|------------|
| **Dashboard** | Anlık satış, sipariş sayısı, aktif masalar, online şubeler |
| **Menü Yönetimi** | Kategori CRUD, ürün CRUD (boyut/modifikasyon/alerjen/resim), toplu fiyat güncelleme |
| **Masa & Bölüm** | Sürükle-bırak kat planı editörü, QR kod oluşturma/yazdırma |
| **Personel** | Kullanıcı CRUD, rol atama, PIN belirleme, vardiya yönetimi |
| **Müşteri CRM** | Müşteri arama, puan yönetimi, kara liste, iletişim geçmişi |
| **Raporlama** | Günlük/Haftalık/Aylık ciro, en çok satanlar, personel performansı, saatlik ısı haritası |
| **Lisans** | Şubelerin durumu, lisans süreleri, son senkronizasyon |
| **Adisyon Tasarımı** | Canlı önizleme, logo, font, kağıt boyutu (PizzaPOS'tan devralındı) |
| **🌍 Dil Yönetimi** | Desteklenen dilleri aç/kapat, varsayılan dili seç, çeviri editörü, ürün/kategori çevirileri |
| **🌍 Adisyon/Fiş Dili** | Her dil için ayrı adisyon şablonu (başlık, alt bilgi, KDV/MwSt etiketi) |
| **Ayarlar** | Firma bilgileri, yazıcılar, para birimi, KDV oranı, dil |

---

## 8. Modül 6: Müşteri QR Menü / Kiosk

### Giriş Yöntemleri

```
Müşteri Masaya Oturuyor
        │
        ├─► Kendi telefonundan masadaki QR'ı tara
        │   └─► Next.js web app açılır (table_id otomatik)
        │
        └─► Masadaki tablet (Kiosk modu)
            └─► Her zaman açık, masaya özel

Oturum Açma:
        ├─► Kişisel QR ile giriş → Müşteri tanınır → "Hoş geldin, Ahmet!"
        ├─► İsim ile giriş → Geçici oturum → "Masa 5 - Ayşe"
        └─► Anonim → Sadece menü görür, sipariş için isim gerekli
```

### Özellikler

1. **Kişiselleştirilmiş Menü:**
   - "Favori Siparişlerin" bölümü
   - "Geçen seferki siparişini tekrarla" butonu
   - Alerjen filtreleme
   - 🌍 **Otomatik dil algılama:** Telefon tarayıcı dilini tespit et (Accept-Language)
   - 🌍 **Manuel dil seçici:** Üst kısımda 🇩🇪 | 🇹🇷 | 🇬🇧 bayrak butonları

2. **Görsel Menü (Çok Dilli):**
   - Büyük ürün resimleri, seçilen dilde açıklamalar
   - Pizza boyutu seçimi → DE: Klein/Normal/Groß/Familie | TR: Küçük/Normal/Büyük/Aile | EN: Small/Regular/Large/Family
   - Hamur tipi, ekstra malzeme, sos seçimi (hepsi seçilen dilde)
   - Anlık fiyat güncelleme (€ formatı dile göre: 12,50 € / €12.50)

3. **Sepet & Sipariş:**
   - Sepete ekle/çıkar, miktar değiştir
   - Toplam tutarı anlık görme
   - Sipariş notu ekleme
   - **"Siparişi Gönder" → Garson onay akışı** (doğrudan mutfağa gitmez!)

4. **Hizmet Çağrıları (Seçilen Dilde):**
   - 🔔 Kellner rufen / Garson Çağır / Call Waiter
   - 🥤 Abräumen / Boşları Al / Clear Table
   - 💰 Rechnung / Hesap İste / Request Bill (Nakit/Kart seçeneği)
   - 💧 Wasser / Su İste / Water
   - ✏️ Nachricht / Özel Mesaj / Message

### Garson Onay Akışı (Güvenlik)

```
Müşteri "Siparişi Gönder" ──► Socket.io ──► Garson Tableti
                                             │
                                    ┌────────┴────────┐
                                    │ ONAY BEKLİYOR   │
                                    │ Masa 5 - Ahmet  │
                                    │ 2x Margherita   │
                                    │ 1x Cola         │
                                    │                 │
                                    │ [Onayla] [Red]  │
                                    └────────┬────────┘
                                             │
                              Onaylandı ─────┼───── Reddedildi
                                 │                      │
                          Mutfağa Gönder          Müşteriye Bilgi
                          + Kasaya kaydet         "Garsonunuz birazdan
                                                   masanıza gelecek"
```

---

## 9. Offline & Senkronizasyon

### 48 Saat Offline Mekanizması

```
İnternet VAR                    İnternet YOK (max 48 saat)
    │                                │
    ├─ JWT token yenile              ├─ Son token ile çalış
    ├─ Siparişleri buluta yaz        ├─ Siparişleri IndexedDB'ye yaz
    ├─ Menüyü senkronize et          ├─ Yerel menüden göster
    ├─ Raporları gönder              ├─ Raporları biriktir
    └─ Lisansı doğrula               └─ 48 saat sayacı başlat
                                          │
                                     48 saat dolunca
                                          │
                                     ⚠️ Sadece uyarı göster
                                     (Sistem kilitlenMEZ,
                                      ama senkronize et uyarısı)
```

### IndexedDB Tabloları (Dexie.js)

```javascript
const db = new Dexie('NextPOS');
db.version(1).stores({
  // Offline sipariş kuyruğu
  pendingOrders: '++id, offlineId, status, createdAt',
  // Offline ödeme kuyruğu
  pendingPayments: '++id, offlineId, orderId, createdAt',
  // Yerel menü cache
  categories: 'id, name, sortOrder',
  products: 'id, categoryId, name, basePrice',
  variants: 'id, productId, name, price',
  modifiers: 'id, name, price',
  // Yerel müşteri cache
  customers: 'id, phone, personalQr, name',
  // Senkronizasyon kuyruğu
  syncQueue: '++id, entityType, action, status, createdAt',
  // Oturum ve ayarlar
  settings: 'key',
  authToken: 'key'
});
```

### Senkronizasyon Akışı

```
İnternet geldi → SyncManager başla
    │
    ├─1. Auth token yenile (JWT refresh)
    ├─2. syncQueue'dan bekleyen kayıtları al
    ├─3. Her kaydı sırayla API'ye gönder
    │    ├─ Başarılı → syncQueue'dan sil, yerel ID'yi sunucu ID ile güncelle
    │    └─ Başarısız → retry_count++, hata logla
    ├─4. Sunucudan güncel menüyü çek → yerel cache güncelle
    └─5. Son sync zamanını kaydet
```

---

## 10. Lisans & Güvenlik

### JWT Akışı

```
Login → Access Token (15dk) + Refresh Token (7gün)
    │
    ├─ Her API isteğinde Access Token gönder
    ├─ Access Token süresi dolunca → Refresh Token ile yenile
    ├─ Refresh Token süresi dolunca → Yeniden login
    └─ Offline'da → Son geçerli token ile 48 saat çalış
```

### Güvenlik Katmanları

| Katman | Mekanizma |
|--------|-----------|
| **Kimlik Doğrulama** | JWT (Access + Refresh Token) |
| **Yetkilendirme** | Role-based (RBAC) + resource-based |
| **API Güvenliği** | Rate limiting, CORS, Helmet.js |
| **Veri Güvenliği** | AES-256 şifreleme (hassas veriler), bcrypt (şifreler) |
| **İletişim** | HTTPS + WSS (TLS) |
| **CSRF** | SameSite cookie + token |
| **XSS** | React otomatik escape + DOMPurify |
| **SQL Injection** | Parameterized queries (Knex.js / Prisma) |

---

## 11. WebSocket Olay Haritası

### Socket.io Rooms & Events

```javascript
// ROOM YAPISI
`branch:${branchId}`           // Şube geneli
`table:${tableId}`             // Masa bazlı
`kitchen:${branchId}`          // Mutfak
`waiter:${userId}`             // Garson kişisel
`courier:${userId}`            // Kurye kişisel

// OLAYLAR (Events)
// ═══ Sipariş ═══
'order:new'                    // Yeni sipariş (→ mutfak + kasiyer)
'order:confirmed'              // Garson onayladı (→ mutfak)
'order:status_changed'         // Durum değişti (→ ilgili herkes)
'order:cancelled'              // İptal (→ mutfak + kasiyer)

// ═══ Mutfak ═══
'kitchen:item_preparing'       // Hazırlanıyor (→ masa ekranı)
'kitchen:item_ready'           // Hazır (→ garson + kasiyer + müşteri)
'kitchen:ticket_bump'          // Tamamlandı

// ═══ Masa ═══
'table:status_changed'         // Masa durumu değişti (→ garson + kasiyer)
'table:session_opened'         // Yeni oturum (→ garson)
'table:session_closed'         // Oturum kapandı (→ garson + kasiyer)
'table:transferred'            // Masa taşındı (→ garson)

// ═══ Müşteri QR ═══
'customer:order_request'       // Sipariş talebi (→ garson)
'customer:order_approved'      // Onaylandı (→ müşteri cihazı)
'customer:order_rejected'      // Reddedildi (→ müşteri cihazı)
'customer:service_call'        // Garson çağrısı (→ garson + kasiyer)

// ═══ Teslimat ═══
'delivery:assigned'            // Kurye atandı (→ kurye)
'delivery:status_changed'      // Teslimat durumu (→ kasiyer)
'delivery:location_update'     // Konum güncellemesi (→ kasiyer)

// ═══ Sistem ═══
'sync:completed'               // Senkronizasyon tamamlandı
'system:menu_updated'          // Menü güncellendi (→ tüm cihazlar)
'system:announcement'          // Duyuru (→ tüm personel)
```

---

## 12. API Endpoint Tasarımı

### RESTful API Yapısı

```
BASE URL: /api/v1

// ═══ AUTH ═══
POST   /auth/login              // Giriş (username + password)
POST   /auth/login/pin          // PIN ile giriş
POST   /auth/refresh            // Token yenile
POST   /auth/logout             // Çıkış

// ═══ MENÜ ═══
GET    /menu/categories         // Kategoriler
GET    /menu/products           // Ürünler (filter: categoryId)
GET    /menu/products/:id       // Ürün detay (varyantlar + modifikatörler)
POST   /menu/products           // Ürün ekle (admin)
PUT    /menu/products/:id       // Ürün güncelle (admin)
DELETE /menu/products/:id       // Ürün sil (admin)

// ═══ MASALAR ═══
GET    /tables                  // Tüm masalar (section filter)
GET    /tables/:id/status       // Masa durumu
POST   /tables/:id/open         // Oturum aç
POST   /tables/:id/transfer     // Masa taşı
POST   /tables/:id/merge        // Masa birleştir

// ═══ SİPARİŞLER ═══
POST   /orders                  // Sipariş oluştur
GET    /orders/:id              // Sipariş detay
PUT    /orders/:id/status       // Durum güncelle
POST   /orders/:id/items        // Ürün ekle
DELETE /orders/:id/items/:itemId // Ürün çıkar
POST   /orders/:id/send-kitchen // Mutfağa gönder

// ═══ ÖDEME ═══
POST   /payments                // Ödeme al
POST   /payments/split          // Hesap böl
GET    /payments/order/:orderId // Sipariş ödemeleri

// ═══ MUTFAK ═══
GET    /kitchen/tickets         // Aktif fişler
PUT    /kitchen/tickets/:id     // Durum güncelle
POST   /kitchen/bump/:id       // Tamamla (bump)

// ═══ MÜŞTERİ ═══
GET    /customers/search        // Ara (phone, name, qr)
POST   /customers               // Yeni müşteri
GET    /customers/:id/history   // Geçmiş siparişler
POST   /customers/:id/points   // Puan işlemi

// ═══ TESLİMAT ═══
GET    /deliveries              // Aktif teslimatlar
PUT    /deliveries/:id/status   // Durum güncelle
PUT    /deliveries/:id/assign   // Kurye ata

// ═══ RAPORLAR ═══
GET    /reports/daily           // Günlük özet
GET    /reports/products        // Ürün satış raporu
GET    /reports/staff           // Personel raporu
POST   /reports/z-report        // Z Raporu oluştur

// ═══ SYNC ═══
POST   /sync/push               // Offline verileri gönder
GET    /sync/pull               // Güncel verileri çek

// ═══ SERVİS ÇAĞRILARI ═══
POST   /service-calls           // Yeni çağrı (müşteri QR'dan)
PUT    /service-calls/:id       // Yanıtla
```

---

## 13. Geliştirme Yol Haritası

| Faz | Kapsam | Süre | Detay |
|-----|--------|------|-------|
| **Faz 0** | Proje Kurulumu | 1 Hafta | Monorepo (Turborepo), ESLint, Prettier, CI/CD, Docker Compose |
| **Faz 1** | Veritabanı & API Temeli | 2 Hafta | PostgreSQL şema, NestJS proje yapısı, JWT auth, temel CRUD API'ler |
| **Faz 2** | Kasiyer Ekranı + Offline | 3 Hafta | React SPA, masa planı, sipariş akışı, ödeme, IndexedDB, senkronizasyon |
| **Faz 3** | Garson + WebSocket | 2 Hafta | Tablet PWA, Socket.io entegrasyonu, bildirim merkezi, kat planı |
| **Faz 4** | Mutfak KDS + Kurye + QR Menü | 3 Hafta | KDS ekranı, kurye PWA, müşteri QR web app, garson onay akışı |
| **Faz 5** | Admin Panel + Raporlar | 2 Hafta | Menü editörü, personel yönetimi, raporlama dashboard, grafik |
| **Faz 6** | Yazıcı + Donanım | 1 Hafta | ESC/POS entegrasyonu, termal yazıcı, kiosk modu |
| **Faz 7** | Test & Canlıya Alma | 1 Hafta | Restoran simülasyonu, stress test, offline senaryo, deployment |
| | **TOPLAM** | **~15 Hafta** | |

---

## 14. Donanım Gereksinimleri

| Cihaz | Özellik | Kullanım |
|-------|---------|----------|
| **Kasiyer PC** | Dokunmatik All-in-One, min 4GB RAM, SSD | Ana POS terminali |
| **Termal Yazıcı** | ESC/POS uyumlu, 80mm, USB/Ethernet | Fiş ve adisyon |
| **Para Çekmecesi** | RJ11 bağlantılı (yazıcı tetiklemeli) | Nakit yönetimi |
| **Garson Tablet** | 8-10" Android/iOS, Wi-Fi | Masa başı sipariş |
| **Mutfak Ekranı** | 15-22" dokunmatik monitor, su geçirmez | KDS |
| **Masa Tableti** | 8" Android tablet (Kiosk modu) | Müşteri QR menü |
| **Wi-Fi Router** | Dual-band, min 50 cihaz desteği | Restoran ağı |
| **Sunucu** | VPS: 4 vCPU, 8GB RAM, 100GB SSD | Bulut backend |

---

## 15. Mevcut PizzaPOS'tan Migrasyon

### Veri Aktarım Planı

| PizzaPOS Tablosu | → NextPOS Tablosu | Notlar |
|---|---|---|
| `categories` | `categories` | `icon` ve `sort_order` korunur |
| `products` | `products` + `product_variants` | Boyutlar ayrı tabloya |
| `sections` | `sections` | `layout_data` yeni |
| `tables` | `tables` | `position_x/y`, `shape` yeni |
| `customers` | `customers` | `personal_qr` yeni |
| `customer_addresses` | `customer_addresses` | Aynı yapı |
| `orders` | `orders` | `source`, `offline_id` yeni |
| `order_items` | `order_items` | `modifiers` JSONB yeni |
| `kitchen_orders` | `kitchen_tickets` | Fişe dönüştü |
| `payments` | `payments` | `tip_amount`, `change_amount` yeni |
| `settings` | `branches.settings` | JSONB olarak |
| `check_design` | `branches.settings` | JSONB alt objesi |
| `users` | `users` | `pin_code`, `branch_id` yeni |

### Migrasyon Scripti Sırası

```
1. branches → Şube oluştur
2. users → Kullanıcıları aktar (şifreleri bcrypt ile yeniden hashle)
3. categories → Kategorileri aktar
4. products + product_variants → Ürünleri aktar
5. sections + tables → Bölüm ve masaları aktar
6. customers + customer_addresses → Müşterileri aktar
7. Geçmiş orders + payments → Raporlama için aktar (opsiyonel)
```

---

## 16. Çoklu Dil (i18n) Sistemi

### Desteklenen Diller

| Kod | Dil | Bayrak | Kullanım Alanı | Varsayılan? |
|-----|-----|--------|----------------|:-----------:|
| `de` | Deutsch (Almanca) | 🇩🇪 | Personel arayüzü + Müşteri menü + Adisyon | ✅ Evet |
| `tr` | Türkçe | 🇹🇷 | Personel arayüzü + Müşteri menü + Adisyon | — |
| `en` | English (İngilizce) | 🇬🇧 | Personel arayüzü + Müşteri menü + Adisyon | — |

### i18n Mimari Yapısı

```
Kimden dil alınır?
    │
    ├─ PERSONEL (Kasiyer/Garson/Mutfak/Admin)
    │   └─ users.preferred_language → localStorage → i18next
    │
    ├─ MÜŞTERİ QR MENÜ (Telefon)
    │   ├─ 1. URL parametresi: ?lang=tr
    │   ├─ 2. Müşteri profili: customers.preferred_language
    │   ├─ 3. Tarayıcı dili: navigator.language → Accept-Language
    │   └─ 4. Şube varsayılanı: branches.default_language
    │
    ├─ MÜŞTERİ TABLET (Kiosk)
    │   └─ Şube varsayılanı + ekrandaki dil seçici butonlar
    │
    └─ ADİSYON / FİŞ
        └─ Şubenin adisyon dili (receipt_templates tablosundan)
```

### Frontend Çeviri Dosya Yapısı (react-i18next)

```
src/locales/
├── de/                          # 🇩🇪 Almanca
│   ├── common.json              # Genel: butonlar, etiketler, hatalar
│   ├── pos.json                 # Kasiyer arayüzü
│   ├── waiter.json              # Garson arayüzü
│   ├── kitchen.json             # Mutfak arayüzü
│   ├── admin.json               # Admin paneli
│   ├── qrmenu.json              # Müşteri QR menü
│   └── reports.json             # Raporlama
│
├── tr/                          # 🇹🇷 Türkçe
│   ├── common.json
│   ├── pos.json
│   ├── waiter.json
│   ├── kitchen.json
│   ├── admin.json
│   ├── qrmenu.json
│   └── reports.json
│
└── en/                          # 🇬🇧 İngilizce
    ├── common.json
    ├── pos.json
    ├── waiter.json
    ├── kitchen.json
    ├── admin.json
    ├── qrmenu.json
    └── reports.json
```

### Örnek Çeviri Dosyaları

**`de/common.json`**
```json
{
  "app": {
    "name": "NextPOS",
    "welcome": "Willkommen"
  },
  "nav": {
    "tables": "Tische",
    "orders": "Bestellungen",
    "kitchen": "Küche",
    "reports": "Berichte",
    "settings": "Einstellungen",
    "logout": "Abmelden"
  },
  "button": {
    "save": "Speichern",
    "cancel": "Abbrechen",
    "delete": "Löschen",
    "edit": "Bearbeiten",
    "add": "Hinzufügen",
    "confirm": "Bestätigen",
    "pay": "Bezahlen",
    "print": "Drucken",
    "send_to_kitchen": "An Küche senden",
    "split_bill": "Rechnung teilen",
    "move_table": "Tisch verschieben",
    "call_waiter": "Kellner rufen",
    "request_bill": "Rechnung bitte"
  },
  "status": {
    "available": "Frei",
    "occupied": "Besetzt",
    "reserved": "Reserviert",
    "waiting": "Wartend",
    "preparing": "In Zubereitung",
    "ready": "Fertig",
    "served": "Serviert",
    "completed": "Abgeschlossen",
    "cancelled": "Storniert"
  },
  "payment": {
    "cash": "Bar",
    "card": "Karte",
    "total": "Gesamtsumme",
    "subtotal": "Zwischensumme",
    "tax": "MwSt.",
    "tip": "Trinkgeld",
    "change": "Rückgeld",
    "received": "Erhalten"
  }
}
```

**`tr/common.json`**
```json
{
  "app": {
    "name": "NextPOS",
    "welcome": "Hoş geldiniz"
  },
  "nav": {
    "tables": "Masalar",
    "orders": "Siparişler",
    "kitchen": "Mutfak",
    "reports": "Raporlar",
    "settings": "Ayarlar",
    "logout": "Çıkış"
  },
  "button": {
    "save": "Kaydet",
    "cancel": "İptal",
    "delete": "Sil",
    "edit": "Düzenle",
    "add": "Ekle",
    "confirm": "Onayla",
    "pay": "Öde",
    "print": "Yazdır",
    "send_to_kitchen": "Mutfağa Gönder",
    "split_bill": "Hesap Böl",
    "move_table": "Masa Taşı",
    "call_waiter": "Garson Çağır",
    "request_bill": "Hesap İste"
  },
  "status": {
    "available": "Müsait",
    "occupied": "Dolu",
    "reserved": "Rezerve",
    "waiting": "Bekliyor",
    "preparing": "Hazırlanıyor",
    "ready": "Hazır",
    "served": "Servis Edildi",
    "completed": "Tamamlandı",
    "cancelled": "İptal Edildi"
  },
  "payment": {
    "cash": "Nakit",
    "card": "Kredi Kartı",
    "total": "Toplam",
    "subtotal": "Ara Toplam",
    "tax": "KDV",
    "tip": "Bahşiş",
    "change": "Para Üstü",
    "received": "Alınan"
  }
}
```

**`en/common.json`**
```json
{
  "app": {
    "name": "NextPOS",
    "welcome": "Welcome"
  },
  "nav": {
    "tables": "Tables",
    "orders": "Orders",
    "kitchen": "Kitchen",
    "reports": "Reports",
    "settings": "Settings",
    "logout": "Logout"
  },
  "button": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "confirm": "Confirm",
    "pay": "Pay",
    "print": "Print",
    "send_to_kitchen": "Send to Kitchen",
    "split_bill": "Split Bill",
    "move_table": "Move Table",
    "call_waiter": "Call Waiter",
    "request_bill": "Request Bill"
  },
  "status": {
    "available": "Available",
    "occupied": "Occupied",
    "reserved": "Reserved",
    "waiting": "Waiting",
    "preparing": "Preparing",
    "ready": "Ready",
    "served": "Served",
    "completed": "Completed",
    "cancelled": "Cancelled"
  },
  "payment": {
    "cash": "Cash",
    "card": "Card",
    "total": "Total",
    "subtotal": "Subtotal",
    "tax": "VAT",
    "tip": "Tip",
    "change": "Change",
    "received": "Received"
  }
}
```

### React i18next Yapılandırması

```typescript
// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'de',             // Varsayılan: Almanca
    supportedLngs: ['de', 'tr', 'en'],
    ns: ['common', 'pos', 'waiter', 'kitchen', 'admin', 'qrmenu', 'reports'],
    defaultNS: 'common',
    detection: {
      // Dil belirleme sırası
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'nextpos_language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,           // React zaten XSS koruyor
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  });

export default i18n;
```

### Dil Seçici Component (Tüm Modüllerde)

```tsx
// src/components/LanguageSwitcher.tsx
import { useTranslation } from 'react-i18next';

const languages = [
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = async (lang: string) => {
    await i18n.changeLanguage(lang);
    localStorage.setItem('nextpos_language', lang);
    // Kullanıcı tercihini API'ye kaydet
    await fetch('/api/v1/users/me/language', {
      method: 'PUT',
      body: JSON.stringify({ language: lang }),
    });
  };

  return (
    <div className="flex gap-1">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => changeLanguage(lang.code)}
          className={`px-2 py-1 rounded text-lg ${
            i18n.language === lang.code
              ? 'bg-primary text-white ring-2'
              : 'bg-muted hover:bg-accent'
          }`}
          title={lang.label}
        >
          {lang.flag}
        </button>
      ))}
    </div>
  );
}
```

### Ürün Adını Dile Göre Getirme (Yardımcı Fonksiyon)

```typescript
// src/utils/getTranslation.ts

export function getProductName(
  product: { name: string; translations: Record<string, any> },
  lang: string
): string {
  // 1. İstenen dildeki çeviri varsa kullan
  const t = product.translations?.[lang];
  if (t?.name) return t.name;
  // 2. Yoksa Almanca'ya düş (varsayılan)
  if (product.translations?.de?.name) return product.translations.de.name;
  // 3. Hiçbiri yoksa fallback
  return product.name;
}

export function getCategoryName(
  category: { name: string; translations: Record<string, string> },
  lang: string
): string {
  return category.translations?.[lang] || category.translations?.de || category.name;
}

// Kullanım:
// const name = getProductName(product, i18n.language);
```

### Adisyon / Fiş Çoklu Dil

```
┌───────────────────────────┐
│    🇩🇪 ALMANCA ADİSYON     │
│                           │
│    Restaurant Özperto     │
│    Musterstraße 15        │
│                           │
│  Tisch: 5  Datum: 21.03   │
│  Kellner: Ahmet           │
│                           │
│  2x Döner Teller   14,00€ │
│  1x Cola             3,00€ │
│  ─────────────────────── │
│  Zwischensumme:    17,00€ │
│  MwSt. 19%:         2,72€ │
│  Gesamtsumme:      17,00€ │
│                           │
│  Vielen Dank für          │
│  Ihren Besuch!            │
└───────────────────────────┘

┌───────────────────────────┐
│    🇹🇷 TÜRKÇE ADİSYON      │
│                           │
│    Restaurant Özperto     │
│    Musterstraße 15        │
│                           │
│  Masa: 5  Tarih: 21.03    │
│  Garson: Ahmet            │
│                           │
│  2x Döner Tabak    14,00€ │
│  1x Kola            3,00€ │
│  ─────────────────────── │
│  Ara Toplam:       17,00€ │
│  KDV %19:           2,72€ │
│  Toplam:           17,00€ │
│                           │
│  Bizi tercih ettiğiniz    │
│  için teşekkür ederiz!    │
└───────────────────────────┘
```

### Müşteri QR Menü — Dil Algılama Akışı

```
Müşteri masadaki QR'ı tarıyor
       │
       ▼
https://pos.example.com/menu?table=5
       │
       ├─ URL'de ?lang=tr var mı? → EVET → Türkçe göster
       │
       ├─ Müşteri giriş yaptı mı? → customer.preferred_language → O dilde göster
       │
       ├─ Tarayıcı dili kontrol et (navigator.language)
       │   ├─ 'de-DE' veya 'de' → 🇩🇪 Almanca
       │   ├─ 'tr-TR' veya 'tr' → 🇹🇷 Türkçe
       │   ├─ 'en-*'            → 🇬🇧 İngilizce
       │   └─ Diğer             → Şube varsayılanı (branches.default_language)
       │
       ▼
   Ekranın üst kısmında her zaman 🇩🇪 🇹🇷 🇬🇧 bayrak butonları görünür
   Müşteri istediği zaman dil değiştirebilir
```

### API Endpoint'leri (i18n)

```
// ═══ DİL (i18n) ═══
GET    /api/v1/languages              // Aktif diller listesi
PUT    /api/v1/users/me/language       // Kullanıcı dil tercihi güncelle
GET    /api/v1/translations/:ns/:lang  // Çeviri dosyasını getir
PUT    /api/v1/translations/:ns/:lang  // Çeviri güncelle (admin)
GET    /api/v1/menu/products?lang=de   // Ürünleri istenen dilde getir
GET    /api/v1/receipt-template/:lang   // Adisyon şablonunu getir
```

### Admin Paneli — Çeviri Editörü

```
┌────────────────────────────────────────────────────────────┐
│  MENÜ YÖNETİMİ > Ürün Düzenle: Döner Teller              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  🇩🇪 Almanca:  [Döner Teller________________]             │
│  🇩🇪 Açıklama: [Döner mit Reis, Salat und Soße_]          │
│                                                            │
│  🇹🇷 Türkçe:   [Döner Tabak__________________]            │
│  🇹🇷 Açıklama: [Pilav, salata ve sos ile döner_]          │
│                                                            │
│  🇬🇧 İngilizce:[Döner Plate__________________]            │
│  🇬🇧 Açıklama: [Döner with rice, salad and sauce]         │
│                                                            │
│  Fiyat: [14,00] €   Kategori: [DÖNER SPEZIALITÄTEN ▼]    │
│                                                            │
│  [Kaydet / Speichern / Save]                               │
└────────────────────────────────────────────────────────────┘
```

### IndexedDB'de Çeviri Cache (Offline)

```javascript
// Dexie.js store güncellemesi
db.version(2).stores({
  // ... mevcut storeler ...
  // 🌍 Çeviri cache (offline'da dil değiştirebilmek için)
  translations: '[namespace+lang], namespace, lang',
  languages: 'code',
});

// Senkronizasyonda çevirileri de çek
async function syncTranslations() {
  const languages = ['de', 'tr', 'en'];
  const namespaces = ['common', 'pos', 'waiter', 'kitchen', 'qrmenu'];
  
  for (const lang of languages) {
    for (const ns of namespaces) {
      const data = await fetch(`/api/v1/translations/${ns}/${lang}`);
      await db.translations.put({
        namespace: ns,
        lang: lang,
        data: await data.json(),
        syncedAt: new Date()
      });
    }
  }
}
```

### Yol Haritası Güncellemesi

> [!IMPORTANT]
> i18n altyapısı **Faz 0**'da kurulmalı (i18next config), çeviri dosyaları ise her modülün kendi fazında yazılmalıdır.

| Faz | i18n Görevi |
|-----|-------------|
| **Faz 0** | i18next kurulumu, çeviri dosya yapısı, LanguageSwitcher component |
| **Faz 1** | DB şeması: `languages`, `ui_translations`, `receipt_templates` tabloları |
| **Faz 2** | Kasiyer: `pos.json` çevirileri (DE/TR/EN), adisyon dil seçimi |
| **Faz 3** | Garson: `waiter.json` çevirileri, tablet dil tercihi |
| **Faz 4** | Mutfak: `kitchen.json`, QR Menü: `qrmenu.json` + dil algılama |
| **Faz 5** | Admin: Çeviri editörü UI, ürün/kategori çeviri formu, adisyon şablonları |

---

> [!IMPORTANT]
> Bu doküman, mevcut PizzaPOS sisteminin **25+ tablosu, 74 AJAX endpoint'i ve 6 modülü** analiz edilerek oluşturulmuştur. Yeni sistem, mevcut tüm özellikleri koruyarak üzerine **offline çalışma, WebSocket gerçek zamanlı iletişim, müşteri QR menü, kurye takip ve 🌍 çoklu dil (DE/TR/EN)** eklemektedir.

> [!TIP]
> Geliştirmeye **Faz 0 (Proje Kurulumu)** ile başlayın. `npx create-turbo@latest` ile monorepo oluşturun, `i18next` yapılandırmasını kurun, ardından Faz 1'de PostgreSQL şemasını çalıştırın.

---

*Bu proje planı, PizzaPOS mevcut sistem analizi + Gemini mimari önerisi birleştirilerek hazırlanmıştır. Çoklu dil (i18n) desteği entegre edilmiştir.*

---

## 17. UI/UX & Tema Sistemi

> [!NOTE]
> Tasarım referansı: Koyu (Dark) tema, yeşil/teal aksanlar, büyük dokunmatik alanlar, restoran POS için optimize edilmiş.

### Renk Paleti

| Token | Değer | Kullanım |
|-------|--------|----------|
| `--bg-primary` | `#0F1923` | Ana arka plan (en koyu) |
| `--bg-secondary` | `#1A2634` | Kart ve panel arka planları |
| `--bg-tertiary` | `#243447` | Hover, aktif eleman arka planı |
| `--bg-elevated` | `#2A3F55` | Yüseltilmiş kartlar, modallar |
| `--accent-primary` | `#10B981` | Ana aksan: butonlar, badge, aktif ikon (Yeşil/Teal) |
| `--accent-hover` | `#059669` | Aksan hover durumu |
| `--accent-glow` | `rgba(16,185,129,0.15)` | Aksan parlama efekti |
| `--text-primary` | `#F1F5F9` | Ana metin (beyazımsı) |
| `--text-secondary` | `#94A3B8` | İkincil metin (gri) |
| `--text-muted` | `#64748B` | Soluk metin |
| `--border-default` | `#1E3A50` | Kart ve panel sınırları |
| `--border-active` | `#10B981` | Aktif eleman sınırı |
| `--danger` | `#EF4444` | Hata, iptal, silme |
| `--warning` | `#F59E0B` | Uyarı, bekleyen |
| `--info` | `#3B82F6` | Bilgi, hesap istedi |
| `--success` | `#10B981` | Başarılı, hazır |

### Tailwind CSS Özelleştirme

```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pos: {
          bg:        { DEFAULT: '#0F1923', card: '#1A2634', hover: '#243447', elevated: '#2A3F55' },
          accent:    { DEFAULT: '#10B981', hover: '#059669', glow: 'rgba(16,185,129,0.15)' },
          text:      { DEFAULT: '#F1F5F9', secondary: '#94A3B8', muted: '#64748B' },
          border:    { DEFAULT: '#1E3A50', active: '#10B981' },
          danger:    '#EF4444',
          warning:   '#F59E0B',
          info:      '#3B82F6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],      // Fiyat/numara için
      },
      fontSize: {
        'pos-xs':    ['0.75rem', { lineHeight: '1rem' }],
        'pos-sm':    ['0.875rem', { lineHeight: '1.25rem' }],
        'pos-base':  ['1rem', { lineHeight: '1.5rem' }],
        'pos-lg':    ['1.125rem', { lineHeight: '1.75rem' }],
        'pos-xl':    ['1.5rem', { lineHeight: '2rem' }],
        'pos-2xl':   ['2rem', { lineHeight: '2.5rem' }],
        'pos-price': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '700' }],
      },
      borderRadius: {
        'pos-sm': '8px',
        'pos-md': '12px',
        'pos-lg': '16px',
        'pos-xl': '20px',
      },
      spacing: {
        'touch-min': '44px',       // Minimum dokunmatik hedef boyutu
        'touch-lg':  '56px',       // Büyük dokunmatik buton
      },
      boxShadow: {
        'pos-card': '0 2px 8px rgba(0,0,0,0.3)',
        'pos-elevated': '0 8px 24px rgba(0,0,0,0.4)',
        'pos-glow': '0 0 20px rgba(16,185,129,0.2)',
      },
      animation: {
        'pos-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pos-slide-up': 'slideUp 0.3s ease-out',
        'pos-fade-in': 'fadeIn 0.2s ease-out',
      }
    },
  },
};
```

### Tipografi

| Kullanım | Font | Boyut | Ağırlık |
|----------|------|-------|----------|
| Başlıklar (H1-H3) | Inter | 20-28px | Bold (700) |
| Kategori isimleri | Inter | 13-14px | Semi-Bold (600) |
| Ürün isimleri | Inter | 14-16px | Medium (500) |
| **Fiyatlar** | **JetBrains Mono** | **16-24px** | **Bold (700)** |
| Buton metni | Inter | 14-16px | Semi-Bold (600) |
| Durum barı (header) | Inter | 12-13px | Regular (400) |
| Sipariş notları | Inter | 12px | Regular (400) |
| Toplam tutar | JetBrains Mono | 24-32px | Bold (700) |

### Bileşen Stilleri

#### 1. Kategori Butonları (Sol Sidebar)
```css
.category-btn {
  width: 100px;
  height: 90px;
  background: var(--bg-secondary);          /* #1A2634 */
  border: 1px solid var(--border-default);  /* #1E3A50 */
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.category-btn:hover {
  background: var(--bg-tertiary);           /* #243447 */
  transform: translateY(-2px);
}
.category-btn.active {
  background: var(--accent-primary);        /* #10B981 */
  border-color: var(--accent-primary);
  color: white;
  box-shadow: var(--pos-glow);
}
.category-btn i {
  font-size: 24px;
}
.category-btn span {
  font-size: 12px;
  font-weight: 600;
}
```

#### 2. Ürün Kartları (Merkez Grid)
```css
.product-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
}
.product-card:hover {
  border-color: var(--accent-primary);
  transform: scale(1.02);
  box-shadow: var(--pos-glow);
}
.product-card img {
  width: 100%;
  height: 120px;
  object-fit: cover;
}
.product-card .info {
  padding: 10px;
}
.product-card .name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.product-card .sizes {
  display: flex;
  gap: 4px;
}
.product-card .size-btn {
  min-width: 32px;
  height: 28px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}
.product-card .size-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}
.product-card .price {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-primary);
}
```

#### 3. Adisyon Paneli (Sağ)
```css
.bill-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.bill-header {
  background: var(--accent-primary);
  padding: 12px 16px;
  border-radius: 16px 16px 0 0;
  font-weight: 700;
  font-size: 18px;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.bill-item {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.bill-item .qty {
  color: var(--accent-primary);
  font-weight: 700;
  margin-right: 8px;
}
.bill-item .name {
  flex: 1;
  color: var(--text-primary);
  font-size: 14px;
}
.bill-item .price {
  font-family: 'JetBrains Mono';
  font-weight: 700;
  color: var(--text-primary);
}
.bill-total {
  padding: 16px;
  font-family: 'JetBrains Mono';
  font-size: 28px;
  font-weight: 700;
  color: var(--accent-primary);
  text-align: right;
}
```

#### 4. Ödeme Butonu (CTA)
```css
.btn-pay {
  background: var(--accent-primary);         /* #10B981 */
  color: white;
  font-size: 16px;
  font-weight: 700;
  padding: 14px 28px;
  border-radius: 12px;
  border: none;
  min-height: var(--touch-lg);               /* 56px */
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: all 0.2s ease;
}
.btn-pay:hover {
  background: var(--accent-hover);           /* #059669 */
  box-shadow: 0 0 20px rgba(16,185,129,0.3);
}
.btn-pay:active {
  transform: scale(0.97);
}
```

#### 5. Durum Barı (Header)
```css
.status-bar {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-default);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  height: 44px;
}
.status-bar .cloud-status {
  color: var(--accent-primary);              /* Yeşil = Bağlı */
  font-weight: 600;
}
.status-bar .offline-badge {
  background: var(--warning);
  color: #000;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
```

### Masa Durumu Renk Kodları

| Durum | Renk | Kod | Görsel |
|-------|------|-----|--------|
| Müsait / Frei | Yeşil | `#10B981` | Solid border yerine iç ışık |
| Dolu / Besetzt | Kırmızı | `#EF4444` | Kırmızı pill + oturma süresi |
| Sipariş Bekliyor | Sarı | `#F59E0B` | Anima pulse efekti |
| Hesap İstedi | Mavi | `#3B82F6` | Mavi parlama |
| Yemek Hazır | Turuncu | `#F97316` | Turuncu badge + çan |
| Temizleniyor | Gri | `#64748B` | Soluk görünüm |

### Kasiyer Ekranı — Son Düzen

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ☰ Açık Masa: 8 | Gün Sonu Raporu | Admin | Ahmet Y. | BULUT: BAĞLI | 🇩🇪🇹🇷🇬🇧 | ⏕ │
├─────────────┬───────────────────────────────────────────┬─────────────────────┤
│  ★ Favoriler │                                           │  ┌─────────────────┐ │
│  🍕 Pizzalar │  ┌─────────┐ ┌─────────┐ ┌─────────┐ │  │  Adisyon  ✓ ⋮  │ │
│  🥩 Kebaplar │  │ 🖼 FOTO  │ │ 🖼 FOTO  │ │ 🖼 FOTO  │ │  ├─────────────────┤ │
│  🥙 Dönerler │  ├─────────┤ ├─────────┤ ├─────────┤ │  │ 1x Margherita  €9 │ │
│             │  │Margherit│ │Pepperoni│ │ Karışık │ │  │ 1x Adana Keb €14 │ │
│  🥟 Atıştır.│  │ S  M  L │ │ S  M  L │ │ S  M  L │ │  │ 1x Ayran     €2 │ │
│  🍰 Tatlılar │  │€9 €12 €16│ │€9 €14 €20│ │€7 €12 €18│ │  │ 1x Cola      €3 │ │
│             │  └─────────┘ └─────────┘ └─────────┘ │  ├─────────────────┤ │
│  🥤 İçecekler│  ┌─────────┐ ┌─────────┐          │  │ Ara Toplam €28 │ │
│             │  │ 🖼 FOTO  │ │ 🖼 FOTO  │          │  │ KDV(19%)  €5.3 │ │
│             │  ├─────────┤ ├─────────┤          │  │                 │ │
│             │  │Karışık  │ │Kebab Piz│          │  │ TOPLAM:  €33 │ │
│             │  │ S  M  L │ │ S  M  L │          │  │ (yeşil & büyük) │ │
│             │  └─────────┘ └─────────┘          │  ├─────────────────┤ │
│             │                                           │  │[Masa][GelAl][Pak]│ │
│             │                                           │  │[Modif][Ind][ÖDE] │ │
│             │                                           │  └─────────────────┘ │
└─────────────┴───────────────────────────────────────────┴─────────────────────┘
```

### POS Tasarım Kuralları (Touch-First)

| Kural | Açıklama |
|-------|----------|
| **Min dokunma alanı** | 44x44px (Apple HIG standardı) |
| **Buton aralığı** | Minimum 8px gap (yanlış dokunma önleme) |
| **Font minimum** | 12px (termal yazıcı hizarına uyumlu) |
| **Kontrast oranı** | Min 4.5:1 (WCAG AA) — koyu temada beyaz metin |
| **Animasyon süresi** | Max 300ms (hızlı işlem için) |
| **Scroll yok** | Ana ekranların tamamı görünür olmalı, kaydırma minimalize |
| **Sol el desteği** | Kritik butonlar her iki taraftan erişilebilir |
| **Gece modu** | Varsayılan: koyu tema (göz yormaz, restoran ortamına uygun) |
| **Parlaklık** | Otomatik parlaklık ayarı (ambient light sensor) |

### Mutfak KDS Tema Farkı

```
Mutfak ekranında kontrastlık önceliklidir:
- Arka plan daha koyu: #0A1218
- Metin daha büyük: min 18px
- Renk kodlu kartlar:
  🟡 Sarı sınır = Bekleyen (>5dk sarı, >15dk kırmızı yanıp söner)
  🟠 Turuncu sınır = Hazırlanıyor
  🟢 Yeşil sınır = Hazır
- Tam ekran: adres çubuğı gizli
- Su/yağ geçirmez ekran için büyük butonlar (64px)
```

### Müşteri QR Menü Tema Farkı

```
Müşteri ekranında cazip görsellik önceliklidir:
- Açık tema seçeneği (koyu + açık — müşteri tercihine göre)
- Ürün görselleri daha büyük (180px yükseklik)
- Alerjen ikonları görünür
- Sepet altında kayan toplam barı (sticky)
- Hizmet butonları FAB (floating action button) olarak
- Animasyonlu geçişler (slide, fade)
```

### Örnek CSS Değişkenleri (Global)

```css
:root {
  /* ═══ RENKLER ═══ */
  --bg-primary: #0F1923;
  --bg-secondary: #1A2634;
  --bg-tertiary: #243447;
  --bg-elevated: #2A3F55;
  --accent-primary: #10B981;
  --accent-hover: #059669;
  --accent-glow: rgba(16,185,129,0.15);
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
  --border-default: #1E3A50;
  --border-active: #10B981;
  --danger: #EF4444;
  --warning: #F59E0B;
  --info: #3B82F6;
  --success: #10B981;

  /* ═══ TİPOGRAFİ ═══ */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* ═══ BOYUTLAR ═══ */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --touch-min: 44px;
  --touch-lg: 56px;

  /* ═══ GÖLGELER ═══ */
  --shadow-card: 0 2px 8px rgba(0,0,0,0.3);
  --shadow-elevatekd: 0 8px 24px rgba(0,0,0,0.4);
  --shadow-glow: 0 0 20px rgba(16,185,129,0.2);

  /* ═══ ANİMASYON ═══ */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}

/* Google Fonts Import */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
```

---
SaaS Merkezi Yönetim Paneli (Super Admin):

URL: http://localhost:5174/saas-admin
Kullanıcı: superadmin
Not: Tüm restoranları, abonelik planlarını ve sistem sağlığını buradan yönetebilirsin.
Restoran Giriş Ekranı (POS & Admin):

URL: http://localhost:5174/login
Giriş Seçenekleri:
Demo Restoran ID: e06a67da-3773-4b3e-8985-958e4e0f49e7
Celal Restoran ID: 3401e45e-2df1-49ee-a37c-ffb4483726da
Varsayılan Kullanıcılar:
Yönetici: admin / admin123
Kasiyer: cashier / kasa123
Hızlı PIN (Kasiyer): 123456
Diğer Operasyonel Paneller:

Mutfak Ekranı (KDS): http://localhost:5174/kitchen
Müşteri QR Menü: http://localhost:5174/qr
Garson Paneli: http://localhost:5174/waiter