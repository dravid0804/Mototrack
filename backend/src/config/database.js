const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER||'postgres'}:${process.env.DB_PASSWORD}@${process.env.DB_HOST||'localhost'}:${process.env.DB_PORT||5432}/${process.env.DB_NAME||'revtrack'}`,
  ssl: false,
});

pool.on("connect", () => console.log("✅ PostgreSQL connected"));
pool.on("error", (err) => console.error("❌ PostgreSQL error:", err.message));

const query = (text, params) => pool.query(text, params);
module.exports = { query, pool };