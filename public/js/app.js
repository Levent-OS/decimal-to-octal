/* ═══════════════════════════════════════
   DEVELOPARDUS — Supabase Config & Utils
   ═══════════════════════════════════════ */

const SUPABASE_URL = 'https://fjriivwnqryrkfswsewt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cob7VpjVqSTw8h01NEBvwA_X7Fb0pQy';

// Supabase client init
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth Helpers ──
function getSession() {
  const s = localStorage.getItem('dev_session');
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function getUser() {
  const u = localStorage.getItem('dev_user');
  if (!u) return null;
  try { return JSON.parse(u); } catch { return null; }
}

function requireAuth() {
  const session = getSession();
  if (!session) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('dev_session');
  localStorage.removeItem('dev_user');
  window.location.href = '/login.html';
}

// ── Sidebar Builder ──
function buildSidebar(activePage) {
  const user = getUser();
  return `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="logo">D</div>
        <div>
          <div class="brand-text">Developardus</div>
          <div class="brand-sub">IoT Monitor</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <a href="/" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">
          <span class="nav-icon">◫</span> Dashboard
        </a>
        <a href="/tank.html" class="nav-link ${activePage === 'tank' ? 'active' : ''}">
          <span class="nav-icon">▧</span> Tanklar
        </a>
        <a href="/health.html" class="nav-link ${activePage === 'health' ? 'active' : ''}">
          <span class="nav-icon">♡</span> Sağlık
        </a>
        <a href="/system.html" class="nav-link ${activePage === 'system' ? 'active' : ''}">
          <span class="nav-icon">⚙</span> Sistem
          <span class="nav-badge" id="alertBadge" style="display:none;">0</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="status-badge">
          <span class="dot dot-ok" id="sbStatusDot"></span>
          <span id="sbStatusText">Supabase bağlı</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>${user?.username || 'Kullanıcı'} (${user?.role || 'viewer'})</span>
          <button onclick="logout()" class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px;">Çıkış</button>
        </div>
      </div>
    </div>`;
}

function buildTopbar(title) {
  return `
    <div class="topbar">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="mobile-toggle" onclick="toggleSidebar()">☰</button>
        <div class="topbar-title">${title}</div>
      </div>
      <div class="topbar-actions">
        <span class="topbar-time" id="topbarTime"></span>
        <button class="btn btn-ghost btn-sm" onclick="refreshPage()">↻ Yenile</button>
      </div>
    </div>`;
}

// ── Time Display ──
function updateTime() {
  const el = document.getElementById('topbarTime');
  if (el) {
    el.textContent = new Date().toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
}

// ── Toast ──
function showToast(msg, type = 'success') {
  let el = document.getElementById('globalToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast ' + type;
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Mobile Sidebar Toggle ──
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

// ── Formatters ──
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateFull(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return 'hiç';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa`;
  return `${Math.floor(hrs / 24)} gün`;
}

function isOnline(lastSeen, thresholdMin = 10) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < thresholdMin * 60 * 1000;
}

function levelColor(pct) {
  if (pct <= 10) return 'var(--danger)';
  if (pct <= 25) return 'var(--warn)';
  return 'var(--ok)';
}

// ── Gauge SVG ──
function createGauge(percent, label, color) {
  const angle = (percent / 100) * 180;
  const rad = (a) => (a - 180) * Math.PI / 180;
  const r = 60;
  const cx = 80, cy = 80;
  const x1 = cx + r * Math.cos(rad(0));
  const y1 = cy + r * Math.sin(rad(0));
  const x2 = cx + r * Math.cos(rad(angle));
  const y2 = cy + r * Math.sin(rad(angle));
  const large = angle > 180 ? 1 : 0;

  return `
    <div class="gauge-wrap">
      <svg class="gauge-svg" viewBox="0 0 160 100">
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}"
          fill="none" stroke="var(--bg-3)" stroke-width="10" stroke-linecap="round"/>
        <path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}"
          fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
          style="transition: all 0.8s ease;"/>
        <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="var(--t1)"
          font-family="IBM Plex Mono" font-size="22" font-weight="600">${percent}%</text>
      </svg>
      <div class="gauge-label">${label}</div>
    </div>`;
}

// ── Tank Bar ──
function createTankBar(percent) {
  const color = levelColor(percent);
  return `
    <div class="tank-bar-wrap">
      <div class="tank-bar-fill" style="height:${percent}%;background:${color};opacity:0.7;"></div>
      <div class="tank-bar-label">${percent}%</div>
    </div>`;
}

// ── Alert Badge ──
async function updateAlertBadge() {
  try {
    const { count } = await sb
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('acknowledged', false);

    const badge = document.getElementById('alertBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) { /* silent */ }
}

// ── Generic Refresh ──
function refreshPage() {
  if (typeof loadPageData === 'function') {
    loadPageData();
    showToast('Veriler güncellendi');
  } else {
    location.reload();
  }
}

// ── Init ──
function initPage(activePage, title) {
  // Don't require auth for login page
  if (activePage !== 'login' && !getSession()) {
    window.location.href = '/login.html';
    return false;
  }

  if (activePage !== 'login') {
    document.getElementById('sidebarMount').innerHTML = buildSidebar(activePage);
    document.getElementById('topbarMount').innerHTML = buildTopbar(title);
    updateTime();
    setInterval(updateTime, 1000);
    updateAlertBadge();
    setInterval(updateAlertBadge, 30000);
  }

  return true;
}
