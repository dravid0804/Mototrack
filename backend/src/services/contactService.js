// src/services/contactService.js
const { Resend } = require('resend');
const logger = require('../config/logger');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendContactMessage({ fromName, fromEmail, subject, message }) {
  const to = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#E85D1A;margin-bottom:4px">📩 MotoTrack — Contact / Feedback</h2>
      <p style="color:#64748B;font-size:13px;margin-top:0">From: ${fromName} &lt;${fromEmail}&gt;</p>
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px;margin-top:16px;white-space:pre-wrap;color:#0F172A;font-size:14px;line-height:1.6">${message}</div>
    </div>`;

  const { data, error } = await resend.emails.send({
    from: `${process.env.EMAIL_FROM_NAME || 'MotoTrack'} <${process.env.EMAIL_FROM}>`,
    to: [to],
    subject: `[MotoTrack Feedback] ${subject}`,
    html,
  });

  if (error) {
    logger.error(`Contact email failed: ${error.message}`);
    throw new Error(error.message);
  }

  logger.info(`Contact email sent from ${fromEmail} -> ${to}`);
  return { success: true, messageId: data.id };
}

module.exports = { sendContactMessage };