-- ============================================================
-- DEVELOPARDUS IoT SUNUCU — Supabase Schema
-- Supabase SQL Editor'de çalıştırın
-- ============================================================

-- ┌──────────────────────────────────────────┐
-- │  1. CİHAZLAR (devices)                   │
-- └──────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS devices (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id     TEXT UNIQUE NOT NULL,          -- örn: TANK-001, TANK-002
    device_type   TEXT NOT NULL DEFAULT 'tank',
    name          TEXT,
    firmware_version TEXT,
    last_seen     TIMESTAMPTZ,
    is_active     BOOLEAN DEFAULT true,
    config        JSONB DEFAULT '{}',
    api_key       TEXT UNIQUE,                   -- cihaz bazlı API key
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_active ON devices(is_active);
CREATE INDEX idx_devices_api_key ON devices(api_key);

-- ┌──────────────────────────────────────────┐
-- │  2. TANK OKUMALARI (readings)            │
-- └──────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS readings (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id       TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    raw_value       DOUBLE PRECISION,
    level_cm        DOUBLE PRECISION,
    level_percent   DOUBLE PRECISION,
    temperature     DOUBLE PRECISION,
    battery_voltage DOUBLE PRECISION,
    rssi            INTEGER,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_readings_device_time ON readings(device_id, created_at DESC);
CREATE INDEX idx_readings_created ON readings(created_at DESC);

-- ┌──────────────────────────────────────────┐
-- │  3. TANK KONFİGÜRASYON (tank_configs)   │
-- └──────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS tank_configs (
    device_id         TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
    tank_height_cm    DOUBLE PRECISION DEFAULT 200,
    tank_name         TEXT,
    raw_per_cm        DOUBLE PRECISION DEFAULT 17.9,    -- kalibrasyon sabiti
    offset_raw        DOUBLE PRECISION DEFAULT 0,
    alert_low_percent  DOUBLE PRECISION DEFAULT 10,
    alert_high_percent DOUBLE PRECISION DEFAULT 95,
    read_interval_sec  INTEGER DEFAULT 300,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ┌──────────────────────────────────────────┐
-- │  4. ALARMLAR (alerts)                    │
-- └──────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS alerts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id       TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    alert_type      TEXT NOT NULL,                  -- low_level | high_level | battery_low | offline | temp_high
    severity        TEXT DEFAULT 'warning',         -- info | warning | critical
    message         TEXT,
    acknowledged    BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_device ON alerts(device_id, created_at DESC);
CREATE INDEX idx_alerts_active ON alerts(acknowledged, created_at DESC);

-- ┌──────────────────────────────────────────┐
-- │  5. SİSTEM LOGLARI (system_logs)         │
-- └──────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS system_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    level       TEXT NOT NULL,                      -- INFO | WARNING | ERROR | CRITICAL
    source      TEXT NOT NULL,                      -- api | device | system | health | storage | auth
    message     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_level ON system_logs(level, created_at DESC);
CREATE INDEX idx_logs_source ON system_logs(source, created_at DESC);
CREATE INDEX idx_logs_created ON system_logs(created_at DESC);

-- ┌──────────────────────────────────────────┐
-- │  6. KULLANICILAR (app_users)             │
-- │  Supabase Auth + ek profil bilgisi       │
-- └──────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS app_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    username    TEXT UNIQUE NOT NULL,
    role        TEXT DEFAULT 'viewer',              -- admin | editor | viewer
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ┌──────────────────────────────────────────┐
-- │  7. DEPOLAMA İZLEME (storage_usage)      │
-- └──────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS storage_usage (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name      TEXT NOT NULL,
    row_count       BIGINT DEFAULT 0,
    estimated_bytes BIGINT DEFAULT 0,
    checked_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ┌──────────────────────────────────────────┐
-- │  8. FONKSİYONLAR                         │
-- └──────────────────────────────────────────┘

-- Cihazdan gelen veriyi işle: reading kaydet, level hesapla, alarm kontrol et, last_seen güncelle
CREATE OR REPLACE FUNCTION process_tank_reading(
    p_device_id TEXT,
    p_raw_value DOUBLE PRECISION,
    p_temperature DOUBLE PRECISION DEFAULT NULL,
    p_battery_voltage DOUBLE PRECISION DEFAULT NULL,
    p_rssi INTEGER DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_config tank_configs%ROWTYPE;
    v_level_cm DOUBLE PRECISION;
    v_level_pct DOUBLE PRECISION;
    v_reading_id BIGINT;
    v_result JSONB;
BEGIN
    -- Konfig al
    SELECT * INTO v_config FROM tank_configs WHERE device_id = p_device_id;

    -- Konfig yoksa default
    IF NOT FOUND THEN
        INSERT INTO tank_configs (device_id) VALUES (p_device_id);
        SELECT * INTO v_config FROM tank_configs WHERE device_id = p_device_id;
    END IF;

    -- Seviye hesapla
    v_level_cm := ROUND(((p_raw_value - v_config.offset_raw) / v_config.raw_per_cm)::numeric, 2);
    IF v_level_cm < 0 THEN v_level_cm := 0; END IF;
    IF v_level_cm > v_config.tank_height_cm THEN v_level_cm := v_config.tank_height_cm; END IF;

    v_level_pct := ROUND(((v_level_cm / v_config.tank_height_cm) * 100)::numeric, 1);

    -- Reading kaydet
    INSERT INTO readings (device_id, raw_value, level_cm, level_percent, temperature, battery_voltage, rssi, ip_address)
    VALUES (p_device_id, p_raw_value, v_level_cm, v_level_pct, p_temperature, p_battery_voltage, p_rssi, p_ip_address)
    RETURNING id INTO v_reading_id;

    -- last_seen güncelle
    UPDATE devices SET last_seen = NOW() WHERE device_id = p_device_id;

    -- Alarm kontrolleri
    IF v_level_pct <= v_config.alert_low_percent THEN
        INSERT INTO alerts (device_id, alert_type, severity, message)
        VALUES (p_device_id, 'low_level', 'critical',
            format('Tank seviyesi kritik düşük: %%%s (%.1f cm)', v_level_pct, v_level_cm));
    END IF;

    IF v_level_pct >= v_config.alert_high_percent THEN
        INSERT INTO alerts (device_id, alert_type, severity, message)
        VALUES (p_device_id, 'high_level', 'warning',
            format('Tank seviyesi yüksek: %%%s (%.1f cm)', v_level_pct, v_level_cm));
    END IF;

    IF p_battery_voltage IS NOT NULL AND p_battery_voltage < 3.3 THEN
        INSERT INTO alerts (device_id, alert_type, severity, message)
        VALUES (p_device_id, 'battery_low', 'warning',
            format('Düşük batarya: %.2fV', p_battery_voltage));
    END IF;

    v_result := jsonb_build_object(
        'reading_id', v_reading_id,
        'level_cm', v_level_cm,
        'level_percent', v_level_pct,
        'device_id', p_device_id
    );

    RETURN v_result;
END;
$$;

-- Eski verileri temizle (90 günden eski readings, 30 günden eski loglar)
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_readings_deleted BIGINT;
    v_logs_deleted BIGINT;
    v_alerts_deleted BIGINT;
BEGIN
    DELETE FROM readings WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_readings_deleted = ROW_COUNT;

    DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS v_logs_deleted = ROW_COUNT;

    DELETE FROM alerts WHERE acknowledged = true AND created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS v_alerts_deleted = ROW_COUNT;

    -- Log
    INSERT INTO system_logs (level, source, message, metadata)
    VALUES ('INFO', 'storage', 'Otomatik temizlik tamamlandı',
        jsonb_build_object('readings_deleted', v_readings_deleted, 'logs_deleted', v_logs_deleted, 'alerts_deleted', v_alerts_deleted));

    RETURN jsonb_build_object(
        'readings_deleted', v_readings_deleted,
        'logs_deleted', v_logs_deleted,
        'alerts_deleted', v_alerts_deleted
    );
END;
$$;

-- Tablo istatistikleri
CREATE OR REPLACE FUNCTION get_table_stats()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'readings_count', (SELECT COUNT(*) FROM readings),
        'devices_count', (SELECT COUNT(*) FROM devices),
        'alerts_count', (SELECT COUNT(*) FROM alerts WHERE acknowledged = false),
        'logs_count', (SELECT COUNT(*) FROM system_logs),
        'oldest_reading', (SELECT MIN(created_at) FROM readings),
        'newest_reading', (SELECT MAX(created_at) FROM readings),
        'readings_today', (SELECT COUNT(*) FROM readings WHERE created_at > CURRENT_DATE),
        'alerts_today', (SELECT COUNT(*) FROM alerts WHERE created_at > CURRENT_DATE)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ┌──────────────────────────────────────────┐
-- │  9. ROW LEVEL SECURITY                   │
-- └──────────────────────────────────────────┘

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tank_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;

-- Herkese okuma izni (anon + authenticated)
CREATE POLICY "read_devices" ON devices FOR SELECT USING (true);
CREATE POLICY "read_readings" ON readings FOR SELECT USING (true);
CREATE POLICY "read_tank_configs" ON tank_configs FOR SELECT USING (true);
CREATE POLICY "read_alerts" ON alerts FOR SELECT USING (true);
CREATE POLICY "read_system_logs" ON system_logs FOR SELECT USING (true);
CREATE POLICY "read_app_users" ON app_users FOR SELECT USING (true);
CREATE POLICY "read_storage_usage" ON storage_usage FOR SELECT USING (true);

-- Herkese yazma izni (cihazlar anon key ile veri gönderecek)
CREATE POLICY "insert_readings" ON readings FOR INSERT WITH CHECK (true);
CREATE POLICY "insert_alerts" ON alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "insert_system_logs" ON system_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "insert_storage_usage" ON storage_usage FOR INSERT WITH CHECK (true);

-- Cihaz ve config yazma (admin arayüzünden)
CREATE POLICY "manage_devices" ON devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "manage_tank_configs" ON tank_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "manage_alerts" ON alerts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "manage_app_users" ON app_users FOR ALL USING (true) WITH CHECK (true);

-- ┌──────────────────────────────────────────┐
-- │  10. ÖRNEK VERİLER                       │
-- └──────────────────────────────────────────┘

-- Örnek cihaz
INSERT INTO devices (device_id, device_type, name, firmware_version, is_active, api_key)
VALUES
    ('TANK-001', 'tank', 'Ana Depo Tankı', '1.0.0', true, 'dev_key_tank001_abc123'),
    ('TANK-002', 'tank', 'Yedek Tank', '1.0.0', true, 'dev_key_tank002_def456')
ON CONFLICT (device_id) DO NOTHING;

-- Örnek tank config
INSERT INTO tank_configs (device_id, tank_height_cm, tank_name, raw_per_cm, alert_low_percent, alert_high_percent, read_interval_sec)
VALUES
    ('TANK-001', 200, 'Ana Depo', 17.9, 10, 95, 300),
    ('TANK-002', 150, 'Yedek Depo', 17.9, 15, 90, 600)
ON CONFLICT (device_id) DO NOTHING;

-- Örnek admin kullanıcı notu: Supabase Auth üzerinden kayıt olunduktan sonra
-- app_users tablosuna admin rolü ile eklenmelidir.

-- ┌──────────────────────────────────────────┐
-- │  11. CRON TEMİZLİK (Supabase pg_cron)   │
-- │  Dashboard > Database > Extensions       │
-- │  pg_cron aktif edilmeli                   │
-- └──────────────────────────────────────────┘

-- Günde 1 kez gece 03:00'te eski veri temizliği
-- SELECT cron.schedule('cleanup-old-data', '0 3 * * *', 'SELECT cleanup_old_data()');
