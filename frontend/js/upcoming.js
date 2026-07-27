// js/upcoming.js — upcoming.html only
'use strict';

async function loadUpcoming() {
  const el = $('upcomingList'); if (!el) return;
  el.innerHTML = '<div class="loading-row">Loading...</div>';
  try {
    const data = await api.getUpcoming(); const list = data.upcoming || [];
    if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="es-icon">✅</div><p>All vehicles up to date!</p></div>'; return; }
    el.innerHTML = list.map(u => {
      const cls = u.status === 'overdue' ? 'ni-due' : u.status === 'urgent' || u.status === 'warning' ? 'ni-warn' : '';
      const ico = u.status === 'overdue' ? '🚨' : '⚠';
      const unit = u.unit || readingUnit(u.vehicleType);
      const lbl = u.status === 'overdue' ? `Overdue by ${Math.abs(u.kmLeft)} ${unit}` : u.kmLeft != null ? `${u.kmLeft} ${unit} left` : 'Due soon';
      return `<div class="ni-item ${cls}" style="margin-bottom:8px">
        <div class="ni-ico" style="background:${u.status==='overdue'?'var(--red-dim)':'var(--amber-dim)'}">${ico}</div>
        <div style="flex:1">
          <div class="ni-title">${u.service_name} — ${u.vehicleName}</div>
          <div class="ni-msg">${u.registration || ''} · Current: ${fmtReading(u.currentKm, u.vehicleType)} · Due at: ${fmtReading(u.nextDueKm, u.vehicleType)} · <strong>${lbl}</strong><br>Spec: ${u.spec || 'Per manufacturer'} · Qty: ${u.qty || '—'}</div>
          <div class="ni-meta"><span class="ni-time">Priority: ${u.priority || 'normal'}</span></div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`; }
}

window.initPage = loadUpcoming;
initAppShell('upcoming');
