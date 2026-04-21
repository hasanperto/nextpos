# NextPOS Port Yapılandırması

Bu belge, NextPOS'un sunucuda kullandığı tüm portları ve olası çakışmaları listeler.

---

## NextPOS Port Haritası

| Servis | Port | Değiştirilebilir mi? | Ayar Yeri |
|--------|------|---------------------|-----------|
| **NextPOS API** | `3001` (veya `.env PORT`) | ✅ Evet | `apps/api/.env` → `PORT=` |
| **PostgreSQL** | `5432` | ✅ Evet | aaPanel PgSQL ayarları |
| **Redis** | `6379` | ✅ Evet | `apps/api/.env` → `REDIS_URL=` |
| **Nginx (HTTP)** | `80` | ❌ Hayır | aaPanel varsayılan |
| **Nginx (HTTPS)** | `443` | ❌ Hayır | aaPanel varsayılan |
| **aaPanel** | `8888` (veya custom) | ✅ Evet | aaPanel güvenlik ayarı |
| **Yazıcı Agent** | `3910` | ✅ Evet | Sadece POS cihazında yerel |

---

## Sunucuda Port Kontrol Komutları

SSH ile sunucuya bağlanın ve aşağıdaki komutu çalıştırarak tüm kullanılan portları listeleyin:

```bash
# Tüm dinlenen portları listele (en önemli komut)
ss -tlnp

# Veya alternatif:
netstat -tlnp
```

### Çıktı Örneği ve Anlamları:
```
State   Local Address:Port    Process
LISTEN  0.0.0.0:22            sshd        ← SSH (dokunma)
LISTEN  0.0.0.0:80            nginx       ← Nginx HTTP (dokunma)
LISTEN  0.0.0.0:443           nginx       ← Nginx HTTPS (dokunma)
LISTEN  0.0.0.0:888           python      ← aaPanel (dokunma)
LISTEN  0.0.0.0:8888          python      ← aaPanel (dokunma)
LISTEN  127.0.0.1:5432        postgres    ← PostgreSQL (OK, NextPOS bunu kullanacak)
LISTEN  127.0.0.1:6379        redis       ← Redis (OK, NextPOS bunu kullanacak)
LISTEN  0.0.0.0:3306          mysqld      ← MySQL (aaPanel kurdu, biz kullanmıyoruz)
```

### Belirli bir portun kullanılıp kullanılmadığını kontrol etmek:
```bash
# Port 3001 (NextPOS API varsayılan) kullanılıyor mu?
ss -tlnp | grep 3001

# Port 5000 kullanılıyor mu?
ss -tlnp | grep 5000

# Port 5432 kullanılıyor mu? (PostgreSQL)
ss -tlnp | grep 5432

# Port 6379 kullanılıyor mu? (Redis)
ss -tlnp | grep 6379
```

---

## Olası Port Çakışmaları ve Çözümleri

### 1. Port 3001 veya 5000 zaten kullanılıyorsa (API)

API portunu `.env` dosyasından değiştirin:

```bash
nano /www/wwwroot/nextpos/apps/api/.env
```

Değiştirin:
```env
PORT=4500
```

⚠️ **Nginx reverse proxy'yi de güncellemeyi unutmayın!** aaPanel'de `posapi.webotonom.de` sitesinin proxy ayarını yeni porta çevirin:
```nginx
location / {
  proxy_pass http://127.0.0.1:4500;   # ← Yeni port
  ...
}
```

POS, Admin ve Reseller sitelerindeki `/api/` ve `/socket.io/` proxy kurallarını da aynı porta güncelleyin.

### 2. Port 5432 kullanılıyorsa (PostgreSQL)

Eğer aaPanel üzerinden PostgreSQL kurduysanız zaten 5432 kullanılıyordur — bu normaldir. `.env` dosyasında PostgreSQL URL'inizi kontrol edin:

```env
DATABASE_URL="postgresql://nextpos:SIFRENIZ@127.0.0.1:5432/nextpos"
```

Eğer farklı bir port kullanılıyorsa (ör. 5433):
```env
DATABASE_URL="postgresql://nextpos:SIFRENIZ@127.0.0.1:5433/nextpos"
```

### 3. Port 6379 kullanılıyorsa (Redis)

Redis zaten 6379'da çalışıyorsa sorun yok. `.env` dosyanızda:
```env
REDIS_URL="redis://127.0.0.1:6379"
```

Redis farklı portta çalışıyorsa:
```env
REDIS_URL="redis://127.0.0.1:YENI_PORT"
```

### 4. MySQL 3306 portu (aaPanel varsayılan)

aaPanel LNMP kurulumunda MySQL otomatik gelir. NextPOS MySQL **kullanmaz** (PostgreSQL kullanır). MySQL'i durdurmak istiyorsanız:

```bash
# MySQL durdur (RAM kazanır)
systemctl stop mysqld
systemctl disable mysqld
```

Veya aaPanel panelinden MySQL servisini durdurun.

---

## Güvenlik Duvarı (Firewall) Ayarları

Sunucunuzda sadece şu portların dışarıya açık olması yeterlidir:

```bash
# Gerekli açık portlar
ufw allow 22      # SSH
ufw allow 80      # HTTP (Nginx)
ufw allow 443     # HTTPS (Nginx)
ufw allow 8888    # aaPanel (veya custom port)

# NextPOS API portunu dışarıya AÇMAYIN!
# API'ye Nginx reverse proxy üzerinden erişilir.
# Port 3001/5000 sadece 127.0.0.1 (localhost) dinler.
```

> ⚠️ **ÖNEMLİ:** API portunu (3001 veya 5000) dışarıya açmayın! Tüm trafik `posapi.webotonom.de` → Nginx → `127.0.0.1:PORT` şeklinde akmalıdır.

---

## Hızlı Kontrol Talimatı (Sunucuda Çalıştırın)

Sunucuya bağlandıktan hemen sonra şu tek komutu çalıştırıp çıktıyı bana gönderin — port çakışması olup olmadığını hemen söylerim:

```bash
echo "=== KULLANILAN PORTLAR ===" && ss -tlnp | grep -E ':(22|80|443|888|3001|3306|5000|5432|6379|8888) ' && echo "=== TAMAMLANDI ==="
```
