// src/services/emailService.js
const nodemailer = require('nodemailer');
const { query }  = require('../config/database');
const logger     = require('../config/logger');

let transporter;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED).toLowerCase() === 'true',
      },
    });
  }
  return transporter;
};

const readingUnit = (d) => d.unit || 'km';
const fmtReading = (value, d) => `${Number(value || 0).toLocaleString()} ${readingUnit(d)}`;

// ── HTML base template ────────────────────────────────────────────────────

const baseHtml = (title, accentColor, bodyContent) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0A0C10;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0C10;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0E1018;border-radius:16px;overflow:hidden;border:1px solid #1A1E2A;">
        <!-- Header -->
        <tr>
          <td style="background:${accentColor};padding:4px 0;"></td>
        </tr>
        <tr>
          <td style="padding:28px 36px 20px;border-bottom:1px solid #1A1E2A;">
            <table width="100%"><tr>
              <td>
                <span style="font-size:22px;font-weight:800;color:${accentColor};letter-spacing:-0.5px;">⚙ MotoTrack</span>
              </td>
              <td align="right">
                <span style="font-size:12px;color:#4A5270;letter-spacing:1px;text-transform:uppercase;">Vehicle Service Manager</span>
              </td>
            </tr></table>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px 36px;">${bodyContent}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #1A1E2A;background:#08090D;">
            <p style="margin:0;font-size:11px;color:#4A5270;text-align:center;">
              You're receiving this because you enabled email alerts in MotoTrack.<br>
              <a href="#" style="color:#FF5C1A;text-decoration:none;">Manage notifications</a> &nbsp;·&nbsp;
              <a href="#" style="color:#FF5C1A;text-decoration:none;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Email HTML bodies ─────────────────────────────────────────────────────

const emailBodies = {

  warning: (d) => baseHtml(
    `Service Due Soon — ${d.serviceName}`,
    '#F0A500',
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">⚠️ Service Due Soon</h1>
     <p style="margin:0 0 24px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, your vehicle needs attention.</p>
     <table width="100%" style="background:#141720;border-radius:12px;padding:24px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
       <tr><td colspan="2" style="padding-bottom:16px;border-bottom:1px solid #1A1E2A;margin-bottom:16px;">
         <p style="margin:0;font-size:20px;font-weight:700;color:#ECEEFF;">${d.vehicleName}</p>
         <p style="margin:4px 0 0;font-size:13px;color:#4A5270;">${d.registration} &nbsp;·&nbsp; ${d.vehicleType}</p>
       </td></tr>
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Service</td>
           <td style="padding:10px 0;color:#ECEEFF;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #1A1E2A;">${d.serviceName}</td></tr>
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Due at</td>
           <td style="padding:10px 0;color:#F0A500;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #1A1E2A;">${d.nextDueKm ? d.nextDueKm.toLocaleString() + ' km' : d.nextDueDate || 'N/A'}</td></tr>
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Days remaining</td>
           <td style="padding:10px 0;color:#F0A500;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #1A1E2A;">~${d.daysLeft} days</td></tr>
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Oil / Fluid spec</td>
           <td style="padding:10px 0;color:#ECEEFF;font-size:13px;text-align:right;border-bottom:1px solid #1A1E2A;">${d.spec || '—'}</td></tr>
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;">Quantity needed</td>
           <td style="padding:10px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.qty || '—'}</td></tr>
     </table>
     <a href="https://Mototrack.app" style="display:inline-block;background:#FF5C1A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">View in MotoTrack →</a>`
  ),

  overdue: (d) => baseHtml(
    `OVERDUE: ${d.serviceName} — ${d.vehicleName}`,
    '#E53935',
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">🔴 Service Critically Overdue</h1>
     <p style="margin:0 0 24px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, immediate action is required.</p>
     <div style="background:#2D0A0A;border:1px solid #E53935;border-radius:12px;padding:20px;margin-bottom:24px;">
       <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#E53935;">${d.vehicleName} — ${d.serviceName}</p>
       <p style="margin:0;font-size:13px;color:#8892B0;">Was due at <strong style="color:#ECEEFF">${d.nextDueKm ? d.nextDueKm.toLocaleString() + ' km' : 'N/A'}</strong> · Current: <strong style="color:#ECEEFF">${d.currentKm.toLocaleString()} km</strong></p>
       <p style="margin:10px 0 0;font-size:18px;font-weight:700;color:#E53935;">Overdue by ${Math.abs(d.kmLeft)} km</p>
     </div>
     <table width="100%" style="background:#141720;border-radius:12px;padding:20px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
       <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Oil / Fluid spec</td>
           <td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;border-bottom:1px solid #1A1E2A;">${d.spec || '—'}</td></tr>
       <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Quantity</td>
           <td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.qty || '—'}</td></tr>
     </table>
     <p style="font-size:13px;color:#8892B0;margin-bottom:20px;">⚠️ ${d.description || 'Delaying this service risks serious mechanical damage.'}</p>
     <a href="https://Mototrack.app" style="display:inline-block;background:#E53935;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">Book Service Now →</a>`
  ),

  completion: (d) => baseHtml(
    `Service Logged — ${d.serviceName}`,
    '#1DB954',
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">✅ Service Logged</h1>
     <p style="margin:0 0 24px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, great job keeping ${d.vehicleName} in top shape!</p>
     <table width="100%" style="background:#141720;border-radius:12px;padding:24px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Vehicle</td>
           <td style="padding:10px 0;color:#ECEEFF;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #1A1E2A;">${d.vehicleName} (${d.registration})</td></tr>
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Service done</td>
           <td style="padding:10px 0;color:#1DB954;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #1A1E2A;">${d.serviceName}</td></tr>
       <tr><td style="padding:10px 0;color:#8892B0;font-size:13px;border-bottom:1px solid #1A1E2A;">Done at</td>
           <td style="padding:10px 0;color:#ECEEFF;font-size:13px;text-align:right;border-bottom:1px solid #1A1E2A;">${fmtReading(d.doneKm, d)} · ${d.doneDate}</td></tr>
       ${d.nextDueKm ? `<tr><td style="padding:10px 0;color:#8892B0;font-size:13px;">Next due</td>
            <td style="padding:10px 0;color:#4A9EFF;font-size:13px;font-weight:600;text-align:right;">${fmtReading(d.nextDueKm, d)}</td></tr>` : ''}
     </table>
     <a href="https://Mototrack.app" style="display:inline-block;background:#1DB954;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">View Service Log →</a>`
  ),

  digest: (d) => baseHtml(
    `Monthly Vehicle Report — ${d.month}`,
    '#FF5C1A',
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">📊 Monthly Vehicle Health Report</h1>
     <p style="margin:0 0 24px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, here's your ${d.month} vehicle health summary.</p>
     <div style="display:flex;gap:12px;margin-bottom:24px;">
       <div style="flex:1;background:#2D0A0A;border:1px solid #E53935;border-radius:12px;padding:16px;text-align:center;">
         <p style="margin:0;font-size:28px;font-weight:700;color:#E53935;">${d.overdue}</p>
         <p style="margin:4px 0 0;font-size:12px;color:#8892B0;text-transform:uppercase;">Overdue</p>
       </div>
       <div style="flex:1;background:#2A1A00;border:1px solid #F0A500;border-radius:12px;padding:16px;text-align:center;">
         <p style="margin:0;font-size:28px;font-weight:700;color:#F0A500;">${d.dueSoon}</p>
         <p style="margin:4px 0 0;font-size:12px;color:#8892B0;text-transform:uppercase;">Due Soon</p>
       </div>
       <div style="flex:1;background:#0A1A0F;border:1px solid #1DB954;border-radius:12px;padding:16px;text-align:center;">
         <p style="margin:0;font-size:28px;font-weight:700;color:#1DB954;">${d.healthy}</p>
         <p style="margin:4px 0 0;font-size:12px;color:#8892B0;text-transform:uppercase;">Healthy</p>
       </div>
     </div>
     ${d.overdueItems && d.overdueItems.length ? `
     <div style="background:#141720;border-radius:12px;padding:20px;margin-bottom:24px;">
       <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#E53935;">🔴 Overdue Services</p>
       ${d.overdueItems.map(it => `<p style="margin:0 0 8px;font-size:13px;color:#8892B0;">• <strong style="color:#ECEEFF">${it.vehicle}</strong> — ${it.service} (${it.overdueKm} ${it.unit || 'km'} overdue)</p>`).join('')}
     </div>` : ''}
     <a href="https://Mototrack.app" style="display:inline-block;background:#FF5C1A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">View Full Report →</a>`
  ),
};

emailBodies.urgent = (d) => baseHtml(
  `Urgent Service Reminder - ${d.serviceName}`,
  '#E85D1A',
  `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">Urgent service reminder</h1>
   <p style="margin:0 0 20px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, ${d.serviceName} for ${d.vehicleName} is coming due very soon.</p>
   <table width="100%" style="background:#141720;border-radius:12px;padding:20px;margin-bottom:20px;" cellpadding="0" cellspacing="0">
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Vehicle</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.vehicleName} (${d.registration})</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Current reading</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${fmtReading(d.currentKm, d)}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Due at</td><td style="padding:8px 0;color:#E85D1A;font-size:13px;font-weight:700;text-align:right;">${d.nextDueKm ? fmtReading(d.nextDueKm, d) : d.nextDueDate || 'N/A'}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Time left</td><td style="padding:8px 0;color:#E85D1A;font-size:13px;font-weight:700;text-align:right;">${d.daysLeft > 0 ? d.daysLeft + ' day(s)' : 'Due now'}${d.kmLeft > 0 ? ' / ' + fmtReading(d.kmLeft, d) : ''}</td></tr>
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Spec / quantity</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.spec || 'As per manufacturer'} ${d.qty ? '- ' + d.qty : ''}</td></tr>
   </table>
   <p style="font-size:13px;color:#8892B0;margin:0;">Please plan this service before the due limit to avoid wear or breakdowns.</p>`
);

emailBodies.welcome = (d) => baseHtml(
  'Welcome to MotoTrack',
  '#E85D1A',
  `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">Welcome to MotoTrack</h1>
   <p style="margin:0;font-size:14px;color:#8892B0;">Hi ${d.firstName}, your account is ready. Add your vehicle and MotoTrack will remind you before important services are due.</p>`
);

emailBodies.warning = (d) => baseHtml(
  `Service Due Soon - ${d.serviceName}`,
  '#F0A500',
  `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">Service due soon</h1>
   <p style="margin:0 0 20px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, this is a reminder that one service is coming up.</p>
   <table width="100%" style="background:#141720;border-radius:12px;padding:20px;margin-bottom:20px;" cellpadding="0" cellspacing="0">
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Vehicle</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.vehicleName} (${d.registration})</td></tr>
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Service</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.serviceName}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Current reading</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${fmtReading(d.currentKm, d)}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Due at</td><td style="padding:8px 0;color:#F0A500;font-size:13px;font-weight:700;text-align:right;">${d.nextDueKm ? fmtReading(d.nextDueKm, d) : d.nextDueDate || 'N/A'}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Remaining</td><td style="padding:8px 0;color:#F0A500;font-size:13px;font-weight:700;text-align:right;">${d.daysLeft > 0 ? d.daysLeft + ' day(s)' : 'Due now'}${d.kmLeft > 0 ? ' / ' + fmtReading(d.kmLeft, d) : ''}</td></tr>
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Spec / quantity</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.spec || 'As per manufacturer'} ${d.qty ? '- ' + d.qty : ''}</td></tr>
   </table>
   <p style="font-size:13px;color:#8892B0;margin:0;">Please schedule this service before the due limit.</p>`
);

emailBodies.overdue = (d) => baseHtml(
  `Service Overdue - ${d.serviceName}`,
  '#E53935',
  `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">Service overdue</h1>
   <p style="margin:0 0 20px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, this service has passed its due limit and needs attention.</p>
   <table width="100%" style="background:#141720;border-radius:12px;padding:20px;margin-bottom:20px;" cellpadding="0" cellspacing="0">
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Vehicle</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.vehicleName} (${d.registration})</td></tr>
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Service</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.serviceName}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Current reading</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${fmtReading(d.currentKm, d)}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Was due at</td><td style="padding:8px 0;color:#E53935;font-size:13px;font-weight:700;text-align:right;">${d.nextDueKm ? fmtReading(d.nextDueKm, d) : d.nextDueDate || 'N/A'}</td></tr>
      <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Overdue by</td><td style="padding:8px 0;color:#E53935;font-size:13px;font-weight:700;text-align:right;">${d.kmLeft < 0 ? fmtReading(Math.abs(d.kmLeft), d) : Math.abs(d.daysLeft || 0) + ' day(s)'}</td></tr>
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Spec / quantity</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.spec || 'As per manufacturer'} ${d.qty ? '- ' + d.qty : ''}</td></tr>
   </table>
   <p style="font-size:13px;color:#8892B0;margin:0;">Please complete this service as soon as possible to reduce wear and breakdown risk.</p>`
);

emailBodies.odometer = (d) => baseHtml(
  `Update Odometer - ${d.vehicleName}`,
  '#2563EB',
  `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ECEEFF;">Update your odometer reading</h1>
   <p style="margin:0 0 20px;font-size:14px;color:#8892B0;">Hi ${d.firstName}, please update the current ${readingUnit(d)} reading for ${d.vehicleName}. This helps MotoTrack calculate service due reminders accurately.</p>
   <table width="100%" style="background:#141720;border-radius:12px;padding:20px;margin-bottom:20px;" cellpadding="0" cellspacing="0">
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Vehicle</td><td style="padding:8px 0;color:#ECEEFF;font-size:13px;text-align:right;">${d.vehicleName} (${d.registration})</td></tr>
     <tr><td style="padding:8px 0;color:#8892B0;font-size:13px;">Last saved reading</td><td style="padding:8px 0;color:#2563EB;font-size:13px;font-weight:700;text-align:right;">${fmtReading(d.currentKm, d)}</td></tr>
   </table>
   <a href="${d.updateUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;">Update odometer</a>
   <p style="font-size:12px;color:#8892B0;margin:16px 0 0;">You will receive this reminder every week until the reading is kept up to date.</p>`
);

// ── Subject lines ─────────────────────────────────────────────────────────

const subjects = {
  warning:    (d) => `${d.serviceName} due soon - ${d.vehicleName}`,
  urgent:     (d) => `URGENT: ${d.serviceName} due soon - ${d.vehicleName}`,
  overdue:    (d) => `🔴 OVERDUE: ${d.serviceName} — ${d.vehicleName} needs service NOW`,
  completion: (d) => `✅ Service logged — ${d.serviceName} on ${d.vehicleName}`,
  digest:     (d) => `📊 Your ${d.month} vehicle health report — MotoTrack`,
  welcome:    () => 'Welcome to MotoTrack',
  odometer:   (d) => `Update ${readingUnit(d)} reading - ${d.vehicleName}`,
};

// ── Core send function ────────────────────────────────────────────────────

async function sendEmail({ userId, vehicleId, serviceName, type, bracket, email, templateData }) {
  const { rows: [log] } = await query(
    `INSERT INTO notification_log
       (user_id, vehicle_id, service_name, channel, type, status, recipient)
     VALUES ($1, $2, $3, 'email', $4, 'pending', $5)
     RETURNING id`,
    [userId, vehicleId || null, serviceName || null, type, email]
  );

  const htmlBody = emailBodies[type] ? emailBodies[type](templateData) : `<p>${templateData.message || ''}</p>`;
  const subject  = subjects[type]    ? subjects[type](templateData)    : `MotoTrack — ${type}`;

  try {
    const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER;
    const info = await getTransporter().sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME || 'MotoTrack'}" <${fromAddress}>`,
      to:      email,
      subject,
      html:    htmlBody,
    });

    // Store bracket in error_detail so scheduler can deduplicate overdue reminders per threshold.
    await query(
      `UPDATE notification_log SET status='sent', message_id=$1, sent_at=NOW(), error_detail=$2 WHERE id=$3`,
      [info.messageId, bracket || null, log.id]
    );

    logger.info(`Email sent [${type}] → ${email}`);
    logger.info(`SMTP response [${type}] -> ${email} | accepted=${(info.accepted || []).join(',') || 'none'} | rejected=${(info.rejected || []).join(',') || 'none'} | response=${info.response || 'n/a'}`);
    return { success: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response };

  } catch (err) {
    await query(
      `UPDATE notification_log SET status='failed', error_detail=$1 WHERE id=$2`,
      [err.message, log.id]
    );
    logger.error(`Email failed [${type}] → ${email}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
