// src/controllers/notificationController.js
const { query } = require('../config/database');

exports.list = async (req, res, next) => {
  try {
    const { type, channel, limit = 30, offset = 0 } = req.query;
    let sql = `
      SELECT nl.*, v.make, v.model, v.registration
      FROM   notification_log nl
      LEFT   JOIN vehicles v ON v.id = nl.vehicle_id
      WHERE  nl.user_id = $1
    `;
    const params = [req.user.id];
    if (type)    { sql += ` AND nl.type    = $${params.length + 1}`; params.push(type); }
    if (channel) { sql += ` AND nl.channel = $${params.length + 1}`; params.push(channel); }
    sql += ` ORDER BY nl.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);
    res.json({ success: true, notifications: rows });
  } catch (err) { next(err); }
};

exports.stats = async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT channel,
             type,
             COUNT(*)                              AS total,
             COUNT(*) FILTER (WHERE status='sent') AS sent,
             COUNT(*) FILTER (WHERE status='failed') AS failed
      FROM   notification_log
      WHERE  user_id = $1
      GROUP  BY channel, type
      ORDER  BY channel, type
    `, [req.user.id]);
    res.json({ success: true, stats: rows });
  } catch (err) { next(err); }
};
