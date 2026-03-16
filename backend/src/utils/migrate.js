// src/utils/migrate.js
// Run: node src/utils/migrate.js
require('dotenv').config();
const { pool } = require('../config/database');
const logger   = require('../config/logger');

const SQL = `

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name      VARCHAR(80)  NOT NULL,
  last_name       VARCHAR(80)  NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  phone           VARCHAR(30),          -- WhatsApp number e.g. +919876543210
  password_hash   TEXT         NOT NULL,
  notify_whatsapp BOOLEAN      DEFAULT TRUE,
  notify_email    BOOLEAN      DEFAULT TRUE,
  warn_days       INT          DEFAULT 7,   -- first warning X days before due
  urgent_days     INT          DEFAULT 3,   -- urgent reminder X days before due
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Vehicles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(20)  NOT NULL CHECK (type IN ('car','bike')),
  make            VARCHAR(80)  NOT NULL,
  model           VARCHAR(80)  NOT NULL,
  year            SMALLINT     NOT NULL,
  fuel_type       VARCHAR(20)  NOT NULL DEFAULT 'petrol'
                               CHECK (fuel_type IN ('petrol','diesel','cng','electric','hybrid')),
  registration    VARCHAR(30),
  current_km      INT          NOT NULL DEFAULT 0,
  engine_cc       VARCHAR(30),
  transmission    VARCHAR(30),
  color           VARCHAR(40),
  notes           TEXT,
  is_active       BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);

-- ── Service Interval Catalogue ───────────────────────────────────────────────
-- Global defaults; can be overridden per vehicle in vehicle_service_config
CREATE TABLE IF NOT EXISTS service_catalogue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_type    VARCHAR(10)  NOT NULL CHECK (vehicle_type IN ('car','bike','both')),
  fuel_type       VARCHAR(20)  DEFAULT 'any',
  service_name    VARCHAR(120) NOT NULL,
  interval_km     INT,                  -- km interval (NULL = time-only)
  interval_months INT,                  -- months interval (NULL = km-only)
  description     TEXT,
  default_spec    VARCHAR(120),         -- e.g. "5W-30 Synthetic"
  default_qty     VARCHAR(40),          -- e.g. "3.8 L"
  priority        VARCHAR(10)  DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low'))
);

-- ── Per-Vehicle Service Config (overrides catalogue defaults) ────────────────
CREATE TABLE IF NOT EXISTS vehicle_service_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id      UUID         NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  catalogue_id    UUID         NOT NULL REFERENCES service_catalogue(id),
  custom_interval_km     INT,
  custom_interval_months INT,
  custom_spec     VARCHAR(120),
  custom_qty      VARCHAR(40),
  is_enabled      BOOLEAN      DEFAULT TRUE,
  UNIQUE (vehicle_id, catalogue_id)
);

-- ── Service Records (completed services) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id      UUID         NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  catalogue_id    UUID         REFERENCES service_catalogue(id),
  service_name    VARCHAR(120) NOT NULL,  -- denormalised copy
  done_at         DATE         NOT NULL DEFAULT CURRENT_DATE,
  done_km         INT          NOT NULL,
  next_due_km     INT,
  next_due_date   DATE,
  spec_used       VARCHAR(120),
  qty_used        VARCHAR(40),
  cost            NUMERIC(10,2),
  workshop        VARCHAR(120),
  notes           TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_records_vehicle ON service_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_records_catalogue ON service_records(catalogue_id);

-- ── Notification Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id      UUID         REFERENCES vehicles(id) ON DELETE SET NULL,
  service_name    VARCHAR(120),
  channel         VARCHAR(20)  NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  type            VARCHAR(30)  NOT NULL CHECK (type IN ('warning','urgent','overdue','completion','digest','welcome')),
  status          VARCHAR(20)  DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  recipient       VARCHAR(255),          -- phone or email
  message_id      TEXT,                  -- Twilio SID or SMTP message-id
  error_detail    TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user    ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_vehicle ON notification_log(vehicle_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_upd    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_vehicles_upd BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

`;

async function migrate() {
  const client = await pool.connect();
  try {
    logger.info('Running database migrations…');
    await client.query(SQL);
    logger.info('✅  Migrations complete.');
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
