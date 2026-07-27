// js/vehicles.js — vehicles.html only
'use strict';

async function loadVehiclesView() {
  await loadVehicles();
  const el = $('vehiclesList'); if (!el) return;
  if (!STATE.vehicles.length) {
    el.innerHTML = `<div class="empty-state"><div class="es-icon">🚗</div><p>No vehicles yet.</p></div>
      <a class="add-card" href="add-vehicle.html"><div style="font-size:2rem;margin-bottom:8px">＋</div><div style="font-size:0.85rem;font-weight:500">Add your first vehicle</div></a>`;
    return;
  }
  el.innerHTML = STATE.vehicles.map(vehicleCard).join('') +
    `<a class="add-card" href="add-vehicle.html"><div style="font-size:2rem;margin-bottom:8px">＋</div><div style="font-size:0.85rem;font-weight:500">Add new vehicle</div></a>`;
}

window.initPage = loadVehiclesView;
initAppShell('vehicles');
