# NextPOS Sistem İyileştirme ve Düzeltme Planı

**Oluşturulma:** 21 Nisan 2026  
**Versiyon:** 1.0  
**Durum:** Analiz Tamamlandı - İyileştirme Bekliyor

---

## ÖZET

Sistem analizi sonucunda aşağıdaki ana kategorilerde iyileştirme gereksinimleri tespit edilmiştir:

| # | Kategori | Öncelik | Durum |
|---|----------|---------|-------|
| 1 | SaaS Admin - Restoran Eklemede Bayi Atama Eksikliği | 🔴 Kritik | Düzeltilecek |
| 2 | Çeviri/i18n Sistemi (TR/EN/DE) | 🔴 Kritik | Tamamlanacak |
| 3 | Muhasebe/Finans Tutarlılığı | 🔴 Kritik | Kontrol Edilecek |
| 4 | POS Tarife Ekranı ve PWA Desteği | 🟡 Orta | Geliştirilecek |
| 5 | Güvenlik (sonraya bırakıldı) | ⚪ Sonraya | Ertelenebilir |

---

## 1. KRİTİK: SaaS Admin - Restoran Eklemede Bayi Atama Eksikliği

### Sorun Açıklaması
SaaS Admin paneli (`SaaSAdmin.tsx`) üzerinden restoran eklenirken **bayi (reseller) ataması yapılamıyor**. Bayi panelinde (`RestaurantsPage.tsx`) bu işlev mevcutken, aynı işlev SaaS Admin'de eksik.

### Mevcut Durum
- **Bayi Panelı:** `apps/reseller/src/pages/RestaurantsPage.tsx` → Restoran ekleme formunda `resellerId` otomatik olarak atanıyor
- **SaaS Admin:** `apps/pos/src/pages/SaaSAdmin.tsx` → Restoran ekleme modalında bayi seçimi YOK

### Etki
- SaaS Admin kullanıcıları restoran oluştururken bayi atayamıyor
- Komisyon hesaplamaları ve cüzdan sistemi etkileniyor
- Finansal raporlama tutarsızlaşabilir

### Yapılması Gerekenler
- [ ] SaaS Admin restorant oluşturma modalına "Bayi Seçimi" dropdown ekle
- [ ] API endpoint'i kontrol et: `POST /api/v1/tenants` body'de `resellerId` kabul ediyor mu?
- [ ] Form validation: SaaS Admin için zorunlu bayi seçimi (opsiyonel mi olmalı?)
- [ ] Test senaryoları yaz

### İlgili Dosyalar
- `apps/pos/src/pages/SaaSAdmin.tsx` (satır ~500-650)
- `apps/pos/src/store/useSaaSStore.ts` (createTenant fonksiyonu)
- `apps/api/src/controllers/tenants.controller.ts`

---

## 2. KRİTİK: Çeviri/i18n Sistemi (TR/EN/DE)

### Sorun Açıklaması
Sistem çevirileri eksik ve tutarsız. Bazı anahtarlar sadece Türkçe var, İngilizce/Almanca yok veya tersi.

### Mevcut Durum
**Veritabanı Tabloları:**
- `languages` tablosu: `code`, `name`, `native_name`, `flag_emoji`, `direction`, `is_active`, `sort_order`
- `ui_translations` tablosu: `namespace`, `key`, `lang`, `value`

**Mevcut Dosyalar:**
- `apps/pos/src/i18n/saas/messages.ts` → SaaS panel çevirileri (TR/DE/EN)
- `apps/pos/src/i18n/posMessages.ts` → POS çevirileri
- `apps/reseller/src/i18n/messages.ts` → Bayi panel çevirileri
- `apps/pos/src/i18n/kioskMenuMessages.ts` → Kiosk menü çevirileri

### Tespit Edilen Sorunlar

#### 2.1 SaaS Admin Çevirileri (`saas/messages.ts`)
- ~700 satır çeviri anahtarı var
- TR çoğunlukta, DE/EN bazı anahtarlarda eksik
- Örnek: `'modal.tenant.resellerSelect'` gibi bayi seçimi anahtarı YOK

#### 2.2 Reseller Panel Çevirileri (`reseller/src/i18n/messages.ts`)
- Sadece TR çeviriler var
- DE/EN varyantları yok

#### 2.3 PosMessages Çevirileri
- POS arayüzü için çeviriler kontrol edilmeli

### Yapılması Gerekenler

#### Phase A: Eksik Anahtarları Tamamla
- [ ] SaaS Admin için tüm anahtarların TR/DE/EN varyantlarını oluştur
- [ ] Reseller panel için DE/EN çevirileri ekle
- [ ] POS arayüzü için çeviri anahtarlarını kontrol et

#### Phase B: Veritabanı Entegrasyonu
- [ ] `ui_translations` tablosuna eksik çevirileri ekle
- [ ] Namespace yapısı: `saas`, `pos`, `reseller`, `kiosk`
- [ ] API endpoint kontrol et: `GET /api/v1/languages/translations/:namespace/:lang`

#### Phase C: Frontend Entegrasyonu
- [ ] Çeviri değiştiğinde otomatik UI güncellemesi
- [ ] Fallback mekanizması (eksik çeviri varsa alternative göster)
- [ ] Çeviri düzenleme admin arayüzü kontrol et

### İlgili Dosyalar
- `apps/pos/src/i18n/saas/messages.ts`
- `apps/reseller/src/i18n/messages.ts`
- `apps/pos/src/i18n/posMessages.ts`
- `apps/api/src/controllers/languages.controller.ts`
- `apps/api/prisma/schema.prisma` (Language, UiTranslation modelleri)

---

## 3. KRİTİK: Muhasebe/Finans Tutarlılığı

### Sorun Açıklaması
Muhasebe ve finans sisteminin tam olarak çalıştığından emin olunması gerekiyor. Servis ücretleri, modül ücretleri ve komisyonların doğru hesaplandığından emin olunmalı.

### Mevcut Durum

#### Veritabanı Tabloları
- `subscription_plans`: Plan tanımları (setup_fee, monthly_fee, limits)
- `billing_modules`: Modül kataloğu (setup_price, monthly_price)
- `tenant_modules`: Her tenant'ın satın aldığı modüller
- `tenant_billing`: Tenant faturalama özeti (setup_fee_total, monthly_recurring_total)
- `payment_history`: Tüm ödeme kayıtları
- `saas_admins`: Bayi cüzdan bakiyesi (wallet_balance)
- `system_settings`: Komisyon oranları (reseller_setup_rate, reseller_monthly_rate)

#### Hesaplama Mantığı
1. **Plan Setup Fee**: `subscription_plans.setup_fee`
2. **Modül Kurulumu**: Her modülün `setup_price` × quantity
3. **Plan Aylık Fee**: `subscription_plans.monthly_fee`
4. **Modül Aylık**: Her modülün `monthly_price` × quantity
5. **Yıllık İndirim**: `%15 annual_discount_percent`

#### Komisyon Dağılımı
- **Kurulum (Setup):** `reseller_setup_rate` (varsayılan %75) → Bayi
- **Servis (Monthly):** `reseller_monthly_rate` (varsayılan %50) → Bayi
- Kalan → Sistem

### Tespit Edilen Sorunlar

#### 3.1 Komisyon Tutarsızlığı
- `saas-advanced.controller.ts` içinde `recalculateResellerCommissionsHandler` fonksiyonu var
- Bu fonksiyon mevcut komisyon oranlarını okuyup TÜM eski kayıtları yeniden hesaplıyor
- Ancak bazı edge case'lerde tutarsızlık olabilir

#### 3.2 Ödeme Türleri (payment_type)
Mevcut türler:
- `subscription` - Abonelik ücreti
- `setup` - Kurulum ücreti
- `addon` - Ek modül ücreti
- `license` - Lisans ücreti
- `refund` - İade
- `reseller_income` - Bayi komisyonu
- `reseller_package_onboarding` - Bayi paket / onboarding
- `license_upgrade` - Lisans yükseltme

**Soru:** `subscription` ve `setup` ayrımı net mi? İkiside aynı işlem için mi yoksa farklı mı?

#### 3.3 Cüzdan Güncellemeleri
- `saas_admins.wallet_balance` güncellenirken transaction kullanılıyor mu?
- Negatif bakiye kontrolü yapılıyor mu?
- Race condition riski var mı?

### Yapılması Gerekenler

#### Phase A: Hesaplama Doğrulaması
- [ ] `billing.service.ts` içinde hesaplama mantığını detaylı incele
- [ ] Test senaryoları ile hesaplamaları doğrula
- [ ] Edge case'leri kontrol et (yıllık, ek modül, upgrade)

#### Phase B: API Audit
- [ ] `POST /api/v1/tenants` endpoint'inde komisyon hesaplaması kontrol et
- [ ] `recalculateResellerCommissionsHandler` fonksiyonunu test et
- [ ] `payment_history` tablosuna eksik kayıt var mı kontrol et

#### Phase C: Veritabanı Konsistensi
- [ ] `tenant_billing` ve `payment_history` arasında tutarlılık kontrolü
- [ ] Cüzdan güncellemelerinde transaction kullanımını doğrula
- [ ] Negatif bakiye engelleme mekanizması kontrol et

### İlgili Dosyalar
- `apps/api/src/services/billing.service.ts`
- `apps/api/src/controllers/saas-advanced.controller.ts`
- `apps/api/src/controllers/tenants.controller.ts`
- `apps/api/src/controllers/resellers.controller.ts`
- `apps/api/scripts/add-reseller-sale.ts`

---

## 4. ORTA: POS Tarife Ekranı ve PWA Desteği

### Sorun Açıklaması
POS yazılımında "Tarife" (Pricing) ekranı ve PWA desteği analizi gerekiyor.

### Mevcut Durum
- **PWA:** `apps/pos` → `vite.config.ts` içinde PWA plugin var
- **Tarife Ekranı:** `apps/pos/src/pages/saas/PlansTab.tsx` mevcut

### Tespit Edilen Sorunlar

#### 4.1 Tarife Tab butonu
- PlansTab.tsx içinde "Bayi lisans paketi" oluşturma modalı var
- Tab ekranında buton konumu ve görünürlüğü kontrol edilmeli

#### 4.2 PWA Manifest
- Service worker cache stratejisi kontrol edilmeli
- Offline senaryo testleri yapılmalı

#### 4.3 Tarife Hesaplaması
- Kullanıcıya gösterilen fiyatlar doğru mu?
- Vergi dahil/haric gösterimi kontrol edilmeli

### Yapılması Gerekenler
- [ ] POS Tarife ekranında tüm butonların çalıştığını doğrula
- [ ] PWA manifest ve service worker kontrol et
- [ ] Tarife güncellemelerinin anlık yansımasını test et
- [ ] Kiosk modu için büyük butonlar ve dokunmatik optimizasyon kontrol et

### İlgili Dosyalar
- `apps/pos/src/pages/saas/PlansTab.tsx`
- `apps/pos/vite.config.ts` (PWA config)
- `apps/pos/public/manifest.json`

---

## 5. ERTELENDİ: Güvenlik İyileştirmeleri

### Not
Aşağıdaki güvenlik konuları analiz edilmiş ancak sonraya bırakılmıştır:
- JWT token yenileme mekanizması
- Rate limiting (Redis tabanlı)
- 2FA entegrasyonu (TOTP)
- Audit log tutarlılığı
- SQL injection koruması

---

## TAKVİM ÖNERİSİ

| Hafta | İş | Açıklama |
|-------|-----|----------|
| 1 | SaaS Admin Bayi Atama | Restoran eklemede bayi seçimi |
| 2-3 | Çeviri Sistemi | TR/EN/DE tamamlama + DB sync |
| 4 | Finans Tutarlılığı | Hesaplama doğrulama + test |
| 5 | POS Tarife + PWA | Test ve optimizasyon |
| 6+ | Güvenlik | Sonraki sprint'e bırakıldı |

---

## TEKNİK NOTLAR

### Veritabanı Migrations
Mevcut migration'lar:
- `20260420120000_orders_soft_delete` - Siparişler soft delete
- `20260420121000_saas_admin_profile_columns` - SaaS admin ekstra kolonlar
- `20260420121500_system_settings_profile_columns` - Sistem ayarları

### Önemli API Endpoints
```
POST /api/v1/tenants                    - Restoran oluştur
GET  /api/v1/tenants                    - Tüm restoranlar
PUT  /api/v1/tenants/:id                - Restoran güncelle
POST /api/v1/resellers                 - Bayi oluştur
GET  /api/v1/saas/finance/summary      - Finans özeti
POST /api/v1/saas/commissions/recalc    - Komisyon yeniden hesapla
```

### Kontrol Listesi Komutları
```bash
# Lint kontrol
npm run lint

# Build kontrol
npm run build

# Veritabanı kontrol
npm run db:studio -w @nextpos/api

# Test senaryoları
npm run test:e2e
```

---

## 3. KRİTIK: Finans/Muhasebe Sistemi Analizi

### Sistem Bileşenleri

| Tablo/Modül | Açıklama |
|------------|----------|
| `subscription_plans` | Plan tanımları (basic/pro/enterprise) - setup_fee, monthly_fee |
| `billing_modules` | Modül kataloğu - setup_price, monthly_price |
| `plan_module_rules` | Plan × modül ilişkisi (included/addon/locked) |
| `tenant_billing` | Her tenant'ın faturalama özeti |
| `payment_history` | Tüm ödeme kayıtları |
| `saas_admins.wallet_balance` | Bayi cüzdan bakiyesi |

### Komisyon Hesaplama Mantığı

**Dosya:** `apps/api/src/controllers/tenants.controller.ts` (satır 92-107)

```typescript
function resellerCommissionFromQuote(quote, billingCycle, s): number {
    const setupTotal = quote.setupFee + quote.modulesSetup;
    const resellerSetupPart = setupTotal * (s.reseller_setup_rate / 100); // Varsayılan: %75
    const resellerServicePart = billingCycle === 'yearly'
        ? quote.yearlyPrepayTotal * (s.reseller_monthly_rate / 100) // Varsayılan: %50
        : quote.monthlyRecurringTotal * (s.reseller_monthly_rate / 100); // Varsayılan: %50
    return resellerSetupPart + resellerServicePart;
}
```

### Tespit Edilen Sorunlar

#### 🔴 SORUN 1: Cüzdan Güncellenmesinde Transaction Yok
**Dosya:** `apps/api/src/controllers/tenants.controller.ts` (satır 369)

```typescript
// ❌ Sorunlu kod - iki ayrı işlem, biri başarısız olsa diğeri çalışır
await queryPublic(`UPDATE "saas_admins" SET wallet_balance = ...`);
await queryPublic(`INSERT INTO "payment_history" ...`);
```

**Etki:** Race condition, tutarsız bakiye

**Çözüm:** Her iki işlemi tek transaction içinde yap

---

#### 🔴 SORUN 2: Komisyon Oranı Değiştiğinde Geçmiş Kayıtlar Değişiyor
**Dosya:** `apps/api/src/controllers/saas-advanced.controller.ts` (satır 1004-1105)

`recalculateResellerCommissionsHandler` fonksiyonu **tüm geçmiş** `reseller_income` kayıtlarını yeni oranlara göre güncelliyor.

**Etki:** Geçmiş ödemelerin tutarı değişir, audit trail bozulur

**Çözüm:** Yeni oranlar sadece yeni işlemlerde geçerli olmalı, geçmiş sabit kalmalı

---

#### 🟡 SORUN 3: PostgreSQL Tür Uyumsuzluğu
**Dosya:** `apps/api/src/controllers/saas-advanced.controller.ts` (satır 764)

```typescript
// Not: "tenant_id üzerinden JOIN bazen PG tür uyumsuzluğunda 0 döner"
const resellerPaymentScope = `
    (ph.saas_admin_id = ?
     OR EXISTS (SELECT 1 FROM tenants t WHERE trim(ph.tenant_id::text) = trim(t.id::text) ...))
`;
```

**Etki:** Bayi özetinde bazı ödemeler görünmeyebilir

**Çözüm:** tenant_id türünü UUID olarak tut, trim yerine doğrudan JOIN kullan

---

#### 🟡 SORUN 4: Modül Miktar Hesaplaması
**Dosya:** `apps/api/src/services/billing.service.ts` (satır 1058-1064)

```typescript
if (m.code === 'extra_device' && input.extraDeviceQty && input.extraDeviceQty > 0) {
    qty = input.extraDeviceQty;  // ✅ Doğru
}
if (m.code === 'extra_printer' && input.extraPrinterQty && input.extraPrinterQty > 0) {
    qty = input.extraPrinterQty;  // ✅ Doğru
}
```

**Durum:** Kod doğru görünüyor, ancak frontend'den gelen değer kontrol edilmeli

---

### Yapılması Gereken Düzeltmeler

#### Acil (Bu Sprint)
- [ ] Cüzdan güncellemelerini transaction'a al
- [ ] Geçmiş komisyon kayıtlarının değiştirilmesini engelle (sadece yeni kayıtları etkilesin)

#### Sonraki Sprint
- [ ] tenant_id tür uyumsuzluğunu düzelt
- [ ] Negatif cüzdan bakiyesi kontrolü ekle
- [ ] Komisyon hesaplaması için birim testleri yaz

### İlgili Dosyalar
- `apps/api/src/services/billing.service.ts`
- `apps/api/src/controllers/tenants.controller.ts`
- `apps/api/src/controllers/saas-advanced.controller.ts`

---

## YAPILAN IYILESTIRMELER (21 Nisan 2026)

### Tamamlanan
| # | Konu | Dosya | Durum |
|---|------|-------|-------|
| 1 | SaaS Admin Bayi Atama | `SaaSAdmin.tsx` | ✅ Tamamlandı |
| 2 | Modül Seçimi UI | `SaaSAdmin.tsx` | ✅ Tamamlandı |
| 3 | PosInvoiceLogs Çeviri | `PosInvoiceLogsTab.tsx` | ✅ Tamamlandı |
| 4 | SaaSAdmin Yönlendirme | `App.tsx` | ✅ Düzeltildi |

---

**Son Güncelleme:** 21 Nisan 2026
**Analiz Eden:** AI Assistant