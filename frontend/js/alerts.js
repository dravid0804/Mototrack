// js/alerts.js — alerts.html only
'use strict';

function toggleAlert(el) { el.classList.toggle('on'); }

function getAlertSettings() {
  return {
    alert_warning:    $('alert_warning')?.classList.contains('on') ?? true,
    alert_urgent:     $('alert_urgent')?.classList.contains('on') ?? true,
    alert_overdue:    $('alert_overdue')?.classList.contains('on') ?? true,
    alert_completion: $('alert_completion')?.classList.contains('on') ?? true,
    alert_digest:     $('alert_digest')?.classList.contains('on') ?? false,
    alert_odometer:   $('alert_odometer')?.classList.contains('on') ?? true,
  };
}

function getWarnKmSetting() {
  const preset = $('warnKmPreset')?.value || '100';
  const custom = parseInt($('warnKmCustom')?.value, 10);
  const km = preset === 'custom' ? custom : parseInt(preset, 10);
  return Math.max(50, km || 100);
}

function getWarnDaysSetting() {
  return Math.max(1, parseInt($('warnDays')?.value, 10) || 7);
}

function handleWarnKmPreset() {
  const isCustom = $('warnKmPreset')?.value === 'custom';
  if (!isCustom && $('warnKmCustom')) $('warnKmCustom').value = $('warnKmPreset').value;
}

function handleWarnKmManual() {
  const manual = parseInt($('warnKmCustom')?.value, 10);
  if (!manual) return;
  const presetValue = String(manual);
  if ($('warnKmPreset')) {
    $('warnKmPreset').value = ['100', '250', '500'].includes(presetValue) ? presetValue : 'custom';
  }
}

function fillAlertSettings() {
  if (!STATE.user) return;
  const u = STATE.user;
  const warnKm = parseInt(u.warn_km, 10) || 100;
  const preset = ['100', '250', '500'].includes(String(warnKm)) ? String(warnKm) : 'custom';
  if ($('warnKmPreset')) $('warnKmPreset').value = preset;
  if ($('warnKmCustom')) $('warnKmCustom').value = warnKm;
  if ($('warnDays')) $('warnDays').value = u.warn_days || 7;
  handleWarnKmPreset();

  const settings = {
    alert_warning: u.alert_warning !== false,
    alert_urgent: u.alert_urgent !== false,
    alert_overdue: u.alert_overdue !== false,
    alert_completion: u.alert_completion !== false,
    alert_digest: u.alert_digest === true,
    alert_odometer: u.alert_odometer !== false,
  };
  Object.entries(settings).forEach(([id, on]) => {
    const el = $(id);
    if (el) el.classList.toggle('on', on);
  });
}

async function saveAlertSettings() {
  if (!STATE.user) return;
  try {
    const data = await api.updateProfile({
      first_name: STATE.user.first_name,
      last_name: STATE.user.last_name || '',
      notify_email: STATE.user.notify_email !== false,
      warn_days: getWarnDaysSetting(),
      urgent_days: 10,
      warn_km: getWarnKmSetting(),
      ...getAlertSettings(),
    });
    STATE.user = data.user;
    fillAlertSettings();
    showToast('Alert settings saved.');
  } catch (e) {
    showToast(e.message || 'Failed to save alert settings.', 'error');
  }
}

window.initPage = fillAlertSettings;
initAppShell('alerts');
