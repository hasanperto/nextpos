# NextPOS Sistem Analiz ve Calisma Raporu

Bu dokuman, kod tabaninin teknik analizini ve calisma sistemini tek yerde toplar.
Analiz sirasi: **Tum Sistem -> SaaS Admin -> Bayi (Reseller) -> POS -> Diger istemciler (Admin Web, QR Menu) -> Sonuc**.

## 1) Tum Sistem Analizi

### 1.1 Monorepo ve uygulama yapisi
- Repo yapisi workspace tabanli: `apps/*` ve `packages/*`.
- Ana uygulamalar:
  - `apps/api`: Express tabanli backend API
  - `apps/pos`: POS ana istemcisi (kasiyer/garson/mutfak/yonetim)
  - `apps/admin`: admin odakli panel
  - `apps/reseller`: bayi paneli
  - `apps/qr-menu`: QR menu/musteri arayuzu
- Paylasilan kutuphaneler:
  - `packages/shared-types`, `packages/ui`, `packages/eslint-config`, `packages/typescript-config`

### 1.2 Backend katmanlari (API mimarisi)
- Giris ve route montaji: `apps/api/src/index.ts`
- Route katmani: `apps/api/src/routes/*`
- Controller katmani: `apps/api/src/controllers/*`
- Service katmani: `apps/api/src/services/*`
- Veritabani:
  - Prisma modelleri: `apps/api/prisma/schema.prisma`
  - Tenant isolate DB erisimi: `apps/api/src/lib/db.ts` (`withTenant`, `search_path`)

### 1.3 Cok kiracili (multi-tenant) calisma modeli
- Kimlik/yetki: JWT + rol bazli middleware (`auth`, `requireRole`)
- Tenant secimi:
  - `x-tenant-id` basligi
  - Domain bazli tenant cozumleme (ozellikle QR akislari)
- Veri izolasyonu:
  - Public metadata (tenant, plan, reseller vb)
  - Tenant schema bazli operasyonlar (`withTenant`)

### 1.4 Genel isleyis ozet akisi (siparis -> odeme -> fatura)
1. POS siparisi olusturur (`orders` akislari)
2. Siparis/masa durumlari guncellenir, mutfak ve servis eventleri yayinlanir
3. Odeme adimlari (`checkout`, `split-checkout`, `checkout-session`) islenir
4. Fiscal ve log adimlari tetiklenir
5. POS fatura endpointleri uzerinden fatura/PDF/e-posta/log islenir

---

## 2) SaaS Admin Paneli Analizi

### 2.1 Ana ekran ve sekmeler
Ana sayfa: `apps/pos/src/pages/SaaSAdmin.tsx`

Temel sekmeler:
- `dashboard`
- `tenants`
- `posInvoices`
- `posInvoiceLogs`
- `resellers`
- `finance`
- `accounting`
- `security`
- `reports`
- `plans`
- `campaigns`
- `backups`
- `crm`
- `monitoring`
- `support`
- `shop`
- `settings`

Sekme bilesenleri: `apps/pos/src/pages/saas/*Tab.tsx`

### 2.2 Veri akisi ve state yonetimi
- Merkez store: `apps/pos/src/store/useSaaSStore.ts` (Zustand + persist)
- Store sorumluluklari:
  - login/token/admin bilgisi
  - tenant/reseller/plan/billing verileri
  - dashboard ve finans metrikleri
  - destek/monitoring ve ayarlar
- Locale/ceviri: `apps/pos/src/contexts/SaaSLocaleContext.tsx`
- Realtime senkron: socket tabanli hooklar (reseller/saas feed)

### 2.3 SaaS paneli API endpoint baglantilari
Onemli frontend cagri tabanlari:
- `/api/v1/auth/*`
- `/api/v1/tenants/*`
- `/api/v1/billing/*`
- `/api/v1/saas-public/*`
- `/api/v1/coupons/*`

Backend route/controller eslesme omurgasi:
- `apps/api/src/routes/tenants.ts`
  - `tenants.controller`, `saas-advanced.controller`, `resellers.controller`, `pos-invoices.controller`
- `apps/api/src/routes/billing.ts`
  - `billing.controller`
- `apps/api/src/routes/auth.ts`
  - `auth.controller`
- `apps/api/src/routes/coupons.ts`
  - `coupon.controller`

### 2.4 Tenant ve reseller yonetim akisi
- Tenant:
  - Listeleme, olusturma, duzenleme, modul tanimi
  - Cihaz reset, destek, rapor ve fatura baglantilari
- Reseller:
  - CRUD islemleri
  - Plan/topup/komisyon finans akislari
  - Reseller detayinda tenant ve odeme gorunumu

### 2.5 Tespit edilen kritik noktalar
- Tek store dosyasinda cok fazla sorumluluk (bakim maliyeti yuksek)
- Bazli ekranlarda `any` kullanimi fazla (tip guvenligi azalir)
- Bazi alanlarda sessiz hata yutma desenleri var (`catch {}`)
- (Giderildi) Kampanya sekmesi: SaaS token + `x-tenant-id` ile `/api/v1/coupons/*` ve `couponTenantScope` middleware.

### 2.6 SaaS Admin tarafinda tamamlanan / guclendirilen parcalar (ozet)
- Tum super_admin sekmeleri yan menuye alindi; `saas:navigate` olayi dinleniyor.
- Kampanya ve kupon yonetimi dogru API ve tenant basligi ile calisir.
- Tenant icin super_admin soft-delete: `DELETE /api/v1/tenants/:id` (inactive).
- SaaS panel kullanicilari: `GET/PATCH/POST .../tenants/saas-admins*` (`SaasAdminsTab`).
- Tenant duzenleme modalinda bayi / super admin alan ayrimi.

---

## 3) Bayi (Reseller) Paneli Analizi (Detay)

Bayi paneli ayri bir Vite/React uygulamasidir: `apps/reseller`. POS ile paylasir: **aynı SaaS login endpointi** (`/api/v1/auth/login/saas`) ve **JWT rolunun `reseller` olmasi** zorunludur; token `localStorage` (`reseller_token`, `reseller_admin`) uzerinde tutulur.

### 3.1 Uygulama kabugu ve navigasyon
- Giris: `apps/reseller/src/App.tsx`
  - Form: kullanici adi / sifre; 2FA aciksa `verifyLogin2fa` / `resendLogin2fa`.
  - Stripe cuzdan topup donusu: URL `?topup=stripe_ok|stripe_cancel` ile `shop` sekmesine yonlenir.
- Sekmeler (`Tab`): `dashboard` | `restaurants` | `shop` | `commissions` | `support` | `finance` | `settings`
- Restoran detay: `detailTenantId` state; `restaurants` sekmesi icinde `RestaurantDetailPage` ile gosterilir (`openDetail` / `closeDetail`).

### 3.2 State katmani (`useResellerStore`)
- Dosya: `apps/reseller/src/store/useResellerStore.ts`
- Tum `/api/v1/tenants` cagrilari `apiTenants(path, token)` ile JSON + `Authorization: Bearer` gonderir.
- Dil: `lang` + `localStorage` (`reseller_lang`).
- Cekirdek aksiyonlar: `login`, `verifyLogin2fa`, `resendLogin2fa`, `logout`, `fetchStats`, `fetchTenants`, `createTenant`, `completeTenantCardDraft`, `updateTenant`, `fetchResellerPlans`, `purchaseResellerPlan`, `fetchFinanceSummary`, `fetchSupportTickets`, `fetchDashStats`, `fetchTrialExpiring`, QR domain CRUD, `fetchTenantEntitlements`, `purchaseTenantAddons`.

### 3.3 Sayfa bazli is akislari ve dosyalar
| Sayfa | Dosya | Ozet |
|-------|--------|------|
| Dashboard | `pages/DashboardPage.tsx` | Yaklasan odemeler: `GET /tenants/finance/accounting/upcoming`. Buyume: `GET /tenants/reports/growth`. Uyari kartlari, `dashStats` / tenant listesine bagli kisayollar. |
| Restoranlar | `pages/RestaurantsPage.tsx` | Ana operasyon: liste, filtre, yeni tenant (prepaid / direct_sale), `billing/quote`, plan modulleri, odeme durumu, mail, sifre/PIN, komisyon recalc. Dosya cok buyuk; is mantigi + UI bir arada. |
| Restoran detay | `pages/RestaurantDetailPage.tsx` | Iletisim, vergi, master sifre, addon: `GET/POST /billing/tenants/:id/entitlements|addons`. |
| Komisyonlar | `pages/CommissionsPage.tsx` | `fetchFinanceSummary` ile ozet ve plan dagilimi. |
| Finans | `pages/FinancePage.tsx` | Fatura listesi, odeme durumu, mail, komisyon yeniden hesap, para cekme talebi. |
| Destek | `pages/SupportPage.tsx` | Ticket olusturma, sistem ticket PATCH, mesaj thread. |
| Magaza | `pages/ShopPage.tsx` | Sistem ayarlari (gateway), plan listesi, cuzdan topup talepleri. |
| Ayarlar | `pages/SettingsPage.tsx` | Profil GET/PATCH, sifre, 2FA (authenticator + backup). |

### 3.4 API endpoint matrisi (bayi paneli gercek cagrilari)
**Auth**
- `POST /api/v1/auth/login/saas`
- `POST /api/v1/auth/login/saas/2fa/verify`
- `POST /api/v1/auth/login/saas/2fa/resend`

**Tenants (store `apiTenants` + sayfalar)**
- `GET /api/v1/tenants/stats` — cuzdan / lisans / plan ozeti (`resellerData` patch).
- `GET /api/v1/tenants/` — tenant listesi.
- `POST /api/v1/tenants/` — yeni tenant.
- `PATCH /api/v1/tenants/:id` — guncelleme (backend bayi kisitlarina tabi).
- `POST /api/v1/tenants/tenant-drafts/:draftId/complete-card` — kart odeme taslagi tamamlama.
- `GET /api/v1/tenants/plans` — abonelik plan listesi (RestaurantsPage).
- `GET /api/v1/tenants/resellers/plans` — bayi lisans paketleri.
- `POST /api/v1/tenants/resellers/plans/purchase` — paket satin alma.
- `GET /api/v1/tenants/finance/summary` — finans ozeti.
- `GET /api/v1/tenants/finance/accounting/upcoming` — dashboard.
- `GET /api/v1/tenants/finance/invoices` — FinancePage.
- `GET /api/v1/tenants/finance/invoices/:invoiceNumber` — fatura JSON.
- `GET /api/v1/tenants/finance/accounting/all-payments` — odeme listesi (query).
- `PATCH /api/v1/tenants/finance/payments/:id/status`
- `POST /api/v1/tenants/finance/payments/:id/send-mail`
- `POST /api/v1/tenants/finance/recalculate-commissions` — RestaurantsPage.
- `POST /api/v1/tenants/resellers/finance/recalculate` — FinancePage.
- `POST /api/v1/tenants/resellers/finance/withdraw` — FinancePage.
- `GET /api/v1/tenants/support/stats` — acik ticket sayisi (dash).
- `GET /api/v1/tenants/system/tickets` — destek listesi (store).
- `PATCH /api/v1/tenants/system/tickets/:id` — SupportPage.
- `POST /api/v1/tenants/support/tickets` — yeni ticket.
- `GET/POST /api/v1/tenants/support/tickets/:id/messages` — mesajlasma.
- `GET /api/v1/tenants/reports/growth` — DashboardPage.
- `GET/PATCH/DELETE .../tenants/:id/qr-domains` — QR domain yonetimi.
- `GET .../tenants/:id/entitlements` — store (dikkat: bazi yerler `/billing/tenants/.../entitlements` kullanir).
- `POST .../tenants/:id/addons` — store addon satin alma.
- `POST /api/v1/tenants/change-user-password`
- `POST /api/v1/tenants/send-credentials`
- `GET /api/v1/tenants/system/settings` — ShopPage (gateway / banka bilgisi).
- `GET/POST/PATCH .../tenants/reseller/wallet/topup-request(s)` — ShopPage.

**Billing (dogrudan `fetch`, Authorization ile)**
- `GET /api/v1/billing/modules`
- `GET /api/v1/billing/plan-modules/:planCode` ve `GET /api/v1/billing/modules` (RestaurantsPage: oturum varsa `Authorization: Bearer` gonderilir; route’lar su an public olsa da audit ve gelecekteki auth ile uyumlu).
- `POST /api/v1/billing/quote`
- `GET/POST /api/v1/billing/tenants/:tenantId/entitlements|addons` — RestaurantsPage, RestaurantDetailPage.

**Reseller profil (SettingsPage)**
- `GET/PATCH /api/v1/tenants/reseller/profile`
- `POST /api/v1/tenants/reseller/change-password`
- `POST .../reseller/2fa/authenticator/setup|verify`
- `POST .../reseller/2fa/backup-codes/regenerate`

### 3.5 Backend ile uyum (yetki ve sahiplik)
- JWT: `role: reseller`, `userId` = `saas_admins.id` (bayi kaydi).
- `public.tenants.reseller_id` ile tenant sahipligi; controller’larda `reseller_id != userId` ise 403.
- `prepaid`: `available_licenses` azalir; `direct_sale`: quote + odeme yontemi + taslak kart akislari.
- Bayi, **askida / odeme bekleyen** tenant uzerinde bazi PATCH alanlarinda kisitli (SaaS admin tam kontrol).

### 3.6 SaaS Admin paneli ile fark
- SaaS admin: `apps/pos` icinde `SaaSAdmin.tsx`, `useSaaSStore`, tum tenant/bayi/finans modulleri.
- Bayi: bagimsiz `apps/reseller`, daraltılmış menü; API cogunlukla ayni `/api/v1/tenants` ve `/api/v1/billing` altinda, **rol middleware** ile filtrelenir.

### 3.7 Riskler ve iyilestirme onceligi
- `send-credentials` ve kart alanlari: guvenlik ve PCI acisindan gozden gecirilmeli.
- `RestaurantsPage.tsx` boyutu: modul bolumlere ayrılmalı (hook + alt bilesen).
- Billing `plan-modules` cagrisinda token tutarliligi: tum billing okumalarinda `Authorization` zorunlu olmali.
- Finans/topup/withdraw: ag tekrari ve cift tiklamaya karsi idempotency anahtari.
- Istemci: `useResellerStore` disinda sayfalarda daginik `fetch` — tek `apiClient` katmani onerilir.

---

## 4) POS Sistemi + API Endpoint Kontrolu (Detay)

POS istemcisi `apps/pos` altindadir; giris `LoginPage` + `useAuthStore` (JWT + `tenantId` + `billing/status` ozeti). Router: `apps/pos/src/App.tsx` — roller: `cashier` (terminal), `waiter`, `kitchen`, `courier`, `admin` (AdminMenu / AdminShell alt sayfalari), ayrica `saas-admin` rotasi `SaaSAdmin` (ayri konu, bolum 2).

### 4.1 Rol ve modul kilidi
- `ProtectedRoute`: token yoksa `/login`.
- `CourierRoute`, `KitchenRoute`, `WaiterRoute`: rol + `billingWorkspace` entitlement (`courier_module`, `kitchen_display`, `waiter_tablet`) — kapali modulde `/cashier` yonlendirmesi.
- `HandoverRoute`: sadece `admin` / `cashier`.

### 4.2 Kasiyer terminali — dosya ve state
- Ana ekran: `pages/PosTerminal.tsx` — acilis `fetchProducts` / `fetchCategories` / `fetchSettings` (store).
- Is mantigi agirligi: `store/usePosStore.ts` (masa, sepet, siparis, checkout, split, transfer, sync).
- Terminal bilesenleri: `features/terminal/components/*` — bircok `fetch` burada veya store’da; `getAuthHeaders()` (`useAuthStore`) ile `Authorization` + `x-tenant-id`.

| Alan | Bilesen / dosya | Not |
|------|------------------|-----|
| Masa plani | `TableFloorGrid.tsx`, `TableOpenModal.tsx` | Acik masa, yeni seans |
| Sepet | `CartPanel.tsx` | Musteri arama, kupon, siparis gonderme |
| Split | `SplitBillModal.tsx` | Parcali odeme |
| Masa islemleri | `TableActionModal.tsx` | `transfer` / `merge` endpoint dinamik |
| Online siparis | `OnlineOrdersModal.tsx` | `qr/external-orders`, durum, kurye |
| WhatsApp | `WaOrderModal.tsx` | Musteri + sepet |
| Garson cagri | `CashierCallWaiterModal.tsx` | `users/waiters`, `service-calls/from-cashier` |
| Caller ID | `CallerIdModal.tsx` | `customers/search`, `customers` POST |
| Admin PIN | `PinCodeModal.tsx` | `POST /api/v1/auth/verify-admin` |
| Z raporu PDF | `StaffPanelModal.tsx` | `GET /api/v1/admin/reports/z-report/pdf?date=...` |

### 4.3 `usePosStore` uzerinden giden endpointler (ozet)
- `GET /api/v1/sync/settings`
- `GET /api/v1/tables`
- `POST /api/v1/tables/:id/open`
- `GET /api/v1/menu/categories|products|modifiers` (`?lang=`)
- `POST /api/v1/coupons/validate`
- `POST /api/v1/orders`
- `POST /api/v1/orders/checkout`
- `POST /api/v1/orders/split-checkout`
- `POST /api/v1/orders/checkout-session`
- `POST /api/v1/orders/:id/pay-takeaway`
- `PATCH /api/v1/orders/:id/status` (birden fazla akis)
- `GET /api/v1/orders?limit=80&offset=0`
- `GET /api/v1/users/couriers`
- `GET /api/v1/payments/session/:sessionId`
- `POST /api/v1/tables/transfer-item`
- `POST /api/v1/tables/:id/cancel`

### 4.4 Terminal bilesenlerinde ek endpointler
- `GET/POST /api/v1/customers`, `GET .../customers/search` — `CartPanel`, `TableOpenModal`, `WaOrderModal`, `CallerIdModal`
- `GET /api/v1/qr/external-orders`, `POST .../confirm|cancel|provisional-membership` — `OnlineOrdersModal`
- `PATCH /api/v1/orders/:id/assign-courier`, `PATCH .../status` — `OnlineOrdersModal`
- `GET /api/v1/users/waiters`, `POST /api/v1/service-calls/from-cashier` — `CashierCallWaiterModal`
- `TableActionModal`: `POST /api/v1/tables/:id/transfer` veya `merge` (kaynak masa id + endpoint)

### 4.5 Diger POS sayfalari (router)
- `KitchenMonitor`, `WaiterPanel`, `CourierPanel` — ayni API ve socket modeli, rol ile sinirli UI.
- `AdminMenu` / `AdminShell` — stok, personel, raporlar vb.; cogu `/api/v1/admin/*` ailesi (ayri inceleme konusu).
- `QueueDisplay`, `HandoverPanel`, `CustomerMenu`, `KioskCustomerMenu` — musteri / kiosk akislari.

### 4.6 Endpoint -> controller eslemesi (kasiyer cekirdegi)
- `routes/orders.ts` -> `orders.controller.ts` — siparis, checkout, split, session, pay-takeaway, status
- `routes/tables.ts` -> `tables.controller.ts` — masa CRUD, transfer, merge, item transfer, iptal
- `routes/menu.ts` -> `menu.controller.ts`
- `routes/customers.ts` -> `customers.controller.ts`
- `routes/coupons.ts` -> `coupon.controller.ts` (+ SaaS icin `couponTenantScope` middleware, bolum 2)
- `routes/qr.ts` -> `qr.controller.ts`
- `routes/serviceCalls.ts` -> `serviceCalls.controller.ts`
- `routes/sync.ts` -> `sync.controller.ts`
- `routes/payments.ts` -> odeme oturumu (`payments/session`)

### 4.7 Realtime ve offline
- Istemci: `hooks/useCashierRealtimeSync.tsx` — `socket.io-client`, `join:tenant`, `presence:staff_register`.
- Dinlenen ornek eventler: `order:new`, `order:ready`, `payment:received`, `table:*`, `external_order:new`, `sync:menu_revision`, `sync:tables_changed`.
- Sunucu: `apps/api/src/socket/index.ts` — `io.to('tenant:' + tenantId)` kalibi.
- Offline: `usePosStore` icinde sync kuyrugu / `sync/settings`; API `sync.controller` ile uyumlu.

### 4.8 POS tarafinda risk / iyilestirme
- `usePosStore` dosya boyutu yuksek — modul bazli bolme (orders, tables, menu) onerilir.
- Bilesen + store’da tekrarlayan `fetch` — ortak `apiRequest` ile header ve hata birligi.
- Admin rapor ve kiosk rotalari tam matris icin ayri satir satir envanter faydali.

---

## 5) Diger Web Istemcileri

### 5.1 `apps/admin` — Restoran yonetim kabugu (POS kod paylasimi)
- Giris: `apps/admin/src/App.tsx` — `BrowserRouter`, `PosLocaleProvider`, `useAuthStore` (`@pos`).
- **Dikkat:** `/login` ve `/saas-admin` rotalari `SaaSAdmin` bilesenine bagli; kurulumda hangi panelin hangi URL’de sunulacagi netlestirilmeli (ayri “tenant admin” login sayfasi bekleniyorsa uyumsuzluk olabilir).
- Koruma: `ProtectedRoute` — roller: `admin`, `owner`, `manager`, `super_admin` (tenant tarafi rolleri; SaaS `super_admin` ile karistirilmamali).
- Icerik: `AdminShell` altinda `AdminDashboard`, `AdminMenu`, `AdminFloor`, `AdminStaff`, `AdminReports`, `AdminStock`, `AdminRecipes`, `AdminDeliveryZones`, `AdminCustomers`, `AdminSettings`, `AdminReservations`, `AdminCampaigns`, `AdminCouriers`, `AdminAccounting`, `AdminStaffPerformance`.
- Tum bu sayfalar `apps/pos` altindaki ayni dosyalardan `@pos/...` ile import edilir; API ailesi agirlikli olarak **`/api/v1/admin/*`** (detayli matris ayri envanterde toplanabilir).

### 5.2 `apps/qr-menu` — Musteri QR / web menu
- Tek sayfa uygulama: `apps/qr-menu/src/App.tsx`; **Socket.IO** ile canli guncelleme.
- Kiracı baglami: `hdr()` ile istek basliklari (domain veya `x-tenant-id` tabanli — `qr-web` middleware ile API uyumlu).
- Ornek endpointler (`/api/v1/qr-web/...`):
  - `GET .../config`
  - `GET .../categories`, `GET .../products` (`lang`)
  - `GET .../tables/:tableQr`
  - `GET .../track/:orderId`
  - `POST .../orders`, `POST .../external-order`
  - `POST .../service-call`
  - `GET .../identify?query=`
- Backend: `apps/api/src/routes/qr-web.ts` ve ilgili controller (domain tenant cozumu, public okuma).

### 5.3 `apps/mobile-android`
- Ayri Gradle projesi; bu raporda is kurali detayina girilmedi — POS/API ile entegrasyon varsa ekran bazli endpoint listesi sonradan eklenebilir.

---

## 6) Sonuc ve Kisa Teknik Degerlendirme

- Sistem, cok kiracili SaaS + POS + bayi paneli + (istege bagli) admin web + QR menu birlesik mimaride calisiyor.
- Is kurali agirligi ozellikle `controllers` ve frontend store katmanlarinda toplanmis.
- API endpoint seti kapsamli; POS, SaaS/bayi ve `qr-web` hatlari ayri route agaclarinda.
- Son oturumda yapilan iyilestirme ozeti: SaaS kampanya/kupon + `saas-admins` yonetimi, tenant soft-delete, bayi `RestaurantsPage` billing cagrilarinda Bearer token, bu dokumanda reseller/POS/diger istemci derinlemesine bolumleri.
- En kritik iyilestirme alanlari:
  1. `apps/admin` login rotasi ile `SaaSAdmin` birlesiminin urun kararina gore netlestirilmesi,
  2. Tip guvenligi (`any` azaltilmasi),
  3. `usePosStore` / `RestaurantsPage` boyutunun modulerlestirilmesi,
  4. Finans ve kimlik bilgisi akislari icin guvenlik + idempotency.

Bu rapor, kodun mevcut calisma sistemini referans almak ve sonraki refactor/iyilestirme planini cikarmak icin temel dokuman olarak kullanilabilir.
