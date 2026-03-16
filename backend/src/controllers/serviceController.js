// src/controllers/serviceController.js
const { query }  = require('../config/database');
const { notify } = require('../services/notificationService');

exports.list = async (req, res, next) => {
  try {
    const { vehicle_id, limit = 50, offset = 0 } = req.query;
    let sql = `
      SELECT sr.*, v.make, v.model, v.registration, v.type AS vehicle_type
      FROM   service_records sr
      JOIN   vehicles v ON v.id = sr.vehicle_id
      WHERE  v.user_id = $1
    `;
    const params = [req.user.id];
    if (vehicle_id) { sql += ` AND sr.vehicle_id = $${params.length + 1}`; params.push(vehicle_id); }
    sql += ` ORDER BY sr.done_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);
    res.json({ success: true, records: rows });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { vehicle_id, catalogue_id, service_name, done_at, done_km,
            spec_used, qty_used, cost, workshop, notes } = req.body;

    // Verify vehicle belongs to user
    const { rows: [vehicle] } = await query(
      'SELECT * FROM vehicles WHERE id=$1 AND user_id=$2',
      [vehicle_id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    // Determine next due km/date from catalogue
    let next_due_km = null, next_due_date = null, catRow = null;
    if (catalogue_id) {
      const { rows: [cat] } = await query(
        `SELECT COALESCE(vsc.custom_interval_km, sc.interval_km) AS interval_km,
                COALESCE(vsc.custom_interval_months, sc.interval_months) AS interval_months
         FROM service_catalogue sc
         LEFT JOIN vehicle_service_config vsc ON vsc.catalogue_id=sc.id AND vsc.vehicle_id=$1
         WHERE sc.id=$2`,
        [vehicle_id, catalogue_id]
      );
      catRow = cat;
      if (cat?.interval_km)     next_due_km = done_km + cat.interval_km;
      if (cat?.interval_months) {
        const d = new Date(done_at || Date.now());
        d.setMonth(d.getMonth() + cat.interval_months);
        next_due_date = d;
      }
    }

    const { rows: [record] } = await query(
      `INSERT INTO service_records
         (vehicle_id, catalogue_id, service_name, done_at, done_km,
          next_due_km, next_due_date, spec_used, qty_used, cost, workshop, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [vehicle_id, catalogue_id || null, service_name, done_at || new Date(),
       done_km, next_due_km, next_due_date, spec_used, qty_used, cost, workshop, notes]
    );

    // Update vehicle's current_km if the service was done at higher km
    if (parseInt(done_km) > parseInt(vehicle.current_km)) {
      await query('UPDATE vehicles SET current_km=$1, updated_at=NOW() WHERE id=$2', [done_km, vehicle_id]);
    }

    // Send completion notification
    const user = { ...req.user, notify_whatsapp: true, notify_email: true };
    await notify({
      userId:      req.user.id,
      vehicleId:   vehicle_id,
      serviceName: service_name,
      type:        'completion',
      user:        { id: req.user.id, first_name: req.user.first_name,
                     email: req.user.email, phone: req.user.phone,
                     notify_whatsapp: req.user.notify_whatsapp,
                     notify_email: req.user.notify_email },
      vehicle,
      templateData: {
        serviceName:  service_name,
        doneKm:       done_km,
        doneDate:     new Date(done_at || Date.now()).toDateString(),
        nextDueKm:    next_due_km,
        spec:         spec_used,
        qty:          qty_used,
      },
    });

    res.status(201).json({ success: true, record });
  } catch (err) { next(err); }
};

exports.delete = async (req, res, next) => {
  try {
    const { rows: [rec] } = await query(
      `DELETE FROM service_records sr
       USING vehicles v
       WHERE sr.id=$1 AND sr.vehicle_id=v.id AND v.user_id=$2
       RETURNING sr.id`,
      [req.params.id, req.user.id]
    );
    if (!rec) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) { next(err); }
};

// Summary: upcoming + overdue services across all vehicles for the logged-in user
exports.upcoming = async (req, res, next) => {
  try {
    const { rows: vehicles } = await query(
      'SELECT * FROM vehicles WHERE user_id=$1 AND is_active=TRUE',
      [req.user.id]
    );

    const results = [];
    for (const vehicle of vehicles) {
      const { rows: services } = await query(`
        SELECT sc.id AS catalogue_id, sc.service_name, sc.priority,
               COALESCE(vsc.custom_interval_km,     sc.interval_km)     AS interval_km,
               COALESCE(vsc.custom_interval_months, sc.interval_months) AS interval_months,
               COALESCE(vsc.custom_spec, sc.default_spec)               AS spec,
               COALESCE(vsc.custom_qty,  sc.default_qty)                AS qty,
               sr.done_at, sr.done_km
        FROM   service_catalogue sc
        LEFT   JOIN vehicle_service_config vsc ON vsc.catalogue_id=sc.id AND vsc.vehicle_id=$1
        LEFT   JOIN LATERAL (
          SELECT done_at, done_km FROM service_records
          WHERE vehicle_id=$1 AND catalogue_id=sc.id
          ORDER BY done_km DESC, done_at DESC LIMIT 1
        ) sr ON TRUE
        WHERE  (sc.vehicle_type = $2 OR sc.vehicle_type = 'both')
          AND  (sc.fuel_type = 'any' OR sc.fuel_type = $3)
      `, [vehicle.id, vehicle.type, vehicle.fuel_type]);

      const currentKm = vehicle.current_km;

      for (const svc of services) {
        // Always recalculate — never trust stale next_due_km
        let nextDueKm = null;
        if (svc.done_km && svc.interval_km) {
          nextDueKm = parseInt(svc.done_km) + parseInt(svc.interval_km);
        }

        let nextDueDate = null;
        if (svc.done_at && svc.interval_months) {
          const d = new Date(svc.done_at);
          d.setMonth(d.getMonth() + parseInt(svc.interval_months));
          nextDueDate = d;
        }

        if (!nextDueKm && !nextDueDate) continue; // nothing to evaluate

        const kmLeft   = nextDueKm   != null ? nextDueKm - currentKm : null;
        const daysLeft = nextDueDate != null
          ? Math.round((new Date(nextDueDate) - new Date()) / 86400000)
          : null;

        // Use worst status between km and date
        const kmStatus   = kmLeft   == null ? 'unknown' : kmLeft   < 0 ? 'overdue' : kmLeft   <= 300 ? 'urgent' : kmLeft   <= 800 ? 'warning' : 'ok';
        const dateStatus = daysLeft == null ? 'unknown' : daysLeft < 0 ? 'overdue' : daysLeft <= 3   ? 'urgent' : daysLeft <= 7   ? 'warning' : 'ok';
        const order = { overdue: 0, urgent: 1, warning: 2, ok: 3, unknown: 4 };
        const status = order[kmStatus] <= order[dateStatus] ? kmStatus : dateStatus;

        if (status === 'ok' || status === 'unknown') continue; // healthy — skip

        results.push({
          vehicleId:    vehicle.id,
          vehicleName:  `${vehicle.make} ${vehicle.model}`,
          registration: vehicle.registration,
          currentKm,
          ...svc,
          nextDueKm,
          nextDueDate:  nextDueDate ? nextDueDate.toISOString().split('T')[0] : null,
          kmLeft,
          daysLeft,
          status,
        });
      }
    }

    results.sort((a, b) => {
      const order = { overdue: 0, urgent: 1, warning: 2 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    res.json({ success: true, upcoming: results });
  } catch (err) { next(err); }
};
