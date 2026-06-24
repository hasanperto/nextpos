# 🎯 NextPOS — Cursor / Antigravity IDE Master Prompt
> **Kopyala-yapıştır hazır · Tam proje bağlamı · UI + Dev + Test kapsayıcı**

---

## 📌 PROJE KİMLİĞİ

Sen, **NextPOS** adlı production-grade bir SaaS POS sisteminin kıdemli full-stack geliştiricisisin.
Bu sistem üç katmanlı bir hiyerarşiye sahiptir:

```
Platform Sahibi (SaaS Admin)
  └── Bayi (Reseller)
        └── Restoran (Tenant)
              └── Şube → Kasiyer | Garson | Mutfak | Kurye | Müşteri QR
```

Repo adresi: `hasanperto/nextpos` (Turborepo monorepo)
Teknoloji yığını: **React 18 + Vite** (POS/Admin SPA) · **Next.js 14** (QR Menü) · **NestJS 10** (API) · **PostgreSQL 16 + Prisma 5** · **Redis 7** · **Socket.io 4** · **Dexie.js** (IndexedDB) · **Tailwind CSS** · **TypeScript** · **BullMQ** · **Stripe** · **Docker + Nginx**

---

## 🗺️ PANEL HARİTASI VE URL YAPISI

| Panel | URL | Roller | Amaç |
|---|---|---|---|
| Giriş | `/login` | Public | Tenant seçimi + şifre/PIN girişi |
| Kasiyer POS | `/cashier` | `cashier`, `admin` | Masa/menü → sepet → ödeme → operasyon |
| Mutfak KDS | `/kitchen/:station` | `kitchen`, `admin` | Bilet yönetimi (Bekleyen→Hazırlanıyor→Hazır) |
| Garson | `/waiter` | `waiter`, `admin` | Masa yönetimi + servis çağrıları |
| Kurye | `/courier` | `courier`, `admin` | Teslimat kuyruğu + rota + tahsilat |
| Teslim Merkezi | `/handover` | `admin`, `cashier` | Hazır/paket servis hat operasyonu |
| Kiosk | `/kiosk/:tableId` | `device_token` | Masa tableti self-order |
| Admin | `/admin/*` | `admin`, kısıtlı `cashier` | Menü, salon, personel, raporlar, ayarlar |
| SaaS Admin | `/saas-admin/*` | `super_admin`, `reseller` | Multi-tenant yönetim, bayi, finans |

---

## 🏗️ PROJE DOSYA YAPISI (Monorepo)

```
nextpos/
├── apps/
│   ├── api/                    ← NestJS Backend (port 3000)
│   │   └── src/modules/
│   │       ├── auth/           ← JWT, PIN, Refresh Token
│   │       ├── menu/           ← Kategori, Ürün, Modifikasyon
│   │       ├── orders/         ← Sipariş akışı
│   │       ├── payments/       ← Ödeme, İade
│   │       ├── kitchen/        ← KDS biletleri
│   │       ├── tables/         ← Masa yönetimi
│   │       ├── customers/      ← CRM, puan
│   │       ├── deliveries/     ← Kurye akışı
│   │       ├── reports/        ← Z raporu, grafik
│   │       ├── sync/           ← Offline sync
│   │       ├── tenants/        ← SaaS multi-tenant
│   │       ├── resellers/      ← Bayi sistemi
│   │       ├── websocket/      ← Socket.io gateway
│   │       ├── printing/       ← ESC/POS queue
│   │       └── inventory/      ← Stok yönetimi
│   ├── pos/                    ← React + Vite SPA (port 5173)
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── cashier/
│   │       │   ├── waiter/
│   │       │   ├── kitchen/
│   │       │   ├── courier/
│   │       │   ├── admin/
│   │       │   ├── saas/
│   │       │   └── reseller/
│   │       └── services/
│   │           ├── api.ts      ← Axios + interceptor
│   │           ├── socket.ts   ← Socket.io client
│   │           ├── db.ts       ← Dexie IndexedDB
│   │           ├── printer.ts  ← ESC/POS
│   │           └── sync.ts     ← Offline sync manager
│   └── qrmenu/                 ← Next.js 14 (port 3001)
│       └── app/[lang]/menu/[tableId]/
└── packages/
    ├── shared-types/           ← TypeScript tipleri
    ├── ui/                     ← Paylaşılan bileşenler
    ├── escpos/                 ← Yazıcı kütüphanesi
    └── i18n/                   ← de/tr/en çeviriler
```

---

## 🔐 RBAC — ROL VE YETKİ MATRİSİ

```typescript
type Role = 'super_admin' | 'reseller' | 'admin' | 'manager' |
            'cashier' | 'waiter' | 'kitchen' | 'courier' | 'device';

// JWT payload yapısı
interface JwtPayload {
  sub: string;           // user UUID
  tenantId: string;      // tenant schema adı
  role: Role;
  entitlements: string[];// ['kitchen_display', 'courier_module', ...]
  deviceId?: string;     // kiosk cihazları için
  exp: number;
}
```

**Kritik yetki kuralları:**
- `cashier` → KDS'e ERIŞEMEZ (kaldırıldı)
- `/handover` → YALNIZCA `admin` veya `cashier` (herkese açık değil)
- `device` token → Yalnızca `/kiosk/:tableId` rotasına erişir
- `reseller` → Sadece kendi tenant'larını görür (backend zorunlu)
- `super_admin` → 2FA (TOTP) zorunlu

---

## 🗄️ VERİTABANI ŞEMASI (Ana Tablolar)

```sql
-- SaaS Katmanı
tenants(id, slug, plan, status, trialEndsAt, stripeCustomerId)
resellers(id, commission_rate, contact, plan_access, parent_reseller_id)
subscription_plans(id, name, price, limits, features)
subscription_invoices(id, tenantId, amount, status, stripeId)
reseller_commissions(id, resellerId, month, amount, paid)
audit_logs(id, actor, action, target, payload, createdAt)  -- SİLİNEMEZ

-- Restoran Katmanı
branches(id, tenantId, address, currency, language, tseEnabled)
users(id, tenantId, branchId, role, pin, preferred_language)
categories(id, tenantId, translations JSONB, icon, sort_order)
products(id, tenantId, categoryId, translations JSONB, basePrice, allergens, taxClass)
product_variants(id, productId, name, priceModifier)
modifier_groups(id, tenantId, translations JSONB, min, max)
modifiers(id, groupId, translations JSONB, price)
sections(id, branchId, name, layoutData JSONB)
tables(id, sectionId, name, capacity, shape, qrSecret, status, currentSessionId)
kitchen_stations(id, branchId, code, type)  -- hot/bar/cold

-- Operasyon Katmanı
customers(id, tenantId, name, phone, personalQr, loyaltyPoints, tier, gdprConsent)
table_sessions(id, tableId, openedAt, closedAt, guestCount, waiterId)
orders(id, tenantId, branchId, tableSessionId, type, status, discount, tax, offlineId)
order_items(id, orderId, productId, variantId, modifiers JSONB, kitchenStation, void)
kitchen_tickets(id, orderId, stationCode, status, createdAt)
payments(id, orderId, method, amount, tip, changeGiven, stripeIntentId)
refunds(id, paymentId, amount, reason, processedBy)
deliveries(id, orderId, courierId, status, currentLocation, estimatedTime)
z_reports(id, branchId, date, totalRevenue, taxBreakdown JSONB, tseSignature)
sync_queue(id, entityType, action, status, priority, retryCount, createdAt)
```

---

## 🔌 KRİTİK API ENDPOİNTLERİ

### Auth
```
POST /api/v1/auth/login                    → { accessToken, refreshToken }
POST /api/v1/auth/login/pin               → { token }  (8 saat)
POST /api/v1/auth/refresh                 → { accessToken }
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Kasiyer / Sipariş Akışı
```
POST /api/v1/tables/:id/open              → oturum aç
POST /api/v1/orders                       → sipariş oluştur + kitchen ticket
POST /api/v1/orders/checkout              → mutfağa gönder (ödeme olmadan)
POST /api/v1/payments/sessions            → ödeme oturumu başlat
POST /api/v1/payments/sessions/:id/complete → ödemeyi kapat
POST /api/v1/orders/:id/split-checkout   → hesap böl
POST /api/v1/tables/transfer-items        → kalem taşı
POST /api/v1/orders/:id/refund            → iade
POST /api/v1/orders/:id/apply-loyalty     → puan kullan
POST /api/v1/print/kitchen-ticket        → mutfak fişi bas
POST /api/v1/print/receipt               → adisyon bas
```

### Mutfak KDS
```
GET   /api/v1/kitchen/tickets?station=hot
PATCH /api/v1/kitchen/tickets/:id/status  → { status: "preparing"|"ready"|"completed" }
PATCH /api/v1/kitchen/tickets/:id/items   → { itemId, ready: true }
GET   /api/v1/kitchen/tickets/completed?since=2h
```

### Garson
```
GET   /api/v1/tables
PATCH /api/v1/orders/:id/status           → (PUT değil, PATCH!)
POST  /api/v1/orders/:id/pickup           → mutfaktan teslim al
GET   /api/v1/service-calls?status=pending
PATCH /api/v1/service-calls/:id/status    → (PUT değil, PATCH!)
POST  /api/v1/orders/:id/approve-qr
POST  /api/v1/orders/:id/reject-qr
```

### Kurye
```
GET   /api/v1/orders?deliveryQueue=true
PATCH /api/v1/orders/:id/status           → shipped | delivered | failed
```

### Kiosk (Masa Tableti)
```
POST  /api/v1/devices/register            → { deviceToken }
GET   /api/v1/devices/:token/verify
POST  /api/v1/devices/:token/revoke
GET   /api/v1/menu/public?tableId=:id
POST  /api/v1/orders/kiosk                → { tableId, deviceToken, items, paymentIntent }
GET   /api/v1/orders/:id/status
```

### Admin
```
GET/POST/PUT/DELETE /api/v1/menu/admin/categories
GET/POST/PUT/DELETE /api/v1/menu/admin/products
POST   /api/v1/menu/admin/products/bulk-price
POST   /api/v1/menu/admin/products/:id/image   ← multipart/form-data
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/reports/summary?from=&to=
POST   /api/v1/admin/reports/z-day-lock
GET    /api/v1/admin/reports/staff-performance?from=&to=&role=waiter|courier
GET    /api/v1/admin/couriers/stats
POST   /api/v1/admin/couriers/:id/reconcile
GET/POST/PUT/DELETE /api/v1/admin/accounting   ← DELETE YOK! STORNO KULLAN
POST   /api/v1/admin/accounting/:id/void       ← storno
GET/POST/PUT/DELETE /api/v1/admin/reservations
GET/POST/PUT/DELETE /api/v1/admin/delivery-zones
GET/POST/PUT/DELETE /api/v1/admin/printers
POST   /api/v1/admin/printers/:id/test
```

### SaaS Admin (prefix: /api/saas/v1/)
```
GET    /api/saas/v1/dashboard/stats
GET    /api/saas/v1/tenants
POST   /api/saas/v1/tenants             → 202 Accepted + taskId (async)
PATCH  /api/saas/v1/tenants/:id/status
POST   /api/saas/v1/tenants/:id/impersonate → { impersonation_token, 15dk }
POST   /api/saas/v1/tenants/:id/reset-password
GET/POST/PUT/DELETE /api/saas/v1/resellers
POST   /api/saas/v1/resellers/:id/wallet/adjust
GET/POST/DELETE /api/saas/v1/plans
GET    /api/saas/v1/finance/summary
GET    /api/saas/v1/audit-log
POST   /api/saas/v1/backups/trigger
```

### Bayi (kendi scope'u)
```
GET  /api/saas/v1/resellers/me/wallet
POST /api/saas/v1/resellers/me/wallet/topup-request
GET  /api/saas/v1/resellers/me/commissions
```

---

## ⚡ WEBSOCKET OLAY HARİTASI (Socket.io)

```typescript
// Room yapısı
`branch:${branchId}`      // Tüm şube personeli
`kitchen:${branchId}`     // Sadece mutfak
`kitchen:${branchId}:hot` // İstasyon bazlı
`table:${tableId}`        // Masa + müşteri QR
`courier:${userId}`       // Kurye bireysel
`admin:${branchId}`       // Kasiyer + admin
`tenant:${tenantId}`      // Tüm şubeler

// Kritik olaylar
'order:new'               → branch:{id}
'order:status_changed'    → branch:{id}
'order:ready'             → branch:{id} (garson + kasiyer)
'kitchen:ticket_created'  → kitchen:{id}
'kitchen:ticket_updated'  → kitchen:{id}
'qr:order_request'        → admin:{id} (garson onay pop-up)
'qr:order_approved'       → table:{id}
'customer:service_call'   → admin:{id}
'table:status'            → branch:{id}
'table:focused'           → branch:{id} (çakışma önleme)
'table:blurred'           → branch:{id}
'delivery:assigned'       → courier:{userId}
'stock:low'               → admin:{id}
'menu:updated'            → tenant:{id} (cache yenile)
'sync:menu_revision'      → tenant:{id}
'reservation:created'     → branch:{id}
'saas:live_feed'          → saas (yeni kayıt, ödeme, bayi talebi)
'saas:topup_request_new'  → saas dashboard
```

---

## 📴 OFFLINE MİMARİ (IndexedDB/Dexie.js)

```typescript
// Offline'da YAPILABILEN işlemler
✓ Menü görüntüleme (TTL: 1 saat cache)
✓ Masa görüntüleme (cache)
✓ Sipariş oluşturma (yerel kuyruk, sync sonra)
✓ Mutfak bilet durum güncelleme (kuyruk)

// Offline'da ENGELLENMESİ GEREKEN işlemler
✗ Ödeme alma → "Bağlantı gerekli" uyarısı
✗ Masa iptali
✗ Stok düzeltme

// Dexie store'ları
pendingOrders, pendingPayments, categories, products,
variants, modifierGroups, modifiers, customers, tables,
sections, syncQueue, translations, languages, settings

// Çakışma çözümü
- Sipariş: table:focused/blurred socket ile "kim bakıyor" uyarısı, last-write-wins
- KDS: sunucu state daha ilerideyse (ready > preparing) offline güncelleme sessizce atlanır
- Menü: sync:menu_revision gelince cache geçersiz, geçersiz ürünlü sipariş kırmızı vurgulanır
```

---

## 🐛 GİDERİLMESİ GEREKEN BİLİNEN SORUNLAR VE UI HATALARI

Aşağıdaki sorunları projeyi analiz ederek tespit et ve düzelt:

### 🔴 Kritik Güvenlik Sorunları
1. **`/handover` rotası** → Rol kontrolü "Auth" (herkese açık) olarak tanımlıydı. `admin` veya `cashier` rolü zorunlu olmalı.
2. **`cashier` rolü KDS'e erişiyor** → `/kitchen/:station` rotasında cashier guard kaldırılmalı. Opsiyonel: `cashier_kds_view` entitlement ile salt-okunur.
3. **`DELETE /admin/accounting/:id`** → Finansal kayıt silinemez. Bu endpoint kaldırılmalı; yerine `POST /admin/accounting/:id/void` kullanılmalı.
4. **Demo seed endpoint'i production'da aktif** → `NODE_ENV !== 'production'` kontrolü + çift onay dialogu zorunlu. Production'da `403 Forbidden`.
5. **Muhasebe storno kaydı** → İade endpoint'i orijinal kaydı silmemeli; `type: 'refund'` kayıt oluşturulmalı.

### 🟠 API Tutarsızlıkları
6. **`PUT` yerine `PATCH` kullanılmalı** → Garson ve kurye panellerindeki durum güncellemeleri kısmi değişiklik; `PATCH /orders/:id/status` ve `PATCH /service-calls/:id/status` olmalı.
7. **Sipariş checkout endpoint ayrımı** → `POST /orders` (sipariş kaydı) ve `POST /orders/checkout` (mutfağa gönder) ayrı tutulmalı. Eski `checkout-session` endpoint ikisini birleştiriyordu.
8. **Kurye durum geçişleri** → Yalnızca `ready→shipped→delivered|failed` geçerliydi. Belirsiz `:endpoint` parametreli yapı standardize edilmeli.
9. **Personel performans endpoint birleşimi** → `personnel-detailed` ve `staff-performance` tek endpoint: `GET /admin/reports/staff-performance?role=waiter|courier`.

### 🟡 UI/UX Sorunları

**Kasiyer POS (`/cashier`)**
10. Masa grid'de renk kodları tutarsız → Standartlaştır: 🟢 Boş · 🔴 Dolu · 🟡 Sipariş Bekliyor · 🔵 Hesap İstedi · 🟠 Yemek Hazır · 🟣 Rezerveli.
11. `table:focused` / `table:blurred` socket olayları UI'a yansımıyor → "Bu masaya [İsim] bakıyor" uyarı overlay'i eksik.
12. Offline mod göstergesi → İnternet kesilince header'da belirgin bir "Offline Mod" banner/badge gösterilmeli; sync bekleyen sipariş sayısı görünmeli.
13. Ödeme modalında split bill akışı → Kalem seçimi ve kısmi ödeme UI'ı tamamlanmamış; `POST /orders/:id/split-checkout` entegrasyonu eksik.
14. Loyalty/puan uygulaması → Ödeme sırasında puan bakiyesi gösterilmeli; `GET /customers/:id/loyalty` + `POST /orders/:id/apply-loyalty` bağlantısı eksik.

**Mutfak KDS (`/kitchen/:station`)**
15. Kanban sütunları arası sürükleme → Drag-drop ile durum güncellemesi `PATCH /kitchen/tickets/:id/status` çağırmıyor; sadece UI state değiştiriliyor.
16. Süre sayacı renk eşikleri → <5dk: beyaz, 5-15dk: sarı, >15dk: kırmızı yanıp söner — CSS animasyonu eksik.
17. İstasyon filtresi → URL parametresi `:station` (`all|hot|cold|bar`) API sorgusuna doğru geçilmiyor.
18. Kalem bazlı "kısmi hazır" checkbox'ları → `PATCH /kitchen/tickets/:id/items` endpoint'i bağlanmamış.

**Garson Paneli (`/waiter`)**
19. Servis çağrısı overlay → Masa kartı üzerinde servis çağrısı geldiğinde `customer:service_call` socket olayı görsel overlay'e yansımıyor.
20. QR sipariş onay pop-up → `qr:order_request` socket olayı gelince tam onay/ret dialogu açılmıyor.
21. Masa başı sipariş modal'ı → Varyant ve modifikasyon seçimi UX'i tamamlanmamış.

**Kiosk (`/kiosk/:tableId`)**
22. Cihaz token doğrulama → Sayfa yüklenince `GET /devices/:token/verify` çağrılmıyor; token geçerliliği kontrol edilmiyor.
23. Token revoke sonrası otomatik kilit → `sync:tables_changed` socket olayı gelince kiosk pasif ekrana geçmiyor.
24. Idle reset timer → 90 saniye hareketsizlikte menü başlangıç ekranına dönmüyor.
25. Sipariş durumu tracking → Sipariş verildikten sonra `ready` durumuna gelince animasyonlu "Siparişiniz hazır!" ekranı eksik.

**Admin Paneli (`/admin`)**
26. Muhasebe modülü → Silme butonu hâlâ görünüyor ve çalışıyor; sadece storno butonu olmalı. DELETE endpoint'i kaldırıldıktan sonra UI güncellenmemiş.
27. Rezervasyon → Masa `reserved` durumuna geçince kasiyer paneline socket bildirimi gitmiyor (`reservation:created` emit eksik).
28. Stok yönetimi → `is_ingredient: true` flag'i olan ürünler stok listesinde ayrıca işaretlenmiyor.
29. Kiosk ayarları sekmesi → Cihaz listesi, token revoke butonu ve idle timeout ayarı eksik.
30. Yazıcı yönetimi → `POST /admin/printers/:id/test` çağrısı sonucu (başarı/hata) UI'a yansımıyor.
31. Entitlement modül kilidi → Kilitli modüller (`customer_crm`, `inventory`, `kiosk_module` vb.) açılırken "Yükselt" CTA yerine sadece boş sayfa gösteriliyor.
32. Çeviri editörü → DE/TR/EN yan yana form; değişiklik yapılınca `PUT /translations/:ns/:lang` çağrısı eksik.

**SaaS Admin Paneli (`/saas-admin`)**
33. Tenant oluşturma async akışı → API `202 Accepted` + `taskId` dönüyor; frontend bunu handle etmiyor ve kullanıcı feedback almıyor. `GET /tasks/:id/status` polling eklenmeli.
34. DNS provisioning hata senaryosu → `qr_domain_status: 'pending_dns'` durumu admin panelinde uyarı olarak gösterilmiyor. "Yeniden Dene" butonu ve `POST /tenants/:id/retry-dns` eksik.
35. Impersonation banner → Admin olarak giriş yapıldığında (destek modu) köşede kalıcı "Destek Modu Aktif" banner gösterilmiyor.
36. Impersonation'da yıkıcı işlem engeli → Impersonation token ile delete/seed işlemlerinin frontend'de de engellenmesi gerekiyor.
37. Live feed socket → `saas:live_feed` kanalı dashboard'a bağlı değil; canlı event akışı gösterilmiyor.

**Bayi Paneli**
38. Top-up talebi → Bayi'nin `POST /resellers/me/wallet/topup-request` yapabildiği form ve durum takibi (`GET /resellers/me/wallet/topup-requests`) eksik.
39. Komisyon raporu → PDF export butonu bağlı değil.

**Genel UI Sorunları**
40. Toast/bildirim sistemi → Bildirimler tutarsız (bazı panellerde çalışıyor, bazılarında yok). Merkezi bildirim merkezi bileşeni oluşturulmalı.
41. 2FA akışı → `reseller` ve `super_admin` girişinde TOTP adımı UI'da eksik; login flow 2FA challenge'ı handle etmiyor.
42. Dil/i18n → Bazı bileşenler `t()` yerine hard-coded Türkçe string kullanıyor; i18next entegrasyonu tamamlanmamış.
43. Responsive/mobile → Garson ve kurye PWA ekranları tablet/mobil optimizasyon için eksik CSS breakpoint'leri var.
44. Loading skeleton'lar → API çağrıları sırasında skeleton loader yerine spinner veya boş ekran gösteriliyor.
45. Error boundary → API hataları global error boundary'e taşınmamış; bazı bileşenler crash yapıyor.

---

## ✅ GELİŞTİRME STANDARTLARI

### TypeScript
```typescript
// DOĞRU — shared-types kullan
import { Order, OrderStatus, KitchenTicket } from '@nextpos/shared-types';

// YANLIŞ — inline tip tanımlama
type OrderStatus = 'pending' | 'ready'; // packages/shared-types'ta tanımlı!
```

### API İstekleri
```typescript
// api.ts — Axios interceptor ile
const api = axios.create({ baseURL: '/api/v1' });
api.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${getAccessToken()}`;
  return config;
});
// Token refresh interceptor response'da 401 yakalar, refresh eder
```

### Socket.io Client
```typescript
// socket.ts
socket.emit('join:tenant', { tenantId, userId });
socket.on('order:ready', (data) => {
  // her zaman zod veya tip guard ile validate et
  if (isOrderReadyEvent(data)) handleOrderReady(data);
});
```

### State Management (Zustand)
```typescript
// Her modülün kendi store'u olmalı
const useCashierStore = create<CashierState>()((set) => ({
  activeTable: null,
  cart: [],
  setActiveTable: (table) => set({ activeTable: table }),
}));
```

### Offline (Dexie)
```typescript
// db.ts
import Dexie from 'dexie';
const db = new NextPosDB();

// Offline sipariş yaz
await db.pendingOrders.add({ offlineId: uuid(), ...order });
await db.syncQueue.add({ entityType: 'order', action: 'create', priority: 1 });
```

---

## 🧪 TEST SENARYOLARI

Aşağıdaki kritik akışlar için E2E test yaz (Playwright):

### 1. Tam Salon Siparişi Akışı
```
✓ Login (cashier / PIN: 123456)
✓ Masa seç → oturum aç
✓ Kategori → Ürün → Varyant → Modifikasyon → Sepet
✓ Sipariş gönder → KDS'te bilet görünmeli
✓ KDS: waiting → preparing → ready
✓ Socket 'order:ready' → Garson bildirim almalı
✓ Ödeme (nakit) → para üstü hesaplama
✓ Adisyon bas → masa kapan
```

### 2. Offline Mod
```
✓ Ağ bağlantısını kes (service worker mock)
✓ "Offline Mod" banner göründüğünü doğrula
✓ Sipariş oluştur → IndexedDB'ye yazıldığını doğrula
✓ Ödeme dene → "Bağlantı gerekli" uyarısını doğrula
✓ Ağ bağlantısını geri ver
✓ Sync otomatik başlamalı → sipariş sunucuda oluşmalı
```

### 3. QR Menü → Garson Onayı
```
✓ /qr/:tableId açıldığında menü yüklensin
✓ Ürün ekle → sipariş gönder
✓ Garson panelinde 'qr:order_request' pop-up görünmeli
✓ Onayla → KDS'te ticket oluşmalı
✓ Müşteri ekranında "Hazırlanıyor" durumu görünmeli
```

### 4. Kiosk Cihaz Akışı
```
✓ device_token ile /kiosk/:tableId aç
✓ token verify endpoint çağrıldığını doğrula
✓ Menü yüklensin → sipariş ver
✓ 90 sn idle → başlangıç ekranına dön
✓ token revoke → kilit ekranına düş
```

### 5. SaaS Admin Tenant Oluşturma
```
✓ POST /saas/v1/tenants → 202 + taskId
✓ Progress bar göründüğünü doğrula
✓ GET /tasks/:id/status polling başladığını doğrula
✓ Tamamlanınca success bildirim + tenant listede görünmeli
```

### Birim Testler
```typescript
// Offline sync çakışma çözümü
describe('SyncManager', () => {
  it('should skip offline update if server state is ahead', async () => {
    // sunucu state: ready
    // offline update: preparing
    // beklenti: güncelleme atlanmalı, conflict_log'a yazılmalı
  });
});

// Rol guard
describe('RBAC', () => {
  it('cashier should not access /kitchen route', async () => {
    const token = generateToken({ role: 'cashier' });
    const res = await request(app).get('/kitchen/hot').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('handover should require cashier or admin role', async () => {
    const waiterToken = generateToken({ role: 'waiter' });
    const res = await request(app).get('/handover').set('Authorization', `Bearer ${waiterToken}`);
    expect(res.status).toBe(403);
  });
});
```

---

## 🚀 HIZLI BAŞLANGIÇ

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. .env ayarla
cp .env.example apps/api/.env
# DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET doldur

# 3. DB başlat
docker compose up -d postgres redis

# 4. Migration + Seed
npm run db:migrate && npm run db:seed

# 5. Dev server
npm run dev

# Test kullanıcıları:
# admin    / admin123   PIN: 000000
# cashier  / kasa123    PIN: 123456
# waiter1  / kasa123    PIN: 111111
# kitchen1 / kasa123    PIN: 222222
```

---

## 📋 YAPILACAKLAR LİSTESİ (Öncelik Sırasıyla)

### 🔴 Acil (Güvenlik)
- [ ] `/handover` rol guard: `admin | cashier`
- [ ] KDS'ten `cashier` erişimini kaldır
- [ ] `DELETE /admin/accounting/:id` → kaldır, storno endpoint'i ekle
- [ ] Demo seed production koruması

### 🟠 Yüksek (İş Mantığı)
- [ ] Kasiyer: `table:focused/blurred` socket → "bakıyor" overlay
- [ ] Kasiyer: Offline mod banner + sync sayacı
- [ ] KDS: Drag-drop → API çağrısı bağlantısı
- [ ] KDS: Süre sayacı renk animasyonu
- [ ] Kiosk: token verify + revoke + idle timer
- [ ] SaaS: Tenant create async (202 + polling)
- [ ] Garson: QR onay pop-up socket bağlantısı

### 🟡 Orta (UX)
- [ ] Rezervasyon socket emit
- [ ] Impersonation banner
- [ ] Loyalty ödeme entegrasyonu
- [ ] Yazıcı test sonuç feedback
- [ ] Bayi top-up form + durum takibi
- [ ] Error boundary global

### 🟢 Düşük (İyileştirme)
- [ ] i18n hard-coded string'leri taşı
- [ ] Loading skeleton'lar
- [ ] Responsive PWA optimizasyon
- [ ] Toast sistemi merkezileştir

---

## 💡 ÇALIŞMA PRENSİPLERİ

1. **Tip güvenliği**: Her zaman `packages/shared-types` kullan; inline tip tanımlama yapma.
2. **API versiyonlama**: Tenant endpoint'leri `/api/v1/`, SaaS endpoint'leri `/api/saas/v1/` prefix'ini taşımalı.
3. **Tenant izolasyonu**: API'da her sorguda `tenantId` JWT'den alınmalı; asla client'tan gelen tenantId'ye güvenilmemeli.
4. **Finansal kayıtlar silinmez**: `orders`, `payments`, `refunds`, `z_reports`, `audit_logs` tabloları soft-delete bile uygulamaz; storno kaydı oluşturulur.
5. **Socket-first realtime**: Polling sadece fallback; socket olmadan çalışan bir ekran eksik sayılır.
6. **Offline önce düşün**: Yeni bir sipariş/ödeme akışı yazarken IndexedDB fallback'ini de yaz.
7. **RBAC backend zorunlu**: Frontend rol kontrolü UX içindir; asıl kontrol NestJS guard'larında yapılır.
8. **i18n her zaman**: Hard-coded string yasak; `t('key')` kullan, `packages/i18n/locales/` dosyalarına ekle.
9. **Audit log kritik işlemlerde**: Tenant oluşturma, silme, plan değişikliği, impersonation, storno — hepsi `audit_logs`'a yazılmalı.
10. **Production vs Staging farkı**: Demo seed, test endpoint'leri → `NODE_ENV !== 'production'` kontrolü zorunlu.

---

*Bu prompt NextPOS projesinin tüm bağlamını, bilinen hatalarını ve geliştirme standartlarını kapsar. Herhangi bir paneli, akışı veya hatayı bu bağlamda ele al.*
