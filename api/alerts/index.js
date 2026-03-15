import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fjriivwnqryrkfswsewt.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: Alarmları listele
  if (req.method === 'GET') {
    const { device_id, active_only = 'true', limit = 50 } = req.query;

    let query = supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (device_id) query = query.eq('device_id', device_id);
    if (active_only === 'true') query = query.eq('acknowledged', false);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ data });
  }

  // PUT: Alarm onayla
  if (req.method === 'PUT') {
    const { id, acknowledge_all, device_id } = req.body;

    if (acknowledge_all && device_id) {
      const { error } = await supabase
        .from('alerts')
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('device_id', device_id)
        .eq('acknowledged', false);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, message: `${device_id} alarmları onaylandı` });
    }

    if (!id) return res.status(400).json({ error: 'id veya acknowledge_all + device_id gerekli' });

    const { error } = await supabase
      .from('alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
