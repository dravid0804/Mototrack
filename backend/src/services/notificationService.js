// src/services/notificationService.js — Email + WhatsApp
const { sendEmail }    = require('./emailService');
const { sendWhatsApp } = require('./whatsappService');
const logger           = require('../config/logger');

async function notify({ userId, vehicleId, serviceName, type, bracket, user, vehicle, templateData }) {
  const alertSwitch = {
    warning: 'alert_warning',
    urgent: 'alert_urgent',
    overdue: 'alert_overdue',
    completion: 'alert_completion',
    digest: 'alert_digest',
    odometer: 'alert_odometer',
  }[type];

  const enriched = {
    ...templateData,
    firstName:    user.first_name,
    vehicleName:  vehicle.make ? `${vehicle.make} ${vehicle.model}` : '',
    registration: vehicle.registration || '—',
    vehicleType:  vehicle.type || '',
  };

  // ── Email ─────────────────────────────────────────────────────────────────
  if (user.notify_email && user.email && (!alertSwitch || user[alertSwitch] !== false)) {
    try {
      const result = await sendEmail({ userId, vehicleId, serviceName, type, bracket, email: user.email, templateData: enriched });
      if (!result?.success) logger.error(`Email failed [${type}]: ${result?.error || 'Unknown error'}`);
    } catch (err) {
      logger.error(`Email failed [${type}]: ${err.message}`);
    }
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (user.phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_WHATSAPP_FROM) {
    sendWhatsApp({ userId, vehicleId, serviceName, type, phone: user.phone, templateData: enriched })
      .catch(err => logger.warn(`WhatsApp failed [${type}]: ${err.message}`));
  }
}

module.exports = { notify };
