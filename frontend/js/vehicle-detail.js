// js/vehicle-detail.js — vehicle-detail.html only (?id=<vehicleId>)
'use strict';

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
          <div style="font-size:12px;color:#64748B;margin-top:3px">${vehicleName} · ${fmtReading(km, type)} · ${checks.length} checks triggered</div>
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

// ── VEHICLE DETAIL ────────────────────────────────────────────────────────
function currentVehicleId() {
  return new URLSearchParams(window.location.search).get('id');
}

async function openVehicleDetail(id) {
  STATE.currentVehicleId = id;
  $('VD_CONTENT').innerHTML = '<div class="loading-row" style="padding:3rem;text-align:center">Loading vehicle data…</div>';

  try {
    const data = await api.getHealth(id);
    const v = data.vehicle;
    const seen = new Set();
    const svcs = (data.services || []).filter(s => {
      if (s.isCustom) return true; // custom services are always kept, never deduped by name
      if (seen.has(s.service_name)) return false;
      seen.add(s.service_name);
      return true;
    });

    STATE.currentVehicleSvcs = svcs;
    STATE.currentVehicle     = v;

    const emoji    = vehicleIcon(v.type);
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
            <span class="chip">${vehicleLabel(v.type)}</span>
            <span class="chip">${v.fuel_type}</span>
            <span class="chip">${fmtReading(v.current_km, v.type)}</span>
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
        <button class="btn-sec"  style="font-size:0.82rem;padding:7px 14px" onclick="openKmModal('${v.id}','${v.make} ${v.model}',${v.current_km},'${v.type}')">Update Reading</button>
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

      <div class="svc-edit-note">
        ✏️ <strong>Oil grade and quantity are pre-filled from manufacturer defaults.</strong>
        Your vehicle may use a different spec or capacity — click the <span class="svc-edit-badge">✏ Edit</span> button on any card to update the oil grade and quantity for that service.<br>
        ✏️ Tracking button — ON = we'll email you. OFF = we'll just watch silently. 👀
      </div>

      <div class="add-card" style="min-height:auto;padding:1rem;flex-direction:row;gap:10px;margin-bottom:1.25rem" onclick="openCustomServiceModal('${v.id}')">
        <div style="font-size:1.6rem">＋</div>
        <div style="font-size:0.85rem;font-weight:700">Add Custom Service — track anything specific to this vehicle</div>
      </div>

      <div class="svc-grid">`;

    const unit = readingUnit(v.type);
    svcs.forEach(s => {
      const pct   = s.pct != null ? Math.min(100, s.pct) : 0;
      const pc    = s.status === 'overdue' ? 'pf-r' : s.status === 'warning' || s.status === 'urgent' ? 'pf-a' : 'pf-g';
      const bc    = s.status === 'overdue' ? 'b-due' : s.status === 'warning' || s.status === 'urgent' ? 'b-warn' : 'b-ok';
      const bt    = s.status === 'overdue' ? 'Overdue' : s.status === 'warning' ? 'Due Soon' : s.status === 'urgent' ? 'Urgent' : 'Healthy';
      const bcolor = s.status === 'overdue' ? 'var(--red)' : s.status === 'warning' || s.status === 'urgent' ? 'var(--amber)' : 'var(--green)';
      const leftTxt = s.kmLeft == null ? '—'
        : s.kmLeft < 0   ? `<span style="color:var(--red);font-weight:800">${Math.abs(s.kmLeft).toLocaleString()} ${unit} overdue</span>`
        : s.kmLeft < 500 ? `<span style="color:var(--red);font-weight:800">${s.kmLeft.toLocaleString()} ${unit} left</span>`
        : s.kmLeft < 1500? `<span style="color:var(--amber);font-weight:700">${s.kmLeft.toLocaleString()} ${unit} left</span>`
        :                  `<span style="color:var(--green);font-weight:700">${s.kmLeft.toLocaleString()} ${unit} left</span>`;

      const isCustom = !!s.isCustom;
      const idRaw = isCustom ? s.custom_service_id : s.catalogue_id;
      const safeId = idRaw ? idRaw.replace(/-/g,'') : 'x';
      const refId  = isCustom ? `custom:${s.custom_service_id}` : s.catalogue_id;

      const trackingOn = s.trackingEnabled !== false;
      html += `
        <div class="svc-card" style="border-left:4px solid ${bcolor}" id="svc-card-${safeId}">
          <div class="svc-track-wrap">
            <label class="svc-track-toggle" title="Enable/disable alerts for this service">
            <input type="checkbox" id="track-input-${safeId}" ${trackingOn ? 'checked' : ''} onchange="toggleServiceTracking(this,'${v.id}','${refId}','${safeId}')">
              <span class="svc-track-slider"></span>
            </label>
            <div class="svc-track-label ${trackingOn ? 'on' : 'off'}" id="track-label-${safeId}">${trackingOn ? 'Tracking' : 'Not Tracking'}</div>
          </div>
          <div class="svc-head">
            <div class="svc-name">${s.service_name}${isCustom ? '<span class="svc-custom-badge">Custom</span>' : ''}</div>
            <span style="display:flex;align-items:center;gap:6px">
              <span class="badge ${bc}"><span class="b-dot"></span>${bt}</span>
              ${isCustom ? `<button class="svc-custom-delete" title="Remove this custom service" onclick="deleteCustomService('${v.id}','${s.custom_service_id}','${s.service_name}')">🗑</button>` : ''}
            </span>
          </div>
          <div class="svc-rows">
            <div class="r"><span class="rk">Last done at</span><span class="rv">${s.done_km ? fmtReading(s.done_km, v.type) : '<span style="color:var(--text4)">Never</span>'}</span></div>
            <div class="r"><span class="rk">Service interval</span><span class="rv">${[s.interval_km ? fmtReading(s.interval_km, v.type) : '', s.interval_months ? s.interval_months + ' months' : ''].filter(Boolean).join(' / ') || '—'}</span></div>
            <div class="r"><span class="rk">Next due at</span><span class="rv">${s.nextDueKm ? fmtReading(s.nextDueKm, v.type) : '—'}</span></div>
            <div class="r"><span class="rk">Remaining (${unit})</span><span class="rv">${leftTxt}</span></div>
            ${s.daysLeft != null ? `<div class="r"><span class="rk">Remaining (time)</span><span class="rv">${
              s.daysLeft < 0
                ? '<span style="color:var(--red);font-weight:800">' + Math.abs(s.daysLeft) + ' days overdue</span>'
                : s.status === 'overdue' || s.status === 'urgent' || s.daysLeft <= 7
                  ? '<span style="color:var(--amber);font-weight:700">' + s.daysLeft + ' days left</span>'
                  : '<span style="color:var(--green);font-weight:700">' + s.daysLeft + ' days left</span>'
            }</span></div>` : ''}

            <div class="r" id="spec-row-${safeId}">
              <span class="rk">Oil / Fluid spec</span>
              <span class="ied-view" id="spec-view-${safeId}">
                <span class="rv" style="color:var(--accent)" id="spec-val-${safeId}">${s.spec || '—'}</span>
                <button class="ied-btn ied-edit" onclick="startInlineEdit('spec','${safeId}','${v.id}','${refId}')">&#xf044;</button>
              </span>
              <span class="ied-editing" id="spec-edit-${safeId}" style="display:none">
                <input class="ied-input" id="ied-spec-${safeId}" type="text" value="" placeholder="e.g. 5W-30 Synthetic" onkeydown="if(event.key==='Enter')saveInlineField('spec','${safeId}','${v.id}','${refId}');if(event.key==='Escape')cancelInlineEdit('spec','${safeId}')">
                <button class="ied-btn ied-save" onclick="saveInlineField('spec','${safeId}','${v.id}','${refId}')">✔</button>
                <button class="ied-btn ied-cancel" onclick="cancelInlineEdit('spec','${safeId}')">✕</button>
              </span>
            </div>

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
  const view  = document.getElementById(`${field}-view-${safeId}`);
  const edit  = document.getElementById(`${field}-edit-${safeId}`);
  const input = document.getElementById(`ied-${field}-${safeId}`);
  if (!view || !edit || !input) return;

  const valEl = document.getElementById(`${field}-val-${safeId}`);
  const current = valEl?.textContent?.trim() || '';
  input.value = current === '—' ? '' : current;

  view.style.display = 'none';
  edit.style.display = 'flex';
  input.focus();
  input.select();
}

async function toggleServiceTracking(checkbox, vehicleId, refId, safeId) {
  const enabled = checkbox.checked;
  const label = document.getElementById(`track-label-${safeId}`);
  const isCustom = String(refId).startsWith('custom:');

  const url = isCustom
    ? `${window.location.origin}/api/vehicles/${vehicleId}/custom-services/${refId.split(':')[1]}/tracking`
    : `${window.location.origin}/api/vehicles/${vehicleId}/tracking`;
  const body = isCustom
    ? { is_enabled: enabled }
    : { catalogue_id: refId, is_enabled: enabled };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (label) {
      label.textContent = enabled ? 'Tracking' : 'Not Tracking';
      label.classList.toggle('on', enabled);
      label.classList.toggle('off', !enabled);
    }

    const svc = (STATE.currentVehicleSvcs || []).find(s =>
      isCustom ? s.custom_service_id === refId.split(':')[1] : s.catalogue_id === refId
    );
    if (svc) svc.trackingEnabled = enabled;

    showToast(enabled ? 'Tracking enabled — alerts will be sent.' : 'Tracking disabled — no alerts will be sent for this service.');
  } catch (e) {
    checkbox.checked = !enabled;
    showToast('Failed to update tracking: ' + e.message, 'error');
  }
}

function cancelInlineEdit(field, safeId) {
  const view = document.getElementById(`${field}-view-${safeId}`);
  const edit = document.getElementById(`${field}-edit-${safeId}`);
  if (!view || !edit) return;
  view.style.display = 'flex';
  edit.style.display = 'none';
}

async function saveInlineField(field, safeId, vehicleId, refId) {
  const input = document.getElementById(`ied-${field}-${safeId}`);
  if (!input) return;
  const value = input.value.trim();

  try {
    let res;
    if (String(refId).startsWith('custom:')) {
      const customId = refId.split(':')[1];
      const payload = {};
      if (field === 'spec') payload.spec = value || null;
      if (field === 'qty')  payload.qty  = value || null;
      res = await fetch(`${window.location.origin}/api/vehicles/${vehicleId}/custom-services/${customId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
        body:    JSON.stringify(payload),
      });
    } else {
      const payload = { catalogue_id: refId };
      if (field === 'spec') payload.custom_spec = value || null;
      if (field === 'qty')  payload.custom_qty  = value || null;
      res = await fetch(`${window.location.origin}/api/vehicles/${vehicleId}/spec`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
        body:    JSON.stringify(payload),
      });
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const valEl = document.getElementById(`${field}-val-${safeId}`);
    if (valEl) valEl.textContent = value || '—';

    cancelInlineEdit(field, safeId);
    showToast(`${field === 'spec' ? 'Oil spec' : 'Quantity'} updated!`);
  } catch (e) {
    showToast('Failed to save: ' + e.message, 'error');
  }
}

// ── CUSTOM SERVICE MODAL ──────────────────────────────────────────────────
let _csVehicleId = null;

function openCustomServiceModal(vehicleId) {
  _csVehicleId = vehicleId;
  hideError('csError');
  ['cs_name','cs_interval_km','cs_interval_months','cs_spec','cs_qty'].forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('cs_priority')) $('cs_priority').value = 'normal';
  $('MODAL_CUSTOM_SVC').classList.add('open');
}

async function saveCustomService() {
  hideError('csError');
  const name = $('cs_name').value.trim();
  const ik = parseInt($('cs_interval_km').value) || null;
  const im = parseInt($('cs_interval_months').value) || null;
  const spec = $('cs_spec').value.trim();
  const qty = $('cs_qty').value.trim();
  const priority = $('cs_priority').value;

  if (!name) return showError('csError', 'Please name this service.');
  if (!ik && !im) return showError('csError', 'Provide an interval in km/hrs or months.');

  setLoading('csBtn', true);
  try {
    const res = await fetch(`${window.location.origin}/api/vehicles/${_csVehicleId}/custom-services`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      body:    JSON.stringify({ service_name: name, interval_km: ik, interval_months: im, spec, qty, priority }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    closeModal('MODAL_CUSTOM_SVC');
    showToast('Custom service added!');
    await openVehicleDetail(_csVehicleId);
  } catch (e) {
    showError('csError', e.message || 'Failed to add custom service.');
  } finally {
    setLoading('csBtn', false); $('csBtn').textContent = 'Add Service →';
  }
}

async function deleteCustomService(vehicleId, customId, name) {
  if (!confirm(`Remove custom service "${name}"? Its logged history will also be removed.`)) return;
  try {
    const res = await fetch(`${window.location.origin}/api/vehicles/${vehicleId}/custom-services/${customId}`, {
      method:  'DELETE',
      headers: { 'Authorization': 'Bearer ' + api.getToken() },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast('Custom service removed.');
    await openVehicleDetail(vehicleId);
  } catch (e) {
    showToast('Failed to remove: ' + e.message, 'error');
  }
}

// ── SET INTERVALS MODAL ───────────────────────────────────────────────────
let _intVehicleId = null;

function openIntervalModal(vehicleId) {
  _intVehicleId = vehicleId;
  const svcs = (STATE.currentVehicleSvcs || []).filter(s => !s.isCustom);
  const unit = readingUnit(STATE.currentVehicle?.type);

  if (!svcs.length) {
    $('intervalBody').innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text4)">No services found.<br>Click ⟳ Sync Services on the vehicle page first.</div>';
    $('MODAL_INTERVAL').classList.add('open');
    return;
  }

  const priIco = { critical: '🔴', high: '🟠', normal: '🟢', low: '⚪' };

  const moOpts = (cur) => [1,2,3,4,5,6,8,10,12,18,24,36].map(m =>
    `<option value="${m}" ${parseInt(cur) === m ? 'selected' : ''}>${m} month${m > 1 ? 's' : ''}</option>`
  ).join('');

  const rows = svcs.map((s, i) => {
    const defKm = s.default_interval_km || s.interval_km;
    const defMo = s.default_interval_months || s.interval_months;
    const defLabel = [defKm ? defKm.toLocaleString() + ' ' + unit : '', defMo ? defMo + ' mo' : ''].filter(Boolean).join(' / ') || 'No default';

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
            placeholder="${defKm || unit}"
            min="1" step="${unit === 'hrs' ? '10' : '500'}"
          >
          <span class="int-unit-tag">${unit}</span>
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
  const svcs = (STATE.currentVehicleSvcs || []).filter(s => !s.isCustom);
  let saved = 0, failed = 0;

  for (let i = 0; i < svcs.length; i++) {
    const kmEl = $(`int_km_${i}`);
    const moEl = $(`int_mo_${i}`);
    if (!kmEl) continue;

    const kmVal  = parseInt(kmEl.value)  || null;
    const moVal  = parseInt(moEl?.value) || null;
    const catId  = kmEl.dataset.catalogueId;

    if (!catId) { failed++; continue; }
    if (!kmVal && !moVal) continue;

    try {
      const res = await fetch(window.location.origin + `/api/vehicles/${_intVehicleId}/intervals`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
        body: JSON.stringify({ catalogue_id: catId, interval_km: kmVal, interval_months: moVal }),
      });
      const data = await res.json();
      if (data.success) {
        saved++;
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

// ── LOG SERVICE MODAL ─────────────────────────────────────────────────────
function openLogModalFor(vid) { $('log_date').value = new Date().toISOString().split('T')[0]; $('log_vehicle').value = vid; loadCatalogueForVehicle(); $('MODAL_LOG').classList.add('open'); }

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
    if (STATE.currentVehicleId) await openVehicleDetail(STATE.currentVehicleId);
  } catch (e) { showError('logError', e.message || 'Failed to log service.'); }
  finally { setLoading('logBtn', false); $('logBtn').textContent = 'Log Service →'; }
}

// ── UPDATE KM MODAL ───────────────────────────────────────────────────────
let _kmVehicleId = null;
let _kmVehicleType = 'car';
function openKmModal(id, name, cur, type = 'car') {
  _kmVehicleId = id;
  _kmVehicleType = type;
  $('km_vehicleName').textContent = name;
  $('km_value').value = cur || '';
  const unit = readingUnit(type);
  if ($('km_modal_title')) $('km_modal_title').textContent = type === 'tractor' ? 'Update Hours' : 'Update Odometer';
  if ($('km_modal_text')) $('km_modal_text').innerHTML = `Update current ${unit} reading for <strong id="km_vehicleName" style="color:var(--text)">${name}</strong>`;
  if ($('km_value_label')) $('km_value_label').textContent = `Current Reading (${unit})`;
  $('MODAL_KM').classList.add('open');
}
async function saveKm() {
  const km = parseInt($('km_value').value);
  if (!km || km < 0) return;

  try {
    await api.updateVehicle(_kmVehicleId, { current_km: km });
    closeModal('MODAL_KM');
    showToast(`${readingUnit(_kmVehicleType).toUpperCase()} reading updated.`);

    await loadVehicles();
    loadNotifBadge();
    if (STATE.currentVehicleId) openVehicleDetail(STATE.currentVehicleId);
  } catch (e) {
    showToast(e.message, 'error');
  }
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
    api.deleteVehicle(id)
      .then(() => { showToast('Vehicle removed.'); window.location.href = 'vehicles.html'; })
      .catch(e => showToast(e.message, 'error'));
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────
window.initPage = async function () {
  const id = currentVehicleId();
  if (!id) { $('VD_CONTENT').innerHTML = '<div class="empty-state"><p>No vehicle selected. <a href="vehicles.html">Go to My Vehicles</a></p></div>'; return; }
  await openVehicleDetail(id);
};
initAppShell('vehicleDetail');
