// js/register.js — register.html only
'use strict';

async function register() {
  hideError('registerError');
  const first = $('r_first').value.trim(), last = $('r_last').value.trim();
  const email = $('r_email').value.trim(), pass = $('r_pass').value;
  const phone = $('r_phone')?.value.trim() || '';
  if (!first || !email || !pass) return showError('registerError', 'First name, email and password are required.');
  if (pass.length < 8) return showError('registerError', 'Password must be at least 8 characters.');
  try {
    await api.register({ first_name: first, last_name: last, email, phone: phone || null, password: pass, notify_email: true, notify_whatsapp: !!phone });
    api.clearToken();
    window.location.href = `login.html?email=${encodeURIComponent(email)}`;
  } catch (e) { showError('registerError', e.message || 'Registration failed.'); }
}

// If already logged in, skip straight to the dashboard.
(function () {
  if (api.getToken()) window.location.href = 'dashboard.html';
})();
