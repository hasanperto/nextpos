# NextPOS İş Akışı ve Mutfak Akış Analizi

Bu belge, NextPOS sistemindeki temel operasyonel senaryoları, mevcut iş akışlarını ve iyileştirme önerilerini içerir.

---

## 1. Senaryo: Restoran İçi (Dine-In) Masa Siparişi
**Akış:**
1. **Giriş:** Müşteri masaya oturur. Garson tabletten masayı seçer ve adisyonu açar.
2. **Sipariş:** Garson ürünleri seçer ve "Mutfak Gönder" butonuna basar.
3. **Mutfak:** Sipariş anında **KitchenStatusModal**'da "BEKLEMEDE" olarak görünür.
4. **Hazırlık:** Mutfak personeli siparişi görüp "BAŞLAT" (Preparing) der.
5. **Tamamlanma:** Yemek piştiğinde mutfak "HAZIR" (Ready) butonuna basar.
6. **Servis:** Garsonun ekranında (veya Header'da) mutfak sayacı/uyarısı güncellenir. Garson yemeği servis eder.
7. **Ödeme:** Müşteri hesap ister (QR üzerinden veya sözlü). Kasiyer ödemeyi alır ve masayı kapatır.

---

## 2. Senaryo: Telefonla Sipariş (Caller ID - Al Götür / Paket)
**Akış:**
1. **Giriş:** Telefon çalar. **Caller ID** sistemi numarayı yakalar ve ekranda "Gelen Çağrı: Ahmet Bey" uyarısı çıkar.
2. **Kayıt:** Kasiyer çağrıyı tıklar, müşterinin adres bilgileri otomatik gelir.
3. **Sipariş:** Müşteri isteğini söyler, kasiyer "Paket" veya "Gel-Al" olarak siparişi girer.
4. **Mutfak:** Sipariş mutfak ekranına "PAKET" etiketiyle düşer.
5. **Hazırlık/Tamamlanma:** Mutfak yemeği hazırlar ve "HAZIR" der.
6. **Teslimat:** 
   - **Paket ise:** Kasiyer kurye atar. Kurye siparişi götürür.
   - **Gel-Al ise:** Müşteri restorana geldiğinde sipariş teslim edilir, ödeme alınır.

---

## 3. Senaryo: Web / QR / WhatsApp Siparişi
**Akış:**
1. **Giriş:** Müşteri web sitesinden veya QR menüden sepetini onaylar.
2. **Bildirim:** Kasiyer terminalinde **KIRMIZI ALARM** (Sesli ve Yanıp Sönen İnternet Butonu) tetiklenir.
3. **Onay/Red:** Kasiyer gelen internet siparişini inceler ve "ONAYLA" der. (Onaylanmadan mutfağa düşmez).
4. **Mutfak:** Onaylanan sipariş mutfağa "İNTERNET/QR" etiketiyle düşer.
5. **Süreç:** Mutfak süreci tamamlar. Müşteri web üzerinden "Hazırlanıyor" veya "Yola Çıktı" durumunu canlı izler.

---

## 4. Tespit Edilen Eksikler ve İyileştirme Önerileri

### 🔴 Eksik 1: Garsonlar İçin "Hazır" Bildirimi (Push Notification)
**Sorun:** Mutfak bir yemeği "Hazır" yaptığında, garsonun bunu anlaması için Header'daki sayaca bakması gerekiyor.
**Öneri:** Mutfak "Hazır" dediğinde, o masaya bakan garsonun tabletinde **"Masa 5 Siparişi Hazır!"** şeklinde anlık bir toast veya pop-up uyarısı çıkmalı.

### 🔴 Eksik 2: Mutfak İçin Yeni Sipariş Sesli Uyarı
**Sorun:** Mutfak yoğunluğunda ekrana dikkat etmeyebilirler.
**Öneri:** Mutfağa her yeni sipariş düştüğünde (KDS ekranında) kısa bir "Ding" veya "Zil" sesi çalmalıdır.

### 🔴 Eksik 3: Müşteriye Otomatik WhatsApp Bildirimi
**Sorun:** Paket siparişi veya Gel-Al siparişi hazır olduğunda müşteriye manuel haber veriliyor.
**Öneri:** Mutfak "Hazır" butonuna bastığında, müşteriye otomatik olarak **"Siparişiniz hazırlandı! 🍕"** şeklinde bir WhatsApp mesajı veya SMS gönderilmelidir.

### 🔴 Eksik 4: Kurye Takip Ekranı ve Mesafe Analizi
**Sorun:** Kuryenin nerede olduğu veya tahmini varış süresi sistemde net değil.
**Öneri:** Kasiyer ekranında kuryelerin harita üzerindeki son konumu ve siparişin ortalama teslim süresi (ETA) gösterilmelidir.

### 🔴 Eksik 5: Gel-Al "Hazır" Panosu
**Sorun:** Gel-Al müşterileri restoran içinde beklerken siparişlerinin durumunu soruyorlar.
**Öneri:** Restoran içine müşterilerin görebileceği bir TV/Ekran konularak, hazırlanan sipariş numaraları (Örn: #102 Hazırlanıyor, #98 Hazır) gösterilmelidir.

---
*Hazırlayan: Antigravity AI - NextPOS Analiz Raporu*
