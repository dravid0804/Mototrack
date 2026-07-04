const { query } = require('../config/database');
const { notify } = require('./notificationService');
const logger = require('../config/logger');

function daysBetween(dateA, dateB) {
  return Math.round((new Date(dateA) - new Date(dateB)) / (1000 * 60 * 60 * 24));
}

function markerFor(type, triggerSource, kmLeft, warnKm, warnDays, nextDueKm, nextDueDate) {
  const dueKey = nextDueKm != null ? `km:${nextDueKm}` : `date:${new Date(nextDueDate).toISOString().slice(0, 10)}`;
  if (type === 'overdue' && kmLeft != null) return `${dueKey}:overdue:${triggerSource}:bracket:${Math.floor(Math.abs(kmLeft) / 20)}`;
  if (type === 'warning') return `${dueKey}:warning:${triggerSource}:km${warnKm}:days${warnDays}`;
  if (type === 'urgent') return `${dueKey}:urgent:${triggerSource}`;
  return `${dueKey}:${type}:${triggerSource}`;
}

async function loadVehicleWithUser(vehicleId) {
  const params = [];
  let where = 'v.is_active = TRUE';
  if (vehicleId) {
    params.push(vehicleId);
    where += ` AND v.id = $${params.length}`;
  }

  const { rows } = await query(`
    SELECT v.*,
           u.id AS user_id, u.first_name, u.last_name,
           u.email, u.phone, u.notify_whatsapp, u.notify_email AS user_notify_email,
           u.warn_days, u.urgent_days, u.alert_warning, u.alert_urgent,
           u.alert_overdue, u.alert_completion, u.alert_digest,
           u.alert_odometer, u.warn_km
    FROM   vehicles v
    JOIN   users u ON u.id = v.user_id
    WHERE  ${where}
  `, params);

  return rows;
}

function userFromVehicle(vehicle) {
  return {
    id: vehicle.user_id,
    first_name: vehicle.first_name,
    last_name: vehicle.last_name,
    email: vehicle.email,
    phone: vehicle.phone,
    notify_whatsapp: vehicle.notify_whatsapp,
    notify_email: vehicle.user_notify_email,
    alert_warning: vehicle.alert_warning,
    alert_urgent: vehicle.alert_urgent,
    alert_overdue: vehicle.alert_overdue,
    alert_completion: vehicle.alert_completion,
    alert_digest: vehicle.alert_digest,
    alert_odometer: vehicle.alert_odometer,
  };
}

async function runVehicleServiceAlerts(vehicle, options = {}) {
  const today = options.today || new Date();
  const user = userFromVehicle(vehicle);
  const warnDays = parseInt(vehicle.warn_days, 10) || 7;
  const urgentDays = 10;
  const warnKm = parseInt(vehicle.warn_km, 10) || 100;
  const urgentKm = 50;
  const currentKm = parseInt(vehicle.current_km, 10) || 0;
  const unit = vehicle.type === 'tractor' ? 'hrs' : 'km';
  let sentCount = 0;

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
    WHERE  (sc.vehicle_type=$2 OR sc.vehicle_type='all' OR (sc.vehicle_type='both' AND $2 IN ('car','bike')))
      AND  (sc.fuel_type='any' OR sc.fuel_type=$3 OR (sc.fuel_type='ice' AND $3 IN ('petrol','diesel','cng','hybrid')))
  `, [vehicle.id, vehicle.type, vehicle.fuel_type]);

  for (const svc of services) {
    let nextDueKm = null;
    let nextDueDate = null;

    if (svc.eff_interval_km) {
      nextDueKm = (parseInt(svc.done_km, 10) || 0) + parseInt(svc.eff_interval_km, 10);
    }
    if (svc.eff_interval_months) {
      const d = new Date(svc.done_at || vehicle.created_at || Date.now());
      d.setMonth(d.getMonth() + parseInt(svc.eff_interval_months, 10));
      nextDueDate = d;
    }

    if (!nextDueKm && !nextDueDate) continue;

    const kmLeft = nextDueKm != null ? nextDueKm - currentKm : null;
    const daysLeft = nextDueDate != null ? daysBetween(nextDueDate, today) : null;
    const kmStatus = kmLeft == null ? 'ok' : kmLeft < 0 ? 'overdue' : kmLeft <= urgentKm ? 'urgent' : kmLeft <= warnKm ? 'warning' : 'ok';
    const dateStatus = daysLeft == null ? 'ok' : daysLeft < 0 ? 'overdue' : daysLeft <= urgentDays ? 'urgent' : daysLeft <= warnDays ? 'warning' : 'ok';
    const order = { overdue: 0, urgent: 1, warning: 2, ok: 3 };
    const type = order[kmStatus] <= order[dateStatus] ? kmStatus : dateStatus;
    const triggerSource = kmStatus === type && dateStatus === type
      ? 'km-days'
      : kmStatus === type ? 'km' : 'days';

    if (type === 'ok') continue;

    const marker = markerFor(type, triggerSource, kmLeft, warnKm, warnDays, nextDueKm, nextDueDate);
    if (type === 'overdue') {
      const { rows: sentToday } = await query(`
        SELECT id FROM notification_log
        WHERE  vehicle_id = $1
          AND  service_name = $2
          AND  type = 'overdue'
          AND  status = 'sent'
          AND  sent_at >= CURRENT_DATE
        LIMIT 1
      `, [vehicle.id, svc.service_name]);
      const { rows: sentMarker } = await query(`
        SELECT id FROM notification_log
        WHERE  vehicle_id = $1
          AND  service_name = $2
          AND  type = 'overdue'
          AND  status = 'sent'
          AND  CAST(error_detail AS TEXT) = $3
        LIMIT 1
      `, [vehicle.id, svc.service_name, marker]);
      if (sentToday.length || sentMarker.length) continue;
    } else {
      const { rows: sent } = await query(`
        SELECT id FROM notification_log
        WHERE  vehicle_id = $1
          AND  service_name = $2
          AND  type = $3
          AND  status = 'sent'
          AND  CAST(error_detail AS TEXT) = $4
        LIMIT 1
      `, [vehicle.id, svc.service_name, type, marker]);
      if (sent.length) continue;
    }

    await notify({
      userId: user.id,
      vehicleId: vehicle.id,
      serviceName: svc.service_name,
      type,
      bracket: marker,
      user,
      vehicle,
      templateData: {
        serviceName: svc.service_name,
        nextDueKm,
        nextDueDate: nextDueDate ? nextDueDate.toDateString() : null,
        currentKm,
        kmLeft: kmLeft ?? 0,
        daysLeft: daysLeft ?? 0,
        unit,
        spec: svc.eff_spec,
        qty: svc.eff_qty,
        description: svc.description,
        priority: svc.priority,
        month: today.toLocaleString('default', { month: 'long', year: 'numeric' }),
      },
    });

    sentCount += 1;
    logger.info(`[${type.toUpperCase()}] ${vehicle.make} ${vehicle.model} - ${svc.service_name} | kmLeft: ${kmLeft} | daysLeft: ${daysLeft}`);
  }

  return sentCount;
}

async function runServiceAlerts({ vehicleId } = {}) {
  const vehicles = await loadVehicleWithUser(vehicleId);
  let sentCount = 0;
  for (const vehicle of vehicles) {
    sentCount += await runVehicleServiceAlerts(vehicle);
  }
  return sentCount;
}

module.exports = { runServiceAlerts, runVehicleServiceAlerts, loadVehicleWithUser };
