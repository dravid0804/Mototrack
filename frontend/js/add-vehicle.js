// js/add-vehicle.js — add-vehicle.html only
'use strict';

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
    window.location.href = 'vehicles.html';
  } catch (e) { showError('avError', e.message || 'Failed to add vehicle.'); }
  finally { setLoading('avBtn', false); $('avBtn').textContent = 'Add Vehicle & Generate Service Schedule →'; }
}

window.initPage = function () {
  populateMakeOptions(document.querySelector('#vtRow .vt-b.sel')?.dataset.type || 'car');
};
initAppShell('addVehicle');
