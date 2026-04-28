# NextPOS Proje Analizi

## Genel Bakış
**Konum:** `D:\xampp\htdocs\nextpos`
**Arsitektur:** Turborepo monorepo (8 uygulama, 4 paket)

---

## Uygulamalar (apps/)

| Uygulama | Yol | Açıklama |
|----------|-----|----------|
| **pos** | `/pos` | Ana POS uygulaması (Kasiyer, Garson, KDS, Kurye, Kiosk) |
| **admin** | `/admin` | Admin paneli (menü, personel, raporlar, CRM) |
| **api** | `/api/*` | Backend API (Next.js API routes) |
| **qr-menu** | `/qr-menu` | QR Menü uygulaması |
| **mobile-android** | - | Android mobil uygulaması |
| **printer-agent** | - | ESC/POS yazıcı ajanı |
| **reseller** | `/saas-admin` | Bayi paneli |
| **saas-admin** | `/saas-admin` | SaaS çoklu kiracı admin |

---

## Paylaşılan Paketler (packages/)

| Paket | Açıklama |
|-------|----------|
| **shared-types** | TipScript type tanımları |
| **ui** | Paylaşılan UI bileşenleri |
| **eslint-config** | ESLint kuralları |
| **typescript-config** | TSConfig paylaşımı |

---

## Panel Haritası (nextpos_panel_map.html'den)

## Güncellenmiş Durum (28.04.2026)

### ✅ Düzeltilen Kritik Eksiklikler

| Sorun | Durum | Çözüm |
|-------|-------|-------|
| HandoverPanel rol açığı | ✅ Düzeltildi | `HandoverPanel.tsx`'e role guard eklendi (`admin`/`cashier` kontrolü) |
| KDS cashier erişimi | ✅ Zaten kapalı | `KITCHEN_ROLES` sadece `kitchen` ve `admin` içeriyor |
| Accounting hard delete | ✅ Kapatıldı | API routes yorum satırına alındı, sadece storno allowed |

### 🔴 Hâlâ Çözülmesi Gerekenler

1. **Kasiyer POS**
   - Masa "kim bakıyor" overlay eksik (table:focused/blurred socket)
   - Offline banner + sync sayacı yok
   - Loyalty ödeme entegrasyonu eksik (apply-loyalty endpoint)
   - Split bill UI tamamlanmamış

2. **Mutfak KDS**
   - Drag-drop durum güncelleme PATCH endpoint'e bağlı değil
   - Süre sayacı CSS animasyonu (kırmızı yanıp sönme) eksik
   - Kalem bazlı checkbox → PATCH /tickets/:id/items bağlantısı eksik

3. **SaaS Admin**
   - Tenant create async (202 + taskId) frontend handle etmiyor
   - DNS provisioning hata gösterilmiyor
   - Impersonation banner eksik
   - Impersonation yıkıcı işlem engeli frontend'de bloklanmalı

4. **Kiosk**
   - Token verify sayfa açılınca çağrılmıyor
   - Revoke → kilit sync olayı işlenmiyor
   - Idle timer (90sn) çalışmıyor
   - "Siparişiniz hazır" animasyonu eksik

5. **Garson**
   - Servis çağrısı overlay socket olayı yansımıyor
   - QR onay pop-up qr:order_request handler eksik
   - Masa başı sipariş modal UX tamamlanmamış

### 🟠 Orta Öncelik

- Garson: servis çağrısı overlay, QR onay pop-up
- Kiosk: token verify, revoke → kilit, idle timer, "Siparişiniz hazır" animasyonu
- Admin: yazıcı test sonucu UI'a yansımıyor, entitlement kilidi boş sayfa
- Bayi: top-up talep formu, 2FA kurulum akışı

### 🟢 Tamamlanmış / İyi

- Kurye paneli endpoint standardizasyonu tamam
- Teslim Merkezi socket-first + polling fallback
- Kasiyer toast bildirimleri merkezi bileşen (yapılacak)

---

## Yapı Analizi

```
nextpos/
├── apps/
│   ├── admin/        # Admin panel (Next.js)
│   ├── api/          # API routes (Next.js)
│   ├── pos/          # POS uygulamaları (Kasiyer, Garson, KDS, Kurye, Kiosk)
│   ├── qr-menu/      # QR Menü
│   ├── mobile-android/
│   ├── printer-agent/
│   └── reseller/     # Bayi paneli
├── packages/
│   ├── shared-types/ # TypeScript types
│   ├── ui/           # UI components
│   ├── eslint-config/
│   └── typescript-config/
├── docs/             # Dokümantasyon
├── scripts/          # Yardımcı scriptler
└── tools/            # Geliştirme araçları
```

---

## Önerilen Öncelik Sırası

1. **Güvenlik:** handover rol açığı, KDS cashier erişimi, admin delete accounting
2. **Socket Entegrasyonu:** tüm panel ilişkileri (+ order:ready, table:focused)
3. **Offline Mod:** Kasiyer offline banner + sync
4. **Async UI:** SaaS tenant create loading state
5. **UI/UX:** Kiosk idle timer, Garson servis çağrısı overlay