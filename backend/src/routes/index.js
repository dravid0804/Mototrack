// src/routes/index.js
const express = require('express');
const { body } = require('express-validator');
const auth     = require('../middleware/auth');

const authCtrl   = require('../controllers/authController');
const vehicleCtrl= require('../controllers/vehicleController');
const serviceCtrl= require('../controllers/serviceController');
const notifCtrl  = require('../controllers/notificationController');
const contactCtrl = require('../controllers/contactController');
const customServiceCtrl = require('../controllers/customServiceController');

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────────────────
router.post('/auth/register', [
  body('first_name').notEmpty(),
  body('last_name').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
], authCtrl.register);

router.post('/auth/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], authCtrl.login);

router.get('/auth/me',       auth, authCtrl.me);
router.patch('/auth/profile', auth, authCtrl.updateProfile);

// ── Vehicles ──────────────────────────────────────────────────────────────
router.get   ('/vehicles',            auth, vehicleCtrl.list);
router.post  ('/vehicles', [
  body('type').isIn(['car','bike','tractor']),
  body('make').notEmpty(),
  body('model').notEmpty(),
  body('year').isInt({ min: 1980, max: 2030 }),
  body('current_km').isInt({ min: 0 }),
], auth, vehicleCtrl.create);
router.get   ('/vehicles/:id',         auth, vehicleCtrl.get);
router.patch ('/vehicles/:id',         auth, vehicleCtrl.update);
router.delete('/vehicles/:id',         auth, vehicleCtrl.remove);
router.get   ('/vehicles/:id/health',  auth, vehicleCtrl.health);
router.post  ('/vehicles/:id/resync',     auth, vehicleCtrl.resync);
router.post  ('/vehicles/:id/intervals', auth, vehicleCtrl.saveInterval);
router.post  ('/vehicles/:id/spec',      auth, vehicleCtrl.saveSpec);
router.post  ('/vehicles/:id/tracking',  auth, vehicleCtrl.toggleTracking);
router.post  ('/vehicles/:id/custom-services',                     auth, customServiceCtrl.create);
router.patch ('/vehicles/:id/custom-services/:customId',            auth, customServiceCtrl.update);
router.post  ('/vehicles/:id/custom-services/:customId/tracking',   auth, customServiceCtrl.toggleTracking);
router.delete('/vehicles/:id/custom-services/:customId',            auth, customServiceCtrl.remove);
// ── Contact ───────────────────────────────────────────────────────────────
router.post('/contact', auth, contactCtrl.send);

// ── Service Records ───────────────────────────────────────────────────────
router.get   ('/services',          auth, serviceCtrl.list);
router.post  ('/services', [
  body('vehicle_id').isUUID(),
  body('service_name').notEmpty(),
  body('done_km').isInt({ min: 0 }),
], auth, serviceCtrl.create);
router.delete('/services/:id',      auth, serviceCtrl.delete);
router.get   ('/services/upcoming', auth, serviceCtrl.upcoming);
router.get   ('/services/pdf',      auth, serviceCtrl.exportPdf);

// ── Notifications ─────────────────────────────────────────────────────────
router.get('/notifications',       auth, notifCtrl.list);
router.get('/notifications/stats', auth, notifCtrl.stats);

// ── Catalogue ─────────────────────────────────────────────────────────────
router.get('/catalogue', auth, async (req, res, next) => {
  try {
    const { type, fuel_type } = req.query;
    const { query: dbQuery } = require('../config/database');
    let sql = 'SELECT * FROM service_catalogue WHERE 1=1';
    const params = [];
    if (type) {
      sql += ` AND (vehicle_type=$${params.length+1} OR vehicle_type='all' OR (vehicle_type='both' AND $${params.length+1} IN ('car','bike')))`;
      params.push(type);
    }
    if (fuel_type) {
      sql += ` AND (fuel_type=$${params.length+1} OR fuel_type='any' OR (fuel_type='ice' AND $${params.length+1} IN ('petrol','diesel','cng','hybrid')))`;
      params.push(fuel_type);
    }
    sql += ' ORDER BY priority, service_name';
    const { rows } = await dbQuery(sql, params);
    res.json({ success: true, catalogue: rows });
  } catch (err) { next(err); }
});

module.exports = router;
