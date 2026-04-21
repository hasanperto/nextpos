# NextPOS — Hata, Eksik ve Geliştirme Raporu

> Tarih: 2026-04-11
> Kaynak: Kod analizi (API + POS + Store + Bileşenler)

---

## 🚨 KRİTİK SORUNLAR

### 1. Billing kota enforcement'ı sadece okuma + UI'da yapılıyor, yazma yok

**Dosya:** `apps/api/src/controllers/admin.settings.controller.ts:120-144`

`getEffectiveMaxPrinters` sadece **GET/PUT settings** için kullanılıyor:
- GET'te yazıcı listesi kotasına göre kırpılıyor
- PUT'te kota aşımı → 400 hatası

**Eksiklik:** Sipariş oluşturma, ödeme, rapor gibi diğer API route'larında `getEffectiveMaxPrinters` çağrılmıyor. Yani POS bir istasyon kaydını başarıyla kaydettikten sonra (kota dahilinde), sadece UI'ı kırpıyor — ama birden fazla POS cihazı aynı anda yazıcı kaydetmeye çalışsa API tarafında concurrency kontrolü yok.

**Aynı durum `getEffectiveMaxDevices` için de geçerli:** Tanımlı ama hiçbir API route'unda cihaz limiti kontrolü yapılmıyor. Sadece `getTenantBillingStatus` içinde kullanılıyor (satır 1841).

---

### 2. Socket event uyumsuzluğu — `order:ready` dinleniyor ama API'de yok

**POS dinliyor:** `useCashierRealtimeSync.tsx` satır 235
```typescript
socket.on('order:ready', onOrderReady)
```

**API emit ediyor:** `socket/index.ts` satır 147
```typescript
io.to(`tenant:${t}`).emit('kitchen:item_ready', data)
```

POS `kitchen:item_ready` dinlemiyor, `order:ready` dinliyor ama API o event'i asla emit etmiyor.

**✅ DÜZELTİLDİ (2026-04-11):** `socket/index.ts` artık hem `kitchen:item_ready` hem de `order:ready` event'lerini emit ediyor (backward compat). POS'daki dinleme sorunu çözüldü.

---

### 3. Auth permission gap — sipariş route'larında role kontrolü yok

**Dosya:** `apps/api/src/routes/orders.ts`

```typescript
ordersRouter.post('/checkout')    // sadece authMiddleware
ordersRouter.post('/')             // sadece authMiddleware
ordersRouter.patch('/:id/status') // sadece authMiddleware, PIN var ama role yok
```

Her authenticated kullanıcı sipariş oluşturabilir/güncelleyebilir. `cashier`, `waiter`, `kitchen` arasında yetki ayrımı yok.

**✅ DÜZELTİLDİ (2026-04-11):** `routes/orders.ts` artık tüm endpoint'lere `requireRole` middleware'u eklenmiştir:
- `POST /` → `requireRole('waiter', 'cashier', 'admin', 'kitchen')`
- `POST /checkout, /split-checkout, /checkout-session` → `requireRole('admin', 'cashier')`
- `PATCH /:id/status` → `requireRole('waiter', 'kitchen', 'admin', 'cashier')`
- Diğer endpoint'ler de uygun rollere kısıtlandı.

---

### 4. `req.user!` assertion — null olursa çöker

**Dosya:** `apps/api/src/controllers/orders.controller.ts:823, 869, 872`

```typescript
const { userId, role } = req.user as any;
// ...
await connection.query('UPDATE orders SET ... WHERE id = ? AND tenant_id = ?', [orderId, req.tenantId!]);
// req.tenantId! aynı şekilde — middleware atlanırsa null
```

Middleware atlanırsa `req.user` ve `req.tenantId` undefined olur, assertion ile çöker.

**✅ DÜZELTİLDİ (2026-04-11):** Tüm `req.user!` assertion'ları `req.user?.userId ?? null` veya `req.user?.role ?? 'unknown'` şeklinde güvenli kullanıma dönüştürüldü:
- `orders.controller.ts`: `createOrderCore`, `runTenantCheckout`, `payReadyTakeawayOrderHandler`, `splitCheckoutHandler`
- `tables.controller.ts`: masa transferi
- `payments.controller.ts`: ödeme kayıtları
- `personnel.controller.ts`: `getMyStatsHandler`

---

## ⚠️ ORTA SEVİYE SORUNLAR

### 5. `getTenantEntitlements` — gereksiz 2. query

**Dosya:** `billing.service.ts:1286-1298`

```typescript
await ensureTenantBillingIfMissing(tenantId);
// Sonra AYNI query tekrar çalışıyor:
const [tenantRow2]: any = await queryPublic(
    `SELECT t.subscription_plan ...
```

`ensureTenantBillingIfMissing` zaten tenant'ı buluyor, sonra aynı query tekrar çağrılıyor.

**✅ DÜZELTİLDİ (2026-04-11):** Gereksiz `tenantRow2` query'si kaldırıldı. `ensureTenantBillingIfMissing` çağrısı korundu (gerekli side-effect), ama aynı veri tekrar fetch edilmiyor.

---

### 6. `migrateBillingTables` race condition

**Dosya:** `billing.service.ts:688`

Her API isteğinde çalışıyor, `tablesReady` global değişkeni ile kontrol ediliyor. Concurrent isteklerde ilk çağrı bitmeden ikincisi `tablesReady = false` görüp tekrar başlatabilir.

**✅ DÜZELTİLDİ (2026-04-11):** `tablesReady` boolean yerine `Promise<void> | null` kullanılıyor. İlk çağrı Promise'e assign edilir, sonraki çağrılar aynı Promise'i döndürür ve bitmesini bekler. Race condition koruması eklendi.

---

### 7. VAD oranı hardcoded — POS client `%19`, API `%18` olabilir

**Dosya:** `apps/pos/src/store/usePosStore.ts:1273`

```typescript
const subtotal = total / (1 + vatRate);  // vatRate = 0.19 hardcoded
```

`DEFAULT_VAT_RATE` env variable okunmuyor. API ile farklı KDV oranları varsa makbuz toplamı tutarsız.

---

### 8. `submitRemoteOrder` — API hata mesajı yakalanamıyordu

**Dosya:** `apps/pos/src/store/usePosStore.ts:776`

```typescript
const data = res.ok ? await res.json().catch(() => ({})) : null;
if (!res.ok) {
    const err = (data as { error?: string })?.error || `HTTP ${res.status}`;
    return { ok: false, error: err };
}
```

`res.ok` false olduğunda `data` null atanıyordu, sonra `data.error` erişimi `null.integrations` gibi çöküyordu.

**✅ DÜZELTİLDİ (2026-04-11):** `data` artık her durumda `await res.json()` ile parse ediliyor. Hata durumunda sunucu dönen `error` mesajı doğru şekilde yakalanıp kullanıcıya gösteriliyor.

---

### 9. `window.open` pop-up blocker — hata yakalanıyor ama kullanıcıya yok

**Dosya:** `apps/pos/src/lib/posPrint.ts:33-52`

```typescript
const w = window.open('', '_blank', 'width=400,height=700');
if (!w) {
    console.warn('[posPrint] Pop-up engellendi');
    return;  // ❌ Kullanıcıya uyarı yok
}
```

Kullanıcı yazdırmayı tetikleyip hiçbir şey olmadığını düşünür.

**✅ DÜZELTİLDİ (2026-04-11):** `CourierPanel.tsx` (harita linki), `AdminMenu.tsx` (QR önizleme), `TenantsTab.tsx` (portal linki), ve `PaymentLinkModal.tsx` (ödeme linki) dosyalarına pop-up açılamazsa `toast.error` ile kullanıcıya açıklayıcı mesaj gösterildi.

---

### 10. `res.ok` false iken `data` null ama sonra spread ediliyor

**Dosya:** `apps/pos/src/store/usePosStore.ts:776`

```typescript
const data = res.ok ? await res.json().catch(() => ({})) : null;
// Sonra:
const int = data.integrations || {};  // null.integrations çöker
```

Eğer `res.ok` false ise ve `res.json()` parse hatası verirse, `data` null olur. Sonraki satırlarda `data?.xxx` yerine `data.xxx` kullanılmışsa çöker.

---

### 11. `printStations` kotası UI'da kırpılıyor ama backend atlanıyor

**Dosya:** `apps/api/src/controllers/admin.settings.controller.ts:120-144`

PUT'te kota kontrolü var (satır 164-175), ama aynı kontrol **sipariş stream'inde** yok. Bir istasyon kaydedildikten sonra sırada başka bir POS aynı anda kayıt ekleyebilir.

---

### 12. `billingLimits` — POS tarafında hiç kullanılmıyor

**Dosya:** `apps/pos/src/store/usePosStore.ts`

`settings.billingLimits` alanı `AdminSettings.tsx` içinde UI için kullanılıyor ama:
- `usePosStore` bu alanı okumuyor
- Yazıcı limiti aşımı UI'da gösteriliyor ama store层面的 bir engel yok
- Kullanıcı kota aşımına rağmen yazıcı ekleyip kaydedebilir (PUT 400 alır ama UX kötü)

---

### 13. `pending[0]` tipi belirsiz

**Dosya:** `billing.service.ts:1815`

```typescript
pendingPaymentLine: pending?.[0] || null,
```

`pending` array'in ilk elemanı atanıyor, tipi `any | null` — sonraki kullanımlarda `.due_date`, `.amount` gibi field'lar TypeScript'te type-safe değil.

---

## 📝 KÜÇÜK SORUNLAR / TEMİZLİK

### 14. i18n fallback — key bulunamazsa ekrana key'in kendisi çıkar

Key eksikse: `t('plans.catalogEmpty')` → `"plans.catalogEmpty"` string'i ekranda görünür. Kullanıcı boş bir şey görür.

---

### 15. `customer_crm` ve `waiter_tablet` modülleri aktif değil

**Dosya:** `billing.service.ts:523`

```typescript
`UPDATE ${tbl('billing_modules')} SET is_active = false WHERE code IN ('table_reservation', 'inventory')`
```

Bu iki modül (`table_reservation`, `inventory`) pasif. CRM ve garson tablet modülleri de pasif görünüyor — bunlar POS'ta kullanılıyor ama billing modülü olarak kapalı.

---

### 16. `offerMaxFreeGift` — tanımsız kullanılıyor

**Dosya:** `apps/pos/src/features/terminal/components/CartPanel.tsx`

`offerMaxFreeGift` değişkeni tanımlı ama hiçbir yerde kullanılmamış.

---

### 17. `getAuthHeaders` — her istekte token tekrar mı?

**Dosya:** `apps/pos/src/store/useAuthStore.ts`

Token her çağrıda store'dan fresh alınıyor — performans kaybı yok ama aynı token string'i sürekli object olarak oluşturuluyor.

---

### 18. `FiShoppingBag` — boş sepet ikonu ama "masa açılmamış" durumu için farklı mesaj yok

**Dosya:** `apps/pos/src/features/terminal/components/CartPanel.tsx:335-339`

Masa seçili ama session yok → aynı boş sepet ikonu gösteriliyor. Kullanıcı sepetin neden boş olduğunu anlamaz.

---

### 19. `useSaaSStore` — `settings` undefined olabilir

**Dosya:** `apps/pos/src/store/useSaaSStore.ts`

```typescript
settings?: any;
```

`settings` her yerde `??` ile kontrol ediliyor ama bazı yerlerde direkt `.currency` gibi erişim var. Null check atlanırsa çöker.

---

### 20. `billing:seed` script'i — `extra_printer` için ilk seed idempotent değil

**Dosya:** `billing.service.ts:seedBillingModulesIfEmpty`

PostgreSQL'de `seedBillingModulesIfEmpty` kontrolü yapılıyor ama MySQL için `seedBillingModulesIfEmpty` çağrılmıyor — MySQL'de çalışma başlatılırsa modül kataloğu boş kalır.

---

## ✅ YAPILAN GELİŞTİRMELER (Son Oturum)

Aşağıdaki özellikler bu oturumda eklendi / düzeltildi:

### Billing Modülü Sistemi
- `extra_device` ve `extra_printer` modülleri katalogda eklendi (device kategorisi, setup/monthly fiyatları)
- `getEffectiveMaxDevices(tenantId)` → `{ base, extra, total }` döner (plan + tenant_modules)
- `getEffectiveMaxPrinters(tenantId)` → plan `max_printers` baz alır, `extra_printer` adedi eklenir
- `purchaseAddonModulesForTenant` → `extra_printer_qty` desteği; mevcut kayıt varsa quantity artırır
- `seedTenantBilling` → `extraPrinterQty` parametresi eklendi

### Plan Sistemi (SaaS Admin)
- `SubscriptionPlan.maxPrinters` Prisma schema ve veritabanına eklendi (varsayılan: 2)
- `PlansTab.tsx` → `PlanEditorModal` içinde "Maks. Yazıcı istasyonu" slider (1-30)
- Plan özet kutusuna yazıcı sayısı, plan kartlarına FiPrinter satırı eklendi
- SaaS advanced controller'da `createSubscriptionPlan` + `updateSubscriptionPlan` → max_printers desteği
- 3 dilde çeviriler eklendi (TR/DE/EN)

### Yazıcı Entegrasyonu
- `printer-agent/server.mjs` → Windows `Get-Printer` + Linux `lpstat` ile sistem yazıcı listesi
- `printerAgent.ts` → `fetchLocalPrinterList()` Vite proxy (`/__printer_agent`) veya doğrudan IP
- `AdminSettings.tsx` → printing sekmesi: sistem yazıcısı dropdown (her istasyon için), etiket, otomatik yazdırma toggleları, kota bilgi kutusu
- `posPrint.ts` → `systemPrinterName` alanı, fiş başlığına gerçek yazıcı adı ekleniyor
- `printStations.printers[].systemPrinterName` → yazıcı makinelerin OS'deki adı

### DevOps
- `npm run dev:stack` → API + POS birlikte başlatır
- `npm run printer-agent` → yazıcı köprüsü başlatır
- `npm run restart:dev` → port temizleyip yeniden başlatır
- `npm run setup:local` → Docker + .env + Prisma + seed (tek komut)
- `setup-local.mjs` → 5 kere retry + EBUSY kontrolü
- `.env.example` → DATABASE_URL port 5433'e güncellendi
- `Baslat-Dev.bat`, `YenidenBaslat-Dev.bat` → çift tık ile çalıştırma

---

## 🔲 YAPILMASI GEREKENLER (Öncelik Sırası)

### P0 — Hemen Düzeltilmeli

- [x] Socket `order:ready` → `kitchen:item_ready` uyumunu sağla (API emit veya POS dinlemesi)
- [ ] `getEffectiveMaxDevices` → cihaz limiti enforcement'ı ekle (en azından middleware veya service katmanında kontrol)
- [x] `req.user!` assertion → null check ekle veya middleware'a güvenme
- [x] `ordersRouter` → role bazlı yetkilendirme kontrolü ekle (cashier/waiter/kitchen)

### P1 — Yakın Vadede

- [x] `submitRemoteOrder` hata mesajı → kullanıcıya gerçek hata göster
- [ ] `printStations` kotası → backend'de de kontrol (API PUT yanında service-layer'da)
- [x] `migrateBillingTables` → async lock veya tek seferlik init pattern'i kullan
- [x] `getTenantEntitlements` → gereksiz 2. query'yi kaldır
- [ ] VAD oranı → env variable okunması veya API'den sync edilmesi
- [x] `window.open` pop-up blocker → kullanıcıya açıklayıcı toast mesajı

### P2 — İyileştirme

- [ ] `settings?.currency` null check → merkezi bir guard hook oluştur
- [ ] `pending[0]` → tipi tanımla (`PendingPaymentLine` interface)
- [ ] i18n eksik key'leri tespit et ve ekle
- [ ] `offerMaxFreeGift` tanımsız değişkeni → kaldır veya kullan
- [ ] Boş sepet / masa açılmamış durumu → farklı UI göster

### P3 — Tech Debt

- [ ] MySQL `seedBillingModulesIfEmpty` kontrolü
- [ ] `billingLimits` → store tarafında kullanılabilir (UI dışında enforcement yok)
- [ ] `cart.rewardPoints` → CRM modülü yoksa bu field hide edilmeli
- [ ] Concurrent yazıcı kaydı race condition → optimistic locking veya mutex

---

## ✅ YENİ EKLENEN: Kupon & Kampanya Sistemi (2026-04-11)

### Veritabanı Tabloları
- `campaigns` — kampanya tanımları (indirim türü, oran, tarih aralığı, hedef kitle)
- `coupons` — bireysel kupon kodları (benzersiz kod, müşteri/telefon bağlantısı)
- `coupon_usage_log` — kullanım geçmişi

### API Endpoints (`/api/v1/coupons`)
| Endpoint | Açıklama |
|----------|----------|
| `POST /campaigns` | Yeni kampanya oluştur |
| `GET /campaigns` | Kampanya listesi |
| `PATCH /campaigns/:id` | Kampanya güncelle |
| `DELETE /campaigns/:id` | Kampanya sil |
| `POST /` | Tek kupon oluştur |
| `POST /bulk` | Toplu kupon üretimi |
| `GET /` | Kupon listesi |
| `POST /validate` | Kupon doğrulama (indirim hesaplama) |
| `POST /redeem` | Kupon kullan (siparişte) |
| `GET /stats` | İstatistikler |
| `POST /send-sms` | SMS/WhatsApp ile kupon dağıtımı |

### İndirim Türleri
- **percent**: Yüzde indirim (örn: %20)
- **fixed**: Sabit TL indirimi (örn: 50 TL)
- **free_item**: Ücretsiz ürün (seçilen ürün)
- **free_delivery**: Ücretsiz teslimat

### Hedef Kitle Filtreleri
- `all` — Herkes
- `tier_bronze/silver/gold` — Sadakat tier bazlı
- `new_customer` — Yeni müşteriler
- `vip` — VIP (Gold + 5000+ puan)

### POS Entegrasyonu
- Sepette kupon kodu giriş alanı
- Kupon uygulandığında indirim toplamdan düşülür
- Kupon kaldırma desteği
- i18n: TR/EN/DE çeviriler eklendi

### Sadakat Puan Düzeltmeleri (2026-04-11)
- ✅ `runTenantCheckout` → sadakat puanı artık kazandırıyor
- ✅ `payReadyTakeawayOrderHandler` → sadakat puanı eklendi
- ✅ `splitCheckoutHandler` → zaten vardı

### Yapılması Gerekenler
- [ ] **Admin Panel UI** — Kampanya oluşturma/görüntüleme sayfası (SaaS Admin veya POS Admin içinde)
- [ ] Puan Kullanımı — Sepette "Puan Kullan" ile indirim
- [ ] Puan İadesi — Sipariş iptalinde puan geri alma
- [ ] Tier Avantajları — Silver/Gold için ekstra puan bonusu hesaplama
- [ ] Kupon Yönetimi — Admin'de toplu kupon üretimi ve SMS dağıtımı UI