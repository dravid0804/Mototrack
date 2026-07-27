// js/notifications.js — notifications.html only
'use strict';

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

window.initPage = function () { loadNotifications(''); };
initAppShell('notifications');
