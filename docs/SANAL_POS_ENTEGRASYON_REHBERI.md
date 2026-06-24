# 💳 NextPOS — SANAL POS ENTEGRASYON VE KURULUM REHBERİ
**Multi-Tenant SaaS Ödeme Altyapısı Yönetim Kılavuzu**

Bu rehber, NextPOS platformu üzerindeki restoranların (tenants) müşterilerinden web, mobil uygulama veya QR menü üzerinden online ödeme alabilmelerini sağlayan Sanal POS (Virtual POS) entegrasyonlarını adım adım açıklamaktadır. 

Sistem, çok-kiracılı (multi-tenant) mimariyle uyumlu olup, her restoranın kendi Sanal POS API bilgilerini (API Key, Secret Key vb.) panele girerek kendi hesaplarına ödeme almasını destekleyecek şekilde tasarlanmıştır.

---

## 📋 İÇİNDEKİLER
1. [Sanal POS Çalışma Mimarisi ve Veritabanı Modeli](#1-sanal-pos-çalışma-mimarisi-ve-veritabanı-modeli)
2. [PayTR Entegrasyonu ve Kurulum Adımları](#2-paytr-entegrasyonu-ve-kurulum-adımları)
3. [iyzico Entegrasyonu ve Kurulum Adımları](#3-iyzico-entegrasyonu-ve-kurulum-adımları)
4. [Stripe Entegrasyonu ve Kurulum Adımları](#4-stripe-entegrasyonu-ve-kurulum-adımları)
5. [Ortak Webhook ve Geri Dönüş (Callback) Protokolü](#5-ortak-webhook-ve-geri-dönüş-callback-protokolü)
6. [PCI-DSS Güvenlik Standartları ve Hassas Veri Güvenliği](#6-pci-dss-güvenlik-standartları-ve-hassas-veri-güvenliği)
7. [Test Kartları ve Canlıya Geçiş Prosedürü](#7-test-kartları-ve-canlıya-geçiş-prosedürü)

---

## 1. Sanal POS Çalışma Mimarisi ve Veritabanı Modeli

NextPOS'ta ödeme akışı **Tokenization (Kart Bilgilerinin Saklanmaması)** prensibine dayanır. Müşterinin kart bilgileri asla sunucularımıza ulaşmaz; ilgili sağlayıcının (PayTR, iyzico, Stripe) güvenli JS SDK'sı aracılığıyla tokenleştirilir.

### 🗄️ Veritabanı Yapısı (`schema.prisma` için Örnek Model)
Her restoranın (tenant) ödeme ayarlarını şifrelenmiş olarak saklamak için `TenantPaymentSettings` tablosu kullanılır:

```prisma
model TenantPaymentSettings {
  id             String   @id @default(uuid())
  tenantId       String   @unique
  provider       String   // "paytr" | "iyzico" | "stripe"
  isActive       Boolean  @default(true)
  
  // Şifrelenmiş API Bilgileri (AES-256-GCM ile DB seviyesinde şifrelenmelidir)
  apiKeyEncrypted      String
  apiSecretEncrypted   String
  apiSaltEncrypted     String? // PayTR için Merchant Salt
  merchantId           String? // PayTR/iyzico üye işyeri ID'si
  
  webhookSecret        String? // Webhook imza doğrulaması için
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}
```

---

## 2. PayTR Entegrasyonu ve Kurulum Adımları

PayTR, Türkiye'de en yaygın kullanılan kolay entegre edilebilir ve güvenli Sanal POS sağlayıcılarından biridir.

### 🔑 Adım 1: PayTR Panelinden API Bilgilerinin Alınması
1. [PayTR Mağaza Paneline](https://www.paytr.com/magaza) giriş yapın.
2. Sol menüden **Bilgi** sekmesine tıklayın.
3. Buradaki **API Entegrasyon Bilgileri** bölümünden şu verileri kopyalayın:
   * **Mağaza Numarası (Merchant ID)**
   * **Mağaza Parolası (Merchant Key)**
   * **Mağaza Gizli Anahtarı (Merchant Salt)**

### ⚙️ Adım 2: Webhook URL'lerinin Tanımlanması
PayTR panelinde **Ayarlar** sekmesine gidin ve "Bildirim URL (Callback URL)" alanını şu şekilde güncelleyin:
* `https://api.yourdomain.com/api/v1/payments/paytr/callback`

### 💻 Adım 3: Backend Token Üretimi (`POST /payments/paytr/session`)
Müşteri ödeme sayfasına girdiğinde backend tarafında PayTR'a istek gönderilerek geçici bir `token` alınır ve ön yüze gönderilir:

```typescript
import crypto from 'crypto';
import axios from 'axios';

async function getPaytrToken(order: any, customer: any, settings: any) {
  const merchant_id = settings.merchantId;
  const merchant_key = settings.apiKey;
  const merchant_salt = settings.apiSalt;
  
  const user_ip = order.ip || '127.0.0.1';
  const merchant_oid = order.id; // Sipariş ID'si (Benzersiz olmalı)
  const email = customer.email;
  const payment_amount = Math.round(order.totalAmount * 100); // Kuruş cinsinden (Örn: 100.50 TL -> 10050)
  
  // Sepet detaylarını formatla: [[Ürün Adı, Fiyat, Adet]]
  const user_basket = JSON.stringify(
    order.items.map((item: any) => [item.name, item.price.toString(), item.quantity])
  );
  
  const paytr_token_str = merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + 
                          '1' + '0' + 'TRY' + '0'; // 3d secure, non-3d, para birimi, taksit limit
                          
  const paytr_token = crypto
    .createHmac('sha256', merchant_key)
    .update(paytr_token_str + merchant_salt)
    .digest('base64');

  const response = await axios.post('https://www.paytr.com/odeme/api/get-token', {
    merchant_id,
    user_ip,
    merchant_oid,
    email,
    payment_amount,
    paytr_token,
    user_basket,
    user_name: customer.name,
    user_address: customer.address || 'Istanbul',
    user_phone: customer.phone,
    merchant_ok_url: 'https://posmenu.yourdomain.com/payment/success',
    merchant_fail_url: 'https://posmenu.yourdomain.com/payment/fail',
    timeout_limit: '30',
    currency: 'TRY',
    test_mode: process.env.NODE_ENV === 'development' ? '1' : '0'
  });

  if (response.data.status === 'success') {
    return response.data.token; // Bu token ön yüzde iframe src'sine gömülecektir
  } else {
    throw new Error('PayTR Token hatası: ' + response.data.reason);
  }
}
```

---

## 3. iyzico Entegrasyonu ve Kurulum Adımları

iyzico, hem yurtiçi hem de yurtdışı kartlara taksit imkanı sunan bir BDDK lisanslı ödeme kuruluşudur.

### 🔑 Adım 1: iyzico Panelinden API Bilgilerinin Alınması
1. [iyzico Üye İşyeri Paneline](https://merchant.iyzipay.com) (Test ortamı için [sandbox-merchant.iyzipay.com](https://sandbox-merchant.iyzipay.com)) giriş yapın.
2. **Ayarlar -> Firma Ayarları** adımlarını izleyin.
3. Sayfanın altındaki **API Anahtarı (API Key)** ve **Güvenlik Anahtarı (Secret Key)** değerlerini kopyalayın.

### ⚙️ Adım 2: Webhook Tanımlama (Merchant Notification)
iyzico panelinde **Ayarlar -> Bildirim Ayarları** bölümünden Webhook'ları aktif hale getirin ve alttaki adresi girin:
* `https://api.yourdomain.com/api/v1/payments/iyzico/webhook`

### 💻 Adım 3: iyzico Checkout Form Başlatma (`POST /payments/iyzico/session`)
iyzico en güvenli yöntem olan "Ortak Ödeme Formu" (Checkout Form) altyapısını önerir.

```typescript
import Iyzipay from 'iyzipay';

const iyzipay = new Iyzipay({
  apiKey: settings.apiKey,
  secretKey: settings.apiSecret,
  uri: process.env.NODE_ENV === 'production' 
    ? 'https://api.iyzipay.com' 
    : 'https://sandbox-api.iyzipay.com'
});

async function createIyzicoForm(order: any, customer: any) {
  const request = {
    locale: 'tr',
    conversationId: order.id,
    price: order.subtotal.toString(),
    paidPrice: order.totalAmount.toString(), // İndirimler/KDV dahil nihai tutar
    currency: 'TRY',
    basketId: order.id,
    paymentGroup: 'PRODUCT',
    callbackUrl: 'https://api.yourdomain.com/api/v1/payments/iyzico/callback',
    buyer: {
      id: customer.id.toString(),
      name: customer.name.split(' ')[0] || 'Guest',
      surname: customer.name.split(' ')[1] || 'User',
      gsmNumber: customer.phone,
      email: customer.email,
      identityNumber: '11111111111', // T.C. Kimlik zorunludur (iyzico kuralı)
      registrationAddress: customer.address || 'Address',
      ip: order.ip || '127.0.0.1',
      city: 'Istanbul',
      country: 'Turkey'
    },
    shippingAddress: {
      contactName: customer.name,
      city: 'Istanbul',
      country: 'Turkey',
      address: customer.address || 'Address'
    },
    billingAddress: {
      contactName: customer.name,
      city: 'Istanbul',
      country: 'Turkey',
      address: customer.address || 'Address'
    },
    basketItems: order.items.map((item: any) => ({
      id: item.id.toString(),
      name: item.name,
      category1: 'Food',
      itemType: 'PHYSICAL',
      price: (item.price * item.quantity).toString()
    }))
  };

  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(request, (err: any, result: any) => {
      if (err || result.status !== 'success') {
        reject(err || result.errorMessage);
      } else {
        // Ön yüze dönecek HTML kodu (iframe veya modal form tetikleyici)
        resolve(result.checkoutFormContent); 
      }
    });
  });
}
```

---

## 4. Stripe Entegrasyonu ve Kurulum Adımları

Stripe, özellikle euro (€) bazlı veya yurtdışından turist çeken/yabancı müşterisi olan işletmeler için en uygun küresel çözümdür (Almanya operasyonu için de birincil tercihtir).

### 🔑 Adım 1: Stripe Developer Panelinden Bilgilerin Alınması
1. [Stripe Dashboard](https://dashboard.stripe.com)'a giriş yapın.
2. **Developers -> API Keys** menüsüne gidin.
3. İlgili API anahtarlarını kopyalayın:
   * **Publishable Key** (Ön yüz için: `pk_live_...`)
   * **Secret Key** (Arka yüz için: `sk_live_...`)

### ⚙️ Adım 2: Stripe Webhook Eklenmesi
1. **Developers -> Webhooks** menüsünden **Add Endpoint** butonuna tıklayın.
2. Endpoint URL olarak şunu tanımlayın:
   * `https://api.yourdomain.com/api/v1/payments/stripe/webhook`
3. Dinlenecek olaylar (Select events to listen to):
   * `payment_intent.succeeded`
   * `payment_intent.payment_failed`
4. Endpoint oluşturulduktan sonra ekran üzerindeki **Signing Secret** (`whsec_...`) anahtarını kopyalayın.

### 💻 Adım 3: Payment Intent Oluşturulması (`POST /payments/stripe/intent`)

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(settings.apiSecret, {
  apiVersion: '2023-10-16' // Stabil API sürümü
});

async function createStripePaymentIntent(order: any, tenantId: string) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(order.totalAmount * 100), // Cent cinsinden (Örn: 12.50 EUR -> 1250)
    currency: order.currency || 'eur',
    metadata: {
      orderId: order.id,
      tenantId: tenantId
    },
    automatic_payment_methods: {
      enabled: true // Kart, Apple Pay, Google Pay vb. otomatik desteklenir
    }
  });

  return {
    clientSecret: paymentIntent.client_secret,
    id: paymentIntent.id
  };
}
```

---

## 5. Ortak Webhook ve Geri Dönüş (Callback) Protokolü

Ödeme işlemi bittiğinde Sanal POS sağlayıcısı backend URL'imize şifreli bir POST isteği (Webhook) atar. **Bu adım kritik önem taşır; çünkü tarayıcı penceresi kapansa dahi siparişin ödenip ödenmediği webhook ile kesinleşir.**

### 🛡️ PayTR Bildirim Doğrulama (Callback Endpoint)
PayTR'dan gelen isteklerin sahte olmadığını doğrulamak için imza (hash) kontrolü yapılır:

```typescript
import express from 'express';
import crypto from 'crypto';

const router = express.Router();

router.post('/paytr/callback', express.urlencoded({ extended: true }), async (req, res) => {
  const { merchant_oid, status, total_amount, hash, failed_reason_code } = req.body;
  
  // DB'den bu siparişin ait olduğu tenant'ın merchant_key ve merchant_salt verilerini çekin.
  const settings = await db.tenantPaymentSettings.findFirst({ ... });
  
  const expected_hash_str = merchant_oid + settings.apiSalt + status + total_amount;
  const expected_hash = crypto
    .createHmac('sha256', settings.apiKey)
    .update(expected_hash_str)
    .digest('base64');

  if (hash !== expected_hash) {
    return res.status(400).send('BAD HASH'); // Güvenlik ihlali
  }

  if (status === 'success') {
    // 1. Sipariş durumunu 'paid' olarak güncelle.
    // 2. Mutfak ekranına WebSocket ile siparişi gönder (`order:status` event).
    // 3. Yazıcı kuyruğuna (fiş basımı) ekle.
  } else {
    // Siparişi başarısız/iptal olarak işaretle.
  }

  res.send('OK'); // PayTR'a işlemin alındığı teyidini gönder (Zorunludur)
});
```

---

## 6. PCI-DSS Güvenlik Standartları ve Hassas Veri Güvenliği

Sanal POS entegrasyonu barındıran NextPOS sisteminin uluslararası **PCI-DSS (Payment Card Industry Data Security Standard)** kurallarına uyması zorunludur.

1. **Kart Numarası, CVC ve S.K.T Asla Sunucuya Gönderilmemelidir:** 
   Kart bilgileri direkt kullanıcının tarayıcısından güvenli JS SDK'lar (Stripe Elements, iyzico JS, PayTR Iframe) aracılığıyla gönderilmeli, backend API sunucumuz sadece `Token` veya `SessionID` almalıdır.
2. **API Anahtarlarının Veritabanında Güvenli Saklanması:**
   Restoranların Sanal POS bilgileri veritabanına düz metin (plain text) olarak yazılmamalıdır. Sunucudaki `.env` dosyasında bulunan gizli bir `ENCRYPTION_KEY` yardımıyla `AES-256-GCM` algoritmasıyla şifrelenmeli, kullanılacağı zaman bellek üzerinde deşifre edilmelidir.
3. **Zorunlu HTTPS (SSL/TLS):**
   Ödeme akışının geçtiği tüm URL'ler en az TLS 1.2/1.3 protokolüne sahip SSL sertifikası (HTTPS) ile korunmalıdır. HTTP üzerinden gelen istekler engellenmelidir.

---

## 7. Test Kartları ve Canlıya Geçiş Prosedürü

Geliştirme yaparken sistemi test etmek için aşağıdaki test kartlarını ve parametrelerini kullanabilirsiniz.

### 🧪 Test Kart Bilgileri

| Sağlayıcı | Kart Numarası | S.K.T | CVC | Durum / Sonuç |
| :--- | :--- | :--- | :--- | :--- |
| **PayTR** | `1881 1938 1881 1938` | Herhangi Gelecek Tarih | `123` | Başarılı Test Ödemesi |
| **iyzico** | `5526 9100 0000 0001` | Herhangi Gelecek Tarih | `123` | Sandbox Başarılı Ödeme |
| **Stripe** | `4242 4242 4242 4242` | Herhangi Gelecek Tarih | `123` | Test Başarılı Ödeme |

### 🚀 Canlıya Geçiş Kontrol Listesi (Go-Live Checklist)
* [ ] Sağlayıcı hesabının (PayTR/iyzico/Stripe) "Canlı (Production) Mod" onayının alınmış olması.
* [ ] `.env` dosyasında `NODE_ENV` değerinin `production` olarak ayarlanması.
* [ ] Sandbox API anahtarlarının gerçek "Canlı API Anahtarları" ile değiştirilmesi.
* [ ] Canlı web sitelerinde SSL sertifikasının (HTTPS) aktif ve TLS 1.3 sürümünün desteklendiğinin doğrulanması.
* [ ] Webhook geri dönüş URL'lerinin canlı backend IP/domain'ine yönlendirilmiş olması.
