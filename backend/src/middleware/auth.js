// src/middleware/auth.js
const jwt    = require('jsonwebtoken');
const { query } = require('../config/database');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user still exists
    const { rows } = await query(
      `SELECT id, email, first_name, last_name, phone, notify_whatsapp, notify_email,
              warn_days, urgent_days, alert_warning, alert_urgent, alert_overdue,
              alert_completion, alert_digest, alert_odometer, warn_km
       FROM users WHERE id = $1`,
      [decoded.userId]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

module.exports = auth;
