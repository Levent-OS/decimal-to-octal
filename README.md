# Developardus IoT — Tank Monitör Sunucusu

Vercel + Supabase mimarisi ile çalışan IoT tank seviye izleme sistemi.

## Mimari

```
Cihaz (ESP32/ESP8266)         Tarayıcı (Web UI)
      │ HTTP POST                    │
      │ X-API-Key                    │
      ▼                              ▼
┌────────────────────────────────────────┐
│           Vercel (Edge)                │
│  ┌──────────┐    ┌──────────────────┐  │
│  │ /api/*   │    │  /public/* (UI)  │  │
│  │ Serverless│    │  Static HTML/JS │  │
│  └────┬─────┘    └────────┬────────┘  │
│       │                   │            │
└───────┼───────────────────┼────────────┘
        │                   │
        ▼                   ▼
┌────────────────────────────────────────┐
│        Supabase (PostgreSQL)           │
│  devices | readings | tank_configs     │
│  alerts  | system_logs | app_users     │
└────────────────────────────────────────┘
```

## Hızlı Başlangıç

### 1. Supabase Kurulumu

1. [supabase.com](https://supabase.com) üzerinden proje oluşturun
2. SQL Editor'e gidin
3. `supabase-schema.sql` dosyasının içeriğini kopyalayıp çalıştırın
4. Settings → API → URL ve anon key'i not edin

### 2. Vercel Deploy

```bash
# Repo'yu klonla
git clone https://github.com/YOUR_USER/developardus-server.git
cd developardus-server

# Vercel CLI ile deploy
npm i -g vercel
vercel

# Environment variables ekle (Vercel Dashboard → Settings → Environment Variables)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_KEY=eyJxxx...   # (opsiyonel, server-side için)
```

### 3. İlk Kullanıcı Kaydı

1. `https://your-domain.vercel.app/login.html` adresine gidin
2. "Hesap oluştur" linkine tıklayın
3. E-posta ve şifre ile kayıt olun (ilk kullanıcı otomatik admin)

### 4. Cihaz Bağlantısı

Dashboard'dan "Cihaz Ekle" ile yeni cihaz oluşturun. Verilen API key'i cihaz firmware'ına yükleyin.

**ESP32 örnek HTTP POST:**

```cpp
#include <HTTPClient.h>

HTTPClient http;
http.begin("https://your-domain.vercel.app/api/tank/data");
http.addHeader("Content-Type", "application/json");
http.addHeader("X-API-Key", "dev_key_tank001_abc123");

String payload = "{\"raw_value\":1253,\"temperature\":24.5,\"battery_voltage\":4.1,\"rssi\":-65}";
int code = http.POST(payload);
```

**curl ile test:**

```bash
curl -X POST https://your-domain.vercel.app/api/tank/data \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev_key_tank001_abc123" \
  -d '{"raw_value":1253,"temperature":24.5,"battery_voltage":4.1,"rssi":-65}'
```

## API Endpointleri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `/api/auth` | Login / Register |
| GET | `/api/devices` | Cihaz listesi (son okuma dahil) |
| POST | `/api/devices` | Yeni cihaz ekle |
| GET | `/api/tank/data` | Okuma geçmişi (query: device_id, limit, from, to) |
| POST | `/api/tank/data` | Cihazdan veri al (X-API-Key gerekli) |
| GET | `/api/health` | Sistem sağlık durumu ve istatistikler |
| GET | `/api/alerts` | Alarm listesi |
| PUT | `/api/alerts` | Alarm onayla |
| GET | `/api/logs` | Sistem logları (query: level, source, limit) |

## Web Sayfaları

| Sayfa | Açıklama |
|-------|----------|
| `/` | Dashboard — tüm cihaz özeti, trend grafik, alarmlar |
| `/tank.html?id=TANK-001` | Tank detay — seviye, sıcaklık, konfigürasyon |
| `/health.html` | Sağlık — Supabase/Vercel durumu, DB istatistikleri |
| `/system.html` | Sistem — log viewer, alarm yönetimi, cihaz CRUD |
| `/login.html` | Giriş / Kayıt |

## Dosya Yapısı

```
developardus-server/
├── api/                    # Vercel serverless functions
│   ├── auth/index.js       # Login / Register
│   ├── tank/data.js        # Cihaz veri alma + okuma geçmişi
│   ├── devices/index.js    # Cihaz CRUD
│   ├── health/index.js     # Sistem sağlığı
│   ├── alerts/index.js     # Alarm yönetimi
│   └── logs/index.js       # Log okuma
├── public/                 # Static frontend
│   ├── index.html          # Dashboard
│   ├── tank.html           # Tank detay
│   ├── health.html         # Sağlık izleme
│   ├── system.html         # Sistem yönetimi
│   ├── login.html          # Giriş
│   ├── css/style.css       # Paylaşılan stiller
│   └── js/app.js           # Supabase config + ortak JS
├── supabase-schema.sql     # Veritabanı şeması
├── vercel.json             # Vercel konfigürasyonu
├── package.json            # Bağımlılıklar
└── README.md
```

## Teknolojiler

- **Frontend:** Vanilla HTML/CSS/JS + Chart.js
- **Backend:** Vercel Serverless Functions (Node.js)
- **Veritabanı:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Deploy:** Vercel (auto-deploy from GitHub)
