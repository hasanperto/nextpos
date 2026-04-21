# NextPOS — Özellikler & Panel Spesifikasyonu (v2 — Gözden Geçirilmiş)

> **Bu belge hakkında:** Orijinal `ozellikler.md` dosyasının kapsamlı analizi sonucunda tespit edilen hata, tutarsızlık, eksik akış ve güvenlik sorunları giderilmiş; Kiosk paneli, SaaS Admin, Bayi paneli ve tüm uçtan uca akışlar yeniden yazılmıştır.

---

## İçindekiler

1. [Panel Haritası (Route → Rol → Amaç)](#1-panel-haritası)
2. [RBAC — Merkezi Rol & Yetki Matrisi](#2-rbac--merkezi-rol--yetki-matrisi)
3. [Auth & Tenant Context](#3-auth--tenant-context)
4. [Kasiyer POS Terminali](#4-kasiyer-pos-terminali-cashier)
5. [Mutfak KDS](#5-mutfak-kds-kitchenstation)
6. [Garson Paneli](#6-garson-paneli-waiter)
7. [Kurye Paneli](#7-kurye-paneli-courier)
8. [Teslim Merkezi](#8-teslim-merkezi-handover)
9. [Kiosk (Masa Tableti)](#9-kiosk-masa-tableti-kiosktableid)
10. [Admin Paneli](#10-admin-paneli-admin)
11. [Uçtan Uca Operasyon Akışları](#11-uçtan-uca-operasyon-akışları)
12. [SaaS Admin Paneli](#12-saas-admin-paneli-saas-admin)
13. [Bayi (Reseller) Paneli](#13-bayi-reseller-paneli)
14. [SaaS & Bayi Uçtan Uca Akışları](#14-saas--bayi-uçtan-uca-akışları)
15. [Offline Strateji & Çakışma Çözümü](#15-offline-strateji--çakışma-çözümü)
16. [Güvenlik & Kısıtlar](#16-güvenlik--kısıtlar)

---

## 1) Panel Haritası

| Panel | URL | Rol / Yetki | Amaç |
|---|---|---|---|
| Giriş | `/login` | Public | Tenant seçimi + şifre/PIN ile giriş |
| Kasiyer POS | `/cashier` | `cashier`, `admin` | Masa/menü → sepet → ödeme → operasyon |
| Mutfak KDS | `/kitchen/:station` | `kitchen`, `admin` + entitlement: `kitchen_display` | Bilet yönetimi (Bekleyen → Hazırlanıyor → Hazır) |
| Garson | `/waiter` | `waiter`, `admin` + entitlement: `waiter_tablet` | Masa yönetimi + servis çağrıları + mutfaktan teslim |
| Kurye | `/courier` | `courier`, `admin` + entitlement: `courier_module` | Teslimat kuyruğu + rota + tahsilat |
| Teslim Merkezi | `/handover` | `admin`, `cashier` | Hazır/paket servis ve salon servis hattı operasyonu |
| **Kiosk** | `/kiosk/:tableId` | `device_token` (PIN-less, cihaz bazlı) | Masa tableti self-order: menü → sepet → sipariş |
| Admin | `/admin/*` | `admin` + bazı alanlar `cashier` | Yönetim: menü, salon, personel, raporlar, ayarlar, muhasebe |
| SaaS Admin | `/saas-admin/*` | `super_admin`, `reseller` | Multi-tenant yönetim, bayi, finans, sistem |

> **Düzeltme — Teslim Merkezi:** Orijinal belgede `/handover` için yetki "Auth" (tüm giriş yapmış roller) olarak tanımlanmıştı. Bu güvenlik açığıdır. `admin` veya `cashier` rolü zorunludur.
>
> **Düzeltme — Mutfak KDS:** Orijinal belgede `cashier` rolü KDS'e erişebiliyordu ve gerekçe yoktu. KDS operasyonel bir ekrandır; `cashier` erişimi kaldırıldı. Gerekirse `cashier_kds_fallback` entitlement'ı ile açılabilir.

---

## 2) RBAC — Merkezi Rol & Yetki Matrisi

| İzin / Panel | `super_admin` | `reseller` | `admin` | `cashier` | `waiter` | `kitchen` | `courier` | `device` (kiosk) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/cashier` | — | — | ✓ | ✓ | — | — | — | — |
| `/kitchen` | — | — | ✓ | — | — | ✓ | — | — |
| `/waiter` | — | — | ✓ | — | ✓ | — | — | — |
| `/courier` | — | — | ✓ | — | — | — | ✓ | — |
| `/handover` | — | — | ✓ | ✓ | — | — | — | — |
| `/kiosk/:tableId` | — | — | — | — | — | — | — | ✓ |
| `/admin/*` | — | — | ✓ | kısıtlı | — | — | — | — |
| `/saas-admin/*` | ✓ | kısıtlı | — | — | — | — | — | — |
| Muhasebe kaydı düzenle | — | — | ✓ | — | — | — | — | — |
| Muhasebe storno (void) | — | — | ✓ | — | — | — | — | — |
| Muhasebe satış sil (soft delete) | — | — | ✓ | — | — | — | — | — |
| Menü CRUD | — | — | ✓ | — | — | — | — | — |
| Stok düzelt | — | — | ✓ | — | — | — | — | — |
| Personel CRUD | — | — | ✓ | — | — | — | — | — |
| Tenant oluştur | ✓ | ✓ (kendi kotası) | — | — | — | — | — | — |
| Tenant sil/pasif | ✓ | — | — | — | — | — | — | — |
| Bayi CRUD | ✓ | — | — | — | — | — | — | — |
| Cüzdan yükleme onayla | ✓ | — | — | — | — | — | — | — |
| Demo seed tetikle | ✓ (staging only) | — | — | — | — | — | — | — |

---

## 3) Auth & Tenant Context

### 3.1) JWT Yapısı
Her istek şu claim'leri taşır:

```json
{
  "sub": "user-uuid",
  "tenantId": "tenant-schema-name",
  "role": "cashier",
  "entitlements": ["kitchen_display", "courier_module"],
  "deviceId": "optional-device-uuid",
  "exp": 1234567890
}
```

- **Tenant izolasyonu:** API gateway her istekte `tenantId` claim'ini okur ve veritabanı sorgularını o şemaya yönlendirir. Uygulama katmanı cross-tenant sorgu yapamaz.
- **Kiosk cihazları:** Kullanıcı JWT'si yerine `device_token` (uzun ömürlü, revoke edilebilir) kullanır. `role: "device"`, `tableId` claim'i içerir.
- **SaaS Admin:** Ayrı bir JWT issuer veya `saas_context: true` claim'i ile tenant scope dışında çalışır.

### 3.2) Rate Limiting (Tenant Bazlı)
- Her tenant için API katmanında istek limiti uygulanır (örn. 300 req/dk).
- SaaS Admin endpoint'leri ayrı, daha düşük limitli havuza alınır.
- Aşım durumunda `429 Too Many Requests` + `Retry-After` header döner.

### 3.3) 2FA
- `reseller` ve `super_admin` rolleri için TOTP (authenticator app) veya e-posta OTP ile 2FA zorunludur.
- Tenant `admin` için isteğe bağlı; settings'ten aktif edilir.
- POS operasyonel roller (cashier, waiter vb.) için 2FA desteklenmez; PIN yeterlidir.

---

## 4) Kasiyer POS Terminali (`/cashier`)

### Amaç
Kasadan sipariş alma ve yönetme ekranıdır:
- Masa bazlı (dine-in) veya hızlı satış (masa seçmeden)
- Ürün seçimi + varyant + modifikasyon + not
- Ödeme alma (nakit/kart) ve kapanış akışları
- Online sipariş / WhatsApp sipariş / arayan numara entegrasyonu

### Ana Ekran Bölümleri
- **Header:** oturum/rol, durum, hızlı aksiyonlar.
- **BillingWarning:** lisans/modül uyarıları.
- **2 görünüm:**
  - **Kat planı (floor):** `[TableFloorGrid]` masa seçimi ve salon görünümü.
  - **Menü (menu):** kategori sidebar + ürün grid + arama.
- **Sepet paneli:** `[CartPanel]` sepet, indirim/puan, ödeme.
- **Modallar:** OnlineOrdersModal, WaOrderModal, CallerIdModal, KitchenStatusModal, ProductModal, StaffMenu, StaffPanelModal.

### Kritik Kullanıcı Akışları

**1. Masa seç → oturum aç**
- Masa seçilir, boşsa oturum açılır; doluysa mevcut oturum devam eder.
- `POST /api/v1/tables/:id/open`
- Rezervasyon varsa `table.status = reserved` → kasiyer uyarılır, onaylanırsa `status → occupied`.

**2. Ürün ekle**
- Kategori → ürün → varyant/modifikasyon → sepete ekle.

**3. Sipariş oluştur / mutfağa gönder**
- `POST /api/v1/orders` → sipariş kaydı + `kitchen_ticket` otomatik oluşur.
- `POST /api/v1/orders/checkout` → masa/oturum bazlı checkout başlatır (ödeme almadan sadece mutfağa gönderir).

> **Düzeltme:** Orijinal belgede "sipariş oluştur" ve "ödeme al" adımlarında aynı endpoint `POST /api/v1/orders/checkout-session` kullanılıyordu; bu iki farklı işlem için ayrı endpoint'ler olmalıdır (aşağıda ayrıştırıldı).

**4. Ödeme al**
- Nakit: alınan tutar/para üstü hesapla.
- Kart: opsiyonel "simülasyon" modu (settings → kart simülatörü).
- `POST /api/v1/payments/sessions` → ödeme oturumu oluştur (body: `{ orderId, method, amount }`)
- `POST /api/v1/payments/sessions/:sessionId/complete` → ödemeyi kapat.

**5. Adisyon böl (split bill)**
- Kalem seçerek kısmi ödeme.
- `POST /api/v1/orders/:id/split-checkout` (body: `{ items: [...], method, amount }`)

**6. Masa işlemleri**
- Kalem taşıma: `POST /api/v1/tables/transfer-items` (body: `{ fromTableId, toTableId, itemIds }`)
- Masa iptali (boş oturum): `POST /api/v1/tables/:id/cancel`

**7. İade / Storno**
- Kısmi veya tam iade: `POST /api/v1/orders/:id/refund` (body: `{ items?: [...], reason, method }`)
- İade muhasebe kaydı otomatik oluşur (`type: refund`), orijinal kayıt silinmez.

**8. Loyalty / Puan Kullanımı**
- Mevcut bakiye çek: `GET /api/v1/customers/:id/loyalty`
- Ödeme sırasında puan uygula: `POST /api/v1/orders/:id/apply-loyalty` (body: `{ customerId, points }`)
- Sipariş kapanınca puan kazan: otomatik backend trigger.

**9. Yazdırma / yeniden yazdırma**
- Tarayıcı print altyapısı + son mutfak fişi / son adisyon tekrar basma.
- `POST /api/v1/print/kitchen-ticket` (body: `{ orderId }`)
- `POST /api/v1/print/receipt` (body: `{ orderId }`)

### Realtime & Senkron
- Katılım: `join:tenant` + `presence:staff_register`
- Olaylar dinlenir:
  - `order:new`, `order:status_changed`, `order:ready`
  - `payment:received`
  - `sync:menu_revision`, `sync:tables_changed`
  - `customer:service_call`
  - `external_order:new`, `customer:whatsapp_order`
  - `table:focused` / `table:blurred`
  - `reservation:created` (masa rezerve olunca kasiyer uyarısı)

### Offline Davranış
- Menü/masa verileri IndexedDB cache'e alınır.
- Offline iken oluşturulan siparişler yerel kuyruğa eklenir; bağlantı gelince sırayla gönderilir.
- Ödeme işlemleri **offline'da engellenebilir** (ayarla yapılandırılabilir); kasa kapanmaz ama ödeme alınamaz.

---

## 5) Mutfak KDS (`/kitchen/:station`)

### Amaç
Mutfak ekranı biletleri yönetir:
- Kolonlar: Bekleyen → Hazırlanıyor → Hazır
- Her bilette kalemler tek tek "hazır" işaretlenebilir
- Bilet durumu güncellenir ve servis tarafına bildirilir

### Rol / İstasyon Mantığı
- `station` değerleri: `all`, `hot`, `cold`, `bar`
- `kitchen` rolü + `kitchen_station` set ise yalnızca kendi istasyonunu görür.
- `admin` rolü tüm istasyonları görebilir.
- Fullscreen desteği vardır.

> **Düzeltme:** `cashier` rolü Mutfak KDS'e erişemez. Bu hem güvenlik hem de UX açısından sorunludur; cashier POS'ta çalışırken KDS'i de izlemesi beklenmez. Gerekiyorsa `cashier_kds_view` entitlement ile salt-okunur erişim verilebilir.

### Kritik Akışlar

1. **Biletleri çek:** `GET /api/v1/kitchen/tickets?station=hot`
2. **Durum güncelle:**
   - `waiting → preparing`: `PATCH /api/v1/kitchen/tickets/:id/status` (body: `{ status: "preparing" }`)
   - `preparing → ready`: aynı endpoint (body: `{ status: "ready" }`)
   - `ready → completed`: aynı endpoint; socket ile garson/kasiyere bildirim gönderilir.
3. **Kalem check (kısmi hazır):** `PATCH /api/v1/kitchen/tickets/:id/items` (body: `{ itemId, ready: true }`)
4. **Geçmiş / geri al:** `GET /api/v1/kitchen/tickets/completed?since=2h`

### Realtime & Offline
- Socket: `kitchen:ticket_created`, `kitchen:ticket_updated`, `kitchen:ticket_merged`, `kitchen:ticket_deleted`
- Offline durum güncellemesi yerel kuyruğa alınır; bağlantı gelince sırayla uygulanır.
- **Çakışma:** Aynı bilet iki KDS ekranından eş zamanlı güncellenirse timestamp-wins (son güncelleme geçerli) uygulanır; log'a düşülür.

---

## 6) Garson Paneli (`/waiter`)

### Amaç
Garsonun tablet/PWA benzeri operasyon ekranı:
- Masaları gör, aç, hızlı durum takibi
- Masa başında sipariş oluştur (varyant/mod/not)
- Mutfaktan "hazır" olanları teslim al / servis et
- Müşteri kaynaklı servis çağrılarını yönet
- QR sipariş onayı

### Ana Ekran Bileşenleri
- Masa kartları: durum renkleri, uzun süre dolu eşik, servis çağrısı overlay.
- Müşteri tanıma: `[CustomerIdentify]` (isim/telefon/kod araması)
- Ürün ekleme: `[OrderProductModal]`
- Onay: `[ModernConfirmModal]`

### Kritik Akışlar ve API'ler

```
GET  /api/v1/tables                         — masaları listele
POST /api/v1/tables/:id/open                — masa aç
GET  /api/v1/orders?status=ready&tableId=X  — masa bazlı hazır siparişler
PATCH /api/v1/orders/:id/status             — sipariş durumu güncelle  ← PUT→PATCH düzeltildi
POST /api/v1/orders/:id/pickup              — mutfaktan teslim al
GET  /api/v1/service-calls?status=pending   — bekleyen çağrılar
PATCH /api/v1/service-calls/:id/status      — çağrıyı kapat  ← PUT→PATCH düzeltildi
POST /api/v1/orders/:id/approve-qr          — QR siparişi onayla
POST /api/v1/orders/:id/reject-qr           — QR siparişi reddet
```

> **Düzeltme:** Orijinal belgede `PUT` kullanılıyordu. Durum güncellemeleri kısmi değişiklik olduğundan `PATCH` kullanılmalıdır.

### Realtime
- Socket join: `join:tenant`, `join:waiter { tenantId, userId }`
- Dinlenen olaylar: `order:ready`, `kitchen:item_partial_ready`, `customer:service_call`, `service_call:updated`, `customer:order_request` (QR), `order:status_changed`, `reservation:created`

---

## 7) Kurye Paneli (`/courier`)

### Amaç
Kurye teslimat ekranı:
- Atanan / hazır teslimatları listeler
- Adres/telefon bilgisi + navigasyon linkleri (Google/Waze/Apple)
- Kapıda ödeme (nakit/kart/QR) + bahşiş seçenekleri
- Teslimat durum güncelleme

### Öne Çıkan Mekanikler
- Adresleri rota grubuna göre sıralayabilir (posta kodu / adres parçası).
- Ödeme modalı: yöntem seçimi + bahşiş hesaplama.

### API'ler

```
GET  /api/v1/orders?deliveryQueue=true              — teslimat kuyruğu
GET  /api/v1/orders?status=completed&limit=10       — son tamamlananlar
GET  /api/v1/sync/settings                          — kurye ayarları
PATCH /api/v1/orders/:id/status                     — durum güncelle (body: { status })
```

**Geçerli durum geçişleri (kurye için):**

| Mevcut Durum | Yeni Durum | Anlamı |
|---|---|---|
| `ready` | `shipped` | Kurye teslimatı aldı, yola çıktı |
| `shipped` | `delivered` | Müşteriye teslim edildi |
| `shipped` | `failed` | Teslim edilemedi (body: `{ failReason }`) |

> **Düzeltme:** Orijinal belgede `POST /api/v1/orders/:id/:endpoint` (ready/shipped/completed gibi) şeklinde belirsiz bir endpoint tanımı vardı. Tüm durum geçişleri `PATCH /api/v1/orders/:id/status` + explicit `status` enum ile standardize edildi.

### Realtime
- Socket + yedek poll (30 sn) ile senkronize.
- `delivery:assigned` olayı dinlenir (yeni teslimat atandı).

---

## 8) Teslim Merkezi (`/handover`)

### Amaç
Tam ekran teslim hattı ekranı:
- Hazır sipariş sayısı ve listesi
- Hazırlanıyor sayısı
- 20+ dakika bekleyen hazır siparişler (KPI uyarısı)
- Hızlı servis/teslim aksiyonları

### Çalışma Şekli
- Socket ile canlı güncellenir; 15 saniyelik polling yedek olarak çalışır.
- `order:ready` ve `order:status_changed` socket olaylarını dinler.
- API:
  - `GET /api/v1/orders?status=ready`
  - `GET /api/v1/orders?status=preparing`

> **Düzeltme:** Orijinal belgede `/handover` yalnızca 15 sn polling ile çalışıyordu ve socket bağlantısı yoktu. Diğer tüm operasyonel paneller socket kullandığından bu tutarsızlık giderildi. Polling fallback olarak kaldı.
>
> **Düzeltme:** Rol kontrolü "Auth" (herkese açık) yerine `admin` veya `cashier` olarak kısıtlandı.

---

## 9) Kiosk (Masa Tableti) (`/kiosk/:tableId`)

### Amaç
Masa üstüne monte edilmiş tablette çalışan, müşterinin kendi siparişini verdiği self-order ekranıdır. QR menü akışından farklı olarak:
- Müşterinin kendi telefonu yerine **tablette yerleşik cihaz** üzerinden çalışır.
- Kullanıcı hesabı / PIN gerekmez; cihaz, table'a kayıtlı `device_token` ile çalışır.
- Ödeme: kasada öde seçeneği veya opsiyonel entegre ödeme terminali.

### Cihaz Kayıt Akışı (Tek Seferlik)
1. Admin `/admin/settings` → Kiosk sekmesinden "Yeni Kiosk Cihazı Kaydet" açar.
2. Hangi masaya ait olduğu seçilir; `device_token` + `tableId` üretilir.
3. Tablet bu URL ile açılır: `/kiosk/:tableId?token=<device_token>`
4. Cihaz, token'ı localStorage'a kaydeder; bir daha giriş gerekmez.
5. Token revoke edilirse cihaz otomatik kilit ekranına düşer.

```
POST /api/v1/devices/register          — body: { tableId, deviceName }  → { deviceToken }
GET  /api/v1/devices/:deviceToken/verify
POST /api/v1/devices/:deviceToken/revoke
```

### Ana Ekran Akışı

**1. Menü Görüntüle**
- Kiosk, QR menü ile **aynı menü verisini** kullanır; ayrı endpoint gerekmez.
- `GET /api/v1/menu/public?tableId=:tableId` — dil, aktif kategoriler, güncel fiyatlar.

**2. Sepete Ekle**
- Ürün → varyant/modifikasyon seçimi → sepet (local state).
- Sepet sunucuya gönderilmez, sipariş anında POST edilir.

**3. Sipariş Ver**
- `POST /api/v1/orders/kiosk` (body: `{ tableId, deviceToken, items: [...], paymentIntent: "pay_at_cashier" | "card_terminal" }`)
- Sipariş oluşur → KDS'e `kitchen_ticket` düşer → garson paneline `customer:order_request` socket olayı gider.
- Garson onayı **gerekmez** (kiosk siparişleri auto-approve edilir; ayarla değiştirilebilir).

**4. Ödeme**
- `pay_at_cashier`: Ekranda "Lütfen kasaya gidiniz" mesajı gösterilir; sipariş kasiyerin adisyonuna yansır.
- `card_terminal`: Entegre ödeme terminali tetiklenir (opsiyonel donanım entegrasyonu).

**5. Sipariş Durumu Takibi**
- Sipariş verildikten sonra ekranda "Hazırlanıyor / Hazır" durumu canlı gösterilir.
- `GET /api/v1/orders/:id/status` (polling, 10 sn) veya socket ile.
- Durum `ready` olunca "Siparişiniz hazır!" animasyonu gösterilir.

### Kiosk Ayarları (`/admin/settings` → Kiosk sekmesi)
- Kiosk modunu etkinleştir/devre dışı bırak.
- Garson onayı gerektirsin mi? (varsayılan: hayır)
- Ödeme yöntemi: yalnızca kasada öde / terminal + kasada öde.
- Ekran zaman aşımı (idle reset, varsayılan 90 sn).
- Başlangıç dili seçimi.
- Cihaz listesi + token yönetimi (revoke).

### Realtime
- `sync:menu_revision` dinlenir → menü otomatik yenilenir.
- `sync:tables_changed` dinlenir → masa durumu değişince kiosk pasif ekrana alınabilir.

---

## 10) Admin Paneli (`/admin/*`)

### Genel
Restoran yönetim ekranıdır. `admin` rolü tam erişime sahiptir; `cashier` rolü yalnızca aşağıdaki modüllere sınırlı erişebilir: Dashboard, Raporlar (görüntüleme), Muhasebe (görüntüleme).

### Modül Kilidi (Entitlement) Mantığı
`GET /api/v1/billing/status` → `entitlements[]` listesi okunur.
Kilitli modüller: `customer_crm`, `inventory`, `table_reservation`, `courier_module`, `kiosk_module`.

---

### 10.1) Dashboard (`/admin`)
- `GET /api/v1/admin/dashboard`
- KPI'lar: bugünkü ciro, sipariş adedi, dolu masa, bekleyen ödeme, mutfak durumları, teslimat durumları, aktif kurye, top ürünler, şube online/offline.
- Hızlı geçiş: POS, KDS, Teslim Merkezi, Garson, Kurye Takibi, Ayarlar.
- Simülasyon: `POST /api/v1/admin/simulate` (yalnızca staging/demo ortamında aktif).

---

### 10.2) Menü Yönetimi (`/admin/menu`)
- Ürün / Kategori / Varyant / Modifikatör CRUD.
- Toplu fiyat güncelleme (percent/fixed).
- Varyant ve modifikatörleri kategoriye/ürünlere kopyalama.
- Ürün görseli yükleme.
- Çeviriler: `tr / en / de`.

```
GET    /api/v1/menu/admin/categories
POST   /api/v1/menu/admin/categories
PUT    /api/v1/menu/admin/categories/:id
DELETE /api/v1/menu/admin/categories/:id
GET    /api/v1/menu/admin/products
POST   /api/v1/menu/admin/products
PUT    /api/v1/menu/admin/products/:id
DELETE /api/v1/menu/admin/products/:id
POST   /api/v1/menu/admin/products/bulk-price
GET    /api/v1/menu/admin/products/:id/variants
PUT    /api/v1/menu/admin/products/:id/variants
GET    /api/v1/menu/admin/products/:id/modifiers
PUT    /api/v1/menu/admin/products/:id/modifiers
GET    /api/v1/menu/modifiers
POST   /api/v1/menu/admin/products/:id/image   ← YENİ: multipart/form-data, CDN'e yükler, URL döner
DELETE /api/v1/menu/admin/products/:id/image   ← YENİ
```

---

### 10.3) Salon & Masalar (`/admin/floor`)
- Bölüm (section) CRUD, masa CRUD + toplu üretim.
- Masa çevirileri (tr/en/de).
- QR müşteri menü linki üretme/kopyalama.
- Kiosk cihaz durumu görüntüleme (hangi masada aktif kiosk var).
- Kat planı sürükle-bırak tasarımı.

```
GET/POST/DELETE /api/v1/admin/sections
GET             /api/v1/tables
POST            /api/v1/admin/tables/bulk
POST/PUT/DELETE /api/v1/admin/tables
GET             /api/v1/admin/kiosk-devices         ← YENİ: masa bazlı kiosk cihaz listesi
```

---

### 10.4) Personel (`/admin/staff`)
- Kullanıcı CRUD (admin/cashier/waiter/kitchen/courier).
- PIN tanımlama.
- Garson bölge atama (tüm salon / tek section).
- Mutfak istasyon atama (all/hot/cold/bar).
- Cihaz kilidi yönetimi.
- `maxUsers` lisans limiti kontrolü.

```
GET/POST/PUT/DELETE /api/v1/users
POST               /api/v1/users/:id/reset-device
POST               /api/v1/users/reset-devices/all
GET                /api/v1/tables/sections
```

---

### 10.5) Personel Performans (`/admin/staff-performance`)
- Tarih aralığı seçimi.
- Personel verimlilik matrisi (garson + kurye ayrı).
- Sipariş sayısı, servis süresi, tahsilat toplamları.

```
GET /api/v1/admin/reports/staff-performance?from=...&to=...&role=waiter|courier
```

> **Düzeltme:** Orijinal belgede iki farklı endpoint vardı: `personnel-detailed` (Bölüm 7.5) ve `staff-performance` (Bölüm 7.9). Bunlar birleştirilerek tek endpoint'e `role` filtresi eklendi. `Bölüm 7.9 (Raporlar)` artık bu endpoint'e yönlendirme yapar.

---

### 10.6) Müşteriler / CRM (`/admin/customers`)
- Müşteri listesi + arama, segment/loyalty istatistikleri.
- Detay modal: bilgi, sipariş geçmişi, harcama/puan raporu.
- CSV export/import, toplu işlemler, kampanya mesajı (WhatsApp/email).
- Puan bakiyesi görüntüleme ve manuel düzeltme (admin yetkisi).

```
GET    /api/v1/customers?q=...
GET    /api/v1/customers/stats/loyalty
GET    /api/v1/customers/:id
GET    /api/v1/customers/:id/report
GET    /api/v1/customers/:id/loyalty            ← YENİ: detaylı puan bakiyesi + geçmiş
PATCH  /api/v1/customers/:id
POST   /api/v1/customers/bulk-action
POST   /api/v1/customers/bulk
POST   /api/v1/customers/campaign
PATCH  /api/v1/customers/:id/loyalty/adjust     ← YENİ: manuel puan düzeltme (body: { delta, reason })
```

---

### 10.7) Kampanyalar (`/admin/campaigns`)
- Kampanya oluşturma / düzenleme / silme (percent indirim).
- Hedefleme: tüm menü / kategori / ürün.
- Order type kapsamı (delivery/takeaway/dine-in/all).
- İsteğe bağlı bulk kupon üretimi.

```
GET    /api/v1/coupons/campaigns
POST   /api/v1/coupons/campaigns
PUT    /api/v1/coupons/campaigns/:id    ← YENİ: kampanya düzenleme (orijinal belgede eksikti)
DELETE /api/v1/coupons/campaigns/:id
GET    /api/v1/menu/categories?lang=tr
GET    /api/v1/menu/products?lang=tr
GET    /api/v1/customers/search?q=...
POST   /api/v1/coupons/bulk
```

---

### 10.8) Rezervasyonlar (`/admin/reservations`)
- Tarihe göre rezervasyon listesi.
- Masa seçimi ile ekleme/düzenleme/silme.
- Rezervasyon oluşturulunca ilgili masanın durumu `reserved` olarak işaretlenir; kasiyer ve garson paneli socket ile uyarılır.
- Rezervasyon saatinde otomatik reminder (e-posta/SMS).

```
GET    /api/v1/admin/reservations?from=...&to=...
POST   /api/v1/admin/reservations        — body içinde tableId zorunlu; masa otomatik reserved yapılır
PUT    /api/v1/admin/reservations/:id
DELETE /api/v1/admin/reservations/:id    — silince masa durumu serbest bırakılır
GET    /api/v1/tables
```

---

### 10.9) Raporlar (`/admin/reports`)
- Dönem özeti (from/to): günlük seri, toplamlar, top ürünler.
- PDF export.
- Z raporu: görüntüleme, gün kilidi (lock/unlock), PDF export.
- Personel performans özetleri → `staff-performance` endpoint'ine yönlendirilir.

```
GET  /api/v1/admin/reports/summary?from=...&to=...
GET  /api/v1/admin/reports/summary/pdf?from=...&to=...
GET  /api/v1/admin/reports/z-report?date=...
GET  /api/v1/admin/reports/z-report/pdf?date=...
POST /api/v1/admin/reports/z-day-lock
DELETE /api/v1/admin/reports/z-day-lock/:date
GET  /api/v1/admin/reports/staff-performance?from=...&to=...&role=waiter|courier
```

---

### 10.10) Stok (`/admin/stock`)
- Ürün bazlı stok görüntüleme, düşük stok uyarıları.
- Stok düzeltme (+/- delta), ürün aktif/pasif.
- Tedarikçi bilgisi + son alış fiyatı/tarihi.

> **Önemli:** Stok'ta izlenen varlıklar **satılabilir ürünler** (SKU bazlı)dir. Reçete hammaddeleri (ingredients) bunlardan farklıdır; bir ürün hem satılabilir hem hammadde olabilir — bu durum `is_ingredient: true` flag ile işaretlenir.

```
GET  /api/v1/menu/admin/products?includeStock=true
GET  /api/v1/admin/stock/alerts?limit=...
POST /api/v1/menu/admin/products/:id/stock-adjust   — body: { delta, reason }
PUT  /api/v1/menu/admin/products/:id                — metadata (tedarikçi, fiyat) kaydetme
```

---

### 10.11) Reçeteler / BOM (`/admin/recipes`)
- Ürün → varyant → reçete satırları yönetimi.
- Hammadde olarak `is_ingredient: true` işaretli ürünler seçilir; `qty_per_unit` belirlenir.
- Stok tüketim raporu + CSV export.

```
GET /api/v1/menu/admin/products?isIngredient=true
GET /api/v1/menu/admin/products/:id/variants
GET /api/v1/menu/admin/products/:id/recipe
PUT /api/v1/menu/admin/products/:id/recipe
GET /api/v1/admin/stock/consumption?from=...&to=...
```

---

### 10.12) Teslimat Bölgeleri (`/admin/delivery`)
- Bölge CRUD (min sipariş, teslimat ücreti, tahmini süre).
- GeoJSON polygon (harita veya JSON girerek).
- Şube bazlı atama.

```
GET           /api/v1/admin/delivery-zones
POST          /api/v1/admin/delivery-zones
PUT           /api/v1/admin/delivery-zones/:id
DELETE        /api/v1/admin/delivery-zones/:id
```

---

### 10.13) Kurye Yönetimi (`/admin/couriers`)
- Kurye canlı istatistikleri (teslimat adedi, nakit/kart tahsilat).
- Online/offline + konum (socket presence).
- Kurye detay: son siparişler, teslim edilecek nakit.
- Tahsilat mutabakatı (reconcile).

```
GET  /api/v1/admin/couriers/stats
GET  /api/v1/admin/couriers/:id/details
POST /api/v1/admin/couriers/:id/reconcile
Socket: presence:staff_update, admin:request_courier_location
```

---

### 10.14) Muhasebe / İşlemler (`/admin/accounting`)
- Satış/iptal işlemleri listesi.
- Gelişmiş filtreler (tarih, tutar, ödeme yöntemi, garson).
- İşlem detayı + düzenleme (not, etiket).

> **Kritik Not:** POS Admin muhasebede **satış silme** yetkisine sahiptir; ancak bu işlem **hard delete değildir**. Kayıt veritabanından fiziksel olarak silinmez; `deleted_at/deleted_by` ile **soft delete** uygulanır ve audit log'a yazılır. Silinen satış, varsayılan görünümde muhasebede görünmez.

**Görünürlük Ayarı (İptal/Silinmiş):**
- Muhasebe ekranında “İptaller” ve “Silinenler” görünümü olsa bile, tenant ayarlarından **iptal ve/veya silinmiş işlemleri muhasebede hiç gösterme** seçeneği kapatılabilir.
- Bu ayar açıkken `type=cancelled` ve/veya `type=deleted` sorguları UI tarafından çağrılmaz; backend de tercihen bu tipleri filtreleyebilir.

```
GET   /api/v1/admin/accounting?type=sales|cancelled|refund|deleted
PUT   /api/v1/admin/accounting/:id           — yalnızca not/etiket düzenlenebilir, tutar değiştirilemez
POST  /api/v1/admin/accounting/:id/void      — storno kaydı oluşturur, orijinal kayıt korunur
POST  /api/v1/admin/accounting/:id/delete    — satış kaydını soft-delete eder (UI'dan gizler)
POST  /api/v1/admin/accounting/:id/restore   — soft-delete geri al (opsiyonel)
```

---

### 10.15) Sistem Ayarları (`/admin/settings`)

**Sekmeler:**
- Genel bilgiler + operasyonel ayarlar
- API & entegrasyonlar (caller-id, webhook yapılandırması)
- Online/QR sipariş ayarları
- Fiş tasarımı / vergi ayarları
- Muhasebe görünürlüğü: iptal/silinmiş işlemleri listelerde göster/gizle
- **Kiosk (masa tableti) ayarları** — cihaz listesi, token yönetimi, davranış ayarları
- Yazıcı & otomasyon
- Şubeler (branch CRUD)
- Modüller (entitlement görüntüleme/CTA)

**Yazıcı Yönetimi (yeni):**
```
GET    /api/v1/admin/printers
POST   /api/v1/admin/printers            — body: { name, type, ip, port, station }
PUT    /api/v1/admin/printers/:id
DELETE /api/v1/admin/printers/:id
POST   /api/v1/admin/printers/:id/test   — test baskısı gönder
```

**Demo seed:**
```
POST /api/v1/admin/settings/demo-seed
```

> **Kritik Güvenlik Düzeltmesi:** Bu endpoint `NODE_ENV !== "production"` kontrolü ile **yalnızca staging/demo ortamında** aktif olmalıdır. Production tenant'ta bu endpoint çağrıldığında `403 Forbidden` dönmelidir. Ayrıca çift onay (confirm dialog) zorunludur.

**Cihaz kilidi sıfırlama:**
```
POST /api/v1/users/reset-devices/all
```

---

## 11) Uçtan Uca Operasyon Akışları

### 11.1) Salon Siparişi (Dine-in) — Kasiyer Merkezli
1. Kasiyer masayı seçer → `POST /tables/:id/open`.
2. Menüden ürün + varyant + modifikasyon → sepete ekle.
3. Sipariş mutfağa gönderilir → `POST /orders` → kitchen ticket oluşur.
4. Mutfak: `waiting → preparing → ready` (`PATCH /kitchen/tickets/:id/status`).
5. Socket `order:ready` → garson/kasiyer ekranına düşer.
6. Garson teslim alır → `POST /orders/:id/pickup`.
7. Kasiyer ödeme alır → `POST /payments/sessions` + `POST /payments/sessions/:id/complete`.
8. Masa kapanır → raporlama ve muhasebe kaydı otomatik güncellenir.

### 11.2) Kiosk Self-Order (Masa Tableti) Akışı
1. Müşteri masaya oturur; tablette kiosk ekranı açıktır.
2. Menüde gezinerek ürün seçer → sepete ekler.
3. "Sipariş Ver" → `POST /orders/kiosk` → KDS'e otomatik ticket düşer.
4. Ekranda sipariş durumu canlı izlenir (socket veya 10 sn polling).
5. "Hazır" bildirimi tablette gösterilir.
6. Ödeme: kasada ödeme veya terminal.
7. Adisyon kasiyerin ekranına düşer → normal checkout akışı.

### 11.3) QR Sipariş Akışı (Müşterinin Kendi Telefonu)
1. Müşteri `/qr/:tableId` QR menüsünden sipariş oluşturur.
2. Garson paneline `customer:order_request` socket olayı düşer.
3. Garson onaylar (`POST /orders/:id/approve-qr`) veya reddeder.
4. Onaylanan sipariş KDS kuyruğuna girer, normal akışla ilerler.
5. Hazır olunca garson teslim alır; adisyona yansır.

### 11.4) Servis Çağrısı (Garson Çağır / Hesap İste)
1. Müşteri QR ekranından servis çağrısı gönderir.
2. `customer:service_call` → kasiyer ve garson ekranına düşer.
3. Garson çağrıyı aksiyona çevirir → `PATCH /service-calls/:id/status`.
4. Kapanınca `service_call:updated` → tüm ekranlar senkron.

### 11.5) Paket Servis / Kurye Akışı
1. Sipariş `delivery` tipinde oluşturulur.
2. KDS hazır eder → kurye kuyruğuna girer.
3. Kurye `/courier` ekranında → `PATCH /orders/:id/status` (shipped → delivered).
4. Kapıda ödeme: ödeme modalı → yöntem + bahşiş.
5. Admin `/admin/couriers` → canlı konum, günlük tahsilat, reconcile.

### 11.6) Rezervasyon → Masa Oturumu Akışı
1. Admin `/admin/reservations` → rezervasyon oluştur → masa otomatik `reserved`.
2. Kasiyer ekranında masa kartı "Rezerveli" görünür; socket ile anlık güncellenir.
3. Müşteri gelince kasiyer masayı açar → `POST /tables/:id/open` → durum `occupied`.
4. Normal dine-in akışı devam eder.

### 11.7) İade / Storno Akışı
1. Kasiyer kapalı siparişte iade başlatır.
2. `POST /orders/:id/refund` (body: `{ items?, reason, method }`)
3. İade muhasebe kaydı (`type: refund`) otomatik oluşur; orijinal kayıt silinmez.
4. Stok: iade edilen ürünlerin stoğu opsiyonel olarak geri eklenebilir (ayar).
5. Puan: iade edilen harcama tutarındaki puan müşteriden düşülür.

---

## 12) SaaS Admin Paneli (`/saas-admin`)

### Genel
Tüm tenant'ların ve bayilerin yönetildiği merkezi kontrol paneli.

- **Konum:** `apps/pos/src/pages/SaaSAdmin.tsx` — bağımsız deployment veya alt domain ile çalışır.
- **Roller:**
  - `super_admin`: Tüm sisteme erişir.
  - `reseller`: Yalnızca kendi tenant'larını, kendi profilini ve cüzdanını görür.

> **Güvenlik Notu:** Rol bazlı görünüm farklılaştırması **yalnızca backend'de** uygulanmalıdır. Frontend `reseller` rolüne super_admin endpoint'lerini çağırdığında `403 Forbidden` almalıdır. Frontend filtreleme tek başına yeterli değildir.

### API Endpoint Yapısı (SaaS katmanı)
Tüm SaaS admin endpoint'leri `/api/saas/v1/` prefix'i ile tenant-scoped API'lardan ayrılır.

---

### 12.1) Dashboard

```
GET /api/saas/v1/dashboard/stats
```

Döndürür: toplam tenant sayısı, aylık gelir, aktif oturum sayısı, sistem sağlığı (DB gecikmesi, uptime), büyüme raporu, son işlemler feed.

- Socket: `saas:live_feed` kanalı → yeni tenant kaydı, ödeme alındı, bayi talebi gibi olaylar canlı akar.

---

### 12.2) Kiracılar / Restoranlar (Tenants)

```
GET    /api/saas/v1/tenants?q=...&status=active|inactive&resellerId=...
POST   /api/saas/v1/tenants
PUT    /api/saas/v1/tenants/:id
PATCH  /api/saas/v1/tenants/:id/status          — body: { status: "active" | "inactive" }
POST   /api/saas/v1/tenants/:id/reset-password  — master şifreyi yeniden oluştur + email ile gönder
GET    /api/saas/v1/tenants/:id/pos-invoices    — cross-tenant POS satış faturaları
GET    /api/saas/v1/tenants/:id/device-resets   — cihaz sıfırlama kota takibi
POST   /api/saas/v1/tenants/:id/device-resets/override  — super_admin: kotayı aşarak sıfırla
```

**Tenant oluşturma body (örnek):**
```json
{
  "name": "Lezzet Restoran",
  "schemaName": "lezzet_restoran",
  "ownerName": "Ahmet Yılmaz",
  "ownerEmail": "ahmet@lezzet.com",
  "taxNumber": "1234567890",
  "plan": "pro",
  "modules": ["qr_web_menu", "courier_module"],
  "billingInterval": "monthly",
  "qrDomain": "lezzet"
}
```

> **Not:** Tenant oluşturma işlemi arka planda şu adımları sırayla çalıştırır: (1) PostgreSQL şeması oluştur, (2) seed data yükle, (3) billing kaydı oluştur, (4) `qr_web_menu` varsa DNS provisioning tetikle. Bu işlem birkaç saniye sürebilir; API uzun-polling veya `202 Accepted` + `taskId` + `GET /tasks/:id/status` webhook pattern'i ile asenkron sonuç döner.

**DNS Provisioning Hata Senaryosu:**
- DNS adımı başarısız olursa tenant yine de oluşturulur, `qr_domain_status: "pending_dns"` olarak işaretlenir.
- Admin panelinde uyarı gösterilir; `POST /api/saas/v1/tenants/:id/retry-dns` ile yeniden tetiklenebilir.

---

### 12.3) Bayiler (Resellers) — Yalnızca `super_admin`

```
GET    /api/saas/v1/resellers
POST   /api/saas/v1/resellers
PUT    /api/saas/v1/resellers/:id
DELETE /api/saas/v1/resellers/:id        — yalnızca tenant'ı olmayan bayiler silinebilir
GET    /api/saas/v1/resellers/:id/wallet
POST   /api/saas/v1/resellers/:id/wallet/adjust   — manuel bakiye düzeltme (body: { delta, note })
GET    /api/saas/v1/resellers/:id/tenants
GET    /api/saas/v1/resellers/:id/commissions
```

---

### 12.4) Finans ve Muhasebe

```
GET  /api/saas/v1/finance/summary?from=...&to=...
GET  /api/saas/v1/finance/transactions
GET  /api/saas/v1/finance/pending-payments
GET  /api/saas/v1/finance/upcoming-renewals
POST /api/saas/v1/finance/invoices
GET  /api/saas/v1/finance/invoices/:id/pdf
GET  /api/saas/v1/finance/estimated-earnings?period=monthly
GET  /api/saas/v1/resellers/:id/commissions?from=...&to=...
```

---

### 12.5) Planlar ve Kampanyalar

```
GET    /api/saas/v1/plans
POST   /api/saas/v1/plans
PUT    /api/saas/v1/plans/:id
DELETE /api/saas/v1/plans/:id    — aktif tenant'ı olmayan planlar silinebilir
GET    /api/saas/v1/discounts
POST   /api/saas/v1/discounts
DELETE /api/saas/v1/discounts/:id
POST   /api/saas/v1/coupons/generate   — bulk kupon üretimi
```

---

### 12.6) Sistem Ayarları, Yedekleme ve Güvenlik

```
GET  /api/saas/v1/settings/global
PUT  /api/saas/v1/settings/global
GET  /api/saas/v1/settings/payment-gateways    — Iyzico, PayTR, Stripe config
PUT  /api/saas/v1/settings/payment-gateways/:provider
GET  /api/saas/v1/security/failed-logins?since=...
GET  /api/saas/v1/security/active-sessions
GET  /api/saas/v1/audit-log?from=...&to=...&actor=...&action=...
GET  /api/saas/v1/audit-log/export?format=csv
GET  /api/saas/v1/backups
POST /api/saas/v1/backups/trigger
POST /api/saas/v1/backups/tenants/:tenantId/trigger
GET  /api/saas/v1/backups/:id/restore-status
```

**Audit Log — Zorunlu Kayıt Edilen Olaylar:**
- Tenant oluşturma/silme/pasif yapma
- Plan değişikliği
- Cüzdan yükleme onayı/reddi
- Cihaz kilidi override
- Super admin girişi + başarısız giriş denemeleri
- Global ayar değişiklikleri

---

### 12.7) Tenant Impersonation (Destek Modu)

Super admin, bir tenant'ın admin ekranına destek amacıyla geçici erişim sağlayabilir.

```
POST /api/saas/v1/tenants/:id/impersonate   — body: { reason }  → impersonation_token döner
```

- Token süresi kısıtlıdır (15 dk, uzatılamaz).
- Tüm impersonation oturumları audit_log'a düşer.
- Impersonation sırasında UI köşede "Destek Modu Aktif" banner gösterir.
- Impersonation sırasında yıkıcı işlemler (delete, seed) engellenir.

---

## 13) Bayi (Reseller) Paneli

### Genel
SaaS Admin ile aynı UI (`SaaSAdmin.tsx`) kullanır; `reseller` rolü yetkileri otomatik olarak kısıtlar.

**Reseller'ın görebildiği sekmeler:**
- Dashboard (yalnızca kendi istatistikleri)
- Kendi Tenant'ları
- Cüzdan & Komisyonlar
- Destek Talepleri

**Reseller'ın göremediği (403 döner):**
- Diğer bayilerin verileri
- Global sistem ayarları
- Tüm tenant listesi
- Audit log (kendi işlemleri hariç)

### 13.1) Kendi Tenant'larını Yönetme

```
GET    /api/saas/v1/tenants?resellerId=:myId
POST   /api/saas/v1/tenants           — yeni tenant oluştur (cüzdandan düşülür)
PUT    /api/saas/v1/tenants/:id        — yalnızca kendi tenant'ı
PATCH  /api/saas/v1/tenants/:id/status — aktif/pasif
```

### 13.2) Cüzdan & Komisyonlar

```
GET  /api/saas/v1/resellers/me/wallet
POST /api/saas/v1/resellers/me/wallet/topup-request   ← YENİ: bayi top-up talebini buradan oluşturur
  — body: { amount, note, bankTransferRef? }
GET  /api/saas/v1/resellers/me/wallet/topup-requests  — taleplerim + durum
GET  /api/saas/v1/resellers/me/commissions?from=...&to=...
```

> **Düzeltme:** Orijinal belgede yalnızca super_admin'in onay endpoint'i (`PATCH /api/v1/tenants/reseller/wallet/topup-requests/:id`) vardı. Bayinin talebini nereye POST edeceği tanımlanmamıştı. Yukarıda eklendi.

### 13.3) Destek Talepleri

```
GET   /api/saas/v1/support/tickets?resellerId=:myId
GET   /api/saas/v1/support/tickets/:id
PATCH /api/saas/v1/support/tickets/:id/status
POST  /api/saas/v1/support/tickets/:id/messages
```

### 13.4) 2FA
- Reseller hesabı için TOTP (authenticator app) veya e-posta OTP.
- 2FA kurulum/devre dışı bırakma: `POST /api/saas/v1/auth/2fa/setup`, `DELETE /api/saas/v1/auth/2fa`
- Kaybedilen authenticator için recovery code sistemi.

---

## 14) SaaS & Bayi Uçtan Uca Akışları

### 14.1) Yeni Restoran (Tenant) Kurulum Akışı

1. `super_admin` veya `reseller` → "Yeni Restoran Ekle" → `POST /api/saas/v1/tenants`
2. Arka planda sıralı işlemler:
   - PostgreSQL şeması izole oluşturulur.
   - Seed data yüklenir (temel ayarlar, dil dosyaları).
   - Billing kaydı tetiklenir; bayi işlemi yapıyorsa cüzdandan düşülür.
   - `qr_web_menu` modülü varsa DNS provisioning başlatılır.
3. API `202 Accepted` döner + `taskId`; frontend `GET /tasks/:taskId/status` ile tamamlanmayı bekler.
4. Tamamlanınca: master şifre oluşturulur + kayıtlı e-postaya gönderilir.
5. Restoran POS'a giriş yapabilir; entitlement'lar anında aktif.

### 14.2) Bayi Cüzdan Yükleme Akışı

1. Bayi → `POST /resellers/me/wallet/topup-request`
2. Super admin Dashboard'unda bildirim gösterilir (socket: `saas:topup_request_new`).
3. Super admin finans modülünden onaylar → `PATCH /api/saas/v1/resellers/:id/wallet/topup-requests/:reqId`
4. Bakiye artar; `audit_log` + `payment_history` kaydı oluşur.
5. Bayi panelinde "Talebiniz onaylandı" bildirimi gösterilir.

> **Ret senaryosu:** Super admin reddederse `status: "rejected"` + `rejectReason` alanı dolar; bayi bildirim alır.

### 14.3) Merkezi Fatura & Destek Akışı

1. POS siparişi kapandığında tenant şemasında fatura oluşur.
2. Müşteri destek talebi açarsa: bayi veya super admin → `GET /tenants/:tenantId/pos-invoices` ile faturayı çeker.
3. PDF olarak indir veya e-posta ile yeniden gönder.

### 14.4) Cihaz Kilidi Sıfırlama (Kota Yönetimi)

1. Tenant admin aylık kota dahilinde: `POST /users/:id/reset-device`
2. Kota dolduğunda: `403 Quota Exceeded` döner.
3. Super admin kotayı aşarak: `POST /api/saas/v1/tenants/:id/device-resets/override`
4. Tüm override işlemleri audit log'a düşer.

---

## 15) Offline Strateji & Çakışma Çözümü

> **Düzeltme:** Orijinal belgede "çakışma çözümü ayrı mekaniklere bağlıdır" deyip geçilmişti. Aşağıda netleştirilmiştir.

### 15.1) Offline'da Yapılabilen İşlemler

| İşlem | Offline'da mümkün mü? | Strateji |
|---|:---:|---|
| Menü görüntüleme | ✓ | IndexedDB cache (TTL: 1 saat) |
| Masa görüntüleme | ✓ | IndexedDB cache |
| Sipariş oluşturma | ✓ | Yerel kuyruk, bağlantı gelince gönderilir |
| Mutfak bilet durum güncelleme | ✓ | Yerel kuyruk, sıralı gönderim |
| **Ödeme alma** | ✗ | Engellenir; "Bağlantı gerekli" gösterilir |
| **Masa iptali** | ✗ | Engellenir |
| Stok düzeltme | ✗ | Engellenir |

### 15.2) Çakışma Çözüm Stratejisi

**Sipariş kalemi çakışması (iki kasiyerin aynı masayı açması):**
- `table:focused` / `table:blurred` socket olayları ile "kim bakıyor" gösterilir.
- İkinci kasiyere uyarı: "Bu masaya [İsim] bakıyor." Devam edebilir ama çift işlem riski bildirilir.
- Son kayıt sunucuya kabul edilir (last-write-wins); conflict log'a düşülür.

**Mutfak bilet çakışması (offline kuyruk + canlı güncelleme):**
- Offline kuyruktan gelen güncelleme, sunucudaki son state ile karşılaştırılır.
- Sunucudaki state daha ileri bir aşamadaysa (`ready > preparing`) offline güncelleme sessizce atlanır.
- Çakışma `conflict_log` tablosuna yazılır.

**Menü revision çakışması:**
- `sync:menu_revision` olayı geldiğinde tüm paneller cache'i geçersiz kılar ve yeniden çeker.
- Offline iken oluşturulan sipariş, revision'a göre artık geçersiz bir ürün içeriyorsa: bağlantı gelince kasiyer uyarılır, ilgili kalem kırmızı vurgulanır; manuel düzeltme gerekir.

---

## 16) Güvenlik & Kısıtlar

### Giderilmiş Güvenlik Sorunları

| Sorun | Orijinal | Düzeltilmiş |
|---|---|---|
| Muhasebe kaydı silme | `DELETE /admin/accounting/:id` hard delete | Hard delete kaldırıldı; admin için soft delete + audit log + görünürlük ayarı eklendi |
| Demo seed production'da aktif | Ayarlar ekranından erişilebilir | `NODE_ENV !== "production"` kontrolü + çift onay zorunlu |
| `/handover` herkese açık | `Auth` (tüm roller) | `admin` veya `cashier` rolü zorunlu |
| `cashier` KDS'e erişiyor | Gerekçesiz | Kaldırıldı; opsiyonel entitlement ile açılabilir |

### Bilinen Kısıtlar

- Bazı admin modülleri `403` döndüğünde "kilitli" ekran gösterir; açmak için lisans/modül etkinleştirme gerekir.
- Multi-branch operasyonda raporlar şube bazlı filtrelenebilir; ancak şubeler arası stok transferi henüz desteklenmemektedir.
- Impersonation token yenilenebilir değildir; 15 dakika sonra yeniden oluşturulmalıdır.
- Ödeme gateway webhook'ları (Iyzico, PayTR, Stripe) `/api/v1/webhooks/:provider` üzerinden alınır; imza doğrulaması zorunludur.
