// src/jobs/scheduler.js
require('dotenv').config();
const cron = require('node-cron');
const { query } = require('../config/database');
const { notify } = require('../services/notificationService');
const { runServiceAlerts, loadVehicleWithUser } = require('../services/serviceAlertService');
const logger = require('../config/logger');

async function runOdometerUpdateReminders() {
  const vehicles = await loadVehicleWithUser();

  for (const vehicle of vehicles) {
    const user = {
      id: vehicle.user_id,
      first_name: vehicle.first_name,
      last_name: vehicle.last_name,
      email: vehicle.email,
      phone: vehicle.phone,
      notify_whatsapp: vehicle.notify_whatsapp,
      notify_email: vehicle.user_notify_email,
      alert_odometer: vehicle.alert_odometer,
    };

    const { rows: recentOdo } = await query(`
      SELECT id FROM notification_log
      WHERE  vehicle_id = $1
        AND  type = 'odometer'
        AND  status = 'sent'
        AND  sent_at > NOW() - INTERVAL '7 days'
      LIMIT 1
    `, [vehicle.id]);

    if (recentOdo.length) continue;

    await notify({
      userId: user.id,
      vehicleId: vehicle.id,
      serviceName: 'Odometer Update',
      type: 'odometer',
      user,
      vehicle,
      templateData: {
        currentKm: vehicle.current_km,
        unit: vehicle.type === 'tractor' ? 'hrs' : 'km',
        updateUrl: process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5000',
      },
    });
  }
}

async function runDailyCheck() {
  logger.info('Scheduler: running daily service check...');
  try {
    const sentCount = await runServiceAlerts();
    await runOdometerUpdateReminders();
    logger.info(`Scheduler: daily check complete. Service alerts attempted: ${sentCount}`);
  } catch (err) {
    logger.error('Scheduler error:', err);
  }
}

async function runMonthlyDigest() {
  logger.info('Scheduler: running monthly digest...');
  try {
    const { rows: users } = await query('SELECT * FROM users WHERE notify_email=TRUE AND alert_digest=TRUE');

    for (const user of users) {
      const { rows: vehicles } = await query(
        'SELECT * FROM vehicles WHERE user_id=$1 AND is_active=TRUE',
        [user.id]
      );

      let overdue = 0;
      let dueSoon = 0;
      let healthy = 0;
      const overdueItems = [];

      for (const v of vehicles) {
        const { rows: records } = await query(`
          SELECT sr.*, sc.service_name FROM service_records sr
          JOIN service_catalogue sc ON sc.id = sr.catalogue_id
          WHERE sr.vehicle_id=$1 ORDER BY sr.done_at DESC LIMIT 20
        `, [v.id]);

        records.forEach(r => {
          if (r.next_due_km && r.next_due_km < v.current_km) {
            overdue += 1;
            overdueItems.push({
              vehicle: `${v.make} ${v.model}`,
              service: r.service_name,
              overdueKm: v.current_km - r.next_due_km,
              unit: v.type === 'tractor' ? 'hrs' : 'km',
            });
          } else if (r.next_due_km && (r.next_due_km - v.current_km) < 1000) {
            dueSoon += 1;
          } else {
            healthy += 1;
          }
        });
      }

      await notify({
        userId: user.id,
        vehicleId: null,
        serviceName: 'Monthly Digest',
        type: 'digest',
        user,
        vehicle: { make: '', model: '', registration: '', type: '' },
        templateData: {
          overdue,
          dueSoon,
          healthy,
          overdueItems,
          month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          firstName: user.first_name,
        },
      });
    }
  } catch (err) {
    logger.error('Monthly digest error:', err);
  }
}

cron.schedule('0 8 * * *', runDailyCheck, { timezone: 'Asia/Kolkata' });
cron.schedule('0 9 1 * *', runMonthlyDigest, { timezone: 'Asia/Kolkata' });
logger.info('Scheduler started. Daily: 08:00 IST | Digest: 1st 09:00 IST');

if (process.argv.includes('--now')) {
  runDailyCheck().then(() => process.exit(0));
}

module.exports = { runDailyCheck, runMonthlyDigest, runOdometerUpdateReminders };
