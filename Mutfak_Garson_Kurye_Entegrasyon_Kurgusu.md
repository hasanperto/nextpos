# 🍴 NextPOS — Merkezi Mutfak, Garson ve Kurye Senkronizasyonu Kurgusu (V2 - Geliştirilmiş Master Plan)

Bu belge, bir siparişin yaratılmasından mutfak işlemlerine, oradan da servis edileceği noktaya (Masaya garsonla, eve kuryeyle veya kasadan elden) kadar olan uçtan uca akış mimarisini özetler. Hata toleransı (Fault-Tolerance) ve SLA (Service Level Agreement) kısıtlamaları eklenmiştir.

---

## 1. Girdi / Kaynak Katmanı (Sipariş Nereden Geliyor?)

Sistem 4 farklı hattan sipariş kabul eder:
1. **Garson Tableti (`WaiterPanel`)**: Müşterinin masasından alınır. (`order_type: dine_in`)
2. **QR Menü**: Müşteri masadan direkt okutur. Garsona "Onay"a düşer.
    *   *Güvenlik Ağı (Fallback):* Eğer garson 2 dakika içerisinde QR siparişini onaylamazsa, sipariş yetkisi Kasiyer ekranına da düşer ("Onaylanmamış QR Siparişi!").
3. **Kasiyer Terminali (`PosTerminal`)**:
   - Müşteri bekliyordur veya telefonla sipariş vermiştir (Gel-Al).
   - Müşteri adrese istiyordur. Kasiyer adresi girer. (Paket)
4. **WhatsApp Botu / Online Sipariş**: Sistem API'si ile panele düşer (Kasiyer onaylar).

---

## 2. Mutfak Paneli Katmanı (`KitchenMonitor`) Mimarisi ve SLA

KDS (Kitchen Display System), "Kısmi Teslimat", "Undo (Geri Al)" ve "Offline Çalışma" özelliklerini barındıracak.

### 2.1 İleri Düzey Statü Yönetimi
*   **A. SLA Süre Aşımı Uyarısı:** Parça "Hazırlanıyor" aşamasında 15 dakikayı geçerse kart çerçevesi TURUNCUYA, 20 dakikayı geçerse KIRMIZIYA dönüp titremeye (Pulse) başlar.
*   **B. "İPTAL" Senaryosu Katmanı:** Kasiyer kasadan yiyeceği menüden silerse (veya iade ederse), sipariş durumu anında `socket_io` üzerinden mutfağa yansır ve KDS üzerindeki kart "⛔ İPTAL EDİLDİ" formatına bürünerek kararır. Mutfak stoğu ve sarfiyatı boşuna hazırlamaz.
*   **C. Kısmi Teslimat (Partial Ready):** Şefler fişin bütününü değil, fişteki *münferit ürünlerin* yanındaki check-box'ları işaretleyebilir. (Örn: Çorba bitti, Ana Yemek bekliyor). Masadaki o ürün kısmı "Hazır" bildirimi fırlatır.

### 2.2 Tamamlananlar ve Geri Al (Undo) Paneli
Ekranın sağında yahut üstünde (açılır kapanır formda) **Tamamlananlar Strip'i** yer alır.
*   Eğer şef "Servise Gönder / Hazır" butonlarına yanlışlıkla basarsa, biletler hemen ana ekrandan silinmez. Bu Strip içerisine yerleşir.
*   Kartın üzerinde bir **"↩ Geri Al"** butonu bulunur. Tıklanarak bilet hatasız biçimde tekrar "Hazırlanıyor" (Sarı) veya "Hazır" (Yeşil) durumuna restore edilir. Garson tarafındaki bildirim iptal/restore sinyaline göre kendini günceller.

### 2.3 Offline Pending Kuyruğu
*   KDS'nin bağlı olduğu terminal internet/ağ erişimini kaybederse, Şefin yaptığı "Hazır" işaretlemeleri bir `Local State` veya `IndexedDB` kuyruğuna alınır.
*   Bağlantı algılandığında (ping atarak), kuyruktaki işler paketlenerek (batch) arka arkaya Backend'e basılır. Şefin işi bölünmez.

---

## 3. Dağıtım Katmanı: Hedefli Soket İletişimi

Şef, ürün veya masa için `"Servise Gönder / Hazır"` tuşuna bastığında tetiklenen uçlar:

### A. Masa Siparişi (`dine_in`) – Garson Etkileşimi
*   **Bildirim Rotası:** Sadece o masaya bakan (veya o salon/bölge yetkilisi olan) garsonun paneline ve saatine (bağlıysa) sinyal gider.
*   **Bekleme Sayaçlı Kart:** Garsonun ekranındaki masa kartı sönük veya yeşil halden KIRMIZI ("Mutfak Hazır") konumuna geçer ve **üzerinde sayaç (00:00) dönmeye başlar**. Yemek mutfak tezgahında ne kadar bekliyor görülür.
*   **Manuel Servis Onayı:** Garson yemeği aldığını belirtmek için kartın üzerindeki "Servis Edildi" onayına kendi basmak zorundadır (otomatik 3 dakika kuralı KİLİTLENMİŞTİR). Basıldığında sayaç durur.

### B. Gel-Al Siparişi (`takeaway`) – Ortak Kasiyer Etkileşimi
*   **Bildirim Rotası:** Kasiyer Terminali ve Paketleme yapan Garsonlar/Hostesler.
*   **Aksiyon:** Sipariş "Teslim Bekliyor" listesine oturur. Müşterinin ismine seslenilir.

### C. Paket Servis (`delivery`) – Akıllı Kurye Etkileşimi (Smart Batching)
*   **Bildirim Rotası:** Kurye Ekranı (`CourierPanel`)
*   **Aksiyon:** Kuryenin arayüzünde "Sipariş mutfaktan çıktı" bilgisi yer alır.
*   **Akıllı Paket Birleştirme (Batching):** Kurye panelindeki Sipariş Havuzu, hedef adres/bölgeye göre organize edilir. Mutfaktan "Hazır" olan ve **aynı mahalleye (Zone) düşen** paketler bir zımba bloğu gibi yan yana listelenir ve "3'ünü Birden Teslim Al" butonu belirir.
*   **SMS/WhatsApp:** Müşteriye "Hazırlandı, Yola Çıkacak!" bilgilendirmesi fırlatılır.

---

## 4. Uygulama ve Front-end Haritası (Teknik Görevler)

*   [ ] **KitchenMonitor.tsx / KDS:**
    *   UI'a Tamamlananlar "Drawer"i (Çekmecesi) eklenecek.
    *   Bilet bazlı değil ürün bazlı Checkmark durumu Database'e bağlanacak.
    *   SLA (15dk-20dk) Pulse Timer'ları kurgulanacak.
    *   Soket bağlantı koptuğunda "Offline Pending Actions" kuyruk yapısı (zustand persistence) yazılacak.
*   [ ] **WaiterPanel.tsx / Garson:**
    *   Masa üzerindeki "Hazır" alertinin içerisine "Tezgahta Bekleme Süresi" (timer) eklenecek.
    *   Masadan sadece garson "Servis İşlemini Tamamla" diyince normale dönecek.
*   [ ] **CourierPanel.tsx / Kurye:**
    *   Paketler Zone (Mahalle/Bölge) isimlerine göre gruplanacak. Aynı bölgedekilerin hepsini tekte tikeleyebileceği "Batch" arayüzü kurulacak. 
*   [ ] **PosTerminal.tsx / Kasiyer:**
    *   Açık bekleme havuzunda QR siparişleri 2dk barajını aşarsa üst tepede kırmızıyla görünecek.

Bu güncellenmiş mimari, profesyonel restoran standartlarını aşarak, personelle iletişimi en küçük "kör noktaya" (blind-spot) mahal bırakmayacak şekilde koordine eder.

Ancak, bir yazılımın "canlı" bir işletmede (özellikle yoğun saatlerde) patlamaması veya operasyonel yük oluşturmaması için gözden kaçabilecek bazı kritik noktalar ve ek geliştirme önerilerim var:1. Hata Analizi ve "Kör Noktalar"Bağlantı Kopması Durumu (Offline Sync): Socket.io harikadır ama mutfağın interneti anlık giderse ne olur?Analiz: Şef "Hazır" dediğinde o an internet yoksa, o paket havada kalır.Çözüm: Client-side tarafta bir "Pending Actions" kuyruğu olmalı. İnternet geldiği an gönderilmeyen statü güncellemeleri topluca backend'e basılmalı.Garsonun "Servis Edildi" Onayı:Analiz: Dokümanda "3 dakika sonra otomatik sönükleşir" demişsin. Bu tehlikeli. Eğer garson o an başka masadaysa ve yemeği götürmeyi unuttuysa, sistem yemeği "teslim edildi" sayar ama yemek mutfak tezgahında soğur.Çözüm: Otomatik sönme yerine, garson paneline bir "Kaç dakikadır bekliyor" sayacı (counter) eklemek daha profesyonel olur.Adisyon/Fiş Yazdırma Zamanlaması:Analiz: Fiş mutfakta ne zaman basılıyor?Çözüm: Bazı işletmeler "Hazırlanıyor" dendiğinde fişin basılmasını ister (hazırlık fişi), bazıları "Yeni Gelen" olduğunda. Bu ayarlanabilir olmalı.2. Ek Geliştirme Önerileri (Level-Up)A. Mutfak İçin "Geri Al" (Undo) Butonu:Şef yanlışlıkla "Servise Gönder"e basarsa, o sipariş anında "Tamamlananlar Strip'ine" düşecek. Oradaki kayıttan bir "Geri Al" butonuyla siparişi tekrar "Hazırlanıyor" sütununa çekebilmeli. Aksi takdirde garsona giden bildirim kafa karışıklığı yaratır.B. Kurye ve Paket Birleştirme (Smart Batching):Aynı bölgeye giden 3 farklı paket servis varsa, CourierPanel üzerinde bu siparişlerin aynı rotada olduğu vurgulanmalı. Kurye dükkana geldiğinde "Hepsini Al ve Çık" diyebilmeli.C. Geç Kalan Sipariş Uyarısı (SLA):Ürün "Hazırlanıyor" aşamasında 15-20 dakikadan fazla kaldıysa, biletin rengi sarıdan turuncuya/kırmızıya dönmeli. Bu, şefin operasyon hızını takip etmesini sağlar.D. QR Menü "Ara Katman" Onayı:QR'dan gelen sipariş garsona "Onay"a düşüyor demişsin. Bu doğru bir hamle. Ancak garson meşgulse sipariş orada unutulabilir.Öneri: Eğer garson 2 dakika içinde onaylamazsa, Kasiyer ekranına "Onaylanmamış QR Siparişi!" uyarısı düşmeli.3. Teknik Mimari İçin İnce AyarSenaryoEksiklikÖneriKısmi TeslimatMasadaki 4 üründen 2'si hazırsa ne olacak?Sipariş bazlı değil, ürün bazlı statü yönetimi (Partial Ready).Garson Bölge Ataması10 garsonun 10'una da bildirim mi gidecek?Garsonları "Bölgelere" (Salon, Teras vb.) ayırıp sadece sorumlu oldukları masaların bildirimini gönderin.İptal SenaryosuMutfak yemeği yaparken müşteri iptal ederse?order_cancelled soketi mutfak ekranındaki bileti anında "İPTAL" damgasıyla karartmalı.SonuçKurgun gayet mantıklı ve eksiksiz bir akış sunuyor. Özellikle "Tamamlananlar Strip'i" mutfaktaki kaosun önüne geçecek harika bir detay. Yukarıdaki "Hata Analizi" kısımlarını (özellikle internet kopması ve geri al butonu) kodlama aşamasında dikkate alırsan sistem kurşun geçirmez olur.Direkt konuşmamı istediğin için net söylüyorum: Ürün bazlı statü takibi (Partial delivery) eklemezsen, büyük masalarda garson hangi tabak çıktı hangisi çıkmadı karıştıracaktır. Bunu mutlaka düşün. [cite: 2025-06-07]

 Garson Paneli: Entegrasyon ve İlişki ŞemasıGarson paneli sadece sipariş almak için değil, diğer birimlerden gelen verileri reaktif bir şekilde tüketmek için tasarlanmalıdır.1. QR Menü & Garson İlişkisi (Onay Mekanizması)Müşteri masadaki QR kodu okutup sipariş verdiğinde süreç şöyle işlemeli:Akış: QR Sipariş → PosBackend → Socket.io (Waiter Room) → Garson Paneli Bildirimi.Garsonun Rolü: Garsonun ekranında bir "Onay Bekleyen Sipariş" badge'i (işareti) belirir. Garson içeriği kontrol eder (yanlışlıkla basılmış mı vs.) ve "Mutfağa Gönder" der.Kritik Detay: Garson onayladığı anda order_status "Onaylandı" olur ve KitchenMonitor ekranına düşer.2. Mutfak & Garson İlişkisi (Hazır Bildirimi)Mutfak şefi "Servise Gönder" tuşuna bastığı an:Anlık Uyarı: Garson panelinde toast mesajı ("Masa 5'in siparişi hazır!") çıkar ve sesli uyarı verilir.Görsel Değişim: Masa planı ekranında, o masanın kartı kırmızı renkte yanıp sönmeye (pulse effect) başlar.Geri Bildirim: Garson tepsiyi masaya bıraktığında panel üzerinden "Servis Edildi" butonuna basarak masa kartını normal rengine (mavi veya yeşil) döndürür.3. Kasiyer & Garson İlişkisi (Ödeme ve Kapama)Hesap İsteme: Müşteri masadan (veya garsona söyleyerek) hesap istediğinde garson panelinden "Hesap İste" tuşuna basar.Kasiyer Terminali: Kasiyerin ekranında "Masa 5 - Hesap İstiyor" uyarısı çıkar.Kapatma: Kasiyer ödemeyi aldığı an table_closed soketi fırlar.

🍴 NextPOS — Akıllı Garson Paneli ve Masa Yönetimi EntegrasyonuBu belge, merkezi sistemdeki garson panelinin mutfak, kasiyer ve QR menü ile olan reaktif ilişkisini ve operasyonel karışıklıkları önlemek için geliştirilen "Masa Sahipliği" kurgusunu kapsar.1. Garson Paneli ve Birimler Arası İlişkiGarson paneli, sistemdeki tüm reaktif olayların (socket events) toplandığı ve yönetildiği merkezdir.A. QR Menü — Garson İlişkisiOnay Mekanizması: QR üzerinden gelen her sipariş doğrudan mutfağa gitmez; önce "Onay Bekleyenler" havuzuna düşer.Havuz Yönetimi: Bir garson "Onayla" dediği an, order_claimed soketi fırlar ve o sipariş diğer garsonların ekranından anında silinir.Sahiplik: Siparişi onaylayan ilk garson, o masanın sorumlusu olarak atanır.B. Mutfak — Garson İlişkisiHazır Bildirimi: Mutfak "Servise Gönder" tuşuna bastığında garson panelinde sesli uyarı ve toast bildirimi çıkar.Görsel Uyarı: Masa planı üzerindeki ilgili masa kartı kırmızı renkte yanıp sönmeye (animate-pulse) başlar.Servis Onayı: Garson yemeği teslim ettiğinde "Servis Edildi" butonuyla bu uyarıyı manuel kapatır; böylece "teslim edildi" bilgisi kesinleşir.C. Kasiyer — Garson İlişkisiÖdeme Talebi: Garson panelinden "Hesap İste" tuşuna basıldığında kasiyer terminaline "Masa X - Ödeme Bekliyor" uyarısı gider.Masa Kapanışı: Kasiyer ödemeyi tamamladığı an table_closed soketi ile garson ekranındaki masa kartı griye (boş) döner.2. Masa Sahipliği ve Kilit Mekanizması (Kaos Önleme)Birden fazla garsonun aynı masaya müdahale etmesini engellemek için aşağıdaki hiyerarşi uygulanır:DurumGörsel BelirteçYetkilendirme KuralıBoş MasaGri / ŞeffafHerhangi bir garson masayı açabilir.Sahipli MasaGarson İkonu + İsimSadece sahip olan garson sipariş ekleyebilir.İzleme ModuGöz İkonu 👁️Diğer garsonlar içeriği görebilir ama değişiklik yapamaz.Sahiplik Transferi"Masayı Üzerine Al"Acil durumda başka bir garson sahipliği devralabilir.3. Teknik Eylem Planı (Geliştirme Notları)🟢 Sahiplik ve Kilit (Backend & Socket)Masa Kilidi: tables tablosuna active_staff_id alanı eklenecek.Real-time Presence: Bir garson bir masanın detayını açtığında table:viewing soketi ile diğerlerine "Şu an Ahmet bu masada" bilgisi basılacak.🟡 Bölge Bazlı Bildirim (Zonlama)Garsonlar Salon, Teras, Bahçe gibi odalara (Socket Rooms) ayrılacak.Bir bildirim önce ilgili odadaki garsonlara gidecek, 30 saniye yanıt alınmazsa genel odaya yayılacak.🔴 Hata ve İstisna YönetimiOffline Sync: Bağlantı koptuğunda garsonun girdiği siparişler yerelde (LocalStorage) tutulacak ve bağlantı gelince senkronize edilecek.Çelişki Kontrolü: Mutfak yemek yollarken aynı anda masa kapatılmaya çalışılırsa sistem "Mutfakta hazır ürün var!" uyarısı verecek.