# NextPOS API — Gerçek Rota Listesi (`/api/v1`)

Kaynak: `apps/api/src/index.ts` ve `apps/api/src/routes/*.ts`.  
Örnek: `GET /api/v1/health` — tam yol.

## Genel

| Metot | Yol | Not |
|--------|-----|-----|
| GET | `/health` | Sağlık kontrolü |

## Auth (`/api/v1/auth`)

| Metot | Yol | Not |
|--------|-----|-----|
| POST | `/login` | IP limiti varsayılan 40 / 15 dk (`AUTH_LOGIN_MAX_PER_WINDOW`) |
| POST | `/login/pin` | aynı |
| POST | `/login/saas` | aynı |
| POST | `/refresh` | varsayılan 90 / dk (`AUTH_REFRESH_MAX_PER_MIN`) |
| POST | `/logout` | limit yok |

Aşımda `429`. Üretimde Nginx arkasında gerçek IP için `TRUST_PROXY=1`.

Uygulama kilidi (bellek): yanlış şifre/PIN/SaaS için varsayılan **5** başarısız deneme sonrası **15 dk** `429` + `retryAfterSec` (`AUTH_LOCKOUT_*`).

## Dil (`/api/v1/languages`) — JWT yok

| Metot | Yol |
|--------|-----|
| GET | `/` |
| GET | `/:lang/translations` |

## Abonelik planları (`/api/v1/subscriptions`)

| Metot | Yol | Not |
|--------|-----|-----|
| GET | `/` | Public liste |
| POST | `/` | Auth |
| PUT | `/:id` | Auth |
| DELETE | `/:id` | Auth |

## Faturalama (`/api/v1/billing`)

| Metot | Yol | Not |
|--------|-----|-----|
| GET | `/modules` | Public |
| GET | `/modules/admin` | super_admin |
| POST | `/modules` | super_admin |
| PATCH | `/modules/:code` | super_admin |
| DELETE | `/modules/:code` | super_admin |
| POST | `/quote` | |
| GET | `/plan-modules/:planCode` | |
| PUT | `/plan-modules/:planCode` | super_admin |
| POST | `/tenants/:tenantId/record-payment` | super_admin |
| GET | `/tenants/:tenantId/reactivation-quote` | super_admin |
| GET | `/tenants/:tenantId/entitlements` | super_admin |
| POST | `/tenants/:tenantId/addons` | super_admin |

## SaaS / Tenant (`/api/v1/tenants`) — JWT + rol

Özet: `stats`, CRUD tenant, `system/*`, `finance/*`, `security/*`, `resellers/*`, `plans`, `promos`, `crm/*`, `monitoring/*`, `support/*`, `backups/*`, `GET|PATCH /:id`.

Ayrıntı: `routes/tenants.ts`.

## QR müşteri (`/api/v1/qr`) — JWT yok, `x-tenant-id`

| Metot | Yol |
|--------|-----|
| GET | `/tables/:qrCode` |
| GET | `/menu/categories` |
| GET | `/menu/products` |
| POST | `/orders` |
| POST | `/service-call` | Garson çağır / hesap iste (`callType`: `call_waiter`, `request_bill`, …) → `service_calls` + Socket |

## Menü — tenant (`/api/v1/menu`)

| Metot | Yol |
|--------|-----|
| GET | `/categories`, `/products`, `/products/:id`, `/modifiers` |
| GET-DELETE | `/admin/products`, `/admin/categories`, varyant ve modifier uçları (`admin` rolü) |

## Masalar (`/api/v1/tables`)

| Metot | Yol |
|--------|-----|
| GET | `/`, `/sections`, `/:id/status` |
| POST | `/:id/open` |

## Siparişler (`/api/v1/orders`)

| Metot | Yol | Not |
|--------|-----|-----|
| GET | `/` | `status`, `source`, `deliveryQueue`, vb. |
| POST | `/`, `/checkout` | |
| PATCH | `/:id/courier` | courier, admin, cashier |
| POST | `/:id/approve-qr`, `/:id/reject-qr` | waiter, admin, cashier |
| PATCH | `/:id/status` | |

## Mutfak (`/api/v1/kitchen`)

| Metot | Yol |
|--------|-----|
| GET | `/tickets` |
| PATCH | `/tickets/:id/status` |

## Ödemeler (`/api/v1/payments`)

| Metot | Yol |
|--------|-----|
| POST | `/` |
| GET | `/order/:orderId` |

## Müşteriler (`/api/v1/customers`)

| Metot | Yol |
|--------|-----|
| GET | `/search` |
| POST | `/` |
| GET | `/:id` |

## Kullanıcılar (`/api/v1/users`) — admin

| Metot | Yol |
|--------|-----|
| GET, POST | `/` |
| PUT, DELETE | `/:id` |

## Restoran admin (`/api/v1/admin`) — admin

| Metot | Yol |
|--------|-----|
| GET | `/dashboard`, `/reports/summary`, `/reports/summary/pdf?from=&to=` (PDF), `/reports/z-close`, `/reports/z-close/pdf?date=YYYY-MM-DD` (PDF) |
| CRUD | `/sections`, `/tables`, `/delivery-zones` |

Dakika başına IP limiti (~300 istek) uygulanır; aşımda `429` ve `Retry-After` başlığı.

## Offline senkron (`/api/v1/sync`) — JWT tenant

| Metot | Yol | Not |
|--------|-----|-----|
| GET | `/status` | `pending`, `failed`, `synced` (`public.sync_queue`) |
| GET | `/pull` | `?since=<önceki menuRevision>` — `menuRevision`, `menuStale`, boş `deltas` (tam delta yok) |
| POST | `/push` | `{ items: [...] }` → upsert (`offlineId` = `entity_id`); `synced` tekrarlar `skippedSynced`; yanıtta `queued`, `processed`, `failed` |
| POST | `/retry` | `failed` → yeniden işle — **admin, cashier** |

---

*Güncel tek kaynak: `apps/api/src/routes/*.ts`.*
