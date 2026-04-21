# SaaS Admin Panel — POS Satış Faturası + Operasyon Analizi

## Amaç
- Super Admin’in (ve gerekirse bayi rolünün) restoranlara “tam kontrol” sağlayabilmesi.
- POS satış faturası/fiş süreçlerinin: **bulunması, doğrulanması, PDF/print üretilmesi, e‑posta ile gönderilmesi, yeniden gönderilmesi** ve hepsinin **rapor + log** ile izlenebilmesi.
- İşleyiş odaklı kullanıcı deneyimi: “destek talebi geldi → 30 saniyede çöz”.

## Mevcut Yapı (Gözlem)
- SaaS Admin paneli POS uygulaması içinde sekmeli bir ekran: apps/pos `SaaSAdmin`.
- Tenant/Reseller finans ve “invoice” mantığı şu an ağırlıkla `public` DB’de abonelik/tahsilat için kurgulu:
  - API: `/api/v1/tenants/finance/*` içinde `public.payment_history` + `public.invoices` (abonelik faturası) akışı.
- Tenant (POS) tarafında sipariş/ödeme tabloları var (orders, payments). Kasa/parçalı ödeme ve Z raporu akışı mevcut.
- Fiscal/TSE tarafı ayrı modül olarak var: `/api/v1/fiscal/*` (DSFinV-K export, journal, status).

## Kritik Eksik: POS Satış Faturası Merkezi (Tenant Schema verisi)
SaaS Admin’de istenen “POS satış faturası” aslında tenant şemasındaki **satış belgesi** verisidir. Bunun için “SaaS invoice” (abonelik) ekranı yeterli değildir.

### Neden kritik?
- Kullanıcı “fatura istiyorum” dediğinde: support ekibi SaaS panelinden bulup gönderebilmeli.
- Restoran/kasa tarafına girip ekran ekran gezmek “operasyon maliyeti” yaratır.

## P0 — Ekranlar ve İş Akışları (Kullanıcı Dostu)

### 1) Tenant 360 (Restoran 360)
**Tek tenant seçildiğinde** şu bloklar tek ekranda olmalı:
- **Kimlik:** tenant adı, schema, durum, bayi, plan/modüller, cihaz/terminal kotası.
- **Operasyon sağlık:** son 24s hata oranı (API/print/fiscal), son 10 kritik log.
- **Satış özeti:** bugün/dün satış, iade, ödeme mix, en yoğun şube/terminal.
- **Fatura merkezi kısayolları:** “son 20 satış faturası”, “fatura no ile ara”, “şube filtre”.
- **Aksiyonlar:** kullanıcı şifre/pin reset, cihaz eşleşme reset, şube/kota ayarı, backup, modül yönetimi.

### 2) POS Satış Faturası Listesi (Invoice/Receipt Center)
**Hedef:** 5 saniyede doğru faturayı bulmak.

Filtreler (minimum):
- Tarih aralığı + saat
- Şube
- Terminal/kasa
- Kasiyer
- Ödeme yöntemi (cash/card/mixed) + parçalı ödeme
- Durum (paid/cancelled/refunded/void)
- Tutar aralığı
- Arama: fatura no / sipariş no / müşteri tel / müşteri adı / vergi no

Liste satırı (tam kontrol):
- Fatura no, tarih-saat, şube, kasiyer, toplam, ödeme tipi, durum
- Hızlı aksiyonlar: PDF indir, Yazdır, E‑posta gönder, Kopyala, Detay

### 3) POS Satış Faturası Detayı (Tam detay)
Detay sayfası “tek bakışta” şunları göstermeli:
- **Özet:** toplam, ara toplam, KDV oran/kalem, indirim/kupon, service fee, tip.
- **Kalemler:** ürün/variant/modifier, adet, birim fiyat, satır toplam, KDV.
- **Ödemeler:** payment lines (cash/card), referanslar, iade/void çizgileri.
- **Kaynak:** order/session id, şube, terminal, kasiyer, cihaz id.
- **Müşteri:** ad/telefon/e‑posta, delivery adresi (varsa), firma bilgileri (vergi no/unvan).
- **Belgeler:** PDF preview, “yeniden üret”, “yeniden gönder”, “yazdır”.
- **Log:** bu faturaya ait tüm aksiyonlar (oluşturma, yazdırma, mail, iade).

### 4) “Fatura isteği” için 30 saniyelik hız akışı
- Global arama → “fatura no / tel / tutar” gir
- 1 sonuç → Detay aç
- “Gönder” → (varsayılan e‑posta) veya tek seferlik e‑posta
- Sistem loglar: gönderildi / başarısız / tekrar denendi

## P0 — Log & Raporlama (İşleyiş odaklı)

### 1) Operasyon Log Merkezi (audit değil, “iş log’u”)
Event tipi önerileri:
- POS_RECEIPT_CREATED
- POS_RECEIPT_PDF_GENERATED
- POS_RECEIPT_PRINTED
- POS_RECEIPT_EMAILED (to=…)
- POS_RECEIPT_EMAIL_FAILED (reason=…)
- POS_ORDER_CANCELLED / POS_ORDER_REFUNDED
- POS_DEVICE_MISMATCH / LOGIN_FAILED
- FISCAL_EXPORT_TRIGGERED / FISCAL_JOURNAL_FETCHED

UI:
- tenant → şube → tarih → event type filtreleri
- “kanıt” için payload snapshot (örn: email recipient, pdf hash, printer id)

### 2) Raporlarda drill-down
Her metrik kartı detaya inebilmeli:
- “Bugün fatura sayısı” → filtreli fatura listesi
- “Mail başarısız” → log filtreli görünüm
- “İade oranı” → iade faturaları listesi

## P1 — Bayi / Reseller ve Tam Kontrol Seviyeleri
- Super Admin: tüm tenantlar + tüm satış faturaları.
- Reseller: sadece kendi tenantları + kendi tenant satış faturaları (tam detay görünür, ama bazı aksiyonlar kısıtlanabilir).
- “Kısıt” işleyiş odaklı olmalı:
  - Görüntüleme tam, ama riskli aksiyonlar (fatura iptal/iade, plan değişimi) role’e bağlı.

## P1 — “Hesap sistemi daha detaylı” (operasyonel kapsam)
Üç katman:
- Organizasyon: Super → Reseller → Tenant → Branch → Terminal → User
- Müşteri/Firma: invoice alıcısı bilgileri, geçmiş faturalar, hızlı arama
- Finansal: ödemeler, iade/iptal, parçalı ödeme, mutabakat

## Teknik Tasarım Önerisi (Minimum, Uygulanabilir)

### 1) Tenant şemasında “Sales Receipt/Invoice” kaydı
Amaç: SaaS panelin query edebileceği stabil bir belge kaydı.
Öneri alanlar:
- receipt_no / invoice_no (unique)
- order_id / session_id
- branch_id / terminal_id / cashier_user_id
- totals: subtotal, tax_total, discount_total, grand_total, currency
- status: paid/cancelled/refunded
- customer fields: name, phone, email, company_title, tax_no, address
- payments snapshot (JSON)
- items snapshot (JSON)
- created_at, updated_at

### 2) PDF/Email “kanıt” kaydı
İki seçenek:
- A) sales_receipt tablosunda `last_pdf_hash`, `last_emailed_to`, `last_emailed_at`
- B) ayrı `receipt_events` tablosu (önerilen, daha temiz)

### 3) API yüzeyi (SaaS Admin → Tenant data)
Örnek endpointler:
- `GET /api/v1/tenants/:tenantId/pos-invoices?from&to&branch&query&status&payment_method`
- `GET /api/v1/tenants/:tenantId/pos-invoices/:invoiceNo`
- `POST /api/v1/tenants/:tenantId/pos-invoices/:invoiceNo/send-email` (to?)
- `GET /api/v1/tenants/:tenantId/pos-invoices/:invoiceNo/pdf`
- `GET /api/v1/tenants/:tenantId/logs?type&from&to`

Not: Buradaki “tenantId” ile tenant schema’ya güvenli geçiş (withTenant) yapılmalı.

## UX Standardları (Paneli “kullanıcı dostu” yapan detaylar)
- Global Search (tenant/invoice/customer/phone) tek kutu
- Saved filters (son kullanılan filtreyi hatırla)
- “Hızlı aksiyonlar” her listede aynı konum/ikon
- Long table’larda sticky header + sütun seçimi
- “Copy” ile tenant id, invoice no, phone, email tek tık
- “Kanıt” bölümü: mail gönderildi/başarısız, pdf hash, zaman damgası

## Önceliklendirme Önerisi
- P0: Tenant 360 + POS Invoice Center (liste+detay+mail/pdf) + Log Center temel
- P1: Drill-down raporlama + reseller görünürlüğü + müşteri/firma kartı
- P2: Toplu işlemler + workflow wizard’ları + otomatik hatırlatma senaryoları

