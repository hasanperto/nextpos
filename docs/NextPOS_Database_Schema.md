# NextPOS - Veritabanı Şeması (Tablo Haritası)

PostgreSQL 16 · Shared DB · Row Level Security · Prisma ORM

## 1. SaaS Katmanı Tabloları (Public Schema)
| Tablo Adı | Açıklama |
| :--- | :--- |
| **tenants** | Her restoran bir tenant. slug, plan, status, trialEndsAt, stripeCustomerId |
| **resellers** | Bayiler. commission_rate, contact, plan_access, parent_reseller_id |
| **reseller_tenants** | Bayi ↔ Tenant ilişkisi. hangi bayi hangi restoranı getirdi |
| **subscription_plans** | Starter/Pro/Enterprise planları. fiyat, limit, özellikler |
| **subscription_invoices** | Fatura kayıtları. Stripe entegrasyonu. ödeme durumu |
| **reseller_commissions** | Bayi komisyon hesabı. ay bazlı, ödeme durumu |
| **support_tickets** | Destek biletleri. bayi ↔ tenant ↔ admin arası |
| **audit_logs** | Tüm kritik işlemler. silinmez kayıt. GDPR uyumlu |

## 2. Restoran (Tenant) Tabloları
| Tablo Adı | Açıklama |
| :--- | :--- |
| **branches** | Şubeler. adres, lisans, para birimi, dil, KassenSichV TSE |
| **users** | Tüm kullanıcılar. rol, PIN, preferred_language, branch bağlantısı |
| **refresh_tokens** | JWT refresh token'ları. hash, device_info, expires_at |
| **categories** | Ürün kategorileri. translations JSONB (DE/TR/EN), icon, sort_order |
| **products** | Ürünler. translations, basePrice, allergens, taxClass, isAvailable |
| **product_variants** | Boyutlar. Klein/Normal/Groß. fiyat farkı |
| **modifier_groups** | Modifikasyon grupları. Sos Seçimi, Ekstra Malzeme |
| **modifiers** | Modifikatörler. Extra Käse, Scharf. fiyat, translations |
| **product_modifier_groups** | Ürün ↔ ModGroup çoka-çok ilişki tablosu |
| **sections** | Salon bölümleri. İç Salon, Bahçe, Teras. kat planı layoutData |
| **tables** | Masalar. pozisyon, şekil, QR secret, anlık durum, currentSessionId |
| **kitchen_stations** | Mutfak istasyonları. Ana Mutfak, Bar, Soğuk (hot/bar/cold) |
| **inventory_items** | Stok kalemleri. birim, minimum stok, tedarikçi |
| **product_ingredients** | Ürün ↔ stok kalemi. sipariş gelince düş |
| **stock_movements** | Stok hareketleri. in/out/adjustment/waste. audit trail |

## 3. Operasyon Tabloları
| Tablo Adı | Açıklama |
| :--- | :--- |
| **customers** | CRM. puan, tier, GDPR consent, kişisel QR, favori ürünler |
| **customer_addresses** | Müşteri adresleri. varsayılan, koordinat (teslimat için) |
| **table_sessions** | Masa oturumları. açılış/kapanış, garson, müşteri, misafir sayısı |
| **orders** | Siparişler. tip, kaynak, durum, indirim, KDV, TSE imzası, offlineId |
| **order_items** | Sipariş kalemleri. modifiers JSONB, kitchenStation, void |
| **kitchen_tickets** | Mutfak fişleri. istasyon bazlı, FIFO sırası, süre takibi |
| **payments** | Ödemeler. nakit/kart/online, tip, para üstü, Stripe intent |
| **refunds** | İadeler. payment_id, tutar, sebep, işleyen |
| **delivery_zones** | Teslimat bölgeleri. GeoJSON polygon, min sipariş, ücret |
| **deliveries** | Teslimatlar. kurye ataması, anlık konum, tahmini süre |
| **service_calls** | Garson çağrıları. QR menüden gelen: hesap, su, garson çağır |
| **z_reports** | Z Raporları. günlük kasa kapanışı. KDV %7/%19 ayrımı. TSE imzası |
| **daily_summaries** | Günlük özetler. hızlı dashboard için cache |
| **point_history** | Müşteri puan geçmişi. earn/redeem/expire/bonus |
| **sync_queue** | Offline senkronizasyon kuyruğu. retry mekanizması |
| **receipt_templates** | Dil bazlı fiş şablonları. DE/TR/EN ayrı başlık/footer |
| **languages** | Aktif diller. de/tr/en. flag emoji, yön (ltr/rtl) |
| **translations** | Offline/Online çeviri anahtarları şeması |
