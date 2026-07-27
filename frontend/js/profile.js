// js/profile.js — profile.html only
'use strict';

function fillProfileForm() {
  if (!STATE.user) return; const u = STATE.user;
  $('pf_first').value = u.first_name || '';
  $('pf_last').value  = u.last_name  || '';
  $('pf_email').value = u.email      || '';
  if ($('pf_phone')) $('pf_phone').value = u.phone || '';
  $('pf_em_toggle').classList.toggle('on', u.notify_email !== false);
  $('ps_vehicles').textContent = STATE.vehicles.length;
}

// Alert-preference fields (warn_days/warn_km/alert_*) now live on the
// dedicated Alert Settings page. To avoid resetting them when saving the
// Profile page, we send back the values already stored in STATE.user.
function currentAlertFieldsFromUser() {
  const u = STATE.user || {};
  return {
    warn_days: u.warn_days || 7,
    urgent_days: 10,
    warn_km: u.warn_km || 100,
    alert_warning: u.alert_warning !== false,
    alert_urgent: u.alert_urgent !== false,
    alert_overdue: u.alert_overdue !== false,
    alert_completion: u.alert_completion !== false,
    alert_digest: u.alert_digest === true,
    alert_odometer: u.alert_odometer !== false,
  };
}

async function toggleProfileEmail(el) {
  const next = !el.classList.contains('on');
  el.classList.toggle('on', next);
  try {
    const data = await api.updateProfile({
      first_name: $('pf_first').value.trim() || STATE.user.first_name,
      last_name: $('pf_last').value.trim() || '',
      notify_email: next,
      ...currentAlertFieldsFromUser(),
    });
    STATE.user = data.user;
    showToast(next ? 'Email alerts enabled.' : 'Email alerts disabled.');
  } catch (e) {
    el.classList.toggle('on', !next);
    showToast(e.message || 'Failed to update email alerts.', 'error');
  }
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
      ...currentAlertFieldsFromUser(),
    });
    STATE.user = data.user; hydrateUser(data.user); showToast('Profile saved.');
  } catch (e) { showError('profileError', e.message); }
}

window.initPage = fillProfileForm;
initAppShell('profile');
