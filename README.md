# NextPOS

Turborepo monorepo: **API** (`apps/api`, Prisma), **POS arayüzü** (`apps/pos`), **admin** (`apps/admin`). Eski **PizzaPOS** PHP projesi (`pizzapos/`) bu repoya dahil değildir.

## Plan dokümanı

Hedef mimari, PostgreSQL şeması, modüller, WebSocket olayları ve faz planı: [`docs/yeni_nesil_pos_proje_plani.md`](docs/yeni_nesil_pos_proje_plani.md).

## Kısa analiz özeti

| Alan | Durum |
|------|--------|
| Hedef | Hibrit POS: React/Vite istemciler, Node API, gerçek zamanlı (Socket), çok kiracılı SaaS yapısı |
| Modüller | Kasiyer, garson, mutfak, kurye, müşteri menüsü, SaaS yönetim (plana uygun ekranlar) |
| Veri | Prisma + MySQL (mevcut kurulum); plan uzun vadede PostgreSQL önerir |
| i18n | Plan: DE / TR / EN — ürün çevirileri ve UI |

## Geliştirme

```powershell
cd d:\xampp\htdocs\NextPOS
npm install
npm run dev
```

API ve ortam değişkenleri için `apps/api` altındaki `.env` örneğine bakın (dosya repoda yoksa yerelde oluşturun).

## GitHub’a gönderme

Yerelde commit için `git config user.name` / `user.email` ayarlayın (global veya sadece bu repo).

```powershell
cd d:\xampp\htdocs\NextPOS
git remote add origin https://github.com/KULLANICI_ADIN/nextpos.git
git push -u origin main
```

Önce GitHub’da boş bir repo oluşturun. `gh` yüklüyse: `gh repo create nextpos --private --source=. --push`
