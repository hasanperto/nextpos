# POS UX / Erişilebilirlik / Performans Denetimi (İşleyiş Odaklı)

## Kapsam
- POS ekranları (kasiyer terminali, masa/menü, adisyon/sepet, mutfak, garson, kurye, teslim/handover, admin panelleri).
- Hedefler: anlaşılır Türkçe hata mesajı, kritik işlemlerde onay, dokunmatik uyum, klavye kısayolları, WCAG 2.1’e yaklaşım, hızlı tepki.

## Bu turda uygulanan iyileştirmeler
- Kart ödeme için onay ekranı eklendi (kritik işlem): CartPanel.
- Mutfak bilet iptali `window.confirm` yerine erişilebilir confirm modal ile yapıldı.
- Confirm modal’da Tailwind dinamik sınıf problemi giderildi + ESC/Enter + aria dialog + focus.
- Ürün arama input’una erişilebilir etiket eklendi + hızlı kısayollar (F3 arama, Ctrl/Cmd+F, F2 sepet, Esc temizle/kapat).
- Ürün araması debounce edildi (render baskısını azaltır).
- Admin panellerinde `window.confirm` kaldırılıp tek tip confirm modal’a geçirildi (şube/rezervasyon/teslimat bölgesi/personel/menü/kampanya/kat planı).
- `alert()` çağrıları kaldırılıp toast tabanlı rehberli mesajlara çevrildi.
- Garson ekranında QR sipariş reddetme işlemine onay eklendi.
- Kurye ekranında sipariş iptali `window.prompt` yerine iptal nedeni alınan modal ile yapıldı.
- Online sipariş (B2B) iptali/iade akışlarında `window.prompt` kaldırıldı, iptal nedeni modal ile alınıyor.
- İkon-only butonlara `aria-label`/`title` iyileştirmeleri (örn. yenile/sil/düzenle/kapat).
- Garson üst bar etiketlerinde minimum yazı boyutu artırıldı (8–9px → 10px).
- Ek turda ikon-only etiketleme kapsamı genişletildi (müşteri/rezervasyon/reçete/ayarlar/backup/plan ekranları).
- Seçili SaaS ekranlarında 9px etiketler 10px’e çıkarıldı (ör. plan rozetleri, yedek zaman etiketi).
- Terminal bileşenlerinde 8–9px etiketler asgari 10px’e yükseltildi (sepet, masa grid, personel modalları, caller/WA).
- Form içi olmayan butonlarda `type="button"` + ikon butonlarda `aria-label/title` standardı genişletildi (özellikle CartPanel).
- `ProductGrid` varyant etiketlerinde minimum font 10px oldu, yoğun varyantta butonlar 3 kolon grid’e geçiyor.

## Öne çıkan bulgular (kalan işler)

### 1) Erişilebilirlik (WCAG 2.1)
- Birçok yerde 9–10px etiketler var; bu boyutlar uzun kullanımda okunabilirlik sorununa yol açar.
- İkon-only butonlarda `aria-label`/`title` eksikleri var (özellikle admin panelleri ve bazı modallar).
- `window.confirm` kaldırıldı, ancak aynı standardın “iade/iptal” gibi tüm kritik akışlarda da tutarlı uygulanması gerekiyor.

### 2) UX / İşleyiş
- Bazı hata durumlarında mesajlar “ERROR” gibi yönlendirmesiz; kullanıcıya “ne yapayım” demiyor.
- Kritikleri (ödeme/iade/iptal) standart bir “onay + sonuç + kanıt/log” pattern’ına bağlamak gerekiyor.

### 3) Performans (2 sn altı hedefi için)
- Ürün arama/filtreleme yoğun grid’lerde debounce dışında “liste sanallaştırma (virtualization)” ihtiyacı olabilir.
- Bundle boyutları yüksek (POS ~3.4MB). Çok cihazlı/düşük donanımda ilk yük hissedilir.
- 2 saniye altı hedefi için backend sorgularının indeksleri + caching + offline queue davranışlarının ölçülmesi gerekir.

## Önerilen standartlar (tek tip davranış)
- Confirm: tek tip modal (ESC kapatır, Enter onaylar, fokus yönetimi vardır).
- Error: tek tip “sebep + çözüm” Türkçe mesajı.
- Touch: minimum 44px hit target, hover’a bağımlı olmayan aksiyonlar.
- Keyboard: F3 arama, F2 sepet, Esc kapat/temizle, ödeme ekranlarında method kısayolları.
