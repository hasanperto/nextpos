# NextPOS — Raporlama & Finans Modülleri Analiz Raporu

**Tarih:** 28 Nisan 2026  
**Amaç:** Mevcut raporlama ve finans ekranlarının kullanıcı dostu, minimalist ve tutarlı olup olmadığını değerlendirmek.  
**Kapsam:** 10 dosya, 2 katman (Restoran Admin + SaaS Admin).

---

## 1. DOSYA HARİTASI

| # | Dosya | Katman | Satır | Boyut | Rol |
|---|-------|--------|-------|-------|-----|
| 1 | `AdminDashboard.tsx` | Restoran | 743 | 57 KB | Ana kontrol merkezi, günlük ciro/sipariş/mutfak/kurye kartları |
| 2 | `AdminReports.tsx` | Restoran | 520 | 30 KB | Dönem özeti, Z Raporu, personel performans tablosu |
| 3 | `AdminAccounting.tsx` | Restoran | 449 | 28 KB | Muhasebe: satış/iptal kayıtları, filtreleme |
| 4 | `AdminStaffPerformance.tsx` | Restoran | 315 | 19 KB | Personel verimlilik matrisi, mesai kayıtları |
| 5 | `useDailyReport.ts` | Hook | 59 | 1.5 KB | Günlük Z raporu verisi çeken hook |
| 6 | `saas/DashboardTab.tsx` | SaaS | — | 56 KB | SaaS genel dashboard |
| 7 | `saas/FinanceTab.tsx` | SaaS | 573 | 41 KB | SaaS finans: gelir/gider, gateway, komisyon |
| 8 | `saas/ReportsTab.tsx` | SaaS | 223 | 14 KB | SaaS büyüme raporu, churn, plan dağılımı |
| 9 | `saas/AccountingTab.tsx` | SaaS | 744 | 59 KB | SaaS muhasebe: vadeler, taksit, fatura |
| 10 | `saas/PosInvoicesTab.tsx` | SaaS | — | 19 KB | POS fatura listesi |

---

## 2. KRİTİK SORUNLAR

### 🔴 2.1 Dil Tutarsızlığı (EN/TR Karışımı)

**Bu, kullanıcı dostluğu için en büyük engel.**

| Dosya | Örnek (Olduğu Gibi) | Olması Gereken |
|-------|---------------------|----------------|
| `AdminReports.tsx` | "Financial Command", "Gross Volume", "Efficiency Multiplier", "Strategic Pulse" | Türkçe veya tam i18n key |
| `AdminAccounting.tsx` | "Live Daily Volume", "Global Turnover", "Terminal Void Loss", "Loyalty & Discount" | `t('accounting.todayTurnover')` vb. |
| `AdminAccounting.tsx` | "SUCCESSFUL TRANSACTIONS", "VOID & CANCELLED LOGS", "Transactional Value" | Zaten `posMessages.ts` key'leri var ama kullanılmamış |
| `AdminAccounting.tsx` | "Temporal Range", "Gateway Channel", "Personnel Matrix", "Reset Protocol" | Gereksiz teknik jargon, restoran sahibi bunu anlamaz |
| `AdminReports.tsx` | "Awaiting Date Selection", "Operational Closing Status" | Türkçe: "Tarih seçiniz" |
| `AdminStaffPerformance.tsx` | "Ciro Katkısı" ama `₺` hardcoded | `currency` değişkeni kullanılmalı (Almanya'da `€`) |
| `saas/AccountingTab.tsx` | "Tactical Revenue Terminal", "Settlement Amount" | Overkill jargon |
| `saas/FinanceTab.tsx` | "ACTIVE_NODE", "Infrastructure Layer v4.2" | Sahte teknik ibare, kullanıcıyı yanıltır |

**Etki:** Türk restoran sahibi "Terminal Void Loss" yazan kartı anlamaz. Almanyalı müşteri Türkçe label görünce güvenemez.

---

### 🔴 2.2 Hardcoded Para Birimi (₺)

`AdminStaffPerformance.tsx` içinde `₺` sembolü hardcoded yazılmış (satır 179, 213, 297):

```tsx
// ❌ YANLIŞ
<p className="...">₺{Number(s.total_revenue_generated).toLocaleString('tr-TR')}</p>

// ✅ DOĞRU
<p className="...">{currency}{Number(s.total_revenue_generated).toLocaleString()}</p>
```

Bu sayfa `usePosStore` yerine `currency` prop'u almıyor. Almanya'daki restoran "₺" görecek.

---

### 🟡 2.3 Aşırı Tasarım (Over-Design)

Bazı kartlarda ve bölümlerde tasarım, bilginin önüne geçiyor:

| Sorun | Detay |
|-------|-------|
| `rounded-[3rem]` ve `rounded-[2.5rem]` | Extreme border-radius, bazı küçük ekranlarda içerik kesiliyor |
| `text-[10px]` ve `text-[9px]` | Label'lar çok küçük, yaşlı kullanıcılar okuması zor |
| "Strategic Pulse" kartı (`AdminReports.tsx` satır 296-306) | Sabit "Performance is optimal. Dinner service accounts for 64% of total revenue" metni — bu gerçek veri değil, aldatıcı |
| Gateway Performans kartları (`FinanceTab.tsx` satır 147-191) | "Uptime Pulse: 99.99%", "Infrastructure Layer v4.2" yazıları tamamen sahte, gerçek API'den gelmiyor |
| SaaS ReportsTab "EST. CLV" | `€4.2k` hardcoded değer, hesaplanmıyor |

---

### 🟡 2.4 Eksik Özellikler (Fonksiyonel Boşluklar)

| Eksik | Detay |
|-------|-------|
| **Grafik yok** | `AdminReports.tsx` günlük geliri tablo olarak gösteriyor, çubuk/çizgi grafik yok |
| **Excel/CSV Export** | Sadece PDF var, çoğu muhasebeci Excel ister |
| **Z Raporu otomatik hatırlatma** | Z raporu alınmadan gün kapanmamalı (kural.md'de var) ama frontend'de uyarı yok |
| **Karşılaştırma** | "Bu hafta vs geçen hafta" veya "Bu ay vs geçen ay" karşılaştırma özelliği yok |
| **Tarih filtresi ile auto-load** | `AdminReports.tsx`'de tarih değiştirince otomatik yüklenmiyor, kullanıcı "Yenile" butonuna basmalı |
| **Pagination** | `AdminAccounting.tsx` tüm transaction'ları tek seferde çekiyor, büyük veri setlerinde performans sorunu |

---

### 🟢 2.5 İyi Yapılmış Şeyler

| Özellik | Detay |
|---------|-------|
| **Z Raporu Lock/Unlock** | Gün kilitleme/açma mekanizması doğru çalışıyor |
| **PDF İndirme** | Hem dönem özeti hem Z raporu için PDF endpoint'leri mevcut |
| **Parçalı Ödeme Modali** | `SplitBillModal.tsx`, `PartialPaymentModal.tsx` zaten var |
| **SaaS Fatura Detay Modalı** | `AccountingTab.tsx` içinde profesyonel fatura görüntüleme ve yazdırma var |
| **Framer Motion animasyonları** | Geçişler akıcı |
| **Muhasebe Güvenliği** | Silme işlevi kaldırılmış, sadece storno var — kural.md'ye uygun |

---

## 3. MİNİMALİST TASARIM ÖNERİLERİ

### 3.1 Bilgi Hiyerarşisi (Azalt ve Odakla)

**Şu anki durum:** Her ekranda 5-8 arasında kart + tablo + filtre paneli. Kullanıcı ne yapacağını bilemiyor.

**Öneri:**

```
Dashboard'da: MAX 4 ana metrik kartı (Günlük Ciro, Sipariş Sayısı, Doluluk, Bekleyen Ödeme)
Reports'ta:   MAX 3 bölüm (Dönem Özeti, Z Raporu, Top Ürünler)  
Accounting'de: Tek tablo + başlık filtreleri (tarih + arama)
```

### 3.2 Label Standardizasyonu

Tüm label'lar `posMessages.ts` ve `saas/messages.ts` üzerinden gelmeli. Hiçbir yerde hardcoded İngilizce teknik jargon kalmamalı.

### 3.3 Font Boyutu Standardı

| Kullanım | Min Boyut | Max Boyut |
|----------|-----------|-----------|
| Label/Alt Yazı | `text-xs` (12px) | `text-sm` (14px) |
| Değer/Rakam | `text-lg` (18px) | `text-3xl` (30px) |
| Başlık | `text-base` (16px) | `text-xl` (20px) |

`text-[9px]` ve `text-[10px]` kullanımı **tamamen kaldırılmalı**.

### 3.4 Sahte Veri Temizliği

Aşağıdaki sabit/sahte ibareler **kaldırılmalı veya gerçek veriye bağlanmalı:**

- `"Performance is optimal. Dinner service accounts for 64% of total revenue."` → Kaldır veya API'den al
- `"Infrastructure Layer v4.2"` → Kaldır
- `"Uptime Pulse: 99.99%"` → Gerçek gateway health check endpoint'ine bağla
- `"EST. CLV €4.2k"` → Ya hesapla ya kaldır
- `"Aesthetic-Driven Growth Strategy 2026"` → Kaldır

---

## 4. AKSİYON PLANI

### Faz A — Kritik Düzeltmeler (1 gün)

| # | Görev | Dosya |
|---|-------|-------|
| A1 | `₺` hardcode → `currency` değişkeni | `AdminStaffPerformance.tsx` |
| A2 | Sahte metin kartlarını kaldır/gizle | `AdminReports.tsx`, `saas/ReportsTab.tsx`, `saas/FinanceTab.tsx` |
| A3 | Tüm EN label'ları i18n key'lere çevir | `AdminReports.tsx`, `AdminAccounting.tsx` |

### Faz B — UX İyileştirmeleri (2-3 gün)

| # | Görev | Dosya |
|---|-------|-------|
| B1 | `text-[9px]`/`text-[10px]` → minimum `text-xs` | Tüm raporlama dosyaları |
| B2 | Tarih değişikliğinde auto-load | `AdminReports.tsx` |
| B3 | Z Raporu hatırlatma banner'ı (açık masalar varken) | `AdminDashboard.tsx` |
| B4 | Grafik ekleme (basit bar chart) | `AdminReports.tsx` |

### Faz C — Fonksiyonel Tamamlama (3-5 gün)

| # | Görev | Dosya |
|---|-------|-------|
| C1 | CSV/Excel export butonu | `AdminReports.tsx`, `AdminAccounting.tsx` |
| C2 | Pagination (sayfalama) | `AdminAccounting.tsx` |
| C3 | Dönem karşılaştırma (Bu ay vs Geçen ay) | `AdminReports.tsx` |
| C4 | Muhasebe silme modalı → storno (iade) akışına dönüştürme | `AdminAccounting.tsx` (zaten yapılmış, doğrulanmalı) |

---

## 5. ÖZET SKOR TABLOSU

| Kriter | Puan (10 üzerinden) | Not |
|--------|---------------------|-----|
| **Fonksiyonellik** | 7/10 | Temel özellikler var, grafik ve export eksik |
| **Kullanıcı Dostu** | 4/10 | Dil karışıklığı ve teknik jargon ciddi engel |
| **Minimalizm** | 3/10 | Aşırı tasarım, sahte veriler, gereksiz kartlar |
| **Tutarlılık** | 5/10 | SaaS tarafı i18n kullanıyor ama Restoran tarafı karışık |
| **Erişilebilirlik** | 4/10 | Çok küçük font boyutları, kontrast sorunları |
| **Performans** | 6/10 | Pagination eksik, API çağrıları optimize edilmeli |
| **Genel** | **5/10** | Temel iskelet sağlam ama UX/dil cilalaması şart |

---

> **Sonuç:** Raporlama ve finans modüllerinin backend altyapısı ve veri akışı sağlam kurulmuş. Ancak frontend tarafında **dil karışıklığı, sahte veriler ve aşırı tasarım** kullanıcı deneyimini ciddi şekilde bozuyor. Yukarıdaki Faz A görevleri acil olarak uygulanmalıdır.
