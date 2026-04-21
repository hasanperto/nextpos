# NextPOS SaaS Admin Panel — Mimari ve Özellikler Dokümanı

**Sunucu:** Ubuntu Dedicated Server (aaPanel + Docker)
**Ana Domain:** webotonom.de
**Demo Domain:** hpdemos.de

---

## 1. SaaS Admin Panel — Sekmeler ve Özellikler

### 1.1 Dashboard (Kontrol Paneli)
- **Canlı İstatistikler:** Toplam kiracı, aktif oturum, aylık gelir
- **Sistem Sağlığı:** DB gecikmesi, bağlantı sayısı, uptime
- **Son İşlemler (Live Feed):** Real-time aktivite akışı
- **Büyüme Raporu:** Aylık büyüme, churn analizi

### 1.2 Kiracılar (Tenants) — Restoran Yönetimi
**Özellikler:**
- Liste: Tüm restoranlar (plan, durum, schema adı, UUID)
- Arama + Plan filtresi (basic/pro/enterprise/all)
- Canlı kişi sayısı (Socket.io ile real-time)
- **Kiracı Oluşturma:** SaaS Admin veya Bayi tarafından
  - Restoran adı, schema adı, plan seçimi
  - Yetkili kişi, email, telefon, vergi bilgileri
  - Master şifre (otomatik oluşturulur)
  - Lisans tipi (prepaid/direct_sale)
  - Ödeme aralığı (aylık/yıllık)
  - Modül seçimi (qr_web_menu, courier_module, vb.)
  - Ek cihaz ve yazıcı istasyonu kota seçimi
  - QR domain belirleme
- **Kiracı Düzenleme:** Bilgi güncelleme, durum değiştirme
- **Modül Yönetimi:** Kiracıya ek modül satın alma
- **Ödeme Linki:** Abonelik/modül için ödeme bağlantısı oluşturma
- **Yedek Alma:** Her kiracı için PostgreSQL dump

### 1.3 Bayiler (Resellers)
**Özellikler:**
- Bayi profili: Şirket adı, vergi no, adres, iletişim
- Komisyon oranı yapılandırması
- Kullanılabilir lisans sayısı, cüzdan bakiyesi
- Bayi planı (plan_id, lisans sayısı, fiyat)
- **İşlemler:**
  - Bayi oluşturma / düzenleme / silme
  - Plan yükseltme (lisans transferi)
  - Cüzdan para transferi
  - Bayiye özel SaaS görünümü (sadece kendi kiracıları)

### 1.4 Finans (Finance)
- **Tahsilat Takibi:** Banka transferi, nakit, kredi kartı
- **Bekleyen Ödemeler:** Vadesi yaklaşan/abone olan
- **Gelir Raporu:** Aylık/yıllık özet
- **Fatura Yönetimi:** Fatura oluşturma, görüntüleme

### 1.5 Muhasebe (Accounting)
- Yaklaşan ödemeler listesi
- Taksit takibi
- Bildirimler (2 gün önce uyarı)
- Tüm ödemeler (filtrelenebilir)

### 1.6 Güvenlik (Security)
- Başarısız giriş denetimleri (24s)
- Audit logları (son 24s)
- API anahtarı yönetimi
- Aktif oturumlar

### 1.7 Raporlar (Reports)
- Büyüme raporu (AI içgörüleri ile)
- Plan dağılımı
- Gelir tahmini

### 1.8 Planlar (Plans)
- Abonelik planları listesi (basic/pro/enterprise)
- Her planın özellik matrisi
- Modül dahil/locked/addon durumları

### 1.9 Kampanyalar (Campaigns)
- Kampanya oluşturma (isim, açıklama, indirim tipi, değer)
- Otomatik uygulama seçeneği
- Kupon üretimi (tek/çoklu)
- SMS dağıtımı
- İstatistikler (kullanım, indirim)
- Kupon doğrulama ve kullanım

### 1.10 Yedekleme (Backups)
- SaaS admin yedekleri
- Kiracı yedekleri ( manuel + otomatik cron)
- Backup istatistikleri

### 1.11 CRM (Müşteri İlişkileri)
- Müşteri listesi (puan, tier, harcama)
- Sadakat segmentasyonu (bronze/silver/gold)
- Müşteri notları, sözleşmeler
- Toplu CSV import/export

### 1.12 İzleme (Monitoring)
- Sistem sağlığı (uptime, DB latency)
- Uyarlık kuralları
- Bildirim logları

### 1.13 Destek (Support)
- Destek talepleri (açık/kapalı/beklemede)
- Bilgi tabanı makaleleri
- Öncelik ve kategori yönetimi

### 1.14 Market (Shop)
- Ek modül kataloğu (billing_modules)
- Modül açıp kapatma
- Plan-modül matris yönetimi

### 1.15 Ayarlar (Settings)
- Sistem para birimi
- Fiskal ayarlar (TSE/KassenSichV)
- Sanal POS yapılandırması (iyzico, paytr, stripe)
- Otomatik yedekleme ayarları
- **Arayüz dili yönetimi:** Ayarlardan `Deutsch / English / Türkçe` seçimi
- **Varsayılan dil:** `Deutsch (de)`
- **i18n kalite notu:** TR/DE/EN çeviri anahtarları eşitlendi (parity), eksik anahtar durumunda fallback zinciri `de -> en -> tr`

### 1.16 Güncel Durum Notu (2026-04-15)
- SaaS Admin panelinde dil standardı netleştirildi: varsayılan Almanca, kullanıcı ayarlardan dili değiştirebilir.
- `Settings` sekmesindeki hardcoded metinlerin kritik kısmı i18n anahtarlarına taşındı (gateway başlık/etiketleri dahil).
- Çeviri setleri senkronlandı: TR/DE/EN anahtar sayıları eşit.

### 1.17 Bayi Paneli Güncellemesi (2026-04-16)
- **Finans operasyonu:** ödeme listesi, durum/tür/tarih filtreleri, durum güncelleme (paid/overdue), hatırlatma maili, CSV export.
- **Destek operasyonu:** ticket detay + mesaj akışı + yanıt gönderme + durum güncelleme.
- **Bayi Ayarlar & Güvenlik:** profil düzenleme API bağlantısı, şifre değiştirme akışı, 2FA yöntem seçimi (none/email/authenticator) alanı.
- **i18n temizlik:** Bayi Dashboard/Support/Finance/Settings ekranlarında kalan sabit metinler TR/DE/EN anahtarlarına taşındı.

### 1.18 Bayi Paneli Güncellemesi (2026-04-17)
- **2FA doğrulama akışı:** SaaS login sonrasında gerekli ise challenge token döner; ikinci adımda kod doğrulanınca oturum açılır (`/auth/login/saas/2fa/verify`).
- **İleri BI filtreleri:** Finans ekranına tenant arama + ödeme yöntemi filtresi eklendi; backend sorgusu tenant adı/tenant_id ve payment_method ile filtrelenebilir hale getirildi.

### 1.19 Bayi Paneli Güncellemesi (2026-04-17 / 2)
- **2FA yeniden gönderim:** Login challenge sırasında `POST /auth/login/saas/2fa/resend` ile email kodu yenileme akışı eklendi.
- **Authenticator setup:** Bayi ayarlarda authenticator için QR/secret üretimi ve doğrulama endpointleri eklendi (`/tenants/reseller/2fa/authenticator/setup`, `/verify`).
- **Giriş + Ayarlar UX:** Login ekranına "kodu yeniden gönder", Settings ekranına "setup başlat + doğrula ve etkinleştir" adımları eklendi.

### 1.20 Bayi Paneli Güncellemesi (2026-04-17 / 3)
- **2FA brute-force koruması:** 2FA kod denemeleri için ayrı lockout anahtarı eklendi (`saas2fa:*`); çoklu hatalı denemede geçici kilit uygulanır.
- **Backup kod desteği:** Tek kullanımlık yedek kodlar doğrulama adımında desteklenir; kullanılan kod otomatik düşülür.
- **Backup kod yönetimi:** Bayi ayarlarda kod yenileme endpointi + kalan adet görünürlüğü eklendi (`/tenants/reseller/2fa/backup-codes/regenerate`).

### 1.21 Bayi Paneli Güncellemesi (2026-04-17 / 4)
- **2FA audit log:** 2FA doğrulama başarıları (`saas_2fa_verified`) ve yeniden gönderim aksiyonu (`saas_2fa_resend`) `audit_logs` tablosuna yazılır.
- **Yöntem görünürlüğü:** Audit kayıtlarında kullanılan yöntem (`email_otp`, `authenticator_totp`, `backup_code`) ve backup kod kalan sayısı tutulur.

### 1.22 Bayi Paneli Güncellemesi (2026-04-17 / 5)
- **Global aksiyon loglama:** API katmanında `/api/v1` altındaki tüm istekleri merkezi loglayan middleware eklendi.
- **Maskeli güvenlik logu:** Request body/query/params loglanırken şifre/token/secret alanları otomatik redacted edilir.
- **Tam iz takibi:** Her kayıt için metod, endpoint, status, süre, actor role, tenant id, IP ve user-agent tutulur.

### 1.23 Bayi Paneli Güncellemesi (2026-04-17 / 6)
- **Gelişmiş audit filtreleri:** Security tabında endpoint, actor, tenant id, risk seviyesi ve HTTP method filtreleri eklendi.
- **Risk sınıflandırması:** Audit kayıtları backend tarafından `low / medium / high` seviyesinde etiketlenir.
- **Audit tablo zenginleştirme:** Method + status ve risk sütunları görünür hale getirildi.

### 1.24 Bayi Paneli Güncellemesi (2026-04-17 / 7)
- **Tarih aralığı filtresi:** Audit listesinde from/to tarih filtreleri eklendi.
- **CSV export:** Uygulanan filtre sonucunu CSV olarak dışa aktarma eklendi.
- **Kapsayıcı tarih sorgusu:** Backend `to` tarihini gün sonunu kapsayacak şekilde ele alır (`< to + 1 day`).

### 1.25 Bayi Paneli Güncellemesi (2026-04-17 / 8)
- **Retention ayarı UI:** Settings ekranına audit kayıt saklama süresi (gün) alanı eklendi.
- **Sunucu tarafı politika:** `system_settings.audit_retention_days` alanı ile retention süresi yönetilir (1..3650 gün).
- **Otomatik temizlik:** Audit log cleanup başlangıçta ve periyodik bakım döngüsünde otomatik çalışır.

### 1.26 Bayi Paneli Güncellemesi (2026-04-17 / 9)
- **Onay adımı:** Saklama süresi azaltılırsa kayıt öncesi kullanıcıdan onay alınır.
- **Açıklayıcı yardım metni:** Retention alanına min/max ve temizleme etkisini belirten i18n açıklaması eklendi.
- **Anlık cleanup tetikleme:** Ayar güncellemesinde retention değeri gönderilmişse backend hemen cleanup çalıştırır.

### 1.27 Bayi Paneli Güncellemesi (2026-04-17 / 10)
- **Preset retention profilleri:** 30 / 90 / 180 / 365 / 730 gün seçenekleri eklendi.
- **Custom retention modu:** Özel değer seçildiğinde manuel gün alanı görünür.

### 1.28 SaaS Admin — Bayi cüzdan talep onayı (2026-04-16)
- **API:** `GET /api/v1/tenants/reseller/wallet/topup-admin` (süper admin, tüm talepler + bayi adı).
- **API:** `PATCH /api/v1/tenants/reseller/wallet/topup-requests/:id` — `{"action":"approve"}` ile `saas_admins.wallet_balance` artırılır ve talep `approved`; `reject` ile `rejected`.
- **UI:** SaaS **Bayiler** sekmesinde tablo; bekleyen talepler için Onayla / Reddet.
- **Muhasebe izi:** Onayda `public.payment_history` satırı (`payment_type=reseller_wallet_topup`, `paid`, `tenant_id` NULL, `saas_admin_id` bayi) + `audit_logs` (`reseller_wallet_topup_approved` / `_rejected`).
- **Operasyon:** `GET .../topup-admin/pending-count` ile dashboard uyarısı; ödeme/muhasebe listelerinde kiracısız satırlar için `saas_admins` üzerinden görünen ad; finans özetinde onaylı cüzdan yüklemeleri tutarı.

---

## 2. Otomatik QR Web Menu Alt Domain Sistemi

### 2.1 Domain Yapısı

```
[restoran-adi].hpdemos.de  →  QR Menu (Müşteri görür)
```

**Örnekler:**
- Demo Pizza & Kebab → `pizzakebapdemo.hpdemos.de`
- Cafe Berlin → `cafeberlin.hpdemos.de`
- Restaurant XY → `restaurantxy.hpdemos.de`

### 2.2 Otomatik Oluşturma Akışı

```
1. SaaS Admin veya Bayi, Restoran eklerken "qr_web_menu" modülünü seçer
   ↓
2. billing.service.ts → purchaseTenantAddons() çağrılır
   ↓
3. Eğer 'qr_web_menu' modülü eklendiyse:
   → qrWebProvisioning.service.ts → provisionQrWebSubdomain() tetiklenir
   ↓
4. Domain oluşturulur:
   - normalizeDnsLabel() → türkçe karakterler kaldırılır, küçük harfe çevrilir
   - Örn: "Demo Pizza & Kebab" → "pizzakebabdemo"
   - Çakışma varsa sayı eklenir: "pizzakebabdemo2"
   ↓
5. tenant_qr_domains tablosuna kayıt eklenir (Prisma)
   ↓
6. Cache invalidation yapılır
   ↓
7. DNS wildcard zaten aaPanel'de *.hpdemos.de olarak ayarlı
   → Nginx reverse proxy yönlendirmesi otomatik çalışır
```

### 2.3 Configuration (.env)

```bash
# QR Web Menu parent domain
QR_WEB_PARENT_DOMAIN=hpdemos.de

# Modül kontrolü atlatma (development)
QR_WEB_SKIP_MODULE_CHECK=0

# Üretimde module kontrolü zorunlu
QR_WEB_ENFORCE_MODULE=1
```

### 2.4 Database Tabloları (Prisma Schema)

```prisma
model TenantQrDomain {
    id        Int      @id @default(autoincrement())
    tenantId  String   @map("tenant_id")
    domain    String   @unique
    isActive  Boolean  @default(true)
    isVerified Boolean @default(false)
    createdAt DateTime @default(now()) @map("created_at")

    @@index([tenantId])
    @@map("tenant_qr_domains")
}
```

### 2.5 Nginx / aaPanel Yapılandırması

```nginx
# Wildcard DNS A kaydı: *.hpdemos.de → Sunucu IP'si

# Nginx reverse proxy (SaaS API önünde)
server {
    listen 80;
    server_name ~^(?<label>[a-z0-9-]+)\.hpdemos\.de$;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# HTTPS için Certbot (Let's Encrypt)
# *.hpdemos.de wildcard certificate otomatik yenilenebilir
```

### 2.6 QR Menu Database Bağlantısı

Her tenant'ın kendi PostgreSQL schema'sı var. QR Menu uygulaması:

1. **Domain'den tenant'ı bulma:**
   - `domainTenant.js` middleware → `tenant_qr_domains` tablosundan tenantId'yi alır
   - `X-Tenant-ID` header'ını ayarlar

2. **Veritabanı bağlantısı:**
   - Tenant'a özel schema kullanılır
   - connection string: `postgresql://user:pass@host:5432/nextpos?search_path=tenant_xyz`

---

## 3. Dağıtım Mimarisi (Docker + aaPanel)

### 3.1 Mevcut Kurulum

```
Sunucu: Ubuntu 22.04 LTS (Dedicated)
Panel: aaPanel (Web panel)
Docker: Evet (Docker Compose ile yönetiliyor)

Alanlar:
- webotonom.de (Ana site)
- hpdemos.de (QR Menu domainleri için parent)
```

### 3.2 Docker Container Yapısı

```yaml
# docker-compose.yml (önerilen)
services:
  nextpos_api:
    image: nextpos/api:latest
    container_name: nextpos_api
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://nextpos:XXXXX@localhost:5432/nextpos
      - QR_WEB_PARENT_DOMAIN=hpdemos.de
    volumes:
      - ./backups:/app/backups

  nextpos_pos:
    image: nextpos/pos:latest
    container_name: nextpos_pos
    ports:
      - "5173:5173"
    depends_on:
      - nextpos_api

  nextpos_nginx:
    image: nginx:alpine
    container_name: nextpos_nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - nextpos_api
      - nextpos_pos
```

### 3.3 aaPanel DNS Ayarları

```
A Kayıt:
  @      → [SUNUCU_IP]
  *      → [SUNUCU_IP]    # Wildcard subdomain

MX Kayıt:
  @      → mail.webotonom.de
```

---

## 4. Geliştirme Notları

### 4.1 API Endpoint'leri

| Endpoint | Açıklama |
|----------|----------|
| `POST /api/v1/tenants` | Yeni restoran oluştur |
| `PATCH /api/v1/tenants/:id` | Restoran düzenle |
| `POST /api/v1/billing/tenants/:id/addons` | Modül satın al (qr_web_menu burada tetiklenir) |
| `GET /api/v1/qr-web/domain-info` | QR domain durumu |
| `POST /api/v1/tenants/qr-domain/provision` | Manuel domain provizyon |

### 4.2 Kod Konumları

- **Alt domain provizyonu:** `apps/api/src/services/qrWebProvisioning.service.ts`
- **Billing service:** `apps/api/src/services/billing.service.ts` (modül satın alma mantığı)
- **Tenant store:** `apps/pos/src/store/useSaaSStore.ts`
- **Kiracı oluşturma UI:** `apps/pos/src/pages/saas/TenantsTab.tsx`

### 4.3 Test Komutları

```bash
# API Health
curl http://localhost:3001/api/v1/health

# QR Domain provizyon (Postman/Curl)
POST http://localhost:3001/api/v1/tenants/<tenant-id>/addons
{
  "module_codes": ["qr_web_menu"],
  "payment_method": "bank_transfer"
}

# Domain durumu
GET http://localhost:3001/api/v1/qr-web/domain-info?tenantId=<tenant-id>
```

---

## 5. Todo / Yapılacaklar

- [ ] **SSL Sertifikası:** *.hpdemos.de için wildcard Let's Encrypt
- [ ] **Nginx Config:** QR menu subdomain proxy kuralları
- [ ] **Docker Registry:** nextpos/api ve pos image'larını build et
- [ ] **CI/CD Pipeline:** GitHub Actions ile otomatik deployment
- [ ] **Monitoring:** Grafana + Prometheus kurulumu

---

*Bu doküman 2026-04-12 tarihinde oluşturuldu.*
*NextPOS Software Engineer: Otomatik QR Menu + SaaS Mimari Analizi*