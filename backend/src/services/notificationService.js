// src/services/notificationService.js — Email + WhatsApp
const { sendEmail }    = require('./emailService');
const { sendWhatsApp } = require('./whatsappService');
const logger           = require('../config/logger');

async function notify({ userId, vehicleId, serviceName, type, bracket, user, vehicle, templateData }) {
  const enriched = {
    ...templateData,
    firstName:    user.first_name,
    vehicleName:  vehicle.make ? `${vehicle.make} ${vehicle.model}` : '',
    registration: vehicle.registration || '—',
    vehicleType:  vehicle.type || '',
  };

  // ── Email ─────────────────────────────────────────────────────────────────
  if (user.notify_email && user.email) {
    sendEmail({ userId, vehicleId, serviceName, type, bracket, email: user.email, templateData: enriched })
      .then(() => logger.info(`Email sent [${type}] → ${user.email}`))
      .catch(err => logger.error(`Email failed [${type}]: ${err.message}`));
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (user.phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_WHATSAPP_FROM) {
    sendWhatsApp({ userId, vehicleId, serviceName, type, phone: user.phone, templateData: enriched })
      .catch(err => logger.warn(`WhatsApp failed [${type}]: ${err.message}`));
  }
}

module.exports = { notify };
