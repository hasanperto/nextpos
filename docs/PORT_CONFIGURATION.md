# Port ve URL yapılandırması

Frontend (Vite) ve API portları **sabit değildir**; ortam değişkenleriyle değiştirilir.

## Örnek üretim (referans)

| Bileşen | Port | Örnek host |
|--------|------|------------|
| Super Admin Panel | 4000 | admin.webotonom.de |
| Bayi Panel | 4001 | reseller.webotonom.de |
| POS Panel | 4003 | pos.webotonom.de |
| Web / QR Menü | 3000 | `{slug}.webotonom.de` |
| API Gateway | 5000 | api.webotonom.de |

> **Not:** Bu repoda ayrı “Bayi” ve “Web/QR” Vite uygulaması yoksa, ilgili portlar ileride eklenebilir veya Nginx ile aynı build’e farklı `server_name` verilir.

## Yerel geliştirme (varsayılanlar)

| Uygulama | Varsayılan port | Yapılandırma dosyası |
|----------|-----------------|----------------------|
| POS (`apps/pos`) | 5173 | `apps/pos/.env.local` |
| Admin (`apps/admin`) | 5176 | `apps/admin/.env.local` |
| Reseller (`apps/reseller`) | 4001 | `apps/reseller/.env.local` |
| API (`apps/api`) | 3001 | `apps/api/.env` → `PORT` |

## Ortam değişkenleri

### `apps/pos` ve `apps/admin` (Vite)

`apps/<app>/.env.example` dosyasını `.env.local` olarak kopyalayın.

| Değişken | Açıklama |
|----------|----------|
| `DEV_SERVER_PORT` | Vite dev sunucu portu |
| `DEV_SERVER_HOST` | Dinlenecek adres (`127.0.0.1`, `0.0.0.0`, …) |
| `DEV_SERVER_STRICT_PORT` | `1` ise port meşgulse hata verir |
| `API_PROXY_TARGET` | `/api` ve Socket.io proxy hedefi (örn. `http://127.0.0.1:5000`) |

Alternatif isimler: `VITE_DEV_SERVER_PORT`, `VITE_DEV_SERVER_HOST`, `VITE_API_PROXY_TARGET` (aynı anlam).

### `apps/api`

| Değişken | Açıklama |
|----------|----------|
| `PORT` | HTTP API dinleme portu (örn. `5000`) |
| `CORS_ORIGIN` | İzin verilen tarayıcı origin’leri (virgülle) |
| `SOCKET_CORS_ORIGIN` | Socket.io için origin’ler (yoksa `CORS_ORIGIN` kullanılır) |

API’yi `5000` yapıp POS’u `4003` üzerinde çalıştırıyorsanız, POS’ta `API_PROXY_TARGET=http://127.0.0.1:5000` ve API `.env` içinde `CORS_ORIGIN` listesine `http://localhost:4003` (ve gerekirse `https://pos.webotonom.de`) ekleyin.

## Hızlı örün: API 5000, POS 4003

**apps/api/.env**

```env
PORT=5000
CORS_ORIGIN=http://127.0.0.1:4003,http://localhost:4003
SOCKET_CORS_ORIGIN=http://127.0.0.1:4003,http://localhost:4003
```

**apps/pos/.env.local**

```env
DEV_SERVER_PORT=4003
API_PROXY_TARGET=http://127.0.0.1:5000
```
