// src/services/whatsappService.js
const twilio = require('twilio');
const { query } = require('../config/database');
const logger   = require('../config/logger');

let client;
const getClient = () => {
  if (!client) {
    const sid   = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
    const token = process.env.TWILIO_AUTH_TOKEN  || process.env.TWILIO_TOKEN;
    client = twilio(sid, token);
  }
  return client;
};

// ── Message templates ──────────────────────────────────────────────────────

const templates = {
  warning: (data) =>
`⚠️ *SERVICE DUE SOON — RevTrack*

Vehicle: ${data.vehicleName} (${data.registration})
Service: *${data.serviceName}*
Due at: ${data.nextDueKm ? data.nextDueKm.toLocaleString() + ' km' : 'N/A'}
${data.nextDueDate ? `Due by: ${data.nextDueDate}` : ''}
Days left: ~${data.daysLeft} days

📋 Spec: ${data.spec || 'Per manufacturer'}
🧴 Quantity: ${data.qty || '—'}

Book your service now to stay safe on the road.
📱 RevTrack: revtrack.app`,

  urgent: (data) =>
`🚨 *URGENT — SERVICE DUE IN ${data.daysLeft} DAYS*

Vehicle: ${data.vehicleName} (${data.registration})
Service: *${data.serviceName}*
Due at: ${data.nextDueKm ? data.nextDueKm.toLocaleString() + ' km' : 'N/A'}
Current KM: ${data.currentKm.toLocaleString()} km

⚡ Km remaining: ${data.kmLeft > 0 ? data.kmLeft + ' km' : 'Overdue!'}

Book immediately — only ${data.daysLeft} days remaining!
📱 RevTrack: revtrack.app`,

  overdue: (data) =>
`🔴 *SERVICE CRITICALLY OVERDUE — RevTrack*

Vehicle: ${data.vehicleName} (${data.registration})
Service: *${data.serviceName}*
Was due at: ${data.nextDueKm ? data.nextDueKm.toLocaleString() + ' km' : 'N/A'}
Current KM: ${data.currentKm.toLocaleString()} km
*Overdue by: ${Math.abs(data.kmLeft)} km*

📋 Spec: ${data.spec || 'Per manufacturer'}
🧴 Quantity: ${data.qty || '—'}

⚠️ Continued use risks serious damage. Please book a service *immediately*.
📱 RevTrack: revtrack.app`,

  completion: (data) =>
`✅ *SERVICE LOGGED — RevTrack*

Vehicle: ${data.vehicleName} (${data.registration})
Service: *${data.serviceName}*
Done at: ${data.doneKm.toLocaleString()} km on ${data.doneDate}
${data.nextDueKm ? `Next due: ${data.nextDueKm.toLocaleString()} km` : ''}

Great job staying on schedule! 🎉
📱 RevTrack: revtrack.app`,

  welcome: (data) => data.message || `👋 *Welcome to RevTrack, ${data.firstName}!*

Your account is ready. You will receive WhatsApp alerts for:
• ⚠️ Service due warnings (7 days before)
• 🚨 Urgent reminders (3 days before)  
• 🔴 Overdue critical alerts
• ✅ Service completion confirmations

Add your first vehicle to get started!
📱 revtrack.app`,

  digest: (data) =>
`📊 *MONTHLY VEHICLE REPORT — RevTrack*

Hi ${data.firstName}! Here's your ${data.month} summary:

🔴 Overdue: ${data.overdue} service(s)
🟡 Due soon: ${data.dueSoon} service(s)
✅ Healthy: ${data.healthy} service(s)

${data.overdue > 0 ? '⚠️ Please book overdue services immediately.' : 'All services are on track! 🎉'}

📱 Full report: revtrack.app`,
};

// ── Core send function ────────────────────────────────────────────────────

async function sendWhatsApp({ userId, vehicleId, serviceName, type, phone, templateData }) {
  // Log intent before sending
  const { rows: [log] } = await query(
    `INSERT INTO notification_log
       (user_id, vehicle_id, service_name, channel, type, status, recipient)
     VALUES ($1, $2, $3, 'whatsapp', $4, 'pending', $5)
     RETURNING id`,
    [userId, vehicleId || null, serviceName || null, type, phone]
  );

  const body = templates[type] ? templates[type](templateData) : templateData.message;
  const toNumber = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;

  try {
    const message = await getClient().messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to:   toNumber,
      body,
    });

    await query(
      `UPDATE notification_log SET status='sent', message_id=$1, sent_at=NOW() WHERE id=$2`,
      [message.sid, log.id]
    );

    logger.info(`WhatsApp sent [${type}] → ${phone} (SID: ${message.sid})`);
    return { success: true, sid: message.sid };

  } catch (err) {
    await query(
      `UPDATE notification_log SET status='failed', error_detail=$1 WHERE id=$2`,
      [err.message, log.id]
    );
    logger.error(`WhatsApp failed [${type}] → ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { sendWhatsApp, templates };
