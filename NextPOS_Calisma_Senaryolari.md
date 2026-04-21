# NextPOS Calisma Senaryolari

NextPOS

Sistem Çalışma Senaryoları

─────────────────────────────────────────

SaaS Admin  ·  Bayi  ·  POS

Uçtan uca operasyon akışları · Kullanıcı rolleri · Kritik senaryolar

🌐 BÖLÜM 1

SaaS Admin

10 Senaryo

🏢 BÖLÜM 2

Bayi

8 Senaryo

🍕 BÖLÜM 3

POS Operasyon

18 Senaryo

📋 Bu Doküman Hakkında

NextPOS'un 3 ana katmanındaki (SaaS Admin, Bayi, POS) tüm kullanıcı senaryolarını, operasyonel akışları ve sistem davranışlarını kapsamaktadır. Her senaryo; aktörü, adım adım eylemleri ve sistem tepkilerini içerir.

BÖLÜM 1

SaaS Admin

Platform sahibinin tüm sistemi yönettiği katman

👤 Aktör

Superadmin — Tüm tenantlara, bayilere ve sistem sağlığına erişimi olan platform sahibi. 2FA zorunlu.

S1.1 — Yeni Bayi Kaydı ve Aktivasyonu

Senaryo S1.1  [SaaS Admin]

Yeni Bayi Kaydı ve Aktivasyonu

1

SaaS Admin

admin.nextpos.app adresine giriş yapar, 2FA kodunu girer.

2

SaaS Admin

Sol menü → Bayiler → "+ Yeni Bayi" butonuna tıklar.

3

Sistem

Bayi kayıt formu açılır: Ad, E-posta, Telefon, Bölge, Komisyon Oranı (%10–30), Plan Erişim Yetkileri.

4

SaaS Admin

Formu doldurur → Kaydet.

→ Sistem slug otomatik üretir: "muster-bayi-berlin"

5

Sistem

Bayi kaydı oluşturulur. Geçici şifre ile aktivasyon e-postası gönderilir.

6

Bayi Yöneticisi

E-postadaki linke tıklar, şifresini belirler, 2FA kurar.

7

Sistem

Bayi paneli aktif olur. SaaS Admin dashboard'unda "Aktif Bayiler" sayacı +1 artar.

S1.2 — Yeni Restoran (Tenant) Oluşturma

Senaryo S1.2  [SaaS Admin]

Yeni Restoran (Tenant) Oluşturma

1

SaaS Admin

Tenantlar → "+ Yeni Tenant" formunu açar.

2

SaaS Admin

Restoran adı, slug (özperto-pizza), plan seçimi (Starter/Pro/Enterprise), bağlı bayi, fatura e-postası, trial süresi (14 gün) girer.

3

Sistem

Tenant kaydı oluşturulur. PostgreSQL'de tenants tablosuna yeni satır eklenir.

4

Sistem

Stripe'ta yeni müşteri kaydı oluşturulur (stripeCustomerId). Trial başlar.

5

Sistem

Restoran sahibine aktivasyon e-postası gönderilir: admin/geçici şifre.

6

Sistem

Seed verisi çalışır: Varsayılan şube, dil ayarları (DE/TR/EN), yazıcı şablonları oluşturulur.

7

SaaS Admin

İsterse "Masquerade" ile tenant admin olarak giriş yaparak kurulumu kontrol eder.

→ Her masquerade işlemi audit_logs tablosuna kaydedilir

S1.3 — Abonelik Planı Değiştirme

Senaryo S1.3  [SaaS Admin]

Abonelik Planı Değiştirme

1

SaaS Admin

Tenant listesinden "Özperto Pizza" seçer → Plan Değiştir.

2

SaaS Admin

Starter → Professional seçer → Onayla.

3

Sistem

Stripe API çağrısı yapılır: subscription güncellenir, fiyat farkı prorated olarak tahsil edilir.

4

Sistem

tenants tablosunda plan güncellenir. Yeni limitler (kullanıcı, şube, ürün) aktif olur.

5

Sistem

Socket.io ile tenant'ın aktif oturumlarına "plan:updated" olayı gönderilir.

→ Yeni özellikler anında aktif olur, restart gerekmez

6

Restoran Sahibi

Admin panelinde yeni özellikler (QR Menü, Mutfak KDS vb.) görünür hale gelir.

S1.4 — Tenant Askıya Alma

Senaryo S1.4  [SaaS Admin]

Tenant Askıya Alma (Ödeme Sounu)

1

Stripe Webhook

invoice.payment_failed olayı gelir → API endpoint tetiklenir.

2

Sistem

Tenant durumu "active" → "suspended" olarak güncellenir.

3

Sistem

Restoran sahibine uyarı e-postası ve in-app bildirim gönderilir.

4

Sistem

API'de tüm istekler 402 Payment Required döner. Aktif oturumlar sonlandırılır.

5

SaaS Admin

Manuel müdahale gerekirse: Tenantlar → Özperto → "5 Gün Uzat" seçer.

6

Restoran Sahibi

Ödemeyi gerçekleştirir → Stripe webhook "invoice.paid" → tenant otomatik aktif olur.

S1.5 — Komisyon Hesaplama ve Ödeme

Senaryo S1.5  [SaaS Admin]

Aylık Bayi Komisyon Hesaplama

1

Sistem (Otomatik)

Her ayın 1'inde cron job çalışır: Geçen ayki tüm Stripe ödemelerini çeker.

2

Sistem

Her tenant için: Ödeme tutarı × Bayi komisyon oranı = Brüt komisyon hesaplanır.

→ Örnek: €49.99 × %15 = €7.50

3

Sistem

reseller_commissions tablosuna ay bazlı kayıtlar oluşturulur.

4

SaaS Admin

Bayiler → Komisyonlar → "Bu Ay Ödenecekler" listesini görür.

5

SaaS Admin

Topluca veya tek tek "Ödendi İşaretle" butonuna tıklar. IBAN/havale notu girer.

6

Sistem

Bayi hesabına PDF komisyon raporu e-posta ile gönderilir.

S1.6 — Sistem Sağlığı ve Alarm Yönetimi

Senaryo S1.6  [SaaS Admin]

Sistem Sağlığı İzleme

1

Grafana / Sentry

API error rate %5'i geçince otomatik alarm tetiklenir.

2

Sistem

SaaS Admin'e e-posta + Slack bildirimi gönderilir.

3

SaaS Admin

admin.nextpos.app → Sistem Sağlığı sayfasını açar.

4

SaaS Admin

API uptime, DB bağlantı havuzu, Redis durumu, aktif WebSocket bağlantısı sayısını görür.

5

SaaS Admin

Sentry'den hata detayına gider, sorunlu tenant'ı tespit eder.

6

SaaS Admin

Gerekirse: "Bakım Modu" açar → Tüm tenant'lara banner bildirim gösterilir.

S1.7 — Abonelik Planı Düzenleme

Senaryo S1.7  [SaaS Admin]

Plan Fiyatı ve Limitlerini Güncelleme

1

SaaS Admin

Planlar → Professional planı seçer → Düzenle.

2

SaaS Admin

Max kullanıcı: 10 → 15, Aylık ücret: €49.99 → €59.99 olarak günceller.

3

Sistem

Stripe'ta plan güncellenir. Mevcut aboneler etkilenmez (grandfather clause).

→ Yeni aboneler yeni fiyatla başlar

4

Sistem

subscription_plans tablosu güncellenir. Tüm servis sayfaları dinamik olarak yeni fiyatı gösterir.

S1.8 — GDPR / Veri Silme Talebi

Senaryo S1.8  [SaaS Admin]

Tenant GDPR Silme Talebi

1

Restoran Sahibi

Aboneliği iptal eder, verilerinin silinmesini talep eder.

2

SaaS Admin

Tenantlar → Özperto → "GDPR Sil" → 30 günlük grace period başlatır.

3

Sistem

Tenant status: "cancelled". Tüm login'ler engellenir. 30 gün karantina.

4

Sistem (30 gün sonra)

Scheduled job çalışır: Müşteri verileri, siparişler, kullanıcılar anonymize edilir.

5

Sistem

audit_logs silinmez (yasal zorunluluk). Diğer tüm kişisel veri kaldırılır.

6

Sistem

Silme tamamlandı onayı restoran sahibine e-posta ile gönderilir.

S1.9 — Duyuru ve Bakım Penceresi

Senaryo S1.9  [SaaS Admin]

Planlı Bakım Duyurusu

1

SaaS Admin

Sistem → Duyuru Oluştur → Bakım 02:00–04:00 mesajı yazar.

2

Sistem

Socket.io ile tüm aktif oturumlara "announcement" olayı gönderilir.

3

Tüm Kullanıcılar

POS, garson, mutfak ekranlarında turuncu banner görünür.

4

SaaS Admin

Bakım saatinde "Maintenance Mode" açar.

5

Sistem

API 503 döner. Offline PWA'lar IndexedDB'den çalışmaya devam eder.

→ 48 saat offline desteği devreye girer

6

SaaS Admin

Bakım biter → Maintenance Mode kapanır → Sistem normal çalışmaya döner.

S1.10 — Audit Log İncelemesi

Senaryo S1.10  [SaaS Admin]

Güvenlik Audit Log Sorgusu

1

SaaS Admin

Güvenlik → Audit Loglar → Filtre: Tenant: Özperto, Eylem: payment.void, Tarih aralığı: Son 7 gün.

2

Sistem

audit_logs tablosundan filtrelenmiş kayıtlar listelenir: Kim, ne zaman, hangi IP'den, ne yaptı.

3

SaaS Admin

Şüpheli bir işlem görürse: İlgili kullanıcının hesabını kilitle butonuna tıklar.

4

Sistem

user.status = "suspended". Aktif token'lar invalidate edilir. Kullanıcı anında sistemden atılır.

BÖLÜM 2

Bayi (Reseller)

Bölgesel satış ortağının restoran müşterilerini yönettiği katman

👤 Aktör

Bayi Yöneticisi ve Bayi Destek — Kendi bölgelerindeki restoranları açan, takip eden ve teknik destek veren satış ortakları.

S2.1 — Bayi Paneline Giriş ve Dashboard

Senaryo S2.1  [Bayi Yöneticisi]

Bayi Paneline Giriş

1

Bayi Yöneticisi

admin.nextpos.app/reseller adresine gider, e-posta + şifre ile giriş yapar.

2

Sistem

JWT token üretilir, rol: reseller_admin. Sadece kendi tenant'larına ait veriler görünür (RLS aktif).

3

Bayi Yöneticisi

Dashboard'da görür: Aktif restoran sayısı, bu ayki komisyon, trial bitmek üzere olanlar, bekleyen destek biletleri.

4

Bayi Yöneticisi

"Bu hafta trial biten restoranlar" listesini açar → İletişime Geç butonuyla harekete geçer.

S2.2 — Yeni Restoran Açma

Senaryo S2.2  [Bayi Yöneticisi]

Bayi Tarafından Yeni Restoran Açma

1

Bayi Yöneticisi

Restoranlarım → "+ Yeni Restoran Aç" butonuna tıklar.

2

Bayi Yöneticisi

Restoran adı, sahip e-postası, şehir, telefon, seçilen plan ve trial gün sayısını girer.

3

Sistem

SaaS Admin API'si çağrılır: Tenant oluşturulur. Bağlı bayi otomatik olarak reseller_tenants tablosuna işlenir.

→ Komisyon ilişkisi bu noktada kurulur

4

Sistem

Restoran sahibine aktivasyon e-postası gönderilir. Bayi dashboard'unda yeni restoran listede görünür.

5

Bayi Yöneticisi

Restorana tıklayarak detay sayfasına gider → "Demo Modu Aç" seçeneğiyle potansiyel müşteriye 7 günlük demo açabilir.

S2.3 — Teknik Destek ve Sorun Çözme

Senaryo S2.3  [Bayi Destek Personeli]

Restoran Teknik Destek Talebi

1

Restoran Sahibi

Bayi destek hattını arar: "Yazıcı çalışmıyor, fiş çıkmıyor."

2

Bayi Destek

Bayi paneli → Restoranlar → Özperto Pizza → Yazıcı Durumu sekmesini açar.

3

Sistem

Son 10 yazdırma işleminin durumu listelenir: Başarılı/Başarısız, hata kodu.

4

Bayi Destek

"Test Yazdırma Gönder" butonuna tıklar.

→ BullMQ print queue'ya test job eklenir

5

Bayi Destek

Sorun devam ederse: "Yazıcı Bağlantı Bilgileri" güncelle → Yeni IP/port girer.

6

Sistem

branches.settings JSONB güncellenir. Değişiklik anlık yürürlüğe girer.

7

Bayi Destek

Destek Biletiyle kapanış notu ekler: "TCP bağlantı portu 9100→9101 güncellendi, sorun çözüldü."

S2.4 — Komisyon Raporu Görüntüleme

Senaryo S2.4  [Bayi Yöneticisi]

Aylık Komisyon Raporu

1

Bayi Yöneticisi

Finans → Komisyonlar → Ocak 2026 seçer.

2

Sistem

reseller_commissions tablosundan: Tenant bazlı ödeme tutarları, komisyon oranı, brüt komisyon listelenir.

3

Bayi Yöneticisi

Toplam: €328.50 komisyon görür. PDF İndir butonuna tıklar.

4

Sistem

Muhasebe formatında PDF oluşturulur: Restoran adı, plan, abonelik tutarı, komisyon oranı, komisyon tutarı.

5

Bayi Yöneticisi

"Ödeme Durumu: Bekleniyor" → SaaS Admin ödemeyi onaylayınca "Ödendi" olarak güncellenir.

S2.5 — Restoran Performans İzleme

Senaryo S2.5  [Bayi Yöneticisi]

Restoran Aylık Performans Takibi

1

Bayi Yöneticisi

Restoranlarım → Özperto Pizza → Detay → İstatistikler.

2

Sistem

Son 30 günün sipariş hacmi, ortalama sipariş değeri, aktif kullanıcı sayısı, son login tarihi gösterilir.

3

Bayi Yöneticisi

3 aydır sipariş hacmi %20 düşmüş bir restoran görür → "Neden?" analizi yapar.

4

Bayi Yöneticisi

Restoranı arar, QR Menü özelliğini henüz aktive etmediğini öğrenir → Eğitim planlar.

5

Bayi Yöneticisi

Demo linki oluşturur: "menu.nextpos.app/demo-ozperto" → Müşteriye sunar.

S2.6 — Trial → Ücretli Dönüşüm

Senaryo S2.6  [Bayi Yöneticisi]

Trial Süre Dönüşüm Süreci

1

Sistem

Trial bitimine 3 gün kala: Restoran sahibine + Bayi'ye otomatik e-posta gönderilir.

2

Bayi Yöneticisi

Dashboard'daki "Bu hafta trial bitmek üzere" listesinden restoranı açar.

3

Bayi Yöneticisi

"Ücretli Aboneliğe Geç" → Plan önerir: Professional (€49.99/ay).

4

Restoran Sahibi

Admin panelinde abonelik sayfasını açar, kart bilgilerini girer → Stripe ile ödeme yapar.

5

Sistem

Stripe webhook "invoice.paid" → Trial sona erer, ücretli abonelik başlar. reseller_commissions güncellenir.

6

Bayi Yöneticisi

Dashboard'da dönüşüm başarıyla kaydedilir. Komisyon takip başlar.

S2.7 — Alt Bayi Yönetimi

Senaryo S2.7  [Bayi Yöneticisi]

Alt Bayi Oluşturma ve Yönetme

1

Bayi Yöneticisi

Bayim → Alt Bayiler → "+ Alt Bayi Ekle".

2

Bayi Yöneticisi

Alt bayi için: Ad, e-posta, bölge (örn. Stuttgart Kuzey), komisyon oranı (%10) girer.

3

Sistem

parent_reseller_id bağlantısıyla alt bayi oluşturulur. Ana bayi komisyonunun %10'u alt bayiye aktarılır.

4

Alt Bayi

Kendi panelinde yalnızca kendi restoranlarını görür. Ana bayi tüm listeyi görür.

S2.8 — Masquerade (Restorana Destek Girişi)

Senaryo S2.8  [Bayi Destek]

Restoran Admin Olarak Giriş (Destek)

1

Bayi Destek

Restoranlar → Özperto → "Adına Giriş Yap (Destek)" butonuna tıklar.

2

Sistem

Audit log yazılır: "Bayi: Muster GmbH, Hedef: Özperto Pizza, Tarih: 28.03.2026 14:32, IP: 89.x.x.x"

3

Sistem

Geçici kısıtlı token üretilir: Sadece menü ve ayarlar görünür, ödeme ve kullanıcı işlemlerine erişim yok.

→ Token 30 dakika sonra otomatik expires

4

Bayi Destek

Restoran admin panelinde sorunlu menü öğesini görür, düzeltir.

5

Bayi Destek

Sağ üstte "Destekçi Modu" banner'ı her zaman görünür. "Oturumu Kapat" ile normal paneline döner.

BÖLÜM 3

POS Operasyonları

Restoran içi günlük işlemler — Kasiyer, Garson, Mutfak, Kurye, Müşteri

👥 Aktörler

Restoran Sahibi/Admin · Müdür · Kasiyer · Garson · Mutfak Personeli · Kurye · Müşteri (QR)

S3.1 — Günlük Kasa Açılışı

Senaryo S3.1  [Kasiyer]

Sabah Kasa Açılışı ve Sistem Hazırlığı

1

Kasiyer

Tablet/PC'yi açar. nextpos.app/pos adresine gider.

2

Kasiyer

PIN ekranı açılır. 6 haneli PIN'ini girer.

→ JWT token: 8 saat geçerli, offline 48 saat

3

Sistem

Menü, masa planı, müşteri listesi IndexedDB'ye çekilir (sync:pull). Offline hazırlık tamamlanır.

4

Kasiyer

Kasa Aç butonuna tıklar → Açılış kasa sayımını girer (€ 200.00).

5

Sistem

z_reports tablosunda yeni gün kaydı açılır. opening_cash: 200.00. Gün başlar.

6

Sistem

Socket.io bağlantısı kurulur. branch:{id} room'a katılır. Tüm bildirimler aktif.

S3.2 — Masa Seçimi ve Sipariş Alma

Senaryo S3.2  [Kasiyer / Garson]

Masada Sipariş Oluşturma Akışı

1

Kasiyer

Masa grid ekranında Masa 5'i görür (🟢 Boş). Tıklar → "Oturum Aç" seçer.

2

Sistem

table_sessions tablosuna yeni kayıt eklenir. Masa durumu: occupied. socket: table:status → "occupied"

3

Kasiyer

Kategori seçer (Pizza) → Margherita L'ye tıklar.

4

Sistem

Ürün detay popup: boyut seçilmiş (L), modifikasyonlar, notlar. Fiyat: €16.00.

5

Kasiyer

"Extra Käse +€0.50" ekler → Sepete Ekle.

6

Kasiyer

Bir tane daha Döner Teller ekler → Sipariş toplamı: €30.50.

7

Kasiyer

"Mutfağa Gönder" butonuna tıklar.

8

Sistem

orders tablosuna kayıt eklenir. order_items oluşturulur. Fiyatlar DB'den doğrulanır.

→ Fiyat manipülasyon koruması

9

Sistem

kitchen_tickets tablosuna fiş oluşturulur. socket: kitchen:new_ticket → KDS ekranına düşer.

S3.3 — Mutfak KDS Akışı

Senaryo S3.3  [Mutfak Personeli]

Mutfak KDS — Sipariş Hazırlama ve Teslim

1

KDS Ekranı

"Bekleyen" sütununda Masa 5 fişi belirir. 1× Margherita L (Extra Käse), 1× Döner Teller.

2

Mutfak Personeli

Fişe tıklar → "Hazırlanıyor" sütununa taşır.

→ startedAt timestamp kaydedilir

3

Sistem

5. dakikadan sonra fiş kenarı sarıya, 15. dakikadan sonra kırmızıya döner ve yanıp söner.

4

Mutfak Personeli

Yemekler hazırlanır → "Hazır" butonuna basar (Bump).

5

Sistem

socket: kitchen:ready → branch:{id} → Garson tabletinde bildirim: "🔔 Masa 5 Hazır!"

→ Ses bildirimi + toast + badge

6

Garson

Bildirimi görür → Masaya servis yapar → Uygulamada "Servis Edildi" işaretler.

7

Sistem

order_items.status: "served". KDS fişi "Tamamlandı" olarak kapanır. prepDuration kaydedilir.

S3.4 — Ödeme Alma

Senaryo S3.4  [Kasiyer]

Ödeme Alma — Nakit ve Kart

1

Kasiyer

Müşteri hesap ister → Masa 5 → Ödeme Al.

2

Kasiyer

Ödeme ekranı açılır: Ara Toplam €25.65, MwSt. %19: €4.85, Toplam: €30.50.

3

Kasiyer

Müşteri nakit öder → "Nakit" seçer → Alınan tutar: €50 girer.

4

Sistem

Para üstü hesaplanır: €19.50. Para çekmecesi açılır (socket: drawer:open).

5

Sistem

payments tablosuna kayıt. order.paymentStatus: "paid". Müşteri puanı: +30 puan. point_history kaydı.

6

Sistem

Fiş yazdırma: BullMQ print queue → ESC/POS yazıcı → Almanca fiş çıkar.

7

Sistem

Masa durumu: available. table_sessions kapanır. socket: table:status → "available"

S3.5 — Hesap Bölme

Senaryo S3.5  [Kasiyer]

Hesap Bölme (Split Bill)

1

Kasiyer

Masa 7 → Ödeme → "Hesap Böl" seçer.

2

Kasiyer

"Ürün Bazlı" seçer: 2 kişi için hangi ürünlerin ayrılacağını belirler.

3

Kasiyer

Kişi 1: Margherita L €16.00 + Cola €3.00 = €19.00. Kişi 2: Döner Teller €14.00 + Ayran €2.50 = €16.50.

4

Kasiyer

Kişi 1 kart öder → Stripe terminale yönlendirir.

5

Sistem

payments tablosuna 2 ayrı kayıt: method: "card" ve method: "cash". order.paymentStatus: "partial" → "paid".

6

Kasiyer

Kişi 2 nakit öder → Para üstü hesaplanır → 2 ayrı fiş yazdırılır.

S3.6 — Garson Ekranı — Masa Başı Sipariş

Senaryo S3.6  [Garson]

Garson Tablet ile Masa Başı Sipariş

1

Garson

nextpos.app/waiter adresini açar. PIN ile giriş yapar (Tablet PWA).

2

Garson

Kat planında Masa 3'ü görür (🟡 Sipariş Bekliyor). Tıklar.

3

Garson

Müşteri QR ile giriş yapmış: "Ahmet Y. — 125 Puan" bilgisi görünür.

4

Garson

Ürün arar → Pepperoni L ekler → Sipariş notuna "Acısız" yazar.

5

Garson

"Mutfağa Gönder" → Onay: "2× Pepperoni L (Acısız) — €28.00".

6

Sistem

socket: order:new → Mutfak + Kasiyer ekranlarına bildirim.

→ Garson doğrulama sonrası mutfağa gider

7

Garson

Masa 8'den gelen "🔔 Kellner rufen" bildirimini görür → Masaya gider.

S3.7 — Müşteri QR Menü ile Sipariş

Senaryo S3.7  [Müşteri + Garson]

Müşteri QR Menüden Sipariş Verme

1

Müşteri

Masadaki QR kodu telefonu ile tarar → menu.nextpos.app/masa5qr açılır.

2

Müşteri

Kişisel QR kartını göstererek giriş yapar. "Willkommen, Ahmet!" ekranı gelir.

3

Müşteri

Dil seçici: 🇩🇪→🇹🇷 değiştirir. Menü Türkçeye geçer.

4

Müşteri

"Son siparişlerim" bölümünden Margherita'ya tıklar → "Tekrar Sipariş Ver".

5

Müşteri

"Siparişi Gönder" → "Garsonunuz onayladıktan sonra mutfağa gidecek" mesajı.

6

Garson Tableti

socket: qr:order_request → Pop-up: "Masa 5 — Ahmet Y. — 1× Margherita L" Onayla/Reddet.

7

Garson

"Onayla" → socket: qr:order_approved → Müşteri ekranı güncellenir: "Siparişiniz mutfağa gönderildi 🎉"

8

Sistem

orders.source: "customer_qr". Mutfak KDS'e fiş düşer.

S3.8 — Paket Servis ve Kurye Atama

Senaryo S3.8  [Kasiyer + Kurye]

Paket Servis Siparişi ve Kurye Takibi

1

Kasiyer

Ekran üstü "Paket" modunu seçer. Müşteri telefonunu girer: +49 170 555 0001.

2

Sistem

Kayıtlı müşteri bulunur: "Ayşe K." — Favori adresi otomatik yüklenir.

3

Kasiyer

Ürünleri ekler → Mutfağa gönder.

4

Kasiyer

"Kurye Ata" butonuna tıklar → Mevcut kuryeler listelenir (GPS konuma göre sıralı).

5

Kasiyer

"Mehmet K." seçer → Ata.

→ socket: delivery:assigned → Kurye telefonuna bildirim

6

Kurye (Mobil)

nextpos.app/courier PWA'sında yeni sipariş görünür. Müşteri adı, adres, telefon, sipariş detayı.

7

Kurye

"Yola Çıktım" → "Kapıda" → "Teslim Ettim" durumlarını günceller.

8

Sistem

Her durum değişikliğinde kasiyer ekranı güncellenir. socket: delivery:status.

9

Kurye

Kapıda nakit tahsil eder → "Nakit: €30.50 alındı" işaretler. Güncelleme kasiyer ekranında görünür.

S3.9 — Offline Sipariş ve Senkronizasyon

Senaryo S3.9  [Kasiyer]

İnternet Kesilmesi — Offline Mod

1

Sistem

İnternet bağlantısı kesilir. POS header'da "⚡ OFFLINE" kırmızı badge görünür.

2

Kasiyer

Çalışmaya devam eder. Masa 6 için sipariş oluşturur.

→ IndexedDB'deki menü/masa cache'den çalışır

3

Sistem

order.offlineId: "uuid-abc-123" ile IndexedDB'ye kaydedilir. syncQueue'ya eklenir.

4

Kasiyer

Nakit ödeme alır → Ödeme de offline kaydedilir. Fiş USB yazıcıdan çıkar (yerel ağ, internet gerektirmez).

5

Sistem

İnternet geri gelir → Background Sync tetiklenir.

6

Sistem

syncQueue: önce siparişler → sonra ödemeler sırayla API'ye gönderilir.

7

Sistem

Sunucu offlineId kontrol eder: Duplicate mu? Hayır → Kaydeder. Sunucu ID döner → Yerel ID güncellenir.

8

Sistem

"✅ Senkronizasyon tamamlandı" toast + socket: sync:complete. Header yeşile döner.

S3.10 — Masa Taşıma ve Birleştirme

Senaryo S3.10  [Kasiyer / Garson]

Masa Taşıma ve Birleştirme

1

Kasiyer

Masa 3 dolu (2 kişi), Masa 7 dolu (4 kişi). Müşteriler birleşmek ister.

2

Kasiyer

Masa 3 → Birleştir → Masa 7 seçer → Onayla.

3

Sistem

Masa 3'ün tüm order_items'ları Masa 7'nin aktif session'ına taşınır.

4

Sistem

Masa 3: status → "available". Masa 7'nin adisyonu güncellenir: Tüm ürünler tek listede.

5

Sistem

socket: table:status → Garson ve kasiyer ekranları anlık güncellenir.

6

Kasiyer

Kasiyer müşteri masa değiştirdi durumunda: Masa 5 → Masa 9'a taşı. Sürükle-bırak ile kat planında hareket ettir.

S3.11 — İndirim ve Kupon Uygulama

Senaryo S3.11  [Kasiyer]

Sipariş İndirimi Uygulama

1

Kasiyer

Masa 4 → Ödeme → İndirim Uygula.

2

Kasiyer

"Yüzde İndirim: %10" seçer. Neden: "Müşteri şikayeti — geç servis".

3

Sistem

İndirim yetkisi kontrol edilir: Kasiyer → max %10, Müdür → max %25, Admin → sınırsız.

4

Sistem

Toplam güncellenir: €30.50 → €27.45. discountAmount: 3.05, discountType: "percent", discountReason kaydedilir.

5

Sistem

Audit log: "Kasiyer: Ahmet, İndirim: %10, Neden: Geç servis, Masa: 4, Tutar: -€3.05"

→ İndirim raporlarında görünür

S3.12 — Müşteri Tanıma ve Puan Sistemi

Senaryo S3.12  [Kasiyer]

Kayıtlı Müşteri — Puan Kazanma ve Harcama

1

Kasiyer

Sipariş tamamlanırken: "Müşteri Ekle" → Telefon numarasını girer: +49 170 123 4567.

2

Sistem

customers tablosunda eşleşme bulunur: "Ayşe K." — Tier: Gold — 340 Puan.

3

Kasiyer

Müşteri sorgulamasında: "25 puan harcamak istiyor musunuz? (€2.50 indirim)" → Onaylar.

4

Sistem

Puan harcama: -25 puan. point_history: type: "redeem". Sipariş toplamından €2.50 düşülür.

5

Sistem

Ödeme sonrası puan kazanma: Toplam €28.00 → +28 puan kazanılır. point_history: type: "earn".

6

Sistem

Müşteri bakiyesi güncellenir: 340 - 25 + 28 = 343 puan. totalSpent ve totalVisits artar.

S3.13 — Z Raporu ve Gün Kapanışı

Senaryo S3.13  [Kasiyer / Müdür]

Günlük Kasa Kapanışı (Z Raporu)

1

Kasiyer

Gün sonu → Kasa Kapat → Z Raporu butonuna tıklar.

2

Sistem

Tüm bekleyen senkronizasyonlar tamamlanır. Günün tüm verileri doğrulanır.

3

Sistem

Z raporu hesaplanır: Toplam sipariş sayısı, nakit/kart/online toplamları, MwSt. %7 / %19 ayrımı, indirimler, iadeler.

4

Kasiyer

Kasadaki fiziksel parayı sayar → "Kapanış Kasa Sayımı: €428.50" girer.

5

Sistem

Fark hesabı: Beklenen €432.00 – Gerçek €428.50 = -€3.50 açık. Uyarı gösterilir.

6

Sistem

z_reports tablosuna kayıt: tssSignature (KassenSichV imzası), zNumber: 47, closedAt kaydedilir.

7

Sistem

Z raporu fişi otomatik yazdırılır. PDF olarak admin paneline kaydedilir.

8

Sistem

daily_summaries tablosu güncellenir. Tüm masalar "available"'a döner. Gün sıfırlanır.

S3.14 — Stok Uyarısı ve Yönetimi

Senaryo S3.14  [Sistem + Kasiyer]

Düşük Stok Alarmı ve Ürün Pasifleştirme

1

Sistem

Sipariş tamamlandığında product_ingredients'taki bileşenler stoktan düşülür.

2

Sistem

"Mozzarella" stoku minimum seviyenin altına düşer (2 kg < 3 kg minimum).

3

Sistem

socket: stock:low → Admin + Kasiyer ekranına uyarı: "⚠️ Mozzarella stoku kritik!"

4

Kasiyer

Margherita pizzayı menüden geçici olarak kaldırmak ister.

5

Kasiyer

Ürün listesinde Margherita → Müsait Değil toggle'ını kapatır.

6

Sistem

products.isAvailable: false. socket: menu:updated → Tüm cihazlar (QR menü dahil) ürünü grileştirir.

7

Müdür

Stok yönetimi → Mozzarella → Stok Giriş: +5 kg. Tedarikçi: Müller GmbH, Maliyet: €4.50/kg.

8

Müdür

Margherita → Müsait toggle'ını açar → Menüde tekrar aktif olur.

S3.15 — Oturum Kapatma (Kiosk)

Senaryo S3.15  [Müşteri / Kasiyer]

Kiosk Tablet — Oturum Kapatma

1

Müşteri

Yemek bitti, hesabı ödendi. Kiosk tablette "Oturumu Kapat" butonuna tıklar.

2

Sistem

Kapanış modal'ı: Masa No, Kullanıcı, Sipariş sayısı, Toplam tutar özeti gösterilir.

3

Müşteri

"Oturumu Kapat & Ana Menüye Dön" butonuna tıklar.

4

Sistem

table_sessions.status: "paid", closedAt kaydedilir. Masa: "available". IndexedDB temizlenir.

5

Sistem

Spinning animasyonlu kapanış ekranı → 1.8 saniye → Bekleme/Dil seçim ekranına dönüş.

6

Sistem

socket: table:status → Garson ve kasiyer ekranında masa yeşile döner.

→ Sonraki müşteri için hazır

7

Kasiyer (Uzaktan)

Kasiyer ekranından da aynı masanın oturumunu kapatabilir: Masa → Kapat → Onay.

S3.16 — Garson Çağrı Sistemi

Senaryo S3.16  [Müşteri + Garson]

QR Menüden Garson Çağrı Akışı

1

Müşteri

QR menü alt barındaki "🔔 Kellner rufen / Garson Çağır" butonuna tıklar.

2

Sistem

service_calls tablosuna kayıt: tableId: 5, callType: "call_waiter", status: "pending".

3

Sistem

socket: qr:service_call → Garson tableti + Kasiyer ekranı.

→ Ses bildirimi + "Masa 5 Garson İstiyor" toast

4

Garson

Bildirimi görür → "Görüldü" işaretler → Masaya gider → "Tamamlandı" işaretler.

5

Sistem

service_calls.status: "completed". respondedAt kaydedilir. Müşteri ekranında "Garsonunuz geliyor" mesajı silinir.

6

Müşteri (Hesap)

"💰 Rechnung / Hesap İste (Kart)" → Kasiyere bildirim: "Masa 5 kart ile ödeme yapmak istiyor."

S3.17 — Admin Paneli — Menü Güncelleme

Senaryo S3.17  [Restoran Admin / Müdür]

Menü Yönetimi ve Çeviri Düzenleme

1

Admin

nextpos.app/admin → Menü Yönetimi → Pizzen kategorisi → Margherita → Düzenle.

2

Admin

Fiyat günceller: L (40cm): €16.00 → €17.00.

3

Admin

Çeviri sekmesi: 🇩🇪 Almanca açıklama günceller. 🇹🇷 Türkçe ve 🇬🇧 İngilizce ayrı girer.

4

Admin

"Kaydet" tıklar.

5

Sistem

DB güncellenir. Redis cache invalidate edilir (menu:{branchId} anahtarı silinir).

6

Sistem

socket: menu:updated → Tüm aktif cihazlar (POS, garson, mutfak, QR menü) yeni fiyatı çeker.

→ Tüm cihazlar 5 saniye içinde güncellenir

7

Admin

QR Menü önizleme butonuna tıklar → Güncel menüyü müşteri gözünden kontrol eder.

S3.18 — Çoklu İstasyon Mutfak Yönetimi

Senaryo S3.18  [Sistem + Mutfak Personeli]

Farklı Mutfak İstasyonlarına Sipariş Yönlendirme

1

Kasiyer

Masa 8 siparişi: 1× Margherita L (pizza), 1× Baklava, 2× Cola.

2

Kasiyer

"Mutfağa Gönder" butonuna tıklar.

3

Sistem

Ürün bazlı istasyon ataması: Margherita → kitchenStation: "hot" (Ana Mutfak). Baklava → "cold" (Soğuk Mutfak). Cola → "bar" (Bar).

4

Sistem

3 ayrı kitchen_ticket oluşturulur. Her istasyona ayrı fiş düşer.

5

Ana Mutfak KDS

Sadece pizza fişini görür. Bar sadece içeceği görür. Soğuk mutfak sadece baklavaı görür.

6

Bar Personeli

Kolayı hazırlar → Bump eder. socket: kitchen:ready → Garson "Cola hazır" bildirimi alır.

7

Ana Mutfak

Pizza hazır → Bump. Garson "Margherita hazır" bildirimi alır. Servis yapılır.

Senaryo Özeti — Tüm Senaryolar

Bölüm

Senaryo No

Başlık

Aktör

SaaS Admin

S1.1

Yeni Bayi Kaydı ve Aktivasyonu

SaaS Admin

SaaS Admin

S1.2

Yeni Restoran (Tenant) Oluşturma

SaaS Admin

SaaS Admin

S1.3

Abonelik Planı Değiştirme

SaaS Admin

SaaS Admin

S1.4

Tenant Askıya Alma

Stripe + Admin

SaaS Admin

S1.5

Aylık Bayi Komisyon Hesaplama

SaaS Admin

SaaS Admin

S1.6

Sistem Sağlığı İzleme

SaaS Admin

SaaS Admin

S1.7

Plan Fiyatı ve Limit Güncelleme

SaaS Admin

SaaS Admin

S1.8

GDPR Veri Silme Talebi

SaaS Admin

SaaS Admin

S1.9

Planlı Bakım Duyurusu

SaaS Admin

SaaS Admin

S1.10

Güvenlik Audit Log Sorgusu

SaaS Admin

Bayi

S2.1

Bayi Paneline Giriş ve Dashboard

Bayi Yöneticisi

Bayi

S2.2

Yeni Restoran Açma

Bayi Yöneticisi

Bayi

S2.3

Teknik Destek ve Sorun Çözme

Bayi Destek

Bayi

S2.4

Aylık Komisyon Raporu

Bayi Yöneticisi

Bayi

S2.5

Restoran Performans İzleme

Bayi Yöneticisi

Bayi

S2.6

Trial → Ücretli Dönüşüm

Bayi Yöneticisi

Bayi

S2.7

Alt Bayi Yönetimi

Bayi Yöneticisi

Bayi

S2.8

Masquerade Destek Girişi

Bayi Destek

POS

S3.1

Sabah Kasa Açılışı

Kasiyer

POS

S3.2

Masa Seçimi ve Sipariş Alma

Kasiyer / Garson

POS

S3.3

Mutfak KDS Hazırlama ve Teslim

Mutfak Personeli

POS

S3.4

Ödeme Alma (Nakit/Kart)

Kasiyer

POS

S3.5

Hesap Bölme

Kasiyer

POS

S3.6

Garson Tablet Sipariş

Garson

POS

S3.7

Müşteri QR Menü Siparişi

Müşteri + Garson

POS

S3.8

Paket Servis ve Kurye Atama

Kasiyer + Kurye

POS

S3.9

Offline Sipariş ve Senkronizasyon

Kasiyer

POS

S3.10

Masa Taşıma ve Birleştirme

Kasiyer / Garson

POS

S3.11

İndirim ve Kupon Uygulama

Kasiyer

POS

S3.12

Müşteri Tanıma ve Puan Sistemi

Kasiyer

POS

S3.13

Z Raporu ve Gün Kapanışı

Kasiyer / Müdür

POS

S3.14

Düşük Stok Alarmı

Sistem + Kasiyer

POS

S3.15

Kiosk Oturum Kapatma

Müşteri / Kasiyer

POS

S3.16

Garson Çağrı Sistemi (QR)

Müşteri + Garson

POS

S3.17

Menü Güncelleme ve Çeviri

Admin / Müdür

POS

S3.18

Çoklu İstasyon Mutfak Yönetimi

Sistem + Mutfak