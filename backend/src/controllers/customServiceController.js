// src/controllers/customServiceController.js
const { query } = require('../config/database');

// Create a new custom service — scoped to one vehicle (and therefore one user)
exports.create = async (req, res, next) => {
  try {
    const { service_name, interval_km, interval_months, spec, qty, priority } = req.body;
    if (!service_name) return res.status(400).json({ success: false, message: 'Service name is required' });
    if (!interval_km && !interval_months) {
      return res.status(400).json({ success: false, message: 'Provide an interval in km/hrs or months (or both)' });
    }

    const { rows: [vehicle] } = await query(
      'SELECT id FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const { rows: [svc] } = await query(
      `INSERT INTO custom_services
         (vehicle_id, service_name, interval_km, interval_months, spec, qty, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [req.params.id, service_name, interval_km || null, interval_months || null,
       spec || null, qty || null, priority || 'normal']
    );

    res.status(201).json({ success: true, custom_service: svc });
  } catch (err) { next(err); }
};

// Update spec / qty / name / priority on a custom service
exports.update = async (req, res, next) => {
  try {
    const { service_name, interval_km, interval_months, spec, qty, priority } = req.body;

    const { rows: [vehicle] } = await query(
      'SELECT id FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const { rows: [svc] } = await query(
      `UPDATE custom_services SET
         service_name    = COALESCE($1, service_name),
         interval_km     = COALESCE($2, interval_km),
         interval_months = COALESCE($3, interval_months),
         spec            = COALESCE($4, spec),
         qty             = COALESCE($5, qty),
         priority        = COALESCE($6, priority)
       WHERE id=$7 AND vehicle_id=$8
       RETURNING *`,
      [service_name || null, interval_km || null, interval_months || null,
       spec || null, qty || null, priority || null, req.params.customId, req.params.id]
    );
    if (!svc) return res.status(404).json({ success: false, message: 'Custom service not found' });

    res.json({ success: true, custom_service: svc });
  } catch (err) { next(err); }
};

// Toggle tracking (on/off) for a custom service
exports.toggleTracking = async (req, res, next) => {
  try {
    const { is_enabled } = req.body;

    const { rows: [vehicle] } = await query(
      'SELECT id FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const enabled = is_enabled !== false;
    const { rows: [svc] } = await query(
      `UPDATE custom_services SET is_enabled=$1 WHERE id=$2 AND vehicle_id=$3 RETURNING *`,
      [enabled, req.params.customId, req.params.id]
    );
    if (!svc) return res.status(404).json({ success: false, message: 'Custom service not found' });

    res.json({ success: true, is_enabled: enabled });
  } catch (err) { next(err); }
};

// Remove a custom service (its logged history is removed via cascade)
exports.remove = async (req, res, next) => {
  try {
    const { rows: [vehicle] } = await query(
      'SELECT id FROM vehicles WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    await query('DELETE FROM custom_services WHERE id=$1 AND vehicle_id=$2', [req.params.customId, req.params.id]);
    res.json({ success: true, message: 'Custom service removed' });
  } catch (err) { next(err); }
};