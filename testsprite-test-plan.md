# TestSprite Test Plan (NextPOS)

Bu doküman, TestSprite ile **SaaS → Bayi → POS (Admin/Kasiyer/Garson/Mutfak/Kurye) → Masa QR → Teslim/Handover** akışlarını uçtan uca test etmek için hazırlanmıştır.

## Test Ortamı

**Servisler / URL’ler (dev):**
- API: `http://127.0.0.1:5000`
- POS: `http://127.0.0.1:5173`
- SaaS Admin: `http://localhost:5176/saas-admin` (POS içinden `/saas-admin` route’u redirect eder)
- Bayi (Reseller): `http://127.0.0.1:4001`
- (Opsiyonel) QR Menu ayrı uygulama ise: `http://127.0.0.1:5177`

**Tenant (Restoran):**
- Tenant ID (UUID): `a1111111-1111-4111-8111-111111111111`
- Tenant adı: `Demo Pizza & Kebab`
- Tenant şema: `tenant_demo`

## Giriş Bilgileri (Seed’e göre)

Kaynak: [seed.ts](file:///d:/xampp/htdocs/nextpos/apps/api/prisma/seed.ts#L41-L60) ve özet çıktı [seed.ts](file:///d:/xampp/htdocs/nextpos/apps/api/prisma/seed.ts#L270-L279)

**SaaS Admin**
- Username: `superadmin`
- Password: `superadmin123`

**Bayi (Reseller)**
- Username: `demo_reseller`
- Password: `reseller123`
- Not: UI’da bayi adı `Demo Bayi A.Ş.` görünebilir. Eğer veritabanında “Almanya” isimli bayi varsa, testlerde onu kullan.

**POS Kullanıcıları (Demo Pizza & Kebab)**
- Admin: `admin` / `admin123` (PIN: `123456`)
- Kasiyer: `cashier` / `kasa123` (PIN: `111111`)
- Garson: `waiter` / `garson123` (PIN: `222222`)
- Mutfak: `kitchen` / `mutfak123` (PIN: `333333`) — adı “Şef Hasan”

> Not: İstenen “kullanıcı adı hasan” seed’de **username olarak yok**; “Hasan” isim alanında mutfak kullanıcısında geçiyor. Eğer sizin ortamınızda `hasan` username’i varsa, testlerde öncelik onu kullan.

## POS Route Haritası (Kapsam)

Kaynak: [App.tsx](file:///d:/xampp/htdocs/nextpos/apps/pos/src/App.tsx)

**Genel**
- `/login`
- `/cashier`
- `/kitchen/:station` (örn: `/kitchen/all`)
- `/waiter`
- `/courier`
- `/handover`
- `/queue`

**Admin (nested)**
- `/admin/menu`
- `/admin/floor`
- `/admin/staff`
- `/admin/staff-performance`
- `/admin/customers`
- `/admin/campaigns`
- `/admin/reservations`
- `/admin/reports`
- `/admin/stock`
- `/admin/recipes`
- `/admin/delivery`
- `/admin/couriers`
- `/admin/settings` (ŞUBELER sekmesi burada)

**QR / Kiosk**
- `/qr/:tableId` (örn: `/qr/1`)
- `/kiosk/:tableId` (örn: `/kiosk/1`)

## Test Kapsamı (Senaryolar)

### 1) SaaS Admin (5176)
- Login: `superadmin / superadmin123`
- Tenants listesinde `Demo Pizza & Kebab` bulunur
- Tenant detayında UUID kopyalama / modül yönetimi ekranı açılır
- (Opsiyonel) plan/modül değişimi yapılıp POS’ta etkisi doğrulanır (aşağıdaki “Modül Kilidi” testleri)

### 2) Bayi / Reseller (4001)
- Login: `demo_reseller / reseller123` (veya “Almanya” bayisi)
- Restoran listesinde `Demo Pizza & Kebab` görünür
- Lisans/limit ekranları (varsa) doğrulanır

### 3) POS Login (5173)
- Tenant ID: `a1111111-1111-4111-8111-111111111111`
- Username/Password ile giriş: admin → cashier → waiter → kitchen
- PIN ile giriş: aynı roller için
- Logout sonrası korumalı route’lara erişim engellenir

### 4) Kasiyer Akışı (/cashier)
- Menüden ürün ekle (Pizza/Kebab)
- Kupon/indirim negatif testi (geçersiz kupon uyarısı)
- Ödeme (nakit/kart) ile siparişi tamamla

### 5) Garson Akışı (/waiter)
- Masa seç → oturum başlat
- Ürün ekle → mutfağa gönder
- Oturumdan çıkıp tekrar gir → kaldığı yerden devam (persist)

### 6) Mutfak Akışı (/kitchen/all)
- Yeni siparişi gör
- Durumları ilerlet: preparing → ready → completed (sistemdeki akışa göre)
- POS tarafında durum güncellemeleri eşleşir

### 7) Masa QR Akışı (/qr/1)
- Ürün ekle
- Misafir checkout ile sipariş ver
- Siparişin mutfakta görünmesi doğrulanır

### 8) Kurye / Teslim Akışı (/courier + /handover)
- Kurye hesabı yoksa `admin` veya `cashier` ile `/courier` ekranı test edilir (route bunu kabul eder)
- Siparişi “pickup/teslim al” yap
- “delivered/teslim edildi” durumuna geçir
- Handover ekranında ilgili sipariş/teslim adımları doğrulanır

### 9) Admin Ayarları → Şubeler (POS /admin/settings → ŞUBELER)
- Şube listesi görüntülenir (kota gösterimi: `mevcut / max_branches`)
- Yeni şube ekleme (kota doluysa 403 ve hata mesajı)
- Şube güncelleme
- Şube silme (id=1 silinememeli)

## Negatif Testler (Modül Kilidi)

Modül kapatıldığında hem API 403 hem de UI gizleme/lock davranışı beklenir.

Örnekler:
- `inventory` kapalı → `/admin/stock`, `/admin/recipes` sayfaları kilit ekranı / API 403
- `courier_module` kapalı → `/admin/delivery`, `/admin/couriers`, `/courier` erişimi engellenir
- `table_reservation` kapalı → `/admin/reservations` kilitlenir
- `advanced_reports` kapalı → `/admin/reports` ve `/admin/staff-performance` kilitlenir

## TestSprite Çalıştırma Stratejisi

Bu repo çoklu frontend içerir. En stabil yaklaşım: **her uygulama için ayrı TestSprite koşusu**.

Önerilen sıra:
1) POS (5173)
2) Bayi (4001)
3) SaaS Admin (5176)
4) (Opsiyonel) QR Menu ayrı uygulamaysa (5177)

Her koşuda:
- Base URL doğru porta ayarlanır
- Login adımlarında yukarıdaki credential setleri kullanılır
- Tenant ID olarak her zaman `a1111111-1111-4111-8111-111111111111` kullanılır

## Beklenen Çıktılar

- TestSprite plan JSON’ları ve raporları: `testsprite_tests/`
- Code summary: `testsprite_tests/tmp/code_summary.yaml`

