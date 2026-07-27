// js/dashboard.js — dashboard.html only
'use strict';

function upRow(u) {
  const ico = u.service_name?.toLowerCase().includes('oil') ? '🛢' : u.service_name?.toLowerCase().includes('brake') ? '🔵' : u.service_name?.toLowerCase().includes('air') ? '🌬' : u.service_name?.toLowerCase().includes('chain') ? '⛓' : '🔧';
  const cls = u.status === 'overdue' ? 'due-red' : u.status === 'urgent' ? 'due-warn' : 'due-ok';
  const unit = u.unit || readingUnit(u.vehicleType);
  const lbl = u.status === 'overdue' ? 'Overdue' : u.kmLeft != null ? `${u.kmLeft} ${unit} left` : 'Due soon';
  const bg  = u.status === 'overdue' ? 'var(--red-dim)' : u.status === 'urgent' ? 'var(--amber-dim)' : 'var(--green-dim)';
  return `<div class="up-item"><div class="up-ico" style="background:${bg}">${ico}</div><div class="up-info"><div class="up-svc">${u.service_name}</div><div class="up-veh">${u.vehicleName}</div></div><div class="up-due ${cls}">${lbl}</div></div>`;
}

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
      <div class="sc"><div class="sc-accent" style="background:var(--accent)"></div><div class="sc-label">Total Vehicles</div><div class="sc-val">${vehicles.length}</div><div class="sc-sub">${vehicles.filter(v=>v.type==='car').length} Cars · ${vehicles.filter(v=>v.type==='bike').length} Bikes · ${vehicles.filter(v=>v.type==='tractor').length} Tractors</div></div>
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

window.initPage = loadDashboard;
initAppShell('dashboard');
