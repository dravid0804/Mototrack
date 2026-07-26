// src/controllers/serviceController.js
const { query }  = require('../config/database');
const { notify } = require('../services/notificationService');
const { runServiceAlerts } = require('../services/serviceAlertService');
const PDFDocument = require('pdfkit');

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
    const { vehicle_id, catalogue_id, custom_service_id, service_name, done_at, done_km,
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

    if (custom_service_id) {
      const { rows: [cs] } = await query(
        'SELECT interval_km, interval_months FROM custom_services WHERE id=$1 AND vehicle_id=$2',
        [custom_service_id, vehicle_id]
      );
      if (cs?.interval_km)     next_due_km = done_km + cs.interval_km;
      if (cs?.interval_months) {
        const d = new Date(done_at || Date.now());
        d.setMonth(d.getMonth() + cs.interval_months);
        next_due_date = d;
      }
    }

    const { rows: [record] } = await query(
      `INSERT INTO service_records
         (vehicle_id, catalogue_id, custom_service_id, service_name, done_at, done_km,
          next_due_km, next_due_date, spec_used, qty_used, cost, workshop, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [vehicle_id, catalogue_id || null, custom_service_id || null, service_name, done_at || new Date(),
       done_km, next_due_km, next_due_date, spec_used, qty_used, cost, workshop, notes]
    );

    // Update vehicle's current_km if the service was done at higher km
    if (parseInt(done_km) > parseInt(vehicle.current_km)) {
      await query('UPDATE vehicles SET current_km=$1, updated_at=NOW() WHERE id=$2', [done_km, vehicle_id]);
    }

    // Send completion notification
    await notify({
      userId:      req.user.id,
      vehicleId:   vehicle_id,
      serviceName: service_name,
      type:        'completion',
      user:        { id: req.user.id, first_name: req.user.first_name,
                     email: req.user.email, phone: req.user.phone,
                     notify_whatsapp: req.user.notify_whatsapp,
                      notify_email: req.user.notify_email,
                     alert_completion: req.user.alert_completion },
      vehicle,
      templateData: {
        serviceName:  service_name,
        doneKm:       done_km,
        doneDate:     new Date(done_at || Date.now()).toDateString(),
        nextDueKm:    next_due_km,
        unit:         vehicle.type === 'tractor' ? 'hrs' : 'km',
        spec:         spec_used,
        qty:          qty_used,
      },
    });

    await runServiceAlerts({ vehicleId: vehicle_id });

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
        WHERE  (sc.vehicle_type = $2 OR sc.vehicle_type = 'all' OR (sc.vehicle_type = 'both' AND $2 IN ('car','bike')))
          AND  (sc.fuel_type = 'any' OR sc.fuel_type = $3 OR (sc.fuel_type = 'ice' AND $3 IN ('petrol','diesel','cng','hybrid')))
      `, [vehicle.id, vehicle.type, vehicle.fuel_type]);

      const currentKm = vehicle.current_km;

      for (const svc of services) {
        // Always recalculate — never trust stale next_due_km
        let nextDueKm = null;
        if (svc.interval_km) {
          nextDueKm = (parseInt(svc.done_km, 10) || 0) + parseInt(svc.interval_km, 10);
        }

        let nextDueDate = null;
        if (svc.interval_months) {
          const d = new Date(svc.done_at || vehicle.created_at || Date.now());
          d.setMonth(d.getMonth() + parseInt(svc.interval_months, 10));
          nextDueDate = d;
        }

        if (!nextDueKm && !nextDueDate) continue; // nothing to evaluate

        const kmLeft   = nextDueKm   != null ? nextDueKm - currentKm : null;
        const daysLeft = nextDueDate != null
          ? Math.round((new Date(nextDueDate) - new Date()) / 86400000)
          : null;

        // Use worst status between km and date
        const warnKm = parseInt(req.user.warn_km, 10) || 100;
        const warnDays = parseInt(req.user.warn_days, 10) || 7;
        const kmStatus   = kmLeft   == null ? 'unknown' : kmLeft   < 0 ? 'overdue' : kmLeft   <= 50 ? 'urgent' : kmLeft   <= warnKm ? 'warning' : 'ok';
        const dateStatus = daysLeft == null ? 'unknown' : daysLeft < 0 ? 'overdue' : daysLeft <= 10 ? 'urgent' : daysLeft <= warnDays ? 'warning' : 'ok';
        const order = { overdue: 0, urgent: 1, warning: 2, ok: 3, unknown: 4 };
        const status = order[kmStatus] <= order[dateStatus] ? kmStatus : dateStatus;

        if (status === 'ok' || status === 'unknown') continue; // healthy — skip

        results.push({
          vehicleId:    vehicle.id,
          vehicleName:  `${vehicle.make} ${vehicle.model}`,
          vehicleType:  vehicle.type,
          registration: vehicle.registration,
          currentKm,
          unit:         vehicle.type === 'tractor' ? 'hrs' : 'km',
          ...svc,
          nextDueKm,
          nextDueDate:  nextDueDate ? nextDueDate.toISOString().split('T')[0] : null,
          kmLeft,
          daysLeft,
          status,
        });
      }

      // ── Custom (user-created) services ────────────────────────────────
      const { rows: customServices } = await query(`
        SELECT cs.*, sr.done_at, sr.done_km
        FROM   custom_services cs
        LEFT JOIN LATERAL (
          SELECT done_at, done_km FROM service_records
          WHERE vehicle_id=$1 AND custom_service_id=cs.id
          ORDER BY done_km DESC, done_at DESC LIMIT 1
        ) sr ON TRUE
        WHERE cs.vehicle_id=$1
      `, [vehicle.id]);

      for (const cs of customServices) {
        let nextDueKm = null;
        if (cs.interval_km) nextDueKm = (parseInt(cs.done_km, 10) || 0) + parseInt(cs.interval_km, 10);

        let nextDueDate = null;
        if (cs.interval_months) {
          const d = new Date(cs.done_at || vehicle.created_at || Date.now());
          d.setMonth(d.getMonth() + parseInt(cs.interval_months, 10));
          nextDueDate = d;
        }

        if (!nextDueKm && !nextDueDate) continue;

        const csKmLeft   = nextDueKm   != null ? nextDueKm - currentKm : null;
        const csDaysLeft = nextDueDate != null
          ? Math.round((new Date(nextDueDate) - new Date()) / 86400000)
          : null;

        const warnKm2 = parseInt(req.user.warn_km, 10) || 100;
        const warnDays2 = parseInt(req.user.warn_days, 10) || 7;
        const csKmStatus   = csKmLeft   == null ? 'unknown' : csKmLeft   < 0 ? 'overdue' : csKmLeft   <= 50 ? 'urgent' : csKmLeft   <= warnKm2 ? 'warning' : 'ok';
        const csDateStatus = csDaysLeft == null ? 'unknown' : csDaysLeft < 0 ? 'overdue' : csDaysLeft <= 10 ? 'urgent' : csDaysLeft <= warnDays2 ? 'warning' : 'ok';
        const csOrder = { overdue: 0, urgent: 1, warning: 2, ok: 3, unknown: 4 };
        const csStatus = csOrder[csKmStatus] <= csOrder[csDateStatus] ? csKmStatus : csDateStatus;

        if (csStatus === 'ok' || csStatus === 'unknown') continue;

        results.push({
          vehicleId:    vehicle.id,
          vehicleName:  `${vehicle.make} ${vehicle.model}`,
          vehicleType:  vehicle.type,
          registration: vehicle.registration,
          currentKm,
          unit:         vehicle.type === 'tractor' ? 'hrs' : 'km',
          catalogue_id: null,
          custom_service_id: cs.id,
          service_name: cs.service_name,
          priority:     cs.priority,
          spec:         cs.spec,
          qty:          cs.qty,
          nextDueKm,
          nextDueDate:  nextDueDate ? nextDueDate.toISOString().split('T')[0] : null,
          kmLeft: csKmLeft,
          daysLeft: csDaysLeft,
          status: csStatus,
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

// Generate a clean, per-vehicle PDF of service logs — with subtotals + grand total
exports.exportPdf = async (req, res, next) => {
  try {
    const { vehicle_id } = req.query;

    let scopeVehicle = null;
    if (vehicle_id) {
      const { rows: [v] } = await query(
        'SELECT * FROM vehicles WHERE id=$1 AND user_id=$2',
        [vehicle_id, req.user.id]
      );
      if (!v) return res.status(404).json({ success: false, message: 'Vehicle not found' });
      scopeVehicle = v;
    }

    let sql = `
      SELECT sr.*, v.id AS v_id, v.make, v.model, v.registration, v.type AS vehicle_type
      FROM   service_records sr
      JOIN   vehicles v ON v.id = sr.vehicle_id
      WHERE  v.user_id = $1
    `;
    const params = [req.user.id];
    if (vehicle_id) { sql += ` AND sr.vehicle_id = $2`; params.push(vehicle_id); }
    sql += ' ORDER BY v.make, v.model, sr.done_at DESC';

    const { rows } = await query(sql, params);

    // ── Group records by vehicle ─────────────────────────────────────────
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.v_id)) {
        groups.set(r.v_id, {
          label: `${r.make} ${r.model}`,
          registration: r.registration,
          type: r.vehicle_type,
          records: [],
        });
      }
      groups.get(r.v_id).records.push(r);
    }
    const grandTotal = rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = scopeVehicle
      ? `service-log-${scopeVehicle.make}-${scopeVehicle.model}.pdf`.replace(/\s+/g, '-')
      : 'service-log.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const PAGE_LEFT = 40, PAGE_RIGHT = 555, PAGE_BOTTOM = 780;
    const COL = { date: 40, service: 115, reading: 300, workshop: 375, cost: 480 };
    const WID = { date: 70, service: 180, reading: 70, workshop: 100, cost: 75 };

    // ── Document header ───────────────────────────────────────────────────
    doc.fillColor('#E85D1A').fontSize(22).font('Helvetica-Bold').text('MotoTrack', PAGE_LEFT, 40);
    doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text('Service Log Report', PAGE_LEFT, doc.y + 1);
    doc.moveDown(0.3);
    doc.fillColor('#64748B').fontSize(9).font('Helvetica')
      .text(`${req.user.first_name} ${req.user.last_name || ''}`.trim(), PAGE_LEFT)
      .text(`Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, PAGE_LEFT);
    doc.moveTo(PAGE_LEFT, doc.y + 10).lineTo(PAGE_RIGHT, doc.y + 10).strokeColor('#E85D1A').lineWidth(1.5).stroke();
    doc.y += 24;

    if (!rows.length) {
      doc.fontSize(11).fillColor('#64748B').text('No service records found.', PAGE_LEFT, doc.y);
      doc.end();
      return;
    }

    const drawTableHeader = () => {
      const y0 = doc.y;
      doc.rect(PAGE_LEFT, y0, PAGE_RIGHT - PAGE_LEFT, 20).fill('#F8FAFC');
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica-Bold');
      doc.text('DATE',     COL.date,     y0 + 6, { width: WID.date });
      doc.text('SERVICE',  COL.service,  y0 + 6, { width: WID.service });
      doc.text('READING',  COL.reading,  y0 + 6, { width: WID.reading });
      doc.text('WORKSHOP', COL.workshop, y0 + 6, { width: WID.workshop });
      doc.text('COST',     COL.cost,     y0 + 6, { width: WID.cost, align: 'right' });
      doc.y = y0 + 22;
    };

    const ensureSpace = (needed, onNewPage) => {
      if (doc.y + needed > PAGE_BOTTOM) {
        doc.addPage();
        doc.y = 40;
        if (onNewPage) onNewPage();
      }
    };

    for (const group of groups.values()) {
      ensureSpace(70, () => {});

      // ── Vehicle section header ─────────────────────────────────────────
      const headerY = doc.y;
      doc.roundedRect(PAGE_LEFT, headerY, PAGE_RIGHT - PAGE_LEFT, 26, 4).fill('#FFF4EE');
      doc.fillColor('#E85D1A').fontSize(11).font('Helvetica-Bold')
        .text(group.label, PAGE_LEFT + 12, headerY + 7);
      doc.fillColor('#B45309').fontSize(8.5).font('Helvetica')
        .text(group.registration || '', PAGE_LEFT, headerY + 8, { width: PAGE_RIGHT - PAGE_LEFT - 12, align: 'right' });
      doc.y = headerY + 34;

      drawTableHeader();

      const vehicleTotal = group.records.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0);
      const unitLabel = group.type === 'tractor' ? 'hrs' : 'km';

      doc.font('Helvetica').fontSize(9);
      group.records.forEach((r, idx) => {
        const dateStr = new Date(r.done_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const readingStr = `${Number(r.done_km).toLocaleString()} ${unitLabel}`;
        const workshopStr = r.workshop || '—';
        const costStr = r.cost ? `Rs. ${Number(r.cost).toLocaleString()}` : '—';
        const serviceStr = r.service_name;

        const serviceH  = doc.heightOfString(serviceStr, { width: WID.service });
        const workshopH = doc.heightOfString(workshopStr, { width: WID.workshop });
        const rowH = Math.max(serviceH, workshopH, 12) + 10;

        ensureSpace(rowH, () => { drawTableHeader(); doc.font('Helvetica').fontSize(9); });

        const y0 = doc.y;
        if (idx % 2 === 1) {
          doc.rect(PAGE_LEFT, y0, PAGE_RIGHT - PAGE_LEFT, rowH).fill('#FBFBFD');
        }
        doc.fillColor('#334155');
        doc.text(dateStr,     COL.date,     y0 + 5, { width: WID.date });
        doc.text(serviceStr,  COL.service,  y0 + 5, { width: WID.service });
        doc.text(readingStr,  COL.reading,  y0 + 5, { width: WID.reading });
        doc.text(workshopStr, COL.workshop, y0 + 5, { width: WID.workshop });
        doc.fillColor('#0F172A').font('Helvetica-Bold');
        doc.text(costStr,     COL.cost,     y0 + 5, { width: WID.cost, align: 'right' });
        doc.font('Helvetica');

        doc.y = y0 + rowH;
      });

      // ── Vehicle subtotal ────────────────────────────────────────────────
      ensureSpace(26, () => {});
      const subY = doc.y + 2;
      doc.moveTo(PAGE_LEFT, subY).lineTo(PAGE_RIGHT, subY).strokeColor('#E2E8F0').lineWidth(1).stroke();
      doc.fillColor('#16A34A').fontSize(9.5).font('Helvetica-Bold')
        .text(`Subtotal — ${group.label}: Rs. ${vehicleTotal.toLocaleString()}`, PAGE_LEFT, subY + 6, { width: PAGE_RIGHT - PAGE_LEFT, align: 'right' });
      doc.y = subY + 26;
    }

    // ── Grand total ─────────────────────────────────────────────────────────
    ensureSpace(50, () => {});
    const gtY = doc.y + 6;
    doc.roundedRect(PAGE_LEFT, gtY, PAGE_RIGHT - PAGE_LEFT, 34, 5).fill('#F0FDF4');
    doc.fillColor('#16A34A').fontSize(13).font('Helvetica-Bold')
      .text(`Total spent across ${groups.size} vehicle${groups.size > 1 ? 's' : ''}: Rs. ${grandTotal.toLocaleString()}`,
        PAGE_LEFT, gtY + 10, { width: PAGE_RIGHT - PAGE_LEFT, align: 'center' });

    doc.end();
  } catch (err) { next(err); }
};