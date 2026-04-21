# TestSprite: generate_code_and_execute Çalıştırma Rehberi

## 0) Ön koşullar

- TestSprite hesabında kredi olmalı (0 kredi ile TestSprite backend `403 You don't have enough credits` döner).
- Uygulama çalışıyor olmalı:
  - POS: `http://127.0.0.1:5173`
  - API: `http://127.0.0.1:5000`

## 1) Kredi kontrolü

TestSprite hesabı:
- Plan: Free
- Credits: 0

Kredi ekledikten sonra aşağıdaki adımlara geç.

## 2) Cihaz kilidi (DEVICE_MISMATCH) flakiness’i önleme

POS login sayfasında `?device=...` desteği var. TestSprite başlangıç URL’i olarak şu kullanılır:

- `http://127.0.0.1:5173/login?device=testsprite-device`

Ek olarak E2E için dev-only reset endpoint var:

- `POST http://127.0.0.1:5000/api/v1/dev/reset-devices`
  - body: `{ "tenantId": "a1111111-1111-4111-8111-111111111111" }`

## 3) generate_code_and_execute

TestSprite koşusu aşağıdaki prensiplerle başlatılır:

- `127.0.0.1` kullan (localhost yerine)
- Başlangıç URL’i `/login?device=testsprite-device`
- Tenant: `a1111111-1111-4111-8111-111111111111`
- Kullanıcılar:
  - admin/admin123 (PIN 123456)
  - cashier/kasa123 (PIN 111111)
  - waiter/garson123 (PIN 222222)
  - kitchen/mutfak123 (PIN 333333)

## 4) Sık görülen hatalar

### 4.1 403 You don't have enough credits
- Kök neden: hesapta kredi yok.
- Çözüm: billing üzerinden kredi/paket ekleme.

### 4.2 Tunnel ECONNRESET / Connection <uuid>
- Kök neden: ağ/proxy/firewall tüneli koparıyor.
- Çözüm: `tun.testsprite.com:8080` ve `tun.testsprite.com:443` allow-list, VPN kapat, farklı ağ/hotspot.

### 4.3 Tunnel kurulumu “fetch failed”
- Kök neden: TestSprite tünel kurulum adımı `tun.testsprite.com` ile HTTPS üzerinden konuşurken (443) engelleniyor.
- Hızlı kontrol:
  - `Test-NetConnection tun.testsprite.com -Port 443` → `True` olmalı
  - `Test-NetConnection tun.testsprite.com -Port 8080` → `True` olmalı
