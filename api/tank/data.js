import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fjriivwnqryrkfswsewt.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST: Cihazdan veri al
  if (req.method === 'POST') {
    try {
      const apiKey = req.headers['x-api-key'];
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';

      // API Key kontrolü
      if (!apiKey) {
        return res.status(401).json({ error: 'X-API-Key header gerekli' });
      }

      // Cihazı bul
      const { data: device, error: devErr } = await supabase
        .from('devices')
        .select('device_id, is_active')
        .eq('api_key', apiKey)
        .single();

      if (devErr || !device) {
        await logEvent('WARNING', 'api', `Geçersiz API key ile erişim denemesi`, { api_key_prefix: apiKey.substring(0, 8) }, ip);
        return res.status(403).json({ error: 'Geçersiz API key' });
      }

      if (!device.is_active) {
        return res.status(403).json({ error: 'Cihaz devre dışı' });
      }

      const { raw_value, temperature, battery_voltage, rssi } = req.body;

      if (raw_value === undefined || raw_value === null) {
        return res.status(400).json({ error: 'raw_value gerekli' });
      }

      // process_tank_reading fonksiyonunu çağır
      const { data, error } = await supabase.rpc('process_tank_reading', {
        p_device_id: device.device_id,
        p_raw_value: parseFloat(raw_value),
        p_temperature: temperature != null ? parseFloat(temperature) : null,
        p_battery_voltage: battery_voltage != null ? parseFloat(battery_voltage) : null,
        p_rssi: rssi != null ? parseInt(rssi) : null,
        p_ip_address: ip
      });

      if (error) {
        await logEvent('ERROR', 'api', `Tank veri işleme hatası: ${error.message}`, { device_id: device.device_id }, ip);
        return res.status(500).json({ error: 'Veri işlenemedi', detail: error.message });
      }

      return res.status(201).json({
        ok: true,
        ...data
      });

    } catch (err) {
      return res.status(500).json({ error: 'Sunucu hatası', detail: err.message });
    }
  }

  // GET: Tüm cihazların son verileri
  if (req.method === 'GET') {
    try {
      const { device_id, limit = 50, from, to } = req.query;

      let query = supabase
        .from('readings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (device_id) query = query.eq('device_id', device_id);
      if (from) query = query.gte('created_at', from);
      if (to) query = query.lte('created_at', to);

      const { data, error } = await query;

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ data, count: data.length });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function logEvent(level, source, message, metadata = {}, ip = null) {
  try {
    await supabase.from('system_logs').insert({ level, source, message, metadata, ip_address: ip });
  } catch (e) {
    console.error('Log yazma hatası:', e);
  }
}
