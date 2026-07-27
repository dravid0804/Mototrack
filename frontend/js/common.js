// js/common.js — shared across every app page (dashboard, vehicles, vehicle-detail,
// add-vehicle, service-log, upcoming, notifications, alerts, profile, contact).
// This file only extracts the SHARED pieces of the old single-page js/app.js —
// no logic has been changed, only where it lives.
'use strict';

const STATE = {
  user: null, vehicles: [],
  currentVehicleId: null, currentVehicleSvcs: [], currentVehicle: null,
};

const VTITLES = {
  dashboard: 'Dashboard', vehicles: 'My Vehicles', vehicleDetail: 'Vehicle Detail',
  servicelog: 'Service Log', upcoming: 'Upcoming Services', notifications: 'Notifications',
  alerts: 'Alert Settings', addVehicle: 'Add Vehicle', profile: 'Profile & Settings', contactus: 'Contact Us',
};

function $(id) { return document.getElementById(id); }
function readingUnit(type) { return type === 'tractor' ? 'hrs' : 'km'; }
function fmtReading(n, type) { return n != null ? Number(n).toLocaleString() + ' ' + readingUnit(type) : '—'; }
function fmtKm(n) { return fmtReading(n, 'car'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
function initials(u) { return ((u.first_name?.[0] || '') + (u.last_name?.[0] || '')).toUpperCase() || '?'; }
function vehicleIcon(type) { return type === 'bike' ? '🏍' : type === 'tractor' ? '🚜' : '🚗'; }
function vehicleLabel(type) { return type === 'bike' ? 'Bike' : type === 'tractor' ? 'Tractor' : 'Car'; }

function showToast(msg, type = 'success') {
  const t = $('toast');
  if (!t) return;
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

function logout() {
  api.clearToken(); STATE.user = null; STATE.vehicles = [];
  window.location.href = 'login.html';
}

// ── Sidebar / topbar hydration ──────────────────────────────────────────
function hydrateUser(u) {
  const av = initials(u);
  ['SB_AV', 'PR_AV'].forEach(id => { const e = $(id); if (e) e.textContent = av; });
  if ($('SB_NAME'))  $('SB_NAME').textContent  = `${u.first_name} ${u.last_name || ''}`.trim();
  if ($('SB_EMAIL')) $('SB_EMAIL').textContent = u.email;
  if ($('PR_NAME'))  $('PR_NAME').textContent  = `${u.first_name} ${u.last_name || ''}`.trim();
  if ($('PR_EMAIL')) $('PR_EMAIL').textContent = u.email;
}

function highlightNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.view === page);
  });
  if ($('TB_TITLE')) $('TB_TITLE').textContent = VTITLES[page] || page;
}

async function loadNotifBadge() {
  try {
    const d = await api.getUpcoming();
    const c = (d.upcoming || []).filter(u => u.status === 'overdue' || u.status === 'urgent').length;
    ['NB', 'TOP_NB'].forEach(id => {
      const el = $(id);
      if (el) el.classList.toggle('hidden', c === 0);
    });
  } catch (e) {}
}

// ── Vehicles (shared across many pages for dropdowns / search) ─────────
async function loadVehicles() {
  try { const d = await api.getVehicles(); STATE.vehicles = d.vehicles || []; populateSelects(); } catch (e) {}
}

function populateSelects() {
  const opts = STATE.vehicles.map(v => `<option value="${v.id}">${v.make} ${v.model} (${v.registration || v.year})</option>`).join('');
  const s = $('log_vehicle'); if (s) s.innerHTML = '<option value="">Select vehicle</option>' + opts;
  const f = $('filterVehicle'); if (f) f.innerHTML = '<option value="">All Vehicles</option>' + opts;
}

// ── Search (top bar) ─────────────────────────────────────────────────────
function handleSearch(val) {
  val = val.toLowerCase().trim(); if (!val) return;
  const m = STATE.vehicles.find(v => `${v.make} ${v.model}`.toLowerCase().includes(val) || (v.registration || '').toLowerCase().includes(val));
  if (m) window.location.href = `vehicle-detail.html?id=${m.id}`;
}

// ── Vehicle card renderer (used on dashboard + My Vehicles page) ───────
function vehicleCard(v) {
  const emoji = vehicleIcon(v.type);
  const bg = v.type === 'bike'
    ? 'linear-gradient(135deg,#ECFEFF,#CFFAFE)'
    : v.type === 'tractor' ? 'linear-gradient(135deg,#F0FDF4,#DCFCE7)' : 'linear-gradient(135deg,#EFF6FF,#DBEAFE)';
  return `<a class="vh-card" href="vehicle-detail.html?id=${v.id}">
    <div class="vh-img" style="background:${bg}">
      <div class="vh-emoji">${emoji}</div>
      <div class="vh-badge-type">${vehicleLabel(v.type)} · ${v.fuel_type}</div>
      <div class="vh-sdot sdot-warn"></div>
    </div>
    <div class="vh-body">
      <div class="vh-name">${v.make} ${v.model}</div>
      <div class="vh-sub">${v.year} · ${v.registration || '—'} · ${fmtReading(v.current_km, v.type)}</div>
      <div class="vh-pills">
        <span class="pill pill-ok">${v.fuel_type}</span>
        <span class="pill pill-ok">${v.transmission || 'Manual'}</span>
      </div>
    </div>
  </a>`;
}

// ── Modals (generic open/close used on several pages) ───────────────────
function closeModal(id) { $(id).classList.remove('open'); hideError('logError'); }
document.addEventListener('click', e => { if (e.target.classList.contains('overlay')) closeModal(e.target.id); });

// ── Boot sequence for every authenticated app page ──────────────────────
// pageKey matches the data-view used in the sidebar + VTITLES above.
// Calls window.initPage() (defined by the page-specific script) once auth
// and shared shell data are ready, if that function exists.
async function initAppShell(pageKey) {
  document.body.dataset.page = pageKey;
  const token = api.getToken();
  if (!token) { window.location.href = 'login.html'; return; }

  try {
    const d = await api.me();
    STATE.user = d.user;
  } catch (e) {
    api.clearToken();
    window.location.href = 'login.html';
    return;
  }

  hydrateUser(STATE.user);
  highlightNav();
  await loadVehicles();
  loadNotifBadge();

  if (typeof window.initPage === 'function') {
    await window.initPage();
  }
}
