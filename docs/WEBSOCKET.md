# Socket.io — Oda ve olaylar (kod ile uyumlu)

Kaynak: `apps/api/src/socket/index.ts` ve HTTP controller’lardaki `req.app.get('io')` yayınları.

## İstemci → sunucu (join)

| Olay | Açıklama |
|------|----------|
| `join:tenant` | `(tenantId: string)` → oda `tenant:{tenantId}` |
| `join:branch` | `{ tenantId, branchId }` → `tenant:{t}:branch:{branchId}` |
| `join:table` | `{ tenantId, tableId }` → `tenant:{t}:table:{tableId}` |
| `join:kitchen` | `{ tenantId, branchId }` → `tenant:{t}:kitchen:{branchId}` |
| `join:waiter` | `{ tenantId, userId }` → `tenant:{t}:waiter:{userId}` |
| `join:courier` | `{ tenantId, userId }` → `tenant:{t}:courier:{userId}` |

## İstemci → sunucu (relay / diğer)

İstemcinin gönderdiği olaylar sunucu tarafından ilgili odalara iletilir:

| Olay | Not |
|------|-----|
| `order:new` | `tenant:{t}:kitchen:{branchId}` + `tenant:{t}` |
| `order:status_changed` | `tenant:{t}` (+ varsa garson odası) |
| `kitchen:item_ready` | garson, tenant, masa odası |
| `table:status_changed` | `tenant:{tenantId}` |
| `customer:order_request` | garson + tüm tenant (QR talep) |
| `customer:order_approved` | masa + mutfak `order:new` |
| `customer:order_rejected` | masa |
| `table:lock` / `table:unlock` | `table:locked` / `table:unlocked` yayınları |
| `customer:service_call` | tenant + garson |
| `delivery:status_changed` | tenant |

## Sunucu → istemci (HTTP’den yayın — örnek)

QR ve sipariş controller’ları doğrudan `io.to(...).emit(...)` kullanır; isimler:

| Olay | Ne zaman |
|------|----------|
| `order:new` | Yeni sipariş / checkout / QR onayı sonrası |
| `order:status_changed` | Durum güncelleme, QR onay (`confirmed`), QR red (`cancelled`) |
| `payment:received` | Checkout akışında |
| `customer:order_request` | QR sipariş oluşturulduğunda |
| `customer:order_approved` | `tenant:{t}:table:{tableId}` |
| `customer:order_rejected` | Red + `order:status_changed` |
| `kitchen:ticket_updated` | Mutfak controller patch |
| `sync:menu_revision` | Admin menü/katalog (ürün, kategori, varyant, toplu fiyat, ürün-mod eşlemesi) güncellemesi — `tenant:{tenantId}` |
| `sync:tables_changed` | Admin bölge/masa CRUD veya masa konumu — `tenant:{tenantId}` (kat planı `sync/pull` revizyonunda her zaman görünmez) |

## Master plan §10 ile isim farkı

Dokümandaki `qr:order_request` yerine kodda **`customer:order_request`** kullanılıyor.  
`qr:order_approved` / `qr:order_rejected` yerine **`customer:order_approved`** / **`customer:order_rejected`**.

Yeni özellik eklerken bu dosyayı ve `socket/index.ts` dosyasını birlikte güncelleyin.

## Offline çekim ipucu

`GET /api/v1/sync/pull?since=<menuRevision>` ile menü/masa değişimi için `menuStale` kontrol edilir; revizyon sayı özeti + masa/bölge (`tf`/`sf`) + kategori/ürün/modifikatör/varyant/ürün-mod eşlemesi (`cf`/`pf`/`mf`/`vf`/`pmf`) `md5(string_agg(...))` parmak izlerini içerir.
