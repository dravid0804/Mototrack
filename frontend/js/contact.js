// js/contact.js — contact.html only
'use strict';

function fillContactForm() {
  if (!STATE.user) return;
  if ($('cu_email')) $('cu_email').value = STATE.user.email || '';
}

async function sendContactMessage() {
  hideError('cuError');
  const subject = $('cu_subject').value.trim();
  const message = $('cu_message').value.trim();
  if (!subject || !message) return showError('cuError', 'Please fill in both subject and message.');
  setLoading('cuBtn', true);
  try {
    await api.contactUs({ subject, message });
    showToast('Message sent! Thanks for the feedback.');
    $('cu_subject').value = '';
    $('cu_message').value = '';
  } catch (e) {
    showError('cuError', e.message || 'Failed to send message.');
  } finally {
    setLoading('cuBtn', false); $('cuBtn').textContent = 'Send Message →';
  }
}

window.initPage = fillContactForm;
initAppShell('contactus');
