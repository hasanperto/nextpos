# NextPOS — Giriş URL’leri ve hesap bilgileri

Bu dosya yerel geliştirme için **varsayılan portlar** ve `prisma/seed.ts` ile oluşturulan **demo hesapları** özetler. Portlar `.env` / `.env.local` ile değişebilir; güncel değer için `docs/PORT_CONFIGURATION.md` dosyasına bakın.

--- Testscrp ali key : (REDACTED)

## Hızlı referans (yerel varsayılanlar)

| Uygulama | Tarayıcı adresi | Not |
|----------|-----------------|-----|
| **API** | `http://127.0.0.1:5000` | `apps/api/.env.local` → `PORT` |
| **API sağlık** | `http://127.0.0.1:5000/api/v1/health` | GET |
| **POS (Vite)** | `http://127.0.0.1:5173` | `apps/pos` — `DEV_SERVER_PORT` ile değişir |
| **Kurye Paneli (PWA)** | `http://127.0.0.1:5173/courier` | Kuryeler için optimize edilmiş mobil panel |
| **SaaS Super Admin (ayrı Vite)** | `http://127.0.0.1:5176/saas-admin` | `apps/admin` — `DEV_SERVER_PORT` ile değişir |
| **POS içinden SaaS geçiş** | `http://127.0.0.1:5173/saas-admin` | POS bu rotada ayrı panele yönlendirir (`VITE_SAAS_ADMIN_URL`) |
| **Bayi paneli** | `http://127.0.0.1:4001` | `apps/reseller` — `DEV_SERVER_PORT` ile değişir (proxy: API_PROXY_TARGET → `http://127.0.0.1:5000`) |

Tüm Vite uygulamaları geliştirmede `/api` isteklerini **`API_PROXY_TARGET`** ile API’ye proxy’ler (örn. `http://127.0.0.1:5000`).

---

## Giriş API uçları (backend)

| Amaç | Metot | Yol |
|------|--------|-----|
| POS / restoran kullanıcısı (kullanıcı adı + şifre) | POST | `/api/v1/auth/login` |
| PIN ile giriş | POST | `/api/v1/auth/login/pin` |
| **SaaS** (süper admin + bayi) | POST | `/api/v1/auth/login/saas` |
| Token yenileme | POST | `/api/v1/auth/refresh` |
| Çıkış | POST | `/api/v1/auth/logout` |

SaaS tarafında dönen alanlar: `accessToken`, `user` (rol: `super_admin` veya `reseller`).

---

## Demo hesaplar (`npm run db:seed` — `apps/api` içinde `prisma/seed.ts`)

> **Uyarı:** Bu bilgiler yalnızca geliştirme içindir. Üretim ortamında şifreleri değiştirin veya seed kullanmayın.

| Rol | Kullanıcı adı | Şifre | Nerede kullanılır |
|-----|----------------|-------|-------------------|
| SaaS süper admin | `superadmin` | `superadmin123` | `http://localhost:5173/saas-admin` (veya POS URL + `/saas-admin`) — giriş: SaaS API |
| Demo bayi | `demo_reseller` | `reseller123` | `http://127.0.0.1:4001` — Bayi paneli |
| Restoran admin (tenant şeması) | `admin` | `admin123` | POS `/login` — PIN: `123456` |
| Kasiyer | `cashier` | `kasa123` | PIN: `111111` |
| Garson | `waiter` | `garson123` | PIN: `222222` |
| Mutfak | `kitchen` | `mutfak123` | PIN: `333333` |
| Kurye | `courier` | `kurye123` | PIN: `444444` |

Seed çıktısında demo tenant şema adı: `tenant_demo` (`prisma/seed.ts` içindeki `SCHEMA` sabiti).

---

## CORS (tarayıcıdan API erişimi)

API `apps/api/.env` içinde `CORS_ORIGIN` ve `SOCKET_CORS_ORIGIN` ile tanımlanır. Yerelde şu origin’lerin ekli olması gerekir (port kendi kurulumunuza göre):

- POS: `http://127.0.0.1:5173`, `http://localhost:5173`
- Admin: `http://localhost:5176`, `http://127.0.0.1:5176`
- Bayi: `http://127.0.0.1:4001`, `http://localhost:4001`

Örnek: `apps/api/.env.example` dosyasındaki satırları referans alın.

---

## Geliştirme komutları (monorepo kökü: `nextpos/`)

| Komut | Açıklama |
|-------|----------|
| `npm run dev` | Turbo ile tanımlı tüm `dev` paketleri (genelde api + pos + admin) |
| `npm run dev:api` | Sadece API |
| `npm run dev:pos` | Sadece POS |
| `npm run dev:admin` | Sadece Admin uygulaması |
| `npm run dev:reseller` | Sadece Bayi paneli (`apps/reseller`, varsayılan port **4001**) |

Veritabanı ve demo veri için: `apps/api` altında `npm run db:seed` veya kökteki `npm run db:seed` (package.json’a bağlı).

---

## Veritabanı bağlantısı (yerel örnek)

`apps/api/.env`:

```env
DATABASE_URL="postgresql://nextpos:nextpos@127.0.0.1:5432/nextpos"
```

Docker / kurulum için repo içindeki `docker-compose` veya kurulum dokümanlarına bakın.

---

## Üretim örneği (referans — `docs/PORT_CONFIGURATION.md`)

| Bileşen | Örnek port | Örnek host |
|---------|------------|------------|
| Super Admin | 4000 | `admin.example.com` |
| Bayi | 4001 | `reseller.example.com` |
| POS | 4003 | `pos.example.com` |
| API | 5000 | `api.example.com` |

Gerçek domain ve TLS Nginx / reverse proxy ile yapılandırılır.

---

## Kurye Paneli & PWA Kurulumu

Kuryeler için optimize edilmiş, **Mobile-First** ve **PWA** (Progressive Web App) destekli profesyonel teslimat yönetim panelidir.

### 🏠 Mobil Uygulama Olarak Kurma
1. Mobil tarayıcıdan (Chrome/Safari) `http://127.0.0.1:5173/courier` adresine gidin.
2. Tarayıcı menüsünden **"Ana Ekrana Ekle"** (Add to Home Screen) seçeneğine dokunun.
3. NextPOS logosu telefonunuzun uygulama listesinde belirecektir. Artık tarayıcı çubukları olmadan **tam ekran (Standalone)** çalışır.

### ⚡ Akıllı ve Hızlı Giriş
- **Restoran ID Hafızası:** Kurye, restoranın Tenant UUID kodunu **sadece bir kez** girer. NextPOS bu bilgiyi güvenle saklar.
- **Saniyeler İçinde İş Başı:** Uygulama bir sonraki açılışta restoran kodunu sormaz. Kurye sadece kişisel **6 Haneli PIN** kodunu tuşlayarak anında teslimat listesine ulaşır.
- **Canlı Bildirimler:** Yeni bir sipariş atandığında veya mutfaktan paket çıktığında panel anlık sesli ve görsel bildirim gönderir.
- **Navigasyon:** Müşteri adresinin yanındaki **"Rotayı Göster"** butonu ile Google Maps üzerinden tek tıkla navigasyon başlatılabilir.
