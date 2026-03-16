// js/app.js — RevTrack
'use strict';

const STATE = {
  user: null, vehicles: [],
  currentVehicleId: null, currentVehicleSvcs: [], currentVehicle: null,
};

function $(id) { return document.getElementById(id); }
function fmtKm(n) { return n != null ? Number(n).toLocaleString() + ' km' : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
function initials(u) { return ((u.first_name?.[0] || '') + (u.last_name?.[0] || '')).toUpperCase() || '?'; }

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = (type === 'success' ? '✓  ' : '✕  ') + msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}
function setLoading(id, on, txt) {
  const b = $(id); if (!b) return;
  b.disabled = on; if (txt) b.textContent = on ? 'Please wait…' : txt;
}
function showError(id, msg) { const e = $(id); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }
function hideError(id)      { const e = $(id); if (e) e.classList.add('hidden'); }

// ── AUTH ──────────────────────────────────────────────────────────────────
function goPage(id) {
  document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
  $(id).classList.add('active');
}
function logout() {
  api.clearToken(); STATE.user = null; STATE.vehicles = [];
  $('P_app').classList.remove('active'); goPage('P_login');
}

async function login() {
  hideError('loginError');
  const email = $('li_email').value.trim(), pass = $('li_pass').value;
  if (!email || !pass) return showError('loginError', 'Please enter email and password.');
  setLoading('loginBtn', true, 'Sign in →');
  try {
    const d = await api.login(email, pass);
    api.setToken(d.token); STATE.user = d.user; await bootApp();
  } catch (e) { showError('loginError', e.message || 'Invalid credentials.'); }
  finally { setLoading('loginBtn', false, 'Sign in →'); }
}

async function register() {
  hideError('registerError');
  const first = $('r_first').value.trim(), last = $('r_last').value.trim();
  const email = $('r_email').value.trim(), pass = $('r_pass').value;
  const phone = $('r_phone')?.value.trim() || '';
  if (!first || !email || !pass) return showError('registerError', 'First name, email and password are required.');
  if (pass.length < 8) return showError('registerError', 'Password must be at least 8 characters.');
  try {
    const d = await api.register({ first_name: first, last_name: last, email, phone: phone || null, password: pass, notify_email: true, notify_whatsapp: !!phone });
    api.setToken(d.token); STATE.user = d.user;
    await bootApp();
    nav(document.querySelector('[data-view=addVehicle]'));
  } catch (e) { showError('registerError', e.message || 'Registration failed.'); }
}

// ── BOOT ──────────────────────────────────────────────────────────────────
async function bootApp() {
  hydrateUser(STATE.user);
  $('P_login').classList.remove('active'); $('P_register').classList.remove('active');
  $('P_app').classList.add('active');
  await Promise.all([loadVehicles(), loadDashboard(), loadNotifBadge()]);
  fillProfileForm();
}

function hydrateUser(u) {
  const av = initials(u);
  ['SB_AV', 'PR_AV'].forEach(id => { const e = $(id); if (e) e.textContent = av; });
  $('SB_NAME').textContent = `${u.first_name} ${u.last_name || ''}`.trim();
  $('SB_EMAIL').textContent = u.email;
  $('PR_NAME').textContent  = `${u.first_name} ${u.last_name || ''}`.trim();
  $('PR_EMAIL').textContent = u.email;
}

// ── NAV ───────────────────────────────────────────────────────────────────
const VTITLES = {
  dashboard: 'Dashboard', vehicles: 'My Vehicles', vehicleDetail: 'Vehicle Detail',
  servicelog: 'Service Log', upcoming: 'Upcoming Services', notifications: 'Notifications',
  alerts: 'Alert Settings', addVehicle: 'Add Vehicle', profile: 'Profile & Settings',
};

function nav(el) {
  if (!el) return;
  const id = el.getAttribute('data-view');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = $('V_' + id);
  if (v) { v.classList.add('active'); v.classList.add('fu'); setTimeout(() => v.classList.remove('fu'), 400); }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  $('TB_TITLE').textContent = VTITLES[id] || id;
  if (id === 'vehicles')      loadVehiclesView();
  if (id === 'servicelog')    loadServiceLog();
  if (id === 'upcoming')      loadUpcoming();
  if (id === 'notifications') loadNotifications('');
  if (id === 'profile')       fillProfileForm();
}

async function loadNotifBadge() {
  try {
    const d = await api.getUpcoming();
    const c = (d.upcoming || []).filter(u => u.status === 'overdue' || u.status === 'urgent').length;
    $('NB').textContent = c; $('TOP_NB').textContent = c;
  } catch (e) {}
}

// ── ODOMETER PREDICTIONS MODAL ────────────────────────────────────────────
const PRED_CHECKS = [
  [500,    'both', '🛞', 'Tyre Pressure',          'Check all tyres cold. Cars: 30–35 psi. Bikes: 36–42 psi. Wrong pressure causes blowouts, poor handling and fast wear.', 'normal'],
  [5000,   'both', '🛢', 'Engine Oil Condition',   'Pull dipstick — healthy oil is amber/golden. Black or gritty = change overdue. Check level is between MIN and MAX marks.', 'critical'],
  [5000,   'bike', '⛓', 'Chain Slack & Lube',     'Check chain slack (25–35 mm). Dry or rusty links need lubrication. Hooked sprocket teeth = replace chain and sprockets together.', 'critical'],
  [10000,  'both', '🔋', 'Battery Voltage',        'Test with multimeter: 12.6V+ = healthy, 12.4V = charge, below 12V = replace. Check terminals for white corrosion powder.', 'high'],
  [10000,  'bike', '🪝', 'Sprocket Teeth Wear',    'Hooked or shark-fin shaped sprocket teeth = replace full chain+sprocket set. Never fit a new chain on worn sprockets.', 'critical'],
  [15000,  'both', '🔵', 'Brake Fluid Moisture',   'Brake fluid absorbs moisture over time lowering its boiling point. Contaminated fluid causes brake fade under hard braking.', 'high'],
  [15000,  'bike', '🏍', 'Fork Seal Leak',         'Run finger around base of each fork leg — any oil film = seal leaking. Leaking seals reduce front suspension damping.', 'high'],
  [20000,  'both', '💨', 'Idle Quality Check',     'Warm engine fully, observe idle. Should be smooth at 750–900 RPM. Rough or bouncing idle = spark plug, throttle body or vacuum leak.', 'high'],
  [20000,  'both', '🛑', 'Brake Pad Thickness',    'Look through caliper slot. Cars: below 3 mm = replace. Bikes: below 2 mm = dangerous. Worn pads cause rotor damage.', 'critical'],
  [25000,  'car',  '🔩', 'Suspension Bounce',      'Push each corner down hard and release. More than 2 bounces = worn shocks. Bad shocks increase braking distance.', 'high'],
  [25000,  'bike', '🔗', 'Clutch Engagement',      'Feel for judder, slip or chatter on engagement. Slipping clutch cannot transfer full engine power — check friction plates.', 'high'],
  [30000,  'both', '🌡', 'Coolant Condition',      'Check reservoir level (MIN–MAX). Healthy coolant: green/blue/orange. Rusty or milky = corrosion or head gasket leak.', 'critical'],
  [30000,  'both', '💨', 'Exhaust Smoke Check',    'Blue smoke = burning oil. White = coolant leak. Black = rich mixture. Check at cold startup and under acceleration.', 'high'],
  [35000,  'car',  '🔄', 'CV Joint Check',         'Full lock, drive slowly — clicking = worn CV joint. Replace before driveshaft fails and leaves you stranded.', 'high'],
  [40000,  'both', '🦾', 'Drive Belt Visual',      'Inspect all belts for cracks, fraying or glazing. Snapped timing belt = complete engine destruction with no warning.', 'critical'],
  [40000,  'car',  '🌀', 'Power Steering Fluid',   'Check fluid level and colour. Whining at full lock = low fluid or pump wear. Top up or flush per manufacturer spec.', 'normal'],
  [40000,  'bike', '🏁', 'Rear Suspension',        'Inspect rear suspension bearings and pivot bolts for play. Worn linkage makes rear end vague and dangerous at speed.', 'high'],
  [50000,  'both', '🏗', 'Chassis & Frame',        'Inspect frame rails for rust, cracks or fractures — especially near weld points. Structural rust is a roadworthiness failure.', 'critical'],
  [60000,  'car',  '⏰', 'Timing Belt — CRITICAL', 'Check manufacturer schedule NOW. Most belts fail at 60k–100k km with zero warning and cause complete engine destruction.', 'critical'],
  [70000,  'both', '🔧', 'Engine Mount Check',     'Worn mounts cause vibration through cabin at idle. Inspect rubber bushings for cracks — replace before complete failure.', 'high'],
  [80000,  'both', '⛽', 'Fuel Injector Service',  'Clogged injectors cause rough idle, misfires and poor economy. Cleaning or replacement at 80k restores combustion efficiency.', 'high'],
  [80000,  'car',  '🪛', 'Catalytic Converter',    'Rattling at startup = broken substrate. Rotten-egg smell = running rich. Failed cat reduces power and increases emissions.', 'high'],
  [100000, 'both', '🏎', '100k Major Inspection',  'Compression test, valve clearance, replace all belts/hoses/fluids, assess timing chain tensioner condition.', 'critical'],
  [120000, 'both', '🔴', 'Valve Clearance',        'Tight valves = hard starting and power loss. Loose = noise. Requires cam cover removal — do this at 120k milestone.', 'critical'],
  [150000, 'car',  '🔩', 'Full Suspension Overhaul', 'At 150k inspect and replace bushings, ball joints, tie rod ends and wheel bearings as needed.', 'critical'],
];

function openPredModal(km, type, vehicleName) {
  const checks = PRED_CHECKS.filter(([min, applies]) =>
    parseInt(km) >= min && (applies === 'both' || applies === type)
  ).map(([,, icon, name, desc, severity]) => ({ icon, name, desc, severity }));

  const col = { critical: '#DC2626', high: '#D97706', normal: '#16A34A' };
  const bg  = { critical: '#FEF2F2', high: '#FFFBEB', normal: '#F0FDF4' };
  const lbl = { critical: '⚠ Critical', high: '⚡ High', normal: '✓ Routine' };
  const critical = checks.filter(c => c.severity === 'critical').length;
  const high     = checks.filter(c => c.severity === 'high').length;
  const normal   = checks.filter(c => c.severity === 'normal').length;

  const old = $('PRED_MODAL'); if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'PRED_MODAL';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px)';
  el.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:660px;max-width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(15,23,42,0.2);display:flex;flex-direction:column">
      <div style="padding:1.25rem 1.5rem;border-bottom:1.5px solid #E2E8F0;display:flex;justify-content:space-between;align-items:flex-start;position:sticky;top:0;background:#fff;border-radius:16px 16px 0 0;z-index:1">
        <div>
          <div style="font-size:1.05rem;font-weight:800;color:#0F172A">🔍 Odometer Health Predictions</div>
          <div style="font-size:12px;color:#64748B;margin-top:3px">${vehicleName} · ${Number(km).toLocaleString()} km · ${checks.length} checks triggered</div>
        </div>
        <button onclick="document.getElementById('PRED_MODAL').remove()" style="background:#F1F5F9;border:none;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:0.9rem">✕</button>
      </div>
      <div style="padding:0.9rem 1.5rem 0;display:flex;gap:8px;flex-wrap:wrap">
        ${critical > 0 ? `<span style="background:#FEF2F2;color:#DC2626;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">⚠ ${critical} Critical</span>` : ''}
        ${high     > 0 ? `<span style="background:#FFFBEB;color:#D97706;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">⚡ ${high} High</span>` : ''}
        ${normal   > 0 ? `<span style="background:#F0FDF4;color:#16A34A;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">✓ ${normal} Routine</span>` : ''}
      </div>
      <div style="margin:0.9rem 1.5rem 0;background:#ECFEFF;border:1px solid rgba(8,145,178,0.2);border-radius:10px;padding:0.7rem 1rem;font-size:12px;color:#0891B2">
        📖 These are <strong>physical inspection checks</strong> predicted from your odometer — seals, cables, mounts, chassis, bearings. Separate from your scheduled service intervals shown below.
      </div>
      <div style="padding:1.1rem 1.5rem;display:flex;flex-direction:column;gap:9px">
        ${checks.length === 0
          ? '<div style="text-align:center;padding:2rem;color:#94A3B8">✅ No checks triggered yet. More appear as km increases.</div>'
          : checks.map(c => `
            <div style="display:flex;gap:12px;align-items:flex-start;border:1.5px solid #E2E8F0;border-left:4px solid ${col[c.severity]};border-radius:10px;padding:0.85rem 1rem">
              <div style="font-size:1.4rem;line-height:1;flex-shrink:0;margin-top:1px">${c.icon}</div>
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                  <span style="font-size:0.87rem;font-weight:800;color:#0F172A">${c.name}</span>
                  <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${bg[c.severity]};color:${col[c.severity]}">${lbl[c.severity]}</span>
                </div>
                <div style="font-size:0.81rem;color:#334155;line-height:1.6">${c.desc}</div>
              </div>
            </div>`).join('')}
      </div>
      <div style="padding:1rem 1.5rem;border-top:1.5px solid #E2E8F0;display:flex;justify-content:flex-end;background:#F8FAFF;border-radius:0 0 16px 16px">
        <button onclick="document.getElementById('PRED_MODAL').remove()" style="background:#E85D1A;color:#fff;border:none;border-radius:10px;padding:8px 24px;font-size:0.88rem;font-weight:700;cursor:pointer">Close</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [vData, upData, notifData, svcData] = await Promise.all([
      api.getVehicles(), api.getUpcoming(), api.getNotifications(), api.getServices()
    ]);
    const vehicles = vData.vehicles || [], upcoming = upData.upcoming || [];
    const notifs = notifData.notifications || [], services = svcData.records || [];
    const overdue = upcoming.filter(u => u.status === 'overdue').length;
    const dueSoon = upcoming.filter(u => u.status === 'warning' || u.status === 'urgent').length;

    $('dashStats').innerHTML = `
      <div class="sc"><div class="sc-accent" style="background:var(--accent)"></div><div class="sc-label">Total Vehicles</div><div class="sc-val">${vehicles.length}</div><div class="sc-sub">${vehicles.filter(v=>v.type==='car').length} Cars · ${vehicles.filter(v=>v.type==='bike').length} Bikes</div></div>
      <div class="sc"><div class="sc-accent" style="background:var(--red)"></div><div class="sc-label">Overdue</div><div class="sc-val">${overdue}</div><div class="sc-sub">Action required now</div></div>
      <div class="sc"><div class="sc-accent" style="background:var(--amber)"></div><div class="sc-label">Due Soon</div><div class="sc-val">${dueSoon}</div><div class="sc-sub">Schedule soon</div></div>
      <div class="sc"><div class="sc-accent" style="background:var(--green)"></div><div class="sc-label">Services Done</div><div class="sc-val">${services.length}</div><div class="sc-sub">Total logged</div></div>`;

    if (overdue > 0) {
      $('alertTitle').textContent = `${overdue} service${overdue > 1 ? 's' : ''} overdue!`;
      $('alertMsg').textContent = upcoming.filter(u => u.status === 'overdue').slice(0, 2).map(u => `${u.vehicleName} — ${u.service_name}`).join(' · ');
      $('alertStrip').classList.remove('hidden');
    }

    $('dashUpcoming').innerHTML = upcoming.slice(0, 5).map(upRow).join('') || '<div class="loading-row">All services up to date ✓</div>';
    $('dashAlerts').innerHTML = notifs.slice(0, 4).map(n => `
      <div class="up-item">
        <div class="up-ico" style="background:${n.type==='overdue'?'var(--red-dim)':n.type==='completion'?'var(--green-dim)':'var(--amber-dim)'}">
          ${n.type==='overdue'?'🚨':n.type==='completion'?'✅':'⚠'}
        </div>
        <div class="up-info">
          <div class="up-svc">${n.service_name || 'Notification'}</div>
          <div class="up-veh"><span class="ni-channel ch-em">✉ Email</span> · ${fmtDate(n.sent_at || n.created_at)}</div>
        </div>
      </div>`).join('') || '<div class="loading-row">No alerts yet</div>';

    $('dashVehicles').innerHTML = vehicles.map(vehicleCard).join('');
  } catch (e) { console.error('Dashboard error:', e); }
}

function upRow(u) {
  const ico = u.service_name?.toLowerCase().includes('oil') ? '🛢' : u.service_name?.toLowerCase().includes('brake') ? '🔵' : u.service_name?.toLowerCase().includes('air') ? '🌬' : u.service_name?.toLowerCase().includes('chain') ? '⛓' : '🔧';
  const cls = u.status === 'overdue' ? 'due-red' : u.status === 'urgent' ? 'due-warn' : 'due-ok';
  const lbl = u.status === 'overdue' ? 'Overdue' : u.kmLeft != null ? `${u.kmLeft} km left` : 'Due soon';
  const bg  = u.status === 'overdue' ? 'var(--red-dim)' : u.status === 'urgent' ? 'var(--amber-dim)' : 'var(--green-dim)';
  return `<div class="up-item"><div class="up-ico" style="background:${bg}">${ico}</div><div class="up-info"><div class="up-svc">${u.service_name}</div><div class="up-veh">${u.vehicleName}</div></div><div class="up-due ${cls}">${lbl}</div></div>`;
}

// ── VEHICLES ──────────────────────────────────────────────────────────────
async function loadVehicles() {
  try { const d = await api.getVehicles(); STATE.vehicles = d.vehicles || []; populateSelects(); } catch (e) {}
}

function populateSelects() {
  const opts = STATE.vehicles.map(v => `<option value="${v.id}">${v.make} ${v.model} (${v.registration || v.year})</option>`).join('');
  const s = $('log_vehicle'); if (s) s.innerHTML = '<option value="">Select vehicle</option>' + opts;
  const f = $('filterVehicle'); if (f) f.innerHTML = '<option value="">All Vehicles</option>' + opts;
}

function vehicleCard(v) {
  const emoji = v.type === 'bike' ? '🏍' : '🚗';
  const bg = v.type === 'bike' ? 'linear-gradient(135deg,#ECFEFF,#CFFAFE)' : 'linear-gradient(135deg,#EFF6FF,#DBEAFE)';
  return `<div class="vh-card" onclick="openVehicleDetail('${v.id}')">
    <div class="vh-img" style="background:${bg}">
      <div class="vh-emoji">${emoji}</div>
      <div class="vh-badge-type">${v.type === 'bike' ? 'Bike' : 'Car'} · ${v.fuel_type}</div>
      <div class="vh-sdot sdot-warn"></div>
    </div>
    <div class="vh-body">
      <div class="vh-name">${v.make} ${v.model}</div>
      <div class="vh-sub">${v.year} · ${v.registration || '—'} · ${fmtKm(v.current_km)}</div>
      <div class="vh-pills">
        <span class="pill pill-ok">${v.fuel_type}</span>
        <span class="pill pill-ok">${v.transmission || 'Manual'}</span>
      </div>
    </div>
  </div>`;
}

async function loadVehiclesView() {
  await loadVehicles();
  const el = $('vehiclesList'); if (!el) return;
  if (!STATE.vehicles.length) {
    el.innerHTML = `<div class="empty-state"><div class="es-icon">🚗</div><p>No vehicles yet.</p></div>
      <div class="add-card" onclick="nav(document.querySelector('[data-view=addVehicle]'))"><div style="font-size:2rem;margin-bottom:8px">＋</div><div style="font-size:0.85rem;font-weight:500">Add your first vehicle</div></div>`;
    return;
  }
  el.innerHTML = STATE.vehicles.map(vehicleCard).join('') +
    `<div class="add-card" onclick="nav(document.querySelector('[data-view=addVehicle]'))"><div style="font-size:2rem;margin-bottom:8px">＋</div><div style="font-size:0.85rem;font-weight:500">Add new vehicle</div></div>`;
}

// ── VEHICLE DETAIL ────────────────────────────────────────────────────────
async function openVehicleDetail(id) {
  STATE.currentVehicleId = id;
  $('VD_CONTENT').innerHTML = '<div class="loading-row" style="padding:3rem;text-align:center">Loading vehicle data…</div>';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('V_vehicleDetail').classList.add('active');
  $('TB_TITLE').textContent = 'Vehicle Detail';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  try {
    const data = await api.getHealth(id);
    const v = data.vehicle;
    const seen = new Set();
    const svcs = (data.services || []).filter(s => { if (seen.has(s.service_name)) return false; seen.add(s.service_name); return true; });

    STATE.currentVehicleSvcs = svcs;
    STATE.currentVehicle     = v;

    const emoji    = v.type === 'bike' ? '🏍' : '🚗';
    const overdue  = svcs.filter(s => s.status === 'overdue').length;
    const warn     = svcs.filter(s => s.status === 'warning' || s.status === 'urgent').length;
    const ok       = svcs.filter(s => s.status === 'ok').length;
    const predCount = PRED_CHECKS.filter(([min, applies]) => parseInt(v.current_km) >= min && (applies === 'both' || applies === v.type)).length;
    const predCrit  = PRED_CHECKS.filter(([min, applies,,,, sev]) => parseInt(v.current_km) >= min && (applies === 'both' || applies === v.type) && sev === 'critical').length;

    let html = `
      <div class="vd-header">
        <div class="vd-emo">${emoji}</div>
        <div class="vd-info">
          <h1>${v.make} ${v.model}</h1>
          <p>${v.year} · ${v.registration || '—'} · ${v.engine_cc || ''} · ${v.transmission || ''}</p>
          <div class="vd-chips">
            <span class="chip">${v.type === 'bike' ? 'Bike' : 'Car'}</span>
            <span class="chip">${v.fuel_type}</span>
            <span class="chip">${fmtKm(v.current_km)}</span>
          </div>
        </div>
        <div class="vd-pred-btn">
          <button class="pred-btn" onclick="openPredModal(${v.current_km},'${v.type}','${v.make} ${v.model}')">
            🔍 Odometer Predictions <span class="pred-count">${predCount}</span>
          </button>
          ${predCrit > 0 ? `<span style="font-size:10px;color:var(--red);font-weight:700">⚠ ${predCrit} critical checks</span>` : ''}
        </div>
      </div>

      <div class="vd-actions">
        <button class="btn-prim" style="font-size:0.82rem;padding:7px 14px" onclick="openLogModalFor('${v.id}')">＋ Log Service</button>
        <button class="btn-sec"  style="font-size:0.82rem;padding:7px 14px" onclick="openIntervalModal('${v.id}')">⏱ Set Intervals</button>
        <button class="btn-sec"  style="font-size:0.82rem;padding:7px 14px" onclick="openKmModal('${v.id}','${v.make} ${v.model}',${v.current_km})">Update Odometer</button>
        ${svcs.length === 0 ? `<button class="btn-sec" style="font-size:0.82rem;padding:7px 14px;color:var(--green);border-color:var(--green)" onclick="resyncVehicle('${v.id}')">⟳ Sync Services</button>` : ''}
        <button class="btn-sec"  style="font-size:0.82rem;padding:7px 14px;color:var(--text3)" onclick="confirmDeleteVehicle('${v.id}','${v.make} ${v.model}')">Remove</button>
      </div>

      <div class="stats-row">
        <div class="sc"><div class="sc-accent" style="background:var(--red)"></div><div class="sc-label">Overdue</div><div class="sc-val">${overdue}</div><div class="sc-sub">Fix immediately</div></div>
        <div class="sc"><div class="sc-accent" style="background:var(--amber)"></div><div class="sc-label">Due Soon</div><div class="sc-val">${warn}</div><div class="sc-sub">Schedule soon</div></div>
        <div class="sc"><div class="sc-accent" style="background:var(--green)"></div><div class="sc-label">Healthy</div><div class="sc-val">${ok}</div><div class="sc-sub">Up to date</div></div>
        <div class="sc"><div class="sc-accent" style="background:var(--blue)"></div><div class="sc-label">Total Checks</div><div class="sc-val">${svcs.length}</div><div class="sc-sub">Tracked services</div></div>
      </div>

      <div class="sec-title">Service Tracking <span style="font-size:11px;color:var(--text4);font-weight:500">${svcs.length} services</span></div>

      <!-- ✏ Editable note banner -->
      <div class="svc-edit-note">
        ✏️ <strong>Oil grade and quantity are pre-filled from manufacturer defaults.</strong>
        Your vehicle may use a different spec or capacity — click the <span class="svc-edit-badge">✏ Edit</span> button on any card to update the oil grade and quantity for that service.
      </div>

      <div class="svc-grid">`;

    svcs.forEach(s => {
      const pct   = s.pct != null ? Math.min(100, s.pct) : 0;
      const pc    = s.status === 'overdue' ? 'pf-r' : s.status === 'warning' || s.status === 'urgent' ? 'pf-a' : 'pf-g';
      const bc    = s.status === 'overdue' ? 'b-due' : s.status === 'warning' || s.status === 'urgent' ? 'b-warn' : 'b-ok';
      const bt    = s.status === 'overdue' ? 'Overdue' : s.status === 'warning' ? 'Due Soon' : s.status === 'urgent' ? 'Urgent' : 'Healthy';
      const bcolor = s.status === 'overdue' ? 'var(--red)' : s.status === 'warning' || s.status === 'urgent' ? 'var(--amber)' : 'var(--green)';
      const leftTxt = s.kmLeft == null ? '—'
        : s.kmLeft < 0   ? `<span style="color:var(--red);font-weight:800">${Math.abs(s.kmLeft).toLocaleString()} km overdue</span>`
        : s.kmLeft < 500 ? `<span style="color:var(--red);font-weight:800">${s.kmLeft.toLocaleString()} km left</span>`
        : s.kmLeft < 1500? `<span style="color:var(--amber);font-weight:700">${s.kmLeft.toLocaleString()} km left</span>`
        :                  `<span style="color:var(--green);font-weight:700">${s.kmLeft.toLocaleString()} km left</span>`;

      // Safe IDs for inline editing
      const safeId = s.catalogue_id ? s.catalogue_id.replace(/-/g,'') : 'x';

      html += `
        <div class="svc-card" style="border-left:4px solid ${bcolor}" id="svc-card-${safeId}">
          <div class="svc-head">
            <div class="svc-name">${s.service_name}</div>
            <span class="badge ${bc}"><span class="b-dot"></span>${bt}</span>
          </div>
          <div class="svc-rows">
            <div class="r"><span class="rk">Last done at</span><span class="rv">${s.done_km ? fmtKm(s.done_km) : '<span style="color:var(--text4)">Never</span>'}</span></div>
            <div class="r"><span class="rk">Service interval</span><span class="rv">${[s.interval_km ? fmtKm(s.interval_km) : '', s.interval_months ? s.interval_months + ' months' : ''].filter(Boolean).join(' / ') || '—'}</span></div>
            <div class="r"><span class="rk">Next due at</span><span class="rv">${s.nextDueKm ? fmtKm(s.nextDueKm) : '—'}</span></div>
            <div class="r"><span class="rk">Remaining (km)</span><span class="rv">${leftTxt}</span></div>
            ${s.daysLeft != null ? `<div class="r"><span class="rk">Remaining (time)</span><span class="rv">${
              // Colour daysLeft based on WORST status (km overdue overrides days green)
              s.daysLeft < 0
                ? '<span style="color:var(--red);font-weight:800">' + Math.abs(s.daysLeft) + ' days overdue</span>'
                : s.status === 'overdue' || s.status === 'urgent' || s.daysLeft <= 7
                  ? '<span style="color:var(--amber);font-weight:700">' + s.daysLeft + ' days left</span>'
                  : '<span style="color:var(--green);font-weight:700">' + s.daysLeft + ' days left</span>'
            }</span></div>` : ''}

            <!-- Spec row — individual inline edit -->
            <div class="r" id="spec-row-${safeId}">
              <span class="rk">Oil / Fluid spec</span>
              <span class="ied-view" id="spec-view-${safeId}">
                <span class="rv" style="color:var(--accent)" id="spec-val-${safeId}">${s.spec || '—'}</span>
                <button class="ied-btn ied-edit" onclick="startInlineEdit('spec','${safeId}','${v.id}','${s.catalogue_id}')">&#xf044;</button>
              </span>
              <span class="ied-editing" id="spec-edit-${safeId}" style="display:none">
                <input class="ied-input" id="ied-spec-${safeId}" type="text" value="" placeholder="e.g. 5W-30 Synthetic" onkeydown="if(event.key==='Enter')saveInlineField('spec','${safeId}','${v.id}','${s.catalogue_id}');if(event.key==='Escape')cancelInlineEdit('spec','${safeId}')">
                <button class="ied-btn ied-save" onclick="saveInlineField('spec','${safeId}','${v.id}','${s.catalogue_id}')">✔</button>
                <button class="ied-btn ied-cancel" onclick="cancelInlineEdit('spec','${safeId}')">✕</button>
              </span>
            </div>

            <!-- Qty row — individual inline edit -->
            <div class="r" id="qty-row-${safeId}">
              <span class="rk">Quantity</span>
              <span class="ied-view" id="qty-view-${safeId}">
                <span class="rv" id="qty-val-${safeId}">${s.qty || '—'}</span>
                <button class="ied-btn ied-edit" onclick="startInlineEdit('qty','${safeId}','${v.id}','${s.catalogue_id}')">&#xf044;</button>
              </span>
              <span class="ied-editing" id="qty-edit-${safeId}" style="display:none">
                <input class="ied-input" id="ied-qty-${safeId}" type="text" value="" placeholder="e.g. 3.5 L" onkeydown="if(event.key==='Enter')saveInlineField('qty','${safeId}','${v.id}','${s.catalogue_id}');if(event.key==='Escape')cancelInlineEdit('qty','${safeId}')">
                <button class="ied-btn ied-save" onclick="saveInlineField('qty','${safeId}','${v.id}','${s.catalogue_id}')">✔</button>
                <button class="ied-btn ied-cancel" onclick="cancelInlineEdit('qty','${safeId}')">✕</button>
              </span>
            </div>
          </div>
          <div class="prog-wrap">
            <div class="prog-lbl"><span>Interval used</span><span style="color:${bcolor};font-weight:800">${pct}%</span></div>
            <div class="prog-bg"><div class="prog-fill ${pc}" style="width:${pct}%"></div></div>
          </div>
        </div>`;
    });

    html += '</div>';
    $('VD_CONTENT').innerHTML = html;
  } catch (e) {
    $('VD_CONTENT').innerHTML = `<div class="empty-state"><p>Failed to load vehicle: ${e.message}</p></div>`;
  }
}


// ── INLINE SPEC / QTY EDIT ────────────────────────────────────────────────

function startInlineEdit(field, safeId, vehicleId, catalogueId) {
  // Hide display, show input
  const view  = document.getElementById(`${field}-view-${safeId}`);
  const edit  = document.getElementById(`${field}-edit-${safeId}`);
  const input = document.getElementById(`ied-${field}-${safeId}`);
  if (!view || !edit || !input) return;

  // Get current displayed value to pre-fill (always fresh from DOM)
  const valEl = document.getElementById(`${field}-val-${safeId}`);
  const current = valEl?.textContent?.trim() || '';
  input.value = current === '—' ? '' : current;

  view.style.display = 'none';
  edit.style.display = 'flex';
  input.focus();
  input.select();
}

function cancelInlineEdit(field, safeId) {
  const view = document.getElementById(`${field}-view-${safeId}`);
  const edit = document.getElementById(`${field}-edit-${safeId}`);
  if (!view || !edit) return;
  view.style.display = 'flex';
  edit.style.display = 'none';
}

async function saveInlineField(field, safeId, vehicleId, catalogueId) {
  const input = document.getElementById(`ied-${field}-${safeId}`);
  if (!input) return;
  const value = input.value.trim();

  // Build payload — only send the changed field
  const payload = { catalogue_id: catalogueId };
  if (field === 'spec') payload.custom_spec = value || null;
  if (field === 'qty')  payload.custom_qty  = value || null;

  try {
    const res = await fetch(`${window.location.origin}/api/vehicles/${vehicleId}/spec`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // Update displayed value in-place — no full reload needed
    const valEl = document.getElementById(`${field}-val-${safeId}`);
    if (valEl) valEl.textContent = value || '—';

    cancelInlineEdit(field, safeId);
    showToast(`${field === 'spec' ? 'Oil spec' : 'Quantity'} updated!`);
  } catch (e) {
    showToast('Failed to save: ' + e.message, 'error');
  }
}


// ── SET INTERVALS MODAL ───────────────────────────────────────────────────
let _intVehicleId = null;

function openIntervalModal(vehicleId) {
  _intVehicleId = vehicleId;
  const svcs = STATE.currentVehicleSvcs || [];

  if (!svcs.length) {
    $('intervalBody').innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text4)">No services found.<br>Click ⟳ Sync Services on the vehicle page first.</div>';
    $('MODAL_INTERVAL').classList.add('open');
    return;
  }

  // Priority icons
  const priIco = { critical: '🔴', high: '🟠', normal: '🟢', low: '⚪' };

  // Month options dropdown
  const moOpts = (cur) => [1,2,3,4,5,6,8,10,12,18,24,36].map(m =>
    `<option value="${m}" ${parseInt(cur) === m ? 'selected' : ''}>${m} month${m > 1 ? 's' : ''}</option>`
  ).join('');

  const rows = svcs.map((s, i) => {
    // Show default value as placeholder hint
    const defKm = s.default_interval_km || s.interval_km;
    const defMo = s.default_interval_months || s.interval_months;
    const defLabel = [defKm ? defKm.toLocaleString() + ' km' : '', defMo ? defMo + ' mo' : ''].filter(Boolean).join(' / ') || 'No default';

    return `
    <div class="int-row" id="int-row-${i}">
      <div class="int-left">
        <span class="int-pri">${priIco[s.priority] || '⚪'}</span>
        <div>
          <div class="int-name">${s.service_name}</div>
          <div class="int-hint">Default: ${defLabel}</div>
        </div>
      </div>
      <div class="int-right">
        <div class="int-field-wrap">
          <input
            class="int-km-input"
            type="number"
            id="int_km_${i}"
            data-catalogue-id="${s.catalogue_id}"
            data-index="${i}"
            value="${s.interval_km || ''}"
            placeholder="${defKm || 'km'}"
            min="100" step="500"
          >
          <span class="int-unit-tag">km</span>
        </div>
        <span class="int-or">or</span>
        <div class="int-field-wrap">
          <select class="int-mo-select" id="int_mo_${i}">
            <option value="">months</option>
            ${moOpts(s.interval_months)}
          </select>
        </div>
      </div>
    </div>`;
  }).join('');

  $('intervalBody').innerHTML = rows;
  $('MODAL_INTERVAL').classList.add('open');
}

async function saveIntervals() {
  if (!_intVehicleId) return;
  const svcs = STATE.currentVehicleSvcs || [];
  let saved = 0, failed = 0;

  for (let i = 0; i < svcs.length; i++) {
    const kmEl = $(`int_km_${i}`);
    const moEl = $(`int_mo_${i}`);
    if (!kmEl) continue;

    const kmVal  = parseInt(kmEl.value)  || null;
    const moVal  = parseInt(moEl?.value) || null;
    const catId  = kmEl.dataset.catalogueId;

    if (!catId) { failed++; continue; }   // skip if no catalogue_id
    if (!kmVal && !moVal) continue;        // nothing entered — skip

    try {
      const res = await fetch(window.location.origin + `/api/vehicles/${_intVehicleId}/intervals`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
        body: JSON.stringify({ catalogue_id: catId, interval_km: kmVal, interval_months: moVal }),
      });
      const data = await res.json();
      if (data.success) {
        saved++;
        // Visual confirmation on the row
        const row = $(`int-row-${i}`);
        if (row) row.style.background = 'var(--green-dim, rgba(22,163,74,0.06))';
      } else { failed++; }
    } catch (e) { failed++; }
  }

  closeModal('MODAL_INTERVAL');
  if (saved > 0) {
    showToast(`✓ ${saved} interval${saved > 1 ? 's' : ''} saved! Refreshing...`);
    setTimeout(() => openVehicleDetail(_intVehicleId), 900);
  } else if (failed > 0) {
    showToast(`Failed to save ${failed} interval${failed > 1 ? 's' : ''}. Check catalogue IDs.`, 'error');
  } else {
    showToast('No intervals entered — nothing changed.');
  }
}

// ── ADD VEHICLE ───────────────────────────────────────────────────────────
function selVT(el) { el.closest('.vt-row').querySelectorAll('.vt-b').forEach(b => b.classList.remove('sel')); el.classList.add('sel'); }

async function addVehicle() {
  hideError('avError');
  const type  = document.querySelector('#vtRow .vt-b.sel')?.dataset.type || 'car';
  const make  = $('av_make').value, model = $('av_model').value.trim();
  const year  = parseInt($('av_year').value), fuel = $('av_fuel').value;
  const reg   = $('av_reg').value.trim(), km = parseInt($('av_km').value) || 0;
  const cc    = $('av_cc').value.trim(), tx = $('av_tx').value;
  if (!make || !model) return showError('avError', 'Make and model are required.');
  setLoading('avBtn', true);
  try {
    await api.addVehicle({ type, make, model, year, fuel_type: fuel, registration: reg, current_km: km, engine_cc: cc, transmission: tx });
    showToast('Vehicle added! Service schedule generated.');
    await loadVehicles();
    $('av_model').value = ''; $('av_reg').value = ''; $('av_km').value = '';
    nav(document.querySelector('[data-view=vehicles]'));
  } catch (e) { showError('avError', e.message || 'Failed to add vehicle.'); }
  finally { setLoading('avBtn', false); $('avBtn').textContent = 'Add Vehicle & Generate Service Schedule →'; }
}

// ── SERVICE LOG ───────────────────────────────────────────────────────────
async function loadServiceLog() {
  const vid = $('filterVehicle')?.value || '';
  const body = $('serviceLogBody'); if (!body) return;
  body.innerHTML = '<div class="loading-row">Loading...</div>';
  try {
    const data = await api.getServices(vid || null);
    const rows = data.records || [];
    if (!rows.length) { body.innerHTML = '<div class="loading-row">No service records yet.</div>'; return; }
    body.innerHTML = rows.map(r => `
      <div class="st-row">
        <div><div class="st-svc">${r.service_name}</div><div class="st-det">${r.spec_used || '—'}</div></div>
        <div style="font-size:0.83rem;color:var(--text2)">${r.make || ''} ${r.model || ''}</div>
        <div style="font-size:0.82rem;color:var(--text3)">${fmtDate(r.done_at)}</div>
        <div style="font-size:0.85rem;font-weight:700">${fmtKm(r.done_km)}</div>
        <div><span class="badge b-ok"><span class="b-dot"></span>Done</span></div>
        <div style="font-size:0.82rem;color:var(--green);font-weight:700">${r.next_due_km ? fmtKm(r.next_due_km) : '—'}</div>
      </div>`).join('');
  } catch (e) { body.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`; }
}

// ── UPCOMING ──────────────────────────────────────────────────────────────
async function loadUpcoming() {
  const el = $('upcomingList'); if (!el) return;
  el.innerHTML = '<div class="loading-row">Loading...</div>';
  try {
    const data = await api.getUpcoming(); const list = data.upcoming || [];
    if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="es-icon">✅</div><p>All vehicles up to date!</p></div>'; return; }
    el.innerHTML = list.map(u => {
      const cls = u.status === 'overdue' ? 'ni-due' : u.status === 'urgent' || u.status === 'warning' ? 'ni-warn' : '';
      const ico = u.status === 'overdue' ? '🚨' : '⚠';
      const lbl = u.status === 'overdue' ? `Overdue by ${Math.abs(u.kmLeft)} km` : u.kmLeft != null ? `${u.kmLeft} km left` : 'Due soon';
      return `<div class="ni-item ${cls}" style="margin-bottom:8px">
        <div class="ni-ico" style="background:${u.status==='overdue'?'var(--red-dim)':'var(--amber-dim)'}">${ico}</div>
        <div style="flex:1">
          <div class="ni-title">${u.service_name} — ${u.vehicleName}</div>
          <div class="ni-msg">${u.registration || ''} · Current: ${fmtKm(u.currentKm)} · Due at: ${fmtKm(u.nextDueKm)} · <strong>${lbl}</strong><br>Spec: ${u.spec || 'Per manufacturer'} · Qty: ${u.qty || '—'}</div>
          <div class="ni-meta"><span class="ni-time">Priority: ${u.priority || 'normal'}</span></div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`; }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────
async function loadNotifications(type) {
  const el = $('notifList'); if (!el) return;
  el.innerHTML = '<div class="loading-row">Loading...</div>';
  try {
    const data = await api.getNotifications(type || null); const list = data.notifications || [];
    if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="es-icon">🔔</div><p>No notifications yet.</p></div>'; return; }
    el.innerHTML = list.map(n => {
      const cls = n.type === 'overdue' ? 'ni-due' : n.type === 'warning' || n.type === 'urgent' ? 'ni-warn' : n.type === 'completion' ? 'ni-ok' : '';
      const ico = { overdue: '🚨', completion: '✅', welcome: '👋', digest: '📊', warning: '⚠', urgent: '🚨' }[n.type] || '🔔';
      const sc  = n.status === 'sent' ? 'var(--green)' : n.status === 'failed' ? 'var(--red)' : 'var(--amber)';
      return `<div class="ni-item ${cls}">
        <div class="ni-ico" style="background:var(--${n.type==='overdue'?'red':n.type==='completion'?'green':'amber'}-dim)">${ico}</div>
        <div style="flex:1">
          <div class="ni-title">${n.service_name || 'Notification'}${n.make ? ' — ' + n.make + ' ' + n.model : ''}</div>
          <div class="ni-msg">Sent to: ${n.recipient || '—'}</div>
          <div class="ni-meta">
            <span class="ni-time">${fmtDate(n.sent_at || n.created_at)}</span>
            <span class="ni-channel ch-em">✉ Email</span>
            <span style="font-size:10px;color:${sc};font-weight:700">${n.status}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`; }
}

function filterNotifs(type, el) {
  document.querySelectorAll('.nt').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); loadNotifications(type);
}

// ── LOG SERVICE MODAL ─────────────────────────────────────────────────────
function openLogModal() { $('log_date').value = new Date().toISOString().split('T')[0]; $('MODAL_LOG').classList.add('open'); }
function openLogModalFor(vid) { $('log_date').value = new Date().toISOString().split('T')[0]; $('log_vehicle').value = vid; loadCatalogueForVehicle(); $('MODAL_LOG').classList.add('open'); }

async function loadCatalogueForVehicle() {
  const vid = $('log_vehicle').value; if (!vid) return;
  const vehicle = STATE.vehicles.find(v => v.id === vid); if (!vehicle) return;
  try {
    const data = await api.getCatalogue(vehicle.type, vehicle.fuel_type);
    const opts = (data.catalogue || []).map(c => `<option value="${c.id}" data-spec="${c.default_spec || ''}" data-qty="${c.default_qty || ''}">${c.service_name}</option>`).join('');
    $('log_service').innerHTML = '<option value="">Select service</option>' + opts;
    $('log_service').onchange = () => {
      const opt = $('log_service').selectedOptions[0];
      if (opt && opt.dataset.spec) $('log_spec').value = opt.dataset.spec + (opt.dataset.qty ? ' · ' + opt.dataset.qty : '');
    };
  } catch (e) {}
}

async function logService() {
  hideError('logError');
  const vid = $('log_vehicle').value, svc = $('log_service').value;
  const svcName = $('log_service').selectedOptions[0]?.text || '';
  const date = $('log_date').value, km = parseInt($('log_km').value);
  const spec = $('log_spec').value.trim(), cost = parseFloat($('log_cost').value) || null;
  const ws = $('log_workshop').value.trim(), notes = $('log_notes').value.trim();
  if (!vid || !date || !km) return showError('logError', 'Vehicle, date and odometer are required.');
  setLoading('logBtn', true);
  try {
    await api.logService({ vehicle_id: vid, catalogue_id: svc || null, service_name: svcName, done_at: date, done_km: km, spec_used: spec, cost, workshop: ws, notes });
    closeModal('MODAL_LOG');
    showToast('Service logged! Email confirmation sent.');
    await Promise.all([loadDashboard(), loadNotifBadge()]);
    if ($('V_servicelog').classList.contains('active')) loadServiceLog();
    if ($('V_vehicleDetail').classList.contains('active') && STATE.currentVehicleId) openVehicleDetail(STATE.currentVehicleId);
  } catch (e) { showError('logError', e.message || 'Failed to log service.'); }
  finally { setLoading('logBtn', false); $('logBtn').textContent = 'Log Service →'; }
}

// ── UPDATE KM MODAL ───────────────────────────────────────────────────────
let _kmVehicleId = null;
function openKmModal(id, name, cur) { _kmVehicleId = id; $('km_vehicleName').textContent = name; $('km_value').value = cur || ''; $('MODAL_KM').classList.add('open'); }
async function saveKm() {
  const km = parseInt($('km_value').value); if (!km || km < 0) return;
  try {
    await api.updateVehicle(_kmVehicleId, { current_km: km });
    closeModal('MODAL_KM'); showToast('Odometer updated.');
    if (STATE.currentVehicleId) openVehicleDetail(STATE.currentVehicleId);
    await loadVehicles();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── RESYNC VEHICLE ────────────────────────────────────────────────────────
async function resyncVehicle(id) {
  try {
    await api.resyncVehicle(id);
    showToast('Services synced! Reloading...');
    setTimeout(() => openVehicleDetail(id), 800);
  } catch (e) { showToast('Sync failed: ' + e.message, 'error'); }
}

// ── DELETE VEHICLE ────────────────────────────────────────────────────────
function confirmDeleteVehicle(id, name) {
  if (confirm(`Remove ${name} from RevTrack? All service records will also be removed.`)) {
    api.deleteVehicle(id).then(() => { showToast('Vehicle removed.'); loadVehicles(); nav(document.querySelector('[data-view=vehicles]')); }).catch(e => showToast(e.message, 'error'));
  }
}

// ── PROFILE ───────────────────────────────────────────────────────────────
function fillProfileForm() {
  if (!STATE.user) return; const u = STATE.user;
  $('pf_first').value = u.first_name || '';
  $('pf_last').value  = u.last_name  || '';
  $('pf_email').value = u.email      || '';
  if ($('pf_phone')) $('pf_phone').value = u.phone || '';
  if (u.warn_days)   $('pf_warn').value   = u.warn_days;
  if (u.urgent_days) $('pf_urgent').value = u.urgent_days;
  if (u.notify_email) $('pf_em_toggle').classList.add('on');
  $('ps_vehicles').textContent = STATE.vehicles.length;
}

async function saveProfile() {
  hideError('profileError');
  try {
    const data = await api.updateProfile({
      first_name:      $('pf_first').value.trim(),
      last_name:       $('pf_last').value.trim(),
      notify_email:    $('pf_em_toggle').classList.contains('on'),
      notify_whatsapp: !!($('pf_phone')?.value.trim()),
      phone:           $('pf_phone')?.value.trim() || null,
      warn_days:       parseInt($('pf_warn').value)   || 7,
      urgent_days:     parseInt($('pf_urgent').value) || 3,
    });
    STATE.user = data.user; hydrateUser(data.user); showToast('Profile saved.');
  } catch (e) { showError('profileError', e.message); }
}

function saveAlertSettings() { showToast('Alert settings saved.'); }

// ── MODALS ────────────────────────────────────────────────────────────────
function closeModal(id) { $(id).classList.remove('open'); hideError('logError'); }
document.addEventListener('click', e => { if (e.target.classList.contains('overlay')) closeModal(e.target.id); });

// ── SEARCH ────────────────────────────────────────────────────────────────
function handleSearch(val) {
  val = val.toLowerCase().trim(); if (!val) return;
  const m = STATE.vehicles.find(v => `${v.make} ${v.model}`.toLowerCase().includes(val) || (v.registration || '').toLowerCase().includes(val));
  if (m) openVehicleDetail(m.id);
}

// ── INIT ──────────────────────────────────────────────────────────────────
(async () => {
  const token = api.getToken();
  if (token) {
    try { const d = await api.me(); STATE.user = d.user; await bootApp(); }
    catch (e) { api.clearToken(); }
  }
})();
