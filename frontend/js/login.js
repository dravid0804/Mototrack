// js/login.js — login.html only
'use strict';

function toggleLoginPassword() {
  const input = $('li_pass');
  const btn = $('li_pass_toggle');
  if (!input || !btn) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? 'Show' : 'Hide';
}

async function login() {
  hideError('loginError');
  const email = $('li_email').value.trim(), pass = $('li_pass').value;
  if (!email || !pass) return showError('loginError', 'Please enter email and password.');
  setLoading('loginBtn', true, 'Sign in →');
  try {
    const d = await api.login(email, pass);
    api.setToken(d.token);
    STATE.user = d.user;
    window.location.href = 'dashboard.html';
  } catch (e) { showError('loginError', 'Email or password is incorrect.'); }
  finally { setLoading('loginBtn', false, 'Sign in →'); }
}

// If already logged in, skip straight to the dashboard.
(function () {
  if (api.getToken()) { window.location.href = 'dashboard.html'; return; }
  const prefill = new URLSearchParams(window.location.search).get('email');
  if (prefill && $('li_email')) $('li_email').value = prefill;
})();
