import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fjriivwnqryrkfswsewt.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Tablo istatistikleri
    const { data: stats } = await supabase.rpc('get_table_stats');

    // Aktif cihaz sayısı
    const { count: activeDevices } = await supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // Çevrimdışı cihazlar (son 10 dakikada veri gelmemiş)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: offlineDevices } = await supabase
      .from('devices')
      .select('device_id, name, last_seen')
      .eq('is_active', true)
      .or(`last_seen.is.null,last_seen.lt.${tenMinAgo}`);

    // Aktif alarm sayısı
    const { count: activeAlerts } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('acknowledged', false);

    // Son hatalar
    const { data: recentErrors } = await supabase
      .from('system_logs')
      .select('*')
      .in('level', ['ERROR', 'CRITICAL'])
      .order('created_at', { ascending: false })
      .limit(10);

    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      stats: stats || {},
      active_devices: activeDevices || 0,
      offline_devices: offlineDevices || [],
      active_alerts: activeAlerts || 0,
      recent_errors: recentErrors || [],
      platform: 'vercel',
      database: 'supabase'
    });

  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
}
