# 🎯 NextPOS — Core Architecture & Development Rules
> **Kritik Geliştirme Standartları · Rol Yetki Matrisi · Veri İzolasyonu · WebSocket Haritası · Offline Mimari · Güncel Hatalar & Backlog**

Bu doküman, NextPOS (hasanperto/nextpos) monorepo projesinin genel analizini, teknik standartlarını, mimari kurallarını ve güncel hata durumlarını tek bir yerde toplar. **Geliştirme yaparken bu kurallara harfiyen uyulması zorunludur.**

---

## 🗺️ 1. PROJE KİMLİĞİ VE HİYERARŞİK MİMARİ

NextPOS; üç katmanlı hiyerarşik yapıya sahip, üretim kalitesinde (production-grade) hibrit (Bulut + 48 Saat Çevrimdışı) çalışan bir SaaS Restoran Otomasyon sistemidir.

### 🏢 Organizasyonel Yapı
```
Platform Sahibi (SaaS Admin)
  └── Bayi (Reseller)
        └── Restoran (Tenant)
              └── Şube → Kasiyer | Garson | Mutfak | Kurye | Müşteri QR / Kiosk
```

### 💻 Teknoloji Yığıtı
* **Monorepo Çerçevesi:** Turborepo (`apps/*` ve `packages/*`)
* **Backend API:** Express tabanlı Node.js (`apps/api`)
* **POS Terminal Arayüzü:** React 18 + Vite SPA (`apps/pos`)
* **Bayi Paneli:** React + Vite SPA (`apps/reseller`)
* **Admin Paneli:** React + Vite SPA (`apps/admin`)
* **Müşteri QR Menü:** Next.js 14 (`apps/qr-menu`)
* **Veritabanı (Bulut):** PostgreSQL 16 + Prisma ORM (Modüller ve Şema izolasyonu)
* **Veritabanı (Yerel/Offline):** IndexedDB + Dexie.js (`pendingOrders`, `pendingPayments` vb.)
* **Önbellek & Kuyruk:** Redis 7 + BullMQ
* **Gerçek Zamanlı İletişim:** Socket.io 4 (Redis Adapter ile yatay ölçeklenebilir)
* **CSS & Arayüz:** Tailwind CSS
* **Çoklu Dil:** react-i18next (🇩🇪 Almanca - *Mevcut varsayılan* / 🇹🇷 Türkçe / 🇬🇧 İngilizce)

---

## 🏗️ 2. MONOREPO DOSYA YAPISI

```
nextpos/
├── apps/
│   ├── api/                    ← Express Backend (port 3001)
│   │   └── src/
│   │       ├── controllers/    ← İstek mantığı
│   │       ├── routes/         ← Rota tanımları (requireRole / auth limitler)
│   │       ├── services/       ← İş/Billing/Kupon servisleri
│   │       └── lib/db.ts       ← withTenant PostgreSQL şema izolasyonu
│   ├── pos/                    ← React + Vite POS Terminali (port 5173)
│   ├── reseller/               ← Bağımsız Bayi Arayüzü (port 5173 custom)
│   ├── admin/                  ← Restoran Admin paneli
│   └── qr-menu/                ← Next.js 14 QR Menü arayüzü
└── packages/
    ├── shared-types/           ← Ortak TypeScript tipleri (Kritik: inline tip tanımlama YASAKTIR)
    ├── ui/                     ← Ortak UI bileşenleri
    └── i18n/                   ← Ortak de/tr/en dil çeviri namespace'leri
```

---

## 🔐 3. GÜVENLİK VE RBAC (ROL BAZLI YETKİLENDİRME) MATRİSİ

### Rol Tanımları ve JWT Payload
```typescript
type Role = 'super_admin' | 'reseller' | 'admin' | 'manager' |
            'cashier' | 'waiter' | 'kitchen' | 'courier' | 'device';

interface JwtPayload {
  sub: string;            // Kullanıcı UUID
  tenantId: string;       // Tenant şema adı ( PostgreSQL Search Path )
  role: Role;
  entitlements: string[]; // ['kitchen_display', 'courier_module', ...]
  deviceId?: string;      // Kiosk cihazları için
  exp: number;
}
```

### 🚫 Değişmez Güvenlik Kuralları
1. **İzolasyon Garantisi:** API'deki veri sorgularında `tenantId` her zaman kullanıcının çözümlenmiş JWT token'ından (`req.user.tenantId`) alınmalıdır. İstemciden (client-side) gelen parametrik `tenantId` değişkenlerine güvenilerek veritabanı sorgusu **yapılamaz**.
2. **`/handover` Operasyonu:** Bu rotaya erişim yalnızca `admin` veya `cashier` rolleriyle sınırlandırılmıştır. `waiter`, `kitchen` veya `courier` buraya erişemez.
3. **Mutfak (KDS) Sınırı:** `cashier` rolüne sahip kullanıcılar KDS (`/kitchen/:station`) ekranlarına erişemez.
4. **Kiosk Kısıtlaması:** `device` token'ına sahip cihazlar yalnızca `/kiosk/:tableId` altındaki self-order rotalarına erişebilir.
5. **Bayi (Reseller) İzolasyonu:** Bayiler sadece kendilerine bağlı olan restoranları (tenant'ları) görebilir ve yönetebilir. Bayi controller katmanlarında `reseller_id !== JWT.userId` ise doğrudan `403 Forbidden` verilmelidir.
6. **2FA Zorunluluğu:** `super_admin` ve `reseller` girişlerinde iki aşamalı doğrulama (TOTP/2FA Challenge) adımları backend ve frontend'de eksiksiz işletilmelidir.

---

## 🗄️ 4. VERİTABANI ŞEMASI VE FİNANSAL İŞ KURALLARI

### ⚠️ Finansal Veri Bütünlüğü (Silme Yasağı)
Finansal ve operasyonel geçmişi barındıran şu tablolarda **fiziksel silme (DELETE) veya soft-delete YASAKTIR**:
* `orders` (Siparişler)
* `payments` (Ödemeler)
* `refunds` (İadeler)
* `z_reports` / `daily_summaries` (Z Raporları)
* `audit_logs` (Denetim Kayıtları)

**Kural:** Muhasebe ve ödeme kayıtlarında bir iptal veya düzeltme gerektiğinde veri silinmez, bunun yerine ters kayıt (Storno - `type: 'refund'` veya `void`) oluşturulur. `DELETE /admin/accounting/:id` endpoint'i yasaklanmış olup, yerine `POST /admin/accounting/:id/void` kullanılmalıdır.

### ⚙️ Multi-Tenant Şema İzole Çalışma Modeli
* PostgreSQL veritabanında kiracılar (tenant'lar) şemalar vasıtasıyla izole edilmiştir.
* `apps/api/src/lib/db.ts` içindeki `withTenant` yardımcı fonksiyonu, veritabanı bağlantısı üzerinde PostgreSQL `search_path` özelliğini ilgili tenant şemasına ayarlayarak sorguları çalıştırır. 
* Ortak tablolar (örneğin `tenants`, `resellers`, `subscription_plans`) `public` şeması altında barındırılır.

---

## 🔌 5. KRİTİK API ENDPOİNT VE ROTASYON KURALLARI

1. **PATCH vs PUT:** Durum güncellemeleri (örneğin sipariş durumunun değişmesi, servis çağrıları vb.) kısmi değişiklikler olduğundan `PUT` yerine her zaman `PATCH` fiiliyle tasarlanmalıdır.
   * `PATCH /api/v1/orders/:id/status` (Doğru)
   * `PATCH /api/v1/service-calls/:id/status` (Doğru)
2. **Sipariş & Checkout:** Siparişin kaydedilmesi (`POST /orders`) ve mutfağa gönderilerek işleme alınması (`POST /orders/checkout`) ayrı endpoint'ler üzerinden yürütülmelidir.
3. **Hata Yakalama ve Sınırlar:** API'den dönen hata kodları (`400`, `401`, `403`, `429 - Rate Limit`) frontend'de (Axios Interceptors) merkezi olarak yakalanmalı ve pop-up engelleyiciler dahil olmak üzere kullanıcıya `toast` mesajları ile bildirilmelidir.

---

## ⚡ 6. WEBSOCKET BİLDİRİM VE ROOM HARİTASI

NextPOS, anlık bildirimler ve çakışma önlemeleri için anlık websocket olaylarına dayanır.

### WebSocket Odaları (Rooms)
* `branch:${branchId}`: Şube genelindeki personel grubu.
* `kitchen:${branchId}:${stationCode}`: Belirli mutfak istasyonları (hot, cold, bar).
* `table:${tableId}`: Masadaki müşteriler ve QR Menü oturumları.
* `courier:${userId}`: Bireysel kurye kanalı.
* `admin:${branchId}`: Kasiyer ve yöneticiler.
* `tenant:${tenantId}`: Tüm şubeleri kapsayan kiracı kanalı.

### Kritik WebSocket Olayları (Events)
* `order:new` / `order:ready` ➔ İlgili şube veya kurye personeline bildirim.
* `kitchen:ticket_created` / `kitchen:ticket_updated` ➔ KDS ekranlarına anlık bilet akışı.
* `qr:order_request` ➔ Müşteri QR'dan sipariş geldiğinde garson onay pop-up'ı tetikler.
* `table:focused` / `table:blurred` ➔ Bir masaya aynı anda birden fazla garsonun veya kasiyerin girmesini engellemek için görsel "Bu masaya şu anda [İsim] bakıyor" uyarısı sağlar.
* `customer:service_call` ➔ Garson çağrısı ve hesap talebi olayları.

---

## 📴 7. 48 SAAT OFFLINE MİMARİSİ (IndexedDB & Dexie.js)

İnternet kesildiğinde sistem durmaz; 48 saat boyunca çevrimdışı çalışmaya devam eder.

### Çevrimdışı Çalışma Kapsamı
* **Yapılabilen İşlemler:** Menü görüntüleme, masa planı takibi, sipariş oluşturma (IndexedDB yerel kuyruğu üzerinden), mutfak bilet güncellemesi.
* **Engellenmesi Gerekenler:** Online ödeme alma, masa iptalleri ve stok düzeltmeleri gibi kritik eylemler engellenmeli ve "Bağlantı Gerekli" uyarısı dönülmelidir.
* **Çakışma Çözümü (Conflict Resolution):** 
  * Sunucu üzerindeki durum yerel durumdan daha ilerideyse (`ready > preparing`), çevrimdışı gelen eski güncelleme yoksayılır.
  * Masalarda en son yazanın önceliği (`last-write-wins`) ilkesi ve `table:focused` olayları uygulanır.

---

## 💻 8. YAZILIM STANDARTLARI VE İYİ UYGULAMALAR

### 💎 Tip Güvenliği (TypeScript)
* `any` kullanımı en aza indirgenmelidir.
* Ortak veri tipleri (örneğin `Order`, `OrderStatus`, `KitchenTicket`, `Branch`, `Product`) mutlaka `@nextpos/shared-types` kütüphanesinden import edilmelidir. Inline tip tanımlaması yapılamaz.
  ```typescript
  // DOĞRU
  import { Order, OrderStatus } from '@nextpos/shared-types';
  
  // YANLIŞ
  type OrderStatus = 'pending' | 'ready'; // packages/shared-types'ta zaten tanımlı!
  ```

### 🌍 Çoklu Dil (i18n) Kuralları
* Arayüzlerde hardcoded (sabit kodlanmış) metin yazmak **YASAKTIR**.
* Tüm metinler `t('namespace:key')` fonksiyonu aracılığıyla `packages/i18n/locales/` içerisinden getirilmelidir.
* Almanca (`de`), Türkçe (`tr`) ve İngilizce (`en`) dillerinin hepsinde çeviri anahtarlarının karşılığı eksiksiz doldurulmalıdır.

---

## 🐛 9. GÜNCEL BULGULAR, DÜZELTİLENLER VE YAPILACAKLAR LİSTESİ

### 🟢 Son Oturumda Giderilen Kritik Buglar
* **Shared-Types Çözümleme Hatası:** `@nextpos/shared-types` paketinin ESM watch modunda bulunamaması sorunu, `apps/api/tsconfig.json` dosyasında `paths` mapping tanımlanarak (`../../packages/shared-types/src/index.ts`) kalıcı olarak çözüldü.
* **Socket Event Uyuşmazlığı:** API tarafında `kitchen:item_ready` tetiklenirken POS tarafında `order:ready` dinleniyordu; `socket/index.ts` her iki event'i de gönderecek şekilde backward-compatible hale getirildi.
* **API Role & Auth Permission Gap:** `/orders` rotalarındaki yetkilendirme açığı kapatılarak, tüm endpoint'lere `requireRole('waiter', 'cashier', 'admin', 'kitchen')` kısıtlamaları eklendi.
* **`req.user!` Çökmesi:** Middleware atlandığında oluşabilecek null pointer çökmeleri engellendi; `req.user?.userId` şeklinde güvenli null-checks getirildi.
* **`submitRemoteOrder` ve `window.open` Pop-up:** API hata mesajlarının yakalanamaması ve pop-up engelleyicilerin sessizce yazıcı/harita ekranlarını engellemesi giderilerek kullanıcılara `toast.error` bildirimleri eklendi.

### 🔲 Aktif Backlog (Yapılacaklar)

#### 🔴 P0 — Yüksek Öncelikli (Hemen Yapılacaklar)
- [ ] **`getEffectiveMaxDevices` Kontrolü:** Cihaz limiti kota enforcement'ının middleware veya servis katmanına entegre edilmesi.
- [ ] **Yazıcı Kotası Entegrasyonu:** `printStations` kotasının sadece settings kaydında değil, sipariş yazdırma akışlarında da servis düzeyinde denetlenmesi.
- [ ] **Muhasebe Arayüzü Güncellemesi:** Admin panelinde muhasebe kayıtlarındaki "Sil" butonunun tamamen kaldırılarak sadece "Storno / Void" işleminin UI'a yansıtılması.

#### 🟠 P1 — Orta Öncelikli
- [ ] **Vat Rate Dinamik Yapılması:** `usePosStore.ts` içindeki sabit `%19` KDV oranının, veritabanı ayarlarından (`DEFAULT_VAT_RATE`) okunarak dinamikleştirilmesi.
- [ ] **Kupon & Kampanya Arayüzü:** Backend'i 11 Nisan'da tamamlanan kupon ve kampanya sisteminin (yüzde, sabit, hediye ürün indirimleri) POS Admin ve SaaS Admin panellerine arayüz olarak eklenmesi.
- [ ] **Sadakat Puan (Loyalty) Harcaması:** Sepette puan kullanarak indirim uygulama (`POST /orders/:id/apply-loyalty`) akışının frontend entegrasyonu.
- [ ] **Mutfak KDS Kısmi Hazır:** Biletlerdeki kalem bazlı checkbox'ların `PATCH /kitchen/tickets/:id/items` API'sine bağlanması.

#### 🟡 P2 — Düşük Öncelikli & Tech Debt
- [ ] **Modül Kilit Ekranları:** Lisans dışı kalan entitlement alanlarında (`crm`, `kiosk_module`) boş sayfa yerine modern "Yükselt / Paket Satın Al" CTA (Call to Action) ekranlarının gösterilmesi.
- [ ] **i18n Hardcoded Temizliği:** Arayüzlerde kalmış son Türkçe hardcoded metinlerin `react-i18next` yapısına taşınması.
- [ ] **Store Modülerleştirme:** Aşırı büyüyen `usePosStore.ts` ve reseller `RestaurantsPage.tsx` dosyalarının işlevlerine göre (sipariş, masa planı, finans) modüllere ayrılması.

---
*Bu doküman NextPOS projesinin tüm standartlarını, iş mantığını ve teknik kurallarını belirler. Projede kod yazarken bu kurallardan sapılamaz.*
