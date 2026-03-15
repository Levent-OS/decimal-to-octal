import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fjriivwnqryrkfswsewt.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: Cihaz listesi
  if (req.method === 'GET') {
    const { active_only } = req.query;

    let query = supabase
      .from('devices')
      .select(`
        *,
        tank_configs(*),
        readings(level_cm, level_percent, temperature, battery_voltage, rssi, created_at)
      `)
      .order('created_at', { foreignTable: 'readings', ascending: false })
      .limit(1, { foreignTable: 'readings' });

    if (active_only === 'true') {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('device_id');

    if (error) return res.status(500).json({ error: error.message });

    // Flatten latest reading
    const devices = (data || []).map(d => ({
      ...d,
      tank_config: d.tank_configs || null,
      latest_reading: d.readings?.[0] || null,
      tank_configs: undefined,
      readings: undefined
    }));

    return res.status(200).json({ data: devices });
  }

  // POST: Yeni cihaz ekle
  if (req.method === 'POST') {
    const { device_id, device_type, name, firmware_version, tank_height_cm } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'device_id gerekli' });
    }

    // API key oluştur
    const apiKey = `dev_key_${device_id.toLowerCase()}_${Date.now().toString(36)}`;

    const { data: device, error } = await supabase
      .from('devices')
      .insert({
        device_id,
        device_type: device_type || 'tank',
        name: name || device_id,
        firmware_version: firmware_version || '1.0.0',
        api_key: apiKey,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Bu device_id zaten mevcut' });
      }
      return res.status(500).json({ error: error.message });
    }

    // Tank config oluştur
    if (device_type === 'tank' || !device_type) {
      await supabase.from('tank_configs').insert({
        device_id,
        tank_height_cm: tank_height_cm || 200,
        tank_name: name || device_id
      });
    }

    await logEvent('INFO', 'api', `Yeni cihaz eklendi: ${device_id}`);

    return res.status(201).json({ data: device, api_key: apiKey });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function logEvent(level, source, message) {
  try {
    await supabase.from('system_logs').insert({ level, source, message });
  } catch (e) { console.error(e); }
}
