# NextPOS Masa Siparişi Akış Senaryoları

Bu belge, NextPOS sistemindeki temel sipariş senaryolarının adım adım nasıl ilerlediğini ve arka planda sistemin (Socket, Database, Frontend) nasıl tepki verdiğini açıklamaktadır.

---

## Senaryo 1: Kasiyere Doğrudan Sipariş Verilmesi (Kasa Siparişi)
*Müşteri restorana girer, doğrudan kasaya yönelir ve siparişini verir.*

**1. Müşteri Siparişini İletir**
- Müşteri kasiyere "1 Porsiyon İskender, 1 Ayran" siparişi verir.
- **Sistemde Ne Olur:** Kasiyer, POS Terminal ekranından ürünleri seçer ve sepete (`CartPanel`) ekler. Bu aşamada veriler sadece tarayıcının yerel hafızasında (Zustand Store / IndexedDB) tutulur, sunucuya henüz veri gitmez.

**2. Kasiyer Masayı Seçer ve Siparişi Gönderir**
- Kasiyer "Masalar" bölümünden Müşterinin oturacağı masayı (Örn: Masa 5) seçer ve "Mutfağa Gönder" butonuna basar.
- **Sistemde Ne Olur:** 
  - Backend API'ye (`POST /api/v1/orders`) istek atılır.
  - Veritabanında (PostgreSQL) `table_sessions` tablosunda o masa için yeni bir oturum açılır (`status = 'active'`).
  - `orders` ve `order_items` tablolarına ürünler eklenir. `orders.status = 'confirmed'`, `order_items.status = 'sent_to_kitchen'` olur.
  - Mutfak (KDS) istasyonuna özel `kitchen_tickets` tablosuna bilet oluşturulur.
  - **Socket.io:** Backend, o mağazadaki tüm cihazlara `order-created` ve `table-updated` socket mesajı fırlatır. KDS ekranı ve Garson tabletleri anında güncellenir. Masa rengi "Yeşil" (Boş) durumdan "Kırmızı" (Dolu) durumuna geçer.

**3. Mutfak Süreci ve Teslimat**
- Mutfak (KDS) personeli, siparişi hazırlar ve ekrandan "Hazır" olarak işaretler.
- **Sistemde Ne Olur:** Backend, `order_items.status = 'ready'` yapar. Socket üzerinden kasiyer ve garson cihazlarına `order-ready` (Sipariş Hazır) bildirimi düşer.

---

## Senaryo 2: Garsona Sipariş Verilmesi (Klasik Restoran Deneyimi)
*Müşteri masaya oturur, garson elindeki mobil cihaz/tablet ile masaya gidip siparişi alır.*

**1. Müşteri Masaya Oturur ve Garson Ekranı Açar**
- Garson elindeki tabletten "Salon 1 -> Masa 12" ye tıklar.
- **Sistemde Ne Olur:** Garson masaya tıkladığı anda sistem **Pessimistic Lock (Masa Kilitleme)** mekanizmasını devreye sokar ("Ahmet işlem yapıyor" uyarısı). Bu sayede kasiyer veya başka bir cihaz o masaya o saniyelerde sipariş girip veri çakışmasına (Concurrency) sebep olamaz.

**2. Siparişin Tabletten Girilmesi**
- Garson ürünleri ve zorunlu varyasyonları (Örn: Az Pişmiş, Acısız) seçip "Gönder" butonuna basar.
- **Sistemde Ne Olur:** 
  - İstek API'ye garsonun yetki token'ı ile düşer. 
  - Kasiyer senaryosunda olduğu gibi `table_sessions` açılır, sipariş DB'ye yazılır.
  - **Socket.io:** Saniyesinde mutfak ekranına (KDS) sesli bildirimle bilet düşer. Kasiyer ana makinesindeki masa planında masa anında kırmızı (Dolu) olur.

**3. İlave Sipariş Girilmesi (Upsell)**
- Müşteri 15 dk sonra "Bir çay alabilir miyiz?" der. Garson tekrar Masa 12'ye girer.
- **Sistemde Ne Olur:** Sistem `orders` tablosunda o masaya ait "Açık Oturumu" bulur. Sadece yeni çay ürünü `order_items` tablosuna eklenir (Append). Yeni bir mutfak fişi sadece "İçecek/Bar" istasyonuna gönderilir. Eski mutfak fişleri (yemekler) tekrar yazdırılmaz.

**4. Hesabın İstenmesi**
- Garson "Hesap Yazdır" (Request Bill) butonuna basar.
- **Sistemde Ne Olur:** `table_sessions.status = 'bill_requested'` olur. Socket üzerinden tüm cihazlara masa durumunun değiştiği iletilir. Masanın rengi "Sarı" döner. Kasiyer ekranına sesli bir bildirim (Masa 12 Hesap İstedi) düşer. Kasiyer ödemeyi aldığında masa kapanıp tekrar "Yeşil" (Boş) hale gelir.

---

## Senaryo 3: Müşterinin QR Menüden Sipariş Hazırlaması ve Garson Onayı
*Müşteri masadaki QR kodu okutur, telefondan kendi sepetini oluşturur ancak sipariş mutfağa doğrudan gitmez, garson onayı gerekir.*

**1. Müşterinin QR Okutması ve Menüyü Görüntülemesi**
- Müşteri telefon kamerasından "Masa 8" e tanımlı QR kodu okutur.
- **Sistemde Ne Olur:** Next.js Müşteri arayüzü açılır. Sistem JWT veya Cookie ile müşterinin "Masa 8" de olduğunu algılar. Müşteri menüyü incelemeye başlar. Frontend doğrudan Next.js üzerinden SEO ve hız odaklı (Cache/ISR) çalışır.

**2. Müşterinin Sepet Oluşturup Göndermesi**
- Müşteri "2 Hamburger, 2 Kola" seçer ve "Siparişi Gönder" butonuna tıklar.
- **Sistemde Ne Olur:**
  - İstek `POST /api/v1/qr/orders` uç noktasına gider.
  - Veritabanına sipariş yazılır **FAKAT** statüsü `status = 'pending_approval'` (Onay Bekliyor) olarak işaretlenir.
  - Mutfak ekranına (KDS) **HİÇBİR BİLGİ GİTMEZ**. 
  - **Socket.io:** Backend, o bölgeye bakan Garsonun tabletine ve Kasiyere `qr-order-pending` mesajı atar. Garsonun tabletinde Masa 8 turuncu renkte yanıp sönerek uyarı verir: "Masa 8'den QR Siparişi Geldi!".

**3. Garsonun Siparişi Onaylaması (veya Reddetmesi)**
- Garson masaya gider, müşteriden teyit alır (yanlış basma ihtimaline karşı). Tabletinden siparişin detayına girip "Onayla" butonuna basar.
- **Sistemde Ne Olur:**
  - İstek `POST /api/v1/orders/:id/approve` API'sine düşer.
  - Sistem `orders.status` değerini `confirmed` olarak günceller.
  - İşte **tam bu aşamada** sistem mutfak biletini (`kitchen_tickets`) üretir.
  - **Socket.io:** Mutfak KDS ekranına "Hazırlanacak Ürünler" olarak düşer. 
  - Aynı anda, Müşterinin telefonundaki QR sipariş takip ekranına (socket üzerinden) bildirim gider ve müşterinin telefonundaki durum canlı olarak "Bekliyor" durumundan "Hazırlanıyor" (Preparing) durumuna geçer.

---

## Senaryo 4: Gel-Al (Takeaway) Siparişi
*Müşteri kasaya gelir veya restorana uğrar, paket olarak alıp gideceğini belirtir.*

**1. Siparişin Girilmesi**
- Kasiyer ürünleri sepete ekler ve Sipariş Tipi'ni "Gel-Al" (Takeaway) olarak seçer. Müşteri ismi alınır.
- **Sistemde Ne Olur:** Bu senaryoda **hiçbir masa oturumu açılmaz** (`table_sessions` tablosuna kayıt atılmaz). Doğrudan `orders` tablosuna `order_type = 'takeaway'` olarak yazılır.

**2. Mutfak ve Hazırlık**
- **Sistemde Ne Olur:** Mutfak (KDS) ekranında bu fişin üstünde devasa bir **"PAKET / GEL-AL"** etiketi belirir. Mutfak personeli yemeği tabaklara değil, paket servis kutularına koyması gerektiğini anlar.
- Ürün "Hazır" olarak işaretlendiğinde, Socket.io kasiyere "Ahmet Bey'in Gel-Al Siparişi Hazır" şeklinde bildirim gönderir.

---

## Senaryo 5: Paket Servis (Delivery) ve Kurye Ataması
*Müşteri siparişi telefonla veya uygulamadan eve teslimat olarak ister.*

**1. Siparişin Alınması ve Adres Teyidi**
- Kasiyer siparişi oluşturur, müşterinin telefon numarası ve teslimat adresi girilir. `order_type = 'delivery'` olarak ayarlanır.
- **Sistemde Ne Olur:** `orders` tablosuna sipariş eklenirken, arka planda bu siparişin bir kuryeye atanabilmesi için özel bir Delivery/Kurye kuyruğuna da (`deliveries` tablosuna) ön kayıt atılır.

**2. Mutfak İşlemi ve Kurye Seçimi**
- Mutfak siparişi hazırlar ve KDS'den onaylar.
- **Sistemde Ne Olur:** Sipariş durumu `ready` (Hazır) olur olmaz, Kasiyer ekranındaki "Kurye Yönetimi" panelinde belirir. Kasiyer, müsait olan "Ahmet (Kurye)" kullanıcısını seçer. Sisteme `POST /api/v1/deliveries/assign` isteği atılır.
- **Socket.io:** Kuryenin cep telefonundaki "Kurye App" veya paneline sesli bildirim gider: "Yeni Teslimat Atandı".

**3. Teslimat ve Kapanış**
- Kurye adrese gider, yemeği teslim eder ve uygulamasından "Teslim Edildi"ye basıp ödemenin Nakit mi yoksa Kredi Kartı mı olduğunu seçer.
- **Sistemde Ne Olur:** Siparişin statüsü `delivered` olarak güncellenir ve ödeme tutarı otomatik olarak restoranın o günkü Z Raporu (Kasa) bakiyesine işlenir. Kasiyerin işlemi elle kapatmasına gerek kalmaz.

---

## Senaryo 6: Caller ID (Telefonla Çağrı Gelmesi)
*Müşteri, restoranın sabit veya cep hattını arar.*

**1. Aramanın Gelmesi**
- Restorandaki analog/VoIP hat çalar. Donanımsal veya yazılımsal Caller ID cihazı numara bilgisini yakalar.
- **Sistemde Ne Olur:** Local ağdaki küçük bir entegrasyon uygulaması, NextPOS backend'ine numarayı iletir. Backend `customers` tablosundan bu telefon numarasını sorgular.

**2. Kasiyer Ekranına Düşmesi**
- **Socket.io:** Kasiyer terminaline anında `incoming-call` event'i düşer. Ekranın sağ üst köşesinde "Arıyor: 0532 *** ** ** (Ahmet Yılmaz)" pop-up'ı belirir.
- **Sistemde Ne Olur:** Kasiyer pop-up'a tıkladığında sistem müşterinin eski adreslerini, en çok sipariş verdiği ürünleri ve bakiyesini tek bir ekranda getirir. Adresi sormadan direkt sipariş taslağı açılır.

---

## Senaryo 7: WhatsApp Chatbot Siparişi
*Müşteri restoranın resmi WhatsApp numarasına "Sipariş vermek istiyorum" yazar.*

**1. Müşterinin Bot ile Etkileşimi**
- Müşteri WhatsApp'tan yazar. Meta (Cloud API) üzerinden NextPOS Backend Webhook'una anlık POST isteği gelir.
- **Sistemde Ne Olur:** Sistem otomatik bir cevapla müşteriye QR menü linkini atar. (Örn: "Siparişinizi oluşturmak için bu linke tıklayın.") Müşteri linkteki Next.js sepetinden ürünlerini ekleyip adresini girer.

**2. Siparişin Kasaya Düşmesi**
- Müşteri "Onayla" dediğinde sipariş `source = 'whatsapp'` ve `order_type = 'delivery'` olarak veritabanına kaydedilir.
- **Socket.io:** Kasiyer ekranında farklı bir bildirim sesiyle "WhatsApp Siparişi Geldi" ibaresi yanıp söner. 
- Mutfak KDS'ine sipariş anında düşmez (fake siparişleri engellemek için). Kasiyer detayları kontrol eder, "İşleme Al" butonuna bastığında sipariş resmen Mutfağa (KDS) transfer edilir.

---

## Senaryo 8: Web Online Sipariş (Instagram/Web Sitesi)
*Müşteri doğrudan restoranın web sitesine veya Instagram'daki Sipariş linkine tıklar.*

**1. Web Sitesinde Gezinme ve Ödeme**
- Müşteri mağaza front-end'inde ürünleri sepete atar, paket teslimat adresini girer.
- **Sistemde Ne Olur:** Sipariş oluşturulmadan önce sistem Stripe veya Iyzico API ile müşterinin kredi kartından tahsilat yapar. 

**2. Siparişin Restorana İletilmesi**
- Tahsilat başarılı olduğunda, NextPOS API'sine `payment_status = 'paid'` (Ödendi) ve `source = 'web'` olarak sipariş kaydı atılır.
- **Socket.io:** Web siparişleri ödemesi alınmış olduğu için kasiyer onayına ihtiyaç duymaz. Doğrudan Mutfak (KDS) ekranına ve Kasiyerin Paket Servis sekmesine "Online Ödendi - Hazırlanacak" ibaresiyle düşer. Mutfak anında hazırlığa başlar.

---

## Senaryo 9: Sipariş İptali ve İade Akışı
*Müşteri sipariş ettiği üründen vazgeçer veya yanlış sipariş girilmiştir.*

**1. Kasiyerin/Garsonun İptal Talebi**
- **Sistemde Ne Olur:** Eğer ürün henüz mutfağa gönderilmemişse (status: `pending`), doğrudan sepetten silinebilir. Ancak ürün mutfağa gönderilmişse (`sent_to_kitchen` veya `ready`), doğrudan silinemez. Kasiyer veya garson ürünü silmek istediğinde ekrana bir "Yetki/PIN Kodu" modalı açılır.

**2. Yetki Onayı ve İptal İşlemi**
- Yetkili personel (Şef/Admin) PIN kodunu girer. İptal sebebi seçilir (Örn: "Müşteri vazgeçti", "Yanlış ürün").
- **Sistemde Ne Olur:** `order_items` tablosunda o ürünün status'ü `cancelled` olarak güncellenir. Müşteriden ödeme alınmışsa geri iade (Refund) akışı başlatılır.
- **Socket.io:** KDS (Mutfak) ekranından o ürün silinir ve mutfak personeline anlık **"İPTAL EDİLDİ - [Ürün Adı]"** şeklinde kırmızı, sesli bir flaş bildirim gösterilir. Boşa yemek yapılmasının önüne geçilir.
- Z Raporu ve Audit Log için bu iptal işlemi, girilen iptal sebebi ve yetkilinin ID'si ile birlikte kayıt altına alınır.

---

## Senaryo 10: Parçalı Ödeme ve Hesap Bölme (Alman Usulü)
*Kalabalık bir grup, hesabı kendi yediklerine veya eşit tutarlara bölerek ödemek ister.*

**1. Müşterilerin Hesabı Bölmek İstemesi**
- Müşteriler kasaya gelir ve "Biz hesabı ayrı ayrı ödeyeceğiz, ben sadece kendi yediğim Hamburger'i ödeyeceğim" der.

**2. Parçalı Tahsilat İşlemi**
- Kasiyer, masanın ödeme ekranını açar ve "Hesap Böl / Ürün Seç" moduna geçer. Listeden sadece "Hamburger" ve "Kola"yı seçer, "Nakit/Kart Tahsil Et" butonuna tıklar.
- **Sistemde Ne Olur:** Veritabanında `payments` tablosuna o sipariş (`order_id`) için 1. ödeme kaydı girilir. Siparişin `paid_amount` (ödenen tutar) kısmı artar ancak `total_amount`'a (toplam tutar) ulaşmadığı için sipariş henüz tam kapanmaz.
- Masanın durumu hala Kırmızıdır, ancak bakiye kalan tutar kadar güncellenmiştir.

**3. Hesabın Tamamen Kapanması**
- Kalan tutarlar da diğer müşteriler tarafından ödendiğinde (`paid_amount == total_amount`), sistem otomatik olarak masayı (`table_sessions`) sonlandırır.
- **Socket.io:** Masanın rengi tüm cihazlarda Yeşile (Boş) döner.

---

## Senaryo 11: Masa Birleştirme ve Taşıma
*Müşterilerin yer değiştirmesi veya grupların birleşmesi durumu.*

**1. Masa Taşıma (Transfer)**
- Müşteri Masa 1'den kalkıp cam kenarındaki Masa 10'a geçmek ister.
- Kasiyer veya Garson, ekrandan Masa 1'e basılı tutar (veya Taşı der) ve hedef olarak Masa 10'u seçer.
- **Sistemde Ne Olur:** `table_sessions` tablosunda ilgili oturumun `table_id` değeri Masa 10 olarak güncellenir.
- **Socket.io:** Tüm cihazlara `table-transferred` event'i fırlatılır. Kasiyer ve Garson ekranlarında Masa 1 yeşile dönerken, Masa 10 anında kırmızı (ve o anki adisyon bakiyesiyle) görünür.

**2. Masa Birleştirme (Merge)**
- Masa 2'deki grup, Masa 3'teki arkadaşlarıyla birleşmek ister.
- Kasiyer Masa 2'deki adisyonu Masa 3'e aktarır.
- **Sistemde Ne Olur:** Masa 2'nin `order_items` tablosundaki tüm satırları, Masa 3'ün aktif `order_id`sine aktarılır. Masa 2'nin oturumu kapatılır (Yeşil). İşlem tüm ekranlarda eşzamanlı yansır.

---

## Senaryo 12: Offline (Çevrimdışı) Çalışma ve Senkronizasyon
*Restoranın internet altyapısı çökerse işleyişin durmaması.*

**1. İnternet Kesintisi Algılaması**
- Restoranın internet bağlantısı kopar. PWA altyapılı POS terminali ve Garson tabletleri internetin gittiğini algılar ve **Offline Mode**'a geçer. Ekranlarda "Çevrimdışı Modda Çalışıyorsunuz" uyarısı belirir.

**2. Sipariş Alımına Devam Edilmesi**
- **Sistemde Ne Olur:** Kasiyer sipariş almaya devam eder. Tüm `orders`, `order_items` ve `payments` verileri tarayıcının yerel **IndexedDB** veritabanına kaydedilir.
- KDS (Mutfak Ekranı) bulut tabanlı çalıştığı için geçici olarak düşebilir, ancak POS kasası yerel ağ (Local IP) üzerinden doğrudan Mutfak Yazıcısına (Termal Yazıcı) yazdırma emri gönderebildiği için mutfağa fiziksel adisyon fişi çıkarak üretim devam eder.

**3. Limit Kontrolü (48 Saat Kuralı)**
- Kural gereği, sistem en fazla 48 saat internet olmadan çevrimdışı çalışabilir. Sistem saatine göre 48 saat dolduğunda ve sunucudan lisans pingi alınamadığında sistem "Yeni Sipariş" girişini kilitler. Yalnızca mevcut masaların ödemesinin alınmasına izin verilir.

**4. İnternetin Gelmesi ve Senkronizasyon (Senkron Modu)**
- İnternet geri geldiğinde (Online Mode), POS terminali arka planda BullMQ veya Service Worker üzerinden senkronizasyon kuyruğunu başlatır.
- IndexedDB'de biriken tüm Offline kayıtlar, `timestamp` (zaman damgası) değerlerine göre backend'e toplu (batch) olarak gönderilir (`POST /api/v1/sync/offline-data`).
- **Çakışma Önleme (Concurrency):** İki farklı çevrimdışı cihaz aynı masada işlem yaptıysa, bulut sunucusu "Zaman Damgası" ve "Kasiyer Önceliği" kurallarına göre birleştirme yaparak ana veritabanını günceller.
