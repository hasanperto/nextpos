# NextPOS — Yeni Nesil Restoran POS (Plan)

Bu depo, **NextPOS** hibrit (bulut + offline) restoran otomasyonunun tek kaynak proje planını içerir. Eski **PizzaPOS** (PHP/MySQL) referans alınmış; hedef yığın: **React + Vite**, **Node/NestJS**, **PostgreSQL**, **Socket.io**, **IndexedDB** (offline).

## Özet analiz

| Alan | Karar |
|------|--------|
| Mimari | VPS üzerinde PostgreSQL + REST API + Socket.io; istemciler React SPA/PWA, QR menü için Next.js |
| Modüller | Kasiyer, garson (tablet), mutfak KDS, kurye, admin, müşteri QR/kiosk |
| Gerçek zamanlı | Şube/masa/mutfak/garson odaları; sipariş, mutfak, teslimat ve müşteri olayları |
| Offline | IndexedDB + Dexie, sync kuyruğu; JWT ile sınırlı süre çevrimdışı çalışma |
| i18n | DE / TR / EN — ürün çevirileri JSONB, UI çevirileri ve adisyon şablonları |
| Güvenlik | JWT + refresh, RBAC, HTTPS/WSS |

Ayrıntılı şema, API tasarımı, WebSocket olayları ve geliştirme fazları için: [`docs/yeni_nesil_pos_proje_plani.md`](docs/yeni_nesil_pos_proje_plani.md).

## Yerel kullanım

Plan dosyası Markdown olarak okunur; kod henüz bu depoya taşınmadı (Faz 0 monorepo kurulumu plana göre yapılacak).

## GitHub’a gönderme

```powershell
cd d:\xampp\htdocs\NextPOS
git init
git add .
git commit -m "İlk yükleme: NextPOS proje planı"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/NextPOS.git
git push -u origin main
```

`KULLANICI_ADIN` ve depo adını kendi hesabınıza göre değiştirin; GitHub’da boş bir repo oluşturduktan sonra `git push` çalışır.
