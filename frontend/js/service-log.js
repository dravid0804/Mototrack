// js/service-log.js — service-log.html only
'use strict';

async function loadServiceLog() {
  const vid = $('filterVehicle')?.value || '';
  const body = $('serviceLogBody'); if (!body) return;
  body.innerHTML = '<div class="loading-row">Loading...</div>';
  try {
    const data = await api.getServices(vid || null);
    const rows = data.records || [];
    const totalCostEl = $('svcLogTotalCost');
    if (!rows.length) {
      body.innerHTML = '<div class="loading-row">No service records yet.</div>';
      if (totalCostEl) totalCostEl.textContent = '';
      return;
    }
    const totalCost = rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);
    if (totalCostEl) totalCostEl.textContent = `Total spent: ₹${totalCost.toLocaleString()}`;

    body.innerHTML = rows.map(r => `
      <div class="st-row">
        <div class="st-cell" data-label="Service"><div class="st-svc">${r.service_name}</div><div class="st-det">${r.spec_used || '—'}</div></div>
        <div class="st-cell" data-label="Vehicle" style="font-size:0.83rem;color:var(--text2)">${r.make || ''} ${r.model || ''}</div>
        <div class="st-cell" data-label="Date" style="font-size:0.82rem;color:var(--text3)">${fmtDate(r.done_at)}</div>
        <div class="st-cell" data-label="Reading" style="font-size:0.85rem;font-weight:700">${fmtReading(r.done_km, r.vehicle_type)}</div>
        <div class="st-cell" data-label="Cost" style="font-size:0.85rem;font-weight:700;color:var(--text2)">${r.cost ? '₹' + Number(r.cost).toLocaleString() : '—'}</div>
        <div class="st-cell" data-label="Status"><span class="badge b-ok"><span class="b-dot"></span>Done</span></div>
        <div class="st-cell" data-label="Next Due" style="font-size:0.82rem;color:var(--green);font-weight:700">${r.next_due_km ? fmtReading(r.next_due_km, r.vehicle_type) : '—'}</div>
      </div>`).join('');
  } catch (e) { body.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`; }
}

async function downloadServiceLogPdf() {
  const vid = $('filterVehicle')?.value || '';
  try {
    const res = await fetch(`${window.location.origin}/api/services/pdf${vid ? '?vehicle_id=' + vid : ''}`, {
      headers: { 'Authorization': 'Bearer ' + api.getToken() },
    });
    if (!res.ok) throw new Error('Could not generate PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'service-log.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    showToast('Failed to download PDF: ' + e.message, 'error');
  }
}

// ── LOG SERVICE MODAL (same behaviour as on the vehicle detail page) ────
function openLogModal() { $('log_date').value = new Date().toISOString().split('T')[0]; $('MODAL_LOG').classList.add('open'); }

async function loadCatalogueForVehicle() {
  const vid = $('log_vehicle').value; if (!vid) return;
  const vehicle = STATE.vehicles.find(v => v.id === vid); if (!vehicle) return;
  try {
    const data = await api.getCatalogue(vehicle.type, vehicle.fuel_type);
    const opts = (data.catalogue || []).map(c => `<option value="cat:${c.id}" data-spec="${c.default_spec || ''}" data-qty="${c.default_qty || ''}">${c.service_name}</option>`).join('');

    let customOpts = '';
    try {
      const health = await api.getHealth(vid);
      const customs = (health.services || []).filter(s => s.isCustom);
      customOpts = customs.map(c => `<option value="custom:${c.custom_service_id}" data-spec="${c.spec || ''}" data-qty="${c.qty || ''}">⭐ ${c.service_name} (Custom)</option>`).join('');
    } catch (e) {}

    $('log_service').innerHTML = '<option value="">Select service</option>' + opts + customOpts;
    $('log_service').onchange = () => {
      const opt = $('log_service').selectedOptions[0];
      if (opt && opt.dataset.spec) $('log_spec').value = opt.dataset.spec + (opt.dataset.qty ? ' · ' + opt.dataset.qty : '');
    };
  } catch (e) {
    showToast('Could not load service list for this vehicle.', 'error');
  }
}

async function logService() {
  hideError('logError');
  const vid = $('log_vehicle').value, svcRaw = $('log_service').value;
  const svcName = ($('log_service').selectedOptions[0]?.text || '').replace(/^⭐\s*/, '').replace(/\s*\(Custom\)$/, '');
  const date = $('log_date').value, km = parseInt($('log_km').value);
  const spec = $('log_spec').value.trim(), cost = parseFloat($('log_cost').value) || null;
  const ws = $('log_workshop').value.trim(), notes = $('log_notes').value.trim();
  if (!vid || !date || !km) return showError('logError', 'Vehicle, date and reading are required.');
  if (!svcRaw) return showError('logError', 'Please select a service type from the dropdown.');

  const isCustomSvc = svcRaw.startsWith('custom:');
  const catalogue_id = isCustomSvc ? null : (svcRaw ? svcRaw.replace(/^cat:/, '') : null);
  const custom_service_id = isCustomSvc ? svcRaw.replace(/^custom:/, '') : null;

  setLoading('logBtn', true);
  try {
    await api.logService({ vehicle_id: vid, catalogue_id, custom_service_id, service_name: svcName, done_at: date, done_km: km, spec_used: spec, cost, workshop: ws, notes });
    closeModal('MODAL_LOG');
    showToast('Service logged! Email confirmation sent.');
    await loadVehicles();
    loadNotifBadge();
    await loadServiceLog();
  } catch (e) { showError('logError', e.message || 'Failed to log service.'); }
  finally { setLoading('logBtn', false); $('logBtn').textContent = 'Log Service →'; }
}

window.initPage = loadServiceLog;
initAppShell('servicelog');
