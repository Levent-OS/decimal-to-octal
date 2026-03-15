import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fjriivwnqryrkfswsewt.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, password, username, role } = req.body;

  // Login
  if (action === 'login') {
    if (!email || !password) {
      return res.status(400).json({ error: 'email ve password gerekli' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    // Kullanıcı rolünü getir
    const { data: profile } = await supabase
      .from('app_users')
      .select('username, role')
      .eq('auth_id', data.user.id)
      .single();

    return res.status(200).json({
      ok: true,
      session: data.session,
      user: {
        id: data.user.id,
        email: data.user.email,
        username: profile?.username || email.split('@')[0],
        role: profile?.role || 'viewer'
      }
    });
  }

  // Register (admin only - basit implementasyon)
  if (action === 'register') {
    if (!email || !password) {
      return res.status(400).json({ error: 'email ve password gerekli' });
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });

    // Profil oluştur
    if (data.user) {
      await supabase.from('app_users').insert({
        auth_id: data.user.id,
        username: username || email.split('@')[0],
        role: role || 'viewer'
      });
    }

    await logEvent('INFO', 'auth', `Yeni kullanıcı kaydedildi: ${email}`);

    return res.status(201).json({
      ok: true,
      message: 'Kullanıcı oluşturuldu',
      user_id: data.user?.id
    });
  }

  return res.status(400).json({ error: 'Geçersiz action. login veya register kullanın.' });
}

async function logEvent(level, source, message) {
  try {
    await supabase.from('system_logs').insert({ level, source, message });
  } catch (e) { console.error(e); }
}
