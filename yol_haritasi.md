# TestSprite Hata Analizi ve Çözüm Yol Haritası

## 1) Sorun Özeti

Terminal çıktısında (`Terminal#895-1013`) TestSprite çalıştırması sırasında aşağıdaki kritik semptomlar görüldü:

- Tunnel açıldı ancak tekrar eden bağlantı hataları oluştu:
  - `Tunnel probe attempt ... failed: read ECONNRESET`
  - Çok sayıda `Connection <uuid>` hatası
  - `Remote error after ... ms`
- İlerleme sayaçları test tamamlanana kadar `0/15 Completed | 0 passed` seviyesinde kaldı.
- Test yürütmesi sonunda **15/15 test BLOCKED** raporlandı.

Ek kanıtlar:

- `testsprite_tests/tmp/raw_report.md`: tüm testler `TEST BLOCKED`, ortak hata: **SPA blank page / 0 interactive elements**.
- `testsprite_tests/tmp/test_results.json`: tüm vakalar aynı nedenle engellenmiş.

## 2) Kök Neden Analizi (RCA)

### 2.1 Birincil kök neden (en yüksek olasılık)

**TestSprite tünel/proxy katmanında ağ kararsızlığı veya kurumsal ağ engeli** nedeniyle uzaktan yürütülen test oturumları sağlıklı kurulamadı.

Kanıt:

- Çok sayıda düşük seviye bağlantı kopması (`ECONNRESET`) ve proxy remote error logları.
- Hata test adımlarından bağımsız olarak bütün testlerde aynı pattern’de.
- Aynı zaman aralığında tüm testlerin daha UI adımı başlamadan bloklanması.

### 2.2 İkincil etki

Tünel/proxy katmanı bozuluğu, tarayıcı tarafında bundle yükleme/SPA bootstrap adımını etkileyerek TestSprite ajanının “blank page” görmesine yol açtı.

### 2.3 Düşük olasılıklı alternatifler (elenen/azalan)

- **Uygulama servislerinin kapalı olması**: elendi (aşağıdaki doğrulamalarda servisler 200 dönüyor).
- **POS tarafında genel runtime crash**: düşük olasılık (yerel headless Playwright ile `/login` DOM elemanları görüldü).

### 2.4 Güncel engel: TestSprite kredi yetersizliği

Sonraki bir koşuda TestSprite backend şu hatayı döndürdü:

- `Backend error: 403 - You don't have enough credits`

Bu durum TestSprite tarafında test üretme/koşturma adımını tamamen durdurur. Çözüm:

- TestSprite dashboard üzerinden kredi/paket ekleme veya plan yükseltme.

### 2.5 Güncel engel: TestSprite tünel kurulumu “fetch failed”

Son koşuda TestSprite tünel kurulumu şu hatayla durdu:

- `McpTunnelError: Failed to set up testing tunnel: fetch failed`

Yerel ağ kontrolünde:

- `tun.testsprite.com:8080` erişilebilir
- `tun.testsprite.com:443` erişilemez

Bu durumda TestSprite tünel kurulum adımı tamamlanamaz ve testler başlayamaz. Çözüm:

- `tun.testsprite.com` için **443 ve 8080** outbound allow-list
- VPN/proxy kapalı deneme veya hotspot ile tekrar koşu

## 3) Uygulanan Teşhis ve Doğrulamalar

Bu turda yerelde aşağıdaki kontroller yapıldı:

### 3.1 Servis erişilebilirliği

- `http://127.0.0.1:5173/` → 200
- `http://127.0.0.1:5173/login` → 200
- `http://127.0.0.1:5173/qr/1` → 200
- `http://127.0.0.1:5000/api/v1/health` → 200
- `http://127.0.0.1:4001/` → 200
- `http://localhost:5176/saas-admin` → 200

### 3.2 SPA asset doğrulaması

- `http://127.0.0.1:5173/@vite/client` → 200
- `http://127.0.0.1:5173/src/main.tsx` → 200

### 3.3 Yerel headless browser kontrolü

Playwright ile `/login` açıldı:

- URL: `http://127.0.0.1:5173/login`
- `inputs`: `3`
- `errors`: `[]`

Sonuç: **Yerel makinede SPA render oluyor**; TestSprite run’ındaki blank page sorunu yerel app arızasından çok tünel/proxy katmanına işaret ediyor.

## 4) Ek Bulgular (Test Hazırlığı Açısından)

- Password login testleri (`admin`, `cashier`, `waiter`, `kitchen`) API’de 200 döndü.
- PIN login çağrıları bu turda 403 döndü (ayrıca raporlanmalı bir test bulgusu).
- Device lock politikası aktif:
  - Farklı `deviceId` ile login denemesinde `DEVICE_MISMATCH` alındı.
  - Aynı `deviceId` ile tekrar login başarılı.
- Yeni şube endpointi smoke:
  - `GET /api/v1/admin/branches` (admin token ile) başarılı (`count=1`, `max=3`).

## 5) Çözüm Önerileri (Aksiyon Planı)

## A) Acil (bugün)

1. **TestSprite’ı üretim modunda çalıştır**
- POS için `npm run build && npm run preview -- --host 127.0.0.1 --port 5173`
- Dev server yerine preview/build ile yeniden test.

2. **Ağ istikrarını doğrula**
- `tun.testsprite.com:8080` outbound erişimini firewall/proxy whitelist’e ekle.
- Kurumsal TLS interception varsa test oturumunda bypass/allow-list tanımla.

3. **TestSprite koşusunu tek uygulama-per-port olarak böl**
- 1. koşu: POS 5173
- 2. koşu: Reseller 4001
- 3. koşu: SaaS Admin 5176
- (opsiyonel) QR app 5177

## B) Kısa vade (1-3 gün)

4. **Test preflight script ekle**
- Port health check
- HTML + critical asset check (`/@vite/client`, `/src/main.tsx`)
- `/login` headless DOM check (input count > 0)
- Başarısızsa TestSprite run’ı başlatma.

5. **Stabil test tenant reseti**
- Her koşu öncesi seed/reset standardı
- Sabit `deviceId` kullanımı (device lock kaynaklı false negative önleme)

6. **PIN login için ayrı inceleme**
- 403 body/codes detaylandır
- lockout veya policy davranışı dokümante et

## C) Orta vade (1 hafta)

7. **CI test matrisi**
- Smoke (API + route + auth) her commit
- Nightly E2E (Playwright + TestSprite)

8. **Observability**
- Vite/Node loglarının test koşusu ile korelasyonlu toplanması
- Test başarısızlığında otomatik artefact (console log + network trace)

## 6) Önleme Stratejileri

- Test başlamadan otomatik “go/no-go” preflight.
- Network dependency’li testlerde fallback (yerel Playwright smoke).
- Tek sorumlu test environment profili (ports, host binding, seed data standardı).
- Device lock ve rate-limit gibi güvenlik kontrolleri için testte sabit device kimliği ve whitelistli test kullanıcıları.

## 7) Kapsamlı Test Analizi (Fonksiyon Bazlı)

Hedef kapsam:

- SaaS Admin
- Bayi (Reseller)
- POS Admin
- Kasiyer
- Mutfak
- Garson
- Masa QR
- Kurye
- Teslim/Handover

### 7.1 Senaryo matrisi

1. **Kimlik Doğrulama**
- Password login (4 rol)
- PIN login (4 rol)
- Logout sonrası protected route kontrolü

2. **Kasiyer**
- Ürün ekleme, ödeme tamamlama
- Geçersiz kupon hata mesajı
- Hata sonrası sipariş tamamlama

3. **Garson**
- Masa oturumu başlatma
- Sipariş ekleme, mutfağa gönderme
- Session persistence / geri dönme

4. **Mutfak**
- Sipariş görünürlüğü
- `preparing -> ready -> completed` statü akışı
- İstasyon filtreleme

5. **Kurye & Teslim**
- Atanmış teslimat listesi
- Pickup ve delivered adımları
- Handover ekranı entegrasyonu

6. **Masa QR**
- Misafir sipariş oluşturma
- Sepet adet güncelleme

7. **Admin Ayarlar / Şubeler**
- Listeleme
- Ekleme (kota doluysa 403)
- Güncelleme
- Silme (`id=1` engeli)

8. **Modül Kilidi Negatif Testleri**
- `inventory`, `courier_module`, `table_reservation`, `advanced_reports` kapalıyken API+UI davranışı

### 7.2 Bu turda doğrulananlar (kanıtlı)

- Servis erişimleri: **PASS**
- POS SPA asset yükleme: **PASS**
- `/login` yerel headless render: **PASS**
- Password login (admin/cashier/waiter/kitchen): **PASS**
- Device lock (`DEVICE_MISMATCH`) davranışı: **PASS (beklenen güvenlik davranışı)**
- Admin branches endpoint smoke: **PASS**
- PIN login: **FAIL (403)** → ayrı kök neden analizi gerekir.
- TestSprite 15 test: **BLOCKED** (tünel/proxy kaynaklı yüksek olasılık)

## 8) İyileştirme Listesi (Önceliklendirilmiş)

### P0
- TestSprite run öncesi production preview moduna geçiş.
- `tun.testsprite.com` whitelist + proxy/firewall kontrolü.

### P1
- Preflight script + otomatik fail-fast.
- PIN login 403 için ayrık debug bileti.

### P2
- Nightly test pipeline + artefact toplama.
- Test veri reset ve deviceId standardizasyonu.

## 9) Sonuç

Bu olayda ana sorun, uygulama işlevlerinden çok **TestSprite tünel/proxy bağlantı katmanı** ile ilişkili görünmektedir. Yerel kontroller uygulamanın temel işlevlerinin (en azından route/asset/password auth/branch API) çalıştığını gösteriyor. Tam kapsamlı E2E doğrulama için, ağ/tünel stabilizasyonu sonrası TestSprite koşusunun yeniden yürütülmesi zorunludur.
