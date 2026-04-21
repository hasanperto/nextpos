# 📱 NextPOS Android Caller ID - Teknik Mimari ve Güvenlik Rehberi

Bu belge, NextPOS sistemine bağlı Android telefonların bir **Caller ID Gateway** olarak nasıl çalıştığını ve veri güvenliğinin nasıl sağlandığını açıklar.

---

## 1. APK Temel Özellikleri
- **Platform:** Android Native (Kotlin/Java)
- **Minimum SDK:** 21 (Android 5.0+)
- **Yetkiler:**
  - `READ_PHONE_STATE`: Çağrı geldiğinde numarayı okumak için.
  - `INTERNET`: Webhook sunucusuna veri göndermek için.
  - `FOREGROUND_SERVICE`: Uygulamanın arka planda sistem tarafından kapatılmasını önlemek için.

---

## 2. Çalışma Prensibi (Workflow)

1.  **Tetiklenme (Trigger):** Telefona bir çağrı geldiğinde Android sistemi bir `Broadcast` yayınlar.
2.  **Yakalama (Listening):** Uygulama içindeki `CallReceiver` sınıfı bu sinyali yakalar ve gelen telefon numarasını alır.
3.  **İşleme (Processing):** Numara standart formata getirilir (örn: +90'sız hali).
4.  **Gönderim (Transmission):** Uygulama, kayıtlı **API URL**'sine bir `HTTP POST` isteği atar.
5.  **POS Tepkisi:** Sunucu gelen veriyi doğrular, WebSocket üzerinden Kasa ekranına "Gelen Çağrı" modalını gönderir.

---

## 3. Güvenlik ve Koruma (Protection System)

Verilerinizin güvenliğini sağlamak ve kasanıza dışarıdan sahte çağrı gelmesini önlemek için şu katmanlar kullanılır:

### A. API Key Doğrulaması
Her Android cihazın kendine has bir **Sync Key**'i vardır. Bu anahtar her istekte `key=...` parametresi ile gönderilir. Sunucu (NextPOS API), gelen anahtar veritabanındaki anahtarla (bcrypt ile korunur) eşleşmezse isteği **403 Forbidden** ile reddeder.

### B. HTTPS Desteği
Uygulama, yerel ağda `http` üzerinden, bulut ortamında ise `https` (SSL) üzerinden veri gönderebilir. Şifrelenmiş tünel sayesinde numaralar asla üçüncü şahıslar tarafından görülemez.

### C. Doze Mode & Battery Protection
Android 6.0 ve sonrasındaki "Uygulama Uyutma" (Doze Mode) özelliğini aşmak için uygulama bir **Foreground Service** olarak tasarlanmıştır. Bu, telefon kilitli olsa bile çağrı geldiği saniyede verinin kurye/kasa ekranına düşmesini garanti eder.

---

## 4. Kullanıcı Arayüzü (Settings UI)
Kullanıcı uygulama içinden şu ayarları yapar:
1. **Server Address:** `http://192.168.1.50:5173` (Örn.)
2. **Tenant ID:** Sistemdeki benzersiz müşteri kodu.
3. **Android Key:** Admin panelinde belirlenen şifre.

---

## 5. Webhook Veri Yapısı (JSON)
Sunucuya gönderilen verinin teknik şeması:

```json
{
  "number": "05321112233",
  "name": "Android Cagri",
  "device": "Android Phone Gateway v1.0",
  "timestamp": "2026-04-01T13:00:00Z"
}
```

---

### Teknik Özet
Bu sistem, ek bir Caller ID cihazı maliyetini ortadan kaldırır ve yüksek hızda (sıfıra yakın gecikme) veri transferi sağlar. Uygulama sadece çağrı anında aktif olduğu için telefonun ısınmasına veya yavaşlamasına sebep olmaz.
