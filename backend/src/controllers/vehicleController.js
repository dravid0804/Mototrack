// src/controllers/vehicleController.js
const { query }  = require('../config/database');
const { validationResult } = require('express-validator');
const { runServiceAlerts } = require('../services/serviceAlertService');

exports.list = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT v.*,
              COUNT(DISTINCT sr.id) AS service_count,
              MAX(sr.done_at)       AS last_service_date
       FROM   vehicles v
       LEFT   JOIN service_records sr ON sr.vehicle_id = v.id
       WHERE  v.user_id = $1 AND v.is_active = TRUE
       GROUP  BY v.id
       ORDER  BY v.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, vehicles: rows });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { type, make, model, year, fuel_type, registration,
            current_km, engine_cc, transmission, color, notes } = req.body;

    const { rows: [vehicle] } = await query(
      `INSERT INTO vehicles
         (user_id, type, make, model, year, fuel_type, registration,
          current_km, engine_cc, transmission, color, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.user.id, type, make, model, year, fuel_type || 'petrol',
       registration, current_km || 0, engine_cc, transmission, color, notes]
    );

    // Auto-create service config entries from catalogue
    await query(`
      INSERT INTO vehicle_service_config (vehicle_id, catalogue_id)
      SELECT $1, id FROM service_catalogue
      WHERE  (vehicle_type = $2 OR vehicle_type = 'all' OR (vehicle_type = 'both' AND $2 IN ('car','bike')))
        AND  (fuel_type = 'any' OR fuel_type = $3 OR (fuel_type = 'ice' AND $3 IN ('petrol','diesel','cng','hybrid')))
      ON CONFLICT DO NOTHING
    `, [vehicle.id, type, fuel_type || 'petrol']);

    res.status(201).json({ success: true, vehicle });
  } catch (err) { next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const { rows: [vehicle] } = await query(
      'SELECT * FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    res.json({ success: true, vehicle });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { current_km, registration, color, notes } = req.body;
    const fields = [];
    const values = [];

    if (current_km !== undefined) { values.push(current_km); fields.push(`current_km=$${values.length}`); }
    if (registration !== undefined) { values.push(registration); fields.push(`registration=$${values.length}`); }
    if (color !== undefined) { values.push(color); fields.push(`color=$${values.length}`); }
    if (notes !== undefined) { values.push(notes); fields.push(`notes=$${values.length}`); }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No vehicle fields to update' });
    }

    values.push(req.params.id, req.user.id);
    const { rows: [vehicle] } = await query(
      `UPDATE vehicles SET ${fields.join(', ')}, updated_at=NOW()
       WHERE id=$${values.length - 1} AND user_id=$${values.length} RETURNING *`,
      values
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (current_km !== undefined) {
      await runServiceAlerts({ vehicleId: vehicle.id });
    }
    res.json({ success: true, vehicle });
  } catch (err) { next(err); }
};

// Save custom interval for a service on a vehicle
exports.saveInterval = async (req, res, next) => {
  try {
    const { catalogue_id, interval_km, interval_months } = req.body;
    if (!catalogue_id) return res.status(400).json({ success: false, message: 'catalogue_id required' });

    // Verify vehicle belongs to user
    const { rows: [vehicle] } = await query(
      'SELECT id FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    // Upsert into vehicle_service_config
    await query(`
      INSERT INTO vehicle_service_config (vehicle_id, catalogue_id, custom_interval_km, custom_interval_months)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (vehicle_id, catalogue_id) DO UPDATE
        SET custom_interval_km     = EXCLUDED.custom_interval_km,
            custom_interval_months = EXCLUDED.custom_interval_months
    `, [req.params.id, catalogue_id, interval_km || null, interval_months || null]);

    res.json({ success: true, message: 'Interval saved' });
  } catch (err) { next(err); }
};

// Save custom spec and quantity for a service on a vehicle
exports.saveSpec = async (req, res, next) => {
  try {
    const { catalogue_id, custom_spec, custom_qty } = req.body;
    if (!catalogue_id) return res.status(400).json({ success: false, message: 'catalogue_id required' });

    const { rows: [vehicle] } = await query(
      'SELECT id FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    await query(`
      INSERT INTO vehicle_service_config (vehicle_id, catalogue_id, custom_spec, custom_qty)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (vehicle_id, catalogue_id) DO UPDATE
        SET custom_spec = EXCLUDED.custom_spec,
            custom_qty  = EXCLUDED.custom_qty
    `, [req.params.id, catalogue_id, custom_spec || null, custom_qty || null]);

    // Also update the latest service record's spec_used so it shows correctly in logs
    if (custom_spec || custom_qty) {
      await query(`
        UPDATE service_records SET
          spec_used = COALESCE($1, spec_used),
          qty_used  = COALESCE($2, qty_used)
        WHERE id = (
          SELECT id FROM service_records
          WHERE vehicle_id=$3 AND catalogue_id=$4
          ORDER BY done_km DESC, done_at DESC LIMIT 1
        )
      `, [custom_spec || null, custom_qty || null, req.params.id, catalogue_id]);
    }

    res.json({ success: true, message: 'Spec saved' });
  } catch (err) { next(err); }
};

// Re-sync service config for existing vehicle (adds missing catalogue entries)
exports.resync = async (req, res, next) => {
  try {
    const { rows: [vehicle] } = await query(
      'SELECT * FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const result = await query(`
      INSERT INTO vehicle_service_config (vehicle_id, catalogue_id)
      SELECT $1, id FROM service_catalogue
      WHERE (vehicle_type = $2 OR vehicle_type = 'all' OR (vehicle_type = 'both' AND $2 IN ('car','bike')))
        AND (fuel_type = 'any' OR fuel_type = $3 OR (fuel_type = 'ice' AND $3 IN ('petrol','diesel','cng','hybrid')))
      ON CONFLICT DO NOTHING
    `, [vehicle.id, vehicle.type, vehicle.fuel_type]);

    res.json({ success: true, message: 'Service config synced', vehicle });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await query(
      'UPDATE vehicles SET is_active=FALSE WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Vehicle removed' });
  } catch (err) { next(err); }
};

// Full service health for one vehicle
exports.health = async (req, res, next) => {
  try {
    const { rows: [vehicle] } = await query(
      'SELECT * FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const { rows: services } = await query(`
      SELECT sc.id AS catalogue_id, sc.service_name, sc.priority, sc.description,
             COALESCE(vsc.custom_interval_km,     sc.interval_km)     AS interval_km,
             COALESCE(vsc.custom_interval_months, sc.interval_months) AS interval_months,
             sc.interval_km     AS default_interval_km,
             sc.interval_months AS default_interval_months,
             COALESCE(vsc.custom_spec,            sc.default_spec)    AS spec,
             COALESCE(vsc.custom_qty,             sc.default_qty)     AS qty,
             CASE WHEN vsc.id IS NOT NULL THEN true ELSE false END     AS has_custom,
             sr.done_at, sr.done_km, sr.next_due_km, sr.next_due_date,
             sr.spec_used, sr.qty_used
      FROM   service_catalogue sc
      LEFT JOIN vehicle_service_config vsc ON vsc.catalogue_id = sc.id AND vsc.vehicle_id = $1
      LEFT JOIN LATERAL (
        SELECT * FROM service_records
        WHERE vehicle_id=$1 AND catalogue_id=sc.id
        ORDER BY done_km DESC, done_at DESC LIMIT 1
      ) sr ON TRUE
      WHERE  (sc.vehicle_type = $2 OR sc.vehicle_type = 'all' OR (sc.vehicle_type = 'both' AND $2 IN ('car','bike')))
        AND  (sc.fuel_type = 'any' OR sc.fuel_type = $3 OR (sc.fuel_type = 'ice' AND $3 IN ('petrol','diesel','cng','hybrid')))
      ORDER BY sc.priority, sc.service_name
      `, [vehicle.id, vehicle.type, vehicle.fuel_type]);

    const currentKm = vehicle.current_km;
    const enriched  = services.map(svc => {
      // Always recalculate nextDueKm from the CURRENT interval (never trust stale service_records value)
      let nextDueKm = null;
      if (svc.interval_km) {
        nextDueKm = (parseInt(svc.done_km, 10) || 0) + parseInt(svc.interval_km, 10);
      } else if (svc.next_due_km) {
        nextDueKm = svc.next_due_km; // fallback only if no done_km+interval
      }

      // Recalculate nextDueDate from current interval_months
      let nextDueDate = null;
      if (svc.interval_months) {
        const d = new Date(svc.done_at || vehicle.created_at || Date.now());
        d.setMonth(d.getMonth() + parseInt(svc.interval_months, 10));
        nextDueDate = d;
      } else if (svc.next_due_date) {
        nextDueDate = svc.next_due_date;
      }

      const kmLeft = nextDueKm != null ? nextDueKm - currentKm : null;
      const pct    = (nextDueKm && svc.done_km && svc.interval_km)
                   ? Math.min(100, Math.max(0, Math.round((currentKm - svc.done_km) / svc.interval_km * 100)))
                   : null;

      const daysLeft = nextDueDate
        ? Math.round((new Date(nextDueDate) - new Date()) / 86400000)
        : null;

      // Status: use the WORST condition between km and date
      const warnKm = parseInt(req.user.warn_km, 10) || 100;
      const warnDays = parseInt(req.user.warn_days, 10) || 7;
      const kmStatus   = kmLeft   == null ? 'unknown' : kmLeft   < 0 ? 'overdue' : kmLeft   <= 50 ? 'urgent' : kmLeft   <= warnKm ? 'warning' : 'ok';
      const dateStatus = daysLeft == null ? 'unknown' : daysLeft < 0 ? 'overdue' : daysLeft <= 10 ? 'urgent' : daysLeft <= warnDays ? 'warning' : 'ok';
      const statusOrder = { overdue: 0, urgent: 1, warning: 2, ok: 3, unknown: 4 };
      const status = statusOrder[kmStatus] <= statusOrder[dateStatus] ? kmStatus : dateStatus;

      return { ...svc, nextDueKm, nextDueDate, kmLeft, daysLeft, pct, status };
    });

    res.json({ success: true, vehicle, services: enriched });
  } catch (err) { next(err); }
};
