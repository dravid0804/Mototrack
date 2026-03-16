// src/jobs/scheduler.js
require('dotenv').config();
const cron      = require('node-cron');
const { query } = require('../config/database');
const { notify } = require('../services/notificationService');
const logger    = require('../config/logger');

function daysBetween(dateA, dateB) {
  return Math.round((new Date(dateA) - new Date(dateB)) / (1000 * 60 * 60 * 24));
}

// ── CORE DAILY CHECK ──────────────────────────────────────────────────────
async function runDailyCheck() {
  logger.info('Scheduler: running daily service check…');
  const today = new Date();

  try {
    // All active vehicles with their owners
    const { rows: vehicles } = await query(`
      SELECT v.*, u.id AS user_id, u.first_name, u.last_name,
             u.email, u.phone, u.notify_whatsapp, u.notify_email,
             u.warn_days, u.urgent_days
      FROM   vehicles v
      JOIN   users    u ON u.id = v.user_id
      WHERE  v.is_active = TRUE
    `);

    for (const vehicle of vehicles) {
      const user = {
        id:              vehicle.user_id,
        first_name:      vehicle.first_name,
        last_name:       vehicle.last_name,
        email:           vehicle.email,
        phone:           vehicle.phone,
        notify_whatsapp: vehicle.notify_whatsapp,
        notify_email:    vehicle.notify_email,
      };

      const warnDays   = vehicle.warn_days   || 7;
      const urgentDays = vehicle.urgent_days || 3;
      const warnKm     = 800;   // warning threshold km
      const urgentKm   = 100;   // urgent threshold km (send email before 100km due)

      // Get all catalogue services for this vehicle with latest service record
      const { rows: services } = await query(`
        SELECT sc.id AS catalogue_id, sc.service_name, sc.priority, sc.description,
               COALESCE(vsc.custom_interval_km,     sc.interval_km)     AS eff_interval_km,
               COALESCE(vsc.custom_interval_months, sc.interval_months) AS eff_interval_months,
               COALESCE(vsc.custom_spec,            sc.default_spec)    AS eff_spec,
               COALESCE(vsc.custom_qty,             sc.default_qty)     AS eff_qty,
               sr.done_at, sr.done_km
        FROM   service_catalogue sc
        LEFT   JOIN vehicle_service_config vsc
                 ON vsc.vehicle_id=$1 AND vsc.catalogue_id=sc.id
        LEFT   JOIN LATERAL (
          SELECT done_at, done_km FROM service_records
          WHERE  vehicle_id=$1 AND catalogue_id=sc.id
          ORDER  BY done_km DESC, done_at DESC LIMIT 1
        ) sr ON TRUE
        WHERE  (sc.vehicle_type=$2 OR sc.vehicle_type='both')
          AND  (sc.fuel_type='any' OR sc.fuel_type=$3)
      `, [vehicle.id, vehicle.type, vehicle.fuel_type]);

      const currentKm = vehicle.current_km;

      for (const svc of services) {
        // Always recalculate from current effective interval
        let nextDueKm   = null;
        let nextDueDate = null;

        if (svc.done_km && svc.eff_interval_km) {
          nextDueKm = parseInt(svc.done_km) + parseInt(svc.eff_interval_km);
        }
        if (svc.done_at && svc.eff_interval_months) {
          const d = new Date(svc.done_at);
          d.setMonth(d.getMonth() + parseInt(svc.eff_interval_months));
          nextDueDate = d;
        }

        // For services never logged, if there's only a time-based interval
        // we can't send km alerts — skip
        if (!nextDueKm && !nextDueDate) continue;

        const kmLeft   = nextDueKm   != null ? nextDueKm - currentKm : null;
        const daysLeft = nextDueDate != null ? daysBetween(nextDueDate, today) : null;

        // Determine status from WORST of km vs date
        const kmStatus   = kmLeft   == null ? 'ok' : kmLeft   < 0 ? 'overdue' : kmLeft   <= urgentKm  ? 'urgent' : kmLeft   <= warnKm ? 'warning' : 'ok';
        const dateStatus = daysLeft == null ? 'ok' : daysLeft < 0 ? 'overdue' : daysLeft <= urgentDays ? 'urgent' : daysLeft <= warnDays ? 'warning' : 'ok';
        const order = { overdue: 0, urgent: 1, warning: 2, ok: 3 };
        const worstStatus = order[kmStatus] <= order[dateStatus] ? kmStatus : dateStatus;

        if (worstStatus === 'ok') continue; // healthy — no alert needed

        const type = worstStatus; // 'overdue' | 'urgent' | 'warning'

        // ── Deduplication logic ────────────────────────────────────────────
        // For OVERDUE: resend every 200 km — check if we sent at this "200km bracket"
        // For WARNING/URGENT: send once per status level per 7-day window
        let shouldSend = false;

        if (type === 'overdue' && kmLeft !== null) {
          // How many km are we overdue? e.g. 250 km overdue → bracket = 1 (0–200 is bracket 0, 200–400 is bracket 1)
          const overduekm = Math.abs(kmLeft);
          const bracket   = Math.floor(overduekm / 200); // 0=0-199km, 1=200-399km, 2=400-599km...

          // Only send if we haven't sent for THIS bracket yet
          const { rows: sent } = await query(`
            SELECT id FROM notification_log
            WHERE  vehicle_id   = $1
              AND  service_name = $2
              AND  type         = 'overdue'
              AND  status       = 'sent'
              AND  CAST(error_detail AS TEXT) = $3
            LIMIT 1
          `, [vehicle.id, svc.service_name, `bracket:${bracket}`]);

          shouldSend = sent.length === 0;
        } else {
          // Warning/Urgent: send once per 7 days
          const { rows: recent } = await query(`
            SELECT id FROM notification_log
            WHERE  vehicle_id   = $1
              AND  service_name = $2
              AND  type         = $3
              AND  status       = 'sent'
              AND  sent_at      > NOW() - INTERVAL '7 days'
            LIMIT 1
          `, [vehicle.id, svc.service_name, type]);

          shouldSend = recent.length === 0;
        }

        if (!shouldSend) continue;

        const templateData = {
          serviceName:  svc.service_name,
          nextDueKm,
          nextDueDate:  nextDueDate ? nextDueDate.toDateString() : null,
          currentKm,
          kmLeft:       kmLeft  ?? 0,
          daysLeft:     daysLeft ?? 0,
          spec:         svc.eff_spec,
          qty:          svc.eff_qty,
          description:  svc.description,
          priority:     svc.priority,
          month:        today.toLocaleString('default', { month: 'long', year: 'numeric' }),
        };

        // For overdue, store bracket in error_detail so we can deduplicate per 200km
        const overduekm = kmLeft !== null && kmLeft < 0 ? Math.abs(kmLeft) : null;
        const bracket   = overduekm != null ? `bracket:${Math.floor(overduekm / 200)}` : null;

        await notify({
          userId:      user.id,
          vehicleId:   vehicle.id,
          serviceName: svc.service_name,
          type,
          bracket,      // passed to notify for logging
          user,
          vehicle,
          templateData,
        });

        logger.info(`[${type.toUpperCase()}] ${vehicle.make} ${vehicle.model} — ${svc.service_name} | kmLeft: ${kmLeft} | daysLeft: ${daysLeft}`);
      }
    }

    logger.info('Scheduler: daily check complete.');
  } catch (err) {
    logger.error('Scheduler error:', err);
  }
}

// ── MONTHLY DIGEST ────────────────────────────────────────────────────────
async function runMonthlyDigest() {
  logger.info('Scheduler: running monthly digest…');
  try {
    const { rows: users } = await query('SELECT * FROM users WHERE notify_email=TRUE');

    for (const user of users) {
      const { rows: vehicles } = await query(
        'SELECT * FROM vehicles WHERE user_id=$1 AND is_active=TRUE',
        [user.id]
      );

      let overdue = 0, dueSoon = 0, healthy = 0;
      const overdueItems = [];

      for (const v of vehicles) {
        const { rows: records } = await query(`
          SELECT sr.*, sc.service_name FROM service_records sr
          JOIN service_catalogue sc ON sc.id = sr.catalogue_id
          WHERE sr.vehicle_id=$1 ORDER BY sr.done_at DESC LIMIT 20
        `, [v.id]);

        records.forEach(r => {
          if (r.next_due_km && r.next_due_km < v.current_km) {
            overdue++;
            overdueItems.push({ vehicle: `${v.make} ${v.model}`, service: r.service_name, overdueKm: v.current_km - r.next_due_km });
          } else if (r.next_due_km && (r.next_due_km - v.current_km) < 1000) {
            dueSoon++;
          } else { healthy++; }
        });
      }

      await notify({
        userId: user.id, vehicleId: null, serviceName: 'Monthly Digest', type: 'digest',
        user, vehicle: { make:'', model:'', registration:'', type:'' },
        templateData: { overdue, dueSoon, healthy, overdueItems, month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }), firstName: user.first_name },
      });
    }
  } catch (err) {
    logger.error('Monthly digest error:', err);
  }
}

// ── CRON ──────────────────────────────────────────────────────────────────
cron.schedule('0 8 * * *', runDailyCheck,     { timezone: 'Asia/Kolkata' });
cron.schedule('0 9 1 * *', runMonthlyDigest,  { timezone: 'Asia/Kolkata' });
logger.info('Scheduler started. Daily: 08:00 IST | Digest: 1st 09:00 IST');

if (process.argv.includes('--now')) {
  runDailyCheck().then(() => process.exit(0));
}

module.exports = { runDailyCheck, runMonthlyDigest };
