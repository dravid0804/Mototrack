require('dotenv').config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/database");
const { validationResult } = require("express-validator");
const { sendEmail } = require("../services/emailService");
const logger = require("../config/logger");

const signToken = (id) =>
  jwt.sign({ userId: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/* ───────── REGISTER ───────── */
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ success: false, errors: errors.array() });

    const { first_name, last_name, email, password, notify_email } = req.body;

    const existing = await query(
      "SELECT id FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    if (existing.rows.length)
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });

    const hash = await bcrypt.hash(password, 12);

    const { rows } = await query(
      `INSERT INTO users 
      (first_name, last_name, email, password_hash, notify_whatsapp, notify_email,
       alert_warning, alert_urgent, alert_overdue, alert_completion, alert_digest,
       alert_odometer, warn_km)
      VALUES ($1,$2,$3,$4,false,$5,true,true,true,true,false,true,100)
      RETURNING id, first_name, last_name, email, notify_whatsapp, notify_email,
       warn_days, urgent_days, alert_warning, alert_urgent, alert_overdue,
       alert_completion, alert_digest, alert_odometer, warn_km, created_at`,
      [
        first_name,
        last_name || "",
        email.toLowerCase(),
        hash,
        notify_email !== false,
      ]
    );

    const user = rows[0];

    sendEmail({
      userId: user.id,
      vehicleId: null,
      serviceName: "Welcome",
      type: "welcome",
      email: user.email,
      templateData: {
        firstName: first_name,
        serviceName: "Welcome",
        month: new Date().toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
      },
    }).catch((err) => logger.warn("Welcome email failed:", err.message));

    res.status(201).json({
      success: true,
      token: signToken(user.id),
      user,
    });
  } catch (err) {
    next(err);
  }
};

/* ───────── LOGIN ───────── */
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ success: false, errors: errors.array() });

    const { email, password } = req.body;

    const { rows } = await query(
      `SELECT id, first_name, last_name, email, password_hash,
       notify_whatsapp, notify_email, warn_days, urgent_days,
       alert_warning, alert_urgent, alert_overdue, alert_completion, alert_digest,
       alert_odometer, warn_km
       FROM users WHERE email=$1`,
      [email.toLowerCase()]
    );

    const user = rows[0];

    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      token: signToken(user.id),
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

/* ───────── CURRENT USER ───────── */
exports.me = async (req, res) => {
  res.json({ success: true, user: req.user });
};

/* ───────── UPDATE PROFILE ───────── */
exports.updateProfile = async (req, res, next) => {
  try {
    const {
      first_name, last_name, notify_email, warn_days, urgent_days,
      alert_warning, alert_urgent, alert_overdue, alert_completion, alert_digest,
      alert_odometer, warn_km,
    } = req.body;

    const { rows } = await query(
      `UPDATE users 
       SET first_name=$1, last_name=$2,
       notify_whatsapp=false, notify_email=$3,
       warn_days=$4, urgent_days=$5,
       alert_warning=$6, alert_urgent=$7, alert_overdue=$8,
       alert_completion=$9, alert_digest=$10,
       alert_odometer=$11, warn_km=$12
       WHERE id=$13
       RETURNING id, first_name, last_name, email,
       notify_whatsapp, notify_email, warn_days, urgent_days,
       alert_warning, alert_urgent, alert_overdue, alert_completion, alert_digest,
       alert_odometer, warn_km`,
      [
        first_name,
        last_name || "",
        notify_email !== false,
        warn_days || 7,
        urgent_days || 10,
        alert_warning !== false,
        alert_urgent !== false,
        alert_overdue !== false,
        alert_completion !== false,
        alert_digest === true,
        alert_odometer !== false,
        parseInt(warn_km, 10) || 100,
        req.user.id,
      ]
    );

    res.json({
      success: true,
      user: rows[0],
    });
  } catch (err) {
    next(err);
  }
};
