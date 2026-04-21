# 📞 NextPOS Caller ID & VoIP Kurulum Kılavuzu

NextPOS Caller ID sistemi; VoIP (Bulut Santral), Android Telefonlar ve Analog USB Modemler üzerinden gelen çağrıları anlık olarak kasa ekranında göstermenizi sağlar.

---

## 1. Android Telefon ile Çağrı Takibi (Önerilen)

En kolay yöntemdir. İş telefonu olarak kullandığınız Android cihaza bir "Gateway" uygulaması yükleyerek tüm çağrıları NextPOS'a aktarabilirsiniz.

### Kurulum Adımları:
1. **Admin Paneli > Ayarlar > Entegrasyonlar** sekmesine gidin.
2. **Caller ID Kaynağı** olarak **"Android Gateway App"** seçin.
3. Bir **"Android Sync Key"** (örn: `restoran123`) belirleyin ve ayarları kaydedin.
4. Ekranda beliren **Webhook URL**'yi kopyalayın.
5. Android telefonunuza Google Play üzerinden **"Caller ID to Webhook"** veya **"Call Forwarder"** tarzı bir uygulama yükleyin.
6. Uygulamanın ayarlarında "Forward Incoming Calls"ı açın ve kopyaladığınız URL'yi yapıştırın.
7. Uygulamanın arka planda çalışmasına ve pil tasarrufu modundan muaf tutulmasına izin verin.

---

## 2. VoIP (SIP) Santral Entegrasyonu

Eğer 3CX, Karel, Asterisk veya bir Bulut Santral (Netgsm, Bulutfon vb.) kullanıyorsanız, NextPOS doğrudan SIP üzerinden santralinize bağlanabilir.

### Kurulum Adımları:
1. **Admin Paneli > Ayarlar > Entegrasyonlar** sekmesine gidin.
2. **Caller ID Kaynağı** olarak **"VoIP SIP"** seçin.
3. Santralinizden aldığınız şu bilgileri girin:
   - **VoIP Proxy / Domain:** (örn: `santral.domain.com`)
   - **User ID / Extension:** Dahili numaranız (örn: `1001`)
   - **Password:** Dahili şifreniz.
4. Kaydedin. Dahili numaranız çaldığında kasa ekranında müşteri bilgileri belirecektir.

---

## 3. Analog USB Caller ID Modem

Eğer sabit bir Türk Telekom hattınız varsa ve bir Caller ID modemine sahipseniz (örn: CID602), bu cihazı kasanıza USB ile bağlayarak kullanabilirsiniz.

*Not: USB Modem kullanımı için kasanızda küçük bir sürücü (NextPOS Gateway) çalışıyor olmalıdır.*

---

## Çalışma Mantığı

- **Müşteri Kayıtlıysa:** İsmi, adresi ve son siparişleri ekranda belirir. "Hızlı Sipariş" butonu ile hemen adisyon açılabilir.
- **Müşteri Kayıtlı Değilse:** Sadece numara gözükür. "Yeni Müşteri" butonuna basarak rehbere ekleyebilir ve adrese sipariş başlatabilirsiniz.

---

### Teknik Destek
Sorun yaşamanız durumunda **Destek Merkezi** üzerinden bize ulaşabilirsiniz.
