# NextPOS — POS Panelleri (Özellikler)

Bu dosya **apps/pos** uygulaması içindeki panellerin (Kasiyer, Mutfak, Garson, Kurye, Teslim, Admin) **ne yaptığı**, **hangi rollere açık olduğu**, **hangi ana akışları yönettiği** ve **hangi API/Socket etkileşimlerini** kullandığını kod bazlı olarak özetler.

## 1) Panel Haritası (Route → Rol → Amaç)

| Panel | URL | Rol / Yetki | Amaç |
|---|---|---|---|
| Giriş | `/login` | Public | Tenant seçimi + şifre/PIN ile giriş |
| Kasiyer POS | `/cashier` | Auth (genelde `cashier`, `admin`) | Masa/menü → sepet → ödeme → operasyon |
| Mutfak KDS | `/kitchen/:station` | `kitchen` / `admin` / `cashier` + entitlement: `kitchen_display` | Bilet yönetimi (Bekleyen → Hazırlanıyor → Hazır) |
| Garson | `/waiter` | `waiter` / `admin` / `cashier` + entitlement: `waiter_tablet` | Masa yönetimi + servis çağrıları + mutfaktan teslim |
| Kurye | `/courier` | `courier` / `admin` / `cashier` + entitlement: `courier_module` | Teslimat kuyruğu + rota + tahsilat |
| Teslim Merkezi | `/handover` | Auth | Hazır/paket servis ve salon servis hattı operasyonu |
| Admin | `/admin/*` | `admin` + bazı alanlar `cashier` | Yönetim: menü, salon, personel, raporlar, ayarlar, muhasebe |

Notlar:
- Entitlement (modül) kapalıysa ilgili panel “kilitli modül” ekranı gösterir ve Ayarlar’a yönlendirir.
- Admin shell, bazı menüleri `admin` rolüne özel açar; `cashier` rolü sınırlı görür.

## 2) Kasiyer POS Terminali (`/cashier`)

### Amaç
Kasadan sipariş alma ve yönetme ekranıdır:
- Masa bazlı (dine-in) veya hızlı satış (masa seçmeden)
- Ürün seçimi + varyant + modifikasyon + not
- Ödeme alma (nakit/kart) ve kapanış akışları
- Online sipariş / WhatsApp sipariş / arayan numara entegrasyonu

### Ana Ekran Bölümleri
- **Header**: oturum/rol, durum, hızlı aksiyonlar.
- **BillingWarning**: lisans/modül uyarıları.
- **2 görünüm**:
  - **Kat planı (floor)**: [TableFloorGrid] masa seçimi ve salon görünümü.
  - **Menü (menu)**: kategori sidebar + ürün grid + arama.
- **Sepet paneli**: [CartPanel] sepet, indirim/puan, ödeme.
- **Modallar**:
  - Online sipariş listesi: [OnlineOrdersModal]
  - WhatsApp sipariş: [WaOrderModal]
  - Caller ID: [CallerIdModal] + [CallerIdNotification]
  - Mutfak durumu: [KitchenStatusModal]
  - Ürün detay (varyant/mod/not): [ProductModal]
  - Personel menüsü/panel: [StaffMenu], [StaffPanelModal]

### Kritik Kullanıcı Akışları
1. **Masa seç → oturum aç**  
   - Masa seçilir, boşsa oturum açılır; doluysa mevcut oturum devam eder.
   - API: `POST /api/v1/tables/:id/open`
2. **Ürün ekle**  
   - Kategori → ürün → varyant/modifikasyon → sepete ekle.
3. **Sipariş oluştur / mutfağa gönder**  
   - Sepetten sipariş oluşturma/checkout akışına geçiş (oturum/masa ve order type’e göre).
   - API: `POST /api/v1/orders`, `POST /api/v1/orders/checkout` veya `POST /api/v1/orders/checkout-session`
4. **Ödeme al**  
   - Nakit: alınan tutar/para üstü  
   - Kart: opsiyonel “simülasyon” modu (settings üzerinden)  
   - API: `POST /api/v1/orders/checkout-session`, `POST /api/v1/payments/session/:sessionId`
5. **Adisyon böl (split bill)**  
   - Kalem seçerek kısmi ödeme.  
   - API: `POST /api/v1/orders/split-checkout`
6. **Masa işlemleri**  
   - Kalem taşıma: bir masadan diğerine ürün/kalem transferi  
   - Masa iptali: oturum iptali  
   - API: `POST /api/v1/tables/transfer-item`, `POST /api/v1/tables/:id/cancel`
7. **Yazdırma / yeniden yazdırma**  
   - Tarayıcı print ile çıktı altyapısı + “son mutfak fişi / son adisyon” tekrar basma seçenekleri.

### Realtime & Senkron
Kasiyer ekranı Socket.io ile canlı senkron çalışır:
- Katılım: `join:tenant` + `presence:staff_register`
- Olaylar:
  - `order:new`, `order:status_changed`, `order:ready`
  - `payment:received`
  - `sync:menu_revision` (menü yenile), `sync:tables_changed` (masa yenile)
  - `customer:service_call`
  - `external_order:new` (web sipariş)
  - `customer:whatsapp_order`
  - `table:focused` / `table:blurred` (masaya “kim bakıyor” bilgisini gösterme)

### Offline Davranış (Özet)
- Menü/masa verileri için cache ve offline senkron altyapısı bulunur.
- Bazı işlemler offline iken kuyruğa alınabilir (örn. checkout payload enqueue).

## 3) Mutfak KDS (`/kitchen/:station`)

### Amaç
Mutfak ekranı (KDS) biletleri yönetir:
- Kolonlar: Bekleyen → Hazırlanıyor → Hazır
- Her bilette kalemler tek tek “hazır” işaretlenebilir
- Bilet durum güncellenir ve servis tarafına bildirilir

### Rol / İstasyon Mantığı
- `station`: `all`, `hot`, `cold`, `bar`
- Kullanıcı rolü `kitchen` ise ve `kitchen_station` set ise yalnızca kendi istasyonunu görür.
- Fullscreen desteği vardır.

### Kritik Akışlar
1. **Biletleri çek**  
   - API: `GET /api/v1/kitchen/tickets` (station filtreli)
2. **Durum güncelle**  
   - `waiting → preparing`  
   - `preparing → ready`  
   - `ready → completed` (servis/kurye/kasiyere bildirim)
   - API: `PATCH /api/v1/kitchen/tickets/:id/status`
3. **Kalem check (kısmi hazır)**  
   - Bilet item listesi güncellenir.
   - API: `PATCH /api/v1/kitchen/tickets/:id/items`
4. **Geçmiş / geri al**  
   - Tamamlanan bilet listesi (son saatler) drawer ile görüntülenebilir.
   - API: `GET /api/v1/kitchen/tickets/completed`

### Realtime & Offline
- Socket olayları:
  - `kitchen:ticket_created`, `kitchen:ticket_updated`, `kitchen:ticket_merged`, `kitchen:ticket_deleted`
- Offline iken durum güncellemesi yerel kuyruğa alınır; internet gelince sırayla sunucuya uygulanır.

## 4) Garson Paneli (`/waiter`)

### Amaç
Garsonun tablet/PWA benzeri operasyon ekranı:
- Masaları gör, aç/kapat, hızlı durum takibi
- Masa başında sipariş oluştur (varyant/mod/not)
- Mutfaktan “hazır” olanları teslim al / servis et
- Müşteri kaynaklı servis çağrılarını (hesap iste, yardım çağır) yönet
- QR sipariş onayı (müşteri QR menü siparişi)

### Ana Ekran Bileşenleri (Özet)
- Masa kartları: durum renkleri, uzun süre dolu eşik, servis çağrısı overlay.
- Müşteri tanıma: [CustomerIdentify] (isim/telefon/kod araması)
- Ürün ekleme modalı: [OrderProductModal]
- Onay modalı: [ModernConfirmModal]

### Kritik Akışlar ve API’ler
- Masaları çek: `GET /api/v1/tables`
- Masa aç: `POST /api/v1/tables/:id/open`
- Hazır siparişleri çek: `GET /api/v1/orders?status=ready` (masa bazlı veya genel)
- Sipariş durum güncelle:
  - `PUT /api/v1/orders/:id/status`
  - `POST /api/v1/orders/:id/pickup` (mutfaktan teslim alma)
- Servis çağrıları:
  - `GET /api/v1/service-calls?status=pending`
  - `PUT /api/v1/service-calls/:id/status`
- QR sipariş onayı:
  - `POST /api/v1/orders/:id/approve-qr`
  - `POST /api/v1/orders/:id/reject-qr`

### Realtime Olaylar (Özet)
- Socket join:
  - `join:tenant`
  - `join:waiter { tenantId, userId }`
- Dinlenen olaylar:
  - `order:ready`, `kitchen:item_partial_ready`
  - `customer:service_call`, `service_call:updated`
  - `customer:order_request` (QR)
  - `order:status_changed`

## 5) Kurye Paneli (`/courier`)

### Amaç
Kurye teslimat ekranı:
- Atanan / hazır teslimatları listeler
- Adres/telefon bilgisi ile hızlı iletişim
- Navigasyon linkleri (Google/Waze/Apple)
- Kapıda ödeme (nakit/kart/QR) + bahşiş seçenekleri
- Teslimat durum güncelleme

### Öne Çıkan Mekanikler
- Adresleri “rota grubu” olarak gruplayabilir (posta kodu veya adres parçaları ile).
- Ödeme modalı: yöntem seçimi + bahşiş hesaplama (settings’ten).

### API’ler
- Teslimat kuyruğu: `GET /api/v1/orders?deliveryQueue=true`
- Son tamamlananlar: `GET /api/v1/orders?limit=10&status=completed`
- Ayarlar (kurye): `GET /api/v1/sync/settings`
- Durum aksiyonları: `POST /api/v1/orders/:id/:endpoint` (ready/shipped/completed gibi)

### Realtime
- Kurye ekranı ayrıca gerçek zamanlı sync hook ile güncellenir (socket + yedek poll).

## 6) Teslim Merkezi (`/handover`)

### Amaç
Tam ekran “teslim hattı” ekranı:
- Hazır sipariş sayısı
- Hazırlanıyor sayısı
- 20 dakikadan fazla bekleyen hazırlar
- Detay/işlem için gömülü teslim merkez içerik bileşeni

### Çalışma Şekli
- 15 saniyede bir otomatik yeniler.
- API:
  - `GET /api/v1/orders?status=ready`
  - `GET /api/v1/orders?status=preparing`

## 7) Admin Paneli (`/admin/*`)

### Genel
Admin paneli restoran yönetim ekranıdır:
- Menü/salon/personel/rapor/stok/ayarlar gibi yönetim işlerini içerir.
- Side-nav üzerinde bazı modüller entitlement’a göre gizlenir veya “kilitli” ekran gösterir.
- Rol kontrolü:
  - `admin` ve `cashier` erişebilir
  - Menü/salon/personel gibi kritik yönetimler çoğunlukla `admin` rolüne özeldir

### Modül Kilidi (Entitlement) Mantığı
Admin shell `GET /api/v1/billing/status` çağrısından gelen entitlements’ı okur.
Örnek kapatılabilir modüller:
- `customer_crm` → Müşteriler
- `inventory` → Stok / Reçeteler
- `table_reservation` → Rezervasyonlar
- `courier_module` → Bölgeler / Kuryeler

### Admin Bölümleri

#### 7.1) Overview / Komuta Merkezi (`/admin`)
- API: `GET /api/v1/admin/dashboard`
- KPI’lar:
  - Bugünkü ciro, sipariş adedi, dolu masa, bekleyen ödeme
  - Mutfak durum sayıları, teslimat durumları, aktif kurye sayısı
  - Top ürünler, şube online/offline bilgisi
- Hızlı geçiş kartları:
  - POS Terminali, KDS, Teslim Merkezi, Garson, Kurye Takibi, Sistem Ayarları
- Simülasyon aksiyonu:
  - API: `POST /api/v1/admin/simulate` (web sipariş simülasyonu gibi)

#### 7.2) Menü Yönetimi (`/admin/menu`)
Kapsam:
- Ürün CRUD
- Kategori CRUD
- Varyant yönetimi (ürün bazlı)
- Modifikatör atama (ürün bazlı)
- Toplu fiyat güncelleme (percent/fixed vb.)
- Kopyalama:
  - Varyantları kategoriye/specific ürünlere kopyalama
  - Modifikatörleri kategoriye/specific ürünlere kopyalama
- Çeviriler:
  - Ürün isimleri için `de/tr/en` alanları

Kullanılan API’ler (örnek):
- `GET /api/v1/menu/admin/categories`
- `GET /api/v1/menu/admin/products`
- `POST/PUT/DELETE /api/v1/menu/admin/products`
- `POST /api/v1/menu/admin/products/bulk-price`
- `GET/PUT /api/v1/menu/admin/products/:id/variants`
- `GET/PUT /api/v1/menu/admin/products/:id/modifiers`
- `GET /api/v1/menu/modifiers`

#### 7.3) Salon & Masalar (`/admin/floor`)
Kapsam:
- Bölüm (section) CRUD
- Masa CRUD + toplu masa üretimi
- Masa çevirileri (tr/en/de)
- QR müşteri menü linki üretme/kopyalama
- Görsel mod:
  - Kat planı/masa sürükle-bırak tasarımı (TableDesignerLayout)

API’ler:
- `GET/POST/DELETE /api/v1/admin/sections`
- `GET /api/v1/tables`
- `POST /api/v1/admin/tables/bulk`
- `POST/PUT/DELETE /api/v1/admin/tables`

#### 7.4) Personel (`/admin/staff`)
Kapsam:
- Kullanıcı CRUD (admin/cashier/waiter/kitchen/courier)
- PIN tanımlama (hızlı giriş)
- Garson bölge atama:
  - Tüm salon veya tek section
- Mutfak istasyon atama:
  - all/hot/cold/bar
- Cihaz kilidi yönetimi:
  - Tek kullanıcı device reset
  - Tüm kullanıcılar device reset
- Lisans limitleri:
  - `maxUsers` limitine göre yeni kullanıcı ekleme kısıtı

API’ler:
- `GET/POST/PUT/DELETE /api/v1/users`
- `POST /api/v1/users/:id/reset-device`
- `POST /api/v1/users/reset-devices/all`
- `GET /api/v1/tables/sections`

#### 7.5) Personel Performans (`/admin/staff-performance`)
Kapsam:
- Tarih aralığı seçimi
- Personel verimlilik matrisi
- Mesai / satış / servis sayıları

API:
- `GET /api/v1/admin/reports/personnel-detailed?from=...&to=...`

#### 7.6) Müşteriler / CRM (`/admin/customers`)
Kapsam:
- Müşteri listesi + arama
- Segment/loyalty istatistikleri
- Detay modal:
  - müşteri bilgisi
  - sipariş geçmişi
  - rapor (harcama/puan)
- CSV export / import
- Toplu işlemler (bulk action)
- Kampanya mesajı hazırlığı (whatsapp/email)

API’ler:
- `GET /api/v1/customers?q=...`
- `GET /api/v1/customers/stats/loyalty`
- `GET /api/v1/customers/:id`
- `GET /api/v1/customers/:id/report`
- `PATCH /api/v1/customers/:id`
- `POST /api/v1/customers/bulk-action`
- `POST /api/v1/customers/bulk`
- `POST /api/v1/customers/campaign`

#### 7.7) Kampanyalar (`/admin/campaigns`)
Kapsam:
- Kampanya oluşturma/silme (percent indirim)
- Hedefleme:
  - tüm menü / kategori / ürün
- Order type kapsamı (delivery/takeaway/all)
- İsteğe bağlı “müşteriye kupon üret” akışı (seçili müşterilere bulk coupon)

API’ler:
- `GET/POST/DELETE /api/v1/coupons/campaigns`
- `GET /api/v1/menu/categories?lang=tr`
- `GET /api/v1/menu/products?lang=tr`
- `GET /api/v1/customers/search?q=...`
- `POST /api/v1/coupons/bulk`

#### 7.8) Rezervasyonlar (`/admin/reservations`)
Kapsam:
- Tarihe göre rezervasyon listesi
- Masa seçimi ile rezervasyon ekleme/düzenleme/silme
- Entitlement ile kilitlenebilir

API’ler:
- `GET /api/v1/admin/reservations?from=...&to=...`
- `POST /api/v1/admin/reservations`
- `PUT /api/v1/admin/reservations/:id`
- `DELETE /api/v1/admin/reservations/:id`
- `GET /api/v1/tables`

#### 7.9) Raporlar (`/admin/reports`)
Kapsam:
- Dönem özeti (from/to):
  - günlük seri, toplamlar, top ürünler
- PDF export:
  - dönem pdf
- Z raporu:
  - tarih seçimi, z raporu görüntüleme
  - gün kilidi (lock/unlock)
  - z raporu pdf
- Personel performans özetleri (waiter/courier)
- Entitlement ile gelişmiş raporlar kilitlenebilir (403 → locked)

API’ler:
- `GET /api/v1/admin/reports/summary?from=...&to=...`
- `GET /api/v1/admin/reports/summary/pdf?from=...&to=...`
- `GET /api/v1/admin/reports/z-report?date=...`
- `GET /api/v1/admin/reports/z-report/pdf?date=...`
- `POST /api/v1/admin/reports/z-day-lock`
- `DELETE /api/v1/admin/reports/z-day-lock/:date`
- `GET /api/v1/admin/reports/staff-performance`

#### 7.10) Stok (`/admin/stock`)
Kapsam:
- Ürün bazlı stok görüntüleme
- Düşük stok uyarıları (limitli liste)
- Stok düzeltme (+/- delta)
- Ürün aktif/pasif
- Tedarikçi bilgisi + son alış fiyatı/tarihi metadata

API’ler:
- `GET /api/v1/menu/admin/products`
- `GET /api/v1/admin/stock/alerts?limit=...`
- `POST /api/v1/menu/admin/products/:id/stock-adjust`
- `PUT /api/v1/menu/admin/products/:id` (metadata kaydetme)

#### 7.11) Reçeteler / BOM (`/admin/recipes`)
Kapsam:
- Ürün seç → varyantları çek → reçete satırlarını yönet
- Hammadde (ingredient) olarak diğer ürünleri seçip “qty_per_unit” belirleme
- Stok tüketim raporu (from/to) + CSV export

API’ler:
- `GET /api/v1/menu/admin/products`
- `GET /api/v1/menu/admin/products/:id/variants`
- `GET /api/v1/menu/admin/products/:id/recipe`
- `PUT /api/v1/menu/admin/products/:id/recipe`
- `GET /api/v1/admin/stock/consumption?from=...&to=...`

#### 7.12) Teslimat Bölgeleri (`/admin/delivery`)
Kapsam:
- Bölge CRUD (min order, delivery fee, est minutes)
- GeoJSON polygon alanı (JSON girerek)
- Şube bazlı atama
- Entitlement kilidi (403 → locked)

API’ler:
- `GET /api/v1/admin/delivery-zones`
- `POST/PUT/DELETE /api/v1/admin/delivery-zones`

#### 7.13) Kurye Yönetimi (`/admin/couriers`)
Kapsam:
- Kurye canlı istatistikleri (bugün teslimat, nakit/kart tahsilat)
- Online/offline + konum (socket presence)
- Kurye detay:
  - son siparişler
  - teslim edilecek nakit toplamı
- Tahsilat mutabakatı (reconcile)
- Entitlement kilidi (403 → locked)

API’ler:
- `GET /api/v1/admin/couriers/stats`
- `GET /api/v1/admin/couriers/:id/details`
- `POST /api/v1/admin/couriers/:id/reconcile`
- Socket: `presence:staff_update`, `admin:request_courier_location`

#### 7.14) Muhasebe / İşlemler (`/admin/accounting`)
Kapsam:
- Satış/iptal işlemleri listesi
- Gelişmiş filtreler (tarih, tutar aralığı, ödeme yöntemi, garson)
- İşlem detayı + düzenleme
- Silme (işlem kaydı)

API’ler:
- `GET /api/v1/admin/accounting?type=sales|cancelled`
- `PUT /api/v1/admin/accounting/:id`
- `DELETE /api/v1/admin/accounting/:id`

#### 7.15) Sistem Ayarları (`/admin/settings`)
Kapsam (ekran sekmeleri):
- Genel bilgiler + operasyonel ayarlar
- API & entegrasyonlar (caller-id vb.)
- Online/QR sipariş ayarları
- Fiş tasarımı / vergi ayarları
- Kiosk (masa tableti) ayarları
- Yazıcı & otomasyon (reprint, otomatik fiş)
- Şubeler (branch CRUD): `/api/v1/admin/branches`
- Modüller (entitlement görüntüleme/CTA)
- Demo veri yükleme (reset + seed): `/api/v1/admin/settings/demo-seed`
- Cihaz kilidi sıfırlama (tenant içi): `/api/v1/users/reset-devices/all`

## 8) Uçtan Uca Operasyon Akışları

Bu bölüm, panellerin birbirine nasıl bağlandığını “işletme akışı” şeklinde özetler.

### 8.1) Salon Siparişi (Dine-in) — Kasiyer Merkezli Akış
1. Kasiyer `/cashier` ekranında masayı seçer veya açar (`POST /tables/:id/open`).
2. Menüden ürün + varyant + modifikasyon seçip sepete ekler.
3. Sipariş mutfağa gönderilir (`POST /orders` + ilgili kitchen ticket üretimi).
4. Mutfak `/kitchen/:station` ekranında bilet:
   - `waiting → preparing → ready` ilerletir (`PATCH /kitchen/tickets/:id/status`).
5. Garson `/waiter` veya kasiyer ekranına “hazır” bilgisi Socket ile düşer (`order:ready`).
6. Garson teslim alır/servis eder (`POST /orders/:id/pickup` veya status update).
7. Hesap istenir, kasiyer ödeme alır (`checkout-session` / `split-checkout`).
8. Masa kapanır, raporlama ve muhasebe kayıtları güncellenir.

### 8.2) QR Sipariş Akışı (Müşteri → Garson Onayı)
1. Müşteri `/qr/:tableId` menüsünden sipariş oluşturur.
2. Garson paneline `customer:order_request` olayı düşer.
3. Garson:
   - Onaylar: `POST /orders/:id/approve-qr`
   - Reddeder: `POST /orders/:id/reject-qr`
4. Onaylanan sipariş mutfak kuyruğuna girer, normal KDS akışıyla ilerler.
5. Hazır olduğunda garson teslim alır, sipariş adisyona yansır.

### 8.3) Servis Çağrısı Akışı (Garson Çağır / Hesap İste)
1. Müşteri QR ekranından servis çağrısı gönderir.
2. Kasiyer ve garson tarafına `customer:service_call` olayı düşer.
3. Garson paneli çağrıyı tablo kartı üstünde overlay ile gösterir.
4. Garson çağrıyı aksiyona çevirir (`PUT /service-calls/:id/status`).
5. Çağrı kapanınca `service_call:updated` ile tüm ilgili ekranlar senkron olur.

### 8.4) Paket Servis / Kurye Akışı
1. Sipariş takeaway/delivery tipinde oluşturulur.
2. KDS hazır ettiğinde sipariş kurye kuyruğuna uygun hale gelir.
3. Kurye `/courier` ekranında teslimatı görür:
   - Adres, telefon, rota linkleri (Google/Waze/Apple)
   - Durum güncellemeleri (yola çıktı/teslim edildi vb.)
4. Kapıda ödeme gerekiyorsa ödeme modalı ile yöntem + tip alınır.
5. Admin `/admin/couriers` ekranından:
   - Canlı konum/presence
   - Günlük tahsilat
   - Reconcile (mutabakat) sürecini yönetir.

### 8.5) Teslim Merkezi Akışı (`/handover`)
1. Hazır siparişler ve hazırlananlar 15 sn polling ile çekilir.
2. Operatör bekleyen hazır siparişleri teslim hattında izler.
3. 20+ dk bekleme KPI’si ile geciken siparişler görünür.
4. Gömülü handover içerikten hızlı servis/teslim aksiyonları uygulanır.

### 8.6) Admin Yönetim Akışı (Backoffice Döngüsü)
1. `/admin/menu`: ürün/kategori/varyant/modifier güncellenir.
2. Değişiklikler runtime’da POS tarafında menü senkronuyla görünür (`sync:menu_revision`).
3. `/admin/floor`: masa ve bölüm yapısı düzenlenir; QR linkleri güncellenir.
4. `/admin/staff`: kullanıcı/rol/PIN + cihaz kilidi yönetimi yapılır.
5. `/admin/settings`: entegrasyonlar, fiş, kiosk, demo seed, modül ayarları uygulanır.
6. `/admin/reports` ve `/admin/accounting`: gün sonu ve finansal takip tamamlanır.

## 9) Bilinen Kısıtlar (Koddan görülen)
- Bazı admin modülleri 403 döndüğünde “kilitli” ekran gösterir; açmak için lisans/modül etkinleştirme gerekir.
- Offline senaryolarında bazı işlemler kuyruğa alınır; tüm çakışma çözümü senaryosu ayrı mekaniklere bağlıdır.

---

## 10) SaaS Admin Paneli (`/saas-admin`)

### Genel
SaaS Admin paneli, tüm tenant'ların (restoranların) ve bayilerin yönetildiği üst düzey merkezi kontrol ekranıdır.
- **Konum:** `apps/pos/src/pages/SaaSAdmin.tsx` dosyasından çalışır (SaaS uygulaması olarak `5176` portundan veya ayrı domainden servis edilebilir).
- **Rol Kontrolü:**
  - `super_admin`: Tüm sistemi, tüm tenant'ları, abonelik planlarını ve bayileri yönetebilir.
  - `reseller`: Yalnızca kendi oluşturduğu tenant'ları ve kendi bayi profilini/cüzdanını görebilir.

### Ana Modüller (Sekmeler)

#### 10.1) Dashboard (Genel Bakış)
- Canlı İstatistikler (toplam tenant, aylık gelir, aktif oturumlar).
- Sistem Sağlığı (DB gecikmesi, uptime) ve Büyüme Raporu.
- Son işlemlerin gerçek zamanlı (live feed) canlı akışı.

#### 10.2) Kiracılar / Restoranlar (Tenants)
- Yeni restoran ekleme (isim, şema adı, yetkili, vergi no, ödeme tipi).
- Plan ve Modül seçimi (örn. `qr_web_menu`, `courier_module`).
- Ek cihaz kotaları atama ve kilit sıfırlama sınırları yönetimi.
- QR domain tahsisi (örn. `restoran.hpdemos.de` otomatik alt alan adı).
- Restoran durum değiştirme (aktif/pasif) ve şifre işlemleri.

#### 10.3) Bayiler (Resellers)
- *Yalnızca `super_admin` erişebilir.*
- Bayi profili oluşturma, silme, düzenleme (vergi no, komisyon oranı, adres vb.).
- Bayi lisans sayıları, cüzdan (wallet) bakiyesi yönetimi.
- Bayi plan yükseltme ve lisans transfer işlemleri.

#### 10.4) Finans ve Muhasebe
- Tahsilat Takibi (banka, nakit, kredi kartı işlemleri).
- Bekleyen ödemeler, vadesi yaklaşan abonelikler ve aylık/yıllık gelir raporları.
- Fatura oluşturma ve yönetimi.
- **Yaklaşan Ödemeler ve Komisyonlar:** Dashboard ve finans özetinde bayilerin komisyonları, süper admin'in aylık tahmini kazancı (Estimated Earnings) izlenir.

#### 10.5) POS Satış Faturaları (POS Invoices)
- Tenant'ların kendi içlerinde kestiği perakende POS satış fişleri ve faturalarına süper admin / bayi seviyesinden merkezi erişim (müşteri şikayetleri/destek için).

#### 10.6) Planlar ve Kampanyalar
- Abonelik planı (Starter, Pro, Enterprise vb.) CRUD işlemleri.
- Her planın özellik ve modül (Add-on) matrisleri (dahil / kilitli).
- İndirim kampanyaları ve kupon kodu üretim/dağıtım sistemi.

#### 10.7) Sistem Ayarları, Yedekleme ve Güvenlik
- Global para birimi, komisyon/kurulum ücret oranları.
- Sanal POS (Iyzico, PayTR, Stripe) yapılandırması.
- Güvenlik: Başarısız giriş denetimleri, aktif oturumlar, detaylı Audit Log izleme (gelişmiş filtreler ve CSV export).
- Yedekleme (Backups): SaaS admin ve kiracı bazlı otomatik/manuel DB yedekleri.

---

## 11) Bayi (Reseller) Paneli

### Genel
SaaS Admin paneli ile aynı UI/altyapıyı (`SaaSAdmin.tsx`) kullanır ancak `reseller` rolü ile giriş yapıldığında yetkiler ve görünümler otomatik olarak "Bayi" kapsamına sınırlandırılır.

### Kapsam ve Kısıtlar
1. **Kendi Tenant'ları:** Bayi yalnızca kendi kaydettiği restoranları görebilir ve yönetebilir.
2. **Cüzdan (Wallet) Sistemi:**
   - Bayiler ön ödemeli (prepaid) çalışabilir, cüzdanlarına kredi yükleme talebinde bulunabilir.
   - Yeni tenant açarken veya lisans atarken bu cüzdandan düşüm yapılır.
3. **Finans ve Komisyonlar:**
   - Sistemde kendi payına düşen komisyonları (Aylık Tahmini Kazanç, Komisyon Oranı) takip edebilir.
4. **Destek (Support):**
   - Kendi altındaki tenant'lardan gelen destek taleplerini (ticket) görebilir, mesajlaşabilir ve durumlarını güncelleyebilir.
5. **2FA ve Güvenlik:**
   - Authenticator (TOTP) veya E-mail tabanlı 2FA (İki Aşamalı Doğrulama) kurabilir.

---

## 12) SaaS ve Bayi Uçtan Uca Akışları

### 12.1) Yeni Restoran (Tenant) Kurulum Akışı
1. `super_admin` veya `reseller`, Tenants sekmesinden "Yeni Restoran Ekle" modalını açar.
2. Formda; şirket bilgisi, plan, kullanılacak modüller ve ödeme aralığı (aylık/yıllık) girilir.
3. API (`POST /api/v1/tenants`) arka planda ilgili tenant şemasını (PostgreSQL schema) izole olarak oluşturur.
4. Seçilen modüllere göre faturalandırma (Billing) tetiklenir; bayi işlemi yapıyorsa bakiyesi cüzdanından düşülür.
5. `qr_web_menu` modülü seçildiyse arka planda otomatik DNS provizyonu tetiklenir ve `restoranadi.hpdemos.de` alt alan adı Nginx/aaPanel üzerinden ayarlanır.
6. Kurulum bitince master şifre oluşturulur, restoran POS tarafında direkt kullanıma hazırdır.

### 12.2) Bayi Cüzdan Yükleme Akışı
1. Bayi kendi panelinden "Cüzdan Yükleme" (Wallet Top-up) talebi oluşturur.
2. Talep, `super_admin` paneline "Bekleyen Talepler" olarak düşer (Dashboard'da bildirim gösterilir).
3. `super_admin`, finans modülünden işlemi onaylar (`PATCH /api/v1/tenants/reseller/wallet/topup-requests/:id`).
4. Bayinin cüzdan bakiyesi artar, `audit_logs` tablosuna `reseller_wallet_topup_approved` işlenir ve muhasebe (payment_history) kaydı atılır.

### 12.3) Merkezi Fatura & Destek Akışı
1. Bir restoranda POS işlemi gerçekleştiğinde, tenant şemasında fatura oluşur.
2. Müşteri fişini kaybettiğinde destek talebi oluşturulur.
3. Süper admin veya Bayi, `PosInvoices` sekmesinden ilgili tenant'ın satış faturalarını çeker (`GET /api/v1/tenants/:tenantId/pos-invoices`).
4. Fatura sistemden bulunarak PDF veya E-posta olarak müşteriye yeniden gönderilir.

### 12.4) Cihaz Kilidi Sıfırlama (SaaS Admin Özel)
1. Standart tenant adminleri aylık belirlenen kota kadar (örneğin Pro planda 6 kez) cihaz kilidi sıfırlayabilir.
2. Süper Admin, `Tenants` ekranından restoranı seçip `Sıfırla` dediğinde kotalara takılmadan **sınırsız** cihaz resetleme yetkisine sahiptir.
3. Bu sayede donanımsal arıza yaşayan restoranlara acil müdahale merkezden engelsiz sağlanır.
